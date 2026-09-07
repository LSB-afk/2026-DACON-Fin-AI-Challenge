import datetime
import http.server
import threading
import unittest
from unittest.mock import patch

import render_health_watch as watch


SHA = "d2223595a91633de9d1fc939a688c2a32c7f477c"


class Clock:
    def __init__(self):
        self.value = 1_000.0
        self.elapsed = 0.0
        self.sleeps = []

    def now(self):
        return self.value

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.value += seconds
        self.elapsed += seconds

    def monotonic(self):
        return self.elapsed


class WatchTests(unittest.TestCase):
    def run_watch(self, end_at, probe, clock, **options):
        return watch.run_watch(end_at, SHA, now=clock.now, sleep=clock.sleep,
                               monotonic=clock.monotonic, request=probe,
                               report=lambda message: None, **options)

    def test_repeats_every_four_minutes_and_stops_at_global_deadline(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append((clock.now(), sha, timeout))
            return {"ok": True, "message": "healthy"}

        self.assertEqual(self.run_watch(1_600, probe, clock), 0)
        self.assertEqual([item[0] for item in requests], [1_000, 1_240, 1_480])
        self.assertTrue(all(item[1] == SHA for item in requests))
        self.assertEqual(clock.now(), 1_600)

    def test_each_segment_hands_off_after_five_hours(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append(clock.now())
            return {"ok": True, "message": "healthy"}

        self.assertEqual(self.run_watch(1_000 + 120 * 3_600, probe, clock), 0)
        self.assertEqual(len(requests), 75)
        self.assertEqual(clock.now(), 1_000 + 5 * 3_600)

    def test_initial_five_minute_segment_proves_two_requests_then_hands_off(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append(clock.now())
            return {"ok": True, "message": "healthy"}

        self.assertEqual(self.run_watch(1_000 + 120 * 3_600, probe, clock, segment_seconds=300), 0)
        self.assertEqual(requests, [1_000, 1_240])
        self.assertEqual(clock.now(), 1_300)

    def test_segment_cannot_be_extended_past_five_hours(self):
        clock = Clock()
        for duration in [0, -1, float("nan"), 5 * 3_600 + 1]:
            with self.subTest(duration=duration):
                self.assertEqual(self.run_watch(2_000, lambda *args: self.fail("unexpected HTTP"),
                                               clock, segment_seconds=duration), 2)

    def test_wall_clock_jump_back_cannot_extend_the_five_hour_segment(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append(clock.now())
            if len(requests) == 1:
                clock.value -= 3_600
            return {"ok": True, "message": "healthy"}

        self.assertEqual(self.run_watch(1_000 + 120 * 3_600, probe, clock), 0)
        self.assertEqual(len(requests), 75)
        self.assertEqual(clock.elapsed, 5 * 3_600)

    def test_expired_window_does_not_send_requests(self):
        clock = Clock()
        self.assertEqual(self.run_watch(1_000, lambda *args: self.fail("unexpected HTTP"), clock), 0)
        self.assertEqual(clock.sleeps, [])

    def test_failures_do_not_stop_later_pings_and_are_not_reported_as_success(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append(clock.now())
            return {"ok": len(requests) > 1, "message": "probe result"}

        self.assertEqual(self.run_watch(1_600, probe, clock), 1)
        self.assertEqual(len(requests), 3)

    def test_timeout_and_sleep_are_capped_by_remaining_time(self):
        clock, timeouts = Clock(), []

        def probe(sha, timeout):
            timeouts.append(timeout)
            clock.value += 2
            clock.elapsed += 2
            return {"ok": True, "message": "healthy"}

        self.assertEqual(self.run_watch(1_007, probe, clock), 0)
        self.assertEqual(timeouts, [7])
        self.assertEqual(clock.sleeps, [5])
        self.assertEqual(clock.now(), 1_007)

    def test_no_more_requests_if_a_probe_crosses_the_cutoff(self):
        clock, requests = Clock(), []

        def probe(sha, timeout):
            requests.append(clock.now())
            clock.value += 20
            clock.elapsed += 20
            return {"ok": False, "message": "timed out"}

        self.assertEqual(self.run_watch(1_010, probe, clock), 1)
        self.assertEqual(requests, [1_000])
        self.assertEqual(clock.sleeps, [])

    def test_invalid_configuration_cannot_send_requests(self):
        for deadline, sha in [(float("nan"), SHA), (float("inf"), SHA),
                              (1_001 + 120 * 3_600, SHA), (1_600, "invalid")]:
            with self.subTest(deadline=deadline, sha=sha):
                clock = Clock()
                code = watch.run_watch(deadline, sha, now=clock.now, sleep=clock.sleep,
                                       request=lambda *args: self.fail("unexpected HTTP"),
                                       report=lambda message: None)
                self.assertEqual(code, 2)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json
        cls.requests = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                cls.requests.append((self.command, self.path))
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/destination")
                    self.end_headers()
                    return
                stamp = datetime.datetime.now(datetime.timezone.utc)
                if self.path == "/stale":
                    stamp -= datetime.timedelta(minutes=10)
                body = b"<html>Starting up</html>" if self.path == "/loading" else json.dumps({
                    "status": "ok", "service": "paycheck",
                    "revision": "a" * 40 if self.path == "/wrong-revision" else SHA,
                    "checkedAt": stamp.isoformat(),
                }).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_real_http_probe_uses_get_and_accepts_the_frozen_revision(self):
        with patch.object(watch, "HEALTH_URL", self.origin + "/api/health"):
            result = watch.check_health(SHA, 2)
        self.assertTrue(result["ok"], result)
        self.assertIn(("GET", "/api/health"), self.requests)
        self.assertIn(SHA, result["message"])

    def test_redirect_is_rejected_without_following_it(self):
        with patch.object(watch, "HEALTH_URL", self.origin + "/redirect"):
            result = watch.check_health(SHA, 2)
        self.assertFalse(result["ok"])
        self.assertNotIn(("GET", "/destination"), self.requests)

    def test_loading_page_wrong_revision_and_stale_response_are_not_healthy(self):
        for path in ["/loading", "/wrong-revision", "/stale"]:
            with self.subTest(path=path), patch.object(watch, "HEALTH_URL", self.origin + path):
                self.assertFalse(watch.check_health(SHA, 2)["ok"])


if __name__ == "__main__":
    unittest.main()
