"use client";

/**
 * 온톨로지 3D 그래프 — 옵시디언 지식 그래프의 3차원 판.
 *
 * 왜 라이브러리(three.js 등)가 아니라 캔버스냐: 이 저장소는 배포물이 정적이고
 * 네트워크 의존이 없어야 한다(레이아웃의 Pretendard 자체 호스팅과 같은 이유).
 * 노드 66 + 관계 27 정도이면 O(n²) 힘 시뮬레이션 한 프레임에 몇천 번의 연산이라
 * 브라우저가 벅차지 않는다. 대가는 직접 쓰는 투영 행렬인데, 원근 하나면 충분하다.
 *
 * 결정론: 초기 자리는 원둘레+방사형 결정적 배치와 id 기반 지터에서 온다. Math.random 을 쓰지 않는다 —
 * 새로고침할 때마다 그래프 모양이 달라지면 심사자가 "같은 화면"을 못 본다.
 *
 * 색 문법: 노드 색은 클래스 역할(입력·산출·제약·통제)만 따른다. 그래프 예쁘라고
 * 새 색을 만들면 판정 카드의 색 문법(위법=빨강 등)과 충돌한다.
 *
 * 구조(2026-08-27 개편): 맨 캔버스 한 장이 아니라 헤더(모드·검색·조작) /
 * 본체(캔버스 + 선택 상세) / 상태 바(역할 필터·개수)로 짠 도구다.
 * 검색과 역할 필터는 노드를 지우지 않고 **흐리게** 한다 — 지우면 물리가 다시 풀려
 * 배치가 바뀌고, 그러면 "아까 그 자리"라는 공간 기억이 무효가 된다.
 *
 * 접근성: 캔버스는 role="img" 로 요약을 읽고, 같은 내용은 아래 표(개념 지도·관계·공리)에
 * 전부 텍스트로 있다. 그래프는 요약이지 유일한 경로가 아니다. 선택 상세와 관계 목록은
 * DOM 텍스트라 스크린리더로 읽힌다.
 *
 * 알려진 한계: 노드를 끌어 이동하는 건 없다 — 드래그는 회전이다. 끌기는 배치를
 * 사용자별로 흩어지게 하고, 그건 결정론 포기와 같은 뜻이다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLASSES,
  OBJECT_PROPERTIES,
  classById,
  ancestors,
} from "@/lib/ontology/schema";
import type { ABox } from "@/lib/ontology/abox";

type Vec3 = { x: number; y: number; z: number };

type GNode = {
  id: string;
  label: string;
  /** 역할 — 색과 범례가 이 값만 따른다 */
  role: "입력" | "산출" | "제약" | "통제";
  /** 최상위 묶음 — 초기 배치의 군집 */
  group: string;
  /** 최상위 클래스면 크게 그린다 */
  top: boolean;
  r: number;
  p: Vec3;
  v: Vec3;
};

type GEdge = {
  a: string;
  b: string;
  label: string;
  kind: "층위" | "관계";
};

type GraphData = { nodes: GNode[]; edges: GEdge[] };

const 역할색 = {
  입력: "var(--accent)",
  산출: "var(--ink)",
  제약: "var(--warning)",
  통제: "var(--muted-soft)",
} as const;

type Role = keyof typeof 역할색;

const ROLES = Object.keys(역할색) as Role[];

/** 클래스의 역할 — 모든 클래스가 role 을 들고 있으므로 한 번 조회로 끝난다 */
const roleOf = (id: string): Role => classById(id)?.role ?? "산출";

/** 최상위 조상 id — 군집 배치에 쓴다 */
const groupOf = (id: string): string => {
  const chain = ancestors(id);
  return chain.length ? chain[chain.length - 1] : id;
};

/* ───────────────────────── 그래프 조립 ───────────────────────── */

