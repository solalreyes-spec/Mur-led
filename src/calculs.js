// Logique de calcul du mur LED : fonctions pures, sans accès à l'interface.
// Règles et données : cahier des charges du projet.
// Les calculs se font en valeurs exactes ; l'arrondi n'intervient qu'à l'affichage.
// Unités internes : millimètres et pixels.

import { nombreCourt } from './format.js';

const EPS = 1e-9;
// « 2 ports », « 1 port ».
const quantite = (n, mot) => `${nombreCourt(n)} ${mot}${n > 1 ? 's' : ''}`;
// Nom court de source au milieu d'une phrase : « aide en ligne Tessera 12.2.5 ».
const minuscule = (texte) => (texte ? `${texte.charAt(0).toLowerCase()}${texte.slice(1)}` : texte);

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
  capaciteCartesPro60Hz10bits: 'min',
  capaciteFibre60Hz10bits: 'min',
  capaciteFibre60Hz12bits: 'min',
  dimensionMaxPortPx: 'min',
  hauteurReduitePortPx: 'min',
  longueurCable5GM: 'min',
  // Latence : la plus longue ; hauteur en rack : la plus haute.
  latenceMinImages: 'max',
  latenceMaxImages: 'max',
  hauteurU: 'max',
  largeurChargeeMinPx: 'max',
  puissanceW: 'max',
  emplacementsSortie: 'min',
  sourceMaxPx: 'min',
  capacite5G60Hz8bits: 'min',
  capacitePort120Hz8bits: 'min',
  capacitePort120Hz10bits: 'min',
  capacitePort240Hz8bits: 'min',
  capacitePort240Hz10bits: 'min',
  capacite5G120Hz8bits: 'min',
  capacite5G120Hz10bits: 'min',
  capacite5G240Hz8bits: 'min',
  capacite5G240Hz10bits: 'min',
  capacite5G60Hz10bits: 'min',
  capacite5G60Hz12bits: 'min',
  capacite5GHaute60Hz8bits: 'min',
  capacite5GHaute60Hz10bits: 'min',
  capacite5GHaute60Hz12bits: 'min',
  capaciteHaute60Hz8bits: 'min',
  capaciteHaute60Hz10bits: 'min',
  capaciteHaute60Hz12bits: 'min',
  entreeMaxLargeurPx: 'min',
  entreeMaxHauteurPx: 'min',
  // Brompton : canvas en ULL, dalles en HFR, ports et chaînage des XD.
  ullHauteurMaxPx: 'min',
  hfrPxMaxDalle: 'min',
  capaciteNominalePort: 'min',
  sortiesAvecSX40: 'min',
  chainageXdMax: 'min',
  // Liaisons vidéo : le format maxi le plus petit
  formatMaxLargeurPx: 'min',
  formatMaxHauteurPx: 'min',
  formatMaxFrequenceHz: 'min',
  debitGbps: 'min',
  horlogeMHz: 'min',
  frequencePixelMaxMHz: 'min',
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
// Une entrée `nonRetenue` (valeur corrigée par le constructeur) reste visible mais ne sert jamais au calcul,
// même plus défavorable.
// Dalle en plusieurs versions (URMIII03 standard ou Black) : chaque entrée propre à une version porte `declinaison` ;
// sans règle de choix, la version par défaut de la fiche (la plus défavorable) est retenue.
export function valeurRetenue(champ, sens, sources = {}, declinaisonDefaut = null) {
  const groupes = [];
  for (const x of champ.valeurs ?? [champ]) {
    const source = decrireSource(x.source, sources);
    const nonRetenue = x.nonRetenue === true;
    const groupe = groupes.find((g) => g.valeur === x.valeur && Boolean(g.nonRetenue) === nonRetenue);
    if (groupe) {
      groupe.sources.push(source);
      if (x.declinaison && !groupe.declinaisons.includes(x.declinaison)) groupe.declinaisons.push(x.declinaison);
    } else {
      groupes.push({ valeur: x.valeur, type: x.type ?? null, sources: [source], declinaisons: x.declinaison ? [x.declinaison] : [], ...(nonRetenue ? { nonRetenue } : {}) });
    }
  }
  for (const g of groupes) g.source = g.sources[0];

  const candidats = groupes.some((g) => !g.nonRetenue) ? groupes.filter((g) => !g.nonRetenue) : groupes;
  let retenue = candidats[0];
  if (sens === 'max') retenue = candidats.reduce((a, b) => (b.valeur > a.valeur ? b : a));
  if (sens === 'min') retenue = candidats.reduce((a, b) => (b.valeur < a.valeur ? b : a));
  const selonVersion = candidats.length > 1 && candidats.every((g) => g.declinaisons.length > 0);
  if (!sens && selonVersion && declinaisonDefaut) retenue = candidats.find((g) => g.declinaisons.includes(declinaisonDefaut)) ?? retenue;
  const conflit = candidats.length > 1;
  return {
    valeur: retenue.valeur,
    source: retenue.source,
    sources: retenue.sources,
    type: retenue.type,
    declinaisons: retenue.declinaisons,
    autres: groupes.filter((g) => g !== retenue),
    conflit,
    selonVersion,
    conflitSansRegle: conflit && !sens && !selonVersion,
    note: champ.note ?? null,
  };
}

