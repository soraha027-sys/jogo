import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Mesh, Vector3 } from 'three';
import type { BufferGeometry, MeshToonMaterial, Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat } from '../art/toon';
import { box, type Aabb } from '../physics/aabb';
import type { Target } from '../spells/SpellSystem';

function tinted(geo: BufferGeometry, color: number): BufferGeometry {
  const g = geo.toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const c = new Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

/** Boneco de treino: balança e brilha na cor do feitiço que acertar. */
export class Dummy implements Target {
  readonly pos: Vector3;
  readonly radius = 0.7;
  private readonly mesh: Mesh;
  private readonly mat: MeshToonMaterial;
  private angle = 0;
  private spin = 0;
  private flash = 0;

  constructor(scene: Scene, x: number, z: number, colliders: Aabb[]) {
    const geo = mergeGeometries([
      tinted(new CylinderGeometry(0.07, 0.09, 1.5, 6).translate(0, 0.75, 0), 0x6b4a3a),
      tinted(new BoxGeometry(1.1, 0.1, 0.1).translate(0, 1.15, 0), 0x6b4a3a),
      tinted(new CylinderGeometry(0.3, 0.22, 0.6, 7).translate(0, 0.95, 0), 0xb9b0a0),
      tinted(new BoxGeometry(0.36, 0.36, 0.36).translate(0, 1.68, 0), 0xcfc8ba),
    ]);
    this.mat = toonMat(0xffffff, true);
    this.mesh = new Mesh(geo ?? new BoxGeometry(), this.mat);
    this.mesh.position.set(x, 0, z);
    this.mesh.castShadow = true;
    this.pos = this.mesh.position;
    scene.add(this.mesh);
    colliders.push(box(x, z, 0.4, 0.4, 0, 1.9));
  }

  hit(color: Color): void {
    if (this.flash > 0.6) return;
    this.spin += 5 + Math.random() * 3;
    this.flash = 1;
    this.mat.emissive.copy(color);
  }

  update(dt: number): void {
    this.spin += (-this.angle * 60 - this.spin * 5) * dt; // mola amortecida
    this.angle = Math.max(-1.6, Math.min(1.6, this.angle + this.spin * dt));
    this.mesh.rotation.z = this.angle * 0.25;
    this.mesh.rotation.x = this.angle * 0.12;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.mat.emissiveIntensity = this.flash * 0.9;
  }
}
