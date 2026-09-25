// Onglet Mur (dimensionnement). Aucune règle de calcul ici : tout passe par calculs.js,
// et chaque résultat affiche la valeur utilisée et sa source.

import { dimensionner, densite, pitchCalculeMm, dalleTournee } from './calculs.js';
import { nombre, nombreCourt, signe, sourceCourte, dateCourte, lireNombre } from './format.js';
import { el, remplacer } from './dom.js';
import { resumeMur } from './resumes.js';
import { optionsInformations, configsDuMur, arbreDalles } from './fiches.js';

const formulaire = document.getElementById('form-mur');
const zoneResultats = document.getElementById('resultats');

const BADGES = { modifiee: ' (version modifiée)', ajoutee: ' (ma fiche)' };

// Sélecteur caché « dalle » : toutes les dalles, puis les gabarits. Il garde la valeur retenue (saisies gardées) ;
// on choisit la dalle avec la marque, la gamme et la version. Garde la dalle choisie si elle y est encore.
function remplirListe(select, { dalles, gabarits, informations = [] }) {
  const avant = select.value;
  const option = (d) => el('option', { value: d.id },
    `${d.nom}${d.usage ? ` (${d.usage})` : ''}${BADGES[d.statutBase] ?? ''} — ${nombreCourt(d.largeurMm)} × ${nombreCourt(d.hauteurMm)} mm, ${d.pxH} × ${d.pxV} px`);
  // Fiches d'information : présentes, grisées, jamais choisies tant qu'elles ne sont pas complétées.
  const infos = optionsInformations(informations);
  remplacer(select,
    el('optgroup', { label: 'Dalles' }, dalles.map(option)),
    el('optgroup', { label: 'Gabarits génériques (non sourcés)' }, gabarits.map(option)),
    infos.length ? el('optgroup', { label: 'Fiches d\'information, à compléter' }, infos.map((o) => el('option', { value: o.id, disabled: '' }, o.libelle))) : null);
  if ([...dalles, ...gabarits].some((d) => d.id === avant)) select.value = avant;
  select.disabled = false;
}

// ---------------------------------------------------------------------------
// Choix de la dalle : recherche, marque, gamme, version (dalles du parc actif en premier)
// ---------------------------------------------------------------------------

const GABARITS = 'Gabarits génériques (non sourcés)';
let choix = { dalles: [], gabarits: [], informations: [], parc: null, nomParc: null };
// Gamme ouverte qui n'a que des fiches d'information : elle reste affichée tant qu'on ne choisit pas autre chose.
let vueInformation = false;
const $choix = (id) => document.getElementById(id);

function arbreChoix() {
  const recherche = $choix('recherche-dalle').value;
  const arbre = arbreDalles(choix.dalles, { informations: choix.informations, parc: choix.parc, recherche });
  const gabarits = arbreDalles(choix.gabarits.map((g) => ({ ...g, marque: GABARITS, gamme: 'Gabarits', modele: g.nom })), { recherche });
  return [...arbre, ...gabarits];
}

// Options groupées « Parc X » puis « Autres » quand un parc est actif.
function optionsGroupees(elements, valeur, libelle, autres) {
  const option = (x) => el('option', { value: valeur(x), disabled: x.information ? '' : null }, libelle(x));
  if (!choix.nomParc || !elements.some((x) => x.parc)) return elements.map(option);
  return [
    el('optgroup', { label: `Parc ${choix.nomParc}` }, elements.filter((x) => x.parc).map(option)),
    elements.some((x) => !x.parc) ? el('optgroup', { label: autres }, elements.filter((x) => !x.parc).map(option)) : null,
  ];
}

const selectionnable = (g) => g.fiches.find((f) => !f.information);

