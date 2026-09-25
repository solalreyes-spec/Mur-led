// Logique de calcul du mur LED : fonctions pures, sans accès à l'interface.
// Règles et données : cahier des charges du projet.
// Les calculs se font en valeurs exactes ; l'arrondi n'intervient qu'à l'affichage.
// Unités internes : millimètres et pixels.

import { nombreCourt } from './format.js';

const EPS = 1e-9;

// Erreur due à la saisie (valeur impossible, cible trop petite…) : affichée telle quelle à l'utilisateur.
export class ErreurSaisie extends Error {}

// ---------------------------------------------------------------------------
// Fiches et valeurs sourcées
// ---------------------------------------------------------------------------

// Sens de la valeur la plus défavorable, pour les champs qui peuvent avoir des valeurs contradictoires.
// Un conflit sur un autre champ est signalé (conflitSansRegle) au lieu d'être tranché en silence.
export const PLUS_DEFAVORABLE = {
  // Dalles
  poidsKg: 'max', // accroche : la plus lourde
  pMaxW: 'max', // électricité : la plus gourmande
  pMoyW: 'max',
  rafraichissementHz: 'min', // caméra : le plus bas
  profondeurMm: 'max', // logistique : la plus encombrante
  luminositeNits: 'min',
  bitsParCouleur: 'min',
  maxAccroche: 'min', // accroche : le moins de dalles
  maxStack: 'min',
  chainagePowerMax: 'min', // électricité : le moins de dalles par ligne
  courantAppelA: 'max',
  courantAppelMs: 'max',
  // Processeurs : la plus petite capacité
  debitUtileBps: 'min',
  pixelsMax: 'min',
  ports: 'min',
  largeurMaxPx: 'min',
  hauteurMaxPx: 'min',
  dallesMax: 'min',
  maxDallesParBoucleRedondance: 'min',
  portsRedondance: 'min',
  portsOptionOptique: 'min',
  pxMinParDimension: 'max',
  sortiesParDistributeur: 'min',
  capacitePort60Hz8bits: 'min',
  capacitePort60Hz10bits: 'min',
  capacitePort60Hz12bits: 'min',
  entreeMaxLargeurPx: 'min',
  entreeMaxHauteurPx: 'min',
  // Liaisons vidéo : le format maxi le plus petit
  formatMaxLargeurPx: 'min',
  formatMaxHauteurPx: 'min',
  formatMaxFrequenceHz: 'min',
  debitGbps: 'min',
  horlogeMHz: 'min',
};

function decrireSource(id, sources) {
  const s = sources[id];
  return s ? { id, ...s } : { id, titre: id, court: id, date: null, confiance: 'source inconnue' };
}

function estSourcee(champ) {
  return champ !== null && typeof champ === 'object' && !Array.isArray(champ) && ('valeur' in champ || 'valeurs' in champ);
}

// Champ { valeur, source } ou { valeurs: [{ valeur, source }, …] } → valeur retenue et autres valeurs.
// Les entrées de même valeur sont regroupées : une valeur, toutes les fiches qui la donnent (`sources`).
export function valeurRetenue(champ, sens, sources = {}) {
  const groupes = [];
  for (const x of champ.valeurs ?? [champ]) {
    const source = decrireSource(x.source, sources);
    const groupe = groupes.find((g) => g.valeur === x.valeur);
    if (groupe) groupe.sources.push(source);
    else groupes.push({ valeur: x.valeur, type: x.type ?? null, sources: [source] });
  }
  for (const g of groupes) g.source = g.sources[0];

  let retenue = groupes[0];
  if (sens === 'max') retenue = groupes.reduce((a, b) => (b.valeur > a.valeur ? b : a));
  if (sens === 'min') retenue = groupes.reduce((a, b) => (b.valeur < a.valeur ? b : a));
  const conflit = groupes.length > 1;
  return {
    valeur: retenue.valeur,
    source: retenue.source,
    sources: retenue.sources,
    type: retenue.type,
    autres: groupes.filter((g) => g !== retenue),
    conflit,
    conflitSansRegle: conflit && !sens,
    note: champ.note ?? null,
  };
}

// Fiche de la base (dalle ou processeur, valeurs sourcées) → valeurs simples,
// avec le détail des sources dans `sources`. Les champs non sourcés sont recopiés tels quels.
export function resoudreFiche(fiche, sources = {}) {
  const resolue = { sources: {} };
  for (const [nom, champ] of Object.entries(fiche)) {
    if (estSourcee(champ)) {
      const retenue = valeurRetenue(champ, PLUS_DEFAVORABLE[nom], sources);
      resolue[nom] = retenue.valeur;
      resolue.sources[nom] = retenue;
    } else {
      resolue[nom] = champ;
    }
  }
  resolue.nom = fiche.nom ?? [fiche.marque, fiche.modele, fiche.version, fiche.variante].filter(Boolean).join(' ');
  resolue.gabarit = fiche.gabarit === true;
  resolue.demiDalle = fiche.demiDalle ?? null;
  resolue.demiDe = fiche.demiDe ?? null;
  resolue.note = fiche.note ?? null;
  return resolue;
}

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

function ratio(largeur, hauteur) {
  const d = pgcd(largeur, hauteur);
  const [a, b] = [largeur / d, hauteur / d];
  return { valeur: largeur / hauteur, fraction: a <= 64 && b <= 64 ? `${a}:${b}` : null };
}

function verifierDemi(dalle, demi) {
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

// ---------------------------------------------------------------------------
// Module 4 : data et processeur
// ---------------------------------------------------------------------------

// Débit utile d'un port 1G (bit/s). Le MX40 Pro porte le sien dans sa fiche (950 000 000).
export const DEBIT_UTILE_BPS = { brompton: 756e6, novastar: 936e6 };
// Brompton : 12 bits, le réglage de livraison de Tessera, le plus défavorable ; un parc peut préciser le sien.
export const BIT_DEPTH_PAR_DEFAUT = { brompton: 12, novastar: 8, colorlight: 8 };
export const SEUIL_CHARGE_PORT = 0.95;

// Rappel Tessera, avec la capacité d'un port 1G en 10 bits à la fréquence et en ULL comme réglés.
export function rappelTessera({ frequenceHz = 60, ull = false } = {}) {
  const debut = 'Défaut 12 bits (livraison Tessera)';
  if (!(Number.isFinite(frequenceHz) && frequenceHz > 0)) return debut;
  return `${debut} ; en 10 bits, capacité par port de ${nombreCourt(entierInferieur(capacitePort('brompton', { frequenceHz, bits: 10, ull })))} px`;
}

// Capacité affichée : un port ne transporte pas de fraction de pixel.
export function entierInferieur(x) {
  return Math.floor(x + 1e-6);
}

// Bits transportés par pixel, diviseur de la formule de capacité.
function bitsParPixel(famille, bits, cartesPro) {
  if (famille === 'brompton') return 3 * bits;
  if (bits === 8) return 24;
  return bits === 10 && cartesPro ? 32 : 48;
}

// Capacité exacte d'un port 1G, en pixels.
//   Brompton : 756 000 000 / (f × 3 × bits), divisée par 2 en ULL.
//   Novastar : 936 000 000 / (f × 24) en 8 bits, / (f × 48) en 10 ou 12 bits.
//   MX40 Pro : son débit (950 000 000), / (f × 32) en 10 bits avec cartes A8s Pro ou A10s Pro.
export function capacitePort(famille, { frequenceHz = 60, bits, ull = false, cartesPro = false, debitBps } = {}) {
  if (!(famille in DEBIT_UTILE_BPS)) throw new ErreurSaisie(`Marque de processeur inconnue : ${famille}.`);
  if (![8, 10, 12].includes(bits)) throw new ErreurSaisie('Le bit depth réseau vaut 8, 10 ou 12 bits.');
  if (!(Number.isFinite(frequenceHz) && frequenceHz > 0)) throw new ErreurSaisie('Indique une fréquence supérieure à zéro.');
  const capacite = (debitBps ?? DEBIT_UTILE_BPS[famille]) / (frequenceHz * bitsParPixel(famille, bits, cartesPro));
  return famille === 'brompton' && ull ? capacite / 2 : capacite;
}

// Formule appliquée, pour l'affichage à côté du résultat.
export function formuleCapacite(famille, { frequenceHz = 60, bits, ull = false, cartesPro = false, debitBps } = {}) {
  const debit = nombreCourt(debitBps ?? DEBIT_UTILE_BPS[famille]);
  const facteurs = famille === 'brompton' ? `${nombreCourt(frequenceHz)} × 3 × ${bits}` : `${nombreCourt(frequenceHz)} × ${bitsParPixel(famille, bits, cartesPro)}`;
  return `${debit} / (${facteurs})${famille === 'brompton' && ull ? ' / 2 (ULL)' : ''}`;
}

// Capacité d'un port pour un processeur donné :
//   - valeur de sa fiche à 60 Hz (CX40 Pro, Colorlight), proportionnelle à la fréquence, marquée « déduit » hors 60 Hz ;
//   - sinon formule de sa marque avec son débit utile (Brompton, Novastar, MX40 Pro, MX20).
// Les valeurs dont la source est « déduit » ou « à confirmer » le restent dans le résultat.
export function capacitePortProcesseur(proc, reglages = {}) {
  const { frequenceHz = 60, bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], ull = false, cartesPro = false } = reglages;
  if (![8, 10, 12].includes(bits)) throw new ErreurSaisie('Le bit depth réseau vaut 8, 10 ou 12 bits.');
  if (!(Number.isFinite(frequenceHz) && frequenceHz > 0)) throw new ErreurSaisie('Indique une fréquence supérieure à zéro.');
  const champ = `capacitePort60Hz${bits}bits`;
  const notes = [];
  if (proc[champ] !== undefined) {
    const reference = proc[champ];
    const confiance = proc.sources?.[champ]?.source.confiance ?? '';
    if (frequenceHz !== 60) {
      notes.push(`déduit : ${nombreCourt(reference)} px à 60 Hz sur la fiche, proportionnel à la fréquence`);
    }
    if (/déduit|à confirmer/.test(confiance)) notes.push(`${bits} bits : ${confiance}`);
    return {
      capacite: (reference * 60) / frequenceHz,
      formule: frequenceHz === 60
        ? `${nombreCourt(reference)} px (fiche, 60 Hz, ${bits} bits)`
        : `${nombreCourt(reference)} × 60 / ${nombreCourt(frequenceHz)}`,
      deduit: frequenceHz !== 60 || /déduit/.test(confiance),
      aConfirmer: /à confirmer/.test(confiance),
      notes,
    };
  }
  const reglagesFormule = {
    frequenceHz, bits, ull: ull && proc.famille === 'brompton', cartesPro: cartesPro && proc.cartesPro === true, debitBps: proc.debitUtileBps,
  };
  const confiance = proc.sources?.debitUtileBps?.source.confiance ?? '';
  if (/déduit|à confirmer/.test(confiance)) notes.push(`débit utile : ${confiance}`);
  return {
    capacite: capacitePort(proc.famille, reglagesFormule),
    formule: formuleCapacite(proc.famille, reglagesFormule),
    deduit: /déduit/.test(confiance),
    aConfirmer: /à confirmer/.test(confiance),
    notes,
  };
}

// Champs obligatoires qui manquent à une fiche processeur. Un modèle incomplet apparaît dans la liste
// mais ne sert à aucun calcul.
export function champsManquants(proc) {
  const manquants = [];
  const parFiche = [8, 10, 12].every((b) => proc[`capacitePort60Hz${b}bits`] !== undefined);
  const parFormule = proc.famille in DEBIT_UTILE_BPS && proc.debitUtileBps > 0;
  if (!parFiche && !parFormule) manquants.push('capacite');
  for (const champ of ['pixelsMax', 'ports', 'largeurMaxPx', 'hauteurMaxPx']) {
    if (!(proc[champ] > 0)) manquants.push(champ);
  }
  return manquants;
}

// Marque de carte de réception → famille de processeurs qui la pilote (COEX est une gamme Novastar).
// Une autre marque connue (Megapixel, Linsn…) ne correspond à aucune famille de la base.
const NOMS_FAMILLE_CARTE = { brompton: 'Brompton', novastar: 'Novastar', colorlight: 'Colorlight' };
export function familleDeCarte(marque) {
  const m = String(marque ?? '').trim().toLowerCase();
  if (!m) return null;
  if (m.includes('novastar') || m.includes('coex')) return 'novastar';
  if (m.includes('brompton') || m.includes('tessera')) return 'brompton';
  if (m.includes('colorlight')) return 'colorlight';
  return m;
}

// Carte de réception de la dalle face au processeur. Un processeur ne pilote que les cartes de sa marque :
// marque de carte connue et différente, refus. Puis les cartes acceptées (CX40 Pro : cartes 5G) :
// carte connue et non compatible, refus ; carte inconnue, alerte.
export function verifierCarte(dalle, proc) {
  const familleCarte = familleDeCarte(dalle.carteReceptionMarque);
  if (familleCarte && familleCarte !== proc.famille) {
    const carteNommee = [dalle.carteReceptionMarque, dalle.carteReceptionModele].filter(Boolean).join(' ');
    return {
      refus: `Le ${proc.nom} ne pilote que des cartes de réception ${NOMS_FAMILLE_CARTE[proc.famille]} ; la dalle ${dalle.nom} `
        + `utilise une carte ${carteNommee}. Jamais de processeur d'une marque avec des cartes d'une autre marque.`,
      alerte: null,
    };
  }
  const compatibles = proc.cartesCompatibles;
  if (!compatibles) return { refus: null, alerte: null };
  const liste = compatibles.join(', ');
  const modele = dalle.carteReceptionModele;
  if (!modele) {
    return {
      refus: null,
      alerte: `Carte de réception inconnue pour la dalle ${dalle.nom} : vérifie qu'elle fait partie des cartes 5G `
        + `acceptées par le ${proc.nom} (${liste}).`,
    };
  }
  const normaliser = (x) => String(x).replace(/\s/g, '').toUpperCase();
  if (compatibles.some((c) => normaliser(c) === normaliser(modele))) return { refus: null, alerte: null };
  const carte = [dalle.carteReceptionMarque, modele].filter(Boolean).join(' ');
  return {
    refus: `Le ${proc.nom} n'accepte que des cartes de réception 5G (${liste}) ; la dalle ${dalle.nom} utilise une carte ${carte}.`,
    alerte: null,
  };
}

