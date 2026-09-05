"use client";

/**
 * Fin:AI 운영 도시 — Canvas 2D 렌더러 (컷어웨이 2.5D).
 *
 * 책임: 그리기와 이동 보간뿐. 무엇을 그릴지(상태·목적지)는 전부 props다 —
 * lib/officeWorld(지도)·lib/officeActors(상태)·_office(결합)가 정한다.
 *
 * 2.5D 표현(컷어웨이 탑다운):
 *   바닥 → 뒷벽(키 큰 안쪽 면·간판 자리) → 서벽 → 낮은 앞/동 난간 → 문 → 설비
 *   광원은 좌상단 고정 — 그림자는 전부 우·하로 간다. 앞·동 벽이 낮아 내부가 보인다.
 *
 * 화질 계약(명세 11):
 *   - devicePixelRatio 반영(최대 2), imageSmoothingEnabled=false
 *   - 비트맵 없이 전부 사각형 픽셀 드로잉 — 그라디언트·블러 금지
 *   - 한글 텍스트는 캔버스에 그리지 않는다 — 라벨은 _office의 HTML 오버레이
 *   - 이동 중에만 매 프레임, 그 외 앰비언트는 120ms(≈8fps)·reduced-motion·숨김이면 정지
 */

import { useEffect, useRef } from "react";
import {
  TILE, WORLD, PALETTE as P, BUILDINGS, STATION_SPOTS, STREET, STREET_Y,
  QUEUE_SPOTS, CUSTOMER_SPOTS, COUNSELOR_SPOT, ARCHIVE_SPOT, EXIT_GATE,
  DECOR, CANAL, ZONES, walkPath, type Building, type Decor,
} from "@/lib/officeWorld";
import type { AgentState, CustomerState } from "@/lib/officeActors";

export type Camera = { scale: number; tx: number; ty: number };

export type QueueCase = { id: string; badge: string; kind: string };

export type OfficeCanvasProps = {
  /** 스테이션 id → 타임라인 상태 (건물 조명·표시등) */
  statuses: Record<string, "완료" | "대기" | "미연결" | "중단" | "차단" | null>;
  /** 에이전트 id → 시각 상태 (officeActors 파생 — working ≤ 1) */
  agents: Record<string, AgentState>;
  customer: { state: CustomerState; badge: string } | null;
  /** 대기열 — 실제 케이스 데이터 (선택 케이스 제외). 장식 NPC 금지 */
  queue: QueueCase[];
  /** 문서 목적지 자리 id — null이면 문서 없음 */
  docTarget: string | null;
  /** 지금 실행 중인 스테이션 — 건물 점등·경로 강조의 기준 */
  activeStation: string | null;
  gateOpen: boolean;
  /** 선택된 건물 id — 살짝 띄우고 외곽을 강조한다 */
  selectedBuilding?: string | null;
  /** 선택된 에이전트 id(스테이션 id·counselor·records) — 발밑 링 강조 */
  selectedAgent?: string | null;
  camera: Camera;
  cssSize: { w: number; h: number };
  reducedMotion: boolean;
};

const W = WORLD.w * TILE;
const H = WORLD.h * TILE;
const px = (t: number) => t * TILE;
const 걸음속도 = 170; // 논리 px/s
/** 지면 시작 행 — 0–3행은 비워 원경이 지평선으로 보이게 한다 */
const 지면행 = 4;

/* ── 파생 색 — 모듈 초기화 때 한 번만. 프레임마다 문자열을 만들지 않는다 ── */
const 잉크 = "#0F2A4C";
const 흰 = "#FFFFFF";
function rgb(c: string): number[] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const 그림자 = "rgba(15, 42, 76, 0.13)";
const 선택색 = "#1687F8";
const 잎A = "#7FB58A";
const 잎B = "#4F8F5F";
const 잎어둠 = mix(잎B, 잉크, 0.28);
const 흙 = mix(P.목재, 잉크, 0.42);
const 물A = "#CFE3F7";
const 물B = "#BBD5F0";
const 물빛 = "#EAF4FF";
const 목재어둠 = mix(P.목재, 잉크, 0.35);
const 목재밝음 = mix(P.목재, 흰, 0.28);
const 금속어둠 = mix(P.유리금속, 잉크, 0.32);
const 화면 = "#1E3A5C";
const 따뜻한창 = "#FFEDC4";
const 따뜻한창약 = "#EFD9A6";
const 하늘 = "#EDF3FA";
const 원경땅 = "#E4EDF6";
const 원경선 = mix(원경땅, 잉크, 0.14);
const 원경1 = "#D6E2EF";
const 원경1갓 = "#C6D6E7";
const 원경2 = "#BCCFE3";
const 원경2갓 = "#A9C0D8";
const 보도어둠 = mix(P.보도, 잉크, 0.10);
const 매트 = mix(P.보도, 잉크, 0.04);

/** 건물별 기본 벽색 — 비슷한 흰 상자 나열을 깨는 첫 번째 층 (업무 분위기) */
const BASE_WALL: Record<string, string> = {
  reception: "#FBF7F0", routing: "#F1F7FF", extraction: "#F6FAFF", judgment: "#E3EAF2",
  guardrail: "#F2F7F3", ontology: "#F0F5FE", answer: "#F6FAFF", bank: "#FBF8F2",
  lounge: "#FAF6EF", vault: "#EAF1F9", simroom: "#F1F6FD", skillinfo: "#F3F8FF",
  library: "#F7F3EA", lawsearch: "#F2F6FB", explainroom: "#EFF6F2", archive2: "#F6F2E9",
  dispatch: "#F2F7FD", approvaldesk: "#F7F4EC", monitortower: "#EAF0F8", orgoffice: "#F2F6FC",
};

type Tone = {
  floorA: string; floorB: string; wall: string; wallDim: string;
  cornice: string; corniceLine: string; west: string; westEdge: string;
  ledge: string; ledgeTop: string; plate: string; plateLine: string; mat: string;
};
const TONES: Record<string, Tone> = {};
const FLOOR_KIND: Record<string, "carpet" | "tile" | "stone"> = {};
for (const b of BUILDINGS) {
  const base = BASE_WALL[b.id] ?? P.벽체;
  const floorA = mix(base, 흰, 0.45);
  TONES[b.id] = {
    floorA,
    floorB: mix(floorA, 잉크, 0.10),
    wall: mix(base, 잉크, 0.17),
    wallDim: mix(base, 잉크, 0.36),
    cornice: mix(base, 흰, 0.8),
    corniceLine: mix(base, 잉크, 0.46),
    west: mix(base, 잉크, 0.4),
    westEdge: mix(base, 잉크, 0.58),
    ledge: mix(base, 잉크, 0.26),
    ledgeTop: mix(base, 흰, 0.62),
    plate: mix(base, 잉크, 0.3),
    plateLine: mix(base, 잉크, 0.55),
    mat: mix(floorA, 잉크, 0.06),
  };
  FLOOR_KIND[b.id] =
    b.zone === "고객 접점" || b.zone === "답변·승인" ? "carpet"
      : b.zone === "데이터 처리" || b.zone === "AI 판단" ? "tile"
        : "stone";
}

/** 구역 바닥 톤 — 거의 안 보일 만큼 옅게(알파 ≤ 0.05). 색만으로 뜻을 전하지 않는다 */
const ZONE_TINT: Record<string, string> = {
  "고객 접점": "rgba(0, 110, 218, 0.045)",
  "데이터 처리": "rgba(20, 125, 114, 0.04)",
  "AI 판단": "rgba(123, 91, 214, 0.04)",
  "지식·규제": "rgba(183, 121, 31, 0.04)",
  "답변·승인": "rgba(0, 110, 218, 0.035)",
  "운영 지원": "rgba(62, 110, 143, 0.05)",
};
const 안내판색 = ["#006EDA", "#147D72", "#7B5BD6", "#B7791F", "#C93C47", "#3E6E8F"];
const SIGN_NO = new Map<string, number>(ZONES.map((z) => [z.signX + "," + z.signY, z.no]));

const PLAZA = BUILDINGS.find((b) => b.id === "plaza")!;
/** 다리는 지면 레이어(수로 위)에 깔고, 나머지 장식은 y정렬 스프라이트로 그린다 */
const BRIDGES = DECOR.filter((d) => d.kind === "bridge");
const DECOR_SORTED = DECOR.filter((d) => d.kind !== "bridge").sort((a, b) => a.y - b.y || a.x - b.x);

const STATION_IDS = Object.keys(STATION_SPOTS);
const AGENT_IDS = [...STATION_IDS, "counselor", "records"];
/** 문 안쪽 타일 — working이면 이 자리로 걸어 나온다 */
const AGENT_DOOR: Record<string, { x: number; y: number }> = {};
for (const id of STATION_IDS) {
  const s = STATION_SPOTS[id];
  const b = BUILDINGS.find((bb) => bb.id === s.buildingId)!;
  AGENT_DOOR[id] = b.side === "top"
    ? { x: b.doorX, y: b.y1 - 1 }
    : { x: b.doorX, y: b.y0 + Math.ceil(b.wallH / TILE) };
}
/** 유휴 바운스 위상 분산 — 전원이 한 박자로 뛰면 기계처럼 보인다 */
const HASH: Record<string, number> = {};
for (const id of AGENT_IDS) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  HASH[id] = h % 6;
}
/** 원경 실루엣 높이 — 프레임마다 삼각함수를 돌리지 않는다 */
const FAR_H = Array.from({ length: 96 }, (_, i) => {
  const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
});

const BADGES: Record<string, string> = {
  input: "#006EDA", routing: "#006EDA", extract: "#006EDA",
  judge: "#147D72", guard: "#147D72", ontology: "#147D72",
  narrate: "#147D72", translate: "#006EDA",
};
const HAIRS: Record<string, string> = {
  input: "#2c3e57", routing: "#1c2940", extract: "#4b3a2f",
  judge: "#101A2B", guard: "#3a2f4b", ontology: "#2f4b3a",
  narrate: "#4b2f2f", translate: "#2c3e57",
};
const CUSTOMER_HAIRS = ["#101A2B", "#4b3a2f", "#2f2f4b", "#3a2f2f", "#1c2940", "#4b4b2f"];

