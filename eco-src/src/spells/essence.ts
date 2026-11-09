import { Color } from 'three';
import { spell, type ParsedWord } from './decode';
import { LINGUA, type Lingua } from './lingua';

/** heat, mass, flow, bond, glow, warp — cada um de -1 a 1. */
export type Essence = number[];
const [HEAT, MASS, FLOW, BOND, GLOW, WARP] = [0, 1, 2, 3, 4, 5];
const AX = 6;
const clamp = (v: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, v));
const up = (v: number | undefined): number => Math.max(0, v ?? 0);
const at = (e: Essence, i: number): number => e[i] ?? 0;

export type SpellState = 'harmonico' | 'turbulento' | 'ligado' | 'instavel';

export interface WordPlan {
  prefixes: string[];
  roots: string[];
  ending: string | null;
  shape: string | null;
  essence: Essence;
}
export interface SpellPlan {
  /** Escrita canônica: é a identidade da magia. */
  text: string;
  /** Com os morfemas separados, pra tela. */
  parts: string;
  body: WordPlan;
  infusion: WordPlan | null;
  tension: number;
  state: SpellState;
  /** As duas raízes que mais brigam (pra explicar a instabilidade). */
  conflict: string;
  scale: number;
  speed: number;
  echoes: number;
  fromAbove: boolean;
  power: number;
  cost: number;
  reading: string;
}

function weights(roots: string[], d: Lingua): { id: string; w: number; e: Essence }[] {
  return roots.map((id, i) => ({
    id,
    w: d.rootWeights[i] ?? 0.25,
    e: d.roots[id]?.essence ?? new Array<number>(AX).fill(0),
  }));
}

/** Essência de uma palavra: a 1ª raiz domina, as seguintes infundem. "la" vira tudo do avesso. */
export function wordEssence(w: ParsedWord, d: Lingua = LINGUA): Essence {
  const e = new Array<number>(AX).fill(0);
  for (const r of weights(w.roots, d))
    for (let i = 0; i < AX; i++) e[i] = at(e, i) + r.w * at(r.e, i);
  const sign = w.prefixes.includes('la') ? -1 : 1;
  return e.map((v) => clamp(v) * sign);
}

/**
 * Tensão: em cada eixo, o quanto forças opostas se anulam (calor contra frio, leve contra pesado...).
 * É a regra central: opostos brigam; "ko" transforma a briga em potência.
 */
function tensionOf(parts: { w: number; e: Essence }[]): number {
  let t = 0;
  for (let i = 0; i < AX; i++) {
    let pos = 0;
    let neg = 0;
    for (const p of parts) {
      const v = p.w * at(p.e, i);
      if (v > 0) pos += v;
      else neg -= v;
    }
    t += Math.min(pos, neg);
  }
  return t;
}

function worstPair(ids: string[], d: Lingua): string {
  let best = '';
  let max = 0;
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++) {
      const ea = d.roots[ids[a] ?? '']?.essence ?? [];
      const eb = d.roots[ids[b] ?? '']?.essence ?? [];
      let o = 0;
      for (let i = 0; i < AX; i++)
        if (at(ea, i) * at(eb, i) < 0) o += Math.min(Math.abs(at(ea, i)), Math.abs(at(eb, i)));
      if (o > max) {
        max = o;
        best = `${ids[a]} × ${ids[b]}`;
      }
    }
  return best;
}

const TRAITS: [axis: number, plus: string, minus: string, min: number][] = [
  [HEAT, 'ardente', 'gélido', 0.45],
  [MASS, 'pesado', 'leve', 0.5],
  [FLOW, 'veloz', 'imóvel', 0.5],
  [BOND, 'cristalino', 'difuso', 0.5],
  [GLOW, 'luminoso', 'sombrio', 0.4],
  [WARP, 'voraz', 'repulsivo', 0.35],
];

/** Descreve uma essência em palavras: os traços mais fortes primeiro. */
export function describe(e: Essence): string {
  const found = TRAITS.map(([ax, plus, minus, min]) => ({ v: at(e, ax), plus, minus, min }))
    .filter((t) => Math.abs(t.v) >= t.min)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 3)
    .map((t) => (t.v > 0 ? t.plus : t.minus));
  return found.join(', ') || 'neutro';
}

