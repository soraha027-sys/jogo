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
    const online = button(icons.users, 'Jogadores na sala', () => undefined);
    online.className = 'online';
    const count = document.createElement('b');
    count.textContent = '1';
    online.append(count);
    top.append(online, quality, debug);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = `${icons.mouse}<span>Clique para jogar</span>`;
    root.append(top, hint);

    events.on('quality:changed', ({ id, auto }) => {
      badge.textContent = LABEL[id];
      badge.classList.toggle('auto', auto);
    });
    events.on('debug:changed', (on) => debug.classList.toggle('on', on));
    events.on('net:changed', ({ count: n, status, detail }) => {
      count.textContent = String(n);
      online.dataset.status = status;
      online.title = `${status}${detail ? ` · ${detail}` : ''} · ${n} na sala`;
      online.classList.toggle('on', n > 1);
    });
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
