/**
 * 운영 도시 지도 ↔ FLOW 정합 — 공간이 곧 논리임을 강제한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW } from "./flow.ts";
import {
  WORLD, TILE, BUILDINGS, STATION_SPOTS, STREET, STREET_Y,
  QUEUE_SPOTS, CUSTOMER_SPOTS, EXIT_GATE, COUNSELOR_SPOT, ARCHIVE_SPOT,
  buildingOf, standTile, walkPath, DOC_ROUTE, DECOR, CANAL, ZONES,
} from "./officeWorld.ts";

const ALLOWED_VIEWS = new Set([
  "monitor", "agent-run", "audit", "artifacts", "standards-map", "skills",
  "ontology", "org", "queue", "harness", "search", "scenarios", "approvals", "explain",
]);

function overlaps(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

test("월드는 16px 타일의 1280×720 — 16:9 고정 비율", () => {
  assert.equal(TILE, 16);
  assert.equal(WORLD.w * TILE, 1280);
  assert.equal(WORLD.h * TILE, 720);
  assert.equal((WORLD.w * TILE) * 9, (WORLD.h * TILE) * 16);
});

test("모든 FLOW 단계는 정확히 하나의 도시 스테이션·건물에 매핑된다", () => {
  assert.deepEqual(Object.keys(STATION_SPOTS).sort(), FLOW.map((s) => s.id).sort());
  for (const id of FLOW.map((s) => s.id)) {
    const spot = STATION_SPOTS[id];
    const b = buildingOf(id);
    assert.ok(b, `${id}를 담는 건물 없음`);
    assert.equal(spot.buildingId, b!.id);
    assert.ok(spot.x >= b!.x0 && spot.x <= b!.x1 && spot.y >= b!.y0 && spot.y <= b!.y1, `${id} 자리가 건물 밖`);
  }
  // 한 스테이션이 두 건물에 들어가지 않는다
  const all = BUILDINGS.flatMap((b) => b.stations);
  assert.equal(new Set(all).size, all.length);
});

test("건물 배치가 처리 순서를 따른다 — FLOW 순서대로 x 단조 증가", () => {
  const xs = FLOW.map((s) => STATION_SPOTS[s.id].x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], `${FLOW[i].id} 배치가 순서 역행`);
  // 문서 경유 순서는 FLOW 그대로
  assert.deepEqual([...DOC_ROUTE], FLOW.map((s) => s.id));
});

test("건물은 큰길을 침범하지 않고, 문은 자기 건물 폭 안에 있다", () => {
  for (const b of BUILDINGS) {
    const overlapsStreet = b.y0 <= STREET.bottom && b.y1 >= STREET.top;
    assert.ok(!overlapsStreet, `${b.id}가 큰길을 침범`);
    assert.ok(b.doorX >= b.x0 && b.doorX <= b.x1, `${b.id} 문이 건물 밖`);
  }
});

test("걷기 경로는 큰길을 경유하고 목적지에 닿는다", () => {
  const from = standTile("input");
  const to = standTile("judge");
  const path = walkPath(from, to);
  assert.ok(path.some((p) => p.y === STREET_Y), "큰길을 지나지 않음");
  assert.deepEqual(path[path.length - 1], to);
  // 광장 → 접수 앞 (고객 여정의 첫 걸음)
  const enter = walkPath(QUEUE_SPOTS[0], CUSTOMER_SPOTS.consulting);
  assert.deepEqual(enter[enter.length - 1], CUSTOMER_SPOTS.consulting);
});

test("게이트·창구·광장 좌표가 월드 안에 있다", () => {
  for (const p of [COUNSELOR_SPOT, ...QUEUE_SPOTS, CUSTOMER_SPOTS.consulting, CUSTOMER_SPOTS.waitingApproval, CUSTOMER_SPOTS.receivingResult]) {
    assert.ok(p.x >= 0 && p.x < WORLD.w && p.y >= 0 && p.y < WORLD.h);
  }
  assert.ok(EXIT_GATE.x >= WORLD.w - 3, "게이트는 우측 벽에 있다");
});

test("건물은 서로 겹치지 않는다", () => {
  for (let i = 0; i < BUILDINGS.length; i++) {
    for (let j = i + 1; j < BUILDINGS.length; j++) {
      assert.ok(!overlaps(BUILDINGS[i], BUILDINGS[j]), `${BUILDINGS[i].id} ↔ ${BUILDINGS[j].id} 겹침`);
    }
  }
});

test("모든 건물은 월드 안에 있다", () => {
  for (const b of BUILDINGS) {
    assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 < WORLD.w && b.y1 < WORLD.h, `${b.id}가 월드 밖`);
  }
});

test("지원 시설은 스테이션이 없고, 실재하는 화면으로 이어진다", () => {
  const support = BUILDINGS.filter((b) => b.kind === "support");
  assert.ok(support.length >= 10 && support.length <= 12, "지원 시설 10~12개");
  for (const b of support) {
    assert.equal(b.stations.length, 0, `${b.id}는 stations 없어야 함`);
    assert.ok(b.view && ALLOWED_VIEWS.has(b.view), `${b.id} view가 실재 화면이 아님: ${b.view}`);
  }
});

test("핵심 건물은 정확히 기존 8개다", () => {
  const core = BUILDINGS.filter((b) => b.kind === "core");
  assert.deepEqual(
    core.map((b) => b.id).sort(),
    ["answer", "bank", "extraction", "guardrail", "judgment", "ontology", "reception", "routing"].sort(),
  );
});

test("DECOR는 건물·큰길·기존 자리를 침범하지 않는다", () => {
  const spots = [
    ...Object.values(STATION_SPOTS),
    ...QUEUE_SPOTS,
    ...Object.values(CUSTOMER_SPOTS),
    COUNSELOR_SPOT,
    ARCHIVE_SPOT,
  ];
  for (const d of DECOR) {
    assert.ok(d.x >= 0 && d.x < WORLD.w && d.y >= 0 && d.y < WORLD.h, `${d.kind}(${d.x},${d.y})가 월드 밖`);
    assert.ok(!(d.y >= STREET.top && d.y <= STREET.bottom), `${d.kind}(${d.x},${d.y})가 큰길 위`);
    assert.ok(!spots.some((s) => s.x === d.x && s.y === d.y), `${d.kind}(${d.x},${d.y})가 기존 자리 위`);
    assert.ok(
      !BUILDINGS.some((b) => d.x >= b.x0 && d.x <= b.x1 && d.y >= b.y0 && d.y <= b.y1),
      `${d.kind}(${d.x},${d.y})가 건물 안`,
    );
  }
});

test("CANAL은 어떤 건물과도 겹치지 않는다", () => {
  for (const b of BUILDINGS) {
    const canalRect = { x0: CANAL.x0, y0: CANAL.top, x1: CANAL.x1, y1: CANAL.bottom };
    assert.ok(!overlaps(b, canalRect), `${b.id}가 수로와 겹침`);
  }
});

test("no 값은 kind별로 유일하고, ZONES no는 1..6 유일하다", () => {
  for (const kind of ["plaza", "core", "support"] as const) {
    const nos = BUILDINGS.filter((b) => b.kind === kind).map((b) => b.no);
    assert.equal(new Set(nos).size, nos.length, `${kind} no 중복`);
  }
  assert.deepEqual(ZONES.map((z) => z.no).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(ZONES.map((z) => z.no)).size, 6);
});
