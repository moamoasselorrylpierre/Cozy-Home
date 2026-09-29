// Aide intégrée : le guide d'utilisation de l'espace pro, en version courte.
import { html, raw } from '../ui.js';

const SECTIONS = [
  ['Ajouter un nouveau tissu', [
    'Menu « Ajouter un modèle » → « Choisir une photo » (ou « Prendre une photo » depuis le téléphone).',
    'Photographiez le tissu à plat, de face, à la lumière du jour. Un simple morceau suffit.',
    'Déplacez le cadre doré sur la plus belle zone du tissu. Le site analyse la photo (couleurs, motif) et fabrique aussitôt trois visuels : rideau fermé, mi-ouvert et avec embrasses.',
    'Ajustez si besoin : le style (voilage, occultant…), le type de pose, l’opacité, et surtout « Taille réelle de la zone cadrée » (ex. 30 cm) pour que le motif ait la bonne échelle.',
    'Complétez la fiche (nom, description, pièces, prix) puis « Publier sur le site ». Le modèle apparaît immédiatement au catalogue, dans la galerie et dans l’outil de composition.',
  ]],
  ['Retirer un modèle qui n’est plus disponible', [
    'Menu « Modèles » → bouton « Retirer (archiver) » : le modèle disparaît du site mais reste dans « Archivés ».',
    'Il peut être restauré à tout moment avec « Restaurer ».',
    'Si le tissu reviendra bientôt, préférez modifier la fiche et choisir la disponibilité « Momentanément épuisé » ou « Sur commande ».',
  ]],
  ['Suivre les demandes', [
    'Le menu « Demandes » affiche un compteur rouge quand de nouvelles demandes arrivent (devis, conseils, commandes).',
    'Ouvrez une demande : elle passe automatiquement « En cours ». Le bouton « Répondre sur WhatsApp » ouvre la conversation avec un message déjà préparé.',
    'Si le client a utilisé « Compose ton intérieur », sa composition (image + tissus choisis) est jointe à la demande.',
    'Changez le statut (Réponse envoyée, Terminée, Archivée) et notez vos informations internes (mesures, prix proposé, rendez-vous).',
  ]],
  ['Modifier les textes et images du site', [
    'Menu « Contenus du site » : chaque page a sa rubrique (Accueil, Atelier, Contact…). Modifiez puis « Enregistrer les contenus ».',
    'Pour changer une image : « Remplacer », choisissez la photo. Elle est automatiquement allégée pour que le site reste rapide.',
    'Réseaux sociaux : collez le lien Instagram ou Facebook dans « Informations générales » le jour où le compte existe — l’icône « bientôt » devient active.',
    'Vidéos TikTok : collez le lien de partage d’une vidéo dans « Vidéos TikTok à la une » pour l’afficher sur l’accueil.',
    'Ville : renseignez-la pour améliorer le référencement Google (« rideaux sur mesure à … »).',
  ]],
  ['Salles de la galerie', [
    'Menu « Salles de la galerie » : modifiez le cartel (le petit texte façon musée), la matière, l’ambiance, la pièce exposée et le décor de chaque salle.',
  ]],
  ['Sécurité & équipe', [
    'Changez votre mot de passe dans « Mon compte & équipe » (10 caractères minimum, lettres et chiffres).',
    'Pour donner accès à une aide, créez-lui un compte « équipe » : il n’y a pas d’inscription publique. Retirez l’accès quand la collaboration s’arrête.',
    'Déconnectez-vous sur un ordinateur partagé (bas du menu).',
  ]],
];

export function render(el) {
  el.innerHTML = html`
    <header class="admin-head"><p class="kicker">Aide</p><h1>Guide de l’espace pro</h1><p class="lead">L’essentiel pour gérer le site en toute autonomie. Le guide complet (avec captures d’écran) se trouve dans le fichier docs/GUIDE-ADMIN.md.</p></header>
    <div class="help-grid">${SECTIONS.map(([title, steps]) => raw(html`
      <section class="admin-card"><h2>${title}</h2><ol class="help-steps">${steps.map((s) => raw(html`<li>${s}</li>`))}</ol></section>`))}</div>`;
}
