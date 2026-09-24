// Onglet Mur (dimensionnement). Aucune règle de calcul ici : tout passe par calculs.js,
// et chaque résultat affiche la valeur utilisée et sa source.

import { dimensionner, densite, pitchCalculeMm } from './calculs.js';
import { nombre, nombreCourt, signe, sourceCourte, dateCourte, lireNombre } from './format.js';
import { el, remplacer } from './dom.js';
import { resumeMur } from './resumes.js';

const formulaire = document.getElementById('form-mur');
const zoneResultats = document.getElementById('resultats');

const BADGES = { modifiee: ' (version modifiée)', ajoutee: ' (ma fiche)' };

// Liste des dalles : celles du parc actif, puis les gabarits. Garde la dalle choisie si elle y est encore.
function remplirListe(select, { visibles, gabarits, nomParc }) {
  const avant = select.value;
  const option = (d) => el('option', { value: d.id },
    `${d.nom}${d.usage ? ` (${d.usage})` : ''}${BADGES[d.statutBase] ?? ''} — ${nombreCourt(d.largeurMm)} × ${nombreCourt(d.hauteurMm)} mm, ${d.pxH} × ${d.pxV} px`);
  remplacer(select,
    el('optgroup', { label: nomParc ? `Parc ${nomParc}` : 'Dalles' }, visibles.map(option)),
    el('optgroup', { label: 'Gabarits génériques (non sourcés)' }, gabarits.map(option)));
  if ([...visibles, ...gabarits].some((d) => d.id === avant)) select.value = avant;
  select.disabled = false;
}

// ---------------------------------------------------------------------------
// Lecture du formulaire
// ---------------------------------------------------------------------------

// Mètres saisis → millimètres, sans erreur d'arrondi binaire (3,3 m → 3300 mm).
function metresEnMm(m) {
  return Math.round(m * 1e6) / 1e3;
}

function lireFormulaire() {
  const d = new FormData(formulaire);
  return {
    dalleId: d.get('dalle'),
    mode: d.get('mode'),
    largeurM: lireNombre(d.get('largeurM')),
    hauteurM: lireNombre(d.get('hauteurM')),
    largeurPx: lireNombre(d.get('largeurPx')),
    hauteurPx: lireNombre(d.get('hauteurPx')),
    colonnes: lireNombre(d.get('colonnes')),
    lignes: lireNombre(d.get('lignes')),
    neDepassePasLargeur: d.has('neDepassePasLargeur'),
    neDepassePasHauteur: d.has('neDepassePasHauteur'),
    demi: d.has('demi'),
    positionDemi: d.get('positionDemi'),
  };
}

// ---------------------------------------------------------------------------
// Affichage : fiche de la dalle et sources
// ---------------------------------------------------------------------------

const CHAMPS_FICHE = [
  { nom: 'largeurMm', libelle: 'Largeur', unite: 'mm' },
  { nom: 'hauteurMm', libelle: 'Hauteur', unite: 'mm' },
  { nom: 'pxH', libelle: 'Pixels en largeur', unite: 'px' },
  { nom: 'pxV', libelle: 'Pixels en hauteur', unite: 'px' },
  { nom: 'pitchMm', libelle: 'Pitch (fiche)', unite: 'mm' },
  { nom: 'poidsKg', libelle: 'Poids', unite: 'kg' },
  { nom: 'pMaxW', libelle: 'P max', unite: 'W' },
  { nom: 'pMoyW', libelle: 'P moyenne', unite: 'W' },
  { nom: 'rafraichissementHz', libelle: 'Rafraîchissement', unite: 'Hz' },
  { nom: 'scan', libelle: 'Scan', unite: '' },
  { nom: 'profondeurMm', libelle: 'Profondeur', unite: 'mm' },
  { nom: 'luminositeNits', libelle: 'Luminosité', unite: 'nits' },
  { nom: 'bitsParCouleur', libelle: 'Bits par couleur', unite: 'bits' },
  { nom: 'carteReceptionMarque', libelle: 'Carte de réception (marque)', unite: '' },
  { nom: 'carteReceptionModele', libelle: 'Carte de réception (modèle)', unite: '' },
  { nom: 'fichierConfig', libelle: 'Fichier de config', unite: '' },
  { nom: 'indiceIP', libelle: 'Indice IP', unite: '' },
  { nom: 'courbure', libelle: 'Courbure', unite: '' },
  { nom: 'maxAccroche', libelle: 'Maximum en accroche', unite: 'dalles' },
  { nom: 'maxStack', libelle: 'Maximum en stack', unite: 'dalles' },
];

function valeurAvecUnite(valeur, unite) {
  const texte = typeof valeur === 'number' ? nombreCourt(valeur, 3) : String(valeur);
  return unite ? `${texte} ${unite}` : texte;
}

