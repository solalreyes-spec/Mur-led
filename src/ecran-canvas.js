// Onglet Canvas : canvas à régler sur chaque processeur et contrôle de la source.
// Aucune règle de calcul ici : tout passe par calculs.js.

import {
  controleSource, controleRegie, sourceConseillee, champsManquantsRegie, ErreurSaisie,
} from './calculs.js';
import { nombre, nombreCourt, lireNombre, sourceCourte } from './format.js';
import { el, remplacer } from './dom.js';
import { resumeCanvas } from './resumes.js';

const formulaire = document.getElementById('form-source');
const zone = document.getElementById('resultats-canvas');

let liaisons = [];
let regies = [];
let etatData = null;
// Tant que l'utilisateur n'a pas touché au format de la source, elle suit la source conseillée.
let sourceModifiee = false;
const CHAMPS_SOURCE = ['largeurPx', 'hauteurPx', 'frequenceHz', 'liaison'];

function lireFormulaire() {
  const d = new FormData(formulaire);
  return {
    largeurPx: lireNombre(d.get('largeurPx')),
    hauteurPx: lireNombre(d.get('hauteurPx')),
    frequenceHz: lireNombre(d.get('frequenceHz')),
    bits: Number(d.get('bits')),
    liaison: d.get('liaison'),
    espace: d.get('espace'),
    plage: d.get('plage'),
    regie: d.get('regie'),
    multiviewer: d.has('multiviewer'),
  };
}

// Remplit le formulaire avec la source conseillée, sauf si l'utilisateur l'a modifiée.
function appliquerConseil(choisie, reglages) {
  const conseil = choisie?.groupes?.length ? sourceConseillee(choisie, liaisons, reglages.frequenceHz) : null;
  const texte = document.getElementById('texte-source');
  document.getElementById('bouton-conseil').hidden = !sourceModifiee || !conseil;
  if (!conseil) {
    texte.textContent = '';
    return;
  }
  const nomLiaison = liaisons.find((l) => l.id === conseil.liaison)?.nom ?? 'liaison inconnue';
  const description = `${conseil.largeurPx} × ${conseil.hauteurPx} px à ${nombreCourt(conseil.frequenceHz)} Hz en ${nomLiaison}`;
  if (sourceModifiee) {
    texte.textContent = `Source modifiée à la main. Source conseillée : ${description}.`;
    return;
  }
  const e = formulaire.elements;
  e.largeurPx.value = String(conseil.largeurPx);
  e.hauteurPx.value = String(conseil.hauteurPx);
  e.frequenceHz.value = String(conseil.frequenceHz);
  if (conseil.liaison) e.liaison.value = conseil.liaison;
  const raisons = {
    standard: 'C\'est le plus petit format standard qui contient le plus grand bloc, sur la meilleure entrée du processeur.',
    entree: `Le ${conseil.formatStandard?.join(' × ')} ne passe pas l'entrée du processeur : la source prend la taille du bloc, en résolution personnalisée.`,
    taille: 'Aucun format standard ne contient le plus grand bloc : la source prend sa taille.',
  };
  texte.textContent = `Source conseillée : ${description}. ${raisons[conseil.raison]}`;
}

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const intervalle = ([debut, fin]) => `${debut} à ${fin}`;
const mpx = (debit) => `${nombreCourt(debit / 1e6, 1)} Mpx/s`;

function tuile(titre, valeur, ...details) {
  return el('div', { class: 'tuile' },
    el('dt', {}, titre),
    el('dd', {}, el('span', { class: 'tuile-valeur' }, valeur),
      details.filter(Boolean).map((d) => el('span', { class: 'tuile-detail' }, d))));
}

