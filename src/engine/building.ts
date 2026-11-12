/**
 * Procedural buildings. A project becomes:
 *  - one storey per floor (floor i = module i from the content file),
 *  - a footprint that grows with team size,
 *  - a style by height: house (pitched mossy roof), block (roof garden), tower (setbacks + antenna),
 *  - a neon sign and a district-coloured accent band.
 * The same id always yields the same building (seeded randomness).
 */
import * as THREE from 'three';
import { LAYOUT, type PlacedProject } from '../data/model';
import { rngFor } from './rng';
import { plaqueTexture, signTexture, windowTextures, WINDOW_VARIANTS } from './textures';

const WALLS = ['#8c6f5c', '#5f7594', '#6d5f80', '#7b8a68', '#9b7b63', '#56707a', '#84698a', '#a08a6e'];
const MOSS = '#6c9a52';
export const HIGHLIGHT = new THREE.Color('#38e8ff');

export interface BuildingHandle {
  id: string;
  /** Positioned and rotated in the city. */
  group: THREE.Group;
  /** Child that is scaled (intro) and lifted (hover). */
  body: THREE.Group;
  /** Invisible box used for picking. */
  pick: THREE.Mesh;
  floors: THREE.Mesh[];
  height: number;
  windowMats: THREE.MeshStandardMaterial[];
  neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  blinkers: THREE.Mesh[];
  /** The "founded" plaque, if the project has a date (the project-page viewer enlarges it). */
  plaque: THREE.Group | null;
  /** Invisible hit box around the plaque (clicking it opens the plaque's note on the map). */
  plaquePick: THREE.Mesh | null;
  setHighlight(on: boolean): void;
  highlightFloor(index: number | null): void;
  /** 1 = solid, lower = see-through (for buildings standing in front of the plaza when zoomed in). */
  setFade(alpha: number): void;
  readonly fade: number;
  dispose(): void;
}

