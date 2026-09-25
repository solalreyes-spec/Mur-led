// Onglet Élec : lignes, phases, arrivée, courant d'appel. Résultats indicatifs, à valider par l'électricien.
// Aucune règle de calcul ici : tout passe par calculs.js.

import { electricite, ARRIVEES, LIBELLES_COIN, ErreurSaisie } from './calculs.js';
import { nombre, nombreCourt, lireNombre, sourceCourte, mentionType } from './format.js';
import { el, remplacer } from './dom.js';
import { alertesSansManques, ligneManques } from './manques.js';
import { resumeElec } from './resumes.js';

const formulaire = document.getElementById('form-elec');
const zone = document.getElementById('resultats-elec');

let etatMur = null;
let typeAffiche = null;
// Coin de départ du câblage élec, choisi dans l'onglet Schéma ; le résultat est publié pour ce même onglet.
let departElec = 'haut-gauche';
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
    reglages: {
      tensionV: lireNombre(d.get('tensionV')),
      marge: Number(d.get('marge')),
      puissanceUtileW: Number.isFinite(puissance) ? puissance : null,
      departA: lireNombre(d.get('departA')),
      arrivee: { type, intensiteA: choix === 'libre' ? lireNombre(d.get('arriveeLibre')) : Number(choix) },
      courbe: d.get('courbe') || null,
      depart: departElec,
    },
  };
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
    el('td', { class: p.puissanceW > capaciteW ? 'ko' : 'ok' }, p.puissanceW > capaciteW ? '✗' : '✓')));
  const enColonnes = Boolean(option.lignes[0]?.colonnes);
  const detailLignes = option.lignes.map((l) => (enColonnes ? l.colonnes : l.dalles)).join(' + ');
  return el('div', {},
    el('h4', {}, titre, conseil ? el('span', { class: 'badge badge-reussi' }, 'conseillé') : null),
    el('p', { class: 'source' }, `${pluriel(option.lignes.length, 'ligne', 'lignes')} de ${detailLignes} ${enColonnes ? 'colonnes' : 'dalles'}. `
      + `Écart entre phases : ${watts(option.ecartW)}, soit ${nombreCourt(option.ecartPourcent, 0)} % de la phase la plus chargée.`),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Phase'), el('th', {}, 'Lignes'), el('th', {}, 'Charge'), el('th', {}, 'Intensité'), el('th', {}, ''))),
        el('tbody', {}, lignes))));
}

function sectionArrivee(r) {
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
    el('h4', {}, 'En colonnes entières'),
    tablePhases(t.colonnes.equilibre, a.capacitePhaseW, 'Équilibre des phases (écart le plus faible)', true),
    taillesLignes(t.colonnes.equilibre) === taillesLignes(t.colonnes.minimum)
      ? el('p', { class: 'source' }, 'Au minimum de lignes : mêmes lignes, même répartition.')
      : tablePhases(t.colonnes.minimum, a.capacitePhaseW, 'Au minimum de lignes', false),
    el('h4', {}, 'Au plus juste (minimum théorique)'),
    tablePhases(t.auPlusJuste.equilibre, a.capacitePhaseW, 'Équilibre (lignes en multiple de 3)', false),
    tablePhases(t.auPlusJuste.minimum, a.capacitePhaseW, 'Au minimum de lignes', false));
}

function sectionAppel(r) {
  const a = r.appel;
  if (!a) {
    return el('p', { class: 'source' }, 'Courant d\'appel non donné par la fiche : allume ligne par ligne et fais vérifier la courbe des disjoncteurs par l\'électricien.');
  }
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Courant d\'appel'),
    el('dl', { class: 'tuiles' },
      tuile('Pic d\'une ligne', `${nombreCourt(a.picLigneA, 1)} A`, 'toutes ses dalles allumées en même temps', a.dureeMs ? `pendant ${nombreCourt(a.dureeMs)} ms` : null),
      tuile(`Seuil magnétique bas, courbe ${a.courbe}`, `${nombreCourt(a.seuilA)} A`, 'NF EN 60898-1'),
      tuile('Bilan', a.ok ? 'passe' : 'dépasse', 'contrôle prudent')));
}

const RAPPELS = [
  'Allume ligne par ligne : le courant d\'appel dépend du nombre de dalles allumées en même temps.',
  'Un 30 mA par départ 16 A, un 300 mA sélectif en amont ; ne remplace jamais les 30 mA des départs par du 300 mA. À valider avec l\'électricien.',
  'Déroule entièrement tourets et rallonges ; teste la tension avant de brancher (230 V phase-neutre, 400 V entre phases).',
  'P17 bleu = 230 V, P17 rouge = 400 V triphasé ; 32 A tri = 3 phases de 32 A.',
];

let dernier = null;

// Résumé texte du dernier calcul valide, pour « Copier les résultats ».
export function resumeOngletElec() {
  return dernier ? resumeElec(dernier.r, dernier) : null;
}

