import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, Vector3, type Camera } from 'three';
import type { RemotePlayer } from '../net/RemotePlayer';
import type { Player } from '../player/Player';
import type { Target } from '../spells/SpellSystem';
import { newStatus, type Status } from '../spells/status';

/** Segundos derrubada antes de reaparecer. */
export const DOWN_SECONDS = 3;

/**
 * A própria bruxa como alvo. No PvP cada um é dono da própria vida:
 * as magias dos outros são recalculadas aqui e o dano que sai daqui é o que vale.
 */
export class LocalFighter implements Target {
  readonly owner = 'me';
  readonly radius = 0.4;
  status: Status = newStatus();
  private down = 0;

  constructor(
    private readonly player: Player,
    private readonly onFlash: (c: Color) => void,
  ) {}

  get pos(): Vector3 {
    return this.player.pos;
  }
  get alive(): boolean {
    return this.down <= 0;
  }
  /** Segundos até reaparecer (0 = de pé). */
  get downLeft(): number {
    return this.down;
  }
  /** Não anda nem lança: congelada, presa ou derrubada. */
  get held(): boolean {
    return this.down > 0 || this.status.stunned > 0 || this.status.frozen > 0;
  }
  get hp01(): number {
    return this.down > 0 ? 0 : this.status.hp / this.status.maxHp;
  }

  impulse(vx: number, vy: number, vz: number): void {
    if (this.down <= 0) this.player.impulse({ x: vx, y: vy, z: vz });
  }
  flash(color: Color): void {
    this.onFlash(color);
  }

  /** Devolve 'down' no quadro em que cai e 'up' no que reaparece. */
  update(dt: number): 'down' | 'up' | null {
    if (this.down > 0) {
      this.down -= dt;
      if (this.down > 0) return null;
      this.down = 0;
      this.status = newStatus();
      return 'up';
    }
    if (this.status.hp > 0) return null;
    this.down = DOWN_SECONDS;
    return 'down';
  }
}

/**
 * Outra bruxa como alvo aqui. A magia acerta e mostra estado/números,
 * mas a vida que aparece é a que o dono dela manda pela rede.
 */
export class RemoteFighter implements Target {
  readonly radius = 0.4;
  readonly pos = new Vector3();
  readonly status: Status = newStatus();
  private readonly bar = new Group();
  private readonly fill: Mesh;
  private readonly fillMat = new MeshBasicMaterial({ color: 0x9af0b0, toneMapped: false });
  private flashT = 0;

  constructor(
    readonly owner: string,
    private readonly remote: RemotePlayer,
  ) {
    const bg = new Mesh(
      new BoxGeometry(0.8, 0.08, 0.01),
      new MeshBasicMaterial({ color: 0x1a1226, toneMapped: false }),
    );
    this.fill = new Mesh(new BoxGeometry(0.76, 0.055, 0.012), this.fillMat);
    this.fill.geometry.translate(0.38, 0, 0);
    this.fill.position.x = -0.38;
    this.bar.add(bg, this.fill);
    this.bar.position.y = 2.05;
    remote.object.add(this.bar);
  }

  get alive(): boolean {
    return this.remote.object.visible && this.remote.state.hp > 0;
  }

  /** Quem empurra é o dono dela (lá ela recebe o mesmo golpe). */
  impulse(): void {
    /* nada aqui */
  }
  flash(): void {
    this.flashT = 0.15;
  }

  update(dt: number, camera: Camera): void {
    const s = this.remote.state;
    this.pos.set(s.x, s.y, s.z);
    this.status.hp = s.hp * this.status.maxHp;
    this.remote.witch.root.visible = s.hp > 0; // derrubada some até reaparecer
    // colada na câmera ela tamparia a tela
    this.bar.visible = s.hp > 0 && camera.position.distanceTo(this.pos) > 2.6;
    this.fill.scale.x = Math.max(0.001, s.hp);
    this.flashT -= dt;
    this.fillMat.color.set(this.flashT > 0 ? 0xffffff : s.hp > 0.35 ? 0x9af0b0 : 0xff6a7a);
    // a barra fica de frente pra câmera mesmo com o corpo girando
    this.bar.quaternion
      .copy(camera.quaternion)
      .premultiply(this.remote.object.quaternion.clone().invert());
  }
}
