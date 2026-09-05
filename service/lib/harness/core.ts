/**
 * Harness Core — 하네스 표준 계층 (공유 엔진, 업무 로직 없음).
 *
 * JByond(JB금융 Fin:AI Challenge)의 하네스 구조를 이 도메인으로 옮긴 것이다.
 * 하네스는 화면 묶음이 아니라 **Skills + Commands + Hooks + Rules + Guardrails +
 * Verification이 연결된 운영 프레임워크**다.
 *
 * 이 파일이 제공하는 것은 엔진뿐이다:
 *   - manifest 등록·조회
 *   - hook 실행기 + 위반 로그
 *   - 자체검증 실행기
 *
 * 금지: 여기에 특정 스킬의 업무 상수·판정 로직을 넣지 않는다.
 *       (그 규율이 lib/rules/ ↔ lib/ai/ 단방향 의존과 같은 이유로 필요하다)
 */

import type { Finding } from "../rules/types.ts";
import type { SkillId } from "../skills.ts";

export type HarnessId = "payslip-audit" | "departure-settlement";

/** 실행 지점 가드. 위반은 차단하거나 안전 강등하고 반드시 기록한다. */
export type HookName = "beforeJudge" | "afterJudge" | "beforeNarrate";

export type HookHandler = (
  payload: HookPayload,
  manifest: Manifest,
) => string[] | string | null;

export type HookPayload = {
  input?: unknown;
  findings?: Finding[];
  language?: string;
};

/** 확정 표현 금지 규칙 */
export type AssertionRule = { label: string; re: RegExp };

/**
 * 에이전트 등록.
 * 실동작과 확장 예정을 반드시 분리한다 — 예정을 실동작처럼 세면 그게 곧 과장이다.
 * gate: "env"는 구현은 됐으나 환경변수(ANTHROPIC_API_KEY/Ollama)가 있을 때만 실동작인 경우.
 * 화면은 ●(실동작) / ◐(구현됨·대기) / ○(로드맵)으로 구분해 정직하게 그린다.
 */
export type AgentSpec = {
  id: string;
  role: string;
  live: boolean;
  gate?: "env";
};

export type CommandSpec = {
  id: string;
  label: string;
  /** 이 명령이 실제로 동작하는가 */
  live: boolean;
};

export type Manifest = {
  id: HarnessId;
  displayName: string;
  skillId: SkillId;
  routeBase: string;
  agents: AgentSpec[];
  commands: CommandSpec[];
  ruleCatalog: readonly { rule: string; name: string }[];
  hooks: Partial<Record<HookName, HookHandler[]>>;
  rules: {
    /** 이 표현을 쓰면 안 되는 판정 수준이 있다 */
    forbiddenAssertions: AssertionRule[];
    /** 결과에 반드시 붙어야 하는 고지 */
    requiredNotices: string[];
  };
  verification: {
    requiredHooks: HookName[];
    /** 금액이 추정인 룰 — 반드시 범위를 동반해야 한다 */
    estimateRules: string[];
    /** 단위 테스트 골든셋 건수 */
    goldenCases: number;
  };
};

const MANIFEST_REQUIRED_KEYS: (keyof Manifest)[] = [
  "id", "displayName", "skillId", "routeBase", "agents", "commands",
  "ruleCatalog", "hooks", "rules", "verification",
];

/* ─────────────────────────────── 저장소 ─────────────────────────────── */

export type HookLogEntry = {
  harnessId: HarnessId;
  hook: HookName;
  violations: string[];
  seq: number;
};

const store = {
  manifests: {} as Record<string, Manifest>,
  hookLog: [] as HookLogEntry[],
  seq: 0,
};

export function registerHarness(m: Manifest): Manifest {
  if (!m || !m.id) throw new Error("harness manifest requires id");
  store.manifests[m.id] = m;
  return m;
}

