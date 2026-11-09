import type { Alt } from '../spells/interpret';

// Tipos mínimos da Web Speech API (nem todo lib.dom traz).
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative | undefined;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult | undefined };
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  phrases?: unknown[];
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
  stop(): void;
}
type SRCtor = new () => SR;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microfone bloqueado. Libere a permissão do microfone no navegador.',
  'service-not-allowed': 'Reconhecimento de voz bloqueado pelo navegador ou pelo sistema.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'Sem conexão com o serviço de voz.',
  'no-speech': 'Não ouvi nada.',
  'language-not-supported': 'Português não está disponível no reconhecimento deste aparelho.',
};
const FATAL = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
]);

export const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
export const UNSUPPORTED = 'Este navegador não tem reconhecimento de voz. Use o Chrome.';

export interface SpeechHandlers {
  interim(text: string): void;
  final(alts: Alt[]): void;
  /** `fatal` = não adianta tentar de novo sem o jogador agir. */
  error(message: string, fatal: boolean): void;
}

/** Web Speech API em pt-BR, com resultado parcial e 5 alternativas; religa sozinho enquanto ligado. */
export class SpeechInput {
  private rec: SR | null = null;
  private wanted = false;
  private timer = 0;

  private bias = true;

  /** `phrases`: palavras da língua do jogo, pra enviesar o reconhecedor onde o navegador suportar. */
  constructor(
    private readonly h: SpeechHandlers,
    private readonly lang: string,
    private readonly phrases: string[],
  ) {}

  private static ctor(): SRCtor | undefined {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  static get supported(): boolean {
    return !!SpeechInput.ctor();
  }

  start(): void {
    this.wanted = true;
    this.open();
  }

  /** Solta o botão: para de ouvir, mas ainda entrega o resultado final do que já foi dito. */
  release(): void {
    this.wanted = false;
    clearTimeout(this.timer);
    this.rec?.stop();
  }

  stop(): void {
    this.wanted = false;
    clearTimeout(this.timer);
    this.rec?.abort();
    this.rec = null;
  }

  private open(): void {
    const Ctor = SpeechInput.ctor();
    if (!Ctor || !this.wanted) return;
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = !IS_ANDROID; // no Android o modo contínuo repete resultados
    const Phrase = (
      window as unknown as { SpeechRecognitionPhrase?: new (p: string, boost: number) => unknown }
    ).SpeechRecognitionPhrase;
    if (this.bias && Phrase && 'phrases' in rec) {
      try {
        rec.phrases = this.phrases.map((p) => new Phrase(p, 6));
      } catch {
        this.bias = false;
      }
    }
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (!r.isFinal) {
          this.h.interim(r[0]?.transcript ?? '');
          continue;
        }
        const alts: Alt[] = [];
        for (let k = 0; k < r.length; k++) {
          const a = r[k];
          if (a?.transcript.trim()) alts.push({ text: a.transcript, confidence: a.confidence });
        }
        if (alts.length) this.h.final(alts);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (e.error === 'phrases-not-supported') {
        this.bias = false; // religa sem o viés no onend
        return;
      }
      const fatal = FATAL.has(e.error);
      if (fatal) this.wanted = false;
      this.h.error(ERRORS[e.error] ?? `Erro de voz: ${e.error}`, fatal);
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (this.wanted) this.timer = window.setTimeout(() => this.open(), 250);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      this.h.error(
        `Não consegui ligar o microfone: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
      this.wanted = false;
    }
  }
}
