// Détail d'une demande : coordonnées, projet, composition jointe, statut, notes internes.
import { api } from '../api.js';
import { html, raw, $, toast, formatDate, statusBadge, requestTypeLabel, confirmDialog, waLink, setBusy } from '../ui.js';
import { REQUEST_STATUSES, ROOMS, HEADINGS, labelOf } from '../../shared/taxonomy.js';
import { money } from '../../modules/ui.js';

const LINING = { sans: 'Sans doublure', doublure: 'Doublure classique', occultante: 'Doublure occultante' };
const INSTALL = { pose: 'Livraison + pose', livraison: 'Livraison seule', retrait: 'Retrait à l’atelier' };
const PROJECT = { rideaux: 'Rideaux sur mesure', relooking: 'Relooking d’espace', 'les-deux': 'Rideaux + relooking' };
const SLOTS = { cushions: 'Coussins', throw: 'Plaid', tablecloth: 'Nappe', bedspread: 'Dessus-de-lit', towel: 'Serviettes' };

export async function render(el, { params, refreshBadge }) {
  const { requests } = await api('/requests');
  let r = requests.find((x) => x.id === params[0]);
  if (!r) { el.innerHTML = '<div class="admin-card"><h2>Demande introuvable</h2><p><a href="#/demandes">Retour aux demandes</a></p></div>'; return; }
  // Une demande ouverte passe automatiquement de « nouvelle » à « en cours ».
  if (r.status === 'nouveau') {
    r = (await api(`/requests/${r.id}`, { method: 'PATCH', body: { status: 'en-cours' } })).request;
    refreshBadge();
  }
  const c = r.customer || {};
  const d = r.details || {};
  const firstName = (c.name || '').split(' ')[0];
  const wa = waLink(c.phone, `Bonjour ${firstName}, c’est Fany de Cozy Home. Je reviens vers vous au sujet de votre demande ${r.reference}.`);
  const facts = [
    ['Projet', PROJECT[d.projectType]],
    ['Modèle', d.modelName ? raw(`<a href="/catalogue/${encodeURIComponent(d.modelSlug)}" target="_blank" rel="noopener">${d.modelName} ↗</a>`) : ''],
    ['Pièce', labelOf(ROOMS, d.room)],
    ['Dimensions', d.windowWidth || d.windowHeight ? `${d.windowWidth ?? '?'} × ${d.windowHeight ?? '?'} cm` : ''],
    ['Fenêtres', d.windows],
    ['Panneaux', d.panels ? (d.panels === 1 ? 'Un panneau' : `${d.panels} (paire)`) : ''],
    ['Pose', labelOf(HEADINGS, d.heading)],
    ['Doublure', LINING[d.lining]],
    ['Livraison', INSTALL[d.installation]],
    ['Adresse', d.address],
    ['Budget', d.budget],
    ['Échéance', d.deadline],
    ['Estimation site', d.estimate ? money(d.estimate) : ''],
  ].filter(([, v]) => v !== '' && v != null);

  const compo = r.composition;
  el.innerHTML = html`
    <header class="admin-head admin-head--row">
      <div><p class="kicker"><a href="#/demandes">Demandes</a> · ${r.reference}</p><h1>${requestTypeLabel(r.type)} — ${c.name}</h1><p class="muted">Reçue le ${formatDate(r.createdAt)} ${statusBadge(r.status)}</p></div>
      ${wa ? raw(`<a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener">Répondre sur WhatsApp</a>`) : ''}
    </header>
    <div class="admin-grid-2">
      <div class="stack">
        <section class="admin-card">
          <h2>Client</h2>
          <dl class="facts">
            <dt>Nom</dt><dd>${c.name}</dd>
            ${c.phone ? raw(html`<dt>Téléphone</dt><dd><a href="tel:${c.phone.replace(/\s/g, '')}">${c.phone}</a></dd>`) : ''}
            ${c.email ? raw(html`<dt>E-mail</dt><dd><a href="mailto:${c.email}">${c.email}</a></dd>`) : ''}
            ${c.city ? raw(html`<dt>Ville</dt><dd>${c.city}</dd>`) : ''}
            <dt>Contact préféré</dt><dd>${{ whatsapp: 'WhatsApp', appel: 'Appel', email: 'E-mail' }[c.contactPref] || '—'}</dd>
          </dl>
        </section>
        <section class="admin-card">
          <h2>Projet</h2>
          ${facts.length ? raw(html`<dl class="facts">${facts.map(([k, v]) => raw(html`<dt>${k}</dt><dd>${v}</dd>`))}</dl>`) : ''}
          ${d.message ? raw(html`<blockquote class="message">${d.message}</blockquote>`) : ''}
        </section>
        ${compo ? raw(html`<section class="admin-card">
          <h2>Composition jointe</h2>
          ${compo.snapshot ? raw(`<a href="${compo.snapshot}" target="_blank" rel="noopener"><img class="compo-img" src="${compo.snapshot}" alt="Composition réalisée par le client"></a>`) : ''}
          <dl class="facts">
            <dt>Décor</dt><dd>${compo.decorLabel}</dd>
            <dt>Rideaux</dt><dd>${compo.curtainName || '—'}</dd>
            ${Object.entries(compo.textiles || {}).filter(([, t]) => t).map(([k, t]) => raw(html`<dt>${SLOTS[k] || k}</dt><dd>${t.name}</dd>`))}
            <dt>Pose</dt><dd>${[compo.options?.panels === 1 ? 'un panneau' : 'une paire', compo.options?.tieback ? 'embrasses' : '', compo.options?.mount === 'plafond' ? 'fixation plafond' : 'au-dessus de la fenêtre', compo.options?.length === 'allege' ? 'à l’appui' : 'jusqu’au sol', compo.options?.rail === 'cache' ? 'rail discret' : 'tringle apparente'].filter(Boolean).join(', ')}</dd>
          </dl>
        </section>`) : ''}
      </div>
      <div class="stack">
        <section class="admin-card">
          <h2>Suivi</h2>
          <label class="field"><span>Statut</span><select class="select" data-status>${REQUEST_STATUSES.map((s) => raw(`<option value="${s.id}" ${s.id === r.status ? 'selected' : ''}>${s.label}</option>`))}</select></label>
          <label class="field" style="margin-top:16px"><span>Notes internes (visibles uniquement par l’équipe)</span><textarea class="textarea" data-notes placeholder="Mesures prises, prix proposé, rendez-vous…">${r.notes || ''}</textarea></label>
          <div class="btn-row" style="margin-top:12px"><button class="btn btn--small" type="button" data-save>Enregistrer</button></div>
          <h3 class="small-title">Historique</h3>
          <ol class="timeline">${(r.history || []).map((h) => raw(html`<li><strong>${labelOf(REQUEST_STATUSES, h.status)}</strong> · ${formatDate(h.at)} <span class="muted">(${h.by})</span></li>`))}</ol>
        </section>
        <section class="admin-card admin-card--danger">
          <h2>Supprimer</h2>
          <p class="muted small">Pour respecter la vie privée des clients, supprimez les demandes dont vous n’avez plus besoin.</p>
          <button class="btn btn--small btn--danger" type="button" data-delete>Supprimer cette demande</button>
        </section>
      </div>
    </div>`;

  $('[data-save]', el).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true);
    try {
      r = (await api(`/requests/${r.id}`, { method: 'PATCH', body: { status: $('[data-status]', el).value, notes: $('[data-notes]', el).value } })).request;
      toast('Demande mise à jour.');
      refreshBadge();
      render(el, { params, refreshBadge });
    } catch (err) { toast(err.message); } finally { setBusy(btn, false); }
  });
  $('[data-delete]', el).addEventListener('click', async () => {
    if (!(await confirmDialog('Supprimer définitivement cette demande ?', { confirm: 'Supprimer', danger: true }))) return;
    await api(`/requests/${r.id}`, { method: 'DELETE' });
    toast('Demande supprimée.');
    refreshBadge();
    location.hash = '#/demandes';
  });
}
