import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import type { Bone, Matrix4 } from 'three';

/** Peso de skin: um osso, ou mistura entre dois (t = 0 → a, 1 → b). */
export type Skin = Bone | { a: Bone; b: Bone; t: (p: Vector3, i: number) => number };

/** Junta todas as peças numa malha só, com cor por vértice e skin de até 2 ossos. */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];
  private readonly wgt: number[] = [];
  private readonly c = new Color();
  private readonly p = new Vector3();

  constructor(private readonly bones: Bone[]) {}

  get triangles(): number {
    return this.pos.length / 9;
  }

  add(
    geo: BufferGeometry,
    color: number,
    skin: Skin,
    o: { smooth?: boolean; m?: Matrix4 } = {},
  ): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (o.m) g.applyMatrix4(o.m);
    if (!o.smooth) g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    this.c.set(color);
    const single = 'isBone' in skin;
    const a = this.bones.indexOf(single ? skin : skin.a);
    const b = single ? 0 : this.bones.indexOf(skin.b);
    for (let i = 0; i < P.count; i++) {
      this.p.fromBufferAttribute(P, i);
      this.pos.push(this.p.x, this.p.y, this.p.z);
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
      const t = single ? 0 : Math.min(1, Math.max(0, skin.t(this.p, i)));
      this.idx.push(a, b, 0, 0);
      this.wgt.push(1 - t, t, 0, 0);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.idx, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.wgt, 4));
    return g;
  }
}

function fromTriangles(tri: number[], center: Vector3): BufferGeometry {
  // garante normais pra fora: confere o primeiro triângulo contra o centro
  const a = new Vector3(tri[0], tri[1], tri[2]);
  const b = new Vector3(tri[3], tri[4], tri[5]);
  const c = new Vector3(tri[6], tri[7], tri[8]);
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const out = a.clone().add(b).add(c).divideScalar(3).sub(center);
  if (n.dot(out) < 0) {
    for (let i = 0; i < tri.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = tri[i + 3 + k] ?? 0;
        tri[i + 3 + k] = tri[i + 6 + k] ?? 0;
        tri[i + 6 + k] = t;
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tri, 3));
  return g;
}

export interface Ring {
  y: number;
  r: number;
  sx?: number;
  sz?: number;
}

/**
 * Tubo de revolução por anéis (torso, saia, mangas, pernas, botas).
 * `pleat` faz o zigue-zague das pregas, crescendo do primeiro ao último anel.
 */
export function tube(
  rings: Ring[],
  seg: number,
  o: { x?: number; z?: number; pleat?: number; capFirst?: boolean; capLast?: boolean } = {},
): BufferGeometry {
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const last = rings.length - 1;
  const at = (i: number, j: number): [number, number, number] => {
    const r = rings[i];
    if (!r) return [0, 0, 0];
    const a = (j / seg) * Math.PI * 2;
    const pf = 1 + (j % 2 ? -1 : 1) * (o.pleat ?? 0) * (i / Math.max(1, last));
    return [
      cx + Math.sin(a) * r.r * (r.sx ?? 1) * pf,
      r.y,
      cz + Math.cos(a) * r.r * (r.sz ?? 1) * pf,
    ];
  };
  const tri: number[] = [];
  for (let i = 0; i < last; i++)
    for (let j = 0; j < seg; j++) {
      const p00 = at(i, j);
      const p01 = at(i, j + 1);
      const p10 = at(i + 1, j);
      const p11 = at(i + 1, j + 1);
      tri.push(...p00, ...p10, ...p01, ...p01, ...p10, ...p11);
    }
  const first = rings[0];
  const end = rings[last];
  const mid = new Vector3(cx, ((first?.y ?? 0) + (end?.y ?? 0)) / 2, cz);
  const g = fromTriangles(tri, mid);
  // tampas: orientação conferida separadamente (apontam pra fora do tubo)
  const caps: number[] = [];
  const cap = (i: number, up: boolean): void => {
    const y = rings[i]?.y ?? 0;
    for (let j = 0; j < seg; j++) {
      const p = at(i, j);
      const q = at(i, j + 1);
      if (up) caps.push(cx, y, cz, ...p, ...q);
      else caps.push(cx, y, cz, ...q, ...p);
    }
  };
  const firstIsTop = (first?.y ?? 0) > (end?.y ?? 0);
  if (o.capFirst) cap(0, firstIsTop);
  if (o.capLast) cap(last, !firstIsTop);
  if (caps.length) {
    const all = [...(g.getAttribute('position').array as Float32Array), ...caps];
    g.setAttribute('position', new Float32BufferAttribute(all, 3));
  }
  return g;
}

/**
 * Mecha de cabelo: folha facetada ao longo de uma curva, larga no meio e pontuda no fim.
 * Devolve também `s` (0 na raiz, 1 na ponta) por vértice, pra pesar a mola.
 */
export function lock(
  base: Vector3,
  tip: Vector3,
  width: number,
  thick: number,
  bend: Vector3,
  center: Vector3,
): { geo: BufferGeometry; s: number[] } {
  const N = 4;
  const ctrl = base.clone().add(tip).multiplyScalar(0.5).add(bend);
  const point = (s: number): Vector3 =>
    base
      .clone()
      .multiplyScalar((1 - s) * (1 - s))
      .addScaledVector(ctrl, 2 * s * (1 - s))
      .addScaledVector(tip, s * s);
  const rings: Vector3[][] = [];
  for (let k = 0; k < N; k++) {
    const s = k / N;
    const p = point(s);
    const tan = point(s + 0.05)
      .sub(point(Math.max(0, s - 0.05)))
      .normalize();
    const out = p.clone().sub(center).normalize();
    const side = tan.clone().cross(out).normalize();
    const nrm = side.clone().cross(tan).normalize();
    const prof = Math.pow(Math.sin(Math.PI * (0.2 + 0.8 * s)), 0.8);
    const w = (width / 2) * prof;
    const t = (thick / 2) * prof;
    rings.push([
      p.clone().addScaledVector(side, w),
      p.clone().addScaledVector(nrm, t),
      p.clone().addScaledVector(side, -w),
      p.clone().addScaledVector(nrm, -t * 0.4),
    ]);
  }
  const tri: number[] = [];
  const s: number[] = [];
  const push = (v: Vector3 | undefined, sv: number): void => {
    if (!v) return;
    tri.push(v.x, v.y, v.z);
    s.push(sv);
  };
  for (let k = 0; k < N; k++) {
    const a = rings[k];
    const b = rings[k + 1];
    const s0 = k / N;
    const s1 = (k + 1) / N;
    for (let j = 0; j < 4; j++) {
      const j1 = (j + 1) % 4;
      if (b) {
        push(a?.[j], s0);
        push(a?.[j1], s0);
        push(b[j], s1);
        push(a?.[j1], s0);
        push(b[j1], s1);
        push(b[j], s1);
      } else {
        push(a?.[j], s0);
        push(a?.[j1], s0);
        push(tip, 1);
      }
    }
  }
  const mid = point(0.4);
  return { geo: fromTriangles(tri, mid), s };
}
