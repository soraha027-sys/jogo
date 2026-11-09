import {
  AnimationMixer,
  AnimationUtils,
  Color,
  LoopOnce,
  LoopRepeat,
  Quaternion,
  Vector3,
} from 'three';
import type { AnimationAction, AnimationClip, Mesh, Object3D } from 'three';
import { ANIMS, buildClips, ONCE, UPPER, UPPER_BONES, type AnimName } from './clips';
import { BONE_PREFIX, buildWitchRig } from './rig';
import { Springs } from './springs';

/** O que a máquina de animação precisa: o placeholder e um GLB entregam a mesma coisa. */
interface WitchModel {
  root: Object3D;
  clips: Map<AnimName, AnimationClip>;
  hand: Object3D;
  head: Object3D | null;
  chest: Object3D | null;
  feet: Object3D[];
  broom: Object3D | null;
  springs: Springs | null;
  setFace(blink: boolean, mouthOpen: number): void;
  setSoot(k: number): void;
}

export interface Motion {
  grounded: boolean;
  flying: boolean;
  speed: number;
  jumpCount: number;
  lastJumpDouble: boolean;
  landCount: number;
}

/** Ganchos de "juice": o Game liga em poeira, câmera e vibração. */
export interface WitchFx {
  step(pos: Vector3, running: boolean): void;
  jump(pos: Vector3, double: boolean): void;
  land(pos: Vector3): void;
}

const GLB = `${import.meta.env.BASE_URL}assets/characters/witch.glb`;

function placeholder(): WitchModel {
  const rig = buildWitchRig();
  const clips = new Map<AnimName, AnimationClip>();
  for (const c of buildClips()) clips.set(c.name as AnimName, c);
  const clean = new Color(0xffffff);
  const soot = new Color(0x4a4450);
  const feet = [rig.bones.LeftFoot, rig.bones.RightFoot].filter((b) => !!b);
  return {
    root: rig.root,
    clips,
    hand: rig.bones.RightHand ?? rig.root,
    head: rig.bones.Head ?? null,
    chest: rig.bones.Spine2 ?? null,
    feet,
    broom: rig.broom,
    springs: new Springs(rig.springs),
    setFace: rig.setFace,
    setSoot: (k) => rig.material.color.copy(clean).lerp(soot, k),
  };
}

/** Carrega assets/characters/witch.glb (rig Mixamo) se existir; clipes casam pelo nome. */
async function loadGlb(): Promise<WitchModel | null> {
  try {
    const probe = await fetch(GLB, { method: 'HEAD' });
    if (!probe.ok || (probe.headers.get('content-type') ?? '').includes('text/html')) return null;
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(GLB);
    const root = gltf.scene;
    const clips = new Map<AnimName, AnimationClip>();
    const byLength = [...ANIMS].sort((a, b) => b.length - a.length);
    for (const c of gltf.animations) {
      const name = byLength.find((n) => c.name.toLowerCase().includes(n.toLowerCase()));
      if (name && !clips.has(name)) clips.set(name, c);
    }
    let face: Mesh | null = null;
    let mouthIndex = -1;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
      const dict = mesh.morphTargetDictionary;
      if (!dict || face) return;
      const key = Object.keys(dict).find((k) => /mouth|jaw|boca|^a+$/i.test(k));
      if (key) {
        face = mesh;
        mouthIndex = dict[key] ?? -1;
      }
    });
    const target = face as Mesh | null;
    const find = (n: string): Object3D | null => root.getObjectByName(BONE_PREFIX + n) ?? null;
    return {
      root,
      clips,
      hand: find('RightHand') ?? root,
      head: find('Head'),
      chest: find('Spine2'),
      feet: [find('LeftFoot'), find('RightFoot')].filter((o) => !!o),
      broom: root.getObjectByName('Broom') ?? null,
      springs: null,
      setFace: (_blink, open) => {
        if (target?.morphTargetInfluences && mouthIndex >= 0)
          target.morphTargetInfluences[mouthIndex] = open / 2;
      },
      setSoot: () => undefined,
    };
  } catch {
    return null;
  }
}

/** Camadas de base que se misturam por peso (as de ação entram por cima). */
type Base = 'idle' | 'walk' | 'run' | 'fall' | 'fly' | 'sit';
const BASES: readonly Base[] = ['idle', 'walk', 'run', 'fall', 'fly', 'sit'];
/** Metros percorridos por ciclo completo (2 passos): casa a passada com a velocidade, sem pé deslizando. */
const STRIDE_WALK = 1.5;
const STRIDE_RUN = 3.3;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const tmp = new Vector3();

/**
 * A bruxa: modelo + árvore de animação própria.
 * - base: idle / andar+correr misturados pela velocidade (mesma fase, passada casada) / queda / voo / sentada
 * - ações de corpo inteiro por cima (pulo, pouso, feitiço parada, emotes)
 * - camada aditiva só no tronco pra lançar/acenar andando ou voando
 * - por cima de tudo: olhar pra mira, molas, amassa-e-estica, piscar, boca, poeira
 * Todo quadro os ossos voltam pra pose de descanso antes do mixer: nada se acumula.
 */
