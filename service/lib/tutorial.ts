/**
 * 입장 튜토리얼 — 페이전트를 처음 눌렀을 때 다섯 장으로 페이체크를 소개한다.
 *
 * 원칙:
 *   - 짧게. 한 장에 요점 셋~넷. 자세한 것은 화면이 스스로 말한다(각 화면의 "읽는 법").
 *   - 사실은 여기 적지 않는다. 룰 개수·가드레일 이름 같은 숫자는 화면 컴포넌트가
 *     lib/skills·lib/harness 카탈로그에서 읽는다 — 손으로 적은 숫자는 낡는다.
 *   - 대사(bubble)는 페이전트가 한다. 캐릭터가 설명하는 형식이라 말투가 존댓말·짧은 문장.
 *   - 문구는 한국어다. 다른 언어는 app/_uiTranslator.tsx 가 화면에서 옮긴다.
 */

export type TutorialView = "user" | "monitor" | "agent-run" | "search";

export type TutorialStep = {
  id: "what" | "how" | "read" | "trust" | "around";
  /** 머리말(영문 소제목 — 콘솔의 Eyebrow 문법) */
  eyebrow: string;
  title: string;
  /** 페이전트 말풍선 한 줄 */
  bubble: string;
  /** 제목 아래 한 문장 */
  lead: string;
  /** 요점 — 각 줄은 "굵은 머리 — 설명" 두 조각 */
  points: { head: string; body: string }[];
  /** 카드 안 시각 요소 — 컴포넌트가 종류별로 그린다 */
  visual: "skills" | "steps" | "levels" | "guards" | "menu";
};

export const TUTORIAL: readonly TutorialStep[] = [
  {
    id: "what",
    eyebrow: "WHAT IS PAYCHECK",
    title: "페이체크는 무엇인가요?",
    bubble: "먼저 페이체크가 무엇인지 알려드릴게요.",
    lead: "월급명세서나 출국 상황을 2026년 법정 기준과 대조해, 잘못 떼인 돈과 출국할 때 받을 돈·마감일을 알려드려요.",
    points: [
      { head: "급여명세서 대조", body: "월급에서 무엇을 얼마나 떼갔는지, 법 기준과 맞는지 검사해요." },
      { head: "출국 정산", body: "고향에 돌아갈 때 받을 수 있는 돈과 그 마감일을 알려드려요." },
    ],
    visual: "skills",
  },
  {
    id: "how",
    eyebrow: "THREE STEPS",
    title: "세 걸음이면 끝나요",
    bubble: "사용법은 세 걸음이에요.",
    lead: "내 급여 확인하기 화면에서 아래 순서대로 진행하면 돼요.",
    points: [
      { head: "상황 입력", body: "국적·비자·입사일·출국일·월급, 다섯 칸이 전부예요. 이름·전화번호·계좌는 묻지 않아요." },
      { head: "판정 실행", body: "버튼 하나예요. 같은 입력이면 언제 눌러도 같은 결과가 나와요." },
      { head: "결과 확인", body: "받을 돈, 마감일, 다음에 할 일을 차례로 보여드려요. 내 언어로도 볼 수 있어요." },
    ],
    visual: "steps",
  },
  {
    id: "read",
    eyebrow: "READING RESULTS",
    title: "결과는 이렇게 읽어요",
    bubble: "결과 화면의 표식 네 개만 알면 돼요.",
    lead: "판정마다 표식과 수준 글자가 함께 붙어요. 색이 없어도 모양으로 구분돼요.",
    points: [
      { head: "확정과 추정은 다른 돈", body: "이미 떼인 돈은 확정, 기관 확인 뒤 정해질 돈은 추정이에요. 합쳐서 말하지 않아요." },
    ],
    visual: "levels",
  },
  {
    id: "trust",
    eyebrow: "WHY YOU CAN TRUST IT",
    title: "믿어도 되나요?",
    bubble: "금액 계산은 AI가 아니라 코드가 해요.",
    lead: "AI는 말을 알아듣고 번역하는 일만 하고, 돈과 날짜를 정하는 판정은 코드가 맡아요.",
    points: [
      { head: "판정은 코드", body: "같은 입력이면 영원히 같은 답이에요. AI가 숫자를 지어낼 자리가 없어요." },
      { head: "가드레일", body: "과장된 표현, 없는 돈, 개인정보가 답변에 섞이면 코드가 막아요." },
      { head: "근거 공개", body: "어떤 법령·문서를 기준으로 했는지, 확인이 끝났는지까지 화면에 그대로 보여요." },
      { head: "서버 저장 없음", body: "입력은 이 기기에서만 계산돼요. 번역을 쓸 때만 그 문장이 번역 서비스로 가요." },
    ],
    visual: "guards",
  },
  {
    id: "around",
    eyebrow: "GETTING AROUND",
    title: "저와 메뉴만 기억하세요",
    bubble: "저는 늘 화면 구석에 있을게요.",
    lead: "길을 잃으면 저를 누르세요. 지금 할 일과 진행 상황을 알려드려요.",
    points: [
      { head: "페이전트", body: "오른쪽 아래에 있어요. 누르면 다음 할 일을 알려드리고, 잡아서 옮길 수도 있어요." },
      { head: "왼쪽 메뉴", body: "급여 판정 › 시작하기가 출발점이에요. 법령·검증, 운영·관리는 나중에 봐도 돼요." },
    ],
    visual: "menu",
  },
] as const;

export function tutorialStep(i: number): TutorialStep {
  return TUTORIAL[Math.min(Math.max(i, 0), TUTORIAL.length - 1)];
}
