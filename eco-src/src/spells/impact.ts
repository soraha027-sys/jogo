import type { SpellPlan } from './essence';
import { LINGUA, type Lingua } from './lingua';

/** O que uma magia faz em quem ela acerta. Cada número é "quanto" (1 = uma raiz pura, potência normal). */
export interface Impact {
  damage: number;
  burn: number;
  chill: number;
  wet: number;
  dry: number;
  push: number;
  pull: number;
  lift: number;
  slam: number;
  stun: number;
  drain: number;
  solid: number;
  /** `ko-` ligou opostos (calor com frio ou água): explode em vapor no acerto. */
  vapor: boolean;
}

export const VERBS = [
  'damage',
  'burn',
  'chill',
  'wet',
  'dry',
  'push',
  'pull',
  'lift',
  'slam',
  'stun',
  'drain',
  'solid',
] as const;
export type Verb = (typeof VERBS)[number];

export function emptyImpact(): Impact {
  return {
    damage: 0,
    burn: 0,
    chill: 0,
    wet: 0,
    dry: 0,
    push: 0,
    pull: 0,
    lift: 0,
    slam: 0,
    stun: 0,
    drain: 0,
    solid: 0,
    vapor: false,
  };
}

/**
 * Impacto de uma magia, derivado das raízes (nada de tabela de poderes):
 * cada raiz soma seus verbos com o peso da posição (1ª domina), `la-` troca cada verbo
 * pelo oposto, a 2ª palavra entra com 60%. Opostos se anulam — a não ser que `ko-` ligue:
 * aí os dois ficam e, se for calor com frio/água, vira explosão de vapor.
 */
export function impactOf(p: SpellPlan, d: Lingua = LINGUA): Impact {
  const imp = emptyImpact();
  const add = (roots: string[], prefixes: string[], weight: number): void => {
    const flip = prefixes.includes('la');
    roots.forEach((r, i) => {
      const w = (d.rootWeights[i] ?? 0.25) * weight;
      for (const [verb, v] of Object.entries(d.roots[r]?.verbs ?? {})) {
        const key = (flip ? (d.opposites[verb] ?? verb) : verb) as Verb;
        if (key in imp) imp[key] += v * w;
      }
    });
  };
  add(p.body.roots, p.body.prefixes, 1);
  if (p.infusion) add(p.infusion.roots, p.infusion.prefixes, 0.6);

  const bound = p.body.prefixes.includes('ko') || !!p.infusion?.prefixes.includes('ko');
  if (bound) imp.vapor = imp.burn > 0.2 && (imp.chill > 0.2 || imp.wet > 0.2);
  else
    for (const [a, b] of [
      ['burn', 'chill'],
      ['push', 'pull'],
      ['wet', 'dry'],
      ['lift', 'slam'],
    ] as const) {
      const m = Math.min(imp[a], imp[b]);
      imp[a] -= m;
      imp[b] -= m;
    }
  return imp;
}

/** Copia escalada (potência, tamanho, tique de área). */
export function scaleImpact(imp: Impact, k: number): Impact {
  const out = { ...imp };
  for (const v of VERBS) out[v] = imp[v] * k;
  return out;
}

/** Elemento que mais aparece (pra cor dos números e nomes na tela). */
export function dominant(imp: Impact): Verb {
  let best: Verb = 'damage';
  let max = 0;
  for (const v of ['burn', 'chill', 'wet', 'push', 'pull', 'solid'] as const)
    if (imp[v] > max) {
      max = imp[v];
      best = v;
    }
  return best;
}
