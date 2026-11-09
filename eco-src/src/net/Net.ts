import { SnapBuffer } from './interp';
import { decodeCast, decodeSnap, electHost, encodeSnap, type CastMsg, type Snap } from './protocol';
import type { Transport, Wire } from './transport';

export const SNAP_HZ = 15;
export const MAX_PLAYERS = 8;

export interface NetHandlers {
  join(id: string): void;
  leave(id: string): void;
  cast(id: string, msg: CastMsg): void;
}

/**
 * Sessão multiplayer: presença, snapshots a 15 Hz com buffer de interpolação por par,
 * eventos de magia e eleição de anfitrião (menor id; troca sozinho se ele sair).
 * A própria bruxa é sempre local (resposta imediata); só os outros são interpolados.
 */
export class Net {
  readonly buffers = new Map<string, SnapBuffer>();
  host: string;
  ping: number | null = null;
  /** Sala cheia: este cliente fica só olhando a própria tela (não manda nada). */
  full = false;
  private acc = 0;
  private pingIn = 1;

  constructor(
    private readonly t: Transport,
    h: NetHandlers,
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    this.host = t.selfId;
    t.onJoin((p) => {
      if (this.buffers.has(p)) return;
      if (this.buffers.size >= MAX_PLAYERS - 1) return; // além de 8, ignora quem chega
      this.buffers.set(p, new SnapBuffer());
      this.elect();
      h.join(p);
    });
    t.onLeave((p) => {
      if (!this.buffers.delete(p)) return;
      this.elect();
      h.leave(p);
    });
    t.on('s', (d, from) => {
      const s = decodeSnap(d);
      if (s) this.buffers.get(from)?.push(s, this.clock());
    });
    t.on('c', (d, from) => {
      const c = decodeCast(d);
      if (c && this.buffers.has(from)) h.cast(from, c);
    });
  }

  get selfId(): string {
    return this.t.selfId;
  }

  get kind(): string {
    return this.t.kind;
  }

  get isHost(): boolean {
    return this.host === this.t.selfId;
  }

  get count(): number {
    return this.buffers.size + 1;
  }

  private elect(): void {
    this.host = electHost(this.t.selfId, this.buffers.keys());
  }

  /** Chamar todo quadro com o estado da própria bruxa; manda a 15 Hz. */
  update(dt: number, self: Omit<Snap, 't'>): void {
    this.acc += dt;
    if (this.acc >= 1 / SNAP_HZ) {
      this.acc %= 1 / SNAP_HZ;
      if (this.buffers.size) this.t.send('s', encodeSnap({ ...self, t: this.clock() }));
    }
    this.pingIn -= dt;
    if (this.pingIn <= 0) {
      this.pingIn = 2;
      const target = this.isHost ? this.buffers.keys().next().value : this.host;
      if (target)
        void this.t
          .ping(target)
          .then((ms) => (this.ping = Math.round(ms)))
          .catch(() => undefined);
      else this.ping = null;
    }
  }

  sendCast(msg: CastMsg): void {
    if (this.buffers.size) this.t.send('c', msg as unknown as Wire);
  }

  leave(): void {
    this.t.leave();
  }
}
