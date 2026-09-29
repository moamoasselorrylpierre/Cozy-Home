// API de l'espace administrateur (staff uniquement).
import { all, get, put, remove, update, newId, getContent, setContent, seedContentReference } from './db.js';
import { json, readJSON, readBytes, HttpError, clientIp } from './http.js';
import {
  currentUser, verifyPassword, createSession, destroySession, sessionCookie, clearSessionCookie, sessionToken,
  loginBlocked, recordLoginFailure, clearLoginFailures, publicUser, upsertUser, validatePasswordStrength,
  destroyUserSessions, hashPassword, ensureOwnerAccount, needsRehash,
} from './auth.js';
import { sanitizeModel, sanitizeStyle, sanitizeContent, uniqueSlug, str, REQUEST_STATUS_IDS } from './domain.js';
import { saveImage, MAX_UPLOAD_BYTES } from './media.js';

/**
 * Protection CSRF : les appels d'administration doivent venir du site lui-même
 * (en-tête personnalisé + origine identique). Le cookie est aussi SameSite=Strict.
 */
function checkCsrf(c) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return;
  if (c.req.headers.get('x-requested-with') !== 'CozyHome') throw new HttpError(403, 'Requête refusée.');
  const origin = c.req.headers.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Origine refusée.'); }
    if (host !== c.url.host) throw new HttpError(403, 'Origine refusée.');
  }
}

async function requireUser(c, role) {
  checkCsrf(c);
  const user = await currentUser(c.db, c.req);
  if (!user) throw new HttpError(401, 'Session expirée : merci de vous reconnecter.');
  if (role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'Action réservée à la propriétaire du compte.');
  return user;
}

const guard = (handler, role) => async (c) => handler({ ...c, user: await requireUser(c, role) });
const secure = (c) => c.url.protocol === 'https:';

