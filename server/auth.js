// Authentification de l'espace administrateur : comptes pré-définis (pas d'inscription publique),
// mots de passe hachés (scrypt), sessions par cookie HttpOnly, limitation des tentatives.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { read, update, newId } from './store.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'ch_session';
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltB64, keyB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit mêler lettres et chiffres.';
  return null;
}

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

/** Création / mise à jour d'un compte (utilisé par le script CLI et par la gestion d'équipe). */
export async function upsertUser({ username, password, name, role }) {
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) throw new Error("Identifiant invalide (3 à 32 caractères : lettres, chiffres, . _ -).");
  const passwordHash = await hashPassword(password);
  let saved;
  await update('users', (users) => {
    const existing = users.find((u) => u.username === uname);
    if (existing) {
      existing.passwordHash = passwordHash;
      if (name) existing.name = name;
      if (role) existing.role = role;
      saved = existing;
    } else {
      saved = { id: newId('usr'), username: uname, name: name || uname, role: role || 'staff', passwordHash, createdAt: new Date().toISOString() };
      users.push(saved);
    }
    return users;
  });
  return saved;
}

/** Premier démarrage : crée le compte de Fany (propriétaire) si aucun compte n'existe. */
export async function ensureOwnerAccount() {
  if (read('users').length > 0) return null;
  const username = (process.env.ADMIN_USER || 'fany').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password || validatePasswordStrength(password)) {
    password = `Cozy-${crypto.randomBytes(6).toString('base64url')}-${crypto.randomInt(10, 99)}`;
    generated = true;
  }
  await upsertUser({ username, password, name: 'Fany', role: 'owner' });
  return { username, password, generated };
}

// --- Limitation des tentatives de connexion (mémoire) ---
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 6;

export function loginBlocked(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return a.count >= MAX_FAILS;
}
export function recordLoginFailure(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(ip, { first: Date.now(), count: 1 });
  else a.count += 1;
}
export function clearLoginFailures(ip) { attempts.delete(ip); }

// --- Sessions ---
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + config.sessionDays * 86400000;
  await update('sessions', (sessions) => {
    const now = Date.now();
    const alive = sessions.filter((s) => s.expiresAt > now);
    alive.push({ hash: tokenHash(token), userId, expiresAt, createdAt: now });
    return alive;
  });
  return { token, expiresAt };
}

export async function destroySession(token) {
  if (!token) return;
  const h = tokenHash(token);
  await update('sessions', (sessions) => sessions.filter((s) => s.hash !== h));
}

export async function destroyUserSessions(userId, exceptToken) {
  const keep = exceptToken ? tokenHash(exceptToken) : null;
  await update('sessions', (sessions) => sessions.filter((s) => s.userId !== userId || s.hash === keep));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE] || null;
}

/** Renvoie l'utilisateur connecté (ou null). */
export function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const h = tokenHash(token);
  const session = read('sessions').find((s) => s.hash === h && s.expiresAt > Date.now());
  if (!session) return null;
  return read('users').find((u) => u.id === session.userId) || null;
}

export function sessionCookie(token, expiresAt) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (config.secureCookies) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT${config.secureCookies ? '; Secure' : ''}`;
}
