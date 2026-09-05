/**
 * 골든셋 체커 — 한 벌.
 *
 * 원래 이 로직은 scripts/verify-golden.mjs 안에 살았다. 2026-08-28에 여기로 옮긴
 * 이유는 화면(골든셋 평가 뷰)이 같은 검사를 브라우저에서 보여줘야 해서다.
 * 체커를 두 벌로 만들면 한쪽만 고쳤을 때 터미널과 화면이 다른 답을 말한다 —
 * 그래서 runner(.mjs)와 화면이 **이 파일 하나를** 부른다.
 *
 * golden/cases.json 을 **생산 코드에 그대로 넣고** 기대값과 대조한다.
 * judgePayslip · judgeDeparture · checkAllGuardrails · routeByKeyword 를 다시 구현하지
 * 않는다. 판정 로직이 두 벌이 되면 한쪽만 고쳤을 때 리포트가 조용히 거짓말을 한다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 이 골든셋이 덮지 못하는 것 (자백)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. 각 산식의 자릿수·반올림. 여기서는 금액을 범위로만 본다. 정확한 계산은
 *    lib/rules/payslip.test.ts 와 lib/rules/departure.test.ts 가 값으로 검사한다.
 * 2. 하네스 구성 자체(manifest 필수 키·훅 커버리지). harness.test.ts 가 맡는다.
 * 3. 가드레일 하나하나의 동작. 여기서는 "위반 몇 건"만 센다.
 * 4. 화면. 대비·초점·낭독·반응형은 코드로 못 잡는다. 브라우저에서 재야 한다.
 * 5. 상수의 진위. 최저임금 10,320원이 정말 2026년 고시값인지는 어느 테스트도 모른다.
 * 6. 이미지 추출(1단 vision). 아직 없다. 없는 것을 검사하는 척하지 않는다.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 규율 둘:
 *   - 위반은 배열에 모아 전부 담는다. 첫 실패에서 멈추면 고치고 돌리기를 반복하게 된다.
 *   - 모르는 group · 모르는 expect 키는 **던진다.** 오타 하나가 CI 를 초록으로 속이면
 *     그때부터 이 파일은 장식이다.
 */

import { judgePayslip, ruleCatalog, type Payslip } from "./rules/payslip.ts";
import {
  judgeDeparture,
  departureRuleCatalog,
  type DepartureInput,
} from "./rules/departure.ts";
import { 연금명단_교차검사 } from "./rules/constants-departure.ts";
import { 심각도순, type Finding } from "./rules/types.ts";
import { checkAllGuardrails } from "./harness/guardrails.ts";
import { payslipHarness, departureHarness } from "./harness/registry.ts";
import { routeByKeyword, needsClarification, skills } from "./skills.ts";
import { buildRunABox, validateABox } from "./ontology/abox.ts";

/* ─────────────────────────────── 타입 ─────────────────────────────── */

export type GoldenCase = {
  id: string;
  group: string;
  desc: string;
  input: { skill: string; value: unknown };
  expect: {
    routesTo?: string | null;
    needsClarification?: boolean;
    mustFire?: string[];
    mustNotFire?: string[];
    levels?: Record<string, string>;
    amountAtLeast?: Record<string, number>;
    amountAtMost?: Record<string, number>;
    forbiddenText?: string[];
    guardViolations?: number;
  };
};

export type GoldenDoc = {
  note?: string;
  thresholds?: {
    minCases?: number;
    minCasesPerGroup?: number;
    requiredGroups?: string[];
    minCasesWithForbiddenText?: number;
    minCasesWithAmountBound?: number;
    maxGuardViolations?: number;
    maxUncoveredRules?: number;
  };
  groups: Record<string, string>;
  cases: GoldenCase[];
};

export type CaseResult = {
  id: string;
  group: string;
  desc: string;
  skill: string;
  /** 비어 있으면 통과다 */
  violations: string[];
};

