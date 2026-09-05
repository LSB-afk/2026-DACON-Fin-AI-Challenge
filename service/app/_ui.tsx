"use client";

import { useSyncExternalStore } from "react";

/** 하네스 콘솔의 UI 조각. 상태를 갖지 않는다 — 전부 props로 받는다. */

import type { Case } from "@/lib/cases";
import type { Standard } from "@/lib/standards";
import type { Finding, Level } from "@/lib/rules/types";

/* ── 아이콘: 의존성 없이 path 문자열 하나씩 ── */

export const PATHS: Record<string, string> = {
  monitor: "M3 5h18v11H3z M8 20h8M12 16v4",
  audit: "M5 3h9l5 5v13H5z M14 3v5h5",
  output: "M4 8h16v12H4z M4 8l2-4h12l2 4M10 12h4",
  map: "M9 4 3 7v13l6-3 6 3 6-3V4l-6 3z M9 4v13M15 7v13",
  skill: "M12 3l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7z",
  queue: "M4 6h16M4 12h16M4 18h10",
  harness: "M10 3h4M11 3v6l-5 9a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3l-5-9V3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.2-4.2",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M17 7a3 3 0 1 1 0 6",
  book: "M4 4h7v16H4z M13 4h7v16h-7z",
  /* 온톨로지 — 개체 둘과 그 사이의 관계 선 */
  ontology: "M4 4h7v7H4z M13 13h7v7h-7z M11 11l2 2 M7.5 11v2h5.5",
  /* 조직도 — 위 하나, 아래 둘, 연결선 */
  org: "M9 3h6v5H9z M3 16h5v5H3z M16 16h5v5h-5z M12 8v3M5.5 16v-3h13v3M5.5 13v3M18.5 13v3",
  /* 시나리오 — 이정표 갈래 */
  scenario: "M6 3v12M6 3h9l3 3-3 3H6M6 15h6l3 3-3 3H6",
  /* 승인 — 도장 찍힌 서류 */
  approval: "M5 3h9l5 5v13H5z M14 3v5h5M9 14l2 2 4-4",
  /* Agent 실행 — 말풍선 + 톱니 */
  agent: "M7 4h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-2l-2 2-2-2H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M9 10h6M9 13h6",
  /* 칩 — 가상 상담 예시 */
  chip: "M8 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M10 9h4M10 12h2",
  /* 시계 — 기준일 */
  clock: "M12 6v6l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  /* 막힘 — 차단 */
  block: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6M15 9l-6 6",
  /* 체크 — 완료 */
  check: "M5 12l4 4 10-10",
  /* 대기 — 모래시계 */
  wait: "M6 3h12M8 3v2a4 4 0 0 0 2 3.5A4 4 0 0 0 8 12v2h8v-2a4 4 0 0 0-2-3.5A4 4 0 0 0 16 5V3",
  /* 미연결 — 끊긴 선 */
  disconnect: "M4 12h6M14 12h6M8 8a4 4 0 0 1 8 0M4 16a8 8 0 0 1 16 0",

  /*
   * ── AI 조직도 — 아이콘은 역할을 말하고, ●◐○ 표식은 상태를 말한다 ──
   * 두 문법을 섞지 마라: 아이콘 색으로 상태까지 말하게 하면 색약·흑백에서
   * 역할과 상태가 한 덩어리로 뭉개진다. 상태는 표식(형태)이 이미 지고 있다.
   */
  /* 되묻기 — 말풍선 속 물음표 */
  ask: "M4 4h16v12h-9l-4 4v-4H4z M10.8 9.3a1.9 1.9 0 1 1 2.7 1.9c-.8.3-1.2.8-1.2 1.5 M12.3 14.8h.01",
  /* LLM — CPU 칩 */
  cpu: "M8 8h8v8H8z M5 10h3M5 14h3M16 10h3M16 14h3M10 5v3M14 5v3M10 16v3M14 16v3",
  /* 추출 — 깔때기 */
  funnel: "M4 5h16l-6 7v6l-4 2v-8z",
  /* 발화 — 따옴표 */
  quote: "M6 7h4v4H7.5A1.5 1.5 0 0 0 6 12.5V14 M14 7h4v4h-2.5a1.5 1.5 0 0 0-1.5 1.5V14",
  /* 비전 — 카메라 */
  camera: "M4 8h4l2-2h4l2 2h4v10H4z M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  /* 판정 — 저울 */
  scale: "M12 4v16 M6 7h12 M6 7l-3 6a3 3 0 0 0 6 0z M18 7l-3 6a3 3 0 0 0 6 0z M9 20h6",
  /* 급여 계산 — 계산기 */
  calc: "M6 3h12v18H6z M9 6h6 M9 11h.01M12 11h.01M15 11h.01M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01",
  /* 출국 — 종이비행기 */
  plane: "M21 3 3 10.5l7.5 3L13.5 21z M10.5 13.5 21 3",
  /* 상수실 — 다이얼 금고 */
  vault: "M4 5h16v14H4z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 9V7.5M12 16.5V15M9 12H7.5M16.5 12H15",
  /* 설명 — 말풍선과 문장 */
  speech: "M4 4h16v12h-9l-4 4v-4H4z M8 8h8 M8 11.5h5",
  /* 번역 — 마주 보는 말풍선 둘 */
  translate: "M3 4h10v8H8l-3 3v-3H3z M11 12h10v8h-3l-3 3v-3h-4z",
  /* 가드레일 — 방패와 체크 */
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  /* 골든셋 — 과녁 */
  target: "M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  /* PII — 자물쇠 */
  lock: "M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3 M12 14.5V17",
  /* 대비 — 반쪽 빗금 원 */
  contrast: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M12 3v18 M12 7.5l4.6 4.6 M12 12l4.6 4.6",
  /* 홈 — 지붕 있는 집. 입장 씬에서 콘솔로 들어가는 문 */
  home: "M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10",
};

