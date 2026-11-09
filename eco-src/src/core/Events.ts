import type { QualityId } from '../quality/auto';

/** Barramento de eventos tipado; cada módulo recebe a instância, nada é global. */
export class Events<M extends object> {
  private readonly map = new Map<keyof M, Set<(p: M[keyof M]) => void>>();

  on<K extends keyof M>(key: K, fn: (p: M[K]) => void): () => void {
    const set = this.map.get(key) ?? new Set();
    this.map.set(key, set);
    const f = fn as (p: M[keyof M]) => void;
    set.add(f);
    return () => void set.delete(f);
  }

  emit<K extends keyof M>(key: K, payload: M[K]): void {
    this.map.get(key)?.forEach((fn) => fn(payload));
  }
}

export interface GameEvents {
  'quality:changed': { id: QualityId; auto: boolean };
  'fly:changed': boolean;
  'mic:changed': boolean;
  'debug:changed': boolean;
  /** Fala parcial já decodificada pra língua do jogo. */
  'voice:interim': string;
  'voice:error': string;
}
