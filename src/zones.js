// Mur en plusieurs zones (étape 9a) : liste des zones saisie dans l'onglet Mur, et son éditeur.
// La liste est gardée avec les saisies du Mur dans un seul champ caché (`zones`, texte JSON) : les champs de l'éditeur
// n'appartiennent à aucun formulaire (attribut `form` vers un formulaire absent), pour ne pas être gardés en double.
// Fonctions pures, sauf `monterEditeurZones` qui construit l'éditeur ; le calcul est dans calculs.js (murZones).

import { el } from './dom.js';
import { lireNombre } from './format.js';
import { ZONES_MAX, NOM_ZONE_MAX } from './calculs.js';
import { ouvrirForme } from './ecran-forme.js';

const HORS_FORMULAIRE = 'editeur-zones-hors-formulaire';
const MODES = ['reel', 'main', 'colles'];
const LIBELLES_MODES = { reel: 'Comme l\'écart réel', main: 'À la main', colles: 'Zones collées' };

const zoneDefaut = (n) => ({ nom: `Zone ${n}`, colonnes: 4, rangees: 3, ecartMm: 0, basMm: 0 });
// Champs d'une zone ajoutés par la 9b : placement, forme (dalles absentes, décalages, demi-dalles), dalle propre.
const CHAMPS_9B = ['placement', 'absentes', 'decalagesMm', 'rangeeDemi', 'positionDemi', 'dalleId'];

export function saisieParDefaut() {
  return { zones: [zoneDefaut(1), zoneDefaut(2)], ecarts: 'reel', ecartsPx: [], yPx: null };
}

