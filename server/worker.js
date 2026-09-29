// Point d'entrée Cloudflare Workers.
import { handle } from './app.js';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