// Pixels comptés pour une dalle : le SX40 compte au moins 64 px par dimension.
export function pixelsComptes(dalle, processeur = null) {
  const minimum = processeur?.pxMinParDimension ?? 0;
  return Math.max(dalle.pxH, minimum) * Math.max(dalle.pxV, minimum);
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

// Pixels qu'une dalle coûte au processeur : interpolés sur M2 et T1, en 1:1 ailleurs (avec le minimum du SX40).
export function pixelsComptesMapping(dalle, proc, pitchReferenceMm) {
  return proc.mappingInterpole ? pixelsInterpoles(dalle, pitchReferenceMm).total : pixelsComptes(dalle, proc);
}

// Dalles par port = partie entière de (capacité / pixels d'une dalle), éventuellement plafonnée
// (Brompton en redondance : 50 dalles par boucle).
export function dallesParPort(capacite, pxParDalle, { plafond = Infinity } = {}) {
  return Math.min(Math.floor(capacite / pxParDalle + EPS), plafond);
}

export function alerteBitDepthSource(famille, bitsReseau, bitsSource) {
  if (famille !== 'brompton' || !bitsSource || bitsReseau >= bitsSource) return null;
  return `Tessera : le bit depth réseau (${bitsReseau} bits) ne doit jamais être inférieur à celui de la source `
    + `(${bitsSource} bits). Passe le réseau en ${bitsSource} bits au moins.`;
}

export function chargePort(nbDalles, pxParDalle, capacite) {
  return { dalles: nbDalles, ...chargePx(nbDalles * pxParDalle, capacite) };
}

function chargePx(px, capacite) {
  const taux = px / capacite;
  return { px, taux, auDela95: taux > SEUIL_CHARGE_PORT + EPS };
}

// `total` réparti en `parts` groupes aussi égaux que possible, les plus grands d'abord : 44 en 3 → 15, 15, 14.
function repartir(total, parts) {
  const base = Math.floor(total / parts);
  const reste = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < reste ? 1 : 0));
}

// Ce qu'un port accepte. Avec `charge` ({ capacite, pxParDalle, pxParDemi, plafond }), les demi-dalles
// comptent leurs vrais pixels ; sans, une demi-dalle compte comme une dalle entière.
function modeleCharge(parPort, charge) {
  if (!charge) return { maxEntieres: parPort, maxDemi: (e) => parPort - e, px: null };
  const { capacite, pxParDalle, pxParDemi = pxParDalle, plafond = Infinity } = charge;
  return {
    maxEntieres: parPort,
    maxDemi: (e) => Math.max(0, Math.min(Math.floor((capacite - e * pxParDalle) / pxParDemi + EPS), plafond - e)),
    px: (e, d) => e * pxParDalle + d * pxParDemi,
  };
}

// Ports nécessaires pour un mur, au plus juste et en colonnes entières.
// Une colonne plus haute qu'un port est répartie en segments égaux ; la demi-dalle reste dans le segment de son bord.
// La limite en nombre de dalles (redondance Brompton : 50 par boucle) compte une demi-dalle pour une dalle.
// `pair` (redondance) : nombre pair de colonnes par port quand il en tient au moins deux, pour que la chaîne revienne
// au bord de départ ; sans redondance, le plus de colonnes entières par port.
export function cablage(m, parPort, charge = null, { pair = false } = {}) {
  if (!(parPort >= 1)) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
  const modele = modeleCharge(parPort, charge);
  const tient = (e, d) => e <= modele.maxEntieres && d <= modele.maxDemi(e);
  const entieresParColonne = m.lignes;
  const demiParColonne = m.rangeeDemi ? 1 : 0;
  const parColonne = entieresParColonne + demiParColonne;
  const total = m.dalles.total;

  // Au plus juste : chaque port prend le plus de dalles entières possible, puis des demi-dalles.
  const remplissage = [];
  let resteE = m.colonnes * entieresParColonne;
  let resteD = m.colonnes * demiParColonne;
  while (resteE + resteD > 0) {
    const e = Math.min(modele.maxEntieres, resteE);
    const d = Math.min(modele.maxDemi(e), resteD);
    if (e + d === 0) throw new ErreurSaisie('Une seule demi-dalle dépasse la capacité d\'un port.');
    remplissage.push({ e, d });
    resteE -= e;
    resteD -= d;
  }
  const auPlusJuste = remplissage.length;
  const pxPort = (e, d) => (modele.px ? modele.px(e, d) : null);

  let colonnes;
  if (tient(entieresParColonne, demiParColonne)) {
    let kmax = 1;
    while (kmax < m.colonnes && tient((kmax + 1) * entieresParColonne, (kmax + 1) * demiParColonne)) kmax += 1;
    const k = pair && kmax >= 2 ? kmax - (kmax % 2) : kmax;
    colonnes = {
      colonnesParPort: k,
      colonnesParPortMax: kmax,
      segments: [parColonne],
      ports: Math.ceil(m.colonnes / k),
      dallesMaxParPort: k * parColonne,
      pxMaxParPort: pxPort(k * entieresParColonne, k * demiParColonne),
    };
  } else {
    const indexDemi = (s) => (demiParColonne ? (m.positionDemi === 'haut' ? 0 : s - 1) : -1);
    let tailles = null;
    let s = 2;
    for (; s <= parColonne; s += 1) {
      const essai = repartir(parColonne, s);
      if (essai.every((n, i) => (i === indexDemi(s) ? tient(n - 1, 1) : tient(n, 0)))) {
        tailles = essai;
        break;
      }
    }
    if (!tailles) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
    const pxSegments = tailles.map((n, i) => (i === indexDemi(s) ? pxPort(n - 1, 1) : pxPort(n, 0)));
    colonnes = {
      colonnesParPort: null,
      segments: tailles,
      ports: m.colonnes * s,
      dallesMaxParPort: tailles[0],
      pxMaxParPort: modele.px ? Math.max(...pxSegments) : null,
    };
  }

  const dernier = remplissage[remplissage.length - 1];
  return {
    dallesParPort: parPort,
    auPlusJuste,
    dallesMaxParPortAuPlusJuste: Math.max(...remplissage.map((p) => p.e + p.d)),
    pxMaxParPortAuPlusJuste: modele.px ? Math.max(...remplissage.map((p) => modele.px(p.e, p.d))) : null,
    colonnes,
    redondance: { auPlusJuste: 2 * auPlusJuste, colonnes: 2 * colonnes.ports },
    // Alerte de seuil : dalles du dernier port, à retirer pour l'économiser (au plus juste).
    seuil: { dallesEnMoins: auPlusJuste > 1 ? dernier.e + dernier.d : null },
    remplissage,
    total,
  };
}

// Minimum théorique (au plus juste) face au décompte retenu en colonnes entières, avec la raison de l'écart.
// `unite` : 'port' ou 'ligne' ; `pair` : nombre pair de colonnes imposé par la redondance.
function minimumTheorique(c, minimum, m, unite, { pair = false } = {}) {
  const retenu = c.colonnes.ports;
  const pl = (n) => `${n} ${unite}${n > 1 ? 's' : ''}`;
  const raisons = [];
  const k = c.colonnes.colonnesParPort;
  if (!k) {
    raisons.push(`chaque colonne dépasse un${unite === 'ligne' ? 'e' : ''} ${unite} : elle est coupée en ${c.colonnes.segments.length} segments égaux`);
  } else {
    const kmax = c.colonnes.colonnesParPortMax;
    const sansPair = Math.ceil(m.colonnes / kmax);
    if (pair && k < kmax && retenu > sansPair) {
      raisons.push(`en redondance, ${k} colonnes par ${unite} au lieu de ${kmax} : un nombre pair ramène chaque chaîne au bord de départ `
        + `(${pl(sansPair)} sans cette règle)`);
    }
    if (sansPair > minimum) raisons.push(`une colonne n'est jamais coupée entre deux ${unite}s`);
  }
  return {
    nombre: minimum,
    raisons,
    texte: retenu === minimum ? null
      : `Minimum théorique : ${pl(minimum)} au plus juste, contre ${retenu} en colonnes entières. Écart : ${raisons.join(' ; ')}.`,
  };
}

// Formats de canvas d'un processeur : le canvas de sa fiche (1920 × 1080 natif sur M2, S4 et T1),
// puis ses préréglages (4K DCI des S8 et SX40) et ses formats Low Latency (M2, S4, T1).
function formatsCanvas(proc) {
  const fiche = { nom: proc.canvasFixe ? proc.nomCanvasNatif ?? null : null, largeurPx: proc.largeurMaxPx, hauteurPx: proc.hauteurMaxPx, fiche: true };
  return [fiche, ...(proc.formatsCanvas ?? [])];
}

// Canvas à régler sur le processeur pour un bloc, ou null si aucun format ne l'accueille.
//   - préréglage ou format fixe (4K DCI, Low Latency, 1920 × 1080 natif) : le canvas est celui du format ;
//   - canvas libre Tessera (S8, SX40) : largeur paire, 720 px au minimum dans chaque dimension ;
//   - sinon (Novastar, COEX, Colorlight) : le canvas prend la taille du bloc.
export function canvasProcesseur(proc, largeurPx, hauteurPx) {
  const format = formatsCanvas(proc).find((f) => largeurPx <= f.largeurPx && hauteurPx <= f.hauteurPx);
  if (!format) return null;
  const resultat = (l, h) => ({ largeurPx: l, hauteurPx: h, format: format.nom, lowLatency: format.lowLatency === true });
  if (!format.fiche || proc.canvasFixe) return resultat(format.largeurPx, format.hauteurPx);
  const libre = proc.canvasLibre;
  if (libre) {
    const largeur = libre.largeurPaire && largeurPx % 2 === 1 ? largeurPx + 1 : largeurPx;
    return resultat(Math.max(largeur, libre.largeurMinPx), Math.max(hauteurPx, libre.hauteurMinPx));
  }
  return resultat(largeurPx, hauteurPx);
}

// Largeur la plus grande qu'accepte le processeur pour une hauteur donnée, et le format correspondant.
function largeurMaxPour(proc, hauteurPx) {
  const possibles = formatsCanvas(proc).filter((f) => f.hauteurPx >= hauteurPx);
  if (possibles.length === 0) return { largeurPx: proc.largeurMaxPx, format: null };
  const meilleur = possibles.reduce((a, b) => (b.largeurPx > a.largeurPx ? b : a));
  return { largeurPx: meilleur.largeurPx, format: meilleur.nom };
}

// Ports à comparer à la limite du processeur, pour un câblage donné.
//   - Redondance sur SX40 : ports principaux (trunks A et C, 20 au plus), secourus par des XD miroirs (B et D).
//   - Redondance ailleurs : ports doublés, qui occupent les sorties du processeur.
//   - Sans redondance : ports en colonnes entières ; 40 en mode optique sur le MX40 Pro.
function portsFaceALimite(c, proc, { redondance, modeOptique }) {
  if (redondance && proc.portsRedondance) return { valeur: c.colonnes.ports, limite: proc.portsRedondance, principaux: true };
  const limite = modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports;
  return { valeur: redondance ? c.redondance.colonnes : c.colonnes.ports, limite, principaux: false };
}

// Bloc du mur confié à un processeur : quelques colonnes et quelques rangées, avec la rangée
// de demi-dalles si elle y tombe.
function sousMur(m, dalle, colonnes, premiereRangee, nbRangees) {
  const rangees = m.rangees.slice(premiereRangee - 1, premiereRangee - 1 + nbRangees);
  const avecDemi = rangees.includes('demi');
  return mur(dalle, colonnes, rangees.length - (avecDemi ? 1 : 0), {
    demi: m.demi,
    rangeeDemi: avecDemi,
    positionDemi: rangees[0] === 'demi' ? 'haut' : 'bas',
  });
}

function blocProcesseur(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }) {
  const sous = sousMur(m, dalle, colonnes, premiereRangee, rangees);
  const c = cablage(sous, contexte.parPort, contexte.charge, { pair: contexte.pair });
  const ports = portsFaceALimite(c, proc, contexte);
  const canvas = canvasProcesseur(proc, sous.pxLargeur, sous.pxHauteur);
  const sorties = proc.sortiesParDistributeur;
  // Position du bloc dans le mur, en pixels, de 0 à largeur − 1.
  const xPx = (premiereColonne - 1) * dalle.pxH;
  const yPx = premiereRangee > 1 ? sousMur(m, dalle, 1, 1, premiereRangee - 1).pxHauteur : 0;
  const ok = sous.pxTotal <= proc.pixelsMax
    && canvas !== null
    && ports.valeur <= ports.limite
    && (!proc.dallesMax || sous.dalles.total <= proc.dallesMax);
  return {
    colonnes,
    premiereColonne,
    derniereColonne: premiereColonne + colonnes - 1,
    rangees,
    premiereRangee,
    derniereRangee: premiereRangee + rangees - 1,
    format: canvas?.format ?? null,
    canvas,
    x: [xPx, xPx + sous.pxLargeur - 1],
    y: [yPx, yPx + sous.pxHauteur - 1],
    dalles: sous.dalles.total,
    px: sous.pxTotal,
    largeurPx: sous.pxLargeur,
    hauteurPx: sous.pxHauteur,
    ports: { auPlusJuste: c.auPlusJuste, colonnes: c.colonnes.ports, redondance: c.redondance },
    distributeurs: sorties ? {
      colonnes: Math.ceil(c.colonnes.ports / sorties),
      auPlusJuste: Math.ceil(c.auPlusJuste / sorties),
      redondance: 2 * Math.ceil(c.colonnes.ports / sorties),
    } : null,
    chargeMax: chargePx(c.colonnes.pxMaxParPort, contexte.capacite),
    ok,
  };
}

// Contrôles d'un processeur pour tout le mur, puis découpage : en colonnes entières d'abord,
// en rangées si le mur est trop haut, en grille s'il est à la fois trop large et trop haut.
function decouper(m, dalle, proc, contexte) {
  const global = cablage(m, contexte.parPort, contexte.charge, { pair: contexte.pair });
  const ports = portsFaceALimite(global, proc, contexte);
  const hauteurMax = Math.max(...formatsCanvas(proc).map((f) => f.hauteurPx));
  const largeurMax = largeurMaxPour(proc, Math.min(m.pxHauteur, hauteurMax));
  const colonnesMax = Math.floor(largeurMax.largeurPx / dalle.pxH);
  const controle = (valeur, limiteValeur, nombre) => ({ valeur, limite: limiteValeur, nombre, depasse: valeur > limiteValeur });
  const controles = {
    pixels: controle(m.pxTotal, proc.pixelsMax, Math.ceil(m.pxTotal / proc.pixelsMax)),
    largeur: {
      ...controle(m.pxLargeur, largeurMax.largeurPx, colonnesMax >= 1 ? Math.ceil(m.colonnes / colonnesMax) : Infinity),
      colonnesMax,
      format: largeurMax.format,
    },
    hauteur: controle(m.pxHauteur, hauteurMax, Math.ceil(m.pxHauteur / hauteurMax)),
    ports: { ...controle(ports.valeur, ports.limite, Math.ceil(ports.valeur / ports.limite)), principaux: ports.principaux },
  };
  if (proc.dallesMax) {
    controles.dalles = controle(m.dalles.total, proc.dallesMax, Math.ceil(m.dalles.total / proc.dallesMax));
  }
  const limites = Object.entries(controles).filter(([, c]) => c.nombre > 1).map(([nom]) => nom);
  const resultat = { global, controles, limites, nombre: null, grille: null, groupes: [], impossible: null };

  // Une seule dalle doit tenir dans un processeur, sinon aucun découpage ne suffit.
  const unite = blocProcesseur(m, dalle, proc, contexte, { colonnes: 1, premiereColonne: 1, rangees: 1, premiereRangee: 1 });
  if (!unite.ok) {
    resultat.impossible = `Une seule dalle (${dalle.pxH} × ${dalle.pxV} px) dépasse les limites d'un ${proc.nom}.`;
    return resultat;
  }

  const nbRangees = m.rangees.length;
  for (let n = Math.max(1, ...Object.values(controles).map((c) => c.nombre)); n <= m.colonnes * nbRangees; n += 1) {
    for (let nr = 1; nr <= Math.min(n, nbRangees); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > m.colonnes) continue;
      const blocs = [];
      let premiereRangee = 1;
      for (const rangees of repartir(nbRangees, nr)) {
        let premiereColonne = 1;
        for (const colonnes of repartir(m.colonnes, nc)) {
          blocs.push(blocProcesseur(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }));
          premiereColonne += colonnes;
        }
        premiereRangee += rangees;
      }
      if (blocs.every((b) => b.ok)) {
        return { ...resultat, nombre: n, grille: { colonnes: nc, rangees: nr }, groupes: blocs };
      }
    }
  }
  resultat.impossible = `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.`;
  return resultat;
}