// Remplit les trois sélecteurs pour la dalle `id` (ou, à défaut, la marque et la gamme demandées) ;
// renvoie l'identifiant de la dalle retenue, ou null si la gamme n'a que des fiches d'information.
function remplirChoix({ id = formulaire.elements.dalle.value, marque = null, gamme = null } = {}) {
  const arbre = arbreChoix();
  const etat = $choix('etat-choix-dalle');
  const [selMarque, selGamme, selVersion] = ['dalle-marque', 'dalle-gamme', 'dalle-version'].map($choix);
  if (arbre.length === 0) {
    etat.textContent = `Aucune dalle pour « ${$choix('recherche-dalle').value.trim()} » : la dalle choisie ne change pas.`;
    return formulaire.elements.dalle.value;
  }
  let m = arbre.find((x) => x.marque === marque) ?? null;
  let g = m ? (m.gammes.find((x) => x.gamme === gamme) ?? m.gammes.find(selectionnable) ?? m.gammes[0]) : null;
  if (!m) {
    for (const x of arbre) {
      const trouvee = x.gammes.find((y) => y.fiches.some((f) => f.id === id));
      if (trouvee) [m, g] = [x, trouvee];
    }
  }
  if (!m) {
    m = arbre.find((x) => x.gammes.some(selectionnable)) ?? arbre[0];
    g = m.gammes.find(selectionnable) ?? m.gammes[0];
  }
  const fiche = g.fiches.find((f) => f.id === id && !f.information) ?? selectionnable(g) ?? null;
  remplacer(selMarque, optionsGroupees(arbre, (x) => x.marque, (x) => x.marque, 'Autres marques'));
  remplacer(selGamme, optionsGroupees(m.gammes, (x) => x.gamme, (x) => x.gamme, 'Autres gammes'));
  remplacer(selVersion, optionsGroupees(g.fiches, (x) => x.id, (x) => `${x.libelle}${x.information ? ' (information, à compléter)' : ''}`, 'Autres versions'));
  selMarque.value = m.marque;
  selGamme.value = g.gamme;
  if (fiche) selVersion.value = fiche.id;
  for (const sel of [selMarque, selGamme, selVersion]) sel.disabled = false;
  etat.textContent = fiche ? '' : `Gamme ${g.gamme} : fiches d'information seulement, à compléter dans l'onglet Base. La dalle choisie ne change pas.`;
  return fiche ? fiche.id : formulaire.elements.dalle.value;
}

// Choix fait dans un des sélecteurs ou par la recherche : la dalle retenue passe dans le sélecteur caché.
// Le calcul suit, par l'écouteur du formulaire (l'évènement remonte jusqu'à lui).
function retenirChoix(demande) {
  const id = remplirChoix(demande);
  vueInformation = Boolean($choix('etat-choix-dalle').textContent) && Boolean(demande.gamme || demande.marque);
  if (id && [...formulaire.elements.dalle.options].some((o) => o.value === id && !o.disabled)) formulaire.elements.dalle.value = id;
}

function initialiserChoix() {
  $choix('dalle-marque').addEventListener('change', (e) => retenirChoix({ id: null, marque: e.target.value }));
  $choix('dalle-gamme').addEventListener('change', (e) => retenirChoix({ id: null, marque: $choix('dalle-marque').value, gamme: e.target.value }));
  $choix('dalle-version').addEventListener('change', (e) => retenirChoix({ id: e.target.value }));
  $choix('recherche-dalle').addEventListener('input', () => retenirChoix({}));
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
    tourner: d.has('tourner'),
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
  { nom: 'rotationPossible', libelle: 'Rotation possible', unite: '' },
];

function valeurAvecUnite(valeur, unite) {
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
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
          `Autres valeurs : ${s.autres.map((x) => `${valeurAvecUnite(x.valeur, unite)} (${x.sources.map(sourceCourte).join(', ')}`
            + `${x.nonRetenue ? ', non retenue : corrigée par le constructeur' : ''})`).join(' ; ')}. `,
          s.conflitSansRegle ? 'Pas de règle pour choisir : à vérifier.' : (s.conflit ? 'La plus défavorable est retenue.' : 'Valeur du constructeur retenue.'),
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
    + `${s.date ? `, document du ${dateCourte(s.date)}` : `, date du document ${s.dateTexte ?? 'non précisée'}`}.`));

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
  // Dalle en plusieurs versions : celle qui est retenue, et où la régler.
  const info = [];
  if (dalle.declinaisons?.length) {
    const noms = dalle.declinaisons.map((x) => x.nom).join(' ou ');
    const defaut = dalle.declinaisons.find((x) => x.id === dalle.declinaisonDefaut)?.nom;
    info.push(dalle.declinaisonRetenue
      ? `Deux versions (${noms}) : version « ${dalle.declinaisonRetenue.nom} » réglée dans le parc ${dalle.declinaisonRetenue.parc}.`
      : `Deux versions (${noms}) : la plus défavorable est retenue (${defaut}). Règle la version du prestataire dans son parc (onglet Base).`);
  }
  // Pitch nominal (nom commercial) : simple information, les calculs prennent le pitch réel (largeur / pixels).
  if (dalle.pitchMm && dalle.sources?.pitchMm?.type === 'nominal') {
    info.push(`Pitch nominal ${nombreCourt(dalle.pitchMm, 3)} mm, réel ${nombreCourt(pitchCalculeMm(dalle), 3)} mm (largeur / pixels) : `
      + 'les calculs prennent le pitch réel.');
  } else if (dalle.pitchMm && Math.abs(pitchCalculeMm(dalle) - dalle.pitchMm) > 0.01) {
    alertes.push(`Le pitch de la fiche (${nombreCourt(dalle.pitchMm, 3)} mm) ne correspond pas à largeur / pixels `
      + `(${nombreCourt(pitchCalculeMm(dalle), 3)} mm) : vérifie la fiche.`);
  }
  remplacer(document.getElementById('alerte-dalle'), ...alertes.map((texte) => el('div', { class: 'alerte' }, texte)),
    ...info.map((texte) => el('div', { class: 'alerte alerte-info' }, texte)));
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

