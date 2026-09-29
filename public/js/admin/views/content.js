// Contenus du site : textes, images et liens modifiables sans toucher au code.
import { api, upload } from '../api.js';
import { html, raw, $, $$, toast, setBusy } from '../ui.js';
import { compress, readImageFile } from '../../modules/fabric-analysis.js';

const T = 'textarea';
const LIEU = 'Astuce : {lieu} est remplacé automatiquement par « à [votre ville] » (ou « au Cameroun »).';
const SECTIONS = [
  { title: 'Informations générales & réseaux sociaux', path: 'site', fields: [
    ['tagline', 'Signature de la marque'],
    ['city', 'Ville', { hint: 'ex. Douala ou Yaoundé — utilisée pour le référencement (« rideaux sur mesure à … ») et en pied de page.' }],
    ['country', 'Pays'],
    ['whatsapp', 'Numéro WhatsApp', { hint: 'Format international, ex. +237 673412103' }],
    ['email', 'E-mail (facultatif)'],
    ['address', 'Adresse de l’atelier (facultatif)'],
    ['hours', 'Horaires / disponibilités'],
    ['social.tiktok', 'Lien TikTok', { type: 'url' }],
    ['social.instagram', 'Lien Instagram', { type: 'url', hint: 'Laissez vide tant que le compte n’existe pas : l’icône affiche « bientôt ».' }],
    ['social.facebook', 'Lien Facebook', { type: 'url', hint: 'Idem : vide = « bientôt ».' }],
    ['social.messenger', 'Lien Messenger (m.me/…)', { type: 'url' }],
  ] },
  { title: 'Page d’accueil', path: 'home', fields: [
    ['heroKicker', 'Petit titre au-dessus'],
    ['heroTitle', 'Grand titre', { type: T, rows: 2 }],
    ['heroText', 'Texte d’accroche', { type: T }],
    ['heroImage', 'Visuel d’ouverture', { type: 'image' }],
    ['heroCtaPrimary', 'Bouton principal'],
    ['heroCtaSecondary', 'Bouton secondaire'],
    ['featuredKicker', 'Motifs à la une — petit titre'],
    ['featuredTitle', 'Motifs à la une — titre'],
    ['featuredText', 'Motifs à la une — texte', { type: T, hint: 'Les modèles affichés sont ceux cochés « à la une » dans Modèles.' }],
    ['servicesKicker', 'Services — petit titre'],
    ['servicesTitle', 'Services — titre'],
    ['services', 'Services', { type: 'list', fixed: true, item: [['title', 'Titre'], ['text', 'Texte', { type: T }], ['image', 'Image', { type: 'image' }], ['cta', 'Texte du lien'], ['link', 'Adresse du lien (ex. /catalogue)']] }],
    ['reassurance', 'Bandeau réassurance', { type: 'list', fixed: true, item: [['title', 'Titre'], ['text', 'Texte']] }],
    ['composerKicker', 'Outil de composition — petit titre'],
    ['composerTitle', 'Outil de composition — titre'],
    ['composerText', 'Outil de composition — texte', { type: T }],
    ['tiktokKicker', 'TikTok — petit titre'],
    ['tiktokTitle', 'TikTok — titre'],
    ['tiktokText', 'TikTok — texte', { type: T }],
    ['tiktokVideos', 'Vidéos TikTok à la une', { type: 'list', max: 6, item: [['url', 'Lien de la vidéo', { type: 'url', hint: 'Copiez le lien de partage : https://www.tiktok.com/@cozyhomebyfany/video/…' }], ['caption', 'Légende']] }],
  ] },
  { title: 'La Galerie (entrée et sortie)', path: 'galerie', fields: [
    ['introKicker', 'Petit titre'], ['introTitle', 'Titre'], ['introText', 'Texte d’introduction', { type: T }],
    ['outroTitle', 'Titre de fin de visite'], ['outroText', 'Texte de fin', { type: T }],
  ], note: 'Les textes de chaque salle (cartels) se modifient dans « Salles de la galerie ».' },
  { title: 'Catalogue', path: 'catalogue', fields: [['kicker', 'Petit titre'], ['title', 'Titre'], ['intro', 'Introduction', { type: T }]] },
  { title: 'Compose ton intérieur', path: 'composer', fields: [['kicker', 'Petit titre'], ['title', 'Titre'], ['intro', 'Introduction', { type: T }]] },
  { title: 'Contact & formulaires', path: 'contact', fields: [
    ['kicker', 'Petit titre'], ['title', 'Titre'], ['intro', 'Introduction', { type: T }],
    ['quoteIntro', 'Texte du formulaire de devis', { type: T }], ['adviceIntro', 'Texte du formulaire de conseil', { type: T }],
    ['orderIntro', 'Texte de la commande', { type: T }], ['thanks', 'Message de remerciement', { type: T }],
  ] },
  { title: 'L’Atelier (à propos de Fany)', path: 'atelier', fields: [
    ['kicker', 'Petit titre'], ['title', 'Titre'], ['intro', 'Introduction', { type: T }],
    ['portrait', 'Portrait de Fany', { type: 'image', hint: 'Sans photo, un monogramme élégant est affiché.' }], ['portraitCaption', 'Légende du portrait'],
    ['storyTitle', 'Titre de l’histoire'], ['story', 'Histoire', { type: T, rows: 10, hint: 'Laissez une ligne vide entre deux paragraphes.' }],
    ['quote', 'Citation'], ['valuesTitle', 'Titre du savoir-faire'],
    ['values', 'Savoir-faire', { type: 'list', fixed: true, item: [['title', 'Titre'], ['text', 'Texte', { type: T }]] }],
    ['galleryTitle', 'Titre de la galerie de photos'],
    ['gallery', 'Photos (réalisations, atelier)', { type: 'list', max: 8, item: [['image', 'Photo', { type: 'image' }], ['caption', 'Légende']] }],
    ['relookingTitle', 'Relooking — titre'], ['relookingText', 'Relooking — texte', { type: T }],
    ['ctaTitle', 'Appel final — titre'], ['ctaText', 'Appel final — texte'],
  ] },
  { title: 'Confidentialité', path: 'legal', fields: [['privacyTitle', 'Titre'], ['privacy', 'Texte', { type: T, rows: 10 }]] },
  { title: 'Référencement (Google)', path: 'seo', note: LIEU, fields: ['home', 'galerie', 'catalogue', 'composer', 'contact', 'atelier'].flatMap((p) => [
    [`${p}.title`, `${{ home: 'Accueil', galerie: 'Galerie', catalogue: 'Catalogue', composer: 'Composer', contact: 'Contact', atelier: 'Atelier' }[p]} — titre (≈ 60 caractères)`],
    [`${p}.description`, 'Description (≈ 155 caractères)', { type: T, rows: 2 }],
  ]) },
];

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const set = (obj, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
};

