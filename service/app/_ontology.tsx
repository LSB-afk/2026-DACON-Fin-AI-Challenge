"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveOntologySnapshot } from "@/lib/ontology/live";
import type { AgentLoop } from "./_agent-core";
import { LiveOntologyPanel } from "./_ontologyLive";
import type { ABox, ABoxCheckResult, Individual } from "@/lib/ontology/abox";
import {
  AXIOMS,
  CLASSES,
  DATA_PROPERTIES,
  OBJECT_PROPERTIES,
  ancestors,
  classById,
  enforcedRatio,
  type ClassRole,
  type OntologyClass,
} from "@/lib/ontology/schema";
import {
  conceptAxioms,
  conceptNeighborhood,
  conceptProperties,
  conceptRelations,
  domainHierarchy,
  searchConcepts,
  type ConceptRelation,
  type ConceptTreeNode,
} from "@/lib/ontology/explorer";
import {
  OntologyGraph,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "./_graph";

export type OntologyExecution = {
  graph: ABox;
  check: ABoxCheckResult;
};

export type OntologySource = {
  label: string;
  description: string;
};

type KnowledgeMode = "live" | "tbox" | "abox";
type GraphScope = "local" | "global";
type Depth = 1 | 2;

const ROLE_META: Record<ClassRole, { label: string; dot: string; surface: string }> = {
  입력: { label: "들어온 것", dot: "#1676C8", surface: "#EFF5FB" },
  산출: { label: "만든 것", dot: "#238B73", surface: "#EDF8F1" },
  제약: { label: "법정 제약", dot: "#A67A23", surface: "#FAF7E7" },
  통제: { label: "검사·차단", dot: "#7667B1", surface: "#F4F1FA" },
};

const ROLES = Object.keys(ROLE_META) as ClassRole[];

function ToggleButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-8 rounded-md border px-2.5 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 motion-reduce:transition-none ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function ModeTab({
  active,
  onClick,
  title,
  subtitle,
  count,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  count: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-w-0 flex-1 border-b-2 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-tint)]"
          : "border-transparent bg-white hover:bg-[var(--surface)]"
      }`}
      data-testid={testId}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-bold ${active ? "text-[var(--accent-ink)]" : "text-[var(--ink)]"}`}>{title}</span>
        <span className="font-mono text-[10px] text-[var(--muted)]">{count}</span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">{subtitle}</span>
    </button>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">온톨로지 검색</span>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-soft)]">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-9 pr-9 text-sm outline-none placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-tint)]"
        data-testid="ontology-search"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-[var(--muted)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          ×
        </button>
      )}
    </label>
  );
}

function ConceptRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: ConceptTreeNode;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = node.concept.id === selectedId;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.concept.id)}
        aria-current={selected ? "true" : undefined}
        className={`group flex min-h-9 w-full items-center gap-2 border-l-2 pr-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
          selected
            ? "border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--accent-ink)]"
            : "border-transparent text-[var(--ink)] hover:bg-[var(--surface)]"
        }`}
        style={{ paddingLeft: `${10 + depth * 15}px` }}
        data-testid="ontology-tree-item"
        data-concept-id={node.concept.id}
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: ROLE_META[node.concept.role].dot }}
        />
        <span className="min-w-0 flex-1 truncate">{node.concept.label}</span>
        {node.children.length > 0 && (
          <span className="font-mono text-[9px] font-normal text-[var(--muted-soft)]">{node.children.length}</span>
        )}
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <ConceptRow
              key={child.concept.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RootGroup({
  node,
  expanded,
  selectedId,
  onSelect,
  onToggle,
}: {
  node: ConceptTreeNode;
  expanded: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const selected = node.concept.id === selectedId;
  const panelId = `ontology-root-${node.concept.id}`;
  return (
    <li className="border-b border-[var(--line-soft)] last:border-b-0">
      <div className={`flex items-center ${selected ? "bg-[var(--accent-tint)]" : "bg-white"}`}>
        <button
          type="button"
          onClick={() => onSelect(node.concept.id)}
          aria-current={selected ? "true" : undefined}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 border-l-2 px-2.5 text-left text-xs outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          style={{ borderLeftColor: selected ? "var(--accent)" : "transparent" }}
          data-testid="ontology-tree-item"
          data-concept-id={node.concept.id}
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROLE_META[node.concept.role].dot }} />
          <span className={`min-w-0 flex-1 truncate ${selected ? "font-bold text-[var(--accent-ink)]" : "font-semibold text-[var(--ink)]"}`}>{node.concept.label}</span>
          <span className="font-mono text-[9px] font-normal text-[var(--muted-soft)]">{node.children.length}</span>
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${node.concept.label} 하위 개념 ${expanded ? "접기" : "펼치기"}`}
          onClick={() => onToggle(node.concept.id)}
          className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded text-[var(--muted)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          data-testid="ontology-root-toggle"
        >
          <span aria-hidden className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}>›</span>
        </button>
      </div>
      {expanded && (
        <ul id={panelId}>
          {node.children.map((child) => (
            <ConceptRow key={child.concept.id} node={child} depth={1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Breadcrumbs({ concept }: { concept: OntologyClass }) {
  const trail = [...ancestors(concept.id)].reverse()
    .map((id) => classById(id))
    .filter((item): item is OntologyClass => Boolean(item));
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-[var(--muted)]">
      {trail.map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <span>{item.label}</span>
          <span aria-hidden className="text-[var(--muted-soft)]">/</span>
        </span>
      ))}
      <span className="font-semibold text-[var(--ink)]">{concept.label}</span>
    </div>
  );
}

function makeClassGraph(selectedId: string, scope: GraphScope, depth: Depth) {
  const selected = classById(selectedId) ?? CLASSES[0];
  let classes = CLASSES;
  if (scope === "local") {
    const neighborhood = conceptNeighborhood(selected.id, depth);
    const ids = new Set(neighborhood.classes.map((item) => item.id));
    ids.add(selected.id);
    let frontier = [selected.id];
    for (let level = 0; level < depth; level++) {
      const next: string[] = [];
      for (const current of frontier) {
        const concept = classById(current);
        if (concept?.parent && !ids.has(concept.parent)) {
          ids.add(concept.parent);
          next.push(concept.parent);
        }
        for (const child of CLASSES.filter((item) => item.parent === current)) {
          if (ids.has(child.id)) continue;
          ids.add(child.id);
          next.push(child.id);
        }
      }
      frontier = next;
    }
    classes = CLASSES.filter((item) => ids.has(item.id));
  }
  const ids = new Set(classes.map((item) => item.id));
  const nodes: KnowledgeGraphNode[] = classes.map((item) => ({
    id: item.id,
    label: item.label,
    role: item.role,
    parentId: item.parent,
    kind: "class",
  }));
  const hierarchy: KnowledgeGraphEdge[] = classes
    .filter((item) => item.parent && ids.has(item.parent))
    .map((item) => ({
      id: `hierarchy:${item.parent}:${item.id}`,
      source: item.parent!,
      target: item.id,
      label: "하위 개념",
      hierarchy: true,
    }));
  const relations: KnowledgeGraphEdge[] = OBJECT_PROPERTIES
    .filter((property) => ids.has(property.domain) && ids.has(property.range))
    .map((property) => ({
      id: property.id,
      source: property.domain,
      target: property.range,
      label: property.label,
      evidential: property.evidential,
    }));
  return { nodes, edges: [...hierarchy, ...relations] };
}

function individualLabel(individual: Individual): string {
  const rule = individual.values?.["d.rule"];
  const level = individual.values?.["d.level"];
  if (typeof rule === "string") return `${rule}${typeof level === "string" ? ` · ${level}` : ""}`;
  return classById(individual.class)?.label ?? individual.class;
}

function makeABoxGraph(abox: ABox, selectedId: string | null, scope: GraphScope, depth: Depth) {
  const byId = new Map(abox.individuals.map((individual) => [individual.id, individual]));
  let ids = new Set(abox.individuals.map((individual) => individual.id));
  if (scope === "local" && selectedId && byId.has(selectedId)) {
    ids = new Set([selectedId]);
    let frontier = [selectedId];
    for (let level = 0; level < depth; level++) {
      const next: string[] = [];
      for (const individual of abox.individuals) {
        for (const link of individual.links ?? []) {
          if (!byId.has(link.target)) continue;
          if (frontier.includes(individual.id) && !ids.has(link.target)) {
            ids.add(link.target);
            next.push(link.target);
          }
          if (frontier.includes(link.target) && !ids.has(individual.id)) {
            ids.add(individual.id);
            next.push(individual.id);
          }
        }
      }
      frontier = next;
    }
  }
  const nodes: KnowledgeGraphNode[] = abox.individuals
    .filter((individual) => ids.has(individual.id))
    .map((individual) => ({
      id: individual.id,
      label: individualLabel(individual),
      role: classById(individual.class)?.role ?? "산출",
      kind: "individual",
    }));
  const edges: KnowledgeGraphEdge[] = abox.individuals.flatMap((individual) =>
    (individual.links ?? [])
      .filter((link) => ids.has(individual.id) && ids.has(link.target))
      .map((link, index) => ({
        id: `${individual.id}:${link.p}:${link.target}:${index}`,
        source: individual.id,
        target: link.target,
        label: OBJECT_PROPERTIES.find((property) => property.id === link.p)?.label ?? link.p,
        evidential: OBJECT_PROPERTIES.find((property) => property.id === link.p)?.evidential,
      })),
  );
  return { nodes, edges };
}

function RelationList({
  title,
  direction,
  relations,
  onSelect,
}: {
  title: string;
  direction: "incoming" | "outgoing";
  relations: ConceptRelation[];
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-[var(--ink)]">{title}</h4>
        <span className="font-mono text-[10px] text-[var(--muted)]">{relations.length}</span>
      </div>
      {relations.length ? (
        <ul className="mt-1.5 divide-y divide-[var(--line-soft)] border-y border-[var(--line-soft)]">
          {relations.map((relation) => {
            const neighbor = direction === "incoming" ? relation.source : relation.target;
            const inherited = relation.applicability.find((match) => match.inheritedFrom)?.inheritedFrom;
            return (
              <li key={`${relation.property.id}:${relation.source.id}:${relation.target.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(neighbor.id)}
                  className="w-full py-2 text-left outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                >
                  <span className="flex items-center gap-2 text-[11px]">
                    <span aria-hidden className="text-[var(--accent)]">{direction === "incoming" ? "←" : "→"}</span>
                    <span className="font-semibold text-[var(--ink)]">{neighbor.label}</span>
                  </span>
                  <span className="mt-0.5 block truncate pl-5 text-[10px] text-[var(--muted)]">{relation.property.label}</span>
                  {inherited && <span className="mt-1 block pl-5 text-[10px] text-[var(--muted)]">상위 개념 ‘{inherited.label}’에서 적용되는 관계</span>}
                </button>
                {inherited && <button type="button" onClick={() => onSelect(inherited.id)} className="mb-2 ml-5 text-[10px] font-semibold text-[var(--accent)] underline underline-offset-2">상위 정의 확인: {inherited.label}</button>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">연결된 관계가 없습니다.</p>
      )}
    </section>
  );
}

