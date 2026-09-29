// Tissus de démonstration « Cozy Home by Fany » — tuiles procédurales raccordables.
//
// Chaque entrée de FABRICS expose draw(ctx, size) qui peint, dans le carré [0,size]² du canvas
// (coordonnées en pixels, transformation courante ignorée), une tuile PARFAITEMENT raccordable.
// Échelle : 512 px ≈ 30 cm de tissu. Canvas 2D pur, aucune dépendance, rendu déterministe.
// Le carré est entièrement remplacé (pixels opaques) ; l'état du contexte de l'appelant (transform,
// alpha, mode de composition…) est préservé. Le rendu relit les pixels (getImageData) : créer le
// contexte avec getContext('2d', { willReadFrequently: true }) est conseillé.
//
// Principes :
//  - tout ce qui est aléatoire provient de mulberry32 / hash entiers à graine fixe ;
//  - les bruits sont périodiques (réseau de gradients bouclé) donc raccordables par construction ;
//  - les motifs vectoriels sont dessinés dans un repère « design » 512×512 mis à l'échelle, et chaque
//    élément qui touche un bord est redessiné décalé de ±512 (wrap) ;
//  - l'armure du tissage est calculée pixel par pixel (fils de chaîne/trame, flammes, fibres) puis
//    appliquée en multiplication sur l'impression, comme une vraie impression sur étoffe.

const D = 512; // unité de dessin (design units) = une tuile
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Aléatoire déterministe
// ---------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Bruit de gradient périodique (Perlin bouclé) et fBm
// ---------------------------------------------------------------------------------------------
function makeNoise(px, py, seed) {
  const n = px * py;
  const gx = new Float32Array(n), gy = new Float32Array(n);
  const r = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU;
    gx[k] = Math.cos(a);
    gy[k] = Math.sin(a);
  }
  // x ∈ [0,px), y ∈ [0,py) en unités de réseau (toute valeur réelle est repliée)
  return function (x, y) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    xi %= px; if (xi < 0) xi += px;
    yi %= py; if (yi < 0) yi += py;
    const x1 = xi + 1 === px ? 0 : xi + 1, y1 = yi + 1 === py ? 0 : yi + 1;
    const r0 = yi * px, r1 = y1 * px;
    const a = gx[r0 + xi] * fx + gy[r0 + xi] * fy;
    const b = gx[r0 + x1] * (fx - 1) + gy[r0 + x1] * fy;
    const c = gx[r1 + xi] * fx + gy[r1 + xi] * (fy - 1);
    const d = gx[r1 + x1] * (fx - 1) + gy[r1 + x1] * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const ab = a + u * (b - a), cd = c + u * (d - c);
    return (ab + v * (cd - ab)) * 1.45;
  };
}

// Pile d'octaves réutilisable : renvoie f(u,v) pour u,v en fraction de tuile.
function makeFbm(o) {
  const fx = o.fx, fy = o.fy ?? o.fx, oct = o.oct ?? 4, gain = o.gain ?? 0.5, lac = o.lac ?? 2;
  const seed = o.seed ?? 1, ridge = !!o.ridge;
  const ns = [], ps = [], qs = [], as = [];
  let amp = 1, norm = 0;
  for (let k = 0; k < oct; k++) {
    const px = Math.max(1, Math.round(fx * Math.pow(lac, k)));
    const py = Math.max(1, Math.round(fy * Math.pow(lac, k)));
    ns.push(makeNoise(px, py, seed * 7919 + k * 131 + 3));
    ps.push(px); qs.push(py); as.push(amp);
    norm += amp; amp *= gain;
  }
  const inv = 1 / norm;
  return function (u, v) {
    let s = 0;
    for (let k = 0; k < ns.length; k++) {
      let n = ns[k](u * ps[k], v * qs[k]);
      if (ridge) n = 1 - 2 * Math.abs(n);
      s += as[k] * n;
    }
    return s * inv;
  };
}

// Champ fBm S×S raccordable (calculé à basse résolution puis interpolé si possible).
function fbm(S, o) {
  const fx = o.fx, fy = o.fy ?? o.fx, oct = o.oct ?? 4, lac = o.lac ?? 2;
  const maxF = Math.max(fx, fy) * Math.pow(lac, oct - 1);
  const R = Math.min(S, Math.max(8, Math.ceil(maxF * (o.q ?? 4))));
  const f = makeFbm(o);
  const out = new Float32Array(R * R);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) / R;
    for (let x = 0; x < R; x++) out[y * R + x] = f((x + 0.5) / R, v);
  }
  return R === S ? out : upsample(out, R, S);
}

function upsample(src, R, S) {
  const out = new Float32Array(S * S);
  const k = R / S;
  const X0 = new Int32Array(S), X1 = new Int32Array(S), TX = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const sx = (x + 0.5) * k - 0.5;
    let x0 = Math.floor(sx);
    TX[x] = sx - x0;
    X1[x] = (x0 + 1 + R) % R;
    X0[x] = (x0 + R) % R;
  }
  for (let y = 0; y < S; y++) {
    const r0 = X0[y] * R, r1 = X1[y] * R, ty = TX[y];
    for (let x = 0; x < S; x++) {
      const a = src[r0 + X0[x]], b = src[r0 + X1[x]], c = src[r1 + X0[x]], d = src[r1 + X1[x]];
      const tx = TX[x];
      const ab = a + (b - a) * tx, cd = c + (d - c) * tx;
      out[y * S + x] = ab + (cd - ab) * ty;
    }
  }
  return out;
}

// Flou boîte séparable (≈ gaussien après 2-3 passes) avec repli sur les bords : garde le raccord.
function blurWrap(src, S, r, passes = 2) {
  r = Math.max(1, Math.round(r));
  let a = Float32Array.from(src);
  const b = new Float32Array(S * S);
  const inv = 1 / (2 * r + 1);
  const w = (i) => ((i % S) + S) % S;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < S; y++) {
      const row = y * S;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + w(k)];
      for (let x = 0; x < S; x++) {
        b[row + x] = s * inv;
        s += a[row + w(x + r + 1)] - a[row + w(x - r)];
      }
    }
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[w(k) * S + x];
      for (let y = 0; y < S; y++) {
        a[y * S + x] = s * inv;
        s += b[w(y + r + 1) * S + x] - b[w(y - r) * S + x];
      }
    }
  }
  return a;
}