export const Icon = ({ name, cls = "" }: { name: string; cls?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`h-4 w-4 shrink-0 ${cls}`}
    aria-hidden
  >
    <path d={PATHS[name]} />
  </svg>
);

/**
 * 좁은 화면인가 — 미디어쿼리 구독의 표준형.
 *
 * 예전에는 세 파일(page·_flow·_diagrams)이 같은 훅을 복제해 각자
 * "이펙트 안 동기 setState"로 초기값을 맞췄다. lint 가 그 여덟 자리를 전부
 * 계단식 렌더 위험으로 잡았고, 맞는 지적이다 — 외부 상태 구독은
 * useSyncExternalStore 가 표준이다. 서버 스냅샷은 false(데스크톱으로 그리고
 * 클라이언트에서 바로잡는 기존 정책 그대로 — 창 크기는 서버에 없다).
 */
export function useNarrow(maxWidth: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(max-width: ${maxWidth - 1}px)`).matches,
    () => false,
  );
}

/* ── 공통 원자 ── */

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="eyebrow">{children}</span>
);

export type PillTone = "muted" | "accent" | "warn" | "ok" | "bad" | "good" | "violet" | "teal";

/**
 * 상담 사례 배지 → 색. 여섯 종류가 전부 파랑이면 "다 비슷한 주제"로 읽힌다(2026-09-02).
 * 뜻이 있는 색은 뜻대로: 기한 임박=경고(주황), 시효 확인=나쁨(빨강 — 지나면 못 받는다).
 * 뜻 없는 종류 구분은 전용 색: 국적 분기=파랑, 산재 공제=보라, 최저임금=청록.
 * 라우팅 실패는 회색 — 판정이 아니라 되묻기다. 모르는 배지도 회색.
 */
export function badgeTone(badge: string): PillTone {
  const m: Record<string, PillTone> = {
    "기한 임박": "warn",
    "시효 확인": "bad",
    "국적 분기": "accent",
    "산재 공제": "violet",
    최저임금: "teal",
    "라우팅 실패": "muted",
  };
  return m[badge] ?? "muted";
}

export const Pill = ({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) => {
  /*
   * 옅은 면 위 글자는 본색이 아니라 *-ink 를 쓴다. 실측(scripts/contrast.mjs 와 같은 계산):
   * --accent 는 흰 바탕에서 5.31:1 이지만 --accent-tint 위에서는 4.84:1 로 내려온다.
   * --accent-ink 로 바꾸면 6.00:1 이다. 이 알약 글자는 12px(text-2xs)라 여유를 남겨 둔다.
   */
  const tones = {
    muted: "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
    accent:
      "border-[var(--accent-tint-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]",
    warn: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    ok: "border-[var(--accent-tint-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]",
    bad: "border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad-ink)]",
    good: "border-[var(--good)] bg-[var(--good-soft)] text-[var(--good-ink)]",
    violet: "border-[var(--violet)] bg-[var(--violet-soft)] text-[var(--violet-ink)]",
    teal: "border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal-ink)]",
  };
  return (
    <span
      className={`shrink-0 rounded-[var(--radius-pill)] border px-2 py-0.5 text-2xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

/**
 * 문장마다 줄을 바꿔 그린다 — 화면 제목 아래 설명문용.
 *
 * 설명문을 폭 캡(max-w) 하나로 흘리면 문장 한가운데서 줄이 꺾여 "이상하게 끊긴" 글이
 * 된다(2026-09-02 지적). 문장이 곧 줄이면 어느 폭에서도 읽는 단위가 유지된다.
 * 나누는 기준은 마침표·물음표·느낌표 뒤의 공백. 대시(—)나 쉼표에서는 나누지 않는다.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const Sentences = ({ text, className = "" }: { text: string; className?: string }) => (
  <p className={className}>
    {splitSentences(text).map((s, i) => (
      <span key={i} className="block">
        {s}
      </span>
    ))}
  </p>
);

export const SectionHead = ({
  en,
  ko,
  right,
  as: H = "h2",
}: {
  en: string;
  ko: string;
  right?: React.ReactNode;
  /**
   * 제목 태그. 머리말 컴포넌트가 h2 를 강제하면 문서 구조상 h1 이어야 하는 자리
   * (좌측 메뉴로 통째로 바뀌는 화면의 첫 제목)와 h3 이어야 하는 자리에서 서열이 끊긴다.
   * 스크린리더는 제목 목록으로 화면을 훑는데, 서열이 끊기면 그 목록이 실제 구조와
   * 다르게 읽힌다. 기본값은 지금 쓰이는 h2 그대로라 부르는 쪽을 고치지 않아도 된다.
   */
  as?: "h1" | "h2" | "h3";
}) => (
  <div className="flex items-end justify-between">
    <div>
      <Eyebrow>{en}</Eyebrow>
      <H className="mt-0.5 text-xl font-bold tracking-tight">{ko}</H>
    </div>
    {right}
  </div>
);

/**
 * 소제목 — 화면 안에서 단원이 바뀌는 자리.
 *
 * 예전에는 `mt-8 text-sm font-semibold` 문단이 소제목 노릇을 했는데, 본문과 같은
 * 크기·비슷한 굵기라 스크롤 중에 단원 경계가 보이지 않았다. 굵은 괘선(--line-strong)을
 * 위에 긋고 글자를 한 단계 키운다 — 경계는 색이 아니라 선과 굵기가 말한다.
 */
