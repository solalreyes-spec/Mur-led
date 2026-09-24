// Affiche dans tests.html le résultat des 13 cas, des règles complémentaires,
// du contrôle des données et du banc de test.

import { CAS } from './cas.js';
import { REGLES } from './regles.js';
import { DONNEES } from './donnees.js';
import { BANC } from './banc.js';
import { executerCas } from './verif.js';
import { chargerFichiersAppli } from './fichiers.js';
import { el } from '../src/dom.js';

const LIBELLES = { reussi: 'Réussi', echec: 'Échec', erreur: 'Erreur', 'a-venir': 'À venir' };

function formater(valeur) {
  if (typeof valeur === 'number') return valeur.toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  if (typeof valeur === 'string') return `« ${valeur} »`;
  if (Array.isArray(valeur)) return `[${valeur.map(formater).join(' ; ')}]`;
  if (valeur === undefined) return 'non défini';
  return JSON.stringify(valeur);
}

function pluriel(n, singulier, plurielForme) {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

async function lireJson(chemin) {
  const reponse = await fetch(chemin, { cache: 'no-store' });
  if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
  return reponse.json();
}

async function chargerContexte() {
  const contexte = {};
  try {
    contexte.dalles = await lireJson('data/dalles.json');
  } catch (erreur) {
    contexte.erreurDalles = erreur.message;
  }
  try {
    contexte.processeurs = await lireJson('data/processeurs.json');
  } catch (erreur) {
    contexte.erreurProcesseurs = erreur.message;
  }
  try {
    contexte.connectique = await lireJson('data/connectique.json');
  } catch (erreur) {
    contexte.erreurConnectique = erreur.message;
  }
  try {
    contexte.regies = await lireJson('data/regies.json');
  } catch (erreur) {
    contexte.erreurRegies = erreur.message;
  }
  try {
    contexte.fichiers = await chargerFichiersAppli(async (chemin) => {
      const reponse = await fetch(chemin, { cache: 'no-store' });
      return reponse.ok ? reponse.text() : null;
    });
  } catch (erreur) {
    contexte.erreurFichiers = erreur.message;
  }
  return contexte;
}

function tableauControles(controles) {
  const lignes = controles.map((c) => el('tr', {},
    el('td', { class: c.ok ? 'ok' : 'ko' }, c.ok ? '✓' : '✗'),
    el('td', {}, c.libelle),
    el('td', { class: 'valeur' }, formater(c.obtenu)),
    el('td', { class: 'valeur' }, formater(c.attendu) + (c.tolerance !== undefined ? ` ± ${formater(c.tolerance)}` : '')),
  ));
  return el('div', { class: 'tableau-defilant' },
    el('table', { class: 'controles' },
      el('thead', {}, el('tr', {},
        el('th', {}, ''), el('th', {}, 'Contrôle'), el('th', {}, 'Obtenu'), el('th', {}, 'Attendu'))),
      el('tbody', {}, ...lignes)));
}

function carteCas(cas, resultat) {
  const estCasCdc = 'attendu' in cas;
  const details = el('details', { class: `cas cas-${resultat.statut}` });
  if (resultat.statut === 'echec' || resultat.statut === 'erreur') details.open = true;

  details.append(
    el('summary', {},
      el('span', { class: `badge badge-${resultat.statut}` }, LIBELLES[resultat.statut]),
      el('span', { class: 'cas-id' }, estCasCdc ? `Cas ${cas.id.split(' ')[0]}` : cas.id),
      el('span', { class: 'cas-titre' }, cas.titre),
      resultat.statut === 'a-venir' && cas.etape ? el('span', { class: 'cas-etape' }, `étape ${cas.etape}`) : null),
  );

  const corps = el('div', { class: 'cas-corps' });
  if (estCasCdc) {
    corps.append(el('dl', {},
      el('dt', {}, 'Données'), el('dd', {}, cas.donnees),
      el('dt', {}, 'Attendu'), el('dd', {}, cas.attendu),
      el('dt', {}, 'Source'), el('dd', {}, cas.source)));
  }
  if (resultat.erreur) corps.append(el('p', { class: 'cas-erreur-message' }, String(resultat.erreur)));
  if (resultat.controles.length > 0) corps.append(tableauControles(resultat.controles));
  details.append(corps);
  return el('li', {}, details);
}

function afficher(liste, conteneur, contexte) {
  const resultats = liste.map((cas) => {
    const resultat = executerCas(cas, contexte);
    conteneur.append(carteCas(cas, resultat));
    return resultat;
  });
  const compter = (statut) => resultats.filter((r) => r.statut === statut).length;
  return {
    total: liste.length,
    reussis: compter('reussi'),
    aVenir: compter('a-venir'),
    problemes: compter('echec') + compter('erreur'),
  };
}

const contexte = await chargerContexte();
const cas = afficher(CAS, document.getElementById('liste-cas'), contexte);
const regles = afficher(REGLES, document.getElementById('liste-regles'), contexte);
const donnees = afficher(DONNEES, document.getElementById('liste-donnees'), contexte);
const banc = afficher(BANC, document.getElementById('liste-banc'), contexte);
const problemes = cas.problemes + regles.problemes + donnees.problemes + banc.problemes;
const sur = (bilanSection) => `${bilanSection.reussis} sur ${bilanSection.total}`;

const bilan = document.getElementById('bilan');
bilan.className = `bilan ${problemes ? 'bilan-echec' : 'bilan-ok'}`;
bilan.dataset.problemes = String(problemes);
bilan.replaceChildren(
  problemes ? `✗ ${pluriel(problemes, 'test en échec', 'tests en échec')}` : '✓ Aucun test en échec',
  el('small', {},
    `Cas tests : ${pluriel(cas.reussis, 'réussi', 'réussis')} · ${cas.problemes} en échec · ${cas.aVenir} à venir. `
    + `Règles : ${sur(regles)}. Données : ${sur(donnees)}. Banc de test : ${sur(banc)}. `
    + `Lancé à ${new Date().toLocaleTimeString('fr-FR')}.`),
);
document.title = `${problemes ? '✗' : '✓'} Tests — Mur LED`;
