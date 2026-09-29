// Module « thème dynamique » (6.1) : l'interface se teinte subtilement selon le tissu regardé,
// puis revient en douceur à la palette par défaut. Module autonome : il ne dépend que de color.js
// et agit uniquement sur trois variables CSS (--tone-strong, --tone-line, --tone-wash).
import { contrast, ensureContrast, mix, tame, hexToRgb, rgbToHsl } from './color.js';

const DEFAULT = { strong: '#2F3E36', line: '#C9A227', wash: '#EFE6D8', glow: '#C9A22733' };
const IVORY = '#F6F1E9';
const INK = '#26241F';

const holders = new Map(); // source → palette (teintes « maintenues », ex. sélection dans l'outil de composition)
let transient = null; // teinte liée à un survol
let releaseTimer = null;
let initialized = false;
const cache = new Map();

function register() {
  if (initialized) return;
  initialized = true;
  const root = document.documentElement;
  if (window.CSS && CSS.registerProperty) {
    for (const [name, value] of Object.entries({ '--tone-strong': DEFAULT.strong, '--tone-line': DEFAULT.line, '--tone-wash': DEFAULT.wash, '--tone-glow': DEFAULT.glow })) {
      try {
        CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue: value });
      } catch { /* déjà enregistrée */ }
    }
    root.classList.add('theme-houdini');
  } else {
    root.classList.add('theme-fallback');
  }
}

/** Calcule une palette d'interface lisible à partir des couleurs d'un tissu. */
export function paletteFrom(colors) {
  const list = (colors || []).map((c) => (typeof c === 'string' ? { hex: c, weight: 1 } : c)).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex));
  if (!list.length) return null;
  const key = list.map((c) => c.hex).join(',');
  if (cache.has(key)) return cache.get(key);

  const scored = list.map((c) => {
    const [, s, l] = rgbToHsl(hexToRgb(c.hex));
    return { ...c, s, l };
  });
  // Couleur « forte » : la plus présente parmi les teintes assez sombres ou saturées.
  const strongBase = [...scored].sort((a, b) => (b.weight * (0.4 + b.s) * (1.2 - b.l)) - (a.weight * (0.4 + a.s) * (1.2 - a.l)))[0];
  // Couleur de liseré : la plus saturée.
  const lineBase = [...scored].sort((a, b) => b.s * (0.5 + b.weight) - a.s * (0.5 + a.weight))[0];
  // Fond de section : la plus présente.
  const washBase = [...scored].sort((a, b) => b.weight - a.weight)[0];

  const strong = ensureContrast(tame(strongBase.hex, 0.45, 0.12, 0.42), IVORY, 5);
  let line = tame(lineBase.hex, 0.55, 0.3, 0.7);
  if (contrast(line, IVORY) < 1.9) line = ensureContrast(line, IVORY, 1.9);
  let washMix = 0.16;
  let wash = mix(IVORY, tame(washBase.hex, 0.4), washMix);
  while (contrast(INK, wash) < 10 && washMix > 0.04) {
    washMix -= 0.02;
    wash = mix(IVORY, tame(washBase.hex, 0.4), washMix);
  }
  const palette = { strong, line, wash, glow: `${line}33` };
  cache.set(key, palette);
  return palette;
}

function apply(p) {
  const root = document.documentElement;
  const palette = p || DEFAULT;
  root.style.setProperty('--tone-strong', palette.strong);
  root.style.setProperty('--tone-line', palette.line);
  root.style.setProperty('--tone-wash', palette.wash);
  root.style.setProperty('--tone-glow', palette.glow);
  root.dataset.tinted = p ? 'true' : 'false';
}

function refresh() {
  const held = [...holders.values()].pop();
  apply(transient || held || null);
}

/** Teinte l'interface. `hold: true` maintient la teinte jusqu'à release(source). */
export function tint(colors, { source = 'hover', hold = false } = {}) {
  register();
  const p = paletteFrom(colors);
  if (!p) return;
  clearTimeout(releaseTimer);
  if (hold) {
    holders.delete(source);
    holders.set(source, p);
  } else transient = p;
  refresh();
}

/** Relâche une teinte (retour progressif, avec un court délai pour éviter le clignotement). */
export function release({ source = 'hover', delay = 380 } = {}) {
  clearTimeout(releaseTimer);
  if (source !== 'hover') {
    holders.delete(source);
    refresh();
    return;
  }
  releaseTimer = setTimeout(() => {
    transient = null;
    refresh();
  }, delay);
}

export function reset() {
  holders.clear();
  transient = null;
  apply(null);
}

/** Active le survol teinté sur tous les éléments [data-palette="#hex,#hex"] d'une zone. */
export function bindHover(root = document) {
  register();
  root.querySelectorAll('[data-palette]').forEach((el) => {
    if (el.__toneBound) return;
    el.__toneBound = true;
    const colors = () => el.dataset.palette.split(',').filter(Boolean);
    const on = () => tint(colors());
    const off = () => release();
    el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') on(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') off(); });
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
    // Au toucher (mobile) : teinte brève puis retour progressif.
    el.addEventListener('touchstart', () => { on(); release({ delay: 2600 }); }, { passive: true });
  });
}

export const DynamicTheme = { tint, release, reset, bindHover, paletteFrom };
export default DynamicTheme;