/** Monta a magia a partir das palavras decodificadas. Nada aqui é tabela de poderes: tudo é derivado. */
export function plan(words: ParsedWord[], d: Lingua = LINGUA): SpellPlan | null {
  const [w1, w2] = words;
  if (!w1) return null;
  const mk = (w: ParsedWord): WordPlan => ({
    ...w,
    shape: w.ending ? (d.endings[w.ending]?.shape ?? null) : null,
    essence: wordEssence(w, d),
  });
  const body = mk(w1);
  const infusion = w2 ? mk(w2) : null;

  let tension = tensionOf(weights(w1.roots, d));
  if (w2 && infusion) {
    tension += tensionOf(weights(w2.roots, d)) * 0.5;
    tension +=
      tensionOf([
        { w: 1, e: body.essence },
        { w: 0.6, e: infusion.essence },
      ]) * 0.7;
  }
  const bound = words.some((w) => w.prefixes.includes('ko'));
  const state: SpellState =
    tension < d.tension.turbulent
      ? 'harmonico'
      : bound
        ? 'ligado'
        : tension < d.tension.unstable
          ? 'turbulento'
          : 'instavel';

  const has = (p: string): boolean => w1.prefixes.includes(p);
  const scale = (has('ma') ? 1.7 : 1) * (has('mi') ? 0.55 : 1);
  const end = w1.ending ? d.endings[w1.ending] : undefined;
  const cost = Math.round(
    (end?.cost ?? 4) *
      (has('ma') ? 2 : 1) *
      (has('mi') ? 0.5 : 1) *
      (has('re') ? 1.8 : 1) *
      (1 + 0.35 * (w1.roots.length - 1)) *
      (w2 ? 1.5 : 1),
  );

  const shapeName = end?.gloss ?? 'essência solta';
  let reading = `${shapeName} ${describe(body.essence)}`;
  if (infusion) {
    const g = infusion.ending ? d.endings[infusion.ending]?.gloss : undefined;
    reading += ` + ${g ?? 'infusão'} ${describe(infusion.essence)}`;
  }

  return {
    text: spell(words),
    parts: spell(words, '·'),
    body,
    infusion,
    tension,
    state,
    conflict: worstPair([...w1.roots, ...(w2?.roots ?? [])], d),
    scale,
    speed: has('mi') ? 1.5 : 1,
    echoes: has('re') ? 3 : 1,
    fromAbove: has('al'),
    power: state === 'ligado' ? 1 + tension * 0.25 : 1,
    cost,
    reading,
  };
}

/** Como a essência se comporta fisicamente (partículas e corpo do feitiço). */
export interface Matter {
  gravity: number;
  drag: number;
  swirl: number;
  bounce: number;
  pull: number;
  stretch: number;
  size: number;
  life: number;
  box: boolean;
  colors: Color[];
  speed: number;
  arc: number;
  spiral: number;
  burst: number;
}

const COLD = new Color(0.42, 0.8, 1);
const NEUTRAL = new Color(0.82, 0.84, 0.88);
const HOT = new Color(1, 0.42, 0.08);
const EARTH = new Color(0.5, 0.43, 0.36);
const LIQUID = new Color(0.16, 0.48, 1);
const AIR = new Color(0.8, 1, 0.92);
const LIGHT = new Color(1, 0.95, 0.7);
const VOID = new Color(0.62, 0.32, 1);
const WHITE = new Color(1, 1, 1);

/** Essência → matéria. Função contínua: qualquer mistura gera um material próprio. */
export function materialize(e: Essence): Matter {
  const heat = at(e, HEAT);
  const mass = at(e, MASS);
  const flow = at(e, FLOW);
  const bond = at(e, BOND);
  const glow = at(e, GLOW);
  const warp = at(e, WARP);

  const c = NEUTRAL.clone().lerp(heat > 0 ? HOT : COLD, Math.abs(heat));
  c.lerp(EARTH, clamp(up(mass) * up(bond) * 1.1, 0, 0.9));
  c.lerp(LIQUID, clamp(Math.min(up(mass), up(-bond)) * 2.2, 0, 0.85));
  c.lerp(AIR, clamp(up(-mass) * up(flow) * 0.7 * (1 - Math.abs(heat)), 0, 0.8));
  if (glow > 0) c.lerp(LIGHT, glow * 0.45);
  else c.multiplyScalar(1 + glow * 0.55);
  c.lerp(VOID, clamp(Math.abs(warp) * 0.75, 0, 0.8));

  return {
    gravity: (mass > 0 ? mass * 15 : mass * 1.5) - up(heat) * 4,
    drag: 0.3 + up(-flow) * 2.4 + up(bond) * 0.6,
    swirl: up(flow) * 6.5,
    bounce: up(bond) * up(mass) * 0.55,
    pull: warp * 5,
    stretch: 1 + up(bond) * 1.6 + up(flow) * up(-mass) * 1.6,
    size: 0.17 + up(mass) * 0.09 + up(heat) * 0.05,
    life: Math.max(0.4, 0.8 + up(bond) * 0.7 - up(flow) * 0.15 + up(-heat) * 0.2),
    box: bond > 0.4 && mass > 0.5,
    colors: [c, c.clone().lerp(WHITE, 0.45), c.clone().multiplyScalar(0.62)],
    speed: 14 + flow * 8 - up(mass) * 4,
    arc: up(mass) * 7,
    spiral: up(flow) * 0.9,
    burst: 1 + up(heat) * 0.6 + Math.abs(warp) * 0.3,
  };
}
