/**
 * Hash routes, so every project has a shareable deep link:
 *   #/                 the map
 *   #/project/<id>     a project page
 *   #/about            about me
 *   #/list             list view
 * In-app navigation pushes history entries marked {app: true}; "back" only
 * calls history.back() for those, so it never leaves the site after a deep link.
 */
export type Route =
  | { name: 'map' }
  | { name: 'project'; id: string }
  | { name: 'about' }
  | { name: 'list' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const m = path.match(/^\/project\/([a-z0-9-]+)\/?$/);
  if (m) return { name: 'project', id: m[1] };
  if (path === '/about') return { name: 'about' };
  if (path === '/list') return { name: 'list' };
  return { name: 'map' };
}

export class Router {
  constructor(private onRoute: (r: Route) => void) {
    window.addEventListener('popstate', () => this.emit());
    window.addEventListener('hashchange', () => this.emit());
    // In-app links like <a href="#/project/x"> go through go().
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      this.go(a.getAttribute('href')!.slice(1));
    });
  }

  start(): void {
    this.emit();
  }

  go(path: string): void {
    if (`#${path}` === location.hash) return;
    history.pushState({ app: true }, '', `#${path}`);
    this.emit();
  }

  replace(path: string): void {
    const url = path === '/' ? location.pathname + location.search : `#${path}`;
    history.replaceState(history.state, '', url);
    this.emit();
  }

  back(): void {
    if ((history.state as { app?: boolean } | null)?.app) history.back();
    else this.replace('/');
  }

  private emit(): void {
    this.onRoute(parseRoute(location.hash));
  }
}
