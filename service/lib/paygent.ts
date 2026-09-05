/**
 * 페이전트 퀘스트·골 엔진 — 결정적 순수 함수만.
 *
 * 말풍선과 골 판정은 LLM이 아니라 이 파일이 실제 앱 상태를 읽어 정한다.
 * 금액·기한·조문은 실제 판정 결과(findings)에서만 읽고, 없으면 말하지 않는다.
 * Math.random(), new Date() 금지 — 클릭 시퀀스는 카운터로 순환.
 *
 * 단일 출처: 골 목록은 이 파일에서만, 입장 씬 항목 나열은 app/_ui.tsx NAV에서만.
 */

export type PaygentView =
  | "user"
  | "monitor"
  | "agent-run"
  | "audit"
  | "artifacts"
  | "standards-map"
  | "skills"
  | "ontology"
  | "golden"
  | "org"
  | "queue"
  | "harness"
  | "search"
  | "scenarios"
  | "approvals"
  | "explain"
  | "entrance";

export type PaygentTab = "findings" | "answer" | "input" | "loop" | "evidence" | "verify";

export type PaygentState = {
  view: PaygentView;
  ran: boolean;
  findingsCount: number;
  hasDeadline: boolean;
  deadlineViewed: boolean;
  actionsViewed: boolean;
  agentResultExists: boolean;
  approvedAt: string | null;
  recordDownloaded: boolean;
  providerLive: boolean;
  // G1 전용 — 사용자 화면 다섯 칸 채움
  userFieldsFilled: boolean;
  // 보조 골
  evidenceViewed: boolean;
  goldenViewed: boolean;
};

export type GoalDest = { view: PaygentView; tab?: PaygentTab; label: string };

/**
 * 원터치 행동 서술자 — [다음 행동]을 누르면 페이전트가 대신 해 주는 것.
 *
 * 발견 — 2026-08-29: 예전 버튼은 화면 이동만 했다. 목적지가 이미 현재 화면이면
 * (G2의 dest=실행 모니터인데 이미 모니터에 있는 경우) 클릭이 no-op이라
 * "하나도 안 눌린다"로 느껴졌다. 실측: elementFromPoint는 버튼을 적중했고
 * 클릭 후 상태 변화가 0이었다. 그래서 이동이 아니라 **행동**을 서술한다.
 *
 * 경계(부작용 원칙): 해도 되는 것 = 이동·스크롤·포커스·하이라이트·순수 계산
 * 실행·본인 파일 다운로드. 안 되는 것 = 승인 대행·모델 호출 비용이 드는 버튼
 * 자동 클릭·외부 전송. paygent.test.ts가 이 집합을 강제한다.
 */
export type GoalAct =
  | { kind: "focus-user-input" }                 // 사용자 화면 이동 + 첫 칸 포커스
  | { kind: "run-judge" }                        // 실행 모니터 이동 + 판정 실행(순수 계산)
  | { kind: "scroll-user-step"; step: 4 | 5 } // 사용자 화면 걸음으로 스크롤 + 열람 플래그
  | { kind: "highlight-approval" }               // Agent 실행 이동 + 승인 패널 하이라이트 (승인은 사람)
  | { kind: "download-record" }                  // 상담 기록 다운로드 실행
  | { kind: "navigate" };                        // 화면 이동만 (보조 골)

export type Goal = {
  id: string;
  name: string;
  desc: string;
  chain: boolean;
  dest: GoalDest;
  /** 원터치 실행 — dest와 함께 페이지가 결정적으로 수행한다 */
  act: GoalAct;
  isDone: (s: PaygentState) => boolean;
  isLocked: (s: PaygentState) => boolean;
  lockReason?: string;
  // 진행 중 대사 — 금액·기한·조문 없이, 다음 행동 하나
  quest: string;
  // 완료 직후 대사 — 다음 골 이름을 끼워 쓸 수 있음
  doneQuest: (next?: Goal) => string;
};

const dest = (view: PaygentView, label: string, tab?: PaygentTab): GoalDest => ({ view, tab, label });

