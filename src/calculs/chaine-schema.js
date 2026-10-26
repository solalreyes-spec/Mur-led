// Calculs du mur LED, chaîne complète pour le Schéma (étape 19b) : en amont, la chaîne vidéo de Canvas jusqu'aux
// processeurs ; en aval, pour chaque processeur, ses appareils au pied du mur (XD, CVT, paires de convertisseurs,
// transceivers) et la liaison qui les relie, puis les câbles de tête. Rien n'est recalculé : les nombres viennent de
// Data (évaluation, réseau Brompton), de Canvas (contrôle de la chaîne) et de la variante de câblage retenue (champ
// `distributeur` de chaque port).
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { portsDoubles } from './commun.js';
import { FIBRES_SORTIE } from './config-imposee.js';
import { AIDE_TESSERA_CABLES, CUIVRE_10G_BROMPTON_M } from './regies.js';

// Au-delà, un seul élément « 8 × MCTRL660 » (un seul cadre dans le dessin).
export const PROCESSEURS_CADRES_MAX = 6;

const NON_SAISIE = 'longueur non saisie';
const longueur = (m) => (m > 0 ? `${nombreCourt(m, 1)} m` : NON_SAISIE);
const formatSource = (s, entre) => `${s.largeurPx} × ${s.hauteurPx}${entre}${nombreCourt(s.frequenceHz)} Hz`;
const enumerer = (liste) => (liste.length > 1 ? `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}` : liste[0]);
const plurielPremier = (mot) => mot.replace(/^(\S+)/, '$1s');
const compter = (nombre, materiau, unite) => (nombre === 1 ? materiau : `${nombre} ${plurielPremier(materiau)}${unite ? ` (${unite})` : ''}`);
const nomPaires = (k, type) => `${k} paire${k > 1 ? 's' : ''} de ${type === 'transceiver' ? 'transceivers fibre' : type}`;

// Processeurs de secours (étape 22) : « MCTRL4K + 1 de secours », « 2 × MCTRL4K + 2 de secours ».
function nomProcesseurs(evaluation) {
  const n = evaluation.nombre ?? 1;
  const modele = evaluation.processeur.modele ?? evaluation.processeur.nom;
  const secours = evaluation.nombreSecours > 0 ? ` + ${evaluation.nombreSecours} de secours` : '';
  return `${n > 1 ? `${n} × ${modele}` : modele}${secours}`;
}

// Amont : la chaîne de Canvas (`chaine` : maillons de controleChaine, source, régie, source conseillée ou non) ; avec une
// régie, l'appareil d'avant n'est pas saisi : la chaîne commence à la régie. Sans chaîne, les processeurs seuls.
function amont(chaine, evaluation) {
  const processeurs = nomProcesseurs(evaluation);
  const noeudProcesseurs = { role: 'processeur', nom: processeurs, texte: processeurs, enCopie: processeurs };
  if (!chaine?.maillons?.length) {
    return { noeuds: [noeudProcesseurs], liens: [], note: 'Chaîne à régler dans Canvas.', texte: `Chaîne : ${processeurs} (chaîne à régler dans Canvas).` };
  }
  const s = chaine.source;
  const [premier, ...reste] = chaine.maillons;
  const conseillee = chaine.conseillee ? ', source conseillée (Canvas)' : '';
  const tete = chaine.regie
    ? { role: 'regie', nom: premier.nom, texte: `Régie ${premier.nom} (sa source n'est pas saisie)`, detail: `sortie ${formatSource(s, ', ')}`,
      enCopie: `Régie ${premier.nom} (sa source n'est pas saisie), sortie ${formatSource(s, ' à ')}` }
    : { role: 'source', nom: premier.nom, texte: `${premier.nom} ${formatSource(s, ' ')}${conseillee}`, detail: null, conseillee: Boolean(chaine.conseillee),
      enCopie: `${premier.nom} ${formatSource(s, ' à ')}${conseillee}` };
  const convertisseurs = reste.filter((m) => m.role === 'convertisseur').map((m) => ({ role: 'convertisseur', nom: m.nom, texte: m.nom, enCopie: m.nom }));
  const liens = [premier, ...reste].filter((m) => m.role !== 'processeur').map((m) => {
    const liaison = m.liaisonNom ?? 'liaison non choisie';
    return { liaison, longueurM: m.longueurM > 0 ? m.longueurM : null, texte: `${liaison}, ${longueur(m.longueurM)}`, enCopie: `${liaison} ${longueur(m.longueurM)}` };
  });
  const noeuds = [tete, ...convertisseurs, noeudProcesseurs];
  const morceaux = noeuds.flatMap((n, i) => (liens[i] ? [n.enCopie, liens[i].enCopie] : [n.enCopie]));
  return { noeuds, liens, note: null, texte: `Chaîne : ${morceaux.join(', ')}.` };
}

