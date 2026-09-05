/** Pure, deterministic presentation-only staff movement. Business state is read-only input. */
import { standTile, walkPath, type Point } from "./officeWorld.ts";
import type { AgentState } from "./officeActors.ts";

export type StaffActivityKind = "idle" | "walking" | "desk-work" | "meeting" | "break";
export type StaffActivity = {
  kind: StaffActivityKind;
  destination: string | null;
  /** True means office-life staging only, never observed AI work. */
  ambient: boolean;
};
export type StaffMotion = {
  id: string;
  home: Point;
  position: Point;
  destination: Point;
  path: readonly Point[];
  facing: Point;
  activity: StaffActivity;
  nextDecisionAt: number;
  tripIndex: number;
};
export type OfficeMotionState = { nowMs: number; staff: Readonly<Record<string, StaffMotion>> };
export type OfficeMotionInput = {
  nowMs: number;
  ambientMotion: boolean;
  reducedMotion: boolean;
  hidden: boolean;
  agents: Readonly<Record<string, AgentState>>;
};
export type OfficeMotionTick = { motion: OfficeMotionState; moving: boolean; nextDecisionAt: number | null };
export type OfficeActivityTelemetry = Readonly<Record<string, StaffActivity>>;
export type MotionMover = { position: Point; destination: Point; path: Point[] };

export type AmbientDestination = {
  id: string;
  roomId: string;
  label: string;
  point: Point;
  activity: Exclude<StaffActivityKind, "idle" | "walking">;
};

/** Hand-checked clear standing points inside actual furnished rooms. */
export const AMBIENT_DESTINATIONS: readonly AmbientDestination[] = [
  { id: "review-meeting", roomId: "meeting", label: "검토 회의", point: { x: 74, y: 46 }, activity: "meeting" },
  { id: "customer-lounge", roomId: "lounge", label: "라운지 정리", point: { x: 47, y: 47 }, activity: "break" },
  { id: "law-library", roomId: "library", label: "법령 자료 확인", point: { x: 15, y: 12 }, activity: "desk-work" },
  { id: "evidence-review", roomId: "evidenceroom", label: "근거 검토", point: { x: 23, y: 46 }, activity: "meeting" },
  { id: "operations-monitor", roomId: "monitortower", label: "운영 현황 확인", point: { x: 89, y: 60 }, activity: "desk-work" },
  { id: "team-lounge", roomId: "orgoffice", label: "팀 협업", point: { x: 99, y: 54 }, activity: "meeting" },
] as const;

const AMBIENT_SPEED = 3.2;
const WORK_RETURN_SPEED = 7.5;

function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function departureDelay(id: string, tripIndex: number): number {
  return 1_200 + ((hashId(id) + tripIndex * 977) % 6_400);
}

function dwellTime(id: string, tripIndex: number): number {
  return 4_800 + ((hashId(id) + tripIndex * 613) % 3_600);
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function activity(kind: StaffActivityKind, destination: string | null, ambient: boolean): StaffActivity {
  return { kind, destination, ambient };
}

function initialStaff(id: string, nowMs: number): StaffMotion {
  const home = standTile(id);
  return {
    id,
    home,
    position: { ...home },
    destination: { ...home },
    path: [],
    facing: { x: 0, y: 1 },
    activity: activity("idle", null, false),
    nextDecisionAt: nowMs + departureDelay(id, 0),
    tripIndex: 0,
  };
}

export function createOfficeMotion(agentIds: readonly string[], nowMs = 0): OfficeMotionState {
  return {
    nowMs,
    staff: Object.fromEntries(agentIds.map((id) => [id, initialStaff(id, nowMs)])),
  };
}

function routeTo(staff: StaffMotion, destination: Point, nextActivity: StaffActivity): StaffMotion {
  if (samePoint(staff.position, destination)) {
    return { ...staff, destination: { ...destination }, path: [], activity: nextActivity };
  }
  return {
    ...staff,
    destination: { ...destination },
    path: walkPath(staff.position, destination),
    activity: activity("walking", nextActivity.destination, nextActivity.ambient),
  };
}

function advance(staff: StaffMotion, distance: number): StaffMotion {
  const path = [...staff.path];
  let position = { ...staff.position };
  let facing = { ...staff.facing };
  while (path.length && distance > 0) {
    const next = path[0];
    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-8) {
      position = { ...next };
      path.shift();
      continue;
    }
    facing = { x: dx / length, y: dy / length };
    if (length <= distance) {
      position = { ...next };
      path.shift();
      distance -= length;
    } else {
      position = { x: position.x + facing.x * distance, y: position.y + facing.y * distance };
      distance = 0;
    }
  }
  return { ...staff, position, path, facing };
}

