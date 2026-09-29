# Documentation technique

## Architecture

- **Serveur** : Node.js ≥ 20, **sans dépendance** (`node:http`, `node:crypto`, `node:zlib`).
  Pages publiques rendues côté serveur (SEO), API JSON, fichiers statiques compressés (gzip, ETag, cache long pour les images téléversées).
- **Navigateur** : JavaScript moderne en modules ES, sans framework ni étape de compilation. Chaque page charge son script
  (`public/js/pages/*.js`) ; les modules lourds (décors, moteur de drapé) sont importés à la demande, quand la zone devient visible.
- **Stockage** : fichiers JSON dans `DATA_DIR` (écritures atomiques et sérialisées) + images dans `UPLOAD_DIR`.
  Au premier démarrage, `seed/*.json` est copié dans `DATA_DIR`.

```
server/
  app.js            assemblage, fichiers statiques, erreurs
  config.js         variables d'environnement
  store.js          stockage JSON (cache + écritures atomiques)
  auth.js           comptes (scrypt), sessions, limitation des tentatives
  domain.js         validation / nettoyage des modèles, contenus, demandes, images
  api-public.js     catalogue, styles, réception des demandes
  api-admin.js      API de l'espace pro (protégée : session + anti-CSRF)
  pages.js          pages publiques, sitemap.xml, robots.txt, JSON-LD
  templates.js      mini moteur de gabarits avec échappement systématique
views/              gabarits HTML (partials/ : en-tête, pied de page, icônes…)
public/
  css/              main.css (site), admin.css, fonts.css (polices auto-hébergées)
  js/shared/        taxonomy.js — référentiel partagé serveur/navigateur (filtres, statuts)
  js/modules/       modules indépendants (voir ci-dessous)
  js/pages/         scripts des pages publiques
  js/admin/         espace pro (application à une page, navigation #/…)
  img/              logo, tissus, mock-ups et visuels de démonstration
scripts/            build-assets.mjs (visuels de démo), maquettes.mjs (captures), create-admin.js
seed/               données initiales (modèles de démonstration, salles, contenus)
tests/              tests d'intégration (node --test)
```

## Modules indépendants

Les deux expériences signature sont isolées pour pouvoir être ajustées ou remplacées sans toucher au reste :

| Module | Rôle | Dépend de |
|---|---|---|
| `modules/dynamic-theme.js` | **Thème dynamique (6.1)** : `tint(couleurs)`, `release()`, `bindHover()`. Agit uniquement sur 4 variables CSS (`--tone-strong`, `--tone-line`, `--tone-wash`, `--tone-glow`). Contrastes vérifiés (WCAG : ≥ 5:1 pour les boutons, ≥ 10:1 texte/fond de section), saturation bridée, transitions douces via `CSS.registerProperty`. | `color.js` |
| `modules/mockup-generator.js` | **Génération de mock-ups (6.2)** — façade : `prepareFabric()` (recadrage, raccord, analyse) puis `generateMockups()` (fermé, mi-ouvert, embrasses). C’est le seul point d’entrée utilisé par l’espace pro : on peut le remplacer par un service d’IA externe sans changer l’admin. | `fabric-analysis.js`, `curtain-render.js` |
| `modules/fabric-analysis.js` | Lecture photo (orientation EXIF), recadrage, **tuile raccordable** (fondu décalé), analyse : couleurs dominantes (k-moyennes), familles de couleur, luminosité, type de motif (uni / texturé / rayé / imprimé), raccord conseillé, compression WebP. | `color.js` |
| `modules/drape-engine.js` | **Moteur de drapé** WebGL : maillage plissé (répartition du tissu par longueur d’arc), embrasses, balancement, éclairage, reflets velours/satin, translucidité des voiles. Repli Canvas 2D automatique. | — |
| `modules/curtain-render.js` | Habillage de fenêtre (tringle, œillets, anneaux, pattes, franges, embrasses, ombres) + **présentoir** (mise en scène atelier des mock-ups). | `drape-engine.js` |
| `modules/scenes.js`, `textile.js` | **Décors du monde (6.3)** : 10 intérieurs illustrés (scandinave, bohème, classique français, marocain, Afrique contemporaine, minimaliste, salon, chambre, salle à manger, salle de bain) + textiles (coussins, nappe, plaid, dessus-de-lit). | — |
| `modules/curtain-scene.js` | Composition décor + rideaux + lumière (plein jour, avant/après tamisé), rendu par calques pour animer le tissu. | les trois précédents |

