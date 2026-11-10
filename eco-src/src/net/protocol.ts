import type { ParsedWord } from '../spells/decode';
import { LINGUA } from '../spells/lingua';

/** Estado de uma bruxa num instante (o que a animação e a posição precisam). */
export interface Snap {
  /** Relógio do remetente, em segundos. */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  grounded: boolean;
  flying: boolean;
  jumpCount: number;
  lastJumpDouble: boolean;
  landCount: number;
  /** Abertura da boca 0..1 (volume da fala). */
  mouth: number;
  /** Vida 0..1 (cada um é dono da própria vida no PvP). */
  hp: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Snapshot compacto: um array de números (~60 bytes em JSON). */
export function encodeSnap(s: Snap): number[] {
  const flags = (s.grounded ? 1 : 0) | (s.flying ? 2 : 0) | (s.lastJumpDouble ? 4 : 0);
  return [
    r3(s.t),
    r3(s.x),
    r3(s.y),
    r3(s.z),
    r3(s.yaw),
    r3(s.speed),
    flags,
    s.jumpCount,
    s.landCount,
    Math.round(s.mouth * 100) / 100,
    Math.round(s.hp * 100) / 100,
  ];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valida tudo que chega da rede: um par mal-intencionado não derruba o jogo. */
export function decodeSnap(a: unknown): Snap | null {
  // 10 campos = versão antiga, sem vida
  if (!Array.isArray(a) || (a.length !== 10 && a.length !== 11) || !a.every(finite)) return null;
  const [t, x, y, z, yaw, speed, flags, jump, land, mouth, hp = 1] = a as number[];
  if ([x, y, z].some((v) => Math.abs(v ?? 0) > 1e4)) return null;
  const f = flags ?? 0;
  return {
    t: t ?? 0,
    x: x ?? 0,
    y: y ?? 0,
    z: z ?? 0,
    yaw: yaw ?? 0,
    speed: Math.min(50, Math.max(0, speed ?? 0)),
    grounded: (f & 1) !== 0,
    flying: (f & 2) !== 0,
    lastJumpDouble: (f & 4) !== 0,
    jumpCount: jump ?? 0,
    landCount: land ?? 0,
    mouth: Math.min(1, Math.max(0, mouth ?? 0)),
    hp: Math.min(1, Math.max(0, hp)),
  };
}

/**
 * Magia lançada: viajam só as palavras já decodificadas e a potência.
 * Cada cliente recalcula a magia pela mesma lógica (nada de efeito pronto vindo da rede).
 */
export interface CastMsg {
  words: ParsedWord[];
  power: number;
  origin: [number, number, number];
  aim: [number, number, number];
}

export function decodeCast(m: unknown): CastMsg | null {
  if (!m || typeof m !== 'object') return null;
  const c = m as Partial<CastMsg>;
  const vec = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) && v.length === 3 && v.every(finite) && v.every((n) => Math.abs(n) < 1e4);
  if (!vec(c.origin) || !vec(c.aim) || !finite(c.power) || !Array.isArray(c.words)) return null;
  if (c.words.length < 1 || c.words.length > 2) return null;
  const d = LINGUA;
  const ok = c.words.every(
    (w) =>
      !!w &&
      Array.isArray(w.roots) &&
      w.roots.length >= 1 &&
      w.roots.length <= 4 &&
      w.roots.every((r) => typeof r === 'string' && Object.hasOwn(d.roots, r)) &&
      Array.isArray(w.prefixes) &&
      w.prefixes.length <= 4 &&
      w.prefixes.every((p) => typeof p === 'string' && Object.hasOwn(d.prefixes, p)) &&
      (w.ending === null || (typeof w.ending === 'string' && Object.hasOwn(d.endings, w.ending))),
  );
  if (!ok) return null;
  return { words: c.words, power: Math.min(1, Math.max(0, c.power)), origin: c.origin, aim: c.aim };
}

/** Anfitrião: o menor id entre todos. Todos chegam na mesma resposta sem conversar, e se ele cair o próximo assume. */
export function electHost(selfId: string, peers: Iterable<string>): string {
  let best = selfId;
  for (const p of peers) if (p < best) best = p;
  return best;
}
