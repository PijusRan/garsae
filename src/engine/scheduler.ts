// Look-ahead scheduler. The Worker sends ticks; scheduling happens here on the main thread.
// The look-ahead is deep (0.8 s) because nothing needs a fast reaction, which makes
// playback resilient to hiccups.

export const LOOKAHEAD = 0.8;
const TICK_MS = 100;

export type StepCallback = (step: number, time: number) => void;

export class Scheduler {
  step = 0;
  nextTime = 0;
  running = false;
  private worker?: Worker;

  constructor(
    private ctx: BaseAudioContext,
    private onStep: StepCallback,
    private stepDuration: () => number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // Always restart on a bar line.
    this.step = Math.ceil(this.step / 16) * 16;
    this.nextTime = this.ctx.currentTime + 0.15;
    if (!this.worker) {
      this.worker = new Worker(new URL('./clock.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.tick();
    }
    this.worker.postMessage({ cmd: 'start', interval: TICK_MS });
    this.tick();
  }

  stop(): void {
    this.running = false;
    this.worker?.postMessage({ cmd: 'stop' });
  }

  tick(): void {
    if (!this.running) return;
    this.renderUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  /** Schedules every step that starts before `until`. Also used for offline rendering. */
  renderUntil(until: number): void {
    // If we fell far behind (e.g. the device slept), skip ahead instead of bursting old notes.
    if (this.nextTime < this.ctx.currentTime - 0.1) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < until) {
      this.onStep(this.step, this.nextTime);
      this.nextTime += this.stepDuration();
      this.step++;
    }
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
  }
}