function shiftWrap(src, S, dx, dy) {
  const out = new Float32Array(S * S);
  dx = Math.round(dx); dy = Math.round(dy);
  for (let y = 0; y < S; y++) {
    const sy = (((y - dy) % S) + S) % S;
    for (let x = 0; x < S; x++) out[y * S + x] = src[sy * S + ((((x - dx) % S) + S) % S)];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Couleurs & utilitaires
// ---------------------------------------------------------------------------------------------
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function css(c, a = 1) {
  const r = Math.min(255, c[0] | 0), g = Math.min(255, c[1] | 0), b = Math.min(255, c[2] | 0);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
function shade(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
// Bruit 1D périodique (période 1) : somme d'harmoniques entières → raccord garanti.
function harmonics(seed, kmin = 2, kmax = 24) {
  const r = mulberry32(seed);
  const ks = [], as = [], ps = [];
  let n = 0;
  for (let k = kmin; k <= kmax; k++) {
    const a = (0.5 + r()) / Math.sqrt(k);
    ks.push(k); as.push(a); ps.push(r() * TAU);
    n += a * a;
  }
  const inv = 1 / Math.sqrt(n * 0.5);
  return (t) => {
    let s = 0;
    for (let i = 0; i < ks.length; i++) s += as[i] * Math.sin(TAU * ks[i] * t + ps[i]);
    return s * inv;
  };
}
function ihash(a, b = 0) {
  return (hash(a, b, 911) * 4294967296) >>> 0;
}
function smooth(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// État de dessin neutre (indépendant de l'état laissé par l'appelant), repère design 512 → S px.
function resetState(ctx, S) {
  ctx.setTransform(S / D, 0, 0, S / D, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Prépare le contexte : dessin en unités design (512) sur fond optionnel, puis relit les pixels.
function drawLayer(ctx, S, bg, fn) {
  ctx.save();
  resetState(ctx, S);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.setTransform(S / D, 0, 0, S / D, 0, 0);
  fn(ctx);
  ctx.restore();
  return ctx.getImageData(0, 0, S, S).data;
}

// Écrit un tampon RGB flottant (0..255) avec un très léger grain (tramage anti-banding).
function put(ctx, S, rgb, grain = 1.2, seed = 1) {
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let p = 0, q = 0; p < S * S; p++, q += 4) {
    const n = (hash(p % S, (p / S) | 0, seed) - 0.5) * 2 * grain;
    d[q] = rgb[p * 3] + n;
    d[q + 1] = rgb[p * 3 + 1] + n;
    d[q + 2] = rgb[p * 3 + 2] + n;
    d[q + 3] = 255;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  ctx.restore();
}

// Ramène la moyenne d'un tampon RGB vers une couleur cible (amount 0..1).
function matchMean(buf, target, amount = 1) {
  const n = buf.length / 3;
  let r = 0, g = 0, b = 0;
  for (let p = 0; p < buf.length; p += 3) { r += buf[p]; g += buf[p + 1]; b += buf[p + 2]; }
  r /= n; g /= n; b /= n;
  const kr = 1 + (target[0] / r - 1) * amount, kg = 1 + (target[1] / g - 1) * amount, kb = 1 + (target[2] / b - 1) * amount;
  for (let p = 0; p < buf.length; p += 3) { buf[p] *= kr; buf[p + 1] *= kg; buf[p + 2] *= kb; }
}

// Dessine fn à la position (x,y) de rayon englobant r, et ses copies décalées de ±512 si l'élément
// déborde : la tuile reste raccordable. fn doit être déterministe (pas de PRNG partagé consommé).
function wrap(ctx, x, y, r, fn) {
  for (let ox = -D; ox <= D; ox += D) {
    for (let oy = -D; oy <= D; oy += D) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > D || cy + r < 0 || cy - r > D) continue;
      ctx.save();
      ctx.translate(ox, oy);
      fn(ctx);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Armure : moteur de tissage pixel par pixel
// ---------------------------------------------------------------------------------------------
const PLAIN = [[1, 0], [0, 1]];

// Profils de fils : demi-épaisseur le long du fil (flammes/slubs) + ton.
function threadProfiles(n, L, w, o, rng) {
  const hw = new Float32Array(n * L), tone = new Float32Array(n * L);
  const noiseAmp = o.noise ?? 0.06, slubRate = o.slubs ?? 0, slubAmp = o.slubAmp ?? 0.5;
  const slubLen = o.slubLen ?? 0.04, jit = o.jit ?? 0.06, toneJit = o.tone ?? 0.05, slubTone = o.slubTone ?? 0;
  const tmp = new Float32Array(L);
  // tables d'harmoniques : sin(2πks/L + φ) = sin·cos φ + cos·sin φ (évite L×6 appels trigonométriques par fil)
  const SN = new Float32Array(6 * L), CS = new Float32Array(6 * L);
  for (let k = 1; k <= 6; k++) for (let s = 0; s < L; s++) {
    SN[(k - 1) * L + s] = Math.sin((TAU * k * s) / L);
    CS[(k - 1) * L + s] = Math.cos((TAU * k * s) / L);
  }
  for (let t = 0; t < n; t++) {
    const base = w * (1 + (rng() * 2 - 1) * jit);
    const tb = 1 + (rng() * 2 - 1) * toneJit;
    tmp.fill(0);
    for (let k = 1; k <= 6; k++) {
      const a = (0.4 + 0.6 * rng()) / k, ph = rng() * TAU, ca = a * Math.cos(ph), sa = a * Math.sin(ph);
      const o0 = (k - 1) * L;
      for (let s = 0; s < L; s++) tmp[s] += SN[o0 + s] * ca + CS[o0 + s] * sa;
    }
    const cnt = Math.floor(rng() * (2 * slubRate + 1));
    const sl = [];
    for (let c = 0; c < cnt; c++) {
      sl.push([rng(), slubLen * (0.4 + 1.2 * rng()), slubAmp * (0.35 + 0.9 * rng()) * (rng() < 0.18 ? -0.45 : 1)]);
    }
    for (let s = 0; s < L; s++) {
      const pos = s / L;
      let bump = 0;
      for (let c = 0; c < sl.length; c++) {
        let d = Math.abs(pos - sl[c][0]);
        if (d > 0.5) d = 1 - d;
        const q = d / sl[c][1];
        if (q < 3) bump += sl[c][2] * Math.exp(-q * q * 2.2);
      }
      const v = noiseAmp * tmp[s] * 0.6 + bump;
      hw[t * L + s] = Math.min(0.64, Math.max(0.1, base * (1 + v)));
      tone[t * L + s] = tb * (1 + slubTone * bump + 0.3 * noiseAmp * tmp[s]);
    }
  }
  return { hw, tone };
}

function zprof(f, sP, sC, sN) {
  if (f < 0.5) {
    const t = f * 2, s = t * t * (3 - 2 * t), b = (sP + sC) * 0.5;
    return b + (sC - b) * s;
  }
  const t = (f - 0.5) * 2, s = t * t * (3 - 2 * t), b = (sC + sN) * 0.5;
  return sC + (b - sC) * s;
}

/*
  weave(S, o) → Float32Array RGB (S*S*3)
  o.nx / o.ny      : nombre de fils de chaîne (verticaux) / trame (horizontaux) par tuile
  o.warpW / weftW  : demi-épaisseur des fils (fraction du pas)
  o.warp / o.weft  : { noise, slubs, slubAmp, slubLen, jit, tone, slubTone }
  o.rep            : rapport d'armure (1 = chaîne dessus)
  o.warpColor      : Float32Array nx*L*3 (L = o.warpColorL, couleur le long du fil) sinon blanc (=1)
  o.weftColor      : idem trame ; o.gapColor : couleur des jours
  o.kBase/kProf/kZ/kDir/kFib/gap : paramètres d'éclairage
  o.wave / waveF   : ondulation des fils ; o.dispX/dispY : déplacement supplémentaire (en pas de fil)
*/
function weave(S, o) {
  const nx = o.nx, ny = o.ny ?? o.nx;
  const pitch = Math.min(S / nx, S / ny);
  const ss = o.ss ?? Math.max(1, Math.min(3, Math.ceil(4.2 / pitch)));
  const jit = o.jitter ?? (ss === 1 && pitch < 3.8 ? 0.85 : 0);
  const R = S * ss;
  const seed = o.seed ?? 1;
  const rng = mulberry32(seed * 9973 + 17);
  const L = 128;
  const W = threadProfiles(nx, L, o.warpW ?? 0.42, o.warp ?? {}, rng);
  const F = threadProfiles(ny, L, o.weftW ?? 0.42, o.weft ?? {}, rng);
  const rep = o.rep ?? PLAIN, pr = rep.length, pc = rep[0].length;
  const repA = new Int8Array(pr * pc);
  for (let r = 0; r < pr; r++) for (let c = 0; c < pc; c++) repA[r * pc + c] = rep[r][c] ? 1 : -1;
  const wav = o.wave ?? 0.14;
  // ondulation douce des fils : calculée à la résolution de sortie (lisse, inutile de sur-échantillonner)
  const dX = wav > 0 ? fbm(S, { fx: o.waveF ?? 6, oct: 3, seed: seed + 11 }) : null;
  const dY = wav > 0 ? fbm(S, { fx: o.waveF ?? 6, oct: 3, seed: seed + 12 }) : null;
  let dispX = o.dispX, dispY = o.dispY;
  if (o.dispFn) [dispX, dispY] = o.dispFn(R);
  const wc = o.warpColor, wcL = o.warpColorL ?? 1, fc = o.weftColor, fcL = o.weftColorL ?? 1;
  const gc = o.gapColor ?? [1, 1, 1];
  const U = o.undul ?? 0.7, kB = o.kBase ?? 0.5, kP = o.kProf ?? 0.36, kZ = o.kZ ?? 0.2;
  const kD = o.kDir ?? 0.06, kF = o.kFib ?? 0.12, gapS = o.gap ?? 0.35, fibF = o.fibF ?? 1.3;
  const fs = seed * 31 + 7;
  const fibNy = Math.max(1, Math.round(ny * fibF)), fibNx = Math.max(1, Math.round(nx * fibF));
  // table de bruit des fibres (indexée par fil × segment : périodique par construction)
  const FT = new Float32Array(8192);
  for (let k = 0; k < 8192; k++) FT[k] = hash(k, fs, 3) - 0.5;
  const acc = new Float32Array(S * S * 3);
  const inv = 1 / (ss * ss);
  for (let py = 0; py < R; py++) {
    const v0 = ((py + 0.5) / R) * ny;
    const orow = ((py / ss) | 0) * S;
    for (let px = 0; px < R; px++) {
      const p = py * R + px;
      let X = ((px + 0.5) / R) * nx, Y = v0;
      const ps = orow + ((px / ss) | 0);
      if (jit) {
        const hj = hash(px, py, 5);
        X += (hj - 0.5) * jit * (nx / R);
        Y += (((hj * 65536) % 1) - 0.5) * jit * (ny / R);
      }
      if (dX) { X += dX[ps] * wav; Y += dY[ps] * wav; }
      if (dispX) { X += dispX[p]; Y += dispY[p]; }
      const xf = Math.floor(X), yf = Math.floor(Y);
      const fx = X - xf, fy = Y - yf;
      let i = xf % nx; if (i < 0) i += nx;
      let j = yf % ny; if (j < 0) j += ny;
      let ua = X / nx; ua -= Math.floor(ua);
      let va = Y / ny; va -= Math.floor(va);
      // profils le long des fils
      const sw = va * L, sw0 = sw | 0, swt = sw - sw0, sw1 = sw0 + 1 === L ? 0 : sw0 + 1;
      const kw0 = i * L + sw0, kw1 = i * L + sw1;
      const hwW = W.hw[kw0] + (W.hw[kw1] - W.hw[kw0]) * swt;
      const sf = ua * L, sf0 = sf | 0, sft = sf - sf0, sf1 = sf0 + 1 === L ? 0 : sf0 + 1;
      const kf0 = j * L + sf0, kf1 = j * L + sf1;
      const hwF = F.hw[kf0] + (F.hw[kf1] - F.hw[kf0]) * sft;
      const dxW = fx - 0.5, dyF = fy - 0.5;
      const aW = 1 - (dxW * dxW) / (hwW * hwW), aF = 1 - (dyF * dyF) / (hwF * hwF);
      const jr = (j % pr) * pc, ic = i % pc;
      const sC = repA[jr + ic];
      let hW = -9, hF = -9, zW = 0, zF = 0;
      if (aW > 0) {
        const sP = repA[(((j - 1) % pr + pr) % pr) * pc + ic], sN = repA[((j + 1) % pr) * pc + ic];
        zW = zprof(fy, sP, sC, sN);
        hW = U * zW + Math.sqrt(aW);
      }
      if (aF > 0) {
        const tP = -repA[jr + (((i - 1) % pc) + pc) % pc], tN = -repA[jr + (i + 1) % pc];
        zF = zprof(fx, tP, -sC, tN);
        hF = U * zF + Math.sqrt(aF);
      }
      let sh, cr, cg, cb;
      if (hW > -5 && hW >= hF) {
        const prof = Math.sqrt(aW);
        const tone = W.tone[kw0] + (W.tone[kw1] - W.tone[kw0]) * swt;
        const lane = (fx * 3) | 0;
        const fy2 = va * fibNy, fb = Math.floor(fy2), ft = fy2 - fb;
        const b0 = (i * 3 + lane) * fibNy;
        const h0 = FT[(b0 + fb) & 8191], h1 = FT[(b0 + (fb + 1 === fibNy ? 0 : fb + 1)) & 8191];
        const fib = h0 + (h1 - h0) * ft;
        sh = tone * (kB + kP * prof + kZ * (zW + 1) * 0.5 - kD * (dxW / hwW)) * (1 + kF * fib);
        if (wc) {
          const k = wcL === 1 ? i * 3 : (i * wcL + ((va * wcL) | 0)) * 3;
          cr = wc[k]; cg = wc[k + 1]; cb = wc[k + 2];
        } else { cr = cg = cb = 1; }
      } else if (hF > -5) {
        const prof = Math.sqrt(aF);
        const tone = F.tone[kf0] + (F.tone[kf1] - F.tone[kf0]) * sft;
        const lane = (fy * 3) | 0;
        const fx2 = ua * fibNx, fb = Math.floor(fx2), ft = fx2 - fb;
        const b0 = (j * 3 + lane) * fibNx + 4096;
        const h0 = FT[(b0 + fb) & 8191], h1 = FT[(b0 + (fb + 1 === fibNx ? 0 : fb + 1)) & 8191];
        const fib = h0 + (h1 - h0) * ft;
        sh = tone * (kB + kP * prof + kZ * (zF + 1) * 0.5 - kD * (dyF / hwF)) * (1 + kF * fib);
        if (fc) {
          const k = fcL === 1 ? j * 3 : (j * fcL + ((ua * fcL) | 0)) * 3;
          cr = fc[k]; cg = fc[k + 1]; cb = fc[k + 2];
        } else { cr = cg = cb = 1; }
      } else {
        sh = gapS;
        cr = gc[0]; cg = gc[1]; cb = gc[2];
      }
      const q = ps * 3;
      acc[q] += cr * sh * inv;
      acc[q + 1] += cg * sh * inv;
      acc[q + 2] += cb * sh * inv;
    }
  }
  if (o.normalize !== false && !wc && !fc) {
    let m = 0;
    for (let p = 0; p < acc.length; p += 3) m += acc[p];
    m /= S * S;
    const k = (o.mean ?? 1) / m;
    for (let p = 0; p < acc.length; p++) acc[p] *= k;
  }
  return acc;
}

// Carte de couleurs par fil (constante le long du fil) : n*3 flottants.
function threadColors(n, fn) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = fn(i);
    a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2];
  }
  return a;
}

// Fibres folles (duvet) dessinées en surface, raccordées.
function drawHairs(ctx, S, n, col, alpha, seed, len = 10, width = 0.6) {
  const rng = mulberry32(seed);
  const items = [];
  for (let k = 0; k < n; k++) {
    items.push([rng() * D, rng() * D, rng() * TAU, len * (0.4 + rng()), (rng() - 0.5) * 1.6, alpha * (0.4 + 0.6 * rng())]);
  }
  ctx.save();
  resetState(ctx, S);
  ctx.lineWidth = width;
  for (const [x, y, a, l, bend, al] of items) {
    wrap(ctx, x, y, l + 2, (c) => {
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      c.strokeStyle = css(col, al);
      c.beginPath();
      c.moveTo(x - dx / 2, y - dy / 2);
      c.quadraticCurveTo(x - dy * bend * 0.3, y + dx * bend * 0.3, x + dx / 2, y + dy / 2);
      c.stroke();
    });
  }
  ctx.restore();
}

// Tissu imprimé : fond + impression vectorielle, multipliée par l'armure et une marbrure douce.
function printed(ctx, S, o) {
  const P = drawLayer(ctx, S, o.ground, o.draw);
  const W = weave(S, o.weave);
  const M = fbm(S, { fx: 3, oct: 5, seed: (o.seed ?? 1) + 101 });
  const mot = o.mottle ?? 0.03;
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = 1 + M[p] * mot;
    const q = p * 3, q4 = p * 4;
    out[q] = P[q4] * W[q] * m;
    out[q + 1] = P[q4 + 1] * W[q + 1] * m;
    out[q + 2] = P[q4 + 2] * W[q + 2] * m;
  }
  if (o.post) o.post(out, P, W);
  put(ctx, S, out, 1.2, o.seed ?? 1);
}

// Composition « relief » : un calque vectoriel (broderie, cordes) posé sur un fond calculé, avec
// ombre portée floue, bombé (éclairage par gradient d'une hauteur floutée) et raccord par repli.
function composeRelief(ctx, S, ground, fn, o = {}) {
  const k = S / D;
  const E = drawLayer(ctx, S, null, fn);
  const A = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) A[p] = E[p * 4 + 3] / 255;
  const H = blurWrap(A, S, (o.puff ?? 2.2) * k, 2);
  const sh = blurWrap(shiftWrap(A, S, (o.sx ?? 1.6) * k, (o.sy ?? 2.4) * k), S, (o.blur ?? 2.4) * k, 2);
  const lx = -0.55, ly = -0.75, kr = (o.relief ?? 1.6) / Math.max(k, 0.5);
  const shadowAmt = o.shadow ?? 0.35, edgeK = o.edge ?? 0.16, spec = o.spec ?? 0.15;
  const out = new Float32Array(S * S * 3);
  const XP = new Int32Array(S), XM = new Int32Array(S);
  for (let x = 0; x < S; x++) { XP[x] = (x + 1) % S; XM[x] = (x - 1 + S) % S; }
  for (let y = 0; y < S; y++) {
    const yu = XM[y] * S, yd = XP[y] * S, row = y * S;
    for (let x = 0; x < S; x++) {
      const p = row + x;
      const a = A[p];
      const gs = 1 - shadowAmt * sh[p] * (1 - a * 0.85);
      let r = ground[p * 3] * gs, g = ground[p * 3 + 1] * gs, b = ground[p * 3 + 2] * gs;
      if (a > 0.003) {
        const gx = H[row + XP[x]] - H[row + XM[x]];
        const gy = H[yd + x] - H[yu + x];
        let lam = -(gx * lx + gy * ly) * kr;
        lam = lam < -0.3 ? -0.3 : lam > 0.3 ? 0.3 : lam;
        const edge = 1 - edgeK + edgeK * Math.min(1, H[p] * 1.4);
        const f = edge * (1 + lam) + spec * (lam > 0 ? lam : 0);
        const q4 = p * 4;
        r += (E[q4] * f - r) * a;
        g += (E[q4 + 1] * f - g) * a;
        b += (E[q4 + 2] * f - b) * a;
      }
      out[p * 3] = r; out[p * 3 + 1] = g; out[p * 3 + 2] = b;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tissus
// ---------------------------------------------------------------------------------------------

function drawVoile(ctx, S) {
  const base = hex('#F3EDE2');
  const W = weave(S, {
    nx: 230, ny: 200, seed: 3, warpW: 0.34, weftW: 0.27,
    warp: { noise: 0.25, slubs: 0.5, slubAmp: 0.45, slubLen: 0.05, jit: 0.2, tone: 0.05 },
    weft: { noise: 0.15, jit: 0.1, tone: 0.025 },
    kBase: 0.86, kProf: 0.12, kZ: 0.05, kFib: 0.05, gap: 1.03, wave: 0.2, undul: 0.4, ss: S < 700 ? 2 : 1,
  });
  const cloud = fbm(S, { fx: 4, fy: 3, oct: 5, seed: 31 });
  const streak = fbm(S, { fx: 48, fy: 2, oct: 2, seed: 32 });
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = W[p * 3] * (1 + cloud[p] * 0.018 + streak[p] * 0.012);
    out[p * 3] = base[0] * m; out[p * 3 + 1] = base[1] * m; out[p * 3 + 2] = base[2] * m;
  }
  matchMean(out, base, 1);
  put(ctx, S, out, 0.8, 3);
}

function drawLin(ctx, S) {
  const base = hex('#D6C3A1');
  const rng = mulberry32(55);
  const nx = 118, ny = 106;
  const light = hex('#E4D4B6'), dark = hex('#C4AE88'), grey = hex('#CBBDA3');
  const tc = (n) => threadColors(n, () => {
    const t = rng();
    let c = mix(dark, light, t);
    if (rng() < 0.18) c = mix(c, grey, 0.5 + 0.5 * rng());
    return shade(c, 1 / 255);
  });
  const W = weave(S, {
    nx, ny, seed: 5, warpW: 0.4, weftW: 0.43,
    warp: { noise: 0.3, slubs: 0.9, slubAmp: 0.55, slubLen: 0.05, jit: 0.12, tone: 0.07, slubTone: 0.12 },
    weft: { noise: 0.35, slubs: 1.3, slubAmp: 0.7, slubLen: 0.07, jit: 0.16, tone: 0.08, slubTone: 0.14 },
    warpColor: tc(nx), weftColor: tc(ny), gapColor: [0.45, 0.38, 0.28],
    kBase: 0.52, kProf: 0.42, kZ: 0.22, kFib: 0.16, gap: 0.8, wave: 0.18, undul: 0.75,
  });
  const cloud = fbm(S, { fx: 3, oct: 5, seed: 56 });
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = 255 * (1 + cloud[p] * 0.035);
    out[p * 3] = W[p * 3] * m; out[p * 3 + 1] = W[p * 3 + 1] * m; out[p * 3 + 2] = W[p * 3 + 2] * m;
  }
  matchMean(out, base, 1);
  put(ctx, S, out, 1.2, 5);
  drawHairs(ctx, S, 90, hex('#EFE3CB'), 0.35, 57, 9, 0.55);
}

function drawVelvet(ctx, S, o) {
  const target = hex(o.color);
  const R = Math.min(S, 256);
  const big = makeFbm({ fx: 2, oct: 2, seed: o.seed + 1 });
  const warp = makeFbm({ fx: 3, oct: 2, seed: o.seed + 2 });
  const warp2 = makeFbm({ fx: 3, oct: 2, seed: o.seed + 6 });
  const patch = makeFbm({ fx: 4, oct: 3, seed: o.seed + 3 });
  const mott = makeFbm({ fx: 10, oct: 3, seed: o.seed + 4 });
  const low = new Float32Array(R * R);
  for (let y = 0; y < R; y++) {
    const v = (y + 0.5) / R;
    for (let x = 0; x < R; x++) {
      const u = (x + 0.5) / R;
      const w1 = warp(u, v), w2 = warp2(u, v);
      // plages où le poil est couché autrement (bords doux) + marbrure fine + reflet global
      const pa = patch(u + 0.18 * w1, v + 0.18 * w2);
      const pz = pa * 2.2; const ps = pz / (1 + Math.abs(pz));
      low[y * R + x] = 0.16 * big(u, v) + 0.21 * ps + 0.14 * mott(u + 0.05 * w2, v + 0.05 * w1);
    }
  }
  const L = R === S ? low : upsample(low, R, S);
  // grain du poil : bruit fin, légèrement allongé verticalement
  const gv = new Float32Array(S * S);
  const k = S / D, rv = Math.max(1, Math.round(1.5 * k));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let sum = 0;
      for (let q = -rv; q <= rv; q++) sum += hash(x, (((y + q) % S) + S) % S, o.seed);
      gv[y * S + x] = (sum / (2 * rv + 1) - 0.5) * 1.7 + (hash(x, y, o.seed + 9) - 0.5) * 0.6;
    }
  }
  const dark = o.dark, sheen = o.sheen;
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const t = clamp01(0.5 + 1.1 * L[p]);
    const m = 1 + 0.055 * gv[p];
    for (let ch = 0; ch < 3; ch++) out[p * 3 + ch] = (dark[ch] + (sheen[ch] - dark[ch]) * t) * m;
  }
  matchMean(out, target, 1);
  put(ctx, S, out, 1.0, o.seed);
}

function drawRayure(ctx, S) {
  const sand = hex('#D5C19D'), ivory = hex('#F2EBDD'), green = hex('#2F4A3E');
  // rapport de 96 fils (≈ 15 cm), répété 2 fois par tuile
  const layout = [['s', 40], ['i', 8], ['g', 1], ['i', 2], ['g', 1], ['i', 32], ['g', 1], ['i', 2], ['g', 1], ['i', 8]];
  const seq = [];
  for (const [c, n] of layout) for (let k = 0; k < n; k++) seq.push(c);
  const nx = 192, ny = 170;
  const rng = mulberry32(77);
  const warpColor = threadColors(nx, (i) => {
    const c = seq[i % seq.length];
    const base = c === 's' ? sand : c === 'i' ? ivory : green;
    const j = 1 + (rng() - 0.5) * (c === 's' ? 0.07 : 0.035);
    return shade(base, j / 255);
  });
  const weftColor = threadColors(ny, () => shade(mix(ivory, sand, 0.25), (1 + (rng() - 0.5) * 0.03) / 255));
  const W = weave(S, {
    nx, ny, seed: 7, warpW: 0.47, weftW: 0.34, warpColor, weftColor, gapColor: [0.5, 0.45, 0.38],
    warp: { noise: 0.12, slubs: 0.2, slubAmp: 0.25, jit: 0.06, tone: 0.03 },
    weft: { noise: 0.15, slubs: 0.3, slubAmp: 0.3, jit: 0.06, tone: 0.03 },
    kBase: 0.62, kProf: 0.34, kZ: 0.14, kFib: 0.1, gap: 0.7, wave: 0.12, undul: 0.6,
  });
  const cloud = fbm(S, { fx: 3, oct: 4, seed: 78 });
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = 255 * (1 + cloud[p] * 0.02);
    out[p * 3] = W[p * 3] * m; out[p * 3 + 1] = W[p * 3 + 1] * m; out[p * 3 + 2] = W[p * 3 + 2] * m;
  }
  put(ctx, S, out, 1, 7);
}


// Normale d'un champ de hauteur (repli) → éclairage lambertien doux.
function lightField(H, S, scale, lx = -0.45, ly = -0.6, lz = 0.66) {
  const out = new Float32Array(S * S);
  const k = (scale * S) / 2;
  for (let y = 0; y < S; y++) {
    const yu = ((y - 1 + S) % S) * S, yd = ((y + 1) % S) * S, row = y * S;
    for (let x = 0; x < S; x++) {
      const gx = (H[row + ((x + 1) % S)] - H[row + ((x - 1 + S) % S)]) * k;
      const gy = (H[yd + x] - H[yu + x]) * k;
      const n = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      out[row + x] = (-gx * lx - gy * ly + lz) * n - lz;
    }
  }
  return out;
}

function drawGaze(ctx, S) {
  const target = hex('#E8C9C0');
  const Rh = Math.min(S, 256);
  const w1 = makeFbm({ fx: 3, fy: 2, oct: 2, seed: 201 }), w2 = makeFbm({ fx: 2, fy: 3, oct: 2, seed: 202 });
  const cr = makeFbm({ fx: 12, fy: 3, oct: 3, seed: 203, ridge: true, gain: 0.4 });
  const cr2 = makeFbm({ fx: 23, fy: 5, oct: 2, seed: 205, ridge: true, gain: 0.5 });
  const so = makeFbm({ fx: 8, fy: 2, oct: 4, seed: 204, gain: 0.55 });
  const h = new Float32Array(Rh * Rh);
  for (let y = 0; y < Rh; y++) {
    const v = (y + 0.5) / Rh;
    for (let x = 0; x < Rh; x++) {
      const u = (x + 0.5) / Rh;
      const a = w1(u, v), b = w2(u, v);
      h[y * Rh + x] = 0.3 * cr(u + 0.05 * a, v + 0.09 * b) + 0.05 * cr2(u + 0.04 * b, v + 0.05 * a) + 0.75 * so(u + 0.04 * b, v);
    }
  }
  const H = Rh === S ? h : upsample(h, Rh, S);
  const rose = hex('#EBCFC7');
  const nx = 150, ny = 136;
  const rng = mulberry32(206);
  const tc = (n) => threadColors(n, () => shade(rose, (1 + (rng() - 0.5) * 0.05) / 255));
  const W = weave(S, {
    nx, ny, seed: 21, warpW: 0.31, weftW: 0.29,
    warp: { noise: 0.3, slubs: 0.4, slubAmp: 0.35, jit: 0.15, tone: 0.04 },
    weft: { noise: 0.35, slubs: 0.5, slubAmp: 0.4, jit: 0.18, tone: 0.04 },
    warpColor: tc(nx), weftColor: tc(ny), gapColor: shade(hex('#CFA69C'), 1 / 255),
    kBase: 0.74, kProf: 0.26, kZ: 0.1, kFib: 0.1, gap: 1, wave: 0.25, undul: 0.5, ss: S < 400 ? 2 : 1,
    dispFn: (R) => {
      const HR = R === Rh ? h : upsample(h, Rh, R);
      const dx = new Float32Array(R * R), dy = new Float32Array(R * R);
      for (let y = 0; y < R; y++) {
        const row = y * R, yu = ((y - 1 + R) % R) * R, yd = ((y + 1) % R) * R;
        for (let x = 0; x < R; x++) {
          const gx = (HR[row + ((x + 1) % R)] - HR[row + ((x - 1 + R) % R)]) * R;
          const gy = (HR[yd + x] - HR[yu + x]) * R;
          dx[row + x] = gx * 0.006;
          dy[row + x] = gy * 0.003 + HR[row + x] * 0.6;
        }
      }
      return [dx, dy];
    },
  });
  const Lf = lightField(H, S, 0.017);
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = Math.max(0.2, 1 + 0.95 * Lf[p] + 0.05 * H[p]);
    // ombres des plis plus soutenues en rose (pas grisâtres)
    out[p * 3] = W[p * 3] * 255 * Math.pow(m, 0.8);
    out[p * 3 + 1] = W[p * 3 + 1] * 255 * Math.pow(m, 1.12);
    out[p * 3 + 2] = W[p * 3 + 2] * 255 * Math.pow(m, 1.05);
  }
  matchMean(out, target, 1);
  put(ctx, S, out, 1, 21);
  drawHairs(ctx, S, 60, hex('#F6E3DC'), 0.3, 207, 8, 0.5);
}

