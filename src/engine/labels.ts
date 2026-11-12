/**
 * HTML labels pinned to 3D points. Because they are plain HTML laid over the
 * canvas, they always stay upright and readable whatever the rotation
 * (the "dynamic billboard" requirement), and they use the site's real fonts.
 */
import * as THREE from 'three';

interface Label {
  el: HTMLElement;
  pos: THREE.Vector3;
  visible: boolean;
}

export class LabelLayer {
  private labels = new Map<string, Label>();
  private v = new THREE.Vector3();

  constructor(private root: HTMLElement, private camera: THREE.Camera) {}

  add(id: string, pos: THREE.Vector3, el: HTMLElement, visible = true): HTMLElement {
    el.classList.add('label');
    el.classList.toggle('is-hidden', !visible);
    this.root.appendChild(el);
    this.labels.set(id, { el, pos: pos.clone(), visible });
    return el;
  }

  get(id: string): HTMLElement | undefined {
    return this.labels.get(id)?.el;
  }

  setVisible(id: string, visible: boolean): void {
    const l = this.labels.get(id);
    if (!l || l.visible === visible) return;
    l.visible = visible;
    l.el.classList.toggle('is-hidden', !visible);
  }

  setPosition(id: string, x: number, y: number, z: number): void {
    this.labels.get(id)?.pos.set(x, y, z);
  }

  update(width: number, height: number): void {
    for (const l of this.labels.values()) {
      if (!l.visible) continue;
      this.v.copy(l.pos).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }
}
