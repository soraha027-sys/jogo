export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Zona morta radial com reescala: abaixo de `dz` vira 0, a borda continua valendo 1. */
export function deadzone(x: number, y: number, dz: number): [number, number] {
  const len = Math.hypot(x, y);
  if (len <= dz) return [0, 0];
  const k = Math.min(1, (len - dz) / (1 - dz)) / len;
  return [x * k, y * k];
}

/** Menor diferença angular de `a` até `b`, em (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Fator de amortecimento exponencial independente de FPS. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
