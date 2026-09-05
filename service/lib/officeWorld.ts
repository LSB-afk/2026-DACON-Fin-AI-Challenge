/**
 * Fin:AI 운영 도시 — 지도의 순수 데이터.
 *
 * 책임 분리(설계 계약):
 *   이 파일        — 타일 좌표계 · 건물 · 도로 · 스테이션 자리 · 웨이포인트
 *   officeActors   — 에이전트·고객의 시각 상태 모델 (실행 상태의 순수 함수)
 *   _officeCanvas  — DPR 캔버스 렌더와 이동 보간만
 *   _office        — React 결합 · HTML 오버레이 · 접근성
 *
 * 공간이 곧 논리다: 스테이션 자리는 FLOW id와 1:1이고(테스트 강제), 건물 배치는
 * 처리 순서를 따라 x가 단조 증가한다. 도시 전용 가짜 단계는 없다.
 * DECOR·ZONES·CANAL은 2.5D 입체감을 위한 장식·구역 표시일 뿐 — 상태를 담지
 * 않으며, 실행 로직이 이들을 읽지 않는다(순수 배치 데이터).
 */

import { FLOW, type FlowView, type FlowTab } from "./flow.ts";

/** 기본 타일 16px — 모든 좌표는 타일 격자 위에 놓인다 */
export const TILE = 16;
/** 월드 80×45타일 = 1280×720 논리 px — 16:9 고정 */
export const WORLD = { w: 80, h: 45 } as const;

/*
 * ── 금융권 팔레트 — 흰 배경 라이트 테마 (2026-08-31 사용자 지정) ──
 * 파랑 계열은 전부 브랜드 #006EDA에서 파생한다. 상태 색(성공·경고·오류)은
 * 뜻을 지므로 유지하되 표시등·말풍선·게이트등에만 제한적으로 쓴다.
 */
export const PALETTE = {
  심층배경: "#FFFFFF",
  벽체: "#F8FBFF",
  벽테두리: "#1F4066",
  핵심파랑: "#006EDA",
  인터랙션: "#006EDA",
  밝은면: "#E8F2FD",
  유리금속: "#9DB8D6",
  보조실버: "#B9CCE2",
  성공: "#147D72",
  경고: "#B7791F",
  오류: "#C93C47",
  글자: "#0F2A4C",
  어두운글자: "#0F2A4C",
  바닥석재A: "#F1F6FC",
  바닥석재B: "#EAF1FA",
  도로: "#DDE8F4",
  도로차선: "#AFCCEC",
  보도: "#E4EEF9",
  광장A: "#E9F2FC",
  광장B: "#E1ECF9",
  목재: "#A67C4F",
  피부: "#d9b28c",
} as const;

/** 큰길(수평 대로) — 문서·고객 이동의 중심선 */
export const STREET = { top: 19, bottom: 23 } as const;
export const STREET_Y = 21;

/** plaza — 벽 없는 광장. core — FLOW 스테이션을 담는 핵심 건물. support — 실제 화면으로 이어지는 지원 시설 */
export type BuildingKind = "core" | "support" | "plaza";
/** 처리 단계를 6구역으로 묶은 구역명 — HUD·안내판 표시용 */
export type Zone = "고객 접점" | "데이터 처리" | "AI 판단" | "지식·규제" | "답변·승인" | "운영 지원";