function ClassInspector({ concept, onSelect }: { concept: OntologyClass; onSelect: (id: string) => void }) {
  const relations = conceptRelations(concept.id);
  const properties = conceptProperties(concept.id);
  const axioms = conceptAxioms(concept.id);
  return (
    <div className="space-y-5" data-testid="ontology-class-inspector">
      <section>
        <p className="text-sm leading-6 text-[var(--ink)]">{concept.note}</p>
      </section>

      <section>
        <h4 className="text-xs font-bold text-[var(--ink)]">코드 근거</h4>
        <code className="mt-1.5 block break-all rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--accent-ink)]">
          {concept.codeSource}
        </code>
      </section>

      <RelationList title="들어오는 관계" direction="incoming" relations={relations.incoming} onSelect={onSelect} />
      <RelationList title="나가는 관계" direction="outgoing" relations={relations.outgoing} onSelect={onSelect} />

      <section>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[var(--ink)]">적용 속성</h4>
          <span className="font-mono text-[10px] text-[var(--muted)]">{properties.length}</span>
        </div>
        {properties.length ? (
          <ul className="mt-1.5 space-y-2">
            {properties.map((property) => (
              <li key={property.id} className="rounded-md border border-[var(--line)] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">{property.label}</span>
                  <code className="shrink-0 text-[9px] text-[var(--muted-soft)]">{property.datatype}</code>
                </div>
                <code className="mt-0.5 block text-[9px] text-[var(--accent)]">{property.id}</code>
                {property.clause && <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">{property.clause}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">이 개념에 적용되는 데이터 속성이 없습니다.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[var(--ink)]">관련 공리</h4>
          <span className="font-mono text-[10px] text-[var(--muted)]">{axioms.length}</span>
        </div>
        {axioms.length ? (
          <ul className="mt-1.5 space-y-2">
            {axioms.map((axiom, index) => (
              <li key={`${axiom.kind}:${axiom.left}:${axiom.right}:${index}`} className="border-l-2 border-[var(--line-strong)] pl-2.5">
                <p className="text-[10px] font-semibold text-[var(--ink)]">
                  {axiom.kind} · {classById(axiom.left)?.label ?? axiom.left} / {classById(axiom.right)?.label ?? axiom.right}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{axiom.why}</p>
                <code className={`mt-1 block break-all text-[9px] ${axiom.enforcedBy ? "text-[var(--accent)]" : "text-[var(--warning-ink)]"}`}>
                  {axiom.enforcedBy ?? "아직 코드로 강제되지 않음"}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">직접 연결된 공리가 없습니다.</p>
        )}
      </section>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function IndividualInspector({
  individual,
  abox,
  onSelect,
}: {
  individual: Individual;
  abox: ABox;
  onSelect: (id: string) => void;
}) {
  const concept = classById(individual.class);
  const outgoing = individual.links ?? [];
  const incoming = abox.individuals.flatMap((source) =>
    (source.links ?? [])
      .filter((link) => link.target === individual.id)
      .map((link) => ({ source, link })),
  );
  const values = Object.entries(individual.values ?? {});
  return (
    <div className="space-y-5" data-testid="ontology-individual-inspector">
      <section>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-[10px] font-semibold text-[var(--muted)]">타입이 된 T-Box 개념</p>
          <p className="mt-1 text-sm font-bold text-[var(--ink)]">{concept?.label ?? individual.class}</p>
          {concept && <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{concept.note}</p>}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-bold text-[var(--ink)]">실제 데이터 속성</h4>
        {values.length ? (
          <dl className="mt-1.5 divide-y divide-[var(--line-soft)] border-y border-[var(--line-soft)]">
            {values.map(([key, value]) => (
              <div key={key} className="py-2">
                <dt className="font-mono text-[9px] text-[var(--muted-soft)]">{key}</dt>
                <dd className="mt-0.5 break-words text-xs font-medium text-[var(--ink)]">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-1.5 rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">이 개체에 기록된 데이터 속성이 없습니다.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[var(--ink)]">들어오는 실제 관계</h4>
          <span className="font-mono text-[10px] text-[var(--muted)]">{incoming.length}</span>
        </div>
        <ul className="mt-1.5 divide-y divide-[var(--line-soft)]">
          {incoming.map(({ source, link }) => (
            <li key={`${source.id}:${link.p}`}>
              <button type="button" onClick={() => onSelect(source.id)} className="w-full py-2 text-left text-xs outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                <span className="font-semibold text-[var(--ink)]">← {individualLabel(source)}</span>
                <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{OBJECT_PROPERTIES.find((item) => item.id === link.p)?.label ?? link.p}</span>
              </button>
            </li>
          ))}
        </ul>
        {!incoming.length && <p className="rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">들어오는 관계가 없습니다.</p>}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[var(--ink)]">나가는 실제 관계</h4>
          <span className="font-mono text-[10px] text-[var(--muted)]">{outgoing.length}</span>
        </div>
        <ul className="mt-1.5 divide-y divide-[var(--line-soft)]">
          {outgoing.map((link) => {
            const target = abox.individuals.find((item) => item.id === link.target);
            return (
              <li key={`${link.p}:${link.target}`}>
                <button type="button" disabled={!target} onClick={() => target && onSelect(target.id)} className="w-full py-2 text-left text-xs outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-default">
                  <span className="font-semibold text-[var(--ink)]">→ {target ? individualLabel(target) : link.target}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{OBJECT_PROPERTIES.find((item) => item.id === link.p)?.label ?? link.p}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!outgoing.length && <p className="rounded bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">나가는 관계가 없습니다.</p>}
      </section>

      {concept && (
        <section>
          <h4 className="text-xs font-bold text-[var(--ink)]">타입 코드 근거</h4>
          <code className="mt-1.5 block break-all rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-2.5 py-2 text-[10px] text-[var(--accent-ink)]">{concept.codeSource}</code>
        </section>
      )}
    </div>
  );
}

export function OntologyWorkspace({
  abox,
  source,
  live,
  loop,
  onOpenConsult,
}: {
  abox: OntologyExecution | null;
  source?: OntologySource;
  live?: LiveOntologySnapshot;
  loop?: AgentLoop;
  onOpenConsult?: () => void;
}) {
  const taxonomyRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<KnowledgeMode>(live ? "live" : "tbox");
  const [scope, setScope] = useState<GraphScope>("global");
  const [depth, setDepth] = useState<Depth>(1);
  const [query, setQuery] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState(CLASSES[0]?.id ?? "");
  const [selectedIndividualId, setSelectedIndividualId] = useState<string | null>(
    abox?.graph.individuals[0]?.id ?? null,
  );
  const [visibleRoles, setVisibleRoles] = useState<ReadonlySet<ClassRole>>(() => new Set(ROLES));
  const [expandedRoots, setExpandedRoots] = useState<ReadonlySet<string>>(
    () => new Set(CLASSES[0] ? [CLASSES[0].id] : []),
  );

  const hasABox = Boolean(abox && abox.graph.individuals.length > 0);
  const selectedConcept = classById(selectedConceptId) ?? CLASSES[0];
  const selectedIndividual = abox?.graph.individuals.find((item) => item.id === selectedIndividualId)
    ?? abox?.graph.individuals[0]
    ?? null;

  const selectConcept = (id: string, reveal = false) => {
    const rootId = ancestors(id).at(-1) ?? id;
    setExpandedRoots((current) => {
      if (current.has(rootId)) return current;
      const next = new Set(current);
      next.add(rootId);
      return next;
    });
    if (reveal) setQuery("");
    setSelectedConceptId(id);
  };

  useEffect(() => {
    if (mode !== "tbox" || query.trim()) return;
    const frame = requestAnimationFrame(() => {
      const panel = taxonomyRef.current;
      if (!panel) return;
      const item = [...panel.querySelectorAll<HTMLElement>("[data-concept-id]")]
        .find((element) => element.dataset.conceptId === selectedConceptId);
      if (!item) return;
      const panelRect = panel.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      if (itemRect.top < panelRect.top + 8) panel.scrollTop -= panelRect.top - itemRect.top + 8;
      else if (itemRect.bottom > panelRect.bottom - 8) panel.scrollTop += itemRect.bottom - panelRect.bottom + 8;
    });
    return () => cancelAnimationFrame(frame);
  }, [expandedRoots, mode, query, selectedConceptId]);

  const classMatches = useMemo(() => searchConcepts(query), [query]);
  const individualMatches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!abox || !normalized) return abox?.graph.individuals ?? [];
    return abox.graph.individuals.filter((individual) => {
      const concept = classById(individual.class);
      return [individual.id, individual.class, concept?.label ?? "", ...Object.values(individual.values ?? {}).map(formatValue)]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalized);
    });
  }, [abox, query]);

  const graph = useMemo(() => {
    if (mode === "tbox") return makeClassGraph(selectedConcept.id, scope, depth);
    if (!abox || !hasABox) return { nodes: [], edges: [] };
    return makeABoxGraph(abox.graph, selectedIndividual?.id ?? null, scope, depth);
  }, [abox, depth, hasABox, mode, scope, selectedConcept.id, selectedIndividual?.id]);

  const filteredGraph = useMemo(() => {
    const selectedId = mode === "tbox" ? selectedConcept.id : selectedIndividual?.id;
    const nodes = graph.nodes.filter((node) => visibleRoles.has(node.role) || node.id === selectedId);
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph, mode, selectedConcept.id, selectedIndividual?.id, visibleRoles]);

  const chooseMode = (nextMode: KnowledgeMode) => {
    setMode(nextMode);
    setQuery("");
    if (nextMode === "abox") {
      setSelectedIndividualId((current) => current && abox?.graph.individuals.some((item) => item.id === current)
        ? current
        : abox?.graph.individuals[0]?.id ?? null);
    }
  };

  const toggleRole = (role: ClassRole) => {
    setVisibleRoles((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const currentId = mode === "tbox" ? selectedConcept.id : selectedIndividual?.id ?? null;
  const currentRole = mode === "tbox" ? selectedConcept.role : classById(selectedIndividual?.class ?? "")?.role;
  const ratio = enforcedRatio();

  return (
    <section aria-label="온톨로지 지식 탐색기" className="overflow-hidden rounded-lg border border-[var(--line-strong)] bg-white shadow-[0_12px_36px_rgba(16,26,43,.07)]" data-testid="ontology-workspace">
      <div role="tablist" aria-label="온톨로지 데이터 종류" className="flex border-b border-[var(--line)]">
        {live && <ModeTab active={mode === "live"} onClick={() => chooseMode("live")} title="서비스 실행 지도" subtitle="실행에 따라 연결되는 지식" count={`${live.generatedCount}개 생성`} testId="ontology-mode-live" />}
        <ModeTab
          active={mode === "tbox"}
          onClick={() => chooseMode("tbox")}
          title="T-Box 개념 사전"
          subtitle="정의 · 관계 · 속성 · 공리"
          count={`${CLASSES.length}개 개념`}
          testId="ontology-mode-tbox"
        />
        <ModeTab
          active={mode === "abox"}
          onClick={() => chooseMode("abox")}
          title="A-Box 현재 판정"
          subtitle="실제로 생성된 개체와 연결"
          count={hasABox ? `${abox!.graph.individuals.length}개 개체` : "실행 없음"}
          testId="ontology-mode-abox"
        />
      </div>

      {mode === "live" && live ? <LiveOntologyPanel snapshot={live} loop={loop} onOpenConsult={onOpenConsult} /> : <>
      <div className="border-b border-[var(--line)] bg-white px-3 py-2 min-[720px]:flex min-[720px]:items-start min-[720px]:justify-between min-[720px]:gap-4" data-testid={source ? "ontology-source" : undefined}>
        <div className="min-w-0 min-[720px]:flex min-[720px]:items-baseline min-[720px]:gap-3">
          <p className="shrink-0 text-[10px] font-semibold text-[var(--muted)]">{source ? "현재 연결한 결과" : "탐색 안내"}</p>
          <p className="mt-0.5 text-xs font-bold text-[var(--ink)] min-[720px]:mt-0">{source?.label ?? "개념과 근거가 함께 움직입니다"}</p>
          {source && <p className="mt-0.5 min-w-0 text-[11px] leading-relaxed text-[var(--muted)] min-[720px]:mt-0">{source.description}</p>}
        </div>
        <details className="mt-1 shrink-0 text-[11px] min-[720px]:mt-0">
          <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 font-semibold text-[var(--accent)] outline-none hover:bg-[var(--accent-tint)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]">이 화면 읽는 법 +</summary>
          <ol className="mt-2 max-w-xl list-decimal space-y-1 pl-5 leading-relaxed text-[var(--muted)] min-[720px]:ml-auto">
            <li>왼쪽 분류나 검색에서 개념을 고르면 그래프와 상세 근거가 함께 바뀝니다.</li>
            <li>전체 지도에서 드래그로 3D 관계를 회전하고, 선택 주변에서 1·2단계 연결을 살펴봅니다.</li>
            <li>A-Box는 실제 실행 개체만 표시하며 T-Box로 빈자리를 채우지 않습니다.</li>
          </ol>
        </details>
      </div>

      <div className="border-b border-[var(--line)] bg-[#F7F9FC] px-3 py-2.5 min-[1024px]:flex min-[1024px]:items-center min-[1024px]:justify-between min-[1024px]:gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold text-[var(--muted)]">그래프 범위</span>
          <ToggleButton active={scope === "local"} onClick={() => setScope("local")} testId="ontology-scope-local">선택 주변</ToggleButton>
          <ToggleButton active={scope === "global"} onClick={() => setScope("global")} testId="ontology-scope-global">전체 지도</ToggleButton>
          {scope === "local" && (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-[var(--line)]" />
              <ToggleButton active={depth === 1} onClick={() => setDepth(1)} testId="ontology-depth-1">1단계</ToggleButton>
              <ToggleButton active={depth === 2} onClick={() => setDepth(2)} testId="ontology-depth-2">2단계</ToggleButton>
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 min-[1024px]:mt-0" aria-label="역할 필터">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={visibleRoles.has(role)}
              onClick={() => toggleRole(role)}
              className={`flex min-h-7 items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${visibleRoles.has(role) ? "border-[var(--line-strong)] text-[var(--ink)]" : "border-[var(--line)] bg-white text-[var(--muted-soft)] line-through"}`}
              style={{ background: visibleRoles.has(role) ? ROLE_META[role].surface : undefined }}
              data-testid="ontology-role-filter"
              data-role={role}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[role].dot }} />
              {ROLE_META[role].label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(15rem,18rem)_minmax(28rem,1fr)_minmax(19rem,23rem)]" data-testid={`ontology-panel-${mode}`}>
        <aside aria-label={mode === "tbox" ? "개념 분류와 검색" : "실행 개체와 검색"} className="order-2 min-w-0 border-b border-[var(--line)] bg-white xl:order-1 xl:border-b-0 xl:border-r">
          <div className="border-b border-[var(--line)] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--ink)]">{mode === "tbox" ? "개념 분류" : "실행 개체"}</h3>
              <span className="font-mono text-[10px] text-[var(--muted)]">{mode === "tbox" ? classMatches.length : individualMatches.length}</span>
            </div>
            <SearchBox value={query} onChange={setQuery} placeholder={mode === "tbox" ? "개념, 설명, 코드 검색" : "개체, 값, 타입 검색"} />
          </div>

          <div ref={taxonomyRef} className="max-h-[15rem] overflow-y-auto overscroll-contain py-2 xl:max-h-[31rem]" data-testid="ontology-taxonomy">
            {mode === "tbox" ? (
              query.trim() ? (
                classMatches.length ? (
                  <ul className="px-2">
                    {classMatches.map((concept) => (
                      <li key={concept.id}>
                        <button
                          type="button"
                          onClick={() => selectConcept(concept.id)}
                          aria-current={concept.id === selectedConcept.id ? "true" : undefined}
                          className={`w-full rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${concept.id === selectedConcept.id ? "bg-[var(--accent-tint)]" : "hover:bg-[var(--surface)]"}`}
                          data-testid="ontology-search-result"
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
                            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[concept.role].dot }} />
                            {concept.label}
                          </span>
                          <span className="mt-0.5 block truncate pl-3.5 font-mono text-[9px] text-[var(--muted-soft)]">{concept.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-8 text-center text-xs leading-relaxed text-[var(--muted)]">검색어와 맞는 개념이 없습니다.<br />ID나 코드 경로로도 검색할 수 있습니다.</p>
                )
              ) : (
                <ul>
                  {domainHierarchy.map((node) => (
                    <RootGroup
                      key={node.concept.id}
                      node={node}
                      expanded={expandedRoots.has(node.concept.id)}
                      selectedId={selectedConcept.id}
                      onSelect={selectConcept}
                      onToggle={(id) => setExpandedRoots((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })}
                    />
                  ))}
                </ul>
              )
            ) : !hasABox ? (
              <div className="px-5 py-9 text-center" data-testid="ontology-abox-empty-list">
                <p className="text-xs font-semibold text-[var(--ink)]">기록된 실행 개체가 없습니다</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
                  {source ? `${source.label}에는 아직 A-Box 개체가 없습니다. ` : ""}판정을 실행한 뒤 생성된 개체만 이 목록에 표시합니다.
                </p>
              </div>
            ) : individualMatches.length ? (
              <ul className="px-2">
                {individualMatches.map((individual) => {
                  const role = classById(individual.class)?.role ?? "산출";
                  return (
                    <li key={individual.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedIndividualId(individual.id)}
                        aria-current={individual.id === selectedIndividual?.id ? "true" : undefined}
                        className={`w-full rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${individual.id === selectedIndividual?.id ? "bg-[var(--accent-tint)]" : "hover:bg-[var(--surface)]"}`}
                        data-testid="ontology-individual-item"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[role].dot }} />
                          {individualLabel(individual)}
                        </span>
                        <span className="mt-0.5 block truncate pl-3.5 font-mono text-[9px] text-[var(--muted-soft)]">{individual.id}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-xs text-[var(--muted)]">검색어와 맞는 실행 개체가 없습니다.</p>
            )}
          </div>
        </aside>

        <main aria-label="관계 그래프" className="order-1 min-w-0 border-b border-[var(--line)] bg-white xl:order-2 xl:border-b-0 xl:border-r">
          <header className="flex min-h-[5.25rem] items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3" aria-live="polite">
            <div className="min-w-0">
              {mode === "tbox" && selectedConcept ? (
                <>
                  <Breadcrumbs concept={selectedConcept} />
                  <h3 className="mt-1 truncate text-lg font-bold tracking-tight text-[var(--ink)]">{selectedConcept.label}</h3>
                  <code className="mt-0.5 block truncate text-[10px] text-[var(--muted-soft)]">{selectedConcept.id}</code>
                </>
              ) : selectedIndividual ? (
                <>
                  <p className="text-[10px] font-semibold text-[var(--muted)]">사례 {abox?.graph.runId} · 현재 판정 항목</p>
                  <h3 className="mt-1 truncate text-lg font-bold tracking-tight text-[var(--ink)]">{individualLabel(selectedIndividual)}</h3>
                  <code className="mt-0.5 block truncate text-[10px] text-[var(--muted-soft)]">{selectedIndividual.id}</code>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-semibold text-[var(--muted)]">A-Box 현재 판정</p>
                  <h3 className="mt-1 text-base font-bold text-[var(--ink)]">아직 실제 실행이 없습니다</h3>
                </>
              )}
            </div>
            {currentRole && (
              <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]" style={{ background: ROLE_META[currentRole].surface }}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[currentRole].dot }} />
                {ROLE_META[currentRole].label}
              </span>
            )}
          </header>

          <OntologyGraph
            nodes={filteredGraph.nodes}
            edges={filteredGraph.edges}
            selectedId={currentId}
            onSelect={mode === "tbox" ? (id) => selectConcept(id, true) : setSelectedIndividualId}
            scope={scope}
            ariaLabel={mode === "tbox" ? `${selectedConcept?.label ?? "개념"} 중심 T-Box 관계 그래프` : "이번 실행의 A-Box 관계 그래프"}
            emptyLabel={mode === "abox" ? `${source ? `${source.label}에 연결된 실행 개체가 없습니다. ` : ""}T-Box 개념을 대신 보여 주지 않습니다. 실제 판정을 실행하면 그 결과의 개체와 관계가 나타납니다.` : "역할 필터를 켜거나 다른 개념을 선택해 보세요."}
          />
        </main>

        <aside aria-label="선택 항목 상세" className="order-3 min-w-0 bg-white" data-testid="ontology-inspector">
          <header className="flex min-h-[5.25rem] items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold text-[var(--muted)]">{mode === "tbox" ? "선택한 개념" : "선택한 실행 개체"}</p>
              <h3 className="mt-1 text-sm font-bold text-[var(--ink)]">정의와 근거</h3>
            </div>
            {mode === "tbox" ? (
              <span className="font-mono text-[10px] text-[var(--muted)]">L{selectedConcept?.layer}</span>
            ) : abox ? (
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${abox.check.violations.length ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "border-[var(--accent-tint-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"}`}>
                {abox.check.violations.length ? `사전 위반 ${abox.check.violations.length}` : "사전 대조 통과"}
              </span>
            ) : null}
          </header>
          <div className="max-h-none overflow-y-visible p-4 xl:max-h-[31rem] xl:overflow-y-auto xl:overscroll-contain">
            {mode === "tbox" && selectedConcept ? (
              <ClassInspector concept={selectedConcept} onSelect={(id) => selectConcept(id, true)} />
            ) : selectedIndividual && abox ? (
              <IndividualInspector individual={selectedIndividual} abox={abox.graph} onSelect={setSelectedIndividualId} />
            ) : (
              <div className="py-12 text-center" data-testid="ontology-abox-empty-inspector">
                <p className="text-sm font-semibold text-[var(--ink)]">검토할 실제 개체가 없습니다</p>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-[var(--muted)]">
                  {source ? `${source.description} ` : ""}A-Box는 실행 결과만 기록합니다. 예시 개체나 T-Box 정의로 빈자리를 채우지 않습니다.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="grid gap-2 border-t border-[var(--line)] bg-[#F7F9FC] px-3 py-2.5 text-[10px] text-[var(--muted)] min-[720px]:grid-cols-[1fr_auto] min-[720px]:items-center">
        <p>
          {mode === "tbox"
            ? `사전에는 관계 ${OBJECT_PROPERTIES.length}종, 데이터 속성 ${DATA_PROPERTIES.length}종, 공리 ${AXIOMS.length}종이 있으며 공리 ${ratio.enforced}/${ratio.total}가 코드로 강제됩니다.`
            : hasABox
              ? `사례 ${abox!.graph.runId}의 현재 판정에서 실제 개체 ${abox!.check.counts.individuals}개와 관계 ${abox!.check.counts.links}개를 구성했습니다.`
              : "실행 전 상태입니다. A-Box에 가상의 개체를 만들지 않습니다."}
        </p>
        <p className="font-medium text-[var(--ink)]">검색 · 관계 클릭 · 방향키 선택을 함께 사용할 수 있습니다.</p>
      </footer>
      </>}
    </section>
  );
}
