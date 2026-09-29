// Ajout / modification d'un modèle :
// 1. photo de l'échantillon (recadrage) → 2. analyse + mock-ups générés automatiquement
// → 3. fiche (nom, style, matière, prix…) → publication ou brouillon.
import { api, upload } from '../api.js';
import { html, raw, $, $$, toast, setBusy, confirmDialog } from '../ui.js';
import {
  ROOMS, MATERIALS, COLOR_FAMILIES, AVAILABILITY, HEADINGS, FINISHES, HEMS, PRICE_UNITS, STYLE_IDS, labelOf,
} from '../../shared/taxonomy.js';
import { readImageFile, autoCrop, sizeOf, compress } from '../../modules/fabric-analysis.js';
import { prepareFabric, generateMockups, encodeMockups } from '../../modules/mockup-generator.js';
import { nameColor, colorFamily } from '../../modules/color.js';

const STYLE_MATERIAL = { voilage: 'voile', tamisant: 'lin', occultant: 'velours', oeillets: 'coton', 'plis-pinces': 'jacquard', brode: 'coton', boheme: 'macrame', douche: 'polyester' };
const PATTERN_LABEL = { uni: 'Uni', texture: 'Texturé (armure visible)', raye: 'Rayé', motif: 'Imprimé / motif' };

const markDirty = (v = true) => window.dispatchEvent(new CustomEvent('admin:dirty', { detail: v }));

