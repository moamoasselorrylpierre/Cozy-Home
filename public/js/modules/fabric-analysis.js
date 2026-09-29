// Module « analyse de tissu » (6.2, étape 1) : à partir d'une simple photo d'échantillon,
// prépare une tuile carrée raccordable et en extrait couleurs dominantes, luminosité,
// type de motif (uni, texturé, rayé, motif) et le mode de raccord conseillé.
import { kMeans, nameColor, colorFamily, luminance } from './color.js';

/** Lit un fichier image en tenant compte de l'orientation EXIF (photos de téléphone). */
export async function readImageFile(file) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|avif)$/i.test(file.name || '')) {
    throw new Error('Format non reconnu : utilisez une photo JPEG, PNG ou WebP.');
  }
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export const sizeOf = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

/** Recadrage carré par défaut : zone centrale (évite les bords flous / la table). */
export function defaultCrop(src) {
  const { w, h } = sizeOf(src);
  const size = Math.round(Math.min(w, h) * 0.82);
  return { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), size };
}

/**
 * Cadrage automatique : repère l'échantillon posé sur un fond (table, mur) en comparant
 * chaque pixel à la couleur moyenne des bords, puis garde un carré bien à l'intérieur du tissu.
 * Si le tissu remplit déjà la photo, on garde le cadrage central.
 */
export function autoCrop(src) {
  const { w, h } = sizeOf(src);
  const S = 160;
  const k = S / Math.max(w, h);
  const cw = Math.max(8, Math.round(w * k));
  const ch = Math.max(8, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, cw, ch);
  const d = ctx.getImageData(0, 0, cw, ch).data;
  const px = (x, y) => { const i = (y * cw + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  // Couleur et dispersion du fond, mesurées sur une bande de bord.
  const border = [];
  const band = Math.max(2, Math.round(Math.min(cw, ch) * 0.04));
  for (let x = 0; x < cw; x++) for (let y = 0; y < band; y++) { border.push(px(x, y), px(x, ch - 1 - y)); }
  for (let y = 0; y < ch; y++) for (let x = 0; x < band; x++) { border.push(px(x, y), px(cw - 1 - x, y)); }
  const mean = [0, 1, 2].map((i) => border.reduce((a, p) => a + p[i], 0) / border.length);
  const spread = Math.sqrt(border.reduce((a, p) => a + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2, 0) / border.length);
  const threshold = Math.max(28, spread * 2.2);
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = px(x, y);
      if (Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]) > threshold) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const area = cw * ch;
  // Fond uniforme non détecté, ou tissu qui remplit la photo : cadrage central.
  if (count < area * 0.08 || spread > 40 || (x1 - x0) * (y1 - y0) > area * 0.9) return defaultCrop(src);
  const bw = (x1 - x0) / k;
  const bh = (y1 - y0) / k;
  const size = Math.round(Math.min(bw, bh) * 0.7); // marge : bords crantés, rotation, ombre
  const cx = (x0 + x1) / 2 / k;
  const cy = (y0 + y1) / 2 / k;
  return {
    size,
    x: Math.round(Math.min(w - size, Math.max(0, cx - size / 2))),
    y: Math.round(Math.min(h - size, Math.max(0, cy - size / 2))),
  };
}

/** Découpe une zone carrée de la photo en tuile de outSize px. */
export function cropToTile(src, crop, outSize = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = outSize;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, crop.x, crop.y, crop.size, crop.size, 0, 0, outSize, outSize);
  return c;
}

/**
 * Rend une tuile raccordable : mélange avec une copie décalée d'une demi-tuile,
 * avec un masque progressif qui masque les bords (technique de « l'offset fondu »).
 */
