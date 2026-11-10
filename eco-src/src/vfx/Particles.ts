import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Material } from 'three';

/** Comportamento físico de uma partícula (os elementos do JSON têm esse formato). */
export interface Kin {
  gravity: number;
  drag: number;
  swirl: number;
  bounce: number;
  pull: number;
  stretch: number;
}

interface P {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  cx: number;
  cy: number;
  cz: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  k: Kin;
}

const m = new Matrix4();
const q = new Quaternion();
const axis = new Vector3();
const pos = new Vector3();
const scl = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);
const UP = new Vector3(0, 1, 0);

/** Pool de partículas geométricas: 1 draw call, cor por instância, física simples na CPU. */
export class ParticlePool {
  readonly mesh: InstancedMesh;
  private readonly items: P[];
  private cursor = 0;
  private alive = 0;

  /** `align`: aponta a peça pra onde ela vai (cristais), em vez de girar à toa (pedras). */
  constructor(
    geo: BufferGeometry,
    capacity: number,
    material: Material = new MeshBasicMaterial({ toneMapped: false }),
    private readonly align = false,
  ) {
    this.mesh = new InstancedMesh(geo, material, capacity);
    this.mesh.frustumCulled = false;
    const k: Kin = { gravity: 0, drag: 0, swirl: 0, bounce: 0, pull: 0, stretch: 1 };
    this.items = Array.from({ length: capacity }, () => ({
      alive: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      cx: 0,
      cy: 0,
      cz: 0,
      life: 0,
      max: 1,
      size: 0,
      spin: 0,
      k,
    }));
    const c = new Color(0);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, c);
    }
  }

  /** `c*` é o centro de redemoinho/atração. */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: Color,
    k: Kin,
    cx = x,
    cy = y,
    cz = z,
  ): void {
    const i = this.cursor;
    this.cursor = (i + 1) % this.items.length;
    const p = this.items[i];
    if (!p) return;
    if (!p.alive) this.alive++;
    Object.assign(p, { alive: true, x, y, z, vx, vy, vz, cx, cy, cz, life, max: life, size, k });
    p.spin = 2 + Math.random() * 6;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p?.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.alive--;
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      const k = p.k;
      if (k.swirl) {
        const dx = p.x - p.cx;
        const dz = p.z - p.cz;
        p.vx -= dz * k.swirl * dt;
        p.vz += dx * k.swirl * dt;
      }
      if (k.pull) {
        p.vx += (p.cx - p.x) * k.pull * dt;
        p.vy += (p.cy - p.y) * k.pull * dt;
        p.vz += (p.cz - p.z) * k.pull * dt;
      }
      p.vy -= k.gravity * dt;
      const d = Math.exp(-k.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const floor = p.size * 0.4;
      if (p.y < floor && p.vy < 0) {
        p.y = floor;
        if (k.bounce > 0 && p.vy < -1.5) {
          p.vy *= -k.bounce;
          p.vx *= 0.7;
          p.vz *= 0.7;
        } else {
          p.vy = 0;
          p.life = Math.min(p.life, k.bounce > 0 ? 0.5 : 0.12);
        }
      }
      const age = p.max - p.life;
      const s = p.size * Math.min(1, age * 14, (p.life / p.max) * 2.5);
      if (this.align && p.vx * p.vx + p.vy * p.vy + p.vz * p.vz > 0.5) {
        axis.set(p.vx, p.vy, p.vz).normalize();
        q.setFromUnitVectors(UP, axis);
      } else {
        axis.set(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 2.3)).normalize();
        q.setFromAxisAngle(axis, age * p.spin + i);
      }
      this.mesh.setMatrixAt(i, m.compose(pos.set(p.x, p.y, p.z), q, scl.set(s, s * k.stretch, s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