type PersonAccessory =
  | "clipboard" | "headset" | "magnifier" | "keyboard" | "shield"
  | "graph" | "pen" | "speech" | "stamp" | "box";

/** 역할 장비 — 배지 색만으로는 전체 화면에서 안 갈린다. 실루엣이 역할을 말한다 */
const ACCESSORY: Record<string, PersonAccessory> = {
  input: "clipboard",
  routing: "headset",
  extract: "magnifier",
  judge: "keyboard",
  guard: "shield",
  ontology: "graph",
  narrate: "pen",
  translate: "speech",
};

/** 문서가 서는 자리 — 건물 안이 아니라 문 앞 보도 (읽히는 동선) */
function docTile(spot: string): { x: number; y: number } {
  if (spot === "counselor") return { x: 70, y: 24 };
  if (spot === "gate") return { x: 77, y: STREET_Y };
  const st = STATION_SPOTS[spot];
  if (!st) return { x: 8, y: 18 };
  const b = BUILDINGS.find((bb) => bb.id === st.buildingId)!;
  return { x: st.x, y: b.side === "top" ? 18 : 24 };
}

function customerTile(state: CustomerState): { x: number; y: number } {
  switch (state) {
    case "queued": return QUEUE_SPOTS[0];
    case "consulting": return CUSTOMER_SPOTS.consulting;
    case "waiting-for-processing": return CUSTOMER_SPOTS.waitingProcessing;
    case "blocked": return CUSTOMER_SPOTS.waitingProcessing;
    case "waiting-for-approval": return CUSTOMER_SPOTS.waitingApproval;
    case "receiving-result": return CUSTOMER_SPOTS.receivingResult;
    case "completed": return CUSTOMER_SPOTS.exited;
  }
}

function lampColor(st: OfficeCanvasProps["statuses"][string], blink: boolean): string {
  if (st === "완료") return P.성공;
  if (st === "대기") return blink ? P.인터랙션 : P.도로;
  if (st === "차단") return blink ? P.오류 : "#5a1d22";
  if (st === "중단") return P.경고;
  if (st === "미연결") return P.유리금속;
  return "#C6D8EC";
}

type Mover = { pos: { x: number; y: number }; path: { x: number; y: number }[]; last: string };
type Sprite = { y: number; f: () => void };

/* ── 원경 패럴랙스 — 월드 변환 **전** 화면 좌표계에 그린다 ── */
function drawFarRow(
  g: CanvasRenderingContext2D, x0: number, x1: number, baseY: number,
  ox: number, scale: number, seed: number, fill: string, cap: string, minH: number, maxH: number,
) {
  const step = 42 * scale;
  const bw = 32 * scale;
  const i0 = Math.floor((x0 - ox) / step) - 1;
  const i1 = Math.ceil((x1 - ox) / step) + 1;
  for (let i = i0; i <= i1; i++) {
    const r = FAR_H[(((i + seed) % 96) + 96) % 96];
    const bh = (minH + r * (maxH - minH)) * scale;
    const bx = ox + i * step;
    g.fillStyle = fill;
    g.fillRect(bx, baseY - bh, bw, bh);
    g.fillStyle = cap;
    g.fillRect(bx, baseY - bh, bw, Math.max(1, 3 * scale));
  }
}

function drawFar(g: CanvasRenderingContext2D, cam: Camera, cw: number) {
  const worldTop = cam.ty + px(지면행) * cam.scale;
  const left = cam.tx;
  const width = W * cam.scale;
  if (worldTop <= 0 || left > cw || left + width < 0) return;
  g.save();
  g.beginPath();
  g.rect(left, 0, width, worldTop);
  g.clip();
  const horizon = Math.min(worldTop, cam.ty * 0.35 + 44 * cam.scale);
  g.fillStyle = 하늘;
  g.fillRect(left, 0, width, horizon);
  g.fillStyle = 원경땅;
  g.fillRect(left, horizon, width, worldTop - horizon);
  const ox = cam.tx * 0.35;
  drawFarRow(g, left, left + width, horizon - 5 * cam.scale, ox, cam.scale, 0, 원경1, 원경1갓, 30, 46);
  drawFarRow(g, left, left + width, horizon, ox * 1.3 + 17 * cam.scale, cam.scale, 43, 원경2, 원경2갓, 18, 32);
  g.fillStyle = 원경선;
  g.fillRect(left, horizon, width, 1);
  g.restore();
}

/* ── 지면 ── */
function drawGround(g: CanvasRenderingContext2D, clock: number, reduced: boolean) {
  const gy = px(지면행);
  g.fillStyle = P.바닥석재A;
  g.fillRect(0, gy, W, H - gy);
  g.fillStyle = P.바닥석재B;
  for (let ty = 지면행; ty < WORLD.h; ty++) {
    for (let tx = ty % 2 === 0 ? 1 : 0; tx < WORLD.w; tx += 2) g.fillRect(px(tx), px(ty), TILE, TILE);
  }

  /* 구역 바닥 톤 — 큰길은 건너뛴다 (알파 ≤ 0.05) */
  for (const z of ZONES) {
    g.fillStyle = ZONE_TINT[z.zone];
    const zx = px(z.x0);
    const zw = px(z.x1 - z.x0 + 1);
    if (z.zone === "운영 지원") {
      g.fillRect(zx, px(CANAL.bottom + 1), zw, H - px(CANAL.bottom + 1));
      continue;
    }
    g.fillRect(zx, gy, zw, px(STREET.top) - gy);
    g.fillRect(zx, px(STREET.bottom + 1), zw, px(CANAL.top) - px(STREET.bottom + 1));
  }

  /* 큰길 */
  g.fillStyle = P.도로;
  g.fillRect(0, px(STREET.top), W, px(STREET.bottom - STREET.top + 1));
  g.fillStyle = P.도로차선;
  for (let tx = 1; tx < WORLD.w - 1; tx += 3) g.fillRect(px(tx) + 4, px(STREET_Y) + 7, TILE, 2);

  /* 보도 (큰길 위·아래 한 줄) + 연석 */
  g.fillStyle = P.보도;
  g.fillRect(0, px(STREET.top - 1), W, TILE);
  g.fillRect(0, px(STREET.bottom + 1), W, TILE);
  g.fillStyle = 보도어둠;
  g.fillRect(0, px(STREET.top) - 2, W, 2);
  g.fillRect(0, px(STREET.bottom + 1), W, 2);
  for (let tx = 0; tx < WORLD.w; tx += 2) {
    g.fillRect(px(tx), px(STREET.top - 1), 1, TILE);
    g.fillRect(px(tx), px(STREET.bottom + 1), 1, TILE);
  }

  /* 광장 포장 */
  for (let ty = PLAZA.y0; ty <= PLAZA.y1; ty++) {
    for (let tx = PLAZA.x0; tx <= PLAZA.x1; tx++) {
      g.fillStyle = (tx + ty) % 2 === 0 ? P.광장A : P.광장B;
      g.fillRect(px(tx), px(ty), TILE, TILE);
    }
  }
  g.strokeStyle = P.유리금속;
  g.lineWidth = 1;
  g.strokeRect(px(PLAZA.x0) + 0.5, px(PLAZA.y0) + 0.5, px(PLAZA.x1 - PLAZA.x0 + 1) - 1, px(PLAZA.y1 - PLAZA.y0 + 1) - 1);
  /* 유도선 — 광장→접수 */
  g.fillStyle = P.도로차선;
  for (let ty = 26; ty > 18; ty -= 2) g.fillRect(px(7) + 7, px(ty), 2, 8);

  /* 데이터 스트림 수로 — 2단 물결 + 1px 물빛 가장자리 */
  const cx0 = px(CANAL.x0);
  const cw = px(CANAL.x1 - CANAL.x0 + 1);
  const cy0 = px(CANAL.top);
  const chh = px(CANAL.bottom - CANAL.top + 1);
  g.fillStyle = P.보조실버;
  g.fillRect(cx0, cy0 - 3, cw, 3);
  g.fillRect(cx0, cy0 + chh, cw, 3);
  g.fillStyle = 물A;
  g.fillRect(cx0, cy0, cw, chh);
  const ripple = reduced ? 0 : Math.floor(clock / 460) % 3;
  for (let ty = CANAL.top; ty <= CANAL.bottom; ty++) {
    for (let tx = CANAL.x0; tx <= CANAL.x1; tx++) {
      const m = (tx + ty * 2 + ripple) % 3;
      if (m === 0) {
        g.fillStyle = 물B;
        g.fillRect(px(tx) + 2, px(ty) + 5, 11, 3);
      } else if (m === 1) {
        g.fillStyle = 물빛;
        g.fillRect(px(tx) + 5, px(ty) + 10, 8, 2);
      }
    }
  }
  g.fillStyle = 물빛;
  g.fillRect(cx0, cy0, cw, 1);
  g.fillStyle = mix(물B, 잉크, 0.12);
  g.fillRect(cx0, cy0 + chh - 1, cw, 1);

  /* 수로 위 다리 — 지면 레이어 */
  for (const d of BRIDGES) drawBridge(g, d);

  /* 상단 난간 — 예전 4px 외벽 대신. 원경이 지평선으로 보인다 */
  g.fillStyle = P.보도;
  g.fillRect(0, px(3) + 9, W, 7);
  g.fillStyle = 금속어둠;
  for (let tx = 0; tx < WORLD.w; tx += 2) g.fillRect(px(tx) + 3, px(3) + 3, 3, 9);
  g.fillStyle = P.보조실버;
  g.fillRect(0, px(3) + 3, W, 3);
  g.fillStyle = 보도어둠;
  g.fillRect(0, px(3) + 12, W, 2);

  /* 도시 외곽 벽 — 좌·우·하 (상단은 난간이 대신한다) */
  g.fillStyle = P.벽테두리;
  g.fillRect(0, H - 4, W, 4);
  g.fillRect(0, px(3), 4, H - px(3));
  g.fillRect(W - 4, px(3), 4, H - px(3));
}

