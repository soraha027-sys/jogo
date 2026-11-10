import { Color, Group, IcosahedronGeometry, Mesh, Vector3 } from 'three';
import type { Camera, Scene, ShaderMaterial } from 'three';
import { Ribbon } from './Ribbon';
import { orbMaterial, paletteOf, ribbonMaterial, type Palette } from './Stylized';

type Item = (dt: number, camera: Camera) => boolean;

export interface Handle {
  /** Posição da cabeça (projétil). */
  at(p: Vector3, vel?: Vector3): void;
  /** Acabou: se desfaz sozinho. */
  end(): void;
}

const GRAY: Palette = {
  core: new Color(0xf2f2f2),
  main: new Color(0xbfc2c8),
  edge: new Color(0x8c9099),
};
const rnd = (): number => Math.random() * 2 - 1;

/** Ritmo próprio de cada elemento (o rastro do vento ondula, o do fogo é largo, o da matéria espirala). */
const LOOK: Record<
  string,
  { width: number; scroll: number; noise: number; erosion: number; strands: number; twist: number }
> = {
  pir: { width: 0.75, scroll: 3.5, noise: 5, erosion: 0.45, strands: 1, twist: 0 },
  vent: { width: 0.4, scroll: 4.5, noise: 3, erosion: 0.3, strands: 2, twist: 9 },
  gel: { width: 0.45, scroll: 2, noise: 7, erosion: 0.25, strands: 1, twist: 0 },
  lav: { width: 0.55, scroll: 2.5, noise: 4, erosion: 0.35, strands: 1, twist: 3 },
  ter: { width: 0.5, scroll: 1.5, noise: 6, erosion: 0.5, strands: 1, twist: 0 },
  kor: { width: 0.55, scroll: 3, noise: 4, erosion: 0.4, strands: 3, twist: 14 },
};
const lookOf = (root: string): (typeof LOOK)[string] =>
  LOOK[root] ?? (LOOK.kor as (typeof LOOK)[string]);

/**
 * Efeitos estilizados de jogo de anime: rastros pintados, orbes com borda, meias-luas, espirais,
 * anéis de choque com espinhos, prisão de bolha d'água e riscos no chão. Tudo em faixas de borda
 * dura com ruído que se desfaz (ver `Stylized.ts`).
 */
export class StyleFx {
  private items: Item[] = [];

  constructor(private readonly scene: Scene) {}

  update(dt: number, camera: Camera): void {
    this.items = this.items.filter((fn) => fn(dt, camera));
  }

  private ribbon(root: string, max: number, width: number, flat = false, pal?: Palette): Ribbon {
    const l = lookOf(root);
    return new Ribbon(
      this.scene,
      ribbonMaterial(pal ?? paletteOf(root), {
        scroll: l.scroll,
        noiseScale: l.noise,
        erosion: l.erosion,
      }),
      max,
      width,
      flat,
    );
  }

  /** Rastro que segue o projétil; vento e matéria ganham fios que espiralam em volta. */
  trail(root: string, scale: number): Handle {
    const l = lookOf(root);
    // pontos por distância (não por quadro): o rastro tem o mesmo tamanho em qualquer FPS
    const main = this.ribbon(root, 16, l.width * scale * 1.5);
    const extra = Array.from({ length: l.strands - 1 }, () =>
      this.ribbon(root, 16, l.width * scale * 0.5),
    );
    const last = new Vector3(Infinity, 0, 0);
    let ended = false;
    let dis = 0;
    let t = 0;
    const head = new Vector3();
    const dir = new Vector3(1, 0, 0);
    const side = new Vector3();
    const up = new Vector3();
    this.items.push((dt, cam) => {
      t += dt;
      if (ended) {
        dis = Math.min(1, dis + dt * 3);
        main.dissolve = dis;
        main.shrink(1);
        extra.forEach((r) => {
          r.dissolve = dis;
          r.shrink(1);
        });
      }
      main.update(dt, cam);
      extra.forEach((r) => r.update(dt, cam));
      if (ended && (dis >= 1 || main.points.length < 2)) {
        main.dispose();
        extra.forEach((r) => r.dispose());
        return false;
      }
      return true;
    });
    return {
      at: (p, vel) => {
        if (ended) return;
        head.copy(p);
        if (vel && vel.lengthSq() > 1e-4) dir.copy(vel).normalize();
        // a cabeça sempre acompanha; ponto novo só a cada 0,28 m
        if (last.distanceTo(head) < 0.28 && main.points.length > 1) {
          main.points[main.points.length - 1]?.copy(head);
          return;
        }
        last.copy(head);
        main.push(head);
        side.crossVectors(dir, new Vector3(0, 1, 0));
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        up.crossVectors(side, dir).normalize();
        extra.forEach((r, i) => {
          const a = t * l.twist + (i / extra.length) * Math.PI * 2;
          const rad = 0.35 * scale;
          r.push(
            head
              .clone()
              .addScaledVector(side, Math.cos(a) * rad)
              .addScaledVector(up, Math.sin(a) * rad),
          );
        });
      },
      end: () => {
        ended = true;
      },
    };
  }

