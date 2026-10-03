// Fiche contenu et mire de mapping : petits calculs nouveaux (ratio réduit, hauteur de texte minimale, recul de vision)
// et texte de la fiche, à part des calculs du mur (calculs.js, inchangé). Fonctions pures (règles R221, R222 et R224).

import { nombre, nombreCourt } from './format.js';

function pgcd(a, b) {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y) [x, y] = [y, x % y];
  return x;
}

// Ratio réduit par le PGCD et sa valeur décimale à deux chiffres : 2112 × 1056 donne « 2:1 (2,00) ». Sans plafond :
// deux nombres premiers entre eux restent tels quels (1001:1000).
export function ratioReduit(largeurPx, hauteurPx) {
  if (!(largeurPx > 0) || !(hauteurPx > 0)) return null;
  const d = pgcd(largeurPx, hauteurPx);
  const [a, b] = [largeurPx / d, hauteurPx / d];
  const valeur = largeurPx / hauteurPx;
  return { a, b, valeur, texte: `${a}:${b} (${nombre(valeur, 2)})` };
}

// Hauteur minimale d'un caractère : distance du spectateur le plus éloigné ÷ 200 (facteur d'acuité AVIXA pour la
// décision simple, un élément = un caractère), en mm puis en pixels au pas de la dalle, arrondie au pixel supérieur.
// Sans distance (ou sans pas) : null, la ligne ne s'affiche pas.
export const FACTEUR_ACUITE = 200;
export function hauteurTexteMinimale(distanceM, pasMm) {
  if (!(distanceM > 0) || !(pasMm > 0)) return null;
  const mm = (distanceM * 1000) / FACTEUR_ACUITE;
  return { mm, px: Math.ceil(mm / pasMm - 1e-9) };
}

// Recul de vision (cahier des charges de l'appli, § 2.3) : recul minimal ≈ pas en mm lu en mètres, confortable ≈ 2 × pas,
// arrondis au dixième de mètre (pas de 2,84 mm : 2,8 m et 5,7 m). Sans pas : null, la ligne ne s'affiche pas.
const auDixieme = (x) => Math.round(x * 10) / 10;
export function reculVision(pasMm) {
  if (!(pasMm > 0)) return null;
  return { minimalM: auDixieme(pasMm), confortableM: auDixieme(2 * pasMm) };
}

// Nom de projet pour un fichier : minuscules, sans espace, sans accent ni signe (« Salon B » donne « salonb »).
export function nomCourtProjet(projet) {
  return (projet ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Nom du fichier de la mire : mire_<projet>_<largeur>x<hauteur>.png, et mire_<projet>_proc<n>_… par processeur.
export function nomFichierMire({ projet = '', largeurPx, hauteurPx, processeur = null }) {
  return ['mire', nomCourtProjet(projet) || null, processeur ? `proc${processeur}` : null, `${largeurPx}x${hauteurPx}`]
    .filter(Boolean).join('_') + '.png';
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Date du jour en toutes lettres : « 3 octobre 2026 ».
export function dateLongue(date) {
  return `${date.getDate()} ${MOIS[date.getMonth()]} ${date.getFullYear()}`;
}

// Texte partagé de la fiche : une ligne par information, modèles de data/fiche-contenu.json (texte fixe sans tiret),
// valeurs entre accolades remplacées ; une ligne dont une valeur manque (null) est omise (pas de distance : pas de
// ligne « Texte ») ; une valeur vide reste possible (pas de nom de projet). Les noms de produits viennent des données, tels quels.
export function texteFicheContenu(valeurs, modeles) {
  return modeles.lignes
    .flatMap((l) => {
      if (l.liste) return (valeurs[l.liste] ?? []).length > 1 ? [l.modele, ...valeurs[l.liste].map((x) => `• ${x}`)] : [];
      return [l.modele];
    })
    .filter((modele) => [...modele.matchAll(/\{(\w+)\}/g)].every((m) => valeurs[m[1]] !== null && valeurs[m[1]] !== undefined))
    .map((modele) => modele.replace(/\{(\w+)\}/g, (_, cle) => String(valeurs[cle])))
    .join('\n');
}

// Valeurs de la fiche pour un mur câblé et les saisies : tout vient des calculs existants, sauf le ratio et la hauteur
// de texte. `zones` : un texte par processeur (x, y, largeur, hauteur dans le mur).
export function valeursFiche({ mur, dalle, evaluation, pasMm, saisies, date, nomMire }) {
  const ratio = ratioReduit(mur.pxLargeur, mur.pxHauteur);
  const texte = hauteurTexteMinimale(saisies.distanceM, pasMm);
  const recul = reculVision(pasMm);
  const cadre = saisies.sortie === 'cadre' ? saisies.cadre : null;
  const groupes = evaluation?.groupes ?? [];
  return {
    projet: saisies.projet?.trim() ? `projet ${saisies.projet.trim()}, ` : '',
    date: dateLongue(date),
    largeurM: nombreCourt(mur.largeurMm / 1000, 2),
    hauteurM: nombreCourt(mur.hauteurMm / 1000, 2),
    colonnes: mur.colonnes,
    lignes: mur.lignes,
    // Rangée de demi-dalles : sa propre fiche, nommée telle quelle (nom de produit).
    modele: mur.demi ? `${dalle.nom} et ${mur.colonnes} ${mur.demi.nom}` : dalle.nom,
    pas: nombreCourt(pasMm, 2),
    largeurPx: mur.pxLargeur,
    hauteurPx: mur.pxHauteur,
    totalPx: nombre(mur.pxLargeur * mur.pxHauteur),
    ratio: ratio?.texte ?? null,
    sortie: cadre
      ? `${cadre.largeurPx} × ${cadre.hauteurPx} px, mur placé en x ${cadre.x}, y ${cadre.y},`
      : `${mur.pxLargeur} × ${mur.pxHauteur} px`,
    cadence: nombreCourt(saisies.cadenceHz, 2),
    reculMin: recul ? nombreCourt(recul.minimalM, 1) : null,
    reculConfort: recul ? nombreCourt(recul.confortableM, 1) : null,
    texteMinPx: texte?.px ?? null,
    texteMinMm: texte ? nombreCourt(texte.mm, 1) : null,
    distance: texte ? nombreCourt(saisies.distanceM, 1) : null,
    fichier: nomMire,
    zones: groupes.length > 1
      ? groupes.map((g, i) => `processeur ${i + 1}, ${evaluation.processeur.modele} : x ${g.x[0]}, y ${g.y[0]}, ${g.largeurPx} × ${g.hauteurPx} px`)
      : [],
  };
}
