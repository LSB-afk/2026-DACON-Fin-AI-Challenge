export type LayoutNode3D = {
  id: string;
  parentId?: string | null;
};

export type LayoutEdge3D = {
  source: string;
  target: string;
};

export type Position3D = {
  x: number;
  y: number;
  z: number;
  /** Incident valid edges supplied by the renderer; parentId alone does not add degree. */
  degree: number;
};

export type Camera3D = {
  yaw: number;
  pitch: number;
  zoom: number;
};

export type ProjectedPoint3D = {
  x: number;
  y: number;
  depth: number;
  scale: number;
};

type Vector3 = { x: number; y: number; z: number };
type Spring = { a: number; b: number; weight: number };

const ITERATIONS = 180;
const EPSILON = 1e-9;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function unitRandom(id: string, salt: string): number {
  return hash32(`${salt}:${id}`) / 0x1_0000_0000;
}

/** Hash-seeded points in a ball avoid imposing a grid, ring, or input-order axis. */
function initialPosition(id: string): Vector3 {
  const longitude = Math.PI * 2 * unitRandom(id, "longitude");
  const vertical = unitRandom(id, "vertical") * 2 - 1;
  const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
  const radius = 0.35 + unitRandom(id, "radius") * 0.35;
  return {
    x: Math.cos(longitude) * horizontal * radius,
    y: Math.sin(longitude) * horizontal * radius,
    z: vertical * radius,
  };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function normalizedDirection(a: number, b: number): Vector3 {
  const theta = unitRandom(`${a}:${b}`, "collision-theta") * Math.PI * 2;
  const z = unitRandom(`${a}:${b}`, "collision-z") * 2 - 1;
  const plane = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: Math.cos(theta) * plane, y: Math.sin(theta) * plane, z };
}

/**
 * Deterministic, bounded force-directed placement for small ontology graphs.
 * Explicit edges determine display degree; parentId contributes only a structural spring.
 */