  /** Orbe na cabeça do projétil (água vira bolha; matéria ganha anéis girando). */
  orb(root: string, scale: number): Handle {
    const pal = paletteOf(root);
    const mat = orbMaterial(pal, { bubble: root === 'lav' });
    const geo = new IcosahedronGeometry(0.32 * scale, 2);
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    const rings =
      root === 'kor' || root === 'pir'
        ? [this.ribbon(root, 24, 0.12 * scale), this.ribbon(root, 24, 0.1 * scale)]
        : [];
    rings.forEach((r) => (r.taper = (u) => Math.sin(u * Math.PI)));
    let ended = false;
    let pop = 0;
    let t = 0;
    const p = new Vector3();
    this.items.push((dt, cam) => {
      t += dt;
      const ut = (mat as ShaderMaterial).uniforms.uTime;
      if (ut) ut.value = t;
      if (root === 'lav') mesh.scale.set(1 + Math.sin(t * 20) * 0.1, 1 - Math.sin(t * 20) * 0.1, 1);
      mesh.position.copy(p);
      rings.forEach((r, i) => {
        const pts: Vector3[] = [];
        const tilt = i === 0 ? 0.6 : -0.9;
        for (let k = 0; k < 24; k++) {
          const a = t * (i ? -9 : 7) + (k / 23) * Math.PI * 1.6;
          const rr = 0.55 * scale;
          pts.push(
            new Vector3(
              p.x + Math.cos(a) * rr,
              p.y + Math.sin(a) * rr * Math.sin(tilt),
              p.z + Math.sin(a) * rr * Math.cos(tilt),
            ),
          );
        }
        r.set(pts);
        r.dissolve = pop;
        r.update(dt, cam);
      });
      if (ended) {
        pop += dt * 6;
        mesh.scale.setScalar(1 + pop * 1.5);
        if (pop >= 1) {
          this.scene.remove(mesh);
          geo.dispose();
          mat.dispose();
          rings.forEach((r) => r.dispose());
          return false;
        }
      }
      return true;
    });
    return { at: (q) => p.copy(q), end: () => (ended = true) };
  }

  /** Meia-lua de energia na frente de quem lança (o "golpe" do feitiço). */
  slash(root: string, origin: Vector3, dir: Vector3, scale: number): void {
    const r = this.ribbon(root, 20, 0.5 * scale);
    r.taper = (u) => Math.sin(u * Math.PI) ** 0.7;
    const d = new Vector3(dir.x, 0, dir.z).normalize();
    const side = new Vector3(-d.z, 0, d.x);
    const tilt = rnd() * 0.6;
    let t = 0;
    this.items.push((dt, cam) => {
      t += dt;
      const sweep = Math.min(1, t / 0.12);
      const pts: Vector3[] = [];
      for (let k = 0; k < 20; k++) {
        const a = (-0.9 + (k / 19) * 1.8 * sweep) * 1.2;
        const rad = 0.9 * scale + t * 2;
        pts.push(
          origin
            .clone()
            .addScaledVector(d, Math.cos(a) * rad)
            .addScaledVector(side, Math.sin(a) * rad)
            .add(new Vector3(0, Math.sin(a) * tilt, 0)),
        );
      }
      r.set(pts);
      r.dissolve = Math.max(0, (t - 0.12) * 3.2);
      r.update(dt, cam);
      if (t > 0.45) {
        r.dispose();
        return false;
      }
      return true;
    });
  }

