// Captures d'écran successives d'une page à différentes hauteurs (outil de développement).
// Usage : node scripts/dev/shots-scroll.mjs <url> <préfixe-sortie> [largeur] [hauteur] [n]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, prefix, w = '1440', h = '900', n = '8'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, isMobile: +w < 600, hasTouch: +w < 600 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const count = Math.min(+n, Math.ceil(total / +h));
for (let i = 0; i < count; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * +h);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${prefix}-${i}.png` });
}
console.log('hauteur totale', total, '→', count, 'captures');
await browser.close();