// NovaLCT (MCTRL, VX, NovaPro) compte pour chaque port tout le rectangle qui englobe ses dalles, vides compris.
// Décompte en rectangles : pavage du mur en rectangles de a colonnes × b rangées (rangées regroupées de haut
// en bas), chaque rectangle tenant dans un port ; on garde le moins de ports, puis les rectangles les plus hauts.
function rectanglesNovaLCT(m, dalle, capacite) {
  const hauteurs = m.rangees.map((type) => (type === 'demi' ? m.demi.pxV : dalle.pxV));
  let meilleur = null;
  for (let b = 1; b <= hauteurs.length; b += 1) {
    const tranches = [];
    for (let i = 0; i < hauteurs.length; i += b) tranches.push(hauteurs.slice(i, i + b).reduce((s, h) => s + h, 0));
    const colonnesMax = Math.floor(capacite / (dalle.pxH * Math.max(...tranches)) + EPS);
    if (colonnesMax < 1) continue;
    const a = Math.min(colonnesMax, m.colonnes);
    const ports = Math.ceil(m.colonnes / a) * tranches.length;
    if (!meilleur || ports < meilleur.ports || (ports === meilleur.ports && b >= meilleur.rangees)) {
      meilleur = { ports, colonnes: a, rangees: b };
    }
  }
  return meilleur && { ...meilleur, redondance: 2 * meilleur.ports };
}

// Évalue un processeur pour un mur : capacité, dalles par port, ports, contrôles, nombre de processeurs,
// découpage, ports et distributeurs par processeur.
// Réglages : frequenceHz, bits, ull (Brompton), cartesPro et modeOptique (MX40 Pro), redondance.
export function evaluerProcesseur(m, dalle, proc, reglages = {}) {
  const {
    frequenceHz = 60, bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], ull = false, cartesPro = false,
    redondance = false, modeOptique = false,
  } = reglages;
  const reglagesCapacite = {
    frequenceHz,
    bits,
    ull: ull && proc.famille === 'brompton',
    cartesPro: cartesPro && proc.cartesPro === true,
  };
  const vide = {
    processeur: proc, reglages: { ...reglagesCapacite, redondance, modeOptique }, global: null, controles: {}, limites: [],
    nombre: null, grille: null, unSeulSuffit: false, groupes: [], totaux: null, seuil: null, alertes: [], aCompleter: [], manques: [],
  };
  const manquants = champsManquants(proc);
  if (manquants.length > 0) {
    return { ...vide, aCompleter: manquants, impossible: `Fiche du ${proc.nom} à compléter : aucun calcul avec ce modèle.` };
  }
  const carte = verifierCarte(dalle, proc);
  if (carte.refus) return { ...vide, impossible: carte.refus };

  const qualite = capacitePortProcesseur(proc, reglagesCapacite);
  const capacite = qualite.capacite;
  const alertes = qualite.notes.map((note) => `Capacité par port du ${proc.nom} : ${note}.`);
  // Manques de la fiche qui touchent ce calcul : leur texte est aussi une alerte.
  const manques = [];
  if (carte.alerte) manques.push({ champ: 'carteReceptionModele', texte: carte.alerte });
  // Fiche incomplète : sans modèle de carte de réception, la compatibilité n'est pas vérifiée (le CX40 Pro a déjà son alerte).
  if (!proc.cartesCompatibles && !dalle.carteReceptionModele) {
    manques.push({
      champ: 'carteReceptionModele',
      texte: `Carte de réception ${dalle.carteReceptionMarque ? `${dalle.carteReceptionMarque} sans modèle précisé` : 'absente de la fiche'} `
        + `pour la dalle ${dalle.nom} : compatibilité avec le ${proc.nom} non vérifiée.`,
    });
  }
  alertes.push(...manques.map((x) => x.texte));
  const petites = [dalle, m.demi].filter(Boolean).some((d) => d.pxH < 16 || d.pxV < 16);
  if (proc.famille === 'brompton' && petites) {
    alertes.push('Dalles de moins de 16 px dans une dimension : elles coûtent cher en traitement et on peut en brancher '
      + 'moins que la capacité nominale (manuel Tessera §13.1.4). Vérifie les barres de charge dans Tessera.');
  }
  const pxParDalle = pixelsComptes(dalle, proc);
  const pxParDemi = m.demi ? pixelsComptes(m.demi, proc) : pxParDalle;
  const plafond = redondance && proc.maxDallesParBoucleRedondance ? proc.maxDallesParBoucleRedondance : Infinity;
  const parPort = dallesParPort(capacite, pxParDalle, { plafond });
  const optique = modeOptique && Boolean(proc.portsOptionOptique);
  const base = {
    ...vide,
    reglages: { ...reglagesCapacite, redondance, modeOptique: optique },
    capacite,
    formule: qualite.formule,
    capaciteDeduite: qualite.deduit,
    capaciteAConfirmer: qualite.aConfirmer,
    alertes,
    manques,
    pxParDalle,
    pxParDemi: m.demi ? pxParDemi : null,
    dallesParPort: parPort,
    plafondBoucle: Number.isFinite(plafond) && parPort === plafond,
  };
  if (parPort < 1) {
    return {
      ...base,
      impossible: `Une dalle de ${nombreCourt(pxParDalle)} px dépasse la capacité d'un port (${nombreCourt(entierInferieur(capacite))} px).`,
    };
  }
  if (redondance && !proc.portsRedondance && proc.ports < 2) {
    return { ...base, impossible: `Le ${proc.nom} n'a qu'un seul port : pas de redondance possible.` };
  }

  // En redondance, nombre pair de colonnes par port pour que chaque chaîne revienne au bord de départ,
  // sauf s'il coûte un processeur : alors le plus de colonnes par port, et des retours de secours longs.
  const contexte = {
    parPort, capacite, redondance, modeOptique: optique, pair: redondance,
    charge: { capacite, pxParDalle, pxParDemi, plafond },
  };
  let d = decouper(m, dalle, proc, contexte);
  let pairAbandonne = null;
  if (redondance) {
    const sansPair = decouper(m, dalle, proc, { ...contexte, pair: false });
    if (sansPair.nombre !== null && (d.nombre === null || sansPair.nombre < d.nombre)) {
      pairAbandonne = { avecPair: d.nombre, sansPair: sansPair.nombre };
      contexte.pair = false;
      d = sansPair;
      const k = d.global.colonnes.colonnesParPort;
      alertes.push(`Redondance : un nombre pair de colonnes par port demanderait ${pairAbandonne.avecPair === null
        ? 'plus de processeurs' : `${pairAbandonne.avecPair} × ${proc.nom}`} au lieu de ${sansPair.nombre}. Gardé à ${k} colonnes par port : `
        + 'des chaînes finissent au bord opposé au départ, leur retour de secours est long (longueur dans l\'onglet Schéma).');
    }
  }
  // Au plus juste le long du vrai serpentin : il fait foi quand il diffère du décompte théorique (demi-dalles).
  const departCablage = reglages.departCablage ?? 'haut-gauche';
  for (const g of d.groupes) {
    g.ports.auPlusJusteSerpentin = portsSerpentin(sousMur(m, dalle, g.colonnes, g.premiereRangee, g.rangees), contexte.charge, departCablage).length;
  }
  const serpentinGlobal = portsSerpentin(m, contexte.charge, departCablage);
  const somme = (f) => d.groupes.reduce((total, g) => total + f(g), 0);
  const sorties = proc.sortiesParDistributeur;
  const totaux = d.nombre === null ? null : {
    ports: {
      auPlusJuste: somme((g) => g.ports.auPlusJuste),
      auPlusJusteSerpentin: somme((g) => g.ports.auPlusJusteSerpentin),
      colonnes: somme((g) => g.ports.colonnes),
      redondance: { auPlusJuste: somme((g) => g.ports.redondance.auPlusJuste), colonnes: somme((g) => g.ports.redondance.colonnes) },
    },
    distributeurs: sorties ? {
      colonnes: somme((g) => g.distributeurs.colonnes),
      auPlusJuste: somme((g) => g.distributeurs.auPlusJuste),
      redondance: somme((g) => g.distributeurs.redondance),
    } : null,
  };

  // Alerte de seuil processeur : colonnes à retirer pour économiser un processeur.
  let colonnesEnMoins = null;
  if (d.nombre > 1) {
    for (let c = m.colonnes - 1; c >= 1; c -= 1) {
      const n = decouper(sousMur(m, dalle, c, 1, m.rangees.length), dalle, proc, contexte).nombre;
      if (n !== null && n < d.nombre) {
        colonnesEnMoins = m.colonnes - c;
        break;
      }
    }
  }

  const rectangles = proc.logiciel === 'NovaLCT' ? rectanglesNovaLCT(m, dalle, capacite) : null;

  // Chaque contrôle dépassé donne une alerte explicite, en plus du tableau.
  const c = d.controles;
  const mpxTexte = (px) => `${nombreCourt(px / 1e6, 2)} M px`;
  const ilEnFaut = (n) => (Number.isFinite(n) ? ` : il en faut ${n}` : '');
  if (c.pixels.depasse) {
    alertes.push(`Le mur (${mpxTexte(c.pixels.valeur)}) dépasse la capacité d'un ${proc.nom} (${mpxTexte(c.pixels.limite)})${ilEnFaut(c.pixels.nombre)}.`);
  }
  if (c.largeur.depasse) {
    alertes.push(`Le mur fait ${nombreCourt(c.largeur.valeur)} px de large, au-delà des ${nombreCourt(c.largeur.limite)} px de canvas `
      + `d'un ${proc.nom}${ilEnFaut(c.largeur.nombre)} en largeur.`);
  }
  if (c.hauteur.depasse) {
    alertes.push(`Le mur fait ${nombreCourt(c.hauteur.valeur)} px de haut, au-delà des ${nombreCourt(c.hauteur.limite)} px de canvas `
      + `d'un ${proc.nom}${ilEnFaut(c.hauteur.nombre)} en hauteur.`);
  }
  if (c.ports.depasse) {
    alertes.push(`Le mur demande ${c.ports.valeur} ports${c.ports.principaux ? ' principaux' : ''}, au-delà des ${c.ports.limite} `
      + `d'un ${proc.nom}${ilEnFaut(c.ports.nombre)}.`);
  }
  if (c.dalles?.depasse) {
    alertes.push(`Le mur compte ${c.dalles.valeur} dalles, au-delà des ${c.dalles.limite} d'un ${proc.nom}${ilEnFaut(c.dalles.nombre)}.`);
  }

  return {
    ...base,
    global: {
      ...d.global,
      // NovaLCT : le décompte en rectangles devient le conseil ; l'au plus juste peut ne pas être réalisable tel quel.
      rectangles,
      auPlusJusteRealisable: !rectangles || d.global.auPlusJuste >= rectangles.ports,
      serpentin: {
        depart: departCablage,
        ports: serpentinGlobal.length,
        chargeMax: chargePx(Math.max(...serpentinGlobal.map((grp) => grp.px)), capacite),
        ecart: serpentinGlobal.length === d.global.auPlusJuste ? null
          : `Au plus juste : ${serpentinGlobal.length} ports en suivant le vrai serpentin depuis ${LIBELLES_COIN[departCablage]}, `
            + `contre ${d.global.auPlusJuste} au décompte théorique. Le serpentin alterne dalles entières et demi-dalles : `
            + 'un port ne peut pas toujours être rempli au plus juste.',
      },
      // Décompte retenu en colonnes entières ; minimum théorique au plus juste donné en second.
      minimum: minimumTheorique(d.global, serpentinGlobal.length, m, 'port', { pair: contexte.pair }),
      // Décompte global, sans découpage par processeur (celui du formateur).
      distributeurs: sorties ? {
        auPlusJuste: Math.ceil(d.global.auPlusJuste / sorties),
        colonnes: Math.ceil(d.global.colonnes.ports / sorties),
      } : null,
      chargeMax: {
        auPlusJuste: chargePx(d.global.pxMaxParPortAuPlusJuste, capacite),
        colonnes: chargePx(d.global.colonnes.pxMaxParPort, capacite),
      },
    },
    controles: d.controles,
    limites: d.limites,
    nombre: d.nombre,
    grille: d.grille,
    unSeulSuffit: d.nombre === 1,
    // Redondance : nombre pair de colonnes par port appliqué, ou abandonné parce qu'il coûterait un processeur.
    colonnesPaires: contexte.pair,
    pairAbandonne,
    impossible: d.impossible,
    groupes: d.groupes,
    totaux,
    seuil: { dallesEnMoins: d.global.seuil.dallesEnMoins, colonnesEnMoins },
  };
}

// Processeur conseillé par défaut : le moins de processeurs, puis la plus petite capacité en pixels.
// Les évaluations portent déjà les réglages (redondance, mode optique) : le conseil en tient compte.
export function processeurConseille(evaluations) {
  const possibles = evaluations.filter((e) => e.nombre !== null);
  possibles.sort((a, b) => a.nombre - b.nombre || a.processeur.pixelsMax - b.processeur.pixelsMax);
  return possibles[0] ?? null;
}

// ---------------------------------------------------------------------------
// Module 2 : canvas et source
// ---------------------------------------------------------------------------

// Formats de source standard, du plus petit au plus grand : conseil par défaut et contrôle EDID.
export const RESOLUTIONS_STANDARD = [[1920, 1080], [3840, 2160], [4096, 2160]];
const NOMS_FAMILLE_LIAISON = { hdmi: 'HDMI', sdi: 'SDI', dvi: 'DVI', dp: 'DisplayPort' };

function confianceDe(fiche, champs) {
  return champs.map((c) => fiche.sources?.[c]?.source.confiance ?? '');
}

// Liaison vidéo : débit de pixels actifs (largeur × hauteur × fréquence) comparé à celui de son format maxi.
// Approximation : les formats forcés de même débit passent (8192 × 1080 à 60 Hz en HDMI 2.0).
export function controleLiaison(liaison, { largeurPx, hauteurPx, frequenceHz }) {
  const debitDemande = largeurPx * hauteurPx * frequenceHz;
  const debitMax = liaison.formatMaxLargeurPx * liaison.formatMaxHauteurPx * liaison.formatMaxFrequenceHz;
  const confiances = confianceDe(liaison, ['formatMaxLargeurPx', 'formatMaxHauteurPx', 'formatMaxFrequenceHz']);
  return {
    liaison,
    debitDemande,
    debitMax,
    taux: debitDemande / debitMax,
    ok: debitDemande <= debitMax + EPS,
    approximation: true,
    deduit: confiances.some((c) => /déduit/.test(c)),
    aConfirmer: confiances.some((c) => /à confirmer/.test(c)),
  };
}

