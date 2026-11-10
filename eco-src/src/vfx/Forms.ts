import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  OctahedronGeometry,
  RingGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Object3D, Scene } from 'three';
import { toonRamp } from '../art/toon';

/** Cor de energia de cada raiz (funil, anel, coluna, jato). */
export const ENERGY: Record<string, Color> = {
  pir: new Color(0xff7a1e),
  vent: new Color(0xbff7e2),
  gel: new Color(0x9fe2ff),
  lav: new Color(0x3d8bff),
  ter: new Color(0xc8b08a),
  kor: new Color(0xa05cff),
};

/** Material de energia: listras que correm, borda que some, aditivo. Uma instância por forma viva. */
function energy(color: Color, opacity: number, speed: number, stripes: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uStripes: { value: stripes },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uOpacity, uSpeed, uStripes;
      varying vec2 vUv;
      void main() {
        float band = 0.5 + 0.5 * sin((vUv.x * uStripes + vUv.y * 3.0 - uTime * uSpeed) * 6.2831);
        band = pow(band, 3.0);
        float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = (0.25 + 0.75 * band) * edge * uOpacity;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), band * 0.35), a);
        #include <colorspace_fragment>
      }`,
  });
}

export interface FormFx {
  object: Object3D;
  update(dt: number): void;
  setOpacity(k: number): void;
  dispose(): void;
}

function wrap(
  scene: Scene,
  object: Object3D,
  mats: ShaderMaterial[],
  geos: BufferGeometry[],
  spin = 0,
): FormFx {
  scene.add(object);
  return {
    object,
    update: (dt) => {
      for (const m of mats) if (m.uniforms.uTime) m.uniforms.uTime.value += dt;
      object.rotation.y += spin * dt;
    },
    setOpacity: (k) => {
      for (const m of mats) if (m.uniforms.uOpacity) m.uniforms.uOpacity.value = k;
    },
    dispose: () => {
      scene.remove(object);
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
    },
  };
}

/** Funil do vórtice: dois cones abertos girando em sentidos opostos. */
export function funnel(scene: Scene, root: string, height: number, radius: number): FormFx {
  const col = ENERGY[root] ?? new Color(0xffffff);
  const g1 = new CylinderGeometry(radius, radius * 0.18, height, 24, 1, true).translate(
    0,
    height / 2,
    0,
  );
  const g2 = new CylinderGeometry(
    radius * 0.75,
    radius * 0.12,
    height * 0.9,
    24,
    1,
    true,
  ).translate(0, height * 0.45, 0);
  const m1 = energy(col, 0.55, 1.6, 5);
  const m2 = energy(col, 0.4, -2.3, 3);
  const o = new Group();
  o.add(new Mesh(g1, m1), new Mesh(g2, m2));
  return wrap(scene, o, [m1, m2], [g1, g2], 5);
}

/** Anel da onda, deitado no chão. */
export function ring(scene: Scene, root: string): FormFx {
  const col = ENERGY[root] ?? new Color(0xffffff);
  const g = new RingGeometry(0.82, 1, 48, 1).rotateX(-Math.PI / 2);
  const m = energy(col, 0.9, 3, 12);
  const mesh = new Mesh(g, m);
  mesh.position.y = 0.15;
  return wrap(scene, mesh, [m], [g]);
}

/** Coluna de energia (pilar que não é sólido: fogo, água, vento, vazio). */
export function column(scene: Scene, root: string, height: number, radius: number): FormFx {
  const col = ENERGY[root] ?? new Color(0xffffff);
  const g = new CylinderGeometry(radius * 0.8, radius, height, 20, 1, true).translate(
    0,
    height / 2,
    0,
  );
  const m = energy(col, 0.75, 2.2, 6);
  return wrap(scene, new Mesh(g, m), [m], [g], 2);
}

/** Cone do jato, apontado na direção do disparo. */
export function stream(
  scene: Scene,
  root: string,
  from: Vector3,
  to: Vector3,
  radius: number,
): FormFx {
  const col = ENERGY[root] ?? new Color(0xffffff);
  const len = from.distanceTo(to);
  const g = new CylinderGeometry(radius, radius * 0.15, len, 16, 1, true)
    .rotateX(Math.PI / 2)
    .translate(0, 0, len / 2);
  const m = energy(col, 0.65, 4, 4);
  const mesh = new Mesh(g, m);
  mesh.position.copy(from);
  mesh.lookAt(to);
  return wrap(scene, mesh, [m], [g]);
}

/**
 * Cabeça visível do projétil (a raiz dominante decide):
 * gelo = lança de cristal · pedra = pedregulho girando · água = bolha que treme ·
 * vento = lâmina em meia-lua. Fogo e matéria são só luz (vêm das partículas).
 */
export function head(scene: Scene, root: string, scale: number): FormFx | null {
  const toon = (hex: number, opacity = 1): MeshToonMaterial =>
    new MeshToonMaterial({
      color: hex,
      gradientMap: toonRamp(),
      transparent: opacity < 1,
      opacity,
      emissive: hex,
      emissiveIntensity: 0.25,
    });
  let mesh: Mesh;
  let geo: BufferGeometry;
  let spinAxis = new Vector3(1, 0, 0);
  let wobble = false;
  if (root === 'gel') {
    geo = new OctahedronGeometry(0.5, 0).scale(0.32, 1.6, 0.32).rotateX(Math.PI / 2);
    mesh = new Mesh(geo, toon(0xbfeeff, 0.85));
    spinAxis = new Vector3(0, 0, 1);
  } else if (root === 'ter') {
    geo = new DodecahedronGeometry(0.45, 0);
    mesh = new Mesh(geo, toon(0x8a7765));
  } else if (root === 'lav') {
    geo = new IcosahedronGeometry(0.42, 1);
    mesh = new Mesh(geo, toon(0x4a98ff, 0.7));
    wobble = true;
  } else if (root === 'vent') {
    geo = new TorusGeometry(0.5, 0.06, 4, 18, Math.PI).rotateX(Math.PI / 2);
    const m = energy(ENERGY.vent ?? new Color(0xffffff), 1, 3, 2);
    mesh = new Mesh(geo, m);
    spinAxis = new Vector3(0, 1, 0);
  } else return null;
  mesh.scale.setScalar(scale);
  mesh.castShadow = root === 'ter';
  scene.add(mesh);
  let t = 0;
  const base = scale;
  return {
    object: mesh,
    update: (dt) => {
      t += dt;
      if (root === 'gel') mesh.rotateOnAxis(spinAxis, dt * 10);
      else if (root === 'ter') mesh.rotateOnAxis(spinAxis, dt * 12);
      else if (root === 'vent') mesh.rotateOnAxis(spinAxis, dt * 20);
      if (wobble)
        mesh.scale.set(
          base * (1 + Math.sin(t * 22) * 0.12),
          base * (1 - Math.sin(t * 22) * 0.12),
          base,
        );
    },
    setOpacity: () => undefined,
    dispose: () => {
      scene.remove(mesh);
      geo.dispose();
      (mesh.material as MeshToonMaterial).dispose();
    },
  };
}

/** Cone (usado pelo cristal de gelo sólido). */
export function iceCluster(radius: number, height: number): Group {
  const g = new Group();
  const mat = new MeshToonMaterial({
    color: 0xbfeeff,
    gradientMap: toonRamp(),
    transparent: true,
    opacity: 0.82,
    emissive: 0x4aa8ff,
    emissiveIntensity: 0.15,
  });
  const spikes: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [0.55, 0.2, 0.6, 0.55],
    [-0.5, 0.35, 0.65, 0.5],
    [0.1, -0.6, 0.55, 0.5],
    [-0.35, -0.45, 0.45, 0.4],
  ];
  for (const [x, z, h, r] of spikes) {
    const geo = new ConeGeometry(radius * r, height * h, 6).translate(0, (height * h) / 2, 0);
    const m = new Mesh(geo, mat);
    m.position.set(x * radius, 0, z * radius);
    m.rotation.set(z * 0.25, 0, -x * 0.25);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