/** Advance this mover even when another actor already keeps the scene animating. */
export function advanceMoverAndCombine(mover: MotionMover, elapsedSeconds: number, speed: number, moving: boolean): boolean {
  let distance = elapsedSeconds * speed;
  while (mover.path.length && distance > 0) {
    const next = mover.path[0];
    const dx = next.x - mover.position.x;
    const dy = next.y - mover.position.y;
    const length = Math.hypot(dx, dy);
    if (length <= distance) {
      mover.position = { ...next };
      mover.path.shift();
      distance -= length;
    } else {
      mover.position = { x: mover.position.x + dx / length * distance, y: mover.position.y + dy / length * distance };
      distance = 0;
    }
  }
  return mover.path.length > 0 || moving;
}

function destinationFor(staff: StaffMotion): AmbientDestination {
  return AMBIENT_DESTINATIONS[(hashId(staff.id) + staff.tripIndex * 5) % AMBIENT_DESTINATIONS.length];
}

function isActualWork(state: AgentState | undefined): boolean {
  return state === "working" || state === "validating";
}

function atAmbientDestination(staff: StaffMotion): StaffActivity {
  const destination = AMBIENT_DESTINATIONS.find((item) => item.id === staff.activity.destination);
  return destination ? activity(destination.activity, destination.id, true) : activity("idle", null, false);
}

function tickStaff(staff: StaffMotion, input: OfficeMotionInput, elapsedMs: number): StaffMotion {
  const working = isActualWork(input.agents[staff.id]);
  if (!input.ambientMotion || input.reducedMotion) {
    return {
      ...staff,
      position: { ...staff.home }, destination: { ...staff.home }, path: [],
      activity: working ? activity("desk-work", staff.id, false) : activity("idle", null, false),
      nextDecisionAt: input.nowMs + departureDelay(staff.id, staff.tripIndex),
    };
  }

  if (working) {
    let returning = staff.activity.ambient || !samePoint(staff.destination, staff.home)
      ? routeTo(staff, staff.home, activity("desk-work", staff.id, false))
      : staff;
    if (returning.path.length) returning = advance(returning, elapsedMs / 1_000 * WORK_RETURN_SPEED);
    return returning.path.length
      ? returning
      : { ...returning, position: { ...staff.home }, activity: activity("desk-work", staff.id, false), nextDecisionAt: input.nowMs + departureDelay(staff.id, staff.tripIndex) };
  }

  if (!staff.activity.ambient && staff.activity.kind === "desk-work") {
    return {
      ...staff,
      activity: activity("idle", null, false),
      nextDecisionAt: input.nowMs + departureDelay(staff.id, staff.tripIndex),
    };
  }

  if (staff.path.length) {
    const moved = advance(staff, elapsedMs / 1_000 * AMBIENT_SPEED);
    return moved.path.length
      ? moved
      : { ...moved, activity: atAmbientDestination(moved), nextDecisionAt: input.nowMs + dwellTime(staff.id, staff.tripIndex) };
  }

  if (input.nowMs < staff.nextDecisionAt) return staff;
  const awayFromHome = !samePoint(staff.position, staff.home);
  const target = awayFromHome ? null : destinationFor(staff);
  const destination = target?.point ?? staff.home;
  const nextActivity = target
    ? activity(target.activity, target.id, true)
    : activity("idle", null, false);
  const routed = routeTo(
    { ...staff, tripIndex: target ? staff.tripIndex + 1 : staff.tripIndex },
    destination,
    nextActivity,
  );
  const movementMs = Math.max(0, input.nowMs - staff.nextDecisionAt);
  const moved = advance(routed, movementMs / 1_000 * AMBIENT_SPEED);
  if (moved.path.length) return moved;
  return {
    ...moved,
    activity: target ? activity(target.activity, target.id, true) : activity("idle", null, false),
    nextDecisionAt: input.nowMs + (target ? dwellTime(staff.id, moved.tripIndex) : departureDelay(staff.id, moved.tripIndex)),
  };
}

export function tickOfficeMotion(motion: OfficeMotionState, input: OfficeMotionInput): OfficeMotionTick {
  if (input.hidden) {
    const pausedMs = Math.max(0, input.nowMs - motion.nowMs);
    const staff = Object.fromEntries(Object.entries(motion.staff).map(([id, member]) => [id, {
      ...member,
      nextDecisionAt: member.nextDecisionAt + pausedMs,
    }]));
    return {
      motion: { nowMs: input.nowMs, staff },
      moving: false,
      nextDecisionAt: null,
    };
  }
  const elapsedMs = Math.max(0, input.nowMs - motion.nowMs);
  const staff = Object.fromEntries(Object.entries(motion.staff).map(([id, member]) => [id, tickStaff(member, input, elapsedMs)]));
  const members = Object.values(staff);
  return {
    motion: { nowMs: input.nowMs, staff },
    moving: members.some((member) => member.path.length > 0),
    nextDecisionAt: input.ambientMotion && !input.reducedMotion
      ? Math.min(...members.map((member) => member.nextDecisionAt))
      : null,
  };
}

export function officeActivityTelemetry(motion: OfficeMotionState): OfficeActivityTelemetry {
  return Object.fromEntries(Object.entries(motion.staff).map(([id, member]) => [id, { ...member.activity }]));
}