function drawBridge(g: CanvasRenderingContext2D, d: Decor) {
  const x = px(d.x);
  const y = px(d.y);
  const w = px(d.w ?? 1);
  const h = px(d.h ?? 1);
  g.fillStyle = 목재밝음;
  g.fillRect(x, y, w, h);
  g.fillStyle = 목재어둠;
  for (let sx = x + 5; sx < x + w; sx += 6) g.fillRect(sx, y, 1, h);
  g.fillStyle = P.보조실버;
  g.fillRect(x, y - 1, w, 3);
  g.fillRect(x, y + h - 2, w, 3);
  g.fillStyle = 금속어둠;
  for (let sx = x + 3; sx < x + w - 2; sx += 11) {
    g.fillRect(sx, y - 5, 2, 5);
    g.fillRect(sx, y + h, 2, 5);
  }
}

/* ── 장식 스프라이트 — 전부 평면 픽셀. 그림자는 우·하 ── */
function drawDecor(g: CanvasRenderingContext2D, d: Decor, clock: number, reduced: boolean) {
  const cx = px(d.x) + 8;
  const by = px(d.y) + 15;
  switch (d.kind) {
    case "tree": {
      g.fillStyle = 그림자;
      g.fillRect(cx - 2, by - 2, 13, 4);
      g.fillStyle = 목재어둠;
      g.fillRect(cx - 2, by - 9, 4, 9);
      g.fillStyle = 잎A;
      g.fillRect(cx - 8, by - 22, 15, 13);
      g.fillRect(cx - 5, by - 25, 9, 4);
      g.fillStyle = 잎B;
      g.fillRect(cx + 1, by - 18, 6, 9);
      g.fillRect(cx - 8, by - 11, 15, 2);
      g.fillStyle = 잎어둠;
      g.fillRect(cx + 3, by - 12, 4, 3);
      break;
    }
    case "bush": {
      g.fillStyle = 그림자;
      g.fillRect(cx - 3, by - 1, 12, 3);
      g.fillStyle = 잎A;
      g.fillRect(cx - 7, by - 9, 13, 9);
      g.fillStyle = 잎B;
      g.fillRect(cx, by - 6, 6, 6);
      g.fillRect(cx - 7, by - 2, 13, 2);
      break;
    }
    case "flowerbed": {
      g.fillStyle = 그림자;
      g.fillRect(cx - 5, by, 15, 3);
      g.fillStyle = 흙;
      g.fillRect(cx - 8, by - 5, 15, 5);
      g.fillStyle = 잎B;
      g.fillRect(cx - 8, by - 8, 15, 3);
      g.fillStyle = P.오류;
      g.fillRect(cx - 6, by - 11, 3, 3);
      g.fillStyle = P.경고;
      g.fillRect(cx - 1, by - 12, 3, 3);
      g.fillStyle = P.인터랙션;
      g.fillRect(cx + 4, by - 10, 3, 3);
      break;
    }
    case "bench": {
      g.fillStyle = 그림자;
      g.fillRect(cx - 5, by - 1, 16, 3);
      g.fillStyle = P.목재;
      g.fillRect(cx - 8, by - 7, 16, 4);
      g.fillStyle = 목재밝음;
      g.fillRect(cx - 8, by - 12, 16, 3);
      g.fillStyle = 목재어둠;
      g.fillRect(cx - 8, by - 4, 16, 1);
      g.fillStyle = P.벽테두리;
      g.fillRect(cx - 7, by - 3, 2, 4);
      g.fillRect(cx + 5, by - 3, 2, 4);
      break;
    }
    case "lamp": {
      const on = !reduced;
      if (on) {
        g.fillStyle = "rgba(255, 206, 120, 0.16)";
        g.beginPath();
        g.arc(cx, by - 26, 8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 그림자;
      g.fillRect(cx - 1, by - 1, 10, 3);
      g.fillStyle = 금속어둠;
      g.fillRect(cx - 2, by - 26, 3, 26);
      g.fillRect(cx - 4, by - 2, 7, 2);
      g.fillStyle = P.벽테두리;
      g.fillRect(cx - 6, by - 32, 11, 4);
      g.fillStyle = on ? 따뜻한창 : 따뜻한창약;
      g.fillRect(cx - 5, by - 28, 9, 3);
      break;
    }
    case "sign": {
      const no = SIGN_NO.get(d.x + "," + d.y) ?? 1;
      g.fillStyle = 그림자;
      g.fillRect(cx - 1, by - 1, 10, 3);
      g.fillStyle = 금속어둠;
      g.fillRect(cx - 1, by - 14, 3, 14);
      g.fillStyle = 흰;
      g.fillRect(cx - 8, by - 26, 17, 13);
      g.strokeStyle = P.벽테두리;
      g.lineWidth = 1;
      g.strokeRect(cx - 7.5, by - 25.5, 16, 12);
      g.fillStyle = 안내판색[(no - 1) % 안내판색.length];
      g.fillRect(cx - 5, by - 23, 6, 6);
      g.fillStyle = P.보조실버;
      g.fillRect(cx + 3, by - 22, 4, 2);
      g.fillRect(cx + 3, by - 19, 4, 2);
      break;
    }
    case "bollard": {
      g.fillStyle = 그림자;
      g.fillRect(cx - 1, by - 1, 8, 3);
      g.fillStyle = 금속어둠;
      g.fillRect(cx - 3, by - 11, 5, 11);
      g.fillStyle = P.보조실버;
      g.fillRect(cx - 3, by - 12, 5, 2);
      break;
    }
    case "board":
    case "kiosk": {
      const small = d.kind === "kiosk";
      const bw = small ? 14 : 18;
      const bh = small ? 12 : 15;
      g.fillStyle = 그림자;
      g.fillRect(cx - 3, by - 1, bw, 3);
      g.fillStyle = 금속어둠;
      g.fillRect(cx - 2, by - 8, 3, 8);
      g.fillStyle = 화면;
      g.fillRect(cx - bw / 2, by - 8 - bh, bw, bh);
      const flick = reduced ? 2 : Math.floor(clock / 320 + d.x) % 4;
      for (let r = 0; r < 3; r++) {
        g.fillStyle = r === flick % 3 ? P.인터랙션 : P.유리금속;
        g.fillRect(cx - bw / 2 + 3, by - 5 - bh + r * 4, bw - 6, 2);
      }
      break;
    }
    case "bridge":
      drawBridge(g, d);
      break;
  }
}

/* ── 건물 (컷어웨이) ── */
function drawFloor(
  g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  t: Tone, kind: "carpet" | "tile" | "stone",
) {
  g.fillStyle = t.floorA;
  g.fillRect(x, y, w, h);
  g.fillStyle = t.floorB;
  if (kind === "carpet") {
    for (let sy = y + 8; sy < y + h; sy += 14) g.fillRect(x + 2, sy, w - 4, 2);
  } else if (kind === "tile") {
    let row = 0;
    for (let sy = y; sy < y + h; sy += TILE, row++) {
      for (let sx = x + (row % 2 ? TILE : 0); sx < x + w; sx += TILE * 2) {
        g.fillRect(sx, sy, Math.min(TILE, x + w - sx), Math.min(TILE, y + h - sy));
      }
    }
  } else {
    for (let sy = y; sy < y + h; sy += 13) g.fillRect(x, sy, w, 1);
    for (let sx = x; sx < x + w; sx += 26) g.fillRect(sx, y, 1, h);
  }
}

/** 지원 시설 설비 — 상태등 없음. 실루엣이 그 시설이 여는 화면을 말한다 */
function drawSupportProps(g: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number, floorY: number) {
  const rx = x + w - 46;
  /* 하단 띠 시설(y42–44)은 바닥이 얕다 — footprint 안으로 끌어올린다 */
  const fy = Math.min(floorY + 34, y + h - 12);
  switch (b.id) {
    case "lounge": // 대기 라운지 — 대기 의자 줄
      for (let i = 0; i < 3; i++) {
        g.fillStyle = P.목재;
        g.fillRect(rx + i * 14, fy, 11, 4);
        g.fillStyle = P.벽테두리;
        g.fillRect(rx + i * 14, fy + 4, 2, 3);
        g.fillRect(rx + i * 14 + 9, fy + 4, 2, 3);
      }
      break;
    case "vault": // 개인정보 금고 — 다이얼 달린 금고문
      g.fillStyle = 화면;
      g.fillRect(rx + 8, fy - 14, 22, 20);
      g.strokeStyle = P.보조실버;
      g.lineWidth = 1;
      g.strokeRect(rx + 8.5, fy - 13.5, 21, 19);
      g.fillStyle = P.보조실버;
      g.fillRect(rx + 16, fy - 7, 6, 6);
      break;
    case "simroom": // 시뮬레이션 — 재생 삼각형 화면
      g.fillStyle = 화면;
      g.fillRect(rx + 6, fy - 12, 26, 18);
      g.fillStyle = P.인터랙션;
      for (let i = 0; i < 5; i++) g.fillRect(rx + 16, fy - 8 + i, 2 + i, 1);
      for (let i = 0; i < 4; i++) g.fillRect(rx + 16, fy - 3 + i, 6 - i, 1);
      break;
    case "skillinfo": // 검사 항목 — 체크리스트 보드
      g.fillStyle = 흰;
      g.fillRect(rx + 8, fy - 12, 22, 18);
      g.strokeStyle = P.벽테두리;
      g.lineWidth = 1;
      g.strokeRect(rx + 8.5, fy - 11.5, 21, 17);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = P.성공;
        g.fillRect(rx + 11, fy - 8 + i * 5, 3, 3);
        g.fillStyle = P.보조실버;
        g.fillRect(rx + 16, fy - 7 + i * 5, 11, 2);
      }
      break;
    case "library": // 도서관 — 서가 3단
      for (let i = 0; i < 3; i++) {
        g.fillStyle = 목재어둠;
        g.fillRect(rx + i * 13, fy - 16, 11, 22);
        for (let r = 0; r < 3; r++) {
          g.fillStyle = r % 2 ? P.밝은면 : P.보조실버;
          g.fillRect(rx + i * 13 + 2, fy - 14 + r * 7, 7, 5);
        }
      }
      break;
    case "lawsearch": // 조문 검색 — 책 위 돋보기
      g.fillStyle = 흰;
      g.fillRect(rx + 8, fy - 4, 24, 10);
      g.fillStyle = P.보조실버;
      g.fillRect(rx + 19, fy - 4, 2, 10);
      g.strokeStyle = P.어두운글자;
      g.lineWidth = 1;
      g.strokeRect(rx + 14.5, fy - 14.5, 9, 9);
      g.fillStyle = P.어두운글자;
      g.fillRect(rx + 23, fy - 5, 3, 4);
      break;
    case "explainroom": // 설명 가능성 — 관계 그래프
      g.fillStyle = P.인터랙션;
      g.fillRect(rx + 8, fy - 12, 4, 4);
      g.fillRect(rx + 24, fy - 16, 4, 4);
      g.fillRect(rx + 18, fy - 2, 4, 4);
      g.strokeStyle = P.유리금속;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rx + 10, fy - 10);
      g.lineTo(rx + 26, fy - 14);
      g.lineTo(rx + 20, fy);
      g.closePath();
      g.stroke();
      break;
    case "archive2": // 감사 기록 — 서류 상자 더미
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? 목재밝음 : P.목재;
        g.fillRect(rx + 8 + (i % 2) * 3, fy - 4 - i * 7, 22, 7);
        g.fillStyle = 목재어둠;
        g.fillRect(rx + 8 + (i % 2) * 3, fy - 4 - i * 7 + 3, 22, 1);
      }
      break;
    case "dispatch": // 발송센터 — 컨베이어 위 소포
      g.fillStyle = 금속어둠;
      g.fillRect(rx + 4, fy, 34, 5);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = P.보조실버;
        g.fillRect(rx + 7 + i * 9, fy + 5, 2, 3);
      }
      g.fillStyle = P.목재;
      g.fillRect(rx + 12, fy - 9, 12, 9);
      g.fillStyle = P.인터랙션;
      g.fillRect(rx + 17, fy - 9, 2, 9);
      break;
    case "approvaldesk": // 승인 안내 — 데스크 + 도장
      g.fillStyle = P.목재;
      g.fillRect(rx + 4, fy - 4, 32, 9);
      g.fillStyle = 목재어둠;
      g.fillRect(rx + 4, fy + 1, 32, 2);
      g.fillStyle = P.경고;
      g.fillRect(rx + 26, fy - 11, 7, 5);
      g.fillStyle = P.어두운글자;
      g.fillRect(rx + 28, fy - 6, 3, 3);
      break;
    case "monitortower": // 모니터링 타워 — 안테나 + 접시
      g.fillStyle = 금속어둠;
      g.fillRect(x + w - 22, y - 16, 3, 18);
      g.fillStyle = P.유리금속;
      g.fillRect(x + w - 28, y - 18, 15, 3);
      g.fillRect(x + w - 26, y - 12, 9, 3);
      g.fillStyle = 화면;
      g.fillRect(rx + 8, fy - 8, 26, 14);
      g.fillStyle = P.성공;
      for (let i = 0; i < 4; i++) g.fillRect(rx + 11 + i * 6, fy - 5 + (i % 2) * 3, 4, 3);
      break;
    case "orgoffice": // 역할 분담 — 조직도
      g.fillStyle = P.인터랙션;
      g.fillRect(rx + 16, fy - 16, 8, 5);
      g.fillStyle = P.보조실버;
      g.fillRect(rx + 6, fy - 5, 8, 5);
      g.fillRect(rx + 16, fy - 5, 8, 5);
      g.fillRect(rx + 26, fy - 5, 8, 5);
      g.strokeStyle = P.유리금속;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rx + 20, fy - 11);
      g.lineTo(rx + 20, fy - 8);
      g.moveTo(rx + 10, fy - 8);
      g.lineTo(rx + 30, fy - 8);
      g.stroke();
      break;
    default:
      break;
  }
}

