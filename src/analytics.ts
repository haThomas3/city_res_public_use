/**
 * Optional Microsoft Clarity analytics, loaded only after the visitor accepts.
 *
 * - No Clarity ID in content/city.json (site.clarityId) = nothing runs and no bar is shown.
 * - With an ID: a consent bar asks once. The answer is kept in localStorage ("city-consent").
 * - Nothing is requested from clarity.ms before "Accept".
 * - track() sends named events (open_project:<id>, open_about…) so sessions can be filtered.
 */
import { onLangChange, t } from './i18n';
import { h } from './ui/dom';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

const KEY = 'city-consent';
const ID_RE = /^[a-z0-9]{6,20}$/i;

let clarityId = '';
let loaded = false;
const sentOnce = new Set<string>();

function readConsent(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function saveConsent(v: 'yes' | 'no'): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked: the bar will just ask again next visit */
  }
}

/** True when a Clarity ID is configured, so the About modal can offer "Analytics settings". */
export function analyticsConfigured(): boolean {
  return clarityId !== '';
}

export function initAnalytics(id: string | undefined): void {
  if (!id || !ID_RE.test(id)) return;
  clarityId = id;
  const consent = readConsent();
  if (consent === 'yes') load();
  else if (consent !== 'no') showBar();

  onLangChange((lang) => {
    track(`language:${lang}`);
    const bar = document.getElementById('consent-bar');
    if (bar) {
      bar.remove();
      showBar();
    }
  });

  // Outbound links and gallery images, via one delegated listener.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (a.closest('.gallery')) track(`gallery_open:${currentProject()}`);
      else if (href.includes('linkedin.com')) track('linkedin_click');
      else if (href.includes('github.com')) track(`github_click:${currentProject() || 'profile'}`);
    },
    true,
  );
}

function currentProject(): string {
  const m = location.hash.match(/^#\/project\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function load(): void {
  if (loaded || !clarityId) return;
  loaded = true;
  const w = window;
  w.clarity =
    w.clarity ||
    (function (...args: unknown[]) {
      ((w.clarity as ClarityFn).q = (w.clarity as ClarityFn).q || []).push(args);
    } as ClarityFn);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`;
  document.head.appendChild(s);
  w.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
}

/** Send a named event. Does nothing unless the visitor accepted. */
export function track(name: string): void {
  if (loaded) window.clarity?.('event', name);
}

/** Like track(), but at most once per page load (for things like dragging the tilt dial). */
export function trackOnce(name: string): void {
  if (!loaded || sentOnce.has(name)) return;
  sentOnce.add(name);
  track(name);
}

/** Re-open the consent bar so the visitor can change their answer. */
export function openConsent(): void {
  if (!clarityId) return;
  document.getElementById('consent-bar')?.remove();
  showBar();
  (document.querySelector('#consent-bar button') as HTMLButtonElement | null)?.focus();
}

function answer(v: 'yes' | 'no'): void {
  saveConsent(v);
  document.getElementById('consent-bar')?.remove();
  if (v === 'yes') load();
  else if (loaded) {
    // Turned off during this visit: tell Clarity to stop and drop its cookies.
    window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    window.clarity?.('stop');
    loaded = false;
  }
}

function showBar(): void {
  const bar = h(
    'div',
    { id: 'consent-bar', class: 'consent-bar', role: 'region', 'aria-label': t('consentTitle') },
    h('p', {}, t('consentText')),
    h(
      'div',
      { class: 'consent-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => answer('yes') }, t('consentAccept')),
      h('button', { class: 'btn', type: 'button', onclick: () => answer('no') }, t('consentDecline')),
    ),
  );
  document.body.appendChild(bar);
}
