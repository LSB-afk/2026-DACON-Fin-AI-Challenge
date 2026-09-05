import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMBIENT_DESTINATIONS,
  advanceMoverAndCombine,
  createOfficeMotion,
  officeActivityTelemetry,
  tickOfficeMotion,
  type OfficeMotionState,
} from "./officeMotion.ts";
import { AGENT_ROLES, type AgentState } from "./officeActors.ts";
import { isWalkable, standTile, walkPath, type Point } from "./officeWorld.ts";

const ids = AGENT_ROLES.map((agent) => agent.id);
const idleAgents = Object.fromEntries(ids.map((id) => [id, "idle"])) as Record<string, AgentState>;

function assertSafeSegment(from: Point, to: Point) {
  assert.ok(from.x === to.x || from.y === to.y, `diagonal route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  for (let step = 0; step <= length * 8; step++) {
    const progress = step / (length * 8 || 1);
    assert.ok(isWalkable(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress));
  }
}

function tickAt(motion: OfficeMotionState, nowMs: number, overrides: Partial<Parameters<typeof tickOfficeMotion>[1]> = {}) {
  return tickOfficeMotion(motion, {
    nowMs,
    ambientMotion: true,
    reducedMotion: false,
    hidden: false,
    agents: idleAgents,
    ...overrides,
  });
}

test("ambient destinations and every staff trip use the real collision-free walk graph", () => {
  for (const destination of AMBIENT_DESTINATIONS) {
    assert.ok(isWalkable(destination.point.x, destination.point.y), `${destination.id} is blocked`);
    for (const id of ids) {
      const start = standTile(id);
      const route = walkPath(start, destination.point);
      assert.deepEqual(route.at(-1), destination.point, `${id} cannot reach ${destination.id}`);
      let previous = start;
      for (const point of route) {
        assertSafeSegment(previous, point);
        previous = point;
      }
    }
  }
});

test("time-based ambient movement is deterministic and staggered by staff identity", () => {
  const first = createOfficeMotion(ids, 0);
  const second = createOfficeMotion(ids, 0);
  assert.deepEqual(first, second);
  assert.ok(new Set(Object.values(first.staff).map((staff) => staff.nextDecisionAt)).size > 3);

  const firstDeparture = Math.min(...Object.values(first.staff).map((staff) => staff.nextDecisionAt));
  const a = tickAt(first, firstDeparture + 500).motion;
  const b = tickAt(second, firstDeparture + 500).motion;
  assert.deepEqual(a, b);
  assert.ok(Object.values(a.staff).some((staff) => staff.activity.kind === "walking"));
  assert.ok(Object.values(a.staff).some((staff) => staff.activity.kind === "idle"));
});

test("customer movement advances independently while staff movement is active", () => {
  const customer = { position: { x: 0, y: 0 }, destination: { x: 2, y: 0 }, path: [{ x: 2, y: 0 }] };

  const moving = advanceMoverAndCombine(customer, 0.1, 6, true);

  assert.equal(moving, true);
  assert.ok(Math.abs(customer.position.x - 0.6) < 1e-9);
  assert.equal(customer.position.y, 0);
});

test("actual work interrupts an ambient trip and brings the agent back to its real desk", () => {
  let motion = createOfficeMotion(["routing"], 0);
  const departure = motion.staff.routing.nextDecisionAt;
  motion = tickAt(motion, departure + 300).motion;
  assert.equal(motion.staff.routing.activity.ambient, true);
  assert.equal(motion.staff.routing.activity.kind, "walking");

  const businessAgents = { ...idleAgents, routing: "working" as const };
  const interrupted = tickAt(motion, departure + 400, { agents: businessAgents }).motion;
  assert.deepEqual(interrupted.staff.routing.destination, standTile("routing"));
  assert.equal(interrupted.staff.routing.activity.ambient, false);

  let returned = interrupted;
  for (let nowMs = departure + 500; nowMs < departure + 30_000 && returned.staff.routing.activity.kind !== "desk-work"; nowMs += 100) {
    returned = tickAt(returned, nowMs, { agents: businessAgents }).motion;
  }
  assert.deepEqual(returned.staff.routing.position, standTile("routing"));
  assert.equal(returned.staff.routing.activity.kind, "desk-work");
  assert.equal(returned.staff.routing.activity.ambient, false);
});

test("disabled and reduced motion restore desks while hidden time neither moves nor catches up", () => {
  let motion = createOfficeMotion(["extract"], 0);
  const departure = motion.staff.extract.nextDecisionAt;
  motion = tickAt(motion, departure + 300).motion;
  const beforeHidden = motion.staff.extract.position;
  const hidden = tickAt(motion, departure + 20_000, { hidden: true }).motion;
  assert.deepEqual(hidden.staff.extract.position, beforeHidden);
  const resumed = tickAt(hidden, departure + 20_100).motion;
  assert.ok(Math.hypot(resumed.staff.extract.position.x - beforeHidden.x, resumed.staff.extract.position.y - beforeHidden.y) < 0.5);

  const disabled = tickAt(resumed, departure + 20_200, { ambientMotion: false }).motion;
  assert.deepEqual(disabled.staff.extract.position, standTile("extract"));
  assert.equal(disabled.staff.extract.activity.kind, "idle");
  const reduced = tickAt(motion, departure + 20_200, { reducedMotion: true }).motion;
  assert.deepEqual(reduced.staff.extract.position, standTile("extract"));
  assert.equal(reduced.staff.extract.activity.kind, "idle");
});

test("idle staff keeps its remaining departure delay while the document is hidden", () => {
  const motion = createOfficeMotion(["extract"], 0);
  const before = motion.staff.extract;
  const hiddenForMs = 20_000;

  const hidden = tickAt(motion, hiddenForMs, { hidden: true }).motion;
  const resumed = tickAt(hidden, hiddenForMs + 100).motion;

  assert.deepEqual(resumed.staff.extract.position, before.position);
  assert.equal(resumed.staff.extract.activity.kind, "idle");
  assert.equal(resumed.staff.extract.nextDecisionAt, before.nextDecisionAt + hiddenForMs);
});

test("the visual ticker never mutates business statuses or counts", () => {
  const agents = Object.freeze({ ...idleAgents, judge: "working" as const });
  const statuses = Object.freeze({ input: "완료", judge: "대기" });
  const snapshot = JSON.stringify({ agents, statuses });
  const motion = createOfficeMotion(ids, 0);
  tickOfficeMotion(motion, {
    nowMs: 10_000,
    ambientMotion: true,
    reducedMotion: false,
    hidden: false,
    agents,
  });
  assert.equal(JSON.stringify({ agents, statuses }), snapshot);
});

test("activity telemetry is separate, minimal, and explicit about ambient office life", () => {
  let motion = createOfficeMotion(["guard"], 0);
  const departure = motion.staff.guard.nextDecisionAt;
  motion = tickAt(motion, departure + 250).motion;
  assert.deepEqual(officeActivityTelemetry(motion), {
    guard: {
      kind: "walking",
      destination: motion.staff.guard.activity.destination,
      ambient: true,
    },
  });
});
