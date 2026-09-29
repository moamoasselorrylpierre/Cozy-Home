// Pages publiques rendues côté serveur (SEO) + plan du site, sitemap.xml, robots.txt.
import { cachedAll } from './db.js';
import { render, escapeHtml, safeJson, formatMoney } from './templates.js';
import { html, text, siteUrl, HttpError } from './http.js';
import { publishedModels } from './api-public.js';
import { publicModel } from './domain.js';
import { ROOMS, MATERIALS, COLOR_FAMILIES, AVAILABILITY, HEADINGS, labelOf } from '../public/js/shared/taxonomy.js';

const NAV = [
  { id: 'accueil', href: '/', label: 'Accueil' },
  { id: 'galerie', href: '/galerie', label: 'La Galerie' },
  { id: 'catalogue', href: '/catalogue', label: 'Catalogue' },
  { id: 'composer', href: '/composer', label: 'Compose ton intérieur' },
  { id: 'atelier', href: '/atelier', label: "L'Atelier" },
  { id: 'contact', href: '/contact', label: 'Contact' },
];

const SOCIAL_ICONS = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };
const WA_TEXT = 'Bonjour Fany, je vous contacte depuis votre site Cozy Home.';
// Tailles d'affichage des cartes : le navigateur choisit la version légère (480 px) sur mobile.
const CARD_SIZES = '(max-width: 600px) 80vw, (max-width: 1100px) 45vw, 25vw';

