// Assemblage de l'application : routes, fichiers statiques, gestion des erreurs.
import http from 'node:http';
import { config, isDev } from './config.js';
import { initStore, flush } from './store.js';
import { ensureOwnerAccount } from './auth.js';
import { Router } from './router.js';
import { securityHeaders, serveStatic, sendJSON, send, HttpError } from './http.js';
import { registerPublicApi } from './api-public.js';
import { registerAdminApi } from './api-admin.js';
import { registerPages, renderNotFound } from './pages.js';
import { render } from './templates.js';

export function createApp() {
  const router = new Router();
  registerPublicApi(router);
  registerAdminApi(router);
  registerPages(router);

  return async function handle(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://local');
    const { pathname } = url;
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname.startsWith('/uploads/')) {
          if (await serveStatic(req, res, config.uploadDir, pathname.slice('/uploads'.length), { immutable: true })) return;
          throw new HttpError(404, 'Fichier introuvable.');
        }
        if (/^\/(css|js|img|fonts)\//.test(pathname) || /^\/(favicon\.svg|favicon\.ico|manifest\.webmanifest|apple-touch-icon\.png)$/.test(pathname)) {
          if (await serveStatic(req, res, config.publicDir, pathname)) return;
          throw new HttpError(404, 'Fichier introuvable.');
        }
      }
      // Normalisation : pas de barre finale (sauf racine).
      if (pathname.length > 1 && pathname.endsWith('/') && req.method === 'GET') {
        res.statusCode = 301;
        res.setHeader('Location', pathname.replace(/\/+$/, '') + url.search);
        return res.end();
      }
      const match = router.match(req.method, pathname);
      if (!match) throw new HttpError(404, 'Page introuvable.');
      if (match.methodMismatch) throw new HttpError(405, 'Méthode non autorisée.');
      await match.handler(req, res, { params: match.params, query: url.searchParams });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[cozy-home]', req.method, pathname, err);
      if (res.headersSent) return res.end();
      if (pathname.startsWith('/api/')) {
        return sendJSON(req, res, status, { error: status === 500 ? 'Une erreur est survenue. Merci de réessayer.' : err.message });
      }
      if (status === 404) return renderNotFound(req, res);
      try {
        send(req, res, status, render('erreur', { status, message: status === 500 ? 'Une erreur est survenue.' : err.message }));
      } catch {
        send(req, res, status, 'Erreur', 'text/plain; charset=utf-8');
      }
    }
  };
}

export async function startServer({ port = config.port, host = config.host, quiet = false } = {}) {
  await initStore();
  const created = await ensureOwnerAccount();
  if (created && !quiet) {
    console.log('\n──────────────────────────────────────────────────────────');
    console.log(' Compte administrateur créé (Espace pro → /admin)');
    console.log(`   Identifiant  : ${created.username}`);
    console.log(`   Mot de passe : ${created.password}`);
    if (created.generated) console.log('   (généré automatiquement — notez-le puis changez-le dans « Mon compte »)');
    console.log('──────────────────────────────────────────────────────────\n');
  }
  const server = http.createServer(createApp());
  server.headersTimeout = 20000;
  server.requestTimeout = 60000;
  await new Promise((resolve) => server.listen(port, host, resolve));
  if (!quiet) console.log(`[cozy-home] Site disponible sur http://localhost:${server.address().port} (${isDev ? 'développement' : 'production'})`);

  const stop = async () => {
    server.close();
    await flush();
    process.exit(0);
  };
  if (!quiet) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  return server;
}
