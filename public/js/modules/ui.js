// Petits utilitaires d'interface partagés.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function pageData() {
  const el = document.getElementById('page-data');
  if (!el) return {};
  try { return JSON.parse(el.textContent); } catch { return {}; }
}

let toastTimer;
export function toast(message, ms = 3200) {
  const el = document.querySelector('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), ms);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Charge une image (promesse), avec cache. */
const imageCache = new Map();
export function loadImage(src) {
  if (!src) return Promise.reject(new Error('Image manquante'));
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { imageCache.delete(src); reject(new Error(`Image introuvable : ${src}`)); };
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Envoi impossible pour le moment.');
  return data;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Formate un montant en FCFA. */
export function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} FCFA`;
}

/** Mémorisation sûre (navigation privée, stockage bloqué…). */
export const storage = {
  get(key, fallback = null, area = 'localStorage') {
    try { const v = window[area].getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value, area = 'localStorage') {
    try { window[area].setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key, area = 'localStorage') {
    try { window[area].removeItem(key); } catch { /* ignoré */ }
  },
};
