// Stockage JSON simple et robuste : cache mémoire + écritures atomiques sérialisées par fichier.
// Adapté au volume d'une boutique artisanale (quelques centaines de modèles / demandes).
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const cache = new Map();
const queues = new Map();

const COLLECTIONS = {
  models: [],
  styles: [],
  content: {},
  requests: [],
  users: [],
  sessions: [],
};

function fileFor(name) {
  return path.join(config.dataDir, `${name}.json`);
}

/** Crée les dossiers de données et copie les données initiales (seed) si absentes. */
export async function initStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.uploadDir, { recursive: true });
  for (const [name, empty] of Object.entries(COLLECTIONS)) {
    const target = fileFor(name);
    if (fsSync.existsSync(target)) continue;
    const seed = path.join(config.seedDir, `${name}.json`);
    if (fsSync.existsSync(seed)) await fs.copyFile(seed, target);
    else await fs.writeFile(target, JSON.stringify(empty, null, 2));
  }
  for (const name of Object.keys(COLLECTIONS)) await load(name);
}

async function load(name) {
  const raw = await fs.readFile(fileFor(name), 'utf8');
  try {
    cache.set(name, JSON.parse(raw));
  } catch (err) {
    throw new Error(`Fichier de données illisible : ${fileFor(name)} (${err.message})`);
  }
}

/** Lecture (copie profonde pour éviter toute mutation accidentelle du cache). */
export function read(name) {
  if (!cache.has(name)) throw new Error(`Collection inconnue : ${name}`);
  return structuredClone(cache.get(name));
}

/** Écriture atomique : fichier temporaire puis renommage, en file d'attente par collection. */
export function write(name, value) {
  cache.set(name, structuredClone(value));
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(async () => {
    const target = fileFor(name);
    const tmp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache.get(name), null, 2));
    await fs.rename(tmp, target);
  });
  queues.set(name, next.catch((err) => console.error(`[store] écriture ${name} :`, err)));
  return next;
}

/** Modification transactionnelle : fn reçoit une copie, renvoie la nouvelle valeur (ou undefined = inchangé). */
export async function update(name, fn) {
  const current = read(name);
  const result = await fn(current);
  const value = result === undefined ? current : result;
  await write(name, value);
  return value;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

/** Attend la fin des écritures en cours (arrêt propre, tests). */
export async function flush() {
  await Promise.all([...queues.values()]);
}
