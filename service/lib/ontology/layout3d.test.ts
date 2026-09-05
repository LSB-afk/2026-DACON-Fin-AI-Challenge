import { test } from "node:test";
import assert from "node:assert/strict";

import { layoutGraph3D, projectPoint3D } from "./layout3d.ts";

const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test("empty and singleton graphs have finite centered layouts", () => {
  assert.deepEqual(layoutGraph3D([], []), {});
  assert.deepEqual(layoutGraph3D([{ id: "only" }], []), {
    only: { x: 0, y: 0, z: 0, degree: 0 },
  });
});

test("a 99-node graph stays centered, bounded and genuinely three-dimensional", () => {
  const nodes = Array.from({ length: 99 }, (_, index) => ({
    id: `node-${String(index).padStart(2, "0")}`,
    parentId: index === 0 ? null : `node-${String(Math.floor((index - 1) / 3)).padStart(2, "0")}`,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    source: nodes[index].id,
    target: node.id,
    ignoredByLayoutType: "extra fields are allowed",
  }));
  edges.push({ source: "missing", target: "node-00", ignoredByLayoutType: "invalid endpoint" });

  const layout = layoutGraph3D(nodes, edges);
  const positions = Object.values(layout);

  assert.deepEqual(Object.keys(layout), nodes.map((node) => node.id));
  assert.ok(positions.every((position) =>
    [position.x, position.y, position.z, position.degree].every(Number.isFinite)));
  assert.ok(Math.max(...positions.map((position) =>
    Math.hypot(position.x, position.y, position.z))) <= 1 + Number.EPSILON);
  assert.ok(Math.abs(positions.reduce((sum, position) => sum + position.x, 0)) < 1e-10);
  assert.ok(Math.abs(positions.reduce((sum, position) => sum + position.y, 0)) < 1e-10);
  assert.ok(Math.abs(positions.reduce((sum, position) => sum + position.z, 0)) < 1e-10);
  const zValues = positions.map((position) => position.z);
  assert.ok(Math.max(...zValues) - Math.min(...zValues) > 0.25);
  assert.equal(layout["node-00"].degree, 1, "missing endpoints must not inflate degree");
});

test("node and edge input order cannot change deterministic coordinates", () => {
  const nodes = [
    { id: "root", parentId: null },
    { id: "alpha", parentId: "root" },
    { id: "beta", parentId: "root" },
    { id: "gamma", parentId: null },
  ];
  const edges = [
    { source: "alpha", target: "gamma" },
    { source: "root", target: "beta" },
  ];

  assert.deepEqual(
    layoutGraph3D(nodes, edges),
    layoutGraph3D([...nodes].reverse(), [...edges].reverse()),
  );
});

test("an actual edge increases endpoint proximity and determines displayed degree", () => {
  const nodes = [
    { id: "alpha" }, { id: "beta" }, { id: "gamma" },
    { id: "delta" }, { id: "epsilon" }, { id: "zeta" },
  ];
  const withoutEdge = layoutGraph3D(nodes, []);
  const withEdge = layoutGraph3D(nodes, [{ source: "alpha", target: "zeta" }]);

  assert.ok(
    distance(withEdge.alpha, withEdge.zeta) < distance(withoutEdge.alpha, withoutEdge.zeta),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(withEdge).map(([id, position]) => [id, position.degree])),
    { alpha: 1, beta: 0, delta: 0, epsilon: 0, gamma: 0, zeta: 1 },
  );
});

test("parent links attract structural relatives without synthesizing displayed degree", () => {
  const unrelated = layoutGraph3D([{ id: "parent" }, { id: "child" }, { id: "other" }], []);
  const related = layoutGraph3D([
    { id: "parent" },
    { id: "child", parentId: "parent" },
    { id: "other" },
  ], []);

  assert.ok(distance(related.parent, related.child) < distance(unrelated.parent, unrelated.child));
  assert.equal(related.parent.degree, 0);
  assert.equal(related.child.degree, 0);
});

test("layout ignores missing endpoints and never mutates caller-owned inputs", () => {
  const nodes = [{ id: "a", parentId: "missing", meta: { label: "A" } }, { id: "b" }];
  const edges = [{ source: "a", target: "missing", meta: { label: "broken" } }];
  const beforeNodes = structuredClone(nodes);
  const beforeEdges = structuredClone(edges);

  const layout = layoutGraph3D(nodes, edges);

  assert.deepEqual(nodes, beforeNodes);
  assert.deepEqual(edges, beforeEdges);
  assert.deepEqual(Object.keys(layout), ["a", "b"]);
  assert.equal(layout.a.degree, 0);
  assert.equal(layout.b.degree, 0);
  assert.ok(Object.values(layout).every((position) =>
    [position.x, position.y, position.z].every(Number.isFinite)));
});

test("projection applies yaw before pitch so a quarter turn changes x into depth", () => {
  const projected = projectPoint3D(
    { x: 1, y: 0, z: 0, degree: 0 },
    { yaw: Math.PI / 2, pitch: 0, zoom: 1 },
    200,
    100,
  );

  assert.ok(Math.abs(projected.x - 100) < 1e-10);
  assert.ok(Math.abs(projected.y - 50) < 1e-10);
  assert.ok(Math.abs(projected.depth + 1) < 1e-10);
});

test("positive depth receives greater perspective scale than negative depth", () => {
  const camera = { yaw: 0, pitch: 0, zoom: 1 };
  const near = projectPoint3D({ x: 0.5, y: 0, z: 0.8, degree: 1 }, camera, 200, 100);
  const far = projectPoint3D({ x: 0.5, y: 0, z: -0.8, degree: 1 }, camera, 200, 100);

  assert.ok(near.scale > 1);
  assert.ok(far.scale < 1);
  assert.ok(near.x - 100 > far.x - 100);
});

test("projection remains finite at tiny viewport edges and compound rotations", () => {
  for (const point of [
    { x: 1, y: 0, z: 0, degree: 0 },
    { x: 0, y: -1, z: 0, degree: 0 },
    { x: 0, y: 0, z: 1, degree: 0 },
  ]) {
    const projected = projectPoint3D(
      point,
      { yaw: Math.PI * 1.75, pitch: -Math.PI * 0.45, zoom: 1.8 },
      1,
      1,
    );
    assert.ok([projected.x, projected.y, projected.depth, projected.scale].every(Number.isFinite));
  }
});
