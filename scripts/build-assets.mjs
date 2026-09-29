// Génère les visuels de démonstration (tuiles de tissu, échantillons, mock-ups, images du site)
// et le fichier seed/models.json, en pilotant Chromium sans affichage.
// Utilise exactement les mêmes modules que l'espace admin (analyse + présentoir + décors).
// Usage : npm run build:assets
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS_META } from './seed/models-meta.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return await import(spec); } catch { /* suivant */ }
  }
  throw new Error('Playwright est requis : npm i -D playwright');
}

const server = http.createServer(async (req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    const body = await fs.readFile(p);
    res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
await page.goto(`${base}/scripts/seed/build.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });

const writeDataUrl = async (rel, dataUrl) => {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return '/' + rel.replace(/^public\//, '');
};

const now = new Date().toISOString();
const models = [];
for (const [i, meta] of MODELS_META.entries()) {
  process.stdout.write(`• ${meta.name}… `);
  const fabric = await page.evaluate((id) => window.buildFabric(id), meta.slug);
  const mockups = await page.evaluate(([id, render]) => window.buildMockups(id, render), [meta.slug, { ...meta.render, wrap: 'repeat' }]);
  const images = {
    original: await writeDataUrl(`public/img/fabrics/${meta.slug}-echantillon.webp`, fabric.sample),
    swatch: await writeDataUrl(`public/img/fabrics/${meta.slug}.webp`, fabric.tile),
    mockups: {
      ferme: await writeDataUrl(`public/img/mockups/${meta.slug}-ferme.webp`, mockups.ferme.large),
      miOuvert: await writeDataUrl(`public/img/mockups/${meta.slug}-mi-ouvert.webp`, mockups.miOuvert.large),
      embrasse: await writeDataUrl(`public/img/mockups/${meta.slug}-embrasse.webp`, mockups.embrasse.large),
    },
    mockupsSmall: {
      ferme: await writeDataUrl(`public/img/mockups/${meta.slug}-ferme-480.webp`, mockups.ferme.small),
      miOuvert: await writeDataUrl(`public/img/mockups/${meta.slug}-mi-ouvert-480.webp`, mockups.miOuvert.small),
      embrasse: await writeDataUrl(`public/img/mockups/${meta.slug}-embrasse-480.webp`, mockups.embrasse.small),
    },
  };
  const a = fabric.analysis;
  models.push({
    id: `mod_demo${String(i + 1).padStart(2, '0')}`,
    slug: meta.slug,
    name: meta.name,
    style: meta.style,
    description: meta.description,
    material: meta.material,
    rooms: meta.rooms,
    colorFamilies: meta.families || a.colorFamilies,
    colors: a.colors.slice(0, 4).map((c) => ({ hex: c.hex, name: c.name, weight: c.weight })),
    availability: meta.availability,
    price: meta.price ? { ...meta.price, currency: 'XAF' } : null,
    featured: meta.featured,
    status: 'published',
    render: { wrap: 'repeat', ...meta.render },
    images,
    analysis: { pattern: a.pattern, stripes: a.stripes, brightness: a.brightness, contrast: a.contrast },
    demo: true,
    createdAt: now,
    updatedAt: now,
  });
  console.log(a.colors.slice(0, 3).map((c) => c.name).join(', '));
}
await fs.writeFile(path.join(ROOT, 'seed/models.json'), JSON.stringify(models, null, 2) + '\n');

// Visuels du site (remplaçables depuis l'espace admin par de vraies photos).
const R = (slug) => ({ id: slug, render: MODELS_META.find((m) => m.slug === slug).render });
const SITE = [
  ['public/img/site/hero.webp', { decor: 'salon-moderne', curtain: R('velours-sapin'), textiles: { cushions: 'wax-soleil', throw: 'lin-sable' }, pose: { tieback: true }, width: 1000, height: 1300 }],
  ['public/img/site/service-rideaux.webp', { decor: 'classique-francais', curtain: R('damas-or'), textiles: { cushions: 'velours-sapin' }, pose: { tieback: true, mount: 'plafond' }, width: 1200, height: 960 }],
  ['public/img/site/service-relooking.webp', { decor: 'boheme', curtain: R('ikat-terre'), textiles: { cushions: 'wax-soleil', throw: 'lin-sable', tablecloth: 'bogolan-nuit', bedspread: 'lin-sable' }, pose: { openness: 0.25 }, width: 1200, height: 960 }],
  ['public/img/site/atelier-1.webp', { decor: 'boheme', curtain: R('broderie-camelia'), textiles: { cushions: 'ikat-terre', throw: 'macrame-naturel' }, pose: { openness: 0.15 }, width: 750, height: 1000 }],
  ['public/img/site/atelier-2.webp', { decor: 'chambre-cosy', curtain: R('velours-terracotta'), textiles: { cushions: 'lin-sable', bedspread: 'lin-sable', throw: 'velours-sapin' }, pose: { tieback: true }, width: 750, height: 1000 }],
  ['public/img/site/atelier-3.webp', { decor: 'salle-a-manger-classique', curtain: R('toile-de-jouy-brique'), textiles: { tablecloth: 'voile-ivoire', cushions: 'toile-de-jouy-brique' }, pose: { tieback: true }, width: 750, height: 1000 }],
  ['public/img/site/atelier-4.webp', { decor: 'afrique-contemporaine', curtain: R('bogolan-nuit'), textiles: { cushions: 'wax-soleil', throw: 'lin-sable' }, pose: { openness: 0.3 }, width: 750, height: 1000 }],
];
for (const [file, spec] of SITE) {
  process.stdout.write(`• ${file}… `);
  await writeDataUrl(file, await page.evaluate((s) => window.buildScene(s), spec));
  console.log('ok');
}

await browser.close();
server.close();
console.log(`\n${models.length} modèles générés → seed/models.json`);
