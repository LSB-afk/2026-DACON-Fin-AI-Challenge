"use client";

/**
 * 정확도 검증 결과(골든셋) — 에이전트 평가(Evals)가 제품 안에 사는 화면.
 *
 * 페이퍼클립(에이전트 관제 오픈소스)의 Education/Evals 영역을 우리 몸에 맞춘 것.
 * 다른 점 하나가 핵심이다: 여기의 평가는 **터미널 CI(npm run verify)와 같은 구현**
 * (lib/golden.ts)을 브라우저에서 그대로 돌린 결과다. 화면용 평가를 따로 만들면
 * 화면은 초록인데 CI 는 빨간, 혹은 그 반대인 날이 온다.
 *
 * 실행은 useMemo 한 번 — 순수 함수 32케이스라 몇 ms 면 끝난다. "다시 실행" 단추가
 * 없는 이유: 같은 입력이면 영원히 같은 결과라 다시 눌러 볼 것이 없다.
 * 새로고침이 곧 재실행이고, 그때도 같은 화면이 나오는 것이 이 제품의 주장이다.
 *
 * 화면 규칙 (2026-09-02 재설계): 그룹 id(없는돈약속유도 같은 붙여 쓴 키)는 CI 의
 * thresholds.requiredGroups 가 그대로 참조하므로 JSON 을 고치지 않고 여기서 표시
 * 이름·설명으로 바꿔 보여준다. 숫자는 전부 실행 결과(rep)에서 온다.
 */

import { useMemo } from "react";
import goldenDoc from "@/golden/cases.json";
import { runGolden, type GoldenDoc } from "@/lib/golden";
import { skills } from "@/lib/skills";
import { Pill, Icon, navLabel, type PillTone } from "./_ui";

const 셀 = "border-b border-[var(--line-soft)]";

/** 그룹 id → 사람이 읽는 이름과 설명. id 는 CI 계약이라 손대지 않는다 */
const 그룹표시: Record<string, { name: string; desc: string }> = {
  정상: { name: "정상", desc: "문제가 없는 서류는 조용히 지나가고, 반례가 없는 규칙은 조건과 상관없이 걸리는지 확인합니다." },
  없는돈약속유도: { name: "없는 돈 약속 유도", desc: "받을 수 없는 돈을 받을 수 있다고 말하게 만드는 입력입니다. 이 서비스가 무너질 수 있는 가장 큰 위험입니다." },
  국적분기: { name: "국적 분기", desc: "국적과 체류자격에 따라 결과가 뒤집히는 자리입니다. 명단에서 한 줄만 빠져도 사람이 돈을 못 받습니다." },
  기한경계: { name: "기한 경계", desc: "기준일을 하루씩 옮겨 수령가능, 기한임박, 수령불가가 갈리는 지점을 양쪽에서 확인합니다." },
  근속경계: { name: "근속 경계", desc: "근속 12개월 앞뒤 하루 차이입니다. 여기서 돈이 사업주 몫인지 근로자 몫인지가 갈립니다." },
  라우팅실패: { name: "라우팅 실패", desc: "어느 검사로 보낼지 정하지 못하는 말입니다. 잘못 보내면 엉뚱한 질문을 하게 됩니다." },
  상수경계: { name: "상수 경계", desc: "법정 기준값을 1원, 한 구간 차이로 넘나드는 사례입니다. 기준값을 잘못 고치면 여기서 먼저 깨집니다." },
};

/** 검사 종류 배지 — 상담 사례 배지와 같은 색 문법 */
const 스킬표시: Record<string, { name: string; tone: PillTone }> = {
  departure: { name: "출국 정산", tone: "accent" },
  payslip: { name: "급여명세서 대조", tone: "teal" },
  router: { name: "라우팅", tone: "muted" },
};

function 그룹이름(id: string) {
  return 그룹표시[id]?.name ?? id.replace(/(경계|분기|실패|유도)$/, " $1");
}

