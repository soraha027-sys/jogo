import { icons } from '../ui/icons';
import { clamp, deadzone } from './math';
import type { InputFrame, InputSource } from './types';

const RADIUS = 56;
const SENS = 0.0052;

/** Joystick virtual (metade esquerda), arrastar pra câmera (resto), botões grandes e vibração. */
export class TouchSource implements InputSource {
  private moveId = -1;
  private ox = 0;
  private oy = 0;
  private mx = 0;
  private my = 0;
  private lookId = -1;
  private lx = 0;
  private ly = 0;
  private dx = 0;
  private dy = 0;
  private jumpHeld = false;
  private sprintOn = false;
  private jumpEdge = false;
  private flyEdge = false;
  private atkEdge = false;
  private readonly atk: HTMLButtonElement;
  private readonly ac = new AbortController();
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly pad: HTMLElement;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly root: HTMLElement,
  ) {
    this.stick = el('div', 'stick');
    this.knob = el('i', '');
    this.stick.append(this.knob);
    this.pad = el('div', 'pad');
    const jump = button('jump', icons.jump, 'Pular');
    const sprint = button('sprint', icons.sprint, 'Correr');
    const fly = button('fly', icons.fly, 'Voar');
    this.pad.append(sprint, fly, jump);
    this.atk = button('atk', icons.atk, 'Atacar (E)');
    root.append(this.stick, this.pad, this.atk);
    if (matchMedia('(pointer: coarse)').matches) root.classList.add('touch');

    const o = { signal: this.ac.signal };
    canvas.addEventListener('pointerdown', (e) => this.down(e, canvas), o);
    canvas.addEventListener('pointermove', (e) => this.move(e), o);
    canvas.addEventListener('pointerup', (e) => this.up(e), o);
    canvas.addEventListener('pointercancel', (e) => this.up(e), o);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), o);

    press(jump, o, (d) => {
      this.jumpHeld = d;
      if (d) this.jumpEdge = true;
    });
    press(sprint, o, (d) => {
      if (!d) return;
      this.sprintOn = !this.sprintOn;
      sprint.classList.toggle('on', this.sprintOn);
    });
    press(fly, o, (d) => {
      if (d) this.flyEdge = true;
    });
    press(this.atk, o, (d) => {
      if (d) this.atkEdge = true;
    });
  }

  private down(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.pointerType !== 'touch') return;
    this.root.classList.add('touch');
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético ou já solto */
    }
    if (this.moveId < 0 && e.clientX < innerWidth * 0.45) {
      this.moveId = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.mx = this.my = 0;
      this.stick.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
      this.knob.style.transform = '';
      this.stick.classList.add('on');
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lx = e.clientX;
      this.ly = e.clientY;
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.moveId) {
      let x = (e.clientX - this.ox) / RADIUS;
      let y = (e.clientY - this.oy) / RADIUS;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      this.mx = x;
      this.my = y;
      this.knob.style.transform = `translate(${x * RADIUS}px, ${y * RADIUS}px)`;
    } else if (e.pointerId === this.lookId) {
      this.dx += e.clientX - this.lx;
      this.dy += e.clientY - this.ly;
      this.lx = e.clientX;
      this.ly = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.moveId) {
      this.moveId = -1;
      this.mx = this.my = 0;
      this.stick.classList.remove('on');
    } else if (e.pointerId === this.lookId) this.lookId = -1;
  }

  sample(f: InputFrame): void {
    const [x, y] = deadzone(this.mx, this.my, 0.12);
    f.moveX += x;
    f.moveY -= y;
    f.lookX += clamp(this.dx, -120, 120) * SENS;
    f.lookY += clamp(this.dy, -120, 120) * SENS;
    this.dx = this.dy = 0;
    f.jump ||= this.jumpHeld;
    f.sprint ||= this.sprintOn && (x !== 0 || y !== 0);
    f.jumpPressed ||= this.jumpEdge;
    f.flyPressed ||= this.flyEdge;
    f.attackPressed ||= this.atkEdge;
    this.jumpEdge = this.flyEdge = this.atkEdge = false;
  }

  /** Mostra no botão de atacar qual magia está equipada. */
  setEquipped(text: string): void {
    this.atk.dataset.spell = text;
  }

  /** Reflete o estado de voo no botão. */
  setFlying(on: boolean): void {
    this.pad.querySelector('.fly')?.classList.toggle('on', on);
  }

  dispose(): void {
    this.ac.abort();
    this.stick.remove();
    this.pad.remove();
    this.atk.remove();
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(cls: string, svg: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.innerHTML = svg;
  b.setAttribute('aria-label', label);
  return b;
}

function press(b: HTMLElement, o: AddEventListenerOptions, fn: (down: boolean) => void): void {
  b.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro sintético ou já solto */
      }
      b.classList.add('down');
      navigator.vibrate?.(12);
      fn(true);
    },
    o,
  );
  const up = (): void => {
    b.classList.remove('down');
    fn(false);
  };
  b.addEventListener('pointerup', up, o);
  b.addEventListener('pointercancel', up, o);
}
