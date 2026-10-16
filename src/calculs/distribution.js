// Calculs du mur LED, module 7, distribution électrique (étape 12a) : d'où part chaque ligne déjà calculée, armoire
// ou boîtier 32 A tri, et les câbles qui vont avec. Indicatif : à valider avec l'électricien.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
// La distribution ne change ni la phase ni les dalles d'une ligne.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie, COINS } from './commun.js';
import { MARGE_MOU_DEFAUT } from './cablage.js';

// Armoire à plus de 10 m du mur : boîtiers 32 A tri posés près du mur ; à 10 m au plus, ou non saisie : lignes directes.
export const SEUIL_BOITIERS_M = 10;
// Boîtier 32 A tri (type Dynatec RH32) : 6 prises 16 A, 2 par phase ; 3 prises : 1 par phase.
export const PRISES_BOITIER_DEFAUT = 6;
export const PRISES_BOITIER = [6, 3];
const PRISE_BOITIER_A = 16;

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
// Champ facultatif : vide = pas de limite (matériel supposé suffisant).
const nonPrecise = (x) => x === null || x === undefined || x === '';

// Chaque ligne, dans l'ordre du câblage, va au premier boîtier qui a encore une prise libre de sa phase ; un boîtier
// n'est ouvert que si aucun ne convient, `nbMax` au plus. Le nombre de boîtiers est donc le plus grand des
// « lignes d'une phase ÷ prises par phase » arrondis au-dessus (lignes ÷ 6 n'est jamais plus grand).
function placer(lignes, nbMax, parPhase) {
  const boites = [];
  const reste = [];
  for (const ligne of lignes) {
    let b = boites.find((x) => x.filter((l) => l.phase === ligne.phase).length < parPhase);
    if (!b && boites.length < nbMax) {
      b = [];
      boites.push(b);
    }
    if (b) b.push(ligne);
    else reste.push(ligne);
  }
  return { boites, reste };
}

function verifierEntier(valeur, libelle) {
  if (!nonPrecise(valeur) && !(Number.isInteger(valeur) && valeur >= 0)) throw new ErreurSaisie(`${libelle} : un nombre entier, 0 ou plus.`);
}

