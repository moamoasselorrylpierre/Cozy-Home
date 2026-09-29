// API de l'espace administrateur (staff uniquement).
import { read, update, write, newId } from './store.js';
import { sendJSON, readJSON, HttpError, clientIp } from './http.js';
import {
  currentUser, verifyPassword, createSession, destroySession, sessionCookie, clearSessionCookie, sessionToken,
  loginBlocked, recordLoginFailure, clearLoginFailures, publicUser, upsertUser, validatePasswordStrength,
  destroyUserSessions, hashPassword,
} from './auth.js';
import {
  sanitizeModel, sanitizeStyle, sanitizeContent, saveDataUrlImage, uniqueSlug, str, REQUEST_STATUS_IDS,
} from './domain.js';
import { config } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Protection CSRF : les appels d'administration doivent venir du site lui-même
 * (en-tête personnalisé + origine identique). Le cookie est aussi SameSite=Strict.
 */
function checkCsrf(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers['x-requested-with'] !== 'CozyHome') throw new HttpError(403, 'Requête refusée.');
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Origine refusée.'); }
    const expected = req.headers['x-forwarded-host'] && process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-host'] : req.headers.host;
    if (host !== expected) throw new HttpError(403, 'Origine refusée.');
  }
}

function requireUser(req, role) {
  checkCsrf(req);
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Session expirée : merci de vous reconnecter.');
  if (role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'Action réservée à la propriétaire du compte.');
  return user;
}

const guard = (handler, role) => async (req, res, ctx) => handler(req, res, { ...ctx, user: requireUser(req, role) });

