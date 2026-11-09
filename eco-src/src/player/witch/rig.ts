import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Shape,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { MeshToonMaterial, Object3D } from 'three';
import { facet, toonMat } from '../../art/toon';
import { lock, MeshBuilder, tube, type Skin } from './build';
import { createFace } from './face';

export const HIPS_Y = 0.9;
export const BONE_PREFIX = 'mixamorig';

const C = {
  dress: 0x463e60,
  dressDark: 0x383150,
  purple: 0x7652cc,
  under: 0x56389f,
  hair: 0x3d3158,
  hairLight: 0x554672,
  skin: 0xfde4da,
  silver: 0xc4c5d2,
  sock: 0x3b3454,
  boot: 0x423a5c,
  sole: 0x6040b8,
};

/** Cabeça: superelipsoide (frente mais plana que uma esfera) com queixo afinado. */
const HEAD = { cy: 1.375, rx: 0.118, ry: 0.15, rz: 0.122, n: 2.8 };
function headShape(
  v: Vector3,
  rx = HEAD.rx,
  ry = HEAD.ry,
  rz = HEAD.rz,
  cy = HEAD.cy,
  cz = 0,
): Vector3 {
  const f = v.y < 0 ? 1 - 0.36 * v.y * v.y : 1;
  const h = Math.sqrt(Math.max(0, 1 - v.y * v.y));
  const phi = Math.atan2(v.x, v.z);
  const r = Math.pow(
    Math.abs(Math.cos(phi)) ** HEAD.n + Math.abs(Math.sin(phi)) ** HEAD.n,
    -1 / HEAD.n,
  );
  return v.set(Math.sin(phi) * r * h * rx * f, cy + v.y * ry, cz + Math.cos(phi) * r * h * rz * f);
}
function headZ(x: number, y: number): number {
  const yn = (y - HEAD.cy) / HEAD.ry;
  const f = yn < 0 ? 1 - 0.36 * yn * yn : 1;
  const h = Math.sqrt(Math.max(0, 1 - yn * yn));
  const xn = Math.min(0.985, Math.abs(x) / Math.max(1e-4, HEAD.rx * f * h));
  return HEAD.rz * f * h * Math.pow(1 - xn ** HEAD.n, 1 / HEAD.n);
}
function shaped(
  detail: number,
  rx: number,
  ry: number,
  rz: number,
  cy: number,
  cz: number,
): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    headShape(v.fromBufferAttribute(p, i).normalize(), rx, ry, rz, cy, cz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  return g;
}
/** Remove os triângulos cujo centro cai em `inside` (abre a janela do rosto no capacete do cabelo). */
function cut(g: BufferGeometry, inside: (c: Vector3) => boolean): BufferGeometry {
  const p = g.getAttribute('position');
  const keep: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    if (inside(a.clone().add(b).add(c).divideScalar(3))) continue;
    keep.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(keep, 3));
  return out;
}

export interface SpringSpec {
  bone: Bone;
  length: number;
  stiffness: number;
  drag: number;
  gravity: number;
  limit: number;
}
export interface WitchRig {
  root: Group;
  bones: Record<string, Bone>;
  material: MeshToonMaterial;
  broom: Object3D;
  springs: SpringSpec[];
  setFace(blink: boolean, mouthOpen: number): void;
  triangles: number;
}

/**
 * Bruxa procedural no design de referência. Esqueleto com nomes do Mixamo, uma malha
 * skinned com cor por vértice (1 draw call) + rosto desenhado (1 draw call).
 * Coordenadas em metros, pose de descanso com braços pra baixo, rosto pra +Z, altura 1,6.
 */
