import { describe, expect, it } from 'vitest';
import { AutoDetector, nextProfile, type QualityId } from './auto';

function run(fps: (q: QualityId) => number): QualityId {
  const d = new AutoDetector();
  let q: QualityId = 'medium';
  for (let i = 0; i < 2000 && !d.done; i++) q = d.sample(1 / fps(q), q) ?? q;
  return q;
}

describe('qualidade automática', () => {
  it('regras de troca', () => {
    expect(nextProfile('medium', 30)).toBe('low');
    expect(nextProfile('medium', 50)).toBe('medium');
    expect(nextProfile('medium', 60)).toBe('high');
    expect(nextProfile('high', 40)).toBe('medium');
    expect(nextProfile('low', 120)).toBe('low');
  });
  it('aparelho fraco cai pra baixo', () => expect(run(() => 28)).toBe('low'));
  it('aparelho forte sobe pra alto e fica', () => expect(run(() => 60)).toBe('high'));
  it('volta pro médio se o alto não aguenta', () =>
    expect(run((q) => (q === 'high' ? 35 : 60))).toBe('medium'));
  it('ignora quadros com a aba parada', () => {
    const d = new AutoDetector();
    expect(d.sample(5, 'medium')).toBeNull();
    expect(d.done).toBe(false);
  });
});
