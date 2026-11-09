/** Estado de input unificado (teclado/mouse, toque, gamepad). */
export interface InputFrame {
  /** -1..1; +Y = frente. */
  moveX: number;
  moveY: number;
  /** Delta de câmera do quadro, em radianos. */
  lookX: number;
  lookY: number;
  jump: boolean;
  sprint: boolean;
  /** Bordas: ficam travadas até um passo fixo consumir. */
  jumpPressed: boolean;
  flyPressed: boolean;
  micPressed: boolean;
  debugPressed: boolean;
  sitPressed: boolean;
  wavePressed: boolean;
  /** Relança a magia equipada (a última falada). */
  attackPressed: boolean;
  /** Debug: 1 a 5 simula uma fala; 0 = nada. */
  debugSay: number;
}

export interface InputSource {
  sample(frame: InputFrame, dt: number): void;
  dispose(): void;
}

export function emptyFrame(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: false,
    jumpPressed: false,
    flyPressed: false,
    micPressed: false,
    debugPressed: false,
    sitPressed: false,
    wavePressed: false,
    attackPressed: false,
    debugSay: 0,
  };
}
