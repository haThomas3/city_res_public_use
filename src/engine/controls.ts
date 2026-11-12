/**
 * Input: wheel rotates (as requested), Ctrl/⌘ + wheel or trackpad pinch zooms,
 * drag rotates, two-finger pinch zooms, arrow keys rotate.
 * Distinguishes a tap/click from a drag so clicking a building never fights rotation.
 */
import type { CameraRig } from './camera';

export interface ControlHandlers {
  onInteract(): void;
  onTap(x: number, y: number, pointerType: string): void;
  onHover(x: number, y: number): void;
  onLeave(): void;
}

export class Controls {
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinchDist = 0;
  private dragged = false;
  enabled = true;

  constructor(private el: HTMLElement, private rig: CameraRig, private h: ControlHandlers) {
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', () => this.h.onLeave());
    window.addEventListener('keydown', this.onKey);
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) {
      this.rig.zoomBy(Math.exp(-e.deltaY * scale * 0.0025));
    } else {
      this.rig.rotateBy((e.deltaY + e.deltaX) * scale * 0.0022);
    }
    this.h.onInteract();
  };

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) this.dragged = false;
    if (this.pointers.size === 2) this.pinchDist = this.distance();
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.onHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) this.dragged = true;
    if (this.pointers.size === 1 && this.dragged) {
      this.rig.rotateBy(-dx * 0.008);
      this.h.onInteract();
    } else if (this.pointers.size === 2) {
      const d = this.distance();
      if (this.pinchDist > 0) this.rig.zoomBy(d / this.pinchDist);
      this.pinchDist = d;
      this.dragged = true;
      this.h.onInteract();
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (p && this.pointers.size === 0 && !this.dragged && e.type === 'pointerup') {
      this.h.onTap(e.clientX, e.clientY, e.pointerType);
    }
    if (this.pointers.size < 2) this.pinchDist = 0;
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') this.rig.rotateBy(-Math.PI / 12);
    else if (e.key === 'ArrowRight') this.rig.rotateBy(Math.PI / 12);
    else if (e.key === '+' || e.key === '=') this.rig.zoomBy(1.2);
    else if (e.key === '-') this.rig.zoomBy(1 / 1.2);
    else return;
    this.h.onInteract();
  };

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
