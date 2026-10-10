// Écran plein « Forme de la zone » (étape 9b4) : grille de la zone vue
// de face, une case par place (rangée 1 en haut, rangée de demi-dalles comprise) ; un appui retire ou remet une dalle,
// en mode « Glisser » un glissé peint les cases traversées ; décalage d'une colonne par son en-tête ; « Tout remettre ».
// La saisie suit par les fonctions pures de zones.js ; `surChange(zone)` à chaque modification.

import { el } from './dom.js';
import { lireNombre } from './format.js';
import { basculerDalle, peindreDalles, decalerColonne, remettreForme, compteForme } from './zones.js';

const etats = new WeakMap();

// Types des rangées de la grille, comme le calcul : demi-dalles en haut ou en bas.
function typesRangees(z) {
  const types = Array(z.rangees).fill('entiere');
  if (z.rangeeDemi) {
    if (z.positionDemi === 'haut') types.unshift('demi');
    else types.push('demi');
  }
  return types;
}

// Glissé en mode « Glisser » : la case passe dans l'état choisi au début du glissé.
export function peindreSur(ecran, cellule) {
  const etat = etats.get(ecran);
  if (!etat?.peinture || !cellule?.classList?.contains('case-forme')) return;
  const position = [Number(cellule.dataset.colonne), Number(cellule.dataset.rangee)];
  if (etat.peinture.vues.has(position.join(','))) return;
  etat.peinture.vues.add(position.join(','));
  etat.appliquer(peindreDalles(etat.saisie(), 0, [position], etat.peinture.absente));
}

