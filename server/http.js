// Utilitaires HTTP (API Fetch des Workers) : réponses, lecture du corps, en-têtes de sécurité.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    'frame-src https://www.tiktok.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
};

export function withSecurity(headers = new Headers()) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return headers;
}

export function html(body, status = 200, extra = {}) {
  const headers = withSecurity(new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...extra }));
  return new Response(body, { status, headers });
}

export function text(body, type = 'text/plain; charset=utf-8', status = 200, extra = {}) {
  return new Response(body, { status, headers: withSecurity(new Headers({ 'Content-Type': type, ...extra })) });
}

export function json(data, status = 200, extra = {}) {
  const headers = withSecurity(new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  for (const [k, v] of Object.entries(extra)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function redirect(location, status = 302) {
  return new Response(null, { status, headers: withSecurity(new Headers({ Location: location })) });
}

/** Lit un corps JSON avec limite de taille. */
export async function readJSON(request, limit = 2 * 1024 * 1024) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Format attendu : JSON.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new HttpError(413, 'Contenu trop volumineux.');
  const buf = await request.arrayBuffer();
  if (buf.byteLength > limit) throw new HttpError(413, 'Contenu trop volumineux.');
  if (!buf.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

/** Corps binaire (téléversement d'image) avec limite de taille. */
export async function readBytes(request, limit) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new HttpError(413, 'Image trop volumineuse.');
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.byteLength) throw new HttpError(400, 'Fichier vide.');
  if (buf.byteLength > limit) throw new HttpError(413, 'Image trop volumineuse.');
  return buf;
}

export const clientIp = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'local';

/** URL publique du site (variable SITE_URL, sinon origine de la requête). */
export function siteUrl(request, env) {
  const configured = String(env?.SITE_URL || '').replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) {
      try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignoré */ }
    }
  }
  return out;
}