function sectionLiaison(source, r, proc) {
  const c = r.entree.controle;
  if (!c) return null;
  const l = c.liaison;
  const sourceFormat = l.sources.formatMaxLargeurPx?.sources.map(sourceCourte).join(', ');
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Liaison vers le processeur'),
    el('dl', { class: 'tuiles' },
      tuile('Débit demandé', mpx(c.debitDemande), `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz`),
      tuile(`Débit maxi ${l.nom}`, mpx(c.debitMax),
        `${l.formatMaxLargeurPx} × ${l.formatMaxHauteurPx} à ${l.formatMaxFrequenceHz} Hz, en approximation`,
        sourceFormat ? `source : ${sourceFormat}` : null),
      tuile('Utilisation', `${nombre(c.taux * 100)} %`, c.ok ? 'la liaison passe' : 'la liaison ne passe pas'),
      tuile(`Entrée du ${proc.modele}`, r.entree.liaison.nom, proc.entrees ? `entrées : ${proc.entrees}` : null)));
}

function tableBlocs(r, proc) {
  const lignes = r.blocs.map((b) => el('tr', { class: b.tient ? null : 'limite' },
    el('th', { scope: 'row' }, `n° ${b.numero}`),
    el('td', {}, `${b.largeurPx} × ${b.hauteurPx}`),
    el('td', {}, b.canvas ? `${b.canvas.largeurPx} × ${b.canvas.hauteurPx}` : '—',
      b.canvas?.format ? el('span', { class: 'source-ligne' }, b.canvas.format) : null),
    el('td', {}, `x ${intervalle(b.x)}`, el('span', { class: 'source-ligne' }, `y ${intervalle(b.y)}`)),
    el('td', {}, `x ${intervalle(b.xSource)}`, el('span', { class: 'source-ligne' }, `y ${intervalle(b.ySource)}`)),
    el('td', { class: b.tient ? 'ok' : 'ko' }, b.tient ? '✓' : '✗')));
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Canvas à régler, par ${proc.modele}`),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {},
          el('th', {}, proc.modele), el('th', {}, 'Bloc (px)'), el('th', {}, 'Canvas'),
          el('th', {}, 'Dans le mur'), el('th', {}, 'Dans sa source'), el('th', {}, ''))),
        el('tbody', {}, lignes))),
    el('p', { class: 'source' }, 'Les coordonnées commencent à 0 : un canvas de 1920 px va de 0 à 1919.'));
}

function sectionRegie(r, regie, source) {
  if (!r) return null;
  if (r.aCompleter.length > 0) {
    return el('section', { class: 'bloc-resultats' },
      el('h3', {}, `Régie : ${regie.nom}`),
      alerte(`Fiche de la régie ${regie.nom} à compléter (sorties et résolutions) : aucun contrôle avec ce modèle.`, 'alerte-info'));
  }
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Régie : ${regie.nom}`),
    r.refus.map((texte) => alerte(texte, 'alerte-erreur')),
    r.alertes.map((texte) => alerte(texte)),
    el('dl', { class: 'tuiles' },
      tuile('Sorties nécessaires', nombre(r.sortiesNecessaires), 'une par processeur'),
      tuile('Sorties disponibles', nombre(r.sortiesDisponibles),
        r.mode ? `mode ${r.mode.nom}, jusqu'à ${r.mode.largeurMaxPx} × ${r.mode.hauteurMaxPx} à ${r.mode.frequenceHz} Hz` : 'aucun mode ne convient',
        r.mode?.source ? `source : ${regieSources[r.mode.source] ?? r.mode.source}` : null),
      tuile('Format envoyé', `${source.largeurPx} × ${source.hauteurPx}`, `${nombreCourt(source.frequenceHz)} Hz`)));
}

let regieSources = {};
let dernier = null;

// Résumé texte du dernier contrôle de la source, pour « Copier les résultats ».
export function resumeOngletCanvas() {
  return dernier ? resumeCanvas(dernier.r, dernier) : null;
}

// Configuration gardée : la source suit-elle le conseil, ou a-t-elle été modifiée à la main ?
export function sourceEstModifiee() {
  return sourceModifiee;
}

export function definirSourceModifiee(modifiee) {
  sourceModifiee = modifiee === true;
}

