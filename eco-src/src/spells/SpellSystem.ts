import { Color, CylinderGeometry, Group, Mesh, MeshToonMaterial, Vector3 } from 'three';
import type { Camera, Scene } from 'three';
import { toonRamp } from '../art/toon';
import { box, rayAabb, type Aabb } from '../physics/aabb';
import { ElementFx, type Motion } from '../vfx/Elements';
import { column, head, iceCluster, type FormFx } from '../vfx/Forms';
import { StyleFx } from '../vfx/Style';
import { materialize, type Matter, type SpellPlan, type WordPlan } from './essence';
import { emptyImpact, impactOf, scaleImpact, type Impact } from './impact';
import type { Lingua } from './lingua';
import { applyImpact, tickStatus, type Reaction, type Status } from './status';
import type { Zones } from './Zones';

/** Quem pode ser atingido. */
export interface Target {
  readonly pos: Vector3;
  readonly radius: number;
  readonly status: Status;
  readonly alive: boolean;
  impulse(vx: number, vy: number, vz: number): void;
  flash(color: Color): void;
}

export interface SpellHooks {
  popup(text: string, at: Vector3, kind: string, big?: boolean): void;
  /** Mana roubada volta pra quem lançou (só a própria bruxa). */
  drain(amount: number): void;
  /** Coice do jato de vento: impulso na própria bruxa. */
  recoil(v: Vector3): void;
}

type Active = (dt: number) => boolean;
type Sub = ((at: Vector3) => void) | null;
type Mode = 'out' | 'dir' | 'in';

interface Cfg {
  m: Matter;
  /** Raízes que aparecem nas partículas, com peso (1ª domina; a infusão entra mais fraca). */
  styles: [string, number][];
  /** Raiz que manda no visual (cabeça do projétil, cor do anel). */
  lead: string;
  imp: Impact;
  scale: number;
  dur: number;
  speed: number;
  sky: boolean;
  jitter: number;
  sub: Sub;
  /** Onde quem lançou estava (matéria do projétil puxa pra lá). */
  caster: Vector3;
  self: boolean;
}

interface Pillar {
  object: Group | Mesh;
  collider: Aabb;
  life: number;
  height: number;
}

const REACTION_KIND: Record<Reaction, string> = {
  congelou: 'chill',
  vapor: 'steam',
  estilhaçou: 'solid',
  derreteu: 'wet',
  apagou: 'wet',
  espalhou: 'burn',
  secou: 'burn',
};
const UP = new Vector3(0, 1, 0);
const v = new Vector3();
const rnd = (): number => Math.random() * 2 - 1;
const motionOf = (m: Matter): Motion => ({
  gravity: m.gravity,
  drag: m.drag,
  swirl: m.swirl,
  pull: m.pull,
});

function stylesOf(p: SpellPlan, d: Lingua): [string, number][] {
  const out = new Map<string, number>();
  const add = (w: WordPlan, k: number): void =>
    w.roots.forEach((r, i) => out.set(r, (out.get(r) ?? 0) + (d.rootWeights[i] ?? 0.25) * k));
  add(p.body, 1);
  if (p.infusion) add(p.infusion, 0.6);
  return [...out.entries()];
}

/**
 * Executa magias. Não há poderes cadastrados: a forma (terminação) decide COMO a magia chega,
 * as raízes decidem o visual de cada partícula e o impacto (o que faz), e os estados de quem é
 * atingido reagem entre si. A 2ª palavra vira um sub-feitiço nos pontos de efeito da 1ª.
 */
export class SpellSystem {
  mana: number;
  readonly fx: ElementFx;
  readonly style: StyleFx;
  /** Câmera (as faixas estilizadas viram pra ela). */
  camera: Camera | null = null;
  private active: Active[] = [];
  private readonly forms: FormFx[] = [];
  private readonly pillars: Pillar[] = [];
  private fxAcc = 0;

  constructor(
    private readonly data: Lingua,
    private readonly scene: Scene,
    private readonly colliders: Aabb[],
    private readonly targets: readonly Target[],
    private readonly zones: Zones,
    private readonly hooks: SpellHooks,
  ) {
    this.mana = data.manaMax;
    this.fx = new ElementFx(scene);
    this.style = new StyleFx(scene);
  }

  update(dt: number): void {
    this.mana = Math.min(this.data.manaMax, this.mana + this.data.manaRegen * dt);
    this.active = this.active.filter((fn) => fn(dt));
    for (const f of this.forms) f.update(dt);
    for (const t of this.targets) {
      if (!t.alive) continue;
      const burn = tickStatus(t.status, dt, this.data);
      if (burn > 0 && Math.random() < dt * 3)
        this.hooks.popup(String(Math.round(burn * 8)), t.pos.clone().setY(1.8), 'burn');
    }
    this.statusFx(dt);
    this.updatePillars(dt);
    this.fx.update(dt);
    if (this.camera) this.style.update(dt, this.camera);
  }

