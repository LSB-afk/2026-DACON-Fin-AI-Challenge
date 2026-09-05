"use client";

/**
 * 사용자 화면 — 외국인 근로자가 직접 보는 흐름.
 *
 * 운영자 콘솔 14뷰는 심사·검증용이다. 정작 1차 고객(출국을 앞둔 E-9 근로자)이
 * 보는 화면이 없었다 — 이 파일이 그 분리다. 다섯 걸음을 한 화면 세로로:
 *   ① 상황 입력 → ② 값 확인 → ③ 받을 돈(확정·추정 분리) → ④ 마감일
 *   → ⑤ 다음 행동(어디에 무엇을 내나)
 *
 * 독립 컴포넌트다 — 판정·조립은 순수 함수라 콘솔 상태를 빌릴 필요가 없다.
 * 이 화면은 서버를 부르지 않는다.
 *
 * 옛 ⑥ "내 언어로 보기"(답변 4개 언어 번역, /api/narrate)는 2026-09-03 제거했다.
 * 화면 전체 자동 번역(app/_uiTranslator.tsx)이 같은 일을 20개 언어로 하므로
 * 번역 기능이 두 곳에 있을 이유가 없다. 답변 탭 번역은 판정 결과 보기에 남아 있다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { judgeDeparture, type DepartureInput, type Visa } from "@/lib/rules/departure";
import { moneyTotals, type Finding } from "@/lib/rules/types";
import { narrate, type Answer } from "@/lib/narrate";
import { departureHarness } from "@/lib/harness/registry";
import { checkAllGuardrails } from "@/lib/harness/guardrails";
import { getSkill } from "@/lib/skills";
import { 연락처 } from "@/lib/rules/constants-departure";
import { Icon, 표시 } from "./_ui";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const 필드 =
  "w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm";
const 라벨 = "block text-2xs font-bold text-[var(--muted)]";

/** 걸음 머리 — 번호가 큰 이유: 이 화면의 사용자는 처음 온 사람뿐이다 */
const 걸음 = ({ n, title, desc }: { n: number; title: string; desc?: string }) => (
  <div id={`user-step-${n}`} className="mt-8 flex items-start gap-3 border-t-2 border-[var(--line-strong)] pt-4 first:mt-0 first:border-t-0 first:pt-0">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-base font-bold text-white">
      {n}
    </span>
    <div>
      <h2 className="text-lg font-bold leading-tight">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-[var(--muted)]">{desc}</p>}
    </div>
  </div>
);

