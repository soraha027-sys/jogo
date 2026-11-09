import { Vector3 } from 'three';
import type { Camera } from 'three';

interface Pop {
  el: HTMLElement;
  pos: Vector3;
  age: number;
  life: number;
  rise: number;
}

const v = new Vector3();

/** Números de dano e nomes de reação flutuando sobre quem foi atingido. */
export class Popups {
  private readonly pops: Pop[] = [];
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'popups';
    parent.append(this.root);
  }

  spawn(text: string, at: Vector3, kind: string, big = false): void {
    if (this.pops.length > 40) this.kill(0);
    const el = document.createElement('span');
    el.className = `pop ${kind}${big ? ' big' : ''}`;
    el.textContent = text;
    this.root.append(el);
    const jitter = new Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    this.pops.push({
      el,
      pos: at.clone().add(jitter),
      age: 0,
      life: big ? 1.4 : 0.9,
      rise: big ? 0.9 : 1.4,
    });
  }

  private kill(i: number): void {
    this.pops[i]?.el.remove();
    this.pops.splice(i, 1);
  }

  update(dt: number, camera: Camera, w: number, h: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.kill(i);
        continue;
      }
      v.copy(p.pos);
      v.y += p.rise * (1 - (1 - p.age / p.life) ** 2);
      v.project(camera);
      const k = p.age / p.life;
      const pop = Math.min(1, p.age * 10);
      const scale = (0.6 + 0.6 * pop) * (1 - Math.max(0, k - 0.7));
      p.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      p.el.style.opacity = v.z > 1 ? '0' : String(Math.min(1, (1 - k) * 3));
    }
  }
}
