// Mise en situation (6.3) : compose un décor (scenes.js), l'habillage de fenêtre (curtain-render.js)
// et la lumière (plein jour, tamisée). Le rendu est découpé en calques (arrière-plan / rideaux /
// premier plan) pour pouvoir animer les rideaux sans redessiner tout le décor.
import { DECORS, drawDecor } from './scenes.js';
import { paintTextile } from './textile.js';
import { drawWindowTreatment } from './curtain-render.js';
import { averageColor } from './drape-engine.js';

export { DECORS };
export const SCENE_W = 1600;
export const SCENE_H = 1000;

const layerCanvas = () => document.createElement('canvas');

export class SceneRenderer {
  /** @param {HTMLCanvasElement} canvas canvas d'affichage (sa taille réelle est fixée par l'appelant) */
  constructor(canvas) {
    this.canvas = canvas;
    this.bg = layerCanvas();
    this.fg = layerCanvas();
    this.spec = null;
    this.key = '';
    this.state = null;
  }

  /** Ajuste la taille réelle du canvas à sa taille affichée (× densité d'écran). */
  fit(maxDpr = 2) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(320, Math.round((rect.width || 800) * dpr));
    const h = Math.round(w * SCENE_H / SCENE_W);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.key = '';
    }
    return this;
  }

  /**
   * Reconstruit le décor (si le décor ou les textiles ont changé).
   * Tout ce qui est dessiné avant les rideaux est figé dans une image d'arrière-plan ;
   * les instructions dessinées après (mobilier, étalonnage final…) sont enregistrées puis
   * rejouées à chaque rendu, ce qui préserve exactement les modes de fusion.
   */
  #build(state) {
    const textilesKey = Object.entries(state.textiles || {}).map(([k, t]) => `${k}:${t ? t.__id || (t.__id = Math.random().toString(36).slice(2)) : '-'}`).join('|');
    const key = `${state.decor}|${textilesKey}|${this.canvas.width}`;
    if (key === this.key) return;
    this.key = key;
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (const c of [this.bg, this.fg]) { c.width = W; c.height = H; }
    const s = W / SCENE_W;
    const bctx = this.bg.getContext('2d');
    const fctx = this.fg.getContext('2d');
    bctx.setTransform(s, 0, 0, s, 0, 0);
    this.spec = null;
    this.log = [];
    this.entry = null;
    let target = bctx;
    let depth = 0;
    const log = this.log;
    const QUERY = /^(create|get|measureText|isPointIn)/;
    const api = {
      drawCurtains: (c, spec) => {
        if (this.spec) return;
        this.spec = spec;
        // État au moment de la bascule, pour le restituer avant le rejeu.
        this.entry = { depth, transform: bctx.getTransform() };
        fctx.setTransform(bctx.getTransform());
        target = fctx;
      },
      paintTextile: (c, slot, path, opts = {}) => {
        paintTextile(c, path, { ...opts, texture: state.textiles?.[slot] || null });
      },
    };
    const proxy = new Proxy({}, {
      get: (_, prop) => {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          if (target === bctx) {
            if (prop === 'save') depth++;
            else if (prop === 'restore') depth--;
          } else if (!QUERY.test(prop)) log.push([0, prop, args]);
          return v.apply(target, args);
        };
      },
      set: (_, prop, value) => {
        if (target !== bctx) log.push([1, prop, value]);
        target[prop] = value;
        return true;
      },
    });
    try {
      drawDecor(proxy, state.decor, api);
    } catch (err) {
      console.error('[décor]', err);
    }
    // Rééquilibre la pile save/restore du contexte d'arrière-plan.
    for (let i = 0; i < (this.entry?.depth || 0); i++) bctx.restore();
  }

  #replay(ctx) {
    if (!this.entry) return;
    ctx.save();
    for (let i = 0; i < this.entry.depth; i++) ctx.save();
    ctx.setTransform(this.entry.transform);
    for (const [kind, prop, value] of this.log) {
      if (kind === 1) ctx[prop] = value;
      else ctx[prop](...value);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Dessine la scène.
   * state : { decor, curtain: {texture, tileCm, finish, opacity, heading, hem, wrap} | null,
   *           pose: {panels, openness, tieback, mount, length, rail, hardware},
   *           textiles: {cushions, throw, tablecloth, bedspread}, light: 'jour'|'avant'|'tamise', time, sway }
   */
  render(state) {
    this.state = state;
    this.#build(state);
    const W = this.canvas.width;
    const ctx = this.canvas.getContext('2d');
    const s = W / SCENE_W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const light = state.light || 'jour';
    const curtain = state.curtain && light !== 'avant' ? state.curtain : null;
    if (this.spec && curtain?.texture) {
      curtain.avgColor ||= averageColor(curtain.texture);
      const pose = { ...(state.pose || {}) };
      if (light === 'tamise') { pose.openness = 0; pose.tieback = false; }
      drawWindowTreatment(ctx, this.spec, {
        ...curtain,
        ...pose,
        heading: this.spec.mode === 'shower' ? 'rings' : pose.heading || curtain.heading,
        hardware: pose.hardware || this.spec.hardware,
        time: state.time || 0,
        sway: state.sway || 0,
        exposure: light === 'tamise' ? 0.96 : 1,
      }, { scale: s, quality: state.quality || 1 });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#replay(ctx);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (this.spec) this.#light(ctx, light, curtain, state.pose || {});
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Lumière d'ambiance : rayons de soleil, pièce tamisée, lueur à travers le tissu.
  #light(ctx, light, curtain, pose) {
    const spec = this.spec;
    const win = spec.window;
    if (spec.mode === 'shower') return;
    const opacity = curtain ? curtain.opacity ?? 1 : 0;
    const coverage = !curtain ? 0 : light === 'tamise' ? 1 : pose.tieback ? 0.3 : 1 - (pose.openness ?? 0.3) * 0.72;
    const block = Math.min(1, opacity * coverage);

    if (light === 'tamise') {
      const dark = 0.1 + 0.52 * Math.pow(opacity, 1.6);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(70, 58, 46, ${dark})`;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.restore();
      // Lueur du jour filtrée par le tissu.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cx = win.x + win.w / 2;
      const cy = win.y + win.h / 2;
      const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(win.w, win.h) * 0.95);
      const a = 0.08 + 0.42 * (1 - opacity);
      glow.addColorStop(0, `rgba(255, 238, 200, ${a})`);
      glow.addColorStop(1, 'rgba(255, 238, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.restore();
      return;
    }

    // Plein jour : rayons obliques de la fenêtre vers le sol, atténués par le rideau.
    const strength = (light === 'avant' ? 0.5 : 0.32) * (1 - block * 0.85);
    if (strength < 0.02) return;
    const floorY = spec.floorY;
    const sill = Math.min(spec.sillY ?? win.y + win.h, floorY);
    const dx = 260;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(win.x, win.y, win.x + dx, floorY + 150);
    g.addColorStop(0, `rgba(255, 244, 214, ${strength * 1.4})`);
    g.addColorStop(1, 'rgba(255, 244, 214, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(win.x + 10, win.y + 10);
    ctx.lineTo(win.x + win.w - 10, win.y + 10);
    ctx.lineTo(win.x + win.w + dx, Math.min(SCENE_H, floorY + 170));
    ctx.lineTo(win.x + dx * 0.6, Math.min(SCENE_H, floorY + 170));
    ctx.lineTo(win.x + 10, sill);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (light === 'avant') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cx = win.x + win.w / 2;
      const glare = ctx.createRadialGradient(cx, win.y + win.h * 0.4, 10, cx, win.y + win.h * 0.4, win.w * 1.1);
      glare.addColorStop(0, 'rgba(255, 250, 235, 0.35)');
      glare.addColorStop(1, 'rgba(255, 250, 235, 0)');
      ctx.fillStyle = glare;
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      ctx.restore();
    }
  }
}

/** Charge une image de tissu et renvoie une tuile carrée prête pour le moteur (avec cache). */
const tileCache = new Map();
export function fabricTexture(src) {
  if (!src) return Promise.resolve(null);
  if (!tileCache.has(src)) {
    tileCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const x = c.getContext('2d');
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
        resolve(c);
      };
      img.onerror = () => { tileCache.delete(src); reject(new Error(`Tissu introuvable : ${src}`)); };
      img.src = src;
    }));
  }
  return tileCache.get(src);
}

/** Paramètres de rendu d'un modèle du catalogue. */
export function curtainFromModel(model, texture) {
  if (!model || !texture) return null;
  const r = model.render || {};
  return {
    texture,
    tileCm: r.tileCm || 30,
    finish: r.finish || 'matte',
    opacity: r.opacity ?? 0.95,
    heading: r.heading || 'eyelet',
    hem: r.hem || 'plain',
    wrap: r.wrap || 'repeat',
  };
}
