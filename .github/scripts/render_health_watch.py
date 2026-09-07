"""A bounded GitHub health watch for the existing, frozen submission."""
import datetime
import json
import math
import os
import pathlib
import re
import subprocess
import tempfile
import time

HEALTH_URL = "https://paycheck-fin-ai.onrender.com/api/health"
INTERVAL_SECONDS = 240
SEGMENT_SECONDS = 5 * 60 * 60
MAX_WINDOW_SECONDS = 5 * 24 * 60 * 60


def check_health(expected_revision, timeout_seconds):
    """One bounded GET, without redirects, AI calls, or response-body logging."""
    try:
        with tempfile.TemporaryDirectory(prefix="paycheck-health-") as directory:
            body = pathlib.Path(directory) / "health.json"
            result = subprocess.run(
                ["curl", "--silent", "--show-error", "--fail",
                 "--connect-timeout", str(min(15, timeout_seconds)),
                 "--max-time", str(timeout_seconds), "--max-filesize", "65536",
                 "--header", "Cache-Control: no-cache", "--output", str(body),
                 "--write-out", "%{http_code}", HEALTH_URL],
                capture_output=True, text=True, timeout=timeout_seconds, check=False,
            )
            if result.returncode != 0 or result.stdout != "200":
                return {"ok": False, "message": f"HTTP {result.stdout.strip() or 'unavailable'}; curl exit {result.returncode}"}
            payload = json.loads(body.read_text())
            if not isinstance(payload, dict) or payload.get("status") != "ok" or payload.get("service") != "paycheck":
                return {"ok": False, "message": "response is not Paycheck health"}
            if payload.get("revision") != expected_revision:
                return {"ok": False, "message": "submitted deployment revision mismatch"}
            checked_at = datetime.datetime.fromisoformat(payload["checkedAt"].replace("Z", "+00:00"))
            age = (datetime.datetime.now(datetime.timezone.utc) - checked_at).total_seconds()
            if not -60 <= age < 300:
                return {"ok": False, "message": "health timestamp is not fresh"}
            return {"ok": True, "message": f"HTTP 200; revision={expected_revision}; checkedAt={payload['checkedAt']}"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "message": "health request timed out"}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return {"ok": False, "message": "health response unavailable or invalid"}


def log(message):
    print(message, flush=True)


def run_watch(end_at, expected_revision, *, now=time.time, monotonic=time.monotonic,
              sleep=time.sleep, request=check_health, report=log, segment_seconds=SEGMENT_SECONDS):
    if (not isinstance(end_at, (int, float)) or not math.isfinite(end_at)
            or end_at - now() > MAX_WINDOW_SECONDS
            or not isinstance(segment_seconds, (int, float)) or not math.isfinite(segment_seconds)
            or not 0 < segment_seconds <= SEGMENT_SECONDS
            or not isinstance(expected_revision, str)
            or not re.fullmatch(r"[a-f0-9]{40}", expected_revision)):
        report("FAIL: invalid deployment pin or five-day deadline; no requests sent")
        return 2
    if now() >= end_at:
        report("SKIPPED: the five-day health window has ended; no requests sent")
        return 0

    segment_end = monotonic() + segment_seconds
    attempts = failures = 0
    report(f"START: GET {HEALTH_URL}; interval={INTERVAL_SECONDS}s; global_end={end_at}")
    while True:
        remaining = min(end_at - now(), segment_end - monotonic())
        if remaining <= 0:
            break
        result = request(expected_revision, min(90, remaining))
        attempts += 1
        if not result["ok"]:
            failures += 1
        stamp = datetime.datetime.fromtimestamp(now(), datetime.timezone.utc).isoformat()
        report(f"{'PASS' if result['ok'] else 'FAIL'}: {stamp}; {result['message']}")
        remaining = min(end_at - now(), segment_end - monotonic())
        if remaining <= 0:
            break
        sleep(min(INTERVAL_SECONDS, remaining))
    report(f"DONE: attempts={attempts}; failures={failures}; segment or five-day deadline reached")
    return 1 if failures else 0


def main():
    try:
        deadline = datetime.datetime.fromisoformat(os.environ["WATCH_END_AT"].replace("Z", "+00:00"))
        if deadline.tzinfo is None:
            raise ValueError("timezone required")
        segment_seconds = int(os.environ.get("WATCH_SEGMENT_SECONDS", SEGMENT_SECONDS))
        return run_watch(deadline.timestamp(), os.environ["EXPECTED_DEPLOY_SHA"], segment_seconds=segment_seconds)
    except (KeyError, ValueError):
        log("FAIL: WATCH_END_AT and EXPECTED_DEPLOY_SHA must be configured")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
