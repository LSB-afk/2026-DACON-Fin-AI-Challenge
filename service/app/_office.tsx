"use client";

/**
 * Fin:AI 운영 도시 — React 결합 · HTML 오버레이 · 접근성.
 *
 * 역할 분리:
 *   캔버스(_officeCanvas) — 도시·인물·문서의 픽셀 렌더 (한글 텍스트 없음)
 *   HTML 오버레이(여기)   — 선명한 구역 라벨 · 키보드 접근 버튼 · 컨텍스트 패널
 *   기존 타임라인         — 단계 상세·실패 이유 (클릭이 그리로 이동)
 *
 * 상태는 전부 steps·실행 컨텍스트에서 파생된다(officeActors) — 도시 전용
 * 가짜 상태 없음. 모바일(<1024px)은 칩 요약으로 강등되고 기능은 유지된다.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OFFICE_STATIONS, OFFICE_ROUTE, stationStatus, stationStep, type StepLike, type OfficeCtx } from "@/lib/office";
import {
  TILE, WORLD, STREET, BUILDINGS, ZONES, STATION_SPOTS, COUNSELOR_SPOT, ARCHIVE_SPOT, EXIT_GATE,
  buildingOf, type Building,
} from "@/lib/officeWorld";
import {
  agentStates, cityStats, currentStageLabel, customerJourney, docDest, gateOpen as gateOpenFn,
  AGENT_ROLES, type ActorCtx, type AgentState, type CustomerState,
} from "@/lib/officeActors";
import { OfficeCanvas, type Camera, type QueueCase } from "./_officeCanvas";
import { QUEUE_SPOTS, CUSTOMER_SPOTS } from "@/lib/officeWorld";
import { customerDest } from "@/lib/officeActors";
import { PATHS, Pill, useNarrow, navLabel, type ViewId } from "./_ui";

const 아이콘: Record<string, string> = {
  input: "quote", routing: "cpu", extract: "funnel", judge: "scale",
  guard: "shield", ontology: "ontology", narrate: "speech", translate: "translate",
};

/** 상태 → 표식·라벨. 어휘는 타임라인과 같다 */
const 상태표 = {
  완료: { mark: "✓", color: "var(--good)", label: "완료" },
  대기: { mark: "◐", color: "var(--accent)", label: "진행 중" },
  미연결: { mark: "◌", color: "var(--warning-ink)", label: "미연결" },
  중단: { mark: "−", color: "var(--warning-ink)", label: "중단" },
  차단: { mark: "✕", color: "var(--warning-ink)", label: "차단" },
} as const;

const 여정라벨: Record<CustomerState, string> = {
  queued: "대기열",
  consulting: "상담 접수 중",
  "waiting-for-processing": "처리 대기",
  "waiting-for-approval": "승인 대기",
  "receiving-result": "결과 수령",
  completed: "완료·퇴장",
  blocked: "입력 보완 필요",
};

/** 에이전트 상태 8종 — 글리프+낱말로 말한다 (색만으로 구분 금지) */
const 에이전트상태: Record<AgentState, { glyph: string; label: string }> = {
  idle: { glyph: "○", label: "대기 전" },
  ready: { glyph: "◔", label: "차례 대기" },
  working: { glyph: "●", label: "작업 중" },
  validating: { glyph: "◑", label: "검토 중" },
  waiting: { glyph: "−", label: "멈춤 (입력 대기)" },
  blocked: { glyph: "✕", label: "차단됨" },
  offline: { glyph: "◌", label: "미연결" },
  completed: { glyph: "✓", label: "작업 완료" },
};

/** FLOW 행위자 → 실제로 쓰는 도구 한 마디 (장식 문구가 아니라 계약의 요약) */
const 도구문구: Record<string, string> = {
  모델: "LLM · 증거 계약",
  코드: "결정적 규칙 코드",
  사람: "상담사 승인",
};

const 원문자 = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];

/** 사람 승인 구역 경계 — 큰길 아래 승인 창구 쪽 (타일) */
const 승인경계X = 65;

const MINI_W = 140;
const MINI_H = 79;

/**
 * 구역 안내판 자리 — ZONES.signX/signY는 캔버스 sign 소품의 타일이라 건물 위에 겹친다.
 * HTML 라벨은 빈 행(위 y=4 · 큰길 아래 y=25)으로 손수 내린다.
 */
const 안내판자리: Record<number, { left: number; top: number }> = {
  1: { left: 11 * TILE + 10, top: 25 * TILE },
  2: { left: 14 * TILE - 4, top: 4 * TILE + 1 },
  3: { left: 35 * TILE - 4, top: 4 * TILE + 1 },
  4: { left: 54 * TILE - 4, top: 4 * TILE + 1 },
  5: { left: 66 * TILE + 4, top: 25 * TILE },
};

const worldPxW = WORLD.w * TILE;
const worldPxH = WORLD.h * TILE;

const 역할이름 = (id: string) => AGENT_ROLES.find((r) => r.id === id)?.name ?? id;
const 스테이션이름 = (id: string) => OFFICE_STATIONS.find((s) => s.id === id)?.이름 ?? id;
const 타일건물 = (x: number, y: number): Building | undefined =>
  BUILDINGS.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/* ── 순수 표시 조각 — 상태를 만들지 않고 받은 값만 그린다 ── */

/** 구역 안내판 — ZONES 그대로. 구역 띠는 그리지 않는다(범위가 서로 겹친다) */
function ZoneSigns() {
  return (
    <>
      {ZONES.map((z) => (
        <span
          key={`${z.zone}-${z.no}`}
          className="pointer-events-none absolute whitespace-nowrap rounded bg-white/85 px-1 py-px text-[10px] font-bold text-[var(--muted)]"
          style={안내판자리[z.no] ?? { left: z.signX * TILE + 10, top: z.signY * TILE - 6 }}
        >
          {원문자[z.no]} {z.zone} 구역
        </span>
      ))}
    </>
  );
}

/** 자동 처리 ↔ 사람 승인 경계 — 이 도시의 가장 중요한 선 */
function ApprovalBoundary() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: 승인경계X * TILE,
          top: 25 * TILE,
          height: 15 * TILE,
          borderLeft: "2px dashed var(--violet)",
        }}
      />
      {/* 보도 행(y24) — 가로등(x66)과 승인 창구 문(x72) 사이. ⑤ 안내판과 겹치지 않는다 */}
      <span
        className="pointer-events-none absolute whitespace-nowrap rounded bg-[var(--violet-soft)] px-1.5 py-px text-[10px] font-bold text-[var(--violet-ink)]"
        style={{ left: 67 * TILE, top: 24 * TILE - 3 }}
      >
        사람 승인 구역 →
      </span>
    </>
  );
}