const mpx = (debit) => nombreCourt(debit / 1e6, 1);

// Entrée du processeur pour la liaison choisie. Une entrée de version plus ancienne (HDMI 1.3 au lieu de 2.0)
// limite le débit ; une version non précisée sur la fiche donne une alerte. Les limites d'entrée de la fiche
// du processeur passent avant l'approximation par débit.
export function controleEntree(proc, source, liaisons) {
  const choisie = liaisons.find((l) => l.id === source.liaison);
  if (!choisie) throw new ErreurSaisie('Liaison vidéo inconnue.');
  const alertes = [];
  const types = proc.entreesTypes ?? [];
  const memeFamille = types.map((id) => liaisons.find((l) => l.id === id)).filter((l) => l && l.famille === choisie.famille);
  let liaison;
  if (memeFamille.length > 0) {
    const meilleure = memeFamille.reduce((a, b) => (b.rang > a.rang ? b : a));
    liaison = meilleure.rang < choisie.rang ? meilleure : choisie;
    if (liaison !== choisie) {
      alertes.push(`Le ${proc.nom} n'a qu'une entrée ${liaison.nom} : le contrôle se fait sur l'${liaison.nom}, pas sur le ${choisie.nom}.`);
    }
  } else if (types.includes(choisie.famille)) {
    liaison = choisie;
    alertes.push(`Le ${proc.nom} a une entrée ${NOMS_FAMILLE_LIAISON[choisie.famille]} dont la version n'est pas précisée sur sa fiche : `
      + `vérifie qu'elle accepte le ${choisie.nom}.`);
  } else {
    return {
      ok: false, liaison: null, controle: null, alertes,
      refus: `Le ${proc.nom} n'a pas d'entrée ${NOMS_FAMILLE_LIAISON[choisie.famille]} (entrées : ${proc.entrees ?? 'non renseignées'}).`,
    };
  }

  const controle = controleLiaison(liaison, source);
  if (controle.deduit) alertes.push(`${liaison.nom} : format maxi en partie déduit.`);
  if (controle.aConfirmer) alertes.push(`${liaison.nom} : format maxi à confirmer sur la fiche du ${proc.nom}.`);
  let refus = null;
  if (proc.entreeMaxLargeurPx && (source.largeurPx > proc.entreeMaxLargeurPx || source.hauteurPx > proc.entreeMaxHauteurPx)) {
    refus = `Sa fiche limite l'entrée du ${proc.nom} à ${proc.entreeMaxLargeurPx} × ${proc.entreeMaxHauteurPx} px ; `
      + `la source fait ${source.largeurPx} × ${source.hauteurPx} px.`;
  } else if (!controle.ok) {
    refus = `Entrée ${liaison.nom} du ${proc.nom} : ${mpx(controle.debitDemande)} Mpx/s demandés pour ${mpx(controle.debitMax)} au plus `
      + `(${liaison.formatMaxLargeurPx} × ${liaison.formatMaxHauteurPx} à ${liaison.formatMaxFrequenceHz} Hz), en approximation.`;
  }
  return { ok: refus === null, liaison, controle, alertes, refus };
}

// Contrôle de la source envoyée à chaque processeur : entrée, blocs qui tiennent dans l'image, alertes.
// `data` : { famille, bitsReseau, frequenceHz } du calcul data.
export function controleSource(source, evaluation, liaisons, data) {
  const { largeurPx, hauteurPx, frequenceHz, bits } = source;
  if (![largeurPx, hauteurPx, frequenceHz].every((x) => Number.isFinite(x) && x > 0)) {
    throw new ErreurSaisie('Indique une résolution et une fréquence de source supérieures à zéro.');
  }
  const proc = evaluation.processeur;
  const alertes = [];
  const refus = [];

  const entree = controleEntree(proc, source, liaisons);
  if (entree.refus) refus.push(entree.refus);
  alertes.push(...entree.alertes);

  const blocs = (evaluation.groupes ?? []).map((g, i) => ({
    numero: i + 1,
    largeurPx: g.largeurPx,
    hauteurPx: g.hauteurPx,
    canvas: g.canvas,
    x: g.x,
    y: g.y,
    xSource: [0, g.largeurPx - 1],
    ySource: [0, g.hauteurPx - 1],
    tient: g.largeurPx <= largeurPx && g.hauteurPx <= hauteurPx,
  }));
  const tropGrands = blocs.filter((b) => !b.tient);
  if (tropGrands.length > 0) {
    refus.push(`${tropGrands.length === 1 ? 'Le bloc' : 'Les blocs'} ${tropGrands.map((b) => `n° ${b.numero} (${b.largeurPx} × ${b.hauteurPx} px)`).join(', ')} `
      + `ne ${tropGrands.length === 1 ? 'tient' : 'tiennent'} pas dans une source de ${largeurPx} × ${hauteurPx} px.`);
  }
  for (const b of blocs.filter((x) => x.canvas?.lowLatency)) {
    alertes.push(`Bloc n° ${b.numero} : le format ${b.canvas.format.replace(' (Low Latency Mode)', '')} force le Low Latency Mode`
      + `${proc.latence ? ` (latence : ${proc.latence})` : ''}.`);
  }

  if (!RESOLUTIONS_STANDARD.some(([l, h]) => l === largeurPx && h === hauteurPx)) {
    // Le format standard qui contiendrait les blocs ne passe-t-il pas l'entrée du processeur ?
    const plusGrand = [Math.max(0, ...blocs.map((b) => b.largeurPx)), Math.max(0, ...blocs.map((b) => b.hauteurPx))];
    const standard = RESOLUTIONS_STANDARD.find(([l, h]) => plusGrand[0] <= l && plusGrand[1] <= h);
    const bloque = standard && !controleEntree(proc, { ...source, largeurPx: standard[0], hauteurPx: standard[1] }, liaisons).ok;
    alertes.push(`Résolution de source ${largeurPx} × ${hauteurPx} px non standard : les formateurs conseillent 1920 × 1080 `
      + 'ou 3840 × 2160 (4096 × 2160 en DCI) pour éviter les soucis d\'EDID.'
      + (bloque
        ? ` Le ${standard[0]} × ${standard[1]} ne passe pas l'entrée du ${proc.nom}. Autres options : un processeur avec une entrée 4K `
          + '(HDMI 2.0, 12G-SDI ou DisplayPort 1.2), ou un mur ramené à 1920 × 1080 pour rester en format standard.'
        : ''));
  }
  if (source.plage === 'Limited') {
    alertes.push('Plage Limited : le noir démarre à 16 et le blanc s\'arrête à 235, d\'où des noirs laiteux. Règle la source en Full.');
  }
  if (source.espace === 'YUV') alertes.push('Source en YUV : préfère RGB, en plage Full.');
  if (frequenceHz > data.frequenceHz + EPS) {
    alertes.push(`La fréquence de la source (${nombreCourt(frequenceHz)} Hz) dépasse celle du calcul data (${nombreCourt(data.frequenceHz)} Hz) : `
      + `refais le calcul data à ${nombreCourt(frequenceHz)} Hz, sinon les ports seront surchargés.`);
  }
  const bitDepth = alerteBitDepthSource(data.famille, data.bitsReseau, bits);
  if (bitDepth) alertes.push(bitDepth);

  return { entree, blocs, alertes, refus, ok: refus.length === 0 };
}

const debitMaxLiaison = (l) => l.formatMaxLargeurPx * l.formatMaxHauteurPx * l.formatMaxFrequenceHz;

// Meilleure entrée d'un processeur : celle au plus grand débit. Une version non précisée (« HDMI ») compte
// comme la plus ancienne de sa famille, par prudence.
export function meilleureEntree(proc, liaisons) {
  let meilleure = null;
  for (const type of proc.entreesTypes ?? []) {
    let liaison = liaisons.find((l) => l.id === type);
    if (!liaison) {
      const famille = liaisons.filter((l) => l.famille === type);
      liaison = famille.length ? famille.reduce((a, b) => (b.rang < a.rang ? b : a)) : null;
    }
    if (liaison && (!meilleure || debitMaxLiaison(liaison) > debitMaxLiaison(meilleure))) meilleure = liaison;
  }
  return meilleure;
}

// Source conseillée par défaut : le plus petit format standard qui contient le plus grand bloc de processeur,
// à la fréquence du calcul data, sur la meilleure entrée du processeur. Sans format standard assez grand :
// la taille du bloc.
export function sourceConseillee(evaluation, liaisons, frequenceHz) {
  const blocs = evaluation.groupes ?? [];
  if (blocs.length === 0) return null;
  const largeur = Math.max(...blocs.map((g) => g.largeurPx));
  const hauteur = Math.max(...blocs.map((g) => g.hauteurPx));
  const standard = RESOLUTIONS_STANDARD.find(([l, h]) => largeur <= l && hauteur <= h);
  const liaison = meilleureEntree(evaluation.processeur, liaisons)?.id ?? null;
  const passe = (l, h) => liaison !== null && controleEntree(evaluation.processeur, { largeurPx: l, hauteurPx: h, frequenceHz, liaison }, liaisons).ok;
  // Si le format standard ne passe pas l'entrée, la taille du bloc en résolution personnalisée (alerte EDID).
  const personnalise = standard && !passe(standard[0], standard[1]) && passe(largeur, hauteur);
  const retenu = standard && !personnalise;
  return {
    largeurPx: retenu ? standard[0] : largeur,
    hauteurPx: retenu ? standard[1] : hauteur,
    frequenceHz,
    liaison,
    standard: Boolean(retenu),
    // 'standard' : format standard ; 'entree' : le standard ne passe pas l'entrée ; 'taille' : aucun standard assez grand.
    raison: retenu ? 'standard' : (standard ? 'entree' : 'taille'),
    formatStandard: standard ?? null,
  };
}

// ---------------------------------------------------------------------------
// Régies et scalers
// ---------------------------------------------------------------------------

export function champsManquantsRegie(regie) {
  const manquants = [];
  if (!regie.modesSortie?.length) manquants.push('modesSortie');
  if (!regie.sortiesTypes?.length) manquants.push('sortiesTypes');
  return manquants;
}

// Une sortie de régie par entrée de processeur ; la sortie doit monter au format de la source et avoir la
// connectique de la liaison (une version plus récente de la même famille convient). Avec le multiviewer,
// seuls les modes dont le nombre de sorties est connu sont retenus.
export function controleRegie(regie, evaluation, source, liaisons, { multiviewer = false } = {}) {
  const necessaires = evaluation.nombre ?? null;
  const manquants = champsManquantsRegie(regie);
  if (manquants.length > 0) {
    return { ok: null, aCompleter: manquants, refus: [], alertes: [], sortiesNecessaires: necessaires, sortiesDisponibles: null, mode: null };
  }
  const refus = [];
  const alertes = [];
  const modes = regie.modesSortie
    .filter((md) => !multiviewer || md.sortiesAvecMultiviewer)
    .map((md) => ({ ...md, disponibles: multiviewer ? md.sortiesAvecMultiviewer : md.sorties }))
    .filter((md) => source.largeurPx <= md.largeurMaxPx && source.hauteurPx <= md.hauteurMaxPx && source.frequenceHz <= md.frequenceHz + EPS);
  const mode = modes.length ? modes.reduce((a, b) => (b.disponibles > a.disponibles ? b : a)) : null;
  if (multiviewer && regie.modesSortie.some((md) => !md.sortiesAvecMultiviewer)) {
    alertes.push(`Multiviewer : ${regie.modesSortie.filter((md) => !md.sortiesAvecMultiviewer).map((md) => `mode ${md.nom}`).join(', ')} `
      + 'non retenu, faute de nombre de sorties connu.');
  }
  if (!mode) {
    refus.push(`Aucune sortie de la régie ${regie.nom}${multiviewer ? ' (avec le multiviewer)' : ''} ne monte à `
      + `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz.`);
  } else if (necessaires !== null && necessaires > mode.disponibles) {
    refus.push(`${necessaires} processeurs demandent ${necessaires} sorties : la régie ${regie.nom} n'en a que ${mode.disponibles} `
      + `en mode ${mode.nom}${multiviewer ? ', avec le multiviewer' : ''}.`);
  }
  const choisie = liaisons.find((l) => l.id === source.liaison);
  const sorties = regie.sortiesTypes.map((id) => liaisons.find((l) => l.id === id)).filter(Boolean);
  if (choisie && !sorties.some((l) => l.famille === choisie.famille && l.rang >= choisie.rang)) {
    refus.push(`La régie ${regie.nom} n'a pas de sortie ${choisie.nom} (sorties : ${sorties.map((l) => l.nom).join(', ')}).`);
  }
  return {
    ok: refus.length === 0, aCompleter: [], refus, alertes,
    sortiesNecessaires: necessaires, sortiesDisponibles: mode ? mode.disponibles : 0, mode,
  };
}

// ---------------------------------------------------------------------------
// Module 3 : électricité (indicatif : à valider par l'électricien)
// ---------------------------------------------------------------------------

export const TENSION_CALCUL_V = 220;
export const TENSION_THEORIQUE_V = 230;
export const MARGE_DEFAUT = 0.8;
export const DEPART_DEFAUT_A = 16;
export const ARRIVEES = { mono: [16, 32], tri: [16, 32, 63, 125] };
// Seuil magnétique bas des disjoncteurs, en multiple de In (NF EN 60898-1).
export const SEUILS_MAGNETIQUES = { B: 3, C: 5, D: 10 };
// Repère sans fiche : 1 kVA/m² pour un écran plein jour (support Oliverdy), compté en watts.
export const W_PAR_M2_SANS_FICHE = 1000;
export const BTU_PAR_W = 3.412;

// Arrondi au milliwatt, pour effacer le bruit des nombres à virgule (220 × 16 × 0,8 = 2816).
const arrondiW = (w) => Math.round(w * 1000) / 1000;

// Puissance utile d'une ligne : U × I × marge, ou la valeur saisie quand elle est donnée.
export function puissanceUtileLigne({ tensionV = TENSION_CALCUL_V, intensiteA = DEPART_DEFAUT_A, marge = MARGE_DEFAUT, puissanceUtileW = null } = {}) {
  if (puissanceUtileW) return puissanceUtileW;
  return arrondiW(tensionV * intensiteA * marge);
}

export function dallesParLigne(pMaxW, reglages = {}) {
  return Math.floor(puissanceUtileLigne(reglages) / pMaxW + EPS);
}

// P max d'une dalle : celle de la fiche ; estimée pour un gabarit ; sinon 1 kVA/m² de sa surface.
export function pMaxDalle(dalle) {
  if (dalle.pMaxW > 0) return { valeurW: dalle.pMaxW, estimee: dalle.gabarit === true, origine: dalle.gabarit ? 'gabarit' : 'fiche' };
  return { valeurW: ((dalle.largeurMm * dalle.hauteurMm) / 1e6) * W_PAR_M2_SANS_FICHE, estimee: true, origine: 'surface' };
}

