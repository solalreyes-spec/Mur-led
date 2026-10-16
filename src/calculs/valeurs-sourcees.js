// Calculs du mur LED, fiches et valeurs sourcées : valeur retenue, valeurs en conflit.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.

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
