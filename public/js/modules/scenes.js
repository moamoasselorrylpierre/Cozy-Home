/**
 * scenes.js — les 10 décors du configurateur « Cozy Home by Fany ».
 *
 * Illustrations en élévation frontale (perspective centrale douce), dessinées en Canvas 2D
 * dans un espace logique 1600 × 1000. Le ctx reçu est déjà mis à l'échelle par l'hôte.
 *
 * Ordre des calques pour chaque décor :
 *   plafond + mur → fenêtre → sol → déco murale → api.drawCurtains(spec) → mobilier → étalonnage final.
 *
 * Les textures coûteuses (bruits, parquets, tapis, végétaux touffus, vue extérieure) sont générées
 * une seule fois puis mises en cache au niveau du module.
 */
import { paintTextile as basePaintTextile } from './textile.js';

/* ================================================================== */
/* Constantes de projection                                            */
/* ================================================================== */

export const SCENE_WIDTH = 1600;
export const SCENE_HEIGHT = 1000;

const W = SCENE_WIDTH;
const H = SCENE_HEIGHT;
const HZ = 430; // ligne d'horizon (hauteur des yeux ≈ 1,30 m)
const VX = 800; // abscisse du point de fuite
const CAM = 1500; // distance caméra → mur du fond (px logiques)
const FL = 820; // jonction mur / sol
const TAU = Math.PI * 2;

/** Facteur d'échelle d'un plan situé à la profondeur z (z > 0 : vers l'observateur). */
const sc = (z) => CAM / (CAM - z);
const pX = (x, z) => VX + (x - VX) * sc(z);
const pY = (y, z) => HZ + (y - HZ) * sc(z);
/** Profondeur du sol visible à l'ordonnée écran y. */
const zAtY = (y) => CAM * (1 - (FL - HZ) / (y - HZ));
const Z_MAX = Math.ceil(zAtY(H)) + 4;

/** Exécute fn dans le repère d'un plan frontal situé à la profondeur z. */
function atDepth(ctx, z, fn) {
  const s = sc(z);
  ctx.save();
  ctx.translate(VX * (1 - s), HZ * (1 - s));
  ctx.scale(s, s);
  fn(s);
  ctx.restore();
}

/* ================================================================== */
/* Utilitaires : hasard, couleurs, dégradés, chemins                   */
/* ================================================================== */

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

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(a) {
  return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}
/** Assombrit vers un brun chaud (ombres plus naturelles que le noir). */
const dk = (c, t) => mix(c, '#231a14', t);
/** Éclaircit vers un blanc chaud. */
const lt = (c, t) => mix(c, '#fffaf2', t);
function rgba(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
/** Petite variation aléatoire d'une couleur. */
function jitter(c, r, amt) {
  const v = (r() - 0.5) * 2 * amt;
  return v > 0 ? lt(c, v) : dk(c, -v);
}

function lg(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function rg(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Rectangle arrondi (rayons indépendants possibles). */
function rrPath(x, y, w, h, r, p = new Path2D()) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  const m = Math.min(w, h) / 2;
  const tl = Math.min(a, m);
  const tr = Math.min(b, m);
  const br = Math.min(c, m);
  const bl = Math.min(d, m);
  p.moveTo(x + tl, y);
  p.lineTo(x + w - tr, y);
  p.arcTo(x + w, y, x + w, y + tr, tr);
  p.lineTo(x + w, y + h - br);
  p.arcTo(x + w, y + h, x + w - br, y + h, br);
  p.lineTo(x + bl, y + h);
  p.arcTo(x, y + h, x, y + h - bl, bl);
  p.lineTo(x, y + tl);
  p.arcTo(x, y, x + tl, y, tl);
  p.closePath();
  return p;
}

function polyPath(pts, p = new Path2D()) {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function ellipsePath(cx, cy, rx, ry, p = new Path2D()) {
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  return p;
}

/** Points d'un rectangle arrondi (pour les enveloppes convexes). */
function rrPoints(x, y, w, h, r, n = 5) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corners = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Enveloppe convexe (chaîne monotone). */
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

const proj = (pts, z) => pts.map(([x, y]) => [pX(x, z), pY(y, z)]);

/* ================================================================== */
/* Caches (module) : canevas hors écran, bruits, sprites                */
/* ================================================================== */

const CACHE = new Map();

/** Options des contextes hors écran : rastérisation CPU (rapide pour les caches, évite le GL logiciel). */
const CTX_OPTS = { willReadFrequently: true };
const ctx2d = (c) => c.getContext('2d', CTX_OPTS);

function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** Canevas généré une seule fois (draw reçoit le contexte, déjà mis à l'échelle res). */
function cached(key, w, h, draw, res = 1) {
  key = key + '@' + res;
  let c = CACHE.get(key);
  if (!c) {
    c = makeCanvas(w * res, h * res);
    const g = ctx2d(c);
    g.scale(res, res);
    draw(g, w, h);
    c.__res = res;
    CACHE.set(key, c);
  }
  return c;
}

/**
 * Échelle de rendu courante (px appareil par px logique), fixée par drawDecor : les textures et
 * sprites mis en cache sont générés à la résolution utile (rapide en vignette, net en plein écran).
 */
let RS = 1;
const qres = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v * 4) / 4));
const floorRes = () => qres(RS * 1.6, 0.5, 1.25);
const spriteRes = () => qres(RS * 2, 0.75, 2);
const rugRes = () => qres(RS * 1.3, 0.5, 1.25);
const rugCached = (key, w, h, draw) => cached(key, w, h, draw, rugRes());

/** Bruit de valeur périodique (raccordable), fbm, valeurs 0..1. */
function periodicNoise(size, cells, octaves, seed, persistence = 0.5) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  const i0 = new Int32Array(size);
  const i1 = new Int32Array(size);
  const fr = new Float32Array(size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = r() * amp;
    const step = size / n;
    // indices et poids précalculés (identiques en x et en y)
    for (let k = 0; k < size; k++) {
      const gk = k / step;
      const a = Math.floor(gk);
      const f = gk - a;
      i0[k] = a % n;
      i1[k] = (a + 1) % n;
      fr[k] = f * f * (3 - 2 * f);
    }
    for (let y = 0; y < size; y++) {
      const ry0 = i0[y] * n;
      const ry1 = i1[y] * n;
      const fy = fr[y];
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const x0 = i0[x];
        const x1 = i1[x];
        const fx = fr[x];
        const a = lat[ry0 + x0] + (lat[ry0 + x1] - lat[ry0 + x0]) * fx;
        const b = lat[ry1 + x0] + (lat[ry1 + x1] - lat[ry1 + x0]) * fx;
        out[row + x] += a + (b - a) * fy;
      }
    }
    total += amp;
    amp *= persistence;
  }
  const inv = 1 / total;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

/** Tuile de bruit en niveaux de gris (128 = neutre pour soft-light / overlay). */
function noiseTile(key, size, cells, octaves, contrast, seed, fine = 0) {
  return cached('noise:' + key, size, size, (g) => {
    const v = periodicNoise(size, cells, octaves, seed);
    const r = rng(seed + 99);
    const img = g.createImageData(size, size);
    for (let i = 0; i < v.length; i++) {
      const n = 128 + (v[i] - 0.5) * 255 * contrast + (r() - 0.5) * fine;
      const c = Math.max(0, Math.min(255, n));
      img.data[i * 4] = c;
      img.data[i * 4 + 1] = c;
      img.data[i * 4 + 2] = c;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

/** Applique une tuile de bruit sur un chemin (texture fine). */
function texturize(ctx, path, tile, alpha, mode = 'soft-light', scale = 1, ox = 0, oy = 0) {
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  if (scale !== 1 || ox || oy) {
    if (typeof pat.setTransform === 'function') pat.setTransform(new DOMMatrix().translate(ox, oy).scale(scale));
  }
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  if (path) ctx.fill(path);
  else ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Grandes nuées douces (non périodiques), étirées sur une zone. */
function cloudsCanvas(key, w, h, cells, seed, contrast = 1) {
  return cached('clouds:' + key, w, h, (g) => {
    const size = Math.max(w, h);
    const v = periodicNoise(size, cells, 3, seed, 0.55);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = 128 + (v[y * size + x] - 0.5) * 255 * contrast;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, n));
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/**
 * Calques statiques mis en cache à la résolution de l'appareil.
 * Tout ce qui ne dépend ni des rideaux ni des tissus (mur, fenêtre, sol, meubles…) est dessiné une fois
 * dans un canevas hors écran à l'échelle courante du ctx, puis recopié : un redessin coûte quelques drawImage.
 * Cache LRU borné en nombre de pixels.
 */
const LAYERS = new Map();
const LAYER_BUDGET = 22e6; // pixels (~88 Mo)
let layerPixels = 0;
const FULL = [0, 0, W, H];

function layer(ctx, key, box, draw) {
  const m = ctx.getTransform();
  // Transformation non triviale (rotation) : pas de cache
  if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || !(m.a > 0) || !(m.d > 0)) {
    ctx.save();
    draw(ctx);
    ctx.restore();
    return;
  }
  const sx = m.a;
  const sy = m.d;
  const k = `${key}@${sx.toFixed(4)}x${sy.toFixed(4)}`;
  let L = LAYERS.get(k);
  if (L) {
    LAYERS.delete(k);
    LAYERS.set(k, L);
  } else {
    const [bx, by, bw, bh] = box;
    const dx0 = Math.floor(bx * sx);
    const dy0 = Math.floor(by * sy);
    const dx1 = Math.ceil((bx + bw) * sx);
    const dy1 = Math.ceil((by + bh) * sy);
    const c = makeCanvas(dx1 - dx0, dy1 - dy0);
    const g = ctx2d(c);
    g.setTransform(sx, 0, 0, sy, -dx0, -dy0);
    g.imageSmoothingEnabled = true;
    draw(g);
    L = { c, dx0, dy0, px: c.width * c.height };
    LAYERS.set(k, L);
    layerPixels += L.px;
    for (const [kk, v] of LAYERS) {
      if (layerPixels <= LAYER_BUDGET || kk === k) break;
      LAYERS.delete(kk);
      layerPixels -= v.px;
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, m.e, m.f);
  ctx.drawImage(L.c, L.dx0, L.dy0);
  ctx.restore();
}

/** Vide les caches de calques (ex. après un changement de taille important). */
export function clearDecorCache() {
  LAYERS.clear();
  layerPixels = 0;
}

/* ================================================================== */
/* Ombres douces                                                        */
/* ================================================================== */

/** Dessine uniquement l'ombre floutée d'un chemin (flou exprimé en px logiques). */
function blurShape(ctx, path, color, blur, dx = 0, dy = 0) {
  const m = ctx.getTransform();
  const OFF = 12000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * Math.hypot(m.a, m.b);
  ctx.shadowOffsetX = (OFF + dx) * m.a + dy * m.c;
  ctx.shadowOffsetY = (OFF + dx) * m.b + dy * m.d;
  ctx.translate(-OFF, 0);
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}

/** Ombre elliptique très douce (dégradé radial), en coordonnées écran. */
function softEllipse(ctx, cx, cy, rx, ry, color, a) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = rg(ctx, 0, 0, 0, 0, 0, rx, [
    [0, rgba(color, a)],
    [0.5, rgba(color, a * 0.55)],
    [1, rgba(color, 0)],
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const SHADOW = '#2a1d14';

/** Ombre de contact au sol d'une emprise [x0,x1]×[z0,z1] (monde). */
function floorShadow(ctx, x0, x1, z0, z1, a = 0.35, blur = 14) {
  const pts = [
    [pX(x0, z0), pY(FL, z0)],
    [pX(x1, z0), pY(FL, z0)],
    [pX(x1, z1), pY(FL, z1)],
    [pX(x0, z1), pY(FL, z1)],
  ];
  blurShape(ctx, polyPath(pts), rgba(SHADOW, a), blur);
}

/* ================================================================== */
/* Volumes en perspective                                              */
/* ================================================================== */

/**
 * Extrusion d'un rectangle arrondi entre les profondeurs z0 (fond) et z1 (face avant).
 * side/top : styles des flancs et du dessus ; front : style ou fonction (ctx, path) dans le repère de z1.
 */
function prism(ctx, o) {
  const { x, y, w, h, r = 0, z0, z1 } = o;
  const pts = rrPoints(x, y, w, h, r, r > 0 ? 5 : 0);
  const back = proj(pts, z0);
  const front = proj(pts, z1);
  const hp = polyPath(hull(back.concat(front)));
  const side = typeof o.side === 'function' ? o.side(hp) : o.side;
  ctx.fillStyle = side || '#999';
  ctx.fill(hp);
  // Dessus visible (sous l'horizon) ou dessous (au-dessus de l'horizon)
  if (o.top && y > HZ) {
    const q = polyPath([
      [pX(x + r * 0.3, z0), pY(y, z0)],
      [pX(x + w - r * 0.3, z0), pY(y, z0)],
      [pX(x + w - r * 0.3, z1), pY(y + r * 0.5, z1)],
      [pX(x + r * 0.3, z1), pY(y + r * 0.5, z1)],
    ]);
    ctx.save();
    ctx.clip(hp);
    ctx.fillStyle = typeof o.top === 'function' ? o.top(pY(y, z0), pY(y + r, z1)) : o.top;
    ctx.fill(q);
    ctx.restore();
  }
  if (o.front) {
    atDepth(ctx, z1, () => {
      const fp = rrPath(x, y, w, h, r);
      if (typeof o.front === 'function') o.front(fp);
      else {
        ctx.fillStyle = o.front;
        ctx.fill(fp);
      }
    });
  }
  return hp;
}

/** Cylindre posé (axe vertical) : centre cx, profondeur zc, rayon rad, de yTop à yBot. */
function cylinder(ctx, o) {
  const { cx, zc, rad, yTop, yBot } = o;
  const s = sc(zc);
  const X = pX(cx, zc);
  const rx = rad * s;
  const top = pY(yTop, zc);
  const bot = pY(yBot, zc);
  const ryT = Math.abs(pY(yTop, zc - rad) - pY(yTop, zc + rad)) / 2;
  const ryB = Math.abs(pY(yBot, zc - rad) - pY(yBot, zc + rad)) / 2;
  const body = new Path2D();
  body.moveTo(X - rx, top);
  body.lineTo(X - rx, bot);
  body.ellipse(X, bot, rx, Math.max(ryB, 0.1), 0, Math.PI, 0, true);
  body.lineTo(X + rx, top);
  body.closePath();
  ctx.fillStyle = typeof o.side === 'function' ? o.side(X - rx, X + rx) : o.side;
  ctx.fill(body);
  const tp = ellipsePath(X, top, rx, Math.max(ryT, 0.1));
  if (yTop > HZ) {
    ctx.fillStyle = typeof o.top === 'function' ? o.top(X, top, rx, ryT) : o.top || o.side;
    ctx.fill(tp);
  }
  return { X, rx, top, bot, ryT, ryB, body, tp };
}

/* ================================================================== */
/* Pièce : plafond, mur, plinthe                                        */
/* ================================================================== */

/**
 * o.wall : couleur ; o.ceilingColor ; o.ceilY (ligne plafond) ; o.tex : 'plaster'|'limewash'|'concrete'|'smooth'
 * o.glow : {x, y, r, a} halo de lumière de la fenêtre sur le mur
 */
function drawRoom(ctx, o) {
  const ceilY = o.ceilY ?? 40;
  const wall = o.wall;
  // Plafond (vu légèrement par en dessous)
  const ceil = o.ceilingColor || lt(wall, 0.35);
  ctx.fillStyle = lg(ctx, 0, 0, 0, ceilY, [
    [0, dk(ceil, 0.1)],
    [1, dk(ceil, 0.03)],
  ]);
  ctx.fillRect(0, 0, W, ceilY + 1);
  // Mur
  const wallPath = new Path2D();
  wallPath.rect(0, ceilY, W, FL - ceilY);
  ctx.fillStyle = lg(ctx, 0, ceilY, 0, FL, [
    [0, dk(wall, 0.05)],
    [0.45, wall],
    [1, dk(wall, 0.04)],
  ]);
  ctx.fill(wallPath);

  const tex = o.tex || 'plaster';
  if (tex !== 'smooth') {
    const clouds = cloudsCanvas('wall-' + tex, 200, 100, 3, 17, tex === 'limewash' ? 1.4 : tex === 'concrete' ? 1.1 : 0.8);
    ctx.save();
    ctx.clip(wallPath);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = tex === 'limewash' ? 0.55 : tex === 'concrete' ? 0.5 : 0.28;
    ctx.drawImage(clouds, 0, ceilY, W, FL - ceilY);
    ctx.restore();
    const fine = tex === 'concrete' ? noiseTile('plaster-c', 128, 16, 2, 0.35, 5, 34) : noiseTile('plaster', 128, 4, 3, 0.55, 5, 18);
    texturize(ctx, wallPath, fine, tex === 'concrete' ? 0.5 : 0.35);
  }
  // Halo de lumière autour de la fenêtre
  if (o.glow) {
    const { x, y, r, a = 0.35 } = o.glow;
    ctx.save();
    ctx.clip(wallPath);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rg(ctx, x, y, 0, x, y, r, [
      [0, `rgba(255,250,236,${a})`],
      [0.6, `rgba(255,250,236,${a * 0.35})`],
      [1, 'rgba(255,250,236,0)'],
    ]);
    ctx.fillRect(0, ceilY, W, FL - ceilY);
    ctx.restore();
  }
  // Occlusion ambiante : angle plafond, angles latéraux, pied de mur
  ctx.save();
  ctx.clip(wallPath);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = lg(ctx, 0, ceilY, 0, ceilY + 90, [
    [0, 'rgba(120,100,85,0.35)'],
    [1, 'rgba(120,100,85,0)'],
  ]);
  ctx.fillRect(0, ceilY, W, 90);
  ctx.fillStyle = lg(ctx, 0, 0, W, 0, [
    [0, 'rgba(110,92,78,0.3)'],
    [0.12, 'rgba(110,92,78,0)'],
    [0.88, 'rgba(110,92,78,0)'],
    [1, 'rgba(110,92,78,0.3)'],
  ]);
  ctx.fillRect(0, ceilY, W * 0.12, FL - ceilY);
  ctx.fillRect(W * 0.88, ceilY, W * 0.12, FL - ceilY);
  ctx.restore();

  if (o.cornice) drawCornice(ctx, ceilY, o.cornice);
  if (o.baseboard !== false) drawBaseboard(ctx, o.baseboard || {});
  return wallPath;
}

/** Corniche moulurée sous le plafond. */
function drawCornice(ctx, ceilY, o) {
  const h = o.h || 40;
  const c = o.color || '#EFEBE3';
  const y = ceilY;
  ctx.fillStyle = lg(ctx, 0, y, 0, y + h, [
    [0, dk(c, 0.12)],
    [0.18, lt(c, 0.4)],
    [0.3, dk(c, 0.1)],
    [0.45, lt(c, 0.3)],
    [0.62, dk(c, 0.18)],
    [0.7, c],
    [0.85, lt(c, 0.25)],
    [1, dk(c, 0.22)],
  ]);
  ctx.fillRect(0, y, W, h);
  blurShape(ctx, rrPath(0, y + h - 4, W, 6, 0), 'rgba(60,45,35,0.25)', 6, 0, 4);
}

function drawBaseboard(ctx, o) {
  const h = o.h ?? 26;
  const c = o.color || '#F1ECE3';
  const y = FL - h;
  blurShape(ctx, rrPath(0, y, W, 4, 0), 'rgba(60,45,35,0.18)', 4, 0, -2);
  ctx.fillStyle = lg(ctx, 0, y, 0, FL, [
    [0, lt(c, 0.5)],
    [0.12, c],
    [0.2, dk(c, 0.08)],
    [0.3, lt(c, 0.15)],
    [1, dk(c, 0.1)],
  ]);
  ctx.fillRect(0, y, W, h);
}

/* ================================================================== */
/* Vue extérieure (floue, lumineuse)                                    */
/* ================================================================== */

/** Floute un canevas par réductions / agrandissements successifs. */
function softenCanvas(c, factor) {
  const small = makeCanvas(c.width / factor, c.height / factor);
  const g = ctx2d(small);
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, small.width, small.height);
  const cg = ctx2d(c);
  cg.save();
  cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.imageSmoothingQuality = 'high';
  cg.clearRect(0, 0, c.width, c.height);
  cg.drawImage(small, 0, 0, c.width, c.height);
  cg.restore();
}

function blob(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
}

/** Houppier arrondi fait de lobes (arbres lointains). */
function canopy(g, r, x, y, w, h, base, light) {
  const n = 22 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    const px = x + Math.cos(a) * w * 0.38 * d;
    const py = y + Math.sin(a) * h * 0.36 * d;
    blob(g, px, py, w * (0.1 + r() * 0.1), h * (0.1 + r() * 0.08), mix(base, dk(base, 0.2), (py - y + h * 0.4) / (h * 0.8) * 0.8));
  }
  for (let i = 0; i < 12; i++) {
    blob(g, x - w * 0.14 + (r() - 0.5) * w * 0.45, y - h * 0.18 + (r() - 0.5) * h * 0.3, w * 0.07, h * 0.06, light);
  }
}

/**
 * Vue par la fenêtre, en coordonnées écran (dessinée à mi-résolution puis adoucie).
 * kind : 'garden' | 'park' | 'riad' | 'city' | 'tropical'
 */
function viewCanvas(kind) {
  return cached('view:' + kind, 480, 300, (g) => {
    g.scale(0.3, 0.3);
    const r = rng(hashStr(kind));
    const warm = kind === 'riad' || kind === 'tropical';
    // Ciel
    g.fillStyle = lg(g, 0, 0, 0, HZ + 60, [
      [0, warm ? '#BFD5E3' : '#C3D7E4'],
      [0.55, warm ? '#DDE7EA' : '#DCE7EC'],
      [0.9, warm ? '#F4EEE2' : '#EEF1EC'],
      [1, '#F5F1E7'],
    ]);
    g.fillRect(0, 0, W, H);
    // Nuages
    for (let i = 0; i < 16; i++) {
      const cx = r() * W;
      const cy = 60 + r() * 260;
      for (let k = 0; k < 5; k++) blob(g, cx + (r() - 0.5) * 160, cy + (r() - 0.5) * 30, 60 + r() * 90, 18 + r() * 22, 'rgba(255,255,255,0.35)');
    }
    // Halo du soleil
    g.fillStyle = rg(g, 360, 140, 0, 360, 140, 520, [
      [0, 'rgba(255,251,238,0.85)'],
      [1, 'rgba(255,251,238,0)'],
    ]);
    g.fillRect(0, 0, W, H);

    if (kind === 'city') {
      // Façades lointaines, très claires
      for (let i = 0; i < 14; i++) {
        const x = i * 120 + r() * 40 - 40;
        const top = HZ - 140 - r() * 160;
        g.fillStyle = mix('#E9E2D6', '#CFD8DE', r() * 0.6);
        g.fillRect(x, top, 110 + r() * 40, H);
        g.fillStyle = 'rgba(160,170,178,0.25)';
        for (let yy = top + 20; yy < HZ + 200; yy += 34) for (let xx = x + 12; xx < x + 100; xx += 26) g.fillRect(xx, yy, 12, 18);
      }
      g.fillStyle = '#D9DCD6';
      g.fillRect(0, HZ + 60, W, H);
    } else {
      // Collines / rideau d'arbres lointains
      g.fillStyle = warm ? '#C9CDB8' : '#B8C8BF';
      g.beginPath();
      g.moveTo(0, HZ);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, HZ - 30 - Math.sin(x * 0.006 + 1) * 18 - r() * 20);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.fill();
      // Arbres intermédiaires
      const trees = kind === 'park' ? 11 : 8;
      for (let i = 0; i < trees; i++) {
        const x = kind === 'park' ? 60 + i * 150 + (r() - 0.5) * 20 : r() * W;
        const w = kind === 'park' ? 150 : 150 + r() * 200;
        const h = kind === 'park' ? 190 : 170 + r() * 150;
        const y = HZ - h * 0.35 - r() * 30;
        g.fillStyle = '#9FA894';
        g.fillRect(x - 5, y, 10, h * 0.8);
        const base = warm ? mix('#9DB08A', '#B3BE92', r()) : mix('#9DB39A', '#AFC0A2', r());
        canopy(g, r, x, y, w, h, base, lt(base, 0.35));
      }
      if (kind === 'riad' || kind === 'tropical') {
        // Palmiers
        for (let i = 0; i < 3; i++) {
          const x = 300 + i * 480 + r() * 120;
          const top = HZ - 260 - r() * 80;
          g.strokeStyle = '#B5AA92';
          g.lineWidth = 10;
          g.beginPath();
          g.moveTo(x, HZ + 80);
          g.quadraticCurveTo(x + 20, (top + HZ) / 2, x + 8, top);
          g.stroke();
          g.strokeStyle = '#8FA57F';
          g.lineWidth = 9;
          for (let k = 0; k < 9; k++) {
            const a = -Math.PI / 2 + (k / 8 - 0.5) * 3.2;
            g.beginPath();
            g.moveTo(x + 8, top);
            g.quadraticCurveTo(x + 8 + Math.cos(a) * 90, top + Math.sin(a) * 60 - 20, x + 8 + Math.cos(a) * 170, top + Math.sin(a) * 60 + 50);
            g.stroke();
          }
        }
      }
      if (kind === 'riad') {
        // Mur blanc cassé en face + bougainvillier
        g.fillStyle = '#EFE3CF';
        g.fillRect(0, HZ + 20, W, H);
        for (let i = 0; i < 40; i++) blob(g, r() * W, HZ + 10 + r() * 90, 20 + r() * 30, 12 + r() * 16, r() > 0.5 ? 'rgba(214,120,150,0.45)' : 'rgba(150,170,120,0.5)');
      } else {
        // Pelouse, haie
        g.fillStyle = lg(g, 0, HZ, 0, H, [
          [0, warm ? '#C8D2A6' : '#C4D3AE'],
          [1, warm ? '#B4C28E' : '#B1C49A'],
        ]);
        g.fillRect(0, HZ + 18, W, H);
        g.fillStyle = kind === 'park' ? '#E6DECD' : 'rgba(150,172,130,0.8)';
        if (kind === 'park') {
          g.beginPath();
          g.moveTo(VX - 40, HZ + 18);
          g.lineTo(VX + 40, HZ + 18);
          g.lineTo(VX + 600, H);
          g.lineTo(VX - 600, H);
          g.fill();
        } else {
          g.fillStyle = 'rgba(150,172,132,0.55)';
          g.beginPath();
          g.moveTo(0, HZ + 90);
          for (let x = 0; x <= W; x += 30) g.lineTo(x, HZ + 58 - Math.sin(x * 0.02) * 4 - r() * 5);
          g.lineTo(W, HZ + 95);
          g.closePath();
          g.fill();
        }
      }
    }
    // Voile atmosphérique (garde le vitrage très lumineux)
    g.fillStyle = lg(g, 0, 0, 0, H, [
      [0, 'rgba(255,255,255,0.18)'],
      [0.42, 'rgba(255,252,244,0.42)'],
      [0.6, 'rgba(255,252,244,0.3)'],
      [1, 'rgba(255,252,244,0.2)'],
    ]);
    g.fillRect(0, 0, W, H);
  });
}

function getView(kind) {
  const key = 'viewsoft:' + kind;
  if (!CACHE.has(key)) {
    const c = viewCanvas(kind);
    softenCanvas(c, 2);
    CACHE.set(key, c);
  }
  return CACHE.get(key);
}

/* ================================================================== */
/* Fenêtres                                                            */
/* ================================================================== */

/**
 * Dessine une baie (tableau, vitrage, menuiserie, appui) SANS rideaux.
 * o : { frame, depth, reveal, leaves, rows, cols, transom, fw, sw, bar, view, sill, shape, casing }
 */
function drawWindow(ctx, win, o = {}) {
  const { x, y, w, h } = win;
  const depth = o.depth ?? 28;
  const zi = -depth;
  const reveal = o.reveal || '#EDE6DA';
  const shape = o.shape || 'rect';
  const outer = shape === 'horseshoe' ? horseshoePath(x, y, w, h) : rrPath(x, y, w, h, 0);

  // Chambranle (moulure autour de l'ouverture)
  if (o.casing) drawCasing(ctx, win, o.casing, shape);

  ctx.save();
  ctx.clip(outer);
  // Tableaux (épaisseur du mur) : éclairés par le jour, plus sombres en haut
  const ix0 = pX(x, zi);
  const ix1 = pX(x + w, zi);
  const iy0 = pY(y, zi);
  const iy1 = pY(y + h, zi);
  ctx.fillStyle = reveal;
  ctx.fill(outer);
  const quad = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.fill(polyPath(pts));
  };
  if (shape === 'rect') {
    quad([[x, y], [x + w, y], [ix1, iy0], [ix0, iy0]], lg(ctx, 0, y, 0, iy0, [[0, dk(reveal, 0.22)], [1, dk(reveal, 0.1)]]));
    quad([[x, y], [ix0, iy0], [ix0, iy1], [x, y + h]], lg(ctx, x, 0, ix0, 0, [[0, dk(reveal, 0.08)], [1, lt(reveal, 0.25)]]));
    quad([[x + w, y], [ix1, iy0], [ix1, iy1], [x + w, y + h]], lg(ctx, x + w, 0, ix1, 0, [[0, dk(reveal, 0.12)], [1, lt(reveal, 0.15)]]));
    quad([[x, y + h], [x + w, y + h], [ix1, iy1], [ix0, iy1]], lg(ctx, 0, y + h, 0, iy1, [[0, lt(reveal, 0.2)], [1, lt(reveal, 0.5)]]));
  } else {
    ctx.fillStyle = lg(ctx, 0, y, 0, y + h, [[0, dk(reveal, 0.2)], [0.5, dk(reveal, 0.05)], [1, lt(reveal, 0.3)]]);
    ctx.fill(outer);
  }
  // Vitrage + menuiserie dans le plan du fond du tableau
  atDepth(ctx, zi, () => {
    const inner = shape === 'horseshoe' ? horseshoePath(x, y, w, h) : rrPath(x, y, w, h, 0);
    drawGlazing(ctx, win, inner, o);
  });
  // Lumière qui « bave » sur l'arête intérieure du tableau
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(255,250,240,0.22)';
  ctx.lineWidth = 6;
  atDepth(ctx, zi, () => ctx.stroke(shape === 'horseshoe' ? horseshoePath(x, y, w, h) : rrPath(x, y, w, h, 0)));
  ctx.restore();

  // Appui / tablette
  if (o.sill !== false) {
    const s = o.sill || {};
    const over = s.over ?? 22;
    const th = s.h ?? 14;
    const col = s.color || lt(reveal, 0.2);
    const sz = s.depth ?? 26;
    blurShape(ctx, rrPath(x - over, y + h, w + over * 2, th + 4, 2), 'rgba(50,38,30,0.28)', 10, 0, 8);
    prism(ctx, {
      x: x - over, y: y + h, w: w + over * 2, h: th, r: 2, z0: 0, z1: sz,
      side: dk(col, 0.12),
      top: lg(ctx, 0, pY(y + h, 0), 0, pY(y + h, sz), [[0, lt(col, 0.35)], [1, lt(col, 0.1)]]),
      front: lg(ctx, 0, y + h, 0, y + h + th, [[0, lt(col, 0.2)], [1, dk(col, 0.12)]]),
    });
  }
}

function horseshoePath(x, y, w, h, p = new Path2D()) {
  const R = (w / 2) * 1.16;
  const d = Math.sqrt(R * R - (w / 2) * (w / 2));
  const cx = x + w / 2;
  const ys = y + R + d; // ligne de naissance
  const yc = ys - d;
  const phi = Math.atan2(d, w / 2);
  p.moveTo(x, y + h);
  p.lineTo(x, ys);
  p.arc(cx, yc, R, Math.PI - phi, phi, false);
  p.lineTo(x + w, y + h);
  p.closePath();
  return p;
}

function drawCasing(ctx, win, c, shape) {
  const { x, y, w, h } = win;
  const cw = c.w || 26;
  const col = c.color || '#F2EEE6';
  if (shape === 'horseshoe') {
    const outerP = horseshoePath(x - cw, y - cw, w + cw * 2, h + cw);
    blurShape(ctx, outerP, 'rgba(60,45,35,0.25)', 10, 4, 5);
    ctx.fillStyle = lg(ctx, x - cw, 0, x + w + cw, 0, [[0, lt(col, 0.2)], [1, dk(col, 0.1)]]);
    ctx.fill(outerP);
    return;
  }
  const outerP = rrPath(x - cw, y - cw, w + cw * 2, h + cw, 0);
  blurShape(ctx, outerP, 'rgba(60,45,35,0.22)', 8, 3, 4);
  ctx.fillStyle = col;
  ctx.fill(outerP);
  // moulure : filets clairs / sombres
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = cw * (0.2 + i * 0.28);
    ctx.strokeStyle = i % 2 ? rgba(dk(col, 0.35), 0.5) : 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - cw + k, y + h);
    ctx.lineTo(x - cw + k, y - cw + k);
    ctx.lineTo(x + w + cw - k, y - cw + k);
    ctx.lineTo(x + w + cw - k, y + h);
    ctx.stroke();
  }
}

/** Vitrage (vue + reflets) et menuiserie. */
function drawGlazing(ctx, win, inner, o) {
  const { x, y, w, h } = win;
  const frame = o.frame || '#F4F1EA';
  const view = getView(o.view || 'garden');
  ctx.save();
  ctx.clip(inner);
  // la vue est en coordonnées écran : on neutralise la mise à l'échelle du plan
  const s = sc(-(o.depth ?? 28));
  ctx.save();
  ctx.translate(VX, HZ);
  ctx.scale(1 / s, 1 / s);
  ctx.translate(-VX, -HZ);
  ctx.drawImage(view, 0, 0, W, H);
  ctx.restore();
  // Reflets obliques très doux
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = lg(ctx, x, y, x + w, y + h, [
    [0, 'rgba(255,255,255,0.10)'],
    [0.3, 'rgba(255,255,255,0.0)'],
    [0.42, 'rgba(255,255,255,0.12)'],
    [0.5, 'rgba(255,255,255,0.0)'],
    [0.75, 'rgba(255,255,255,0.06)'],
    [1, 'rgba(255,255,255,0.0)'],
  ]);
  ctx.fill(inner);
  ctx.globalCompositeOperation = 'source-over';

  // Menuiserie
  const fw = o.fw ?? 16; // dormant
  const sw = o.sw ?? 12; // ouvrant
  const bar = o.bar ?? 5; // petit-bois
  const leaves = o.leaves ?? 2;
  const rows = o.rows ?? 1;
  const cols = o.cols ?? 1;
  const transom = o.transom || 0; // hauteur de l'imposte
  const bars = new Path2D();
  const glassRects = [];
  // dormant
  bars.addPath(ringPath(x, y, w, h, fw));
  const ix = x + fw;
  const iy = y + fw;
  const iw = w - fw * 2;
  const ih = h - fw * 2;
  let sashY = iy;
  let sashH = ih;
  if (transom) {
    bars.rect(ix, iy + transom, iw, fw * 0.8);
    glassRects.push([ix, iy, iw, transom]);
    if (o.transomBars) {
      for (let i = 1; i < o.transomBars; i++) bars.rect(ix + (iw * i) / o.transomBars - bar / 2, iy, bar, transom);
    }
    sashY = iy + transom + fw * 0.8;
    sashH = ih - transom - fw * 0.8;
  }
  const lw = iw / leaves;
  for (let l = 0; l < leaves; l++) {
    const lx = ix + l * lw;
    bars.addPath(ringPath(lx, sashY, lw, sashH, sw));
    const gx = lx + sw;
    const gy = sashY + sw;
    const gw = lw - sw * 2;
    const gh = sashH - sw * 2;
    const panel = o.panel || 0; // soubassement plein (porte-fenêtre)
    if (panel) bars.rect(gx, gy + gh - panel, gw, panel);
    const glassH = gh - panel;
    for (let rr = 1; rr < rows; rr++) bars.rect(gx, gy + (glassH * rr) / rows - bar / 2, gw, bar);
    for (let cc = 1; cc < cols; cc++) bars.rect(gx + (gw * cc) / cols - bar / 2, gy, bar, glassH);
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) glassRects.push([gx + (gw * cc) / cols, gy + (glassH * rr) / rows, gw / cols, glassH / rows]);
  }
  if (o.lattice) o.lattice(ctx, win);
  // ombre portée légère de la menuiserie sur le vitrage
  blurShape(ctx, bars, 'rgba(40,40,40,0.14)', 3, 1.5, 2);
  ctx.fillStyle = frame;
  ctx.fill(bars);
  // modelé : lumière venant de l'extérieur (arêtes claires)
  ctx.save();
  ctx.clip(bars);
  ctx.fillStyle = lg(ctx, x, y, x, y + h, [
    [0, rgba(dk(frame, 0.25), 0.25)],
    [1, rgba(lt(frame, 0.3), 0.15)],
  ]);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // halo de lumière autour de chaque carreau (le jour « mange » un peu les bois)
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(255,252,242,0.28)';
  ctx.lineWidth = 3;
  for (const [gx, gy, gw, gh] of glassRects) ctx.strokeRect(gx, gy, gw, gh);
  ctx.globalCompositeOperation = 'source-over';
  // poignée(s)
  if (o.after) o.after(ctx, { ix, iy, iw, ih, sashY, sashH, lw, sw, leaves, panel: o.panel || 0, frame });
  if (leaves === 2 && o.handle !== false) {
    const hx = ix + lw;
    ctx.fillStyle = o.handleColor || '#B9A06A';
    ctx.fillRect(hx - 3, sashY + sashH * 0.48, 6, 34);
  }
  ctx.restore();
}

function ringPath(x, y, w, h, t, p = new Path2D()) {
  p.rect(x, y, w, t);
  p.rect(x, y + h - t, w, t);
  p.rect(x, y + t, t, h - t * 2);
  p.rect(x + w - t, y + t, t, h - t * 2);
  return p;
}

/* ================================================================== */
/* Sols (textures projetées en perspective par bandes)                 */
/* ================================================================== */


/** Tuile de fil du bois (bruit anisotrope raccordable, fibres selon y), générée pixel par pixel. */
function woodGrainTile() {
  return cached('woodgrain', 64, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const r = rng(29);
    const N = 16;
    const lat = Array.from({ length: N }, r);
    const lat2 = Array.from({ length: N }, r);
    const n1 = (t, L) => {
      const i = Math.floor(t);
      const f = t - i;
      const s2 = f * f * (3 - 2 * f);
      return L[((i % N) + N) % N] * (1 - s2) + L[(((i + 1) % N) + N) % N] * s2;
    };
    for (let y = 0; y < h; y++) {
      const wob = n1((y / h) * N, lat) * 7 + n1((y / h) * N * 0.5, lat2) * 5;
      for (let x = 0; x < w; x++) {
        const ph = ((x + wob) / w) * TAU * 7;
        let v = Math.sin(ph) * 0.55 + Math.sin(ph * 3 + (y / h) * TAU * 3) * 0.2 + (r() - 0.5) * 0.35;
        v = v < -0.55 ? v * 1.6 : v;
        const c = Math.max(0, Math.min(255, 128 + v * 55));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Motif de fil du bois orienté (angle en degrés, 0 = fibres verticales). */
function grainPattern(g, x, y, angle, sx, sy) {
  const pat = g.createPattern(woodGrainTile(), 'repeat');
  if (pat && pat.setTransform) pat.setTransform(new DOMMatrix().translate(x, y).rotate(angle).scale(sx, sy));
  return pat;
}

/** Parquet à lames. dir : 'depth' (lames vers l'observateur) | 'across' (parallèles au mur). */
function woodFloorTex(key, o) {
  return cached('floor:' + key, W, Z_MAX, (g) => {
    const r = rng(hashStr(key));
    const pw = o.plankW || 64;
    const colors = o.colors;
    g.fillStyle = o.gap || dk(colors[0], 0.5);
    g.fillRect(0, 0, W, Z_MAX);
    const planks = [];
    if (o.dir === 'across') {
      for (let y = 0; y < Z_MAX; y += pw) {
        let x = -r() * 400;
        while (x < W) {
          const len = (o.minL || 300) + r() * ((o.maxL || 600) - (o.minL || 300));
          planks.push([x, y, len, pw, true]);
          x += len;
        }
      }
    } else {
      for (let x = (W / 2) % pw - pw; x < W; x += pw) {
        let y = -r() * 300;
        while (y < Z_MAX) {
          const len = (o.minL || 260) + r() * ((o.maxL || 520) - (o.minL || 260));
          planks.push([x, y, pw, len, false]);
          y += len;
        }
      }
    }
    // 1. teinte de chaque lame + légère variation le long de la lame
    for (const [x, y, w, h, alongX] of planks) {
      const base = jitter(colors[Math.floor(r() * colors.length)], r, 0.06);
      g.fillStyle = base;
      g.fillRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
      const grd = alongX ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, rgba(lt(base, 0.2), 0.3 * r()));
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, rgba(dk(base, 0.2), 0.3 * r()));
      g.fillStyle = grd;
      g.fillRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
    }
    // 2. fil du bois (motif pixel), décalé au hasard pour chaque lame
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = o.grain ?? 0.55;
    for (const [x, y, w, h, alongX] of planks) {
      g.fillStyle = alongX ? grainPattern(g, x + r() * 256, y, 90, pw / 64, 1.6) : grainPattern(g, x, y + r() * 256, 0, pw / 64, 1.6);
      g.fillRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // 3. quelques nœuds
    for (let i = 0; i < planks.length * 0.2; i++) {
      const [x, y, w, h, alongX] = planks[Math.floor(r() * planks.length)];
      blob(g, x + w * (0.2 + r() * 0.6), y + h * (0.2 + r() * 0.6), alongX ? 7 : 2.5, alongX ? 2.5 : 7, 'rgba(70,45,25,0.3)');
    }
  }, floorRes());
}

/** Point de Hongrie (chevrons coupés en onglet). */
function chevronFloorTex(key, o) {
  return cached('floor:' + key, W, Z_MAX, (g) => {
    const r = rng(hashStr(key));
    const cw = o.colW || 120;
    const t = o.slat || 26;
    const hStep = t * Math.SQRT2;
    const colors = o.colors;
    g.fillStyle = o.gap || dk(colors[0], 0.45);
    g.fillRect(0, 0, W, Z_MAX);
    const slats = [];
    let col = 0;
    for (let x0 = (VX % cw) - cw; x0 < W; x0 += cw, col++) {
      const s = col % 2 ? 1 : -1;
      for (let n = -Math.ceil(cw / hStep) - 2; n * hStep < Z_MAX + cw; n++) {
        const z = n * hStep;
        const pts = [
          [x0 + 0.7, z + 0.7 + (s < 0 ? cw : 0)],
          [x0 + cw - 0.7, z + 0.7 + (s < 0 ? 0 : cw)],
          [x0 + cw - 0.7, z + hStep - 0.7 + (s < 0 ? 0 : cw)],
          [x0 + 0.7, z + hStep - 0.7 + (s < 0 ? cw : 0)],
        ];
        if (pts[0][1] > Z_MAX + 2 && pts[1][1] > Z_MAX + 2) continue;
        if (pts[2][1] < -2 && pts[3][1] < -2) continue;
        slats.push([polyPath(pts), s, x0, z]);
      }
    }
    for (const [path] of slats) {
      g.fillStyle = jitter(colors[Math.floor(r() * colors.length)], r, 0.07);
      g.fill(path);
    }
    if (o.grain === 0) return;
    g.globalCompositeOperation = o.grainMode || 'overlay';
    g.globalAlpha = o.grain ?? 0.5;
    for (const [path, s, x0, z] of slats) {
      g.fillStyle = grainPattern(g, x0 + r() * 64, z + r() * 200, s > 0 ? -45 : 45, t / 64 * 1.3, 1.4);
      g.fill(path);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }, floorRes());
}

/** Carrelage (damier ou uni) avec veinage de marbre discret. */
function tileFloorTex(key, o) {
  return cached('floor:' + key, W, Z_MAX, (g) => {
    const r = rng(hashStr(key));
    const s = o.size || 120;
    g.fillStyle = o.joint || '#CFC8BC';
    g.fillRect(0, 0, W, Z_MAX);
    for (let y = 0, j = 0; y < Z_MAX; y += s, j++) {
      for (let x = (VX % s) - s, i = 0; x < W; x += s, i++) {
        const c = o.colors[(i + j) % o.colors.length];
        const base = jitter(c, r, 0.03);
        g.fillStyle = base;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        if (o.veins) {
          g.save();
          g.beginPath();
          g.rect(x + 1, y + 1, s - 2, s - 2);
          g.clip();
          for (let v = 0; v < 3; v++) {
            g.strokeStyle = rgba(dk(base, 0.3), 0.08 + r() * 0.12);
            g.lineWidth = 0.6 + r() * 1.2;
            g.beginPath();
            let px = x + r() * s;
            let py = y;
            g.moveTo(px, py);
            while (py < y + s) {
              px += (r() - 0.5) * 22;
              py += 8 + r() * 10;
              g.lineTo(px, py);
            }
            g.stroke();
          }
          g.restore();
        }
      }
    }
  }, floorRes());
}

/** Béton ciré : nuées + mouchetis. */
function concreteFloorTex(key, o) {
  return cached('floor:' + key, W, Z_MAX, (g) => {
    g.fillStyle = o.color;
    g.fillRect(0, 0, W, Z_MAX);
    const cl = cloudsCanvas('concreteFloor', 200, 60, 4, 31, 1.3);
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.55;
    g.drawImage(cl, 0, 0, W, Z_MAX);
    g.globalAlpha = 0.5;
    const tile = noiseTile('speck', 128, 16, 2, 0.4, 3, 60);
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, W, Z_MAX);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }, floorRes());
}

/** Projette une texture de sol sur la zone y ∈ [FL, H]. */
function drawFloor(ctx, tex, o = {}) {
  const res = tex.width / W;
  const band = 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, FL, W, H - FL);
  ctx.clip();
  ctx.imageSmoothingQuality = 'low';
  for (let y = FL; y < H; y += band) {
    const za = Math.max(0, zAtY(y));
    const zb = zAtY(Math.min(H, y + band));
    const zm = zAtY(y + band / 2);
    const s = sc(zm);
    const X0 = VX - VX / s;
    const X1 = VX + (W - VX) / s;
    ctx.drawImage(tex, X0 * res, za * res, (X1 - X0) * res, Math.max(0.5, (zb - za) * res), 0, y, W, band + 0.6);
  }
  // Lumière : plus claire près de la fenêtre, s'assombrit vers l'observateur
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = lg(ctx, 0, FL, 0, H, [
    [0, 'rgba(120,100,85,0.35)'],
    [0.08, 'rgba(255,255,255,0)'],
    [0.6, 'rgba(255,255,255,0)'],
    [1, 'rgba(130,112,98,0.3)'],
  ]);
  ctx.fillRect(0, FL, W, H - FL);
  ctx.fillStyle = lg(ctx, 0, 0, W, 0, [
    [0, 'rgba(120,100,85,0.3)'],
    [0.25, 'rgba(255,255,255,0)'],
    [0.75, 'rgba(255,255,255,0)'],
    [1, 'rgba(120,100,85,0.3)'],
  ]);
  ctx.fillRect(0, FL, W, H - FL);
  // Nappe de lumière / reflet du vitrage
  if (o.light) {
    const { x0, x1, a = 0.35 } = o.light;
    ctx.globalCompositeOperation = 'soft-light';
    const pts = [
      [x0 + 20, FL - 30],
      [x1 - 20, FL - 30],
      [VX + (x1 - VX) * 1.3 + 30, FL + 120],
      [VX + (x0 - VX) * 1.3 - 30, FL + 120],
    ];
    blurShape(ctx, polyPath(pts), `rgba(255,248,230,${a})`, 32);
    if (o.gloss) {
      ctx.globalCompositeOperation = 'screen';
      const cx = (x0 + x1) / 2;
      ctx.fillStyle = rg(ctx, cx, FL + 20, 0, cx, FL + 20, (x1 - x0) * 0.6, [
        [0, `rgba(255,252,245,${o.gloss})`],
        [1, 'rgba(255,252,245,0)'],
      ]);
      ctx.save();
      ctx.translate(cx, FL);
      ctx.scale(1, 0.35);
      ctx.translate(-cx, -FL);
      ctx.fillRect(x0 - 200, FL, x1 - x0 + 400, (H - FL) * 3);
      ctx.restore();
    }
  }
  ctx.restore();
  // Ligne d'ombre au pied du mur
  ctx.fillStyle = lg(ctx, 0, FL, 0, FL + 10, [
    [0, 'rgba(50,38,30,0.3)'],
    [1, 'rgba(50,38,30,0)'],
  ]);
  ctx.fillRect(0, FL, W, 10);
}

/** Tapis posé au sol : texture projetée sur [x0,x1]×[z0,z1] (monde). */
function drawRug(ctx, tex, x0, x1, z0, z1, o = {}) {
  const tw = tex.width;
  const th = tex.height;
  const zEnd = Math.min(z1, Z_MAX);
  const yA = pY(FL, z0);
  const yB = Math.min(H, pY(FL, zEnd));
  const outline = polyPath([
    [pX(x0, z0), yA],
    [pX(x1, z0), yA],
    [pX(x1, zEnd), yB],
    [pX(x0, zEnd), yB],
  ]);
  // épaisseur / ombre
  blurShape(ctx, outline, `rgba(40,28,20,${o.shadow ?? 0.25})`, 5, 0, 2);
  ctx.save();
  ctx.clip(outline);
  const band = 2;
  for (let y = Math.floor(yA); y < yB; y += band) {
    const za = Math.max(z0, zAtY(y));
    const zb = Math.min(z1, zAtY(y + band));
    if (zb <= za) continue;
    const zm = (za + zb) / 2;
    const sx0 = pX(x0, zm);
    const sx1 = pX(x1, zm);
    const v0 = ((za - z0) / (z1 - z0)) * th;
    const v1 = ((zb - z0) / (z1 - z0)) * th;
    ctx.drawImage(tex, 0, v0, tw, Math.max(0.5, v1 - v0), sx0 - 1, y, sx1 - sx0 + 2, band + 0.6);
  }
  // ombrage doux : lumière de la fenêtre
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = lg(ctx, 0, yA, 0, yB, [
    [0, 'rgba(120,100,85,0.18)'],
    [0.3, 'rgba(255,255,255,0)'],
    [1, 'rgba(120,100,85,0.18)'],
  ]);
  ctx.fillRect(0, yA, W, yB - yA);
  ctx.restore();
  if (o.edge) {
    // tranche avant du tapis
    const e = o.edge;
    ctx.fillStyle = e;
    ctx.fillRect(pX(x0, zEnd), yB - 1, pX(x1, zEnd) - pX(x0, zEnd), 2);
  }
  return outline;
}

/* ================================================================== */
/* Textiles (coussins, plaids…) — délégués à l'hôte                    */
/* ================================================================== */

/** Silhouette de coussin : coins en « oreilles », côtés légèrement creusés. */
function cushionPath(cx, cy, w, h, rot = 0, pinch = 0.07) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const T = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(w, h) * 0.08;
  const C = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const p = new Path2D();
  for (let i = 0; i < 4; i++) {
    const a = C[i];
    const b = C[(i + 1) % 4];
    const n = C[(i + 2) % 4];
    const ux = Math.sign(b[0] - a[0]);
    const uy = Math.sign(b[1] - a[1]);
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const start = T(a[0] + ux * r, a[1] + uy * r);
    const end = T(b[0] - ux * r, b[1] - uy * r);
    // milieu de l'arête tiré vers le centre
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const d = Math.hypot(mx, my) || 1;
    const k = pinch * len;
    const cc = T(mx - (mx / d) * k, my - (my / d) * k);
    if (i === 0) p.moveTo(start[0], start[1]);
    p.quadraticCurveTo(cc[0], cc[1], end[0], end[1]);
    // coin arrondi légèrement saillant
    const vx = Math.sign(n[0] - b[0]);
    const vy = Math.sign(n[1] - b[1]);
    const nxt = T(b[0] + vx * r, b[1] + vy * r);
    const ear = T(b[0] * 1.015, b[1] * 1.015);
    p.quadraticCurveTo(ear[0], ear[1], nxt[0], nxt[1]);
  }
  p.closePath();
  return p;
}

/** Appelle api.paintTextile (ou le repli local) avec un ctx protégé. */
function textile(ctx, api, slot, path, opts) {
  ctx.save();
  try {
    api.paintTextile(ctx, slot, path, opts);
  } finally {
    ctx.restore();
  }
}

/** Coussin complet : ombre portée + textile. */
function cushion(ctx, api, cx, cy, w, h, o = {}) {
  const path = cushionPath(cx, cy, w, h, o.rot || 0, o.pinch ?? 0.07);
  blurShape(ctx, path, `rgba(40,28,20,${o.shadow ?? 0.32})`, o.blur ?? 10, o.dx ?? 5, o.dy ?? 8);
  textile(ctx, api, o.slot || 'cushions', path, {
    kind: o.kind || 'cushion',
    bounds: { x: cx - w / 2, y: cy - h / 2, w, h },
    fallbackColor: o.color || '#E7DCCB',
    rotation: ((o.rot || 0) * 180) / Math.PI,
    scale: o.scale || 95,
    light: o.light ?? -0.6,
  });
  return path;
}

/* ================================================================== */
/* Végétaux, pots, luminaires, cadres (éléments réutilisables)         */
/* ================================================================== */

/** Feuille lancéolée : aplat, demi-limbe ombré, nervure claire. */
function leaf(g, x, y, len, wid, ang, color, o = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const p = new Path2D();
  const tipW = o.tip ?? 0.5; // position de la largeur max (0..1)
  p.moveTo(0, 0);
  p.bezierCurveTo(len * tipW * 0.6, -wid, len * (tipW + 0.25), -wid * 0.9, len, 0);
  p.bezierCurveTo(len * (tipW + 0.25), wid * 0.9, len * tipW * 0.6, wid, 0, 0);
  g.fillStyle = color;
  g.fill(p);
  const half = new Path2D();
  half.moveTo(0, 0);
  half.bezierCurveTo(len * tipW * 0.6, -wid, len * (tipW + 0.25), -wid * 0.9, len, 0);
  half.closePath();
  g.fillStyle = o.shade || 'rgba(20,35,20,0.22)';
  g.fill(half);
  if (o.rib !== false) {
    g.strokeStyle = o.ribColor || 'rgba(235,245,215,0.35)';
    g.lineWidth = Math.max(0.6, wid * 0.08);
    g.beginPath();
    g.moveTo(len * 0.02, 0);
    g.quadraticCurveTo(len * 0.5, -wid * 0.08, len * 0.92, 0);
    g.stroke();
  }
  g.restore();
}

/** Limbe de figuier lyre (en violon) orienté selon +x. */
function fiddleLeafPath(L, Wd) {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(L * 0.14, -Wd * 0.5, L * 0.32, -Wd * 0.62, L * 0.5, -Wd * 0.6);
  p.bezierCurveTo(L * 0.72, -Wd * 0.62, L * 0.98, -Wd * 1.02, L * 1.02, -Wd * 0.3);
  p.quadraticCurveTo(L * 1.04, 0, L * 0.99, Wd * 0.22);
  p.bezierCurveTo(L * 0.96, Wd * 0.98, L * 0.72, Wd * 0.62, L * 0.5, Wd * 0.58);
  p.bezierCurveTo(L * 0.32, Wd * 0.58, L * 0.14, Wd * 0.48, 0, 0);
  p.closePath();
  return p;
}

/** Feuille « riche » : dégradé transversal, reflet satiné, nervures discrètes. */
function richLeaf(g, x, y, L, Wd, ang, col, pathFn = fiddleLeafPath) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const p = pathFn(L, Wd);
  g.fillStyle = lg(g, 0, -Wd, 0, Wd, [
    [0, lt(col, 0.18)],
    [0.5, col],
    [1, dk(col, 0.28)],
  ]);
  g.fill(p);
  g.save();
  g.clip(p);
  g.fillStyle = rg(g, L * 0.55, -Wd * 0.3, 0, L * 0.55, -Wd * 0.3, L * 0.5, [
    [0, 'rgba(255,255,240,0.16)'],
    [1, 'rgba(255,255,240,0)'],
  ]);
  g.fillRect(0, -Wd, L * 1.1, Wd * 2);
  g.strokeStyle = rgba(lt(col, 0.45), 0.55);
  g.lineWidth = Math.max(0.8, Wd * 0.05);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(L * 0.5, -Wd * 0.04, L * 0.96, 0);
  g.stroke();
  g.strokeStyle = rgba(lt(col, 0.35), 0.22);
  g.lineWidth = Math.max(0.5, Wd * 0.025);
  for (let i = 1; i <= 5; i++) {
    const t = i / 6.2;
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(L * t, 0);
      g.quadraticCurveTo(L * (t + 0.08), sgn * Wd * 0.3, L * (t + 0.16), sgn * Wd * 0.55);
      g.stroke();
    }
  }
  g.restore();
  g.restore();
}