// Fiche de la base (dalle ou processeur, valeurs sourcées) → valeurs simples,
// avec le détail des sources dans `sources`. Les champs non sourcés sont recopiés tels quels.
export function resoudreFiche(fiche, sources = {}) {
  const resolue = { sources: {} };
  for (const [nom, champ] of Object.entries(fiche)) {
    if (estSourcee(champ)) {
      const retenue = valeurRetenue(champ, PLUS_DEFAVORABLE[nom], sources, fiche.declinaisonDefaut ?? null);
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
  resolue.declinaisons = fiche.declinaisons ?? null;
  return resolue;
}

// Valeurs en conflit d'une liste de fiches (relevé des sources) : pour chaque champ où plusieurs valeurs servent
// encore, la valeur retenue (la plus défavorable, ou sans règle) et les autres, chacune avec ses sources.
// Une valeur « non retenue » (corrigée par le constructeur) et des valeurs propres à chaque version ne sont pas des conflits.
export function valeursEnConflit(liste, sources = {}, sens = PLUS_DEFAVORABLE) {
  const conflits = [];
  for (const fiche of liste) {
    const nom = resoudreFiche(fiche, sources).nom;
    for (const [champ, valeur] of Object.entries(fiche)) {
      if (!estSourcee(valeur) || !valeur.valeurs) continue;
      const r = valeurRetenue(valeur, sens[champ], sources, fiche.declinaisonDefaut ?? null);
      if (!r.conflit || r.selonVersion) continue;
      const groupe = (g) => ({ valeur: g.valeur, type: g.type ?? null, sources: g.sources });
      conflits.push({
        id: fiche.id, nom, champ, regle: sens[champ] ?? null,
        retenue: groupe(r), autres: r.autres.filter((g) => !g.nonRetenue).map(groupe),
      });
    }
  }
  return conflits;
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

// ---------------------------------------------------------------------------
// Mur en plusieurs zones (étape 9a) : rectangles de dalles côte à côte, de gauche à droite vu de face, séparés par
// un écart réel et, dans la pixel map, par des pixels vides. Une seule dalle pour toutes les zones (mur mixte en 9b).
// ---------------------------------------------------------------------------

export const ZONES_MAX = 12;
// Marques sans règle publiée sur les vides d'un mur (9b, Z18) : recherche du 09/10/2026.
const FAMILLES_SANS_REGLE_VIDES = ['colorlight', 'megapixel', 'linsn', 'kystar', 'mooncell'];
export const NOM_ZONE_MAX = 12;
const MODES_ECARTS = ['reel', 'main', 'colles'];
// Arrondi au pixel le plus proche (84,5 → 85), sans le bruit des nombres à virgule.
const arrondiPx = (x) => Math.floor(x + 0.5 + EPS);
const positifOuNul = (x) => x === undefined || x === null || (Number.isFinite(x) && x >= 0);
const entierPositifOuNul = (x) => Number.isInteger(x) && x >= 0;

// Pas qui convertit des millimètres en pixels : taille de la dalle ÷ ses pixels, en largeur et en hauteur. Le pas de la
// fiche est souvent arrondi (1,9 mm pour 1,953) : avec lui, deux zones posées au sol ne seraient plus alignées en bas
// dans la pixel map. Il reste donné pour mémoire.
function pasDeLaDalle(dalle) {
  return { mm: dalle.largeurMm / dalle.pxH, verticalMm: dalle.hauteurMm / dalle.pxV, ficheMm: dalle.pitchMm > 0 ? dalle.pitchMm : null };
}

// Zones : [{ nom, colonnes, rangees, ecartMm (avec la zone de gauche, à partir de la 2e), basMm (hauteur du bas au-dessus
// du bas le plus bas) }]. Écarts dans la pixel map : 'reel' (écart réel ÷ pas, arrondi), 'main' (ecartsPx entre deux
// zones et, si donné, yPx de chaque zone) ou 'colles' (0 px). Y d'une zone : (haut le plus haut − haut de la zone) ÷ pas.
// Mur : pixel map avec ses vides (pxLargeur, pxHauteur, pxCanvas), pixels utiles des dalles (pxTotal), taille réelle avec
// les écarts. Une seule zone : exactement le mur du mode Dalles, avec la description de sa zone.
export function murZones(dalleMur, zones, { ecarts = 'reel', ecartsPx = [], yPx = null, xPx = null, demi: demiMur = null, mapping = '1:1' } = {}) {
  if (!Array.isArray(zones) || zones.length === 0) throw new ErreurSaisie('Ajoute au moins une zone.');
  if (zones.length > ZONES_MAX) throw new ErreurSaisie(`${ZONES_MAX} zones au plus.`);
  if (!MODES_ECARTS.includes(ecarts)) throw new ErreurSaisie('Choisis les écarts dans la pixel map : comme l\'écart réel, à la main ou zones collées.');
  const noms = [];
  zones.forEach((z, i) => {
    const zone = `Zone ${i + 1}`;
    if (!Number.isInteger(z.colonnes) || z.colonnes < 1) throw new ErreurSaisie(`${zone} : le nombre de colonnes doit être un entier d'au moins 1.`);
    if (!Number.isInteger(z.rangees) || z.rangees < 1) throw new ErreurSaisie(`${zone} : le nombre de rangées doit être un entier d'au moins 1.`);
    const nom = String(z.nom ?? '').trim();
    if (!nom) throw new ErreurSaisie(`${zone} : donne-lui un nom.`);
    if (nom.length > NOM_ZONE_MAX) throw new ErreurSaisie(`${zone} : ${NOM_ZONE_MAX} caractères au plus pour le nom, pour qu'il tienne sur le dessin.`);
    if (noms.includes(nom)) throw new ErreurSaisie(`Deux zones portent le même nom (« ${nom} ») : donne-leur des noms différents.`);
    noms.push(nom);
    if (i > 0 && !positifOuNul(z.ecartMm)) throw new ErreurSaisie(`${zone} : l'écart avec la zone de gauche est un nombre de millimètres positif ou nul.`);
    if (!positifOuNul(z.basMm)) throw new ErreurSaisie(`${zone} : la hauteur du bas est un nombre de millimètres positif ou nul.`);
  });
  // Zones placées au-dessus, en dessous ou librement (9b2) ; sinon, zones côte à côte de la 9a.
  const typePlacement = (z) => z.placement?.type ?? 'droite';
  const placees = zones.some((z) => typePlacement(z) !== 'droite');
  if (ecarts === 'main') {
    for (let i = 1; i < zones.length; i += 1) {
      if (typePlacement(zones[i]) !== 'droite') continue;
      if (!entierPositifOuNul(ecartsPx[i - 1])) throw new ErreurSaisie(`Écart ${i} dans la pixel map : un nombre entier de pixels, positif ou nul.`);
    }
    if (xPx) {
      zones.forEach((z, i) => {
        if (xPx[i] !== null && xPx[i] !== undefined && !entierPositifOuNul(xPx[i])) {
          throw new ErreurSaisie(`Zone ${i + 1} : la position X dans la pixel map est un nombre entier de pixels, positif ou nul.`);
        }
      });
    }
    if (yPx) {
      zones.forEach((z, i) => {
        if (!entierPositifOuNul(yPx[i])) throw new ErreurSaisie(`Zone ${i + 1} : la position Y dans la pixel map est un nombre entier de pixels, positif ou nul.`);
      });
    }
  }

  // Mur mixte (9b3) : une dalle par zone (`dalle`, et sa demi-dalle `demi`) ; sans elle, la dalle du mur.
  const mixte = zones.some((z) => z.dalle && z.dalle.id !== dalleMur.id);
  // Mapping interpolé (Tessera M2 et T1, Z17) : chaque dalle prend sa taille ÷ le pitch le plus fin du mur, en pixels.
  const fichesReelles = [dalleMur, demiMur, ...zones.flatMap((z) => [z.dalle, z.demi])].filter(Boolean);
  const pasInterpole = mixte && mapping === 'interpole' ? pitchLePlusFin(fichesReelles) : null;
  const virtuelles = new Map();
  const virtuelle = (f) => {
    if (!f || !pasInterpole) return f;
    if (!virtuelles.has(f)) {
      const r = pixelsInterpoles(f, pasInterpole);
      virtuelles.set(f, { ...f, pxH: r.pxH, pxV: r.pxV, pxReels: { pxH: f.pxH, pxV: f.pxV } });
    }
    return virtuelles.get(f);
  };
  const dalle = virtuelle(dalleMur);
  const demi = virtuelle(demiMur);
  const ficheDe = (z) => virtuelle(z.dalle ?? dalleMur);
  const demiDe = (z) => virtuelle(z.dalle ? z.demi ?? null : demiMur);
  // Pas de référence (Z15) : le plus fin des pas réels du mur, en largeur et en hauteur ; une seule dalle : son pas (9a).
  const fiches = [dalle, ...zones.flatMap((z) => [ficheDe(z), demiDe(z)])].filter(Boolean);
  const pas = mixte
    ? { mm: Math.min(...fiches.map((f) => f.largeurMm / f.pxH)), verticalMm: Math.min(...fiches.map((f) => f.hauteurMm / f.pxV)), ficheMm: null }
    : pasDeLaDalle(dalle);
  const murs = zones.map((z) => mur(ficheDe(z), z.colonnes, z.rangees));
  // Formes libres (9b) : dalles absentes, colonnes décalées, rangée de demi-dalles ; null pour un rectangle plein.
  const formes = zones.map((z, i) => formeZone(z, noms[i], ficheDe(z), demiDe(z), pas));
  const listeEcarts = [];
  let xMm = 0;
  let x = 0;
  let colonne = 1;
  const description = zones.map((z, i) => {
    const m = murs[i];
    if (i > 0) {
      const mm = z.ecartMm ?? 0;
      const pxCalcule = arrondiPx(mm / pas.mm);
      const px = { main: ecartsPx[i - 1], colles: 0, reel: pxCalcule }[ecarts];
      listeEcarts.push({ entre: [noms[i - 1], noms[i]], mm, px, pxCalcule });
      xMm += mm;
      x += px;
    }
    const f = formes[i];
    const d = {
      index: i, nom: noms[i], colonnes: z.colonnes, lignes: z.rangees, premiereColonne: colonne,
      xMm, basMm: z.basMm ?? 0, largeurMm: m.largeurMm, hauteurMm: f ? f.hauteurMm : m.hauteurMm,
      x, y: 0, pxLargeur: m.pxLargeur, pxHauteur: f ? f.hauteurPx : m.pxHauteur,
      dalles: f ? f.dalles.total : m.dalles.total, pxTotal: f ? f.pxTotal : m.pxTotal,
      ...(f ? { forme: f } : {}),
      ...(mixte ? { dalle: ficheDe(z), demi: demiDe(z) } : {}),
    };
    xMm += m.largeurMm;
    x += m.pxLargeur;
    colonne += z.colonnes;
    return d;
  });
  const saisie = {
    zones: zones.map((z) => ({ ...z })),
    options: { ecarts, ecartsPx: [...ecartsPx], yPx: yPx ? [...yPx] : null, ...(xPx ? { xPx: [...xPx] } : {}), ...(demiMur ? { demi: demiMur } : {}) },
  };
  const avecForme = formes.some(Boolean);
  if (zones.length === 1 && !avecForme && !placees && !mixte) {
    return { ...murs[0], zones: description, ecarts: [], pas, modeEcarts: ecarts, pxCanvas: murs[0].pxTotal, saisie, sauts: [], superposees: [] };
  }

  let hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
  let basMin = Math.min(...description.map((d) => d.basMm));
  if (placees) {
    listeEcarts.length = 0;
    listeEcarts.push(...placerZones(zones, description, { ecarts, ecartsPx, yPx, xPx, pas }));
    hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
    basMin = 0;
    xMm = Math.max(...description.map((d) => d.xMm + d.largeurMm));
    x = Math.max(...description.map((d) => d.x + d.pxLargeur));
  } else {
    description.forEach((d, i) => {
      d.y = ecarts === 'main' && yPx ? yPx[i] : arrondiPx((hautMax - d.basMm - d.hauteurMm) / pas.verticalMm);
    });
  }
  const pxLargeur = x;
  const pxHauteur = Math.max(...description.map((d) => d.y + d.pxHauteur));
  const entieres = description.reduce((s, d) => s + (d.forme ? d.forme.dalles.entieres : d.dalles), 0);
  const nbDemi = description.reduce((s, d) => s + (d.forme ? d.forme.dalles.demi : 0), 0);
  const lignes = Math.max(...zones.map((z) => z.rangees));
  return {
    colonnes: colonne - 1,
    lignes,
    rangeeDemi: false,
    positionDemi: null,
    // Fiche des demi-dalles du mur, dès qu'une zone de la dalle du mur a sa rangée de demi-dalles.
    demi: zones.some((z) => z.rangeeDemi && !(z.dalle && z.dalle.id !== dalleMur.id)) ? demi : null,
    rangees: Array(lignes).fill('entiere'),
    dalles: { entieres, demi: nbDemi, total: entieres + nbDemi },
    largeurMm: xMm,
    hauteurMm: hautMax - basMin,
    pxLargeur,
    pxHauteur,
    // Pixels utiles : les dalles seulement ; la pixel map avec ses vides est pxCanvas.
    pxTotal: description.reduce((s, d) => s + d.pxTotal, 0),
    pxCanvas: pxLargeur * pxHauteur,
    surfaceM2: description.reduce((s, d, i) => s + (d.forme ? d.forme.surfaceM2 : murs[i].surfaceM2), 0),
    // Murs séparés : une diagonale ne veut rien dire.
    diagonaleM: null,
    ratio: ratio(pxLargeur, pxHauteur),
    zones: description,
    ecarts: listeEcarts,
    pas,
    modeEcarts: ecarts,
    saisie,
    sauts: description.flatMap((d) => (d.forme ? sautsForme(d.nom, d.forme) : [])),
    ...(mixte ? { mixte: true, mapping: pasInterpole ? 'interpole' : '1:1', dallePrincipale: dalle, ...(pasInterpole ? { pasInterpole } : {}) } : {}),
    // Zones qui se recouvrent dans la pixel map (posées à la main) : elles affichent la même image.
    superposees: zonesSuperposees(description),
  };
}

const recouvrement = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
function zonesSuperposees(description) {
  const paires = [];
  description.forEach((a, i) => description.slice(i + 1).forEach((b) => {
    if (recouvrement(a.x, a.x + a.pxLargeur, b.x, b.x + b.pxLargeur) && recouvrement(a.y, a.y + a.pxHauteur, b.y, b.y + b.pxHauteur)) paires.push([a.nom, b.nom]);
  }));
  return paires;
}

const ALIGNEMENTS = ['gauche', 'centre', 'droite'];
// Placement des zones (9b2, Z14) : « à droite de » la zone d'avant (9a), « au-dessus de » ou « en dessous de » une zone
// (écart vertical, alignement gauche, centre ou droite, puis décalage), ou « libre » (X et hauteur du bas en mm).
// Positions en mm, ramenées au coin bas gauche du mur ; refus des références inconnues, des boucles et des zones qui se
// chevauchent sur le mur. Pixel map en chaîne, chaque écart arrondi à part : X de la référence + décalage ÷ pas ; Y de la
// référence moins la hauteur de la zone et l'écart (au-dessus), ou plus la hauteur de la référence et l'écart (en dessous) ;
// les zones « à droite de » et « libres » prennent leur Y de la hauteur réelle (9a). À la main : X et Y saisis. Puis le plus
// petit X et le plus petit Y valent 0. Rend les écarts entre zones côte à côte.
function placerZones(zones, description, { ecarts, ecartsPx, yPx, xPx, pas }) {
  const noms = description.map((d) => d.nom);
  const type = (i) => zones[i].placement?.type ?? 'droite';
  const reference = zones.map((z, i) => {
    const p = z.placement ?? {};
    const nom = noms[i];
    const t = type(i);
    if (!['droite', 'dessus', 'dessous', 'libre'].includes(t)) throw new ErreurSaisie(`${nom} : placement inconnu.`);
    if (t === 'droite') return i > 0 ? i - 1 : null;
    if (t === 'libre') {
      if (!positifOuNul(p.xMm) || !positifOuNul(p.basMm)) throw new ErreurSaisie(`${nom} : X et hauteur du bas sont des millimètres positifs ou nuls.`);
      return null;
    }
    if (p.zone === nom) throw new ErreurSaisie(`${nom} : une zone ne se place pas par rapport à elle-même.`);
    const r = noms.indexOf(p.zone);
    if (r < 0) throw new ErreurSaisie(`${nom} : la zone « ${p.zone ?? ''} » n'existe pas.`);
    if (!positifOuNul(p.ecartMm)) throw new ErreurSaisie(`${nom} : l'écart avec la zone de référence est un nombre de millimètres positif ou nul.`);
    if (p.alignement !== undefined && !ALIGNEMENTS.includes(p.alignement)) throw new ErreurSaisie(`${nom} : alignement à gauche, au centre ou à droite.`);
    if (p.decalageMm !== undefined && !Number.isFinite(p.decalageMm)) throw new ErreurSaisie(`${nom} : le décalage est un nombre de millimètres.`);
    return r;
  });
  // Ordre de calcul : chaque zone après sa référence.
  const ordre = [];
  const etat = zones.map(() => 0);
  const visiter = (i, chemin) => {
    if (etat[i] === 2) return;
    if (etat[i] === 1) throw new ErreurSaisie(`Zones ${chemin.map((j) => noms[j]).join(', ')} : placements en boucle, chacune placée par rapport à une autre.`);
    etat[i] = 1;
    if (reference[i] !== null) visiter(reference[i], [...chemin, i]);
    etat[i] = 2;
    ordre.push(i);
  };
  zones.forEach((_, i) => visiter(i, [i]));

  const decalage = (i) => {
    const p = zones[i].placement ?? {};
    const r = description[reference[i]];
    const d = description[i];
    const base = { gauche: 0, centre: (r.largeurMm - d.largeurMm) / 2, droite: r.largeurMm - d.largeurMm }[p.alignement ?? 'gauche'];
    return base + (p.decalageMm ?? 0);
  };
  // Millimètres.
  for (const i of ordre) {
    const d = description[i];
    const z = zones[i];
    const p = z.placement ?? {};
    const r = reference[i] === null ? null : description[reference[i]];
    if (type(i) === 'droite') {
      d.xMm = r ? r.xMm + r.largeurMm + (z.ecartMm ?? 0) : 0;
      d.basMm = z.basMm ?? 0;
    } else if (type(i) === 'libre') {
      d.xMm = p.xMm;
      d.basMm = p.basMm;
    } else {
      d.xMm = r.xMm + decalage(i);
      d.basMm = type(i) === 'dessus' ? r.basMm + r.hauteurMm + (p.ecartMm ?? 0) : r.basMm - (p.ecartMm ?? 0) - d.hauteurMm;
    }
  }
  const xMin = Math.min(...description.map((d) => d.xMm));
  const basMin = Math.min(...description.map((d) => d.basMm));
  for (const d of description) {
    d.xMm -= xMin;
    d.basMm -= basMin;
  }
  description.forEach((a, i) => description.slice(i + 1).forEach((b) => {
    if (recouvrement(a.xMm, a.xMm + a.largeurMm, b.xMm, b.xMm + b.largeurMm) && recouvrement(a.basMm, a.basMm + a.hauteurMm, b.basMm, b.basMm + b.hauteurMm)) {
      throw new ErreurSaisie(`Les zones ${a.nom} et ${b.nom} se chevauchent sur le mur : change leur placement ou leurs écarts.`);
    }
  }));

  // Pixels.
  const hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
  const main = ecarts === 'main';
  const ecartPx = (mm, pasMm) => (ecarts === 'colles' ? 0 : arrondiPx(mm / pasMm));
  const listeEcarts = [];
  for (const i of ordre) {
    const d = description[i];
    const z = zones[i];
    const p = z.placement ?? {};
    const r = reference[i] === null ? null : description[reference[i]];
    const yReel = () => arrondiPx((hautMax - d.basMm - d.hauteurMm) / pas.verticalMm);
    if (type(i) === 'droite') {
      if (r) {
        const mm = z.ecartMm ?? 0;
        const pxCalcule = arrondiPx(mm / pas.mm);
        const px = { main: ecartsPx[i - 1], colles: 0, reel: pxCalcule }[ecarts];
        listeEcarts.push({ entre: [r.nom, d.nom], mm, px, pxCalcule });
        d.x = r.x + r.pxLargeur + px;
      } else d.x = 0;
      d.y = yReel();
    } else if (type(i) === 'libre') {
      d.x = arrondiPx(p.xMm / pas.mm);
      d.y = yReel();
    } else {
      // Alignement en pixels (un mur mixte en 1:1 n'est pas à l'échelle réelle), puis le décalage converti au pas.
      const base = { gauche: 0, centre: arrondiPx((r.pxLargeur - d.pxLargeur) / 2), droite: r.pxLargeur - d.pxLargeur }[p.alignement ?? 'gauche'];
      d.x = r.x + base + arrondiPx((p.decalageMm ?? 0) / pas.mm);
      const ecart = ecartPx(p.ecartMm ?? 0, pas.verticalMm);
      d.y = type(i) === 'dessus' ? r.y - d.pxHauteur - ecart : r.y + r.pxHauteur + ecart;
    }
    if (main && xPx && xPx[i] !== null && xPx[i] !== undefined) d.x = xPx[i];
    if (main && yPx) d.y = yPx[i];
  }
  const x0 = Math.min(...description.map((d) => d.x));
  const y0 = Math.min(...description.map((d) => d.y));
  for (const d of description) {
    d.x -= x0;
    d.y -= y0;
  }
  return listeEcarts;
}

// Forme d'une zone (9b, Z13) : grille colonnes × rangées (rangée 1 en haut, la rangée de demi-dalles comptée avec les
// autres), dalles absentes [colonne, rangée], décalage de chaque colonne vers le haut (mm), rangée de demi-dalles en
// haut ou en bas, avec sa propre fiche. Chaque case a sa place dans la zone (y depuis le haut de la zone, en px et
// en mm). La zone grandit vers le haut de son plus grand décalage. null pour un rectangle plein.
function formeZone(z, nom, dalle, demi, pas) {
  const absentes = z.absentes ?? [];
  const decalages = z.decalagesMm ?? [];
  const avecDemi = Boolean(z.rangeeDemi);
  if (!Array.isArray(absentes) || !Array.isArray(decalages)) throw new ErreurSaisie(`${nom} : forme illisible.`);
  decalages.forEach((mm, j) => {
    if (!positifOuNul(mm)) throw new ErreurSaisie(`${nom} : le décalage de la colonne ${j + 1} est un nombre de millimètres positif ou nul.`);
  });
  if (decalages.length > z.colonnes) throw new ErreurSaisie(`${nom} : plus de décalages que de colonnes.`);
  if (absentes.length === 0 && !decalages.some((mm) => mm > 0) && !avecDemi) return null;
  if (avecDemi) {
    if (z.positionDemi !== undefined && z.positionDemi !== 'haut' && z.positionDemi !== 'bas') {
      throw new ErreurSaisie(`${nom} : la rangée de demi-dalles va en haut ou en bas.`);
    }
    verifierDemi(dalle, demi);
  }
  const types = Array(z.rangees).fill('entiere');
  if (avecDemi) {
    if (z.positionDemi === 'haut') types.unshift('demi');
    else types.push('demi');
  }
  for (const a of absentes) {
    const [c, r] = Array.isArray(a) ? a : [];
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 1 || c > z.colonnes || r < 1 || r > types.length) {
      throw new ErreurSaisie(`${nom} : la dalle C${c} R${r} est hors de la grille (${z.colonnes} colonnes, ${types.length} rangées).`);
    }
  }
  const absente = new Set(absentes.map(([c, r]) => `${c},${r}`));
  if (absente.size >= z.colonnes * types.length) throw new ErreurSaisie(`${nom} : toutes les dalles sont absentes.`);
  const vide = (j) => types.every((_, r) => absente.has(`${j},${r + 1}`));
  for (const j of [1, z.colonnes]) {
    if (vide(j)) throw new ErreurSaisie(`${nom} : la colonne ${j} n'a aucune dalle : retire-la, ou réduis le nombre de colonnes.`);
  }

  const fiche = (t) => (t === 'demi' ? demi : dalle);
  const hPx = types.map((t) => fiche(t).pxV);
  const hMm = types.map((t) => fiche(t).hauteurMm);
  const cumul = (t, r) => t.slice(0, r).reduce((s, h) => s + h, 0);
  const basePx = cumul(hPx, types.length);
  const baseMm = cumul(hMm, types.length);
  const decalageMm = (j) => decalages[j - 1] ?? 0;
  const decalagePx = (j) => arrondiPx(decalageMm(j) / pas.verticalMm);
  const suiteColonnes = suite(1, z.colonnes);
  const hauteurPx = Math.max(...suiteColonnes.map((j) => decalagePx(j) + basePx));
  const hauteurMm = Math.max(...suiteColonnes.map((j) => decalageMm(j) + baseMm));
  const colonnes = suiteColonnes.map((j) => {
    const hautPx = hauteurPx - decalagePx(j) - basePx;
    const hautMm = hauteurMm - decalageMm(j) - baseMm;
    return {
      colonne: j,
      decalageMm: decalageMm(j),
      decalagePx: decalagePx(j),
      cases: types.map((type, r) => ({
        rangee: r + 1, type, presente: !absente.has(`${j},${r + 1}`),
        y: hautPx + cumul(hPx, r), h: hPx[r], yMm: hautMm + cumul(hMm, r), hMm: hMm[r],
      })),
    };
  });
  const presentes = colonnes.flatMap((c) => c.cases.filter((x) => x.presente));
  const nbDemi = presentes.filter((x) => x.type === 'demi').length;
  return {
    types,
    positionDemi: avecDemi ? (z.positionDemi === 'haut' ? 'haut' : 'bas') : null,
    colonnes,
    hauteurPx,
    hauteurMm,
    dalles: { entieres: presentes.length - nbDemi, demi: nbDemi, total: presentes.length },
    pxTotal: presentes.reduce((s, x) => s + fiche(x.type).pxH * fiche(x.type).pxV, 0),
    surfaceM2: presentes.reduce((s, x) => s + (fiche(x.type).largeurMm * fiche(x.type).hauteurMm) / 1e6, 0),
  };
}

// Sauts dans une chaîne (Z22) : dalles absentes entre deux dalles présentes d'une même colonne (une fenêtre).
// Une dalle absente au bord de la colonne n'est pas un saut.
function sautsForme(nom, forme) {
  const sauts = [];
  for (const c of forme.colonnes) {
    const presentes = c.cases.filter((x) => x.presente);
    for (let i = 1; i < presentes.length; i += 1) {
      const [a, b] = [presentes[i - 1], presentes[i]];
      if (b.rangee - a.rangee > 1) {
        const manquantes = c.cases.slice(a.rangee, b.rangee - 1);
        sauts.push({ zone: nom, colonne: c.colonne, entre: [a.rangee, b.rangee], dalles: manquantes.length, mm: manquantes.reduce((s, x) => s + x.hMm, 0) });
      }
    }
  }
  return sauts;
}

// Calcul en zones : plusieurs zones, ou une seule zone de forme libre (une zone rectangulaire seule est le mode Dalles).
const plusieursZones = (m) => (m.zones?.length ?? 0) > 1 || Boolean(m.zones?.[0]?.forme) || Boolean(m.mixte);
// Dalle et demi-dalle d'une zone : les siennes dans un mur mixte (9b3), sinon celles du mur.
const ficheZone = (m, z, dalle) => z.dalle ?? dalle;
const demiZone = (m, z) => (z.dalle ? z.demi ?? null : m.demi);
// Un morceau de mur garde sa dalle et sa demi-dalle (hors JSON), pour la charge de ses ports dans un mur mixte.
function avecFiches(sous, fiche, demi) {
  Object.defineProperty(sous, 'fiche', { value: fiche, enumerable: false });
  Object.defineProperty(sous, 'demiFiche', { value: demi, enumerable: false });
  return sous;
}
const mursDesZones = (m, dalle) => m.zones.map((z) => {
  const f = ficheZone(m, z, dalle);
  return avecFiches(z.forme ? sousForme(z, f, demiZone(m, z), 1, z.colonnes) : mur(f, z.colonnes, z.lignes), f, demiZone(m, z));
});

// Morceau d'une zone de forme libre : ses colonnes a à b (comptées dans la zone), et en option une bande de hauteur,
// cadré sur ses dalles présentes. Mêmes
// champs qu'un mur, plus `forme` : chaque colonne avec ses cases (y depuis le haut du morceau) et `haut`, la place du
// haut du morceau sous le haut de la zone (px).
function sousForme(z, dalle, demi, a, b, bande = null) {
  const fiche = (t) => (t === 'demi' ? demi : dalle);
  // Bande [haut, bas[ (px depuis le haut de la zone, coupes horizontales de Z19) : les dalles hors de la bande n'en font
  // pas partie.
  const dansBande = (x) => !bande || (x.y >= bande[0] && x.y + x.h <= bande[1]);
  const colonnes = z.forme.colonnes.slice(a - 1, b)
    .map((c) => (bande ? { ...c, cases: c.cases.map((x) => (x.presente && !dansBande(x) ? { ...x, presente: false } : x)) } : c));
  const presentes = colonnes.flatMap((c) => c.cases.filter((x) => x.presente));
  const haut = presentes.length ? Math.min(...presentes.map((x) => x.y)) : 0;
  const bas = presentes.length ? Math.max(...presentes.map((x) => x.y + x.h)) : 0;
  const hautMm = presentes.length ? Math.min(...presentes.map((x) => x.yMm)) : 0;
  const basMm = presentes.length ? Math.max(...presentes.map((x) => x.yMm + x.hMm)) : 0;
  const nbDemi = presentes.filter((x) => x.type === 'demi').length;
  const n = b - a + 1;
  return {
    colonnes: n,
    lignes: z.lignes,
    rangees: [...z.forme.types],
    rangeeDemi: z.forme.types.includes('demi'),
    positionDemi: z.forme.positionDemi,
    demi: z.forme.types.includes('demi') ? demi : null,
    dalles: { entieres: presentes.length - nbDemi, demi: nbDemi, total: presentes.length },
    largeurMm: n * dalle.largeurMm,
    hauteurMm: basMm - hautMm,
    pxLargeur: n * dalle.pxH,
    pxHauteur: bas - haut,
    pxTotal: presentes.reduce((s, x) => s + fiche(x.type).pxH * fiche(x.type).pxV, 0),
    surfaceM2: presentes.reduce((s, x) => s + (fiche(x.type).largeurMm * fiche(x.type).hauteurMm) / 1e6, 0),
    forme: {
      haut,
      colonnes: colonnes.map((c, i) => ({ ...c, colonne: i + 1, cases: c.cases.map((x) => ({ ...x, y: x.y - haut })) })),
    },
  };
}
// Hauteur la plus grande que charge un port : celle du mur, ou de la zone la plus haute.
const hauteurPortsPx = (m) => (plusieursZones(m) ? Math.max(...m.zones.map((z) => z.pxHauteur)) : m.pxHauteur);

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
// Megapixel : 12 bits, le plus défavorable du tableau de la page de support (aucune profondeur par défaut publiée).
// Linsn, Kystar et Mooncell : 8 bits, seule profondeur dont la capacité est publiée.
export const BIT_DEPTH_PAR_DEFAUT = { brompton: 12, novastar: 8, colorlight: 8, megapixel: 12, linsn: 8, kystar: 8, mooncell: 8 };
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

// Profondeur réseau que le processeur ne sait pas faire (KU20 en 10 bits, MCTRL300 en 10 bits, Colorlight en 12 bits) :
// la raison, avec sa source ; sinon null.
export function refusBitsReseau(proc, bits) {
  const possibles = proc.bitsReseauPossibles;
  if (!possibles || possibles.includes(bits)) return null;
  const pourquoi = proc.sources?.bitsReseauPossibles?.note;
  // Linsn, Kystar, Mooncell : la profondeur peut exister (10 bits en entrée sur les X8208 et X8212), seule la capacité
  // par port n'est pas publiée.
  if (proc.bitsNonPublies) {
    return `${proc.nom} : capacité ${bits} bits non publiée par ${proc.marque}. Calcul en ${possibles.join(' ou ')} bits seulement (choix du projet).`;
  }
  return `Le ${proc.nom} travaille en ${possibles.join(' ou ')} bits${pourquoi ? ` ; ${pourquoi}` : ''} `
    + `(${proc.sources?.bitsReseauPossibles?.source.court ?? 'sa fiche'}) : pas de calcul en ${bits} bits.`;
}

// Capacité d'un port pour un processeur donné :
//   - valeur de sa fiche à 60 Hz (CX40 Pro, Colorlight, Novastar en 10 et 12 bits), proportionnelle à la fréquence,
//     marquée « déduit » hors 60 Hz ;
//   - MX40 Pro en 10 bits avec cartes Pro : valeur du catalogue (480 000 px), la formule reste visible en note ;
//   - sinon formule de sa marque avec son débit utile (Brompton, Novastar, MX40 Pro, MX20).
// Les valeurs dont la source est « déduit » ou « à confirmer » le restent dans le résultat.
export function capacitePortProcesseur(proc, reglages = {}) {
  const { frequenceHz = 60, bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], ull = false, cartesPro = false, carte = null } = reglages;
  if (![8, 10, 12].includes(bits)) throw new ErreurSaisie('Le bit depth réseau vaut 8, 10 ou 12 bits.');
  if (!(Number.isFinite(frequenceHz) && frequenceHz > 0)) throw new ErreurSaisie('Indique une fréquence supérieure à zéro.');
  const refus = refusBitsReseau(proc, bits);
  if (refus) throw new ErreurSaisie(refus);
  // Megapixel HELIOS : tableau de la page de support, selon le lien des dalles (1G ou 2,5G).
  if (proc.capacitesHelios) {
    const r = capaciteHelios(proc, { frequenceHz, bits, lien: proc.lienPorts ?? '1G' });
    if (!r) throw new ErreurSaisie(`${proc.nom} : ${nombreCourt(frequenceHz)} Hz hors du tableau Megapixel (240 Hz au plus).`);
    return { champ: 'capacitesHelios', capacite: r.capacite, formule: r.formule, deduit: r.deduit, aConfirmer: false, notes: r.notes };
  }
  if (bits === 10 && cartesPro && proc.cartesPro === true && proc.capaciteCartesPro60Hz10bits !== undefined) {
    const reference = proc.capaciteCartesPro60Hz10bits;
    const source = proc.sources?.capaciteCartesPro60Hz10bits;
    const formule = capacitePort(proc.famille, { frequenceHz, bits, cartesPro: true, debitBps: proc.debitUtileBps });
    const notes = [`${nombreCourt(reference)} px à 60 Hz en 10 bits${source?.note ? ` ${source.note}` : ''} (${source?.source.court ?? 'fiche'}) ; `
      + `la formule du débit, ${formuleCapacite(proc.famille, { frequenceHz, bits, cartesPro: true, debitBps: proc.debitUtileBps })}, `
      + `donne ${nombreCourt(entierInferieur(formule))} px, non retenue`];
    if (frequenceHz !== 60) notes.push(`déduit : ${nombreCourt(reference)} px à 60 Hz, proportionnel à la fréquence`);
    return {
      champ: 'capaciteCartesPro60Hz10bits',
      capacite: (reference * 60) / frequenceHz,
      formule: frequenceHz === 60
        ? `${nombreCourt(reference)} px (${source?.source.court ?? 'fiche'}, 60 Hz, 10 bits, cartes Pro)`
        : `${nombreCourt(reference)} × 60 / ${nombreCourt(frequenceHz)}`,
      deduit: frequenceHz !== 60,
      aConfirmer: /à confirmer/.test(source?.source.confiance ?? ''),
      notes,
    };
  }
  // CX40 Pro : capacité haute de la fiche avec les cartes qu'elle nomme (XA50 Pro, CA50E) ; avec une autre carte
  // ou une carte inconnue, la plus basse des fiches.
  const cartesHautes = proc.cartesCapaciteHaute ?? [];
  const hauteExiste = proc[`capaciteHaute60Hz${bits}bits`] !== undefined;
  const haute = Boolean(carte) && cartesHautes.includes(carte) && hauteExiste;
  const champ = haute ? `capaciteHaute60Hz${bits}bits` : `capacitePort60Hz${bits}bits`;
  const notes = [];
  if (cartesHautes.length > 0 && !haute && hauteExiste) {
    notes.push(`carte ${carte ?? 'non précisée'} : capacité la plus basse des fiches (capacité plus haute avec une carte ${cartesHautes.join(' ou ')})`);
  }
  // Colorlight : capacités publiées (ou déduites) à 120 et 240 Hz, pas proportionnelles à la fréquence.
  if (!haute && proc[champ] !== undefined && FREQUENCES_PUBLIEES.some((f) => proc[`capacitePort${f}Hz${bits}bits`] !== undefined)) {
    return capaciteParFrequences(proc, bits, frequenceHz, notes);
  }
  if (proc[champ] !== undefined) {
    const reference = proc[champ];
    const confiance = proc.sources?.[champ]?.source.confiance ?? '';
    if (frequenceHz !== 60) {
      notes.push(`déduit : ${nombreCourt(reference)} px à 60 Hz sur la fiche, proportionnel à la fréquence`);
    }
    if (/déduit|à confirmer/.test(confiance)) notes.push(`${bits} bits : ${confiance}`);
    // Note de la fiche (VX Pro : « en HDR, capacité jusqu'à ÷ 4 »).
    if (proc.sources?.[champ]?.note) notes.push(proc.sources[champ].note);
    return {
      champ,
      capacite: (reference * 60) / frequenceHz,
      formule: frequenceHz === 60
        ? `${nombreCourt(reference)} px (fiche, 60 Hz, ${bits} bits${haute ? `, carte ${carte}` : ''})`
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
    champ: 'debitUtileBps',
    capacite: capacitePort(proc.famille, reglagesFormule),
    formule: formuleCapacite(proc.famille, reglagesFormule),
    deduit: /déduit/.test(confiance),
    aConfirmer: /à confirmer/.test(confiance),
    notes,
  };
}

// Capacité d'un port quand la fiche la donne à plusieurs fréquences (Colorlight : 60, 120 et 240 Hz) : valeur de la
// fréquence publiée ; entre deux fréquences publiées, la plus défavorable des deux proportions ; en dessous de la
// plus basse ou au-dessus de la plus haute, proportionnelle depuis la plus proche. Hors fréquence publiée : déduit.
const FREQUENCES_PUBLIEES = [120, 240];
function capaciteParFrequences(proc, bits, frequenceHz, notes) {
  const points = [60, ...FREQUENCES_PUBLIEES]
    .map((f) => ({ f, champ: `capacitePort${f}Hz${bits}bits` }))
    .filter((p) => proc[p.champ] !== undefined)
    .map((p) => ({ ...p, valeur: proc[p.champ], source: proc.sources?.[p.champ] }));
  const court = (p) => p.source?.source.court ?? 'fiche';
  const deduitSource = (p) => /déduit/.test(p.source?.source.confiance ?? '');
  const exact = points.find((p) => p.f === frequenceHz);
  if (exact) {
    const confiance = exact.source?.source.confiance ?? '';
    if (/déduit|à confirmer/.test(confiance)) notes.push(`${bits} bits à ${exact.f} Hz : ${confiance} (${court(exact)})`);
    if (exact.source?.note) notes.push(exact.source.note);
    return {
      champ: exact.champ,
      capacite: exact.valeur,
      formule: `${nombreCourt(exact.valeur)} px (${court(exact)}, ${exact.f} Hz, ${bits} bits)`,
      deduit: deduitSource(exact),
      aConfirmer: /à confirmer/.test(confiance),
      notes,
    };
  }
  const dessous = points.filter((p) => p.f < frequenceHz).pop() ?? null;
  const dessus = points.find((p) => p.f > frequenceHz) ?? null;
  const candidats = [dessous, dessus].filter(Boolean).map((p) => ({ ...p, capacite: (p.valeur * p.f) / frequenceHz }));
  const retenu = candidats.reduce((a, b) => (b.capacite < a.capacite ? b : a));
  const texte = (p) => `${nombreCourt(p.valeur)} px à ${p.f} Hz (${court(p)})`;
  notes.push(candidats.length > 1
    ? `déduit : la plus défavorable des proportions depuis ${texte(candidats[0])} et depuis ${texte(candidats[1])}`
    : `déduit : ${texte(retenu)}, proportionnel à la fréquence`);
  // En dessous de 60 Hz (50 Hz en Europe) : même logique de débit que la formule Novastar.
  if (frequenceHz < points[0].f) notes.push(`capacité à ${nombreCourt(frequenceHz)} Hz déduite du débit, aucune fiche Colorlight ne la publie`);
  return {
    champ: retenu.champ,
    capacite: retenu.capacite,
    formule: `${nombreCourt(retenu.valeur)} × ${retenu.f} / ${nombreCourt(frequenceHz)}`,
    deduit: true,
    aConfirmer: /à confirmer/.test(retenu.source?.source.confiance ?? ''),
    notes,
  };
}

// Champs obligatoires qui manquent à une fiche processeur. Un modèle incomplet apparaît dans la liste
// mais ne sert à aucun calcul.
export function champsManquants(proc) {
  const manquants = [];
  // Capacités de la fiche pour chaque profondeur que le processeur sait faire (Colorlight : 8 et 10 bits).
  const parFiche = (proc.bitsReseauPossibles ?? [8, 10, 12]).every((b) => proc[`capacitePort60Hz${b}bits`] !== undefined);
  const parFormule = proc.famille in DEBIT_UTILE_BPS && proc.debitUtileBps > 0;
  const parTableau = Array.isArray(proc.capacitesHelios) && proc.capacitesHelios.length > 0;
  if (!parFiche && !parFormule && !parTableau) manquants.push('capacite');
  // MX2000 Pro, MX6000 Pro : les ports viennent des cartes de sortie. Série H : ports, pixels, largeur et hauteur
  // viennent des cartes d'envoi LED.
  const portsParCartes = proc.emplacementsSortie > 0 && Boolean(proc.carteSortie1G || proc.carteSortie5G);
  const toutParCartes = proc.emplacementsSortie > 0 && proc.cartesSortieLED?.length > 0;
  for (const champ of ['pixelsMax', 'ports', 'largeurMaxPx', 'hauteurMaxPx']) {
    if (toutParCartes || (champ === 'ports' && portsParCartes)) continue;
    // HELIOS 8K et 4K : ports donnés par les switches, sur leurs sorties 10G. HELIOS Jr : pixels maxi calculés par
    // ses ports (capacité de charge LED), distincts de son canvas d'entrée.
    if (champ === 'ports' && proc.sorties10G > 0) continue;
    if (champ === 'pixelsMax' && proc.pixelsMaxParPorts) continue;
    if (!(proc[champ] > 0)) manquants.push(champ);
  }
  return manquants;
}

// Série H (Novastar), X100 Pro et Z8t (Colorlight) : processeur vu avec la carte de sortie choisie (`choix` : son
// identifiant). Par défaut : la carte qui accepte la carte de réception des dalles (carte 5G), sinon la première carte
// qui ne soit pas 5G si la carte des dalles est connue, sinon la première de la liste. Ports = emplacements × ceux
// d'une carte ; pixels plafonnés par l'appareil quand sa fiche le donne. Largeur et hauteur maxi d'une carte : zone
// de chaque carte (le mur se répartit entre les cartes comme entre les ports, `cartesParZones`) ; l'appareil prend
// celles de sa fiche (Z8t : 16 384 × 8192), sinon toutes ses cartes côte à côte. H_16xRJ45+2xfiber : fibre en copie des ports (CVT4K si fibre). Cartes fibre (H_4xfiber, 2 × 10G du
// X100 Pro, 4 × 10G du Z8t) : convertisseurs obligatoires. Fibres ou ports de secours dédiés : ports principaux
// comptés en redondance, secours par des convertisseurs miroirs.
function processeurAvecCartesLED(proc, choix, dalle) {
  const cartes = proc.cartesSortieLED;
  const norme = (x) => String(x).replace(/[\s-]+/g, '').toUpperCase();
  const carteDalle = dalle?.carteReceptionModele ?? null;
  const alertes = [];
  let carte = cartes.find((c) => c.id === choix);
  if (!carte) {
    const acceptee = carteDalle ? cartes.find((c) => c.cartesReception?.some((x) => norme(x) === norme(carteDalle))) : null;
    carte = acceptee ?? (carteDalle ? cartes.find((c) => c.typePorts !== '5G') : null) ?? cartes[0];
    const autre = cartes.find((c) => c.typePorts !== '5G' && c !== carte);
    if (!carteDalle && carte.typePorts === '5G' && autre) {
      alertes.push(`Carte de réception inconnue : cartes de sortie ${carte.nomCourt} (ports 5G) par défaut sur le ${proc.modele} ; `
        + `choisis ${autre.nomCourt} si les dalles ont des cartes 1G.`);
    }
  }
  const n = proc.emplacementsSortie;
  const source = proc.sources?.cartesSortieLED;
  const pixelsCartes = n * carte.pixelsMax;
  // Largeur et hauteur de l'appareil absentes de sa fiche : ses cartes côte à côte, déduit.
  const coteACote = (note) => ({
    ...source,
    source: { ...source?.source, court: `${source?.source.court ?? 'fiche'}, déduit : cartes côte à côte`, confiance: 'déduit' },
    note,
  });
  const plafond = proc.pixelsMax > 0 && proc.pixelsMax < pixelsCartes;
  const effectif = {
    ...proc,
    sources: {
      ...proc.sources,
      ports: source,
      pixelsMax: plafond ? proc.sources?.pixelsMax : source,
      largeurMaxPx: proc.largeurMaxPx ? proc.sources?.largeurMaxPx : coteACote(`${n} cartes de ${carte.largeurMaxPx} px de large`),
      hauteurMaxPx: proc.hauteurMaxPx ? proc.sources?.hauteurMaxPx : coteACote(`${n} cartes de ${carte.hauteurMaxPx} px de haut`),
      sortiesFibre: carte.sortiesFibre ? { ...source, note: carte.noteFibre ?? null } : undefined,
    },
    ports: n * carte.ports,
    pixelsMax: plafond ? proc.pixelsMax : pixelsCartes,
    largeurMaxPx: proc.largeurMaxPx ?? n * carte.largeurMaxPx,
    hauteurMaxPx: proc.hauteurMaxPx ?? n * carte.hauteurMaxPx,
    sortiesFibre: carte.sortiesFibre ?? null,
    distributeur: carte.convertisseur ?? null,
    sortiesParDistributeur: carte.portsParConvertisseur ?? null,
    distributeurObligatoire: Boolean(carte.convertisseurObligatoire),
    carteSortie: { ...carte, portsParCarte: carte.ports },
  };
  if (carte.portsSecours) effectif.portsRedondance = n * carte.ports;
  // Un port ne dépasse jamais la zone de sa carte.
  const zone = Math.min(carte.largeurMaxPx, carte.hauteurMaxPx);
  if (!(proc.dimensionMaxPortPx <= zone) || carte.typePorts === '5G') {
    effectif.dimensionMaxPortPx = zone;
    effectif.sources.dimensionMaxPortPx = { ...source, note: `zone d'une carte ${carte.nomCourt}` };
  }
  if (carte.typePorts === '5G') {
    // Ports 5G : capacité 5G de la fiche, cartes de réception 5G seulement ; pas de limite de 4096 px (ports 1G).
    effectif.typePorts = '5G';
    for (const f of [60, ...FREQUENCES_PUBLIEES]) {
      for (const b of [8, 10, 12]) {
        effectif[`capacitePort${f}Hz${b}bits`] = proc[`capacite5G${f}Hz${b}bits`];
        effectif.sources[`capacitePort${f}Hz${b}bits`] = proc.sources?.[`capacite5G${f}Hz${b}bits`];
      }
    }
    effectif.cartesCompatibles = carte.cartesReception ?? proc.cartesCompatibles5G;
  }
  if (carte.fibre) {
    // Capacité 10 et 12 bits d'une fibre de la série H : non chiffrée sur la fiche.
    if (proc.capaciteFibre60Hz10bits !== undefined) {
      for (const b of [10, 12]) {
        effectif[`capacitePort60Hz${b}bits`] = proc[`capaciteFibre60Hz${b}bits`];
        effectif.sources[`capacitePort60Hz${b}bits`] = proc.sources?.[`capaciteFibre60Hz${b}bits`];
      }
    }
    const conversion = proc.sources?.conversionFibre;
    const modele = MODELES_DISTRIBUTEUR[carte.convertisseur] ?? 'convertisseur';
    const detail = proc.conversionFibre ?? (carte.portsConvertisseur && carte.portsConvertisseur !== carte.portsParConvertisseur
      ? `un ${modele} par fibre, ${carte.portsParConvertisseur} ports utilisés sur ${carte.portsConvertisseur}` : `un ${modele} par fibre, obligatoire`);
    const origine = conversion ?? source;
    alertes.push(`Carte ${carte.nomCourt} du ${proc.modele} : ${carte.fibres > 1 ? `${carte.fibres} fibres de ${carte.portsParConvertisseur} ports chacune`
      : `1 fibre de ${carte.portsParConvertisseur} ports`} ; ${detail}${carte.noteFibre && !conversion ? ` ; ${carte.noteFibre}` : ''}`
      + ` (${origine?.source.court ?? 'fiche'}${/déduit/.test(origine?.source.confiance ?? '') ? ', déduit' : ''}).`);
  }
  if (carte.ancienneFiche) alertes.push(`Carte ${carte.nomCourt} du ${proc.modele} : ancienne version de fiche, ${carte.ancienneFiche}.`);
  return { proc: effectif, alerte: alertes };
}

// MX2000 Pro, MX6000 Pro : processeur vu avec ses cartes de sortie. Carte des dalles 5G (CA50E, XA50 Pro…) :
// cartes 1 × 40G et CVT8-5G ; sinon cartes 4x10G et CVT10 (carte inconnue : 4x10G, avec une alerte).
// `choix` : 'auto', '4x10g', '1x40g' ou '8x5g-base-t' (MX6000 Pro seulement, manuel V1.5.1 : 8 ports 5G en cuivre,
// en direct, sans CVT8-5G ; plafond de la carte selon la profondeur, fixe hors 60 Hz, déduit).
// Ports = emplacements × ports d'une carte (convertisseurs par carte × ports par convertisseur, ou ports en direct).
function processeurAvecCartes(proc, dalle, choix = 'auto', { bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], frequenceHz = 60 } = {}) {
  const c1 = proc.carteSortie1G ?? null;
  const c5 = proc.carteSortie5G ?? null;
  const cb = proc.carteSortie5GBaseT ?? null;
  const carteDalle = dalle.carteReceptionModele ?? null;
  const dalle5G = Boolean(carteDalle && c5?.cartesReception?.includes(carteDalle));
  let carte = dalle5G ? c5 : (c1 ?? c5);
  if (choix === '4x10g' && c1) carte = c1;
  if (choix === '1x40g' && c5) carte = c5;
  if (choix === '8x5g-base-t' && cb) carte = cb;
  const alertes = [];
  if ((!choix || choix === 'auto') && !carteDalle && c1 && c5) {
    alertes.push(`Carte de réception inconnue : cartes de sortie ${c1.nomCourt} (ports 1G, CVT10) par défaut ; choisis ${c5.nomCourt} si les dalles ont des cartes 5G.`);
  }
  if (choix === '8x5g-base-t' && !cb) {
    alertes.push(`Carte MX_8×5G_Base-T : non confirmée sur le ${proc.modele} (sa page officielle ne liste que la MX_4x10G), à vérifier ; carte ${carte.nomCourt} retenue.`);
  }
  const cle = { [c1?.id]: 'carteSortie1G', [c5?.id]: 'carteSortie5G', [cb?.id]: 'carteSortie5GBaseT' }[carte.id];
  const portsParCarte = carte.ports ?? carte.convertisseursParCarte * carte.portsParConvertisseur;
  const effectif = {
    ...proc,
    sources: { ...proc.sources, ports: proc.sources?.[cle], sortiesParDistributeur: proc.sources?.[cle] },
    ports: proc.emplacementsSortie * portsParCarte,
    typePorts: carte.typePorts,
    distributeur: carte.convertisseur ?? undefined,
    sortiesParDistributeur: carte.convertisseur ? carte.portsParConvertisseur : undefined,
    distributeurObligatoire: Boolean(carte.convertisseur),
    carteSortie: carte,
  };
  // Plafond d'une carte (manuel MX6000 Pro V1.5.1) : MX_4x10G 17 694 720 px en 8 et 10 bits, 13 194 440 en 12 bits ;
  // 1 × 40G et 8×5G Base-T 17 694 720 et 11 804 800 ; MX2000 Pro, mêmes cartes (déduit). Hors 60 Hz, la capacité
  // d'un port suit la fréquence mais le plafond reste fixe (déduit).
  const notes = [];
  const cleCarte = carte.pixelsMaxCarte ? cle : (carte === c1 ? 'pixelsMaxCarte1G' : 'pixelsMaxCarte5G');
  const plafondCarte = (carte.pixelsMaxCarte ?? proc[cleCarte])?.[bits];
  if (plafondCarte) {
    const s = proc.sources?.[cleCarte];
    const origine = [minuscule(s?.source.court), s?.note?.split(' :')[0]].filter(Boolean).join(', ') || 'fiche';
    notes.push(`Carte ${carte.nom} : ${nombreCourt(plafondCarte)} px au plus par carte en ${bits} bits (${origine})`
      + `${Math.abs(frequenceHz - 60) > EPS ? `, valeur à 60 Hz gardée à ${nombreCourt(frequenceHz)} Hz : déduit` : ''}.`);
  }
  if (plafondCarte) effectif.carteSortie = { ...effectif.carteSortie, pixelsMax: plafondCarte, portsParCarte };
  // MX6000 Pro : zone de 16 384 px par carte de sortie ; l'appareil, ses cartes côte à côte (déduit).
  const zone = proc.zoneCarteSortiePx;
  if (zone) {
    const source = proc.sources?.zoneCarteSortiePx;
    const coteACote = (note) => ({
      ...source, source: { ...source?.source, court: `${source?.source.court ?? 'fiche'}, déduit : cartes côte à côte`, confiance: 'déduit' }, note,
    });
    effectif.carteSortie = { ...carte, portsParCarte, largeurMaxPx: zone, hauteurMaxPx: zone, ...(plafondCarte ? { pixelsMax: plafondCarte } : {}) };
    effectif.largeurMaxPx = proc.emplacementsSortie * zone;
    effectif.hauteurMaxPx = proc.emplacementsSortie * zone;
    effectif.sources.largeurMaxPx = coteACote(`${proc.emplacementsSortie} cartes de ${zone} px de large`);
    effectif.sources.hauteurMaxPx = coteACote(`${proc.emplacementsSortie} cartes de ${zone} px de haut`);
    if (!(proc.dimensionMaxPortPx <= zone)) effectif.dimensionMaxPortPx = zone;
  }
  if (carte.typePorts === '5G') {
    // Ports 5G : capacité de la fiche selon la carte de réception, comme le CX40 Pro ; pas de règle des 128 px (1G).
    for (const b of [8, 10, 12]) {
      effectif[`capacitePort60Hz${b}bits`] = proc[`capacite5G60Hz${b}bits`];
      effectif.sources[`capacitePort60Hz${b}bits`] = proc.sources?.[`capacite5G60Hz${b}bits`];
      effectif[`capaciteHaute60Hz${b}bits`] = proc[`capacite5GHaute60Hz${b}bits`];
      effectif.sources[`capaciteHaute60Hz${b}bits`] = proc.sources?.[`capacite5GHaute60Hz${b}bits`];
    }
    effectif.cartesCapaciteHaute = proc.cartes5GCapaciteHaute;
    effectif.cartesCompatibles = carte.cartesReception ?? c5.cartesReception;
    // Règle des 128 px sur les ports 5G : manuel MX6000 Pro V1.5.1 (p. 49) ; MX2000 Pro par analogie (déduit).
    if (proc.largeurChargeeMinPx5G) {
      effectif.largeurChargeeMinPx = proc.largeurChargeeMinPx5G;
      effectif.sources.largeurChargeeMinPx = proc.sources?.largeurChargeeMinPx5G;
    } else delete effectif.largeurChargeeMinPx;
  }
  return { proc: effectif, alerte: alertes, notes };
}

// Carte de réception connue de la base : les dimensions de la dalle face à la capacité d'une carte à la profondeur
// choisie (une carte par dalle). IC de la dalle inconnu : capacité IC classiques, la plus basse ; seulement IC PWM
// sur la fiche : contrôle sur cette valeur, la plus haute, signalé. Profondeur absente de la fiche : signalée, sans
// contrôle. Carte absente de la base : null. Jamais de refus, une alerte.
export function controleCarteReception(dalle, cartes, bits) {
  const modele = dalle?.carteReceptionModele;
  if (!modele || !cartes?.length) return null;
  const norme = (x) => String(x).toLowerCase().replace(/[\s-]+/g, '');
  const carte = cartes.find((c) => norme(c.modele) === norme(modele));
  if (!carte) return null;
  // Capacité sans profondeur (R2+ de Brompton : 262 144 px) : valable à toutes les profondeurs.
  const aBits = (carte.capacites ?? []).filter((c) => c.bits === bits || c.bits === undefined);
  if (aBits.length === 0) {
    return { carte, capacite: null, ok: null, alerte: `Carte de réception ${carte.modele} : capacité en ${bits} bits non précisée sur sa fiche, pas de contrôle.` };
  }
  const pwm = aBits.find((c) => c.ic === 'PWM');
  const classique = aBits.find((c) => c.ic === 'classique');
  let capacite = aBits.find((c) => !c.ic) ?? null;
  let note = null;
  if (!capacite && dalle.typeIC) capacite = aBits.find((c) => c.ic === dalle.typeIC) ?? null;
  if (!capacite && classique) {
    capacite = classique;
    if (pwm) note = `IC inconnu : capacité IC classiques retenue, la plus basse (${pwm.largeurPx} × ${pwm.hauteurPx} px avec IC PWM)`;
  }
  if (!capacite) {
    capacite = pwm;
    note = 'IC classiques non précisés sur la fiche : contrôle sur la valeur IC PWM, la plus haute';
  }
  let ok;
  let texte;
  if (capacite.pixels) {
    // Capacité en pixels (R2+) : le total de la dalle face à celui de la carte.
    const px = dalle.pxH * dalle.pxV;
    ok = px <= capacite.pixels;
    texte = `Carte de réception ${carte.modele} : ${nombreCourt(capacite.pixels)} px par carte ; `
      + `la dalle ${dalle.nom} fait ${dalle.pxH} × ${dalle.pxV} = ${nombreCourt(px)} px (une carte par dalle)`;
  } else {
    ok = dalle.pxH <= capacite.largeurPx && dalle.pxV <= capacite.hauteurPx;
    const ic = capacite.ic ? ` (IC ${capacite.ic === 'PWM' ? 'PWM' : 'classiques'})` : '';
    texte = `Carte de réception ${carte.modele} en ${bits} bits${ic} : ${capacite.largeurPx} × ${capacite.hauteurPx} px par carte ; `
      + `la dalle ${dalle.nom} fait ${dalle.pxH} × ${dalle.pxV} px (une carte par dalle)`;
  }
  return {
    carte, capacite, ok, note, texte,
    alerte: ok ? null : `${texte} : dépassé, vérifie la carte ou le câblage des modules${note ? `. ${note}` : ''}.`,
  };
}

// Marque de carte de réception → famille de processeurs qui la pilote (COEX est une gamme Novastar).
// Une autre marque connue (Megapixel, Linsn…) ne correspond à aucune famille de la base.
const NOMS_FAMILLE_CARTE = {
  brompton: 'Brompton', novastar: 'Novastar', colorlight: 'Colorlight', megapixel: 'Megapixel', linsn: 'Linsn', kystar: 'Kystar', mooncell: 'Mooncell',
};
export function familleDeCarte(marque) {
  const m = String(marque ?? '').trim().toLowerCase();
  if (!m) return null;
  if (m.includes('novastar') || m.includes('coex')) return 'novastar';
  if (m.includes('brompton') || m.includes('tessera')) return 'brompton';
  if (m.includes('colorlight')) return 'colorlight';
  if (m.includes('megapixel') || m === 'mvr') return 'megapixel';
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

// COEX, ports 1G : la capacité d'un port n'est entière que si la largeur chargée (largeur du rectangle que le port
// charge dans le canvas) fait au moins 128 px ; en dessous, elle perd (128 − largeur) × hauteur pixels.
export function penaliteLargeurChargee(largeurPx, hauteurPx, minPx) {
  return minPx ? Math.max(0, minPx - largeurPx) * hauteurPx : 0;
}

// Réduction d'un groupe de dalles [colonne, rangée] : rectangle englobant, hauteur des rangées du (sous-)mur.
function penaliteGroupe(charge, rangees) {
  if (!charge?.largeurMinPx) return null;
  const hauteurs = rangees.map((type) => (type === 'demi' ? charge.pxHauteurDemi : charge.pxHauteurDalle));
  return (positions) => {
    const cs = positions.map((x) => x[0]);
    const rs = positions.map((x) => x[1]);
    const largeur = (Math.max(...cs) - Math.min(...cs) + 1) * charge.largeurDallePx;
    let hauteur = 0;
    for (let r = Math.min(...rs); r <= Math.max(...rs); r += 1) hauteur += hauteurs[r - 1];
    return penaliteLargeurChargee(largeur, hauteur, charge.largeurMinPx);
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
  // COEX 1G : un port qui charge moins de 128 px de large perd de la capacité (rectangle chargé).
  const lmin = charge?.largeurMinPx ?? 0;
  const penalite = (largeur, hauteur) => penaliteLargeurChargee(largeur, hauteur, lmin);
  // Colorlight : la zone d'un port ne dépasse pas 4096 px de large ni de haut.
  const dmax = charge?.dimensionMaxPx ?? Infinity;
  const tientRect = (e, d, largeur, hauteur) => tient(e, d)
    && (dmax === Infinity || (largeur <= dmax && hauteur <= dmax))
    && (!lmin || modele.px(e, d) + penalite(largeur, hauteur) <= charge.capacite + EPS);
  const wDalle = charge?.largeurDallePx ?? 0;
  const hauteurSegment = (n, avecDemi) => (avecDemi ? (n - 1) * charge.pxHauteurDalle + charge.pxHauteurDemi : n * (charge?.pxHauteurDalle ?? 0));
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
  if (tientRect(entieresParColonne, demiParColonne, wDalle, m.pxHauteur)) {
    let kmax = 1;
    while (kmax < m.colonnes && tientRect((kmax + 1) * entieresParColonne, (kmax + 1) * demiParColonne, (kmax + 1) * wDalle, m.pxHauteur)) kmax += 1;
    const k = pair && kmax >= 2 ? kmax - (kmax % 2) : kmax;
    colonnes = {
      colonnesParPort: k,
      colonnesParPortMax: kmax,
      segments: [parColonne],
      ports: Math.ceil(m.colonnes / k),
      dallesMaxParPort: k * parColonne,
      pxMaxParPort: modele.px ? pxPort(k * entieresParColonne, k * demiParColonne) + penalite(k * wDalle, m.pxHauteur) : null,
    };
  } else {
    const indexDemi = (s) => (demiParColonne ? (m.positionDemi === 'haut' ? 0 : s - 1) : -1);
    let tailles = null;
    let s = 2;
    for (; s <= parColonne; s += 1) {
      const essai = repartir(parColonne, s);
      if (essai.every((n, i) => (i === indexDemi(s) ? tientRect(n - 1, 1, wDalle, hauteurSegment(n, true)) : tientRect(n, 0, wDalle, hauteurSegment(n, false))))) {
        tailles = essai;
        break;
      }
    }
    if (!tailles) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
    const pxSegments = tailles.map((n, i) => (i === indexDemi(s)
      ? pxPort(n - 1, 1) + penalite(wDalle, hauteurSegment(n, true)) : pxPort(n, 0) + penalite(wDalle, hauteurSegment(n, false))));
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

// Géométrie de la zone d'un port, pour les processeurs qui la limitent : réduction « largeur chargée » (COEX 1G)
// et largeur ou hauteur maxi d'une zone de port (Colorlight : 4096 px, fiche S20) ; rien pour les autres.
function chargeGeometrie(proc, dalle, m) {
  if (!proc.largeurChargeeMinPx && !proc.dimensionMaxPortPx) return {};
  return {
    ...(proc.largeurChargeeMinPx ? { largeurMinPx: proc.largeurChargeeMinPx } : {}),
    ...(proc.dimensionMaxPortPx ? { dimensionMaxPx: proc.dimensionMaxPortPx } : {}),
    largeurDallePx: dalle.pxH,
    pxHauteurDalle: dalle.pxV,
    pxHauteurDemi: m.demi?.pxV ?? dalle.pxV,
  };
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

// Cartes de sortie pour un nombre de ports : par ports d'une carte (série H), sinon par convertisseurs (MX2000 Pro, MX6000 Pro).
// Cartes de sortie d'un bloc sans zones (MX2000 Pro) : par les ports, et par le plafond d'une carte quand il est connu.
function cartesPour(proc, ports, px = 0) {
  const carte = proc.carteSortie;
  const parPixels = carte.pixelsMax ? Math.ceil(px / carte.pixelsMax - EPS) : 0;
  if (carte.portsParCarte) return Math.max(Math.ceil(ports / carte.portsParCarte), parPixels);
  return Math.max(Math.ceil(Math.ceil(ports / proc.sortiesParDistributeur) / carte.convertisseursParCarte), parPixels);
}

// Cartes de sortie d'un bloc quand chaque carte a sa zone (série H, X100 Pro, Z8t) : les ports, dans l'ordre du
// câblage en colonnes entières, vont sur une carte tant qu'elle a des ports libres, que ses pixels suffisent et que la
// zone qu'elle charge reste dans sa largeur et sa hauteur maxi ; sinon sur la carte suivante. En redondance sans
// secours dédiés, les secours occupent la moitié des ports d'une carte. Renvoie le nombre de ports principaux de
// chaque carte (les convertisseurs se comptent carte par carte), ou null si un port seul dépasse une carte.
// Ports répartis sur les cartes de sortie, dans l'ordre du câblage : chaque carte prend des ports qui se suivent.
// D'abord le moins de cartes (chaque carte prend autant de ports qu'elle peut) ; puis, quand `sorties` est donné
// (MX2000 Pro, MX6000 Pro : CVT10 de 10 ports), la répartition au même nombre de cartes qui demande le moins de
// convertisseurs, comptés carte par carte (groupes complets d'abord, à égalité les premières cartes les plus pleines).
// `zones` : une zone par port ; `fusion(a, b)` : la zone qui contient a et b ; `tient(z, n)` : n ports de zone z sur une
// carte. Renvoie le nombre de ports de chaque carte, ou null si un port seul ne tient pas sur une carte.
function repartirSurCartes(zones, fusion, tient, { sorties = null, facteur = 1 } = {}) {
  const cartes = [];
  let zone = null;
  for (const z of zones) {
    const essai = zone && fusion(zone, z);
    if (essai && tient(essai, cartes[cartes.length - 1] + 1)) {
      zone = essai;
      cartes[cartes.length - 1] += 1;
    } else {
      if (!tient(z, 1)) return null;
      zone = z;
      cartes.push(1);
    }
  }
  if (!sorties || cartes.length < 2) return cartes;
  // Plus longue suite de ports qui tient sur une carte à partir de chaque port (les limites ne font que croître).
  const n = zones.length;
  const longueur = zones.map((z, a) => {
    let b = a + 1;
    for (let union = z; b < n; b += 1) {
      const essai = fusion(union, zones[b]);
      if (!tient(essai, b - a + 1)) break;
      union = essai;
    }
    return b - a;
  });
  const k = cartes.length;
  const cout = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const choix = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(null));
  cout[0][n] = 0;
  for (let j = 1; j <= k; j += 1) {
    for (let a = n - 1; a >= 0; a -= 1) {
      for (let b = a + longueur[a]; b > a; b -= 1) {
        const total = Math.ceil((facteur * (b - a)) / sorties) + cout[j - 1][b];
        if (total < cout[j][a]) {
          cout[j][a] = total;
          choix[j][a] = b;
        }
      }
    }
  }
  if (!Number.isFinite(cout[k][0])) return cartes;
  const repartition = [];
  for (let j = k, a = 0; j >= 1; j -= 1) {
    const b = choix[j][a];
    repartition.push(b - a);
    a = b;
  }
  return repartition;
}

// Rectangle (en pixels) chargé par chaque port d'un sous-mur placé en (ox, oy), dans l'ordre du câblage en colonnes
// entières : k colonnes par port, ou chaque segment d'une colonne trop haute.
function rectanglesPorts(sous, c, dalle, ox = 0, oy = 0) {
  if (sous.forme) return rectanglesPortsForme(sous, c, dalle, ox, oy);
  const hauteurs = sous.rangees.map((t) => (t === 'demi' ? sous.demi.pxV : dalle.pxV));
  const pxRangees = sous.rangees.map((t) => (t === 'demi' ? sous.demi.pxH * sous.demi.pxV : dalle.pxH * dalle.pxV));
  const debut = hauteurs.map((_, r) => hauteurs.slice(0, r).reduce((x, y) => x + y, 0));
  const somme = (t, a, b) => t.slice(a, b + 1).reduce((x, y) => x + y, 0);
  const rectangle = (c0, c1, r0, r1) => ({
    x0: ox + c0 * dalle.pxH, x1: ox + (c1 + 1) * dalle.pxH - 1, y0: oy + debut[r0], y1: oy + debut[r1] + hauteurs[r1] - 1,
    px: (c1 - c0 + 1) * somme(pxRangees, r0, r1),
  });
  const ports = [];
  const k = c.colonnes.colonnesParPort;
  if (k) {
    for (let x = 0; x < sous.colonnes; x += k) ports.push(rectangle(x, Math.min(x + k, sous.colonnes) - 1, 0, hauteurs.length - 1));
  } else {
    for (let x = 0; x < sous.colonnes; x += 1) {
      let r = 0;
      for (const n of c.colonnes.segments) {
        ports.push(rectangle(x, x, r, r + n - 1));
        r += n;
      }
    }
  }
  return ports;
}

// Rectangles des ports d'un morceau de forme libre : colonnes de chaque port, cadrées sur leurs dalles présentes ; une
// colonne coupée en segments donne un rectangle par segment.
// Dalles présentes de chaque port (ou ligne) d'un morceau de forme libre, d'après ses groupes de colonnes ; une colonne
// coupée en segments égaux apparaît une fois par segment.
function casesParGroupe(sous, groupes) {
  const fois = new Map();
  for (const [a, b] of groupes) if (a === b) fois.set(a, (fois.get(a) ?? 0) + 1);
  const vus = new Map();
  return groupes.map(([a, b]) => {
    let cases = sous.forme.colonnes.slice(a - 1, b).flatMap((col) => col.cases.filter((x) => x.presente).map((x) => ({ ...x, colonne: col.colonne })));
    const n = a === b ? fois.get(a) : 1;
    if (n > 1) {
      const rang = vus.get(a) ?? 0;
      vus.set(a, rang + 1);
      const tailles = repartir(cases.length, n);
      const debut = tailles.slice(0, rang).reduce((t, x) => t + x, 0);
      cases = cases.slice(debut, debut + tailles[rang]);
    }
    return cases;
  });
}

// Ports (ou lignes) d'un morceau de forme libre dans le Schéma (9b6) : les colonnes de chaque groupe, en serpentin depuis
// le coin de départ sur les dalles présentes seulement, les groupes pris depuis le côté et le bord de départ. `c0` :
// numéro de la première colonne du morceau dans le mur.
function groupesForme(sous, c0, groupes, coin) {
  const gauche = coin.endsWith('gauche');
  const haut = coin.startsWith('haut');
  const items = casesParGroupe(sous, groupes).map((cases) => {
    const cols = [...new Set(cases.map((x) => c0 + x.colonne - 1))].sort((a, b) => a - b);
    const rows = [...new Set(cases.map((x) => x.rangee))].sort((a, b) => a - b);
    const dans = new Set(cases.map((x) => `${c0 + x.colonne - 1},${x.rangee}`));
    return { positions: serpentin(cols, rows, 'vertical', coin).filter(([c, r]) => dans.has(`${c},${r}`)), col: cols[0], haut: rows[0], bas: rows[rows.length - 1] };
  }).filter((x) => x.positions.length);
  items.sort((a, b) => (gauche ? a.col - b.col : b.col - a.col) || (haut ? a.haut - b.haut : b.bas - a.bas));
  return items.map((x) => x.positions);
}

function rectanglesPortsForme(sous, c, dalle, ox, oy) {
  const groupes = c.colonnes.groupes;
  const listes = casesParGroupe(sous, groupes);
  return groupes.map(([a, b], n) => {
    const cases = listes[n];
    const fiche = (x) => (x.type === 'demi' ? sous.demi : dalle);
    return {
      x0: ox + (a - 1) * dalle.pxH, x1: ox + b * dalle.pxH - 1,
      y0: oy + Math.min(...cases.map((x) => x.y)), y1: oy + Math.max(...cases.map((x) => x.y + x.h)) - 1,
      px: cases.reduce((t, x) => t + fiche(x).pxH * fiche(x).pxV, 0),
    };
  });
}

// Cartes de sortie à zones : les ports, dans l'ordre, vont sur une carte tant que le rectangle qu'elle charge tient.
function cartesParRectangles(proc, rectangles, { redondance = false } = {}) {
  const carte = proc.carteSortie;
  const parCarte = redondance && !proc.portsRedondance ? Math.floor(carte.portsParCarte / 2) : carte.portsParCarte;
  // MX2000 Pro : pas de zone par carte, seulement ses ports et son plafond.
  const tient = (z, n) => n <= parCarte && z.px <= (carte.pixelsMax ?? Infinity)
    && z.x1 - z.x0 + 1 <= (carte.largeurMaxPx ?? Infinity) && z.y1 - z.y0 + 1 <= (carte.hauteurMaxPx ?? Infinity);
  const fusion = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), px: a.px + b.px });
  return repartirSurCartes(rectangles, fusion, tient, optionsConvertisseurs(proc, redondance));
}

function cartesParZones(proc, sous, c, dalle, options = {}) {
  return cartesParRectangles(proc, rectanglesPorts(sous, c, dalle), options);
}

// MX2000 Pro et MX6000 Pro : CVT10 comptés carte par carte, avec la répartition qui en demande le moins.
function optionsConvertisseurs(proc, redondance) {
  if (!(proc.carteSortie1G || proc.carteSortie5G) || !proc.sortiesParDistributeur) return {};
  return { sorties: proc.sortiesParDistributeur, facteur: redondance && !proc.portsRedondance ? 2 : 1 };
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
  // Série H, X100 Pro, Z8t : cartes comptées par zones, convertisseurs carte par carte.
  const parZones = proc.carteSortie?.largeurMaxPx || proc.carteSortie?.pixelsMax ? {
    colonnes: cartesParZones(proc, sous, c, dalle),
    redondance: cartesParZones(proc, sous, c, dalle, { redondance: true }),
  } : null;
  const zones = parZones && { colonnes: parZones.colonnes?.length ?? Infinity, redondance: parZones.redondance?.length ?? Infinity };
  const convertisseurs = (liste, facteur) => (liste ? liste.reduce((t, n) => t + Math.ceil((facteur * n) / sorties), 0) : Infinity);
  const ok = sous.pxTotal <= proc.pixelsMax
    && canvas !== null
    && ports.valeur <= ports.limite
    && (!proc.dallesMax || sous.dalles.total <= proc.dallesMax)
    && (!zones || (contexte.redondance ? zones.redondance : zones.colonnes) <= proc.emplacementsSortie);
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
      colonnes: parZones ? convertisseurs(parZones.colonnes, 1) : Math.ceil(c.colonnes.ports / sorties),
      auPlusJuste: Math.ceil(c.auPlusJuste / sorties),
      // Secours dédiés : convertisseurs miroirs ; sinon les ports doublés de chaque carte.
      redondance: parZones
        ? (proc.portsRedondance ? 2 * convertisseurs(parZones.redondance, 1) : convertisseurs(parZones.redondance, 2))
        : 2 * Math.ceil(c.colonnes.ports / sorties),
    } : null,
    // MX2000 Pro, MX6000 Pro : cartes de sortie qui portent ces convertisseurs ; série H : ports par carte.
    cartesSortie: zones ?? (proc.carteSortie ? {
      colonnes: cartesPour(proc, c.colonnes.ports, sous.pxTotal),
      redondance: cartesPour(proc, proc.portsRedondance ? c.colonnes.ports : 2 * c.colonnes.ports, sous.pxTotal),
    } : null),
    chargeMax: chargePx(c.colonnes.pxMaxParPort, contexte.capacite),
    ok,
  };
}

