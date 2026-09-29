# Contrat technique — module des décors (scenes.js + textile.js)

Fichiers à produire :
- `public/js/modules/textile.js`
- `public/js/modules/scenes.js`
- `scripts/dev/preview-scenes.html` (banc d'essai)

## Style graphique attendu
Illustrations vectorielles dessinées en Canvas 2D, **vue d'élévation frontale** (on regarde un mur de face,
comme un dessin d'architecte d'intérieur), rendu *haut de gamme* : aplats doux, dégradés subtils, ombres
de contact douces, fines textures (enduit, grain de bois, zellige), lumière cohérente venant de la fenêtre.
Pas de contours noirs, pas de style « cartoon ». Palette propre à chaque décor, harmonieuse avec la
charte (ivoire #F6F1E9, lin #EFE6D8, sapin #2F3E36, doré #C9A227, terracotta #B5654A, anthracite #26241F,
grège #D8CBB4).

## Système de coordonnées
Espace logique **1600 × 1000**. Le `ctx` reçu est déjà mis à l'échelle : dessiner en coordonnées logiques.
Le sol commence en général vers y ≈ 820.

## API de textile.js
```js
// Remplit un chemin avec un tissu (texture répétée) + ombrage volumique selon le type d'objet.
// texture : HTMLCanvasElement | HTMLImageElement | ImageBitmap | null
//   null => utiliser fallbackColor (aplat + le même ombrage).
// kind : 'cushion' (coussin bombé : ombrage radial + couture/liseré), 'tablecloth' (nappe : plis verticaux
//        dans le retombé), 'throw' (plaid drapé), 'bedspread' (dessus de lit), 'pouf', 'flat'.
// bounds : {x, y, w, h} du chemin ; scale : taille en px logiques d'un motif (défaut 110).
export function paintTextile(ctx, path2D, { texture, fallbackColor = '#E9DFCF', kind = 'flat', bounds, scale = 110, rotation = 0 }) {}
```
Doit utiliser `ctx.createPattern` + `pattern.setTransform(new DOMMatrix()...)` pour l'échelle, puis des
calques d'ombrage (`globalCompositeOperation = 'multiply'` / `'soft-light'`, dégradés) clipés au chemin.

## API de scenes.js
```js
export const DECORS = [
  {
    id: 'salon-moderne',
    label: 'Salon moderne',
    room: 'salon',               // 'salon' | 'chambre' | 'salle-a-manger' | 'salle-de-bain'
    style: 'Moderne',            // libellé du style déco
    description: '1 phrase',
    textiles: ['cushions', 'throw'],   // emplacements de textiles disponibles dans ce décor
    thumbColors: ['#..', '#..'],       // 2-3 couleurs pour une vignette
  },
  ...
];

// Dessine le décor complet. Appelle api.drawCurtains(ctx, spec) AU BON MOMENT dans l'ordre des calques
// (après mur + fenêtre + sol + déco murale, avant le mobilier au premier plan).
// Appelle api.paintTextile(ctx, slot, path2D, opts) pour chaque textile (coussins, nappe, plaid...),
// slot ∈ decor.textiles ; api.paintTextile choisira la texture (ou null) — il suffit de passer
// { kind, bounds, fallbackColor, rotation? }.
export function drawDecor(ctx, id, api) {}

// spec transmis à api.drawCurtains :
{
  mode: 'window' | 'shower',
  window: { x, y, w, h },        // ouverture vitrée (pour 'shower' : zone de la baignoire/douche)
  ceilingY: 40,                  // hauteur du plafond (fixation « plafond »)
  floorY: 830,                   // le rideau tombe jusqu'ici (ourlet au sol)
  sillY: ...,                    // appui de fenêtre (longueur « allège »)
  rodMaxX0: ..., rodMaxX1: ...,  // débord maximal de la tringle (murs, meubles)
  hardware: 'brass' | 'black' | 'wood' | 'white',  // finition de tringle par défaut du décor
}
```
La fenêtre doit être dessinée (encadrement, vitrage lumineux ciel/jardin très doux, meneaux), SANS rideaux
(ce sont eux qui seront ajoutés par drawCurtains). Prévoir de l'espace mural de chaque côté de la fenêtre
(≥ 180 px) pour les rideaux ouverts.

## Décors à livrer (10)
1. `salon-moderne` — Salon moderne : mur grège chaud, grande baie, canapé bas bouclette, 3 coussins (textile
   cushions), plaid (throw), table basse, lampadaire arc, grande plante, tapis, parquet chêne.
2. `chambre-cosy` — Chambre cosy : fenêtre décalée à gauche, lit à droite avec tête de lit capitonnée,
   oreillers/coussins (cushions), dessus-de-lit (bedspread), chevet + lampe, tons chauds.
3. `salle-a-manger-classique` — Salle à manger classique : lambris/soubassement, table avec nappe (tablecloth),
   chaises médaillon, lustre, bouquet.
4. `scandinave` — Scandinave : mur blanc cassé, chêne clair, canapé simple, coussins, tabouret bois, miroir rond,
   étagère, vase pampa.
5. `boheme` — Bohème : mur terre/crème, fauteuil en rotin (paon), suspension macramé murale, beaucoup de plantes,
   pouf (textile pouf dans 'cushions'), coussins de sol, tapis kilim.
6. `classique-francais` — Classique français : haute porte-fenêtre, moulures en panneaux, parquet point de Hongrie,
   bergère Louis XVI (coussin), console dorée, miroir.
7. `minimaliste` — Moderne minimaliste : blanc/gris béton, un canapé bas, une lampe sculpturale, une oeuvre.
8. `marocain` — Marocain : fenêtre en arc outrepassé, soubassement de zellige, lanternes ciselées, banquette
   sedari avec coussins, table plateau en laiton, tapis Beni Ouarain.
9. `afrique-contemporaine` — Afrique contemporaine : mur ocre doux, chapeaux Juju (Bamiléké, Cameroun) en
   composition murale, tabouret bamiléké sculpté, paniers tressés, canapé bas avec coussins, plantes.
10. `salle-de-bain` — Salle de bain : baignoire (mode 'shower' : le rideau de douche pend d'une barre au-dessus
    de la baignoire), carrelage, plantes, serviette. Pas de fenêtre obligatoire (spec.mode = 'shower',
    spec.window = zone de la baignoire au-dessus du rebord, spec.floorY = hauteur du rebord de la baignoire
    + ~40 px car le rideau descend dans la baignoire).

## Banc d'essai
`scripts/dev/preview-scenes.html` : affiche les 10 décors (canvas 800×500 chacun, `ctx.scale(0.5,0.5)`), avec un
`drawCurtains` factice (deux rectangles semi-transparents + barre) et un `paintTextile` qui utilise une texture
de test (damier doux) pour visualiser les emplacements. Servir le dossier `public/` + `scripts/` depuis la racine
(`python3 -m http.server 8765` à la racine du dépôt) puis capturer avec
`node scripts/dev/shot.mjs http://localhost:8765/scripts/dev/preview-scenes.html out.png 1700 2800 --full`.
