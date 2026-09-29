// « Compose ton intérieur » : choix d'un décor, des rideaux, de la pose et des textiles assortis,
// rendu en direct, sauvegarde locale, téléchargement, et envoi comme base de demande de devis.
import { $, $$, pageData, toast, storage, escapeHtml } from '../modules/ui.js';
import { SceneRenderer, DECORS, fabricTexture, curtainFromModel } from '../modules/curtain-scene.js';
import { tint, release } from '../modules/dynamic-theme.js';
import { hexToRgb, contrast } from '../modules/color.js';

const { models = [], styles = [] } = pageData();
const bySlug = Object.fromEntries(models.map((m) => [m.slug, m]));
const SLOT_LABELS = { cushions: 'Coussins', throw: 'Plaid', tablecloth: 'Nappe', bedspread: 'Dessus-de-lit', towel: 'Serviettes' };
const SAVE_KEY = 'cozyhome.compositions';
const params = new URLSearchParams(location.search);

const stageCanvas = $('[data-stage]');
const veil = $('[data-veil]');
const summary = $('[data-summary]');
const renderer = new SceneRenderer(stageCanvas);

const isShowerDecor = (id) => DECORS.find((d) => d.id === id)?.room === 'salle-de-bain';
const compatible = (m, decorId) => (isShowerDecor(decorId) ? m.style === 'douche' : m.style !== 'douche');

const state = {
  decor: 'salon-moderne',
  curtain: null,
  pose: { tieback: false, mount: 'fenetre', length: 'sol', rail: 'apparent', panels: 2, hardware: 'brass', openness: 0.3 },
  textiles: { cushions: null, throw: null, tablecloth: null, bedspread: null, towel: null },
  styleFilter: '',
};

// Présélection depuis une fiche modèle (?rideau=slug).
const wanted = bySlug[params.get('rideau')];
if (wanted) {
  state.curtain = wanted.slug;
  if (wanted.style === 'douche') state.decor = 'salle-de-bain';
} else {
  state.curtain = models.find((m) => m.featured && m.style !== 'douche')?.slug || models.find((m) => m.style !== 'douche')?.slug || null;
}

// ---------------------------------------------------------------- Rendu
let pending = false;
let renderToken = 0;
async function render() {
  const token = ++renderToken;
  const curtainModel = bySlug[state.curtain];
  const textileEntries = await Promise.all(Object.entries(state.textiles).map(async ([slot, slug]) => [slot, slug && bySlug[slug] ? await fabricTexture(bySlug[slug].images.swatch).catch(() => null) : null]));
  const texture = curtainModel ? await fabricTexture(curtainModel.images.swatch).catch(() => null) : null;
  if (token !== renderToken) return;
  renderer.fit(2);
  renderer.render({
    decor: state.decor,
    curtain: curtainFromModel(curtainModel, texture),
    pose: { ...state.pose, heading: undefined },
    textiles: Object.fromEntries(textileEntries),
    light: 'jour',
  });
  veil.hidden = true;
  updateSummary();
}
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

function describe() {
  const decor = DECORS.find((d) => d.id === state.decor);
  const m = bySlug[state.curtain];
  const pose = [];
  pose.push(state.pose.panels === 1 ? 'un panneau' : 'une paire');
  if (state.pose.tieback) pose.push('embrasses');
  pose.push(state.pose.mount === 'plafond' ? 'fixation plafond' : 'au-dessus de la fenêtre');
  pose.push(state.pose.length === 'sol' ? 'jusqu’au sol' : 'à l’appui');
  pose.push(state.pose.rail === 'cache' ? 'rail discret' : `tringle ${{ brass: 'laiton', black: 'noire', wood: 'bois', white: 'blanche' }[state.pose.hardware]}`);
  const textiles = Object.entries(state.textiles).filter(([slot, slug]) => slug && decor?.textiles?.includes(slot)).map(([slot, slug]) => `${SLOT_LABELS[slot]} « ${bySlug[slug]?.name} »`);
  return { decor, model: m, pose, textiles };
}

function updateSummary() {
  const { decor, model, pose, textiles } = describe();
  summary.innerHTML = [
    decor ? `<strong>${escapeHtml(decor.label)}</strong>` : '',
    model ? `Rideaux <a href="/catalogue/${encodeURIComponent(model.slug)}">« ${escapeHtml(model.name)} »</a> (${escapeHtml(pose.join(', '))})` : 'Sans rideaux',
    ...textiles.map(escapeHtml),
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- Décors
const decorWrap = $('[data-decors]');
const thumbQueue = [];
for (const d of DECORS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'decor-card';
  b.setAttribute('role', 'radio');
  b.dataset.decor = d.id;
  b.innerHTML = `<canvas width="240" height="150" aria-hidden="true"></canvas><span>${escapeHtml(d.label)}</span>`;
  b.title = d.description || d.label;
  b.addEventListener('click', () => selectDecor(d.id));
  decorWrap.append(b);
  thumbQueue.push([b.querySelector('canvas'), d.id]);
}
// Vignettes dessinées au fil de l'eau, sans bloquer l'interface.
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
(function drawThumbs() {
  const next = thumbQueue.shift();
  if (!next) return;
  const [canvas, id] = next;
  try { new SceneRenderer(canvas).render({ decor: id, curtain: null, textiles: {}, light: 'jour' }); } catch (err) { console.warn(err); }
  idle(drawThumbs);
})();

function selectDecor(id) {
  state.decor = id;
  $$('[data-decor]', decorWrap).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.decor === id)));
  const current = bySlug[state.curtain];
  if (!current || !compatible(current, id)) {
    const first = models.find((m) => compatible(m, id));
    state.curtain = first?.slug || null;
  }
  renderCurtainPicker();
  renderTextileSlots();
  schedule();
}

