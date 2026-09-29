// Génère les maquettes (captures d'écran desktop & mobile) des pages clés dans docs/maquettes/.
// Démarre le site sur des données neuves, se connecte à l'espace pro et simule l'ajout d'un tissu.
// Usage : npm run maquettes
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/maquettes');

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return await import(spec); } catch { /* suivant */ }
  }
  throw new Error('Playwright est requis : npm i -D playwright');
}

// Site lancé en local dans le moteur Cloudflare (wrangler dev), avec une base D1 et un stockage R2 neufs.
const { startWorker } = await import('../tests/worker.js');
const worker = await startWorker({ vars: { ADMIN_USER: 'fany', ADMIN_PASSWORD: 'Maquettes-2026' } });
const base = worker.base;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await fs.mkdir(OUT, { recursive: true });

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.5)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
}

// Figer les éléments collants/fixes pour une capture continue et afficher tous les blocs animés.
const FREEZE = `.site-header,.filters,.frise,.composer__stage,.product__gallery,.contact-aside,.order-summary{position:relative!important;top:auto!important}
.composer__actions{position:static!important}.wa-float{display:none!important}[data-reveal]{opacity:1!important;transform:none!important}`;

/** Capture pleine page par tranches (le rendu logiciel limite une capture à ~8 000 px), puis assemblage. */
async function fullPageJpeg(page, file, quality) {
  await page.addStyleTag({ content: FREEZE });
  await page.waitForTimeout(300);
  const { width, height } = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight }));
  const chunks = [];
  for (let y = 0; y < height; y += 4000) {
    const h = Math.min(4000, height - y);
    const buf = await page.screenshot({ clip: { x: 0, y, width, height: h }, fullPage: true, type: 'png' });
    chunks.push({ y, h, data: buf.toString('base64') });
  }
  const stitcher = await page.context().newPage();
  const jpeg = await stitcher.evaluate(async ({ chunks, width, height, quality }) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    for (const ch of chunks) {
      const img = new Image();
      img.src = `data:image/png;base64,${ch.data}`;
      await img.decode();
      ctx.drawImage(img, 0, ch.y);
    }
    return c.toDataURL('image/jpeg', quality).split(',')[1];
  }, { chunks, width, height, quality: quality / 100 });
  await stitcher.close();
  await fs.writeFile(file, Buffer.from(jpeg, 'base64'));
}

async function shoot(page, name, { full = true, wait = 1200 } = {}) {
  if (full) await scrollThrough(page);
  await page.waitForTimeout(wait);
  const file = path.join(OUT, `${name}.jpg`);
  if (full) await fullPageJpeg(page, file, 72);
  else await page.screenshot({ path: file, type: 'jpeg', quality: 76 });
  console.log('•', name);
}

const PAGES = [
  ['accueil', '/'],
  ['galerie', '/galerie'],
  ['catalogue', '/catalogue'],
  ['fiche-modele', '/catalogue/velours-sapin'],
  ['composer', '/composer?rideau=lin-sable'],
  ['devis', '/contact?demande=devis'],
  ['commande', '/commande/wax-soleil'],
  ['atelier', '/atelier'],
];

for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  for (const [name, url] of PAGES) {
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await shoot(page, `${device}-${name}`, { full: true, wait: name === 'galerie' || name === 'composer' ? 2500 : 1200 });
  }
  // Galerie : une salle en mode « avant / après lumière ».
  await page.goto(`${base}/galerie#salle-occultant`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.click('#salle-occultant [data-tool="light"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${device}-galerie-salle-avant-apres.jpg`), type: 'jpeg', quality: 76 });
  console.log('•', `${device}-galerie-salle-avant-apres`);
  // Composition envoyée comme base de devis.
  await page.goto(`${base}/composer?rideau=wax-soleil`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('[data-action="match"]');
  await page.waitForTimeout(1200);
  await page.click('[data-action="send"]');
  await page.waitForURL(/contact/);
  await shoot(page, `${device}-devis-avec-composition`, { full: false, wait: 800 });
  await ctx.close();
}

// Espace pro.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[admin]', e.message));
page.on('dialog', (d) => d.accept()); // « modifications non enregistrées » : on quitte l'écran
// Une demande de démonstration pour peupler le tableau de bord.
await fetch(`${base}/api/requests`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'devis', customer: { name: 'Mireille N.', phone: '+237 690000000', city: 'Douala' }, details: { room: 'salon', windowWidth: 180, windowHeight: 260, windows: 2, budget: '150 000 – 300 000 FCFA', message: 'Bonjour, je voudrais des rideaux en velours pour mon salon.', modelSlug: 'velours-sapin' } }),
});
await page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
await shoot(page, 'admin-connexion', { full: false });
await page.fill('input[name="username"]', 'fany');
await page.fill('input[name="password"]', 'Maquettes-2026');
await page.click('button[type="submit"]');
await page.waitForSelector('.kpis');
await shoot(page, 'admin-tableau-de-bord', { full: false });
await page.goto(`${base}/admin#/modeles`);
await page.waitForSelector('.model-admin');
await shoot(page, 'admin-modeles', { full: false });
await page.goto(`${base}/admin#/modeles/nouveau`);
await page.waitForSelector('[data-file]', { state: 'attached' });
await page.setInputFiles('[data-file] >> nth=0', path.join(ROOT, 'public/img/fabrics/ikat-terre-echantillon.webp'));
await page.waitForFunction(() => document.querySelector('[data-gen-status]')?.textContent.includes('✓'), null, { timeout: 60000 });
await page.fill('input[name="name"]', 'Ikat Terre (nouveau)');
await page.click('[data-suggest]');
await shoot(page, 'admin-ajout-modele', { full: true, wait: 800 });
await page.goto(`${base}/admin#/demandes`);
await page.waitForSelector('.admin-table');
await page.click('tr[data-href]');
await page.waitForSelector('.facts');
await shoot(page, 'admin-demande', { full: false });
await page.goto(`${base}/admin#/contenus`);
await page.waitForSelector('.content-section');
await shoot(page, 'admin-contenus', { full: false });

await browser.close();
await worker.stop();
console.log(`\nMaquettes enregistrées dans ${path.relative(ROOT, OUT)}/`);
process.exit(0);
