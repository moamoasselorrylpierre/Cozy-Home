// Habillage de fenêtre : place les panneaux, dessine tringle, œillets, anneaux, pattes, embrasses,
// franges et ombres, en s'appuyant sur le moteur de drapé. Fournit aussi le « présentoir » :
// la mise en scène façon atelier utilisée pour générer les mock-ups du catalogue (6.2).
import { DrapeEngine, averageColor } from './drape-engine.js';

const FULLNESS = { eyelet: 2.0, pinch: 2.2, rod: 2.4, tab: 1.9, rings: 1.55 };
const FOLD_CM = { eyelet: 46, pinch: 44, rod: 30, tab: 42, rings: 40 };
const TOP_OFFSET = { eyelet: -9, pinch: 13, rod: -11, tab: 7, rings: 13 };

const METALS = {
  brass: ['#6E5320', '#B8923E', '#F1DB92', '#C9A64F', '#7A5C22'],
  black: ['#0E0E0E', '#2A2A2A', '#6B6B6B', '#2F2F2F', '#111111'],
  wood: ['#4A2E1A', '#7A5132', '#B48A5E', '#86593A', '#4E311D'],
  white: ['#B9B3A8', '#E4DFD6', '#FFFFFF', '#E9E4DB', '#BDB7AC'],
};

const lerp = (a, b, t) => a + (b - a) * t;

function metalGradient(ctx, finish, y0, y1) {
  const c = METALS[finish] || METALS.brass;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c[0]);
  g.addColorStop(0.28, c[1]);
  g.addColorStop(0.45, c[2]);
  g.addColorStop(0.7, c[3]);
  g.addColorStop(1, c[4]);
  return g;
}

/** Ombre douce compatible tous navigateurs (astuce de l'ombre décalée). */
export function softShadow(ctx, drawPath, { blur = 18, color = 'rgba(40,30,20,0.25)', dx = 8, dy = 10 } = {}) {
  ctx.save();
  const off = 10000;
  const m = ctx.getTransform();
  const sx = Math.hypot(m.a, m.b) || 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * sx;
  ctx.shadowOffsetX = (dx + off) * sx;
  ctx.shadowOffsetY = dy * sx;
  ctx.translate(-off, 0);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  drawPath(ctx);
  ctx.fill();
  ctx.restore();
}

