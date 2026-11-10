import { decode, toWords, type Decoded, type Lexicon, type Morph } from './decode';
import { plan, type SpellPlan } from './essence';
import common from './data/comuns.json';
import { normalize, toPhonemes } from './phonetics';

/** Palavras comuns do português que soam como encantamento: no microfone aberto, nunca viram magia. */
const COMMON = new Set<string>(common);

/** Quão bem a fala ecoou na língua do jogo. */
export type Echo = 'limpo' | 'fraco' | 'torto' | 'sem_forca' | 'sem_eco';

export interface Alt {
  text: string;
  confidence: number;
}

export type Cast =
  | { kind: 'command'; id: string }
  | {
      kind: 'spell';
      echo: Echo;
      plan: SpellPlan | null;
      morphs: Morph[];
      /** O que o reconhecedor devolveu, como fonemas, e o custo: pra calibrar. */
      heard: string;
      phonemes: string;
      cost: number;
      /** Por que não virou magia (vazio quando virou). */
      why: string;
    };

export interface InterpretOptions {
  rng: () => number;
  /** Falou baixo demais (medidor de volume no PC). */
  weak?: boolean;
  /** Microfone aberto: aplica a lista de palavras comuns do português (que nunca viram magia). */
  strict?: boolean;
  /** Segurando o botão: margem maior (é intenção de magia). */
  lenient?: boolean;
}

/**
 * Das alternativas do reconhecedor até a magia:
 * decodifica cada uma pra língua do Eco e fica com a que soa mais perto.
 * eco limpo → como dito · fraco → perde potência · torto → um morfema vira outro ·
 * sem força → falou baixo · sem eco → não é a língua.
 */
