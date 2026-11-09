import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshToonMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Scene } from 'three';
import { toonRamp } from '../art/toon';
import type { Aabb } from '../physics/aabb';

export interface World {
  colliders: Aabb[];
  sun: DirectionalLight;
  /** Luz de preenchimento que acompanha a câmera: o personagem nunca fica com o rosto no escuro. */
  fill: DirectionalLight;
  sky: Mesh;
  spawn: Vector3;
  half: number;
}

const HALF = 22;

/** Arena de testes: uma plataforma cinza, luz neutra e mais nada. O mundo de verdade vem depois. */
export function createArena(scene: Scene): World {
  scene.fog = new Fog(0xaab0bc, 40, 130);
  const hemi = new HemisphereLight(0xffffff, 0x9a9fac, 1.5);
  const sun = new DirectionalLight(0xffffff, 1.1);
  const fill = new DirectionalLight(0xffffff, 1.3);
  sun.position.set(14, 30, 18);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -14;
  sc.right = sc.top = 14;
  sc.near = 1;
  sc.far = 90;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  scene.add(hemi, sun, sun.target, fill, fill.target);

  const sky = new Mesh(
    new SphereGeometry(300, 12, 8),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new Color(0x7f8796) }, uLow: { value: new Color(0xc3c7cf) } },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uLow;
        varying float vY;
        void main() {
          gl_FragColor = vec4(mix(uLow, uTop, smoothstep(-0.1, 0.7, vY)), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // grade sutil no chão: sem ela não dá pra sentir a velocidade
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = '#9a9ea8';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#8b8f99';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
  }
  const tex = new CanvasTexture(cv);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(HALF, HALF);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const top = new MeshToonMaterial({ map: tex, gradientMap: toonRamp() });
  const side = new MeshToonMaterial({ color: 0x6f7380, gradientMap: toonRamp() });
  const platform = new Mesh(new BoxGeometry(HALF * 2, 2, HALF * 2), [
    side,
    side,
    top,
    side,
    side,
    side,
  ]);
  platform.position.y = -1;
  platform.receiveShadow = true;
  scene.add(platform);

  return { colliders: [], sun, fill, sky, spawn: new Vector3(0, 0, 6), half: HALF - 0.4 };
}
