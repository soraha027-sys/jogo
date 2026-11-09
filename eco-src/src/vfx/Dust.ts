import { Color, OctahedronGeometry } from 'three';
import type { Scene, Vector3 } from 'three';
import { ParticlePool, type Kin } from './Particles';

const KIN: Kin = { gravity: -0.6, drag: 3.2, swirl: 0, bounce: 0, pull: 0, stretch: 1 };
const TONES = [new Color(0xc9ccd4), new Color(0xb4b8c2), new Color(0xdfe1e6)];
const rnd = (): number => Math.random() * 2 - 1;

/** Poeira de passo, pulo e pouso: peso e contato com o chão. 1 draw call. */
export class Dust {
  private readonly pool = new ParticlePool(new OctahedronGeometry(0.5, 0), 160);

  constructor(scene: Scene) {
    scene.add(this.pool.mesh);
  }

  private puff(p: Vector3, n: number, spread: number, upward: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.5 + Math.random() * 0.5);
      const c = TONES[i % TONES.length];
      if (c)
        this.pool.emit(
          p.x + rnd() * 0.05,
          0.05,
          p.z + rnd() * 0.05,
          Math.cos(a) * v,
          upward * (0.4 + Math.random() * 0.6),
          Math.sin(a) * v,
          0.35 + Math.random() * 0.3,
          size * (0.6 + Math.random() * 0.7),
          c,
          KIN,
        );
    }
  }

  step(p: Vector3, running: boolean): void {
    if (p.y < 0.35) this.puff(p, running ? 4 : 2, running ? 1.6 : 0.8, 0.8, running ? 0.12 : 0.08);
  }

  jump(p: Vector3, double: boolean): void {
    this.puff(p, double ? 0 : 8, 2.4, 1.2, 0.13);
  }

  /** Anel de poeira abrindo. */
  land(p: Vector3): void {
    this.puff(p, 16, 4.5, 0.7, 0.16);
  }

  update(dt: number): void {
    this.pool.update(dt);
  }
}