  /** Riscos cinza no chão, pra trás de quem lança (o peso do movimento, como nos rascunhos). */
  groundStrokes(at: Vector3, dir: Vector3): void {
    const d = new Vector3(dir.x, 0, dir.z).normalize();
    for (let i = 0; i < 4; i++) {
      const r = this.ribbon('vent', 6, 0.18 + Math.random() * 0.12, true, GRAY);
      r.taper = (u) => u;
      const start = at
        .clone()
        .setY(0.03)
        .add(new Vector3(rnd() * 0.4, 0, rnd() * 0.4));
      const back = d
        .clone()
        .multiplyScalar(-(1 + Math.random() * 1.2))
        .applyAxisAngle(new Vector3(0, 1, 0), rnd() * 0.5);
      let t = 0;
      this.items.push((dt, cam) => {
        t += dt;
        const len = Math.min(1, t * 8);
        const pts: Vector3[] = [];
        for (let k = 0; k < 6; k++)
          pts.push(start.clone().addScaledVector(back, (1 - k / 5) * len));
        r.set(pts);
        r.dissolve = Math.max(0, (t - 0.2) * 2.5);
        r.update(dt, cam);
        if (t > 0.6) {
          r.dispose();
          return false;
        }
        return true;
      });
    }
  }

  /** Anel de choque deitado no chão + espinhos saindo do centro. */
  shock(root: string, at: Vector3, scale: number): void {
    const ring = this.ribbon(root, 40, 0.35 * scale, true);
    ring.taper = () => 1;
    const spikes = Array.from({ length: 7 }, () => {
      const s = this.ribbon(root, 4, 0.22 * scale);
      s.taper = (u) => 1 - u;
      return {
        r: s,
        a: Math.random() * Math.PI * 2,
        up: 0.3 + Math.random() * 0.9,
        len: (0.8 + Math.random() * 0.7) * scale,
      };
    });
    const y = Math.max(0.06, at.y - 0.8);
    let t = 0;
    this.items.push((dt, cam) => {
      t += dt;
      const rad = (0.4 + t * 6) * scale;
      const pts: Vector3[] = [];
      for (let k = 0; k <= 39; k++) {
        const a = (k / 39) * Math.PI * 2;
        pts.push(new Vector3(at.x + Math.cos(a) * rad, y, at.z + Math.sin(a) * rad));
      }
      ring.set(pts);
      ring.dissolve = Math.min(1, t * 2.4);
      ring.update(dt, cam);
      const grow = Math.min(1, t * 10);
      for (const s of spikes) {
        const dirv = new Vector3(Math.cos(s.a), s.up, Math.sin(s.a)).normalize();
        s.r.set([0, 1, 2, 3].map((k) => at.clone().addScaledVector(dirv, (k / 3) * s.len * grow)));
        s.r.dissolve = Math.max(0, (t - 0.08) * 3);
        s.r.update(dt, cam);
      }
      if (t > 0.42) {
        ring.dispose();
        spikes.forEach((s) => s.r.dispose());
        return false;
      }
      return true;
    });
  }

  /** Espiral de 3 fios subindo (vórtice, coluna). `center` é lido todo quadro (o vórtice anda). */
  helix(
    root: string,
    center: Vector3,
    height: number,
    radius: number,
    life: number,
    down = false,
  ): void {
    const strands = Array.from({ length: 3 }, () =>
      this.ribbon(root, 30, 0.32 * Math.sqrt(radius)),
    );
    strands.forEach((r) => (r.taper = (u) => Math.sin(u * Math.PI) ** 0.6));
    let t = 0;
    this.items.push((dt, cam) => {
      t += dt;
      strands.forEach((r, i) => {
        const pts: Vector3[] = [];
        for (let k = 0; k < 30; k++) {
          const h = k / 29;
          const a = t * 7 + h * Math.PI * 3 + (i / 3) * Math.PI * 2;
          const rad = radius * (0.25 + h * 0.85);
          const y = down ? center.y - h * height : center.y + h * height;
          pts.push(new Vector3(center.x + Math.cos(a) * rad, y, center.z + Math.sin(a) * rad));
        }
        r.set(pts);
        r.dissolve = Math.max(0, 1 - Math.min(t * 4, (life - t) * 2.5));
        r.update(dt, cam);
      });
      if (t >= life) {
        strands.forEach((r) => r.dispose());
        return false;
      }
      return true;
    });
  }

