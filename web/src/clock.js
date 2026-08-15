const clamp = (value) => Math.max(0, Math.min(1, value));

export class AnimationClock {
  constructor({ durationMs, draw, onState = () => {}, onError = null, raf = globalThis.requestAnimationFrame?.bind(globalThis), cancel = globalThis.cancelAnimationFrame?.bind(globalThis) }) {
    this.durationMs = durationMs; this.draw = draw; this.onState = onState; this.onError = typeof onError === "function" ? onError : null;
    this.raf = raf || ((fn) => setTimeout(() => fn(performance.now()), 16));
    this.cancel = cancel || clearTimeout; this.progress = 0; this.playing = false;
    this.frame = null; this.startedAt = null; this.destroyed = false; this.failed = false;
  }
  fail(error) {
    this.playing = false; this.frame = null; this.startedAt = null; this.failed = true;
    if (!this.onError) throw error;
    try { this.onError(error, Object.freeze({ phase: "draw", progress: this.progress })); } catch { /* Error reporting must not reopen or destabilize the draw loop. */ }
  }
  render(progress = this.progress) {
    if (this.destroyed || this.failed) return false;
    this.progress = clamp(progress);
    try { this.draw(this.progress); } catch (error) { this.fail(error); return false; }
    return true;
  }
  play() {
    if (this.destroyed || this.failed || this.playing || this.progress >= 1) return;
    this.playing = true; this.startedAt = null; this.onState("playing");
    const tick = (now) => {
      if (!this.playing || this.destroyed) return;
      if (this.startedAt == null) this.startedAt = now - this.progress * this.durationMs;
      if (!this.render((now - this.startedAt) / this.durationMs)) return;
      if (this.progress >= 1) { this.playing = false; this.frame = null; this.onState("complete"); return; }
      this.frame = this.raf(tick);
    };
    this.frame = this.raf(tick);
  }
  pause() { if (!this.playing) return; this.playing = false; if (this.frame != null) this.cancel(this.frame); this.frame = null; this.onState("paused"); }
  replay() { this.pause(); if (this.render(0)) this.play(); }
  settle() { this.pause(); if (this.render(1)) this.onState("complete"); }
  resetFailure() { this.failed = false; }
  destroy() { this.pause(); this.destroyed = true; this.draw = () => {}; }
}
