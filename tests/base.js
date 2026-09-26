// Accès aux bases (data/dalles.json et data/processeurs.json) lues une seule fois
// par la page de tests ou par node.test.js, puis passées dans `contexte`.

import * as calculs from '../src/calculs.js';

export function baseDalles(contexte) {
  if (!contexte?.dalles) throw new Error(`data/dalles.json non chargé${contexte?.erreurDalles ? ` : ${contexte.erreurDalles}` : ''}`);
  return contexte.dalles;
}

export function baseProcesseurs(contexte) {
  if (!contexte?.processeurs) {
    throw new Error(`data/processeurs.json non chargé${contexte?.erreurProcesseurs ? ` : ${contexte.erreurProcesseurs}` : ''}`);
  }
  return contexte.processeurs;
}

export function dalleDeBase(contexte, id) {
  const base = baseDalles(contexte);
  const fiche = [...base.dalles, ...base.gabarits].find((f) => f.id === id);
  if (!fiche) throw new Error(`Dalle ${id} absente de data/dalles.json`);
  return calculs.resoudreFiche(fiche, base.sources);
}

export function processeurDeBase(contexte, id) {
  const base = baseProcesseurs(contexte);
  const fiche = base.processeurs.find((p) => p.id === id);
  if (!fiche) throw new Error(`Processeur ${id} absent de data/processeurs.json`);
  return calculs.resoudreFiche(fiche, base.sources);
}

export function baseConnectique(contexte) {
  if (!contexte?.connectique) {
    throw new Error(`data/connectique.json non chargé${contexte?.erreurConnectique ? ` : ${contexte.erreurConnectique}` : ''}`);
  }
  return contexte.connectique;
}

// Toutes les liaisons résolues (valeurs simples et sources), comme les utilise l'appli.
export function liaisonsDeBase(contexte) {
  const base = baseConnectique(contexte);
  return base.liaisons.map((l) => calculs.resoudreFiche(l, base.sources));
}

export function baseRegies(contexte) {
  if (!contexte?.regies) throw new Error(`data/regies.json non chargé${contexte?.erreurRegies ? ` : ${contexte.erreurRegies}` : ''}`);
  return contexte.regies;
}

export function regieDeBase(contexte, id) {
  const base = baseRegies(contexte);
  const fiche = base.regies.find((r) => r.id === id);
  if (!fiche) throw new Error(`Régie ${id} absente de data/regies.json`);
  return calculs.resoudreFiche(fiche, base.sources);
}

// Bumpers et barres de data/dalles.json, résolus.
export function bumperDeBase(contexte, id) {
  const base = baseDalles(contexte);
  const fiche = (base.bumpers ?? []).find((b) => b.id === id);
  if (!fiche) throw new Error(`Bumper ${id} absent de data/dalles.json`);
  return calculs.resoudreFiche(fiche, base.sources);
}

// Appareils en amont et en aval (étape Pf3), un fichier par famille.
export function baseAppareils(contexte) {
  if (!contexte?.appareils) throw new Error(`fichiers des appareils non chargés${contexte?.erreurAppareils ? ` : ${contexte.erreurAppareils}` : ''}`);
  return contexte.appareils;
}
