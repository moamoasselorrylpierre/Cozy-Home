# Plan du site — Cozy Home by Fany

Arborescence complète des deux espaces. Une version navigable existe aussi sur le site : `/plan-du-site`.

```
cozyhomebyfany ─┬─ ESPACE VISITEUR (public, indexé par les moteurs de recherche)
                │
                ├─ /                          Accueil
                │   ├─ Visuel d'ouverture (hero) + accroche + appels « Galerie » / « Devis »
                │   ├─ #motifs                Motifs à la une (pièces de collection, mock-ups)
                │   ├─ Services               Rideaux sur mesure · Relooking d'espace complet
                │   ├─ Réassurance            Fait main · Sur mesure · Livraison & pose · Conseil
                │   ├─ Teaser Galerie         Parcours des 8 salles
                │   ├─ Teaser Composition     Aperçu animé de « Compose ton intérieur »
                │   ├─ TikTok                 Derniers contenus @cozyhomebyfany (chargés au clic)
                │   └─ Appel final            Devis · Conseil · WhatsApp
                │
                ├─ /galerie                   La Galerie — exposition interactive
                │   ├─ #entree                Hall d'entrée + plan des salles
                │   ├─ #salle-voilage         Salle I    · Le Voilage
                │   ├─ #salle-tamisant        Salle II   · Le Tamisant
                │   ├─ #salle-occultant       Salle III  · L'Occultant
                │   ├─ #salle-oeillets        Salle IV   · Le Rideau à œillets
                │   ├─ #salle-plis-pinces     Salle V    · Les Plis pincés
                │   ├─ #salle-brode           Salle VI   · Le Brodé
                │   ├─ #salle-boheme          Salle VII  · Le Bohème (macramé, ikat)
                │   ├─ #salle-douche          Salle VIII · Le Rideau de douche déco
                │   │     chaque salle : cartel (style, texte, matière, ambiance), œuvre (décor + rideau),
                │   │     interactions (effleurer, loupe, avant/après lumière), « Voir les modèles de ce style »
                │   └─ Sortie                 → Catalogue · Compose ton intérieur
                │
                ├─ /catalogue                 Catalogue (filtres : style, couleur, matière, pièce)
                │   └─ /catalogue/:modele     Fiche modèle
                │        ├─ Vues : fermé · mi-ouvert · avec embrasses · échantillon
                │        ├─ Infos : matière, couleurs, pose, pièces, disponibilité, prix
                │        ├─ Mise en situation : scandinave, bohème, classique français, marocain,
                │        │   Afrique contemporaine, minimaliste, salon, chambre, salle à manger
                │        └─ Actions : Commander · Essayer dans le composeur · Devis
                │
                ├─ /composer                  Compose ton intérieur (atelier de visualisation)
                │   ├─ 01 La pièce            10 décors de référence
                │   ├─ 02 Les rideaux         tissus du catalogue (filtre par style)
                │   ├─ 03 La pose             embrasses, fixation, longueur, rail, panneaux, finition, ouverture
                │   ├─ 04 Coussins & linge    coussins, plaid, nappe, dessus-de-lit (+ assortiment automatique)
                │   └─ Actions                Envoyer comme base de devis · Enregistrer · Télécharger l'image
                │
                ├─ /contact                   Contact & devis
                │   ├─ ?demande=devis         Demande de devis (+ composition jointe, dimensions, budget)
                │   ├─ ?demande=conseil       Demande de conseil (« aidez-moi »)
                │   ├─ ?demande=commande      Choix du modèle → tunnel de commande
                │   └─ Coordonnées            WhatsApp +237 673412103 · TikTok · (Messenger/e-mail si renseignés)
                │
                ├─ /commande/:modele          Tunnel de commande (non indexé)
                │   └─ Dimensions → Confection → Coordonnées → Récapitulatif (+ estimation)
                │
                ├─ /atelier                   L'Atelier — Fany, son histoire, sa philosophie, savoir-faire,
                │                              compositions de l'atelier, relooking d'espaces entiers
                ├─ /confidentialite           Confidentialité (non indexée)
                ├─ /plan-du-site              Plan du site
                ├─ /sitemap.xml · /robots.txt SEO
                │
                └─ ESPACE PRO (/admin — lien discret « Espace pro » 🔑 en pied de page, non indexé)
                    ├─ Connexion              identifiant + mot de passe pré-définis (pas d'inscription)
                    ├─ #/tableau-de-bord      chiffres clés, dernières demandes, raccourcis
                    ├─ #/modeles              liste (publiés / brouillons / archivés), archiver, restaurer
                    ├─ #/modeles/nouveau      photo → analyse → mock-ups automatiques → fiche → publication
                    ├─ #/modeles/:id          modification d'un modèle
                    ├─ #/demandes             devis, conseils, commandes (filtres, statuts)
                    ├─ #/demandes/:id         détail, composition jointe, statut, notes, WhatsApp
                    ├─ #/galerie              cartels des 8 salles, pièce exposée, décor
                    ├─ #/contenus             textes, images, réseaux sociaux, SEO de toutes les pages
                    ├─ #/compte               mot de passe, équipe (réservé à la propriétaire)
                    └─ #/aide                 guide d'utilisation intégré
```

## Parcours principaux

1. **TikTok → site (mobile)** : Accueil → Motifs à la une → Fiche modèle → *Commander* ou *WhatsApp*.
2. **Inspiration** : Accueil → La Galerie (salle par salle) → *Voir les modèles de ce style* → Catalogue filtré.
3. **Projet de relooking** : Compose ton intérieur → *Envoyer comme base de devis* → formulaire de devis pré-rempli
   avec la composition jointe → Fany la retrouve dans *Demandes*.
4. **Indécis** : Contact → *Demande de conseil* (un simple message suffit).
