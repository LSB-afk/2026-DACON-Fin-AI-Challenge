/** Central office floor plan. Tiles describe space; business order never determines geometry. */
import { FLOW, type FlowView, type FlowTab } from "./flow.ts";
export const TILE = 16;
export const WORLD = { w: 104, h: 68 } as const;
export const HUB = { x: 52, y: 34 } as const;
export type Point = { x: number; y: number };
export const PALETTE = {
  심층배경: "#EEF2F5", 벽체: "#F8FAFA", 벽테두리: "#728598", 핵심파랑: "#006EDA",
  인터랙션: "#006EDA", 밝은면: "#E8F2FD", 유리금속: "#A5BCC9", 보조실버: "#C4CFD6",
  성공: "#147D72", 경고: "#B7791F", 오류: "#C93C47", 글자: "#183348", 어두운글자: "#183348",
  바닥석재A: "#EBEFED", 바닥석재B: "#E3E8E5", 도로: "#E7EBE9", 도로차선: "#CBD7D9",
  보도: "#E8EEEB", 광장A: "#E9F0F4", 광장B: "#E0E8ED", 목재: "#B99068", 피부: "#D8AF8C",
} as const;
export type BuildingKind = "core" | "support" | "plaza";
export type Zone = "고객 접점" | "데이터 처리" | "AI 판단" | "지식·규제" | "답변·승인" | "운영 지원";
export type Building = {
  id: string; 라벨: string; 부제: string; stations: string[];
  x0: number; y0: number; x1: number; y1: number;
  doorX: number; doorY: number; doorSide: "north" | "south" | "east" | "west" | "open";
  side: "top" | "bottom"; kind: BuildingKind; zone: Zone; wallH: number; no: number;
  view?: FlowView; tab?: FlowTab; material: "wood" | "sage" | "blue" | "stone";
};
type RoomSpec = [string, string, string, number, number, number, number, Building["zone"], string[], Building["doorSide"], FlowView?];
const ROOM_SPECS: RoomSpec[] = [
  ["library", "법령 자료실", "판정 기준 · 원문", 3, 3, 18, 17, "지식·규제", [], "south", "standards-map"],
  ["lawsearch", "법 조문 검색실", "관련 조문 확인", 22, 3, 37, 17, "지식·규제", [], "south", "search"],
  ["ontology", "지식 그래프 분석실", "용어 · 근거 대조", 41, 3, 56, 17, "지식·규제", ["ontology"], "south"],
  ["guardrail", "준법감시실", "가드레일 검토", 60, 3, 75, 17, "지식·규제", ["guard"], "south"],
  ["vault", "개인정보 보호실", "정보 보호 규칙", 79, 3, 89, 17, "데이터 처리", [], "south", "harness"],
  ["skillinfo", "검사 기준실", "검사 목록 · 기준", 93, 3, 101, 17, "AI 판단", [], "south", "skills"],
  ["extraction", "고객정보 추출실", "상담 원문 · 근거 확인", 3, 22, 19, 37, "데이터 처리", ["extract"], "east"],
  ["routing", "업무 배분 관제실", "상담 업무 분류", 23, 22, 35, 37, "데이터 처리", ["routing"], "east"],
  ["reception", "중앙 상담 허브", "상담 접수 · 업무 배분", 39, 24, 69, 41, "고객 접점", ["input"], "open"],
  ["judgment", "금융 규칙 판정실", "입력 기준 · 코드 판정", 73, 22, 88, 37, "AI 판단", ["judge"], "west"],
  ["explainroom", "근거 설명실", "판정 근거 확인", 92, 22, 101, 37, "지식·규제", [], "west", "explain"],
  ["simroom", "시나리오 회의실", "상담 시나리오 검토", 3, 41, 18, 47, "AI 판단", [], "south", "scenarios"],
  ["evidenceroom", "근거 검토실", "원문 검증 · 사례 회의", 22, 41, 35, 47, "데이터 처리", [], "south", "explain"],
  ["meeting", "검토 회의실", "준법 · 판정 협의", 73, 41, 88, 47, "지식·규제", [], "south", "harness"],
  ["approvaldesk", "승인 안내실", "담당자 · 승인 대기", 92, 41, 101, 47, "답변·승인", [], "south", "approvals"],
  ["lounge", "고객 대기 라운지", "상담 대기 공간", 39, 44, 48, 48, "고객 접점", [], "open", "queue"],
  ["consultroom", "개별 상담석", "상담 입력 · 보완", 51, 44, 59, 48, "고객 접점", [], "open", "agent-run"],
  ["plaza", "중앙 안내 공간", "고객 대기열", 62, 44, 69, 48, "고객 접점", [], "open", "queue"],
  ["archive2", "감사 기록 보관실", "판정 · 승인 이력", 3, 52, 17, 65, "답변·승인", [], "north", "audit"],
  ["dispatch", "결과 전달실", "확정 결과물 확인", 21, 52, 35, 65, "답변·승인", [], "north", "artifacts"],
  ["answer", "답변 · 번역 스튜디오", "답변 작성 · 숫자 보존", 39, 52, 56, 65, "답변·승인", ["narrate", "translate"], "north"],
  ["bank", "상담사 검토 · 승인실", "사람의 확인 · 결과 적용", 60, 52, 76, 65, "답변·승인", [], "north", "approvals"],
  ["monitortower", "운영 모니터링실", "시스템 상태 확인", 80, 52, 90, 65, "운영 지원", [], "north", "monitor"],
  ["orgoffice", "팀 협업 라운지", "역할 · 조직 안내", 94, 52, 101, 65, "운영 지원", [], "north", "org"],
];
export const BUILDINGS: readonly Building[] = ROOM_SPECS.map(([id, 라벨, 부제, x0, y0, x1, y1, zone, stations, doorSide, view], i) => ({
  id, 라벨, 부제, x0, y0, x1, y1, zone, stations, doorSide, view,
  doorX: doorSide === "west" ? x0 : doorSide === "east" ? x1 : Math.round((x0 + x1) / 2),
  doorY: doorSide === "north" ? y0 : doorSide === "south" ? y1 : Math.round((y0 + y1) / 2),
  side: y0 >= HUB.y ? "bottom" : "top",
  kind: id === "plaza" ? "plaza" : stations.length || id === "bank" ? "core" : "support",
  wallH: doorSide === "open" ? 0 : y1 - y0 < 8 ? 22 : 42, no: i + 1,
  material: zone === "고객 접점" || zone === "답변·승인" ? "wood" : zone === "지식·규제" ? "sage" : zone === "데이터 처리" ? "blue" : "stone",
}));
export type Spot = Point & { buildingId: string };
export const STATION_SPOTS: Record<string, Spot> = {
  input: { x: 52, y: 32, buildingId: "reception" }, routing: { x: 29, y: 29, buildingId: "routing" },
  extract: { x: 10, y: 29, buildingId: "extraction" }, judge: { x: 80, y: 29, buildingId: "judgment" },
  guard: { x: 67, y: 10, buildingId: "guardrail" }, ontology: { x: 48, y: 10, buildingId: "ontology" },
  narrate: { x: 44, y: 59, buildingId: "answer" }, translate: { x: 51, y: 59, buildingId: "answer" },
};
export const COUNSELOR_SPOT = { x: 67, y: 59 } as const;
export const ARCHIVE_SPOT = { x: 10, y: 59 } as const;
export const CUSTOMER_SPOTS = {
  consulting: HUB, waitingProcessing: { x: 54, y: 36 }, waitingApproval: { x: 54, y: 36 },
  receivingResult: { x: 52, y: 34 }, exited: { x: 56, y: 39 },
} as const;
export const QUEUE_SPOTS: readonly Point[] = [{ x: 64, y: 46 }, { x: 67, y: 46 }, { x: 64, y: 47 }, { x: 67, y: 47 }];
export const EXIT_GATE = { x: 56, yTop: 37, yBottom: 40 } as const;
export type FurnitureKind = "desk" | "counter" | "shelf" | "sofa" | "table" | "plant" | "server" | "screen" | "chair" | "cabinet" | "board";
export type Furniture = { id: string; room: string; kind: FurnitureKind; x: number; y: number; w: number; h: number; color?: string };
const furniture: Furniture[] = [];
function add(room: string, kind: FurnitureKind, x: number, y: number, w: number, h: number, color?: string) {
  furniture.push({ id: `${room}-${kind}-${furniture.length}`, room, kind, x, y, w, h, color });
}
for (const b of BUILDINGS) {
  if (b.doorSide === "open") continue;
  if (b.y1 - b.y0 < 8) {
    add(b.id, "table", b.x0 + 3, b.y0 + 1.6, Math.min(5, b.x1 - b.x0 - 5), 1.7);
    add(b.id, "chair", b.x0 + 2, b.y0 + 2, 0.75, 0.75);
    add(b.id, "chair", b.x0 + 3.8, b.y0 + 3.6, 0.75, 0.75);
    if (b.x1 - b.x0 > 10) add(b.id, "chair", b.x0 + 6.5, b.y0 + 3.6, 0.75, 0.75);
    add(b.id, "board", b.x0 + 3, b.y0 + .5, Math.min(4.5, b.x1 - b.x0 - 5), .35);
    add(b.id, "plant", b.x1 - 1.8, b.y0 + 1.7, 0.7, 0.7); continue;
  }
  if (b.id === "library" || b.id === "archive2") {
    for (let x = b.x0 + 1.5; x < b.x1 - 2; x += 3.2) {
      if (b.doorSide === "north" && x < b.doorX + 1.5 && x + 2.2 > b.doorX - 1.5) continue;
      add(b.id, "shelf", x, b.y0 + 1.2, 2.2, 0.8);
    }
    if (b.id === "library") {
      add(b.id, "table", b.x0 + 3, b.y0 + 5, 3.2, 1.5);
      add(b.id, "chair", b.x0 + 3.7, b.y0 + 7, .8, .8);
      add(b.id, "shelf", b.x0 + 2, b.y0 + 10, 4, .8);
      add(b.id, "shelf", b.x0 + 9, b.y0 + 6, 3, .8);
    }
  } else if (b.id === "vault" || b.id === "judgment") {
    add(b.id, "server", b.x1 - 3, b.y0 + 2, 1.3, 2);
    if (b.id === "judgment") add(b.id, "server", b.x1 - 5.2, b.y0 + 2, 1.3, 2);
    if (b.id === "vault") add(b.id, "cabinet", b.x0 + 2, b.y0 + 3, 2, 1.4);
  } else if (b.id === "monitortower") add(b.id, "screen", b.x0 + 2, b.y0 + 1.4, b.x1 - b.x0 - 4, 0.65);
  else if (b.id === "routing") add(b.id, "screen", b.x0 + 2, b.y0 + 1.4, b.x1 - b.x0 - 4, .65);
  else if (["ontology", "guardrail", "extraction"].includes(b.id)) add(b.id, "board", b.x0 + 2, b.y0 + 1.4, 5, .4);
  else if (b.id === "orgoffice") {
    add(b.id, "sofa", b.x0 + 1.2, b.y0 + 3, 1.6, 3.4); add(b.id, "table", b.x0 + 3.4, b.y0 + 4, 1.2, 1.7);
    add(b.id, "sofa", b.x0 + 1.2, b.y0 + 8, 4.4, 1.5, "#9DAA96");
  } else add(b.id, "cabinet", b.x0 + 1.4, b.y0 + 1.1, Math.min(4, b.x1 - b.x0 - 4), 0.8);
  const stations = b.stations.map(id => STATION_SPOTS[id]);
  if (b.id === "bank") stations.push({ ...COUNSELOR_SPOT, buildingId: b.id });
  if (b.id === "archive2") stations.push({ ...ARCHIVE_SPOT, buildingId: b.id });
  if (stations.length) for (const s of stations) {
    add(b.id, "desk", s.x - 1.6, s.y - 2.3, 3.2, 1.5);
    add(b.id, "chair", s.x + 1.25, s.y + 0.6, 0.8, 0.8);
  } else if (!["library", "vault", "orgoffice"].includes(b.id)) add(b.id, "desk", b.x0 + 2, b.y0 + 5, Math.min(3.2, b.x1 - b.x0 - 4), 1.5);
  if (b.x1 - b.x0 > 12 && !["answer", "archive2", "library"].includes(b.id)) {
    add(b.id, "table", b.x0 + 2.5, b.y1 - 4, 3.4, 1.5); add(b.id, "chair", b.x0 + 2.6, b.y1 - 2, 0.8, 0.8);
  }
  add(b.id, "plant", b.x1 - 2, b.y1 - 2, 0.8, 0.8);
}
add("reception", "counter", 49, 29, 7, 2, "#B5906B");
add("reception", "sofa", 42, 29, 2, 5, "#6E8B9D"); add("reception", "sofa", 62, 30, 2, 5, "#6E8B9D");
add("reception", "table", 45, 31, 1.8, 2.2); add("reception", "table", 59, 32, 1.8, 2.2);
for (const p of [{x:42,y:26},{x:65,y:26},{x:42,y:38},{x:65,y:38}]) add("reception", "plant", p.x, p.y, 1, 1);
add("lounge", "sofa", 40, 44.7, 5.6, 1.3, "#A9B5A6");
add("consultroom", "table", 52, 44.7, 3.5, 1.5); add("consultroom", "chair", 56.5, 45, 0.8, 0.8);
export const FURNITURE: readonly Furniture[] = furniture;
export type Decor = { kind: "tree" | "bench"; x: number; y: number; w?: number; h?: number };
export const DECOR: readonly Decor[] = [{ kind: "tree", x: 37, y: 20 }, { kind: "tree", x: 71, y: 20 }, { kind: "tree", x: 37, y: 50 }, { kind: "tree", x: 78, y: 50 }];
export const ZONES: readonly { zone: Zone; no: number; x0: number; x1: number; signX: number; signY: number }[] = [
  { zone: "고객 접점", no: 1, x0: 39, x1: 69, signX: 54, signY: 24 },
  { zone: "데이터 처리", no: 2, x0: 3, x1: 35, signX: 20, signY: 21 },
  { zone: "AI 판단", no: 3, x0: 73, x1: 88, signX: 80, signY: 21 },
  { zone: "지식·규제", no: 4, x0: 3, x1: 75, signX: 51, signY: 2 },
  { zone: "답변·승인", no: 5, x0: 3, x1: 76, signX: 55, signY: 51 },
  { zone: "운영 지원", no: 6, x0: 80, x1: 101, signX: 90, signY: 51 },
];
/** Compatibility exports, never path constraints. */
export const STREET = { top: 18, bottom: 21 } as const;
export const STREET_Y = 20;
export const CANAL = { x0: 0, x1: 0, top: 0, bottom: 0 } as const;
export function buildingOf(stationId: string): Building | undefined { return BUILDINGS.find(b => b.stations.includes(stationId)); }
export function standTile(id: string): Point {
  if (id === "counselor") return { ...COUNSELOR_SPOT };
  if (id === "archive" || id === "records") return { ...ARCHIVE_SPOT };
  if (id === "gate") return { ...CUSTOMER_SPOTS.receivingResult };
  if (id === "plaza") return { ...QUEUE_SPOTS[0] };
  const s = STATION_SPOTS[id]; return s ? { x: s.x, y: s.y } : { ...HUB };
}
/** Character radius, walls with real openings, and furniture share the renderer's geometry. */
export function isWalkable(x: number, y: number): boolean {
  if (x < 1 || y < 1 || x > WORLD.w - 1 || y > WORLD.h - 1) return false;
  for (const b of BUILDINGS) {
    if (b.doorSide === "open") continue;
    const ix = x >= b.x0 - 0.4 && x <= b.x1 + 0.4, iy = y >= b.y0 - 0.4 && y <= b.y1 + 0.4;
    const n = ix && Math.abs(y - b.y0) < 0.55, s = ix && Math.abs(y - b.y1) < 0.55;
    const w = iy && Math.abs(x - b.x0) < 0.55, e = iy && Math.abs(x - b.x1) < 0.55;
    if (!(n || s || w || e)) continue;
    const door = ((b.doorSide === "north" && n || b.doorSide === "south" && s) && Math.abs(x - b.doorX) <= 1)
      || ((b.doorSide === "east" && e || b.doorSide === "west" && w) && Math.abs(y - b.doorY) <= 1);
    if (!door) return false;
  }
  if (FURNITURE.some(f => x > f.x - 0.3 && x < f.x + f.w + 0.3 && y > f.y - 0.3 && y < f.y + f.h + 0.3)) return false;
  return !DECOR.some(d => Math.hypot(x - d.x, y - d.y) < 0.85);
}
const grid = new Uint8Array((WORLD.w + 1) * (WORLD.h + 1));
for (let y = 0; y <= WORLD.h; y++) for (let x = 0; x <= WORLD.w; x++) grid[y * (WORLD.w + 1) + x] = isWalkable(x, y) ? 1 : 0;
/** Cardinal shortest path through connected floor. Unreachable destinations never teleport through walls. */
export function walkPath(from: Point, to: Point): Point[] {
  if (from.x === to.x && from.y === to.y) return [];
  const width = WORLD.w + 1, start = Math.round(from.y) * width + Math.round(from.x), end = Math.round(to.y) * width + Math.round(to.x);
  if (!grid[start] || !grid[end]) return [];
  const parent = new Int32Array(grid.length).fill(-1), queue = new Int32Array(grid.length);
  let head = 0, tail = 1; queue[0] = start; parent[start] = start;
  while (head < tail && parent[end] === -1) {
    const p = queue[head++];
    for (const n of [p - 1, p + 1, p - width, p + width]) {
      if (n < 0 || n >= grid.length || !grid[n] || parent[n] !== -1) continue;
      parent[n] = p; queue[tail++] = n;
    }
  }
  if (parent[end] === -1) return [];
  const route: Point[] = [];
  for (let p = end; p !== start; p = parent[p]) route.push({ x: p % width, y: Math.floor(p / width) });
  route.reverse();
  const turns = route.filter((p, i) => {
    const prev = i ? route[i - 1] : { x: Math.round(from.x), y: Math.round(from.y) }, next = route[i + 1];
    return !next || p.x - prev.x !== next.x - p.x || p.y - prev.y !== next.y - p.y;
  });
  const snapped = { x: Math.round(from.x), y: Math.round(from.y) };
  if (from.x !== snapped.x || from.y !== snapped.y) turns.unshift(snapped);
  if (turns.length && (turns[turns.length - 1].x !== to.x || turns[turns.length - 1].y !== to.y)) turns.push(to);
  return turns;
}
/** Vocabulary only; presentation handoffs follow observed dependencies. */
export const DOC_ROUTE: readonly string[] = FLOW.map(s => s.id);