/** 핵심 건물 설비 — 실루엣이 업무를 말한다. 간판 자리를 피해 바닥·처마에 놓는다 */
function drawCoreProps(
  g: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number,
  floorY: number, dx: number, dw: number, p: OfficeCanvasProps, blink: boolean, anyRun: boolean, anyBlock: boolean,
) {
  const rx = x + w - 78;
  const fy = floorY + 46;
  switch (b.id) {
    case "reception": {
      /* 차양 — 로비 입구 (문 위 낮은 벽) */
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 === 0 ? P.핵심파랑 : 흰;
        g.fillRect(dx - 4 + i * 6, y + h - 13, 6, 5);
      }
      /* 접수 데스크 + 번호표 기계 */
      g.fillStyle = P.목재;
      g.fillRect(rx, fy, 56, 10);
      g.fillStyle = 목재어둠;
      g.fillRect(rx, fy + 10, 56, 3);
      g.fillStyle = P.인터랙션;
      g.fillRect(rx + 60, fy - 8, 9, 18);
      g.fillStyle = 흰;
      g.fillRect(rx + 62, fy - 6, 5, 5);
      break;
    }
    case "routing": {
      /* 안테나 마스트 — 처마 위 */
      g.fillStyle = P.유리금속;
      g.fillRect(x + w - 18, y - 11, 3, 12);
      g.fillStyle = anyRun && blink ? P.핵심파랑 : P.보조실버;
      g.fillRect(x + w - 21, y - 14, 9, 4);
      /* 관제 전광판 */
      g.fillStyle = 화면;
      g.fillRect(rx, fy - 10, 62, 22);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i === 0 && anyRun && blink ? P.인터랙션 : P.유리금속;
        g.fillRect(rx + 5 + i * 11, fy - 5, 8, 5);
        g.fillStyle = P.보조실버;
        g.fillRect(rx + 5 + i * 11, fy + 3, 8, 2);
      }
      break;
    }
    case "extraction": {
      /* 문서 스캐너 투입구 */
      g.fillStyle = 화면;
      g.fillRect(rx, fy - 4, 34, 14);
      g.fillStyle = anyRun && blink ? P.핵심파랑 : P.유리금속;
      g.fillRect(rx + 3, fy, 28, 2);
      /* 문서 분류 트레이 */
      g.fillStyle = P.유리금속;
      g.fillRect(rx + 42, fy - 6, 20, 18);
      for (let r = 0; r < 3; r++) {
        g.fillStyle = P.밝은면;
        g.fillRect(rx + 45, fy - 2 + r * 5, 14 - r * 3, 3);
      }
      break;
    }
    case "judgment": {
      /* 금고 문 + 창살 — 모델 금지구역 */
      g.fillStyle = P.어두운글자;
      g.fillRect(rx + 10, fy - 12, 30, 26);
      g.strokeStyle = P.보조실버;
      g.lineWidth = 1;
      g.strokeRect(rx + 10.5, fy - 11.5, 29, 25);
      g.fillStyle = P.보조실버;
      g.fillRect(rx + 21, fy - 3, 8, 8);
      g.fillStyle = P.성공;
      g.fillRect(rx + 24, fy - 1, 3, 4);
      g.fillStyle = P.유리금속;
      for (let i = 0; i < 4; i++) g.fillRect(rx + 48 + i * 7, fy - 12, 3, 26);
      break;
    }
    case "guardrail": {
      /* 지붕 경광등 — 차단이면 붉게 */
      g.fillStyle = P.유리금속;
      g.fillRect(x + 12, y - 5, 5, 6);
      g.fillStyle = anyBlock ? (blink ? P.오류 : "#8F3A40") : P.성공;
      g.fillRect(x + 10, y - 9, 9, 5);
      /* 방패 + 점검대 */
      g.fillStyle = P.성공;
      g.fillRect(rx + 20, fy - 8, 16, 13);
      g.fillRect(rx + 23, fy + 5, 10, 6);
      g.fillStyle = 흰;
      g.fillRect(rx + 26, fy - 4, 4, 9);
      break;
    }
    case "ontology": {
      /* 서버 랙 + 관계 점 */
      g.fillStyle = 화면;
      g.fillRect(rx, fy - 14, 20, 30);
      for (let r = 0; r < 5; r++) {
        g.fillStyle = blink && anyRun ? P.인터랙션 : P.유리금속;
        g.fillRect(rx + 3, fy - 11 + r * 6, 13, 3);
      }
      g.fillStyle = P.인터랙션;
      g.fillRect(rx + 32, fy - 4, 5, 5);
      g.fillRect(rx + 48, fy - 12, 5, 5);
      g.fillRect(rx + 42, fy + 8, 5, 5);
      g.strokeStyle = P.유리금속;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rx + 34, fy - 2);
      g.lineTo(rx + 50, fy - 10);
      g.lineTo(rx + 44, fy + 10);
      g.closePath();
      g.stroke();
      break;
    }
    case "answer": {
      /* 이중 모니터 + 프린터 */
      g.fillStyle = 화면;
      g.fillRect(rx + 6, fy - 12, 24, 16);
      g.fillRect(rx + 34, fy - 12, 24, 16);
      g.fillStyle = P.밝은면;
      g.fillRect(rx + 9, fy - 9, 18, 10);
      g.fillRect(rx + 37, fy - 9, 18, 10);
      g.fillStyle = P.유리금속;
      g.fillRect(rx + 16, fy + 8, 34, 10);
      g.fillStyle = 흰;
      g.fillRect(rx + 22, fy + 4, 22, 5);
      break;
    }
    case "bank": {
      /* 창구 카운터 + 승인 도장 */
      g.fillStyle = P.목재;
      g.fillRect(x + 24, fy, w - 60, 12);
      g.fillStyle = 목재어둠;
      g.fillRect(x + 24, fy + 12, w - 60, 3);
      g.fillStyle = P.밝은면;
      g.fillRect(x + 32, fy - 12, w - 76, 10);
      g.strokeStyle = P.보조실버;
      g.lineWidth = 1;
      g.strokeRect(x + 32.5, fy - 11.5, w - 77, 9);
      if (p.gateOpen) {
        g.fillStyle = P.성공;
        g.fillRect(x + w - 40, fy - 14, 11, 11);
        g.fillStyle = P.밝은면;
        g.fillRect(x + w - 37, fy - 11, 5, 5);
      }
      break;
    }
    default:
      break;
  }
  void dw;
}

