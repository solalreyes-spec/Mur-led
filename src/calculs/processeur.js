// Calculs du mur LED, module 4, data (4/4) : Megapixel, évaluation d'un processeur, conseil, alternative SX40,
// gain en 10 bits.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, quantite, minuscule, LIBELLES_COIN, suite, serpentin, remplirGlouton } from './commun.js';
import { mur } from './mur.js';
import { plusieursZones, mursDesZones, hauteurPortsPx } from './morceaux.js';
import { FAMILLES_SANS_REGLE_VIDES, murZones } from './mur-zones.js';
import { BIT_DEPTH_PAR_DEFAUT, entierInferieur, capacitePort, refusBitsReseau, capacitePortProcesseur, champsManquants, processeurAvecCartesLED, processeurAvecCartes, controleCarteReception, verifierCarte, pixelsComptes, dallesParPort, chargePx, penaliteLargeurChargee, penaliteGroupe, NOMS_LIEN_HELIOS, capaciteHelios, texteCable5G, HAUTEUR_REDUITE_S20_PX, MODELES_DISTRIBUTEUR } from './capacites.js';
import { minimumTheorique, formatsCanvas, chargeGeometrie, sousMur, cablageMur } from './ports.js';
import { decouper, minimumTheoriqueZones, seuilZones, rectanglesZones, rectanglesNovaLCT } from './decoupage.js';

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
  // Dalles tournées hors axe (9c4, Z37, F6) : Tessera M2 et T1 seulement ; refus ailleurs, avec la raison.
  if (m.horsAxe && !proc.rotationHorsAxe) {
    return {
      ...vide,
      impossible: proc.famille === 'brompton'
        ? `${proc.nom} : rotation hors axe : Tessera M2 et T1 seulement (manuel Tessera § 7.14.5) ; le ${proc.nom} ne tourne les dalles que par quarts de tour.`
        : `${proc.nom} : rotation hors axe non documentée pour ce processeur ; seuls les Tessera M2 et T1 la font (manuel Tessera § 7.14.5).`,
    };
  }

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
  // Pixels de l'appareil : chaque dalle hors axe compte deux fois (9c4, manuel Tessera § 13.1.4, p. 226).
  if (m.horsAxe) m = { ...m, pxTotal: m.zones.reduce((t, z) => t + z.pxTotal * (z.roulis ? 2 : 1), 0) };
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
  // Dalles des zones tournées hors axe (9c4) comprises : comptées deux fois (relecture du 13/10/2026).
  const fichesTournees = m.horsAxe ? m.zones.filter((z) => z.roulis).flatMap((z) => [z.dalle, z.demi]).filter(Boolean) : [];
  const tropGrande = [...fichesMur, ...fichesTournees].map((f) => pixelsComptes(f, proc)).find((px) => dallesParPort(capacite, px) < 1);
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
  // Mur mixte (9b3) : la charge d'un port selon la dalle de sa zone ; zone tournée hors axe (9c4) : sa dalle compte double.
  if (m.mixte || m.horsAxe) {
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
  // Dalles tournées hors axe (9c4) : comptées deux fois ; quarts de tour sans coût, légende de la figure 7.56 non retenue (F6).
  if (m.horsAxe) {
    const n = m.zones.filter((z) => z.roulis).reduce((t, z) => t + z.dalles, 0);
    notes.push(`${n} ${n > 1 ? 'dalles hors axe comptées' : 'dalle hors axe comptée'} deux fois, dans la charge des ports et les pixels de l'appareil `
      + '(manuel Tessera V3.5, § 7.14.5 et § 13.1.4, p. 226).');
    notes.push('Rotation par quarts de tour sans coût (manuel Tessera, § 7.14.5 et § 13.1.4) ; la légende de la figure 7.56 (« Network load is increased '
      + 'when rotating fixtures by 90 degrees ») contredit le texte du manuel : non retenue.');
  }
  // Forme réelle (9c, Z35) : zone courbe ou pliée, joints plus clairs ou plus sombres ; rien ne change dans le calcul.
  if ((m.saisie?.zones ?? []).some((z) => z.courbure || z.pose?.type === 'pliee')) {
    const tete = 'Mur courbe ou plié : joints plus clairs ou plus sombres possibles entre les dalles';
    if (proc.famille === 'brompton') notes.push(`${tete} ; correction joint par joint dans Tessera, Seams Adjustment dans OSCA (manuel Tessera V3.5, § 12.1.9, p. 179).`);
    else if (proc.logiciel === 'NovaLCT') notes.push(`${tete} ; correction dans NovaLCT, Adjust Dark or Bright Lines (guide NovaLCT V5.5.0, § 6.4, p. 63).`);
    else notes.push(`${tete} ; correction des joints : à chercher dans le logiciel du processeur.`);
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
    // Zones tournées hors axe (9c4) : pixels comptés par dalle (deux fois) et dalles par port, pour Data.
    ...(m.horsAxe ? {
      pixelsHorsAxe: m.zones.filter((z) => z.roulis).map((z) => ({ zone: z.nom, px: pixelsComptes(z.dalle, proc), parPort: dallesParPort(capacite, pixelsComptes(z.dalle, proc), { plafond }) })),
      toutHorsAxe: m.zones.every((z) => z.roulis),
    } : {}),
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
