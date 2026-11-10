import {
  Color,
  DodecahedronGeometry,
  MeshToonMaterial,
  OctahedronGeometry,
  PointLight,
} from 'three';
import type { Scene } from 'three';
import { toonRamp } from '../art/toon';
import { ParticlePool, type Kin } from './Particles';
import { Shape, SpritePool } from './Sprites';

const c = (hex: number): Color => new Color(hex);
const rnd = (): number => Math.random() * 2 - 1;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;

/** Paleta de cada raiz. A cor exata ainda puxa um pouco da essência da mistura. */
const PAL = {
  pir: {
    core: c(0xfff2b0),
    mid: c(0xff8a1e),
    end: c(0xc22a0c),
    ember: c(0xffd36a),
    smoke: c(0x3b3238),
  },
  vent: { line: c(0xe8fff4), tint: c(0x9ff0cf), dust: c(0xcfe9dd) },
  gel: { shard: [c(0xdff7ff), c(0xa6e6ff), c(0x6cc8ff)], glint: c(0xffffff), mist: c(0xe6f8ff) },
  lav: { drop: [c(0x3d8bff), c(0x63b4ff), c(0x2a63d8)], foam: c(0xdff0ff), glint: c(0xbfe8ff) },
  ter: { rock: [c(0x8a7765), c(0x6f5e4f), c(0xa89580)], dust: c(0xb7a48a) },
  kor: { rim: c(0xb47cff), core: c(0x2a0f45), spark: c(0xff8ae8) },
};

export type Root = keyof typeof PAL;
export const ROOTS = Object.keys(PAL) as Root[];

/** Física de uma partícula (o que a essência da mistura diz). */
export interface Motion {
  gravity: number;
  drag: number;
  swirl: number;
  pull: number;
}

interface Flash {
  light: PointLight;
  t: number;
}

/**
 * Cada elemento com cara própria:
 * fogo = línguas de chama que sobem + brasas + fumaça · vento = riscos esticados que giram ·
 * gelo = cristais apontando pra onde voam + brilhos + névoa · água = gotas que caem e quicam + espuma ·
 * pedra = pedras que rolam e quicam + poeira · matéria = bolhas de vazio com borda acesa sugadas pro centro.
 */
export class ElementFx {
  readonly glow = new SpritePool(3200, true);
  readonly soft = new SpritePool(1400, false);
  private readonly rocks: ParticlePool;
  private readonly shards: ParticlePool;
  private readonly lights: Flash[] = [];

  constructor(scene: Scene) {
    this.rocks = new ParticlePool(
      new DodecahedronGeometry(0.5, 0),
      500,
      new MeshToonMaterial({ gradientMap: toonRamp() }),
    );
    this.shards = new ParticlePool(new OctahedronGeometry(0.5, 0), 600, undefined, true);
    this.rocks.mesh.castShadow = true;
    scene.add(this.glow.mesh, this.soft.mesh, this.rocks.mesh, this.shards.mesh);
    for (let i = 0; i < 3; i++) {
      const light = new PointLight(0xffffff, 0, 7, 2);
      scene.add(light);
      this.lights.push({ light, t: 0 });
    }
  }