/** 광장 가구 — 번호표 기계·대기 안내 기둥 (벽 없는 광장) */
function drawPlazaFurniture(g: CanvasRenderingContext2D) {
  const bx = px(PLAZA.x0) + 6;
  const by = px(PLAZA.y0) + 6;
  g.fillStyle = 그림자;
  g.fillRect(bx + 2, by + 18, 12, 4);
  g.fillStyle = P.핵심파랑;
  g.fillRect(bx, by, 10, 18);
  g.fillStyle = 흰;
  g.fillRect(bx + 2, by + 3, 6, 5);
  g.fillStyle = P.어두운글자;
  g.fillRect(bx + 3, by + 11, 4, 2);
  g.fillStyle = P.유리금속;
  for (const sx of [px(PLAZA.x0) + 24, px(PLAZA.x0) + 60, px(PLAZA.x0) + 96]) {
    g.fillRect(sx, by + 4, 3, 12);
    g.fillRect(sx - 1, by + 2, 5, 3);
  }
  g.fillStyle = P.보조실버;
  g.fillRect(px(PLAZA.x0) + 27, by + 6, 69, 2);
  /* 화단 두 줄 + 대기 유도 바닥선 — 빈 광장을 채운다 (상태 없음) */
  for (const [tx, ty] of [[3, 42], [11, 42], [3, 26], [11, 26]]) {
    const fx = px(tx) + 8;
    const fy = px(ty) + 14;
    g.fillStyle = 그림자;
    g.fillRect(fx - 4, fy, 17, 3);
    g.fillStyle = 흙;
    g.fillRect(fx - 8, fy - 6, 17, 6);
    g.fillStyle = 잎B;
    g.fillRect(fx - 8, fy - 9, 17, 3);
    g.fillStyle = P.경고;
    g.fillRect(fx - 5, fy - 12, 3, 3);
    g.fillStyle = P.오류;
    g.fillRect(fx + 3, fy - 12, 3, 3);
  }
  g.fillStyle = P.유리금속;
  for (let ty = PLAZA.y0 + 4; ty < PLAZA.y1; ty += 4) g.fillRect(px(PLAZA.x0) + 24, px(ty), px(7), 1);
}

function drawBuilding(
  g: CanvasRenderingContext2D, b: Building, p: OfficeCanvasProps,
  blink: boolean, clock: number, spark: number | undefined,
) {
  const sel = p.selectedBuilding === b.id;
  const lift = sel ? -3 : 0;
  const x = px(b.x0);
  const y = px(b.y0) + lift;
  const w = px(b.x1 - b.x0 + 1);
  const h = px(b.y1 - b.y0 + 1);
  const t = TONES[b.id];

  if (b.kind === "plaza") {
    drawPlazaFurniture(g);
    if (sel) {
      g.strokeStyle = 선택색;
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    return;
  }

  const stSts = b.stations.map((s) => p.statuses[s] ?? null);
  const anyRun = stSts.includes("대기") && p.activeStation !== null && b.stations.includes(p.activeStation);
  const anyBlock = stSts.includes("차단") || stSts.includes("중단");
  const allDone = b.stations.length > 0 && stSts.every((s) => s === "완료");
  const wallH = b.wallH;
  const floorY = y + wallH;
  const floorH = h - wallH;
  const dw = 26;
  const dx = px(b.doorX) + 8 - dw / 2;

  /* 바닥 + 벽이 바닥에 드리우는 그늘 (광원 좌상단) */
  drawFloor(g, x, floorY, w, floorH, t, FLOOR_KIND[b.id]);
  g.fillStyle = "rgba(15, 42, 76, 0.09)";
  g.fillRect(x, floorY, w, 8);
  g.fillStyle = "rgba(15, 42, 76, 0.06)";
  g.fillRect(x + 6, floorY + 8, 6, floorH - 8);

  /* 뒷벽(북) — 키 큰 안쪽 면 + 처마 하이라이트 */
  g.fillStyle = t.wall;
  g.fillRect(x, y, w, wallH);
  g.fillStyle = t.cornice;
  g.fillRect(x, y, w, 3);
  g.fillStyle = t.corniceLine;
  g.fillRect(x, y + 3, w, 1);
  g.fillStyle = t.wallDim;
  g.fillRect(x, y + wallH - 3, w, 3);

  /* 서벽 — 6px 어두운 안쪽 면 */
  g.fillStyle = t.west;
  g.fillRect(x, floorY, 6, floorH);
  g.fillStyle = t.westEdge;
  g.fillRect(x + 6, floorY, 1, floorH);

  /* 동·남 낮은 난간 — 컷어웨이. 안의 에이전트가 보인다 */
  g.fillStyle = t.ledge;
  g.fillRect(x + w - 5, floorY, 5, floorH);
  g.fillStyle = t.ledgeTop;
  g.fillRect(x + w - 5, floorY, 5, 2);
  g.fillStyle = t.ledge;
  g.fillRect(x, y + h - 6, w, 6);
  g.fillStyle = t.ledgeTop;
  g.fillRect(x, y + h - 6, w, 2);

  g.strokeStyle = P.벽테두리;
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);

  if (b.kind === "core") {
    /* 간판 자리 — HTML 라벨이 여기 앉는다. 창·설비를 넣지 않는다 */
    const pw = Math.min(w - 12, 180);
    g.fillStyle = t.plate;
    g.fillRect(x + 6, y + 4, pw, 34);
    g.strokeStyle = t.plateLine;
    g.lineWidth = 1;
    g.strokeRect(x + 6.5, y + 4.5, pw - 1, 33);
    g.fillStyle = t.cornice;
    g.fillRect(x + 6, y + 4, pw, 1);
  } else {
    /* 지원 시설 — 벽에 따뜻한 창 하나(앰비언트), 바닥에 안내 매트 */
    const lit = (Math.floor(clock / 900) + b.no) % 9 !== 0;
    const wx = x + w - 34;
    const wh = Math.min(13, wallH - 12);
    g.fillStyle = lit ? 따뜻한창 : 따뜻한창약;
    g.fillRect(wx, y + 8, 25, wh);
    g.fillStyle = t.wallDim;
    g.fillRect(wx + 12, y + 8, 2, wh);
    g.strokeStyle = t.corniceLine;
    g.lineWidth = 1;
    g.strokeRect(wx + 0.5, y + 8.5, 24, wh - 1);
    const my = floorY + 2;
    const mh = Math.min(30, y + h - 8 - my);
    if (mh > 0) {
      g.fillStyle = t.mat;
      g.fillRect(x + 4, my, px(b.x1 - b.x0) + 8, mh);
    }
  }

  /* 문 */
  if (b.side === "top") {
    /* 앞(남) 낮은 벽 — 문기둥 + 보도 쪽 매트 */
    g.fillStyle = 화면;
    g.fillRect(dx, y + h - 9, dw, 9);
    g.fillStyle = t.westEdge;
    g.fillRect(dx - 3, y + h - 13, 3, 13);
    g.fillRect(dx + dw, y + h - 13, 3, 13);
    g.fillStyle = P.유리금속;
    g.fillRect(dx, y + h - 3, dw, 2);
    g.fillStyle = 매트;
    g.fillRect(dx - 2, y + h, dw + 4, 6);
  } else {
    /* 뒷벽 면의 문 개구부 — 간판 자리 아래(어두운 직사각형 + 상인방) */
    const oy = y + (b.kind === "core" ? 39 : Math.max(4, wallH - 22));
    const oh = floorY + (b.kind === "core" ? 16 : 4) - oy;
    if (oh > 0) {
      g.fillStyle = 화면;
      g.fillRect(dx, oy, dw, oh);
      g.fillStyle = t.westEdge;
      g.fillRect(dx - 3, oy, 3, oh);
      g.fillRect(dx + dw, oy, 3, oh);
      g.fillStyle = P.유리금속;
      g.fillRect(dx, oy + oh - 3, dw, 3);
      g.fillStyle = 매트;
      g.fillRect(dx - 2, oy + oh, dw + 4, 7);
    }
  }

  /* 스테이션 설비 — 뒷벽 밑단에 붙은 모니터 열. 상태등은 벽면에 */
  if (b.kind === "core") {
    b.stations.forEach((sid, i) => {
      const st = p.statuses[sid] ?? null;
      const mx = x + 14 + i * 48;
      const my = floorY + 6;
      g.fillStyle = P.목재;
      g.fillRect(mx - 5, my + 21, 46, 6);
      g.fillStyle = 목재어둠;
      g.fillRect(mx - 5, my + 27, 46, 2);
      g.fillStyle = 화면;
      g.fillRect(mx, my, 36, 21);
      g.fillStyle = st === "미연결" ? "#CBD5E2" : st === "대기" && blink ? P.인터랙션 : st === "완료" ? "#5FA1E0" : "#D3E4F6";
      g.fillRect(mx + 3, my + 3, 30, 14);
      if (st === "미연결") {
        /* 끊어진 플러그 표식 */
        g.fillStyle = P.보조실버;
        g.fillRect(mx + 11, my + 9, 5, 3);
        g.fillRect(mx + 20, my + 9, 5, 3);
      } else if (st === "대기") {
        g.fillStyle = blink ? 흰 : P.밝은면;
        g.fillRect(mx + 6, my + 6, 18, 2);
        g.fillRect(mx + 6, my + 11, 12, 2);
      }
      /* 상태 표시등 — 벽면(모니터 위) */
      g.fillStyle = lampColor(st, blink);
      g.fillRect(mx + 29, my - 8, 6, 5);
      g.fillStyle = t.corniceLine;
      g.fillRect(mx + 29, my - 3, 6, 1);
    });
    drawCoreProps(g, b, x, y, w, h, floorY, dx, dw, p, blink, anyRun, anyBlock);
    /* 실내 화분 — 상태를 담지 않는 순수 장식. 빈 바닥을 채운다 */
    const potY = y + h - 30;
    for (const cxp of [x + 18, x + w - 36]) {
      g.fillStyle = 그림자;
      g.fillRect(cxp + 2, potY + 14, 14, 4);
      g.fillStyle = 목재어둠;
      g.fillRect(cxp, potY + 7, 11, 8);
      g.fillStyle = 잎A;
      g.fillRect(cxp - 3, potY - 6, 17, 13);
      g.fillStyle = 잎B;
      g.fillRect(cxp + 6, potY - 2, 8, 9);
    }
  } else {
    drawSupportProps(g, b, x, y, w, h, floorY);
  }

  /* 지금 실행 중인 건물 — 강한 브랜드 점등 (1초 안에 보여야 한다) */
  if (anyRun) {
    g.fillStyle = "rgba(0, 110, 218, 0.07)";
    g.fillRect(x + 2, floorY, w - 4, floorH - 2);
    g.strokeStyle = P.핵심파랑;
    g.lineWidth = 3;
    g.strokeRect(x - 3, y - 3, w + 6, h + 6);
    if (blink) {
      g.strokeStyle = "rgba(0, 110, 218, 0.35)";
      g.lineWidth = 6;
      g.strokeRect(x - 7, y - 7, w + 14, h + 14);
    }
  }
  /* 차단된 건물 — 그 구간만 경고색 (도시 전체를 붉히지 않는다) */
  if (anyBlock && !anyRun) {
    g.strokeStyle = blink ? P.오류 : "#8F3A40";
    g.lineWidth = 3;
    g.strokeRect(x - 3, y - 3, w + 6, h + 6);
  }
  if (anyBlock) {
    /* 문 앞 차단 바 */
    const by = b.side === "top" ? y + h + 6 : y - 9;
    g.fillStyle = blink ? P.오류 : "#8F3A40";
    g.fillRect(dx - 6, by, dw + 12, 5);
    g.fillStyle = P.밝은면;
    for (let s = 0; s < 3; s++) g.fillRect(dx + s * 12, by, 5, 5);
  }
  if (allDone) {
    g.fillStyle = P.성공;
    g.fillRect(px(b.doorX) + 6, b.side === "top" ? y + h + 7 : y - 11, 5, 5);
  }
  /* 완료 스파클 — 상태가 완료로 바뀐 시점만 기록해 600ms 동안 (앰비언트) */
  if (spark !== undefined && clock - spark < 600) {
    const k = (clock - spark) / 600;
    const sy = (b.side === "top" ? y + h + 4 : y - 10) - k * 12;
    g.fillStyle = "rgba(20, 125, 114, " + (1 - k).toFixed(2) + ")";
    for (let s = 0; s < 3; s++) g.fillRect(px(b.doorX) + 6 + (s - 1) * 9, sy - s * 3, 3, 3);
  }
  if (sel) {
    g.strokeStyle = 선택색;
    g.lineWidth = 2;
    g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }
}

