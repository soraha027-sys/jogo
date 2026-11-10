/** Texto limpo: minúsculas, sem acento, só letras e espaços. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ç/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Regras de fim de palavra (o/e finais → u/i, l → u, m → n). Só em palavra de verdade: "é" solto continua "e". */
function finals(w: string, force = false): string {
  if (w.length <= 2 && !force) return w;
  return w
    .replace(/o(s?)$/, 'u$1')
    .replace(/e(s?)$/, 'i$1')
    .replace(/l$/, 'u')
    .replace(/m$/, 'n');
}

/** Regras de consoante (qu/c→k, ge→j, ch→x...), aplicadas depois de juntar as palavras. */
function sounds(w: string): string {
  return w
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/gu(?=[ei])/g, 'G')
    .replace(/ch|sh/g, 'x')
    .replace(/lh/g, 'li')
    .replace(/nh/g, 'ni')
    .replace(/ph/g, 'f')
    .replace(/c(?=[ei])/g, 's')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/[cq]/g, 'k')
    .replace(/G/g, 'g')
    .replace(/h/g, '')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/w/g, 'u')
    .replace(/(.)\1+/g, '$1');
}

/**
 * Forma fonética aproximada de como um brasileiro lê a palavra
 * (qu/c→k, ge→j, ch→x, o/e finais→u/i...). `final=false` pula as regras de fim de palavra.
 */
export function phon(word: string, final = true): string {
  return sounds(final ? finals(word) : word);
}

/** Como uma terminação soa no FIM de uma palavra ("um" → "un"), mesmo sendo curta. */
export function phonEnd(ending: string): string {
  return sounds(finals(ending, true));
}

/**
 * Fala inteira → sequência de fonemas sem espaços. As consoantes são lidas DEPOIS de juntar,
 * então "mag é lor" soa igual a "magelor" (o g antes do e vira j).
 */
export function toPhonemes(text: string): string {
  return sounds(
    normalize(text)
      .split(' ')
      .map((w) => finals(w))
      .join(''),
  );
}

const VOWELS = 'aeiou';
const CLOSE: Record<string, number> = {
  ei: 0.3,
  ou: 0.3,
  ae: 0.6,
  ao: 0.6,
  bp: 0.4,
  dt: 0.4,
  gk: 0.4,
  fv: 0.4,
  jx: 0.4,
  mn: 0.4,
  lr: 0.4,
  sx: 0.5,
  js: 0.6,
  lu: 0.5,
  bv: 0.5,
};

/** Custo de trocar um som por outro: sons parecidos custam pouco. */
export function subCost(a: string, b: string): number {
  if (a === b) return 0;
  const key = a < b ? a + b : b + a;
  const c = CLOSE[key];
  if (c !== undefined) return c;
  const va = VOWELS.includes(a);
  const vb = VOWELS.includes(b);
  return va && vb ? 0.8 : va !== vb ? 1.2 : 1;
}

/**
 * Distância de edição ponderada entre o que foi ouvido e uma forma da língua.
 * `extraVowel`: custo de uma vogal a mais no que foi ouvido (o português põe vogal no fim: gel → gelo).
 */
export function soundDistance(heard: string, form: string, extraVowel = 1): number {
  let prev = Array.from({ length: form.length + 1 }, (_, j) => j);
  for (let i = 1; i <= heard.length; i++) {
    const cur = [i];
    const h = heard[i - 1] ?? '';
    for (let j = 1; j <= form.length; j++) {
      cur[j] = Math.min(
        (prev[j - 1] ?? 0) + subCost(h, form[j - 1] ?? ''),
        (prev[j] ?? 0) + (VOWELS.includes(h) ? extraVowel : 1),
        (cur[j - 1] ?? 0) + 1,
      );
    }
    prev = cur;
  }
  return prev[form.length] ?? 0;
}
