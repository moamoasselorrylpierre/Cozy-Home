// Salles de la galerie : cartels (textes façon musée), pièce exposée et décor de chaque salle.
import { api } from '../api.js';
import { html, raw, $, $$, toast, setBusy } from '../ui.js';
import { DECORS } from '../../modules/scenes.js';

export async function render(el) {
  const [{ styles }, { models }] = await Promise.all([api('/styles'), api('/models')]);
  el.innerHTML = html`
    <header class="admin-head"><p class="kicker">La Galerie</p><h1>Salles de la galerie</h1><p class="lead">Chaque salle présente un style de rideau. Modifiez ses textes (le « cartel »), la pièce exposée et le décor.</p></header>
    <div class="stack">${styles.map((s) => raw(html`
      <form class="admin-card style-form" data-id="${s.id}">
        <div class="admin-card__head"><h2>Salle ${s.roman} · ${s.name}</h2><a class="linkish" href="/galerie#salle-${s.id}" target="_blank" rel="noopener">Voir ↗</a></div>
        <div class="form__row">
          <label class="field"><span>Nom de la salle</span><input class="input" name="name" value="${s.name}" maxlength="60"></label>
          <label class="field"><span>Nom court (filtres, menus)</span><input class="input" name="short" value="${s.short}" maxlength="40"></label>
        </div>
        <label class="field"><span>Cartel (2-3 phrases)</span><textarea class="textarea" name="cartel" rows="3" maxlength="900">${s.cartel}</textarea></label>
        <div class="form__row">
          <label class="field"><span>Matière</span><input class="input" name="material" value="${s.material}" maxlength="200"></label>
          <label class="field"><span>Ambiance</span><input class="input" name="ambiance" value="${s.ambiance}" maxlength="200"></label>
        </div>
        <div class="form__row">
          <label class="field"><span>Pièce exposée</span><select class="select" name="featuredModel"><option value="">— Premier modèle publié du style —</option>${models.filter((m) => m.style === s.id && m.status === 'published').map((m) => raw(html`<option value="${m.slug}" ${m.slug === s.featuredModel ? 'selected' : ''}>${m.name}</option>`))}</select></label>
          <label class="field"><span>Décor de la salle</span><select class="select" name="decor">${DECORS.map((d) => raw(html`<option value="${d.id}" ${d.id === s.decor ? 'selected' : ''}>${d.label}</option>`))}</select></label>
        </div>
        <div class="btn-row"><button class="btn btn--small" type="submit">Enregistrer la salle</button></div>
      </form>`))}</div>`;
  $$('.style-form', el).forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    setBusy(btn, true);
    const body = Object.fromEntries(new FormData(form));
    try {
      await api(`/styles/${form.dataset.id}`, { method: 'PUT', body });
      toast('Salle enregistrée ✓');
    } catch (err) { toast(err.message); } finally { setBusy(btn, false); }
  }));
}
