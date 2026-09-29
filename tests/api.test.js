// Tests d'intégration : pages publiques, API, sécurité de l'espace admin.
// Lancement : npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cozy-test-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_USER = 'fany';
process.env.ADMIN_PASSWORD = 'Test-motdepasse-2026';
process.env.NODE_ENV = 'test';

const { startServer } = await import('../server/app.js');
let server;
let base;
let cookie = '';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function req(p, { method = 'GET', body, headers = {}, admin = false } = {}) {
  const res = await fetch(base + p, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(admin ? { 'X-Requested-With': 'CozyHome', Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML */ }
  return { status: res.status, text, json, headers: res.headers };
}

before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

test('les pages publiques répondent avec les en-têtes de sécurité', async () => {
  for (const p of ['/', '/galerie', '/catalogue', '/composer', '/contact', '/atelier', '/plan-du-site', '/confidentialite']) {
    const r = await req(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(r.text, /<title>[^<]+Cozy Home by Fany<\/title>/, p);
    assert.match(r.text, /application\/ld\+json/, p);
  }
});

test('404 élégante et protection contre la traversée de répertoires', async () => {
  assert.equal((await req('/page-inconnue')).status, 404);
  assert.equal((await req('/css/..%2f..%2fserver.js')).status, 404);
  assert.equal((await req('/js/../../package.json')).status, 404);
  assert.equal((await req('/uploads/..%2f..%2fusers.json')).status, 404);
});

test('SEO : robots.txt et sitemap.xml', async () => {
  const robots = await req('/robots.txt');
  assert.match(robots.text, /Disallow: \/admin/);
  assert.match(robots.text, /Sitemap: /);
  const sitemap = await req('/sitemap.xml');
  assert.match(sitemap.text, /<urlset/);
  assert.match(sitemap.text, /\/galerie<\/loc>/);
});

test('catalogue public : uniquement les modèles publiés', async () => {
  const r = await req('/api/models');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.models));
  assert.ok(r.json.models.every((m) => !('status' in m) && !('createdAt' in m)));
});

test('demande de devis : validation et enregistrement', async () => {
  const bad = await req('/api/requests', { method: 'POST', body: { type: 'devis', customer: { name: '' } } });
  assert.equal(bad.status, 400);
  const noContact = await req('/api/requests', { method: 'POST', body: { type: 'devis', customer: { name: 'Awa' } } });
  assert.equal(noContact.status, 400);
  const ok = await req('/api/requests', {
    method: 'POST',
    body: {
      type: 'devis',
      customer: { name: 'Awa <script>', phone: '+237 600000000' },
      details: { windowWidth: 160, windowHeight: 250, room: 'salon', message: 'Bonjour' },
      composition: { decor: 'salon-moderne', decorLabel: 'Salon moderne', options: { panels: 2 }, snapshot: PNG_1PX },
    },
  });
  assert.equal(ok.status, 201);
  assert.match(ok.json.reference, /^CH-/);
  // Champ piège : accepté silencieusement mais ignoré.
  const spam = await req('/api/requests', { method: 'POST', body: { type: 'conseil', website: 'http://spam', customer: { name: 'x', phone: '1' }, details: { message: 'x' } } });
  assert.equal(spam.status, 200);
});

test('espace admin : refus sans session, sans en-tête anti-CSRF, ou avec mauvais mot de passe', async () => {
  assert.equal((await req('/api/admin/me', { admin: true })).status, 401);
  const noHeader = await req('/api/admin/login', { method: 'POST', body: { username: 'fany', password: 'x' } });
  assert.equal(noHeader.status, 403);
  const wrong = await req('/api/admin/login', { method: 'POST', admin: true, body: { username: 'fany', password: 'mauvais' } });
  assert.equal(wrong.status, 401);
  const foreign = await req('/api/admin/login', { method: 'POST', admin: true, headers: { Origin: 'https://pirate.example' }, body: { username: 'fany', password: 'x' } });
  assert.equal(foreign.status, 403);
});

test('espace admin : connexion, modèles, archivage, contenus, demandes', async () => {
  const login = await req('/api/admin/login', { method: 'POST', admin: true, body: { username: 'fany', password: 'Test-motdepasse-2026' } });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  cookie = setCookie.split(';')[0];
  assert.equal((await req('/api/admin/me', { admin: true })).json.user.username, 'fany');

  // Téléversement : image valide acceptée, faux fichier refusé.
  const up = await req('/api/admin/uploads', { method: 'POST', admin: true, body: { dataUrl: PNG_1PX, folder: 'modeles' } });
  assert.equal(up.status, 201);
  assert.equal((await fetch(base + up.json.url)).status, 200);
  const fake = await req('/api/admin/uploads', { method: 'POST', admin: true, body: { dataUrl: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') } });
  assert.equal(fake.status, 400);

  // Un modèle publié exige une photo de tissu.
  const noPhoto = await req('/api/admin/models', { method: 'POST', admin: true, body: { name: 'Sans photo', status: 'published' } });
  assert.equal(noPhoto.status, 400);

  const created = await req('/api/admin/models', {
    method: 'POST', admin: true,
    body: {
      name: 'Lin <img src=x onerror=alert(1)>', style: 'tamisant', material: 'lin', status: 'published',
      rooms: ['salon', 'inconnue'], colorFamilies: ['beige'], colors: [{ hex: '#D6C3A1', name: 'Sable', weight: 0.8 }],
      images: { swatch: up.json.url, original: 'javascript:alert(1)', mockups: { ferme: up.json.url } },
      price: { amount: 9500, unit: 'metre' },
    },
  });
  assert.equal(created.status, 201);
  const m = created.json.model;
  assert.deepEqual(m.rooms, ['salon']);
  assert.equal(m.images.original, '');
  assert.equal(m.slug, 'lin-img-src-x-onerror-alert-1');

  // Rendu public échappé (pas d'injection HTML).
  const page = await req(`/catalogue/${m.slug}`);
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('<img src=x onerror'));
  assert.ok(page.text.includes('&lt;img src=x onerror'));

  // Archivage : le modèle disparaît du site public.
  await req(`/api/admin/models/${m.id}`, { method: 'PUT', admin: true, body: { status: 'archived' } });
  assert.equal((await req(`/catalogue/${m.slug}`)).status, 404);
  assert.ok(!(await req('/api/models')).json.models.some((x) => x.id === m.id));

  // Contenus : liens dangereux neutralisés.
  const { content } = (await req('/api/admin/content', { admin: true })).json;
  content.site.social.instagram = 'javascript:alert(1)';
  content.home.services[0].link = 'javascript:alert(1)';
  content.home.heroTitle = 'Titre <b>modifié</b>';
  const saved = await req('/api/admin/content', { method: 'PUT', admin: true, body: { content } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.content.site.social.instagram, '');
  assert.equal(saved.json.content.home.services[0].link, '/');
  const home = await req('/');
  assert.ok(home.text.includes('Titre &lt;b&gt;modifié&lt;/b&gt;'));

  // Demandes : liste, changement de statut, historique.
  const { requests } = (await req('/api/admin/requests', { admin: true })).json;
  assert.equal(requests.length, 1);
  assert.ok(requests[0].composition.snapshot.startsWith('/uploads/compositions/'));
  const patched = await req(`/api/admin/requests/${requests[0].id}`, { method: 'PATCH', admin: true, body: { status: 'repondu', notes: 'Rappel samedi' } });
  assert.equal(patched.json.request.status, 'repondu');
  assert.equal(patched.json.request.history.length, 2);
  assert.equal((await req(`/api/admin/requests/${requests[0].id}`, { method: 'PATCH', admin: true, body: { status: 'nimporte' } })).status, 400);
});

test('équipe : création d’un compte staff, droits limités', async () => {
  const weak = await req('/api/admin/users', { method: 'POST', admin: true, body: { username: 'aide', name: 'Aide', password: 'court' } });
  assert.equal(weak.status, 400);
  const created = await req('/api/admin/users', { method: 'POST', admin: true, body: { username: 'aide', name: 'Aide', password: 'Atelier-2026-ok' } });
  assert.equal(created.status, 201);
  const ownerCookie = cookie;
  const login = await req('/api/admin/login', { method: 'POST', admin: true, body: { username: 'aide', password: 'Atelier-2026-ok' } });
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/admin/users', { admin: true })).status, 403);
  assert.equal((await req('/api/admin/stats', { admin: true })).status, 200);
  await req('/api/admin/logout', { method: 'POST', admin: true });
  assert.equal((await req('/api/admin/me', { admin: true })).status, 401);
  cookie = ownerCookie;
});
