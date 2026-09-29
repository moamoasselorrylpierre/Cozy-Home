// Stockage sur Cloudflare D1 (SQLite) : une table de documents JSON par « collection »
// (models, styles, requests, users, sessions, content) + une table de compteurs anti-abus.
// Le schéma et les données initiales sont créés automatiquement au premier appel.
import seedModels from '../seed/models.json';
import seedStyles from '../seed/styles.json';
import seedContent from '../seed/content.json';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (col, id))',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)',
  'CREATE TABLE IF NOT EXISTS hits (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL)',
];
const SEED_VERSION = '1';

// Clé d'identification et ordre de lecture propres à chaque collection.
const KEY = { sessions: 'hash' };
const idOf = (col, doc) => String(doc[KEY[col] || 'id']);
const SORT = {
  models: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  styles: (a, b) => (a.order || 0) - (b.order || 0),
  requests: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  users: (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
};

let ready = null;

/** Crée le schéma et charge les données de démonstration (une seule fois par base). */
export function ensureDb(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
      const seeded = await db.prepare('SELECT value FROM meta WHERE key = ?').bind('seed').first('value');
      if (seeded) return;
      const now = Date.now();
      const put = (col, id, doc) => db.prepare('INSERT OR IGNORE INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?)').bind(col, id, JSON.stringify(doc), now);
      await db.batch([
        ...seedModels.map((m) => put('models', m.id, m)),
        ...seedStyles.map((s) => put('styles', s.id, s)),
        put('content', 'site', seedContent),
        db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind('seed', SEED_VERSION),
      ]);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

// Petit cache mémoire (par instance du Worker) pour les lectures publiques très fréquentes.
// Les écritures de cette instance l'invalident aussitôt ; les autres instances se mettent à jour en 10 s maximum.
const CACHE_TTL = 10000;
const memo = new Map();
const invalidate = (col) => memo.delete(col);

/** Lecture mise en cache (pages publiques). */
export async function cachedAll(db, col) {
  const hitEntry = memo.get(col);
  if (hitEntry && Date.now() - hitEntry.at < CACHE_TTL) return structuredClone(hitEntry.value);
  const value = col === 'content' ? await getContent(db) : await all(db, col);
  memo.set(col, { at: Date.now(), value });
  return structuredClone(value);
}

/** Tous les documents d'une collection (copie). */
export async function all(db, col) {
  const { results } = await db.prepare('SELECT data FROM docs WHERE col = ?').bind(col).all();
  const list = results.map((r) => JSON.parse(r.data));
  if (SORT[col]) list.sort(SORT[col]);
  return list;
}

export async function get(db, col, id) {
  const row = await db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?').bind(col, String(id)).first();
  return row ? JSON.parse(row.data) : null;
}

export async function put(db, col, doc) {
  invalidate(col);
  await db.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?)')
    .bind(col, idOf(col, doc), JSON.stringify(doc), Date.now()).run();
  return doc;
}

export async function remove(db, col, id) {
  invalidate(col);
  const res = await db.prepare('DELETE FROM docs WHERE col = ? AND id = ?').bind(col, String(id)).run();
  return (res.meta?.changes || 0) > 0;
}

/**
 * Modification d'une collection : fn reçoit la liste, renvoie la nouvelle liste.
 * Seuls les documents réellement modifiés, ajoutés ou retirés sont écrits (transaction unique).
 */
export async function update(db, col, fn) {
  const before = await all(db, col);
  const beforeById = new Map(before.map((d) => [idOf(col, d), JSON.stringify(d)]));
  const result = await fn(structuredClone(before));
  const after = result === undefined ? before : result;
  const now = Date.now();
  const stmts = [];
  const seen = new Set();
  for (const doc of after) {
    const id = idOf(col, doc);
    seen.add(id);
    const json = JSON.stringify(doc);
    if (beforeById.get(id) !== json) {
      stmts.push(db.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?)').bind(col, id, json, now));
    }
  }
  for (const id of beforeById.keys()) {
    if (!seen.has(id)) stmts.push(db.prepare('DELETE FROM docs WHERE col = ? AND id = ?').bind(col, id));
  }
  if (stmts.length) {
    invalidate(col);
    await db.batch(stmts);
  }
  return after;
}

/** Contenus éditables du site (document unique). */
export const getContent = async (db) => (await get(db, 'content', 'site')) || structuredClone(seedContent);
export async function setContent(db, content) {
  invalidate('content');
  await db.prepare('INSERT OR REPLACE INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?)')
    .bind('content', 'site', JSON.stringify(content), Date.now()).run();
}
export const seedContentReference = () => seedContent;

/**
 * Compteur à fenêtre glissante (limitation des abus, partagée entre toutes les instances).
 * Renvoie le nombre d'occurrences dans la fenêtre, après incrément.
 */
export async function hit(db, key, windowMs) {
  const now = Date.now();
  const row = await db.prepare(
    `INSERT INTO hits (key, start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN hits.start < ?3 THEN 1 ELSE hits.count + 1 END,
       start = CASE WHEN hits.start < ?3 THEN ?2 ELSE hits.start END
     RETURNING count`,
  ).bind(key, now, now - windowMs).first();
  // Nettoyage occasionnel des anciens compteurs.
  if (Math.random() < 0.02) await db.prepare('DELETE FROM hits WHERE start < ?').bind(now - 86400000).run();
  return row?.count || 1;
}

export async function peekHits(db, key, windowMs) {
  const row = await db.prepare('SELECT start, count FROM hits WHERE key = ?').bind(key).first();
  if (!row || row.start < Date.now() - windowMs) return 0;
  return row.count;
}

export const clearHits = (db, key) => db.prepare('DELETE FROM hits WHERE key = ?').bind(key).run();

export function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `${prefix}_${Date.now().toString(36)}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
