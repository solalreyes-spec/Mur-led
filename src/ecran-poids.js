// Onglet Poids : charge du mur, bumpers, points d'accroche, maximum du constructeur.
// Résultats indicatifs, à valider par le rigger. Aucune règle de calcul ici : tout passe par calculs.js.

import { poids, ErreurSaisie } from './calculs.js';
import { nombre, nombreCourt, lireNombre, sourceCourte, mentionType } from './format.js';
import { el, remplacer } from './dom.js';
import { alertesSansManques, ligneManques } from './manques.js';
import { resumePoids } from './resumes.js';

const formulaire = document.getElementById('form-poids');
const zone = document.getElementById('resultats-poids');

let bumpersBase = [];
let etatMur = null;
let dalleAffichee = null;

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const kg = (valeur) => `${nombreCourt(valeur, 2)} kg`;
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const nombreOuZero = (texte) => {
  const n = lireNombre(texte);
  return Number.isFinite(n) ? n : 0;
};

function tuile(titre, valeur, ...details) {
  return el('div', { class: 'tuile' },
    el('dt', {}, titre),
    el('dd', {}, el('span', { class: 'tuile-valeur' }, valeur),
      details.filter(Boolean).map((d) => el('span', { class: 'tuile-detail' }, d))));
}

// Bumpers de la base compatibles avec la dalle, plus une saisie manuelle.
function preparerBumpers(dalle) {
  const compatibles = bumpersBase.filter((b) => (b.compatibles ?? []).includes(dalle.id));
  remplacer(formulaire.elements.bumper,
    el('option', { value: '' }, 'Aucun'),
    compatibles.map((b) => el('option', { value: b.id }, `${b.nom}, ${kg(b.poidsKg)}`)),
    el('option', { value: 'manuel' }, 'Saisie manuelle'));
  dalleAffichee = dalle.id;
}

function lireFormulaire() {
  const d = new FormData(formulaire);
  const choix = d.get('bumper');
  const deBase = bumpersBase.find((b) => b.id === choix);
  const cmuBumper = lireNombre(d.get('bumperCmu'));
  let bumper = null;
  if (deBase) bumper = { poidsKg: deBase.poidsKg, colonnes: deBase.colonnes, cmuKg: deBase.cmuKg ?? (Number.isFinite(cmuBumper) ? cmuBumper : null) };
  if (choix === 'manuel') {
    bumper = {
      poidsKg: nombreOuZero(d.get('bumperKg')),
      colonnes: Number(d.get('bumperColonnes')),
      cmuKg: Number.isFinite(cmuBumper) ? cmuBumper : null,
    };
  }
  const cmuMoteur = lireNombre(d.get('cmuMoteurKg'));
  return {
    choixBumper: choix,
    bumperBase: deBase ?? null,
    reglages: {
      mode: d.get('mode'),
      bumper,
      cablesKgParDalle: nombreOuZero(d.get('cablesKgParDalle')),
      autresKg: nombreOuZero(d.get('autresKg')),
      accroche: {
        type: d.get('typeAccroche'),
        points: lireNombre(d.get('pointsPont')),
        porteesEgales: d.has('porteesEgales'),
        poidsPontKg: nombreOuZero(d.get('poidsPontKg')),
        cmuMoteurKg: Number.isFinite(cmuMoteur) ? cmuMoteur : null,
        configurationMoteur: d.get('configurationMoteur') || null,
      },
    },
  };
}

function sectionMaximum(r) {
  const mx = r.maximum;
  if (!mx) return null;
  const unite = { dalles: 'dalles en hauteur', m: 'm de haut', kg: 'kg par colonne' }[mx.unite];
  return tuile(`Maximum en ${mx.mode === 'stack' ? 'stack' : 'accroche'}`, `${nombreCourt(mx.valeur, 2)} / ${nombreCourt(mx.limite, 2)} ${unite}`,
    mx.ok ? 'tenu' : 'dépassé',
    mx.conditions ? `conditions : ${mx.conditions}` : null,
    mx.sources.length ? `source : ${mx.sources.map(sourceCourte).join(', ')}` : null);
}

function tablePoints(r) {
  const p = r.points;
  if (!p) return null;
  const titre = p.type === 'pont'
    ? `Pont (truss) sur ${p.points ? p.points.length : '?'} points : ${kg(p.totalKg)} avec son poids propre`
    : `Un point par ${r.bumpers.length ? 'bumper' : 'colonne'} : parts égales`;
  if (!p.points) {
    return el('section', { class: 'bloc-resultats' }, el('h3', {}, titre),
      alerte('Répartition à faire établir par le rigger (plus de 4 points, portées inégales ou porte-à-faux).', 'alerte-info'));
  }
  const cmu = p.cmuMoteurKg;
  const lignes = p.points.map((pt) => el('tr', { class: cmu && pt.kg > cmu ? 'limite' : null },
    el('th', { scope: 'row' }, `n° ${pt.numero}`),
    el('td', {}, pt.part !== undefined ? `${nombreCourt(pt.part * 100, 2)} %` : `colonnes ${pt.colonnes[0]} à ${pt.colonnes[1]}`),
    el('td', {}, kg(pt.kg)),
    cmu ? el('td', { class: pt.kg > cmu ? 'ko' : 'ok' }, pt.kg > cmu ? '✗' : '✓') : null));
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, titre),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Point'), el('th', {}, p.type === 'pont' ? 'Part' : 'Porte'), el('th', {}, 'Charge'),
          cmu ? el('th', {}, `CMU ${kg(cmu)}${p.configurationMoteur ? ` (${p.configurationMoteur})` : ''}`) : null)),
        el('tbody', {}, lignes))),
    el('p', { class: 'source' }, p.type === 'pont'
      ? 'Pont continu à portées égales, charge répartie : valeurs indicatives.'
      : 'Parts égales seulement si chaque bumper pend directement à son propre point.'));
}

