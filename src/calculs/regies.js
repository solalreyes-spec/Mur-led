// Calculs du mur LED, régies, scalers et chaîne vidéo : latence, cadence, réseau Brompton, longueurs de câble.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, minuscule } from './commun.js';
import { frequencePixel, controleLiaison } from './canvas.js';

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
export const AIDE_TESSERA_CABLES = 'aide en ligne Tessera, annexe B';
export const CUIVRE_10G_BROMPTON_M = { Cat6A: 60, Cat5e: 30 };
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