export const SubHead = ({
  children,
  desc,
  right,
}: {
  children: React.ReactNode;
  desc?: string;
  right?: React.ReactNode;
}) => (
  <div className="mt-10 border-t-2 border-[var(--line-strong)] pt-4">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-base font-bold tracking-tight">{children}</h3>
      {right}
    </div>
    {/* 문장마다 줄바꿈 — 폭 캡 한가운데서 꺾이지 않게 (제목 설명과 같은 규칙) */}
    {desc && <Sentences text={desc} className="mt-1 max-w-5xl text-xs leading-relaxed text-[var(--muted)]" />}
  </div>
);

/**
 * 본문 탭.
 *
 * 한 화면에 입력·루프·판정·근거·검증을 한꺼번에 쌓으면 스크롤이 길어지고 읽는
 * 사람이 지친다. 한 번에 하나만 보여주고 나머지는 개수만 배지로 알린다.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: T; label: string; count?: number | string; icon?: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const iconFor = (id: string) => {
    const m: Record<string, string> = {
      findings: "check",
      answer: "chip",
      input: "book",
      loop: "harness",
      evidence: "search",
      verify: "block",
    };
    return m[id] ?? "chip";
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const on = t.id === active;
        const ic = (t as { icon?: string }).icon ?? iconFor(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              on
                ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-white"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"
            }`}
          >
            <Icon name={ic} cls={`h-3.5 w-3.5 ${on ? "text-white" : "text-[var(--accent)]"}`} />
            {t.label}
            {t.count !== undefined && (
              <span
                className={`text-xs ${on ? "text-white/75" : "text-[var(--muted-soft)]"}`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 패널 접기 버튼 — 아이콘만, 폭을 먹지 않는다 */
export const PanelToggle = ({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    onClick={onClick}
    title={`${label} ${open ? "접기" : "펼치기"}`}
    aria-expanded={open}
    className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
  >
    <span className="text-xs leading-none">{open ? "⟩" : "⟨"}</span>
  </button>
);

export const EmptyBox = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center text-sm text-[var(--muted)]">
    {children}
  </div>
);

/* ── 좌측 내비게이션 ── */

export type ViewId =
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
  | "explain";

type NavItem = {
  id: ViewId;
  icon: string;
  /** 메뉴에 보이는 이름 — 사용자 말로. "무엇을 볼 수 있는가"가 이름이다 */
  label: string;
  /** 운영자·심사자용 원래 이름(기술 용어). 툴팁으로만 남긴다 — 화면 제목과의 다리 */
  tech?: string;
  /** 실제로 열리는가. 열리지 않는 항목은 누를 수 없게 두고 이유를 붙인다 */
  live: boolean;
  countKey?: "queue" | "evidence" | "runs";
};

/*
 * ── 메뉴 3단 — 대분류 › 중분류 › 화면 ──
 *
 * 16개 화면을 한 열에 세로로 늘어놓으면 처음 온 사람은 어디를 눌러야 할지 모른다.
 * 대분류 셋(판정 업무 · 기준·검증 · 운영·관리)으로 나누고, 그 안을 중분류로 한 번 더
 * 묶는다. 대분류는 접힌다 — 현재 화면이 든 대분류만 펼쳐진 채로 시작해, 한 번에
 * 보이는 화면 수를 16에서 3~5로 줄인다. 화면 id·아이콘·이름은 그대로다(NAV_DESC·
 * 감사 스크립트가 이름으로 찾는다).
 */
export type NavSub = { title: string; items: NavItem[] };
export type NavGroup = {
  id: "work" | "standards" | "ops";
  title: string;
  icon: string;
  subs: NavSub[];
};

/*
 * 이름 규칙 (2026-09-02): "판정 스킬·골든셋·상담 큐" 같은 내부 용어는 만든 사람에게만
 * 읽힌다. 메뉴 이름은 사용자가 그 화면에서 **무엇을 하는가/보는가**로 적고, 원래
 * 용어는 tech 로 툴팁에만 남긴다. 화면 안쪽 제목은 그대로다 — 메뉴는 문이고 제목은
 * 방 이름이라, 문패가 쉬워지면 된다.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "work",
    title: "급여 판정",
    icon: "scale",
    subs: [
      {
        title: "시작하기",
        items: [
          /* 순서 (2026-09-03): 확인 → 상담 → 결과. 근로자가 밟는 차례대로다 */
          { id: "user", icon: "users", label: "내 급여 확인하기", tech: "사용자 화면 — 근로자용", live: true },
          { id: "agent-run", icon: "agent", label: "AI 상담 진행", tech: "Agent 실행", live: true },
          { id: "monitor", icon: "monitor", label: "판정 결과 보기", tech: "실행 모니터", live: true },
        ],
      },
      {
        title: "내 기록",
        items: [
          { id: "audit", icon: "audit", label: "판정 이력", tech: "감사 기록", live: true, countKey: "runs" },
          { id: "artifacts", icon: "output", label: "결과 파일 내려받기", tech: "산출물", live: true },
        ],
      },
    ],
  },
  {
    id: "standards",
    title: "법령·검증",
    icon: "book",
    subs: [
      {
        title: "법령·기준",
        items: [
          { id: "standards-map", icon: "map", label: "적용 법령·기준", tech: "기준 적합성 맵", live: true },
          { id: "search", icon: "search", label: "법 조문 찾기", tech: "근거/조문 검색", live: true },
        ],
      },
      {
        title: "신뢰성 확인",
        items: [
          { id: "skills", icon: "skill", label: "검사 항목 안내", tech: "판정 스킬", live: true },
          { id: "golden", icon: "target", label: "정확도 검증 결과", tech: "골든셋 평가", live: true },
          { id: "ontology", icon: "ontology", label: "용어·관계 사전 (온톨로지)", tech: "온톨로지 T-Box·A-Box", live: true },
        ],
      },
    ],
  },
  {
    id: "ops",
    title: "운영·관리",
    icon: "harness",
    subs: [
      {
        title: "상담 관리",
        items: [
          { id: "queue", icon: "queue", label: "상담 사례 목록", tech: "상담 큐", live: true, countKey: "queue" },
          { id: "scenarios", icon: "scenario", label: "상황별 예시", tech: "시나리오 추천 큐", live: true },
          { id: "approvals", icon: "approval", label: "담당자·승인 안내", tech: "담당자/승인 권한", live: true },
        ],
      },
      {
        title: "작동 원리",
        items: [
          { id: "harness", icon: "harness", label: "AI 작동 규칙", tech: "금융정착 Agent 하네스", live: true },
          { id: "org", icon: "org", label: "AI 역할 조직도", tech: "부서·스킬·승인 체계", live: true },
          { id: "explain", icon: "book", label: "판정 방식 설명", tech: "판단 해설", live: true },
        ],
      },
    ],
  },
];

