import type { Events, GameEvents } from '../core/Events';
import type { Morph } from '../spells/decode';
import type { SpellState } from '../spells/essence';
import type { Grimoire } from '../spells/Grimoire';
import type { Echo } from '../spells/interpret';
import type { Lingua } from '../spells/lingua';
import { icons } from './icons';

const ECHO: Record<Echo | 'instavel', string> = {
  limpo: 'Eco limpo',
  fraco: 'Eco fraco',
  torto: 'Eco torto',
  sem_forca: 'Sem força',
  sem_eco: 'Sem eco',
  instavel: 'Instável',
};
const STATE: Record<SpellState, string> = {
  harmonico: 'harmônico',
  turbulento: 'turbulento',
  ligado: 'ligado',
  instavel: 'instável',
};

export interface CastView {
  echo: Echo | 'instavel';
  morphs: Morph[];
  reading: string;
  state: SpellState | null;
  /** Explicação curta quando algo deu errado (por quê, não só o quê). */
  why: string;
  isNew: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** HUD de magia: microfone, fala já na língua do jogo, resultado, mana, bilhete e fala de teste. */
export class SpellHud {
  private readonly mic = el('button', 'mic', icons.micOff);
  private readonly heard = el('div', 'heard');
  private readonly result = el('div', 'result');
  private readonly error = el('div', 'voice-error');
  private readonly mana = el('i');
  private readonly panel = el('div', 'grimoire');
  private hideAt = 0;
  private errorAt = 0;
  private time = 0;

  constructor(
    root: HTMLElement,
    events: Events<GameEvents>,
    private readonly data: Lingua,
    private readonly grimoire: Grimoire,
    actions: { toggleMic(): void; say(text: string, preset?: number): void },
    presets: string[],
  ) {
    this.mic.setAttribute('aria-label', 'Microfone');
    this.mic.addEventListener('click', () => {
      actions.toggleMic();
      this.mic.blur();
    });
    const voice = el('div', 'voice');
    voice.append(this.error, this.mic);
    // a fala e o resultado ficam no alto: embaixo cobririam a personagem
    const out = el('div', 'spellout');
    out.append(this.heard, this.result);
    const bar = el('div', 'mana');
    bar.append(this.mana);

    // fala de teste: botões 1-5 e campo de texto (aparecem com o debug ou se o microfone falhar)
    const test = el('form', 'say');
    presets.forEach((p, i) => {
      const b = el('button', '', String(i + 1));
      b.type = 'button';
      b.title = p;
      b.addEventListener('click', () => actions.say('', i + 1));
      test.append(b);
    });
    const input = el('input');
    input.placeholder = 'digite na língua';
    input.enterKeyHint = 'send';
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    test.append(input);
    test.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) actions.say(input.value);
      input.value = '';
      input.blur();
    });
    test.hidden = true;

    const book = el('button', '', icons.book);
    book.setAttribute('aria-label', 'Bilhete');
    book.addEventListener('click', () => {
      this.renderPanel();
      this.panel.hidden = false;
      book.blur();
    });
    root.querySelector('.top')?.prepend(book);
    this.panel.hidden = true;
    root.append(bar, test, out, voice, this.panel);

    events.on('mic:changed', (on) => {
      this.mic.classList.toggle('on', on);
      this.mic.innerHTML = on ? icons.mic : icons.micOff;
      if (on) this.error.textContent = '';
      else this.heard.textContent = '';
    });
    events.on('voice:interim', (text) => {
      this.heard.className = 'heard live';
      this.heard.textContent = text;
    });
    events.on('voice:error', (msg) => {
      this.error.textContent = msg;
      this.errorAt = this.time + 6;
      test.hidden = false; // sem microfone ainda dá pra jogar digitando
    });
    events.on('debug:changed', (on) => (test.hidden = !on));
  }

  showCast(v: CastView): void {
    this.heard.className = 'heard';
    // cada morfema com a cor de quão bem soou
    this.heard.replaceChildren(
      ...v.morphs
        .filter((m) => m.kind !== 'linker')
        .map((m, i, all) => {
          const s = el('span', m.cost < 0.15 ? 'ok' : m.cost < 0.7 ? 'short' : 'near');
          const next = all[i + 1];
          s.textContent = m.id + (m.kind === 'ending' && next ? ' ' : next ? '·' : '');
          return s;
        }),
    );
    this.result.className = `result show ${v.echo}`;
    this.result.innerHTML =
      `<b>${ECHO[v.echo]}</b>` +
      (v.reading ? `<span>${v.reading}</span>` : '') +
      (v.state && v.echo !== 'instavel' ? `<i class="${v.state}">${STATE[v.state]}</i>` : '') +
      (v.isNew ? '<em>nova magia</em>' : '') +
      (v.why ? `<small>${v.why}</small>` : '');
    this.hideAt = this.time + (v.why ? 6 : 4);
  }

  update(dt: number, mana01: number, level: number): void {
    this.time += dt;
    this.mana.style.transform = `scaleX(${mana01.toFixed(3)})`;
    this.mic.style.setProperty('--level', level.toFixed(2));
    if (this.hideAt && this.time > this.hideAt) {
      this.hideAt = 0;
      this.result.classList.remove('show');
      this.heard.textContent = '';
    }
    if (this.errorAt && this.time > this.errorAt) {
      this.errorAt = 0;
      this.error.textContent = '';
    }
  }

  private renderPanel(): void {
    const d = this.data;
    const rows = (o: Record<string, { gloss: string }>, dash: 'pre' | 'post' | ''): string =>
      Object.entries(o)
        .map(
          ([id, m]) =>
            `<li><b>${dash === 'post' ? '-' : ''}${id}${dash === 'pre' ? '-' : ''}</b><span>${m.gloss}</span></li>`,
        )
        .join('');
    const found = this.grimoire.list();
    this.panel.innerHTML = `
      <div class="card">
        <button class="x" aria-label="Fechar">${icons.close}</button>
        <h2>Bilhete da tataravó</h2>
        <p>Uma palavra é <b>prefixos + raízes + terminação</b>. Ex.: <b>la·vent·us</b>.</p>
        <p>Uma segunda palavra se infunde na primeira: <b>ventus gelus</b>.</p>
        <h3>Raízes · a essência</h3><ul>${rows(d.roots, '')}</ul>
        <h3>Terminações · a forma</h3><ul>${rows(d.endings, 'post')}</ul>
        <h3>Prefixos</h3><ul>${rows(d.prefixes, 'pre')}</ul>
        <h3>Leis</h3>
        <p>A 1ª raiz domina; as seguintes se misturam nela (<b>ventigelus</b> não é <b>geliventus</b>).</p>
        <p>Essências opostas brigam: pouca briga deixa a magia turbulenta, muita faz ela estourar na mão. <b>ko-</b> liga os opostos e transforma a briga em potência.</p>
        <p>Sem terminação a essência não toma forma.</p>
        <h3>Já ecoaram (${found.length})</h3>
        <ul>${
          found
            .map((e) => `<li><b>${e.text}</b><span>${e.reading} · ${e.casts}x</span></li>`)
            .join('') || '<li><span>Nenhuma ainda.</span></li>'
        }</ul>
      </div>`;
    this.panel.querySelector('.x')?.addEventListener('click', () => (this.panel.hidden = true));
  }
}
