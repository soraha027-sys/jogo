import { describe, expect, it } from 'vitest';
import { buildLexicon, decode } from './decode';
import { plan } from './essence';
import { emptyImpact, impactOf, type Impact } from './impact';
import { applyImpact, newStatus, tickStatus } from './status';

const lex = buildLexicon();
const imp = (spoken: string): Impact => {
  const d = decode(spoken, lex);
  const p = d && plan(d.words);
  if (!p) throw new Error(spoken);
  return impactOf(p);
};
const pure = (o: Partial<Impact>): Impact => ({ ...emptyImpact(), ...o });

describe('impacto vem das raízes', () => {
  it('cada raiz faz uma coisa diferente', () => {
    expect(imp('pirus').burn).toBeGreaterThan(0.9);
    expect(imp('ventus').push).toBeGreaterThan(0.9);
    expect(imp('gelus').chill).toBeGreaterThan(0.9);
    expect(imp('lavus').wet).toBeGreaterThan(0.9);
    expect(imp('terus').solid).toBeGreaterThan(0.9);
    expect(imp('korus').pull).toBeGreaterThan(0.9);
  });
  it('la- troca pelo oposto', () => {
    expect(imp('lapirus').chill).toBeGreaterThan(0.9);
    expect(imp('lapirus').burn).toBe(0);
    expect(imp('lakorus').push).toBeGreaterThan(0.9);
  });
  it('opostos se anulam; ko- liga e vira vapor', () => {
    const plain = imp('pirigelor');
    expect(plain.burn).toBeCloseTo(0.4);
    expect(plain.chill).toBe(0);
    const bound = imp('kopirigelor');
    expect(bound.burn).toBeGreaterThan(0.9);
    expect(bound.chill).toBeGreaterThan(0.5);
    expect(bound.vapor).toBe(true);
  });
  it('infusão entra mais fraca', () => {
    const v = imp('ventus gelus');
    expect(v.push).toBeGreaterThan(0.9);
    expect(v.chill).toBeCloseTo(0.6);
  });
});

describe('estados e reações', () => {
  it('fogo queima e o tempo tira vida', () => {
    const s = newStatus();
    applyImpact(s, pure({ burn: 1 }));
    expect(s.burning).toBeGreaterThan(2);
    const hp = s.hp;
    tickStatus(s, 1);
    expect(s.hp).toBeLessThan(hp);
  });
  it('três de frio congela', () => {
    const s = newStatus();
    applyImpact(s, pure({ chill: 1 }));
    applyImpact(s, pure({ chill: 1 }));
    expect(s.frozen).toBe(0);
    expect(applyImpact(s, pure({ chill: 1 })).reactions).toContain('congelou');
    expect(s.stunned).toBeGreaterThan(0);
  });
  it('molhado + frio congela na hora', () => {
    const s = newStatus();
    applyImpact(s, pure({ wet: 1 }));
    expect(applyImpact(s, pure({ chill: 0.3 })).reactions).toContain('congelou');
  });
  it('água apaga fogo; fogo em molhado vira vapor', () => {
    const s = newStatus();
    applyImpact(s, pure({ burn: 1 }));
    expect(applyImpact(s, pure({ wet: 1 })).reactions).toContain('apagou');
    expect(applyImpact(s, pure({ burn: 1 })).reactions).toContain('vapor');
    expect(s.wet).toBe(0);
  });
  it('pedra em congelado estilhaça com dano dobrado', () => {
    const a = newStatus();
    const b = newStatus();
    b.frozen = 2;
    const normal = applyImpact(a, pure({ damage: 1, solid: 1 })).damage;
    const r = applyImpact(b, pure({ damage: 1, solid: 1 }));
    expect(r.reactions).toContain('estilhaçou');
    expect(r.damage).toBe(normal * 2);
  });
  it('fogo derrete gelo; vento espalha fogo', () => {
    const s = newStatus();
    s.frozen = 2;
    expect(applyImpact(s, pure({ burn: 1 })).reactions).toContain('derreteu');
    const t = newStatus();
    applyImpact(t, pure({ burn: 1 }));
    expect(applyImpact(t, pure({ push: 1 })).reactions).toContain('espalhou');
  });
  it('magia falada de verdade combina: lavus e depois gelor congela', () => {
    const s = newStatus();
    applyImpact(s, imp('lavus'));
    expect(applyImpact(s, imp('magelor')).reactions).toContain('congelou');
  });
  it('vida chega a zero', () => {
    const s = newStatus();
    expect(applyImpact(s, pure({ damage: 100 })).killed).toBe(true);
  });
});
