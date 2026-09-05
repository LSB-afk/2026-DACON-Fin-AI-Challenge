"use client";

import { useState } from "react";
import { getSkill, skills, type InputSpec, type SkillId } from "@/lib/skills";
import { Icon, Pill, SectionHead, navLabel } from "./_ui";

type SkillsViewProps = {
  initialSkillId?: SkillId;
  onOpenOrganization?: () => void;
  onStartSkill?: (id: SkillId) => void;
};

const skillCopy: Record<SkillId, {
  category: string;
  icon: string;
  purpose: string;
  result: string;
  scope: string;
}> = {
  payslip: {
    category: "급여명세서",
    icon: "calc",
    purpose: "명세서에 적힌 공제와 수당을 확인합니다.",
    result: "항목별 판정과 근거 조문, 계산 과정, 추가로 확인할 질문을 보여줍니다. 금액이 있는 판정은 계산된 금액을 함께 표시합니다.",
    scope: "직접 입력한 명세서 값과 사업장 규모로 대조합니다. 사진 인식은 준비 중이며, 아래 항목은 이 입력만으로 검사하지 않습니다.",
  },
  departure: {
    category: "출국 정산",
    icon: "plane",
    purpose: "귀국할 때 받을 돈과 청구 기한을 확인합니다.",
    result: "보험·연금별 수령 가능 여부, 해당하는 금액과 추정 범위, 청구 기한을 보여줍니다. 추가 확인이 필요한 금액은 따로 구분합니다.",
    scope: "국적·체류자격·근속 기간과 기준일에 따라 결과가 달라집니다. 가입·납부 이력이 확인되지 않으면 확인할 질문을 안내하며, 추정 금액은 기관 확인이 필요합니다.",
  },
};

const inputTypeLabel: Record<InputSpec["type"], string> = {
  text: "직접 입력",
  number: "금액 입력",
  date: "날짜 입력",
  select: "목록에서 선택",
};

const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)]";

export function SkillsView({ initialSkillId = "payslip", ...actions }: SkillsViewProps) {
  return <SkillWorkspace key={initialSkillId} initialSkillId={initialSkillId} {...actions} />;
}

