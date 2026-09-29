// Catalogue : filtres instantanés (style, couleur, matière, pièce) synchronisés avec l'URL.
import { $, $$ } from '../modules/ui.js';

const grid = $('[data-grid]');
const cards = $$('.model-card', grid);
const count = $('[data-count]');
const empty = $('[data-empty]');
const resets = $$('[data-filter-reset]');

const params = new URLSearchParams(location.search);
const state = {
  style: params.get('style') || '',
  couleur: new Set((params.get('couleur') || '').split(',').filter(Boolean)),
  matiere: params.get('matiere') || '',
  piece: params.get('piece') || '',
};

function apply() {
  let visible = 0;
  for (const card of cards) {
    const families = card.dataset.families.split(' ');
    const rooms = card.dataset.rooms.split(' ');
    const ok = (!state.style || card.dataset.style === state.style)
      && (!state.couleur.size || families.some((f) => state.couleur.has(f)))
      && (!state.matiere || card.dataset.material === state.matiere)
      && (!state.piece || rooms.includes(state.piece));
    card.hidden = !ok;
    if (ok) visible++;
  }
  count.textContent = `${visible} modèle${visible > 1 ? 's' : ''}`;
  empty.hidden = visible > 0;
  const active = state.style || state.couleur.size || state.matiere || state.piece;
  resets.forEach((b) => { if (b.closest('.filters')) b.hidden = !active; });

  $$('[data-filter="style"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === state.style)));
  $$('[data-filter="couleur"]').forEach((b) => b.setAttribute('aria-pressed', String(state.couleur.has(b.dataset.value))));
  $$('[data-filter-select]').forEach((s) => { s.value = state[s.dataset.filterSelect]; });

  const q = new URLSearchParams();
  if (state.style) q.set('style', state.style);
  if (state.couleur.size) q.set('couleur', [...state.couleur].join(','));
  if (state.matiere) q.set('matiere', state.matiere);
  if (state.piece) q.set('piece', state.piece);
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    const { filter, value } = chip.dataset;
    if (filter === 'style') state.style = value;
    else if (state.couleur.has(value)) state.couleur.delete(value);
    else state.couleur.add(value);
    apply();
    return;
  }
  if (e.target.closest('[data-filter-reset]')) {
    Object.assign(state, { style: '', matiere: '', piece: '' });
    state.couleur.clear();
    apply();
  }
});
$$('[data-filter-select]').forEach((s) => s.addEventListener('change', () => { state[s.dataset.filterSelect] = s.value; apply(); }));

apply();
// Fait défiler la barre de filtres jusqu'au style actif (utile sur mobile).
const activeChip = $('[data-filter="style"][aria-pressed="true"]');
if (activeChip && state.style) activeChip.parentElement.parentElement.scrollLeft = activeChip.offsetLeft - 60;