export type GoldenReport = {
  /** 국적 명단 교차 — 비어 있지 않으면 케이스는 아예 돌지 않은 것이다 */
  listCross: string[];
  results: CaseResult[];
  /** 케이스 위반 + thresholds 위반 전부 */
  violations: string[];
  passed: number;
  guardTotal: number;
  firedRules: string[];
  uncovered: string[];
  totalRules: number;
  judged: number;
  routed: number;
};

/** 판정 스킬 + 라우터. 스킬 목록은 생산 코드에서 가져온다 — 손으로 적으면 어긋난다. */
const JUDGE_SKILLS = new Set<string>(skills.map((s) => s.id));
const LEVELS = new Set(Object.keys(심각도순));

/** 라우터 케이스에만 쓸 수 있는 기대 키 */
const ROUTER_KEYS = new Set(["routesTo", "needsClarification"]);
/** 판정 케이스에만 쓸 수 있는 기대 키 */
const JUDGE_KEYS = new Set([
  "mustFire",
  "mustNotFire",
  "levels",
  "amountAtLeast",
  "amountAtMost",
  "forbiddenText",
  "guardViolations",
]);

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/* ─────────────────────────── 입력 검사 (여기선 던진다) ─────────────────────────── */

/**
 * 케이스 파일 자체가 망가진 것과 판정이 틀린 것은 다른 사고다.
 * 전자는 조용히 통과하면 안 되므로 예외로 멈춘다.
 */
export function validateDoc(doc: GoldenDoc): void {
  const groups = Object.keys(doc.groups ?? {});
  if (groups.length === 0) throw new Error("golden/cases.json 에 groups 가 없습니다");
  if (!Array.isArray(doc.cases)) throw new Error("golden/cases.json 에 cases 배열이 없습니다");

  const seen = new Set<string>();
  for (const c of doc.cases) {
    const at = `케이스 ${c.id ?? "(id 없음)"}`;
    if (!c.id) throw new Error(`${at}: id 가 필요합니다`);
    if (seen.has(c.id)) throw new Error(`${at}: id 가 중복됩니다`);
    seen.add(c.id);

    if (!groups.includes(c.group)) {
      throw new Error(
        `[${c.id}] 모르는 group "${c.group}" 입니다. 쓸 수 있는 group: ${groups.join(", ")}`,
      );
    }
    if (!c.desc) throw new Error(`[${c.id}] desc 가 필요합니다. 이 케이스가 무엇을 막는지 적어 주세요`);

    const skill = c.input?.skill;
    const isRouter = skill === "router";
    if (!isRouter && !JUDGE_SKILLS.has(skill)) {
      throw new Error(
        `[${c.id}] 모르는 skill "${skill}" 입니다. 쓸 수 있는 skill: router, ${[...JUDGE_SKILLS].join(", ")}`,
      );
    }
    if (c.input.value === undefined) throw new Error(`[${c.id}] input.value 가 없습니다`);

    const keys = Object.keys(c.expect ?? {});
    if (keys.length === 0)
      throw new Error(`[${c.id}] expect 가 비어 있습니다. 검사하지 않는 케이스는 케이스가 아닙니다`);
    for (const k of keys) {
      const allowed = isRouter ? ROUTER_KEYS : JUDGE_KEYS;
      if (!allowed.has(k)) {
        // 반대편 키를 쓰면 그 기대는 영영 검사되지 않는다. 조용히 통과시키지 않는다.
        throw new Error(
          `[${c.id}] skill "${skill}" 케이스에서 쓸 수 없는 expect 키 "${k}" 입니다. ` +
            `쓸 수 있는 키: ${[...allowed].join(", ")}`,
        );
      }
    }
    for (const [rule, level] of Object.entries(c.expect.levels ?? {})) {
      if (!LEVELS.has(level)) {
        throw new Error(
          `[${c.id}] ${rule} 의 기대 수준 "${level}" 은 없는 판정 수준입니다. ` +
            `쓸 수 있는 수준: ${[...LEVELS].join(", ")}`,
        );
      }
    }
  }
}

