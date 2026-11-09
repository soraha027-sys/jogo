import { expect, it } from 'vitest';
import { buildLexicon } from './decode';
import { interpret } from './interpret';
const lex = buildLexicon();
it('fala que falhou diz por quê', () => {
  const r = interpret([{ text: 'gelo', confidence: 0.9 }], lex, { rng: () => 0 });
  expect(r?.kind === 'spell' && r.why).toBe('Faltou a terminação: tente “gelus”.');
  const g = interpret([{ text: 'cara', confidence: 0.9 }], lex, { rng: () => 0 });
  expect(g?.kind === 'spell' && g.why).toMatch(/Curta demais/);
});
