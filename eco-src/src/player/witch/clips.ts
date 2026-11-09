import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import type { KeyframeTrack } from 'three';
import { BONE_PREFIX, HIPS_Y } from './rig';

/** Clipes que, com ela em movimento, tocam só no tronco por cima da locomoção. */
export const UPPER: ReadonlySet<string> = new Set(['cast', 'shrug', 'wave']);
/** Trilhas do tronco pra cima (camada aditiva). */
export const UPPER_BONES = /(Spine1|Spine2|Neck|Head|Shoulder|Arm|ForeArm|Hand)\.quaternion$/;

export const ANIMS = [
  'idle',
  'idleGrumpy',
  'walk',
  'run',
  'jump',
  'doubleJump',
  'fall',
  'land',
  'mount',
  'fly',
  'cast',
  'fail',
  'shrug',
  'sit',
  'wave',
] as const;
export type AnimName = (typeof ANIMS)[number];
/** Animações que tocam uma vez (as outras são loop). */
export const ONCE: ReadonlySet<AnimName> = new Set([
  'idleGrumpy',
  'jump',
  'doubleJump',
  'land',
  'mount',
  'cast',
  'fail',
  'shrug',
  'wave',
]);

/**
 * Pose = rotações em graus por osso (+ `y` do quadril em metros).
 * Braço/perna pra frente = x negativo; abrir pro lado = z (+ esquerda, − direita).
 */
type Pose = Record<string, number[] | number>;
const D = Math.PI / 180;
const TAU = Math.PI * 2;
const sin = (phase: number): number => Math.sin(phase * TAU);
const cos = (phase: number): number => Math.cos(phase * TAU);
const up = (v: number): number => Math.max(0, v);

/** Pose neutra: braços em A como no design, cabeça levemente baixa (emburrada). */
const STAND: Pose = {
  // todos os ossos animados entram aqui: cada clipe escreve o esqueleto inteiro
  Hips: [0, 0, 0],
  Spine: [0, 0, 0],
  Spine1: [0, 0, 0],
  Spine2: [0, 0, 0],
  Neck: [0, 0, 0],
  LeftShoulder: [0, 0, 0],
  RightShoulder: [0, 0, 0],
  LeftHand: [0, 0, 0],
  RightHand: [0, 0, 0],
  LeftLeg: [0, 0, 0],
  RightLeg: [0, 0, 0],
  LeftFoot: [0, 0, 0],
  RightFoot: [0, 0, 0],
  LeftArm: [0, 0, 24],
  RightArm: [0, 0, -24],
  LeftForeArm: [-8, 0, 0],
  RightForeArm: [-8, 0, 0],
  LeftUpLeg: [0, 0, 3],
  RightUpLeg: [0, 0, -3],
  Head: [5, 0, 0],
  y: 0,
};
const pose = (p: Pose): Pose => ({ ...STAND, ...p });

const smooth = (k: number): number => k * k * k * (k * (k * 6 - 15) + 10);
/** Passa do alvo e volta: dá o "estalo" de antecipação e acomodação. */
const overshoot = (k: number): number => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

function mix(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key] ?? (key === 'y' ? 0 : [0, 0, 0]);
    const vb = b[key] ?? (key === 'y' ? 0 : [0, 0, 0]);
    if (typeof va === 'number' || typeof vb === 'number')
      out[key] = (va as number) + ((vb as number) - (va as number)) * k;
    else out[key] = [0, 1, 2].map((i) => (va[i] ?? 0) + ((vb[i] ?? 0) - (va[i] ?? 0)) * k);
  }
  return out;
}

type Key = [time: number, pose: Pose, ease?: (k: number) => number];
/** Interpola uma sequência de poses-chave no tempo `t` (segundos). */
function seq(t: number, keys: Key[]): Pose {
  let a = keys[0];
  if (!a) return STAND;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (!b) break;
    if (t <= b[0]) {
      const k = (t - a[0]) / Math.max(1e-5, b[0] - a[0]);
      return mix(a[1], b[1], (b[2] ?? smooth)(Math.min(1, Math.max(0, k))));
    }
    a = b;
  }
  return a[1];
}

const q = new Quaternion();
const e = new Euler();