export const getHarness = (id: HarnessId) => store.manifests[id] ?? null;
export const listHarnesses = () => Object.values(store.manifests);
export const harnessBySkill = (skillId: SkillId) =>
  listHarnesses().find((m) => m.skillId === skillId) ?? null;

export const hookLog = () => store.hookLog.slice();
export const clearHookLog = () => {
  store.hookLog = [];
  store.seq = 0;
};

/**
 * hook 실행기 — 등록된 handler를 순서대로 돌리고 위반을 모은다.
 *
 * 로그에 순번(seq)을 쓰고 시각을 쓰지 않는다. 시각을 넣으면 같은 입력에 다른 로그가
 * 남아 재현성이 깨진다 — 심사자가 두 번 눌러 같은 결과를 봐야 한다.
 */
export function runHooks(
  harnessId: HarnessId,
  hook: HookName,
  payload: HookPayload,
): { ok: boolean; violations: string[] } {
  const manifest = getHarness(harnessId);
  const handlers = manifest?.hooks?.[hook] ?? [];
  const violations: string[] = [];

  for (const handler of handlers) {
    try {
      const r = handler(payload, manifest!);
      if (Array.isArray(r)) violations.push(...r.filter(Boolean));
      else if (r) violations.push(String(r));
    } catch (e) {
      violations.push(`hook 실행 오류(${hook}): ${(e as Error).message}`);
    }
  }

  store.hookLog.unshift({
    harnessId,
    hook,
    violations,
    seq: ++store.seq,
  });
  if (store.hookLog.length > 200) store.hookLog.length = 200;

  return { ok: violations.length === 0, violations };
}

/* ─────────────────────────────── 자체검증 ─────────────────────────────── */

export type Issue = { check: string; detail: string };

export type SelfTestResult = {
  harnessId: HarnessId;
  passed: number;
  issues: Issue[];
};

/**
 * manifest 무결성 + hook 커버리지 + 에이전트 정합성.
 *
 * 판정 결과에 대한 가드레일 검사는 guardrails.ts가 맡는다. 여기서는
 * "하네스가 계약대로 구성되었는가"만 본다.
 */
export function runSelfTest(id: HarnessId): SelfTestResult {
  const m = getHarness(id);
  const issues: Issue[] = [];
  let passed = 0;

  if (!m) {
    return {
      harnessId: id,
      passed: 0,
      issues: [{ check: "manifest 등록", detail: `${id} 하네스가 등록되지 않았습니다` }],
    };
  }

  const missing = MANIFEST_REQUIRED_KEYS.filter((k) => m[k] === undefined);
  if (missing.length) issues.push({ check: "manifest 무결성", detail: `누락 키: ${missing.join(", ")}` });
  else passed++;

  const uncovered = m.verification.requiredHooks.filter(
    (h) => !(m.hooks[h]?.length),
  );
  if (uncovered.length) issues.push({ check: "hook 커버리지", detail: `핸들러 없음: ${uncovered.join(", ")}` });
  else passed++;

  if (m.agents.some((a) => a.live)) passed++;
  else issues.push({ check: "에이전트 정합성", detail: "실동작 에이전트가 하나도 없습니다" });

  if (m.ruleCatalog.length) passed++;
  else issues.push({ check: "룰 카탈로그", detail: "등록된 룰이 없습니다" });

  if (m.rules.requiredNotices.length) passed++;
  else issues.push({ check: "필수 고지", detail: "법률자문 아님 고지가 등록되지 않았습니다" });

  // 추정 룰이 카탈로그에 실재하는가 (오타로 가드레일이 무력화되는 것을 막는다)
  const codes = new Set(m.ruleCatalog.map((r) => r.rule));
  const ghosts = m.verification.estimateRules.filter((r) => !codes.has(r));
  if (ghosts.length) issues.push({ check: "추정 룰 참조", detail: `카탈로그에 없는 룰: ${ghosts.join(", ")}` });
  else passed++;

  return { harnessId: id, passed, issues };
}
