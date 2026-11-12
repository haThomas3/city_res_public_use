/** "About me" modal (opened from the plaza) and the list view overlay. */
import type { CityData } from '../types';
import { getLang, t } from '../i18n';
import { loc } from '../text';
import { renderListHtml } from '../data/staticList';
import { h } from './dom';
import { analyticsConfigured, openConsent } from '../analytics';

export class AboutModal {
  constructor(private el: HTMLElement, private data: CityData, private onClose: () => void) {
    el.addEventListener('click', (e) => {
      if (e.target === el) this.onClose();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.el.querySelector<HTMLElement>('.modal-close')?.focus({ preventScroll: true });
  }

  close(): void {
    this.el.classList.remove('is-open');
    this.el.hidden = true;
  }

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const o = this.data.owner;
    const lang = getLang();
    this.el.replaceChildren(
      h(
        'div',
        { class: 'modal about', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title' },
        h('span', { class: 'hud-corner hud-tl' }),
        h('span', { class: 'hud-corner hud-br' }),
        h('button', { class: 'icon-btn modal-close', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: () => this.onClose() }, '✕'),
        h('div', { class: 'about-badge', 'aria-hidden': 'true' }, o.initials),
        h('h2', { id: 'about-title' }, o.name),
        h('p', { class: 'about-role' }, loc(o.role, lang)),
        h('p', { class: 'about-bio' }, loc(o.bio, lang)),
        h('h3', {}, t('findMe')),
        h(
          'div',
          { class: 'links' },
          o.links.map((l) => h('a', { class: 'btn', href: /^(https?:|mailto:)/.test(l.url) ? l.url : import.meta.env.BASE_URL + l.url, target: '_blank', rel: 'noopener' }, loc(l.label, lang), ' ↗')),
        ),
        analyticsConfigured()
          ? h('button', { class: 'link-btn about-privacy', type: 'button', onclick: () => openConsent() }, t('analyticsSettings'))
          : null,
      ),
    );
  }
}

export class ListView {
  constructor(private el: HTMLElement, private data: CityData, private onClose: () => void) {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="close-list"]')) this.onClose();
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(): void {
    this.render();
    this.el.classList.add('open');
    this.el.scrollTop = 0;
  }

  close(): void {
    this.el.classList.remove('open');
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    // Same markup as the pre-rendered build output; all text is escaped in renderListHtml.
    this.el.innerHTML = renderListHtml(this.data, getLang());
  }
}

export function showHint(el: HTMLElement, touch: boolean): void {
  el.replaceChildren(h('span', { class: 'hint-icon', 'aria-hidden': 'true' }, touch ? '☝' : '🖱'), t(touch ? 'hintTouch' : 'hintDesktop'));
}
