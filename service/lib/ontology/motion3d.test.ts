import { test } from "node:test";
import assert from "node:assert/strict";

import { type Position3D } from "./layout3d.ts";
import {
  getEntrancePositions,
  interpolateGraphPositions,
  reconcileGraphPositions,
} from "./motion3d.ts";

const distance = (a: Position3D, b: Position3D) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const hub = { x: 0.35, y: -0.2, z: 0.15, degree: 7 };

test("snapshot updates preserve surviving coordinates and discard removed nodes", () => {
  const previous = { hub, removed: { x: -0.5, y: 0.4, z: -0.3, degree: 1 } };
  const next = reconcileGraphPositions(
    [{ id: "hub" }, { id: "new", parentId: "hub" }],
    [{ source: "hub", target: "new" }],
    previous,
  );

  assert.deepEqual(next.hub, { ...hub, degree: 1 });
  assert.deepEqual(Object.keys(next), ["hub", "new"]);
  assert.ok(distance(next.new, hub) >= 0.08);
  assert.ok(distance(next.new, hub) <= 0.5);
  assert.deepEqual(previous, { hub, removed: { x: -0.5, y: 0.4, z: -0.3, degree: 1 } });
});

test("degree counts only current valid edges, including both ends of self-loops", () => {
  const nodes = [{ id: "hub" }, { id: "child", parentId: "hub" }];
  const next = reconcileGraphPositions(nodes, [
    { source: "hub", target: "child" },
    { source: "child", target: "child" },
    { source: "missing", target: "hub" },
  ], { hub });

  assert.equal(next.hub.degree, 1);
  assert.equal(next.child.degree, 3);
  assert.equal(reconcileGraphPositions(nodes, [], next).child.degree, 0);
  assert.equal(reconcileGraphPositions([{ id: "only" }], [
    { source: "only", target: "only" },
  ], {}).only.degree, 2);
});

test("reordering inputs and repeating a snapshot never moves a node", () => {
  const nodes = [
    { id: "hub" }, { id: "beta", parentId: "hub" },
    { id: "alpha", parentId: "hub" }, { id: "isolated" },
  ];
  const edges = [{ source: "hub", target: "beta" }, { source: "alpha", target: "beta" }];
  const previous = { hub };
  const next = reconcileGraphPositions(nodes, edges, previous);

  assert.deepEqual(Object.keys(next), ["alpha", "beta", "hub", "isolated"]);
  assert.deepEqual(next, reconcileGraphPositions([...nodes].reverse(), [...edges].reverse(), previous));
  assert.deepEqual(next, reconcileGraphPositions(nodes, edges, next));
});

test("new siblings spread in three dimensions without overlapping or moving their parent", () => {
  const nodes = [
    { id: "hub" },
    ...Array.from({ length: 36 }, (_, index) => ({ id: `child-${index}`, parentId: "hub" })),
  ];
  const next = reconcileGraphPositions(nodes, [], { hub });
  const children = nodes.slice(1).map((node) => next[node.id]);

  assert.deepEqual(next.hub, { ...hub, degree: 0 });
  assert.ok(children.every((point) => distance(point, hub) <= 0.5));
  assert.ok(Math.max(...children.map((point) => point.z)) - Math.min(...children.map((point) => point.z)) > 0.2);
  for (const [index, child] of children.entries()) {
    for (const other of children.slice(index + 1)) {
      assert.ok(distance(child, other) >= 0.075, "siblings need visible separation");
    }
  }
});

test("a new node uses an actual connected neighbor when its parent is absent", () => {
  const next = reconcileGraphPositions([
    { id: "hub" }, { id: "new", parentId: "missing" },
  ], [{ source: "new", target: "hub" }], { hub });

  assert.ok(distance(next.new, hub) <= 0.5);
});

test("new parents are positioned before children even when IDs sort in the opposite order", () => {
  const next = reconcileGraphPositions([
    { id: "hub" }, { id: "z-parent", parentId: "hub" },
    { id: "a-child", parentId: "z-parent" },
  ], [], { hub });

  assert.ok(distance(next["z-parent"], hub) <= 0.5);
  assert.ok(distance(next["a-child"], next["z-parent"]) <= 0.5);
});

test("unrelated newcomers and parent cycles produce finite bounded coordinates", () => {
  const nodes = [
    { id: "hub" }, { id: "unrelated" },
    { id: "cycle-a", parentId: "cycle-b" }, { id: "cycle-b", parentId: "cycle-a" },
  ];
  const next = reconcileGraphPositions(nodes, [], { hub });

  assert.equal(Object.keys(next).length, nodes.length);
  assert.ok(Object.values(next).every((point) =>
    [point.x, point.y, point.z].every(Number.isFinite)
      && Math.hypot(point.x, point.y, point.z) <= 1.1));
});