/** 미니맵 — 건물 배치와 현재 보고 있는 사각형. 클릭하면 그 자리로 간다 */
function MiniMap({
  camera, cssSize, onPick,
}: {
  camera: Camera;
  cssSize: { w: number; h: number };
  onPick: (wx: number, wy: number) => void;
}) {
  const K = MINI_W / worldPxW;
  const vx = Math.min(Math.max(0, -camera.tx / camera.scale), worldPxW);
  const vy = Math.min(Math.max(0, -camera.ty / camera.scale), worldPxH);
  const vw = Math.max(4, Math.min(worldPxW - vx, cssSize.w / camera.scale));
  const vh = Math.max(4, Math.min(worldPxH - vy, cssSize.h / camera.scale));
  return (
    <button
      type="button"
      data-nopan
      aria-label="미니맵 — 클릭한 위치로 이동"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick((e.clientX - r.left) / K, (e.clientY - r.top) / K);
      }}
      className="relative shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      style={{ width: MINI_W, height: MINI_H }}
    >
      <span
        aria-hidden
        className="absolute block bg-[var(--line-soft)]"
        style={{ left: 0, width: MINI_W, top: STREET.top * TILE * K, height: (STREET.bottom - STREET.top + 1) * TILE * K }}
      />
      {BUILDINGS.map((b) => (
        <span
          key={b.id}
          aria-hidden
          className="absolute block"
          style={{
            left: b.x0 * TILE * K,
            top: b.y0 * TILE * K,
            width: (b.x1 - b.x0 + 1) * TILE * K,
            height: (b.y1 - b.y0 + 1) * TILE * K,
            background: b.kind === "core" ? "var(--accent)" : b.kind === "support" ? "var(--line-strong)" : "var(--accent-tint)",
            opacity: b.kind === "core" ? 0.6 : 1,
          }}
        />
      ))}
      <span
        aria-hidden
        className="absolute block border-2 border-[var(--accent)]"
        style={{ left: vx * K, top: vy * K, width: vw * K, height: vh * K }}
      />
    </button>
  );
}

export type OfficeCaseInfo = { id: string; badge: string; kind: string };

/** 선택 대상 — 건물·에이전트·고객·게이트·승인 창구. 종류가 곧 패널 내용이다 */
type Sel = {
  kind: "building" | "agent" | "case" | "gate" | "counselor";
  id: string;
  caseId?: string;
  badge?: string;
  queuedIndex?: number;
};