// Contrôles d'un processeur pour tout le mur, puis découpage : en colonnes entières d'abord,
// en rangées si le mur est trop haut, en grille s'il est à la fois trop large et trop haut.
function decouper(m, dalle, proc, contexte) {
  if (plusieursZones(m)) return decouperZones(m, dalle, proc, contexte);
  const global = cablage(m, contexte.parPort, contexte.charge, { pair: contexte.pair });
  const ports = portsFaceALimite(global, proc, contexte);
  const hauteurMax = Math.max(...formatsCanvas(proc).map((f) => f.hauteurPx));
  const largeurMax = largeurMaxPour(proc, Math.min(m.pxHauteur, hauteurMax));
  const colonnesMax = Math.floor(largeurMax.largeurPx / dalle.pxH);
  const controle = (valeur, limiteValeur, nombre) => ({ valeur, limite: limiteValeur, nombre, depasse: valeur > limiteValeur });
  const controles = {
    pixels: { ...controle(m.pxTotal, proc.pixelsMax, Math.ceil(m.pxTotal / proc.pixelsMax)), compte: 'dalles' },
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
  // Série H, X100 Pro, Z8t : cartes de sortie nécessaires, chaque carte dans sa zone.
  if (proc.carteSortie?.largeurMaxPx) {
    const cartes = cartesParZones(proc, m, global, dalle, { redondance: contexte.redondance })?.length ?? null;
    controles.cartes = {
      ...controle(cartes ?? Infinity, proc.emplacementsSortie, cartes === null ? Infinity : Math.ceil(cartes / proc.emplacementsSortie)),
      zone: { largeurPx: proc.carteSortie.largeurMaxPx, hauteurPx: proc.carteSortie.hauteurMaxPx },
    };
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

// Mur en plusieurs zones (étape 9a) ---------------------------------------------------------------------------------

// Colonnes par port (ou par ligne) d'un ensemble de zones : la plus petite de celles que la largeur de leur zone ne
// borne pas (une zone de 3 colonnes en prend au plus 3 par port) ; si toutes sont bornées, la plus grande.
function colonnesParPortZones(valeurs, colonnes) {
  if (valeurs.some((k) => k === null)) return null;
  const libres = valeurs.filter((k, i) => k < colonnes[i]);
  return libres.length ? Math.min(...libres) : Math.max(...valeurs);
}

// Câblage de plusieurs morceaux de zones : chacun câblé à part (un port ne passe jamais d'une zone à l'autre), puis
// les décomptes additionnés. `parties` : le câblage de chaque morceau, dans l'ordre.
function cablageZones(murs, parPort, charge, options) {
  // Mur mixte : chaque morceau avec la charge de sa propre dalle.
  const pour = (s) => (options?.chargeDe && s.fiche ? options.chargeDe(s.fiche, s.demiFiche) : { parPort, charge });
  const parties = murs.map((s) => {
    const p = pour(s);
    return s.forme ? cablageForme(s, p.parPort, p.charge, options) : cablage(s, p.parPort, p.charge, options);
  });
  const variable = parties.some((c) => c.colonnes.variable);
  const somme = (f) => parties.reduce((t, c) => t + f(c), 0);
  const maxi = (f) => {
    const valeurs = parties.map(f).filter((x) => x !== null && x !== undefined);
    return valeurs.length ? Math.max(...valeurs) : null;
  };
  const colonnes = murs.map((s) => s.colonnes);
  const plusHaute = murs.reduce((a, s, i) => (s.pxHauteur > murs[a].pxHauteur ? i : a), 0);
  const ports = somme((c) => c.colonnes.ports);
  const auPlusJuste = somme((c) => c.auPlusJuste);
  return {
    dallesParPort: parPort,
    auPlusJuste,
    dallesMaxParPortAuPlusJuste: maxi((c) => c.dallesMaxParPortAuPlusJuste),
    pxMaxParPortAuPlusJuste: maxi((c) => c.pxMaxParPortAuPlusJuste),
    colonnes: {
      colonnesParPort: colonnesParPortZones(parties.map((c) => c.colonnes.colonnesParPort), colonnes),
      colonnesParPortMax: colonnesParPortZones(parties.map((c) => c.colonnes.colonnesParPortMax ?? null), colonnes),
      segments: parties[plusHaute].colonnes.segments,
      ports,
      dallesMaxParPort: maxi((c) => c.colonnes.dallesMaxParPort),
      pxMaxParPort: maxi((c) => c.colonnes.pxMaxParPort),
      ...(variable ? { variable: true } : {}),
    },
    redondance: { auPlusJuste: 2 * auPlusJuste, colonnes: 2 * ports },
    seuil: { dallesEnMoins: null },
    remplissage: parties.flatMap((c) => c.remplissage),
    total: somme((c) => c.total),
    parties,
  };
}

// Câblage d'un morceau de zone de forme libre (9b, Z21) : colonnes entières de gauche à droite, chacune avec ses dalles
// présentes ; un port prend le plus de colonnes qui tiennent (le remplissage glouton donne le moins de ports). Charge :
// les dalles du port, ou pour NovaLCT (`charge.rectangle`) le rectangle qui englobe ses dalles, vides et décalages
// compris. Une colonne qui ne tient pas seule : segments égaux de ses dalles présentes. Redondance : nombre pair de
// colonnes par port. Au plus juste théorique : comme un mur d'une pièce, sur le total des dalles.
function cablageForme(s, parPort, charge, { pair = false, depuisDroite = false } = {}) {
  // Départ à droite (Schéma) : colonnes groupées depuis la droite, le port incomplet au bout, comme un rectangle de la 9a.
  if (depuisDroite) {
    const miroir = { ...s, forme: { ...s.forme, colonnes: [...s.forme.colonnes].reverse() } };
    const r = cablageForme(miroir, parPort, charge, { pair });
    return { ...r, colonnes: { ...r.colonnes, groupes: r.colonnes.groupes.map(([a, b]) => [s.colonnes - b + 1, s.colonnes - a + 1]) } };
  }
  const colonnes = s.forme.colonnes.map((c) => c.cases.filter((x) => x.presente));
  const largeurColonne = s.pxLargeur / s.colonnes;
  const pxCase = (x) => (charge ? (x.type === 'demi' ? charge.pxParDemi : charge.pxParDalle) : 1);
  const capacite = charge ? charge.capacite : parPort;
  const plafond = charge?.plafond ?? Infinity;
  const lmin = charge?.largeurMinPx ?? 0;
  const dmax = charge?.dimensionMaxPx ?? Infinity;
  // Charge d'un ensemble de cases sur `n` colonnes, et s'il tient dans un port.
  const charger = (cases, n) => {
    const largeur = n * largeurColonne;
    const hauteur = cases.length ? Math.max(...cases.map((x) => x.y + x.h)) - Math.min(...cases.map((x) => x.y)) : 0;
    const px = charge?.rectangle ? largeur * hauteur : cases.reduce((t, x) => t + pxCase(x), 0);
    return { px: px + penaliteLargeurChargee(largeur, hauteur, lmin), dalles: cases.length, largeur, hauteur };
  };
  const tient = (c) => c.px <= capacite + EPS && c.dalles <= plafond && c.largeur <= dmax && c.hauteur <= dmax;
  const groupes = [];
  const segmentsColonnes = [];
  const segment = [];
  const chargesPorts = [];
  let i = 0;
  while (i < colonnes.length) {
    if (!tient(charger(colonnes[i], 1))) {
      const cases = colonnes[i];
      let decoupe = null;
      for (let n = 2; n <= cases.length && !decoupe; n += 1) {
        let debut = 0;
        const morceaux = repartir(cases.length, n).map((t) => {
          const m = cases.slice(debut, debut + t);
          debut += t;
          return m;
        });
        if (morceaux.every((m) => tient(charger(m, 1)))) decoupe = morceaux;
      }
      if (!decoupe) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
      for (const m of decoupe) {
        groupes.push([i + 1, i + 1]);
        segment.push(true);
        chargesPorts.push(charger(m, 1));
      }
      segmentsColonnes.push(decoupe.map((m) => m.length));
      i += 1;
      continue;
    }
    let k = 1;
    while (i + k < colonnes.length && tient(charger(colonnes.slice(i, i + k + 1).flat(), k + 1))) k += 1;
    if (pair && k > 1 && k % 2 === 1) k -= 1;
    groupes.push([i + 1, i + k]);
    segment.push(false);
    chargesPorts.push(charger(colonnes.slice(i, i + k).flat(), k));
    i += k;
  }

  // Au plus juste théorique, sur le total des dalles (comme `cablage`).
  const modele = modeleCharge(parPort, charge);
  const remplissage = [];
  let resteE = s.dalles.entieres;
  let resteD = s.dalles.demi;
  while (resteE + resteD > 0) {
    const e = Math.min(modele.maxEntieres, resteE);
    const d = Math.min(modele.maxDemi(e), resteD);
    if (e + d === 0) throw new ErreurSaisie('Une seule demi-dalle dépasse la capacité d\'un port.');
    remplissage.push({ e, d });
    resteE -= e;
    resteD -= d;
  }
  const entiers = groupes.filter((_, n) => !segment[n]);
  const plusLongs = segmentsColonnes.reduce((x, seg) => (seg.reduce((t, n) => t + n, 0) > x.reduce((t, n) => t + n, 0) ? seg : x), []);
  return {
    dallesParPort: parPort,
    auPlusJuste: remplissage.length,
    dallesMaxParPortAuPlusJuste: Math.max(...remplissage.map((p) => p.e + p.d)),
    pxMaxParPortAuPlusJuste: modele.px ? Math.max(...remplissage.map((p) => modele.px(p.e, p.d))) : null,
    colonnes: {
      colonnesParPort: entiers.length ? Math.max(...entiers.map(([a, b]) => b - a + 1)) : null,
      colonnesParPortMax: null,
      variable: true,
      groupes,
      segments: plusLongs.length ? plusLongs : [Math.max(...colonnes.map((c) => c.length))],
      ports: groupes.length,
      dallesMaxParPort: Math.max(...chargesPorts.map((c) => c.dalles)),
      pxMaxParPort: charge ? Math.max(...chargesPorts.map((c) => c.px)) : null,
    },
    redondance: { auPlusJuste: 2 * remplissage.length, colonnes: 2 * groupes.length },
    seuil: { dallesEnMoins: null },
    remplissage,
    total: s.dalles.total,
  };
}

// Câblage d'un mur, d'une seule pièce ou en zones.
function cablageMur(m, dalle, parPort, charge, options) {
  return plusieursZones(m) ? cablageZones(mursDesZones(m, dalle), parPort, charge, options) : cablage(m, parPort, charge, options);
}

// Abscisse (px) d'une colonne du mur, comptée de 1 à m.colonnes à travers les zones.
function xColonne(m, dalle, colonne) {
  const z = m.zones.find((x) => colonne < x.premiereColonne + x.colonnes);
  return z.x + (colonne - z.premiereColonne) * ficheZone(m, z, dalle).pxH;
}
// Largeur (px) d'une colonne du mur, comptée de 1 à m.colonnes à travers les zones.
function largeurColonne(m, dalle, colonne) {
  return ficheZone(m, m.zones.find((x) => colonne < x.premiereColonne + x.colonnes), dalle).pxH;
}

// Largeur seule : le moins de blocs de colonnes entières dont la pixel map, vides compris, tient dans `largeurMax`.
function blocsEnLargeur(m, dalle, largeurMax) {
  if (m.zones.some((z) => ficheZone(m, z, dalle).pxH > largeurMax)) return Infinity;
  let blocs = 1;
  let debut = xColonne(m, dalle, 1);
  for (let c = 2; c <= m.colonnes; c += 1) {
    const x = xColonne(m, dalle, c);
    if (x + largeurColonne(m, dalle, c) - debut > largeurMax) {
      blocs += 1;
      debut = x;
    }
  }
  return blocs;
}

// Zones découpables en rangées : toutes de mêmes rangées, à la même hauteur dans la pixel map.
const zonesUniformes = (m) => m.zones.every((z) => !z.forme && z.lignes === m.zones[0].lignes && z.y === m.zones[0].y);

// Colonnes de chaque port d'un morceau rectangulaire : k colonnes par port, ou une colonne coupée en segments.
function groupesUniformes(nbColonnes, colonnes) {
  const k = colonnes.colonnesParPort;
  const groupes = [];
  if (k) {
    for (let x = 1; x <= nbColonnes; x += k) groupes.push([x, Math.min(x + k - 1, nbColonnes)]);
  } else {
    for (let x = 1; x <= nbColonnes; x += 1) for (let n = 0; n < colonnes.segments.length; n += 1) groupes.push([x, x]);
  }
  return groupes;
}

// Bloc d'un processeur à travers les zones : les colonnes [premiereColonne, +colonnes[ du mur, et en zones uniformes les
// rangées [premiereRangee, +rangees[. Chaque morceau de zone est câblé à part ; le bloc est contrôlé sur son propre
// canvas, du coin haut gauche de son premier morceau au coin bas droit du dernier, vides compris.
function blocZones(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }) {
  const fin = premiereColonne + colonnes - 1;
  const morceaux = [];
  for (const z of m.zones) {
    const a = Math.max(premiereColonne, z.premiereColonne);
    const b = Math.min(fin, z.premiereColonne + z.colonnes - 1);
    if (a > b) continue;
    morceaux.push(morceauZone(m, dalle, z, a - z.premiereColonne + 1, b - z.premiereColonne + 1, rangees ? premiereRangee : 1, rangees ?? z.lignes));
  }
  return blocMorceaux(m, dalle, proc, contexte, morceaux, { colonnes, premiereColonne, rangees, premiereRangee });
}

// Morceau d'une zone : ses colonnes a à b et, pour une zone rectangulaire, ses rangées r0 à r0 + nr − 1 (comptées dans la
// zone). Zone de forme libre : le morceau est cadré sur ses dalles présentes, coupé en hauteur seulement par une bande
// entre deux coupes horizontales (px depuis le haut de la zone, Z19) ; ses rangées vont de la plus haute à la plus basse
// de ses dalles.
function morceauZone(m, dalleMur, z, a, b, r0 = 1, nr = z.lignes, bande = null) {
  const dalle = ficheZone(m, z, dalleMur);
  const sous = avecFiches(z.forme ? sousForme(z, dalle, demiZone(m, z), a, b, bande) : mur(dalle, b - a + 1, nr), dalle, demiZone(m, z));
  let rangees = [r0, nr];
  if (z.forme) {
    const lignes = sous.forme.colonnes.flatMap((c) => c.cases.filter((x) => x.presente).map((x) => x.rangee));
    rangees = bande && lignes.length ? [Math.min(...lignes), Math.max(...lignes) - Math.min(...lignes) + 1] : [1, z.forme.types.length];
  }
  return {
    zone: z.index, nom: z.nom, premiereColonne: a, colonnes: b - a + 1, premiereRangee: rangees[0], rangees: rangees[1],
    x: z.x + (a - 1) * dalle.pxH, y: z.forme ? z.y + sous.forme.haut : z.y + (r0 - 1) * dalle.pxV, sous,
  };
}

// Bloc d'un processeur fait de morceaux de zones : câblage morceau par morceau, contrôles sur son canvas (du coin haut
// gauche de son premier morceau au coin bas droit du dernier, vides compris). `meta` : colonnes et rangées du mur qu'il
// couvre (découpage de la 9a), ou rien (lignes de coupe, variantes).
function blocMorceaux(m, dalle, proc, contexte, morceaux, { colonnes = null, premiereColonne = null, rangees = null, premiereRangee = null } = {}) {
  const fin = premiereColonne === null ? null : premiereColonne + colonnes - 1;
  const c = cablageZones(morceaux.map((p) => p.sous), contexte.parPort, contexte.charge, { pair: contexte.pair, chargeDe: contexte.chargeDe });
  const x0 = Math.min(...morceaux.map((p) => p.x));
  const x1 = Math.max(...morceaux.map((p) => p.x + p.sous.pxLargeur - 1));
  const y0 = Math.min(...morceaux.map((p) => p.y));
  const y1 = Math.max(...morceaux.map((p) => p.y + p.sous.pxHauteur - 1));
  const largeurPx = x1 - x0 + 1;
  const hauteurPx = y1 - y0 + 1;
  const px = morceaux.reduce((s, p) => s + p.sous.pxTotal, 0);
  const dalles = morceaux.reduce((s, p) => s + p.sous.dalles.total, 0);
  const ports = portsFaceALimite(c, proc, contexte);
  const canvas = canvasProcesseur(proc, largeurPx, hauteurPx);
  const sorties = proc.sortiesParDistributeur;
  // Série H, X100 Pro, Z8t, MX6000 Pro : cartes comptées par zones, sur les rectangles des ports dans le canvas du bloc.
  const rectangles = () => morceaux.flatMap((p, i) => rectanglesPorts(p.sous, c.parties[i], p.sous.fiche ?? dalle, p.x, p.y));
  const parZones = proc.carteSortie?.largeurMaxPx || proc.carteSortie?.pixelsMax ? {
    colonnes: cartesParRectangles(proc, rectangles()),
    redondance: cartesParRectangles(proc, rectangles(), { redondance: true }),
  } : null;
  const zones = parZones && { colonnes: parZones.colonnes?.length ?? Infinity, redondance: parZones.redondance?.length ?? Infinity };
  const convertisseurs = (liste, facteur) => (liste ? liste.reduce((t, n) => t + Math.ceil((facteur * n) / sorties), 0) : Infinity);
  const ok = px <= proc.pixelsMax
    && canvas !== null
    && ports.valeur <= ports.limite
    && (!proc.dallesMax || dalles <= proc.dallesMax)
    && (!zones || (contexte.redondance ? zones.redondance : zones.colonnes) <= proc.emplacementsSortie);
  // Ports numérotés dans le processeur, morceau après morceau, de gauche à droite.
  let numero = 1;
  const parties = morceaux.map((p, i) => {
    const cp = c.parties[i];
    const n = cp.colonnes.ports;
    // Colonnes de chaque port, comptées dans la zone : [première, dernière].
    const decalage = p.premiereColonne - 1;
    const groupes = (cp.colonnes.groupes ?? groupesUniformes(p.colonnes, cp.colonnes)).map(([g0, g1]) => [g0 + decalage, g1 + decalage]);
    const partie = {
      zone: p.zone,
      nom: p.nom,
      nomAffiche: p.nom,
      premiereColonne: p.premiereColonne,
      colonnes: p.colonnes,
      premiereRangee: p.premiereRangee,
      rangees: p.rangees,
      // Coin haut gauche dans la pixel map du mur, et dans l'entrée du processeur (le bloc en haut à gauche de sa source).
      x: p.x,
      y: p.y,
      dansEntree: { x: p.x - x0, y: p.y - y0 },
      largeurPx: p.sous.pxLargeur,
      hauteurPx: p.sous.pxHauteur,
      dalles: p.sous.dalles.total,
      px: p.sous.pxTotal,
      ports: { colonnes: n, premier: numero, dernier: numero + n - 1, auPlusJuste: cp.auPlusJuste, redondance: cp.redondance, groupes },
    };
    // Le morceau lui-même, pour le serpentin de Data ; hors du JSON de l'évaluation.
    Object.defineProperty(partie, 'sous', { value: p.sous, enumerable: false });
    numero += n;
    return partie;
  });
  return {
    colonnes,
    premiereColonne,
    derniereColonne: fin,
    rangees: rangees ?? Math.max(...morceaux.map((p) => p.rangees)),
    premiereRangee: rangees ? premiereRangee : 1,
    derniereRangee: rangees ? premiereRangee + rangees - 1 : Math.max(...morceaux.map((p) => p.rangees)),
    format: canvas?.format ?? null,
    canvas,
    x: [x0, x1],
    y: [y0, y1],
    dalles,
    px,
    largeurPx,
    hauteurPx,
    // Pixels vides dans la largeur du bloc (écarts entre ses morceaux).
    videsLargeurPx: largeurPx - parties.reduce((s, p) => s + p.largeurPx, 0),
    ports: { auPlusJuste: c.auPlusJuste, colonnes: c.colonnes.ports, redondance: c.redondance },
    distributeurs: sorties ? {
      colonnes: parZones ? convertisseurs(parZones.colonnes, 1) : Math.ceil(c.colonnes.ports / sorties),
      auPlusJuste: Math.ceil(c.auPlusJuste / sorties),
      redondance: parZones
        ? (proc.portsRedondance ? 2 * convertisseurs(parZones.redondance, 1) : convertisseurs(parZones.redondance, 2))
        : 2 * Math.ceil(c.colonnes.ports / sorties),
    } : null,
    cartesSortie: zones ?? (proc.carteSortie ? {
      colonnes: cartesPour(proc, c.colonnes.ports, px),
      redondance: cartesPour(proc, proc.portsRedondance ? c.colonnes.ports : 2 * c.colonnes.ports, px),
    } : null),
    chargeMax: chargePx(c.colonnes.pxMaxParPort, contexte.capacite),
    parties,
    ok,
  };
}

// Morceau d'une zone partagée entre plusieurs blocs : « B-C 1/2 », « B-C 2/2 » ; une zone entière garde son nom.
function nommerMorceaux(blocs) {
  const parZone = new Map();
  for (const b of blocs) for (const p of b.parties) parZone.set(p.zone, [...(parZone.get(p.zone) ?? []), p]);
  for (const liste of parZone.values()) {
    if (liste.length > 1) liste.forEach((p, i) => { p.nomAffiche = `${p.nom} ${i + 1}/${liste.length}`; });
  }
}

// Contrôles et découpage d'un mur en zones : pixels utiles (les vides ne chargent aucun port) ; largeur et hauteur de
// la pixel map, vides compris ; ports zone par zone. Colonnes entières à travers les zones, en groupes aussi égaux que
// possible ; en rangées seulement si toutes les zones ont les mêmes rangées à la même hauteur.
function decouperZones(m, dalle, proc, contexte) {
  const murs = mursDesZones(m, dalle);
  const global = cablageZones(murs, contexte.parPort, contexte.charge, { pair: contexte.pair, chargeDe: contexte.chargeDe });
  const ports = portsFaceALimite(global, proc, contexte);
  const hauteurMax = Math.max(...formatsCanvas(proc).map((f) => f.hauteurPx));
  const largeurMax = largeurMaxPour(proc, Math.min(m.pxHauteur, hauteurMax));
  const colonnesMax = Math.floor(largeurMax.largeurPx / dalle.pxH);
  const controle = (valeur, limiteValeur, nombre) => ({ valeur, limite: limiteValeur, nombre, depasse: valeur > limiteValeur });
  const controles = {
    pixels: { ...controle(m.pxTotal, proc.pixelsMax, Math.ceil(m.pxTotal / proc.pixelsMax)), compte: 'dalles' },
    largeur: {
      ...controle(m.pxLargeur, largeurMax.largeurPx, empilees(m) ? bandesEnLargeur(m, dalle, largeurMax.largeurPx) : blocsEnLargeur(m, dalle, largeurMax.largeurPx)),
      colonnesMax,
      format: largeurMax.format,
    },
    hauteur: controle(m.pxHauteur, hauteurMax, Math.ceil(m.pxHauteur / hauteurMax)),
    ports: { ...controle(ports.valeur, ports.limite, Math.ceil(ports.valeur / ports.limite)), principaux: ports.principaux },
  };
  if (proc.dallesMax) {
    controles.dalles = controle(m.dalles.total, proc.dallesMax, Math.ceil(m.dalles.total / proc.dallesMax));
  }
  if (proc.carteSortie?.largeurMaxPx) {
    const rectangles = m.zones.flatMap((z, i) => rectanglesPorts(murs[i], global.parties[i], murs[i].fiche ?? dalle, z.x, z.y + (murs[i].forme?.haut ?? 0)));
    const cartes = cartesParRectangles(proc, rectangles, { redondance: contexte.redondance })?.length ?? null;
    controles.cartes = {
      ...controle(cartes ?? Infinity, proc.emplacementsSortie, cartes === null ? Infinity : Math.ceil(cartes / proc.emplacementsSortie)),
      zone: { largeurPx: proc.carteSortie.largeurMaxPx, hauteurPx: proc.carteSortie.hauteurMaxPx },
    };
  }
  const limites = Object.entries(controles).filter(([, c]) => c.nombre > 1).map(([nom]) => nom);
  const resultat = { global, controles, limites, nombre: null, grille: null, groupes: [], impossible: null };

  const unite = blocProcesseur(mur(dalle, 1, 1), dalle, proc, contexte, { colonnes: 1, premiereColonne: 1, rangees: 1, premiereRangee: 1 });
  if (!unite.ok) {
    resultat.impossible = `Une seule dalle (${dalle.pxH} × ${dalle.pxV} px) dépasse les limites d'un ${proc.nom}.`;
    return resultat;
  }

  // Variante retenue dans Data (9b2, Z20) : zones entières, ou un processeur par zone.
  if (contexte.decoupage === 'zonesEntieres' || contexte.decoupage === 'unParZone') {
    return { ...resultat, ...decouperVariante(m, dalle, proc, contexte, contexte.decoupage) };
  }
  const uniformes = zonesUniformes(m);
  const nbRangees = uniformes ? m.zones[0].lignes : 1;
  const depart = Math.max(1, ...Object.values(controles).map((c) => c.nombre));
  // Zones empilées (9b2, Z19) : découpage par lignes de coupe ; sinon celui de la 9a, puis les lignes de coupe pour des
  // zones de hauteurs différentes trop hautes pour un processeur.
  const parCoupes = () => {
    const r = decouperCoupes(m, dalle, proc, contexte, depart);
    return r ? { ...resultat, ...r } : null;
  };
  if (empilees(m)) return parCoupes() ?? { ...resultat, impossible: `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.` };
  for (let n = depart; Number.isFinite(n) && n <= m.colonnes * nbRangees; n += 1) {
    for (let nr = 1; nr <= Math.min(n, nbRangees); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > m.colonnes) continue;
      const blocs = [];
      let premiereRangee = 1;
      for (const rangees of repartir(nbRangees, nr)) {
        let premiereColonne = 1;
        for (const colonnes of repartir(m.colonnes, nc)) {
          blocs.push(blocZones(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees: uniformes ? rangees : null, premiereRangee }));
          premiereColonne += colonnes;
        }
        premiereRangee += rangees;
      }
      if (blocs.every((b) => b.ok)) {
        nommerMorceaux(blocs);
        return { ...resultat, nombre: n, grille: { colonnes: nc, rangees: nr }, groupes: blocs };
      }
    }
  }
  if (!uniformes) {
    const r = parCoupes();
    if (r) return r;
  }
  resultat.impossible = `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.`;
  return resultat;
}

