// Crée ou réinitialise un compte de l'espace pro (aucune inscription publique n'existe).
// Usage : npm run admin:create -- <identifiant> <mot-de-passe> [Nom affiché] [--proprietaire]
import { initStore, flush } from '../server/store.js';
import { upsertUser, validatePasswordStrength } from '../server/auth.js';

const args = process.argv.slice(2);
const owner = args.includes('--proprietaire');
const [username, password, ...nameParts] = args.filter((a) => a !== '--proprietaire');

if (!username || !password) {
  console.log('Usage : npm run admin:create -- <identifiant> <mot-de-passe> [Nom affiché] [--proprietaire]');
  process.exit(1);
}
const problem = validatePasswordStrength(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
await initStore();
const user = await upsertUser({ username, password, name: nameParts.join(' ') || undefined, role: owner ? 'owner' : undefined });
await flush();
console.log(`Compte « ${user.username} » (${user.role === 'owner' ? 'propriétaire' : 'équipe'}) enregistré.`);