// --- Bogolan -------------------------------------------------------------------------------
// Trait « peint à la main » : polyligne rééchantillonnée, remplie comme un ruban d'épaisseur variable.
function ribbon(c, pts, widths) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], Rr = [];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = widths[k] / 2;
    L.push([pts[k][0] - ty * w, pts[k][1] + tx * w]);
    Rr.push([pts[k][0] + ty * w, pts[k][1] - tx * w]);
  }
  c.beginPath();
  c.moveTo(L[0][0], L[0][1]);
  for (let k = 1; k < n; k++) c.lineTo(L[k][0], L[k][1]);
  for (let k = n - 1; k >= 0; k--) c.lineTo(Rr[k][0], Rr[k][1]);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(pts[0][0], pts[0][1], widths[0] / 2, 0, TAU);
  c.arc(pts[n - 1][0], pts[n - 1][1], widths[n - 1] / 2, 0, TAU);
  c.fill();
}

function resample(pts, step) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    const l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(l / step));
    for (let t = 1; t <= n; t++) out.push([x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n]);
  }
  return out;
}

// Trait à main levée local (élément isolé) : bruit lissé tiré d'un PRNG propre à l'élément.
function handStroke(c, pts, w, seed, jit = 0.9) {
  const r = mulberry32(seed);
  const q = resample(pts, 2.2);
  let ox = 0, oy = 0, vx = 0, vy = 0, wv = 0;
  const P = [], Wd = [];
  for (let k = 0; k < q.length; k++) {
    vx = vx * 0.8 + (r() - 0.5) * 0.35 * jit; vy = vy * 0.8 + (r() - 0.5) * 0.35 * jit;
    ox = ox * 0.9 + vx; oy = oy * 0.9 + vy;
    wv = wv * 0.85 + (r() - 0.5) * 0.25;
    P.push([q[k][0] + ox, q[k][1] + oy]);
    Wd.push(w * (1 + wv));
  }
  ribbon(c, P, Wd);
}

// Trait horizontal périodique (raccord garanti) : tremblement fonction de x mod 512.
function periodicStroke(c, pts, w, seed, jit = 1) {
  const hx = harmonics(seed, 3, 40), hy = harmonics(seed + 1, 3, 40), hw = harmonics(seed + 2, 4, 30);
  const q = resample(pts, 2);
  const P = [], Wd = [];
  for (const [x, y] of q) {
    const t = x / D;
    P.push([x + 0.4 * jit * hx(t + y * 0.001), y + 0.9 * jit * hy(t)]);
    Wd.push(w * (1 + 0.2 * hw(t)));
  }
  ribbon(c, P, Wd);
}

function blob(c, x, y, r, seed, sq = 1) {
  const rr = mulberry32(seed);
  const n = 9, ph = rr() * TAU;
  c.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = ph + (k / n) * TAU;
    const rad = r * (0.85 + 0.3 * rr());
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * sq;
    if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

function bogolanBands(c) {
  const line = (y, w, seed) => periodicStroke(c, [[-12, y], [D + 12, y]], w, seed);
  const each = (n, fn) => { for (let i = -1; i <= n; i++) fn(((i % n) + n) % n, ((i + 0.5) * D) / n); };
  // 1. filets doubles
  line(4, 2.6, 11); line(11, 2.2, 12);
  // 2. grand zigzag avec points
  {
    const y0 = 20, y1 = 70, n = 8, pts = [];
    for (let k = -1; k <= 2 * n + 1; k++) pts.push([(k * D) / (2 * n), k % 2 ? y1 : y0]);
    periodicStroke(c, pts, 5.2, 13, 1.3);
    each(n, (i, x) => {
      blob(c, x - D / (4 * n), y0 + 12 + hash(i, 1, 5) * 3, 3.6, ihash(i, 21));
      blob(c, x + D / (4 * n), y1 - 12 - hash(i, 2, 5) * 3, 3.6, ihash(i, 22));
    });
  }
  line(80, 2.4, 14);
  // 3. rangée de points
  each(32, (i, x) => blob(c, x + (hash(i, 3, 5) - 0.5) * 2, 88 + (hash(i, 4, 5) - 0.5) * 2, 2.6, ihash(i, 23)));
  line(96, 2.4, 15); line(102, 2.4, 16);
  // 4. losanges avec croix / point central
  each(6, (i, x) => {
    const y = 142, a = 36, b = 34, sd = ihash(i, 24);
    handStroke(c, [[x, y - b], [x + a, y], [x, y + b], [x - a, y], [x, y - b]], 4.4, sd);
    handStroke(c, [[x, y - b + 12], [x + a - 13, y], [x, y + b - 12], [x - a + 13, y], [x, y - b + 12]], 2.4, sd + 1);
    blob(c, x, y, 4.2, sd + 2);
    const xm = x + D / 12;
    handStroke(c, [[xm - 9, y - 9], [xm + 9, y + 9]], 3, sd + 3);
    handStroke(c, [[xm + 9, y - 9], [xm - 9, y + 9]], 3, sd + 4);
    blob(c, xm, y - 26, 2.8, sd + 5); blob(c, xm, y + 26, 2.8, sd + 6);
  });
  line(182, 2.4, 17); line(188, 2.4, 18);
  // 5. cases avec croix de Saint-André
  each(16, (i, x) => {
    const y0 = 196, y1 = 240, w = D / 16, sd = ihash(i, 25);
    handStroke(c, [[x - w / 2, y0], [x - w / 2, y1]], 2.6, sd);
    if (i % 2 === 0) {
      handStroke(c, [[x - 9, y0 + 9], [x + 9, y1 - 9]], 2.8, sd + 1);
      handStroke(c, [[x + 9, y0 + 9], [x - 9, y1 - 9]], 2.8, sd + 2);
    } else {
      blob(c, x, y0 + 12, 2.6, sd + 3); blob(c, x, (y0 + y1) / 2, 2.6, sd + 4); blob(c, x, y1 - 12, 2.6, sd + 5);
    }
  });
  line(248, 2.4, 19); line(254, 2.2, 20);
  // 6. « yeux » : disques pleins cernés, centre sombre
  each(12, (i, x) => {
    const y = 290, sd = ihash(i, 26);
    blob(c, x, y, 15, sd, 0.95);
    c.save(); c.fillStyle = '#000'; blob(c, x + (hash(i, 7, 5) - 0.5) * 2, y, 6.5, sd + 1); c.restore();
    blob(c, x + D / 24, y - 20, 2.4, sd + 2); blob(c, x + D / 24, y + 20, 2.4, sd + 3);
  });
  line(322, 2.6, 21);
  // 7. dents de scie pleines
  each(10, (i, x) => {
    const y0 = 330, y1 = 378, w = D / 10, sd = ihash(i, 27);
    const r = mulberry32(sd);
    const j = () => (r() - 0.5) * 2.4;
    c.beginPath();
    c.moveTo(x - w / 2 + 3 + j(), y1 + j());
    c.lineTo(x + j(), y0 + 4 + j());
    c.lineTo(x + w / 2 - 3 + j(), y1 + j());
    c.closePath();
    c.fill();
    c.save(); c.fillStyle = '#000'; blob(c, x, y1 - 13, 3.2, sd + 1); c.restore();
    blob(c, x + w / 2, y0 + 8, 2.8, sd + 2);
  });
  line(386, 2.4, 22);
  each(24, (i, x) => blob(c, x, 394 + (hash(i, 9, 5) - 0.5) * 2, 2.3, ihash(i, 28)));
  line(402, 2.4, 23);
  // 8. échelle / peignes
  line(412, 3.2, 24); line(452, 3.2, 25);
  each(28, (i, x) => {
    const sd = ihash(i, 29);
    handStroke(c, [[x, 414], [x + (hash(i, 11, 5) - 0.5) * 3, 450]], 2.4, sd);
  });
  // 9. petites croix alternées
  each(14, (i, x) => {
    const y = 474, sd = ihash(i, 30);
    handStroke(c, [[x - 7, y], [x + 7, y]], 2.8, sd);
    handStroke(c, [[x, y - 8], [x, y + 8]], 2.8, sd + 1);
    blob(c, x + D / 28, y, 2.3, sd + 2);
  });
  line(494, 2.4, 26); line(501, 2.6, 27);
}

function drawBogolan(ctx, S) {
  const k = S / D;
  const M0 = drawLayer(ctx, S, '#000', (c) => {
    c.fillStyle = c.strokeStyle = '#fff';
    bogolanBands(c);
  });
  // bandes tissées assemblées : la seconde bande (x ∈ [384, 640[) est décalée de 3 unités vers le bas
  const M = new Uint8ClampedArray(S * S * 4);
  const dyS = Math.round(3 * k);
  for (let y = 0; y < S; y++) {
    const ys = (((y - dyS) % S) + S) % S;
    for (let x = 0; x < S; x++) {
      const xd = (x + 0.5) / k;
      const src = xd >= 128 && xd < 384 ? y : ys;
      M[(y * S + x) * 4] = M0[(src * S + x) * 4];
    }
  }
  const W = weave(S, {
    nx: 150, ny: 136, seed: 61, warpW: 0.42, weftW: 0.44,
    warp: { noise: 0.3, slubs: 0.6, slubAmp: 0.4, jit: 0.14, tone: 0.07 },
    weft: { noise: 0.35, slubs: 0.8, slubAmp: 0.5, jit: 0.16, tone: 0.08 },
    kBase: 0.5, kProf: 0.42, kZ: 0.2, kFib: 0.14, gap: 0.45, wave: 0.2, ss: S < 400 ? 2 : 1,
  });
  const n1 = fbm(S, { fx: 4, oct: 5, seed: 62 });
  const n2 = fbm(S, { fx: 24, oct: 2, seed: 63 });
  const n3 = fbm(S, { fx: 7, oct: 4, seed: 64 });
  const mud = hex('#2B211B'), mud2 = hex('#46342A'), ivo = hex('#E6D8BE'), stain = hex('#B59C7C');
  const out = new Float32Array(S * S * 3);
  const seamF = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    // coutures des bandes tissées (bandes de 15 cm assemblées)
    const xd = Math.min(Math.abs((x + 0.5) / k - 128), Math.abs((x + 0.5) / k - 384));
    seamF[x] = xd < 3 ? 0.55 + 0.45 * (xd / 3) : xd < 5 ? 1.08 : 1;
  }
  for (let p = 0; p < S * S; p++) {
    const x = p % S;
    let m = M[p * 4] / 255;
    m = smooth(0.25, 0.75, m + 0.28 * (W[p * 3] - 1) + 0.18 * n2[p]);
    m *= 1 - 0.18 * smooth(0.25, 0.7, n3[p]); // couverture irrégulière du pigment
    const t1 = clamp01(0.35 + 0.6 * n1[p]), t2 = clamp01(0.25 + 0.7 * n3[p] + 0.3 * n2[p]);
    const w = W[p * 3], hi = (w - 1) * (18 + 20 * m), sf = seamF[x];
    for (let ch = 0; ch < 3; ch++) {
      const dm = mud[ch] + (mud2[ch] - mud[ch]) * t1, iv = ivo[ch] + (stain[ch] - ivo[ch]) * t2;
      out[p * 3 + ch] = ((dm + (iv - dm) * m) * w + hi) * sf;
    }
  }
  put(ctx, S, out, 1.4, 61);
  // points de couture visibles sur l'assemblage
  ctx.save();
  resetState(ctx, S);
  for (const xs of [128, 384]) {
    for (let i = 0; i < 40; i++) {
      const y = (i + 0.5) * (D / 40);
      const h = hash(i, xs, 66);
      wrap(ctx, xs, y, 10, (c) => {
        c.strokeStyle = css(hex('#6B5A48'), 0.55 + 0.3 * h);
        c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(xs - 2.5, y - 2.5 + h); c.lineTo(xs + 2.5, y + 2.5 + h); c.stroke();
      });
    }
  }
  ctx.restore();
}

// --- Wax -----------------------------------------------------------------------------------
// Distance (px) aux arêtes d'un diagramme de Voronoï périodique (craquelures de la cire).
function voronoiEdge(S, G, seed, warpAmp, wx, wy) {
  const fxp = new Float32Array(G * G), fyp = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    fxp[j * G + i] = 0.1 + 0.8 * hash(i, j, seed);
    fyp[j * G + i] = 0.1 + 0.8 * hash(i, j, seed + 1);
  }
  const out = new Float32Array(S * S);
  const cell = S / G;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = y * S + x;
      const gx = ((x + 0.5) / S) * G + wx[p] * warpAmp, gy = ((y + 0.5) / S) * G + wy[p] * warpAmp;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      let f1 = 9, f2 = 9;
      for (let dj = -1; dj <= 1; dj++) {
        const cj = cy + dj, wj = ((cj % G) + G) % G;
        for (let di = -1; di <= 1; di++) {
          const ci = cx + di, wi = ((ci % G) + G) % G;
          const dx = ci + fxp[wj * G + wi] - gx, dy = cj + fyp[wj * G + wi] - gy;
          const d = dx * dx + dy * dy;
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      out[p] = (Math.sqrt(f2) - Math.sqrt(f1)) * cell * 0.5;
    }
  }
  return out;
}