/** Amostra a função de pose a 30 fps e gera o clipe (curvas suaves sem depender do interpolador). */
function bake(name: AnimName, dur: number, fn: (t: number) => Pose): AnimationClip {
  const n = Math.max(2, Math.round(dur * 30) + 1);
  const times: number[] = [];
  const frames: Pose[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * dur;
    times.push(t);
    frames.push(fn(t));
  }
  const bones = new Set<string>();
  for (const f of frames) for (const k of Object.keys(f)) if (k !== 'y') bones.add(k);
  const tracks: KeyframeTrack[] = [];
  for (const b of bones) {
    const values: number[] = [];
    for (const f of frames) {
      const r = f[b];
      const v = Array.isArray(r) ? r : [0, 0, 0];
      q.setFromEuler(e.set((v[0] ?? 0) * D, (v[1] ?? 0) * D, (v[2] ?? 0) * D));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new QuaternionKeyframeTrack(`${BONE_PREFIX}${b}.quaternion`, times, values));
  }
  tracks.push(
    new VectorKeyframeTrack(
      `${BONE_PREFIX}Hips.position`,
      times,
      frames.flatMap((f) => [0, HIPS_Y + (typeof f.y === 'number' ? f.y : 0), 0]),
    ),
  );
  return new AnimationClip(name, dur, tracks);
}

/** Um passo do ciclo de locomoção; `run` mistura andar (0) e correr (1). */
function stride(ph: number, run: number): Pose {
  const sw = 26 + 20 * run; // amplitude da coxa
  const l = sin(ph);
  const leg = (s: number, side: 1 | -1): Pose[string] => [-6 * run + sw * s, 0, 3 * side];
  const knee = (c: number): number => 8 + 10 * run + (48 + 36 * run) * up(-c) ** 0.8;
  // braço balança oposto à perna; correndo, o cotovelo dobra e o balanço cresce
  const arm = (s: number, side: 1 | -1): Pose[string] => [
    -(20 + 18 * run) * s + 6 * run,
    0,
    (20 - 6 * run) * side,
  ];
  const elbow = (s: number): number => -12 - 58 * run - (10 + 12 * run) * up(s);
  return {
    Hips: [0, -5 * l, 2.5 * l],
    Spine: [3 + 13 * run, 6 * l, -2 * l],
    Spine2: [0, 4 * l, 0],
    Head: [3 - 12 * run, -6 * l, 0],
    LeftUpLeg: leg(l, 1),
    RightUpLeg: leg(-l, -1),
    LeftLeg: [knee(cos(ph)), 0, 0],
    RightLeg: [knee(-cos(ph)), 0, 0],
    LeftFoot: [-14 * up(l) + 10 * up(-l) * run, 0, 0],
    RightFoot: [-14 * up(-l) + 10 * up(l) * run, 0, 0],
    LeftArm: arm(l, 1),
    RightArm: arm(-l, -1),
    LeftForeArm: [elbow(-sin(ph - 0.06)), 0, 0],
    RightForeArm: [elbow(sin(ph - 0.06)), 0, 0],
    y: -0.012 - 0.018 * run - (0.012 + 0.016 * run) * cos(ph * 2),
  };
}

const CROSSED: Pose = {
  LeftArm: [-22, -70, 6],
  LeftForeArm: [-100, 0, 0],
  RightArm: [-28, 70, -6],
  RightForeArm: [-95, 0, 0],
};
const FLY: Pose = {
  Spine: [22, 0, 0],
  Head: [-18, 0, 0],
  LeftUpLeg: [-75, 0, 12],
  LeftLeg: [78, 0, 0],
  RightUpLeg: [-75, 0, -12],
  RightLeg: [74, 0, 0],
  LeftArm: [-55, 0, -8],
  LeftForeArm: [-35, 0, 0],
  RightArm: [-55, 0, 8],
  RightForeArm: [-35, 0, 0],
};