function seedContentReference() {
  const file = path.join(config.seedDir, 'content.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function registerAdminApi(router) {
  // --- Session ---
  router.post('/api/admin/login', async (req, res) => {
    checkCsrf(req);
    const ip = clientIp(req);
    if (loginBlocked(ip)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    const body = await readJSON(req, 4096);
    const username = str(body.username, 40).toLowerCase();
    const password = String(body.password || '').slice(0, 200);
    const user = read('users').find((u) => u.username === username);
    // Vérification systématique pour un temps de réponse homogène.
    const ok = await verifyPassword(password, user?.passwordHash || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
    if (!user || !ok) {
      recordLoginFailure(ip);
      throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    }
    clearLoginFailures(ip);
    const { token, expiresAt } = await createSession(user.id);
    await update('users', (users) => users.map((u) => (u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u)));
    sendJSON(req, res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token, expiresAt) });
  });

  router.post('/api/admin/logout', async (req, res) => {
    checkCsrf(req);
    await destroySession(sessionToken(req));
    sendJSON(req, res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  });

  router.get('/api/admin/me', guard((req, res, { user }) => sendJSON(req, res, 200, { user: publicUser(user) })));

  router.post('/api/admin/password', guard(async (req, res, { user }) => {
    const body = await readJSON(req, 4096);
    const current = users().find((u) => u.id === user.id);
    if (!(await verifyPassword(String(body.current || ''), current.passwordHash))) throw new HttpError(400, 'Mot de passe actuel incorrect.');
    const problem = validatePasswordStrength(body.next);
    if (problem) throw new HttpError(400, problem);
    const passwordHash = await hashPassword(body.next);
    await update('users', (list) => list.map((u) => (u.id === user.id ? { ...u, passwordHash } : u)));
    await destroyUserSessions(user.id, sessionToken(req));
    sendJSON(req, res, 200, { ok: true });
  }));

  // --- Équipe (réservé à la propriétaire) ---
  const users = () => read('users');
  router.get('/api/admin/users', guard((req, res) => sendJSON(req, res, 200, { users: users().map(publicUser) }), 'owner'));
  router.post('/api/admin/users', guard(async (req, res) => {
    const body = await readJSON(req, 4096);
    const problem = validatePasswordStrength(body.password);
    if (problem) throw new HttpError(400, problem);
    if (users().some((u) => u.username === str(body.username, 40).toLowerCase())) throw new HttpError(409, 'Cet identifiant existe déjà.');
    let saved;
    try {
      saved = await upsertUser({ username: body.username, password: body.password, name: str(body.name, 60), role: 'staff' });
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    sendJSON(req, res, 201, { user: publicUser(saved) });
  }, 'owner'));
  router.delete('/api/admin/users/:id', guard(async (req, res, { params, user }) => {
    if (params.id === user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    const target = users().find((u) => u.id === params.id);
    if (!target) throw new HttpError(404, 'Compte introuvable.');
    if (target.role === 'owner') throw new HttpError(400, 'Le compte propriétaire ne peut pas être supprimé.');
    await update('users', (list) => list.filter((u) => u.id !== params.id));
    await destroyUserSessions(params.id);
    sendJSON(req, res, 200, { ok: true });
  }, 'owner'));

  // --- Tableau de bord ---
  router.get('/api/admin/stats', guard((req, res) => {
    const models = read('models');
    const requests = read('requests');
    const by = (list, key) => list.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] || 0) + 1 }), {});
    sendJSON(req, res, 200, {
      models: by(models, 'status'),
      requests: by(requests, 'status'),
      requestTypes: by(requests.filter((r) => r.status !== 'archive'), 'type'),
      latest: requests.slice(0, 6).map((r) => ({ id: r.id, reference: r.reference, type: r.type, status: r.status, name: r.customer?.name, createdAt: r.createdAt, model: r.details?.modelName })),
    });
  }));

  // --- Téléversement d'images ---
  router.post('/api/admin/uploads', guard(async (req, res) => {
    const body = await readJSON(req);
    const folder = ['modeles', 'contenus', 'maquettes'].includes(body.folder) ? body.folder : 'contenus';
    const url = await saveDataUrlImage(body.dataUrl, folder);
    sendJSON(req, res, 201, { url });
  }));

  // --- Modèles ---
  router.get('/api/admin/models', guard((req, res) => {
    const list = read('models').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    sendJSON(req, res, 200, { models: list });
  }));
  router.get('/api/admin/models/:id', guard((req, res, { params }) => {
    const m = read('models').find((x) => x.id === params.id);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    sendJSON(req, res, 200, { model: m });
  }));
  router.post('/api/admin/models', guard(async (req, res) => {
    const body = await readJSON(req, 256 * 1024);
    let created;
    await update('models', (models) => {
      const m = sanitizeModel(body, {});
      const now = new Date().toISOString();
      created = { id: newId('mod'), ...m, slug: uniqueSlug(body.slug || m.name, models), createdAt: now, updatedAt: now };
      return [...models, created];
    });
    sendJSON(req, res, 201, { model: created });
  }));
  router.put('/api/admin/models/:id', guard(async (req, res, { params }) => {
    const body = await readJSON(req, 256 * 1024);
    let saved;
    await update('models', (models) => {
      const i = models.findIndex((m) => m.id === params.id);
      if (i < 0) throw new HttpError(404, 'Modèle introuvable.');
      const m = sanitizeModel(body, models[i]);
      if (body.slug !== undefined || body.name !== undefined) m.slug = uniqueSlug(body.slug || models[i].slug || m.name, models, params.id);
      m.updatedAt = new Date().toISOString();
      // Un modèle de démonstration dont on remplace la photo devient un vrai modèle de l'atelier.
      if (m.demo && m.images?.swatch !== models[i].images?.swatch) delete m.demo;
      if (m.status === 'archived' && models[i].status !== 'archived') m.archivedAt = m.updatedAt;
      models[i] = m;
      saved = m;
      return models;
    });
    sendJSON(req, res, 200, { model: saved });
  }));
  router.delete('/api/admin/models/:id', guard(async (req, res, { params }) => {
    let found = false;
    await update('models', (models) => models.filter((m) => (m.id === params.id ? ((found = true), false) : true)));
    if (!found) throw new HttpError(404, 'Modèle introuvable.');
    sendJSON(req, res, 200, { ok: true });
  }));

  // --- Salles de la galerie (cartels) ---
  router.get('/api/admin/styles', guard((req, res) => sendJSON(req, res, 200, { styles: read('styles').sort((a, b) => a.order - b.order) })));
  router.put('/api/admin/styles/:id', guard(async (req, res, { params }) => {
    const body = await readJSON(req, 64 * 1024);
    let saved;
    await update('styles', (styles) => {
      const i = styles.findIndex((s) => s.id === params.id);
      if (i < 0) throw new HttpError(404, 'Style introuvable.');
      styles[i] = saved = sanitizeStyle(body, styles[i]);
      return styles;
    });
    sendJSON(req, res, 200, { style: saved });
  }));

  // --- Contenus du site ---
  router.get('/api/admin/content', guard((req, res) => sendJSON(req, res, 200, { content: read('content') })));
  router.put('/api/admin/content', guard(async (req, res) => {
    const body = await readJSON(req, 512 * 1024);
    const clean = sanitizeContent(body.content, seedContentReference());
    await write('content', clean);
    sendJSON(req, res, 200, { content: clean });
  }));

  // --- Demandes ---
  router.get('/api/admin/requests', guard((req, res) => sendJSON(req, res, 200, { requests: read('requests') })));
  router.patch('/api/admin/requests/:id', guard(async (req, res, { params, user }) => {
    const body = await readJSON(req, 64 * 1024);
    let saved;
    await update('requests', (list) => {
      const r = list.find((x) => x.id === params.id);
      if (!r) throw new HttpError(404, 'Demande introuvable.');
      const now = new Date().toISOString();
      if (body.status !== undefined) {
        if (!REQUEST_STATUS_IDS.has(body.status)) throw new HttpError(400, 'Statut inconnu.');
        if (body.status !== r.status) (r.history ||= []).push({ at: now, status: body.status, by: user.name || user.username });
        r.status = body.status;
      }
      if (body.notes !== undefined) r.notes = str(body.notes, 5000);
      r.updatedAt = now;
      saved = r;
      return list;
    });
    sendJSON(req, res, 200, { request: saved });
  }));
  router.delete('/api/admin/requests/:id', guard(async (req, res, { params }) => {
    let found = false;
    await update('requests', (list) => list.filter((r) => (r.id === params.id ? ((found = true), false) : true)));
    if (!found) throw new HttpError(404, 'Demande introuvable.');
    sendJSON(req, res, 200, { ok: true });
  }));
}