function afficherFiche(dalle, demi) {
  const lignes = CHAMPS_FICHE
    .filter(({ nom }) => dalle.sources[nom])
    .map(({ nom, libelle, unite }) => {
      const s = dalle.sources[nom];
      // Réglage du parc actif : la valeur de la fiche reste visible.
      const deLaFiche = s.reglageParc
        ? el('div', { class: 'conflit' }, s.autres.length
          ? `Fiche : ${s.autres.map((x) => `${valeurAvecUnite(x.valeur, unite)}${x.sources.length ? ` (${x.sources.map(sourceCourte).join(', ')})` : ''}`).join(' ; ')}.`
          : 'Fiche : non précisé.')
        : null;
      const autres = s.autres.length > 0 && !s.reglageParc
        ? el('div', { class: 'conflit' },
          `Autres valeurs : ${s.autres.map((x) => `${valeurAvecUnite(x.valeur, unite)} (${x.sources.map(sourceCourte).join(', ')})`).join(' ; ')}. `,
          s.conflitSansRegle ? 'Pas de règle pour choisir : à vérifier.' : 'La plus défavorable est retenue.',
          s.note ? ` ${s.note}.` : '')
        : null;
      return el('tr', {},
        el('th', { scope: 'row' }, libelle),
        el('td', {}, el('strong', {}, valeurAvecUnite(s.valeur, unite)), s.type ? ` (${s.type})` : '', autres, deLaFiche),
        el('td', { class: 'source' }, s.sources.map((x) => el('span', {}, sourceCourte(x)))));
    });

  // Légende : titre complet et confiance de chaque source citée, une seule fois.
  const sourcesCitees = new Map();
  for (const s of Object.values(dalle.sources)) {
    for (const x of [s, ...s.autres]) for (const src of x.sources) sourcesCitees.set(src.id, src);
  }
  const legende = [...sourcesCitees.values()].map((s) => el('p', { class: 'note' },
    el('strong', {}, sourceCourte(s)), ` : ${s.titre}. Confiance : ${s.confiance}`
    + `${s.date ? `, document du ${dateCourte(s.date)}` : ', date du document non précisée'}.`));

  remplacer(document.getElementById('fiche-contenu'), el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-fiche' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Champ'), el('th', {}, 'Valeur retenue'), el('th', {}, 'Source'))),
        el('tbody', {}, lignes))),
    legende,
    dalle.alias?.length ? el('p', { class: 'note' }, `Aussi appelée : ${dalle.alias.join(', ')}.`) : null,
    dalle.note ? el('p', { class: 'note' }, dalle.note) : null,
    demi ? el('p', { class: 'note' },
      `Demi-dalle dans la base : ${demi.nom}, ${nombreCourt(demi.largeurMm)} × ${nombreCourt(demi.hauteurMm)} mm, `
      + `${demi.pxH} × ${demi.pxV} px. Elle a sa propre fiche`
      + `${demi.pMaxW ? ` (P max ${nombreCourt(demi.pMaxW)} W, ${nombreCourt(demi.poidsKg)} kg)` : ''}.`) : null,
  );
}

function afficherAlertesDalle(dalle) {
  // Les manques de la fiche sont signalés par les onglets dont le calcul en dépend, la liste complète dans Base.
  const alertes = [];
  if (dalle.gabarit) {
    alertes.push('Gabarit générique non sourcé (cahier des charges du projet) : pour une estimation rapide, jamais pour valider une presta.');
  }
  for (const { nom, libelle, unite } of CHAMPS_FICHE.filter(({ nom }) => dalle.sources[nom]?.conflitSansRegle)) {
    const s = dalle.sources[nom];
    const valeurs = [s, ...s.autres].map((x) => `${valeurAvecUnite(x.valeur, unite)} (${x.sources.map(sourceCourte).join(', ')})`).join(' ou ');
    alertes.push(`${libelle} : ${valeurs}, sans règle de choix. Vérifie la version de ta dalle.`);
  }
  if (dalle.pitchMm && Math.abs(pitchCalculeMm(dalle) - dalle.pitchMm) > 0.01) {
    alertes.push(`Le pitch de la fiche (${nombreCourt(dalle.pitchMm, 3)} mm) ne correspond pas à largeur / pixels `
      + `(${nombreCourt(pitchCalculeMm(dalle), 3)} mm) : vérifie la fiche.`);
  }
  remplacer(document.getElementById('alerte-dalle'), ...alertes.map((texte) => el('div', { class: 'alerte' }, texte)),
  );
}

// Sources des dimensions et pixels utilisés, sans doublon.
function sourcesDimensions(...fiches) {
  const textes = new Set();
  for (const f of fiches.filter(Boolean)) {
    for (const nom of ['largeurMm', 'hauteurMm', 'pxH', 'pxV']) {
      for (const s of f.sources[nom]?.sources ?? []) textes.add(s.confiance ? `${sourceCourte(s)} (${s.confiance})` : sourceCourte(s));
    }
  }
  return [...textes].join(' ; ');
}