// Appareils au pied du mur d'un processeur, d'après le champ `distributeur` de ses ports (principaux d'abord, puis
// secours) : un appareil par boîtier (XD, CVT), une ligne par sorte de paire (CVT310, CVT320, transceivers).
function appareilsDuProcesseur(p, numerote) {
  const entrees = [
    ...p.ports.map((x) => [x.numero, x.distributeur]),
    // Un processeur de secours (étape 22) a ses propres appareils : ils ne sont pas ceux du principal.
    ...p.ports.filter((x) => x.secours && !x.secours.processeur).map((x) => [x.secours.numero, x.secours.distributeur]),
  ].filter(([, d]) => d);
  const appareils = [];
  for (const [numero, d] of entrees) {
    const cle = d.paire ? `${d.type}|paire` : `${d.type}|${d.miroir}|${d.numero}`;
    let a = appareils.find((x) => x.cle === cle);
    if (!a) {
      a = { cle, type: d.type, numero: d.paire ? null : d.numero, miroir: d.miroir, paire: d.paire, paires: d.paire ? 0 : null, ports: [] };
      appareils.push(a);
    }
    a.ports.push(numero);
    if (d.paire) a.paires += 1;
  }
  const memeType = (a) => appareils.filter((x) => x.type === a.type && !x.paire).length;
  return appareils.map(({ cle, ...a }) => ({
    ...a,
    nom: a.paire ? nomPaires(a.paires, a.type) : (numerote || memeType(a) > 1 ? `${a.type}${a.miroir ? ' miroir' : ''} ${a.numero}` : a.type),
  }));
}

// Liaison du processeur à ses appareils : fibres OPT nommées pour une sortie en copie (MCTRL4K…), une fibre par boîtier
// ou par paire sinon ; SX40 vers XD en cuivre 10G quand le réseau Brompton de Data le dit. Longueur : la distance
// régie–mur saisie (choix b de la 19b1, comme le repère du départ ; le mou reste dans la liste de matériel).
function liaisonDuProcesseur(appareils, { proc, obligatoire, redondance, distanceM, reseau }) {
  const boitiers = appareils.filter((a) => !a.paire);
  const paires = appareils.filter((a) => a.paire).reduce((s, a) => s + a.paires, 0);
  const type = boitiers[0]?.type;
  let quoi;
  let nombre;
  let unite = null;
  let materiau = 'fibre';
  let rappel = null;
  let longueurM = distanceM > 0 ? distanceM : null;
  const table = !obligatoire && boitiers.length ? FIBRES_SORTIE[proc.id] : null;
  if (paires) {
    nombre = paires;
    unite = 'une par paire';
  } else if (table) {
    const numeros = boitiers.flatMap((a) => a.ports);
    const portees = table.filter((x) => numeros.some((n) => n >= x.ports[0] && n <= x.ports[1]));
    const secours = redondance ? portees.map((x) => x.secours) : [];
    nombre = portees.length + secours.length;
    quoi = `${nombre > 1 ? 'fibres' : 'fibre'} ${enumerer(portees.map((x) => x.nom))}${secours.length ? `, ${enumerer(secours)} en secours` : ''}`;
  } else {
    nombre = boitiers.length;
    unite = `une par ${type}`;
    const cuivre = obligatoire && proc.famille === 'brompton' ? reseau?.cuivre10G : null;
    if (cuivre) {
      materiau = `câble cuivre 10G ${cuivre.categorie}`;
      unite = `un par ${type}`;
      if (cuivre.longueurM > 0) longueurM = cuivre.longueurM;
      const limite = CUIVRE_10G_BROMPTON_M[cuivre.categorie];
      rappel = limite ? `${cuivre.categorie} ${limite} m au plus (${AIDE_TESSERA_CABLES}).`
        : `Brompton ne donne de longueur qu'en Cat6A (60 m) et en Cat5e (30 m) (${AIDE_TESSERA_CABLES}).`;
    }
  }
  quoi ??= compter(nombre, materiau, unite);
  const aVerifier = Boolean(redondance && !obligatoire && !table && !paires && boitiers.length);
  const suite = aVerifier ? ' (fibres de secours à vérifier)' : '';
  return {
    genre: materiau === 'fibre' ? 'fibre' : 'cuivre', nombre, materiau, unite, longueurM, rappel,
    texte: `${quoi}, ${longueur(longueurM)}${suite}`, enCopie: `${quoi} ${longueur(longueurM)}${suite}`,
  };
}