  /** Uma "unidade" do elemento num ponto, com velocidade. `s` = tamanho, `tint` = cor da mistura. */
  emit(
    root: string,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    s = 1,
    life = 1,
    mo?: Motion,
    cx = x,
    cy = y,
    cz = z,
    tint?: Color,
  ): void {
    const g = this.glow;
    const r = Math.random();
    switch (root as Root) {
      case 'pir': {
        // corpo da chama opaco (fica forte em fundo claro) + brilho por cima + brasas
        const P = PAL.pir;
        const col = tint ? P.mid.clone().lerp(tint, 0.25) : P.mid;
        this.soft.emit({
          x,
          y,
          z,
          vx,
          vy: vy + 1.5,
          vz,
          life: 0.45 * life + Math.random() * 0.25,
          size: 0.62 * s,
          grow: 0.3,
          color: P.core,
          color2: col,
          shape: Shape.flame,
          gravity: -4,
          drag: 2,
          flicker: 0.2,
          alpha: 0.95,
        });
        if (r < 0.5)
          g.emit({
            x,
            y,
            z,
            vx,
            vy: vy + 1.5,
            vz,
            life: 0.25,
            size: 0.5 * s,
            grow: 0.4,
            color: P.mid,
            shape: Shape.soft,
            gravity: -4,
            drag: 2,
            alpha: 0.7,
          });
        if (r < 0.35)
          g.emit({
            x,
            y,
            z,
            vx: vx * 0.6 + rnd() * 2,
            vy: vy * 0.6 + 2 + Math.random() * 2,
            vz: vz * 0.6 + rnd() * 2,
            life: 0.6 + Math.random() * 0.6,
            size: 0.09 * s,
            color: P.ember,
            color2: P.end,
            shape: Shape.sparkle,
            gravity: 2,
            drag: 0.8,
          });
        if (r < 0.06)
          this.soft.emit({
            x,
            y: y + 0.3,
            z,
            vx: vx * 0.2,
            vy: 1.2,
            vz: vz * 0.2,
            life: 1.2,
            size: 0.35 * s,
            grow: 2.2,
            color: P.smoke,
            alpha: 0.25,
            shape: Shape.soft,
            gravity: -0.6,
            drag: 1.2,
          });
        break;
      }
      case 'vent': {
        // riscos brancos esticados no sentido do movimento, girando
        const P = PAL.vent;
        this.soft.emit({
          x,
          y,
          z,
          vx: vx * 1.4,
          vy: vy * 1.4,
          vz: vz * 1.4,
          life: 0.4 * life + Math.random() * 0.2,
          size: 0.15 * s,
          color: P.line,
          color2: P.tint,
          alpha: 0.85,
          shape: Shape.streak,
          stretch: 3,
          drag: mo?.drag ?? 0.4,
          swirl: mo?.swirl ?? 4,
          cx,
          cy,
          cz,
        });
        if (r < 0.3)
          g.emit({
            x,
            y,
            z,
            vx: vx * 1.6,
            vy: vy * 1.6,
            vz: vz * 1.6,
            life: 0.3,
            size: 0.08 * s,
            color: P.line,
            alpha: 0.9,
            shape: Shape.streak,
            stretch: 4,
            drag: 0.3,
            swirl: mo?.swirl ?? 4,
            cx,
            cy,
            cz,
          });
        if (r < 0.1)
          this.soft.emit({
            x,
            y,
            z,
            vx,
            vy,
            vz,
            life: 0.8,
            size: 0.3 * s,
            grow: 2,
            color: P.dust,
            alpha: 0.25,
            shape: Shape.soft,
            drag: 1.5,
            swirl: mo?.swirl ?? 4,
            cx,
            cy,
            cz,
          });
        break;
      }
      case 'gel': {
        // cristais apontando pra onde voam + brilhos + névoa fria
        const P = PAL.gel;
        if (r < 0.55) {
          const kin: Kin = {
            gravity: mo?.gravity ?? 2,
            drag: mo?.drag ?? 2.2,
            swirl: mo?.swirl ?? 0,
            bounce: 0.1,
            pull: mo?.pull ?? 0,
            stretch: 2.6,
          };
          this.shards.emit(
            x,
            y,
            z,
            vx,
            vy,
            vz,
            (0.9 + Math.random() * 0.6) * life,
            0.22 * s * (0.6 + Math.random() * 0.8),
            pick(P.shard),
            kin,
            cx,
            cy,
            cz,
          );
        } else if (r < 0.85)
          g.emit({
            x,
            y,
            z,
            vx: vx * 0.5,
            vy: vy * 0.5,
            vz: vz * 0.5,
            life: 0.5,
            size: 0.2 * s,
            color: P.glint,
            color2: P.shard[2],
            shape: Shape.sparkle,
            drag: 3,
            spin: 3,
          });
        else
          this.soft.emit({
            x,
            y,
            z,
            vx: vx * 0.3,
            vy: 0.2,
            vz: vz * 0.3,
            life: 1.2,
            size: 0.35 * s,
            grow: 2.5,
            color: P.mist,
            alpha: 0.35,
            shape: Shape.soft,
            drag: 2,
            gravity: 0.3,
          });
        break;
      }
      case 'lav': {
        // gotas que caem e quicam + espuma + reflexo
        const P = PAL.lav;
        if (r < 0.75)
          this.soft.emit({
            x,
            y,
            z,
            vx,
            vy,
            vz,
            life: 0.9 * life + Math.random() * 0.3,
            size: 0.17 * s,
            color: pick(P.drop),
            alpha: 0.95,
            shape: Shape.drop,
            stretch: 1.6,
            gravity: mo?.gravity ?? 10,
            drag: mo?.drag ?? 0.4,
            floor: true,
          });
        else if (r < 0.9)
          this.soft.emit({
            x,
            y,
            z,
            vx: vx * 0.4,
            vy: vy * 0.4 + 0.5,
            vz: vz * 0.4,
            life: 0.6,
            size: 0.28 * s,
            grow: 1.8,
            color: P.foam,
            alpha: 0.55,
            shape: Shape.soft,
            drag: 2.5,
          });
        else
          g.emit({
            x,
            y,
            z,
            vx,
            vy,
            vz,
            life: 0.4,
            size: 0.12 * s,
            color: P.glint,
            shape: Shape.sparkle,
            gravity: 6,
            drag: 1,
          });
        break;
      }
      case 'ter': {
        // pedras que rolam e quicam + poeira
        const P = PAL.ter;
        if (r < 0.5) {
          const kin: Kin = {
            gravity: mo?.gravity ?? 17,
            drag: 0.15,
            swirl: mo?.swirl ?? 0,
            bounce: 0.45,
            pull: mo?.pull ?? 0,
            stretch: 0.75,
          };
          this.rocks.emit(
            x,
            y,
            z,
            vx,
            vy,
            vz,
            (1.2 + Math.random() * 0.8) * life,
            0.3 * s * (0.5 + Math.random()),
            pick(P.rock),
            kin,
            cx,
            cy,
            cz,
          );
        } else
          this.soft.emit({
            x,
            y,
            z,
            vx: vx * 0.3 + rnd(),
            vy: vy * 0.3 + Math.random(),
            vz: vz * 0.3 + rnd(),
            life: 1.1,
            size: 0.34 * s,
            grow: 2.4,
            color: P.dust,
            alpha: 0.45,
            shape: Shape.soft,
            drag: 2.2,
            gravity: -0.3,
          });
        break;
      }
      case 'kor': {
        // bolhas de vazio (miolo escuro, borda acesa) sugadas pro centro + faíscas rosa + anéis
        const P = PAL.kor;
        const pull = (mo?.pull ?? 0) + 3;
        if (r < 0.45)
          this.soft.emit({
            x,
            y,
            z,
            vx,
            vy,
            vz,
            life: 0.8 * life,
            size: 0.34 * s,
            grow: 0.3,
            color: P.rim,
            alpha: 0.95,
            shape: Shape.void,
            drag: 2,
            pull,
            cx,
            cy,
            cz,
          });
        else if (r < 0.85)
          g.emit({
            x,
            y,
            z,
            vx,
            vy,
            vz,
            life: 0.6 * life,
            size: 0.16 * s,
            color: P.spark,
            color2: P.rim,
            shape: Shape.sparkle,
            drag: 1.5,
            pull,
            swirl: -3,
            cx,
            cy,
            cz,
            spin: 5,
          });
        else
          g.emit({
            x,
            y,
            z,
            vx: vx * 0.2,
            vy: vy * 0.2,
            vz: vz * 0.2,
            life: 0.5,
            size: 0.4 * s,
            grow: 0.1,
            color: P.rim,
            alpha: 0.6,
            shape: Shape.ring,
          });
        break;
      }
      default:
        g.emit({
          x,
          y,
          z,
          vx,
          vy,
          vz,
          life: 0.6,
          size: 0.15 * s,
          color: tint ?? c(0xffffff),
          shape: Shape.sparkle,
          drag: 2,
        });
    }
  }

