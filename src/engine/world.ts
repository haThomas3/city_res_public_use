/**
 * The static city: island disc, surrounding water, canal ring, roads,
 * the central plaza with the TE logo, and trees.
 */
import * as THREE from 'three';
import { LAYOUT, type CityModel } from '../data/model';
import type { Theme } from './daylight';
import { mulberry32 } from './rng';
import { logoTexture } from './textures';

export interface World {
  group: THREE.Group;
  /** Invisible cylinder over the plaza, for clicks. */
  plazaPick: THREE.Mesh;
  applyTheme(theme: Theme): void;
  /** azimuth = current camera azimuth; the logo turns so its text always reads upright. */
  update(time: number, azimuth: number): void;
}

export function createWorld(model: CityModel, opts: { lowPower: boolean; shadows: boolean }): World {
  const R = model.radius;
  const group = new THREE.Group();
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra });

  const grassMat = std('#86b56c');
  const stoneMat = std('#bfa98a', { flatShading: true });
  const waterMat = std('#5aa9cc', { roughness: 0.35, metalness: 0.1 });
  const canalMat = std('#6cc0e0', { roughness: 0.3, metalness: 0.1 });
  const roadMat = std('#8d9098');
  const plazaMat = std('#ddd5c6');

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], receive = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = receive && opts.shadows;
    group.add(m);
    return m;
  };

  // Island: cylinder whose top face is the grass at y = 0. Groups: side, top, bottom.
  const island = add(new THREE.CylinderGeometry(R, R * 0.96, 1.6, 96, 1), [stoneMat, grassMat, stoneMat]);
  island.position.y = -0.8;

  // Water all around.
  const water = add(new THREE.CircleGeometry(R * 7, 64), waterMat, false);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.1;

  // Canal ring around the plaza.
  const canal = add(new THREE.RingGeometry(LAYOUT.canalIn, LAYOUT.canalOut, 96), canalMat);
  canal.rotation.x = -Math.PI / 2;
  canal.position.y = 0.012;

  // Ring road.
  const ring = add(
    new THREE.RingGeometry(LAYOUT.ringRoadR - LAYOUT.ringRoadW / 2, LAYOUT.ringRoadR + LAYOUT.ringRoadW / 2, 96),
    roadMat,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.014;

  // Radial roads on district borders, with bridges over the canal.
  const roadLen = R - LAYOUT.ringRoadR - 0.4;
  const bridgeMat = std('#a58c6f');
  for (const sec of model.sectors) {
    const a = sec.start;
    const road = add(new THREE.PlaneGeometry(1.1, roadLen), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -a - Math.PI / 2;
    const mid = LAYOUT.ringRoadR + roadLen / 2;
    road.position.set(Math.cos(a) * mid, 0.016, Math.sin(a) * mid);

    const bridgeLen = LAYOUT.ringRoadR - LAYOUT.plazaR + 0.2;
    const bridge = add(new THREE.BoxGeometry(1.1, 0.14, bridgeLen), bridgeMat);
    const bm = LAYOUT.plazaR + bridgeLen / 2 - 0.2;
    bridge.position.set(Math.cos(a) * bm, 0.07, Math.sin(a) * bm);
    bridge.rotation.y = -a + Math.PI / 2;
    bridge.castShadow = opts.shadows;
  }

  // Second-row streets: an arc between the first and second ring of buildings, in districts that have two rings.
  for (const sec of model.sectors) {
    for (const sr of sec.streets) {
      const len = sec.end - sec.start;
      const arc = add(
        new THREE.RingGeometry(sr - LAYOUT.streetW / 2, sr + LAYOUT.streetW / 2, Math.max(8, Math.ceil((len * 64) / (Math.PI * 2))), 1, -sec.end, len),
        roadMat,
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.0145;
    }
  }

  // Plaza: two stepped stone tiers, neon rings, logo.
  const plazaBase = add(new THREE.CylinderGeometry(LAYOUT.plazaR, LAYOUT.plazaR + 0.1, 0.26, 64), plazaMat);
  plazaBase.position.y = 0.13;
  const tier2 = add(new THREE.CylinderGeometry(LAYOUT.plazaR * 0.62, LAYOUT.plazaR * 0.66, 0.24, 64), plazaMat);
  tier2.position.y = 0.38;
  const glow = (color: string, radius: number, y: number) => {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 96), mat);
    torus.rotation.x = Math.PI / 2;
    torus.position.y = y;
    group.add(torus);
    return { mat, base: new THREE.Color(color) };
  };
  const neons = [glow('#38e8ff', LAYOUT.plazaR * 0.86, 0.27), glow('#c77dff', LAYOUT.plazaR * 0.64, 0.51)];
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(LAYOUT.plazaR * 0.55, 64),
    new THREE.MeshBasicMaterial({ map: logoTexture(model.data.owner.initials), toneMapped: false }),
  );
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.505;
  group.add(logo);

  // Soft light column over the logo, visible mostly at night.
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#38e8ff',
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 5, 32, 1, true), beamMat);
  beam.position.y = 3;
  group.add(beam);

  const plazaPick = new THREE.Mesh(
    new THREE.CylinderGeometry(LAYOUT.plazaR, LAYOUT.plazaR, 2, 24),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  plazaPick.position.y = 1;
  plazaPick.userData = { kind: 'plaza' };
  group.add(plazaPick);

  // Trees: instanced, scattered in free space.
  const rng = mulberry32(1234);
  const spots: THREE.Vector3[] = [];
  const target = opts.lowPower ? 70 : 150;
  const blocked = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r < LAYOUT.ringRoadR + LAYOUT.ringRoadW / 2 + 0.5 || r > R - 0.7) return true;
    for (const p of model.projects) if (Math.hypot(x - p.x, z - p.z) < p.footprint * 0.85 + 0.55) return true;
    // Keep paths, shared parks and skybridges between linked buildings clear.
    for (const c of model.connections) {
      const ex = c.b.x - c.a.x;
      const ez = c.b.z - c.a.z;
      const t = Math.max(0, Math.min(1, ((x - c.a.x) * ex + (z - c.a.z) * ez) / (ex * ex + ez * ez)));
      const d = Math.hypot(x - (c.a.x + ex * t), z - (c.a.z + ez * t));
      if (d < (c.level === 2 ? 2.2 : 1.05)) return true;
    }
    const a = Math.atan2(z, x);
    for (const s of model.sectors) {
      const rel = (((a - s.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (rel < s.end - s.start && s.streets.some((sr) => Math.abs(r - sr) < LAYOUT.streetW / 2 + 0.35)) return true;
    }
    for (const s of model.sectors) {
      const da = a - s.start;
      const along = r * Math.cos(da);
      if (along > 0 && Math.abs(r * Math.sin(da)) < 0.95) return true;
    }
    return false;
  };
  for (let tries = 0; tries < target * 12 && spots.length < target; tries++) {
    const r = Math.sqrt(rng()) * R;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!blocked(x, z) && spots.every((s) => Math.hypot(s.x - x, s.z - z) > 0.75)) {
      spots.push(new THREE.Vector3(x, 0, z));
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 6);
  const crownGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std('#6b4e37'), spots.length);
  const crownMat = std('#4f8a45', { flatShading: true });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tint = new THREE.Color();
  spots.forEach((s, i) => {
    const k = 0.7 + rng() * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    m4.compose(new THREE.Vector3(s.x, 0.22 * k, s.z), q, new THREE.Vector3(k, k, k));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(s.x, 0.62 * k, s.z), q, new THREE.Vector3(k, k * 1.1, k));
    crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, tint.setHSL(0.27 + rng() * 0.08, 0.45, 0.32 + rng() * 0.12));
  });
  trunks.castShadow = crowns.castShadow = opts.shadows;
  group.add(trunks, crowns);

  return {
    group,
    plazaPick,
    applyTheme(theme) {
      grassMat.color.copy(theme.grass);
      stoneMat.color.copy(theme.stone);
      waterMat.color.copy(theme.water);
      canalMat.color.copy(theme.canal);
      roadMat.color.copy(theme.road);
      plazaMat.color.copy(theme.plaza);
      bridgeMat.color.copy(theme.stone).lerp(new THREE.Color('#a58c6f'), 0.5);
      crownMat.color.setScalar(1 - theme.night * 0.35);
      for (const n of neons) n.mat.color.copy(n.base).multiplyScalar(theme.neon);
      beamMat.opacity = 0.02 + theme.night * 0.06;
    },
    update(time, azimuth) {
      // Spin the logo in its own plane so "TE" stays level with the viewer's eye line.
      logo.rotation.z = Math.PI / 2 - azimuth;
      beam.rotation.y = time * 0.2;
      beamMat.opacity = Math.max(0, beamMat.opacity);
    },
  };
}
