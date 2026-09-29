# Cozy Home by Fany — site web

Site vitrine & boutique de **Cozy Home by Fany** : confection de rideaux sur mesure et relooking d’intérieur.
Un portfolio-boutique interactif en deux espaces :

- **Espace visiteur** — accueil, *La Galerie* (exposition interactive des styles de rideaux), catalogue filtrable,
  fiches modèles avec mise en situation dans des décors du monde, atelier *Compose ton intérieur*,
  demandes de devis / conseil, tunnel de commande, page *L’Atelier*.
- **Espace pro** (`/admin`, lien discret « Espace pro » en pied de page) — ajout d’un tissu par simple photo avec
  **génération automatique des mock-ups** (rideau plissé et suspendu), archivage, textes et images du site,
  cartels de la galerie, suivi des demandes, gestion de l’équipe.

## Démarrer

Prérequis : **Node.js 20 ou plus récent**. Aucune dépendance à installer.

```bash
npm start            # http://localhost:3000
```

Au premier démarrage, le compte de Fany est créé et ses identifiants s’affichent **une seule fois** dans la console :

```
 Compte administrateur créé (Espace pro → /admin)
   Identifiant  : fany
   Mot de passe : Cozy-xxxxxxxx-42
```

Pour choisir soi-même les identifiants, définir `ADMIN_USER` et `ADMIN_PASSWORD` avant le premier démarrage, ou
utiliser : `npm run admin:create -- <identifiant> "<mot de passe>" [Nom] [--proprietaire]` (crée ou réinitialise un compte).

## Configuration (variables d’environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` / `HOST` | Port et interface d’écoute | `3000` / `0.0.0.0` |
| `SITE_URL` | URL publique (canonique, sitemap, partages), ex. `https://cozyhomebyfany.com` | déduite de la requête |
| `DATA_DIR` | Dossier des données (JSON) et des images téléversées | `./data` |
| `UPLOAD_DIR` | Dossier des images téléversées | `$DATA_DIR/uploads` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Compte créé au premier démarrage | `fany` / mot de passe aléatoire |
| `SECURE_COOKIES` | Cookie de session `Secure` (HTTPS) | activé si `SITE_URL` est en https |
| `TRUST_PROXY` | `true` derrière un proxy (Nginx, Render…) pour l’IP et le protocole réels | `false` |

## Mise en ligne

Hébergement Node.js classique (VPS, Render, Railway, Fly.io, o2switch…) **avec disque persistant** pour `DATA_DIR`
(les modèles, contenus, demandes et images y sont enregistrés). Exemple :

```bash
SITE_URL=https://cozyhomebyfany.com TRUST_PROXY=true DATA_DIR=/var/lib/cozyhome npm start
```

Placer le site derrière HTTPS. Sauvegarder régulièrement le dossier `DATA_DIR`.

## Développement

```bash
npm run dev             # redémarrage automatique, cache désactivé
npm test                # tests d'intégration (API, sécurité, rendu)
npm run build:assets    # régénère les visuels de démonstration (nécessite Playwright + Chromium)
npm run maquettes       # régénère les captures d'écran de docs/maquettes
```

## Documentation

- [docs/PLAN-DU-SITE.md](docs/PLAN-DU-SITE.md) — arborescence complète du site
- [docs/MAQUETTES.md](docs/MAQUETTES.md) — maquettes des pages clés (captures desktop & mobile)
- [docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md) — guide d’utilisation de l’espace pro pour Fany et son équipe
- [docs/TECHNIQUE.md](docs/TECHNIQUE.md) — architecture, structure des données, modules indépendants

> Les 16 tissus livrés sont des **modèles de démonstration** (visuels générés, prix indicatifs) destinés à être
> remplacés par les vraies créations de l’atelier depuis l’espace pro.
