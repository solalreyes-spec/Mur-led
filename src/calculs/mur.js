// Calculs du mur LED, module 1, dimensionnement : mur rectangulaire, pitch réel, taille ou résolution cible,
// variantes ; pitch le plus fin d'un mur mixte et pixels interpolés.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie } from './commun.js';

// ---------------------------------------------------------------------------
// Module 1 : dimensionnement
// ---------------------------------------------------------------------------

// Pitch réel : largeur / pixels de la fiche (le pitch écrit sur la fiche est arrondi).
export function pitchCalculeMm(dalle) {
  return dalle.largeurMm / dalle.pxH;
}

// Densité sur les vrais pixels de la fiche. LED/m² seulement si la fiche donne les LED par pixel.
export function densite(dalle) {
  const pxParM2 = (dalle.pxH * dalle.pxV * 1e6) / (dalle.largeurMm * dalle.hauteurMm);
  return {
    pitchMm: pitchCalculeMm(dalle),
    pxParM: (dalle.pxH * 1000) / dalle.largeurMm,
    pxParM2,
    ledsParM2: dalle.ledsParPixel ? pxParM2 * dalle.ledsParPixel : null,
  };
}

function pgcd(a, b) {
  return b === 0 ? a : pgcd(b, a % b);
}

export function ratio(largeur, hauteur) {
  const d = pgcd(largeur, hauteur);
  const [a, b] = [largeur / d, hauteur / d];
  return { valeur: largeur / hauteur, fraction: a <= 64 && b <= 64 ? `${a}:${b}` : null };
}

export function verifierDemi(dalle, demi) {
  if (!demi) throw new ErreurSaisie('Aucune fiche de demi-dalle pour cette dalle dans la base.');
  if (demi.largeurMm !== dalle.largeurMm || demi.pxH !== dalle.pxH) {
    throw new ErreurSaisie(
      `La demi-dalle (${nombreCourt(demi.largeurMm)} mm, ${demi.pxH} px de large) n'a pas la même largeur que la dalle `
      + `(${nombreCourt(dalle.largeurMm)} mm, ${dalle.pxH} px) : elle ne peut pas former une rangée.`,
    );
  }
}

// Mur de `colonnes` × `lignes` dalles entières, plus une rangée de demi-dalles en haut ou en bas.
// La demi-dalle garde sa propre fiche : jamais la moitié de la dalle entière.
export function mur(dalle, colonnes, lignes, { demi = null, rangeeDemi = false, positionDemi = 'bas' } = {}) {
  if (!Number.isInteger(colonnes) || colonnes < 1) {
    throw new ErreurSaisie('Le nombre de colonnes doit être un entier d\'au moins 1.');
  }
  if (!Number.isInteger(lignes) || lignes < 0 || (lignes === 0 && !rangeeDemi)) {
    throw new ErreurSaisie('Le nombre de lignes doit être un entier d\'au moins 1.');
  }
  if (positionDemi !== 'haut' && positionDemi !== 'bas') {
    throw new ErreurSaisie('La rangée de demi-dalles va en haut ou en bas.');
  }
  if (rangeeDemi) verifierDemi(dalle, demi);

  const largeurMm = colonnes * dalle.largeurMm;
  const hauteurMm = lignes * dalle.hauteurMm + (rangeeDemi ? demi.hauteurMm : 0);
  const pxLargeur = colonnes * dalle.pxH;
  const pxHauteur = lignes * dalle.pxV + (rangeeDemi ? demi.pxV : 0);
  const entieres = colonnes * lignes;
  const nbDemi = rangeeDemi ? colonnes : 0;
  const rangees = Array(lignes).fill('entiere');
  if (rangeeDemi) {
    if (positionDemi === 'haut') rangees.unshift('demi');
    else rangees.push('demi');
  }

  return {
    colonnes,
    lignes,
    rangeeDemi,
    positionDemi: rangeeDemi ? positionDemi : null,
    demi: rangeeDemi ? demi : null,
    rangees,
    dalles: { entieres, demi: nbDemi, total: entieres + nbDemi },
    largeurMm,
    hauteurMm,
    pxLargeur,
    pxHauteur,
    pxTotal: pxLargeur * pxHauteur,
    surfaceM2: (largeurMm * hauteurMm) / 1e6,
    diagonaleM: Math.hypot(largeurMm, hauteurMm) / 1000,
    ratio: ratio(pxLargeur, pxHauteur),
  };
}

// Nombre de dalles le plus proche de la cible dans une dimension ; à égalité, la plus petite taille,
// puis sans demi-dalles. Avec `neDepassePas`, seulement les tailles inférieures ou égales à la cible.
function choisirNombre(cible, pas, { demiPas = null, neDepassePas = false } = {}) {
  const candidats = [];
  const nMax = Math.ceil(cible / pas) + 1;
  for (let n = 0; n <= nMax; n += 1) {
    for (const avecDemi of demiPas ? [false, true] : [false]) {
      const total = n * pas + (avecDemi ? demiPas : 0);
      if (total <= 0) continue;
      if (neDepassePas && total > cible + EPS) continue;
      candidats.push({ n, avecDemi, total, ecart: total - cible });
    }
  }
  candidats.sort((a, b) => {
    const d = Math.abs(a.ecart) - Math.abs(b.ecart);
    if (Math.abs(d) > EPS) return d;
    return a.total - b.total || Number(a.avecDemi) - Number(b.avecDemi);
  });
  return candidats[0] ?? null;
}

