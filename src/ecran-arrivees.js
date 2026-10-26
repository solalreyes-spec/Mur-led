// Onglet Élec, plusieurs arrivées (étape 21b) : carte de saisie d'une arrivée ajoutée et section « Arrivées » des
// résultats (une carte par arrivée, puis l'arrivée de chaque ligne, modifiable). Aucune règle de calcul ici : la
// répartition vient de calculs.js (repartirArrivees). Éléments construits sans état global, montés par ecran-elec.js.

import { ARRIVEES, texteNumeros } from './calculs.js';
import { nombre, nombreCourt, lireNombre } from './format.js';
import { el } from './dom.js';
import { barreCharge } from './look.js';

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const watts = (w) => `${nombreCourt(w, 1)} W`;
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const vide = (x) => String(x ?? '').trim() === '';

// Saisie d'une arrivée ajoutée (champ caché `autresArrivees`, textes tels que tapés) vers l'entrée de lireArrivees.
// Une saisie illisible reste NaN : le calcul la refuse en nommant l'arrivée.
export function versArrivee(s) {
  const entier = (x) => (vide(x) ? null : lireNombre(x));
  const intensiteA = s.intensite === 'libre' ? lireNombre(s.libre) : Number(s.intensite);
  const boitierPermis = s.type === 'tri' && s.intensite === '32';
  return {
    id: s.id,
    type: s.type,
    intensiteA,
    branchement: boitierPermis && s.branchement === 'boitier' ? 'boitier' : 'armoire',
    distanceM: vide(s.distance) ? null : lireNombre(s.distance),
    materiel: { prises16: entier(s.prises16), sortiesP17: entier(s.sortiesP17) },
  };
}

// Nouvelle saisie : 32 A tri en direct sur un boîtier, le cas vu en presta (réponse 3 de la spec).
export const nouvelleSaisieArrivee = (id) => ({ id, type: 'tri', intensite: '32', libre: '', branchement: 'boitier', distance: '', prises16: '', sortiesP17: '' });

// Carte d'une arrivée ajoutée : champs sans nom (la saisie passe par `surChange`, gardée dans le champ caché).
export function carteSaisieArrivee(saisie, { numero, choixMateriel = false, surChange, surRetirer }) {
  const prefixe = `arrivee-${saisie.id}`;
  const champ = (cle, libelle, controle, attributs = {}) => el('div', { class: 'champ', ...attributs },
    el('label', { for: `${prefixe}-${cle}` }, libelle), controle);
  const liste = (cle, options, valeur) => el('select', { id: `${prefixe}-${cle}`, 'data-champ': cle },
    options.map(([v, t]) => el('option', { value: v, selected: v === valeur ? '' : null }, t)));
  const texte = (cle, valeur, attributs = {}) => el('input', { id: `${prefixe}-${cle}`, 'data-champ': cle, autocomplete: 'off', value: valeur ?? '', ...attributs });

  const type = liste('type', [['tri', 'Tri'], ['mono', 'Mono']], saisie.type);
  const intensites = ARRIVEES[saisie.type] ?? ARRIVEES.tri;
  const intensite = liste('intensite', [...intensites.map((a) => [String(a), `${a} A ${saisie.type}`]), ['libre', 'Autre valeur…']], saisie.intensite);
  const boitierPermis = saisie.type === 'tri' && saisie.intensite === '32';
  const armoire = !(boitierPermis && saisie.branchement === 'boitier');
  const carte = el('div', { class: 'arrivee-ajoutee', 'data-arrivee': saisie.id },
    el('h4', {}, `Arrivée ${numero}`),
    el('div', { class: 'paire' },
      champ('type', 'Type', type),
      champ('intensite', 'Intensité', intensite)),
    champ('libre', 'Autre valeur (A)', texte('libre', saisie.libre, { inputmode: 'decimal', placeholder: 'Powerlock, groupe…' }), { hidden: saisie.intensite === 'libre' ? null : '' }),
    champ('branchement', 'Branchement', liste('branchement', [['armoire', 'Armoire'], ['boitier', 'En direct sur un boîtier 32 A tri']], saisie.branchement),
      { hidden: boitierPermis ? null : '' }),
    champ('distance', 'Distance au mur (m), facultatif : de l\'arrivée au coin de départ du câblage', texte('distance', saisie.distance, { inputmode: 'decimal', placeholder: 'non mesurée' })),
    el('div', { class: 'paire', hidden: choixMateriel && armoire ? null : '' },
      champ('prises16', 'Prises 16 A libres sur son armoire', texte('prises16', saisie.prises16, { inputmode: 'numeric', placeholder: 'non précisé' })),
      champ('sortiesP17', 'Sorties P17 32 A tri libres sur son armoire', texte('sortiesP17', saisie.sortiesP17, { inputmode: 'numeric', placeholder: 'non précisé' }))));
  const retirer = el('button', { type: 'button', class: 'bouton bouton-danger', 'data-icone': 'revenir' }, 'Retirer l\'arrivée');
  retirer.addEventListener('click', () => surRetirer());
  carte.append(el('div', { class: 'actions' }, retirer));
  // Chaque frappe renvoie la saisie entière ; le changement de type remet l'intensité de la nouvelle liste. Type,
  // intensité et branchement changent les champs montrés : `redessiner`.
  const courante = { ...saisie };
  const lire = (evenement) => {
    const cle = evenement.target.dataset.champ;
    if (!cle) return;
    courante[cle] = evenement.target.value;
    if (cle === 'type' && !(ARRIVEES[courante.type] ?? []).map(String).includes(courante.intensite) && courante.intensite !== 'libre') {
      courante.intensite = String(ARRIVEES[courante.type][1] ?? ARRIVEES[courante.type][0]);
    }
    surChange({ ...courante }, { redessiner: ['type', 'intensite', 'branchement'].includes(cle) });
  };
  carte.addEventListener('input', lire);
  carte.addEventListener('change', lire);
  return carte;
}

