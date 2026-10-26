// Onglet Élec : lignes, phases, arrivée, courant d'appel. Résultats indicatifs, à valider par l'électricien.
// Aucune règle de calcul ici : tout passe par calculs.js.

import { electricite, cablageElec, distributionElec, ARRIVEES, LIBELLES_COIN, MARGE_MOU_DEFAUT, ErreurSaisie,
  lireArrivees, arriveeDeCalcul, repartirArrivees, sansAlertesArrivee, RAPPEL_ARRIVEES } from './calculs.js';
import { nombre, nombreCourt, lireNombre, sourceCourte, mentionType } from './format.js';
import { el, remplacer } from './dom.js';
import { barreCharge } from './look.js';
import { alertesSansManques, ligneManques } from './manques.js';
import { resumeElec, lignesParZone, lignesDistribution, texteLongueurCable } from './resumes.js';
import { carteSaisieArrivee, sectionArrivees, versArrivee, nouvelleSaisieArrivee } from './ecran-arrivees.js';

const formulaire = document.getElementById('form-elec');
const zone = document.getElementById('resultats-elec');
// Distribution (étape 12b) : son formulaire, gardé avec le mur, ses résultats ; puis courant d'appel et rappels.
const formDistribution = document.getElementById('form-distribution');
const zoneDistribution = document.getElementById('resultats-distribution');
const zoneSuite = document.getElementById('resultats-elec-suite');
// Plusieurs arrivées (étape 21b) : cartes des arrivées ajoutées, gardées dans le champ caché `autresArrivees` ; arrivée
// choisie à la main pour des lignes dans `arriveesLignes` ({ première dalle : id d'arrivée }).
const zoneArrivees = document.getElementById('autres-arrivees');

let etatMur = null;
let typeAffiche = null;
// Coin de départ du câblage élec, choisi dans l'onglet Schéma ; le résultat est publié pour ce même onglet.
let departElec = 'haut-gauche';
// Marge de mou (réglage du Schéma) et montage (onglet Poids : accroche ou stack), pour les câbles et la pose des boîtiers.
let margeMou = MARGE_MOU_DEFAUT;
let modeMur = 'accroche';
let publier = () => {};

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const watts = (w) => `${nombreCourt(w, 1)} W`;
const kw = (w) => `${nombreCourt(w / 1000, 2)} kW`;

function tuile(titre, valeur, ...details) {
  return el('div', { class: 'tuile' },
    el('dt', {}, titre),
    el('dd', {}, el('span', { class: 'tuile-valeur' }, valeur),
      details.filter(Boolean).map((d) => el('span', { class: 'tuile-detail' }, d))));
}

// Intensités proposées selon le type d'arrivée, plus une valeur libre.
function preparerArrivee(type) {
  const select = formulaire.elements.arriveeA;
  remplacer(select,
    ARRIVEES[type].map((a) => el('option', { value: String(a), selected: a === 32 ? '' : null }, `${a} A ${type}`)),
    el('option', { value: 'libre' }, 'Autre valeur…'));
  typeAffiche = type;
}

function lireFormulaire() {
  const d = new FormData(formulaire);
  const type = d.get('typeArrivee');
  const choix = d.get('arriveeA');
  const puissance = lireNombre(d.get('puissanceUtileW'));
  return {
    type,
    arriveeLibre: choix === 'libre',
    // Arrivée 1 en direct sur un boîtier : seulement en 32 A tri de la liste (étape 21).
    tri32: type === 'tri' && choix === '32',
    branchement1: type === 'tri' && choix === '32' && d.get('branchement1') === 'boitier' ? 'boitier' : 'armoire',
    reglages: {
      tensionV: lireNombre(d.get('tensionV')),
      marge: Number(d.get('marge')),
      puissanceUtileW: Number.isFinite(puissance) ? puissance : null,
      departA: lireNombre(d.get('departA')),
      arrivee: { type, intensiteA: choix === 'libre' ? lireNombre(d.get('arriveeLibre')) : Number(choix) },
      courbe: d.get('courbe') || null,
      depart: departElec,
    },
    // Config imposée (étape 18c) : nombre de lignes (vide : le conseil ; illisible : refusé par le calcul).
    imposee: { lignes: String(d.get('lignesImposees') ?? '').trim() === '' ? null : lireNombre(d.get('lignesImposees')) },
  };
}