// Zones l'une au-dessus de l'autre : deux zones qui se recouvrent en X dans la pixel map.
function empilees(m) {
  return m.zones.some((a, i) => m.zones.slice(i + 1).some((b) => recouvrement(a.x, a.x + a.pxLargeur, b.x, b.x + b.pxLargeur)));
}

// Lignes de coupe (9b2, Z19) : X où une coupe verticale ne traverse aucune dalle (pour chaque zone qui couvre ce X, c'est
// un bord de colonne), et Y de même pour une coupe horizontale (dans une zone de forme libre, un Y qui ne traverse aucune
// de ses dalles présentes). Bords de la pixel map compris.
export function lignesDeCoupe(m, dalle) {
  const zones = plusieursZones(m) ? m.zones : [{ x: 0, y: 0, pxLargeur: m.pxLargeur, pxHauteur: m.pxHauteur, colonnes: m.colonnes, lignes: m.lignes }];
  const dedans = (v, debut, taille) => v > debut && v < debut + taille;
  const xs = new Set([0, m.pxLargeur]);
  const ys = new Set([0, m.pxHauteur]);
  const f = (z) => z.dalle ?? dalle;
  for (const z of zones) {
    for (let k = 0; k <= z.colonnes; k += 1) xs.add(z.x + k * f(z).pxH);
    if (z.forme) {
      ys.add(z.y);
      ys.add(z.y + z.pxHauteur);
      for (const c of z.forme.colonnes) {
        for (const x of c.cases.filter((x) => x.presente)) {
          ys.add(z.y + x.y);
          ys.add(z.y + x.y + x.h);
        }
      }
    } else {
      for (let k = 0; k <= z.lignes; k += 1) ys.add(z.y + k * f(z).pxV);
    }
  }
  const x = [...xs].filter((v) => zones.every((z) => !dedans(v, z.x, z.pxLargeur) || (v - z.x) % f(z).pxH === 0));
  const traverse = (z, v) => z.forme.colonnes.some((c) => c.cases.some((x) => x.presente && dedans(v, z.y + x.y, x.h)));
  const y = [...ys].filter((v) => zones.every((z) => !dedans(v, z.y, z.pxHauteur) || (z.forme ? !traverse(z, v) : (v - z.y) % f(z).pxV === 0)));
  return { x: x.sort((a, b) => a - b), y: y.sort((a, b) => a - b) };
}

// Largeur seule, zones empilées : le moins de blocs entre lignes de coupe dont la largeur tient dans `largeurMax`.
function bandesEnLargeur(m, dalle, largeurMax) {
  const { x } = lignesDeCoupe(m, dalle);
  let blocs = 1;
  let debut = x[0];
  for (let i = 1; i < x.length; i += 1) {
    if (x[i] - x[i - 1] > largeurMax) return Infinity;
    if (x[i] - debut > largeurMax) {
      blocs += 1;
      debut = x[i - 1];
    }
  }
  return blocs;
}

// Morceaux de zones dans le rectangle [xa, xb[ × [ya, yb[ de la pixel map, bornes sur des lignes de coupe.
function morceauxRectangle(m, dalle, xa, xb, ya, yb) {
  const morceaux = [];
  for (const z of m.zones) {
    const x0 = Math.max(xa, z.x);
    const x1 = Math.min(xb, z.x + z.pxLargeur);
    const y0 = Math.max(ya, z.y);
    const y1 = Math.min(yb, z.y + z.pxHauteur);
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const f = ficheZone(m, z, dalle);
    const a = Math.round((x0 - z.x) / f.pxH) + 1;
    const b = Math.round((x1 - z.x) / f.pxH);
    // Forme libre coupée en hauteur : la bande entre les deux coupes.
    const bande = z.forme && (y0 > z.y || y1 < z.y + z.pxHauteur) ? [y0 - z.y, y1 - z.y] : null;
    const p = morceauZone(m, dalle, z, a, b, Math.round((y0 - z.y) / f.pxV) + 1, Math.round((y1 - y0) / f.pxV), bande);
    if (p.sous.dalles.total > 0) morceaux.push(p);
  }
  return morceaux;
}

// Groupes de bandes consécutives, aussi peu larges que possible : le plus petit maximum `taille` qui laisse au plus
// `nombre` groupes, chaque groupe aussi grand que possible de gauche à droite (ou de haut en bas) et accepté par `tient`.
function grouperBandes(bornes, nombre, tient = () => true) {
  const bandes = bornes.length - 1;
  const essai = (taille) => {
    const groupes = [];
    let i = 0;
    while (i < bandes) {
      if (bornes[i + 1] - bornes[i] > taille || !tient(i, i)) return null;
      let j = i;
      while (j + 1 < bandes && bornes[j + 2] - bornes[i] <= taille && tient(i, j + 1)) j += 1;
      groupes.push([i, j]);
      if (groupes.length > nombre) return null;
      i = j + 1;
    }
    return groupes;
  };
  let bas = Math.max(...bornes.slice(1).map((b, i) => b - bornes[i]));
  let haut = bornes[bandes] - bornes[0];
  if (!essai(haut)) return null;
  while (bas < haut) {
    const milieu = Math.floor((bas + haut) / 2);
    if (essai(milieu)) haut = milieu;
    else bas = milieu + 1;
  }
  return essai(haut);
}

// Découpage par lignes de coupe (9b2, Z19) : le moins de processeurs ; colonnes d'abord, puis rangées si le mur est trop
// haut, puis grille ; les rangées par la hauteur la plus faible, puis les colonnes par la largeur la plus faible qui laisse
// chaque bloc passer ses contrôles, chaque bloc aussi large que possible de gauche à droite. Un bloc sans dalle n'a pas
// de processeur.
function decouperCoupes(m, dalle, proc, contexte, depart) {
  const { x: xs, y: ys } = lignesDeCoupe(m, dalle);
  const cache = new Map();
  const bloc = (xa, xb, ya, yb) => {
    const cle = `${xa},${xb},${ya},${yb}`;
    if (!cache.has(cle)) {
      const morceaux = morceauxRectangle(m, dalle, xa, xb, ya, yb);
      cache.set(cle, morceaux.length ? blocMorceaux(m, dalle, proc, contexte, morceaux) : null);
    }
    return cache.get(cle);
  };
  const maxi = (xs.length - 1) * (ys.length - 1);
  for (let n = depart; n <= maxi; n += 1) {
    for (let nr = 1; nr <= Math.min(n, ys.length - 1); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > xs.length - 1) continue;
      const lignes = grouperBandes(ys, nr);
      if (!lignes) continue;
      const tient = (i, j) => lignes.every(([a, b]) => {
        const r = bloc(xs[i], xs[j + 1], ys[a], ys[b + 1]);
        return r === null || r.ok;
      });
      const colonnes = grouperBandes(xs, nc, tient);
      if (!colonnes) continue;
      const blocs = lignes.flatMap(([a, b]) => colonnes.map(([i, j]) => bloc(xs[i], xs[j + 1], ys[a], ys[b + 1]))).filter(Boolean);
      nommerMorceaux(blocs);
      return { nombre: blocs.length, grille: { colonnes: colonnes.length, rangees: lignes.length }, groupes: blocs };
    }
  }
  return null;
}

// Variantes de découpage (9b2, Z20). « Zones entières » : aucune zone coupée, sauf une zone trop grande pour un
// processeur, coupée seule ; groupes de zones voisines dans la liste, le moins de processeurs, puis le groupe le plus
// chargé le moins chargé possible, puis le premier groupe le plus grand. « Un processeur par zone » : aucun processeur ne
// porte deux zones.
function decouperVariante(m, dalle, proc, contexte, mode) {
  const zones = m.zones;
  const entiere = (indices) => blocMorceaux(m, dalle, proc, contexte, indices.map((i) => morceauZone(m, dalle, zones[i], 1, zones[i].colonnes)));
  // Une zone seule, coupée en colonnes et en rangées si elle ne tient pas d'un bloc (forme libre : en bandes entre ses
  // coupes horizontales, Z19).
  const seule = (i) => {
    const z = zones[i];
    const un = entiere([i]);
    if (un.ok) return [un];
    const ys = z.forme ? lignesDeCoupe({ zones: [{ ...z, x: 0, y: 0 }], pxLargeur: z.pxLargeur, pxHauteur: z.pxHauteur }, ficheZone(m, z, dalle)).y : null;
    const rangeesMax = z.forme ? ys.length - 1 : z.lignes;
    for (let n = 2; n <= z.colonnes * rangeesMax; n += 1) {
      for (let nr = 1; nr <= Math.min(n, rangeesMax); nr += 1) {
        const nc = n / nr;
        if (!Number.isInteger(nc) || nc > z.colonnes) continue;
        // Rangées de blocs : [première rangée, rangées, bande].
        let lignes;
        if (z.forme) {
          lignes = grouperBandes(ys, nr)?.map(([a, b]) => [1, z.lignes, nr > 1 ? [ys[a], ys[b + 1]] : null]);
          if (!lignes) continue;
        } else {
          let r0 = 1;
          lignes = repartir(rangeesMax, nr).map((nbR) => {
            r0 += nbR;
            return [r0 - nbR, nbR, null];
          });
        }
        const blocs = [];
        for (const [r0, nbR, bande] of lignes) {
          let a = 1;
          for (const nbC of repartir(z.colonnes, nc)) {
            const morceau = morceauZone(m, dalle, z, a, a + nbC - 1, r0, nbR, bande);
            if (morceau.sous.dalles.total > 0) blocs.push(blocMorceaux(m, dalle, proc, contexte, [morceau]));
            a += nbC;
          }
        }
        if (blocs.every((b) => b.ok)) return blocs;
      }
    }
    return null;
  };
  const seules = zones.map((_, i) => seule(i));
  if (seules.some((b) => b === null)) return { nombre: null, groupes: [], impossible: `Une zone ne tient dans aucun découpage en ${proc.nom}.` };
  let groupes;
  if (mode === 'unParZone') {
    groupes = seules.flat();
  } else {
    const tientSeule = zones.map((_, i) => seules[i].length === 1);
    const cache = new Map();
    const groupe = (a, b) => {
      const cle = `${a},${b}`;
      if (!cache.has(cle)) cache.set(cle, a === b ? seules[a] : (entiere(suite(a, b)).ok ? [entiere(suite(a, b))] : null));
      return cache.get(cle);
    };
    let meilleur = null;
    for (let masque = 0; masque < 2 ** (zones.length - 1); masque += 1) {
      const morceaux = [];
      let debut = 0;
      for (let i = 0; i < zones.length; i += 1) {
        if (i === zones.length - 1 || masque & (2 ** i)) {
          morceaux.push([debut, i]);
          debut = i + 1;
        }
      }
      if (morceaux.some(([a, b]) => b > a && suite(a, b).some((i) => !tientSeule[i]))) continue;
      const blocs = morceaux.map(([a, b]) => groupe(a, b));
      if (blocs.some((x) => x === null)) continue;
      const liste = blocs.flat();
      const cles = [liste.length, Math.max(...liste.map((x) => x.px)), ...morceaux.map(([a, b]) => -(b - a + 1))];
      // Clés comparées dans l'ordre : processeurs, pixels du bloc le plus chargé, taille des groupes (le premier le plus grand).
      const ecart = meilleur ? cles.findIndex((v, k) => v !== meilleur.cles[k]) : -1;
      if (!meilleur || (ecart >= 0 && cles[ecart] < (meilleur.cles[ecart] ?? Infinity))) meilleur = { cles, liste };
    }
    groupes = meilleur.liste;
  }
  nommerMorceaux(groupes);
  return { nombre: groupes.length, grille: null, groupes };
}

// Minimum théorique (au plus juste, zone par zone) face au décompte retenu en colonnes entières.
function minimumTheoriqueZones(c, minimum, murs, unite, { pair = false } = {}) {
  const retenu = c.colonnes.ports;
  const pl = (n) => `${n} ${unite}${n > 1 ? 's' : ''}`;
  const un = unite === 'ligne' ? 'une' : 'un';
  const raisons = [];
  if (c.parties.some((p) => !p.colonnes.colonnesParPort)) {
    raisons.push(`une colonne dépasse ${un} ${unite} : elle est coupée en segments égaux`);
  }
  const sansPair = c.parties.reduce((t, p, i) => t + (p.colonnes.colonnesParPortMax
    ? Math.ceil(murs[i].colonnes / p.colonnes.colonnesParPortMax) : p.colonnes.ports), 0);
  if (pair && retenu > sansPair) {
    raisons.push(`en redondance, nombre pair de colonnes par ${unite} : chaque chaîne revient au bord de départ (${pl(sansPair)} sans cette règle)`);
  }
  if (sansPair > minimum) raisons.push(`une colonne n'est jamais coupée entre deux ${unite}s, et ${un} ${unite} ne passe jamais d'une zone à l'autre`);
  return {
    nombre: minimum,
    raisons,
    texte: retenu === minimum ? null
      : `Minimum théorique : ${pl(minimum)} au plus juste, contre ${retenu} en colonnes entières. Écart : ${raisons.join(' ; ')}.`,
  };
}

// Seuil processeur en zones : le moins de colonnes à retirer d'une seule zone pour économiser un processeur, et les
// zones où ce nombre suffit.
function seuilZones(m, dalle, proc, contexte, nombre) {
  let meilleur = null;
  const zonesEnMoins = [];
  if (nombre > 1) {
    m.saisie.zones.forEach((z, i) => {
      for (let c = 1; c < z.colonnes && (meilleur === null || c <= meilleur); c += 1) {
        // Retirer une colonne d'une zone de forme libre : sa dernière colonne, avec ses dalles absentes et son décalage.
        const reste = z.colonnes - c;
        const zones = m.saisie.zones.map((x, j) => (j !== i ? x : {
          ...x,
          colonnes: reste,
          ...(x.absentes ? { absentes: x.absentes.filter(([col]) => col <= reste) } : {}),
          ...(x.decalagesMm ? { decalagesMm: x.decalagesMm.slice(0, reste) } : {}),
        }));
        let n = null;
        try {
          n = decouper(murZones(dalle, zones, m.saisie.options), dalle, proc, contexte).nombre;
        } catch (erreur) {
          if (!(erreur instanceof ErreurSaisie)) throw erreur;
        }
        if (n !== null && n < nombre) {
          if (meilleur === null || c < meilleur) {
            meilleur = c;
            zonesEnMoins.length = 0;
          }
          zonesEnMoins.push(m.zones[i].nom);
          break;
        }
      }
    });
  }
  return { colonnesEnMoins: meilleur, zonesEnMoins };
}

