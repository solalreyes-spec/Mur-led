// Onglet Canvas : canvas à régler sur chaque processeur et contrôle de la source.
// Aucune règle de calcul ici : tout passe par calculs.js.

import {
  controleSource, controleRegie, controleChaine, sourceConseillee, champsManquantsRegie, maillonDepuisFiche, ErreurSaisie,
} from './calculs.js';
import { nombre, nombreCourt, lireNombre, sourceCourte } from './format.js';
import { el, remplacer } from './dom.js';
import { resumeCanvas } from './resumes.js';

const formulaire = document.getElementById('form-source');
const zone = document.getElementById('resultats-canvas');

let liaisons = [];
let regies = [];
let appareils = { serveurs: [], convertisseurs: [] };
let etatData = null;
// Tant que l'utilisateur n'a pas touché au format de la source, elle suit la source conseillée.
let sourceModifiee = false;
const CHAMPS_SOURCE = ['largeurPx', 'hauteurPx', 'frequenceHz', 'liaison'];

// Latence saisie : « 3 » ou « 3-5 » (images) ; vide : non chiffrée.
function lireLatence(texte) {
  const m = String(texte ?? '').trim().match(/^(\d+)(?:\s*(?:-|à)\s*(\d+))?$/);
  if (!m) return {};
  return { latenceMinImages: Number(m[1]), latenceMaxImages: Number(m[2] ?? m[1]) };
}

// Convertisseur saisi, ou pris dans la base : sa fiche donne le nom, la latence et la liaison de sortie ;
// une latence saisie passe devant.
function lireConvertisseurs(d) {
  const n = Number(d.get('nbConvertisseurs') ?? 0);
  return Array.from({ length: n }, (_, i) => {
    const fiche = appareils.convertisseurs.find((x) => x.id === d.get(`conv${i + 1}Fiche`));
    const m = fiche ? maillonDepuisFiche(fiche) : null;
    const latence = lireLatence(d.get(`conv${i + 1}Latence`));
    return {
      ...(m ?? {}),
      nom: String(d.get(`conv${i + 1}Nom`) ?? '').trim() || m?.nom || `Convertisseur ${i + 1}`,
      liaison: m?.liaison ?? d.get(`conv${i + 1}Liaison`),
      longueurM: lireNombre(d.get(`conv${i + 1}Longueur`)),
      ...latence,
    };
  });
}

// Source prise dans la base (mélangeur ou serveur média) : nom, latence, cadences ; mélangeur : formats broadcast
// et sorties qui portent le Program.
function lireSourceAppareil(d) {
  const id = d.get('sourceAppareil');
  const fiche = [...appareils.melangeurs, ...appareils.serveurs].find((x) => x.id === id);
  return fiche ? maillonDepuisFiche(fiche) : null;
}

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
    programSeul: d.has('programSeul'),
    couchesParSortie: Math.max(1, Math.floor(lireNombre(d.get('couchesParSortie')) || 1)),
    longueurM: lireNombre(d.get('longueurM')),
    latenceSource: lireLatence(d.get('latenceSource')),
    sourceAppareil: lireSourceAppareil(d),
    convertisseurs: lireConvertisseurs(d),
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
  const mhz = c.frequencePixelMaxMHz;
  const sourceMhz = l.sources.frequencePixelMaxMHz?.sources.map(sourceCourte).join(', ');
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Liaison vers le processeur'),
    el('dl', { class: 'tuiles' },
      mhz
        ? tuile('Fréquence pixel', `${nombreCourt(c.frequencePixelMHz)} MHz`, `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz`,
          c.methode === 'CTA-861' ? 'timings CTA-861' : 'CVT à blanking réduit, approximation')
        : tuile('Débit demandé', mpx(c.debitDemande), `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz`),
      mhz
        ? tuile(`Maxi ${l.nom}`, `${nombreCourt(mhz)} MHz`, sourceMhz ? `source : ${sourceMhz}` : null)
        : tuile(`Débit maxi ${l.nom}`, mpx(c.debitMax),
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
    (r.notes ?? []).map((texte) => alerte(texte, 'alerte-info')),
    el('dl', { class: 'tuiles' },
      tuile('Sorties nécessaires', nombre(r.sortiesNecessaires), 'une par processeur'),
      tuile('Sorties disponibles', r.sortiesAux > 0 ? `${nombre(r.sortiesDisponibles)} Program + ${nombre(r.sortiesAux)} Aux` : nombre(r.sortiesDisponibles),
        r.mode ? `mode ${r.mode.nom}, jusqu'à ${r.mode.largeurMaxPx} × ${r.mode.hauteurMaxPx} à ${r.mode.frequenceHz} Hz` : 'aucun mode ne convient',
        r.mode?.source ? `source : ${regieSources[r.mode.source] ?? r.mode.source}` : null),
      tuile('Format envoyé', `${source.largeurPx} × ${source.hauteurPx}`, `${nombreCourt(source.frequenceHz)} Hz`),
      r.budget?.budget ? tuile('Budget', `${nombreCourt(r.budget.pixels / 1e6, 1)} MP`, `pour ${nombreCourt(r.budget.budget.mpx / 1e6, 1)} MP ${r.budget.budget.libelle}`,
        `source : ${regieSources[r.budget.budget.source] ?? r.budget.budget.source}`) : null));
}

