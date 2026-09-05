/**
 * 입구 방어 검증 — 개인정보가 외부 모델로 새는 유일한 길목을 순수 함수로 잰다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPII, guardUtterance, rateLimit, resetRateLimit } from "./guard.ts";

/*
 * 픽스처는 조각을 이어 붙여 만든다 — 통짜로 적으면 scripts/scan.mjs(저장소 PII 스캔)가
 * 이 파일을 위반으로 잡는다. 탐지기를 시험하는 파일이 탐지에 걸리는 건 옳은 일이지만,
 * CI 를 빨갛게 두는 대신 scan.mjs 의 selftest 가 쓰는 같은 수법으로 조립한다.
 */
const 주민꼴 = "9001" + "01-1" + "234567";
const 주민꼴_붙임 = "9001" + "011" + "234567";
const 전화꼴 = "010-" + "1234-" + "5678";
const 계좌꼴 = "1002-" + "123-" + "456789";

test("주민·외국인등록번호 꼴을 잡는다", () => {
  assert.equal(detectPII(`제 번호는 ${주민꼴} 이에요`).length, 1);
  assert.equal(detectPII(주민꼴_붙임).length, 1); // 하이픈 없이도
});

test("휴대전화·계좌번호 꼴을 잡는다", () => {
  assert.ok(detectPII(`${전화꼴}로 연락주세요`).length >= 1);
  assert.ok(detectPII(`계좌 ${계좌꼴} 입니다`).length >= 1);
});

test("정상 발화는 잡지 않는다 — 날짜·금액·연도는 개인정보가 아니다", () => {
  const 발화 =
    "베트남 사람인데 2023년 9월 1일에 입사해서 2026-10-15에 출국해요 월급은 2,150,000원이에요";
  assert.deepEqual(detectPII(발화), []);
});

test("guardUtterance — PII 는 400으로 거부하고, 걸린 값 자체는 돌려주지 않는다", () => {
  const r = guardUtterance(`제 등록번호 ${주민꼴} 로 조회해줘`);
  assert.ok(!r.ok);
  assert.equal(r.status, 400);
  assert.ok(!r.error.includes(주민꼴.slice(0, 6)), "차단 메시지가 개인정보를 되뱉었다");
  assert.match(r.error, /전송되기 전에 차단/);
});

test("guardUtterance — 빈 값·과길이", () => {
  assert.equal((guardUtterance("") as { status: number }).status, 400);
  assert.equal((guardUtterance("가".repeat(2001)) as { status: number }).status, 400);
  assert.ok(guardUtterance("다음 달에 고향에 돌아가요").ok);
});

test("rateLimit — 한도까지 통과, 넘으면 429, 창이 지나면 회복", () => {
  resetRateLimit();
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i++) assert.ok(rateLimit("ip1", 20, 60_000, t0 + i).ok);
  const 초과 = rateLimit("ip1", 20, 60_000, t0 + 30);
  assert.ok(!초과.ok && 초과.status === 429);
  // 다른 키는 독립
  assert.ok(rateLimit("ip2", 20, 60_000, t0 + 30).ok);
  // 창(60초)이 지나면 다시 통과
  assert.ok(rateLimit("ip1", 20, 60_000, t0 + 61_000).ok);
});
