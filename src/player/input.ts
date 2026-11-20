export class Input {
  keys = new Set<string>();
  dx = 0; dy = 0; wheel = 0;
  locked = false;
  private pressed: string[] = [];
  /** Si true, la rueda no hace zoom (p.ej. panel abierto). */
  onWheelOverride: ((d: number) => boolean) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.onWheelOverride && this.onWheelOverride(e.deltaY)) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
  }
  lock() { try { const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* sin pointer lock */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code: string) { return this.keys.has(code); }
  /** Teclas presionadas desde el último consumo. */
  consume() { const p = this.pressed; this.pressed = []; return p; }
  mouse() { const r = { dx: this.dx, dy: this.dy, wheel: this.wheel }; this.dx = this.dy = this.wheel = 0; return r; }
}
