/** CI check: content/city.json is valid and every local gallery image exists. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCity } from '../src/data/validate';
import type { CityData } from '../src/types';

const raw: unknown = JSON.parse(readFileSync('content/city.json', 'utf8'));
const errors = validateCity(raw);

if (!errors.length) {
  for (const p of (raw as CityData).projects) {
    for (const g of p.gallery ?? []) {
      if (!/^https?:\/\//.test(g.src) && !existsSync(join('public', g.src))) {
        errors.push(`${p.id}: gallery image public/${g.src} does not exist`);
      }
    }
  }
}

if (errors.length) {
  console.error(`content/city.json: ${errors.length} problem(s)\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
const data = raw as CityData;
console.log(`content/city.json OK: ${data.projects.length} projects in ${data.districts.length} districts`);
