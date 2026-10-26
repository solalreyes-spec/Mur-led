// Calculs du mur LED, plusieurs arrivées électriques pour un mur (étape 21a).
// Indicatif : à valider avec l'électricien.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
// Les lignes viennent du câblage élec (variante retenue) ; la répartition dit sur quelle arrivée et quelle phase part
// chaque ligne, sans changer ses dalles ni sa puissance.
import { nombre, nombreCourt } from '../format.js';
import { EPS, ErreurSaisie } from './commun.js';
import { arrondiW } from './elec.js';

// Boîtier 32 A tri (type Dynatec RH32) : prises 16 A ; une arrivée en direct sur un boîtier n'est permise qu'en 32 A tri.
const PRISE_BOITIER_A = 16;
const INTENSITE_BOITIER_A = 32;
const PRISES_BOITIER_DEFAUT = 6;
// Une prise 16 A porte au plus 230 V × 16 A : au-delà, une puissance utile saisie ne passe pas sur un boîtier.
const MAX_PRISE_W = 230 * PRISE_BOITIER_A;

export const RAPPEL_ARRIVEES = 'Plusieurs arrivées : chaque ligne reste sur son arrivée, jamais de liaison power entre deux lignes d\'arrivées '
  + 'différentes. Repère chaque boîtier et chaque câble de tête avec son arrivée (A1, A2). Pour intervenir sur le mur, coupe toutes les '
  + 'arrivées : en couper une laisse le reste sous tension. Les cadres des dalles et les câbles data relient les masses des sources : '
  + 'liaison équipotentielle entre les terres, différentiels et régimes de neutre (groupe et secteur) à faire vérifier par l\'électricien '
  + 'avant de brancher.';

const vide = (x) => x === null || x === undefined || x === '';

// Liste des arrivées d'un mur : repères A1, A2… dans l'ordre, identifiant stable (`arr-<numéro>` s'il n'est pas donné),
// libellé. Une saisie illisible est refusée en nommant l'arrivée ; une arrivée en boîtier que les départs (ou la
// puissance utile saisie) ne permettent pas reste dans la liste avec son refus, et la répartition l'écarte.
export function lireArrivees(liste, { departA = PRISE_BOITIER_A, puissanceUtileW = null } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) throw new ErreurSaisie('Indique au moins une arrivée.');
  return liste.map((a, i) => {
    const numero = i + 1;
    const nom = `Arrivée ${numero}`;
    if (!['mono', 'tri'].includes(a.type)) throw new ErreurSaisie(`${nom} : mono ou tri.`);
    if (!(a.intensiteA > 0)) throw new ErreurSaisie(`${nom} : indique son intensité, en ampères.`);
    const branchement = a.branchement ?? 'armoire';
    if (!['armoire', 'boitier'].includes(branchement)) throw new ErreurSaisie(`${nom} : armoire ou boîtier.`);
    if (branchement === 'boitier' && !(a.type === 'tri' && Math.abs(a.intensiteA - INTENSITE_BOITIER_A) < EPS)) {
      throw new ErreurSaisie(`${nom} : en direct sur un boîtier, seulement pour une 32 A tri.`);
    }
    const distanceM = vide(a.distanceM) ? null : a.distanceM;
    if (distanceM !== null && !(distanceM >= 0)) throw new ErreurSaisie(`${nom} : la distance au mur est positive ou nulle.`);
    const materiel = { prises16: a.materiel?.prises16 ?? null, sortiesP17: a.materiel?.sortiesP17 ?? null };
    for (const [cle, libelle] of [['prises16', 'prises 16 A libres sur l\'armoire'], ['sortiesP17', 'sorties P17 32 A tri libres sur l\'armoire']]) {
      if (!vide(materiel[cle]) && !(Number.isInteger(materiel[cle]) && materiel[cle] >= 0)) throw new ErreurSaisie(`${nom} : ${libelle}, un nombre entier, 0 ou plus.`);
      if (vide(materiel[cle])) materiel[cle] = null;
    }
    let refus = null;
    if (branchement === 'boitier' && departA > PRISE_BOITIER_A + EPS) {
      refus = `${nom} : départs réglés à ${nombreCourt(departA)} A, les prises d'un boîtier 32 A tri sont en 16 A. Branche-la sur une armoire.`;
    } else if (branchement === 'boitier' && puissanceUtileW > MAX_PRISE_W + EPS) {
      refus = `${nom} : puissance utile par ligne de ${nombre(puissanceUtileW)} W, au-delà d'une prise 16 A (${nombre(MAX_PRISE_W)} W). Branche-la sur une armoire.`;
    }
    return {
      id: a.id ?? `arr-${numero}`,
      numero,
      repere: `A${numero}`,
      type: a.type,
      intensiteA: a.intensiteA,
      branchement,
      distanceM,
      materiel,
      libelle: `${nom} : ${nombreCourt(a.intensiteA)} A ${a.type}, ${branchement === 'boitier' ? 'en direct sur un boîtier' : 'armoire'}`,
      refus,
    };
  });
}

