/**
 * A-Box 테스트.
 *
 *   npx node --test lib/ontology/abox.test.ts
 *
 * 두 가지를 본다.
 *   1. 실제 판정이 온톨로지 밖으로 새지 않는다 — judgeDeparture·judgePayslip 의 결과를
 *      그대로 개체로 풀면 T-Box 대조에서 위반이 0이어야 한다. 여기서 한 번이라도 어긋나면
 *      스키마와 코드 중 하나가 거짓말을 한다.
 *   2. 검증기가 정말 잡는가 — 손으로 망가뜨린 그래프를 넣었을 때 침묵하면 이 파일은 장식이다.
 *
 * 못 막는 것: 그래프가 T-Box 어휘로 정확히 쓰였는지다. "산재 공제"를 "최저임금 판정"
 * 클래스에 태워도 domain·range 는 만족한다. 분류표(RULE_CLASS 등)의 진위는 사람의 몫이다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRunABox, validateABox } from "./abox.ts";
import { judgeDeparture, monthsBetween, type DepartureInput } from "../rules/departure.ts";
import { judgePayslip } from "../rules/payslip.ts";
import { samples } from "../samples.ts";

const 오늘 = "2026-08-26";

const 출국조건 = (over: Partial<DepartureInput>): DepartureInput => ({
  nationality: "베트남",
  visa: "E-9",
  hireDate: "2023-09-01",
  departureDate: "2026-09-01",
  monthlyWage: 2_150_000,
  today: 오늘,
  ...over,
});

/** 실제 판정 → 그래프 → T-Box 대조. 위반이 있으면 테스트 이름과 함께 보여준다 */
function 실제판정대조(이름: string, ctx: Parameters<typeof buildRunABox>[0]) {
  const abox = buildRunABox(ctx);
  const result = validateABox(abox);
  assert.deepEqual(
    result.violations,
    [],
    `${이름}: A-Box 위반 ${result.violations.length}건\n${result.violations.join("\n")}`,
  );
  assert.ok(result.counts.individuals > 0, `${이름}: 개체가 하나도 없다`);
  return { abox, result };
}

/* ───────────── 1. 실제 판정 전수 ───────────── */

test("출국정산 — 납부확인국(베트남) 근속 3년 실행이 T-Box 를 벗어나지 않는다", () => {
  const { abox, result } = 실제판정대조("베트남-3년", {
    caseId: "T-베트남",
    skillId: "departure",
    departure: 출국조건({}),
    findings: judgeDeparture(출국조건({})),
  });
  // 국적이 갈래를 정하는 선이 실제로 놓였는가
  const s23 = abox.individuals.find(
    (x) => x.values?.["d.rule"] === "S2-3",
  )!;
  const nat = abox.individuals.find((x) => x.class === "departure.nationality.paid")!;
  assert.ok(
    nat.links!.some((l) => l.p === "p.nationality-branches" && l.target === s23.id),
    "납부확인국 → S2-3 선이 없다",
  );
  // 반환일시금은 추정이므로 범위 개체가 있다
  assert.ok(
    abox.individuals.some((x) => x.class === "money.range"),
    "수령가능 판정에 money.range 개체가 없다",
  );
  assert.ok(result.counts.links > 5, `연결이 비정상적으로 적다: ${result.counts.links}`);
});

test("출국정산 — 적용제외국(네팔)은 금액 없는 수령불가로 골라진다", () => {
  const 입력 = 출국조건({ nationality: "네팔" });
  const { abox } = 실제판정대조("네팔", {
    caseId: "T-네팔",
    skillId: "departure",
    departure: 입력,
    findings: judgeDeparture(입력),
  });
  assert.ok(
    abox.individuals.some((x) => x.class === "departure.nationality.excluded"),
    "네팔이 excluded 로 분류되지 않았다",
  );
});

test("출국정산 — 협정면제국(우즈베키스탄 E-9)과 명단 밖 국적(가나)", () => {
  for (const [nationality, 잎] of [
    ["우즈베키스탄", "departure.nationality.treaty"],
    ["가나", "departure.nationality.unlisted"],
  ] as const) {
    const 입력 = 출국조건({ nationality });
    const { abox } = 실제판정대조(nationality, {
      caseId: `T-${nationality}`,
      skillId: "departure",
      departure: 입력,
      findings: judgeDeparture(입력),
    });
    assert.ok(
      abox.individuals.some((x) => x.class === 잎),
      `${nationality} 이 ${잎} 로 분류되지 않았다`,
    );
  }
});

test("출국정산 — 명단 밖 국적에는 되묻기 선(p.unlisted-asks)이 놓인다", () => {
  const 입력 = 출국조건({ nationality: "가나" });
  const { abox } = 실제판정대조("가나-되묻기", {
    caseId: "T-가나묻기",
    skillId: "departure",
    departure: 입력,
    findings: judgeDeparture(입력),
  });
  const nat = abox.individuals.find((x) => x.class === "departure.nationality.unlisted")!;
  assert.ok(
    nat.links!.some((l) => l.p === "p.unlisted-asks"),
    "미확인 국적인데 되묻기 선이 없다",
  );
});

