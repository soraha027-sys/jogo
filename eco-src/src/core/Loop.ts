export interface LoopHandlers {
  /** Uma vez por quadro, antes dos passos fixos (amostrar input). */
  begin(dt: number): void;
  /** Simulação em passo fixo. */
  fixed(step: number): void;
  /** Uma vez por quadro; alpha = fração do passo fixo pendente (interpolação). */
  frame(dt: number, alpha: number): void;
}

/** Loop de tempo fixo com acumulador. `tick` é puro em relação ao relógio (testável). */
export class FixedLoop {
  readonly step: number;
  private acc = 0;
  private last = -1;
  private raf = 0;

  constructor(
    private readonly h: LoopHandlers,
    hz = 60,
    private readonly maxSteps = 5,
  ) {
    this.step = 1 / hz;
  }

  tick(nowMs: number): number {
    if (this.last < 0) this.last = nowMs;
    const dt = Math.min(0.25, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    this.h.begin(dt);
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      this.h.fixed(this.step);
      this.acc -= this.step;
      n++;
    }
    if (this.acc >= this.step) this.acc %= this.step; // descarta atraso (espiral da morte)
    this.h.frame(dt, this.acc / this.step);
    return n;
  }

  start(): void {
    const run = (t: number): void => {
      this.raf = requestAnimationFrame(run);
      this.tick(t);
    };
    this.last = -1;
    this.raf = requestAnimationFrame(run);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
