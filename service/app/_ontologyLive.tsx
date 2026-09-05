"use client";

import { useState } from "react";
import type { LiveOntologySnapshot } from "@/lib/ontology/live";
import type { AgentLoop } from "./_agent-core";
import { OntologyGraph } from "./_graph";

const STATUS = { available: "서비스 정의", running: "요청 중", completed: "확인됨", blocked: "확인 필요" };
const field = "rounded-md border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]";

export function LiveOntologyPanel({ snapshot, loop, onOpenConsult }: {
  snapshot: LiveOntologySnapshot;
  loop?: AgentLoop;
  onOpenConsult?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const selected = (follow ? snapshot.events.at(-1) : snapshot.nodes.find((node) => node.id === selectedId)) ?? snapshot.nodes[0];
  const matches = snapshot.nodes.filter((node) => `${node.label} ${node.detail} ${JSON.stringify(node.values ?? {})}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const select = (id: string) => { setFollow(false); setSelectedId(id); };
  const linked = snapshot.edges.filter((edge) => edge.source === selected?.id || edge.target === selected?.id);

  return (
    <div data-testid="ontology-live" data-generated={snapshot.generatedCount} data-scope={snapshot.scopeKey} className="min-w-0 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)]">서비스가 지식으로 연결되는 과정</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">상담 접수 → 라우팅·정보 추출 → 판정·근거 확인 → 사람의 승인과 기록. 실제 실행에서 확인된 항목이 서비스 주변에 추가됩니다.</p>
        </div>
        <div className="flex items-center gap-3 text-xs" role="status" aria-live="polite">
          <span className="text-[var(--muted)]">생성된 항목 <strong className="ml-1 text-[var(--ink)]">{snapshot.generatedCount}</strong></span>
          <span className={snapshot.runningCount ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}>요청 중 {snapshot.runningCount}</span>
        </div>
      </div>

      {loop && <form className="border-b border-[var(--line)] bg-[#F7FAFD] p-4" onSubmit={(event) => { event.preventDefault(); if (!loop.busy && loop.provider?.provider) void loop.run(); }}>
        <div className="grid gap-3 min-[800px]:grid-cols-[1fr_140px_auto] min-[800px]:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            상담 내용
            <textarea aria-label="상담 내용" rows={2} value={loop.utterance} onChange={(event) => loop.setUtterance(event.target.value)} className={`${field} min-h-20 resize-y font-normal`} placeholder="출국 정산이나 급여명세서 상황을 입력하세요." />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            기준일
            <input aria-label="기준일" type="date" value={loop.todayInput} onChange={(event) => loop.setTodayInput(event.target.value)} className={`${field} min-w-0 font-normal`} />
          </label>
          <div className="flex flex-wrap gap-2 min-[800px]:flex-col">
            {loop.busy ? <button type="button" className={`${field} font-semibold`} onClick={loop.cancel}>실행 취소</button>
              : <button type="submit" className="min-h-10 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50" disabled={!loop.provider?.provider || !loop.utterance.trim()}>상담 실행</button>}
            {onOpenConsult && <button type="button" className="min-h-9 rounded-md border border-[var(--line-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" onClick={onOpenConsult}>확인값 검토·승인</button>}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">입력은 설정된 모델 제공자로 전송됩니다. 등록번호·계좌번호·전화번호는 입력하지 마세요. 그래프의 서비스 정의는 실행 완료를 뜻하지 않습니다.</p>
        {!loop.provider?.provider && <p className="mt-1 text-xs font-semibold text-[var(--warning-ink)]">AI 제공자가 연결되면 실행할 수 있습니다. 서비스 구조와 기존 판정은 계속 탐색할 수 있습니다.</p>}
        {loop.error && <p role="alert" className="mt-2 text-xs text-[var(--warning-ink)]">{loop.error}</p>}
      </form>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2">
        <p className="min-w-0 break-words text-[11px] text-[var(--muted)]">{snapshot.label}</p>
        <button type="button" aria-pressed={follow} onClick={() => setFollow((value) => !value)} className={`rounded-md border px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${follow ? "border-[var(--accent-tint-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>최신 항목 따라가기</button>
      </div>

      <div className="grid min-w-0 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <OntologyGraph nodes={snapshot.nodes} edges={snapshot.edges} selectedId={selected?.id ?? null} onSelect={select} scope="global" ariaLabel="현재 서비스 실행의 실시간 온톨로지" emptyLabel="사용할 서비스 정의가 없습니다." living motionScope={snapshot.scopeKey} />
          <p className="border-t border-[var(--line)] px-4 py-3 text-[11px] leading-relaxed text-[var(--muted)]">{snapshot.description} 연결선을 따라 움직이는 점은 실제 요청 중에만 표시됩니다. 미세한 배치 움직임은 화면 표현이며 처리 진행률이 아닙니다.</p>
        </div>
        <aside className="min-w-0 border-t border-[var(--line)] min-[1100px]:border-l min-[1100px]:border-t-0" aria-label="실행 항목과 연결 근거">
          <div className="border-b border-[var(--line)] p-4" data-testid="ontology-live-detail">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--muted)]">선택한 항목</p>
              {selected?.status && <span className={`rounded px-2 py-1 text-[10px] font-semibold ${selected.status === "running" ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]" : selected.status === "blocked" ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}>{STATUS[selected.status]}</span>}
            </div>
            <h4 className="mt-2 text-base font-bold text-[var(--ink)]">{selected?.label}</h4>
            <p className="mt-2 break-words text-xs leading-relaxed text-[var(--muted)]">{selected?.detail}</p>
            {selected?.values && <dl className="mt-3 space-y-1.5 text-xs">{Object.entries(selected.values).map(([key, value]) => <div key={key} className="grid grid-cols-[70px_1fr] gap-2"><dt className="break-words text-[var(--muted)]">{key}</dt><dd className="min-w-0 break-words text-[var(--ink)]">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>}
            <p className="mt-3 text-[10px] font-semibold text-[var(--muted)]">연결 근거</p>
            <code className="mt-1 block break-all text-[10px] leading-relaxed text-[var(--accent-ink)]">{selected?.codeSource}</code>
            <ul className="mt-3 max-h-24 space-y-1 overflow-y-auto">{linked.map((edge) => {
              const outgoing = edge.source === selected?.id;
              const neighbor = snapshot.nodes.find((node) => node.id === (outgoing ? edge.target : edge.source));
              return <li key={edge.id}><button type="button" onClick={() => neighbor && select(neighbor.id)} className="w-full rounded px-1 py-1 text-left text-[11px] text-[var(--accent-ink)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{outgoing ? "→" : "←"} {neighbor?.label} <span className="text-[var(--muted)]">{edge.label}</span></button></li>;
            })}</ul>
          </div>

          <div className="p-4">
            <label className="sr-only" htmlFor="ontology-live-search">서비스·실행 항목 검색</label>
            <input id="ontology-live-search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${field} w-full text-xs`} placeholder="서비스·실행 항목 검색" />
            <h4 className="mb-2 mt-3 text-xs font-bold text-[var(--ink)]">{query ? "검색 결과" : "이번 실행에 추가된 항목"}</h4>
            <div className="max-h-64 overflow-y-auto overscroll-contain" data-testid="ontology-live-events">
              {(query ? matches : snapshot.nodes.filter((node) => node.kind !== "service" && node.kind !== "class").reverse()).map((node) => <button type="button" key={node.id} data-testid="ontology-live-event" data-event-kind={node.kind} data-event-status={node.status} onClick={() => select(node.id)} className={`mb-1 w-full rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${selected?.id === node.id ? "bg-[var(--accent-tint)]" : "hover:bg-[var(--surface)]"}`}>
                <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--ink)]"><span>{node.label}</span><span className="shrink-0 text-[10px] font-normal text-[var(--muted)]">{node.status ? STATUS[node.status] : "실제 개체"}</span></span>
                <span className="mt-1 block break-words text-[11px] leading-relaxed text-[var(--muted)]">{node.values ? Object.values(node.values).map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" · ") : node.detail}</span>
              </button>)}
              {!query && snapshot.events.length === 0 && <p className="py-3 text-xs leading-relaxed text-[var(--muted)]">아직 실행에서 생성된 항목이 없습니다. 위에서 상담을 실행하면 접수와 실제 요청부터 차례로 연결됩니다.</p>}
              {query && matches.length === 0 && <p className="py-3 text-xs text-[var(--muted)]">일치하는 항목이 없습니다.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
