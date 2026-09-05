/**
 * A-Box — 실행 하나를 개체 그래프로 푼다.
 *
 * T-Box(schema.ts)가 "무엇이 존재할 수 있고 무엇이 함께일 수 없는가"를 말한다면,
 * 이 파일은 **실제 판정 한 번**을 그 어휘의 개체로 바꿔 끼운다. 발화·후보·국적·판정·
 * 금액·기한이 전부 개체가 되고, OBJECT_PROPERTIES 의 선으로 연결된다.
 *
 * 왜 필요한가: T-Box 만으로는 "이 온톨로지가 실제 실행을 말해 줄 수 있는가"를 증명할 수
 * 없다. 스키마는 아무리 예뻐도 인스턴스가 없으면 장식이다. 이 파일이 실행을 흡수하고
 * validateABox 가 T-Box 에 대조하면, 판정 결과가 온톨로지 밖에서조용히 새어 나갈 수 없음이
 * 테스트로 잡힌다.
 *
 * 결정성: 개체 id 는 사례 id 와 룰 번호에서만 온다. 시각·난수를 쓰지 않는다 — 같은 입력은
 * 항상 같은 그래프가 되고, 골든셋이 이 그래프를 통째로 대조할 수 있다.
 *
 * 알려진 한계:
 *   - 발화 원문은 현재 화면이 이미 가진 문자열을 검사 근거로 같은 메모리 그래프에 그대로
 *     보존한다. 이 조립기는 저장·로그·전송하지 않으며, 호출자는 기존 입력 보호 절차와 같은
 *     수명으로 그래프를 다뤄야 한다. 정확한 현재 입력 대조가 목적이라 임의 축약·정규화하지 않는다.
 *   - payslip.size.downgrades(p.size-downgrades) 관계는 아직 잇지 않았다. 어떤 확인필요
 *     판정이 규모 모름 때문인지는 Finding 안에 원인이 없어서, 여기서 다시 추론하면
 *     온톨로지가 코드를 흉내 내는 두 번째 구현이 된다. 원인 필드가 Finding 에 생기면 잇는다.
 */

import type { ClassId, PropertyId } from "./schema.ts";
import { ancestors, classById, DATA_PROPERTIES, OBJECT_PROPERTIES } from "./schema.ts";
import type { Finding, Level } from "../rules/types.ts";
import type { SkillId } from "../skills.ts";
import type { DepartureInput, 연금상태 } from "../rules/departure.ts";
import { 연금납부여부, monthsBetween } from "../rules/departure.ts";
import type { WorkplaceSize } from "../rules/payslip.ts";

export type IndividualId = string;

/** T-Box 의 클래스 하나로 타입된 개체. 다중 타이핑은 일부러 막았다 — 코드도 그렇게 한다 */
export type Individual = {
  id: IndividualId;
  class: ClassId;
  /** 데이터 속성 값. 키는 DataProperty id (d.rule, d.amount ...) */
  values?: Record<PropertyId, unknown>;
  links?: { p: PropertyId; target: IndividualId }[];
};

export type ABox = {
  runId: string;
  skill: SkillId | null;
  individuals: Individual[];
};

/** 실행 한 번. 다 들고 올 필요는 없다 — 있는 것만 개체가 된다 */
export type RunContext = {
  caseId: string;
  /** 없으면 상담 발화 개체를 만들지 않는다 (골든셋 판정 케이스 등) */
  utterance?: string;
  routes?: { skill: string; score: number; matched: string[] }[];
  skillId: SkillId | null;
  departure?: DepartureInput;
  workplaceSize?: WorkplaceSize;
  findings: Finding[];
};

/* ─────────────────────── 분류표 ─────────────────────── */

/** 판정 수준 → T-Box 잎 클래스. 이 여섯이 전부다 (verdict.level 의 자식) */
const LEVEL_CLASS: Record<Level, ClassId> = {
  위법: "verdict.level.illegal",
  확인필요: "verdict.level.check",
  정상: "verdict.level.ok",
  기한임박: "verdict.level.urgent",
  수령가능: "verdict.level.claimable",
  수령불가: "verdict.level.none",
};

/** 연금납부여부 네 갈래 → 국적 잎 클래스. 세 명단 밖이면 명단 밖이다 */
const NATIONALITY_CLASS: Record<연금상태, ClassId> = {
  납부함: "departure.nationality.paid",
  미가입: "departure.nationality.excluded",
  협정면제: "departure.nationality.treaty",
  미확인: "departure.nationality.unlisted",
};

