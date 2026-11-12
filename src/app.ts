/**
 * Wires everything together: data → model → scene, input → selection,
 * routes → overlays, daylight → theme, language → UI text.
 */
import * as THREE from 'three';
import type { CityData } from './types';
import { buildCityModel, LAYOUT, type CityModel, type PlacedProject } from './data/model';
import { createScene, type SceneCtx } from './engine/scene';
import { createWorld, type World } from './engine/world';
import { createBuilding, type BuildingHandle } from './engine/building';
import { createConnection, type ConnectionHandle } from './engine/connections';
import { LabelLayer } from './engine/labels';
import { Controls } from './engine/controls';
import { nightFactor, themeFor, type Theme, type ThemeMode } from './engine/daylight';
import type { View } from './engine/camera';
import { Router, type Route } from './router';
import { track, trackOnce } from './analytics';
import { getLang, isRtl, onLangChange, setLang, t } from './i18n';
import { allVariants, loc } from './text';
import { $, h } from './ui/dom';
import { SideCard } from './ui/card';
import { foundedText } from './ui/common';
import { ProjectPage } from './ui/projectPage';
import { AboutModal, ListView, showHint } from './ui/overlays';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const TAU = Math.PI * 2;
/** Selected-building view: 72° from vertical = 18° above the horizon, turned 15° off the front. */
const FOCUS_TILT = THREE.MathUtils.degToRad(72);
const FOCUS_TURN = THREE.MathUtils.degToRad(15);
/** How much a clicked founded plaque grows. */
const PLAQUE_POP = 2.2;

