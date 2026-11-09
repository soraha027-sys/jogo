import type { SpellPlan } from './essence';

export interface GrimoireEntry {
  text: string;
  reading: string;
  state: string;
  casts: number;
}

const KEY = 'eco.grimoire.v2';

/** Magias que o jogador já fez ecoar. Local por enquanto (IndexedDB e rede vêm depois). */
export class Grimoire {
  private readonly map = new Map<string, GrimoireEntry>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as GrimoireEntry[];
      for (const e of saved) this.map.set(e.text, e);
    } catch {
      /* sem armazenamento: começa vazio */
    }
  }

  /** Registra um lançamento. Retorna true se é descoberta nova. */
  record(p: SpellPlan): boolean {
    const e = this.map.get(p.text);
    if (e) e.casts++;
    else this.map.set(p.text, { text: p.text, reading: p.reading, state: p.state, casts: 1 });
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.map.values()]));
    } catch {
      /* sem armazenamento */
    }
    return !e;
  }

  list(): GrimoireEntry[] {
    return [...this.map.values()].reverse();
  }
}