function ecartA(m, cible) {
  if (!cible) return null;
  return cible.unite === 'px'
    ? { largeur: m.pxLargeur - cible.largeur, hauteur: m.pxHauteur - cible.hauteur }
    : { largeur: m.largeurMm - cible.largeur, hauteur: m.hauteurMm - cible.hauteur };
}

function horsContrainte(ecart, { neDepassePasLargeur, neDepassePasHauteur }) {
  if (!ecart) return false;
  return Boolean((neDepassePasLargeur && ecart.largeur > EPS) || (neDepassePasHauteur && ecart.hauteur > EPS));
}

function texteDimension(valeur, unite) {
  return unite === 'px' ? `${nombreCourt(valeur)} px` : `${nombreCourt(valeur / 1000, 3)} m`;
}

const VARIANTES = [
  { libelle: '−1 colonne', dc: -1, dl: 0 },
  { libelle: '+1 colonne', dc: 1, dl: 0 },
  { libelle: '−1 ligne', dc: 0, dl: -1 },
  { libelle: '+1 ligne', dc: 0, dl: 1 },
];

// Demande :
//   { mode: 'dalles', colonnes, lignes, rangeeDemi }
//   { mode: 'taille', largeurMm, hauteurMm }
//   { mode: 'resolution', largeurPx, hauteurPx }
// Options : neDepassePasLargeur, neDepassePasHauteur, demi (fiche de la demi-dalle, seulement si
// « demi-dalles disponibles » est coché), positionDemi ('haut' ou 'bas').
// Résultat : { mur, cible, ecart, variantes, erreurs } ; `mur` vaut null si la demande est impossible.
export function dimensionner(dalle, demande, options = {}) {
  const { neDepassePasLargeur = false, neDepassePasHauteur = false, demi = null, positionDemi = 'bas' } = options;
  try {
    let colonnes;
    let lignes;
    let rangeeDemi = false;
    let cible = null;

    if (demande.mode === 'dalles') {
      ({ colonnes, lignes } = demande);
      rangeeDemi = demande.rangeeDemi === true;
    } else if (demande.mode === 'taille' || demande.mode === 'resolution') {
      const enPx = demande.mode === 'resolution';
      cible = enPx
        ? { largeur: demande.largeurPx, hauteur: demande.hauteurPx, unite: 'px' }
        : { largeur: demande.largeurMm, hauteur: demande.hauteurMm, unite: 'mm' };
      if (![cible.largeur, cible.hauteur].every((x) => Number.isFinite(x) && x > 0)) {
        throw new ErreurSaisie('Indique une largeur et une hauteur cibles supérieures à zéro.');
      }
      if (demi) verifierDemi(dalle, demi);
      const pasLargeur = enPx ? dalle.pxH : dalle.largeurMm;
      const pasHauteur = enPx ? dalle.pxV : dalle.hauteurMm;
      const pasDemi = demi ? (enPx ? demi.pxV : demi.hauteurMm) : null;

      const choixL = choisirNombre(cible.largeur, pasLargeur, { neDepassePas: neDepassePasLargeur });
      if (!choixL) {
        throw new ErreurSaisie(`Aucune colonne ne tient dans ${texteDimension(cible.largeur, cible.unite)} sans dépasser : `
          + `une dalle fait ${texteDimension(pasLargeur, cible.unite)} de large.`);
      }
      const choixH = choisirNombre(cible.hauteur, pasHauteur, { demiPas: pasDemi, neDepassePas: neDepassePasHauteur });
      if (!choixH) {
        throw new ErreurSaisie(`Aucune rangée ne tient dans ${texteDimension(cible.hauteur, cible.unite)} sans dépasser : `
          + `une dalle fait ${texteDimension(pasDemi ? Math.min(pasHauteur, pasDemi) : pasHauteur, cible.unite)} de haut.`);
      }
      colonnes = choixL.n;
      lignes = choixH.n;
      rangeeDemi = choixH.avecDemi;
    } else {
      throw new ErreurSaisie('Mode de calcul inconnu.');
    }

    const optionsMur = { demi, rangeeDemi, positionDemi };
    const base = mur(dalle, colonnes, lignes, optionsMur);
    const variantes = VARIANTES
      .filter(({ dc, dl }) => colonnes + dc >= 1 && (lignes + dl >= 1 || (lignes + dl === 0 && rangeeDemi)))
      .map(({ libelle, dc, dl }) => {
        const m = mur(dalle, colonnes + dc, lignes + dl, optionsMur);
        const ecart = ecartA(m, cible);
        return { libelle, mur: m, ecart, horsContrainte: horsContrainte(ecart, options) };
      });

    return { mur: base, cible, ecart: ecartA(base, cible), variantes, erreurs: [] };
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    return { mur: null, cible: null, ecart: null, variantes: [], erreurs: [erreur.message] };
  }
}

// Mapping interpolé (Tessera M2 et T1, manuel §6.5.1) : chaque dalle compte sa taille physique divisée
// par le pitch le plus fin du mur, dans le canvas comme dans la charge du port.
export function pitchLePlusFin(dalles) {
  return Math.min(...dalles.map((d) => pitchCalculeMm(d)));
}

export function pixelsInterpoles(dalle, pitchReferenceMm) {
  const pxH = Math.round(dalle.largeurMm / pitchReferenceMm);
  const pxV = Math.round(dalle.hauteurMm / pitchReferenceMm);
  return { pxH, pxV, total: pxH * pxV };
}
