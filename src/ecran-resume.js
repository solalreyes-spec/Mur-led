// Carte « Résumé » de l'onglet Mur (étape 28, lot 28c, spec § 5) : le mur ouvert en un écran, une section par onglet
// avec son lien, les alertes graves et « Copier le résumé ». Le contenu vient de resumeDuMur et texteResume
// (src/reponse.js, fonctions pures) ; ici, la carte à l'écran et son repli, gardé sur l'appareil.

import { el, remplacer } from './dom.js';
import { lireRepli, garderRepli, texteResume } from './reponse.js';
import { stockageAppareil } from './reglages.js';

// Repli, préférence de l'appareil (spec § 4) : fermée la première fois (choix de l'utilisateur du 06/11/2026) ; jamais
// dans une presta, un export ni « Repartir des réglages par défaut ».
export const CLE_RESUME = 'mur-led-resume';
export const REPLI_RESUME = 'ferme';

const NOMS = { mur: 'Mur', data: 'Data', canvas: 'Canvas', elec: 'Élec', poids: 'Poids', materiel: 'Matériel', terrain: 'Terrain' };
const ONGLETS = ['data', 'canvas', 'elec', 'poids'];

// Ligne de titre (spec § 5.1 et § 7) : chaque « · » (et l'espace après « Résumé ») caché aux lecteurs d'écran, avec une
// virgule cachée à l'œil (on lit « Résumé, 1 × S8, 4 ports ») ; un morceau n'est jamais coupé.
function contenuChiffres(morceaux) {
  return morceaux.flatMap((m, i) => [
    el('span', { 'aria-hidden': 'true' }, i ? ' · ' : ' '),
    el('span', { class: 'cache-visuel' }, ', '),
    el('span', { class: m.grave ? 'resume-grave-titre' : 'resume-morceau' }, m.texte),
  ]);
}

// Lien vers l'onglet d'une section (« Data › ») ; Matériel et Terrain, écrans pleins, par un bouton quand l'appli le
// permet ; Mur, où est la carte, sans lien.
function lienSection(onglet, actions) {
  if (ONGLETS.includes(onglet)) return el('a', { class: 'resume-lien', href: `#${onglet}`, 'aria-label': `Ouvrir l'onglet ${NOMS[onglet]}` }, `${NOMS[onglet]} ›`);
  if (typeof actions[onglet] === 'function') {
    const bouton = el('button', { type: 'button', class: 'resume-lien', 'aria-label': `Ouvrir l'écran ${NOMS[onglet]}` }, `${NOMS[onglet]} ›`);
    bouton.addEventListener('click', () => actions[onglet]());
    return bouton;
  }
  return null;
}

const info = (libelle, valeur) => el('p', { class: 'resume-info' }, libelle ? el('span', { class: 'resume-libelle' }, `${libelle} :`) : null, libelle ? ' ' : null, valeur);
const entete = (nom, lien, indicatif = false) => el('div', { class: 'resume-entete' },
  el('p', { class: 'resume-nom', role: 'heading', 'aria-level': '3' }, nom, indicatif ? el('span', { class: 'resume-indicatif' }, ', indicatif') : null),
  lien);

function section(s, actions) {
  const lignes = s.valide ? s.lignes.map((l) => info(l.libelle, l.valeur)) : [el('p', { class: 'resume-info resume-doux' }, 'Calcul non valide, ouvre l\'onglet.')];
  return el('div', { class: 'resume-section', 'data-onglet': s.onglet }, entete(NOMS[s.onglet] ?? s.titre, lienSection(s.onglet, actions), s.indicatif), ...lignes);
}

function sectionGraves(graves) {
  if (!graves.length) return el('div', { class: 'resume-section resume-alertes' }, entete('Alertes graves', null), info('Alertes graves', 'aucune'));
  return el('div', { class: 'resume-section resume-alertes' }, entete('Alertes graves', null), ...graves.map((g) => el('div', { class: 'resume-grave-ligne' },
    el('p', { class: 'resume-grave-texte' }, el('span', { class: 'resume-grave' }, `${g.libelle} :`), ' ', g.valeur),
    el('a', { class: 'resume-lien', href: `#${g.onglet}`, 'aria-label': `Ouvrir l'onglet ${NOMS[g.onglet]}` }, `${NOMS[g.onglet]} ›`))));
}

// `details` : la carte (details.resume-mur) ; `stockage` : celui de l'appareil (un stockage d'essai dans les tests) ;
// `copier(texte)` : copie dans le presse-papiers, vrai si le texte est parti ; `actions` : { materiel, terrain } pour
// ouvrir ces écrans. Rend { afficher(resume, { presta, mur }) }.
export function monterResume(details, { stockage = stockageAppareil(), copier = async () => false, actions = {} } = {}) {
  const resume = details.querySelector(':scope > summary');
  const chiffres = resume.querySelector('.resume-chiffres');
  const contenu = details.querySelector(':scope > .resume-contenu');
  details.open = lireRepli(stockage, CLE_RESUME, REPLI_RESUME) === 'ouvert';
  // État écrit sur un appui de l'utilisateur seulement (clic, Entrée, Espace), jamais sur « toggle » (§ 4, constat 7) ;
  // le clic précède le changement : l'état gardé est l'inverse.
  resume.addEventListener('click', (evenement) => {
    if (evenement.defaultPrevented) return;
    garderRepli(stockage, CLE_RESUME, details.open ? 'ferme' : 'ouvert');
  });
  return {
    afficher(r, contexte = {}) {
      remplacer(chiffres, contenuChiffres(r.titre));
      // Copie (spec § 5.4) : son propre écouteur, posé à chaque construction, sans data-copier (hors « Tout copier »).
      const etat = el('span', { class: 'resume-etat', 'aria-live': 'polite' });
      const bouton = el('button', { type: 'button', class: 'bouton bouton-petit', 'data-icone': 'copier' }, 'Copier le résumé');
      bouton.addEventListener('click', async () => {
        const ok = await copier(texteResume(r, contexte));
        etat.textContent = ok ? 'Résumé copié.' : 'Copie impossible sur cet appareil.';
        clearTimeout(etat.minuterie);
        etat.minuterie = setTimeout(() => { etat.textContent = ''; }, 4000);
      });
      const copie = el('div', { class: 'resume-copie' }, bouton, etat);
      if (!r.valide) {
        remplacer(contenu, el('p', { class: 'resume-non-valide' }, 'Mur non valide : corrige-le ci-dessous.'), copie);
        return;
      }
      remplacer(contenu,
        ...r.sections.map((s) => section(s, actions)),
        sectionGraves(r.graves),
        el('p', { class: 'resume-note' }, 'Valeurs et sources dans chaque onglet.'),
        copie);
    },
  };
}
