import { CircleGeometry, Color, Mesh, MeshBasicMaterial } from 'three';
import type { Scene } from 'three';

export type ZoneKind = 'poca' | 'gelo' | 'fogo' | 'vapor';

export interface Zone {
  kind: ZoneKind;
  x: number;
  z: number;
  r: number;
  life: number;
  mesh: Mesh;
}

const COLOR: Record<ZoneKind, number> = {
  poca: 0x3f8cff,
  gelo: 0xbfeaff,
  fogo: 0xff6a1a,
  vapor: 0xe8f0f6,
};
const OPACITY: Record<ZoneKind, number> = { poca: 0.55, gelo: 0.75, fogo: 0.5, vapor: 0.0 };
const LIFE: Record<ZoneKind, number> = { poca: 9, gelo: 8, fogo: 4.5, vapor: 5 };
const MAX = 14;
const geo = new CircleGeometry(1, 20).rotateX(-Math.PI / 2);

/**
 * Marcas no chão que as magias deixam e que reagem entre si:
 * poça (molha, escorrega) · gelo (escorrega muito) · fogo (queima) · vapor (nuvem que esconde).
 * Frio numa poça vira gelo; fogo numa poça vira vapor; fogo no gelo vira poça.
 */
export class Zones {
  readonly list: Zone[] = [];

  constructor(private readonly scene: Scene) {}

  add(kind: ZoneKind, x: number, z: number, r: number): void {
    // mesma coisa no mesmo lugar: só renova e cresce um pouco
    const same = this.list.find(
      (s) => s.kind === kind && Math.hypot(s.x - x, s.z - z) < Math.max(s.r, r) * 0.6,
    );
    if (same) {
      same.life = LIFE[kind];
      same.r = Math.min(6, Math.max(same.r, r) + 0.2);
      same.mesh.scale.setScalar(same.r);
      return;
    }
    if (this.list.length >= MAX) this.remove(this.list[0]);
    const mesh = new Mesh(
      geo,
      new MeshBasicMaterial({
        color: new Color(COLOR[kind]),
        transparent: true,
        opacity: OPACITY[kind],
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.position.set(x, 0.02 + this.list.length * 0.002, z);
    mesh.scale.setScalar(r);
    mesh.renderOrder = 1;
    mesh.visible = kind !== 'vapor';
    this.scene.add(mesh);
    this.list.push({ kind, x, z, r, life: LIFE[kind], mesh });
  }

  private remove(z: Zone | undefined): void {
    if (!z) return;
    this.scene.remove(z.mesh);
    (z.mesh.material as MeshBasicMaterial).dispose();
    this.list.splice(this.list.indexOf(z), 1);
  }

  /** Um elemento caiu numa área: transforma as zonas que ele toca. */
  react(element: 'burn' | 'chill' | 'wet', x: number, z: number, r: number): void {
    for (const s of [...this.list]) {
      if (Math.hypot(s.x - x, s.z - z) > s.r + r) continue;
      if (element === 'chill' && s.kind === 'poca') this.convert(s, 'gelo');
      else if (element === 'burn' && s.kind === 'poca') this.convert(s, 'vapor');
      else if (element === 'burn' && s.kind === 'gelo') this.convert(s, 'poca');
      else if (element === 'wet' && s.kind === 'fogo') this.convert(s, 'vapor');
    }
  }

  private convert(s: Zone, kind: ZoneKind): void {
    this.remove(s);
    this.add(kind, s.x, s.z, s.r);
  }

  at(x: number, z: number, kind: ZoneKind): Zone | undefined {
    return this.list.find((s) => s.kind === kind && Math.hypot(s.x - x, s.z - z) < s.r);
  }

  /** O chão debaixo de alguém (pra escorregar). */
  surface(x: number, z: number): 'gelo' | 'poca' | null {
    return this.at(x, z, 'gelo') ? 'gelo' : this.at(x, z, 'poca') ? 'poca' : null;
  }

  update(dt: number): void {
    for (const s of [...this.list]) {
      s.life -= dt;
      const fade = Math.min(1, s.life / 1.2);
      (s.mesh.material as MeshBasicMaterial).opacity = OPACITY[s.kind] * fade;
      if (s.life <= 0) this.remove(s);
    }
  }
}
