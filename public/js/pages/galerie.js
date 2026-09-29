// La Galerie : exposition interactive. Chaque salle met en scène un style de rideau ;
// au survol / toucher le tissu ondule, la loupe révèle la texture, et un comparateur montre
// la lumière du jour avant / après le rideau. La frise suit la progression de la visite.
import { $, $$, pageData, prefersReducedMotion } from '../modules/ui.js';
import { tint, release } from '../modules/dynamic-theme.js';

const { styles = [] } = pageData();
const POSES = {
  voilage: { openness: 0, tieback: false },
  tamisant: { openness: 0.18, tieback: false },
  occultant: { openness: 0, tieback: true },
  oeillets: { openness: 0.3, tieback: false },
  'plis-pinces': { openness: 0, tieback: true },
  brode: { openness: 0.08, tieback: false },
  boheme: { openness: 0.22, tieback: false },
  douche: { openness: 0.32, tieback: false },
};

let scene = null; // module chargé à la demande
const loadScene = () => (scene ||= import('../modules/curtain-scene.js'));

// ---------------------------------------------------------------- Frise & teinte par salle
const rooms = $$('[data-room]');
const links = $$('[data-frise-link]');
const progress = $('[data-frise-progress]');
const roomObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const id = entry.target.dataset.room;
    links.forEach((l) => l.classList.toggle('is-active', l.dataset.friseLink === id));
    const style = styles.find((s) => `salle-${s.id}` === id);
    if (style?.featured?.colors?.length) tint(style.featured.colors, { source: 'salle', hold: true });
    else release({ source: 'salle' });
    const active = $(`[data-frise-link="${id}"]`);
    const frise = $('[data-frise]');
    if (active && frise && frise.scrollWidth > frise.clientWidth) {
      frise.scrollTo({ left: active.offsetLeft - frise.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
    }
  }
}, { rootMargin: '-45% 0px -45% 0px' });
rooms.forEach((r) => roomObserver.observe(r));
window.addEventListener('scroll', () => {
  const doc = document.documentElement;
  const p = Math.min(1, window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight));
  if (progress) progress.style.transform = `scaleX(${p})`;
}, { passive: true });

// ---------------------------------------------------------------- Salles
class Salle {
  constructor(section, style) {
    this.section = section;
    this.style = style;
    this.frame = $('[data-salle-frame]', section);
    this.canvas = $('[data-layer="apres"]', section);
    this.avant = $('[data-layer="avant"]', section);
    this.veil = $('[data-veil]', section);
    this.loupe = $('[data-loupe]', section);
    this.compare = $('[data-compare]', section);
    this.range = $('[data-compare-range]', section);
    this.handle = $('[data-compare-handle]', section);
    this.tools = Object.fromEntries($$('[data-tool]', section).map((b) => [b.dataset.tool, b]));
    this.sway = 0;
    this.targetSway = 0;
    this.windOn = false;
    this.mode = 'jour';
    this.ready = false;
  }

  async init() {
    const { SceneRenderer, fabricTexture, curtainFromModel } = await loadScene();
    const model = this.style.featured;
    if (!model) { this.veil.textContent = 'Œuvre bientôt exposée'; return; }
    this.texture = await fabricTexture(model.images.swatch);
    this.curtain = curtainFromModel(model, this.texture);
    this.renderer = new SceneRenderer(this.canvas).fit(2);
    this.renderAvant = new SceneRenderer(this.avant);
    this.pose = { panels: 2, mount: 'fenetre', length: 'sol', rail: 'apparent', ...POSES[this.style.id] };
    this.draw();
    this.veil.hidden = true;
    this.ready = true;
    this.bind();
  }

  state(extra = {}) {
    return {
      decor: this.style.decor || 'salon-moderne',
      curtain: this.curtain,
      pose: this.pose,
      textiles: {},
      light: this.mode === 'compare' ? 'tamise' : 'jour',
      time: performance.now() / 1000,
      sway: this.sway,
      ...extra,
    };
  }

