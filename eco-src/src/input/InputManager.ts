import { emptyFrame, type InputFrame, type InputSource } from './types';

export class InputManager {
  readonly frame: InputFrame = emptyFrame();
  private readonly sources: InputSource[] = [];

  add(source: InputSource): void {
    this.sources.push(source);
  }

  /** Uma vez por quadro. Eixos são recalculados; bordas acumulam até `consumeEdges`. */
  sample(dt: number): void {
    const f = this.frame;
    f.moveX = f.moveY = f.lookX = f.lookY = 0;
    f.jump = f.sprint = f.castHeld = false;
    for (const s of this.sources) s.sample(f, dt);
    const len = Math.hypot(f.moveX, f.moveY);
    if (len > 1) {
      f.moveX /= len;
      f.moveY /= len;
    }
  }

  consumeEdges(): void {
    const f = this.frame;
    f.jumpPressed = f.flyPressed = f.micPressed = f.debugPressed = false;
    f.sitPressed = f.wavePressed = f.attackPressed = f.viewPressed = false;
    f.debugSay = 0;
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
    this.sources.length = 0;
  }
}