export function makeSeamless(tile) {
  const n = tile.width;
  const src = tile.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, n, n);
  const out = new ImageData(n, n);
  const half = n / 2;
  const d = src.data;
  const o = out.data;
  for (let y = 0; y < n; y++) {
    const wy = 1 - Math.abs(y - half + 0.5) / half; // 1 au centre, 0 au bord
    for (let x = 0; x < n; x++) {
      const wx = 1 - Math.abs(x - half + 0.5) / half;
      let w = Math.min(wx, wy);
      w = Math.min(1, Math.max(0, (w - 0.02) / 0.35));
      w = w * w * (3 - 2 * w);
      const i = (y * n + x) * 4;
      const j = (((y + half) % n) * n + ((x + half) % n)) * 4;
      for (let k = 0; k < 3; k++) o[i + k] = d[i + k] * w + d[j + k] * (1 - w);
      o[i + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

/** Analyse la tuile : couleurs, luminosité, contraste, motif, raccord. */
export function analyzeFabric(tile) {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(tile, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);

  const pixels = [];
  const lum = new Float32Array(S * S);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    pixels.push(rgb);
    lum[p] = luminance(rgb);
    sum += lum[p];
  }
  const mean = sum / lum.length;
  let variance = 0;
  for (const l of lum) variance += (l - mean) ** 2;
  const std = Math.sqrt(variance / lum.length);

  // Profils moyens par colonne / ligne → détection des rayures.
  const colMean = new Float32Array(S);
  const rowMean = new Float32Array(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      colMean[x] += lum[y * S + x] / S;
      rowMean[y] += lum[y * S + x] / S;
    }
  }
  const spread = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };
  const colSpread = spread(colMean);
  const rowSpread = spread(rowMean);

  let pattern = 'motif';
  let stripes = null;
  if (std < 0.035) pattern = 'uni';
  else if (colSpread > std * 0.72 && rowSpread < std * 0.35) { pattern = 'raye'; stripes = 'vertical'; }
  else if (rowSpread > std * 0.72 && colSpread < std * 0.35) { pattern = 'raye'; stripes = 'horizontal'; }
  else if (std < 0.07) pattern = 'texture';

  // Discontinuité aux bords (raccord) : compare bord gauche/droit et haut/bas.
  let seam = 0;
  for (let k = 0; k < S; k++) {
    seam += Math.abs(lum[k * S] - lum[k * S + S - 1]) + Math.abs(lum[k] - lum[(S - 1) * S + k]);
  }
  seam /= 2 * S;

  const colors = kMeans(pixels, 5)
    .slice(0, 5)
    .map((col) => ({ hex: col.hex, weight: col.weight, name: nameColor(col.hex) }));
  const families = [];
  for (const col of colors) {
    if (col.weight < 0.08) continue;
    const f = colorFamily(col.hex);
    if (!families.includes(f)) families.push(f);
    if (families.length >= 3) break;
  }

  return {
    colors,
    colorFamilies: families,
    brightness: Math.round(mean * 1000) / 1000,
    contrast: Math.round(Math.min(1, std * 4) * 1000) / 1000,
    pattern,
    stripes,
    seam: Math.round(seam * 1000) / 1000,
    recommendedWrap: seam < 0.05 ? 'repeat' : 'mirror',
  };
}

/**
 * Profils de compression : taille maximale (côté le plus long) et poids visé pour chaque usage.
 * Toutes les images passent par ici avant d'être envoyées : le site reste léger et rapide.
 */
export const IMAGE_PROFILES = {
  photo: { maxSide: 1400, maxBytes: 170 * 1024, label: 'photo d’échantillon' },
  swatch: { maxSide: 512, maxBytes: 90 * 1024, minQuality: 0.72, label: 'tissu (texture)' },
  mockup: { maxSide: 1125, maxBytes: 130 * 1024, label: 'rendu' },
  mockupSmall: { maxSide: 600, maxBytes: 45 * 1024, label: 'rendu mobile' },
  content: { maxSide: 1800, maxBytes: 230 * 1024, label: 'image du site' },
  portrait: { maxSide: 1200, maxBytes: 160 * 1024, label: 'portrait' },
};

function toCanvas(source, maxSide) {
  const { w, h } = sizeOf(source);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Compresse une image en WebP (repli JPEG) en visant un poids maximal :
 * la qualité baisse par paliers, puis les dimensions si nécessaire.
 * @returns {Promise<{blob: Blob, width: number, height: number, type: string}>}
 */
export async function encodeImage(source, profile = 'content') {
  const p = typeof profile === 'string' ? IMAGE_PROFILES[profile] : profile;
  const minQuality = p.minQuality ?? 0.6;
  let side = p.maxSide;
  let best = null;
  for (let pass = 0; pass < 4; pass++) {
    const canvas = toCanvas(source, side);
    for (let q = p.quality ?? 0.86; q >= minQuality - 0.001; q -= 0.06) {
      let blob = await toBlob(canvas, 'image/webp', q);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q); // navigateurs sans encodeur WebP
      if (!blob) continue;
      best = { blob, width: canvas.width, height: canvas.height, type: blob.type };
      if (blob.size <= p.maxBytes) return best;
    }
    side = Math.round(side * 0.82);
  }
  return best;
}

/** Encode un canvas/une image en data URL compressée (WebP, repli JPEG). */
export function compress(source, { maxSide = 1600, quality = 0.84, type = 'image/webp' } = {}) {
  const c = toCanvas(source, maxSide);
  let url = c.toDataURL(type, quality);
  if (!url.startsWith(`data:${type}`)) url = c.toDataURL('image/jpeg', quality); // navigateurs sans encodeur WebP
  return url;
}

export function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}
