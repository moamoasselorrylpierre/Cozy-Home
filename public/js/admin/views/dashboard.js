// Tableau de bord : chiffres clés, dernières demandes, raccourcis.
import { api } from '../api.js';
import { html, formatDate, statusBadge, requestTypeLabel } from '../ui.js';

export async function render(el, { user }) {
  const stats = await api('/stats');
  const r = stats.requests || {};
  const m = stats.models || {};
  const t = stats.requestTypes || {};
  const hour = new Date().getHours();
  const hello = hour < 18 ? 'Bonjour' : 'Bonsoir';
  el.innerHTML = html`
    <header class="admin-head">
      <p class="kicker">Tableau de bord</p>
      <h1>${hello} ${user.name} ✦</h1>
      <p class="lead">Voici l’état de l’atelier aujourd’hui.</p>
    </header>
    <section class="kpis">
      <a class="kpi kpi--accent" href="#/demandes?statut=nouveau"><strong>${r.nouveau || 0}</strong><span>Nouvelle(s) demande(s)</span></a>
      <a class="kpi" href="#/demandes?statut=en-cours"><strong>${r['en-cours'] || 0}</strong><span>En cours de traitement</span></a>
      <a class="kpi" href="#/demandes?type=commande"><strong>${t.commande || 0}</strong><span>Commande(s) actives</span></a>
      <a class="kpi" href="#/modeles"><strong>${m.published || 0}</strong><span>Modèle(s) publié(s)${m.draft ? ` · ${m.draft} brouillon(s)` : ''}</span></a>
    </section>
    <div class="admin-grid-2">
      <section class="admin-card">
        <div class="admin-card__head"><h2>Dernières demandes</h2><a class="link-arrow" href="#/demandes">Tout voir</a></div>
        ${stats.latest.length ? { html: html`<ul class="req-mini">${stats.latest.map((x) => ({ html: html`<li><a href="#/demandes/${x.id}"><span><strong>${x.name}</strong> · ${requestTypeLabel(x.type)}${x.model ? ` · ${x.model}` : ''}</span><span>${statusBadge(x.status)} <small>${formatDate(x.createdAt)}</small></span></a></li>` }))}</ul>` } : { html: '<p class="muted">Aucune demande pour le moment. Elles apparaîtront ici dès qu’un visiteur remplira un formulaire.</p>' }}
      </section>
      <section class="admin-card">
        <div class="admin-card__head"><h2>Raccourcis</h2></div>
        <div class="shortcuts">
          <a class="shortcut" href="#/modeles/nouveau"><strong>Ajouter un tissu</strong><span>Photo → mock-ups automatiques → publication</span></a>
          <a class="shortcut" href="#/contenus"><strong>Modifier les textes</strong><span>Accueil, atelier, contacts, réseaux sociaux</span></a>
          <a class="shortcut" href="#/galerie"><strong>Salles de la galerie</strong><span>Cartels et pièces exposées</span></a>
          <a class="shortcut" href="#/aide"><strong>Guide d’utilisation</strong><span>Tout savoir en 5 minutes</span></a>
        </div>
      </section>
    </div>`;
}