export function registerAdminApi(router) {
  // --- Session ---
  router.post('/api/admin/login', async (c) => {
    checkCsrf(c);
    const ip = clientIp(c.req);
    if (await loginBlocked(c.db, ip)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    if (!(await ensureOwnerAccount(c.db, c.env))) {
      throw new HttpError(503, 'Aucun compte n’est encore configuré : ajoutez le secret ADMIN_PASSWORD dans les paramètres du Worker sur Cloudflare (voir docs/DEPLOIEMENT-CLOUDFLARE.md).');
    }
    const body = await readJSON(c.req, 4096);
    const username = str(body.username, 40).toLowerCase();
    const password = String(body.password || '').slice(0, 200);
    const user = (await all(c.db, 'users')).find((u) => u.username === username);
    // Vérification systématique pour un temps de réponse homogène.
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      await recordLoginFailure(c.db, ip);
      throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    }
    await clearLoginFailures(c.db, ip);
    const { token, expiresAt } = await createSession(c.db, user.id);
    const passwordHash = needsRehash(user.passwordHash) ? await hashPassword(password) : user.passwordHash;
    await put(c.db, 'users', { ...user, passwordHash, lastLoginAt: new Date().toISOString() });
    return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(token, expiresAt, secure(c)) });
  });

  router.post('/api/admin/logout', async (c) => {
    checkCsrf(c);
    await destroySession(c.db, sessionToken(c.req));
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure(c)) });
  });

  router.get('/api/admin/me', guard((c) => json({ user: publicUser(c.user) })));

  // Indique à l'écran de connexion si un compte a bien été configuré (secret ADMIN_PASSWORD).
  router.get('/api/admin/setup', async (c) => json({ configured: await ensureOwnerAccount(c.db, c.env) }));

  router.post('/api/admin/password', guard(async (c) => {
    const body = await readJSON(c.req, 4096);
    const current = await get(c.db, 'users', c.user.id);
    if (!(await verifyPassword(String(body.current || ''), current.passwordHash))) throw new HttpError(400, 'Mot de passe actuel incorrect.');
    const problem = validatePasswordStrength(body.next);
    if (problem) throw new HttpError(400, problem);
    await put(c.db, 'users', { ...current, passwordHash: await hashPassword(body.next) });
    await destroyUserSessions(c.db, c.user.id, sessionToken(c.req));
    return json({ ok: true });
  }));

  // --- Équipe (réservé à la propriétaire) ---
  router.get('/api/admin/users', guard(async (c) => json({ users: (await all(c.db, 'users')).map(publicUser) }), 'owner'));
  router.post('/api/admin/users', guard(async (c) => {
    const body = await readJSON(c.req, 4096);
    const problem = validatePasswordStrength(body.password);
    if (problem) throw new HttpError(400, problem);
    if ((await all(c.db, 'users')).some((u) => u.username === str(body.username, 40).toLowerCase())) throw new HttpError(409, 'Cet identifiant existe déjà.');
    let saved;
    try {
      saved = await upsertUser(c.db, { username: body.username, password: body.password, name: str(body.name, 60), role: 'staff' });
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    return json({ user: publicUser(saved) }, 201);
  }, 'owner'));
  router.delete('/api/admin/users/:id', guard(async (c) => {
    if (c.params.id === c.user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    const target = await get(c.db, 'users', c.params.id);
    if (!target) throw new HttpError(404, 'Compte introuvable.');
    if (target.role === 'owner') throw new HttpError(400, 'Le compte propriétaire ne peut pas être supprimé.');
    await remove(c.db, 'users', c.params.id);
    await destroyUserSessions(c.db, c.params.id);
    return json({ ok: true });
  }, 'owner'));

  // --- Tableau de bord ---
  router.get('/api/admin/stats', guard(async (c) => {
    const [models, requests] = await Promise.all([all(c.db, 'models'), all(c.db, 'requests')]);
    const by = (list, key) => list.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] || 0) + 1 }), {});
    return json({
      models: by(models, 'status'),
      requests: by(requests, 'status'),
      requestTypes: by(requests.filter((r) => r.status !== 'archive'), 'type'),
      latest: requests.slice(0, 6).map((r) => ({ id: r.id, reference: r.reference, type: r.type, status: r.status, name: r.customer?.name, createdAt: r.createdAt, model: r.details?.modelName })),
    });
  }));

  // --- Téléversement d'images (déjà compressées par le navigateur) → R2 ---
  router.post('/api/admin/uploads', guard(async (c) => {
    const bytes = await readBytes(c.req, MAX_UPLOAD_BYTES);
    const url = await saveImage(c.env, bytes, c.query.get('folder') || 'contenus');
    return json({ url, bytes: bytes.length }, 201);
  }));

  // --- Modèles ---
  router.get('/api/admin/models', guard(async (c) => json({ models: await all(c.db, 'models') })));
  router.get('/api/admin/models/:id', guard(async (c) => {
    const m = await get(c.db, 'models', c.params.id);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    return json({ model: m });
  }));
  router.post('/api/admin/models', guard(async (c) => {
    const body = await readJSON(c.req, 256 * 1024);
    const models = await all(c.db, 'models');
    const m = sanitizeModel(body, {});
    const now = new Date().toISOString();
    const created = { id: newId('mod'), ...m, slug: uniqueSlug(body.slug || m.name, models), createdAt: now, updatedAt: now };
    await put(c.db, 'models', created);
    return json({ model: created }, 201);
  }));
  router.put('/api/admin/models/:id', guard(async (c) => {
    const body = await readJSON(c.req, 256 * 1024);
    const models = await all(c.db, 'models');
    const before = models.find((m) => m.id === c.params.id);
    if (!before) throw new HttpError(404, 'Modèle introuvable.');
    const m = sanitizeModel(body, before);
    if (body.slug !== undefined || body.name !== undefined) m.slug = uniqueSlug(body.slug || before.slug || m.name, models, c.params.id);
    m.updatedAt = new Date().toISOString();
    // Un modèle de démonstration dont on remplace la photo devient un vrai modèle de l'atelier.
    if (m.demo && m.images?.swatch !== before.images?.swatch) delete m.demo;
    if (m.status === 'archived' && before.status !== 'archived') m.archivedAt = m.updatedAt;
    await put(c.db, 'models', m);
    return json({ model: m });
  }));
  router.delete('/api/admin/models/:id', guard(async (c) => {
    if (!(await remove(c.db, 'models', c.params.id))) throw new HttpError(404, 'Modèle introuvable.');
    return json({ ok: true });
  }));

  // --- Salles de la galerie (cartels) ---
  router.get('/api/admin/styles', guard(async (c) => json({ styles: await all(c.db, 'styles') })));
  router.put('/api/admin/styles/:id', guard(async (c) => {
    const body = await readJSON(c.req, 64 * 1024);
    const style = await get(c.db, 'styles', c.params.id);
    if (!style) throw new HttpError(404, 'Style introuvable.');
    const saved = sanitizeStyle(body, style);
    await put(c.db, 'styles', saved);
    return json({ style: saved });
  }));

  // --- Contenus du site ---
  router.get('/api/admin/content', guard(async (c) => json({ content: await getContent(c.db) })));
  router.put('/api/admin/content', guard(async (c) => {
    const body = await readJSON(c.req, 512 * 1024);
    const clean = sanitizeContent(body.content, seedContentReference());
    await setContent(c.db, clean);
    return json({ content: clean });
  }));

  // --- Demandes ---
  router.get('/api/admin/requests', guard(async (c) => json({ requests: await all(c.db, 'requests') })));
  router.patch('/api/admin/requests/:id', guard(async (c) => {
    const body = await readJSON(c.req, 64 * 1024);
    const r = await get(c.db, 'requests', c.params.id);
    if (!r) throw new HttpError(404, 'Demande introuvable.');
    const now = new Date().toISOString();
    if (body.status !== undefined) {
      if (!REQUEST_STATUS_IDS.has(body.status)) throw new HttpError(400, 'Statut inconnu.');
      if (body.status !== r.status) (r.history ||= []).push({ at: now, status: body.status, by: c.user.name || c.user.username });
      r.status = body.status;
    }
    if (body.notes !== undefined) r.notes = str(body.notes, 5000);
    r.updatedAt = now;
    await put(c.db, 'requests', r);
    return json({ request: r });
  }));
  router.delete('/api/admin/requests/:id', guard(async (c) => {
    if (!(await remove(c.db, 'requests', c.params.id))) throw new HttpError(404, 'Demande introuvable.');
    return json({ ok: true });
  }));
}

