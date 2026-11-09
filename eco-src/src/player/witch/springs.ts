import { Quaternion, Vector3 } from 'three';
import type { Bone } from 'three';
import type { SpringSpec } from './rig';

const DOWN = new Vector3(0, -1, 0);
const pq = new Quaternion();
const rq = new Quaternion();
const iq = new Quaternion();
const dq = new Quaternion();
const pivot = new Vector3();
const restDir = new Vector3();
const target = new Vector3();
const next = new Vector3();
const dir = new Vector3();

interface State extends SpringSpec {
  rest: Quaternion;
  tip: Vector3;
  prev: Vector3;
  ready: boolean;
}

/**
 * Movimento secundário (cabelo, saia, mangas): cada osso é um pêndulo com mola.
 * A ponta tem inércia no espaço do mundo e puxa a rotação do osso atrás dela.
 */
export class Springs {
  private readonly items: State[];

  constructor(specs: SpringSpec[]) {
    this.items = specs.map((s) => ({
      ...s,
      rest: s.bone.quaternion.clone(),
      tip: new Vector3(),
      prev: new Vector3(),
      ready: false,
    }));
  }

  /** Chamar depois do mixer, com as matrizes de mundo dos pais já atualizadas. */
  update(dt: number): void {
    const h = Math.min(dt, 1 / 30);
    for (const s of this.items) {
      const b: Bone = s.bone;
      const parent = b.parent;
      if (!parent) continue;
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(pq);
      rq.copy(pq).multiply(s.rest);
      pivot.copy(b.position).applyMatrix4(parent.matrixWorld);
      restDir.copy(DOWN).applyQuaternion(rq);
      target.copy(pivot).addScaledVector(restDir, s.length);
      if (!s.ready) {
        s.tip.copy(target);
        s.prev.copy(target);
        s.ready = true;
      }
      next
        .copy(s.tip)
        .addScaledVector(dir.copy(s.tip).sub(s.prev), 1 - s.drag)
        .addScaledVector(dir.copy(target).sub(s.tip), Math.min(1, s.stiffness * h * h * 60))
        .addScaledVector(DOWN, s.gravity * h * h);
      // mantém o comprimento e limita o ângulo em relação ao descanso
      dir.copy(next).sub(pivot).normalize();
      const ang = dir.angleTo(restDir);
      if (ang > s.limit) dir.lerp(restDir, 1 - s.limit / ang).normalize();
      next.copy(pivot).addScaledVector(dir, s.length);
      s.prev.copy(s.tip);
      s.tip.copy(next);
      // direção da ponta no espaço local de descanso → rotação extra do osso
      dir.applyQuaternion(iq.copy(rq).invert());
      b.quaternion.copy(s.rest).multiply(dq.setFromUnitVectors(DOWN, dir));
    }
  }
}
