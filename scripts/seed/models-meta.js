// Modèles de démonstration (à remplacer par les vrais tissus de l'atelier depuis l'espace admin).
// Les couleurs dominantes, images de tissu et mock-ups sont calculés par scripts/build-assets.mjs.
export const MODELS_META = [
  {
    slug: 'voile-ivoire', name: 'Voile Ivoire', style: 'voilage', material: 'voile', rooms: ['salon', 'chambre', 'salle-a-manger'],
    description: 'Un voile de coton d’une grande finesse qui adoucit la lumière du jour et floute délicatement le dehors.',
    availability: 'disponible', price: { amount: 6500, unit: 'metre' }, featured: true,
    render: { heading: 'rod', finish: 'sheer', opacity: 0.3, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'gaze-rose-poudre', name: 'Gaze Rose Poudré', style: 'voilage', material: 'gaze', rooms: ['chambre', 'chambre-enfant'],
    description: 'Une gaze de coton froissée, rose poudré, pour une lumière tendre et un tombé naturellement bohème.',
    availability: 'disponible', price: { amount: 7000, unit: 'metre' }, featured: false,
    render: { heading: 'rod', finish: 'sheer', opacity: 0.42, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'velours-sapin', name: 'Velours Sapin', style: 'occultant', material: 'velours', rooms: ['salon', 'chambre'],
    description: 'Un velours vert sapin profond aux reflets changeants, doublé occultant : la nuit en plein jour, avec panache.',
    availability: 'disponible', price: { amount: 14500, unit: 'metre' }, featured: true,
    render: { heading: 'pinch', finish: 'velvet', opacity: 1, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'velours-terracotta', name: 'Velours Terracotta', style: 'occultant', material: 'velours', rooms: ['salon', 'chambre', 'bureau'],
    description: 'La chaleur d’une terre cuite dans un velours dense et soyeux, qui isole de la lumière comme de la chaleur.',
    availability: 'sur-commande', price: { amount: 14500, unit: 'metre' }, featured: false,
    render: { heading: 'eyelet', finish: 'velvet', opacity: 1, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'lin-sable', name: 'Lin Sable', style: 'tamisant', material: 'lin', rooms: ['salon', 'chambre', 'bureau'],
    description: 'Un lin naturel aux flammes irrégulières, couleur sable, qui tamise la lumière en un halo doré.',
    availability: 'disponible', price: { amount: 9500, unit: 'metre' }, featured: true,
    render: { heading: 'tab', finish: 'matte', opacity: 0.78, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'bogolan-nuit', name: 'Bogolan Nuit', style: 'tamisant', material: 'coton', rooms: ['salon', 'bureau'],
    description: 'Les symboles peints du bogolan, ivoire sur brun profond : un tissu à forte personnalité, tissé et peint à la main.',
    availability: 'sur-commande', price: { amount: 12000, unit: 'metre' }, featured: false,
    render: { heading: 'eyelet', finish: 'matte', opacity: 0.9, hem: 'plain', tileCm: 34 },
  },
  {
    slug: 'rayure-riviera', name: 'Rayure Riviera', style: 'oeillets', material: 'coton', rooms: ['salon', 'cuisine', 'chambre-enfant'],
    description: 'Des rayures sable et ivoire rehaussées d’un filet vert sapin : l’esprit des maisons de bord de mer.',
    availability: 'disponible', price: { amount: 8000, unit: 'metre' }, featured: false,
    render: { heading: 'eyelet', finish: 'matte', opacity: 0.92, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'wax-soleil', name: 'Wax Soleil', style: 'oeillets', material: 'wax', rooms: ['salon', 'salle-a-manger', 'chambre-enfant'],
    description: 'Un wax éclatant aux soleils concentriques ocre, terracotta et bleu canard, monté sur œillets pour des plis réguliers.',
    availability: 'disponible', price: { amount: 7500, unit: 'metre' }, featured: true,
    render: { heading: 'eyelet', finish: 'matte', opacity: 0.96, hem: 'plain', tileCm: 36 },
  },
  {
    slug: 'toile-de-jouy-brique', name: 'Toile de Jouy Brique', style: 'plis-pinces', material: 'coton', rooms: ['salle-a-manger', 'chambre'],
    description: 'Scènes pastorales gravées au trait, couleur brique sur fond écru : un classique intemporel, monté en plis pincés.',
    availability: 'disponible', price: { amount: 11000, unit: 'metre' }, featured: false,
    render: { heading: 'pinch', finish: 'matte', opacity: 0.95, hem: 'plain', tileCm: 40 },
  },
  {
    slug: 'damas-or', name: 'Damas Or', style: 'plis-pinces', material: 'jacquard', rooms: ['salon', 'salle-a-manger'],
    description: 'Médaillons baroques tissés ton sur ton, champagne et or, dont le satin s’illumine au passage de la lumière.',
    availability: 'disponible', price: { amount: 16000, unit: 'metre' }, featured: true,
    render: { heading: 'pinch', finish: 'satin', opacity: 0.98, hem: 'plain', tileCm: 38 },
  },
  {
    slug: 'broderie-camelia', name: 'Broderie Camélia', style: 'brode', material: 'coton', rooms: ['salle-a-manger', 'chambre', 'salon'],
    description: 'Camélias et feuillages brodés en relief sur un coton ivoire : à contre-jour, la broderie se dessine comme une dentelle.',
    availability: 'disponible', price: { amount: 13500, unit: 'metre' }, featured: true,
    render: { heading: 'rod', finish: 'matte', opacity: 0.62, hem: 'plain', tileCm: 32 },
  },
  {
    slug: 'voile-brode-plumetis', name: 'Voile Plumetis', style: 'brode', material: 'voile', rooms: ['chambre', 'chambre-enfant', 'salon'],
    description: 'Un voile ivoire semé de petits pois brodés en plumetis : léger, romantique, délicatement graphique.',
    availability: 'disponible', price: { amount: 8500, unit: 'metre' }, featured: false,
    render: { heading: 'rod', finish: 'sheer', opacity: 0.4, hem: 'plain', tileCm: 28 },
  },
  {
    slug: 'macrame-naturel', name: 'Macramé Naturel', style: 'boheme', material: 'macrame', rooms: ['salon', 'chambre'],
    description: 'Un rideau de cordon de coton noué main, en losanges ajourés, terminé par des franges qui dansent.',
    availability: 'sur-commande', price: { amount: 45000, unit: 'panneau' }, featured: false,
    render: { heading: 'tab', finish: 'matte', opacity: 0.8, hem: 'fringe', tileCm: 26 },
  },
  {
    slug: 'ikat-terre', name: 'Ikat Terre', style: 'boheme', material: 'coton', rooms: ['salon', 'bureau', 'chambre'],
    description: 'Losanges aux contours flammés, brique, ocre et indigo : un ikat solaire à l’âme voyageuse.',
    availability: 'disponible', price: { amount: 9000, unit: 'metre' }, featured: false,
    render: { heading: 'tab', finish: 'matte', opacity: 0.9, hem: 'fringe', tileCm: 34 },
  },
  {
    slug: 'zellige-azur', name: 'Zellige Azur', style: 'douche', material: 'polyester', rooms: ['salle-de-bain'],
    description: 'Étoiles et croisillons de zellige bleu majorelle sur une toile déperlante : la fraîcheur d’un riad dans votre salle de bain.',
    availability: 'disponible', price: { amount: 18000, unit: 'panneau' }, featured: false,
    render: { heading: 'rings', finish: 'matte', opacity: 1, hem: 'plain', tileCm: 30 },
  },
  {
    slug: 'palmes-tropicales', name: 'Palmes Tropicales', style: 'douche', material: 'polyester', rooms: ['salle-de-bain'],
    description: 'De grandes feuilles de bananier vert profond sur fond crème : une salle de bain qui respire la nature.',
    availability: 'disponible', price: { amount: 18000, unit: 'panneau' }, featured: false,
    render: { heading: 'rings', finish: 'matte', opacity: 1, hem: 'plain', tileCm: 44 },
  },
];
