// Règles métier : validation / nettoyage des modèles, styles, contenus, demandes et images.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';
import {
  STYLE_IDS, ROOMS, MATERIALS, COLOR_FAMILIES, AVAILABILITY, HEADINGS, FINISHES, HEMS,
  REQUEST_TYPES, REQUEST_STATUSES, MODEL_STATUSES, PRICE_UNITS,
} from '../public/js/shared/taxonomy.js';

const ids = (list) => new Set(list.map((x) => x.id));
const ROOM_IDS = ids(ROOMS);
const MATERIAL_IDS = ids(MATERIALS);
const FAMILY_IDS = ids(COLOR_FAMILIES);

export function str(value, max = 500) {
  if (value == null) return '';
  return String(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
const oneOf = (value, allowed, fallback) => (allowed.has ? allowed.has(value) : allowed.includes(value)) ? value : fallback;
const listOf = (value, allowed) => [...new Set((Array.isArray(value) ? value : []).filter((v) => allowed.has(v)))];
const clamp = (n, min, max, d) => (Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Number(n))) : d);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Seules les images hébergées par le site sont acceptées (pas d'URL externe / javascript:). */
export function localImage(value) {
  const v = str(value, 300);
  if (!v) return '';
  if (/^\/(uploads|img)\/[\w\-./]+\.(webp|jpe?g|png|avif|svg)$/i.test(v) && !v.includes('..')) return v;
  return '';
}

export function slugify(text) {
  return str(text, 120)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'modele';
}

export function uniqueSlug(base, models, selfId) {
  let slug = slugify(base);
  let i = 2;
  const taken = new Set(models.filter((m) => m.id !== selfId).map((m) => m.slug));
  while (taken.has(slug)) slug = `${slugify(base)}-${i++}`;
  return slug;
}

/** Nettoie un modèle envoyé par l'administration (création ou modification). */
export function sanitizeModel(input, existing = {}) {
  const m = { ...existing };
  if (input.name !== undefined) m.name = str(input.name, 80);
  if (!m.name) throw new HttpError(400, 'Le nom du modèle est obligatoire.');
  if (input.style !== undefined) m.style = oneOf(input.style, STYLE_IDS, 'tamisant');
  m.style = m.style || 'tamisant';
  if (input.description !== undefined) m.description = str(input.description, 1200);
  if (input.material !== undefined) m.material = oneOf(input.material, MATERIAL_IDS, 'coton');
  if (input.rooms !== undefined) m.rooms = listOf(input.rooms, ROOM_IDS);
  if (input.colorFamilies !== undefined) m.colorFamilies = listOf(input.colorFamilies, FAMILY_IDS);
  if (input.colors !== undefined) {
    m.colors = (Array.isArray(input.colors) ? input.colors : [])
      .filter((c) => c && isHex(c.hex))
      .slice(0, 6)
      .map((c) => ({ hex: c.hex.toUpperCase(), name: str(c.name, 40), weight: clamp(c.weight, 0, 1, 0) }));
  }
  if (input.availability !== undefined) m.availability = oneOf(input.availability, ids(AVAILABILITY), 'disponible');
  if (input.status !== undefined) m.status = oneOf(input.status, ids(MODEL_STATUSES), 'draft');
  if (input.featured !== undefined) m.featured = !!input.featured;
  if (input.price !== undefined) {
    const amount = input.price && input.price.amount !== '' && input.price.amount != null ? Number(input.price.amount) : null;
    m.price = amount != null && Number.isFinite(amount) && amount >= 0
      ? { amount: Math.round(amount), unit: oneOf(input.price.unit, ids(PRICE_UNITS), 'metre'), currency: 'XAF' }
      : null;
  }
  if (input.render !== undefined) {
    const r = input.render || {};
    m.render = {
      heading: oneOf(r.heading, ids(HEADINGS), 'eyelet'),
      finish: oneOf(r.finish, ids(FINISHES), 'matte'),
      hem: oneOf(r.hem, ids(HEMS), 'plain'),
      opacity: clamp(r.opacity, 0.15, 1, 0.9),
      tileCm: clamp(r.tileCm, 5, 120, 30),
      wrap: oneOf(r.wrap, ['repeat', 'mirror'], 'repeat'),
    };
  }
  if (input.images !== undefined) {
    const im = input.images || {};
    const mk = im.mockups || {};
    m.images = {
      original: localImage(im.original),
      swatch: localImage(im.swatch),
      mockups: { ferme: localImage(mk.ferme), miOuvert: localImage(mk.miOuvert), embrasse: localImage(mk.embrasse) },
    };
  }
  if (input.analysis !== undefined) {
    const a = input.analysis || {};
    m.analysis = {
      pattern: oneOf(a.pattern, ['uni', 'texture', 'motif', 'raye'], 'uni'),
      stripes: oneOf(a.stripes, ['vertical', 'horizontal', null], null),
      brightness: clamp(a.brightness, 0, 1, 0.5),
      contrast: clamp(a.contrast, 0, 1, 0.1),
    };
  }
  m.rooms ||= [];
  m.colorFamilies ||= [];
  m.colors ||= [];
  m.availability ||= 'disponible';
  m.status ||= 'draft';
  m.material ||= 'coton';
  m.featured = !!m.featured;
  m.render ||= { heading: 'eyelet', finish: 'matte', hem: 'plain', opacity: 0.9, tileCm: 30, wrap: 'repeat' };
  m.images ||= { original: '', swatch: '', mockups: { ferme: '', miOuvert: '', embrasse: '' } };
  if (m.status === 'published' && !m.images.swatch) throw new HttpError(400, 'Un modèle publié doit avoir une photo de tissu.');
  return m;
}

/** Vue publique d'un modèle (sans champs internes). */
export function publicModel(m) {
  return {
    id: m.id, slug: m.slug, name: m.name, style: m.style, description: m.description, material: m.material,
    rooms: m.rooms, colorFamilies: m.colorFamilies, colors: m.colors, availability: m.availability,
    price: m.price, featured: m.featured, render: m.render, images: m.images,
  };
}

export function sanitizeStyle(input, existing) {
  const s = { ...existing };
  for (const [k, max] of [['name', 60], ['short', 40], ['cartel', 900], ['material', 200], ['ambiance', 200], ['roman', 6]]) {
    if (input[k] !== undefined) s[k] = str(input[k], max);
  }
  if (input.featuredModel !== undefined) s.featuredModel = str(input.featuredModel, 80);
  if (input.decor !== undefined) s.decor = str(input.decor, 60);
  return s;
}

/**
 * Contenu éditable : on ne garde que les clés connues du modèle de référence (seed),
 * avec la même forme (texte, liste, objet). Les images sont forcées en chemins locaux.
 */
export function sanitizeContent(input, reference) {
  const walk = (inp, ref, key = '') => {
    if (Array.isArray(ref)) {
      const tpl = ref[0];
      const arr = Array.isArray(inp) ? inp.slice(0, 24) : ref;
      if (tpl === undefined) return arr.map((v) => str(v, 2000));
      return arr.map((item) => walk(item, tpl, key));
    }
    if (ref && typeof ref === 'object') {
      const out = {};
      for (const k of Object.keys(ref)) out[k] = walk(inp && typeof inp === 'object' ? inp[k] : undefined, ref[k], k);
      return out;
    }
    if (typeof ref === 'boolean') return inp === undefined ? ref : !!inp;
    if (inp === undefined || inp === null) return typeof ref === 'string' ? '' : ref;
    if (/image|portrait|photo/i.test(key)) return localImage(inp);
    if (/^(tiktok|instagram|facebook|messenger|url)$/i.test(key)) {
      const v = str(inp, 300);
      return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : '';
    }
    if (key === 'link') {
      const v = str(inp, 300);
      return /^(\/[\w\-./?=&#%]*|https:\/\/[^\s"'<>]+)$/i.test(v) ? v : '/';
    }
    return str(inp, 4000);
  };
  return walk(input, reference);
}

// --- Demandes (devis, conseil, commande) ---
export function sanitizeRequest(input) {
  const type = oneOf(input.type, ids(REQUEST_TYPES), null);
  if (!type) throw new HttpError(400, 'Type de demande inconnu.');
  const c = input.customer || {};
  const customer = {
    name: str(c.name, 100),
    phone: str(c.phone, 30).replace(/[^\d+ ()-]/g, ''),
    email: str(c.email, 120),
    city: str(c.city, 80),
    contactPref: oneOf(c.contactPref, ['whatsapp', 'appel', 'email'], 'whatsapp'),
  };
  if (!customer.name) throw new HttpError(400, 'Merci d’indiquer votre nom.');
  if (customer.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(customer.email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (!customer.phone && !customer.email) throw new HttpError(400, 'Indiquez un numéro WhatsApp / téléphone ou un e-mail pour que Fany puisse vous répondre.');

  const d = input.details || {};
  const num = (v, max = 2000) => (v === '' || v == null ? null : clamp(v, 0, max, null));
  const details = {
    message: str(d.message, 3000),
    room: oneOf(d.room, ROOM_IDS, ''),
    windowWidth: num(d.windowWidth),
    windowHeight: num(d.windowHeight),
    windows: num(d.windows, 50),
    budget: str(d.budget, 60),
    projectType: oneOf(d.projectType, ['rideaux', 'relooking', 'les-deux', ''], ''),
    styleWish: str(d.styleWish, 200),
    deadline: str(d.deadline, 80),
    modelSlug: str(d.modelSlug, 100),
    modelName: str(d.modelName, 100),
    heading: oneOf(d.heading, ids(HEADINGS), ''),
    panels: num(d.panels, 40),
    lining: oneOf(d.lining, ['sans', 'doublure', 'occultante', ''], ''),
    installation: oneOf(d.installation, ['pose', 'livraison', 'retrait', ''], ''),
    address: str(d.address, 300),
    estimate: num(d.estimate, 1e9),
  };
  if (type === 'commande' && !details.modelSlug) throw new HttpError(400, 'Choisissez le modèle à commander.');
  if (type === 'conseil' && !details.message) throw new HttpError(400, 'Dites-nous en quelques mots ce dont vous avez besoin.');
  return { type, customer, details };
}

export function sanitizeComposition(input) {
  if (!input || typeof input !== 'object') return null;
  const t = input.textiles || {};
  const o = input.options || {};
  return {
    decor: str(input.decor, 60),
    decorLabel: str(input.decorLabel, 80),
    curtain: str(input.curtain, 100),
    curtainName: str(input.curtainName, 100),
    textiles: Object.fromEntries(
      ['cushions', 'throw', 'tablecloth', 'bedspread', 'towel'].map((k) => [k, t[k] ? { slug: str(t[k].slug, 100), name: str(t[k].name, 100) } : null]),
    ),
    options: {
      tieback: !!o.tieback,
      mount: oneOf(o.mount, ['plafond', 'fenetre'], 'fenetre'),
      length: oneOf(o.length, ['sol', 'allege'], 'sol'),
      rail: oneOf(o.rail, ['apparent', 'cache'], 'apparent'),
      openness: clamp(o.openness, 0, 1, 0.3),
      panels: oneOf(Number(o.panels), [1, 2], 2),
      heading: oneOf(o.heading, ids(HEADINGS), ''),
      hardware: oneOf(o.hardware, ['brass', 'black', 'wood', 'white'], 'brass'),
    },
  };
}

// --- Images (téléversements) ---
const SIGNATURES = [
  { ext: 'webp', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];

/** Enregistre une image reçue en data URL après vérification de sa signature binaire. */
export async function saveDataUrlImage(dataUrl, folder, maxBytes = config.limits.uploadBytes) {
  const m = /^data:image\/(webp|jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Image invalide (formats acceptés : WebP, JPEG, PNG).');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) throw new HttpError(413, 'Image trop volumineuse.');
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw new HttpError(400, 'Le fichier ne semble pas être une image valide.');
  const sub = path.join(folder.replace(/[^a-z0-9-]/gi, ''), new Date().toISOString().slice(0, 7));
  const dir = path.join(config.uploadDir, sub);
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomBytes(10).toString('hex')}.${sig.ext}`;
  await fs.writeFile(path.join(dir, name), buf);
  return `/uploads/${sub.split(path.sep).join('/')}/${name}`;
}

export const REQUEST_STATUS_IDS = ids(REQUEST_STATUSES);
