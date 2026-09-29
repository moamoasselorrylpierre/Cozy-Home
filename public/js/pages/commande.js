// Tunnel de commande : dimensions → confection → coordonnées → récapitulatif, avec estimation.
import { $, $$, pageData, money, escapeHtml } from '../modules/ui.js';
import { customerFrom, validateCustomer, submitRequest } from './forms.js';
import { tint } from '../modules/dynamic-theme.js';

const { model } = pageData();
const form = $('[data-order-form]');
const steps = $$('[data-step]', form);
const stepper = $$('[data-steps] li');
const prev = $('[data-prev]');
const next = $('[data-next]');
const submit = $('[data-submit]');
const errorEl = $('[data-error]', form);
const estimateEl = $('[data-estimate]');
const summary = $('[data-summary]');
const waBase = $('[data-success-wa]')?.href || '';
let current = 0;

if (model?.colors?.length) setTimeout(() => tint(model.colors, { source: 'commande', hold: true }), 300);

const FULLNESS = { eyelet: 2, pinch: 2.2, rod: 2.4, tab: 1.9, rings: 1.5 };
const LABELS = {
  heading: { eyelet: 'Œillets', pinch: 'Plis pincés', rod: 'Passe-tringle', tab: 'Pattes', rings: 'Anneaux' },
  lining: { sans: 'Sans doublure', doublure: 'Doublure classique', occultante: 'Doublure occultante' },
  installation: { pose: 'Livraison + pose', livraison: 'Livraison seule', retrait: 'Retrait à l’atelier' },
};

// Présélection de la pose d'origine du modèle.
const preferred = form.querySelector(`input[name="heading"][value="${model?.render?.heading}"]`);
if (preferred) preferred.checked = true;

/** Estimation indicative : métrage de tissu × tarif (mètre) ou nombre de panneaux × tarif. */
function estimate() {
  const f = new FormData(form);
  const w = Number(f.get('windowWidth'));
  const h = Number(f.get('windowHeight'));
  const n = Math.max(1, Number(f.get('windows')) || 1);
  const panels = Number(f.get('panels')) || 2;
  const heading = f.get('heading') || 'eyelet';
  if (!model?.price || !w || !h) return null;
  const { amount, unit } = model.price;
  if (unit === 'metre') {
    const widthCm = (w + 30) * (FULLNESS[heading] || 2);
    const drops = Math.max(panels, Math.ceil(widthCm / 140));
    const metres = (drops * (h + 25)) / 100;
    return { value: metres * amount * n, detail: `≈ ${metres.toFixed(1).replace('.', ',')} m de tissu par fenêtre` };
  }
  const count = (unit === 'paire' ? Math.ceil(panels / 2) : panels) * n;
  return { value: count * amount, detail: `${count} ${unit === 'paire' ? 'paire(s)' : 'panneau(x)'}` };
}

function refresh() {
  const e = estimate();
  estimateEl.textContent = e ? money(e.value) : '—';
  const f = new FormData(form);
  const rows = [['Tarif', model.price ? `${money(model.price.amount)} / ${model.price.unit === 'metre' ? 'mètre' : model.price.unit}` : 'Sur devis']];
  if (f.get('windowWidth') && f.get('windowHeight')) rows.push(['Dimensions', `${f.get('windowWidth')} × ${f.get('windowHeight')} cm`]);
  rows.push(['Fenêtres', f.get('windows') || '1'], ['Panneaux', f.get('panels') === '1' ? 'Un panneau' : 'Une paire']);
  if (current >= 1) rows.push(['Pose', LABELS.heading[f.get('heading')]], ['Doublure', LABELS.lining[f.get('lining')]], ['Livraison', LABELS.installation[f.get('installation')]]);
  if (e) rows.push(['Métrage', e.detail]);
  summary.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
}

function validateStep(i) {
  const f = new FormData(form);
  if (i === 0) {
    const w = Number(f.get('windowWidth'));
    const h = Number(f.get('windowHeight'));
    if (!(w >= 30 && w <= 1200)) return 'Indiquez la largeur de votre fenêtre (entre 30 et 1200 cm).';
    if (!(h >= 30 && h <= 800)) return 'Indiquez la hauteur de pose (entre 30 et 800 cm).';
  }
  if (i === 2) return validateCustomer(customerFrom(form));
  return '';
}

function show(i, scroll = true) {
  current = i;
  steps.forEach((s, k) => { s.hidden = k !== i; });
  stepper.forEach((li, k) => { li.classList.toggle('is-active', k === i); li.classList.toggle('is-done', k < i); });
  prev.hidden = i === 0;
  next.hidden = i === steps.length - 1;
  submit.hidden = i !== steps.length - 1;
  errorEl.textContent = '';
  if (i === steps.length - 1) renderRecap();
  refresh();
  if (scroll) form.closest('[data-order]').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRecap() {
  const f = new FormData(form);
  const c = customerFrom(form);
  const e = estimate();
  $('[data-recap]').innerHTML = `
    <p class="kicker">Récapitulatif</p>
    <h3>${escapeHtml(model.name)}</h3>
    <ul>
      <li>${escapeHtml(f.get('windowWidth'))} × ${escapeHtml(f.get('windowHeight'))} cm · ${escapeHtml(f.get('windows') || 1)} fenêtre(s) · ${f.get('panels') === '1' ? 'un panneau' : 'une paire'}</li>
      <li>${escapeHtml(LABELS.heading[f.get('heading')])} · ${escapeHtml(LABELS.lining[f.get('lining')])} · ${escapeHtml(LABELS.installation[f.get('installation')])}</li>
      <li>${escapeHtml(c.name)} · ${escapeHtml(c.phone || c.email)}${c.city ? ` · ${escapeHtml(c.city)}` : ''}</li>
      ${e ? `<li><strong>Estimation : ${escapeHtml(money(e.value))}</strong></li>` : ''}
    </ul>`;
}

next.addEventListener('click', () => {
  const problem = validateStep(current);
  if (problem) { errorEl.textContent = problem; return; }
  show(current + 1);
});
prev.addEventListener('click', () => show(current - 1));
form.addEventListener('input', refresh);
form.addEventListener('change', refresh);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  const est = estimate();
  await submitRequest({
    form,
    button: submit,
    errorEl,
    success: $('[data-success]'),
    waBase,
    payload: {
      type: 'commande',
      customer: customerFrom(form),
      details: {
        modelSlug: model.slug,
        windowWidth: f.get('windowWidth'),
        windowHeight: f.get('windowHeight'),
        windows: f.get('windows'),
        panels: f.get('panels'),
        room: f.get('room') || '',
        heading: f.get('heading'),
        lining: f.get('lining'),
        installation: f.get('installation'),
        address: f.get('address') || '',
        message: f.get('message') || '',
        estimate: est ? Math.round(est.value) : '',
      },
    },
  });
});
show(0, false);