function versPhases(lignes, tensionV, capacitePhaseW, affectation) {
  const phases = [1, 2, 3].map((numero) => ({ numero, lignes: 0, puissanceW: 0, intensiteA: 0 }));
  lignes.forEach((ligne, i) => {
    const p = phases[affectation(i, phases)];
    p.lignes += 1;
    p.puissanceW = arrondiW(p.puissanceW + ligne.puissanceW);
    ligne.phase = p.numero;
  });
  for (const p of phases) p.intensiteA = p.puissanceW / tensionV;
  const charges = phases.map((p) => p.puissanceW);
  const ecartW = arrondiW(Math.max(...charges) - Math.min(...charges));
  return {
    lignes,
    phases,
    ecartW,
    // Écart entre la phase la plus chargée et la moins chargée, rapporté à la plus chargée.
    ecartPourcent: Math.max(...charges) > 0 ? (100 * ecartW) / Math.max(...charges) : 0,
    ok: charges.every((w) => w <= capacitePhaseW + EPS),
  };
}

// Option au nombre minimal de lignes : les plus chargées d'abord, chacune sur la phase la moins chargée.
function repartitionMinimale(lignes, tensionV, capacitePhaseW) {
  const triees = [...lignes].sort((a, b) => b.puissanceW - a.puissanceW);
  const charge = [0, 0, 0];
  return versPhases(triees, tensionV, capacitePhaseW, (i) => {
    const phase = charge.indexOf(Math.min(...charge));
    charge[phase] += triees[i].puissanceW;
    return phase;
  });
}

// Option équilibrée : lignes en multiple de 3, réparties à tour de rôle sur L1, L2 et L3.
function repartitionEquilibree(lignes, tensionV, capacitePhaseW) {
  return versPhases(lignes.map((l) => ({ ...l })), tensionV, capacitePhaseW, (i) => i % 3);
}

const multipleDe3 = (n) => Math.ceil(n / 3) * 3;

// Électricité d'un mur, calculée par phase, jamais sur le total.
// Réglages : tensionV (220), marge (0,8), puissanceUtileW (facultatif), departA (16),
// arrivee { type: 'mono' | 'tri', intensiteA }, courbe ('B', 'C', 'D' ou null).
export function electricite(m, dalle, reglages = {}) {
  const {
    tensionV = TENSION_CALCUL_V, marge = MARGE_DEFAUT, puissanceUtileW = null, departA = DEPART_DEFAUT_A,
    arrivee = { type: 'tri', intensiteA: 32 }, courbe = null, depart = 'haut-gauche',
  } = reglages;
  if (!(tensionV > 0)) throw new ErreurSaisie('Indique une tension de calcul supérieure à zéro.');
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(marge > 0 && marge <= 1)) throw new ErreurSaisie('La marge est comprise entre 1 et 100 %.');
  if (!(departA > 0)) throw new ErreurSaisie('Indique l\'intensité des départs, en ampères.');
  if (!(arrivee.intensiteA > 0) || !['mono', 'tri'].includes(arrivee.type)) throw new ErreurSaisie('Indique l\'arrivée : mono ou tri, et son intensité.');
  if (puissanceUtileW !== null && !(puissanceUtileW > 0)) throw new ErreurSaisie('La puissance utile par ligne doit être supérieure à zéro.');

  const alertes = [];
  const manques = [];
  const pDalle = pMaxDalle(dalle);
  const pDemi = m.demi ? pMaxDalle(m.demi) : null;
  for (const [fiche, p] of [[dalle, pDalle], [m.demi, pDemi]]) {
    if (!p) continue;
    if (p.origine === 'surface') {
      const texte = `P max absente de la fiche ${fiche.nom} : estimée à ${nombreCourt(p.valeurW)} W avec le repère de 1 kVA/m² `
        + '(support Oliverdy). Remplace-la par la P max de la fiche dès que possible.';
      alertes.push(texte);
      manques.push({ champ: 'pMaxW', fiche: fiche.nom, texte });
    } else if (p.origine === 'gabarit') {
      alertes.push(`Gabarit ${fiche.nom} : P max estimée à ${nombreCourt(p.valeurW)} W, non sourcé. Remplace-la par la P max de la fiche.`);
    }
  }

  const utileW = puissanceUtileLigne({ tensionV, intensiteA: departA, marge, puissanceUtileW });
  const ligne = {
    utileW,
    theoriqueW: arrondiW(tensionV * departA),
    maxi230W: arrondiW(TENSION_THEORIQUE_V * departA),
    origine: puissanceUtileW ? 'champ' : 'calcul',
  };
  const parPuissance = Math.floor(utileW / pDalle.valeurW + EPS);
  const chainage = dalle.chainagePowerMax ?? null;
  const retenu = chainage ? Math.min(parPuissance, chainage) : parPuissance;
  if (retenu < 1) {
    throw new ErreurSaisie(`Une dalle (${nombreCourt(pDalle.valeurW)} W) dépasse la puissance utile d'une ligne (${nombreCourt(utileW)} W).`);
  }
  const dallesLigne = {
    puissance: parPuissance,
    chainage,
    retenu,
    limite: chainage && chainage < parPuissance ? 'chaînage' : 'puissance',
    theoriques230: Math.floor(ligne.maxi230W / pDalle.valeurW + EPS),
  };

  // Même moteur que les ports : les watts remplacent les pixels, le chaînage joue le rôle du plafond.
  const charge = { capacite: utileW, pxParDalle: pDalle.valeurW, pxParDemi: pDemi ? pDemi.valeurW : pDalle.valeurW, plafond: chainage ?? Infinity };
  const c = cablage(m, retenu, charge);
  const watts = (e, d) => arrondiW(e * pDalle.valeurW + d * (pDemi ? pDemi.valeurW : 0));
  // Au plus juste le long du vrai serpentin depuis le coin de départ : il fait foi. Le décompte théorique
  // (dalles entières d'abord, puis demi-dalles) reste donné en second.
  const serpent = serpentin(suite(1, m.colonnes), suite(1, m.rangees.length), 'vertical', depart);
  const poidsW = ([, r]) => (m.rangees[r - 1] === 'demi' ? charge.pxParDemi : charge.pxParDalle);
  const versLigne = (grp) => {
    const d = grp.filter(([, r]) => m.rangees[r - 1] === 'demi').length;
    return { entieres: grp.length - d, demi: d, dalles: grp.length, puissanceW: watts(grp.length - d, d) };
  };
  const lignesAuPlusJuste = remplirGlouton(serpent, poidsW, utileW, chainage ?? Infinity).map(versLigne);
  const theorique = c.remplissage.length;

  const entieresParColonne = m.lignes;
  const demiParColonne = m.rangeeDemi ? 1 : 0;
  let lignesColonnes;
  if (c.colonnes.colonnesParPort) {
    const k = c.colonnes.colonnesParPort;
    lignesColonnes = [];
    for (let reste = m.colonnes; reste > 0; reste -= k) {
      const n = Math.min(k, reste);
      lignesColonnes.push({ colonnes: n, dalles: n * (entieresParColonne + demiParColonne), puissanceW: watts(n * entieresParColonne, n * demiParColonne) });
    }
  } else {
    const indexDemi = demiParColonne ? (m.positionDemi === 'haut' ? 0 : c.colonnes.segments.length - 1) : -1;
    const segment = c.colonnes.segments.map((n, i) => (i === indexDemi
      ? { colonnes: 1, dalles: n, puissanceW: watts(n - 1, 1) }
      : { colonnes: 1, dalles: n, puissanceW: watts(n, 0) }));
    lignesColonnes = Array.from({ length: m.colonnes }, () => segment.map((s) => ({ ...s }))).flat();
  }

  const puissanceTotaleW = watts(m.dalles.entieres, m.dalles.demi);
  const capacitePhaseW = arrondiW(tensionV * arrivee.intensiteA * marge);
  const resultat = {
    reglages: { tensionV, marge, puissanceUtileW, departA, arrivee, courbe, depart },
    pMax: { dalle: pDalle, demi: pDemi },
    manques,
    puissanceTotaleW,
    btuH: puissanceTotaleW * BTU_PAR_W,
    ligne,
    dallesParLigne: dallesLigne,
    lignes: {
      auPlusJuste: {
        nombre: lignesAuPlusJuste.length,
        lignes: lignesAuPlusJuste,
        theorique,
        depart,
        ecart: lignesAuPlusJuste.length === theorique ? null
          : `Au plus juste : ${lignesAuPlusJuste.length} lignes en suivant le vrai serpentin depuis ${LIBELLES_COIN[depart]}, `
            + `contre ${theorique} au décompte théorique. Le serpentin alterne dalles entières et demi-dalles : `
            + 'une ligne ne peut pas toujours être remplie au plus juste.',
      },
      colonnes: { nombre: lignesColonnes.length, colonnesParLigne: c.colonnes.colonnesParPort, segments: c.colonnes.segments, lignes: lignesColonnes },
      // Lignes retenues : en colonnes entières, au minimum ; en triphasé, celles de l'équilibre des phases.
      retenues: lignesColonnes.length,
      minimum: minimumTheorique(c, lignesAuPlusJuste.length, m, 'ligne'),
    },
    arrivee: {
      type: arrivee.type,
      intensiteA: arrivee.intensiteA,
      capacitePhaseW,
      capacite230W: arrondiW(TENSION_THEORIQUE_V * arrivee.intensiteA),
    },
    monophase: null,
    triphase: null,
    appel: null,
    alertes,
  };

  if (arrivee.type === 'mono') {
    const ok = puissanceTotaleW <= capacitePhaseW + EPS;
    resultat.monophase = { puissanceW: puissanceTotaleW, capaciteW: capacitePhaseW, intensiteA: puissanceTotaleW / tensionV, ok };
    if (!ok) {
      alertes.push(`L'arrivée mono ${nombreCourt(arrivee.intensiteA)} A porte ${nombreCourt(capacitePhaseW)} W utiles `
        + `(${nombreCourt(tensionV)} V, marge ${nombreCourt(marge * 100)} %) : le mur demande ${nombreCourt(puissanceTotaleW)} W. `
        + 'Il faut une arrivée plus forte ou du triphasé.');
    }
  } else {
    // Équilibre au plus juste : lignes en multiple de 3, dalles du serpentin réparties au plus égal.
    let equilibreApj = null;
    for (let n = multipleDe3(lignesAuPlusJuste.length); n <= Math.max(3, serpent.length); n += 3) {
      const lignes = [];
      let avant = 0;
      for (const k of repartir(serpent.length, n)) {
        lignes.push(versLigne(serpent.slice(avant, avant + k)));
        avant += k;
      }
      if (lignes.every((l) => l.puissanceW <= utileW + EPS && l.dalles <= (chainage ?? Infinity) && l.dalles > 0)) {
        equilibreApj = repartitionEquilibree(lignes, tensionV, capacitePhaseW);
        break;
      }
    }
    // Équilibre des phases en colonnes entières (conseil) : parmi les répartitions des colonnes entières, du minimum
    // de lignes à une colonne par ligne, l'écart entre phases le plus faible ; à écart égal, le moins de lignes ;
    // à lignes égales, les plus régulières (3-3-2-2 plutôt que 3-3-3-1). Chaque ligne, des plus chargées aux moins
    // chargées, va sur la phase la moins chargée. Colonne coupée en segments : les lignes sont fixes.
    let equilibreColonnes;
    if (c.colonnes.colonnesParPort) {
      const versLignes = (tailles) => tailles.map((k) => ({
        colonnes: k, dalles: k * (entieresParColonne + demiParColonne), puissanceW: watts(k * entieresParColonne, k * demiParColonne),
      }));
      const candidats = [lignesColonnes.map((l) => l.colonnes), ...suite(lignesColonnes.length, m.colonnes).map((n) => repartir(m.colonnes, n))];
      const avant = (a, b) => a.ecartW < b.ecartW - EPS
        || (Math.abs(a.ecartW - b.ecartW) <= EPS && (a.n < b.n || (a.n === b.n && a.irregularite < b.irregularite)));
      let meilleur = null;
      for (const tailles of candidats) {
        const option = repartitionMinimale(versLignes(tailles), tensionV, capacitePhaseW);
        const cle = { ecartW: option.ecartW, n: tailles.length, irregularite: Math.max(...tailles) - Math.min(...tailles), option };
        if (!meilleur || avant(cle, meilleur)) meilleur = cle;
      }
      equilibreColonnes = meilleur.option;
    } else {
      equilibreColonnes = repartitionMinimale(lignesColonnes.map((l) => ({ ...l })), tensionV, capacitePhaseW);
    }
    resultat.triphase = {
      auPlusJuste: { equilibre: equilibreApj, minimum: repartitionMinimale(lignesAuPlusJuste, tensionV, capacitePhaseW) },
      colonnes: { equilibre: equilibreColonnes, minimum: repartitionMinimale(lignesColonnes, tensionV, capacitePhaseW) },
    };
    // Conseil : l'équilibre des phases en colonnes entières ; le minimum de lignes est proposé en second.
    const conseil = equilibreColonnes;
    const minimumColonnes = resultat.triphase.colonnes.minimum;
    resultat.lignes.retenues = conseil.lignes.length;
    if (conseil.lignes.length > minimumColonnes.lignes.length) {
      const pc = (x) => `${nombreCourt(x, 0)} %`;
      const ecart = resultat.lignes.minimum;
      ecart.raisons.push(`équilibre des phases : ${conseil.lignes.length} lignes au lieu de ${minimumColonnes.lignes.length}, `
        + `écart entre phases ${pc(conseil.ecartPourcent)} au lieu de ${pc(minimumColonnes.ecartPourcent)}`);
      ecart.texte = `Minimum théorique : ${ecart.nombre} ligne${ecart.nombre > 1 ? 's' : ''} au plus juste, contre ${conseil.lignes.length} `
        + `en colonnes entières. Écart : ${ecart.raisons.join(' ; ')}.`;
    }
    if (!conseil.ok) {
      const max = Math.max(...conseil.phases.map((p) => p.puissanceW));
      alertes.push(`Arrivée tri ${nombreCourt(arrivee.intensiteA)} A : la phase la plus chargée demande ${nombreCourt(max)} W `
        + `pour ${nombreCourt(capacitePhaseW)} W utiles par phase, même équilibrée. Il faut une arrivée plus forte.`);
    }
  }

  // Courant d'appel : allumage simultané de toutes les dalles d'une ligne (prudent), seuil magnétique bas.
  if (dalle.courantAppelA > 0) {
    const courbeRetenue = courbe ?? 'C';
    if (!courbe) {
      alertes.push('Courbe du disjoncteur non précisée : contrôle en courbe C, la plus courante ; courbe à vérifier avec l\'électricien.');
    }
    const appelDemi = m.demi?.courantAppelA ?? dalle.courantAppelA;
    const pic = Math.max(...c.remplissage.map(({ e, d }) => e * dalle.courantAppelA + d * appelDemi));
    const seuilA = SEUILS_MAGNETIQUES[courbeRetenue] * departA;
    resultat.appel = { courbe: courbeRetenue, seuilA, picLigneA: pic, dureeMs: dalle.courantAppelMs ?? null, ok: pic <= seuilA + EPS };
    if (!resultat.appel.ok) {
      alertes.push(`Courant d'appel : jusqu'à ${nombreCourt(pic)} A sur une ligne si toutes ses dalles s'allument en même temps, `
        + `au-delà du seuil magnétique bas d'un disjoncteur courbe ${courbeRetenue} ${nombreCourt(departA)} A (${nombreCourt(seuilA)} A). `
        + 'Contrôle prudent : le pic ne dure que quelques millisecondes. Allume ligne par ligne et fais vérifier la courbe par l\'électricien.');
    }
  }

  return resultat;
}

