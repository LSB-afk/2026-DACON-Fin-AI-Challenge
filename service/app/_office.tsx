"use client";

/** Accessible screen-aligned controls over one shared isometric office world. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as MapPointerEvent } from "react";
import { OFFICE_STATIONS, stationStatus, stationStep, type StepLike } from "@/lib/office";
import { agentStates, cityStats, currentStageLabel, customerJourney, docDest, documentTransfers, gateOpen, AGENT_ROLES, type ActorCtx } from "@/lib/officeActors";
import { BUILDINGS, STATION_SPOTS, HUB, COUNSELOR_SPOT, ARCHIVE_SPOT, QUEUE_SPOTS, buildingOf, type Building } from "@/lib/officeWorld";
import { project, unproject, roomAnchor, roomPolygon, PROJECTED_BOUNDS } from "@/lib/officeProjection";
import { OfficeCanvas, type Camera } from "./_officeCanvas";
import { officeBrief, OFFICE_TOUR, OFFICE_FLOW_GROUPS, OFFICE_VIEWS, type OfficeAction } from "@/lib/officeGuide";
import { useNarrow } from "./_ui";

export type OfficeCaseInfo = { id: string; badge: string; kind: string };
type Selection = { kind: "building" | "agent" | "customer" | "queue" | "document"; id: string };
type Point = { x: number; y: number };
type Positions = { customer?: Point | null; doc?: Point | null; docs?: Record<string, Point>; agents?: Record<string, Point> };
type Props = {
  steps: readonly StepLike[]; busy: boolean; hasResult: boolean; translateLive: boolean;
  approvedAt: string | null; applyCheckOk: boolean; runtime?: Partial<ActorCtx>;
  onStationClick?: (id: string) => void; caseInfo?: OfficeCaseInfo; queue?: OfficeCaseInfo[];
  onSelectCase?: (id: string) => void; onOpenPanel?: () => void;
  onNavigate?: (view: string, tab?: string) => void; focusRequest?: { id: string; n: number } | null; fill?: boolean;
};
const B = PROJECTED_BOUNDS;
const CENTER = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
const BUTTON = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-xs font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-40";
const LABEL: Record<string, string> = { idle: "대기", ready: "결과 대기", working: "작업 중", validating: "검토 중", waiting: "입력 보완", blocked: "차단", offline: "미연결", completed: "완료" };
const MARK: Record<string, string> = { idle: "○", ready: "◷", working: "●", validating: "◐", waiting: "!", blocked: "×", offline: "−", completed: "✓" };
const roleName = (id: string) => AGENT_ROLES.find((r) => r.id === id)?.name ?? id;
const stationName = (id: string) => OFFICE_STATIONS.find((s) => s.id === id)?.이름 ?? id;
const roomCenter = (b: Building) => project((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
function agentPoint(id: string) {
  const p = id === "counselor" ? COUNSELOR_SPOT : id === "records" ? ARCHIVE_SPOT : STATION_SPOTS[id];
  return p ? project(p.x + 0.5, p.y + 0.5, 1.4) : project(HUB.x, HUB.y);
}
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false,
  );
}

export function AgentOffice({ steps, busy, hasResult, translateLive, approvedAt, applyCheckOk, runtime, onStationClick, caseInfo, queue = [], onSelectCase, onOpenPanel, onNavigate, focusRequest, fill = false }: Props) {
  const narrow = useNarrow(1024);
  const reducedMotion = useReducedMotion();
  const ctx: ActorCtx = { ...runtime, busy, hasResult, translateLive, approvedAt, applyCheckOk };
  const statuses = Object.fromEntries(OFFICE_STATIONS.map((s) => [s.id, stationStatus(s.id, steps, ctx)]));
  const agents = agentStates(steps, ctx);
  const stateLabel = (id: string) => id === "translate" && (runtime?.translation?.status === "skipped" || runtime?.translation?.language === "ko") ? "생략 · 한국어 원문" : LABEL[agents[id]];
  const stats = cityStats(steps, ctx);
  const stage = currentStageLabel(steps, ctx, stationName);
  const docTarget = docDest(steps, ctx);
  const transfers = documentTransfers(steps, ctx);
  const activeIds = OFFICE_STATIONS.filter((s) => agents[s.id] === "working").map((s) => s.id);
  const activeKey = activeIds.join(",");
  const runKey = `${runtime?.runId ?? caseInfo?.id ?? "consultation"}:${runtime?.inputRevision ?? 0}`;
  const [selected, setSelected] = useState<Selection | null>(null);
  const [follow, setFollow] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [directory, setDirectory] = useState(false);
  const [ambientMotion, setAmbientMotion] = useState(true);
  const [showFlow, setShowFlow] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [preset, setPreset] = useState("all");
  const [size, setSize] = useState({ w: 1100, h: 700 });
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const container = useRef<HTMLDivElement>(null);
  const lastFocus = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; pan: Point; moved: boolean } | null>(null);
  const fit = Math.max(0.05, Math.min((size.w - (narrow ? 12 : 60)) / B.w, (size.h - (narrow ? 16 : 52)) / B.h));
  const scale = fit * view.zoom;
  const camera: Camera = { scale, tx: size.w / 2 - CENTER.x * scale + view.pan.x, ty: size.h / 2 - CENTER.y * scale + view.pan.y };
  const latest = useRef({ camera, fit, size, view });
  useEffect(() => { latest.current = { camera, fit, size, view }; });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(180, el.clientHeight) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [narrow]);

  function boundPan(pan: Point, zoom: number) {
    const v = latest.current;
    const x = Math.max(0, (B.w * v.fit * zoom - v.size.w) / 2) + v.size.w * 0.28;
    const y = Math.max(0, (B.h * v.fit * zoom - v.size.h) / 2) + v.size.h * 0.28;
    return { x: Math.max(-x, Math.min(x, pan.x)), y: Math.max(-y, Math.min(y, pan.y)) };
  }
  function focus(p: Point, zoom = 1.6) {
    const v = latest.current;
    setView({ zoom, pan: boundPan({ x: (CENTER.x - p.x) * v.fit * zoom, y: (CENTER.y - p.y) * v.fit * zoom }, zoom) });
  }
  function home() { setFollow(null); focus(project(HUB.x, HUB.y), 1.55); }
  function fitAll() { setFollow(null); setView({ zoom: 1, pan: { x: 0, y: 0 } }); }
  function showPreset(id: string) {
    setPreset(id); setFollow(null); setTourIndex(null); setSelected(null);
    const rooms = OFFICE_VIEWS.find((v) => v.id === id)?.rooms ?? [];
    const points = BUILDINGS.filter((b) => rooms.includes(b.id)).map(roomCenter);
    if (!points.length) { fitAll(); return; }
    focus({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length }, 1.7);
  }
  function tourTo(index: number) {
    const stop = OFFICE_TOUR[index], room = BUILDINGS.find((b) => b.id === stop?.room);
    if (!room) return;
    setTourIndex(index); setSelected(null); setDirectory(false); setFollow(null); setShowFlow(false);
    focus(roomCenter(room), 1.65);
  }
  function zoomAt(factor: number, at?: Point) {
    setFollow(null);
    const v = latest.current;
    const zoom = Math.max(0.8, Math.min(3.2, v.view.zoom * factor));
    const p = at ?? { x: v.size.w / 2, y: v.size.h / 2 };
    const wx = (p.x - v.camera.tx) / v.camera.scale, wy = (p.y - v.camera.ty) / v.camera.scale;
    const s = v.fit * zoom;
    setView({ zoom, pan: boundPan({ x: p.x - wx * s - (v.size.w / 2 - CENTER.x * s), y: p.y - wy * s - (v.size.h / 2 - CENTER.y * s) }, zoom) });
  }
  function focusCurrent() {
    setFollow(null);
    if (activeIds.length) {
      const ps = activeIds.map(agentPoint);
      focus({ x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length }, ps.length > 1 ? 1.3 : 1.8);
    } else if (hasResult) focus(agentPoint("counselor"));
    else home();
  }
  useEffect(() => {
    const el = container.current;
    if (!el || narrow) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-office-control]")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // Latest camera is read through a ref; the listener does not change during a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow]);
  useEffect(() => {
    if (!follow || narrow) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const canvas = container.current?.querySelector("canvas");
      let p: Positions;
      try { p = JSON.parse(canvas?.dataset.positions ?? "{}"); } catch { return; }
      const xy = follow === "customer" ? p.customer : follow === "doc" ? p.doc : follow.startsWith("doc:") ? p.docs?.[follow.slice(4)] : p.agents?.[follow];
      if (!xy) return;
      const v = latest.current, zoom = Math.max(1.5, v.view.zoom);
      const pan = boundPan({ x: (CENTER.x - xy.x) * v.fit * zoom, y: (CENTER.y - xy.y) * v.fit * zoom }, zoom);
      if (Math.hypot(pan.x - v.view.pan.x, pan.y - v.view.pan.y) > 0.5 || zoom !== v.view.zoom) setView({ zoom, pan });
    };
    const visibility = () => { clearInterval(timer); if (!document.hidden) { tick(); timer = setInterval(tick, 80); } };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [follow, narrow]);
  useEffect(() => {
    if (!focusRequest || focusRequest.n === lastFocus.current) return;
    lastFocus.current = focusRequest.n;
    const room = buildingOf(focusRequest.id);
    if (!room) return;
    const id = requestAnimationFrame(() => { setSelected({ kind: "building", id: room.id }); setFollow(null); focus(roomCenter(room)); });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.n, narrow]);
  useEffect(() => {
    const id = requestAnimationFrame(() => { setFollow(null); setSelected(null); });
    return () => cancelAnimationFrame(id);
  }, [runKey]);

  const selectedRoom = selected?.kind === "building" ? BUILDINGS.find((b) => b.id === selected.id) : undefined;
  function choose(s: Selection, move = false) {
    setSelected(s); setDirectory(false); setTourIndex(null);
    if (move) {
      setFollow(null);
      const room = s.kind === "building" ? BUILDINGS.find((b) => b.id === s.id) : null;
      let positions: Positions = {};
      try { positions = JSON.parse(container.current?.querySelector("canvas")?.dataset.positions ?? "{}"); } catch { /* Fallback before first paint. */ }
      focus(room ? roomCenter(room) : s.kind === "agent" ? positions.agents?.[s.id] ?? agentPoint(s.id) : project(HUB.x, HUB.y));
    }
  }
  function hitTest(x: number, y: number) {
    const v = latest.current;
    let p: Positions = {};
    try { p = JSON.parse(container.current?.querySelector("canvas")?.dataset.positions ?? "{}"); } catch { /* First frame uses room picking. */ }
    const distance = (pt: Point) => Math.hypot(pt.x * v.camera.scale + v.camera.tx - x, pt.y * v.camera.scale + v.camera.ty - 10 - y);
    const doc = Object.entries(p.docs ?? {}).find(([, point]) => distance(point) < 16);
    if (doc) { choose({ kind: "document", id: doc[0] }); return; }
    if (p.customer && distance(p.customer) < 22) { choose({ kind: "customer", id: caseInfo?.id ?? "current" }); return; }
    const a = Object.entries(p.agents ?? {}).find(([, xy]) => distance(xy) < 19);
    if (a) { choose({ kind: "agent", id: a[0] }); return; }
    const queued = queue.findIndex((_, i) => QUEUE_SPOTS[i] && distance(project(QUEUE_SPOTS[i].x, QUEUE_SPOTS[i].y)) < 18);
    if (queued >= 0) { choose({ kind: "queue", id: queue[queued].id }); return; }
    const w = unproject((x - v.camera.tx) / v.camera.scale, (y - v.camera.ty) / v.camera.scale);
    const room = BUILDINGS.find((b) => w.x >= b.x0 && w.x <= b.x1 + 1 && w.y >= b.y0 && w.y <= b.y1 + 1);
    setSelected(room ? { kind: "building", id: room.id } : null);
  }
  function pointerDown(e: MapPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-office-control]")) return;
    setFollow(null);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: latest.current.view.pan, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: MapPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) setView({ zoom: latest.current.view.zoom, pan: boundPan({ x: d.pan.x + dx, y: d.pan.y + dy }, latest.current.view.zoom) });
  }
  function pointerUp(e: MapPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) { const r = e.currentTarget.getBoundingClientRect(); hitTest(e.clientX - r.left, e.clientY - r.top); }
  }
  const labels = useMemo(() => {
    const taken: { x: number; y: number; w: number }[] = [];
    return [...BUILDINGS].sort((a, b) => Number(b.id === selectedRoom?.id) - Number(a.id === selectedRoom?.id) || Number(b.stations.some((s) => activeIds.includes(s))) - Number(a.stations.some((s) => activeIds.includes(s))) || Number(b.id === "bank") - Number(a.id === "bank") || Number(b.kind !== "support") - Number(a.kind !== "support")).flatMap((room) => {
      const active = room.stations.some((s) => activeIds.includes(s));
      if (room.kind === "support" && !showNames && view.zoom < 1.65 && selectedRoom?.id !== room.id) return [];
      const a = roomAnchor(room), p = { x: a.x * camera.scale + camera.tx, y: a.y * camera.scale + camera.ty };
      const w = Math.min(170, room.라벨.length * 12 + 22);
      if (p.x < -30 || p.x > size.w + 30 || p.y < 16 || p.y > size.h - 28) return [];
      if (taken.some((r) => Math.abs(r.x - p.x) < (r.w + w) / 2 + 4 && Math.abs(r.y - p.y) < (view.zoom >= 1.4 ? 44 : 28)) && !active && selectedRoom?.id !== room.id) return [];
      taken.push({ x: p.x, y: p.y, w });
      return [{ room, p, active }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.scale, camera.tx, camera.ty, size.w, size.h, showNames, view.zoom, selectedRoom?.id, activeKey]);

  const brief = officeBrief(steps, ctx);
  function performAction(action: OfficeAction, station?: string) {
    if (action === "current") { focusCurrent(); return; }
    if (action === "stage") { onStationClick?.(station ?? "input"); return; }
    if (action === "result") { onNavigate?.("monitor", "findings"); return; }
    if (action === "review") { onStationClick?.("counselor"); return; }
    if (action === "translate") { onStationClick?.("translate"); return; }
    if (onOpenPanel) onOpenPanel();
    else onStationClick?.("input");
  }
  const briefing = <section aria-label="현재 상담 안내" data-testid="office-brief" data-phase={brief.phase} className="shrink-0 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="min-w-0 flex-1 basis-[360px]">
        <div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-[.13em] text-[var(--accent-ink)]">지금 하는 일</span><span className="h-px w-6 bg-[var(--accent-tint-line)]"/><h3 className="text-sm font-bold tracking-tight">{brief.title}</h3></div>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{brief.reason}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted-soft)]"><span className="font-semibold">다음 안내</span> · {brief.next}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${BUTTON} border-[var(--accent)] text-[var(--accent-ink)]`} data-testid="office-next-action" onClick={() => performAction(brief.action.target, brief.action.station)}>{brief.action.label} <span aria-hidden>↗</span></button>
        <button className={BUTTON} onClick={() => { setShowFlow(!showFlow); setTourIndex(null); }} aria-expanded={showFlow}>업무 흐름</button>
        <button className={BUTTON} onClick={() => tourIndex === null ? tourTo(0) : setTourIndex(null)} aria-pressed={tourIndex !== null}>사무실 둘러보기</button>
      </div>
    </div>
  </section>;
  const flowPanel = showFlow && <section aria-label="상담 업무 의존 관계" data-testid="office-flow" className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
    <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-bold">공간 배치와 처리 순서는 달라요</p><button className="text-xs font-semibold text-[var(--muted)]" aria-label="업무 흐름 닫기" onClick={() => setShowFlow(false)}>닫기 ×</button></div>
    <div className={`grid gap-3 ${narrow ? "grid-cols-1" : "grid-cols-5"}`}>
      {OFFICE_FLOW_GROUPS.map((group) => <div key={group.label} className="min-w-0 border-l-2 border-[var(--accent-tint-line)] pl-2.5">
        <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--muted-soft)]">{group.label}{group.parallel ? " ∥" : group.optional ? " · 선택" : ""}</p>
        <div className="flex flex-wrap gap-1">{group.stations.map((id) => <button key={id} className={`rounded border px-1.5 py-1 text-[11px] ${agents[id] === "working" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)]"}`} onClick={() => { const room = id === "counselor" ? BUILDINGS.find((b) => b.id === "bank") : id === "records" ? BUILDINGS.find((b) => b.id === "archive2") : buildingOf(id); if (room) choose({ kind: "building", id: room.id }, true); }}>{id === "counselor" ? "상담사 승인" : id === "records" ? "적용 · 기록" : stationName(id)} <span className="opacity-80">{id === "translate" && runtime?.translation?.status === "skipped" ? "생략" : MARK[agents[id]]}</span></button>)}</div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">{group.note}</p>
      </div>)}
    </div>
    <p className="mt-2 text-[11px] text-[var(--muted)]">정보 부족 → 중앙 상담에서 보완 · 요청 실패 → 해당 부서에서 확인 · 단계 버튼을 누르면 담당 공간이 열립니다.</p>
  </section>;
  const tourStop = tourIndex === null ? null : OFFICE_TOUR[tourIndex];
  const tourPanel = tourStop && <section data-office-control role="region" aria-label="사무실 이용 가이드" data-testid="office-tour" className={`${narrow ? "my-3" : "absolute left-4 top-4 z-20 w-[290px] shadow-[var(--shadow-2)]"} rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4`}>
    <div className="flex items-center justify-between"><p className="text-[10px] font-bold tracking-widest text-[var(--accent-ink)]">OFFICE GUIDE · {tourIndex! + 1} / {OFFICE_TOUR.length}</p><button className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)]" aria-label="사무실 가이드 닫기" onClick={() => setTourIndex(null)}>×</button></div>
    <h3 className="mt-3 text-base font-bold tracking-tight">{tourStop.title}</h3><p className="mt-2 text-xs leading-[1.8] text-[var(--muted)]">{tourStop.body}</p>
    <p className="mt-3 border-t border-[var(--line-soft)] pt-3 text-[11px] font-semibold text-[var(--accent-ink)]">{tourStop.system}</p>
    <button className="mt-2 text-xs font-semibold underline underline-offset-4" onClick={() => { if (tourStop.station) onStationClick?.(tourStop.station); else onNavigate?.(tourStop.view); }}>관련 기능 열기 ↗</button>
    <div className="mt-4 flex items-center justify-between gap-2"><button className={BUTTON} disabled={tourIndex === 0} onClick={() => tourTo(tourIndex! - 1)}>이전</button><div className="flex gap-1">{OFFICE_TOUR.map((stop, index) => <button key={stop.room} className={`h-1.5 w-3 rounded-full ${index === tourIndex ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`} aria-label={`가이드 ${index + 1}: ${stop.title}`} aria-current={index === tourIndex ? "step" : undefined} onClick={() => tourTo(index)} />)}</div><button className={BUTTON} onClick={() => tourIndex === OFFICE_TOUR.length - 1 ? (setTourIndex(null), fitAll()) : tourTo(tourIndex! + 1)}>{tourIndex === OFFICE_TOUR.length - 1 ? "마치기" : "다음"}</button></div>
    <p className="mt-2 text-[10px] text-[var(--muted-soft)]">기능 안내입니다. AI 실행을 시작하지 않습니다.</p>
  </section>;
  const movementControl = <button data-testid="office-motion-toggle" aria-pressed={ambientMotion && !reducedMotion} disabled={reducedMotion} className="whitespace-nowrap rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] disabled:opacity-60" onClick={() => setAmbientMotion(!ambientMotion)}>{reducedMotion ? "동작 줄이기 적용 중" : ambientMotion ? "직원 움직임 켜짐" : "직원 움직임 꺼짐"}</button>;

  function stationDetail(id: string) {
    const s = OFFICE_STATIONS.find((s) => s.id === id), step = stationStep(id, steps, ctx);
    if (!s) return null;
    return <section key={id} className="space-y-2 border-t border-[var(--line-soft)] pt-3">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold">{s.이름}</h4><span className="text-xs text-[var(--accent-ink)]">{MARK[agents[id]]} {stateLabel(id)}</span></div>
      <p className="text-xs leading-relaxed text-[var(--muted)]">{s.하는일}</p>
      <p className="text-xs">{roleName(id)} · {s.행위자}{step?.ms !== undefined && ` · 요청 ${(step.ms / 1000).toFixed(1)}초`}</p>
      {step?.detail && <p className="rounded-md bg-[var(--surface)] p-2.5 text-xs leading-relaxed text-[var(--muted)]">{step.detail}</p>}
      <p className="text-xs text-[var(--muted-soft)]">{id === "routing" || id === "extract" ? "라우팅과 정보 추출의 결과가 모이면 판정 조건을 확인합니다." : s.실패하면}</p>
      <button className={BUTTON} onClick={() => onStationClick?.(id)}>진행 기록 보기</button>
    </section>;
  }
  const selectedTransfer = selected?.kind === "document" ? transfers.find((t) => t.to === selected.id) : undefined;
  const selectedName = selectedRoom?.라벨 ?? (selected?.kind === "document" ? "업무 전달 문서" : selected?.kind === "agent" ? roleName(selected.id) : selected?.kind === "queue" ? queue.find((q) => q.id === selected.id)?.badge : "상담 중 고객");
  const inspector = selected && <aside data-office-control role="region" aria-label={`${selectedName} 상세`} className={`${narrow ? "mt-3" : "absolute right-4 top-4 z-20 max-h-[calc(100%-2rem)] w-[310px] overflow-y-auto shadow-[var(--shadow-2)]"} rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4`}>
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted)]">{selectedRoom?.zone ?? (selected.kind === "agent" ? "담당자" : "고객 접점")}</p><h3 className="mt-1 text-base font-bold">{selectedName}</h3></div><button onClick={() => setSelected(null)} aria-label="공간 상세 닫기" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)]">×</button></div>
    {selectedRoom && <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">{selectedRoom.부제}</p>}
    {selectedRoom?.stations.map(stationDetail)}
    {selected.kind === "agent" && stationDetail(selected.id)}
    {(selectedRoom?.id === "bank" || selected.id === "counselor") && <div className="space-y-3 text-xs leading-relaxed"><p>{approvedAt ? `승인 완료 · ${approvedAt}` : applyCheckOk ? "추출값과 근거를 확인하고 승인해 주세요." : "필수 입력을 보완하면 검토할 수 있습니다."}</p><p className="text-[var(--muted)]">값을 수정하면 기존 승인이 해제됩니다. 승인과 결과 적용은 별개의 행동입니다.</p><button className={BUTTON} onClick={() => onStationClick?.("counselor")}>상담사 검토 열기</button></div>}
    {selected.id === "records" && <p className="text-xs leading-relaxed">{runtime?.recordStatus === "completed" ? "현재 승인값의 결과 적용 기록이 준비되었습니다." : "승인된 결과를 적용하면 기록이 완료됩니다."}</p>}
    {selectedRoom?.kind === "support" && <div className="space-y-3"><p className="text-xs leading-relaxed text-[var(--muted)]">{selectedRoom.view ? "관련 정보와 업무 화면을 확인할 수 있는 지원 공간입니다." : "직원이 함께 사용하는 지원 공간입니다."}</p>{selectedRoom.view && <button className={BUTTON} disabled={!onNavigate} onClick={() => onNavigate?.(selectedRoom.view!, selectedRoom.tab)}>관련 화면 열기</button>}</div>}
    {selectedRoom?.kind === "plaza" && <div className="space-y-3"><p className="text-xs leading-relaxed text-[var(--muted)]">상담은 이곳에서 시작합니다. 고객은 상담 공간에서 안내를 받고 업무 요청은 담당 부서로 전달됩니다.</p><button className={BUTTON} onClick={() => performAction("input")}>상담 입력 열기</button></div>}
    {selected.kind === "customer" && <div className="space-y-3 text-xs"><p>{caseInfo?.id} · {caseInfo?.badge ?? "현재 상담"}</p><p className="text-[var(--muted)]">{stage}</p><button className={BUTTON} onClick={() => performAction("input")}>상담 내용 확인</button></div>}
    {selected.kind === "queue" && <button className={BUTTON} onClick={() => { onSelectCase?.(selected.id); setSelected(null); }}>이 상담 열기</button>}
    {selected.kind === "document" && <div className="space-y-3 text-xs leading-relaxed"><p className="font-semibold">{selectedTransfer?.label ?? "이 업무의 전달이 끝났습니다."}</p>{selectedTransfer && <><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"><dt className="text-[var(--muted)]">보낸 부서</dt><dd>{stationName(selectedTransfer.from)}</dd><dt className="text-[var(--muted)]">받는 부서</dt><dd>{selectedTransfer.to === "counselor" ? "상담사 검토 · 승인실" : stationName(selectedTransfer.to)}</dd></dl><p className="text-[var(--muted)]">{selectedTransfer.to === "counselor" ? "처리 결과와 근거를 상담사가 확인합니다." : "실제 요청과 함께 전달된 업무입니다. 이동 애니메이션은 처리 시간을 나타내지 않습니다."}</p><button className={BUTTON} onClick={() => setFollow(follow === `doc:${selected.id}` ? null : `doc:${selected.id}`)}>{follow === `doc:${selected.id}` ? "문서 추적 해제" : "이 문서 따라가기"}</button></>}</div>}
    {(selected.kind === "agent" || selected.kind === "customer") && !narrow && <button className={`${BUTTON} mt-3 w-full`} aria-pressed={follow === (selected.kind === "customer" ? "customer" : selected.id)} onClick={() => setFollow(follow ? null : selected.kind === "customer" ? "customer" : selected.id)}>{follow ? "따라가기 해제" : "따라가기"}</button>}
  </aside>;

  const map = <div ref={container} data-testid="office-map" data-camera={JSON.stringify(camera)} tabIndex={narrow ? -1 : 0} aria-label="입체 사무실 지도. 방향키 이동, 더하기와 빼기 확대, Home 중앙 로비, 0 전체 보기" className={`relative isolate overflow-hidden bg-[var(--surface)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${narrow ? "h-[230px] rounded-lg border border-[var(--line)]" : "min-h-0 flex-1"}`} style={{ touchAction: narrow ? "pan-y" : "none" }} onPointerDown={narrow ? undefined : pointerDown} onPointerMove={narrow ? undefined : pointerMove} onPointerUp={narrow ? undefined : pointerUp} onPointerCancel={() => { drag.current = null; }} onKeyDown={(e) => {
    if ((e.target as HTMLElement).closest("[data-office-control]")) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0", "Home", "Escape"].includes(e.key)) e.preventDefault();
    if (e.key === "+" || e.key === "=") zoomAt(1.2);
    else if (e.key === "-") zoomAt(1 / 1.2);
    else if (e.key === "0") fitAll();
    else if (e.key === "Home") home();
    else if (e.key === "Escape") { setSelected(null); setDirectory(false); setFollow(null); setTourIndex(null); }
    else if (e.key.startsWith("Arrow")) { setFollow(null); const p = latest.current.view.pan; setView({ zoom: view.zoom, pan: boundPan({ x: p.x + (e.key === "ArrowLeft" ? 60 : e.key === "ArrowRight" ? -60 : 0), y: p.y + (e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0) }, view.zoom) }); }
  }}>
    <OfficeCanvas statuses={statuses} agents={agents} customer={{ state: customerJourney(steps, ctx), badge: caseInfo?.badge ?? "상담" }} queue={queue} docTarget={docTarget} docTargets={activeIds.length ? activeIds : docTarget ? [docTarget] : []} transfers={transfers} activeStation={activeIds[0] ?? null} gateOpen={gateOpen(ctx)} selectedBuilding={selectedRoom?.id ?? tourStop?.room ?? null} selectedAgent={selected?.kind === "agent" ? selected.id : null} camera={camera} cssSize={size} reducedMotion={reducedMotion} runKey={runKey} ambientMotion={ambientMotion && !reducedMotion} />
    {!narrow && labels.map(({ room, p, active }) => <button key={room.id} data-office-control data-room={room.id} onClick={() => choose({ kind: "building", id: room.id })} aria-label={`${room.라벨} 공간 보기`} aria-pressed={selectedRoom?.id === room.id} className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[12px] leading-tight shadow-[var(--shadow-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${active ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-white" : selectedRoom?.id === room.id || tourStop?.room === room.id ? "border-[var(--accent)] bg-[var(--accent-tint)] font-bold text-[var(--accent-ink)]" : "border-[var(--line)] bg-white/95 font-semibold text-[var(--ink)] hover:border-[var(--accent)]"}`} style={{ left: p.x, top: p.y }}>{active && <span aria-hidden className="mr-1">●</span>}{room.라벨}{view.zoom >= 1.4 && <span className={`mt-0.5 block text-[10px] font-normal ${active ? "text-white/90" : "text-[var(--muted)]"}`}>{room.부제}</span>}</button>)}
    {!narrow && <div data-office-control className="absolute bottom-4 left-4 z-10 flex items-end gap-3"><svg role="img" aria-label="사무실 미니맵" viewBox={`${B.x0} ${B.y0} ${B.w} ${B.h}`} width="152" height="86" className="rounded-lg border border-[var(--line)] bg-white/95 shadow-[var(--shadow-1)]">
      {BUILDINGS.map((room) => <polygon key={room.id} points={roomPolygon(room).map((p) => `${p.x},${p.y}`).join(" ")} fill={room.kind === "plaza" ? "var(--accent)" : room.kind === "core" ? "var(--accent-tint-line)" : "var(--line-soft)"} stroke="var(--line-strong)" strokeWidth="3" />)}
      <rect x={-camera.tx / scale} y={-camera.ty / scale} width={size.w / scale} height={size.h / scale} fill="none" stroke="var(--accent)" strokeWidth="12" pointerEvents="none" />
      <rect data-testid="office-minimap-target" role="button" aria-label="미니맵에서 중앙 로비로 이동" tabIndex={0} x={B.x0} y={B.y0} width={B.w} height={B.h} fill="transparent" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); home(); } }} onClick={(e) => { const svg = e.currentTarget.ownerSVGElement!; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM()!.inverse()); setFollow(null); focus(p, Math.max(1.5, view.zoom)); }} />
    </svg><span className="rounded-md border border-[var(--line)] bg-white/95 px-2.5 py-1.5 text-xs text-[var(--muted)]">{follow ? `${follow === "customer" ? "고객" : follow === "doc" || follow.startsWith("doc:") ? "업무 문서" : roleName(follow)} 따라가는 중` : "문서를 따라 부서의 업무가 이어집니다"}</span></div>}
    {!narrow && !hasResult && !busy && <button data-office-control className={`${BUTTON} absolute bottom-4 right-4 z-10 h-10 border-[var(--accent)] text-[var(--accent-ink)]`} onClick={onOpenPanel}>중앙 로비에서 상담 시작</button>}
    {!narrow && inspector}
    {!narrow && tourPanel}
    {directory && !narrow && <div data-office-control role="region" aria-label="사무실 공간 목록" className="absolute left-4 top-4 z-20 grid max-h-[calc(100%-8rem)] w-[300px] gap-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[var(--shadow-2)]"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">부서와 지원 공간</p><button className={BUTTON} onClick={() => setDirectory(false)} aria-label="공간 목록 닫기">×</button></div>{BUILDINGS.map((b) => <button key={b.id} className="rounded-md px-2 py-2 text-left text-xs hover:bg-[var(--accent-tint)]" onClick={() => choose({ kind: "building", id: b.id }, true)}>{b.라벨}<span className="mt-0.5 block text-[var(--muted-soft)]">{b.부제}</span></button>)}<p className="mt-2 text-xs font-bold">담당자</p>{AGENT_ROLES.map((a) => <button key={a.id} className="rounded-md px-2 py-2 text-left text-xs hover:bg-[var(--accent-tint)]" onClick={() => choose({ kind: "agent", id: a.id }, true)}>{a.name} · {stateLabel(a.id)}</button>)}{queue.slice(0, QUEUE_SPOTS.length).map((q) => <button key={q.id} className="rounded-md px-2 py-2 text-left text-xs hover:bg-[var(--accent-tint)]" onClick={() => choose({ kind: "queue", id: q.id })}>대기 상담 {q.id} · {q.badge}</button>)}</div>}
  </div>;

  if (narrow) return <div className="mt-4" data-testid="office-mobile"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-bold">중앙 사무실</p><span className="text-xs font-semibold text-[var(--accent-ink)]">진행 {stats.progressPct}% · 작업 중 {stats.running}</span></div>{map}<div className="mt-2 flex flex-wrap items-center justify-between gap-2">{movementControl}<span className="text-[10px] text-[var(--muted)]">직원 일상 동작 ≠ AI 처리</span></div>{briefing}{flowPanel}{tourPanel}<p role="status" className="my-3 text-xs leading-relaxed text-[var(--muted)]">{stage}</p><div className="mb-3 flex items-center gap-2"><label htmlFor="office-mobile-view" className="text-xs font-semibold">시점</label><select id="office-mobile-view" aria-label="사무실 시점" value={preset} onChange={(e) => showPreset(e.target.value)} className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-2 text-xs">{OFFICE_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select><button className={BUTTON} onClick={() => setDirectory(!directory)} aria-expanded={directory}>모든 부서</button></div>{directory && <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] p-2">{BUILDINGS.map((b) => <button key={b.id} onClick={() => choose({ kind: "building", id: b.id }, true)} className="rounded px-2 py-2 text-left text-xs hover:bg-[var(--surface)]">{b.라벨}<span className="mt-1 block text-[10px] text-[var(--muted)]">{b.부제}</span></button>)}</div>}<div className="grid grid-cols-2 gap-2">{OFFICE_STATIONS.map((s) => <button key={s.id} onClick={() => { const room = buildingOf(s.id); if (room) choose({ kind: "building", id: room.id }); }} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-left text-xs"><span className="block font-bold">{s.이름}</span><span className="mt-1 block text-[var(--muted)]">{MARK[agents[s.id]]} {stateLabel(s.id)}</span></button>)}</div>{inspector}</div>;

  return <div className={fill ? "flex h-full min-h-0 flex-col" : "mt-4 flex h-[min(78vh,950px)] min-h-[540px] flex-col rounded-xl border border-[var(--line)]"}>
    {briefing}
    {flowPanel}
    <div className="flex min-h-[56px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2"><div className="flex min-w-0 items-center gap-3"><div className="w-24 shrink-0"><div className="flex justify-between text-xs font-bold"><span>상담 진행</span><span data-testid="office-progress">{stats.progressPct}%</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--line-soft)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${stats.progressPct}%` }} /></div></div><span className="h-7 w-px bg-[var(--line)]" /><p role="status" data-testid="office-stage" className="max-w-[220px] truncate text-xs font-semibold text-[var(--ink)]">{stage}</p></div><div className="flex flex-wrap items-center gap-1.5"><select aria-label="사무실 시점" className={`${BUTTON} max-w-[135px]`} value={preset} onChange={(e) => showPreset(e.target.value)}>{OFFICE_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select><button className={BUTTON} onClick={() => { setDirectory(!directory); setTourIndex(null); }} aria-expanded={directory}>공간 찾기</button><button className={BUTTON} onClick={() => setShowNames(!showNames)} aria-pressed={showNames}>공간 이름</button><span className="mx-1 h-6 w-px bg-[var(--line)]" /><button className={`${BUTTON} w-9 px-0`} aria-label="사무실 축소" onClick={() => zoomAt(1 / 1.2)}>−</button><button className={`${BUTTON} w-9 px-0`} aria-label="사무실 확대" onClick={() => zoomAt(1.2)}>+</button><button className={BUTTON} onClick={fitAll}>전체 보기</button><button className={BUTTON} onClick={home}>중앙 로비</button><button className={BUTTON} onClick={focusCurrent} disabled={!busy && !hasResult}>현재 업무</button></div></div>
    {map}
    <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--panel)] py-2 pl-4 pr-24 text-xs text-[var(--muted)]"><div className="flex flex-wrap items-center gap-3"><span>● 작업 중 <strong data-testid="office-running">{stats.running}</strong></span><span>✓ 완료 {stats.done}/{stats.total}</span><span>◷ 대기 {stats.waiting}</span>{stats.needsReview && <button onClick={() => onStationClick?.("counselor")} className="font-bold text-[var(--warning-ink)]">! 검토 필요</button>}<span>{caseInfo?.id ?? "현재 상담"} · {caseInfo?.badge ?? "상담 접수"}</span></div><div className="flex flex-wrap items-center gap-2">{movementControl}<span className="text-[10px]" title="직원의 이동과 일상 동작은 사무실 표현이며 AI 요청이나 진행률을 바꾸지 않습니다.">일상 동작 ≠ AI 처리</span><select aria-label="업무 전달 문서 선택" value={selected?.kind === "document" ? selected.id : ""} disabled={!transfers.length} className="max-w-32 rounded border border-[var(--line)] bg-[var(--panel)] p-1 disabled:opacity-40" onChange={(e) => { if (e.target.value) choose({ kind: "document", id: e.target.value }); }}><option value="">전달 문서 보기</option>{transfers.map((t) => <option key={t.id} value={t.to}>{t.label}</option>)}</select><button disabled={!transfers.length} className="font-semibold text-[var(--accent-ink)] disabled:opacity-40" onClick={() => setFollow(follow === "doc" ? null : "doc")}>{follow === "doc" ? "문서 추적 해제" : "문서 따라가기"}</button></div></div>
  </div>;
}