// ---------------------------------------------------------------------------
// Affichage : résultats du dimensionnement
// ---------------------------------------------------------------------------

function texteEcart(valeur, unite) {
  return unite === 'px' ? `${signe(valeur)} px` : `${signe(valeur / 1000, 2)} m`;
}

function texteTaille(m) {
  return `${nombre(m.largeurMm / 1000, 2)} × ${nombre(m.hauteurMm / 1000, 2)} m`;
}

function texteResolution(m) {
  return `${nombre(m.pxLargeur)} × ${nombre(m.pxHauteur)} px`;
}

function tuile(titre, valeur, ...details) {
  return el('div', { class: 'tuile' },
    el('dt', {}, titre),
    el('dd', {}, el('span', { class: 'tuile-valeur' }, valeur),
      details.filter(Boolean).map((d) => el('span', { class: 'tuile-detail' }, d))));
}

let dernier = null;

// Résumé texte du dernier calcul valide, pour « Copier les résultats ».
export function resumeOngletMur() {
  return dernier ? resumeMur(dernier) : null;
}

function afficherResultats(dalle, r) {
  dernier = r.erreurs.length > 0 ? null : { dalle, mur: r.mur };
  if (r.erreurs.length > 0) {
    remplacer(zoneResultats, el('div', { class: 'alerte alerte-erreur', role: 'alert' }, r.erreurs.join(' ')));
    return;
  }
  const m = r.mur;
  const unite = r.cible?.unite;
  const d = densite(dalle);

  const detailHauteurMm = `${m.lignes} × ${nombreCourt(dalle.hauteurMm)} mm`
    + (m.rangeeDemi ? ` + ${nombreCourt(m.demi.hauteurMm)} mm (demi)` : '');
  const detailHauteurPx = `${m.lignes} × ${dalle.pxV} px` + (m.rangeeDemi ? ` + ${m.demi.pxV} px (demi)` : '');

  const principal = el('div', { class: 'carte resultat-principal' },
    el('p', { class: 'chiffre-cle' }, `${m.colonnes} × ${m.lignes}`,
      el('span', {}, ` = ${nombre(m.dalles.entieres)} dalles`)),
    el('p', { class: 'sous-titre' }, 'colonnes × lignes, largeur en premier'),
    m.rangeeDemi ? el('p', { class: 'demi' },
      `+ ${m.dalles.demi} demi-dalles (${m.demi.nom}), rangée ${m.positionDemi === 'haut' ? 'en haut' : 'en bas'}. `
      + `Total : ${m.dalles.total} éléments.`) : null);

  const ecartTaille = unite === 'mm'
    ? `Écart : largeur ${texteEcart(r.ecart.largeur, 'mm')} · hauteur ${texteEcart(r.ecart.hauteur, 'mm')}` : null;
  const ecartResolution = unite === 'px'
    ? `Écart : largeur ${texteEcart(r.ecart.largeur, 'px')} · hauteur ${texteEcart(r.ecart.hauteur, 'px')}` : null;

  const tuiles = el('dl', { class: 'tuiles' },
    tuile('Taille', texteTaille(m), ecartTaille,
      `${m.colonnes} × ${nombreCourt(dalle.largeurMm)} mm ; ${detailHauteurMm}`),
    tuile('Résolution', texteResolution(m), ecartResolution,
      `${m.colonnes} × ${dalle.pxH} px ; ${detailHauteurPx}, pixels de la fiche`),
    tuile('Pixels', `${nombre(m.pxTotal)} px`),
    tuile('Surface', `${nombre(m.surfaceM2, 2)} m²`),
    tuile('Diagonale', `${nombre(m.diagonaleM, 2)} m`),
    tuile('Ratio', m.ratio.fraction ? `${m.ratio.fraction}` : `${nombre(m.ratio.valeur, 2)}:1`,
      m.ratio.fraction ? `soit ${nombre(m.ratio.valeur, 2)}:1` : null),
    tuile('Pitch', `${nombreCourt(d.pitchMm, 3)} mm`,
      `${nombreCourt(dalle.largeurMm)} mm / ${dalle.pxH} px`
      + (dalle.pitchMm ? ` · fiche : ${nombreCourt(dalle.pitchMm, 3)} mm` : '')),
    tuile('Densité', `${nombre(d.pxParM2)} px/m²`, `${nombreCourt(d.pxParM, 1)} px/m, sur les pixels de la fiche`),
    d.ledsParM2 !== null ? tuile('LED', `${nombre(d.ledsParM2)} LED/m²`, `${dalle.ledsParPixel} LED par pixel`) : null,
  );

  const source = el('p', { class: 'source' },
    `Dimensions et pixels : ${sourcesDimensions(dalle, m.demi)}.`);

  remplacer(zoneResultats, principal, tuiles, source, tableauVariantes(r));
}

