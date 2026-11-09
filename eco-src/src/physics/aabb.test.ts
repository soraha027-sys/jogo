import { describe, expect, it } from 'vitest';
import { box, rayAabb, resolveCircle } from './aabb';

const b = box(0, 0, 2, 2, 0, 2);

describe('rayAabb', () => {
  it('acerta a face de entrada', () => {
    expect(rayAabb(-5, 1, 0, 1, 0, 0, b, 100)).toBeCloseTo(4);
  });
  it('erra quando passa por cima ou fica curto', () => {
    expect(rayAabb(-5, 3, 0, 1, 0, 0, b, 100)).toBe(100);
    expect(rayAabb(-5, 1, 0, 1, 0, 0, b, 3)).toBe(3);
  });
  it('origem dentro da caixa retorna 0', () => {
    expect(rayAabb(0, 1, 0, 0, 0, 1, b, 10)).toBe(0);
  });
});

describe('resolveCircle', () => {
  it('empurra pra fora pela lateral', () => {
    const p = { x: -1.2, z: 0 };
    expect(resolveCircle(p, 0.5, b)).toBe(true);
    expect(p.x).toBeCloseTo(-1.5);
  });
  it('ignora quem está longe', () => {
    const p = { x: -3, z: 0 };
    expect(resolveCircle(p, 0.5, b)).toBe(false);
    expect(p.x).toBe(-3);
  });
  it('tira o centro de dentro da caixa', () => {
    const p = { x: 0.9, z: 0 };
    resolveCircle(p, 0.5, b);
    expect(p.x).toBeCloseTo(1.5);
  });
});