// ---------------------------------------------------------------- Rideaux
const curtainPicker = $('[data-picker="curtain"]');
const curtainPicked = $('[data-picked="curtain"]');
const styleWrap = $('[data-curtain-styles]');

function fabricDot(m, checked, onPick, extraLabel = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fabric-dot';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(checked));
  b.setAttribute('aria-label', `${m.name}${extraLabel}`);
  b.title = m.name;
  b.style.backgroundImage = `url("${m.images.swatch}")`;
  b.addEventListener('click', onPick);
  b.addEventListener('pointerenter', () => tint(m.colors));
  b.addEventListener('pointerleave', () => release());
  return b;
}

function renderCurtainPicker() {
  const shower = isShowerDecor(state.decor);
  const available = models.filter((m) => compatible(m, state.decor));
  const usedStyles = styles.filter((s) => available.some((m) => m.style === s.id));
  styleWrap.hidden = shower || usedStyles.length < 2;
  styleWrap.replaceChildren(...[{ id: '', short: 'Tous' }, ...usedStyles].map((s) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.textContent = s.short;
    c.setAttribute('aria-pressed', String(state.styleFilter === s.id));
    c.addEventListener('click', () => { state.styleFilter = s.id; renderCurtainPicker(); });
    return c;
  }));
  const list = available.filter((m) => shower || !state.styleFilter || m.style === state.styleFilter);
  curtainPicker.replaceChildren(...list.map((m) => fabricDot(m, m.slug === state.curtain, () => selectCurtain(m.slug))));
  const m = bySlug[state.curtain];
  curtainPicked.innerHTML = m ? `« ${escapeHtml(m.name)} » — <a href="/catalogue/${encodeURIComponent(m.slug)}">voir la fiche</a>` : '';
  if (m) tint(m.colors, { source: 'composer', hold: true });
}

function selectCurtain(slug) {
  state.curtain = slug;
  renderCurtainPicker();
  schedule();
}

// ---------------------------------------------------------------- Pose
$$('[data-opt]').forEach((input) => {
  const key = input.dataset.opt;
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    if (input.type === 'checkbox') state.pose[key] = input.checked;
    else if (input.type === 'range') state.pose[key] = Number(input.value) / 100;
    else if (input.checked) state.pose[key] = key === 'panels' ? Number(input.value) : input.value;
    schedule();
  });
});
function syncPoseInputs() {
  $$('[data-opt]').forEach((input) => {
    const v = state.pose[input.dataset.opt];
    if (input.type === 'checkbox') input.checked = !!v;
    else if (input.type === 'range') input.value = Math.round((v ?? 0.3) * 100);
    else input.checked = String(v) === input.value;
  });
}

// ---------------------------------------------------------------- Textiles
const slotsWrap = $('[data-textile-slots]');
function renderTextileSlots() {
  const decor = DECORS.find((d) => d.id === state.decor);
  const slots = decor?.textiles || [];
  $('[data-textiles-step]').hidden = !slots.length;
  const fabrics = models.filter((m) => m.style !== 'douche');
  slotsWrap.replaceChildren(...slots.map((slot) => {
    const wrap = document.createElement('div');
    wrap.className = 'textile-slot';
    const title = document.createElement('p');
    title.textContent = SLOT_LABELS[slot] || slot;
    const row = document.createElement('div');
    row.className = 'fabric-picker';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', title.textContent);
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'fabric-dot fabric-dot--none';
    none.textContent = 'Origine';
    none.setAttribute('role', 'radio');
    none.setAttribute('aria-checked', String(!state.textiles[slot]));
    none.setAttribute('aria-label', `${title.textContent} : tissu d’origine du décor`);
    none.addEventListener('click', () => { state.textiles[slot] = null; renderTextileSlots(); schedule(); });
    row.append(none, ...fabrics.map((m) => fabricDot(m, state.textiles[slot] === m.slug, () => { state.textiles[slot] = m.slug; renderTextileSlots(); schedule(); }, ` pour ${title.textContent.toLowerCase()}`)));
    wrap.append(title, row);
    return wrap;
  }));
}

