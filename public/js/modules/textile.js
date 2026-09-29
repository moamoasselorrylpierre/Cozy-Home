/**
 * textile.js — remplissage d'un chemin par un tissu (texture répétée) + ombrage volumique.
 *
 * Utilisé par scenes.js (coussins, nappe, plaid, dessus-de-lit, pouf, serviette…) et par l'hôte.
 * Canvas 2D uniquement, sans dépendance.
 *
 * paintTextile(ctx, path2D, {
 *   texture,            // HTMLCanvasElement | HTMLImageElement | ImageBitmap | null (null => fallbackColor)
 *   fallbackColor,      // couleur de repli (défaut '#E9DFCF')
 *   kind,               // 'cushion' | 'tablecloth' | 'throw' | 'bedspread' | 'pouf' | 'flat'
 *   bounds,             // {x, y, w, h} du chemin (coordonnées courantes du ctx)
 *   scale,              // taille en px logiques d'une répétition du motif (défaut 110)
 *   rotation,           // rotation du motif en degrés (défaut 0)
 *   // Options facultatives (ignorées sans risque si absentes) :
 *   light,              // direction de la lumière : -1 (vient de gauche) … +1 (vient de droite), défaut -0.6
 *   squash,             // écrasement vertical du motif (surfaces horizontales vues en perspective), défaut 1
 *   topH,               // hauteur (px) de la partie « dessus » : nappe, dessus-de-lit, pouf
 *   seed,               // graine des plis (sinon dérivée des bounds)
 * })
 */

const TAU = Math.PI * 2;

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dimensions exploitables d'une source d'image (0 si non chargée). */
function sourceSize(tex) {
  if (!tex) return 0;
  if (typeof HTMLImageElement !== 'undefined' && tex instanceof HTMLImageElement) {
    return tex.complete ? tex.naturalWidth || 0 : 0;
  }
  return tex.width || 0;
}

/** Crée le motif répété à la bonne échelle ; renvoie null si impossible. */
function makePattern(ctx, texture, b, scale, rotation, squash) {
  const size = sourceSize(texture);
  if (!size) return null;
  let pat = null;
  try {
    pat = ctx.createPattern(texture, 'repeat');
  } catch {
    return null; // source non utilisable (image non décodée, canevas vide…)
  }
  if (!pat) return null;
  if (typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    const k = Math.max(4, scale) / size;
    const m = new DOMMatrix()
      .translate(b.x + b.w / 2, b.y + b.h / 2)
      .rotate(rotation || 0)
      .scale(k, k * (squash || 1));
    pat.setTransform(m);
  }
  return pat;
}

/** Couleur rgba à partir d'un triplet et d'une opacité. */
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;

/* ------------------------------------------------------------------ */
/* Calques d'ombrage par type d'objet                                  */
/* ------------------------------------------------------------------ */

/** Coussin : bombé (radial), reflet côté lumière, pincements aux coins, liseré. */
function shadeCushion(ctx, path, b, o) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const L = o.light;
  const R = Math.max(b.w, b.h) * 0.62;

  // Volume : bords assombris (multiply)
  ctx.globalCompositeOperation = 'multiply';
  let g = ctx.createRadialGradient(cx + L * b.w * 0.12, cy - b.h * 0.12, R * 0.12, cx, cy, R);
  g.addColorStop(0, rgba(255, 255, 255, 0));
  g.addColorStop(0.55, rgba(222, 212, 200, 0.18));
  g.addColorStop(1, rgba(92, 74, 60, 0.62));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Côté opposé à la lumière + bas plus sombres
  g = ctx.createLinearGradient(b.x + (L < 0 ? 0 : b.w), b.y, b.x + (L < 0 ? b.w : 0), b.y + b.h);
  g.addColorStop(0, rgba(255, 255, 255, 0));
  g.addColorStop(0.55, rgba(255, 255, 255, 0));
  g.addColorStop(1, rgba(70, 55, 45, 0.28));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Pincements depuis les coins (plis de garnissage)
  ctx.lineCap = 'round';
  const pinch = (x0, y0, x1, y1, bend) => {
    const mx = (x0 + x1) / 2 + bend * (y1 - y0) * 0.18;
    const my = (y0 + y1) / 2 - bend * (x1 - x0) * 0.18;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  };
  const d = Math.min(b.w, b.h);
  ctx.strokeStyle = rgba(80, 62, 50, 0.22);
  ctx.lineWidth = Math.max(1, d * 0.018);
  const ix = b.w * 0.2;
  const iy = b.h * 0.2;
  pinch(b.x + b.w * 0.04, b.y + b.h * 0.05, b.x + ix, b.y + iy, 1);
  pinch(b.x + b.w * 0.96, b.y + b.h * 0.05, b.x + b.w - ix, b.y + iy, -1);
  pinch(b.x + b.w * 0.04, b.y + b.h * 0.95, b.x + ix, b.y + b.h - iy, -1);
  pinch(b.x + b.w * 0.96, b.y + b.h * 0.95, b.x + b.w - ix, b.y + b.h - iy, 1);

  // Liseré : couture ombrée juste à l'intérieur, arête du passepoil éclairée
  ctx.strokeStyle = rgba(70, 55, 45, 0.16);
  ctx.lineWidth = Math.max(2, d * 0.075);
  ctx.stroke(path);
  ctx.strokeStyle = rgba(70, 55, 45, 0.14);
  ctx.lineWidth = Math.max(1.5, d * 0.036);
  ctx.stroke(path);

  ctx.globalCompositeOperation = 'soft-light';
  ctx.strokeStyle = rgba(255, 255, 255, 0.6);
  ctx.lineWidth = Math.max(1.2, d * 0.022);
  ctx.stroke(path);

  // Reflet doux côté lumière
  g = ctx.createRadialGradient(cx + L * b.w * 0.2, cy - b.h * 0.2, 0, cx + L * b.w * 0.2, cy - b.h * 0.2, R * 0.75);
  g.addColorStop(0, rgba(255, 255, 255, 0.55));
  g.addColorStop(1, rgba(255, 255, 255, 0));
  ctx.fillStyle = g;
  ctx.fill(path);
}