function tablePhases(a) {
  const lignes = a.phases.map((p) => {
    const depasse = p.puissanceW > a.capaciteW;
    return el('tr', { class: depasse ? 'limite' : null },
      el('th', { scope: 'row' }, p.numero ? `L${p.numero}` : 'Mono'),
      el('td', { class: 'nombre' }, nombre(p.lignes)),
      el('td', {}, watts(p.puissanceW)),
      el('td', {}, `${nombreCourt(p.intensiteA, 1)} A`),
      el('td', { class: depasse ? 'ko' : 'ok' }, depasse ? '✗' : '✓'),
      el('td', { class: 'cellule-barre' }, barreCharge(p.puissanceW / a.capaciteW)));
  });
  return el('div', { class: 'tableau-defilant' },
    el('table', { class: 'table-donnees table-charges' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Phase'), el('th', {}, 'Lignes'), el('th', {}, 'Charge'), el('th', {}, 'Intensité'), el('th', {}, ''), el('th', {}, ''))),
      el('tbody', {}, lignes)));
}

function carteArrivee(a) {
  const capacite = `${watts(a.capaciteW)} utiles${a.type === 'tri' ? ' par phase' : ''}`;
  return el('div', { class: 'carte-arrivee' },
    el('h4', {}, `${a.repere} · ${a.libelle}`),
    a.refus ? alerte(a.refus, 'alerte-erreur') : null,
    el('p', { class: 'source' }, `${capacite}, `
      + (a.lignes.length ? `${a.lignes.length > 1 ? 'lignes' : 'ligne'} ${texteNumeros(a.lignes)}, ${watts(a.puissanceW)}`
        + `${a.phases.length > 1 ? `, écart entre phases ${nombreCourt(a.ecartPourcent, 0)} %` : ''}.` : 'aucune ligne.')),
    a.lignes.length ? tablePhases(a) : null);
}

// Section « Arrivées » : `rep` (variante réécrite par repartirArrivees, choix à la main compris), `conseil` (la même
// sans choix à la main, pour « Conseil (A1) »). `surChoix(premiereDalle, id)` : '' pour revenir au conseil d'une ligne.
// `choixSaisis` : des choix à la main sont gardés (même oubliés), « Revenir au conseil » les efface.
export function sectionArrivees(rep, { conseil = rep, surChoix, surConseil, choixSaisis = null }) {
  const conseilDe = new Map((conseil?.lignesDetail ?? []).map((l) => [l.numero, l.repere]));
  const repereDe = new Map(rep.parArrivee.map((a) => [a.id, a.repere]));
  const lignes = rep.lignesDetail.map((l) => {
    const choix = el('select', { 'aria-label': `Arrivée de la ligne ${l.numero}`, class: 'choix-arrivee' },
      // « Conseil (A1) » : l'arrivée de la ligne quand elle n'est pas choisie à la main, sinon celle du conseil seul.
      el('option', { value: '', selected: l.manuel ? null : '' }, `Conseil (${(l.manuel ? conseilDe.get(l.numero) : l.repere) ?? '—'})`),
      rep.parArrivee.filter((a) => !a.refus).map((a) => el('option', { value: a.id, selected: l.manuel && l.arrivee === a.id ? '' : null }, a.repere)));
    choix.addEventListener('change', () => surChoix(l.dalles[0], choix.value));
    return el('tr', { class: l.placee ? null : 'limite' },
      el('th', { scope: 'row' }, `${l.numero}`, el('span', { class: 'source-ligne' }, `${l.dalles[0]} · ${watts(l.puissanceW)}`)),
      el('td', {}, l.placee ? `${repereDe.get(l.arrivee)}${l.phase ? ` L${l.phase}` : ''}` : 'sans place'),
      el('td', {}, choix));
  });
  const manuel = choixSaisis ?? rep.lignesDetail.some((l) => l.manuel);
  let revenir = null;
  if (manuel) {
    revenir = el('button', { type: 'button', class: 'bouton bouton-discret revenir-conseil', 'data-icone': 'revenir' }, 'Revenir au conseil');
    revenir.addEventListener('click', () => surConseil());
  }
  return el('section', { class: 'bloc-resultats section-arrivees' },
    el('h3', {}, 'Arrivées'),
    el('p', { class: 'source' }, `${pluriel(rep.parArrivee.length, 'arrivée', 'arrivées')} : avec plusieurs arrivées, les phases se lisent arrivée par arrivée. `
      + 'Une phase ne prête jamais sa puissance à une autre, une arrivée non plus.'),
    rep.refus.map((t) => alerte(t, 'alerte-erreur')),
    rep.alertes.filter((t) => /^Arrivée \d/.test(t)).map((t) => alerte(t)),
    rep.notes.map((t) => alerte(t, 'alerte-info')),
    rep.parArrivee.map((a) => carteArrivee(a)),
    el('h4', {}, 'Arrivée de chaque ligne'),
    el('p', { class: 'note' }, 'Conseil : la plus grosse arrivée d\'abord, les lignes voisines ensemble. Choisis une autre arrivée pour déplacer une ligne.'),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees lignes-arrivees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Ligne'), el('th', {}, 'Sur'), el('th', {}, 'Arrivée'))),
        el('tbody', {}, lignes))),
    revenir ? el('div', { class: 'actions' }, revenir) : null);
}
