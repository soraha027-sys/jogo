import { decode, toWords, type Decoded, type Lexicon, type Morph } from './decode';
import { plan, type SpellPlan } from './essence';
import { normalize, toPhonemes } from './phonetics';

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
    };

export interface InterpretOptions {
  rng: () => number;
  /** Falou baixo demais (medidor de volume no PC). */
  weak?: boolean;
}

/**
 * Das alternativas do reconhecedor até a magia:
 * decodifica cada uma pra língua do Eco e fica com a que soa mais perto.
 * eco limpo → como dito · fraco → perde potência · torto → um morfema vira outro ·
 * sem força → falou baixo · sem eco → não é a língua.
 */
export function interpret(alts: Alt[], lex: Lexicon, o: InterpretOptions): Cast | null {
  const d = lex.data;
  let best: Decoded | null = null;
  let heard = alts[0]?.text ?? '';
  let conf = 0;
  for (const a of alts) {
    const said = normalize(a.text);
    for (const [id, words] of Object.entries(d.commands))
      if (words.includes(said)) return { kind: 'command', id };
    const dec = decode(a.text, lex);
    if (dec && (!best || dec.cost < best.cost)) {
      best = dec;
      heard = a.text;
      conf = a.confidence;
    }
  }
  const phonemes = toPhonemes(heard);
  if (!best || best.cost > d.echo.bent) {
    if (phonemes.length < 4) return null; // ruído curto: ignora
    return {
      kind: 'spell',
      echo: 'sem_eco',
      plan: null,
      morphs: best?.morphs ?? [],
      heard,
      phonemes,
      cost: best?.cost ?? 1,
    };
  }

  let echo: Echo =
    best.cost <= d.echo.clean ? 'limpo' : best.cost <= d.echo.weak ? 'fraco' : 'torto';
  let morphs = best.morphs;
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
  };
}