function drawRod(ctx, x0, x1, y, finish, d = 9, finials = true, brackets = finials) {
  ctx.save();
  // Supports muraux.
  ctx.fillStyle = metalGradient(ctx, finish, y - 16, y + 4);
  for (const bx of brackets ? [x0 + 34, x1 - 34] : []) {
    ctx.fillRect(bx - 3, y - 18, 6, 18);
    ctx.beginPath();
    ctx.ellipse(bx, y - 20, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = metalGradient(ctx, finish, y - d / 2, y + d / 2);
  ctx.beginPath();
  ctx.roundRect(x0, y - d / 2, x1 - x0, d, d / 2);
  ctx.fill();
  if (finials) {
    const ends = finials === 'left' ? [[x0, -1]] : finials === 'right' ? [[x1, 1]] : [[x0, -1], [x1, 1]];
    for (const [fx, dir] of ends) {
      const g = ctx.createRadialGradient(fx + dir * 12 - 4, y - 5, 1, fx + dir * 12, y, 12);
      const c = METALS[finish] || METALS.brass;
      g.addColorStop(0, c[2]);
      g.addColorStop(0.5, c[3]);
      g.addColorStop(1, c[0]);
      ctx.fillStyle = metalGradient(ctx, finish, y - 7, y + 7);
      ctx.fillRect(fx + (dir < 0 ? -6 : 0), y - 7, 6, 14);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx + dir * 14, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHiddenRail(ctx, x0, x1, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(x0 - 6, y - 7, x1 - x0 + 12, 7);
  ctx.fillStyle = 'rgba(60,50,40,0.18)';
  ctx.fillRect(x0 - 6, y, x1 - x0 + 12, 1.5);
  ctx.restore();
}

function ring(ctx, x, y, rx, ry, finish, width = 3.2) {
  ctx.save();
  ctx.strokeStyle = metalGradient(ctx, finish, y - ry, y + ry);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function rgb(c, k = 1, a = 1) {
  return `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
}

/**
 * Calcule la géométrie des panneaux pour une fenêtre donnée.
 * spec : { mode, window, ceilingY, floorY, sillY, rodMaxX0, rodMaxX1, hardware, pxPerCm }
 * cfg  : { heading, panels, openness, tieback, mount, length, rail, tileCm }
 */
export function layoutCurtains(spec, cfg) {
  const win = spec.window;
  const shower = spec.mode === 'shower';
  const heading = shower ? 'rings' : cfg.heading || 'eyelet';
  const pxPerCm = spec.pxPerCm || win.w / 150;
  let rodY;
  let rodX0;
  let rodX1;
  if (shower) {
    rodY = win.y;
    rodX0 = win.x;
    rodX1 = win.x + win.w;
  } else {
    rodY = cfg.mount === 'plafond' ? spec.ceilingY + 22 : Math.max(spec.ceilingY + 26, win.y - Math.max(28, win.h * 0.07));
    const ext = Math.max(60, win.w * 0.24);
    rodX0 = Math.max(spec.rodMaxX0 ?? win.x - ext, win.x - ext);
    rodX1 = Math.min(spec.rodMaxX1 ?? win.x + win.w + ext, win.x + win.w + ext);
  }
  const hidden = cfg.rail === 'cache' && !shower;
  const top = rodY + (hidden ? -3 : TOP_OFFSET[heading]);
  const bottom = shower ? spec.floorY : cfg.length === 'allege' ? Math.min(spec.floorY, (spec.sillY ?? win.y + win.h) + 14) : spec.floorY + 3;
  const count = shower ? 1 : cfg.panels === 1 ? 1 : 2;
  const inset = hidden ? 2 : 10;
  const span = rodX1 - rodX0 - inset * 2;
  const panelSpan = span / count;
  const fullness = FULLNESS[heading];
  const fabricWidth = panelSpan * fullness;
  const openness = cfg.tieback ? 0.06 : Math.min(1, Math.max(0, cfg.openness ?? 0));
  const width = lerp(panelSpan * 1.0, panelSpan * 0.28, openness);
  const tieback = cfg.tieback && !shower ? { t: cfg.length === 'allege' ? 0.62 : 0.6, reach: 0.3 } : null;
  const panels = [];
  panels.push({ x0: rodX0 + inset, x1: rodX0 + inset + width, side: 'left' });
  if (count === 2) panels.push({ x0: rodX1 - inset - width, x1: rodX1 - inset, side: 'right' });
  panels.forEach((p, i) => Object.assign(p, { top, bottom, fabricWidth, tieback, heading, seed: i * 3 + 1, vOffset: i * 0.37 }));
  return { rodY, rodX0, rodX1, top, bottom, panels, heading, hidden, pxPerCm, foldPx: FOLD_CM[heading] * pxPerCm };
}

/**
 * Dessine l'habillage complet sur un contexte 2D (coordonnées logiques).
 * env : { scale (px réels par unité logique), engine }
 * cfg : { texture, tileCm, finish, opacity, heading, hem, panels, openness, tieback, mount, length, rail,
 *         hardware, time, sway, exposure, wrap, shadow }
 */
export function drawWindowTreatment(ctx, spec, cfg, env = {}) {
  if (!cfg || !cfg.texture) return null;
  const engine = env.engine || DrapeEngine.shared();
  const L = layoutCurtains(spec, cfg);
  const finish = cfg.hardware || spec.hardware || 'brass';
  const tilePx = (cfg.tileCm || 30) * L.pxPerCm;
  const avg = cfg.avgColor || averageColor(cfg.texture);
  const opacity = cfg.opacity ?? 1;

  // Ombre portée des panneaux sur le mur.
  if (cfg.shadow !== false) {
    for (const p of L.panels) {
      softShadow(ctx, (c) => {
        if (p.tieback) {
          const ty = p.top + (p.bottom - p.top) * p.tieback.t;
          const w = p.x1 - p.x0;
          const outer = p.side === 'left' ? p.x0 : p.x1;
          const dir = p.side === 'left' ? 1 : -1;
          c.moveTo(p.x0, p.top);
          c.lineTo(p.x1, p.top);
          c.quadraticCurveTo(outer + dir * w * 0.9, ty - 60, outer + dir * w * 0.3, ty);
          c.lineTo(outer + dir * w * 0.55, p.bottom);
          c.lineTo(outer, p.bottom);
          c.closePath();
        } else c.rect(p.x0, p.top, p.x1 - p.x0, p.bottom - p.top);
      }, { blur: 26, color: `rgba(45,35,25,${0.03 + 0.22 * opacity * opacity})`, dx: 10, dy: 8 });
    }
  }

  // Tringle (derrière le tissu).
  const rodEnds = [L.rodX0 - 8, L.rodX1 + 8];
  if (L.hidden) drawHiddenRail(ctx, L.rodX0, L.rodX1, L.rodY);
  else if (L.heading !== 'rod') drawRod(ctx, rodEnds[0], rodEnds[1], L.rodY, finish, spec.mode === 'shower' ? 7 : 9, spec.mode !== 'shower');

  // Rendu WebGL des panneaux dans une zone englobante, à la résolution réelle.
  const scale = Math.min(env.scale || 1, 2.5);
  const pad = 40;
  const bx = Math.min(...L.panels.map((p) => p.x0)) - pad;
  const bx1 = Math.max(...L.panels.map((p) => p.x1)) + pad;
  const by = L.top - 20;
  const by1 = L.bottom + 30;
  let r = scale;
  if ((bx1 - bx) * r > 2600) r = 2600 / (bx1 - bx);
  const shift = (p) => ({ ...p, x0: (p.x0 - bx) * r, x1: (p.x1 - bx) * r, top: (p.top - by) * r, bottom: (p.bottom - by) * r, fabricWidth: p.fabricWidth * r });
  const result = engine.render({
    width: Math.round((bx1 - bx) * r),
    height: Math.round((by1 - by) * r),
    panels: L.panels.map(shift),
    texture: cfg.texture,
    tilePx: tilePx * r,
    foldPx: L.foldPx * r,
    finish: cfg.finish,
    opacity,
    wrap: cfg.wrap,
    time: cfg.time,
    sway: cfg.sway,
    exposure: cfg.exposure ?? 1,
    ambient: cfg.ambient,
    quality: env.quality || 1,
  });
  ctx.drawImage(result.canvas, 0, 0, result.canvas.width, result.canvas.height, bx, by, bx1 - bx, by1 - by);
  const back = (v) => v / r;
  const meshes = result.meshes.map((m) => ({
    peaks: m.peaks.map((pk) => ({ ...pk, x: back(pk.x) + bx })),
    hem: m.hem.map((h) => ({ x: back(h.x) + bx, y: back(h.y) + by, z: h.z })),
    tieback: m.tiebackPoint ? { x0: back(m.tiebackPoint.x0) + bx, x1: back(m.tiebackPoint.x1) + bx, y: back(m.tiebackPoint.y) + by } : null,
  }));

  // Quincaillerie devant le tissu.
  if (!L.hidden) {
    L.panels.forEach((p, i) => {
      const m = meshes[i];
      if (L.heading === 'eyelet') {
        for (const pk of m.peaks) {
          if (pk.front) ring(ctx, pk.x, L.rodY, 7.5, 7.5, finish, 3.4);
          else drawRod(ctx, pk.x - 9, pk.x + 9, L.rodY, finish, 9, false);
        }
      } else if (L.heading === 'pinch' || L.heading === 'rings') {
        const ringsAt = L.heading === 'rings' ? m.peaks : m.peaks.filter((pk) => pk.front);
        for (const pk of ringsAt) {
          ring(ctx, pk.x, L.rodY + 1, 7, 8, finish, 2.4);
          ctx.save();
          ctx.strokeStyle = metalGradient(ctx, finish, L.rodY, L.top);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(pk.x, L.rodY + 8);
          ctx.lineTo(pk.x, L.top + 4);
          ctx.stroke();
          ctx.restore();
        }
      } else if (L.heading === 'tab') {
        for (const pk of m.peaks.filter((x) => x.front)) {
          ctx.save();
          const tw = Math.min(22, (p.x1 - p.x0) / (m.peaks.length / 2) * 0.5);
          ctx.fillStyle = rgb(avg, 0.92);
          ctx.beginPath();
          ctx.roundRect(pk.x - tw / 2, L.rodY - 10, tw, L.top - L.rodY + 12, [tw / 2, tw / 2, 1, 1]);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(pk.x + tw / 2 - 2, L.rodY - 6, 2, L.top - L.rodY + 8);
          ctx.restore();
        }
      }
    });
    // Embouts visibles de part et d'autre du passe-tringle.
    if (L.heading === 'rod') {
      drawRod(ctx, rodEnds[0], L.panels[0].x0 + 4, L.rodY, finish, 9, 'left', false);
      drawRod(ctx, L.panels[L.panels.length - 1].x1 - 4, rodEnds[1], L.rodY, finish, 9, 'right', false);
    }
  }

  // Franges à l'ourlet.
  if (cfg.hem === 'fringe') {
    meshes.forEach((m) => {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < m.hem.length; i++) {
        const h = m.hem[i];
        const len = 16 + (i % 3) * 3;
        ctx.strokeStyle = rgb(avg, 0.85 + 0.12 * (h.z || 0), 0.95);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y - 1);
        ctx.quadraticCurveTo(h.x + 1.5, h.y + len * 0.5, h.x + 0.5, h.y + len);
        ctx.stroke();
        if (i % 4 === 0) {
          ctx.fillStyle = rgb(avg, 0.8);
          ctx.beginPath();
          ctx.arc(h.x, h.y + 3, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }

  // Embrasses : cordon + gland, crochet mural.
  meshes.forEach((m, i) => {
    if (!m.tieback) return;
    const p = L.panels[i];
    const { x0, x1, y } = m.tieback;
    const outerX = p.side === 'left' ? Math.min(x0, p.x0) - 6 : Math.max(x1, p.x1) + 6;
    const c = METALS[finish] || METALS.brass;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = c[1];
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0 - 4, y - 2);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + 9, x1 + 4, y - 2);
    ctx.stroke();
    ctx.strokeStyle = c[2];
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0 - 4, y - 3);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + 7, x1 + 4, y - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    // Gland.
    const gx = p.side === 'left' ? x1 - 4 : x0 + 4;
    ctx.fillStyle = c[1];
    ctx.beginPath();
    ctx.arc(gx, y + 10, 5, 0, Math.PI * 2);
    ctx.fill();
    const tg = ctx.createLinearGradient(gx - 7, 0, gx + 7, 0);
    tg.addColorStop(0, c[0]);
    tg.addColorStop(0.5, c[2]);
    tg.addColorStop(1, c[0]);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(gx - 3, y + 14);
    ctx.lineTo(gx + 3, y + 14);
    ctx.lineTo(gx + 8, y + 42);
    ctx.quadraticCurveTo(gx, y + 46, gx - 8, y + 42);
    ctx.closePath();
    ctx.fill();
    // Crochet mural.
    ctx.fillStyle = metalGradient(ctx, finish, y - 8, y + 8);
    ctx.beginPath();
    ctx.arc(outerX, y - 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  return { layout: L, meshes };
}

// ---------------------------------------------------------------------------
// Présentoir (mock-up catalogue) : verrière d'atelier, tringle laiton, parquet, lumière du jour.

let plasterCache = null;
function plasterPattern(ctx) {
  if (!plasterCache) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() - 0.5) * 22;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    x.putImageData(img, 0, 0);
    plasterCache = c;
  }
  return ctx.createPattern(plasterCache, 'repeat');
}

export const PRESENTOIR_STATES = [
  { key: 'ferme', label: 'Fermé' },
  { key: 'miOuvert', label: 'Mi-ouvert' },
  { key: 'embrasse', label: 'Avec embrasses' },
];

/**
 * Dessine le présentoir complet dans `canvas` (taille réelle quelconque, ratio 4:5 conseillé).
 * model : { texture, tileCm, finish, opacity, heading, hem, wrap, name }
 */
export function renderPresentoir(canvas, model, state = 'ferme', { engine, time = 0, sway = 0 } = {}) {
  const W = 1200;
  const H = 1500;
  const ctx = canvas.getContext('2d');
  const s = canvas.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const floorY = 1290;

  // Mur enduit, lumière venant de la gauche.
  const wall = ctx.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, '#F8F3EB');
  wall.addColorStop(0.55, '#EFE6D8');
  wall.addColorStop(1, '#E3D7C4');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, floorY);
  ctx.fillStyle = plasterPattern(ctx);
  ctx.fillRect(0, 0, W, floorY);
  const halo = ctx.createRadialGradient(260, 260, 40, 260, 260, 900);
  halo.addColorStop(0, 'rgba(255,250,238,0.55)');
  halo.addColorStop(1, 'rgba(255,250,238,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, floorY);

  // Verrière d'atelier.
  const win = { x: 330, y: 250, w: 540, h: 1010 };
  const glass = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
  glass.addColorStop(0, '#FBFAF6');
  glass.addColorStop(0.55, '#EEF1EE');
  glass.addColorStop(1, '#DCE3DC');
  ctx.fillStyle = glass;
  ctx.fillRect(win.x, win.y, win.w, win.h);
  // Feuillages flous au dehors.
  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 14; i++) {
    const gx = win.x + 40 + ((i * 97) % (win.w - 60));
    const gy = win.y + win.h * 0.45 + ((i * 53) % 380);
    const gg = ctx.createRadialGradient(gx, gy, 5, gx, gy, 90);
    gg.addColorStop(0, i % 2 ? '#8FA88A' : '#A9B99A');
    gg.addColorStop(1, 'rgba(160,180,150,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(gx - 90, gy - 90, 180, 180);
  }
  ctx.restore();
  ctx.strokeStyle = '#2E2E2B';
  ctx.lineWidth = 9;
  ctx.strokeRect(win.x, win.y, win.w, win.h);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(win.x + (win.w / 3) * i, win.y);
    ctx.lineTo(win.x + (win.w / 3) * i, win.y + win.h);
  }
  for (let i = 1; i < 5; i++) {
    ctx.moveTo(win.x, win.y + (win.h / 5) * i);
    ctx.lineTo(win.x + win.w, win.y + (win.h / 5) * i);
  }
  ctx.stroke();

  // Sol : parquet de chêne clair + plinthe.
  const floor = ctx.createLinearGradient(0, floorY, 0, H);
  floor.addColorStop(0, '#CDB392');
  floor.addColorStop(1, '#B89A76');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = 'rgba(90,64,40,0.18)';
  ctx.lineWidth = 1.5;
  for (let y = floorY + 26, k = 0; y < H; y += 26 + k * 4, k++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#F5F0E7';
  ctx.fillRect(0, floorY - 22, W, 22);
  ctx.fillStyle = 'rgba(60,45,30,0.12)';
  ctx.fillRect(0, floorY, W, 3);
  // Tache de soleil au sol.
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const sun = ctx.createLinearGradient(win.x, floorY, win.x + win.w, H);
  sun.addColorStop(0, 'rgba(255,245,215,0.9)');
  sun.addColorStop(1, 'rgba(255,245,215,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.moveTo(win.x + 40, floorY + 4);
  ctx.lineTo(win.x + win.w + 40, floorY + 4);
  ctx.lineTo(win.x + win.w + 260, H);
  ctx.lineTo(win.x + 160, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const spec = {
    mode: 'window',
    window: win,
    ceilingY: 40,
    floorY,
    sillY: win.y + win.h,
    rodMaxX0: 120,
    rodMaxX1: 1080,
    hardware: 'brass',
    pxPerCm: 3.4,
  };
  const cfg = {
    ...model,
    panels: 2,
    openness: state === 'miOuvert' ? 0.55 : 0,
    tieback: state === 'embrasse',
    mount: 'fenetre',
    length: 'sol',
    rail: 'apparent',
    time,
    sway,
  };
  if (model.heading === 'rings') cfg.heading = 'rings';
  const out = drawWindowTreatment(ctx, spec, cfg, { scale: s, engine });

  // Signature discrète.
  ctx.save();
  ctx.fillStyle = 'rgba(70,52,34,0.55)';
  ctx.font = 'italic 500 26px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText('Cozy Home · by Fany', W - 48, H - 42);
  ctx.restore();
  return out;
}