export async function render(el, { params }) {
  const id = params[0];
  const [{ styles }, existing] = await Promise.all([
    fetch('/api/styles').then((r) => r.json()),
    id ? api(`/models/${id}`).then((r) => r.model) : Promise.resolve(null),
  ]);
  const styleById = Object.fromEntries(styles.map((s) => [s.id, s]));

  const st = {
    image: null, // photo source (ImageBitmap / Image)
    file: null,
    crop: null,
    wrapMode: 'auto',
    tile: null,
    analysis: existing?.analysis ? { ...existing.analysis, colors: existing.colors, colorFamilies: existing.colorFamilies } : null,
    render: { heading: 'eyelet', finish: 'matte', opacity: 0.9, hem: 'plain', tileCm: 30, wrap: 'repeat', ...(existing?.render || {}) },
    mockups: null,
    imagesDirty: false,
    colors: existing?.colors || [],
  };

  el.innerHTML = html`
    <header class="admin-head admin-head--row">
      <div>
        <p class="kicker"><a href="#/modeles">Modèles</a></p>
        <h1>${existing ? `Modifier « ${existing.name} »` : 'Ajouter un modèle'}</h1>
        <p class="lead">${existing ? 'Modifiez la fiche, ou remplacez la photo pour régénérer les visuels.' : 'Téléversez simplement la photo d’un échantillon : le site l’analyse et crée automatiquement le rideau monté, plissé et suspendu.'}</p>
      </div>
      ${existing && existing.status === 'published' ? raw(`<a class="btn btn--ghost btn--small" href="/catalogue/${encodeURIComponent(existing.slug)}" target="_blank" rel="noopener">Voir sur le site ↗</a>`) : ''}
    </header>

    <section class="admin-card editor-step">
      <h2><span>1</span>Photo de l’échantillon</h2>
      <div class="dropzone" data-drop>
        <p><strong>Glissez une photo ici</strong> ou</p>
        <div class="btn-row" style="justify-content:center">
          <label class="btn btn--small">Choisir une photo<input type="file" accept="image/*" data-file hidden></label>
          <label class="btn btn--small btn--ghost">Prendre une photo<input type="file" accept="image/*" capture="environment" data-file hidden></label>
        </div>
        <p class="muted small">Conseil : photographiez le tissu à plat, de face, à la lumière du jour, sans ombre. Un simple morceau suffit.</p>
      </div>
      <div class="cropper" data-cropper hidden>
        <div class="cropper__stage"><canvas data-crop-canvas></canvas></div>
        <div class="cropper__side">
          <p class="muted small">Déplacez le cadre sur la zone la plus représentative du tissu (sans bord ni pli).</p>
          <label class="range"><span>Taille du cadrage</span><input type="range" min="15" max="100" value="82" data-crop-size></label>
          <p class="muted small">Aperçu du raccord (tissu répété) :</p>
          <div class="tile-preview" data-tile-preview></div>
          <button class="btn btn--small btn--ghost" type="button" data-change-photo>Changer de photo</button>
        </div>
      </div>
      ${existing ? raw('<p class="muted small" data-existing-note>Photo actuelle conservée. Choisissez une nouvelle photo pour la remplacer.</p>') : ''}
    </section>

    <section class="admin-card editor-step" data-step2 ${existing ? '' : 'hidden'}>
      <h2><span>2</span>Analyse &amp; mock-ups générés</h2>
      <div class="analysis" data-analysis></div>
      <div class="render-controls">
        <label class="field"><span>Style</span><select class="select" data-r="style">${STYLE_IDS.map((s) => raw(`<option value="${s}">${styleById[s]?.short || s}</option>`))}</select></label>
        <label class="field"><span>Type de pose</span><select class="select" data-r="heading">${HEADINGS.map((h) => raw(`<option value="${h.id}">${h.label}</option>`))}</select></label>
        <label class="field"><span>Aspect</span><select class="select" data-r="finish">${FINISHES.map((h) => raw(`<option value="${h.id}">${h.label}</option>`))}</select></label>
        <label class="field"><span>Ourlet</span><select class="select" data-r="hem">${HEMS.map((h) => raw(`<option value="${h.id}">${h.label}</option>`))}</select></label>
        <label class="range"><span>Opacité : <b data-out="opacity"></b></span><input type="range" min="15" max="100" data-r="opacity"></label>
        <label class="range"><span>Taille réelle de la zone cadrée : <b data-out="tileCm"></b></span><input type="range" min="6" max="90" data-r="tileCm"></label>
        <label class="field"><span>Raccord du motif</span><select class="select" data-r="wrapMode">
          <option value="auto">Automatique</option><option value="blend">Raccord fondu (photo)</option><option value="mirror">Miroir</option><option value="repeat">Répétition simple (motif déjà raccord)</option>
        </select></label>
      </div>
      <div class="mockups" data-mockups>${existing ? raw(['ferme', 'miOuvert', 'embrasse'].map((k) => (existing.images?.mockups?.[k] ? `<figure><img src="${existing.images.mockups[k]}" alt=""><figcaption>${{ ferme: 'Fermé', miOuvert: 'Mi-ouvert', embrasse: 'Avec embrasses' }[k]}</figcaption></figure>` : '')).join('')) : ''}</div>
      <div class="btn-row"><button class="btn btn--small btn--ghost" type="button" data-regen>Régénérer les mock-ups</button><span class="muted small" data-gen-status></span></div>
    </section>

    <form class="admin-card editor-step" data-step3 ${existing ? '' : 'hidden'} novalidate>
      <h2><span>3</span>Fiche du modèle</h2>
      <div class="form__row">
        <label class="field"><span>Nom du modèle *</span><input class="input" name="name" required maxlength="80" placeholder="ex. Lin Sable"></label>
        <label class="field"><span>Matière</span><select class="select" name="material">${MATERIALS.map((m) => raw(`<option value="${m.id}">${m.label}</option>`))}</select></label>
      </div>
      <label class="field"><span>Description</span><textarea class="textarea" name="description" maxlength="1200" placeholder="Matière, toucher, lumière, ambiance…"></textarea></label>
      <button class="linkish" type="button" data-suggest>✦ Proposer une description à partir de l’analyse</button>
      <fieldset class="field"><legend>Pièces conseillées</legend><div class="check-chips">${ROOMS.map((r) => raw(`<label><input type="checkbox" name="rooms" value="${r.id}"><span>${r.label}</span></label>`))}</div></fieldset>
      <fieldset class="field"><legend>Familles de couleur (filtres du catalogue)</legend><div class="check-chips">${COLOR_FAMILIES.map((f) => raw(`<label><input type="checkbox" name="colorFamilies" value="${f.id}"><span><i style="background:${f.swatch}"></i>${f.label}</span></label>`))}</div></fieldset>
      <div class="form__row form__row--3">
        <label class="field"><span>Disponibilité</span><select class="select" name="availability">${AVAILABILITY.map((a) => raw(`<option value="${a.id}">${a.label}</option>`))}</select></label>
        <label class="field"><span>Prix (FCFA) — vide = « sur devis »</span><input class="input" type="number" min="0" step="100" name="priceAmount" inputmode="numeric"></label>
        <label class="field"><span>Unité</span><select class="select" name="priceUnit">${PRICE_UNITS.map((p) => raw(`<option value="${p.id}">${p.label}</option>`))}</select></label>
      </div>
      <label class="switch"><input type="checkbox" name="featured"><span>Mettre « à la une » sur la page d’accueil</span></label>
      <p class="form__error" data-error role="alert"></p>
      <div class="btn-row editor-actions">
        <button class="btn" type="submit" data-publish>${existing?.status === 'published' ? 'Enregistrer et garder publié' : 'Publier sur le site'}</button>
        <button class="btn btn--ghost" type="button" data-draft>${existing?.status === 'published' ? 'Repasser en brouillon' : 'Enregistrer en brouillon'}</button>
        <span class="muted small" data-save-status></span>
      </div>
    </form>`;

  const form = $('[data-step3]', el);
  const step2 = $('[data-step2]', el);
  const cropper = $('[data-cropper]', el);
  const drop = $('[data-drop]', el);
  const cropCanvas = $('[data-crop-canvas]', el);
  const genStatus = $('[data-gen-status]', el);
  const mockupsEl = $('[data-mockups]', el);
  const analysisEl = $('[data-analysis]', el);
  const r = (k) => $(`[data-r="${k}"]`, el);

  // --- Pré-remplissage ---
  const model = existing || { style: 'tamisant', material: 'lin', rooms: [], colorFamilies: [], availability: 'disponible', price: null, featured: false };
  if (!existing && styleById[model.style]?.render) {
    const preset = styleById[model.style].render;
    Object.assign(st.render, { heading: preset.heading, finish: preset.finish, opacity: preset.opacity, hem: preset.hem });
  }
  r('style').value = model.style;
  form.name.value = model.name || '';
  form.description.value = model.description || '';
  form.material.value = model.material || STYLE_MATERIAL[model.style];
  form.availability.value = model.availability;
  form.priceAmount.value = model.price?.amount ?? '';
  form.priceUnit.value = model.price?.unit || 'metre';
  form.featured.checked = !!model.featured;
  $$('input[name="rooms"]', form).forEach((c) => { c.checked = model.rooms.includes(c.value); });
  $$('input[name="colorFamilies"]', form).forEach((c) => { c.checked = model.colorFamilies.includes(c.value); });
  const syncRenderInputs = () => {
    r('heading').value = st.render.heading;
    r('finish').value = st.render.finish;
    r('hem').value = st.render.hem;
    r('opacity').value = Math.round(st.render.opacity * 100);
    r('tileCm').value = st.render.tileCm;
    r('wrapMode').value = st.wrapMode;
    $('[data-out="opacity"]', el).textContent = `${Math.round(st.render.opacity * 100)} %${st.render.opacity < 0.5 ? ' (voile)' : st.render.opacity >= 0.98 ? ' (occultant)' : ''}`;
    $('[data-out="tileCm"]', el).textContent = `${st.render.tileCm} cm`;
  };
  syncRenderInputs();

  // --- Analyse (affichage) ---
  function drawAnalysis() {
    if (!st.analysis) { analysisEl.innerHTML = ''; return; }
    const a = st.analysis;
    analysisEl.innerHTML = html`
      <div class="analysis__colors">
        <p class="muted small">Couleurs dominantes détectées — cliquez pour corriger :</p>
        <div class="color-chips">${st.colors.map((c, i) => raw(html`<label class="color-chip" title="${c.name}"><input type="color" value="${c.hex}" data-color="${i}"><span style="background:${c.hex}"></span><small>${c.name} · ${Math.round((c.weight || 0) * 100)} %</small></label>`))}</div>
      </div>
      <dl class="analysis__facts">
        <dt>Motif</dt><dd>${PATTERN_LABEL[a.pattern] || a.pattern}${a.stripes ? ` (${a.stripes === 'vertical' ? 'vertical' : 'horizontal'})` : ''}</dd>
        <dt>Luminosité</dt><dd>${a.brightness > 0.6 ? 'Claire' : a.brightness > 0.3 ? 'Moyenne' : 'Sombre'}</dd>
        ${a.seam != null ? raw(html`<dt>Raccord</dt><dd>${a.recommendedWrap === 'repeat' ? 'Motif raccord' : 'Photo : raccord fondu appliqué'}</dd>`) : ''}
      </dl>`;
    $$('[data-color]', analysisEl).forEach((input) => input.addEventListener('change', () => {
      const i = Number(input.dataset.color);
      st.colors[i] = { ...st.colors[i], hex: input.value.toUpperCase(), name: nameColor(input.value) };
      markDirty();
      drawAnalysis();
    }));
  }
  drawAnalysis();

  // --- Photo & recadrage ---
  let view = { k: 1 };
  function drawCrop() {
    if (!st.image) return;
    const { w, h } = sizeOf(st.image);
    const maxW = cropCanvas.parentElement.clientWidth || 600;
    const k = Math.min(maxW / w, 460 / h);
    view = { k };
    cropCanvas.width = Math.round(w * k);
    cropCanvas.height = Math.round(h * k);
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(st.image, 0, 0, cropCanvas.width, cropCanvas.height);
    const c = st.crop;
    ctx.fillStyle = 'rgba(20,20,18,.55)';
    ctx.beginPath();
    ctx.rect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.rect(c.x * k, c.y * k, c.size * k, c.size * k);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#E2C766';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x * k, c.y * k, c.size * k, c.size * k);
  }

  let dragging = null;
  cropCanvas.addEventListener('pointerdown', (e) => {
    if (!st.crop) return;
    cropCanvas.setPointerCapture(e.pointerId);
    dragging = { x: e.offsetX, y: e.offsetY, cx: st.crop.x, cy: st.crop.y };
  });
  cropCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const { w, h } = sizeOf(st.image);
    const dx = (e.offsetX - dragging.x) / view.k;
    const dy = (e.offsetY - dragging.y) / view.k;
    st.crop.x = Math.round(Math.min(w - st.crop.size, Math.max(0, dragging.cx + dx)));
    st.crop.y = Math.round(Math.min(h - st.crop.size, Math.max(0, dragging.cy + dy)));
    drawCrop();
  });
  const endDrag = () => { if (dragging) { dragging = null; regenerateSoon(); } };
  cropCanvas.addEventListener('pointerup', endDrag);
  cropCanvas.addEventListener('pointercancel', endDrag);
  $('[data-crop-size]', el).addEventListener('input', (e) => {
    if (!st.image) return;
    const { w, h } = sizeOf(st.image);
    const side = Math.min(w, h);
    const size = Math.round(side * Number(e.target.value) / 100);
    const cx = st.crop.x + st.crop.size / 2;
    const cy = st.crop.y + st.crop.size / 2;
    st.crop = { size, x: Math.round(Math.min(w - size, Math.max(0, cx - size / 2))), y: Math.round(Math.min(h - size, Math.max(0, cy - size / 2))) };
    drawCrop();
    regenerateSoon();
  });

  async function useFile(file) {
    try {
      st.image = await readImageFile(file);
    } catch (err) {
      toast(err.message);
      return;
    }
    st.file = file;
    st.crop = autoCrop(st.image);
    $('[data-crop-size]', el).value = Math.round(st.crop.size / Math.min(sizeOf(st.image).w, sizeOf(st.image).h) * 100);
    st.imagesDirty = true;
    drop.hidden = true;
    cropper.hidden = false;
    $('[data-existing-note]', el)?.remove();
    step2.hidden = false;
    form.hidden = false;
    drawCrop();
    markDirty();
    await regenerate({ analyse: true });
    step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $$('[data-file]', el).forEach((input) => input.addEventListener('change', () => input.files[0] && useFile(input.files[0])));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    const file = e.dataTransfer.files?.[0];
    if (file) useFile(file);
  });
  $('[data-change-photo]', el).addEventListener('click', () => { drop.hidden = false; cropper.hidden = true; });

  // --- Génération ---
  let regenTimer;
  const regenerateSoon = (opts) => { clearTimeout(regenTimer); regenTimer = setTimeout(() => regenerate(opts || { analyse: true }), 350); };

  async function ensureTileFromExisting() {
    if (st.tile || !existing?.images?.swatch) return;
    const img = new Image();
    img.src = existing.images.swatch;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    st.tile = c;
  }

  async function regenerate({ analyse = false } = {}) {
    genStatus.textContent = 'Génération des mock-ups…';
    await new Promise((res) => requestAnimationFrame(res));
    try {
      if (st.image) {
        const prep = prepareFabric(st.image, st.crop, st.wrapMode);
        st.tile = prep.tile;
        st.render.wrap = prep.wrap;
        if (analyse) {
          st.analysis = prep.analysis;
          st.colors = prep.analysis.colors.slice(0, 5);
          // Pré-cochage des familles de couleur détectées.
          $$('input[name="colorFamilies"]', form).forEach((c) => { c.checked = prep.analysis.colorFamilies.includes(c.value); });
          drawAnalysis();
        }
        $('[data-tile-preview]', el).style.backgroundImage = `url(${st.tile.toDataURL('image/jpeg', 0.8)})`;
      } else {
        await ensureTileFromExisting();
      }
      if (!st.tile) { genStatus.textContent = ''; return; }
      st.mockups = await generateMockups(st.tile, st.render, { width: 720 });
      st.imagesDirty = true;
      mockupsEl.replaceChildren(...st.mockups.map((m) => {
        const fig = document.createElement('figure');
        m.canvas.setAttribute('role', 'img');
        m.canvas.setAttribute('aria-label', m.label);
        const cap = document.createElement('figcaption');
        cap.textContent = m.label;
        fig.append(m.canvas, cap);
        return fig;
      }));
      genStatus.textContent = 'Mock-ups à jour ✓';
    } catch (err) {
      console.error(err);
      genStatus.textContent = `Génération impossible : ${err.message}`;
    }
  }

  // Paramètres de rendu.
  r('style').addEventListener('change', () => {
    const preset = styleById[r('style').value]?.render;
    if (preset) Object.assign(st.render, { heading: preset.heading, finish: preset.finish, opacity: preset.opacity, hem: preset.hem });
    form.material.value = STYLE_MATERIAL[r('style').value] || form.material.value;
    syncRenderInputs();
    markDirty();
    regenerateSoon({ analyse: false });
  });
  for (const k of ['heading', 'finish', 'hem']) r(k).addEventListener('change', () => { st.render[k] = r(k).value; markDirty(); regenerateSoon({ analyse: false }); });
  r('opacity').addEventListener('input', () => { st.render.opacity = Number(r('opacity').value) / 100; syncRenderInputs(); markDirty(); regenerateSoon({ analyse: false }); });
  r('tileCm').addEventListener('input', () => { st.render.tileCm = Number(r('tileCm').value); syncRenderInputs(); markDirty(); regenerateSoon({ analyse: false }); });
  r('wrapMode').addEventListener('change', () => { st.wrapMode = r('wrapMode').value; markDirty(); regenerateSoon({ analyse: false }); });
  $('[data-regen]', el).addEventListener('click', () => regenerate({ analyse: false }));
  form.addEventListener('input', () => markDirty());

  // Proposition de description.
  $('[data-suggest]', el).addEventListener('click', () => {
    const style = styleById[r('style').value];
    const names = st.colors.slice(0, 3).map((c) => c.name.toLowerCase());
    const a = st.analysis || {};
    const motif = { uni: 'Un tissu uni', texture: 'Un tissu à l’armure délicatement texturée', raye: 'Un tissu rayé', motif: 'Un tissu imprimé' }[a.pattern] || 'Un tissu';
    const mat = labelOf(MATERIALS, form.material.value).toLowerCase();
    const tons = names.length ? ` aux tons ${names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0]}` : '';
    const amb = style?.ambiance ? ` Pour une ambiance ${style.ambiance.toLowerCase()}.` : '';
    form.description.value = `${motif}${tons}, en ${mat}, confectionné sur mesure à l’atelier en rideau ${style?.short?.toLowerCase() || ''}.${amb}`.replace(/\s+\./g, '.');
    markDirty();
  });

  // --- Enregistrement ---
  async function save(status) {
    const errorEl = $('[data-error]', form);
    const statusEl = $('[data-save-status]', el);
    errorEl.textContent = '';
    const name = form.name.value.trim();
    if (!name) { errorEl.textContent = 'Donnez un nom au modèle.'; form.name.focus(); return; }
    if (!existing && !st.image) { errorEl.textContent = 'Ajoutez d’abord la photo de l’échantillon.'; return; }
    const buttons = $$('.editor-actions button', form);
    buttons.forEach((b) => setBusy(b, true, 'Patientez…'));
    try {
      const images = existing?.images ? structuredClone(existing.images) : { original: '', swatch: '', mockups: {} };
      if (st.imagesDirty && st.tile) {
        if (!st.mockups) await regenerate({ analyse: false });
        const hd = await generateMockups(st.tile, st.render, { width: 900 });
        const encoded = encodeMockups(hd);
        const jobs = [];
        if (st.image) jobs.push(['original', compress(st.image, { maxSide: 1600, quality: 0.85 })]);
        jobs.push(['swatch', compress(st.tile, { maxSide: 512, quality: 0.84 })]);
        for (const [k, v] of Object.entries(encoded)) jobs.push([`mockup:${k}`, v]);
        let n = 0;
        for (const [key, dataUrl] of jobs) {
          statusEl.textContent = `Envoi des images ${++n}/${jobs.length}…`;
          const url = await upload(dataUrl, key.startsWith('mockup') ? 'maquettes' : 'modeles');
          if (key.startsWith('mockup:')) images.mockups[key.split(':')[1]] = url;
          else images[key] = url;
        }
      }
      const amount = form.priceAmount.value.trim();
      const body = {
        name,
        description: form.description.value,
        style: r('style').value,
        material: form.material.value,
        rooms: $$('input[name="rooms"]:checked', form).map((c) => c.value),
        colorFamilies: $$('input[name="colorFamilies"]:checked', form).map((c) => c.value),
        colors: st.colors.length ? st.colors : undefined,
        availability: form.availability.value,
        price: amount ? { amount: Number(amount), unit: form.priceUnit.value } : null,
        featured: form.featured.checked,
        status,
        render: st.render,
        images,
        ...(st.analysis ? { analysis: { pattern: st.analysis.pattern, stripes: st.analysis.stripes, brightness: st.analysis.brightness, contrast: st.analysis.contrast } } : {}),
      };
      if (!body.colorFamilies.length && st.colors.length) body.colorFamilies = [...new Set(st.colors.slice(0, 2).map((c) => colorFamily(c.hex)))];
      statusEl.textContent = 'Enregistrement de la fiche…';
      const saved = existing
        ? (await api(`/models/${existing.id}`, { method: 'PUT', body })).model
        : (await api('/models', { method: 'POST', body })).model;
      markDirty(false);
      toast(status === 'published' ? `« ${saved.name} » est en ligne ✓` : `« ${saved.name} » enregistré en brouillon.`);
      location.hash = '#/modeles';
    } catch (err) {
      errorEl.textContent = err.message;
      statusEl.textContent = '';
    } finally {
      buttons.forEach((b) => setBusy(b, false));
    }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); save('published'); });
  $('[data-draft]', el).addEventListener('click', async () => {
    if (existing?.status === 'published' && !(await confirmDialog('Repasser ce modèle en brouillon ? Il ne sera plus visible sur le site.', { confirm: 'Repasser en brouillon' }))) return;
    save('draft');
  });

  // En modification : régénération à partir de la tuile existante si l'on touche aux réglages.
  if (existing) await ensureTileFromExisting().catch(() => {});
  const onResize = () => drawCrop();
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