export function layoutGraph3D<Node extends LayoutNode3D, Edge extends LayoutEdge3D>(
  nodes: readonly Node[],
  edges: readonly Edge[],
): Record<string, Position3D> {
  const canonicalNodes = nodes
    .map((node) => ({ id: node.id, parentId: node.parentId ?? null }))
    .sort((a, b) => compareText(a.id, b.id) || compareText(a.parentId ?? "", b.parentId ?? ""));
  const uniqueNodes = canonicalNodes.filter((node, index) =>
    index === 0 || node.id !== canonicalNodes[index - 1].id);
  if (uniqueNodes.length === 0) return {};
  if (uniqueNodes.length === 1) {
    return { [uniqueNodes[0].id]: { x: 0, y: 0, z: 0, degree: 0 } };
  }

  const indices = new Map(uniqueNodes.map((node, index) => [node.id, index]));
  const degrees = Array.from({ length: uniqueNodes.length }, () => 0);
  const springWeights = new Map<string, Spring>();

  const addSpring = (a: number, b: number, weight: number) => {
    if (a === b) return;
    const key = pairKey(a, b);
    const existing = springWeights.get(key);
    if (existing) existing.weight += weight;
    else springWeights.set(key, { a: Math.min(a, b), b: Math.max(a, b), weight });
  };

  for (const [index, node] of uniqueNodes.entries()) {
    if (!node.parentId) continue;
    const parent = indices.get(node.parentId);
    if (parent !== undefined) addSpring(index, parent, 0.8);
  }

  const canonicalEdges = edges
    .map((edge) => ({ source: edge.source, target: edge.target }))
    .sort((a, b) => compareText(a.source, b.source) || compareText(a.target, b.target));
  for (const edge of canonicalEdges) {
    const source = indices.get(edge.source);
    const target = indices.get(edge.target);
    if (source === undefined || target === undefined) continue;
    degrees[source] += 1;
    degrees[target] += 1;
    addSpring(source, target, 1);
  }

  const springs = [...springWeights.values()].sort((a, b) => a.a - b.a || a.b - b.b);
  const positions = uniqueNodes.map((node) => initialPosition(node.id));
  const velocities = uniqueNodes.map((): Vector3 => ({ x: 0, y: 0, z: 0 }));

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const forces = uniqueNodes.map((): Vector3 => ({ x: 0, y: 0, z: 0 }));
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        let dx = positions[b].x - positions[a].x;
        let dy = positions[b].y - positions[a].y;
        let dz = positions[b].z - positions[a].z;
        let distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared < EPSILON) {
          const direction = normalizedDirection(a, b);
          dx = direction.x * 0.001;
          dy = direction.y * 0.001;
          dz = direction.z * 0.001;
          distanceSquared = 0.000001;
        }
        const distance = Math.sqrt(distanceSquared);
        const repulsion = 0.006 / (distanceSquared + 0.02);
        const fx = (dx / distance) * repulsion;
        const fy = (dy / distance) * repulsion;
        const fz = (dz / distance) * repulsion;
        forces[a].x -= fx;
        forces[a].y -= fy;
        forces[a].z -= fz;
        forces[b].x += fx;
        forces[b].y += fy;
        forces[b].z += fz;
      }
    }

    for (const spring of springs) {
      const dx = positions[spring.b].x - positions[spring.a].x;
      const dy = positions[spring.b].y - positions[spring.a].y;
      const dz = positions[spring.b].z - positions[spring.a].z;
      const distance = Math.max(EPSILON, Math.hypot(dx, dy, dz));
      const attraction = (distance - 0.3) * 0.075 * Math.min(spring.weight, 3);
      const fx = (dx / distance) * attraction;
      const fy = (dy / distance) * attraction;
      const fz = (dz / distance) * attraction;
      forces[spring.a].x += fx;
      forces[spring.a].y += fy;
      forces[spring.a].z += fz;
      forces[spring.b].x -= fx;
      forces[spring.b].y -= fy;
      forces[spring.b].z -= fz;
    }

    const maxStep = 0.03 - (iteration / ITERATIONS) * 0.022;
    for (let index = 0; index < positions.length; index += 1) {
      forces[index].x -= positions[index].x * 0.004;
      forces[index].y -= positions[index].y * 0.004;
      forces[index].z -= positions[index].z * 0.004;
      velocities[index].x = (velocities[index].x + forces[index].x) * 0.72;
      velocities[index].y = (velocities[index].y + forces[index].y) * 0.72;
      velocities[index].z = (velocities[index].z + forces[index].z) * 0.72;
      const speed = Math.hypot(velocities[index].x, velocities[index].y, velocities[index].z);
      const stepScale = speed > maxStep ? maxStep / speed : 1;
      positions[index].x += velocities[index].x * stepScale;
      positions[index].y += velocities[index].y * stepScale;
      positions[index].z += velocities[index].z * stepScale;
    }
  }

  const center = positions.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  center.x /= positions.length;
  center.y /= positions.length;
  center.z /= positions.length;
  const centered = positions.map((point) => ({
    x: point.x - center.x,
    y: point.y - center.y,
    z: point.z - center.z,
  }));
  const maxRadius = Math.max(...centered.map((point) => Math.hypot(point.x, point.y, point.z)));
  const scale = maxRadius > EPSILON ? 0.98 / maxRadius : 1;

  return Object.fromEntries(uniqueNodes.map((node, index) => [node.id, {
    x: centered[index].x * scale,
    y: centered[index].y * scale,
    z: centered[index].z * scale,
    degree: degrees[index],
  }]));
}

/** Project a normalized world point through yaw, then pitch, into viewport pixels. */
export function projectPoint3D(
  point: Position3D,
  camera: Camera3D,
  width: number,
  height: number,
): ProjectedPoint3D {
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const yawX = point.x * cosYaw + point.z * sinYaw;
  const yawZ = -point.x * sinYaw + point.z * cosYaw;
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const pitchY = point.y * cosPitch - yawZ * sinPitch;
  const depth = point.y * sinPitch + yawZ * cosPitch;
  const scale = 1 / (1 - depth * 0.22);
  const fitRadius = Math.max(0, Math.min(width, height)) * 0.4 * camera.zoom;
  return {
    x: width / 2 + yawX * fitRadius * scale,
    y: height / 2 - pitchY * fitRadius * scale,
    depth,
    scale,
  };
}
