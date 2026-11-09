import { Group, Vector3 } from 'three';
import type { Events, GameEvents } from '../core/Events';
import { angleDelta, clamp, damp } from '../input/math';
import type { InputFrame } from '../input/types';
import { resolveCircle, type Aabb } from '../physics/aabb';

const R = 0.3;
const HEIGHT = 1.75;
const STEP = 0.35;
const WALK = 2.6;
const RUN = 7.2;
const GRAVITY = 28;
const JUMP = 9.6;
const JUMP2 = 8.6;
const COYOTE = 0.1;
const BUFFER = 0.12;
const FLY = 12;
const FLY_BOOST = 21;

/** Controlador cinemático (física própria até o Rapier entrar). O visual é o que for posto em `object`. */
export class Player {
  readonly object = new Group();
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly renderPos = new Vector3();
  private readonly prev = new Vector3();
  private facing = Math.PI;
  private prevFacing = Math.PI;
  private faceLock = 0;
  private coyote = 0;
  private buffer = 0;
  private airJumps = 1;
  private bank = 0;
  grounded = true;
  flying = false;
  /** Contadores pra máquina de animação reagir a eventos sem acoplar. */
  jumpCount = 0;
  lastJumpDouble = false;
  landCount = 0;

  constructor(
    spawn: Vector3,
    private readonly half: number,
    private readonly events: Events<GameEvents>,
  ) {
    this.object.rotation.order = 'YXZ';
    this.pos.copy(spawn);
    this.prev.copy(spawn);
  }

  /** Direção pra onde o corpo aponta (0 = +Z). */
  get yaw(): number {
    return this.facing;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  setFlying(on: boolean): void {
    if (this.flying === on) return;
    this.flying = on;
    if (on) this.vel.y = Math.max(this.vel.y, 5);
    this.events.emit('fly:changed', on);
  }

  /** Empurrão (explosão de feitiço). */
  knock(x: number, y: number, z: number): void {
    this.vel.set(x, y, z);
    this.grounded = false;
  }

  /** Vira pra uma direção e segura um instante (mirar o feitiço). */
  face(yaw: number, hold = 0.7): void {
    this.facing = yaw;
    this.faceLock = hold;
  }

  fixedUpdate(
    dt: number,
    inp: InputFrame,
    yaw: number,
    pitch: number,
    boxes: readonly Aabb[],
  ): void {
    const { pos, vel } = this;
    this.prev.copy(pos);
    this.prevFacing = this.facing;
    if (inp.flyPressed) this.setFlying(!this.flying);

    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    if (this.flying) {
      const speed = inp.sprint ? FLY_BOOST : FLY;
      const cp = Math.cos(pitch);
      const k = damp(3.5, dt);
      vel.x += ((-sy * cp * inp.moveY + cy * inp.moveX) * speed - vel.x) * k;
      vel.z += ((-cy * cp * inp.moveY - sy * inp.moveX) * speed - vel.z) * k;
      vel.y += (-Math.sin(pitch) * inp.moveY * speed + (inp.jump ? 7 : 0) - vel.y) * k;
    } else {
      const speed = inp.sprint ? RUN : WALK;
      const k = damp(this.grounded ? 14 : 4, dt);
      vel.x += ((-sy * inp.moveY + cy * inp.moveX) * speed - vel.x) * k;
      vel.z += ((-cy * inp.moveY - sy * inp.moveX) * speed - vel.z) * k;
      vel.y -= GRAVITY * dt;
      this.coyote = this.grounded ? COYOTE : this.coyote - dt;
      this.buffer = inp.jumpPressed ? BUFFER : this.buffer - dt;
      if (this.buffer > 0 && this.coyote > 0) {
        vel.y = JUMP;
        this.coyote = this.buffer = 0;
        this.jumpCount++;
        this.lastJumpDouble = false;
      } else if (inp.jumpPressed && this.airJumps > 0) {
        vel.y = JUMP2;
        this.airJumps--;
        this.buffer = 0;
        this.jumpCount++;
        this.lastJumpDouble = true;
      }
    }

    // horizontal
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    for (const b of boxes)
      if (pos.y < b.maxY - STEP && pos.y + HEIGHT > b.minY) resolveCircle(pos, R, b);
    pos.x = clamp(pos.x, -this.half, this.half);
    pos.z = clamp(pos.z, -this.half, this.half);

    // vertical: chão, topo de caixas e teto
    const oldY = pos.y;
    const fallSpeed = vel.y;
    pos.y += vel.y * dt;
    let floor = 0;
    const e = R * 0.5;
    for (const b of boxes) {
      if (pos.x < b.minX - e || pos.x > b.maxX + e || pos.z < b.minZ - e || pos.z > b.maxZ + e)
        continue;
      if (b.maxY <= oldY + STEP) floor = Math.max(floor, b.maxY);
      else if (vel.y > 0 && oldY + HEIGHT <= b.minY && pos.y + HEIGHT > b.minY) {
        pos.y = b.minY - HEIGHT;
        vel.y = 0;
      }
    }
    const was = this.grounded;
    this.grounded = pos.y <= floor && vel.y <= 0;
    if (this.grounded) {
      pos.y = floor;
      vel.y = 0;
      this.airJumps = 1;
      if (!was && fallSpeed < -6) this.landCount++;
    }

    this.faceLock -= dt;
    if (this.faceLock <= 0 && this.speed > 0.6)
      this.facing += angleDelta(this.facing, Math.atan2(vel.x, vel.z)) * damp(12, dt);
  }

  /** Interpola entre os dois últimos passos fixos; em voo inclina nas curvas. */
  render(alpha: number, dt: number): void {
    this.renderPos.lerpVectors(this.prev, this.pos, alpha);
    this.object.position.copy(this.renderPos);
    const turn = angleDelta(this.prevFacing, this.facing);
    this.object.rotation.y = this.prevFacing + turn * alpha;
    // inclina pra dentro da curva: forte na vassoura, de leve correndo no chão
    const turnRate = turn * 60;
    const target = this.flying
      ? clamp(-turnRate * 0.15, -0.6, 0.6)
      : this.grounded
        ? clamp(-turnRate * this.speed * 0.012, -0.22, 0.22)
        : 0;
    this.bank += (target - this.bank) * damp(this.flying ? 5 : 8, dt);
    this.object.rotation.z = this.bank;
  }
}
