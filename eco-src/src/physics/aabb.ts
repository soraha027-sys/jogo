/** Colisão mínima do M0 (caixas alinhadas aos eixos). No M1 o Rapier assume esta interface. */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function box(cx: number, cz: number, w: number, d: number, y0: number, y1: number): Aabb {
  return {
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    minY: y0,
    maxY: y1,
  };
}

function slab(o: number, d: number, lo: number, hi: number, t: [number, number]): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d;
  let b = (hi - o) / d;
  if (a > b) [a, b] = [b, a];
  if (a > t[0]) t[0] = a;
  if (b < t[1]) t[1] = b;
  return t[0] <= t[1];
}

const T: [number, number] = [0, 0];

/** Distância até a caixa ao longo do raio (direção normalizada), ou `maxT` se não bater. */
export function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Aabb,
  maxT: number,
): number {
  T[0] = 0;
  T[1] = maxT;
  if (!slab(ox, dx, b.minX, b.maxX, T)) return maxT;
  if (!slab(oy, dy, b.minY, b.maxY, T)) return maxT;
  if (!slab(oz, dz, b.minZ, b.maxZ, T)) return maxT;
  return T[0];
}

/** Empurra um círculo (plano XZ) pra fora da caixa. Retorna se houve contato. */
export function resolveCircle(p: { x: number; z: number }, r: number, b: Aabb): boolean {
  const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
    return true;
  }
  // centro dentro da caixa: sai pela face mais próxima
  const l = p.x - b.minX;
  const rr = b.maxX - p.x;
  const n = p.z - b.minZ;
  const f = b.maxZ - p.z;
  const m = Math.min(l, rr, n, f);
  if (m === l) p.x = b.minX - r;
  else if (m === rr) p.x = b.maxX + r;
  else if (m === n) p.z = b.minZ - r;
  else p.z = b.maxZ + r;
  return true;
}
