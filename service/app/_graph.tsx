"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { projectPoint3D, type Camera3D } from "@/lib/ontology/layout3d";
import { useGraphMotion } from "./_graphMotion";
import type { ClassRole } from "@/lib/ontology/schema";

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  role: ClassRole;
  parentId?: string | null;
  kind?: "class" | "individual" | "service" | "event";
  status?: "available" | "running" | "completed" | "blocked";
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  evidential?: boolean;
  hierarchy?: boolean;
  active?: boolean;
};

const HOME: Camera3D = { yaw: -0.42, pitch: 0.3, zoom: 1 };
const LIVE_HOME: Camera3D = { yaw: 2.8, pitch: 0.5, zoom: 1.1 };
const ROLE_COLOR: Record<ClassRole, string> = {
  입력: "#1676C8", 산출: "#238B73", 제약: "#A67A23", 통제: "#7667B1",
};
const CONTROL = "grid h-8 min-w-8 place-items-center rounded-md border border-[var(--line)] bg-white px-2 text-xs text-[var(--muted)] outline-none hover:border-[var(--accent)] hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35";
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function OntologyGraph({
  nodes, edges, selectedId, onSelect, scope, ariaLabel, emptyLabel,
  living = false, motionScope,
}: {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scope: "local" | "global";
  ariaLabel: string;
  emptyLabel: string;
  living?: boolean;
  motionScope?: string;
}) {
  const graphRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const restoreFocus = useRef(false);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const home = living ? LIVE_HOME : HOME;
  const [camera, setCamera] = useState<Camera3D>(home);
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [dragging, setDragging] = useState(false);
  const hasNodes = nodes.length > 0;
  const isNarrow = size.width < 520;
  const activeId = hoverId ?? focusId ?? selectedId;
  const { positions, phase, settling } = useGraphMotion(nodes, edges, { living, enabled: motionEnabled, reducedMotion, paused: !!hoverId || !!focusId || dragging });
  const projected = useMemo(() => Object.fromEntries(nodes.map((node) => [
    node.id, projectPoint3D(positions[node.id] ?? { x: 0, y: 0, z: 0, degree: 0 }, camera, size.width, size.height),
  ])), [nodes, positions, camera, size]);
  const visibleEdges = useMemo(() => edges.filter((edge) =>
    positions[edge.source] && positions[edge.target]), [edges, positions]);
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) =>
    projected[a.id].depth - projected[b.id].depth), [nodes, projected]);
  const labels = useMemo(() => {
    const visible = new Set<string>();
    const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
    const candidates = [...nodes].filter((node) => node.id === selectedId || node.id === activeId || node.kind === "service")
      .sort((a, b) => Number(b.id === activeId || b.id === selectedId) - Number(a.id === activeId || a.id === selectedId));
    for (const node of candidates) {
      const point = projected[node.id];
      const text = node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label;
      const width = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 11 : 6), 12);
      const box = { left: point.x - width / 2, right: point.x + width / 2, top: point.y + 16, bottom: point.y + 38 };
      const required = node.id === selectedId || node.id === activeId;
      if (!required && (box.left < 4 || box.right > size.width - 4 || box.bottom > size.height - 42 || boxes.some((other) => box.left < other.right + 5 && box.right + 5 > other.left && box.top < other.bottom + 3 && box.bottom + 3 > other.top))) continue;
      visible.add(node.id); boxes.push(box);
    }
    return visible;
  }, [nodes, projected, selectedId, activeId, size]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      setSize((current) => current.width === bounds.width && current.height === bounds.height
        ? current : { width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasNodes, expanded]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(media.matches);
      if (media.matches) setRotating(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Camera rotation is opt-in and stops in hidden tabs.
  useEffect(() => {
    if (!rotating || reducedMotion || !hasNodes) return;
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      if (document.hidden) return;
      if (last && time - last >= 32) {
        const delta = Math.min(time - last, 80);
        setCamera((current) => ({ ...current, yaw: current.yaw + delta * 0.00012 }));
        last = time;
      } else if (!last) last = time;
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [rotating, reducedMotion, hasNodes]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      setCamera((current) => ({ ...current, zoom: clamp(current.zoom * Math.exp(-delta * 0.001), 0.5, 3) }));
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [hasNodes, size.height, expanded]);

  useLayoutEffect(() => {
    if (!expanded) {
      if (restoreFocus.current) expandRef.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
      return;
    }
    restoreFocus.current = true;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== graphRef.current)
      .map((element) => ({ element, inert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    expandRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach(({ element, inert }) => { element.inert = inert; });
    };
  }, [expanded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    for (const edge of visibleEdges) {
      const from = projected[edge.source];
      const to = projected[edge.target];
      const active = edge.source === activeId || edge.target === activeId;
      context.globalAlpha = active || edge.active ? 0.8 : clamp(0.45 + (from.depth + to.depth) * 0.08, 0.25, 0.65);
      context.strokeStyle = active || edge.active ? "#5386AD" : "#A2B2C3";
      context.lineWidth = active || edge.active ? 1.25 : 0.8;
      context.setLineDash(edge.evidential ? [3, 4] : []);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      if (edge.active && motionEnabled && !reducedMotion) {
        const travel = (phase * 0.35) % 1;
        context.globalAlpha = 0.9;
        context.fillStyle = "#1676C8";
        context.beginPath();
        context.arc(from.x + (to.x - from.x) * travel, from.y + (to.y - from.y) * travel, 2.5, 0, Math.PI * 2);
        context.fill();
      }
      if (active) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const x = to.x - Math.cos(angle) * 8;
        const y = to.y - Math.sin(angle) * 8;
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(x - Math.cos(angle - 0.5) * 4, y - Math.sin(angle - 0.5) * 4);
        context.lineTo(x, y);
        context.lineTo(x - Math.cos(angle + 0.5) * 4, y - Math.sin(angle + 0.5) * 4);
        context.stroke();
      }
    }
    context.setLineDash([]);
    for (const node of sortedNodes) {
      const point = projected[node.id];
      const selected = node.id === selectedId;
      const active = node.id === activeId;
      const radius = (node.kind === "service" ? 7 : 2.3 + Math.min(Math.sqrt(positions[node.id]?.degree ?? 0) * 0.65, 3.1)) * point.scale;
      context.globalAlpha = clamp(0.76 + point.depth * 0.25, 0.35, 1);
      context.fillStyle = ROLE_COLOR[node.role];
      context.beginPath();
      context.arc(point.x, point.y, selected || active ? Math.max(radius, 4.5) : radius, 0, Math.PI * 2);
      context.fill();
      if (node.kind === "service") {
        context.globalAlpha = 0.1;
        context.beginPath();
        context.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
        context.fill();
      }
      if (selected || active) {
        context.globalAlpha = selected ? 0.55 : 0.28;
        context.strokeStyle = ROLE_COLOR[node.role];
        context.lineWidth = 1;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(radius, 4.5) + 4, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }, [size, projected, sortedNodes, visibleEdges, positions, selectedId, activeId, expanded, phase, motionEnabled, reducedMotion]);

  const zoom = (factor: number) => setCamera((current) => ({ ...current, zoom: clamp(current.zoom * factor, 0.5, 3) }));
  const moveSelection = (currentId: string, amount: number) => {
    const currentIndex = nodes.findIndex((node) => node.id === currentId);
    const next = nodes[(currentIndex + amount + nodes.length) % nodes.length];
    onSelect(next.id);
    requestAnimationFrame(() => buttonRefs.current.get(next.id)?.focus({ preventScroll: true }));
  };
  const closeExpanded = () => {
    setExpanded(false);
  };

  if (!hasNodes) return (
    <div className="grid min-h-72 place-items-center bg-white px-6 text-center" data-testid="ontology-graph-empty">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 h-9 w-9 rounded-full border border-dashed border-[#747B84]" />
        <p className="text-sm font-semibold text-[var(--ink)]">표시할 그래프가 없습니다</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{emptyLabel}</p>
      </div>
    </div>
  );

  const graph = (
    <div
      ref={graphRef}
      role={expanded ? "dialog" : "group"}
      aria-modal={expanded || undefined}
      aria-label={ariaLabel}
      className={`${expanded ? "fixed inset-2 z-[80] rounded-xl border border-[var(--line)] shadow-2xl sm:inset-5" : "relative"} flex min-w-0 flex-col overflow-hidden bg-white text-[var(--ink)]`}
      data-testid="ontology-graph"
      data-graph-scope={scope}
      data-compact={isNarrow}
      data-expanded={expanded}
      data-camera={JSON.stringify(camera)}
      data-rotating={rotating && !reducedMotion}
      data-motion={living && motionEnabled && !reducedMotion}
      data-motion-scope={motionScope}
      data-settling={settling}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) { event.stopPropagation(); closeExpanded(); }
        if (event.key !== "Tab" || !expanded) return;
        const controls = Array.from(graphRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        const focusIndex = controls.findIndex((element) => element === document.activeElement);
        if (event.shiftKey && focusIndex <= 0) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (focusIndex < 0 || focusIndex === controls.length - 1)) { event.preventDefault(); first?.focus(); }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--ink)]">{living ? "서비스 연결" : "3D 관계 지도"}</span>
          <span className="text-[10px] text-[var(--muted)]">{scope === "global" ? "전체 연결" : "선택 주변"}</span>
        </div>
        <div className="flex items-center gap-1" aria-label="3D 그래프 시점 조절">
          {living && <button type="button" className={CONTROL} disabled={reducedMotion} aria-pressed={motionEnabled} onClick={() => setMotionEnabled((value) => !value)} aria-label={motionEnabled ? "자연스러운 움직임 멈추기" : "자연스러운 움직임 켜기"}>{motionEnabled ? "움직임 끄기" : "움직임 켜기"}</button>}
          <button type="button" className={CONTROL} onClick={() => zoom(1 / 1.2)} disabled={camera.zoom <= 0.5} aria-label="그래프 축소" title="축소 (−)">−</button>
          <button type="button" className={CONTROL} onClick={() => zoom(1.2)} disabled={camera.zoom >= 3} aria-label="그래프 확대" title="확대 (+)">+</button>
          <button type="button" className={CONTROL} onClick={() => { setCamera(home); setRotating(false); }} aria-label="시점 초기화" title="시점 초기화 (0)">↺</button>
          <button type="button" className={CONTROL} disabled={reducedMotion} aria-pressed={rotating} onClick={() => setRotating((value) => !value)} aria-label={rotating ? "회전 멈추기" : "자동 회전"} title={reducedMotion ? "기기의 동작 줄이기 설정 적용 중" : "천천히 자동 회전"}>{rotating ? "Ⅱ" : "▷"}</button>
          <button ref={expandRef} type="button" className={CONTROL} onClick={() => expanded ? closeExpanded() : setExpanded(true)} aria-label={expanded ? "작게 보기" : "그래프 크게 보기"} title={expanded ? "작게 보기 (Esc)" : "그래프 크게 보기"}>{expanded ? "닫기" : "⤢"}</button>
        </div>
      </div>

      <div
        ref={stageRef}
        tabIndex={0}
        aria-label="3D 네트워크 회전 영역. 방향키 회전, 더하기·빼기 확대 축소, 0 초기화. 다음 Tab으로 노드에 진입합니다."
        className={`relative min-h-0 touch-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${expanded ? "flex-1" : living ? "h-[440px] sm:h-[560px]" : "h-[420px] sm:h-[500px]"}`}
        style={{ cursor: "grab" }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          suppressClick.current = false;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          setRotating(false);
          setDragging(true);
          event.currentTarget.style.cursor = "grabbing";
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          if (!previous.moved && Math.hypot(dx, dy) < 4) return;
          previous.moved = true;
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setHoverId(null);
          setCamera((current) => ({ ...current, yaw: current.yaw + dx * 0.007, pitch: clamp(current.pitch + dy * 0.007, -1.45, 1.45) }));
          previous.x = event.clientX;
          previous.y = event.clientY;
        }}
        onPointerUp={(event) => {
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          event.currentTarget.style.cursor = "grab";
        }}
        onPointerCancel={(event) => {
          if (drag.current?.id === event.pointerId) drag.current = null;
          setDragging(false);
          event.currentTarget.style.cursor = "grab";
        }}
        onLostPointerCapture={(event) => {
          // Touch begins with implicit capture on the node. Its bubbling loss
          // must not cancel the drag when capture transfers to the stage.
          if (event.target === event.currentTarget && drag.current?.id === event.pointerId) {
            drag.current = null;
            setDragging(false);
            event.currentTarget.style.cursor = "grab";
          }
        }}
        onPointerLeave={() => setHoverId(null)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const step = 0.12;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            setCamera((current) => ({ ...current,
              yaw: current.yaw + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
              pitch: clamp(current.pitch + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), -1.45, 1.45),
            }));
          } else if (event.key === "+" || event.key === "=" || event.key === "-") { event.preventDefault(); zoom(event.key === "-" ? 1 / 1.2 : 1.2); }
          else if (event.key === "0") { event.preventDefault(); setCamera(home); setRotating(false); }
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
        {sortedNodes.map((node, index) => {
          const point = projected[node.id];
          const selected = node.id === selectedId;
          const showLabel = labels.has(node.id);
          return (
            <button
              key={node.id}
              ref={(element) => { if (element) buttonRefs.current.set(node.id, element); else buttonRefs.current.delete(node.id); }}
              type="button"
              aria-label={`${node.kind === "service" ? "서비스" : node.kind === "event" ? "실행 단계" : node.kind === "individual" ? "실행 개체" : "개념"} ${node.label} 선택`}
              aria-pressed={selected}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
              tabIndex={selected || (!selectedId && index === 0) ? 0 : -1}
              title={`${node.label} · ${node.role}\n${node.id}`}
              data-testid="ontology-graph-node"
              data-node-id={node.id}
              data-depth={point.depth.toFixed(4)}
              data-node-kind={node.kind ?? "class"}
              data-node-status={node.status}
              onClick={(event) => { if (event.detail === 0 || !suppressClick.current) onSelect(node.id); }}
              onPointerEnter={() => { if (!drag.current) setHoverId(node.id); }}
              onPointerLeave={() => setHoverId(null)}
              onFocus={() => { setFocusId(node.id); setRotating(false); }}
              onBlur={() => setFocusId(null)}
              onKeyDown={(event) => {
                if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
                  event.preventDefault(); event.stopPropagation();
                  const currentIndex = nodes.findIndex((item) => item.id === node.id);
                  const amount = event.key === "Home" ? -currentIndex : event.key === "End" ? nodes.length - 1 - currentIndex : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
                  moveSelection(node.id, amount);
                }
              }}
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              style={{ left: point.x, top: point.y, zIndex: index + 1 }}
            >
              {showLabel && (
                <span
                  aria-hidden
                  data-testid="ontology-graph-node-label"
                  className={`pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-white/95 px-1.5 py-1 leading-tight text-[var(--ink)] ${node.kind === "service" ? "text-[11px] font-semibold" : "border border-[var(--line)] text-[10px] font-medium shadow-sm"}`}
                >{node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}</span>
              )}
            </button>
          );
        })}
        <div aria-hidden className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/90 px-1 text-[10px] leading-relaxed text-[var(--muted)]">
          <span>{nodes.length} 노드 <span className="mx-1">/</span> {visibleEdges.length} 관계</span>
          <div>드래그 회전 · 휠 확대 · 노드 선택</div>
        </div>
        <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-[var(--muted)]">{Math.round(camera.zoom * 100)}%</span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2 text-[10px] text-[var(--muted)]">
        <div className="flex flex-wrap gap-3">{(Object.keys(ROLE_COLOR) as ClassRole[]).map((role) => (
          <span key={role} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_COLOR[role] }} />{role}</span>
        ))}</div>
        <span>{reducedMotion ? "동작 줄이기 적용" : living ? "큰 점: 서비스 · 작은 점: 실행에서 생성" : "점 크기 = 연결 수 · 앞뒤 깊이 = 원근"}</span>
      </div>
    </div>
  );
  // The app's animated content establishes a transformed containing block.
  // A body portal keeps expanded coordinates and hit targets in viewport space.
  return expanded ? createPortal(graph, document.body) : graph;
}