// Rectangles NovaLCT zone par zone (un port ne passe jamais d'une zone à l'autre).
function rectanglesZones(m, dalle, capacite) {
  // Zone de forme libre : les colonnes entières comptées en rectangles sont déjà réalisables (9b, Z21).
  const enRectangles = (s, fiche) => {
    const px = fiche.pxH * fiche.pxV;
    const charge = { capacite, rectangle: true, pxParDalle: px, pxParDemi: m.demi ? m.demi.pxH * m.demi.pxV : px };
    const ports = cablageForme(s, Math.floor(capacite / px + EPS), charge).colonnes.ports;
    return { ports, colonnes: null, rangees: null, redondance: 2 * ports };
  };
  const parZone = mursDesZones(m, dalle).map((s) => (s.forme ? enRectangles(s, s.fiche ?? dalle) : rectanglesNovaLCT(s, s.fiche ?? dalle, capacite)));
  if (parZone.some((r) => !r)) return null;
  const ports = parZone.reduce((t, r) => t + r.ports, 0);
  return { ports, colonnes: parZone[0].colonnes, rangees: parZone[0].rangees, redondance: 2 * ports, parZone };
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

// Megapixel HELIOS : capacité d'un port (ou d'une sortie 10G) lue dans le tableau de la page de support, colonnes 1G,
// 2,5G et 10G, en 10 et 12 bits. 8 bits : valeurs du 10 bits (déduit, 8 bits non publié). Fréquence absente : la ligne
// publiée juste au-dessus, la plus défavorable (59,94 → 60 Hz ; 100 → 120 Hz), déduit. Au-delà de 240 Hz : null.
const LIENS_HELIOS = ['1G', '2.5G', '10G'];
const NOMS_LIEN_HELIOS = { '1G': '1G', '2.5G': '2,5G', '10G': '10G' };
export function capaciteHelios(proc, { frequenceHz = 60, bits = BIT_DEPTH_PAR_DEFAUT.megapixel, lien = '1G' } = {}) {
  const lignes = [...(proc.capacitesHelios ?? [])].sort((a, b) => a.frequenceHz - b.frequenceHz);
  const exacte = lignes.find((l) => Math.abs(l.frequenceHz - frequenceHz) < 0.01);
  const ligne = exacte ?? lignes.find((l) => l.frequenceHz > frequenceHz);
  const colonne = bits === 8 ? 10 : bits;
  const valeurs = ligne?.[`bits${colonne}`];
  if (!valeurs) return null;
  const capacite = valeurs[LIENS_HELIOS.indexOf(lien)];
  const notes = [];
  if (bits === 8) notes.push('8 bits : valeurs du 10 bits, déduit, 8 bits non publié par Megapixel');
  if (!exacte) notes.push(`${nombreCourt(frequenceHz)} Hz absent du tableau Megapixel : ligne de ${ligne.frequenceHz} Hz, la plus proche au-dessus, déduit`);
  return {
    capacite,
    frequenceHz: ligne.frequenceHz,
    deduit: notes.length > 0,
    notes,
    formule: `${nombreCourt(capacite)} px (tableau Megapixel, ${ligne.frequenceHz} Hz, ${colonne} bits, lien ${NOMS_LIEN_HELIOS[lien]})`,
  };
}

// HELIOS vu avec ses switches (8K, 4K) ou ses ports directs (Jr) : lien des dalles (1G par défaut, 2,5G si la dalle
// le permet), switch choisi (M4250 par défaut, M4200) et mode 20G (M4250 : 2 fibres par switch, ports 1 à 6 et 7 à 12).
// Ports utilisés par fibre 10G : le plus petit des ports du switch et de ce que la fibre transporte (10G / port).
// HELIOS Jr : deux limites distinctes, son canvas d'entrée (4096 × 2160, déduit, à confirmer) et sa capacité de charge
// LED, 8 ports × la capacité d'un port 1G du tableau, à la fréquence et à la profondeur du calcul.
// Canvas du HELIOS 8K (données) : 8192 × 4320 px, déduit, à confirmer, lu comme 4 entrées 12G-SDI de 4096 × 2160
// assemblées ; autre lecture possible, un lien quad 12G-SDI qui porte une seule image de 7680 × 4320 (8K UHD). Une
// fiche détaillée devra trancher.
// Renvoie { proc, notes } ou { refus }.
function processeurMegapixel(proc, reglages, { frequenceHz, bits }) {
  const lien = reglages.lienMegapixel === '2.5G' ? '2.5G' : '1G';
  const notes = [];
  if (!capaciteHelios(proc, { frequenceHz, bits, lien: '1G' })) {
    return { refus: `${proc.nom} : ${nombreCourt(frequenceHz)} Hz hors du tableau Megapixel (240 Hz au plus, fiche HELIOS 2023).` };
  }
  if (lien === '2.5G') notes.push('Dalles en 2,5G : « 2.5G connectivity is dependent on the tile design » (support Megapixel) ; vérifie que tes dalles le permettent.');
  if (!(proc.sorties10G > 0)) {
    if (lien === '2.5G') return { refus: `${proc.nom} : ports 1G en cuivre seulement (« 8 x 1G Copper SFP », fiche HELIOS 2023), pas de lien 2,5G.` };
    if (!proc.pixelsMaxParPorts) return { proc: { ...proc, lienPorts: '1G' }, notes: [] };
    const r = capaciteHelios(proc, { frequenceHz, bits, lien: '1G' });
    const s = proc.sources?.pixelsMaxParPorts;
    const pixels = proc.ports * r.capacite;
    const retenue = {
      valeur: pixels, source: s?.source, sources: s ? [s.source] : [], type: null, declinaisons: [], autres: [], conflit: false,
      note: `${proc.ports} ports × ${nombreCourt(r.capacite)} px (tableau Megapixel, ${r.frequenceHz} Hz, ${bits === 8 ? 10 : bits} bits, lien 1G)`,
    };
    return { proc: { ...proc, lienPorts: '1G', pixelsMax: pixels, sources: { ...proc.sources, pixelsMax: retenue } }, notes: [] };
  }
  const id = reglages.switchMegapixel && proc.distributeursPossibles?.includes(reglages.switchMegapixel) ? reglages.switchMegapixel : proc.distributeur;
  const sw = (reglages.distributeurs ?? []).find((x) => x.id === id);
  if (!sw) return { refus: `${proc.nom} : switch ${id} absent de la base, pas de calcul.` };
  if (lien === '2.5G' && !sw.lien25G) {
    return { refus: `${sw.modele} : ports 1G seulement (${minuscule(sw.sources?.vitessePorts?.source.court) ?? 'sa fiche'}) ; le lien 2,5G demande un M4250.` };
  }
  const mode20G = reglages.mode20G === true;
  if (mode20G && !sw.mode20G) {
    return { refus: `Mode 20G : M4250 seulement (« ${sw.sources?.mode20G?.note?.replace(/^« | »$/g, '') ?? 'NOT available with the older 8-port M4200 switches'} », notes de version HELIOS v25.11.0).` };
  }
  const port = capaciteHelios(proc, { frequenceHz, bits, lien }).capacite;
  const fibre = capaciteHelios(proc, { frequenceHz, bits, lien: '10G' }).capacite;
  const parLienMax = mode20G ? Math.floor(sw.ports / 2) : sw.ports;
  const parBande = Math.floor(fibre / port + EPS);
  const parLien = Math.min(parLienMax, parBande);
  const parSwitch = mode20G ? 2 * parLien : parLien;
  // Mode 20G : un switch par paire de sorties 10G. Sortie impaire (HELIOS 4K : 3 sorties) laissée sans switch pour
  // l'instant ; elle pourra plus tard être branchée sur un switch simple, non agrégé.
  const switches = mode20G ? Math.floor(proc.sorties10G / 2) : proc.sorties10G;
  notes.push(`${sw.modele}${mode20G ? ' en mode 20G' : ''} : ${parSwitch} ports ${NOMS_LIEN_HELIOS[lien]} utilisés sur ${sw.ports} par switch `
    + `(${mode20G ? `${parLien} par fibre, ` : ''}${nombreCourt(fibre)} px par fibre 10G, ${nombreCourt(port)} px par port), `
    + `${switches} switch${switches > 1 ? 'es' : ''} au plus par ${proc.modele}.`);
  if (mode20G && proc.sorties10G % 2 === 1) {
    notes.push(`Mode 20G : ${proc.sorties10G} sorties 10G sur le ${proc.modele}, ${switches} switch${switches > 1 ? 'es' : ''} en 20G, une sortie 10G sans switch.`);
  }
  return {
    proc: {
      ...proc, lienPorts: lien, ports: switches * parSwitch, sortiesParDistributeur: parSwitch, distributeur: sw.id, distributeurObligatoire: true,
    },
    notes,
  };
}

// Pixels maxi pour ranger les processeurs du plus petit au plus grand : ceux de la fiche, sinon (HELIOS Jr) ses ports ×
// la capacité d'un port 1G à 60 Hz, dans la profondeur par défaut de sa marque.
export function pixelsPourClassement(proc) {
  if (proc.pixelsMax > 0) return proc.pixelsMax;
  if (proc.pixelsMaxParPorts && proc.ports > 0) {
    const r = capaciteHelios(proc, { frequenceHz: 60, bits: BIT_DEPTH_PAR_DEFAUT[proc.famille], lien: '1G' });
    return r ? proc.ports * r.capacite : null;
  }
  return null;
}

// SX40 et S8 : capacité en pixels selon la fréquence (aide en ligne Tessera 12.2.5 et 12.2.4 ; S8 par analogie).
// Au-delà de 60 Hz, maximum × 60 / fréquence, ou la valeur publiée si elle est plus basse (SX40 : 2,15 M à 250 Hz) ;
// en ULL, divisée par 2 et remontée sous 60 Hz jusqu'au maximum (le canvas de 4094 × 2047 px limite ensuite à 8,38 M).
// Sans règle sur la fiche : null.
export function pixelsMaxSelonFrequence(proc, { frequenceHz = 60, ull = false } = {}) {
  const points = proc.capaciteSelonFrequence;
  if (!Array.isArray(points) || !(frequenceHz > 0)) return null;
  const maximum = proc.pixelsMaxReference ?? proc.pixelsMax;
  const proportion = (maximum * 60) / frequenceHz;
  const publie = frequenceHz > 60 ? points.find((p) => Math.abs(p.frequenceHz - frequenceHz) < 0.01 && p.pixels < proportion) : null;
  const brut = publie ? publie.pixels : proportion;
  const avecUll = ull && proc.ullPossible === true;
  const valeur = Math.min(maximum, avecUll ? brut / 2 : brut);
  // La règle de fréquence (et sa source) ne sert qu'hors 60 Hz ; l'ULL divise par 2 sur SX40 et S8 (aide 12.2.4).
  const horsSoixante = Math.abs(frequenceHz - 60) > EPS;
  const source = horsSoixante ? proc.sources?.capaciteSelonFrequence?.source : null;
  const sourceUll = avecUll ? proc.sources?.ullPossible?.source : null;
  const mpx = (x) => `${nombreCourt(x / 1e6, 3)} M`;
  let detail = horsSoixante ? `${mpx(maximum)} × 60 / ${nombreCourt(frequenceHz)}` : mpx(maximum);
  if (publie) detail = `${mpx(publie.pixels)} publiés (la proportion donne ${mpx(proportion)})`;
  return {
    valeur,
    maximum,
    deduit: /déduit/.test(source?.confiance ?? ''),
    sources: [source, sourceUll].filter(Boolean),
    texte: `Capacité du ${proc.nom} à ${nombreCourt(frequenceHz)} Hz${avecUll ? ' en ULL' : ''} : ${detail}${avecUll ? ' / 2 (ULL)' : ''} = ${mpx(valeur)} px `
      + `(${[source?.court, sourceUll?.court].filter(Boolean).map(minuscule).join(', ')}).`,
  };
}

// Distributeur Brompton choisi pour le processeur (XD-T, XD-S avec un SX40) : ports utilisés sur ceux de sa fiche,
// entrée fibre seulement, modules SFP+ obligatoires (alerte), capacité déduite et chaînage non écrit (notes).
function notesDistributeur(d, proc) {
  const alertes = [];
  const notes = [];
  const source = (champ) => minuscule(d.sources?.[champ]?.source.court) ?? `fiche ${d.modele}`;
  if (d.sortiesAvecSX40 && d.sortiesAvecSX40 < d.sorties) {
    notes.push(`${d.modele} avec un ${proc.modele} : ${d.sortiesAvecSX40} premiers ports sur ${d.sorties} (${source('sortiesAvecSX40')}).`);
  }
  if (d.entreeFibreSeulement) notes.push(`${d.modele} : entrée fibre seulement (${d.entree}), pas de cuivre 10G depuis le ${proc.modele}.`);
  if (d.modulesSfpAvecSX40) {
    alertes.push(`${d.modele} avec un ${proc.modele} : modules SFP+ ${d.modulesSfpAvecSX40} obligatoires, cages livrées vides (${source('modulesSfpAvecSX40')}).`);
  }
  const capacite = d.sources?.capaciteNominalePort;
  if (capacite && /déduit/.test(capacite.source.confiance)) {
    notes.push(`${d.modele} : ${nombreCourt(d.capaciteNominalePort)} px par port à 60 Hz en 8 bits, ${minuscule(capacite.source.court)}, absent de sa fiche ; `
      + 'la capacité suit la formule Tessera, comme sur le XD.');
  }
  if (proc.famille === 'brompton' && d.chainageXdMax === undefined) notes.push(`${d.modele} : chaînage à confirmer (non écrit sur sa fiche).`);
  return { alertes, notes };
}

// Évalue un processeur pour un mur : capacité, dalles par port, ports, contrôles, nombre de processeurs,
// découpage, ports et distributeurs par processeur.
// Réglages : frequenceHz, bits, ull (Brompton), cartesPro et modeOptique (MX40 Pro), redondance.
export function evaluerProcesseur(m, dalle, procFiche, reglages = {}) {
  // MX2000 Pro, MX6000 Pro : ports, convertisseurs et capacité selon la carte de sortie retenue.
  let avecCartes = procFiche.carteSortie1G || procFiche.carteSortie5G
    ? processeurAvecCartes(procFiche, dalle, reglages.carteSortie, { bits: reglages.bits ?? BIT_DEPTH_PAR_DEFAUT[procFiche.famille], frequenceHz: reglages.frequenceHz ?? 60 })
    : null;
  if (procFiche.cartesSortieLED?.length && procFiche.emplacementsSortie > 0) avecCartes = processeurAvecCartesLED(procFiche, reglages.carteSortie, dalle);
  let proc = avecCartes?.proc ?? procFiche;
  const {
    frequenceHz = 60, bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], ull = false, cartesPro = false,
    redondance = false, modeOptique = false,
  } = reglages;
  // SX40 : XD, XD-T ou XD-S au choix (onglet Data) ; 10 ports par unité avec un SX40.
  if (reglages.distributeur && procFiche.distributeursPossibles?.includes(reglages.distributeur)) {
    proc = { ...proc, distributeur: reglages.distributeur };
  }
  // Megapixel HELIOS : switches (8K, 4K) ou ports directs (Jr), lien des dalles 1G ou 2,5G, mode 20G.
  const megapixel = proc.capacitesHelios ? processeurMegapixel(proc, reglages, { frequenceHz, bits }) : null;
  if (megapixel?.proc) proc = megapixel.proc;
  // ULL (SX40, S8) : canvas de 720 à 2047 px de haut, l'EDID faisant deux fois la hauteur du canvas ;
  // les préréglages plus hauts (4K DCI) disparaissent.
  let formatsRetiresUll = [];
  if (ull && proc.ullHauteurMaxPx && proc.hauteurMaxPx > proc.ullHauteurMaxPx) {
    formatsRetiresUll = (proc.formatsCanvas ?? []).filter((f) => f.hauteurPx > proc.ullHauteurMaxPx);
    proc = {
      ...proc,
      hauteurMaxPx: proc.ullHauteurMaxPx,
      formatsCanvas: (proc.formatsCanvas ?? []).filter((f) => f.hauteurPx <= proc.ullHauteurMaxPx),
      sources: { ...proc.sources, hauteurMaxPx: proc.sources?.ullHauteurMaxPx ?? proc.sources?.hauteurMaxPx },
    };
  }
  // SX40 et S8 : capacité en pixels au-delà de 60 Hz et en ULL. Le maximum de la fiche reste en `pixelsMaxReference`,
  // pour qu'un nouveau calcul avec ce processeur (rappel en 10 bits) ne la divise pas deux fois.
  const selonFrequence = pixelsMaxSelonFrequence(proc, { frequenceHz, ull });
  const noteCapacite = selonFrequence && Math.abs(selonFrequence.valeur - selonFrequence.maximum) > EPS ? selonFrequence.texte : null;
  if (noteCapacite) {
    const s = proc.sources?.pixelsMax;
    proc = {
      ...proc,
      pixelsMaxReference: selonFrequence.maximum,
      pixelsMax: selonFrequence.valeur,
      sources: {
        ...proc.sources,
        pixelsMax: s && { ...s, valeur: selonFrequence.valeur, sources: [...s.sources, ...selonFrequence.sources.filter((x) => !s.sources.some((y) => y.id === x.id))] },
      },
    };
  }
  const reglagesCapacite = {
    frequenceHz,
    bits,
    ull: ull && proc.famille === 'brompton',
    cartesPro: cartesPro && proc.cartesPro === true,
  };
  const vide = {
    processeur: proc, reglages: { ...reglagesCapacite, redondance, modeOptique }, global: null, controles: {}, limites: [],
    nombre: null, grille: null, unSeulSuffit: false, groupes: [], totaux: null, seuil: null, alertes: [], notes: [], aCompleter: [], manques: [],
  };
  // SP60 Pro (sous-pixel) : fiche d'information, calcul hors appli.
  if (proc.calculHorsAppli) return { ...vide, impossible: `${proc.nom} : ${proc.calculHorsAppli}.` };
  // KU20 : 8 bits par défaut, 10 bits seulement avec un programme personnalisé ; MCTRL300 : pas d'entrée 10 bits ;
  // Colorlight : capacité 12 bits non publiée.
  const refusBits = refusBitsReseau(proc, bits);
  if (refusBits) return { ...vide, impossible: refusBits };
  // ULL : SX40 et S8 seulement ; les S4, M2 et T1 ont leur Low Latency Mode, par leurs formats de canvas.
  if (ull && proc.famille === 'brompton' && proc.ullPossible === false) {
    const s = proc.sources?.ullPossible;
    return {
      ...vide,
      impossible: `ULL : fonction des SX40 et S8 seulement (${[s?.note, minuscule(s?.source.court)].filter(Boolean).join(', ')}) ; `
        + `le ${proc.nom} a son Low Latency Mode, par ses formats de canvas Low Latency. Décoche l'ULL.`,
    };
  }
  if (megapixel?.refus) return { ...vide, impossible: megapixel.refus };
  const manquants = champsManquants(proc);
  if (procFiche.statut === 'information') {
    return { ...vide, aCompleter: manquants, impossible: `${proc.nom} : fiche d'information, à compléter avec une fiche constructeur ; aucun calcul avec ce modèle.` };
  }
  if (manquants.length > 0) {
    return { ...vide, aCompleter: manquants, impossible: `Fiche du ${proc.nom} à compléter : aucun calcul avec ce modèle.` };
  }
  // Mur mixte (9b3) : mapping interpolé sur les Tessera M2 et T1 quand le mur a plusieurs pitchs (Z17), 1:1 au choix ou
  // ailleurs ; chaque dalle du mur passe les contrôles de carte et de dalle, la capacité d'un port est la plus basse.
  let mapping = null;
  if (m.mixte) {
    const pitchs = new Set(m.zones.map((z) => Math.round(((z.dalle.pxReels ? z.dalle.largeurMm / z.dalle.pxReels.pxH : z.dalle.largeurMm / z.dalle.pxH)) * 1e6)));
    mapping = proc.mappingInterpole && pitchs.size > 1 && reglages.mapping !== '1:1' ? 'interpole' : '1:1';
    if (mapping === 'interpole' && m.mapping !== 'interpole') {
      m = murZones(dalle, m.saisie.zones, { ...m.saisie.options, mapping: 'interpole' });
      dalle = m.dallePrincipale;
    }
  }
  const fichesMur = m.mixte ? [...new Map(m.zones.flatMap((z) => [z.dalle, z.demi]).filter(Boolean).map((f) => [f.id, f])).values()] : [dalle, m.demi].filter(Boolean);
  const fichesPrincipales = m.mixte ? [...new Map(m.zones.map((z) => [z.dalle.id, z.dalle])).values()] : [dalle];
  const cartes = fichesPrincipales.map((f) => verifierCarte(f, proc));
  const refusCarte = cartes.find((x) => x.refus);
  if (refusCarte) return { ...vide, impossible: refusCarte.refus };
  const carte = { alerte: cartes.map((x) => x.alerte).filter(Boolean).join(' ') || null };

  // Carte de réception connue : capacité d'une carte face à la dalle (et à la demi-dalle), alerte sans refus.
  const cartesReception = fichesMur.map((x) => controleCarteReception(x, reglages.cartesReception, bits)).filter(Boolean);
  const qualite = fichesPrincipales.map((f) => capacitePortProcesseur(proc, { ...reglagesCapacite, carte: f.carteReceptionModele ?? null }))
    .reduce((a, b) => (b.capacite < a.capacite ? b : a));
  const capacite = qualite.capacite;
  const alertes = qualite.notes.map((note) => `Capacité par port du ${proc.nom} : ${note}.`);
  if (avecCartes?.alerte) alertes.push(...[].concat(avecCartes.alerte));
  alertes.push(...cartesReception.map((x) => x.alerte).filter(Boolean));
  // Manques de la fiche qui touchent ce calcul : leur texte est aussi une alerte.
  const manques = [];
  if (carte.alerte) manques.push({ champ: 'carteReceptionModele', texte: carte.alerte });
  // Fiche incomplète : sans modèle de carte de réception, la compatibilité n'est pas vérifiée (le CX40 Pro a déjà son alerte).
  for (const f of fichesPrincipales) {
    if (!proc.cartesCompatibles && !f.carteReceptionModele) {
      manques.push({
        champ: 'carteReceptionModele',
        texte: `Carte de réception ${f.carteReceptionMarque ? `${f.carteReceptionMarque} sans modèle précisé` : 'absente de la fiche'} `
          + `pour la dalle ${f.nom} : compatibilité avec le ${proc.nom} non vérifiée.`,
      });
    }
  }
  alertes.push(...manques.map((x) => x.texte));
  const petites = fichesMur.some((d) => d.pxH < 16 || d.pxV < 16);
  if (proc.famille === 'brompton' && petites) {
    alertes.push('Dalles de moins de 16 px dans une dimension : elles coûtent cher en traitement et on peut en brancher '
      + 'moins que la capacité nominale (manuel Tessera §13.1.4). Vérifie les barres de charge dans Tessera.');
  }
  // HFR (SX40, S8, au-delà de 60 Hz) : dalles à carte R2 ou R2+ d'environ 108 000 px au plus.
  const hfr = proc.hfrPxMaxDalle;
  if (hfr && frequenceHz > 60) {
    const source = proc.sources?.hfrPxMaxDalle;
    const origine = [source?.note, minuscule(source?.source.court)].filter(Boolean).join(', ');
    for (const x of fichesMur.filter((y) => y.pxH * y.pxV > hfr)) {
      alertes.push(`HFR à ${nombreCourt(frequenceHz)} Hz : la dalle ${x.nom} fait ${x.pxH} × ${x.pxV} = ${nombreCourt(x.pxH * x.pxV)} px ; `
        + `le HFR demande des dalles à carte R2 ou R2+ d'environ ${nombreCourt(hfr)} px au plus${origine ? ` (${origine})` : ''}, `
        + 'avec des circuits de commande qui le supportent. Vérifie avec Brompton que la dalle le permet.');
    }
  }
  const pxParDalle = pixelsComptes(dalle, proc);
  const pxParDemi = m.demi ? pixelsComptes(m.demi, proc) : pxParDalle;
  const plafond = redondance && proc.maxDallesParBoucleRedondance ? proc.maxDallesParBoucleRedondance : Infinity;
  const parPort = dallesParPort(capacite, pxParDalle, { plafond });
  const optique = modeOptique && Boolean(proc.portsOptionOptique);
  if (proc.typePorts === '5G') {
    alertes.push(`Câbles de tête du ${proc.nom} (ports à 5 Gbit/s) : ${texteCable5G(proc)}.`);
  }
  // Informations sans alerte (Colorlight : règle des 1280 px de la fiche S20 sur un autre modèle).
  const notes = [];
  if (noteCapacite) notes.push(noteCapacite);
  notes.push(...(megapixel?.notes ?? []), ...(avecCartes?.notes ?? []));
  if (proc.famille === 'megapixel' && redondance) {
    alertes.push('Redondance Megapixel (SeamlessLoop) : non modélisée par l\'appli ; ports doublés par prudence, vérifie la configuration dans HELIOS.');
  }
  if (reglagesCapacite.ull && proc.ullHauteurMaxPx) {
    const source = proc.sources?.ullHauteurMaxPx?.source;
    notes.push(`ULL : canvas de ${proc.canvasLibre?.hauteurMinPx ?? 720} à ${proc.ullHauteurMaxPx} px de haut (l'EDID fait deux fois la hauteur du canvas)`
      + `${formatsRetiresUll.length ? `, sans ${formatsRetiresUll.map((f) => `le format ${f.nom}`).join(', ')}` : ''} ; `
      + `entrée HDMI seulement, pas de SDI (${minuscule(source?.court) ?? 'aide en ligne Tessera'}).`);
  }
  // Distributeur choisi (XD-T, XD-S) : ports utilisés avec ce processeur, entrée, modules, valeurs déduites.
  const distributeur = proc.distributeursPossibles && reglages.distributeurs?.find((x) => x.id === proc.distributeur);
  if (distributeur) {
    const r = notesDistributeur(distributeur, proc);
    alertes.push(...r.alertes);
    notes.push(...r.notes);
  }
  // Capacité de l'appareil : ports utiles × capacité d'un port, plafonnée par le total de la fiche
  // (VX4S : 4 × 650 000 = 2,6 M, mais 2,3 M au total). En redondance, les ports principaux seulement.
  const portsSorties = optique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports;
  const portsAppareil = redondance ? (proc.portsRedondance ?? Math.floor(portsSorties / 2)) : portsSorties;
  const sommePorts = portsAppareil * capacite;
  const capaciteAppareil = {
    ports: portsAppareil,
    capacitePort: capacite,
    sommePorts,
    pixelsMax: proc.pixelsMax,
    valeur: Math.min(sommePorts, proc.pixelsMax),
    limite: sommePorts < proc.pixelsMax - EPS ? 'ports' : 'total',
  };
  const base = {
    ...vide,
    reglages: { ...reglagesCapacite, redondance, modeOptique: optique },
    carteReception: cartesReception,
    // Convertisseurs obligatoires (XD du SX40, CVT10 du MX40 Pro en mode 40 ports), comptés par processeur.
    distributeurObligatoire: Boolean(proc.distributeurObligatoire || (optique && proc.distributeurObligatoireOptique)),
    capacite,
    formule: qualite.formule,
    champCapacite: qualite.champ,
    capaciteDeduite: qualite.deduit,
    capaciteAConfirmer: qualite.aConfirmer,
    capaciteAppareil,
    alertes,
    notes,
    manques,
    pxParDalle,
    pxParDemi: m.demi ? pxParDemi : null,
    dallesParPort: parPort,
    plafondBoucle: Number.isFinite(plafond) && parPort === plafond,
  };
  // Mur mixte : chaque dalle doit tenir dans un port.
  const tropGrande = fichesMur.map((f) => pixelsComptes(f, proc)).find((px) => dallesParPort(capacite, px) < 1);
  if (parPort < 1 || tropGrande) {
    return {
      ...base,
      impossible: `Une dalle de ${nombreCourt(parPort < 1 ? pxParDalle : tropGrande)} px dépasse la capacité d'un port (${nombreCourt(entierInferieur(capacite))} px).`,
    };
  }
  if (redondance && !proc.portsRedondance && proc.ports < 2) {
    return { ...base, impossible: `Le ${proc.nom} n'a qu'un seul port : pas de redondance possible.` };
  }

  // En redondance, nombre pair de colonnes par port pour que chaque chaîne revienne au bord de départ,
  // sauf s'il coûte un processeur : alors le plus de colonnes par port, et des retours de secours longs.
  // Variante de découpage retenue dans Data (9b2, Z20), en zones seulement.
  const variantes = ['zonesEntieres', 'unParZone'];
  const decoupage = plusieursZones(m) && m.zones.length > 1 && variantes.includes(reglages.decoupage) ? reglages.decoupage : null;
  const contexte = {
    parPort, capacite, redondance, modeOptique: optique, pair: redondance, ...(decoupage ? { decoupage } : {}),
    // NovaLCT : une zone de forme libre charge chaque port du rectangle qui englobe ses dalles (Z21).
    charge: { capacite, pxParDalle, pxParDemi, plafond, ...chargeGeometrie(proc, dalle, m), ...(proc.logiciel === 'NovaLCT' ? { rectangle: true } : {}) },
  };
  // Mur mixte (9b3) : la charge d'un port selon la dalle de sa zone.
  if (m.mixte) {
    contexte.chargeDe = (fiche, demiFiche) => {
      const px = pixelsComptes(fiche, proc);
      const pxDemi = demiFiche ? pixelsComptes(demiFiche, proc) : px;
      return {
        parPort: dallesParPort(capacite, px, { plafond }),
        charge: { ...contexte.charge, pxParDalle: px, pxParDemi: pxDemi, ...chargeGeometrie(proc, fiche, { demi: demiFiche }) },
      };
    };
  }
  const chargeDe = (s) => (contexte.chargeDe && s.fiche ? contexte.chargeDe(s.fiche, s.demiFiche).charge : contexte.charge);
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
  // MX6000 Pro : 16 384 px par carte de sortie, mais 8192 px par entrée : au-delà, un seul processeur, plusieurs sources.
  const maxSource = proc.sourceMaxPx;
  const bloc = maxSource ? d.groupes.find((g) => g.largeurPx > maxSource || g.hauteurPx > maxSource) : null;
  if (bloc) {
    alertes.push(`Le bloc du ${proc.nom} fait ${nombreCourt(bloc.largeurPx)} × ${nombreCourt(bloc.hauteurPx)} px : plusieurs sources nécessaires `
      + `(${maxSource} px maxi par entrée), chacune sur une partie du canvas.`);
  }
  // COEX 1G : un port qui charge une seule colonne de moins de 128 px de large perd de la capacité.
  const lmin = proc.largeurChargeeMinPx;
  if (lmin && d.global) {
    const col = d.global.colonnes;
    const largeur = (col.colonnesParPort ?? 1) * dalle.pxH;
    const hauteur = col.colonnesParPort ? hauteurPortsPx(m) : Math.max(...col.segments) * dalle.pxV;
    if (largeur < lmin) {
      // Ports 5G : manuel MX6000 Pro V1.5.1 (p. 49), ou la même règle par analogie (CX40 Pro, MX2000 Pro).
      const s = proc.sources?.largeurChargeeMinPx;
      const deduit = /déduit/.test(s?.source.confiance ?? '');
      let origine = deduit ? 'règle de la fiche MX40 Pro, appliquée par analogie : déduit' : 'fiche MX40 Pro V1.5.0, wiki COEX';
      if (proc.typePorts === '5G') origine = deduit ? 'règle du manuel MX6000 Pro V1.5.1, p. 49, pour les ports 5G, appliquée par analogie : déduit'
        : `${minuscule(s?.source.court) ?? 'fiche'}${s?.note ? `, ${s.note}` : ''}`;
      alertes.push(`Ports ${proc.typePorts === '5G' ? '5G' : '1G'} du ${proc.nom} : un port charge ${nombreCourt(largeur)} px de large, moins de ${lmin} px ; sa capacité baisse de `
        + `(${lmin} − ${nombreCourt(largeur)}) × ${nombreCourt(hauteur)} = ${nombreCourt(penaliteLargeurChargee(largeur, hauteur, lmin))} px `
        + `(${origine}). Colonnes comptées en conséquence.`);
    }
  }
  // Colorlight : zone d'un port limitée en largeur et en hauteur ; alerte chiffrée quand la limite coûte des ports.
  const dmax = proc.dimensionMaxPortPx;
  if (dmax && d.global) {
    const sansLimite = cablageMur(m, dalle, parPort, { ...contexte.charge, dimensionMaxPx: undefined }, { pair: contexte.pair });
    const col = d.global.colonnes;
    if (col.ports > sansLimite.colonnes.ports) {
      const source = proc.sources?.dimensionMaxPortPx;
      const detail = col.colonnesParPort
        ? `${quantite(col.colonnesParPort, 'colonne')} par port au lieu de ${sansLimite.colonnes.colonnesParPort ?? 1}`
        : `chaque colonne (${nombreCourt(hauteurPortsPx(m))} px de haut) coupée en ${col.segments.length} segments égaux (${col.segments.join(' + ')} dalles)`;
      alertes.push(`Ports du ${proc.nom} : ${dmax} px de large ou de haut au plus par port (${source?.source.court ?? 'fiche'}`
        + `${/déduit/.test(source?.source.confiance ?? '') ? ', déduit' : ''}) : ${detail}, `
        + `${quantite(col.ports, 'port')} au lieu de ${quantite(sansLimite.colonnes.ports, 'port')}.`);
    }
  }
  // Colorlight 1G : capacité réduite au-delà de 1280 px de haut (fiche S20). Alerte sur les modèles dont la fiche le dit,
  // simple note sur les autres.
  if (proc.famille === 'colorlight' && proc.typePorts !== '5G' && d.global) {
    const col = d.global.colonnes;
    const hauteurPort = col.colonnesParPort ? hauteurPortsPx(m) : Math.max(...col.segments) * dalle.pxV;
    const seuil = proc.hauteurReduitePortPx ?? HAUTEUR_REDUITE_S20_PX;
    if (hauteurPort > seuil) {
      const source = proc.sources?.hauteurReduitePortPx?.source;
      if (proc.hauteurReduitePortPx) {
        alertes.push(`Ports du ${proc.nom} : un port charge ${nombreCourt(hauteurPort)} px de haut ; capacité réduite au-delà de ${seuil} px de haut, `
          + `valeur non publiée : vérifie dans LEDVISION (${source?.court ?? 'fiche'}).`);
      } else {
        notes.push(`Ports du ${proc.nom} : un port charge ${nombreCourt(hauteurPort)} px de haut. La fiche S20 annonce une capacité réduite au-delà de `
          + `${HAUTEUR_REDUITE_S20_PX} px de haut : règle écrite sur la fiche S20, non confirmée pour ce modèle.`);
      }
    }
  }
  // Sorties fibre qui copient ou secourent les ports Ethernet (MCTRL4K) : elles n'ajoutent aucune capacité.
  if (proc.sortiesFibre === 'copie') {
    const note = proc.sources?.sortiesFibre?.note;
    alertes.push(`Sorties fibre du ${proc.nom} : copies ou secours des ports Ethernet, aucune capacité ajoutée `
      + `(${proc.ports} ports au plus)${note ? ` ; ${note}` : ''}.`);
  }
  // Au plus juste le long du vrai serpentin : il fait foi quand il diffère du décompte théorique (demi-dalles).
  const departCablage = reglages.departCablage ?? 'haut-gauche';
  const zones = plusieursZones(m);
  // Mur en zones : ports numérotés dans chaque processeur depuis le côté du départ, comme le Schéma.
  if (zones && departCablage.endsWith('droite')) {
    for (const g of d.groupes) {
      let numero = 1;
      for (const p of [...g.parties].reverse()) {
        p.ports.premier = numero;
        p.ports.dernier = numero + p.ports.colonnes - 1;
        numero += p.ports.colonnes;
      }
    }
  }
  for (const g of d.groupes) {
    g.ports.auPlusJusteSerpentin = zones
      ? g.parties.reduce((t, p) => t + portsSerpentin(p.sous ?? mur(dalle, p.colonnes, p.rangees), chargeDe(p.sous ?? {}), departCablage).length, 0)
      : portsSerpentin(sousMur(m, dalle, g.colonnes, g.premiereRangee, g.rangees), contexte.charge, departCablage).length;
  }
  // En zones, le serpentin de chaque zone : un port ne passe jamais d'une zone à l'autre.
  const serpentinGlobal = zones
    ? mursDesZones(m, dalle).flatMap((s) => portsSerpentin(s, chargeDe(s), departCablage))
    : portsSerpentin(m, contexte.charge, departCablage);
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
      // Ports des convertisseurs qui ne servent pas (CVT10 d'un VX400 Pro : 6 sur 10).
      portsNonUtilises: somme((g) => (redondance ? g.distributeurs.redondance * sorties - g.ports.redondance.colonnes
        : g.distributeurs.colonnes * sorties - g.ports.colonnes)),
    } : null,
    cartesSortie: proc.carteSortie ? somme((g) => (redondance ? g.cartesSortie.redondance : g.cartesSortie.colonnes)) : null,
  };
  // MX2000 Pro, MX6000 Pro, série H : « MX6000 Pro + 2 cartes 4x10G + 6 CVT10 », « H5 + 2 cartes H_20xRJ45 ».
  // Les convertisseurs n'y figurent que s'ils sont obligatoires.
  let configuration = null;
  if (proc.carteSortie && totaux) {
    const cartes = totaux.cartesSortie;
    const avecConvertisseurs = Boolean(proc.distributeurObligatoire && totaux.distributeurs);
    const convertisseurs = avecConvertisseurs ? (redondance ? totaux.distributeurs.redondance : totaux.distributeurs.colonnes) : 0;
    const modeleConvertisseur = MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'convertisseurs';
    configuration = `${d.nombre > 1 ? `${d.nombre} × ` : ''}${proc.modele} + ${cartes} carte${cartes > 1 ? 's' : ''} ${proc.carteSortie.nomCourt}`
      + `${avecConvertisseurs ? ` + ${convertisseurs} ${modeleConvertisseur}` : ''}${d.nombre > 1 ? ' au total' : ''}`;
  }

  // Alerte de seuil processeur : colonnes à retirer pour économiser un processeur.
  let colonnesEnMoins = null;
  // Pas de seuil pour une variante retenue : le seuil vaut pour le découpage conseillé.
  const seuilEnZones = zones ? (decoupage ? { colonnesEnMoins: null, zonesEnMoins: [] } : seuilZones(m, dalle, proc, contexte, d.nombre)) : null;
  if (seuilEnZones) colonnesEnMoins = seuilEnZones.colonnesEnMoins;
  else if (d.nombre > 1) {
    for (let c = m.colonnes - 1; c >= 1; c -= 1) {
      const n = decouper(sousMur(m, dalle, c, 1, m.rangees.length), dalle, proc, contexte).nombre;
      if (n !== null && n < d.nombre) {
        colonnesEnMoins = m.colonnes - c;
        break;
      }
    }
  }

  const rectangles = proc.logiciel !== 'NovaLCT' ? null : (zones ? rectanglesZones(m, dalle, capacite) : rectanglesNovaLCT(m, dalle, capacite));

  // Formes libres (9b) : fenêtres dans une colonne (Z22), vides selon la marque (Z18).
  for (const [a, b] of m.superposees ?? []) {
    alertes.push(`Zones ${a} et ${b} superposées dans la pixel map : elles affichent la même image (copie). Vérifie que c'est voulu.`);
  }
  for (const saut of m.sauts ?? []) {
    const colonne = m.zones.length > 1 ? `${saut.zone} · C${saut.colonne}` : `C${saut.colonne}`;
    alertes.push(`Colonne ${colonne} : saut de ${nombreCourt(saut.mm / 1000, 1)} m (${saut.dalles} ${saut.dalles > 1 ? 'dalles absentes' : 'dalle absente'}) `
      + `entre R${saut.entre[0]} et R${saut.entre[1]} : la chaîne garde son câble de liaison, plus long, à prévoir.`);
  }
  // Mur mixte (9b3, Z23) : un screen et un fichier de carte par dalle (NovaLCT), même modèle de carte (VMP), mapping.
  if (m.mixte && fichesPrincipales.length > 1) {
    if (proc.logiciel === 'NovaLCT') {
      notes.push('Dalles différentes sur un même processeur : un screen NovaLCT par dalle, chacun avec son fichier de carte de réception (RCFG) '
        + '(Formation, transcription 12 ; FAQ Novastar, via un revendeur).');
    }
    const modeles = [...new Set(fichesPrincipales.map((f) => f.carteReceptionModele).filter(Boolean))];
    if (proc.logiciel === 'VMP' && modeles.length > 1) {
      alertes.push(`VMP : des dalles de tailles différentes sur un même écran demandent le même modèle de carte de réception (manuel VMP V1.5.0, p. 7, `
        + `écrit pour le mode hors ligne) ; ici ${modeles.join(' et ')}. Vérifie dans VMP, ou sépare les dalles sur deux écrans.`);
    }
  }
  if (mapping === 'interpole') {
    notes.push(`Mapping interpolé du ${proc.nom} (manuel Tessera §6.5.1) : chaque dalle compte sa taille ÷ le pitch le plus fin du mur `
      + `(${nombreCourt(m.pasInterpole, 3)} mm), dans le canvas comme dans la charge des ports. Mapping 1:1 au choix (case « Pixel Pitch », manuel §8.1.1).`);
  }
  const avecVides = zones && (m.pxCanvas > m.pxTotal || m.zones.some((z) => z.forme));
  if (avecVides && proc.topologieLibre) {
    const s = proc.sources?.topologieLibre?.source;
    notes.push(`Vides du mur : topologie libre possible avec certaines cartes de réception (${s?.court ?? 'fiche'}, p. 3) : la charge d'un port compte alors les dalles seules. `
      + 'Cartes non nommées par la fiche : l\'appli garde le rectangle qui englobe les dalles de chaque port (topologie non libre).');
  }
  if (avecVides && FAMILLES_SANS_REGLE_VIDES.includes(proc.famille)) {
    notes.push(`Vides et dalles absentes : règle des vides non publiée par le constructeur du ${proc.nom}. L'appli compte les dalles seules ; `
      + 'vérifie la charge des ports dans le logiciel du processeur.');
  }

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
  if (c.cartes?.depasse) {
    alertes.push(`Le mur demande ${Number.isFinite(c.cartes.valeur) ? c.cartes.valeur : 'plus de'} cartes ${proc.carteSortie.nomCourt} (zone de `
      + `${nombreCourt(c.cartes.zone.largeurPx)} × ${nombreCourt(c.cartes.zone.hauteurPx)} px au plus par carte), au-delà des ${c.cartes.limite} `
      + `d'un ${proc.nom}${ilEnFaut(c.cartes.nombre)}.`);
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
      minimum: zones ? minimumTheoriqueZones(d.global, serpentinGlobal.length, mursDesZones(m, dalle), 'port', { pair: contexte.pair })
        : minimumTheorique(d.global, serpentinGlobal.length, m, 'port', { pair: contexte.pair }),
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
    configuration,
    // Redondance : nombre pair de colonnes par port appliqué, ou abandonné parce qu'il coûterait un processeur.
    colonnesPaires: contexte.pair,
    pairAbandonne,
    impossible: d.impossible,
    groupes: d.groupes,
    totaux,
    seuil: { dallesEnMoins: d.global.seuil.dallesEnMoins, colonnesEnMoins, ...(seuilEnZones ? { zonesEnMoins: seuilEnZones.zonesEnMoins } : {}) },
    // Mur mixte (9b3) : mapping retenu, mur calculé (en pixels interpolés le cas échéant), pixels comptés par dalle de zone.
    ...(m.mixte ? { mapping, mur: m, pixelsParDalle: m.zones.map((z) => ({ zone: z.nom, px: pixelsComptes(z.dalle, proc) })) } : {}),
    // Variantes de découpage (9b2, Z20), affichées sous le conseil, jamais conseillées d'office ; `decoupage` : celle retenue.
    ...(zones && m.zones.length > 1 ? {
      decoupage,
      // Processeurs du conseil, pour le comparer à la variante retenue.
      nombreConseil: decoupage ? decouper(m, dalle, proc, { ...contexte, decoupage: null }).nombre : d.nombre,
      variantes: Object.fromEntries(variantes.map((mode) => {
        const r = decouper(m, dalle, proc, { ...contexte, decoupage: mode });
        return [mode, { nombre: r.nombre, groupes: r.groupes, impossible: r.impossible ?? null }];
      })),
    } : {}),
  };
}

// Alternative « SX40 + XD » (onglet Data) : pour un Brompton autre que le SX40 (S8, S4, M2, T1), le SX40 évalué avec
// les mêmes réglages (fréquence, profondeur, ULL, redondance, XD choisi), quand il en demande strictement moins
// (2 processeurs remplacés par 1 compris : une seule source au lieu d'un canvas découpé). Une entrée vidéo par
// processeur. XD comptés à part : souvent montés au pied du mur, ils n'entrent pas dans les U de rack.
// `dansParc` : le SX40 fait partie du parc actif (sinon « hors parc », à demander au loueur). Sinon null.
export function alternativeSX40(m, dalle, evaluation, sx40, reglages = {}, { dansParc = true, nomParc = null } = {}) {
  const proc = evaluation?.processeur;
  if (!sx40 || proc?.famille !== 'brompton' || proc.id === sx40.id || !(evaluation.nombre > 0)) return null;
  const e = evaluerProcesseur(m, dalle, sx40, reglages);
  if (e.nombre === null || e.nombre >= evaluation.nombre) return null;
  const idXd = e.processeur.distributeur;
  const fiche = (reglages.distributeurs ?? []).find((x) => x.id === idXd);
  let liaison = 'fibre monomode, ou Cat6A 60 m au plus (aide en ligne Tessera, annexe B)';
  if (fiche?.entreeFibreSeulement || idXd === 'brompton-xd-t') liaison = 'fibre monomode seulement (entrée fibre du XD-T)';
  else if (fiche?.modulesSfpAvecSX40 || idXd === 'brompton-xd-s') liaison = 'fibre monomode, modules SFP+ 10GBASE-LR obligatoires';
  return {
    evaluation: e,
    nombre: e.nombre,
    xd: reglages.redondance ? e.totaux.distributeurs.redondance : e.totaux.distributeurs.colonnes,
    modeleXd: MODELES_DISTRIBUTEUR[idXd] ?? 'XD',
    remplace: proc.modele,
    nombreRemplace: evaluation.nombre,
    entrees: { avant: evaluation.nombre, apres: e.nombre },
    rack: proc.hauteurU > 0 && sx40.hauteurU > 0 ? { avant: evaluation.nombre * proc.hauteurU, apres: e.nombre * sx40.hauteurU } : null,
    liaison,
    horsParc: !dansParc,
    nomParc,
  };
}

// Conseil « toutes marques du parc » : chaque processeur évalué à la profondeur réseau par défaut de sa marque
// (réglage du parc compris, `bitsParFamille`), la marque choisie (`famille`) à la profondeur du formulaire.
export function evaluerToutesMarques(m, dalle, processeurs, reglages, { famille = null, bitsParFamille = {} } = {}) {
  return processeurs.map((p) => {
    const bits = p.famille === famille ? reglages.bits : (bitsParFamille[p.famille] ?? BIT_DEPTH_PAR_DEFAUT[p.famille] ?? reglages.bits);
    return evaluerProcesseur(m, dalle, p, { ...reglages, bits });
  });
}

// Processeur conseillé par défaut : le moins de processeurs, puis la plus petite capacité en pixels.
// Les évaluations portent déjà les réglages (redondance, mode optique) : le conseil en tient compte.
export function processeurConseille(evaluations) {
  const possibles = evaluations.filter((e) => e.nombre !== null);
  possibles.sort((a, b) => a.nombre - b.nombre || a.processeur.pixelsMax - b.processeur.pixelsMax);
  return possibles[0] ?? null;
}

// Brompton réglé au-delà de 10 bits : le même processeur en 10 bits, quand cela économise des processeurs
// (ligne ajoutée au rappel Tessera). Sinon null.
export function gainDixBits(m, dalle, evaluation) {
  const proc = evaluation?.processeur;
  if (proc?.famille !== 'brompton' || !(evaluation.reglages?.bits > 10) || evaluation.nombre === null) return null;
  const dix = evaluerProcesseur(m, dalle, proc, { ...evaluation.reglages, bits: 10 });
  if (dix.nombre === null || dix.nombre >= evaluation.nombre) return null;
  const ports = dix.totaux.ports.colonnes;
  const redondance = Boolean(evaluation.reglages.redondance);
  return {
    ports,
    nombre: dix.nombre,
    avant: evaluation.nombre,
    texte: `en 10 bits : ${ports} ports${redondance ? ` + ${ports} de secours` : ''}, ${dix.nombre} × ${proc.modele} au lieu de ${evaluation.nombre}`,
  };
}

// ---------------------------------------------------------------------------
// Module 2 : canvas et source
// ---------------------------------------------------------------------------

// Formats de source standard, du plus petit au plus grand : conseil par défaut et contrôle EDID.
export const RESOLUTIONS_STANDARD = [[1920, 1080], [3840, 2160], [4096, 2160]];
const NOMS_FAMILLE_LIAISON = { hdmi: 'HDMI', sdi: 'SDI', dvi: 'DVI', dp: 'DisplayPort', st2110: 'ST 2110', opt: 'OPT (fibre)', hdbaset: 'HDBaseT', dtp2: 'DTP2 (Extron)' };

function confianceDe(fiche, champs) {
  return champs.map((c) => fiche.sources?.[c]?.source.confiance ?? '');
}

// Fréquence pixel d'un format (total horizontal × total vertical × fréquence) : timings CTA-861 des formats
// standard ; sinon CVT à blanking réduit (CVT-RB), en approximation (choix de conception du projet).
const TIMINGS_CTA861 = [
  { l: 1280, h: 720, t: { 50: [1980, 750], 60: [1650, 750] } },
  { l: 1920, h: 1080, t: { 24: [2750, 1125], 25: [2640, 1125], 30: [2200, 1125], 50: [2640, 1125], 60: [2200, 1125], 100: [2640, 1125], 120: [2200, 1125] } },
  { l: 3840, h: 2160, t: { 24: [5500, 2250], 25: [5280, 2250], 30: [4400, 2250], 50: [5280, 2250], 60: [4400, 2250] } },
  { l: 4096, h: 2160, t: { 24: [5500, 2250], 25: [5280, 2250], 30: [4400, 2250], 50: [5280, 2250], 60: [4400, 2250] } },
];
// Cadence nominale d'une fréquence : 59,94 Hz a les timings du 60 Hz.
const cadenceNominale = (f, cadences) => cadences.find((c) => Math.abs(f - c) < 0.01 || Math.abs(f * 1.001 - c) < 0.01);
export function frequencePixel({ largeurPx, hauteurPx, frequenceHz }) {
  const format = TIMINGS_CTA861.find((x) => x.l === largeurPx && x.h === hauteurPx);
  const cadence = format && cadenceNominale(frequenceHz, Object.keys(format.t).map(Number));
  if (cadence) {
    const [totalH, totalV] = format.t[cadence];
    return { mhz: (totalH * totalV * frequenceHz) / 1e6, totalH, totalV, methode: 'CTA-861' };
  }
  // CVT à blanking réduit (version 1) : 160 px de blanking horizontal, 460 µs de blanking vertical au moins.
  const ratio = largeurPx / hauteurPx;
  const vSync = [[4 / 3, 4], [16 / 9, 5], [16 / 10, 6], [5 / 4, 7], [15 / 9, 7]].find(([r]) => Math.abs(ratio - r) < 0.01)?.[1] ?? 10;
  const periodeLigneUs = (1e6 / frequenceHz - 460) / hauteurPx;
  const lignesBlanking = Math.max(Math.floor(460 / periodeLigneUs) + 1, 3 + vSync + 6);
  const totalH = largeurPx + 160;
  const totalV = hauteurPx + lignesBlanking;
  return { mhz: Math.floor((frequenceHz * totalV * totalH) / 1e6 / 0.25 + EPS) * 0.25, totalH, totalV, methode: 'CVT-RB' };
}

// SDI : formats broadcast seulement, aux cadences normalisées.
const FORMATS_SDI = [[1920, 1080], [2048, 1080], [3840, 2160], [4096, 2160]];
const CADENCES_SDI = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

