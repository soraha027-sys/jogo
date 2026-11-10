import { describe, expect, it } from 'vitest';
import { plan } from '../spells/essence';
import { LINGUA } from '../spells/lingua';
import { parseWord, wordText } from './Admin';

describe('ADM', () => {
  const roots = Object.keys(LINGUA.roots);
  const ends = Object.keys(LINGUA.endings);
  const pres = Object.keys(LINGUA.prefixes);

  it('toda combinação montada vira magia e volta igual pela escrita', () => {
    const bad: string[] = [];
    for (const pre of [[], ...pres.map((p) => [p]), ['ko', 'ma']])
      for (const a of roots)
        for (const b of ['', ...roots])
          for (const e of ends) {
            const w = { prefixes: pre, roots: b ? [a, b] : [a], ending: e };
            const t = wordText(w);
            if (!plan([w], LINGUA) || JSON.stringify(parseWord(t, LINGUA)) !== JSON.stringify(w))
              bad.push(t);
          }
    expect(bad).toEqual([]);
  });

  it('lê as misturas prontas', () => {
    for (const t of ['kopirigelor', 'laventus', 'malavum', 'terigelia', 'korus'])
      expect(parseWord(t, LINGUA)).not.toBeNull();
    expect(parseWord('abacaxi', LINGUA)).toBeNull();
  });
});
