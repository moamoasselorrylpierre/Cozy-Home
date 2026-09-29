// Espace pro : connexion, mise en page, navigation par ancre (#/…) et chargement des écrans.
import { api } from './api.js';
import { $, $$, html, toast } from './ui.js';

const root = document.getElementById('admin-root');
const NAV = [
  { path: '/tableau-de-bord', label: 'Tableau de bord', icon: '◇' },
  { path: '/modeles', label: 'Modèles', icon: '▤' },
  { path: '/modeles/nouveau', label: 'Ajouter un modèle', icon: '+' },
  { path: '/demandes', label: 'Demandes', icon: '✉', badge: true },
  { path: '/galerie', label: 'Salles de la galerie', icon: 'Ⅷ' },
  { path: '/contenus', label: 'Contenus du site', icon: '¶' },
  { path: '/compte', label: 'Mon compte & équipe', icon: '◯' },
  { path: '/aide', label: 'Aide', icon: '?' },
];

const ROUTES = [
  { re: /^\/tableau-de-bord$/, load: () => import('./views/dashboard.js') },
  { re: /^\/modeles$/, load: () => import('./views/models.js') },
  { re: /^\/modeles\/nouveau$/, load: () => import('./views/model-editor.js') },
  { re: /^\/modeles\/([\w-]+)$/, load: () => import('./views/model-editor.js') },
  { re: /^\/demandes$/, load: () => import('./views/requests.js') },
  { re: /^\/demandes\/([\w-]+)$/, load: () => import('./views/request-detail.js') },
  { re: /^\/galerie$/, load: () => import('./views/styles.js') },
  { re: /^\/contenus$/, load: () => import('./views/content.js') },
  { re: /^\/compte$/, load: () => import('./views/account.js') },
  { re: /^\/aide$/, load: () => import('./views/help.js') },
];

const session = { user: null };
let cleanup = null;
let dirty = false;

/** Les écrans signalent des modifications non enregistrées. */
window.addEventListener('admin:dirty', (e) => { dirty = !!e.detail; });
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('admin:unauthorized', () => { session.user = null; renderLogin('Votre session a expiré : merci de vous reconnecter.'); });

function renderLogin(message = '') {
  document.title = 'Connexion | Espace pro Cozy Home';
  root.innerHTML = html`
    <main class="login">
      <form class="login__card" novalidate>
        <img src="/img/logo.svg" alt="" width="36" height="46">
        <p class="kicker kicker--plain">Espace pro</p>
        <h1>Cozy Home <em>by Fany</em></h1>
        <p class="login__intro">Accès réservé à l’équipe de l’atelier.</p>
        <label class="field"><span>Identifiant</span><input class="input" name="username" autocomplete="username" required autocapitalize="none" spellcheck="false"></label>
        <label class="field"><span>Mot de passe</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <p class="form__error" role="alert">${message}</p>
        <button class="btn" type="submit">Se connecter</button>
        <a class="login__back" href="/">← Retour au site</a>
      </form>
    </main>`;
  const form = $('form', root);
  form.username.focus();
  // Premier lancement : aucun compte tant que le secret ADMIN_PASSWORD n'est pas défini sur Cloudflare.
  fetch('/api/admin/setup').then((r) => r.json()).then(({ configured }) => {
    if (configured === false) {
      $('.form__error', form).textContent = 'Aucun compte n’est encore configuré. Sur Cloudflare : Workers & Pages → cozy-home → Paramètres → Variables et secrets → ajoutez le secret ADMIN_PASSWORD, puis rechargez cette page.';
    }
  }).catch(() => {});
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', form);
    const err = $('.form__error', form);
    err.textContent = '';
    btn.disabled = true;
    try {
      const { user } = await api('/login', { method: 'POST', body: { username: form.username.value.trim(), password: form.password.value } });
      session.user = user;
      renderShell();
      if (!location.hash || location.hash === '#/') location.hash = '#/tableau-de-bord';
      else route();
    } catch (error) {
      err.textContent = error.message;
      form.password.value = '';
      form.password.focus();
    } finally {
      btn.disabled = false;
    }
  });
}

function renderShell() {
  root.innerHTML = html`
    <div class="admin-shell">
      <aside class="admin-side" data-side>
        <a class="admin-brand" href="#/tableau-de-bord"><img src="/img/logo.svg" alt="" width="24" height="31"><span>Cozy Home<em>espace pro</em></span></a>
        <nav aria-label="Menu de l’espace pro">
          <ul>${NAV.map((n) => ({ html: html`<li><a href="#${n.path}" data-path="${n.path}"><span class="admin-nav__icon" aria-hidden="true">${n.icon}</span>${n.label}${n.badge ? { html: '<span class="admin-nav__badge" data-new-count hidden></span>' } : ''}</a></li>` }))}</ul>
        </nav>
        <div class="admin-side__foot">
          <p>Connectée : <strong>${session.user.name}</strong></p>
          <a href="/" target="_blank" rel="noopener">Voir le site ↗</a>
          <button type="button" class="linkish" data-logout>Se déconnecter</button>
        </div>
      </aside>
      <div class="admin-main">
        <header class="admin-top">
          <button type="button" class="admin-menu" data-menu aria-label="Menu" aria-expanded="false">☰</button>
          <span class="admin-top__title">Cozy Home · espace pro</span>
        </header>
        <div class="admin-view" data-view tabindex="-1"></div>
      </div>
    </div>`;
  $('[data-logout]', root).addEventListener('click', async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    session.user = null;
    location.hash = '';
    renderLogin();
  });
  const side = $('[data-side]', root);
  const menu = $('[data-menu]', root);
  menu.addEventListener('click', () => {
    const open = !side.classList.contains('is-open');
    side.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  });
  side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('is-open'); });
  refreshBadge();
}

export async function refreshBadge() {
  try {
    const stats = await api('/stats');
    const n = stats.requests?.nouveau || 0;
    const b = $('[data-new-count]');
    if (b) { b.hidden = !n; b.textContent = n; }
  } catch { /* silencieux */ }
}

async function route() {
  if (!session.user) return;
  const [path, qs = ''] = (location.hash.replace(/^#/, '') || '/tableau-de-bord').split('?');
  if (dirty && !confirm('Des modifications ne sont pas enregistrées. Quitter cette page ?')) {
    history.back();
    return;
  }
  dirty = false;
  const match = ROUTES.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  const view = $('[data-view]');
  if (!view) return;
  $$('[data-path]').forEach((a) => {
    const p = a.dataset.path;
    const active = p === path || (p === '/modeles' && /^\/modeles\/(?!nouveau)/.test(path)) || (p === '/demandes' && path.startsWith('/demandes/'));
    a.toggleAttribute('aria-current', active);
  });
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  if (!match) { location.hash = '#/tableau-de-bord'; return; }
  view.innerHTML = '<p class="admin-loading">Chargement…</p>';
  try {
    const mod = await match.r.load();
    cleanup = await mod.render(view, { params: match.m.slice(1), query: new URLSearchParams(qs), user: session.user, refreshBadge });
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.status === 401) return;
    console.error(err);
    view.innerHTML = html`<div class="admin-card"><h2>Oups</h2><p>${err.message}</p></div>`;
  }
}

window.addEventListener('hashchange', route);

(async function boot() {
  try {
    const { user } = await api('/me');
    session.user = user;
    renderShell();
    route();
  } catch {
    renderLogin();
  }
})();

export { toast };
