import type { InputFrame, InputSource } from './types';

const SENS = 0.0022;

/** WASD + mouse com pointer lock. Espaço pula, Shift corre, F voa, M mic, F3 debug. */
export class KeyboardMouse implements InputSource {
  private readonly keys = new Set<string>();
  private readonly edges = new Set<string>();
  private dx = 0;
  private dy = 0;
  private readonly ac = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onLock: (locked: boolean) => void,
  ) {
    const o = { signal: this.ac.signal };
    addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.code === 'F3' || e.code === 'Space') e.preventDefault();
        if (!e.repeat) this.edges.add(e.code);
        this.keys.add(e.code);
      },
      o,
    );
    addEventListener('keyup', (e) => this.keys.delete(e.code), o);
    addEventListener('blur', () => this.keys.clear(), o);
    canvas.addEventListener(
      'mousedown',
      (e) => {
        if (document.pointerLockElement === canvas && e.button === 0) this.edges.add('KeyE');
      },
      o,
    );
    canvas.addEventListener(
      'click',
      () => {
        if (document.pointerLockElement !== canvas && matchMedia('(pointer: fine)').matches)
          void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
      },
      o,
    );
    document.addEventListener(
      'pointerlockchange',
      () => onLock(document.pointerLockElement === canvas),
      o,
    );
    addEventListener(
      'mousemove',
      (e) => {
        if (document.pointerLockElement !== this.canvas) return;
        this.dx += e.movementX;
        this.dy += e.movementY;
      },
      o,
    );
  }

  sample(f: InputFrame): void {
    const k = this.keys;
    f.moveX +=
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    f.moveY +=
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    f.jump ||= k.has('Space');
    f.sprint ||= k.has('ShiftLeft') || k.has('ShiftRight');
    f.castHeld ||= k.has('KeyQ');
    f.lookX += this.dx * SENS;
    f.lookY += this.dy * SENS;
    this.dx = this.dy = 0;
    const e = this.edges;
    f.jumpPressed ||= e.has('Space');
    f.flyPressed ||= e.has('KeyF');
    f.micPressed ||= e.has('KeyM');
    f.debugPressed ||= e.has('F3');
    f.sitPressed ||= e.has('KeyC');
    f.wavePressed ||= e.has('KeyV');
    f.attackPressed ||= e.has('KeyE');
    f.viewPressed ||= e.has('KeyP');
    for (let n = 1; n <= 5; n++) if (e.has(`Digit${n}`)) f.debugSay = n;
    e.clear();
  }

  dispose(): void {
    this.ac.abort();
  }
}
