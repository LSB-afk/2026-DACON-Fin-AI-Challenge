"use client";

import { TUTORIAL, tutorialStep, type TutorialStep } from "@/lib/tutorial";
import { Eyebrow, Icon, Pill, 표시 } from "./_ui";

/**
 * 입장 튜토리얼 카드 — 페이전트를 누르면 오른쪽 열에 뜬다.
 *
 * 콘솔과 같은 면 문법(흰 판·괘선·브랜드 파랑 하나)만 쓴다. 새 색·새 도형은 없다.
 * 시각 요소는 세 걸음(번호) / 판정 표식 넷 / 메뉴 지도 셋뿐이다. 1장(스킬 알약)과
 * 4장(가드레일 알약)에 있던 개수 알약은 2026-09-03 제거 — 요점 카드가 이미 같은 말을 한다.
 */
export function Tutorial({
  step,
  onStep,
  onFinish,
  onSkip,
}: {
  step: number;
  onStep: (i: number) => void;
  /** 마지막 장의 단추 — 부르는 쪽이 홈으로 보낸다 */
  onFinish: () => void;
  onSkip: () => void;
}) {
  const s = tutorialStep(step);
  const last = step >= TUTORIAL.length - 1;
  return (
    <div className="paygent-pop rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-2)]" role="region" aria-label="페이체크 사용법">
      {/* 머리 — 소제목 · 진행 점 */}
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{s.eyebrow}</Eyebrow>
        <div className="flex items-center gap-1.5" aria-label={`${step + 1} / ${TUTORIAL.length}`}>
          {TUTORIAL.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onStep(i)}
              aria-label={`${i + 1}장 — ${t.title}`}
              aria-current={i === step ? "step" : undefined}
              className={`h-2 rounded-full transition-all ${i === step ? "w-5 bg-[var(--accent)]" : i < step ? "w-2 bg-[var(--accent-tint-line)]" : "w-2 bg-[var(--line)]"}`}
            />
          ))}
          <span className="ml-1 font-mono text-2xs text-[var(--muted-soft)]">{step + 1}/{TUTORIAL.length}</span>
        </div>
      </div>

      <h2 className="mt-1.5 text-xl font-bold tracking-tight">{s.title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{s.lead}</p>

      <div key={s.id} className="motion-fade mt-4">
        <Visual s={s} />
        {s.points.length > 0 && (
          <ul className={`grid gap-2 ${s.visual === "levels" ? "mt-3" : "mt-3 min-[720px]:grid-cols-2"}`}>
            {s.points.map((p, i) => (
              <li key={p.head} className="flex gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm leading-relaxed">
                {s.visual === "steps" ? (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{i + 1}</span>
                ) : (
                  <Icon name={s.visual === "skills" ? (i === 0 ? "calc" : "plane") : s.visual === "guards" ? (["lock", "shield", "book", "lock"][i] ?? "check") : (["agent", "queue", "translate"][i] ?? "check")} cls="mt-0.5 text-[var(--accent)]" />
                )}
                <span>
                  <strong className="text-[var(--ink)]">{p.head}</strong>
                  <span className="text-[var(--muted)]"> — {p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 발 — 이전 · 건너뛰기 · 다음 / 마지막 장은 시작 단추 */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
        <button
          onClick={() => onStep(step - 1)}
          disabled={step === 0}
          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← 이전
        </button>
        <button onClick={onSkip} className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink)]">
          건너뛰기
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          {last ? (
            /* 홈 = 내 급여 확인하기 (근로자용 화면). 판정 모니터는 운영자의 홈이지 근로자의 홈이 아니다 */
            <button
              onClick={onFinish}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-hover)] motion-press"
            >
              <Icon name="home" cls="text-white" /> 홈 화면으로 이동 →
            </button>
          ) : (
            <button
              onClick={() => onStep(step + 1)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-hover)] motion-press"
            >
              다음 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 장별 시각 요소. 글로 다 말하지 않고 화면이 실제로 쓰는 표식·이름을 그대로 보여준다 */
function Visual({ s }: { s: TutorialStep }) {
  if (s.visual === "levels") {
    const 순서 = ["기한임박", "위법", "수령가능", "확인필요"] as const;
    const 뜻: Record<(typeof 순서)[number], string> = {
      기한임박: "마감이 가까워요. 날짜부터 보세요.",
      위법: "법 기준에 어긋나요. 근거 조문이 붙어요.",
      수령가능: "받을 수 있는 돈이에요.",
      확인필요: "질문에 답하면 판정이 정해져요.",
    };
    return (
      <div className="grid gap-2 min-[720px]:grid-cols-2">
        {순서.map((lv) => {
          const { mark, markCls, cls } = 표시[lv];
          /* 표식은 글자 줄 안에 인라인으로 — 판정 카드(FindingCard)와 같은 문법이라 세로 중심이 맞는다 */
          return (
            <p key={lv} className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${cls}`}>
              <span aria-hidden className={`mr-1.5 ${markCls}`}>{mark}</span>
              <strong>{lv}</strong>
              <span className="text-[var(--muted)]"> — {뜻[lv]}</span>
            </p>
          );
        })}
      </div>
    );
  }
  if (s.visual === "menu") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent-tint)] px-2 py-1 font-bold text-[var(--accent-ink)]">
          <Icon name="scale" cls="h-3.5 w-3.5" /> 급여 판정
        </span>
        <span className="text-[var(--muted-soft)]">›</span>
        <Pill tone="accent">시작하기</Pill>
        <Pill>내 기록</Pill>
        <span className="mx-1 text-[var(--muted-soft)]">·</span>
        <span className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 font-semibold text-[var(--muted)]">
          <Icon name="book" cls="h-3.5 w-3.5" /> 법령·검증
        </span>
        <span className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 font-semibold text-[var(--muted)]">
          <Icon name="harness" cls="h-3.5 w-3.5" /> 운영·관리
        </span>
      </div>
    );
  }
  return null; // steps·skills·guards — 요점 목록 자체가 시각 요소다
}