function drawWax(ctx, S) {
  const k = S / D;
  const CREAM = '#F2E7CF', OCHRE = '#D39B2A', TERRA = '#B4563A', TEAL = '#1F5560';
  const reg = [1.6, 1.1]; // décalage de repérage de la planche bleue
  const P = drawLayer(ctx, S, CREAM, (c) => {
    // semis de fond : petites graines bleues + points ocre
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
      const x = (i + (j % 2) * 0.5) * (D / 20), y = (j + 0.5) * (D / 20);
      const a = hash(i, j, 81) * Math.PI;
      wrap(c, x, y, 6, (cc) => {
        cc.fillStyle = TEAL;
        cc.beginPath(); cc.ellipse(x + reg[0], y + reg[1], 3.6, 1.7, a, 0, TAU); cc.fill();
      });
    }
    const sun = (x, y, s) => wrap(c, x, y, 112 * s, (cc) => {
      const circ = (r, col, off = false) => {
        cc.fillStyle = col; cc.beginPath();
        cc.arc(x + (off ? reg[0] : 0), y + (off ? reg[1] : 0), r * s, 0, TAU); cc.fill();
      };
      const spikes = (n, r0, r1, col, rot, wf = 0.5) => {
        cc.fillStyle = col; cc.beginPath();
        for (let q = 0; q < n; q++) {
          const a = rot + (q / n) * TAU, da = (TAU / n) * wf;
          cc.moveTo(x + Math.cos(a - da / 2) * r0 * s, y + Math.sin(a - da / 2) * r0 * s);
          cc.lineTo(x + Math.cos(a) * r1 * s, y + Math.sin(a) * r1 * s);
          cc.lineTo(x + Math.cos(a + da / 2) * r0 * s, y + Math.sin(a + da / 2) * r0 * s);
        }
        cc.fill();
      };
      const dots = (n, r, dr, col, off = false, rot = 0) => {
        cc.fillStyle = col;
        for (let q = 0; q < n; q++) {
          const a = rot + (q / n) * TAU;
          cc.beginPath();
          cc.arc(x + Math.cos(a) * r * s + (off ? reg[0] : 0), y + Math.sin(a) * r * s + (off ? reg[1] : 0), dr * s, 0, TAU);
          cc.fill();
        }
      };
      spikes(20, 76, 108, OCHRE, 0);
      spikes(20, 76, 96, TERRA, Math.PI / 20, 0.42);
      circ(80, TEAL, true);
      circ(73, CREAM);
      circ(69, TERRA);
      dots(28, 69, 2.6, CREAM, false, 0.05);
      circ(61, TEAL, true);
      dots(22, 54.5, 3.4, CREAM, true);
      circ(47, OCHRE);
      spikes(12, 30, 46, TERRA, Math.PI / 12, 0.55);
      circ(31, CREAM);
      circ(27, TEAL, true);
      circ(18, OCHRE);
      dots(8, 12, 2.3, TERRA);
      circ(6, CREAM);
      circ(3, TEAL, true);
    });
    const ring = (x, y, s) => wrap(c, x, y, 74 * s, (cc) => {
      const rings = [[72, TEAL, 1], [64, CREAM, 0], [60, OCHRE, 0], [49, CREAM, 0], [45, TERRA, 0], [36, TEAL, 1], [30, CREAM, 0], [26, OCHRE, 0], [16, TEAL, 1], [8, CREAM, 0]];
      for (const [r, col, off] of rings) {
        cc.fillStyle = col; cc.beginPath();
        cc.arc(x + (off ? reg[0] : 0), y + (off ? reg[1] : 0), r * s, 0, TAU); cc.fill();
        if (r === 49) {
          cc.fillStyle = TEAL;
          for (let q = 0; q < 16; q++) {
            const a = (q / 16) * TAU;
            cc.beginPath(); cc.arc(x + Math.cos(a) * 54.5 * s + reg[0], y + Math.sin(a) * 54.5 * s + reg[1], 2.4 * s, 0, TAU); cc.fill();
          }
        }
      }
      cc.fillStyle = CREAM;
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * TAU;
        cc.beginPath(); cc.ellipse(x + Math.cos(a) * 21 * s, y + Math.sin(a) * 21 * s, 4 * s, 2 * s, a, 0, TAU); cc.fill();
      }
    });
    // petites fleurs bleues aux interstices
    const flower = (x, y, s) => wrap(c, x, y, 40 * s, (cc) => {
      cc.fillStyle = TERRA;
      cc.beginPath(); cc.arc(x, y, 34 * s, 0, TAU); cc.fill();
      cc.fillStyle = CREAM;
      cc.beginPath(); cc.arc(x, y, 30 * s, 0, TAU); cc.fill();
      cc.fillStyle = TEAL;
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * TAU + Math.PI / 8;
        cc.beginPath();
        cc.ellipse(x + Math.cos(a) * 16 * s + reg[0], y + Math.sin(a) * 16 * s + reg[1], 12 * s, 5.5 * s, a, 0, TAU);
        cc.fill();
      }
      cc.fillStyle = OCHRE;
      cc.beginPath(); cc.arc(x, y, 7 * s, 0, TAU); cc.fill();
    });
    for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256]]) flower(x, y, 1);
    sun(128, 128, 1.14); sun(384, 384, 1.14);
    ring(384, 128, 1.18); ring(128, 384, 1.18);
  });
  const W = weave(S, {
    nx: 210, ny: 200, seed: 81, warpW: 0.44, weftW: 0.44,
    warp: { noise: 0.15, slubs: 0.2, slubAmp: 0.3, jit: 0.06, tone: 0.03 },
    weft: { noise: 0.15, slubs: 0.2, slubAmp: 0.3, jit: 0.06, tone: 0.03 },
    kBase: 0.72, kProf: 0.24, kZ: 0.1, kFib: 0.06, gap: 0.62, wave: 0.12, ss: 1,
  });
  const wx = fbm(S, { fx: 5, oct: 3, seed: 87 }), wy = fbm(S, { fx: 5, oct: 3, seed: 88 });
  const E1 = voronoiEdge(S, 9, 82, 0.4, wx, wy), E2 = voronoiEdge(S, 21, 83, 0.3, wy, wx);
  const vis1 = fbm(S, { fx: 3, oct: 4, seed: 84 }), vis2 = fbm(S, { fx: 6, oct: 3, seed: 85 });
  const dye = wx;
  const vein = hex('#244E57');
  // bords d'impression légèrement adoucis (l'encre boit dans la trame)
  const blotch = fbm(S, { fx: 12, oct: 3, seed: 89 });
  const out = new Float32Array(S * S * 3);
  const soft = [0, 0, 0];
  for (let p = 0; p < S * S; p++) {
    const q = p * 3, x = p % S, y = (p / S) | 0;
    const l = y * S + (x ? x - 1 : S - 1), rr = y * S + (x < S - 1 ? x + 1 : 0);
    const u = (y ? y - 1 : S - 1) * S + x, d = (y < S - 1 ? y + 1 : 0) * S + x;
    for (let ch = 0; ch < 3; ch++) soft[ch] = P[p * 4 + ch] * 0.52 + (P[l * 4 + ch] + P[rr * 4 + ch] + P[u * 4 + ch] + P[d * 4 + ch]) * 0.12;
    let r = soft[0], g = soft[1], b = soft[2];
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0;
    const c1 = (1 - smooth(0.1, 0.9 * k + 0.25, E1[p])) * smooth(-0.2, 0.3, vis1[p]);
    const c2 = (1 - smooth(0.1, 0.7 * k + 0.2, E2[p])) * smooth(-0.05, 0.45, vis2[p]) * 0.8;
    // veines de teinture : marquées dans l'ocre et la terre cuite, discrètes sur la crème
    const cr = Math.min(1, c1 + c2) * smooth(0.3, 0.6, lum) * (sat > 0.35 ? 0.62 : 0.2);
    r += (vein[0] - r) * cr; g += (vein[1] - g) * cr; b += (vein[2] - b) * cr;
    let dm = 1 + dye[p] * (lum < 0.4 ? 0.09 : 0.035) + blotch[p] * (sat > 0.35 ? 0.05 : 0.012);
    // petites réserves de cire (bulles claires) dans le bleu
    if (lum < 0.4) {
      const hb = hash(p % S, (p / S) | 0, 90);
      if (hb > 0.9965) dm *= 1.25;
    }
    out[q] = r * W[q] * dm; out[q + 1] = g * W[q + 1] * dm; out[q + 2] = b * W[q + 2] * dm;
  }
  put(ctx, S, out, 1.2, 81);
}

// --- Toile de Jouy : gravure au trait -------------------------------------------------------
const JOUY_INK = '#B5654A', JOUY_GROUND = '#F2E9DA';

// Hachures parallèles découpées par une forme (clip).
function hatch(c, shape, bbox, ang, sp, lw, seed, wob = 0.5) {
  const [x0, y0, x1, y1] = bbox;
  const r = mulberry32(seed);
  c.save();
  c.beginPath(); shape(c); c.clip();
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  c.lineWidth = lw;
  c.beginPath();
  for (let t = -R; t <= R; t += sp * (0.85 + 0.3 * r())) {
    const px = cx + nx * t, py = cy + ny * t;
    c.moveTo(px - dx * R, py - dy * R);
    c.quadraticCurveTo(px + (r() - 0.5) * wob * 2, py + (r() - 0.5) * wob * 2, px + dx * R, py + dy * R);
  }
  c.stroke();
  c.restore();
}

// Contour festonné (masse de feuillage, toison…) : renvoie une fonction de tracé.
function scallopPath(cx, cy, rx, ry, n, bump, r) {
  const pts = [];
  const ph = r() * TAU;
  for (let k = 0; k < n; k++) {
    const a = ph + (k / n) * TAU, q = 1 + (r() - 0.5) * 0.16;
    pts.push([cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]);
  }
  const bumps = pts.map(() => bump * (0.7 + 0.6 * r()));
  return (c) => {
    c.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let ox = a[0] - cx, oy = a[1] - cy;
      const l = Math.hypot(ox, oy) || 1;
      ox /= l; oy /= l;
      c.quadraticCurveTo(a[0] + ox * bumps[k], a[1] + oy * bumps[k], mx, my);
    }
    c.closePath();
  };
}

// Petites marques de feuillage (« godets ») dont la densité suit l'ombre (bas-droite).
function leafMarks(c, cx, cy, rx, ry, dens, r, size = 2) {
  const n = Math.round(rx * ry * dens);
  c.beginPath();
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r());
    const ex = Math.cos(a) * d, ey = Math.sin(a) * d;
    const sh = ex * 0.55 + ey * 0.85;
    if (r() > 0.18 + 0.75 * smooth(-0.7, 0.7, sh)) continue;
    const x = cx + ex * rx * 0.92, y = cy + ey * ry * 0.92, s = size * (0.75 + 0.5 * r());
    c.moveTo(x - s, y - s * 0.35);
    c.quadraticCurveTo(x, y + s * 0.95, x + s, y - s * 0.35);
  }
  c.stroke();
}

function foliageCluster(c, cx, cy, rx, ry, seed, dens = 0.1) {
  const r = mulberry32(seed);
  const path = scallopPath(cx, cy, rx, ry, Math.max(7, Math.round((rx + ry) * 0.3)), Math.max(2, rx * 0.12), r);
  c.fillStyle = JOUY_GROUND;
  c.beginPath(); path(c); c.fill();
  c.lineWidth = 0.95;
  c.beginPath(); path(c); c.stroke();
  c.lineWidth = 0.8;
  leafMarks(c, cx, cy, rx, ry, dens, r, Math.max(1.5, Math.min(2.4, rx * 0.09)));
  // masse d'ombre : hachures serrées sur la partie basse
  c.save();
  c.beginPath(); path(c); c.clip();
  hatch(c, (cc) => cc.ellipse(cx + rx * 0.35, cy + ry * 0.55, rx * 0.95, ry * 0.75, 0, 0, TAU),
    [cx - rx, cy - ry, cx + rx, cy + ry], -0.35, 1.9, 0.7, seed + 7, 0.4);
  c.restore();
}

function jouyTree(c, x, y, h, seed, lean = 8, spread = 1) {
  const r = mulberry32(seed);
  const top = [x + lean, y - h * 0.5];
  // tronc
  const trunk = (cc) => {
    cc.moveTo(x - h * 0.07, y + 1);
    cc.bezierCurveTo(x - h * 0.035, y - h * 0.18, top[0] - h * 0.05, top[1] + h * 0.15, top[0] - h * 0.025, top[1]);
    cc.lineTo(top[0] + h * 0.025, top[1]);
    cc.bezierCurveTo(top[0] + h * 0.03, top[1] + h * 0.18, x + h * 0.04, y - h * 0.15, x + h * 0.08, y + 1);
    cc.closePath();
  };
  c.fillStyle = JOUY_GROUND;
  c.beginPath(); trunk(c); c.fill();
  c.lineWidth = 1.05;
  c.beginPath(); trunk(c); c.stroke();
  hatch(c, (cc) => { trunk(cc); }, [x - h * 0.1, top[1], x + h * 0.1 + lean, y], 1.45, 1.5, 0.7, seed + 1, 0.3);
  // écorce : quelques traits courbes
  c.lineWidth = 0.7;
  c.beginPath();
  for (let k = 0; k < 9; k++) {
    const t = r(), yy = y - t * h * 0.45, xx = x + lean * t - h * 0.03 + r() * h * 0.04;
    c.moveTo(xx, yy); c.quadraticCurveTo(xx + 2, yy - 1.5, xx + 4, yy - 0.5);
  }
  c.stroke();
  // branches
  c.lineWidth = 1.1;
  c.beginPath();
  for (let k = 0; k < 4; k++) {
    const sgn = k % 2 ? 1 : -1, bl = h * (0.18 + 0.12 * r());
    c.moveTo(top[0], top[1] + h * 0.05);
    c.quadraticCurveTo(top[0] + sgn * bl * 0.5, top[1] - bl * 0.2, top[0] + sgn * bl, top[1] - bl * (0.5 + 0.4 * r()));
  }
  c.stroke();
  // houppier : masses du fond vers l'avant
  const cl = [];
  const W = h * 0.62 * spread, Hc = h * 0.5;
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * (1.05 + 0.9 * (k / 10)) + (r() - 0.5) * 0.3;
    const d = 0.35 + 0.55 * r();
    cl.push([top[0] + Math.cos(a) * W * d * 0.9, top[1] - Hc * 0.35 + Math.sin(a) * Hc * d, h * (0.13 + 0.07 * r())]);
  }
  for (let k = 0; k < 4; k++) cl.push([top[0] + (r() - 0.5) * W * 0.9, top[1] - Hc * 0.1 + r() * h * 0.08, h * (0.12 + 0.05 * r())]);
  cl.sort((a, b) => a[1] - b[1]);
  cl.forEach((q, k) => foliageCluster(c, q[0], q[1], q[2] * 1.2, q[2], seed * 13 + k, 0.11));
}

function jouyGround(c, x0, x1, y, seed, depth = 16) {
  const r = mulberry32(seed);
  c.lineWidth = 0.8;
  c.beginPath();
  for (let k = 0; k < depth / 2.3; k++) {
    const yy = y + k * 2.3, inset = (x1 - x0) * (0.08 + 0.4 * (k / (depth / 2.3)) ** 1.6);
    let xx = x0 + inset + r() * 6;
    const xe = x1 - inset - r() * 6;
    while (xx < xe) {
      const l = 6 + r() * 22;
      c.moveTo(xx, yy + (r() - 0.5));
      c.lineTo(Math.min(xe, xx + l), yy + (r() - 0.5));
      xx += l + 2 + r() * 6 * (1 + k * 0.4);
    }
  }
  c.stroke();
  // touffes d'herbe
  c.lineWidth = 0.75;
  c.beginPath();
  for (let k = 0; k < (x1 - x0) / 9; k++) {
    const gx = x0 + 10 + r() * (x1 - x0 - 20), gy = y + r() * 3;
    const n = 3 + Math.floor(r() * 4);
    for (let q = 0; q < n; q++) {
      const a = -Math.PI / 2 + (q - n / 2) * 0.28 + (r() - 0.5) * 0.2, l = 3 + r() * 6;
      c.moveTo(gx, gy);
      c.quadraticCurveTo(gx + Math.cos(a) * l * 0.5, gy + Math.sin(a) * l * 0.6, gx + Math.cos(a) * l, gy + Math.sin(a) * l);
    }
  }
  c.stroke();
}

function jouyBird(c, x, y, s, a) {
  c.save();
  c.translate(x, y); c.rotate(a); c.scale(s, s);
  c.lineWidth = 1.1 / s;
  c.fillStyle = JOUY_INK;
  c.beginPath();
  c.moveTo(-8, -1.5); c.quadraticCurveTo(-4, -5, 0, 0);
  c.quadraticCurveTo(4, -5.5, 8.5, -2.5);
  c.stroke();
  c.beginPath(); c.ellipse(0, 0.4, 1.8, 0.9, 0, 0, TAU); c.fill();
  c.restore();
}

