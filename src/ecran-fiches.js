// Écran plein « Fiches » (étape 14c) : fiche presta par métier (rigger, électricien, régie vidéo, chef de projet),
// ouverte depuis la carte de la presta dans Prestas. Choix du métier, aperçu, « Imprimer ou PDF », « Copier »,
// « Partager ». L'écran affiche la fiche que l'appli lui donne (fiches-metier.js) et appelle ses actions ; il ne calcule
// rien et ne touche ni au stockage ni aux saisies. `elementFiche` sert aussi à la page imprimée (sans bouton).

import { el, remplacer } from './dom.js';
import { METIERS } from './fiches-metier.js';

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim(), role: genre === 'alerte-erreur' ? 'alert' : null }, texte);

// Une ligne de tableau : « libellé : valeur », un sous-titre sur toute la largeur, ou un texte seul.
function ligneTableau(l) {
  if (l.titre) return el('tr', { class: 'fi-sous-titre' }, el('th', { colspan: '2', scope: 'colgroup' }, l.titre));
  if (!l.libelle) return el('tr', {}, el('td', { colspan: '2' }, l.valeur));
  return el('tr', {}, el('th', { scope: 'row' }, l.libelle), el('td', {}, l.valeur));
}
const tableau = (lignes, classe = 'fi-table') => el('table', { class: classe }, el('tbody', {}, lignes.map(ligneTableau)));

// La fiche en tableaux : titre, rappel, en-tête, un bloc par mur, total de matériel (chef de projet). `ouvrirMur(murId)`
// ajoute « Ouvrir ce mur » sous un mur jamais ouvert ; sans elle (page imprimée), aucun bouton.
export function elementFiche(fiche, { ouvrirMur = null } = {}) {
  return el('article', { class: 'fi-fiche' },
    el('h3', { class: 'fi-titre' }, fiche.titre),
    el('p', { class: 'fi-rappel' }, fiche.rappel),
    tableau(fiche.entete.map(([libelle, valeur]) => ({ libelle, valeur })), 'fi-table fi-entete'),
    fiche.blocs.map((b) => el('section', { class: 'fi-mur', 'aria-label': b.titre },
      el('h4', {}, b.titre),
      b.date ? el('p', { class: 'fi-date' }, `Textes du ${b.date}`) : null,
      b.manque ? alerte(b.manque, 'alerte-info') : tableau(b.lignes),
      b.manque && ouvrirMur && b.murId ? boutonSimple('Ouvrir ce mur', () => ouvrirMur(b.murId)) : null)),
    fiche.fin ? el('section', { class: 'fi-mur fi-fin', 'aria-label': fiche.fin.titre }, el('h4', {}, fiche.fin.titre), tableau(fiche.fin.lignes)) : null);
}

function boutonSimple(texte, surClic, attributs = {}) {
  const b = el('button', { type: 'button', class: 'bouton', ...attributs }, texte);
  b.addEventListener('click', surClic);
  return b;
}

// `actions` : choisirMetier(metier), ouvrirMur(prestaId, murId), imprimer(), copier() (renvoie true si copié),
// partager() (renvoie 'partage', 'annule' ou 'telechargement') ; chacune peut lever une erreur, affichée dans l'écran.
export function monterFiches(racine, { actions }) {
  let vue = null;
  const zoneErreur = el('div', { class: 'fi-erreur', 'aria-live': 'polite' });
  const note = el('p', { class: 'mat-note fi-note', 'aria-live': 'polite' });

  async function executer(appel) {
    remplacer(zoneErreur);
    try {
      return await appel();
    } catch (erreur) {
      remplacer(zoneErreur, alerte(erreur.message, 'alerte-erreur'));
      return null;
    }
  }

  function choixMetier() {
    return el('fieldset', { class: 'segmente fi-metiers' },
      el('legend', {}, 'Métier'),
      el('div', { class: 'segments' }, METIERS.map((m) => {
        const radio = el('input', { type: 'radio', name: 'metier', value: m.id, checked: m.id === vue.metier ? '' : null });
        radio.addEventListener('change', () => { if (radio.checked) executer(() => actions.choisirMetier(m.id)); });
        return el('label', {}, radio, el('span', {}, m.nom));
      })));
  }

  function dessiner() {
    const { presta, fiche } = vue;
    remplacer(note);
    remplacer(racine,
      zoneErreur,
      el('div', { class: 'mat-tete' }, el('p', { class: 'pr-sur-titre' }, 'Fiche presta'), el('h3', { class: 'mat-nom-mur' }, presta.nom)),
      choixMetier(),
      el('div', { class: 'pr-boutons fi-actions' },
        boutonSimple('Imprimer ou PDF', () => executer(() => actions.imprimer()), { class: 'bouton bouton-principal', 'data-icone': 'imprimer' }),
        boutonSimple('Copier', () => executer(async () => {
          note.textContent = (await actions.copier()) ? 'Fiche copiée.' : 'Copie impossible sur cet appareil.';
        }), { 'data-icone': 'copier' }),
        boutonSimple('Partager', () => executer(async () => {
          const mode = await actions.partager();
          note.textContent = mode === 'telechargement' ? 'Fichier enregistré dans Fichiers (Téléchargements).' : '';
        }), { 'data-icone': 'partager' }),
        note),
      elementFiche(fiche, { ouvrirMur: (murId) => executer(() => actions.ouvrirMur(presta.id, murId)) }));
  }

  return {
    // `fiche` : ficheMetier (fiches-metier.js) ; `metier` : le métier choisi.
    afficher({ presta, fiche, metier }) {
      const memeVue = vue?.presta.id === presta.id && vue.metier === metier;
      const defilement = memeVue ? racine.scrollTop : 0;
      vue = { presta, fiche, metier };
      remplacer(zoneErreur);
      dessiner();
      racine.scrollTop = defilement;
    },
  };
}
