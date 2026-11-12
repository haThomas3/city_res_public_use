/** Tiny DOM helper: h('div', { class: 'x', onclick: fn }, child, 'text'). Text is never parsed as HTML. */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'style' && typeof v === 'string') {
      el.setAttribute('style', v);
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Drop empty entries, for replaceChildren(...nodes(a, maybeB)). */
export function nodes(...items: (Node | string | null | undefined | false)[]): (Node | string)[] {
  return items.filter((x): x is Node | string => x !== null && x !== undefined && x !== false);
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

/** Resolve a gallery/asset path against the site base (GitHub Pages lives under /City-Res/). */
export function assetUrl(src: string): string {
  return /^https?:\/\//.test(src) ? src : import.meta.env.BASE_URL + src.replace(/^\//, '');
}