/* ─────────────────────────────── 실행 ─────────────────────────────── */

type RouterOut = {
  kind: "router";
  routesTo: string | null;
  ask: boolean;
  routed: ReturnType<typeof routeByKeyword>;
};
type JudgeOut = {
  kind: "judge";
  findings: Finding[];
  guard: string[];
  aboxViolations: string[];
};

function runCase(c: GoldenCase): RouterOut | JudgeOut {
  const { skill, value } = c.input;
  if (skill === "router") {
    const routed = routeByKeyword(value as string);
    const ask = needsClarification(routed);
    // 되물어야 하는 상황은 "고르지 않았다"로 본다. 동점일 때 배열 순서로 하나를 집으면
    // 그건 고른 것이 아니라 우연이다.
    return { kind: "router", routesTo: ask ? null : routed[0].skill.id, ask, routed };
  }
  // validateDoc 이 skill ∈ JUDGE_SKILLS 를 이미 보증했다 — 여기서 좁힌다
  const sid = skill as "payslip" | "departure";
  const findings =
    sid === "payslip"
      ? judgePayslip(value as Payslip)
      : judgeDeparture(value as DepartureInput);
  const manifest = sid === "payslip" ? payslipHarness : departureHarness;

  // 같은 실행을 온톨로지 개체 그래프(A-Box)로도 한 번 푼다. 판정 결과가 T-Box 의
  // 어휘·관계·공리를 벗어나면 여기서 잡힌다 — 스키마가 장식이 됐다는 뜻이므로.
  const abox = buildRunABox({
    caseId: c.id,
    skillId: sid,
    departure: skill === "departure" ? (value as DepartureInput) : undefined,
    workplaceSize:
      skill === "payslip" ? (value as Payslip & { workplaceSize?: string }).workplaceSize : undefined,
    findings,
  });
  const aboxViolations = validateABox(abox).violations;

  return {
    kind: "judge",
    findings,
    guard: checkAllGuardrails(findings, manifest),
    aboxViolations,
  };
}

/** 사용자에게 보이는 모든 글자. forbiddenText 는 이걸 훑는다. */
const fieldsOf = (f: Finding): [string, string | undefined][] => [
  ["title", f.title],
  ["formula", f.formula],
  ["basis", f.basis],
  ["deadline.label", f.deadline?.label],
  ...(f.questions ?? []).map((q, i): [string, string] => [`questions[${i}]`, q]),
];

/* ─────────────────────────────── 대조 ─────────────────────────────── */