function drawGate(g: CanvasRenderingContext2D, open: boolean, blink: boolean) {
  const gx = px(EXIT_GATE.x);
  const gy = px(EXIT_GATE.yTop);
  const gh = px(EXIT_GATE.yBottom - EXIT_GATE.yTop + 1);
  g.fillStyle = 그림자;
  g.fillRect(gx - 2, gy + gh, 14, 5);
  /* 게이트 기둥 */
  g.fillStyle = P.유리금속;
  g.fillRect(gx - 6, gy - 10, 10, 10);
  g.fillRect(gx - 6, gy + gh, 10, 10);
  if (open) {
    g.fillStyle = P.도로;
    g.fillRect(gx - 2, gy, px(2), gh);
    g.fillStyle = P.성공;
    g.fillRect(gx - 4, gy - 8, 6, 5);
  } else {
    g.fillStyle = P.유리금속;
    g.fillRect(gx - 2, gy, 8, gh);
    g.fillStyle = P.벽테두리;
    g.fillRect(gx + 1, gy, 2, gh);
    g.fillStyle = P.경고;
    g.fillRect(gx - 1, gy + gh / 2 - 4, 6, 8);
    g.fillStyle = blink ? P.오류 : "#D8A7AB";
    g.fillRect(gx - 4, gy - 8, 6, 5);
  }
}

function drawArchiveDocs(g: CanvasRenderingContext2D, approved: boolean) {
  const x = px(ARCHIVE_SPOT.x) - 6;
  const y = px(ARCHIVE_SPOT.y) - 20;
  g.fillStyle = 그림자;
  g.fillRect(x + 4, y + 16, 22, 4);
  g.fillStyle = 화면;
  g.fillRect(x, y, 22, 16);
  g.strokeStyle = P.유리금속;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, 21, 15);
  g.fillStyle = P.유리금속;
  g.fillRect(x, y + 7, 22, 1);
  if (approved) {
    g.fillStyle = P.밝은면;
    g.fillRect(x + 6, y - 6, 10, 5);
    g.fillStyle = P.성공;
    g.fillRect(x + 8, y - 4, 6, 1);
  }
}

/**
 * 업무 전달 강조 — 직전 완료 스테이션 → 지금 실행 스테이션 사이의 큰길을
 * 밝히고 진행 방향 화살촉을 흘린다. "누가 걷는가"보다 "일이 어디서 어디로
 * 넘어가는가"가 먼저 보여야 한다.
 */
function drawFlowBand(g: CanvasRenderingContext2D, p: OfficeCanvasProps, clock: number) {
  if (!p.activeStation) return;
  const activeSpot = STATION_SPOTS[p.activeStation];
  const activeB = activeSpot ? BUILDINGS.find((b) => b.id === activeSpot.buildingId) : null;
  if (!activeB) return;
  const idx = STATION_IDS.indexOf(p.activeStation);
  let fromX = px(7); // 기본: 광장 입구부터
  for (let i = idx - 1; i >= 0; i--) {
    if (p.statuses[STATION_IDS[i]] === "완료") {
      const b = BUILDINGS.find((bb) => bb.id === STATION_SPOTS[STATION_IDS[i]].buildingId)!;
      fromX = px(b.doorX);
      break;
    }
  }
  const toX = px(activeB.doorX);
  const x0 = Math.min(fromX, toX);
  const x1 = Math.max(fromX, toX);
  g.fillStyle = "rgba(0, 110, 218, 0.14)";
  g.fillRect(x0 - 8, px(STREET.top), x1 - x0 + 16, px(STREET.bottom - STREET.top + 1));
  const shift = p.reducedMotion ? 0 : Math.floor(clock / 120) % 24;
  g.fillStyle = "rgba(0, 110, 218, 0.55)";
  const dir = toX >= fromX ? 1 : -1;
  for (let x = x0 + 8 + shift; x < x1; x += 24) {
    const ax = dir === 1 ? x : x1 - (x - x0);
    g.beginPath();
    g.moveTo(ax, px(STREET_Y) + 2);
    g.lineTo(ax + 5 * dir, px(STREET_Y) + 7);
    g.lineTo(ax, px(STREET_Y) + 12);
    g.closePath();
    g.fill();
  }
}

type PersonOpts = {
  suit: string; hair: string; badge: string;
  state: AgentState | "working"; frame: number; blink: boolean;
  customer?: boolean; bubble?: string; accessory?: PersonAccessory;
  bounce?: number; selected?: boolean;
  /** 이동 중 — 다리 애니메이션만 좌우한다. 상태(state)는 건드리지 않는다 */
  walking?: boolean;
};

