// Authentification de l'espace pro : comptes pré-définis (pas d'inscription publique),
// mots de passe hachés (PBKDF2-SHA-256, Web Crypto), sessions stockées dans D1, cookie HttpOnly.
import { all, get, put, remove, update, newId, hit, peekHits, clearHits } from './db.js';
import { parseCookies } from './http.js';

const COOKIE = 'ch_session';
// Coût du hachage : 50 000 itérations ≈ 8 ms, compatible avec l'offre gratuite (10 ms de calcul par requête).
// Avec l'offre payante, passer la variable PASSWORD_ITERATIONS à 100000 (maximum des Workers) :
// les mots de passe sont recalculés automatiquement à la connexion suivante.
let ITERATIONS = 50000;
export function configureAuth(env) {
  const n = Number(env?.PASSWORD_ITERATIONS);
  ITERATIONS = Number.isFinite(n) && n > 0 ? Math.min(100000, Math.max(20000, Math.round(n))) : 50000;
}
export const needsRehash = (stored) => Number(String(stored || '').split('$')[1]) !== ITERATIONS;
const SESSION_DAYS = 7;
const enc = new TextEncoder();

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [algo, iter, saltB64, hashB64] = String(stored || '').split('$');
  if (algo !== 'pbkdf2' || !saltB64 || !hashB64) {
    // Calcul factice : temps de réponse homogène même pour un compte inexistant.
    await pbkdf2(String(password), new Uint8Array(16), ITERATIONS);
    return false;
  }
  const hash = await pbkdf2(String(password), unb64(saltB64), Number(iter) || ITERATIONS);
  return equal(hash, unb64(hashB64));
}

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit mêler lettres et chiffres.';
  return null;
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

/** Création / mise à jour d'un compte. */
export async function upsertUser(db, { username, password, name, role, id }) {
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) throw new Error('Identifiant invalide (3 à 32 caractères : lettres, chiffres, . _ -).');
  const passwordHash = await hashPassword(password);
  let saved;
  await update(db, 'users', (users) => {
    const existing = users.find((u) => u.username === uname);
    if (existing) {
      existing.passwordHash = passwordHash;
      if (name) existing.name = name;
      if (role) existing.role = role;
      saved = existing;
    } else {
      saved = { id: id || newId('usr'), username: uname, name: name || uname, role: role || 'staff', passwordHash, createdAt: new Date().toISOString() };
      users.push(saved);
    }
    return users;
  });
  return saved;
}

/**
 * Compte de la propriétaire, créé à partir des secrets Cloudflare :
 *  - ADMIN_PASSWORD (+ ADMIN_USER, par défaut « fany ») au premier démarrage ;
 *  - ADMIN_PASSWORD_RESET pour réinitialiser un mot de passe oublié (à retirer ensuite).
 * Renvoie false si aucun compte n'existe et qu'aucun secret n'est configuré.
 */
export async function ensureOwnerAccount(db, env) {
  const users = await all(db, 'users');
  const username = String(env.ADMIN_USER || 'fany').toLowerCase();
  if (!users.length) {
    if (!env.ADMIN_PASSWORD || validatePasswordStrength(env.ADMIN_PASSWORD)) return false;
    await upsertUser(db, { id: 'usr_owner', username, password: env.ADMIN_PASSWORD, name: 'Fany', role: 'owner' });
    return true;
  }
  if (env.ADMIN_PASSWORD_RESET && !validatePasswordStrength(env.ADMIN_PASSWORD_RESET)) {
    const marker = await sha256(`reset:${env.ADMIN_PASSWORD_RESET}`);
    const owner = users.find((u) => u.role === 'owner') || users[0];
    if (owner.resetMarker !== marker) {
      owner.passwordHash = await hashPassword(env.ADMIN_PASSWORD_RESET);
      owner.resetMarker = marker;
      await put(db, 'users', owner);
      await destroyUserSessions(db, owner.id);
    }
  }
  return true;
}

// --- Limitation des tentatives de connexion (partagée via D1) ---
const LOGIN_WINDOW = 15 * 60 * 1000;
export const loginBlocked = async (db, ip) => (await peekHits(db, `login:${ip}`, LOGIN_WINDOW)) >= 6;
export const recordLoginFailure = (db, ip) => hit(db, `login:${ip}`, LOGIN_WINDOW);
export const clearLoginFailures = (db, ip) => clearHits(db, `login:${ip}`);

// --- Sessions ---
export async function createSession(db, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  await put(db, 'sessions', { hash: await sha256(token), userId, expiresAt, createdAt: Date.now() });
  return { token, expiresAt };
}

export async function destroySession(db, token) {
  if (token) await remove(db, 'sessions', await sha256(token));
}

export async function destroyUserSessions(db, userId, exceptToken) {
  const keep = exceptToken ? await sha256(exceptToken) : null;
  await update(db, 'sessions', (sessions) => sessions.filter((s) => (s.userId !== userId || s.hash === keep) && s.expiresAt > Date.now()));
}

export const sessionToken = (request) => parseCookies(request.headers.get('cookie'))[COOKIE] || null;

/** Utilisateur connecté (ou null). */
export async function currentUser(db, request) {
  const token = sessionToken(request);
  if (!token) return null;
  const session = await get(db, 'sessions', await sha256(token));
  if (!session || session.expiresAt < Date.now()) return null;
  return get(db, 'users', session.userId);
}

export function sessionCookie(token, expiresAt, secure) {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${new Date(expiresAt).toUTCString()}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearSessionCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}