// Distribution des lignes d'une variante du câblage élec (`cablageElec`), dans l'ordre du câblage.
// `elec` : résultat de electricite() (arrivée, départs). Options : depart (coin), distanceArmoireM (facultatif),
// margeMou (0,10), mode ('accroche' ou 'stack', pose des boîtiers), choix ('conseil' ou 'materiel'),
// materiel { prises16, sortiesP17, boitiers, prisesParBoitier }, chaque champ facultatif.
export function distributionElec(m, variante, elec, {
  depart = elec.reglages.depart ?? 'haut-gauche', distanceArmoireM = null, margeMou = MARGE_MOU_DEFAUT,
  mode = 'accroche', choix = 'conseil', materiel = {},
} = {}) {
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(margeMou >= 0)) throw new ErreurSaisie('La marge de mou est positive ou nulle.');
  if (distanceArmoireM !== null && !(distanceArmoireM >= 0)) throw new ErreurSaisie('La distance armoire–mur est positive ou nulle.');
  if (!['conseil', 'materiel'].includes(choix)) throw new ErreurSaisie('Choisis « Conseil » ou « Avec mon matériel ».');
  const avecMateriel = choix === 'materiel';
  const mat = avecMateriel ? materiel ?? {} : {};
  verifierEntier(mat.prises16, 'Prises 16 A libres sur l\'armoire');
  verifierEntier(mat.sortiesP17, 'Sorties P17 32 A tri libres sur l\'armoire');
  verifierEntier(mat.boitiers, 'Boîtiers 32 A tri disponibles');
  if (!nonPrecise(mat.prisesParBoitier) && !PRISES_BOITIER.includes(mat.prisesParBoitier)) throw new ErreurSaisie('Prises 16 A par boîtier : 6 (2 par phase) ou 3 (1 par phase).');

  const mono = elec.reglages.arrivee.type === 'mono';
  const departA = elec.reglages.departA;
  const loin = distanceArmoireM !== null && distanceArmoireM > SEUIL_BOITIERS_M + EPS;
  // Prises des boîtiers en 16 A : pas de boîtier tri en monophasé, ni avec des départs réglés au-delà de 16 A.
  const boitiersPossibles = !mono && departA <= PRISE_BOITIER_A + EPS;
  const limite = (x) => (nonPrecise(x) ? Infinity : x);
  const prises16 = limite(mat.prises16);
  const maxBoitiers = boitiersPossibles ? Math.min(limite(mat.sortiesP17), limite(mat.boitiers)) : 0;
  const parPhase = (nonPrecise(mat.prisesParBoitier) ? PRISES_BOITIER_DEFAUT : mat.prisesParBoitier) / 3;
  const lignes = variante.lignesDetail;

  // Armoire loin : boîtiers d'abord, les lignes en trop en direct. Armoire près : en direct tant qu'il y a des prises
  // 16 A, les lignes en trop sur des boîtiers (choix de conception du projet). En conseil, rien ne limite.
  const repartition = (nbMax) => {
    if (loin) {
      const { boites, reste } = placer(lignes, nbMax, parPhase);
      return { boites, directes: reste.slice(0, prises16), nonPlacees: reste.slice(prises16) };
    }
    const directes = lignes.slice(0, prises16);
    const { boites, reste } = placer(lignes.slice(directes.length), nbMax, parPhase);
    return { boites, directes, nonPlacees: reste };
  };
  const { boites, directes, nonPlacees } = repartition(maxBoitiers);

  // Géométrie : coin de départ, boîtier sur le bord de départ au milieu des têtes de ses lignes (sur le côté de départ
  // pour un câblage par rangées). Longueurs en mètres, mou compris.
  const x0 = depart.endsWith('gauche') ? 0 : m.largeurMm;
  const y0 = depart.startsWith('haut') ? 0 : m.hauteurMm;
  const mou = 1 + margeMou;
  const ecart = (a, b) => (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 1000;
  const coin = { x: x0, y: y0 };
  const milieu = (valeurs) => (Math.min(...valeurs) + Math.max(...valeurs)) / 2;
  const boitiers = boites.map((b, i) => {
    const positionMm = variante.orientation === 'rangees'
      ? { x: x0, y: milieu(b.map((l) => l.teteMm.y)) }
      : { x: milieu(b.map((l) => l.teteMm.x)), y: y0 };
    return {
      numero: i + 1,
      nom: `B${i + 1}`,
      positionMm,
      lignes: b.map((l) => ({ numero: l.numero, phase: l.phase, prise: `L${l.phase}` })),
      p17M: distanceArmoireM === null ? null : (distanceArmoireM + ecart(coin, positionMm)) * mou,
    };
  });
  const boitierDe = new Map(boitiers.flatMap((b) => b.lignes.map((l) => [l.numero, b])));
  const enDirect = new Set(directes.map((l) => l.numero));
  const detail = lignes.map((l) => {
    const b = boitierDe.get(l.numero);
    if (b) return { numero: l.numero, phase: l.phase, depuis: b.nom, boitier: b.numero, prise: `L${l.phase}`, longueurTeteM: ecart(b.positionMm, l.teteMm) * mou };
    if (enDirect.has(l.numero)) {
      return {
        numero: l.numero, phase: l.phase, depuis: 'armoire', boitier: null, prise: mono ? null : `L${l.phase}`,
        longueurTeteM: distanceArmoireM === null ? null : (distanceArmoireM + ecart(coin, l.teteMm)) * mou,
      };
    }
    return { numero: l.numero, phase: l.phase, depuis: null, boitier: null, prise: null, longueurTeteM: null };
  });
  const recap = (longueurs) => ({
    nombre: longueurs.length,
    longueursM: longueurs,
    totalM: longueurs.some((x) => x === null) ? null : longueurs.reduce((s, x) => s + x, 0),
    maxM: longueurs.some((x) => x === null) || !longueurs.length ? null : Math.max(...longueurs),
  });

  // Notes : lignes directes depuis une armoire loin, puis le matériel non précisé dont le résultat dépend.
  const notes = [];
  const d = loin ? nombreCourt(distanceArmoireM) : null;
  if (loin && directes.length) {
    if (mono) {
      notes.push(`Arrivée monophasée : pas de boîtier 32 A tri, lignes en direct sur l'armoire à ${d} m. Câbles de tête longs : prévois des rallonges ${nombreCourt(departA)} A.`);
    } else if (!boitiersPossibles) {
      notes.push(`Départs réglés à ${nombreCourt(departA)} A : les prises des boîtiers 32 A tri sont en 16 A, lignes en direct sur l'armoire à ${d} m. `
        + `Câbles de tête longs : prévois des rallonges ${nombreCourt(departA)} A.`);
    } else {
      notes.push(`Armoire à ${d} m : ${pluriel(directes.length, 'ligne', 'lignes')} en direct, câbles de tête longs ; prévois des rallonges 16 A.`);
    }
  }
  if (avecMateriel) {
    if (directes.length && nonPrecise(mat.prises16)) notes.push('Prises 16 A de l\'armoire : non précisées, supposées suffisantes.');
    if (boitiers.length && nonPrecise(mat.sortiesP17)) notes.push('Sorties P17 32 A tri de l\'armoire : non précisées, supposées suffisantes.');
    if (boitiers.length && nonPrecise(mat.boitiers)) notes.push('Boîtiers 32 A tri : non précisés, supposés suffisants.');
    if (boitiers.length && nonPrecise(mat.prisesParBoitier)) notes.push('Prises 16 A par boîtier : non précisées, 6 (2 par phase).');
  }

  // Matériel insuffisant : ce qui manque. Les boîtiers en plus qu'il faudrait (avec leurs sorties P17), ou autant de
  // prises sur l'armoire que de lignes sans prise.
  let refus = null;
  let manque = null;
  if (nonPlacees.length) {
    const x = nonPlacees.length;
    const prises = (a) => pluriel(x, `prise ${a} A`, `prises ${a} A`);
    if (boitiersPossibles) {
      let besoin = maxBoitiers + 1;
      while (repartition(besoin).nonPlacees.length) besoin += 1;
      const boitiersEnPlus = nonPrecise(mat.boitiers) ? 0 : Math.max(0, besoin - mat.boitiers);
      const sortiesEnPlus = nonPrecise(mat.sortiesP17) ? 0 : Math.max(0, besoin - mat.sortiesP17);
      const ajouts = [
        boitiersEnPlus ? pluriel(boitiersEnPlus, 'boîtier 32 A tri', 'boîtiers 32 A tri') : null,
        sortiesEnPlus ? `${pluriel(sortiesEnPlus, 'sortie P17 32 A tri', 'sorties P17 32 A tri')} sur l'armoire` : null,
      ].filter(Boolean).join(' et ');
      refus = `Il manque ${prises(16)} : ajoute ${ajouts}, ou ${prises(16)} sur l'armoire.`;
      manque = { prises16: x, boitiers: boitiersEnPlus, sortiesP17: sortiesEnPlus };
    } else {
      const raison = mono ? 'arrivée monophasée : pas de boîtier 32 A tri'
        : `départs réglés à ${nombreCourt(departA)} A : les prises des boîtiers 32 A tri sont en 16 A`;
      refus = `Il manque ${prises(nombreCourt(departA))} sur l'armoire (${raison}).`;
      manque = { prises16: x, boitiers: 0, sortiesP17: 0 };
    }
  }

  return {
    choix,
    distanceArmoireM,
    loin,
    mono,
    departA,
    pose: mode === 'stack' ? 'au sol derrière le mur' : 'sur le pont',
    type: !boitiers.length ? 'directe' : (directes.length ? 'mixte' : 'boitiers'),
    boitiers,
    lignes: detail,
    // Ce que l'armoire doit fournir : une sortie P17 32 A tri par boîtier, une prise 16 A par ligne directe.
    armoire: { sortiesP17: boitiers.length, prises16: directes.length },
    cables: {
      p17: recap(boitiers.map((b) => b.p17M)),
      tete: recap(detail.filter((l) => l.depuis).map((l) => l.longueurTeteM)),
    },
    notes,
    refus,
    manque,
  };
}
