// Point d'entrée : démarre le serveur HTTP de Cozy Home by Fany.
import { startServer } from './server/app.js';

startServer().catch((err) => {
  console.error('[cozy-home] Échec du démarrage :', err);
  process.exit(1);
});