// Saisies de la distribution : champ vide = non saisi (null) ; une saisie illisible reste NaN, refusée par le calcul.
function lireDistribution() {
  const d = new FormData(formDistribution);
  const champ = (nom) => (String(d.get(nom) ?? '').trim() === '' ? null : lireNombre(d.get(nom)));
  const choix = d.get('choixDistribution') === 'materiel' ? 'materiel' : 'conseil';
  return {
    distanceArmoireM: champ('distanceArmoireM'),
    choix,
    materiel: {
      prises16: champ('prises16'),
      sortiesP17: champ('sortiesP17'),
      boitiers: champ('boitiers'),
      prisesParBoitier: d.get('prisesParBoitier') ? Number(d.get('prisesParBoitier')) : null,
    },
  };
}

// Champs cachés des arrivées : JSON illisible ou absent, rien (la saisie d'avant l'étape 21 n'a qu'une arrivée).
function lireJson(nom, defaut) {
  try {
    return JSON.parse(formulaire.elements[nom].value || 'null') ?? defaut;
  } catch (erreur) {
    return defaut;
  }
}
const saisiesArrivees = () => {
  const x = lireJson('autresArrivees', []);
  return Array.isArray(x) ? x.filter((a) => a && typeof a === 'object' && typeof a.id === 'string') : [];
};
const choixLignes = () => {
  const x = lireJson('arriveesLignes', {});
  return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
};
// Écrit un champ caché et le signale au formulaire (sauvegarde et recalcul, comme une saisie).
function garder(nom, valeur) {
  formulaire.elements[nom].value = valeur === null ? '' : JSON.stringify(valeur);
  formulaire.dispatchEvent(new Event('change'));
}
let redessinerArrivees = true;
function dessinerArrivees() {
  const saisies = saisiesArrivees();
  const choixMateriel = lireDistribution().choix === 'materiel';
  remplacer(zoneArrivees, saisies.map((saisie, i) => carteSaisieArrivee(saisie, {
    numero: i + 2,
    choixMateriel,
    // Une frappe garde la saisie sans redessiner (le champ garde le clavier) ; type, intensité et branchement redessinent.
    surChange: (nouvelle, { redessiner = false } = {}) => {
      formulaire.elements.autresArrivees.value = JSON.stringify(saisiesArrivees().map((x) => (x.id === nouvelle.id ? nouvelle : x)));
      redessinerArrivees = redessiner;
    },
    surRetirer: () => {
      const reste = saisiesArrivees().filter((x) => x.id !== saisie.id);
      redessinerArrivees = true;
      garder('autresArrivees', reste.length ? reste : null);
    },
  })));
}

function textePMax(fiche, p) {
  if (p.origine === 'surface') return `${watts(p.valeurW)} estimés (1 kVA/m²)`;
  if (p.origine === 'gabarit') return `${watts(p.valeurW)} estimés (gabarit non sourcé)`;
  const s = fiche.sources?.pMaxW;
  return `${watts(p.valeurW)}${s ? ` (${[...s.sources.map(sourceCourte), mentionType(s)].filter(Boolean).join(', ')})` : ''}`;
}

// Colonnes de chaque ligne d'une répartition, pour comparer deux répartitions.
const taillesLignes = (option) => option.lignes.map((l) => l.colonnes).join(' + ');

function tablePhases(option, capaciteW, titre, conseil) {
  if (!option) return null;
  const lignes = option.phases.map((p) => el('tr', { class: p.puissanceW > capaciteW ? 'limite' : null },
    el('th', { scope: 'row' }, `L${p.numero}`),
    el('td', { class: 'nombre' }, nombre(p.lignes)),
    el('td', {}, watts(p.puissanceW)),
    el('td', {}, `${nombreCourt(p.intensiteA, 1)} A`),
    el('td', { class: p.puissanceW > capaciteW ? 'ko' : 'ok' }, p.puissanceW > capaciteW ? '✗' : '✓'),
    // Barre de charge de la phase, sur sa capacité utile (au-delà : refusée, comme le ✗).
    el('td', { class: 'cellule-barre' }, barreCharge(p.puissanceW / capaciteW))));
  const enColonnes = Boolean(option.lignes[0]?.colonnes);
  const detailLignes = option.lignes.map((l) => (enColonnes ? l.colonnes : l.dalles)).join(' + ');
  return el('div', {},
    el('h4', {}, titre, conseil ? el('span', { class: 'badge badge-reussi' }, 'conseillé') : null),
    el('p', { class: 'source' }, `${pluriel(option.lignes.length, 'ligne', 'lignes')} de ${detailLignes} ${enColonnes ? 'colonnes' : 'dalles'}. `
      + `Écart entre phases : ${watts(option.ecartW)}, soit ${nombreCourt(option.ecartPourcent, 0)} % de la phase la plus chargée.`),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees table-charges' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Phase'), el('th', {}, 'Lignes'), el('th', {}, 'Charge'), el('th', {}, 'Intensité'), el('th', {}, ''), el('th', {}, ''))),
        el('tbody', {}, lignes))));
}