// Contrôle d'un format sur la norme de la liaison : fréquence pixel quand la liaison a une limite en MHz
// (HDMI 1.4, HDMI 2.0, DP 1.2) ; sinon débit de pixels actifs comparé à celui de son format maxi, en approximation
// (les formats forcés de même débit passent : 8192 × 1080 à 60 Hz).
function controleNorme(liaison, { largeurPx, hauteurPx, frequenceHz }) {
  const debitDemande = largeurPx * hauteurPx * frequenceHz;
  const debitMax = liaison.formatMaxLargeurPx * liaison.formatMaxHauteurPx * liaison.formatMaxFrequenceHz;
  const confiances = confianceDe(liaison, ['formatMaxLargeurPx', 'formatMaxHauteurPx', 'formatMaxFrequenceHz']);
  const base = {
    liaison, debitDemande, debitMax, alertes: [], raison: null,
    deduit: confiances.some((c) => /déduit/.test(c)),
    aConfirmer: confiances.some((c) => /à confirmer/.test(c)),
  };
  // Débit plein en 4:4:4 plus bas que le format maxi (HDBaseT 2.0 : « 4K@30 4:4:4/4K@60 4:2:0 ») : au-delà, 4:2:0 seulement.
  const f444 = liaison.format444;
  if (f444 && debitDemande > f444.largeurPx * f444.hauteurPx * f444.frequenceHz + EPS) {
    base.alertes.push(`${liaison.nom} : au-delà de ${f444.largeurPx} × ${f444.hauteurPx} à ${nombreCourt(f444.frequenceHz)} Hz, 4:2:0 seulement`
      + `${liaison.sources?.format444?.note ? ` (${liaison.sources.format444.note})` : ''}.`);
  }
  // Format sûr plus petit que le format maxi (HDBaseT 3.0 : « 4K » sans préciser 3840 ou 4096) : au-delà, alerte.
  const certain = liaison.formatCertain;
  if (certain && (largeurPx > certain.largeurPx || hauteurPx > certain.hauteurPx)) {
    base.alertes.push(`${liaison.nom} : ${liaison.sources?.formatCertain?.note ?? `au-delà de ${certain.largeurPx} × ${certain.hauteurPx}, vérifie la fiche de l'extender`}.`);
  }
  const max = liaison.frequencePixelMaxMHz;
  if (max) {
    const fp = frequencePixel({ largeurPx, hauteurPx, frequenceHz });
    const ok = fp.mhz <= max + EPS;
    return {
      ...base, frequencePixelMHz: fp.mhz, frequencePixelMaxMHz: max, methode: fp.methode, taux: fp.mhz / max, ok,
      approximation: fp.methode === 'CVT-RB',
      raison: ok ? null : `${nombreCourt(fp.mhz)} MHz demandés pour ${nombreCourt(max)} MHz au plus (${fp.methode === 'CTA-861' ? 'timings CTA-861'
        : 'CVT à blanking réduit, approximation'})`,
    };
  }
  const ok = debitDemande <= debitMax + EPS;
  return {
    ...base, taux: debitDemande / debitMax, ok, approximation: true,
    raison: ok ? null : `${mpx(debitDemande)} Mpx/s demandés pour ${mpx(debitMax)} au plus (${liaison.formatMaxLargeurPx} × ${liaison.formatMaxHauteurPx} `
      + `à ${liaison.formatMaxFrequenceHz} Hz), en approximation`,
  };
}

// Liaison vidéo : norme de la liaison (fréquence pixel ou débit). SDI : formats broadcast seulement ; un canvas
// personnalisé part dans le plus petit format broadcast qui le contient (zone utile en haut à gauche, noir autour),
// refusé si aucun ne le contient ou si la cadence n'est pas normalisée.
export function controleLiaison(liaison, format) {
  const { largeurPx, hauteurPx, frequenceHz } = format;
  if (liaison.famille !== 'sdi') return controleNorme(liaison, format);
  if (!cadenceNominale(frequenceHz, CADENCES_SDI)) {
    return {
      ...controleNorme(liaison, format), ok: false,
      raison: `cadence de ${nombreCourt(frequenceHz)} Hz non normalisée en SDI (23,98, 24, 25, 29,97, 30, 50, 59,94 ou 60 Hz)`,
    };
  }
  if (FORMATS_SDI.some(([l, h]) => l === largeurPx && h === hauteurPx)) return controleNorme(liaison, format);
  const conteneurs = FORMATS_SDI.filter(([l, h]) => l >= largeurPx && h >= hauteurPx)
    .map(([l, h]) => ({ l, h, c: controleNorme(liaison, { largeurPx: l, hauteurPx: h, frequenceHz }) }))
    .filter((x) => x.c.ok);
  if (conteneurs.length === 0) {
    return {
      ...controleNorme(liaison, format), ok: false,
      raison: `formats broadcast seulement en SDI, et aucun format broadcast que le ${liaison.nom} porte à ${nombreCourt(frequenceHz)} Hz `
        + `ne contient ${largeurPx} × ${hauteurPx} px`,
    };
  }
  const { l, h, c } = conteneurs[0];
  return {
    ...c,
    conteneur: { largeurPx: l, hauteurPx: h },
    alertes: [`${liaison.nom} : formats broadcast seulement. Envoie ton canvas de ${largeurPx} × ${hauteurPx} px dans un ${l} × ${h} à `
      + `${nombreCourt(frequenceHz)} Hz : zone utile en haut à gauche, noir autour.`],
  };
}

const mpx = (debit) => nombreCourt(debit / 1e6, 1);

// Formats d'une entrée donnés par la fiche du processeur (`entreesFormats`) : par version (hdmi-1.4) ou par famille
// quand la fiche nomme une version absente de la connectique (DP 1.1 rangé en « dp »). Plusieurs formats pour une
// même entrée : selon la carte (DP 1.4 à 30 Hz, ou à 60 Hz avec la carte DP 1.4 8K à 60 Hz, `condition`).
function formatsDeFiche(proc, liaison) {
  const formats = proc.entreesFormats ?? [];
  const exacts = formats.filter((f) => f.type === liaison.id);
  return exacts.length ? exacts : formats.filter((f) => f.type === liaison.famille);
}
function formatDeFiche(proc, liaison) {
  return formatsDeFiche(proc, liaison)[0] ?? null;
}
const dimensionsMaxi = (f) => [f.largeurMaxPx ? `${f.largeurMaxPx} px de large` : null, f.hauteurMaxPx ? `${f.hauteurMaxPx} px de haut` : null]
  .filter(Boolean).join(' et ');

// Contrôle sur le format de la fiche : débit de pixels actifs (approximation) et dimensions maxi de l'entrée.
function controleFormatFiche(format, liaison, { largeurPx, hauteurPx, frequenceHz }) {
  const debitDemande = largeurPx * hauteurPx * frequenceHz;
  const debitMax = format.largeurPx * format.hauteurPx * format.frequenceHz;
  const dimensionsOk = largeurPx <= (format.largeurMaxPx ?? Infinity) && hauteurPx <= (format.hauteurMaxPx ?? Infinity);
  return {
    liaison, debitDemande, debitMax, taux: debitDemande / debitMax, dimensionsOk,
    ok: dimensionsOk && debitDemande <= debitMax + EPS, approximation: true, deduit: false, aConfirmer: false, fiche: true,
  };
}

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
    if (!formatDeFiche(proc, choisie)) {
      alertes.push(`Le ${proc.nom} a une entrée ${NOMS_FAMILLE_LIAISON[choisie.famille]} dont la version n'est pas précisée sur sa fiche : `
        + `vérifie qu'elle accepte le ${choisie.nom}.`);
    }
  } else {
    return {
      ok: false, liaison: null, controle: null, alertes,
      refus: `Le ${proc.nom} n'a pas d'entrée ${NOMS_FAMILLE_LIAISON[choisie.famille]} (entrées : ${proc.entrees ?? 'non renseignées'}).`,
    };
  }

  // Format de l'entrée donné par la fiche du processeur : il passe avant la norme de la liaison. Plusieurs formats :
  // le premier qui accepte la source, sinon le dernier (le plus large) pour la raison du refus. Un format propre à une
  // profondeur (VX16s : 3840 × 1080 en 10 ou 12 bits) ne vaut que pour elle ; source sans profondeur : 8 bits.
  const bitsSource = source.bits ?? 8;
  const formatsFiche = formatsDeFiche(proc, liaison);
  const formats = formatsFiche.filter((f) => !f.bits || f.bits.includes(bitsSource));
  if (formatsFiche.length > 0 && formats.length === 0) {
    const acceptes = [...new Set(formatsFiche.flatMap((f) => f.bits ?? []))].join(' ou ');
    return {
      ok: false, liaison, controle: null, alertes,
      refus: `Entrée ${formatsFiche[0].nom} du ${proc.nom} : ${acceptes} bits seulement sur sa fiche, pas ${bitsSource} bits.`,
    };
  }
  const essais = formats.map((f) => ({ f, c: controleFormatFiche(f, liaison, source) }));
  const retenu = essais.find((x) => x.c.ok) ?? essais[essais.length - 1] ?? null;
  const format = retenu?.f ?? null;
  const controle = retenu ? retenu.c : controleLiaison(liaison, source);
  alertes.push(...(controle.alertes ?? []));
  if (format) {
    alertes.push(`Entrée ${format.nom} du ${proc.nom} : contrôle sur le format de sa fiche, ${format.largeurPx} × ${format.hauteurPx} `
      + `à ${format.frequenceHz} Hz${dimensionsMaxi(format) ? `, ${dimensionsMaxi(format)} au plus` : ''}${format.condition ? `, ${format.condition}` : ''}.`);
  }
  if (controle.deduit) alertes.push(`${liaison.nom} : format maxi en partie déduit.`);
  if (controle.aConfirmer) alertes.push(`${liaison.nom} : format maxi à confirmer sur la fiche du ${proc.nom}.`);
  let refus = null;
  if (format && !controle.dimensionsOk) {
    refus = `Entrée ${format.nom} du ${proc.nom} : ${dimensionsMaxi(format)} au plus sur sa fiche ; `
      + `la source fait ${source.largeurPx} × ${source.hauteurPx} px.`;
  } else if (format && !controle.ok) {
    refus = `Entrée ${format.nom} du ${proc.nom} : ${mpx(controle.debitDemande)} Mpx/s demandés pour ${mpx(controle.debitMax)} au plus `
      + `(${format.largeurPx} × ${format.hauteurPx} à ${format.frequenceHz} Hz, fiche du processeur), en approximation.`;
  } else if (proc.entreeMaxLargeurPx && (source.largeurPx > proc.entreeMaxLargeurPx || source.hauteurPx > proc.entreeMaxHauteurPx)) {
    refus = `Sa fiche limite l'entrée du ${proc.nom} à ${proc.entreeMaxLargeurPx} × ${proc.entreeMaxHauteurPx} px ; `
      + `la source fait ${source.largeurPx} × ${source.hauteurPx} px.`;
  } else if (!controle.ok) {
    refus = `Entrée ${liaison.nom} du ${proc.nom} : ${controle.raison}.`;
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
  // ULL (SX40, S8) : HDMI seulement, la source doit respecter l'EDID du processeur.
  const famille = entree.liaison?.famille;
  if (evaluation.reglages?.ull && proc.ullEntrees && famille && !proc.ullEntrees.includes(famille)) {
    const s = proc.sources?.ullEntrees;
    refus.push(`ULL : entrée ${proc.ullEntrees.map((f) => NOMS_FAMILLE_LIAISON[f] ?? f).join(' ou ')} seulement sur le ${proc.nom}, pas de ${NOMS_FAMILLE_LIAISON[famille] ?? famille}`
      + `${s ? ` (${[s.note, minuscule(s.source.court)].filter(Boolean).join(', ')})` : ''}.`);
  }

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
    // Mur en zones : chaque morceau de zone dans la source (le bloc en haut à gauche), position à régler dans le processeur.
    ...(g.parties ? {
      parties: g.parties.map((p) => ({
        nom: p.nomAffiche,
        x: [p.dansEntree.x, p.dansEntree.x + p.largeurPx - 1],
        y: [p.dansEntree.y, p.dansEntree.y + p.hauteurPx - 1],
      })),
    } : {}),
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
  const types = proc.entreesTypes ?? [];
  const video = types.filter((type) => !type.startsWith('st2110'));
  for (const type of video.length ? video : types) {
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

// Modèle générique (régies, switchers, scalers) : `entrees` et `sorties` par type de liaison et nombre, avec format
// maxi et source ; `couches`, `latence`, `bitsParCouleur`, `emplacements`, `hauteurU`, `poidsKg`, `puissanceW`,
// `statutCommercial`. Les anciens `modesSortie` et `sortiesTypes` (E2 Gen 2) restent prioritaires.
// Sorties Program : ni multiviewer, ni Aux (Aquilon : 4 Program + 4 Aux), ni copie d'une autre sortie.
const sortiesUtiles = (regie) => (Array.isArray(regie.sorties) ? regie.sorties : [])
  .filter((s) => s.role !== 'multiviewer' && s.role !== 'aux' && !s.copie);
// Sorties Aux : elles servent après les Program, avec l'alerte « fonctions réduites ».
const sortiesAux = (regie) => (Array.isArray(regie.sorties) ? regie.sorties : []).filter((s) => s.role === 'aux' && !s.copie);

// Modes de sortie d'une régie : ceux de sa fiche, sinon un mode par type de sortie du modèle générique
// (« 8 × DVI single link »), au format maxi de la sortie, ou de la liaison quand la fiche ne le donne pas.
export function modesSortieRegie(regie, liaisons = []) {
  if (regie.modesSortie?.length) return regie.modesSortie;
  const multiviewerDedie = (regie.sorties ?? []).some((s) => s.role === 'multiviewer');
  return sortiesUtiles(regie).map((s) => {
    const liaison = liaisons.find((l) => l.id === s.type);
    return {
      nom: `${s.nombre} × ${liaison?.nom ?? s.type}`,
      sorties: s.nombre,
      sortiesAvecMultiviewer: multiviewerDedie ? s.nombre : null,
      largeurMaxPx: s.largeurMaxPx ?? liaison?.formatMaxLargeurPx,
      hauteurMaxPx: s.hauteurMaxPx ?? liaison?.formatMaxHauteurPx,
      frequenceHz: s.frequenceMaxHz ?? liaison?.formatMaxFrequenceHz,
      frequencePixelMaxMHz: s.frequencePixelMaxMHz ?? null,
      dimensionTesteePx: s.dimensionTesteePx ?? null,
      noteTest: s.noteTest ?? null,
      sortiesAux: s.sortiesAux ?? null,
      noteSortie: s.note ?? null,
      source: s.source,
      type: s.type,
    };
  });
}

// Budget en mégapixels d'une régie (Aquilon RS1 : 40 MP sur le Program ; E2 Gen 2 : 20 MP avec prévisualisation,
// 40 MP en Program seul, 80 MP à 30 Hz en Program seul ; Spyder X80 : 80 MP en 8 bits, 53 MP en 12 bits, retenus
// aussi en 10 bits) : le plus petit qui suffit parmi ceux permis par la fréquence, la profondeur de la source
// (8 bits si elle n'est pas précisée) et le réglage « Program seul ». Sans budget sur sa fiche : pas de contrôle.
export function budgetRegie(regie, pixels, { programSeul = false, frequenceHz = 60, bits = 8 } = {}) {
  const parBits = (regie.budgetsMP ?? []).filter((b) => frequenceHz <= (b.frequenceMaxHz ?? Infinity) + EPS && bits <= (b.bitsMax ?? Infinity));
  // Budget propre à une profondeur : celui de la plus petite profondeur qui contient la source (X80 en 8 bits : 80 MP).
  const bitsProche = Math.min(...parBits.map((b) => b.bitsMax ?? Infinity));
  const budgets = parBits.filter((b) => b.bitsMax === undefined || b.bitsMax === bitsProche);
  if (!regie.budgetsMP?.length) return { ok: true, budget: null, pixels, programSeulSuffit: false };
  const plusGrand = (liste) => (liste.length ? liste.reduce((a, b) => (b.mpx > a.mpx ? b : a)) : null);
  // Le plus petit budget permis qui suffit (la prévisualisation quand elle suffit), sinon le plus grand permis.
  const permis = budgets.filter((b) => programSeul || !b.programSeul).sort((a, b) => a.mpx - b.mpx);
  const budget = permis.find((b) => pixels <= b.mpx + EPS) ?? plusGrand(permis);
  const ok = Boolean(budget) && pixels <= budget.mpx + EPS;
  const seul = plusGrand(budgets.filter((b) => b.programSeul));
  return { ok, budget, pixels, programSeulSuffit: !ok && !programSeul && Boolean(seul) && pixels <= seul.mpx + EPS, budgetProgramSeul: seul };
}

// Unité de couche d'une sortie (PixelHue) : 1 × 4K = 2 DL = 4 SL ; SL jusqu'à 2048 × 1200 px, DL jusqu'à 4096 × 1200.
export function uniteCouche({ largeurPx, hauteurPx }) {
  const px = largeurPx * hauteurPx;
  if (px <= 2048 * 1200) return { unites: 1, nom: 'SL' };
  if (px <= 4096 * 1200) return { unites: 2, nom: 'DL' };
  return { unites: 4, nom: '4K' };
}

// Types de liaison des sorties : ceux de la fiche, sinon ceux des sorties du modèle générique.
export function sortiesTypesRegie(regie) {
  if (regie.sortiesTypes?.length) return regie.sortiesTypes;
  return [...new Set(sortiesUtiles(regie).map((s) => s.type))];
}

export function champsManquantsRegie(regie) {
  const manquants = [];
  const sorties = sortiesUtiles(regie).length > 0;
  if (!regie.modesSortie?.length && !sorties) manquants.push('modesSortie');
  if (!regie.sortiesTypes?.length && !sorties) manquants.push('sortiesTypes');
  return manquants;
}

// Une sortie de régie par entrée de processeur ; la sortie doit monter au format de la source et avoir la
// connectique de la liaison (une version plus récente de la même famille convient). Avec le multiviewer,
// seuls les modes dont le nombre de sorties est connu sont retenus.
export function controleRegie(regie, evaluation, source, liaisons, { multiviewer = false, programSeul = false, couchesParSortie = 1 } = {}) {
  const necessaires = evaluation.nombre ?? null;
  const manquants = champsManquantsRegie(regie);
  if (manquants.length > 0) {
    return { ok: null, aCompleter: manquants, refus: [], alertes: [], notes: [], sortiesNecessaires: necessaires, sortiesDisponibles: null, sortiesAux: null, auxUtilisees: 0, mode: null };
  }
  const refus = [];
  const alertes = [];
  const modesFiche = modesSortieRegie(regie, liaisons);
  const fp = frequencePixel(source);
  const tientDimensions = (md) => source.largeurPx <= md.largeurMaxPx && source.hauteurPx <= md.hauteurMaxPx && source.frequenceHz <= md.frequenceHz + EPS;
  const modes = modesFiche
    .filter((md) => !multiviewer || md.sortiesAvecMultiviewer)
    .map((md) => ({ ...md, disponibles: multiviewer ? md.sortiesAvecMultiviewer : md.sorties }))
    .filter((md) => tientDimensions(md) && (!md.frequencePixelMaxMHz || fp.mhz <= md.frequencePixelMaxMHz + EPS));
  const mode = modes.length ? modes.reduce((a, b) => (b.disponibles > a.disponibles ? b : a)) : null;
  if (multiviewer && modesFiche.some((md) => !md.sortiesAvecMultiviewer)) {
    alertes.push(`Multiviewer : ${modesFiche.filter((md) => !md.sortiesAvecMultiviewer).map((md) => `mode ${md.nom}`).join(', ')} `
      + 'non retenu, faute de nombre de sorties connu.');
  }
  // Sorties Aux (toutes les régies) : les Program d'abord, puis les Aux qui montent au format de la source
  // (anciens modes : `sortiesAux` du mode ; modèle générique : sorties de rôle « aux »).
  const tientAux = (s) => {
    const l = liaisons.find((x) => x.id === s.type);
    return tientDimensions({ largeurMaxPx: s.largeurMaxPx ?? l?.formatMaxLargeurPx, hauteurMaxPx: s.hauteurMaxPx ?? l?.formatMaxHauteurPx,
      frequenceHz: s.frequenceMaxHz ?? l?.formatMaxFrequenceHz }) && (!s.frequencePixelMaxMHz || fp.mhz <= s.frequencePixelMaxMHz + EPS);
  };
  const program = mode ? mode.disponibles : 0;
  // Mode qui fixe ses Aux (Aquilon en 2K : les connecteurs restants) : jamais plus que les Aux qui montent au format.
  const auxAuFormat = sortiesAux(regie).filter(tientAux).reduce((t, s) => t + s.nombre, 0);
  const aux = regie.modesSortie?.length ? (mode?.sortiesAux ?? 0)
    : (mode?.sortiesAux !== null && mode?.sortiesAux !== undefined ? Math.min(mode.sortiesAux, auxAuFormat) : auxAuFormat);
  const auxUtilisees = necessaires !== null ? Math.max(0, Math.min(necessaires - program, aux)) : 0;
  // Sortie plafonnée en fréquence pixel (Datapath Fx4 : 165 Mpx/s) : la raison du refus.
  const plafonnee = !mode ? modesFiche.find((md) => md.frequencePixelMaxMHz && tientDimensions(md) && fp.mhz > md.frequencePixelMaxMHz + EPS) : null;
  if (!mode && aux === 0 && plafonnee) {
    refus.push(`Sorties ${plafonnee.nom} de la régie ${regie.nom} plafonnées à ${nombreCourt(plafonnee.frequencePixelMaxMHz)} MHz`
      + `${plafonnee.noteSortie ? ` (${plafonnee.noteSortie})` : ''} : ${source.largeurPx} × ${source.hauteurPx} à ${nombreCourt(source.frequenceHz)} Hz `
      + `demande ${nombreCourt(fp.mhz)} MHz.`);
  } else if (!mode && aux === 0) {
    refus.push(`Aucune sortie de la régie ${regie.nom}${multiviewer ? ' (avec le multiviewer)' : ''} ne monte à `
      + `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz.`);
  } else if (necessaires !== null && necessaires > program + aux) {
    refus.push(`${necessaires} processeurs demandent ${necessaires} sorties : la régie ${regie.nom} n'en a que `
      + `${aux > 0 ? `${program} Program et ${aux} Aux` : program}${mode ? ` en mode ${mode.nom}` : ''}${multiviewer ? ', avec le multiviewer' : ''}.`);
  } else if (auxUtilisees > 0) {
    const detail = regie.noteAux
      ? ` ${regie.noteAux} (${[regie.sources?.noteAux?.source?.court, regie.sources?.noteAux?.note].filter(Boolean).join(', ')}).` : '';
    alertes.push(`${auxUtilisees} processeur${auxUtilisees > 1 ? 's' : ''} au-delà des ${program} sorties Program de la régie ${regie.nom} : `
      + `sortie Aux, fonctions réduites (couches, transitions), vérifie dans le manuel.${detail}`);
  }
  // Taille de sortie publiée « à tester » au-delà d'une dimension (Datapath Fx4 : 2048 px).
  if (mode?.dimensionTesteePx && (source.largeurPx > mode.dimensionTesteePx || source.hauteurPx > mode.dimensionTesteePx)) {
    alertes.push(`Sorties ${mode.nom} de la régie ${regie.nom} : ${source.largeurPx} × ${source.hauteurPx}, au-delà de ${mode.dimensionTesteePx} px `
      + `de large ou de haut, à tester${mode.noteTest ? ` (${mode.noteTest})` : ''}.`);
  }
  const choisie = liaisons.find((l) => l.id === source.liaison);
  const sorties = sortiesTypesRegie(regie).map((id) => liaisons.find((l) => l.id === id)).filter(Boolean);
  if (choisie && !sorties.some((l) => l.famille === choisie.famille && l.rang >= choisie.rang)) {
    refus.push(`La régie ${regie.nom} n'a pas de sortie ${choisie.nom} (sorties : ${sorties.map((l) => l.nom).join(', ')}).`);
  }
  // Liaison vers les processeurs : fréquence pixel (HDMI 2.0 600 MHz, DP 1.2 660 MHz) ou débit.
  const liaison = choisie ? controleLiaison(choisie, source) : null;
  if (liaison && !liaison.ok) refus.push(`Liaison ${choisie.nom} vers les processeurs : ${liaison.raison}.`);
  if (liaison) alertes.push(...liaison.alertes);
  // Budget en mégapixels : une source par processeur ; les sorties Aux comptent aussi, sauf si la fiche dit
  // qu'elles ne prennent rien au traitement (Aquilon : « Aux Screens do not consume processing resources »).
  const surBudget = regie.auxHorsBudget ? Math.min(necessaires ?? 0, program) : (necessaires ?? 0);
  const pixels = surBudget * source.largeurPx * source.hauteurPx;
  const budget = budgetRegie(regie, pixels, { programSeul, frequenceHz: source.frequenceHz, bits: source.bits ?? 8 });
  const mp = (x) => `${nombreCourt(x / 1e6, 1)} MP`;
  if (budget.budget === null && regie.budgetsMP?.length) {
    refus.push(`Budget de la régie ${regie.nom} : aucun budget à ${nombreCourt(source.frequenceHz)} Hz sur sa fiche.`);
  } else if (!budget.ok) {
    refus.push(`Budget de la régie ${regie.nom} : ${mp(pixels)} demandés (${surBudget} × ${source.largeurPx} × ${source.hauteurPx}) `
      + `pour ${mp(budget.budget.mpx)} ${budget.budget.libelle}${budget.programSeulSuffit
        ? ` ; en Program seul (sans prévisualisation), ${mp(budget.budgetProgramSeul.mpx)} suffisent` : ''}.`);
  } else if (budget.budget?.programSeul) {
    alertes.push(`Régie ${regie.nom} en Program seul : ${mp(pixels)} pour ${mp(budget.budget.mpx)}, sans prévisualisation.`);
  }
  // Couches (PixelHue) : 1 × 4K = 2 DL = 4 SL, comptées par carte de sortie.
  if (regie.couchesParCarteSL && necessaires) {
    const unite = uniteCouche(source);
    const parCarte = Math.min(necessaires, regie.sortiesParCarte ?? necessaires);
    const total = parCarte * couchesParSortie * unite.unites;
    if (total > regie.couchesParCarteSL) {
      refus.push(`Couches de la régie ${regie.nom} : ${parCarte} sortie${parCarte > 1 ? 's' : ''} × ${couchesParSortie} couche${couchesParSortie > 1 ? 's' : ''} `
        + `${unite.nom} = ${total} SL par carte de sortie, pour ${regie.couchesParCarteSL} SL (1 × 4K = 2 DL = 4 SL).`);
    }
  }
  // Sorties OPT réservées aux contrôleurs Novastar (PixelHue : « Only LED controllers from NovaStar are supported
  // for now », fiche p. 1) : alerte si la liaison passe par OPT vers un autre processeur, simple note en HDMI ou DP.
  const notes = [];
  const famille = evaluation.processeur?.famille ?? null;
  if (regie.optNovastarSeulement && famille && famille !== 'novastar') {
    const citation = `« Only LED controllers from NovaStar are supported for now » (${[regie.sources?.optNovastarSeulement?.source?.court,
      regie.sources?.optNovastarSeulement?.note].filter(Boolean).join(', ')})`;
    if (String(source.liaison ?? '').startsWith('opt') || choisie?.famille === 'opt') {
      alertes.push(`Liaison OPT (fibre) de la régie ${regie.nom} vers un processeur ${evaluation.processeur.nom} : ${citation}. `
        + 'Sorties OPT réservées aux processeurs Novastar : passe par une sortie HDMI ou DP.');
    } else {
      notes.push(`Régie ${regie.nom} : ${citation} vise les sorties OPT (fibre) vers les processeurs Novastar ; `
        + `en ${choisie?.nom ?? 'HDMI ou DP'}, rien ne dépend de la marque du processeur.`);
    }
  }
  return {
    ok: refus.length === 0, aCompleter: [], refus, alertes, notes, liaison, budget,
    sortiesNecessaires: necessaires, sortiesDisponibles: program, sortiesAux: aux, auxUtilisees, mode,
  };
}

// ---------------------------------------------------------------------------
// Chaîne vidéo (étape Pf) : latence, cadence, réseau Brompton, longueurs de câble
// ---------------------------------------------------------------------------

// Latence cumulée de la chaîne, en images (indicative) : les millisecondes sont converties à la fréquence de la
// chaîne (image entamée comptée) ; un maillon sans latence publiée est signalé, le maximum reste alors inconnu.
export function latenceChaine(maillons, frequenceHz) {
  const images = (ms) => Math.ceil((ms * frequenceHz) / 1000 - EPS);
  let min = 0;
  let max = 0;
  let maxConnu = true;
  const nonChiffres = [];
  for (const m of maillons) {
    const mi = m.latenceMinImages ?? (m.latenceMinMs !== undefined && m.latenceMinMs !== null ? images(m.latenceMinMs) : null);
    const ma = m.latenceMaxImages ?? (m.latenceMaxMs !== undefined && m.latenceMaxMs !== null ? images(m.latenceMaxMs) : null);
    if (mi === null && ma === null) {
      nonChiffres.push(m.nom);
      maxConnu = false;
      continue;
    }
    min += mi ?? 0;
    if (ma === null) maxConnu = false;
    else max += ma;
  }
  const ms = (n) => nombreCourt((n * 1000) / frequenceHz, 0);
  const pl = (n) => `${n} image${n > 1 ? 's' : ''}`;
  const texte = maxConnu
    ? `${min === max ? pl(min) : `${min} à ${pl(max)}`} (${min === max ? ms(min) : `${ms(min)} à ${ms(max)}`} ms à ${nombreCourt(frequenceHz)} Hz), indicatif`
    : `au moins ${pl(min)} (${ms(min)} ms à ${nombreCourt(frequenceHz)} Hz)${nonChiffres.length
      ? `, ${nonChiffres.join(', ')} non chiffré${nonChiffres.length > 1 ? 's' : ''}` : ', maximum non publié'}, indicatif`;
  return { minImages: min, maxImages: maxConnu ? max : null, minMs: (min * 1000) / frequenceHz, maxMs: maxConnu ? (max * 1000) / frequenceHz : null, nonChiffres, texte };
}

// Cadence de la source face au calcul data : un écart fait sauter ou doubler une image à intervalle régulier.
// Appareil qui n'accepte que certaines cadences (V-1HD : 59,94 ou 50 Hz).
const texteSortieCadences = (appareil) => (appareil.sortieCadences ? ` sur sa sortie ${appareil.sortieCadences}` : '');
export function controleCadence(sourceHz, calculHz, { appareil = null } = {}) {
  const alertes = [];
  if (Math.abs(sourceHz - calculHz) > EPS) {
    const periode = 1 / Math.abs(sourceHz - calculHz);
    alertes.push(`Cadence : source à ${nombreCourt(sourceHz)} Hz, calcul data à ${nombreCourt(calculHz)} Hz : une image saute ou se double `
      + `environ toutes les ${nombreCourt(periode, 0)} s. Même cadence partout, ou genlock conseillé.`);
  }
  if (appareil?.cadences?.length && !appareil.cadences.some((c) => Math.abs(c - calculHz) < 0.01)) {
    alertes.push(`Le ${appareil.nom} ne sort qu'en ${appareil.cadences.map((c) => nombreCourt(c)).join(' ou ')} Hz${texteSortieCadences(appareil)} : le calcul data est à `
      + `${nombreCourt(calculHz)} Hz${appareil.noteCadences ? ` (${appareil.noteCadences})` : ''}.`);
  }
  return alertes;
}

// Réseau Brompton (aide en ligne Tessera, Connection Guidelines 13.1.2 et annexe B), consultée le 26/09/2026.
const AIDE_TESSERA_CONNEXION = 'aide en ligne Tessera, Connection Guidelines';
const AIDE_TESSERA_CABLES = 'aide en ligne Tessera, annexe B';
const CUIVRE_10G_BROMPTON_M = { Cat6A: 60, Cat5e: 30 };
export function reseauBrompton({
  xd = 0, switches = 0, convertisseursFibre = 0, switchManageable = false, switch10G = false, fibre = null, cuivre10G = null, distributeur = null,
} = {}) {
  const refus = [];
  const alertes = [];
  // XD-T : entrée fibre seulement.
  if (cuivre10G && distributeur?.entreeFibreSeulement) {
    refus.push(`${distributeur.modele} : entrée fibre seulement (${distributeur.entree}) ; pas de cuivre 10G jusqu'au ${distributeur.modele} `
      + `(${minuscule(distributeur.sources?.sorties?.source.court) ?? `fiche ${distributeur.modele}`}).`);
  }
  const noeuds = xd + switches + convertisseursFibre;
  if (noeuds > 5) {
    refus.push(`${noeuds} appareils entre le processeur et la dalle la plus éloignée (XD, switches et convertisseurs fibre comptés) : 5 au plus `
      + `(« five switches », « XD Units and fibre optic transceivers count as switches », ${AIDE_TESSERA_CONNEXION}).`);
  }
  if (switchManageable) {
    refus.push(`Switch manageable : « The Tessera Protocol is designed to be used ONLY with unmanaged switches » (${AIDE_TESSERA_CONNEXION}).`);
  }
  if (switch10G) {
    refus.push(`Switch en 10G entre le SX40 et ses XD : « The use of 10G Ethernet switches is not supported » (${AIDE_TESSERA_CABLES}).`);
  }
  if (fibre?.mode === 'multimode') refus.push(`Fibre multimode : « Multi-mode fibre is not supported » (${AIDE_TESSERA_CABLES}). Monomode 9/125 µm, 1310 nm.`);
  if (fibre?.connecteur === 'APC') {
    refus.push(`Connecteurs APC : interdits, ils peuvent abîmer les connecteurs du SX40 et du XD (« may cause damage », ${AIDE_TESSERA_CABLES}). PC ou UPC seulement.`);
  }
  if (cuivre10G) {
    const limite = CUIVRE_10G_BROMPTON_M[cuivre10G.categorie];
    if (!limite) {
      alertes.push(`Cuivre 10G en ${cuivre10G.categorie} : Brompton ne donne de longueur qu'en Cat6A (60 m) et en Cat5e (30 m) (${AIDE_TESSERA_CABLES}).`);
    } else if (cuivre10G.longueurM > limite + EPS) {
      alertes.push(`Cuivre 10G en ${cuivre10G.categorie} : ${nombreCourt(cuivre10G.longueurM)} m, au-delà des ${limite} m annoncés `
        + `(« typically up to ${limite} metres », ${AIDE_TESSERA_CABLES}) : passe en fibre monomode.`);
    }
  }
  return { refus, alertes, noeuds };
}

// Longueurs de câble vidéo : seuils d'alerte réglables (choix de conception du projet ; la longueur réelle dépend
// du câble, les fabricants se contredisent). SDI : [alerte, alerte forte] en mètres. HDMI en cuivre passif.
export const SEUILS_LONGUEUR_M = { '12g-sdi': [30, 90], '6g-sdi': [50, 95], '3g-sdi': [70, 100] };
const NOMS_LONGUEUR = { '12g-sdi': '12G-SDI', '6g-sdi': '6G-SDI', '3g-sdi': '3G-SDI' };
const CHOIX_LONGUEUR = 'seuil réglable, choix de conception du projet ; la longueur réelle dépend du câble';
export function controleLongueur(liaisonId, longueurM, { format = null, seuils = {} } = {}) {
  if (!(longueurM > 0)) return { niveau: 'ok', texte: null };
  const l = nombreCourt(longueurM);
  if (liaisonId.startsWith('hdmi')) {
    const uhd = format && format.largeurPx * format.hauteurPx >= 3840 * 2160 && format.frequenceHz >= 50 - EPS;
    const alerteM = seuils.hdmi?.[uhd ? 0 : 1] ?? (uhd ? 5 : 10);
    if (longueurM > (seuils.hdmiConseil ?? 15) + EPS) {
      return { niveau: 'conseil', texte: `HDMI en cuivre passif sur ${l} m : câble actif ou fibre conseillé (${CHOIX_LONGUEUR}).` };
    }
    if (longueurM > alerteM + EPS) {
      return { niveau: 'alerte', texte: `HDMI en cuivre passif sur ${l} m, au-delà de ${alerteM} m ${uhd ? 'en 4K60' : 'en 1080p'} (${CHOIX_LONGUEUR}).` };
    }
    return { niveau: 'ok', texte: null };
  }
  const [alerteM, forteM] = seuils[liaisonId] ?? SEUILS_LONGUEUR_M[liaisonId] ?? [];
  if (!alerteM) return { niveau: 'ok', texte: null };
  const nom = NOMS_LONGUEUR[liaisonId] ?? liaisonId;
  if (longueurM > forteM + EPS) {
    return { niveau: 'forte', texte: `${nom} sur ${l} m, au-delà de ${forteM} m : risque de perte du signal, passe en fibre (${CHOIX_LONGUEUR}).` };
  }
  if (longueurM > alerteM + EPS) return { niveau: 'alerte', texte: `${nom} sur ${l} m, au-delà des ${alerteM} m conseillés (${CHOIX_LONGUEUR}).` };
  return { niveau: 'ok', texte: null };
}

// Longueur maxi donnée par la liaison elle-même (HDBaseT : « up to 100m/328ft » ; alerte à 90 m en Cat5e en 2.0 ;
// DTP2 : 100 m en STP) : refus au-delà du maximum, alerte au-delà du seuil.
export function controleLongueurLiaison(liaison, longueurM) {
  const r = { refus: [], alertes: [] };
  if (!(longueurM > 0) || !liaison) return r;
  const note = (champ) => (liaison.sources?.[champ]?.note ? ` (${liaison.sources[champ].note})` : '');
  if (liaison.longueurMaxM && longueurM > liaison.longueurMaxM + EPS) {
    r.refus.push(`${liaison.nom} sur ${nombreCourt(longueurM)} m : ${nombreCourt(liaison.longueurMaxM)} m au plus${note('longueurMaxM')}.`);
  } else if (liaison.longueurAlerteM && longueurM > liaison.longueurAlerteM + EPS) {
    r.alertes.push(`${liaison.nom} sur ${nombreCourt(longueurM)} m : au-delà de ${nombreCourt(liaison.longueurAlerteM)} m${note('longueurAlerteM')}.`);
  }
  return r;
}

// Formats de sortie d'un mélangeur (formats broadcast de sa fiche) : un canvas personnalisé part dans le plus petit
// format qui le contient (zone utile en haut à gauche, noir autour) ; refus si aucun ne le contient.
const format2 = ([l, h]) => `${l} × ${h}`;
function controleFormatsSortie(appareil, { largeurPx, hauteurPx }) {
  const r = { refus: [], alertes: [] };
  const formats = appareil.formatsSortie ?? [];
  if (!formats.length || formats.some(([l, h]) => l === largeurPx && h === hauteurPx)) return r;
  const conteneurs = formats.filter(([l, h]) => l >= largeurPx && h >= hauteurPx).sort((a, b) => a[0] * a[1] - b[0] * b[1]);
  if (!conteneurs.length) {
    r.refus.push(`Le ${appareil.nom} ne sort qu'en ${formats.map(format2).join(', ')} : aucun ne contient ${largeurPx} × ${hauteurPx} px.`);
  } else {
    r.alertes.push(`Le ${appareil.nom} ne sort qu'en formats broadcast (${formats.map(format2).join(', ')}) : envoie ton canvas de `
      + `${largeurPx} × ${hauteurPx} px dans un ${format2(conteneurs[0])}, zone utile en haut à gauche, noir autour.`);
  }
  return r;
}

// Format maxi d'un convertisseur (fiche) : la source doit tenir dans l'un de ses formats (6G : 2160p30 ; Teranex Mini :
// 4K DCI jusqu'à 25p ; UpDownCross : HD seulement). Sans mise à l'échelle : le format passe tel quel (note).
function controleFormatsMax(appareil, { largeurPx, hauteurPx, frequenceHz }) {
  const r = { refus: [], alertes: [], notes: [] };
  const formats = appareil.formatsMax ?? [];
  if (formats.length && !formats.some((x) => largeurPx <= x.largeurPx && hauteurPx <= x.hauteurPx && frequenceHz <= x.frequenceHz + EPS)) {
    r.refus.push(`Le ${appareil.nom} ne passe pas ${largeurPx} × ${hauteurPx} à ${nombreCourt(frequenceHz)} Hz : `
      + `${formats.map((x) => `${x.largeurPx} × ${x.hauteurPx} à ${nombreCourt(x.frequenceHz)} Hz`).join(' ou ')} au plus`
      + `${appareil.noteFormatsMax ? ` (${appareil.noteFormatsMax})` : ''}.`);
  }
  if (appareil.miseAEchelle === false) r.notes.push(`${appareil.nom} : sans mise à l'échelle, le format passe tel quel.`);
  return r;
}

// Longueurs d'un extender selon la fréquence pixel : la fiche de l'appareil passe devant la norme de la liaison
// (Lightware HDMI-TPS-TX210 : 1080p60 100 m en Cat5e AWG24, jusqu'à 170 m en mode Long Reach ; 4K30 70 m en Cat5e
// AWG24, 100 m en Cat7 AWG23). Au-delà du câble courant : alerte (autre câble) ou note (Long Reach) ; au-delà du tout : refus.
function controleLongueursExtender(appareil, longueurM, format) {
  const r = { refus: [], alertes: [], notes: [] };
  const table = appareil.longueursMax ?? [];
  if (appareil.noteLongueurs) r.notes.push(`${appareil.nom} : ${appareil.noteLongueurs}.`);
  if (!table.length || !(longueurM > 0)) return r;
  const fp = frequencePixel(format).mhz;
  const ligne = table.find((x) => fp <= x.frequencePixelMaxMHz + EPS);
  const l = nombreCourt(longueurM);
  if (!ligne) {
    r.refus.push(`${appareil.nom} : ${nombreCourt(fp)} MHz, au-delà des formats de sa fiche.`);
  } else if (longueurM <= ligne.longueurM + EPS) {
    return r;
  } else if (ligne.longueurLongReachM) {
    if (longueurM > ligne.longueurLongReachM + EPS) {
      r.refus.push(`${appareil.nom} sur ${l} m en ${nombreCourt(fp)} MHz : ${ligne.longueurLongReachM} m au plus, même en mode Long Reach (fiche).`);
    } else {
      r.notes.push(`${appareil.nom} sur ${l} m : ${ligne.noteLongReach}.`);
    }
  } else if (ligne.longueurAutreM && longueurM <= ligne.longueurAutreM + EPS) {
    r.alertes.push(`${appareil.nom} sur ${l} m en ${nombreCourt(fp)} MHz : au-delà de ${ligne.longueurM} m en ${ligne.cable}, `
      + `${ligne.cableAutre} obligatoire (${ligne.longueurAutreM} m au plus).`);
  } else {
    r.refus.push(`${appareil.nom} sur ${l} m en ${nombreCourt(fp)} MHz : ${ligne.longueurAutreM ?? ligne.longueurM} m au plus (fiche).`);
  }
  return r;
}

// Sortie choisie pour un convertisseur à plusieurs sorties : elle doit exister sur sa fiche (même famille, version égale
// ou plus récente : une sortie HDMI 2.0 porte du HDMI 1.4).
function controleSortieChoisie(appareil, liaisonId, liaisons) {
  const types = appareil.sortiesTypes ?? [];
  if (!liaisonId || !types.length) return [];
  const choisie = liaisons.find((x) => x.id === liaisonId);
  if (!choisie) return [];
  const accepte = types.some((t) => {
    const l = liaisons.find((x) => x.id === t);
    return l ? l.famille === choisie.famille && l.rang >= choisie.rang : t === choisie.famille;
  });
  const nom = (t) => liaisons.find((x) => x.id === t)?.nom ?? t;
  return accepte ? [] : [`Le ${appareil.nom} n'a pas de sortie ${choisie.nom} (sorties : ${types.map(nom).join(', ')}).`];
}

// Familles d'appareils en amont et en aval (un fichier par famille dans data/ ; régies et scalers dans regies.json).
export const FAMILLES_APPAREILS = { melangeur: 'Mélangeurs', convertisseur: 'Convertisseurs et extenders', serveur: 'Serveurs média', switch: 'Switches réseau' };

// Maillon de la chaîne pris dans la base : latence, liaison de sa première sortie utile, cadences acceptées.
// Mélangeur : formats broadcast de sortie, sorties qui portent le Program et leurs conditions (V-8HD : OUTPUT 3 dès le
// 3e processeur, alerte ; V-1HD : PREVIEW dès le 2e, note). Convertisseur : formats maxi, mise à l'échelle,
// longueurs d'un extender. Un convertisseur bidirectionnel, ou à plusieurs types de sortie, n'impose pas sa liaison de
// sortie (choisie dans la saisie).
export function maillonDepuisFiche(fiche) {
  const sortie = (fiche.sorties ?? []).find((x) => x.role !== 'multiviewer' && x.role !== 'aux' && !x.copie);
  return {
    nom: fiche.nom, ficheId: fiche.id, famille: fiche.famille ?? null, liaison: fiche.bidirectionnel || fiche.sortieAuChoix ? null : (sortie?.type ?? null), cadences: fiche.cadences ?? null,
    latenceMinImages: fiche.latenceMinImages, latenceMaxImages: fiche.latenceMaxImages, latenceMinMs: fiche.latenceMinMs, latenceMaxMs: fiche.latenceMaxMs,
    formatsSortie: fiche.formatsSortie ?? null, sortiesVersProcesseurs: fiche.sortiesVersProcesseurs ?? null,
    conditionsSortiesProgram: fiche.conditionsSortiesProgram ?? null,
    cadencesParSortie: (fiche.sorties ?? []).filter((x) => x.cadences?.length).map((x) => ({ type: x.type, cadences: x.cadences, noteCadences: x.noteCadences ?? null })),
    formatsMax: fiche.formatsMax ?? null, noteFormatsMax: fiche.sources?.formatsMax?.note ?? null, miseAEchelle: fiche.miseAEchelle ?? null,
    longueursMax: fiche.longueursMax ?? null, noteLongueurs: fiche.sources?.longueursMax?.note ?? null,
    sortiesTypes: [...new Set((fiche.sorties ?? []).filter((x) => x.role !== 'multiviewer' && !x.copie).map((x) => x.type))],
  };
}

// Chaîne vidéo de l'onglet Canvas : source (ou sortie de la régie), 0 à 3 convertisseurs (une paire émetteur-récepteur
// compte pour un maillon), processeur. Chaque liaison : norme (fréquence pixel ou débit ; formats broadcast en SDI) et
// longueur ; cadence face au calcul data ; latence cumulée. L'entrée du processeur (controleSource) se contrôle sur la
// liaison du dernier maillon (`liaisonProcesseur`) ; la régie, sur controleRegie.
export const CONVERTISSEURS_MAX = 3;
export function controleChaine(chaine, { evaluation, liaisons, frequenceCalculHz, regie = null, seuils = {} }) {
  const { source } = chaine;
  const format = { largeurPx: source.largeurPx, hauteurPx: source.hauteurPx, frequenceHz: source.frequenceHz };
  const convertisseurs = chaine.convertisseurs ?? [];
  const refus = [];
  if (convertisseurs.length > CONVERTISSEURS_MAX) {
    refus.push(`${convertisseurs.length} convertisseurs : ${CONVERTISSEURS_MAX} convertisseurs au plus dans la chaîne (une paire émetteur-récepteur compte pour un).`);
  }
  const lien = (id, longueurM, { longueurParFiche = false } = {}) => {
    const r = { refus: [], alertes: [] };
    const l = liaisons.find((x) => x.id === id);
    if (!l) {
      r.refus.push('Liaison non choisie.');
      return r;
    }
    const c = controleLiaison(l, format);
    if (!c.ok) r.refus.push(`Liaison ${l.nom} : ${c.raison}.`);
    r.alertes.push(...c.alertes);
    const longueur = controleLongueur(id, longueurM, { format, seuils });
    if (longueur.texte) r.alertes.push(longueur.texte);
    const parLiaison = longueurParFiche ? { refus: [], alertes: [] } : controleLongueurLiaison(l, longueurM);
    r.refus.push(...parLiaison.refus);
    r.alertes.push(...parLiaison.alertes);
    return r;
  };
  // Cadences propres à la sortie du mélangeur qu'emprunte la liaison (même famille : V-600UHD, SDI OUT en 50 et
  // 59,94 Hz seulement) : elles remplacent celles du mélangeur entier, dans les mêmes messages, avec leur source.
  const familleDe = (id) => liaisons.find((x) => x.id === id)?.famille ?? id;
  const parSortie = regie ? null : (source.cadencesParSortie ?? []).find((x) => familleDe(x.type) === familleDe(chaine.liaison));
  const sourceCadences = parSortie ? { ...source, cadences: parSortie.cadences, noteCadences: parSortie.noteCadences,
    sortieCadences: liaisons.find((x) => x.id === parSortie.type)?.nom ?? parSortie.type } : source;
  // Mélangeur en source : formats broadcast, cadences de sa fiche, sorties qui portent le Program face aux processeurs.
  const sourceAppareil = () => {
    const r = { refus: [], alertes: [], notes: [] };
    const f = controleFormatsSortie(source, format);
    r.refus.push(...f.refus);
    r.alertes.push(...f.alertes);
    const sc = sourceCadences;
    if (sc.formatsSortie?.length && sc.cadences?.length && !sc.cadences.some((c) => Math.abs(c - format.frequenceHz) < 0.01)) {
      r.refus.push(`Le ${sc.nom} ne sort qu'en ${sc.cadences.map((c) => nombreCourt(c)).join(' ou ')} Hz${texteSortieCadences(sc)} : `
        + `pas de source à ${nombreCourt(format.frequenceHz)} Hz${sc.noteCadences ? ` (${sc.noteCadences})` : ''}.`);
    }
    const n = evaluation.nombre ?? 1;
    if (!regie && source.sortiesVersProcesseurs && n > source.sortiesVersProcesseurs) {
      r.alertes.push(`${n} processeurs pour ${source.sortiesVersProcesseurs} sortie${source.sortiesVersProcesseurs > 1 ? 's' : ''} du ${source.nom} qui `
        + `porte${source.sortiesVersProcesseurs > 1 ? 'nt' : ''} le Program : ajoute un ampli de distribution.`);
    }
    // Condition d'une sortie, dès le processeur qui l'occupe (fiche, avec la page du manuel dans le texte).
    for (const c of regie ? [] : source.conditionsSortiesProgram ?? []) {
      if (n >= c.aPartirDe) (c.niveau === 'note' ? r.notes : r.alertes).push(`${source.nom} : ${c.texte}`);
    }
    return r;
  };
  const appareilConvertisseur = (c) => {
    const f = controleFormatsMax(c, format);
    const l = controleLongueursExtender(c, c.longueurM, format);
    return { refus: [...controleSortieChoisie(c, c.liaison, liaisons), ...f.refus, ...l.refus], alertes: [...f.alertes, ...l.alertes], notes: [...f.notes, ...l.notes] };
  };
  const fusion = (...rs) => ({ refus: rs.flatMap((x) => x.refus ?? []), alertes: rs.flatMap((x) => x.alertes ?? []), notes: rs.flatMap((x) => x.notes ?? []) });
  const retenus = convertisseurs.slice(0, CONVERTISSEURS_MAX);
  const proc = evaluation.processeur;
  const nomDe = (id) => liaisons.find((x) => x.id === id)?.nom ?? id;
  const maillons = [
    { role: 'source', nom: regie ? regie.nom : (source.nom ?? 'Source'), liaison: chaine.liaison, liaisonNom: nomDe(chaine.liaison),
      longueurM: chaine.longueurM ?? null, ...fusion(sourceAppareil(), lien(chaine.liaison, chaine.longueurM)) },
    ...retenus.map((c) => ({ role: 'convertisseur', nom: c.nom, liaison: c.liaison, liaisonNom: nomDe(c.liaison), longueurM: c.longueurM ?? null,
      ...fusion(appareilConvertisseur(c), lien(c.liaison, c.longueurM, { longueurParFiche: Boolean(c.longueursMax?.length) })) })),
    { role: 'processeur', nom: proc.nom, liaison: null, longueurM: null, refus: [], alertes: [], notes: [] },
  ];
  // Cadence : source face au calcul data, puis appareils qui n'acceptent que certaines cadences (fiche).
  const cadence = [
    ...controleCadence(format.frequenceHz, frequenceCalculHz),
    ...[sourceCadences, ...retenus].filter((x) => x.cadences?.length).flatMap((x) => controleCadence(frequenceCalculHz, frequenceCalculHz, { appareil: x })),
  ];
  const aLatence = (x) => [x?.latenceMinImages, x?.latenceMaxImages, x?.latenceMinMs, x?.latenceMaxMs].some((y) => y !== undefined && y !== null);
  const latence = latenceChaine([
    ...(aLatence(source) ? [{ nom: source.nom ?? 'Source', ...latencesDe(source) }] : []),
    ...(regie ? [{ nom: regie.nom, ...latencesDe(regie) }] : []),
    ...retenus.map((c) => ({ nom: c.nom, ...latencesDe(c) })),
    { nom: proc.nom, ...latencesDe(proc) },
  ], format.frequenceHz);
  refus.push(...maillons.flatMap((m) => m.refus));
  return {
    maillons,
    latence,
    latenceSourceComptee: aLatence(source),
    cadence,
    liaisonProcesseur: retenus.length ? retenus[retenus.length - 1].liaison : chaine.liaison,
    alertes: [...maillons.flatMap((m) => m.alertes), ...cadence],
    notes: maillons.flatMap((m) => m.notes ?? []),
    refus,
    ok: refus.length === 0,
  };
}
const latencesDe = (x) => ({
  latenceMinImages: x.latenceMinImages ?? undefined, latenceMaxImages: x.latenceMaxImages ?? undefined,
  latenceMinMs: x.latenceMinMs ?? undefined, latenceMaxMs: x.latenceMaxMs ?? undefined,
});

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
// Repère sans fiche : 1 kVA/m² pour un écran plein jour (Formation, support de cours), compté en watts.
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

// Alertes de plusieurs zones : une alerte commune à toutes les zones est donnée une fois ; une alerte propre à
// certaines zones les nomme (« Zone A : … », « Zones A, B : … »).
function regrouperAlertes(listes, noms) {
  const ordre = [];
  const zonesDe = new Map();
  listes.forEach((liste, i) => liste.forEach((texte) => {
    if (!zonesDe.has(texte)) {
      zonesDe.set(texte, []);
      ordre.push(texte);
    }
    if (!zonesDe.get(texte).includes(noms[i])) zonesDe.get(texte).push(noms[i]);
  }));
  return ordre.map((texte) => {
    const zones = zonesDe.get(texte);
    return zones.length === listes.length ? texte : `${zones.length > 1 ? 'Zones' : 'Zone'} ${zones.join(', ')} : ${texte}`;
  });
}

// Électricité d'un mur en zones (étape 9a) : lignes calculées zone par zone, jamais à cheval sur deux zones ; en
// triphasé, équilibre des phases sur toutes les lignes de toutes les zones ensemble, avec les critères du mur d'une
// seule pièce (écart entre phases le plus faible ; à écart égal, le moins de lignes ; à lignes égales, les plus
// régulières). Recherche : on part du minimum de lignes de chaque zone, puis on change la répartition d'une seule zone à
// la fois (n'importe laquelle de ses répartitions en colonnes entières), en gardant le meilleur changement, tant qu'il
// améliore (choix de conception : le nombre de combinaisons croît trop vite pour toutes les essayer).
function electriciteZones(m, dalle, reglages) {
  const murs = mursDesZones(m, dalle);
  // Mur mixte (9b5) : chaque zone à la P max de sa propre dalle.
  const parZone = murs.map((s) => electricite(s, s.fiche ?? dalle, reglages));
  const premier = parZone[0];
  const { tensionV, arrivee, depart } = premier.reglages;
  const noms = m.zones.map((z) => z.nom);
  // La phase d'une ligne vient de la répartition de tout le mur, jamais du calcul d'une zone seule.
  const avecZone = (lignes, i) => lignes.map(({ phase, ...l }) => ({ ...l, zone: noms[i] }));
  const lignesColonnes = parZone.flatMap((r, i) => avecZone(r.lignes.colonnes.lignes, i));
  const lignesApj = parZone.flatMap((r, i) => avecZone(r.lignes.auPlusJuste.lignes, i));
  const puissanceTotaleW = arrondiW(parZone.reduce((t, r) => t + r.puissanceTotaleW, 0));
  const capacitePhaseW = premier.arrivee.capacitePhaseW;
  // Les contrôles de l'arrivée se font sur tout le mur, pas zone par zone.
  const alertes = regrouperAlertes(parZone.map((r) => r.alertes.filter((a) => !/^(L'arrivée mono|Arrivée tri)/.test(a))), noms);
  const apj = lignesApj.length;
  const minimum = { nombre: apj, raisons: [], texte: null };
  const pose = (retenues, raisonEquilibre = null) => {
    minimum.raisons = [];
    if (lignesColonnes.length > apj) minimum.raisons.push('une colonne n\'est jamais coupée entre deux lignes, et une ligne ne passe jamais d\'une zone à l\'autre');
    if (raisonEquilibre) minimum.raisons.push(raisonEquilibre);
    minimum.texte = retenues === apj ? null
      : `Minimum théorique : ${apj} ligne${apj > 1 ? 's' : ''} au plus juste, contre ${retenues} en colonnes entières. Écart : ${minimum.raisons.join(' ; ')}.`;
  };
  const resultat = {
    reglages: premier.reglages,
    pMax: premier.pMax,
    manques: parZone.flatMap((r) => r.manques).filter((x, i, t) => t.findIndex((y) => y.texte === x.texte) === i),
    puissanceTotaleW,
    btuH: puissanceTotaleW * BTU_PAR_W,
    ligne: premier.ligne,
    dallesParLigne: premier.dallesParLigne,
    zones: parZone.map((r, i) => ({
      nom: noms[i], lignes: r.lignes.colonnes.nombre, lignesAuPlusJuste: r.lignes.auPlusJuste.nombre, puissanceW: r.puissanceTotaleW,
      ...(m.mixte ? { pMax: r.pMax, dallesParLigne: r.dallesParLigne } : {}),
    })),
    lignes: {
      auPlusJuste: { nombre: apj, lignes: lignesApj, theorique: parZone.reduce((t, r) => t + r.lignes.auPlusJuste.theorique, 0), depart, ecart: null },
      colonnes: {
        nombre: lignesColonnes.length,
        colonnesParLigne: colonnesParPortZones(parZone.map((r) => r.lignes.colonnes.colonnesParLigne), murs.map((s) => s.colonnes)),
        segments: parZone[murs.reduce((a, x, i) => (x.pxHauteur > murs[a].pxHauteur ? i : a), 0)].lignes.colonnes.segments,
        lignes: lignesColonnes,
      },
      retenues: lignesColonnes.length,
      minimum,
    },
    arrivee: premier.arrivee,
    monophase: null,
    triphase: null,
    appel: parZone.map((r) => r.appel).filter(Boolean).reduce((a, b) => (!a || b.picLigneA > a.picLigneA ? b : a), null),
    alertes,
  };
  const copie = (lignes) => lignes.map((l) => ({ ...l }));
  if (arrivee.type === 'mono') {
    const ok = puissanceTotaleW <= capacitePhaseW + EPS;
    resultat.monophase = { puissanceW: puissanceTotaleW, capaciteW: capacitePhaseW, intensiteA: puissanceTotaleW / tensionV, ok };
    if (!ok) {
      alertes.push(`L'arrivée mono ${nombreCourt(arrivee.intensiteA)} A porte ${nombreCourt(capacitePhaseW)} W utiles `
        + `(${nombreCourt(tensionV)} V, marge ${nombreCourt(premier.reglages.marge * 100)} %) : le mur demande ${nombreCourt(puissanceTotaleW)} W. `
        + 'Il faut une arrivée plus forte ou du triphasé.');
    }
    pose(lignesColonnes.length);
    return resultat;
  }
  // Répartitions possibles de chaque zone en colonnes entières, du minimum de lignes à une colonne par ligne : au
  // minimum, le plus de colonnes par ligne (3 + 1) et la plus régulière (2 + 2) ; colonne coupée en segments : lignes fixes.
  const options = parZone.map((r, i) => {
    const lc = r.lignes.colonnes;
    // Zone de forme libre : ses lignes en colonnes entières, telles quelles (choix de conception, 9b5).
    if (!lc.colonnesParLigne || murs[i].forme) return [avecZone(lc.lignes, i)];
    const z = m.zones[i];
    const pDalle = r.pMax.dalle.valeurW;
    const tailles = [lc.lignes.map((l) => l.colonnes), ...suite(lc.lignes.length, z.colonnes).map((n) => repartir(z.colonnes, n))]
      .filter((t, j, liste) => liste.findIndex((u) => u.join() === t.join()) === j);
    return tailles.map((t) => t.map((k) => ({ colonnes: k, dalles: k * z.lignes, puissanceW: arrondiW(k * z.lignes * pDalle), zone: z.nom })));
  });
  const evaluer = (indices) => {
    const lignes = indices.flatMap((j, i) => copie(options[i][j]));
    const tailles = lignes.map((l) => l.colonnes);
    const option = repartitionMinimale(lignes, tensionV, capacitePhaseW);
    return { ecartW: option.ecartW, n: lignes.length, irregularite: Math.max(...tailles) - Math.min(...tailles), option, indices };
  };
  const avant = (a, b) => a.ecartW < b.ecartW - EPS
    || (Math.abs(a.ecartW - b.ecartW) <= EPS && (a.n < b.n || (a.n === b.n && a.irregularite < b.irregularite)));
  let courant = evaluer(options.map(() => 0));
  for (;;) {
    let meilleur = null;
    options.forEach((o, i) => {
      for (let j = 0; j < o.length; j += 1) {
        if (j === courant.indices[i]) continue;
        const essai = evaluer(courant.indices.map((x, k) => (k === i ? j : x)));
        if (!meilleur || avant(essai, meilleur)) meilleur = essai;
      }
    });
    if (!meilleur || !avant(meilleur, courant)) break;
    courant = meilleur;
  }
  const equilibre = courant.option;
  const minimumColonnes = repartitionMinimale(copie(lignesColonnes), tensionV, capacitePhaseW);
  resultat.triphase = {
    // Au plus juste à phases équilibrées (lignes en multiple de 3 le long du serpentin) : pas encore en zones.
    auPlusJuste: { equilibre: null, minimum: repartitionMinimale(copie(lignesApj), tensionV, capacitePhaseW) },
    colonnes: { equilibre, minimum: minimumColonnes },
  };
  resultat.lignes.retenues = equilibre.lignes.length;
  const pc = (x) => `${nombreCourt(x, 0)} %`;
  pose(equilibre.lignes.length, equilibre.lignes.length > minimumColonnes.lignes.length
    ? `équilibre des phases : ${equilibre.lignes.length} lignes au lieu de ${minimumColonnes.lignes.length}, `
      + `écart entre phases ${pc(equilibre.ecartPourcent)} au lieu de ${pc(minimumColonnes.ecartPourcent)}` : null);
  if (!equilibre.ok) {
    const max = Math.max(...equilibre.phases.map((p) => p.puissanceW));
    alertes.push(`Arrivée tri ${nombreCourt(arrivee.intensiteA)} A : la phase la plus chargée demande ${nombreCourt(max)} W `
      + `pour ${nombreCourt(capacitePhaseW)} W utiles par phase, même équilibrée. Il faut une arrivée plus forte.`);
  }
  return resultat;
}

// Électricité d'un mur, calculée par phase, jamais sur le total.
// Réglages : tensionV (220), marge (0,8), puissanceUtileW (facultatif), departA (16),
// arrivee { type: 'mono' | 'tri', intensiteA }, courbe ('B', 'C', 'D' ou null).
export function electricite(m, dalle, reglages = {}) {
  if (plusieursZones(m)) return electriciteZones(m, dalle, reglages);
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
      const texte = `P max absente de la fiche ${fiche.nom} : estimée à ${nombreCourt(p.valeurW)} W avec le repère de 1 kVA/m², `
        + 'source Formation (support de cours). Remplace-la par la P max de la fiche dès que possible.';
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
  // Zone de forme libre (9b5, Z26) : colonnes entières de hauteurs réelles, le plus de colonnes par ligne.
  const c = m.forme ? cablageForme(m, retenu, charge) : cablage(m, retenu, charge);
  const watts = (e, d) => arrondiW(e * pDalle.valeurW + d * (pDemi ? pDemi.valeurW : 0));
  // Au plus juste le long du vrai serpentin depuis le coin de départ : il fait foi. Le décompte théorique
  // (dalles entières d'abord, puis demi-dalles) reste donné en second.
  const presente = m.forme ? ([col, r]) => m.forme.colonnes[col - 1].cases[r - 1].presente : () => true;
  const serpent = serpentin(suite(1, m.colonnes), suite(1, m.rangees.length), 'vertical', depart).filter(presente);
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
  if (m.forme) {
    lignesColonnes = casesParGroupe(m, c.colonnes.groupes).map((cases, n) => {
      const d = cases.filter((x) => x.type === 'demi').length;
      const [a, b] = c.colonnes.groupes[n];
      return { colonnes: b - a + 1, dalles: cases.length, puissanceW: watts(cases.length - d, d) };
    });
  } else if (c.colonnes.colonnesParPort) {
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

// Poids d'un mur en zones (étape 9a) : chaque zone est une structure à part (ses bumpers, ses points, son maximum en
// accroche ou en stack), puis les totaux ; les autres charges suspendues comptent une fois, pour tout le mur.
// Alertes d'un bumper, d'un point d'accroche ou du maximum en accroche (retirées d'une zone accrochée sous une autre).
const ALERTES_ACCROCHE = /^(CMU du bumper|Pont sur plus de 4 points|Autres charges suspendues|CMU du moteur|Maximum en accroche|Fiche sans maximum en accroche)/;
function poidsZones(m, dalle, reglages) {
  const { mode = 'accroche', autresKg = 0, accroche = { type: 'bumpers' } } = reglages;
  if (!(autresKg >= 0)) throw new ErreurSaisie('Les poids de câbles et d\'autres charges sont positifs ou nuls.');
  const noms = m.zones.map((z) => z.nom);
  const murs = mursDesZones(m, dalle);
  const saisies = m.saisie?.zones ?? [];
  // Zone accrochée sous une autre (9b5, Z27, en accroche seulement) : son poids passe sur les colonnes au-dessus d'elle.
  const reference = m.zones.map((z, i) => {
    const p = saisies[i]?.placement;
    return mode === 'accroche' && p?.type === 'dessous' && p.accrocheeSous ? m.zones.findIndex((x) => x.nom === p.zone) : -1;
  });
  const seul = murs.map((s) => poids(s, s.fiche ?? dalle, { ...reglages, autresKg: 0 }));
  const alertesAccroche = [];
  // Colonnes d'une zone, zones accrochées dessous comprises (en cascade).
  const memo = new Map();
  const colonnesTotales = (i) => {
    if (memo.has(i)) return memo.get(i);
    const colonnes = seul[i].colonnes.map((c) => ({ kg: c.kg, dalles: c.dalles }));
    let hauteurMm = 0;
    m.zones.forEach((zb, b) => {
      if (reference[b] !== i) return;
      const zh = m.zones[i];
      const largeurH = zh.largeurMm / zh.colonnes;
      const largeurB = zb.largeurMm / zb.colonnes;
      const dessous = colonnesTotales(b);
      dessous.colonnes.forEach((c, j) => {
        const k = Math.floor((zb.xMm + (j + 0.5) * largeurB - zh.xMm) / largeurH);
        if (k < 0 || k >= zh.colonnes) {
          alertesAccroche.push(`${zb.nom} · C${j + 1} accrochée sous ${zh.nom} : aucune colonne de ${zh.nom} au-dessus d'elle, accroche à revoir avec le rigger.`);
          return;
        }
        colonnes[k] = { kg: colonnes[k].kg + c.kg, dalles: colonnes[k].dalles + c.dalles };
      });
      hauteurMm = Math.max(hauteurMm, zb.hauteurMm + dessous.hauteurMm);
      const fh = ficheZone(m, zh, dalle);
      const fb = ficheZone(m, zb, dalle);
      if (fh.id !== fb.id) {
        alertesAccroche.push(`${zb.nom} accrochée sous ${zh.nom} : dalles différentes accrochées l'une sous l'autre (${fb.nom} sous ${fh.nom}) : `
          + 'vérifie avec le constructeur que les verrous et les bumpers sont compatibles.');
      }
    });
    const total = { colonnes, hauteurMm };
    memo.set(i, total);
    return total;
  };
  const parZone = murs.map((s, i) => {
    const total = colonnesTotales(i);
    const ajouts = total.colonnes.map((c, j) => ({ kg: arrondiKg(c.kg - seul[i].colonnes[j].kg), dalles: c.dalles - seul[i].colonnes[j].dalles }));
    const r = ajouts.some((a) => a.kg > EPS || a.dalles > 0)
      ? poids(s, s.fiche ?? dalle, { ...reglages, autresKg: 0, ajoutsColonnes: ajouts, hauteurAjouteeMm: total.hauteurMm })
      : seul[i];
    // Zone accrochée : ni point ni bumper à elle, son maximum se contrôle avec la zone du dessus ; ses alertes de
    // bumper, de point et de maximum (et le manque du maximum) partent avec eux.
    if (reference[i] < 0) return r;
    return {
      ...r, points: null, bumpers: [], bumpersKg: 0, maximum: null, accrocheeSous: m.zones[reference[i]].nom,
      alertes: r.alertes.filter((a) => !ALERTES_ACCROCHE.test(a)), manques: r.manques.filter((x) => x.champ !== 'maxAccroche'),
    };
  });
  const somme = (f) => arrondiKg(parZone.reduce((t, r) => t + f(r), 0));
  const dallesKg = somme((r) => r.dallesKg);
  const cablesKg = somme((r) => r.cablesKg);
  const bumpersKg = somme((r) => r.bumpersKg);
  const murKg = arrondiKg(dallesKg + cablesKg);
  const suspenduKg = arrondiKg(murKg + bumpersKg + autresKg);
  const alertes = [...regrouperAlertes(parZone.map((r) => r.alertes), noms), ...alertesAccroche];
  // Les autres charges ne sont sur aucun point de zone : à placer avec le rigger, pont compris.
  if (mode === 'accroche' && autresKg > 0) {
    alertes.push(`Autres charges suspendues (${texteKg(autresKg)}) : à reprendre sur un point ou sur la structure, avec le rigger.`);
  }
  // Zones qui pendent à un pont : pas celles accrochées sous une autre.
  const surPont = reference.filter((x) => x < 0).length;
  if (mode === 'accroche' && accroche.type === 'pont' && accroche.poidsPontKg > 0 && surPont > 1) {
    alertes.push(`Pont : chaque zone pend à son propre pont ; ses ${texteKg(accroche.poidsPontKg)} sont comptés pour chacune des `
      + `${surPont} zones. Si plusieurs zones partagent un pont, la répartition doit être établie par le rigger.`);
  }
  const manques = parZone.flatMap((r) => r.manques).filter((x, i, t) => t.findIndex((y) => y.texte === x.texte) === i);
  // Maximum le plus juste : la zone la plus proche de sa limite (ou au-delà).
  const maxima = parZone.map((r, i) => r.maximum && { ...r.maximum, zone: noms[i] }).filter(Boolean);
  const maximum = maxima.length ? maxima.reduce((a, b) => (b.valeur / b.limite > a.valeur / a.limite ? b : a)) : null;
  return {
    mode,
    poidsDalleKg: dalle.poidsKg,
    poidsDemiKg: null,
    dallesKg,
    cablesKg,
    bumpersKg,
    autresKg,
    murKg,
    suspenduKg,
    kgParM2: dallesKg / m.surfaceM2,
    kgParMetre: suspenduKg / (m.zones.reduce((t, z) => t + z.largeurMm, 0) / 1000),
    colonnes: parZone.flatMap((r, i) => r.colonnes.map((c) => ({ ...c, zone: noms[i] }))),
    bumpers: parZone.flatMap((r, i) => r.bumpers.map((b) => ({ ...b, zone: noms[i] }))),
    // Points d'accroche : zone par zone (chaque zone pend à sa structure).
    points: null,
    maximum,
    zones: parZone.map((r, i) => ({ nom: noms[i], ...r })),
    alertes,
    manques,
    rappels: RAPPELS_POIDS,
    indicatif: true,
  };
}

// Poids d'un mur et répartition sur les points d'accroche.
// Réglages : mode ('accroche' ou 'stack'), bumper { poidsKg, colonnes, cmuKg }, cablesKgParDalle, autresKg,
// accroche { type: 'bumpers' | 'pont', points, porteesEgales, poidsPontKg, cmuMoteurKg, configurationMoteur }.
export function poids(m, dalle, reglages = {}) {
  const {
    mode = 'accroche', bumper = null, cablesKgParDalle = 0, autresKg = 0, accroche = { type: 'bumpers' },
  } = reglages;
  if (plusieursZones(m)) return poidsZones(m, dalle, reglages);
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
  // Zone de forme libre (9b5, Z27) : chaque colonne pesée sur ses dalles présentes.
  let colonnes = m.forme
    ? m.forme.colonnes.map((col, i) => {
      const cases = col.cases.filter((x) => x.presente);
      return { numero: i + 1, dalles: cases.length, kg: arrondiKg(cases.reduce((t, x) => t + (x.type === 'demi' ? pDemi : dalle.poidsKg) + cablesKgParDalle, 0)) };
    })
    : Array.from({ length: m.colonnes }, (_, i) => ({ numero: i + 1, dalles: dallesParColonne, kg: colonneKg }));
  // Zone accrochée sous celle-ci (9b5, Z27) : ses colonnes s'ajoutent aux colonnes au-dessus d'elles.
  const ajouts = reglages.ajoutsColonnes ?? [];
  colonnes = colonnes.map((c, i) => (ajouts[i] ? { ...c, dalles: c.dalles + ajouts[i].dalles, kg: arrondiKg(c.kg + ajouts[i].kg) } : c));
  const ajoutKg = arrondiKg(ajouts.reduce((t, a) => t + (a?.kg ?? 0), 0));
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
      const kg = arrondiKg(colonnes.slice(debut - 1, fin).reduce((t, c) => t + c.kg, 0) + bumper.poidsKg);
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
  // Charge suspendue de cette zone, zones accrochées dessous comprises.
  const suspenduKg = arrondiKg(murKg + bumpersKg + autresKg + ajoutKg);

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
    const valeurs = {
      dalles: Math.max(...colonnes.map((c) => c.dalles)),
      m: (m.hauteurMm + (reglages.hauteurAjouteeMm ?? 0)) / 1000,
      kg: Math.max(...colonnes.map((c) => c.kg)),
    };
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
    // Dalles de ce mur (ou de cette zone) seulement, et charge des zones accrochées dessous (9b5).
    ...(ajoutKg > 0 ? { dallesPropres: m.dalles.total, ajoutKg } : {}),
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
// Câble des ports 5G (CX40 Pro, CVT8-5G) : le Cat6A du wiki COEX, le plus exigeant ; 100 m de la fiche CVT8-5G.
const TEXTE_CABLE_5G = 'Cat6A obligatoire (wiki COEX) ; 100 m au plus (fiche CVT8-5G V1.1.0, copie non officielle, qui accepte le Cat6 jusqu\'à 100 m)';
// Colorlight 5G : câble blindé Cat6 ou mieux, longueur de la fiche (80 m sur les fiches Z3 et Z8t, déduit ailleurs).
// Carte MX_8×5G_Base-T : ports 5G en cuivre en direct, longueur maxi non publiée par Novastar ; seuil de 100 m de la norme.
const TEXTE_CABLE_5G_BASE_T = 'Cat6A obligatoire (wiki COEX) ; longueur maxi non publiée pour la carte MX_8×5G_Base-T (seuil de 100 m : norme 5GBASE-T, IEEE 802.3bz)';
export function texteCable5G(proc) {
  if (proc.carteSortie?.longueurCableNonPubliee) return TEXTE_CABLE_5G_BASE_T;
  if (!proc.longueurCable5GM) return TEXTE_CABLE_5G;
  return `câble blindé Cat6 ou mieux, ${proc.longueurCable5GM} m au plus (${proc.sources?.longueurCable5GM?.source.court ?? 'fiche'})`;
}
const limiteCuivre = (proc) => (proc.typePorts === '5G' && proc.longueurCable5GM ? proc.longueurCable5GM : LIMITE_CUIVRE_M);
// Colorlight 1G : hauteur au-delà de laquelle la capacité d'un port baisse (fiche S20 V2.1, p. 2).
const HAUTEUR_REDUITE_S20_PX = 1280;
export const MARGE_MOU_DEFAUT = 0.1;
// Processeurs sans sortie fibre (MCTRL300, MCTRL660, VX2U, VX4S, VX6s…) : fibre seulement par convertisseurs sur chaque port.
const TEXTE_SANS_FIBRE = 'pas de sortie fibre : une paire de CVT310 (multimode, 550 m) ou CVT320 (monomode, 20 km) par port au-delà de 100 m';
// Colorlight sans sortie fibre : les H10FN2, H10FN et H10Fix demandent une sortie fibre 10G.
const TEXTE_SANS_FIBRE_COLORLIGHT = 'pas de sortie fibre : une paire de convertisseurs Ethernet-fibre 1G par port au-delà de 100 m '
  + '(les H10FN2, H10FN et H10Fix demandent une sortie fibre 10G ; choix de conception du projet)';
// HELIOS Jr : ports 1G en cuivre, sans sortie fibre.
const TEXTE_SANS_FIBRE_MEGAPIXEL = 'pas de sortie fibre : une paire de convertisseurs Ethernet-fibre 1G par port au-delà de 100 m '
  + '(choix de conception du projet), ou un HELIOS 4K ou 8K avec ses switches';
const TEXTES_SANS_FIBRE = { colorlight: TEXTE_SANS_FIBRE_COLORLIGHT, megapixel: TEXTE_SANS_FIBRE_MEGAPIXEL };
// Convertisseurs de même rôle, cités en note.
const AUTRES_DISTRIBUTEURS = { 'colorlight-h10fn2': 'H10FN ou H10Fix' };
// Distributeur fibre proposé quand le cuivre dépasse 100 m, si la fiche du processeur n'en nomme pas.
const FIBRE_PAR_FAMILLE = { brompton: 'XD', novastar: 'CVT10', colorlight: 'convertisseurs fibre', megapixel: 'switches' };
// Nom court des convertisseurs, pour les libellés de ports et les alertes.
export const MODELES_DISTRIBUTEUR = {
  'brompton-xd': 'XD', 'brompton-xd-t': 'XD-T', 'brompton-xd-s': 'XD-S', 'novastar-cvt10': 'CVT10', 'coex-cvt8-5g': 'CVT8-5G', 'novastar-cvt4k': 'CVT4K', 'novastar-cvt310': 'CVT310', 'novastar-cvt320': 'CVT320',
  'colorlight-h10fn2': 'H10FN2', 'colorlight-h2f': 'H2F', 'colorlight-h10fix-5g': 'H10Fix-5G',
  'netgear-m4250-msm4214x': 'M4250', 'netgear-m4200-gsm4210p': 'M4200',
};

export const idDalle = (colonne, rangee) => `C${colonne} R${rangee}`;
// Mur en zones (étape 9a, D4) : « B · C3 R2 », colonne et rangée comptées dans la zone.
export const idDalleZone = (zone, colonne, rangee) => `${zone} · C${colonne} R${rangee}`;

// Identifiant d'une position [colonne du mur, rangée] : en zones, la colonne est comptée de 1 à m.colonnes à travers les
// zones et la rangée dans la zone.
function identifiantDalle(m) {
  // Une seule zone (de forme libre) : « C3 R2 », comme ses dalles (dallesDesZones).
  if (!plusieursZones(m) || m.zones.length === 1) return (c, r) => idDalle(c, r);
  return (c, r) => {
    const z = m.zones.find((x) => c < x.premiereColonne + x.colonnes);
    return idDalleZone(z.nom, c - z.premiereColonne + 1, r);
  };
}
const suite = (debut, fin) => Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);

// Dalles du mur, rangée par rangée : position et taille en millimètres et en pixels, chacune avec sa fiche
// (la demi-dalle garde la sienne).
export function dallesDuMur(m, dalle) {
  if (plusieursZones(m)) return dallesDesZones(m, dalle);
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

// Mur en zones : chaque zone à sa place réelle (mm, haut le plus haut à 0) et dans la pixel map (px, vides compris).
function dallesDesZones(m, dalleMur) {
  const basMin = Math.min(...m.zones.map((z) => z.basMm));
  const hautMax = basMin + m.hauteurMm;
  // Une seule zone (de forme libre) : noms sans la zone, « C3 R2 », comme le mode Dalles.
  const nommer = m.zones.length > 1 ? idDalleZone : (zone, c, r) => idDalle(c, r);
  return m.zones.flatMap((z) => {
    // Mur mixte : chaque zone avec sa dalle et sa demi-dalle.
    const dalle = ficheZone(m, z, dalleMur);
    const demi = demiZone(m, z);
    const yMm = hautMax - z.basMm - z.hauteurMm;
    const dalles = [];
    if (z.forme) {
      // Forme libre : rangée par rangée, les dalles présentes seulement, chacune avec sa fiche (la demi-dalle garde la sienne).
      for (let r = 1; r <= z.forme.types.length; r += 1) {
        for (const col of z.forme.colonnes) {
          const x = col.cases[r - 1];
          if (!x.presente) continue;
          const fiche = x.type === 'demi' ? demi : dalle;
          const j = col.colonne;
          dalles.push({
            id: nommer(z.nom, j, r),
            colonne: z.premiereColonne + j - 1,
            colonneZone: j,
            rangee: r,
            zone: z.nom,
            type: x.type,
            fiche,
            mm: { x: z.xMm + (j - 1) * dalle.largeurMm, y: yMm + x.yMm, largeur: fiche.largeurMm, hauteur: fiche.hauteurMm },
            px: { x: z.x + (j - 1) * dalle.pxH, y: z.y + x.y, largeur: fiche.pxH, hauteur: fiche.pxV },
          });
        }
      }
      return dalles;
    }
    for (let r = 1; r <= z.lignes; r += 1) {
      for (let j = 1; j <= z.colonnes; j += 1) {
        dalles.push({
          id: nommer(z.nom, j, r),
          colonne: z.premiereColonne + j - 1,
          colonneZone: j,
          rangee: r,
          zone: z.nom,
          type: 'entiere',
          fiche: dalle,
          mm: { x: z.xMm + (j - 1) * dalle.largeurMm, y: yMm + (r - 1) * dalle.hauteurMm, largeur: dalle.largeurMm, hauteur: dalle.hauteurMm },
          px: { x: z.x + (j - 1) * dalle.pxH, y: z.y + (r - 1) * dalle.pxV, largeur: dalle.pxH, hauteur: dalle.pxV },
        });
      }
    }
    return dalles;
  });
}

// Pixel map : le mur à sa résolution native, puis un canvas par processeur (bloc posé en (0,0) de son canvas,
// à la même place dans sa source). Chaque dalle : x et y de son premier à son dernier pixel.
export function pixelMap(m, dalle, evaluation = null) {
  // Mur mixte : le mur tel que le processeur le compte (pixels interpolés sur les M2 et T1), comme cablageData.
  if (evaluation?.mur) {
    m = evaluation.mur;
    dalle = m.dallePrincipale ?? dalle;
  }
  const dalles = dallesDuMur(m, dalle);
  const enZones = plusieursZones(m);
  const indexZone = enZones ? new Map(m.zones.map((z, i) => [z.nom, i])) : null;
  const zone = (d, x0 = 0, y0 = 0) => ({
    id: d.id, colonne: d.colonne, rangee: d.rangee, type: d.type,
    ...(enZones ? { zone: indexZone.get(d.zone), colonneZone: d.colonneZone } : {}),
    x: [d.px.x - x0, d.px.x - x0 + d.px.largeur - 1],
    y: [d.px.y - y0, d.px.y - y0 + d.px.hauteur - 1],
  });
  // Mur en zones (étape 9a) : chaque zone, ou morceau de zone dans un canvas, pour les étiquettes de la pixel map.
  const etiquette = (nom, index, x, y, largeurPx, hauteurPx, colonnes, rangees) => {
    // Mur mixte : la taille réelle avec la dalle de la zone ; forme libre : celle de la zone (décalages compris).
    const z = enZones ? m.zones[index] : null;
    const f = z ? ficheZone(m, z, dalle) : dalle;
    const largeurM = (colonnes * f.largeurMm) / 1000;
    const hauteurM = z?.forme && rangees >= z.forme.types.length ? z.hauteurMm / 1000 : (rangees * f.hauteurMm) / 1000;
    return { nom, index, x, y, largeurPx, hauteurPx, largeurM, hauteurM };
  };
  // Dalles d'un bloc : celles de ses morceaux de zones (zone, colonnes et rangées dans la zone) ; sinon ses colonnes
  // et rangées du mur.
  // Forme libre coupée en hauteur : la dalle dans la bande du morceau (en pixels, les colonnes décalées n'ont pas leurs
  // rangées à la même hauteur).
  const dansRangees = (p, d) => (m.zones[p.zone].forme
    ? d.px.y >= p.y && d.px.y + d.px.hauteur <= p.y + p.hauteurPx
    : d.rangee >= p.premiereRangee && d.rangee < p.premiereRangee + p.rangees);
  const dansBloc = (g) => (g.parties
    ? (d) => g.parties.some((p) => m.zones[p.zone].nom === d.zone && d.colonneZone >= p.premiereColonne && d.colonneZone < p.premiereColonne + p.colonnes
      && dansRangees(p, d))
    : (d) => d.colonne >= g.premiereColonne && d.colonne <= g.derniereColonne && d.rangee >= g.premiereRangee && d.rangee <= g.derniereRangee);
  const canvas = (evaluation?.groupes ?? []).map((g, i) => ({
    numero: i + 1,
    bloc: { largeurPx: g.largeurPx, hauteurPx: g.hauteurPx },
    canvas: g.canvas,
    xMur: g.x,
    yMur: g.y,
    source: { x: [0, g.largeurPx - 1], y: [0, g.hauteurPx - 1] },
    dalles: dalles.filter(dansBloc(g)).map((d) => zone(d, g.x[0], g.y[0])),
    ...(g.parties ? {
      zones: g.parties.map((p) => etiquette(p.nomAffiche, p.zone, p.dansEntree.x, p.dansEntree.y, p.largeurPx, p.hauteurPx, p.colonnes, p.rangees)),
    } : {}),
  }));
  return {
    mur: {
      largeurPx: m.pxLargeur,
      hauteurPx: m.pxHauteur,
      dalles: dalles.map((d) => zone(d)),
      ...(enZones ? { zones: m.zones.map((z, i) => etiquette(z.nom, i, z.x, z.y, z.pxLargeur, z.pxHauteur, z.colonnes, z.lignes)) } : {}),
    },
    canvas,
  };
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
function remplirGlouton(ordre, poids, capacite, plafond, penalite = null) {
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
function groupesRangees(cols, rows, poids, capacite, plafond, coin, { pair = false, penalite = null } = {}) {
  const ordreRows = coin.startsWith('haut') ? rows : [...rows].reverse();
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const positions = (rs) => rs.flatMap((r) => cols.map((c) => [c, r]));
  const tient = (ps) => ps.reduce((s, p) => s + poids(p), 0) + (penalite && ps.length ? penalite(ps) : 0) <= capacite + EPS && ps.length <= plafond;
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
  // Forme libre : le serpentin ne passe que par les dalles présentes.
  const presente = sous.forme ? ([c, r]) => sous.forme.colonnes[c - 1].cases[r - 1].presente : () => true;
  return remplirGlouton(serpentin(suite(1, sous.colonnes), suite(1, sous.rangees.length), 'vertical', depart).filter(presente), poids, charge.capacite,
    charge.plafond ?? Infinity, penaliteGroupe(charge, sous.rangees))
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
  // Mur mixte (9b3) : le mur tel que le processeur le compte (pixels interpolés sur les M2 et T1).
  if (evaluation.mur) {
    m = evaluation.mur;
    dalle = m.dallePrincipale ?? dalle;
  }
  const proc = evaluation.processeur;
  const { redondance, modeOptique } = evaluation.reglages;
  const capacite = evaluation.capacite;
  const plafond = redondance && proc.maxDallesParBoucleRedondance ? proc.maxDallesParBoucleRedondance : Infinity;
  const dalles = new Map(dallesDuMur(m, dalle).map((d) => [d.id, d]));
  const cle = identifiantDalle(m);
  const tuile = ([c, r]) => dalles.get(cle(c, r));
  // Formes libres (9b6) : seules les dalles présentes sont câblées ; mur mixte : chaque dalle à ses propres pixels.
  const existe = (p) => dalles.has(cle(...p));
  const poids = (p) => {
    const t = tuile(p);
    if (!t) return 0;
    if (m.mixte) return pixelsComptes(t.fiche, proc);
    return t.type === 'demi' ? evaluation.pxParDemi : evaluation.pxParDalle;
  };
  const hauteurs = m.rangees.map((type) => (type === 'demi' ? m.demi.pxV : dalle.pxV));
  const charge = { capacite, pxParDalle: evaluation.pxParDalle, pxParDemi: evaluation.pxParDemi ?? evaluation.pxParDalle, plafond, ...chargeGeometrie(proc, dalle, m) };
  const chargeDeFiche = (fiche, demiFiche) => {
    const px = pixelsComptes(fiche, proc);
    const pxDemi = demiFiche ? pixelsComptes(demiFiche, proc) : px;
    return {
      parPort: dallesParPort(capacite, px, { plafond }),
      charge: { ...charge, pxParDalle: px, pxParDemi: pxDemi, ...chargeGeometrie(proc, fiche, { demi: demiFiche }), ...(proc.logiciel === 'NovaLCT' ? { rectangle: true } : {}) },
    };
  };
  const enFormes = m.mixte || m.zones?.some((z) => z.forme);
  // Rectangle englobant d'un groupe de dalles, d'après leurs pixels (formes libres, mur mixte).
  const rectangleGroupe = (grp) => {
    const t = grp.map(tuile).filter(Boolean);
    return (Math.max(...t.map((d) => d.px.x + d.px.largeur)) - Math.min(...t.map((d) => d.px.x)))
      * (Math.max(...t.map((d) => d.px.y + d.px.hauteur)) - Math.min(...t.map((d) => d.px.y)));
  };
  const rectanglePort = (grp) => (enFormes ? rectangleGroupe(grp) : pxRectangleEnglobant(grp, dalle, hauteurs));
  // COEX 1G : réduction de capacité d'un port qui charge moins de 128 px de large (rectangle englobant).
  const penalite = penaliteGroupe(charge, m.rangees);
  const sorties = proc.sortiesParDistributeur;
  const surDistributeur = Boolean((evaluation.distributeurObligatoire ?? proc.distributeurObligatoire) && sorties);
  const modeleDistributeur = MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'XD';
  const fibre = nomDistributeur ?? MODELES_DISTRIBUTEUR[proc.distributeur] ?? FIBRE_PAR_FAMILLE[proc.famille] ?? 'convertisseurs fibre';
  const novaLCT = proc.logiciel === 'NovaLCT';
  const cinqG = proc.typePorts === '5G';

  // Cartes à zones (Z8t, X100 Pro, série H) : convertisseurs numérotés carte par carte, dans l'ordre des ports ;
  // sinon par groupes de `sorties` ports.
  let numerotation = null;
  const libellePort = (n, miroir = false) => {
    if (!surDistributeur) return `port ${n}`;
    const x = numerotation?.[n - 1] ?? { conv: Math.ceil(n / sorties), port: ((n - 1) % sorties) + 1 };
    return `${modeleDistributeur}${miroir ? ' miroir' : ''} ${x.conv}, port ${x.port}`;
  };
  const numerotationParCartes = (groupes) => {
    const carte = proc.carteSortie;
    if (!surDistributeur || !(carte?.largeurMaxPx || carte?.pixelsMax)) return null;
    const parCarte = redondance && !proc.portsRedondance ? Math.floor(carte.portsParCarte / 2) : carte.portsParCarte;
    const tient = (z, n) => n <= parCarte && z.px <= (carte.pixelsMax ?? Infinity) + EPS
      && z.x1 - z.x0 <= (carte.largeurMaxPx ?? Infinity) && z.y1 - z.y0 <= (carte.hauteurMaxPx ?? Infinity);
    const zones = groupes.map((grp) => {
      const t = grp.map(tuile);
      return {
        x0: Math.min(...t.map((d) => d.px.x)), x1: Math.max(...t.map((d) => d.px.x + d.px.largeur)),
        y0: Math.min(...t.map((d) => d.px.y)), y1: Math.max(...t.map((d) => d.px.y + d.px.hauteur)),
        px: grp.reduce((somme, q) => somme + poids(q), 0),
      };
    });
    const fusion = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), px: a.px + b.px });
    const cartes = repartirSurCartes(zones, fusion, tient, optionsConvertisseurs(proc, redondance));
    if (!cartes) return null;
    // Convertisseurs numérotés carte par carte, dans l'ordre des ports.
    const resultat = [];
    let avant = 0;
    for (const nCarte of cartes) {
      for (let k = 0; k < nCarte; k += 1) resultat.push({ conv: avant + Math.floor(k / sorties) + 1, port: (k % sorties) + 1 });
      avant += Math.ceil(nCarte / sorties);
    }
    return resultat;
  };
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
      // Mur en zones : chaque morceau de zone câblé à part (un port ne passe jamais d'une zone à l'autre), les morceaux
      // pris depuis le côté du départ ; sinon le bloc entier.
      const morceaux = g.parties
        ? g.parties.map((p) => {
          const c0 = m.zones[p.zone].premiereColonne + p.premiereColonne - 1;
          // Forme libre : les dalles du morceau seulement (coupé en hauteur, une rangée peut être à cheval sur deux morceaux).
          const dans = p.sous?.forme ? new Set(p.sous.forme.colonnes.flatMap((c) => c.cases.filter((x) => x.presente).map((x) => `${c0 + c.colonne - 1},${x.rangee}`))) : null;
          return { cols: suite(c0, c0 + p.colonnes - 1), rows: suite(p.premiereRangee, p.premiereRangee + p.rangees - 1), sous: p.sous ?? mur(dalle, p.colonnes, p.rangees), dans };
        })
        : [{ cols: suite(g.premiereColonne, g.derniereColonne), rows: suite(g.premiereRangee, g.derniereRangee), sous: sousMur(m, dalle, g.colonnes, g.premiereRangee, g.rangees) }];
      const groupesDuMorceau = ({ cols, rows, sous, dans }) => {
      const ici = dans ? (p) => existe(p) && dans.has(`${p[0]},${p[1]}`) : existe;
      let groupes;
      if (sous.forme && (mode === 'colonnes' || mode === 'rectangles')) {
        // Forme libre (9b6) : les ports de l'onglet Data (colonnes entières de hauteurs réelles ; pour NovaLCT, chacun
        // est déjà un rectangle réalisable).
        const t = chargeDeFiche(sous.fiche ?? dalle, sous.demiFiche ?? m.demi);
        groupes = groupesForme(sous, cols[0], cablageForme(sous, t.parPort, t.charge, { pair: evaluation.colonnesPaires, depuisDroite: depart.endsWith('droite') }).colonnes.groupes, depart);
      } else if (mode === 'colonnes') {
        // Mêmes colonnes par port que l'onglet Data : le plus possible, en nombre pair en redondance
        // (sauf s'il coûte un processeur). Mur mixte : la charge de la dalle du morceau.
        const t = m.mixte && sous.fiche ? chargeDeFiche(sous.fiche, sous.demiFiche) : { parPort: evaluation.dallesParPort, charge };
        const cBloc = cablage(sous, t.parPort, t.charge, { pair: evaluation.colonnesPaires });
        const k = cBloc.colonnes.colonnesParPort;
        if (k) {
          groupes = lotsDeColonnes(cols, rows, k, depart);
        } else {
          groupes = segmentsDeColonnes(cols, rows, cBloc.colonnes.segments, depart);
          notes.push(`Processeur n° ${i + 1} : une colonne dépasse la capacité d'un port. Elle est coupée en ${cBloc.colonnes.segments.length} `
            + 'segments égaux : les ports éloignés du bord démarrent au milieu de leur colonne, leur câble de tête longe la colonne.');
        }
      } else if (mode === 'rangees') {
        groupes = groupesRangees(cols, rows, (p) => (ici(p) ? poids(p) : 0), capacite, plafond, depart, { pair: evaluation.colonnesPaires, penalite })
          .map((grp) => grp.filter(ici)).filter((grp) => grp.length);
      } else if (mode === 'auPlusJuste') {
        groupes = remplirGlouton(serpentin(cols, rows, 'vertical', depart).filter(ici), poids, capacite, plafond, penalite);
        if (novaLCT) {
          const trop = groupes.findIndex((grp) => rectanglePort(grp) > capacite + EPS);
          if (trop >= 0) {
            raisons.push(`Au plus juste non réalisable tel quel dans NovaLCT : le port ${trop + 1} du processeur n° ${i + 1} compte le rectangle qui englobe `
              + `ses dalles (${nombreCourt(rectanglePort(groupes[trop]))} px), au-delà des `
              + `${nombreCourt(entierInferieur(capacite))} px d'un port. Prends les rectangles NovaLCT.`);
          }
        }
      } else {
        const r = rectanglesNovaLCT(sous, sous.fiche ?? dalle, capacite);
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
      return groupes;
      };
      const groupes = (depart.endsWith('droite') ? [...morceaux].reverse() : morceaux).flatMap(groupesDuMorceau);

      const nb = groupes.length;
      if (utilises(nb) > limite) {
        raisons.push(`Le processeur n° ${i + 1} demande ${utilises(nb)} ports${redondance && proc.portsRedondance ? ' principaux' : ''}, `
          + `au-delà des ${limite} d'un ${proc.nom}.`);
      }
      numerotation = numerotationParCartes(groupes);
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
          dalles: grp.map(([c, r]) => cle(c, r)),
          px,
          taux: (px + (penalite ? penalite(grp) : 0)) / capacite,
          longueurCuivreM: distanceRegieM === null ? null : (surDistributeur ? trajet : distanceRegieM + trajet) * mou,
          fibreM: distanceRegieM !== null && surDistributeur ? distanceRegieM * mou : null,
        };
      });
      return { numero: i + 1, modele: proc.modele, ports };
    });

    const tous = processeurs.flatMap((p) => p.ports);
    const alertes = [];
    // 5G : Cat6A obligatoire, 100 m au plus comme en 1G (fiche CVT8-5G) ; Colorlight : câble blindé, 80 m (fiches Z3 et Z8t).
    const limiteM = limiteCuivre(proc);
    const longs = tous.filter((p) => p.longueurCuivreM > limiteM);
    if (cinqG) alertes.push(`Ports 5G : ${proc.longueurCable5GM ? '' : 'câble '}${texteCable5G(proc)}.`);
    if (longs.length > 0) {
      const autres = AUTRES_DISTRIBUTEURS[proc.distributeur];
      alertes.push(`${longs.length} câble${longs.length > 1 ? 's' : ''} de tête en cuivre au-delà de ${limiteM} m `
        + `(jusqu'à ${nombreCourt(Math.max(...longs.map((p) => p.longueurCuivreM)), 1)} m) : l'Ethernet en cuivre s'arrête à ${limiteM} m, `
        + (proc.sortiesFibre === 'aucune'
          ? `et le ${proc.modele} n'a ${TEXTES_SANS_FIBRE[proc.famille] ?? TEXTE_SANS_FIBRE}.`
          : `passe en fibre avec des ${fibre} au pied du mur${autres && !nomDistributeur ? ` (${autres} possibles)` : ''}.`));
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
  const cle = identifiantDalle(m);
  const tuile = ([c, r]) => dalles.get(cle(c, r));
  const pDalle = elec.pMax.dalle.valeurW;
  const pDemi = elec.pMax.demi ? elec.pMax.demi.valeurW : pDalle;
  // Formes libres (9b6) : dalles présentes seulement ; mur mixte : chaque dalle à sa P max.
  const pMaxFiche = new Map();
  const pFiche = (f) => {
    if (!pMaxFiche.has(f.id)) pMaxFiche.set(f.id, pMaxDalle(f).valeurW);
    return pMaxFiche.get(f.id);
  };
  const poids = (p) => {
    const t = tuile(p);
    if (!t) return 0;
    if (m.mixte) return pFiche(t.fiche);
    return t.type === 'demi' ? pDemi : pDalle;
  };
  const utileW = elec.ligne.utileW;
  const plafond = elec.dallesParLigne.chainage ?? Infinity;
  const mono = elec.arrivee.type === 'mono';
  const { tensionV } = elec.reglages;
  const capacitePhaseW = elec.arrivee.capacitePhaseW;
  const cols = suite(1, m.colonnes);
  const rows = suite(1, m.rangees.length);
  const charge = { capacite: utileW, pxParDalle: pDalle, pxParDemi: pDemi, plafond };
  // Mur en zones : lignes zone par zone (jamais à cheval), les zones prises depuis le côté du départ.
  if (plusieursZones(m)) return cablageElecZones(m, dalle, elec, { depart, distanceArmoireM, margeMou, tuile, cle, poids, charge, pFiche, existe: (p) => dalles.has(cle(...p)) });
  const c = cablage(m, elec.dallesParLigne.retenu, charge);
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
        dalles: grp.map(([col, r]) => cle(col, r)),
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

// Câblage élec d'un mur en zones (étape 9a) : chaque zone câblée à part, dans les variantes par colonnes (au minimum de
// lignes, et en triphasé celles de l'équilibre de l'onglet Élec), par rangées et au plus juste ; phases comme le mur
// d'une seule pièce. L'au plus juste à phases équilibrées n'existe pas encore en zones.
function cablageElecZones(m, dalle, elec, { depart, distanceArmoireM, margeMou, tuile, cle, poids, charge, pFiche, existe }) {
  const mono = elec.arrivee.type === 'mono';
  const { tensionV } = elec.reglages;
  const capacitePhaseW = elec.arrivee.capacitePhaseW;
  const utileW = elec.ligne.utileW;
  const plafond = charge.plafond;
  const murs = mursDesZones(m, dalle);
  // Lignes d'une zone : celles de l'onglet Élec, à la P max de sa dalle (mur mixte) ; forme libre : colonnes de hauteurs
  // réelles, dalles présentes seulement (9b6).
  const zones = (depart.endsWith('droite') ? [...m.zones].reverse() : m.zones).map((z) => {
    const sous = murs[z.index];
    const fiche = ficheZone(m, z, dalle);
    const p = m.mixte ? pFiche(fiche) : charge.pxParDalle;
    const pD = sous.demiFiche ? (m.mixte ? pFiche(sous.demiFiche) : charge.pxParDemi) : p;
    const chainage = fiche.chainagePowerMax ?? null;
    const parLigne = m.mixte ? Math.min(Math.floor(utileW / p + EPS), chainage ?? Infinity) : elec.dallesParLigne.retenu;
    const ch = { ...charge, pxParDalle: p, pxParDemi: pD, plafond: m.mixte ? chainage ?? Infinity : plafond };
    return {
      z, sous, ch, parLigne, cols: suite(z.premiereColonne, z.premiereColonne + z.colonnes - 1), rows: suite(1, sous.rangees.length),
      c: sous.forme ? cablageForme(sous, parLigne, ch) : cablage(sous, parLigne, ch),
    };
  });
  const coupees = zones.filter((x) => !x.c.colonnes.colonnesParPort).map((x) => x.z.nom);
  const coupee = coupees.length ? `Une colonne dépasse une ligne (zone${coupees.length > 1 ? 's' : ''} ${coupees.join(', ')}) : elle est coupée en segments égaux, `
    + 'les lignes éloignées du bord démarrent au milieu de leur colonne.' : null;
  const tailles = (option) => option?.lignes.map((l) => l.colonnes).join(' ');
  const equilibre = elec.triphase?.colonnes.equilibre;
  const equilibreDistinct = !mono && !coupees.length && equilibre && tailles(equilibre) !== tailles(elec.triphase.colonnes.minimum);
  const colonnesZone = ({ sous, cols, rows, c, ch, parLigne }) => {
    if (sous.forme) {
      const groupes = depart.endsWith('droite') ? cablageForme(sous, parLigne, ch, { depuisDroite: true }).colonnes.groupes : c.colonnes.groupes;
      return groupesForme(sous, cols[0], groupes, depart);
    }
    return c.colonnes.colonnesParPort
      ? lotsDeColonnes(cols, rows, c.colonnes.colonnesParPort, depart) : segmentsDeColonnes(cols, rows, c.colonnes.segments, depart);
  };
  const garder = (groupes) => groupes.map((grp) => grp.filter(existe)).filter((grp) => grp.length);
  const groupesDe = {
    colonnes: () => zones.flatMap(colonnesZone),
    // Forme libre : ses lignes de l'onglet Élec, telles quelles (9b5).
    colonnesEquilibre: () => zones.flatMap((x) => (x.sous.forme ? colonnesZone(x) : lotsDeColonnes(x.cols, x.rows,
      equilibre.lignes.filter((l) => l.zone === x.z.nom).map((l) => l.colonnes).sort((a, b) => b - a), depart))),
    // Chaque zone à son chaînage (mur mixte : celui de sa dalle).
    rangees: () => zones.flatMap(({ cols, rows, ch }) => garder(groupesRangees(cols, rows, poids, utileW, ch.plafond, depart))),
    auPlusJuste: () => zones.flatMap(({ cols, rows, ch }) => remplirGlouton(serpentin(cols, rows, 'vertical', depart).filter(existe), poids, utileW, ch.plafond)),
  };
  const notes = { colonnes: coupee, colonnesEquilibre: coupee };
  const modes = ['colonnes', ...(equilibreDistinct ? ['colonnesEquilibre'] : []), 'rangees', 'auPlusJuste'];
  const variantes = modes.map((mode) => {
    const lignesDetail = groupesDe[mode]().map((grp, i) => {
      const puissanceW = arrondiW(grp.reduce((s, p) => s + poids(p), 0));
      return {
        numero: i + 1,
        phase: null,
        dalles: grp.map(([col, r]) => cle(col, r)),
        puissanceW,
        taux: puissanceW / utileW,
        longueurTeteM: distanceArmoireM === null ? null : (distanceArmoireM + trajetDepuisCoin(m, depart, tuile(grp[0]))) * (1 + margeMou),
      };
    });
    const { phases, ok } = phasesDesLignes(lignesDetail, { equilibre: mode === 'rangees', mono, tensionV, capacitePhaseW });
    const charges = phases.map((p) => p.puissanceW);
    return {
      mode,
      libelle: LIBELLES_ELEC[mode],
      orientation: mode === 'rangees' ? 'rangees' : 'colonnes',
      mention: mode === 'auPlusJuste' ? MENTION_AU_PLUS_JUSTE : null,
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
      alertes: ok ? [] : [`Une phase dépasse les ${nombreCourt(capacitePhaseW)} W utiles de l'arrivée : il faut une arrivée plus forte.`],
    };
  });
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
    // Mur en zones : une couleur par zone, deux tons en damier (comme la slide de la formation).
    ...(d.zone !== undefined ? { zone: d.zone, ton: (d.colonneZone + d.rangee) % 2 } : {}),
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
    // Mur en zones : au centre de chaque zone (ou morceau), son nom, « x, y // largeur × hauteur » et sa taille en m.
    etiquettes: (zone.zones ?? []).map((z) => ({
      x: z.x + z.largeurPx / 2,
      y: z.y + z.hauteurPx / 2,
      lignes: [z.nom, `${z.x}, ${z.y} // ${z.largeurPx} × ${z.hauteurPx}`, `${nombreCourt(z.largeurM, 2)} × ${nombreCourt(z.hauteurM, 2)} m`],
      taille: Math.max(12, Math.round(Math.min(z.largeurPx, z.hauteurPx) * 0.05)),
      largeurMax: z.largeurPx * 0.9,
    })),
  };
}
