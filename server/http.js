// Utilitaires HTTP : réponses, lecture du corps, fichiers statiques compressés, en-têtes de sécurité.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, isDev } from './config.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg)/;

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    [
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
  );
}

function acceptsGzip(req) {
  return /\bgzip\b/.test(req.headers['accept-encoding'] || '');
}

/** Envoie un corps texte/binaire avec compression gzip si pertinente. */
export function send(req, res, status, body, type = 'text/html; charset=utf-8', extraHeaders = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && acceptsGzip(req)) {
    const gz = zlib.gzipSync(buf, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', gz.length);
    res.end(req.method === 'HEAD' ? undefined : gz);
  } else {
    res.setHeader('Content-Length', buf.length);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }
}

export function sendJSON(req, res, status, data, extraHeaders = {}) {
  send(req, res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extraHeaders });
}

export function redirect(res, location, status = 302) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.end();
}

/** Lit un corps JSON avec limite de taille. */
export function readJSON(req, limit = config.limits.jsonBody) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.includes('application/json')) return reject(new HttpError(415, 'Format attendu : JSON.'));
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Contenu trop volumineux.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

const etagCache = new Map();

/** Sert un fichier statique d'un dossier racine, sans sortie possible de ce dossier. */
export async function serveStatic(req, res, rootDir, relPath, { immutable = false } = {}) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;
  const filePath = path.resolve(rootDir, '.' + path.posix.normalize('/' + decoded));
  if (!filePath.startsWith(rootDir + path.sep)) return false;
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext];
  if (!type) return false;

  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  res.setHeader('ETag', etag);
  res.setHeader(
    'Cache-Control',
    isDev ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, must-revalidate',
  );
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  if (COMPRESSIBLE.test(type)) {
    const key = `${filePath}:${etag}`;
    let body = etagCache.get(key);
    if (!body) {
      body = await fsp.readFile(filePath);
      if (etagCache.size > 300) etagCache.clear();
      etagCache.set(key, body);
    }
    send(req, res, 200, body, type);
    return true;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') { res.end(); return true; }
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return true;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY === 'true' && fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'inconnu';
}

/** URL publique du site (config ou déduite de la requête). */
export function siteUrl(req) {
  if (config.siteUrl) return config.siteUrl;
  const proto = process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] : 'http';
  return `${proto}://${req.headers.host || 'localhost'}`;
}
