import type { Material, Mesh } from 'three';
import type { DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { Events, GameEvents } from '../core/Events';
import { AutoDetector, QUALITY_ORDER, type QualityId } from './auto';

interface Profile {
  pixelRatio: number;
  shadows: number; // tamanho do shadow map; 0 = sem sombra
  post: boolean;
}

const PROFILES: Record<QualityId, Profile> = {
  low: { pixelRatio: 1, shadows: 0, post: false },
  medium: { pixelRatio: 1.5, shadows: 1024, post: false },
  high: { pixelRatio: 2, shadows: 2048, post: true },
};
const KEY = 'eco.quality';

export class QualityManager {
  id: QualityId = 'medium';
  auto = true;
  private composer: EffectComposer | null = null;
  private readonly detector = new AutoDetector();
  private w = 1;
  private h = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly sun: DirectionalLight,
    private readonly events: Events<GameEvents>,
  ) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* armazenamento indisponível */
    }
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      this.id = saved;
      this.auto = false;
    }
    this.apply(this.id);
  }

  /** Troca manual: desliga a detecção e lembra a escolha. */
  cycle(): void {
    const next = QUALITY_ORDER[(QUALITY_ORDER.indexOf(this.id) + 1) % QUALITY_ORDER.length];
    this.auto = false;
    try {
      localStorage.setItem(KEY, next ?? 'medium');
    } catch {
      /* armazenamento indisponível */
    }
    this.apply(next ?? 'medium');
  }

  private apply(id: QualityId): void {
    const p = PROFILES[id];
    const r = this.renderer;
    this.id = id;
    const shadows = p.shadows > 0;
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        const m = (o as Mesh).material as Material | Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== p.shadows) {
      this.sun.shadow.mapSize.set(p.shadows, p.shadows);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    r.setPixelRatio(Math.min(devicePixelRatio, p.pixelRatio));
    this.composer?.dispose();
    this.composer = null;
    if (p.post) {
      void import('./post').then(({ createComposer }) => {
        if (this.id !== id) return;
        this.composer = createComposer(r, this.scene, this.camera);
        this.resize(this.w, this.h);
      });
    }
    this.resize(this.w, this.h);
    this.events.emit('quality:changed', { id, auto: this.auto });
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
  }

  render(dt: number): void {
    if (this.auto) {
      const next = this.detector.sample(dt, this.id);
      if (next) this.apply(next);
      if (this.detector.done) {
        this.auto = false;
        this.events.emit('quality:changed', { id: this.id, auto: false });
      }
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
