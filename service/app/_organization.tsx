"use client";

import { useEffect, useRef, useState } from "react";
import { type FlowTab, type FlowView } from "@/lib/flow";
import { getSkill, type SkillId } from "@/lib/skills";
import { buildLiveOntology, type LiveOntologyInput } from "@/lib/ontology/live";
import { ORGANIZATION_CAPABILITIES, ORGANIZATION_DEPARTMENTS, ORGANIZATION_PROCESS_EDGES, ORGANIZATION_PROCESS_STAGES, capabilityState, summarizeOrgStates, type OrgCapability, type OrgCapabilityState } from "@/lib/organization";
import { Icon } from "./_ui";
import styles from "./_organization.module.css";

const ACTORS = [{ value: "all", label: "전체 역할" }, { value: "모델", label: "AI 모델" }, { value: "코드", label: "규칙 코드" }, { value: "사람", label: "사람" }];
const ICONS: Record<string, string> = { input: "users", routing: "scenario", extract: "funnel", judge: "scale", payslip: "calc", departure: "plane", guard: "shield", ontology: "ontology", narrate: "speech", translate: "translate", record: "audit", approval: "users", application: "check" };
const actorLabel = (actor: OrgCapability["actor"]) => actor === "모델" ? "AI 모델" : actor === "코드" ? "규칙 코드" : "사람";
const primaryOutput = (capability: OrgCapability) => capability.output[capability.id === "application" ? 1 : 0];

function StateBadge({ state }: { state: OrgCapabilityState }) {
  return <span className={styles.status} data-status={state.status}><span aria-hidden className={styles.statusDot} />{state.label}</span>;
}