/** Clipes procedurais do placeholder. Um GLB com clipes de mesmo nome substitui todos. */
export function buildClips(): AnimationClip[] {
  return [
    bake('idle', 4, (t) => {
      const b = sin(t / 4);
      return pose({
        Hips: [0, 0, 1.2 * sin(t / 4 - 0.1)],
        Spine: [1.5 + 1.4 * b, 0, -1.2 * sin(t / 4 - 0.1)],
        Head: [5 + 1.6 * sin(t / 4 - 0.18), 3 * sin(t / 8), 0],
        LeftArm: [0, 0, 24 + 1.6 * sin(t / 4 - 0.12)],
        RightArm: [0, 0, -24 - 1.6 * sin(t / 4 - 0.12)],
        y: -0.004 * (1 + b),
      });
    }),

    // variação emburrada: cruza os braços, vira o rosto, bufa e bate o pé
    bake('idleGrumpy', 3.6, (t) => {
      const tap = t > 0.9 && t < 2.6 ? up(sin((t - 0.9) / 0.42)) : 0;
      const sulk = pose({ ...CROSSED, Spine: [-5, 0, 0], Head: [2, 30, 7], Hips: [0, 0, 3] });
      const huff = pose({
        ...CROSSED,
        Spine: [-9, 0, 0],
        Spine2: [-4, 0, 0],
        Head: [-6, 32, 8],
        Hips: [0, 0, 3],
        y: 0.012,
      });
      const p = seq(t, [
        [0, STAND],
        [0.42, sulk, overshoot],
        [1.3, sulk],
        [1.5, huff],
        [1.85, sulk],
        [2.9, sulk],
        [3.6, STAND],
      ]);
      p.RightFoot = [-26 * tap, 0, 0];
      return p;
    }),

    bake('walk', 1, (t) => pose(stride(t, 0))),
    bake('run', 0.56, (t) => pose(stride(t / 0.56, 1))),

    bake('jump', 0.4, (t) =>
      seq(t, [
        [
          0,
          pose({
            Spine: [10, 0, 0],
            LeftUpLeg: [-30, 0, 3],
            LeftLeg: [55, 0, 0],
            RightUpLeg: [-24, 0, -3],
            RightLeg: [48, 0, 0],
            LeftArm: [25, 0, 18],
            RightArm: [25, 0, -18],
            y: -0.1,
          }),
        ],
        [
          0.12,
          pose({
            Spine: [-8, 0, 0],
            Head: [-10, 0, 0],
            LeftFoot: [30, 0, 0],
            RightFoot: [30, 0, 0],
            LeftArm: [-30, 0, 62],
            RightArm: [-30, 0, -62],
            y: 0.02,
          }),
          overshoot,
        ],
        [
          0.4,
          pose({
            Spine: [-2, 0, 0],
            LeftUpLeg: [-38, 0, 4],
            LeftLeg: [62, 0, 0],
            RightUpLeg: [-10, 0, -4],
            RightLeg: [34, 0, 0],
            LeftArm: [-10, 0, 74],
            RightArm: [-10, 0, -74],
          }),
        ],
      ]),
    ),

    // pulo duplo: pirueta encolhida
    bake('doubleJump', 0.5, (t) => {
      const k = 1 - (1 - t / 0.5) ** 2;
      return pose({
        Hips: [0, 360 * k, 0],
        Spine: [16, 0, 0],
        Head: [8, 0, 0],
        LeftUpLeg: [-78, 0, 6],
        LeftLeg: [108, 0, 0],
        RightUpLeg: [-72, 0, -6],
        RightLeg: [102, 0, 0],
        LeftArm: [0, 0, 84],
        RightArm: [0, 0, -84],
        y: 0.03,
      });
    }),

    bake('fall', 0.9, (t) => {
      const f = sin(t / 0.9);
      return pose({
        Spine: [6, 0, 0],
        Head: [14, 0, 0],
        LeftUpLeg: [-18 + 5 * f, 0, 5],
        LeftLeg: [30, 0, 0],
        RightUpLeg: [6 - 5 * f, 0, -5],
        RightLeg: [46, 0, 0],
        LeftArm: [-8, 0, 92 + 9 * f],
        RightArm: [-8, 0, -92 + 9 * f],
        LeftForeArm: [-20, 0, 0],
        RightForeArm: [-20, 0, 0],
      });
    }),

    bake('land', 0.34, (t) =>
      seq(t, [
        [
          0,
          pose({
            Spine: [24, 0, 0],
            Head: [10, 0, 0],
            LeftUpLeg: [-62, 0, 8],
            LeftLeg: [104, 0, 0],
            RightUpLeg: [-56, 0, -8],
            RightLeg: [98, 0, 0],
            LeftArm: [-25, 0, 48],
            RightArm: [-25, 0, -48],
            y: -0.21,
          }),
        ],
        [0.34, STAND, overshoot],
      ]),
    ),

    bake('mount', 0.45, (t) =>
      seq(t, [
        [0, STAND],
        [0.2, pose({ LeftUpLeg: [-30, 0, 40], Spine: [8, 0, 0], y: 0.12 })],
        [0.45, pose(FLY), overshoot],
      ]),
    ),

    bake('fly', 2, (t) => {
      const b = sin(t / 2);
      return pose({
        ...FLY,
        Spine: [22 + 2.5 * b, 0, 0],
        LeftLeg: [78 - 6 * b, 0, 0],
        RightLeg: [74 + 6 * b, 0, 0],
        y: 0.02 * b,
      });
    }),

    // lançar: recua, gira o tronco e estoca o braço direito com passo à frente
    bake('cast', 0.78, (t) =>
      seq(t, [
        [0, STAND],
        [
          0.16,
          pose({
            Hips: [0, -14, 0],
            Spine: [-4, -30, 0],
            Head: [0, 22, 0],
            RightArm: [38, 0, -52],
            RightForeArm: [-78, 0, 0],
            LeftArm: [-30, 0, 30],
            LeftUpLeg: [-10, 0, 3],
            LeftLeg: [22, 0, 0],
            RightUpLeg: [8, 0, -3],
            RightLeg: [18, 0, 0],
            y: -0.045,
          }),
        ],
        [
          0.27,
          pose({
            Hips: [0, 12, 0],
            Spine: [10, 26, 0],
            Head: [-6, -18, 0],
            RightArm: [-98, 0, -6],
            RightForeArm: [-3, 0, 0],
            LeftArm: [30, 0, 30],
            LeftForeArm: [-30, 0, 0],
            LeftUpLeg: [-24, 0, 3],
            LeftLeg: [20, 0, 0],
            RightUpLeg: [16, 0, -3],
            RightLeg: [10, 0, 0],
            y: -0.03,
          }),
          overshoot,
        ],
        [
          0.5,
          pose({
            Hips: [0, 10, 0],
            Spine: [8, 22, 0],
            Head: [-6, -16, 0],
            RightArm: [-92, 0, -6],
            RightForeArm: [-6, 0, 0],
            LeftArm: [26, 0, 28],
            LeftForeArm: [-26, 0, 0],
            LeftUpLeg: [-22, 0, 3],
            LeftLeg: [18, 0, 0],
            RightUpLeg: [14, 0, -3],
            RightLeg: [10, 0, 0],
            y: -0.03,
          }),
        ],
        [0.78, STAND],
      ]),
    ),

    // explodiu na cara: recua, protege o rosto, tosse e balança a cabeça
    bake('fail', 1.4, (t) => {
      const guard: Pose = {
        LeftArm: [-72, 0, 40],
        LeftForeArm: [-98, 0, 0],
        RightArm: [-72, 0, -40],
        RightForeArm: [-98, 0, 0],
      };
      const p = seq(t, [
        [0, STAND],
        [
          0.1,
          pose({
            ...guard,
            Spine: [-22, 0, 0],
            Head: [-14, 0, 0],
            LeftUpLeg: [-18, 0, 3],
            RightUpLeg: [14, 0, -3],
            RightLeg: [20, 0, 0],
            y: -0.05,
          }),
          overshoot,
        ],
        [0.55, pose({ ...guard, Spine: [14, 0, 0], Head: [16, 0, 0], y: -0.02 })],
        [0.7, pose({ ...guard, Spine: [8, 0, 0], Head: [8, 0, 0] })],
        [0.85, pose({ ...guard, Spine: [15, 0, 0], Head: [17, 0, 0], y: -0.02 })],
        [1.4, STAND],
      ]);
      if (t > 0.95 && Array.isArray(p.Head))
        p.Head = [p.Head[0] ?? 0, 20 * sin((t - 0.95) / 0.3) * (1.4 - t) * 2.2, 0];
      return p;
    }),

    // a palavra não ecoou: dá de ombros, irritada
    bake('shrug', 1.1, (t) =>
      seq(t, [
        [0, STAND],
        [
          0.22,
          pose({
            LeftShoulder: [0, 0, 14],
            RightShoulder: [0, 0, -14],
            LeftArm: [-10, -40, 34],
            LeftForeArm: [-80, 0, 0],
            RightArm: [-10, 40, -34],
            RightForeArm: [-80, 0, 0],
            Head: [8, 0, 9],
            Spine: [-3, 0, 0],
          }),
          overshoot,
        ],
        [
          0.7,
          pose({
            LeftShoulder: [0, 0, 12],
            RightShoulder: [0, 0, -12],
            LeftArm: [-10, -40, 32],
            LeftForeArm: [-78, 0, 0],
            RightArm: [-10, 40, -32],
            RightForeArm: [-78, 0, 0],
            Head: [9, 0, 9],
            Spine: [-3, 0, 0],
          }),
        ],
        [1.1, STAND],
      ]),
    ),

    bake('sit', 3, (t) => {
      const b = sin(t / 3);
      return pose({
        Spine: [-8 + 1.5 * b, 0, 0],
        Head: [9, 6 * b, 0],
        LeftUpLeg: [-88, 0, 10],
        LeftLeg: [14, 0, 0],
        LeftFoot: [-20, 0, 0],
        RightUpLeg: [-80, 0, -10],
        RightLeg: [34, 0, 0],
        LeftArm: [28, 0, 22],
        RightArm: [28, 0, -22],
        y: -0.66,
      });
    }),

    bake('wave', 1.8, (t) => {
      const upPose = pose({
        RightArm: [0, 0, -150],
        RightForeArm: [0, 0, -12],
        Head: [2, 0, 6],
        Spine: [0, 0, 3],
      });
      const p = seq(t, [
        [0, STAND],
        [0.3, upPose, overshoot],
        [1.5, upPose],
        [1.8, STAND],
      ]);
      if (t > 0.3 && t < 1.5) p.RightForeArm = [0, 0, -8 + 26 * sin((t - 0.3) / 0.4)];
      return p;
    }),
  ];
}
