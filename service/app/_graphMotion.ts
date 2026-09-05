"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layoutGraph3D, type LayoutNode3D, type LayoutEdge3D, type Position3D } from "@/lib/ontology/layout3d";
import { getEntrancePositions, interpolateGraphPositions, reconcileGraphPositions } from "@/lib/ontology/motion3d";

/** Visual-only settling. It cannot advance requests, evaluations or approval. */
export function useGraphMotion(nodes: LayoutNode3D[], edges: LayoutEdge3D[], options: {
  living: boolean; enabled: boolean; reducedMotion: boolean; paused: boolean;
}) {
  const topology = JSON.stringify([nodes.map(({ id, parentId }) => [id, parentId]), edges.map(({ source, target }) => [source, target])]);
  const [frame, setFrame] = useState(() => ({ positions: layoutGraph3D(nodes, edges), phase: 0, settling: false }));
  const motion = useRef({ topology, from: frame.positions, target: frame.positions, display: frame.positions, started: 0, phase: 0, settling: false });
  const { living, enabled, reducedMotion, paused } = options;

  useLayoutEffect(() => {
    const current = motion.current;
    if (current.topology === topology) return;
    const target = reconcileGraphPositions(nodes, edges, current.target);
    const from = getEntrancePositions(current.display, target, nodes, edges);
    const immediate = reducedMotion || !enabled;
    motion.current = { ...current, topology, from, target, display: immediate ? target : from, started: performance.now(), settling: !immediate };
    setFrame({ positions: motion.current.display, phase: current.phase, settling: !immediate });
  }, [nodes, edges, topology, reducedMotion, enabled]);

  useEffect(() => {
    let frameId = 0;
    let last = 0;
    const current = motion.current;
    if (reducedMotion || !enabled) {
      current.display = current.target;
      current.settling = false;
      setFrame({ positions: current.target, phase: current.phase, settling: false });
      return;
    }
    const tick = (time: number) => {
      if (document.hidden) return;
      if (last && time - last < 32) { frameId = requestAnimationFrame(tick); return; }
      const elapsed = last ? Math.min(time - last, 64) : 0;
      last = time;
      const state = motion.current;
      const progress = state.settling ? Math.min(1, (time - state.started) / 750) : 1;
      const base = progress < 1 ? interpolateGraphPositions(state.from, state.target, progress) : state.target;
      state.settling = progress < 1;
      if (living && !paused) state.phase += elapsed / 1000;
      const display: Record<string, Position3D> = {};
      for (const [id, point] of Object.entries(base)) {
        const seed = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 0) / 997 * Math.PI * 2;
        // A few pixels of slow drift, never a spinning camera or a simulation of work.
        display[id] = living && !paused ? {
          ...point,
          x: point.x + Math.sin(state.phase * 0.45 + seed) * 0.009,
          y: point.y + Math.cos(state.phase * 0.38 + seed) * 0.009,
          z: point.z + Math.sin(state.phase * 0.3 + seed) * 0.014,
        } : point;
      }
      state.display = display;
      setFrame({ positions: display, phase: state.phase, settling: state.settling });
      if (state.settling || (living && !paused)) frameId = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frameId);
      last = 0;
      if (!document.hidden) frameId = requestAnimationFrame(tick);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(frameId); document.removeEventListener("visibilitychange", visibility); };
  }, [topology, living, enabled, reducedMotion, paused]);

  return frame;
}