  /** Núcleo brilhante (cabeça de projétil, centro de magia). */
  core(root: string, x: number, y: number, z: number, s: number): void {
    if (root === 'kor') {
      this.soft.emit({
        x,
        y,
        z,
        life: 0.06,
        size: 0.6 * s,
        color: PAL.kor.rim,
        shape: Shape.void,
        alpha: 1,
      });
      this.glow.emit({
        x,
        y,
        z,
        life: 0.06,
        size: 1.1 * s,
        color: PAL.kor.rim,
        shape: Shape.soft,
        alpha: 0.6,
      });
      return;
    }
    if (root === 'pir') {
      this.soft.emit({
        x,
        y,
        z,
        life: 0.06,
        size: 0.75 * s,
        color: PAL.pir.core,
        shape: Shape.soft,
        alpha: 1,
      });
      this.glow.emit({
        x,
        y,
        z,
        life: 0.06,
        size: 1.4 * s,
        color: PAL.pir.mid,
        shape: Shape.soft,
        alpha: 0.8,
      });
      return;
    }
    const col =
      root === 'gel'
        ? PAL.gel.glint
        : root === 'lav'
          ? PAL.lav.glint
          : root === 'vent'
            ? PAL.vent.line
            : PAL.ter.dust;
    this.glow.emit({
      x,
      y,
      z,
      life: 0.06,
      size: 0.9 * s,
      color: col,
      alpha: root === 'ter' ? 0.2 : 0.55,
      shape: Shape.soft,
    });
  }