test("출국정산 — 근속 11개월의 수령불가에는 근속 차단 선(p.tenure-blocks)이 놓인다", () => {
  const 입력 = 출국조건({
    hireDate: "2025-10-01",
    departureDate: "2026-09-01",
  });
  const findings = judgeDeparture(입력);
  const s21 = findings.find((f) => f.rule === "S2-1")!;
  assert.equal(s21.level, "수령불가", "전제 무너짐 — 11개월인데 S2-1 이 수령불가가 아니다");

  const { abox } = 실제판정대조("11개월", {
    caseId: "T-11개월",
    skillId: "departure",
    departure: 입력,
    findings,
  });
  const tenure = abox.individuals.find((x) => x.class === "departure.tenure")!;
  assert.ok(
    tenure.links!.some((l) => l.p === "p.tenure-blocks"),
    "근속 차단 선이 없다",
  );
});

test("출국정산 — 시효초과 실행(D03 계열)도 T-Box 안에 있다", () => {
  const 입력 = 출국조건({
    hireDate: "2021-01-01",
    departureDate: "2022-07-01", // 오늘까지 4년 경과 — 보험 시효 3년 초과
  });
  const findings = judgeDeparture(입력);
  assert.ok(
    findings.some((f) => f.blocksClaims),
    "전제 무너짐 — 시효초과인데 청구 차단 판정이 없다",
  );
  실제판정대조("시효초과", {
    caseId: "T-시효초과",
    skillId: "departure",
    departure: 입력,
    findings,
  });
});

test("급여명세서 — 합성 명세서 전부와 규모 모름 변형이 T-Box 를 벗어나지 않는다", () => {
  for (const s of samples) {
    실제판정대조(`샘플 ${s.id}`, {
      caseId: `T-샘플${s.id}`,
      skillId: "payslip",
      workplaceSize: "5인이상",
      findings: judgePayslip(s.payslip),
    });
    실제판정대조(`샘플 ${s.id} · 모름`, {
      caseId: `T-샘플${s.id}-모름`,
      skillId: "payslip",
      workplaceSize: "모름",
      findings: judgePayslip(s.payslip),
    });
  }
});

test("발화·후보까지 포함한 전체 실행(콘솔 경로)이 T-Box 를 벗어나지 않는다", () => {
  실제판정대조("전체경로", {
    caseId: "T-전체",
    utterance: "다음 달에 고향에 돌아가는데 받을 돈이 있나요",
    routes: [
      { skill: "출국 정산", score: 2, matched: ["고향", "돌아가"] },
      { skill: "급여명세서 대조", score: 0, matched: [] },
    ].filter((r) => r.score > 0),
    skillId: "departure",
    departure: 출국조건({}),
    findings: judgeDeparture(출국조건({})),
  });
});

test("실행에서 실제로 받은 발화·라우팅·출국 입력값을 데이터 속성으로 보존한다", () => {
  const 입력 = 출국조건({
    nationality: "우즈베키스탄",
    visa: "E-9",
    hireDate: "2022-04-18",
    departureDate: "2026-10-03",
    monthlyWage: 3_200_000,
    today: "2026-09-05",
  });
  const { abox } = 실제판정대조("입력값-증거", {
    caseId: "T-입력값",
    utterance: "10월 3일 출국 전에 받을 돈을 확인해 주세요",
    routes: [
      { skill: "출국 정산", score: 3, matched: ["출국", "받을 돈"] },
    ],
    skillId: "departure",
    departure: 입력,
    findings: judgeDeparture(입력),
  });

  const 값 = (suffix: string) =>
    abox.individuals.find((x) => x.id === `${abox.runId}#${suffix}`)?.values;

  assert.deepEqual(값("utterance"), {
    "d.utterance-text": "10월 3일 출국 전에 받을 돈을 확인해 주세요",
  });
  assert.deepEqual(값("route-0"), {
    "d.route-skill": "출국 정산",
    "d.route-score": 3,
    "d.route-matched": ["출국", "받을 돈"],
  });
  assert.deepEqual(값("nationality"), { "d.nationality": "우즈베키스탄" });
  assert.deepEqual(값("visa"), { "d.visa": "E-9" });
  assert.deepEqual(값("tenure"), {
    "d.min-tenure": monthsBetween(입력.hireDate, 입력.departureDate),
    "d.hire-date": "2022-04-18",
    "d.departure-date": "2026-10-03",
  });
  assert.deepEqual(값("today"), { "d.reference-date": "2026-09-05" });
  assert.deepEqual(값("wage"), { "d.monthly-wage": 3_200_000 });
});

test("제공하지 않은 선택 입력은 빈 값이나 추정값으로 만들지 않는다", () => {
  const 비어있는그래프 = buildRunABox({
    caseId: "T-생략",
    skillId: "payslip",
    findings: [],
  });
  assert.deepEqual(비어있는그래프.individuals, []);
  assert.deepEqual(validateABox(비어있는그래프).violations, []);

  const 발화만 = buildRunABox({
    caseId: "T-발화만",
    utterance: "월급을 확인하고 싶어요",
    skillId: null,
    findings: [],
  });
  assert.deepEqual(
    발화만.individuals.find((x) => x.id === "T-발화만#utterance")?.values,
    { "d.utterance-text": "월급을 확인하고 싶어요" },
  );
  assert.equal(
    발화만.individuals.some((x) => x.class === "utterance.candidate"),
    false,
  );
});

