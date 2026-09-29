// Module « génération automatique de mock-up » (6.2) : photo d'échantillon → tuile raccordable →
// analyse → trois rendus de présentation (fermé, mi-ouvert, avec embrasses) dans le présentoir.
// Façade indépendante : l'espace admin n'appelle que ce module ; le moteur peut être remplacé.
import { cropToTile, makeSeamless, analyzeFabric, compress } from './fabric-analysis.js';
import { renderPresentoir, PRESENTOIR_STATES } from './curtain-render.js';

export { PRESENTOIR_STATES };
export const MOCKUP_SIZE = { width: 900, height: 1125 };

/** Prépare la tuile de tissu (recadrage + raccord) et l'analyse. */
export function prepareFabric(image, crop, wrapMode = 'auto') {
  const raw = cropToTile(image, crop, 512);
  const analysis = analyzeFabric(raw);
  const mode = wrapMode === 'auto' ? (analysis.recommendedWrap === 'repeat' ? 'repeat' : 'blend') : wrapMode;
  const tile = mode === 'blend' ? makeSeamless(raw) : raw;
  return { tile, analysis, wrap: mode === 'mirror' ? 'mirror' : 'repeat', mode };
}

/** Génère les trois mises en scène (canvas) pour une tuile et des paramètres de rendu. */
export async function generateMockups(tile, render, { width = MOCKUP_SIZE.width } = {}) {
  try { await document.fonts?.load('italic 500 26px "Cormorant Garamond"'); } catch { /* police facultative */ }
  return PRESENTOIR_STATES.map(({ key, label }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * 1.25);
    renderPresentoir(canvas, { texture: tile, ...render }, key);
    return { key, label, canvas };
  });
}

/** Encode les rendus pour le téléversement. */
export function encodeMockups(mockups, quality = 0.84) {
  return Object.fromEntries(mockups.map((m) => [m.key, compress(m.canvas, { maxSide: 1200, quality })]));
}
