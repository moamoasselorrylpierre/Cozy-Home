# Mettre le site en ligne sur Cloudflare

Tout le site fonctionne sur **votre compte Cloudflare**, sans ordinateur allumé :

| Élément | Service Cloudflare |
|---|---|
| Pages du site, espace pro, formulaires | **Workers** |
| Modèles, textes, demandes, comptes | **D1** (base de données) |
| Images déposées depuis l’espace pro | **D1** (ou **R2**, facultatif — voir plus bas) |
| CSS, scripts, polices, visuels du site | **Static Assets** (servis par le réseau Cloudflare) |

La base D1 est **créée automatiquement** au premier déploiement ; aucune carte bancaire n’est nécessaire.
L’offre gratuite suffit pour démarrer : 100 000 requêtes par jour pour le Worker, 5 millions de lectures
et 100 000 écritures par jour pour la base D1 (500 Mo par base, soit plusieurs centaines de modèles avec leurs images).

> ⚠️ Vérifiez à chaque étape que vous êtes connecté·e à **votre** compte Cloudflare :
> l’adresse e-mail affichée en haut à droite du tableau de bord doit être la vôtre.

---

## Méthode recommandée : déploiement automatique depuis GitHub (aucune installation)

### 1. Préparer le dépôt
Fusionnez la pull request dans la branche `main` du dépôt GitHub `Cozy-Home`
(ou notez le nom de la branche à déployer).

### 2. Créer le Worker à partir du dépôt
1. Ouvrez https://dash.cloudflare.com → **Workers & Pages** → **Créer une application**.
2. Choisissez **Importer un dépôt** (*Import a repository*), connectez votre compte GitHub si demandé,
   puis sélectionnez le dépôt **Cozy-Home**.
3. Réglages du projet :
   - **Nom du projet** : `cozy-home` (doit être identique au nom indiqué dans `wrangler.jsonc`) ;
   - **Commande de build** : laisser vide ;
   - **Commande de déploiement** : `npx wrangler deploy` (valeur par défaut) ;
   - **Branche de production** : `main`.
4. Cliquez sur **Enregistrer et déployer**. Cloudflare installe le projet, crée la base **D1**,
   puis publie le site. Comptez 1 à 3 minutes.

### 3. Définir le mot de passe de l’espace pro
1. Dans **Workers & Pages → cozy-home → Paramètres → Variables et secrets**, cliquez sur **Ajouter**.
2. Type **Secret**, nom **`ADMIN_PASSWORD`**, valeur : votre mot de passe (10 caractères minimum, lettres et chiffres).
3. Enregistrez (cela redéploie le Worker).

### 4. Ouvrir le site
- Le site est disponible à l’adresse `https://cozy-home.<votre-sous-domaine>.workers.dev`
  (visible sur la page du Worker) : c’est votre **lien provisoire**, déjà en HTTPS.
- Espace pro : ajoutez `/admin` à l’adresse, identifiant **`fany`**, mot de passe défini à l’étape 3.
- Vous pouvez aussitôt déposer vos photos depuis n’importe quel appareil (ordinateur, téléphone) :
  elles sont compressées dans votre navigateur puis enregistrées sur Cloudflare.

### 5. Brancher votre nom de domaine (quand vous êtes prêt·e)
1. Le domaine doit être ajouté à votre compte Cloudflare (**Ajouter un domaine**) ou acheté via Cloudflare Registrar.
2. **Workers & Pages → cozy-home → Paramètres → Domaines et routes → Ajouter → Domaine personnalisé**,
   par exemple `cozyhomebyfany.com` et `www.cozyhomebyfany.com`.
3. **Variables et secrets → Ajouter** une variable (texte) **`SITE_URL`** = `https://cozyhomebyfany.com`
   (adresse officielle utilisée par Google, le plan du site et les partages).
4. Dans l’espace pro, **Contenus du site → Informations générales**, renseignez la **ville** pour le référencement.

### Mises à jour du site
Chaque modification poussée sur la branche `main` redéploie automatiquement le site.
**Les données (modèles, textes, demandes, images) sont conservées** : elles sont dans la base D1, pas dans le code.

---

## Méthode alternative : depuis un ordinateur (ligne de commande)

Prérequis : Node.js 20 ou plus récent.

```bash
git clone https://github.com/moamoasselorrylpierre/Cozy-Home.git
cd Cozy-Home
npm install
npx wrangler login            # ouvre le navigateur : connectez-vous à VOTRE compte Cloudflare
npx wrangler whoami           # vérifie le compte utilisé
npx wrangler deploy           # crée la base D1 et publie le site
npx wrangler secret put ADMIN_PASSWORD
```

---

## Mot de passe oublié
1. **Variables et secrets → Ajouter** un secret **`ADMIN_PASSWORD_RESET`** avec un nouveau mot de passe.
2. Ouvrez `/admin` : le mot de passe du compte `fany` est remplacé, connectez-vous avec le nouveau.
3. **Supprimez ensuite** le secret `ADMIN_PASSWORD_RESET` (et changez le mot de passe dans « Mon compte » si vous le souhaitez).

## Réglages facultatifs

| Variable | Rôle |
|---|---|
| `SITE_URL` | Adresse officielle du site (domaine personnalisé). |
| `PASSWORD_ITERATIONS` | Coût du chiffrement des mots de passe. 50 000 par défaut (compatible offre gratuite) ; `100000` avec l’offre payante Workers. |

## Images : compression automatique
Chaque image déposée dans l’espace pro est compressée **dans le navigateur, avant l’envoi**, au format WebP,
avec un poids maximal selon son usage :

| Image | Taille maximale | Poids visé |
|---|---|---|
| Photo d’échantillon | 1 400 px | ≤ 170 Ko |
| Texture du tissu | 512 px | ≤ 90 Ko |
| Rendus (fermé, mi-ouvert, embrasses) | 900 × 1 125 px | ≤ 130 Ko |
| Rendus pour mobile | 480 × 600 px | ≤ 45 Ko |
| Images du site (accueil, atelier…) | 1 800 px | ≤ 230 Ko |
| Portrait | 1 200 px | ≤ 160 Ko |

Exemple mesuré : une photo de téléphone de 13 Mo produit 8 fichiers pour 584 Ko au total.
Les téléphones reçoivent automatiquement les versions légères (`srcset`), et toutes les images
déposées sont mises en cache un an par le réseau Cloudflare.

## Sauvegarde
- Base de données : **Stockage et bases de données → D1 → cozy-home-db → Time Travel** (restauration à un instant donné ;
  durée de conservation selon votre offre), ou export complet : `npx wrangler d1 export cozy-home-db --remote --output sauvegarde.sql`.
- Les images déposées sont incluses dans la base D1 (table `media`), donc dans ces sauvegardes.

## En cas d’échec du déploiement
Ouvrez le build en échec (**Workers & Pages → cozy-home → Déploiements → Afficher le build**) et descendez
**tout en bas** du journal « Deploying » : la ligne rouge `✘ [ERROR] …` indique la cause, puis **Réessayer le build**.

## Option : stockage R2 pour les images
Utile seulement si la base approche 500 Mo. R2 doit d’abord être activé sur le compte
(**Stockage et bases de données → R2 → Activer**, un moyen de paiement est demandé même pour l’offre gratuite).
Ajoutez ensuite dans `wrangler.jsonc` : `"r2_buckets": [ { "binding": "MEDIA" } ]`.
Les nouvelles images iront dans R2 ; celles déjà déposées restent servies depuis D1.