/** 평면 목록 — 입장 씬 카드·검색 등 순서만 필요한 자리용. 대분류 순서 그대로다 */
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.subs.flatMap((s) => s.items));

export type NavGroupId = NavGroup["id"];

/**
 * 화면 제목은 메뉴 이름에서 온다 — 메뉴를 고쳤는데 제목이 옛 이름으로 남던 사고(2026-09-02)의
 * 재발 방지. 문패와 방 이름이 한 곳(NAV_GROUPS)에서 나오면 어긋날 수 없다.
 */
export function navLabel(view: ViewId): string {
  return NAV.find((i) => i.id === view)?.label ?? view;
}

/** 어떤 화면이 어느 대분류에 드는가 */
export function navGroupOf(view: ViewId): NavGroupId {
  return NAV_GROUPS.find((g) => g.subs.some((s) => s.items.some((i) => i.id === view)))?.id ?? "work";
}

export type NavCounts = { queue: number; evidence: number; runs: number };

const NavRow = ({
  item,
  active,
  counts,
  onSelect,
  mini,
}: {
  item: NavItem;
  active: boolean;
  counts: NavCounts;
  onSelect: (id: ViewId) => void;
  mini?: boolean;
}) => (
  <button
    type="button"
    disabled={!item.live}
    onClick={() => item.live && onSelect(item.id)}
    title={
      item.live
        ? mini
          ? item.tech ? `${item.label} (${item.tech})` : item.label
          : item.tech
        : "아직 준비 중인 화면입니다. 계정과 승인 체계가 생기면 엽니다"
    }
    className={`flex w-full items-center gap-2.5 rounded-md py-2 text-left text-sm transition-colors ${
      mini ? "justify-center px-0" : "px-3"
    } ${
      active
        ? "bg-[var(--accent-tint)] font-semibold text-[var(--accent-ink)]"
        : item.live
          ? "text-[var(--ink)] hover:bg-[var(--surface)]"
          : "cursor-not-allowed text-[var(--muted-soft)]"
    }`}
  >
    <Icon name={item.icon} />
    {!mini && (
      <>
        <span className="flex-1 truncate">{item.label}</span>
        {item.countKey && (
          <span className="text-xs text-[var(--muted)]">
            {counts[item.countKey]}
          </span>
        )}
        {!item.live && <span className="text-[var(--muted-soft)]">–</span>}
      </>
    )}
  </button>
);

