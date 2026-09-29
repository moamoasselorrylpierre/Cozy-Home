// Démarre le Worker en local (wrangler dev) sur un port libre, avec une base D1 neuve.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

export async function startWorker({ vars = {} } = {}) {
  const persist = await fs.mkdtemp(path.join(os.tmpdir(), 'cozy-wrangler-'));
  const port = await freePort();
  const inspector = await freePort();
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(inspector), '--persist-to', persist, '--log-level', 'warn'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const child = spawn('npx', args, { cwd: ROOT, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const res = await fetch(`${base}/robots.txt`);
      if (res.ok) break;
    } catch { /* pas encore prêt */ }
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`wrangler dev n'a pas démarré :\n${output}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    base,
    async stop() {
      // Arrête tout le groupe de processus (npx → wrangler → workerd).
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      await new Promise((r) => setTimeout(r, 300));
      await fs.rm(persist, { recursive: true, force: true });
    },
  };
}
