// Liste des modèles : filtres par statut, recherche, archivage / restauration, suppression.
import { api } from '../api.js';
import { html, raw, $, $$, toast, confirmDialog, modelStatusBadge, formatDate } from '../ui.js';
import { STYLE_IDS, AVAILABILITY, labelOf } from '../../shared/taxonomy.js';

const STYLE_LABELS = { voilage: 'Voilage', tamisant: 'Tamisant', occultant: 'Occultant', oeillets: 'À œillets', 'plis-pinces': 'Plis pincés', brode: 'Brodé', boheme: 'Bohème', douche: 'Rideau de douche' };

export async function render(el) {
  let { models } = await api('/models');
  let filter = 'published';
  let query = '';
  let style = '';

  el.innerHTML = html`
    <header class="admin-head admin-head--row">
      <div><p class="kicker">Catalogue</p><h1>Modèles</h1></div>
      <a class="btn" href="#/modeles/nouveau">+ Ajouter un modèle</a>
    </header>
    <div class="admin-toolbar">
      <div class="seg-tabs" role="tablist">
        <button type="button" data-filter="published">Publiés</button>
        <button type="button" data-filter="draft">Brouillons</button>
        <button type="button" data-filter="archived">Archivés</button>
        <button type="button" data-filter="all">Tous</button>
      </div>
      <select class="select select--small" data-style aria-label="Filtrer par style"><option value="">Tous les styles</option>${STYLE_IDS.map((s) => raw(`<option value="${s}">${STYLE_LABELS[s]}</option>`))}</select>
      <input class="input input--small" type="search" placeholder="Rechercher un modèle…" data-search aria-label="Rechercher">
    </div>
    <div class="model-admin-grid" data-list></div>`;

  const list = $('[data-list]', el);
  const draw = () => {
    $$('[data-filter]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));
    const items = models.filter((m) => (filter === 'all' || m.status === filter)
      && (!style || m.style === style)
      && (!query || m.name.toLowerCase().includes(query)));
    list.innerHTML = items.length ? items.map((m) => html`
      <article class="model-admin" data-id="${m.id}">
        <a class="model-admin__img" href="#/modeles/${m.id}">${m.images?.mockups?.miOuvert || m.images?.swatch ? raw(`<img src="${m.images.mockups.miOuvert || m.images.swatch}" alt="" loading="lazy">`) : raw('<span>Sans visuel</span>')}</a>
        <div class="model-admin__body">
          <div class="model-admin__row"><h3><a href="#/modeles/${m.id}">${m.name}</a></h3>${modelStatusBadge(m.status)}</div>
          <p class="muted">${STYLE_LABELS[m.style] || m.style} · ${labelOf(AVAILABILITY, m.availability)}${m.featured ? ' · ★ À la une' : ''}${m.demo ? raw(' <span class="badge badge--demo" title="Modèle d’exemple livré avec le site : à remplacer par vos créations">démo</span>') : ''}</p>
          <p class="muted small">Modifié le ${formatDate(m.updatedAt, false)}</p>
          <div class="model-admin__actions">
            <a class="btn btn--small btn--ghost" href="#/modeles/${m.id}">Modifier</a>
            ${m.status === 'archived'
              ? raw('<button class="btn btn--small btn--ghost" type="button" data-act="restore">Restaurer</button>')
              : raw('<button class="btn btn--small btn--ghost" type="button" data-act="archive">Retirer (archiver)</button>')}
            ${m.status === 'published' ? raw(`<a class="linkish" href="/catalogue/${encodeURIComponent(m.slug)}" target="_blank" rel="noopener">Voir ↗</a>`) : ''}
            ${m.status !== 'published' ? raw('<button class="linkish linkish--danger" type="button" data-act="delete">Supprimer</button>') : ''}
          </div>
        </div>
      </article>`).join('') : '<p class="muted">Aucun modèle dans cette catégorie.</p>';
  };

  el.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = act.closest('[data-id]').dataset.id;
    const model = models.find((m) => m.id === id);
    try {
      if (act.dataset.act === 'archive') {
        if (!(await confirmDialog(`Retirer « ${model.name} » du site ? Il sera archivé et pourra être restauré à tout moment.`, { confirm: 'Archiver' }))) return;
        await api(`/models/${id}`, { method: 'PUT', body: { status: 'archived' } });
        toast('Modèle archivé : il n’apparaît plus sur le site.');
      } else if (act.dataset.act === 'restore') {
        await api(`/models/${id}`, { method: 'PUT', body: { status: 'published' } });
        toast('Modèle restauré et republié.');
      } else if (act.dataset.act === 'delete') {
        if (!(await confirmDialog(`Supprimer définitivement « ${model.name} » ? Cette action est irréversible.`, { confirm: 'Supprimer', danger: true }))) return;
        await api(`/models/${id}`, { method: 'DELETE' });
        toast('Modèle supprimé.');
      }
      ({ models } = await api('/models'));
      draw();
    } catch (err) {
      toast(err.message);
    }
  });
  $('[data-search]', el).addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); draw(); });
  $('[data-style]', el).addEventListener('change', (e) => { style = e.target.value; draw(); });
  draw();
}
