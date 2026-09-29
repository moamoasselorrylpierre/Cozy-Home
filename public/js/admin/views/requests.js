// Suivi des demandes : devis, conseils et commandes, avec statut.
import { api } from '../api.js';
import { html, raw, $, $$, formatDate, statusBadge, requestTypeLabel } from '../ui.js';
import { REQUEST_STATUSES, REQUEST_TYPES } from '../../shared/taxonomy.js';

export async function render(el, { query }) {
  const { requests } = await api('/requests');
  const f = { type: query.get('type') || '', status: query.get('statut') || 'actives', q: '' };
  el.innerHTML = html`
    <header class="admin-head"><p class="kicker">Suivi</p><h1>Demandes</h1><p class="lead">Devis, conseils et commandes reçus via le site.</p></header>
    <div class="admin-toolbar">
      <select class="select select--small" data-f="type" aria-label="Type"><option value="">Tous les types</option>${REQUEST_TYPES.map((t) => raw(`<option value="${t.id}">${t.label}</option>`))}</select>
      <select class="select select--small" data-f="status" aria-label="Statut"><option value="actives">À traiter (hors terminées/archivées)</option><option value="">Tous les statuts</option>${REQUEST_STATUSES.map((s) => raw(`<option value="${s.id}">${s.label}</option>`))}</select>
      <input class="input input--small" type="search" placeholder="Nom, téléphone, référence…" data-f="q" aria-label="Rechercher">
    </div>
    <div class="admin-card admin-card--flush"><table class="admin-table"><thead><tr><th>Reçue</th><th>Client</th><th>Type</th><th>Détail</th><th>Statut</th></tr></thead><tbody data-rows></tbody></table></div>`;
  $('[data-f="type"]', el).value = f.type;
  $('[data-f="status"]', el).value = f.status;
  const rows = $('[data-rows]', el);
  const draw = () => {
    const q = f.q.toLowerCase();
    const list = requests.filter((r) => (!f.type || r.type === f.type)
      && (f.status === '' || (f.status === 'actives' ? !['termine', 'archive'].includes(r.status) : r.status === f.status))
      && (!q || [r.reference, r.customer?.name, r.customer?.phone, r.customer?.email, r.details?.modelName].join(' ').toLowerCase().includes(q)));
    rows.innerHTML = list.length ? list.map((r) => html`
      <tr data-href="#/demandes/${r.id}" tabindex="0">
        <td data-label="Reçue">${formatDate(r.createdAt)}<br><small class="muted">${r.reference}</small></td>
        <td data-label="Client"><strong>${r.customer?.name}</strong><br><small class="muted">${r.customer?.phone || r.customer?.email}</small></td>
        <td data-label="Type">${requestTypeLabel(r.type)}${r.composition ? raw(' <span class="badge badge--compo">composition</span>') : ''}</td>
        <td data-label="Détail">${r.details?.modelName || r.composition?.decorLabel || (r.details?.message || '').slice(0, 60)}</td>
        <td data-label="Statut">${statusBadge(r.status)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted" style="padding:28px">Aucune demande à afficher.</td></tr>';
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.f;
    if (!k) return;
    f[k] = e.target.value;
    draw();
  });
  rows.addEventListener('click', (e) => { const tr = e.target.closest('[data-href]'); if (tr) location.hash = tr.dataset.href; });
  rows.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('[data-href]'); if (tr) location.hash = tr.dataset.href; } });
  draw();
}
