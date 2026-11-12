/**
 * Turns content data into a city: building sizes and positions.
 * Pure functions with no three.js or DOM, so they are easy to test.
 *
 * Layout: the plaza sits at the centre, ringed by a canal and a ring road.
 * Each district gets a wedge (sector) of the disc, sized by how much it holds.
 * Inside a wedge, buildings fill rings from the inside out, smallest first,
 * so tall towers stand at the edge and never hide the smaller ones.
 * Linked projects in the same district are kept together and placed side by side
 * (with room for a shared park between them when the link calls for one).
 */
import type { CityData, District, LinkLevel, LocalizedText, Project } from '../types';

export const LAYOUT = {
  plazaR: 5.2,
  canalIn: 5.6,
  canalOut: 6.9,
  ringRoadR: 8.0,
  ringRoadW: 1.3,
  firstRing: 9.8,
  street: 1.4,
  spacing: 1.0,
  edgePad: 0.9,
  floorH: 1.0,
} as const;

/** Extra room between two buildings that share a park. */
export const PARK_GAP = 1.6;

const TIER_BASE: Record<Project['tier'], number> = { featured: 5, more: 3, optional: 1.4 };
/** Buildings can face any direction, so reserve their diagonal. */
const DIAG = 1.42;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface PlacedProject {
  project: Project;
  district: District;
  districtIndex: number;
  score: number;
  floors: number;
  footprint: number;
  x: number;
  z: number;
  /** Angle of the position around the plaza, in radians. */
  angle: number;
  radius: number;
  pinned: boolean;
}

export interface Sector {
  district: District;
  index: number;
  start: number;
  end: number;
  mid: number;
}

export interface PlacedConnection {
  a: PlacedProject;
  b: PlacedProject;
  level: LinkLevel;
  why: LocalizedText;
}

export interface CityModel {
  data: CityData;
  sectors: Sector[];
  projects: PlacedProject[];
  connections: PlacedConnection[];
  byId: Map<string, PlacedProject>;
  /** Radius of the island disc. */
  radius: number;
  maxFloors: number;
}

/** How "big" a project is: tier, then code size, tests, duration and number of modules. */
export function scoreProject(p: Project): number {
  let s = TIER_BASE[p.tier];
  const z = p.size ?? {};
  if (z.linesOfCode) s += clamp(Math.log10(z.linesOfCode) - 2.5, 0, 2);
  if (z.tests) s += Math.min(1.5, z.tests / 40);
  if (z.months) s += Math.min(2, z.months / 3);
  s += Math.min(2, (p.floors?.length ?? 0) * 0.25);
  return s;
}

/** Number of floors: the score, at least one floor per listed module, unless overridden. */
export function floorsFor(p: Project): number {
  if (p.heightOverride) return p.heightOverride;
  return clamp(Math.max(Math.round(scoreProject(p)), p.floors?.length ?? 0), 1, 12);
}

/** Base width: grows with team size. */
export function footprintFor(p: Project): number {
  const team = p.size?.teamSize ?? 1;
  let f = 2.1 + Math.min(Math.max(team, 1) - 1, 4) * 0.35;
  if (p.tier === 'optional') f *= 0.75;
  return Math.round(f * 100) / 100;
}

interface Meta {
  project: Project;
  score: number;
  floors: number;
  footprint: number;
}

/** Buildings placed as one block: a single project, or linked projects side by side. */
interface Unit {
  members: Meta[];
  /** Extra room after each member (a park between it and the next one). */
  extra: number[];
  score: number;
  width: number;
  maxDiag: number;
}

const slotWidth = (m: Meta) => m.footprint * DIAG + LAYOUT.spacing;

/** Group a district's projects so linked ones stay together, ordered along their chain of links. */
function unitsFor(items: Meta[], data: CityData): Unit[] {
  const ids = new Set(items.map((m) => m.project.id));
  const byId = new Map(items.map((m) => [m.project.id, m]));
  const links = (data.connections ?? []).filter((c) => ids.has(c.a) && ids.has(c.b));
  const level = (x: string, y: string) => links.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x))?.level;
  const nbrs = new Map<string, string[]>([...ids].map((id) => [id, []]));
  for (const c of links) {
    nbrs.get(c.a)!.push(c.b);
    nbrs.get(c.b)!.push(c.a);
  }
  for (const list of nbrs.values()) list.sort();
  const seen = new Set<string>();
  const units: Unit[] = [];
  const sorted = [...ids].sort((x, y) => nbrs.get(x)!.length - nbrs.get(y)!.length || x.localeCompare(y));
  for (const start of sorted) {
    if (seen.has(start)) continue;
    // Depth-first from an end of the chain, so each link joins neighbours.
    const order: string[] = [];
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const n of [...nbrs.get(id)!].reverse()) if (!seen.has(n)) stack.push(n);
    }
    const members = order.map((id) => byId.get(id)!);
    const extra = members.map((m, i): number => (i < members.length - 1 && level(m.project.id, members[i + 1].project.id) === 2 ? PARK_GAP : 0));
    units.push({
      members,
      extra,
      score: Math.max(...members.map((m) => m.score)),
      width: members.reduce((w, m) => w + slotWidth(m), 0) + extra.reduce((a, b) => a + b, 0),
      maxDiag: Math.max(...members.map((m) => m.footprint * DIAG)),
    });
  }
  return units.sort((x, y) => x.score - y.score || x.members[0].project.id.localeCompare(y.members[0].project.id));
}

