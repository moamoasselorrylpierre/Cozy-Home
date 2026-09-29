// API publique : catalogue, styles, contenus publics et réception des demandes.
import { read, update, newId } from './store.js';
import { sendJSON, readJSON, HttpError, clientIp } from './http.js';
import { publicModel, sanitizeRequest, sanitizeComposition, saveDataUrlImage, str } from './domain.js';
import { config } from './config.js';

export const publishedModels = () =>
  read('models')
    .filter((m) => m.status === 'published')
    .sort((a, b) => (b.featured - a.featured) || String(a.name).localeCompare(b.name, 'fr'));

/** Contenus utiles au navigateur (sans données internes). */
export function publicSite() {
  const c = read('content');
  return { site: c.site, home: { tiktokVideos: c.home?.tiktokVideos || [] } };
}

// Limitation simple des envois de formulaires : 8 demandes / heure / IP.
const submissions = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const list = (submissions.get(ip) || []).filter((t) => now - t < 3600000);
  if (list.length >= 8) throw new HttpError(429, 'Trop de demandes envoyées. Merci de réessayer un peu plus tard ou de nous écrire sur WhatsApp.');
  list.push(now);
  submissions.set(ip, list);
  if (submissions.size > 5000) submissions.clear();
}

export function registerPublicApi(router) {
  router.get('/api/models', (req, res) => {
    sendJSON(req, res, 200, { models: publishedModels().map(publicModel) });
  });

  router.get('/api/models/:slug', (req, res, { params }) => {
    const m = publishedModels().find((x) => x.slug === params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    sendJSON(req, res, 200, { model: publicModel(m) });
  });

  router.get('/api/styles', (req, res) => {
    sendJSON(req, res, 200, { styles: read('styles').sort((a, b) => a.order - b.order) });
  });

  router.get('/api/site', (req, res) => sendJSON(req, res, 200, publicSite()));

  router.post('/api/requests', async (req, res) => {
    const body = await readJSON(req, config.limits.compositionBytes * 1.5 + 64 * 1024);
    // Champ piège anti-robots : invisible pour les humains.
    if (str(body.website)) return sendJSON(req, res, 200, { ok: true });
    rateLimit(clientIp(req));
    const clean = sanitizeRequest(body);
    const composition = sanitizeComposition(body.composition);
    if (composition && body.composition?.snapshot) {
      composition.snapshot = await saveDataUrlImage(body.composition.snapshot, 'compositions', config.limits.compositionBytes);
    }
    if (clean.details.modelSlug) {
      const model = read('models').find((m) => m.slug === clean.details.modelSlug);
      if (model) clean.details.modelName = model.name;
    }
    const request = {
      id: newId('dem'),
      reference: `CH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      ...clean,
      composition,
      status: 'nouveau',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), status: 'nouveau', by: 'site' }],
    };
    await update('requests', (list) => [request, ...list]);
    sendJSON(req, res, 201, { ok: true, reference: request.reference });
  });
}
