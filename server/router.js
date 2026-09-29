// Routeur minimal : méthode + motif de chemin avec paramètres (:slug).
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp(
      '^' +
        pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  match(method, pathname) {
    let methodMismatch = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) {
        methodMismatch = true;
        continue;
      }
      const params = {};
      r.keys.forEach((k, i) => {
        try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; }
      });
      return { handler: r.handler, params };
    }
    return methodMismatch ? { methodMismatch: true } : null;
  }
}