export function buildWitchRig(): WitchRig {
  const root = new Group();
  const list: Bone[] = [];
  const bones: Record<string, Bone> = {};
  const world = new Map<Bone, Vector3>();
  /** Cria o osso numa posição de MUNDO (pose de descanso). */
  const bone = (name: string, parent: Bone | null, x: number, y: number, z: number): Bone => {
    const b = new Bone();
    b.name = BONE_PREFIX + name;
    const w = new Vector3(x, y, z);
    b.position.copy(parent ? w.clone().sub(world.get(parent) ?? new Vector3()) : w);
    (parent ?? root).add(b);
    world.set(b, w);
    list.push(b);
    bones[name] = b;
    return b;
  };

  const hips = bone('Hips', null, 0, HIPS_Y, 0);
  const spine = bone('Spine', hips, 0, 0.95, 0);
  const spine1 = bone('Spine1', spine, 0, 1.02, 0);
  const spine2 = bone('Spine2', spine1, 0, 1.09, 0);
  const neck = bone('Neck', spine2, 0, 1.175, 0);
  const head = bone('Head', neck, 0, 1.225, 0);
  const skirt = bone('Skirt', hips, 0, 0.93, 0);
  const hairBack = bone('HairBack', head, 0, 1.42, -0.11);
  const ahoge = bone('Ahoge', head, 0.02, 1.54, -0.01);
  const limb: Record<string, Bone> = {};
  for (const [side, s] of [
    ['Left', 1],
    ['Right', -1],
  ] as const) {
    const shoulder = bone(`${side}Shoulder`, spine2, 0.07 * s, 1.14, 0);
    const arm = bone(`${side}Arm`, shoulder, 0.12 * s, 1.13, 0);
    const fore = bone(`${side}ForeArm`, arm, 0.12 * s, 0.93, 0);
    limb[`${side}Hand`] = bone(`${side}Hand`, fore, 0.12 * s, 0.72, 0);
    limb[`${side}Sleeve`] = bone(`${side}Sleeve`, fore, 0.12 * s, 0.9, 0);
    const up = bone(`${side}UpLeg`, hips, 0.075 * s, 0.86, 0);
    const leg = bone(`${side}Leg`, up, 0.075 * s, 0.48, 0);
    const foot = bone(`${side}Foot`, leg, 0.075 * s, 0.1, 0);
    bone(`${side}ToeBase`, foot, 0.075 * s, 0.03, 0.12);
    limb[`${side}Hair`] = bone(`${side}Hair`, head, 0.125 * s, 1.38, 0);
    Object.assign(limb, {
      [`${side}Arm`]: arm,
      [`${side}ForeArm`]: fore,
      [`${side}UpLeg`]: up,
      [`${side}Leg`]: leg,
      [`${side}Foot`]: foot,
    });
  }
  root.updateMatrixWorld(true);

  const mb = new MeshBuilder(list);
  const m = new Matrix4();
  const at = (x: number, y: number, z: number): { m: Matrix4 } => ({
    m: m.clone().makeTranslation(x, y, z),
  });
  /** Mistura entre dois ossos em torno da altura `y` (dobra suave em cotovelo, joelho, cintura). */
  const blendY = (a: Bone, b: Bone, y: number, range: number): Skin => ({
    a,
    b,
    t: (p) => (y + range - p.y) / (2 * range),
  });

  // ---------- tronco ----------
  const torso = tube(
    [
      { y: 0.88, r: 0.08, sz: 0.82 },
      { y: 0.93, r: 0.073, sz: 0.82 },
      { y: 0.985, r: 0.076, sz: 0.82 },
      { y: 1.05, r: 0.088, sz: 0.8 },
      { y: 1.105, r: 0.098, sx: 1.1, sz: 0.74 },
      { y: 1.145, r: 0.085, sx: 1.1, sz: 0.7 },
      { y: 1.165, r: 0.05, sz: 0.8 },
    ],
    10,
    { capLast: true },
  );
  mb.add(torso, C.dress, {
    a: spine,
    b: spine2,
    t: (p) => (p.y - 0.97) / 0.12,
  });
  // gola alta, larga e dobrada
  mb.add(
    tube(
      [
        { y: 1.14, r: 0.058 },
        { y: 1.18, r: 0.068 },
        { y: 1.212, r: 0.07 },
        { y: 1.216, r: 0.058 },
        { y: 1.19, r: 0.05 },
      ],
      10,
    ),
    C.dress,
    blendY(neck, spine2, 1.16, 0.03),
  );
  // estrela prateada no lado esquerdo dela
  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.016 : 0.038;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new ExtrudeGeometry(star, { depth: 0.012, bevelEnabled: false });
  starGeo.deleteAttribute('uv');
  mb.add(starGeo, C.silver, spine2, {
    m: m.clone().makeRotationY(0.45).setPosition(0.058, 1.092, 0.066),
  });
  // cinto com fivela retangular
  mb.add(
    tube(
      [
        { y: 0.978, r: 0.081, sz: 0.84 },
        { y: 0.934, r: 0.083, sz: 0.84 },
      ],
      10,
    ),
    C.dressDark,
    spine,
  );
  mb.add(new BoxGeometry(0.082, 0.064, 0.014), C.silver, spine, at(0, 0.956, 0.071));
  mb.add(new BoxGeometry(0.05, 0.034, 0.016), C.dressDark, spine, at(0, 0.956, 0.072));
  mb.add(new BoxGeometry(0.012, 0.03, 0.02), C.silver, spine, at(0.012, 0.956, 0.073));

  // ---------- saia plissada (osso próprio com mola) ----------
  const skirtSkin = blendY(hips, skirt, 0.9, 0.04);
  mb.add(
    tube(
      [
        { y: 0.945, r: 0.084, sz: 0.86 },
        { y: 0.9, r: 0.118, sz: 0.92 },
        { y: 0.8, r: 0.172 },
        { y: 0.722, r: 0.205 },
      ],
      16,
      { pleat: 0.085 },
    ),
    C.dress,
    skirtSkin,
  );
  mb.add(
    tube(
      [
        { y: 0.722, r: 0.189 },
        { y: 0.69, r: 0.2 },
      ],
      16,
      { pleat: 0.085 },
    ),
    C.purple,
    skirt,
  );
  // forro: fecha a saia por baixo e aparece como segunda camada
  mb.add(
    tube(
      [
        { y: 0.74, r: 0.165 },
        { y: 0.672, r: 0.183 },
        { y: 0.74, r: 0.06 },
      ],
      16,
    ),
    C.under,
    skirt,
  );

  // ---------- braços, pernas e botas ----------
  for (const [side, s] of [
    ['Left', 1],
    ['Right', -1],
  ] as const) {
    const arm = limb[`${side}Arm`];
    const fore = limb[`${side}ForeArm`];
    const hand = limb[`${side}Hand`];
    const sleeve = limb[`${side}Sleeve`];
    const up = limb[`${side}UpLeg`];
    const leg = limb[`${side}Leg`];
    const foot = limb[`${side}Foot`];
    if (!arm || !fore || !hand || !sleeve || !up || !leg || !foot) continue;
    const ax = 0.12 * s;
    const elbow = blendY(arm, fore, 0.93, 0.035);
    // ombro + manga de cima
    mb.add(
      new IcosahedronGeometry(0.052, 0),
      C.dress,
      { a: spine2, b: arm, t: () => 0.6 },
      at(ax - 0.012 * s, 1.128, 0),
    );
    mb.add(
      tube(
        [
          { y: 1.145, r: 0.044 },
          { y: 1.02, r: 0.047 },
          { y: 0.965, r: 0.052 },
        ],
        7,
        { x: ax },
      ),
      C.dress,
      elbow,
    );
    // faixa roxa no cotovelo
    mb.add(
      tube(
        [
          { y: 0.972, r: 0.056 },
          { y: 0.93, r: 0.061 },
        ],
        7,
        { x: ax },
      ),
      C.purple,
      elbow,
    );
    // sino da manga: do antebraço pra um osso com mola na ponta
    const bell = blendY(fore, sleeve, 0.84, 0.09);
    mb.add(
      tube(
        [
          { y: 0.935, r: 0.057 },
          { y: 0.86, r: 0.068 },
          { y: 0.78, r: 0.082 },
          { y: 0.715, r: 0.093 },
        ],
        8,
        { x: ax },
      ),
      C.dress,
      bell,
    );
    mb.add(
      tube(
        [
          { y: 0.715, r: 0.095 },
          { y: 0.682, r: 0.1 },
          { y: 0.7, r: 0.03 },
        ],
        8,
        { x: ax },
      ),
      C.purple,
      sleeve,
    );
    // mão com dedão
    mb.add(new BoxGeometry(0.052, 0.07, 0.042), C.skin, hand, at(ax, 0.665, 0.004));
    mb.add(new BoxGeometry(0.018, 0.034, 0.022), C.skin, hand, at(ax - 0.03 * s, 0.676, 0.016));

    const lx = 0.075 * s;
    const knee = blendY(up, leg, 0.48, 0.04);
    // coxa (pele)
    mb.add(
      tube(
        [
          { y: 0.89, r: 0.05 },
          { y: 0.7, r: 0.046 },
          { y: 0.5, r: 0.039 },
        ],
        7,
        { x: lx },
      ),
      C.skin,
      knee,
    );
    // meias assimétricas: esquerda dela até a coxa com faixa roxa; direita até o joelho
    const top = s > 0 ? 0.705 : 0.525;
    mb.add(
      tube(
        [
          { y: top, r: s > 0 ? 0.052 : 0.044 },
          { y: 0.5, r: 0.043 },
          { y: 0.36, r: 0.046 },
          { y: 0.2, r: 0.038 },
        ],
        7,
        { x: lx },
      ),
      C.sock,
      knee,
    );
    if (s > 0)
      mb.add(
        tube(
          [
            { y: 0.668, r: 0.052 },
            { y: 0.636, r: 0.051 },
          ],
          7,
          { x: lx },
        ),
        C.purple,
        up,
      );
    // bota de plataforma: cano largo, tira com fivela, bico alto, sola roxa
    const ankle = blendY(leg, foot, 0.14, 0.03);
    mb.add(
      tube(
        [
          { y: 0.305, r: 0.058 },
          { y: 0.318, r: 0.083 },
          { y: 0.27, r: 0.07 },
          { y: 0.12, r: 0.064 },
        ],
        8,
        { x: lx, z: 0.004 },
      ),
      C.boot,
      ankle,
    );
    const toe = new BoxGeometry(0.146, 0.135, 0.25, 1, 1, 2);
    const tp = toe.getAttribute('position');
    for (let i = 0; i < tp.count; i++) {
      const z = tp.getZ(i);
      if (z > 0.1 && tp.getY(i) > 0) tp.setXYZ(i, tp.getX(i) * 0.82, tp.getY(i) - 0.03, z - 0.02);
      else if (z > 0.1) tp.setX(i, tp.getX(i) * 0.9);
    }
    mb.add(toe, C.boot, foot, at(lx, 0.122, 0.045));
    mb.add(new BoxGeometry(0.162, 0.058, 0.272), C.sole, foot, at(lx, 0.029, 0.046));
    mb.add(
      tube(
        [
          { y: 0.195, r: 0.073 },
          { y: 0.155, r: 0.076 },
        ],
        8,
        { x: lx, z: 0.004 },
      ),
      C.dressDark,
      ankle,
    );
    mb.add(new BoxGeometry(0.058, 0.05, 0.014), C.silver, foot, at(lx, 0.175, 0.082));
    mb.add(new BoxGeometry(0.03, 0.024, 0.016), C.dressDark, foot, at(lx, 0.175, 0.083));
  }

  // ---------- cabeça ----------
  mb.add(shaped(2, HEAD.rx, HEAD.ry, HEAD.rz, HEAD.cy, 0), C.skin, head, { smooth: true });
  mb.add(
    tube(
      [
        { y: 1.25, r: 0.04 },
        { y: 1.17, r: 0.042 },
      ],
      7,
    ),
    C.skin,
    neck,
  );

  // ---------- cabelo: capacete + mechas pontudas em camadas ----------
  const cap = cut(shaped(1, 0.136, 0.16, 0.142, 1.402, -0.012), (c) => c.z > 0.03 && c.y < 1.47);
  mb.add(cap, C.hair, head);
  const HC = new Vector3(0, 1.4, 0);
  const tones = [C.hair, C.hairLight];
  let tone = 0;
  let wide = 1;
  const strand = (
    b: [number, number, number],
    t: [number, number, number],
    w: number,
    spring: Bone | null = null,
    bend: [number, number, number] | null = null,
  ): void => {
    const base = new Vector3(...b);
    const tip = new Vector3(...t);
    const out = base.clone().add(tip).multiplyScalar(0.5).sub(HC).setY(0).normalize();
    const bd = bend ? new Vector3(...bend) : out.multiplyScalar(0.045).setY(0.025);
    const { geo, s } = lock(base, tip, w * wide, w * wide * 0.55, bd, HC);
    const skin: Skin = spring
      ? { a: head, b: spring, t: (_p, i) => ((s[i] ?? 0) - 0.1) / 0.5 }
      : head;
    mb.add(geo, tones[tone++ % 2] ?? C.hair, skin);
  };
  // franja: mecha grossa entre os olhos + mechas caindo sobre eles
  strand([0.01, 1.515, 0.085], [-0.012, 1.31, 0.128], 0.075, null, [0, 0, 0.035]);
  for (const s of [1, -1]) {
    strand([0.05 * s, 1.51, 0.08], [0.074 * s, 1.368, 0.124], 0.062, null, [0.01 * s, 0, 0.035]);
    strand([0.09 * s, 1.5, 0.06], [0.124 * s, 1.345, 0.09], 0.06, null, [0.02 * s, 0, 0.03]);
    strand([0.03 * s, 1.52, 0.072], [0.036 * s, 1.405, 0.127], 0.046, null, [0, 0, 0.03]);
  }
  wide = 1.5; // mechas largas e chapadas, não fios
  for (const s of [1, -1]) {
    const side = s > 0 ? limb.LeftHair : limb.RightHair;
    // coroa: mechas grandes abrindo do topo pros lados
    strand([0.03 * s, 1.545, -0.02], [0.268 * s, 1.432, 0], 0.125);
    strand([0.02 * s, 1.54, -0.04], [0.24 * s, 1.47, -0.115], 0.115);
    strand([0.02 * s, 1.54, 0], [0.205 * s, 1.456, 0.088], 0.1);
    // meio: pontas espetadas na altura da orelha
    strand([0.11 * s, 1.45, 0.02], [0.278 * s, 1.332, 0.03], 0.105);
    strand([0.115 * s, 1.42, -0.04], [0.262 * s, 1.272, -0.06], 0.1);
    strand([0.09 * s, 1.44, -0.09], [0.2 * s, 1.3, -0.19], 0.1);
    // baixo: mechas longas até o ombro e o peito (com mola)
    strand([0.12 * s, 1.38, 0], [0.236 * s, 1.17, 0.02], 0.09, side);
    strand([0.115 * s, 1.36, -0.05], [0.2 * s, 1.1, -0.07], 0.09, side);
    strand([0.118 * s, 1.4, 0.045], [0.132 * s, 1.1, 0.086], 0.066, side, [0.02 * s, 0, 0.02]);
    strand([0.105 * s, 1.39, 0.06], [0.106 * s, 1.24, 0.1], 0.05, null, [0.012 * s, 0, 0.02]);
    strand([0.07 * s, 1.37, -0.1], [0.13 * s, 1.06, -0.16], 0.1, hairBack);
    strand([0.035 * s, 1.4, -0.125], [0.07 * s, 1.15, -0.2], 0.09, hairBack);
  }
  strand([0, 1.54, -0.05], [0, 1.44, -0.2], 0.12);
  strand([0, 1.45, -0.12], [0, 1.31, -0.215], 0.11);
  strand([0, 1.36, -0.12], [0, 1.02, -0.18], 0.11, hairBack);
  // tufos no topo
  strand([0.02, 1.545, -0.01], [0.086, 1.626, 0.02], 0.058, ahoge, [0, 0.03, 0]);
  strand([-0.03, 1.545, -0.03], [-0.1, 1.6, -0.05], 0.06);

  const material = toonMat(0xffffff, true);
  const mesh = new SkinnedMesh(mb.build(), material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(new Skeleton(list));
  head.scale.setScalar(1.1); // cabeça de anime: um pouco maior que o real

  // ---------- rosto desenhado: malha curva colada na frente da cabeça ----------
  const face = createFace();
  const G = 8;
  const fp: number[] = [];
  const fuv: number[] = [];
  const fi: number[] = [];
  for (let j = 0; j <= G; j++)
    for (let i = 0; i <= G; i++) {
      const x = -0.105 + (i / G) * 0.21;
      const y = 1.225 + (j / G) * 0.21;
      fp.push(x, y - 1.225, headZ(x, y) + 0.0025);
      fuv.push(i / G, j / G);
    }
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const a = j * (G + 1) + i;
      fi.push(a, a + 1, a + G + 1, a + 1, a + G + 2, a + G + 1);
    }
  const fg = new BufferGeometry();
  fg.setAttribute('position', new Float32BufferAttribute(fp, 3));
  fg.setAttribute('uv', new Float32BufferAttribute(fuv, 2));
  fg.setIndex(fi);
  const decal = new Mesh(
    fg,
    new MeshBasicMaterial({
      map: face.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  decal.renderOrder = 2;
  head.add(decal);

  // vassoura: aparece só em voo
  const broom = new Group();
  const stick = new Mesh(
    facet(new CylinderGeometry(0.018, 0.018, 1.5, 5).rotateX(Math.PI / 2)),
    toonMat(0x7a5a3a),
  );
  const bristles = new Mesh(
    facet(new ConeGeometry(0.12, 0.42, 7).rotateX(Math.PI / 2)),
    toonMat(0xc9a050),
  );
  bristles.position.z = -0.78;
  stick.castShadow = bristles.castShadow = true;
  broom.add(stick, bristles);
  broom.position.set(0, -0.13, 0.12);
  broom.visible = false;
  hips.add(broom);

  const spring = (
    b: Bone | undefined,
    length: number,
    stiffness: number,
    drag: number,
    gravity: number,
    limit: number,
  ): SpringSpec[] => (b ? [{ bone: b, length, stiffness, drag, gravity, limit }] : []);
  const springs = [
    ...spring(skirt, 0.24, 90, 0.22, 2, 0.5),
    ...spring(limb.LeftSleeve, 0.2, 60, 0.16, 5, 0.9),
    ...spring(limb.RightSleeve, 0.2, 60, 0.16, 5, 0.9),
    ...spring(hairBack, 0.34, 55, 0.14, 4, 0.8),
    ...spring(limb.LeftHair, 0.26, 60, 0.15, 4, 0.7),
    ...spring(limb.RightHair, 0.26, 60, 0.15, 4, 0.7),
    ...spring(ahoge, 0.09, 130, 0.08, 0, 0.9),
  ];

  return { root, bones, material, broom, springs, setFace: face.set, triangles: mb.triangles };
}