function checkCase(c: GoldenCase, out: RouterOut | JudgeOut): string[] {
  const v: string[] = [];
  const say = (m: string) => v.push(`[${c.id}] ${m}`);
  const e = c.expect;

  if (out.kind === "router") {
    const 후보 = out.routed.map((r) => `${r.skill.id}(${r.score}점)`).join(", ") || "없음";
    if ("routesTo" in e && e.routesTo !== out.routesTo) {
      say(
        `발화 "${c.input.value}" 를 ${e.routesTo ?? "어느 스킬도 아닌 곳(되묻기)"} 으로 보내야 하는데 ` +
          `${out.routesTo ?? "되묻기"} 로 갔습니다. 후보 ${out.routed.length}건: ${후보}`,
      );
    }
    if ("needsClarification" in e && e.needsClarification !== out.ask) {
      say(
        `되묻기 여부: 기대 ${e.needsClarification} / 실제 ${out.ask}. 후보 ${out.routed.length}건: ${후보}`,
      );
    }
    return v;
  }

  const { findings, guard, aboxViolations } = out;
  const byRule = new Map(findings.map((f) => [f.rule, f]));
  const 나온룰 = findings.map((f) => `${f.rule}(${f.level})`).join(", ") || "없음";

  for (const rule of e.mustFire ?? []) {
    if (!byRule.has(rule)) {
      say(`${rule} 이 나와야 하는데 나오지 않았습니다. 실제로 나온 룰 ${findings.length}건: ${나온룰}`);
    }
  }
  for (const rule of e.mustNotFire ?? []) {
    const f = byRule.get(rule);
    if (f) {
      say(`${rule} 은 나오면 안 되는데 "${f.level} — ${f.title}" 로 나왔습니다. 나온 룰 ${findings.length}건: ${나온룰}`);
    }
  }
  for (const [rule, level] of Object.entries(e.levels ?? {})) {
    const f = byRule.get(rule);
    if (!f) {
      say(`${rule} 의 판정 수준을 ${level} 로 기대했는데 ${rule} 자체가 나오지 않았습니다. 나온 룰 ${findings.length}건: ${나온룰}`);
    } else if (f.level !== level) {
      say(`${rule} 의 판정 수준: 기대 ${level} / 실제 ${f.level} ("${f.title}")`);
    }
  }

  const 금액검사 = (
    rule: string,
    bound: number,
    cmp: (a: number, b: number) => boolean,
    말: string,
  ) => {
    const f = byRule.get(rule);
    if (!f) {
      say(`${rule} 의 금액을 ${won(bound)} ${말}으로 기대했는데 ${rule} 이 나오지 않았습니다.`);
      return;
    }
    if (f.amount === undefined) {
      // 금액이 없는 것을 0으로 봐 주면 기대가 조용히 통과한다.
      say(`${rule} 에 금액이 붙어 있지 않습니다. 기대 ${won(bound)} ${말} ("${f.title}")`);
      return;
    }
    if (!cmp(f.amount, bound)) {
      say(`${rule} 의 금액: 기대 ${won(bound)} ${말} / 실제 ${won(f.amount)}`);
    }
  };
  for (const [rule, bound] of Object.entries(e.amountAtLeast ?? {})) {
    금액검사(rule, bound, (a, b) => a >= b, "이상");
  }
  for (const [rule, bound] of Object.entries(e.amountAtMost ?? {})) {
    금액검사(rule, bound, (a, b) => a <= b, "이하");
  }

  for (const 금지 of e.forbiddenText ?? []) {
    for (const f of findings) {
      for (const [field, text] of fieldsOf(f)) {
        if (typeof text === "string" && text.includes(금지)) {
          say(`최종 산출물에 있으면 안 되는 문장이 나왔습니다: "${금지}" — ${f.rule} 의 ${field} ("${text.split("\n")[0]}")`);
        }
      }
    }
  }

  if (e.guardViolations !== undefined && guard.length !== e.guardViolations) {
    say(
      `가드레일 위반: 기대 ${e.guardViolations}건 / 실제 ${guard.length}건` +
        (guard.length ? ` — ${guard.join(" · ")}` : ""),
    );
  }

  // A-Box 대조 — 기대값과 무관하게 항상 0건이어야 한다. 판정이 옳아도 그래프가
  // T-Box 를 벗어나면 스키마와 코드 중 하나가 거짓말을 하는 것이다.
  for (const m of aboxViolations ?? []) say(`A-Box 대조 실패 — ${m}`);
  return v;
}

/* ─────────────────────────────── 기준선 ─────────────────────────────── */