/** 픽셀 인물 — 16×24 논리 px. 배지·머리색·장비로 구분, 몸 전체를 원색으로 칠하지 않는다 */
function drawPerson(g: CanvasRenderingContext2D, cx: number, cy: number, o: PersonOpts) {
  const bob = ((o.walking || o.state === "working") && o.frame === 1 ? -1 : 0) + (o.bounce ?? 0);
  const y = cy - 20 + bob;
  /* 그림자 — 광원 좌상단이므로 우·하로 */
  g.fillStyle = "rgba(15, 42, 76, 0.22)";
  g.fillRect(cx - 5, cy + 2, 13, 3);
  if (o.selected) {
    g.strokeStyle = 선택색;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(cx, cy + 3, 10, 4.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  /* 다리 */
  g.fillStyle = "#101A2B";
  g.fillRect(cx - 5, y + 17, 4, 5 - bob);
  g.fillRect(cx + 1, y + 17, 4, 5 - bob);
  /* 몸(수트) */
  g.fillStyle = o.state === "offline" ? "#9AA9BA" : o.suit;
  g.fillRect(cx - 6, y + 8, 12, 9);
  /* 배지 */
  g.fillStyle = o.badge;
  g.fillRect(cx + 2, y + 10, 3, 3);
  /* 머리 */
  g.fillStyle = P.피부;
  g.fillRect(cx - 4, y + 2, 8, 6);
  g.fillStyle = o.hair;
  g.fillRect(cx - 4, y, 8, 3);
  /* 역할 장비 — 작은 픽셀 소품이 실루엣을 가른다 */
  if (o.accessory === "clipboard") {
    g.fillStyle = P.밝은면;
    g.fillRect(cx - 11, y + 9, 5, 7);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx - 10, y + 11, 3, 1);
    g.fillRect(cx - 10, y + 13, 3, 1);
  } else if (o.accessory === "headset") {
    g.fillStyle = P.어두운글자;
    g.fillRect(cx - 5, y + 1, 10, 1);
    g.fillRect(cx + 4, y + 3, 2, 3);
  } else if (o.accessory === "magnifier") {
    g.strokeStyle = P.어두운글자;
    g.lineWidth = 1;
    g.strokeRect(cx + 6.5, y + 8.5, 4, 4);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx + 10, y + 13, 2, 3);
  } else if (o.accessory === "keyboard") {
    g.fillStyle = P.유리금속;
    g.fillRect(cx - 8, y + 15, 16, 3);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx - 6, y + 16, 2, 1);
    g.fillRect(cx - 2, y + 16, 2, 1);
    g.fillRect(cx + 2, y + 16, 2, 1);
  } else if (o.accessory === "shield") {
    g.fillStyle = P.성공;
    g.fillRect(cx - 11, y + 9, 5, 5);
    g.fillRect(cx - 10, y + 14, 3, 2);
  } else if (o.accessory === "graph") {
    g.fillStyle = P.핵심파랑;
    g.fillRect(cx + 7, y + 8, 2, 2);
    g.fillRect(cx + 11, y + 11, 2, 2);
    g.fillRect(cx + 8, y + 14, 2, 2);
    g.strokeStyle = P.유리금속;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx + 8, y + 9);
    g.lineTo(cx + 12, y + 12);
    g.lineTo(cx + 9, y + 15);
    g.stroke();
  } else if (o.accessory === "pen") {
    g.fillStyle = P.경고;
    g.fillRect(cx + 7, y + 9, 2, 6);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx + 7, y + 15, 2, 2);
  } else if (o.accessory === "speech") {
    g.fillStyle = P.밝은면;
    g.fillRect(cx - 12, y + 8, 6, 4);
    g.fillRect(cx + 7, y + 12, 6, 4);
    g.strokeStyle = P.어두운글자;
    g.lineWidth = 1;
    g.strokeRect(cx - 12.5, y + 7.5, 7, 5);
    g.strokeRect(cx + 6.5, y + 11.5, 7, 5);
  } else if (o.accessory === "stamp") {
    g.fillStyle = P.경고;
    g.fillRect(cx + 7, y + 10, 4, 3);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx + 8, y + 13, 2, 3);
  } else if (o.accessory === "box") {
    g.fillStyle = P.목재;
    g.fillRect(cx - 12, y + 10, 7, 6);
    g.fillStyle = P.벽테두리;
    g.fillRect(cx - 12, y + 12, 7, 1);
  }

  /* 상태 오버레이 */
  if (o.state === "validating") {
    /* 손에 든 검토 문서 */
    g.fillStyle = P.밝은면;
    g.fillRect(cx + 6, y + 9, 6, 8);
    g.fillStyle = P.어두운글자;
    g.fillRect(cx + 7, y + 11, 4, 1);
    g.fillRect(cx + 7, y + 13, 4, 1);
  }
  if (o.state === "completed" && !o.customer) {
    g.fillStyle = P.성공;
    g.fillRect(cx + 5, y - 2, 4, 4);
  }
  if (o.selected) {
    /* 머리 위 작은 꺾쇠 */
    g.fillStyle = 선택색;
    g.fillRect(cx - 3, y - 8, 7, 2);
    g.fillRect(cx - 2, y - 6, 5, 2);
    g.fillRect(cx - 1, y - 4, 3, 2);
  }
  const bubble = o.bubble ?? (o.state === "blocked" ? "!" : o.state === "waiting" ? "…" : null);
  if (bubble && o.blink) {
    const bw = bubble === "…" ? 14 : 8;
    g.fillStyle = P.밝은면;
    g.fillRect(cx - bw / 2, y - 12, bw, 9);
    g.fillStyle = o.state === "blocked" ? P.오류 : P.어두운글자;
    if (bubble === "!") {
      g.fillRect(cx - 1, y - 10, 2, 4);
      g.fillRect(cx - 1, y - 5, 2, 1);
    } else {
      for (let d = 0; d < 3; d++) g.fillRect(cx - 5 + d * 4, y - 8, 2, 2);
    }
  }
}

/** 건물 안에서만 움직이는 L자 경로 — 벽을 통과하지 않는다(큰길로 나가지 않는다) */
function insidePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const out: { x: number; y: number }[] = [];
  if (from.x !== to.x) out.push({ x: to.x, y: from.y });
  out.push({ x: to.x, y: to.y });
  return out;
}