// Phrase du texte copié pour un processeur (ou le groupe de processeurs).
function phraseAval(nom, appareils, liaison, versDalles, groupe = false) {
  if (!appareils.length) return `${nom} : ${versDalles}.`;
  const seul = !groupe && appareils.length === 1 && (!appareils[0].paire || appareils[0].paires === 1);
  const jusqua = seul
    ? (appareils[0].paire ? `jusqu'à sa ${appareils[0].nom.replace(/^1 /, '')}` : `jusqu'au ${appareils[0].nom}`)
    : `jusqu'aux ${enumerer(appareils.map((a) => a.nom))}`;
  return `${nom} : ${liaison.enCopie} ${jusqua} au pied du mur, puis câbles de tête.`;
}

function aval(evaluation, variante, { distanceM, reseau }) {
  if (!variante?.processeurs?.length) return { elements: [], provenance: [] };
  const proc = evaluation.processeur;
  const n = evaluation.nombre ?? variante.processeurs.length;
  const modele = proc.modele ?? proc.nom;
  const obligatoire = Boolean(evaluation.distributeurObligatoire ?? proc.distributeurObligatoire);
  // Fibres de secours d'une sortie en copie : seulement avec les secours dans le même processeur (étape 22).
  const redondance = portsDoubles(evaluation);
  const dalles = `câbles de tête${distanceM > 0 ? `, régie à ${nombreCourt(distanceM, 1)} m` : ''}`;
  const elements = variante.processeurs.map((p) => {
    const appareils = appareilsDuProcesseur(p, obligatoire);
    const liaison = appareils.length ? liaisonDuProcesseur(appareils, { proc, obligatoire, redondance, distanceM, reseau }) : null;
    const versDalles = appareils.length ? 'câbles de tête' : dalles;
    const nom = n > 1 ? `${modele} n° ${p.numero}` : modele;
    const element = { numero: n > 1 ? p.numero : null, nombre: 1, nom, appareils, liaison, versDalles, texte: phraseAval(nom, appareils, liaison, versDalles) };
    // Processeur de secours (étape 22, cadre « MCTRL4K secours n° 3 ») : ses ports reçoivent les retours de secours.
    const deSecours = p.ports.filter((x) => x.secours?.processeur);
    if (!deSecours.length) return element;
    const secours = { numero: deSecours[0].secours.processeur, nom: `${modele} secours n° ${deSecours[0].secours.processeur}`, ports: deSecours.map((x) => x.secours.numero) };
    return { ...element, secours, texteSecours: `${secours.nom} : un retour de secours par port, depuis la dernière dalle de chaque port du ${nom}.` };
  });
  const provenance = variante.processeurs.flatMap((p, i) => provenanceDesPorts(p, elements[i], { proc, obligatoire, redondance }));
  if (elements.length <= PROCESSEURS_CADRES_MAX) return { elements, provenance };
  // Regroupé : les appareils comptés par sorte, les fibres (ou câbles) additionnées.
  const sortes = [];
  for (const a of elements.flatMap((e) => e.appareils)) {
    const cle = `${a.type}|${a.miroir}|${a.paire}`;
    let s = sortes.find((x) => x.cle === cle);
    if (!s) {
      s = { cle, type: a.type, numero: null, miroir: a.miroir, paire: a.paire, paires: a.paire ? 0 : null, nombre: 0, ports: [] };
      sortes.push(s);
    }
    s.nombre += 1;
    if (a.paire) s.paires += a.paires;
  }
  const appareils = sortes.map(({ cle, nombre, ...s }) => ({
    ...s, nom: s.paire ? nomPaires(s.paires, s.type) : (nombre > 1 ? `${nombre} ${s.type}${s.miroir ? ' miroirs' : ''}` : s.type),
  }));
  const premiere = elements.find((e) => e.liaison)?.liaison ?? null;
  let liaison = null;
  if (premiere) {
    const nombre = elements.reduce((t, e) => t + (e.liaison?.nombre ?? 0), 0);
    const quoi = compter(nombre, premiere.materiau, premiere.unite);
    liaison = { ...premiere, nombre, texte: `${quoi}, ${longueur(premiere.longueurM)}`, enCopie: `${quoi} ${longueur(premiere.longueurM)}` };
  }
  const nom = `${elements.length} × ${modele}${evaluation.nombreSecours > 0 ? ` + ${evaluation.nombreSecours} de secours` : ''}`;
  const versDalles = elements[0].versDalles;
  return { elements: [{ numero: null, nombre: elements.length, nom, appareils, liaison, versDalles, texte: phraseAval(nom, appareils, liaison, versDalles, true) }], provenance };
}

