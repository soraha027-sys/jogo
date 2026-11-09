import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp } from '../input/math';
import { rayAabb, type Aabb } from '../physics/aabb';

const SKIN = 0.3;
const GROUND_CLEAR = 0.25;

/** Terceira pessoa com órbita, suavização, colisão e modo voo (recua, abre o FOV e inclina). */
export class ThirdPersonCamera {
  readonly camera = new PerspectiveCamera(60, 1, 0.1, 600);
  yaw = 0;
  pitch = 0.2;
  /** Distância desejada no chão. */
  distance = 3.4;
  private readonly pivot = new Vector3();
  private dist = 3.4;
  private roll = 0;
  private started = false;
  private shakeAmount = 0;
  private dip = 0;

  /** Afunda a câmera um instante (pouso, recuo de feitiço). */
  kick(amount: number): void {
    this.dip = Math.max(this.dip, amount);
  }

  /** Tremor de câmera (explosão de feitiço errado). */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  update(
    dt: number,
    lookX: number,
    lookY: number,
    target: Vector3,
    flying: boolean,
    boxes: readonly Aabb[],
    speed = 0,
  ): void {
    this.yaw -= lookX;
    this.pitch = clamp(this.pitch + lookY, -1.15, 1.35);

    this.dip *= Math.exp(-9 * dt);
    const head = (flying ? 1.0 : 1.2) - this.dip;
    if (!this.started) {
      this.pivot.set(target.x, target.y + head, target.z);
      this.started = true;
    } else {
      const k = damp(flying ? 11 : 20, dt);
      this.pivot.x += (target.x - this.pivot.x) * k;
      this.pivot.y += (target.y + head - this.pivot.y) * k;
      this.pivot.z += (target.z - this.pivot.z) * k;
    }
    const p = this.pivot;
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * cp;

    const want = (flying ? 6 : this.distance) + SKIN;
    let free = want;
    for (const b of boxes) free = rayAabb(p.x, p.y, p.z, dx, dy, dz, b, free);
    if (dy < 0) free = Math.min(free, Math.max(0, (GROUND_CLEAR - p.y) / dy));
    const allowed = Math.max(0.6, free - SKIN);
    this.dist = allowed < this.dist ? allowed : this.dist + (allowed - this.dist) * damp(5, dt);

    const cam = this.camera;
    cam.position.set(p.x + dx * this.dist, p.y + dy * this.dist, p.z + dz * this.dist);
    cam.lookAt(p);
    if (this.shakeAmount > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmount;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= Math.exp(-6 * dt);
    }
    const bank = flying && dt > 0 ? clamp((-lookX / dt) * 0.07, -0.32, 0.32) : 0;
    this.roll += (bank - this.roll) * damp(4, dt);
    cam.rotateZ(this.roll);

    const wantFov = flying ? 72 : 58 + Math.min(1, speed / 8) * 6; // abre um pouco ao correr
    const fov = cam.fov + (wantFov - cam.fov) * damp(4, dt);
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