  /** Anel que se abre no chão (onda). */
  wave(root: string, center: Vector3, maxRadius: number, life: number, y = 0.1): void {
    const ring = this.ribbon(root, 48, 0.9, true);
    ring.taper = () => 1;
    const inner = this.ribbon(root, 48, 0.35, true);
    inner.taper = () => 1;
    let t = 0;
    this.items.push((dt, cam) => {
      t += dt;
      const k = Math.min(1, t / life);
      [ring, inner].forEach((r, i) => {
        const rad = 0.6 + k * maxRadius * (i ? 0.75 : 1);
        const pts: Vector3[] = [];
        for (let j = 0; j <= 47; j++) {
          const a = (j / 47) * Math.PI * 2;
          pts.push(
            new Vector3(center.x + Math.cos(a) * rad, y + i * 0.05, center.z + Math.sin(a) * rad),
          );
        }
        r.set(pts);
        r.dissolve = k * 0.9;
        r.update(dt, cam);
      });
      if (t >= life) {
        ring.dispose();
        inner.dispose();
        return false;
      }
      return true;
    });
  }

  /** Feixe reto do jato + dois fios girando em volta. */
  beam(root: string, from: Vector3, to: Vector3, width: number, life: number): void {
    const core = this.ribbon(root, 12, width);
    core.taper = (u) => 0.4 + 0.6 * Math.sin(u * Math.PI) ** 0.3;
    const wraps = [this.ribbon(root, 30, width * 0.3), this.ribbon(root, 30, width * 0.3)];
    const d = to.clone().sub(from);
    const len = d.length();
    d.normalize();
    const side = new Vector3().crossVectors(d, new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(side, d).normalize();
    let t = 0;
    this.items.push((dt, cam) => {
      t += dt;
      const grow = Math.min(1, t * 6);
      core.set(
        Array.from({ length: 12 }, (_, k) =>
          from.clone().addScaledVector(d, (k / 11) * len * grow),
        ),
      );
      wraps.forEach((r, i) => {
        r.set(
          Array.from({ length: 30 }, (_, k) => {
            const h = k / 29;
            const a = t * 14 + h * Math.PI * 6 + i * Math.PI;
            const rad = width * 0.9 * (0.4 + h);
            return from
              .clone()
              .addScaledVector(d, h * len * grow)
              .addScaledVector(side, Math.cos(a) * rad)
              .addScaledVector(up, Math.sin(a) * rad);
          }),
        );
      });
      const dis = Math.max(0, 1 - (life - t) * 4);
      [core, ...wraps].forEach((r) => {
        r.dissolve = dis;
        r.update(dt, cam);
      });
      if (t >= life) {
        [core, ...wraps].forEach((r) => r.dispose());
        return false;
      }
      return true;
    });
  }

  /**
   * Prisão de água: bolha grande que treme em volta do alvo, com bolhinhas soltando.
   * `follow` é lido todo quadro (o alvo pode ser empurrado).
   */
  bubble(follow: Vector3, scale: number, life: number, pop: () => void): void {
    const pal = paletteOf('lav');
    const g = new Group();
    const big = new Mesh(
      new IcosahedronGeometry(1.15 * scale, 3),
      orbMaterial(pal, { bubble: true }),
    );
    big.scale.set(1, 1.15, 1);
    g.add(big);
    const small = Array.from({ length: 6 }, () => {
      const m = new Mesh(
        new IcosahedronGeometry(0.18 + Math.random() * 0.15, 2),
        orbMaterial(pal, { bubble: true }),
      );
      m.userData = { a: Math.random() * Math.PI * 2, h: Math.random(), s: 0.6 + Math.random() };
      g.add(m);
      return m;
    });
    big.renderOrder = 6;
    this.scene.add(g);
    let t = 0;
    this.items.push((dt) => {
      t += dt;
      g.position.set(follow.x, follow.y + 1.1, follow.z);
      const w = Math.sin(t * 9) * 0.06;
      big.scale.set(1 + w, 1.15 - w, 1 + w);
      for (const m of [big, ...small]) {
        const u = (m.material as ShaderMaterial).uniforms.uTime;
        if (u) u.value = t;
      }
      small.forEach((m) => {
        const d = m.userData as { a: number; h: number; s: number };
        const h = (d.h + t * 0.25 * d.s) % 1;
        m.position.set(
          Math.cos(d.a + t) * 1.3 * scale,
          (h - 0.4) * 2.6 * scale,
          Math.sin(d.a + t) * 1.3 * scale,
        );
      });
      const appear = Math.min(1, t * 8);
      g.scale.setScalar(appear);
      if (t >= life) {
        this.scene.remove(g);
        g.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as ShaderMaterial).dispose();
          }
        });
        pop();
        return false;
      }
      return true;
    });
  }
}