export class Witch {
  readonly root: Object3D;
  /** Pra onde ela olha em relação ao corpo, em radianos (a câmera/mira). */
  lookYaw = 0;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly weights = new Map<string, number>();
  private readonly rest: [Object3D, Quaternion, Vector3][] = [];
  /** Ação de corpo inteiro tocando agora (null = só a base). */
  private shot: AnimName | null = null;
  private shotLeft = 0;
  private shotKind: 'emote' | 'action' | 'air' = 'action';
  private shotFade = 0.08;
  private jumps = 0;
  private lands = 0;
  private mounted = false;
  private sitting = false;
  private grumpyIn = 7;
  private blinkIn = 2;
  private soot = 0;
  private mouth = 0;
  private look = 0;
  private phase = 0;
  private stepIndex = 0;
  private moving = false;
  private squash = 1;
  private squashVel = 0;

  private constructor(
    private readonly model: WitchModel,
    private readonly fx: WitchFx,
  ) {
    this.root = model.root;
    model.root.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone)
        this.rest.push([o, o.quaternion.clone(), o.position.clone()]);
    });
    this.mixer = new AnimationMixer(model.root);
    for (const [name, clip] of model.clips) {
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(name)) {
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
      } else a.setLoop(LoopRepeat, Infinity);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(name, a);
      this.weights.set(name, 0);
      // versão só-tronco aditiva (relativa ao 1º quadro) pra usar em movimento
      if (UPPER.has(name)) {
        const upper = clip.clone();
        upper.name = `${name}Upper`;
        upper.tracks = upper.tracks.filter((t) => UPPER_BONES.test(t.name));
        AnimationUtils.makeClipAdditive(upper, 0);
        const u = this.mixer.clipAction(upper);
        u.setLoop(LoopOnce, 1);
        u.clampWhenFinished = false;
        this.actions.set(upper.name, u);
      }
    }
    // walk e run têm o tempo controlado à mão (fase compartilhada)
    for (const n of ['walk', 'run']) this.actions.get(n)?.setEffectiveTimeScale(0);
    this.weights.set('idle', 1);
  }

  static async load(fx: WitchFx): Promise<Witch> {
    return new Witch((await loadGlb()) ?? placeholder(), fx);
  }

  private startShot(name: AnimName, kind: 'emote' | 'action' | 'air', fade = 0.08): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.reset().play();
    this.shot = name;
    this.shotKind = kind;
    this.shotFade = fade;
    this.shotLeft = a.getClip().duration - fade;
  }

  /** Ação de feitiço/emote: corpo inteiro parada, só o tronco em movimento. */
  trigger(name: 'cast' | 'fail' | 'shrug' | 'wave'): void {
    this.sitting = false;
    const upper = this.actions.get(`${name}Upper`);
    if (upper && this.moving) {
      upper.reset().setEffectiveWeight(1).play();
      return;
    }
    this.startShot(name, name === 'wave' || name === 'shrug' ? 'emote' : 'action', 0.1);
  }

  /** Alinha os contadores de pulo/pouso sem disparar animação (jogador remoto entrando). */
  sync(jumpCount: number, landCount: number): void {
    this.jumps = jumpCount;
    this.lands = landCount;
  }

  toggleSit(): void {
    this.sitting = !this.sitting;
    if (this.shotKind === 'emote') this.shotLeft = 0;
  }

  /** Fuligem do feitiço que explodiu, por alguns segundos. */
  setSoot(seconds: number): void {
    this.soot = seconds;
  }

  /** Empurrão visual (recuo de feitiço, susto). >0 estica, <0 amassa. */
  punch(amount: number): void {
    this.squashVel += amount;
  }

  handPosition(out: Vector3): Vector3 {
    return this.model.hand.getWorldPosition(out);
  }

  private base(s: Motion): Record<Base, number> {
    const w: Record<Base, number> = { idle: 0, walk: 0, run: 0, fall: 0, fly: 0, sit: 0 };
    if (s.flying) w.fly = 1;
    else if (!s.grounded) w.fall = 1;
    else if (s.speed > 0.25) {
      const r = smoothstep(3.0, 6.4, s.speed);
      w.walk = 1 - r;
      w.run = r;
    } else if (this.sitting) w.sit = 1;
    else w.idle = 1;
    return w;
  }

  update(dt: number, s: Motion, mouthOpen: number): void {
    this.moving = s.speed > 0.6 || !s.grounded || s.flying;

    // --- eventos do corpo ---
    if (s.jumpCount !== this.jumps) {
      this.jumps = s.jumpCount;
      this.startShot(s.lastJumpDouble ? 'doubleJump' : 'jump', 'air', 0.05);
      this.squashVel += 3.2;
      this.fx.jump(this.root.getWorldPosition(tmp), s.lastJumpDouble);
    }
    if (s.landCount !== this.lands) {
      this.lands = s.landCount;
      // pousando parada: agacha; correndo: só amassa e segue (não trava a corrida)
      const acting = this.shot !== null && this.shotKind === 'action';
      if (!s.flying && s.speed < 1.5 && !acting) this.startShot('land', 'air', 0.04);
      else if (this.shot && this.shotKind === 'air') this.shotLeft = 0;
      this.squashVel -= s.speed < 1.5 ? 4.2 : 2.6;
      this.fx.land(this.root.getWorldPosition(tmp));
    }
    if (s.flying && !this.mounted) {
      this.mounted = true;
      this.startShot('mount', 'action', 0.1);
    } else if (!s.flying) this.mounted = false;
    if (s.speed > 0.5 || !s.grounded || s.flying) this.sitting = false;
    if (this.model.broom) this.model.broom.visible = s.flying;

    this.shotLeft -= dt;
    if (this.shot && this.shotKind === 'emote' && (s.speed > 0.5 || !s.grounded)) this.shotLeft = 0;
    if (this.shot && this.shotKind === 'air' && s.grounded && this.shot !== 'land')
      this.shotLeft = 0;
    if (this.shot && this.shotLeft <= 0) this.shot = null;

    // emburrada de vez em quando, parada
    const idle = !this.shot && s.grounded && !s.flying && s.speed <= 0.25 && !this.sitting;
    if (idle && (this.grumpyIn -= dt) <= 0) {
      this.grumpyIn = 9 + Math.random() * 7;
      this.startShot('idleGrumpy', 'emote', 0.25);
    } else if (!idle) this.grumpyIn = Math.max(this.grumpyIn, 5);

    // --- fase da locomoção: avança pela distância percorrida ---
    const r = smoothstep(3.0, 6.4, s.speed);
    const stride = STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * r;
    if (s.grounded && !s.flying && s.speed > 0.25) {
      this.phase = (this.phase + (Math.max(s.speed, 0.9) / stride) * dt) % 1;
      // pisada quando cada pé chega no chão (fases 0,25 e 0,75)
      const step = Math.floor((this.phase + 0.25) * 2) % 2;
      if (step !== this.stepIndex) {
        this.stepIndex = step;
        const foot = this.model.feet[step];
        if (foot) this.fx.step(foot.getWorldPosition(tmp), r > 0.5);
      }
    }
    for (const n of ['walk', 'run'] as const) {
      const a = this.actions.get(n);
      if (a) a.time = this.phase * a.getClip().duration;
    }

    // --- pesos: base pelo estado, ação por cima com fade próprio ---
    const target = this.base(s);
    const shotOn = this.shot !== null;
    const k = Math.min(1, dt / (shotOn ? this.shotFade : 0.14));
    for (const [name, a] of this.actions) {
      if (name.endsWith('Upper')) continue;
      let want = 0;
      if (shotOn) want = name === this.shot ? 1 : 0;
      else if ((BASES as readonly string[]).includes(name)) want = target[name as Base];
      const w = (this.weights.get(name) ?? 0) + (want - (this.weights.get(name) ?? 0)) * k;
      this.weights.set(name, w);
      a.setEffectiveWeight(w < 0.002 ? 0 : w);
      // emote que terminou de sair: rebobina pra próxima vez
      if (!shotOn && ONCE.has(name as AnimName) && w < 0.002 && a.isScheduled()) a.stop();
    }

    // --- pose: descanso → mixer → camadas ---
    for (const [o, q, p] of this.rest) {
      o.quaternion.copy(q);
      o.position.copy(p);
    }
    this.mixer.update(dt);

    // olha pra onde a câmera aponta: cabeça leva a maior parte, o peito acompanha
    const want =
      s.flying || (this.shot && this.shotKind === 'action')
        ? 0
        : Math.max(-1.1, Math.min(1.1, this.lookYaw));
    this.look += (want - this.look) * Math.min(1, dt * 7);
    this.model.chest?.rotateY(this.look * 0.25);
    this.model.head?.rotateY(this.look * 0.55);

    // amassa-e-estica com mola (pulo estica, pouso amassa)
    this.squashVel += (1 - this.squash) * 190 * dt;
    this.squashVel *= Math.exp(-13 * dt);
    this.squash = Math.max(0.72, Math.min(1.28, this.squash + this.squashVel * dt));
    const wide = 1 / Math.sqrt(this.squash);
    this.root.scale.set(wide, this.squash, wide);

    this.root.updateMatrixWorld(true);
    this.model.springs?.update(dt);

    // rosto: piscar e boca (0 fechada, 1 meia, 2 aberta)
    this.mouth += (mouthOpen - this.mouth) * Math.min(1, dt * 28);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) this.blinkIn = 2 + Math.random() * 3.5;
    this.model.setFace(this.blinkIn < 0.11, this.mouth < 0.2 ? 0 : this.mouth < 0.6 ? 1 : 2);
    if (this.soot > 0) {
      this.soot -= dt;
      this.model.setSoot(Math.max(0, Math.min(1, this.soot)));
    }
  }
}
