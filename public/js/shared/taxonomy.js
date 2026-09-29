// Référentiel partagé serveur / navigateur : libellés des filtres, statuts, types de pose.

export const STYLE_IDS = ['voilage', 'tamisant', 'occultant', 'oeillets', 'plis-pinces', 'brode', 'boheme', 'douche'];

export const ROOMS = [
  { id: 'salon', label: 'Salon' },
  { id: 'chambre', label: 'Chambre' },
  { id: 'salle-a-manger', label: 'Salle à manger' },
  { id: 'cuisine', label: 'Cuisine' },
  { id: 'salle-de-bain', label: 'Salle de bain' },
  { id: 'bureau', label: 'Bureau' },
  { id: 'chambre-enfant', label: "Chambre d'enfant" },
];

export const MATERIALS = [
  { id: 'lin', label: 'Lin' },
  { id: 'coton', label: 'Coton' },
  { id: 'voile', label: 'Voile' },
  { id: 'gaze', label: 'Gaze de coton' },
  { id: 'velours', label: 'Velours' },
  { id: 'jacquard', label: 'Jacquard' },
  { id: 'wax', label: 'Wax' },
  { id: 'macrame', label: 'Macramé' },
  { id: 'polyester', label: 'Polyester déperlant' },
];

export const COLOR_FAMILIES = [
  { id: 'blanc', label: 'Blanc & ivoire', swatch: '#F4EFE6' },
  { id: 'beige', label: 'Beige & naturel', swatch: '#D6C3A1' },
  { id: 'gris', label: 'Gris', swatch: '#A7A39C' },
  { id: 'noir', label: 'Noir & anthracite', swatch: '#2B2A27' },
  { id: 'marron', label: 'Brun & chocolat', swatch: '#6B4A35' },
  { id: 'terracotta', label: 'Terracotta & rouille', swatch: '#B5654A' },
  { id: 'jaune', label: 'Ocre & or', swatch: '#C9A227' },
  { id: 'vert', label: 'Vert', swatch: '#3F5E4C' },
  { id: 'bleu', label: 'Bleu', swatch: '#2E5B7A' },
  { id: 'rose', label: 'Rose', swatch: '#E2B8B0' },
  { id: 'rouge', label: 'Rouge & bordeaux', swatch: '#8E2F33' },
  { id: 'violet', label: 'Violet & prune', swatch: '#6A4A6E' },
];

export const AVAILABILITY = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'sur-commande', label: 'Sur commande' },
  { id: 'epuise', label: 'Momentanément épuisé' },
];

export const HEADINGS = [
  { id: 'eyelet', label: 'Œillets' },
  { id: 'pinch', label: 'Plis pincés' },
  { id: 'rod', label: 'Passe-tringle' },
  { id: 'tab', label: 'Pattes' },
  { id: 'rings', label: 'Anneaux' },
];

export const FINISHES = [
  { id: 'matte', label: 'Mat (coton, lin)' },
  { id: 'velvet', label: 'Velours (reflets)' },
  { id: 'satin', label: 'Satiné (jacquard, damas)' },
  { id: 'sheer', label: 'Voile (translucide)' },
];

export const HEMS = [
  { id: 'plain', label: 'Ourlet simple' },
  { id: 'fringe', label: 'Franges' },
];

export const REQUEST_TYPES = [
  { id: 'devis', label: 'Demande de devis' },
  { id: 'conseil', label: 'Demande de conseil' },
  { id: 'commande', label: 'Commande' },
];

export const REQUEST_STATUSES = [
  { id: 'nouveau', label: 'Nouvelle' },
  { id: 'en-cours', label: 'En cours' },
  { id: 'repondu', label: 'Réponse envoyée' },
  { id: 'termine', label: 'Terminée' },
  { id: 'archive', label: 'Archivée' },
];

export const MODEL_STATUSES = [
  { id: 'published', label: 'Publié' },
  { id: 'draft', label: 'Brouillon' },
  { id: 'archived', label: 'Archivé' },
];

export const PRICE_UNITS = [
  { id: 'metre', label: 'le mètre' },
  { id: 'panneau', label: 'le panneau' },
  { id: 'paire', label: 'la paire' },
];

export const labelOf = (list, id) => list.find((x) => x.id === id)?.label || id || '';
