// Pages publiques rendues côté serveur (SEO) + plan du site, sitemap.xml, robots.txt.
import { read } from './store.js';
import { render, escapeHtml, safeJson, formatMoney } from './templates.js';
import { send, siteUrl, HttpError } from './http.js';
import { publishedModels } from './api-public.js';
import { publicModel } from './domain.js';
import {
  ROOMS, MATERIALS, COLOR_FAMILIES, AVAILABILITY, HEADINGS, labelOf,
} from '../public/js/shared/taxonomy.js';

const NAV = [
  { id: 'accueil', href: '/', label: 'Accueil' },
  { id: 'galerie', href: '/galerie', label: 'La Galerie' },
  { id: 'catalogue', href: '/catalogue', label: 'Catalogue' },
  { id: 'composer', href: '/composer', label: 'Compose ton intérieur' },
  { id: 'atelier', href: '/atelier', label: "L'Atelier" },
  { id: 'contact', href: '/contact', label: 'Contact' },
];

const SOCIAL_ICONS = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };

export function waLink(number, text = '') {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

function place(site) {
  return site.city ? `${site.city}` : site.country || '';
}

/** « à Douala » si la ville est renseignée, sinon « au Cameroun ». */
function lieu(site) {
  if (site.city) return `à ${site.city}`;
  return site.country ? `au ${site.country}` : '';
}

const fillLieu = (site, s) => String(s || '').replace(/\{lieu\}/g, lieu(site)).replace(/\s{2,}/g, ' ').trim();

/** Contexte commun à toutes les pages. */
function baseContext(req, pageId, seoKey, overrides = {}) {
  const content = read('content');
  const site = content.site;
  const base = siteUrl(req);
  const seo = { ...(content.seo?.[seoKey] || {}), ...(overrides.seo || {}) };
  const where = place(site);
  const fill = (s) => fillLieu(site, s);
  const url = new URL(req.url, base);
  const canonical = `${base}${overrides.canonicalPath ?? url.pathname}`;
  const social = [
    { id: 'tiktok', label: 'TikTok', url: site.social.tiktok, handle: '@cozyhomebyfany' },
    { id: 'whatsapp', label: 'WhatsApp', url: waLink(site.whatsapp, 'Bonjour Fany, je vous contacte depuis votre site Cozy Home.') },
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
      jsonld: safeJson(overrides.jsonld || organizationLd(req, content)),
    },
    site: { ...site, place: where, lieu: lieu(site) },
    content,
    nav: NAV.map((n) => ({ ...n, active: n.id === pageId })),
    social,
    wa: { number: site.whatsapp, link: waLink(site.whatsapp, 'Bonjour Fany, je vous contacte depuis votre site Cozy Home.') },
    year: new Date().getFullYear(),
  };
}

