#!/usr/bin/env node
/**
 * 배포 스모크 — 심사 기간(9/7~9/11) 하루 1회 무중단 확인용.
 *
 *   node scripts/smoke.mjs https://<배포도메인>
 *
 * 검사 둘뿐이다: 첫 화면이 뜨는가, API 라우트가 살아 있는가.
 * 더 깊은 검증은 CI(npm run ci)의 몫이고, 이건 "URL이 죽지 않았다"의 증거다.
 */

const base = process.argv[2];
if (!base) {
  console.error("사용법: node scripts/smoke.mjs <URL>");
  process.exit(2);
}

const fail = [];
const t0 = Date.now();

try {
  const r = await fetch(base, { redirect: "follow" });
  const html = await r.text();
  if (r.status !== 200) fail.push(`GET / → ${r.status}`);
  if (!html.includes("페이체크")) fail.push("본문에 '페이체크'가 없다 — 다른 페이지가 떠 있다");
} catch (e) {
  fail.push(`GET / 실패: ${e instanceof Error ? e.message : e}`);
}

try {
  const r = await fetch(new URL("/api/narrate", base));
  const j = await r.json();
  if (!("provider" in j)) fail.push("/api/narrate 가 provider 상태를 답하지 않는다");
  else console.log(`제공자: ${j.provider ?? "미연결"}${j.model ? ` · ${j.model}` : ""}`);
} catch (e) {
  fail.push(`/api/narrate 실패: ${e instanceof Error ? e.message : e}`);
}

console.log(`소요 ${Date.now() - t0}ms`);
if (fail.length) {
  for (const f of fail) console.error(`실패 — ${f}`);
  process.exit(1);
}
console.log("스모크 통과 — 무중단 확인 기록에 오늘 날짜를 적어라");