function jouyShepherdess(c, x, y, s) {
  c.save();
  c.translate(x, y); c.scale(s, s);
  c.lineWidth = 0.95 / s;
  const skirt = (cc) => {
    cc.moveTo(-6.5, -37); cc.bezierCurveTo(-10, -25, -16, -12, -18, -3);
    cc.quadraticCurveTo(0, 1.5, 18, -3); cc.bezierCurveTo(15, -14, 10, -26, 6.5, -37); cc.closePath();
  };
  c.fillStyle = JOUY_GROUND;
  c.beginPath(); skirt(c); c.fill(); c.stroke();
  c.save(); c.beginPath(); skirt(c); c.clip();
  hatch(c, (cc) => { cc.rect(3, -40, 20, 42); }, [3, -40, 23, 2], Math.PI / 2 - 0.12, 1.25, 0.6 / s, 301);
  hatch(c, (cc) => { cc.rect(-20, -10, 40, 12); }, [-20, -10, 20, 2], 0.1, 1.7, 0.55 / s, 302);
  c.restore();
  // plis
  c.beginPath();
  for (const k of [-12, -6, 0, 6]) { c.moveTo(k * 0.3, -35); c.quadraticCurveTo(k * 0.85 + 1, -18, k * 1.3, -1.5); }
  c.stroke();
  // tablier
  c.beginPath(); c.moveTo(-5, -35); c.quadraticCurveTo(-8, -20, -7, -8); c.quadraticCurveTo(-1, -6, 4, -8.5); c.quadraticCurveTo(4, -22, 3, -35); c.closePath();
  c.fill(); c.stroke();
  // corsage
  const bod = (cc) => { cc.moveTo(-4.8, -50); cc.lineTo(4.8, -50); cc.lineTo(6.8, -37); cc.lineTo(-6.8, -37); cc.closePath(); };
  c.beginPath(); bod(c); c.fill(); c.stroke();
  c.save(); c.beginPath(); bod(c); c.clip();
  hatch(c, (cc) => cc.rect(1.5, -51, 8, 15), [1.5, -51, 9.5, -36], Math.PI / 2, 1.1, 0.5 / s, 303);
  c.restore();
  c.beginPath(); c.moveTo(-1, -49); c.lineTo(1, -46); c.moveTo(1, -49); c.lineTo(-1, -46); c.moveTo(-1.2, -45); c.lineTo(1.2, -42); c.moveTo(1.2, -45); c.lineTo(-1.2, -42); c.stroke();
  // bras : un tombant avec panier, l'autre vers la houlette
  c.beginPath(); c.moveTo(-4.5, -49); c.quadraticCurveTo(-10, -42, -9, -33); c.stroke();
  c.beginPath(); c.ellipse(-10, -29, 5, 3.2, 0, 0, TAU); c.fill(); c.stroke();
  hatch(c, (cc) => cc.ellipse(-10, -29, 5, 3.2, 0, 0, TAU), [-15, -33, -5, -25], 0.6, 1.2, 0.5 / s, 304);
  c.beginPath(); c.arc(-10, -31, 4.2, Math.PI, 0); c.stroke();
  c.beginPath(); c.moveTo(4.5, -49); c.quadraticCurveTo(10, -46, 12.5, -51); c.stroke();
  // houlette
  c.lineWidth = 1.1 / s;
  c.beginPath(); c.moveTo(16, -1); c.lineTo(12.5, -72); c.arc(9.3, -72, 3.2, 0, Math.PI, true); c.stroke();
  c.lineWidth = 0.95 / s;
  // tête, chignon, chapeau de paille
  c.beginPath(); c.arc(0, -54.5, 4.3, 0, TAU); c.fill(); c.stroke();
  c.save(); c.beginPath(); c.arc(0, -54.5, 4.3, 0, TAU); c.clip();
  hatch(c, (cc) => cc.rect(1.2, -59, 4, 9), [1.2, -59, 5.2, -50], Math.PI / 2, 1.1, 0.45 / s, 305);
  c.restore();
  c.beginPath(); c.arc(-3.8, -56.5, 2.2, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(0.5, -58.2, 11, 2.3, -0.12, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(0.2, -59.5, 4.2, 2.6, -0.12, Math.PI, 0); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(4, -58.5); c.quadraticCurveTo(8, -54, 7, -49); c.stroke();
  // pieds
  c.beginPath(); c.ellipse(-5, -0.8, 2.6, 1.2, 0, 0, TAU); c.ellipse(4.5, -0.6, 2.6, 1.2, 0, 0, TAU); c.fill(); c.stroke();
  c.restore();
}

function jouySheep(c, x, y, s, seed) {
  const r = mulberry32(seed);
  c.save();
  c.translate(x, y); c.scale(s, s);
  c.lineWidth = 0.9 / s;
  // pattes repliées
  c.beginPath(); c.moveTo(-9, -1); c.lineTo(-12, 0.5); c.moveTo(6, -1); c.lineTo(10, 0.8); c.stroke();
  const body = scallopPath(0, -9, 17, 9, 16, 2.2, r);
  c.fillStyle = JOUY_GROUND;
  c.beginPath(); body(c); c.fill(); c.stroke();
  c.lineWidth = 0.7 / s;
  c.beginPath();
  for (let k = 0; k < 34; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.85, px = Math.cos(a) * d * 17, py = -9 + Math.sin(a) * d * 9;
    if (py < -11 && r() < 0.6) continue;
    c.moveTo(px + 1.3, py); c.arc(px, py, 1.3, 0, Math.PI * 1.4);
  }
  c.stroke();
  hatch(c, (cc) => cc.ellipse(4, -3, 15, 5, 0, 0, TAU), [-12, -9, 20, 2], 0.15, 1.3, 0.5 / s, seed + 1);
  // tête
  c.lineWidth = 0.9 / s;
  c.beginPath(); c.ellipse(18.5, -13, 5.2, 3.3, 0.35, 0, TAU); c.fill(); c.stroke();
  hatch(c, (cc) => cc.ellipse(18.5, -13, 5.2, 3.3, 0.35, 0, TAU), [13, -17, 24, -9], 0.35, 1.1, 0.55 / s, seed + 2);
  c.beginPath(); c.ellipse(15.5, -16, 2.4, 1, -0.6, 0, TAU); c.fill(); c.stroke();
  c.restore();
}

function jouyRuins(c, x, y, seed) {
  const r = mulberry32(seed);
  c.fillStyle = JOUY_GROUND;
  c.lineWidth = 1;
  const stones = (px, w, y0, y1) => {
    c.lineWidth = 0.7;
    c.beginPath();
    for (let k = 1, yy = y1 - 8; yy > y0 + 2; k++, yy -= 8) {
      c.moveTo(px, yy); c.lineTo(px + w, yy);
      const off = k % 2 ? w * 0.5 : w * 0.25;
      c.moveTo(px + off, yy); c.lineTo(px + off, Math.min(y1, yy + 8));
    }
    c.stroke();
    c.lineWidth = 1;
  };
  // pilier gauche et départ d'arc
  const H = 70, cx = x + 38, rO = 38, rI = 22;
  const left = (cc) => { cc.rect(x, y - H, 16, H); };
  const right = (cc) => { cc.rect(x + 60, y - H, 16, H); };
  const archSeg = (a0, a1, cut) => (cc) => {
    cc.arc(cx, y - H, rO, a0, a1);
    cc.lineTo(cx + Math.cos(a1) * rI + cut, y - H + Math.sin(a1) * rI + 2);
    cc.arc(cx, y - H, rI, a1, a0, true);
    cc.closePath();
  };
  const arch = archSeg(Math.PI, Math.PI * 1.6, 4);
  const arch2 = archSeg(Math.PI * 1.82, Math.PI * 2, -3);
  // colline lointaine vue sous l'arche
  c.lineWidth = 0.7;
  c.beginPath();
  for (let k = 0; k < 4; k++) { c.moveTo(x + 18, y - 24 + k * 3); c.quadraticCurveTo(x + 36, y - 34 + k * 3, x + 58, y - 26 + k * 3); }
  c.stroke();
  c.lineWidth = 1;
  for (const ar of [arch, arch2]) {
    c.beginPath(); ar(c); c.fill(); c.stroke();
    hatch(c, ar, [x, y - H - rO, x + 76, y - H], 0.45, 1.35, 0.6, seed + 3);
  }
  c.lineWidth = 0.75;
  c.beginPath();
  for (const k of [1, 2, 3, 4, 5, 9]) {
    const a = Math.PI + k * 0.1 * Math.PI;
    c.moveTo(cx + Math.cos(a) * rI, y - H + Math.sin(a) * rI);
    c.lineTo(cx + Math.cos(a) * rO, y - H + Math.sin(a) * rO);
  }
  c.stroke();
  c.lineWidth = 1;
  for (const [shape, px, w] of [[left, x, 16], [right, x + 60, 16]]) {
    c.beginPath(); shape(c); c.fill(); c.stroke();
    stones(px, w, y - H, y);
    c.save(); c.beginPath(); shape(c); c.clip();
    hatch(c, (cc) => cc.rect(px + w * 0.55, y - H - 20, w, H + 20), [px, y - H - 20, px + w, y], Math.PI / 2, 1.2, 0.7, seed + px);
    c.restore();
  }
  // imposte
  c.beginPath(); c.rect(x - 3, y - H - 1, 22, 5); c.rect(x + 57, y - H - 1, 22, 5); c.fill(); c.stroke();
  // colonne cannelée brisée avec chapiteau
  const colX = x + 96, colH = 70;
  const shaft = (cc) => {
    cc.moveTo(colX, y); cc.lineTo(colX + 1, y - colH); cc.lineTo(colX + 5, y - colH - 4); cc.lineTo(colX + 9, y - colH + 2);
    cc.lineTo(colX + 13, y - colH - 3); cc.lineTo(colX + 14, y); cc.closePath();
  };
  c.beginPath(); shaft(c); c.fill(); c.stroke();
  c.lineWidth = 0.6;
  c.beginPath();
  for (const fx of [3.5, 7, 10.5]) { c.moveTo(colX + fx, y - 2); c.lineTo(colX + fx, y - colH + 4); }
  c.stroke();
  c.save(); c.beginPath(); shaft(c); c.clip();
  hatch(c, (cc) => cc.rect(colX + 9, y - colH - 5, 8, colH + 5), [colX + 9, y - colH - 5, colX + 17, y], Math.PI / 2, 1.1, 0.6, seed + 9);
  c.restore();
  c.lineWidth = 1;
  c.beginPath(); c.rect(colX - 4, y - 5, 22, 5); c.fill(); c.stroke();
  // chapiteau tombé au pied
  c.beginPath(); c.moveTo(colX + 22, y); c.lineTo(colX + 26, y - 9); c.lineTo(colX + 44, y - 9); c.lineTo(colX + 48, y); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(colX + 27, y - 7, 3, 0, TAU); c.arc(colX + 43, y - 7, 3, 0, TAU); c.stroke();
  hatch(c, (cc) => { cc.moveTo(colX + 35, y); cc.lineTo(colX + 44, y - 9); cc.lineTo(colX + 48, y); cc.closePath(); }, [colX + 35, y - 9, colX + 48, y], 1.2, 1.1, 0.6, seed + 10);
  // lierre retombant et touffes
  foliageCluster(c, x + 26, y - H - 38, 12, 7, seed + 5, 0.14);
  foliageCluster(c, x + 74, y - H - 10, 9, 6, seed + 6, 0.14);
  c.lineWidth = 0.7;
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    let vx = x + 18 + k * 4, vy = y - H - 32;
    c.moveTo(vx, vy);
    for (let q = 0; q < 6; q++) { const nx2 = vx + (r() - 0.5) * 3, ny2 = vy + 4 + r() * 3; c.quadraticCurveTo(vx + 2, vy + 2, nx2, ny2); vx = nx2; vy = ny2; c.moveTo(vx + 1.6, vy); c.arc(vx, vy, 1.6, 0, Math.PI); c.moveTo(vx, vy); }
  }
  c.stroke();
  c.lineWidth = 0.75;
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const vx = x - 6 + r() * 130, vy = y - 1;
    c.moveTo(vx, vy); c.quadraticCurveTo(vx + 2, vy - 5, vx + (r() - 0.5) * 6, vy - 7 - r() * 6);
  }
  c.stroke();
}

function jouyCottage(c, x, y, seed) {
  const r = mulberry32(seed);
  c.fillStyle = JOUY_GROUND;
  c.lineWidth = 1;
  const side = (cc) => { cc.moveTo(x + 28, y); cc.lineTo(x + 28, y - 28); cc.lineTo(x + 44, y - 36); cc.lineTo(x + 44, y - 8); cc.closePath(); };
  c.beginPath(); c.rect(x - 28, y - 28, 56, 28); c.fill(); c.stroke();
  c.beginPath(); side(c); c.fill(); c.stroke();
  hatch(c, side, [x + 28, y - 36, x + 44, y], Math.PI / 2, 1.05, 0.65, seed + 1);
  // pignon
  const gable = (cc) => { cc.moveTo(x + 28, y - 28); cc.lineTo(x + 36, y - 52); cc.lineTo(x + 44, y - 36); cc.closePath(); };
  c.beginPath(); gable(c); c.fill(); c.stroke();
  hatch(c, gable, [x + 28, y - 52, x + 44, y - 28], Math.PI / 2, 1.2, 0.6, seed + 2);
  // toit de chaume
  const roof = (cc) => { cc.moveTo(x - 33, y - 26); cc.lineTo(x - 18, y - 54); cc.lineTo(x + 38, y - 55); cc.lineTo(x + 32, y - 26); cc.closePath(); };
  c.beginPath(); roof(c); c.fill(); c.stroke();
  c.save(); c.beginPath(); roof(c); c.clip();
  c.lineWidth = 0.65;
  c.beginPath();
  for (let k = 0; k < 60; k++) {
    const t = k / 60, tx = x - 33 + t * 70, l = 6 + r() * 12;
    c.moveTo(tx + 8 - t * 6, y - 55 + r() * 12); c.lineTo(tx + 6 - t * 6 - 2, y - 55 + r() * 12 + l);
  }
  for (let k = 0; k < 40; k++) { const tx = x - 32 + r() * 64; c.moveTo(tx, y - 26); c.lineTo(tx - 1, y - 32 - r() * 5); }
  c.stroke();
  c.restore();
  c.lineWidth = 1;
  // porte, fenêtre, cheminée, fumée
  const door = (cc) => cc.rect(x - 10, y - 17, 9, 17);
  c.beginPath(); door(c); c.stroke();
  hatch(c, door, [x - 10, y - 17, x - 1, y], 0.05, 1.05, 0.6, seed + 3);
  const win = (cc) => cc.rect(x + 7, y - 21, 11, 9);
  c.beginPath(); win(c); c.stroke();
  hatch(c, win, [x + 7, y - 21, x + 18, y - 12], 0.8, 1.2, 0.55, seed + 4);
  c.beginPath(); c.moveTo(x + 12.5, y - 21); c.lineTo(x + 12.5, y - 12); c.moveTo(x + 7, y - 16.5); c.lineTo(x + 18, y - 16.5); c.stroke();
  const chim = (cc) => cc.rect(x + 16, y - 64, 7, 11);
  c.beginPath(); chim(c); c.fill(); c.stroke();
  hatch(c, chim, [x + 16, y - 64, x + 23, y - 53], Math.PI / 2, 1.2, 0.6, seed + 5);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(x + 19.5, y - 66);
  c.bezierCurveTo(x + 14, y - 74, x + 26, y - 78, x + 20, y - 86);
  c.bezierCurveTo(x + 15, y - 92, x + 26, y - 96, x + 24, y - 104);
  c.stroke();
  // pierres du mur
  c.lineWidth = 0.6;
  c.beginPath();
  for (let k = 0; k < 14; k++) {
    const sx = x - 26 + r() * 50, sy = y - 26 + r() * 24;
    if (sx > x - 12 && sx < x + 1) continue;
    c.moveTo(sx, sy); c.lineTo(sx + 3 + r() * 3, sy + (r() - 0.5));
  }
  c.stroke();
  // barrière
  c.lineWidth = 0.9;
  c.beginPath();
  for (let k = 0; k < 5; k++) { const fx = x - 70 + k * 9; c.moveTo(fx, y + 2); c.lineTo(fx, y - 12); }
  c.moveTo(x - 72, y - 9); c.lineTo(x - 32, y - 9); c.moveTo(x - 72, y - 3); c.lineTo(x - 32, y - 3);
  c.stroke();
}

function jouySwanPond(c, x, y, seed) {
  const r = mulberry32(seed);
  // eau : rides horizontales
  c.lineWidth = 0.75;
  c.beginPath();
  for (let k = 0; k < 11; k++) {
    const yy = y + k * 2.6 - 4, half = 70 * Math.sqrt(1 - ((k - 5) / 6.2) ** 2);
    let xx = x - half + r() * 8;
    while (xx < x + half) {
      const l = 5 + r() * 16;
      c.moveTo(xx, yy); c.quadraticCurveTo(xx + l / 2, yy + 0.8, Math.min(x + half, xx + l), yy);
      xx += l + 3 + r() * 7;
    }
  }
  c.stroke();
  // roseaux et massettes
  c.lineWidth = 0.8;
  c.beginPath();
  for (let k = 0; k < 13; k++) {
    const rx = x + 38 + r() * 30, h = 18 + r() * 26, bend = (r() - 0.3) * 8;
    c.moveTo(rx, y - 2); c.quadraticCurveTo(rx + bend * 0.3, y - h * 0.6, rx + bend, y - h);
  }
  c.stroke();
  c.fillStyle = JOUY_INK;
  for (let k = 0; k < 4; k++) {
    const rx = x + 42 + r() * 22, ry = y - 26 - r() * 16;
    c.beginPath(); c.ellipse(rx, ry, 1.5, 4, 0.1, 0, TAU); c.fill();
  }
  // cygne
  c.save();
  c.translate(x - 12, y - 6);
  c.fillStyle = JOUY_GROUND;
  c.lineWidth = 1;
  const body = (cc) => {
    cc.moveTo(-20, 0); cc.bezierCurveTo(-24, -9, -10, -13, 2, -9);
    cc.bezierCurveTo(8, -7, 10, -3, 14, -3); cc.bezierCurveTo(16, 1, 10, 4, 0, 4);
    cc.bezierCurveTo(-10, 4, -18, 3, -20, 0); cc.closePath();
  };
  c.beginPath(); body(c); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(8, -6); c.bezierCurveTo(16, -12, 6, -22, 10, -30); c.bezierCurveTo(12, -34, 18, -33, 19, -29);
  c.lineTo(23, -27); c.lineTo(18, -26.5); c.bezierCurveTo(14, -28, 12, -24, 13, -18); c.bezierCurveTo(14, -12, 16, -6, 12, -3.5); c.stroke();
  c.lineWidth = 0.7;
  c.beginPath();
  for (let k = 0; k < 6; k++) { c.moveTo(-14 + k * 3.5, -7 + k * 0.3); c.quadraticCurveTo(-8 + k * 3.5, -4, -3 + k * 3.5, -6 + k * 0.2); }
  c.stroke();
  hatch(c, body, [-22, -4, 16, 4], 0.05, 1.2, 0.5, seed + 1);
  c.restore();
}

function jouyScene(c) {
  c.strokeStyle = JOUY_INK;
  c.fillStyle = JOUY_INK;
  // Grande vignette : arbre, bergère, mouton, ruines
  wrap(c, 170, 200, 215, (cc) => {
    cc.strokeStyle = JOUY_INK;
    cc.translate(170, 230); cc.scale(1.2, 1.2); cc.translate(-170, -230);
    jouyGround(cc, 20, 350, 318, 501, 20);
    jouyRuins(cc, 212, 318, 502);
    jouyTree(cc, 92, 318, 200, 503, 10, 1.05);
    jouySheep(cc, 150, 316, 1, 504);
    jouyShepherdess(cc, 192, 316, 1.05);
    jouyBird(cc, 250, 132, 1, -0.15);
    jouyBird(cc, 272, 116, 0.8, 0.1);
    jouyBird(cc, 296, 140, 0.9, -0.05);
  });
  // Chaumière et arbre
  wrap(c, 420, 430, 150, (cc) => {
    cc.strokeStyle = JOUY_INK;
    cc.translate(420, 440); cc.scale(1.18, 1.18); cc.translate(-420, -440);
    jouyGround(cc, 330, 515, 470, 511, 14);
    jouyTree(cc, 492, 470, 120, 512, -6, 0.9);
    jouyCottage(cc, 415, 468, 513);
  });
  // Petite île : arbuste et oiseaux
  wrap(c, 420, 190, 100, (cc) => {
    cc.strokeStyle = JOUY_INK;
    cc.translate(430, 200); cc.scale(1.12, 1.12); cc.translate(-430, -200);
    jouyGround(cc, 370, 470, 250, 521, 10);
    jouyTree(cc, 420, 250, 90, 522, 12, 0.8);
    jouyBird(cc, 360, 150, 0.9, 0.2);
    jouyBird(cc, 470, 110, 0.75, -0.25);
  });
  // Mare au cygne
  wrap(c, 150, 450, 115, (cc) => {
    cc.strokeStyle = JOUY_INK;
    cc.translate(140, 450); cc.scale(1.15, 1.15); cc.translate(-140, -450);
    jouySwanPond(cc, 150, 456, 531);
    jouyBird(cc, 60, 395, 0.8, -0.1);
    jouyBird(cc, 262, 392, 0.85, 0.12);
    jouyBird(cc, 284, 404, 0.7, -0.08);
  });
}

function drawJouy(ctx, S) {
  printed(ctx, S, {
    seed: 91, ground: JOUY_GROUND, draw: jouyScene, mottle: 0.025,
    weave: {
      nx: 250, ny: 236, seed: 91, warpW: 0.46, weftW: 0.46,
      warp: { noise: 0.15, slubs: 0.25, slubAmp: 0.35, jit: 0.07, tone: 0.025 },
      weft: { noise: 0.2, slubs: 0.35, slubAmp: 0.4, jit: 0.08, tone: 0.03 },
      kBase: 0.84, kProf: 0.15, kZ: 0.06, kFib: 0.05, gap: 0.78, wave: 0.14, ss: 1,
    },
  });
}

