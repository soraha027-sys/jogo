import { BoxGeometry, Color, OctahedronGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import { rayAabb, type Aabb } from '../physics/aabb';
import { ParticlePool } from '../vfx/Particles';
import { materialize, type Matter, type SpellPlan } from './essence';
import type { Lingua } from './lingua';

export interface Target {
  pos: Vector3;
  radius: number;
  hit(color: Color): void;
}

/** Um corpo de feitiço em execução: devolve false quando acaba. */
type Active = (dt: number) => boolean;
/** Onde a infusão (2ª palavra) nasce: cada forma chama isso nos seus pontos de efeito. */
type Sub = ((at: Vector3) => void) | null;

interface Cfg {
  m: Matter;
  /** Matéria da infusão: tinge parte das partículas do corpo. */
  tint: Matter | null;
  scale: number;
  dur: number;
  speed: number;
  sky: boolean;
  jitter: number;
  sub: Sub;
}

const SMOKE: Matter = {
  gravity: -1.6,
  drag: 2,
  swirl: 0,
  bounce: 0,
  pull: 0,
  stretch: 1,
  size: 0.4,
  life: 1.3,
  box: false,
  colors: [new Color(0x3a3540), new Color(0x5a5560), new Color(0xb48cff)],
  speed: 10,
  arc: 0,
  spiral: 0,
  burst: 1,
};
const SPARK: Matter = {
  ...SMOKE,
  gravity: -1,
  drag: 3,
  life: 0.6,
  size: 0.12,
  stretch: 2,
  colors: [new Color(0xffe9a8), new Color(0xffffff)],
};
const UP = new Vector3(0, 1, 0);
const v = new Vector3();
const rnd = (): number => Math.random() * 2 - 1;

/**
 * Executa magias. Não existe lista de poderes: cada forma (terminação) é um emissor genérico,
 * e a matéria que ele emite sai da essência das raízes. A 2ª palavra vira um sub-feitiço
 * que nasce nos pontos de efeito da 1ª.
 */
export class SpellSystem {
  mana: number;
  private readonly octa = new ParticlePool(new OctahedronGeometry(0.5, 0), 1300);
  private readonly cube = new ParticlePool(new BoxGeometry(0.8, 0.8, 0.8), 700);
  private active: Active[] = [];

  constructor(
    private readonly data: Lingua,
    scene: Scene,
    private readonly colliders: readonly Aabb[],
    private readonly targets: readonly Target[],
  ) {
    this.mana = data.manaMax;
    scene.add(this.octa.mesh, this.cube.mesh);
  }

  update(dt: number): void {
    this.mana = Math.min(this.data.manaMax, this.mana + this.data.manaRegen * dt);
    this.active = this.active.filter((fn) => fn(dt));
    this.octa.update(dt);
    this.cube.update(dt);
  }

  private emit(
    m: Matter,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size = 1,
    life = 1,
    cx = x,
    cy = y,
    cz = z,
    kin: Matter = m,
  ): void {
    const color = m.colors[Math.floor(Math.random() * m.colors.length)];
    if (!color) return;
    (m.box ? this.cube : this.octa).emit(
      x,
      y,
      z,
      vx,
      vy,
      vz,
      m.life * life * (0.7 + Math.random() * 0.6),
      m.size * size * (0.7 + Math.random() * 0.6),
      color,
      kin,
      cx,
      cy,
      cz,
    );
  }

  /** Partícula do corpo: às vezes já sai com a matéria da infusão. */
  private body(
    c: Cfg,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size = 1,
    life = 1,
    cx = x,
    cy = y,
    cz = z,
    kin?: Matter,
  ): void {
    const m = c.tint && Math.random() < 0.28 ? c.tint : c.m;
    const j = c.jitter * 3;
    this.emit(
      m,
      x,
      y,
      z,
      vx + rnd() * j,
      vy + rnd() * j,
      vz + rnd() * j,
      size * c.scale,
      life,
      cx,
      cy,
      cz,
      kin ?? m,
    );
  }

  private burst(c: Cfg, p: Vector3, n: number, speed: number, size = 1): void {
    for (let i = 0; i < n; i++) {
      v.set(rnd(), rnd() * 0.6 + 0.5, rnd())
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random()));
      this.body(c, p.x, p.y, p.z, v.x, v.y, v.z, size, 1.2, p.x, p.y, p.z);
    }
  }

  private impact(c: Cfg, x: number, y: number, z: number, r: number): void {
    const color = c.m.colors[0];
    if (!color) return;
    for (const t of this.targets) {
      const dy = Math.max(0, Math.abs(t.pos.y + 1 - y) - 1);
      if (Math.hypot(t.pos.x - x, t.pos.z - z, dy) < r + t.radius) t.hit(color);
    }
  }

  /** Fumaça e fuligem. */
  smoke(p: Vector3, n = 70, speed = 7): void {
    for (let i = 0; i < n; i++) {
      v.set(rnd(), rnd() * 0.7 + 0.3, rnd())
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random()));
      this.emit(SMOKE, p.x, p.y, p.z, v.x, v.y, v.z, 0.6 + Math.random());
    }
  }

  /**
   * Lança a magia. `power` < 1 = eco fraco. Devolve false se ela estourou na mão
   * (essências opostas sem "ko").
   */
  cast(plan: SpellPlan, power: number, origin: Vector3, aim: Vector3, center: Vector3): boolean {
    const m = materialize(plan.body.essence);
    const m2 = plan.infusion ? materialize(plan.infusion.essence) : null;
    const dir = aim.clone().normalize();

    if (plan.state === 'instavel') {
      const c: Cfg = {
        m,
        tint: m2,
        scale: 1.2,
        dur: 1,
        speed: 1,
        sky: false,
        jitter: 1,
        sub: null,
      };
      this.burst(c, origin, 46, 9);
      this.smoke(origin, 40);
      return false;
    }
    if (!plan.body.shape) {
      // sem terminação a essência não toma forma: escorre da mão
      const c: Cfg = {
        m,
        tint: m2,
        scale: 0.7,
        dur: 1,
        speed: 1,
        sky: false,
        jitter: 0.2,
        sub: null,
      };
      for (let i = 0; i < 14; i++)
        this.body(
          c,
          origin.x,
          origin.y,
          origin.z,
          dir.x * 1.5 + rnd(),
          1 + rnd(),
          dir.z * 1.5 + rnd(),
        );
      return true;
    }

    const turbulent = plan.state === 'turbulento';
    const dur = (plan.state === 'harmonico' ? 1.15 : turbulent ? 0.75 : 1) * power;
    const inf = plan.infusion;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.emit(SPARK, origin.x, origin.y, origin.z, Math.cos(a) * 3, 1.5 + rnd(), Math.sin(a) * 3);
    }
    for (let e = 0; e < plan.echoes; e++) {
      const scale = plan.scale * power * plan.power * ([1, 0.7, 0.5][e] ?? 0.4);
      const sub: Sub =
        inf && m2
          ? (at) => {
              const c2: Cfg = {
                m: m2,
                tint: null,
                scale: scale * 0.55,
                dur: dur * 0.7,
                speed: 1,
                sky: false,
                jitter: 0,
                sub: null,
              };
              if (!inf.shape) return this.burst(c2, at, 22, 5, 1.6);
              const d = new Vector3(rnd(), 0.25, rnd()).normalize();
              const o = at.clone().setY(at.y + 0.3);
              this.spawn(inf.shape, c2, o, d, o); // origem = centro: nasce no próprio ponto
            }
          : null;
      const c: Cfg = {
        m,
        tint: m2,
        scale,
        dur,
        speed: plan.speed,
        sky: plan.fromAbove,
        jitter: turbulent ? 1 : 0,
        sub,
      };
      const go = (): void => this.spawn(plan.body.shape ?? '', c, origin.clone(), dir, center);
      if (e === 0) go();
      else this.delay(e * 0.3, () => (go(), false));
    }
    return true;
  }

  private delay(t: number, fn: Active): void {
    let left = t;
    this.active.push((dt) => ((left -= dt) > 0 ? true : fn(dt)));
  }

  private spawn(shape: string, c: Cfg, origin: Vector3, dir: Vector3, center: Vector3): void {
    const ahead = (d: number): Vector3 =>
      new Vector3(center.x + dir.x * d, 0, center.z + dir.z * d);
    switch (shape) {
      case 'projectile': {
        if (c.sky) {
          const to = ahead(9);
          const from = to.clone().add(new Vector3(-dir.x * 4, 14, -dir.z * 4));
          this.active.push(this.projectile(c, from, to.sub(from).normalize()));
        } else this.active.push(this.projectile(c, origin, dir));
        break;
      }
      case 'vortex':
        this.active.push(this.vortex(c, ahead(center === origin ? 0 : 4.5), dir));
        break;
      case 'wave':
        this.active.push(this.wave(c, center.clone().setY(0)));
        break;
      case 'pillar':
        this.active.push(this.pillar(c, ahead(center === origin ? 0 : 5)));
        break;
      case 'jet':
        this.active.push(this.jet(c, origin, dir));
        break;
      case 'rain':
        this.active.push(this.rain(c, ahead(center === origin ? 0 : 7)));
        break;
    }
  }

  private projectile(c: Cfg, pos: Vector3, dir: Vector3): Active {
    const vel = dir.clone().multiplyScalar(c.m.speed * c.speed * (c.sky ? 1.6 : 1));
    const side = new Vector3().crossVectors(dir, UP).normalize();
    let t = 0;
    let dist = 0;
    let acc = 0;
    return (dt) => {
      t += dt;
      vel.y -= c.m.arc * dt;
      if (c.jitter) vel.addScaledVector(side, Math.sin(t * 23) * 26 * dt);
      const speed = vel.length();
      const step = speed * dt;
      let hit = pos.y + vel.y * dt <= 0.12 || dist > 45;
      for (const b of this.colliders)
        if (
          rayAabb(pos.x, pos.y, pos.z, vel.x / speed, vel.y / speed, vel.z / speed, b, step) < step
        )
          hit = true;
      pos.addScaledVector(vel, dt);
      dist += step;
      const s = c.m.spiral * 0.4 * c.scale;
      const ox = side.x * Math.cos(t * 16) * s;
      const oy = Math.sin(t * 16) * s;
      const oz = side.z * Math.cos(t * 16) * s;
      for (acc += dt * 150; acc >= 1; acc--)
        this.body(
          c,
          pos.x + ox + rnd() * 0.08,
          pos.y + oy + rnd() * 0.08,
          pos.z + oz + rnd() * 0.08,
          vel.x * 0.08 + rnd(),
          vel.y * 0.08 + rnd(),
          vel.z * 0.08 + rnd(),
          1,
          1,
          pos.x,
          pos.y,
          pos.z,
        );
      if (!hit) return true;
      pos.y = Math.max(pos.y, 0.15);
      this.burst(c, pos, Math.round(38 * c.scale * c.m.burst), 5 + 3 * c.scale, 1.1);
      this.impact(c, pos.x, pos.y, pos.z, 1.2 + c.scale * c.m.burst * 0.6);
      c.sub?.(pos);
      return false;
    };
  }

  /** Funil que gira e anda devagar pra frente; do alto, desce do céu. */
  private vortex(c: Cfg, p: Vector3, dir: Vector3): Active {
    const kin: Matter = {
      ...c.m,
      swirl: Math.max(c.m.swirl, 5.5),
      pull: c.m.pull + 0.8,
      gravity: Math.min(c.m.gravity, 3) - 2.5,
      drag: Math.min(c.m.drag, 0.9),
    };
    const H = 3.4 * c.scale;
    const drift = 1.2 + Math.max(0, c.m.speed - 10) * 0.12;
    let t = 0;
    let acc = 0;
    let tick = 0.4;
    return (dt) => {
      t += dt;
      p.addScaledVector(dir, drift * dt);
      if (c.jitter) p.x += Math.sin(t * 5) * 2.5 * dt;
      for (acc += dt * 190 * Math.min(2, c.scale); acc >= 1; acc--) {
        const h = Math.random() ** 1.4 * H;
        const r = (0.3 + h * 0.4) * (0.8 + Math.random() * 0.3);
        const a = Math.random() * Math.PI * 2;
        const y = c.sky ? 9 - h : 0.1 + h;
        const w = 5 + c.m.swirl * 0.4;
        this.body(
          c,
          p.x + Math.cos(a) * r,
          y,
          p.z + Math.sin(a) * r,
          -Math.sin(a) * r * w,
          c.sky ? -1.5 : 1.8,
          Math.cos(a) * r * w,
          0.9,
          0.9,
          p.x,
          y,
          p.z,
          kin,
        );
      }
      if ((tick += dt) > 0.9) {
        tick = 0;
        this.impact(c, p.x, 1, p.z, 1.3 * c.scale);
        c.sub?.(p);
      }
      return t < 4.2 * c.dur;
    };
  }

  private wave(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    const max = 8 * Math.sqrt(c.scale);
    return (dt) => {
      t += dt / 0.9;
      const r = 0.6 + t * max;
      for (acc += dt * 420 * Math.min(2, c.scale); acc >= 1; acc--) {
        const a = Math.random() * Math.PI * 2;
        this.body(
          c,
          p.x + Math.cos(a) * r,
          c.sky ? 7 : 0.25,
          p.z + Math.sin(a) * r,
          Math.cos(a) * 4,
          c.sky ? -7 : 2.5 + Math.random() * 2,
          Math.sin(a) * 4,
          1,
          0.7,
          p.x,
          0,
          p.z,
        );
      }
      this.impact(c, p.x, 1, p.z, r);
      if (t < 1) return true;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        c.sub?.(new Vector3(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r));
      }
      return false;
    };
  }

  private pillar(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    let tick = 1;
    const r = 0.7 * c.scale;
    return (dt) => {
      t += dt;
      for (acc += dt * 170 * Math.min(2, c.scale); acc >= 1; acc--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        const up = (9 + Math.random() * 7) * Math.sqrt(c.scale);
        this.body(
          c,
          p.x + Math.cos(a) * d,
          c.sky ? 11 : 0.15,
          p.z + Math.sin(a) * d,
          rnd() * 0.7,
          c.sky ? -up : up,
          rnd() * 0.7,
          1,
          1.1,
          p.x,
          3,
          p.z,
        );
      }
      if ((tick += dt) > 0.3) {
        tick = 0;
        this.impact(c, p.x, 1, p.z, r + 0.6);
      }
      if (t < 1.4 * c.dur) return true;
      c.sub?.(new Vector3(p.x, 3.2 * c.scale, p.z));
      return false;
    };
  }

  /** Jato contínuo saindo da mão. */
  private jet(c: Cfg, origin: Vector3, dir: Vector3): Active {
    let t = 0;
    let acc = 0;
    let tick = 0;
    const from = c.sky ? origin.clone().addScaledVector(dir, 8).setY(12) : origin;
    const d = c.sky ? new Vector3(0, -1, 0) : dir;
    const speed = (c.m.speed + 4) * c.speed;
    const reach = Math.min(c.sky ? 12 : 11, speed * 0.55) * Math.sqrt(c.scale);
    const end = from.clone().addScaledVector(d, reach);
    end.y = Math.max(0.1, end.y);
    return (dt) => {
      t += dt;
      for (acc += dt * 230; acc >= 1; acc--) {
        const k = 0.75 + Math.random() * 0.5;
        this.body(
          c,
          from.x,
          from.y,
          from.z,
          d.x * speed * k + rnd() * 1.6,
          d.y * speed * k + rnd() * 1.6,
          d.z * speed * k + rnd() * 1.6,
          0.9,
          0.75,
        );
      }
      if ((tick += dt) > 0.25) {
        tick = 0;
        for (let k = 0.25; k <= 1; k += 0.25)
          this.impact(
            c,
            from.x + (end.x - from.x) * k,
            from.y + (end.y - from.y) * k,
            from.z + (end.z - from.z) * k,
            0.9 * c.scale,
          );
      }
      if (t < 1.5 * c.dur) return true;
      c.sub?.(end);
      return false;
    };
  }

  private rain(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    let tick = 0;
    let subs = 0;
    const r = 3.2 * Math.sqrt(c.scale) * (c.sky ? 1.5 : 1);
    return (dt) => {
      t += dt;
      for (acc += dt * 95 * Math.min(2.2, c.scale) * (c.sky ? 1.6 : 1); acc >= 1; acc--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        this.body(
          c,
          p.x + Math.cos(a) * d,
          9 + rnd(),
          p.z + Math.sin(a) * d,
          rnd() * 0.4,
          -13,
          rnd() * 0.4,
          1,
          2,
        );
      }
      if ((tick += dt) > 0.45) {
        tick = 0;
        this.impact(c, p.x, 1, p.z, r);
        if (subs++ < 4 && t > 0.6) {
          const a = Math.random() * Math.PI * 2;
          c.sub?.(new Vector3(p.x + Math.cos(a) * r * 0.6, 0.1, p.z + Math.sin(a) * r * 0.6));
        }
      }
      return t < 3.2 * c.dur;
    };
  }
}
