// Fiche modèle : vues du mock-up, thème teinté par le tissu, mise en situation dans des décors du monde.
import { $, $$, pageData } from '../modules/ui.js';
import { tint } from '../modules/dynamic-theme.js';

const { model } = pageData();

// Teinte douce et durable de la page aux couleurs du tissu consulté.
if (model?.colors?.length) setTimeout(() => tint(model.colors, { source: 'modele', hold: true }), 400);

// Vignettes → grande vue.
const stage = $('[data-stage]');
const stageLabel = $('[data-stage-label]');
$$('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    stage.src = btn.dataset.view;
    stage.alt = `Rideau ${model.name} — ${btn.dataset.label}`;
    stageLabel.textContent = btn.dataset.label;
  });
});

// Mise en situation.
const situ = $('[data-situ]');
if (situ && model) {
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const { SceneRenderer, DECORS, fabricTexture, curtainFromModel } = await import('../modules/curtain-scene.js');
    const canvas = $('[data-situ-canvas]');
    const veil = $('[data-situ-veil]');
    const caption = $('[data-situ-caption]');
    const tabs = $('[data-situ-tabs]');
    const shower = model.style === 'douche';
    const order = ['scandinave', 'boheme', 'classique-francais', 'marocain', 'afrique-contemporaine', 'minimaliste', 'salon-moderne', 'chambre-cosy', 'salle-a-manger-classique'];
    const decors = shower
      ? DECORS.filter((d) => d.room === 'salle-de-bain')
      : order.map((id) => DECORS.find((d) => d.id === id)).filter(Boolean);
    const renderer = new SceneRenderer(canvas);
    let texture;
    try {
      texture = await fabricTexture(model.images.swatch);
    } catch (err) {
      veil.textContent = 'Visuel indisponible';
      return;
    }
    const curtain = curtainFromModel(model, texture);
    const show = (decor) => {
      $$('button', tabs).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.decor === decor.id)));
      renderer.fit();
      renderer.render({ decor: decor.id, curtain, pose: { panels: 2, openness: 0.3, tieback: false, mount: 'fenetre', length: 'sol', rail: 'apparent' }, textiles: {}, light: 'jour' });
      caption.textContent = `${decor.style} — ${decor.description}`;
      veil.hidden = true;
    };
    for (const d of decors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'tab');
      b.dataset.decor = d.id;
      b.textContent = d.label;
      b.title = `${d.label} — ${d.style}`;
      b.addEventListener('click', () => show(d));
      tabs.append(b);
    }
    show(decors[0]);
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const current = decors.find((d) => $(`[data-decor="${d.id}"]`, tabs)?.getAttribute('aria-selected') === 'true');
        if (current) show(current);
      }, 250);
    });
  }, { rootMargin: '300px' });
  io.observe(situ);
}