// Assortiment automatique : accords de couleurs avec le rideau choisi.
function colorDistance(a, b) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
function autoMatch() {
  const curtain = bySlug[state.curtain];
  if (!curtain) return;
  const pool = models.filter((m) => m.style !== 'douche' && m.slug !== curtain.slug);
  const cColors = curtain.colors.map((c) => c.hex);
  const affinity = (m) => Math.min(...m.colors.flatMap((c) => cColors.map((h) => colorDistance(c.hex, h))));
  const patterned = [...pool].filter((m) => m.colors.length >= 3).sort((a, b) => affinity(a) - affinity(b));
  const solids = [...pool].filter((m) => (m.colors[0]?.weight || 0) > 0.55).sort((a, b) => affinity(a) - affinity(b));
  const light = [...pool].sort((a, b) => contrast(b.colors[0]?.hex || '#000000', '#000000') - contrast(a.colors[0]?.hex || '#000000', '#000000'));
  state.textiles = {
    cushions: (patterned[0] || pool[0])?.slug || null,
    throw: (solids.find((m) => m.material === 'velours' || m.material === 'lin') || solids[0] || pool[1])?.slug || null,
    tablecloth: (light.find((m) => m.material !== 'velours') || pool[0])?.slug || null,
    bedspread: (solids[1] || solids[0] || pool[2])?.slug || null,
    towel: (solids[0] || pool[0])?.slug || null,
  };
  renderTextileSlots();
  schedule();
  toast('Textiles assortis à vos rideaux.');
}

// ---------------------------------------------------------------- Actions
function snapshot(maxW = 960, quality = 0.82) {
  const w = Math.min(maxW, stageCanvas.width);
  const h = Math.round(w * stageCanvas.height / stageCanvas.width);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(stageCanvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

function compositionData() {
  const { decor, model } = describe();
  const textiles = {};
  for (const [slot, slug] of Object.entries(state.textiles)) {
    textiles[slot] = slug && decor?.textiles?.includes(slot) ? { slug, name: bySlug[slug]?.name || '' } : null;
  }
  return {
    decor: state.decor,
    decorLabel: decor?.label || '',
    curtain: model?.slug || '',
    curtainName: model?.name || '',
    textiles,
    options: { ...state.pose },
  };
}

function savedList() {
  return storage.get(SAVE_KEY, []);
}
function renderSaved() {
  const list = savedList();
  const box = $('[data-saved]');
  box.hidden = !list.length;
  $('[data-saved-list]').replaceChildren(...list.map((item, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="saved-item"><img alt="" src="${item.thumb}"><span>${escapeHtml(item.label)}</span></button><button type="button" class="saved-del">Supprimer</button>`;
    li.querySelector('.saved-item').addEventListener('click', () => restore(item.state));
    li.querySelector('.saved-del').addEventListener('click', () => {
      const next = savedList();
      next.splice(i, 1);
      storage.set(SAVE_KEY, next);
      renderSaved();
    });
    return li;
  }));
}
function restore(s) {
  Object.assign(state, structuredClone(s));
  syncPoseInputs();
  selectDecor(state.decor);
  toast('Composition rechargée.');
}

document.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'match') autoMatch();
  if (action === 'save') {
    const { decor, model } = describe();
    const list = savedList();
    list.unshift({ label: `${decor?.label || ''}${model ? ` · ${model.name}` : ''}`, thumb: snapshot(360, 0.7), state: structuredClone({ decor: state.decor, curtain: state.curtain, pose: state.pose, textiles: state.textiles }), at: Date.now() });
    if (!storage.set(SAVE_KEY, list.slice(0, 8))) { toast('Enregistrement impossible sur cet appareil (stockage indisponible).'); return; }
    renderSaved();
    toast('Composition enregistrée sur cet appareil.');
  }
  if (action === 'download') {
    const c = document.createElement('canvas');
    c.width = stageCanvas.width;
    c.height = stageCanvas.height + Math.round(stageCanvas.width * 0.05);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#F6F1E9';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(stageCanvas, 0, 0);
    ctx.fillStyle = '#26241F';
    ctx.font = `italic ${Math.round(c.width * 0.02)}px "Cormorant Garamond", Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Cozy Home by Fany — ma composition', c.width * 0.02, stageCanvas.height + (c.height - stageCanvas.height) / 2);
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cozy-home-composition.jpg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/jpeg', 0.9);
  }
  if (action === 'send') {
    const payload = { ...compositionData(), snapshot: snapshot() };
    if (!storage.set('cozyhome.composition', payload, 'sessionStorage')) {
      toast('Impossible de joindre la composition sur ce navigateur ; décrivez-la dans votre message.');
    }
    location.href = '/contact?demande=devis&composition=1';
  }
});

// ---------------------------------------------------------------- Démarrage
syncPoseInputs();
selectDecor(state.decor);
renderSaved();
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(schedule, 200); });
window.addEventListener('pagehide', () => release({ source: 'composer' }));
