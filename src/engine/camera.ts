/**
 * Isometric (orthographic) camera that orbits the plaza.
 * Everything is driven by "target" values that the current values ease towards,
 * so wheel input, buttons and fly-to animations all feel the same.
 */
import * as THREE from 'three';
import { LAYOUT } from '../data/model';

export interface View {
  azimuth: number;
  zoom: number;
  target: THREE.Vector3;
  offsetX: number;
  offsetY: number;
}

const DIST = 120;
/** Tilt is measured from the city's vertical: 0 = straight down, 60° = the most oblique view allowed. */
export const MAX_TILT_DEG = 60;
/** The view a first visit starts with. */
const DEFAULT_TILT = THREE.MathUtils.degToRad(45);

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  azimuth = Math.PI / 4;
  zoom = 1;
  readonly target = new THREE.Vector3();
  /** Screen-space shift (fraction of half the view), to make room for side cards. */
  offsetX = 0;
  offsetY = 0;
  tilt = DEFAULT_TILT;
  /** Tilt is a viewer setting, kept apart from View so fly-to/restore never undoes it. */
  tiltGoal = DEFAULT_TILT;
  /** Temporary tilt (radians from vertical) while a building is in focus; null = use the viewer's tilt. */
  focusTilt: number | null = null;
  /** Zoom limit for fly-to (a focused building may come closer than the wheel allows). */
  static readonly FOCUS_MAX_ZOOM = 9;

  /**
   * How far (world units) the view slides toward the far half of the island when zoomed in on the map.
   * Near buildings would otherwise fill half the frame and hide the plaza and everything behind it,
   * so the plaza drops to the lower part of the screen and the far side gets the room.
   */
  private ahead = 0;

  goal: View;
  minZoom = 0.8;
  maxZoom = 4;
  private aspect = 1;

  constructor(private radius: number, private maxHeight: number) {
    this.goal = { azimuth: this.azimuth, zoom: 1, target: new THREE.Vector3(), offsetX: 0, offsetY: 0 };
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
  }

  /** Angle above the horizon. */
  get elevation(): number {
    return Math.PI / 2 - this.tilt;
  }

  /** Half-height of the view at zoom 1 that fits the whole island at the current tilt. */
  get fitHalfH(): number {
    return this.fitHalfHAt(this.tilt);
  }

  /** fitHalfH for a given tilt (radians from vertical), so a fly-to can aim at its final framing. */
  fitHalfHAt(tilt: number): number {
    // The disc is 2R wide on screen and about R*sin(el)*2 + building height tall.
    const el = Math.PI / 2 - tilt;
    const needW = this.radius * 1.04;
    const needH = this.radius * Math.sin(el) * 1.02 + this.maxHeight * Math.cos(el) * 0.3 + 0.5;
    return Math.max(needH, needW / this.aspect);
  }

  /** Set the tilt in degrees from the vertical (clamped to 0..60). */
  setTiltDeg(deg: number): void {
    this.tiltGoal = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(deg, 0, MAX_TILT_DEG));
  }

  get tiltDeg(): number {
    return THREE.MathUtils.radToDeg(this.tiltGoal);
  }

  get halfH(): number {
    return this.fitHalfH / this.zoom;
  }

  rotateBy(delta: number): void {
    this.goal.azimuth += delta;
  }

  /**
   * The fully zoomed-in map frame for a tilt: its bottom edge runs just below the plaza's near rim and
   * the rest of the screen holds the far half of the island, up to the tops of its tallest buildings.
   * (Everything nearer than the plaza only hides it.) Returns that zoom and how far the view slides.
   */
  private zoomFrame(tilt: number): { zMax: number; dMax: number } {
    const el = Math.PI / 2 - tilt;
    const s = Math.max(0.3, Math.sin(el));
    const near = LAYOUT.plazaR + 0.7;
    const span = (this.radius + near) * s + this.maxHeight * Math.cos(el) * 0.6 + 0.4;
    const fit = this.fitHalfHAt(tilt);
    const zMax = THREE.MathUtils.clamp(fit / (span / 2), 1.05, this.maxZoom);
    // A ground step d moves d*sin(el) on screen: slide until the plaza's near rim meets the bottom edge.
    return { zMax, dMax: Math.max(0, fit / zMax / s - near) };
  }

  /** Closest zoom the map allows (the framing above). */
  get mapMaxZoom(): number {
    return this.zoomFrame(this.tiltGoal).zMax;
  }

  /** 0 = whole-island view, 1 = fully zoomed in on the map (always 0 while a building is in focus). */
  get zoomIn(): number {
    if (this.focusTilt !== null || this.zoom <= 1) return 0;
    const { zMax } = this.zoomFrame(this.tilt);
    return THREE.MathUtils.clamp((1 - 1 / this.zoom) / (1 - 1 / zMax), 0, 1);
  }

  zoomBy(factor: number): void {
    const max = this.focusTilt !== null ? CameraRig.FOCUS_MAX_ZOOM : this.mapMaxZoom;
    this.goal.zoom = THREE.MathUtils.clamp(this.goal.zoom * factor, this.minZoom, max);
  }

  snapshot(): View {
    return { ...this.goal, target: this.goal.target.clone() };
  }

  /** Ease towards a view. Azimuth takes the shortest way round. */
  flyTo(view: Partial<View>): void {
    if (view.azimuth !== undefined) {
      const cur = this.goal.azimuth;
      let d = (view.azimuth - cur) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.goal.azimuth = cur + d;
    }
    if (view.zoom !== undefined) this.goal.zoom = THREE.MathUtils.clamp(view.zoom, this.minZoom, CameraRig.FOCUS_MAX_ZOOM);
    if (view.target) this.goal.target.copy(view.target);
    if (view.offsetX !== undefined) this.goal.offsetX = view.offsetX;
    if (view.offsetY !== undefined) this.goal.offsetY = view.offsetY;
  }

  /** Called every frame. Returns true while still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 7);
    // A tilt change can lower the map's zoom limit.
    if (this.focusTilt === null) this.goal.zoom = Math.min(this.goal.zoom, this.mapMaxZoom);
    const before = this.azimuth + this.zoom + this.target.x + this.target.z + this.offsetX + this.tilt;
    this.azimuth += (this.goal.azimuth - this.azimuth) * k;
    this.zoom += (this.goal.zoom - this.zoom) * k;
    this.target.lerp(this.goal.target, k);
    this.offsetX += (this.goal.offsetX - this.offsetX) * k;
    this.offsetY += (this.goal.offsetY - this.offsetY) * k;
    this.tilt += ((this.focusTilt ?? this.tiltGoal) - this.tilt) * k;
    const aheadBefore = this.ahead;
    this.ahead += (this.aheadGoal() - this.ahead) * k;
    this.apply();
    const after = this.azimuth + this.zoom + this.target.x + this.target.z + this.offsetX + this.tilt + this.ahead - aheadBefore;
    return Math.abs(after - before) > 1e-5;
  }

  /**
   * Zero on the overview and while a building is in focus. Growing with zoomIn (linear in 1/zoom) makes
   * the frame's bottom edge travel steadily from the island's near rim to just below the plaza.
   */
  private aheadGoal(): number {
    const t = this.zoomIn;
    return t === 0 ? 0 : this.zoomFrame(this.tilt).dMax * t;
  }

  apply(): void {
    const halfH = this.halfH;
    const halfW = halfH * this.aspect;
    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    const el = this.elevation;
    const dir = new THREE.Vector3(
      Math.cos(this.azimuth) * Math.cos(el),
      Math.sin(el),
      Math.sin(this.azimuth) * Math.cos(el),
    );
    // "Up" on screen = the horizontal direction we look along. Same result as world-up for
    // oblique views, and still defined when looking straight down (tilt 0).
    const fwd = new THREE.Vector3(-Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const look = this.target.clone().addScaledVector(fwd, this.ahead);
    cam.position.copy(look).addScaledVector(dir, DIST);
    cam.up.copy(fwd);
    cam.lookAt(look);
    // Shift the view sideways/up so a selected building sits beside an open card.
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, this.offsetX * halfW).addScaledVector(up, this.offsetY * halfH);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