// Arrivée qui sert au calcul des lignes (spec § 3) : tri dès qu'une arrivée est tri (la plus forte), sinon la plus forte mono.
export function arriveeDeCalcul(arrivees) {
  const tri = arrivees.filter((a) => a.type === 'tri');
  const parmi = tri.length ? tri : arrivees;
  return { type: tri.length ? 'tri' : 'mono', intensiteA: Math.max(...parmi.map((a) => a.intensiteA)) };
}

// Alertes de capacité d'une seule arrivée (electricite, cablageElec), fausses avec plusieurs arrivées (spec § 4.5).
const ALERTES_ARRIVEE = /^(L'arrivée mono|Arrivée tri|Une phase dépasse les)/;
export const sansAlertesArrivee = (alertes) => (alertes ?? []).filter((a) => !ALERTES_ARRIVEE.test(a));

// « 1 à 12 et 14 » : numéros groupés en suites.
export function texteNumeros(numeros) {
  const tries = [...numeros].sort((a, b) => a - b);
  const suites = [];
  for (const n of tries) {
    const s = suites.at(-1);
    if (s && n === s[1] + 1) s[1] = n;
    else suites.push([n, n]);
  }
  const morceaux = suites.flatMap(([a, b]) => (a === b ? [`${a}`] : b === a + 1 ? [`${a}`, `${b}`] : [`${a} à ${b}`]));
  return morceaux.length > 1 ? `${morceaux.slice(0, -1).join(', ')} et ${morceaux.at(-1)}` : morceaux[0] ?? '';
}
const lignesNommees = (numeros) => `${numeros.length > 1 ? 'lignes' : 'ligne'} ${texteNumeros(numeros)}`;

// Capacités d'une arrivée : par phase (tri) ou en tout (mono), prises par phase pour un boîtier, capacité de rangement
// pour le classement (un boîtier ne range pas plus de lignes qu'il n'a de prises).
function capacites(a, { tensionV, marge, utileLigneW, prisesParBoitier }) {
  const capaciteW = arrondiW(tensionV * a.intensiteA * marge);
  const nbPhases = a.type === 'tri' ? 3 : 1;
  const prisesParPhase = a.branchement === 'boitier' ? prisesParBoitier / 3 : Infinity;
  const rangementW = Math.min(nbPhases * capaciteW, a.branchement === 'boitier' ? prisesParBoitier * utileLigneW : Infinity);
  return { capaciteW, nbPhases, prisesParPhase, rangementW };
}

// Phases d'une arrivée remplies par un ensemble de lignes : les plus chargées d'abord (ordre du câblage à égalité), chacune
// sur la phase la moins chargée qui a la place et une prise libre (à égalité, la plus petite). `forcees` : lignes choisies
// à la main, placées quand même (sur la phase la moins chargée qui a une prise libre) si aucune phase n'a la place.
function remplir(cap, lignes, forcees = new Set()) {
  const phases = Array.from({ length: cap.nbPhases }, (_, i) => ({ numero: cap.nbPhases === 1 ? null : i + 1, puissanceW: 0, lignes: [] }));
  const ordre = [...lignes].sort((a, b) => b.puissanceW - a.puissanceW || a.numero - b.numero);
  const placees = new Map();
  const sansPlace = [];
  for (const l of ordre) {
    const libres = phases.filter((p) => p.lignes.length < cap.prisesParPhase);
    const moins = (liste) => liste.reduce((a, b) => (b.puissanceW < a.puissanceW - EPS ? b : a), liste[0]);
    const tient = libres.filter((p) => p.puissanceW + l.puissanceW <= cap.capaciteW + EPS);
    const p = tient.length ? moins(tient) : (forcees.has(l.numero) && libres.length ? moins(libres) : null);
    if (!p) {
      sansPlace.push(l);
      continue;
    }
    p.puissanceW = arrondiW(p.puissanceW + l.puissanceW);
    p.lignes.push(l.numero);
    placees.set(l.numero, p.numero);
  }
  return { phases, placees, sansPlace };
}
const tientDans = (cap, lignes) => remplir(cap, lignes).sansPlace.length === 0;

// Répartition des lignes d'une variante du câblage élec entre les arrivées (spec § 4.2). Rend une copie de la variante :
// chaque ligne avec son arrivée (`arrivee`, `repere`), sa phase dans cette arrivée (null en mono), `placee` et `manuel` ;
// `parArrivee` (phases et lignes de chaque arrivée), `alertes`, `notes`, `refus`, `nonPlacees`, `ok`. Une seule arrivée
// en armoire : la variante elle-même. `manuel` : { première dalle de la ligne : id d'arrivée }, seulement si `retenue`.
export function repartirArrivees(variante, elec, arrivees, { manuel = {}, retenue = true, prisesParBoitier = PRISES_BOITIER_DEFAUT } = {}) {
  if (!arrivees || (arrivees.length === 1 && arrivees[0].branchement === 'armoire')) return variante;
  const { tensionV = 220, marge = 0.8 } = elec.reglages;
  const reglages = { tensionV, marge, utileLigneW: elec.ligne.utileW, prisesParBoitier };
  const utilisables = arrivees.filter((a) => !a.refus);
  const cap = new Map(utilisables.map((a) => [a.id, capacites(a, reglages)]));
  // Classement : la plus grande capacité de rangement d'abord ; à égalité, l'ordre de la liste.
  const classement = [...utilisables].sort((a, b) => cap.get(b.id).rangementW - cap.get(a.id).rangementW || a.numero - b.numero);
  const lignes = variante.lignesDetail;
  const notes = [];
  const refus = arrivees.filter((a) => a.refus).map((a) => a.refus);

  // Choix à la main : la ligne qui part de cette dalle, sur cette arrivée.
  const choix = new Map();
  const saisis = Object.entries(manuel ?? {});
  if (saisis.length && !retenue) notes.push('Choix à la main : seulement sur la variante retenue dans Élec.');
  if (retenue) {
    for (const [dalle, id] of saisis) {
      const ligne = lignes.find((l) => l.dalles[0] === dalle);
      if (!ligne) notes.push(`Choix à la main oublié : la ligne qui partait de ${dalle} n'existe plus.`);
      else if (!cap.has(id)) notes.push(`Choix à la main oublié : l'arrivée choisie pour la ligne qui partait de ${dalle} n'existe plus.`);
      else choix.set(ligne.numero, id);
    }
  }
  const forcees = new Set(choix.keys());
  const membres = new Map(utilisables.map((a) => [a.id, lignes.filter((l) => choix.get(l.numero) === a.id)]));
  const libres = lignes.filter((l) => !choix.has(l.numero));
  let placement = null;

  // 2. Tout tient sur l'arrivée en tête, avec les phases de la variante (aucun choix à la main ailleurs).
  const tete = classement[0];
  if (tete && [...choix.values()].every((id) => id === tete.id)) {
    const c = cap.get(tete.id);
    const mono = c.nbPhases === 1;
    const variantePhases = lignes.every((l) => [1, 2, 3].includes(l.phase));
    if (mono || variantePhases) {
      const phases = Array.from({ length: c.nbPhases }, (_, i) => ({ numero: mono ? null : i + 1, puissanceW: 0, lignes: [] }));
      for (const l of lignes) {
        const p = mono ? phases[0] : phases[l.phase - 1];
        p.puissanceW = arrondiW(p.puissanceW + l.puissanceW);
        p.lignes.push(l.numero);
      }
      if (phases.every((p) => p.puissanceW <= c.capaciteW + EPS && p.lignes.length <= c.prisesParPhase)) {
        placement = new Map(utilisables.map((a) => [a.id, a === tete
          ? { phases, placees: new Map(lignes.map((l) => [l.numero, mono ? null : l.phase])), sansPlace: [] }
          : remplir(cap.get(a.id), [])]));
      }
    }
  }

  // 3. Conseil : les arrivées du classement remplies tour à tour dans l'ordre du câblage, sans retour en arrière.
  let restantes = [];
  if (!placement) {
    const groupes = new Map(utilisables.map((a) => [a.id, [...membres.get(a.id)]]));
    let k = 0;
    for (const l of libres) {
      while (k < classement.length && !tientDans(cap.get(classement[k].id), [...groupes.get(classement[k].id), l])) k += 1;
      if (k < classement.length) groupes.get(classement[k].id).push(l);
      else restantes.push(l);
    }
    // 4. Second essai au mieux : les plus chargées d'abord, chacune sur la première arrivée du classement où elle tient.
    if (restantes.length) {
      for (const a of utilisables) groupes.set(a.id, [...membres.get(a.id)]);
      restantes = [];
      for (const l of [...libres].sort((a, b) => b.puissanceW - a.puissanceW || a.numero - b.numero)) {
        const a = classement.find((x) => tientDans(cap.get(x.id), [...groupes.get(x.id), l]));
        if (a) groupes.get(a.id).push(l);
        else restantes.push(l);
      }
      notes.push('Répartition au mieux : les lignes voisines ne sont pas toutes sur la même arrivée.');
    }
    placement = new Map(utilisables.map((a) => [a.id, remplir(cap.get(a.id), groupes.get(a.id), forcees)]));
  }

  // Résultat par arrivée ; débordements des lignes choisies à la main.
  const alertes = [];
  const arriveeDe = new Map();
  const nonPlacees = new Set(restantes.map((l) => l.numero));
  const parArrivee = arrivees.map((a) => {
    const c = cap.get(a.id) ?? capacites(a, reglages);
    const pl = placement.get(a.id) ?? { phases: [], placees: new Map(), sansPlace: [] };
    for (const [numero, phase] of pl.placees) arriveeDe.set(numero, { a, phase });
    if (pl.sansPlace.length && a.branchement === 'boitier') {
      for (const l of pl.sansPlace) nonPlacees.add(l.numero);
      const p = pl.phases.reduce((x, y) => (y.puissanceW < x.puissanceW - EPS ? y : x), pl.phases[0]);
      refus.push(`${a.libelle.split(' :')[0]} (boîtier) : ${p.lignes.length + pl.sansPlace.length} lignes sur L${p.numero} pour ${c.prisesParPhase} prises.`);
    }
    const phases = pl.phases.map((p) => ({
      numero: p.numero, lignes: p.lignes.length, puissanceW: p.puissanceW, intensiteA: p.puissanceW / tensionV,
      ...(a.branchement === 'boitier' ? { prisesLibres: c.prisesParPhase - p.lignes.length } : {}),
    }));
    for (const p of phases) {
      if (p.puissanceW > c.capaciteW + EPS) {
        alertes.push(`${a.libelle.split(' :')[0]}${p.numero ? `, phase L${p.numero}` : ''} : ${nombre(p.puissanceW)} W pour ${nombre(c.capaciteW)} W utiles, dépasse.`);
      }
    }
    const charges = phases.map((p) => p.puissanceW);
    const max = charges.length ? Math.max(...charges) : 0;
    const ecartW = phases.length > 1 ? arrondiW(max - Math.min(...charges)) : 0;
    return {
      id: a.id, numero: a.numero, repere: a.repere, libelle: a.libelle, type: a.type, intensiteA: a.intensiteA, branchement: a.branchement,
      distanceM: a.distanceM, refus: a.refus, capaciteW: c.capaciteW,
      phases,
      lignes: [...pl.placees.keys()].sort((x, y) => x - y),
      puissanceW: arrondiW(charges.reduce((s, w) => s + w, 0)),
      ecartW,
      ecartPourcent: phases.length > 1 && max > 0 ? (100 * ecartW) / max : 0,
      ok: phases.every((p) => p.puissanceW <= c.capaciteW + EPS),
    };
  });
  for (const a of parArrivee) {
    if (!a.refus && a.lignes.length === 0) notes.push(`${a.libelle.split(' :')[0]} : aucune ligne, pas besoin de la tirer.`);
  }
  if (restantes.length) {
    const capas = classement.map((a) => `${a.repere} : ${nombre(cap.get(a.id).capaciteW)} W${cap.get(a.id).nbPhases === 3 ? ' par phase' : ''}`).join(', ');
    refus.push(`Les arrivées ne suffisent pas : ${lignesNommees(restantes.map((l) => l.numero))} sans place (${capas}). `
      + 'Ajoute une arrivée ou une plus forte, ou déplace une ligne à la main.');
  }
  const lignesDetail = lignes.map((l) => {
    const x = arriveeDe.get(l.numero);
    return { ...l, arrivee: x?.a.id ?? null, repere: x?.a.repere ?? null, phase: x ? x.phase : null, placee: Boolean(x), manuel: choix.has(l.numero) };
  });
  // Phases du mur (L1, L2, L3 toutes arrivées tri confondues), pour l'aval qui lit encore `phases`.
  const phasesMur = [1, 2, 3].map((numero) => {
    const w = arrondiW(lignesDetail.filter((l) => l.phase === numero).reduce((s, l) => s + l.puissanceW, 0));
    return { numero, lignes: lignesDetail.filter((l) => l.phase === numero).length, puissanceW: w, intensiteA: w / tensionV };
  });
  return {
    ...variante,
    lignesDetail,
    phases: phasesMur,
    ecartPhasesPourcent: null,
    parArrivee,
    nonPlacees: [...nonPlacees].sort((a, b) => a - b),
    notes,
    refus,
    alertes: [...sansAlertesArrivee(variante.alertes), ...alertes],
    ok: parArrivee.every((a) => a.ok) && nonPlacees.size === 0,
  };
}