// Phases des lignes imposées (étape 18c), au format des répartitions de l'onglet : colonnes de chaque ligne, écart.
function optionImposee(variante, tensionV) {
  const charges = variante.phases.map((p) => p.puissanceW);
  return {
    phases: variante.phases.map((p) => ({ ...p, intensiteA: p.puissanceW / tensionV })),
    lignes: variante.lignesDetail.map((l) => ({ colonnes: new Set(l.dalles.map((x) => x.split(' ')[0])).size })),
    ecartW: Math.max(...charges) - Math.min(...charges),
    ecartPourcent: variante.ecartPhasesPourcent ?? 0,
  };
}

function sectionArrivee(r, impose = null) {
  const a = r.arrivee;
  if (r.monophase) {
    const mono = r.monophase;
    return el('section', { class: 'bloc-resultats' },
      el('h3', {}, `Arrivée mono ${nombreCourt(a.intensiteA)} A`),
      el('dl', { class: 'tuiles' },
        tuile('Charge totale', watts(mono.puissanceW), `${nombreCourt(mono.intensiteA, 1)} A`),
        tuile('Capacité utile', watts(mono.capaciteW), `maxi théorique à 230 V : ${watts(a.capacite230W)}`),
        tuile('Bilan', mono.ok ? 'passe' : 'ne passe pas')));
  }
  const t = r.triphase;
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Arrivée tri ${nombreCourt(a.intensiteA)} A : ${watts(a.capacitePhaseW)} utiles par phase`),
    el('p', { class: 'source' }, `Maxi théorique à 230 V : ${watts(a.capacite230W)} par phase. Une phase ne prête jamais sa puissance à une autre.`),
    impose ? tablePhases(optionImposee(impose.variante, r.reglages.tensionV), a.capacitePhaseW, 'Ma config (imposée)', false) : null,
    el('h4', {}, 'En colonnes entières'),
    tablePhases(t.colonnes.equilibre, a.capacitePhaseW, 'Équilibre des phases (écart le plus faible)', true),
    taillesLignes(t.colonnes.equilibre) === taillesLignes(t.colonnes.minimum)
      ? el('p', { class: 'source' }, 'Au minimum de lignes : mêmes lignes, même répartition.')
      : tablePhases(t.colonnes.minimum, a.capacitePhaseW, 'Au minimum de lignes', false),
    el('h4', {}, 'Au plus juste (minimum théorique)'),
    t.auPlusJuste.equilibre ? tablePhases(t.auPlusJuste.equilibre, a.capacitePhaseW, 'Équilibre (lignes en multiple de 3)', false)
      : (r.zones ? el('p', { class: 'source' }, 'Équilibre au plus juste (lignes en multiple de 3) : pas encore en mode Zones.') : null),
    tablePhases(t.auPlusJuste.minimum, a.capacitePhaseW, 'Au minimum de lignes', false));
}

// Mur en zones (étape 9a) : lignes retenues zone par zone ; une ligne ne passe jamais d'une zone à l'autre.
function sectionZones(parZone) {
  if (!parZone) return null;
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Lignes par zone'),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Zone'), el('th', {}, 'Dalles'), el('th', {}, 'Puissance'), el('th', {}, 'Lignes'), el('th', {}, 'Ligne la plus chargée'))),
        el('tbody', {}, parZone.map((z) => el('tr', {},
          el('th', { scope: 'row' }, z.nom),
          el('td', {}, nombre(z.dalles)),
          el('td', {}, kw(z.puissanceW)),
          el('td', {}, nombre(z.lignes.length), el('span', { class: 'source-ligne' }, `${z.lignes.map((l) => l.colonnes).join(' + ')} colonnes`)),
          el('td', {}, watts(z.ligneMaxW))))))),
    el('p', { class: 'source' }, 'Une ligne ne passe jamais d\'une zone à l\'autre ; les phases se répartissent sur toutes les lignes du mur.'));
}

function sectionAppel(r, impose = null) {
  const a = impose?.variante.appel ?? r.appel;
  if (!a) {
    return el('p', { class: 'source' }, 'Courant d\'appel non donné par la fiche : allume ligne par ligne et fais vérifier la courbe des disjoncteurs par l\'électricien.');
  }
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Courant d\'appel'),
    el('dl', { class: 'tuiles' },
      tuile(impose ? 'Pic d\'une ligne imposée' : 'Pic d\'une ligne', `${nombreCourt(a.picLigneA, 1)} A`, 'toutes ses dalles allumées en même temps', a.dureeMs ? `pendant ${nombreCourt(a.dureeMs)} ms` : null),
      tuile(`Seuil magnétique bas, courbe ${a.courbe}`, `${nombreCourt(a.seuilA)} A`, 'NF EN 60898-1'),
      tuile('Bilan', a.ok ? 'passe' : 'dépasse', 'contrôle prudent')));
}

// Distribution : d'où part chaque ligne (armoire ou boîtier 32 A tri), câbles en nombre et en longueur (étape 12b).
function phraseDistribution(dist) {
  // Plusieurs arrivées (étape 21b) : chaque arrivée, son branchement et sa distance.
  if (dist.parArrivee) {
    return `${dist.parArrivee.map((a) => `${a.repere} : ${a.branchement === 'boitier' ? 'en direct sur un boîtier 32 A tri' : 'armoire'}, `
      + `${a.distanceM === null ? 'distance non mesurée' : `à ${nombreCourt(a.distanceM, 1)} m`}`).join(' ; ')}.`;
  }
  const distance = dist.distanceArmoireM === null ? 'Armoire non mesurée' : `Armoire à ${nombreCourt(dist.distanceArmoireM, 1)} m`;
  if (dist.type === 'directe') return `${distance} : lignes directes, chacune sur une prise de l'armoire.`;
  const boitiers = `boîtiers 32 A tri ${dist.pose}, chacun alimenté par un câble P17 32 A tri depuis l'armoire`;
  return `${distance} : ${boitiers}${dist.type === 'mixte' ? ', et des lignes en direct sur l\'armoire' : ''}.`;
}

