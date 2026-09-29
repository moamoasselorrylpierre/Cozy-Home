# Cozy Home by Fany — site web

Site vitrine & boutique de **Cozy Home by Fany** : confection de rideaux sur mesure et relooking d’intérieur.
Un portfolio-boutique interactif en deux espaces :

- **Espace visiteur** — accueil, *La Galerie* (exposition interactive des styles de rideaux), catalogue filtrable,
  fiches modèles avec mise en situation dans des décors du monde, atelier *Compose ton intérieur*,
  demandes de devis / conseil, tunnel de commande, page *L’Atelier*.
- **Espace pro** (`/admin`, lien discret « Espace pro » en pied de page) — ajout d’un tissu par simple photo avec
  **génération automatique des mock-ups** (rideau plissé et suspendu), archivage, textes et images du site,
  cartels de la galerie, suivi des demandes, gestion de l’équipe.

## Hébergement : 100 % Cloudflare

| Élément | Service |
|---|---|
| Pages, espace pro, formulaires | Cloudflare **Workers** |
| Modèles, textes, demandes, comptes | Cloudflare **D1** (base de données) |
| Images déposées depuis l’espace pro | Cloudflare **D1** (R2 en option) |
| CSS, scripts, polices, visuels | **Static Assets** |

La base D1 est créée automatiquement au premier déploiement (aucune carte bancaire requise).
👉 Pas à pas : **[docs/DEPLOIEMENT-CLOUDFLARE.md](docs/DEPLOIEMENT-CLOUDFLARE.md)**
(import du dépôt GitHub depuis le tableau de bord Cloudflare, sans rien installer).

Le compte de Fany (`fany`) est créé à partir du secret **`ADMIN_PASSWORD`** défini dans les paramètres du Worker.

## Développement local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .dev.vars.example .dev.vars   # puis renseigner ADMIN_PASSWORD
npm run dev                      # http://localhost:8787 (D1 simulée localement)
npm test                         # tests d'intégration sur le Worker local
npm run deploy                   # déploiement avec Wrangler (compte Cloudflare connecté via « npx wrangler login »)
npm run build:assets             # régénère les visuels de démonstration (Playwright + Chromium)
npm run maquettes                # régénère les captures de docs/maquettes
```

## Configuration

| Nom | Type | Rôle |
|---|---|---|
| `ADMIN_PASSWORD` | secret | Mot de passe du compte `fany` (création au premier accès). |
| `ADMIN_PASSWORD_RESET` | secret | Réinitialise le mot de passe oublié (à supprimer ensuite). |
| `ADMIN_USER` | variable | Identifiant du compte propriétaire (`fany`). |
| `SITE_URL` | variable | Adresse officielle (domaine personnalisé) pour le SEO. |
| `PASSWORD_ITERATIONS` | variable | Coût du hachage des mots de passe (50 000 par défaut). |

## Documentation

- [docs/PLAN-DU-SITE.md](docs/PLAN-DU-SITE.md) — arborescence complète du site
- [docs/MAQUETTES.md](docs/MAQUETTES.md) — maquettes des pages clés (captures desktop & mobile)
- [docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md) — guide d’utilisation de l’espace pro pour Fany et son équipe
- [docs/DEPLOIEMENT-CLOUDFLARE.md](docs/DEPLOIEMENT-CLOUDFLARE.md) — mise en ligne sur Cloudflare, domaine, sauvegardes
- [docs/TECHNIQUE.md](docs/TECHNIQUE.md) — architecture, structure des données, modules indépendants

> Les 16 tissus livrés sont des **modèles de démonstration** (visuels générés, prix indicatifs) destinés à être
> remplacés par les vraies créations de l’atelier depuis l’espace pro.