// --- Formes végétales génériques -------------------------------------------------------------
// Épine dorsale (courbe de Bézier quadratique) échantillonnée : points, tangentes, normales.
function spine(p0, p1, p2, n) {
  const P = [], T = [], N = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    let tx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    let ty = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    P.push([x, y]); T.push([tx, ty]); N.push([-ty, tx]);
  }
  return { P, T, N };
}

// Feuille : contour construit autour d'une épine avec un profil de largeur w(t) (côté 1 et -1).
function leafPoly(c, sp, wfn, side = 0) {
  const { P, N } = sp, n = P.length - 1;
  c.beginPath();
  if (side >= 0) {
    for (let k = 0; k <= n; k++) {
      const w = wfn(k / n, 1);
      const x = P[k][0] + N[k][0] * w, y = P[k][1] + N[k][1] * w;
      if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
  } else {
    c.moveTo(P[0][0], P[0][1]);
    for (let k = 1; k <= n; k++) c.lineTo(P[k][0], P[k][1]);
  }
  if (side <= 0) {
    for (let k = n; k >= 0; k--) {
      const w = wfn(k / n, -1);
      c.lineTo(P[k][0] - N[k][0] * w, P[k][1] - N[k][1] * w);
    }
  } else {
    for (let k = n; k >= 0; k--) c.lineTo(P[k][0], P[k][1]);
  }
  c.closePath();
}

// --- Damas ---------------------------------------------------------------------------------
function acanthus(c, p0, p1, p2, wid, lobes, lobeAmp = 0.35, veins = true) {
  const sp = spine(p0, p1, p2, 40);
  const wf = (t) => wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.8) * (1 + lobeAmp * Math.pow(Math.abs(Math.sin(lobes * Math.PI * t)), 0.5) - lobeAmp * 0.5);
  c.fillStyle = '#fff';
  leafPoly(c, sp, wf);
  c.fill();
  if (veins) {
    c.strokeStyle = '#000';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(sp.P[3][0], sp.P[3][1]);
    for (let k = 4; k < 37; k++) c.lineTo(sp.P[k][0], sp.P[k][1]);
    c.stroke();
    c.lineWidth = 1.1;
    c.beginPath();
    for (let q = 1; q < lobes; q++) {
      const k = Math.round((q / lobes) * 40);
      for (const s of [1, -1]) {
        const w = wf(k / 40) * 0.6;
        c.moveTo(sp.P[k][0], sp.P[k][1]);
        c.quadraticCurveTo(sp.P[k][0] + sp.N[k][0] * w * s * 0.6 + sp.T[k][0] * 3, sp.P[k][1] + sp.N[k][1] * w * s * 0.6 + sp.T[k][1] * 3,
          sp.P[Math.min(40, k + 3)][0] + sp.N[Math.min(40, k + 3)][0] * w * s, sp.P[Math.min(40, k + 3)][1] + sp.N[Math.min(40, k + 3)][1] * w * s);
      }
    }
    c.stroke();
  }
}

function spiralBand(c, cx, cy, r0, r1, a0, a1, w0, w1) {
  const n = 40, L = [], R = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t, w = (w0 + (w1 - w0) * t) / 2;
    L.push([cx + Math.cos(a) * (r + w), cy + Math.sin(a) * (r + w)]);
    R.push([cx + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w)]);
  }
  c.beginPath();
  L.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  for (let k = n; k >= 0; k--) c.lineTo(R[k][0], R[k][1]);
  c.closePath();
  c.fill();
  const e = R[n];
  c.beginPath(); c.arc((L[n][0] + e[0]) / 2, (L[n][1] + e[1]) / 2, w1 / 2 + 0.6, 0, TAU); c.fill();
}

// Demi-médaillon baroque (x ≥ 0), dessiné en miroir : cadre en ogive feuillagé, vase, palmette.
function damaskHalf(c) {
  c.fillStyle = '#fff';
  // cadre en ogive : deux grandes feuilles d'acanthe et volute à la jonction
  acanthus(c, [2, 136], [100, 122], [98, 6], 13, 6, 0.5);
  acanthus(c, [98, -2], [106, -108], [2, -142], 13, 6, 0.5);
  c.fillStyle = '#fff';
  spiralBand(c, 110, 2, 13, 3, Math.PI, Math.PI * 2.9, 8, 2.5);
  acanthus(c, [104, -14], [128, -26], [124, -60], 8, 3, 0.45);
  acanthus(c, [104, 18], [130, 30], [122, 64], 8, 3, 0.45);
  // perles le long du cadre
  c.fillStyle = '#fff';
  for (let k = 0; k < 7; k++) {
    const t = 0.18 + k * 0.1, a = -Math.PI / 2 + t * Math.PI;
    c.beginPath(); c.arc(Math.cos(a) * 78, Math.sin(a) * 112, 2.6, 0, TAU); c.fill();
  }
  // vase (coupe godronnée) et pied
  c.beginPath();
  c.moveTo(0, 46); c.bezierCurveTo(28, 46, 48, 52, 44, 68); c.bezierCurveTo(34, 82, 14, 86, 0, 86); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(0, 84); c.lineTo(6, 84); c.lineTo(4, 98); c.lineTo(0, 98); c.fill();
  c.beginPath(); c.ellipse(0, 102, 18, 5.5, 0, 0, TAU); c.fill();
  spiralBand(c, 52, 62, 9, 2, -Math.PI / 2, Math.PI * 1.3, 5, 2);
  c.strokeStyle = '#000'; c.lineWidth = 1.6;
  c.beginPath();
  for (const gx of [8, 18, 28]) { c.moveTo(gx, 52); c.quadraticCurveTo(gx + 3, 68, gx - 2 + gx * 0.1, 82); }
  c.moveTo(0, 50); c.bezierCurveTo(24, 50, 40, 54, 42, 60);
  c.stroke();
  // feuilles enveloppantes qui s'enroulent vers l'extérieur
  acanthus(c, [6, 44], [58, 40], [56, -10], 10, 4, 0.4);
  c.fillStyle = '#fff';
  spiralBand(c, 44, -16, 11, 2.5, 0, -Math.PI * 1.7, 6, 2);
  // grenade écaillée posée sur le vase
  c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(0, 26); c.lineTo(5, 26); c.lineTo(4, 48); c.lineTo(0, 48); c.fill();
  c.beginPath(); c.ellipse(0, -6, 26, 34, 0, 0, TAU); c.fill();
  c.save();
  c.beginPath(); c.ellipse(0, -6, 22, 30, 0, 0, TAU); c.clip();
  c.strokeStyle = '#000'; c.lineWidth = 1.4;
  c.beginPath();
  for (let row = 0; row < 8; row++) {
    const yy = -32 + row * 8;
    for (let col = -3; col <= 3; col++) {
      const xx = col * 10 + (row % 2) * 5;
      c.moveTo(xx - 5, yy); c.quadraticCurveTo(xx, yy + 7, xx + 5, yy);
    }
  }
  c.stroke();
  c.restore();
  c.strokeStyle = '#000'; c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(0, -6, 26, 34, 0, 0, TAU); c.stroke();
  // couronne de la grenade et fleuron sommital
  acanthus(c, [0, -38], [0, -52], [0, -70], 8, 2, 0.35);
  acanthus(c, [3, -38], [14, -48], [24, -62], 6, 2, 0.35);
  acanthus(c, [0, -80], [0, -100], [0, -124], 9, 3, 0.4);
  c.fillStyle = '#fff';
  spiralBand(c, 16, -96, 8, 2, Math.PI * 0.7, -Math.PI * 1.0, 4, 1.6);
  // rosette et petite feuille dans les écoinçons
  c.beginPath(); c.arc(64, -56, 7.5, 0, TAU); c.fill();
  c.fillStyle = '#000'; c.beginPath(); c.arc(64, -56, 2.6, 0, TAU); c.fill();
  c.fillStyle = '#fff';
  for (let q = 0; q < 6; q++) {
    const a = (q / 6) * TAU;
    c.beginPath(); c.ellipse(64 + Math.cos(a) * 11, -56 + Math.sin(a) * 11, 4.2, 2.2, a, 0, TAU); c.fill();
  }
  acanthus(c, [60, 100], [80, 106], [74, 126], 6, 2, 0.4, false);
  // pendentif
  acanthus(c, [0, 138], [0, 150], [0, 170], 7, 2, 0.35);
}

function damaskMotif(c, x, y, s) {
  wrap(c, x, y, 175 * s, (cc) => {
    for (const m of [1, -1]) {
      cc.save();
      cc.translate(x, y); cc.scale(m * s, s);
      damaskHalf(cc);
      cc.restore();
    }
  });
}

function damaskSprig(c, x, y, s) {
  wrap(c, x, y, 60 * s, (cc) => {
    cc.save();
    cc.translate(x, y); cc.scale(s, s);
    for (let q = 0; q < 4; q++) {
      cc.save(); cc.rotate((q * Math.PI) / 2 + Math.PI / 4);
      acanthus(cc, [0, -6], [4, -24], [0, -44], 7, 3, 0.4, true);
      cc.restore();
    }
    for (let q = 0; q < 4; q++) {
      cc.save(); cc.rotate((q * Math.PI) / 2);
      acanthus(cc, [0, -8], [0, -18], [0, -28], 4, 2, 0.3, false);
      cc.restore();
    }
    cc.fillStyle = '#fff';
    cc.beginPath(); cc.arc(0, 0, 8, 0, TAU); cc.fill();
    cc.fillStyle = '#000';
    cc.beginPath(); cc.arc(0, 0, 3, 0, TAU); cc.fill();
    cc.restore();
  });
}

function drawDamas(ctx, S) {
  const k = S / D;
  const M = drawLayer(ctx, S, '#000', (c) => {
    damaskMotif(c, 128, 118, 0.96);
    damaskMotif(c, 384, 374, 0.96);
    damaskSprig(c, 384, 122, 1.15);
    damaskSprig(c, 128, 378, 1.15);
  });
  const A = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) A[p] = M[p * 4] / 255;
  const Ab = blurWrap(A, S, 1.2 * k, 1);
  // satin : flottés verticaux (fond, face trame) vs horizontaux (motif, face chaîne)
  const nt = 360, nl = 90;
  const sheen = fbm(S, { fx: 2, fy: 3, oct: 4, seed: 111 });
  const sheen2 = fbm(S, { fx: 7, fy: 2, oct: 3, seed: 112 });
  const ground = hex('#B8975A'), motif = hex('#CDB27A'), hi = hex('#E4CF9C');
  const out = new Float32Array(S * S * 3);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const p = y * S + x, u = (x + 0.5) / S;
      // stries du satin (fils flottants) : bruit de valeur allongé, périodique
      const ci = Math.floor(u * nt), cv = v * nl, c0 = Math.floor(cv), ct = cv - c0;
      const g0 = hash(ci, c0 % nl, 113), g1 = hash(ci, (c0 + 1) % nl, 113);
      const gs = g0 + (g1 - g0) * (ct * ct * (3 - 2 * ct)) - 0.5;
      const ri = Math.floor(v * nt), cu = u * nl, r0 = Math.floor(cu), rt = cu - r0;
      const m0 = hash(r0 % nl, ri, 114), m1 = hash((r0 + 1) % nl, ri, 114);
      const ms = m0 + (m1 - m0) * (rt * rt * (3 - 2 * rt)) - 0.5;
      const a = A[p];
      const gl = 1 + 0.06 * gs + 0.03 * sheen[p];
      const sh = clamp01(0.45 + 0.9 * sheen[p] + 0.35 * sheen2[p]);
      const ml = 1 + 0.05 * ms;
      const edge = Math.abs(Ab[p] - a) * 0.5; // léger liseré au changement d'armure
      for (let ch = 0; ch < 3; ch++) {
        const gc = ground[ch] * gl;
        const mc = (motif[ch] * (0.94 + 0.06 * sh) + (hi[ch] - motif[ch]) * sh * sh * 0.7) * ml;
        out[p * 3 + ch] = (gc + (mc - gc) * a) * (1 - 0.18 * edge);
      }
    }
  }
  put(ctx, S, out, 1.2, 111);
}

// --- Broderies -----------------------------------------------------------------------------
// Pétale en coordonnées polaires autour de (x,y), orienté a, demi-ouverture hw, rayon R.
function petalPath(c, x, y, a, hw, R, r0, notch = 0.06) {
  const n = 28;
  c.beginPath();
  c.moveTo(x + Math.cos(a - hw * 0.55) * r0, y + Math.sin(a - hw * 0.55) * r0);
  for (let k = 0; k <= n; k++) {
    const t = -1 + (2 * k) / n, th = a + t * hw;
    let rr = R * (0.3 + 0.7 * Math.pow(Math.max(0, 1 - t * t), 0.35));
    rr *= 1 - notch * Math.exp(-(t * t) / 0.02);
    c.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr);
  }
  c.lineTo(x + Math.cos(a + hw * 0.55) * r0, y + Math.sin(a + hw * 0.55) * r0);
  c.closePath();
}

// Points lancés parallèles dans une forme déjà tracée (clip) ; brillance selon l'orientation.
function satinFill(c, shape, lines, col, k, lw = 1.5) {
  c.save();
  shape(); c.clip();
  // regroupement par niveau de brillance : un seul tracé par niveau (rapide)
  const groups = new Map();
  for (const [x0, y0, x1, y1, j] of lines) {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const sheen = 0.9 + 0.1 * Math.cos(2 * (ang + 0.8)) + j;
    const q = Math.round(sheen * 40);
    if (!groups.has(q)) groups.set(q, []);
    groups.get(q).push(x0, y0, x1, y1);
  }
  for (const pass of [0, 1]) {
    c.lineWidth = pass ? lw * 0.45 : lw;
    for (const [q, a] of groups) {
      c.strokeStyle = css(shade(col, (pass ? 1.07 : 0.88) * (q / 40)));
      c.beginPath();
      for (let i = 0; i < a.length; i += 4) { c.moveTo(a[i], a[i + 1]); c.lineTo(a[i + 2], a[i + 3]); }
      c.stroke();
    }
  }
  c.restore();
}

function camellia(c, x, y, R, rot, seed, k) {
  const r = mulberry32(seed);
  const ECRU = [290, 278, 256], GOLD = hex('#C9A552');
  const rings = [[7, R, 0.52, 0.2], [5, R * 0.72, 0.6, 0.18], [4, R * 0.46, 0.7, 0.12]];
  rings.forEach(([n, Rr, hwF, r0F], ri) => {
    for (let q = 0; q < n; q++) {
      const a = rot + (q / n) * TAU + ri * 0.45 + (r() - 0.5) * 0.15;
      const hw = (Math.PI / n) * (1 + hwF) * (0.95 + 0.1 * r());
      const shape = () => petalPath(c, x, y, a, hw, Rr * (0.94 + 0.08 * r()), Rr * r0F, 0.07);
      // ombre portée du pétale sur le rang inférieur
      c.save();
      c.shadowColor = 'rgba(110,85,45,0.4)';
      c.shadowBlur = 3.5 * k;
      c.shadowOffsetX = 0.8 * k; c.shadowOffsetY = 1.4 * k;
      c.fillStyle = css(shade(ECRU, 0.9));
      shape(); c.fill();
      c.restore();
      // points longs et courts rayonnants
      const lines = [];
      const m = Math.round((2 * hw * Rr) / 1.25);
      for (let s = 0; s <= m; s++) {
        const th = a - hw * 1.05 + (2.1 * hw * s) / m;
        const rs = Rr * (0.12 + (s % 2 ? 0.28 : 0.1) * r());
        lines.push([x + Math.cos(th) * rs, y + Math.sin(th) * rs, x + Math.cos(th) * Rr * 1.1, y + Math.sin(th) * Rr * 1.1, (r() - 0.5) * 0.06 - 0.05 * ri]);
      }
      satinFill(c, shape, lines, ECRU, k, 1.55);
      // fil de contour plus sombre (point de tige fin)
      c.strokeStyle = css(mix(ECRU, hex('#A88A55'), 0.3), 0.55);
      c.lineWidth = 0.7;
      shape(); c.stroke();
    }
  });
  // coeur : noeuds dorés
  for (let q = 0; q < 26; q++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R * 0.2;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    c.fillStyle = css(shade(GOLD, 0.7));
    c.beginPath(); c.arc(px + 0.4, py + 0.5, 1.9, 0, TAU); c.fill();
    c.fillStyle = css(shade(GOLD, 1.0 + 0.15 * r()));
    c.beginPath(); c.arc(px, py, 1.5, 0, TAU); c.fill();
    c.fillStyle = css(shade(GOLD, 1.35), 0.8);
    c.beginPath(); c.arc(px - 0.5, py - 0.5, 0.6, 0, TAU); c.fill();
  }
}

function embLeaf(c, x, y, ang, len, wid, seed, k, col = hex('#E6D6AE')) {
  const r = mulberry32(seed);
  const dx = Math.cos(ang), dy = Math.sin(ang), bend = (r() - 0.5) * 0.35;
  const p0 = [x, y], p2 = [x + dx * len, y + dy * len];
  const p1 = [x + dx * len * 0.5 - dy * len * bend, y + dy * len * 0.5 + dx * len * bend];
  const sp = spine(p0, p1, p2, 30);
  const wf = (t) => wid * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + t * 0.96)), 0.9) * (t < 0.5 ? 0.85 + 0.3 * t : 1);
  for (const side of [1, -1]) {
    const shape = () => leafPoly(c, sp, wf, side);
    c.save();
    c.shadowColor = 'rgba(110,85,45,0.32)';
    c.shadowBlur = 2.5 * k; c.shadowOffsetY = 1 * k;
    c.fillStyle = css(shade(col, 0.9));
    shape(); c.fill();
    c.restore();
    // point de feuille (fishbone) : points obliques de la nervure vers le bord
    const lines = [];
    const n = Math.round(len / 1.3);
    for (let s = 0; s <= n + 4; s++) {
      const t = Math.min(1, s / n), kk = Math.round(t * 30);
      const P = sp.P[kk], T = sp.T[kk], N = sp.N[kk];
      const w = wid * 1.4;
      lines.push([P[0], P[1], P[0] + (N[0] * side * 0.8 + T[0] * 0.7) * w, P[1] + (N[1] * side * 0.8 + T[1] * 0.7) * w, (side > 0 ? 0.03 : -0.05) + (r() - 0.5) * 0.05]);
    }
    satinFill(c, shape, lines, col, k, 1.5);
  }
  // nervure centrale dorée
  c.strokeStyle = css(hex('#BF9C4F'));
  c.lineWidth = 1.3;
  c.beginPath();
  sp.P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.stroke();
}

