// Configuration en cours : les saisies des onglets Mur, Data, Canvas, Élec et Poids sont gardées dans
// IndexedDB à chaque changement et reviennent à la prochaine ouverture. Le parc actif est gardé à part.

import { lire, ecrire } from './stockage.js';
import { sourceEstModifiee, definirSourceModifiee } from './ecran-canvas.js';

const CLE = 'configuration';
const FORMULAIRES = ['form-mur', 'form-data', 'form-source', 'form-elec', 'form-poids'];
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

let minuterie = null;
function planifierSauvegarde() {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    const config = { version: 1, sourceModifiee: sourceEstModifiee(), formulaires: {} };
    for (const f of formulaires()) config.formulaires[f.id] = lireFormulaire(f);
    ecrire(CLE, config);
  }, 400);
}

// Remet les saisies gardées, onglet par onglet dans l'ordre de la chaîne Mur → Data → Canvas → Élec → Poids.
// Deux passes : certaines listes (processeurs, arrivées, bumpers) ne se remplissent qu'après le premier calcul.
export async function restaurerConfiguration() {
  const config = await lire(CLE);
  if (!config?.formulaires) return false;
  definirSourceModifiee(config.sourceModifiee);
  for (let passe = 0; passe < 2; passe += 1) {
    for (const f of formulaires()) {
      const valeurs = config.formulaires[f.id];
      if (!valeurs) continue;
      const garder = f.id === 'form-source' && !config.sourceModifiee ? (nom) => !CHAMPS_SOURCE.has(nom) : undefined;
      ecrireFormulaire(f, valeurs, garder);
      recalculer(f);
    }
  }
  return true;
}

// Réglages par défaut : chaque formulaire revient à son état d'origine, la source suit de nouveau le conseil.
export async function reglagesParDefaut() {
  definirSourceModifiee(false);
  // Le parc actif n'est pas une saisie : il reste tel quel.
  const parcs = [...document.querySelectorAll('.selecteur-parc')].map((s) => [s, s.value]);
  for (let passe = 0; passe < 2; passe += 1) {
    for (const f of formulaires()) {
      f.reset();
      for (const [select, valeur] of parcs) select.value = valeur;
      recalculer(f);
    }
  }
  clearTimeout(minuterie);
  await ecrire(CLE, null);
}

export function suivreConfiguration() {
  for (const f of formulaires()) {
    f.addEventListener('input', planifierSauvegarde);
    f.addEventListener('change', planifierSauvegarde);
  }
  document.getElementById('bouton-conseil')?.addEventListener('click', planifierSauvegarde);
}