/* ───────────── 2. 변형 포착 — 검증기가 침묵하지 않는가 ───────────── */

const 건강한그래프 = () =>
  buildRunABox({
    caseId: "M",
    utterance: "월급이 이상해요",
    routes: [{ skill: "급여명세서 대조", score: 1, matched: ["월급"] }],
    skillId: "payslip",
    workplaceSize: "모름",
    findings: judgePayslip(samples[0].payslip),
  });

test("없는 클래스로 타입된 개체를 잡는다", () => {
  const abox = 건강한그래프();
  abox.individuals[0].class = "verdict.hallucination";
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes("T-Box 에 없다")), v.join("\n"));
});

test("T-Box 에 없는 관계를 잡는다", () => {
  const abox = 건강한그래프();
  abox.individuals[0].links = [{ p: "p.made-up", target: abox.individuals[1].id }];
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes('관계 "p.made-up"')), v.join("\n"));
});

test("domain 을 벗어난 관계 주체를 잡는다 — 발화 후보가 명세서를 판정한다는 선", () => {
  const abox = 건강한그래프();
  const candidate = abox.individuals.find((x) => x.class === "utterance.candidate")!;
  candidate.links = [
    { p: "p.judge-payslip", target: abox.individuals.find((x) => x.values?.["d.rule"])!.id },
  ];
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes("domain")), v.join("\n"));
});

test("range 를 벗어난 관계 대상을 잡는다 — 국적이 급여 판정을 갈라 놓는다는 선", () => {
  const abox = 건강한그래프(); // 급여 실행 — 출국 개체가 하나도 없는 그래프다
  // 주체(domain 충족)와 대상(range 위반)을 분리해 range 검사만 겨냥한다
  abox.individuals.push({ id: "M-nat", class: "departure.nationality.paid" });
  const 판정 = abox.individuals.find((x) => x.values?.["d.rule"])!;
  const nat = abox.individuals.find((x) => x.id === "M-nat")!;
  nat.links = [{ p: "p.nationality-branches", target: 판정.id }];
  const v = validateABox(abox).violations;
  assert.ok(
    v.some((m) => m.includes('range 는 "verdict.departure.pension"')),
    v.join("\n"),
  );
});

test("공리「없는 돈」— 수령불가 판정에 금액 선을 몰래 붙이면 잡는다", () => {
  const 입력 = 출국조건({ nationality: "네팔" }); // S2-3 수령불가
  const abox = buildRunABox({
    caseId: "M-money",
    skillId: "departure",
    departure: 입력,
    findings: judgeDeparture(입력),
  });
  const s23 = abox.individuals.find((x) => x.values?.["d.rule"] === "S2-3")!;
  assert.equal(s23.values?.["d.level"], "수령불가", "전제 무너짐");
  s23.links!.push({ p: "p.has-amount", target: `${s23.id}#amount` });
  abox.individuals.push({
    id: `${s23.id}#amount`,
    class: "money.amount",
    values: { "d.amount": 7_000_000 },
  });
  const v = validateABox(abox).violations;
  assert.ok(
    v.some((m) => m.includes("공리「없는 돈」위반")),
    `700만 원짜리 오답이 그래프에서 살아났는데 잡지 못했다:\n${v.join("\n")}`,
  );
});

test("공리「존재하지 않는 돈」— 적용제외국 판정에 범위를 붙이면 잡는다", () => {
  const 입력 = 출국조건({ nationality: "네팔" });
  const abox = buildRunABox({
    caseId: "M-excluded",
    skillId: "departure",
    departure: 입력,
    findings: judgeDeparture(입력),
  });
  const s23 = abox.individuals.find((x) => x.values?.["d.rule"] === "S2-3")!;
  s23.links!.push({ p: "p.has-range", target: `${s23.id}#range` });
  abox.individuals.push({
    id: `${s23.id}#range`,
    class: "money.range",
    values: { "d.range-min": 1, "d.range-max": 2 },
  });
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes("공리「존재하지 않는 돈」위반")), v.join("\n"));
});

test("functional(d.level) — 수준 값을 지운 판정을 잡는다", () => {
  const abox = 건강한그래프();
  const 판정 = abox.individuals.find((x) => x.values?.["d.level"])!;
  delete 판정.values!["d.level"];
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes("functional 위반")), v.join("\n"));
});

test("존재하지 않는 대상을 가리키는 선을 잡는다", () => {
  const abox = 건강한그래프();
  const 첫개체 = abox.individuals[0];
  첫개체.links = [{ p: "p.has-level", target: "유령#level" }];
  const v = validateABox(abox).violations;
  assert.ok(v.some((m) => m.includes("그래프에 없다")), v.join("\n"));
});
