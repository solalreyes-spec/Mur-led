// Calculs du mur LED, module 2, canvas et source : EDID, liaisons, entrées, source conseillée, sortie du serveur pliée.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, minuscule, ErreurSaisie } from './commun.js';
import { ficheZone } from './morceaux.js';
import { alerteBitDepthSource } from './capacites.js';
import { dallesDuMur } from './pixel-map.js';
import { cablageData } from './cablage.js';

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
export function controleSource(source, evaluation, liaisons, data, { pliage = null } = {}) {
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
    // Sortie pliée (9b7) : le bloc arrive plié dans le format de la sortie.
    ...(pliage?.blocs[i] && !pliage.blocs[i].tel ? {
      plie: pliage.blocs[i],
      tient: pliage.blocs[i].ok && pliage.format.largeurPx <= largeurPx && pliage.format.hauteurPx <= hauteurPx,
    } : {}),
    // Mur en zones : chaque morceau de zone dans la source (le bloc en haut à gauche), position à régler dans le processeur.
    ...(g.parties ? {
      parties: g.parties.map((p) => ({
        nom: p.nomAffiche,
        x: [p.dansEntree.x, p.dansEntree.x + p.largeurPx - 1],
        y: [p.dansEntree.y, p.dansEntree.y + p.hauteurPx - 1],
      })),
    } : {}),
  }));
  // Bloc plié (9b7) : contrôlé par son pliage, plus bas.
  const tropGrands = blocs.filter((b) => !b.tient && !b.plie);
  for (const b of blocs.filter((x) => x.plie && !x.plie.ok)) refus.push(`Processeur n° ${b.numero} : ${b.plie.raison}`);
  if (tropGrands.length > 0) {
    refus.push(`${tropGrands.length === 1 ? 'Le bloc' : 'Les blocs'} ${tropGrands.map((b) => `n° ${b.numero} (${b.largeurPx} × ${b.hauteurPx} px)`).join(', ')} `
      + `ne ${tropGrands.length === 1 ? 'tient' : 'tiennent'} pas dans une source de ${largeurPx} × ${hauteurPx} px.`);
  }
  for (const b of blocs.filter((x) => x.canvas?.lowLatency)) {
    alertes.push(`Bloc n° ${b.numero} : le format ${b.canvas.format.replace(' (Low Latency Mode)', '')} force le Low Latency Mode`
      + `${proc.latence ? ` (latence : ${proc.latence})` : ''}.`);
  }

  for (const b of blocs.filter((x) => x.plie?.ok && !x.tient)) {
    refus.push(`Processeur n° ${b.numero} : la sortie pliée fait ${pliage.format.largeurPx} × ${pliage.format.hauteurPx} px, `
      + `plus que la source de ${largeurPx} × ${hauteurPx} px.`);
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
export function sourceConseillee(evaluation, liaisons, frequenceHz, { pliage = null } = {}) {
  const blocs = evaluation.groupes ?? [];
  if (blocs.length === 0) return null;
  // Sortie pliée (9b7, S6) : un bloc plié prend la taille du format de la sortie.
  const plies = pliage?.ok ? pliage.blocs : [];
  const taille = (g, i) => (plies[i] && !plies[i].tel ? [pliage.format.largeurPx, pliage.format.hauteurPx] : [g.largeurPx, g.hauteurPx]);
  const largeur = Math.max(...blocs.map((g, i) => taille(g, i)[0]));
  const hauteur = Math.max(...blocs.map((g, i) => taille(g, i)[1]));
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
    // 'standard' : format standard ; 'pliage' : format de la sortie pliée ; 'entree' : le standard ne passe pas l'entrée ;
    // 'taille' : aucun standard assez grand.
    raison: retenu ? (plies.some((b) => !b.tel) ? 'pliage' : 'standard') : (standard ? 'entree' : 'taille'),
    formatStandard: standard ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sortie du serveur pliée (étape 9b7)
// ---------------------------------------------------------------------------

// Morceaux d'un bloc de processeur, dans la pixel map du mur (celle que compte le processeur) : zone, colonnes (dans la
// zone, ou dans le mur d'une seule pièce), abscisse de chaque bord de colonne, place et taille réelle.
function morceauxDuBloc(m, dalle, g) {
  if (g.parties) {
    return g.parties.map((p) => {
      const z = m.zones[p.zone];
      const f = ficheZone(m, z, dalle);
      return {
        zone: z.nom, nomAffiche: p.nomAffiche, enZone: true, premiere: p.premiereColonne, colonnes: p.colonnes, x: p.x, y: p.y,
        largeurColonnePx: f.pxH, hauteurPx: p.hauteurPx, largeurColonneMm: f.largeurMm,
        hauteurMm: p.sous?.forme ? p.sous.hauteurMm : p.rangees * f.hauteurMm,
      };
    });
  }
  const types = m.rangees.slice(g.premiereRangee - 1, g.derniereRangee);
  return [{
    zone: 'Mur', nomAffiche: 'Mur', enZone: false, premiere: g.premiereColonne, colonnes: g.colonnes, x: g.x[0], y: g.y[0],
    largeurColonnePx: dalle.pxH, hauteurPx: g.hauteurPx, largeurColonneMm: dalle.largeurMm,
    hauteurMm: types.reduce((t, type) => t + (type === 'demi' ? m.demi.hauteurMm : dalle.hauteurMm), 0),
  }];
}

// Colonnes [première, dernière] de chaque port du câblage conseillé d'un processeur (colonnes entières de Data et du
// Schéma), par zone (« Mur » pour un mur d'une seule pièce).
function colonnesDesPorts(m, dalle, evaluation, numero, depart) {
  const mm = evaluation.mur ?? m;
  const tuiles = new Map(dallesDuMur(mm, mm.dallePrincipale ?? dalle).map((d) => [d.id, d]));
  let ports = [];
  try {
    const c = cablageData(m, dalle, evaluation, { depart });
    ports = c.variantes.find((x) => x.mode === c.conseil)?.processeurs[numero - 1]?.ports ?? [];
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
  }
  return ports.map((p) => {
    const t = p.dalles.map((id) => tuiles.get(id)).filter(Boolean);
    const cols = t.map((d) => d.colonneZone ?? d.colonne);
    return { zone: t[0]?.zone ?? 'Mur', debut: Math.min(...cols), fin: Math.max(...cols) };
  }).filter((p) => Number.isFinite(p.debut));
}

// Plier le bloc d'un processeur dans une sortie standard (S2 à S4) : chaque morceau de zone coupé en tranches de
// colonnes entières, la coupe entre deux ports du câblage conseillé, une tranche au plus large comme la sortie, le
// moins de tranches ; tranches dans l'ordre des morceaux (gauche à droite, puis haut en bas), posées en étagères sans
// espace. `format` : [largeur, hauteur]. Refus avec la raison (une tranche impossible, ou trop haut).
export function plierBloc(m, dalle, evaluation, numero, format, { depart = 'haut-gauche', suggerer = true } = {}) {
  const [W, H] = format;
  const mm = evaluation.mur ?? m;
  const dm = mm.dallePrincipale ?? dalle;
  const g = evaluation.groupes[numero - 1];
  const ports = colonnesDesPorts(m, dalle, evaluation, numero, depart);
  const morceaux = morceauxDuBloc(mm, dm, g).sort((a, b) => a.x - b.x || a.y - b.y);
  const base = { numero, format: { largeurPx: W, hauteurPx: H }, tranches: [], hauteurPx: 0, ok: false, raison: null };
  const tranches = [];
  for (const p of morceaux) {
    const fin = p.premiere + p.colonnes - 1;
    // Coupe permise après la colonne c : aucun port de ce morceau n'a de colonnes des deux côtés.
    const coupe = (c) => c === fin || !ports.some((x) => x.zone === p.zone && x.debut <= c && c < x.fin);
    let debut = p.premiere;
    while (debut <= fin) {
      let retenue = null;
      for (let c = debut; c <= fin && (c - debut + 1) * p.largeurColonnePx <= W; c += 1) if (coupe(c)) retenue = c;
      if (retenue === null) {
        let c = debut;
        while (!coupe(c)) c += 1;
        return { ...base, raison: `Pliage impossible dans ${W} × ${H} : un port de ${p.nomAffiche} fait ${(c - debut + 1) * p.largeurColonnePx} px de large, `
          + `plus large que la sortie (colonnes ${debut} à ${c}).` };
      }
      const offset = (debut - p.premiere) * p.largeurColonnePx;
      tranches.push({
        zone: p.zone, nomMorceau: p.nomAffiche, colonnes: [debut, retenue],
        contenu: { x: p.x + offset, y: p.y, largeurPx: (retenue - debut + 1) * p.largeurColonnePx, hauteurPx: p.hauteurPx },
        largeurM: ((retenue - debut + 1) * p.largeurColonneMm) / 1000, hauteurM: p.hauteurMm / 1000,
      });
      debut = retenue + 1;
    }
  }
  // Noms (S4) : la zone et « k/n » sur toutes ses tranches ; une tranche seule garde le nom du morceau.
  const parZone = new Map();
  for (const t of tranches) parZone.set(t.zone, (parZone.get(t.zone) ?? 0) + 1);
  const rang = new Map();
  for (const t of tranches) {
    const n = parZone.get(t.zone);
    rang.set(t.zone, (rang.get(t.zone) ?? 0) + 1);
    t.nom = n > 1 ? `${t.zone} ${rang.get(t.zone)}/${n}` : t.nomMorceau;
    delete t.nomMorceau;
  }
  // Étagères (S3) : de gauche à droite tant que la tranche tient dans la largeur, sinon une étagère plus bas.
  let x = 0;
  let y = 0;
  let hauteurEtagere = 0;
  for (const t of tranches) {
    if (x > 0 && x + t.contenu.largeurPx > W) {
      y += hauteurEtagere;
      x = 0;
      hauteurEtagere = 0;
    }
    t.sortie = { x, y };
    x += t.contenu.largeurPx;
    hauteurEtagere = Math.max(hauteurEtagere, t.contenu.hauteurPx);
  }
  const hauteurPx = y + hauteurEtagere;
  const resultat = { ...base, tranches, hauteurPx };
  if (hauteurPx > H) {
    // Trop haut : « essaie 4096 × 2160 » seulement si le pliage y réussit, sinon deux sorties.
    const autre = suggerer && RESOLUTIONS_STANDARD.find(([l, h]) => (l > W || h > H)
      && plierBloc(m, dalle, evaluation, numero, [l, h], { depart, suggerer: false }).ok);
    return { ...resultat, raison: `Pliage impossible dans ${W} × ${H} : ${hauteurPx} px de haut ; `
      + `${autre ? `essaie ${autre[0]} × ${autre[1]}` : 'il faut deux sorties ou un autre découpage'}.` };
  }
  return { ...resultat, ok: true };
}

// Pliage de la sortie du serveur pour tout le mur (S1, S5) : le même format pour chaque processeur (une même source
// pour tous) ; un bloc qui y tient tel quel n'est pas plié. Réglage du processeur et rappel pour le serveur média.
export function pliageSortie(m, dalle, evaluation, format, { depart = 'haut-gauche' } = {}) {
  const [W, H] = format;
  const proc = evaluation.processeur;
  const blocs = (evaluation.groupes ?? []).map((g, i) => {
    if (g.largeurPx <= W && g.hauteurPx <= H) return { numero: i + 1, tel: true, ok: true, tranches: [], raison: null };
    return { ...plierBloc(m, dalle, evaluation, i + 1, format, { depart }), tel: false };
  });
  let reglage;
  if (proc.logiciel === 'NovaLCT') reglage = 'NovaLCT : un screen par tranche, son Coordinate (x, y) à sa place dans la sortie.';
  else if (proc.famille === 'brompton') reglage = 'Tessera : un groupe par tranche dans le canvas, à sa place dans la sortie.';
  else reglage = `${proc.logiciel ?? 'Logiciel du processeur'} : chaque tranche à sa place dans la sortie ; nom du réglage à vérifier dans son manuel.`;
  return {
    format: { largeurPx: W, hauteurPx: H },
    ok: blocs.every((b) => b.ok),
    plie: blocs.some((b) => !b.tel),
    blocs,
    refus: blocs.filter((b) => !b.ok).map((b) => `Processeur n° ${b.numero} : ${b.raison}`),
    reglage,
    rappelServeur: 'Le serveur média prend chaque tranche dans le contenu et la pose à sa place dans la sortie '
      + '(disguise : feed rectangles ; Resolume : Advanced Output).',
  };
}

// Pliage proposé (S1) : seulement quand un bloc ne tient dans aucun format standard et que le pliage réussit ; le plus
// petit format standard où il réussit, sinon null.
export function pliagePropose(m, dalle, evaluation, options = {}) {
  const blocs = evaluation?.groupes ?? [];
  if (!blocs.length) return null;
  const tient = (g) => RESOLUTIONS_STANDARD.some(([l, h]) => g.largeurPx <= l && g.hauteurPx <= h);
  if (blocs.every(tient)) return null;
  return RESOLUTIONS_STANDARD.find((f) => pliageSortie(m, dalle, evaluation, f, options).ok) ?? null;
}
