import { angleDelta } from '../input/math';
import type { Snap } from './protocol';

/** Atraso de exibição: com snapshots a 15 Hz, 100 ms garante quase sempre dois pontos pra interpolar. */
export const DELAY = 0.1;
const KEEP = 24;

/**
 * Buffer de snapshots de um jogador remoto. Converte o relógio dele pro nosso
 * (offset suavizado, que se ajusta rápido pra baixo e devagar pra cima, filtrando picos de rede)
 * e entrega o estado interpolado em "agora − DELAY".
 */
export class SnapBuffer {
  private readonly snaps: Snap[] = [];
  private offset = Number.NaN;

  push(s: Snap, localNow: number): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) return; // chegou fora de ordem ou repetido
    const o = localNow - s.t;
    if (Number.isNaN(this.offset) || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.02;
    this.snaps.push(s);
    if (this.snaps.length > KEEP) this.snaps.shift();
  }

  get size(): number {
    return this.snaps.length;
  }

  /** Escreve em `out` o estado em `localNow − DELAY`. Retorna false se ainda não há dados. */
  sample(localNow: number, out: Snap): boolean {
    const first = this.snaps[0];
    if (!first) return false;
    const t = localNow - this.offset - DELAY;
    let a = first;
    let b = first;
    for (let i = 1; i < this.snaps.length; i++) {
      const s = this.snaps[i];
      if (!s) break;
      b = s;
      if (s.t >= t) break;
      a = s;
    }
    if (b.t <= t || a === b) {
      // sem snapshot mais novo: extrapola pouco (até 150 ms) e para
      const s = this.snaps[this.snaps.length - 1] ?? first;
      Object.assign(out, s);
      return true;
    }
    const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    out.t = t;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * k;
    out.speed = a.speed + (b.speed - a.speed) * k;
    out.mouth = a.mouth + (b.mouth - a.mouth) * k;
    // estados discretos e contadores vêm do mais recente já alcançado
    const d = k < 0.5 ? a : b;
    out.grounded = d.grounded;
    out.flying = d.flying;
    out.jumpCount = d.jumpCount;
    out.landCount = d.landCount;
    out.lastJumpDouble = d.lastJumpDouble;
    out.hp = b.hp;
    return true;
  }
}
