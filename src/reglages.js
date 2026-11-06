// Bloc « Réglages » de Data, Élec et Canvas (étape 28, lot 28b, spec § 6) : réglages secondaires repliés à la fin du
// formulaire, sous une ligne de titre qui les résume (« Réglages, 60 Hz, 12 bits, sans redondance »). Les textes et les
// contrôles sont les fonctions pures de src/reponse.js ; ici, leur lien avec la page : ligne refaite à la fin de chaque
// calcul de l'onglet, repli gardé sur l'appareil, ouverture d'elle-même sur une saisie invalide du bloc.

import { el, remplacer } from './dom.js';
import {
  lireRepli, garderRepli, ligneReglagesData, ligneReglagesElec, ligneReglagesCanvas, champsInvalidesData, champsInvalidesElec, champsInvalidesCanvas,
} from './reponse.js';

// Repli, préférence de l'appareil (spec § 4) : replié la première fois, un état par onglet ; jamais dans une presta, un
// export ni « Repartir des réglages par défaut ».
export const CLE_REGLAGES = 'mur-led-reglages';
export const REPLI_REGLAGES = Object.freeze({ data: 'ferme', elec: 'ferme', canvas: 'ferme' });

// Stockage de l'appareil (localStorage), null quand le navigateur le refuse.
export function stockageAppareil() {
  try {
    return globalThis.localStorage ?? null;
  } catch (erreur) {
    return null;
  }
}

// Textes bruts du formulaire (spec § 6.2, constat 8) : ceux de FormData, case cochée « on », bouton radio coché ; une
// saisie illisible reste telle quelle.
export function textesBruts(formulaire) {
  const bruts = {};
  for (const [nom, valeur] of new FormData(formulaire)) {
    if (!(nom in bruts)) bruts[nom] = typeof valeur === 'string' ? valeur : '';
  }
  return bruts;
}

// Noms des champs visibles : aucun élément caché (attribut hidden) entre le champ et son formulaire. Le bloc replié ne
// cache rien : ses champs sont les réglages en cours.
export function champsVisibles(formulaire) {
  const noms = new Set();
  for (const champ of formulaire.elements) {
    if (!champ.name || noms.has(champ.name)) continue;
    let cache = false;
    for (let x = champ; x && x !== formulaire; x = x.parentElement) if (x.hidden) cache = true;
    if (!cache) noms.add(champ.name);
  }
  return noms;
}

// Texte de l'option choisie d'une liste du formulaire (nom court tiré par ligneReglagesData).
const texteChoisi = (formulaire, nom) => formulaire.elements[nom]?.selectedOptions?.[0]?.textContent ?? undefined;

// Ligne de titre et saisies invalides de chaque onglet. `listes()` (Canvas) : { liaisons, regies, sources } de l'écran.
const ONGLETS = {
  data: {
    ligne: (f, bruts, visibles) => ligneReglagesData(bruts, {
      visibles, libelles: { distributeur: texteChoisi(f, 'distributeur'), switchMegapixel: texteChoisi(f, 'switchMegapixel'), carteSortie: texteChoisi(f, 'carteSortie') },
    }),
    invalides: champsInvalidesData,
  },
  elec: { ligne: (f, bruts, visibles) => ligneReglagesElec(bruts, { visibles }), invalides: champsInvalidesElec },
  canvas: { ligne: (f, bruts, visibles, listes) => ligneReglagesCanvas(bruts, { visibles, ...listes }), invalides: champsInvalidesCanvas },
};

// Reprise des saisies (configuration.js : saisies gardées, autre mur, réglages par défaut) : pas d'ouverture d'elle-même
// pendant les passes, où un champ garde un moment la valeur du mur d'avant (spec § 6.3) ; à la fin, chaque bloc est
// refait sur les saisies reprises, et s'ouvre si l'une d'elles est invalide.
let reprises = 0;
const montes = new Set();
export function debutReprise() {
  reprises += 1;
}
export function finReprise() {
  reprises = Math.max(0, reprises - 1);
  if (reprises === 0) for (const bloc of montes) bloc.actualiser();
}

// Morceaux de la ligne de titre (spec § 7) : chaque « · » caché aux lecteurs d'écran et suivi d'une virgule cachée à
// l'œil (on lit « Réglages, 60 Hz, 12 bits ») ; espace insécable avant le point, jamais en début de ligne ; un morceau
// court n'est jamais coupé (« sans redondance »), un long passe à la ligne (nom de source ou de régie de la base).
const COURT = 24;
function contenuLigne(morceaux) {
  return morceaux.map((m, i) => [
    i ? el('span', { 'aria-hidden': 'true' }, ' · ') : null,
    i ? el('span', { class: 'cache-visuel' }, ', ') : null,
    el('span', { class: [m.alerte ? 'reglages-alerte' : null, m.texte.length <= COURT ? 'insecable' : null].filter(Boolean).join(' ') || null }, m.texte),
  ]);
}

// `details` : le bloc (details.reglages, dans son formulaire) ; `onglet` : data, elec ou canvas ; `stockage` : celui de
// l'appareil (un stockage d'essai dans les tests). Rend { actualiser, retirer } : `actualiser()` à la fin de chaque calcul
// de l'onglet ; `actualiser({ ouvrir: false })` refait la ligne sans ouvrir le bloc.
export function monterReglages(details, { onglet, stockage = stockageAppareil(), listes = () => ({}) } = {}) {
  const formulaire = details.closest('form');
  const resume = details.querySelector(':scope > summary');
  const zone = resume.querySelector('.reglages-ligne');
  const regles = ONGLETS[onglet];
  details.open = lireRepli(stockage, CLE_REGLAGES, REPLI_REGLAGES)[onglet] === 'ouvert';
  // État écrit sur un appui de l'utilisateur seulement (clic, Entrée, Espace), jamais sur « toggle » : une ouverture par
  // le code ne change pas l'état gardé (§ 4, constat 7). Le clic précède le changement : l'état gardé est l'inverse.
  resume.addEventListener('click', (evenement) => {
    if (evenement.defaultPrevented) return;
    garderRepli(stockage, CLE_REGLAGES, { ...lireRepli(stockage, CLE_REGLAGES, REPLI_REGLAGES), [onglet]: details.open ? 'ferme' : 'ouvert' });
  });
  const bloc = {
    actualiser({ ouvrir = true } = {}) {
      const bruts = textesBruts(formulaire);
      const visibles = champsVisibles(formulaire);
      remplacer(zone, contenuLigne(regles.ligne(formulaire, bruts, visibles, listes())));
      // Ouvert de lui-même, jamais refermé seul ; l'état gardé ne change pas.
      if (ouvrir && reprises === 0 && !details.open && regles.invalides(bruts, { visibles }).length) details.open = true;
    },
    retirer() {
      montes.delete(bloc);
    },
  };
  montes.add(bloc);
  bloc.actualiser({ ouvrir: false });
  return bloc;
}