export function SideNav({
  view,
  onSelect,
  counts,
  mini,
  onToggleMini,
  onLogo,
  openGroups,
  onToggleGroup,
}: {
  view: ViewId;
  onSelect: (id: ViewId) => void;
  counts: NavCounts;
  mini: boolean;
  onToggleMini: () => void;
  /** ₩ 로고 클릭 — 처음 화면(입장 씬)으로. 접기는 옆의 셰브론이 맡는다 */
  onLogo?: () => void;
  /** 대분류 펼침 상태. 값이 없는 대분류는 현재 화면이 든 것만 펼쳐진다 (page.tsx 가 화면 전환마다 그 대분류를 연다) */
  openGroups: Partial<Record<NavGroupId, boolean>>;
  onToggleGroup: (id: NavGroupId) => void;
}) {
  const rows = (items: NavItem[]) =>
    items.map((i) => (
      <NavRow
        key={i.id}
        item={i}
        active={i.id === view}
        counts={counts}
        onSelect={onSelect}
        mini={mini}
      />
    ));

  const activeGroup = navGroupOf(view);
  const groupRight = (g: NavGroup) =>
    g.id === "standards" ? `근거 ${counts.evidence}종` : undefined;
  const itemCount = (g: NavGroup) => g.subs.reduce((n, s) => n + s.items.length, 0);

  /*
   * 대분류 하나. 접힌 채로는 제목 한 줄(아이콘 · 이름 · 화면 수 · 셰브론)만 남는다.
   * 펼치면 중분류 소제목 아래 화면들이 들어오고, 왼쪽 괘선이 소속을 말한다.
   * 미니 레일(60px)에서는 접기가 없다 — 아이콘 열에 괘선으로 대분류만 가른다.
   */
  const group = (g: NavGroup) => {
    /* 손수 누른 값이 우선 — 현재 대분류도 접을 수 있어야 헤더가 죽은 단추가 되지 않는다 */
    const open = openGroups[g.id] ?? g.id === activeGroup;
    const right = groupRight(g);
    if (mini) {
      return (
        <div key={g.id} className="mt-4">
          <div className="mx-3 mb-2 border-t-2 border-[var(--line-strong)]" />
          {g.subs.map((s) => rows(s.items))}
        </div>
      );
    }
    return (
      <div key={g.id} className="mt-3">
        <button
          type="button"
          onClick={() => onToggleGroup(g.id)}
          aria-expanded={open}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-[var(--surface)] ${
            open ? "text-[var(--ink)]" : "text-[var(--muted)]"
          }`}
        >
          <Icon name={g.icon} cls="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="flex-1 truncate">{g.title}</span>
          <span className="text-2xs font-normal text-[var(--muted-soft)]">
            {right ?? `${itemCount(g)}개`}
          </span>
          <span aria-hidden className={`text-2xs transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
        </button>
        {open && (
          <div className="ml-4 border-l border-[var(--line)] pl-1">
            {g.subs.map((s) => (
              <div key={s.title} className="mt-1">
                <p className="px-3 pb-0.5 pt-1.5 text-2xs font-medium text-[var(--muted-soft)]">
                  {s.title}
                </p>
                {rows(s.items)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] transition-[width] ${
        mini ? "w-[60px]" : "w-[268px]"
      }`}
    >
      <div
        className={`flex items-center gap-2.5 py-4 ${mini ? "flex-col px-2" : "px-4"}`}
      >
        <button
          onClick={onLogo ?? onToggleMini}
          title="처음 화면(입장)으로"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-lg font-bold text-white motion-press"
        >
          ₩
        </button>
        {!mini && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">페이체크</p>
            <p className="truncate text-2xs text-[var(--muted)]">
              금융정착 Agent 관제
            </p>
          </div>
        )}
        <button
          onClick={onToggleMini}
          title={mini ? "메뉴 펼치기" : "메뉴 접기"}
          aria-expanded={!mini}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
        >
          <span className="text-xs leading-none">{mini ? "⟩" : "⟨"}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map(group)}

        {!mini && (
          <div className="mt-6 px-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-2xs font-medium text-[var(--muted)]">
                최근 실행
              </span>
              <span className="text-2xs text-[var(--muted-soft)]">
                {counts.runs}
              </span>
            </div>
            <p className="text-2xs leading-relaxed text-[var(--muted-soft)]">
              {counts.runs === 0
                ? "아직 실행 기록이 없습니다"
                : `이 세션에서 ${counts.runs}건을 판정했습니다`}
            </p>
          </div>
        )}
      </nav>

      {/*
       * 레일 바닥은 비워 둔다 (2026-09-02). 예전엔 "판정 엔진 오프라인" 상자, 그 다음엔
       * 언어 select 와 상태 줄이 있었다. 바닥은 눈에 띄지 않는 자리라(NN/g) 무엇을 두든
       * 못 찾고, 첫 화면에서 고른 언어를 여기서 또 고르게 하면 "어느 쪽이 진짜인가"가 된다.
       * 언어 전환은 페이전트 메뉴 ⑤, 번역 엔진 상태도 그 옆에 있다.
       */}
    </aside>
  );
}

/* ── 상담 큐 ── */

export function CaseQueue({
  cases,
  selectedId,
  onSelect,
  onRun,
  onAgentRun,
  overlay,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  cases: Case[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRun: () => void;
  onAgentRun: () => void;
  /** 좁은 화면에서 열이 아니라 겹쳐 뜬다 — 폭을 깎으면 카드가 한 글자씩 줄바꿈된다 */
  overlay?: boolean;
  onClose?: () => void;
  /** 넓은 화면에서 얇은 레일로 접는다 — 본문이 그 폭을 되찾는다. 상태는 세션 메모리만 */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  if (collapsed && !overlay) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-[var(--line)] bg-[var(--panel)] py-4 transition-[width]">
        <button
          onClick={onToggleCollapse}
          title="상담 큐 펼치기"
          aria-expanded={false}
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
        >
          <span className="text-xs leading-none">⟩</span>
        </button>
        <button
          onClick={onToggleCollapse}
          title={`상담 큐 ${cases.length}건`}
          className="flex flex-col items-center gap-1 rounded-md px-1.5 py-2 text-[var(--muted)] hover:bg-[var(--surface)]"
        >
          <Icon name="queue" />
          <span className="text-2xs font-bold">{cases.length}</span>
        </button>
        <span
          aria-hidden
          className="text-2xs font-semibold tracking-widest text-[var(--muted-soft)] [writing-mode:vertical-rl]"
        >
          상담 큐
        </span>
      </aside>
    );
  }
  return (
    <aside
      className={`flex w-[340px] max-w-[85vw] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] transition-[width] ${
        overlay
          ? "absolute inset-y-0 left-0 z-30 shadow-[var(--shadow-2)]"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <Eyebrow>CASE INBOX</Eyebrow>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">상담 큐</h2>
            <Pill>{cases.length}</Pill>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {cases.length === 0
              ? "아직 담긴 상담이 없습니다"
              : cases.every((c) => c.source === "user")
                ? "내가 입력한 내용 · 서버에 저장하지 않음"
                : "합성 픽스처 · 실제 개인정보 없음"}
          </p>
        </div>
        {overlay ? (
          <button
            onClick={onClose}
            aria-label="상담 큐 닫기"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            ✕
          </button>
        ) : (
          onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="상담 큐 접기"
              aria-expanded={true}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
            >
              <span className="text-xs leading-none">⟨</span>
            </button>
          )
        )}
      </div>

      {/*
       * 좌측 액센트 바(border-l) 대신 사방 1px 테두리 + 라운드 + 선행 점을 쓴다.
       * 좌측 바는 좌우 비대칭이라 목록이 격자에서 어긋나 보이고, 파란 바를 선택 표시로
       * 쓰면 나중에 위험을 말하는 빨간 바와 같은 문법이 되어 구분이 사라진다.
       *
       * 선택 상태의 단서는 셋이다 — 테두리·배경(색), 속이 찬 점 ●/빈 점 ○(형태),
       * aria-current(보조기술). 색 하나만 남기면 색각 이상·흑백 인쇄에서 어느 줄이
       * 선택됐는지 알 수 없다. 형태 차이는 그 두 조건에서도 살아남는다.
       * aria-current 는 globals.css 의 강제 색상 모드 규칙이 잡는 자리이기도 하다.
       *
       * 옅은 파랑 면의 토큰 이름은 --accent-tint 로 확정됐다. 한때 --accent-soft 를
       * 예비값으로 함께 걸어 뒀는데 그 이름은 globals.css 에 끝내 생기지 않아 지웠다.
       * 없는 이름을 예비값에 남겨 두면 다음 사람이 그것을 정식 토큰으로 착각하고
       * 새로 정의한다 — 그러면 같은 면이 화면마다 두 색으로 갈린다.
       */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {/*
         * 빈 큐 (2026-09-05) — 픽스처 6건을 미리 채워 두지 않는다. 사용자가
         * 내 급여 확인하기에서 [받을 돈 확인하기]를 누르면 그 입력이 여기로 온다.
         * 픽스처는 운영·관리 → 상담 사례 목록에 그대로 있다.
         */}
        {cases.length === 0 && (
          <div className="rounded-[var(--radius-m)] border border-dashed border-[var(--line)] px-4 py-5 text-center text-xs leading-relaxed text-[var(--muted)]">
            <p className="font-bold text-[var(--ink)]">상담 큐가 비어 있습니다</p>
            <p className="mt-1.5">
              <span className="block">왼쪽 메뉴의 [내 급여 확인하기]에서 상황을 입력하고</span>
              <span className="block">[받을 돈 확인하기]를 누르면 그 내용이 여기로 옵니다.</span>
            </p>
          </div>
        )}
        {cases.map((c) => {
          const on = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              aria-current={on ? "page" : undefined}
              className={`block w-full rounded-[var(--radius-m)] border px-4 py-3 text-left ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                  : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-xs ${on ? "text-[var(--accent-ink)]" : "text-[var(--muted)]"}`}
                >
                  <span aria-hidden className="mr-1">
                    {on ? "●" : "○"}
                  </span>
                  {c.id}
                </span>
                <Pill tone={badgeTone(c.badge)}>{c.badge}</Pill>
              </div>
              <p className="mt-1.5 font-bold leading-snug">{c.utterance}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {c.summary}
              </p>
            </button>
          );
        })}
      </div>

      <div className="px-5 py-4">
        <button
          onClick={onRun}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-3 font-semibold text-white hover:bg-[var(--accent-hover)] motion-press"
        >
          <Icon name="check" cls="text-white" /> 판정 실행하기
          <kbd className="rounded border border-white/40 px-1 text-2xs font-normal">
            ⌘↵
          </kbd>
        </button>
        <button
          onClick={onAgentRun}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] py-2.5 font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white motion-press"
        >
          <Icon name="agent" /> 에이전트 실행
        </button>
        {/* 단추 아래 안내문("대기 중 · 판정은 코드가…")은 2026-09-05 제거 — 상태는 상단 필이 이미 말한다 */}
      </div>

      <p className="border-t border-[var(--line)] px-5 py-3 text-2xs text-[var(--muted-soft)]">
        2026 금융 AI Challenge
      </p>
    </aside>
  );
}

/* ── 근거 문서 카드 ── */

/*
 * 색(tone)과 글자(label)를 한 표에서 관리한다. 예전에는 STATE_TONE 과 STATE_LABEL 로
 * 나뉘어 있었다. 검증 상태를 하나 더 넣을 때 한쪽만 고치면 라벨과 색이 어긋나는데,
 * 두 표 모두 키가 채워져 있으면 타입은 아무 말도 하지 않는다.
 */
const 근거상태 = {
  원본확인: { tone: "accent", label: "원본 확인 완료" },
  판례: { tone: "muted", label: "판례" },
  "2차출처": { tone: "warn", label: "원문 확인 대기" },
} as const;

/*
 * 근거 문서 카드 — 서열이 보이게 (2026-09-02 재설계).
 *
 * 예전엔 조문 코드(파란 모노)·제목(볼드 sm)·비고(xs)·이력(2xs)이 모두 비슷한 크기와
 * 회색조라 "무엇이 중요한가"가 안 보였다. 지금은 세 층이다:
 *   1층 — 검증 상태 띠(왼쪽 색 테두리 + 배지)와 제목(base·bold): 한눈에 볼 것
 *   2층 — 조문 코드·적용 범위·시행일: 작지만 또렷한 보조 정보
 *   3층 — 구현 비고·이력·출처 링크: 접힌다. 대조하려는 사람만 펼친다
 * 상태별 왼쪽 테두리 색: 확인 대기(주황) > 원본 확인(파랑) > 판례(회색).
 */
const 근거테두리: Record<Standard["state"], string> = {
  "2차출처": "border-l-[var(--warning)]",
  원본확인: "border-l-[var(--accent)]",
  판례: "border-l-[var(--line-strong)]",
};

export function StandardCard({ s }: { s: Standard }) {
  const { tone, label } = 근거상태[s.state];
  return (
    <div className={`rounded-r-lg border border-l-4 border-[var(--line)] bg-[var(--panel)] px-4 py-3 ${근거테두리[s.state]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-bold leading-snug">{s.title}</p>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <p className="mt-1 font-mono text-xs text-[var(--muted)]">{s.code}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink)]">
        <span className="font-semibold text-[var(--muted)]">적용 범위</span> {s.scope}
        <span className="mx-1.5 text-[var(--muted-soft)]">·</span>
        <span className="text-[var(--muted)]">{s.issued}</span>
      </p>
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
          구현 비고·이력·출처
        </summary>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{s.note}</p>
        {s.history && (
          <p className="mt-1.5 text-2xs leading-relaxed text-[var(--muted-soft)]">
            최신 이력: {s.history}
          </p>
        )}
        {s.sourceUrl && (
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-block text-xs font-semibold text-[var(--accent-ink)] underline underline-offset-2"
          >
            원문 출처 열기{s.verifiedAt ? ` (확인 ${s.verifiedAt})` : ""} ↗
          </a>
        )}
      </details>
    </div>
  );
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/*
 * ── 답변 단락의 줄 서열 ──
 *
 * lib/narrate.ts 는 판정 하나를 줄 몇 개로 조립한다: 주장(제목) · 기한 · 금액 · 근거 ·
 * 되묻는 질문. 화면이 이 줄들을 같은 크기·같은 색으로 나열하면 무엇이 중요한지 안
 * 보인다(2026-09-02 지적). 줄의 역할은 **한국어 원문**의 첫 어절로 알아낸다 —
 * 번역문은 줄 수와 순서가 원문과 같으므로(contract.ts rebuild) 같은 자리에 같은
 * 역할을 입힌다. 번역된 접두어("Basis:")를 알 필요가 없다.
 */
export type AnswerLineRole = "claim" | "deadline" | "amount" | "basis" | "question" | "detail";

export function answerLineRole(koLine: string, index: number): AnswerLineRole {
  if (koLine.startsWith("⟨기한⟩")) return "deadline";
  if (koLine.startsWith("근거:")) return "basis";
  if (koLine.startsWith("· ")) return "question";
  if (/^(예상 금액은|금액은)/.test(koLine)) return "amount";
  if (/\d+일 남았습니다\.$|일 지났습니다\.$/.test(koLine)) return "deadline";
  if (index === 0) return "claim";
  return "detail";
}

/** 단락 왼쪽 괘선 색 — 판정 수준의 뜻 있는 색만 쓴다 (FindingCard 와 같은 문법) */
const 단락괘선: Record<Level, string> = {
  기한임박: "border-l-[var(--warning)]",
  확인필요: "border-l-[var(--warning)]",
  위법: "border-l-[var(--bad)]",
  수령가능: "border-l-[var(--accent)]",
  수령불가: "border-l-[var(--line-strong)]",
  정상: "border-l-[var(--line)]",
};

/**
 * 답변 단락 하나 — 역할별로 크기·굵기·색이 다르다.
 *   claim    : 굵게, 수준 표식과 함께 (무엇에 대한 말인가)
 *   deadline : 굵게, 기한임박이면 경고색 (언제까지인가)
 *   amount   : 첫 문장(금액)은 크고 굵게, 뒤 문장("확정 금액은 기관이…")은 작고 옅게
 *   basis    : 작고 옅게 (반박할 때 읽는 줄)
 *   question : 보통 크기 (답해야 하는 줄)
 *   detail   : 보통 크기, 옅게
 * ko 는 역할 판별용 한국어 원문 줄, shown 은 화면에 보일 줄(번역문일 수 있다).
 */
export function AnswerBlockView({
  level,
  ko,
  shown,
}: {
  level: Level;
  ko: string[];
  shown: string[];
}) {
  const { mark, markCls } = 표시[level];
  return (
    <div className={`border-l-[3px] pl-3 ${단락괘선[level]}`}>
      {shown.map((line, i) => {
        const role = answerLineRole(ko[i] ?? line, i);
        if (role === "claim")
          return (
            <p key={i} className="text-sm font-bold leading-relaxed text-[var(--ink)]">
              <span aria-hidden className={`mr-1.5 ${markCls}`}>{mark}</span>
              {line}
            </p>
          );
        if (role === "deadline")
          return (
            <p key={i} className={`mt-1 text-sm font-semibold leading-relaxed ${level === "기한임박" ? "text-[var(--warning-ink)]" : "text-[var(--ink)]"}`}>
              {line}
            </p>
          );
        if (role === "amount") {
          const [first, ...rest] = splitSentences(line);
          return (
            <p key={i} className="mt-1 leading-relaxed">
              <span className="text-base font-bold text-[var(--ink)]">{first}</span>
              {rest.length > 0 && <span className="ml-1.5 text-xs text-[var(--muted)]">{rest.join(" ")}</span>}
            </p>
          );
        }
        if (role === "basis")
          return (
            <p key={i} className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {line}
            </p>
          );
        if (role === "question")
          return (
            <p key={i} className="mt-0.5 pl-1 text-sm leading-relaxed text-[var(--ink)]">
              {line}
            </p>
          );
        return (
          <p key={i} className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 판정 수준만 색을 갖는다. 크롬(내비·버튼·배지)은 파랑/흰색뿐이므로
 * 여기 쓰인 색은 전부 뜻이 있다.
 *
 *   warning — 사람이 조치해야 하는 것 (기한임박·확인필요)
 *   bad     — 법을 어긴 것 (위법)
 *   accent  — 받을 수 있는 돈 (수령가능)
 *   중립     — 문제 없음 / 해당 없음. 색을 주지 않는다.
 *
 * 표식(mark)과 색(cls)을 한 표에서 관리한다. 나누면 수준을 하나 더할 때 한쪽만
 * 고쳐 표식과 색이 어긋난다. 화면에 나가는 글자는 Level 값 자체(위법·확인필요…)라
 * 이 표의 키가 곧 라벨이고, 그래서 라벨은 어긋날 수가 없다.
 *
 * 표식은 이모지가 아니라 도형 글리프다 (2026-08-27 교체). 이모지(🔴💰⏰)는
 * 플랫폼마다 다르게 그려져 색·형태를 우리가 통제하지 못하고, 흑백 인쇄에서 🔴 과 🟡 은
 * 같은 원이 된다. 도형은 CSS 색을 그대로 받고 **수준마다 형태가 다르다** —
 * ◆ 기한임박 · ■ 위법 · ● 수령가능 · ▲ 확인필요. 색이 전부 사라져도 넷이 갈린다.
 * 케이스 목록의 선택 표식(●/○)과 같은 문법이기도 하다.
 *
 * 알려진 한계: 기한임박과 확인필요는 같은 warning 면을 쓴다. 둘을 가르는 것은
 * ◆/▲ 형태와 카드에 적히는 수준 글자다. 주황을 따로 두면 화면의 경고색이
 * 둘로 늘어나 어느 쪽이 더 급한지 색만 보고는 알 수 없게 된다.
 *
 * 수령불가에서 opacity 를 뺐다. 카드를 통째로 반투명하게 만들면 안의 작은
 * 보조 글자까지 같이 옅어지는데, 대비 검사 스크립트는 hex 만 읽어서 그 손실을
 * 보지 못한다. 흐리게 보일 이유는 면 색(--surface)만으로 충분하다.
 */
export const 표시: Record<Level, { mark: string; markCls: string; cls: string }> = {
  기한임박: {
    mark: "◆",
    markCls: "text-[var(--warning)]",
    cls: "border-[var(--warning)] bg-[var(--warning-soft)]",
  },
  위법: {
    mark: "■",
    markCls: "text-[var(--bad)]",
    cls: "border-[var(--bad)] bg-[var(--bad-soft)]",
  },
  수령가능: {
    mark: "●",
    markCls: "text-[var(--accent)]",
    cls: "border-[var(--accent)] bg-[var(--accent-tint)]",
  },
  확인필요: {
    mark: "▲",
    markCls: "text-[var(--warning)]",
    cls: "border-[var(--warning)] bg-[var(--warning-soft)]",
  },
  수령불가: {
    mark: "—",
    markCls: "text-[var(--muted)]",
    cls: "border-[var(--line)] bg-[var(--surface)]",
  },
  정상: {
    mark: "✓",
    markCls: "text-[var(--good)]",
    cls: "border-[var(--line)] bg-[var(--panel)]",
  },
};

/** 금액을 강조 표시할 판정인가 */
const 금액표시 = (level: Level) => level !== "정상" && level !== "수령불가";

export function FindingCard({ f }: { f: Finding }) {
  const { mark, markCls, cls } = 표시[f.level];
  return (
    <div className={`rounded-[var(--radius-m)] border p-4 ${cls}`}>
      {/*
       * 수준을 글자로도 적는다. 표식은 형태가 서로 다른 도형이지만(◆■●▲),
       * 형태만으로 뜻을 다 싣지 않는다 — 수준 글자가 항상 함께 간다.
       * 표식에 aria-hidden 을 거는 이유: 안 걸면 스크린리더가 "마름모 기한임박"처럼
       * 같은 뜻을 두 번 읽는다.
       */}
      <p className="font-medium">
        <span className="mr-1 font-mono text-xs text-[var(--muted)]">
          {f.rule}
        </span>
        <span aria-hidden className={markCls}>
          {mark}
        </span>{" "}
        <span className="font-bold">{f.level}</span>
        <span className="text-[var(--muted)]"> · </span>
        <span className="font-semibold">{f.title}</span>
      </p>
      {f.amount !== undefined && 금액표시(f.level) && (
        <p className="mt-1.5 text-2xl font-bold tracking-tight">
          {f.amountRange
            ? `약 ${won(f.amountRange.min)} ~ ${won(f.amountRange.max)}`
            : won(f.amount)}
        </p>
      )}
      {f.deadline && (
        <p className="mt-1 text-sm font-semibold">
          {f.deadline.label}: {f.deadline.date}
          <span className="ml-2 font-mono font-bold">
            {f.deadline.daysLeft >= 0
              ? `D-${f.deadline.daysLeft}`
              : `${-f.deadline.daysLeft}일 지남`}
          </span>
        </p>
      )}
      {/*
       * 여기 보조 글자에 --muted-soft 를 쓰지 않는다. 흰 바탕에서는 4.86:1 로 통과하지만
       * 이 카드의 옅은 면 위에서는 미달한다 — warning-soft 4.42:1, bad-soft 4.31:1.
       * --muted 는 같은 면 위에서 4.99:1·4.87:1 로 남는다(scripts/contrast.mjs 에 두 조합이
       * 이미 등록돼 있다). 근거와 계산식은 판정을 반박할 때 읽는 줄이라 가장 작고
       * 가장 옅은 색을 주면 안 되는 자리다.
       */}
      {/* 확인 질문은 사용자가 답해야 할 것이라 접지 않는다 */}
      {f.questions && (
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--ink)]">
          {f.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      {/*
       * 근거·계산식은 접는다 (2026-09-02). 판정 카드가 여덟 장 넘게 깔리면 카드마다
       * 붙은 조문·계산식이 화면을 글자로 덮어, 정작 봐야 할 금액과 기한이 묻혔다.
       * 반박하려는 사람만 펼친다 — 접혀 있어도 있다는 사실은 요약 줄이 말한다.
       */}
      {(f.formula || f.basis) && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            근거·계산식 보기
          </summary>
          {f.formula && (
            <pre className="mt-1.5 whitespace-pre-wrap font-mono text-xs text-[var(--muted)]">
              {f.formula}
            </pre>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
            <span className="font-bold">근거</span> {f.basis}
          </p>
        </details>
      )}
    </div>
  );
}