function sectionDistribution(dist, variante) {
  const textes = lignesDistribution(dist);
  const nb = dist.boitiers.length;
  // Au-delà de 8 boîtiers, leur liste se replie entre la ligne de l'armoire et le reste.
  const liste = (items) => (items.length ? el('ul', { class: 'liste-distribution' }, items.map((t) => el('li', {}, t))) : null);
  const deBoitier = (t) => t.startsWith('Boîtier ');
  const listes = nb > 8
    ? [liste(textes.filter((t) => t.startsWith('Armoire :'))),
      el('details', { class: 'fiche' }, el('summary', {}, `Les ${nombre(nb)} boîtiers`), liste(textes.filter(deBoitier))),
      liste(textes.filter((t) => !deBoitier(t) && !t.startsWith('Armoire :')))]
    : [liste(textes)];
  const fourni = (x) => [
    x.sortiesP17 ? pluriel(x.sortiesP17, 'sortie P17 32 A tri', 'sorties P17 32 A tri') : null,
    x.prises16 ? pluriel(x.prises16, `prise ${nombreCourt(dist.departA)} A`, `prises ${nombreCourt(dist.departA)} A`) : null,
  ].filter(Boolean).join(' et ');
  // Plusieurs arrivées : ce que fournit l'armoire de chaque arrivée.
  const fournit = dist.parArrivee
    ? dist.parArrivee.filter((a) => fourni(a)).map((a) => `armoire de ${a.repere}, ${fourni(a)}`).join(' ; ')
    : fourni(dist.armoire);
  const repereDe = new Map((dist.parArrivee ?? []).map((a) => [a.id, a]));
  const origineP17 = (b) => (!b.arrivee ? 'Armoire' : repereDe.get(b.arrivee)?.branchement === 'boitier' ? b.repere : `Armoire ${b.repere}`);
  const origineTete = (l) => (l.boitier ? `Boîtier ${l.boitier}${l.prise ? `, ${l.prise}` : ''}`
    : `Armoire${l.arrivee && dist.parArrivee ? ` ${repereDe.get(l.arrivee)?.repere ?? ''}` : ''}${l.prise ? `, ${l.prise}` : ''}`);
  const premiere = new Map(variante.lignesDetail.map((l) => [l.numero, l.dalles[0]]));
  const cables = [
    ...dist.boitiers.map((b) => ['P17 32 A tri', origineP17(b), `Boîtier ${b.numero}`, b.p17M]),
    ...dist.lignes.filter((l) => l.depuis).map((l) => [`Tête ${nombreCourt(dist.departA)} A`, origineTete(l),
      `Ligne ${l.numero} (${premiere.get(l.numero)})`, l.longueurTeteM]),
  ];
  return [
    dist.refus ? alerte(dist.refus, 'alerte-erreur') : null,
    el('p', { class: 'source' }, phraseDistribution(dist)),
    ...listes,
    fournit ? el('p', { class: 'source' }, `${dist.choix === 'conseil' ? 'L\'armoire doit fournir' : 'Pris sur l\'armoire'} : ${fournit}.`) : null,
    el('details', { class: 'fiche detail-cables' },
      el('summary', {}, `Détail des câbles (${nombre(cables.length)})`),
      el('div', { class: 'tableau-defilant' },
        el('table', { class: 'table-donnees' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Câble'), el('th', {}, 'De'), el('th', {}, 'Vers'), el('th', {}, 'Longueur'))),
          el('tbody', {}, cables.map(([type, de, vers, m]) => el('tr', {}, el('td', {}, type), el('td', {}, de), el('td', {}, vers), el('td', {}, texteLongueurCable(m)))))))),
    dist.cables.tete.totalM === null || (nb && dist.cables.p17.totalM === null)
      ? el('p', { class: 'source' }, 'Longueurs à mesurer : saisis la distance armoire–mur ; le nombre de câbles reste juste.') : null,
    dist.notes.map((t) => alerte(t, 'alerte-info')),
    alerte('Distribution indicative, à valider avec l\'électricien : différentiel 30 mA, protections, sections et longueurs des câbles.', 'alerte-info'),
    dist.parArrivee ? alerte(RAPPEL_ARRIVEES, 'alerte-info') : null,
  ];
}

const RAPPELS = [
  'Allume ligne par ligne : le courant d\'appel dépend du nombre de dalles allumées en même temps.',
  'Un 30 mA par départ 16 A, un 300 mA sélectif en amont ; ne remplace jamais les 30 mA des départs par du 300 mA. À valider avec l\'électricien.',
  'Déroule entièrement tourets et rallonges ; teste la tension avant de brancher (230 V phase-neutre, 400 V entre phases).',
  'P17 bleu = 230 V, P17 rouge = 400 V triphasé ; 32 A tri = 3 phases de 32 A.',
];

let dernier = null;

// Bloc « Ma config » (étape 18c) : contrôle des lignes imposées, refus en erreur.
const zoneMaConfig = () => document.getElementById('etat-ma-config-elec');
function afficherMaConfig(resume, impose, r) {
  if (!resume) {
    remplacer(zoneMaConfig());
    return;
  }
  if (!resume.possible) {
    remplacer(zoneMaConfig(), alerte(`${resume.raison} Le conseil de l'appli reste retenu partout.`, 'alerte-erreur'));
    return;
  }
  const maxW = Math.max(...impose.variante.lignesDetail.map((l) => l.puissanceW));
  remplacer(zoneMaConfig(), el('p', { class: 'note' }, `${pluriel(resume.lignes, 'ligne imposée', 'lignes imposées')} : ligne la plus chargée `
    + `${watts(maxW)} pour ${watts(r.ligne.utileW)} utiles, ça passe.`));
}
const maConfigRemplie = () => formulaire.elements.lignesImposees.value.trim() !== '';

// Résumé texte du dernier calcul valide, pour « Copier les résultats ».
export function resumeOngletElec() {
  return dernier ? resumeElec(dernier.r, dernier) : null;
}

function mettreAJour() {
  dernier = null;
  afficherMaConfig(null);
  const e = lireFormulaire();
  if (e.type !== typeAffiche) {
    preparerArrivee(e.type);
    mettreAJour();
    return;
  }
  document.getElementById('bloc-arrivee-libre').hidden = !e.arriveeLibre;
  document.getElementById('bloc-branchement').hidden = !e.tri32;
  const saisie = lireDistribution();
  document.getElementById('bloc-materiel').hidden = saisie.choix !== 'materiel';
  // Plusieurs arrivées (étape 21b) : cartes redessinées sauf pendant la frappe dans l'une d'elles.
  if (redessinerArrivees) dessinerArrivees();
  redessinerArrivees = true;
  const saisies = saisiesArrivees();
  const plusieurs = saisies.length > 0 || e.branchement1 === 'boitier';
  document.getElementById('legende-arrivee').textContent = saisies.length ? 'Arrivée 1' : 'Arrivée';
  document.querySelector('label[for="distance-armoire"]').textContent = plusieurs
    ? 'Distance de l\'arrivée 1 au mur (m), facultatif : au-delà de 10 m, boîtiers 32 A tri près du mur'
    : 'Armoire élec à mur (m), facultatif : au-delà de 10 m, boîtiers 32 A tri près du mur';
  // Distance publiée pour le Schéma (un seul champ, ici) ; une saisie illisible ne compte pas.
  const reglagesDistribution = {
    ...saisie,
    distanceArmoireM: Number.isFinite(saisie.distanceArmoireM) && saisie.distanceArmoireM >= 0 ? saisie.distanceArmoireM : null,
    mode: modeMur,
  };
  publier(null);
  remplacer(zoneDistribution);
  remplacer(zoneSuite);
  if (!etatMur) return;
  if (!etatMur.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return;
  }
  const { dalle, mur } = etatMur;
  // Arrivées du mur : la première (champs d'aujourd'hui), puis les cartes ; une saisie illisible est refusée en la nommant.
  let arrivees = null;
  if (plusieurs) {
    const materiel = saisie.choix === 'materiel';
    try {
      arrivees = lireArrivees([
        { id: 'arr-1', type: e.type, intensiteA: e.reglages.arrivee.intensiteA, branchement: e.branchement1, distanceM: saisie.distanceArmoireM,
          materiel: materiel ? { prises16: saisie.materiel.prises16, sortiesP17: saisie.materiel.sortiesP17 } : {} },
        ...saisies.map(versArrivee).map((a) => (materiel ? a : { ...a, materiel: {} })),
      ], { departA: e.reglages.departA, puissanceUtileW: e.reglages.puissanceUtileW });
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
      return;
    }
  }
  let r;
  try {
    // Plusieurs arrivées : les lignes se calculent sur l'arrivée de calcul (tri dès qu'une arrivée est tri).
    r = electricite(mur, dalle, arrivees ? { ...e.reglages, arrivee: arriveeDeCalcul(arrivees) } : e.reglages);
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return;
  }

  // Distribution des lignes retenues (la config imposée quand elle passe, sinon la variante conseillée du câblage élec,
  // dans l'ordre du câblage).
  let distribution = null;
  let erreurDistribution = null;
  let cablage = null;
  let repartition = null;
  let repConseil = null;
  try {
    cablage = cablageElec(mur, dalle, r, { depart: departElec, margeMou, imposee: e.imposee });
    const t = cablage;
    const variante = t.variantes.find((x) => x.mode === (t.retenue ?? t.conseil));
    // Plusieurs arrivées : l'arrivée et la phase de chaque ligne, choix à la main compris ; le conseil seul à côté.
    if (arrivees) {
      const prisesParBoitier = saisie.choix === 'materiel' && saisie.materiel.prisesParBoitier ? saisie.materiel.prisesParBoitier : 6;
      repConseil = repartirArrivees(variante, r, arrivees, { prisesParBoitier });
      repartition = repartirArrivees(variante, r, arrivees, { prisesParBoitier, manuel: choixLignes() });
    }
    const lignesDistribuees = repartition ?? variante;
    distribution = {
      d: distributionElec(mur, lignesDistribuees, r, { depart: departElec, distanceArmoireM: saisie.distanceArmoireM, margeMou, mode: modeMur, choix: saisie.choix, materiel: saisie.materiel,
        ...(arrivees ? { arrivees } : {}) }),
      variante: lignesDistribuees,
    };
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    erreurDistribution = erreur.message;
  }

  const impose = cablage?.imposee?.possible ? { variante: cablage.variantes.find((x) => x.mode === 'imposee'), resume: cablage.imposee } : null;
  afficherMaConfig(cablage?.imposee ?? null, impose, r);
  dernier = { r, dalle, mur, distribution: distribution?.d ?? null, imposee: cablage?.imposee ?? null, repartition };
  publier({ r, dalle, mur, distribution: reglagesDistribution, imposee: e.imposee, arrivees, manuel: arrivees ? choixLignes() : null });
  const alertesElec = arrivees ? sansAlertesArrivee(r.alertes) : r.alertes;
  const surChoix = (dalle1, id) => {
    const c = { ...choixLignes() };
    if (id) c[dalle1] = id;
    else delete c[dalle1];
    garder('arriveesLignes', Object.keys(c).length ? c : null);
  };
  const parZone = lignesParZone(r, mur);
  const recap = el('p', { class: 'recap-mur' },
    // Mur mixte (9b5) : la P max de la dalle de chaque zone.
    (mur.mixte && r.zones?.[0]?.pMax
      ? `Mur : ${pluriel(mur.zones.length, 'zone', 'zones')}, ${pluriel(mur.dalles.total, 'dalle', 'dalles')} de `
        + `${new Set(mur.zones.map((z) => z.dalle.id)).size} types. P max retenue : `
        + `${r.zones.map((z, i) => `zone ${z.nom}, ${textePMax(mur.zones[i].dalle, z.pMax.dalle)}`
          + `${z.pMax.demi && mur.zones[i].demi ? `, demi-dalle : ${textePMax(mur.zones[i].demi, z.pMax.demi)}` : ''}`).join(' ; ')}. `
      : `Mur : ${parZone ? `${pluriel(mur.zones.length, 'zone', 'zones')}, ` : ''}${pluriel(mur.dalles.total, 'dalle', 'dalles')} ${dalle.nom}. P max retenue : ${textePMax(dalle, r.pMax.dalle)}`
        + `${r.pMax.demi ? ` ; demi-dalle : ${textePMax(mur.demi, r.pMax.demi)}` : ''}. `),
    el('a', { href: '#mur', class: 'lien-discret' }, 'Modifier le mur'));
  const d = r.dallesParLigne;
  const mixte = Boolean(mur.mixte && r.zones?.[0]?.dallesParLigne);
  const colonnes = r.lignes.colonnes;
  const equilibreDistinct = Boolean(r.triphase)
    && taillesLignes(r.triphase.colonnes.equilibre) !== taillesLignes(r.triphase.colonnes.minimum);
  const detailColonnes = colonnes.colonnesParLigne
    ? `${pluriel(colonnes.colonnesParLigne, 'colonne', 'colonnes')} par ligne`
    : `chaque colonne en ${colonnes.segments.length} segments égaux : ${colonnes.segments.join(' + ')}`;

  // Nouveau look : les deux chiffres clés (lignes retenues, charge de la ligne la plus chargée sur son départ, U × I),
  // avec la barre de charge : couleur de famille jusqu'à 80 %, alerte au-delà, refus au-delà de la puissance utile.
  // Config imposée (étape 18c) : elle prend les chiffres clés, le conseil de l'appli est rappelé dessous avec l'écart.
  const lignesRetenues = impose ? impose.variante.lignesDetail : (r.triphase?.colonnes.equilibre ?? r.lignes.colonnes).lignes;
  const ligneMaxW = Math.max(...lignesRetenues.map((l) => l.puissanceW));
  const chiffres = el('div', { class: 'chiffres-cles' },
    el('p', { class: 'chiffre' }, el('span', { class: 'chiffre-valeur' }, nombre(impose ? impose.variante.lignes : r.lignes.retenues)),
      el('span', { class: 'chiffre-libelle' }, impose ? 'Lignes (imposé)' : 'Lignes en colonnes entières')),
    el('p', { class: 'chiffre' }, el('span', { class: 'chiffre-valeur' }, nombre(ligneMaxW / r.ligne.theoriqueW * 100, 1), el('span', { class: 'chiffre-unite' }, ' %')),
      el('span', { class: 'chiffre-libelle' }, `Ligne la plus chargée : ${watts(ligneMaxW)} sur ${watts(r.ligne.theoriqueW)} (${nombreCourt(r.reglages.tensionV)} V × ${nombreCourt(r.reglages.departA)} A)`)),
    barreCharge(ligneMaxW / r.ligne.theoriqueW, { seuilRefus: r.ligne.utileW / r.ligne.theoriqueW }),
    impose ? el('p', { class: 'conseil-impose' }, impose.resume.texteConseil) : null);
  remplacer(zone,
    recap,
    alerte('Résultats indicatifs : l\'électricité est validée par l\'électricien.', 'alerte-info'),
    r.lignes.auPlusJuste.ecart ? alerte(r.lignes.auPlusJuste.ecart, 'alerte-info') : null,
    ligneManques(r.manques),
    alertesSansManques(alertesElec, r.manques).map((texte) => alerte(texte)),
    (arrivees ? sansAlertesArrivee(impose?.variante.alertes) : impose?.variante.alertes ?? []).map((texte) => alerte(`Ma config (imposée) : ${texte}`)),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, 'Puissance et lignes'),
      chiffres,
      el('dl', { class: 'tuiles' },
        tuile('Puissance totale', kw(r.puissanceTotaleW), `${nombre(r.btuH)} BTU/h à évacuer`),
        tuile('Ligne', watts(r.ligne.utileW),
          r.ligne.origine === 'champ'
            ? 'puissance utile saisie'
            : `${nombreCourt(r.reglages.tensionV)} V × ${nombreCourt(r.reglages.departA)} A × ${nombreCourt(r.reglages.marge * 100)} %`,
          `maxi théorique à 230 V : ${watts(r.ligne.maxi230W)}`),
        // Mur mixte : les dalles par ligne de chaque zone, à la P max et au chaînage de sa dalle.
        mixte
          ? tuile('Dalles par ligne', r.zones.map((z) => `${z.nom} ${nombre(z.dallesParLigne.retenu)}`).join(' · '),
            ...r.zones.map((z, i) => `zone ${z.nom}, ${mur.zones[i].dalle.nom} : ${z.dallesParLigne.limite === 'chaînage'
              ? `limité par le chaînage du constructeur (${z.dallesParLigne.chainage}) ; ${z.dallesParLigne.puissance} en puissance`
              : `${z.dallesParLigne.puissance} en puissance`}`),
            'jamais à cheval sur deux zones')
          : tuile('Dalles par ligne', nombre(d.retenu),
            d.limite === 'chaînage' ? `limité par le chaînage du constructeur (${d.chainage}) ; ${d.puissance} en puissance` : null,
            d.chainage && d.limite !== 'chaînage' ? `chaînage du constructeur : ${d.chainage}` : null,
            `${d.theoriques230} théoriques à 230 V, jamais appliqué`),
        tuile('Lignes en colonnes entières', nombre(r.lignes.retenues),
          equilibreDistinct ? `phases équilibrées : ${taillesLignes(r.triphase.colonnes.equilibre)} colonnes` : detailColonnes,
          equilibreDistinct ? `au minimum : ${pluriel(colonnes.nombre, 'ligne', 'lignes')}, ${detailColonnes}` : null,
          parZone ? `zone par zone : ${parZone.map((z) => `${z.nom} ${z.lignes.length}`).join(', ')}` : null,
          'retenues, comme le schéma'),
        tuile('Minimum théorique', nombre(r.lignes.auPlusJuste.nombre), `au plus juste, serpentin depuis ${LIBELLES_COIN[r.lignes.auPlusJuste.depart]}`,
          r.lignes.auPlusJuste.ecart ? `décompte théorique : ${nombre(r.lignes.auPlusJuste.theorique)}` : null,
          `dalles : ${r.lignes.auPlusJuste.lignes.map((l) => l.dalles).join(' + ')}`,
          ...r.lignes.minimum.raisons.map((raison) => `écart : ${raison}`)))),
    sectionZones(parZone),
    repartition
      ? sectionArrivees(repartition, { conseil: repConseil, choixSaisis: Object.keys(choixLignes()).length > 0, surChoix, surConseil: () => garder('arriveesLignes', null) })
      : sectionArrivee(r, impose));
  remplacer(zoneDistribution, erreurDistribution ? alerte(erreurDistribution, 'alerte-erreur') : sectionDistribution(distribution.d, distribution.variante));
  remplacer(zoneSuite,
    sectionAppel(r, impose),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, 'Rappels terrain'),
      el('ul', { class: 'rappels' }, RAPPELS.map((texte) => el('li', {}, texte)))));
}

