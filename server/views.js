// Gabarits HTML intégrés au Worker (importés comme texte par Wrangler, voir « rules » dans wrangler.jsonc).
import index from '../views/index.html';
import galerie from '../views/galerie.html';
import catalogue from '../views/catalogue.html';
import modele from '../views/modele.html';
import composer from '../views/composer.html';
import contact from '../views/contact.html';
import commande from '../views/commande.html';
import atelier from '../views/atelier.html';
import confidentialite from '../views/confidentialite.html';
import planDuSite from '../views/plan-du-site.html';
import notFound from '../views/404.html';
import erreur from '../views/erreur.html';
import adminApp from '../views/admin/app.html';
import head from '../views/partials/head.html';
import header from '../views/partials/header.html';
import footer from '../views/partials/footer.html';
import icons from '../views/partials/icons.html';
import contactFields from '../views/partials/contact-fields.html';

export const VIEWS = {
  index,
  galerie,
  catalogue,
  modele,
  composer,
  contact,
  commande,
  atelier,
  confidentialite,
  'plan-du-site': planDuSite,
  404: notFound,
  erreur,
  'admin/app': adminApp,
  'partials/head': head,
  'partials/header': header,
  'partials/footer': footer,
  'partials/icons': icons,
  'partials/contact-fields': contactFields,
};
