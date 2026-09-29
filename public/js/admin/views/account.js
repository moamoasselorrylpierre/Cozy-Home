// Mon compte (mot de passe) et gestion de l'équipe (réservée à la propriétaire).
import { api } from '../api.js';
import { html, raw, $, toast, setBusy, confirmDialog, formatDate } from '../ui.js';

export async function render(el, { user }) {
  const team = user.role === 'owner' ? (await api('/users')).users : null;
  const wrap = document.createElement('div');
  el.replaceChildren(wrap);
  wrap.innerHTML = html`
    <header class="admin-head"><p class="kicker">Sécurité</p><h1>Mon compte${team ? ' & équipe' : ''}</h1></header>
    <div class="admin-grid-2">
      <form class="admin-card" data-password novalidate>
        <h2>Changer mon mot de passe</h2>
        <p class="muted small">Connectée en tant que <strong>${user.username}</strong>. Au moins 10 caractères, avec lettres et chiffres.</p>
        <label class="field"><span>Mot de passe actuel</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>Nouveau mot de passe</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="10" required></label>
        <label class="field"><span>Confirmer</span><input class="input" type="password" name="confirm" autocomplete="new-password" required></label>
        <p class="form__error" data-error role="alert"></p>
        <button class="btn btn--small" type="submit">Mettre à jour</button>
      </form>
      ${team ? raw(html`<section class="admin-card">
        <h2>Équipe de l’atelier</h2>
        <p class="muted small">Les comptes sont créés uniquement ici : il n’existe pas d’inscription publique.</p>
        <ul class="team">${team.map((u) => raw(html`<li><span><strong>${u.name}</strong> · ${u.username} <small class="muted">${u.role === 'owner' ? 'propriétaire' : 'équipe'}${u.lastLoginAt ? ` · dernière connexion ${formatDate(u.lastLoginAt)}` : ''}</small></span>${u.role !== 'owner' ? raw(html`<button type="button" class="linkish linkish--danger" data-remove="${u.id}" data-name="${u.name}">Retirer</button>`) : ''}</li>`))}</ul>
        <form data-add-user novalidate>
          <h3 class="small-title">Ajouter un membre</h3>
          <div class="form__row"><label class="field"><span>Prénom</span><input class="input" name="name" required maxlength="60"></label><label class="field"><span>Identifiant</span><input class="input" name="username" required pattern="[a-z0-9._-]{3,32}" autocapitalize="none"></label></div>
          <label class="field"><span>Mot de passe provisoire</span><input class="input" type="text" name="password" required minlength="10" autocomplete="off"></label>
          <p class="form__error" data-error role="alert"></p>
          <button class="btn btn--small" type="submit">Créer le compte</button>
        </form>
      </section>`) : ''}
    </div>`;

  const pw = $('[data-password]', el);
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-error]', pw);
    err.textContent = '';
    if (pw.next.value !== pw.confirm.value) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    const btn = $('button', pw);
    setBusy(btn, true);
    try {
      await api('/password', { method: 'POST', body: { current: pw.current.value, next: pw.next.value } });
      pw.reset();
      toast('Mot de passe mis à jour ✓ (les autres sessions ont été déconnectées).');
    } catch (error) { err.textContent = error.message; } finally { setBusy(btn, false); }
  });

  const add = $('[data-add-user]', el);
  add?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-error]', add);
    err.textContent = '';
    try {
      await api('/users', { method: 'POST', body: { name: add.name.value, username: add.username.value.trim().toLowerCase(), password: add.password.value } });
      toast('Compte créé. Communiquez l’identifiant et le mot de passe provisoire à la personne.');
      render(el, { user });
    } catch (error) { err.textContent = error.message; }
  });
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    if (!(await confirmDialog(`Retirer l’accès de ${b.dataset.name} ?`, { confirm: 'Retirer', danger: true }))) return;
    try {
      await api(`/users/${b.dataset.remove}`, { method: 'DELETE' });
      toast('Accès retiré.');
      render(el, { user });
    } catch (error) { toast(error.message); }
  });
}
