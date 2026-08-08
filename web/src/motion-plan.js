import { clamp01, smooth } from "./marks.js";

export const MOTION_PLAN_VERSION = "figurestead.motion-plan/1";
export const ALLOWED_MOTION_CHANNELS = Object.freeze(["opacity", "translate", "scale", "clip", "glow"]);
export const TERMINAL_MOTION_STATE = Object.freeze({ opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, clip: 1, glow: 0 });

const STRATEGY_CHANNELS = Object.freeze({
  none: [], reveal: ["opacity", "clip"], points_then_connect: ["opacity", "translate", "clip", "glow"],
  bar_grow: ["opacity", "scale", "clip"], matrix_illuminate: ["opacity", "glow"],
});

const AUTO = Object.freeze({
  line: "points_then_connect", scatter: "points_then_connect",
  categorical_bar: "bar_grow", categorical_layered_bar: "bar_grow",
  categorical_matrix: "matrix_illuminate",
  interval_comparison: "points_then_connect",
  strip_summary: "points_then_connect",
  temporal_coverage: "reveal",
  temporal_observations: "reveal",
  paired_points: "points_then_connect",
  reference_improvement: "reveal",
});

export function strategyForRenderer(renderer, requested = "auto") {
  if (requested === "auto") return AUTO[renderer] ?? "reveal";
  return requested ?? "none";
}

export function compileMotionPlan(scene, view = {}) {
  const motion = view.motion ?? "none", requested = view.strategy ?? "auto";
  const panels = scene.panels.map((panel) => ({
    panelId: panel.id,
    renderer: panel.renderer,
    strategy: motion === "none" ? "none" : strategyForRenderer(panel.renderer, requested),
    targets: panel.marks.map((mark, index) => {
      const strategy = motion === "none" ? "none" : strategyForRenderer(panel.renderer, requested);
      return { id: mark.id, order: index, channels: [...(STRATEGY_CHANNELS[strategy] ?? STRATEGY_CHANNELS.reveal)] };
    }),
  }));
  return Object.freeze({ schemaVersion: MOTION_PLAN_VERSION, motion, panels });
}

export function markMotionState(mark, index, count, progress, strategy = "reveal") {
  if (progress >= 1 || strategy === "none") return { ...TERMINAL_MOTION_STATE };
  const stagger = count <= 1 ? 0 : (index / (count - 1)) * 0.28;
  const local = smooth(clamp01((progress - stagger) / Math.max(1e-9, 1 - stagger)));
  if (strategy === "points_then_connect") {
    const point = mark.kind === "point", pointLocal = smooth(clamp01(local / 0.62));
    const lineLocal = smooth(clamp01((local - 0.48) / 0.52));
    return { opacity: point ? pointLocal : lineLocal, translateX: 0, translateY: point ? (1 - pointLocal) * -12 : 0, scaleX: 1, scaleY: 1, clip: point ? 1 : lineLocal, glow: point ? Math.sin(Math.PI * pointLocal) * 0.18 : 0 };
  }
  if (strategy === "bar_grow") return { opacity: local, translateX: 0, translateY: 0, scaleX: mark.orientation === "horizontal" ? local : 1, scaleY: mark.orientation === "horizontal" ? 1 : local, clip: local, glow: 0 };
  if (strategy === "matrix_illuminate") return { opacity: local, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, clip: 1, glow: Math.sin(Math.PI * local) * 0.14 };
  return { opacity: local, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, clip: local, glow: 0 };
}

export function assertTerminalMotionIdentity(plan, scene) {
  plan.panels.forEach((panel) => {
    const scenePanel = scene.panels.find((item) => item.id === panel.panelId);
    panel.targets.forEach((target, index) => {
      const state = markMotionState(scenePanel.marks[index], index, panel.targets.length, 1, panel.strategy);
      if (Object.entries(TERMINAL_MOTION_STATE).some(([channel, value]) => state[channel] !== value)) throw new Error(`motion plan ${target.id} changes terminal evidence`);
    });
  });
  return true;
}
