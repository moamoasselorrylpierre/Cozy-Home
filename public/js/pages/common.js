// Comportements communs à toutes les pages publiques : menu, en-tête, apparitions, thème dynamique.
import { bindHover } from '../modules/dynamic-theme.js';

const header = document.querySelector('[data-header]');
const toggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');

if (toggle && nav) {
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('use')?.setAttribute('href', open ? '#i-close' : '#i-menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

// En-tête : filet au défilement ; bouton WhatsApp flottant après le premier écran.
const wa = document.querySelector('[data-wa-float]');
let ticking = false;
function onScroll() {
  ticking = false;
  const y = window.scrollY;
  header?.classList.toggle('is-scrolled', y > 8);
  wa?.classList.toggle('is-visible', y > window.innerHeight * 0.6);
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

// Le bouton flottant s'efface quand le pied de page (et ses liens) est visible.
const footer = document.querySelector('.site-footer');
if (wa && footer && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => wa.classList.toggle('is-hidden', entry.isIntersecting)).observe(footer);
}

// Apparitions douces au défilement.
export function observeReveals(root = document) {
  const items = root.querySelectorAll('[data-reveal]:not(.is-visible)');
  if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
}
observeReveals();

// Vue secondaire des cartes (rideau avec embrasses) : chargée seulement au premier survol.
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const img = e.target.closest?.('.model-card')?.querySelector('img.is-alt[data-src]');
  if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
}, { passive: true });

// Thème dynamique : les éléments [data-palette] teintent l'interface au survol.
bindHover(document);