let dernier = null;

// Résumé texte du dernier calcul valide, pour « Copier les résultats ».
export function resumeOngletPoids() {
  return dernier ? resumePoids(dernier.r, dernier) : null;
}

function mettreAJour() {
  dernier = null;
  if (!etatMur) return;
  if (!etatMur.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return;
  }
  const { dalle, mur } = etatMur;
  if (dalle.id !== dalleAffichee) preparerBumpers(dalle);
  const e = lireFormulaire();
  const accroche = e.reglages.mode === 'accroche';
  formulaire.querySelector('.groupe-accroche').hidden = !accroche;
  document.getElementById('bloc-bumper').hidden = e.choixBumper !== 'manuel' && !e.bumperBase;
  document.getElementById('bumper-kg').closest('.paire').hidden = e.choixBumper !== 'manuel';
  document.getElementById('bloc-pont').hidden = e.reglages.accroche.type !== 'pont';

  let r;
  try {
    r = poids(mur, dalle, e.reglages);
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return;
  }

  dernier = { r, dalle, mur };
  const sourcePoids = [...(dalle.sources?.poidsKg?.sources ?? []).map(sourceCourte), mentionType(dalle.sources?.poidsKg)].filter(Boolean).join(', ');
  const recap = el('p', { class: 'recap-mur' },
    `Mur : ${pluriel(mur.dalles.total, 'dalle', 'dalles')} ${dalle.nom}, ${kg(r.poidsDalleKg)} par dalle`
    + `${sourcePoids ? ` (${sourcePoids})` : ''}${r.poidsDemiKg ? ` ; demi-dalle : ${kg(r.poidsDemiKg)}` : ''}. `,
    el('a', { href: '#mur' }, 'Modifier le mur'));

  const bumpers = r.bumpers.length
    ? el('p', { class: 'source' }, `${pluriel(r.bumpers.length, 'bumper', 'bumpers')} : ${r.bumpers.map((b) => kg(b.kg)).join(', ')}`
      + `${e.bumperBase ? ` (${e.bumperBase.sources.poidsKg.sources.map(sourceCourte).join(', ')} : ${e.bumperBase.sources.poidsKg.source.confiance})` : ''}.`)
    : null;

  remplacer(zone,
    recap,
    alerte('Résultats indicatifs : la structure est validée par le rigger.', 'alerte-info'),
    ligneManques(r.manques),
    alertesSansManques(r.alertes, r.manques).map((texte) => alerte(texte)),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, accroche ? 'Charge suspendue' : 'Charge au sol'),
      el('dl', { class: 'tuiles' },
        tuile(accroche ? 'Total suspendu' : 'Total', kg(r.suspenduKg),
          `dalles ${kg(r.dallesKg)}, câbles ${kg(r.cablesKg)}`,
          accroche ? `bumpers ${kg(r.bumpersKg)}, autres ${kg(r.autresKg)}` : null),
        tuile('Par colonne', kg(r.colonnes[0].kg), `${pluriel(r.colonnes[0].dalles, 'dalle', 'dalles')}, câbles compris`),
        tuile('Charge surfacique', `${nombreCourt(r.kgParM2, 1)} kg/m²`, 'dalles seules'),
        tuile('Par mètre linéaire', `${nombreCourt(r.kgParMetre, 1)} kg/m`, 'charge totale sur la largeur du mur'),
        sectionMaximum(r)),
      bumpers),
    tablePoints(r),
    el('section', { class: 'bloc-resultats' },
      el('h3', {}, 'Rappels'),
      el('ul', { class: 'rappels' }, r.rappels.map((texte) => el('li', {}, texte)))));
}

// Nouvelle base : bumpers et barres à jour.
export function actualiserBumpers(bumpers) {
  bumpersBase = bumpers;
  dalleAffichee = null;
  mettreAJour();
}

// `bumpers` : bumpers et barres de la base, déjà résolus.
export function initialiserPoids(bumpers) {
  bumpersBase = bumpers;
  formulaire.addEventListener('input', mettreAJour);
  formulaire.addEventListener('change', mettreAJour);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
}

// Appelé par l'onglet Mur après chaque calcul.
export function murModifiePourPoids(etat) {
  etatMur = etat;
  mettreAJour();
}
