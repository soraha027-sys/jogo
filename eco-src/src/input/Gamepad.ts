import { deadzone } from './math';
import type { InputFrame, InputSource } from './types';

const LOOK_RATE = 2.8; // rad/s com o analógico no talo
const B = { jump: 0, sprint: 1, mic: 2, fly: 3, rt: 7, debug: 8, wave: 12, sit: 13 } as const;

/** Gamepad padrão: esq. move, dir. câmera, A pula, B/RT corre, Y voa, X mic, Select debug. */
export class GamepadSource implements InputSource {
  private prev: boolean[] = [];

  sample(f: InputFrame, dt: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p?.connected) pad = pad ?? p;
    if (!pad) return;
    const ax = (i: number): number => pad.axes[i] ?? 0;
    const down = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
    const hit = (i: number): boolean => down(i) && !(this.prev[i] ?? false);

    const [mx, my] = deadzone(ax(0), ax(1), 0.18);
    const [lx, ly] = deadzone(ax(2), ax(3), 0.15);
    f.moveX += mx;
    f.moveY -= my;
    f.lookX += lx * Math.abs(lx) * LOOK_RATE * dt;
    f.lookY += ly * Math.abs(ly) * LOOK_RATE * 0.7 * dt;
    f.jump ||= down(B.jump);
    f.sprint ||= down(B.sprint) || down(B.rt);
    f.jumpPressed ||= hit(B.jump);
    f.flyPressed ||= hit(B.fly);
    f.micPressed ||= hit(B.mic);
    f.debugPressed ||= hit(B.debug);
    f.sitPressed ||= hit(B.sit);
    f.wavePressed ||= hit(B.wave);
    this.prev = pad.buttons.map((b) => b.pressed);
  }

  dispose(): void {
    this.prev = [];
  }
}
