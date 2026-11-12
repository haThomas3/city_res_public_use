import './styles/main.css';
import raw from '../content/city.json';
import type { CityData } from './types';
import { validateCity } from './data/validate';
import { initLang, t } from './i18n';
import { ListView } from './ui/overlays';
import { initAnalytics } from './analytics';
import { $ } from './ui/dom';

async function boot() {
  initLang();

  if (import.meta.env.DEV) {
    const errors = validateCity(raw);
    if (errors.length) {
      console.error('content/city.json has problems:\n' + errors.join('\n'));
      $('#loading').textContent = `content/city.json: ${errors[0]}`;
      return;
    }
  }
  const data = raw as CityData;
  initAnalytics(data.site?.clarityId);

  // Neon signs are drawn with the site font, so wait for it (but never for long).
  await Promise.race([
    document.fonts.load('700 64px Rubik').catch(() => undefined),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  if (!hasWebGL()) return fallbackToList(data);
  try {
    const { App } = await import('./app');
    new App(data);
  } catch (err) {
    console.error(err);
    fallbackToList(data);
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function fallbackToList(data: CityData) {
  $('#loading').textContent = t('noWebgl');
  const list = new ListView($('#list-view'), data, () => undefined);
  list.open();
  document.body.classList.add('no-webgl');
}

void boot();
