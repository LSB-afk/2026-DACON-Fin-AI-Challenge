/** Shared orthographic projection for rendering, picking, HTML labels, camera and minimap. */
import { WORLD, type Building, type Point } from "./officeWorld.ts";
export function project(x: number, y: number, z = 0): Point { return { x: (x - y) * 16, y: (x + y) * 8 - z * 16 }; }
/** Inverse at floor height. Elevated controls must use their floor anchor. */
export function unproject(px: number, py: number): Point { return { x: px / 32 + py / 16, y: py / 16 - px / 32 }; }
export const PROJECTED_BOUNDS = {
  x0: -WORLD.h * 16 - 40, y0: -100, x1: WORLD.w * 16 + 40, y1: (WORLD.w + WORLD.h) * 8 + 60,
  w: (WORLD.w + WORLD.h) * 16 + 80, h: (WORLD.w + WORLD.h) * 8 + 160,
} as const;
export function roomPolygon(b: Pick<Building, "x0" | "y0" | "x1" | "y1">, z = 0): Point[] {
  return [project(b.x0, b.y0, z), project(b.x1, b.y0, z), project(b.x1, b.y1, z), project(b.x0, b.y1, z)];
}
export function roomAnchor(b: Building): Point { return project((b.x0 + b.x1) / 2, b.y0 + 0.6, b.doorSide === "open" ? 0 : b.wallH / 16 + 0.3); }