export const GOALS: readonly Goal[] = [
  {
    id: "G1",
    name: "상황 입력",
    desc: "내 급여 확인하기 화면의 다섯 칸을 채우세요. 이름과 전화번호는 묻지 않아요.",
    chain: true,
    dest: dest("user", "내 급여 확인하기"),
    act: { kind: "focus-user-input" },
    isDone: (s) => s.userFieldsFilled,
    isLocked: () => false,
    quest: "첫 걸음이에요. 내 급여 확인하기 화면에서 다섯 칸을 채워 주세요.",
    doneQuest: (n) => n ? `좋아요, 상황 입력 완료! 다음은 ${n.name}이에요.` : "좋아요, 상황 입력 완료!",
  },
  {
    id: "G2",
    name: "판정 실행",
    desc: "받을 돈을 확인하세요. 같은 입력이면 언제나 같은 결과예요.",
    chain: true,
    dest: dest("monitor", "판정 실행", "findings"),
    act: { kind: "run-judge" },
    isDone: (s) => s.ran && s.findingsCount > 0,
    isLocked: () => false,
    quest: "이제 판정 실행을 눌러 볼까요? 받을 돈을 확인해요.",
    doneQuest: (n) => n ? `판정 실행 완료! 다음은 ${n.name}이에요.` : "판정 실행 완료! 이제 마감일을 확인해요.",
  },
  {
    id: "G3",
    name: "마감 확인",
    desc: "마감일 목록을 확인하세요. 실제 판정에 있는 날짜만 알려드려요.",
    chain: true,
    dest: dest("user", "마감 확인", undefined),
    act: { kind: "scroll-user-step", step: 4 },
    isDone: (s) => s.hasDeadline && s.deadlineViewed,
    isLocked: () => false,
    quest: "마감 목록을 열어 마감일을 확인해 주세요.",
    doneQuest: (n) => n ? `마감 확인 완료! 다음은 ${n.name}이에요.` : "마감 확인 완료!",
  },
  {
    id: "G4",
    name: "다음 행동 확인",
    desc: "다음에 할 일과 연락처를 확인하세요. 어디에 무엇을 내면 되는지 알려드려요.",
    chain: true,
    dest: dest("user", "다음 행동", undefined),
    act: { kind: "scroll-user-step", step: 5 },
    isDone: (s) => s.actionsViewed,
    isLocked: () => false,
    quest: "다음 행동 걸음에서 연락처를 확인해 주세요.",
    doneQuest: (n) => n ? `다음 행동 확인 완료! 다음은 ${n.name}이에요.` : "다음 행동 확인 완료!",
  },
  {
    id: "G5",
    name: "상담사 승인",
    desc: "AI가 뽑은 값을 확인하고 승인하세요. 승인해야 판정으로 넘어가요.",
    chain: true,
    dest: dest("agent-run", "AI 상담 진행"),
    act: { kind: "highlight-approval" },
    isDone: (s) => !!s.approvedAt,
    isLocked: (s) => !s.agentResultExists,
    lockReason: "AI 상담을 실행하면 열려요",
    quest: "AI가 뽑은 값을 확인하고 승인해 주세요.",
    doneQuest: (n) => n ? `상담사 승인 완료! 다음은 ${n.name}이에요.` : "상담사 승인 완료! 이제 기록을 남겨요.",
  },
  {
    id: "G6",
    name: "기록 보관",
    desc: "상담 기록 파일을 내려받으세요. 서버에는 남지 않아요.",
    chain: true,
    dest: dest("agent-run", "기록 보관"),
    act: { kind: "download-record" },
    isDone: (s) => s.recordDownloaded,
    isLocked: (s) => !s.agentResultExists || !s.approvedAt,
    lockReason: "AI 상담을 실행하고 승인하면 열려요",
    quest: "상담 기록을 파일로 내려받아 보관해 주세요.",
    doneQuest: () => "기록 보관 완료! 모든 단계를 마쳤어요.",
  },
  // 보조 골 — 체인 밖, 상시 진행 가능
  {
    id: "B2",
    name: "근거 문서 확인",
    desc: "근거 문서를 열어 기준을 확인하세요.",
    chain: false,
    dest: dest("search", "법 조문 찾기"),
    act: { kind: "navigate" },
    isDone: (s) => s.evidenceViewed,
    isLocked: () => false,
    quest: "법 조문 찾기에서 기준 문서를 열어 보세요.",
    doneQuest: () => "근거 문서 확인 완료!",
  },
  {
    id: "B3",
    name: "정확도 검증 확인",
    desc: "정확도 검증 결과 화면을 열어 보세요. 모든 사례가 통과 중인지 볼 수 있어요.",
    chain: false,
    dest: dest("golden", "정확도 검증 결과"),
    act: { kind: "navigate" },
    isDone: (s) => s.goldenViewed,
    isLocked: () => false,
    quest: "정확도 검증 결과 화면에서 검증을 확인해 보세요.",
    doneQuest: () => "정확도 검증 확인 완료!",
  },
] as const;

export const CHAIN = GOALS.filter((g) => g.chain);
export const AUX = GOALS.filter((g) => !g.chain);

export function goalById(id: string): Goal | undefined {
  return GOALS.find((g) => g.id === id);
}

export type QuestResult = {
  goal: Goal;
  quest: string;
  dest: GoalDest;
  progress: { done: number; total: number };
  /** 잠긴 골 안내인가 — 해금 경로로 데려가는 퀘스트. 완료를 재촉하는 게 아니다 */
  locked?: boolean;
};

export function doneCount(state: PaygentState): number {
  return CHAIN.filter((g) => !g.isLocked(state) && g.isDone(state) || g.isDone(state)).filter((g) => g.isDone(state)).length;
  // 실제는 isDone만 센다 — 잠김과 무관
}