export function interpret(alts: Alt[], lex: Lexicon, o: InterpretOptions): Cast | null {
  const d = lex.data;
  const loose = !!o.lenient && !o.strict;
  const echoT = loose ? d.echoHold : d.echo;
  const minMorphs = loose ? d.rulesHold.minMorphs : d.rules.minMorphs;
  const maxSkips = loose ? d.rulesHold.maxSkips : d.rules.maxSkips;
  const decodeOpts = loose
    ? { tolerance: d.rulesHold.tolerance, needEnding: false, extraVowel: 0.3 }
    : {};
  /** Por que a fala não virou magia (vai pra tela, junto com o que foi ouvido). */
  const reason = (dec: Decoded | null, text: string): string => {
    if (!dec) {
      // raiz certa, só faltou a forma? (ex.: "gelo" → "gelus")
      const fix = decode(`${normalize(text).replace(/[aeiou]$/, '')}us`, lex);
      if (fix && fix.cost <= d.echo.clean)
        return `Faltou a terminação: tente “${normalize(text).replace(/[aeiou]$/, '')}us”.`;
      return 'Não soa como a língua do Eco.';
    }
    if (dec.cost > echoT.bent) return 'Não soa como a língua do Eco.';
    const pieces = dec.morphs.filter((m) => m.kind !== 'linker');
    const ending = dec.words[0]?.ending ?? '';
    // com margem, a terminação que faltar é completada: conta como peça
    const count = pieces.length + (loose && !ending ? 1 : 0);
    if (count < minMorphs && !(pieces.length === 2 && d.rules.shortEndings.includes(ending)))
      return 'Curta demais: termine em -us ou ponha um prefixo (ma-, la-, mi-…).';
    if (dec.skips > maxSkips) return 'Sobrou som que não é da língua.';
    if (o.strict && isCommon(text, dec))
      return 'Palavra comum: segure o microfone pra valer como magia.';
    return '';
  };
  const isCommon = (text: string, dec: Decoded): boolean => {
    if (!COMMON.has(normalize(text))) return false;
    // raiz + -us dita limpa ("ventos", "lavos") é magia curta de verdade: não bloqueia
    const pieces = dec.morphs.filter((m) => m.kind !== 'linker');
    return !(pieces.length === 2 && dec.words[0]?.ending === 'us' && dec.cost <= d.echo.clean);
  };

  // escolhe, entre as alternativas do reconhecedor, a que vira encantamento com o menor custo
  let best: Decoded | null = null;
  let fallback: Decoded | null = null;
  let heard = alts[0]?.text ?? '';
  let heardFail = heard;
  let anyFail = false;
  let conf = 0;
  for (const a of alts) {
    const said = normalize(a.text);
    for (const [id, words] of Object.entries(d.commands))
      if (words.includes(said)) return { kind: 'command', id };
    const dec = decode(a.text, lex, decodeOpts);
    if (dec && !reason(dec, a.text)) {
      if (!best || dec.cost < best.cost) {
        best = dec;
        heard = a.text;
        conf = a.confidence;
      }
    } else if (dec && (!fallback || dec.cost < fallback.cost)) {
      fallback = dec;
      heardFail = a.text;
    } else if (!dec && !anyFail) {
      anyFail = true;
      if (!fallback) heardFail = a.text;
    }
  }
  if (!best) {
    const phonemes = toPhonemes(heardFail);
    if (phonemes.length < 4) return null; // ruído curto: ignora
    return {
      kind: 'spell',
      echo: 'sem_eco',
      plan: null,
      morphs: fallback?.morphs ?? [],
      heard: heardFail,
      phonemes,
      cost: fallback?.cost ?? 1,
      why: reason(fallback, heardFail),
    };
  }
  const phonemes = toPhonemes(heard);

  // fraco = tudo meio borrado; torto = só UM pedaço escorregou e o resto saiu certo
  const pieces = best.morphs.filter((m) => m.kind !== 'linker');
  // com margem, só conta como escorregão um som bem diferente
  const off = pieces.filter((m) => m.cost > (loose ? 0.6 : 0.15));
  let echo: Echo = best.cost <= echoT.clean ? 'limpo' : best.cost <= echoT.weak ? 'fraco' : 'torto';
  if (loose) {
    // com margem, o eco é julgado peça por peça: som sobrando só enfraquece, não troca a magia
    const worst = Math.max(0, ...pieces.map((m) => m.cost));
    echo =
      worst <= 0.15 && best.skips === 0
        ? 'limpo'
        : off.length === 0
          ? 'fraco'
          : off.length === 1 && worst <= 1
            ? 'torto'
            : 'sem_eco';
  }
  // com margem, raiz sem forma ganha a terminação padrão — mas sai com eco fraco
  let morphsIn = best.morphs;
  if (loose && !best.words[0]?.ending) {
    let at = 0;
    morphsIn.forEach((m, i) => {
      if (m.kind === 'root' || m.kind === 'linker' || m.kind === 'prefix') at = i + 1;
    });
    // termina a 1ª palavra logo depois da última raiz dela
    const firstWordEnd = morphsIn.findIndex(
      (m, i) => i > 0 && m.kind === 'prefix' && morphsIn[i - 1]?.kind === 'root',
    );
    if (firstWordEnd > 0) at = firstWordEnd;
    morphsIn = [
      ...morphsIn.slice(0, at),
      { kind: 'ending', id: d.rulesHold.defaultEnding, cost: 0 },
      ...morphsIn.slice(at),
    ];
    if (echo === 'limpo') echo = 'fraco';
  }
  if (!loose && echo === 'torto' && off.length !== 1) echo = 'sem_eco';
  if (!loose && echo === 'fraco' && pieces.some((m) => m.cost > 0.6))
    echo = off.length === 1 ? 'torto' : 'sem_eco';
  if (echo === 'sem_eco')
    return {
      kind: 'spell',
      echo,
      plan: null,
      morphs: best.morphs,
      heard,
      phonemes,
      cost: best.cost,
      why: 'Saiu borrado demais: fale cada pedaço mais claro.',
    };
  let morphs = morphsIn;
  if (echo === 'torto') {
    // o som mais torto escorrega pra outro morfema da mesma classe: sai outra magia
    morphs = morphs.map((m) => ({ ...m }));
    const real = morphs.filter((m) => m.kind !== 'linker');
    const worst = real.reduce<Morph | undefined>(
      (w, m) => (!w || m.cost > w.cost ? m : w),
      undefined,
    );
    if (worst) {
      const pool = Object.keys(
        worst.kind === 'root' ? d.roots : worst.kind === 'prefix' ? d.prefixes : d.endings,
      ).filter((id) => id !== worst.id);
      worst.id = pool[Math.floor(o.rng() * pool.length)] ?? worst.id;
    }
  } else if (echo === 'limpo' && (o.weak || (conf > 0 && conf < d.weakConfidence)))
    echo = 'sem_forca';

  return {
    kind: 'spell',
    echo,
    plan: plan(toWords(morphs), d),
    morphs,
    heard,
    phonemes,
    cost: best.cost,
    why: '',
  };
}
