// Configuration centralisée (variables d'environnement avec valeurs par défaut).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'production',
  // URL publique du site (canonique, sitemap, partages). Déduite de la requête si absente.
  siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, ''),
  publicDir: path.join(ROOT, 'public'),
  viewsDir: path.join(ROOT, 'views'),
  seedDir: path.join(ROOT, 'seed'),
  dataDir: DATA_DIR,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads')),
  // Cookies « Secure » : activés par défaut en production derrière HTTPS.
  secureCookies: process.env.SECURE_COOKIES
    ? process.env.SECURE_COOKIES === 'true'
    : (process.env.NODE_ENV || 'production') === 'production' && !!process.env.SITE_URL?.startsWith('https'),
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  limits: {
    jsonBody: 12 * 1024 * 1024, // images encodées en base64 (compressées côté navigateur)
    uploadBytes: 8 * 1024 * 1024,
    compositionBytes: 900 * 1024,
  },
};

export const isDev = config.env === 'development';
