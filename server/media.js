// Images téléversées : stockées dans Cloudflare R2, servies depuis /uploads/… avec un cache
// navigateur et CDN d'un an (chaque fichier a un nom unique, il ne change jamais).
import { HttpError } from './http.js';

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // les images sont compressées dans le navigateur avant l'envoi
export const MAX_COMPOSITION_BYTES = 900 * 1024;

const SIGNATURES = [
  { ext: 'webp', type: 'image/webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { ext: 'jpg', type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', type: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
];
export const FOLDERS = ['modeles', 'maquettes', 'contenus', 'compositions'];

function sniff(bytes) {
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new HttpError(400, 'Le fichier ne semble pas être une image valide (WebP, JPEG ou PNG).');
  return sig;
}

/** Enregistre une image (octets) dans R2 et renvoie son URL publique /uploads/… */
export async function saveImage(bucket, bytes, folder, maxBytes = MAX_UPLOAD_BYTES) {
  if (!bucket) throw new HttpError(500, 'Stockage des images non configuré (liaison R2 « MEDIA »).');
  if (!bytes?.length) throw new HttpError(400, 'Image vide.');
  if (bytes.length > maxBytes) throw new HttpError(413, 'Image trop volumineuse.');
  const sig = sniff(bytes);
  const dir = FOLDERS.includes(folder) ? folder : 'contenus';
  const rand = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = `${dir}/${new Date().toISOString().slice(0, 7)}/${rand}.${sig.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: sig.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return `/uploads/${key}`;
}

/** Image transmise en data URL (capture de composition envoyée avec un devis). */
export function bytesFromDataUrl(dataUrl) {
  const m = /^data:image\/(webp|jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Image invalide (formats acceptés : WebP, JPEG, PNG).');
  const bin = atob(m[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Sert une image de R2, en s'appuyant sur le cache de Cloudflare. */
export async function serveUpload(request, env, ctx, key) {
  if (!/^[a-z]+\/\d{4}-\d{2}\/[a-f0-9]{20}\.(webp|jpg|png)$/.test(key)) throw new HttpError(404, 'Fichier introuvable.');
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const obj = await env.MEDIA?.get(key);
  if (!obj) throw new HttpError(404, 'Fichier introuvable.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', obj.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  const response = new Response(obj.body, { headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
