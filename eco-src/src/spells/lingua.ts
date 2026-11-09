import raw from './data/lingua.json';

interface Morpheme {
  gloss: string;
  /** Formas fonéticas extras que o reconhecedor costuma devolver. */
  alt?: string[];
}
export interface RootDef extends Morpheme {
  /** heat, mass, flow, bond, glow, warp — cada eixo de -1 a 1. */
  essence: number[];
  /** O que a raiz FAZ no alvo (ver `Impact`). */
  verbs: Record<string, number>;
}
export interface EndingDef extends Morpheme {
  shape: string;
  cost: number;
}

export interface Lingua {
  axes: string[];
  roots: Record<string, RootDef>;
  prefixes: Record<string, Morpheme>;
  endings: Record<string, EndingDef>;
  linkers: string[];
  rootWeights: number[];
  tension: { turbulent: number; unstable: number };
  echo: { clean: number; weak: number; bent: number };
  /**
   * O que faz uma fala ser encantamento e não conversa:
   * pelo menos `minMorphs` peças (prefixo/raiz/terminação), ou só raiz + uma das `shortEndings`;
   * no máximo `maxSkips` sons sobrando. (Microfone aberto ainda ignora `comuns.json`.)
   */
  rules: { minMorphs: number; shortEndings: string[]; maxSkips: number };
  commands: Record<string, string[]>;
  /** Pares que `la-` troca e que se anulam quando misturados sem `ko-`. */
  opposites: Record<string, string>;
  /** Números do combate (vida, durações, velocidades). */
  combat: {
    hp: number;
    damageUnit: number;
    burnSeconds: number;
    burnDps: number;
    wetSeconds: number;
    chillToFreeze: number;
    freezeSeconds: number;
    stunSeconds: number;
    pushSpeed: number;
    pullSpeed: number;
    liftSpeed: number;
  };
  weakConfidence: number;
  weakVolume: number;
  manaMax: number;
  manaRegen: number;
}

/** A língua do Eco inteira vem do JSON: raiz, prefixo ou terminação nova lá multiplica as magias. */
export const LINGUA: Lingua = raw;
