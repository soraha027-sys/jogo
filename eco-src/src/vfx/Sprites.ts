import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

/** Desenho do sprite (no fragment shader). */
export const Shape = {
  soft: 0,
  flame: 1,
  streak: 2,
  sparkle: 3,
  drop: 4,
  ring: 5,
  void: 6,
} as const;
export type ShapeId = (typeof Shape)[keyof typeof Shape];

export interface SpriteSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Tamanho no fim (multiplica `size`). */
  grow?: number;
  color: Color;
  /** Cor no fim da vida. */
  color2?: Color;
  alpha?: number;
  shape: ShapeId;
  gravity?: number;
  drag?: number;
  /** Estica na direção do movimento (rastros, gotas). */
  stretch?: number;
  spin?: number;
  /** Puxa pra um centro (vazio) ou gira em volta dele (vento). */
  pull?: number;
  swirl?: number;
  cx?: number;
  cy?: number;
  cz?: number;
  /** Tremida de tamanho (chama). */
  flicker?: number;
  /** Quica no chão (gotas). */
  floor?: boolean;
}

interface S {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  r2: number;
  g2: number;
  b2: number;
  alpha: number;
  shape: number;
  gravity: number;
  drag: number;
  stretch: number;
  rot: number;
  spin: number;
  pull: number;
  swirl: number;
  cx: number;
  cy: number;
  cz: number;
  flicker: number;
  floor: boolean;
  seed: number;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iColor;
  attribute vec4 iMisc; // size, rot, shape, stretch
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vShape;
  void main() {
    vUv = position.xy;
    vColor = iColor;
    vShape = iMisc.z;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float size = iMisc.x;
    vec2 corner = position.xy;
    if (iMisc.w > 0.0) {
      // alinha com a velocidade vista da câmera e estica
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      float sp = length(vv.xy);
      vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
      vec2 side = vec2(-dir.y, dir.x);
      float len = 1.0 + iMisc.w * min(sp, 25.0) * 0.12;
      mv.xy += (side * corner.x + dir * corner.y * len) * size;
    } else {
      float c = cos(iMisc.y), s = sin(iMisc.y);
      mv.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
    }
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vShape;
  void main() {
    vec2 p = vUv * 2.0;
    float d = length(p);
    float a = 0.0;
    vec3 col = vColor.rgb;
    int s = int(vShape + 0.5);
    if (s == 0) a = exp(-d * d * 3.2);                                   // névoa macia
    else if (s == 1) {                                                   // língua de fogo, borda dura em 3 tons
      vec2 q = vec2(p.x * (1.0 + max(0.0, p.y) * 1.4), p.y * 0.85 + 0.15);
      float l = length(q);
      a = smoothstep(1.0, 0.94, l);
      col = l < 0.42 ? vec3(1.0, 0.96, 0.78) : (l < 0.74 ? col : col * vec3(0.95, 0.45, 0.3));
    }
    else if (s == 2) a = exp(-p.x * p.x * 9.0) * smoothstep(1.0, 0.2, abs(p.y)); // risco de vento
    else if (s == 3) {                                                   // brilho de 4 pontas
      float cross = exp(-abs(p.x) * 9.0) * exp(-abs(p.y) * 1.6) + exp(-abs(p.y) * 9.0) * exp(-abs(p.x) * 1.6);
      a = clamp(cross + exp(-d * d * 10.0), 0.0, 1.0);
    }
    else if (s == 4) {                                                   // gota com reflexo
      a = smoothstep(1.0, 0.75, d);
      col = mix(col * 0.75, vec3(1.0), smoothstep(0.35, 0.0, length(p - vec2(-0.3, 0.35))));
    }
    else if (s == 5) a = smoothstep(0.18, 0.0, abs(d - 0.8)) * smoothstep(1.0, 0.9, d); // anel
    else {                                                               // vazio: miolo escuro, borda acesa
      a = smoothstep(1.0, 0.8, d);
      col = mix(vec3(0.03, 0.0, 0.06), col * 1.6, smoothstep(0.45, 0.95, d));
    }
    a *= vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

/**
 * Sprites voltados pra câmera, com 7 desenhos no shader (névoa, chama, risco, brilho, gota, anel, vazio).
 * Um draw call por pool. A física é simples e roda na CPU; só os vivos vão pra GPU.
 */
export class SpritePool {
  readonly mesh: Mesh;
  private readonly items: S[] = [];
  private readonly geo: InstancedBufferGeometry;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aVel: InstancedBufferAttribute;
  private readonly aColor: InstancedBufferAttribute;
  private readonly aMisc: InstancedBufferAttribute;

  constructor(
    private readonly capacity: number,
    additive: boolean,
  ) {
    const quad = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    const attr = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.aPos = attr(3);
    this.aVel = attr(3);
    this.aColor = attr(4);
    this.aMisc = attr(4);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iVel', this.aVel);
    this.geo.setAttribute('iColor', this.aColor);
    this.geo.setAttribute('iMisc', this.aMisc);
    this.geo.instanceCount = 0;
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
  }

  get count(): number {
    return this.items.length;
  }

  emit(o: SpriteSpec): void {
    if (this.items.length >= this.capacity) this.items.shift();
    const c2 = o.color2 ?? o.color;
    this.items.push({
      x: o.x,
      y: o.y,
      z: o.z,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vz: o.vz ?? 0,
      age: 0,
      life: o.life,
      size: o.size,
      grow: o.grow ?? 1,
      r: o.color.r,
      g: o.color.g,
      b: o.color.b,
      r2: c2.r,
      g2: c2.g,
      b2: c2.b,
      alpha: o.alpha ?? 1,
      shape: o.shape,
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
      stretch: o.stretch ?? 0,
      rot: Math.random() * Math.PI * 2,
      spin: o.spin ?? 0,
      pull: o.pull ?? 0,
      swirl: o.swirl ?? 0,
      cx: o.cx ?? o.x,
      cy: o.cy ?? o.y,
      cz: o.cz ?? o.z,
      flicker: o.flicker ?? 0,
      floor: o.floor ?? false,
      seed: Math.random() * 100,
    });
  }

  update(dt: number): void {
    let n = 0;
    const P = this.aPos.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    const C = this.aColor.array as Float32Array;
    const M = this.aMisc.array as Float32Array;
    for (let i = 0; i < this.items.length; i++) {
      const s = this.items[i];
      if (!s) continue;
      s.age += dt;
      if (s.age >= s.life) continue;
      if (s.swirl) {
        const dx = s.x - s.cx;
        const dz = s.z - s.cz;
        s.vx -= dz * s.swirl * dt;
        s.vz += dx * s.swirl * dt;
      }
      if (s.pull) {
        s.vx += (s.cx - s.x) * s.pull * dt;
        s.vy += (s.cy - s.y) * s.pull * dt;
        s.vz += (s.cz - s.z) * s.pull * dt;
      }
      s.vy -= s.gravity * dt;
      const f = Math.exp(-s.drag * dt);
      s.vx *= f;
      s.vy *= f;
      s.vz *= f;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.floor && s.y < 0.03 && s.vy < 0) {
        s.y = 0.03;
        s.vy *= -0.25;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      s.rot += s.spin * dt;
      const k = s.age / s.life;
      const fadeIn = Math.min(1, s.age * 18);
      const fadeOut = 1 - k * k;
      let size = s.size * (1 + (s.grow - 1) * k);
      if (s.flicker) size *= 1 + s.flicker * Math.sin(s.age * 40 + s.seed);
      P[n * 3] = s.x;
      P[n * 3 + 1] = s.y;
      P[n * 3 + 2] = s.z;
      V[n * 3] = s.vx;
      V[n * 3 + 1] = s.vy;
      V[n * 3 + 2] = s.vz;
      C[n * 4] = s.r + (s.r2 - s.r) * k;
      C[n * 4 + 1] = s.g + (s.g2 - s.g) * k;
      C[n * 4 + 2] = s.b + (s.b2 - s.b) * k;
      C[n * 4 + 3] = s.alpha * fadeIn * fadeOut;
      M[n * 4] = size;
      M[n * 4 + 1] = s.rot;
      M[n * 4 + 2] = s.shape;
      M[n * 4 + 3] = s.stretch;
      this.items[n] = s;
      n++;
    }
    this.items.length = n;
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aVel, this.aColor, this.aMisc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