const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export class App {
  private model: CityModel;
  private ctx: SceneCtx;
  private world: World;
  private buildings = new Map<string, BuildingHandle>();
  private labels: LabelLayer;
  private raycaster = new THREE.Raycaster();
  private pickTargets: THREE.Object3D[] = [];

  private hovered: string | null = null;
  private selected: string | null = null;
  private savedView: View | null = null;
  /** Building whose founded plaque is open (popped up, with its note beside it). */
  private plaqueOpen: string | null = null;
  private plaqueSpring = new Map<string, { s: number; v: number }>();
  private links: ConnectionHandle[] = [];
  /** Buildings joined by a skybridge lift together, so the bridge stays level. */
  private bridgePartner = new Map<string, string>();
  private matches = new Set<string>();

  private themeMode: ThemeMode = 'auto';
  private theme: Theme;
  /** 0..1: how far the visitor has zoomed in; night lights dim with it so close-ups don't glare. */
  private glowZoom = 0;
  /** Buildings standing in front of the selected one (they turn see-through, like on the zoomed-in map). */
  private readonly focusFaded = new Set<string>();
  private lowPower: boolean;
  private reducedMotion: boolean;
  private touch: boolean;
  private introStart = performance.now();
  private introDone = false;
  private hintShown = false;
  private interacted = false;
  private last = performance.now();

  private card: SideCard;
  private page: ProjectPage;
  private about: AboutModal;
  private list: ListView;
  private router: Router;
  private stage = $('#stage');
  private canvas = $('#city') as HTMLCanvasElement;
  private tooltip = $('#tooltip');
  private hint = $('#hint');

  constructor(data: CityData) {
    this.model = buildCityModel(data);
    this.lowPower = matchMedia('(max-width: 760px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shadows = !this.lowPower;
    const maxHeight = this.model.maxFloors * LAYOUT.floorH + 2.2;

    this.ctx = createScene(this.canvas, this.stage, { lowPower: this.lowPower, shadows, radius: this.model.radius, maxHeight });
    this.world = createWorld(this.model, { lowPower: this.lowPower, shadows });
    // Portrait phones: the island is width-bound, so start a little closer.
    if (this.stage.clientHeight > this.stage.clientWidth * 1.2) {
      this.ctx.rig.zoom = this.ctx.rig.goal.zoom = 1.18;
    }
    this.ctx.scene.add(this.world.group);
    this.pickTargets.push(this.world.plazaPick);

    for (const pp of this.model.projects) {
      const b = createBuilding(pp, { shadows });
      if (!this.reducedMotion) b.body.scale.y = 0.001;
      this.ctx.scene.add(b.group);
      this.buildings.set(pp.project.id, b);
      this.pickTargets.push(b.pick);
      if (b.plaquePick) this.pickTargets.push(b.plaquePick);
    }
    if (this.reducedMotion) this.introDone = true;
    for (const c of this.model.connections) {
      const link = createConnection(c, { shadows });
      this.ctx.scene.add(link.group);
      this.links.push(link);
      if (c.level === 3) {
        this.bridgePartner.set(c.a.project.id, c.b.project.id);
        this.bridgePartner.set(c.b.project.id, c.a.project.id);
      }
    }

    this.labels = new LabelLayer($('#labels'), this.ctx.rig.camera);
    this.createLabels();

    this.card = new SideCard($('#card'), {
      onEnter: (id) => this.router.go(`/project/${id}`),
      onClose: () => this.deselect(),
      onGo: (id) => this.select(id),
      connections: this.model.connections,
    });
    this.page = new ProjectPage($('#project'), { onBack: () => this.router.back() });
    this.about = new AboutModal($('#about'), data, () => this.router.back());
    this.list = new ListView($('#list-view'), data, () => this.router.back());

    new Controls(this.canvas, this.ctx.rig, {
      onInteract: () => this.onInteract(),
      onTap: (x, y) => this.onTap(x, y),
      onHover: (x, y) => this.onHover(x, y),
      onLeave: () => this.setHovered(null, false),
    });

    this.bindHud();
    try {
      const saved = localStorage.getItem('city-theme');
      if (saved === 'day' || saved === 'night' || saved === 'auto') this.themeMode = saved;
    } catch {
      /* ignore */
    }
    this.theme = themeFor(nightFactor(this.themeMode));
    this.applyTheme();
    setInterval(() => this.updateDaylight(), 60_000);

    onLangChange(() => this.refreshLang());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.ctx.onResize(() => this.layoutLabels());

    this.router = new Router((r) => this.onRoute(r));
    this.router.start();
    $('#loading').remove();
    this.loop();
  }

  // ---------- labels ----------

  private createLabels(): void {
    const lang = getLang();
    // Districts and the plaza have no permanent labels (they hid the buildings): hovering shows a tooltip instead.
    for (const pp of this.model.projects) {
      const b = this.buildings.get(pp.project.id)!;
      const el = h('div', { class: 'label-building', style: `--d:${pp.district.color}` }, loc(pp.project.title, lang));
      this.labels.add(`b:${pp.project.id}`, new THREE.Vector3(pp.x, b.height + 0.5, pp.z), el, false);
    }
  }

  private refreshLabelText(): void {
    const lang = getLang();
    for (const pp of this.model.projects) {
      const el = this.labels.get(`b:${pp.project.id}`);
      if (el) el.textContent = loc(pp.project.title, lang);
    }
  }

  private layoutLabels(): void {
    this.labels.update(this.ctx.size.width, this.ctx.size.height);
  }

  // ---------- picking & selection ----------

  private pickAt(clientX: number, clientY: number): { kind: 'building' | 'plaza' | 'district' | 'plaque'; id?: string } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.ctx.rig.camera);
    const hit = this.raycaster
      .intersectObjects(this.pickTargets, false)
      .find((h) => {
        // Hidden and see-through buildings let the pointer through to what's behind them.
        const b = this.buildings.get((h.object.userData as { id?: string }).id ?? '');
        return !b || (b.group.visible && b.fade > 0.6);
      });
    if (hit) {
      const ud = hit.object.userData as { kind: 'building' | 'plaza' | 'plaque'; id?: string };
      return { kind: ud.kind, id: ud.id };
    }
    // Nothing solid under the pointer: which district's ground is it over?
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(GROUND, p)) return null;
    const r = Math.hypot(p.x, p.z);
    if (r < LAYOUT.ringRoadR - LAYOUT.ringRoadW / 2 || r > this.model.radius) return null;
    const th = Math.atan2(p.z, p.x);
    const sec = this.model.sectors.find((s) => (((th - s.start) % TAU) + TAU) % TAU < s.end - s.start);
    return sec ? { kind: 'district', id: sec.district.id } : null;
  }

  private onHover(x: number, y: number): void {
    if (this.page.isOpen) return;
    const hit = this.pickAt(x, y);
    this.setHovered(hit?.kind === 'building' ? hit.id! : null, hit?.kind === 'plaza' || hit?.kind === 'plaque');
    if (hit?.kind === 'building') this.showTooltip(this.model.byId.get(hit.id!)!, x, y);
    else if (hit?.kind === 'district') this.showDistrictTip(hit.id!, x, y);
    else if (hit?.kind === 'plaza') this.showPlazaTip(x, y);
    else this.tooltip.hidden = true;
  }

  private showPlazaTip(x: number, y: number): void {
    // The map instructions live here, on hover, instead of a permanent bubble that covered the TE logo.
    this.tooltip.replaceChildren(
      h('strong', {}, t('centralSquare')),
      h('span', { class: 'tt-stack' }, t('about'), ' →'),
      h('span', { class: 'tt-hint' }, ...t(this.touch ? 'hintTouch' : 'hintDesktop').split(' · ').map((s) => h('span', {}, s))),
    );
    this.tooltip.style.removeProperty('--d');
    this.placeTooltip(x, y);
  }

  private setHovered(id: string | null, clickable: boolean): void {
    this.canvas.style.cursor = id || clickable ? 'pointer' : '';
    if (id === this.hovered) return;
    this.hovered = id;
    if (!id) this.tooltip.hidden = true;
    this.applyHighlights();
  }

  private showTooltip(pp: PlacedProject, x: number, y: number): void {
    const lang = getLang();
    this.tooltip.replaceChildren(
      h('strong', {}, loc(pp.project.title, lang)),
      h('span', { class: 'tt-tag' }, loc(pp.project.tagline, lang)),
      h('span', { class: 'tt-stack' }, pp.project.stack.slice(0, 4).join(' · ')),
    );
    this.tooltip.style.setProperty('--d', pp.district.color);
    this.placeTooltip(x, y);
  }

  /** District name, what its projects have in common, and how many there are. */
  private showDistrictTip(id: string, x: number, y: number): void {
    const sec = this.model.sectors.find((s) => s.district.id === id);
    if (!sec) return;
    const d = sec.district;
    const lang = getLang();
    const n = this.model.projects.filter((pp) => pp.district.id === id).length;
    this.tooltip.replaceChildren(
      ...[
        h('strong', { class: 'tt-title' }, h('span', { class: 'dot' }), loc(d.name, lang)),
        d.blurb ? h('span', { class: 'tt-tag' }, loc(d.blurb, lang)) : null,
        h('span', { class: 'tt-stack' }, n === 1 ? t('districtOne') : t('districtCount', { n })),
      ].filter((el): el is HTMLElement => el !== null),
    );
    this.tooltip.style.setProperty('--d', d.color);
    this.placeTooltip(x, y);
  }

  private placeTooltip(x: number, y: number): void {
    const rect = this.stage.getBoundingClientRect();
    this.tooltip.hidden = false;
    const tw = this.tooltip.offsetWidth;
    let left = x - rect.left + 18;
    if (left + tw > rect.width - 8) left = x - rect.left - tw - 18;
    left = Math.max(8, Math.min(left, rect.width - tw - 8));
    this.tooltip.style.transform = `translate(${left}px, ${y - rect.top + 18}px)`;
  }

  private onTap(x: number, y: number): void {
    if (this.page.isOpen) return;
    const hit = this.pickAt(x, y);
    if (hit?.kind === 'plaque') {
      this.togglePlaque(hit.id!);
      return;
    }
    this.closePlaque();
    if (hit?.kind === 'building') this.select(hit.id!);
    else if (hit?.kind === 'plaza') this.router.go('/about');
    else {
      if (this.selected) this.deselect();
      // Touch screens have no hover, so a tap on a district's ground shows its tooltip.
      if (hit?.kind === 'district') this.showDistrictTip(hit.id!, x, y);
      else this.tooltip.hidden = true;
    }
  }

  private select(id: string): void {
    const pp = this.model.byId.get(id);
    if (!pp) return;
    if (!this.selected) this.savedView = this.ctx.rig.snapshot();
    this.selected = id;
    this.tooltip.hidden = true;
    const b = this.buildings.get(id)!;
    const rig = this.ctx.rig;
    const mobile = this.stage.clientWidth < 700;
    // Close, near eye-level view of the building's front (and its founded plaque), turned slightly,
    // with the building on one side of the screen and the card on the other.
    rig.focusTilt = FOCUS_TILT;
    const wantHalfH = b.height * 0.58 + (mobile ? 1.4 : 0.9);
    const zoom = Math.max(1.4, rig.fitHalfHAt(FOCUS_TILT) / wantHalfH);
    rig.flyTo({
      azimuth: this.focusAzimuth(pp),
      zoom,
      target: new THREE.Vector3(pp.x, b.height * 0.42, pp.z),
      offsetX: mobile ? 0 : isRtl() ? -0.34 : 0.34,
      offsetY: mobile ? -0.35 : 0,
    });
    this.card.show(pp);
    this.applyHighlights();
  }

  /** Look at the building's front (it faces the plaza), turned ~15° so its side shows a little. */
  private focusAzimuth(pp: PlacedProject): number {
    return pp.angle + Math.PI + (isRtl() ? -FOCUS_TURN : FOCUS_TURN);
  }

  private deselect(): void {
    if (!this.selected) return;
    this.selected = null;
    this.card.hide();
    this.ctx.rig.focusTilt = null;
    if (this.savedView) this.ctx.rig.flyTo({ ...this.savedView, offsetX: 0, offsetY: 0 });
    this.savedView = null;
    this.applyHighlights();
  }

  /** The founded plaque jumps up, grows, and shows when and how the project started. */
  private togglePlaque(id: string): void {
    if (this.plaqueOpen === id) return this.closePlaque();
    const pp = this.model.byId.get(id);
    if (!pp?.project.founded) return;
    this.plaqueOpen = id;
    this.tooltip.hidden = true;
    const lang = getLang();
    const note = pp.project.foundedNote ? loc(pp.project.foundedNote, lang) : t('foundedDefaultNote');
    let el = this.labels.get('plaque');
    if (!el) el = this.labels.add('plaque', new THREE.Vector3(), h('div', { class: 'plaque-note' }), false);
    el.style.setProperty('--d', pp.district.color);
    el.dir = isRtl() ? 'rtl' : 'ltr';
    el.replaceChildren(
      h('strong', {}, foundedText(pp)),
      h('span', { class: 'pn-title' }, loc(pp.project.title, lang)),
      h('span', { class: 'pn-note' }, note),
    );
    // Restart the spring from a small kick so it hops even when already raised.
    const sp = this.plaqueSpring.get(id) ?? { s: 1, v: 0 };
    sp.v += 6;
    this.plaqueSpring.set(id, sp);
    this.labels.setVisible('plaque', true);
  }

  private closePlaque(): void {
    if (!this.plaqueOpen) return;
    this.plaqueOpen = null;
    this.labels.setVisible('plaque', false);
  }

  /** Spring the plaques towards their size (bigger when open), and keep the note pinned above the open one. */
  private animatePlaques(dt: number): void {
    for (const [id, sp] of this.plaqueSpring) {
      const b = this.buildings.get(id);
      if (!b?.plaque) continue;
      const goal = id === this.plaqueOpen ? PLAQUE_POP : 1;
      // Under-damped, so it overshoots a little: a "jump".
      sp.v += ((goal - sp.s) * 170 - sp.v * 13) * dt;
      sp.s += sp.v * dt;
      b.plaque.scale.setScalar(sp.s);
      if (id !== this.plaqueOpen && Math.abs(sp.s - 1) < 0.002 && Math.abs(sp.v) < 0.01) {
        b.plaque.scale.setScalar(1);
        this.plaqueSpring.delete(id);
      }
    }
    if (this.plaqueOpen) {
      const b = this.buildings.get(this.plaqueOpen)!;
      const p = b.plaque!.getWorldPosition(new THREE.Vector3());
      const s = this.plaqueSpring.get(this.plaqueOpen)?.s ?? 1;
      this.labels.setPosition('plaque', p.x, p.y + 0.8 * s + 0.35, p.z);
      this.labels.setVisible('plaque', b.group.visible);
    }
  }

  private applyHighlights(): void {
    for (const [id, b] of this.buildings) {
      b.setHighlight(id === this.hovered || id === this.selected || this.matches.has(id));
    }
    for (const l of this.links) l.setLit(this.selected === l.conn.a.project.id || this.selected === l.conn.b.project.id);
  }

  /**
   * In the focus view, mark every building that covers the selected one (or the one across its skybridge)
   * on screen and stands nearer the camera; fadeOccluders makes them see-through.
   */
  private findFocusOccluders(): void {
    this.focusFaded.clear();
    const sel = this.selected ? this.model.byId.get(this.selected) : null;
    if (!sel) return;
    const cam = this.ctx.rig.camera;
    const az = this.ctx.rig.azimuth;
    const ux = Math.cos(az);
    const uz = Math.sin(az);
    const v = new THREE.Vector3();
    // Screen rectangle (NDC) of a building's box.
    const rect = (pp: PlacedProject, h: number) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const r = pp.footprint * 0.5;
      for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h]) {
        v.set(pp.x + dx, y, pp.z + dz).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      return { x0, x1, y0, y1 };
    };
    const partnerId = this.bridgePartner.get(sel.project.id);
    const kept = [sel, ...(partnerId ? [this.model.byId.get(partnerId)!] : [])].map((k) => {
      const r = rect(k, this.buildings.get(k.project.id)!.height);
      // Ignore slivers: only count real overlap with the middle of the building.
      const sx = (r.x1 - r.x0) * 0.12;
      const sy = (r.y1 - r.y0) * 0.08;
      return { k, r: { x0: r.x0 + sx, x1: r.x1 - sx, y0: r.y0 + sy, y1: r.y1 - sy } };
    });
    for (const [id, b] of this.buildings) {
      if (kept.some(({ k }) => k.project.id === id)) continue;
      const pp = this.model.byId.get(id)!;
      const o = rect(pp, b.height);
      const covers = kept.some(({ k, r }) => {
        const nearer = (pp.x - k.x) * ux + (pp.z - k.z) * uz > 0.3; // between that building and the camera
        return nearer && o.x0 < r.x1 && o.x1 > r.x0 && o.y0 < r.y1 && o.y1 > r.y0;
      });
      if (covers) this.focusFaded.add(id);
    }
  }

  /**
   * Zoomed in on the map, buildings standing between the camera and the plaza turn see-through (30%),
   * so the plaza and the far side stay readable while their outline still shows what's there.
   */
  private fadeOccluders(dt: number): void {
    const rig = this.ctx.rig;
    const f = THREE.MathUtils.smoothstep(rig.zoomIn, 0.3, 0.9);
    const ux = Math.cos(rig.azimuth);
    const uz = Math.sin(rig.azimuth);
    const el = rig.elevation;
    const k = Math.min(1, dt * 8);
    for (const [id, b] of this.buildings) {
      let goal = this.focusFaded.has(id) ? 0.3 : 1;
      if (f > 0) {
        const pp = this.model.byId.get(id)!;
        const along = pp.x * ux + pp.z * uz; // > 0: on the camera's side of the plaza
        const lateral = Math.abs(pp.x * uz - pp.z * ux);
        const covers = along > 0 && lateral < LAYOUT.plazaR + pp.footprint / 2 && b.height * Math.cos(el) > (along - LAYOUT.plazaR) * Math.sin(el);
        if (covers) goal = 1 - 0.7 * f;
      }
      b.setFade(b.fade + (goal - b.fade) * k);
    }
  }

  // ---------- routes ----------

  private onRoute(r: Route): void {
    if (r.name === 'project') track(`open_project:${r.id}`);
    else if (r.name === 'about') track('open_about');
    else if (r.name === 'list') track('list_view');
    if (r.name !== 'map') this.closePlaque();
    if (r.name === 'project') {
      const pp = this.model.byId.get(r.id);
      if (!pp) return this.router.replace('/');
      if (this.selected !== r.id) this.select(r.id);
      this.page.open(pp, this.theme);
    } else if (this.page.isOpen) {
      this.page.close();
    }
    if (r.name === 'about') this.about.open();
    else this.about.close();
    if (r.name === 'list') this.list.open();
    else this.list.close();
    document.body.classList.toggle('overlay-open', r.name !== 'map');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const search = $('#search') as HTMLInputElement;
    if (document.activeElement === search) {
      search.value = '';
      this.runSearch('');
      search.blur();
    } else if (this.page.isOpen || this.about.isOpen || this.list.isOpen) {
      this.router.back();
    } else if (this.plaqueOpen) {
      this.closePlaque();
    } else if (this.selected) {
      this.deselect();
    }
  }

  // ---------- HUD ----------

  /** The tilt dial: 0° looks straight down, 60° is the most oblique view. Drag, tap, scroll or arrow keys. */
  private bindTilt(): void {
    const rig = this.ctx.rig;
    const dial = $('#tilt-dial');
    const svg = dial.querySelector('svg') as SVGSVGElement;
    const input = $('#tilt') as HTMLInputElement;
    const needle = $('#tilt-needle');
    const val = $('#tilt-val');
    const show = () => {
      const deg = rig.tiltDeg;
      const d = Math.round(deg);
      input.value = String(d);
      input.setAttribute('aria-valuetext', `${d}°`);
      val.textContent = `${d}°`;
      needle.setAttribute('transform', `rotate(${deg.toFixed(1)} 9 40)`);
    };
    const set = (deg: number) => {
      rig.setTiltDeg(deg);
      show();
      trackOnce('tilt_change');
      try {
        localStorage.setItem('city-tilt', String(Math.round(rig.tiltDeg)));
      } catch {
        /* storage blocked: the dial still works for this visit */
      }
      this.onInteract();
    };

    let saved: string | null = null;
    try {
      saved = localStorage.getItem('city-tilt');
    } catch {
      saved = null;
    }
    if (saved !== null && saved !== '' && !Number.isNaN(Number(saved))) {
      rig.setTiltDeg(Number(saved));
      rig.tilt = rig.tiltGoal; // no animation on load
    }
    show();

    // Angle of the pointer around the dial's pivot (bottom-left of the gauge), measured from the vertical.
    const fromPointer = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = r.left + (9 / 46) * r.width;
      const py = r.top + (40 / 46) * r.height;
      set((Math.atan2(e.clientX - px, py - e.clientY) * 180) / Math.PI);
    };
    let dragging = false;
    dial.addEventListener('pointerdown', (e) => {
      dragging = true;
      dial.setPointerCapture(e.pointerId);
      dial.classList.add('is-dragging');
      fromPointer(e);
    });
    dial.addEventListener('pointermove', (e) => {
      if (dragging) fromPointer(e);
    });
    const stop = () => {
      dragging = false;
      dial.classList.remove('is-dragging');
    };
    dial.addEventListener('pointerup', stop);
    dial.addEventListener('pointercancel', stop);
    dial.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        set(rig.tiltDeg + (e.deltaY > 0 ? 3 : -3));
      },
      { passive: false },
    );
    input.addEventListener('input', () => set(Number(input.value)));
  }

  private bindHud(): void {
    const rig = this.ctx.rig;
    const step = Math.PI / 4;
    $('#rot-left').addEventListener('click', () => (rig.rotateBy(-step), this.onInteract()));
    $('#rot-right').addEventListener('click', () => (rig.rotateBy(step), this.onInteract()));
    $('#zoom-in').addEventListener('click', () => (rig.zoomBy(1.25), this.onInteract()));
    $('#zoom-out').addEventListener('click', () => (rig.zoomBy(1 / 1.25), this.onInteract()));
    this.bindTilt();
    $('#btn-list').addEventListener('click', () => this.router.go('/list'));
    $('#btn-list-mobile').addEventListener('click', () => this.router.go('/list'));
    $('#btn-about').addEventListener('click', () => this.router.go('/about'));
    $('#btn-lang').addEventListener('click', () => setLang(getLang() === 'en' ? 'he' : 'en'));
    $('#btn-theme').addEventListener('click', () => {
      const order: ThemeMode[] = ['auto', 'day', 'night'];
      this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
      try {
        localStorage.setItem('city-theme', this.themeMode);
      } catch {
        /* ignore */
      }
      this.updateDaylight();
    });

    const search = $('#search') as HTMLInputElement;
    search.addEventListener('input', () => this.runSearch(search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = [...this.matches][0];
        if (first) {
          this.router.go('/');
          this.select(first);
          search.blur();
        }
      }
    });
    $('#search-results').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      if (this.page.isOpen || this.list.isOpen || this.about.isOpen) this.router.go('/');
      this.select(btn.dataset.id!);
      search.value = '';
      this.runSearch('');
    });
    this.updateThemeButton();
  }

  private runSearch(raw: string): void {
    const q = raw.trim().toLowerCase();
    this.matches.clear();
    const results = $('#search-results');
    if (q) {
      for (const pp of this.model.projects) {
        const p = pp.project;
        const hay = [...allVariants(p.title), ...allVariants(p.tagline), ...allVariants(pp.district.name), ...p.stack].join(' ').toLowerCase();
        if (hay.includes(q)) this.matches.add(p.id);
      }
      const lang = getLang();
      const items = [...this.matches].slice(0, 8).map((id) => {
        const pp = this.model.byId.get(id)!;
        return h('li', {}, h('button', { type: 'button', 'data-id': id, style: `--d:${pp.district.color}` }, h('span', { class: 'dot' }), loc(pp.project.title, lang)));
      });
      results.replaceChildren(
        h('li', { class: 'results-count' }, this.matches.size ? `${this.matches.size}` : t('noResults')),
        ...items,
      );
      results.hidden = false;
    } else {
      results.hidden = true;
      results.replaceChildren();
    }
    this.applyHighlights();
  }

  private updateThemeButton(): void {
    const btn = $('#btn-theme');
    btn.textContent = this.themeMode === 'auto' ? '◐' : this.themeMode === 'day' ? '☀' : '☾';
    const label = t(this.themeMode === 'auto' ? 'themeAuto' : this.themeMode === 'day' ? 'themeDay' : 'themeNight');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  private onInteract(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.hint.classList.remove('is-visible');
  }

  // ---------- theme ----------

  private updateDaylight(): void {
    this.theme = themeFor(nightFactor(this.themeMode));
    this.applyTheme();
    this.updateThemeButton();
  }

  private applyTheme(): void {
    const th = this.theme;
    this.world.applyTheme(th);
    this.applyGlow();
    this.stage.style.setProperty('--water', `#${th.water.getHexString()}`);
    document.body.dataset.daylight = th.night > 0.6 ? 'night' : th.night > 0.25 ? 'dusk' : 'day';
  }

  /** Window glow, neon, lamp pools and bloom: zoomed all the way in at night they drop to 70%. */
  private applyGlow(): void {
    const th = this.theme;
    const g = 1 - 0.3 * this.glowZoom * th.night;
    this.ctx.applyTheme({ ...th, bloom: th.bloom * g });
    for (const b of this.buildings.values()) {
      b.windowMats.forEach((m) => (m.emissiveIntensity = th.windowGlow * g));
      b.neon.forEach((n) => n.mat.color.copy(n.base).multiplyScalar(th.neon * g));
    }
    for (const l of this.links) {
      l.windowMats.forEach((m) => (m.emissiveIntensity = th.windowGlow * g));
      l.neon.forEach((n) => n.mat.color.copy(n.base).multiplyScalar(Math.max(1, th.neon * g)));
      l.setNight(th.night * g);
    }
  }

  private updateGlowZoom(): void {
    const rig = this.ctx.rig;
    const z = Math.max(rig.zoomIn, THREE.MathUtils.smoothstep(rig.zoom, 1.2, 2.2));
    if (Math.abs(z - this.glowZoom) < 0.01) return;
    this.glowZoom = z;
    if (this.theme.night > 0) this.applyGlow();
  }

  private refreshLang(): void {
    const plaque = this.plaqueOpen;
    if (plaque) {
      this.closePlaque();
      this.togglePlaque(plaque);
    }
    this.refreshLabelText();
    this.card.refresh();
    this.page.refresh();
    this.about.refresh();
    if (this.list.isOpen) this.list.refresh();
    showHint(this.hint, this.touch);
    this.updateThemeButton();
    const search = $('#search') as HTMLInputElement;
    if (search.value) this.runSearch(search.value);
    if (this.selected) {
      const pp = this.model.byId.get(this.selected)!;
      this.ctx.rig.flyTo({ offsetX: this.stage.clientWidth < 700 ? 0 : isRtl() ? -0.34 : 0.34, azimuth: this.focusAzimuth(pp) });
    }
  }

  // ---------- frame loop ----------

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // The project page covers the map: skip rendering it.
    if (this.page.isOpen) return;

    const time = now / 1000;
    this.ctx.rig.update(dt);
    this.updateGlowZoom();

    if (!this.introDone) {
      const t0 = (now - this.introStart) / 1000;
      let done = true;
      for (const pp of this.model.projects) {
        const delay = 0.15 + (pp.radius / this.model.radius) * 0.9;
        const p = Math.min(1, Math.max(0, (t0 - delay) / 0.7));
        if (p < 1) done = false;
        this.buildings.get(pp.project.id)!.body.scale.y = Math.max(0.001, easeOutBack(p));
      }
      this.introDone = done;
    }
    if (!this.hintShown && (now - this.introStart) / 1000 > 1.6) {
      this.hintShown = true;
      showHint(this.hint, this.touch);
      // Touch screens can't hover the square, so they get the hint briefly, then it fades out.
      if (this.touch && !this.interacted) {
        this.hint.classList.add('is-visible');
        setTimeout(() => this.hint.classList.remove('is-visible'), 4500);
      }
    }

    const raised = (id: string) => id === this.hovered || id === this.selected;
    for (const [id, b] of this.buildings) {
      const partner = this.bridgePartner.get(id);
      const lifted = raised(id) || (partner !== undefined && raised(partner));
      b.body.position.y += ((lifted ? 0.3 : 0) - b.body.position.y) * Math.min(1, dt * 10);
      this.labels.setVisible(`b:${id}`, lifted || this.matches.has(id));
      for (const bl of b.blinkers) bl.visible = Math.sin(time * 3 + b.height) > -0.3;
    }
    const az = this.ctx.rig.azimuth;
    this.world.update(time, az);
    for (const l of this.links) {
      l.update(dt);
      if (l.bridge) l.bridge.position.y = this.buildings.get(l.conn.a.project.id)!.body.position.y;
    }
    this.animatePlaques(dt);
    this.layoutLabels();
    // Every frame, so it follows the camera when the visitor rotates while a building is open.
    this.findFocusOccluders();
    this.fadeOccluders(dt);
    this.ctx.render();
  };
}
