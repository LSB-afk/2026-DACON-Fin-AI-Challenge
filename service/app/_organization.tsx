"use client";

import { useEffect, useRef, useState } from "react";
import { FLOW, type FlowTab, type FlowView } from "@/lib/flow";
import { getSkill, type SkillId } from "@/lib/skills";
import { buildLiveOntology, type LiveOntologyInput } from "@/lib/ontology/live";
import { ORGANIZATION_CAPABILITIES, ORGANIZATION_DEPARTMENTS, capabilityState, summarizeOrgStates, type OrgCapability, type OrgCapabilityState } from "@/lib/organization";
import { Icon } from "./_ui";
import styles from "./_organization.module.css";

const ACTORS = [{ value: "all", label: "전체 역할" }, { value: "모델", label: "AI 모델" }, { value: "코드", label: "규칙 코드" }, { value: "사람", label: "사람" }];
const ICONS: Record<string, string> = { input: "users", routing: "scenario", extract: "funnel", judge: "scale", payslip: "calc", departure: "plane", guard: "shield", ontology: "ontology", narrate: "speech", translate: "translate", record: "audit", approval: "users", application: "check" };
const actorLabel = (actor: OrgCapability["actor"]) => actor === "모델" ? "AI 모델" : actor === "코드" ? "규칙 코드" : "사람";

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
  const [guideOpen, setGuideOpen] = useState(false);
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
  function card(capability: OrgCapability, authority = false) {
    const state = states.get(capability.id)!;
    const skill = capability.skillId ? getSkill(capability.skillId) : null;
    return <div key={capability.id} data-testid="org-capability" data-status={state.status} data-actor={capability.actor}>
      <button type="button" data-testid={`org-card-${capability.id}`} data-status={state.status}
        className={`${styles.card} ${authority ? styles.authority : ""} ${selectedId === capability.id ? styles.selected : ""}`}
        aria-haspopup="dialog" onClick={() => inspect(capability.id)}>
        <span className={styles.cardTop}>
          <span className={styles.actor}><Icon name={ICONS[capability.id] ?? "org"} cls="h-3.5 w-3.5" />{authority ? capability.actor === "사람" ? "사람의 최종 확인" : "결과 전달·적용" : actorLabel(capability.actor)}</span>
          <StateBadge state={state} />
        </span>
        <strong className={styles.cardTitle}>{capability.title}</strong>
        <span className={styles.cardDescription}>{capability.summary}</span>
        {!authority && <span className={styles.cardMeta}>
          {skill ? <><span>검사 규칙 {skill.ruleCatalog.length}개</span><span>필수 입력 {skill.requiredInputs.length}종</span></>
            : <><span>입력 {capability.input.length}종</span><span>산출 {capability.output.length}종</span></>}
          {state.ms !== undefined && <span>실측 {state.ms.toLocaleString("ko-KR")}ms</span>}
          <span className={styles.detailHint}>상세 보기 <span aria-hidden>↗</span></span>
        </span>}
      </button>
    </div>;
  }

  return <section className={styles.workspace} data-testid="org-workspace" aria-label="AI 역할 조직도">
    <header className={styles.header}>
      <div><p className={styles.kicker}>페이체크 업무지원 조직</p><h1>AI 역할 조직도</h1>
        <p className={styles.subtitle}>누가 분석하고, 무엇을 검증하고, 누가 승인하는지 한눈에 확인하세요.<br />{ORGANIZATION_DEPARTMENTS.length}개 부서 · {ORGANIZATION_CAPABILITIES.length}개 업무 기능 · {ORGANIZATION_CAPABILITIES.filter((item) => item.skillId).length}개 판정 스킬</p></div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.control} aria-expanded={guideOpen} aria-controls="org-flow-guide" onClick={() => setGuideOpen((value) => !value)}><Icon name="flow" />흐름 안내</button>
        <button type="button" className={styles.control} onClick={() => onNavigate("skills")}>스킬 목록</button>
        <button type="button" className={styles.control} aria-haspopup="dialog" onClick={() => setDetailOpen(true)}><Icon name="panel" />상세 패널</button>
      </div>
    </header>

    {guideOpen && <div id="org-flow-guide" className={styles.guide}>
      <h2>상담 한 건이 처리되는 과정</h2>
      <p>발화 접수 후 라우팅과 정보 추출을 각각 요청합니다. 코드 판정·검증으로 답변을 준비하고, 상담사가 확인한 결과를 적용합니다. 번역은 필요할 때만 요청합니다.</p>
      <ol>{FLOW.map((step) => <li key={step.id}><button type="button" onClick={() => inspect(step.id)}>{step.이름}<span>{step.행위자}</span></button></li>)}</ol>
      <p>조직도의 연결선은 책임 관계입니다. 처리 순서나 가상의 대기열을 뜻하지 않습니다.</p>
    </div>}

    <div className={styles.toolbar}>
      <label className={styles.search}><Icon name="search" /><input aria-label="조직도 스킬 검색" placeholder="기능·스킬·입력 찾기" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.filters} role="group" aria-label="담당 주체 필터">{ACTORS.map((item) => <button key={item.value} type="button" aria-pressed={actor === item.value} onClick={() => setActor(item.value)}>{item.label}</button>)}</div>
      {filtering && <button type="button" className={styles.reset} onClick={() => { setQuery(""); setActor("all"); }}>필터 초기화</button>}
    </div>

    {filtered.length === 0 ? <div className={styles.empty}><Icon name="search" /><h2>일치하는 업무 기능이 없습니다</h2><p>검색어를 바꾸거나 필터를 초기화해 보세요.</p></div> : <>
      {filtered.some((item) => item.departmentId === null) && <div className={styles.authorityRow} aria-label="최종 확인과 결과 적용">{filtered.filter((item) => item.departmentId === null).map((item) => card(item, true))}</div>}
      {!filtering && <>
        <div className={styles.authorityConnector} aria-hidden="true" />
        <div className={styles.coordinationRow}>
          {[{ id: "routing", title: "상담 업무 조율", summary: "발화를 알맞은 검사로 연결하고, 판정에 필요한 값을 모읍니다.", members: ["input", "routing", "extract"], label: "분석 업무" },
            { id: "guard", title: "검증·출력 통제", summary: "규칙과 용어를 대조하고, 확인된 결과만 답변과 승인으로 연결합니다.", members: ["guard", "ontology", "narrate"], label: "안전 통제" }].map((team) => {
              const summary = summarizeOrgStates(team.members.map((id) => states.get(id)!));
              return <button type="button" key={team.id} className={styles.coordination} aria-haspopup="dialog" onClick={() => inspect(team.id)}>
                <span className={styles.coordinationTop}><span>{team.label}</span><span>{summary.running ? `실행 중 ${summary.running}개` : summary.blocked ? `확인 필요 ${summary.blocked}개` : summary.completed ? `완료 ${summary.completed}개` : "실행 전"}</span></span>
                <strong>{team.title}</strong><span>{team.summary}</span>
                <span className={styles.coordinationMeta}>담당 기능 {team.members.length}개 <span>역할 확인 ↗</span></span>
              </button>;
            })}
        </div>
        <div className={styles.departmentConnector} aria-hidden="true" />
      </>}

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
    </>}

    <footer className={styles.footer}>
      <div><span className={styles.liveMark} aria-hidden />현재 상담 기준 <span className={styles.scope}>{snapshot.label === "서비스 연결 지도" ? "아직 실행한 상담이 없습니다" : snapshot.label}</span></div>
      <div className={styles.legend} role="status" aria-live="polite"><span>실행 중 <strong>{counts.running}</strong></span><span>완료 <strong>{counts.completed}</strong></span><span>확인 필요 <strong>{counts.blocked}</strong></span><span>승인 필요 <strong>{counts.review}</strong></span></div>
      <p>준비됨은 사용 가능한 기능입니다. AI 연결 여부와 실제 실행 상태는 구분합니다. 사진 인식은 준비 중이며, 이름·연락처·계좌번호는 입력받지 않습니다.</p>
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
