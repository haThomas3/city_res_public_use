import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCityModel, floorsFor, footprintFor, LAYOUT } from '../src/data/model';
import { validateCity } from '../src/data/validate';
import { parseRoute } from '../src/router';
import type { CityData, Project } from '../src/types';

const data = JSON.parse(readFileSync('content/city.json', 'utf8')) as CityData;

describe('content', () => {
  it('is valid', () => {
    expect(validateCity(data)).toEqual([]);
  });

  it('never links private projects to code', () => {
    for (const p of data.projects.filter((x) => x.access === 'private')) expect(p.links?.github).toBeUndefined();
  });

  it('rejects typos and broken references', () => {
    const bad = structuredClone(data) as unknown as { projects: Record<string, unknown>[] };
    bad.projects[0].titel = 'oops';
    bad.projects[1].district = 'nowhere';
    const errors = validateCity(bad);
    expect(errors.some((e) => e.includes('unknown field "titel"'))).toBe(true);
    expect(errors.some((e) => e.includes('district "nowhere"'))).toBe(true);
  });
});

describe('sizing', () => {
  const base: Project = { id: 'x', district: 'ai', tier: 'more', access: 'public', title: 'X', tagline: 'x', stack: [] };

  it('makes featured projects taller than optional ones', () => {
    expect(floorsFor({ ...base, tier: 'featured' })).toBeGreaterThan(floorsFor({ ...base, tier: 'optional' }));
  });

  it('gives every module its own floor', () => {
    const floors = Array.from({ length: 9 }, (_, i) => ({ name: `m${i}` }));
    expect(floorsFor({ ...base, tier: 'optional', floors })).toBe(9);
  });

  it('respects heightOverride', () => {
    expect(floorsFor({ ...base, heightOverride: 11 })).toBe(11);
  });

  it('widens the footprint with team size', () => {
    expect(footprintFor({ ...base, size: { teamSize: 5 } })).toBeGreaterThan(footprintFor(base));
  });
});

describe('layout', () => {
  const model = buildCityModel(data);

  it('places every project inside the island, outside the ring road', () => {
    expect(model.projects).toHaveLength(data.projects.length);
    for (const p of model.projects) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThan(LAYOUT.ringRoadR + 1);
      expect(r + p.footprint * 0.71).toBeLessThan(model.radius);
    }
  });

  it('does not overlap buildings', () => {
    const ps = model.projects;
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z);
        expect(d, `${ps[i].project.id} vs ${ps[j].project.id}`).toBeGreaterThan((ps[i].footprint + ps[j].footprint) * 0.71);
      }
  });

  it('keeps each building inside its district wedge', () => {
    for (const p of model.projects) {
      const sec = model.sectors[p.districtIndex];
      expect(p.angle).toBeGreaterThanOrEqual(sec.start);
      expect(p.angle).toBeLessThanOrEqual(sec.end);
    }
  });

  it('is deterministic', () => {
    const again = buildCityModel(data);
    expect(again.projects.map((p) => [p.x, p.z])).toEqual(model.projects.map((p) => [p.x, p.z]));
  });

  it('honours manual placement', () => {
    const copy = structuredClone(data);
    copy.projects[0].place = { angle: 90, radius: 14 };
    const pp = buildCityModel(copy).byId.get(copy.projects[0].id)!;
    expect(pp.x).toBeCloseTo(0, 5);
    expect(pp.z).toBeCloseTo(14, 5);
  });
});

describe('routes', () => {
  it('parses deep links', () => {
    expect(parseRoute('#/project/threat-map')).toEqual({ name: 'project', id: 'threat-map' });
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/list')).toEqual({ name: 'list' });
    expect(parseRoute('')).toEqual({ name: 'map' });
    expect(parseRoute('#/project/../x')).toEqual({ name: 'map' });
  });
});
