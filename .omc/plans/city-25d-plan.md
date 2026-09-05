# Fin:AI 운영 도시 — 2.5D 고도화 설계 (헤드 확정안, 2026-09-04)

작업 디렉터리: `service/` (Next 16 · React 19 · Tailwind 4 · Canvas 2D). 새 의존성 금지.
검증: `npm run typecheck && npm test && npm run lint` 전부 통과해야 한다.

## 0. 절대 보존 계약 (기존 코드의 설계 원칙 — 깨면 실패)
- **도시 전용 가짜 상태 금지.** 모든 상태는 `stationStatus`/`agentStates`/`customerJourney`/`docDest`에서만 파생. 타이머로 꾸며낸 "처리 중" 금지.
- **working 에이전트는 최대 1명** (실행이 직렬). 병렬 분기 연출 금지.
- **FLOW ↔ STATION_SPOTS ↔ 핵심 건물 1:1** (기존 테스트). 핵심 9개 건물(plaza, reception, routing, extraction, judgment, guardrail, ontology, answer, bank)의 id·stations·문 위치·큰길 침범 금지 규칙 유지. 좌표는 조정 가능하나 `x` 단조 증가·큰길(y19–23) 불침범·FLOW 순서 유지.
- **캔버스에 한글 텍스트 금지** — 글자는 전부 `_office.tsx` HTML 오버레이.
- 좌표계: `TILE=16`, `WORLD 80×45` (1280×720) 고정. 큰길 `STREET {top:19,bottom:23}`, `STREET_Y=21`. 보도 y=18, y=24.
- 팔레트: 흰 배경 라이트 테마, 브랜드 파랑 `#006EDA` 파생. 상태색(성공 `#147D72`·경고 `#B7791F`·오류 `#C93C47`)은 표시등·배지에만. 네온·유리·SF 홀로그램 금지.
- `prefers-reduced-motion`: 이동은 순간이동, 깜빡임·앰비언트 정지 (기존 `reducedMotion` prop 경로 유지).
- 정적일 때 60fps rAF 금지 — 앰비언트는 저빈도(≤ 8fps)로만.
- 새 HTML 글자색/배경은 `globals.css` 기존 토큰만 사용 (`--ink --muted --accent --good --warning-ink --violet …`). 새 토큰 추가 금지 (contrast.mjs 표를 건드리지 않기 위해).

## 1. 2.5D 표현 방식 — "컷어웨이 탑다운" (결정)
기존 탑다운 격자·좌표·경로·오버레이를 그대로 쓰면서 입체감을 얻는 방식.
- **바닥(floor)**: 건물 footprint 안쪽 타일. 건물마다 다른 패턴(카펫·타일·석재).
- **뒷벽(north wall, 키 큰 벽)**: footprint 상단 `y0`부터 `wallH`px 높이의 **안쪽 면**. 여기 창·모니터·서가·전광판 등 설비를 그린다. 좌측 60% × 상단 30px는 **간판 자리(sign plate)**로 비워 두고 살짝 어두운 판을 깐다 — HTML 라벨이 그 위에 앉는다.
- **서벽(west wall)**: footprint 좌측 6px 폭의 안쪽 면(어두운 톤).
- **앞벽·동벽(south/east, 낮은 벽)**: 잘려 보이는 낮은 난간 4~6px (컷어웨이). 그래서 내부 에이전트가 보인다.
- **처마/코니스**: 뒷벽 최상단 3px 밝은 띠 + 외곽 1~2px 진한 테두리.
- **접지 그림자**: 광원 좌상단 고정 → footprint 우·하로 +6px 오프셋 `rgba(15,42,76,0.10)`. 건물 그리기 **전에** 지면에 깐다.
- **높이 위계**: core `wallH` 40–48, support 24–28, plaza 0(벽 없음, 바닥·가구만).
- **문**: `side:"top"` 건물은 앞(남) 낮은 벽에 문기둥+매트, `side:"bottom"` 건물은 뒷벽 면에 문 개구부(어두운 직사각형+상인방)로 그린다. 기존 차단 바·완료 등 로직은 유지.
- **선택된 건물**: `selectedBuilding` prop → 전체를 y−3 띄우고 그림자 +3 확대, 외곽 2px `#1687F8`.
- **오클루전**: 스프라이트(장식·에이전트·고객·문서·게이트·보관함)를 `y` 기준 정렬해 painter's algorithm으로 그린다.
- **패럴랙스 원경**: 월드 변환 **전** 화면 좌표계에 원경 레이어(하늘 띠 + 먼 건물 실루엣 2단, 연한 청회색 평면 도형)를 `camera.tx*0.35, camera.ty*0.35` 오프셋으로 그린다. 월드 y 0–3 행은 바닥을 채우지 않아 원경이 지평선처럼 보인다(상단 외벽은 y=3 행의 낮은 난간으로).

