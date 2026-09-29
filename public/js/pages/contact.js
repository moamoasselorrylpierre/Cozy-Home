// Contact : onglets devis / conseil / commande, composition jointe, envoi des demandes.
import { $, $$, storage } from '../modules/ui.js';
import { customerFrom, submitRequest } from './forms.js';

const params = new URLSearchParams(location.search);
const root = $('[data-contact]');
const tabs = $$('[data-tab]', root);
const panels = $$('[data-panel]', root);
const success = $('[data-success]');
const waBase = $('[data-success-wa]')?.href || '';

function selectTab(name, focus = false) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next.dataset.tab, true);
  });
});
const initial = params.get('demande');
if (['devis', 'conseil', 'commande'].includes(initial)) selectTab(initial);

// Modèle présélectionné (?modele=slug).
const modele = params.get('modele');
if (modele) $$('select[name="modelSlug"]').forEach((s) => { if ([...s.options].some((o) => o.value === modele)) s.value = modele; });

// Composition réalisée dans l'outil « Compose ton intérieur ».
let composition = storage.get('cozyhome.composition', null, 'sessionStorage');
const attach = $('[data-composition]');
if (composition && attach) {
  attach.hidden = false;
  $('[data-composition-img]').src = composition.snapshot;
  const parts = [composition.decorLabel, composition.curtainName && `rideaux « ${composition.curtainName} »`]
    .concat(Object.values(composition.textiles || {}).filter(Boolean).map((t) => `« ${t.name} »`))
    .filter(Boolean);
  $('[data-composition-text]').textContent = `Composition jointe : ${parts.join(', ')}.`;
  const form = $('[data-form="devis"]');
  if (composition.curtain) form.modelSlug.value = composition.curtain;
  const room = { 'salle-a-manger-classique': 'salle-a-manger', 'chambre-cosy': 'chambre', 'salle-de-bain': 'salle-de-bain' }[composition.decor] || 'salon';
  form.room.value = room;
  $('[data-composition-remove]').addEventListener('click', () => {
    composition = null;
    storage.remove('cozyhome.composition', 'sessionStorage');
    attach.hidden = true;
  });
}

// Envoi des formulaires devis / conseil.
$$('[data-form]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = form.dataset.form;
    const f = new FormData(form);
    const payload = {
      type,
      customer: customerFrom(form),
      details: {
        message: f.get('message') || '',
        room: f.get('room') || '',
        windowWidth: f.get('windowWidth') || '',
        windowHeight: f.get('windowHeight') || '',
        windows: f.get('windows') || '',
        budget: f.get('budget') || '',
        deadline: f.get('deadline') || '',
        projectType: f.get('projectType') || '',
        modelSlug: f.get('modelSlug') || '',
      },
    };
    if (type === 'conseil' && !payload.details.message.trim()) {
      $('[data-error]', form).textContent = 'Dites-nous en quelques mots ce dont vous avez besoin.';
      return;
    }
    if (type === 'devis' && composition) payload.composition = composition;
    const res = await submitRequest({ form, payload, button: $('button[type="submit"]', form), errorEl: $('[data-error]', form), success, waBase });
    if (res && composition) storage.remove('cozyhome.composition', 'sessionStorage');
  });
});

// Commande : redirection vers le tunnel du modèle choisi.
$('[data-order-pick]')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const slug = e.currentTarget.modelSlug.value;
  if (slug) location.href = `/commande/${encodeURIComponent(slug)}`;
});
