// Configuration en cours : les saisies des onglets Mur, Data, Canvas, Élec, Poids et Schéma sont gardées dans
// IndexedDB à chaque changement et reviennent à la prochaine ouverture. Le parc actif est gardé à part.
// Prestas (étape 10b) : l'appli dit où garder les saisies (le mur ouvert, `definirSauvegarde`) et donne celles du mur
// à ouvrir (`appliquerConfiguration`) ; sans elle, la clé « configuration » d'avant.

import { lire, ecrire } from './stockage.js';
import { sourceEstModifiee, definirSourceModifiee } from './ecran-canvas.js';

const CLE = 'configuration';
// Version 2 : défaut Brompton passé à 12 bits ; la profondeur réseau gardée par une version précédente (souvent
// l'ancien défaut, 10 bits) n'est pas reprise.
const VERSION = 2;
const FORMULAIRES = ['form-mur', 'form-data', 'form-source', 'form-elec', 'form-distribution', 'form-poids', 'form-schema', 'form-mire'];
const IGNORES = new Set(['parc']);
// Champs de la source : restaurés seulement si la source a été modifiée à la main.
const CHAMPS_SOURCE = new Set(['largeurPx', 'hauteurPx', 'frequenceHz', 'liaison']);

const formulaires = () => FORMULAIRES.map((id) => document.getElementById(id)).filter(Boolean);

function lireFormulaire(formulaire) {
  const valeurs = {};
  for (const champ of formulaire.elements) {
    if (!champ.name || IGNORES.has(champ.name) || ['button', 'submit', 'file'].includes(champ.type)) continue;
    if (champ.type === 'checkbox') valeurs[champ.name] = champ.checked;
    else if (champ.type === 'radio') {
      if (champ.checked) valeurs[champ.name] = champ.value;
    } else valeurs[champ.name] = champ.value;
  }
  return valeurs;
}

function ecrireFormulaire(formulaire, valeurs, garder = () => true) {
  for (const champ of formulaire.elements) {
    if (!champ.name || IGNORES.has(champ.name) || !(champ.name in valeurs) || !garder(champ.name)) continue;
    const valeur = valeurs[champ.name];
    if (champ.type === 'checkbox') champ.checked = valeur === true;
    else if (champ.type === 'radio') champ.checked = champ.value === valeur;
    else if (champ.tagName === 'SELECT') {
      if ([...champ.options].some((o) => o.value === valeur)) champ.value = valeur;
    } else champ.value = valeur;
  }
}

// Recalcule un onglet comme après une saisie (les écouteurs sont posés sur le formulaire).
const recalculer = (formulaire) => formulaire.dispatchEvent(new Event('change'));

// Saisies de tous les onglets, telles qu'elles sont gardées.
export function lireSaisies() {
  const config = { version: VERSION, sourceModifiee: sourceEstModifiee(), formulaires: {} };
  for (const f of formulaires()) config.formulaires[f.id] = lireFormulaire(f);
  return config;
}

let sauvegarde = (config) => ecrire(CLE, config);
export function definirSauvegarde(f) {
  sauvegarde = f;
}

let minuterie = null;
function planifierSauvegarde() {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    minuterie = null;
    sauvegarde(lireSaisies());
  }, 400);
}

// Sauvegarde en attente faite tout de suite (avant de changer de mur).
export function sauverMaintenant() {
  if (minuterie === null) return;
  clearTimeout(minuterie);
  minuterie = null;
  sauvegarde(lireSaisies());
}

// Valeurs de départ de chaque formulaire, champs cachés compris (zones, lots cochés, processeur retenu), relevées au
// lancement avant toute reprise : « reset » ne remet pas les champs cachés.
let defauts = null;
export function releverDefauts() {
  defauts = Object.fromEntries(formulaires().map((f) => [f.id, lireFormulaire(f)]));
}

// Remet les saisies gardées, onglet par onglet dans l'ordre de la chaîne Mur → Data → Canvas → Élec → Poids.
// Deux passes : certaines listes (processeurs, arrivées, bumpers) ne se remplissent qu'après le premier calcul.
export async function restaurerConfiguration(donnee = undefined) {
  let config = donnee === undefined ? await lire(CLE) : donnee;
  if (!config?.formulaires) return false;
  definirSourceModifiee(config.sourceModifiee);
  // Étape 12b : la distance armoire–mur est passée du Schéma à la distribution d'Élec ; une saisie gardée avant
  // (v27 et avant) la retrouve là.
  const schema = config.formulaires['form-schema'];
  if (schema?.distanceArmoireM && !config.formulaires['form-distribution']) {
    config = { ...config, formulaires: { ...config.formulaires, 'form-distribution': { distanceArmoireM: schema.distanceArmoireM } } };
  }
  for (let passe = 0; passe < 2; passe += 1) {
    for (const f of formulaires()) {
      const valeurs = config.formulaires[f.id];
      if (!valeurs) continue;
      let garder;
      if (f.id === 'form-source' && !config.sourceModifiee) garder = (nom) => !CHAMPS_SOURCE.has(nom);
      if (f.id === 'form-data' && (config.version ?? 1) < 2) garder = (nom) => nom !== 'bits';
      ecrireFormulaire(f, valeurs, garder);
      recalculer(f);
    }
  }
  return true;
}

// Réglages par défaut : chaque formulaire revient à son état d'origine, la source suit de nouveau le conseil.
function remettreDefauts() {
  definirSourceModifiee(false);
  // Le parc actif n'est pas une saisie : il reste tel quel.
  const parcs = [...document.querySelectorAll('.selecteur-parc')].map((s) => [s, s.value]);
  for (let passe = 0; passe < 2; passe += 1) {
    for (const f of formulaires()) {
      f.reset();
      if (defauts?.[f.id]) ecrireFormulaire(f, defauts[f.id]);
      for (const [select, valeur] of parcs) select.value = valeur;
      recalculer(f);
    }
  }
  clearTimeout(minuterie);
  minuterie = null;
}

export async function reglagesParDefaut() {
  remettreDefauts();
  await sauvegarde(null);
}

// Saisies d'un autre mur (prestas) : réglages par défaut, puis ses saisies ; null : réglages par défaut seulement.
// Rien n'est enregistré ici : le mur garde ses saisies telles quelles.
export async function appliquerConfiguration(config) {
  remettreDefauts();
  if (config?.formulaires) await restaurerConfiguration(config);
  clearTimeout(minuterie);
  minuterie = null;
}

export function suivreConfiguration() {
  for (const f of formulaires()) {
    f.addEventListener('input', planifierSauvegarde);
    f.addEventListener('change', planifierSauvegarde);
  }
  document.getElementById('bouton-conseil')?.addEventListener('click', planifierSauvegarde);
}
