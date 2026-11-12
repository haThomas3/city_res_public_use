/** The HUD card shown beside a selected building (as in the inspiration image). */
import type { PlacedConnection, PlacedProject } from '../data/model';
import { getLang, t } from '../i18n';
import { loc } from '../text';
import { assetUrl, h, nodes } from './dom';
import { districtChip, floorsText, foundedText, metricsList, privateBadge, stackChips, teamText } from './common';

export class SideCard {
  private current: PlacedProject | null = null;

  constructor(
    private el: HTMLElement,
    private handlers: { onEnter(id: string): void; onClose(): void; onGo(id: string): void; connections: PlacedConnection[] },
  ) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  show(pp: PlacedProject): void {
    this.current = pp;
    this.render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-open'));
  }

  hide(): void {
    this.current = null;
    this.el.classList.remove('is-open');
    this.el.hidden = true;
  }

  refresh(): void {
    if (this.current) this.render();
  }

  private render(): void {
    const pp = this.current!;
    const p = pp.project;
    const lang = getLang();
    const cover = p.gallery?.[0];
    const meta = [floorsText(pp.floors), teamText(pp), foundedText(pp)].filter(Boolean).join(' · ');
    this.el.replaceChildren(...nodes(
      h('span', { class: 'hud-corner hud-tl' }),
      h('span', { class: 'hud-corner hud-br' }),
      h('button', { class: 'icon-btn card-close', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: () => this.handlers.onClose() }, '✕'),
      cover ? h('img', { class: 'card-cover', src: assetUrl(cover.src), alt: loc(cover.caption, lang) || loc(p.title, lang) }) : null,
      h('div', { class: 'card-top' }, districtChip(pp), privateBadge(pp)),
      h('h2', { class: 'card-title' }, loc(p.title, lang)),
      h('p', { class: 'card-meta' }, meta),
      h('p', { class: 'card-tagline' }, loc(p.tagline, lang)),
      metricsList(pp, 2),
      stackChips(p.stack, 6),
      this.linksList(pp),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.handlers.onEnter(p.id) }, t('enter'), ' →'),
      ),
    ));
  }

  /** Linked projects: what they share, and a button that flies to each one. */
  private linksList(pp: PlacedProject): HTMLElement | null {
    const lang = getLang();
    const mine = this.handlers.connections.filter((c) => c.a === pp || c.b === pp).sort((x, y) => y.level - x.level);
    if (!mine.length) return null;
    return h(
      'div',
      { class: 'card-links' },
      h('p', { class: 'card-links-title' }, t('linkedTitle')),
      h(
        'ul',
        {},
        ...mine.map((c) => {
          const other = c.a === pp ? c.b : c.a;
          return h(
            'li',
            {},
            h(
              'button',
              { class: 'link-go', type: 'button', style: `--d:${other.district.color}`, onclick: () => this.handlers.onGo(other.project.id) },
              h('span', { class: `link-level link-level-${c.level}` }, t(`linkLevel${c.level}` as 'linkLevel1')),
              h('strong', {}, loc(other.project.title, lang)),
            ),
            h('span', { class: 'link-why' }, loc(c.why, lang)),
          );
        }),
      ),
    );
  }
}