  draw(extra) {
    this.renderer.render(this.state(extra));
  }

  // Animation « tissu effleuré » : l'amplitude monte et redescend en douceur.
  animate() {
    if (this.raf) return;
    let last = 0;
    const loop = (now) => {
      this.sway += (this.targetSway - this.sway) * 0.06;
      if (now - last > 33) { // ~30 images / seconde
        last = now;
        this.draw({ quality: 0.75 });
      }
      if (this.targetSway === 0 && this.sway < 0.01) {
        this.sway = 0;
        this.raf = null;
        this.draw();
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  breeze(on) {
    if (prefersReducedMotion() || this.mode === 'compare') return;
    this.targetSway = on || this.windOn ? 1 : 0;
    this.animate();
  }

  setTool(name, on) {
    const btn = this.tools[name];
    btn?.setAttribute('aria-pressed', String(on));
  }

  bind() {
    const f = this.frame;
    f.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.breeze(true); });
    f.addEventListener('pointerleave', () => { this.breeze(false); this.loupe.hidden = true; });
    f.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && this.mode !== 'compare' && !this.loupeOn) {
        this.breeze(true);
        clearTimeout(this.touchTimer);
        this.touchTimer = setTimeout(() => this.breeze(false), 3500);
      }
    });
    f.addEventListener('pointermove', (e) => this.moveLoupe(e));

    this.tools.wind.addEventListener('click', () => {
      this.windOn = !this.windOn;
      this.setTool('wind', this.windOn);
      this.breeze(this.windOn);
    });
    this.tools.loupe.addEventListener('click', () => {
      this.loupeOn = !this.loupeOn;
      this.setTool('loupe', this.loupeOn);
      f.classList.toggle('is-loupe', this.loupeOn);
      if (this.loupeOn) {
        this.loupe.style.backgroundImage = `url("${this.style.featured.images.swatch}")`;
        const r = f.getBoundingClientRect();
        this.moveLoupe({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      } else this.loupe.hidden = true;
    });
    this.tools.light.addEventListener('click', () => this.toggleCompare());
    this.range.addEventListener('input', () => this.updateCompare());
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => { this.renderer.fit(2); this.draw(); if (this.mode === 'compare') this.drawAvant(); }, 250);
    });
  }

  moveLoupe(e) {
    if (!this.loupeOn) return;
    const r = this.frame.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.loupe.hidden = false;
    this.loupe.style.transform = `translate(${x - 90}px, ${y - 90}px)`;
    this.loupe.style.backgroundPosition = `${-x * 1.4}px ${-y * 1.4}px`;
  }

  drawAvant() {
    this.avant.width = this.canvas.width;
    this.avant.height = this.canvas.height;
    this.renderAvant.render({ ...this.state(), light: 'avant', sway: 0 });
  }

  toggleCompare() {
    const on = this.mode !== 'compare';
    this.mode = on ? 'compare' : 'jour';
    this.setTool('light', on);
    this.targetSway = 0;
    this.sway = 0;
    this.windOn = false;
    this.setTool('wind', false);
    this.compare.hidden = !on;
    this.avant.hidden = !on;
    if (on) this.drawAvant();
    this.draw();
    this.updateCompare();
  }

  updateCompare() {
    const v = Number(this.range.value);
    this.avant.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    this.handle.style.left = `${v}%`;
  }
}

const salles = $$('[data-salle]').map((section) => new Salle(section, styles.find((s) => s.id === section.dataset.salle) || {}));
const lazy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    lazy.unobserve(entry.target);
    const salle = salles.find((s) => s.section === entry.target);
    salle?.init().catch((err) => {
      console.error(err);
      salle.veil.textContent = 'Œuvre momentanément indisponible';
    });
  }
}, { rootMargin: '400px 0px' });
salles.forEach((s) => lazy.observe(s.section));
