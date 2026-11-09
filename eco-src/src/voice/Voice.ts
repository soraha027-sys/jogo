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
export class Voice {
  on = false;
  private meter: VolumeMeter | null = null;
  private readonly speech: SpeechInput;
  private talking = 0;
  private t = 0;
  private busy = false;

  constructor(
    private readonly events: Events<GameEvents>,
    o: { weakVolume: number; lang: string; phrases: string[] },
    onInterim: (text: string) => void,
    onSpeech: (alts: Alt[], weak: boolean) => void,
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
          onSpeech(alts, peak !== undefined && peak < weakVolume);
        },
        error: (message, fatal) => {
          events.emit('voice:error', message);
          if (fatal) this.set(false);
        },
      },
      o.lang,
      o.phrases,
    );
  }

  async toggle(): Promise<void> {
    if (this.busy) return;
    if (this.on) return this.set(false);
    if (!SpeechInput.supported) return this.events.emit('voice:error', UNSUPPORTED);
    this.busy = true;
    try {
      if (!IS_ANDROID && navigator.mediaDevices) this.meter = await VolumeMeter.create();
      this.speech.start();
      this.set(true);
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      this.events.emit(
        'voice:error',
        denied
          ? 'Microfone bloqueado. Libere a permissão do microfone no navegador.'
          : `Não consegui abrir o microfone: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  private set(on: boolean): void {
    if (!on) {
      this.speech.stop();
      this.meter?.dispose();
      this.meter = null;
    }
    if (this.on !== on) this.events.emit('mic:changed', (this.on = on));
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
