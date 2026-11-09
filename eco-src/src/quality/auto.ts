export type QualityId = 'low' | 'medium' | 'high';
export const QUALITY_ORDER: readonly QualityId[] = ['low', 'medium', 'high'];

/** Decide o perfil a partir do FPS médio medido no perfil atual. */
export function nextProfile(current: QualityId, avgFps: number): QualityId {
  if (current === 'medium') return avgFps < 40 ? 'low' : avgFps >= 57 ? 'high' : 'medium';
  if (current === 'high') return avgFps < 48 ? 'medium' : 'high';
  return 'low';
}

/**
 * Mede o FPS nos primeiros segundos (até 2 janelas: decide e confirma).
 * `sample` devolve o novo perfil quando houver troca.
 */
export class AutoDetector {
  private t = 0;
  private frames = 0;
  private windows = 0;
  done = false;

  constructor(
    private readonly warmup = 1,
    private readonly span = 2.5,
  ) {}

  sample(dt: number, current: QualityId): QualityId | null {
    if (this.done || dt <= 0 || dt > 0.1) return null; // ignora aba em segundo plano
    this.t += dt;
    if (this.t < this.warmup) return null;
    this.frames++;
    const measured = this.t - this.warmup;
    if (measured < this.span) return null;
    const next = nextProfile(current, this.frames / measured);
    this.windows++;
    this.t = 0;
    this.frames = 0;
    if (next === current || next === 'low' || this.windows >= 2) this.done = true;
    return next === current ? null : next;
  }
}
