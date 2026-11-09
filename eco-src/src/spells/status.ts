import type { Impact } from './impact';
import { LINGUA, type Lingua } from './lingua';

/** Estado de quem pode ser atingido (boneco hoje; jogador e criaturas depois). */
export interface Status {
  hp: number;
  maxHp: number;
  /** Segundos restantes de cada condição. */
  burning: number;
  wet: number;
  frozen: number;
  stunned: number;
  /** Acúmulos de frio (congela ao chegar em `chillToFreeze`). */
  chill: number;
}

export type Reaction =
  'congelou' | 'vapor' | 'estilhaçou' | 'derreteu' | 'apagou' | 'espalhou' | 'secou';

export interface HitResult {
  damage: number;
  reactions: Reaction[];
  killed: boolean;
}

export function newStatus(d: Lingua = LINGUA): Status {
  return {
    hp: d.combat.hp,
    maxHp: d.combat.hp,
    burning: 0,
    wet: 0,
    frozen: 0,
    stunned: 0,
    chill: 0,
  };
}

/**
 * Aplica um impacto. As reações saem dos ESTADOS se encontrando, não de combos cadastrados:
 * molhado + frio congela na hora · queimando + água apaga · fogo em molhado vira vapor ·
 * fogo em congelado derrete · pedra em congelado estilhaça (dano dobrado) ·
 * vento em quem queima espalha o fogo.
 */
export function applyImpact(s: Status, imp: Impact, d: Lingua = LINGUA): HitResult {
  const c = d.combat;
  const reactions: Reaction[] = [];
  let damage = imp.damage * c.damageUnit;

  if (imp.dry > 0.05 && s.wet > 0) {
    s.wet = 0;
    reactions.push('secou');
  }
  // pedra em gelo: estilhaça antes de qualquer coisa derreter
  if (s.frozen > 0 && imp.solid > 0.3) {
    damage *= 2;
    s.frozen = 0;
    reactions.push('estilhaçou');
  }
  if (imp.burn > 0.05) {
    if (s.frozen > 0) {
      s.frozen = 0;
      s.wet = Math.max(s.wet, 3);
      reactions.push('derreteu');
    } else if (s.wet > 0) {
      s.wet = 0;
      damage += c.damageUnit * 0.5;
      reactions.push('vapor');
    } else s.burning = Math.max(s.burning, c.burnSeconds * Math.min(2, imp.burn));
    s.chill = Math.max(0, s.chill - imp.burn * 2);
  }
  if (imp.wet > 0.05) {
    if (s.burning > 0) {
      s.burning = 0;
      reactions.push('apagou');
    }
    s.wet = Math.max(s.wet, c.wetSeconds * Math.min(1.5, imp.wet));
  }
  if (imp.chill > 0.05 && s.frozen <= 0) {
    if (s.wet > 0) {
      s.wet = 0;
      s.chill = 0;
      s.frozen = c.freezeSeconds * 1.2;
      reactions.push('congelou');
    } else {
      s.chill += imp.chill;
      s.burning = Math.max(0, s.burning - imp.chill * 2);
      if (s.chill >= c.chillToFreeze) {
        s.chill = 0;
        s.frozen = c.freezeSeconds;
        reactions.push('congelou');
      }
    }
  }
  if (imp.push > 0.3 && s.burning > 0) reactions.push('espalhou');
  if (imp.vapor && !reactions.includes('vapor')) {
    damage *= 1.5;
    reactions.push('vapor');
  }
  if (imp.stun > 0.05) s.stunned = Math.max(s.stunned, c.stunSeconds * Math.min(2, imp.stun));
  if (s.frozen > 0) s.stunned = Math.max(s.stunned, s.frozen);

  s.hp = Math.max(0, s.hp - damage);
  return { damage, reactions, killed: s.hp <= 0 };
}

/** Passa o tempo: queimadura tira vida; o resto só expira. Devolve o dano do quadro. */
export function tickStatus(s: Status, dt: number, d: Lingua = LINGUA): number {
  let damage = 0;
  if (s.burning > 0) {
    damage = d.combat.burnDps * Math.min(dt, s.burning);
    s.burning = Math.max(0, s.burning - dt);
    s.hp = Math.max(0, s.hp - damage);
  }
  s.wet = Math.max(0, s.wet - dt);
  s.frozen = Math.max(0, s.frozen - dt);
  s.stunned = Math.max(0, s.stunned - dt);
  if (s.frozen <= 0) s.chill = Math.max(0, s.chill - dt * 0.4);
  return damage;
}