// Texte gardé → saisie ; texte vide ou illisible : deux zones de 4 × 3.
export function lireSaisieZones(texte) {
  try {
    const s = JSON.parse(texte);
    if (!s || !Array.isArray(s.zones) || s.zones.length === 0) return saisieParDefaut();
    return {
      zones: s.zones.map((z) => ({
        nom: z.nom ?? '', colonnes: z.colonnes, rangees: z.rangees, ecartMm: z.ecartMm ?? 0, basMm: z.basMm ?? 0,
        // Formes libres et mur mixte (9b) : seulement s'ils ont été saisis, pour rendre une saisie de la 9a telle quelle.
        ...Object.fromEntries(Object.keys(z).filter((c) => CHAMPS_9B.includes(c) && z[c] !== undefined && z[c] !== null).map((c) => [c, z[c]])),
      })),
      ecarts: MODES.includes(s.ecarts) ? s.ecarts : 'reel',
      ecartsPx: Array.isArray(s.ecartsPx) ? s.ecartsPx : [],
      yPx: Array.isArray(s.yPx) ? s.yPx : null,
      ...(Array.isArray(s.xPx) ? { xPx: s.xPx } : {}),
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
  const { placement, ...copie } = derniere;
  const suivante = { ...copie, nom: `Zone ${n}` };
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
  const nom = saisie.zones[i].nom;
  return {
    ...saisie,
    // Une zone placée par rapport à la zone retirée repasse « à droite de la zone d'avant ».
    zones: saisie.zones.filter((_, j) => j !== i).map((z) => (z.placement?.zone === nom ? sansCle(z, 'placement') : z)),
    ecartsPx,
    yPx: saisie.yPx ? saisie.yPx.filter((_, j) => j !== i) : null,
    ...(saisie.xPx ? { xPx: saisie.xPx.filter((_, j) => j !== i) } : {}),
  };
}

const sansCle = (objet, ...cles) => Object.fromEntries(Object.entries(objet).filter(([k]) => !cles.includes(k)));
const avecZone = (saisie, i, f) => ({ ...saisie, zones: saisie.zones.map((z, j) => (j === i ? f(z) : z)) });

// Renomme la zone i ; les zones placées par rapport à elle suivent.
export function renommerZone(saisie, i, nom) {
  const ancien = saisie.zones[i]?.nom;
  return {
    ...saisie,
    zones: saisie.zones.map((z, j) => {
      if (j === i) return { ...z, nom };
      return z.placement?.zone === ancien ? { ...z, placement: { ...z.placement, zone: nom } } : z;
    }),
  };
}

// Placement de la zone i (9b2) : « droite » efface le placement (la zone d'avant, comme en 9a).
export function placerZone(saisie, i, placement) {
  return avecZone(saisie, i, (z) => (!placement || placement.type === 'droite' ? sansCle(z, 'placement') : { ...z, placement }));
}

// Dalle propre à la zone i (9b3), par son identifiant ; null : la dalle du mur.
export function choisirDalle(saisie, i, dalleId) {
  return avecZone(saisie, i, (z) => (dalleId ? { ...z, dalleId } : sansCle(z, 'dalleId')));
}

// Forme au doigt (9b1) : dalles absentes [colonne, rangée], triées par colonne puis rangée, sans doublon.
const trier = (liste) => [...liste].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cle = ([c, r]) => `${c},${r}`;
export function peindreDalles(saisie, i, cases, absente) {
  return avecZone(saisie, i, (z) => {
    const actuelles = new Map((z.absentes ?? []).map((x) => [cle(x), x]));
    for (const x of cases) {
      if (absente) actuelles.set(cle(x), [x[0], x[1]]);
      else actuelles.delete(cle(x));
    }
    return { ...z, absentes: trier(actuelles.values()) };
  });
}
export function basculerDalle(saisie, i, c, r) {
  const absente = (saisie.zones[i].absentes ?? []).some((x) => x[0] === c && x[1] === r);
  return peindreDalles(saisie, i, [[c, r]], !absente);
}
export function decalerColonne(saisie, i, c, mm) {
  return avecZone(saisie, i, (z) => {
    const decalages = Array.from({ length: Math.max(z.decalagesMm?.length ?? 0, c) }, (_, j) => z.decalagesMm?.[j] ?? 0);
    decalages[c - 1] = mm;
    return { ...z, decalagesMm: decalages };
  });
}
export function remettreForme(saisie, i) {
  return avecZone(saisie, i, (z) => sansCle(z, 'absentes', 'decalagesMm'));
}
// Places de la grille (rangée de demi-dalles comprise) et dalles présentes.
export function compteForme(z) {
  const rangees = z.rangees + (z.rangeeDemi ? 1 : 0);
  const places = z.colonnes * rangees;
  const absentes = new Set((z.absentes ?? []).filter(([c, r]) => c >= 1 && c <= z.colonnes && r >= 1 && r <= rangees).map(cle));
  return { dalles: places - absentes.size, places };
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

// Arguments de murZones : [zones, options] ; les écarts, X et Y en pixels ne servent qu'à la main. `fiches` : dalles
// par identifiant, pour la dalle propre d'une zone (et sa demi-dalle) ; `demi` : demi-dalle de la dalle du mur.
export function argumentsMurZones(saisie, { fiches = null, demi = null } = {}) {
  const main = saisie.ecarts === 'main';
  const zones = saisie.zones.map((z) => {
    if (!z.dalleId) return { ...z };
    const dalle = fiches?.get(z.dalleId) ?? null;
    const demiZone = z.rangeeDemi && dalle?.demiDalle ? fiches.get(dalle.demiDalle) ?? null : null;
    return { ...sansCle(z, 'dalleId'), ...(dalle ? { dalle } : {}), ...(demiZone ? { demi: demiZone } : {}) };
  });
  const options = { ecarts: saisie.ecarts, ecartsPx: main ? [...saisie.ecartsPx] : [], yPx: main && saisie.yPx ? [...saisie.yPx] : null };
  if (main && saisie.xPx) options.xPx = [...saisie.xPx];
  if (demi && saisie.zones.some((z) => z.rangeeDemi && !z.dalleId)) options.demi = demi;
  return [zones, options];
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
// Réglages de la 9b (placement, dalle propre, demi-dalles, forme) : attribut `data-reglage`, lus au changement.
function reglage(libelle, nom, valeur, options = null) {
  const id = `zone-${nom}-${Math.random().toString(36).slice(2, 8)}`;
  const controle = options
    ? el('select', { id, form: HORS_FORMULAIRE, 'data-reglage': nom }, options.map((o) => (o.groupe
      ? el('optgroup', { label: o.groupe }, o.options.map((x) => el('option', { value: x.valeur, selected: x.valeur === valeur ? '' : null }, x.libelle)))
      : el('option', { value: o.valeur, selected: o.valeur === valeur ? '' : null }, o.libelle))))
    : el('input', { id, form: HORS_FORMULAIRE, 'data-reglage': nom, autocomplete: 'off', inputmode: 'decimal', value: valeur });
  return el('div', { class: 'champ' }, el('label', { for: id }, libelle), controle);
}

const TYPES_PLACEMENT = [
  { valeur: 'droite', libelle: 'À droite de la zone d\'avant' },
  { valeur: 'dessus', libelle: 'Au-dessus d\'une zone' },
  { valeur: 'dessous', libelle: 'En dessous d\'une zone' },
  { valeur: 'libre', libelle: 'Position libre' },
];
const ALIGNEMENTS = [{ valeur: 'gauche', libelle: 'À gauche' }, { valeur: 'centre', libelle: 'Au centre' }, { valeur: 'droite', libelle: 'À droite' }];

// Options d'une zone (9b) : placement, dalle, demi-dalles, forme ; repliées tant qu'aucune n'est utilisée.
function optionsZone(etat, z, i, { dalles, demiDisponible }) {
  const p = z.placement ?? { type: 'droite' };
  const autres = etat.zones.filter((_, j) => j !== i).map((x) => ({ valeur: x.nom, libelle: x.nom }));
  const marques = [...new Set(dalles.map((d) => d.marque ?? 'Autres'))];
  const choixDalles = [{ valeur: '', libelle: 'Même dalle que le mur' },
    ...marques.map((m) => ({ groupe: m, options: dalles.filter((d) => (d.marque ?? 'Autres') === m).map((d) => ({ valeur: d.id, libelle: d.nom })) }))];
  const demi = demiDisponible(z.dalleId ?? null);
  const { dalles: presentes, places } = compteForme(z);
  const utilisee = Boolean(z.placement || z.dalleId || z.absentes?.length || z.decalagesMm?.some((x) => x) || z.rangeeDemi);
  return el('details', { class: 'options-zone', open: utilisee ? '' : null },
    el('summary', {}, 'Placement, dalle et forme'),
    reglage('Placement', 'placementType', p.type, TYPES_PLACEMENT),
    p.type === 'dessus' || p.type === 'dessous' ? el('div', { class: 'paire' },
      reglage('Zone de référence', 'placementZone', p.zone ?? autres[0]?.valeur ?? '', autres),
      reglage('Alignement', 'placementAlignement', p.alignement ?? 'gauche', ALIGNEMENTS)) : null,
    p.type === 'dessus' || p.type === 'dessous' ? el('div', { class: 'paire' },
      reglage('Écart vertical (mm)', 'placementEcart', texteNombre(p.ecartMm ?? 0)),
      reglage('Décalage (mm)', 'placementDecalage', texteNombre(p.decalageMm ?? 0))) : null,
    p.type === 'dessous' ? el('label', { class: 'case' },
      el('input', { type: 'checkbox', form: HORS_FORMULAIRE, 'data-reglage': 'accrocheeSous', checked: p.accrocheeSous ? '' : null }),
      el('span', {}, `Accrochée sous ${p.zone ?? autres[0]?.valeur ?? 'la zone du dessus'} (son poids sur ses points)`)) : null,
    p.type === 'libre' ? el('div', { class: 'paire' },
      reglage('X du bord gauche (mm)', 'placementX', texteNombre(p.xMm ?? 0)),
      reglage('Hauteur du bas (mm)', 'placementBas', texteNombre(p.basMm ?? 0))) : null,
    etat.ecarts === 'main' && p.type !== 'droite' ? reglage('X dans la pixel map (px)', 'xPx', texteNombre(etat.xPx?.[i])) : null,
    dalles.length ? reglage('Dalle de la zone', 'dalleId', z.dalleId ?? '', choixDalles) : null,
    demi ? el('div', { class: 'paire' },
      el('label', { class: 'case' }, el('input', { type: 'checkbox', form: HORS_FORMULAIRE, 'data-reglage': 'rangeeDemi', checked: z.rangeeDemi ? '' : null }),
        el('span', {}, 'Rangée de demi-dalles')),
      z.rangeeDemi ? reglage('Rangée de demi-dalles', 'positionDemi', z.positionDemi ?? 'bas', [{ valeur: 'haut', libelle: 'En haut' }, { valeur: 'bas', libelle: 'En bas' }]) : null) : null,
    el('div', { class: 'actions-zone' },
      el('button', { type: 'button', form: HORS_FORMULAIRE, class: 'bouton bouton-petit', 'data-action': 'forme' }, 'Modifier la forme'),
      el('span', { class: 'compte-zone' }, `${presentes} ${presentes > 1 ? 'dalles' : 'dalle'} sur ${places}`)));
}

// Lit les réglages de la 9b d'une carte : placement, dalle, demi-dalles, X à la main.
function lireReglages(saisie, i, carte) {
  const v = (nom) => carte.querySelector(`[data-reglage="${nom}"]`);
  const nombre = (nom, defaut = 0) => {
    const x = v(nom) ? lireNombre(v(nom).value) : defaut;
    return Number.isFinite(x) ? x : defaut;
  };
  let suivante = saisie;
  const type = v('placementType')?.value ?? 'droite';
  if (type === 'dessus' || type === 'dessous') {
    const autres = saisie.zones.filter((_, j) => j !== i);
    suivante = placerZone(suivante, i, {
      type, zone: v('placementZone')?.value ?? autres[0]?.nom, alignement: v('placementAlignement')?.value ?? 'gauche',
      ecartMm: nombre('placementEcart'), decalageMm: nombre('placementDecalage'),
      ...(type === 'dessous' && v('accrocheeSous')?.checked ? { accrocheeSous: true } : {}),
    });
  } else if (type === 'libre') {
    suivante = placerZone(suivante, i, { type, xMm: nombre('placementX'), basMm: nombre('placementBas') });
  } else suivante = placerZone(suivante, i, null);
  if (v('dalleId')) suivante = choisirDalle(suivante, i, v('dalleId').value || null);
  const demi = v('rangeeDemi');
  suivante = {
    ...suivante,
    zones: suivante.zones.map((z, j) => {
      if (j !== i) return z;
      const { rangeeDemi, positionDemi, ...reste } = z;
      return demi?.checked ? { ...reste, rangeeDemi: true, positionDemi: v('positionDemi')?.value ?? positionDemi ?? 'bas' } : reste;
    }),
  };
  if (v('xPx')) {
    const xPx = saisie.zones.map((_, j) => saisie.xPx?.[j] ?? null);
    xPx[i] = nombre('xPx');
    suivante = { ...suivante, xPx };
  }
  return suivante;
}

export function monterEditeurZones({ saisie, mur = null, surChange = () => {}, dalles = [], demiDisponible = () => false }) {
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
      // Écart et hauteur du bas : pour une zone « à droite de la zone d'avant » (9a) seulement.
      z.placement ? null : el('div', { class: 'paire' },
        i > 0 ? champ('Écart avec la zone de gauche (mm)', 'ecartMm', texteNombre(z.ecartMm ?? 0)) : null,
        champ('Hauteur du bas (mm)', 'basMm', texteNombre(z.basMm ?? 0))),
      main ? el('div', { class: 'paire' },
        i > 0 && !z.placement ? champ('Écart dans la pixel map (px)', 'ecartPx', texteNombre(etat.ecartsPx[i - 1])) : null,
        champ('Y dans la pixel map (px)', 'yPx', texteNombre(etat.yPx?.[i]))) : null,
      optionsZone(etat, z, i, { dalles, demiDisponible }),
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
        : 'Zones de gauche à droite vu de face. Hauteur du bas : de combien le bas de la zone est plus haut que le bas le plus bas. '
          + 'Une zone peut aussi aller au-dessus ou en dessous d\'une autre, ou à une position libre : « Placement, dalle et forme ».'));
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
        if (nom === 'nom') {
          // Renommer : les zones placées par rapport à elle suivent (9b2).
          const ancien = zones[i].nom;
          zones[i].nom = input.value;
          zones.forEach((z, j) => {
            if (j !== i && z.placement?.zone === ancien) zones[j] = { ...z, placement: { ...z.placement, zone: input.value } };
          });
        }
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
    // Réglages de la 9b : relus, puis la carte redessinée (les champs dépendent du placement et de la dalle).
    const carteReglee = evenement.target.dataset?.reglage ? evenement.target.closest('.carte-zone') : null;
    if (carteReglee) {
      changer(lireReglages(lireChamps(), Number(carteReglee.dataset.index), carteReglee), true);
      return;
    }
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
    if (action === 'forme') {
      // Écran plein « Forme de la zone » : la saisie suit à chaque appui ; l'éditeur est redessiné au retour.
      ouvrirForme({
        zone: courante.zones[i],
        surChange: (z) => changer({ ...etat, zones: etat.zones.map((x, j) => (j === i ? z : x)) }),
        surFermer: () => {
          dessiner();
          racine.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
      return;
    }
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
