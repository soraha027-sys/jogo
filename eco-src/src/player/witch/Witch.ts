import { AnimationMixer, Color, LoopOnce, Vector3 } from 'three';
import type { AnimationAction, AnimationClip, Mesh, Object3D } from 'three';
import { ANIMS, buildClips, ONCE, type AnimName } from './clips';
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

type Lock = 'none' | 'emote' | 'action' | 'air';
const tmp = new Vector3();

/**
 * A bruxa: modelo + máquina de animação + camadas de vida por cima
 * (olhar pra mira, molas, amassa-e-estica, piscar, boca, poeira nos passos).
 */
export class Witch {
  readonly root: Object3D;
  /** Pra onde ela olha em relação ao corpo, em radianos (a câmera/mira). */
  lookYaw = 0;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<AnimName, AnimationAction>();
  private current: AnimName | null = null;
  private lock = 0;
  private lockKind: Lock = 'none';
  private jumps = 0;
  private lands = 0;
  private mounted = false;
  private sitting = false;
  private grumpyIn = 7;
  private blinkIn = 2;
  private soot = 0;
  private mouth = 0;
  private look = 0;
  // amassa-e-estica: mola 1D em torno de 1
  private squash = 1;
  private squashVel = 0;
  private stepPhase = 0;

  private constructor(
    private readonly model: WitchModel,
    private readonly fx: WitchFx,
  ) {
    this.root = model.root;
    this.mixer = new AnimationMixer(model.root);
    for (const [name, clip] of model.clips) {
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(name)) {
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.play('idle', 0);
  }

  static async load(fx: WitchFx): Promise<Witch> {
    return new Witch((await loadGlb()) ?? placeholder(), fx);
  }

  private play(name: AnimName, fade: number, restart = false): AnimationAction | undefined {
    const next = this.actions.get(name);
    if (!next || (this.current === name && !restart)) return next;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = name;
    return next;
  }

  private shot(name: AnimName, kind: Lock, fade = 0.08): void {
    const a = this.play(name, fade, true);
    if (!a) return;
    this.lock = a.getClip().duration - 0.1;
    this.lockKind = kind;
  }

  /** Dispara uma animação de ação por cima da locomoção. */
  trigger(name: 'cast' | 'fail' | 'shrug' | 'wave'): void {
    this.sitting = false;
    this.shot(name, name === 'wave' || name === 'shrug' ? 'emote' : 'action');
  }

  toggleSit(): void {
    this.sitting = !this.sitting;
    this.lock = 0;
  }

  /** Fuligem do feitiço que explodiu, por alguns segundos. */
  setSoot(seconds: number): void {
    this.soot = seconds;
  }

  /** Empurrão visual (recuo de feitiço, susto). >1 estica, <1 amassa. */
  punch(amount: number): void {
    this.squashVel += amount;
  }

  handPosition(out: Vector3): Vector3 {
    return this.model.hand.getWorldPosition(out);
  }

  update(dt: number, s: Motion, mouthOpen: number): void {
    if (s.jumpCount !== this.jumps) {
      this.jumps = s.jumpCount;
      this.shot(s.lastJumpDouble ? 'doubleJump' : 'jump', 'air', 0.05);
      this.squashVel += 3.2;
      this.fx.jump(this.root.getWorldPosition(tmp), s.lastJumpDouble);
    }
    if (s.landCount !== this.lands) {
      this.lands = s.landCount;
      if (!s.flying && this.lockKind !== 'action') this.shot('land', 'air', 0.04);
      this.squashVel -= 4.2;
      this.fx.land(this.root.getWorldPosition(tmp));
    }
    const moving = s.speed > 0.5;
    if (moving || !s.grounded || s.flying) this.sitting = false;
    this.lock -= dt;
    if (this.lock > 0 && this.lockKind === 'emote' && (moving || !s.grounded)) this.lock = 0;
    if (this.model.broom) this.model.broom.visible = s.flying;

    if (this.lock <= 0) {
      if (s.flying && !this.mounted) {
        this.mounted = true;
        this.shot('mount', 'action');
      } else {
        if (!s.flying) this.mounted = false;
        const base: AnimName = s.flying
          ? 'fly'
          : !s.grounded
            ? 'fall'
            : s.speed > 5.2
              ? 'run'
              : moving
                ? 'walk'
                : this.sitting
                  ? 'sit'
                  : 'idle';
        const a = this.play(base, base === 'fall' ? 0.2 : base === 'idle' ? 0.22 : 0.14);
        if (base === 'walk') a?.setEffectiveTimeScale(Math.max(0.6, s.speed / 2.6));
        else if (base === 'run') a?.setEffectiveTimeScale(s.speed / 7.6);
        if (base === 'idle') {
          if ((this.grumpyIn -= dt) <= 0) {
            this.grumpyIn = 9 + Math.random() * 7;
            this.shot('idleGrumpy', 'emote', 0.15);
          }
        } else this.grumpyIn = 6;
        // poeira a cada pisada (duas por ciclo)
        if ((base === 'walk' || base === 'run') && a) {
          const phase = Math.floor((a.time / a.getClip().duration) * 2);
          if (phase !== this.stepPhase) {
            this.stepPhase = phase;
            const foot = this.model.feet[phase % 2];
            if (foot) this.fx.step(foot.getWorldPosition(tmp), base === 'run');
          }
        }
      }
    }
    this.mixer.update(dt);

    // --- camadas por cima da animação ---
    // olha pra onde a câmera aponta: cabeça leva a maior parte, o peito acompanha
    const want =
      s.flying || this.lockKind === 'action' ? 0 : Math.max(-1.1, Math.min(1.1, this.lookYaw));
    this.look += (want - this.look) * Math.min(1, dt * 7);
    this.model.chest?.rotateY(this.look * 0.25);
    this.model.head?.rotateY(this.look * 0.55);

    // amassa-e-estica com mola (pulo estica, pouso amassa)
    this.squashVel += (1 - this.squash) * 190 * dt;
    this.squashVel *= Math.exp(-13 * dt);
    this.squash = Math.max(0.7, Math.min(1.3, this.squash + this.squashVel * dt));
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
