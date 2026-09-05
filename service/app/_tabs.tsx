"use client";

/**
 * 실행 모니터의 탭 내용.
 *
 * 예전에는 입력·루프·판정·근거·검증을 한 컬럼에 세로로 쌓았다. 스크롤이 길고
 * 어디를 봐야 할지 알 수 없어 읽는 사람이 지친다. 한 번에 하나만 보여주고
 * 나머지는 탭 배지로 개수만 알린다.
 */

import type { Finding, MoneyTotals } from "@/lib/rules/types";
import type { SkillMeta } from "@/lib/skills";
import type { Manifest, SelfTestResult, HookLogEntry } from "@/lib/harness/core";
import type { Payslip } from "@/lib/rules/payslip";
import type { Answer } from "@/lib/narrate";
import { 언어들, type LangCode } from "@/lib/ai/contract";
import { standardsFor } from "@/lib/standards";
import { 기준2026 } from "@/lib/rules/constants-2026";
import { FindingCard, StandardCard, EmptyBox, Pill, won, 표시 } from "./_ui";

const 셀 = "border-b border-[var(--line-soft)]";

export type MonitorTab =
  | "findings"
  | "answer"
  | "input"
  | "loop"
  | "evidence"
  | "verify";

export type Step = {
  n: string;
  label: string;
  /** 대기 = 연결은 됐고 사용자가 아직 실행하지 않은 상태. 미연결과 섞으면 거짓말이 된다 */
  status: "완료" | "대기" | "미연결" | "중단" | "차단";
  detail: string;
  /** 모델 호출 소요 ms — 있을 때만 도시 상세 패널이 "처리 시간"으로 보여준다 */
  ms?: number;
};

const STATUS_TONE = {
  완료: "ok",
  대기: "muted",
  미연결: "warn",
  중단: "muted",
  차단: "warn",
} as const;

const STATUS_ICON: Record<Step["status"], string> = {
  완료: "check",
  대기: "wait",
  미연결: "disconnect",
  중단: "block",
  차단: "block",
};

/* ── 입력 ── */