function tboxGraph(): GraphData {
  // 구조화: 최상위 8묶음을 원 위에 고르게, 하위는 부모 주변에 방사형으로 — 결정적
  const tops = CLASSES.filter((c) => c.parent === null);
  const topPos = new Map<string, Vec3>();
  tops.forEach((c, idx) => {
    const ang = (idx / tops.length) * Math.PI * 2 - Math.PI / 2;
    const R = 180;
    topPos.set(c.id, { x: Math.cos(ang) * R, y: Math.sin(ang) * R * 0.6, z: (idx % 2 === 0 ? 1 : -1) * 20 });
  });
  const nodes: GNode[] = CLASSES.map((c) => {
    const isTop = c.parent === null;
    let p: Vec3;
    if (isTop) p = topPos.get(c.id)!;
    else {
      const parentP = topPos.get(groupOf(c.id)) ?? { x: 0, y: 0, z: 0 };
      // 같은 부모 안에서 인덱스로 각도 분산
      const siblings = CLASSES.filter((x) => groupOf(x.id) === groupOf(c.id) && x.id !== groupOf(c.id));
      const idx = siblings.findIndex((x) => x.id === c.id);
      const n = siblings.length || 1;
      const ang = (idx / Math.max(n, 1)) * Math.PI * 2 + (parseInt(c.id.slice(-2), 36) % 10) * 0.1;
      const rad = c.layer === 2 ? 58 : c.layer === 3 ? 38 : 28;
      // y도 살짝 분산해 한 평면에 겹치지 않게
      const yOff = ((idx % 3) - 1) * 18 + (c.layer - 2) * 6;
      p = {
        x: parentP.x + Math.cos(ang) * rad + (idx % 2 === 0 ? 6 : -6),
        y: parentP.y + Math.sin(ang) * rad * 0.7 + yOff,
        z: parentP.z + (Math.sin(ang * 2) * 22),
      };
    }
    return {
      id: c.id,
      label: c.label,
      role: c.role,
      group: c.parent === null ? c.id : groupOf(c.id),
      top: isTop,
      r: isTop ? 9.5 : c.layer === 2 ? 6 : 4.5,
      p,
      v: { x: 0, y: 0, z: 0 },
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: GEdge[] = [];
  for (const c of CLASSES) {
    if (c.parent && byId.has(c.parent))
      edges.push({ a: c.parent, b: c.id, label: "하위 개념", kind: "층위" });
  }
  for (const p of OBJECT_PROPERTIES) {
    if (byId.has(p.domain) && byId.has(p.range))
      edges.push({ a: p.domain, b: p.range, label: p.label, kind: "관계" });
  }
  return { nodes, edges };
}

function aboxGraph(abox: ABox): GraphData {
  const nodes: GNode[] = abox.individuals.map((ind, i) => {
    const cls = classById(ind.class);
    const rule = ind.values?.["d.rule"];
    const level = ind.values?.["d.level"];
    return {
      id: ind.id,
      label: rule ? `${rule} ${level}` : (cls?.label ?? ind.class),
      role: roleOf(ind.class),
      group: groupOf(ind.class),
      top: cls?.parent === null,
      r: ind.class.startsWith("verdict") ? 7 : 5,
      p: 나선자리(i, 60),
      v: { x: 0, y: 0, z: 0 },
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: GEdge[] = [];
  for (const ind of abox.individuals) {
    for (const l of ind.links ?? []) {
      if (byId.has(l.target))
        edges.push({
          a: ind.id,
          b: l.target,
          label:
            OBJECT_PROPERTIES.find((p) => p.id === l.p)?.label ?? l.p,
          kind: "관계",
        });
    }
  }
  return { nodes, edges };
}

/** 황금각 나선 위의 i번째 자리. 크기는 군집 반경 */
function 나선자리(i: number, 반경: number): Vec3 {
  const 군집 = Math.floor(i / 9);
  const 자리 = i % 9;
  const θ = 군집 * 2.399963; // 황금각 (라디안)
  const y = ((군집 % 5) / 4 - 0.5) * 150;
  const r0 = 130;
  const x = r0 * Math.cos(θ) + 반경 * Math.cos(자리 * 2.399963 + 군집);
  const z = r0 * Math.sin(θ) + 반경 * Math.sin(자리 * 2.399963 + 군집);
  return { x, y: y + (자리 - 4) * 8, z };
}

/* ───────────────────────── 컴포넌트 ───────────────────────── */

export function OntologyGraph({ abox }: { abox: ABox | null }) {
  const [mode, setMode] = useState<"tbox" | "abox">("tbox");
  const [spin, setSpin] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** 꺼 둔 역할 — 지우지 않고 흐리게 한다 */
  const [roleOff, setRoleOff] = useState<ReadonlySet<Role>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  /** 상태 중 상태 — 그리는 값들은 전부 ref 로. 리렌더 없이 매 프레임 그린다 */
  const view = useRef({ yaw: 0.5, pitch: 0.35, zoom: 1 });
  const hoverId = useRef<string | null>(null);
  const pointer = useRef({ x: -1, y: -1, down: false, moved: 0, px: 0, py: 0 });
  const graphRef = useRef<GraphData>({ nodes: [], edges: [] });
  const spinRef = useRef(false);
  const sizeRef = useRef({ w: 800, h: 460 });
  const queryRef = useRef("");
  const roleOffRef = useRef<ReadonlySet<Role>>(roleOff);

  const data = useMemo(
    () => (mode === "abox" && abox ? aboxGraph(abox) : tboxGraph()),
    [mode, abox],
  );

  /* 검색·필터 일치 — 상태 바 배지와 그리기가 같은 판정을 써야 개수가 안 어긋난다 */
  const 흐림 = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (n: { id: string; label: string; role: Role }) =>
      roleOff.has(n.role) ||
      (q !== "" && !`${n.label} ${n.id}`.toLowerCase().includes(q));
  }, [query, roleOff]);
  const 보이는수 = useMemo(
    () => data.nodes.filter((n) => !흐림(n)).length,
    [data, 흐림],
  );
  const 역할수 = useMemo(() => {
    const m = new Map<Role, number>();
    for (const n of data.nodes) m.set(n.role, (m.get(n.role) ?? 0) + 1);
    return m;
  }, [data]);

  useEffect(() => {
    queryRef.current = query.trim().toLowerCase();
  }, [query]);
  useEffect(() => {
    roleOffRef.current = roleOff;
  }, [roleOff]);

  /** 선택 상세 — 제목·메타·본문·관계 목록. 관계는 눌러서 이웃으로 건너간다 */
  const 선택 = useMemo(() => {
    if (!selected) return null;
    const 이웃 = data.edges
      .filter((e) => e.a === selected || e.b === selected)
      .map((e) => {
        const otherId = e.a === selected ? e.b : e.a;
        const other = data.nodes.find((n) => n.id === otherId);
        return other
          ? { dir: e.a === selected ? "→" : "←", label: e.label, other }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (mode === "tbox") {
      const c = classById(selected);
      if (!c) return null;
      return {
        title: c.label,
        meta: `${c.role} · ${c.layer}단 · ${c.id}`,
        body: c.note,
        code: c.codeSource,
        이웃,
      };
    }
    const ind = abox?.individuals.find((x) => x.id === selected);
    if (!ind) return null;
    const cls = classById(ind.class);
    const values = Object.entries(ind.values ?? {});
    return {
      title: cls?.label ?? ind.class,
      meta: `${ind.id} · 관계 ${(ind.links ?? []).length}개`,
      body: values.length
        ? values.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")
        : "데이터 속성 없음",
      code: ind.class,
      이웃,
    };
  }, [selected, mode, abox, data]);

  /* 그래프 교체 — 시점은 유지하되 물리는 새로 풀린다.
     선택 해제는 렌더 중 조정으로(이펙트 동기 setState 금지), ref 갱신만 이펙트로. */
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setSelected(null);
  }
  useEffect(() => {
    graphRef.current = structuredClone(data);
    hoverId.current = null;
  }, [data]);

  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);

  /* 캔버스 크기 — 컨테이너를 따른다. 상세 패널이 여닫혀 폭이 변해도 여기가 따라잡는다 */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const 적용 = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = 460;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h };
    };
    적용();
    const ro = new ResizeObserver(적용);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* 본체 — 물리 한 스텝 + 그리기 한 패스 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const 스타일 = getComputedStyle(document.documentElement);
    const 색 = (이름: string, 대체: string) =>
      스타일.getPropertyValue(이름).trim() || 대체;
    const palette = {
      입력: 색("--accent", "#2563eb"),
      산출: 색("--ink", "#111827"),
      제약: 색("--warning", "#d97706"),
      통제: 색("--muted-soft", "#9ca3af"),
      line: 색("--line", "#e5e7eb"),
      muted: 색("--muted", "#4b5563"),
      panel: 색("--panel", "#ffffff"),
    };

    const 줄임운동 = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (줄임운동) {
      // 물리를 미리 다 풀어두고 멈춘다 — 움직임 자체가 불편한 사람을 위한 배려
      for (let i = 0; i < 400; i++) 물리한스텝(graphRef.current);
    }

    /** 라벨은 판 위에 얹는다 — 겹치면 배경끼리 겹쳐 얼룩이 진다 */
    const 라벨 = (
      text: string,
      x: number,
      y: number,
      fg: string,
      bold: boolean,
    ) => {
      ctx.font = bold
        ? '700 11px "Pretendard", sans-serif'
        : '500 10px "Pretendard", sans-serif';
      const w = ctx.measureText(text).width;
      const α = ctx.globalAlpha;
      // 배경을 조금 더 불투명하게 — 겹쳐도 글자가 묻히지 않게
      ctx.globalAlpha = Math.min(1, α * 0.92);
      ctx.fillStyle = palette.panel;
      // 모서리 둥근 배경 대신 직사각 + 얇은 테두리
      ctx.fillRect(x - w / 2 - 5, y - 10, w + 10, 13);
      ctx.strokeStyle = "rgba(16,26,43,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 - 5, y - 10, w + 10, 13);
      ctx.globalAlpha = α;
      ctx.fillStyle = fg;
      ctx.fillText(text, x, y);
    };

    let raf = 0;
    let 마지막 = performance.now();

    const 그리기 = (now: number) => {
      const dt = Math.min((now - 마지막) / 16.67, 3);
      마지막 = now;
      const g = graphRef.current;
      const { w, h } = sizeRef.current;
      const dpr = canvas.width / Math.max(w, 1);
      const v = view.current;
      const q = queryRef.current;
      const off = roleOffRef.current;
      const 걸러냄 = q !== "" || off.size > 0;
      const 흐림노드 = (n: GNode) =>
        off.has(n.role) ||
        (q !== "" && !`${n.label} ${n.id}`.toLowerCase().includes(q));

      if (spinRef.current && !pointer.current.down) v.yaw += 0.004 * dt;
      if (!줄임운동) 물리한스텝(g, dt);

      /* 투영 */
      const cy = Math.cos(v.yaw);
      const sy = Math.sin(v.yaw);
      const cp = Math.cos(v.pitch);
      const sp = Math.sin(v.pitch);
      const fov = 700;
      const 투영 = g.nodes.map((n) => {
        const x1 = n.p.x * cy - n.p.z * sy;
        const z1 = n.p.x * sy + n.p.z * cy;
        const y2 = n.p.y * cp - z1 * sp;
        const z2 = n.p.y * sp + z1 * cp;
        // 원근 발산 클램프 — 카메라 뒤로 넘어간 노드가 화면을 찢지 않게
        const s = Math.max(0.06, fov / (fov + z2 + 400));
        return {
          n,
          dim: 흐림노드(n),
          sx: w / 2 + x1 * s * v.zoom,
          sy: h / 2 + y2 * s * v.zoom,
          s: s * v.zoom,
          depth: z2,
        };
      });
      const 위치 = new Map(투영.map((t) => [t.n.id, t]));

      /* 호버 — 가장 가까운 노드. 흐려진 노드는 잡지 않는다(검색 → 클릭이 일치로만 가게) */
      const pt = pointer.current;
      let 가까운: (typeof 투영)[number] | null = null;
      let 최소 = 14;
      if (pt.x >= 0) {
        for (const t of 투영) {
          if (t.dim) continue;
          const d = Math.hypot(t.sx - pt.x, t.sy - pt.y);
          if (d < Math.max(최소, t.n.r * t.s + 4)) {
            최소 = d;
            가까운 = t;
          }
        }
      }
      hoverId.current = 가까운?.n.id ?? null;
      canvas.style.cursor = 가까운 ? "pointer" : pt.down ? "grabbing" : "grab";

      /* 커서 곁 이름표 — 강조는 캔버스가, 글은 DOM 이 맡는다(흐릿한 캔버스 글자보다 또렷하다) */
      const tip = tipRef.current;
      if (tip) {
        if (가까운 && !pt.down) {
          const 제목 = tip.querySelector<HTMLElement>("[data-tip-title]");
          const 메타 = tip.querySelector<HTMLElement>("[data-tip-meta]");
          if (제목) 제목.textContent = 가까운.n.label;
          if (메타)
            메타.textContent = `${가까운.n.role} · ${가까운.n.id} — 누르면 상세`;
          tip.style.display = "block";
          tip.style.transform = `translate(${Math.min(가까운.sx + 14, w - 200)}px, ${Math.min(가까운.sy + 12, h - 48)}px)`;
        } else {
          tip.style.display = "none";
        }
      }

      /* 페인트 */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const 강조 = selected ?? hoverId.current;
      const 깊이알파 = (z: number) => {
        const t = Math.max(-1, Math.min(1, z / 320));
        return 0.85 - t * 0.45;
      };

      /* 선 — 먼 것부터 */
      const 선들 = g.edges
        .map((e) => {
          const a = 위치.get(e.a);
          const b = 위치.get(e.b);
          return a && b ? { e, a, b, depth: (a.depth + b.depth) / 2 } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((x, y) => y.depth - x.depth);

      for (const { e, a, b, depth } of 선들) {
        const 강조됨 = 강조 !== null && (e.a === 강조 || e.b === 강조);
        const 흐림됨 = !강조됨 && (a.dim || b.dim);
        ctx.globalAlpha =
          (강조됨 ? 0.95 : 깊이알파(depth) * (e.kind === "층위" ? 0.4 : 0.55)) *
          (흐림됨 ? 0.15 : 1);
        ctx.strokeStyle = 강조됨
          ? palette.입력
          : e.kind === "층위"
            ? palette.line
            : palette.muted;
        ctx.lineWidth = 강조됨 ? 1.8 : e.kind === "층위" ? 1 : 1.4;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        if (강조됨) {
          ctx.globalAlpha = 1;
          ctx.textAlign = "center";
          라벨(e.label, (a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 4, palette.muted, false);
        }
      }

      /* 노드 — 먼 것부터. 흐려진 노드는 알파만 낮춘다(자리는 지킨다) */
      for (const t of [...투영].sort((x, y) => y.depth - x.depth)) {
        const r = Math.max(1.6, t.n.r * t.s);
        const 기본 = 깊이알파(t.depth) * (t.dim && t.n.id !== 강조 ? 0.12 : 1);
        ctx.globalAlpha = 기본;
        ctx.fillStyle = palette[t.n.role];
        ctx.beginPath();
        ctx.arc(t.sx, t.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (t.n.top) {
          ctx.globalAlpha = 기본 * 0.5;
          ctx.strokeStyle = palette[t.n.role];
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(t.sx, t.sy, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (t.n.id === hoverId.current && t.n.id !== selected) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = palette.입력;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(t.sx, t.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (t.n.id === selected) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = palette.입력;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(t.sx, t.sy, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      /* 글자 — 구조화: 최상위와 주목받는 것만. 검색 시 일치만 추가로 — 겹침을 막는다 */
      ctx.textAlign = "center";
      const 일치라벨 = 걸러냄 && 투영.filter((t) => !t.dim).length <= 16;
      for (const t of 투영) {
        const 주목 = t.n.id === 강조;
        const 보여줌 =
          주목 || (!t.dim && t.n.top) || (일치라벨 && !t.dim);
        if (!보여줌) continue;
        ctx.globalAlpha =
          Math.min(1, 깊이알파(t.depth) + 0.25) * (t.dim && !주목 ? 0.3 : 1);
        // 라벨이 노드 위에 겹치지 않게 y 오프셋을 깊이에 따라 미세 조정
        const yOff = t.n.top ? -12 : -9;
        라벨(
          t.n.label,
          t.sx,
          t.sy - t.n.r * t.s + yOff,
          주목 ? palette.입력 : palette.muted,
          t.n.top || 주목,
        );
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(그리기);
    };
    raf = requestAnimationFrame(그리기);
    return () => cancelAnimationFrame(raf);
    // selected 는 ref 대신 클로저로 읽는다 — 강조 갱신을 위해 재가입한다
  }, [selected]);

  /* 포인터 — 드래그 회전, 클릭 선택, 휠 줌 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      const { x, y } = local(e);
      pointer.current = { x, y, down: true, moved: 0, px: x, py: y };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const { x, y } = local(e);
      const pt = pointer.current;
      pt.x = x;
      pt.y = y;
      if (pt.down) {
        const dx = x - pt.px;
        const dy = y - pt.py;
        pt.moved += Math.abs(dx) + Math.abs(dy);
        view.current.yaw += dx * 0.005;
        view.current.pitch = Math.max(
          -1.25,
          Math.min(1.25, view.current.pitch + dy * 0.005),
        );
        pt.px = x;
        pt.py = y;
      }
    };
    const up = () => {
      const pt = pointer.current;
      if (pt.moved < 5) {
        // 끈 거의 없는 클릭 — 호버 중인 노드가 선택 대상
        setSelected((prev) =>
          hoverId.current && hoverId.current !== prev ? hoverId.current : null,
        );
      }
      pt.down = false;
    };
    const leave = () => {
      pointer.current.x = -1;
      pointer.current.y = -1;
      hoverId.current = null;
      if (tipRef.current) tipRef.current.style.display = "none";
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.zoom = Math.max(0.4, Math.min(3, v.zoom * Math.exp(-e.deltaY * 0.0012)));
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  const 다시섞기 = () => {
    graphRef.current = structuredClone(data);
    setSelected(null);
  };

  const 역할토글 = (r: Role) =>
    setRoleOff((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const 조작단추 = (on: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
      on
        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
        : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"
    }`;
  const 분절 = (on: boolean, enabled = true) =>
    `px-3 py-1.5 text-xs font-semibold transition-colors ${
      on
        ? "bg-[var(--accent)] text-white"
        : enabled
          ? "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--surface)]"
          : "cursor-not-allowed bg-[var(--panel)] text-[var(--muted-soft)]"
    }`;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)]">
      {/* ── 헤더: 무엇을 보는가(모드) · 무엇을 찾는가(검색) · 어떻게 보는가(조작) ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--line)]">
          <button className={분절(mode === "tbox")} onClick={() => setMode("tbox")}>
            T-Box 개념 {CLASSES.length}
          </button>
          <button
            className={`border-l border-[var(--line)] ${분절(mode === "abox", !!abox)}`}
            onClick={() => abox && setMode("abox")}
            disabled={!abox}
            title={abox ? undefined : "판정을 실행하면 이 실행의 개체 그래프가 생깁니다"}
          >
            A-Box 이번 실행 {abox ? abox.individuals.length : 0}
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="개념 검색 — 예: 판정, 시효, 국적"
          aria-label="그래프에서 개념 검색. 일치하지 않는 노드는 흐려진다"
          className="min-w-[180px] flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-xs"
        />

        <button
          className={조작단추(spin)}
          onClick={() => setSpin((v) => !v)}
          aria-pressed={spin}
        >
          {spin ? "회전 멈춤" : "자동 회전"}
        </button>
        <button className={조작단추(false)} onClick={다시섞기}>
          배치 다시 풀기
        </button>
      </div>

      {/* ── 본체: 캔버스 + 선택 상세(도킹) ── */}
      <div className="flex flex-col min-[900px]:flex-row">
        <div ref={wrapRef} className="relative min-w-0 flex-1 bg-[var(--surface)]">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`온톨로지 3D 그래프 (${mode === "tbox" ? "T-Box 개념" : "실행 개체"}). 검색·역할 필터는 일치하지 않는 노드를 흐리게 한다. 같은 내용은 아래 개념 지도와 관계 표에 텍스트로 있다.`}
          />
          {/* 커서 곁 이름표 — pointer-events 를 끊어 캔버스 조작을 방해하지 않는다 */}
          <div
            ref={tipRef}
            aria-hidden
            style={{ display: "none" }}
            className="pointer-events-none absolute left-0 top-0 z-10 w-max max-w-[220px] rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 shadow-[var(--shadow-2)]"
          >
            <p data-tip-title className="text-xs font-bold leading-tight" />
            <p
              data-tip-meta
              className="mt-0.5 font-mono text-2xs leading-tight text-[var(--muted)]"
            />
          </div>
        </div>

        {선택 && (
          <aside className="w-full shrink-0 border-t-2 border-[var(--line-strong)] min-[900px]:w-[300px] min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:border-l-[var(--line)]">
            <div className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug">{선택.title}</p>
                <p className="mt-0.5 font-mono text-2xs text-[var(--muted)]">
                  {선택.meta}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="선택 해제"
                className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[var(--line)] text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[356px] overflow-y-auto px-4 py-3">
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {선택.body}
              </p>
              {선택.code && (
                <p className="mt-2 rounded bg-[var(--surface)] px-2 py-1 font-mono text-2xs text-[var(--muted)]">
                  {선택.code}
                </p>
              )}
              <p className="mt-3 border-t border-[var(--line-soft)] pt-2.5 text-2xs font-bold text-[var(--muted-soft)]">
                관계 {선택.이웃.length}개 — 눌러서 건너가기
              </p>
              <ul className="mt-1 space-y-0.5">
                {선택.이웃.map((e, i) => (
                  <li key={`${e.other.id}-${i}`}>
                    <button
                      onClick={() => setSelected(e.other.id)}
                      className="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-[var(--surface)]"
                    >
                      <span
                        aria-hidden
                        className="font-mono text-[var(--muted-soft)]"
                      >
                        {e.dir}
                      </span>
                      <span className="font-semibold">{e.other.label}</span>
                      <span className="min-w-0 flex-1 truncate text-2xs text-[var(--muted-soft)]">
                        {e.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>

      {/* ── 상태 바: 역할 필터(누르면 끄고 켠다) · 표시 개수 · 조작 안내 ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--line)] px-3 py-2">
        {ROLES.map((r) => {
          const off = roleOff.has(r);
          return (
            <button
              key={r}
              onClick={() => 역할토글(r)}
              aria-pressed={!off}
              title={off ? `${r} 다시 보이기` : `${r} 흐리게`}
              className={`flex items-center gap-1.5 rounded px-1 text-2xs font-semibold ${
                off
                  ? "text-[var(--muted-soft)] line-through"
                  : "text-[var(--muted)]"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  off ? "border border-[var(--muted-soft)] bg-transparent" : ""
                }`}
                style={off ? undefined : { background: 역할색[r] }}
              />
              {r} {역할수.get(r) ?? 0}
            </button>
          );
        })}
        <span aria-hidden className="h-3.5 w-px bg-[var(--line)]" />
        <span className="text-2xs text-[var(--muted)]">
          {보이는수 === data.nodes.length
            ? `노드 ${data.nodes.length} · 관계 ${data.edges.length}`
            : `일치 ${보이는수} / ${data.nodes.length} — 나머지는 흐림`}
        </span>
        <span className="ml-auto text-2xs text-[var(--muted-soft)]">
          드래그 회전 · 휠 확대 · 노드 클릭 = 상세
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── 물리 ───────────────────────── */

/**
 * 3차원 힘 계 — 반발(모든 쌍) + 용수철(연결) + 중심 당김.
 * 계수는 노드 66 기준으로 손으로 맞춘 값이다. 노드가 수백 개가 넘어가면
 * 공간 분할(Barnes–Hut)을 넣어야 하지만, 그 전까지는 필요 없다.
 */
function 물리한스텝(g: GraphData, dt = 1) {
  const ns = g.nodes;
  const 반발 = 4200;
  const 중심 = 0.006;
  const 감쇠 = 0.86;

  for (let i = 0; i < ns.length; i++) {
    const a = ns[i];
    for (let j = i + 1; j < ns.length; j++) {
      const b = ns[j];
      let dx = a.p.x - b.p.x;
      let dy = a.p.y - b.p.y;
      let dz = a.p.z - b.p.z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1) {
        // 완전히 겹치면 결정론적 탈출 방향 — 난수 대신 인덱스가 방향을 정한다
        dx = (i - j) * 0.01 || 0.01;
        dy = (j % 3 - 1) * 0.01;
        dz = (i % 3 - 1) * 0.01;
        d2 = dx * dx + dy * dy + dz * dz;
      }
      const f = 반발 / d2;
      const d = Math.sqrt(d2);
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      const uz = (dz / d) * f;
      a.v.x += ux; a.v.y += uy; a.v.z += uz;
      b.v.x -= ux; b.v.y -= uy; b.v.z -= uz;
    }
  }

  for (const e of g.edges) {
    const a = ns.find((n) => n.id === e.a);
    const b = ns.find((n) => n.id === e.b);
    if (!a || !b) continue;
    const 목표 = e.kind === "층위" ? 88 : 150;
    const dx = b.p.x - a.p.x;
    const dy = b.p.y - a.p.y;
    const dz = b.p.z - a.p.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
    const f = (d - 목표) * 0.014;
    const ux = (dx / d) * f;
    const uy = (dy / d) * f;
    const uz = (dz / d) * f;
    a.v.x += ux; a.v.y += uy; a.v.z += uz;
    b.v.x -= ux; b.v.y -= uy; b.v.z -= uz;
  }

  for (const n of ns) {
    n.v.x -= n.p.x * 중심;
    n.v.y -= n.p.y * 중심;
    n.v.z -= n.p.z * 중심;
    n.v.x *= 감쇠; n.v.y *= 감쇠; n.v.z *= 감쇠;
    n.p.x += n.v.x * dt;
    n.p.y += n.v.y * dt;
    n.p.z += n.v.z * dt;
  }
}
