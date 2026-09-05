/**
 * Agent 0/1단 계약 — 네트워크 없는 순수 함수 테스트.
 * 모델이 실제로 저지르는 실수 4종을 픽스처로 고정한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractJson,
  validateRouter,
  validateIntake,
  프롬프트_라우터,
  프롬프트_추출,
  compareRoute,
} from "./agent.ts";

// ── extractJson ──

test("extractJson — 펜스 안 JSON을 꺼낸다", () => {
  const raw = '```json\n{"skill":"payslip","evidence":["월급"]}\n```';
  assert.deepEqual(extractJson(raw), { skill: "payslip", evidence: ["월급"] });
});

test("extractJson — 앞뒤 잡담이 있어도 JSON을 찾는다", () => {
  const raw = 'Sure:\n{"skill":"none","evidence":[]} done';
  assert.deepEqual(extractJson(raw), { skill: "none", evidence: [] });
});

// ── 라우터 계약 ──

test("라우터 — 정상 통과", () => {
  const utt = "월급에서 뭘 자꾸 떼가요";
  const raw = JSON.stringify({ skill: "payslip", evidence: ["월급", "떼"] });
  const r = validateRouter(raw, utt);
  assert.equal(r.skill, "payslip");
  assert.deepEqual(r.evidence, ["월급", "떼"]);
});

test("라우터 — 스킬 id 오타는 던진다", () => {
  const utt = "월급이 이상해요";
  const raw = JSON.stringify({ skill: "paysliip", evidence: ["월급"] });
  assert.throws(() => validateRouter(raw, utt), /등록되지 않은 스킬/);
});

test("라우터 — 대문자 보정", () => {
  const utt = "퇴직금을 받고 싶어요";
  const raw = JSON.stringify({ skill: "Departure", evidence: ["퇴직금"] });
  const r = validateRouter(raw, utt);
  assert.equal(r.skill, "departure");
});

test("라우터 — evidence가 발화에 없으면 걸러진다", () => {
  const utt = "안녕하세요";
  const raw = JSON.stringify({ skill: "payslip", evidence: ["월급"] });
  const r = validateRouter(raw, utt);
  assert.deepEqual(r.evidence, []);
  assert.equal(r.filteredCount, 1);
});

test("라우터 — evidence가 없으면 빈 배열", () => {
  const utt = "은행에서 계좌를 안 만들어줘요";
  const raw = JSON.stringify({ skill: "none", evidence: [] });
  const r = validateRouter(raw, utt);
  assert.equal(r.skill, "none");
  assert.deepEqual(r.evidence, []);
});

test("라우터 — JSON이 아니면 던진다", () => {
  assert.throws(() => validateRouter("not json", "월급"), /JSON/);
});

test("라우터 프롬프트에는 JSON 형식과 evidence 규칙이 실린다", () => {
  const p = 프롬프트_라우터("월급이 이상해요");
  assert.match(p, /skill/);
  assert.match(p, /evidence/);
  assert.match(p, /원문에/);
});

// ── 추출 계약 ──

test("추출 — 정상: 국적·날짜·임금 추출 + evidence 검증", () => {
  const utt = "베트남 사람인데 2023년 9월 1일에 입사해서 2026년 10월 15일에 출국해요 월급은 215만원이에요";
  const raw = JSON.stringify({
    nationality: { value: "베트남", evidence: "베트남" },
    hireDate: { value: "2023-09-01", evidence: "2023년 9월 1일" },
    departureDate: { value: "2026-10-15", evidence: "2026년 10월 15일" },
    monthlyWage: { value: 2150000, evidence: "215만원" },
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.nationality, "베트남");
  assert.equal(r.fields.hireDate, "2023-09-01");
  assert.equal(r.fields.departureDate, "2026-10-15");
  assert.equal(r.fields.monthlyWage, 2150000);
  assert.equal(r.discarded.length, 0);
});

test("추출 — 없는 국적 지어내기: evidence 불일치로 버린다", () => {
  const utt = "베트남 사람인데 출국해요";
  const raw = JSON.stringify({
    nationality: { value: "한국", evidence: "한국" },
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.nationality, undefined);
  assert.ok(r.discarded.some((d) => d.field === "nationality"));
  assert.ok(r.questions.some((q) => q.includes("국적")));
});

test("추출 — 날짜 형식 붕괴: 2023/09/01은 버린다", () => {
  const utt = "2023년 9월 1일 입사 2023/09/01";
  const raw = JSON.stringify({
    hireDate: { value: "2023/09/01", evidence: "2023/09/01" },
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.hireDate, undefined);
  assert.ok(r.discarded.some((d) => d.field === "hireDate"));
});

test("추출 — evidence 불일치: 원문에 없는 문자열로 값을 꾸미면 버린다", () => {
  const utt = "베트남 사람인데 입사일은 2023-09-01이에요";
  const raw = JSON.stringify({
    hireDate: { value: "2023-09-01", evidence: "2023년 9월 1일" }, // evidence가 utt에 없음
    nationality: { value: "베트남", evidence: "베트남" },
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.hireDate, undefined);
  assert.equal(r.fields.nationality, "베트남");
});

test("추출 — 숫자 파싱 검증: monthlyWage가 문자열 '215만원'이면 2150000으로 정규화", () => {
  const utt = "월급은 215만원이에요";
  const raw = JSON.stringify({
    monthlyWage: { value: "215만원", evidence: "215만원" },
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.monthlyWage, 2150000);
});

test("추출 — 평탄 형태도 받는다", () => {
  const utt = "베트남 E-9 2023-09-01 입사";
  const raw = JSON.stringify({
    nationality: "베트남",
    nationality_evidence: "베트남",
    hireDate: "2023-09-01",
    hireDate_evidence: "2023-09-01",
  });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.nationality, "베트남");
  assert.equal(r.fields.hireDate, "2023-09-01");
});

test("추출 — 비자 정규화 E9 -> E-9", () => {
  const utt = "비자는 E9예요";
  const raw = JSON.stringify({ visa: { value: "E9", evidence: "E9" } });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.visa, "E-9");
});

test("추출 — 못 뽑은 항목은 질문으로 돌린다", () => {
  const utt = "출국해요";
  const raw = JSON.stringify({ nationality: { value: "베트남", evidence: "베트남" } });
  // evidence "베트남"이 utt에 없으므로 버려지고 질문이 생긴다
  const r = validateIntake(raw, utt);
  assert.ok(r.questions.length > 0);
  assert.ok(r.questions.some((q) => q.includes("입사일") || q.includes("국적")));
});

test("추출 — workplaceSize 정규화", () => {
  const utt = "사업장은 5인이상이에요";
  const raw = JSON.stringify({ workplaceSize: { value: "5인이상", evidence: "5인이상" } });
  const r = validateIntake(raw, utt);
  assert.equal(r.fields.workplaceSize, "5인이상");
});

test("추출 프롬프트에는 YYYY-MM-DD와 evidence 규칙이 실린다", () => {
  const p = 프롬프트_추출("베트남 출국");
  assert.match(p, /YYYY-MM-DD/);
  assert.match(p, /evidence/);
});

test("compareRoute — 키워드가 우선, 불일치 표시", () => {
  assert.deepEqual(compareRoute({ skill: "payslip" }, { skill: "departure" }), { mismatch: true, winner: "payslip" });
  assert.deepEqual(compareRoute({ skill: "payslip" }, { skill: "payslip" }), { mismatch: false, winner: "payslip" });
  assert.deepEqual(compareRoute(null, { skill: "payslip" }), { mismatch: true, winner: "payslip" });
});
