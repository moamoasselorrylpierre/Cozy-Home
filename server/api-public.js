// API publique : catalogue, styles, contenus publics et réception des demandes.
import { all, cachedAll, put, newId, hit } from './db.js';
import { json, readJSON, HttpError, clientIp } from './http.js';
import { publicModel, sanitizeRequest, sanitizeComposition, str } from './domain.js';
import { saveImage, bytesFromDataUrl, MAX_COMPOSITION_BYTES } from './media.js';

export async function publishedModels(db) {
  return (await cachedAll(db, 'models'))
    .filter((m) => m.status === 'published')
    .sort((a, b) => (b.featured - a.featured) || String(a.name).localeCompare(b.name, 'fr'));
}

export function registerPublicApi(router) {
  router.get('/api/models', async (c) => json({ models: (await publishedModels(c.db)).map(publicModel) }));

  router.get('/api/models/:slug', async (c) => {
    const m = (await publishedModels(c.db)).find((x) => x.slug === c.params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    return json({ model: publicModel(m) });
  });

  router.get('/api/styles', async (c) => json({ styles: await cachedAll(c.db, 'styles') }));

  router.get('/api/site', async (c) => {
    const content = await cachedAll(c.db, 'content');
    return json({ site: content.site, home: { tiktokVideos: content.home?.tiktokVideos || [] } });
  });

  router.post('/api/requests', async (c) => {
    const body = await readJSON(c.req, Math.round(MAX_COMPOSITION_BYTES * 1.4) + 64 * 1024);
    // Champ piège anti-robots : invisible pour les humains.
    if (str(body.website)) return json({ ok: true });
    // 8 demandes par heure et par adresse IP.
    if ((await hit(c.db, `form:${clientIp(c.req)}`, 3600000)) > 8) {
      throw new HttpError(429, 'Trop de demandes envoyées. Merci de réessayer un peu plus tard ou de nous écrire sur WhatsApp.');
    }
    const clean = sanitizeRequest(body);
    const composition = sanitizeComposition(body.composition);
    if (composition && body.composition?.snapshot) {
      composition.snapshot = await saveImage(c.env, bytesFromDataUrl(body.composition.snapshot), 'compositions', MAX_COMPOSITION_BYTES);
    }
    if (clean.details.modelSlug) {
      const model = (await all(c.db, 'models')).find((m) => m.slug === clean.details.modelSlug);
      if (model) clean.details.modelName = model.name;
    }
    const now = new Date().toISOString();
    const suffix = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 4).toUpperCase();
    const request = {
      id: newId('dem'),
      reference: `CH-${now.slice(2, 10).replace(/-/g, '')}-${suffix}`,
      ...clean,
      composition,
      status: 'nouveau',
      notes: '',
      createdAt: now,
      updatedAt: now,
      history: [{ at: now, status: 'nouveau', by: 'site' }],
    };
    await put(c.db, 'requests', request);
    return json({ ok: true, reference: request.reference }, 201);
  });
}
