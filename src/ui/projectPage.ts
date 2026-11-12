/**
 * Full project view (sketch 2): the building model with its floors as modules,
 * title, description, goals, stack, links, highlights and gallery.
 */
import type { PlacedProject } from '../data/model';
import type { Theme } from '../engine/daylight';
import { getLang, t } from '../i18n';
import { loc, locList } from '../text';
import { BuildingViewer } from './buildingViewer';
import { assetUrl, h, nodes } from './dom';
import { districtChip, floorsText, foundedText, metricsList, privateBadge, stackChips, teamText } from './common';

export class ProjectPage {
  private pp: PlacedProject | null = null;
  private viewer: BuildingViewer | null = null;
  private floorRows: HTMLElement[] = [];
  private callout: HTMLElement | null = null;
  private descOpen = false;

  constructor(private el: HTMLElement, private handlers: { onBack(): void }) {}

  get isOpen(): boolean {
    return this.pp !== null;
  }

  get currentId(): string | null {
    return this.pp?.project.id ?? null;
  }

  open(pp: PlacedProject, theme: Theme): void {
    if (this.pp?.project.id === pp.project.id) return;
    this.close();
    this.pp = pp;
    this.descOpen = false;
    this.el.hidden = false;
    this.el.replaceChildren(this.renderTop(), h('div', { class: 'project-body' }, this.renderVisual(), h('div', { class: 'project-info' })));
    this.renderInfo();
    const host = this.el.querySelector<HTMLElement>('.viewer')!;
    this.viewer = new BuildingViewer(host, pp, theme, (i) => this.showFloor(i));
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.el.querySelector<HTMLElement>('.back-btn')?.focus({ preventScroll: true });
  }

