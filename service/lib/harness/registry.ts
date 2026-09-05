/**
 * Harness Registry — 각 하네스를 표준 manifest로 등록한다.
 *
 * 이 파일은 구성요소를 "참조"만 하고 업무 로직을 서로 공유시키지 않는다.
 * main/default 같은 alias 하네스는 만들지 않는다 — 하네스는 여기 등록된 것이 전부다.
 *
 * 에이전트·명령은 **실동작(live)과 확장 예정을 분리해서 등록한다.**
 * 예정을 실동작처럼 세면 그게 곧 과장이고, 기능명세서와 어긋난다.
 */

import { ruleCatalog } from "../rules/payslip.ts";
import { departureRuleCatalog } from "../rules/departure.ts";
import { registerHarness, type Manifest } from "./core.ts";
import {
  checkAllGuardrails,
  COMMON_FORBIDDEN_ASSERTIONS,
} from "./guardrails.ts";

const 공통고지 = [
  "이 결과는 법률 자문이 아니라 서류 대조 결과입니다.",
  "최종 판단과 신고 여부는 본인이 결정합니다.",
];

/** afterJudge — 판정 배열 전체를 가드레일에 통과시킨다 */
const guardrailHook = (payload: { findings?: unknown }, m: Manifest) =>
  checkAllGuardrails((payload.findings ?? []) as never, m);

export const payslipHarness = registerHarness({
  id: "payslip-audit",
  displayName: "급여명세서 점검",
  skillId: "payslip",
  routeBase: "/harness?skill=payslip",
  agents: [
    { id: "router", role: "입력한 말을 보고 어느 검사로 보낼지 정합니다", live: true },
    { id: "payslip-judge", role: "법정 기준과 대조해 판정합니다", live: true },
    { id: "payslip-extractor", role: "명세서 사진에서 값을 읽습니다 (AI 서비스를 연결하면 작동, 사진 인식은 준비 중)", live: false, gate: "env" },
    { id: "narrator", role: "판정을 모국어로 옮깁니다 (AI 서비스를 연결하면 작동)", live: false, gate: "env" },
  ],
  commands: [
    { id: "/payslip-run", label: "판정 실행", live: true },
    { id: "/run-selftest", label: "규칙 자체 점검", live: true },
    { id: "/export-json", label: "판정 원문 내보내기", live: true },
    { id: "/payslip-report", label: "사업주 제출용 문서 생성", live: false },
  ],
  ruleCatalog,
  hooks: {
    beforeJudge: [
      (p) => {
        const input = p.input as { earnings?: unknown[] } | undefined;
        return input?.earnings?.length ? null : "지급 항목이 비어 있습니다";
      },
    ],
    afterJudge: [guardrailHook],
    beforeNarrate: [
      (p) =>
        (p.findings ?? []).length
          ? null
          : "판정이 없는데 설명 단계로 넘어가려 합니다",
    ],
  },
  rules: {
    forbiddenAssertions: COMMON_FORBIDDEN_ASSERTIONS,
    requiredNotices: [
      ...공통고지,
      "고용노동부 상담 1350 (외국어 통역 지원)",
    ],
  },
  verification: {
    requiredHooks: ["beforeJudge", "afterJudge"],
    // S1 금액은 기준값과의 차이라 추정이 아니다.
    estimateRules: [],
    // golden/cases.json 의 payslip 케이스 수. 화면에 그대로 뜨므로 아래 테스트가 대조한다.
    goldenCases: 12,
  },
});

export const departureHarness = registerHarness({
  id: "departure-settlement",
  displayName: "출국 정산",
  skillId: "departure",
  routeBase: "/harness?skill=departure",
  agents: [
    { id: "router", role: "입력한 말을 보고 어느 검사로 보낼지 정합니다", live: true },
    { id: "departure-judge", role: "받을 돈 세 가지를 계산하고 마감일을 냅니다", live: true },
    { id: "departure-intake", role: "입력한 말에서 국적과 날짜를 뽑습니다 (AI 서비스를 연결하면 작동)", live: false, gate: "env" },
    { id: "narrator", role: "판정을 모국어로 옮깁니다 (AI 서비스를 연결하면 작동)", live: false, gate: "env" },
  ],
  commands: [
    { id: "/departure-run", label: "판정 실행", live: true },
    { id: "/run-selftest", label: "규칙 자체 점검", live: true },
    { id: "/export-json", label: "판정 원문 내보내기", live: true },
    { id: "/departure-checklist", label: "출국 체크리스트 발급", live: false },
  ],
  ruleCatalog: departureRuleCatalog,
  hooks: {
    beforeJudge: [
      (p) => {
        const i = p.input as
          | { hireDate?: string; departureDate?: string }
          | undefined;
        if (!i?.hireDate || !i?.departureDate) return "입사일·출국일이 필요합니다";
        return i.departureDate < i.hireDate
          ? "출국일이 입사일보다 빠릅니다"
          : null;
      },
    ],
    afterJudge: [guardrailHook],
    beforeNarrate: [
      (p) =>
        (p.findings ?? []).length
          ? null
          : "판정이 없는데 설명 단계로 넘어가려 합니다",
    ],
  },
  rules: {
    forbiddenAssertions: COMMON_FORBIDDEN_ASSERTIONS,
    requiredNotices: [
      ...공통고지,
      "금액은 추정입니다. 정확한 금액은 국민연금공단 1355 · 삼성화재 02-2261-8400에서 확인하세요.",
    ],
  },
  verification: {
    requiredHooks: ["beforeJudge", "afterJudge"],
    // 임금·근속으로 계산한 값이라 확정값이 아니다. 반드시 범위를 동반해야 한다.
    estimateRules: ["S2-1", "S2-3"],
    // golden/cases.json 의 departure 케이스 수. 화면에 그대로 뜨므로 아래 테스트가 대조한다.
    goldenCases: 16,
  },
});