  private track(f: FormFx): FormFx {
    this.forms.push(f);
    return f;
  }

  private drop(f: FormFx | null): void {
    if (!f) return;
    f.dispose();
    const i = this.forms.indexOf(f);
    if (i >= 0) this.forms.splice(i, 1);
  }

  // ---------- partículas ----------

  /** Uma partícula da magia: sorteia a raiz pelo peso e emite o visual DELA. */
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
    mo?: Motion,
  ): void {
    let r = Math.random() * c.styles.reduce((s, [, w]) => s + w, 0);
    let root = c.lead;
    for (const [id, w] of c.styles) {
      r -= w;
      if (r <= 0) {
        root = id;
        break;
      }
    }
    const j = c.jitter * 3;
    this.fx.emit(
      root,
      x,
      y,
      z,
      vx + rnd() * j,
      vy + rnd() * j,
      vz + rnd() * j,
      size * c.scale,
      life,
      mo ?? motionOf(c.m),
      cx,
      cy,
      cz,
      c.m.colors[0],
    );
  }

  private burstCfg(c: Cfg, p: Vector3, n: number, speed: number, size = 1): void {
    for (let i = 0; i < n; i++) {
      v.set(rnd(), rnd() * 0.6 + 0.5, rnd())
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random()));
      this.body(c, p.x, p.y, p.z, v.x, v.y, v.z, size, 1.2, p.x, p.y, p.z);
    }
  }

  private burstRoot(root: string, p: Vector3, n: number, speed: number, size = 1): void {
    for (let i = 0; i < n; i++) {
      v.set(rnd(), rnd() * 0.6 + 0.5, rnd())
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random()));
      this.fx.emit(root, p.x, p.y, p.z, v.x, v.y, v.z, size, 1.1);
    }
  }

  smoke(p: Vector3, n = 70, speed = 7): void {
    for (let i = 0; i < n; i++) {
      v.set(rnd(), rnd() * 0.7 + 0.3, rnd())
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random()));
      this.fx.smoke(p.x, p.y, p.z, v.x, v.y, v.z, 0.6 + Math.random());
    }
  }

  /** Chamas, gotas, geada e vazio saindo de quem tem o estado; e as zonas no chão. */
  private statusFx(dt: number): void {
    this.fxAcc += dt;
    if (this.fxAcc < 1 / 30) return;
    const h = this.fxAcc;
    this.fxAcc = 0;
    const chance = (rate: number): boolean => Math.random() < rate * h;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const s = t.status;
      const p = t.pos;
      if (s.burning > 0)
        for (let i = 0; i < 3; i++)
          if (chance(12))
            this.fx.emit(
              'pir',
              p.x + rnd() * 0.3,
              p.y + 0.3 + Math.random() * 1.5,
              p.z + rnd() * 0.3,
              rnd() * 0.3,
              1.5,
              rnd() * 0.3,
              0.9,
              0.9,
            );
      if (s.wet > 0 && chance(10))
        this.fx.emit(
          'lav',
          p.x + rnd() * 0.3,
          p.y + 0.6 + Math.random() * 1.2,
          p.z + rnd() * 0.3,
          0,
          -0.5,
          0,
          0.7,
          0.7,
        );
      if (s.chill > 0 && chance(4 * s.chill))
        this.fx.emit(
          'gel',
          p.x + rnd() * 0.4,
          p.y + 0.3 + Math.random() * 1.6,
          p.z + rnd() * 0.4,
          0,
          0.3,
          0,
          0.6,
          0.6,
        );
      if (s.frozen > 0 && chance(3))
        this.fx.emit(
          'gel',
          p.x + rnd() * 0.6,
          p.y + Math.random() * 2,
          p.z + rnd() * 0.6,
          0,
          0.2,
          0,
          0.5,
          0.6,
        );
    }
    for (const z of this.zones.list) {
      const area = z.r * z.r;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * z.r;
      const x = z.x + Math.cos(a) * d;
      const zz = z.z + Math.sin(a) * d;
      if (z.kind === 'fogo' && chance(8 * area))
        this.fx.emit('pir', x, 0.1, zz, 0, 1.5, 0, 0.9, 0.8);
      else if (z.kind === 'vapor' && chance(6 * area))
        this.fx.steam(x, 0.3 + Math.random() * 1.4, zz, 1.2);
      else if (z.kind === 'gelo' && chance(0.6 * area))
        this.fx.emit('gel', x, 0.05, zz, 0, 0.4, 0, 0.6, 0.6);
    }
    // as zonas também atingem quem está nelas
    for (const t of this.targets) {
      if (!t.alive) continue;
      if (this.zones.at(t.pos.x, t.pos.z, 'fogo') && t.status.burning < 0.5)
        applyImpact(t.status, { ...emptyImpact(), burn: 0.5 }, this.data);
      if (this.zones.at(t.pos.x, t.pos.z, 'poca')) t.status.wet = Math.max(t.status.wet, 1.5);
    }
  }

  // ---------- acerto ----------

  /** Aplica o impacto num alvo: estado + reações + empurrão + números na tela. */
  private strike(c: Cfg, t: Target, k: number, from: Vector3, mode: Mode, dir?: Vector3): void {
    if (!t.alive || k <= 0) return;
    const cs = this.data.combat;
    const imp = scaleImpact(c.imp, k);
    const res = applyImpact(t.status, imp, this.data);
    const p = t.pos;
    const away = new Vector3(p.x - from.x, 0, p.z - from.z);
    if (away.lengthSq() < 1e-4) away.set(rnd(), 0, rnd());
    away.normalize();
    const along = mode === 'dir' && dir ? new Vector3(dir.x, 0, dir.z).normalize() : away.clone();
    const sign = mode === 'in' ? -1 : 1;
    const push = imp.push * cs.pushSpeed + imp.solid * 1.5;
    const toCaster = new Vector3(c.caster.x - p.x, 0, c.caster.z - p.z).normalize();
    const pullTo = mode === 'dir' ? toCaster : away.clone().multiplyScalar(-1);
    const pull = imp.pull * cs.pullSpeed;
    t.impulse(
      along.x * push * sign + pullTo.x * pull,
      imp.lift * cs.liftSpeed - imp.slam * 9,
      along.z * push * sign + pullTo.z * pull,
    );
    t.flash(c.m.colors[0] ?? new Color(0xffffff));
    const head = p.clone().setY(p.y + 2);
    if (res.damage >= 1)
      this.hooks.popup(String(Math.round(res.damage)), head, kindOf(imp), res.damage > 30);
    for (const r of res.reactions) this.reaction(r, t);
    if (c.self && imp.drain > 0.05 && res.damage > 0) {
      this.hooks.drain(res.damage * 0.35);
      // fios de vazio voltando pra quem lançou
      for (let i = 0; i < 10; i++)
        this.fx.emit(
          'kor',
          p.x,
          p.y + 1,
          p.z,
          rnd(),
          1,
          rnd(),
          0.8,
          1.2,
          undefined,
          c.caster.x,
          c.caster.y + 1,
          c.caster.z,
        );
    }
  }

  /** Onomatopeia de quadrinho no impacto, uma por elemento. */
  private sfx(root: string, at: Vector3): void {
    const words: Record<string, string[]> = {
      pir: ['FUSH!', 'FWOOM!'],
      vent: ['VUUSH!', 'FSSH!'],
      gel: ['KRISH!', 'TSING!'],
      lav: ['CHOF!', 'SPLASH!'],
      ter: ['KRAK!', 'BUM!'],
      kor: ['VUMP!', 'ZMM!'],
    };
    const list = words[root] ?? ['PÁ!'];
    this.hooks.popup(
      list[Math.floor(Math.random() * list.length)] ?? 'PÁ!',
      at.clone().setY(at.y + 1.2),
      `sfx sfx-${root}`,
      true,
    );
  }

  private reaction(r: Reaction, t: Target): void {
    const at = t.pos.clone().setY(t.pos.y + 1.2);
    this.hooks.popup(r.toUpperCase(), at.clone().setY(at.y + 1.4), REACTION_KIND[r], true);
    if (r === 'vapor') {
      this.zones.add('vapor', t.pos.x, t.pos.z, 2.2);
      for (let i = 0; i < 26; i++)
        this.fx.steam(at.x + rnd() * 0.6, at.y + rnd() * 0.5, at.z + rnd() * 0.6, 1.4);
      this.fx.flash(at.x, at.y, at.z, new Color(0xffffff), 3);
    } else if (r === 'congelou') {
      this.burstRoot('gel', at, 34, 4, 1);
      this.fx.flash(at.x, at.y, at.z, new Color(0x9fe2ff), 3);
    } else if (r === 'estilhaçou') {
      this.burstRoot('gel', at, 70, 10, 1.3);
      this.fx.impact('gel', at.x, at.y, at.z, 1.4);
    } else if (r === 'derreteu' || r === 'apagou')
      for (let i = 0; i < 14; i++) this.fx.steam(at.x + rnd() * 0.4, at.y, at.z + rnd() * 0.4);
    else if (r === 'espalhou')
      for (const o of this.targets) {
        if (o === t || !o.alive || o.pos.distanceTo(t.pos) > 3.8) continue;
        o.status.burning = Math.max(o.status.burning, this.data.combat.burnSeconds);
        this.hooks.popup('ESPALHOU', o.pos.clone().setY(o.pos.y + 2.6), 'burn', true);
        const line = o.pos.clone().sub(t.pos);
        for (let i = 0; i < 14; i++) {
          const q = t.pos.clone().addScaledVector(line, i / 14);
          this.fx.emit('pir', q.x, 1, q.z, 0, 1.5, 0, 0.9, 0.7);
        }
      }
  }

  private area(
    c: Cfg,
    x: number,
    y: number,
    z: number,
    r: number,
    k: number,
    mode: Mode,
    dir?: Vector3,
    once?: Set<Target>,
  ): void {
    const center = new Vector3(x, y, z);
    for (const t of this.targets) {
      if (!t.alive || once?.has(t)) continue;
      const dy = Math.max(0, Math.abs(t.pos.y + 1 - y) - 1.2);
      if (Math.hypot(t.pos.x - x, t.pos.z - z, dy) > r + t.radius) continue;
      once?.add(t);
      this.strike(c, t, k, center, mode, dir);
    }
  }

  /** O que a magia deixa no chão onde ela cai. */
  private ground(c: Cfg, x: number, z: number, r: number, lingering: boolean): void {
    const i = c.imp;
    if (i.burn > 0.3) this.zones.react('burn', x, z, r);
    if (i.chill > 0.3) this.zones.react('chill', x, z, r);
    if (i.wet > 0.3) this.zones.react('wet', x, z, r);
    if (!lingering) return;
    if (i.wet > 0.4 && i.chill > 0.4) this.zones.add('gelo', x, z, r);
    else if (i.wet > 0.4) this.zones.add('poca', x, z, r);
    else if (i.burn > 0.6) this.zones.add('fogo', x, z, r * 0.8);
    else if (i.chill > 0.7) this.zones.add('gelo', x, z, r * 0.7);
  }

  // ---------- lançar ----------

  /** `self`: foi a própria bruxa (rouba mana, sente o coice). Devolve false se estourou na mão. */
  cast(
    plan: SpellPlan,
    power: number,
    origin: Vector3,
    aim: Vector3,
    center: Vector3,
    self = true,
  ): boolean {
    const m = materialize(plan.body.essence);
    const dir = aim.clone().normalize();
    const imp = scaleImpact(impactOf(plan, this.data), power * plan.power);
    const styles = stylesOf(plan, this.data);
    const lead = plan.body.roots[0] ?? 'kor';
    const base = (o: Partial<Cfg>): Cfg => ({
      m,
      styles,
      lead,
      imp,
      scale: 1,
      dur: 1,
      speed: 1,
      sky: false,
      jitter: 0,
      sub: null,
      caster: center.clone(),
      self,
      ...o,
    });

    if (plan.state === 'instavel') {
      const c = base({ scale: 1.2, jitter: 1 });
      this.burstCfg(c, origin, 50, 9);
      this.smoke(origin, 40);
      this.fx.impact(lead, origin.x, origin.y, origin.z, 1.2);
      this.area(c, origin.x, origin.y, origin.z, 2.5, 0.6, 'out');
      return false;
    }
    if (!plan.body.shape) return true;

    const turbulent = plan.state === 'turbulento';
    const dur = (plan.state === 'harmonico' ? 1.15 : turbulent ? 0.75 : 1) * power;
    const inf = plan.infusion;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.fx.spark(origin.x, origin.y, origin.z, Math.cos(a) * 3, 1.5 + rnd(), Math.sin(a) * 3);
    }
    this.style.slash(lead, origin, dir, Math.min(1.6, plan.scale));
    this.style.groundStrokes(center, dir);
    for (let e = 0; e < plan.echoes; e++) {
      const scale = plan.scale * power * plan.power * ([1, 0.7, 0.5][e] ?? 0.4);
      const echoImp = scaleImpact(imp, [1, 0.6, 0.4][e] ?? 0.3);
      const sub: Sub = inf
        ? (at) => {
            const subPlan: SpellPlan = { ...plan, body: inf, infusion: null };
            const c2 = base({
              m: materialize(inf.essence),
              styles: stylesOf(subPlan, this.data),
              lead: inf.roots[0] ?? lead,
              imp: scaleImpact(impactOf(subPlan, this.data), 0.5 * power),
              scale: scale * 0.55,
              dur: dur * 0.7,
            });
            if (!inf.shape) {
              this.burstCfg(c2, at, 26, 5, 1.6);
              this.fx.impact(c2.lead, at.x, at.y, at.z, 0.8);
              this.area(c2, at.x, at.y, at.z, 1.6, 1, 'out');
              return;
            }
            const d = new Vector3(rnd(), 0.25, rnd()).normalize();
            const o = at.clone().setY(at.y + 0.3);
            this.spawn(inf.shape, c2, o, d, o);
          }
        : null;
      const c = base({
        imp: echoImp,
        scale,
        dur,
        speed: plan.speed,
        sky: plan.fromAbove,
        jitter: turbulent ? 1 : 0,
        sub,
      });
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
    const atSelf = center === origin;
    const ahead = (d: number): Vector3 =>
      atSelf ? center.clone().setY(0) : new Vector3(center.x + dir.x * d, 0, center.z + dir.z * d);
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
        this.active.push(this.vortex(c, ahead(4.5), dir));
        break;
      case 'wave':
        this.active.push(this.wave(c, center.clone().setY(0)));
        break;
      case 'pillar':
        this.active.push(this.pillar(c, ahead(5)));
        break;
      case 'jet':
        this.active.push(this.jet(c, origin, dir));
        break;
      case 'rain':
        this.active.push(this.rain(c, ahead(7)));
        break;
    }
  }

  /** -or: rápido, acerta UM alvo em cheio; o resto em volta só respinga. Matéria puxa o alvo pra quem lançou. */
  private projectile(c: Cfg, pos: Vector3, dir: Vector3): Active {
    const vel = dir.clone().multiplyScalar(c.m.speed * c.speed * (c.sky ? 1.6 : 1) * 1.2);
    // o que é pesado sai mais pra cima (arco), pra não cair no pé de quem lançou
    if (!c.sky) vel.y += c.m.arc * 0.35;
    const side = new Vector3().crossVectors(dir, UP).normalize();
    // gelo e pedra têm corpo (lança, pedregulho); o resto é orbe com borda acesa
    const solidHead = c.lead === 'gel' || c.lead === 'ter' || c.lead === 'vent';
    const h = this.track(
      (solidHead ? head(this.scene, c.lead, Math.max(0.5, c.scale)) : null) ?? stubFx(),
    );
    const orb = solidHead ? null : this.style.orb(c.lead, Math.max(0.6, c.scale));
    const trail = this.style.trail(c.lead, Math.max(0.6, c.scale));
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
      let victim: Target | null = null;
      for (const tg of this.targets)
        if (
          tg.alive &&
          Math.hypot(tg.pos.x - pos.x, tg.pos.z - pos.z) < tg.radius + 0.3 * c.scale &&
          pos.y < tg.pos.y + 2.1 &&
          pos.y > tg.pos.y - 0.2
        )
          victim = tg;
      if (victim) hit = true;
      pos.addScaledVector(vel, dt);
      dist += step;
      h.object.position.copy(pos);
      h.object.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), v.copy(vel).normalize());
      orb?.at(pos);
      trail.at(pos, vel);
      this.fx.core(c.lead, pos.x, pos.y, pos.z, Math.max(0.6, c.scale));
      const s = c.m.spiral * 0.4 * c.scale;
      for (acc += dt * 130; acc >= 1; acc--)
        this.body(
          c,
          pos.x + side.x * Math.cos(t * 16) * s + rnd() * 0.08,
          pos.y + Math.sin(t * 16) * s + rnd() * 0.08,
          pos.z + side.z * Math.cos(t * 16) * s + rnd() * 0.08,
          -vel.x * 0.06 + rnd() * 0.6,
          -vel.y * 0.06 + rnd() * 0.6,
          -vel.z * 0.06 + rnd() * 0.6,
          1,
          0.8,
          pos.x,
          pos.y,
          pos.z,
        );
      if (!hit) return true;
      this.drop(h);
      orb?.end();
      trail.end();
      pos.y = Math.max(pos.y, 0.15);
      this.style.shock(c.lead, pos, Math.max(0.7, c.scale));
      this.sfx(c.lead, pos);
      this.burstCfg(c, pos, Math.round(40 * c.scale * c.m.burst), 5 + 3 * c.scale, 1.1);
      this.fx.impact(c.lead, pos.x, pos.y, pos.z, c.scale);
      const hitSet = new Set<Target>();
      if (victim) {
        hitSet.add(victim);
        this.strike(c, victim, 1, pos, 'dir', dir);
      }
      this.area(c, pos.x, pos.y, pos.z, 1 + c.scale * 0.6, 0.35, 'out', undefined, hitSet);
      this.ground(c, pos.x, pos.z, 1.1 * c.scale, true);
      c.sub?.(pos);
      return false;
    };
  }

  /** -us: funil que fica, puxa pra dentro e (com vento) levanta. Tique a cada 0,35 s. */
  private vortex(c: Cfg, p: Vector3, dir: Vector3): Active {
    const mo: Motion = {
      swirl: Math.max(c.m.swirl, 5.5),
      pull: c.m.pull + 0.8,
      gravity: Math.min(c.m.gravity, 3) - 2.5,
      drag: Math.min(c.m.drag, 0.9),
    };
    const H = 3.4 * c.scale;
    const R = 1.7 * c.scale;
    const drift = 1.2 + Math.max(0, c.m.speed - 10) * 0.12;
    const center = new Vector3(p.x, c.sky ? 9 : 0.05, p.z);
    this.style.helix(c.lead, center, H, R, 4.2 * c.dur, c.sky);
    let t = 0;
    let acc = 0;
    let tick = 0.2;
    let groundAt = 0;
    const life = 4.2 * c.dur;
    return (dt) => {
      t += dt;
      p.addScaledVector(dir, drift * dt);
      if (c.jitter) p.x += Math.sin(t * 5) * 2.5 * dt;
      center.set(p.x, c.sky ? 9 : 0.05, p.z);
      for (acc += dt * 160 * Math.min(2, c.scale); acc >= 1; acc--) {
        const hh = Math.random() ** 1.4 * H;
        const r = (0.3 + hh * 0.4) * (0.8 + Math.random() * 0.3);
        const a = Math.random() * Math.PI * 2;
        const y = c.sky ? 9 - hh : 0.1 + hh;
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
          mo,
        );
      }
      if ((tick += dt) > 0.35) {
        tick = 0;
        for (const tg of this.targets) {
          if (!tg.alive || Math.hypot(tg.pos.x - p.x, tg.pos.z - p.z) > R + tg.radius) continue;
          this.strike(c, tg, 0.3, p, 'in');
          const to = new Vector3(p.x - tg.pos.x, 0, p.z - tg.pos.z);
          const tangent = new Vector3(-to.z, 0, to.x).normalize();
          tg.impulse(to.x * 1.5 + tangent.x * 2, c.imp.push * 2.5, to.z * 1.5 + tangent.z * 2);
        }
      }
      if ((groundAt -= dt) <= 0) {
        groundAt = 0.8;
        this.ground(c, p.x, p.z, R * 0.7, false);
        c.sub?.(p.clone().setY(1));
      }
      return t < life;
    };
  }

  /** -a: anel que sai da bruxa e empurra tudo pra longe (cada alvo uma vez). */
  private wave(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    const max = 8 * Math.sqrt(c.scale);
    const hit = new Set<Target>();
    const cw: Cfg = { ...c, imp: { ...c.imp, push: Math.max(c.imp.push, 0.5) } };
    this.style.wave(c.lead, p.clone(), max, 0.9, c.sky ? 6 : 0.1);
    this.style.shock(c.lead, p.clone().setY(1), Math.max(0.7, c.scale));
    return (dt) => {
      t += dt / 0.9;
      const r = 0.6 + t * max;
      for (acc += dt * 300 * Math.min(2, c.scale); acc >= 1; acc--) {
        const a = Math.random() * Math.PI * 2;
        this.body(
          c,
          p.x + Math.cos(a) * r,
          c.sky ? 6 : 0.25,
          p.z + Math.sin(a) * r,
          Math.cos(a) * 4,
          c.sky ? -7 : 2 + Math.random() * 2,
          Math.sin(a) * 4,
          1,
          0.7,
          p.x,
          0,
          p.z,
        );
      }
      for (const tg of this.targets) {
        if (!tg.alive || hit.has(tg)) continue;
        if (Math.abs(Math.hypot(tg.pos.x - p.x, tg.pos.z - p.z) - r) < 0.9) {
          hit.add(tg);
          this.strike(cw, tg, 0.8, p, 'out');
        }
      }
      if (t < 1) return true;
      this.ground(c, p.x, p.z, max * 0.55, true);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        c.sub?.(new Vector3(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r));
      }
      return false;
    };
  }

  /**
   * -um: brota do chão e lança quem estiver em cima. Essência sólida (pedra, gelo) vira objeto
   * de verdade: bloqueia e dá pra subir. Senão é uma coluna de energia que fere quem encosta.
   */
  private pillar(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    let tick = 0;
    const r = 0.7 * c.scale;
    const solid = c.imp.solid > 0.4 || (c.imp.chill > 0.5 && c.imp.burn < 0.2);
    const H = 3 * Math.sqrt(c.scale) + 1;
    for (const tg of this.targets) {
      if (!tg.alive || Math.hypot(tg.pos.x - p.x, tg.pos.z - p.z) > r + 0.6) continue;
      this.strike(c, tg, 0.8, p, 'out');
      tg.impulse(0, 9 + 3 * c.scale, 0);
    }
    this.fx.impact(c.lead, p.x, 0.2, p.z, c.scale);
    const col = solid ? null : this.track(column(this.scene, c.lead, H, r));
    if (col) col.object.position.set(p.x, c.sky ? 11 - H : 0, p.z);
    if (solid) this.raisePillar(c, p, r);
    const life = solid ? 0.5 : 1.4 * c.dur;
    this.style.shock(c.lead, p.clone().setY(0.8), Math.max(0.7, c.scale));
    if (!solid)
      this.style.helix(c.lead, p.clone().setY(c.sky ? 11 : 0.05), H, r * 1.4, life, c.sky);
    // água em pilar vira prisão: bolha em volta de quem estava perto, que fica preso e encharcado
    if (!solid && c.imp.wet > 0.6 && c.imp.burn < 0.3)
      for (const tg of this.targets) {
        if (!tg.alive || Math.hypot(tg.pos.x - p.x, tg.pos.z - p.z) > r + 1.8) continue;
        const hold = 2.6 * c.dur;
        tg.status.stunned = Math.max(tg.status.stunned, hold);
        tg.status.wet = Math.max(tg.status.wet, hold + 3);
        tg.status.burning = 0;
        this.hooks.popup('PRESO', tg.pos.clone().setY(tg.pos.y + 2.8), 'wet', true);
        this.style.bubble(tg.pos, 1, hold, () => {
          for (let i = 0; i < 40; i++)
            this.fx.emit(
              'lav',
              tg.pos.x,
              tg.pos.y + 1.1,
              tg.pos.z,
              rnd() * 4,
              Math.random() * 4,
              rnd() * 4,
              1.2,
            );
          this.sfx('lav', tg.pos.clone().setY(tg.pos.y + 0.6));
        });
      }
    return (dt) => {
      t += dt;
      if (col) {
        col.object.scale.y = Math.min(1, t * 6);
        col.setOpacity(Math.min(1, (life - t) * 3) * 0.8);
      }
      const n = solid ? 50 : 140;
      for (acc += dt * n * Math.min(2, c.scale); acc >= 1; acc--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        const up = (9 + Math.random() * 7) * Math.sqrt(c.scale);
        this.body(
          c,
          p.x + Math.cos(a) * d,
          c.sky ? 11 : 0.15,
          p.z + Math.sin(a) * d,
          rnd() * 0.7,
          c.sky ? -up : up * (solid ? 0.5 : 1),
          rnd() * 0.7,
          1,
          solid ? 0.5 : 1,
          p.x,
          3,
          p.z,
        );
      }
      if ((tick += dt) > 0.4) {
        tick = 0;
        this.area(c, p.x, 1, p.z, r + 0.4, 0.25, 'out');
      }
      if (t < life) return true;
      this.drop(col);
      this.ground(c, p.x, p.z, r * 1.6, true);
      c.sub?.(new Vector3(p.x, H, p.z));
      return false;
    };
  }

  private raisePillar(c: Cfg, p: Vector3, r: number): void {
    const height = 2.2 + 1.2 * c.scale;
    const ice = c.imp.chill > c.imp.solid;
    let object: Group | Mesh;
    if (ice) object = iceCluster(r, height);
    else {
      // coluna de pedra irregular (vértices sacudidos)
      const geo = new CylinderGeometry(r * 0.8, r, height, 7, 4)
        .translate(0, height / 2, 0)
        .toNonIndexed();
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > 0.05 && y < height - 0.05)
          pos.setXYZ(
            i,
            pos.getX(i) * (0.9 + Math.random() * 0.2),
            y,
            pos.getZ(i) * (0.9 + Math.random() * 0.2),
          );
      }
      geo.computeVertexNormals();
      object = new Mesh(
        geo,
        new MeshToonMaterial({ color: c.m.colors[0] ?? 0x8a7a6a, gradientMap: toonRamp() }),
      );
      object.castShadow = object.receiveShadow = true;
    }
    object.position.set(p.x, -height, p.z);
    this.scene.add(object);
    for (let i = 0; i < 30; i++)
      this.fx.emit(
        ice ? 'gel' : 'ter',
        p.x + rnd() * r,
        0.2,
        p.z + rnd() * r,
        rnd() * 3,
        3 + Math.random() * 4,
        rnd() * 3,
        1,
      );
    const collider = box(p.x, p.z, r * 1.6, r * 1.6, 0, height);
    collider.maxY = -1; // só fica sólido quando terminar de subir
    this.colliders.push(collider);
    this.pillars.push({ object, collider, life: 7 * c.dur + 0.5, height });
  }

  private updatePillars(dt: number): void {
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pl = this.pillars[i];
      if (!pl) continue;
      pl.life -= dt;
      const y = pl.object.position.y;
      if (pl.life > 0.5) {
        pl.object.position.y = Math.min(0, y + dt * pl.height * 7);
        if (pl.object.position.y >= 0) pl.collider.maxY = pl.height;
      } else {
        pl.collider.maxY = -1;
        pl.object.position.y = y - dt * pl.height * 2;
      }
      if (pl.life <= 0) {
        this.scene.remove(pl.object);
        pl.object.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        this.colliders.splice(this.colliders.indexOf(pl.collider), 1);
        this.pillars.splice(i, 1);
      }
    }
  }

  /** -ar: jato contínuo; vento dá coice em quem lança (impulso pra trás). */
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
    this.style.beam(c.lead, from, end, 0.55 * Math.sqrt(c.scale) + 0.2, 1.5 * c.dur);
    if (c.self && c.imp.push > 0.3 && !c.sky)
      this.hooks.recoil(
        dir
          .clone()
          .multiplyScalar(-c.imp.push * 11)
          .setY(2 + c.imp.lift * 3),
      );
    const life = 1.5 * c.dur;
    return (dt) => {
      t += dt;
      for (acc += dt * 180; acc >= 1; acc--) {
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
      if ((tick += dt) > 0.15) {
        tick = 0;
        for (const tg of this.targets) {
          if (!tg.alive) continue;
          const ap = tg.pos
            .clone()
            .setY(tg.pos.y + 1)
            .sub(from);
          const seg = end.clone().sub(from);
          const k = Math.max(0, Math.min(1, ap.dot(seg) / seg.lengthSq()));
          const closest = from.clone().addScaledVector(seg, k);
          if (
            closest.distanceTo(tg.pos.clone().setY(tg.pos.y + 1)) <
            0.9 * Math.sqrt(c.scale) + tg.radius
          )
            this.strike(c, tg, 0.18, from, 'dir', d);
        }
      }
      if (t < life) return true;
      this.ground(c, end.x, end.z, 1.2 * c.scale, true);
      c.sub?.(end);
      return false;
    };
  }

  /** -ia: nuvem escura e chuva sobre uma área, com atraso; deixa poça, gelo ou fogo no chão. */
  private rain(c: Cfg, p: Vector3): Active {
    let t = 0;
    let acc = 0;
    let cloud = 0;
    let tick = -0.4;
    let subs = 0;
    const r = 3.2 * Math.sqrt(c.scale) * (c.sky ? 1.5 : 1);
    let marked = false;
    return (dt) => {
      t += dt;
      for (cloud += dt * 40; cloud >= 1; cloud--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        this.fx.smoke(
          p.x + Math.cos(a) * d,
          9.5 + rnd() * 0.4,
          p.z + Math.sin(a) * d,
          rnd() * 0.3,
          0,
          rnd() * 0.3,
          2.2,
        );
      }
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
      if ((tick += dt) > 0.4) {
        tick = 0;
        if (!marked) {
          marked = true;
          this.ground(c, p.x, p.z, r, true);
        }
        this.area(c, p.x, 1, p.z, r, 0.22, 'out');
        if (subs++ < 4 && t > 0.6) {
          const a = Math.random() * Math.PI * 2;
          c.sub?.(new Vector3(p.x + Math.cos(a) * r * 0.6, 0.1, p.z + Math.sin(a) * r * 0.6));
        }
      }
      return t < 3.2 * c.dur;
    };
  }
}

function stubFx(): FormFx {
  const o = new Group();
  return {
    object: o,
    update: () => undefined,
    setOpacity: () => undefined,
    dispose: () => undefined,
  };
}

/** Cor do número na tela pelo elemento dominante. */
function kindOf(i: Impact): string {
  const pairs: [string, number][] = [
    ['burn', i.burn],
    ['chill', i.chill],
    ['wet', i.wet],
    ['push', i.push],
    ['pull', i.pull],
    ['solid', i.solid],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0]?.[1] ? (pairs[0]?.[0] ?? 'solid') : 'solid';
}
