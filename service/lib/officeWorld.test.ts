import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW } from "./flow.ts";
import { WORLD, HUB, BUILDINGS, STATION_SPOTS, FURNITURE, QUEUE_SPOTS, CUSTOMER_SPOTS, COUNSELOR_SPOT, ARCHIVE_SPOT, buildingOf, standTile, walkPath, isWalkable, type Point } from "./officeWorld.ts";
import { project, unproject, PROJECTED_BOUNDS, roomAnchor, roomPolygon } from "./officeProjection.ts";

test("expanded floor has 24 purposeful spaces and a genuinely central consultation hub", () => {
  assert.ok(WORLD.w * WORLD.h >= 80 * 45 * 1.5);
  assert.equal(BUILDINGS.length, 24);
  assert.ok(Math.abs(HUB.x / WORLD.w - 0.5) < 0.1 && Math.abs(HUB.y / WORLD.h - 0.5) < 0.1);
  assert.equal(new Set(BUILDINGS.map(b => b.zone)).size, 6);
  assert.ok(STATION_SPOTS.input.x > STATION_SPOTS.extract.x);
  assert.ok(STATION_SPOTS.input.x < STATION_SPOTS.judge.x);
  assert.ok(STATION_SPOTS.input.y > STATION_SPOTS.ontology.y);
  assert.ok(STATION_SPOTS.input.y < STATION_SPOTS.narrate.y);
});
test("each FLOW id maps once to a real room and its unobstructed workstation", () => {
  assert.deepEqual(Object.keys(STATION_SPOTS).sort(), FLOW.map(s => s.id).sort());
  assert.equal(new Set(BUILDINGS.flatMap(b => b.stations)).size, FLOW.length);
  for (const [id, s] of Object.entries(STATION_SPOTS)) {
    const b = buildingOf(id)!;
    assert.equal(b.id, s.buildingId);
    assert.ok(s.x > b.x0 && s.x < b.x1 && s.y > b.y0 && s.y < b.y1);
    assert.ok(isWalkable(s.x, s.y), `${id} station intersects furniture`);
  }
});
test("rooms are distinct, inside the floor and support rooms link to product surfaces", () => {
  for (const [i, b] of BUILDINGS.entries()) {
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < WORLD.w && b.y1 < WORLD.h);
    if (b.kind === "support") assert.ok(b.view, `${b.id} missing support destination`);
    for (const other of BUILDINGS.slice(i + 1)) assert.ok(!(b.x0 < other.x1 && b.x1 > other.x0 && b.y0 < other.y1 && b.y1 > other.y0), `${b.id}/${other.id} overlap`);
  }
  for (const f of FURNITURE) {
    const b = BUILDINGS.find(b => b.id === f.room)!;
    assert.ok(f.x > b.x0 && f.y > b.y0 && f.x + f.w < b.x1 && f.y + f.h < b.y1, `${f.id} outside room`);
  }
});
function checkPath(from: Point, to: Point) {
  assert.ok(isWalkable(from.x, from.y), `blocked origin ${JSON.stringify(from)}`);
  assert.ok(isWalkable(to.x, to.y), `blocked target ${JSON.stringify(to)}`);
  const path = walkPath(from, to);
  if (from.x === to.x && from.y === to.y) { assert.deepEqual(path, []); return; }
  assert.deepEqual(path.at(-1), to, `unreachable ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  let prev = from;
  for (const p of path) {
    assert.ok(prev.x === p.x || prev.y === p.y, "movement must stay cardinal through doorways");
    const length = Math.hypot(p.x - prev.x, p.y - prev.y);
    for (let n = 0; n <= length * 4; n++) {
      const t = n / (length * 4 || 1);
      assert.ok(isWalkable(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t), `collision at ${JSON.stringify(prev)} → ${JSON.stringify(p)}`);
    }
    prev = p;
  }
}
test("all roles, customers and actual room doors are reachable through collision-free corridors", () => {
  const destinations = [...Object.values(STATION_SPOTS).map(({x,y})=>({x,y})), COUNSELOR_SPOT, ARCHIVE_SPOT, ...QUEUE_SPOTS, ...Object.values(CUSTOMER_SPOTS), ...BUILDINGS.filter(b=>b.doorSide!=="open").map(b=>({x:b.doorX,y:b.doorY}))];
  for (const p of destinations) checkPath(HUB, p);
  for (const from of Object.keys(STATION_SPOTS)) for (const to of Object.keys(STATION_SPOTS)) checkPath(standTile(from), standTile(to));
});
test("adjacent hub work does not detour to the old mandatory street", () => {
  const route = walkPath(HUB, CUSTOMER_SPOTS.waitingProcessing);
  assert.ok(route.every(p => p.x >= 50 && p.x <= 56 && p.y >= 32 && p.y <= 38));
  checkPath({ x: 52, y: 34.5 }, CUSTOMER_SPOTS.waitingProcessing);
});
test("blocked paths are rejected and tall walls remain solid outside door openings", () => {
  assert.deepEqual(walkPath(HUB, { x: 3, y: 3 }), []);
  for (const b of BUILDINGS.filter(b=>b.doorSide!=="open")) {
    assert.equal(isWalkable(b.x0, b.y0), false);
    assert.equal(isWalkable(b.doorX, b.doorY), true, `${b.id} blocked door`);
  }
});
test("projection, inverse, labels and room polygons use the same isometric coordinates", () => {
  for (const p of [HUB, {x:0,y:0}, {x:WORLD.w,y:WORLD.h}, {x:7.25,y:19.75}]) {
    assert.deepEqual(unproject(project(p.x,p.y).x, project(p.x,p.y).y), p);
    assert.equal(project(p.x,p.y,3).y, project(p.x,p.y).y - 48);
  }
  for (const b of BUILDINGS) {
    assert.equal(roomPolygon(b).length, 4);
    for (const p of [...roomPolygon(b,b.wallH/16), roomAnchor(b)]) {
      assert.ok(p.x>=PROJECTED_BOUNDS.x0 && p.x<=PROJECTED_BOUNDS.x1 && p.y>=PROJECTED_BOUNDS.y0 && p.y<=PROJECTED_BOUNDS.y1);
    }
  }
});