export function AgentOffice({
  steps,
  busy,
  hasResult,
  translateLive,
  approvedAt,
  applyCheckOk,
  onStationClick,
  caseInfo,
  queue = [],
  onSelectCase,
  onOpenPanel,
  onNavigate,
  focusRequest,
  fill = false,
}: {
  steps: StepLike[];
  busy: boolean;
  hasResult: boolean;
  translateLive: boolean;
  approvedAt: string | null;
  applyCheckOk: boolean;
  onStationClick?: (id: string) => void;
  /** 활성 고객이 연결된 익명 케이스 */
  caseInfo?: OfficeCaseInfo;
  /** 대기열 — 실제 케이스 데이터 (선택 케이스 제외). 고객은 장식이 아니다 */
  queue?: QueueCase[];
  /** 대기 고객 클릭 → 그 상담을 연다 */
  onSelectCase?: (id: string) => void;
  /** 차단·보완 필요 시 운영 패널을 여는 길 */
  onOpenPanel?: () => void;
  /** 지원 시설 → 실제 화면 이동. 없으면 그 버튼은 비활성으로 그린다 */
  onNavigate?: (view: string, tab?: string) => void;
  /** 타임라인 → 지도 요청 — n이 바뀔 때마다 해당 건물을 선택·중앙 이동 */
  focusRequest?: { id: string; n: number } | null;
  /** true면 부모 높이를 가득 채운다 (전체 화면 도시 모드) */
  fill?: boolean;
}) {
  const narrow = useNarrow(1024);
  const reducedMotion = useReducedMotion();
  const ctx: OfficeCtx = { busy, hasResult, translateLive };
  const actorCtx: ActorCtx = { ...ctx, approvedAt, applyCheckOk };

  const statuses = useMemo(
    () => Object.fromEntries(OFFICE_STATIONS.map((st) => [st.id, stationStatus(st.id, steps, ctx)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, busy, hasResult, translateLive],
  );
  const agents = useMemo(
    () => agentStates(steps, actorCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, busy, hasResult, translateLive, approvedAt, applyCheckOk],
  );
  const stats = useMemo(
    () => cityStats(steps, actorCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, busy, hasResult, translateLive, approvedAt, applyCheckOk],
  );
  const journey = useMemo(
    () => customerJourney(steps, actorCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, busy, hasResult, translateLive, approvedAt, applyCheckOk],
  );
  const docTarget = useMemo(
    () => docDest(steps, actorCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, busy, hasResult, translateLive, approvedAt, applyCheckOk],
  );
  const gateOpen = gateOpenFn(actorCtx);
  const 승인문구 = approvedAt ? "승인 완료" : hasResult ? "승인 대기" : "대기 전";

  /* ── 카메라 — 전체 보기 기본. 휠·트랙패드·핀치 연속 줌 + 확대 시 드래그 팬 ── */
  const containerRef = useRef<HTMLDivElement>(null);
  const [cssSize, setCssSize] = useState({ w: 960, h: 540 });
  const [zoom, setZoom] = useState(1); // 1(전체)–2.5 연속
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      /* clientWidth/Height — border 제외. BCR로 재면 border 4px가 끼어 캔버스
         버퍼와 CSS 크기가 어긋나고, 그 비정수 배율이 전체를 미세하게 흐린다 */
      setCssSize({ w: Math.max(320, el.clientWidth), h: Math.max(240, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const worldW = worldPxW;
  const worldH = worldPxH;
  const fit = Math.min(cssSize.w / worldW, cssSize.h / worldH);
  const scale = fit * zoom;
  const camera: Camera = useMemo(() => {
    const baseTx = (cssSize.w - worldW * scale) / 2;
    const baseTy = (cssSize.h - worldH * scale) / 2;
    /* 확대 시 팬 허용 — 월드가 화면 밖으로 완전히 나가지 않게 클램프.
       리사이즈 시에도 같은 클램프가 현재 위치를 화면 안으로 되돌린다 */
    const clampPan = (v: number, room: number) => Math.min(Math.max(v, -room), room);
    const roomX = Math.max(0, (worldW * scale - cssSize.w) / 2 + 40);
    const roomY = Math.max(0, (worldH * scale - cssSize.h) / 2 + 40);
    return { scale, tx: baseTx + clampPan(pan.x, roomX), ty: baseTy + clampPan(pan.y, roomY) };
  }, [cssSize, scale, pan, worldW, worldH]);

  /* 이벤트 핸들러가 최신 카메라를 읽는 창구 — 렌더 중 ref 대입 금지라 effect에서 갱신 */
  const viewRef = useRef({ zoom, pan, fit, cssSize, camera });
  useEffect(() => {
    viewRef.current = { zoom, pan, fit, cssSize, camera };
  });

  /* 카메라 트윈 — rAF 타임스탬프만 사용(시계 금지), reduced-motion이면 즉시 전환 */
  const animRef = useRef<number | null>(null);
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);
  function animateView(toZoom: number, toPan: { x: number; y: number }) {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (reducedMotion) { setZoom(toZoom); setPan(toPan); return; }
    const from = { z: viewRef.current.zoom, x: viewRef.current.pan.x, y: viewRef.current.pan.y };
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / 240);
      const e = 1 - Math.pow(1 - p, 3);
      setZoom(from.z + (toZoom - from.z) * e);
      setPan({ x: from.x + (toPan.x - from.x) * e, y: from.y + (toPan.y - from.y) * e });
      animRef.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    animRef.current = requestAnimationFrame(tick);
  }

  /* ── 추적(follow) — 캔버스가 내보낸 실제 좌표를 읽어 중심을 맞춘다 ── */
  const [follow, setFollow] = useState<string | null>(null);
  const followName = follow === "customer" ? "고객" : follow === "doc" ? "문서" : follow ? 역할이름(follow) : "";

  /* 커서·핀치 중심의 월드 좌표를 고정한 채 배율만 바꾼다 */
  function zoomAt(cx: number, cy: number, factor: number) {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    const v = viewRef.current;
    const z = Math.min(2.5, Math.max(1, v.zoom * factor));
    if (z === v.zoom) return;
    if (z <= 1.0001) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    const s2 = v.fit * z;
    const wx = (cx - v.camera.tx) / v.camera.scale;
    const wy = (cy - v.camera.ty) / v.camera.scale;
    setZoom(z);
    setPan({
      x: cx - wx * s2 - (v.cssSize.w - worldW * s2) / 2,
      y: cy - wy * s2 - (v.cssSize.h - worldH * s2) / 2,
    });
  }

  /* 휠·트랙패드 줌 — React가 다는 passive 휠 리스너로는 preventDefault가 안 먹는다 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFollow(null);
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX - r.left - el.clientLeft, e.clientY - r.top - el.clientTop, Math.exp(-dy * 0.0016));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomAt은 ref만 읽는다
  }, []);

  function panTo(px: number, py: number, z: number) {
    const v = viewRef.current;
    const s = v.fit * z;
    return {
      x: v.cssSize.w / 2 - (px * s + (v.cssSize.w - worldW * s) / 2),
      y: v.cssSize.h / 2 - (py * s + (v.cssSize.h - worldH * s) / 2),
    };
  }

  function focusWorld(px: number, py: number, z: number) {
    animateView(z, panTo(px, py, z));
  }

  function focusStation(id: string | null, z = 1.5) {
    if (!id) return;
    const spot =
      STATION_SPOTS[id]
      ?? (id === "counselor"
        ? { x: COUNSELOR_SPOT.x, y: COUNSELOR_SPOT.y }
        : id === "gate"
          ? { x: EXIT_GATE.x, y: (EXIT_GATE.yTop + EXIT_GATE.yBottom) / 2 }
          : id === "records"
            ? { x: ARCHIVE_SPOT.x, y: ARCHIVE_SPOT.y }
            : null);
    if (!spot) return;
    focusWorld(spot.x * TILE, spot.y * TILE, z);
  }

  /* 추적 루프 — dataset.positions만 읽는다(가짜 좌표 생성 금지). 0.5px 미만은 건너뛴다 */
  useEffect(() => {
    if (!follow) return;
    let raf = 0;
    let lastRaw = "";
    let last = { x: Number.NaN, y: Number.NaN };
    const tick = () => {
      const raw = containerRef.current?.querySelector("canvas")?.dataset.positions;
      if (raw && raw !== lastRaw) {
        lastRaw = raw;
        try {
          const p = JSON.parse(raw) as {
            customer: [number, number] | null;
            doc: [number, number] | null;
            agents: Record<string, [number, number]>;
          };
          const pos = follow === "customer" ? p.customer : follow === "doc" ? p.doc : p.agents?.[follow] ?? null;
          if (pos) {
            const v = viewRef.current;
            const z = Math.max(v.zoom, 1.25);
            if (v.zoom < 1.25) setZoom(z);
            const next = panTo(pos[0], pos[1], z);
            if (!(Math.abs(next.x - last.x) < 0.5 && Math.abs(next.y - last.y) < 0.5)) {
              last = next;
              setPan(next);
            }
          }
        } catch {
          /* 캔버스가 아직 좌표를 내보내기 전 — 이번 프레임은 건너뛴다 */
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panTo는 ref만 읽는다
  }, [follow]);

  const activeStation = useMemo(() => {
    if (busy) return OFFICE_STATIONS.find((s) => statuses[s.id] === "대기")?.id ?? null;
    const bad = OFFICE_STATIONS.find((s) => statuses[s.id] === "차단" || statuses[s.id] === "중단");
    if (bad) return bad.id;
    if (hasResult && !approvedAt) return "counselor";
    return null;
  }, [statuses, busy, hasResult, approvedAt]);

  /* 지금 주목할 자리 — 진행 중 > 첫 비정상 > 승인 대기. 미니맵·단계 스트립·live region 공유 */
  const focusId = busy
    ? activeStation
    : OFFICE_STATIONS.find((s) => statuses[s.id] === "차단" || statuses[s.id] === "중단")?.id
      ?? (hasResult && !approvedAt ? "counselor" : null);
  const 승인상태: "완료" | "대기" | null = approvedAt ? "완료" : hasResult && applyCheckOk ? "대기" : null;

  /* ── 선택·팝오버 ── */
  const [selected, setSelected] = useState<Sel | null>(null);
  const isSel = (kind: Sel["kind"], id: string) => selected?.kind === kind && selected.id === id;
  useEffect(() => {
    if (!selected && !follow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSelected(null);
        setFollow(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected, follow]);

  /** 무언가를 새로 고르면 추적은 끊는다 — 따라가던 대상 자신이면 유지 */
  function selectTarget(next: Sel, cx: number, cy: number) {
    const same = selected?.kind === next.kind && selected.id === next.id;
    setSelected(same ? null : next);
    if (same) return;
    const key = next.kind === "agent" ? next.id : next.id === "case:active" ? "customer" : null;
    if (key !== follow) setFollow(null);
    focusWorld(cx, cy, Math.max(viewRef.current.zoom, 1.25));
  }

  /* 모바일 상세 bottom sheet — 카드 탭이 연다 */
  const [sheet, setSheet] = useState<string | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSheet(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheet]);

  /* ── 포인터 통합 — 드래그 팬(확대 시) · 두 손가락 핀치 · 빈 공간 클릭=선택 해제 ── */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const pinchRef = useRef<number | null>(null);

  function onMapPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-nopan]")) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragRef.current = null;
      return;
    }
    if (viewRef.current.zoom > 1.01) {
      dragRef.current = { sx: e.clientX, sy: e.clientY, px: viewRef.current.pan.x, py: viewRef.current.pan.y, moved: false };
    }
  }
  function onMapPointerMove(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const el = containerRef.current;
      if (!el) return;
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = el.getBoundingClientRect();
      setFollow(null);
      zoomAt((a.x + b.x) / 2 - r.left - el.clientLeft, (a.y + b.y) / 2 - r.top - el.clientTop, dist / pinchRef.current);
      pinchRef.current = dist;
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4 && !d.moved) {
      d.moved = true;
      setFollow(null); // 손으로 끌기 시작하면 추적은 사용자에게 넘긴다
    }
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
  }
  function onMapPointerEnd(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    /* 빈 공간 클릭(드래그 아님·버튼 아님) → 선택 해제 */
    if (e.type === "pointerup" && !moved && !(e.target as HTMLElement).closest("button")) {
      setSelected(null);
    }
  }

  /* 키보드 조작 — 컨테이너 자신이 초점을 가진 동안만. 내부 버튼의 키는 가로채지 않는다 */
  function onMapKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    const v = viewRef.current;
    const 걸음 = 40;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (v.zoom <= 1.01) return;
      e.preventDefault();
      setFollow(null);
      setPan({
        x: v.pan.x + (e.key === "ArrowLeft" ? 걸음 : e.key === "ArrowRight" ? -걸음 : 0),
        y: v.pan.y + (e.key === "ArrowUp" ? 걸음 : e.key === "ArrowDown" ? -걸음 : 0),
      });
      return;
    }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomAt(v.cssSize.w / 2, v.cssSize.h / 2, 1.25); return; }
    if (e.key === "-") { e.preventDefault(); setFollow(null); zoomAt(v.cssSize.w / 2, v.cssSize.h / 2, 1 / 1.25); return; }
    if (e.key === "0") { e.preventDefault(); setFollow(null); animateView(1, { x: 0, y: 0 }); return; }
    if (e.key === "Home") { e.preventDefault(); setFollow(null); focusStation(activeStation ?? focusId); }
  }

  /* 타임라인 → 지도: 운영 패널의 "지도에서 보기" 요청. n이 바뀔 때만 반응 */
  useEffect(() => {
    if (!focusRequest || narrow) return;
    const id = requestAnimationFrame(() => {
      const b = buildingOf(focusRequest.id);
      setSelected(
        b ? { kind: "building", id: b.id }
          : focusRequest.id === "gate" ? { kind: "gate", id: "gate" }
            : { kind: "counselor", id: "counselor" },
      );
      focusStation(focusRequest.id);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusStation은 ref만 읽는다
  }, [focusRequest?.n, narrow]);

  /* 모바일 미니맵 자동 센터링 — 포커스 단계가 바뀌면 그 카드가 화면 가운데로 */
  useEffect(() => {
    if (!narrow || !focusId) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(`mini-${focusId}`)?.scrollIntoView({ inline: "center", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [narrow, focusId]);

  /* 실행 경로 요약 — 하단 스트립(데스크톱)·미니맵(모바일)이 같은 재료를 쓴다 */
  const 스트립: { id: string; 이름: string; mark: { mark: string; color: string; label: string } | null }[] = [
    ...OFFICE_STATIONS.map((st) => ({
      id: st.id, 이름: st.이름,
      mark: statuses[st.id] ? 상태표[statuses[st.id]!] : null,
    })),
    { id: "counselor", 이름: "상담사 승인", mark: 승인상태 ? 상태표[승인상태] : null },
    { id: "gate", 이름: "결과 게이트", mark: gateOpen ? 상태표.완료 : null },
  ];

  /* 선택 대상의 표제 — 패널 머리글과 aria 라벨이 같은 이름을 쓴다 */
  function selName(s: Sel): string {
    if (s.kind === "building") return BUILDINGS.find((b) => b.id === s.id)?.라벨 ?? s.id;
    if (s.kind === "agent") return 역할이름(s.id);
    if (s.kind === "counselor") return "상담사 승인 창구";
    if (s.kind === "gate") return "결과 전달 게이트";
    return s.id === "case:active" ? `상담 중 고객 ${s.caseId}` : `대기 고객 ${s.caseId}`;
  }

  /* ── 상세 패널 본문 — 데스크톱 우측 패널과 모바일 bottom sheet가 같은 내용을 쓴다 ── */

  const 항목 = (라벨: string, 값: React.ReactNode) => (
    <p><span className="text-[var(--muted)]">{라벨}</span> {값}</p>
  );

  /** 핵심 건물 한 스테이션의 처리 카드 — 답변·번역센터처럼 둘을 담는 건물은 두 장 */
  function stationBlock(id: string) {
    const st = OFFICE_STATIONS.find((s) => s.id === id);
    if (!st) return null;
    const status = statuses[id];
    const mark = status ? 상태표[status] : null;
    const a = agents[id];
    const step = stationStep(id, steps);
    const idx = OFFICE_ROUTE.indexOf(id);
    const 다음 = idx >= 0 && idx < OFFICE_ROUTE.length - 1 ? 스테이션이름(OFFICE_ROUTE[idx + 1]) : "상담사 승인 창구";
    return (
      <div key={id} className="space-y-1 border-t border-[var(--line-soft)] pt-1.5 first:border-t-0 first:pt-0">
        <p className="font-semibold">{st.이름}</p>
        {항목("담당 역할", <>{st.행위자} · {도구문구[st.행위자] ?? "—"}</>)}
        {항목("현재 수행 작업", st.하는일)}
        {항목("담당 에이전트", (
          <>
            {역할이름(id)}
            {a && <> — <span className="font-semibold">{에이전트상태[a].glyph} {에이전트상태[a].label}</span></>}
            {a && (a === "working" || a === "ready") && caseInfo ? <> · 케이스 <span className="font-mono">{caseInfo.id}</span></> : null}
          </>
        ))}
        {항목("처리 상태", mark
          ? <span className="font-semibold" style={{ color: mark.color }}>{mark.mark} {mark.label}</span>
          : <span className="text-[var(--muted)]">아직 차례 아님</span>)}
        {step?.ms !== undefined && 항목("처리 시간", `${step.ms} ms`)}
        {step?.detail && (
          <>
            <p className="text-[var(--muted)]">입력·근거</p>
            <p className="rounded border border-[var(--line-soft)] bg-[var(--surface)] px-2 py-1.5 text-[var(--muted)]">
              <span className="font-mono font-bold text-[var(--accent)]">{step.n}</span> {step.detail}
            </p>
          </>
        )}
        {항목("다음 전달 대상", 다음)}
        <p className="text-[var(--muted-soft)]">실패하면: {st.실패하면}</p>
      </div>
    );
  }

  function counselorBody() {
    return (
      <>
        <p>
          <span className="font-semibold">사람</span>
          {" · "}
          {approvedAt ? (
            <span className="font-semibold" style={{ color: "var(--good)" }}>✓ 승인 완료 {approvedAt}</span>
          ) : hasResult && applyCheckOk ? (
            <span className="font-semibold" style={{ color: "var(--accent)" }}>◑ 검토 대기 (필수값 충족)</span>
          ) : hasResult ? (
            <span className="font-semibold" style={{ color: "var(--warning-ink)" }}>− 승인 불가 (필수값 부족)</span>
          ) : (
            <span className="text-[var(--muted)]">대기 전</span>
          )}
        </p>
        <p className="text-[var(--muted)]">사람이 추출값·근거를 확인하고 승인해야 결과 게이트가 열립니다. 값을 고치면 승인이 풀립니다.</p>
      </>
    );
  }

  function detailBody(t: Sel) {
    if (t.kind === "building") {
      const b = BUILDINGS.find((x) => x.id === t.id);
      if (!b) return null;
      if (b.kind === "plaza") {
        return (
          <div className="space-y-1.5 text-xs leading-relaxed">
            {항목("담당 역할", "고객 접점 — 상담 대기열")}
            {항목("대기 인원", `${queue.length}명`)}
            <p className="text-[var(--muted)]">한 번에 한 건만 처리합니다. 대기 고객을 누르면 그 상담을 엽니다.</p>
          </div>
        );
      }
      if (b.kind === "support") {
        return (
          <div className="space-y-1.5 text-xs leading-relaxed">
            {항목("담당 역할", b.부제)}
            <p className="text-[var(--muted)]">
              이 시설은 실제 화면 &lsquo;{b.view ? navLabel(b.view as ViewId) : b.라벨}&rsquo;으로 이어집니다.
            </p>
          </div>
        );
      }
      if (!b.stations.length) {
        /* 상담사 승인 창구 — 이 건물의 처리자는 사람이다 */
        return (
          <div className="space-y-1.5 text-xs leading-relaxed">
            {항목("담당 역할", `사람 · ${도구문구.사람}`)}
            {항목("현재 수행 작업", "추출값·근거 확인 후 승인")}
            {항목("담당 에이전트", (
              <>상담사 (사람) — <span className="font-semibold">{에이전트상태[agents.counselor].glyph} {에이전트상태[agents.counselor].label}</span></>
            ))}
            {counselorBody()}
            {항목("다음 전달 대상", "결과 전달 게이트")}
          </div>
        );
      }
      return <div className="space-y-1.5 text-xs leading-relaxed">{b.stations.map(stationBlock)}</div>;
    }

    if (t.kind === "agent") {
      const a = agents[t.id];
      const st = OFFICE_STATIONS.find((s) => s.id === t.id);
      const step = stationStep(t.id, steps);
      const spot = STATION_SPOTS[t.id] ?? (t.id === "counselor" ? COUNSELOR_SPOT : t.id === "records" ? ARCHIVE_SPOT : null);
      const b = spot ? 타일건물(spot.x, spot.y) : undefined;
      const 목표 = st?.하는일 ?? (t.id === "counselor" ? "추출값·근거 확인 후 승인" : "승인 기록 보관");
      const idx = OFFICE_ROUTE.indexOf(t.id);
      const 이전 = t.id === "counselor" ? "번역 에이전트" : t.id === "records" ? "상담사 (사람)" : idx > 0 ? 역할이름(OFFICE_ROUTE[idx - 1]) : null;
      const 다음 = t.id === "counselor" ? "기록 관리"
        : t.id === "records" ? null
          : idx >= 0 && idx < OFFICE_ROUTE.length - 1 ? 역할이름(OFFICE_ROUTE[idx + 1]) : "상담사 (사람)";
      const 검증 = st ? (statuses[t.id] ? 상태표[statuses[t.id]!].label : "아직 차례 아님") : 승인문구;
      const role = AGENT_ROLES.find((r) => r.id === t.id);
      return (
        <div className="space-y-1.5 text-xs leading-relaxed">
          {항목("역할", role?.role ?? "—")}
          {항목("현재 목표", 목표)}
          {항목("현재 위치", b?.라벨 ?? "—")}
          {항목("상태", a
            ? <span className="font-semibold">{에이전트상태[a].glyph} {에이전트상태[a].label}</span>
            : <span className="text-[var(--muted)]">대기 전</span>)}
          {step?.detail && (
            <>
              <p className="text-[var(--muted)]">최근 활동</p>
              <p className="rounded border border-[var(--line-soft)] bg-[var(--surface)] px-2 py-1.5 text-[var(--muted)]">
                <span className="font-mono font-bold text-[var(--accent)]">{step.n}</span> {step.detail}
              </p>
            </>
          )}
          {항목("협업", `${이전 ? `${이전} →` : ""} ${role?.name ?? t.id}${다음 ? ` → ${다음}` : ""}`.trim())}
          {항목("검증 상태", 검증)}
        </div>
      );
    }

    if (t.kind === "counselor") {
      return <div className="space-y-1.5 text-xs leading-relaxed">{counselorBody()}</div>;
    }

    if (t.kind === "gate") {
      return (
        <div className="space-y-1.5 text-xs leading-relaxed">
          <p>
            {gateOpen
              ? <span className="font-semibold" style={{ color: "var(--good)" }}>✓ 열림. 승인된 결과가 전달됩니다</span>
              : <span className="font-semibold" style={{ color: "var(--warning-ink)" }}>잠김 (상담사 승인 필요)</span>}
          </p>
          <p className="text-[var(--muted)]">승인된 결과만 이 게이트를 지나 고객에게 전달됩니다.</p>
        </div>
      );
    }

    const working = busy ? AGENT_ROLES.find((r) => agents[r.id] === "working") : null;
    return (
      <div className="space-y-1.5 text-xs leading-relaxed">
        <p>
          <span className="font-semibold">고객</span>
          {" · "}
          {t.id === "case:active" ? 여정라벨[journey] : `대기 ${t.queuedIndex}번째`}
          <span className="ml-1 font-mono">{t.caseId}</span>
        </p>
        <p className="text-[var(--muted)]">유형: {t.badge}</p>
        {t.id === "case:active" ? (
          <>
            {working && <p className="text-[var(--muted)]">지금 {working.name}이 이 케이스를 처리하고 있습니다.</p>}
            <p className="text-[var(--muted)]">승인 상태: {approvedAt ? `승인 완료 ${approvedAt}` : "승인 전 (게이트 잠김)"}</p>
            <p className="text-[var(--muted-soft)]">개인정보는 표시하지 않습니다.</p>
          </>
        ) : (
          <p className="text-[var(--muted)]">한 번에 한 건만 처리합니다. 차례가 오면 접수로 이동합니다.</p>
        )}
      </div>
    );
  }

  /* 스크린리더 안내 — 숫자 나열이 아니라 문맥이 있는 한 문장 */
  const liveMsg = (() => {
    if (busy) {
      const 진행 = ` 전체 ${stats.progressPct}% 진행.`;
      if (!activeStation) return `케이스를 접수하고 있습니다.${진행}`;
      const st = OFFICE_STATIONS.find((s) => s.id === activeStation);
      const role = AGENT_ROLES.find((r) => r.id === activeStation);
      return st
        ? `${st.이름} 진행 중입니다. ${role?.name ?? "담당 에이전트"}가 처리하고 있습니다.${진행}`
        : `진행 중입니다.${진행}`;
    }
    if (!hasResult) return "대기 중입니다. 상담 입력에서 실행을 시작하세요.";
    if (approvedAt) return "승인이 끝났습니다. 결과 게이트가 열려 고객에게 전달됩니다.";
    if (focusId && focusId !== "counselor") {
      const st = OFFICE_STATIONS.find((s) => s.id === focusId);
      const step = stationStep(focusId, steps);
      return `${st?.이름 ?? focusId}에서 멈췄습니다. ${step?.detail ?? st?.실패하면 ?? "이유는 진행 단계에서 확인하세요."}`;
    }
    return "모든 자동 단계가 끝났습니다. 상담사가 확인하면 고객에게 전달됩니다.";
  })();

  /* ── 모바일 — 현재 단계 중심 가로 스와이프 미니맵 (도시를 억지로 축소하지 않는다) ── */
  if (narrow) {
    const 카드들 = 스트립.map((it) => ({
      ...it,
      icon: it.id === "counselor" ? "approval" : it.id === "gate" ? "lock" : 아이콘[it.id],
      sub:
        it.id === "counselor"
          ? approvedAt ? "승인 완료" : hasResult ? "승인 대기" : "대기 전"
          : it.id === "gate"
            ? gateOpen ? "열림" : "잠김 (승인 필요)"
            : it.mark?.label ?? "대기 전",
    }));
    const sheetCard = sheet ? 카드들.find((x) => x.id === sheet) : null;
    return (
      <div className="mt-4">
        {/* 진행 한 줄 — 좁은 화면에서도 전체 그림은 잃지 않는다 */}
        <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-2xs font-bold text-[var(--muted)]">
          <span>진행 {stats.progressPct}%</span>
          <span>· 활성 {stats.activeAgents}</span>
          <span>· 완료 {stats.done}/{stats.total}</span>
          {stats.blocked > 0 && (
            <span className="rounded bg-[var(--warning-soft)] px-1 text-[var(--warning-ink)]">! 검토 필요 {stats.blocked}</span>
          )}
        </p>
        <div id="office-minimap" className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2">
          {카드들.map((c) => {
            const focused = c.id === focusId;
            return (
              <button
                key={c.id}
                id={`mini-${c.id}`}
                onClick={() => setSheet(c.id)}
                aria-expanded={sheet === c.id}
                className={`min-w-[8.5rem] shrink-0 snap-center rounded-xl border-2 px-3 py-2.5 text-left ${focused ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-[var(--line)] bg-[var(--panel)]"}`}
              >
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden>
                    <path d={PATHS[c.icon]} />
                  </svg>
                  <span className="truncate text-xs font-bold">{c.이름}</span>
                  {c.mark && <span aria-hidden className="ml-auto text-sm font-bold" style={{ color: c.mark.color }}>{c.mark.mark}</span>}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-[var(--muted)]">{c.sub}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-2xs text-[var(--muted-soft)]">
          좌우로 넘겨 전체 흐름을 봅니다 — 카드를 누르면 그 단계의 상세가 열립니다.
        </p>
        <p role="status" className="sr-only">{liveMsg}</p>

        {/* 단계 상세 bottom sheet — 배경 탭·ESC·✕로 닫는다 */}
        {sheetCard && (
          <>
            <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setSheet(null)} aria-hidden />
            <div
              role="dialog"
              aria-label={`${sheetCard.이름} 상세`}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border-2 border-b-0 border-[var(--line-strong)] bg-[var(--panel)] p-4 shadow-[var(--shadow-2)]"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{sheetCard.이름}</p>
                <button onClick={() => setSheet(null)} aria-label="닫기" className="grid h-11 w-11 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)]">✕</button>
              </div>
              <div className="mt-2">
                {detailBody(
                  sheetCard.id === "counselor"
                    ? { kind: "counselor", id: "counselor" }
                    : sheetCard.id === "gate"
                      ? { kind: "gate", id: "gate" }
                      : { kind: "building", id: buildingOf(sheetCard.id)?.id ?? sheetCard.id },
                )}
              </div>
              <button
                onClick={() => { setSheet(null); onStationClick?.(sheetCard.id); }}
                className="mt-3 w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-bold text-white motion-press"
              >
                타임라인에서 자세히 보기 ▶
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── 데스크톱 — 전체 도시 + 카메라 변환을 공유하는 HTML 라벨 레이어 ── */
  type ClickTarget = {
    sel: Sel;
    x: number; y: number; w: number; h: number;
    label: string;
    title: string;
  };

  const 활성고객타일 = (() => {
    const d = customerDest(journey);
    if (d === "plaza") return QUEUE_SPOTS[0];
    return (CUSTOMER_SPOTS as Record<string, { x: number; y: number }>)[d] ?? CUSTOMER_SPOTS.consulting;
  })();

  /** 건물 상태 한 마디 — 핵심은 스테이션 상태, 승인 창구는 승인 상태, 지원은 부제 */
  function 건물상태문(b: Building): string {
    if (b.kind === "plaza") return `대기 ${queue.length}명`;
    if (b.kind === "support") return `지원 시설 — ${b.부제}`;
    if (b.stations.length) {
      const s = statuses[b.stations[0]];
      return s ? 상태표[s].label : "아직 차례 아님";
    }
    return 승인문구;
  }

  /* 건물 — footprint 전체가 클릭 대상. z가 낮아 에이전트 버튼이 위에 온다 */
  const 건물타깃: ClickTarget[] = BUILDINGS.map((b) => ({
    sel: { kind: "building", id: b.id },
    x: b.x0 * TILE, y: b.y0 * TILE,
    w: (b.x1 - b.x0 + 1) * TILE, h: (b.y1 - b.y0 + 1) * TILE,
    label: `${b.라벨}: ${건물상태문(b)}`,
    title: `${b.라벨} — ${b.부제}`,
  }));

  /* 에이전트 — STATION_SPOTS + 상담사 + 기록 관리 */
  const 에이전트타깃: ClickTarget[] = [
    ...OFFICE_STATIONS.map((st) => ({ id: st.id, spot: STATION_SPOTS[st.id] })),
    { id: "counselor", spot: { x: COUNSELOR_SPOT.x, y: COUNSELOR_SPOT.y } },
    { id: "records", spot: { x: ARCHIVE_SPOT.x, y: ARCHIVE_SPOT.y } },
  ].map(({ id, spot }) => {
    const a = agents[id];
    const 이름 = 역할이름(id);
    return {
      sel: { kind: "agent" as const, id },
      x: spot.x * TILE - 24, y: spot.y * TILE - 32, w: 48, h: 52,
      label: `${이름}: ${a ? 에이전트상태[a].label : "대기 전"}`,
      title: `${이름} — ${a ? 에이전트상태[a].label : "대기 전"}`,
    };
  });

  const 기타타깃: ClickTarget[] = [
    {
      sel: { kind: "gate", id: "gate" },
      x: EXIT_GATE.x * TILE - 20, y: EXIT_GATE.yTop * TILE - 16, w: 36, h: 100,
      label: `결과 전달 게이트: ${gateOpen ? "열림" : "잠김 (승인 필요)"}`,
      title: `결과 전달 게이트 — ${gateOpen ? "열림" : "잠김"}`,
    },
    /* 고객 = 케이스의 시각 표현. 대기열은 실제 큐 데이터, 활성 고객은 선택 케이스 */
    ...queue.slice(0, QUEUE_SPOTS.length).map((c, i) => ({
      sel: { kind: "case" as const, id: `case:${c.id}`, caseId: c.id, badge: c.badge, queuedIndex: i + 1 },
      x: QUEUE_SPOTS[i].x * TILE - 12, y: QUEUE_SPOTS[i].y * TILE - 26, w: 26, h: 34,
      label: `대기 고객 ${c.id}: 대기 ${i + 1}번째`,
      title: `대기 고객 ${c.id} — ${c.badge}`,
    })),
    ...(caseInfo
      ? [{
          sel: { kind: "case" as const, id: "case:active", caseId: caseInfo.id, badge: caseInfo.badge },
          x: 활성고객타일.x * TILE - 12, y: 활성고객타일.y * TILE - 26, w: 26, h: 34,
          label: `상담 중 고객 ${caseInfo.id}: ${여정라벨[journey]}`,
          title: `상담 중 고객 ${caseInfo.id} — ${여정라벨[journey]}`,
        }]
      : []),
  ];

  /* 지금 단계 큰 라벨 — 하나만 크게 (가독성 우선순위) */
  const 강조 = (() => {
    /* 승인이 끝났으면 사람이 이미 해결한 것 — 남은 중단 표시로 되돌아가지 않는다 */
    if (approvedAt) {
      return {
        text: "승인 완료 — 결과 전달 중",
        warn: false,
        x: COUNSELOR_SPOT.x * TILE - 150,
        y: (COUNSELOR_SPOT.y - 3) * TILE,
      };
    }
    const id = busy
      ? activeStation
      : OFFICE_STATIONS.find((s) => statuses[s.id] === "차단" || statuses[s.id] === "중단")?.id ?? null;
    if (!id) {
      /* 처리 끝·승인 전 — 승인 창구가 지금의 주인공이다 */
      if (hasResult && !busy && !approvedAt) {
        return {
          text: applyCheckOk ? "상담사 확인 후 고객에게 전달됩니다" : "입력 보완 후 승인할 수 있습니다",
          warn: !applyCheckOk,
          x: COUNSELOR_SPOT.x * TILE - 150,
          y: (COUNSELOR_SPOT.y - 3) * TILE,
        };
      }
      return null;
    }
    const st = statuses[id];
    const spot = STATION_SPOTS[id];
    const b = BUILDINGS.find((bb) => bb.id === spot.buildingId)!;
    const 이름 = OFFICE_STATIONS.find((s) => s.id === id)!.이름;
    return {
      text: busy ? `${이름} 진행 중` : st === "차단" ? `${이름} 차단` : `${이름}: 입력 보완 필요`,
      warn: !busy,
      x: b.doorX * TILE - 52,
      y: b.side === "top" ? (b.y1 + 1) * TILE + 20 : b.y0 * TILE - 34,
    };
  })();

  /* HUD 현재 단계 — 상단 상태 바와 같은 문장에서 온다(둘이 어긋날 수 없게) */
  const 현재단계 = currentStageLabel(steps, actorCtx, 스테이션이름);

  const 칩 = "inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-px";
  const 선택건물 = selected?.kind === "building" ? selected.id : null;
  const 추적가능 = selected?.kind === "agent" && agents[selected.id] === "working";

  return (
    <div className={fill ? "flex h-full min-h-0 flex-col" : "mt-4"}>
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-label="Fin:AI 운영 도시 지도 — 방향키 이동, +/- 확대·축소, 0 전체 보기, Home 현재 단계"
        onKeyDown={onMapKeyDown}
        className={`relative overflow-hidden border-2 border-[var(--line-strong)] bg-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${fill ? "min-h-0 flex-1" : "aspect-video"}`}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerEnd}
        onPointerCancel={onMapPointerEnd}
        onPointerLeave={onMapPointerEnd}
        style={{ cursor: zoom > 1.01 ? "grab" : "default", touchAction: "none" }}
      >
        <OfficeCanvas
          statuses={statuses}
          agents={agents}
          customer={caseInfo ? { state: journey, badge: caseInfo.badge } : null}
          queue={queue}
          docTarget={docTarget}
          activeStation={busy ? activeStation : null}
          gateOpen={gateOpen}
          selectedBuilding={선택건물}
          selectedAgent={selected?.kind === "agent" ? selected.id : null}
          camera={camera}
          cssSize={cssSize}
          reducedMotion={reducedMotion}
        />

        {/* 카메라 변환을 공유하는 라벨·버튼 레이어 — 한글은 여기서만 (항상 선명) */}
        <div
          aria-hidden={false}
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: worldW,
            height: worldH,
            transform: `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <ZoneSigns />
          <ApprovalBoundary />

          {/*
           * 건물 이름표 — 캔버스가 그린 간판 자리 위에 앉는다.
           * 핵심 건물은 뒷벽 간판(y0+6), 지원 시설은 벽 아래 바닥 명패(y0+wallH+4).
           * 지원 시설 명패는 폭이 좁아 두 줄 줄바꿈을 허용한다 — 자르면 이름을 잃는다.
           */}
          {BUILDINGS.map((b) => {
            const w = (b.x1 - b.x0 + 1) * TILE;
            const 선택됨 = 선택건물 === b.id;
            const 테두리 = 선택됨 ? "1px solid var(--accent)" : undefined;
            if (b.kind === "plaza") {
              return (
                <div key={b.id} className="absolute flex flex-col items-start gap-0.5" style={{ left: b.x0 * TILE + 8, top: b.y0 * TILE + 4, maxWidth: w - 16 }}>
                  <p className="max-w-full truncate rounded bg-white/90 px-1.5 py-0.5 text-[13px] font-bold leading-tight text-[#0F2A4C] shadow-sm" style={{ border: 테두리 }}>{b.라벨}</p>
                  {camera.scale >= 0.8 && (
                    <p className="max-w-full truncate rounded bg-white/80 px-1.5 py-0.5 text-[11px] leading-tight text-[#3E5878]">{b.부제}</p>
                  )}
                </div>
              );
            }
            if (b.kind === "support") {
              return (
                <div key={b.id} className="absolute flex flex-col items-start gap-0.5" style={{ left: b.x0 * TILE + 6, top: b.y0 * TILE + b.wallH + 4, maxWidth: w - 12 }}>
                  <p className="max-w-full rounded bg-white/90 px-1 py-0.5 text-[11px] font-bold text-[#0F2A4C] shadow-sm" style={{ lineHeight: 1.15, border: 테두리 }}>{b.라벨}</p>
                  {camera.scale >= 1.4 && (
                    <p className="max-w-full rounded bg-white/80 px-1 py-0.5 text-[10px] text-[#3E5878]" style={{ lineHeight: 1.15 }}>{b.부제}</p>
                  )}
                </div>
              );
            }
            return (
              <div key={b.id} className="absolute flex flex-col items-start gap-0.5" style={{ left: b.x0 * TILE + 8, top: b.y0 * TILE + 6, maxWidth: Math.min(w - 16, 176) }}>
                <p className="max-w-full truncate rounded bg-white/90 px-1.5 py-0.5 text-[13px] font-bold leading-tight text-[#0F2A4C] shadow-sm" style={{ border: 테두리 }}>{b.라벨}</p>
                {camera.scale >= 0.8 && (
                  <p className="max-w-full truncate rounded bg-white/80 px-1.5 py-0.5 text-[11px] leading-tight text-[#3E5878]">{b.부제}</p>
                )}
              </div>
            );
          })}

          {/* 게이트 라벨 + 승인 필요 고지 */}
          <p className="absolute text-[9px] font-bold text-[#5B7594]" style={{ left: (EXIT_GATE.x - 4) * TILE, top: (EXIT_GATE.yBottom + 2) * TILE }}>
            결과 게이트 {gateOpen ? "열림" : "잠김"}
          </p>
          {!gateOpen && hasResult && !busy && (
            <span
              className="absolute whitespace-nowrap rounded border border-[var(--warning)] bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--warning-ink)]"
              style={{ left: (EXIT_GATE.x - 6) * TILE, top: (EXIT_GATE.yTop - 2) * TILE }}
            >
              승인 필요 — 잠김
            </span>
          )}
          {/* 현재 단계 라벨 — 딱 하나만 크게 */}
          {강조 && (
            <span
              className={`absolute whitespace-nowrap rounded-md border-2 px-2 py-1 text-[13px] font-bold shadow-sm ${강조.warn ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "border-[var(--accent)] bg-white text-[var(--accent)]"}`}
              style={{ left: 강조.x, top: 강조.y }}
            >
              {강조.text}
            </span>
          )}

          {/* 키보드 접근 대상 — 투명 버튼 (Enter/Space 기본동작). 건물이 아래, 사람이 위 */}
          {[...건물타깃.map((t) => ({ t, z: 1 })), ...에이전트타깃.map((t) => ({ t, z: 2 })), ...기타타깃.map((t) => ({ t, z: 2 }))].map(({ t, z }) => {
            const on = isSel(t.sel.kind, t.sel.id);
            return (
              <button
                key={`${t.sel.kind}:${t.sel.id}`}
                onClick={() => selectTarget(t.sel, t.x + t.w / 2, t.y + t.h / 2)}
                aria-label={t.label}
                aria-pressed={on}
                title={t.title}
                className="pointer-events-auto absolute rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                style={{
                  left: t.x, top: t.y, width: t.w, height: t.h, zIndex: z,
                  background: "transparent",
                  outlineOffset: 2,
                  border: on ? "2px solid #1687F8" : "2px solid transparent",
                }}
              />
            );
          })}
        </div>

        {/* 처리 현황 HUD — cityStats의 순수 표시. 색만으로 구분하지 않는다(글리프+낱말) */}
        <div
          role="group"
          aria-label="처리 현황"
          data-nopan
          className="absolute left-2 top-2 z-10 max-w-[60%] rounded-lg border border-[var(--line)] bg-[var(--panel)]/95 px-2 py-1.5"
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="block h-[3px] w-24 overflow-hidden rounded-full bg-[var(--line-soft)]">
              <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${stats.progressPct}%` }} />
            </span>
            <span className="text-2xs font-bold text-[var(--ink)]">{stats.progressPct}%</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-[var(--muted)]">
            <span className={`${칩} font-bold text-[var(--ink)]`}>◐ 현재: {현재단계}</span>
            <span className={칩}>● 활성 에이전트 {stats.activeAgents}</span>
            <span className={칩}>✓ 완료 {stats.done}/{stats.total}</span>
            <span className={칩}>◔ 대기 {stats.waiting}</span>
            <span className={stats.blocked > 0 ? `${칩} bg-[var(--warning-soft)] font-bold text-[var(--warning-ink)]` : 칩}>
              ! 검토 필요 {stats.blocked}
            </span>
            <span className={칩}>→ 남은 단계 {stats.remaining}</span>
          </div>
        </div>

        {/* 카메라 컨트롤 — 휠·핀치와 같은 연속 줌을 버튼으로도 */}
        <div className="absolute right-2 top-2 z-10 flex gap-1" data-nopan>
          {follow && (
            <button
              onClick={() => setFollow(null)}
              aria-label={`추적 중지 — ${followName}`}
              className="rounded-md border border-[var(--accent)] bg-[var(--accent-tint)] px-2 py-1 text-2xs font-bold text-[var(--accent)]"
            >
              추적 중: {followName} ✕
            </button>
          )}
          <button
            onClick={() => { const v = viewRef.current; setFollow(null); zoomAt(v.cssSize.w / 2, v.cssSize.h / 2, 1 / 1.25); }}
            aria-label="축소"
            className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            −
          </button>
          <button
            onClick={() => { const v = viewRef.current; zoomAt(v.cssSize.w / 2, v.cssSize.h / 2, 1.25); }}
            aria-label="확대"
            className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            +
          </button>
          <button
            onClick={() => { setFollow(null); animateView(1, { x: 0, y: 0 }); }}
            aria-pressed={zoom <= 1.01}
            className={`rounded-md border px-2 py-1 text-2xs font-bold ${zoom <= 1.01 ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"}`}
          >
            전체 보기
          </button>
          <button
            onClick={() => focusStation(activeStation)}
            disabled={!activeStation}
            className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-2xs font-bold text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-40"
          >
            현재 단계
          </button>
        </div>

        {/* 하단 단계 스트립 — 실행 경로 요약. 클릭 = 그 건물 선택·이동 (타임라인↔지도 양방향) */}
        <div
          role="group"
          aria-label="실행 경로 요약"
          data-nopan
          className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]/95 px-1.5 py-1"
        >
          {스트립.map((it) => {
            const current = it.id === focusId;
            const sel: Sel = it.id === "counselor"
              ? { kind: "counselor", id: "counselor" }
              : it.id === "gate" ? { kind: "gate", id: "gate" } : { kind: "agent", id: it.id };
            const on = isSel(sel.kind, sel.id);
            return (
              <button
                key={it.id}
                onClick={() => { setSelected(sel); setFollow(null); focusStation(it.id, Math.max(viewRef.current.zoom, 1.25)); }}
                aria-label={`${it.이름}: ${it.mark?.label ?? "대기 전"}${current ? " (지금 여기)" : ""}`}
                aria-current={current ? "step" : undefined}
                title={it.이름}
                className={`grid h-6 min-w-[1.4rem] place-items-center rounded px-0.5 text-xs font-bold ${current ? "bg-[var(--accent)] text-white" : on ? "bg-[var(--accent-tint)]" : "hover:bg-[var(--surface)]"}`}
              >
                <span aria-hidden style={current ? undefined : { color: it.mark?.color ?? "var(--muted-soft)" }}>{it.mark?.mark ?? "·"}</span>
              </button>
            );
          })}
          {focusId && (
            <span className="ml-1 max-w-[10rem] truncate text-2xs font-bold text-[var(--ink)]">
              {스트립.find((i) => i.id === focusId)?.이름}
            </span>
          )}
        </div>

        {/* 우측 상세 패널 — 선택한 건물·에이전트·고객·게이트의 상태와 기록. 모달 금지 */}
        {selected && (() => {
          const s = selected;
          const b = s.kind === "building" ? BUILDINGS.find((x) => x.id === s.id) : undefined;
          const 첫스테이션 = b?.stations[0] ?? null;
          return (
            <div data-nopan className="paygent-pop absolute right-2 top-12 z-20 max-h-[calc(100%-6.5rem)] w-[300px] overflow-y-auto rounded-lg border-2 border-[var(--line-strong)] bg-[var(--panel)] p-3 shadow-[var(--shadow-2)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{selName(s)}</p>
                <button onClick={() => setSelected(null)} aria-label="닫기" className="grid h-6 w-6 place-items-center rounded text-[var(--muted)] hover:bg-[var(--surface)]">✕</button>
              </div>
              <div className="mt-2">{detailBody(s)}</div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {b?.kind === "core" && 첫스테이션 && (
                  <button
                    onClick={() => { onStationClick?.(첫스테이션); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    타임라인에서 보기 ▶
                  </button>
                )}
                {b?.id === "bank" && (
                  <button
                    onClick={() => { onOpenPanel?.(); onStationClick?.("counselor"); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    승인 패널 열기 ▶
                  </button>
                )}
                {b?.kind === "support" && (
                  <button
                    onClick={() => { if (b.view) onNavigate?.(b.view, b.tab); setSelected(null); }}
                    disabled={!onNavigate || !b.view}
                    title={!onNavigate || !b.view ? "이 화면에서는 이동할 수 없습니다" : undefined}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    이 화면 열기 ▶
                  </button>
                )}
                {s.kind === "agent" && STATION_SPOTS[s.id] && (
                  <button
                    onClick={() => { onStationClick?.(s.id); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    타임라인에서 보기 ▶
                  </button>
                )}
                {s.kind === "agent" && s.id === "counselor" && (
                  <button
                    onClick={() => { onOpenPanel?.(); onStationClick?.("counselor"); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    승인 패널 열기 ▶
                  </button>
                )}
                {추적가능 && (
                  <button
                    onClick={() => setFollow(follow === s.id ? null : s.id)}
                    aria-pressed={follow === s.id}
                    className={`rounded-md border px-2 py-1 text-2xs font-bold ${follow === s.id ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"}`}
                  >
                    따라가기
                  </button>
                )}
                {s.kind === "counselor" && (
                  <button
                    onClick={() => { onOpenPanel?.(); onStationClick?.("counselor"); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    승인 패널 열기 ▶
                  </button>
                )}
                {s.kind === "case" && s.id !== "case:active" && onSelectCase && (
                  <button
                    onClick={() => { onSelectCase(s.caseId!); setSelected(null); }}
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-2xs font-bold text-white hover:bg-[var(--accent-hover)]"
                  >
                    이 상담 열기 ▶
                  </button>
                )}
                {s.kind === "case" && s.id === "case:active" && (
                  <button
                    onClick={() => setFollow(follow === "customer" ? null : "customer")}
                    aria-pressed={follow === "customer"}
                    className={`rounded-md border px-2 py-1 text-2xs font-bold ${follow === "customer" ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"}`}
                  >
                    이 고객 따라가기
                  </button>
                )}
                {s.kind === "case" && s.id === "case:active" && journey === "blocked" && onOpenPanel && (
                  <button
                    onClick={() => { onOpenPanel(); setSelected(null); }}
                    className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-2 py-1 text-2xs font-bold text-[var(--warning-ink)]"
                  >
                    상담 입력 열기 ▶
                  </button>
                )}
                {s.kind === "gate" && !gateOpen && (
                  <span className="text-2xs text-[var(--muted-soft)]">승인 전에는 열리지 않습니다</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* 좌하단 — 미니맵과 고객 여정 배지를 한 줄로 (배지가 광장 대기 자리를 가리지 않게) */}
        <div data-nopan className="absolute bottom-2 left-2 z-10 flex items-end gap-2">
          <MiniMap
            camera={camera}
            cssSize={cssSize}
            onPick={(wx, wy) => { setFollow(null); focusWorld(wx, wy, Math.max(viewRef.current.zoom, 1.25)); }}
          />
          {caseInfo && (
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)]/95 px-2 py-1">
              <span className="font-mono text-2xs font-bold">{caseInfo.id}</span>
              <Pill tone={journey === "blocked" ? "warn" : "muted"}>{여정라벨[journey]}</Pill>
              {journey === "blocked" && onOpenPanel && (
                <button onClick={onOpenPanel} className="text-2xs font-bold text-[var(--accent)] underline underline-offset-2">
                  상담 입력 열기
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 스크린리더 live region — 숫자 나열이 아니라 문맥이 있는 한 문장 */}
      <p role="status" className="sr-only">{liveMsg}</p>

      {fill ? (
        <p className="sr-only">
          지도에 초점을 두면 방향키로 이동, 플러스·마이너스로 확대·축소, 0으로 전체 보기, Home으로 현재 단계로 갑니다.
        </p>
      ) : (
        <p className="mt-1.5 text-2xs text-[var(--muted-soft)]">
          이 도시는 장식이 아니라 실제 실행 상태의 공간 요약입니다 — 지도를 누른 뒤 방향키로 이동, +/− 확대·축소, 0 전체 보기, Home 현재 단계.
        </p>
      )}
    </div>
  );
}