## 2. 데이터 모델 (lib/officeWorld.ts) — Phase A가 만든다, B·C가 소비한다
```ts
export type BuildingKind = "core" | "support" | "plaza";
export type Zone = "고객 접점" | "데이터 처리" | "AI 판단" | "지식·규제" | "답변·승인" | "운영 지원";
export type Building = {
  id: string; 라벨: string; 부제: string; stations: string[];
  x0: number; y0: number; x1: number; y1: number; doorX: number; side: "top" | "bottom";
  kind: BuildingKind; zone: Zone;
  /** 뒷벽 높이(논리 px). core 40–48 · support 24–28 · plaza 0 */
  wallH: number;
  /** 구역 안내판 번호 (1부터, 처리 순서대로) */
  no: number;
  /** 지원 시설이 여는 실제 화면 — FlowView(lib/flow.ts). core/plaza는 없음 */
  view?: FlowView; tab?: FlowTab;
};
export type DecorKind = "tree" | "bush" | "flowerbed" | "bench" | "lamp" | "sign" | "bridge" | "kiosk" | "board" | "bollard";
export type Decor = { kind: DecorKind; x: number; y: number; /** 타일 단위 크기(기본 1×1) */ w?: number; h?: number };
export const DECOR: readonly Decor[];
/** 데이터 스트림 수로 — 하단 띠 (plaza x2–12 y26–42와 겹치지 않게 x≥14) */
export const CANAL: { x0: number; x1: number; top: number; bottom: number };
export const ZONES: readonly { zone: Zone; no: number; x0: number; x1: number; /** 안내판 타일 */ signX: number; signY: number }[];
```
- 기존 export(BUILDINGS·STATION_SPOTS·QUEUE_SPOTS·CUSTOMER_SPOTS·COUNSELOR_SPOT·ARCHIVE_SPOT·EXIT_GATE·walkPath·standTile·buildingOf·DOC_ROUTE·PALETTE·STREET·STREET_Y)은 이름·시그니처 유지.
- **지원 시설은 `stations: []`, 상태등 없음.** 실제 존재하는 화면(FlowView)으로 연결되므로 "가짜"가 아니다. 매핑(라벨 → view):
  - 고객 접점: `상담 대기 라운지` → queue · `고객 안내 게시판`(board 장식, view 없음 가능)
  - 데이터 처리: `개인정보 보호 금고` → harness (부제 "PII·비밀 차단 규칙")
  - AI 판단: `시나리오 시뮬레이션실` → scenarios · `검사 항목 안내소` → skills
  - 지식·규제: `법령·기준 도서관` → standards-map · `법 조문 검색소` → search · `설명 가능성 검증실` → explain
  - 답변·승인: `감사 기록 보관소` → audit · `결과 발송센터` → artifacts · `담당자·승인 안내` → approvals
  - 운영 지원: `시스템 모니터링 타워` → monitor · `AI 역할 분담 사무소` → org · `에이전트 휴게소`(공원 장식, view 없음)
  - 10~12개 배치. 빈 구간: 상단 x14–24, x35–44, x54–62 (y4–17) / 하단 x25–34, x45–53 (y26–39) / 하단 띠 y40–43 (x≥14). 지원 건물 크기 ≤ 9×6 타일, 세로로 2개까지 쌓기 가능(사이 1타일 이상).