export function OfficeCanvas(props: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const animRef = useRef({
    clock: 0,
    last: 0,
    lastDraw: -1e9,
    dirty: true,
    customer: { pos: { x: px(QUEUE_SPOTS[0].x) + 8, y: px(QUEUE_SPOTS[0].y) + 8 }, path: [], last: "queued" } as Mover,
    doc: { pos: { x: px(8) + 8, y: px(18) + 8 }, path: [], last: "" } as Mover,
    agents: {} as Record<string, Mover>,
    /** 스테이션 상태 전이 관측 — 상태를 지어내지 않고 "바뀐 시점"만 기록한다 */
    prevStatus: {} as Record<string, string>,
    sparks: {} as Record<string, number>,
    raf: 0 as number,
    running: false,
    /** 루프 재시작 훅 — visibilitychange 핸들러가 쓴다 */
    wake: null as null | (() => void),
  });

  /* 목적지가 바뀌면 큰길 경유 경로를 계산한다 — 순간이동은 reduced-motion 전용 */
  function retarget(m: Mover, destKey: string, tile: { x: number; y: number }, reduced: boolean) {
    if (m.last === destKey) return;
    m.last = destKey;
    const fromTile = { x: Math.round((m.pos.x - 8) / TILE), y: Math.round((m.pos.y - 8) / TILE) };
    if (reduced) {
      m.pos = { x: px(tile.x) + 8, y: px(tile.y) + 8 };
      m.path = [];
      return;
    }
    m.path = walkPath(fromTile, tile).map((pt) => ({ x: px(pt.x) + 8, y: px(pt.y) + 8 }));
  }

  /** 역할 에이전트 — working이면 문 안쪽으로, 아니면 자기 자리로. 건물 안에서만 걷는다 */
  function retargetAgents(p: OfficeCanvasProps, a: typeof animRef.current) {
    for (const id of STATION_IDS) {
      const home = STATION_SPOTS[id];
      let m = a.agents[id];
      if (!m) {
        m = { pos: { x: px(home.x) + 8, y: px(home.y) + 8 }, path: [], last: "home" };
        a.agents[id] = m;
      }
      const atDoor = p.agents[id] === "working";
      const key = atDoor ? "door" : "home";
      if (m.last === key) continue;
      m.last = key;
      const to = atDoor ? AGENT_DOOR[id] : home;
      if (p.reducedMotion) {
        m.pos = { x: px(to.x) + 8, y: px(to.y) + 8 };
        m.path = [];
        continue;
      }
      const from = { x: Math.round((m.pos.x - 8) / TILE), y: Math.round((m.pos.y - 8) / TILE) };
      m.path = insidePath(from, to).map((pt) => ({ x: px(pt.x) + 8, y: px(pt.y) + 8 }));
    }
  }

  function stepMover(m: Mover, dt: number) {
    if (!m.path.length) return false;
    const next = m.path[0];
    const dx = next.x - m.pos.x;
    const dy = next.y - m.pos.y;
    const dist = Math.hypot(dx, dy);
    const move = (걸음속도 * dt) / 1000;
    if (dist <= move) {
      m.pos = { ...next };
      m.path.shift();
    } else {
      m.pos = { x: m.pos.x + (dx / dist) * move, y: m.pos.y + (dy / dist) * move };
    }
    return true;
  }

  /* ── 그리기 ── */
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = propsRef.current;
    const a = animRef.current;
    const dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const bw = Math.max(1, Math.round(p.cssSize.w * dpr));
    const bh = Math.max(1, Math.round(p.cssSize.h * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = P.심층배경;
    g.fillRect(0, 0, bw, bh);

    /* 1. 원경 패럴랙스 — 화면 좌표계 (월드 변환 전) */
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFar(g, p.camera, p.cssSize.w);

    /* 2. 월드 */
    g.setTransform(dpr * p.camera.scale, 0, 0, dpr * p.camera.scale, dpr * p.camera.tx, dpr * p.camera.ty);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();

    const blink = p.reducedMotion ? true : Math.floor(a.clock / 420) % 2 === 0;
    const frame = p.reducedMotion ? 0 : Math.floor(a.clock / 300) % 2;
    const bouncePhase = p.reducedMotion ? -1 : Math.floor(a.clock / 600);

    drawGround(g, a.clock, p.reducedMotion);

    /* 접지 그림자 — 건물 **전에** 지면에 깐다 (광원 좌상단) */
    g.fillStyle = 그림자;
    for (const b of BUILDINGS) {
      if (b.kind === "plaza") continue;
      const sel = p.selectedBuilding === b.id;
      g.fillRect(
        px(b.x0) + 6, px(b.y0) + (sel ? 9 : 6),
        px(b.x1 - b.x0 + 1), px(b.y1 - b.y0 + 1) + (sel ? 3 : 0),
      );
    }

    for (const b of BUILDINGS) drawBuilding(g, b, p, blink, a.clock, a.sparks[b.id]);
    drawFlowBand(g, p, a.clock);

    /* y정렬 스프라이트 — painter's algorithm (장식은 미리 정렬해 둔 정적 배열) */
    const dyn: Sprite[] = [];
    const pos: Record<string, [number, number]> = {};

    for (const id of STATION_IDS) {
      const m = a.agents[id] ?? { pos: { x: px(STATION_SPOTS[id].x) + 8, y: px(STATION_SPOTS[id].y) + 8 } } as Mover;
      const state = p.agents[id] ?? "idle";
      const walking = (a.agents[id]?.path.length ?? 0) > 0;
      const bounce = bouncePhase >= 0 && !walking && (state === "idle" || state === "ready" || state === "completed")
        ? ((bouncePhase + HASH[id]) % 2 === 0 ? -1 : 0)
        : 0;
      const cx = Math.round(m.pos.x);
      const cy = Math.round(m.pos.y);
      pos[id] = [cx, cy];
      dyn.push({
        y: cy,
        f: () => drawPerson(g, cx, cy, {
          suit: "#2E4E74", hair: HAIRS[id] ?? "#2c3e57", badge: BADGES[id] ?? P.인터랙션,
          state, frame, blink, accessory: ACCESSORY[id],
          walking, bounce, selected: p.selectedAgent === id,
        }),
      });
    }
    {
      const cx = px(COUNSELOR_SPOT.x) + 8;
      const cy = px(COUNSELOR_SPOT.y) + 8;
      const state = p.agents.counselor ?? "idle";
      const bounce = bouncePhase >= 0 && (state === "idle" || state === "completed")
        ? ((bouncePhase + HASH.counselor) % 2 === 0 ? -1 : 0)
        : 0;
      pos.counselor = [cx, cy];
      dyn.push({
        y: cy,
        f: () => drawPerson(g, cx, cy, {
          suit: "#3a3348", hair: "#1c2940", badge: P.경고,
          state, frame, blink, accessory: "stamp", bounce, selected: p.selectedAgent === "counselor",
        }),
      });
    }
    {
      const cx = px(ARCHIVE_SPOT.x) + 8;
      const cy = px(ARCHIVE_SPOT.y) + 8;
      const state = p.agents.records ?? "idle";
      const bounce = bouncePhase >= 0 && state !== "working"
        ? ((bouncePhase + HASH.records) % 2 === 0 ? -1 : 0)
        : 0;
      pos.records = [cx, cy];
      dyn.push({ y: px(ARCHIVE_SPOT.y) - 4, f: () => drawArchiveDocs(g, p.gateOpen) });
      dyn.push({
        y: cy,
        f: () => drawPerson(g, cx, cy, {
          suit: "#56718F", hair: "#4b5a70", badge: P.보조실버,
          state, frame, blink, accessory: "box", bounce, selected: p.selectedAgent === "records",
        }),
      });
    }

    /* 대기열 고객 — 실제 케이스만큼, 상담 유형(kind)이 옷 색이다 (장식 NPC 금지) */
    for (let i = 0; i < Math.min(p.queue.length, QUEUE_SPOTS.length); i++) {
      const q = QUEUE_SPOTS[i];
      const kind = p.queue[i].kind;
      const cx = px(q.x) + 8;
      const cy = px(q.y) + 8;
      dyn.push({
        y: cy,
        f: () => drawPerson(g, cx, cy, {
          suit: kind === "departure" ? "#2E5E8F" : kind === "payslip" ? "#2F6E62" : "#5A6B7E",
          hair: CUSTOMER_HAIRS[i % CUSTOMER_HAIRS.length], badge: P.보조실버,
          state: "idle", frame: 0, blink: true, customer: true,
        }),
      });
    }

    /* 활성 고객 */
    let customerPos: [number, number] | null = null;
    if (p.customer && p.customer.state !== "completed") {
      const walking = a.customer.path.length > 0;
      const cx = Math.round(a.customer.pos.x);
      const cy = Math.round(a.customer.pos.y);
      const st = p.customer.state;
      customerPos = [cx, cy];
      dyn.push({
        y: cy,
        f: () => drawPerson(g, cx, cy, {
          suit: "#2b5d8f", hair: "#101A2B", badge: P.인터랙션,
          state: st === "blocked" ? "blocked" : "waiting",
          frame, blink, customer: true, walking,
          /* 말풍선은 실제 여정 상태에서만 — ""는 기본 말풍선을 끄는 값 */
          bubble: st === "blocked" ? "!" : st === "waiting-for-approval" ? "…" : "",
        }),
      });
    }

    /* 문서 패킷 — 케이스 서류. 이동 중엔 잔상 점으로 전달 방향이 보인다 */
    let docPos: [number, number] | null = null;
    if (p.docTarget) {
      const moving = a.doc.path.length > 0;
      const dx = Math.round(a.doc.pos.x);
      const dy = Math.round(a.doc.pos.y) + (moving && !p.reducedMotion ? (frame ? -2 : 0) : 0);
      const next = moving ? a.doc.path[0] : null;
      const vx = next ? Math.sign(next.x - a.doc.pos.x) : 0;
      const vy = next ? Math.sign(next.y - a.doc.pos.y) : 0;
      docPos = [dx, Math.round(a.doc.pos.y)];
      dyn.push({
        y: dy,
        f: () => {
          if (next && !p.reducedMotion) {
            for (let t = 1; t <= 3; t++) {
              g.fillStyle = "rgba(0, 110, 218, " + (0.32 - t * 0.09).toFixed(2) + ")";
              g.fillRect(dx - vx * t * 7 - 2, dy - vy * t * 7 - 2, 4, 4);
            }
          }
          g.fillStyle = "rgba(15, 42, 76, 0.2)";
          g.fillRect(dx - 6, dy + 6, 14, 3);
          g.fillStyle = 흰;
          g.fillRect(dx - 7, dy - 6, 14, 11);
          g.fillStyle = P.인터랙션;
          g.fillRect(dx - 7, dy - 6, 14, 3);
          g.fillRect(dx - 1, dy - 3, 2, 6);
          g.strokeStyle = P.어두운글자;
          g.lineWidth = 1;
          g.strokeRect(dx - 7.5, dy - 6.5, 15, 12);
        },
      });
    }

    dyn.push({ y: px(STREET_Y) + 8, f: () => drawGate(g, p.gateOpen, blink) });

    dyn.sort((s1, s2) => s1.y - s2.y);
    let di = 0;
    for (const d of DECOR_SORTED) {
      const dy = px(d.y) + 15;
      while (di < dyn.length && dyn[di].y <= dy) dyn[di++].f();
      drawDecor(g, d, a.clock, p.reducedMotion);
    }
    while (di < dyn.length) dyn[di++].f();

    g.restore();

    /* 텔레메트리 — 실측·추적용 (화면 영향 없음) */
    canvas.dataset.cux = String(Math.round(a.customer.pos.x));
    canvas.dataset.cuy = String(Math.round(a.customer.pos.y));
    canvas.dataset.dox = String(Math.round(a.doc.pos.x));
    canvas.dataset.doy = String(Math.round(a.doc.pos.y));
    canvas.dataset.gate = p.gateOpen ? "open" : "locked";
    canvas.dataset.positions = JSON.stringify({ customer: customerPos, doc: docPos, agents: pos });
  }

  /* rAF 루프 — draw/이동 정의 뒤에 두는 이유: 훅 린트가 선언 전 참조를 막는다.
     이동 중이면 매 프레임, 아니면 120ms(≈8fps) 앰비언트. reduced-motion·숨김이면 정지.
     루프는 **마운트 때 한 번만** 만든다 — props가 바뀔 때마다 다시 만들면 추적 카메라가
     켜진 동안(초당 60회 부모 렌더) 매번 루프를 접었다 편다. 상태는 전부 ref에서 읽으므로
     첫 렌더의 클로저로 충분하다. */
  useEffect(() => {
    const a = animRef.current;
    const loop = (now: number) => {
      const p = propsRef.current;
      const a2 = animRef.current;
      const dt = Math.min(350, now - a2.last);
      a2.last = now;
      a2.clock += dt;

      /* 완료 전이 관측 — 처음 본 상태는 스파클을 내지 않는다 */
      for (const b of BUILDINGS) {
        for (const s of b.stations) {
          const cur = p.statuses[s] ?? "";
          const prev = a2.prevStatus[s];
          if (prev !== undefined && prev !== cur && cur === "완료") a2.sparks[b.id] = a2.clock;
          a2.prevStatus[s] = cur;
        }
      }

      if (p.customer) retarget(a2.customer, p.customer.state, customerTile(p.customer.state), p.reducedMotion);
      if (p.docTarget) retarget(a2.doc, p.docTarget, docTile(p.docTarget), p.reducedMotion);
      retargetAgents(p, a2);

      let moving = stepMover(a2.customer, dt);
      if (p.docTarget && stepMover(a2.doc, dt)) moving = true;
      for (const id of STATION_IDS) if (a2.agents[id] && stepMover(a2.agents[id], dt)) moving = true;

      if (a2.dirty || moving || (!p.reducedMotion && a2.clock - a2.lastDraw >= 120)) {
        draw();
        a2.dirty = false;
        a2.lastDraw = a2.clock;
      }

      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden && (moving || !p.reducedMotion)) a2.raf = requestAnimationFrame(loop);
      else a2.running = false;
    };
    const wake = () => {
      const a2 = animRef.current;
      if (a2.running || (typeof document !== "undefined" && document.hidden)) return;
      a2.running = true;
      a2.last = performance.now();
      a2.raf = requestAnimationFrame(loop);
    };
    a.wake = wake;
    a.dirty = true;
    wake();
    return () => {
      cancelAnimationFrame(a.raf);
      a.running = false;
      a.wake = null;
    };
  }, []);

  /* props가 바뀌면 다시 그린다 — 멈춰 있던 루프(정적 도시·reduced-motion)를 깨우고,
     돌고 있으면 wake는 무시된다(다음 프레임에 dirty를 본다). 매 렌더 실행, 정리 없음. */
  useEffect(() => {
    const a = animRef.current;
    a.dirty = true;
    a.wake?.();
  });

  /* 탭이 숨으면 루프가 스스로 멈춘다 — 돌아오면 한 프레임 그리고 다시 깨운다 */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      animRef.current.dirty = true;
      animRef.current.wake?.();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      style={{ imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