// Appelé par l'onglet Schéma quand le coin de départ du câblage élec ou la marge de mou change.
export function definirDepartElec(depart, { margeMou: mou = margeMou } = {}) {
  departElec = depart;
  margeMou = mou;
  mettreAJour();
}

// Appelé quand le montage change dans l'onglet Poids (accroche : boîtiers sur le pont ; stack : au sol derrière le mur).
export function definirModeElec(mode) {
  modeMur = mode === 'stack' ? 'stack' : 'accroche';
  mettreAJour();
}

// `rappel({ r, dalle, mur })` reçoit chaque calcul valide (null sinon), pour l'onglet Schéma.
// `surConfigImposee()` : appelé quand l'utilisateur change ses lignes imposées (le Schéma revient alors à « Ma config »).
export function initialiserElec(rappel = () => {}, { surConfigImposee = () => {} } = {}) {
  publier = rappel;
  const surSaisie = (evenement) => {
    // Reprise des saisies (événement sur le formulaire lui-même) : le bloc s'ouvre quand un champ est rempli.
    if (evenement.target === formulaire && maConfigRemplie()) document.getElementById('ma-config-elec').open = true;
    if (evenement.target.name === 'lignesImposees') surConfigImposee();
    mettreAJour();
  };
  formulaire.addEventListener('input', surSaisie);
  formulaire.addEventListener('change', surSaisie);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
  formDistribution.addEventListener('input', mettreAJour);
  formDistribution.addEventListener('change', mettreAJour);
  formDistribution.addEventListener('submit', (evenement) => evenement.preventDefault());
  document.getElementById('ajouter-arrivee').addEventListener('click', () => {
    garder('autresArrivees', [...saisiesArrivees(), nouvelleSaisieArrivee(`arr-${Date.now().toString(36)}`)]);
  });
  preparerArrivee(lireFormulaire().type);
}

// Appelé par l'onglet Mur après chaque calcul.
export function murModifiePourElec(etat) {
  etatMur = etat;
  mettreAJour();
}
