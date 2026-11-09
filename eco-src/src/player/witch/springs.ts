import { Quaternion, Vector3 } from 'three';
import type { Bone } from 'three';
import type { SpringSpec } from './rig';

const DOWN = new Vector3(0, -1, 0);
const STEP = 1 / 120;
const pq = new Quaternion();
const rq = new Quaternion();
const iq = new Quaternion();
const dq = new Quaternion();
const pivot = new Vector3();
const restDir = new Vector3();
const target = new Vector3();
const pivotVel = new Vector3();
const acc = new Vector3();
const dir = new Vector3();
const tmp = new Vector3();

interface State extends SpringSpec {
  rest: Quaternion;
  tip: Vector3;
  vel: Vector3;
  pivot: Vector3;
  ready: boolean;
}

/**
 * Movimento secundário (cabelo, saia, mangas): cada osso é um pêndulo com mola amortecida.
 * Integração em passos fixos de 1/120 s (estável em qualquer FPS). O amortecimento age na
 * velocidade RELATIVA ao ponto de apoio, então correr não deixa a peça esticada pra trás;
 * só um pouco de arrasto do ar.
 */
export class Springs {
  private readonly items: State[];

  constructor(specs: SpringSpec[]) {
    this.items = specs.map((s) => ({
      ...s,
      rest: s.bone.quaternion.clone(),
      tip: new Vector3(),
      vel: new Vector3(),
      pivot: new Vector3(),
      ready: false,
    }));
  }

  /** Volta tudo pro descanso (troca de animação brusca, teletransporte). */
  reset(): void {
    for (const s of this.items) s.ready = false;
  }

  /** Chamar depois do mixer, com as matrizes de mundo já atualizadas. */
  update(dt: number): void {
    if (dt <= 0) return;
    const frame = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(frame / STEP));
    const h = frame / n;
    const damp = (s: State): number => 2 * s.damping * Math.sqrt(s.stiffness);
    for (const s of this.items) {
      const b: Bone = s.bone;
      const parent = b.parent;
      if (!parent) continue;
      parent.getWorldQuaternion(pq);
      rq.copy(pq).multiply(s.rest);
      pivot.copy(b.position).applyMatrix4(parent.matrixWorld);
      restDir.copy(DOWN).applyQuaternion(rq);
      target.copy(pivot).addScaledVector(restDir, s.length);
      if (!s.ready || s.tip.distanceToSquared(target) > 1) {
        s.tip.copy(target);
        s.vel.set(0, 0, 0);
        s.pivot.copy(pivot);
        s.ready = true;
      }
      pivotVel.copy(pivot).sub(s.pivot).divideScalar(frame);
      s.pivot.copy(pivot);
      const c = damp(s);
      for (let i = 0; i < n; i++) {
        acc
          .copy(target)
          .sub(s.tip)
          .multiplyScalar(s.stiffness)
          .addScaledVector(tmp.copy(s.vel).sub(pivotVel), -c)
          .addScaledVector(s.vel, -s.air)
          .addScaledVector(DOWN, s.gravity);
        s.vel.addScaledVector(acc, h);
        s.tip.addScaledVector(s.vel, h);
        // comprimento fixo + limite de ângulo; tira a velocidade que empurra contra a haste
        dir.copy(s.tip).sub(pivot).normalize();
        const ang = dir.angleTo(restDir);
        if (ang > s.limit) dir.lerp(restDir, 1 - s.limit / ang).normalize();
        s.tip.copy(pivot).addScaledVector(dir, s.length);
        s.vel.addScaledVector(dir, -s.vel.dot(dir));
      }
      // direção da ponta no espaço de descanso → rotação extra do osso
      dir.copy(s.tip).sub(pivot).normalize().applyQuaternion(iq.copy(rq).invert());
      b.quaternion.copy(s.rest).multiply(dq.setFromUnitVectors(DOWN, dir));
    }
  }
}