// Point de tige : petits points obliques qui se chevauchent le long d'une courbe.
function stemStitch(c, p0, p1, p2, col, w = 2.2) {
  const sp = spine(p0, p1, p2, 60);
  const L = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.3;
  const n = Math.max(4, Math.round(L / 2.6));
  for (let s = 0; s < n; s++) {
    const t0 = s / n, t1 = Math.min(1, (s + 1.7) / n);
    const a = sp.P[Math.round(t0 * 60)], b = sp.P[Math.round(t1 * 60)], N = sp.N[Math.round(t0 * 60)];
    c.strokeStyle = css(shade(col, 0.78));
    c.lineWidth = w;
    c.beginPath(); c.moveTo(a[0] - N[0] * 0.6, a[1] - N[1] * 0.6); c.lineTo(b[0] + N[0] * 0.6, b[1] + N[1] * 0.6); c.stroke();
    c.strokeStyle = css(shade(col, 1.08));
    c.lineWidth = w * 0.4;
    c.beginPath(); c.moveTo(a[0] - N[0] * 0.5, a[1] - N[1] * 0.5); c.lineTo(b[0] + N[0] * 0.5, b[1] + N[1] * 0.5); c.stroke();
  }
}

function camelliaBud(c, x, y, ang, s, seed, k) {
  const r = mulberry32(seed);
  const ECRU = [290, 278, 256];
  embLeaf(c, x, y, ang + 0.6, 14 * s, 4 * s, seed + 1, k);
  embLeaf(c, x, y, ang - 0.6, 14 * s, 4 * s, seed + 2, k);
  const cx = x + Math.cos(ang) * 9 * s, cy = y + Math.sin(ang) * 9 * s;
  const shape = () => { c.beginPath(); c.ellipse(cx, cy, 11 * s, 8 * s, ang, 0, TAU); };
  c.save(); c.shadowColor = 'rgba(110,85,45,0.38)'; c.shadowBlur = 3 * k; c.shadowOffsetY = 1.2 * k;
  c.fillStyle = css(shade(ECRU, 0.9)); shape(); c.fill(); c.restore();
  const lines = [];
  for (let q = -14; q <= 14; q++) {
    const px = cx + Math.cos(ang + Math.PI / 2) * q * 0.7 * s, py = cy + Math.sin(ang + Math.PI / 2) * q * 0.7 * s;
    lines.push([px - Math.cos(ang) * 14 * s, py - Math.sin(ang) * 14 * s, px + Math.cos(ang) * 14 * s, py + Math.sin(ang) * 14 * s, (r() - 0.5) * 0.05]);
  }
  satinFill(c, shape, lines, ECRU, k, 1.5);
  embLeaf(c, x, y, ang, 12 * s, 5 * s, seed + 3, k);
}

function cottonGround(S, color, seed, o = {}) {
  const base = hex(color);
  const W = weave(S, {
    nx: o.nx ?? 236, ny: o.ny ?? 224, seed, warpW: 0.45, weftW: 0.46,
    warp: { noise: 0.18, slubs: 0.35, slubAmp: 0.35, jit: 0.08, tone: 0.035 },
    weft: { noise: 0.22, slubs: 0.5, slubAmp: 0.45, jit: 0.1, tone: 0.04 },
    kBase: o.kBase ?? 0.8, kProf: o.kProf ?? 0.2, kZ: 0.08, kFib: 0.07, gap: o.gap ?? 0.74, wave: 0.14, ss: o.ss ?? 1,
  });
  const cl = fbm(S, { fx: 3, oct: 4, seed: seed + 1 });
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = W[p * 3] * (1 + cl[p] * 0.025);
    out[p * 3] = base[0] * m; out[p * 3 + 1] = base[1] * m; out[p * 3 + 2] = base[2] * m;
  }
  return out;
}

function drawCamelia(ctx, S) {
  const k = S / D;
  const ground = cottonGround(S, '#EEE7D9', 121);
  const GOLD = hex('#C2A15A');
  const out = composeRelief(ctx, S, ground, (c) => {
    // bouquet 1
    wrap(c, 160, 170, 175, (cc) => {
      cc.translate(150, 172); cc.scale(1.28, 1.28); cc.translate(-150, -172);
      stemStitch(cc, [60, 290], [110, 230], [150, 180], GOLD);
      stemStitch(cc, [120, 222], [170, 200], [238, 120], GOLD, 1.9);
      stemStitch(cc, [96, 252], [60, 230], [40, 196], GOLD, 1.8);
      embLeaf(cc, 104, 238, -2.5, 58, 17, 131, k);
      embLeaf(cc, 128, 214, 0.35, 64, 19, 132, k);
      embLeaf(cc, 196, 158, -1.35, 46, 14, 133, k);
      embLeaf(cc, 44, 200, -1.9, 40, 12, 134, k);
      embLeaf(cc, 80, 262, 2.6, 44, 13, 135, k);
      camelliaBud(cc, 238, 120, -0.9, 1.1, 136, k);
      camelliaBud(cc, 40, 196, -1.7, 0.85, 137, k);
      camellia(cc, 150, 172, 50, 0.3, 138, k);
    });
    // bouquet 2
    wrap(c, 390, 400, 160, (cc) => {
      cc.translate(400, 402); cc.scale(1.3, 1.3); cc.translate(-400, -402);
      stemStitch(cc, [470, 500], [440, 450], [400, 408], GOLD);
      stemStitch(cc, [438, 448], [380, 470], [322, 462], GOLD, 1.8);
      embLeaf(cc, 448, 460, -0.6, 52, 16, 141, k);
      embLeaf(cc, 420, 440, 2.2, 56, 17, 142, k);
      embLeaf(cc, 356, 468, 1.9, 40, 12, 143, k);
      stemStitch(cc, [404, 392], [396, 368], [376, 352], GOLD, 1.6);
      embLeaf(cc, 376, 352, -2.1, 42, 13, 144, k);
      camelliaBud(cc, 322, 462, 2.6, 0.95, 145, k);
      camellia(cc, 400, 402, 42, 1.1, 146, k);
    });
    // brindilles
    wrap(c, 400, 150, 75, (cc) => {
      cc.translate(400, 158); cc.scale(1.2, 1.2); cc.translate(-400, -158);
      stemStitch(cc, [370, 200], [392, 160], [430, 118], GOLD, 1.7);
      embLeaf(cc, 380, 180, -2.4, 30, 9, 151, k);
      embLeaf(cc, 396, 152, -0.2, 32, 10, 152, k);
      embLeaf(cc, 414, 134, -2.2, 26, 8, 153, k);
      camelliaBud(cc, 430, 118, -0.8, 0.8, 154, k);
    });
    wrap(c, 170, 420, 75, (cc) => {
      cc.translate(162, 428); cc.scale(1.2, 1.2); cc.translate(-162, -428);
      stemStitch(cc, [120, 460], [160, 430], [205, 395], GOLD, 1.7);
      embLeaf(cc, 140, 446, 2.3, 30, 9, 161, k);
      embLeaf(cc, 164, 428, -1.0, 32, 10, 162, k);
      embLeaf(cc, 188, 408, 2.0, 26, 8, 163, k);
      camelliaBud(cc, 205, 395, -0.7, 0.75, 164, k);
    });
  }, { puff: 2.4, sx: 1.4, sy: 2.2, blur: 2.2, shadow: 0.4, relief: 0.9, edge: 0.12, spec: 0.2 });
  put(ctx, S, out, 1, 121);
}

function drawPlumetis(ctx, S) {
  const k = S / D;
  const base = hex('#EEE6D6');
  const W = weave(S, {
    nx: 210, ny: 190, seed: 171, warpW: 0.3, weftW: 0.26,
    warp: { noise: 0.25, slubs: 0.4, slubAmp: 0.4, jit: 0.18, tone: 0.04 },
    weft: { noise: 0.2, slubs: 0.3, slubAmp: 0.35, jit: 0.14, tone: 0.03 },
    kBase: 0.8, kProf: 0.14, kZ: 0.05, kFib: 0.06, gap: 1.05, wave: 0.22, undul: 0.4, ss: S < 400 ? 2 : 1,
  });
  const cloud = fbm(S, { fx: 4, fy: 3, oct: 5, seed: 172 });
  const ground = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = W[p * 3] * (1 + cloud[p] * 0.02);
    ground[p * 3] = base[0] * m; ground[p * 3 + 1] = base[1] * m; ground[p * 3 + 2] = base[2] * m;
  }
  matchMean(ground, base, 1);
  const DOT = [292, 286, 272]; // fil blanc brillant (valeurs > 255 : reste clair une fois ombré)
  const out = composeRelief(ctx, S, ground, (c) => {
    const n = 8;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (j % 2) * 0.5) * (D / n) + (hash(i, j, 173) - 0.5) * 1.6;
      const y = (j + 0.5) * (D / n) + (hash(i, j, 174) - 0.5) * 1.6;
      const seed = ihash(i * 31 + j, 175);
      wrap(c, x, y, 12, (cc) => {
        const r = mulberry32(seed);
        const rx = 7.2 + r() * 0.5, ry = 6.4 + r() * 0.4, rot = (r() - 0.5) * 0.4;
        const shape = () => { cc.beginPath(); cc.ellipse(x, y, rx, ry, rot, 0, TAU); };
        cc.fillStyle = css(shade(DOT, 0.93)); shape(); cc.fill();
        const lines = [];
        const a = 0.9 + rot;
        for (let q = -9; q <= 9; q++) {
          const px = x + Math.cos(a + Math.PI / 2) * q * 0.95, py = y + Math.sin(a + Math.PI / 2) * q * 0.95;
          lines.push([px - Math.cos(a) * 9, py - Math.sin(a) * 9, px + Math.cos(a) * 9, py + Math.sin(a) * 9, (r() - 0.5) * 0.05]);
        }
        satinFill(cc, shape, lines, DOT, k, 1.2);
      });
    }
  }, { puff: 1.5, sx: 1.8, sy: 2.6, blur: 2.2, shadow: 0.24, relief: 0.42, edge: 0.08, spec: 0.12 });
  put(ctx, S, out, 0.8, 171);
}

// --- Macramé -------------------------------------------------------------------------------
function cordStroke(c, p0, c1, c2, p3, w, seed) {
  const path = () => { c.beginPath(); c.moveTo(p0[0], p0[1]); c.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]); };
  const layers = [[1, '#9A8B72'], [0.86, '#C2B59C'], [0.68, '#DBD0BA'], [0.46, '#EAE1CE'], [0.2, '#F6F0E3']];
  for (const [f, col] of layers) { c.lineWidth = w * f; c.strokeStyle = col; path(); c.stroke(); }
  // torsion du cordon (3 brins) : sillons obliques
  const r = mulberry32(seed);
  const pts = [];
  for (let k = 0; k <= 60; k++) {
    const t = k / 60, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
    ]);
  }
  let acc = r() * 3;
  c.strokeStyle = 'rgba(105,88,64,0.55)';
  c.lineWidth = 0.85;
  c.beginPath();
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1], l = Math.hypot(dx, dy);
    acc += l;
    if (acc >= w * 0.55) {
      acc -= w * 0.55;
      const tx = dx / l, ty = dy / l, nx = -ty, ny = tx, h = w * 0.46;
      const [px, py] = pts[k];
      c.moveTo(px - nx * h - tx * h * 0.55, py - ny * h - ty * h * 0.55);
      c.quadraticCurveTo(px + tx * 0.6, py + ty * 0.6, px + nx * h + tx * h * 0.55, py + ny * h + ty * h * 0.55);
    }
  }
  c.stroke();
}

function squareKnot(c, x, y, seed) {
  const r = mulberry32(seed);
  const w = 6.2;
  // âmes verticales
  cordStroke(c, [x - 2.6, y - 16], [x - 2.6, y - 6], [x - 2.6, y + 6], [x - 2.6, y + 16], w * 0.9, seed + 1);
  cordStroke(c, [x + 2.6, y - 16], [x + 2.6, y - 6], [x + 2.6, y + 6], [x + 2.6, y + 16], w * 0.9, seed + 2);
  const lv = [-11, -3.5, 4, 11.5];
  // boucles latérales
  for (let q = 0; q < 3; q++) {
    for (const s of [-1, 1]) {
      const ya = y + lv[q] + 1, yb = y + lv[q + 1] - 1;
      cordStroke(c, [x + s * 9, ya], [x + s * 16.5, ya - 1], [x + s * 16.5, yb + 1], [x + s * 9, yb], w, seed + 10 + q * 2 + (s > 0 ? 1 : 0));
    }
  }
  // barrettes horizontales (brins de travail)
  lv.forEach((dy, q) => {
    const tilt = (q % 2 ? 1 : -1) * 1.6 + (r() - 0.5);
    cordStroke(c, [x - 12.5, y + dy - tilt], [x - 4, y + dy + 2.2], [x + 4, y + dy + 2.2], [x + 12.5, y + dy + tilt], w, seed + 20 + q);
  });
}

function drawMacrame(ctx, S) {
  const k = S / D;
  const bgc = hex('#6E6254');
  const n1 = fbm(S, { fx: 3, oct: 5, seed: 181 });
  const bg = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = 1 + 0.07 * n1[p] + (hash(p % S, (p / S) | 0, 182) - 0.5) * 0.04;
    bg[p * 3] = bgc[0] * m * 0.93; bg[p * 3 + 1] = bgc[1] * m * 0.93; bg[p * 3 + 2] = bgc[2] * m * 0.93;
  }
  // treillis : 3 noeuds par rang, 6 rangs en quinconce (losanges de ~10 cm)
  const P = D / 3, RS = D / 6, KS = 1.4;
  const knots = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) knots.push([(i + 0.5 * (j % 2) + 0.25) * P, (j + 0.5) * RS, i, j]);
  const out = composeRelief(ctx, S, bg, (c) => {
    // cordons diagonaux entre noeuds (paires de cordons parallèles)
    for (const [x, y, i, j] of knots) {
      for (const s of [-1, 1]) {
        const ex = x + (s * P) / 2, ey = y + RS;
        wrap(c, (x + ex) / 2, (y + ey) / 2, 75, (cc) => {
          for (const o of [-1, 1]) {
            const seed = ihash(i * 97 + j * 13 + (s + 1) * 3 + o + 2, 183);
            const sag = (hash(i, j * 4 + s + o, 184) - 0.5) * 6;
            const ox = o * 4.6, oy = -o * s * 1.6;
            const p0 = [x + s * 5 + ox, y + 20 + oy], p3 = [ex - s * 5 + ox, ey - 20 + oy];
            const c1 = [p0[0] + s * 24, p0[1] + 22 + sag], c2 = [p3[0] - s * 22, p3[1] - 24 + sag];
            cordStroke(cc, p0, c1, c2, p3, 8.2, seed);
          }
        });
      }
    }
    for (const [x, y, i, j] of knots) {
      wrap(c, x, y, 36, (cc) => {
        cc.translate(x, y); cc.scale(KS, KS); cc.translate(-x, -y);
        squareKnot(cc, x, y, ihash(i * 7 + j * 131, 185));
      });
    }
  }, { puff: 3.2, sx: 3.6, sy: 5, blur: 3.8, shadow: 0.62, relief: 1.1, edge: 0.22, spec: 0.1 });
  matchMean(out, hex('#B6A994'), 0.25);
  put(ctx, S, out, 1.2, 181);
}

