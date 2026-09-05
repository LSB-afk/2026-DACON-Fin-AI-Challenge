import { layoutGraph3D, type LayoutEdge3D, type LayoutNode3D, type Position3D } from "./layout3d.ts";

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function finitePosition(point: Position3D | undefined): point is Position3D {
  return !!point && [point.x, point.y, point.z].every(Number.isFinite);
}

function getPosition(positions: Record<string, Position3D>, id: string): Position3D | undefined {
  const point = Object.hasOwn(positions, id) ? positions[id] : undefined;
  return finitePosition(point) ? point : undefined;
}

function neighborsById(edges: readonly LayoutEdge3D[]): Map<string, string[]> {
  const neighbors = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (source === target) continue;
    if (!neighbors.has(source)) neighbors.set(source, new Set());
    if (!neighbors.has(target)) neighbors.set(target, new Set());
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
  }
  return new Map([...neighbors].map(([id, values]) => [id, [...values].sort(compareIds)]));
}

function relatedPosition(
  node: LayoutNode3D,
  neighbors: Map<string, string[]>,
  get: (id: string) => Position3D | undefined,
): Position3D | undefined {
  if (node.parentId && node.parentId !== node.id) {
    const parent = get(node.parentId);
    if (parent) return parent;
  }
  for (const neighbor of neighbors.get(node.id) ?? []) {
    const point = get(neighbor);
    if (point) return point;
  }
  return undefined;
}

function unitRandom(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 0x1_0000_0000;
}

/** Only newcomers move; bounded candidate sampling separates crowded siblings. */
function placeNewNode(
  id: string,
  anchor: Position3D | undefined,
  occupied: Iterable<Position3D>,
): Position3D {
  const existing = [...occupied];
  let best = { x: 0, y: 0, z: 0, degree: 0 };
  let bestClearance = -1;
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const seed = `${id}:${attempt}`;
    const angle = unitRandom(`${seed}:angle`) * Math.PI * 2;
    const vertical = unitRandom(`${seed}:vertical`) * 2 - 1;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    const radius = anchor
      ? 0.18 + unitRandom(`${seed}:radius`) * 0.28
      : 0.35 + unitRandom(`${seed}:radius`) * 0.6;
    const point = {
      x: (anchor?.x ?? 0) + Math.cos(angle) * horizontal * radius,
      y: (anchor?.y ?? 0) + Math.sin(angle) * horizontal * radius,
      z: (anchor?.z ?? 0) + vertical * radius,
      degree: 0,
    };
    const worldRadius = Math.hypot(point.x, point.y, point.z);
    if (worldRadius > 1.08) {
      point.x *= 1.08 / worldRadius;
      point.y *= 1.08 / worldRadius;
      point.z *= 1.08 / worldRadius;
    }
    let clearance = Infinity;
    for (const other of existing) {
      clearance = Math.min(clearance, Math.hypot(
        point.x - other.x, point.y - other.y, point.z - other.z,
      ));
    }
    if (clearance > bestClearance) {
      best = point;
      bestClearance = clearance;
    }
    if (clearance >= 0.1) break;
  }
  return best;
}

/** Keep survivor coordinates fixed while placing new runtime nodes near their relations. */
export function reconcileGraphPositions(
  nodes: readonly LayoutNode3D[],
  edges: readonly LayoutEdge3D[],
  previous: Record<string, Position3D>,
): Record<string, Position3D> {
  const canonical = [...nodes].sort((a, b) =>
    compareIds(a.id, b.id) || compareIds(a.parentId ?? "", b.parentId ?? ""));
  const unique = canonical.filter((node, index) => index === 0 || node.id !== canonical[index - 1].id);
  const degrees = new Map(unique.map((node) => [node.id, 0]));
  const validEdges = edges.filter((edge) => degrees.has(edge.source) && degrees.has(edge.target));
  for (const edge of validEdges) {
    degrees.set(edge.source, degrees.get(edge.source)! + 1);
    degrees.set(edge.target, degrees.get(edge.target)! + 1);
  }
  const positions = new Map<string, Position3D>();
  for (const node of unique) {
    const previousPoint = getPosition(previous, node.id);
    if (previousPoint) positions.set(node.id, { ...previousPoint });
  }
  if (positions.size === 0) {
    for (const [id, point] of Object.entries(layoutGraph3D(unique, validEdges))) positions.set(id, point);
  } else {
    const neighbors = neighborsById(validEdges);
    const pending = new Map(unique.filter((node) => !positions.has(node.id)).map((node) => [node.id, node]));
    while (pending.size > 0) {
      let placed = false;
      for (const node of pending.values()) {
        if (node.parentId !== node.id && node.parentId && pending.has(node.parentId)) continue;
        const anchor = relatedPosition(node, neighbors, (id) => positions.get(id));
        if (!anchor) continue;
        positions.set(node.id, placeNewNode(node.id, anchor, positions.values()));
        pending.delete(node.id);
        placed = true;
      }
      if (!placed) {
        // A disconnected component or parent cycle needs one deterministic seed.
        const node = pending.values().next().value!;
        const anchor = relatedPosition(node, neighbors, (id) => positions.get(id));
        positions.set(node.id, placeNewNode(node.id, anchor, positions.values()));
        pending.delete(node.id);
      }
    }
  }
  return Object.fromEntries(unique.map((node) => [node.id, {
    ...positions.get(node.id)!, degree: degrees.get(node.id)!,
  }]));
}

/** Start from the current displayed frame so rapid snapshots cannot restart old movement. */
export function getEntrancePositions(
  previous: Record<string, Position3D>,
  target: Record<string, Position3D>,
  nodes: readonly LayoutNode3D[],
  edges: readonly LayoutEdge3D[] = [],
): Record<string, Position3D> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const neighbors = neighborsById(edges);
  const related = (id: string) => Object.hasOwn(target, id)
    ? getPosition(previous, id) ?? getPosition(target, id)
    : undefined;
  return Object.fromEntries(Object.entries(target).map(([id, point]) => {
    const node = nodesById.get(id) ?? { id };
    const source = getPosition(previous, id) ?? relatedPosition(node, neighbors, related) ?? point;
    return [id, { ...source, degree: point.degree }];
  }));
}

/** Smoothstep applies only to geometry; degree always describes the actual target graph. */
export function interpolateGraphPositions(
  from: Record<string, Position3D>,
  to: Record<string, Position3D>,
  progress: number,
): Record<string, Position3D> {
  const fraction = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const eased = fraction * fraction * (3 - 2 * fraction);
  return Object.fromEntries(Object.entries(to).map(([id, target]) => {
    const source = getPosition(from, id) ?? target;
    if (fraction === 0) return [id, { ...source, degree: target.degree }];
    if (fraction === 1) return [id, { ...target }];
    return [id, {
      x: source.x + (target.x - source.x) * eased,
      y: source.y + (target.y - source.y) * eased,
      z: source.z + (target.z - source.z) * eased,
      degree: target.degree,
    }];
  }));
}
