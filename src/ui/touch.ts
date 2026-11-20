import type { Input } from '../player/input';

/** ¿Dispositivo táctil sin mouse? (?touch=1 lo fuerza para pruebas, ?touch=0 lo desactiva) */
export function isTouchDevice() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

interface Btn { code: string; label: string; cls?: string; drone?: boolean; foot?: boolean }
const BUTTONS: Btn[] = [
  { code: 'KeyL', label: 'Layout' },
  { code: 'KeyF', label: 'Flujos' },
  { code: 'KeyB', label: 'Esc. B' },
  { code: 'KeyG', label: 'Guía' },
  { code: 'KeyP', label: '1ª/3ª', foot: true },
  { code: 'KeyV', label: 'Dron' },
  { code: 'KeyM', label: 'Mapa' },
  { code: 'Tab', label: 'Libreta' },
  { code: 'KeyT', label: 'Techo', drone: true },
  { code: 'Space', label: '▲ Subir', drone: true },
  { code: 'KeyC', label: '▼ Bajar', drone: true },
];

/**
 * Controles táctiles: joystick (mitad izquierda), arrastrar para mirar, pellizcar para zoom
 * y botones que emulan las teclas del juego (mismo código que el teclado).
 */
export class TouchControls {
  root = document.createElement('div');
  private stick = document.createElement('div');
  private knob = document.createElement('div');
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private looks = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private btnEls: { el: HTMLButtonElement; b: Btn }[] = [];

  constructor(private input: Input, private canvas: HTMLCanvasElement, onMenu: () => void, onInteract: () => void) {
    document.body.classList.add('touch');
    this.root.id = 'touchui';
    this.stick.className = 'stick hidden';
    this.knob.className = 'knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);

    const act = document.createElement('button');
    act.className = 'tbtn act';
    act.textContent = 'Ver';
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onInteract(); });
    this.root.appendChild(act);

    const grid = document.createElement('div');
    grid.className = 'tgrid';
    for (const b of BUTTONS) {
      const el = document.createElement('button');
      el.className = 'tbtn' + (b.drone ? ' drone' : '');
      el.textContent = b.label;
      const down = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.key('keydown', b.code); };
      const up = (e: Event) => { e.preventDefault(); this.key('keyup', b.code); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      grid.appendChild(el);
      this.btnEls.push({ el, b });
    }
    this.root.appendChild(grid);

    const menu = document.createElement('button');
    menu.className = 'tbtn tmenu';
    menu.textContent = '☰';
    menu.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onMenu(); });
    this.root.appendChild(menu);
    const help = document.createElement('button');
    help.className = 'tbtn thelp';
    help.textContent = '?';
    help.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.key('keydown', 'KeyH'); this.key('keyup', 'KeyH'); });
    this.root.appendChild(help);
    document.body.appendChild(this.root);

    // gestos sobre el canvas
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
  }

  private key(type: 'keydown' | 'keyup', code: string) {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    if (this.stickId < 0 && e.clientX < innerWidth * 0.42) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.remove('hidden');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.looks.size === 2) this.pinchDist = this.pinchSpan();
    }
  }
  private pinchSpan() {
    const [a, b] = [...this.looks.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  private move(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === this.stickId) {
      const R = 55;
      let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.axis.x = dx / R;
      this.input.axis.y = -dy / R;
      return;
    }
    const p = this.looks.get(e.pointerId);
    if (!p) return;
    if (this.looks.size >= 2) {
      p.x = e.clientX; p.y = e.clientY;
      const d = this.pinchSpan();
      const diff = d - this.pinchDist;
      if (Math.abs(diff) > 18) { this.input.wheel += diff > 0 ? -1 : 1; this.pinchDist = d; }
      return;
    }
    this.input.dx += (e.clientX - p.x) * 1.5;
    this.input.dy += (e.clientY - p.y) * 1.5;
    p.x = e.clientX; p.y = e.clientY;
  }
  private up(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.input.axis.x = this.input.axis.y = 0;
      this.stick.classList.add('hidden');
    }
    this.looks.delete(e.pointerId);
  }

  /** Muestra los botones según el modo (a pie / dron). */
  update(drone: boolean, visible: boolean) {
    this.root.classList.toggle('hidden', !visible);
    for (const { el, b } of this.btnEls) el.classList.toggle('hidden', (!!b.drone && !drone) || (!!b.foot && drone));
  }
}