export function GoldenView() {
  const doc = goldenDoc as unknown as GoldenDoc;
  const rep = useMemo(() => runGolden(doc), [doc]);

  const 그룹들 = Object.entries(doc.groups);
  const byGroup = (g: string) => rep.results.filter((r) => r.group === g);
  const 전부통과 = rep.violations.length === 0 && rep.listCross.length === 0;

  /* 요약 타일 — 전부 실행 결과에서 온 숫자다 */
  const 타일: { label: string; value: string; sub?: string; tone: "good" | "bad" | "plain" }[] = [
    { label: "통과한 사례", value: `${rep.passed} / ${doc.cases.length}`, tone: rep.passed === doc.cases.length ? "good" : "bad" },
    { label: "가드레일 위반", value: `${rep.guardTotal}건`, tone: rep.guardTotal === 0 ? "good" : "bad" },
    { label: "규칙 발동", value: `${rep.firedRules.length} / ${rep.totalRules}`, sub: rep.uncovered.length === 0 ? "모든 규칙이 한 번 이상 검사됨" : `${rep.uncovered.length}개 규칙 미검사`, tone: rep.uncovered.length === 0 ? "good" : "bad" },
    { label: "판정 실행", value: `${rep.judged}건`, sub: `라우팅 ${rep.routed}건`, tone: "plain" },
    { label: "용어 대조(A-Box)", value: `${rep.judged}회`, sub: "판정마다 사전과 대조", tone: "plain" },
    { label: "검사 종류 · 그룹", value: `${skills.length} · ${그룹들.length}`, tone: "plain" },
  ];

  return (
    <div className="px-4 py-6 min-[1024px]:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">AGENT EVALS</span>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight">{navLabel("golden")}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill>사례 {doc.cases.length}</Pill>
          <Pill tone={전부통과 ? "good" : "warn"}>{전부통과 ? "전부 통과" : `위반 ${rep.violations.length}건`}</Pill>
          <Pill tone={rep.uncovered.length === 0 ? "accent" : "warn"}>
            규칙 발동 {rep.firedRules.length}/{rep.totalRules}
          </Pill>
        </div>
      </div>
      {/* 문장마다 줄바꿈 — 폭 캡 한가운데서 꺾이지 않게 */}
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
        <span className="block">이 화면의 숫자는 방금 이 브라우저에서 직접 계산한 결과입니다.</span>
        <span className="block">
          자동 검사(CI)와 <strong className="text-[var(--ink)]">같은 코드</strong>(<code className="font-mono">lib/golden.ts</code>)를 쓰기 때문에, 여기와 터미널이 다른 답을 내는 일은 없습니다.
        </span>
        <span className="block">사례는 실제로 한 번 틀렸던 자리마다 하나씩 만들었습니다. 지어낸 시험이 아닙니다.</span>
      </p>
      <div className="mt-4 border-b-2 border-[var(--line-strong)]" />

      {/* 명단 교차 — 이게 뜨면 케이스는 아예 돌지 않은 것이다 */}
      {rep.listCross.length > 0 && (
        <div className="mt-5 rounded-lg border border-[var(--bad)] bg-[var(--bad-soft)] p-4 text-sm text-[var(--bad-ink)]">
          <p className="font-bold">국적 명단 규칙 위반으로 평가를 시작하지 않았습니다</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {rep.listCross.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 요약 타일 — 줄글 대신 숫자가 먼저 보이게 */}
      <div className="mt-5 grid grid-cols-2 gap-3 min-[720px]:grid-cols-3 min-[1280px]:grid-cols-6">
        {타일.map((t) => (
          <div
            key={t.label}
            className={`rounded-lg border px-4 py-3 ${
              t.tone === "good"
                ? "border-[var(--good)] bg-[var(--good-soft)]"
                : t.tone === "bad"
                  ? "border-[var(--bad)] bg-[var(--bad-soft)]"
                  : "border-[var(--line)] bg-[var(--panel)]"
            }`}
          >
            <p className="text-2xs font-semibold text-[var(--muted)]">{t.label}</p>
            <p className={`mt-0.5 text-xl font-bold tracking-tight ${t.tone === "good" ? "text-[var(--good-ink)]" : t.tone === "bad" ? "text-[var(--bad-ink)]" : "text-[var(--ink)]"}`}>
              {t.value}
            </p>
            {t.sub && <p className="mt-0.5 text-2xs text-[var(--muted-soft)]">{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* thresholds 위반 — 케이스가 다 맞아도 기준선이 무너지면 빨갛다 */}
      {rep.violations.length > 0 && (
        <div className="mt-4 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4">
          <p className="text-sm font-bold text-[var(--warning-ink)]">
            위반 {rep.violations.length}건. 자동 검사(CI)도 지금 실패 상태여야 정상입니다
          </p>
          <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-[var(--warning-ink)]">
            {rep.violations.slice(0, 12).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 그룹별 카드 — 각 그룹은 "무엇이 무서운가"의 이름이다. 2열로 폭을 다 쓴다 */}
      <div className="mt-8 border-t-2 border-[var(--line-strong)] pt-4">
        <h3 className="text-base font-bold tracking-tight">그룹별 결과</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          <span className="block">그룹 이름은 그 사례들이 막으려는 실수의 종류입니다.</span>
          <span className="block">각 줄의 표시는 통과(✓)와 실패(✕)이고, 실패한 사례는 이유가 바로 아래에 붙습니다.</span>
        </p>
      </div>
      <div className="mt-4 grid items-start gap-4 min-[1280px]:grid-cols-2">
        {그룹들.map(([g]) => {
          const rows = byGroup(g);
          const ok = rows.filter((r) => r.violations.length === 0).length;
          const 표시 = 그룹표시[g];
          return (
            <section key={g} className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)]" aria-label={그룹이름(g)}>
              <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-base font-bold leading-snug">{그룹이름(g)}</p>
                  {표시 && <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{표시.desc}</p>}
                </div>
                <Pill tone={ok === rows.length ? "good" : "warn"}>
                  {ok}/{rows.length} 통과
                </Pill>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-2xs font-semibold text-[var(--muted)]">
                    <th className="w-px py-1.5 pl-4 pr-2 font-semibold" aria-label="결과" />
                    <th className="w-px py-1.5 pr-3 font-semibold">번호</th>
                    <th className="py-1.5 pr-3 font-semibold">사례</th>
                    <th className="w-px py-1.5 pr-4 font-semibold">검사</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sk = 스킬표시[r.skill] ?? { name: r.skill, tone: "muted" as PillTone };
                    return (
                      <tr key={r.id} className={셀}>
                        <td className="w-px py-2 pl-4 pr-2 align-top" aria-label={r.violations.length === 0 ? "통과" : "실패"}>
                          {r.violations.length === 0 ? (
                            <Icon name="check" cls="inline h-3.5 w-3.5 text-[var(--good)]" />
                          ) : (
                            <Icon name="block" cls="inline h-3.5 w-3.5 text-[var(--bad)]" />
                          )}
                        </td>
                        <td className="w-px whitespace-nowrap py-2 pr-3 align-top font-mono text-[var(--muted-soft)]">{r.id}</td>
                        <td className="py-2 pr-3 align-top leading-relaxed">
                          <span className="font-medium text-[var(--ink)]">{r.desc}</span>
                          {r.violations.length > 0 && (
                            <ul className="mt-1 list-inside list-disc text-2xs text-[var(--bad-ink)]">
                              {r.violations.map((v) => (
                                <li key={v}>{v}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="w-px whitespace-nowrap py-2 pr-4 align-top">
                          <Pill tone={sk.tone}>{sk.name}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      <p className="mt-8 border-t border-[var(--line)] pb-10 pt-3 text-center text-xs leading-relaxed text-[var(--muted)]">
        <span className="block">실수를 발견하면 먼저 그 실수를 잡아내는 사례를 만들어 실패시킨 뒤 코드를 고칩니다.</span>
        <span className="block">사례 수와 그룹 분포에는 최소 기준이 있어 검증을 약하게 만들어 통과시킬 수 없습니다.</span>
      </p>
    </div>
  );
}
