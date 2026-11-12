/**
 * What stands between two linked projects, by how close they are:
 *  1 = a paved path lined with street lamps,
 *  2 = the same path through a small shared park (rich lawn, hedge, trees, a bench),
 *  3 = the path plus a covered skybridge between their second storeys.
 * Every link has a neon line along the path that lights up while either building is selected,
 * and its lamps throw pools of warm light at night.
 */
import * as THREE from 'three';
import { LAYOUT, type PlacedConnection } from '../data/model';

export interface ConnectionHandle {
  conn: PlacedConnection;
  group: THREE.Group;
  /** Skybridge, if any (moves up with its buildings when they lift). */
  bridge: THREE.Group | null;
  windowMats: THREE.MeshStandardMaterial[];
  neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  setLit(on: boolean): void;
  /** 0 = day, 1 = night: how strongly the lamps light the ground. */
  setNight(n: number): void;
  /** Ease the glow; call every frame. */
  update(dt: number): void;
  dispose(): void;
}

const PATH_W = 0.72;

export function createConnection(conn: PlacedConnection, opts: { shadows: boolean }): ConnectionHandle {
  const { a, b, level } = conn;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const accent = new THREE.Color(a.district.color);
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const neon: ConnectionHandle['neon'] = [];

  // Local frame: x runs from A to B along the ground, z is sideways.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  group.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  group.rotation.y = -Math.atan2(dz, dx);
  // The part of the path outside both buildings.
  const x0 = -len / 2 + a.footprint / 2;
  const x1 = len / 2 - b.footprint / 2;
  const open = Math.max(0.2, x1 - x0);
  const midX = (x0 + x1) / 2;

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(own(geo), mat);
    m.castShadow = opts.shadows;
    m.receiveShadow = opts.shadows;
    parent.add(m);
    return m;
  };
  const flat = (w: number, d: number, mat: THREE.Material, y: number, x = 0) => {
    const m = mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, 0);
    m.castShadow = false;
    return m;
  };

  const stoneMat = own(
    new THREE.MeshStandardMaterial({ color: '#ead7a6', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  const darkMat = own(new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.8 }));
  const neonMat = (color: THREE.Color, opacity = 1) => {
    const mat = own(new THREE.MeshBasicMaterial({ color: color.clone(), toneMapped: false, transparent: opacity < 1, opacity }));
    neon.push({ mat, base: color.clone() });
    return mat;
  };

  // Shared park under the path (level 2).
  if (level === 2) {
    const r = Math.min(1.4, open / 2 - 0.1);
    // A darker hedge rim under a raised, deep-green lawn, so the park stands out from the island's grass.
    const hedge = mesh(
      new THREE.CylinderGeometry(r + 0.1, r + 0.12, 0.12, 32),
      own(new THREE.MeshStandardMaterial({ color: '#23692a', roughness: 1, flatShading: true })),
    );
    hedge.scale.z = 1.3;
    hedge.position.set(midX, 0.06, 0);
    const lawn = mesh(
      new THREE.CylinderGeometry(r, r, 0.14, 32),
      own(new THREE.MeshStandardMaterial({ color: '#3fae36', roughness: 0.9, emissive: new THREE.Color('#1d5a16'), emissiveIntensity: 0.25 })),
    );
    lawn.scale.z = 1.3;
    lawn.position.set(midX, 0.07, 0);
    lawn.castShadow = false;
    // Flower beds.
    const petals = ['#ff7eb6', '#ffd84d', '#ffffff', '#ff9f43'].map((c) => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })));
    const flowerGeo = own(new THREE.IcosahedronGeometry(0.045, 0));
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.2;
      const rr = r * (0.72 + 0.16 * Math.sin(i * 2.3));
      const z = Math.sin(ang) * rr * 1.3;
      if (Math.abs(z) < PATH_W / 2 + 0.12) continue;
      const f = new THREE.Mesh(flowerGeo, petals[i % petals.length]);
      f.position.set(midX + Math.cos(ang) * rr, 0.16, z);
      group.add(f);
    }
    const trunkMat = own(new THREE.MeshStandardMaterial({ color: '#6b4e37', roughness: 1 }));
    const crownMat = own(new THREE.MeshStandardMaterial({ color: '#2f8f3a', roughness: 1, flatShading: true }));
    const trees: [number, number, number][] = [
      [midX - r * 0.45, -r * 0.85, 0.9],
      [midX + r * 0.5, -r * 0.7, 0.75],
      [midX + r * 0.1, r * 0.95, 0.85],
    ];
    for (const [x, z, k] of trees) {
      const trunk = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4 * k, 6), trunkMat);
      trunk.position.set(x, 0.14 + 0.2 * k, z);
      const crown = mesh(new THREE.IcosahedronGeometry(0.36 * k, 0), crownMat);
      crown.position.set(x, 0.14 + 0.55 * k, z);
    }
    // A bench by the path, facing it.
    const seat = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), darkMat);
    seat.position.set(midX, 0.3, -(PATH_W / 2 + 0.22));
    const back = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.04), darkMat);
    back.position.set(midX, 0.4, -(PATH_W / 2 + 0.3));
  }

  // The path, building to building (its ends disappear inside them), with low curbs.
  const pathY = level === 2 ? 0.15 : 0.04;
  flat(len, PATH_W, stoneMat, pathY);
  const curbMat = own(new THREE.MeshStandardMaterial({ color: '#8c7650', roughness: 1 }));
  for (const side of [-1, 1]) {
    const curb = mesh(new THREE.BoxGeometry(len, 0.06, 0.07), curbMat);
    curb.position.set(0, pathY + 0.01, side * (PATH_W / 2 + 0.02));
  }
  const glow = neonMat(accent, 0);
  glow.transparent = true;
  glow.depthWrite = false;
  flat(len, 0.14, glow, pathY + 0.01);

  // Street lamps along the open stretch, alternating sides, each with a pool of light at night.
  const ironMat = own(new THREE.MeshStandardMaterial({ color: '#262a33', roughness: 0.5, metalness: 0.6 }));
  const lampMat = neonMat(new THREE.Color('#ffd486'));
  const poolMat = own(
    new THREE.MeshBasicMaterial({ color: '#ffc46b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const poolGeo = own(new THREE.CircleGeometry(0.55, 20));
  const count = Math.max(2, Math.round(open / 0.85));
  for (let i = 0; i < count; i++) {
    const x = x0 + (open * (i + 0.5)) / count;
    const side = i % 2 === 0 ? 1 : -1;
    const z = side * (PATH_W / 2 + 0.16);
    const base = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.08, 8), ironMat);
    base.position.set(x, pathY + 0.04, z);
    const post = mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.8, 8), ironMat);
    post.position.set(x, pathY + 0.44, z);
    // Arm reaching over the path, a glowing lantern hanging from it, and a little roof.
    const arm = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), ironMat);
    arm.position.set(x, pathY + 0.83, z - side * 0.1);
    const lantern = mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), lampMat);
    lantern.position.set(x, pathY + 0.73, z - side * 0.19);
    lantern.castShadow = false;
    const roof = mesh(new THREE.ConeGeometry(0.1, 0.07, 4), ironMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, pathY + 0.835, z - side * 0.19);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, pathY + 0.02, z - side * 0.19);
    group.add(pool);
  }

  // Covered skybridge between the second storeys (level 3).
  let bridge: THREE.Group | null = null;
  if (level === 3) {
    bridge = new THREE.Group();
    group.add(bridge);
    const fh = LAYOUT.floorH;
    const y = Math.min(a.floors, b.floors) >= 2 ? fh * 1.5 : fh * 0.55;
    const shell = mesh(new THREE.BoxGeometry(len, 0.5, 0.72), own(new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.8 })), bridge);
    shell.position.y = y;
    const glass = own(
      new THREE.MeshStandardMaterial({ color: '#2b3546', roughness: 0.3, metalness: 0.2, emissive: new THREE.Color('#ffc46b'), emissiveIntensity: 0 }),
    );
    windowMats.push(glass);
    const band = mesh(new THREE.BoxGeometry(len, 0.2, 0.74), glass, bridge);
    band.position.y = y + 0.04;
    const trim = mesh(new THREE.BoxGeometry(len, 0.04, 0.76), neonMat(accent), bridge);
    trim.position.y = y - 0.25;
    trim.castShadow = false;
  }

  let lit = false;
  let glowNow = 0.18;
  return {
    conn,
    group,
    bridge,
    windowMats,
    neon,
    setLit(on) {
      lit = on;
    },
    setNight(n) {
      poolMat.opacity = Math.max(0, n - 0.15) * 0.45;
    },
    update(dt) {
      glowNow += ((lit ? 1 : 0.18) - glowNow) * Math.min(1, dt * 6);
      glow.opacity = glowNow;
    },
    dispose() {
      disposables.forEach((x) => x.dispose());
    },
  };
}
