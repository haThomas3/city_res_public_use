/**
 * Small 3D view of one building for the project page. It stays still until the visitor moves it,
 * with the same gestures as the city: wheel or drag rotates, Ctrl/⌘ + wheel or pinch zooms
 * (towards the base, where the door and the "founded" plaque are).
 * Hovering a floor highlights it and reports which module it is.
 */
import * as THREE from 'three';
import type { PlacedProject } from '../data/model';
import { createBuilding, type BuildingHandle } from '../engine/building';
import type { Theme } from '../engine/daylight';

/** Start turned 15° so the front, its side and the plaque all show. */
const START_TURN = THREE.MathUtils.degToRad(-15);
const MAX_ZOOM = 3.4;
/** The plaque is a detail on the map; here it is drawn larger so its date reads. */
const PLAQUE_SCALE = 1.7;

export class BuildingViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  private handle: BuildingHandle;
  private raf = 0;
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverFloor: number | null = null;
  private pinnedFloor: number | null = null;
  private last = performance.now();
  private dist: number;
  private height: number;
  private rot = START_TURN;
  private rotGoal = START_TURN;
  private zoom = 1;
  private zoomGoal = 1;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinchDist = 0;
  private dragged = false;

  constructor(
    private container: HTMLElement,
    pp: PlacedProject,
    theme: Theme,
    private onFloorHover: (index: number | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity + 0.3));
    const key = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity * 0.9 + 0.4);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    this.handle = createBuilding({ ...pp, x: 0, z: 0 }, { shadows: false });
    this.handle.group.rotation.y = this.rot;
    this.handle.windowMats.forEach((m) => (m.emissiveIntensity = theme.windowGlow));
    this.handle.neon.forEach((n) => n.mat.color.copy(n.base).multiplyScalar(Math.max(1, theme.neon)));
    this.handle.plaque?.scale.setScalar(PLAQUE_SCALE);
    this.scene.add(this.handle.group);

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(pp.footprint * 1.35, pp.footprint * 1.4, 0.25, 48),
      new THREE.MeshStandardMaterial({ color: theme.grass, roughness: 1 }),
    );
    ground.position.y = -0.125;
    this.scene.add(ground);

    this.height = this.handle.height;
    this.dist = Math.max(this.height * 0.62, pp.footprint * 1.8) / Math.tan(THREE.MathUtils.degToRad(14)) + 1;
    this.placeCamera();

    const canvas = this.renderer.domElement;
    // Horizontal drags rotate; vertical swipes still scroll the page on touch screens.
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.setHover(null);
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  /** Highlight a floor from outside (hovering the floor list). */
  pinFloor(index: number | null): void {
    this.pinnedFloor = index;
    this.handle.highlightFloor(index ?? this.hoverFloor);
  }

  /** Zooming moves the camera in and lowers its aim from mid-height to the base. */
  private placeCamera(): void {
    const t = (this.zoom - 1) / (MAX_ZOOM - 1);
    const lookY = THREE.MathUtils.lerp(this.height * 0.48, 0.7, t);
    const d = this.dist / this.zoom;
    this.camera.position.set(0, lookY + d * 0.16, d);
    this.camera.lookAt(0, lookY, 0);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) this.zoomBy(Math.exp(-e.deltaY * scale * 0.0025));
    else this.rotGoal -= (e.deltaY + e.deltaX) * scale * 0.0022;
  };

  private zoomBy(f: number): void {
    this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * f, 1, MAX_ZOOM);
  }

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) this.dragged = false;
    if (this.pointers.size === 2) this.pinchDist = this.pinchSpan();
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      this.hoverAt(e);
      return;
    }
    const dx = e.clientX - p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) this.dragged = true;
    if (this.pointers.size === 1 && this.dragged) {
      this.rotGoal += dx * 0.008;
    } else if (this.pointers.size === 2) {
      const d = this.pinchSpan();
      if (this.pinchDist > 0) this.zoomBy(d / this.pinchDist);
      this.pinchDist = d;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const c = this.renderer.domElement;
    if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (!this.pointers.size) c.style.cursor = 'grab';
  };

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private hoverAt(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.handle.floors, false)[0];
    this.setHover(hit ? (hit.object.userData.floorIndex as number) : null);
  }

  private setHover(index: number | null) {
    if (index === this.hoverFloor) return;
    this.hoverFloor = index;
    this.handle.highlightFloor(index ?? this.pinnedFloor);
    this.onFloorHover(index);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 8);
    this.rot += (this.rotGoal - this.rot) * k;
    this.zoom += (this.zoomGoal - this.zoom) * k;
    this.handle.group.rotation.y = this.rot;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.handle.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.handle.group.getObjectById(o.id)) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