test("empty and initial singleton layouts are finite and centered", () => {
  assert.deepEqual(reconcileGraphPositions([], [], { hub }), {});
  assert.deepEqual(reconcileGraphPositions([{ id: "only" }], [], {}), {
    only: { x: 0, y: 0, z: 0, degree: 0 },
  });
});

test("invalid cached coordinates do not spread NaN to the next snapshot", () => {
  const next = reconcileGraphPositions([{ id: "hub" }, { id: "child", parentId: "hub" }], [], {
    hub: { x: NaN, y: 0, z: 0, degree: 0 },
  });

  assert.equal(Object.keys(next).length, 2);
  assert.ok(Object.values(next).every((point) =>
    [point.x, point.y, point.z, point.degree].every(Number.isFinite)));
});

test("new nodes enter from their parent while survivors retain the displayed interruption position", () => {
  const nodes = [{ id: "hub" }, { id: "child", parentId: "hub" }];
  const target = {
    hub: { x: 0.7, y: 0.4, z: -0.2, degree: 1 },
    child: { x: 0.9, y: 0.3, z: 0.1, degree: 1 },
  };
  const entrances = getEntrancePositions({ hub }, target, nodes);

  assert.deepEqual(entrances.hub, { ...hub, degree: 1 });
  assert.deepEqual(entrances.child, { ...hub, degree: 1 });
  assert.deepEqual(target.child, { x: 0.9, y: 0.3, z: 0.1, degree: 1 });
});

test("entrance uses a connected neighbor and excludes removed nodes", () => {
  const target = { child: { x: 0.6, y: -0.1, z: 0.2, degree: 1 }, hub: { ...hub, degree: 1 } };
  const entrances = getEntrancePositions(
    { hub, removed: hub }, target,
    [{ id: "hub" }, { id: "child" }], [{ source: "hub", target: "child" }],
  );

  assert.deepEqual(entrances.child, { ...hub, degree: 1 });
  assert.equal(Object.hasOwn(entrances, "removed"), false);
});

test("interpolation has exact endpoints and eases movement without tweening degree", () => {
  const from = { point: { x: 0, y: 0, z: 0, degree: 0 } };
  const to = { point: { x: 1, y: -1, z: 0.5, degree: 3 } };

  assert.deepEqual(interpolateGraphPositions(from, to, 0), { point: { ...from.point, degree: 3 } });
  assert.deepEqual(interpolateGraphPositions(from, to, 1), to);
  assert.deepEqual(interpolateGraphPositions(from, to, 0.5), {
    point: { x: 0.5, y: -0.5, z: 0.25, degree: 3 },
  });
  assert.ok(interpolateGraphPositions(from, to, 0.1).point.x < 0.1);
  assert.ok(interpolateGraphPositions(from, to, 0.9).point.x > 0.9);
});

test("interrupted transitions restart exactly at the current displayed coordinates", () => {
  const start = { hub };
  const firstTarget = { hub: { x: 0.9, y: 0.5, z: -0.4, degree: 0 } };
  const interrupted = interpolateGraphPositions(start, firstTarget, 0.32);
  const nodes = [{ id: "hub" }, { id: "new", parentId: "hub" }];
  const nextTarget = reconcileGraphPositions(nodes, [], firstTarget);
  const nextStart = getEntrancePositions(interrupted, nextTarget, nodes);

  assert.deepEqual(Object.keys(nextStart), ["hub", "new"]);
  assert.deepEqual(interpolateGraphPositions(nextStart, nextTarget, 0).hub, interrupted.hub);
  for (const progress of [0, 0.001, 0.3, 0.999, 1]) {
    assert.ok(Object.values(interpolateGraphPositions(nextStart, nextTarget, progress))
      .every((point) => [point.x, point.y, point.z, point.degree].every(Number.isFinite)));
  }
});

test("interpolation clamps overshoot, handles empty sources and drops removed targets", () => {
  const from = { hub, removed: hub };
  const to = { hub: { x: -0.5, y: 0.2, z: 0.7, degree: 2 } };

  assert.deepEqual(interpolateGraphPositions(from, to, -1), { hub: { ...hub, degree: 2 } });
  assert.deepEqual(interpolateGraphPositions(from, to, 2), to);
  assert.deepEqual(interpolateGraphPositions(from, to, NaN), { hub: { ...hub, degree: 2 } });
  assert.deepEqual(interpolateGraphPositions({}, to, 0.5), to);
  assert.deepEqual(interpolateGraphPositions(from, {}, 0.5), {});
});