// ---------------------------------------------------------------------------
// Lots et configs du mur, dans le parc actif
// ---------------------------------------------------------------------------

// { base, parcId } : ma base et le parc actif (null : « Tous »).
let contexteLots = { base: null, parcId: null };

// Lots cochés à la main : { « parc:dalle » : [identifiants de lots] }, gardés dans un champ du formulaire.
function cochesManuelles() {
  try {
    return JSON.parse(formulaire.elements.lotsCoches.value || '{}') ?? {};
  } catch (erreur) {
    return {};
  }
}
function garderCoches(cle, ids) {
  const toutes = cochesManuelles();
  if (ids === null) delete toutes[cle];
  else toutes[cle] = ids;
  formulaire.elements.lotsCoches.value = Object.keys(toutes).length ? JSON.stringify(toutes) : '';
  // Recalcul et sauvegarde des saisies, comme après une saisie dans le formulaire.
  formulaire.dispatchEvent(new Event('change'));
}

// Groupes du mur qui ont leurs lots : les dalles entières, puis la rangée de demi-dalles (sa propre fiche).
function groupesLots(fiche, m) {
  const { parcId } = contexteLots;
  const toutes = cochesManuelles();
  const groupe = (dalleId, n, libelle) => ({ dalleId, n, libelle, coches: toutes[`${parcId}:${dalleId}`] ?? null });
  return [
    groupe(fiche.id, m.dalles.entieres, null),
    m.rangeeDemi && m.demi ? groupe(m.demi.id, m.dalles.demi, `Demi-dalles (${m.demi.nom})`) : null,
  ].filter(Boolean);
}

function sectionLots(groupes) {
  const { base, parcId } = contexteLots;
  if (!base || base.parcs.length === 0) return null;
  const nomParc = base.parcs.find((p) => p.id === parcId)?.nom;
  const blocs = groupes.map((g) => {
    const c = configsDuMur(base, parcId, g.dalleId, g.n, { coches: g.coches });
    if (c.note) return el('p', { class: 'note' }, c.note);
    const retenus = new Set(c.retenus.map((l) => l.id));
    const cases = c.lots.map((lot) => {
      const caseLot = el('input', { type: 'checkbox', checked: retenus.has(lot.id) ? '' : null });
      caseLot.addEventListener('change', () => {
        const ids = c.lots.filter((l) => (l.id === lot.id ? caseLot.checked : retenus.has(l.id))).map((l) => l.id);
        garderCoches(`${parcId}:${g.dalleId}`, ids);
      });
      return el('label', { class: 'case' }, caseLot,
        el('span', {}, `${lot.identifiant}${Number.isInteger(lot.quantite) ? ` (${pluriel(lot.quantite, 'dalle', 'dalles')})` : ' (quantité non saisie)'}`));
    });
    let retour = null;
    if (!c.parDefaut) {
      retour = el('button', { type: 'button', class: 'bouton bouton-petit bouton-discret' }, 'Revenir au choix par défaut');
      retour.addEventListener('click', () => garderCoches(`${parcId}:${g.dalleId}`, null));
    }
    return el('div', { class: 'lots-groupe' },
      g.libelle ? el('h4', {}, g.libelle) : null,
      cases.length ? el('div', { class: 'cases-lots' }, cases) : null,
      cases.length ? el('p', { class: 'compte' }, c.parDefaut
        ? `Cochés par défaut pour ${pluriel(g.n, 'dalle', 'dalles')}.` : 'Cochés à la main.', retour ? [' ', retour] : null) : null,
      c.lignes.filter((l) => !l.startsWith('Lots utilisés')).map((l) => el('p', { class: 'ligne-config' }, l)),
      c.alertes.map((a) => el('div', { class: 'alerte' }, a)));
  });
  return el('section', { class: 'carte lots-mur', 'aria-labelledby': 'titre-lots-mur' },
    el('h3', { id: 'titre-lots-mur' }, nomParc ? `Lots et configs, parc ${nomParc}` : 'Lots et configs'),
    blocs);
}

