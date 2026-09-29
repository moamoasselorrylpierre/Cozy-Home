// Utilitaires d'interface de l'espace admin.
import { REQUEST_STATUSES, REQUEST_TYPES, MODEL_STATUSES, labelOf } from '../shared/taxonomy.js';
export { toast, escapeHtml as esc } from '../modules/ui.js';
import { escapeHtml } from '../modules/ui.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Gabarit HTML avec échappement automatique des valeurs (sauf objets {html}). */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    let v = values[i - 1];
    if (Array.isArray(v)) v = v.map((x) => (x && x.html !== undefined ? x.html : escapeHtml(x))).join('');
    else if (v && v.html !== undefined) v = v.html;
    else v = escapeHtml(v ?? '');
    return out + v + s;
  });
}
export const raw = (s) => ({ html: String(s ?? '') });

export function formatDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export function statusBadge(status, list = REQUEST_STATUSES) {
  return raw(`<span class="badge badge--${escapeHtml(status)}">${escapeHtml(labelOf(list, status))}</span>`);
}
export const requestTypeLabel = (t) => labelOf(REQUEST_TYPES, t);
export const modelStatusBadge = (s) => statusBadge(s, MODEL_STATUSES);

/** Boîte de confirmation accessible (dialog natif). */
export function confirmDialog(message, { confirm = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'admin-dialog';
    d.innerHTML = html`<form method="dialog"><p>${message}</p><div class="btn-row"><button class="btn btn--ghost btn--small" value="non">Annuler</button><button class="btn btn--small ${danger ? 'btn--danger' : ''}" value="oui">${confirm}</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'oui'); d.remove(); });
    d.showModal();
  });
}

export function setBusy(button, busy, label = 'Enregistrement…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