function mettreAJour() {
  dernier = null;
  const e = lireFormulaire();
  if (e.type !== typeAffiche) {
    preparerArrivee(e.type);
    mettreAJour();
    return;
  }
  document.getElementById('bloc-arrivee-libre').hidden = !e.arriveeLibre;
  publier(null);
  if (!etatMur) return;
  if (!etatMur.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return;
  }
  const { dalle, mur } = etatMur;
  let r;
  try {
    r = electricite(mur, dalle, e.reglages);
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return;
  }

  dernier = { r, dalle, mur };
  publier({ r, dalle, mur });
  const recap = el('p', { class: 'recap-mur' },
    `Mur : ${pluriel(mur.dalles.total, 'dalle', 'dalles')} ${dalle.nom}. P max retenue : ${textePMax(dalle, r.pMax.dalle)}`
    + `${r.pMax.demi ? ` ; demi-dalle : ${textePMax(mur.demi, r.pMax.demi)}` : ''}. `,
    el('a', { href: '#mur' }, 'Modifier le mur'));
  const d = r.dallesParLigne;
  const colonnes = r.lignes.colonnes;
  const equilibreDistinct = Boolean(r.triphase)
    && taillesLignes(r.triphase.colonnes.equilibre) !== taillesLignes(r.triphase.colonnes.minimum);
  const detailColonnes = colonnes.colonnesParLigne
    ? `${pluriel(colonnes.colonnesParLigne, 'colonne', 'colonnes')} par ligne`
    : `chaque colonne en ${colonnes.segments.length} segments égaux : ${colonnes.segments.join(' + ')}`;

  remplacer(zone,
    recap,
    alerte('Résultats indicatifs : l\'électricité est validée par l\'électricien.', 'alerte-info'),
    r.lignes.auPlusJuste.ecart ? alerte(r.lignes.auPlusJuste.ecart, 'alerte-info') : null,
    ligneManques(r.manques),
    alertesSansManques(r.alertes, r.manques).map((texte) => alerte(texte)),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, 'Puissance et lignes'),
      el('dl', { class: 'tuiles' },
        tuile('Puissance totale', kw(r.puissanceTotaleW), `${nombre(r.btuH)} BTU/h à évacuer`),
        tuile('Ligne', watts(r.ligne.utileW),
          r.ligne.origine === 'champ'
            ? 'puissance utile saisie'
            : `${nombreCourt(r.reglages.tensionV)} V × ${nombreCourt(r.reglages.departA)} A × ${nombreCourt(r.reglages.marge * 100)} %`,
          `maxi théorique à 230 V : ${watts(r.ligne.maxi230W)}`),
        tuile('Dalles par ligne', nombre(d.retenu),
          d.limite === 'chaînage' ? `limité par le chaînage du constructeur (${d.chainage}) ; ${d.puissance} en puissance` : null,
          d.chainage && d.limite !== 'chaînage' ? `chaînage du constructeur : ${d.chainage}` : null,
          `${d.theoriques230} théoriques à 230 V, jamais appliqué`),
        tuile('Lignes en colonnes entières', nombre(r.lignes.retenues),
          equilibreDistinct ? `phases équilibrées : ${taillesLignes(r.triphase.colonnes.equilibre)} colonnes` : detailColonnes,
          equilibreDistinct ? `au minimum : ${pluriel(colonnes.nombre, 'ligne', 'lignes')}, ${detailColonnes}` : null,
          'retenues, comme le schéma'),
        tuile('Minimum théorique', nombre(r.lignes.auPlusJuste.nombre), `au plus juste, serpentin depuis ${LIBELLES_COIN[r.lignes.auPlusJuste.depart]}`,
          r.lignes.auPlusJuste.ecart ? `décompte théorique : ${nombre(r.lignes.auPlusJuste.theorique)}` : null,
          `dalles : ${r.lignes.auPlusJuste.lignes.map((l) => l.dalles).join(' + ')}`,
          ...r.lignes.minimum.raisons.map((raison) => `écart : ${raison}`)))),
    sectionArrivee(r),
    sectionAppel(r),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, 'Rappels terrain'),
      el('ul', { class: 'rappels' }, RAPPELS.map((texte) => el('li', {}, texte)))));
}

// Appelé par l'onglet Schéma quand le coin de départ du câblage élec change.
export function definirDepartElec(depart) {
  departElec = depart;
  mettreAJour();
}

// `rappel({ r, dalle, mur })` reçoit chaque calcul valide (null sinon), pour l'onglet Schéma.
export function initialiserElec(rappel = () => {}) {
  publier = rappel;
  formulaire.addEventListener('input', mettreAJour);
  formulaire.addEventListener('change', mettreAJour);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
  preparerArrivee(lireFormulaire().type);
}

// Appelé par l'onglet Mur après chaque calcul.
export function murModifiePourElec(etat) {
  etatMur = etat;
  mettreAJour();
}