## Structure des données

### Modèle (`models.json`)

```jsonc
{
  "id": "mod_…", "slug": "lin-sable", "name": "Lin Sable",
  "style": "tamisant",                 // voilage | tamisant | occultant | oeillets | plis-pinces | brode | boheme | douche
  "description": "…",
  "material": "lin",                   // lin | coton | voile | gaze | velours | jacquard | wax | macrame | polyester
  "rooms": ["salon", "chambre"],       // filtres « pièce »
  "colorFamilies": ["beige"],          // filtres « couleur »
  "colors": [{ "hex": "#D6C3A1", "name": "Sable", "weight": 0.62 }],  // couleurs dominantes (analyse)
  "availability": "disponible",        // disponible | sur-commande | epuise
  "price": { "amount": 9500, "unit": "metre", "currency": "XAF" },   // null = « sur devis »
  "featured": true,                    // « Motifs à la une »
  "status": "published",               // published | draft | archived
  "render": { "heading": "tab", "finish": "matte", "opacity": 0.78, "hem": "plain", "tileCm": 30, "wrap": "repeat" },
  "images": {
    "original": "/uploads/modeles/…webp",   // photo d'origine
    "swatch": "/uploads/modeles/…webp",     // tuile de tissu 512 px (texture du moteur)
    "mockups": { "ferme": "…", "miOuvert": "…", "embrasse": "…" }
  },
  "analysis": { "pattern": "texture", "stripes": null, "brightness": 0.71, "contrast": 0.08 },
  "createdAt": "…", "updatedAt": "…", "archivedAt": "…"
}
```

### Autres collections

- `styles.json` — les 8 salles : `id, order, roman, name, short, cartel, material, ambiance, decor, featuredModel, render` (préréglages de pose).
- `content.json` — tous les textes/images éditables (site, accueil, galerie, catalogue, composer, contact, atelier, confidentialité, SEO).
  Le champ `{lieu}` des titres SEO devient « à Douala » (ville renseignée) ou « au Cameroun ».
- `requests.json` — demandes : `type` (devis | conseil | commande), `customer`, `details` (dimensions, pièce, pose, doublure…),
  `composition` (décor, tissus, options, image), `status` (nouveau → en-cours → repondu → termine → archive), `notes`, `history`.
- `users.json` — comptes (mot de passe haché scrypt, rôle owner/staff) ; `sessions.json` — sessions (jeton haché).

## Sécurité

- Pas d’inscription publique ; comptes créés par la propriétaire ou en ligne de commande.
- Mots de passe hachés (scrypt), comparaison en temps constant, 6 essais / 15 min par IP.
- Cookie de session `HttpOnly`, `SameSite=Strict` (+ `Secure` en HTTPS) ; API admin : en-tête `X-Requested-With` + contrôle d’origine.
- CSP stricte (`script-src 'self'`, aucune ressource tierce hors lecteur TikTok au clic), `X-Frame-Options: DENY`, `nosniff`.
- Téléversements : signature binaire vérifiée (WebP/JPEG/PNG), taille limitée, noms aléatoires, URLs d’images limitées aux chemins locaux.
- Gabarits : échappement systématique ; liens des contenus limités à `https://` ou chemins internes.
- Formulaires publics : champ piège anti-robots, 8 envois / heure / IP.

## Performance

- Images WebP compressées (côté navigateur avant envoi), `loading="lazy"`, dimensions déclarées.
- Polices auto-hébergées (WOFF2, préchargées), aucune requête tierce au chargement.
- Modules de rendu chargés à la demande (IntersectionObserver) ; vignettes des décors dessinées pendant les temps morts.
- Compression gzip + ETag ; cache immuable pour les images téléversées.

## SEO

Titres/descriptions éditables par page, URL canonique, Open Graph, `sitemap.xml` (pages + fiches modèles), `robots.txt`,
JSON-LD `HomeGoodsStore` (téléphone, zone desservie, TikTok) et `Product` (prix, disponibilité) sur chaque fiche,
plan du site HTML, balisage sémantique et textes alternatifs.