export async function render(el) {
  let { content } = await api('/content');
  const dirty = (v = true) => window.dispatchEvent(new CustomEvent('admin:dirty', { detail: v }));

  function fieldHtml(label, value, opts = {}, name) {
    const hint = opts.hint ? raw(html`<small>${opts.hint}</small>`) : '';
    if (opts.type === 'image') {
      return html`<div class="field image-field" data-image="${name}"><span>${label}</span>
        <div class="image-field__row"><div class="image-field__preview">${value ? raw(html`<img src="${value}" alt="">`) : raw('<em>Aucune image</em>')}</div>
        <div><label class="btn btn--small btn--ghost">Remplacer<input type="file" accept="image/*" hidden></label>${value ? raw('<button type="button" class="linkish" data-clear>Retirer</button>') : ''}</div></div>${hint}<input type="hidden" name="${name}" value="${value || ''}"></div>`;
    }
    if (opts.type === T) return html`<label class="field"><span>${label}</span><textarea class="textarea" name="${name}" rows="${opts.rows || 4}">${value || ''}</textarea>${hint}</label>`;
    return html`<label class="field"><span>${label}</span><input class="input" name="${name}" type="${opts.type === 'url' ? 'url' : 'text'}" value="${value || ''}">${hint}</label>`;
  }

  function listHtml(label, items, opts, name) {
    return html`<fieldset class="list-field" data-list="${name}" data-max="${opts.max || 0}" data-fixed="${opts.fixed ? '1' : ''}"><legend>${label}</legend>
      ${(items || []).map((item, i) => raw(html`<div class="list-field__item"><p class="list-field__num">${label} — n° ${i + 1}${opts.fixed ? '' : raw(' <button type="button" class="linkish linkish--danger" data-remove>Retirer</button>')}</p>
        ${opts.item.map(([k, l, o]) => raw(fieldHtml(l, item?.[k], o || {}, `${name}.${i}.${k}`)))}</div>`))}
      ${opts.fixed ? '' : raw(`<button type="button" class="btn btn--small btn--ghost" data-add ${opts.max && items?.length >= opts.max ? 'disabled' : ''}>+ Ajouter</button>`)}
    </fieldset>`;
  }

  function draw(openIndex = 0) {
    el.innerHTML = html`
      <header class="admin-head admin-head--row">
        <div><p class="kicker">Site</p><h1>Contenus du site</h1><p class="lead">Modifiez textes, images et liens. Les changements sont visibles dès l’enregistrement.</p></div>
      </header>
      <form class="content-form" novalidate>
        ${SECTIONS.map((s, i) => raw(html`<details class="admin-card content-section" ${i === openIndex ? 'open' : ''} data-section="${i}">
          <summary><h2>${s.title}</h2></summary>
          ${s.note ? raw(html`<p class="muted small">${s.note}</p>`) : ''}
          <div class="content-fields">${s.fields.map(([key, label, opts = {}]) => raw(opts.type === 'list'
            ? listHtml(label, get(content, `${s.path}.${key}`), opts, `${s.path}.${key}`)
            : fieldHtml(label, get(content, `${s.path}.${key}`), opts, `${s.path}.${key}`)))}</div>
        </details>`))}
        <div class="sticky-save"><button class="btn" type="submit">Enregistrer les contenus</button><span class="muted small" data-status></span></div>
      </form>`;
  }

  /** Relit le formulaire dans l'objet de contenu. */
  function collect() {
    const next = structuredClone(content);
    $$('[name]', el).forEach((input) => {
      const path = input.name;
      if (!path.includes('.')) return;
      const keys = path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
      let o = next;
      for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] ??= typeof keys[i + 1] === 'number' ? [] : {};
      o[keys.at(-1)] = input.value;
    });
    return next;
  }

  draw();
  const openSection = () => Number($('details[open]', el)?.dataset.section || 0);

  el.addEventListener('input', () => dirty());
  el.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const remove = e.target.closest('[data-remove]');
    const clear = e.target.closest('[data-clear]');
    if (!add && !remove && !clear) return;
    content = collect();
    const open = openSection();
    if (clear) {
      set(content, clear.closest('[data-image]').dataset.image, '');
    } else {
      const listEl = (add || remove).closest('[data-list]');
      const path = listEl.dataset.list;
      const list = get(content, path) || [];
      if (add) {
        const section = SECTIONS.find((s) => path.startsWith(`${s.path}.`));
        const def = section.fields.find(([k]) => `${section.path}.${k}` === path)[2];
        list.push(Object.fromEntries(def.item.map(([k]) => [k, ''])));
      } else {
        const index = [...listEl.querySelectorAll('.list-field__item')].indexOf(remove.closest('.list-field__item'));
        list.splice(index, 1);
      }
      set(content, path, list);
    }
    dirty();
    draw(open);
  });
  el.addEventListener('change', async (e) => {
    const input = e.target;
    if (input.type !== 'file' || !input.files[0]) return;
    const box = input.closest('[data-image]');
    try {
      box.classList.add('is-busy');
      const img = await readImageFile(input.files[0]);
      const url = await upload(compress(img, { maxSide: 2000, quality: 0.84 }), 'contenus');
      content = collect();
      set(content, box.dataset.image, url);
      dirty();
      draw(openSection());
      toast('Image téléversée — pensez à enregistrer.');
    } catch (err) {
      toast(err.message);
      box.classList.remove('is-busy');
    }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', el);
    setBusy(btn, true);
    try {
      ({ content } = await api('/content', { method: 'PUT', body: { content: collect() } }));
      dirty(false);
      draw(openSection());
      toast('Contenus enregistrés ✓');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy($('button[type="submit"]', el), false);
    }
  });
}
