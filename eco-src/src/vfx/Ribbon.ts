import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Vector3 } from 'three';
import type { Camera, Scene, ShaderMaterial } from 'three';

const t = new Vector3();
const side = new Vector3();
const view = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Faixa de energia que segue uma sequência de pontos (rastro, meia-lua, espiral, anel).
 * Voltada pra câmera (`flat=false`) ou deitada no plano (`flat=true`, anel no chão).
 * A largura afina na cauda; o material decide a cara (ver `ribbonMaterial`).
 */
export class Ribbon {
  readonly mesh: Mesh;
  readonly points: Vector3[] = [];
  private readonly geo = new BufferGeometry();
  private readonly pos: BufferAttribute;
  private readonly uv: BufferAttribute;
  /** Largura em cada ponto = width × taper(u) (u: 0 cauda → 1 cabeça). */
  width: number;
  taper: (u: number) => number = (u) => Math.sqrt(u);

  constructor(
    private readonly scene: Scene,
    readonly material: ShaderMaterial,
    private readonly max: number,
    width: number,
    private readonly flat = false,
  ) {
    this.width = width;
    this.pos = new BufferAttribute(new Float32Array(max * 2 * 3), 3);
    this.uv = new BufferAttribute(new Float32Array(max * 2 * 2), 2);
    this.pos.setUsage(DynamicDrawUsage);
    this.uv.setUsage(DynamicDrawUsage);
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', this.uv);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Acrescenta um ponto na cabeça (rastro); descarta os mais velhos. */
  push(p: Vector3): void {
    this.points.push(p.clone());
    if (this.points.length > this.max) this.points.shift();
  }

  /** Encolhe pela cauda (quando o emissor acabou). */
  shrink(n = 1): void {
    this.points.splice(0, n);
  }

  /** Troca todos os pontos (formas fixas: arco, espiral, anel). */
  set(points: Vector3[]): void {
    this.points.length = 0;
    for (const p of points.slice(-this.max)) this.points.push(p);
  }

  update(dt: number, camera: Camera): void {
    const u = this.material.uniforms.uTime;
    if (u) u.value += dt;
    const n = this.points.length;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    if (n < 2) return;
    const P = this.pos.array as Float32Array;
    const UV = this.uv.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = this.points[i] as Vector3;
      const a = this.points[Math.max(0, i - 1)] as Vector3;
      const b = this.points[Math.min(n - 1, i + 1)] as Vector3;
      t.subVectors(b, a);
      if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
      t.normalize();
      if (this.flat) side.crossVectors(t, UP);
      else side.crossVectors(t, view.subVectors(camera.position, p).normalize());
      if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
      side.normalize();
      const k = i / (n - 1);
      const w = (this.width * this.taper(k)) / 2;
      P.set(
        [
          p.x + side.x * w,
          p.y + side.y * w,
          p.z + side.z * w,
          p.x - side.x * w,
          p.y - side.y * w,
          p.z - side.z * w,
        ],
        i * 6,
      );
      UV.set([k, 0, k, 1], i * 4);
    }
    this.pos.needsUpdate = true;
    this.uv.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  set dissolve(v: number) {
    const d = this.material.uniforms.uDissolve;
    if (d) d.value = v;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.material.dispose();
  }
}
