// Capture d'écran d'une page (outil de développement).
// Usage : node scripts/dev/shot.mjs <url> <sortie.png> [largeur] [hauteur] [--full] [--wait=ms]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [url, out, w = '1440', h = '900', ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage : node scripts/dev/shot.mjs <url> <sortie.png> [largeur] [hauteur] [--full] [--wait=ms]');
  process.exit(1);
}
const full = flags.includes('--full');
const waitFlag = flags.find((f) => f.startsWith('--wait='));
const wait = waitFlag ? Number(waitFlag.split('=')[1]) : 800;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
if (full) {
  // Défilement progressif : déclenche les apparitions et le chargement différé.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.6)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 180));
    }
    window.scrollTo(0, 0);
  });
}
await page.waitForTimeout(wait);
await page.screenshot({ path: out, fullPage: full });
await browser.close();
console.log('OK', out);
