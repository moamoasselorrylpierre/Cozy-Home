// Outils couleur : conversions, contraste WCAG, extraction des couleurs dominantes, nommage.

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs hexadécimales. */
export function contrast(a, b) {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

/** Assombrit (ou éclaircit) une couleur jusqu'à atteindre le contraste voulu avec un fond. */
export function ensureContrast(hex, background, ratio = 4.5) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  const bgLum = luminance(hexToRgb(background));
  const darken = bgLum > 0.4;
  let out = hex;
  for (let i = 0; i < 60 && contrast(out, background) < ratio; i++) {
    l = darken ? l - 0.015 : l + 0.015;
    if (l <= 0 || l >= 1) break;
    out = rgbToHex(hslToRgb([h, s, l]));
  }
  return out;
}

/** Limite la saturation (évite les teintes criardes). */
export function tame(hex, maxSat = 0.5, minLight = 0.12, maxLight = 0.9) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, Math.min(s, maxSat), Math.min(maxLight, Math.max(minLight, l))]));
}

/**
 * Couleurs dominantes d'une image (k-moyennes sur un échantillon de pixels).
 * @returns {{hex:string, weight:number}[]} triées par poids décroissant.
 */
export function dominantColors(source, k = 5) {
  const size = 72;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return kMeans(pixels, k);
}

export function kMeans(pixels, k = 5, iterations = 12) {
  if (!pixels.length) return [];
  // Initialisation k-means++ déterministe (pas d'aléatoire pour des résultats stables).
  const centers = [pixels[Math.floor(pixels.length / 2)].slice()];
  while (centers.length < k) {
    let best = null;
    let bestD = -1;
    for (let i = 0; i < pixels.length; i += 7) {
      const p = pixels[i];
      let d = Infinity;
      for (const c of centers) d = Math.min(d, dist2(p, c));
      if (d > bestD) { bestD = d; best = p; }
    }
    if (!best || bestD < 30) break;
    centers.push(best.slice());
  }
  const assign = new Array(pixels.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    pixels.forEach((p, i) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, ci) => {
        const d = dist2(p, c);
        if (d < bd) { bd = d; bi = ci; }
      });
      assign[i] = bi;
      const s = sums[bi];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    sums.forEach((s, ci) => { if (s[3]) centers[ci] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const counts = centers.map(() => 0);
  assign.forEach((c) => counts[c]++);
  const result = centers
    .map((c, i) => ({ hex: rgbToHex(c), weight: counts[i] / pixels.length }))
    .filter((c) => c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight);
  // Fusion des teintes quasi identiques.
  const merged = [];
  for (const c of result) {
    const twin = merged.find((m) => dist2(hexToRgb(m.hex), hexToRgb(c.hex)) < 400);
    if (twin) twin.weight += c.weight;
    else merged.push({ ...c });
  }
  return merged.map((c) => ({ ...c, weight: Math.round(c.weight * 1000) / 1000 }));
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Famille de couleur (pour les filtres du catalogue). */
export function colorFamily(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l > 0.86 && s < 0.5) return 'blanc';
  if (l < 0.16) return 'noir';
  if (s < 0.12) return l > 0.7 ? 'blanc' : l < 0.3 ? 'noir' : 'gris';
  if ((h >= 20 && h < 55) && s < 0.45 && l > 0.55) return 'beige';
  if (h < 12 || h >= 345) return l > 0.7 ? 'rose' : 'rouge';
  if (h < 32) return l < 0.3 ? 'marron' : l > 0.72 ? 'rose' : 'terracotta';
  if (h < 45) return l < 0.35 ? 'marron' : s < 0.4 && l > 0.5 ? 'beige' : 'jaune';
  if (h < 68) return l < 0.3 ? 'marron' : 'jaune';
  if (h < 170) return 'vert';
  if (h < 255) return 'bleu';
  if (h < 300) return 'violet';
  return l > 0.65 ? 'rose' : 'violet';
}

const NAMED = [
  ['Ivoire', '#F4EEE3'], ['Blanc cassé', '#EDEAE2'], ['Écru', '#EAE0CC'], ['Lin', '#E4D6BE'], ['Sable', '#D6C3A1'],
  ['Grège', '#C8BBA6'], ['Taupe', '#8E7F6F'], ['Taupe foncé', '#6E6254'], ['Doré antique', '#B59559'], ['Or pâle', '#CDB27A'], ['Gris perle', '#C9C7C2'], ['Gris ardoise', '#5E6268'], ['Anthracite', '#2F2E2C'],
  ['Noir', '#151515'], ['Chocolat', '#4A3226'], ['Brun', '#6B4A35'], ['Caramel', '#B07A45'], ['Terracotta', '#B5654A'],
  ['Rouille', '#A24E2C'], ['Brique', '#9A4A3A'], ['Ocre', '#C99034'], ['Or', '#C9A227'], ['Champagne', '#D8C398'],
  ['Moutarde', '#C8A23A'], ['Vert sauge', '#9CAF94'], ['Vert olive', '#6B6B3A'], ['Vert sapin', '#2F4A3E'], ['Vert émeraude', '#1F6B52'],
  ['Vert d’eau', '#B7D3C6'], ['Bleu canard', '#1F5560'], ['Bleu majorelle', '#2B4EA2'], ['Bleu nuit', '#1E2A44'], ['Bleu ciel', '#A9C6DC'],
  ['Indigo', '#35457A'], ['Rose poudré', '#E8C9C0'], ['Vieux rose', '#C48E8A'], ['Corail', '#E07A5F'], ['Bordeaux', '#6E2230'],
  ['Rouge', '#B23A3A'], ['Prune', '#5E3A5A'], ['Lavande', '#B7A7C9'],
];

/** Nom français approché d'une couleur. */
export function nameColor(hex) {
  const rgb = hexToRgb(hex);
  let best = NAMED[0][0];
  let bd = Infinity;
  for (const [name, h] of NAMED) {
    const c = hexToRgb(h);
    // Distance pondérée (perception : le vert compte davantage).
    const d = 2 * (rgb[0] - c[0]) ** 2 + 4 * (rgb[1] - c[1]) ** 2 + 3 * (rgb[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}
