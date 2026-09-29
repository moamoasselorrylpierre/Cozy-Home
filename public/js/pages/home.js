// Accueil : parallaxe douce du visuel, échantillon flottant, aperçu animé de l'outil de composition,
// vidéos TikTok chargées uniquement au clic (performance et confidentialité).
import { $, $$, pageData, prefersReducedMotion } from '../modules/ui.js';
import { tint, release } from '../modules/dynamic-theme.js';

const data = pageData();
const featured = data.featured || [];

// Échantillon flottant : alterne entre les tissus à la une et teinte l'interface avec lui.
const swatch = $('[data-hero-swatch]');
if (swatch && featured.length) {
  let i = 0;
  const show = () => {
    const m = featured[i % featured.length];
    swatch.style.backgroundImage = `url("${m.images.swatch}")`;
    swatch.title = m.name;
    i++;
  };
  show();
  swatch.addEventListener('pointerenter', () => tint(featured[(i - 1) % featured.length].colors));
  swatch.addEventListener('pointerleave', () => release());
  if (!prefersReducedMotion()) setInterval(show, 4200);
}

// Parallaxe légère du visuel d'ouverture.
const heroImg = $('[data-parallax]');
if (heroImg && !prefersReducedMotion()) {
  let raf = 0;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const y = Math.min(window.scrollY, 900);
      heroImg.style.transform = `scale(1.06) translateY(${y * 0.06}px)`;
    });
  }, { passive: true });
}

// Cartes TikTok de repli (tant qu'aucune vidéo n'est choisie dans l'espace pro) : visuels de l'atelier.
const fallbackVisuals = data.fallbackVisuals || [];
$$('[data-tiktok-fallback]').forEach((card) => {
  const src = fallbackVisuals[Number(card.dataset.tiktokFallback) % Math.max(1, fallbackVisuals.length)];
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  card.prepend(img);
});

// Vidéos TikTok : l'intégration officielle n'est chargée qu'au clic.
$$('[data-tiktok-id]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.tiktok.com/embed/v2/${encodeURIComponent(btn.dataset.tiktokId)}`;
    iframe.allow = 'encrypted-media; fullscreen';
    iframe.title = 'Vidéo TikTok de Cozy Home by Fany';
    iframe.loading = 'lazy';
    btn.replaceChildren(iframe);
  }, { once: true });
});

// Aperçu de l'outil de composition : un décor qui change de tissu toutes les quelques secondes.
const teaser = $('[data-composer-teaser]');
if (teaser && featured.length) {
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const { SceneRenderer, fabricTexture, curtainFromModel } = await import('../modules/curtain-scene.js');
    const renderer = new SceneRenderer(teaser).fit(1.5);
    const decors = ['salon-moderne', 'boheme', 'classique-francais', 'afrique-contemporaine', 'scandinave', 'marocain'];
    let k = 0;
    const step = async () => {
      const m = featured[k % featured.length];
      const cushions = featured[(k + 2) % featured.length];
      try {
        const [tex, ctex] = await Promise.all([fabricTexture(m.images.swatch), fabricTexture(cushions.images.swatch)]);
        renderer.render({
          decor: decors[k % decors.length],
          curtain: curtainFromModel(m, tex),
          pose: { panels: 2, openness: 0.25, tieback: k % 2 === 1, mount: 'fenetre', length: 'sol', rail: 'apparent' },
          textiles: { cushions: ctex, throw: tex, tablecloth: ctex, bedspread: ctex },
          light: 'jour',
        });
      } catch (err) { console.warn(err); }
      k++;
    };
    await step();
    if (!prefersReducedMotion()) setInterval(step, 3800);
  }, { rootMargin: '200px' });
  io.observe(teaser);
}
