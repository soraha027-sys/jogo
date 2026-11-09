import type { Events, GameEvents } from '../core/Events';
import type { Alt } from '../spells/interpret';
import { IS_ANDROID, SpeechInput, UNSUPPORTED } from './SpeechInput';

/** Volume do microfone (só PC: no Android o Chrome não divide o mic com o reconhecimento). */
class VolumeMeter {
  private readonly buf: Uint8Array<ArrayBuffer>;
  private peak = 0;

  private constructor(
    private readonly stream: MediaStream,
    private readonly ctx: AudioContext,
    private readonly node: AnalyserNode,
  ) {
    this.buf = new Uint8Array(node.fftSize);
  }

  static async create(): Promise<VolumeMeter> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const ctx = new AudioContext();
    const node = ctx.createAnalyser();
    node.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(node);
    return new VolumeMeter(stream, ctx, node);
  }

  /** RMS 0..1 do instante. */
  level(): number {
    this.node.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (const b of this.buf) sum += ((b - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / this.buf.length);
    this.peak = Math.max(this.peak, rms);
    return rms;
  }

  takePeak(): number {
    const p = this.peak;
    this.peak = 0;
    return p;
  }

  dispose(): void {
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

/** Liga/desliga o microfone, entrega as falas finais e dá a abertura da boca. */
export type MicMode = 'off' | 'hold' | 'open';

/**
 * Microfone em dois jeitos:
 * - segurar (padrão): só o que é dito com o botão apertado conta como magia. Conversa não vira feitiço.
 * - aberto (toque rápido no botão / M): ouve sempre, com filtro rígido (palavras comuns do português são ignoradas).
 * Também entrega a abertura da boca (volume no PC; pelo texto no Android).
 */
export class Voice {
  mode: MicMode = 'off';
  private meter: VolumeMeter | null = null;
  private readonly speech: SpeechInput;
  private talking = 0;
  private t = 0;
  private busy = false;
  /** Até quando um resultado que chega ainda pertence ao último "segurar" (o final vem depois de soltar). */
  private holdUntil = 0;
  private meterTimer = 0;

  get on(): boolean {
    return this.mode !== 'off';
  }

  constructor(
    private readonly events: Events<GameEvents>,
    o: { weakVolume: number; lang: string; phrases: string[] },
    onInterim: (text: string) => void,
    onSpeech: (alts: Alt[], weak: boolean, strict: boolean) => void,
  ) {
    const weakVolume = o.weakVolume;
    this.speech = new SpeechInput(
      {
        interim: (text) => {
          this.talk(0.3);
          onInterim(text);
        },
        final: (alts) => {
          const peak = this.meter?.takePeak();
          const held = this.mode === 'hold' || performance.now() < this.holdUntil;
          onSpeech(alts, peak !== undefined && peak < weakVolume, !held);
        },
        error: (message, fatal) => {
          if (this.mode === 'hold' && message === 'Não ouvi nada.') return;
          events.emit('voice:error', message);
          if (fatal) this.set('off');
        },
      },
      o.lang,
      o.phrases,
    );
  }

  private async open(): Promise<boolean> {
    if (!SpeechInput.supported) {
      this.events.emit('voice:error', UNSUPPORTED);
      return false;
    }
    try {
      clearTimeout(this.meterTimer);
      if (!this.meter && !IS_ANDROID && navigator.mediaDevices)
        this.meter = await VolumeMeter.create();
      this.speech.start();
      return true;
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      this.events.emit(
        'voice:error',
        denied
          ? 'Microfone bloqueado. Libere a permissão do microfone no navegador.'
          : `Não consegui abrir o microfone: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** Segurar pra falar a magia. */
  async hold(down: boolean): Promise<void> {
    if (this.mode === 'open') return;
    if (down) {
      if (this.busy || this.mode === 'hold') return;
      this.busy = true;
      if (await this.open()) this.set('hold');
      this.busy = false;
    } else if (this.mode === 'hold') {
      this.holdUntil = performance.now() + 2500;
      this.speech.release();
      this.set('off', 2500);
    }
  }

  /** Microfone sempre aberto (liga/desliga). */
  async toggle(): Promise<void> {
    if (this.busy) return;
    if (this.mode === 'open') return this.set('off');
    this.busy = true;
    if (await this.open()) this.set('open');
    this.busy = false;
  }

  private set(mode: MicMode, keepMeterMs = 0): void {
    if (mode === 'off') {
      if (this.mode === 'open') this.speech.stop();
      // o medidor fica mais um pouco: o resultado final ainda vai pedir o pico de volume
      this.meterTimer = window.setTimeout(() => {
        if (this.mode !== 'off') return;
        this.meter?.dispose();
        this.meter = null;
      }, keepMeterMs);
    }
    const was = this.mode;
    this.mode = mode;
    if ((was !== 'off') !== (mode !== 'off') || was !== mode)
      this.events.emit('mic:changed', mode !== 'off');
    this.events.emit('mic:mode', mode);
  }

  /** Mexe a boca por texto (Android, fala simulada). */
  talk(seconds: number): void {
    this.talking = Math.max(this.talking, seconds);
  }

  /** Abertura da boca 0..1: volume no PC, pulso por texto recebido no Android. */
  mouth(dt: number): number {
    this.t += dt;
    this.talking -= dt;
    const text = this.talking > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(this.t * 19)) : 0;
    const vol = this.meter ? Math.min(1, this.meter.level() * 9) : 0;
    return Math.max(text, vol);
  }
}