export function InputTab({
  payslip,
  departure,
}: {
  payslip: (Payslip & { workplaceSize?: string }) | null;
  departure: [string, string][];
}) {
  if (payslip) {
    const rows = (title: string, items: { label: string; amount: number }[]) => (
      <>
        <tr className="border-y border-[var(--line)] bg-[var(--surface)]">
          <th colSpan={2} className="py-1.5 pl-2 text-left font-medium">
            {title}
          </th>
        </tr>
        {items.map((e) => (
          <tr key={e.label} className={셀}>
            <td className="py-1.5 pl-2">{e.label}</td>
            <td className="py-1.5 pr-2 text-right font-mono">{won(e.amount)}</td>
          </tr>
        ))}
      </>
    );
    return (
      <table className="w-full max-w-2xl text-sm">
        <tbody>
          {rows("지급", payslip.earnings)}
          {rows("공제", payslip.deductions)}
          <tr className="border-y border-[var(--line)] bg-[var(--surface)]">
            <th colSpan={2} className="py-1.5 pl-2 text-left font-medium">
              근로시간 · 사업장
            </th>
          </tr>
          {Object.entries(payslip.hours ?? {}).map(([k, v]) => (
            <tr key={k} className={셀}>
              <td className="py-1.5 pl-2">{k}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{v}시간</td>
            </tr>
          ))}
          <tr className={셀}>
            <td className="py-1.5 pl-2">상시 근로자 수</td>
            <td className="py-1.5 pr-2 text-right font-mono">
              {payslip.workplaceSize}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    /* 값 여섯 개짜리 사전 — 가용 폭만큼 열이 늘어 화면을 채운다 */
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-10">
      {departure.map(([k, v]) => (
        <div key={k} className="border-b border-[var(--line-soft)] py-2.5">
          <dt className="text-2xs text-[var(--muted)]">{k}</dt>
          <dd className="mt-0.5 font-mono text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 루프 ── */

export function LoopTab({ steps }: { steps: Step[] }) {
  if (steps.length === 0)
    return (
      <EmptyBox>
        판정을 실행하면 각 단계(검사 고르기, 값 뽑기, 검사, 판정, 설명)가 순서대로 여기에 기록됩니다.
      </EmptyBox>
    );
  return (
    /* 순서가 뜻인 목록이라 열을 나누지 않는다 — 캡만 한 단계 넓힌다 */
    <ol className="max-w-5xl overflow-hidden rounded-lg border-2 border-[var(--line-strong)]">
      {steps.map((s, i) => {
        const isRunning = s.status === "대기";
        return (
          <li
            key={`${s.n}-${i}`}
            className={`flex gap-4 border-b border-[var(--line-soft)] px-4 py-3 last:border-0 motion-stage ${isRunning ? "motion-stage--pulse" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
          <span className="w-12 shrink-0 font-mono text-xs font-bold text-[var(--accent)]">
            {s.n}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${s.status === "완료" ? "text-[var(--good)]" : s.status === "차단" || s.status === "중단" ? "text-[var(--warning)]" : "text-[var(--muted)]"}`} aria-hidden>
                  {STATUS_ICON[s.status] === "check" && <path d="M5 12l4 4 10-10" />}
                  {STATUS_ICON[s.status] === "wait" && <path d="M6 3h12M8 3v2a4 4 0 0 0 2 3.5A4 4 0 0 0 8 12v2h8v-2a4 4 0 0 0-2-3.5A4 4 0 0 0 16 5V3" />}
                  {STATUS_ICON[s.status] === "disconnect" && <path d="M4 12h6M14 12h6M8 8a4 4 0 0 1 8 0M4 16a8 8 0 0 1 16 0" />}
                  {STATUS_ICON[s.status] === "block" && <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6M15 9l-6 6" />}
                </svg>
                <Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill>
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {s.detail}
            </p>
          </div>
        </li>
        );
      })}
    </ol>
  );
}

/* ── 판정 ── */

export function FindingsTab({
  findings,
  totals,
  skill,
  ran,
  routed,
}: {
  findings: Finding[];
  totals: MoneyTotals;
  skill: SkillMeta | null;
  ran: boolean;
  routed: boolean;
}) {
  const fired = new Set(findings.map((f) => f.rule));
  if (!ran && findings.length === 0) {
    return (
      <div className="max-w-3xl">{/* 안내문은 본문 텍스트 — 줄 길이 캡 유지 */}
        <div className="rounded-[var(--radius-card)] border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-4 py-4">
          <p className="text-sm font-bold text-[var(--accent)]">이 화면 읽는 법</p>
          <ol className="mt-2 list-decimal list-inside space-y-1 text-sm leading-relaxed text-[var(--ink)]">
            <li>왼쪽 목록에서 상담 사례를 하나 고릅니다. 입력한 말이 바뀌면 어느 검사로 보냈는지 그 근거가 함께 보입니다.</li>
            <li>[판정 실행하기] 버튼이나 ⌘↵ 로 실행합니다. 같은 입력이면 언제나 같은 결과가 나옵니다.</li>
            <li>판정 탭을 먼저 보고, 답변 탭에서 사용자에게 보낼 문장을 확인합니다. 금액은 답변에 그대로 들어갑니다.</li>
          </ol>
          <p className="mt-2 text-2xs text-[var(--muted)]">실행하면 이 안내가 사라지고 판정 결과가 채워집니다.</p>
        </div>
        {!routed && (
          <p className="mt-4 text-sm text-[var(--muted)]">어느 검사로 보낼지 정해지지 않으면 판정하지 않습니다. 입력한 말이 어느 검사에도 해당하지 않으면 사용자에게 다시 묻습니다.</p>
        )}
      </div>
    );
  }
  return (
    /* 폭 캡 제거 — 판정 카드가 ≥1280px 에서 2열로 흘러 가용 폭을 채운다 */
    <div className="w-full">
      {findings.length === 0 ? (
        <EmptyBox>
          {ran && !routed
            ? "어느 검사로 보낼지 정하지 못해 판정하지 않았습니다. 없는 기능을 있는 것처럼 보여 주지 않습니다."
            : "판정을 실행하면 급한 순서(기한임박, 위법, 수령가능)로 표시됩니다."}
        </EmptyBox>
      ) : (
        <>
          {/*
           * 확정과 추정을 한 숫자로 합치지 않는다. "확인된 금액 1,417만원"이라
           * 합쳐 말하면 사용자는 그 숫자를 기대하고, 기관은 다른 숫자를 준다.
           * 확인필요 참고 금액(S2-4 차액 등)은 위 범위와 겹칠 수 있어 아예 밖에 둔다.
           */}
          {(totals.확정 > 0 || totals.추정) && (
            <div className="mb-4 rounded-lg border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-4 py-3">
              {totals.확정 > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[var(--muted)]">
                    <strong className="text-[var(--ink)]">확정</strong> 이미 떼였거나 본인이 낸 돈
                  </span>
                  <span className="text-2xl font-bold">{won(totals.확정)}</span>
                </div>
              )}
              {totals.추정 && (
                <div className={`flex items-baseline justify-between gap-3 ${totals.확정 > 0 ? "mt-1.5 border-t border-[var(--accent-tint-line)] pt-1.5" : ""}`}>
                  <span className="text-sm text-[var(--muted)]">
                    <strong className="text-[var(--ink)]">추정</strong> 기관에서 확인한 뒤 정해질 예상 금액
                  </span>
                  <span className="text-lg font-bold">
                    약 {won(totals.추정.min)} ~ {won(totals.추정.max)}
                  </span>
                </div>
              )}
              {totals.확인필요참고 > 0 && (
                <p className="mt-2 border-t border-[var(--accent-tint-line)] pt-2 text-xs leading-relaxed text-[var(--muted)]">
                  따로 확인할 금액 {won(totals.확인필요참고)}은 위 금액과 겹칠 수 있어 합계에 넣지 않았습니다.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(21rem,1fr))] gap-3">
            {findings.map((f, i) => (
              <div key={`${f.rule}-${i}`} className="motion-card" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                <FindingCard f={f} />
              </div>
            ))}
          </div>
        </>
      )}

      {skill && (
        <details className="mt-6 max-w-4xl">
          <summary className="cursor-pointer text-sm font-semibold">
            검사 규칙 적용 현황
            <span className="ml-2 font-normal text-[var(--muted)]">
              {skill.ruleCatalog.length}개 중 {fired.size}개 적용. 적용되지 않은 규칙도 함께 보여 줍니다
            </span>
          </summary>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {skill.ruleCatalog.map((r) => (
                <tr key={r.rule} className={셀}>
                  <td className="py-1.5 font-mono text-[var(--muted-soft)]">
                    {r.rule}
                  </td>
                  <td>{r.name}</td>
                  <td className="text-[var(--muted-soft)]">
                    {"note" in r ? (r.note as string) : ""}
                  </td>
                  <td className="text-right">
                    {fired.has(r.rule) ? (
                      <span className="text-[var(--accent)]">적용</span>
                    ) : (
                      <span className="text-[var(--muted-soft)]">해당 없음</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/* ── 답변 — 사용자에게 실제로 나가는 것 ── */

/**
 * 관제 화면은 판정 카드(운영자용)만 보여줬다. 정작 "근로자의 휴대폰에 무엇이
 * 도착하는가"는 어디에도 없었다 — 제품의 최종 산출물이 화면에 없는 셈이다.
 * 조립은 lib/narrate.ts 의 순수 함수가 한다. 여기는 그 결과를 메시지 모양으로
 * 그릴 뿐이고, 문장을 지어내지 않는다.
 */
export type TranslateState = {
  /** 지금 보는 언어. ko = 한국어 원문 */
  lang: "ko" | LangCode;
  /** 통과한 번역 — 숫자 보존 검증을 지난 것만 여기 담긴다 */
  done: { lang: string; answer: Answer; model: string } | null;
  busy: boolean;
  /** 계약 위반·시한 초과 등 — 원문 폴백의 이유. 숨기지 않고 그대로 보여준다 */
  error: string | null;
  /** 서버에 물어본 제공자. null = 조회 전, provider:null = 미연결 */
  provider: { provider: "anthropic" | "ollama" | null; model?: string } | null;
};

export function AnswerTab({
  answer,
  routed,
  ran,
  ts,
  onLang,
}: {
  answer: Answer | null;
  routed: boolean;
  ran: boolean;
  ts: TranslateState;
  onLang: (code: "ko" | LangCode) => void;
}) {
  if (!ran)
    return (
      <EmptyBox>
        판정을 실행하면 사용자에게 보낼 답변이 여기에 만들어집니다.
      </EmptyBox>
    );
  if (!routed)
    return (
      <div className="max-w-xl">
        <div className="rounded-[var(--radius-card)] rounded-tl-md border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <p className="text-sm leading-relaxed">
            무엇을 도와드릴지 아직 정하지 못했습니다. <strong>급여명세서 확인</strong>이
            필요하신가요, <strong>출국 전 정산</strong>이 필요하신가요?
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            AI는 모르는 것을 추측하지 않고 이렇게 다시 묻습니다.
          </p>
        </div>
      </div>
    );
  if (!answer) return null;

  const 연결됨 = !!ts.provider?.provider;
  const 번역보는중 = ts.lang !== "ko" && ts.done?.lang === ts.lang;
  const 보이는답변 = 번역보는중 ? ts.done!.answer : answer;
  const 칩 = (on: boolean, enabled: boolean) =>
    `rounded-[var(--radius-pill)] border px-2.5 py-1 text-2xs font-semibold transition-colors ${
      on
        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
        : enabled
          ? "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"
          : "cursor-not-allowed border-[var(--line-soft)] bg-[var(--panel)] text-[var(--muted-soft)]"
    }`;

  return (
    /* 폭 캡을 없앤다 — 화면 비율이 바뀌면 답변이 가용 폭을 채운다.
       줄 길이는 아래 블록 2열 그리드가 열 단위로 제한한다 (전폭 한 줄은 못 읽는다) */
    <div className="w-full">
      {/* 언어 선택 — 제공자가 없으면 누를 수 없게 두고 이유를 붙인다 (내비 미구현 항목과 같은 문법) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={칩(ts.lang === "ko", true)} onClick={() => onLang("ko")}>
          한국어 원문
        </button>
        {언어들.map((l) => (
          <button
            key={l.code}
            className={칩(ts.lang === l.code, 연결됨)}
            disabled={!연결됨}
            title={
              연결됨
                ? `${l.name}로 번역합니다. 금액과 날짜가 원문과 같은지 확인한 뒤 표시합니다`
                : "번역 서비스가 연결되지 않았습니다. 서버에 ANTHROPIC_API_KEY 또는 OLLAMA_URL을 설정하면 열립니다"
            }
            onClick={() => onLang(l.code)}
          >
            {l.label}
          </button>
        ))}
        <span className="ml-auto text-2xs text-[var(--muted-soft)]">
          {ts.provider === null
            ? "번역 서비스 확인 중…"
            : 연결됨
              ? `번역 서비스: ${ts.provider.provider} · ${ts.provider.model}`
              : "번역 서비스가 연결되지 않았습니다. 한국어 답변은 코드가 이미 만들었습니다"}
        </span>
      </div>

      {ts.busy && (
        <p className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
          번역 중입니다 ({ts.provider?.model}). 금액과 날짜가 원문과 같은지 확인한 뒤 보여 드립니다
        </p>
      )}
      {ts.error && !ts.busy && (
        <p className="mt-3 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning-ink)]">
          <span className="font-bold">번역이 확인을 통과하지 못해 한국어 원문을 보여 드립니다.</span>
          <br />
          {ts.error}
        </p>
      )}

      {/* 말풍선 하나. 폰 목업 프레임 같은 장식은 두지 않는다 — 내용이 장식보다 길어야 한다 */}
      <div className={`mt-3 rounded-[var(--radius-card)] rounded-tl-md border border-[var(--line)] bg-[var(--surface)] px-5 py-4 ${ts.busy ? "motion-shimmer" : ""}`}>
        <p className="text-sm font-bold leading-relaxed">{보이는답변.headline}</p>

        {/* auto-fit: 뷰포트가 아니라 **이 컨테이너의 가용 폭**이 열 수를 정한다.
           좌우 패널(큐 340·속성 320)이 열려 있으면 뷰포트 브레이크포인트는 거짓말을
           한다 — 1600px 창에서도 본문은 672px뿐이었다 (실측). */}
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-3 gap-x-10">
          {보이는답변.blocks.map((b) => (
            <div key={b.rule} className="border-t border-[var(--line)] pt-3">
              <p className="text-2xs font-semibold text-[var(--muted-soft)]">
                <span aria-hidden className={`mr-1 ${표시[b.level].markCls}`}>
                  {표시[b.level].mark}
                </span>
                {b.level}
                <span className="ml-1.5 font-mono font-normal">{b.rule}</span>
              </p>
              {b.lines.map((l, i) => (
                <p
                  key={i}
                  className={`mt-1 text-sm leading-relaxed ${
                    l.startsWith("근거:")
                      ? "text-xs text-[var(--muted)]"
                      : ""
                  }`}
                >
                  {l}
                </p>
              ))}
            </div>
          ))}
        </div>

        {보이는답변.todo.length > 0 && (
          <div className="mt-3 border-t-2 border-[var(--line-strong)] pt-3">
            <p className="text-sm font-bold">다음에 하실 일</p>
            <ol className="mt-1 list-inside list-decimal text-sm leading-relaxed">
              {보이는답변.todo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-3 border-t border-[var(--line)] pt-2.5">
          {보이는답변.notices.map((n) => (
            <p key={n} className="text-2xs leading-relaxed text-[var(--muted)]">
              {n}
            </p>
          ))}
          {번역보는중 && (
            /* 이 줄은 모델 출력이 아니라 화면이 붙인다 — 번역기에게 자기 고지를 맡기지 않는다 */
            <p className="mt-1 text-2xs leading-relaxed text-[var(--muted-soft)]">
              기계 번역({ts.done!.model})입니다. 금액, 날짜, 조문이 한국어 원문과 같은지 확인했습니다.
              뜻이 다르게 읽히면 한국어 원문이 우선입니다.
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-center text-xs leading-relaxed text-[var(--muted)]">
        <span className="block">이 답변의 금액, 날짜, 조문은 판정 단계에서 계산한 값 그대로입니다.</span>
        <span className="block">번역은 문장만 옮기며, 숫자가 달라지면 한국어 원문을 보여 드립니다.</span>
      </p>
    </div>
  );
}

/* ── 근거 ── */

export function EvidenceTab({ skillId }: { skillId: "payslip" | "departure" }) {
  return (
    <div className="w-full">
      {/* 근거 카드 — 가용 폭이 허락하는 만큼 열을 늘린다 (목록 순서보다 훑어보기) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(21rem,1fr))] gap-3">
        {standardsFor(skillId).map((s) => (
          <StandardCard key={s.code} s={s} />
        ))}
      </div>
      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold">
          대조 기준값 (2026)
          <span className="ml-2 font-normal text-[var(--muted)]">
            1년에 한 번 갱신합니다
          </span>
        </summary>
        <table className="mt-2 w-full max-w-md text-xs">
          <tbody>
            {Object.entries(기준2026).map(([k, v]) => (
              <tr key={k} className={셀}>
                <td className="py-1.5 text-[var(--muted)]">{k}</td>
                <td className="text-right font-mono">
                  {typeof v === "number" ? v.toLocaleString("ko-KR") : String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ── 검증 ── */

export function VerifyTab({
  harness,
  selfTest,
  log,
  demonstrates,
  narratorLive = false,
  agentLive = false,
}: {
  harness: Manifest;
  selfTest: SelfTestResult | null;
  log: HookLogEntry[];
  demonstrates: string;
  narratorLive?: boolean;
  agentLive?: boolean;
}) {
  const live = (n: number, total: number) => `작동 중 ${n} · 예정 ${total - n}`;
  const agentMark = (a: { id: string; live: boolean; gate?: string }) => {
    if (a.live) return { char: "●", cls: "text-[var(--accent)]" };
    if (a.gate === "env") {
      const isNarrator = a.id === "narrator";
      const providerLive = isNarrator ? narratorLive : agentLive;
      if (providerLive) return { char: "●", cls: "text-[var(--accent)]" };
      return { char: "◐", cls: "text-[var(--accent)]" };
    }
    return { char: "○", cls: "text-[var(--muted-soft)]" };
  };
  return (
    <div className="max-w-5xl">
      {/*
       * 좌측 액센트 바를 사방 1px 테두리로 바꿨다. 좌측 바는 좌우가 비대칭이라
       * 아래 두 칸 격자와 왼쪽 선이 맞지 않고, 파란 바를 여기에 쓰면 판정 카드의
       * 빨간 테두리와 같은 문법을 장식으로 소비하게 된다.
       * 선행 표식은 굵은 글자 라벨이 맡는다 — 색이 사라져도 남는 단서다.
       */}
      <p className="rounded-[var(--radius-card)] border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-4 py-3 text-sm leading-relaxed">
        <span className="font-semibold">이 사례에서 확인하는 것:</span>{" "}
        {demonstrates}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--line)] p-4">
          <p className="text-sm font-semibold">
            에이전트{" "}
            <span className="font-normal text-[var(--muted)]">
              {(() => {
                const marks = harness.agents.map((a) => agentMark(a).char);
                const liveCnt = marks.filter((c) => c === "●").length;
                const waitCnt = marks.filter((c) => c === "◐").length;
                const planCnt = marks.filter((c) => c === "○").length;
                return waitCnt > 0 ? `작동 중 ${liveCnt} · 연결 대기 ${waitCnt} · 예정 ${planCnt}` : live(liveCnt, harness.agents.length);
              })()}
            </span>
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {harness.agents.map((a) => {
              const m = agentMark(a);
              return (
                <li key={a.id}>
                  <span className={`font-mono ${m.cls}`}>{m.char} {a.id}</span> <span className="text-[var(--muted)]">{a.role}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg border border-[var(--line)] p-4">
          <p className="text-sm font-semibold">
            명령{" "}
            <span className="font-normal text-[var(--muted)]">
              {live(
                harness.commands.filter((c) => c.live).length,
                harness.commands.length,
              )}
            </span>
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {harness.commands.map((c) => (
              <li key={c.id}>
                <span
                  className={`font-mono ${c.live ? "text-[var(--accent)]" : "text-[var(--muted-soft)]"}`}
                >
                  {c.live ? "●" : "○"} {c.id}
                </span>{" "}
                <span className="text-[var(--muted)]">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {selfTest && selfTest.issues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-[var(--radius-m)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning-ink)]">
          {selfTest.issues.map((i) => (
            <li key={i.check}>
              <span className="font-semibold">{i.check}</span> — {i.detail}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold">
          자동 점검 기록
          <span className="ml-2 font-normal text-[var(--muted)]">
            시각 대신 순번으로 기록합니다
          </span>
        </summary>
        {log.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">아직 기록 없음</p>
        ) : (
          <table className="mt-2 w-full text-xs">
            <tbody>
              {log.map((e) => (
                <tr key={e.seq} className={셀}>
                  <td className="py-1.5 font-mono text-[var(--muted-soft)]">
                    #{e.seq}
                  </td>
                  <td className="font-mono">{e.hook}</td>
                  <td className="text-right">
                    {e.violations.length ? (
                      <span className="text-[var(--warning-ink)]">
                        차단 {e.violations.length}건
                      </span>
                    ) : (
                      <span className="text-[var(--accent)]">통과</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">
          필수 고지
        </summary>
        <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-[var(--muted)]">
          {harness.rules.requiredNotices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