export function OrgView({ live, availability, canApprove = false, onNavigate, onOpenSkill, onOpenConsult }: {
  live: LiveOntologyInput;
  availability: { agent: boolean; translation: boolean };
  canApprove?: boolean;
  onNavigate: (view: FlowView, tab?: FlowTab) => void;
  onOpenSkill: (id: SkillId) => void;
  onOpenConsult: () => void;
}) {
  const snapshot = buildLiveOntology(live);
  const [selectedId, setSelectedId] = useState("payslip");
  const [detailOpen, setDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("all");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = ORGANIZATION_CAPABILITIES.find((capability) => capability.id === selectedId)!;
  const states = new Map(ORGANIZATION_CAPABILITIES.map((capability) => [capability.id, capabilityState(capability, snapshot, availability, canApprove)]));
  const counts = summarizeOrgStates([...states.values()]);
  const selectedState = states.get(selectedId)!;
  const selectedSkill = selected.skillId ? getSkill(selected.skillId) : null;
  const filtered = ORGANIZATION_CAPABILITIES.filter((capability) =>
    (actor === "all" || capability.actor === actor) &&
    `${capability.title} ${capability.summary} ${capability.input.join(" ")} ${capability.output.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const filtering = query.trim() !== "" || actor !== "all";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (detailOpen && dialog && !dialog.open) dialog.showModal();
    else if (!detailOpen && dialog?.open) dialog.close();
  }, [detailOpen]);

  function inspect(id: string) { setSelectedId(id); setDetailOpen(true); }
  function closeDetail() { dialogRef.current?.close(); setDetailOpen(false); }
  function openTarget() {
    closeDetail();
    if (["approval", "application"].includes(selected.id)) onOpenConsult();
    else onNavigate(selected.target.view, selected.target.tab);
  }
  function card(capability: OrgCapability) {
    const state = states.get(capability.id)!;
    return <div key={capability.id} data-testid="org-capability" data-status={state.status} data-actor={capability.actor}>
      <button type="button" data-testid={`org-card-${capability.id}`} data-status={state.status}
        className={`${styles.card} ${selectedId === capability.id ? styles.selected : ""}`}
        aria-haspopup="dialog" onClick={() => inspect(capability.id)}>
        <span className={styles.cardTop}>
          <span className={styles.actor}><Icon name={ICONS[capability.id] ?? "org"} cls="h-3.5 w-3.5" />{actorLabel(capability.actor)}</span>
          <StateBadge state={state} />
        </span>
        <strong className={styles.cardTitle}>{capability.title}</strong>
        <span className={styles.cardDescription}>{capability.summary}</span>
        <span className={styles.cardMeta}>
          <span className={styles.outputLabel}>만드는 결과</span><span className={styles.outputValue}>{primaryOutput(capability)}</span>
          {state.ms !== undefined && <span className={styles.timing}>실측 {state.ms.toLocaleString("ko-KR")}ms</span>}
          <span className={styles.detailHint}>상세 보기 <span aria-hidden>↗</span></span>
        </span>
      </button>
    </div>;
  }

  function processCapability(id: string) {
    const capability = ORGANIZATION_CAPABILITIES.find((item) => item.id === id);
    if (!capability) return null;
    const state = states.get(id)!;
    return <button type="button" key={id} className={`${styles.processCapability} ${id === "judge" ? styles.processJudge : ""}`}
      data-testid={`org-process-${id}`} aria-haspopup="dialog" onClick={() => inspect(id)}>
      <span className={styles.processCapabilityTop}><span className={styles.actor}><Icon name={ICONS[id] ?? "org"} cls="h-3.5 w-3.5" />{actorLabel(capability.actor)}</span><StateBadge state={state} /></span>
      <strong>{capability.title}</strong>
    </button>;
  }

  function inlineProcessCapabilities(ids: readonly string[]) {
    return ids.flatMap((id, index) => {
      const nextId = ids[index + 1];
      const linked = nextId !== undefined && ORGANIZATION_PROCESS_EDGES.some((edge) => edge.from === id && edge.to === nextId);
      const next = nextId === undefined ? null : ORGANIZATION_CAPABILITIES.find((capability) => capability.id === nextId);
      const current = ORGANIZATION_CAPABILITIES.find((capability) => capability.id === id);
      return [processCapability(id), ...(linked && current && next ? [<span key={`${id}-${nextId}`} className={styles.inlineConnector} aria-label={`${current.title} 다음 ${next.title}`}>→</span>] : [])];
    });
  }

  function nextLabel(index: number) {
    const stage = ORGANIZATION_PROCESS_STAGES[index];
    const nextStage = ORGANIZATION_PROCESS_STAGES[index + 1];
    if (!nextStage) return null;
    const nextIds = new Set(nextStage.capabilityIds);
    const targets = [...new Set(ORGANIZATION_PROCESS_EDGES
      .filter((edge) => stage.capabilityIds.includes(edge.from) && nextIds.has(edge.to))
      .map((edge) => ORGANIZATION_CAPABILITIES.find((capability) => capability.id === edge.to)?.title)
      .filter((title): title is string => title !== undefined))];
    return targets.length ? targets.join(" · ") : nextStage.title;
  }

  return <section className={styles.workspace} data-testid="org-workspace" aria-label="AI 역할 조직도">
    <header className={styles.header}>
      <div><p className={styles.kicker}>페이체크 업무지원 조직</p><h1>AI 역할 조직도</h1>
        <p className={styles.subtitle}>실제 요청, 결정 코드, 사람의 승인까지 상담 결과가 만들어지고 적용되는 경로입니다.<br />{ORGANIZATION_DEPARTMENTS.length}개 부서 · {ORGANIZATION_CAPABILITIES.length}개 업무 기능 · {ORGANIZATION_CAPABILITIES.filter((item) => item.skillId).length}개 등록 판정 스킬</p></div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.control} onClick={() => onNavigate("skills")}>스킬 목록</button>
        <button type="button" className={styles.control} aria-haspopup="dialog" onClick={() => setDetailOpen(true)}><Icon name="panel" />상세 패널</button>
      </div>
    </header>

    <section className={styles.process} aria-labelledby="org-process-title" data-testid="org-process">
      <header className={styles.processHead}><div><p>실제 처리 순서</p><h2 id="org-process-title">검증한 결과를 만들고, 사람이 적용합니다</h2></div><span>현재 상태는 이 상담의 관측 기록만 반영합니다.</span></header>
      <ol className={styles.processStages}>
        {ORGANIZATION_PROCESS_STAGES.map((stage, index) => <li key={stage.id} className={styles.processStage} data-kind={stage.kind}>
          <div className={styles.processStageHead}><span>{stage.kind === "parallel" ? "동시 요청" : stage.kind === "verification" ? "검증 묶음" : stage.kind === "answer" ? "답변과 선택 번역" : stage.kind === "endpoint" ? "사람의 실제 게이트" : "처리 단계"}</span><strong>{stage.title}</strong></div>
          <p>{stage.description}</p>
          <div className={`${styles.processCapabilities} ${stage.kind === "parallel" ? styles.concurrent : ""}`}>{inlineProcessCapabilities(stage.capabilityIds)}</div>
          {stage.kind === "parallel" && <p className={styles.processNote}>두 요청은 서로의 완료를 기다리지 않습니다.</p>}
          {!!stage.branchCapabilityIds?.length && <div className={styles.translationBranch}><span>선택 번역</span><div>{stage.branchCapabilityIds.map(processCapability)}</div><p>번역 실패 시에도 한국어 답변과 승인 경로는 유지됩니다.</p></div>}
          <span className={styles.processOutput}><span>남기는 결과</span>{stage.output}</span>
          {index < ORGANIZATION_PROCESS_STAGES.length - 1 && <span className={styles.processNext}>다음: {nextLabel(index)}</span>}
        </li>)}
      </ol>
      <p className={styles.processCaption}>이 순서는 실제 결과 의존 관계입니다. 등록 스킬은 ‘결정 코드’가 실행하는 규칙 목록이며, 별도 AI 역할이나 실행 단계가 아닙니다.</p>
    </section>

    <div className={styles.toolbar}>
      <label className={styles.search}><Icon name="search" /><input aria-label="조직도 스킬 검색" placeholder="기능·스킬·입력 찾기" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.filters} role="group" aria-label="담당 주체 필터">{ACTORS.map((item) => <button key={item.value} type="button" aria-pressed={actor === item.value} onClick={() => setActor(item.value)}>{item.label}</button>)}</div>
      {filtering && <button type="button" className={styles.reset} onClick={() => { setQuery(""); setActor("all"); }}>필터 초기화</button>}
    </div>

    {filtered.length === 0 ? <div className={styles.empty}><Icon name="search" /><h2>일치하는 업무 기능이 없습니다</h2><p>검색어를 바꾸거나 필터를 초기화해 보세요.</p></div> : <>
      <div className={styles.departments}>
        {ORGANIZATION_DEPARTMENTS.map((department) => {
          const members = filtered.filter((item) => item.departmentId === department.id);
          if (!members.length) return null;
          return <section key={department.id} className={styles.department} data-testid="org-department" aria-labelledby={`org-dept-${department.id}`}>
            <header className={styles.departmentHead}><div><Icon name={department.icon} /><h2 id={`org-dept-${department.id}`}>{department.title}</h2></div><p>{department.description}</p><span>{members.length}개 업무 기능</span></header>
            <div className={styles.capabilities}>{members.map((item) => card(item))}</div>
          </section>;
        })}
      </div>
      {filtered.some((item) => item.departmentId === null) && <section className={styles.finalRoles} aria-labelledby="org-final-roles"><header><p>결과의 실제 끝점</p><h2 id="org-final-roles">상담사 승인 후 결과를 적용합니다</h2></header><div>{filtered.filter((item) => item.departmentId === null).map((item) => card(item))}</div></section>}
    </>}

    <footer className={styles.footer}>
      <div><span className={styles.liveMark} aria-hidden />현재 상담 기준 <span className={styles.scope}>{snapshot.label === "서비스 연결 지도" ? "아직 실행한 상담이 없습니다" : snapshot.label}</span></div>
      <div className={styles.legend} role="status" aria-live="polite"><span>실행 중 <strong>{counts.running}</strong></span><span>완료 <strong>{counts.completed}</strong></span><span>확인 필요 <strong>{counts.blocked}</strong></span><span>승인 필요 <strong>{counts.review}</strong></span></div>
      <p>검색과 필터는 아래 역할 목록만 좁히며 실제 흐름을 바꾸지 않습니다. 준비됨은 사용 가능한 기능이고, AI 연결 여부와 실제 실행 상태는 구분합니다.</p>
    </footer>

    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="org-detail-title" onClose={() => setDetailOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}>
      <div className={styles.dialogHead}><span>{selected.skillId ? "판정 스킬" : "업무 기능"} 상세 · {actorLabel(selected.actor)}</span><button type="button" aria-label="상세 패널 닫기" onClick={closeDetail}>✕</button></div>
      <div className={styles.dialogBody}>
        <StateBadge state={selectedState} />
        <h2 id="org-detail-title">{selected.title}</h2><p className={styles.detailSummary}>{selected.summary}</p>
        <div className={styles.observed}><strong>현재 상태</strong><p>{selectedState.detail}</p>{selectedState.ms !== undefined && <p>관측된 요청 소요 시간 {selectedState.ms.toLocaleString("ko-KR")}ms</p>}</div>
        {[{ title: "필요한 입력", values: selected.input }, { title: "만드는 결과", values: selected.output }, { title: "역할의 경계", values: selected.constraints.filter((value) => !selectedSkill?.notCovered?.includes(value)) }].filter((section) => section.values.length > 0).map((section) => <section className={styles.detailSection} key={section.title}><h3>{section.title}</h3><ul>{section.values.map((value) => <li key={value}>{value}</li>)}</ul></section>)}
        {selectedSkill && <section className={styles.detailSection}><h3>검사 항목 <span>{selectedSkill.ruleCatalog.length}</span></h3><ul className={styles.ruleList}>{selectedSkill.ruleCatalog.map((rule) => <li key={rule.rule}><code>{rule.rule}</code><span>{rule.name}</span></li>)}</ul></section>}
        {!!selectedSkill?.notCovered?.length && <section className={styles.detailSection}><h3>검사하지 않는 항목</h3><ul>{selectedSkill.notCovered.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        <details className={styles.codeDetails}><summary>구현 근거 확인</summary>{selected.source.map((source) => <code key={source}>{source}</code>)}</details>
      </div>
      <div className={styles.dialogActions}>
        {selected.skillId && <button type="button" className={styles.primary} onClick={() => { closeDetail(); onOpenSkill(selected.skillId!); }}>스킬 항목 보기</button>}
        {!selected.skillId && <button type="button" className={styles.primary} onClick={openTarget}>{["approval", "application"].includes(selected.id) ? "현재 상담 검토하기" : selected.target.label}</button>}
      </div>
    </dialog>
  </section>;
}
