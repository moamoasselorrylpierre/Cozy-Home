# Contrat technique — tissus de démonstration (fabric-patterns.js)

Fichiers à produire :
- `scripts/seed/fabric-patterns.js` (module ES)
- `scripts/dev/preview-fabrics.html` (banc d'essai)

## API
```js
// Chaque tissu dessine une TUILE PARFAITEMENT RACCORDABLE (seamless) de size × size px (size = 512 en
// production). La tuile sera répétée sur un rideau : aucune couture visible entre tuiles ne doit apparaître.
export const FABRICS = [
  { id: 'lin-sable', draw(ctx, size) { ... } },
  ...
];
```
Dessin en Canvas 2D pur (pas d'image externe). Utiliser un générateur pseudo-aléatoire déterministe
(graine fixe, ex. mulberry32) pour que le rendu soit reproductible. Pour le raccord : tout motif qui déborde
d'un bord doit être redessiné décalé de ±size sur le bord opposé (dessiner chaque élément 9 fois avec
offsets, ou utiliser un bruit périodique).

## Réalisme attendu
Ce sont des photos « d'échantillon de tissu » vues de face, éclairage uniforme, très réalistes :
armure du tissage (fils de chaîne/trame, flammes du lin), légères irrégularités, grain. Les motifs imprimés
doivent sembler imprimés sur l'armure (la trame reste visible par-dessus : calque 'multiply' final de la
texture de tissage). L'échelle : une tuile de 512 px ≈ 30 cm de tissu.

## Les 16 tissus (id — description)
1. `voile-ivoire` — voile de coton ivoire (#F3EDE2) très fin, fils verticaux ténus, quasi uni, lumineux.
2. `gaze-rose-poudre` — gaze de coton froissée rose poudré (#E8C9C0), plis de froissage doux irréguliers.
3. `velours-sapin` — velours vert sapin profond (#2F4A3E), toucher pelucheux, variations de reflet (sens du poil).
4. `velours-terracotta` — velours rouille/terracotta (#A9553B), même rendu velours.
5. `lin-sable` — lin naturel sable (#D6C3A1), armure toile visible avec flammes (irrégularités de fil).
6. `bogolan-nuit` — bogolan (Mali) : fond brun très foncé (#2B211B), symboles ivoire peints à la main
   (zigzags, points, croix, losanges) en bandes, tracé légèrement irrégulier.
7. `rayure-riviera` — rayures verticales : sable, ivoire et fins filets vert sapin ; coton tissé.
8. `wax-soleil` — wax africain : grands cercles concentriques / soleils stylisés ocre (#D39B2A), terracotta,
   bleu canard profond (#1F5560) sur fond crème, aspect imprimé cire (légers craquelés).
9. `toile-de-jouy-brique` — toile de Jouy : scènes pastorales monochromes (arbres, personnage, oiseaux,
   ruines, gravure au trait fin) terracotta (#B5654A) sur écru (#F2E9DA).
10. `damas-or` — damas jacquard : médaillons baroques ton sur ton champagne/or (#CDB27A / #B8975A),
    effet satiné (motif légèrement plus brillant que le fond).
11. `broderie-camelia` — broderie : fond coton ivoire, camélias et feuillages brodés en relief (points
    lancés visibles, ombre portée légère), fils écru et doré discret.
12. `voile-brode-plumetis` — voile ivoire semi-transparent parsemé de petits pois brodés (plumetis) en relief.
13. `macrame-naturel` — macramé : treillis de noeuds plats en cordon de coton crème (#EDE3D0), losanges
    ajourés (zones ajourées = couleur plus sombre #6E6254 pour suggérer le vide).
14. `ikat-terre` — ikat : motifs en losanges aux contours « flammés » (bords flous caractéristiques),
    couleurs terre : brique, ocre, indigo, écru.
15. `zellige-azur` — motif zellige marocain : étoiles à 8 branches et croisillons géométriques bleu majorelle
    / bleu profond / blanc, imprimé sur toile de polyester lisse.
16. `palmes-tropicales` — grandes feuilles de bananier et palmes vert profond / vert sauge sur fond crème,
    imprimé sur toile lisse.

## Banc d'essai
`scripts/dev/preview-fabrics.html` : pour chaque tissu, afficher la tuile 256 px répétée 3×3 (pour vérifier
le raccord) + son nom. Servir la racine du dépôt (`python3 -m http.server 8765`) et capturer avec
`node scripts/dev/shot.mjs http://localhost:8765/scripts/dev/preview-fabrics.html out.png 1600 2400 --full`.