export function createBuilding(pp: PlacedProject, opts: { shadows: boolean }): BuildingHandle {
  const rng = rngFor(pp.project.id);
  const accent = new THREE.Color(pp.district.color);
  const wallColor = new THREE.Color(WALLS[Math.floor(rng() * WALLS.length)]).lerp(accent, 0.12);
  const n = pp.floors;
  const fh = LAYOUT.floorH;
  const w0 = pp.footprint;
  const depthRatio = 0.8 + rng() * 0.15;
  const style = n <= 2 ? 'house' : n <= 5 ? 'block' : 'tower';

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const floors: THREE.Mesh[] = [];
  const edges: THREE.LineSegments[] = [];
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const neon: BuildingHandle['neon'] = [];
  const blinkers: THREE.Mesh[] = [];

  const plainMat = own(new THREE.MeshStandardMaterial({ color: wallColor.clone().multiplyScalar(0.8), roughness: 0.9 }));
  const darkMat = own(new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.8 }));
  const mossMat = own(new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }));
  const edgeMat = own(new THREE.LineBasicMaterial({ color: HIGHLIGHT }));
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const wallMat = (variant: number, repeat: number) => {
    const key = `${variant}-${repeat}`;
    let m = matCache.get(key);
    if (!m) {
      const tex = windowTextures(variant, repeat);
      m = own(
        new THREE.MeshStandardMaterial({
          color: wallColor,
          map: tex.map,
          emissive: new THREE.Color('#ffc46b'),
          emissiveMap: tex.emissive,
          emissiveIntensity: 0,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      matCache.set(key, m);
      windowMats.push(m);
    }
    return m;
  };
  const neonMat = (color: THREE.Color, map?: THREE.Texture) => {
    const mat = own(new THREE.MeshBasicMaterial({ color: color.clone(), map, toneMapped: false, transparent: !!map }));
    neon.push({ mat, base: color.clone() });
    return mat;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) => {
    own(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.shadows;
    m.receiveShadow = opts.shadows;
    body.add(m);
    return m;
  };

  // Storeys.
  let y = 0;
  let w = w0;
  const depths: number[] = [];
  for (let i = 0; i < n; i++) {
    if (style === 'tower' && i > 0 && i % 3 === 0) w *= 0.88;
    const d = w * depthRatio;
    depths.push(d);
    const mat = wallMat(Math.floor(rng() * WINDOW_VARIANTS), Math.max(1, Math.round(w / 1.7)));
    // Box face order: +x, -x, +y, -y, +z, -z. No windows on top/bottom.
    const floor = mesh(new THREE.BoxGeometry(w, fh, d), [mat, mat, plainMat, plainMat, mat, mat]);
    floor.position.y = y + fh / 2;
    floor.userData.floorIndex = i;
    floors.push(floor);
    const e = new THREE.LineSegments(own(new THREE.EdgesGeometry(floor.geometry)), edgeMat);
    e.position.copy(floor.position);
    e.visible = false;
    body.add(e);
    edges.push(e);
    if (style === 'tower' && i % 3 === 2 && i < n - 1) {
      const ledge = mesh(new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12), plainMat);
      ledge.position.y = y + fh;
    }
    y += fh;
  }
  const top = y;
  const d0 = depths[0];

  // Ground floor: door, awning in district colour, accent band.
  const door = mesh(new THREE.PlaneGeometry(0.34, 0.56), darkMat);
  door.position.set(0, 0.28, d0 / 2 + 0.006);
  const awning = mesh(new THREE.BoxGeometry(Math.min(w0 * 0.55, 1.1), 0.05, 0.3), neonMat(accent.clone().multiplyScalar(0.6)));
  awning.position.set(0, 0.62, d0 / 2 + 0.15);
  if (n > 1) {
    const band = mesh(new THREE.BoxGeometry(w0 + 0.03, 0.05, d0 + 0.03), neonMat(accent));
    band.position.y = fh;
  }

  // Neon sign on the front.
  const signFloor = Math.min(1, n - 1);
  const signW = Math.min(depthWidth(floors[signFloor]) * 0.85, 1.6);
  const signText = pp.project.sign ?? defaultSign(pp);
  const sign = mesh(new THREE.PlaneGeometry(signW, signW / 4), neonMat(new THREE.Color('#ffffff'), signTexture(signText, pp.district.color)));
  sign.castShadow = false;
  sign.position.set(0, n === 1 ? fh - signW / 8 - 0.04 : signFloor * fh + fh * 0.55, depths[signFloor] / 2 + 0.02);

  // Roof by style.
  const topW = depthWidth(floors[n - 1]);
  const topD = depths[n - 1];
  if (style === 'house') {
    const roof = mesh(new THREE.ConeGeometry(topW * 0.74, 0.8, 4), mossMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = depthRatio;
    roof.position.y = top + 0.4;
  } else {
    const slab = mesh(new THREE.BoxGeometry(topW + 0.12, 0.12, topD + 0.12), plainMat);
    slab.position.y = top + 0.06;
    const garden = mesh(new THREE.BoxGeometry(topW * 0.6, 0.16, topD * 0.5), mossMat);
    garden.position.set(-topW * 0.12, top + 0.2, -topD * 0.1);
    if (style === 'block') {
      const tank = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10), darkMat);
      tank.position.set(topW * 0.3, top + 0.33, topD * 0.25);
    } else {
      const cap = mesh(new THREE.BoxGeometry(topW * 0.45, 0.55, topD * 0.45), plainMat);
      cap.position.y = top + 0.39;
      const antenna = mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 6), darkMat);
      antenna.position.y = top + 1.4;
      const light = mesh(new THREE.SphereGeometry(0.07, 8, 6), neonMat(new THREE.Color('#ff4d5e')));
      light.position.y = top + 2.17;
      light.castShadow = false;
      blinkers.push(light);
      if (pp.project.tier === 'featured') {
        const flag = mesh(new THREE.PlaneGeometry(0.42, 0.24), neonMat(accent));
        (flag.material as THREE.Material).side = THREE.DoubleSide;
        flag.position.set(0.22, top + 1.95, 0);
      }
    }
  }
  let height = style === 'house' ? top + 0.8 : style === 'tower' ? top + 2.2 : top + 0.45;

  // Under construction: yellow scaffolding poles round the top storeys, a hazard band and a tower crane.
  if (pp.project.status === 'construction') {
    const yellow = own(new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.6 }));
    const steel = own(new THREE.MeshStandardMaterial({ color: '#d9a400', roughness: 0.5 }));
    const rope = own(new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.9 }));
    const scafH = Math.min(top, fh * 2.2);
    const sw = topW + 0.22;
    const sd = topD + 0.22;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, scafH + 0.3, 5), yellow);
        pole.position.set((sx * sw) / 2, top - scafH / 2 + 0.15, (sz * sd) / 2);
      }
    }
    for (let k = 0; k < 3; k++) {
      const yy = top - scafH + 0.1 + k * (scafH / 2.2);
      for (const sz of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(sw, 0.03, 0.03), yellow);
        rail.position.set(0, yy, (sz * sd) / 2);
      }
      for (const sx of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(0.03, 0.03, sd), yellow);
        rail.position.set((sx * sw) / 2, yy, 0);
      }
    }
    const tape = mesh(new THREE.BoxGeometry(w0 + 0.06, 0.07, d0 + 0.06), neonMat(new THREE.Color('#ffb000')));
    tape.position.y = 0.07;
    // Tower crane: mast beside the building, jib out over it, counterweight, hook on a cable.
    const mastH = top + 1.5;
    const mx = -w0 / 2 - 0.35;
    const mz = -d0 / 2 + 0.1;
    const mast = mesh(new THREE.BoxGeometry(0.1, mastH, 0.1), steel);
    mast.position.set(mx, mastH / 2, mz);
    const jib = mesh(new THREE.BoxGeometry(w0 + 1.5, 0.07, 0.07), steel);
    jib.position.set(mx + (w0 + 1.5) / 2 - 0.45, mastH, mz);
    const counter = mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), darkMat);
    counter.position.set(mx - 0.4, mastH - 0.1, mz);
    const cabin = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), yellow);
    cabin.position.set(mx, mastH + 0.12, mz);
    const hookX = mx + w0 * 0.55 + 0.4;
    const cable = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), rope);
    cable.position.set(hookX, mastH - 0.45, mz);
    const load = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), yellow);
    load.position.set(hookX, mastH - 0.96, mz);
    const lamp = mesh(new THREE.SphereGeometry(0.05, 8, 6), neonMat(new THREE.Color('#ffb000')));
    lamp.position.set(mx, mastH + 0.3, mz);
    lamp.castShadow = false;
    blinkers.push(lamp);
    height = Math.max(height, mastH + 0.35);

    // Site ground, on the group so it stays put when the building lifts on hover.
    const site = new THREE.Group();
    group.add(site);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, yy: number, z: number, ry = 0) => {
      own(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, yy, z);
      m.rotation.y = ry;
      m.castShadow = opts.shadows;
      m.receiveShadow = opts.shadows;
      site.add(m);
      return m;
    };
    // Wooden pallet with a stack of bricks, beside the building (right side, towards the back).
    const wood = own(new THREE.MeshStandardMaterial({ color: '#b8864b', roughness: 0.95 }));
    const woodDark = own(new THREE.MeshStandardMaterial({ color: '#8a6234', roughness: 0.95 }));
    const brickMats = ['#b5482f', '#a23f29', '#c15a3c'].map((c) => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })));
    const px = w0 / 2 + 0.7;
    const pz = -d0 * 0.1;
    const PW = 0.56;
    const PD = 0.4;
    for (const dz of [-1, 0, 1]) add(new THREE.BoxGeometry(PW, 0.025, 0.085), wood, px, 0.1, pz + dz * 0.15);
    for (const dx of [-1, 0, 1]) add(new THREE.BoxGeometry(0.08, 0.07, PD), woodDark, px + dx * 0.22, 0.05, pz);
    for (const dz of [-1, 0, 1]) add(new THREE.BoxGeometry(PW, 0.02, 0.085), wood, px, 0.012, pz + dz * 0.15);
    const bw = 0.13;
    const bh = 0.05;
    const bd = 0.062;
    for (let row = 0; row < 5; row++) {
      const turned = row % 2 === 1;
      const cols = turned ? 3 : 4;
      const lanes = turned ? 4 : 3;
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < lanes; b++) {
          const bx = turned ? (b - (lanes - 1) / 2) * (bd + 0.008) : (a - (cols - 1) / 2) * (bw + 0.008);
          const bz = turned ? (a - (cols - 1) / 2) * (bw + 0.008) : (b - (lanes - 1) / 2) * (bd + 0.008) * 2.1;
          const geo = turned ? new THREE.BoxGeometry(bd, bh, bw) : new THREE.BoxGeometry(bw, bh, bd);
          add(geo, brickMats[(a + b + row) % 3], px + bx, 0.125 + bh / 2 + row * (bh + 0.004), pz + bz);
        }
      }
    }
    // A few loose bricks on the ground.
    add(new THREE.BoxGeometry(bw, bh, bd), brickMats[0], px - 0.5, bh / 2, pz + 0.25, 0.5);
    add(new THREE.BoxGeometry(bw, bh, bd), brickMats[1], px - 0.38, bh / 2, pz + 0.38, -0.3);

    // Safety fence: orange and yellow barrier boards between posts, with a gap at the front for the gate.
    const orange = own(new THREE.MeshStandardMaterial({ color: '#ff7a00', roughness: 0.6 }));
    const yel = own(new THREE.MeshStandardMaterial({ color: '#ffd400', roughness: 0.6 }));
    const post = own(new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.7 }));
    const fx = w0 / 2 + 1.25;
    const fz = d0 / 2 + 0.95;
    const FH = 0.34;
    const run = (x1: number, z1: number, x2: number, z2: number, gap?: [number, number]) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const segs = Math.max(2, Math.round(len / 0.5));
      const ang = Math.atan2(-(z2 - z1), x2 - x1);
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs;
        const t1 = (k + 1) / segs;
        const tm = (t0 + t1) / 2;
        if (gap && tm > gap[0] && tm < gap[1]) continue;
        const mx = x1 + (x2 - x1) * tm;
        const mz = z1 + (z2 - z1) * tm;
        const sl = (len / segs) * 0.94;
        const col = k % 2 === 0 ? orange : yel;
        // Two boards per bay (top and middle) with a diagonal-looking colour swap.
        add(new THREE.BoxGeometry(sl, 0.07, 0.025), col, mx, FH - 0.04, mz, ang);
        add(new THREE.BoxGeometry(sl, 0.07, 0.025), k % 2 === 0 ? yel : orange, mx, FH * 0.55, mz, ang);
      }
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        if (gap && t > gap[0] - 1e-6 && t < gap[1] + 1e-6 && k !== 0 && k !== segs) continue;
        add(new THREE.CylinderGeometry(0.022, 0.022, FH + 0.04, 6), post, x1 + (x2 - x1) * t, (FH + 0.04) / 2, z1 + (z2 - z1) * t);
      }
    };
    run(-fx, fz, fx, fz, [0.4, 0.6]); // front, with the gate gap
    run(-fx, -fz, fx, -fz); // back
    run(-fx, -fz, -fx, fz); // left
    run(fx, -fz, fx, fz); // right
    // Warning sign on a post beside the gate.
    const sx = -fx * 0.4;
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), post, sx, 0.25, fz + 0.06);
    add(new THREE.BoxGeometry(0.2, 0.2, 0.02), yel, sx, 0.52, fz + 0.07).rotation.z = Math.PI / 4;
  }

  // Picking volume.
  const pick = new THREE.Mesh(
    own(new THREE.BoxGeometry(w0 * 1.05, height, d0 * 1.05)),
    own(new THREE.MeshBasicMaterial({ visible: false })),
  );
  pick.position.y = height / 2;
  pick.userData = { kind: 'building', id: pp.project.id };
  body.add(pick);

  // "Founded" plaque on a short post, on the lawn in front of the building, right of the door.
  // It lives on the group (not the body) so it stays on the ground when the building lifts on hover.
  let plaque: THREE.Group | null = null;
  let plaquePick: THREE.Mesh | null = null;
  if (pp.project.founded) {
    plaque = new THREE.Group();
    const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 6)), darkMat);
    post.position.y = 0.17;
    const plateMat = own(
      new THREE.MeshStandardMaterial({ map: plaqueTexture(pp.project.founded), roughness: 0.45, metalness: 0.35 }),
    );
    const plate = new THREE.Mesh(own(new THREE.BoxGeometry(0.64, 0.4, 0.035)), [darkMat, darkMat, darkMat, darkMat, plateMat, darkMat]);
    plate.position.y = 0.46;
    // Tilted back so it reads from the map's raised camera.
    plate.rotation.x = -0.55;
    plaque.add(post, plate);
    plaque.traverse((o: THREE.Object3D) => {
      o.castShadow = opts.shadows;
      o.receiveShadow = opts.shadows;
    });
    // Generous invisible hit box: the plate is only a few pixels wide on the map.
    plaquePick = new THREE.Mesh(own(new THREE.BoxGeometry(0.95, 0.8, 0.5)), own(new THREE.MeshBasicMaterial({ visible: false })));
    plaquePick.position.y = 0.4;
    plaquePick.userData = { kind: 'plaque', id: pp.project.id };
    plaque.add(plaquePick);
    plaque.position.set(Math.min(w0 / 2, 1.1), 0, d0 / 2 + 0.5);
    group.add(plaque);
  }

  group.position.set(pp.x, 0, pp.z);
  // Front (+z) faces the plaza.
  group.rotation.y = Math.atan2(-Math.cos(pp.angle), -Math.sin(pp.angle));
  group.userData = { kind: 'building', id: pp.project.id };

  // See-through mode: every visible material, with its own transparency remembered so it can be restored.
  type FadeMat = { m: THREE.Material; transparent: boolean; opacity: number; depthWrite: boolean };
  let fadeMats: FadeMat[] | null = null;
  let fadeNow = 1;
  const setFade = (alpha: number) => {
    if (Math.abs(alpha - fadeNow) < 0.004) return;
    if (!fadeMats) {
      const seen = new Set<THREE.Material>();
      const list: FadeMat[] = [];
      fadeMats = list;
      group.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        if (!mats) return;
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          if (seen.has(m) || !m.visible) continue;
          seen.add(m);
          list.push({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        }
      });
    }
    const solid = alpha >= 0.999;
    for (const f of fadeMats) {
      f.m.transparent = solid ? f.transparent : true;
      f.m.opacity = f.opacity * alpha;
      f.m.depthWrite = solid ? f.depthWrite : false;
      f.m.needsUpdate = f.m.transparent !== f.transparent || solid !== fadeNow >= 0.999;
    }
    // A see-through building shouldn't darken the plaza behind it with its shadow.
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = opts.shadows && alpha > 0.6;
    });
    fadeNow = alpha;
  };

  return {
    id: pp.project.id,
    group,
    body,
    pick,
    floors,
    height,
    windowMats,
    neon,
    blinkers,
    plaque,
    plaquePick,
    setHighlight(on) {
      edges.forEach((e) => (e.visible = on));
    },
    highlightFloor(index) {
      edges.forEach((e, i) => (e.visible = i === index));
    },
    setFade,
    get fade() {
      return fadeNow;
    },
    dispose() {
      disposables.forEach((x) => x.dispose());
    },
  };
}

function depthWidth(floor: THREE.Mesh): number {
  return (floor.geometry as THREE.BoxGeometry).parameters.width;
}

function defaultSign(pp: PlacedProject): string {
  const t = typeof pp.project.title === 'string' ? pp.project.title : pp.project.title.en;
  return t.split(/\s+/)[0].slice(0, 10).toUpperCase();
}
