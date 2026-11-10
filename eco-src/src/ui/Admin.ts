import type { ParsedWord } from '../spells/decode';
import type { Lingua } from '../spells/lingua';
import { icons } from './icons';

/** O que o painel precisa do jogo. */
export interface AdminActions {
  /** Lê a magia sem lançar (prévia). */
  preview(words: ParsedWord[]): { reading: string; state: string } | null;
  /** Equipa a magia (E / clique / botão de ataque relançam). */
  equip(words: ParsedWord[]): void;
  /** Lança agora e equipa. */
  cast(words: ParsedWord[]): void;
  setInfinite(on: boolean): void;
}

type Word = ParsedWord;

const COLOR: Record<string, string> = {
  pir: '#ff7a3d',
  vent: '#8fe3c9',
  gel: '#9fd8ff',
  lav: '#4aa3ff',
  ter: '#b08a5a',
  kor: '#b067ff',
};
const MAX_ROOTS = 3;
const KEY = 'eco.adm';

const blank = (): Word => ({ prefixes: [], roots: [], ending: 'us' });
const NO_END = '·';

/** Junta peças em palavra: prefixos + raízes ligadas por "i" + terminação. */
export function wordText(w: Word): string {
  if (!w.roots.length) return '';
  return w.prefixes.join('') + w.roots.join('i') + (w.ending ?? '');
}

/** Lê uma palavra escrita no jeito canônico (ex.: "kopirigelor") de volta em peças. */
export function parseWord(text: string, d: Lingua): Word | null {
  const pres = Object.keys(d.prefixes);
  const roots = Object.keys(d.roots);
  const ends = Object.keys(d.endings);
  // estado: 0 prefixos, 1 raízes; tenta todas as divisões e fica com a primeira que fecha
  const go = (rest: string, w: Word, stage: number): Word | null => {
    if (!rest) return w.roots.length ? w : null;
    if (stage === 0)
      for (const k of pres)
        if (rest.startsWith(k)) {
          const r = go(rest.slice(k.length), { ...w, prefixes: [...w.prefixes, k] }, 0);
          if (r) return r;
        }
    for (const k of roots) {
      const after = rest.startsWith(k) ? rest.slice(k.length) : null;
      if (after === null) continue;
      const next = { ...w, roots: [...w.roots, k] };
      const r = go(after, next, 1) ?? (after.startsWith('i') ? go(after.slice(1), next, 2) : null);
      if (r) return r;
    }
    if (stage === 1 && ends.includes(rest)) return { ...w, ending: rest };
    return null;
  };
  return go(text, { prefixes: [], roots: [], ending: null }, 0);
}

/** Painel de administrador: monta e pega qualquer feitiço sem falar. */
export class AdminPanel {
  private readonly panel = document.createElement('div');
  private readonly words: [Word, Word | null] = [blank(), null];
  private editing = 0;
  private infinite = false;

  constructor(
    root: HTMLElement,
    private readonly data: Lingua,
    private readonly actions: AdminActions,
  ) {
    try {
      this.infinite = localStorage.getItem(KEY) === '1';
    } catch {
      /* sem armazenamento */
    }
    actions.setInfinite(this.infinite);
    const btn = document.createElement('button');
    btn.className = 'adm-btn';
    btn.textContent = 'ADM';
    btn.setAttribute('aria-label', 'Painel de administrador');
    btn.addEventListener('click', () => {
      this.render();
      this.panel.hidden = false;
      btn.blur();
    });
    root.querySelector('.top')?.prepend(btn);
    this.panel.className = 'grimoire adm';
    this.panel.hidden = true;
    // cliques no painel não podem virar ataque/mira no jogo
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown']) {
      this.panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    this.panel.addEventListener('click', (e) => this.onClick(e));
    root.append(this.panel);
  }

