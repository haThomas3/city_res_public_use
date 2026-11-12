/** Procedural canvas textures: windows, neon signs, the plaza logo. Cached and shared. */
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

/** Which of the 4 windows in a strip are lit at night. */
const LIT = [
  [1, 0, 1, 1],
  [0, 1, 1, 0],
  [1, 1, 0, 1],
  [1, 0, 0, 1],
  [0, 1, 1, 1],
];
export const WINDOW_VARIANTS = LIT.length;

function windowBase(kind: 'map' | 'emissive', variant: number): THREE.CanvasTexture {
  const key = `win-${kind}-${variant}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const { c, ctx } = makeCanvas(256, 64);
  ctx.fillStyle = kind === 'map' ? '#ffffff' : '#000000';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 4; i++) {
    const x = i * 64 + 18;
    const y = 14;
    const w = 28;
    const h = 34;
    if (kind === 'map') {
      ctx.fillStyle = '#cfc6b6';
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      ctx.fillStyle = '#2b3546';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#cfc6b6';
      ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
    } else {
      ctx.fillStyle = LIT[variant][i] ? '#ffd08a' : '#120d06';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  if (kind === 'map') tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Window strip textures repeated `repeat` times across a wall (4 windows per repeat). */
export function windowTextures(variant: number, repeat: number): { map: THREE.Texture; emissive: THREE.Texture } {
  const v = variant % LIT.length;
  const get = (kind: 'map' | 'emissive') => {
    const key = `win-${kind}-${v}-x${repeat}`;
    let tex = cache.get(key);
    if (!tex) {
      tex = windowBase(kind, v).clone();
      tex.repeat.set(repeat, 1);
      tex.needsUpdate = true;
      cache.set(key, tex);
    }
    return tex;
  };
  return { map: get('map'), emissive: get('emissive') };
}

/** Neon sign: glowing text on a dark plate, 4:1 aspect. */
export function signTexture(text: string, color: string): THREE.Texture {
  const key = `sign-${text}-${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = '#121826';
  roundRect(ctx, 6, 6, 500, 116, 22);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.stroke();
  let size = 72;
  ctx.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  while (ctx.measureText(text).width > 440 && size > 28) {
    size -= 4;
    ctx.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68);
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Yellow "caution, building site" board, in Hebrew and English. 4:3 aspect. */
export function cautionTexture(): THREE.Texture {
  const key = 'caution';
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas(512, 384);
  ctx.fillStyle = '#ffcf00';
  ctx.fillRect(0, 0, 512, 384);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 364);
  // Warning triangle with an exclamation mark.
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(256, 36);
  ctx.lineTo(318, 142);
  ctx.lineTo(194, 142);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffcf00';
  ctx.fillRect(250, 66, 12, 44);
  ctx.beginPath();
  ctx.arc(256, 124, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 70px Rubik, Arial, sans-serif';
  ctx.fillText('זהירות! כאן בונים', 256, 198);
  ctx.fillRect(40, 244, 432, 6);
  ctx.font = '800 44px Rubik, Arial, sans-serif';
  ctx.fillText('CAUTION', 256, 290);
  ctx.font = '700 36px Rubik, Arial, sans-serif';
  ctx.fillText('CONSTRUCTION SITE', 256, 336);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Bronze "founded" plaque: "EST." over "OCT 2026", 8:5 aspect. `founded` is "YYYY-MM". */
export function plaqueTexture(founded: string): THREE.Texture {
  const key = `plaque-${founded}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [y, m] = founded.split('-');
  const { c, ctx } = makeCanvas(256, 160);
  const g = ctx.createLinearGradient(0, 0, 256, 160);
  g.addColorStop(0, '#d9b26a');
  g.addColorStop(0.5, '#b8873f');
  g.addColorStop(1, '#8a5f28');
  ctx.fillStyle = g;
  roundRect(ctx, 4, 4, 248, 152, 18);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#5e3d14';
  roundRect(ctx, 14, 14, 228, 132, 12);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3d260a';
  ctx.font = '700 30px Rubik, system-ui, sans-serif';
  ctx.fillText('EST.', 128, 50);
  ctx.font = '700 46px Rubik, system-ui, sans-serif';
  ctx.fillText(`${MONTHS[Number(m) - 1] ?? ''} ${y}`, 128, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** The "TE" logo for the plaza floor. */
export function logoTexture(initials: string): THREE.Texture {
  const key = `logo-${initials}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
  g.addColorStop(0, '#1d2a44');
  g.addColorStop(1, '#0e1424');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(256, 256, 248, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#38e8ff';
  ctx.shadowColor = '#38e8ff';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(256, 256, 226, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '700 230px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9fbff';
  ctx.shadowBlur = 40;
  ctx.fillText(initials, 256, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