export type Building = {
  id: string;
  라벨: string;
  부제: string;
  /** 이 건물이 담는 FLOW 스테이션 id들 (플라자·은행 등 흐름 밖 건물은 빈 배열) */
  stations: string[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 큰길을 향한 문의 x 타일 */
  doorX: number;
  /** 건물이 큰길의 위(top)인가 아래(bottom)인가 */
  side: "top" | "bottom";
  kind: BuildingKind;
  zone: Zone;
  /** 뒷벽 높이(논리 px). core 40–48 · support 24–28 · plaza 0 */
  wallH: number;
  /** 구역 안내판 번호 (1부터, 처리 순서대로. kind별로 유일) */
  no: number;
  /** 지원 시설이 여는 실제 화면 — FlowView(lib/flow.ts). core/plaza는 없음 */
  view?: FlowView;
  tab?: FlowTab;
};

/*
 * 도시 배치 — 큰길을 사이에 두고 지그재그. 처리 순서(FLOW)가 왼→오로 흐른다.
 * 고객은 좌하단 광장으로 들어와 접수센터에서 상담하고, 문서가 도시를 가로질러
 * 우측 승인 창구에 닿으면, 사람이 승인해야 우측 게이트가 열린다.
 */
export const BUILDINGS: readonly Building[] = [
  { id: "plaza", 라벨: "고객 진입 광장", 부제: "상담 대기열", stations: [], x0: 2, y0: 26, x1: 12, y1: 42, doorX: 7, side: "bottom", kind: "plaza", zone: "고객 접점", wallH: 0, no: 1 },
  { id: "reception", 라벨: "상담 접수센터", 부제: "발화 접수", stations: ["input"], x0: 4, y0: 4, x1: 13, y1: 17, doorX: 8, side: "top", kind: "core", zone: "고객 접점", wallH: 44, no: 1 },
  { id: "routing", 라벨: "AI 라우팅 관제", 부제: "업무 분류", stations: ["routing"], x0: 15, y0: 26, x1: 24, y1: 39, doorX: 19, side: "bottom", kind: "core", zone: "데이터 처리", wallH: 40, no: 2 },
  { id: "extraction", 라벨: "고객정보 추출센터", 부제: "evidence 검증", stations: ["extract"], x0: 25, y0: 4, x1: 34, y1: 17, doorX: 29, side: "top", kind: "core", zone: "데이터 처리", wallH: 42, no: 3 },
  { id: "judgment", 라벨: "금융 판정센터", 부제: "모델 금지구역", stations: ["judge"], x0: 35, y0: 26, x1: 44, y1: 39, doorX: 39, side: "bottom", kind: "core", zone: "AI 판단", wallH: 48, no: 4 },
  { id: "guardrail", 라벨: "준법감시센터", 부제: "가드레일 G1–G8", stations: ["guard"], x0: 45, y0: 4, x1: 53, y1: 17, doorX: 49, side: "top", kind: "core", zone: "지식·규제", wallH: 40, no: 5 },
  { id: "ontology", 라벨: "지식 그래프센터", 부제: "온톨로지 대조", stations: ["ontology"], x0: 54, y0: 26, x1: 62, y1: 39, doorX: 58, side: "bottom", kind: "core", zone: "지식·규제", wallH: 42, no: 6 },
  { id: "answer", 라벨: "답변·번역센터", 부제: "조립 · 숫자 보존", stations: ["narrate", "translate"], x0: 63, y0: 4, x1: 76, y1: 17, doorX: 69, side: "top", kind: "core", zone: "답변·승인", wallH: 40, no: 7 },
  { id: "bank", 라벨: "상담사 승인 창구", 부제: "사람 — 승인·기록", stations: [], x0: 66, y0: 26, x1: 77, y1: 39, doorX: 72, side: "bottom", kind: "core", zone: "답변·승인", wallH: 48, no: 8 },

  /* ── 지원 시설 — stations: [] · view로 실제 화면과 이어진다(가짜 아님) ── */
  { id: "lounge", 라벨: "상담 대기 라운지", 부제: "대기열 현황 보기", stations: [], x0: 15, y0: 5, x1: 21, y1: 9, doorX: 18, side: "top", kind: "support", zone: "고객 접점", wallH: 24, no: 1, view: "queue" },
  { id: "vault", 라벨: "개인정보 보호 금고", 부제: "PII·비밀 차단 규칙", stations: [], x0: 15, y0: 11, x1: 21, y1: 16, doorX: 18, side: "top", kind: "support", zone: "데이터 처리", wallH: 26, no: 2, view: "harness" },
  { id: "simroom", 라벨: "시나리오 시뮬레이션실", 부제: "가상 상담 시나리오 재생", stations: [], x0: 36, y0: 5, x1: 43, y1: 9, doorX: 39, side: "top", kind: "support", zone: "AI 판단", wallH: 24, no: 3, view: "scenarios" },
  { id: "skillinfo", 라벨: "검사 항목 안내소", 부제: "검사 목록·기준 열람", stations: [], x0: 36, y0: 11, x1: 43, y1: 16, doorX: 39, side: "top", kind: "support", zone: "AI 판단", wallH: 26, no: 4, view: "skills" },
  { id: "library", 라벨: "법령·기준 도서관", 부제: "판정 기준 문서 열람", stations: [], x0: 55, y0: 5, x1: 61, y1: 9, doorX: 58, side: "top", kind: "support", zone: "지식·규제", wallH: 24, no: 5, view: "standards-map" },
  { id: "lawsearch", 라벨: "법 조문 검색소", 부제: "관련 조문 검색", stations: [], x0: 55, y0: 11, x1: 61, y1: 16, doorX: 58, side: "top", kind: "support", zone: "지식·규제", wallH: 26, no: 6, view: "search" },
  { id: "explainroom", 라벨: "설명 가능성 검증실", 부제: "판정 근거 설명 보기", stations: [], x0: 26, y0: 27, x1: 33, y1: 31, doorX: 29, side: "bottom", kind: "support", zone: "지식·규제", wallH: 24, no: 7, view: "explain" },
  { id: "archive2", 라벨: "감사 기록 보관소", 부제: "판정 이력 열람", stations: [], x0: 26, y0: 33, x1: 33, y1: 38, doorX: 29, side: "bottom", kind: "support", zone: "답변·승인", wallH: 26, no: 8, view: "audit" },
  { id: "dispatch", 라벨: "결과 발송센터", 부제: "발송 결과물 보기", stations: [], x0: 46, y0: 27, x1: 52, y1: 31, doorX: 49, side: "bottom", kind: "support", zone: "답변·승인", wallH: 24, no: 9, view: "artifacts" },
  { id: "approvaldesk", 라벨: "담당자·승인 안내", 부제: "승인 대기 목록 보기", stations: [], x0: 46, y0: 33, x1: 52, y1: 38, doorX: 49, side: "bottom", kind: "support", zone: "답변·승인", wallH: 26, no: 10, view: "approvals" },
  { id: "monitortower", 라벨: "시스템 모니터링 타워", 부제: "판정 현황판 보기", stations: [], x0: 16, y0: 42, x1: 24, y1: 44, doorX: 20, side: "bottom", kind: "support", zone: "운영 지원", wallH: 28, no: 11, view: "monitor" },
  { id: "orgoffice", 라벨: "AI 역할 분담 사무소", 부제: "에이전트 조직도 보기", stations: [], x0: 36, y0: 42, x1: 44, y1: 44, doorX: 40, side: "bottom", kind: "support", zone: "운영 지원", wallH: 28, no: 12, view: "org" },
] as const;

export type Spot = { x: number; y: number; buildingId: string };

/** FLOW id → 스테이션 자리. 도시가 흐름 밖 스테이션을 만들지 않음을 테스트가 강제 */
export const STATION_SPOTS: Record<string, Spot> = {
  input: { x: 8, y: 10, buildingId: "reception" },
  routing: { x: 19, y: 32, buildingId: "routing" },
  extract: { x: 29, y: 10, buildingId: "extraction" },
  judge: { x: 39, y: 32, buildingId: "judgment" },
  guard: { x: 49, y: 10, buildingId: "guardrail" },
  ontology: { x: 58, y: 32, buildingId: "ontology" },
  narrate: { x: 67, y: 10, buildingId: "answer" },
  translate: { x: 73, y: 10, buildingId: "answer" },
};

/** FLOW 밖의 실재 자리들 — 사람·게이트·보관소 (판정 대상이 아니라 상태만 반영) */
export const COUNSELOR_SPOT = { x: 70, y: 31 } as const;
export const ARCHIVE_SPOT = { x: 75, y: 35 } as const;
/** 결과 전달 게이트 — 우측 벽. 승인 전 잠김 */
export const EXIT_GATE = { x: 78, yTop: STREET.top, yBottom: STREET.bottom } as const;

/** 광장 대기열 자리 — 대기 고객이 서는 곳 (선착순) */
export const QUEUE_SPOTS: readonly { x: number; y: number }[] = [
  { x: 4, y: 30 }, { x: 7, y: 30 }, { x: 10, y: 30 },
  { x: 4, y: 34 }, { x: 7, y: 34 }, { x: 10, y: 34 },
  { x: 4, y: 38 }, { x: 7, y: 38 },
];

/** 고객 여정의 목적지 좌표 (보도 위 — 건물 안으로는 들어가지 않는다) */
export const CUSTOMER_SPOTS = {
  consulting: { x: 8, y: 18 },        // 접수센터 문 앞
  waitingProcessing: { x: 12, y: 18 }, // 접수 옆 대기
  waitingApproval: { x: 72, y: 24 },   // 승인 창구 앞
  receivingResult: { x: 76, y: STREET_Y }, // 게이트 앞
  exited: { x: 79, y: STREET_Y },      // 게이트 밖 (사라짐)
} as const;

/** 장식 소품 종류 — 상태를 담지 않는 순수 배치 정보 */
export type DecorKind =
  | "tree" | "bush" | "flowerbed" | "bench" | "lamp"
  | "sign" | "bridge" | "kiosk" | "board" | "bollard";
export type Decor = { kind: DecorKind; x: number; y: number; /** 타일 단위 크기(기본 1×1) */ w?: number; h?: number };

/** 하단 데이터 스트림 수로 — 핵심 건물 열과 하단 지원 시설 사이의 여백 */
export const CANAL = { x0: 14, x1: 79, top: 40, bottom: 41 } as const;

/** 처리 순서를 6구역으로 묶은 안내 — 구역 번호·범위·안내판 위치 */
export const ZONES: readonly { zone: Zone; no: number; x0: number; x1: number; signX: number; signY: number }[] = [
  { zone: "고객 접점", no: 1, x0: 0, x1: 13, signX: 11, signY: 25 },
  { zone: "데이터 처리", no: 2, x0: 14, x1: 34, signX: 14, signY: 6 },
  { zone: "AI 판단", no: 3, x0: 35, x1: 44, signX: 35, signY: 6 },
  { zone: "지식·규제", no: 4, x0: 45, x1: 62, signX: 54, signY: 6 },
  { zone: "답변·승인", no: 5, x0: 63, x1: 79, signX: 64, signY: 27 },
  { zone: "운영 지원", no: 6, x0: 14, x1: 79, signX: 60, signY: 43 },
];

/** DECOR 후보가 건물·큰길·기존 자리(STATION·QUEUE·CUSTOMER·상담사·보관소)를 침범하지 않는가 */
function tileFree(x: number, y: number): boolean {
  if (x < 0 || x >= WORLD.w || y < 0 || y >= WORLD.h) return false;
  if (y >= STREET.top && y <= STREET.bottom) return false;
  const spots: { x: number; y: number }[] = [
    ...Object.values(STATION_SPOTS),
    ...QUEUE_SPOTS,
    ...Object.values(CUSTOMER_SPOTS),
    COUNSELOR_SPOT,
    ARCHIVE_SPOT,
  ];
  if (spots.some((s) => s.x === x && s.y === y)) return false;
  if (BUILDINGS.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) return false;
  return true;
}

/** 건물 사이 빈 격자를 초록 소품으로 채운다 — 자리마다 손으로 나열하는 대신 격자를 훑는다 */
function fillZone(
  zone: { x0: number; x1: number; y0: number; y1: number },
  stepX: number,
  stepY: number,
): Decor[] {
  const kinds: DecorKind[] = ["tree", "bush", "flowerbed", "bench"];
  const out: Decor[] = [];
  let k = 0;
  for (let y = zone.y0; y <= zone.y1; y += stepY) {
    for (let x = zone.x0; x <= zone.x1; x += stepX) {
      if (tileFree(x, y)) out.push({ kind: kinds[k++ % kinds.length], x, y });
    }
  }
  return out;
}

const FILLER_DECOR: Decor[] = [
  // 상단 지원 건물 사이 빈 기둥 — 접수·추출·감시·답변 사이 여백
  ...fillZone({ x0: 14, x1: 14, y0: 4, y1: 16 }, 1, 4),
  ...fillZone({ x0: 22, x1: 22, y0: 4, y1: 16 }, 1, 4),
  ...fillZone({ x0: 35, x1: 35, y0: 4, y1: 16 }, 1, 4),
  ...fillZone({ x0: 44, x1: 44, y0: 4, y1: 16 }, 1, 4),
  ...fillZone({ x0: 54, x1: 54, y0: 4, y1: 16 }, 1, 4),
  ...fillZone({ x0: 62, x1: 62, y0: 4, y1: 16 }, 1, 4),
  // 하단 지원 건물 사이 빈 기둥 — 라우팅·판정·온톨로지 사이 여백
  ...fillZone({ x0: 25, x1: 25, y0: 26, y1: 38 }, 1, 4),
  ...fillZone({ x0: 34, x1: 34, y0: 26, y1: 38 }, 1, 4),
  ...fillZone({ x0: 45, x1: 45, y0: 26, y1: 38 }, 1, 4),
  ...fillZone({ x0: 53, x1: 53, y0: 26, y1: 38 }, 1, 4),
  // 에이전트 휴게소 — 온톨로지·승인 창구 사이 공터, 나무·벤치 공원
  ...fillZone({ x0: 64, x1: 64, y0: 26, y1: 38 }, 1, 2),
  // 수로 건너 운영 지원 지대 — 남는 바닥을 낮게 채운다
  ...fillZone({ x0: 25, x1: 35, y0: 42, y1: 42 }, 4, 1),
  ...fillZone({ x0: 45, x1: 79, y0: 42, y1: 42 }, 4, 1),
];

/** 손으로 배치한 랜드마크 소품 — 광장 경계·구역 안내판·수로 다리·가로등 */
const LANDMARK_DECOR: Decor[] = [
  { kind: "bollard", x: 3, y: 25 },
  { kind: "bollard", x: 5, y: 25 },
  { kind: "board", x: 9, y: 25 }, // 고객 안내 게시판
  { kind: "bridge", x: 13, y: 40, w: 2, h: 2 }, // 광장 → 운영 지원 지대
  ...ZONES.map((z) => ({ kind: "sign" as const, x: z.signX, y: z.signY })),
  ...[6, 16, 26, 36, 46, 56, 66, 76]
    .filter((x) => tileFree(x, 18))
    .map((x) => ({ kind: "lamp" as const, x, y: 18 })),
  ...[6, 16, 26, 36, 46, 56, 66, 76]
    .filter((x) => tileFree(x, 24))
    .map((x) => ({ kind: "lamp" as const, x, y: 24 })),
];

export const DECOR: readonly Decor[] = [...LANDMARK_DECOR, ...FILLER_DECOR];

export function buildingOf(stationId: string): Building | undefined {
  return BUILDINGS.find((b) => b.stations.includes(stationId));
}

/** 자리 id(FLOW·counselor·archive·gate·plaza) → 서는 타일 */
export function standTile(spot: string): { x: number; y: number } {
  if (spot === "counselor") return { x: COUNSELOR_SPOT.x, y: COUNSELOR_SPOT.y };
  if (spot === "archive") return { x: ARCHIVE_SPOT.x, y: ARCHIVE_SPOT.y };
  if (spot === "gate") return CUSTOMER_SPOTS.receivingResult;
  if (spot === "plaza") return { x: QUEUE_SPOTS[0].x, y: QUEUE_SPOTS[0].y };
  const s = STATION_SPOTS[spot];
  return s ? { x: s.x, y: s.y } : CUSTOMER_SPOTS.consulting;
}

/**
 * 큰길 경유 웨이포인트 — 순간이동 대신 걷는다. 항상 큰길(y=STREET_Y)로 나와
 * 목적지 x까지 이동 후 들어간다. 건물 벽을 통과하지 않는 최소 보장.
 */
export function walkPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  if (from.x === to.x && from.y === to.y) return [];
  const path: { x: number; y: number }[] = [];
  if (from.y !== STREET_Y) path.push({ x: from.x, y: STREET_Y });
  path.push({ x: to.x, y: STREET_Y });
  if (to.y !== STREET_Y) path.push({ x: to.x, y: to.y });
  return path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.y !== path[i - 1].y);
}

/** 문서(데이터 패킷)의 경유 순서 = FLOW 순서 그대로 */
export const DOC_ROUTE: readonly string[] = FLOW.map((s) => s.id);