- 장식(DECOR): 보도(y18·24)와 건물 사이 공터에 가로등(약 10타일 간격)·나무·화단·벤치·볼라드·구역 안내판(ZONES.sign 위치)·수로 위 다리(광장→하단 띠). 장식은 건물 footprint·큰길·STATION_SPOTS·QUEUE_SPOTS·CUSTOMER_SPOTS·COUNSELOR_SPOT·ARCHIVE_SPOT 타일을 점유하지 않는다 (테스트 강제).
- 배치 원칙: 핵심 건물 크고 높게, 지원 건물 작게. 빈 격자가 남지 않도록 공원(bush/tree/bench 묶음)으로 채운다.

## 3. 상태 집계 (lib/officeActors.ts) — Phase A
```ts
export type CityStats = {
  total: number;        // FLOW 스테이션 수 + 1(상담사 승인)
  done: number;         // 완료 스테이션 수 (+1 if approvedAt)
  running: number;      // working 에이전트 수 (0 또는 1)
  waiting: number;      // ready(차례 대기·번역 대기) 수
  blocked: number;      // 차단+중단 수
  remaining: number;    // 아직 차례 안 온 스테이션 수 + (승인 전이면 1)
  activeAgents: number; // working + validating
  needsReview: boolean; // 상담사 검토 대기(hasResult && !approvedAt && applyCheckOk) 또는 중단(입력 보완) 존재
  progressPct: number;  // round(done/total*100)
};
export function cityStats(steps: readonly StepLike[], ctx: ActorCtx): CityStats;
```
테스트: 실행 전 전부 0·pct 0 / busy → running 1·activeAgents 1 / 완주+applyCheckOk → done 7·waiting 1(translate)·remaining 1·needsReview true / 승인 후 → done 8·remaining 0·pct 89.

## 4. 캔버스 (app/_officeCanvas.tsx) — Phase B
props 추가: `selectedBuilding: string | null`, `selectedAgent: string | null`.
- 위 §1 렌더 규칙 전부. 그리기 순서: 원경(화면좌표) → 바닥/도로/보도/광장/수로/구역 바닥 톤(아주 옅게) → 접지 그림자 → 건물(플로어→뒷벽→서벽→낮은 벽→문→설비) → flow band → y정렬 스프라이트 → 텔레메트리.
- 에이전트 동작: 각 역할 에이전트에 `home`(STATION_SPOTS)·`door`(문 안쪽 타일) 두 자리. `working`이면 door로 걸어가고(기존 Mover 재사용) 아니면 home. `validating` 상담사는 손에 문서. 문서 패킷은 기존대로 문 앞 보도까지 이동.
- 앰비언트(!reducedMotion): 유휴 에이전트 1px 바운스(id 해시로 위상 분산, 1.2s 주기) · 모니터/전광판 픽셀 깜빡임 · 가로등 글로우 · 수로 물결(타일 셰이드 교대) · 완료 시 문 위 짧은 성공 스파클(완료로 바뀐 프레임 후 600ms — 상태 전이 시점만 기록, 상태를 지어내지 않음).
- rAF 정책: 이동 중이면 매 프레임, 아니면 `clock` 기준 120ms마다만 draw. `document.hidden`이면 멈춤. reducedMotion이면 정적 1프레임.
- 텔레메트리: 기존 dataset(cux·cuy·dox·doy·gate) 유지 + `dataset.positions = JSON.stringify({ customer:[x,y], doc:[x,y]|null, agents:{[id]:[x,y]} })` (추적 기능이 읽는다).
- 캔버스는 여전히 `aria-hidden`, 한글 금지, `imageSmoothingEnabled=false`.