// ---------------------------------------------------------------------------
// Module 5 : poids et accroche (indicatif : à valider par le rigger)
// ---------------------------------------------------------------------------

// Pont (truss) continu à portées égales, charge répartie : part de la charge totale reprise par chaque point.
export const PARTS_PONT = {
  1: [1],
  2: [0.5, 0.5],
  3: [0.1875, 0.625, 0.1875],
  4: [2 / 15, 11 / 30, 11 / 30, 2 / 15],
};

export const RAPPELS_POIDS = [
  'Résultats indicatifs : la structure est validée par le rigger.',
  'Préfère les élingues acier aux sangles textiles, à cause de la tenue au feu.',
  'Structure dimensionnée pour 5 fois le poids suspendu, selon ROE.',
];

// Arrondi au milligramme, pour effacer le bruit des nombres à virgule (90 × 13,6 = 1224).
const arrondiKg = (kg) => Math.round(kg * 1e6) / 1e6;
const texteKg = (kg) => `${nombreCourt(kg, 2)} kg`;

// Poids d'un mur et répartition sur les points d'accroche.
// Réglages : mode ('accroche' ou 'stack'), bumper { poidsKg, colonnes, cmuKg }, cablesKgParDalle, autresKg,
// accroche { type: 'bumpers' | 'pont', points, porteesEgales, poidsPontKg, cmuMoteurKg, configurationMoteur }.
export function poids(m, dalle, reglages = {}) {
  const {
    mode = 'accroche', bumper = null, cablesKgParDalle = 0, autresKg = 0, accroche = { type: 'bumpers' },
  } = reglages;
  if (!['accroche', 'stack'].includes(mode)) throw new ErreurSaisie('Choisis accroche ou stack.');
  if (!(dalle.poidsKg > 0)) throw new ErreurSaisie(`Fiche incomplète : poids absent de la fiche ${dalle.nom}, pas de calcul de poids.`);
  if (m.demi && !(m.demi.poidsKg > 0)) throw new ErreurSaisie(`Fiche incomplète : poids absent de la fiche ${m.demi.nom}, pas de calcul de poids.`);
  if (!(cablesKgParDalle >= 0) || !(autresKg >= 0)) throw new ErreurSaisie('Les poids de câbles et d\'autres charges sont positifs ou nuls.');
  if (bumper && (!(bumper.poidsKg >= 0) || !Number.isInteger(bumper.colonnes) || bumper.colonnes < 1)) {
    throw new ErreurSaisie('Indique le poids d\'un bumper et le nombre de colonnes qu\'il porte.');
  }

  const alertes = [];
  const manques = [];
  const pDemi = m.demi ? m.demi.poidsKg : 0;
  const dallesParColonne = m.rangees.length;
  const colonneKg = arrondiKg(m.lignes * dalle.poidsKg + (m.rangeeDemi ? pDemi : 0) + dallesParColonne * cablesKgParDalle);
  const colonnes = Array.from({ length: m.colonnes }, (_, i) => ({ numero: i + 1, dalles: dallesParColonne, kg: colonneKg }));
  const dallesKg = arrondiKg(m.dalles.entieres * dalle.poidsKg + m.dalles.demi * pDemi);
  const cablesKg = arrondiKg(m.dalles.total * cablesKgParDalle);
  if (!cablesKgParDalle) {
    alertes.push('Poids des câbles entre dalles non renseigné (0 kg) : ajoute-le, par dalle, pour une charge réaliste.');
  }

  // Bumpers ou barres : chacun porte ses colonnes ; le dernier peut en porter moins.
  let bumpers = [];
  if (bumper && mode === 'accroche') {
    for (let debut = 1; debut <= m.colonnes; debut += bumper.colonnes) {
      const fin = Math.min(debut + bumper.colonnes - 1, m.colonnes);
      const kg = arrondiKg((fin - debut + 1) * colonneKg + bumper.poidsKg);
      const ok = bumper.cmuKg ? kg <= bumper.cmuKg + EPS : null;
      bumpers.push({ numero: bumpers.length + 1, colonnes: [debut, fin], kg, cmuKg: bumper.cmuKg ?? null, ok });
    }
    const depasses = bumpers.filter((b) => b.ok === false);
    if (depasses.length > 0) {
      alertes.push(`CMU du bumper (${texteKg(bumper.cmuKg)}) dépassée : ${depasses.length > 1 ? `${depasses.length} bumpers portent` : 'un bumper porte'} `
        + `jusqu'à ${texteKg(Math.max(...depasses.map((b) => b.kg)))}.`);
    }
  }
  const bumpersKg = arrondiKg(bumpers.length * (bumper?.poidsKg ?? 0));
  const murKg = arrondiKg(dallesKg + cablesKg);
  const suspenduKg = arrondiKg(murKg + bumpersKg + autresKg);

  // Points d'accroche (pas en stack).
  let points = null;
  if (mode === 'accroche') {
    const cmu = accroche.cmuMoteurKg ?? null;
    if (accroche.type === 'pont') {
      const n = accroche.points;
      const totalKg = arrondiKg(suspenduKg + (accroche.poidsPontKg ?? 0));
      const renvoiRigger = !(n >= 1 && n <= 4 && Number.isInteger(n)) || accroche.porteesEgales === false;
      const liste = renvoiRigger ? null : PARTS_PONT[n].map((part, i) => ({ numero: i + 1, part, kg: arrondiKg(part * totalKg) }));
      points = { type: 'pont', points: liste, totalKg, renvoiRigger, cmuMoteurKg: cmu, configurationMoteur: accroche.configurationMoteur ?? null, indicatif: true };
      if (renvoiRigger) {
        alertes.push('Pont sur plus de 4 points, à portées inégales ou en porte-à-faux : la répartition doit être établie par le rigger.');
      }
    } else {
      // Chaque bumper (ou, sans bumper renseigné, chaque colonne) pend à son propre point : parts égales.
      const liste = bumpers.length > 0
        ? bumpers.map((b) => ({ numero: b.numero, kg: b.kg, colonnes: b.colonnes }))
        : colonnes.map((c) => ({ numero: c.numero, kg: c.kg, colonnes: [c.numero, c.numero] }));
      points = {
        type: 'bumpers', points: liste, totalKg: arrondiKg(liste.reduce((s, p) => s + p.kg, 0)), renvoiRigger: false,
        cmuMoteurKg: cmu, configurationMoteur: accroche.configurationMoteur ?? null, indicatif: true,
      };
      if (autresKg > 0) alertes.push(`Autres charges suspendues (${texteKg(autresKg)}) : à reprendre sur un point ou sur la structure, avec le rigger.`);
    }
    points.ok = cmu && points.points ? points.points.every((p) => p.kg <= cmu + EPS) : null;
    if (points.ok === false) {
      const max = Math.max(...points.points.map((p) => p.kg));
      alertes.push(`CMU du moteur (${texteKg(cmu)}${points.configurationMoteur ? `, ${points.configurationMoteur}` : ''}) dépassée : `
        + `jusqu'à ${texteKg(max)} sur un point.`);
    }
  }

  // Maximum en accroche ou en stack de la fiche, dans son unité ; une demi-dalle compte pour une dalle.
  const champ = mode === 'stack' ? 'maxStack' : 'maxAccroche';
  const libelleMode = mode === 'stack' ? 'stack' : 'accroche';
  let maximum = null;
  if (dalle[champ] > 0) {
    const unite = dalle[`${champ}Unite`] ?? 'dalles';
    const valeurs = { dalles: dallesParColonne, m: m.hauteurMm / 1000, kg: colonneKg };
    const valeur = valeurs[unite];
    maximum = {
      mode,
      valeur,
      limite: dalle[champ],
      unite,
      conditions: dalle[`${champ}Conditions`] ?? null,
      sources: dalle.sources?.[champ]?.sources ?? [],
      ok: valeur <= dalle[champ] + EPS,
    };
    if (!maximum.ok) {
      alertes.push(`Maximum en ${libelleMode} dépassé : ${nombreCourt(valeur, 2)} ${unite} pour ${nombreCourt(maximum.limite, 2)} ${unite} au plus`
        + `${maximum.conditions ? ` (${maximum.conditions})` : ''}.`);
    }
  } else {
    const texte = `Fiche sans maximum en ${libelleMode} : à vérifier avec le constructeur et le rigger.`;
    alertes.push(texte);
    manques.push({ champ, texte });
  }

  return {
    mode,
    poidsDalleKg: dalle.poidsKg,
    poidsDemiKg: m.demi ? pDemi : null,
    dallesKg,
    cablesKg,
    bumpersKg,
    autresKg,
    murKg,
    suspenduKg,
    kgParM2: dallesKg / m.surfaceM2,
    kgParMetre: suspenduKg / (m.largeurMm / 1000),
    colonnes,
    bumpers,
    points,
    maximum,
    alertes,
    manques,
    rappels: RAPPELS_POIDS,
    indicatif: true,
  };
}

// ---------------------------------------------------------------------------
// Module 6 : schéma de câblage et pixel map (étape 8)
// Colonnes de gauche à droite et rangées de haut en bas, numérotées à partir de 1 (« C3 R2 ») ;
// pixels de 0 à largeur − 1, pixel (0,0) en haut à gauche. Le dessin ne fait qu'afficher ces résultats.
// ---------------------------------------------------------------------------

export const COINS = ['haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite'];
export const LIBELLES_COIN = {
  'haut-gauche': 'en haut à gauche', 'haut-droite': 'en haut à droite', 'bas-gauche': 'en bas à gauche', 'bas-droite': 'en bas à droite',
};
// Limite des navigateurs sur iPhone : surface d'une image générée (4096 × 4096 px), pas un format fixe.
export const SURFACE_MAX_IMAGE = 16777216;
const COTE_MAX_IMAGE = 32767;
const LIMITE_CUIVRE_M = 100;
export const MARGE_MOU_DEFAUT = 0.1;
// Distributeur fibre proposé quand le cuivre dépasse 100 m, si la fiche du processeur n'en nomme pas.
const FIBRE_PAR_FAMILLE = { brompton: 'XD', novastar: 'CVT10', colorlight: 'convertisseurs fibre' };

export const idDalle = (colonne, rangee) => `C${colonne} R${rangee}`;
const suite = (debut, fin) => Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);

// Dalles du mur, rangée par rangée : position et taille en millimètres et en pixels, chacune avec sa fiche
// (la demi-dalle garde la sienne).
export function dallesDuMur(m, dalle) {
  const dalles = [];
  let yMm = 0;
  let yPx = 0;
  m.rangees.forEach((type, i) => {
    const fiche = type === 'demi' ? m.demi : dalle;
    for (let c = 1; c <= m.colonnes; c += 1) {
      dalles.push({
        id: idDalle(c, i + 1),
        colonne: c,
        rangee: i + 1,
        type,
        fiche,
        mm: { x: (c - 1) * dalle.largeurMm, y: yMm, largeur: fiche.largeurMm, hauteur: fiche.hauteurMm },
        px: { x: (c - 1) * dalle.pxH, y: yPx, largeur: fiche.pxH, hauteur: fiche.pxV },
      });
    }
    yMm += fiche.hauteurMm;
    yPx += fiche.pxV;
  });
  return dalles;
}

// Pixel map : le mur à sa résolution native, puis un canvas par processeur (bloc posé en (0,0) de son canvas,
// à la même place dans sa source). Chaque dalle : x et y de son premier à son dernier pixel.
export function pixelMap(m, dalle, evaluation = null) {
  const dalles = dallesDuMur(m, dalle);
  const zone = (d, x0 = 0, y0 = 0) => ({
    id: d.id, colonne: d.colonne, rangee: d.rangee, type: d.type,
    x: [d.px.x - x0, d.px.x - x0 + d.px.largeur - 1],
    y: [d.px.y - y0, d.px.y - y0 + d.px.hauteur - 1],
  });
  const canvas = (evaluation?.groupes ?? []).map((g, i) => ({
    numero: i + 1,
    bloc: { largeurPx: g.largeurPx, hauteurPx: g.hauteurPx },
    canvas: g.canvas,
    xMur: g.x,
    yMur: g.y,
    source: { x: [0, g.largeurPx - 1], y: [0, g.hauteurPx - 1] },
    dalles: dalles
      .filter((d) => d.colonne >= g.premiereColonne && d.colonne <= g.derniereColonne && d.rangee >= g.premiereRangee && d.rangee <= g.derniereRangee)
      .map((d) => zone(d, g.x[0], g.y[0])),
  }));
  return { mur: { largeurPx: m.pxLargeur, hauteurPx: m.pxHauteur, dalles: dalles.map((d) => zone(d)) }, canvas };
}

