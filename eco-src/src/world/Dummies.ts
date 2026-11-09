import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Camera, Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonRamp } from '../art/toon';
import { box, type Aabb } from '../physics/aabb';
import { newStatus, type Status } from '../spells/status';

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

const WHITE = new Color(1, 1, 1);
const WET = new Color(0.62, 0.72, 0.95);
const COLD = new Color(0.8, 0.93, 1.1);
const ICE = new MeshBasicMaterial({
  color: 0xbfeaff,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
const HALF = 21;

/**
 * Boneco de treino: tem vida, estados (queimando, molhado, frio, congelado, tonto),
 * é empurrado, levantado e puxado pelas magias, escorrega no gelo, quebra e volta.
 */
export class Dummy {
  readonly status: Status = newStatus();
  readonly radius = 0.45;
  readonly pos: Vector3;
  readonly vel = new Vector3();
  private readonly root = new Group();
  private readonly body: Mesh;
  private readonly mat: MeshToonMaterial;
  private readonly ice: Mesh;
  private readonly stars = new Group();
  private readonly bar = new Group();
  private readonly fill: Mesh;
  private readonly home: Vector3;
  private readonly collider: Aabb;
  private angle = 0;
  private spin = 0;
  private flashT = 0;
  private readonly flashColor = new Color();
  private shown = 0;
  private respawn = 0;
  /** Atrito do chão onde está (o jogo atualiza pelas zonas). */
  surface: 'gelo' | 'poca' | null = null;

  get alive(): boolean {
    return this.respawn <= 0;
  }

  constructor(
    scene: Scene,
    x: number,
    z: number,
    colliders: Aabb[],
    private readonly onBreak: (at: Vector3) => void,
  ) {
    const geo = mergeGeometries([
      tinted(new CylinderGeometry(0.42, 0.48, 0.14, 10).translate(0, 0.07, 0), 0x6f6a62),
      tinted(new CylinderGeometry(0.07, 0.09, 1.5, 6).translate(0, 0.75, 0), 0x6b4a3a),
      tinted(new BoxGeometry(1.1, 0.1, 0.1).translate(0, 1.15, 0), 0x6b4a3a),
      tinted(new CylinderGeometry(0.3, 0.22, 0.6, 7).translate(0, 0.95, 0), 0xb9b0a0),
      tinted(new BoxGeometry(0.36, 0.36, 0.36).translate(0, 1.68, 0), 0xcfc8ba),
    ]);
    this.mat = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    this.body = new Mesh(geo ?? new BoxGeometry(), this.mat);
    this.body.castShadow = true;
    this.ice = new Mesh(new BoxGeometry(1.25, 2.1, 1.25), ICE);
    this.ice.position.y = 1;
    this.ice.visible = false;
    for (let i = 0; i < 3; i++) {
      const s = new Mesh(
        new OctahedronGeometry(0.07, 0),
        new MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }),
      );
      s.position.set(
        Math.cos((i / 3) * Math.PI * 2) * 0.32,
        0,
        Math.sin((i / 3) * Math.PI * 2) * 0.32,
      );
      this.stars.add(s);
    }
    this.stars.position.y = 2.05;
    this.stars.visible = false;
    // barra de vida (só aparece depois de apanhar)
    const bg = new Mesh(
      new BoxGeometry(0.9, 0.09, 0.01),
      new MeshBasicMaterial({ color: 0x1a1226, toneMapped: false }),
    );
    this.fill = new Mesh(
      new BoxGeometry(0.86, 0.06, 0.012),
      new MeshBasicMaterial({ color: 0xff6a7a, toneMapped: false }),
    );
    this.fill.geometry.translate(0.43, 0, 0);
    this.fill.position.x = -0.43;
    this.bar.add(bg, this.fill);
    this.bar.position.y = 2.3;
    this.bar.visible = false;
    this.root.add(this.body, this.ice, this.stars, this.bar);
    this.root.position.set(x, 0, z);
    this.pos = this.root.position;
    this.home = this.pos.clone();
    scene.add(this.root);
    this.collider = box(x, z, 0.5, 0.5, 0, 1.9);
    colliders.push(this.collider);
  }

  /** Empurrão/levantada (soma na velocidade). Congelado pesa mais; tonto não resiste. */
  impulse(vx: number, vy: number, vz: number): void {
    if (!this.alive) return;
    const k = this.status.frozen > 0 ? 0.6 : 1;
    this.vel.x += vx * k;
    this.vel.y += vy * k;
    this.vel.z += vz * k;
    this.spin += Math.hypot(vx, vz) * 0.8;
  }

  flash(color: Color): void {
    this.flashT = 1;
    this.flashColor.copy(color);
    this.spin += 4 + Math.random() * 3;
    this.shown = 4;
  }

  update(dt: number, camera: Camera): void {
    const s = this.status;
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        Object.assign(s, newStatus());
        this.pos.copy(this.home);
        this.vel.set(0, 0, 0);
        this.root.visible = true;
        this.root.scale.setScalar(0.01);
      }
      return;
    }
    if (s.hp <= 0) {
      this.respawn = 3;
      this.root.visible = false;
      this.collider.minY = this.collider.maxY = -10;
      this.onBreak(this.pos.clone().setY(1));
      return;
    }
    this.root.scale.setScalar(Math.min(1, this.root.scale.x + dt * 4));

    // física simples: gravidade, atrito pelo chão, limites da arena
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      if (this.vel.y < -6) this.spin += 3;
      this.vel.y = 0;
      const grip = this.surface === 'gelo' || s.frozen > 0 ? 0.4 : this.surface === 'poca' ? 2 : 7;
      const f = Math.exp(-grip * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    if (Math.abs(this.pos.x) > HALF) this.vel.x *= -0.5;
    if (Math.abs(this.pos.z) > HALF) this.vel.z *= -0.5;
    this.pos.x = Math.max(-HALF, Math.min(HALF, this.pos.x));
    this.pos.z = Math.max(-HALF, Math.min(HALF, this.pos.z));
    const c = this.collider;
    c.minX = this.pos.x - 0.25;
    c.maxX = this.pos.x + 0.25;
    c.minZ = this.pos.z - 0.25;
    c.maxZ = this.pos.z + 0.25;
    c.minY = this.pos.y;
    c.maxY = this.pos.y + 1.9;

    // balanço de mola (parado quando congelado)
    if (s.frozen <= 0) {
      this.spin += (-this.angle * 60 - this.spin * 5) * dt;
      this.angle = Math.max(-1.6, Math.min(1.6, this.angle + this.spin * dt));
    }
    this.body.rotation.z = this.angle * 0.25;
    this.body.rotation.x = this.angle * 0.12;

    // cor pelos estados + brilho do acerto
    this.mat.color.copy(WHITE);
    if (s.wet > 0) this.mat.color.lerp(WET, 0.6);
    if (s.chill > 0) this.mat.color.lerp(COLD, Math.min(1, s.chill / 3) * 0.7);
    if (s.burning > 0) this.mat.color.multiplyScalar(0.75 + 0.2 * Math.sin(performance.now() / 60));
    this.flashT = Math.max(0, this.flashT - dt * 3);
    this.mat.emissive.copy(this.flashColor).multiplyScalar(this.flashT * 0.8);
    this.ice.visible = s.frozen > 0;
    this.stars.visible = s.stunned > 0 && s.frozen <= 0;
    this.stars.rotation.y += dt * 6;

    this.shown -= dt;
    this.bar.visible = this.shown > 0 || s.hp < s.maxHp;
    this.fill.scale.x = Math.max(0.001, s.hp / s.maxHp);
    (this.fill.material as MeshBasicMaterial).color.set(
      s.hp / s.maxHp > 0.35 ? 0x9af0b0 : 0xff6a7a,
    );
    this.bar.quaternion.copy(camera.quaternion);
  }
}