/** Construit un dégradé horizontal de plis verticaux (crêtes claires / creux sombres). */
function foldGradient(ctx, x0, x1, seed, period, strength) {
  const r = rng(seed);
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const w = Math.max(1, x1 - x0);
  const n = Math.max(3, Math.round(w / period));
  const phases = [r() * TAU, r() * TAU, r() * TAU];
  const steps = Math.min(160, Math.max(12, Math.round(w / 5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let v = Math.sin(t * n * TAU + phases[0]) * 0.6 + Math.sin(t * n * 2.3 * TAU + phases[1]) * 0.28 + Math.sin(t * n * 0.45 * TAU + phases[2]) * 0.3;
    v = Math.max(-1, Math.min(1, v));
    if (v < 0) g.addColorStop(t, rgba(60, 45, 36, (-v * 0.32 * strength).toFixed(3)));
    else g.addColorStop(t, rgba(255, 255, 255, (v * 0.0).toFixed(3)));
  }
  return g;
}

/** Plis verticaux clairs (soft-light) complémentaires. */
function foldHighlights(ctx, x0, x1, seed, period, strength) {
  const r = rng(seed);
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const w = Math.max(1, x1 - x0);
  const n = Math.max(3, Math.round(w / period));
  const phases = [r() * TAU, r() * TAU, r() * TAU];
  const steps = Math.min(160, Math.max(12, Math.round(w / 5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let v = Math.sin(t * n * TAU + phases[0]) * 0.6 + Math.sin(t * n * 2.3 * TAU + phases[1]) * 0.28 + Math.sin(t * n * 0.45 * TAU + phases[2]) * 0.3;
    v = Math.max(0, Math.min(1, v));
    g.addColorStop(t, rgba(255, 255, 255, (v * 0.5 * strength).toFixed(3)));
  }
  return g;
}

function seedOf(b, o) {
  return o.seed != null ? o.seed : Math.round(b.x * 7.1 + b.y * 13.7 + b.w * 3.3);
}

/** Nappe : dessus clair et tendu, retombé à plis verticaux. */
function shadeTablecloth(ctx, path, b, o) {
  const topH = o.topH != null ? o.topH : b.h * 0.2;
  const yDrop = b.y + topH;
  const seed = seedOf(b, o);

  // Dessus : lumière douce
  ctx.globalCompositeOperation = 'soft-light';
  let g = ctx.createLinearGradient(b.x, b.y, b.x, yDrop);
  g.addColorStop(0, rgba(255, 255, 255, 0.25));
  g.addColorStop(1, rgba(255, 255, 255, 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, topH);

  // Retombé : plis (creux multiply + crêtes soft-light)
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = foldGradient(ctx, b.x, b.x + b.w, seed, 46, 1);
  ctx.fillRect(b.x, yDrop, b.w, b.h - topH);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = foldHighlights(ctx, b.x, b.x + b.w, seed, 46, 1);
  ctx.fillRect(b.x, yDrop, b.w, b.h - topH);

  // Ombre sous l'arête de la table, puis assombrissement vers l'ourlet et les côtés
  ctx.globalCompositeOperation = 'multiply';
  g = ctx.createLinearGradient(0, yDrop, 0, b.y + b.h);
  g.addColorStop(0, rgba(90, 72, 60, 0.42));
  g.addColorStop(0.06, rgba(150, 130, 115, 0.16));
  g.addColorStop(0.5, rgba(255, 255, 255, 0));
  g.addColorStop(0.92, rgba(150, 128, 110, 0.18));
  g.addColorStop(1, rgba(90, 72, 60, 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(b.x, yDrop, b.w, b.h - topH);
  sideShade(ctx, b, o, yDrop, 0.35);

  // Arête de la table (ligne de lumière)
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = rgba(255, 255, 255, 0.7);
  ctx.fillRect(b.x, yDrop - 1.5, b.w, 2.5);
}

/** Assombrit le côté opposé à la lumière (volume général). */
function sideShade(ctx, b, o, y0, amount) {
  const L = o.light;
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  const dark = rgba(70, 55, 45, amount);
  const clear = rgba(255, 255, 255, 0);
  if (L <= 0) {
    g.addColorStop(0, rgba(70, 55, 45, amount * 0.35));
    g.addColorStop(0.18, clear);
    g.addColorStop(0.7, clear);
    g.addColorStop(1, dark);
  } else {
    g.addColorStop(0, dark);
    g.addColorStop(0.3, clear);
    g.addColorStop(0.82, clear);
    g.addColorStop(1, rgba(70, 55, 45, amount * 0.35));
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(b.x, y0, b.w, b.y + b.h - y0);
}

/** Plaid drapé : larges plis obliques, bas plus sombre. */
function shadeThrow(ctx, path, b, o) {
  const seed = seedOf(b, o);
  const r = rng(seed);
  ctx.save();
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(((o.foldAngle != null ? o.foldAngle : 12) * Math.PI) / 180);
  const span = Math.hypot(b.w, b.h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = foldGradient(ctx, -span / 2, span / 2, seed, 34 + r() * 16, 1.25);
  ctx.fillRect(-span / 2, -span / 2, span, span);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = foldHighlights(ctx, -span / 2, span / 2, seed, 34 + r() * 16, 1.2);
  ctx.fillRect(-span / 2, -span / 2, span, span);
  ctx.restore();

  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, rgba(255, 255, 255, 0));
  g.addColorStop(0.6, rgba(200, 185, 170, 0.12));
  g.addColorStop(1, rgba(80, 62, 50, 0.38));
  ctx.fillStyle = g;
  ctx.fill(path);
  sideShade(ctx, b, o, b.y, 0.22);

  // Bord : très léger épaississement (lisière)
  ctx.strokeStyle = rgba(80, 62, 50, 0.22);
  ctx.lineWidth = 3;
  ctx.stroke(path);
}

/** Dessus-de-lit : dessus lumineux, retombé plissé, piqûres discrètes. */
function shadeBedspread(ctx, path, b, o) {
  const topH = o.topH != null ? o.topH : b.h;
  const seed = seedOf(b, o);
  const yDrop = b.y + topH;

  // Dessus : dégradé de lumière + ondulations douces (tissu posé)
  ctx.globalCompositeOperation = 'soft-light';
  let g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + topH);
  g.addColorStop(0, rgba(255, 255, 255, o.light < 0 ? 0.5 : 0.15));
  g.addColorStop(1, rgba(255, 255, 255, o.light < 0 ? 0.12 : 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, topH);

  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + topH / 2);
  ctx.rotate(-0.12);
  const span = Math.hypot(b.w, topH);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = foldGradient(ctx, -span / 2, span / 2, seed, 120, 0.45);
  ctx.fillRect(-span / 2, -topH / 2 - 20, span, topH + 40);
  ctx.restore();

  if (topH < b.h - 1) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = foldGradient(ctx, b.x, b.x + b.w, seed + 7, 44, 1);
    ctx.fillRect(b.x, yDrop, b.w, b.h - topH);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = foldHighlights(ctx, b.x, b.x + b.w, seed + 7, 44, 0.9);
    ctx.fillRect(b.x, yDrop, b.w, b.h - topH);
    ctx.globalCompositeOperation = 'multiply';
    g = ctx.createLinearGradient(0, yDrop, 0, b.y + b.h);
    g.addColorStop(0, rgba(80, 64, 52, 0.4));
    g.addColorStop(0.12, rgba(160, 140, 124, 0.14));
    g.addColorStop(1, rgba(90, 72, 60, 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(b.x, yDrop, b.w, b.h - topH);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rgba(255, 255, 255, 0.65);
    ctx.fillRect(b.x, yDrop - 2, b.w, 3);
  }
  sideShade(ctx, b, o, b.y, o.drop ? 0.4 : 0.18);
}

/** Pouf cylindrique : dessus (ellipse) clair, corps modelé, capiton central. */
function shadePouf(ctx, path, b, o) {
  const topH = o.topH != null ? o.topH : b.h * 0.34;
  const L = o.light;
  ctx.globalCompositeOperation = 'multiply';
  let g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, rgba(80, 62, 50, L < 0 ? 0.22 : 0.5));
  g.addColorStop(L < 0 ? 0.3 : 0.7, rgba(255, 255, 255, 0));
  g.addColorStop(1, rgba(80, 62, 50, L < 0 ? 0.5 : 0.22));
  ctx.fillStyle = g;
  ctx.fill(path);

  g = ctx.createLinearGradient(0, b.y + topH * 0.5, 0, b.y + b.h);
  g.addColorStop(0, rgba(255, 255, 255, 0));
  g.addColorStop(0.75, rgba(200, 185, 170, 0.1));
  g.addColorStop(1, rgba(70, 55, 45, 0.45));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Dessus
  const cx = b.x + b.w / 2;
  const ty = b.y + topH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, ty, b.w / 2 - 1, topH / 2, 0, 0, TAU);
  ctx.clip();
  ctx.globalCompositeOperation = 'soft-light';
  g = ctx.createRadialGradient(cx + L * b.w * 0.15, ty - topH * 0.2, 0, cx, ty, b.w / 2);
  g.addColorStop(0, rgba(255, 255, 255, 0.75));
  g.addColorStop(1, rgba(255, 255, 255, 0.15));
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, topH);
  // Plis rayonnants vers le capiton
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(90, 70, 58, 0.22);
  ctx.lineWidth = Math.max(1, b.w * 0.008);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, ty);
    ctx.lineTo(cx + Math.cos(a) * b.w * 0.5, ty + Math.sin(a) * topH * 0.5);
    ctx.stroke();
  }
  // Capiton
  g = ctx.createRadialGradient(cx, ty, 0, cx, ty, b.w * 0.07);
  g.addColorStop(0, rgba(60, 45, 36, 0.55));
  g.addColorStop(1, rgba(60, 45, 36, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - b.w * 0.1, ty - topH * 0.4, b.w * 0.2, topH * 0.8);
  ctx.restore();

  // Arête du dessus (couture)
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(80, 62, 50, 0.35);
  ctx.lineWidth = Math.max(1.2, b.w * 0.012);
  ctx.beginPath();
  ctx.ellipse(cx, ty + 1, b.w / 2 - 1, topH / 2, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.strokeStyle = rgba(255, 255, 255, 0.6);
  ctx.beginPath();
  ctx.ellipse(cx, ty + 3, b.w / 2 - 2, topH / 2, 0, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

/** Aplat : léger modelé vertical et ombre de bord. */
function shadeFlat(ctx, path, b, o) {
  ctx.globalCompositeOperation = 'soft-light';
  let g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  g.addColorStop(0, rgba(255, 255, 255, 0.35));
  g.addColorStop(1, rgba(255, 255, 255, 0));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.globalCompositeOperation = 'multiply';
  g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  g.addColorStop(0, rgba(255, 255, 255, 0));
  g.addColorStop(1, rgba(80, 62, 50, 0.22));
  ctx.fillStyle = g;
  ctx.fill(path);
  sideShade(ctx, b, o, b.y, 0.15);
}

const SHADERS = {
  cushion: shadeCushion,
  tablecloth: shadeTablecloth,
  throw: shadeThrow,
  bedspread: shadeBedspread,
  pouf: shadePouf,
  flat: shadeFlat,
};

/**
 * Remplit `path2D` avec le tissu puis applique l'ombrage propre au type d'objet.
 * Tous les calques sont clipés au chemin ; l'état du contexte est restauré.
 */
export function paintTextile(ctx, path2D, {
  texture = null,
  fallbackColor = '#E9DFCF',
  kind = 'flat',
  bounds,
  scale = 110,
  rotation = 0,
  light = -0.6,
  squash = 1,
  topH,
  seed,
  foldAngle,
  drop,
} = {}) {
  if (!ctx || !path2D) return;
  const b = bounds || { x: 0, y: 0, w: 100, h: 100 };
  ctx.save();
  ctx.clip(path2D);

  // 1. Tissu (motif) ou couleur de repli
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = fallbackColor;
  ctx.fill(path2D);
  const pat = texture ? makePattern(ctx, texture, b, scale, rotation, squash) : null;
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fill(path2D);
  }

  // 2. Ombrage volumique
  const shade = SHADERS[kind] || shadeFlat;
  shade(ctx, path2D, b, { light, topH, seed, foldAngle, drop });

  ctx.restore();
}

export default paintTextile;