  private built(): Word[] {
    return this.words.filter((w): w is Word => !!w && w.roots.length > 0);
  }
  private text(): string {
    return this.built().map(wordText).join(' ');
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!t) {
      if (e.target === this.panel) this.panel.hidden = true;
      return;
    }
    const a = t.dataset.a ?? '';
    const v = t.dataset.v ?? '';
    const w = this.words[this.editing] ?? this.words[0];
    switch (a) {
      case 'close':
        this.panel.hidden = true;
        return;
      case 'pre': {
        const i = w.prefixes.indexOf(v);
        if (i >= 0) w.prefixes.splice(i, 1);
        else w.prefixes.push(v);
        break;
      }
      case 'root': {
        const i = w.roots.lastIndexOf(v);
        if (i >= 0 && i === w.roots.length - 1) w.roots.pop();
        else if (w.roots.length < MAX_ROOTS) w.roots.push(v);
        break;
      }
      case 'end':
        w.ending = v === NO_END ? null : v;
        break;
      case 'word':
        if (v === '1' && !this.words[1]) this.words[1] = blank();
        this.editing = v === '1' ? 1 : 0;
        break;
      case 'drop2':
        this.words[1] = null;
        this.editing = 0;
        break;
      case 'clear':
        this.words[0] = blank();
        this.words[1] = null;
        this.editing = 0;
        break;
      case 'inf':
        this.infinite = !this.infinite;
        this.actions.setInfinite(this.infinite);
        try {
          localStorage.setItem(KEY, this.infinite ? '1' : '0');
        } catch {
          /* sem armazenamento */
        }
        break;
      case 'equip':
      case 'cast': {
        const words = v ? v.split(' ').flatMap((t) => parseWord(t, this.data) ?? []) : this.built();
        if (!words.length) return;
        this.panel.hidden = true;
        if (a === 'equip') this.actions.equip(words);
        else this.actions.cast(words);
        return;
      }
    }
    this.render();
  }

  private render(): void {
    const d = this.data;
    const w = this.words[this.editing] ?? this.words[0];
    const chip = (a: string, v: string, label: string, on: boolean, color = ''): string =>
      `<button type="button" class="chip${on ? ' on' : ''}" data-a="${a}" data-v="${v}"${
        color ? ` style="--c:${color}"` : ''
      }>${label}</button>`;
    const text = this.text();
    const p = text ? this.actions.preview(this.built()) : null;
    const roots = Object.keys(d.roots);
    const endings = Object.keys(d.endings);
    // prontas: cada raiz com cada forma + misturas clássicas
    const ready = roots
      .map(
        (r) =>
          `<div class="row">${endings
            .map((e) => chip('equip', r + e, r + e, false, COLOR[r]))
            .join('')}</div>`,
      )
      .join('');
    const combos = [
      'ventus gelus',
      'kopirigelor',
      'laventus gel',
      'malavum',
      'mapirum',
      'maventar',
      'korus',
      'terigelia',
      'kopirilavus',
      'mapira',
    ];
    const tabs = this.words[1]
      ? `${chip('word', '0', '1ª palavra', this.editing === 0)}${chip('word', '1', '2ª palavra', this.editing === 1)}${chip('drop2', '', '✕ 2ª', false)}`
      : chip('word', '1', '+ 2ª palavra (infunde)', false);
    this.panel.innerHTML = `
      <div class="card">
        <button class="x" data-a="close" aria-label="Fechar">${icons.close}</button>
        <h2>ADM · qualquer feitiço</h2>
        <p>${chip('inf', '', this.infinite ? 'Mana infinita: ligada' : 'Mana infinita: desligada', this.infinite)}</p>
        <h3>Montar</h3>
        <div class="row">${tabs}</div>
        <div class="row">${Object.keys(d.prefixes)
          .map((k) => chip('pre', k, `${k}-`, w.prefixes.includes(k)))
          .join('')}</div>
        <div class="row">${roots
          .map((k) => {
            const n = w.roots.filter((r) => r === k).length;
            return chip('root', k, k + (n > 1 ? ` ×${n}` : ''), n > 0, COLOR[k]);
          })
          .join('')}</div>
        <div class="row">${endings.map((k) => chip('end', k, `-${k}`, w.ending === k)).join('')}${chip('end', NO_END, 'sem', w.ending === null)}</div>
        <div class="adm-out">
          <b>${text || 'escolha uma raiz'}</b>
          <span>${p ? `${p.reading} · ${p.state}` : text ? 'sem terminação não toma forma' : ''}</span>
        </div>
        <div class="row">
          ${chip('equip', '', 'Pegar', false)}${chip('cast', '', 'Lançar agora', false)}${chip('clear', '', 'Limpar', false)}
        </div>
        <h3>Prontas · toque pra pegar</h3>
        ${ready}
        <h3>Misturas</h3>
        <div class="row">${combos.map((c) => chip('equip', c, c, false)).join('')}</div>
        <p class="ex">Pegou: E, clique ou o botão de ataque lançam sem falar.</p>
      </div>`;
  }
}