  close(): void {
    this.viewer?.dispose();
    this.viewer = null;
    this.pp = null;
    this.el.classList.remove('is-open');
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  /** Re-render text after a language change, keeping the 3D viewer. */
  refresh(): void {
    if (!this.pp) return;
    this.el.querySelector('.project-top')?.replaceWith(this.renderTop());
    const visualText = this.el.querySelector('.visual-text');
    visualText?.replaceWith(this.renderVisualText());
    this.renderInfo();
  }

  private renderTop(): HTMLElement {
    const pp = this.pp!;
    const lang = getLang();
    return h(
      'div',
      { class: 'project-top' },
      h('button', { class: 'btn back-btn', type: 'button', onclick: () => this.handlers.onBack() }, h('span', { class: 'flip' }, '←'), ' ', t('backToMap')),
      h(
        'nav',
        { class: 'crumbs', 'aria-label': 'Breadcrumbs' },
        h('a', { href: '#/', onclick: (e: Event) => { e.preventDefault(); this.handlers.onBack(); } }, t('city')),
        h('span', { class: 'sep' }, '›'),
        h('span', {}, loc(pp.district.name, lang)),
        h('span', { class: 'sep' }, '›'),
        h('span', { 'aria-current': 'page' }, loc(pp.project.title, lang)),
      ),
    );
  }

  private renderVisual(): HTMLElement {
    return h(
      'div',
      { class: 'project-visual', style: `--d:${this.pp!.district.color}` },
      h('div', { class: 'viewer' }, h('div', { class: 'floor-callout', hidden: true })),
      this.renderVisualText(),
    );
  }

  private renderVisualText(): HTMLElement {
    const pp = this.pp!;
    const lang = getLang();
    const floors = pp.project.floors ?? [];
    this.floorRows = [];
    const rows: HTMLElement[] = [];
    for (let i = pp.floors - 1; i >= 0; i--) {
      const f = floors[i];
      const row = h(
        'li',
        {
          class: f ? 'floor-row' : 'floor-row is-empty',
          tabindex: f ? 0 : undefined,
          onmouseenter: () => this.viewer?.pinFloor(i),
          onmouseleave: () => this.viewer?.pinFloor(null),
          onfocus: () => this.viewer?.pinFloor(i),
          onblur: () => this.viewer?.pinFloor(null),
        },
        h('span', { class: 'floor-num' }, String(i + 1)),
        h('span', { class: 'floor-name' }, f ? loc(f.name, lang) : '·'),
      );
      this.floorRows[i] = row;
      rows.push(row);
    }
    return h(
      'div',
      { class: 'visual-text' },
      h('p', { class: 'viewer-caption' }, [floorsText(pp.floors), teamText(pp), foundedText(pp)].filter(Boolean).join(' · ')),
      floors.length
        ? h('div', { class: 'anatomy' }, h('h3', {}, t('anatomy')), h('p', { class: 'muted' }, t('anatomyHint')), h('ol', { class: 'floor-list' }, rows))
        : null,
    );
  }

  private showFloor(i: number | null) {
    this.callout ??= this.el.querySelector<HTMLElement>('.floor-callout');
    this.floorRows.forEach((r, j) => r?.classList.toggle('is-active', j === i));
    const f = i === null ? undefined : this.pp?.project.floors?.[i];
    if (!this.callout) return;
    if (i === null) {
      this.callout.hidden = true;
      return;
    }
    const lang = getLang();
    this.callout.replaceChildren(...nodes(
      h('span', { class: 'floor-num' }, t('floorN', { n: i + 1 })),
      h('strong', {}, f ? loc(f.name, lang) : '—'),
      f?.detail ? h('span', {}, loc(f.detail, lang)) : null,
    ));
    this.callout.hidden = false;
  }

  private renderInfo(): void {
    const pp = this.pp!;
    const p = pp.project;
    const lang = getLang();
    const info = this.el.querySelector<HTMLElement>('.project-info')!;
    const goals = locList(p.goals, lang);

    const links: HTMLElement[] = [];
    if (p.access === 'public' && p.links?.github)
      links.push(h('a', { class: 'btn btn-primary', href: p.links.github, target: '_blank', rel: 'noopener' }, t('sourceCode'), ' ↗'));
    if (p.links?.demo) links.push(h('a', { class: 'btn', href: p.links.demo, target: '_blank', rel: 'noopener' }, t('demo'), ' ↗'));
    if (p.links?.video) links.push(h('a', { class: 'btn', href: p.links.video, target: '_blank', rel: 'noopener' }, t('video'), ' ↗'));

    const desc = p.description
      ? h(
          'div',
          { class: 'desc' },
          h(
            'button',
            {
              class: 'desc-toggle',
              type: 'button',
              'aria-expanded': String(this.descOpen),
              onclick: () => {
                this.descOpen = !this.descOpen;
                this.renderInfo();
              },
            },
            h('span', { class: 'info-icon', 'aria-hidden': 'true' }, 'i'),
            t('fullDescription'),
            h('span', { class: 'chev', 'aria-hidden': 'true' }, this.descOpen ? '▴' : '▾'),
          ),
          this.descOpen ? h('p', { class: 'desc-text' }, loc(p.description, lang)) : null,
        )
      : null;

    const gallery = p.gallery?.length
      ? h(
          'div',
          { class: 'gallery' },
          p.gallery.map((g) =>
            h('figure', {}, h('a', { href: assetUrl(g.src), target: '_blank', rel: 'noopener' }, h('img', { src: assetUrl(g.src), alt: loc(g.caption, lang) || loc(p.title, lang), loading: 'lazy' })), g.caption ? h('figcaption', {}, loc(g.caption, lang)) : null),
          ),
        )
      : h('p', { class: 'muted gallery-empty' }, t('galleryEmpty'));

    info.replaceChildren(...nodes(
      h('div', { class: 'card-top' }, districtChip(pp), privateBadge(pp), p.tier === 'featured' ? h('span', { class: 'badge badge-featured' }, '★ ', t('featured')) : null),
      h('h1', { class: 'project-title' }, loc(p.title, lang)),
      h('p', { class: 'project-tagline' }, loc(p.tagline, lang)),
      p.access === 'private' ? h('p', { class: 'note' }, t('privateNote')) : null,
      metricsList(pp) ? h('section', {}, h('h3', {}, t('metrics')), metricsList(pp)) : null,
      desc,
      goals.length ? h('section', {}, h('h3', {}, t('goals')), h('ul', { class: 'goals' }, goals.map((g) => h('li', {}, g)))) : null,
      p.myRole ? h('section', {}, h('h3', {}, t('myRole')), h('p', {}, loc(p.myRole, lang))) : null,
      h('section', {}, h('h3', {}, t('stack')), stackChips(p.stack)),
      links.length ? h('section', {}, h('h3', {}, t('links')), h('div', { class: 'links' }, links)) : null,
      h('section', {}, h('h3', {}, t('gallery')), gallery),
    ));
  }
}