/**
 * 룰 번호 → 판정 하위클래스. 카탈로그에 실재하는 곳만 좁힌다.
 * 온톨로지가 코드보다 정밀한 척하지 않는 규칙(schema.ts p.size-downgrades 주석)과 같다 —
 * 모르는 룰번호는 부모(verdict.payslip / verdict.departure)로 남긴다.
 */
const RULE_CLASS: Record<string, ClassId> = {
  A1: "verdict.payslip.sanjae",
  A6: "verdict.payslip.minwage",
  A7: "verdict.payslip.overtime",
  "S2-1": "verdict.departure.severance",
  "S2-2": "verdict.departure.returncost",
  "S2-3": "verdict.departure.pension",
};

const verdictClassOf = (rule: string): ClassId =>
  RULE_CLASS[rule] ?? (rule.startsWith("S2") ? "verdict.departure" : "verdict.payslip");

/* ─────────────────────── 조립 ─────────────────────── */

export function buildRunABox(ctx: RunContext): ABox {
  const runId = ctx.caseId;
  const out: Individual[] = [];
  const put = (ind: Individual) => {
    if (out.some((x) => x.id === ind.id))
      throw new Error(`개체 id 충돌: ${ind.id} — runId 가 유일한가 확인하라`);
    out.push(ind);
  };

  /* 들어온 것: 상담 사례 · 발화 · 후보 */
  if (ctx.utterance !== undefined) {
    // 사례가 말을 준다 — 방향은 T-Box(p.case-utters)가 정한 것이다
    put({
      id: `${runId}#case`,
      class: "utterance.case",
      links: [{ p: "p.case-utters", target: `${runId}#utterance` }],
    });
    const utt: Individual = {
      id: `${runId}#utterance`,
      class: "utterance",
      values: { "d.utterance-text": ctx.utterance },
    };
    if (ctx.routes?.length)
      utt.links = ctx.routes.map((_r, i) => ({
        p: "p.routes",
        target: `${runId}#route-${i}`,
      }));
    put(utt);
    ctx.routes?.forEach((r, i) => {
      put({
        id: `${runId}#route-${i}`,
        class: "utterance.candidate",
        values: {
          "d.route-skill": r.skill,
          "d.route-score": r.score,
          "d.route-matched": r.matched,
        },
      });
    });
  }

  /* 들어온 것: 출국 조건 */
  if (ctx.departure) {
    const d = ctx.departure;
    const 상태 = 연금납부여부(d.nationality, d.visa);
    put({
      id: `${runId}#nationality`,
      class: NATIONALITY_CLASS[상태],
      values: { "d.nationality": d.nationality },
    });
    put({
      id: `${runId}#visa`,
      class: d.visa === "E-9" ? "departure.visa.insured" : "departure.visa",
      values: { "d.visa": d.visa },
    });
    put({
      id: `${runId}#tenure`,
      class: "departure.tenure",
      values: {
        "d.min-tenure": monthsBetween(d.hireDate, d.departureDate),
        "d.hire-date": d.hireDate,
        "d.departure-date": d.departureDate,
      },
    });
    put({
      id: `${runId}#today`,
      class: "departure.today",
      values: { "d.reference-date": d.today },
    });
    put({
      id: `${runId}#wage`,
      class: "departure.wage",
      values: { "d.monthly-wage": d.monthlyWage },
    });
  }

  /* 들어온 것: 사업장 규모 */
  if (ctx.workplaceSize) {
    put({
      id: `${runId}#size`,
      class: ctx.workplaceSize === "모름" ? "payslip.size.unknown" : "payslip.size",
      values: { "d.workplace-size": ctx.workplaceSize },
    });
  }

  /* 만든 것: 판정 · 수준 · 금액 · 기한 · 근거 */
  ctx.findings.forEach((f, i) => {
    const vid = `${runId}#finding-${i}`;
    const values: Individual["values"] = {
      "d.rule": f.rule,
      "d.level": f.level,
    };
    if (f.questions?.length) values["d.questions"] = f.questions;

    const links: NonNullable<Individual["links"]> = [
      // 수준은 판정마다 자기 개체를 가진다 — tenure-blocks·unlisted-asks 처럼
      // "특정 판정의 수준"을 가리켜야 하는 관계 때문이다
      { p: "p.has-level", target: `${vid}#level` },
      { p: "p.cites", target: `${vid}#clause` },
    ];
    if (f.amount !== undefined) {
      links.push({ p: "p.has-amount", target: `${vid}#amount` });
      put({
        id: `${vid}#amount`,
        class: "money.amount",
        values: { "d.amount": f.amount },
      });
    }
    if (f.amountRange) {
      links.push({ p: "p.has-range", target: `${vid}#range` });
      put({
        id: `${vid}#range`,
        class: "money.range",
        values: {
          "d.range-min": f.amountRange.min,
          "d.range-max": f.amountRange.max,
        },
      });
    }
    if (f.deadline) {
      links.push({ p: "p.has-deadline", target: `${vid}#deadline` });
      put({
        id: `${vid}#deadline`,
        class: "money.deadline",
        values: { "d.days-left": f.deadline.daysLeft },
      });
    }

    put({
      id: vid,
      class: verdictClassOf(f.rule),
      values,
      links,
    });
    put({
      id: `${vid}#level`,
      class: LEVEL_CLASS[f.level],
    });
    put({ id: `${vid}#clause`, class: "evidence.clause" });

    /* 입력이 산출을 정하는 선들 — T-Box 가 선언한 인과를 그대로 옮긴다 */
    if (ctx.departure) {
      const d = ctx.departure;
      if (f.rule === "S2-3") {
        // 국적이 갈래를 정한다 — 어떤 잎 국적인지는 분류표가 이미 골라 놓았다
        const nat = out.find((x) => x.id === `${runId}#nationality`);
        nat!.links ??= [];
        nat!.links.push({ p: "p.nationality-branches", target: vid });
        if (f.level === "확인필요") {
          // 명단 밖 국적은 단정 대신 되묻는다(p.unlisted-asks)
          nat!.links.push({ p: "p.unlisted-asks", target: `${vid}#level` });
        }
      }
      if (
        f.rule === "S2-1" &&
        f.level === "수령불가" &&
        monthsBetween(d.hireDate, d.departureDate) < 12
      ) {
        // 근속 미달이 낸 수령불가만 잇는다. 시효초과 수령불가는 원인이 다르다.
        // 주체는 근속, 대상은 그 판정의 수준 개체다(p.tenure-blocks 의 domain·range)
        const tenure = out.find((x) => x.id === `${runId}#tenure`);
        tenure!.links ??= [];
        tenure!.links.push({ p: "p.tenure-blocks", target: `${vid}#level` });
      }
    }
  });

  /* 기준일이 D-day를 정한다 — deadline 이 있는 판정 전부에 선을 놓는다 */
  if (ctx.departure) {
    const todayInd = out.find((x) => x.id === `${runId}#today`)!;
    todayInd.links = out
      .filter((x) => x.class === "money.deadline")
      .map((x) => ({ p: "p.today-fixes" as PropertyId, target: x.id }));
  }

  return { runId, skill: ctx.skillId, individuals: out };
}