export function waLink(number, textMsg = '') {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${textMsg ? `?text=${encodeURIComponent(textMsg)}` : ''}`;
}

const place = (site) => (site.city ? `${site.city}` : site.country || '');

/** « à Douala » si la ville est renseignée, sinon « au Cameroun ». */
function lieu(site) {
  if (site.city) return `à ${site.city}`;
  return site.country ? `au ${site.country}` : '';
}

const fillLieu = (site, s) => String(s || '').replace(/\{lieu\}/g, lieu(site)).replace(/\s{2,}/g, ' ').trim();

/** Données partagées par les pages : contenus, salles et modèles publiés (lectures D1 mises en cache 10 s). */
async function loadData(c) {
  const [content, styles, models] = await Promise.all([cachedAll(c.db, 'content'), cachedAll(c.db, 'styles'), publishedModels(c.db)]);
  return { content, styles, models, styleById: Object.fromEntries(styles.map((s) => [s.id, s])) };
}

/** Contexte commun à toutes les pages. */
function baseContext(c, data, pageId, seoKey, overrides = {}) {
  const { content } = data;
  const site = content.site;
  const base = siteUrl(c.req, c.env);
  const seo = { ...(content.seo?.[seoKey] || {}), ...(overrides.seo || {}) };
  const fill = (s) => fillLieu(site, s);
  const canonical = `${base}${overrides.canonicalPath ?? c.url.pathname}`;
  const social = [
    { id: 'tiktok', label: 'TikTok', url: site.social.tiktok, handle: '@cozyhomebyfany' },
    { id: 'whatsapp', label: 'WhatsApp', url: waLink(site.whatsapp, WA_TEXT) },
    { id: 'instagram', label: 'Instagram', url: site.social.instagram },
    { id: 'facebook', label: 'Facebook', url: site.social.facebook },
  ].map((s) => ({ ...s, active: !!s.url, icon: s.id, name: SOCIAL_ICONS[s.id] }));

  return {
    page: {
      id: pageId,
      title: fill(seo.title) || `${site.name}`,
      description: fill(seo.description),
      canonical,
      ogImage: `${base}${overrides.ogImage || content.home.heroImage || '/img/site/hero.webp'}`,
      robots: overrides.robots || 'index, follow',
      script: overrides.script || '',
      bodyClass: overrides.bodyClass || '',
      jsonld: safeJson(overrides.jsonld || organizationLd(base, content)),
    },
    site: { ...site, place: place(site), lieu: lieu(site) },
    content,
    nav: NAV.map((n) => ({ ...n, active: n.id === pageId })),
    social,
    wa: { number: site.whatsapp, link: waLink(site.whatsapp, WA_TEXT) },
    year: new Date().getFullYear(),
  };
}

function organizationLd(base, content) {
  const s = content.site;
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeGoodsStore',
    name: s.name,
    description: fillLieu(s, content.seo?.home?.description) || s.tagline,
    url: base,
    image: `${base}${content.home.heroImage || '/img/site/hero.webp'}`,
    logo: `${base}/img/logo.svg`,
    telephone: s.whatsapp,
    ...(s.email ? { email: s.email } : {}),
    address: { '@type': 'PostalAddress', addressCountry: 'CM', ...(s.city ? { addressLocality: s.city } : {}), ...(s.address ? { streetAddress: s.address } : {}) },
    areaServed: s.city || s.country,
    sameAs: Object.values(s.social).filter(Boolean),
    knowsAbout: ['Rideaux sur mesure', 'Voilages', 'Rideaux occultants', 'Relooking d’intérieur', 'Linge de maison'],
  };
}

/** Attribut srcset « petite / grande » d'un mock-up (vide si la version légère n'existe pas). */
function srcset(m, key) {
  const big = m.images?.mockups?.[key];
  const small = m.images?.mockupsSmall?.[key];
  return big && small ? `${small} 480w, ${big} 900w` : '';
}

/** Données d'une carte modèle pour les gabarits. */
function card(m, styleById) {
  const coverKey = m.images?.mockups?.miOuvert ? 'miOuvert' : 'ferme';
  return {
    ...m,
    styleName: styleById[m.style]?.short || m.style,
    materialLabel: labelOf(MATERIALS, m.material),
    availabilityLabel: labelOf(AVAILABILITY, m.availability),
    unavailable: m.availability === 'epuise',
    priceLabel: m.price ? `${formatMoney(m.price.amount)} ${m.price.unit === 'metre' ? 'le mètre' : m.price.unit === 'paire' ? 'la paire' : 'le panneau'}` : 'Prix sur devis',
    cover: m.images?.mockups?.[coverKey] || m.images?.swatch,
    coverSrcset: srcset(m, coverKey),
    fermeSrcset: srcset(m, 'ferme'),
    altSrc: m.images?.mockupsSmall?.embrasse || m.images?.mockups?.embrasse || '',
    sizes: CARD_SIZES,
    palette: (m.colors || []).map((col) => col.hex).join(','),
    roomsLabel: (m.rooms || []).map((r) => labelOf(ROOMS, r)).join(' · '),
  };
}

const page = (view, ctx, status = 200) => html(render(view, ctx), status);

export async function renderNotFound(c) {
  try {
    const data = await loadData(c);
    const ctx = baseContext(c, data, '', 'notFound', { robots: 'noindex', seo: { title: 'Page introuvable | Cozy Home by Fany', description: '' } });
    return page('404', ctx, 404);
  } catch {
    return html(render('erreur', { status: 404, message: 'Page introuvable.' }), 404);
  }
}

export function registerPages(router) {
  router.get('/', async (c) => {
    const data = await loadData(c);
    const featured = data.models.filter((m) => m.featured).slice(0, 6);
    const ctx = baseContext(c, data, 'accueil', 'home', { script: '/js/pages/home.js', bodyClass: 'has-hero' });
    const icons = ['hand', 'ruler', 'truck', 'chat'];
    const home = { ...ctx.content.home, reassurance: (ctx.content.home.reassurance || []).map((r, i) => ({ ...r, icon: icons[i % icons.length] })) };
    return page('index', {
      ...ctx,
      home,
      featured: (featured.length ? featured : data.models.slice(0, 6)).map((m) => card(m, data.styleById)),
      styles: data.styles,
      tiktokVideos: (home.tiktokVideos || []).filter((v) => /tiktok\.com\/.*\/video\/(\d+)/.test(v.url)).map((v) => ({ ...v, id: /video\/(\d+)/.exec(v.url)[1] })),
      pageData: safeJson({
        featured: featured.map(publicModel),
        fallbackVisuals: (ctx.content.atelier?.gallery || []).map((g) => g.image).filter(Boolean).slice(0, 3),
      }),
    });
  });

  router.get('/galerie', async (c) => {
    const data = await loadData(c);
    const styles = data.styles.map((s, i) => {
      const inStyle = data.models.filter((m) => m.style === s.id);
      const featured = inStyle.find((m) => m.slug === s.featuredModel) || inStyle[0] || null;
      return { ...s, alt: i % 2 === 1, count: inStyle.length, countLabel: `${inStyle.length} modèle${inStyle.length > 1 ? 's' : ''} au catalogue`, featured: featured ? publicModel(featured) : null };
    });
    const ctx = baseContext(c, data, 'galerie', 'galerie', { script: '/js/pages/galerie.js', bodyClass: 'page-galerie' });
    return page('galerie', { ...ctx, galerie: ctx.content.galerie, styles, pageData: safeJson({ styles }) });
  });

  router.get('/catalogue', async (c) => {
    const data = await loadData(c);
    const models = data.models.map((m) => card(m, data.styleById));
    const used = (key) => new Set(models.flatMap((m) => [].concat(m[key] || [])));
    const usedMaterials = used('material');
    const usedRooms = used('rooms');
    const usedFamilies = used('colorFamilies');
    const ctx = baseContext(c, data, 'catalogue', 'catalogue', { script: '/js/pages/catalogue.js' });
    return page('catalogue', {
      ...ctx,
      catalogue: ctx.content.catalogue,
      models,
      filters: {
        styles: data.styles.map((s) => ({ id: s.id, label: s.short })),
        families: COLOR_FAMILIES.filter((f) => usedFamilies.has(f.id)),
        materials: MATERIALS.filter((m) => usedMaterials.has(m.id)),
        rooms: ROOMS.filter((r) => usedRooms.has(r.id)),
      },
      pageData: safeJson({ models: models.map((m) => ({ slug: m.slug, style: m.style, material: m.material, rooms: m.rooms, colorFamilies: m.colorFamilies, colors: m.colors })) }),
    });
  });

  router.get('/catalogue/:slug', async (c) => {
    const data = await loadData(c);
    const m = data.models.find((x) => x.slug === c.params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    const styles = data.styleById;
    const base = siteUrl(c.req, c.env);
    const images = [m.images.mockups.ferme, m.images.mockups.miOuvert, m.images.mockups.embrasse].filter(Boolean);
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${m.name} — rideau ${styles[m.style]?.short?.toLowerCase() || ''}`.trim(),
      description: m.description,
      image: images.map((i) => base + i),
      brand: { '@type': 'Brand', name: 'Cozy Home by Fany' },
      material: labelOf(MATERIALS, m.material),
      color: (m.colors || []).map((x) => x.name).filter(Boolean).join(', '),
      ...(m.price ? {
        offers: {
          '@type': 'Offer', priceCurrency: 'XAF', price: m.price.amount, url: `${base}/catalogue/${m.slug}`,
          availability: m.availability === 'epuise' ? 'https://schema.org/OutOfStock' : m.availability === 'sur-commande' ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
        },
      } : {}),
    };
    const related = data.models.filter((x) => x.id !== m.id && (x.style === m.style || x.colorFamilies.some((f) => m.colorFamilies.includes(f)))).slice(0, 4).map((x) => card(x, styles));
    const ctx = baseContext(c, data, 'catalogue', 'modele', {
      script: '/js/pages/modele.js',
      ogImage: images[0],
      jsonld: ld,
      seo: {
        title: `${m.name} — ${styles[m.style]?.short || 'Rideau'} sur mesure | Cozy Home by Fany`,
        description: `${m.description} Rideau ${labelOf(MATERIALS, m.material).toLowerCase()} confectionné sur mesure par l'atelier Cozy Home by Fany.`.slice(0, 300),
      },
    });
    const small = m.images.mockupsSmall || {};
    return page('modele', {
      ...ctx,
      model: card(m, styles),
      style: styles[m.style],
      mockups: [
        { key: 'ferme', label: 'Fermé', src: m.images.mockups.ferme, thumb: small.ferme || m.images.mockups.ferme },
        { key: 'miOuvert', label: 'Mi-ouvert', src: m.images.mockups.miOuvert, thumb: small.miOuvert || m.images.mockups.miOuvert },
        { key: 'embrasse', label: 'Avec embrasses', src: m.images.mockups.embrasse, thumb: small.embrasse || m.images.mockups.embrasse },
        { key: 'echantillon', label: 'Échantillon', src: m.images.original || m.images.swatch, thumb: m.images.swatch || m.images.original },
      ].filter((x) => x.src),
      colorsLabel: (m.colors || []).map((x) => x.name).filter(Boolean).join(', '),
      headingLabel: labelOf(HEADINGS, m.render?.heading),
      related,
      pageData: safeJson({ model: publicModel(m) }),
    });
  });

  router.get('/composer', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, 'composer', 'composer', { script: '/js/pages/composer.js', bodyClass: 'page-composer' });
    return page('composer', { ...ctx, composer: ctx.content.composer, pageData: safeJson({ models: data.models.map(publicModel), styles: data.styles }) });
  });

  router.get('/contact', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, 'contact', 'contact', { script: '/js/pages/contact.js' });
    const models = data.models.map((m) => ({ slug: m.slug, name: m.name }));
    return page('contact', { ...ctx, contact: ctx.content.contact, rooms: ROOMS, models, pageData: safeJson({ models }) });
  });

  router.get('/commande/:slug', async (c) => {
    const data = await loadData(c);
    const m = data.models.find((x) => x.slug === c.params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    const ctx = baseContext(c, data, 'catalogue', 'commande', {
      script: '/js/pages/commande.js',
      robots: 'noindex, follow',
      seo: { title: `Commander « ${m.name} » | Cozy Home by Fany`, description: `Commande du modèle ${m.name}, confectionné sur mesure.` },
    });
    return page('commande', { ...ctx, contact: ctx.content.contact, model: card(m, data.styleById), headings: HEADINGS, pageData: safeJson({ model: publicModel(m) }) });
  });

  router.get('/atelier', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, 'atelier', 'atelier', { script: '/js/pages/atelier.js' });
    return page('atelier', { ...ctx, atelier: ctx.content.atelier });
  });

  router.get('/confidentialite', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, '', 'confidentialite', { robots: 'noindex, follow' });
    return page('confidentialite', { ...ctx, legal: ctx.content.legal });
  });

  router.get('/plan-du-site', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, '', 'planDuSite');
    return page('plan-du-site', { ...ctx, styles: data.styles, models: data.models.map((m) => card(m, data.styleById)) });
  });

  router.get('/robots.txt', (c) => {
    const base = siteUrl(c.req, c.env);
    return text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /commande/\n\nSitemap: ${base}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', async (c) => {
    const base = siteUrl(c.req, c.env);
    const staticPages = ['/', '/galerie', '/catalogue', '/composer', '/atelier', '/contact', '/plan-du-site'];
    const models = await publishedModels(c.db);
    const urls = [
      ...staticPages.map((p) => ({ loc: base + p, priority: p === '/' ? '1.0' : '0.8' })),
      ...models.map((m) => ({ loc: `${base}/catalogue/${m.slug}`, lastmod: m.updatedAt?.slice(0, 10), priority: '0.7' })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
      .join('\n')}\n</urlset>\n`;
    return text(xml, 'application/xml; charset=utf-8');
  });

  router.get('/admin', async (c) => {
    const data = await loadData(c);
    const ctx = baseContext(c, data, '', 'admin', { robots: 'noindex, nofollow', seo: { title: 'Espace pro | Cozy Home by Fany', description: '' } });
    return page('admin/app', ctx);
  });
}
