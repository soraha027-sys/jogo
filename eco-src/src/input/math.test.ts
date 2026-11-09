import { describe, expect, it } from 'vitest';
import { angleDelta, deadzone } from './math';

describe('deadzone', () => {
  it('zera dentro da zona morta', () => {
    expect(deadzone(0.1, 0.05, 0.2)).toEqual([0, 0]);
  });
  it('reescala mantendo direção e borda em 1', () => {
    const [x, y] = deadzone(1, 0, 0.2);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
    const [hx] = deadzone(0.6, 0, 0.2);
    expect(hx).toBeCloseTo(0.5);
  });
  it('nunca passa de 1', () => {
    const [x, y] = deadzone(1, 1, 0.2);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
  });
});

describe('angleDelta', () => {
  it('pega o caminho mais curto', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
    expect(angleDelta(0, 1)).toBeCloseTo(1);
  });
});