export function buildCityModel(data: CityData): CityModel {
  const metas: Meta[] = data.projects.map((p) => ({
    project: p,
    score: scoreProject(p),
    floors: floorsFor(p),
    footprint: footprintFor(p),
  }));
  const byDistrict = data.districts.map((d) => metas.filter((m) => m.project.district === d.id));

  // Wedge sizes, proportional to the width of what each district holds.
  const weights = byDistrict.map((items) =>
    Math.max(
      2.5,
      items.filter((m) => !m.project.place).reduce((s, m) => s + m.footprint * DIAG + LAYOUT.spacing, 0),
    ),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const MIN_SPAN = 0.5;
  let spans = weights.map((w) => Math.max(MIN_SPAN, (w / total) * Math.PI * 2));
  const spanSum = spans.reduce((a, b) => a + b, 0);
  spans = spans.map((s) => (s / spanSum) * Math.PI * 2);

  const sectors: Sector[] = [];
  let a = -Math.PI / 2 - spans[0] / 2;
  data.districts.forEach((d, i) => {
    sectors.push({ district: d, index: i, start: a, end: a + spans[i], mid: a + spans[i] / 2 });
    a += spans[i];
  });

  const placed: PlacedProject[] = [];
  const make = (m: Meta, sec: Sector, angle: number, radius: number, pinned: boolean): PlacedProject => ({
    project: m.project,
    district: sec.district,
    districtIndex: sec.index,
    score: m.score,
    floors: m.floors,
    footprint: m.footprint,
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    angle,
    radius,
    pinned,
  });

  for (const sec of sectors) {
    const items = byDistrict[sec.index];
    const auto = unitsFor(items.filter((m) => !m.project.place), data);
    const span = sec.end - sec.start;
    let r: number = LAYOUT.firstRing;
    let q = 0;
    while (q < auto.length) {
      const ring: Unit[] = [];
      let width = 0;
      let ringMax = 0;
      while (q < auto.length) {
        const u = auto[q];
        const nextMax = Math.max(ringMax, u.maxDiag);
        const avail = span * (r + nextMax / 2) - 2 * LAYOUT.edgePad;
        if (ring.length > 0 && width + u.width > avail) break;
        ring.push(u);
        width += u.width;
        ringMax = nextMax;
        q++;
      }
      const rc = r + ringMax / 2;
      const avail = span * rc - 2 * LAYOUT.edgePad;
      const gap = Math.max(0, avail - width) / ring.length;
      // If the ring is wider than the wedge, centre it on the wedge.
      let s = avail >= width ? sec.start + LAYOUT.edgePad / rc : sec.mid - width / (2 * rc);
      for (const u of ring) {
        s += gap / 2 / rc;
        u.members.forEach((m, i) => {
          const w = slotWidth(m);
          placed.push(make(m, sec, s + w / 2 / rc, rc, false));
          s += (w + u.extra[i]) / rc;
        });
        s += gap / 2 / rc;
      }
      r = rc + ringMax / 2 + LAYOUT.street;
    }

    for (const m of items.filter((it) => it.project.place)) {
      const pl = m.project.place!;
      const ang = pl.angle !== undefined ? (pl.angle * Math.PI) / 180 : sec.mid;
      placed.push(make(m, sec, ang, pl.radius ?? LAYOUT.firstRing + 1, true));
    }
  }

  // Keep the original content order (stable for lists and tests).
  const order = new Map(data.projects.map((p, i) => [p.id, i]));
  placed.sort((x, y) => order.get(x.project.id)! - order.get(y.project.id)!);

  const radius = Math.max(16, ...placed.map((p) => p.radius + p.footprint * 0.8 + 2.2));
  const maxFloors = Math.max(1, ...placed.map((p) => p.floors));
  const byId = new Map(placed.map((p) => [p.project.id, p]));
  const connections: PlacedConnection[] = (data.connections ?? [])
    .filter((c) => byId.has(c.a) && byId.has(c.b))
    .map((c) => ({ a: byId.get(c.a)!, b: byId.get(c.b)!, level: c.level, why: c.why }));
  return {
    data,
    sectors,
    projects: placed,
    connections,
    byId,
    radius,
    maxFloors,
  };
}