export function ouvrirForme({ zone, surChange = () => {}, surFermer = () => {} }) {
  let z = { ...zone };
  let colonneDecalage = null;
  const titreId = `forme-titre-${Math.random().toString(36).slice(2, 8)}`;
  const compte = el('p', { class: 'compte-forme', role: 'status' });
  const grille = el('div', { class: 'grille-forme', 'data-mode': 'appuyer' });
  const decalage = el('div', { class: 'decalage-forme' });
  const ecran = el('div', { class: 'montage forme', 'data-famille': 'image', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titreId },
    el('header', { class: 'montage-entete' },
      el('div', { class: 'montage-haut' },
        el('p', { class: 'montage-sur-titre' }, 'Forme de la zone'),
        el('div', { class: 'montage-commandes' },
          el('button', { type: 'button', class: 'bouton', 'data-action': 'remettre' }, 'Tout remettre'),
          el('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'fermer' }, 'Retour'))),
      el('div', { class: 'montage-ligne-titre' }, el('h2', { id: titreId }, `Forme de ${zone.nom}`)),
      compte,
      el('fieldset', { class: 'segmente mode-forme' },
        el('legend', {}, 'Au doigt'),
        el('div', { class: 'segments' },
          el('label', {}, el('input', { type: 'radio', name: 'modeForme', value: 'appuyer', checked: '' }), el('span', {}, 'Appuyer')),
          el('label', {}, el('input', { type: 'radio', name: 'modeForme', value: 'glisser' }), el('span', {}, 'Glisser pour peindre')))),
      el('p', { class: 'note' }, 'Vue de face, rangée 1 en haut. Une case en pointillés : dalle absente. Appuie sur l\'en-tête d\'une colonne pour la décaler vers le haut.'),
      decalage),
    el('div', { class: 'grille-forme-cadre' }, grille));

  const saisie = () => ({ zones: [z] });
  const dessiner = () => {
    const types = typesRangees(z);
    const absentes = new Set((z.absentes ?? []).map(([c, r]) => `${c},${r}`));
    const { dalles, places } = compteForme(z);
    compte.textContent = `${dalles} ${dalles > 1 ? 'dalles' : 'dalle'} sur ${places}`;
    grille.style.gridTemplateColumns = `repeat(${z.colonnes}, var(--cible))`;
    const entetes = Array.from({ length: z.colonnes }, (_, j) => {
      const mm = z.decalagesMm?.[j] ?? 0;
      return el('button', { type: 'button', class: 'entete-colonne', 'data-colonne': String(j + 1), 'aria-label': `Colonne ${j + 1}, décalage ${mm} mm` },
        `C${j + 1}`, mm ? el('span', { class: 'decalage-colonne' }, `↑${mm}`) : null);
    });
    const cases = types.flatMap((type, r) => Array.from({ length: z.colonnes }, (_, j) => {
      const presente = !absentes.has(`${j + 1},${r + 1}`);
      return el('button', {
        type: 'button', class: 'case-forme', 'data-colonne': String(j + 1), 'data-rangee': String(r + 1), 'data-type': type,
        'aria-pressed': presente ? 'true' : 'false',
        'aria-label': `${type === 'demi' ? 'Demi-dalle' : 'Dalle'} C${j + 1} R${r + 1}, ${presente ? 'présente' : 'absente'}`,
      }, type === 'demi' ? `½ C${j + 1}` : `C${j + 1} R${r + 1}`);
    }));
    grille.replaceChildren(...entetes, ...cases);
    if (colonneDecalage) {
      const id = `${titreId}-decalage`;
      decalage.replaceChildren(el('div', { class: 'champ' },
        el('label', { for: id }, `Décalage de la colonne ${colonneDecalage} vers le haut (mm)`,
          el('input', { id, name: 'decalageColonne', inputmode: 'decimal', autocomplete: 'off', value: String(z.decalagesMm?.[colonneDecalage - 1] ?? 0) }))));
    } else decalage.replaceChildren();
  };
  const appliquer = (nouvelle, redessiner = true) => {
    [z] = nouvelle.zones;
    if (redessiner) dessiner();
    surChange(z);
  };
  const etat = { saisie, appliquer, peinture: null };
  etats.set(ecran, etat);

  let appui = null;
  const mode = () => grille.dataset.mode;
  grille.addEventListener('pointerdown', (evenement) => {
    const cellule = evenement.target.closest('.case-forme');
    if (!cellule) return;
    if (mode() === 'glisser') {
      etat.peinture = { absente: cellule.getAttribute('aria-pressed') === 'true', vues: new Set() };
      peindreSur(ecran, cellule);
    } else appui = cellule;
  });
  grille.addEventListener('pointermove', (evenement) => {
    if (!etat.peinture) return;
    peindreSur(ecran, document.elementFromPoint(evenement.clientX, evenement.clientY));
  });
  const finir = (evenement) => {
    const cellule = evenement.target.closest?.('.case-forme');
    if (appui && cellule && cellule === appui) appliquer(basculerDalle(saisie(), 0, Number(cellule.dataset.colonne), Number(cellule.dataset.rangee)));
    appui = null;
    etat.peinture = null;
  };
  grille.addEventListener('pointerup', finir);
  grille.addEventListener('pointercancel', () => { appui = null; etat.peinture = null; });
  // Clavier (Entrée, Espace) : un clic sans pointeur.
  grille.addEventListener('click', (evenement) => {
    const entete = evenement.target.closest('.entete-colonne');
    if (entete) {
      colonneDecalage = Number(entete.dataset.colonne);
      dessiner();
      decalage.querySelector('input')?.focus();
      return;
    }
    const cellule = evenement.target.closest('.case-forme');
    if (cellule && evenement.detail === 0) appliquer(basculerDalle(saisie(), 0, Number(cellule.dataset.colonne), Number(cellule.dataset.rangee)));
  });
  decalage.addEventListener('input', (evenement) => {
    if (evenement.target.name !== 'decalageColonne' || !colonneDecalage) return;
    const mm = lireNombre(evenement.target.value);
    if (Number.isFinite(mm) && mm >= 0) appliquer(decalerColonne(saisie(), 0, colonneDecalage, mm), false);
  });
  ecran.addEventListener('change', (evenement) => {
    if (evenement.target.name === 'modeForme') grille.dataset.mode = evenement.target.value;
  });
  const fermer = () => {
    document.removeEventListener('keydown', clavier);
    ecran.remove();
    surFermer(z);
  };
  const clavier = (evenement) => {
    if (evenement.key === 'Escape') fermer();
  };
  document.addEventListener('keydown', clavier);
  ecran.addEventListener('click', (evenement) => {
    const action = evenement.target.closest('[data-action]')?.dataset.action;
    if (action === 'fermer') fermer();
    else if (action === 'remettre') {
      colonneDecalage = null;
      appliquer(remettreForme(saisie(), 0));
    }
  });

  dessiner();
  document.body.append(ecran);
  return ecran;
}
