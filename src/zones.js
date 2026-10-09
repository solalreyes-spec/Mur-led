// Mur en plusieurs zones (étape 9a) : liste des zones saisie dans l'onglet Mur, et son éditeur.
// La liste est gardée avec les saisies du Mur dans un seul champ caché (`zones`, texte JSON) : les champs de l'éditeur
// n'appartiennent à aucun formulaire (attribut `form` vers un formulaire absent), pour ne pas être gardés en double.
// Fonctions pures, sauf `monterEditeurZones` qui construit l'éditeur ; le calcul est dans calculs.js (murZones).

import { el } from './dom.js';
import { lireNombre } from './format.js';
import { ZONES_MAX, NOM_ZONE_MAX } from './calculs.js';

const HORS_FORMULAIRE = 'editeur-zones-hors-formulaire';
const MODES = ['reel', 'main', 'colles'];
const LIBELLES_MODES = { reel: 'Comme l\'écart réel', main: 'À la main', colles: 'Zones collées' };

const zoneDefaut = (n) => ({ nom: `Zone ${n}`, colonnes: 4, rangees: 3, ecartMm: 0, basMm: 0 });

export function saisieParDefaut() {
  return { zones: [zoneDefaut(1), zoneDefaut(2)], ecarts: 'reel', ecartsPx: [], yPx: null };
}

// Texte gardé → saisie ; texte vide ou illisible : deux zones de 4 × 3.
export function lireSaisieZones(texte) {
  try {
    const s = JSON.parse(texte);
    if (!s || !Array.isArray(s.zones) || s.zones.length === 0) return saisieParDefaut();
    return {
      zones: s.zones.map((z) => ({ nom: z.nom ?? '', colonnes: z.colonnes, rangees: z.rangees, ecartMm: z.ecartMm ?? 0, basMm: z.basMm ?? 0 })),
      ecarts: MODES.includes(s.ecarts) ? s.ecarts : 'reel',
      ecartsPx: Array.isArray(s.ecartsPx) ? s.ecartsPx : [],
      yPx: Array.isArray(s.yPx) ? s.yPx : null,
    };
  } catch (erreur) {
    return saisieParDefaut();
  }
}

export function ecrireSaisieZones(saisie) {
  return JSON.stringify(saisie);
}

// Ajoute une zone à droite, copie de la dernière (colonnes, rangées, écart, hauteur du bas), au premier nom « Zone n »
// libre. À la main, un écart et un Y de plus, repris de la dernière zone.
export function ajouterZone(saisie) {
  if (saisie.zones.length >= ZONES_MAX) return saisie;
  const derniere = saisie.zones[saisie.zones.length - 1];
  const noms = new Set(saisie.zones.map((z) => z.nom));
  let n = saisie.zones.length + 1;
  while (noms.has(`Zone ${n}`)) n += 1;
  const suivante = { ...derniere, nom: `Zone ${n}` };
  const main = saisie.ecarts === 'main';
  return {
    ...saisie,
    zones: [...saisie.zones, suivante],
    ecartsPx: main ? [...saisie.ecartsPx, saisie.ecartsPx[saisie.ecartsPx.length - 1] ?? 0] : saisie.ecartsPx,
    yPx: main && saisie.yPx ? [...saisie.yPx, saisie.yPx[saisie.yPx.length - 1] ?? 0] : saisie.yPx,
  };
}

// Retire la zone i (une zone au moins reste) ; à la main, l'écart à sa gauche part avec elle (à droite pour la première).
export function retirerZone(saisie, i) {
  if (saisie.zones.length <= 1 || i < 0 || i >= saisie.zones.length) return saisie;
  const ecartsPx = [...saisie.ecartsPx];
  if (saisie.ecarts === 'main' && ecartsPx.length) ecartsPx.splice(Math.max(0, i - 1), 1);
  return {
    ...saisie,
    zones: saisie.zones.filter((_, j) => j !== i),
    ecartsPx,
    yPx: saisie.yPx ? saisie.yPx.filter((_, j) => j !== i) : null,
  };
}

