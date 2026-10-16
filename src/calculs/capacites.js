// Calculs du mur LED, module 4, data (1/4) : capacité d'un port, bit depth, cartes de réception, pixels comptés,
// capacité HELIOS, câbles 5G et convertisseurs.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, minuscule, ErreurSaisie } from './commun.js';
import { pixelsInterpoles } from './mur.js';

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
export function processeurAvecCartesLED(proc, choix, dalle) {
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
export function processeurAvecCartes(proc, dalle, choix = 'auto', { bits = BIT_DEPTH_PAR_DEFAUT[proc.famille], frequenceHz = 60 } = {}) {
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
  // Dalle tournée hors axe (9c4) : comptée deux fois (manuel Tessera § 13.1.4).
  return Math.max(dalle.pxH, minimum) * Math.max(dalle.pxV, minimum) * (dalle.horsAxe ? 2 : 1);
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

export function chargePx(px, capacite) {
  const taux = px / capacite;
  return { px, taux, auDela95: taux > SEUIL_CHARGE_PORT + EPS };
}

// `total` réparti en `parts` groupes aussi égaux que possible, les plus grands d'abord : 44 en 3 → 15, 15, 14.
export function repartir(total, parts) {
  const base = Math.floor(total / parts);
  const reste = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < reste ? 1 : 0));
}

// Ce qu'un port accepte. Avec `charge` ({ capacite, pxParDalle, pxParDemi, plafond }), les demi-dalles
// comptent leurs vrais pixels ; sans, une demi-dalle compte comme une dalle entière.
export function modeleCharge(parPort, charge) {
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
export function penaliteGroupe(charge, rangees) {
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

// Megapixel HELIOS : capacité d'un port (ou d'une sortie 10G) lue dans le tableau de la page de support, colonnes 1G,
// 2,5G et 10G, en 10 et 12 bits. 8 bits : valeurs du 10 bits (déduit, 8 bits non publié). Fréquence absente : la ligne
// publiée juste au-dessus, la plus défavorable (59,94 → 60 Hz ; 100 → 120 Hz), déduit. Au-delà de 240 Hz : null.
const LIENS_HELIOS = ['1G', '2.5G', '10G'];
export const NOMS_LIEN_HELIOS = { '1G': '1G', '2.5G': '2,5G', '10G': '10G' };
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

// Colorlight 1G : hauteur au-delà de laquelle la capacité d'un port baisse (fiche S20 V2.1, p. 2).
export const HAUTEUR_REDUITE_S20_PX = 1280;

// Nom court des convertisseurs, pour les libellés de ports et les alertes.
export const MODELES_DISTRIBUTEUR = {
  'brompton-xd': 'XD', 'brompton-xd-t': 'XD-T', 'brompton-xd-s': 'XD-S', 'novastar-cvt10': 'CVT10', 'coex-cvt8-5g': 'CVT8-5G', 'novastar-cvt4k': 'CVT4K', 'novastar-cvt310': 'CVT310', 'novastar-cvt320': 'CVT320',
  'colorlight-h10fn2': 'H10FN2', 'colorlight-h2f': 'H2F', 'colorlight-h10fix-5g': 'H10Fix-5G',
  'netgear-m4250-msm4214x': 'M4250', 'netgear-m4200-gsm4210p': 'M4200',
};