function mettreAJour() {
  dernier = null;
  if (!etatData) return;
  appliquerConseil(etatData.choisie, etatData.reglages);
  const e = lireFormulaire();
  document.getElementById('bloc-multiviewer').hidden = !e.regie;
  const lienData = el('a', { href: '#data' }, 'Choisir le processeur');
  const { choisie, famille, reglages } = etatData;
  if (!choisie) {
    remplacer(zone, alerte('Aucun processeur retenu : choisis-en un qui convient dans l\'onglet Data.', 'alerte-erreur'), lienData);
    return;
  }
  const proc = choisie.processeur;
  if (!choisie.groupes?.length) {
    remplacer(zone, alerte(choisie.impossible ?? `Le ${proc.nom} ne convient pas à ce mur.`, 'alerte-erreur'), lienData);
    return;
  }

  const source = lireFormulaire();
  let r;
  try {
    r = controleSource(source, choisie, liaisons, { famille, bitsReseau: reglages.bits, frequenceHz: reglages.frequenceHz });
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return;
  }

  const regie = regies.find((x) => x.id === e.regie) ?? null;
  const rRegie = regie ? controleRegie(regie, choisie, source, liaisons, { multiviewer: e.multiviewer }) : null;
  dernier = { r, evaluation: choisie, source, regie, rRegie };

  const recap = el('p', { class: 'recap-mur' },
    `Processeur : ${choisie.nombre} × ${proc.nom}, ${nombreCourt(reglages.frequenceHz)} Hz, ${reglages.bits} bits réseau. `,
    el('a', { href: '#data' }, 'Modifier'));
  const bilan = r.ok && rRegie?.ok !== false
    ? alerte(`La source passe : ${r.blocs.length > 1 ? `chaque ${proc.modele} reçoit` : `le ${proc.modele} reçoit`} `
      + `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz en ${r.entree.liaison.nom}.`, 'alerte-ok')
    : null;

  remplacer(zone,
    recap,
    bilan,
    r.refus.map((texte) => alerte(texte, 'alerte-erreur')),
    r.alertes.map((texte) => alerte(texte)),
    sectionLiaison(source, r, proc),
    sectionRegie(rRegie, regie, source),
    tableBlocs(r, proc));
}

function remplirRegies(erreurRegies = null) {
  const select = formulaire.elements.regie;
  const avant = select.value;
  remplacer(select,
    el('option', { value: '' }, 'Aucune (source directe)'),
    erreurRegies ? el('option', { value: '', disabled: '' }, `Base des régies indisponible : ${erreurRegies}`) : null,
    regies.map((x) => {
      const aCompleter = champsManquantsRegie(x).length > 0;
      const badge = { modifiee: ' (version modifiée)', ajoutee: ' (ma fiche)' }[x.statutBase] ?? '';
      return el('option', { value: x.id }, `${x.nom}${x.role ? ` — ${x.role}` : ''}${badge}${aCompleter ? ' (à compléter)' : ''}`);
    }));
  if (regies.some((x) => x.id === avant)) select.value = avant;
}

// Nouvelle base : liste des régies à jour (mes fiches et versions modifiées comprises).
export function actualiserRegies(nouvelles, sourcesRegies = {}) {
  regies = nouvelles;
  regieSources = Object.fromEntries(Object.entries(sourcesRegies).map(([id, s]) => [id, sourceCourte(s)]));
  remplirRegies();
  mettreAJour();
}

// `base` : { liaisons, regies, sourcesRegies } déjà résolues.
export function initialiserCanvas(base) {
  liaisons = base.liaisons;
  regies = base.regies ?? [];
  regieSources = Object.fromEntries(Object.entries(base.sourcesRegies ?? {}).map(([id, s]) => [id, sourceCourte(s)]));
  remplacer(formulaire.elements.liaison,
    liaisons.map((l) => el('option', { value: l.id, selected: l.id === 'hdmi-2.0' ? '' : null }, l.nom)));
  remplirRegies(base.erreurRegies);
  const surSaisie = (evenement) => {
    if (CHAMPS_SOURCE.includes(evenement.target.name)) sourceModifiee = true;
    mettreAJour();
  };
  formulaire.addEventListener('input', surSaisie);
  formulaire.addEventListener('change', surSaisie);
  document.getElementById('bouton-conseil').addEventListener('click', () => {
    sourceModifiee = false;
    mettreAJour();
  });
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
}

// Appelé par l'onglet Data après chaque calcul.
export function donneesModifiees(etat) {
  etatData = etat;
  mettreAJour();
}