## 5. 오버레이 (app/_office.tsx) + 배선 (app/_agent.tsx) — Phase C
- **선택 모델**: `selected: { kind: "building" | "agent" | "case" | "gate" | "counselor"; id: string } | null`.
  - 건물 클릭 타깃: footprint 전체를 덮는 투명 버튼(z 아래). aria-label `"{라벨}: {상태 또는 지원 시설}"`, `title` 툴팁(네이티브).
  - 에이전트 클릭 타깃: 기존 STATION_SPOTS·counselor·records 자리 버튼(z 위). `title` 툴팁.
  - 건물 패널: 센터 이름 · 담당 역할(행위자 모델/코드/사람) · 현재 수행 작업(하는일) · 담당 에이전트+상태 · 입력/근거(step.detail) · 사용 도구(행위자 기반 문구: 모델→"LLM 증거 계약", 코드→"결정적 규칙 코드", 사람→"상담사 승인") · 처리 상태 · 처리 시간(step.ms 있을 때만) · 다음 전달 대상(FLOW 다음 스테이션 이름). 지원 시설 패널: 역할 설명 + "이 화면 열기 ▶" → `onNavigate(view, tab)`.
  - 에이전트 패널: 이름·역할 · 현재 목표(하는일) · 현재 위치(건물 라벨) · 상태(글리프+낱말) · 최근 활동(step.detail) · 협업(이전/다음 에이전트 이름) · 검증 상태(status) · "따라가기" 토글(working일 때).
  - 기존 station 패널의 "타임라인에서 보기 ▶", counselor "승인 패널 열기 ▶", case 버튼 유지.
- **HUD(좌상단)**: `cityStats` → 진행률 바 + 칩(현재 단계 · 활성 에이전트 n · 완료 n · 대기 n · 검토 필요/경고 n · 남은 단계 n). 글자는 기존 토큰, 색만으로 구분 금지(글리프 동반). 자동 처리 구역 vs 사람 승인 구역 경계: 큰길 위 x≥64 영역에 HTML 점선 경계+"사람 승인 구역" 라벨.
- **구역 안내판**: ZONES마다 `① 고객 접점 구역` 스타일 HTML 라벨(작게, 흰 반투명 바탕).
- **미니맵(좌하단)**: 160×90 HTML, 건물 rect(kind별 톤)+뷰포트 rect. 클릭 → 그 지점으로 `focusWorld` (zoom ≥ 1.25 유지). 기존 고객 여정 배지는 미니맵 위로.
- **추적(follow)**: `follow: "customer" | "doc" | agentId | null`. on이면 rAF로 `canvas.dataset.positions`를 읽어 중심 이동(setPan). 드래그·휠·전체보기 시 해제.
- **키보드**: 컨테이너 `tabIndex=0`, 방향키 팬(zoom>1), `+`/`-` 줌, `0` 전체 보기, `Home` 현재 단계. 힌트 한 줄.
- **모바일(<1024)**: 기존 칩 미니맵+바텀시트 유지. HUD의 진행률 한 줄만 추가.
- **_agent.tsx**: `onNavigate`를 `<AgentOffice onNavigate={onNavigate}>`로 전달(`void onNavigate` 제거). `_agent-core.ts`에서 0단/1단 step에 `ms: routerUsage?.ms / intakeUsage?.ms` 추가(StepLike에 `ms?: number` 옵션 필드).
- 라벨 위치: 건물 라벨은 뒷벽 간판 자리 `left: x0*TILE+8, top: y0*TILE+6` (Phase B가 같은 자리에 sign plate를 그린다). plaza는 기존 위치.

## 6. 완료 기준 체크 (헤드가 검증)
typecheck·test·lint 통과 → dev 서버 Playwright: 1440·390 스크린샷, 건물 클릭 패널, 에이전트 클릭 패널, 지원 건물 → 화면 이동, 휠/버튼 줌·드래그 팬·전체보기·현재단계·미니맵 클릭, 실행 시나리오(샘플 실행)에서 문서 이동·강조·승인 후 게이트 열림, reduced-motion 에뮬레이션.