  /** Anel de choque no chão/ar + flash de luz. */
  impact(root: string, x: number, y: number, z: number, s: number): void {
    const col =
      root === 'pir'
        ? PAL.pir.mid
        : root === 'gel'
          ? PAL.gel.shard[1]
          : root === 'lav'
            ? PAL.lav.drop[1]
            : root === 'kor'
              ? PAL.kor.rim
              : root === 'vent'
                ? PAL.vent.tint
                : PAL.ter.dust;
    this.glow.emit({
      x,
      y,
      z,
      life: 0.35,
      size: 0.4 * s,
      grow: 7,
      color: col ?? c(0xffffff),
      alpha: 0.9,
      shape: Shape.ring,
    });
    this.glow.emit({
      x,
      y,
      z,
      life: 0.12,
      size: 1.4 * s,
      grow: 1.5,
      color: c(0xffffff),
      alpha: 0.6,
      shape: Shape.soft,
    });
    this.flash(x, y, z, col ?? c(0xffffff), 2.5 + s);
  }

  flash(x: number, y: number, z: number, color: Color, power: number): void {
    const f = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    f.light.position.set(x, y + 0.5, z);
    f.light.color.copy(color);
    f.t = 0.18;
    f.light.intensity = power * 6;
  }

  /** Nuvem de vapor (branca, macia, sobe). */
  steam(x: number, y: number, z: number, s = 1): void {
    this.soft.emit({
      x,
      y,
      z,
      vx: rnd() * 0.6,
      vy: 0.5 + Math.random() * 0.5,
      vz: rnd() * 0.6,
      life: 1.6 + Math.random(),
      size: 0.45 * s,
      grow: 2.6,
      color: PAL.lav.foam,
      alpha: 0.5,
      shape: Shape.soft,
      drag: 1.2,
      gravity: -0.4,
    });
  }

  /** Fumaça escura (falha, estouro). */
  smoke(x: number, y: number, z: number, vx: number, vy: number, vz: number, s = 1): void {
    this.soft.emit({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      life: 1.3 + Math.random() * 0.6,
      size: 0.4 * s,
      grow: 2.4,
      color: PAL.pir.smoke,
      color2: c(0x6a6370),
      alpha: 0.7,
      shape: Shape.soft,
      drag: 2,
      gravity: -1.2,
    });
  }

  /** Faísca branca-dourada (lançamento, acerto). */
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.glow.emit({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      life: 0.5,
      size: 0.12,
      color: c(0xfff3c4),
      color2: c(0xb48cff),
      shape: Shape.sparkle,
      drag: 3,
      spin: 6,
      stretch: 0,
    });
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.soft.update(dt);
    this.rocks.update(dt);
    this.shards.update(dt);
    for (const f of this.lights) {
      if (f.t <= 0) continue;
      f.t -= dt;
      f.light.intensity = f.t > 0 ? f.light.intensity * Math.exp(-14 * dt) : 0;
    }
  }
}