function sectionChaine(chaine, source) {
  const longueur = (m) => (m > 0 ? `, ${nombreCourt(m)} m` : '');
  const nomLiaison = (id) => liaisons.find((l) => l.id === id)?.nom ?? 'liaison non choisie';
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Chaîne jusqu\'au processeur'),
    el('ol', { class: 'liste-chaine' }, chaine.maillons.map((m) => el('li', {},
      m.role === 'processeur' ? `${m.nom} (entrée ${nomLiaison(chaine.liaisonProcesseur)})` : `${m.nom}, puis ${nomLiaison(m.liaison)}${longueur(m.longueurM)}`,
      m.refus.map((t) => alerte(t, 'alerte-erreur')),
      m.alertes.map((t) => alerte(t)),
      (m.notes ?? []).map((t) => alerte(t, 'alerte-info'))))),
    chaine.cadence.map((t) => alerte(t)),
    el('dl', { class: 'tuiles' },
      tuile('Latence de la chaîne', chaine.latence.maxImages === null ? `au moins ${chaine.latence.minImages} im.` : `${chaine.latence.minImages} à ${chaine.latence.maxImages} im.`,
        chaine.latence.texte, chaine.latenceSourceComptee ? null : 'source non comptée (latence non saisie)'),
      tuile('Format', `${source.largeurPx} × ${source.hauteurPx}`, `${nombreCourt(source.frequenceHz)} Hz`)));
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
  const regieChoisie = regies.find((x) => x.id === e.regie) ?? null;
  document.getElementById('bloc-multiviewer').hidden = !e.regie;
  document.getElementById('bloc-program-seul').hidden = !regieChoisie?.budgetsMP?.length;
  document.getElementById('bloc-couches').hidden = !regieChoisie?.couchesParCarteSL;
  for (const bloc of formulaire.querySelectorAll('.convertisseur')) bloc.hidden = Number(bloc.dataset.rang) > e.convertisseurs.length;
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

  const regie = regieChoisie;
  const saisie = lireFormulaire();
  // Chaîne : l'entrée du processeur se contrôle sur la liaison du dernier convertisseur.
  let chaine = null;
  let r;
  try {
    if (![saisie.largeurPx, saisie.hauteurPx, saisie.frequenceHz].every((x) => Number.isFinite(x) && x > 0)) {
      throw new ErreurSaisie('Indique une résolution et une fréquence de source supérieures à zéro.');
    }
    chaine = controleChaine({
      source: {
        ...(saisie.sourceAppareil ?? {}), largeurPx: saisie.largeurPx, hauteurPx: saisie.hauteurPx, frequenceHz: saisie.frequenceHz,
        nom: saisie.sourceAppareil?.nom ?? 'Source', ...saisie.latenceSource,
      },
      liaison: saisie.liaison, longueurM: saisie.longueurM, convertisseurs: saisie.convertisseurs,
    }, { evaluation: choisie, liaisons, frequenceCalculHz: reglages.frequenceHz, regie });
    r = controleSource({ ...saisie, liaison: chaine.liaisonProcesseur }, choisie, liaisons, { famille, bitsReseau: reglages.bits, frequenceHz: reglages.frequenceHz });
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return;
  }
  const source = { ...saisie, liaison: chaine.liaisonProcesseur };
  const rRegie = regie ? controleRegie(regie, choisie, saisie, liaisons, { multiviewer: e.multiviewer, programSeul: e.programSeul, couchesParSortie: e.couchesParSortie }) : null;
  dernier = { r, evaluation: choisie, source, regie, rRegie, chaine };

  const recap = el('p', { class: 'recap-mur' },
    `Processeur : ${choisie.nombre} × ${proc.nom}, ${nombreCourt(reglages.frequenceHz)} Hz, ${reglages.bits} bits réseau. `,
    el('a', { href: '#data' }, 'Modifier'));
  const bilan = r.ok && rRegie?.ok !== false && chaine.ok
    ? alerte(`La source passe : ${r.blocs.length > 1 ? `chaque ${proc.modele} reçoit` : `le ${proc.modele} reçoit`} `
      + `${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz en ${r.entree.liaison.nom}.`, 'alerte-ok')
    : null;

  remplacer(zone,
    recap,
    bilan,
    r.refus.map((texte) => alerte(texte, 'alerte-erreur')),
    r.alertes.map((texte) => alerte(texte)),
    sectionLiaison(source, r, proc),
    sectionChaine(chaine, source),
    sectionRegie(rRegie, regie, saisie),
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
  for (const select of formulaire.querySelectorAll('.liste-liaisons')) {
    remplacer(select, liaisons.map((l) => el('option', { value: l.id, selected: l.id === '12g-sdi' ? '' : null }, l.nom)));
  }
  // Maillons de la base : mélangeurs et serveurs média en source, convertisseurs ; listes cachées tant qu'elles sont vides.
  appareils = { melangeurs: base.appareils?.melangeurs ?? [], serveurs: base.appareils?.serveurs ?? [], convertisseurs: base.appareils?.convertisseurs ?? [] };
  const groupe = (libelle, liste) => (liste.length ? el('optgroup', { label: libelle }, liste.map((x) => el('option', { value: x.id }, x.nom))) : null);
  remplacer(formulaire.elements.sourceAppareil, el('option', { value: '' }, 'Autre source (saisie)'),
    groupe('Mélangeurs', appareils.melangeurs), groupe('Serveurs média', appareils.serveurs));
  document.getElementById('bloc-source-appareil').hidden = appareils.melangeurs.length + appareils.serveurs.length === 0;
  for (const select of formulaire.querySelectorAll('.liste-convertisseurs')) {
    remplacer(select, el('option', { value: '' }, 'Saisie libre'), appareils.convertisseurs.map((x) => el('option', { value: x.id }, x.nom)));
  }
  for (const bloc of formulaire.querySelectorAll('[data-base-convertisseurs]')) bloc.hidden = appareils.convertisseurs.length === 0;
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