// Échange la zone i avec sa voisine de gauche (chaque zone garde son écart réel et son Y).
export function deplacerAGauche(saisie, i) {
  if (i <= 0 || i >= saisie.zones.length) return saisie;
  const echanger = (liste) => {
    const copie = [...liste];
    [copie[i - 1], copie[i]] = [copie[i], copie[i - 1]];
    return copie;
  };
  return { ...saisie, zones: echanger(saisie.zones), yPx: saisie.yPx ? echanger(saisie.yPx) : null };
}

// Passe les écarts à la main en reprenant les valeurs que l'appli vient de calculer (`mur`, résultat de murZones).
export function passerALaMain(saisie, mur) {
  return {
    ...saisie,
    ecarts: 'main',
    ecartsPx: mur ? mur.ecarts.map((e) => e.px) : saisie.zones.slice(1).map(() => 0),
    yPx: mur ? mur.zones.map((z) => z.y) : saisie.zones.map(() => 0),
  };
}

// Arguments de murZones : [zones, options] ; les écarts et Y en pixels ne servent qu'à la main.
export function argumentsMurZones(saisie) {
  const main = saisie.ecarts === 'main';
  return [saisie.zones.map((z) => ({ ...z })), { ecarts: saisie.ecarts, ecartsPx: main ? [...saisie.ecartsPx] : [], yPx: main && saisie.yPx ? [...saisie.yPx] : null }];
}

// ---------------------------------------------------------------------------
// Éditeur (onglet Mur)
// ---------------------------------------------------------------------------

const texteNombre = (x) => (Number.isFinite(x) ? String(x).replace('.', ',') : '');

function champ(libelle, nomChamp, valeur, { numerique = true, maxLength = null } = {}) {
  const id = `zone-${nomChamp}-${Math.random().toString(36).slice(2, 8)}`;
  return el('div', { class: 'champ' },
    el('label', { for: id }, libelle),
    el('input', {
      id, form: HORS_FORMULAIRE, 'data-champ': nomChamp, autocomplete: 'off', value: valeur,
      ...(numerique ? { inputmode: 'decimal' } : {}), ...(maxLength ? { maxlength: String(maxLength) } : {}),
    }));
}

