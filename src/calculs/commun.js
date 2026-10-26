// Calculs du mur LED, petites aides partagées par tous les modules : tolérance, erreur de saisie, textes, suites,
// chemins en serpentin et remplissage glouton (ports, lignes et câblage du Schéma).
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';

export const EPS = 1e-9;
// « 2 ports », « 1 port ».
export const quantite = (n, mot) => `${nombreCourt(n)} ${mot}${n > 1 ? 's' : ''}`;
// Nom court de source au milieu d'une phrase : « aide en ligne Tessera 12.2.5 ».
export const minuscule = (texte) => (texte ? `${texte.charAt(0).toLowerCase()}${texte.slice(1)}` : texte);

// Erreur due à la saisie (valeur impossible, cible trop petite…) : affichée telle quelle à l'utilisateur.
export class ErreurSaisie extends Error {}

// Redondance avec les secours dans le même processeur (ports doublés) ; faux avec un processeur de secours (étape 22)
// ou sans redondance. Une évaluation d'avant l'étape 22 n'a que `redondance`.
export const portsDoubles = (evaluation) => Boolean(evaluation?.reglages?.portsDoubles ?? evaluation?.reglages?.redondance);
// Boîtiers d'une évaluation, processeurs de secours compris (2N avec un processeur de secours, étape 22) ; null sans découpage.
export const nombreBoitiers = (evaluation) => (Number.isInteger(evaluation?.nombre) ? evaluation.nombre + (evaluation.nombreSecours ?? 0) : null);

export const COINS = ['haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite'];
// Variante du câblage choisie par l'utilisateur (config imposée, étape 18c).
export const LIBELLE_IMPOSEE = 'Ma config (imposée)';
export const LIBELLES_COIN = {
  'haut-gauche': 'en haut à gauche', 'haut-droite': 'en haut à droite', 'bas-gauche': 'en bas à gauche', 'bas-droite': 'en bas à droite',
};

export const suite = (debut, fin) => Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);

// Positions [colonne, rangée] d'un bloc en serpentin depuis un coin : vertical (colonne après colonne)
// ou horizontal (rangée après rangée), en changeant de sens à chaque colonne ou rangée.
export function serpentin(colonnes, rangees, sens, coin) {
  const cols = coin.endsWith('gauche') ? colonnes : [...colonnes].reverse();
  const rows = coin.startsWith('haut') ? rangees : [...rangees].reverse();
  const ordre = [];
  if (sens === 'vertical') {
    cols.forEach((c, i) => (i % 2 === 0 ? rows : [...rows].reverse()).forEach((r) => ordre.push([c, r])));
  } else {
    rows.forEach((r, i) => (i % 2 === 0 ? cols : [...cols].reverse()).forEach((c) => ordre.push([c, r])));
  }
  return ordre;
}

// Découpe une suite de positions en groupes consécutifs : chaque groupe prend le plus de dalles possible
// sans dépasser la capacité ni le plafond en nombre de dalles.
export function remplirGlouton(ordre, poids, capacite, plafond, penalite = null) {
  const groupes = [];
  let courant = [];
  let charge = 0;
  for (const x of ordre) {
    const w = poids(x);
    const reduction = courant.length > 0 && penalite ? penalite([...courant, x]) : 0;
    if (courant.length > 0 && (charge + w + reduction > capacite + EPS || courant.length + 1 > plafond)) {
      groupes.push(courant);
      courant = [];
      charge = 0;
    }
    courant.push(x);
    charge += w;
  }
  if (courant.length > 0) groupes.push(courant);
  return groupes;
}