/* ─────────────────────── 검증 ─────────────────────── */

export type ABoxCheckResult = {
  violations: string[];
  counts: { individuals: number; links: number };
};

const isSubclassOf = (a: ClassId, b: ClassId) => a === b || ancestors(a).includes(b);

const datatypeOk = (datatype: string, v: unknown): boolean => {
  if (datatype === "number") return typeof v === "number";
  if (datatype === "string[]") return Array.isArray(v) && v.every((x) => typeof x === "string");
  if (datatype === "string") return typeof v === "string";
  // Level · "5인이상 | ..." 같은 열거형은 문자열로 온다. 값 목록까지 좁히면
  // 데이터 속성 절이 T-Box 와 두 번 쓰이게 되므로 여기선 형식만 본다
  return typeof v === "string";
};

/**
 * 그래프를 T-Box 에 대조한다. 구조 검사와 공리 거울 검사를 나눠 돌린다.
 *
 * 공리 거울: T-Box 의 Axiom 은 추상 명제지만 개체 세계에서는 딱 세 모양으로 보인다.
 *   - disjointWith(수령불가, 금액) → 수준이 none 인 판정에 amount/range 선이 없어야 한다
 *   - disjointWith(적용제외국, 추정범위) → 적용제외국에서 갈라진 S2-3 판정에 범위가 없어야 한다
 *   - functional(d.level) → 판정마다 수준 값이 정확히 하나여야 한다
 */
