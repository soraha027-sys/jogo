/** Vida, aviso de dano, derrubada, mira (bolinha) e o botão 1ª/3ª pessoa. */
export class Vitals {
  private readonly fill = document.createElement('i');
  private readonly hurt = document.createElement('div');
  private readonly down = document.createElement('div');
  private readonly dot = document.createElement('div');
  private readonly viewBtn = document.createElement('button');
  private last = 1;
  private hurtT = 0;

  constructor(root: HTMLElement, toggleView: () => void) {
    const bar = document.createElement('div');
    bar.className = 'hp';
    bar.append(this.fill);
    this.hurt.className = 'hurt';
    this.down.className = 'down';
    this.down.hidden = true;
    this.dot.className = 'crosshair';
    this.viewBtn.className = 'view-btn';
    this.viewBtn.setAttribute('aria-label', 'Trocar 1ª / 3ª pessoa');
    this.viewBtn.textContent = '3P';
    this.viewBtn.addEventListener('click', () => {
      toggleView();
      this.viewBtn.blur();
    });
    root.querySelector('.top')?.prepend(this.viewBtn);
    root.append(this.hurt, bar, this.dot, this.down);
  }

  setView(firstPerson: boolean): void {
    this.viewBtn.textContent = firstPerson ? '1P' : '3P';
  }

  showCrosshair(on: boolean): void {
    this.dot.hidden = !on;
  }

  update(dt: number, hp01: number, downLeft: number): void {
    this.fill.style.transform = `scaleX(${hp01.toFixed(3)})`;
    this.fill.classList.toggle('low', hp01 < 0.35);
    if (hp01 < this.last - 0.005) {
      this.hurtT = Math.min(0.6, 0.25 + (this.last - hp01) * 2);
      navigator.vibrate?.(25);
    }
    this.last = hp01;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hurt.style.opacity = (this.hurtT * 1.6).toFixed(2);
    this.down.hidden = downLeft <= 0;
    if (downLeft > 0)
      this.down.innerHTML = `<b>DERRUBADA</b><span>volta em ${Math.ceil(downLeft)}</span>`;
  }
}
