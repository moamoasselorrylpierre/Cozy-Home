// Module « moteur de drapé » : transforme une simple texture de tissu en rideau plissé et suspendu.
// Rendu WebGL (maillage plissé, éclairage, reflets velours/satin, translucidité des voiles),
// avec repli Canvas 2D (mappage affine par triangles) si WebGL est indisponible.
// Module autonome : aucune dépendance. Utilisé par le présentoir (mock-ups) et les décors.

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec3 a_n;
attribute float a_ao;
uniform vec2 u_res;
varying vec2 v_uv;
varying vec3 v_n;
varying float v_ao;
void main() {
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_uv = a_uv;
  v_n = a_n;
  v_ao = a_ao;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform float u_sheen;
uniform float u_spec;
uniform float u_sheer;
uniform float u_exposure;
uniform vec3 u_ambient;
varying vec2 v_uv;
varying vec3 v_n;
varying float v_ao;
void main() {
  vec3 n = normalize(v_n);
  vec3 L = normalize(vec3(-0.5, -0.42, 0.76));
  float diff = max(dot(n, L), 0.0);
  float shade = (0.58 + 0.55 * diff) * v_ao * u_exposure;
  vec4 tex = texture2D(u_tex, v_uv);
  vec3 base = tex.rgb;
  vec3 col = base * shade * u_ambient;
  float facing = clamp(n.z, 0.0, 1.0);
  // Velours : cœur plus sombre, reflets rasants sur les crêtes.
  col *= 1.0 - u_sheen * 0.22 * facing;
  col += u_sheen * pow(1.0 - facing, 1.6) * mix(base, vec3(1.0), 0.45) * 0.75 * u_exposure;
  // Satin / jacquard : brillance spéculaire le long des plis.
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += u_spec * pow(max(dot(n, H), 0.0), 22.0) * 0.42 * u_exposure;
  // Voile : plus opaque là où le tissu est vu de biais (épaisseurs superposées).
  float a = 1.0 - pow(1.0 - u_opacity, 1.0 / max(facing, 0.28));
  col = mix(col, base * (0.92 + 0.2 * u_exposure), u_sheer * 0.35);
  a *= tex.a;
  gl_FragColor = vec4(col * a, a);
}`;

const FINISH = {
  matte: { sheen: 0, spec: 0.05, sheer: 0 },
  velvet: { sheen: 0.55, spec: 0, sheer: 0 },
  satin: { sheen: 0.08, spec: 0.55, sheer: 0 },
  sheer: { sheen: 0, spec: 0.04, sheer: 1 },
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Construit le maillage plissé d'un panneau.
 * @param {object} p panneau : { x0, x1, top, bottom, fabricWidth, side, tieback, heading, folds, seed }
 * @param {object} g options globales : { tilePx, time, sway }
 */
export function buildPanelMesh(p, g, cols = 120, rows = 64) {
  const W = p.x1 - p.x0;
  const H = p.bottom - p.top;
  const anchorLeft = p.side !== 'right';
  const N = p.folds || Math.max(2, Math.round(p.fabricWidth / (g.foldPx || 118)));
  const seed = p.seed ?? 1;
  const time = g.time || 0;
  const sway = g.sway || 0;
  const tb = p.tieback;
  const verts = (cols + 1) * (rows + 1);
  const pos = new Float32Array(verts * 2);
  const uv = new Float32Array(verts * 2);
  const nrm = new Float32Array(verts * 3);
  const ao = new Float32Array(verts);
  const zGrid = new Float32Array(verts);
  const ampGrid = new Float32Array(rows + 1);
  const spanGrid = new Float32Array((rows + 1) * 2);
  const uMax = p.fabricWidth / g.tilePx;
  const headingBand = p.heading === 'pinch' ? 0.075 : p.heading === 'rod' ? 0.05 : 0;

  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    // --- Silhouette de la ligne : embrasse, léger évasement (ligne A), balancement ---
    let xl = p.x0;
    let xr = p.x1;
    if (tb) {
      const reach = tb.reach ?? 0.3;
      const tt = tb.t ?? 0.58;
      const innerTop = anchorLeft ? p.x1 : p.x0;
      const outerTop = anchorLeft ? p.x0 : p.x1;
      const dir = anchorLeft ? 1 : -1;
      const innerTb = outerTop + dir * W * reach;
      const innerBottom = outerTop + dir * W * (reach + 0.24);
      let inner;
      let outer;
      if (t <= tt) {
        const e = Math.pow(1 - Math.cos((t / tt) * Math.PI / 2), 1.08);
        inner = lerp(innerTop, innerTb, e);
        outer = lerp(outerTop, outerTop + dir * W * 0.05, e);
      } else {
        const e2 = smoothstep(0, 1, (t - tt) / (1 - tt));
        inner = lerp(innerTb, innerBottom, Math.pow(e2, 0.75));
        outer = lerp(outerTop + dir * W * 0.05, outerTop - dir * W * 0.01, e2);
      }
      xl = Math.min(inner, outer);
      xr = Math.max(inner, outer);
    } else {
      const flare = W * 0.035 * t * t;
      xl -= anchorLeft ? flare * 0.3 : flare;
      xr += anchorLeft ? flare : flare * 0.3;
    }
    const swayX = sway * (Math.sin(time * 1.1 + t * 2.4 + seed) * 7 + Math.sin(time * 2.3 + t * 5.1 + seed * 2) * 2.2) * Math.pow(t, 1.6);
    xl += swayX;
    xr += swayX;
    const span = Math.max(4, xr - xl);
    spanGrid[j * 2] = xl;
    spanGrid[j * 2 + 1] = xr;
    const k = p.fabricWidth / span;
    let A = (span / (Math.PI * N)) * Math.sqrt(Math.max(k - 1, 0.06)) * 0.85;
    A = Math.min(A, span / N * 0.9);
    ampGrid[j] = A;
    const phi = (hash(seed) - 0.5) * 1.2 * t + sway * 0.35 * Math.sin(time * 0.8 + t * 1.7 + seed);

    // --- Profondeur des plis + longueur d'arc pour répartir le tissu ---
    const S = cols * 4;
    const zs = new Float32Array(S + 1);
    for (let s = 0; s <= S; s++) {
      const q = s / S;
      zs[s] = foldDepth(q, t, N, A, phi, seed, p.heading, headingBand);
    }
    const arc = new Float32Array(S + 1);
    const dx = span / S;
    for (let s = 1; s <= S; s++) arc[s] = arc[s - 1] + Math.hypot(dx, zs[s] - zs[s - 1]);
    const total = arc[S] || 1;

    for (let i = 0; i <= cols; i++) {
      const q = i / cols;
      const s = i * 4;
      const z = zs[s];
      const idx = j * (cols + 1) + i;
      zGrid[idx] = z;
      // Descente de l'ourlet côté intérieur quand une embrasse relève le tissu.
      let lift = 0;
      if (tb && t > (tb.t ?? 0.58)) {
        const innerW = anchorLeft ? q : 1 - q;
        lift = H * 0.05 * innerW * smoothstep(tb.t ?? 0.58, 1, t);
      }
      const hemWave = (z / (A || 1)) * H * 0.006 * Math.pow(t, 3);
      let yTop = 0;
      if (p.heading === 'rings' && t < 0.04) {
        yTop = (1 - t / 0.04) * 3.5 * Math.pow(Math.sin(Math.PI * N * q), 2);
      }
      pos[idx * 2] = xl + q * span;
      pos[idx * 2 + 1] = p.top + t * H + hemWave - lift + yTop;
      const u = (arc[s] / total) * uMax;
      uv[idx * 2] = anchorLeft ? u : uMax - u;
      uv[idx * 2 + 1] = (t * H) / g.tilePx + (p.vOffset || 0);
    }
  }

  // --- Normales et occlusion ambiante ---
  for (let j = 0; j <= rows; j++) {
    const A = ampGrid[j] || 1;
    const span = spanGrid[j * 2 + 1] - spanGrid[j * 2];
    const cellW = span / cols;
    const cellH = (p.bottom - p.top) / rows;
    const t = j / rows;
    for (let i = 0; i <= cols; i++) {
      const idx = j * (cols + 1) + i;
      const zl = zGrid[j * (cols + 1) + Math.max(0, i - 1)];
      const zr = zGrid[j * (cols + 1) + Math.min(cols, i + 1)];
      const zu = zGrid[Math.max(0, j - 1) * (cols + 1) + i];
      const zd = zGrid[Math.min(rows, j + 1) * (cols + 1) + i];
      const dzdx = (zr - zl) / (2 * cellW);
      const dzdy = (zd - zu) / (2 * cellH);
      const len = Math.hypot(dzdx, dzdy, 1);
      nrm[idx * 3] = -dzdx / len;
      nrm[idx * 3 + 1] = -dzdy / len;
      nrm[idx * 3 + 2] = 1 / len;
      const depth = (zGrid[idx] / A + 1) / 2;
      let o = 0.76 + 0.24 * Math.min(1, Math.max(0, depth));
      o *= 0.84 + 0.16 * smoothstep(0, 0.035, t); // ombre sous la tringle
      o *= 1 - 0.05 * t; // léger assombrissement vers le sol
      ao[idx] = o;
    }
  }

  const indices = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Métadonnées utiles pour la quincaillerie (œillets, anneaux, franges, embrasse).
  const peaks = [];
  for (let f = 0; f < N; f++) {
    const q = (f + 0.25) / N;
    peaks.push({ x: p.x0 + q * W, front: true });
    peaks.push({ x: p.x0 + ((f + 0.75) / N) * W, front: false });
  }
  const hem = [];
  for (let i = 0; i <= cols; i += 2) {
    const idx = rows * (cols + 1) + i;
    hem.push({ x: pos[idx * 2], y: pos[idx * 2 + 1], z: zGrid[idx] / (ampGrid[rows] || 1) });
  }
  let tiebackPoint = null;
  if (tb) {
    const jt = Math.round((tb.t ?? 0.58) * rows);
    tiebackPoint = { x0: spanGrid[jt * 2], x1: spanGrid[jt * 2 + 1], y: p.top + (tb.t ?? 0.58) * (p.bottom - p.top) };
  }
  return { pos, uv, nrm, ao, indices, cols, rows, folds: N, peaks, hem, tiebackPoint, uMax };
}

function foldDepth(q, t, N, A, phi, seed, heading, band) {
  // Plis irréguliers : espacement et profondeur légèrement variables, comme un vrai tissu.
  const warp = 0.42 * Math.sin(2 * Math.PI * q * 1.7 + seed * 1.3) + 0.22 * Math.sin(2 * Math.PI * q * 3.1 + seed * 2.1);
  const w = 2 * Math.PI * N * q + warp + phi;
  const ampMod = 0.74 + 0.26 * Math.sin(2 * Math.PI * q * 2.3 + seed * 0.7 + t * 0.9);
  let z = A * ampMod * (Math.sin(w) + 0.2 * Math.sin(2.13 * w + 1.3 + seed) + 0.08 * Math.sin(3.7 * w + seed * 3.1) * t);
  if (band > 0 && t < band * 2.2) {
    let head;
    if (heading === 'pinch') {
      // Plis pincés : triples plis serrés en tête, à plat entre deux plis.
      const local = ((N * q + 0.25) % 1 + 1) % 1;
      const d = Math.abs(local - 0.5);
      head = d < 0.14 ? A * 0.55 * Math.cos((d / 0.14) * Math.PI / 2) * (0.7 + 0.3 * Math.cos(d * 70)) : -A * 0.08;
    } else {
      // Passe-tringle : fronces fines et serrées.
      head = A * 0.3 * Math.sin(2 * Math.PI * N * 3.3 * q + seed);
    }
    const m = smoothstep(band, band * 2.2, t);
    z = lerp(head, z, m);
  }
  return z;
}

// ---------------------------------------------------------------------------
// Préparation des textures (tuile carrée puissance de 2, avec cache).
const texCache = new WeakMap();

/** Convertit une image source en tuile carrée POT (512 ou 1024). */
export function toTile(source, size = 512) {
  if (texCache.has(source)) return texCache.get(source);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  const side = Math.min(sw, sh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, size, size);
  texCache.set(source, c);
  return c;
}

/** Couleur moyenne d'une texture (franges, pattes, repli). */
export function averageColor(source) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ---------------------------------------------------------------------------
export class DrapeEngine {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = null;
    try {
      this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true, alpha: true })
        || this.canvas.getContext('experimental-webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
    } catch { this.gl = null; }
    if (this.gl) this.#initGL();
    this.textures = new WeakMap();
  }

  static shared() {
    if (!DrapeEngine._shared) DrapeEngine._shared = new DrapeEngine();
    return DrapeEngine._shared;
  }

  get supportsWebGL() {
    return !!this.gl;
  }

  #initGL() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.loc = {
        pos: gl.getAttribLocation(prog, 'a_pos'),
        uv: gl.getAttribLocation(prog, 'a_uv'),
        n: gl.getAttribLocation(prog, 'a_n'),
        ao: gl.getAttribLocation(prog, 'a_ao'),
        res: gl.getUniformLocation(prog, 'u_res'),
        tex: gl.getUniformLocation(prog, 'u_tex'),
        opacity: gl.getUniformLocation(prog, 'u_opacity'),
        sheen: gl.getUniformLocation(prog, 'u_sheen'),
        spec: gl.getUniformLocation(prog, 'u_spec'),
        sheer: gl.getUniformLocation(prog, 'u_sheer'),
        exposure: gl.getUniformLocation(prog, 'u_exposure'),
        ambient: gl.getUniformLocation(prog, 'u_ambient'),
      };
      this.buffers = { pos: gl.createBuffer(), uv: gl.createBuffer(), n: gl.createBuffer(), ao: gl.createBuffer(), idx: gl.createBuffer() };
      this.anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      this.uint32 = gl.getExtension('OES_element_index_uint');
    } catch (err) {
      console.warn('[drapé] WebGL indisponible, repli 2D :', err.message);
      this.gl = null;
    }
  }

  #texture(tile, wrap) {
    const gl = this.gl;
    const key = tile;
    let entry = this.textures.get(key);
    if (!entry) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (this.anisotropic) gl.texParameterf(gl.TEXTURE_2D, this.anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      entry = { tex };
      this.textures.set(key, entry);
    }
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    const mode = wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode);
    return entry.tex;
  }

  /**
   * Rend un ou plusieurs panneaux dans un canvas transparent de width × height (px réels).
   * @returns {{canvas: HTMLCanvasElement, meshes: object[]}}
   */
  render(opts) {
    const { width, height, panels } = opts;
    const tile = toTile(opts.texture);
    const g = { tilePx: opts.tilePx || 120, time: opts.time || 0, sway: opts.sway || 0, foldPx: opts.foldPx };
    const finish = FINISH[opts.finish] || FINISH.matte;
    const quality = opts.quality || 1;
    const meshes = panels.map((p, i) => buildPanelMesh({ seed: i + 1, ...p }, g,
      Math.round(Math.min(160, Math.max(48, (p.x1 - p.x0) / 2.4)) * quality), Math.round(64 * quality)));

    if (!this.gl) return { canvas: this.#render2D(opts, tile, meshes, finish), meshes };

    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    this.#texture(tile, opts.wrap);
    gl.uniform1i(this.loc.tex, 0);
    gl.uniform2f(this.loc.res, width, height);
    gl.uniform1f(this.loc.opacity, Math.min(1, Math.max(0.05, opts.opacity ?? 1)));
    gl.uniform1f(this.loc.sheen, finish.sheen);
    gl.uniform1f(this.loc.spec, finish.spec);
    gl.uniform1f(this.loc.sheer, finish.sheer);
    gl.uniform1f(this.loc.exposure, opts.exposure ?? 1);
    const amb = opts.ambient || [1, 1, 1];
    gl.uniform3f(this.loc.ambient, amb[0], amb[1], amb[2]);

    const bind = (buf, loc, data, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    for (const m of meshes) {
      bind(this.buffers.pos, this.loc.pos, m.pos, 2);
      bind(this.buffers.uv, this.loc.uv, m.uv, 2);
      bind(this.buffers.n, this.loc.n, m.nrm, 3);
      bind(this.buffers.ao, this.loc.ao, m.ao, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.idx);
      const big = m.pos.length / 2 > 65535;
      const idx = big && this.uint32 ? new Uint32Array(m.indices) : new Uint16Array(m.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, idx.length, big && this.uint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }
    return { canvas: this.canvas, meshes };
  }

  // Repli Canvas 2D : chaque triangle du maillage reçoit la texture par transformation affine.
  #render2D(opts, tile, meshes, finish) {
    const out = document.createElement('canvas');
    out.width = opts.width;
    out.height = opts.height;
    const ctx = out.getContext('2d');
    const T = 128;
    const exposure = opts.exposure ?? 1;
    const L = [-0.5, -0.42, 0.76];
    const Ll = Math.hypot(...L);
    for (const m of meshes) {
      // Atlas : la texture répétée sur toute l'étendue du panneau.
      let vMax = 0;
      for (let i = 1; i < m.uv.length; i += 2) vMax = Math.max(vMax, m.uv[i]);
      const aw = Math.ceil(m.uMax + 1) * T;
      const ah = Math.ceil(vMax + 1) * T;
      const atlas = document.createElement('canvas');
      atlas.width = Math.min(4096, aw);
      atlas.height = Math.min(4096, ah);
      const actx = atlas.getContext('2d');
      for (let y = 0; y * T < atlas.height; y++) {
        for (let x = 0; x * T < atlas.width; x++) {
          actx.save();
          actx.translate(x * T, y * T);
          if (opts.wrap === 'mirror') {
            actx.translate(x % 2 ? T : 0, y % 2 ? T : 0);
            actx.scale(x % 2 ? -1 : 1, y % 2 ? -1 : 1);
          }
          actx.drawImage(tile, 0, 0, T, T);
          actx.restore();
        }
      }
      const step = 3; // sous-échantillonnage du maillage pour la vitesse
      const cols = m.cols;
      const at = (i, j) => j * (cols + 1) + i;
      ctx.globalAlpha = Math.min(1, opts.opacity ?? 1);
      for (let j = 0; j < m.rows; j += step) {
        for (let i = 0; i < cols; i += step) {
          const i2 = Math.min(cols, i + step);
          const j2 = Math.min(m.rows, j + step);
          const quad = [at(i, j), at(i2, j), at(i, j2), at(i2, j2)];
          for (const tri of [[quad[0], quad[1], quad[2]], [quad[1], quad[3], quad[2]]]) {
            drawTri(ctx, atlas, m, tri, T);
          }
          // Ombrage du quadrilatère.
          const k = quad[0];
          const d = (m.nrm[k * 3] * L[0] + m.nrm[k * 3 + 1] * L[1] + m.nrm[k * 3 + 2] * L[2]) / Ll;
          const shade = (0.58 + 0.55 * Math.max(0, d)) * m.ao[k] * exposure;
          ctx.save();
          ctx.globalAlpha = Math.min(1, opts.opacity ?? 1) * Math.min(0.6, Math.abs(1 - shade));
          ctx.fillStyle = shade < 1 ? '#000' : '#fff';
          ctx.beginPath();
          ctx.moveTo(m.pos[quad[0] * 2], m.pos[quad[0] * 2 + 1]);
          ctx.lineTo(m.pos[quad[1] * 2] + 0.5, m.pos[quad[1] * 2 + 1]);
          ctx.lineTo(m.pos[quad[3] * 2] + 0.5, m.pos[quad[3] * 2 + 1] + 0.5);
          ctx.lineTo(m.pos[quad[2] * 2], m.pos[quad[2] * 2 + 1] + 0.5);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
    return out;
  }
}

function drawTri(ctx, atlas, m, [a, b, c], T) {
  const x0 = m.pos[a * 2], y0 = m.pos[a * 2 + 1];
  const x1 = m.pos[b * 2], y1 = m.pos[b * 2 + 1];
  const x2 = m.pos[c * 2], y2 = m.pos[c * 2 + 1];
  const u0 = m.uv[a * 2] * T, v0 = m.uv[a * 2 + 1] * T;
  const u1 = m.uv[b * 2] * T, v1 = m.uv[b * 2 + 1] * T;
  const u2 = m.uv[c * 2] * T, v2 = m.uv[c * 2 + 1] * T;
  const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (!den) return;
  const A = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den;
  const C = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den;
  const E = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / den;
  const B = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den;
  const D = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den;
  const F = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / den;
  // Triangle légèrement dilaté pour masquer les jointures.
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  const grow = (x, y) => [x + Math.sign(x - cx) * 0.6, y + Math.sign(y - cy) * 0.6];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...grow(x0, y0));
  ctx.lineTo(...grow(x1, y1));
  ctx.lineTo(...grow(x2, y2));
  ctx.closePath();
  ctx.clip();
  ctx.transform(A, B, C, D, E, F);
  ctx.drawImage(atlas, 0, 0);
  ctx.restore();
}

export default DrapeEngine;