// `saisie` : la liste des zones ; `mur` : le dernier mur calculé, ou une fonction qui le donne (pour reprendre ses
// valeurs en passant à la main) ;
// `surChange(saisie)` : appelé à chaque saisie ou bouton. L'éditeur se redessine seul après un bouton, pas pendant la
// frappe (le champ garde le focus).
export function monterEditeurZones({ saisie, mur = null, surChange = () => {} }) {
  let etat = saisie;
  const racine = el('div', { class: 'editeur-zones' });

  const dessiner = () => {
    const main = etat.ecarts === 'main';
    const cartes = etat.zones.map((z, i) => el('li', { class: 'carte-zone', 'data-index': String(i) },
      el('p', { class: 'titre-zone' }, `Zone ${i + 1}${i === 0 ? ', à gauche vu de face' : ''}`),
      champ('Nom', 'nom', z.nom ?? '', { numerique: false, maxLength: NOM_ZONE_MAX }),
      el('div', { class: 'paire' },
        champ('Colonnes', 'colonnes', texteNombre(z.colonnes)),
        champ('Rangées', 'rangees', texteNombre(z.rangees))),
      el('div', { class: 'paire' },
        i > 0 ? champ('Écart avec la zone de gauche (mm)', 'ecartMm', texteNombre(z.ecartMm ?? 0)) : null,
        champ('Hauteur du bas (mm)', 'basMm', texteNombre(z.basMm ?? 0))),
      main ? el('div', { class: 'paire' },
        i > 0 ? champ('Écart dans la pixel map (px)', 'ecartPx', texteNombre(etat.ecartsPx[i - 1])) : null,
        champ('Y dans la pixel map (px)', 'yPx', texteNombre(etat.yPx?.[i]))) : null,
      el('div', { class: 'actions-zone' },
        el('button', { type: 'button', form: HORS_FORMULAIRE, class: 'bouton bouton-petit', 'data-action': 'gauche', disabled: i === 0 ? '' : null }, 'Déplacer à gauche'),
        el('button', { type: 'button', form: HORS_FORMULAIRE, class: 'bouton bouton-petit', 'data-action': 'retirer', disabled: etat.zones.length <= 1 ? '' : null }, 'Retirer'))));
    const choix = el('fieldset', { class: 'segmente choix-ecarts', form: HORS_FORMULAIRE },
      el('legend', {}, 'Écarts dans la pixel map'),
      el('div', { class: 'segments' }, MODES.map((mode) => el('label', {},
        el('input', { type: 'radio', name: 'ecartsZones', value: mode, form: HORS_FORMULAIRE, checked: etat.ecarts === mode ? '' : null }),
        el('span', {}, LIBELLES_MODES[mode])))));
    racine.replaceChildren(
      el('ol', { class: 'liste-zones' }, cartes),
      el('button', { type: 'button', form: HORS_FORMULAIRE, class: 'bouton', 'data-action': 'ajouter', disabled: etat.zones.length >= ZONES_MAX ? '' : null },
        `Ajouter une zone${etat.zones.length >= ZONES_MAX ? ` (${ZONES_MAX} au plus)` : ''}`),
      choix,
      el('p', { class: 'note' }, main
        ? 'À la main : recopie les écarts et les Y de la pixel map reçue (pixel 0, 0 en haut à gauche).'
        : 'Zones de gauche à droite vu de face. Hauteur du bas : de combien le bas de la zone est plus haut que le bas le plus bas.'));
  };

  const changer = (nouvelle, redessiner = false) => {
    etat = nouvelle;
    if (redessiner) dessiner();
    surChange(etat);
  };

  // Frappe : la saisie suit les champs, sans redessiner.
  const lireChamps = () => {
    const zones = etat.zones.map((z) => ({ ...z }));
    const ecartsPx = [...etat.ecartsPx];
    const yPx = etat.yPx ? [...etat.yPx] : null;
    for (const carte of racine.querySelectorAll('.carte-zone')) {
      const i = Number(carte.dataset.index);
      for (const input of carte.querySelectorAll('[data-champ]')) {
        const nom = input.dataset.champ;
        if (nom === 'nom') zones[i].nom = input.value;
        else if (nom === 'ecartPx') ecartsPx[i - 1] = lireNombre(input.value);
        else if (nom === 'yPx' && yPx) yPx[i] = lireNombre(input.value);
        else zones[i][nom] = lireNombre(input.value);
      }
    }
    return { ...etat, zones, ecartsPx, yPx };
  };
  racine.addEventListener('input', (evenement) => {
    if (evenement.target.dataset.champ) changer(lireChamps());
  });
  racine.addEventListener('change', (evenement) => {
    if (evenement.target.name !== 'ecartsZones') return;
    const mode = evenement.target.value;
    const courante = lireChamps();
    changer(mode === 'main' ? passerALaMain(courante, typeof mur === 'function' ? mur() : mur) : { ...courante, ecarts: mode, ecartsPx: [], yPx: null }, true);
  });
  racine.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('button[data-action]');
    if (!bouton || bouton.disabled) return;
    const courante = lireChamps();
    const i = Number(bouton.closest('.carte-zone')?.dataset.index);
    const action = bouton.dataset.action;
    if (action === 'ajouter') changer(ajouterZone(courante), true);
    else if (action === 'retirer') changer(retirerZone(courante, i), true);
    else if (action === 'gauche') changer(deplacerAGauche(courante, i), true);
    // Le formulaire qui porte l'éditeur recalcule et garde la saisie, comme après une frappe.
    racine.dispatchEvent(new Event('change', { bubbles: true }));
  });

  dessiner();
  racine.saisie = () => etat;
  return racine;
}
