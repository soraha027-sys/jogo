import type { WebGLRenderer } from 'three';

export interface DebugInfo {
  quality: string;
  state: string;
  pos: { x: number; y: number; z: number };
  mic: boolean;
  /** ms; null enquanto não há rede (M3). */
  ping: number | null;
  /** Última fala: o que o reconhecedor ouviu e como foi decodificada. */
  voice: string;
}

/** Overlay de debug: FPS, ms, draw calls, triângulos, ping, estado. Atualiza 4x/s. */
export class DebugOverlay {
  private readonly el = document.createElement('pre');
  private acc = 0;
  private frames = 0;
  private worst = 0;

  constructor(
    root: HTMLElement,
    private readonly renderer: WebGLRenderer,
    visible: boolean,
  ) {
    this.el.className = 'debug';
    this.el.hidden = !visible;
    root.append(this.el);
    renderer.info.autoReset = false; // soma todos os passes do quadro (sombra, pós)
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  toggle(): boolean {
    this.el.hidden = !this.el.hidden;
    return this.visible;
  }

  /** Chamar depois do render. */
  update(dt: number, info: () => DebugInfo): void {
    const r = this.renderer.info.render;
    const calls = r.calls;
    const tris = r.triangles;
    this.renderer.info.reset();
    this.acc += dt;
    this.frames++;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.25) return;
    if (this.visible) {
      const i = info();
      const f = (n: number): string => n.toFixed(1).padStart(6);
      this.el.textContent =
        `FPS   ${(this.frames / this.acc).toFixed(0).padStart(3)}  pior ${(this.worst * 1000).toFixed(0)} ms\n` +
        `draw  ${String(calls).padStart(3)}  tris ${(tris / 1000).toFixed(1)}k\n` +
        `qual  ${i.quality}\n` +
        `ping  ${i.ping === null ? 'offline' : i.ping + ' ms'}\n` +
        `mic   ${i.mic ? 'ligado' : 'desligado'}\n` +
        `${i.state}\n${f(i.pos.x)}${f(i.pos.y)}${f(i.pos.z)}` +
        (i.voice ? `\n${i.voice}` : '');
    }
    this.acc = this.frames = this.worst = 0;
  }
}
