"use client";

/**
 * 실행 모니터 외의 화면들.
 *
 * 내비게이션에 항목만 있고 열리면 그건 UI가 아니라 목업이다.
 * 여기 있는 화면은 전부 실제 데이터를 읽어서 그린다 — 지어낸 숫자가 없다.
 * 시나리오 추천·승인 권한도 2026-08-26 에 열렸다: 전자는 골든셋 그룹에서,
 * 후자는 검증 장치와 승인 대기 목록에서 값을 가져온다. 계정 체계가 없다는
 * 사실까지 포함해서 정직하게 그린다.
 */

import { useState } from "react";
import { cases, type Case } from "@/lib/cases";
import { skills } from "@/lib/skills";
import { standards, verifyCounts } from "@/lib/standards";
import { listHarnesses, runSelfTest, hookLog } from "@/lib/harness/core";
import { GUARDRAIL_CATALOG, LEVEL_MEANING } from "@/lib/harness/guardrails";
import { 기준2026 } from "@/lib/rules/constants-2026";
import { OntologyWorkspace, type OntologyExecution } from "./_ontology";
import { buildLiveOntology, type LiveOntologyInput } from "@/lib/ontology/live";
import type { AgentLoop } from "./_agent-core";
import { SectionHead, SubHead, Sentences, Pill, EmptyBox, StandardCard, Icon, won, navLabel, badgeTone } from "./_ui";



/**
 * 모델 호출 원장 한 줄 — 페이퍼클립의 Budget&Costs 를 우리 몸에 맞춘 것.
 * 이 제품에서 모델은 0·1단(라우팅·추출)과 3단(번역)에서만 불리고, 그때마다
 * 제공자 응답의 토큰 수와 왕복 시간이 여기 적힌다. 계약에 걸려 버려진 호출도
 * 적는다 — 버려진 호출도 돈은 쓴 호출이다.
 */
export type ModelCall = {
  seq: number;
  /** 어느 단이 불렀나 — "0단 LLM 라우팅" · "1단 발화 추출" · "3단 번역 · 베트남어" */
  stage: string;
  provider: string;
  model: string;
  ms?: number;
  inTok?: number;
  outTok?: number;
  /** 계약(evidence·숫자 보존·형식)을 통과해 화면에 나갔는가 */
  ok: boolean;
  /** 실패 사유 — 통과 못 한 호출은 이유와 함께 남는다 */
  note?: string;
};

export type RunEntry = {
  seq: number;
  caseId: string;
  utterance: string;
  skill: string;
  findings: number;
  /** 확정 금액 — 산식으로 정해지는 돈만. 추정과 절대 합치지 않는다 */
  확정: number;
  /** 추정 범위 — 없으면 null */
  추정min: number | null;
  추정max: number | null;
  guardViolations: number;
  today: string;
};

const 셀 = "border-b border-[var(--line-soft)] py-2";
const 카드 = "rounded-lg border border-[var(--line)] p-4";

const Wrap = ({
  en,
  ko,
  desc,
  right,
  readme,
  children,
}: {
  en: string;
  ko: string;
  desc: string;
  right?: React.ReactNode;
  readme?: string[];
  children: React.ReactNode;
}) => (
  <div className="px-4 py-6 min-[1024px]:px-8">
    <SectionHead en={en} ko={ko} right={right} />
    {/* 문장 단위 줄바꿈 — 폭 캡은 아주 긴 문장만 잡는다 */}
    <Sentences text={desc} className="mt-1.5 max-w-5xl text-sm leading-relaxed text-[var(--muted)]" />
    {readme && readme.length > 0 && (
      <div className="mt-3 rounded-lg border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2.5">
        <p className="text-2xs font-bold text-[var(--accent)]">이 화면 읽는 법</p>
        <ol className="mt-1 list-decimal list-inside space-y-0.5 text-xs leading-relaxed text-[var(--accent)]">
          {readme.map((r, i) => (
            <li key={i} className="text-[var(--muted)]">
              <span className="text-[var(--ink)]">{r}</span>
            </li>
          ))}
        </ol>
      </div>
    )}
    {/* 머리와 본문을 가르는 괘선 — 제목이 흘러내려 본문과 섞이지 않게 */}
    <div className="mt-4 border-b-2 border-[var(--line-strong)]" />
    <div className="mt-5 pb-10">{children}</div>
  </div>
);

/* ── 감사 기록 ── */

