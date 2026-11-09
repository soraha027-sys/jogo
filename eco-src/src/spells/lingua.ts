import raw from './data/lingua.json';

interface Morpheme {
  gloss: string;
  /** Formas fonéticas extras que o reconhecedor costuma devolver. */
  alt?: string[];
}
export interface RootDef extends Morpheme {
  /** heat, mass, flow, bond, glow, warp — cada eixo de -1 a 1. */
  essence: number[];
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
  commands: Record<string, string[]>;
  weakConfidence: number;
  weakVolume: number;
  manaMax: number;
  manaRegen: number;
}

/** A língua do Eco inteira vem do JSON: raiz, prefixo ou terminação nova lá multiplica as magias. */
export const LINGUA: Lingua = raw;