/** Figuier lyre en sprite (base du tronc au point (w/2, h)). */
function fiddleFigSprite(seed) {
  const w = 380;
  const h = 640;
  return cached('plant:fig:' + seed, w, h, (g) => {
    const r = rng(seed);
    const bx = w / 2;
    const by = h;
    g.lineCap = 'round';
    // tronc et deux branches
    const trunk = [[bx, by], [bx + 8, by - 230], [bx - 14, by - 390], [bx + 2, by - 520]];
    const branches = [trunk, [[bx - 6, by - 330], [bx - 50, by - 390], [bx - 80, by - 430], [bx - 96, by - 470]], [[bx + 2, by - 300], [bx + 50, by - 360], [bx + 70, by - 400], [bx + 92, by - 440]]];
    g.strokeStyle = '#6E604F';
    for (const [i, b] of branches.entries()) {
      g.lineWidth = i ? 4 : 7;
      g.beginPath();
      g.moveTo(b[0][0], b[0][1]);
      g.bezierCurveTo(b[1][0], b[1][1], b[2][0], b[2][1], b[3][0], b[3][1]);
      g.stroke();
    }
    const pt = (b, t) => {
      const u = 1 - t;
      return [0, 1].map((k) => u * u * u * b[0][k] + 3 * u * u * t * b[1][k] + 3 * u * t * t * b[2][k] + t * t * t * b[3][k]);
    };
    const leaves = [];
    for (const [i, b] of branches.entries()) {
      const n = i ? 7 : 16;
      for (let j = 0; j < n; j++) {
        const t = (i ? 0.15 : 0.32) + (j / n) * (i ? 0.85 : 0.7);
        const [lx, ly] = pt(b, t);
        const side = j % 2 ? 1 : -1;
        const up = 0.35 + r() * 0.75;
        const ang = side > 0 ? -up : Math.PI + up;
        const L = 78 + r() * 46 + (t > 0.9 ? -10 : 0);
        leaves.push({ lx, ly, L, ang, d: r(), side });
      }
      // feuille terminale
      const [ex, ey] = pt(b, 1);
      leaves.push({ lx: ex, ly: ey, L: 70, ang: -Math.PI / 2 + (r() - 0.5) * 0.5, d: 1, side: 0 });
    }
    leaves.sort((a, b2) => a.d - b2.d);
    for (const f of leaves) {
      const base = mix('#294228', '#557A45', f.d * 0.8 + r() * 0.2);
      // pétiole court
      g.strokeStyle = '#5B6B42';
      g.lineWidth = 2.2;
      const px = f.lx + Math.cos(f.ang) * 10;
      const py = f.ly + Math.sin(f.ang) * 10;
      g.beginPath();
      g.moveTo(f.lx, f.ly);
      g.lineTo(px, py);
      g.stroke();
      richLeaf(g, px, py, f.L, f.L * 0.42, f.ang, base);
    }
  }, spriteRes());
}

/** Pot en céramique (cylindre évasé) posé en (x, baseY) dans le repère courant. */
function drawPot(g, cx, baseY, w, h, o = {}) {
  const col = o.color || '#EDE7DD';
  const topW = w;
  const botW = w * (o.taper ?? 0.8);
  const p = new Path2D();
  p.moveTo(cx - topW / 2, baseY - h);
  p.bezierCurveTo(cx - topW / 2, baseY - h * 0.4, cx - botW / 2, baseY - h * 0.1, cx - botW / 2, baseY - 3);
  p.quadraticCurveTo(cx - botW / 2, baseY, cx - botW / 2 + 6, baseY);
  p.lineTo(cx + botW / 2 - 6, baseY);
  p.quadraticCurveTo(cx + botW / 2, baseY, cx + botW / 2, baseY - 3);
  p.bezierCurveTo(cx + botW / 2, baseY - h * 0.1, cx + topW / 2, baseY - h * 0.4, cx + topW / 2, baseY - h);
  p.closePath();
  g.fillStyle = lg(g, cx - w / 2, 0, cx + w / 2, 0, [
    [0, lt(col, 0.2)],
    [0.3, lt(col, 0.35)],
    [0.75, dk(col, 0.12)],
    [1, dk(col, 0.3)],
  ]);
  g.fill(p);
  if (o.ribs) {
    g.save();
    g.clip(p);
    for (let i = -10; i <= 10; i++) {
      const xx = cx + (i / 10) * (w / 2);
      g.strokeStyle = 'rgba(60,45,35,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(xx, baseY - h);
      g.lineTo(cx + (i / 10) * (botW / 2), baseY);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xx + 3, baseY - h);
      g.lineTo(cx + (i / 10) * (botW / 2) + 2, baseY);
      g.stroke();
    }
    g.restore();
  }
  if (o.texture) texturize(g, p, noiseTile('pot', 128, 8, 3, 0.8, 11, 30), 0.5);
  // col et terre
  g.fillStyle = dk(col, 0.18);
  g.beginPath();
  g.ellipse(cx, baseY - h, topW / 2, 7, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#4A3B30';
  g.beginPath();
  g.ellipse(cx, baseY - h + 1, topW / 2 - 5, 5, 0, 0, TAU);
  g.fill();
  return p;
}

