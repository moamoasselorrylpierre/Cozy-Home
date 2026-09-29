// Mini moteur de gabarits HTML (façon Mustache) avec échappement systématique.
//   {{ chemin }}                 valeur échappée
//   {{{ chemin }}}               valeur brute (HTML déjà sûr, produit par le serveur)
//   {{ aide chemin }}            aide : nl2p, json, money, lower, upper, date, attrs
//   {{> partiel }}               inclusion de views/partials/partiel.html
//   {{#if chemin}}…{{else}}…{{/if}}, {{#unless chemin}}…{{/unless}}
//   {{#each chemin as nom}}…{{/each}}   (variables @index, @first, @last)
import fs from 'node:fs';
import path from 'node:path';
import { config, isDev } from './config.js';

const astCache = new Map();

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte multi-lignes → paragraphes HTML (échappés). */
export function nl2p(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** JSON sûr à placer dans un bloc <script type="application/json">. */
export function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function formatMoney(amount, currency = 'XAF') {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '';
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(amount));
  return currency === 'XAF' ? `${n} FCFA` : `${n} ${currency}`;
}

const HELPERS = {
  nl2p: (v) => nl2p(v),
  json: (v) => safeJson(v),
  money: (v) => escapeHtml(formatMoney(v)),
  lower: (v) => escapeHtml(String(v ?? '').toLowerCase()),
  upper: (v) => escapeHtml(String(v ?? '').toUpperCase()),
  date: (v) => escapeHtml(v ? new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''),
};

function tokenize(src) {
  const tokens = [];
  const re = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) tokens.push({ type: 'text', value: src.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: 'raw', expr: m[1] });
    else {
      const e = m[2];
      if (e.startsWith('#')) tokens.push({ type: 'open', expr: e.slice(1).trim() });
      else if (e.startsWith('/')) tokens.push({ type: 'close', expr: e.slice(1).trim() });
      else if (e === 'else') tokens.push({ type: 'else' });
      else if (e.startsWith('>')) tokens.push({ type: 'partial', name: e.slice(1).trim() });
      else if (e.startsWith('!')) { /* commentaire */ }
      else tokens.push({ type: 'var', expr: e });
    }
    last = re.lastIndex;
  }
  if (last < src.length) tokens.push({ type: 'text', value: src.slice(last) });
  return tokens;
}

function parse(tokens, file) {
  const root = { children: [] };
  const stack = [root];
  for (const t of tokens) {
    const top = stack[stack.length - 1];
    const target = top.inElse ? top.elseChildren : top.children;
    if (t.type === 'open') {
      const [kind, ...rest] = t.expr.split(/\s+/);
      const node = { type: kind, children: [], elseChildren: [], inElse: false };
      if (kind === 'each') {
        node.path = rest[0];
        node.alias = rest[1] === 'as' ? rest[2] : 'this';
      } else if (kind === 'if' || kind === 'unless') {
        node.path = rest.join(' ');
      } else throw new Error(`Bloc inconnu {{#${kind}}} dans ${file}`);
      target.push(node);
      stack.push(node);
    } else if (t.type === 'close') {
      const node = stack.pop();
      if (!node || node.type !== t.expr) throw new Error(`Fermeture {{/${t.expr}}} inattendue dans ${file}`);
    } else if (t.type === 'else') {
      top.inElse = true;
    } else target.push(t);
  }
  if (stack.length !== 1) throw new Error(`Bloc non fermé dans ${file}`);
  return root.children;
}

function lookup(scope, expr) {
  const p = expr.trim();
  if (p === 'this') return scope.this;
  if (/^(['"]).*\1$/.test(p)) return p.slice(1, -1);
  const parts = p.split('.');
  let value;
  // Recherche du premier segment dans la chaîne de portées.
  for (let s = scope; s; s = s.__parent) {
    if (Object.prototype.hasOwnProperty.call(s, parts[0])) { value = s[parts[0]]; break; }
  }
  for (let i = 1; i < parts.length && value != null; i++) value = value[parts[i]];
  return value;
}

function truthy(v) {
  return Array.isArray(v) ? v.length > 0 : !!v;
}

function renderNodes(nodes, scope) {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text': out += n.value; break;
      case 'var': {
        const [first, ...rest] = n.expr.split(/\s+/);
        if (rest.length && HELPERS[first]) out += HELPERS[first](lookup(scope, rest.join(' ')));
        else out += escapeHtml(lookup(scope, n.expr));
        break;
      }
      case 'raw': out += String(lookup(scope, n.expr) ?? ''); break;
      case 'partial': out += renderNodes(loadTemplate(`partials/${n.name}`), scope); break;
      case 'if': out += renderNodes(truthy(lookup(scope, n.path)) ? n.children : n.elseChildren, scope); break;
      case 'unless': out += renderNodes(!truthy(lookup(scope, n.path)) ? n.children : n.elseChildren, scope); break;
      case 'each': {
        const list = lookup(scope, n.path);
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) { out += renderNodes(n.elseChildren, scope); break; }
        arr.forEach((item, i) => {
          const child = { __parent: scope, '@index': i, '@number': i + 1, '@first': i === 0, '@last': i === arr.length - 1 };
          if (n.alias === 'this') child.this = item;
          else child[n.alias] = item;
          out += renderNodes(n.children, child);
        });
        break;
      }
      default: break;
    }
  }
  return out;
}

function loadTemplate(name) {
  if (!isDev && astCache.has(name)) return astCache.get(name);
  const file = path.join(config.viewsDir, `${name}.html`);
  const src = fs.readFileSync(file, 'utf8');
  const ast = parse(tokenize(src), file);
  astCache.set(name, ast);
  return ast;
}

export function render(name, data) {
  return renderNodes(loadTemplate(name), { ...data });
}
