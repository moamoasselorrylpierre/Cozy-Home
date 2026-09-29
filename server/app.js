// Assemblage de l'application Worker : routes, images R2, gestion des erreurs.
// Les fichiers statiques (css, js, img, fonts…) sont servis directement par Cloudflare (Workers Static Assets).
import { Router } from './router.js';
import { json, html, HttpError } from './http.js';
import { ensureDb } from './db.js';
import { registerPublicApi } from './api-public.js';
import { registerAdminApi } from './api-admin.js';
import { registerPages, renderNotFound } from './pages.js';
import { serveUpload } from './media.js';
import { render } from './templates.js';
import { configureAuth } from './auth.js';

const router = new Router();
registerPublicApi(router);
registerAdminApi(router);
registerPages(router);

export async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const c = { req: request, env, ctx, url, query: url.searchParams, db: env.DB, params: {} };
  try {
    if (!env.DB) throw new Error('Base D1 non configurée (liaison « DB »).');
    configureAuth(env);
    if ((request.method === 'GET' || request.method === 'HEAD') && pathname.startsWith('/uploads/')) {
      return await serveUpload(request, env, ctx, pathname.slice('/uploads/'.length));
    }
    // Normalisation : pas de barre finale (sauf racine).
    if (pathname.length > 1 && pathname.endsWith('/') && request.method === 'GET') {
      return Response.redirect(`${url.origin}${pathname.replace(/\/+$/, '')}${url.search}`, 301);
    }
    await ensureDb(env.DB);
    const match = router.match(request.method, pathname);
    if (!match) throw new HttpError(404, 'Page introuvable.');
    if (match.methodMismatch) throw new HttpError(405, 'Méthode non autorisée.');
    c.params = match.params;
    return await match.handler(c);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[cozy-home]', request.method, pathname, err?.stack || err);
    if (pathname.startsWith('/api/')) {
      return json({ error: status === 500 ? 'Une erreur est survenue. Merci de réessayer.' : err.message }, status);
    }
    if (status === 404 && env.DB) return renderNotFound(c);
    return html(render('erreur', { status, message: status === 500 ? 'Une erreur est survenue.' : err.message }), status);
  }
}