export function UserView({ initialToday, onDeadlineViewed, onActionsViewed, autoRunKey = 0, onSubmit, onOpenMonitor }: {
  initialToday: string;
  onDeadlineViewed?: () => void;
  onActionsViewed?: () => void;
  /** 페이전트 원터치 — 키가 오르면 판정을 실행해 ④~⑤ 걸음이 보이게 한다 */
  autoRunKey?: number;
  /** [받을 돈 확인하기]를 누른 입력 — 판정 결과 보기의 상담 큐로 그대로 넘어간다 (2026-09-05) */
  onSubmit?: (input: Omit<DepartureInput, "today">) => void;
  /** 넘어간 케이스를 보러 가는 문 */
  onOpenMonitor?: () => void;
}) {
  const [nationality, setNationality] = useState("베트남");
  const [visa, setVisa] = useState<Visa>("E-9");
  const [hireDate, setHireDate] = useState("2023-10-15");
  const [departureDate, setDepartureDate] = useState("2026-10-15");
  const [wage, setWage] = useState(2_150_000);
  const [today] = useState(initialToday);
  const [ran, setRan] = useState(false);

  /* 페이전트가 "마감을 보여줘"를 대행할 때 — ④걸음은 판정 후에만 존재하므로
     판정을 대신 실행한다(순수 계산이라 안전). 렌더 중 조정 패턴.
     prev 초기값을 0으로 고정하는 이유: 뷰 전환과 키 증가가 한 배치라 이 컴포넌트는
     키가 이미 오른 채로 마운트된다 — 초기값을 prop으로 잡으면 첫 조정이 죽는다. */
  const [prevAutoRun, setPrevAutoRun] = useState(0);
  if (autoRunKey !== prevAutoRun) {
    setPrevAutoRun(autoRunKey);
    if (autoRunKey > 0) setRan(true);
  }
  /* 대행 실행도 손으로 누른 것과 같이 입력을 상담 큐로 넘긴다 (부모 상태 갱신은 렌더 밖에서).
     키 하나에 한 번만 — 입력값이 바뀌어도 같은 키로는 다시 넘기지 않는다 */
  const submittedKeyRef = useRef(0);
  useEffect(() => {
    if (autoRunKey > 0 && submittedKeyRef.current !== autoRunKey) {
      submittedKeyRef.current = autoRunKey;
      onSubmit?.({ nationality, visa, hireDate, departureDate, monthlyWage: wage });
    }
  }, [autoRunKey, onSubmit, nationality, visa, hireDate, departureDate, wage]);

  const findings: Finding[] = useMemo(
    () =>
      ran
        ? judgeDeparture({ nationality, visa, hireDate, departureDate, monthlyWage: wage, today })
        : [],
    [ran, nationality, visa, hireDate, departureDate, wage, today],
  );
  const totals = moneyTotals(findings);
  const guard = useMemo(
    () => (findings.length ? checkAllGuardrails(findings, departureHarness) : []),
    [findings],
  );
  const answer: Answer | null = useMemo(
    () => (ran ? narrate(findings, departureHarness.rules.requiredNotices) : null),
    [ran, findings],
  );

  const 마감들 = findings
    .filter((f) => f.deadline && f.level !== "정상")
    .sort((a, b) => a.deadline!.daysLeft - b.deadline!.daysLeft);

  // 5걸음 진행 → 진행 상황 연동: 마감·다음행동 열람 시 플래그
  const prevRan = useRef(ran);
  useEffect(() => {
    if (ran && !prevRan.current) {
      const id = requestAnimationFrame(() => {
        if (마감들.length > 0) onDeadlineViewed?.();
        onActionsViewed?.();
      });
      return () => cancelAnimationFrame(id);
    }
    prevRan.current = ran;
  }, [ran, 마감들.length, onDeadlineViewed, onActionsViewed]);

  const 국적옵션 = getSkill("departure").requiredInputs.find(
    (i) => i.key === "nationality",
  )!.options!;

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <span className="eyebrow">FOR WORKERS</span>
      <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
        출국 전에, 받을 돈을 확인하세요
      </h1>
      {/* 문장마다 줄을 바꾼다 — 폭 캡에서 문장 한가운데가 꺾이지 않게 (2026-09-02) */}
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
        <span className="block">
          한국에서 일한 기간과 월급을 바탕으로 <strong className="text-[var(--ink)]">돌려받을 수 있는 돈과 마감일</strong>을 법 기준에 맞춰 알려드립니다.
        </span>
        <span className="block">결과 화면은 보험사나 공단에 상담할 때 그대로 보여 주면 됩니다.</span>
        <span className="block">계좌를 만들어 주거나 돈을 빌려 주는 서비스는 아닙니다.</span>
      </p>
      <div className="mt-4 border-b-2 border-[var(--line-strong)]" />
      <div className="mt-6" />

      {/* ① 입력 */}
      <걸음 n={1} title="상황을 알려주세요" desc="다섯 칸만 채우면 됩니다. 이름, 전화번호, 계좌번호는 묻지 않습니다." />
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className={라벨}>
            국적
            {/* id: 페이전트 원터치(G1)가 여기로 스크롤·포커스한다 */}
            <select id="user-first-field" value={nationality} onChange={(e) => { setNationality(e.target.value); setRan(false); }} className={`mt-1 ${필드}`}>
              {국적옵션.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className={라벨}>
            체류자격 (비자)
            <select value={visa} onChange={(e) => { setVisa(e.target.value as Visa); setRan(false); }} className={`mt-1 ${필드}`}>
              {["E-9", "H-2", "E-8", "기타"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={라벨}>
            일 시작한 날
            <input type="date" value={hireDate} onChange={(e) => { setHireDate(e.target.value); setRan(false); }} className={`mt-1 ${필드}`} />
          </label>
          <label className={라벨}>
            출국(예정)일
            <input type="date" value={departureDate} onChange={(e) => { setDepartureDate(e.target.value); setRan(false); }} className={`mt-1 ${필드}`} />
          </label>
        </div>
        <label className={라벨}>
          월급 (평균)
          <input type="number" value={wage} onChange={(e) => { setWage(Number(e.target.value) || 0); setRan(false); }} className={`mt-1 ${필드}`} />
        </label>
      </div>

      {/* ② 확인 → 실행 */}
      <걸음 n={2} title="확인하기" desc="버튼을 누르면 바로 계산합니다. 같은 내용을 넣으면 언제 눌러도 같은 결과가 나옵니다." />
      <button
        onClick={() => {
          setRan(true);
          onSubmit?.({ nationality, visa, hireDate, departureDate, monthlyWage: wage });
        }}
        className="motion-press mt-3 w-full rounded-xl bg-[var(--accent)] py-3.5 text-base font-bold text-white hover:bg-[var(--accent-hover)]"
      >
        받을 돈 확인하기
      </button>
      {/* 같은 입력이 판정 결과 보기의 상담 큐에 담겼다 — 거기서 판정 실행·에이전트 실행을 누른다 */}
      {ran && onSubmit && (
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-xs text-[var(--accent-ink)]">
          <span>입력한 내용이 [판정 결과 보기]의 상담 큐에 담겼습니다.</span>
          {onOpenMonitor && (
            <button type="button" onClick={onOpenMonitor} className="font-bold underline underline-offset-2 hover:text-[var(--accent)]">
              판정 결과 보기로 이동 →
            </button>
          )}
        </p>
      )}
      {ran && guard.length > 0 && (
        <p className="mt-2 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
          결과를 보여 드리기 전 검사에서 문제가 발견되어 결과를 표시하지 않았습니다. 고용노동부 상담 창구에 문의해 주세요.
        </p>
      )}

      {ran && findings.length > 0 && (
        <>
          {/* ③ 받을 돈 — 영수증 문법. 확정·추정·확인필요를 절대 합치지 않는다 */}
          <걸음 n={3} title="받을 수 있는 돈" desc="이미 정해진 돈과 아직 예상인 돈은 따로 보여 드립니다. 둘을 합쳐서 말하지 않습니다." />
          {(() => {
            /* moneyTotals(types.ts)와 같은 분류 — 확정=범위 없는 확실한 금액,
               추정=amountRange, 참고=확인필요의 금액(총액 비합산) */
            const 돈있는 = findings.filter((f) => f.level !== "정상" && f.level !== "수령불가");
            const 확정줄 = 돈있는.filter((f) => f.level !== "확인필요" && f.amount !== undefined && !f.amountRange);
            const 추정줄 = 돈있는.filter((f) => f.level !== "확인필요" && f.amountRange);
            const 참고줄 = 돈있는.filter((f) => f.level === "확인필요" && f.amount !== undefined);
            /* 영수증 항목명 — track("보험")은 S2-1·S2-2가 겹쳐 품목 구분이 안 된다.
               표기만 여기서 정하고, 판정 내용의 진실은 여전히 f.title이다 */
            const 항목명: Record<string, string> = {
              "S2-1": "출국만기보험 (퇴직금)",
              "S2-2": "귀국비용보험",
              "S2-3": "국민연금 반환일시금",
              "S2-4": "퇴직금 차액",
            };
            const 줄 = (f: Finding) => 항목명[f.rule] ?? f.track ?? f.title;
            return (
              <div className="receipt-field mt-3 px-4 py-5 sm:px-8">
                <div className="mx-auto max-w-sm">
                  <div className="receipt-zigzag receipt-zigzag--top" aria-hidden />
                  <div className="receipt-paper px-5 py-4">
                    {/* 머리 — 상호·문서명·기준 정보 */}
                    <p className="text-center text-2xs font-bold tracking-[0.2em] text-[var(--muted)]">PAYCHECK</p>
                    <p className="mt-0.5 text-center text-base font-bold tracking-tight">출국 정산 확인 영수증</p>
                    <p className="mt-1 text-center text-2xs text-[var(--muted)]">
                      기준일 {today} · {nationality} · {visa}
                    </p>
                    <p className="text-center text-2xs text-[var(--muted-soft)]">미리 확인하는 용도입니다. 실제 지급은 각 기관의 절차를 따릅니다</p>

                    {/* 확정 — 산식으로 정해진 돈 */}
                    <div className="receipt-dash mt-3 pt-2.5">
                      <p className="text-2xs font-bold text-[var(--muted)]">확정된 돈</p>
                      {확정줄.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--muted-soft)]">해당 없음</p>
                      ) : (
                        확정줄.map((f) => (
                          <div key={f.rule} className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              {줄(f)} <span className="font-mono text-2xs text-[var(--muted-soft)]">{f.rule}</span>
                            </span>
                            <span className="shrink-0 font-mono font-semibold">{won(f.amount!)}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 추정 — 기관 확인 후 정해질 돈 */}
                    <div className="receipt-dash mt-2.5 pt-2.5">
                      <p className="text-2xs font-bold text-[var(--muted)]">예상 금액 (기관 확인 후 확정)</p>
                      {추정줄.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--muted-soft)]">해당 없음</p>
                      ) : (
                        추정줄.map((f) => (
                          <div key={f.rule} className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              {줄(f)} <span className="font-mono text-2xs text-[var(--muted-soft)]">{f.rule}</span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-mono text-xs">
                              약 {won(f.amountRange!.min)}~{won(f.amountRange!.max)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 합계 — 확정만 크게. 예상은 범위 그대로, 참고는 밖에 */}
                    <div className="receipt-dash mt-2.5 pt-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-bold">확정 합계</span>
                        <span className="font-mono text-2xl font-bold tracking-tight">{won(totals.확정)}</span>
                      </div>
                      {totals.추정 && (
                        <div className="mt-1 flex items-baseline justify-between gap-3">
                          <span className="text-xs text-[var(--muted)]">예상 합계</span>
                          <span className="whitespace-nowrap font-mono text-sm font-semibold">
                            약 {won(totals.추정.min)} ~ {won(totals.추정.max)}
                          </span>
                        </div>
                      )}
                      {totals.확인필요참고 > 0 && (
                        <div className="mt-1 flex items-baseline justify-between gap-3">
                          <span className="text-xs text-[var(--muted)]">따로 확인할 금액</span>
                          <span className="font-mono text-sm text-[var(--muted)]">{won(totals.확인필요참고)}</span>
                        </div>
                      )}
                      {참고줄.length > 0 && (
                        <p className="mt-1 text-2xs leading-relaxed text-[var(--muted-soft)]">
                          따로 확인할 금액({참고줄.map((f) => f.rule).join("·")})은 위 금액과 겹칠 수 있어 합계에 넣지 않았습니다.
                        </p>
                      )}
                      {totals.확정 === 0 && !totals.추정 && (
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                          지금 입력한 조건으로는 받을 수 있는 돈이 확인되지 않았습니다. 이유는 아래 항목별 설명에 있습니다.
                        </p>
                      )}
                    </div>

                    {/* 바닥 — 승인번호 자리에는 지어낸 번호 대신 실제 판정 룰을 적는다 */}
                    <div className="receipt-dash mt-2.5 pt-2 text-center">
                      <p className="font-mono text-2xs text-[var(--muted-soft)]">
                        적용한 검사 규칙 {findings.map((f) => f.rule).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-[var(--muted-soft)]">
                        같은 내용을 넣으면 같은 결과가 나옵니다. 법률 자문이 아니라 서류를 기준과 대조한 결과입니다.
                      </p>
                    </div>
                  </div>
                  <div className="receipt-zigzag receipt-zigzag--bottom" aria-hidden />
                </div>
              </div>
            );
          })()}
          <div className="mt-3 space-y-1.5">
            {findings.map((f, i) => (
              <p key={i} className="text-xs leading-relaxed">
                <span aria-hidden className={표시[f.level].markCls}>{표시[f.level].mark}</span>{" "}
                <strong>{f.level}</strong> · {f.title}
              </p>
            ))}
          </div>

          {/* ④ 마감 */}
          <걸음 n={4} title="언제까지?" desc="마감이 지나면 절차가 복잡해지거나 아예 받지 못할 수 있습니다." />
          <div className="mt-3 space-y-2">
            {마감들.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">지금 결과에는 다가오는 마감이 없습니다.</p>
            ) : (
              마감들.map((f) => (
                <div key={f.rule} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{f.deadline!.label}</p>
                    <p className="text-2xs text-[var(--muted)]">{f.rule}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold">{f.deadline!.date}</p>
                    <p className={`font-mono text-2xs font-bold ${f.deadline!.daysLeft <= 14 && f.deadline!.daysLeft >= 0 ? "text-[var(--warning-ink)]" : "text-[var(--muted)]"}`}>
                      {f.deadline!.daysLeft >= 0 ? `D-${f.deadline!.daysLeft}` : `${-f.deadline!.daysLeft}일 지남`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ⑤ 다음 행동 */}
          <걸음 n={5} title="다음에 할 일" desc="아래 연락처에 이 화면을 그대로 보여 주며 상담하면 됩니다." />
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-sm leading-relaxed">
            {(answer?.todo ?? []).map((t) => <li key={t}>{t}</li>)}
          </ol>
          <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
            <p><strong className="text-[var(--ink)]">보험(출국만기·귀국비용)</strong> — {연락처.보험사}</p>
            <p className="mt-1"><strong className="text-[var(--ink)]">국민연금</strong> — {연락처.국민연금}</p>
            <p className="mt-1"><strong className="text-[var(--ink)]">공항 수령</strong> — {연락처.공항수령}</p>
            <p className="mt-1 text-[var(--muted-soft)]">{연락처.공항수령_조건}</p>
          </div>
        </>
      )}

      <p className="mt-10 border-t border-[var(--line)] pt-3 pb-8 text-center text-2xs leading-relaxed text-[var(--muted-soft)]">
        <span className="block"><Icon name="lock" cls="mr-1 inline h-3 w-3" />입력한 내용은 저장되지 않으며, 이 결과는 법률 자문이 아니라 서류를 기준과 대조한 결과입니다.</span>
        <span className="block">급여명세서 검사는 왼쪽 메뉴의 [판정 결과 보기]에서 할 수 있습니다.</span>
      </p>
    </div>
  );
}
