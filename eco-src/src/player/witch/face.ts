import { CanvasTexture, SRGBColorSpace } from 'three';

const CELL = 256;

/** Um olho, com o canto interno em +x (o outro é espelhado). */
function eye(g: CanvasRenderingContext2D, closed: boolean): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // sobrancelha inclinada: séria, meio irritada
  g.strokeStyle = '#2a1c42';
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(-36, -40);
  g.lineTo(32, -25);
  g.stroke();

  if (closed) {
    g.strokeStyle = '#171022';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(-42, 0);
    g.quadraticCurveTo(0, 15, 38, 5);
    g.stroke();
  } else {
    const shape = (): void => {
      g.beginPath();
      g.moveTo(-41, -15);
      g.lineTo(38, -3);
      g.quadraticCurveTo(35, 25, 2, 27);
      g.quadraticCurveTo(-35, 25, -41, -15);
      g.closePath();
    };
    g.save();
    shape();
    g.fillStyle = '#fbf6ff';
    g.fill();
    g.clip();
    const iris = g.createLinearGradient(0, -26, 0, 28);
    iris.addColorStop(0, '#2c185e');
    iris.addColorStop(0.55, '#7a4fe0');
    iris.addColorStop(1, '#c2a4ff');
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(3, 3, 24, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#24144f';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#1c0f3a';
    g.beginPath();
    g.ellipse(3, 2, 9, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(30,14,70,0.4)'; // sombra da pálpebra pesada
    g.fillRect(-50, -30, 100, 24);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(-7, -3, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#eadcff';
    g.beginPath();
    g.arc(12, 14, 3.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // pálpebra de cima grossa e reta: olhar meio fechado
    g.strokeStyle = '#171022';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-47, -17);
    g.lineTo(40, -4);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-47, -17);
    g.lineTo(-53, -7);
    g.stroke();
    g.strokeStyle = 'rgba(60,34,70,0.55)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-26, 23);
    g.quadraticCurveTo(0, 30, 26, 22);
    g.stroke();
  }
  // cílios no canto de fora
  g.strokeStyle = '#171022';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(-41, 2);
  g.lineTo(-50, 8);
  g.moveTo(-37, 11);
  g.lineTo(-45, 18);
  g.stroke();
}

function mouth(g: CanvasRenderingContext2D, open: number): void {
  if (open === 0) {
    g.strokeStyle = '#6b3f4a';
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-9, 3);
    g.quadraticCurveTo(0, -5, 9, 3);
    g.stroke();
    return;
  }
  const ry = open === 1 ? 5 : 10;
  g.fillStyle = '#4a1626';
  g.beginPath();
  g.ellipse(0, 1, open === 1 ? 7 : 9, ry, 0, 0, Math.PI * 2);
  g.fill();
  if (open === 2) {
    g.fillStyle = '#c9667a';
    g.beginPath();
    g.ellipse(0, 6, 6, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#6b3f4a';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(0, 1, open === 1 ? 7 : 9, ry, 0, 0, Math.PI * 2);
  g.stroke();
}

/**
 * Rosto desenhado em canvas: atlas 3 x 2 (boca fechada/meia/aberta x olhos abertos/fechados).
 * Fala e piscar trocam o quadro do atlas, sem redesenhar.
 */
export function createFace(): {
  texture: CanvasTexture;
  set(blink: boolean, mouthOpen: number): void;
} {
  const cv = document.createElement('canvas');
  cv.width = CELL * 3;
  cv.height = CELL * 2;
  const g = cv.getContext('2d');
  if (g)
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < 3; c++) {
        const ox = c * CELL;
        const oy = row * CELL;
        for (const m of [1, -1]) {
          g.save();
          g.translate(ox + 128 - 80 * m, oy + 134);
          g.scale(m, 1);
          eye(g, row === 1);
          g.restore();
        }
        g.strokeStyle = 'rgba(205,140,130,0.7)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(ox + 128, oy + 176);
        g.lineTo(ox + 131, oy + 183);
        g.stroke();
        g.save();
        g.translate(ox + 128, oy + 212);
        mouth(g, c);
        g.restore();
      }
  const texture = new CanvasTexture(cv);
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(1 / 3, 1 / 2);
  texture.anisotropy = 4;
  const set = (blink: boolean, mouthOpen: number): void => {
    texture.offset.set(Math.max(0, Math.min(2, Math.round(mouthOpen))) / 3, blink ? 0 : 0.5);
  };
  set(false, 0);
  return { texture, set };
}