function SkillWorkspace({
  initialSkillId,
  onOpenOrganization,
  onStartSkill,
}: SkillsViewProps & { initialSkillId: SkillId }) {
  const [selectedId, setSelectedId] = useState<SkillId>(initialSkillId);
  const [query, setQuery] = useState("");
  const selected = getSkill(selectedId);
  const copy = skillCopy[selectedId];
  const ruleCount = selected.ruleCatalog.length;
  const search = query.trim().toLocaleLowerCase();
  const matchingRules = selected.ruleCatalog.filter((rule) =>
    `${rule.rule} ${rule.name}`.toLocaleLowerCase().includes(search),
  );

  return (
    <div
      className="min-w-0 px-4 py-6 min-[1024px]:px-8"
      data-testid="skill-workspace"
      data-skill-id={selectedId}
    >
      <SectionHead en="SKILLS" ko={navLabel("skills")} />
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          스킬을 선택하면 필요한 입력, 검사 항목, 결과의 사용 범위를 확인할 수 있습니다.
        </p>
        {onOpenOrganization && (
          <button type="button" onClick={onOpenOrganization} className={secondaryButton}>
            <Icon name="org" />
            AI 역할 조직도
          </button>
        )}
      </div>

      <div role="group" aria-label="판정 스킬 선택" className="mt-6 grid gap-3 sm:grid-cols-2">
        {skills.map((skill) => {
          const isSelected = skill.id === selectedId;
          const itemCopy = skillCopy[skill.id];
          return (
            <button
              key={skill.id}
              type="button"
              aria-pressed={isSelected}
              aria-controls="skill-workspace-panel"
              data-testid={`skill-select-${skill.id}`}
              onClick={() => { setSelectedId(skill.id); setQuery(""); }}
              className={`min-h-11 min-w-0 rounded-[var(--radius-card)] border-2 p-4 text-left sm:p-5 ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                  : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-m)] ${isSelected ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--muted)]"}`}>
                  <Icon name={itemCopy.icon} cls="!h-5 !w-5" />
                </span>
                <span className="min-w-0 flex-1 text-lg font-bold">{itemCopy.category}</span>
                {isSelected && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent-ink)]"><Icon name="check" />선택됨</span>}
              </span>
              <span className="mt-3 block text-sm leading-relaxed text-[var(--muted)]">{itemCopy.purpose}</span>
              <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--muted)]">
                <span>필요한 입력 {skill.requiredInputs.length}개</span>
                <span>검사 규칙 {skill.ruleCatalog.length}개</span>
              </span>
            </button>
          );
        })}
      </div>

      <section id="skill-workspace-panel" aria-labelledby="skill-workspace-title" className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[var(--line-strong)] px-4 py-5 sm:px-6">
          <div>
            <h3 id="skill-workspace-title" className="text-lg font-bold">{selected.name}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{copy.purpose}</p>
          </div>
          {onStartSkill && (
            <button
              type="button"
              onClick={() => onStartSkill(selected.id)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-s)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] sm:w-auto"
            >
              <Icon name="agent" />
              이 스킬로 상담 시작
            </button>
          )}
        </header>

        <div className="grid min-w-0 min-[1100px]:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.5fr)]">
          <section aria-labelledby="skill-inputs-title" className="min-w-0 border-b border-[var(--line)] px-4 py-5 sm:px-6 min-[1100px]:border-r min-[1100px]:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id="skill-inputs-title" className="text-base font-bold">필요한 입력</h4>
              <Pill>{selected.requiredInputs.length}개</Pill>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">상담에서 확인하는 정보입니다. 부족한 값은 다시 물어봅니다.</p>
            <ul className="mt-4 divide-y divide-[var(--line)]">
              {selected.requiredInputs.map((input) => (
                <li key={input.key} data-testid="skill-input-item" data-input-key={input.key} className="min-w-0 py-4 first:pt-0">
                  <p className="text-sm font-semibold">{input.label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{inputTypeLabel[input.type]}</p>
                  {input.inheritable && <p className="mt-2 text-xs leading-relaxed text-[var(--accent-ink)]">급여명세서 계산값을 이어받을 수 있습니다.</p>}
                  {input.options && (
                    <details className="mt-1">
                      <summary className="min-h-11 cursor-pointer content-center text-xs font-semibold text-[var(--muted)]">선택 가능한 값 {input.options.length}개</summary>
                      <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`${input.label} 선택 가능한 값`}>
                        {input.options.map((option) => <li key={option} className="rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs">{option}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="skill-rules-title" className="min-w-0 bg-[var(--surface)] px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id="skill-rules-title" className="text-base font-bold">검사 항목</h4>
              <Pill tone="accent">규칙 {ruleCount}개</Pill>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">입력한 조건에 해당하는 규칙이 실제 판정에 적용됩니다.</p>
            <label htmlFor="skill-rule-search" className="mt-4 block text-xs font-semibold">검사 항목 검색</label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--muted)]"><Icon name="search" /></span>
                <input
                  id="skill-rule-search"
                  data-testid="skill-rule-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="항목 이름 또는 규칙 코드"
                  className="min-h-11 w-full min-w-0 rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--panel)] py-2 pr-3 pl-9 text-sm"
                />
              </div>
              {query && <button type="button" onClick={() => setQuery("")} className={secondaryButton} data-testid="skill-rule-search-reset">초기화</button>}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]" role="status">{search ? `검색 결과 ${matchingRules.length}개 / 전체 ${ruleCount}개` : `전체 ${ruleCount}개 항목`}</p>
            {matchingRules.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {matchingRules.map((rule) => (
                  <li key={rule.rule} data-testid="skill-rule-item" data-rule-id={rule.rule} className="min-w-0 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-xs font-bold text-[var(--accent-ink)]">{rule.rule}</span>
                      <p className="min-w-0 text-sm font-semibold">{rule.name}</p>
                    </div>
                    {"note" in rule && typeof rule.note === "string" && <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{rule.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-[var(--radius-m)] border border-dashed border-[var(--line-strong)] bg-[var(--panel)] px-4 py-6">
                <p className="text-sm font-semibold">일치하는 검사 항목이 없습니다.</p>
                <p className="mt-1 text-xs text-[var(--muted)]">다른 이름이나 규칙 코드로 검색하거나 검색어를 초기화하세요.</p>
              </div>
            )}
          </section>
        </div>

        <section aria-labelledby="skill-results-title" className="border-t-2 border-[var(--line-strong)] px-4 py-5 sm:px-6">
          <h4 id="skill-results-title" className="text-base font-bold">결과와 사용 범위</h4>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed">{copy.result}</p>
          <div data-testid="skill-not-covered" className="mt-4 border-l-2 border-[var(--line-strong)] pl-4">
            <h5 className="text-sm font-semibold">{selected.notCovered?.length ? "검사하지 않는 항목" : "사용 범위"}</h5>
            <p className="mt-2 max-w-4xl text-xs leading-relaxed text-[var(--muted)]">{copy.scope}</p>
            {selected.notCovered && <ul className="mt-3 max-w-4xl list-disc space-y-2 pl-4 text-xs leading-relaxed text-[var(--muted)]">{selected.notCovered.map((item) => <li key={item}>{item}</li>)}</ul>}
          </div>
          <details key={selected.id} className="mt-5 border-t border-[var(--line)] pt-2">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">이런 상담에 사용합니다</summary>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--muted)]">
              {selected.examples.map((example) => <li key={example}>“{example}”</li>)}
            </ul>
            <p className="mt-4 text-xs font-semibold">관련 표현</p>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="스킬과 연결되는 표현">
              {selected.triggers.map((trigger) => <li key={trigger} className="rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">{trigger}</li>)}
            </ul>
          </details>
        </section>
      </section>
    </div>
  );
}