const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;

let dernier = null;

// Résumé texte du dernier calcul valide, pour « Copier les résultats ».
export function resumeOngletMur() {
  return dernier ? resumeMur(dernier) : null;
}

function afficherResultats(dalle, r, groupes = []) {
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
      + (dalle.pitchMm ? ` · ${dalle.sources?.pitchMm?.type === 'nominal' ? 'nominal' : 'fiche'} : ${nombreCourt(dalle.pitchMm, 3)} mm` : '')),
    tuile('Densité', `${nombre(d.pxParM2)} px/m²`, `${nombreCourt(d.pxParM, 1)} px/m, sur les pixels de la fiche`),
    d.ledsParM2 !== null ? tuile('LED', `${nombre(d.ledsParM2)} LED/m²`, `${dalle.ledsParPixel} LED par pixel`) : null,
  );

  const source = el('p', { class: 'source' },
    `Dimensions et pixels : ${sourcesDimensions(dalle, m.demi)}.`);

  remplacer(zoneResultats, principal, tuiles, source, sectionLots(groupes), tableauVariantes(r));
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
  // Dalle retenue (saisie gardée, changement de parc) : les trois sélecteurs la montrent.
  if (!vueInformation) remplirChoix();
  const e = lireFormulaire();
  const fiche = fiches.get(e.dalleId);
  // Rotation : proposée seulement si la fiche, ou le parc actif, la permet. La dalle tournée n'a pas de demi-dalle.
  const peutTourner = fiche.rotationPossible === true;
  document.getElementById('bloc-rotation').hidden = !peutTourner;
  const sourceRotation = fiche.sources?.rotationPossible?.sources.map(sourceCourte).join(', ');
  document.getElementById('source-rotation').textContent = peutTourner && sourceRotation ? `Rotation permise : ${sourceRotation}.` : '';
  const dalle = peutTourner && e.tourner ? dalleTournee(fiche) : fiche;
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
  // Lots : ceux de la fiche d'origine (une dalle tournée garde ses lots).
  const groupes = resultat.erreurs.length ? [] : groupesLots(fiche, resultat.mur);
  afficherResultats(dalle, resultat, groupes);
  surChangement({ dalle, mur: resultat.mur, erreurs: resultat.erreurs, lots: groupes });
}

// `base` : { dalles, gabarits } déjà résolues. `surChangement({ dalle, mur, erreurs })` est appelé
// après chaque calcul, pour que les autres onglets suivent le mur.
let fichesMur = new Map();
let rappelMur = () => {};

// `base` : { dalles, gabarits, visibles, nomParc } déjà résolues ; `visibles` = dalles du parc actif.
// `surChangement({ dalle, mur, erreurs })` est appelé après chaque calcul, pour que les autres onglets suivent le mur.
export function initialiserMur(base, surChangement) {
  rappelMur = surChangement;
  initialiserChoix();
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
  vueInformation = false;
  fichesMur = new Map([...base.dalles, ...base.gabarits].map((d) => [d.id, d]));
  contexteLots = base.lots ?? { base: null, parcId: null };
  choix = {
    dalles: base.dalles, gabarits: base.gabarits, informations: base.informations ?? [],
    parc: base.nomParc ? new Set(base.visibles.map((d) => d.id)) : null, nomParc: base.nomParc ?? null,
  };
  remplirListe(document.getElementById('dalle'), base);
  mettreAJour(fichesMur, rappelMur);
}

export function signalerErreurMur(message) {
  remplacer(zoneResultats, el('div', { class: 'alerte alerte-erreur', role: 'alert' }, message));
}
