/**
 * Renders every project as plain HTML. Used twice:
 *  - at build time, injected into index.html (SEO, no-JavaScript visitors);
 *  - at runtime, for the "List view" overlay in the current language.
 * Pure string building: no DOM, safe in Node.
 */
import type { CityData, Lang, Project } from '../types';
import { loc } from '../text';
import { STRINGS } from '../strings';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TIER_ORDER: Record<Project['tier'], number> = { featured: 0, more: 1, optional: 2 };

function renderProject(p: Project, lang: Lang): string {
  const S = STRINGS[lang];
  const metrics = (p.metrics ?? [])
    .map((m) => `<li><strong>${esc(m.value)}</strong> ${esc(loc(m.label, lang))}</li>`)
    .join('');
  const links: string[] = [];
  if (p.access === 'public' && p.links?.github)
    links.push(`<a href="${esc(p.links.github)}" target="_blank" rel="noopener">${esc(S.sourceCode)}</a>`);
  if (p.links?.demo) links.push(`<a href="${esc(p.links.demo)}" target="_blank" rel="noopener">${esc(S.demo)}</a>`);
  return `<article class="list-item tier-${p.tier}">
  <a class="list-link" href="#/project/${esc(p.id)}"><h3>${esc(loc(p.title, lang))}</h3></a>
  <p class="list-tagline">${esc(loc(p.tagline, lang))}</p>
  ${metrics ? `<ul class="list-metrics">${metrics}</ul>` : ''}
  <p class="list-stack">${esc(p.stack.join(' · '))}</p>
  <p class="list-meta">${p.tier === 'featured' ? `<span class="badge badge-featured">${esc(S.featured)}</span>` : ''}${
    p.status === 'construction' ? `<span class="badge badge-private">🚧 ${esc(S.underConstruction)}</span>` : p.access === 'private' ? `<span class="badge badge-private">${esc(S.privateWork)}</span>` : ''
  }${links.join('')}</p>
</article>`;
}

export function renderListHtml(data: CityData, lang: Lang): string {
  const S = STRINGS[lang];
  const sections = data.districts
    .map((d) => {
      const items = data.projects
        .filter((p) => p.district === d.id)
        .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
      if (!items.length) return '';
      return `<section class="list-district" style="--d:${esc(d.color)}">
  <h2><span class="dot"></span>${esc(loc(d.name, lang))}</h2>
  <div class="list-grid">${items.map((p) => renderProject(p, lang)).join('')}</div>
</section>`;
    })
    .join('');
  return `<div class="list-inner">
  <header class="list-head">
    <div>
      <h1>${esc(data.owner.name)} · ${esc(S.projects)}</h1>
      <p>${esc(loc(data.owner.role, lang))}</p>
    </div>
    <button class="btn list-close" type="button" data-action="close-list">${esc(S.backToMap)}</button>
  </header>
  ${sections}
</div>`;
}
