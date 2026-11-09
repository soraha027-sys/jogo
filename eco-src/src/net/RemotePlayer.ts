import { Group } from 'three';
import { angleDelta, clamp, damp } from '../input/math';
import { Witch, type WitchFx } from '../player/witch/Witch';
import type { SnapBuffer } from './interp';
import type { Snap } from './protocol';

/** Outra bruxa na sala: posição interpolada e a mesma árvore de animação da sua. */
export class RemotePlayer {
  readonly object = new Group();
  readonly state: Snap = {
    t: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    grounded: true,
    flying: false,
    jumpCount: 0,
    lastJumpDouble: false,
    landCount: 0,
    mouth: 0,
  };
  private bank = 0;
  private lastYaw = 0;
  private ready = false;

  private constructor(readonly witch: Witch) {
    this.object.rotation.order = 'YXZ';
    this.object.add(witch.root);
    this.object.visible = false; // aparece no 1º snapshot, não na origem
  }

  static async create(fx: WitchFx): Promise<RemotePlayer> {
    return new RemotePlayer(await Witch.load(fx));
  }

  update(dt: number, now: number, buf: SnapBuffer | undefined): void {
    if (!buf?.sample(now, this.state)) return;
    const s = this.state;
    if (!this.ready) {
      // contadores de pulo/pouso começam do valor atual: não dispara pulo velho ao entrar
      this.ready = true;
      this.lastYaw = s.yaw;
      this.object.visible = true;
      this.witch.sync(s.jumpCount, s.landCount);
    }
    this.object.position.set(s.x, s.y, s.z);
    this.object.rotation.y = s.yaw;
    const turnRate = dt > 0 ? angleDelta(this.lastYaw, s.yaw) / dt : 0;
    this.lastYaw = s.yaw;
    const target = s.flying
      ? clamp(-turnRate * 0.15, -0.6, 0.6)
      : s.grounded
        ? clamp(-turnRate * s.speed * 0.012, -0.22, 0.22)
        : 0;
    this.bank += (target - this.bank) * damp(s.flying ? 5 : 8, dt);
    this.object.rotation.z = this.bank;
    this.witch.update(dt, s, s.mouth);
  }
}
