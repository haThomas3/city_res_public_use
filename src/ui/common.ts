import type { PlacedProject } from '../data/model';
import { getLang, t } from '../i18n';
import { loc } from '../text';
import { h } from './dom';

export function floorsText(n: number): string {
  return n === 1 ? t('floor1') : t('floors', { n });
}

export function teamText(pp: PlacedProject): string {
  const team = pp.project.size?.teamSize;
  return team && team > 1 ? t('team', { n: team }) : team === 1 ? t('solo') : '';
}

/** "Est. Oct 2026" / "נוסד באוקטובר 2026", or '' when the project has no date. */
export function foundedText(pp: PlacedProject): string {
  const f = pp.project.founded;
  if (!f) return '';
  const [y, m] = f.split('-').map(Number);
  const lang = getLang();
  const date = new Intl.DateTimeFormat(lang, { month: lang === 'he' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
  return t('founded', { date });
}

export function districtChip(pp: PlacedProject): HTMLElement {
  return h(
    'span',
    { class: 'district-chip', style: `--d:${pp.district.color}` },
    h('span', { class: 'dot' }),
    loc(pp.district.name, getLang()),
  );
}

export function metricsList(pp: PlacedProject, limit = 99): HTMLElement | null {
  const ms = (pp.project.metrics ?? []).slice(0, limit);
  if (!ms.length) return null;
  return h(
    'ul',
    { class: 'metrics' },
    ms.map((m) => h('li', {}, h('strong', {}, m.value), h('span', {}, loc(m.label, getLang())))),
  );
}

export function stackChips(stack: string[], limit = 99): HTMLElement {
  return h('ul', { class: 'chips' }, stack.slice(0, limit).map((s) => h('li', {}, s)));
}

export function privateBadge(pp: PlacedProject): HTMLElement | null {
  if (pp.project.status === 'construction') return h('span', { class: 'badge badge-private' }, '🚧 ', t('underConstruction'));
  return pp.project.access === 'private' ? h('span', { class: 'badge badge-private' }, '🔒 ', t('privateWork')) : null;
}