export function AuditView({ runs, modelCalls = [], onSelectCase }: { runs: RunEntry[]; modelCalls?: ModelCall[]; onSelectCase?: (caseId: string) => void }) {
  const log = hookLog();
  return (
    <Wrap
      en="AUDIT LEDGER"
      ko={navLabel("audit")}
      desc="이 창에서 실행한 판정과 검사 결과의 기록입니다. 기록은 쌓이기만 하고 고쳐지지 않습니다. 시각 대신 순번을 쓰는 이유는, 같은 입력이면 언제 실행해도 같은 기록이 남아야 하기 때문입니다."
      right={
        <div className="flex gap-1.5">
          <Pill>판정 {runs.length}건</Pill>
          <Pill tone={modelCalls.length ? "accent" : "muted"}>AI 호출 {modelCalls.length}회</Pill>
        </div>
      }
      readme={[
        "표의 순번과 검사 결과(통과/차단)를 먼저 봅니다. 차단이 있으면 그 판정을 의심해 봅니다.",
        "줄을 누르면 그 상담으로 이동해 판정과 근거를 확인할 수 있습니다.",
        "아래 자동 점검 기록은 코드가 언제 어느 단계를 검사했는지 남긴 흔적입니다.",
      ]}
    >
      {runs.length === 0 ? (
        <EmptyBox>
          실행 모니터에서 판정을 실행하면 여기에 기록이 쌓입니다.
        </EmptyBox>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--line-strong)] text-left text-xs font-semibold text-[var(--muted)]">
              <th className="py-2">#</th>
              <th>상담</th>
              <th>검사</th>
              <th>기준일</th>
              <th className="text-right">판정</th>
              <th className="text-right">확정</th>
              <th className="text-right">추정</th>
              <th className="text-right">검사 결과</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.seq}
                className={`${셀} ${onSelectCase ? "cursor-pointer hover:bg-[var(--surface)]" : ""}`}
                onClick={() => onSelectCase?.(r.caseId)}
                title={onSelectCase ? "클릭하면 해당 상담으로 이동" : undefined}
              >
                <td className="py-2 font-mono text-[var(--muted-soft)]">
                  {r.seq}
                </td>
                <td className="font-mono text-xs">{r.caseId}</td>
                <td className="text-xs">{r.skill}</td>
                <td className="font-mono text-xs">{r.today}</td>
                <td className="text-right">{r.findings}건</td>
                <td className="text-right font-mono">
                  {r.확정 ? won(r.확정) : "—"}
                </td>
                <td className="text-right font-mono text-xs">
                  {r.추정min != null ? `~${won(r.추정max!)}` : "—"}
                </td>
                <td className="text-right">
                  {r.guardViolations ? (
                    <span className="text-[var(--warning-ink)]">차단 {r.guardViolations}</span>
                  ) : (
                    <span className="text-[var(--accent)]">통과</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SubHead
        desc="판정은 AI 모델 없이 실행됩니다. AI 모델이 쓰인 자리는 모두 여기에 기록합니다. 검사에 걸려 화면에 나가지 못한 호출도 비용은 든 호출이므로 함께 셉니다. 토큰 수는 제공자가 응답에 적어 준 값을 그대로 읽습니다."
        right={
          modelCalls.length > 0 ? (
            <span className="text-xs font-semibold text-[var(--muted)]">
              입력 {modelCalls.reduce((a, c) => a + (c.inTok ?? 0), 0).toLocaleString("ko-KR")} tok
              {" · "}출력 {modelCalls.reduce((a, c) => a + (c.outTok ?? 0), 0).toLocaleString("ko-KR")} tok
              {" · "}{(modelCalls.reduce((a, c) => a + (c.ms ?? 0), 0) / 1000).toFixed(1)}초
            </span>
          ) : undefined
        }
      >
        모델 호출 — 토큰·시간 원장
      </SubHead>
      {modelCalls.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          이 세션에서 모델을 부른 적이 없습니다 — 판정·가드레일·답변 조립은 모델 없이 돌았습니다.
        </p>
      ) : (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--line-strong)] text-left font-semibold text-[var(--muted)]">
              <th className="py-2">#</th>
              <th>단계</th>
              <th>서비스 · 모델</th>
              <th className="text-right">토큰 (입력→출력)</th>
              <th className="text-right">시간</th>
              <th className="text-right">결과</th>
            </tr>
          </thead>
          <tbody>
            {modelCalls.map((c) => (
              <tr key={c.seq} className={셀} title={c.note}>
                <td className="py-2 font-mono text-[var(--muted-soft)]">{c.seq}</td>
                <td className="font-semibold">{c.stage}</td>
                <td className="font-mono text-2xs text-[var(--muted)]">
                  {c.provider} · {c.model}
                </td>
                <td className="text-right font-mono">
                  {c.inTok !== undefined || c.outTok !== undefined
                    ? `${(c.inTok ?? 0).toLocaleString("ko-KR")} → ${(c.outTok ?? 0).toLocaleString("ko-KR")}`
                    : "—"}
                </td>
                <td className="text-right font-mono">
                  {c.ms !== undefined ? `${(c.ms / 1000).toFixed(1)}초` : "—"}
                </td>
                <td className="text-right">
                  {c.ok ? (
                    <span className="font-semibold text-[var(--accent)]">통과</span>
                  ) : (
                    <span className="font-semibold text-[var(--warning-ink)]">차단</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SubHead>자동 점검 기록</SubHead>
      {log.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--muted)]">기록 없음</p>
      ) : (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {log.slice(0, 20).map((e) => (
              <tr key={e.seq} className={셀}>
                <td className="py-1.5 font-mono text-[var(--muted-soft)]">
                  #{e.seq}
                </td>
                <td className="font-mono">{e.harnessId}</td>
                <td className="font-mono">{e.hook}</td>
                <td className="text-right">
                  {e.violations.length ? (
                    <span className="text-[var(--warning-ink)]">
                      {e.violations.join(" / ")}
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
    </Wrap>
  );
}

/* ── 산출물 ── */

export function ArtifactsView({
  runs,
  latestJson,
}: {
  runs: RunEntry[];
  latestJson: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Wrap
      en="ARTIFACTS"
      ko={navLabel("artifacts")}
      desc="판정 결과를 그대로 파일로 내려받습니다. 화면에 표시된 값을 직접 확인하고 싶을 때 쓰세요."
      right={<Pill>{runs.length ? "최근 실행 기준" : "실행 전"}</Pill>}
    >
      <div className="flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(latestJson);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          {copied ? "복사됨" : "판정 JSON 복사"}
        </button>
        <a
          href={`data:application/json;charset=utf-8,${encodeURIComponent(latestJson)}`}
          download="paycheck-findings.json"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)]"
        >
          파일로 내려받기
        </a>
      </div>
      <pre className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-2xs leading-relaxed">
        {latestJson}
      </pre>
    </Wrap>
  );
}

/* ── 기준 적합성 맵 ── */

export function StandardsMapView() {
  const vc = verifyCounts();
  return (
    <Wrap
      en="STANDARDS MAP"
      ko={navLabel("standards-map")}
      desc="판정에 쓰는 근거 문서와 각 문서를 어디까지 확인했는지 보여 줍니다. 아직 원문으로 확인하지 못한 문서도 숨기지 않고 표시합니다. 그래야 남은 할 일이 그대로 보입니다."
      right={
        <div className="flex gap-1.5">
          <Pill tone="accent">원본 {vc.원본확인}</Pill>
          <Pill>판례 {vc.판례}</Pill>
          <Pill tone="warn">확인 대기 {vc["2차출처"]}</Pill>
        </div>
      }
      readme={[
        "위쪽 배지에서 원본 확인 수와 확인 대기 수를 먼저 봅니다. 확인 대기 수가 곧 남은 할 일입니다.",
        "주황색은 원문을 아직 대조하지 못한 문서이고, 파란색은 원문 대조를 마친 문서입니다.",
        "아래 기준값 표는 판정이 읽는 유일한 숫자입니다. 이 표에 없는 숫자는 코드에도 없습니다.",
      ]}
    >
      {/*
       * 상태별로 묶는다 — 확인 대기(할 일)가 맨 위. 한 목록에 섞어 두면 스무 장 카드가
       * 같은 무게로 보여 "어느 것이 급한가"를 배지 색만으로 찾아야 했다(2026-09-02).
       */}
      {(
        [
          { state: "2차출처", title: "원문 확인 대기", desc: "언론 기사나 요약 자료를 보고 넣은 항목입니다. 원문과 대조하기 전까지 남은 할 일로 둡니다." },
          { state: "원본확인", title: "원본 확인 완료", desc: "법령, 고시, 공단 원문을 직접 읽고 기준값을 확정한 항목입니다." },
          { state: "판례", title: "판례", desc: "대법원 판결. 판정 규칙의 해석 근거입니다." },
        ] as const
      ).map((g) => {
        const 목록 = standards.filter((s) => s.state === g.state);
        if (목록.length === 0) return null;
        return (
          <section key={g.state} aria-label={g.title}>
            <SubHead desc={g.desc} right={<Pill tone={g.state === "2차출처" ? "warn" : g.state === "원본확인" ? "accent" : "muted"}>{목록.length}건</Pill>}>
              {g.title}
            </SubHead>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {목록.map((s) => (
                <StandardCard key={s.code} s={s} />
              ))}
            </div>
          </section>
        );
      })}

      <SubHead desc="판정 로직은 이 값만 참조합니다. 여기에 없는 숫자는 코드 어디에도 없습니다.">
        대조 기준값 (2026)
      </SubHead>
      <table className="mt-3 w-full max-w-lg text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--line-strong)] text-left text-2xs font-semibold text-[var(--muted)]">
            <th className="py-1.5 font-semibold">항목</th>
            <th className="py-1.5 text-right font-semibold">기준값</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(기준2026).map(([k, v]) => (
            <tr key={k} className={셀}>
              <td className="py-2 text-[var(--muted)]">{k}</td>
              <td className="text-right font-mono font-bold text-[var(--ink)]">
                {typeof v === "number" ? v.toLocaleString("ko-KR") : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  );
}

/* ── 판정 스킬 ── */

export function SkillsView() {
  return (
    <Wrap
      en="SKILLS"
      ko={navLabel("skills")}
      desc="여기 있는 검사 항목은 모두 실제 판정으로 이어집니다. 설명만 하고 판정하지 않는 항목은 두지 않습니다. 그런 항목은 이미 많은 다국어 안내 서비스와 다를 것이 없기 때문입니다."
      right={<Pill>{skills.length}종</Pill>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {skills.map((s) => (
          <div key={s.id} className={카드}>
            <div className="flex items-center justify-between">
              <p className="font-bold">{s.name}</p>
              <Pill tone="accent">규칙 {s.ruleCatalog.length}개</Pill>
            </div>
            <p className="mt-2 text-2xs text-[var(--muted)]">
              관련 단어 {s.triggers.length}개 · 필요한 입력 {s.requiredInputs.length}개
            </p>
            <table className="mt-3 w-full text-xs">
              <tbody>
                {s.ruleCatalog.map((r) => (
                  <tr key={r.rule} className={셀}>
                    <td className="py-1.5 font-mono text-[var(--muted-soft)]">
                      {r.rule}
                    </td>
                    <td>{r.name}</td>
                    <td className="text-right text-[var(--muted-soft)]">
                      {"note" in r ? (r.note as string) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.notCovered && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-[var(--warning-ink)]">
                  검사하지 않는 항목 {s.notCovered.length}종 (모든 것을 검사하지는 않습니다)
                </summary>
                <ul className="mt-1.5 list-inside list-disc text-2xs leading-relaxed text-[var(--muted)]">
                  {s.notCovered.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

/* ── 상담 큐 (전체) ── */

export function QueueView({
  onOpen,
}: {
  onOpen: (c: Case) => void;
}) {
  return (
    <Wrap
      en="CASE INBOX"
      ko={navLabel("queue")}
      desc="여기 있는 사례는 모두 만들어 낸 가상 자료입니다. 실제 개인정보가 없으므로 계정이나 업로드 없이 전 과정을 그대로 재현해 볼 수 있습니다."
      right={<Pill>{cases.length}건</Pill>}
    >
      {/*
       * 사례 카드 (2026-09-02 재설계) — 세 층:
       *   1층 제목: 발화(base·bold)가 맨 위, 코드는 그 옆에 작게. 사람은 코드가 아니라 말로 찾는다
       *   2층 요약: 보조 글자
       *   3층 증명: 옅은 하늘색 상자 — "이 사례가 무엇을 보여주는가"는 질문과 다른 층위다
       * 배지 색은 badgeTone — 종류마다 다르다.
       */}
      <div className="grid gap-3 lg:grid-cols-2">
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c)}
            className={`${카드} text-left hover:border-[var(--accent)] hover:shadow-[var(--shadow-2)]`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-bold leading-snug">
                {c.utterance}
                <span className="ml-2 align-middle font-mono text-2xs font-normal text-[var(--muted-soft)]">{c.id}</span>
              </p>
              <Pill tone={badgeTone(c.badge)}>{c.badge}</Pill>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              {c.summary}
            </p>
            <div className="mt-3 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-xs leading-relaxed text-[var(--ink)]">
              <span className="mr-1.5 font-bold text-[var(--accent-ink)]">이 사례에서 확인하는 것</span>
              {c.demonstrates}
            </div>
          </button>
        ))}
      </div>
    </Wrap>
  );
}

/* ── 하네스 ── */

export function HarnessView({
  onRunSelfTest,
  narratorLive = false,
  agentLive = false,
}: {
  onRunSelfTest: () => void;
  narratorLive?: boolean;
  agentLive?: boolean;
}) {
  const list = listHarnesses();
  const [feedback, setFeedback] = useState<{ at: number; count: number } | null>(null);
  const agentMarkHarness = (a: { id: string; live: boolean; gate?: string }) => {
    if (a.live) return { char: "●", cls: "text-[var(--accent)]" };
    if ((a as { gate?: string }).gate === "env") {
      const isNarrator = a.id === "narrator";
      const providerLive = isNarrator ? narratorLive : agentLive;
      if (providerLive) return { char: "●", cls: "text-[var(--accent)]" };
      return { char: "◐", cls: "text-[var(--warning)]" };
    }
    return { char: "○", cls: "text-[var(--muted-soft)]" };
  };
  return (
    <Wrap
      en="HARNESS"
      ko={navLabel("harness")}
      desc="AI 작동 규칙은 검사 항목, 실행 명령, 단계별 점검, 규칙, 가드레일, 검증 방법을 한 묶음으로 정해 둔 운영 규칙입니다. 여기에 등록된 것이 전부이며, 이름만 다른 복사본은 만들지 않습니다."
      right={<Pill>{list.length}종</Pill>}
      readme={[
        "위쪽 점검 배지(통과/이슈)를 먼저 봅니다. 이슈가 있으면 해당 규칙 묶음 카드로 갑니다.",
        "주황색 경고는 가드레일, 자동 점검, 작동 표시 중 하나가 규칙과 어긋났다는 신호입니다.",
        "점검 뒤에는 판정 이력과 결과 파일에서 기록을 대조합니다. 숫자보다 흔적을 확인합니다.",
      ]}
    >
      <button
        onClick={() => {
          onRunSelfTest();
          setFeedback({ at: Date.now(), count: list.length });
          setTimeout(() => setFeedback(null), 3000);
        }}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] motion-press"
      >
        전체 자체검증 실행
      </button>
      {feedback && (
        <p className="mt-3 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
          자체검증 실행됨 — 하네스 {feedback.count}종 점검 · 감사 기록에 실행 로그가 추가되었습니다
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {list.map((m) => {
          const st = runSelfTest(m.id);
          return (
            <div key={m.id} className={카드}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{m.displayName}</p>
                  <p className="font-mono text-2xs text-[var(--muted-soft)]">
                    {m.id}
                  </p>
                </div>
                <Pill tone={st.issues.length ? "warn" : "ok"}>
                  {st.issues.length ? `이슈 ${st.issues.length}` : `점검 ${st.passed}종 통과`}
                </Pill>
              </div>

              <p className="mt-3 text-xs font-semibold">
                에이전트{" "}
                <span className="font-normal text-[var(--muted)]">
                  {(() => {
                    const marks = m.agents.map((a) => agentMarkHarness(a).char);
                    const liveCnt = marks.filter((c) => c === "●").length;
                    const waitCnt = marks.filter((c) => c === "◐").length;
                    const planCnt = marks.filter((c) => c === "○").length;
                    return waitCnt > 0 ? `작동 중 ${liveCnt} · 연결 대기 ${waitCnt} · 예정 ${planCnt}` : `작동 중 ${liveCnt} · 예정 ${planCnt}`;
                  })()}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {m.agents.map((a) => {
                  const mm = agentMarkHarness(a);
                  return (
                    <li key={a.id}>
                      <span className={`font-mono ${mm.cls}`}>{mm.char} {a.id}</span> <span className="text-[var(--muted)]">{a.role}</span>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 text-xs font-semibold">
                명령{" "}
                <span className="font-normal text-[var(--muted)]">
                  작동 중 {m.commands.filter((c) => c.live).length} · 예정{" "}
                  {m.commands.filter((c) => !c.live).length}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {m.commands.map((c) => (
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

              <p className="mt-3 text-xs font-semibold">
                자동 점검{" "}
                <span className="font-normal text-[var(--muted)]">
                  {Object.keys(m.hooks).join(" · ")}
                </span>
              </p>

              <p className="mt-3 text-xs font-semibold">필수 고지</p>
              <ul className="mt-1 list-inside list-disc text-2xs leading-relaxed text-[var(--muted)]">
                {m.rules.requiredNotices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>

              {st.issues.length > 0 && (
                <ul className="mt-3 rounded border border-[var(--warning)] bg-[var(--warning-soft)] p-2 text-2xs text-[var(--warning-ink)]">
                  {st.issues.map((i) => (
                    <li key={i.check}>
                      {i.check} — {i.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Wrap>
  );
}

/* ── 근거/조문 검색 ── */

export function SearchView() {
  const [q, setQ] = useState("");
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [selectedStandard, setSelectedStandard] = useState<string | null>(null);
  const key = q.trim().toLowerCase();

  const hitStandards = key
    ? standards.filter((s) =>
        [s.code, s.title, s.scope, s.note].join(" ").toLowerCase().includes(key),
      )
    : [];
  const hitRules = key
    ? skills.flatMap((sk) =>
        sk.ruleCatalog
          .filter((r) =>
            [r.rule, r.name, "note" in r ? (r.note as string) : ""]
              .join(" ")
              .toLowerCase()
              .includes(key),
          )
          .map((r) => ({ ...r, skill: sk.name })),
      )
    : [];

  return (
    <Wrap
      en="EVIDENCE SEARCH"
      ko={navLabel("search")}
      desc="근거 문서와 판정 규칙을 한 번에 찾습니다. 조문 이름을 몰라도 '숙식비', '연금', '기한'처럼 평소 쓰는 말로 검색할 수 있습니다."
      right={key ? <Pill>{hitStandards.length + hitRules.length}건</Pill> : undefined}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="예: 숙식비 · 연금 · 산재 · 최저임금 · 기한"
        className="w-full max-w-xl rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm"
      />

      {!key ? (
        <p className="mt-4 text-sm text-[var(--muted)]">검색어를 입력하세요.</p>
      ) : hitStandards.length + hitRules.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          일치하는 근거나 룰이 없습니다.
        </p>
      ) : (
        <>
          {hitRules.length > 0 && (
            <>
              <p className="mt-6 text-sm font-semibold">판정 규칙 {hitRules.length}건 (누르면 자세히 보기)</p>
              <table className="mt-2 w-full max-w-3xl text-xs">
                <tbody>
                  {hitRules.map((r) => (
                    <tr
                      key={`${r.skill}-${r.rule}`}
                      onClick={() => setSelectedRule(selectedRule === r.rule ? null : r.rule)}
                      className={`${셀} cursor-pointer hover:bg-[var(--surface)] ${selectedRule === r.rule ? "bg-[var(--accent-tint)]" : ""}`}
                    >
                      <td className="py-1.5 font-mono text-[var(--accent)]">
                        {r.rule}
                      </td>
                      <td>{r.name}</td>
                      <td className="text-right text-[var(--muted)]">{r.skill}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedRule && (
                <p className="mt-2 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-xs text-[var(--accent)]">
                  선택: {selectedRule} — 상세는 판정 스킬 화면과 루프 탭에서 규칙 번호로 대조하세요.
                </p>
              )}
            </>
          )}
          {hitStandards.length > 0 && (
            <>
              <p className="mt-6 text-sm font-semibold">
                근거 문서 {hitStandards.length}건 — 클릭하면 선택
              </p>
              <div className="grid max-w-5xl gap-x-8 lg:grid-cols-2">
                {hitStandards.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => setSelectedStandard(selectedStandard === s.code ? null : s.code)}
                    className={`text-left ${selectedStandard === s.code ? "rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] p-2" : ""}`}
                  >
                    <StandardCard s={s} />
                  </button>
                ))}
              </div>
              {selectedStandard && (
                <p className="mt-2 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-xs text-[var(--accent)]">
                  선택: {selectedStandard} — 기준 적합성 맵 화면에서 원문 대조 상태를 더 자세히 봅니다.
                </p>
              )}
            </>
          )}
        </>
      )}
    </Wrap>
  );
}

/* ── 판단 해설 ── */

function SummaryStrip() {
  const vc = verifyCounts();
  const totalRules = skills.reduce((a, s) => a + s.ruleCatalog.length, 0);
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-3 py-2 text-2xs">
      <Pill tone="accent">규칙 {totalRules}개</Pill>
      <Pill tone="accent">가드레일 {GUARDRAIL_CATALOG.length}</Pill>
      <Pill>검증 사례 32건</Pill>
      <Pill>
        근거 {vc.원본확인 + vc.판례 + vc["2차출처"]}종(원본 {vc.원본확인})
      </Pill>
      <span className="ml-auto self-center text-[var(--muted)]">이 숫자들은 코드가 직접 세어 표시합니다</span>
    </div>
  );
}

/*
 * 용어 사전 — 사용자가 읽는 문장으로 (2026-09-02 평문화).
 * 정의는 "무엇인가"를 완결된 문장으로, where 는 그 용어가 실제로 쓰이는 화면 이름(메뉴 이름 그대로).
 * 개수(가드레일 종수 등)는 카탈로그에서 읽는다 — 손으로 적은 숫자는 낡는다.
 */
const 용어들: { term: string; def: string; where: string }[] = [
  {
    term: "판정 수준",
    def: "판정 결과를 여섯 가지로 나눈 것입니다. 위법, 기한임박, 수령가능, 확인필요, 수령불가, 정상이 있으며, 수준마다 쓸 수 있는 표현과 보여주는 정보가 정해져 있습니다.",
    where: `${navLabel("monitor")} › 판정 탭`,
  },
  {
    term: "하네스",
    def: "AI가 어떤 순서로 무엇을 하고, 무엇은 하면 안 되는지를 한 묶음으로 정해 둔 운영 규칙입니다. 검사 항목, 실행 명령, 단계별 점검, 가드레일, 검증 방법이 여기에 들어 있습니다.",
    where: navLabel("harness"),
  },
  {
    term: "가드레일",
    def: `판정 결과가 화면에 나가기 전에 거치는 검사 ${GUARDRAIL_CATALOG.length}종입니다. 과장된 표현, 받을 수 없는 돈, 개인정보가 결과에 섞이면 막습니다.`,
    where: `${navLabel("monitor")} › 루프 탭 · 이 화면`,
  },
  {
    term: "골든셋",
    def: "미리 정답을 정해 둔 상담 사례 32건입니다. 실제 서비스와 똑같은 코드로 판정한 뒤 정답과 맞는지 확인해, 코드를 고쳐도 결과가 흔들리지 않았는지 봅니다.",
    where: navLabel("golden"),
  },
  {
    term: "T-Box / A-Box",
    def: "T-Box는 이 서비스가 쓰는 개념과 관계를 정리한 사전이고, A-Box는 실제 판정 한 건을 그 사전의 말로 풀어 쓴 기록입니다. 판정이 사전에 없는 말을 쓰면 코드가 잡아냅니다.",
    where: navLabel("ontology"),
  },
  {
    term: "숫자 보존 검증",
    def: "번역 과정에서 금액, 날짜, 조문 번호가 하나라도 달라지면 그 번역을 버리고 한국어 원문을 그대로 보여주는 검사입니다. 번역이 판정 내용을 바꾸지 못하게 합니다.",
    where: `${navLabel("monitor")} › 답변 탭`,
  },
];

export function ExplainView() {
  return (
    <Wrap
      en="DECISION RATIONALE"
      ko={navLabel("explain")}
      desc="판정이 틀리면 손해를 보는 사람은 근로자입니다. 잘못된 결과를 믿고 회사를 옮기거나 돈을 기다리면 되돌리기 어렵습니다. 그래서 이 서비스는 지켜야 할 규칙을 글로만 적어 두지 않고, 판정 코드가 반드시 따르도록 만들었습니다. 아래에서 그 규칙이 무엇인지 설명합니다."
    >
      <div className="mb-4">
        <SummaryStrip />
      </div>

      <p className="text-base font-bold">판정 수준은 무엇을 뜻하나요</p>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--muted)]">
        판정 결과에는 아래 여섯 수준 중 하나가 붙습니다. 수준에 따라 쓸 수 있는 표현과 함께 보여주는 정보가 다릅니다.
      </p>
      <table className="mt-2 w-full max-w-3xl text-sm">
        <tbody>
          {LEVEL_MEANING.map((l) => (
            <tr key={l.level} className={셀}>
              <td className="w-24 py-2 align-top font-semibold">{l.level}</td>
              <td className="py-2 leading-relaxed text-[var(--muted)]">{l.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SubHead desc="판정 결과는 화면에 나가기 전에 아래 검사를 모두 거칩니다. 하나라도 걸리면 그 결과는 나가지 않습니다.">
        가드레일 — 결과가 나가기 전에 거치는 검사 {GUARDRAIL_CATALOG.length}종
      </SubHead>
      <table className="mt-2 w-full max-w-3xl text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--line-strong)] text-left text-2xs font-semibold text-[var(--muted)]">
            <th className="w-10 py-1.5 font-semibold">번호</th>
            <th className="w-56 py-1.5 font-semibold">검사 이름</th>
            <th className="py-1.5 font-semibold">무엇을 막나요</th>
          </tr>
        </thead>
        <tbody>
          {GUARDRAIL_CATALOG.map((g) => (
            <tr key={g.id} className={셀}>
              <td className="py-2 align-top font-mono text-[var(--accent)]">{g.id}</td>
              <td className="py-2 align-top font-medium">{g.name}</td>
              <td className="py-2 leading-relaxed text-[var(--muted)]">{g.blocks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={`${카드} mt-8 max-w-3xl`}>
        <p className="text-sm font-semibold">왜 판정을 AI에게 맡기지 않나요</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          AI에게 요율과 계산식을 맡기면 계산을 틀리기도 하고, 같은 입력에 매번 다른 답을
          내기도 합니다. 같은 조건으로 두 번 확인했는데 금액이 다르다면 그 결과는 믿을 수
          없습니다. 그래서 AI는 말을 알아듣는 일(추출)과 설명하는 일(번역)만 맡고,{" "}
          <strong className="text-[var(--ink)]">금액과 날짜를 정하는 판정은 언제나 같은 답을
          내는 코드가</strong> 합니다. 이 화면의 숫자는 모두 코드가 계산한 값입니다.
        </p>
      </div>

      <SubHead desc="용어를 누르면 뜻이 펼쳐집니다. 오른쪽에는 그 용어가 실제로 쓰이는 화면 이름을 적었습니다.">
        용어 사전
      </SubHead>
      <div className="mt-2 space-y-2">
        {용어들.map((u) => (
          <details key={u.term} className="rounded-lg border border-[var(--line)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">
              {u.term} <span className="ml-2 text-2xs font-normal text-[var(--muted)]">{u.where}에서 확인할 수 있어요</span>
            </summary>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{u.def}</p>
          </details>
        ))}
      </div>
    </Wrap>
  );
}

/* ── 온톨로지 T-Box·A-Box ── */

export function OntologyView({
  abox,
  source,
  live,
  loop,
  onOpenConsult,
}: {
  abox: OntologyExecution | null;
  source?: { label: string; description: string };
  live?: LiveOntologyInput;
  loop?: AgentLoop;
  onOpenConsult?: () => void;
}) {
  return (
    <Wrap
      en="ONTOLOGY — T-BOX / A-BOX"
      ko={navLabel("ontology")}
      desc="상담을 실행하면 요청, 확인한 정보, 판정과 근거가 서비스 지도에 연결됩니다. 개념 사전과 현재 판정도 같은 자리에서 살펴보세요."
    >
      <OntologyWorkspace abox={abox} source={source} live={live ? buildLiveOntology(live) : undefined} loop={loop} onOpenConsult={onOpenConsult} />
    </Wrap>
  );
}

/* ── AI 조직도 ── */

type 조직원 = {
  name: string;
  live: boolean;
  gate?: "env";
  /** 역할 아이콘(_ui.tsx PATHS 키). 상태는 ●◐○ 표식이 말하므로 아이콘은 역할만 말한다 */
  icon: string;
  desc: string;
  io: string;
  code: string;
};

const 파이프라인: {
  단계: string;
  live: boolean;
  icon: string;
  code: string;
  원칙?: string;
  members: 조직원[];
}[] = [
  {
    단계: "0단 · 검사 고르기 (무엇을 물었는가)",
    live: true,
    icon: "scenario",
    code: "lib/skills.ts",
    members: [
      {
        name: "키워드 라우터",
        live: true,
        icon: "search",
        desc: "입력한 말에서 검사 후보를 점수 순으로 모두 뽑습니다. 하나로 단정하지 않습니다.",
        io: "말 → 후보 목록",
        code: "routeByKeyword",
      },
      {
        name: "다시 묻기",
        live: true,
        icon: "ask",
        desc: "후보가 없거나 1위와 2위 점수가 같으면 추측하지 않고 질문합니다.",
        io: "후보 목록 → 질문",
        code: "needsClarification",
      },
      {
        name: "LLM 라우터",
        live: false,
        icon: "cpu",
        gate: "env",
        desc: "키워드로 잡지 못하는 말을 맡습니다. AI가 있어도 키워드 판단은 기준으로 남습니다. AI 서비스를 연결하면 작동합니다.",
        io: "말 → 후보 목록",
        code: "lib/ai/agent.ts",
      },
    ],
  },
  {
    단계: "1단 · 값 뽑기 (말과 사진을 값으로)",
    live: false,
    icon: "funnel",
    code: "lib/ai/ (API 키 설정 전)",
    members: [
      {
        name: "명세서 사진 읽기",
        live: false,
        icon: "camera",
        desc: "사진을 지급, 공제, 근로시간 값으로 바꿉니다. 지금은 미리 준비한 예시 값이 대신합니다.",
        io: "사진 → 명세서 값",
        code: "payslip-extractor (예정)",
      },
      {
        name: "말에서 값 뽑기",
        live: false,
        icon: "quote",
        gate: "env",
        desc: "국적, 체류자격, 날짜를 뽑습니다. AI 서비스를 연결하면 작동합니다 (lib/ai/agent.ts).",
        io: "말 → 출국 조건",
        code: "lib/ai/agent.ts",
      },
    ],
  },
  {
    단계: "2단 · 판정 (AI가 손대지 않는 구역)",
    live: true,
    icon: "scale",
    code: "lib/rules/",
    원칙: "계산은 코드가 합니다. 같은 입력이면 언제나 같은 판정이 나옵니다.",
    members: [
      {
        name: "급여 판정부",
        live: true,
        icon: "calc",
        desc: "규칙 11개: 산재보험, 보험 요율, 최저임금, 연장수당, 숙식비, 근거 없는 공제.",
        io: "명세서 값 → 판정",
        code: "judgePayslip",
      },
      {
        name: "출국 판정부",
        live: true,
        icon: "plane",
        desc: "규칙 5개. 국적이 받을 돈의 종류를 정하고, 기준일이 마감을 정합니다.",
        io: "출국 조건 → 판정",
        code: "judgeDeparture",
      },
      {
        name: "기준값 보관소",
        live: true,
        icon: "vault",
        desc: "2026년 법정 기준값 전부가 여기 있습니다. 1년에 한 번 여기만 고칩니다. 여기가 틀리면 서비스 전체가 틀립니다.",
        io: "기준값",
        code: "constants-2026.ts · constants-departure.ts",
      },
    ],
  },
  {
    단계: "3단 · 설명 (모국어로)",
    live: false,
    icon: "speech", // 제공자(환경변수)가 있으면 OrgView 가 런타임에 켠다 — 정적 파일은 배포 환경을 모른다
    code: "lib/narrate.ts · app/api/narrate",
    members: [
      {
        name: "답변 만들기",
        live: true,
        icon: "speech",
        desc: "판정을 사용자에게 보낼 문장으로 만듭니다. AI 없이 코드만으로 돌아갑니다. 문장 틀 자체가 없는 돈을 약속하거나 마감을 빠뜨릴 수 없게 짜여 있습니다.",
        io: "판정 → 답변",
        code: "narrate",
      },
      {
        name: "모국어 번역가",
        live: false,
        icon: "translate",
        gate: "env",
        desc: "만들어진 한국어 답변을 모국어로 옮깁니다. AI 서비스를 연결하면 작동합니다. 금액, 날짜, 조문이 하나라도 달라지면 번역을 버리고 원문을 보여 줍니다.",
        io: "답변 → 모국어 답변",
        code: "app/api/narrate + lib/ai/contract",
      },
    ],
  },
];

const 검증조직: 조직원[] = [
  {
    name: "가드레일 G1–G8",
    live: true,
    icon: "shield",
    desc: "판정이 사용자에게 나가기 전 마지막 관문입니다. 단정하는 표현, 없는 돈, 근거 누락, 규칙 사이의 모순을 모두 검사합니다.",
    io: "판정 → 위반 목록",
    code: "lib/harness/guardrails.ts",
  },
  {
    name: "규칙 묶음 자체 점검",
    live: true,
    icon: "harness",
    desc: "규칙 묶음이 약속대로 구성됐는지 봅니다. 필수 점검이 있는지, 추정 규칙 번호가 실제로 있는지, 작동하는 담당이 있는지 확인합니다.",
    io: "규칙 묶음 → 점검 결과",
    code: "runSelfTest",
  },
  {
    name: "온톨로지 대조",
    live: true,
    icon: "ontology",
    desc: "실행 결과를 개체 기록(A-Box)으로 풀어 용어 사전(T-Box)과 대조합니다. 정확도 검증 사례도 매번 같은 대조를 통과합니다.",
    io: "개체 기록 → 위반 목록",
    code: "lib/ontology/abox.ts:validateABox",
  },
  {
    name: "정확도 검증기",
    live: true,
    icon: "target",
    desc: "사례 32건을 기대값과 대조하고 국적 명단 규칙을 검사합니다. 실제 서비스 코드를 그대로 불러 씁니다.",
    io: "cases.json → 통과/위반",
    code: "scripts/verify-golden.mjs",
  },
  {
    name: "개인정보·보안 검사",
    live: true,
    icon: "lock",
    desc: "비밀 키와 개인정보 패턴을 검사합니다. 걸린 문자열은 화면에 출력하지 않습니다.",
    io: "저장소 → 0건",
    code: "scripts/scan.mjs",
  },
  {
    name: "색 대비 검사",
    live: true,
    icon: "contrast",
    desc: "판정 수준별 색이 접근성 기준(WCAG)의 명도 대비를 지키는지 검사합니다.",
    io: "색 조합 → 통과율",
    code: "scripts/contrast.mjs",
  },
];

export function OrgView({ narratorLive = false, agentLive = false, agentModel }: { narratorLive?: boolean; agentLive?: boolean; agentModel?: string }) {
  const 하네스들 = listHarnesses();

  /*
   * 3단과 0/1단의 실동작 여부는 서버 환경변수에 달려 있어 정적 배열이 모른다.
   * page 가 GET /api/narrate·/api/agent 로 물어본 결과를 여기로 내려 표시만 뒤집는다 —
   * 파일에 live: true 를 박아 두면 키 없는 배포에서 그 줄이 거짓말이 된다.
   */
  const 표시파이프라인 = 파이프라인.map((팀) => {
    if (팀.단계.startsWith("3단") && narratorLive) {
      return {
        ...팀,
        live: true,
        members: 팀.members.map((m) =>
          m.name === "모국어 번역가" ? { ...m, live: true } : m,
        ),
      };
    }
    if (팀.단계.startsWith("0단") && agentLive) {
      return {
        ...팀,
        live: true,
        code: agentModel ? `live: ${agentModel}` : 팀.code,
        members: 팀.members.map((m) =>
          m.name === "LLM 라우터" ? { ...m, live: true, code: agentModel ?? m.code } : m,
        ),
      };
    }
    if (팀.단계.startsWith("1단") && agentLive) {
      return {
        ...팀,
        live: true,
        code: agentModel ? `live: ${agentModel}` : 팀.code,
        members: 팀.members.map((m) =>
          m.name === "말에서 값 뽑기" ? { ...m, live: true, code: agentModel ?? m.code } : m,
        ),
      };
    }
    return 팀;
  });

  return (
    <Wrap
      en="AGENT ORG CHART"
      ko={navLabel("org")}
      desc="AI 역할을 조직도로 그린 이유는 서열이 아니라 책임의 경계를 보여주기 위해서입니다. 누가 무엇을 결정하고, 누가 무엇을 결정하지 못하는지를 적었습니다. 실제로 동작하는 것(●)과 계획만 있는 것(○)을 나눠 그렸습니다. 나누지 않으면 계획이 실제처럼 보이기 때문입니다."
      right={
        <div className="flex gap-1.5">
          <Pill tone="accent">처리 단계 4단</Pill>
          <Pill>독립 검증 {검증조직.length}조</Pill>
        </div>
      }
    >
      {/* 범례 — 3상태: 실동작(●) / 대기(◐, 구현됨·환경변수 대기) / 예정(○) */}
      <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
        <span>
          <span className="font-mono text-[var(--accent)]">●</span> 작동 중: 지금 이 브라우저에서 돌아갑니다
        </span>
        <span>
          <span className="font-mono text-[var(--warning)]">◐</span> 연결 대기: 만들어져 있고, AI 서비스를 연결하면 작동합니다
        </span>
        <span>
          <span className="font-mono text-[var(--muted-soft)]">○</span> 예정: 아직 만들지 않았습니다
        </span>
        <span className="text-[var(--muted-soft)]">아이콘 = 역할 · ●◐○ = 상태</span>
      </div>

      {/* 파이프라인 4단 */}
      <div className="mt-5 space-y-0">
        {표시파이프라인.map((팀, i) => (
          <div key={팀.단계}>
            <div
              className={`rounded-lg border p-4 ${
                팀.live
                  ? "border-[var(--line)] bg-[var(--panel)]"
                  : "border-dashed border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* 역할 아이콘 칩 — 살아 있는 단은 파랑 면, 아닌 단은 회색 면. 상태 숫자는 옆 알약이 말한다 */}
                <span
                  aria-hidden
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                    팀.live
                      ? "border-[var(--accent-tint-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-soft)]"
                  }`}
                >
                  <Icon name={팀.icon} />
                </span>
                <span className="font-bold">{팀.단계}</span>
                {(() => {
                  const marks = 팀.members.map((m) => (m.live ? "●" : (m as { gate?: string }).gate === "env" ? "◐" : "○"));
                  const liveCnt = marks.filter((c) => c === "●").length;
                  const waitCnt = marks.filter((c) => c === "◐").length;
                  const isGateTeam = 팀.members.some((m) => (m as { gate?: string }).gate === "env");
                  if (팀.live) {
                    return <Pill tone="accent">{`작동 중 ${liveCnt}/${팀.members.length}`}</Pill>;
                  }
                  if (isGateTeam) {
                    return <Pill tone="warn">{`연결 대기 ${waitCnt} · 예정 ${marks.filter((c) => c === "○").length}`}</Pill>;
                  }
                  return <Pill tone="muted">미연결</Pill>;
                })()}
                <span className="font-mono text-2xs text-[var(--muted-soft)]">
                  {팀.code}
                </span>
              </div>
              {팀.원칙 && (
                <p className="mt-1 text-xs text-[var(--muted)]">{팀.원칙}</p>
              )}
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {팀.members.map((m) => {
                  const isGate = (m as { gate?: string }).gate === "env";
                  const char = m.live ? "●" : isGate ? "◐" : "○";
                  const charCls = m.live ? "text-[var(--accent)]" : isGate ? "text-[var(--warning)]" : "text-[var(--muted-soft)]";
                  const borderCls = m.live ? "border-[var(--line)]" : isGate ? "border-[var(--line)] bg-[var(--surface)]" : "border-dashed border-[var(--line-soft)]";
                  return (
                    <div key={m.name} className={`rounded-md border p-3 ${borderCls}`}>
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className={`font-mono ${charCls}`}>{char}</span>
                        <Icon name={m.icon} cls="text-[var(--muted)]" />
                        <span>{m.name}</span>
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{m.desc}</p>
                      <p className="mt-1.5 font-mono text-2xs text-[var(--muted-soft)]">{m.io} · {m.code}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            {i < 표시파이프라인.length - 1 && (
              <div className="ml-8 h-4 w-px bg-[var(--line)]" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {/* 독립 검증 조직 */}
      <SubHead desc="처리 단계 어디에도 속하지 않습니다. 판정과 검증을 같은 쪽에 두면 검증이 형식이 되기 때문입니다.">
        독립 검증 조직 — 판정 조직을 심사하는 조직
      </SubHead>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {검증조직.map((m) => (
          <div key={m.name} className={카드}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="font-mono text-[var(--accent)]">●</span>
              <Icon name={m.icon} cls="text-[var(--muted)]" />
              <span>{m.name}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{m.desc}</p>
            <p className="mt-1.5 font-mono text-2xs text-[var(--muted-soft)]">
              {m.io} · {m.code}
            </p>
          </div>
        ))}
      </div>

      {/* 하네스 계약 */}
      <SubHead>규칙 묶음(하네스) 계약: 각 조직이 따르는 운영 규칙</SubHead>
      <table className="mt-2 w-full max-w-4xl text-xs">
        <thead>
          <tr className="border-b-2 border-[var(--line-strong)] text-left font-semibold text-[var(--muted)]">
            <th className="py-2">하네스</th>
            <th>에이전트 구성</th>
            <th className="text-right">검증 사례</th>
          </tr>
        </thead>
        <tbody>
          {하네스들.map((h) => (
            <tr key={h.id} className={셀}>
              <td className="py-2 font-semibold">{h.displayName}</td>
              <td className="py-2 text-[var(--muted)]">
                {h.agents
                  .map((a) => {
                    if (a.live) return `● ${a.id}`;
                    if ((a as { gate?: string }).gate === "env") {
                      const isNarrator = a.id === "narrator";
                      const providerLive = isNarrator ? narratorLive : agentLive;
                      return `${providerLive ? "●" : "◐"} ${a.id}`;
                    }
                    return `○ ${a.id}`;
                  })
                  .join(" · ")}
              </td>
              <td className="py-2 text-right font-mono">{h.verification.goldenCases}건</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  );
}

/* ── 시나리오 추천 큐 ── */

export type ScenarioPreset = {
  label: string;
  caseId: string;
  today?: string;
  nationality?: string;
  visa?: "E-9" | "H-2" | "E-8" | "기타";
  hireDate?: string;
  departureDate?: string;
  wage?: number;
  size?: "5인이상" | "5인미만" | "모름";
};

const 시나리오들: {
  badge: string;
  title: string;
  why: string;
  expect: string;
  presets: ScenarioPreset[];
}[] = [
  {
    badge: "기한경계",
    title: "청구 마감 하루 전으로 날짜를 옮깁니다",
    why: "수령가능에서 기한임박으로 바뀌는 경계를 코드가 정합니다. 기준일 하나만 옮겨 보면 판정 수준이 어떻게 바뀌는지 그대로 보입니다.",
    expect: "S2-1과 S2-2가 수령가능에서 기한임박(◆)으로 바뀌고, 마감일이 반드시 함께 나옵니다(G7).",
    /* 기준일들은 S2-01 출국일(2026-10-15)에서 계산된 값이다 — 마감은 출국 7일 전인 10-08.
       출국일을 옮기면 여기도 같이 옮겨야 한다. 어긋나면 골든셋 기한경계 그룹이 잡는다. */
    presets: [
      { label: "D-1 (마감 전날)", caseId: "S2-01", today: "2026-10-07" },
      { label: "출국 직후", caseId: "S2-01", today: "2026-10-20" },
      {
        label: "시효 임박",
        caseId: "S2-03",
        today: "2028-05-01",
      },
    ],
  },
  {
    badge: "없는돈약속유도",
    title: "시효가 지난 상황에서 모순이 생기는지 봅니다",
    why: "보험 청구 시효(3년)와 연금 청구 시효(5년)는 길이가 다릅니다. 보험은 시효가 지나도 연금은 아직 받을 수 있습니다. 이것이 모순이 아니라는 것을 보여 주는 예시입니다.",
    expect: "보험은 수령불가로, 연금은 수령가능으로 나옵니다. 합계에 받을 수 없는 돈이 섞이지 않습니다(G2·G8).",
    presets: [
      { label: "출국 3년 경과", caseId: "S2-03", today: "2028-08-01" },
    ],
  },
  {
    badge: "국적분기",
    title: "같은 조건, 국적만 네 갈래로",
    why: "같은 근속, 같은 임금이어도 국적에 따라 받을 돈이 달라집니다. 이 부분을 만들다가 요약 자료의 오류를 공단 원문으로 바로잡은 적이 있습니다.",
    expect: "베트남 수령가능 · 네팔 수령불가(금액 없음) · 우즈베키스탄 협정면제 · 가나 확인필요(1355 안내).",
    presets: [
      { label: "베트남 (납부함)", caseId: "S2-02", nationality: "베트남" },
      { label: "네팔 (적용제외)", caseId: "S2-02", nationality: "네팔" },
      { label: "우즈베키스탄 (협정면제)", caseId: "S2-02", nationality: "우즈베키스탄" },
      { label: "가나 (명단 밖)", caseId: "S2-02", nationality: "가나" },
    ],
  },
  {
    badge: "근속경계",
    title: "근속 11개월과 12개월",
    why: "외국인고용법 제13조에 따라 하루 차이로 출국만기보험 일시금을 누가 갖는지 바뀝니다. 날짜가 모자라면 한 달을 빼고 셉니다.",
    expect: "11개월이면 S2-1이 수령불가(금액 없음), 12개월부터 수령가능으로 바뀌고 예상 범위가 나옵니다.",
    /* 입사일은 S2-01 출국일(2026-10-15) 기준 근속 12개월 경계다. 출국일 이동 시 함께 이동 */
    presets: [
      { label: "11개월 (하루 모자람)", caseId: "S2-01", hireDate: "2025-10-16" },
      { label: "12개월 (경계 통과)", caseId: "S2-01", hireDate: "2025-10-15" },
    ],
  },
  {
    badge: "라우팅실패",
    title: "어느 검사에도 해당하지 않는 말",
    why: "실패하는 사례가 목록에 없으면 다시 묻는 동작을 아무도 볼 수 없습니다. AI는 추측하지 않습니다.",
    expect: "검사 고르기 단계에서 멈추고 다시 묻습니다. 판정 탭과 근거 탭은 비어 있는 것이 맞습니다.",
    presets: [{ label: "X-01 실행", caseId: "X-01" }],
  },
  {
    badge: "상수경계",
    title: "사업장 규모를 모르면 확인필요로 내립니다",
    why: "5인 미만 사업장에는 연장 가산수당 규정이 적용되지 않습니다. 규모를 모르는데 위법으로 단정하면 없는 권리를 약속하게 됩니다.",
    expect: "A7이 위법이 아니라 확인필요로 나오고, 질문이 반드시 붙습니다(G5).",
    presets: [
      { label: "사업장 규모 모름", caseId: "S1-01", size: "모름" },
      { label: "5인 이상 (대조용)", caseId: "S1-01", size: "5인이상" },
    ],
  },
];

export function ScenariosView({
  onApply,
}: {
  onApply: (p: ScenarioPreset) => void;
}) {
  return (
    <Wrap
      en="SCENARIO QUEUE"
      ko={navLabel("scenarios")}
      desc="'이 판정을 믿어도 되나'를 직접 눌러 확인할 수 있도록, 판정 결과가 갈리는 경계를 건드리는 예시를 골라 두었습니다. 모두 정확도 검증 사례에서 가져온 것이라, 지어낸 상황이 아니라 자동 테스트가 이미 확인하는 상황입니다."
      right={<Pill>{시나리오들.length}종</Pill>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {시나리오들.map((s) => (
          <div key={s.title} className={카드}>
            <div className="flex items-center justify-between">
              <Pill tone="accent">{s.badge}</Pill>
            </div>
            <p className="mt-2 font-semibold">{s.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{s.why}</p>
            <p className="mt-2 rounded-md bg-[var(--surface)] px-3 py-2 text-xs leading-relaxed">
              <span className="font-semibold">기대 결과:</span> {s.expect}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onApply(p)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)] hover:bg-[var(--accent-tint)] hover:text-[var(--accent-ink)]"
                >
                  {p.label} ▶
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        단추를 누르면 해당 상담·기준일·국적이 적용되고 판정이 즉시 실행됩니다. 실행
        모니터의 루프 탭에서 단계별 결과를 볼 수 있습니다.
      </p>
    </Wrap>
  );
}

/* ── 담당자/승인 권한 ── */

const 권한표 = [
  {
    작업: "법정 기준값 갱신 (연 1회)",
    리스크: "여기가 틀리면 서비스 전체가 틀린 금액을 말합니다",
    장치: "정확도 검증의 기준값 경계 사례가 기대값으로 잡아냅니다",
  },
  {
    작업: "국적 명단 수정",
    리스크: "명단이 겹치면 국적 판단이 틀려 큰 금액 오류가 생깁니다",
    장치: "명단 교차 검사 코드가 겹침을 찾으면 검증과 테스트를 바로 멈춥니다 (공리 7)",
  },
  {
    작업: "가드레일·온톨로지 공리 변경",
    리스크: "없는 돈 약속이나 단정하는 표현이 다시 나갑니다",
    장치: "가드레일 전체 테스트, 개체 기록의 공리 대조, '막지 못한 항목 최소 1개' 정직성 테스트",
  },
  {
    작업: "정확도 검증 사례 수정",
    리스크: "실패를 지우면 검증이 아니라 점수 맞추기가 됩니다",
    장치: "최소 사례 수 기준, 그리고 모르는 그룹이나 기대값 키가 있으면 검증을 멈춥니다",
  },
  {
    작업: "온톨로지 클래스·관계 추가",
    리스크: "코드에 없는 개념이 문서와 화면에 들어갑니다",
    장치: "스키마 테스트가 적힌 코드 위치를 열어 실제로 있는지 대조합니다",
  },
  {
    작업: "배포 URL 연결 (예선 게이트)",
    리스크: "연결하지 않으면 실격입니다. 자동 검증이 없는 유일한 사람의 일입니다",
    장치: "사람이 직접 확인합니다. 코드가 대신할 수 없습니다",
  },
];

const 승인대기 = [
  {
    건: "근거 원본 확인 8건",
    상태: "2차 출처",
    근거: "적용 법령·기준 화면의 원문 확인 대기 수",
    할일: "법령, 고시, 공단 원문과 대조한 뒤 원본 확인으로 바꿉니다",
  },
  {
    건: "배포 URL 미연결",
    상태: "차단 위험",
    근거: "01_전략/03_주제_정본.md §7 1번",
    할일: "Vercel 연결 후 기획서에 URL 기입",
  },
  {
    건: "1단 추출 LLM · 배포용 번역 키",
    상태: "계획됨",
    근거: "번역 기능은 만들어져 있고 로컬 Ollama로 확인했습니다. 남은 것은 명세서 사진 인식과 배포 환경의 API 키입니다",
    할일: "배포 환경에 ANTHROPIC_API_KEY를 설정합니다(사람). 사진 인식은 이후 계획입니다",
  },
  {
    건: "제출물 3종(기획서·MVP·최종) 미작성",
    상태: "대기",
    근거: "00_제출/ README 플레이스홀더",
    할일: "예선 마감 전에 작성합니다. 이 화면의 캡처가 증빙이 됩니다",
  },
];

export function ApprovalsView({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const cardTarget: Record<string, string> = {
    "근거 원본 확인 8건": "standards-map",
    "배포 URL 미연결": "harness",
    "1단 추출 LLM · 배포용 번역 키": "agent-run",
    "제출물 3종(기획서·MVP·최종) 미작성": "artifacts",
  };
  return (
    <Wrap
      en="OWNERS & APPROVALS"
      ko={navLabel("approvals")}
      desc="이 서비스에는 아직 계정이나 승인 체계가 없습니다. 지금의 승인자는 코드 리뷰와 자동 검사(CI)입니다. 그래서 각 작업의 승인자 칸에 사람 이름을 지어 넣지 않고, 대신 '무엇이 그 작업을 막는가'를 적었습니다. 검증 장치가 곧 승인자인 구조입니다."
      right={<Pill tone="warn">승인 대기 {승인대기.length}건</Pill>}
    >
      <p className="text-base font-bold">작업, 위험, 막는 장치</p>
      <table className="mt-2 w-full max-w-4xl text-xs">
        <thead>
          <tr className="border-b-2 border-[var(--line-strong)] text-left font-semibold text-[var(--muted)]">
            <th className="py-2">작업</th>
            <th>어기면 생기는 사고</th>
            <th>지금 막는 장치 (승인자 역할)</th>
          </tr>
        </thead>
        <tbody>
          {권한표.map((r) => (
            <tr key={r.작업} className={셀}>
              <td className="py-2.5 pr-3 font-semibold">{r.작업}</td>
              <td className="py-2.5 pr-3 text-[var(--muted)]">{r.리스크}</td>
              <td className="py-2.5 text-[var(--accent)]">{r.장치}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SubHead desc="아직 끝나지 않은 일입니다. 모두 코드와 문서에서 가져온 실제 항목입니다.">
        승인 대기 목록 — 실제로 열려 있는 일
      </SubHead>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {승인대기.map((w) => (
          <button
            key={w.건}
            onClick={() => {
              const target = cardTarget[w.건];
              if (target && onNavigate) onNavigate(target);
            }}
            disabled={!cardTarget[w.건] || !onNavigate}
            title={cardTarget[w.건] ? "클릭하면 관련 화면으로 이동" : undefined}
            className={`${카드} text-left hover:border-[var(--accent-tint-line)] hover:bg-[var(--accent-tint)] ${!cardTarget[w.건] ? "cursor-default" : ""}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{w.건}</p>
              <Pill tone={w.상태 === "차단 위험" ? "warn" : "muted"}>{w.상태}</Pill>
            </div>
            <p className="mt-1.5 font-mono text-2xs text-[var(--muted-soft)]">
              {w.근거}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              다음 할 일 — {w.할일}
            </p>
            {cardTarget[w.건] && <p className="mt-2 text-2xs font-semibold text-[var(--accent)]">해당 화면으로 이동 ▶</p>}
          </button>
        ))}
      </div>

      <div className={`${카드} mt-8 max-w-3xl`}>
        <p className="text-sm font-semibold">사람 승인이 필요해지는 순간</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          실제 사용자가 생기고 판정이 사람에게 영향을 주기 시작하면, 기준값 갱신과 검증 사례
          수정에는 지정된 담당자와 승인 이력이 필요해집니다. 그때 이 화면의 표에 이름과 승인
          기록이 채워집니다. 지금 미리 채우면 실제가 아닌 흉내가 되므로 비워 둡니다.
        </p>
      </div>
    </Wrap>
  );
}
