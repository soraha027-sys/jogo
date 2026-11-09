/** Dado que passa pela rede (JSON). */
export type Wire = null | boolean | number | string | Wire[] | { [k: string]: Wire };

/** O mínimo que o jogo precisa de uma conexão P2P. Trystero no jogo; BroadcastChannel pra testar abas locais. */
export interface Transport {
  readonly selfId: string;
  readonly kind: string;
  send(channel: string, data: Wire, to?: string): void;
  on(channel: string, fn: (data: unknown, from: string) => void): void;
  onJoin(fn: (peer: string) => void): void;
  onLeave(fn: (peer: string) => void): void;
  ping(peer: string): Promise<number>;
  leave(): void;
}

/**
 * Sala pelo Trystero sobre relés Nostr públicos: sem servidor nosso.
 * Os relés só apresentam os pares; o jogo em si vai direto de navegador pra navegador (WebRTC).
 */
export async function trysteroTransport(appId: string, room: string): Promise<Transport> {
  const { joinRoom, selfId } = await import('trystero');
  const r = joinRoom({ appId }, room);
  const senders = new Map<string, (d: Wire, to?: string) => void>();
  const action = (ch: string): ((d: Wire, to?: string) => void) => {
    let s = senders.get(ch);
    if (!s) {
      const a = r.makeAction<Wire>(ch);
      s = (d, to) => void a.send(d, to ? { target: to } : undefined).catch(() => undefined);
      senders.set(ch, s);
      a.onMessage = (data, ctx) => listeners.get(ch)?.forEach((fn) => fn(data, ctx.peerId));
    }
    return s;
  };
  const listeners = new Map<string, ((d: unknown, from: string) => void)[]>();
  const joins: ((p: string) => void)[] = [];
  const leaves: ((p: string) => void)[] = [];
  r.onPeerJoin = (p) => joins.forEach((fn) => fn(p));
  r.onPeerLeave = (p) => leaves.forEach((fn) => fn(p));
  return {
    selfId,
    kind: 'online',
    send: (ch, d, to) => action(ch)(d, to),
    on: (ch, fn) => {
      action(ch);
      listeners.set(ch, [...(listeners.get(ch) ?? []), fn]);
    },
    onJoin: (fn) => joins.push(fn),
    onLeave: (fn) => leaves.push(fn),
    ping: (p) => r.ping(p),
    leave: () => void r.leave(),
  };
}

/**
 * Sala entre abas do mesmo navegador (`?net=local`): mesma interface, pra testar
 * multiplayer sem internet. Presença por batimento a cada 1 s; some após 3 s sem sinal.
 */
export function localTransport(room: string): Transport {
  const selfId = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(`eco:${room}`);
  const seen = new Map<string, number>();
  const listeners = new Map<string, ((d: unknown, from: string) => void)[]>();
  const joins: ((p: string) => void)[] = [];
  const leaves: ((p: string) => void)[] = [];
  const pongs = new Map<string, (ms: number) => void>();
  const post = (m: { ch: string; from: string; to?: string; d: Wire }): void => bc.postMessage(m);
  const beat = (): void => post({ ch: '_hi', from: selfId, d: null });
  const touch = (p: string): void => {
    const known = seen.has(p);
    seen.set(p, Date.now());
    if (!known) {
      beat(); // responde pra quem acabou de chegar já nos ver
      joins.forEach((fn) => fn(p));
    }
  };
  bc.onmessage = (e: MessageEvent<{ ch: string; from: string; to?: string; d: unknown }>) => {
    const m = e.data;
    if (!m || m.from === selfId || (m.to && m.to !== selfId)) return;
    if (m.ch === '_bye') {
      if (seen.delete(m.from)) leaves.forEach((fn) => fn(m.from));
      return;
    }
    touch(m.from);
    if (m.ch === '_ping') post({ ch: '_pong', from: selfId, to: m.from, d: m.d as Wire });
    else if (m.ch === '_pong') pongs.get(m.from)?.(performance.now() - Number(m.d));
    else listeners.get(m.ch)?.forEach((fn) => fn(m.d, m.from));
  };
  const timer = setInterval(() => {
    beat();
    const now = Date.now();
    for (const [p, t] of seen)
      if (now - t > 3000) {
        seen.delete(p);
        leaves.forEach((fn) => fn(p));
      }
  }, 1000);
  setTimeout(beat, 0);
  return {
    selfId,
    kind: 'local',
    send: (ch, d, to) => post({ ch, from: selfId, to, d }),
    on: (ch, fn) => listeners.set(ch, [...(listeners.get(ch) ?? []), fn]),
    onJoin: (fn) => joins.push(fn),
    onLeave: (fn) => leaves.push(fn),
    ping: (p) =>
      new Promise((res) => {
        pongs.set(p, res);
        post({ ch: '_ping', from: selfId, to: p, d: performance.now() });
      }),
    leave: () => {
      clearInterval(timer);
      post({ ch: '_bye', from: selfId, d: null });
      bc.close();
    },
  };
}
