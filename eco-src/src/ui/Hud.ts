import type { Events, GameEvents } from '../core/Events';
import type { QualityId } from '../quality/auto';
import { icons } from './icons';
import './hud.css';

const LABEL: Record<QualityId, string> = { low: 'B', medium: 'M', high: 'A' };

/** HUD mínimo do M0: qualidade, debug e dica de captura do mouse. */
export class Hud {
  constructor(
    root: HTMLElement,
    events: Events<GameEvents>,
    actions: { cycleQuality(): void; toggleDebug(): void },
  ) {
    const top = document.createElement('div');
    top.className = 'top';
    const quality = button(icons.quality, 'Qualidade', actions.cycleQuality);
    const badge = document.createElement('b');
    quality.append(badge);
    const debug = button(icons.debug, 'Debug', actions.toggleDebug);
    top.append(quality, debug);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = `${icons.mouse}<span>Clique para jogar</span>`;
    root.append(top, hint);

    events.on('quality:changed', ({ id, auto }) => {
      badge.textContent = LABEL[id];
      badge.classList.toggle('auto', auto);
    });
    events.on('debug:changed', (on) => debug.classList.toggle('on', on));
    this.setLocked = (locked) => hint.classList.toggle('off', locked);
  }

  readonly setLocked: (locked: boolean) => void;
}

function button(svg: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerHTML = svg;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => {
    onClick();
    b.blur();
  });
  return b;
}