export function progress(state: PaygentState): { done: number; total: number } {
  const done = CHAIN.filter((g) => g.isDone(state)).length;
  return { done, total: CHAIN.length };
}

export function nextQuest(state: PaygentState): QuestResult | null {
  const prog = progress(state);
  // 잠기지 않은 미완료 중 체인 순서 첫 번째
  const idx = CHAIN.findIndex((g) => !g.isLocked(state) && !g.isDone(state));
  if (idx === -1) {
    const allDone = CHAIN.every((g) => g.isDone(state));
    if (allDone) return null;
    /*
     * 남은 골이 전부 잠김 — 예전에는 여기서 null을 돌려줘 말풍선이 통째로
     * 사라졌다 (발견 2026-08-29: G4까지 자동 완료되자 안내가 가장 필요한
     * 순간에 페이전트가 침묵했다). 이제 잠긴 첫 골을 해금 경로 안내로 돌려준다 —
     * 완료를 재촉하는 게 아니라 "어디로 가면 열리는지"를 말한다.
     */
    const lockedGoal = CHAIN.find((g) => !g.isDone(state));
    if (!lockedGoal) return null;
    return {
      goal: lockedGoal,
      quest: `${lockedGoal.name} 단계는 아직 열리지 않았어요. ${lockedGoal.lockReason ?? "앞 단계를 먼저 마쳐요"}. 그곳으로 데려다드릴게요.`,
      dest: lockedGoal.dest,
      progress: prog,
      locked: true,
    };
  }
  const goal = CHAIN[idx];
  return {
    goal,
    quest: goal.quest,
    dest: goal.dest,
    progress: prog,
  };
}

export function celebrationMessage(achieved: Goal, next: Goal | null): string {
  if (next) return `${achieved.name} 완료! 다음은 ${next.name}이에요.`;
  return `${achieved.name} 완료!`;
}

// 골 보드용 상태 — 각 골의 표시 형태
export type BoardRow = {
  id: string;
  name: string;
  done: boolean;
  locked: boolean;
  lockReason?: string;
  mark: "✓" | "○" | "🔒";
  dest: GoalDest;
};

export function boardRows(state: PaygentState): BoardRow[] {
  return GOALS.map((g) => {
    const done = g.isDone(state);
    const locked = !done && g.isLocked(state);
    const mark: BoardRow["mark"] = done ? "✓" : locked ? "🔒" : "○";
    return {
      id: g.id,
      name: g.name,
      done,
      locked,
      lockReason: locked ? g.lockReason : undefined,
      mark,
      dest: g.dest,
    };
  });
}

export function progressBar(done: number, total: number): string {
  const filled = "▮".repeat(done);
  const empty = "▯".repeat(Math.max(0, total - done));
  return `${filled}${empty} ${done}/${total}`;
}

// 기존 진입 — 입장 씬에서 쓰는 단일 출처 어댑터
export const NAV_DESC: Record<string, string> = {
  user: "근로자용 5걸음 — 입력부터 다음 할 일까지 한 화면",
  monitor: "판정 흐름 — 판정·답변·입력·루프·근거·검증을 한 곳에서",
  "agent-run": "Agent가 라우팅·추출하고 코드는 판정 — 승인 게이트 포함",
  audit: "감사 원장 — 이 세션의 판정·가드 통과 기록",
  artifacts: "산출물 — 판정 JSON을 그대로 내려받기",
  "standards-map": "법정 기준 문서와 2026 상수 — 근거가 살아 있는지",
  skills: "판정 스킬 — 룰 목록과 검사하지 않는 것",
  ontology: "온톨로지 — 개념·관계·공리와 실행 개체 그래프",
  golden: "골든셋 32 — 기대값과 대조, 화면에서도 같은 체커",
  org: "AI 조직도 — 누가 무엇을 결정하고 무엇을 결정하지 못하는지",
  queue: "상담 큐 — 합성 픽스처로 전 과정 재현",
  harness: "하네스 — 스킬·명령·훅·규칙이 묶인 운영 계약",
  search: "근거/조문 검색 — 상황어로 조문 찾기",
  explain: "판단 해설 — 왜 모델에 판정을 맡기지 않는지",
  scenarios: "시나리오 추천 — 기준일을 옮겨 경계를 누르기",
  approvals: "담당자/승인 권한 — 아직 없는 것과 이유",
};

export function initialState(overrides: Partial<PaygentState> = {}): PaygentState {
  return {
    view: "monitor",
    ran: false,
    findingsCount: 0,
    hasDeadline: false,
    deadlineViewed: false,
    actionsViewed: false,
    agentResultExists: false,
    approvedAt: null,
    recordDownloaded: false,
    providerLive: false,
    userFieldsFilled: false,
    evidenceViewed: false,
    goldenViewed: false,
    ...overrides,
  };
}
