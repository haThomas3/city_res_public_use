/**
 * Day/night that follows the visitor's real sun.
 * No location permission is requested: longitude comes from the time zone
 * offset and latitude from a rough guess, which is plenty for "is it dark outside".
 * Override for testing with ?time=day | dusk | night.
 */
import * as THREE from 'three';

export type ThemeMode = 'auto' | 'day' | 'night';

export interface Theme {
  night: number;
  sky: THREE.Color;
  water: THREE.Color;
  canal: THREE.Color;
  grass: THREE.Color;
  stone: THREE.Color;
  road: THREE.Color;
  plaza: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  windowGlow: number;
  neon: number;
  bloom: number;
}

interface Key {
  sky: string; water: string; canal: string; grass: string; stone: string; road: string; plaza: string;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  sunColor: string; sunIntensity: number; sunDir: [number, number, number];
  windowGlow: number; neon: number; bloom: number;
}

const DAY: Key = {
  sky: '#a9d8ea', water: '#5aa9cc', canal: '#6cc0e0', grass: '#86b56c', stone: '#bfa98a', road: '#8d9098', plaza: '#ddd5c6',
  hemiSky: '#ffffff', hemiGround: '#8a7f6a', hemiIntensity: 1.25,
  sunColor: '#fff1d6', sunIntensity: 2.4, sunDir: [0.55, 1, 0.35],
  windowGlow: 0, neon: 0.85, bloom: 0.12,
};
const DUSK: Key = {
  sky: '#e9a77e', water: '#3f6d96', canal: '#5a8fb8', grass: '#5f8757', stone: '#8d7462', road: '#5f6170', plaza: '#a99d97',
  hemiSky: '#ffd2b0', hemiGround: '#3b3040', hemiIntensity: 0.85,
  sunColor: '#ffad6b', sunIntensity: 1.4, sunDir: [0.9, 0.35, 0.2],
  windowGlow: 0.9, neon: 1.3, bloom: 0.45,
};
const NIGHT: Key = {
  sky: '#1e2a44', water: '#263f66', canal: '#3577a6', grass: '#4a7058', stone: '#585668', road: '#363d52', plaza: '#6b7590',
  hemiSky: '#8fa6e0', hemiGround: '#252b3c', hemiIntensity: 1.05,
  sunColor: '#a9bcff', sunIntensity: 1.0, sunDir: [-0.4, 1, -0.25],
  windowGlow: 1.7, neon: 1.8, bloom: 0.85,
};

const COLOR_KEYS = ['sky', 'water', 'canal', 'grass', 'stone', 'road', 'plaza', 'hemiSky', 'hemiGround', 'sunColor'] as const;

function mix(a: Key, b: Key, f: number): Theme {
  const out: Partial<Theme> = {};
  for (const k of COLOR_KEYS) out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), f);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  out.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity);
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity);
  out.windowGlow = lerp(a.windowGlow, b.windowGlow);
  out.neon = lerp(a.neon, b.neon);
  out.bloom = lerp(a.bloom, b.bloom);
  out.sunDir = new THREE.Vector3(...a.sunDir).lerp(new THREE.Vector3(...b.sunDir), f).normalize();
  return out as Theme;
}

/** night: 0 = full day, 1 = full night. */
export function themeFor(night: number): Theme {
  const n = Math.min(1, Math.max(0, night));
  const theme = n < 0.5 ? mix(DAY, DUSK, n * 2) : mix(DUSK, NIGHT, (n - 0.5) * 2);
  theme.night = n;
  return theme;
}

/** Solar elevation in degrees (NOAA-style approximation, accurate to well under a degree). */
export function sunElevation(date: Date, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = ((357.529 + 0.98560028 * d) % 360) * rad;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const H = (gmst * 15 + lon) * rad - ra;
  const latR = lat * rad;
  return Math.asin(Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(H)) / rad;
}

const SOUTHERN = /^(Australia|Antarctica|Pacific\/(Auckland|Fiji|Chatham)|America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek|Lusaka))/;

export function guessLocation(date = new Date()): { lat: number; lon: number } {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    tz = '';
  }
  if (tz === 'Asia/Jerusalem' || tz === 'Asia/Tel_Aviv') return { lat: 31.8, lon: 35.2 };
  return { lat: SOUTHERN.test(tz) ? -33 : 40, lon: (-date.getTimezoneOffset() / 60) * 15 };
}

/** 0 = day … 1 = night, with dusk spanning sun elevations from +6° to -6°. */
export function nightFactor(mode: ThemeMode, date = new Date()): number {
  const forced = new URLSearchParams(location.search).get('time');
  if (forced === 'day') return 0;
  if (forced === 'dusk') return 0.5;
  if (forced === 'night') return 1;
  if (mode === 'day') return 0;
  if (mode === 'night') return 1;
  const { lat, lon } = guessLocation(date);
  const el = sunElevation(date, lat, lon);
  const t = Math.min(1, Math.max(0, (6 - el) / 12));
  return t * t * (3 - 2 * t);
}