// --- Ikat ----------------------------------------------------------------------------------
function drawIkat(ctx, S) {
  const nx = 192, ny = 176, LM = 512;
  const BRICK = hex('#A2472F'), OCHRE = hex('#C98F3A'), INDIGO = hex('#2C3A5A'), ECRU = hex('#ECE2CD');
  const r = mulberry32(191);
  // décalage (en unités design) de chaque fil : paquets ligaturés + glissement individuel
  const bundle = 4, nb = nx / bundle;
  const bOff = Array.from({ length: nb }, () => (r() - 0.5) * 9);
  const tOff = Array.from({ length: nx }, () => { const q = r() - 0.5; return q * 6 + Math.sign(q) * Math.pow(Math.abs(q) * 2, 6) * 10; });
  const soft = Array.from({ length: nx }, () => 0.012 + r() * 0.03);
  // motif : pavage de losanges emboîtés, deux familles en quinconce
  const col = (x, y, sft) => {
    const a = 128, b = 128;
    // centres du pavage : (x+y)/128 pair ; famille selon la position (période 512)
    const gx = Math.round((x + y) / 256), gy = Math.round((y - x) / 256);
    let best = 9, fam = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const u = gx + di, v = gy + dj, cx = (u - v) * 128, cy = (u + v) * 128;
      const d = Math.abs(x - cx) / a + Math.abs(y - cy) / b;
      if (d < best) {
        best = d;
        const ix = ((Math.round(cx / 128) % 4) + 4) % 4, iy = ((Math.round(cy / 128) % 4) + 4) % 4;
        fam = ix % 2 === 0 ? 2 : (ix + iy) % 4 === 2 ? 0 : 1;
      }
    }
    const d = best;
    const pal = fam === 0
      ? [[0.2, OCHRE], [0.3, ECRU], [0.5, INDIGO], [0.58, ECRU], [0.86, BRICK], [2, ECRU]]
      : fam === 1
        ? [[0.14, BRICK], [0.26, ECRU], [0.46, OCHRE], [0.56, ECRU], [0.84, INDIGO], [2, ECRU]]
        : [[0.1, INDIGO], [0.2, ECRU], [0.3, BRICK], [0.64, ECRU], [0.74, OCHRE], [2, ECRU]];
    let c = pal[pal.length - 1][1];
    for (let q = pal.length - 2; q >= 0; q--) {
      const t = smooth(pal[q][0] - sft, pal[q][0] + sft, d);
      c = mix(pal[q][1], c, t);
    }
    return c;
  };
  const warpColor = new Float32Array(nx * LM * 3);
  for (let i = 0; i < nx; i++) {
    const b = (i / bundle) | 0;
    const xq = (b + 0.5) * bundle * (D / nx) + (i % bundle - 1.5) * 0.4;
    for (let s = 0; s < LM; s++) {
      const y = ((s + 0.5) / LM) * D + bOff[b] + tOff[i];
      const c = col(xq, y, soft[i]);
      const q = (i * LM + s) * 3;
      warpColor[q] = c[0] / 255; warpColor[q + 1] = c[1] / 255; warpColor[q + 2] = c[2] / 255;
    }
  }
  const weftColor = threadColors(ny, () => shade(hex('#D9CDB6'), (1 + (r() - 0.5) * 0.08) / 255));
  const W = weave(S, {
    nx, ny, seed: 19, warpW: 0.48, weftW: 0.3, warpColor, warpColorL: LM, weftColor, gapColor: [0.3, 0.26, 0.22],
    warp: { noise: 0.2, slubs: 0.4, slubAmp: 0.3, jit: 0.08, tone: 0.05 },
    weft: { noise: 0.3, slubs: 0.6, slubAmp: 0.4, jit: 0.12, tone: 0.05 },
    kBase: 0.62, kProf: 0.34, kZ: 0.14, kFib: 0.12, gap: 0.8, wave: 0.14,
  });
  const cl = fbm(S, { fx: 3, oct: 4, seed: 192 });
  const out = new Float32Array(S * S * 3);
  for (let p = 0; p < S * S; p++) {
    const m = 255 * (1 + 0.03 * cl[p]);
    out[p * 3] = W[p * 3] * m; out[p * 3 + 1] = W[p * 3 + 1] * m; out[p * 3 + 2] = W[p * 3 + 2] * m;
  }
  put(ctx, S, out, 1.2, 19);
}

// --- Zellige -------------------------------------------------------------------------------
function drawZellige(ctx, S) {
  // étoiles à 8 branches et croix, réseau tourné de 45° : étoiles tous les 128 (4×4 par tuile)
  const NZ = 3, SP = D / NZ, h = SP / Math.SQRT2, SQ2 = Math.SQRT2, f = h / 90.5;
  const MAJ = hex('#3A4FB6'), DEEP = hex('#1B2A63'), WHITE = hex('#F3F0E8'), JOINT = hex('#E4E0D6');
  const sdStar = (dx, dy, sz) => {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    return Math.min(Math.max(ax, ay) - sz / 2, (ax + ay) / SQ2 - sz / 2);
  };
  const glaze = fbm(S, { fx: 8, oct: 4, seed: 201 });
  const tone = Float32Array.from({ length: 2 * NZ * NZ }, (_, i) => 1 + (hash(i, 0, 202) - 0.5) * 0.09);
  const out = new Float32Array(S * S * 3);
  const pxs = D / S; // taille d'un pixel en unités design
  const cov = (d) => { const t = d / pxs + 0.5; return t < 0 ? 0 : t > 1 ? 1 : t; };
  const mod4 = (v) => ((Math.round(v) % NZ) + NZ) % NZ;
  const g = 2.1; // demi-joint
  const col = [0, 0, 0];
  const over = (c, al) => { col[0] += (c[0] - col[0]) * al; col[1] += (c[1] - col[1]) * al; col[2] += (c[2] - col[2]) * al; };
  for (let py = 0; py < S; py++) {
    const y = (py + 0.5) * pxs;
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) * pxs;
      const u = (x + y) / SQ2, v = (y - x) / SQ2;
      const a = Math.floor(u / h), b = Math.floor(v / h);
      const even = ((a + b) & 1) === 0;
      const s1x = even ? a : a + 1, s1y = b, s2x = even ? a + 1 : a, s2y = b + 1;
      const d1 = sdStar(u - s1x * h, v - s1y * h, h), d2 = sdStar(u - s2x * h, v - s2y * h, h);
      let sd, cu, cv;
      if (d1 < d2) { sd = d1; cu = s1x; cv = s1y; } else { sd = d2; cu = s2x; cv = s2y; }
      let pid, edge;
      if (sd < 0) {
        // étoile majorelle, étoile intérieure bleu profond cernée de blanc, rosace blanche
        const du = u - cu * h, dv = v - cv * h;
        const inner = sdStar(du, dv, h * 0.52), rr = Math.hypot(du, dv);
        col[0] = MAJ[0]; col[1] = MAJ[1]; col[2] = MAJ[2];
        over(WHITE, cov(1.6 * f - Math.abs(inner)));
        over(DEEP, cov(-inner - 1.6 * f));
        over(WHITE, cov(6 * f - rr));
        over(DEEP, cov(2.4 * f - rr));
        const X = ((cu - cv) * h) / SQ2, Y = ((cu + cv) * h) / SQ2;
        pid = mod4(X / SP) + mod4(Y / SP) * NZ;
        edge = -sd;
      } else {
        // croix blanche cernée d'un filet bleu profond
        const qu = even ? a + 1 : a, qv = b;
        col[0] = WHITE[0]; col[1] = WHITE[1]; col[2] = WHITE[2];
        over(DEEP, cov(Math.min(sd - 4.4 * f, 8 * f - sd)));
        over(MAJ, cov(sd - 13 * f));
        const X = ((qu - qv) * h) / SQ2, Y = ((qu + qv) * h) / SQ2;
        pid = NZ * NZ + mod4(X / SP - 0.5) + mod4(Y / SP) * NZ;
        edge = sd;
      }
      // émail : ton propre à chaque pièce, légère accumulation près des joints
      const pv = tone[pid] * (0.94 + 0.06 * Math.min(1, Math.max(0, edge - g) / 5));
      col[0] *= pv; col[1] *= pv; col[2] *= pv;
      over(JOINT, cov(g - Math.abs(sd)));
      const q = (py * S + px) * 3;
      out[q] = col[0]; out[q + 1] = col[1]; out[q + 2] = col[2];
    }
  }
  const W = weave(S, {
    nx: 240, ny: 230, seed: 203, warpW: 0.46, weftW: 0.46,
    warp: { noise: 0.08, jit: 0.04, tone: 0.015 }, weft: { noise: 0.08, jit: 0.04, tone: 0.015 },
    kBase: 0.86, kProf: 0.12, kZ: 0.05, kFib: 0.04, gap: 0.8, wave: 0.1, ss: 1,
  });
  for (let p = 0; p < S * S; p++) {
    const m = W[p * 3] * (1 + glaze[p] * 0.04);
    out[p * 3] *= m; out[p * 3 + 1] *= m; out[p * 3 + 2] *= m;
  }
  put(ctx, S, out, 1, 203);
}

// --- Palmes tropicales ---------------------------------------------------------------------
function bananaLeaf(c, o) {
  const r = mulberry32(o.seed);
  const dx = Math.cos(o.ang), dy = Math.sin(o.ang);
  const p0 = [o.x, o.y], p2 = [o.x + dx * o.len, o.y + dy * o.len];
  const p1 = [o.x + dx * o.len * 0.5 - dy * o.len * o.bend, o.y + dy * o.len * 0.5 + dx * o.len * o.bend];
  const n = 80;
  const sp = spine(p0, p1, p2, n);
  const wf = (t) => o.wid * Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + t * 0.98)), 0.42) * (t < 0.1 ? 0.35 + 6.5 * t : 1);
  const tan = 0.55; // décalage des nervures vers la pointe
  const E = (t, side) => {
    const u = Math.min(1, t + (wf(t) * tan) / o.len), k = Math.round(u * n);
    const w = wf(u);
    return [sp.P[k][0] + sp.N[k][0] * w * side, sp.P[k][1] + sp.N[k][1] * w * side];
  };
  for (const side of [1, -1]) {
    const col = side > 0 ? o.c1 : o.c2;
    const tears = [];
    const nt = o.tears ?? 4;
    for (let q = 0; q < nt; q++) tears.push(0.18 + 0.75 * r());
    tears.sort((a, b) => a - b);
    const bounds = [0.01, ...tears, 0.995];
    const g = 0.012;
    const shapeHalf = (cc) => {
      for (let q = 0; q < bounds.length - 1; q++) {
        const ta = bounds[q] + (q ? 0.003 : 0), tb = bounds[q + 1];
        const ka = Math.round(ta * n), kb = Math.round(tb * n);
        cc.moveTo(sp.P[ka][0], sp.P[ka][1]);
        for (let k = ka; k <= kb; k++) cc.lineTo(sp.P[k][0], sp.P[k][1]);
        // bord externe : fente en V qui s'ouvre vers le bord, extrémités arrondies
        const ea = q ? ta + g : ta, eb = q < bounds.length - 2 ? tb - g : tb;
        for (let k = 40; k >= 0; k--) {
          const t = ea + ((eb - ea) * k) / 40;
          const e = E(t, side);
          const P = sp.P[Math.round(t * n)];
          const m = 1 - (q < bounds.length - 2 ? 0.1 * Math.exp(-(((eb - t) / 0.02) ** 2)) : 0) - (q ? 0.1 * Math.exp(-(((t - ea) / 0.02) ** 2)) : 0);
          cc.lineTo(P[0] + (e[0] - P[0]) * m, P[1] + (e[1] - P[1]) * m);
        }
        cc.closePath();
      }
    };
    c.fillStyle = col;
    c.beginPath(); shapeHalf(c); c.fill();
    // modelé : bande plus sombre le long de la nervure
    c.save();
    c.beginPath(); shapeHalf(c); c.clip();
    c.strokeStyle = 'rgba(10,30,20,0.11)';
    c.lineWidth = o.wid * 0.55;
    c.beginPath(); sp.P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    c.lineWidth = o.wid * 0.25;
    c.beginPath(); sp.P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    c.restore();
    // nervures latérales
    c.strokeStyle = o.vein;
    c.lineWidth = 0.75;
    c.beginPath();
    for (let t = 0.04; t < 0.99; t += 5.2 / o.len) {
      const k = Math.round(t * n), e = E(t, side);
      c.moveTo(sp.P[k][0], sp.P[k][1]);
      c.quadraticCurveTo(sp.P[k][0] + (e[0] - sp.P[k][0]) * 0.4 + sp.T[k][0] * 3, sp.P[k][1] + (e[1] - sp.P[k][1]) * 0.4 + sp.T[k][1] * 3, e[0], e[1]);
    }
    c.stroke();
  }
  // nervure centrale et pétiole
  c.strokeStyle = o.rib;
  for (const [w, t0, t1] of [[4.5, -0.1, 0.35], [3, 0.3, 0.7], [1.6, 0.65, 0.97]]) {
    c.lineWidth = w;
    c.beginPath();
    for (let t = Math.max(0, t0); t <= t1; t += 0.02) {
      const k = Math.round(t * n);
      if (t === Math.max(0, t0)) c.moveTo(sp.P[k][0], sp.P[k][1]); else c.lineTo(sp.P[k][0], sp.P[k][1]);
    }
    c.stroke();
  }
  c.lineWidth = 4.5;
  c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x - dx * o.len * 0.14, o.y - dy * o.len * 0.14); c.stroke();
}

function palmFrond(c, o) {
  const r = mulberry32(o.seed);
  const dx = Math.cos(o.ang), dy = Math.sin(o.ang);
  const p0 = [o.x, o.y], p2 = [o.x + dx * o.len, o.y + dy * o.len];
  const p1 = [o.x + dx * o.len * 0.5 - dy * o.len * o.bend, o.y + dy * o.len * 0.5 + dx * o.len * o.bend];
  const n = 100, sp = spine(p0, p1, p2, n);
  for (let t = 0.06; t < 0.985; t += 0.024) {
    const k = Math.round(t * n), P = sp.P[k], T = sp.T[k], N = sp.N[k];
    for (const s of [1, -1]) {
      const L = o.leaf * (0.35 + 0.65 * Math.sin(Math.PI * (0.12 + 0.85 * t))) * (0.9 + 0.2 * r());
      const ang = (0.95 - 0.45 * t) * (0.9 + 0.2 * r());
      const ux = T[0] * Math.cos(ang) + N[0] * s * Math.sin(ang), uy = T[1] * Math.cos(ang) + N[1] * s * Math.sin(ang);
      const droop = L * 0.22 * s * o.droop;
      const Q = [P[0] + ux * L - N[0] * droop, P[1] + uy * L - N[1] * droop];
      const M = [P[0] + ux * L * 0.5, P[1] + uy * L * 0.5];
      const w = 2.6 + 3.2 * (L / o.leaf);
      const nx = -uy, ny = ux;
      c.fillStyle = r() < 0.5 ? o.c1 : o.c2;
      c.beginPath();
      c.moveTo(P[0], P[1]);
      c.quadraticCurveTo(M[0] + nx * w, M[1] + ny * w, Q[0], Q[1]);
      c.quadraticCurveTo(M[0] - nx * w * 0.6, M[1] - ny * w * 0.6, P[0], P[1]);
      c.fill();
      c.strokeStyle = o.vein;
      c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(P[0], P[1]); c.quadraticCurveTo(M[0] + nx * w * 0.2, M[1] + ny * w * 0.2, Q[0], Q[1]); c.stroke();
    }
  }
  c.strokeStyle = o.rib;
  c.lineWidth = 2.6;
  c.beginPath();
  sp.P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.stroke();
}

function drawPalmes(ctx, S) {
  const DEEP = '#234A39', DEEP2 = '#2F5C47', SAGE = '#9DB399', SAGE2 = '#B2C4AA';
  // centres répartis en quinconce sur le tore ; base = centre - direction × longueur/2
  const L = (type, cx, cy, ang, len, o) => {
    const x = cx - Math.cos(ang) * len * 0.5, y = cy - Math.sin(ang) * len * 0.5;
    return [type, { ...o, x, y, ang, len }];
  };
  const leaves = [
    L('palm', 392, 70, 2.1, 360, { bend: 0.1, leaf: 104, droop: 1, c1: SAGE, c2: SAGE2, vein: '#88A285', rib: '#8AA387', seed: 211 }),
    L('palm', 40, 300, -1.05, 350, { bend: -0.12, leaf: 100, droop: 1, c1: SAGE2, c2: SAGE, vein: '#88A285', rib: '#8AA387', seed: 212 }),
    L('banana', 290, 270, -0.62, 420, { wid: 66, bend: -0.1, c1: SAGE, c2: '#8FA88C', vein: '#7B9678', rib: '#D5DECB', tears: 5, seed: 214 }),
    L('palm', 150, 440, 0.55, 320, { bend: 0.12, leaf: 92, droop: 1, c1: DEEP2, c2: DEEP, vein: '#4C7A60', rib: '#446E57', seed: 216 }),
    L('banana', 130, 110, 0.3, 430, { wid: 70, bend: 0.1, c1: DEEP2, c2: DEEP, vein: '#3F6F55', rib: '#9FB59A', tears: 6, seed: 213 }),
    L('banana', 420, 410, 2.45, 420, { wid: 68, bend: 0.12, c1: DEEP, c2: DEEP2, vein: '#3F6F55', rib: '#9FB59A', tears: 6, seed: 215 }),
  ];
  printed(ctx, S, {
    seed: 217, ground: '#F2EBDC', mottle: 0.03,
    draw: (c) => {
      for (const [type, o] of leaves) {
        const cx = o.x + Math.cos(o.ang) * o.len * 0.5, cy = o.y + Math.sin(o.ang) * o.len * 0.5;
        wrap(c, cx, cy, o.len * 0.62 + (o.leaf ?? o.wid) + 10, (cc) => (type === 'palm' ? palmFrond(cc, o) : bananaLeaf(cc, o)));
      }
    },
    weave: {
      nx: 230, ny: 220, seed: 218, warpW: 0.46, weftW: 0.46,
      warp: { noise: 0.1, slubs: 0.15, slubAmp: 0.25, jit: 0.05, tone: 0.02 },
      weft: { noise: 0.12, slubs: 0.2, slubAmp: 0.3, jit: 0.05, tone: 0.02 },
      kBase: 0.87, kProf: 0.11, kZ: 0.04, kFib: 0.04, gap: 0.82, wave: 0.12, ss: 1,
    },
  });
}

export const FABRICS = [
  { id: 'voile-ivoire', draw: drawVoile },
  { id: 'gaze-rose-poudre', draw: drawGaze },
  {
    id: 'velours-sapin',
    draw: (ctx, S) => drawVelvet(ctx, S, { color: '#2F4A3E', seed: 301, dark: hex('#223930'), sheen: hex('#4E6F60') }),
  },
  {
    id: 'velours-terracotta',
    draw: (ctx, S) => drawVelvet(ctx, S, { color: '#A9553B', seed: 401, dark: hex('#88402A'), sheen: hex('#C9775A') }),
  },
  { id: 'lin-sable', draw: drawLin },
  { id: 'bogolan-nuit', draw: drawBogolan },
  { id: 'rayure-riviera', draw: drawRayure },
  { id: 'wax-soleil', draw: drawWax },
  { id: 'toile-de-jouy-brique', draw: drawJouy },
  { id: 'damas-or', draw: drawDamas },
  { id: 'broderie-camelia', draw: drawCamelia },
  { id: 'voile-brode-plumetis', draw: drawPlumetis },
  { id: 'macrame-naturel', draw: drawMacrame },
  { id: 'ikat-terre', draw: drawIkat },
  { id: 'zellige-azur', draw: drawZellige },
  { id: 'palmes-tropicales', draw: drawPalmes },
];
