import { describe, expect, it } from 'vitest';
import { FixedLoop } from './Loop';

function make(hz: number, maxSteps = 100) {
  const log = { fixed: 0, frames: 0, alpha: 0 };
  const loop = new FixedLoop(
    {
      begin: () => undefined,
      fixed: () => void log.fixed++,
      frame: (_dt, a) => {
        log.frames++;
        log.alpha = a;
      },
    },
    hz,
    maxSteps,
  );
  return { loop, log };
}

describe('FixedLoop', () => {
  it('roda passos fixos conforme o tempo acumulado', () => {
    const { loop, log } = make(50);
    loop.tick(0);
    expect(log.fixed).toBe(0);
    loop.tick(110);
    expect(log.fixed).toBe(5);
    expect(log.frames).toBe(2);
  });

  it('entrega alpha entre 0 e 1 para interpolação', () => {
    const { loop, log } = make(50);
    loop.tick(0);
    loop.tick(30);
    expect(log.fixed).toBe(1);
    expect(log.alpha).toBeCloseTo(0.5, 5);
  });

  it('limita passos por quadro e descarta o atraso', () => {
    const { loop, log } = make(60, 5);
    loop.tick(0);
    loop.tick(5000);
    expect(log.fixed).toBe(5);
    expect(log.alpha).toBeLessThan(1);
    loop.tick(5016);
    expect(log.fixed).toBeLessThanOrEqual(7);
  });
});