/** Cadre avec œuvre : style 'oak' | 'black' | 'gilt' | 'white' | 'none'. */
function drawFrame(ctx, x, y, w, h, o, paint) {
  const fw = o.fw ?? (o.style === 'gilt' ? 22 : 10);
  const mat = o.mat ?? 0;
  const outer = rrPath(x, y, w, h, o.style === 'none' ? 1 : 0.5);
  blurShape(ctx, outer, 'rgba(40,28,20,0.35)', 12, 6, 10);
  if (o.style !== 'none') {
    let fill;
    if (o.style === 'gilt') {
      fill = lg(ctx, x, y, x + w, y + h, [
        [0, '#E9D08A'],
        [0.25, '#B8913F'],
        [0.5, '#F0DC9E'],
        [0.75, '#A57F35'],
        [1, '#D8BA6A'],
      ]);
    } else if (o.style === 'black') fill = '#2A2724';
    else if (o.style === 'white') fill = '#F4F1EA';
    else fill = lg(ctx, x, y, x + w, y + h, [[0, '#C9A57A'], [1, '#A88259']]);
    ctx.fillStyle = fill;
    ctx.fill(outer);
    // biseau
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(x + fw - 1, y + fw - 1, w - fw * 2 + 2, h - fw * 2 + 2);
  }
  const ax = x + fw;
  const ay = y + fw;
  const aw = w - fw * 2;
  const ah = h - fw * 2;
  if (mat) {
    ctx.fillStyle = '#F7F4EE';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(ax + mat - 1, ay + mat - 1, aw - mat * 2 + 2, 2);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax + mat, ay + mat, aw - mat * 2, ah - mat * 2);
  ctx.clip();
  paint(ax + mat, ay + mat, aw - mat * 2, ah - mat * 2);
  ctx.restore();
  // ombre intérieure + reflet du verre
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,30,20,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(ax - 2, ay - 2, aw + 4, ah + 4);
  if (o.glass !== false) {
    ctx.fillStyle = lg(ctx, ax, ay, ax + aw, ay + ah, [
      [0, 'rgba(255,255,255,0.12)'],
      [0.4, 'rgba(255,255,255,0)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(ax, ay, aw, ah);
  }
  ctx.restore();
}

/** Halo lumineux (lampe allumée). */
function glow(ctx, x, y, r, color = '255,226,170', a = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = rg(ctx, x, y, 0, x, y, r, [
    [0, `rgba(${color},${a})`],
    [0.4, `rgba(${color},${a * 0.35})`],
    [1, `rgba(${color},0)`],
  ]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/* ================================================================== */
/* Étalonnage final                                                    */
/* ================================================================== */

/** Grain photographique très fin. */
function grain(ctx, a = 0.35) {
  texturize(ctx, null, noiseTile('grain', 192, 48, 1, 0.1, 77, 70), a, 'soft-light');
}

function vignetteGradient(ctx, o, a) {
  const cx = o.cx ?? VX;
  const cy = o.cy ?? 470;
  return rg(ctx, cx, cy, 320, cx, cy, 1060, [
    [0, 'rgba(120,98,80,0)'],
    [0.65, `rgba(120,98,80,${0.12 * a})`],
    [1, `rgba(90,70,55,${0.45 * a})`],
  ]);
}

/** Finition du calque de fond : vignettage, teinte d'ensemble, grain. */
function backFinish(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = vignetteGradient(ctx, o, 1);
  ctx.fillRect(0, 0, W, H);
  if (o.tint) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = o.tint;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  grain(ctx, o.grain ?? 0.35);
}

/** Finition du premier plan (calque transparent) : même vignettage, limité aux pixels existants. */
function finish(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = vignetteGradient(ctx, o, 0.8);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ================================================================== */
/* Rideaux + premier plan                                              */
/* ================================================================== */

/** Canevas de premier plan réutilisés par objet api de l'hôte (sinon un canevas neuf par appel). */
const FG_POOL = new WeakMap();

function fgCanvas(host, key, w, h) {
  let pool = host ? FG_POOL.get(host) : null;
  if (host && !pool) {
    pool = new Map();
    FG_POOL.set(host, pool);
  }
  let c = pool ? pool.get(key) : null;
  if (!c || c.width !== w || c.height !== h) {
    c = makeCanvas(w, h);
    if (pool) pool.set(key, c);
  }
  return c;
}

/**
 * Appelle api.drawCurtains puis compose tout le premier plan (meubles + textiles) dans un canevas
 * hors écran, recopié en un seul drawImage. Aucun save/restore n'encadre l'appel aux rideaux :
 * certains hôtes enregistrent les appels à partir de ce point pour les rejouer à chaque image ;
 * l'état est donc rétabli par des affectations absolues.
 */
function foreground(ctx, api, spec, draw) {
  const base = ctx.getTransform();
  api.drawCurtains(ctx, { ...spec, window: { ...spec.window } });
  ctx.setTransform(base);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  const m = base;
  if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || !(m.a > 0) || !(m.d > 0)) {
    ctx.save();
    draw(ctx);
    ctx.restore();
    return spec;
  }
  const w = Math.max(1, Math.ceil(W * m.a));
  const h = Math.max(1, Math.ceil(H * m.d));
  const c = fgCanvas(api.__host, `${api.__id}@${w}x${h}`, w, h);
  const g = ctx2d(c);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setTransform(m.a, 0, 0, m.d, 0, 0);
  g.imageSmoothingEnabled = true;
  draw(g);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, m.e, m.f);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
  return spec;
}

/* ================================================================== */
/* Mobilier réutilisable                                               */
/* ================================================================== */

function boucleTile() {
  return cached('boucle', 96, 96, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 96, 96);
    const r = rng(8);
    for (let i = 0; i < 260; i++) {
      const x = 4 + r() * 88;
      const y = 4 + r() * 88;
      const rad = 1.6 + r() * 2.2;
      for (const [ox, oy] of [[0, 0]]) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.arc(x + ox + 0.9, y + oy + 0.9, rad * 0.85, 0, TAU);
        g.fill();
        g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.3})`;
        g.beginPath();
        g.arc(x + ox - 0.5, y + oy - 0.5, rad, 0, TAU);
        g.fill();
      }
    }
  });
}

/** Tapis de laine uni à bordure ton sur ton. */
function woolRugTex(key, col, border) {
  return rugCached('rug:' + key, 900, 500, (g, w, h) => {
    g.fillStyle = col;
    g.fillRect(0, 0, w, h);
    const t = noiseTile('wool', 128, 16, 3, 0.6, 21, 50);
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = g.createPattern(t, 'repeat');
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 6;
      g.strokeRect(34, 34, w - 68, h - 68);
      g.lineWidth = 2;
      g.strokeRect(48, 48, w - 96, h - 96);
    }
  });
}

/**
 * Canapé en perspective. o : { x0, x1, z0, z1, color, seatH, backH, armH, armW, radius, legs, legColor,
 *   texture: 'boucle'|'linen'|null, backCushions, key }.
 * Les coussins décoratifs sont passés par o.cushions([...]) et dessinés via l'hôte.
 */
function sofaParts(o) {
  const col = o.color;
  const legH = o.legH ?? 0;
  const base = FL - legH;
  const seatTop = FL - (o.seatH ?? 118);
  const backTop = FL - (o.backH ?? 232);
  const armTop = FL - (o.armH ?? 196);
  const armW = o.armW ?? 96;
  const rad = o.radius ?? 44;
  return { col, legH, base, seatTop, backTop, armTop, armW, rad };
}

function drawSofaBack(g, o) {
  const { x0, x1, z0, z1 } = o;
  const { col, legH, base, seatTop, backTop, armTop, armW, rad } = sofaParts(o);
  const texTile = o.texture === 'boucle' ? boucleTile() : o.texture === 'linen' ? noiseTile('linen', 128, 32, 2, 0.5, 13, 60) : null;
  const tex = (p) => texTile && texturize(g, p, texTile, o.texture === 'boucle' ? 0.55 : 0.4, 'soft-light', 0.7);
  floorShadow(g, x0 + 10, x1 - 10, z0, z1, 0.5, 16);
  blurShape(g, rrPath(x0 + 10, backTop, x1 - x0 - 20, FL - backTop, rad), 'rgba(60,45,35,0.25)', 34, o.shadowDx ?? 0, 6);
  // pieds arrière
  if (legH) {
    atDepth(g, z0 + 30, () => {
      g.fillStyle = o.legColor || '#6B4E36';
      g.fillRect(x0 + 24, base - 2, 12, legH + 2);
      g.fillRect(x1 - 36, base - 2, 12, legH + 2);
    });
  }
  // dossier
  prism(g, {
    x: x0 + (o.backInset ?? 20), y: backTop, w: x1 - x0 - (o.backInset ?? 20) * 2, h: base - backTop, r: rad, z0, z1: z0 + 80,
    side: dk(col, 0.22), top: lt(col, 0.1),
    front: (p) => {
      g.fillStyle = lg(g, 0, backTop, 0, base, [[0, lt(col, 0.18)], [0.35, dk(col, 0.06)], [1, dk(col, 0.25)]]);
      g.fill(p);
      tex(p);
    },
  });
  // flancs et dessus des accoudoirs
  const arm = (ax) => prism(g, {
    x: ax, y: armTop, w: armW, h: base - armTop, r: Math.min(rad, armW / 2), z0: z0 + 10, z1,
    side: () => lg(g, 0, pY(armTop, z1), 0, pY(base, z1), [[0, lt(col, 0.02)], [1, dk(col, 0.3)]]),
    top: lt(col, 0.16),
  });
  if (armW > 0) {
    arm(x0);
    arm(x1 - armW);
  }
  // assise
  const seatX = x0 + armW - (armW ? 20 : 0);
  const seatW = x1 - x0 - armW * 2 + (armW ? 40 : 0);
  prism(g, {
    x: seatX, y: seatTop, w: seatW, h: base - seatTop, r: Math.min(30, rad), z0: z0 + 60, z1: z1 - 6,
    side: dk(col, 0.18),
    top: (ya, yb) => lg(g, 0, ya, 0, yb, [[0, dk(col, 0.14)], [1, lt(col, 0.16)]]),
    front: (p) => {
      g.fillStyle = lg(g, 0, seatTop, 0, base, [[0, lt(col, 0.22)], [0.3, col], [1, dk(col, 0.28)]]);
      g.fill(p);
      tex(p);
      const n = o.seats ?? 2;
      g.strokeStyle = rgba(dk(col, 0.45), 0.45);
      g.lineWidth = 2.5;
      for (let i = 1; i < n; i++) {
        const mx = seatX + (seatW * i) / n;
        g.beginPath();
        g.moveTo(mx, seatTop + 6);
        g.lineTo(mx, base - 4);
        g.stroke();
      }
    },
  });
  // coussins de dossier
  const nb = o.backCushions ?? 2;
  const bw = (x1 - x0 - armW * 2) / nb;
  for (let i = 0; i < nb; i++) {
    const bx = x0 + armW + i * bw;
    const top = backTop + (o.backCushionDrop ?? 30);
    prism(g, {
      x: bx + 4, y: top, w: bw - 8, h: seatTop - top + 6, r: Math.min(38, rad), z0: z0 + 70, z1: z0 + 145,
      side: dk(col, 0.2), top: lt(col, 0.12),
      front: (p) => {
        g.fillStyle = lg(g, 0, top, 0, seatTop, [[0, lt(col, 0.26)], [0.6, col], [1, dk(col, 0.25)]]);
        g.fill(p);
        tex(p);
      },
    });
  }
}

function drawSofaFront(g, o) {
  const { x0, x1, z1 } = o;
  const { col, legH, base, armTop, armW, rad } = sofaParts(o);
  const texTile = o.texture === 'boucle' ? boucleTile() : o.texture === 'linen' ? noiseTile('linen', 128, 32, 2, 0.5, 13, 60) : null;
  atDepth(g, z1, () => {
    if (legH) {
      for (const lx of [x0 + 22, x1 - 38]) {
        softEllipse(g, lx + 8, FL, 16, 4, SHADOW, 0.5);
        const lp = polyPath([[lx, base - 2], [lx + 16, base - 2], [lx + 12, FL], [lx + 5, FL]]);
        g.fillStyle = lg(g, lx, 0, lx + 16, 0, [[0, lt(o.legColor || '#6B4E36', 0.2)], [1, dk(o.legColor || '#6B4E36', 0.2)]]);
        g.fill(lp);
      }
    }
    if (armW > 0) {
      for (const ax of [x0, x1 - armW]) {
        const p = rrPath(ax, armTop, armW, base - armTop, Math.min(rad, armW / 2));
        g.fillStyle = lg(g, ax, armTop, ax + armW, base, [[0, lt(col, 0.28)], [0.5, col], [1, dk(col, 0.28)]]);
        g.fill(p);
        if (texTile) texturize(g, p, texTile, o.texture === 'boucle' ? 0.55 : 0.4, 'soft-light', 0.7);
      }
    }
  });
}

/* ================================================================== */
/* Éléments partagés : luminaires, moulures, tapis, végétaux           */
/* ================================================================== */

/** Lampe à poser : pied céramique galbé + abat-jour plissé allumé. */
function drawTableLamp(g, cx, baseY, o = {}) {
  const bc = o.base || '#C98B5E';
  const shc = o.shade || '#F4ECDD';
  const bh = o.baseH ?? 110;
  const bw = o.baseW ?? 78;
  const sh = o.shadeH ?? 86;
  const st = o.shadeTop ?? 92;
  const sb = o.shadeBot ?? 136;
  const sy = baseY - bh - (o.neck ?? 26);
  glow(g, cx, sy + sh * 0.4, o.glowR ?? 300, '255,214,150', o.glowA ?? 0.42);
  // pied
  const p = new Path2D();
  p.moveTo(cx - 9, baseY - bh);
  p.bezierCurveTo(cx - 12, baseY - bh + 18, cx - bw / 2, baseY - bh * 0.62, cx - bw / 2, baseY - bh * 0.34);
  p.bezierCurveTo(cx - bw / 2, baseY - 10, cx - bw * 0.28, baseY, cx - bw * 0.22, baseY);
  p.lineTo(cx + bw * 0.22, baseY);
  p.bezierCurveTo(cx + bw * 0.28, baseY, cx + bw / 2, baseY - 10, cx + bw / 2, baseY - bh * 0.34);
  p.bezierCurveTo(cx + bw / 2, baseY - bh * 0.62, cx + 12, baseY - bh + 18, cx + 9, baseY - bh);
  p.closePath();
  blurShape(g, p, 'rgba(40,28,20,0.3)', 8, 8, 2);
  g.fillStyle = lg(g, cx - bw / 2, 0, cx + bw / 2, 0, [
    [0, lt(bc, 0.25)], [0.3, lt(bc, 0.35)], [0.45, bc], [1, dk(bc, 0.35)],
  ]);
  g.fill(p);
  g.fillStyle = rg(g, cx - bw * 0.18, baseY - bh * 0.45, 0, cx - bw * 0.18, baseY - bh * 0.45, bw * 0.3, [
    [0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)'],
  ]);
  g.fill(p);
  // tige
  g.fillStyle = '#B8A06A';
  g.fillRect(cx - 2.5, sy + sh - 6, 5, baseY - bh - sy - sh + 8);
  // abat-jour
  const s = polyPath([[cx - st / 2, sy], [cx + st / 2, sy], [cx + sb / 2, sy + sh], [cx - sb / 2, sy + sh]]);
  g.fillStyle = lg(g, cx - sb / 2, 0, cx + sb / 2, 0, [
    [0, dk(shc, 0.06)], [0.35, lt(shc, 0.5)], [0.6, lt(shc, 0.3)], [1, dk(shc, 0.14)],
  ]);
  g.fill(s);
  g.save();
  g.clip(s);
  g.fillStyle = lg(g, 0, sy, 0, sy + sh, [[0, 'rgba(255,240,210,0)'], [1, 'rgba(255,226,170,0.5)']]);
  g.fillRect(cx - sb, sy, sb * 2, sh);
  g.strokeStyle = rgba(dk(shc, 0.3), 0.18);
  g.lineWidth = 1.2;
  for (let i = -8; i <= 8; i++) {
    g.beginPath();
    g.moveTo(cx + (i / 8) * (st / 2), sy);
    g.lineTo(cx + (i / 8) * (sb / 2), sy + sh);
    g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(255,238,200,0.95)';
  g.beginPath();
  g.ellipse(cx, sy + sh, sb / 2, 5, 0, 0, Math.PI);
  g.fill();
  // flaque de lumière sous l'abat-jour
  g.save();
  g.globalCompositeOperation = 'screen';
  g.fillStyle = rg(g, cx, baseY, 0, cx, baseY, sb, [[0, 'rgba(255,220,160,0.35)'], [1, 'rgba(255,220,160,0)']]);
  g.fillRect(cx - sb, baseY - sb, sb * 2, sb * 2);
  g.restore();
}

/**
 * Cadre mouluré (boiserie / lambris) : 4 bandes en onglet, profil clair-obscur, lumière venant de lx (-1..1).
 */
function panelMolding(g, x, y, w, h, col, o = {}) {
  const t = o.t ?? 12;
  const lx = o.light ?? -0.5;
  const ring = new Path2D();
  ring.rect(x, y, w, h);
  ring.rect(x + t, y + t, w - t * 2, h - t * 2);
  blurShape(g, polyPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), 'rgba(60,45,35,0.16)', 4, 2, 3);
  g.fillStyle = col;
  g.fill(polyPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]));
  if (o.fill) {
    g.fillStyle = o.fill;
    g.fillRect(x + t, y + t, w - t * 2, h - t * 2);
  }
  const prof = (bright) => [
    [0, lt(col, 0.35 * bright)],
    [0.25, dk(col, 0.1)],
    [0.45, lt(col, 0.45 * bright)],
    [0.7, dk(col, 0.06)],
    [1, dk(col, 0.28)],
  ];
  const side = (pts, x0, y0, x1, y1, bright) => {
    g.fillStyle = lg(g, x0, y0, x1, y1, prof(bright));
    g.fill(polyPath(pts));
  };
  side([[x, y], [x + w, y], [x + w - t, y + t], [x + t, y + t]], 0, y, 0, y + t, 1);
  side([[x, y + h], [x + w, y + h], [x + w - t, y + h - t], [x + t, y + h - t]], 0, y + h, 0, y + h - t, 0.35);
  side([[x, y], [x + t, y + t], [x + t, y + h - t], [x, y + h]], x, 0, x + t, 0, lx < 0 ? 0.9 : 0.4);
  side([[x + w, y], [x + w - t, y + t], [x + w - t, y + h - t], [x + w, y + h]], x + w, 0, x + w - t, 0, lx < 0 ? 0.4 : 0.9);
  // ombre intérieure (champ du panneau légèrement en retrait)
  g.save();
  g.beginPath();
  g.rect(x + t, y + t, w - t * 2, h - t * 2);
  g.clip();
  g.strokeStyle = 'rgba(60,45,35,0.14)';
  g.lineWidth = 5;
  g.strokeRect(x + t - 1, y + t - 1, w - t * 2 + 2, h - t * 2 + 2);
  g.restore();
}

/** Franges à l'avant d'un tapis (coordonnées écran). */
function fringe(g, x0, x1, z, col, len = 16) {
  const y = pY(FL, z);
  const a = pX(x0, z);
  const b = pX(x1, z);
  g.strokeStyle = col;
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  const r = rng(Math.round(a));
  for (let x = a + 3; x < b - 2; x += 5) {
    g.beginPath();
    g.moveTo(x, y - 1);
    g.lineTo(x + (r() - 0.5) * 3, y + len * (0.7 + r() * 0.4));
    g.stroke();
  }
}

/** Tapis kilim : bandes de losanges à gradins, laine plate. */
function kilimTex() {
  return rugCached('rug:kilim', 900, 520, (g, w, h) => {
    const C = { terra: '#B45F43', ochre: '#D29B45', indigo: '#34495A', cream: '#EDE0C8', brick: '#7E3A2A', rose: '#D7A189' };
    g.fillStyle = C.terra;
    g.fillRect(0, 0, w, h);
    // bordure
    g.fillStyle = C.brick;
    g.fillRect(0, 0, w, 36);
    g.fillRect(0, h - 36, w, 36);
    g.fillStyle = C.cream;
    for (let x = 0; x < w; x += 24) {
      g.fill(polyPath([[x, 36], [x + 12, 24], [x + 24, 36], [x + 12, 48]]));
      g.fill(polyPath([[x, h - 36], [x + 12, h - 24], [x + 24, h - 36], [x + 12, h - 48]]));
    }
    // bandes de losanges
    const bands = [[70, C.cream, C.indigo], [170, C.ochre, C.brick], [260, C.cream, C.terra], [350, C.ochre, C.brick], [450, C.cream, C.indigo]];
    for (const [cy, a, b] of bands) {
      g.fillStyle = rgba(C.brick, 0.25);
      g.fillRect(0, cy - 44, w, 2);
      g.fillRect(0, cy + 42, w, 2);
      for (let x = 45; x < w; x += 110) {
        const step = (rx, ry, col) => {
          g.fillStyle = col;
          const pts = [];
          const n = 5;
          for (let i = 0; i <= n; i++) pts.push([x - rx + (i * rx) / n, cy - (i * ry) / n]);
          for (let i = 1; i <= n; i++) pts.push([x + (i * rx) / n, cy - ry + (i * ry) / n]);
          for (let i = 1; i <= n; i++) pts.push([x + rx - (i * rx) / n, cy + (i * ry) / n]);
          for (let i = 1; i < n; i++) pts.push([x - (i * rx) / n, cy + ry - (i * ry) / n]);
          // gradins : on arrondit chaque point à une grille de 6 px
          g.fill(polyPath(pts.map(([px, py]) => [Math.round(px / 6) * 6, Math.round(py / 6) * 6])));
        };
        step(46, 38, a);
        step(30, 25, b);
        step(14, 12, C.cream);
        g.fillStyle = C.indigo;
        g.fillRect(x - 3, cy - 3, 6, 6);
      }
    }
    // armure : fines lignes horizontales + bruit
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = g.createPattern(noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 'repeat');
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // patine
    g.fillStyle = 'rgba(255,245,230,0.12)';
    g.fillRect(0, 0, w, h);
  });
}

/** Tapis d'inspiration persane, couleurs passées. */
function persianTex() {
  return rugCached('rug:persian', 900, 520, (g, w, h) => {
    const field = '#B98A7C';
    const navy = '#3F4B62';
    const cream = '#EFE3CE';
    const sage = '#8E9A82';
    g.fillStyle = navy;
    g.fillRect(0, 0, w, h);
    g.fillStyle = cream;
    g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = navy;
    g.fillRect(24, 24, w - 48, h - 48);
    // frise florale de la bordure
    const r = rng(4);
    for (let x = 40; x < w - 30; x += 34) {
      blob(g, x, 44, 8, 8, '#C9A27A');
      blob(g, x, h - 44, 8, 8, '#C9A27A');
      blob(g, x + 17, 44, 4, 4, cream);
      blob(g, x + 17, h - 44, 4, 4, cream);
    }
    for (let y = 70; y < h - 60; y += 34) {
      blob(g, 44, y, 8, 8, '#C9A27A');
      blob(g, w - 44, y, 8, 8, '#C9A27A');
    }
    g.fillStyle = cream;
    g.fillRect(64, 64, w - 128, h - 128);
    g.fillStyle = field;
    g.fillRect(72, 72, w - 144, h - 144);
    // semis de fleurettes
    for (let i = 0; i < 260; i++) {
      const x = 80 + r() * (w - 160);
      const y = 80 + r() * (h - 160);
      blob(g, x, y, 3 + r() * 3, 2 + r() * 2, r() > 0.5 ? rgba(cream, 0.45) : rgba(navy, 0.35));
    }
    // médaillon central
    const cx = w / 2;
    const cy = h / 2;
    const med = (rx, ry, col) => {
      g.fillStyle = col;
      g.fill(polyPath([[cx - rx, cy], [cx - rx * 0.5, cy - ry * 0.7], [cx, cy - ry], [cx + rx * 0.5, cy - ry * 0.7], [cx + rx, cy], [cx + rx * 0.5, cy + ry * 0.7], [cx, cy + ry], [cx - rx * 0.5, cy + ry * 0.7]]));
    };
    med(200, 150, navy);
    med(180, 132, cream);
    med(160, 116, sage);
    med(110, 80, cream);
    med(80, 56, field);
    blob(g, cx, cy, 30, 22, navy);
    blob(g, cx, cy, 14, 10, '#C9A27A');
    // écoinçons
    for (const [ax, ay, sx, sy] of [[72, 72, 1, 1], [w - 72, 72, -1, 1], [72, h - 72, 1, -1], [w - 72, h - 72, -1, -1]]) {
      g.fillStyle = navy;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(ax + sx * 140, ay);
      g.quadraticCurveTo(ax + sx * 60, ay + sy * 30, ax, ay + sy * 100);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = g.createPattern(noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 'repeat');
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(245,235,220,0.18)';
    g.fillRect(0, 0, w, h);
  });
}

/** Tapis tissé plat scandinave (écru, fines rayures anthracite). */
function flatweaveTex() {
  return rugCached('rug:flatweave', 900, 520, (g, w, h) => {
    g.fillStyle = '#E8E3DA';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,58,54,0.08)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
    g.fillStyle = '#4A4743';
    for (const y of [40, 52, h - 56, h - 44]) g.fillRect(0, y, w, 4);
    g.fillStyle = 'rgba(74,71,67,0.55)';
    for (let x = 30; x < w; x += 60) {
      for (let y = 110; y < h - 100; y += 60) {
        g.fill(polyPath([[x, y - 5], [x + 5, y], [x, y + 5], [x - 5, y]]));
      }
    }
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = g.createPattern(noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 'repeat');
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
}

/** Tapis Beni Ouarain : laine crème épaisse, treillis de losanges brun. */
function beniTex() {
  return rugCached('rug:beni', 900, 520, (g, w, h) => {
    g.fillStyle = '#EEE6D6';
    g.fillRect(0, 0, w, h);
    const shag = g.createPattern(noiseTile('shag', 128, 16, 3, 1.2, 44, 110), 'repeat');
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = shag;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    const r = rng(12);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const cw = 150;
    for (let x = -cw * 3; x < w + cw * 3; x += cw) {
      for (const dir of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          pts.push([x + dir * h * 0.9 * t + (r() - 0.5) * 5, h * t + (r() - 0.5) * 5]);
        }
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = `rgba(58,46,38,${0.25 + k * 0.14})`;
          g.lineWidth = 10 - k * 3;
          g.beginPath();
          pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
          g.stroke();
        }
      }
    }
    // la laine repasse sur les motifs (contours duveteux)
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.9;
    g.fillStyle = shag;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  });
}

/** Tresse de jute (tuile raccordable). */
function juteBraidTile() {
  return cached('jute-braid', 36, 24, (g) => {
    g.fillStyle = '#B8965F';
    g.fillRect(0, 0, 36, 24);
    const cols = ['#CDAE7C', '#C4A472', '#D3B585', '#C8A976'];
    let k = 0;
    for (const [y, tilt, xs] of [[6, 0.5, [0, 18, 36]], [18, -0.5, [-9, 9, 27, 45]]]) {
      for (const x of xs) {
        g.fillStyle = 'rgba(90,65,35,0.35)';
        g.beginPath();
        g.ellipse(x + 1.5, y + 2, 8, 3, tilt, 0, TAU);
        g.fill();
        g.fillStyle = cols[k++ % cols.length];
        g.beginPath();
        g.ellipse(x, y, 9, 5, tilt, 0, TAU);
        g.fill();
      }
    }
  }, spriteRes());
}

/** Tapis en jute tressée à bordure noire. */
function juteTex() {
  return rugCached('rug:jute', 900, 520, (g, w, h) => {
    const t = juteBraidTile();
    const pat = g.createPattern(t, 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / t.__res));
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = g.createPattern(noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 'repeat');
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#2E2723';
    g.fillRect(0, 0, w, 30);
    g.fillRect(0, h - 30, w, 30);
    g.fillRect(0, 0, 30, h);
    g.fillRect(w - 30, 0, 30, h);
  });
}

/* ---------- Végétaux en sprites ---------- */

/**
 * Dessine une feuille sur un petit canevas temporaire (les découpes n'affectent qu'elle), puis la pose.
 * Le canevas couvre [-ox, w-ox] × [-oy, h-oy] dans le repère de la feuille.
 */
function stampLeaf(g, w, h, ox, oy, res, x, y, angle, paint) {
  const lc = makeCanvas(w * res, h * res);
  const lx = ctx2d(lc);
  lx.scale(res, res);
  lx.translate(ox, oy);
  paint(lx);
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.drawImage(lc, -ox, -oy, w, h);
  g.restore();
}

/** Bananier / oiseau de paradis : grandes feuilles oblongues déchirées sur de longs pétioles. */
function bananaSprite(seed, o = {}) {
  const w = 960;
  const h = 900;
  const res = spriteRes();
  return cached('plant:banana:' + seed + (o.green || ''), w, h, (g) => {
    const r = rng(seed);
    const bx = w / 2;
    const by = h;
    const green = o.green || '#4E7446';
    const n = o.n ?? 13;
    const leaves = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const spread = 0.05 + (i / n) * 0.48 + r() * 0.08;
      leaves.push({ a: -Math.PI / 2 + side * spread, stem: 170 + r() * 230, L: 215 + r() * 75, Wd: 48 + r() * 16, d: r(), side });
    }
    leaves.sort((p, q) => p.d - q.d);
    for (const f of leaves) {
      const ex = bx + Math.cos(f.a) * f.stem;
      const ey = by + Math.sin(f.a) * f.stem;
      g.strokeStyle = mix('#5A7444', '#8C9A60', f.d);
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx + f.side * 5, by);
      g.quadraticCurveTo(bx + (ex - bx) * 0.25, by - f.stem * 0.6, ex, ey);
      g.stroke();
      const col = mix(dk(green, 0.22), lt(green, 0.18), f.d);
      const L = f.L;
      const Wd = f.Wd;
      const la = f.a + f.side * (0.1 + r() * 0.25);
      const tears = Array.from({ length: 3 + Math.floor(r() * 3) }, () => [0.2 + r() * 0.7, r() > 0.5 ? 1 : -1, 0.3 + r() * 0.4]);
      stampLeaf(g, L + 10, Wd * 2.5, 4, Wd * 1.25, res, ex, ey, la, (lx) => {
        const p = new Path2D();
        p.moveTo(0, 0);
        p.bezierCurveTo(L * 0.12, -Wd * 1.05, L * 0.78, -Wd * 1.1, L, -Wd * 0.08);
        p.bezierCurveTo(L * 0.8, Wd * 0.95, L * 0.12, Wd * 0.92, 0, 0);
        lx.fillStyle = lg(lx, 0, -Wd, 0, Wd, [[0, lt(col, 0.22)], [0.48, col], [0.52, dk(col, 0.1)], [1, dk(col, 0.32)]]);
        lx.fill(p);
        lx.save();
        lx.clip(p);
        lx.strokeStyle = rgba(dk(col, 0.4), 0.16);
        lx.lineWidth = 1;
        lx.beginPath();
        for (let k = 0.06; k < 0.98; k += 0.03) {
          lx.moveTo(L * k, 0);
          lx.lineTo(L * (k + 0.12), -Wd * 1.1);
          lx.moveTo(L * k, 0);
          lx.lineTo(L * (k + 0.12), Wd * 1.1);
        }
        lx.stroke();
        lx.fillStyle = rg(lx, L * 0.45, -Wd * 0.4, 0, L * 0.45, -Wd * 0.4, L * 0.5, [[0, 'rgba(255,255,235,0.14)'], [1, 'rgba(255,255,235,0)']]);
        lx.fillRect(0, -Wd * 1.2, L, Wd * 2.4);
        lx.restore();
        // déchirures (découpées dans cette feuille seulement)
        lx.globalCompositeOperation = 'destination-out';
        lx.strokeStyle = '#000';
        lx.lineWidth = 2.4;
        for (const [t, sgn, depth] of tears) {
          lx.beginPath();
          lx.moveTo(L * (t + 0.12), sgn * Wd * 1.2);
          lx.lineTo(L * t + 3, sgn * Wd * (1 - depth));
          lx.stroke();
        }
        lx.globalCompositeOperation = 'source-over';
        lx.strokeStyle = rgba(lt(col, 0.5), 0.65);
        lx.lineWidth = 3;
        lx.beginPath();
        lx.moveTo(0, 0);
        lx.quadraticCurveTo(L * 0.5, -3, L * 0.97, -Wd * 0.05);
        lx.stroke();
      });
    }
  }, res);
}

/** Pampa : plumeaux vaporeux et retombants sur tiges fines. */
function pampasSprite(seed) {
  const w = 380;
  const h = 640;
  return cached('plant:pampas:' + seed, w, h, (g) => {
    const r = rng(seed);
    const bx = w / 2;
    const by = h;
    const stems = [];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 6 - 0.5) * 0.95 + (r() - 0.5) * 0.12;
      const len = 430 + r() * 150;
      stems.push({ a, len, ex: bx + Math.cos(a) * len, ey: by + Math.sin(a) * len, cx: bx + Math.cos(a) * len * 0.5 + (r() - 0.5) * 30, cy: by + Math.sin(a) * len * 0.5 });
    }
    for (const st of stems) {
      g.strokeStyle = '#B09A74';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(st.cx, st.cy, st.ex, st.ey);
      g.stroke();
    }
    const at = (st, t) => {
      const u = 1 - t;
      return [u * u * bx + 2 * u * t * st.cx + t * t * st.ex, u * u * by + 2 * u * t * st.cy + t * t * st.ey];
    };
    stems.forEach((st, i) => {
      const col = i % 3 === 0 ? [244, 236, 218] : [234, 220, 196];
      // masse vaporeuse
      for (let k = 0; k < 16; k++) {
        const t = 0.64 + (k / 15) * 0.36;
        const [px, py] = at(st, t);
        const s = Math.sin(((t - 0.62) / 0.38) * Math.PI) * 26 + 8;
        g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.16)`;
        g.beginPath();
        g.ellipse(px, py + s * 0.25, s * 0.9, s * 1.2, st.a + Math.PI / 2, 0, TAU);
        g.fill();
      }
      // barbes retombantes
      for (let k = 0; k < 190; k++) {
        const t = 0.62 + r() * 0.38;
        const [px, py] = at(st, t);
        const spread = Math.sin(((t - 0.62) / 0.38) * Math.PI) * 30 + 8;
        const side = r() > 0.5 ? 1 : -1;
        const l = 10 + r() * spread;
        const dx = Math.cos(st.a + side * 1.25) * l;
        const dy = Math.sin(st.a + side * 1.25) * l;
        g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.2 + r() * 0.3})`;
        g.lineWidth = 1.2 + r() * 2.2;
        g.beginPath();
        g.moveTo(px, py);
        g.quadraticCurveTo(px + dx * 0.6, py + dy * 0.6, px + dx, py + dy + l * 0.45);
        g.stroke();
      }
    });
  }, spriteRes());
}

/** Monstera : feuilles en cœur, fentes et perforations. */
function monsteraSprite(seed) {
  const w = 520;
  const h = 640;
  const res = spriteRes();
  return cached('plant:monstera:' + seed, w, h, (g) => {
    const r = rng(seed);
    const bx = w / 2;
    const by = h;
    const leaves = [];
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      leaves.push({ a: -Math.PI / 2 + side * (0.08 + r() * 0.62), stem: 190 + r() * 230, R: 58 + r() * 26, d: r(), side });
    }
    leaves.sort((p, q) => p.d - q.d);
    for (const f of leaves) {
      const ex = bx + Math.cos(f.a) * f.stem;
      const ey = by + Math.sin(f.a) * f.stem;
      g.strokeStyle = '#5C7A4B';
      g.lineWidth = 4.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + (ex - bx) * 0.3, by - f.stem * 0.6, ex, ey);
      g.stroke();
      const col = mix('#23462A', '#4F7E46', f.d);
      const R = f.R;
      const slits = Array.from({ length: 5 }, (_, k) => [-0.05 - k * 0.2 + (r() - 0.5) * 0.05, 0.3 + r() * 0.12]);
      stampLeaf(g, R * 2.3, R * 2, R * 1.15, R * 1.55, res, ex, ey, f.a + Math.PI / 2 + f.side * 0.35, (lx) => {
        lx.translate(0, -R * 0.3);
        const p = new Path2D();
        p.moveTo(0, R * 0.32);
        p.bezierCurveTo(-R * 0.4, R * 0.6, -R * 1.12, R * 0.4, -R * 1.08, -R * 0.2);
        p.bezierCurveTo(-R * 1.02, -R * 0.82, -R * 0.42, -R * 1.18, 0, -R * 1.22);
        p.bezierCurveTo(R * 0.42, -R * 1.18, R * 1.02, -R * 0.82, R * 1.08, -R * 0.2);
        p.bezierCurveTo(R * 1.12, R * 0.4, R * 0.4, R * 0.6, 0, R * 0.32);
        lx.fillStyle = lg(lx, -R, -R, R, R * 0.4, [[0, lt(col, 0.2)], [0.55, col], [1, dk(col, 0.25)]]);
        lx.fill(p);
        lx.fillStyle = rg(lx, -R * 0.3, -R * 0.5, 0, -R * 0.3, -R * 0.5, R * 0.9, [[0, 'rgba(255,255,235,0.14)'], [1, 'rgba(255,255,235,0)']]);
        lx.fill(p);
        // fentes et trous (dans cette feuille seulement)
        lx.globalCompositeOperation = 'destination-out';
        lx.strokeStyle = '#000';
        lx.lineCap = 'round';
        lx.lineWidth = R * 0.075;
        for (const [yk, inner] of slits) {
          for (const sgn of [-1, 1]) {
            const y0 = yk * R;
            lx.beginPath();
            lx.moveTo(sgn * R * 1.3, y0 - R * 0.55);
            lx.lineTo(sgn * R * inner, y0 - R * 0.05);
            lx.stroke();
          }
        }
        lx.fillStyle = '#000';
        for (const [yk] of slits.slice(1, 4)) {
          for (const sgn of [-1, 1]) {
            lx.beginPath();
            lx.ellipse(sgn * R * 0.2, yk * R + R * 0.02, R * 0.05, R * 0.09, 0, 0, TAU);
            lx.fill();
          }
        }
        lx.globalCompositeOperation = 'source-over';
        lx.strokeStyle = rgba(lt(col, 0.45), 0.6);
        lx.lineWidth = 2.2;
        lx.beginPath();
        lx.moveTo(0, R * 0.32);
        lx.lineTo(0, -R * 1.15);
        lx.stroke();
      });
    }
  }, res);
}

/** Pothos retombant (tiges et feuilles en cœur). */
function pothosSprite(seed, o = {}) {
  const w = o.w ?? 300;
  const h = o.h ?? 520;
  return cached('plant:pothos:' + seed + ':' + w + 'x' + h, w, h, (g) => {
    const r = rng(seed);
    const bx = w / 2;
    const top = o.top ?? 40;
    const vines = o.vines ?? 7;
    for (let i = 0; i < vines; i++) {
      const dir = (i / (vines - 1) - 0.5) * 2;
      const len = h * (0.45 + r() * 0.5);
      const pts = [];
      let x = bx + dir * 20;
      let y = top;
      for (let k = 0; k < 20; k++) {
        pts.push([x, y]);
        x += dir * 7 * (1 - k / 22) + (r() - 0.5) * 6;
        y += len / 20;
      }
      g.strokeStyle = '#5D7446';
      g.lineWidth = 1.8;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
      for (let k = 1; k < pts.length; k += 2) {
        const [px, py] = pts[k];
        const side = k % 4 === 1 ? 1 : -1;
        const L = 26 + r() * 12 - k * 0.4;
        const col = mix('#41683A', '#7FA05E', r());
        g.save();
        g.translate(px, py);
        g.rotate(Math.PI / 2 + side * (0.7 + r() * 0.5));
        const p = new Path2D();
        p.moveTo(0, 0);
        p.bezierCurveTo(L * 0.1, -L * 0.55, L * 0.75, -L * 0.45, L, 0);
        p.bezierCurveTo(L * 0.75, L * 0.45, L * 0.1, L * 0.55, 0, 0);
        g.fillStyle = lg(g, 0, -L * 0.5, 0, L * 0.5, [[0, lt(col, 0.2)], [1, dk(col, 0.25)]]);
        g.fill(p);
        g.strokeStyle = 'rgba(230,240,200,0.35)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(1, 0);
        g.lineTo(L * 0.85, 0);
        g.stroke();
        if (o.variegated) {
          g.fillStyle = 'rgba(235,230,180,0.35)';
          g.beginPath();
          g.ellipse(L * 0.5, -L * 0.12, L * 0.18, L * 0.08, 0.3, 0, TAU);
          g.fill();
        }
        g.restore();
      }
    }
  }, spriteRes());
}

/** Bouquet (hortensias blancs, roses, feuillage). */
function bouquetSprite(seed) {
  const w = 300;
  const h = 260;
  return cached('plant:bouquet:' + seed, w, h, (g) => {
    const r = rng(seed);
    const cx = w / 2;
    const cy = h * 0.55;
    // feuillage
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 3;
      leaf(g, cx + Math.cos(a) * 30, cy + 30 + Math.sin(a) * 20, 60 + r() * 50, 12, a, mix('#50694A', '#86997A', r()), { rib: false });
    }
    // hortensias : têtes faites de petites fleurs
    const heads = [[cx - 60, cy - 10, 56], [cx + 50, cy - 20, 60], [cx - 5, cy - 60, 58], [cx + 5, cy + 25, 50]];
    for (const [hx, hy, R] of heads) {
      g.fillStyle = rg(g, hx - R * 0.3, hy - R * 0.3, 0, hx, hy, R, [[0, '#FBF8F2'], [1, '#D9D5C7']]);
      g.beginPath();
      g.arc(hx, hy, R, 0, TAU);
      g.fill();
      for (let k = 0; k < 70; k++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * R * 0.95;
        const fx = hx + Math.cos(a) * d;
        const fy = hy + Math.sin(a) * d;
        const shade = (fy - hy + R) / (2 * R);
        g.fillStyle = mix('#FFFDF8', '#C9C6B5', shade * 0.8 + r() * 0.2);
        for (let p = 0; p < 4; p++) {
          const pa = (p / 4) * TAU + a;
          g.beginPath();
          g.ellipse(fx + Math.cos(pa) * 3.5, fy + Math.sin(pa) * 3.5, 3.6, 2.6, pa, 0, TAU);
          g.fill();
        }
      }
    }
    // roses poudrées
    for (const [rx, ry] of [[cx - 95, cy + 30], [cx + 95, cy + 15], [cx + 40, cy + 55]]) {
      g.fillStyle = '#E4B9A8';
      g.beginPath();
      g.arc(rx, ry, 17, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(150,90,75,0.45)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(rx + 1, ry + 1, 13 - k * 3, k, k + 3.6);
        g.stroke();
      }
    }
  }, spriteRes());
}

/** Petite plante grasse en pot (appui de fenêtre). */
function drawSucculent(g, cx, baseY, s = 1, seed = 1, potCol = '#C97B5A') {
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 8 - 0.5) * 2.6;
    leaf(g, cx, baseY - 30 * s, (20 + r() * 12) * s, 6 * s, a, mix('#6F8F6A', '#9DB595', r()), { rib: false, tip: 0.4 });
  }
  drawPot(g, cx, baseY, 40 * s, 34 * s, { color: potCol, taper: 0.8 });
}

/* ================================================================== */
/* Décor 1 — Salon moderne                                             */
/* ================================================================== */

const SPEC_SALON_MODERNE = {
  mode: 'window',
  window: { x: 480, y: 150, w: 640, h: 560 },
  ceilingY: 40,
  floorY: 828,
  sillY: 710,
  rodMaxX0: 230,
  rodMaxX1: 1370,
  hardware: 'black',
};

function drawSalonModerne(ctx, api) {
  const spec = SPEC_SALON_MODERNE;
  const win = spec.window;
  layer(ctx, 'salon-moderne/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#D9CCB9',
      tex: 'limewash',
      ceilingColor: '#EEE8DE',
      glow: { x: 800, y: 420, r: 760, a: 0.55 },
      baseboard: { h: 24, color: '#E3D8C8' },
    });
    drawWindow(g, win, {
      frame: '#2E2C2A', reveal: '#E4D9C9', leaves: 3, rows: 1, fw: 12, sw: 9, depth: 30,
      transom: 110, transomBars: 3, handle: false,
      sill: { color: '#E6DED1', over: 18, h: 12 },
    });
    drawFloor(g, woodFloorTex('oak-warm', { dir: 'depth', plankW: 70, colors: ['#C7A27A', '#BD976C', '#CFAC82', '#C29B70'], minL: 300, maxL: 640 }), {
      light: { x0: 480, x1: 1120, a: 0.5 }, gloss: 0.16,
    });
    drawRug(g, woolRugTex('salon', '#E9E1D3', 'rgba(170,150,125,0.35)'), 250, 1350, 150, 520, { shadow: 0.2 });
    backFinish(g, { tint: 'rgba(255,236,210,0.12)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Figuier lyre à gauche
  layer(ctx, 'salon-moderne/plant', [0, 0, 440, 900], (g) => {
    atDepth(g, 120, () => {
      softEllipse(g, 190, FL, 110, 16, SHADOW, 0.35);
      g.drawImage(fiddleFigSprite(3), 190 - 171, FL - 150 - 576 + 30, 342, 576);
      drawPot(g, 190, FL, 150, 170, { color: '#E9E3D8', ribs: true, taper: 0.78 });
    });
  });
  layer(ctx, 'salon-moderne/lamp', [800, 100, 800, 800], (g) => drawArcLamp(g));

  const sofa = { x0: 430, x1: 1170, z0: 40, z1: 300, color: '#ECE5DA', texture: 'boucle' };
  layer(ctx, 'salon-moderne/sofa', [300, 450, 1000, 550], (g) => drawSofaBack(g, sofa));
  const seatTop = FL - 118;
  atDepth(ctx, sofa.z0 + 170, () => {
    cushion(ctx, api, 630, seatTop - 60, 150, 146, { rot: -0.1, color: '#C9B79C' });
    cushion(ctx, api, 790, seatTop - 54, 138, 132, { rot: 0.05, color: '#B5654A' });
    cushion(ctx, api, 960, seatTop - 60, 150, 142, { rot: 0.12, color: '#D8CBB4' });
  });
  layer(ctx, 'salon-moderne/sofa-front', [300, 450, 1000, 550], (g) => drawSofaFront(g, sofa));
  // Plaid sur l'accoudoir droit
  atDepth(ctx, sofa.z1 - 20, () => {
    const ax = sofa.x1 - 96;
    const armTop = FL - 196;
    const base = FL;
    const p = new Path2D();
    p.moveTo(ax - 24, armTop + 8);
    p.bezierCurveTo(ax + 20, armTop - 12, ax + 70, armTop - 12, ax + 104, armTop + 18);
    p.bezierCurveTo(ax + 112, armTop + 80, ax + 100, base - 60, ax + 96, base - 18);
    p.lineTo(ax + 70, base - 8);
    p.lineTo(ax + 44, base - 20);
    p.lineTo(ax + 16, base - 12);
    p.bezierCurveTo(ax + 4, armTop + 150, ax - 20, armTop + 90, ax - 34, armTop + 40);
    p.closePath();
    blurShape(ctx, p, 'rgba(40,28,20,0.3)', 10, -4, 6);
    textile(ctx, api, 'throw', p, {
      kind: 'throw', bounds: { x: ax - 34, y: armTop - 12, w: 146, h: base - armTop },
      fallbackColor: '#8E9C7C', scale: 90, foldAngle: 8,
    });
  });
  layer(ctx, 'salon-moderne/table', [440, 600, 720, 400], (g) => drawTravertineTable(g, 800, 380));

  finish(ctx, { tint: 'rgba(255,236,210,0.12)' });
  });
}

function drawArcLamp(ctx) {
  const bx = 1440;
  const bz = 170;
  atDepth(ctx, bz, () => {
    softEllipse(ctx, bx, FL, 60, 10, SHADOW, 0.45);
    const p = rrPath(bx - 42, FL - 26, 84, 26, 6);
    ctx.fillStyle = lg(ctx, bx - 42, 0, bx + 42, 0, [[0, '#F1EEE8'], [0.6, '#D9D4CB'], [1, '#B9B3A9']]);
    ctx.fill(p);
    ctx.fillStyle = '#FBF9F5';
    ctx.fillRect(bx - 42, FL - 26, 84, 3);
    ctx.lineCap = 'round';
    const arc = new Path2D();
    arc.moveTo(bx, FL - 24);
    arc.bezierCurveTo(bx + 6, 330, bx - 60, 150, bx - 290, 190);
    arc.bezierCurveTo(bx - 400, 215, bx - 450, 300, bx - 452, 372);
    ctx.strokeStyle = '#2B2926';
    ctx.lineWidth = 5.5;
    ctx.stroke(arc);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.save();
    ctx.translate(-1.5, -1);
    ctx.stroke(arc);
    ctx.restore();
    // abat-jour dôme
    const sx = bx - 452;
    const sy = 372;
    glow(ctx, sx, sy + 80, 240, '255,228,178', 0.3);
    const d = new Path2D();
    d.moveTo(sx - 86, sy + 66);
    d.bezierCurveTo(sx - 82, sy - 6, sx + 82, sy - 6, sx + 86, sy + 66);
    d.closePath();
    blurShape(ctx, d, 'rgba(40,30,20,0.25)', 14, 6, 10);
    ctx.fillStyle = lg(ctx, sx - 86, 0, sx + 86, 0, [[0, '#3A3733'], [0.3, '#5E5852'], [0.55, '#3A3632'], [1, '#1F1D1B']]);
    ctx.fill(d);
    ctx.fillStyle = rg(ctx, sx, sy + 66, 0, sx, sy + 66, 86, [[0, 'rgba(255,248,226,1)'], [0.5, 'rgba(255,232,190,0.95)'], [1, 'rgba(220,190,140,0.9)']]);
    ctx.beginPath();
    ctx.ellipse(sx, sy + 66, 86, 11, 0, 0, TAU);
    ctx.fill();
  });
}

function drawTravertineTable(ctx, cx, zc) {
  const col = '#E4D7C3';
  const r = 150;
  const yTop = FL - 96;
  const tex = noiseTile('travertine', 128, 4, 4, 1.2, 41, 30);
  softEllipse(ctx, pX(cx, zc), pY(FL, zc) - 4, r * sc(zc) * 1.05, 22, SHADOW, 0.5);
  cylinder(ctx, {
    cx, zc, rad: r * 0.64, yTop: yTop + 20, yBot: FL,
    side: (a, b) => lg(ctx, a, 0, b, 0, [[0, lt(col, 0.05)], [0.3, lt(col, 0.22)], [1, dk(col, 0.35)]]),
  });
  const t = cylinder(ctx, {
    cx, zc, rad: r, yTop, yBot: yTop + 20,
    side: (a, b) => lg(ctx, a, 0, b, 0, [[0, lt(col, 0.12)], [0.3, lt(col, 0.28)], [1, dk(col, 0.25)]]),
    top: (X, y, rx) => lg(ctx, X - rx, y, X + rx, y, [[0, lt(col, 0.35)], [1, lt(col, 0.02)]]),
  });
  texturize(ctx, t.tp, tex, 0.45, 'soft-light');
  texturize(ctx, t.body, tex, 0.35, 'soft-light');
  // livres + vase sculptural
  const X = t.X;
  const Y = t.top;
  ctx.fillStyle = lg(ctx, 0, Y - 14, 0, Y, [[0, '#56514A'], [1, '#3E3A34']]);
  ctx.fillRect(X - 150, Y - 12, 118, 12);
  ctx.fillStyle = lg(ctx, 0, Y - 24, 0, Y - 12, [[0, '#D9CDB8'], [1, '#BFB29C']]);
  ctx.fillRect(X - 142, Y - 23, 100, 11);
  ctx.fillStyle = '#F4EFE6';
  ctx.fillRect(X - 142, Y - 23, 100, 2);
  const v = new Path2D();
  v.moveTo(X + 34, Y - 2);
  v.bezierCurveTo(X + 6, Y - 30, X + 30, Y - 64, X + 54, Y - 70);
  v.bezierCurveTo(X + 50, Y - 80, X + 50, Y - 88, X + 56, Y - 92);
  v.lineTo(X + 72, Y - 92);
  v.bezierCurveTo(X + 78, Y - 88, X + 78, Y - 80, X + 74, Y - 70);
  v.bezierCurveTo(X + 98, Y - 64, X + 122, Y - 30, X + 94, Y - 2);
  v.closePath();
  blurShape(ctx, v, 'rgba(40,28,20,0.3)', 6, 6, 3);
  ctx.fillStyle = lg(ctx, X + 20, 0, X + 110, 0, [[0, '#C4987A'], [0.35, '#DDB597'], [1, '#8A5F45']]);
  ctx.fill(v);
  ctx.strokeStyle = '#8B7A64';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  const r2 = rng(5);
  for (let i = 0; i < 4; i++) {
    const ex = X + 64 + (i - 1.5) * 42 + r2() * 10;
    const ey = Y - 190 - r2() * 50;
    ctx.beginPath();
    ctx.moveTo(X + 64, Y - 90);
    ctx.quadraticCurveTo(X + 64 + (i - 1.5) * 12, Y - 150, ex, ey);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const t2 = 0.4 + k * 0.1;
      const lx = X + 64 + (ex - X - 64) * t2;
      const ly = Y - 90 + (ey - Y + 90) * t2;
      ctx.fillStyle = 'rgba(150,130,100,0.8)';
      ctx.beginPath();
      ctx.ellipse(lx + (k % 2 ? 5 : -5), ly, 4, 1.6, k % 2 ? 0.6 : -0.6, 0, TAU);
      ctx.fill();
    }
  }
}

/* ================================================================== */
/* Œuvres d'art (contenu des cadres)                                   */
/* ================================================================== */

function paperTexture(g, x, y, w, h, a = 0.35) {
  texturize(g, rrPath(x, y, w, h, 0), noiseTile('paper', 128, 16, 3, 0.5, 91, 40), a, 'soft-light');
}

/** Composition d'arches (tons terre). */
function artArches(g, x, y, w, h, v = 1) {
  g.fillStyle = v === 1 ? '#EFE5D6' : '#E9DCCB';
  g.fillRect(x, y, w, h);
  const arch = (ax, aw, top, bottom, col) => {
    const p = new Path2D();
    p.moveTo(ax, bottom);
    p.lineTo(ax, top + aw / 2);
    p.arc(ax + aw / 2, top + aw / 2, aw / 2, Math.PI, 0);
    p.lineTo(ax + aw, bottom);
    p.closePath();
    g.fillStyle = col;
    g.fill(p);
  };
  if (v === 1) {
    arch(x + w * 0.18, w * 0.64, y + h * 0.22, y + h, '#C27B5C');
    arch(x + w * 0.34, w * 0.32, y + h * 0.5, y + h, '#E3C3A1');
    blob(g, x + w * 0.72, y + h * 0.2, w * 0.09, w * 0.09, '#D6A05A');
  } else {
    g.fillStyle = '#D9C2A6';
    g.fillRect(x, y + h * 0.62, w, h * 0.38);
    arch(x + w * 0.1, w * 0.46, y + h * 0.3, y + h * 0.9, '#9C5A43');
    arch(x + w * 0.46, w * 0.42, y + h * 0.16, y + h * 0.9, '#E6D3BB');
    blob(g, x + w * 0.3, y + h * 0.16, w * 0.07, w * 0.07, '#C27B5C');
  }
  paperTexture(g, x, y, w, h);
}

/** Paysage classique (huile, tons passés). */
function artLandscape(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = lg(g, 0, y, 0, y + h, [[0, '#B9C2B8'], [0.45, '#E4DCC5'], [0.55, '#C9BE9A'], [1, '#6E6A4C']]);
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 6; i++) blob(g, x + r() * w, y + h * (0.1 + r() * 0.25), w * 0.2, h * 0.04, 'rgba(250,245,230,0.5)');
  g.fillStyle = 'rgba(120,130,110,0.6)';
  g.beginPath();
  g.moveTo(x, y + h * 0.58);
  for (let i = 0; i <= 10; i++) g.lineTo(x + (w * i) / 10, y + h * (0.52 + r() * 0.06));
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.fill();
  // eau
  g.fillStyle = 'rgba(210,215,200,0.7)';
  g.fillRect(x, y + h * 0.7, w, h * 0.06);
  // arbres
  for (let i = 0; i < 3; i++) {
    const tx = x + w * (seed % 2 ? 0.2 + i * 0.12 : 0.55 + i * 0.12);
    const th = h * (0.35 + r() * 0.15);
    g.fillStyle = '#4E4A33';
    g.fillRect(tx - 2, y + h * 0.7 - th * 0.5, 4, th * 0.5);
    canopy(g, r, tx, y + h * 0.7 - th * 0.6, w * 0.22, th * 0.7, '#57603F', '#7D8660');
  }
  g.fillStyle = 'rgba(60,55,35,0.35)';
  g.fillRect(x, y + h * 0.82, w, h * 0.18);
  // vernis ambré
  g.fillStyle = 'rgba(160,120,50,0.18)';
  g.fillRect(x, y, w, h);
  texturize(g, rrPath(x, y, w, h, 0), noiseTile('canvas', 64, 16, 2, 0.6, 5, 70), 0.4, 'soft-light');
}

/* ================================================================== */
/* Décor 2 — Chambre cosy                                              */
/* ================================================================== */

const SPEC_CHAMBRE_COSY = {
  mode: 'window',
  window: { x: 230, y: 170, w: 380, h: 500 },
  ceilingY: 40,
  floorY: 828,
  sillY: 670,
  rodMaxX0: 40,
  rodMaxX1: 820,
  hardware: 'brass',
};

/** Capitonnage : boutons en quinconce, plis, reflets du velours. */
function tufted(g, p, x, y, w, h, col) {
  g.fillStyle = lg(g, 0, y, 0, y + h, [[0, lt(col, 0.18)], [0.2, col], [0.55, dk(col, 0.08)], [1, dk(col, 0.25)]]);
  g.fill(p);
  g.save();
  g.clip(p);
  const dx = 70;
  const dy = 58;
  const pts = [];
  for (let j = 0; j < 7; j++) {
    for (let i = -1; i < w / dx + 1; i++) {
      pts.push([x + dx / 2 + i * dx + (j % 2 ? dx / 2 : 0), y + 46 + j * dy]);
    }
  }
  // bombés entre les boutons
  for (const [bx, by] of pts) {
    g.fillStyle = rg(g, bx - 8, by - dy / 2 - 6, 0, bx, by - dy / 2, dx * 0.55, [
      [0, rgba(lt(col, 0.35), 0.55)], [1, rgba(lt(col, 0.35), 0)],
    ]);
    g.fillRect(bx - dx, by - dy * 1.2, dx * 2, dy * 1.4);
  }
  // plis diagonaux
  g.lineCap = 'round';
  for (const [bx, by] of pts) {
    for (const [ox, oy] of [[dx / 2, dy], [-dx / 2, dy]]) {
      g.strokeStyle = rgba(dk(col, 0.45), 0.35);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + ox, by + oy);
      g.stroke();
      g.strokeStyle = rgba(lt(col, 0.4), 0.3);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(bx + 1.5, by - 1);
      g.lineTo(bx + ox + 1.5, by + oy - 1);
      g.stroke();
    }
  }
  for (const [bx, by] of pts) {
    g.fillStyle = rgba(dk(col, 0.55), 0.8);
    g.beginPath();
    g.arc(bx, by, 4.2, 0, TAU);
    g.fill();
    g.fillStyle = rgba(lt(col, 0.5), 0.7);
    g.beginPath();
    g.arc(bx - 1.2, by - 1.2, 1.6, 0, TAU);
    g.fill();
  }
  // brillance du velours (bande verticale)
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = lg(g, x, 0, x + w, 0, [[0, 'rgba(255,255,255,0.25)'], [0.3, 'rgba(255,255,255,0.05)'], [0.6, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.25)']]);
  g.fillRect(x, y, w, h);
  g.restore();
}

function drawChambreCosy(ctx, api) {
  const spec = SPEC_CHAMBRE_COSY;
  const win = spec.window;
  layer(ctx, 'chambre-cosy/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#D8B9A4', tex: 'limewash', ceilingColor: '#F1E7DD',
      glow: { x: 420, y: 400, r: 640, a: 0.5 }, baseboard: { h: 26, color: '#E9D9C9' },
    });
    drawFrame(g, 1026, 188, 156, 200, { style: 'oak', mat: 17 }, (x, y, w, h) => artArches(g, x, y, w, h, 1));
    drawFrame(g, 1218, 188, 156, 200, { style: 'oak', mat: 17 }, (x, y, w, h) => artArches(g, x, y, w, h, 2));
    drawWindow(g, win, { frame: '#F4EFE7', reveal: '#E8D6C7', leaves: 2, rows: 3, fw: 14, sw: 11, bar: 5, depth: 28, sill: { color: '#EFE5D9' } });
    drawSucculent(g, 300, win.y + win.h, 1, 4, '#E2D5C3');
    drawFloor(g, woodFloorTex('oak-honey-across', { dir: 'across', plankW: 46, colors: ['#B98A5E', '#AE7F55', '#C29568', '#B3865B'], minL: 360, maxL: 720 }), {
      light: { x0: 230, x1: 610, a: 0.45 }, gloss: 0.12,
    });
    const rugTex = woolRugTex('chambre', '#E6DAC8', null);
    drawRug(g, rugTex, 470, 1600, 90, 470, { shadow: 0.18 });
    backFinish(g, { tint: 'rgba(255,220,190,0.14)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  const hbTop = 418;
  const bx0 = 920;
  const bx1 = 1480;
  const mTop = 648; // dessus du matelas
  const dTop = 628; // dessus de la couette
  const zb = 170;
  const zf = 600;

  // Chevet + lampe
  layer(ctx, 'chambre-cosy/nightstand', [580, 280, 420, 640], (g) => {
    const col = '#8A5E3E';
    const z0 = 20;
    const z1 = 130;
    const top = 650;
    floorShadow(g, 752, 888, z0, z1, 0.45, 12);
    prism(g, {
      x: 750, y: top, w: 140, h: FL - 8 - top, r: 3, z0, z1,
      side: dk(col, 0.3), top: lg(g, 0, pY(top, z0), 0, pY(top, z1), [[0, dk(col, 0.05)], [1, lt(col, 0.18)]]),
      front: (p) => {
        g.fillStyle = lg(g, 750, 0, 890, 0, [[0, lt(col, 0.12)], [1, dk(col, 0.15)]]);
        g.fill(p);
        g.save();
        g.clip(p);
        g.globalCompositeOperation = 'overlay';
        g.globalAlpha = 0.22;
        g.fillStyle = grainPattern(g, 750, top, 90, 1.3, 3.2);
        g.fillRect(750, top, 140, FL - top);
        g.restore();
        g.strokeStyle = rgba(dk(col, 0.5), 0.6);
        g.lineWidth = 2;
        g.strokeRect(758, top + 14, 124, 62);
        g.fillStyle = '#D2B170';
        g.beginPath();
        g.arc(820, top + 45, 5, 0, TAU);
        g.fill();
      },
    });
    atDepth(g, 130, () => {
      g.fillStyle = '#3A2A1F';
      g.fillRect(756, FL - 10, 10, 10);
      g.fillRect(874, FL - 10, 10, 10);
    });
    atDepth(g, 70, () => {
      // livres + lampe
      g.fillStyle = '#6F7A64';
      g.fillRect(772, top - 12, 70, 12);
      g.fillStyle = '#D8C7AE';
      g.fillRect(776, top - 22, 62, 10);
      drawTableLamp(g, 830, top - 2, { base: '#C8875A', shade: '#F4EBDC', baseH: 100, baseW: 70, shadeTop: 86, shadeBot: 128, shadeH: 80 });
    });
  });

  // Lit : tête de lit, sommier, draps, oreillers
  layer(ctx, 'chambre-cosy/bed', [880, 400, 720, 600], (g) => {
    const col = '#B58458';
    blurShape(g, rrPath(bx0 - 20, hbTop, bx1 - bx0 + 40, FL - hbTop, 40), 'rgba(60,40,30,0.3)', 26, 6, 8);
    prism(g, {
      x: bx0 - 20, y: hbTop, w: bx1 - bx0 + 40, h: FL - hbTop, r: 40, z0: 0, z1: 30,
      side: dk(col, 0.3), top: lt(col, 0.12),
      front: (p) => tufted(g, p, bx0 - 20, hbTop, bx1 - bx0 + 40, FL - hbTop, col),
    });
    // sommier + matelas (drap blanc)
    floorShadow(g, bx0, bx1 + 200, 30, zf, 0.5, 18);
    prism(g, {
      x: bx0, y: mTop, w: bx1 - bx0, h: FL - 14 - mTop, r: 10, z0: 30, z1: zf,
      side: lg(g, 0, pY(mTop, 300), 0, pY(FL, 300), [[0, '#EDE7DD'], [1, '#CFC6B8']]),
      top: '#F4F0E8',
    });
    // oreillers
    const pillow = (cx, cy, w, h) => {
      const p = cushionPath(cx, cy, w, h, 0, 0.05);
      blurShape(g, p, 'rgba(60,45,35,0.3)', 10, 4, 6);
      basePaintTextile(g, p, { kind: 'cushion', fallbackColor: '#F3EFE7', bounds: { x: cx - w / 2, y: cy - h / 2, w, h }, light: -0.8 });
    };
    atDepth(g, 60, () => {
      pillow(1074, mTop - 54, 280, 132);
      pillow(1326, mTop - 54, 280, 132);
    });
  });

  // Coussins décoratifs (textile)
  atDepth(ctx, 105, () => {
    cushion(ctx, api, 1082, mTop - 76, 182, 176, { rot: -0.05, color: '#C9A27E', light: -0.9, scale: 105 });
    cushion(ctx, api, 1318, mTop - 76, 182, 176, { rot: 0.05, color: '#C9A27E', light: -0.9, scale: 105 });
    cushion(ctx, api, 1200, mTop - 44, 200, 100, { rot: 0.01, color: '#B5654A', light: -0.9, scale: 105 });
  });

  // Dessus-de-lit (textile) : dessus en perspective + retombées
  const P = (x, y, z) => [pX(x, z), pY(y, z)];
  const drop = 796;
  const topPath = polyPath([P(bx0, dTop, zb), P(bx1, dTop, zb), P(bx1, dTop, zf), P(bx0, dTop, zf)]);
  const sidePath = polyPath([P(bx0, dTop, zb), P(bx0, dTop, zf), P(bx0, drop, zf), P(bx0, drop, zb)]);
  const footPath = polyPath([P(bx0, dTop, zf), P(bx1, dTop, zf), P(bx1, drop, zf), P(bx0, drop, zf)]);
  const [ax, ay] = P(bx0, dTop, zb);
  const [fx, fy] = P(bx0, dTop, zf);
  const [, fyb] = P(bx0, drop, zf);
  blurShape(ctx, sidePath, 'rgba(40,28,20,0.35)', 12, -4, 8);
  textile(ctx, api, 'bedspread', sidePath, {
    kind: 'bedspread', topH: 0, drop: true, bounds: { x: ax, y: ay, w: fx - ax, h: fyb - ay }, fallbackColor: '#D9C7AE', scale: 150, light: -0.9,
  });
  textile(ctx, api, 'bedspread', footPath, {
    kind: 'bedspread', topH: 0, drop: true, bounds: { x: fx, y: fy, w: W - fx, h: H - fy }, fallbackColor: '#D9C7AE', scale: 170, light: -0.9,
  });
  textile(ctx, api, 'bedspread', topPath, {
    kind: 'bedspread', bounds: { x: ax, y: ay, w: W - ax, h: fy - ay }, fallbackColor: '#D9C7AE', scale: 150, squash: 0.45, light: -0.9,
  });
  // arrondi de la couette sur les arêtes
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ax, ay + 2);
  ctx.lineTo(fx, fy + 2);
  ctx.lineTo(W, fy + 2);
  ctx.stroke();
  ctx.restore();
  // Jeté de lit en maille, en travers du pied du lit
  layer(ctx, 'chambre-cosy/runner', [880, 600, 720, 400], (g) => {
    const r0 = 430;
    const r1 = 530;
    const k = '#A65A3E';
    const topBand = polyPath([P(bx0 - 6, dTop - 6, r0), P(bx1 + 6, dTop - 6, r0), P(bx1 + 6, dTop - 6, r1), P(bx0 - 6, dTop - 6, r1)]);
    const sideBand = polyPath([P(bx0 - 6, dTop - 6, r0), P(bx0 - 6, dTop - 6, r1), P(bx0 - 6, drop - 60, r1 + 4), P(bx0 - 6, drop - 50, r0 - 4)]);
    blurShape(g, topBand, 'rgba(50,30,20,0.35)', 8, 0, 5);
    blurShape(g, sideBand, 'rgba(50,30,20,0.35)', 8, -4, 5);
    for (const [band, light] of [[sideBand, 0.75], [topBand, 1]]) {
      g.save();
      g.clip(band);
      g.fillStyle = light < 1 ? dk(k, 0.18) : k;
      g.fillRect(880, 600, 720, 400);
      // côtes du tricot
      g.strokeStyle = 'rgba(255,220,190,0.18)';
      g.lineWidth = 3;
      for (let x = bx0 - 40; x < bx1 + 40; x += 14) {
        const [ax0, ay0] = P(x, dTop, r0 - 20);
        const [ax1, ay1] = P(x, dTop, r1 + 20);
        g.beginPath();
        g.moveTo(ax0, ay0);
        g.lineTo(ax1, ay1);
        g.stroke();
      }
      texturize(g, band, noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 0.8);
      g.restore();
    }
  });
  // Rabat du drap blanc
  layer(ctx, 'chambre-cosy/sheet', [880, 600, 720, 120], (g) => {
    const t0 = zb - 8;
    const t1 = zb + 34;
    const band = polyPath([P(bx0 - 4, dTop - 4, t0), P(bx1 + 4, dTop - 4, t0), P(bx1 + 4, dTop - 4, t1), P(bx0 - 4, dTop - 4, t1)]);
    blurShape(g, band, 'rgba(60,45,35,0.3)', 6, 0, 4);
    g.fillStyle = lg(g, 0, pY(dTop, t0), 0, pY(dTop, t1), [[0, '#F7F4EE'], [1, '#E4DDD1']]);
    g.fill(band);
    g.strokeStyle = 'rgba(180,165,145,0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    const [sx0, sy0] = P(bx0, dTop - 4, t1 - 8);
    const [sx1, sy1] = P(bx1 + 4, dTop - 4, t1 - 8);
    g.moveTo(sx0, sy0);
    g.lineTo(sx1, sy1);
    g.stroke();
  });

  finish(ctx, { tint: 'rgba(255,220,190,0.14)' });
  });
}

/* ================================================================== */
/* Décor 3 — Salle à manger classique                                  */
/* ================================================================== */

const SPEC_SALLE_A_MANGER = {
  mode: 'window',
  window: { x: 600, y: 112, w: 400, h: 448 },
  ceilingY: 64,
  floorY: 828,
  sillY: 560,
  rodMaxX0: 340,
  rodMaxX1: 1260,
  hardware: 'brass',
};

/** Chaise médaillon Louis XVI vue de face (dossier ovale garni). */
function medallionChairFront(g, cx, z, o = {}) {
  const wood = o.wood || '#B99D6E';
  const fab = o.fabric || '#8D9FA8';
  atDepth(g, z, () => {
    const seatY = FL - 140;
    const topY = FL - 300;
    softEllipse(g, cx, FL, 90, 10, SHADOW, 0.35);
    // pieds cannelés
    for (const lx of [cx - 70, cx + 60]) {
      g.fillStyle = lg(g, lx, 0, lx + 10, 0, [[0, lt(wood, 0.3)], [1, dk(wood, 0.2)]]);
      g.fill(polyPath([[lx, seatY], [lx + 11, seatY], [lx + 8, FL], [lx + 3, FL]]));
    }
    // médaillon
    const mx = cx;
    const my = topY + 80;
    g.fillStyle = lg(g, mx - 70, 0, mx + 70, 0, [[0, lt(wood, 0.3)], [0.5, wood], [1, dk(wood, 0.2)]]);
    g.beginPath();
    g.ellipse(mx, my, 70, 92, 0, 0, TAU);
    g.fill();
    g.fillStyle = lg(g, 0, my - 80, 0, my + 80, [[0, lt(fab, 0.25)], [1, dk(fab, 0.15)]]);
    g.beginPath();
    g.ellipse(mx, my, 58, 80, 0, 0, TAU);
    g.fill();
    g.strokeStyle = rgba(dk(wood, 0.4), 0.4);
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(mx, my, 64, 86, 0, 0, TAU);
    g.stroke();
    // noeud sculpté
    g.fillStyle = lt(wood, 0.2);
    g.beginPath();
    g.ellipse(mx, my - 94, 14, 7, 0, 0, TAU);
    g.fill();
    // assise
    g.fillStyle = lg(g, 0, seatY - 14, 0, seatY + 16, [[0, lt(fab, 0.2)], [1, dk(fab, 0.2)]]);
    g.fill(rrPath(cx - 78, seatY - 14, 156, 30, 10));
    g.fillStyle = lt(wood, 0.1);
    g.fillRect(cx - 80, seatY + 12, 160, 10);
  });
}

/** Chaise médaillon de profil (face à la table). dir = 1 regarde vers la droite. */
function medallionChairSide(g, cx, z, dir, o = {}) {
  const wood = o.wood || '#B99D6E';
  const fab = o.fabric || '#8D9FA8';
  atDepth(g, z, () => {
    const seatY = FL - 140;
    softEllipse(g, cx, FL, 80, 9, SHADOW, 0.35);
    const back = cx - dir * 60;
    const front = cx + dir * 60;
    // pieds
    for (const lx of [back, front - dir * 8]) {
      g.fillStyle = lg(g, lx - 5, 0, lx + 5, 0, [[0, lt(wood, 0.25)], [1, dk(wood, 0.2)]]);
      g.fill(polyPath([[lx - 6, seatY], [lx + 6, seatY], [lx + 3, FL], [lx - 3, FL]]));
    }
    g.fillStyle = lt(wood, 0.05);
    g.fillRect(Math.min(back, front) - 6, seatY + 8, 132, 9);
    // dossier (tranche du médaillon, légèrement incliné)
    g.save();
    g.translate(back, seatY);
    g.rotate(-dir * 0.1);
    g.fillStyle = lg(g, -10, 0, 10, 0, [[0, lt(wood, 0.3)], [1, dk(wood, 0.2)]]);
    g.fill(rrPath(-9, -178, 18, 180, 9));
    g.fillStyle = fab;
    g.fill(rrPath(dir > 0 ? 3 : -9, -160, 6, 140, 3));
    g.restore();
    // assise
    g.fillStyle = lg(g, 0, seatY - 16, 0, seatY + 12, [[0, lt(fab, 0.25)], [1, dk(fab, 0.2)]]);
    g.fill(rrPath(Math.min(back, front) - 8, seatY - 16, 136, 26, 12));
  });
}

/** Lustre à bras et pampilles (laiton + cristal). */
function drawChandelier(g, cx, z) {
  atDepth(g, z, () => {
    const cy = 250;
    const brass = (x0, x1) => lg(g, x0, 0, x1, 0, [[0, '#8C6A2C'], [0.35, '#E8CF8A'], [0.6, '#B8913F'], [1, '#7A5A22']]);
    // chaîne
    g.strokeStyle = '#A7843C';
    g.lineWidth = 3;
    for (let y = -120; y < cy - 90; y += 12) {
      g.beginPath();
      g.ellipse(cx, y, 3, 6, 0, 0, TAU);
      g.stroke();
    }
    // fût
    const body = new Path2D();
    body.moveTo(cx - 8, cy - 90);
    body.bezierCurveTo(cx - 24, cy - 60, cx - 30, cy - 10, cx - 14, cy + 20);
    body.bezierCurveTo(cx - 30, cy + 40, cx - 10, cy + 70, cx, cy + 80);
    body.bezierCurveTo(cx + 10, cy + 70, cx + 30, cy + 40, cx + 14, cy + 20);
    body.bezierCurveTo(cx + 30, cy - 10, cx + 24, cy - 60, cx + 8, cy - 90);
    body.closePath();
    g.fillStyle = brass(cx - 30, cx + 30);
    g.fill(body);
    // bras en S (3 plans de profondeur)
    const arms = [[-190, 30], [-120, 42], [-50, 52], [50, 52], [120, 42], [190, 30]];
    for (const [dx, dy] of arms) {
      const ex = cx + dx;
      const ey = cy + dy - 40;
      g.strokeStyle = '#B8913F';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy + 20);
      g.bezierCurveTo(cx + dx * 0.3, cy + 70, cx + dx * 0.9, cy + 60, ex, ey + 30);
      g.stroke();
      g.strokeStyle = 'rgba(255,240,190,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
      // bobèche + bougie + flamme
      g.fillStyle = brass(ex - 16, ex + 16);
      g.beginPath();
      g.ellipse(ex, ey + 30, 16, 5, 0, 0, TAU);
      g.fill();
      g.fillStyle = lg(g, ex - 6, 0, ex + 6, 0, [[0, '#FFFDF6'], [1, '#DCD5C6']]);
      g.fillRect(ex - 5, ey - 16, 10, 46);
      glow(g, ex, ey - 24, 46, '255,220,150', 0.7);
      g.fillStyle = '#FFF6DA';
      g.beginPath();
      g.ellipse(ex, ey - 24, 4, 9, 0, 0, TAU);
      g.fill();
      // pampilles
      for (let k = 0; k < 3; k++) {
        const px = ex + (k - 1) * 10;
        const py = ey + 44 + (k === 1 ? 10 : 0);
        g.strokeStyle = 'rgba(200,190,170,0.6)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(px, ey + 32);
        g.lineTo(px, py);
        g.stroke();
        g.fillStyle = 'rgba(245,248,255,0.85)';
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + 4, py + 9);
        g.lineTo(px, py + 17);
        g.lineTo(px - 4, py + 9);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,1)';
        g.fillRect(px - 1, py + 5, 2, 3);
      }
    }
    // couronne de pampilles sous le fût
    for (let k = -3; k <= 3; k++) {
      const px = cx + k * 7;
      const py = cy + 86 + (3 - Math.abs(k)) * 8;
      g.fillStyle = 'rgba(245,248,255,0.9)';
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + 4, py + 10);
      g.lineTo(px, py + 20);
      g.lineTo(px - 4, py + 10);
      g.closePath();
      g.fill();
    }
  });
}

function drawSalleAManger(ctx, api) {
  const spec = SPEC_SALLE_A_MANGER;
  const win = spec.window;
  const lambris = '#ECE8DE';
  const rail = 560;
  layer(ctx, 'salle-a-manger/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#C3CAB9', tex: 'plaster', ceilingColor: '#F2EFE8', ceilY: 40,
      cornice: { h: 24, color: '#EFEBE3' }, glow: { x: 800, y: 330, r: 700, a: 0.5 }, baseboard: { h: 30, color: lambris },
    });
    // soubassement lambrissé
    g.fillStyle = lg(g, 0, rail, 0, FL - 30, [[0, lambris], [1, dk(lambris, 0.06)]]);
    g.fillRect(0, rail, W, FL - 30 - rail);
    texturize(g, rrPath(0, rail, W, FL - 30 - rail, 0), noiseTile('plaster', 128, 4, 3, 0.55, 5, 18), 0.2);
    const n = 8;
    const pw = (W - 60) / n;
    for (let i = 0; i < n; i++) {
      panelMolding(g, 30 + i * pw + 12, rail + 34, pw - 24, FL - 30 - rail - 62, lambris, { t: 10, light: (30 + i * pw) < 800 ? -1 : 1 });
    }
    // cimaise
    g.fillStyle = lg(g, 0, rail - 10, 0, rail + 12, [[0, lt(lambris, 0.5)], [0.3, lambris], [0.55, dk(lambris, 0.15)], [0.7, lt(lambris, 0.3)], [1, dk(lambris, 0.25)]]);
    g.fillRect(0, rail - 10, W, 22);
    blurShape(g, rrPath(0, rail + 8, W, 4, 0), 'rgba(60,45,35,0.25)', 5, 0, 3);
    // tableaux
    drawFrame(g, 70, 170, 230, 290, { style: 'gilt', fw: 22 }, (x, y, w, h) => artLandscape(g, x, y, w, h, 3));
    drawFrame(g, 1300, 170, 230, 290, { style: 'gilt', fw: 22 }, (x, y, w, h) => artLandscape(g, x, y, w, h, 4));
    drawWindow(g, win, {
      frame: '#F3F0E9', reveal: '#E6E3D8', leaves: 2, rows: 3, fw: 14, sw: 11, bar: 5, depth: 30,
      casing: { w: 24, color: '#F1EDE5' }, view: 'park', sill: { color: '#EFEBE3', over: 30, h: 14 },
    });
    drawFloor(g, woodFloorTex('oak-classic', { dir: 'across', plankW: 52, colors: ['#9A6E4A', '#8C6242', '#A57852', '#936946'], minL: 420, maxL: 800 }), {
      light: { x0: 600, x1: 1000, a: 0.45 }, gloss: 0.18,
    });
    drawRug(g, persianTex(), 330, 1270, 110, 560, { shadow: 0.2 });
    backFinish(g, { tint: 'rgba(255,238,215,0.1)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  const tz0 = 190;
  const tz1 = 420;
  const tx0 = 470;
  const tx1 = 1130;
  const tTop = FL - 228;
  layer(ctx, 'salle-a-manger/chairs', [0, 300, W, 700], (g) => {
    medallionChairFront(g, 655, 100);
    medallionChairFront(g, 945, 100);
    medallionChairSide(g, 360, 300, 1);
    medallionChairSide(g, 1240, 300, -1);
    // pieds de table sous la nappe
    atDepth(g, tz1 - 30, () => {
      for (const lx of [tx0 + 30, tx1 - 44]) {
        softEllipse(g, lx + 7, FL, 22, 5, SHADOW, 0.5);
        g.fillStyle = lg(g, lx, 0, lx + 14, 0, [[0, '#8A6446'], [1, '#4E3525']]);
        g.fill(rrPath(lx, FL - 40, 14, 40, 4));
      }
    });
    floorShadow(g, tx0, tx1, tz0, tz1, 0.35, 20);
  });

  // Nappe (textile) : dessus en perspective + retombé
  const P = (x, y, z) => [pX(x, z), pY(y, z)];
  const hem = FL - 36;
  const [bx0, by] = P(tx0, tTop, tz0);
  const [fx0, fy] = P(tx0, tTop, tz1);
  const [fx1] = P(tx1, tTop, tz1);
  const [, hy] = P(tx0, hem, tz1);
  const cloth = new Path2D();
  cloth.moveTo(bx0, by);
  cloth.lineTo(pX(tx1, tz0), by);
  cloth.lineTo(fx1, fy);
  cloth.lineTo(fx1 + 2, hy);
  // ourlet légèrement ondulé
  for (let i = 1; i <= 24; i++) {
    const x = fx1 - ((fx1 - fx0) * i) / 24;
    cloth.lineTo(x, hy + (i % 2 ? 3 : -1));
  }
  cloth.lineTo(fx0 - 2, hy);
  cloth.lineTo(fx0, fy);
  cloth.closePath();
  blurShape(ctx, cloth, 'rgba(40,28,20,0.3)', 14, 0, 10);
  textile(ctx, api, 'tablecloth', cloth, {
    kind: 'tablecloth', topH: fy - by, bounds: { x: fx0 - 2, y: by, w: fx1 - fx0 + 4, h: hy - by }, fallbackColor: '#F1EBDF', scale: 120, light: 0,
  });

  // Art de la table, bouquet, lustre
  layer(ctx, 'salle-a-manger/table', [300, 0, 1000, 760], (g) => {
    const plate = (x, z) => {
      const X = pX(x, z);
      const Y = pY(tTop, z);
      const s = sc(z);
      softEllipse(g, X + 2, Y + 3, 44 * s, 10 * s, SHADOW, 0.25);
      g.fillStyle = lg(g, 0, Y - 9 * s, 0, Y + 9 * s, [[0, '#FFFFFF'], [1, '#E3DED5']]);
      g.beginPath();
      g.ellipse(X, Y, 42 * s, 9 * s, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(190,160,90,0.8)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(X, Y, 34 * s, 7 * s, 0, 0, TAU);
      g.stroke();
      // verre
      g.fillStyle = 'rgba(235,240,245,0.55)';
      g.fill(polyPath([[X + 52 * s, Y - 2], [X + 60 * s, Y - 2], [X + 58 * s, Y - 16 * s], [X + 66 * s, Y - 40 * s], [X + 46 * s, Y - 40 * s], [X + 54 * s, Y - 16 * s]]));
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X + 49 * s, Y - 38 * s);
      g.lineTo(X + 52 * s, Y - 22 * s);
      g.stroke();
    };
    for (const x of [580, 800, 1020]) plate(x, tz1 - 45);
    for (const x of [650, 950]) plate(x, tz0 + 40);
    // chandeliers de table
    for (const x of [640, 960]) {
      atDepth(g, 300, () => {
        const y = tTop;
        softEllipse(g, x, y, 22, 5, SHADOW, 0.35);
        g.fillStyle = lg(g, x - 16, 0, x + 16, 0, [[0, '#9A7632'], [0.4, '#EBD394'], [1, '#7D5E24']]);
        g.fill(polyPath([[x - 18, y], [x + 18, y], [x + 6, y - 14], [x + 4, y - 80], [x + 10, y - 92], [x - 10, y - 92], [x - 4, y - 80], [x - 6, y - 14]]));
        g.fillStyle = lg(g, x - 5, 0, x + 5, 0, [[0, '#FFFDF7'], [1, '#DDD6C8']]);
        g.fillRect(x - 5, y - 170, 10, 80);
        glow(g, x, y - 180, 40, '255,220,150', 0.7);
        g.fillStyle = '#FFF5D6';
        g.beginPath();
        g.ellipse(x, y - 180, 3.5, 8, 0, 0, TAU);
        g.fill();
      });
    }
    // vase + bouquet
    atDepth(g, 300, () => {
      const x = 800;
      const y = tTop;
      softEllipse(g, x, y, 50, 8, SHADOW, 0.35);
      const v = new Path2D();
      v.moveTo(x - 30, y);
      v.bezierCurveTo(x - 46, y - 40, x - 40, y - 70, x - 26, y - 88);
      v.lineTo(x + 26, y - 88);
      v.bezierCurveTo(x + 40, y - 70, x + 46, y - 40, x + 30, y);
      v.closePath();
      g.fillStyle = lg(g, x - 46, 0, x + 46, 0, [[0, '#E9E6DF'], [0.35, '#FFFFFF'], [1, '#BDB6A8']]);
      g.fill(v);
      g.strokeStyle = 'rgba(190,160,90,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 27, y - 82);
      g.lineTo(x + 27, y - 82);
      g.stroke();
      g.drawImage(bouquetSprite(2), x - 102, y - 84 - 124, 204, 177);
    });
    drawChandelier(g, 800, 300);
  });

  finish(ctx, { tint: 'rgba(255,238,215,0.1)' });
  });
}

/* ================================================================== */
/* Décor 4 — Scandinave                                                */
/* ================================================================== */

const SPEC_SCANDINAVE = {
  mode: 'window',
  window: { x: 300, y: 160, w: 440, h: 500 },
  ceilingY: 40,
  floorY: 828,
  sillY: 660,
  rodMaxX0: 100,
  rodMaxX1: 950,
  hardware: 'wood',
};

function drawScandinave(ctx, api) {
  const spec = SPEC_SCANDINAVE;
  const win = spec.window;
  const oak = '#D2B48C';
  layer(ctx, 'scandinave/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#EEEAE3', tex: 'plaster', ceilingColor: '#F6F3EE',
      glow: { x: 520, y: 400, r: 700, a: 0.45 }, baseboard: { h: 22, color: '#F2EFE9' },
    });
    // miroir rond
    const mx = 1080;
    const my = 330;
    const mr = 112;
    blurShape(g, ellipsePath(mx, my, mr, mr), 'rgba(50,40,30,0.3)', 16, 6, 10);
    g.fillStyle = lg(g, mx - mr, my - mr, mx + mr, my + mr, [[0, lt(oak, 0.3)], [1, dk(oak, 0.25)]]);
    g.fill(ellipsePath(mx, my, mr, mr));
    const glass = ellipsePath(mx, my, mr - 12, mr - 12);
    g.fillStyle = lg(g, mx - mr, my - mr, mx + mr, my + mr, [[0, '#E9ECEA'], [0.5, '#D5D9D6'], [1, '#BFC4C1']]);
    g.fill(glass);
    g.save();
    g.clip(glass);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(mx - 70, my - 110, 60, 150);
    g.fillStyle = 'rgba(200,190,175,0.5)';
    g.fillRect(mx - mr, my + 40, mr * 2, mr);
    g.fillStyle = lg(g, mx - mr, my - mr, mx + mr, my + mr, [[0.2, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.35)'], [0.55, 'rgba(255,255,255,0)']]);
    g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    g.restore();
    // étagère murale + objets
    const sx0 = 1290;
    const sx1 = 1540;
    const sy = 470;
    blurShape(g, rrPath(sx0, sy, sx1 - sx0, 14, 1), 'rgba(50,40,30,0.3)', 8, 0, 8);
    prism(g, { x: sx0, y: sy, w: sx1 - sx0, h: 14, r: 1, z0: 0, z1: 40, side: dk(oak, 0.2), top: lt(oak, 0.2), front: lg(g, 0, sy, 0, sy + 14, [[0, lt(oak, 0.1)], [1, dk(oak, 0.15)]]) });
    atDepth(g, 20, () => {
      // livres
      const books = [['#C9B8A0', 18, 96], ['#8E9A8A', 14, 104], ['#E3DACB', 16, 90], ['#5D6660', 12, 100]];
      let bx = sx0 + 20;
      for (const [c, bw, bh] of books) {
        g.fillStyle = lg(g, bx, 0, bx + bw, 0, [[0, lt(c, 0.15)], [1, dk(c, 0.15)]]);
        g.fillRect(bx, sy - bh, bw, bh);
        bx += bw + 1;
      }
      // vase blanc + tige séchée
      const vx = sx0 + 150;
      g.fillStyle = lg(g, vx - 24, 0, vx + 24, 0, [[0, '#FFFFFF'], [1, '#CFCAC0']]);
      g.beginPath();
      g.ellipse(vx, sy - 34, 24, 34, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#A38F6E';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(vx, sy - 60);
      g.quadraticCurveTo(vx + 20, sy - 150, vx + 50, sy - 200);
      g.stroke();
      for (let k = 0; k < 7; k++) leaf(g, vx + 10 + k * 5.5, sy - 90 - k * 16, 16, 4, -1 - (k % 2) * 1.2, '#B9A07A', { rib: false });
      // petit bol
      g.fillStyle = lg(g, 0, sy - 22, 0, sy, [[0, '#6B6560'], [1, '#3F3B37']]);
      g.beginPath();
      g.ellipse(sx0 + 215, sy - 8, 20, 12, 0, Math.PI, 0);
      g.lineTo(sx0 + 235, sy);
      g.lineTo(sx0 + 195, sy);
      g.fill();
    });
    drawWindow(g, win, { frame: '#F7F5F0', reveal: '#ECE8E1', leaves: 2, rows: 1, fw: 13, sw: 10, depth: 26, sill: { color: '#F3F0EA' } });
    drawFloor(g, woodFloorTex('oak-pale', { dir: 'depth', plankW: 90, colors: ['#E0CBAA', '#D8C19D', '#E6D3B4', '#DCC5A3'], minL: 420, maxL: 760 }), {
      light: { x0: 300, x1: 740, a: 0.5 }, gloss: 0.2,
    });
    drawRug(g, flatweaveTex(), 560, 1560, 110, 480, { shadow: 0.15 });
    fringe(g, 560, 1560, 480, 'rgba(232,227,218,0.95)', 12);
    backFinish(g, { tint: 'rgba(240,245,250,0.08)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Pampa dans un grand vase
  layer(ctx, 'scandinave/pampas', [0, 0, 440, 940], (g) => {
    atDepth(g, 140, () => {
      softEllipse(g, 150, FL, 70, 12, SHADOW, 0.4);
      g.drawImage(pampasSprite(9), 150 - 190, FL - 240 - 590, 380, 640);
      const p = new Path2D();
      p.moveTo(122, FL - 250);
      p.bezierCurveTo(122, FL - 200, 90, FL - 170, 92, FL - 90);
      p.bezierCurveTo(94, FL - 20, 110, FL, 130, FL);
      p.lineTo(170, FL);
      p.bezierCurveTo(190, FL, 206, FL - 20, 208, FL - 90);
      p.bezierCurveTo(210, FL - 170, 178, FL - 200, 178, FL - 250);
      p.closePath();
      g.fillStyle = lg(g, 90, 0, 210, 0, [[0, '#F4F1EB'], [0.35, '#FFFFFF'], [1, '#C9C3B8']]);
      g.fill(p);
      texturize(g, p, noiseTile('pot', 128, 8, 3, 0.8, 11, 30), 0.5);
      g.fillStyle = '#DAD4CA';
      g.beginPath();
      g.ellipse(150, FL - 250, 28, 5, 0, 0, TAU);
      g.fill();
    });
  });

  // Tabouret en chêne
  layer(ctx, 'scandinave/stool', [580, 500, 440, 500], (g) => {
    const z = 300;
    const cx = 790;
    atDepth(g, z, () => {
      softEllipse(g, cx, FL, 90, 12, SHADOW, 0.4);
      const legs = [[cx - 48, -0.1], [cx + 48, 0.1], [cx + 4, 0]];
      for (const [lx, a] of legs) {
        g.save();
        g.translate(lx, FL);
        g.rotate(a);
        g.fillStyle = lg(g, -8, 0, 8, 0, [[0, lt(oak, 0.2)], [1, dk(oak, 0.25)]]);
        g.fill(rrPath(-7, -136, 14, 136, 5));
        g.restore();
      }
    });
    const t = cylinder(g, {
      cx, zc: z - 20, rad: 66, yTop: FL - 146, yBot: FL - 128,
      side: (a, b) => lg(g, a, 0, b, 0, [[0, lt(oak, 0.1)], [0.4, lt(oak, 0.25)], [1, dk(oak, 0.3)]]),
      top: (X, y, rx) => lg(g, X - rx, y, X + rx, y, [[0, lt(oak, 0.35)], [1, lt(oak, 0.05)]]),
    });
    g.save();
    g.clip(t.tp);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.5;
    g.fillStyle = grainPattern(g, t.X, t.top, 90, 1, 1.5);
    g.fillRect(t.X - t.rx, t.top - t.ryT, t.rx * 2, t.ryT * 2);
    g.restore();
    // livre + tasse
    const X = t.X;
    const Y = t.top;
    g.fillStyle = lg(g, 0, Y - 11, 0, Y, [[0, '#E9E2D4'], [1, '#C9BFAE']]);
    g.fill(rrPath(X - 58, Y - 11, 78, 11, 2));
    g.fillStyle = '#7E8B7C';
    g.fillRect(X - 58, Y - 3, 78, 3);
    g.fillStyle = lg(g, X + 22, 0, X + 52, 0, [[0, '#F7F3EC'], [1, '#C8C0B2']]);
    g.fill(rrPath(X + 22, Y - 34, 30, 32, 5));
    g.strokeStyle = '#C8C0B2';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(X + 55, Y - 19, 8, -1.2, 1.2);
    g.stroke();
  });

  // Canapé en lin sur pieds bois
  const sofa = {
    x0: 880, x1: 1480, z0: 30, z1: 270, color: '#CEC9C0', texture: 'linen', legH: 22, legColor: '#B38C60',
    seatH: 132, backH: 240, armH: 190, armW: 62, radius: 16, backInset: 4, backCushionDrop: 34, shadowDx: -8,
  };
  layer(ctx, 'scandinave/sofa', [800, 500, 800, 500], (g) => drawSofaBack(g, sofa));
  const seatTop = FL - 132;
  atDepth(ctx, sofa.z0 + 165, () => {
    cushion(ctx, api, 1020, seatTop - 56, 140, 136, { rot: -0.09, color: '#E8E3D9' });
    cushion(ctx, api, 1335, seatTop - 56, 140, 136, { rot: 0.08, color: '#9AA39A' });
    cushion(ctx, api, 1178, seatTop - 42, 130, 104, { rot: 0.02, color: '#E0C9A8' });
  });
  layer(ctx, 'scandinave/sofa-front', [800, 500, 800, 500], (g) => drawSofaFront(g, sofa));
  // Plaid plié sur l'accoudoir gauche
  atDepth(ctx, sofa.z1 - 10, () => {
    const ax = sofa.x0;
    const top = FL - 190;
    const p = new Path2D();
    p.moveTo(ax - 12, top + 4);
    p.quadraticCurveTo(ax + 31, top - 10, ax + 74, top + 6);
    p.lineTo(ax + 74, top + 150);
    p.quadraticCurveTo(ax + 31, top + 158, ax - 12, top + 146);
    p.closePath();
    blurShape(ctx, p, 'rgba(40,28,20,0.3)', 8, 4, 6);
    textile(ctx, api, 'throw', p, {
      kind: 'throw', bounds: { x: ax - 12, y: top - 10, w: 86, h: 170 }, fallbackColor: '#DCD3C4', scale: 80, foldAngle: 90,
    });
  });

  finish(ctx, { tint: 'rgba(240,245,250,0.08)' });
  });
}

/* ================================================================== */
/* Décor 5 — Bohème                                                    */
/* ================================================================== */

const SPEC_BOHEME = {
  mode: 'window',
  window: { x: 560, y: 170, w: 420, h: 480 },
  ceilingY: 40,
  floorY: 828,
  sillY: 650,
  rodMaxX0: 360,
  rodMaxX1: 1180,
  hardware: 'wood',
};

/** Tuile de rotin tressé (boucles entrelacées, fond transparent = ajours). */
function rattanTile() {
  return cached('rattan', 40, 40, (g) => {
    const ring = (x, y) => {
      g.strokeStyle = 'rgba(110,75,40,0.75)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x + 0.6, y + 0.8, 13, 0, TAU);
      g.stroke();
      g.strokeStyle = '#E0BE88';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 13, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(255,244,220,0.7)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(x - 0.5, y - 0.5, 13, Math.PI * 1.05, Math.PI * 1.6);
      g.stroke();
    };
    for (const [x, y] of [[0, 0], [40, 0], [0, 40], [40, 40], [20, 20]]) ring(x, y);
  }, spriteRes());
}

/** Macramé mural : baguette de bois, nœuds en V et losanges, franges. */
function macrameSprite() {
  const w = 240;
  const h = 460;
  return cached('macrame', w, h, (g) => {
    const cord = '#EFE6D4';
    const shade = '#C9BBA2';
    const r = rng(3);
    const n = 18;
    const x0 = 30;
    const x1 = w - 30;
    const dx = (x1 - x0) / (n - 1);
    // cordons verticaux
    for (let i = 0; i < n; i++) {
      const x = x0 + i * dx;
      const endY = 300 + Math.abs(i - (n - 1) / 2) * -6 + 150;
      g.strokeStyle = shade;
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(x, 26);
      g.lineTo(x + (r() - 0.5) * 2, endY);
      g.stroke();
      g.strokeStyle = cord;
      g.lineWidth = 2.2;
      g.stroke();
    }
    // nœuds plats en V et en losange
    const knot = (x, y) => {
      g.fillStyle = shade;
      g.beginPath();
      g.ellipse(x + 0.8, y + 0.8, 7.5, 5, 0, 0, TAU);
      g.fill();
      g.fillStyle = cord;
      g.beginPath();
      g.ellipse(x, y, 7, 4.5, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(150,130,100,0.6)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x - 5, y);
      g.lineTo(x + 5, y);
      g.stroke();
    };
    for (let i = 0; i < n - 1; i++) knot(x0 + dx * (i + 0.5), 46);
    for (let row = 0; row < 7; row++) {
      for (let i = row; i < n - 1 - row; i += 2) knot(x0 + dx * (i + 0.5) + (row % 2 ? dx : 0) * 0, 70 + row * 18);
    }
    for (let row = 0; row < 6; row++) {
      const cx = w / 2;
      const span = row < 3 ? row : 5 - row;
      for (let k = -span; k <= span; k += 1) knot(cx + k * dx, 220 + row * 18);
    }
    for (let i = 0; i < n - 1; i++) knot(x0 + dx * (i + 0.5), 340);
    // franges effilochées
    for (let i = 0; i < n; i++) {
      const x = x0 + i * dx;
      const endY = 440 - Math.abs(i - (n - 1) / 2) * 7;
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = 'rgba(239,230,212,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, 350);
        g.lineTo(x + (k - 1) * 2 + (r() - 0.5) * 2, endY);
        g.stroke();
      }
    }
    // baguette
    g.fillStyle = lg(g, 0, 16, 0, 32, [[0, '#B08A5E'], [0.4, '#8A6640'], [1, '#5E4329']]);
    g.fill(rrPath(0, 16, w, 16, 8));
    g.strokeStyle = '#CFC4B0';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(8, 22);
    g.lineTo(w / 2, -6);
    g.lineTo(w - 8, 22);
    g.stroke();
  }, spriteRes());
}

/** Fauteuil paon en rotin (vu de face), coussin d'assise via l'hôte. */
function peacockChair(g, cx, z) {
  const seatY = FL - 150;
  atDepth(g, z, () => {
    g.translate(cx, 0);
    g.scale(0.8, 1);
    g.translate(-cx, 0);
    softEllipse(g, cx, FL, 130, 16, SHADOW, 0.45);
    // piètement en sablier
    const base = new Path2D();
    base.moveTo(cx - 105, FL);
    base.bezierCurveTo(cx - 50, FL - 40, cx - 40, seatY + 40, cx - 90, seatY + 8);
    base.lineTo(cx + 90, seatY + 8);
    base.bezierCurveTo(cx + 40, seatY + 40, cx + 50, FL - 40, cx + 105, FL);
    base.closePath();
    blurShape(g, base, 'rgba(40,28,20,0.2)', 6, 4, 2);
    g.fillStyle = 'rgba(90,60,35,0.35)';
    g.fill(base);
    const pat = g.createPattern(rattanTile(), 'repeat');
    pat.setTransform?.(new DOMMatrix().scale(0.8 / rattanTile().__res));
    g.fillStyle = pat;
    g.fill(base);
    // dossier en éventail
    const back = new Path2D();
    back.moveTo(cx - 95, seatY + 4);
    back.bezierCurveTo(cx - 150, seatY - 120, cx - 240, seatY - 250, cx - 200, seatY - 360);
    back.bezierCurveTo(cx - 150, seatY - 450, cx + 150, seatY - 450, cx + 200, seatY - 360);
    back.bezierCurveTo(cx + 240, seatY - 250, cx + 150, seatY - 120, cx + 95, seatY + 4);
    back.closePath();
    blurShape(g, back, 'rgba(40,28,20,0.3)', 18, 10, 12);
    g.fillStyle = 'rgba(110,75,45,0.2)';
    g.fill(back);
    g.fillStyle = pat;
    g.fill(back);
    // cannes rayonnantes de l'éventail
    g.save();
    g.clip(back);
    g.lineCap = 'round';
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI + 0.25 + (k / 12) * (Math.PI - 0.5);
      const ex = cx + Math.cos(a) * 260;
      const ey = seatY - 40 + Math.sin(a) * 440;
      g.strokeStyle = 'rgba(110,75,40,0.55)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx, seatY);
      g.lineTo(ex + 1, ey + 1);
      g.stroke();
      g.strokeStyle = '#D8B47C';
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(cx, seatY);
      g.lineTo(ex, ey);
      g.stroke();
    }
    g.restore();
    // ombrage du volume
    g.save();
    g.clip(back);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rg(g, cx, seatY - 60, 40, cx, seatY - 200, 320, [[0, 'rgba(120,90,60,0.5)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(160,130,100,0.35)']]);
    g.fillRect(cx - 260, seatY - 460, 520, 470);
    g.restore();
    // bourrelet de bordure
    g.lineCap = 'round';
    g.strokeStyle = '#8A6238';
    g.lineWidth = 16;
    g.stroke(back);
    g.strokeStyle = '#C9A06A';
    g.lineWidth = 11;
    g.stroke(back);
    g.strokeStyle = 'rgba(255,236,200,0.5)';
    g.lineWidth = 3;
    g.save();
    g.translate(-2, -3);
    g.stroke(back);
    g.restore();
    // assise (anneau)
    g.fillStyle = lg(g, 0, seatY - 10, 0, seatY + 24, [[0, '#C9A06A'], [1, '#7A5530']]);
    g.beginPath();
    g.ellipse(cx, seatY + 6, 112, 26, 0, 0, TAU);
    g.fill();
  });
}

/** Suspension de plante en macramé depuis le plafond. */
function hangingPlant(g, cx, bottomY) {
  const potY = bottomY;
  g.strokeStyle = '#E4D8C2';
  g.lineWidth = 2;
  for (const dx of [-30, -8, 12, 32]) {
    g.beginPath();
    g.moveTo(cx, 40);
    g.lineTo(cx + dx, potY - 60);
    g.lineTo(cx + dx * 0.9, potY - 10);
    g.stroke();
  }
  g.fillStyle = '#E4D8C2';
  g.beginPath();
  g.arc(cx, 52, 6, 0, TAU);
  g.fill();
  for (const dx of [-30, -8, 12, 32]) {
    g.beginPath();
    g.ellipse(cx + dx, potY - 60, 4, 6, 0, 0, TAU);
    g.fill();
  }
  g.drawImage(pothosSprite(21, { w: 260, h: 420, top: 30, vines: 8 }), cx - 130, potY - 76, 260, 420);
  drawPot(g, cx, potY, 70, 60, { color: '#D98E6B', taper: 0.7 });
  // tresse sous le pot
  g.strokeStyle = '#E4D8C2';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 30, potY - 12);
  g.quadraticCurveTo(cx, potY + 18, cx + 30, potY - 12);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(cx - 3 + i, potY + 8);
    g.lineTo(cx - 8 + i * 3, potY + 50);
    g.stroke();
  }
}

/** Panier tressé (cache-pot) : bandes de vannerie, modelé cylindrique. */
function drawBasket(g, cx, baseY, w, h, o = {}) {
  const col = o.color || '#C9A46E';
  const p = new Path2D();
  p.moveTo(cx - w / 2, baseY - h);
  p.lineTo(cx - w * 0.42, baseY - 4);
  p.quadraticCurveTo(cx - w * 0.42, baseY, cx - w * 0.38, baseY);
  p.lineTo(cx + w * 0.38, baseY);
  p.quadraticCurveTo(cx + w * 0.42, baseY, cx + w * 0.42, baseY - 4);
  p.lineTo(cx + w / 2, baseY - h);
  p.closePath();
  g.fillStyle = col;
  g.fill(p);
  g.save();
  g.clip(p);
  const r = rng(Math.round(cx));
  for (let y = baseY - h; y < baseY; y += 8) {
    for (let x = cx - w / 2 - 10; x < cx + w / 2 + 10; x += 12) {
      const off = ((y - baseY) / 8) % 2 ? 6 : 0;
      g.fillStyle = jitter(col, r, 0.12);
      g.beginPath();
      g.ellipse(x + off, y + 4, 6.5, 3.6, 0.35, 0, TAU);
      g.fill();
    }
  }
  if (o.bands) {
    for (const [t, c] of o.bands) {
      g.fillStyle = rgba(c, 0.85);
      g.fillRect(cx - w, baseY - h * t, w * 2, 10);
    }
  }
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = lg(g, cx - w / 2, 0, cx + w / 2, 0, [[0, 'rgba(120,90,60,0.35)'], [0.35, 'rgba(255,255,255,0)'], [1, 'rgba(90,60,40,0.55)']]);
  g.fillRect(cx - w, baseY - h, w * 2, h);
  g.restore();
  g.fillStyle = dk(col, 0.25);
  g.beginPath();
  g.ellipse(cx, baseY - h, w / 2, 8, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#4A3B30';
  g.beginPath();
  g.ellipse(cx, baseY - h + 1, w / 2 - 6, 5, 0, 0, TAU);
  g.fill();
}

function drawBoheme(ctx, api) {
  const spec = SPEC_BOHEME;
  const win = spec.window;
  layer(ctx, 'boheme/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#E7D7C0', tex: 'limewash', ceilingColor: '#F3EBDF',
      glow: { x: 770, y: 400, r: 680, a: 0.5 }, baseboard: { h: 22, color: '#EADFCD' },
    });
    // arche peinte terracotta derrière le fauteuil
    const ax0 = 1230;
    const ax1 = 1560;
    const at = 230;
    const arch = new Path2D();
    arch.moveTo(ax0, FL);
    arch.lineTo(ax0, at + (ax1 - ax0) / 2);
    arch.arc((ax0 + ax1) / 2, at + (ax1 - ax0) / 2, (ax1 - ax0) / 2, Math.PI, 0);
    arch.lineTo(ax1, FL);
    arch.closePath();
    g.fillStyle = lg(g, 0, at, 0, FL, [[0, '#C98264'], [1, '#B86E52']]);
    g.fill(arch);
    texturize(g, arch, noiseTile('plaster', 128, 4, 3, 0.55, 5, 18), 0.45);
    // macramé
    const m = macrameSprite();
    blurShape(g, rrPath(66, 160, 220, 380, 10), 'rgba(60,45,35,0.18)', 18, 6, 10);
    g.drawImage(m, 56, 140, 240, 460);
    drawWindow(g, win, { frame: '#A98159', reveal: '#E6D6C0', leaves: 2, rows: 1, fw: 14, sw: 11, depth: 28, view: 'tropical', handleColor: '#6F5438', sill: { color: '#B99471', h: 16 } });
    drawSucculent(g, 640, win.y + win.h, 1, 7, '#D4CBBE');
    drawSucculent(g, 700, win.y + win.h, 0.8, 8, '#C97B5A');
    drawFloor(g, woodFloorTex('honey-across', { dir: 'across', plankW: 50, colors: ['#B7875A', '#A97B50', '#C09163', '#B08255'], minL: 360, maxL: 720 }), {
      light: { x0: 560, x1: 980, a: 0.45 }, gloss: 0.12,
    });
    drawRug(g, kilimTex(), 300, 1420, 110, 460, { shadow: 0.18 });
    fringe(g, 300, 1420, 460, 'rgba(236,224,200,0.95)', 16);
    backFinish(g, { tint: 'rgba(255,225,190,0.12)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Bananier dans un panier (devant le rideau gauche)
  layer(ctx, 'boheme/banana', [0, 0, 900, 900], (g) => {
    atDepth(g, 150, () => {
      softEllipse(g, 450, FL, 100, 15, SHADOW, 0.4);
      g.drawImage(bananaSprite(5), 450 - 298, FL - 150 - 552, 595, 558);
      drawBasket(g, 450, FL, 150, 150, { color: '#C9A46E', bands: [[0.72, '#2F2A26']] });
    });
  });
  // Suspension
  layer(ctx, 'boheme/hanging', [940, 30, 320, 760], (g) => hangingPlant(g, 1100, 420));
  // Fauteuil paon
  layer(ctx, 'boheme/chair', [1040, 120, 560, 880], (g) => peacockChair(g, 1340, 120));
  atDepth(ctx, 120, () => {
    const cy = FL - 162;
    const p = new Path2D();
    p.ellipse(1340, cy, 88, 27, 0, 0, TAU);
    blurShape(ctx, p, 'rgba(40,28,20,0.3)', 8, 0, 6);
    textile(ctx, api, 'cushions', p, { kind: 'pouf', topH: 54, bounds: { x: 1252, y: cy - 27, w: 176, h: 54 }, fallbackColor: '#E8D9BF', scale: 95 });
    cushion(ctx, api, 1340, FL - 228, 132, 120, { rot: 0.04, color: '#D29B45' });
  });
  // Coussins de sol
  atDepth(ctx, 330, () => {
    const p = rrPath(930, FL - 70, 240, 70, 26);
    blurShape(ctx, p, 'rgba(40,28,20,0.35)', 12, 0, 8);
    textile(ctx, api, 'cushions', p, { kind: 'cushion', bounds: { x: 930, y: FL - 70, w: 240, h: 70 }, fallbackColor: '#B45F43', scale: 100 });
    cushion(ctx, api, 1060, FL - 138, 190, 150, { rot: 0.1, color: '#34495A', light: -0.8 });
  });
  // Pouf
  atDepth(ctx, 380, () => {
    const cx = 690;
    const top = FL - 150;
    const p = new Path2D();
    p.moveTo(cx - 110, top + 30);
    p.lineTo(cx - 110, FL - 22);
    p.bezierCurveTo(cx - 110, FL + 8, cx + 110, FL + 8, cx + 110, FL - 22);
    p.lineTo(cx + 110, top + 30);
    p.ellipse(cx, top + 30, 110, 30, 0, 0, Math.PI, true);
    p.closePath();
    softEllipse(ctx, pX(cx, 380), pY(FL, 380), 150, 18, SHADOW, 0.5);
    textile(ctx, api, 'cushions', p, { kind: 'pouf', topH: 60, bounds: { x: cx - 110, y: top, w: 220, h: FL - top }, fallbackColor: '#E3CBA4', scale: 100 });
  });

  finish(ctx, { tint: 'rgba(255,225,190,0.12)' });
  });
}

/* ================================================================== */
/* Décor 6 — Classique français                                        */
/* ================================================================== */

const SPEC_CLASSIQUE_FRANCAIS = {
  mode: 'window',
  window: { x: 590, y: 108, w: 420, h: 712 },
  ceilingY: 78,
  floorY: 828,
  sillY: 820,
  rodMaxX0: 370,
  rodMaxX1: 1230,
  hardware: 'brass',
};

const GILT = (g, x0, y0, x1, y1) => lg(g, x0, y0, x1, y1, [[0, '#8E6B2C'], [0.3, '#E6CC86'], [0.5, '#B8913F'], [0.72, '#F1DE9E'], [1, '#7F5E24']]);

/** Console Louis XVI dorée, plateau de marbre. */
function drawGiltConsole(g, x0, x1, z0, z1) {
  const top = FL - 255;
  floorShadow(g, x0 + 10, x1 - 10, z0, z1, 0.4, 14);
  // pieds arrière
  atDepth(g, z0 + 20, () => {
    for (const lx of [x0 + 26, x1 - 42]) {
      g.fillStyle = GILT(g, lx, 0, lx + 16, 0);
      g.fill(polyPath([[lx, top + 70], [lx + 16, top + 70], [lx + 11, FL], [lx + 5, FL]]));
    }
  });
  // plateau de marbre
  prism(g, {
    x: x0 - 10, y: top, w: x1 - x0 + 20, h: 16, r: 3, z0, z1,
    side: '#BDB6AB',
    top: lg(g, 0, pY(top, z0), 0, pY(top, z1), [[0, '#E4E0D9'], [1, '#F4F2EE']]),
    front: (p) => {
      g.fillStyle = lg(g, 0, top, 0, top + 16, [[0, '#F2EFEA'], [1, '#C9C3B9']]);
      g.fill(p);
    },
  });
  atDepth(g, z1 - 6, () => {
    // ceinture sculptée
    const ay = top + 16;
    g.fillStyle = GILT(g, x0, ay, x0, ay + 58);
    g.fillRect(x0, ay, x1 - x0, 58);
    g.fillStyle = 'rgba(90,65,25,0.35)';
    g.fillRect(x0, ay + 8, x1 - x0, 2);
    g.fillRect(x0, ay + 48, x1 - x0, 2);
    // frise de raies de cœur + rosace centrale
    for (let x = x0 + 12; x < x1 - 8; x += 14) {
      g.fillStyle = 'rgba(255,240,190,0.55)';
      g.beginPath();
      g.ellipse(x, ay + 28, 4, 11, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(100,70,25,0.3)';
      g.beginPath();
      g.ellipse(x + 2, ay + 30, 3, 10, 0, 0, TAU);
      g.fill();
    }
    const cx = (x0 + x1) / 2;
    g.fillStyle = GILT(g, cx - 26, ay, cx + 26, ay + 58);
    g.beginPath();
    g.ellipse(cx, ay + 29, 30, 24, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(100,70,25,0.5)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      g.beginPath();
      g.moveTo(cx, ay + 29);
      g.lineTo(cx + Math.cos(a) * 22, ay + 29 + Math.sin(a) * 17);
      g.stroke();
    }
    // pieds avant cannelés + dés de raccordement
    for (const lx of [x0, x1 - 26]) {
      g.fillStyle = GILT(g, lx, ay, lx + 26, ay + 58);
      g.fillRect(lx, ay, 26, 58);
      g.fillStyle = 'rgba(255,240,190,0.7)';
      g.beginPath();
      g.arc(lx + 13, ay + 29, 8, 0, TAU);
      g.fill();
      const leg = polyPath([[lx + 2, ay + 58], [lx + 24, ay + 58], [lx + 18, FL - 16], [lx + 8, FL - 16]]);
      g.fillStyle = GILT(g, lx + 2, 0, lx + 24, 0);
      g.fill(leg);
      g.strokeStyle = 'rgba(100,70,25,0.4)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(lx + 8 + k * 5, ay + 66);
        g.lineTo(lx + 10 + k * 3, FL - 24);
        g.stroke();
      }
      g.fillStyle = GILT(g, lx + 4, 0, lx + 22, 0);
      g.beginPath();
      g.ellipse(lx + 13, FL - 10, 9, 10, 0, 0, TAU);
      g.fill();
      softEllipse(g, lx + 13, FL, 18, 4, SHADOW, 0.5);
    }
    // entretoise + urne
    g.fillStyle = GILT(g, x0, FL - 110, x0, FL - 96);
    g.fill(polyPath([[x0 + 16, FL - 104], [x1 - 16, FL - 104], [x1 - 20, FL - 94], [x0 + 20, FL - 94]]));
    g.fillStyle = GILT(g, cx - 18, 0, cx + 18, 0);
    g.beginPath();
    g.moveTo(cx - 8, FL - 104);
    g.bezierCurveTo(cx - 24, FL - 124, cx - 22, FL - 150, cx, FL - 156);
    g.bezierCurveTo(cx + 22, FL - 150, cx + 24, FL - 124, cx + 8, FL - 104);
    g.fill();
  });
  return top;
}

/** Silhouette du dossier de bergère : rectangle au sommet cintré (« chapeau de gendarme » adouci). */
function bergereBackPath(cx, top, bottom, hw) {
  const p = new Path2D();
  p.moveTo(cx - hw, bottom);
  p.lineTo(cx - hw, top + 46);
  p.bezierCurveTo(cx - hw, top + 20, cx - hw * 0.55, top + 14, cx, top);
  p.bezierCurveTo(cx + hw * 0.55, top + 14, cx + hw, top + 20, cx + hw, top + 46);
  p.lineTo(cx + hw, bottom);
  p.closePath();
  return p;
}

const BERGERE_WOOD = '#D3CDC0';

/** Bergère Louis XVI — arrière : ombres, dossier laqué gris Trianon à filet doré. */
function bergereBack(g, cx, z) {
  const wood = BERGERE_WOOD;
  const seat = FL - 150;
  const top = FL - 372;
  atDepth(g, z, () => {
    softEllipse(g, cx, FL, 170, 18, SHADOW, 0.45);
    blurShape(g, bergereBackPath(cx, top, seat + 30, 118), 'rgba(40,28,20,0.22)', 24, 12, 10);
    g.fillStyle = lg(g, cx - 112, 0, cx + 112, 0, [[0, lt(wood, 0.4)], [0.5, wood], [1, dk(wood, 0.2)]]);
    g.fill(bergereBackPath(cx, top, seat, 112));
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1.2;
    g.stroke(bergereBackPath(cx, top + 4, seat, 108));
    g.strokeStyle = 'rgba(184,145,63,0.9)';
    g.lineWidth = 1.6;
    g.stroke(bergereBackPath(cx, top + 9, seat, 103));
    // nœud de ruban sculpté au sommet
    g.fillStyle = lt(wood, 0.3);
    g.beginPath();
    g.ellipse(cx - 13, top - 3, 13, 7, -0.35, 0, TAU);
    g.ellipse(cx + 13, top - 3, 13, 7, 0.35, 0, TAU);
    g.fill();
    g.fillStyle = dk(wood, 0.12);
    g.beginPath();
    g.arc(cx, top - 2, 5, 0, TAU);
    g.fill();
  });
}

/** Bergère — avant : ceinture sculptée, pieds cannelés, consoles et accotoirs. */
function bergereFront(g, cx, z) {
  const wood = BERGERE_WOOD;
  const seat = FL - 150;
  const woodH = (x0, x1) => lg(g, x0, 0, x1, 0, [[0, lt(wood, 0.35)], [0.5, wood], [1, dk(wood, 0.22)]]);
  atDepth(g, z + 34, () => {
    // pieds fuselés cannelés + dés de raccordement à rosace
    for (const lx of [cx - 140, cx + 114]) {
      g.fillStyle = woodH(lx, lx + 26);
      g.fillRect(lx, seat + 2, 26, 38);
      g.fillStyle = 'rgba(184,145,63,0.85)';
      g.beginPath();
      g.arc(lx + 13, seat + 21, 7, 0, TAU);
      g.fill();
      g.fillStyle = woodH(lx + 2, lx + 24);
      g.fill(polyPath([[lx + 2, seat + 40], [lx + 24, seat + 40], [lx + 18, FL - 14], [lx + 8, FL - 14]]));
      g.strokeStyle = 'rgba(110,100,85,0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(lx + 8 + k * 5, seat + 48);
        g.lineTo(lx + 10 + k * 3, FL - 20);
        g.stroke();
      }
      g.fillStyle = dk(wood, 0.1);
      g.beginPath();
      g.ellipse(lx + 13, FL - 7, 8, 7, 0, 0, TAU);
      g.fill();
    }
    // ceinture à frise de raies de cœur
    g.fillStyle = lg(g, 0, seat + 4, 0, seat + 38, [[0, lt(wood, 0.35)], [1, dk(wood, 0.15)]]);
    g.fillRect(cx - 114, seat + 4, 228, 32);
    g.strokeStyle = 'rgba(184,145,63,0.8)';
    g.lineWidth = 1.4;
    g.strokeRect(cx - 108, seat + 9, 216, 22);
    for (let x = cx - 100; x < cx + 102; x += 11) {
      g.fillStyle = 'rgba(110,100,85,0.22)';
      g.beginPath();
      g.ellipse(x, seat + 20, 3, 6, 0, 0, TAU);
      g.fill();
    }
    // consoles d'accotoir et accotoirs
    for (const sgn of [-1, 1]) {
      const ax = cx + sgn * 127;
      g.fillStyle = woodH(ax - 11, ax + 11);
      g.beginPath();
      g.moveTo(ax - 10, seat + 6);
      g.bezierCurveTo(ax - 12, seat - 30, ax - 6 * sgn, seat - 70, ax + 6 * sgn, seat - 100);
      g.lineTo(ax + 20 * sgn, seat - 100);
      g.bezierCurveTo(ax + 10 * sgn, seat - 66, ax + 12, seat - 30, ax + 10, seat + 6);
      g.closePath();
      g.fill();
      g.fillStyle = lg(g, 0, seat - 112, 0, seat - 96, [[0, lt(wood, 0.4)], [1, dk(wood, 0.15)]]);
      g.fill(rrPath(ax - 22, seat - 112, 44, 16, 8));
    }
  });
}

/** Porte-fenêtre : panneaux de soubassement moulurés + crémone en laiton. */
function frenchDoorHardware(g, f) {
  const { ix, lw, sashY, sashH, sw, leaves, panel, frame } = f;
  for (let l = 0; l < leaves; l++) {
    const gx = ix + l * lw + sw;
    const gw = lw - sw * 2;
    const py = sashY + sashH - sw - panel;
    g.fillStyle = lg(g, 0, py, 0, py + panel, [[0, lt(frame, 0.3)], [1, dk(frame, 0.08)]]);
    g.fillRect(gx, py, gw, panel);
    g.strokeStyle = rgba(dk(frame, 0.35), 0.45);
    g.lineWidth = 2;
    g.strokeRect(gx + 14, py + 14, gw - 28, panel - 28);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    g.strokeRect(gx + 17, py + 17, gw - 34, panel - 34);
  }
  const x = ix + lw - 11;
  g.fillStyle = GILT(g, x - 3, 0, x + 3, 0);
  g.fillRect(x - 2.5, sashY + 8, 5, sashH - 16);
  for (const y of [sashY + 30, sashY + sashH - 30]) g.fillRect(x - 6, y, 12, 6);
  const hy = sashY + sashH * 0.5;
  g.fillStyle = GILT(g, x - 8, 0, x + 8, 0);
  g.beginPath();
  g.ellipse(x, hy, 6.5, 17, 0, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,245,210,0.8)';
  g.fillRect(x - 3, hy - 10, 2, 12);
}

function drawClassiqueFrancais(ctx, api) {
  const spec = SPEC_CLASSIQUE_FRANCAIS;
  const win = spec.window;
  const wall = '#EAE5DB';
  const rail = 590;
  layer(ctx, 'classique-francais/back', FULL, (g) => {
    drawRoom(g, {
      wall, tex: 'plaster', ceilingColor: '#F4F1EB', ceilY: 28,
      cornice: { h: 50, color: '#F0ECE4' }, glow: { x: 800, y: 420, r: 720, a: 0.5 }, baseboard: { h: 34, color: '#EFEAE1' },
    });
    // boiseries (panneaux moulurés) et cimaise
    g.fillStyle = lg(g, 0, rail - 7, 0, rail + 9, [[0, lt(wall, 0.5)], [0.4, wall], [0.7, dk(wall, 0.15)], [1, dk(wall, 0.25)]]);
    g.fillRect(0, rail - 7, 560, 16);
    g.fillRect(1040, rail - 7, 560, 16);
    panelMolding(g, 70, 140, 250, 400, wall, { t: 11, light: -1 });
    panelMolding(g, 96, 166, 198, 348, wall, { t: 6, light: -1 });
    panelMolding(g, 70, 628, 250, 138, wall, { t: 9, light: -1 });
    panelMolding(g, 1280, 628, 250, 138, wall, { t: 9, light: 1 });
    // miroir trumeau
    const mx0 = 1296;
    const mx1 = 1514;
    const my0 = 170;
    const my1 = 548;
    blurShape(g, rrPath(mx0, my0, mx1 - mx0, my1 - my0, 4), 'rgba(40,28,20,0.35)', 16, 6, 10);
    g.fillStyle = GILT(g, mx0, my0, mx1, my1);
    g.fill(rrPath(mx0, my0, mx1 - mx0, my1 - my0, 4));
    // fronton
    const fr = new Path2D();
    fr.moveTo(mx0 + 30, my0 + 2);
    fr.quadraticCurveTo((mx0 + mx1) / 2, my0 - 70, mx1 - 30, my0 + 2);
    fr.closePath();
    g.fill(fr);
    g.fillStyle = 'rgba(255,240,190,0.6)';
    g.beginPath();
    g.ellipse((mx0 + mx1) / 2, my0 - 22, 16, 12, 0, 0, TAU);
    g.fill();
    const glass = rrPath(mx0 + 22, my0 + 22, mx1 - mx0 - 44, my1 - my0 - 44, 2);
    g.fillStyle = lg(g, mx0, my0, mx1, my1, [[0, '#E8E6E0'], [0.5, '#CFCDC5'], [1, '#B9B6AE']]);
    g.fill(glass);
    g.save();
    g.clip(glass);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(mx0 + 40, my0 + 40, 70, 260);
    g.fillStyle = 'rgba(190,180,165,0.5)';
    g.fillRect(mx0, my1 - 120, mx1 - mx0, 120);
    g.fillStyle = lg(g, mx0, my0, mx1, my1, [[0.25, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.3)'], [0.55, 'rgba(255,255,255,0)']]);
    g.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
    g.restore();
    g.strokeStyle = 'rgba(110,80,30,0.5)';
    g.lineWidth = 2;
    g.strokeRect(mx0 + 21, my0 + 21, mx1 - mx0 - 42, my1 - my0 - 42);
    drawWindow(g, win, {
      frame: '#F2EFE8', reveal: '#E7E2D8', leaves: 2, rows: 4, fw: 16, sw: 12, bar: 5, depth: 30,
      transom: 124, transomBars: 2, panel: 104, casing: { w: 30, color: '#F1EDE5' }, view: 'park', sill: false, handle: false,
      after: (gg, f) => frenchDoorHardware(gg, f),
    });
    drawFloor(g, chevronFloorTex('hongrie', { colW: 118, slat: 25, colors: ['#C09062', '#B5865A', '#C99C6D', '#AD7F55'], grain: 0.32 }), {
      light: { x0: 590, x1: 1010, a: 0.55 }, gloss: 0.28,
    });
    // seuil de pierre
    prism(g, { x: win.x - 6, y: FL - 4, w: win.w + 12, h: 4, r: 0, z0: -10, z1: 14, side: '#CFC8BB', top: '#E7E1D6', front: '#D8D1C4' });
    backFinish(g, {});
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Console dorée + objets
  layer(ctx, 'classique-francais/console', [1180, 360, 420, 560], (g) => {
    const top = drawGiltConsole(g, 1300, 1510, 10, 110);
    atDepth(g, 60, () => {
      // potiche bleu et blanc
      const x = 1450;
      const y = top;
      softEllipse(g, x, y, 44, 6, SHADOW, 0.35);
      const v = new Path2D();
      v.moveTo(x - 22, y);
      v.bezierCurveTo(x - 50, y - 30, x - 48, y - 100, x - 22, y - 118);
      v.lineTo(x + 22, y - 118);
      v.bezierCurveTo(x + 48, y - 100, x + 50, y - 30, x + 22, y);
      v.closePath();
      g.fillStyle = lg(g, x - 48, 0, x + 48, 0, [[0, '#E9EBEE'], [0.35, '#FFFFFF'], [1, '#B8BEC6']]);
      g.fill(v);
      g.save();
      g.clip(v);
      g.strokeStyle = 'rgba(40,70,130,0.75)';
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x - 10 + k * 6, y - 60, 12 + k * 3, 0.5 + k, 2.5 + k);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,70,130,0.8)';
      g.fillRect(x - 60, y - 16, 120, 6);
      g.fillRect(x - 60, y - 106, 120, 5);
      g.restore();
      g.fillStyle = lg(g, x - 26, 0, x + 26, 0, [[0, '#DADDE2'], [1, '#9CA3AD']]);
      g.beginPath();
      g.ellipse(x, y - 122, 24, 9, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(40,70,130,0.85)';
      g.beginPath();
      g.arc(x, y - 132, 7, 0, TAU);
      g.fill();
      // bougeoir bronze doré
      const bx = 1350;
      g.fillStyle = GILT(g, bx - 14, 0, bx + 14, 0);
      g.fill(polyPath([[bx - 16, y], [bx + 16, y], [bx + 5, y - 12], [bx + 4, y - 88], [bx + 10, y - 98], [bx - 10, y - 98], [bx - 4, y - 88], [bx - 5, y - 12]]));
      g.fillStyle = lg(g, bx - 5, 0, bx + 5, 0, [[0, '#FFFDF7'], [1, '#DAD3C5']]);
      g.fillRect(bx - 5, y - 150, 10, 52);
      g.fillStyle = '#F6E7C4';
      g.beginPath();
      g.ellipse(bx, y - 156, 3, 6, 0, 0, TAU);
      g.fill();
    });
  });

  // Bergère : dossier, garniture (textile), ceinture et accotoirs
  const bx = 292;
  const bz = 170;
  const seat = FL - 150;
  const btop = FL - 372;
  layer(ctx, 'classique-francais/bergere', [0, 360, 580, 600], (g) => bergereBack(g, bx, bz));
  atDepth(ctx, bz + 2, () => {
    const p = bergereBackPath(bx, btop + 17, seat - 2, 95);
    textile(ctx, api, 'cushions', p, { kind: 'cushion', bounds: { x: bx - 95, y: btop + 17, w: 190, h: seat - btop - 19 }, fallbackColor: '#C9CDBF', scale: 100, light: 0.3 });
  });
  atDepth(ctx, bz + 20, () => {
    for (const sgn of [-1, 1]) {
      const x0 = sgn < 0 ? bx - 138 : bx + 100;
      const p = rrPath(x0, seat - 100, 38, 104, 6);
      textile(ctx, api, 'cushions', p, { kind: 'flat', bounds: { x: x0, y: seat - 100, w: 38, h: 104 }, fallbackColor: '#C9CDBF', scale: 100, light: sgn });
    }
  });
  atDepth(ctx, bz + 30, () => {
    const p = rrPath(bx - 124, seat - 44, 248, 54, 18);
    blurShape(ctx, p, 'rgba(40,28,20,0.3)', 8, 0, 6);
    textile(ctx, api, 'cushions', p, { kind: 'cushion', bounds: { x: bx - 124, y: seat - 44, w: 248, h: 54 }, fallbackColor: '#C9CDBF', scale: 100, light: 0.3 });
  });
  layer(ctx, 'classique-francais/bergere-front', [0, 360, 580, 600], (g) => bergereFront(g, bx, bz));
  atDepth(ctx, bz + 36, () => {
    for (const sgn of [-1, 1]) {
      const ax = bx + sgn * 127;
      const mp = rrPath(ax - 24, seat - 126, 48, 18, 9);
      textile(ctx, api, 'cushions', mp, { kind: 'cushion', bounds: { x: ax - 24, y: seat - 126, w: 48, h: 18 }, fallbackColor: '#C9CDBF', scale: 100 });
    }
  });

  finish(ctx, {});
  });
}

/* ================================================================== */
/* Décor 7 — Moderne minimaliste                                       */
/* ================================================================== */

const SPEC_MINIMALISTE = {
  mode: 'window',
  window: { x: 660, y: 120, w: 420, h: 640 },
  ceilingY: 40,
  floorY: 828,
  sillY: 760,
  rodMaxX0: 440,
  rodMaxX1: 1300,
  hardware: 'white',
};

/** Toile abstraite : un geste au pinceau anthracite, un point terracotta. */
function artGesture(g, x, y, w, h) {
  g.fillStyle = '#F1EEE8';
  g.fillRect(x, y, w, h);
  const r = rng(17);
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = `rgba(38,36,31,${0.08 + r() * 0.12})`;
    g.lineWidth = 3 + r() * 5;
    g.beginPath();
    const o = (r() - 0.5) * 18;
    g.arc(x + w * 0.5 + o * 0.3, y + h * 0.62, w * 0.34 + o, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
  blob(g, x + w * 0.66, y + h * 0.3, w * 0.07, w * 0.07, '#B5654A');
  g.fillStyle = 'rgba(216,203,180,0.6)';
  g.fillRect(x, y + h * 0.8, w, 3);
  texturize(g, rrPath(x, y, w, h, 0), noiseTile('canvas', 64, 16, 2, 0.6, 5, 70), 0.35, 'soft-light');
}

function drawMinimaliste(ctx, api) {
  const spec = SPEC_MINIMALISTE;
  const win = spec.window;
  layer(ctx, 'minimaliste/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#DAD6D0', tex: 'concrete', ceilingColor: '#EEECE8',
      glow: { x: 870, y: 420, r: 720, a: 0.5 }, baseboard: { h: 6, color: '#B8B2AA' },
    });
    // toile sur châssis (sans cadre) avec tranche
    const ax = 1330;
    const ay = 220;
    const aw = 230;
    const ah = 330;
    blurShape(g, rrPath(ax, ay, aw, ah, 1), 'rgba(40,30,20,0.3)', 16, 8, 12);
    prism(g, { x: ax, y: ay, w: aw, h: ah, r: 0, z0: 0, z1: 14, side: '#D9D4CB', top: '#E8E4DC' });
    atDepth(g, 14, () => artGesture(g, ax, ay, aw, ah));
    drawWindow(g, win, {
      frame: '#2A2927', reveal: '#D3CFC8', leaves: 2, rows: 1, fw: 8, sw: 6, depth: 44, handle: false, view: 'garden',
      sill: { color: '#CEC9C1', h: 8, over: 4, depth: 14 },
    });
    drawFloor(g, concreteFloorTex('beton', { color: '#BDB8B0' }), { light: { x0: 660, x1: 1080, a: 0.5 }, gloss: 0.4 });
    backFinish(g, { grain: 0.3 });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Lampe sculpturale (globe opalin sur tige)
  layer(ctx, 'minimaliste/lamp', [860, 60, 740, 900], (g) => {
    const cx = 1215;
    atDepth(g, 170, () => {
      const gy = 370;
      glow(g, cx, gy, 300, '255,236,205', 0.45);
      softEllipse(g, cx, FL, 70, 10, SHADOW, 0.45);
      const base = rrPath(cx - 46, FL - 34, 92, 34, 4);
      g.fillStyle = lg(g, cx - 46, 0, cx + 46, 0, [[0, '#E8DFD1'], [0.4, '#F3ECE0'], [1, '#B9AE9D']]);
      g.fill(base);
      texturize(g, base, noiseTile('travertine', 128, 4, 4, 1.2, 41, 30), 0.5);
      g.strokeStyle = '#2A2826';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, FL - 34);
      g.bezierCurveTo(cx, FL - 200, cx + 30, gy + 180, cx + 6, gy + 70);
      g.stroke();
      const s = ellipsePath(cx, gy, 82, 82);
      g.fillStyle = rg(g, cx - 20, gy - 22, 6, cx, gy, 84, [[0, '#FFFDF6'], [0.6, '#F7EEDC'], [1, '#E3D3B6']]);
      g.fill(s);
      g.save();
      g.clip(s);
      g.strokeStyle = 'rgba(190,170,140,0.25)';
      g.lineWidth = 1.2;
      for (let k = -6; k <= 6; k++) {
        g.beginPath();
        g.ellipse(cx, gy + k * 13, 84, 6, 0, 0, TAU);
        g.stroke();
      }
      g.restore();
    });
  });

  // Canapé bas monolithique
  const sofa = {
    x0: 205, x1: 775, z0: 40, z1: 300, color: '#DED7CC', texture: 'linen',
    seatH: 104, backH: 186, armH: 186, armW: 70, radius: 10, backInset: 0, backCushions: 0, seats: 3, shadowDx: 10,
  };
  layer(ctx, 'minimaliste/sofa', [0, 520, 900, 480], (g) => drawSofaBack(g, sofa));
  atDepth(ctx, sofa.z0 + 120, () => {
    cushion(ctx, api, 355, FL - 104 - 62, 150, 140, { rot: -0.06, color: '#D8CBB4' });
    cushion(ctx, api, 500, FL - 104 - 54, 132, 124, { rot: 0.05, color: '#26241F' });
  });
  layer(ctx, 'minimaliste/sofa-front', [0, 380, 1100, 620], (g) => {
    drawSofaFront(g, sofa);
    // guéridon tambour en travertin, vase noir et branche d'olivier
    const cx = 880;
    const zc = 170;
    softEllipse(g, pX(cx, zc), pY(FL, zc), 70 * sc(zc), 12, SHADOW, 0.5);
    const tex = noiseTile('travertine', 128, 4, 4, 1.2, 41, 30);
    const t = cylinder(g, {
      cx, zc, rad: 56, yTop: FL - 150, yBot: FL,
      side: (a2, b2) => lg(g, a2, 0, b2, 0, [[0, '#E9E0D1'], [0.35, '#F4ECE0'], [1, '#B8AC99']]),
      top: (X, y, rx) => lg(g, X - rx, y, X + rx, y, [[0, '#F7F1E7'], [1, '#E2D7C6']]),
    });
    texturize(g, t.body, tex, 0.55);
    texturize(g, t.tp, tex, 0.45);
    g.strokeStyle = 'rgba(150,135,110,0.25)';
    g.lineWidth = 1;
    for (let k = 1; k < 6; k++) {
      g.beginPath();
      g.moveTo(t.X - t.rx, t.top + k * 24);
      g.lineTo(t.X + t.rx, t.top + k * 24);
      g.stroke();
    }
    atDepth(g, zc, () => {
      const y = FL - 150;
      const v = new Path2D();
      v.moveTo(cx - 14, y);
      v.bezierCurveTo(cx - 34, y - 18, cx - 30, y - 62, cx - 8, y - 78);
      v.lineTo(cx + 8, y - 78);
      v.bezierCurveTo(cx + 30, y - 62, cx + 34, y - 18, cx + 14, y);
      v.closePath();
      g.fillStyle = lg(g, cx - 34, 0, cx + 34, 0, [[0, '#4A4642'], [0.35, '#5E5954'], [1, '#1E1C1A']]);
      g.fill(v);
      g.strokeStyle = '#6E6A57';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, y - 76);
      g.bezierCurveTo(cx + 10, y - 150, cx - 30, y - 210, cx - 70, y - 260);
      g.stroke();
      const r = rng(71);
      for (let k = 0; k < 16; k++) {
        const tt = 0.2 + (k / 16) * 0.8;
        const u = 1 - tt;
        const px = u * u * u * cx + 3 * u * u * tt * (cx + 10) + 3 * u * tt * tt * (cx - 30) + tt * tt * tt * (cx - 70);
        const py = u * u * u * (y - 76) + 3 * u * u * tt * (y - 150) + 3 * u * tt * tt * (y - 210) + tt * tt * tt * (y - 260);
        leaf(g, px, py, 22 + r() * 8, 3.2, (k % 2 ? -0.3 : -2.6) + (r() - 0.5) * 0.4, mix('#7F8C6C', '#A7B196', r()), { rib: false, tip: 0.45 });
      }
    });
  });

  finish(ctx, {});
  });
}

/* ================================================================== */
/* Décor 8 — Marocain                                                  */
/* ================================================================== */

const SPEC_MAROCAIN = {
  mode: 'window',
  window: { x: 620, y: 130, w: 360, h: 470 },
  ceilingY: 40,
  floorY: 828,
  sillY: 600,
  rodMaxX0: 420,
  rodMaxX1: 1180,
  hardware: 'brass',
};

/** Zellige : carreaux émaillés irréguliers (tuile raccordable). */
function zelligeTile(key, colors, tw, th, cols, rows, joint = '#E9E2D6') {
  return cached('zellige:' + key, tw * cols, th * rows, (g, w, h) => {
    const r = rng(hashStr(key));
    g.fillStyle = joint;
    g.fillRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const c = colors[(i + j) % colors.length];
        const base = jitter(c, r, 0.1);
        const x = i * tw + 1;
        const y = j * th + 1;
        const p = rrPath(x, y, tw - 2, th - 2, 1.5);
        g.fillStyle = lg(g, x, y, x + tw, y + th, [[0, lt(base, 0.12)], [0.5, base], [1, dk(base, 0.14)]]);
        g.fill(p);
        g.fillStyle = rg(g, x + tw * (0.2 + r() * 0.3), y + th * (0.2 + r() * 0.3), 0, x + tw * 0.4, y + th * 0.4, Math.max(tw, th) * 0.6, [
          [0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)'],
        ]);
        g.fill(p);
        g.strokeStyle = rgba(dk(base, 0.3), 0.35);
        g.lineWidth = 1;
        g.stroke(p);
      }
    }
  }, spriteRes());
}

/** Frise d'étoiles à huit branches (bande de zellige). */
function starFrieze(g, x0, x1, y, h) {
  g.fillStyle = '#EFE7D8';
  g.fillRect(x0, y, x1 - x0, h);
  const s = h * 0.42;
  for (let x = x0 + h / 2; x < x1 + h; x += h) {
    const cx = x;
    const cy = y + h / 2;
    const star = new Path2D();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rr = k % 2 ? s * 0.62 : s;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (k) star.lineTo(px, py);
      else star.moveTo(px, py);
    }
    star.closePath();
    g.fillStyle = '#2F5D8A';
    g.fill(star);
    g.fillStyle = '#E3B04B';
    g.beginPath();
    g.arc(cx, cy, s * 0.3, 0, TAU);
    g.fill();
    g.fillStyle = '#1F5E55';
    g.fill(polyPath([[cx + h / 2, cy - s * 0.35], [cx + h / 2 + s * 0.35, cy], [cx + h / 2, cy + s * 0.35], [cx + h / 2 - s * 0.35, cy]]));
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x0, y + 2, x1 - x0, h * 0.3);
  g.fillStyle = '#6E4B32';
  g.fillRect(x0, y - 4, x1 - x0, 4);
  g.fillRect(x0, y + h, x1 - x0, 4);
}

/** Lanterne ciselée en laiton, allumée. */
function lantern(g, cx, topY, h, w) {
  const brass = (x0, x1) => lg(g, x0, 0, x1, 0, [[0, '#7A5A22'], [0.3, '#E2C27A'], [0.55, '#B08A3E'], [1, '#6A4C1C']]);
  g.strokeStyle = '#8C6A2C';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, 40);
  g.lineTo(cx, topY);
  g.stroke();
  const bodyTop = topY + h * 0.3;
  const bodyBot = topY + h * 0.78;
  // halo et points lumineux projetés sur le mur
  glow(g, cx, (bodyTop + bodyBot) / 2, w * 3.2, '255,205,130', 0.45);
  const r = rng(Math.round(cx));
  g.save();
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU;
    const d = w * (0.9 + r() * 1.8);
    const px = cx + Math.cos(a) * d;
    const py = (bodyTop + bodyBot) / 2 + Math.sin(a) * d * 0.8;
    const rad = 1.5 + r() * 2.5;
    g.fillStyle = `rgba(255,214,150,${0.25 + r() * 0.35})`;
    g.beginPath();
    g.arc(px, py, rad, 0, TAU);
    g.fill();
  }
  g.restore();
  // dôme en bulbe
  g.fillStyle = brass(cx - w / 2, cx + w / 2);
  g.beginPath();
  g.moveTo(cx, topY);
  g.bezierCurveTo(cx + w * 0.1, topY + h * 0.12, cx + w * 0.62, topY + h * 0.14, cx + w * 0.5, bodyTop);
  g.lineTo(cx - w * 0.5, bodyTop);
  g.bezierCurveTo(cx - w * 0.62, topY + h * 0.14, cx - w * 0.1, topY + h * 0.12, cx, topY);
  g.fill();
  // corps ajouré lumineux
  const body = polyPath([[cx - w * 0.5, bodyTop], [cx + w * 0.5, bodyTop], [cx + w * 0.42, bodyBot], [cx - w * 0.42, bodyBot]]);
  g.fillStyle = brass(cx - w / 2, cx + w / 2);
  g.fill(body);
  g.save();
  g.clip(body);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const px = cx - w * 0.36 + col * w * 0.18 + (row % 2 ? w * 0.09 : 0);
      const py = bodyTop + 8 + row * (bodyBot - bodyTop - 12) / 4.5;
      const edge = 1 - Math.abs(px - cx) / (w * 0.5);
      g.fillStyle = `rgba(255,${226 - row * 4},${160 - row * 6},${0.55 + edge * 0.45})`;
      const st = new Path2D();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const rr = k % 2 ? 2.4 : 5;
        if (k) st.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
        else st.moveTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      st.closePath();
      g.fill(st);
    }
  }
  g.fillStyle = lg(g, cx - w / 2, 0, cx + w / 2, 0, [[0, 'rgba(40,25,10,0.35)'], [0.35, 'rgba(0,0,0,0)'], [1, 'rgba(40,25,10,0.45)']]);
  g.fillRect(cx - w, bodyTop, w * 2, bodyBot - bodyTop);
  g.restore();
  g.strokeStyle = '#6A4C1C';
  g.lineWidth = 2;
  for (const t of [0, 1]) {
    g.beginPath();
    g.moveTo(cx - w * (0.5 - t * 0.08), t ? bodyBot : bodyTop);
    g.lineTo(cx + w * (0.5 - t * 0.08), t ? bodyBot : bodyTop);
    g.stroke();
  }
  // fond conique + fleuron
  g.fillStyle = brass(cx - w / 2, cx + w / 2);
  g.fill(polyPath([[cx - w * 0.42, bodyBot], [cx + w * 0.42, bodyBot], [cx + 4, topY + h], [cx - 4, topY + h]]));
  g.beginPath();
  g.arc(cx, topY + h + 4, 5, 0, TAU);
  g.fill();
}

/** Table plateau en laiton ciselé sur piètement pliant en bois. */
function brassTrayTable(g, cx, z) {
  const top = FL - 150;
  const s = sc(z);
  const X = pX(cx, z);
  const Y = pY(top, z);
  const rx = 128 * s;
  const ry = Math.abs(pY(top, z - 128) - pY(top, z + 128)) / 2;
  softEllipse(g, X, pY(FL, z), rx * 1.05, 18, SHADOW, 0.45);
  atDepth(g, z, () => {
    g.strokeStyle = '#5E3F2A';
    g.lineCap = 'round';
    g.lineWidth = 9;
    for (const [a, b] of [[-70, 60], [70, -60]]) {
      g.beginPath();
      g.moveTo(cx + a, FL - 4);
      g.lineTo(cx + b, top + 16);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,220,180,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 72, FL - 6);
    g.lineTo(cx + 58, top + 16);
    g.stroke();
    g.fillStyle = '#5E3F2A';
    g.beginPath();
    g.arc(cx, (FL + top) / 2 + 8, 6, 0, TAU);
    g.fill();
  });
  // plateau
  g.fillStyle = lg(g, X - rx, Y, X + rx, Y, [[0, '#8A6424'], [0.5, '#C9A04E'], [1, '#7A561C']]);
  g.beginPath();
  g.ellipse(X, Y + 6, rx, ry, 0, 0, TAU);
  g.fill();
  const tp = ellipsePath(X, Y, rx, ry);
  g.fillStyle = rg(g, X - rx * 0.3, Y - ry * 0.4, 4, X, Y, rx, [[0, '#F3DB98'], [0.5, '#D4AE5C'], [1, '#A47C30']]);
  g.fill(tp);
  g.strokeStyle = 'rgba(110,75,20,0.45)';
  g.lineWidth = 1.2;
  for (let k = 1; k <= 5; k++) {
    g.beginPath();
    g.ellipse(X, Y, rx * (k / 6), ry * (k / 6), 0, 0, TAU);
    g.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    g.beginPath();
    g.moveTo(X + Math.cos(a) * rx * 0.33, Y + Math.sin(a) * ry * 0.33);
    g.lineTo(X + Math.cos(a) * rx * 0.83, Y + Math.sin(a) * ry * 0.83);
    g.stroke();
  }
  // théière argentée + verres
  const tx = X - 20;
  const ty = Y + 2;
  const pot = new Path2D();
  pot.moveTo(tx - 26, ty);
  pot.bezierCurveTo(tx - 40, ty - 22, tx - 30, ty - 46, tx - 12, ty - 50);
  pot.lineTo(tx + 12, ty - 50);
  pot.bezierCurveTo(tx + 30, ty - 46, tx + 40, ty - 22, tx + 26, ty);
  pot.closePath();
  blurShape(g, pot, 'rgba(40,28,20,0.35)', 6, 5, 3);
  g.fillStyle = lg(g, tx - 40, 0, tx + 40, 0, [[0, '#9EA2A6'], [0.3, '#F4F5F6'], [0.55, '#B9BDC1'], [1, '#6F7378']]);
  g.fill(pot);
  g.fill(polyPath([[tx - 8, ty - 50], [tx + 8, ty - 50], [tx + 4, ty - 72], [tx - 4, ty - 72]]));
  g.beginPath();
  g.arc(tx, ty - 76, 5, 0, TAU);
  g.fill();
  g.strokeStyle = '#A7ABB0';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(tx + 30, ty - 16);
  g.quadraticCurveTo(tx + 58, ty - 30, tx + 62, ty - 52);
  g.stroke();
  g.beginPath();
  g.moveTo(tx - 30, ty - 38);
  g.quadraticCurveTo(tx - 52, ty - 36, tx - 32, ty - 10);
  g.stroke();
  const cols = ['rgba(200,120,70,0.75)', 'rgba(70,140,110,0.7)', 'rgba(190,80,90,0.7)'];
  cols.forEach((c, i) => {
    const gx = X + 40 + i * 26;
    const gy = Y - 4 + (i % 2) * 8;
    g.fillStyle = c;
    g.fill(polyPath([[gx - 9, gy - 30], [gx + 9, gy - 30], [gx + 7, gy], [gx - 7, gy]]));
    g.fillStyle = 'rgba(255,240,200,0.8)';
    g.fillRect(gx - 8, gy - 30, 16, 3);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(gx - 5, gy - 26, 2, 20);
  });
}

function drawMarocain(ctx, api) {
  const spec = SPEC_MAROCAIN;
  const win = spec.window;
  const dado = 590;
  layer(ctx, 'marocain/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#D7B28B', tex: 'limewash', ceilingColor: '#7A5536',
      glow: { x: 800, y: 380, r: 640, a: 0.5 }, baseboard: false,
    });
    // plafond en cèdre peint
    for (let x = 0; x < W; x += 80) {
      g.fillStyle = 'rgba(40,25,15,0.35)';
      g.fillRect(x, 0, 3, 40);
      g.fillStyle = 'rgba(214,170,90,0.35)';
      g.fill(polyPath([[x + 40, 8], [x + 52, 20], [x + 40, 32], [x + 28, 20]]));
    }
    g.fillStyle = '#5A3E28';
    g.fillRect(0, 36, W, 6);
    // lustre du tadelakt
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = lg(g, 0, 40, W, dado, [[0, 'rgba(255,255,255,0.25)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.18)']]);
    g.fillRect(0, 40, W, dado - 40);
    g.restore();
    // soubassement de zellige
    const z = zelligeTile('vert', ['#1F5E55', '#EDE6D6', '#2A6B61', '#E6DDCB'], 34, 34, 8, 8);
    const pat = g.createPattern(z, 'repeat');
    pat.setTransform?.(new DOMMatrix().scale(1 / z.__res));
    g.fillStyle = pat;
    g.fillRect(0, dado + 34, W, FL - dado - 34);
    blurShape(g, rrPath(0, dado - 8, W, 10, 0), 'rgba(40,25,15,0.3)', 6, 0, -2);
    starFrieze(g, 0, W, dado, 34);
    g.fillStyle = '#23443E';
    g.fillRect(0, FL - 20, W, 20);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(0, FL - 20, W, 3);
    drawWindow(g, win, {
      shape: 'horseshoe', frame: '#5B3F2B', reveal: '#E4CDAE', leaves: 2, rows: 1, fw: 14, sw: 10, depth: 34, view: 'riad',
      casing: { w: 30, color: '#EFE3CF' }, handleColor: '#C9A04E', sill: { color: '#E8D8BE', h: 12, over: 26 },
      lattice: (gg, w) => moorishLattice(gg, w),
    });
    drawFloor(g, chevronFloorTex('bejmat', { colW: 56, slat: 18, colors: ['#B8664A', '#C27556', '#A95B40', '#C88A6A'], gap: '#E4D3BD', grain: 0 }), {
      light: { x0: 620, x1: 980, a: 0.5 }, gloss: 0.2,
    });
    drawRug(g, beniTex(), 330, 1270, 230, 560, { shadow: 0.2 });
    backFinish(g, { tint: 'rgba(255,220,170,0.12)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Lanternes
  layer(ctx, 'marocain/lanterns', [0, 30, W, 520], (g) => {
    lantern(g, 210, 250, 200, 92);
    lantern(g, 1330, 200, 230, 104);
    lantern(g, 1480, 300, 170, 80);
  });

  // Banquette sedari
  const x0 = 170;
  const x1 = 1430;
  const z0 = 20;
  const z1 = 230;
  const mTop = FL - 125;
  layer(ctx, 'marocain/sedari', [0, 520, W, 480], (g) => {
    floorShadow(g, x0, x1, z0, z1, 0.45, 16);
    prism(g, {
      x: x0, y: FL - 40, w: x1 - x0, h: 40, r: 2, z0, z1,
      side: '#4A3121', top: '#6B4630',
      front: (p) => {
        g.fillStyle = lg(g, 0, FL - 40, 0, FL, [[0, '#7A5238'], [1, '#4A3121']]);
        g.fill(p);
        g.fillStyle = 'rgba(214,170,90,0.45)';
        for (let x = x0 + 20; x < x1 - 10; x += 40) g.fill(polyPath([[x, FL - 20], [x + 10, FL - 30], [x + 20, FL - 20], [x + 10, FL - 10]]));
      },
    });
    prism(g, {
      x: x0, y: mTop, w: x1 - x0, h: FL - 40 - mTop, r: 14, z0: z0 + 6, z1: z1 - 4,
      side: '#CDBFA5', top: lg(g, 0, pY(mTop, z0), 0, pY(mTop, z1), [[0, '#D9CCB4'], [1, '#EFE6D6']]),
      front: (p) => {
        g.fillStyle = lg(g, 0, mTop, 0, FL - 40, [[0, '#F1E8D8'], [1, '#CDBFA5']]);
        g.fill(p);
        g.fillStyle = '#B0803E';
        g.fillRect(x0 + 4, mTop + 12, x1 - x0 - 8, 4);
        g.fillStyle = 'rgba(255,230,180,0.6)';
        g.fillRect(x0 + 4, mTop + 12, x1 - x0 - 8, 1.2);
        for (const [dy, c, hh] of [[34, '#1F5E55', 5], [42, '#B0803E', 2], [48, '#9C3F2E', 6], [57, '#B0803E', 2], [62, '#1F5E55', 5]]) {
          g.fillStyle = rgba(c, 0.8);
          g.fillRect(x0 + 4, mTop + dy, x1 - x0 - 8, hh);
        }
        texturize(g, p, noiseTile('linen', 128, 32, 2, 0.5, 13, 60), 0.45);
        g.strokeStyle = 'rgba(176,128,62,0.9)';
        g.lineWidth = 1.4;
        for (let x = x0 + 8; x < x1 - 6; x += 5) {
          g.beginPath();
          g.moveTo(x, FL - 44);
          g.lineTo(x + 1, FL - 32);
          g.stroke();
        }
      },
    });
  });
  // Coussins de dossier et coussins d'appoint (textile)
  atDepth(ctx, z0 + 60, () => {
    const n = 5;
    const cw = (x1 - x0 - 30) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + 15 + cw * (i + 0.5);
      cushion(ctx, api, cx, mTop - 78, cw - 8, 158, { rot: (i % 2 ? 0.02 : -0.02), color: '#9C3F2E', pinch: 0.04, light: 0 });
    }
  });
  atDepth(ctx, z0 + 140, () => {
    const pos = [[330, -0.12], [560, 0.08], [1040, -0.08], [1270, 0.12]];
    const colors = ['#1F5E55', '#D29B45', '#D29B45', '#1F5E55'];
    pos.forEach(([cx, rot], i) => cushion(ctx, api, cx, mTop - 50, 128, 118, { rot, color: colors[i], light: 0 }));
  });
  layer(ctx, 'marocain/tray', [500, 560, 600, 440], (g) => brassTrayTable(g, 800, 400));

  finish(ctx, { tint: 'rgba(255,220,170,0.12)' });
  });
}

/** Résille fine dans l'arc : étoiles à huit pointes entrelacées (fer forgé). */
function moorishLattice(g, win) {
  const { x, y, w } = win;
  const R = (w / 2) * 1.16;
  const d = Math.sqrt(R * R - (w / 2) * (w / 2));
  const cx = x + w / 2;
  const yc = y + R;
  const springY = yc + d;
  g.save();
  const clip = new Path2D();
  clip.rect(x, y - 10, w, springY - y + 10);
  g.clip(clip);
  g.strokeStyle = 'rgba(70,50,35,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x, springY);
  g.lineTo(x + w, springY);
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(70,50,35,0.7)';
  const s = w / 7;
  for (let j = 0; j < 8; j++) {
    for (let i = -1; i < 9; i++) {
      const px = x + (i + (j % 2) * 0.5) * s;
      const py = springY - (j + 0.5) * s * 0.9;
      if (Math.hypot(px - cx, py - yc) > R - s * 0.55) continue;
      const rr = s * 0.36;
      for (const rot of [0, Math.PI / 4]) {
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = rot + (k / 4) * TAU;
          const qx = px + Math.cos(a) * rr;
          const qy = py + Math.sin(a) * rr;
          if (k) g.lineTo(qx, qy);
          else g.moveTo(qx, qy);
        }
        g.closePath();
        g.stroke();
      }
    }
  }
  g.restore();
}

/* ================================================================== */
/* Décor 9 — Afrique contemporaine                                     */
/* ================================================================== */

const SPEC_AFRIQUE = {
  mode: 'window',
  window: { x: 250, y: 170, w: 380, h: 490 },
  ceilingY: 40,
  floorY: 828,
  sillY: 660,
  rodMaxX0: 50,
  rodMaxX1: 840,
  hardware: 'wood',
};

/** Chapeau Juju (Bamiléké) : plumes rayonnantes duveteuses, centre en raphia tressé. */
function jujuSprite(col, seed) {
  const S = 260;
  return cached('juju:' + col + ':' + seed, S, S, (g) => {
    const r = rng(seed);
    const c = S / 2;
    const R = S * 0.47;
    const base = hex(col);
    const light = lt(col, 0.35);
    const dark = dk(col, 0.3);
    // halo duveteux
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU;
      const r0 = R * (0.3 + r() * 0.2);
      const r1 = R * (0.75 + r() * 0.27);
      const bend = (r() - 0.5) * 0.25;
      const shade = r();
      g.strokeStyle = shade > 0.7 ? rgba(light, 0.35) : shade < 0.2 ? rgba(dark, 0.3) : `rgba(${base[0]},${base[1]},${base[2]},0.28)`;
      g.lineWidth = 1.6 + r() * 2.8;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.quadraticCurveTo(c + Math.cos(a + bend) * (r0 + r1) / 2, c + Math.sin(a + bend) * (r0 + r1) / 2, c + Math.cos(a + bend * 1.6) * r1, c + Math.sin(a + bend * 1.6) * r1);
      g.stroke();
    }
    // ombrage : bas-droite plus sombre
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = lg(g, 0, 0, S, S, [[0, 'rgba(255,250,240,0.18)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(30,20,10,0.25)']]);
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    // centre en raphia tressé (spirale)
    const cr = R * 0.3;
    g.fillStyle = rg(g, c - cr * 0.3, c - cr * 0.3, 2, c, c, cr, [[0, '#D9BF8C'], [1, '#A88452']]);
    g.beginPath();
    g.arc(c, c, cr, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(110,80,40,0.45)';
    g.lineWidth = 1;
    for (let k = 1; k < 7; k++) {
      g.beginPath();
      g.arc(c, c, (cr * k) / 7, 0, TAU);
      g.stroke();
    }
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * TAU;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * cr * 0.2, c + Math.sin(a) * cr * 0.2);
      g.lineTo(c + Math.cos(a + 0.3) * cr, c + Math.sin(a + 0.3) * cr);
      g.stroke();
    }
    g.fillStyle = 'rgba(60,40,20,0.3)';
    g.beginPath();
    g.arc(c, c, cr * 0.18, 0, TAU);
    g.fill();
  }, spriteRes());
}

/** Tabouret bamiléké sculpté (ajours à motifs triangulaires). */
function bamilekeStool(g, cx, z) {
  const wood = '#3E2C21';
  const top = FL - 150;
  const s = sc(z);
  softEllipse(g, pX(cx, z), pY(FL, z), 88 * s, 16, SHADOW, 0.5);
  const base = cylinder(g, {
    cx, zc: z, rad: 72, yTop: FL - 22, yBot: FL,
    side: (a, b) => lg(g, a, 0, b, 0, [[0, lt(wood, 0.15)], [0.35, lt(wood, 0.3)], [1, dk(wood, 0.3)]]),
    top: wood,
  });
  // corps ajouré
  atDepth(g, z, () => {
    const y0 = top + 22;
    const y1 = FL - 22;
    const hgt = y1 - y0;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = -Math.PI / 2 + t * Math.PI;
      const x = cx + Math.sin(a) * 58;
      const wdt = 14 * Math.cos(a) + 4;
      const shade = 0.15 + (1 - Math.cos(a)) * 0.3 + (t > 0.5 ? 0.15 : 0);
      g.fillStyle = dk(lt(wood, 0.35), shade);
      g.beginPath();
      g.moveTo(x - wdt / 2, y0);
      g.lineTo(x + wdt / 2, y0);
      g.lineTo(x + wdt / 2 + 4, y0 + hgt / 2);
      g.lineTo(x + wdt / 2, y1);
      g.lineTo(x - wdt / 2, y1);
      g.lineTo(x - wdt / 2 - 4, y0 + hgt / 2);
      g.closePath();
      g.fill();
    }
    // traverses en zigzag
    g.strokeStyle = lt(wood, 0.25);
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = cx - 58 + i * 14.5;
      const y = y0 + hgt * (i % 2 ? 0.72 : 0.28);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,220,180,0.18)';
    g.lineWidth = 2;
    g.stroke();
  });
  const t = cylinder(g, {
    cx, zc: z, rad: 78, yTop: top, yBot: top + 24,
    side: (a, b) => lg(g, a, 0, b, 0, [[0, lt(wood, 0.15)], [0.35, lt(wood, 0.35)], [1, dk(wood, 0.3)]]),
    top: (X, y, rx) => lg(g, X - rx, y, X + rx, y, [[0, lt(wood, 0.35)], [1, lt(wood, 0.08)]]),
  });
  g.strokeStyle = 'rgba(20,12,8,0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(t.X, t.top, t.rx * 0.8, t.ryT * 0.8, 0, 0, TAU);
  g.stroke();
  void base;
  // bol en bois
  g.fillStyle = lg(g, t.X - 40, 0, t.X + 40, 0, [[0, '#B98A5A'], [1, '#6E4B2E']]);
  g.beginPath();
  g.ellipse(t.X, t.top - 4, 40, 22, 0, 0, Math.PI);
  g.fill();
  g.fillStyle = '#5A3C25';
  g.beginPath();
  g.ellipse(t.X, t.top - 4, 40, 8, 0, 0, TAU);
  g.fill();
}

function drawAfrique(ctx, api) {
  const spec = SPEC_AFRIQUE;
  const win = spec.window;
  layer(ctx, 'afrique/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#D0A06C', tex: 'limewash', ceilingColor: '#EFE2CE',
      glow: { x: 440, y: 400, r: 640, a: 0.5 }, baseboard: { h: 24, color: '#C49260' },
    });
    // composition de chapeaux Juju
    const hats = [
      ['#F1E9DA', 11, 1085, 270, 250],
      ['#2A2522', 12, 1320, 205, 190],
      ['#B4492F', 13, 1290, 420, 205],
      ['#D8B27A', 14, 1480, 330, 150],
      ['#2A2522', 15, 1105, 470, 130],
      ['#F1E9DA', 16, 1500, 480, 110],
    ];
    for (const [col, seed, x, y, size] of hats) {
      softEllipse(g, x + 10, y + 14, size * 0.44, size * 0.44, SHADOW, 0.25);
      g.drawImage(jujuSprite(col, seed), x - size / 2, y - size / 2, size, size);
    }
    drawWindow(g, win, { frame: '#4A3526', reveal: '#DDBA8E', leaves: 2, rows: 1, fw: 14, sw: 11, depth: 28, view: 'tropical', handleColor: '#C9A04E', sill: { color: '#5A4130', h: 14 } });
    drawSucculent(g, 330, win.y + win.h, 1, 12, '#2E2825');
    drawFloor(g, woodFloorTex('walnut-across', { dir: 'across', plankW: 48, colors: ['#6E4C33', '#65452E', '#78553A', '#5E412C'], minL: 380, maxL: 760 }), {
      light: { x0: 250, x1: 630, a: 0.5 }, gloss: 0.2,
    });
    drawRug(g, juteTex(), 520, 1570, 110, 470, { shadow: 0.2 });
    backFinish(g, { tint: 'rgba(255,215,170,0.12)' });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Oiseau de paradis dans un panier Bolga
  layer(ctx, 'afrique/plant', [0, 0, 760, 900], (g) => {
    atDepth(g, 150, () => {
      softEllipse(g, 160, FL, 110, 16, SHADOW, 0.45);
      g.drawImage(bananaSprite(8, { green: '#44683F', n: 12 }), 165 - 336, FL - 180 - 630, 672, 630);
      drawBasket(g, 160, FL, 180, 190, { color: '#C9A46E', bands: [[0.8, '#2A2522'], [0.62, '#B4492F'], [0.44, '#2A2522']] });
    });
  });
  // Panier à couvercle (plaids roulés)
  layer(ctx, 'afrique/basket', [560, 540, 300, 360], (g) => {
    atDepth(g, 170, () => {
      softEllipse(g, 720, FL, 80, 12, SHADOW, 0.45);
      drawBasket(g, 720, FL, 150, 150, { color: '#CDAA72', bands: [[0.8, '#2A2522'], [0.55, '#B4492F'], [0.3, '#2A2522']] });
      // couvercle conique tressé
      const lid = new Path2D();
      lid.moveTo(640, FL - 150);
      lid.quadraticCurveTo(720, FL - 168, 800, FL - 150);
      lid.quadraticCurveTo(760, FL - 190, 726, FL - 214);
      lid.lineTo(714, FL - 214);
      lid.quadraticCurveTo(680, FL - 190, 640, FL - 150);
      lid.closePath();
      blurShape(g, lid, 'rgba(40,28,20,0.3)', 6, 0, 4);
      g.fillStyle = lg(g, 640, 0, 800, 0, [[0, '#DDBE88'], [0.4, '#CDAA72'], [1, '#8E6F43']]);
      g.fill(lid);
      g.save();
      g.clip(lid);
      g.strokeStyle = 'rgba(90,65,35,0.35)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.moveTo(640 + k * 3, FL - 150 - k * 9);
        g.quadraticCurveTo(720, FL - 168 - k * 8, 800 - k * 3, FL - 150 - k * 9);
        g.stroke();
      }
      g.fillStyle = 'rgba(42,37,34,0.85)';
      g.fillRect(640, FL - 176, 160, 7);
      g.restore();
      g.fillStyle = '#2A2522';
      g.beginPath();
      g.arc(720, FL - 216, 6, 0, TAU);
      g.fill();
    });
  });
  // Canapé bas en lin
  const sofa = {
    x0: 870, x1: 1450, z0: 30, z1: 280, color: '#E4D8C4', texture: 'linen', legH: 16, legColor: '#3E2C21',
    seatH: 118, backH: 220, armH: 176, armW: 70, radius: 22, backInset: 6, shadowDx: -8,
  };
  layer(ctx, 'afrique/sofa', [800, 520, 800, 480], (g) => drawSofaBack(g, sofa));
  atDepth(ctx, sofa.z0 + 165, () => {
    cushion(ctx, api, 1008, FL - 118 - 58, 146, 140, { rot: -0.08, color: '#B4492F' });
    cushion(ctx, api, 1162, FL - 118 - 50, 136, 128, { rot: 0.03, color: '#2A2522' });
    cushion(ctx, api, 1312, FL - 118 - 58, 146, 140, { rot: 0.09, color: '#D8B27A' });
  });
  layer(ctx, 'afrique/sofa-front', [800, 520, 800, 480], (g) => drawSofaFront(g, sofa));
  layer(ctx, 'afrique/stool', [620, 560, 360, 440], (g) => bamilekeStool(g, 800, 330));

  finish(ctx, { tint: 'rgba(255,215,170,0.12)' });
  });
}

/* ================================================================== */
/* Décor 10 — Salle de bain                                            */
/* ================================================================== */

const BATH = { a0: 540, a1: 1060, zf: 240, rim: 655, rodY: 200, soffit: 150 };
const SPEC_SALLE_DE_BAIN = (() => {
  const x0 = Math.round(pX(BATH.a0, BATH.zf));
  const x1 = Math.round(pX(BATH.a1, BATH.zf));
  const rodY = Math.round(pY(BATH.rodY, BATH.zf - 10));
  const rimY = Math.round(pY(BATH.rim, BATH.zf));
  return {
    mode: 'shower',
    window: { x: x0, y: rodY, w: x1 - x0, h: rimY - rodY },
    ceilingY: Math.round(pY(BATH.soffit, BATH.zf)),
    floorY: rimY + 40,
    sillY: rimY,
    rodMaxX0: x0,
    rodMaxX1: x1,
    hardware: 'brass',
  };
})();

/** Projette une texture murale sur une joue latérale (plan x = xp, de z0 à z1). */
function drawSideFace(g, tex, res, xp, z0, z1, y0, y1, shade) {
  const sa = pX(xp, z0);
  const sb = pX(xp, z1);
  const xa = Math.min(sa, sb);
  const xb = Math.max(sa, sb);
  const outline = polyPath([[sa, pY(y0, z0)], [sb, pY(y0, z1)], [sb, pY(y1, z1)], [sa, pY(y1, z0)]]);
  g.save();
  g.clip(outline);
  const band = 2;
  for (let x = Math.floor(xa); x < xb; x += band) {
    const s = (x + band / 2 - VX) / (xp - VX);
    const z = CAM * (1 - 1 / s);
    const u = Math.max(0, Math.min(z1 - z0 - 1, z - z0));
    const top = pY(y0, z);
    const bot = pY(y1, z);
    g.drawImage(tex, (u % tex.width / res) * res, 0, band * res * 0.5, (y1 - y0) * res, x, top, band + 0.6, bot - top);
  }
  if (shade) {
    g.fillStyle = shade;
    g.fill(outline);
  }
  g.restore();
}

/** Texture de zellige pour grandes surfaces (murs de l'alcôve). */
function bathTileTex() {
  return cached('bath:tiles', 300, 800, (g, w, h) => {
    const t = zelligeTile('sauge', ['#8FAE9B', '#9BB8A5', '#86A593', '#A3BEAB'], 30, 60, 10, 6, '#E6E4DA');
    const tw = t.width / t.__res;
    const th = t.height / t.__res;
    for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) g.drawImage(t, x, y, tw, th);
  }, qres(RS * 1.25, 0.5, 1.25));
}

function drawSalleDeBain(ctx, api) {
  const spec = SPEC_SALLE_DE_BAIN;
  const { a0, a1, zf, rim, soffit } = BATH;
  const tiles = bathTileTex();
  const ivory = zelligeTile('ivoire', ['#F1ECE2', '#E9E3D6', '#F5F1E9', '#E4DDCF'], 30, 30, 8, 8, '#DCD6CA');
  layer(ctx, 'salle-de-bain/back', FULL, (g) => {
    drawRoom(g, {
      wall: '#ECE6DC', tex: 'limewash', ceilingColor: '#F4F1EC',
      glow: { x: 1360, y: 300, r: 700, a: 0.5 }, baseboard: false,
    });
    // soubassement de zellige ivoire
    const pat = g.createPattern(ivory, 'repeat');
    pat.setTransform?.(new DOMMatrix().scale(1 / ivory.__res));
    g.fillStyle = pat;
    g.fillRect(0, 560, W, FL - 560);
    g.fillStyle = lg(g, 0, 552, 0, 566, [[0, '#F4EFE6'], [1, '#CFC6B6']]);
    g.fillRect(0, 552, W, 12);
    // petite fenêtre (lumière du jour)
    drawWindow(g, { x: 1270, y: 170, w: 210, h: 290 }, { frame: '#F4F1EA', reveal: '#E6E0D5', leaves: 1, rows: 2, fw: 12, sw: 10, bar: 5, depth: 30, handle: false, view: 'garden', sill: { color: '#EFEBE3', h: 12 } });
    // miroir rond laiton + applique
    const mx = 250;
    const my = 300;
    blurShape(g, ellipsePath(mx, my, 108, 108), 'rgba(40,28,20,0.3)', 14, 6, 10);
    g.fillStyle = GILT(g, mx - 108, my - 108, mx + 108, my + 108);
    g.fill(ellipsePath(mx, my, 108, 108));
    const mg = ellipsePath(mx, my, 100, 100);
    g.fillStyle = lg(g, mx - 100, my - 100, mx + 100, my + 100, [[0, '#EDEDE8'], [0.5, '#D7D8D3'], [1, '#C2C3BE']]);
    g.fill(mg);
    g.save();
    g.clip(mg);
    g.fillStyle = 'rgba(143,174,155,0.35)';
    g.fillRect(mx + 20, my - 110, 120, 240);
    g.fillStyle = lg(g, mx - 110, my - 110, mx + 110, my + 110, [[0.3, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.4)'], [0.55, 'rgba(255,255,255,0)']]);
    g.fillRect(mx - 110, my - 110, 220, 220);
    g.restore();
    for (const sx of [70, 420]) {
      glow(g, sx, 300, 110, '255,225,170', 0.5);
      g.fillStyle = GILT(g, sx - 8, 0, sx + 8, 0);
      g.fillRect(sx - 7, 300, 14, 40);
      g.fillStyle = rg(g, sx - 6, 286, 2, sx, 292, 24, [[0, '#FFFFFF'], [1, '#EFE6D2']]);
      g.beginPath();
      g.arc(sx, 292, 22, 0, TAU);
      g.fill();
    }
    // alcôve : fond carrelé
    g.save();
    g.beginPath();
    g.rect(a0, 40, a1 - a0, FL - 40);
    g.clip();
    const bp = g.createPattern(tiles, 'repeat');
    g.fillStyle = bp;
    g.fillRect(a0, 40, a1 - a0, FL - 40);
    g.fillStyle = lg(g, 0, 40, 0, rim, [[0, 'rgba(60,70,60,0.25)'], [0.4, 'rgba(0,0,0,0)'], [1, 'rgba(60,70,60,0.15)']]);
    g.fillRect(a0, 40, a1 - a0, FL - 40);
    // niche
    const nx0 = 870;
    const nx1 = 990;
    const ny0 = 420;
    const ny1 = 540;
    g.fillStyle = '#7F9C89';
    g.fillRect(nx0, ny0, nx1 - nx0, ny1 - ny0);
    g.fillStyle = lg(g, 0, ny0, 0, ny0 + 20, [[0, 'rgba(40,50,40,0.45)'], [1, 'rgba(40,50,40,0)']]);
    g.fillRect(nx0, ny0, nx1 - nx0, 20);
    g.fillStyle = '#C9D6CB';
    g.fillRect(nx0, ny1 - 6, nx1 - nx0, 6);
    // flacons + pothos
    g.fillStyle = lg(g, nx0 + 14, 0, nx0 + 40, 0, [[0, '#C98F6E'], [1, '#8C5A40']]);
    g.fill(rrPath(nx0 + 14, ny1 - 62, 26, 56, 6));
    g.fillStyle = '#2A2826';
    g.fillRect(nx0 + 22, ny1 - 72, 10, 10);
    g.fillStyle = lg(g, nx0 + 46, 0, nx0 + 70, 0, [[0, '#F2EEE6'], [1, '#C8C1B4']]);
    g.fill(rrPath(nx0 + 46, ny1 - 48, 24, 42, 5));
    g.drawImage(pothosSprite(31, { w: 120, h: 200, top: 10, vines: 5, variegated: true }), nx0 + 50, ny1 - 40, 90, 150);
    drawPot(g, nx0 + 95, ny1 - 6, 34, 28, { color: '#EDE7DD', taper: 0.8 });
    // robinetterie laiton
    const cx = 800;
    g.strokeStyle = GILT(g, cx - 10, 0, cx + 10, 0);
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, 520);
    g.lineTo(cx, 175);
    g.stroke();
    g.fillStyle = GILT(g, cx - 60, 0, cx + 60, 0);
    g.fill(rrPath(cx - 58, 160, 116, 16, 8));
    g.fillStyle = 'rgba(40,30,20,0.35)';
    g.fillRect(cx - 50, 176, 100, 3);
    g.beginPath();
    g.arc(cx, 540, 22, 0, TAU);
    g.fillStyle = GILT(g, cx - 22, 0, cx + 22, 0);
    g.fill();
    g.fillRect(cx - 34, 536, 68, 8);
    g.fill(rrPath(cx - 8, 590, 16, 36, 6));
    g.restore();
    drawFloor(g, tileFloorTex('marbre-damier', { size: 110, colors: ['#F1EEE8', '#9FB0A4'], joint: '#D9D4CA', veins: true }), {
      light: { x0: 1250, x1: 1480, a: 0.4 }, gloss: 0.3,
    });
    // joues de l'alcôve (carrelage projeté)
    drawSideFace(g, tiles, 1, a0, 0, zf, 40, FL, 'rgba(40,55,45,0.18)');
    drawSideFace(g, tiles, 1, a1, 0, zf, 40, FL, 'rgba(40,55,45,0.28)');
    // faces avant des cloisons + retombée
    atDepth(g, zf, () => {
      g.fillStyle = lg(g, 0, 0, 0, FL, [[0, '#EFEAE1'], [1, '#E2DBCF']]);
      g.fillRect(a0 - 40, -200, 40, FL + 200);
      g.fillRect(a1, -200, 40, FL + 200);
      g.fillRect(a0 - 40, -200, a1 - a0 + 80, soffit + 200);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(a0 - 40, -200, 2, FL + 200);
      g.fillRect(a1 + 38, -200, 2, FL + 200);
      g.fillStyle = 'rgba(60,45,35,0.18)';
      g.fillRect(a0 - 3, soffit, 3, FL - soffit);
      g.fillRect(a1, soffit, 3, FL - soffit);
      g.fillRect(a0, soffit, a1 - a0, 3);
    });
    // intérieur de la baignoire (rebord arrière et paroi)
    const P = (x, y, z) => [pX(x, z), pY(y, z)];
    const inner = polyPath([P(a0 + 14, rim, 14), P(a1 - 14, rim, 14), P(a1 - 14, rim, zf - 26), P(a0 + 14, rim, zf - 26)]);
    g.fillStyle = '#F7F5F0';
    g.fill(polyPath([P(a0, rim, 0), P(a1, rim, 0), P(a1, rim, zf), P(a0, rim, zf)]));
    g.fillStyle = lg(g, 0, pY(rim, 14), 0, pY(rim, zf - 26), [[0, '#DCD9D2'], [0.5, '#EAE8E3'], [1, '#C9C5BD']]);
    g.fill(inner);
    g.fillStyle = 'rgba(190,215,225,0.35)';
    g.fill(inner);
    // vasque sur meuble suspendu
    floorShadow(g, 110, 390, 0, 130, 0.18, 30);
    prism(g, {
      x: 100, y: 560, w: 300, h: 110, r: 4, z0: 0, z1: 130,
      side: '#6E4B33', top: '#8C6446',
      front: (p) => {
        g.fillStyle = lg(g, 100, 0, 400, 0, [[0, '#9A7050'], [1, '#6E4B33']]);
        g.fill(p);
        g.save();
        g.clip(p);
        g.globalCompositeOperation = 'overlay';
        g.globalAlpha = 0.22;
        g.fillStyle = grainPattern(g, 100, 560, 90, 1.3, 3.2);
        g.fillRect(100, 560, 300, 110);
        g.restore();
        g.fillStyle = lg(g, 0, 556, 0, 572, [[0, '#F3EFE8'], [1, '#D8D1C5']]);
        g.fillRect(96, 556, 308, 14);
        g.strokeStyle = 'rgba(40,25,15,0.4)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(250, 566);
        g.lineTo(250, 664);
        g.stroke();
        g.fillStyle = GILT(g, 230, 0, 270, 0);
        g.fillRect(232, 600, 12, 3);
        g.fillRect(256, 600, 12, 3);
      },
    });
    // robinet mural en laiton
    atDepth(g, 4, () => {
      g.fillStyle = GILT(g, 238, 0, 262, 0);
      g.beginPath();
      g.arc(250, 452, 10, 0, TAU);
      g.fill();
      g.fill(rrPath(245, 452, 10, 34, 5));
      for (const hx of [212, 288]) {
        g.beginPath();
        g.arc(hx, 456, 7, 0, TAU);
        g.fill();
      }
    });
    // vasque à poser (bol en céramique)
    atDepth(g, 70, () => {
      const vx = 250;
      const rimY = 508;
      const body = new Path2D();
      body.moveTo(vx - 84, rimY);
      body.bezierCurveTo(vx - 82, rimY + 34, vx - 52, rimY + 52, vx - 36, rimY + 52);
      body.lineTo(vx + 36, rimY + 52);
      body.bezierCurveTo(vx + 52, rimY + 52, vx + 82, rimY + 34, vx + 84, rimY);
      body.closePath();
      blurShape(g, body, 'rgba(40,28,20,0.3)', 8, 6, 4);
      g.fillStyle = lg(g, vx - 84, 0, vx + 84, 0, [[0, '#F4F2EE'], [0.35, '#FFFFFF'], [1, '#C7C1B6']]);
      g.fill(body);
      g.fillStyle = '#FBFAF7';
      g.beginPath();
      g.ellipse(vx, rimY, 84, 13, 0, 0, TAU);
      g.fill();
      g.fillStyle = lg(g, 0, rimY - 10, 0, rimY + 10, [[0, '#CFCBC3'], [1, '#EFEDE8']]);
      g.beginPath();
      g.ellipse(vx, rimY + 1, 76, 10, 0, 0, TAU);
      g.fill();
    });
    backFinish(g, { cx: 900 });
  });

  return foreground(ctx, api, spec, (ctx) => {

  // Tablier de la baignoire + rebord avant (devant le rideau)
  layer(ctx, 'salle-de-bain/tub', [400, 600, 800, 400], (g) => {
    const P = (x, y, z) => [pX(x, z), pY(y, z)];
    const deck = polyPath([P(a0, rim, zf - 26), P(a1, rim, zf - 26), P(a1, rim, zf), P(a0, rim, zf)]);
    g.fillStyle = lg(g, 0, pY(rim, zf - 26), 0, pY(rim, zf), [[0, '#FFFFFF'], [1, '#ECE9E3']]);
    g.fill(deck);
    atDepth(g, zf, () => {
      const apron = rrPath(a0, rim, a1 - a0, FL - rim, 0);
      g.save();
      g.clip(apron);
      const pat = g.createPattern(tiles, 'repeat');
      pat.setTransform?.(new DOMMatrix().translate(a0, 0));
      g.fillStyle = pat;
      g.fillRect(a0, rim, a1 - a0, FL - rim);
      g.fillStyle = lg(g, 0, rim, 0, FL, [[0, 'rgba(255,255,255,0.1)'], [1, 'rgba(40,55,45,0.2)']]);
      g.fillRect(a0, rim, a1 - a0, FL - rim);
      g.restore();
      g.fillStyle = lg(g, 0, rim, 0, rim + 12, [[0, '#FFFFFF'], [1, '#DDD8CF']]);
      g.fill(rrPath(a0 - 2, rim - 2, a1 - a0 + 4, 12, 3));
    });
    // tapis de bain
    const mat = polyPath([P(620, FL, zf + 20), P(980, FL, zf + 20), P(980, FL, zf + 150), P(620, FL, zf + 150)]);
    blurShape(g, mat, 'rgba(40,28,20,0.25)', 4, 0, 2);
    g.fillStyle = '#E9E3D7';
    g.fill(mat);
    texturize(g, mat, noiseTile('wool', 128, 16, 3, 0.6, 21, 50), 0.6);
  });

  // Échelle porte-serviette + serviette (textile)
  const lx = 1300;
  const lz = 40;
  layer(ctx, 'salle-de-bain/ladder', [1200, 200, 300, 700], (g) => {
    atDepth(g, lz, () => {
      softEllipse(g, lx, FL, 70, 8, SHADOW, 0.35);
      const wood = '#B99570';
      for (const dx of [-50, 50]) {
        g.fillStyle = lg(g, lx + dx - 7, 0, lx + dx + 7, 0, [[0, lt(wood, 0.2)], [1, dk(wood, 0.2)]]);
        g.fill(polyPath([[lx + dx - 7, FL], [lx + dx + 7, FL], [lx + dx * 0.9 + 6, 300], [lx + dx * 0.9 - 6, 300]]));
      }
      for (let y = 360; y < FL; y += 100) {
        const k = (FL - y) / (FL - 300);
        g.fillStyle = lg(g, 0, y - 5, 0, y + 5, [[0, lt(wood, 0.25)], [1, dk(wood, 0.2)]]);
        g.fillRect(lx - 50 + 5 * k, y - 5, 100 - 10 * k, 10);
      }
    });
  });
  atDepth(ctx, lz + 8, () => {
    const y = 460;
    const p = new Path2D();
    p.moveTo(lx - 56, y - 4);
    p.quadraticCurveTo(lx, y - 14, lx + 56, y - 4);
    p.lineTo(lx + 54, y + 190);
    p.lineTo(lx + 20, y + 196);
    p.lineTo(lx - 10, y + 150);
    p.lineTo(lx - 54, y + 156);
    p.closePath();
    blurShape(ctx, p, 'rgba(40,28,20,0.3)', 10, 5, 8);
    textile(ctx, api, 'towel', p, { kind: 'throw', bounds: { x: lx - 56, y: y - 14, w: 112, h: 210 }, fallbackColor: '#E9E4DA', scale: 70, foldAngle: 90 });
  });
  // Monstera en pot
  layer(ctx, 'salle-de-bain/plant', [1120, 60, 480, 900], (g) => {
    atDepth(g, 160, () => {
      softEllipse(g, 1480, FL, 80, 13, SHADOW, 0.45);
      g.drawImage(monsteraSprite(4), 1480 - 210, FL - 120 - 500, 420, 517);
      drawPot(g, 1480, FL, 130, 130, { color: '#D9CFC0', texture: true, taper: 0.85 });
    });
  });

  finish(ctx, { cx: 900 });
  });
}

/* ================================================================== */
/* Registre                                                            */
/* ================================================================== */

export const DECORS = [
  {
    id: 'salon-moderne',
    label: 'Salon moderne',
    room: 'salon',
    style: 'Moderne',
    description: 'Un salon lumineux aux murs grège, canapé bas en bouclette et grande baie ouverte sur le jardin.',
    textiles: ['cushions', 'throw'],
    thumbColors: ['#D9CCB9', '#ECE5DA', '#B5654A'],
  },
  {
    id: 'chambre-cosy',
    label: 'Chambre cosy',
    room: 'chambre',
    style: 'Cosy',
    description: 'Une chambre enveloppante aux tons chauds, tête de lit capitonnée et lumière douce de chevet.',
    textiles: ['cushions', 'bedspread'],
    thumbColors: ['#D8B9A4', '#B58458', '#F3EFE7'],
  },
  {
    id: 'salle-a-manger-classique',
    label: 'Salle à manger classique',
    room: 'salle-a-manger',
    style: 'Classique',
    description: 'Lambris, lustre à pampilles et table dressée : une salle à manger élégante et intemporelle.',
    textiles: ['tablecloth'],
    thumbColors: ['#C3CAB9', '#ECE8DE', '#C9A227'],
  },
  {
    id: 'scandinave',
    label: 'Salon scandinave',
    room: 'salon',
    style: 'Scandinave',
    description: 'Blanc cassé, chêne clair et lignes simples : la douceur nordique baignée de lumière.',
    textiles: ['cushions', 'throw'],
    thumbColors: ['#EEEAE3', '#D2B48C', '#CEC9C0'],
  },
  {
    id: 'boheme',
    label: 'Salon bohème',
    room: 'salon',
    style: 'Bohème',
    description: 'Fauteuil paon en rotin, macramé, kilim et plantes luxuriantes pour une ambiance nomade.',
    textiles: ['cushions'],
    thumbColors: ['#E7D7C0', '#C98264', '#4E7446'],
  },
  {
    id: 'classique-francais',
    label: 'Classique français',
    room: 'salon',
    style: 'Classique français',
    description: 'Haute porte-fenêtre, boiseries moulurées et parquet point de Hongrie : l’élégance à la française.',
    textiles: ['cushions'],
    thumbColors: ['#EAE5DB', '#C09062', '#C9A227'],
  },
  {
    id: 'minimaliste',
    label: 'Moderne minimaliste',
    room: 'salon',
    style: 'Minimaliste',
    description: 'Béton ciré, lignes épurées et une lampe sculpturale : le calme absolu.',
    textiles: ['cushions'],
    thumbColors: ['#DAD6D0', '#BDB8B0', '#26241F'],
  },
  {
    id: 'marocain',
    label: 'Salon marocain',
    room: 'salon',
    style: 'Marocain',
    description: 'Arc outrepassé, zellige, lanternes ciselées et sedari généreux pour un riad chaleureux.',
    textiles: ['cushions'],
    thumbColors: ['#D7B28B', '#1F5E55', '#C9A04E'],
  },
  {
    id: 'afrique-contemporaine',
    label: 'Afrique contemporaine',
    room: 'salon',
    style: 'Afrique contemporaine',
    description: 'Mur ocre, chapeaux Juju du Cameroun, tabouret bamiléké et vanneries tressées.',
    textiles: ['cushions'],
    thumbColors: ['#D0A06C', '#2A2522', '#B4492F'],
  },
  {
    id: 'salle-de-bain',
    label: 'Salle de bain',
    room: 'salle-de-bain',
    style: 'Spa naturel',
    description: 'Alcôve en zellige vert sauge, robinetterie laiton et baignoire habillée d’un rideau de douche.',
    textiles: ['towel'],
    thumbColors: ['#ECE6DC', '#8FAE9B', '#C9A227'],
  },
];

const RENDERERS = {
  'salon-moderne': drawSalonModerne,
  'chambre-cosy': drawChambreCosy,
  'salle-a-manger-classique': drawSalleAManger,
  scandinave: drawScandinave,
  boheme: drawBoheme,
  'classique-francais': drawClassiqueFrancais,
  minimaliste: drawMinimaliste,
  marocain: drawMarocain,
  'afrique-contemporaine': drawAfrique,
  'salle-de-bain': drawSalleDeBain,
};

const SPECS = {
  'salon-moderne': SPEC_SALON_MODERNE,
  'chambre-cosy': SPEC_CHAMBRE_COSY,
  'salle-a-manger-classique': SPEC_SALLE_A_MANGER,
  scandinave: SPEC_SCANDINAVE,
  boheme: SPEC_BOHEME,
  'classique-francais': SPEC_CLASSIQUE_FRANCAIS,
  minimaliste: SPEC_MINIMALISTE,
  marocain: SPEC_MAROCAIN,
  'afrique-contemporaine': SPEC_AFRIQUE,
  'salle-de-bain': SPEC_SALLE_DE_BAIN,
};

/** Spécification des rideaux d'un décor (copie), sans dessiner. */
export function getDecorSpec(id) {
  const s = SPECS[id] || SPECS[DECORS[0].id];
  return { ...s, window: { ...s.window } };
}

/**
 * Préchauffe les caches d'un décor (textures, sprites, calques) à l'échelle d'affichage prévue,
 * par exemple dans requestIdleCallback : le premier vrai rendu devient alors un simple rendu « chaud ».
 * scale = largeur réelle du canevas (px appareil) / 1600.
 */
export function preloadDecor(id, scale = 0.5) {
  const c = makeCanvas(Math.ceil(W * scale), Math.ceil(H * scale));
  const g = ctx2d(c);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  drawDecor(g, id, {});
}

/**
 * Dessine le décor `id` dans ctx (espace logique 1600×1000).
 * api.drawCurtains(ctx, spec) et api.paintTextile(ctx, slot, path2D, opts) sont facultatifs.
 * Renvoie le spec transmis à drawCurtains.
 */
export function drawDecor(ctx, id, api = {}) {
  const safe = {
    __host: api && typeof api === 'object' ? api : null,
    __id: id,
    drawCurtains: typeof api?.drawCurtains === 'function' ? api.drawCurtains.bind(api) : () => {},
    paintTextile:
      typeof api?.paintTextile === 'function'
        ? api.paintTextile.bind(api)
        : (c, slot, path, opts) => basePaintTextile(c, path, { ...opts, texture: null }),
  };
  const render = RENDERERS[id] || RENDERERS[DECORS[0].id];
  const m0 = ctx.getTransform();
  RS = Math.max(0.05, Math.hypot(m0.a, m0.b));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  let spec;
  try {
    spec = render(ctx, safe);
  } finally {
    ctx.restore();
  }
  return spec ? { ...spec, window: { ...spec.window } } : getDecorSpec(id);
}
