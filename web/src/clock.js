const clamp = (value) => Math.max(0, Math.min(1, value));

export class AnimationClock {
  constructor({ durationMs, draw, onState = () => {}, raf = globalThis.requestAnimationFrame?.bind(globalThis), cancel = globalThis.cancelAnimationFrame?.bind(globalThis) }) {
    this.durationMs = durationMs; this.draw = draw; this.onState = onState;
    this.raf = raf || ((fn) => setTimeout(() => fn(performance.now()), 16));
    this.cancel = cancel || clearTimeout; this.progress = 0; this.playing = false;
    this.frame = null; this.startedAt = null; this.destroyed = false;
  }
  render(progress = this.progress) { this.progress = clamp(progress); this.draw(this.progress); }
  play() {
    if (this.destroyed || this.playing || this.progress >= 1) return;
    this.playing = true; this.startedAt = null; this.onState("playing");
    const tick = (now) => {
      if (!this.playing || this.destroyed) return;
      if (this.startedAt == null) this.startedAt = now - this.progress * this.durationMs;
      this.render((now - this.startedAt) / this.durationMs);
      if (this.progress >= 1) { this.playing = false; this.frame = null; this.onState("complete"); return; }
      this.frame = this.raf(tick);
    };
    this.frame = this.raf(tick);
  }
  pause() { if (!this.playing) return; this.playing = false; if (this.frame != null) this.cancel(this.frame); this.frame = null; this.onState("paused"); }
  replay() { this.pause(); this.render(0); this.play(); }
  settle() { this.pause(); this.render(1); this.onState("complete"); }
  destroy() { this.pause(); this.destroyed = true; this.draw = () => {}; }
}