function organizationLd(req, content) {
  const base = siteUrl(req);
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

const STYLE_BY_ID = () => Object.fromEntries(read('styles').map((s) => [s.id, s]));

/** Données d'une carte modèle pour les gabarits. */
function card(m, styles = STYLE_BY_ID()) {
  return {
    ...m,
    styleName: styles[m.style]?.short || m.style,
    materialLabel: labelOf(MATERIALS, m.material),
    availabilityLabel: labelOf(AVAILABILITY, m.availability),
    unavailable: m.availability === 'epuise',
    priceLabel: m.price ? `${formatMoney(m.price.amount)} ${m.price.unit === 'metre' ? 'le mètre' : m.price.unit === 'paire' ? 'la paire' : 'le panneau'}` : 'Prix sur devis',
    cover: m.images?.mockups?.miOuvert || m.images?.mockups?.ferme || m.images?.swatch,
    palette: (m.colors || []).map((c) => c.hex).join(','),
    roomsLabel: (m.rooms || []).map((r) => labelOf(ROOMS, r)).join(' · '),
  };
}

function page(res, req, view, ctx) {
  send(req, res, 200, render(view, ctx), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
}

export function renderNotFound(req, res) {
  const ctx = baseContext(req, '', 'notFound', { robots: 'noindex', seo: { title: 'Page introuvable | Cozy Home by Fany', description: '' } });
  send(req, res, 404, render('404', ctx));
}

export function registerPages(router) {
  router.get('/', (req, res) => {
    const models = publishedModels();
    const featured = models.filter((m) => m.featured).slice(0, 6);
    const ctx = baseContext(req, 'accueil', 'home', { script: '/js/pages/home.js', bodyClass: 'has-hero' });
    const icons = ['hand', 'ruler', 'truck', 'chat'];
    const home = { ...ctx.content.home, reassurance: (ctx.content.home.reassurance || []).map((r, i) => ({ ...r, icon: icons[i % icons.length] })) };
    page(res, req, 'index', {
      ...ctx,
      home,
      featured: (featured.length ? featured : models.slice(0, 6)).map((m) => card(m)),
      styles: read('styles').sort((a, b) => a.order - b.order),
      tiktokVideos: (home.tiktokVideos || []).filter((v) => /tiktok\.com\/.*\/video\/(\d+)/.test(v.url)).map((v) => ({ ...v, id: /video\/(\d+)/.exec(v.url)[1] })),
      pageData: safeJson({
        featured: featured.map(publicModel),
        fallbackVisuals: (ctx.content.atelier?.gallery || []).map((g) => g.image).filter(Boolean).slice(0, 3),
      }),
    });
  });

  router.get('/galerie', (req, res) => {
    const models = publishedModels();
    const styles = read('styles').sort((a, b) => a.order - b.order).map((s, i) => {
      const alt = i % 2 === 1;
      const inStyle = models.filter((m) => m.style === s.id);
      const featured = inStyle.find((m) => m.slug === s.featuredModel) || inStyle[0] || null;
      return { ...s, alt, count: inStyle.length, countLabel: `${inStyle.length} modèle${inStyle.length > 1 ? 's' : ''} au catalogue`, featured: featured ? publicModel(featured) : null };
    });
    const ctx = baseContext(req, 'galerie', 'galerie', { script: '/js/pages/galerie.js', bodyClass: 'page-galerie' });
    page(res, req, 'galerie', { ...ctx, galerie: ctx.content.galerie, styles, pageData: safeJson({ styles }) });
  });

  router.get('/catalogue', (req, res) => {
    const styles = read('styles').sort((a, b) => a.order - b.order);
    const byId = Object.fromEntries(styles.map((s) => [s.id, s]));
    const models = publishedModels().map((m) => card(m, byId));
    const used = (key) => new Set(models.flatMap((m) => [].concat(m[key] || [])));
    const usedMaterials = used('material');
    const usedRooms = used('rooms');
    const usedFamilies = used('colorFamilies');
    const ctx = baseContext(req, 'catalogue', 'catalogue', { script: '/js/pages/catalogue.js' });
    page(res, req, 'catalogue', {
      ...ctx,
      catalogue: ctx.content.catalogue,
      models,
      filters: {
        styles: styles.map((s) => ({ id: s.id, label: s.short })),
        families: COLOR_FAMILIES.filter((f) => usedFamilies.has(f.id)),
        materials: MATERIALS.filter((m) => usedMaterials.has(m.id)),
        rooms: ROOMS.filter((r) => usedRooms.has(r.id)),
      },
      pageData: safeJson({ models: models.map((m) => ({ slug: m.slug, style: m.style, material: m.material, rooms: m.rooms, colorFamilies: m.colorFamilies, colors: m.colors })) }),
    });
  });

  router.get('/catalogue/:slug', (req, res, { params }) => {
    const m = publishedModels().find((x) => x.slug === params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    const styles = STYLE_BY_ID();
    const c = card(m, styles);
    const base = siteUrl(req);
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
    const related = publishedModels().filter((x) => x.id !== m.id && (x.style === m.style || x.colorFamilies.some((f) => m.colorFamilies.includes(f)))).slice(0, 4).map((x) => card(x, styles));
    const ctx = baseContext(req, 'catalogue', 'modele', {
      script: '/js/pages/modele.js',
      ogImage: images[0],
      jsonld: ld,
      seo: {
        title: `${m.name} — ${styles[m.style]?.short || 'Rideau'} sur mesure | Cozy Home by Fany`,
        description: `${m.description} Rideau ${labelOf(MATERIALS, m.material).toLowerCase()} confectionné sur mesure par l'atelier Cozy Home by Fany.`.slice(0, 300),
      },
    });
    page(res, req, 'modele', {
      ...ctx,
      model: c,
      style: styles[m.style],
      mockups: [
        { key: 'ferme', label: 'Fermé', src: m.images.mockups.ferme },
        { key: 'miOuvert', label: 'Mi-ouvert', src: m.images.mockups.miOuvert },
        { key: 'embrasse', label: 'Avec embrasses', src: m.images.mockups.embrasse },
        { key: 'echantillon', label: 'Échantillon', src: m.images.original || m.images.swatch },
      ].filter((x) => x.src),
      colorsLabel: (m.colors || []).map((x) => x.name).filter(Boolean).join(', '),
      headingLabel: labelOf(HEADINGS, m.render?.heading),
      related,
      pageData: safeJson({ model: publicModel(m) }),
    });
  });

  router.get('/composer', (req, res) => {
    const ctx = baseContext(req, 'composer', 'composer', { script: '/js/pages/composer.js', bodyClass: 'page-composer' });
    const models = publishedModels().map(publicModel);
    page(res, req, 'composer', { ...ctx, composer: ctx.content.composer, pageData: safeJson({ models, styles: read('styles') }) });
  });

  router.get('/contact', (req, res) => {
    const ctx = baseContext(req, 'contact', 'contact', { script: '/js/pages/contact.js' });
    const models = publishedModels().map((m) => ({ slug: m.slug, name: m.name }));
    page(res, req, 'contact', {
      ...ctx,
      contact: ctx.content.contact,
      rooms: ROOMS,
      models,
      pageData: safeJson({ models }),
    });
  });

  router.get('/commande/:slug', (req, res, { params }) => {
    const m = publishedModels().find((x) => x.slug === params.slug);
    if (!m) throw new HttpError(404, 'Modèle introuvable.');
    const ctx = baseContext(req, 'catalogue', 'commande', {
      script: '/js/pages/commande.js',
      robots: 'noindex, follow',
      seo: { title: `Commander « ${m.name} » | Cozy Home by Fany`, description: `Commande du modèle ${m.name}, confectionné sur mesure.` },
    });
    page(res, req, 'commande', {
      ...ctx,
      contact: ctx.content.contact,
      model: card(m),
      headings: HEADINGS,
      pageData: safeJson({ model: publicModel(m) }),
    });
  });

  router.get('/atelier', (req, res) => {
    const ctx = baseContext(req, 'atelier', 'atelier', { script: '/js/pages/atelier.js' });
    page(res, req, 'atelier', { ...ctx, atelier: ctx.content.atelier });
  });

  router.get('/confidentialite', (req, res) => {
    const ctx = baseContext(req, '', 'confidentialite', { robots: 'noindex, follow' });
    page(res, req, 'confidentialite', { ...ctx, legal: ctx.content.legal });
  });

  router.get('/plan-du-site', (req, res) => {
    const ctx = baseContext(req, '', 'planDuSite');
    const styles = read('styles').sort((a, b) => a.order - b.order);
    page(res, req, 'plan-du-site', { ...ctx, styles, models: publishedModels().map((m) => card(m)) });
  });

  router.get('/robots.txt', (req, res) => {
    const base = siteUrl(req);
    send(req, res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /commande/\n\nSitemap: ${base}/sitemap.xml\n`, 'text/plain; charset=utf-8');
  });

  router.get('/sitemap.xml', (req, res) => {
    const base = siteUrl(req);
    const pages = ['/', '/galerie', '/catalogue', '/composer', '/atelier', '/contact', '/plan-du-site'];
    const models = publishedModels();
    const urls = [
      ...pages.map((p) => ({ loc: base + p, priority: p === '/' ? '1.0' : '0.8' })),
      ...models.map((m) => ({ loc: `${base}/catalogue/${m.slug}`, lastmod: m.updatedAt?.slice(0, 10), priority: '0.7' })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
      .join('\n')}\n</urlset>\n`;
    send(req, res, 200, xml, 'application/xml; charset=utf-8');
  });

  router.get('/admin', (req, res) => {
    const ctx = baseContext(req, '', 'admin', { robots: 'noindex, nofollow', seo: { title: 'Espace pro | Cozy Home by Fany', description: '' } });
    page(res, req, 'admin/app', ctx);
  });
}