export function validateABox(abox: ABox): ABoxCheckResult {
  const v: string[] = [];
  const say = (m: string) => v.push(`[${abox.runId}] ${m}`);

  const byId = new Map(abox.individuals.map((x) => [x.id, x]));
  let linkCount = 0;

  for (const ind of abox.individuals) {
    const cls = classById(ind.class);
    if (!cls) {
      say(`${ind.id}: 클래스 "${ind.class}" 가 T-Box 에 없다`);
      continue;
    }

    for (const [pid, val] of Object.entries(ind.values ?? {})) {
      const dp = DATA_PROPERTIES.find((d) => d.id === pid);
      if (!dp) {
        say(`${ind.id}: 데이터 속성 "${pid}" 가 T-Box 에 없다`);
        continue;
      }
      if (!isSubclassOf(ind.class, dp.domain))
        say(
          `${ind.id}: ${dp.id} 의 domain 은 "${dp.domain}" 인데 개체 클래스는 "${ind.class}" 다`,
        );
      if (!datatypeOk(dp.datatype, val))
        say(`${ind.id}: ${dp.id} (${dp.datatype}) 에 문자열/숫자가 아닌 값이 들어 있다`);
    }

    for (const l of ind.links ?? []) {
      linkCount++;
      const prop = OBJECT_PROPERTIES.find((p) => p.id === l.p);
      if (!prop) {
        say(`${ind.id}: 관계 "${l.p}" 가 T-Box 에 없다`);
        continue;
      }
      const target = byId.get(l.target);
      if (!target) {
        say(`${ind.id}: ${l.p} 대상 "${l.target}" 가 그래프에 없다`);
        continue;
      }
      if (!isSubclassOf(ind.class, prop.domain))
        say(
          `${ind.id}: ${l.p} 의 domain 은 "${prop.domain}" 인데 주체 클래스는 "${ind.class}" 다`,
        );
      if (!isSubclassOf(target.class, prop.range))
        say(
          `${l.target}: ${l.p} 의 range 는 "${prop.range}" 인데 대상 클래스는 "${target.class}" 다`,
        );
    }
  }

  /* 공리 거울 1 — disjointWith(verdict.level.none, money.amount) */
  for (const ind of abox.individuals) {
    if (!ind.links) continue;
    const 수령불가 = ind.links.some(
      (l) => l.p === "p.has-level" && byId.get(l.target)?.class === "verdict.level.none",
    );
    if (!수령불가) continue;
    const 돈 = (ind.links ?? []).filter(
      (l) => l.p === "p.has-amount" || l.p === "p.has-range",
    );
    if (돈.length)
      say(
        `${ind.id}: 수령불가 판정에 금액·범위 선이 ${돈.length}개 있다 — 공리「없는 돈」위반`,
      );
  }

  /* 공리 거울 2 — disjointWith(departure.nationality.excluded, money.range) */
  for (const nat of abox.individuals.filter(
    (x) => x.class === "departure.nationality.excluded",
  )) {
    for (const l of nat.links ?? []) {
      const pension = byId.get(l.target);
      const 범위있음 =
        pension &&
        ((pension.links ?? []).some((x) => x.p === "p.has-range") ||
          Object.keys(pension.values ?? {}).some((k) =>
            k.startsWith("d.range-"),
          ));
      if (l.p === "p.nationality-branches" && 범위있음)
        say(
          `${nat.id}: 적용제외국에서 갈라진 판정 ${l.target} 에 반환일시금 범위가 붙었다 — ` +
            `공리「존재하지 않는 돈」위반`,
        );
    }
  }

  /* 공리 거울 3 — functional(d.level): 판정에는 수준이 정확히 하나다.
     대상은 판정 개체뿐이다. 수준 개체 자신(verdict.level.*)은 여기서 제외한다 */
  for (const ind of abox.individuals.filter(
    (x) =>
      isSubclassOf(x.class, "verdict") && !isSubclassOf(x.class, "verdict.level"),
  )) {
    const levels = Object.keys(ind.values ?? {}).filter((k) => k === "d.level");
    if (levels.length !== 1)
      say(`${ind.id}: 판정의 수준 값이 ${levels.length}개다 — functional 위반`);
    const 수준선 = (ind.links ?? []).filter((l) => l.p === "p.has-level");
    if (수준선.length !== 1)
      say(`${ind.id}: p.has-level 선이 ${수준선.length}개다 — 판정마다 하나여야 한다`);
  }

  return {
    violations: v,
    counts: { individuals: abox.individuals.length, links: linkCount },
  };
}
