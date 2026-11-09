import { afterEach, describe, expect, it } from 'vitest';
import { SnapBuffer } from './interp';
import { Net } from './Net';
import { decodeCast, decodeSnap, electHost, encodeSnap, type Snap } from './protocol';
import { localTransport, type Transport } from './transport';

const snap = (t: number, x: number, yaw = 0, extra: Partial<Snap> = {}): Snap => ({
  t,
  x,
  y: 0,
  z: 0,
  yaw,
  speed: 2,
  grounded: true,
  flying: false,
  jumpCount: 0,
  lastJumpDouble: false,
  landCount: 0,
  mouth: 0,
  ...extra,
});

describe('protocolo', () => {
  it('snapshot vai e volta', () => {
    const s = snap(12.3456, 1.23456, 3, {
      flying: true,
      lastJumpDouble: true,
      jumpCount: 4,
      mouth: 0.5,
    });
    const back = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(s))));
    expect(back).toMatchObject({
      x: 1.235,
      yaw: 3,
      flying: true,
      grounded: true,
      lastJumpDouble: true,
      jumpCount: 4,
      mouth: 0.5,
    });
  });
  it('rejeita lixo da rede', () => {
    expect(decodeSnap('oi')).toBeNull();
    expect(decodeSnap([1, 2, 3])).toBeNull();
    expect(decodeSnap([0, NaN, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeSnap([0, 1e9, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  it('magia só passa com palavras da língua', () => {
    const ok = {
      words: [{ prefixes: ['la'], roots: ['vent'], ending: 'us' }],
      power: 1,
      origin: [0, 1, 0],
      aim: [0, 0, 1],
    };
    expect(decodeCast(ok)).not.toBeNull();
    expect(
      decodeCast({ ...ok, words: [{ prefixes: [], roots: ['banana'], ending: 'us' }] }),
    ).toBeNull();
    expect(
      decodeCast({ ...ok, words: [{ prefixes: [], roots: ['vent'], ending: '__proto__' }] }),
    ).toBeNull();
    expect(
      decodeCast({ ...ok, words: [{ prefixes: ['toString'], roots: ['vent'], ending: 'us' }] }),
    ).toBeNull();
    expect(decodeCast({ ...ok, origin: [0, 'x', 0] })).toBeNull();
    expect(decodeCast({ ...ok, power: 99 })?.power).toBe(1);
  });
  it('anfitrião é o menor id e troca sozinho', () => {
    expect(electHost('m', ['z', 'b'])).toBe('b');
    expect(electHost('a', ['z', 'b'])).toBe('a');
  });
});

describe('interpolação', () => {
  it('interpola entre snapshots com atraso de 100 ms', () => {
    const b = new SnapBuffer();
    b.push(snap(10, 0), 50);
    b.push(snap(10.1, 1), 50.1);
    b.push(snap(10.2, 2), 50.2);
    const out = snap(0, 0);
    b.sample(50.25, out); // 50.25 − 0.1 = 50.15 → entre x=1 e x=2
    expect(out.x).toBeCloseTo(1.5);
  });
  it('ângulo pega o caminho curto', () => {
    const b = new SnapBuffer();
    b.push(snap(0, 0, 3.1), 0);
    b.push(snap(0.1, 0, -3.1), 0.1);
    const out = snap(0, 0);
    b.sample(0.15, out);
    expect(Math.abs(out.yaw)).toBeGreaterThan(3.1);
  });
  it('ignora snapshot atrasado e segura no último', () => {
    const b = new SnapBuffer();
    b.push(snap(1, 1), 1);
    b.push(snap(0.5, 9), 1.01);
    expect(b.size).toBe(1);
    const out = snap(0, 0);
    b.sample(5, out);
    expect(out.x).toBe(1);
  });
});

describe('sala local (BroadcastChannel)', () => {
  const open: Transport[] = [];
  afterEach(() => {
    open.splice(0).forEach((t) => t.leave());
  });
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('dois clientes se veem, trocam snapshots e magias, e o anfitrião é o mesmo', async () => {
    const room = `teste-${Math.random()}`;
    const ta = localTransport(room);
    const tb = localTransport(room);
    open.push(ta, tb);
    const casts: string[] = [];
    const a = new Net(ta, { join: () => undefined, leave: () => undefined, cast: () => undefined });
    const b = new Net(tb, {
      join: () => undefined,
      leave: () => undefined,
      cast: (id) => casts.push(id),
    });
    await wait(80);
    expect(a.count).toBe(2);
    expect(b.count).toBe(2);
    expect(a.host).toBe(b.host);
    a.update(0.1, snap(0, 3));
    a.sendCast({
      words: [{ prefixes: [], roots: ['pir'], ending: 'or' }],
      power: 1,
      origin: [0, 1, 0],
      aim: [0, 0, 1],
    });
    await wait(60);
    expect(b.buffers.get(ta.selfId)?.size).toBe(1);
    expect(casts).toEqual([ta.selfId]);
  });

  it('quem sai some e o anfitrião passa adiante', async () => {
    const room = `teste-${Math.random()}`;
    const ta = localTransport(room);
    const tb = localTransport(room);
    open.push(tb);
    const left: string[] = [];
    const b = new Net(tb, {
      join: () => undefined,
      leave: (id) => left.push(id),
      cast: () => undefined,
    });
    new Net(ta, { join: () => undefined, leave: () => undefined, cast: () => undefined });
    await wait(80);
    ta.leave();
    await wait(60);
    expect(left).toEqual([ta.selfId]);
    expect(b.count).toBe(1);
    expect(b.isHost).toBe(true);
  });
});