// Positions [colonne, rangée] d'un bloc en serpentin depuis un coin : vertical (colonne après colonne)
// ou horizontal (rangée après rangée), en changeant de sens à chaque colonne ou rangée.
function serpentin(colonnes, rangees, sens, coin) {
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
function remplirGlouton(ordre, poids, capacite, plafond) {
  const groupes = [];
  let courant = [];
  let charge = 0;
  for (const x of ordre) {
    const w = poids(x);
    if (courant.length > 0 && (charge + w > capacite + EPS || courant.length + 1 > plafond)) {
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

// Règles du terrain (étape 8b) : un port ou une ligne prend des colonnes entières et part du bord de départ.

// Groupes de colonnes entières depuis le côté de départ, chacun en serpentin depuis le bord de départ :
// k colonnes par groupe, ou la taille de chaque groupe (tableau).
function lotsDeColonnes(cols, rows, tailles, coin) {
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const liste = Array.isArray(tailles) ? tailles : repartirParLots(ordreCols.length, tailles);
  const groupes = [];
  let avant = 0;
  for (const n of liste) {
    groupes.push(serpentin(ordreCols.slice(avant, avant + n).sort((a, b) => a - b), rows, 'vertical', coin));
    avant += n;
  }
  return groupes;
}

// Lots de k, le dernier avec le reste.
function repartirParLots(total, k) {
  return Array.from({ length: Math.ceil(total / k) }, (_, i) => Math.min(k, total - i * k));
}

// Colonne plus haute qu'un port ou qu'une ligne : chaque colonne en segments égaux (tailles de haut en bas,
// comme `cablage`), chacun partant de son extrémité côté bord de départ.
function segmentsDeColonnes(cols, rows, tailles, coin) {
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const segments = [];
  let debut = 0;
  for (const n of tailles) {
    segments.push(rows.slice(debut, debut + n));
    debut += n;
  }
  const ordreSegments = coin.startsWith('haut') ? segments : [...segments].reverse();
  return ordreCols.flatMap((col) => ordreSegments.map((seg) => serpentin([col], seg, 'vertical', coin)));
}

// Groupes par rangées entières depuis le bord de départ, en serpentin depuis le côté de départ : le plus de rangées
// qui tiennent, en nombre pair en redondance (data). Une rangée qui ne tient pas seule est coupée en segments égaux
// de colonnes.
function groupesRangees(cols, rows, poids, capacite, plafond, coin, { pair = false } = {}) {
  const ordreRows = coin.startsWith('haut') ? rows : [...rows].reverse();
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const positions = (rs) => rs.flatMap((r) => cols.map((c) => [c, r]));
  const tient = (ps) => ps.reduce((s, p) => s + poids(p), 0) <= capacite + EPS && ps.length <= plafond;
  const lots = (k) => {
    const groupes = [];
    for (let i = 0; i < ordreRows.length; i += k) groupes.push(ordreRows.slice(i, i + k));
    return groupes;
  };
  let kmax = 0;
  for (let n = 1; n <= ordreRows.length && lots(n).every((l) => tient(positions(l))); n += 1) kmax = n;
  if (kmax >= 1) {
    for (let k = pair && kmax >= 2 ? kmax - (kmax % 2) : kmax; k >= 1; k -= 1) {
      if (lots(k).every((l) => tient(positions(l)))) return lots(k).map((l) => serpentin(cols, [...l].sort((a, b) => a - b), 'horizontal', coin));
    }
  }
  const groupes = [];
  for (const r of ordreRows) {
    let s = 1;
    while (s < cols.length && !repartir(cols.length, s).every((n, i, tailles) => {
      const avant = tailles.slice(0, i).reduce((a, b) => a + b, 0);
      return tient(ordreCols.slice(avant, avant + n).map((c) => [c, r]));
    })) s += 1;
    let avant = 0;
    for (const n of repartir(cols.length, s)) {
      groupes.push(serpentin(ordreCols.slice(avant, avant + n).sort((a, b) => a - b), [r], 'horizontal', coin));
      avant += n;
    }
  }
  return groupes;
}

// Ports au plus juste le long du serpentin vertical d'un (sous-)mur, depuis le coin de départ.
// Chaque port : ses positions et ses pixels comptés.
function portsSerpentin(sous, charge, depart) {
  const poids = ([, r]) => (sous.rangees[r - 1] === 'demi' ? charge.pxParDemi : charge.pxParDalle);
  return remplirGlouton(serpentin(suite(1, sous.colonnes), suite(1, sous.rangees.length), 'vertical', depart), poids, charge.capacite, charge.plafond ?? Infinity)
    .map((grp) => Object.assign(grp, { px: grp.reduce((s, p) => s + poids(p), 0) }));
}

// Coin de départ en millimètres, et trajet le long du mur jusqu'au centre d'une dalle (en mètres).
function trajetDepuisCoin(m, coin, d) {
  const x0 = coin.endsWith('gauche') ? 0 : m.largeurMm;
  const y0 = coin.startsWith('haut') ? 0 : m.hauteurMm;
  return (Math.abs(d.mm.x + d.mm.largeur / 2 - x0) + Math.abs(d.mm.y + d.mm.hauteur / 2 - y0)) / 1000;
}

// Retour de secours : de la dernière dalle au bord de départ en longeant la structure (le long de sa colonne, ou de
// sa rangée pour un câblage par rangées), puis le long du bord jusqu'au coin. Jamais en diagonale. Points en mm.
function cheminSecours(m, coin, d, orientation) {
  const xc = d.mm.x + d.mm.largeur / 2;
  const yc = d.mm.y + d.mm.hauteur / 2;
  const x0 = coin.endsWith('gauche') ? 0 : m.largeurMm;
  const y0 = coin.startsWith('haut') ? 0 : m.hauteurMm;
  return orientation === 'rangees' ? [[xc, yc], [x0, yc], [x0, y0]] : [[xc, yc], [xc, y0], [x0, y0]];
}
const longueurCheminM = (chemin) => chemin.reduce((s, p, i) => (i === 0 ? 0 : s + Math.abs(p[0] - chemin[i - 1][0]) + Math.abs(p[1] - chemin[i - 1][1])), 0) / 1000;

// Coin de départ selon le mode du mur : en bas pour un mur posé (stack), en haut pour un mur accroché ; le bord
// peut être forcé quand la régie ou l'armoire arrive par l'autre côté. Côté : celui du processeur ou de l'armoire.
export function coinDepart({ mode = 'accroche', cote = 'gauche', bord = 'auto' } = {}) {
  const vertical = bord === 'haut' || bord === 'bas' ? bord : (mode === 'stack' ? 'bas' : 'haut');
  return `${vertical}-${cote === 'droite' ? 'droite' : 'gauche'}`;
}

export const MENTION_AU_PLUS_JUSTE = 'optimisation, rarement câblé ainsi sur le terrain';

// Rectangle englobant d'un port en pixels réels, tel que NovaLCT le compte.
function pxRectangleEnglobant(positions, dalle, hauteurs) {
  const cs = positions.map((p) => p[0]);
  const rs = positions.map((p) => p[1]);
  const largeur = (Math.max(...cs) - Math.min(...cs) + 1) * dalle.pxH;
  const hauteur = suite(Math.min(...rs), Math.max(...rs)).reduce((s, r) => s + hauteurs[r - 1], 0);
  return largeur * hauteur;
}

const LIBELLES_DATA = { colonnes: 'par colonnes', rangees: 'par rangées', auPlusJuste: 'au plus juste', rectangles: 'rectangles NovaLCT' };

// Câblage data : pour chaque processeur (bloc du découpage de l'onglet Data), les ports en serpentin depuis le coin
// de départ, dans chaque variante. Options : depart (un des COINS), distanceRegieM (facultatif), margeMou (0,10),
// nomDistributeur. Secours en redondance : XD miroirs sur SX40 ; paires de ports voisins sur les autres Brompton
// (impair principal, pair secours) ; ailleurs port p + moitié des ports, convention par défaut à régler dans le logiciel.
export function cablageData(m, dalle, evaluation, {
  depart = 'haut-gauche', distanceRegieM = null, margeMou = MARGE_MOU_DEFAUT, nomDistributeur = null,
} = {}) {
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(margeMou >= 0)) throw new ErreurSaisie('La marge de mou est positive ou nulle.');
  if (!evaluation?.groupes?.length) return { depart, conseil: null, variantes: [], alertes: [evaluation?.impossible ?? 'Aucun processeur retenu.'] };
  const proc = evaluation.processeur;
  const { redondance, modeOptique } = evaluation.reglages;
  const capacite = evaluation.capacite;
  const plafond = redondance && proc.maxDallesParBoucleRedondance ? proc.maxDallesParBoucleRedondance : Infinity;
  const dalles = new Map(dallesDuMur(m, dalle).map((d) => [d.id, d]));
  const tuile = ([c, r]) => dalles.get(idDalle(c, r));
  const poids = (p) => (tuile(p).type === 'demi' ? evaluation.pxParDemi : evaluation.pxParDalle);
  const hauteurs = m.rangees.map((type) => (type === 'demi' ? m.demi.pxV : dalle.pxV));
  const charge = { capacite, pxParDalle: evaluation.pxParDalle, pxParDemi: evaluation.pxParDemi ?? evaluation.pxParDalle, plafond };
  const sorties = proc.sortiesParDistributeur;
  const surDistributeur = Boolean(proc.distributeurObligatoire && sorties);
  const fibre = nomDistributeur ?? FIBRE_PAR_FAMILLE[proc.famille] ?? 'convertisseurs fibre';
  const novaLCT = proc.logiciel === 'NovaLCT';

  const libellePort = (n, miroir = false) => (surDistributeur
    ? `XD${miroir ? ' miroir' : ''} ${Math.ceil(n / sorties)}, port ${((n - 1) % sorties) + 1}`
    : `port ${n}`);
  const pairesBrompton = redondance && proc.famille === 'brompton' && !proc.portsRedondance;
  const moitie = Math.floor((modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports) / 2);
  const convention = redondance && !proc.portsRedondance && !pairesBrompton;
  // Numéro et libellé d'un port principal (rang p) et de son secours.
  const portEtSecours = (p, nb) => {
    if (!redondance) return { numero: p, libelle: libellePort(p), secours: null };
    if (proc.portsRedondance) return { numero: p, libelle: libellePort(p), secours: { numero: nb + p, libelle: libellePort(p, true), convention: false } };
    if (pairesBrompton) return { numero: 2 * p - 1, libelle: `port ${2 * p - 1}`, secours: { numero: 2 * p, libelle: `port ${2 * p}`, convention: false } };
    return { numero: p, libelle: libellePort(p), secours: { numero: p + moitie, libelle: `port ${p + moitie}`, convention: true } };
  };
  const mou = 1 + margeMou;

  const limite = redondance && proc.portsRedondance ? proc.portsRedondance : (modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports);
  const utilises = (nb) => (redondance && !proc.portsRedondance ? 2 * nb : nb);
  const modes = ['colonnes', 'rangees', 'auPlusJuste', ...(novaLCT ? ['rectangles'] : [])];
  const variantes = modes.map((mode) => {
    const raisons = [];
    const notes = [];
    const orientation = mode === 'rangees' ? 'rangees' : 'colonnes';
    const processeurs = evaluation.groupes.map((g, i) => {
      const cols = suite(g.premiereColonne, g.derniereColonne);
      const rows = suite(g.premiereRangee, g.derniereRangee);
      const sous = sousMur(m, dalle, g.colonnes, g.premiereRangee, g.rangees);
      let groupes;
      if (mode === 'colonnes') {
        // Mêmes colonnes par port que l'onglet Data : le plus possible, en nombre pair en redondance
        // (sauf s'il coûte un processeur).
        const cBloc = cablage(sous, evaluation.dallesParPort, charge, { pair: evaluation.colonnesPaires });
        const k = cBloc.colonnes.colonnesParPort;
        if (k) {
          groupes = lotsDeColonnes(cols, rows, k, depart);
        } else {
          groupes = segmentsDeColonnes(cols, rows, cBloc.colonnes.segments, depart);
          notes.push(`Processeur n° ${i + 1} : une colonne dépasse la capacité d'un port. Elle est coupée en ${cBloc.colonnes.segments.length} `
            + 'segments égaux : les ports éloignés du bord démarrent au milieu de leur colonne, leur câble de tête longe la colonne.');
        }
      } else if (mode === 'rangees') {
        groupes = groupesRangees(cols, rows, poids, capacite, plafond, depart, { pair: evaluation.colonnesPaires });
      } else if (mode === 'auPlusJuste') {
        groupes = remplirGlouton(serpentin(cols, rows, 'vertical', depart), poids, capacite, plafond);
        if (novaLCT) {
          const trop = groupes.findIndex((grp) => pxRectangleEnglobant(grp, dalle, hauteurs) > capacite + EPS);
          if (trop >= 0) {
            raisons.push(`Au plus juste non réalisable tel quel dans NovaLCT : le port ${trop + 1} du processeur n° ${i + 1} compte le rectangle qui englobe `
              + `ses dalles (${nombreCourt(pxRectangleEnglobant(groupes[trop], dalle, hauteurs))} px), au-delà des `
              + `${nombreCourt(entierInferieur(capacite))} px d'un port. Prends les rectangles NovaLCT.`);
          }
        }
      } else {
        const r = rectanglesNovaLCT(sous, dalle, capacite);
        // Pavage de rectanglesNovaLCT : colonnes regroupées depuis la gauche, rangées depuis le haut ;
        // les ports partent du coin de départ.
        const lotsCols = [];
        for (let k = 0; k < cols.length; k += r.colonnes) lotsCols.push(cols.slice(k, k + r.colonnes));
        const lotsRows = [];
        for (let k = 0; k < rows.length; k += r.rangees) lotsRows.push(rows.slice(k, k + r.rangees));
        const ordreLotsCols = depart.endsWith('gauche') ? lotsCols : [...lotsCols].reverse();
        const ordreLotsRows = depart.startsWith('haut') ? lotsRows : [...lotsRows].reverse();
        groupes = ordreLotsCols.flatMap((lc) => ordreLotsRows.map((lr) => serpentin(lc, lr, 'vertical', depart)));
      }

      const nb = groupes.length;
      if (utilises(nb) > limite) {
        raisons.push(`Le processeur n° ${i + 1} demande ${utilises(nb)} ports${redondance && proc.portsRedondance ? ' principaux' : ''}, `
          + `au-delà des ${limite} d'un ${proc.nom}.`);
      }
      const ports = groupes.map((grp, j) => {
        const px = grp.reduce((s, p) => s + poids(p), 0);
        const trajet = trajetDepuisCoin(m, depart, tuile(grp[0]));
        const base = portEtSecours(j + 1, nb);
        if (base.secours) {
          // Retour de secours le long de la structure ; long quand la chaîne finit loin du bord de départ.
          const derniere = tuile(grp[grp.length - 1]);
          const chemin = cheminSecours(m, depart, derniere, orientation);
          const long = orientation === 'rangees'
            ? Math.abs(chemin[0][0] - chemin[1][0]) > derniere.mm.largeur
            : Math.abs(chemin[0][1] - chemin[1][1]) > derniere.mm.hauteur;
          const murM = longueurCheminM(chemin);
          base.secours = {
            ...base.secours,
            chemin,
            retourM: murM * mou,
            long,
            longueurCuivreM: distanceRegieM === null ? null : (surDistributeur ? murM : distanceRegieM + murM) * mou,
          };
        }
        return {
          ...base,
          dalles: grp.map(([c, r]) => idDalle(c, r)),
          px,
          taux: px / capacite,
          longueurCuivreM: distanceRegieM === null ? null : (surDistributeur ? trajet : distanceRegieM + trajet) * mou,
          fibreM: distanceRegieM !== null && surDistributeur ? distanceRegieM * mou : null,
        };
      });
      return { numero: i + 1, modele: proc.modele, ports };
    });

    const tous = processeurs.flatMap((p) => p.ports);
    const alertes = [];
    const longs = tous.filter((p) => p.longueurCuivreM > LIMITE_CUIVRE_M);
    if (longs.length > 0) {
      alertes.push(`${longs.length} câble${longs.length > 1 ? 's' : ''} de tête en cuivre au-delà de ${LIMITE_CUIVRE_M} m `
        + `(jusqu'à ${nombreCourt(Math.max(...longs.map((p) => p.longueurCuivreM)), 1)} m) : l'Ethernet en cuivre s'arrête à ${LIMITE_CUIVRE_M} m, `
        + `passe en fibre avec des ${fibre} au pied du mur.`);
    }
    const retoursLongs = tous.filter((p) => p.secours?.long).map((p) => p.secours.retourM);
    if (retoursLongs.length > 0) {
      const [min, max] = [Math.min(...retoursLongs), Math.max(...retoursLongs)].map((x) => nombreCourt(x, 1));
      alertes.push(`${retoursLongs.length} port${retoursLongs.length > 1 ? 's finissent' : ' finit'} au bord opposé au départ `
        + `(nombre impair de ${orientation === 'rangees' ? 'rangées' : 'colonnes'}) : retour de secours long, `
        + `${min === max ? `${min} m` : `de ${min} m à ${max} m`} le long de la structure.`);
    }
    return {
      mode,
      libelle: LIBELLES_DATA[mode],
      orientation,
      mention: mode === 'auPlusJuste' ? MENTION_AU_PLUS_JUSTE : null,
      ecart: notes.length ? notes.join(' ') : null,
      possible: raisons.length === 0,
      raison: raisons.length ? raisons.join(' ') : null,
      processeurs,
      ports: tous.length,
      portsSecours: redondance ? tous.length : 0,
      chargeMax: Math.max(...tous.map((p) => p.taux)),
      cablesTete: redondance ? 2 * tous.length : tous.length,
      liaisons: tous.reduce((s, p) => s + p.dalles.length - 1, 0),
      noteSecours: convention
        ? `Secours : port p + ${moitie} sur chaque ${proc.modele} (le secours du port 1 est le port ${1 + moitie}), `
          + 'convention par défaut, à régler dans le logiciel du processeur.'
        : null,
      alertes,
    };
  });
  // Conseil : colonnes entières, comme sur le terrain ; l'au plus juste reste une optimisation.
  return { depart, conseil: 'colonnes', variantes, alertes: [] };
}

const LIBELLES_ELEC = {
  colonnes: 'par colonnes',
  colonnesEquilibre: 'par colonnes, phases équilibrées',
  rangees: 'par rangées',
  auPlusJuste: 'au plus juste',
  auPlusJusteEquilibre: 'au plus juste, phases équilibrées',
};

// Phases des lignes : à tour de rôle (équilibre), ou chaque ligne, des plus chargées aux moins chargées,
// sur la phase la moins chargée (option au minimum de lignes). Monophasé : une seule phase.
function phasesDesLignes(lignes, { equilibre, mono, tensionV, capacitePhaseW }) {
  const nbPhases = mono ? 1 : 3;
  const phases = suite(1, nbPhases).map((numero) => ({ numero, lignes: 0, puissanceW: 0, intensiteA: 0 }));
  const ordre = equilibre || mono ? lignes.map((_, i) => i) : lignes.map((_, i) => i).sort((a, b) => lignes[b].puissanceW - lignes[a].puissanceW || a - b);
  ordre.forEach((i) => {
    let p;
    if (mono) p = phases[0];
    else if (equilibre) p = phases[i % 3];
    else p = phases.reduce((a, b) => (b.puissanceW < a.puissanceW - EPS ? b : a));
    p.lignes += 1;
    p.puissanceW = arrondiW(p.puissanceW + lignes[i].puissanceW);
    lignes[i].phase = p.numero;
  });
  for (const p of phases) p.intensiteA = p.puissanceW / tensionV;
  return { phases, ok: phases.every((p) => p.puissanceW <= capacitePhaseW + EPS) };
}

// Câblage élec : lignes en serpentin depuis le coin de départ, dans chaque variante, avec leur phase.
// `elec` est le résultat de electricite() pour ce mur ; son coin de départ sert par défaut, pour que les lignes
// au plus juste soient celles de l'onglet Élec. Options : depart, distanceArmoireM (facultatif), margeMou (0,10).
export function cablageElec(m, dalle, elec, { depart = elec.reglages.depart ?? 'haut-gauche', distanceArmoireM = null, margeMou = MARGE_MOU_DEFAUT } = {}) {
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(margeMou >= 0)) throw new ErreurSaisie('La marge de mou est positive ou nulle.');
  const dalles = new Map(dallesDuMur(m, dalle).map((d) => [d.id, d]));
  const tuile = ([c, r]) => dalles.get(idDalle(c, r));
  const pDalle = elec.pMax.dalle.valeurW;
  const pDemi = elec.pMax.demi ? elec.pMax.demi.valeurW : pDalle;
  const poids = (p) => (tuile(p).type === 'demi' ? pDemi : pDalle);
  const utileW = elec.ligne.utileW;
  const plafond = elec.dallesParLigne.chainage ?? Infinity;
  const mono = elec.arrivee.type === 'mono';
  const { tensionV } = elec.reglages;
  const capacitePhaseW = elec.arrivee.capacitePhaseW;
  const cols = suite(1, m.colonnes);
  const rows = suite(1, m.rangees.length);
  const c = cablage(m, elec.dallesParLigne.retenu, { capacite: utileW, pxParDalle: pDalle, pxParDemi: pDemi, plafond });
  const serpent = serpentin(cols, rows, 'vertical', depart);

  // Une ligne prend autant de colonnes entières qu'elle en supporte avec la marge choisie ; jamais une colonne
  // coupée, sauf colonne plus lourde qu'une ligne (segments égaux).
  const kmax = c.colonnes.colonnesParPort;
  const coupee = kmax ? null : `Une colonne dépasse une ligne : elle est coupée en ${c.colonnes.segments.length} segments égaux, `
    + 'les lignes éloignées du bord démarrent au milieu de leur colonne.';
  const notes = { colonnes: coupee, colonnesEquilibre: coupee };
  const groupesDe = {
    colonnes: () => (kmax ? lotsDeColonnes(cols, rows, kmax, depart) : segmentsDeColonnes(cols, rows, c.colonnes.segments, depart)),
    // Répartition conseillée de l'onglet Élec en triphasé : mêmes lignes, dans l'ordre depuis le côté de départ.
    colonnesEquilibre: () => lotsDeColonnes(cols, rows, elec.triphase.colonnes.equilibre.lignes.map((l) => l.colonnes), depart),
    rangees: () => groupesRangees(cols, rows, poids, utileW, plafond, depart),
    auPlusJuste: () => remplirGlouton(serpent, poids, utileW, plafond),
    auPlusJusteEquilibre: () => {
      for (let n = elec.triphase.auPlusJuste.equilibre.lignes.length; n <= Math.max(3, serpent.length); n += 3) {
        const groupes = [];
        let avant = 0;
        for (const k of repartir(serpent.length, n)) {
          groupes.push(serpent.slice(avant, avant + k));
          avant += k;
        }
        if (groupes.every((g) => g.length > 0 && g.length <= plafond && g.reduce((s, p) => s + poids(p), 0) <= utileW + EPS)) return groupes;
      }
      return null;
    },
  };
  // Variante équilibrée en colonnes entières seulement quand ses lignes diffèrent du minimum de lignes.
  const tailles = (option) => option?.lignes.map((l) => l.colonnes).join(' ');
  const equilibreDistinct = !mono && kmax && elec.triphase.colonnes.equilibre
    && tailles(elec.triphase.colonnes.equilibre) !== tailles(elec.triphase.colonnes.minimum);
  const modes = mono
    ? ['colonnes', 'rangees', 'auPlusJuste']
    : ['colonnes', ...(equilibreDistinct ? ['colonnesEquilibre'] : []), 'rangees', 'auPlusJuste',
      ...(elec.triphase.auPlusJuste.equilibre ? ['auPlusJusteEquilibre'] : [])];

  const variantes = modes.map((mode) => {
    const groupes = groupesDe[mode]();
    const lignesDetail = groupes.map((grp, i) => {
      const puissanceW = arrondiW(grp.reduce((s, p) => s + poids(p), 0));
      return {
        numero: i + 1,
        phase: null,
        dalles: grp.map(([col, r]) => idDalle(col, r)),
        puissanceW,
        taux: puissanceW / utileW,
        longueurTeteM: distanceArmoireM === null ? null : (distanceArmoireM + trajetDepuisCoin(m, depart, tuile(grp[0]))) * (1 + margeMou),
      };
    });
    // Au plus juste équilibré et rangées : lignes à tour de rôle sur L1, L2 et L3 ; colonnes entières et au plus juste :
    // les plus chargées d'abord sur la phase la moins chargée, comme l'onglet Élec.
    const equilibre = ['auPlusJusteEquilibre', 'rangees'].includes(mode);
    const { phases, ok } = phasesDesLignes(lignesDetail, { equilibre, mono, tensionV, capacitePhaseW });
    const charges = phases.map((p) => p.puissanceW);
    const alertes = ok ? [] : [`Une phase dépasse les ${nombreCourt(capacitePhaseW)} W utiles de l'arrivée : il faut une arrivée plus forte.`];
    return {
      mode,
      libelle: LIBELLES_ELEC[mode],
      orientation: mode === 'rangees' ? 'rangees' : 'colonnes',
      mention: mode.startsWith('auPlusJuste') ? MENTION_AU_PLUS_JUSTE : null,
      ecart: notes[mode] ?? null,
      possible: true,
      raison: null,
      lignesDetail,
      lignes: lignesDetail.length,
      phases,
      ecartPhasesPourcent: mono || Math.max(...charges) === 0 ? null : (100 * (Math.max(...charges) - Math.min(...charges))) / Math.max(...charges),
      ok,
      chargeMax: Math.max(...lignesDetail.map((l) => l.taux)),
      cablesTete: lignesDetail.length,
      liaisons: lignesDetail.reduce((s, l) => s + l.dalles.length - 1, 0),
      alertes,
    };
  });
  // Conseil : en triphasé, l'équilibre des phases en colonnes entières ; en monophasé, le minimum de lignes.
  return { depart, conseil: modes.includes('colonnesEquilibre') ? 'colonnesEquilibre' : 'colonnes', variantes, alertes: [] };
}

// Dalle tournée d'un quart de tour (portrait ↔ paysage), seulement si sa fiche le permet.
export function dalleTournee(dalle) {
  if (dalle.rotationPossible !== true) {
    throw new ErreurSaisie(`La fiche de ${dalle.nom} ne dit pas que la dalle peut tourner : pas de rotation, `
      + 'la dalle reste dans le sens de sa fiche.');
  }
  const s = dalle.sources ?? {};
  return {
    ...dalle,
    id: `${dalle.id}-tournee`,
    nom: `${dalle.nom} (tournée)`,
    largeurMm: dalle.hauteurMm,
    hauteurMm: dalle.largeurMm,
    pxH: dalle.pxV,
    pxV: dalle.pxH,
    demiDalle: null,
    orientation: 'tournee',
    sources: { ...s, largeurMm: s.hauteurMm, hauteurMm: s.largeurMm, pxH: s.pxV, pxV: s.pxH },
  };
}

// Tuiles d'export d'une image : une seule si sa surface tient dans la limite des navigateurs sur iPhone,
// sinon le moins de tuiles possible, chacune sous la limite, sans trou ni chevauchement.
export function tuilesImage(largeurPx, hauteurPx, { surfaceMax = SURFACE_MAX_IMAGE } = {}) {
  if (largeurPx * hauteurPx <= surfaceMax && largeurPx <= COTE_MAX_IMAGE && hauteurPx <= COTE_MAX_IMAGE) {
    return [{ x: 0, y: 0, largeurPx, hauteurPx }];
  }
  let meilleur = null;
  for (let nx = 1; nx <= largeurPx; nx += 1) {
    const l = Math.ceil(largeurPx / nx);
    if (l > COTE_MAX_IMAGE) continue;
    const ny = Math.max(Math.ceil(hauteurPx / Math.floor(surfaceMax / l)), Math.ceil(hauteurPx / COTE_MAX_IMAGE));
    if (!meilleur || nx * ny < meilleur.nx * meilleur.ny) meilleur = { nx, ny };
    if (ny === 1) break;
  }
  const tuiles = [];
  let y = 0;
  for (const h of repartir(hauteurPx, meilleur.ny)) {
    let x = 0;
    for (const l of repartir(largeurPx, meilleur.nx)) {
      tuiles.push({ x, y, largeurPx: l, hauteurPx: h });
      x += l;
    }
    y += h;
  }
  return tuiles;
}

// Motif de la pixel map exportée, à la taille exacte de la zone (le mur, ou le canvas d'un processeur avec son bloc
// en haut à gauche) : fond de chaque dalle en quatre teintes alternées, pour distinguer ses voisines. En option,
// la mire (contour de chaque dalle, diagonales et cercle de chaque dalle, plus deux diagonales et un cercle sur tout
// le bloc, marqués `global`) et les numéros de dalles avec leur premier pixel. Le dessin ne fait que l'afficher.
export function motifPixelMap(zone, { grille = false, cercles = false, diagonales = false, numeros = false } = {}) {
  const largeurPx = zone.canvas ? zone.canvas.largeurPx : zone.largeurPx ?? zone.bloc.largeurPx;
  const hauteurPx = zone.canvas ? zone.canvas.hauteurPx : zone.hauteurPx ?? zone.bloc.hauteurPx;
  const fonds = zone.dalles.map((d) => ({
    id: d.id,
    x: d.x[0],
    y: d.y[0],
    largeur: d.x[1] - d.x[0] + 1,
    hauteur: d.y[1] - d.y[0] + 1,
    teinte: ((d.colonne - 1) % 2) + 2 * ((d.rangee - 1) % 2),
  }));
  const x0 = Math.min(...fonds.map((f) => f.x));
  const y0 = Math.min(...fonds.map((f) => f.y));
  const bloc = { x: x0, y: y0, largeur: Math.max(...fonds.map((f) => f.x + f.largeur)) - x0, hauteur: Math.max(...fonds.map((f) => f.y + f.hauteur)) - y0 };
  const traits = [];
  const ronds = [];
  if (diagonales) {
    for (const f of fonds) {
      traits.push({ x1: f.x, y1: f.y, x2: f.x + f.largeur, y2: f.y + f.hauteur, global: false });
      traits.push({ x1: f.x + f.largeur, y1: f.y, x2: f.x, y2: f.y + f.hauteur, global: false });
    }
    traits.push({ x1: bloc.x, y1: bloc.y, x2: bloc.x + bloc.largeur, y2: bloc.y + bloc.hauteur, global: true });
    traits.push({ x1: bloc.x + bloc.largeur, y1: bloc.y, x2: bloc.x, y2: bloc.y + bloc.hauteur, global: true });
  }
  if (cercles) {
    for (const f of fonds) ronds.push({ cx: f.x + f.largeur / 2, cy: f.y + f.hauteur / 2, r: Math.min(f.largeur, f.hauteur) / 2 - 0.5, global: false });
    ronds.push({ cx: bloc.x + bloc.largeur / 2, cy: bloc.y + bloc.hauteur / 2, r: Math.min(bloc.largeur, bloc.hauteur) / 2 - 0.5, global: true });
  }
  return {
    largeurPx,
    hauteurPx,
    bloc,
    fonds,
    contours: grille ? fonds.map(({ x, y, largeur, hauteur }) => ({ x, y, largeur, hauteur })) : [],
    traits,
    cercles: ronds,
    textes: numeros
      ? fonds.map((f) => ({
        x: f.x + f.largeur / 2, y: f.y + f.hauteur / 2, texte: f.id, detail: `${f.x}, ${f.y}`,
        taille: Math.max(8, Math.round(Math.min(f.largeur, f.hauteur) * 0.16)),
      }))
      : [],
  };
}