function checkThresholds(
  doc: GoldenDoc,
  stats: { guard: number; uncovered: string[] },
): string[] {
  const t = doc.thresholds ?? {};
  const v: string[] = [];
  const say = (m: string) => v.push(`[thresholds] ${m}`);

  if (t.minCases !== undefined && doc.cases.length < t.minCases) {
    say(`케이스가 ${t.minCases}건 이상이어야 하는데 ${doc.cases.length}건입니다.`);
  }
  for (const g of t.requiredGroups ?? []) {
    const n = doc.cases.filter((c) => c.group === g).length;
    if (n === 0) say(`group "${g}" 의 케이스가 하나도 없습니다.`);
    else if (t.minCasesPerGroup !== undefined && n < t.minCasesPerGroup) {
      say(`group "${g}" 는 ${t.minCasesPerGroup}건 이상이어야 하는데 ${n}건입니다.`);
    }
  }
  const 금지문장 = doc.cases.filter((c) => (c.expect.forbiddenText ?? []).length).length;
  if (
    t.minCasesWithForbiddenText !== undefined &&
    금지문장 < t.minCasesWithForbiddenText
  ) {
    say(`"절대 없어야 할 문장"을 검사하는 케이스가 ${t.minCasesWithForbiddenText}건 이상이어야 하는데 ${금지문장}건입니다.`);
  }
  const 금액검사 = doc.cases.filter(
    (c) => c.expect.amountAtLeast || c.expect.amountAtMost,
  ).length;
  if (t.minCasesWithAmountBound !== undefined && 금액검사 < t.minCasesWithAmountBound) {
    say(`금액 범위를 검사하는 케이스가 ${t.minCasesWithAmountBound}건 이상이어야 하는데 ${금액검사}건입니다.`);
  }
  if (stats.guard > (t.maxGuardViolations ?? 0)) {
    say(`가드레일 위반 합계가 ${t.maxGuardViolations}건 이하여야 하는데 ${stats.guard}건입니다.`);
  }
  if (stats.uncovered.length > (t.maxUncoveredRules ?? 0)) {
    say(
      `어느 케이스도 발동시키지 못한 룰이 ${t.maxUncoveredRules ?? 0}개 이하여야 하는데 ` +
        `${stats.uncovered.length}개입니다: ${stats.uncovered.join(", ")}`,
    );
  }
  return v;
}

/* ─────────────────────────────── 진입점 ─────────────────────────────── */

/**
 * 골든셋 전체 실행. 순수 함수 — 같은 doc 이면 몇 번을 불러도 같은 리포트다.
 * 터미널(scripts/verify-golden.mjs)과 화면(골든셋 평가 뷰)이 똑같이 이걸 부른다.
 */
export function runGolden(doc: GoldenDoc): GoldenReport {
  validateDoc(doc);

  /* 온톨로지 공리 — 국적 세 명단은 서로 겹치지 않는다.
     판정 케이스를 돌기 전에 멈춘다. 겹친 명단으로 얻은 통과는 통과가 아니라 오답이다. */
  const listCross = 연금명단_교차검사();
  const 전체룰 = [...ruleCatalog, ...departureRuleCatalog].map((r) => r.rule);
  const 라우팅 = doc.cases.filter((c) => c.input.skill === "router").length;

  if (listCross.length) {
    return {
      listCross,
      results: [],
      violations: [],
      passed: 0,
      guardTotal: 0,
      firedRules: [],
      uncovered: 전체룰,
      totalRules: 전체룰.length,
      judged: doc.cases.length - 라우팅,
      routed: 라우팅,
    };
  }

  const 발동한룰 = new Set<string>();
  const violations: string[] = [];
  const results: CaseResult[] = [];
  let guardTotal = 0;
  let passed = 0;

  for (const c of doc.cases) {
    const out = runCase(c);
    if (out.kind === "judge") {
      guardTotal += out.guard.length;
      for (const f of out.findings) 발동한룰.add(f.rule);
    }
    const v = checkCase(c, out);
    if (v.length === 0) passed += 1;
    violations.push(...v);
    results.push({
      id: c.id,
      group: c.group,
      desc: c.desc,
      skill: c.input.skill,
      violations: v,
    });
  }

  const uncovered = 전체룰.filter((r) => !발동한룰.has(r));
  violations.push(...checkThresholds(doc, { guard: guardTotal, uncovered }));

  return {
    listCross: [],
    results,
    violations,
    passed,
    guardTotal,
    firedRules: [...발동한룰],
    uncovered,
    totalRules: 전체룰.length,
    judged: doc.cases.length - 라우팅,
    routed: 라우팅,
  };
}