function tableauVariantes(r) {
  const unite = r.cible?.unite;
  const lignes = r.variantes.map((v) => {
    const m = v.mur;
    const dalles = `${m.colonnes} × ${m.lignes}${m.rangeeDemi ? ' + ½' : ''} = ${m.dalles.total}`;
    const ecart = v.ecart
      ? ` · écart ${texteEcart(v.ecart.largeur, unite)} / ${texteEcart(v.ecart.hauteur, unite)}` : '';
    return el('tr', { class: v.horsContrainte ? 'hors-contrainte' : null },
      el('th', { scope: 'row' }, v.libelle),
      el('td', {},
        el('span', { class: 'variante-valeur' }, dalles,
          v.horsContrainte ? el('span', { class: 'badge badge-echec' }, 'dépasse') : null),
        el('span', { class: 'variante-detail' }, `${texteTaille(m)} · ${texteResolution(m)}${ecart}`)));
  });
  return el('section', { class: 'variantes', 'aria-labelledby': 'titre-variantes' },
    el('h3', { id: 'titre-variantes' }, 'Variantes à ±1 colonne ou ligne'),
    el('table', { class: 'table-variantes' }, el('tbody', {}, lignes)));
}

// ---------------------------------------------------------------------------
// Calcul à chaque saisie
// ---------------------------------------------------------------------------

function mettreAJour(fiches, surChangement) {
  const e = lireFormulaire();
  const dalle = fiches.get(e.dalleId);
  const demi = dalle.demiDalle ? fiches.get(dalle.demiDalle) ?? null : null;

  for (const groupe of formulaire.querySelectorAll('.groupe-mode')) {
    groupe.hidden = !groupe.dataset.modes.split(' ').includes(e.mode);
  }
  document.getElementById('bloc-demi').hidden = !demi;
  document.getElementById('libelle-demi').textContent = e.mode === 'dalles'
    ? 'Ajouter une rangée de demi-dalles' : 'Demi-dalles disponibles';
  document.getElementById('position-demi').hidden = !(demi && e.demi);

  afficherAlertesDalle(dalle);
  afficherFiche(dalle, demi);

  const avecDemi = Boolean(demi && e.demi);
  const options = {
    neDepassePasLargeur: e.neDepassePasLargeur,
    neDepassePasHauteur: e.neDepassePasHauteur,
    demi: avecDemi ? demi : null,
    positionDemi: e.positionDemi,
  };
  let demande;
  if (e.mode === 'taille') {
    demande = { mode: 'taille', largeurMm: metresEnMm(e.largeurM), hauteurMm: metresEnMm(e.hauteurM) };
  } else if (e.mode === 'resolution') {
    demande = { mode: 'resolution', largeurPx: e.largeurPx, hauteurPx: e.hauteurPx };
  } else {
    demande = { mode: 'dalles', colonnes: e.colonnes, lignes: e.lignes, rangeeDemi: avecDemi };
  }
  const resultat = dimensionner(dalle, demande, options);
  afficherResultats(dalle, resultat);
  surChangement({ dalle, mur: resultat.mur, erreurs: resultat.erreurs });
}

// `base` : { dalles, gabarits } déjà résolues. `surChangement({ dalle, mur, erreurs })` est appelé
// après chaque calcul, pour que les autres onglets suivent le mur.
let fichesMur = new Map();
let rappelMur = () => {};

// `base` : { dalles, gabarits, visibles, nomParc } déjà résolues ; `visibles` = dalles du parc actif.
// `surChangement({ dalle, mur, erreurs })` est appelé après chaque calcul, pour que les autres onglets suivent le mur.
export function initialiserMur(base, surChangement) {
  rappelMur = surChangement;
  formulaire.addEventListener('input', (evenement) => {
    if (evenement.target.name !== 'parc') mettreAJour(fichesMur, rappelMur);
  });
  formulaire.addEventListener('change', (evenement) => {
    if (evenement.target.name !== 'parc') mettreAJour(fichesMur, rappelMur);
  });
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
  actualiserMur(base);
}

// Nouvelle base (fiche ajoutée ou modifiée, parc changé) : liste des dalles et calcul à jour.
export function actualiserMur(base) {
  fichesMur = new Map([...base.dalles, ...base.gabarits].map((d) => [d.id, d]));
  remplirListe(document.getElementById('dalle'), base);
  mettreAJour(fichesMur, rappelMur);
}

export function signalerErreurMur(message) {
  remplacer(zoneResultats, el('div', { class: 'alerte alerte-erreur', role: 'alert' }, message));
}