// Provenance du signal de chaque port principal (19b3, phrases du guide) : l'appareil au pied du mur d'où part son câble
// de tête, la liaison qui l'alimente depuis le processeur (fibre OPT nommée pour une sortie en copie, sa fibre de secours
// en redondance) et `premier` : premier port de cet appareil sur cette liaison (une paire : toujours). Calculée par
// processeur, même au-delà de PROCESSEURS_CADRES_MAX (choix b de la 19b3) ; rien pour un port en cuivre direct.
function provenanceDesPorts(p, element, { proc, obligatoire, redondance }) {
  if (!element.liaison) return [];
  const table = !obligatoire ? FIBRES_SORTIE[proc.id] : null;
  const vus = new Set();
  return p.ports.filter((x) => x.distributeur).map((x) => {
    const d = x.distributeur;
    const a = element.appareils.find((y) => y.type === d.type && (d.paire ? y.paire : !y.paire && y.numero === d.numero && y.miroir === d.miroir));
    const opt = !d.paire && table ? table.find((t) => x.numero >= t.ports[0] && x.numero <= t.ports[1]) ?? null : null;
    const cle = `${a?.nom}|${opt?.nom ?? ''}`;
    const premier = d.paire || !vus.has(cle);
    vus.add(cle);
    return {
      cle: `p${p.numero}-${x.numero}`, processeur: element.nom, appareil: a?.nom ?? d.type, type: d.type, paire: Boolean(d.paire),
      materiau: element.liaison.materiau, fibre: opt?.nom ?? null, fibreSecours: opt && redondance ? opt.secours : null,
      longueurM: element.liaison.longueurM, premier,
    };
  });
}

// Chaîne du Schéma : `chaine` (chaineAffichee de Canvas, ou null), `evaluation` (Data), `variante` (câblage retenu),
// `distanceM` (régie–mur, Schéma), `reseau` (réseau Brompton de Data). Renvoie `amont` (nœuds et liens entre eux),
// `aval` (un élément par processeur, un seul au-delà de PROCESSEURS_CADRES_MAX), `provenance` (signal de chaque port
// principal, pour le guide) et `texte` (lignes du texte copié).
export function chaineSchema({ chaine = null, evaluation, variante = null, distanceM = null, reseau = null } = {}) {
  if (!evaluation?.processeur) return null;
  const haut = amont(chaine, evaluation);
  const { elements: bas, provenance } = aval(evaluation, variante, { distanceM, reseau });
  const { texte, ...amontSeul } = haut;
  return { amont: amontSeul, aval: bas, provenance, texte: [texte, ...bas.flatMap((e) => [e.texte, e.texteSecours].filter(Boolean))] };
}
