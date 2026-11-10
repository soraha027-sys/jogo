import { LINGUA, type Lingua } from './lingua';
import { normalize, phon, phonEnd, soundDistance, toPhonemes } from './phonetics';

export type MorphKind = 'prefix' | 'root' | 'linker' | 'ending';
export interface Morph {
  kind: MorphKind;
  id: string;
  /** 0 = som exato; cresce conforme o que foi ouvido se afasta da forma. */
  cost: number;
}
export interface ParsedWord {
  prefixes: string[];
  roots: string[];
  ending: string | null;
}
export interface Decoded {
  words: ParsedWord[];
  morphs: Morph[];
  /** Custo normalizado 0..1 da fala inteira. */
  cost: number;
  /** Sons ouvidos que não couberam em nenhum morfema. */
  skips: number;
}

interface Form {
  kind: MorphKind;
  id: string;
  ph: string;
}
export interface Lexicon {
  forms: Form[];
  data: Lingua;
}

export function buildLexicon(data: Lingua = LINGUA): Lexicon {
  const forms: Form[] = [];
  const add = (kind: MorphKind, id: string, alt: string[] | undefined, final: boolean): void => {
    const set = new Set([phon(normalize(id), final), ...(alt ?? [])]);
    if (final) set.add(phonEnd(normalize(id)));
    for (const ph of set) forms.push({ kind, id, ph });
  };
  for (const [id, r] of Object.entries(data.roots)) add('root', id, r.alt, false);
  for (const [id, p] of Object.entries(data.prefixes)) add('prefix', id, p.alt, false);
  for (const [id, e] of Object.entries(data.endings)) add('ending', id, e.alt, true);
  for (const l of data.linkers) forms.push({ kind: 'linker', id: l, ph: l });
  return { forms, data };
}

/*
 * Gramática: palavra = prefixos* raiz (vogal-de-ligação? raiz)* terminação?
 *            fala    = palavra (palavra)?
 * Estados: 0 início · 1 raízes da 1ª · 2 ligação · 3 1ª terminada · 4 raízes da 2ª · 5 ligação · 6 fim
 */
const NEXT: Record<MorphKind, Record<number, number>> = {
  prefix: { 0: 0, 3: 3 },
  root: { 0: 1, 1: 1, 2: 1, 3: 4, 4: 4, 5: 4 },
  linker: { 1: 2, 4: 5 },
  ending: { 1: 3, 4: 6 },
};
// a 1ª palavra precisa de terminação: essência sem forma não é encantamento
const ACCEPT = [3, 4, 6];
/** Com margem: aceita a 1ª palavra sem terminação (quem chama completa). */
const ACCEPT_LOOSE = [1, 3, 4, 6];

export interface DecodeOptions {
  /** Erro máximo por peça, como fração do tamanho dela. */
  tolerance?: number;
  /** Custo de uma vogal sobrando colada na peça. */
  extraVowel?: number;
  needEnding?: boolean;
}
const STATES = 7;
const SKIP = 1;

interface Cell {
  cost: number;
  from: number; // índice de fonema anterior
  state: number;
  form: Form | null;
  step: number;
}

/**
 * Decodifica o que o reconhecedor ouviu (em português) para a língua do jogo.
 * Busca a segmentação em morfemas de menor custo sonoro que obedece a gramática;
 * não importa em que "palavras" o Chrome quebrou a fala.
 */
export function decode(text: string, lex: Lexicon, opts: DecodeOptions = {}): Decoded | null {
  const tol = opts.tolerance ?? 0.34;
  const accept = opts.needEnding === false ? ACCEPT_LOOSE : ACCEPT;
  const ph = toPhonemes(text);
  const n = ph.length;
  if (n < 3 || n > 60) return null;
  const grid: (Cell | null)[][] = Array.from({ length: n + 1 }, () =>
    new Array<Cell | null>(STATES).fill(null),
  );
  const first = grid[0];
  if (first) first[0] = { cost: 0, from: -1, state: 0, form: null, step: 0 };
  const relax = (i: number, s: number, cell: Cell): void => {
    const row = grid[i];
    const old = row?.[s];
    if (row && (!old || cell.cost < old.cost)) row[s] = cell;
  };
  for (let i = 0; i < n; i++)
    for (let s = 0; s < STATES; s++) {
      const here = grid[i]?.[s];
      if (!here) continue;
      relax(i + 1, s, { cost: here.cost + SKIP, from: i, state: s, form: null, step: SKIP });
      for (const f of lex.forms) {
        const ns = NEXT[f.kind][s];
        if (ns === undefined) continue;
        const L = f.ph.length;
        for (let len = Math.max(1, L - 1); len <= L + 1 && i + len <= n; len++) {
          const c = soundDistance(ph.slice(i, i + len), f.ph, opts.extraVowel ?? 1);
          // peça curta (terminação, prefixo) não pode perder metade: no máximo um som parecido
          if (c > (L <= 2 ? 0.6 : Math.max(0.6, L * tol))) continue;
          relax(i + len, ns, { cost: here.cost + c, from: i, state: s, form: f, step: c });
        }
      }
    }
  let end: Cell | null = null;
  for (const s of accept) {
    const c = grid[n]?.[s];
    if (c && (!end || c.cost < end.cost)) end = c;
  }
  if (!end) return null;
  const morphs: Morph[] = [];
  let length = 0;
  let skips = 0;
  let cell: Cell | null = end;
  while (cell && cell.from >= 0) {
    if (cell.form) {
      morphs.unshift({ kind: cell.form.kind, id: cell.form.id, cost: cell.step });
      length += cell.form.ph.length;
    } else skips++;
    cell = grid[cell.from]?.[cell.state] ?? null;
  }
  const words = toWords(morphs);
  if (words.length === 0) return null;
  return { words, morphs, cost: end.cost / Math.max(n, length), skips };
}

export function toWords(morphs: Morph[]): ParsedWord[] {
  const words: ParsedWord[] = [];
  let w: ParsedWord = { prefixes: [], roots: [], ending: null };
  const close = (): void => {
    if (w.roots.length) words.push(w);
    w = { prefixes: [], roots: [], ending: null };
  };
  for (const m of morphs) {
    if (m.kind === 'prefix') {
      if (w.roots.length) close();
      if (!w.prefixes.includes(m.id)) w.prefixes.push(m.id);
    } else if (m.kind === 'root') w.roots.push(m.id);
    else if (m.kind === 'ending') {
      w.ending = m.id;
      close();
    }
  }
  close();
  return words.slice(0, 2);
}

/** Escrita canônica da língua: raízes ligadas por "i". Ex.: "kopirigelor", "laventus gel". */
export function spell(words: ParsedWord[], sep = ''): string {
  return words
    .map((w) => [...w.prefixes, w.roots.join(sep || 'i'), w.ending].filter(Boolean).join(sep))
    .join(' ');
}
