// Onglet Data et processeur. Aucune règle de calcul ici : tout passe par calculs.js,
// et chaque résultat affiche la valeur utilisée et sa source.

import {
  evaluerProcesseur, processeurConseille, entierInferieur, champsManquants,
  BIT_DEPTH_PAR_DEFAUT, RAPPEL_TESSERA, LIBELLES_COIN, ErreurSaisie,
} from './calculs.js';
import { nombre, nombreCourt, sourceCourte, lireNombre } from './format.js';
import { el, remplacer } from './dom.js';
import { alertesSansManques, ligneManques } from './manques.js';
import { resumeData } from './resumes.js';

const formulaire = document.getElementById('form-data');
const zone = document.getElementById('resultats-data');

let processeurs = [];
let distributeurs = new Map();
let sources = {};
let etatMur = null;
let familleAffichee = null;
let surChangement = () => {};
let nomParc = null;
// Coin de départ du câblage data, choisi dans l'onglet Schéma : le serpentin au plus juste en dépend.
let departData = 'haut-gauche';

const NOMS_FAMILLE = { brompton: 'Brompton', novastar: 'Novastar et COEX', colorlight: 'Colorlight' };
const LIBELLES_MANQUANTS = {
  capacite: 'capacité par port',
  pixelsMax: 'pixels maxi',
  ports: 'nombre de ports',
  largeurMaxPx: 'largeur maxi',
  hauteurMaxPx: 'hauteur maxi',
};
const texteManquants = (manquants) => manquants.map((m) => LIBELLES_MANQUANTS[m]).join(', ');
const LIBELLES_CONTROLE = {
  pixels: 'Pixels',
  largeur: 'Largeur de canvas',
  hauteur: 'Hauteur de canvas',
  ports: 'Ports',
  dalles: 'Dalles',
};
const CHAMP_LIMITE = { pixels: 'pixelsMax', largeur: 'largeurMaxPx', hauteur: 'hauteurMaxPx', ports: 'ports', dalles: 'dallesMax' };

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------

function lireFormulaire() {
  const d = new FormData(formulaire);
  return {
    famille: d.get('famille'),
    processeur: d.get('processeur'),
    frequenceHz: lireNombre(d.get('frequence')),
    bits: Number(d.get('bits')),
    redondance: d.has('redondance'),
    ull: d.has('ull'),
    cartesPro: d.has('cartesPro'),
    modeOptique: d.has('modeOptique'),
  };
}

// Change de marque : liste de ses processeurs et bit depth par défaut de la marque.
function preparerFamille(famille, garderReglages = false) {
  const select = formulaire.elements.processeur;
  const avant = select.value;
  remplacer(select,
    el('option', { value: 'conseille' }, 'Conseillé (le moins de processeurs)'),
    processeurs.filter((p) => p.famille === famille).map((p) => {
      const manquants = champsManquants(p);
      const badge = { modifiee: ' (version modifiée)', ajoutee: ' (ma fiche)' }[p.statutBase] ?? '';
      return el('option', { value: p.id, disabled: manquants.length > 0 ? '' : null },
        `${p.nom}${badge}${manquants.length > 0 ? ' (à compléter)' : ''}`);
    }),
  );
  if ([...select.options].some((o) => o.value === avant && !o.disabled)) select.value = avant;
  if (!garderReglages) {
    for (const radio of formulaire.querySelectorAll('input[name="bits"]')) {
      radio.checked = Number(radio.value) === BIT_DEPTH_PAR_DEFAUT[famille];
    }
  }
  for (const bloc of formulaire.querySelectorAll('[data-famille]')) bloc.hidden = bloc.dataset.famille !== famille;
  familleAffichee = famille;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const millions = (px) => `${nombre(px / 1e6, 2)} M px`;
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);

function tuile(titre, valeur, ...details) {
  return el('div', { class: 'tuile' },
    el('dt', {}, titre),
    el('dd', {}, el('span', { class: 'tuile-valeur' }, valeur),
      details.filter(Boolean).map((d) => el('span', { class: 'tuile-detail' }, d))));
}

function texteCharge(charge) {
  return `port le plus chargé : ${nombre(charge.taux * 100, 1)} %`;
}

function sourceLimite(proc, champ) {
  const s = proc.sources[champ];
  return s ? s.sources.map(sourceCourte).join(', ') : '';
}

function sourceFormat(proc, nomFormat) {
  const format = (proc.formatsCanvas ?? []).find((f) => f.nom === nomFormat);
  const s = format && sources[format.source];
  return s ? sourceCourte(s) : '';
}

// Champ de la fiche qui donne la limite de ports appliquée (redondance, mode optique ou cuivre).
function champPorts(r) {
  const proc = r.processeur;
  if (r.reglages.redondance && proc.portsRedondance) return 'portsRedondance';
  return r.reglages.modeOptique ? 'portsOptionOptique' : 'ports';
}

function nomDistributeur(proc) {
  const d = distributeurs.get(proc.distributeur);
  if (!d) return null;
  return proc.distributeurObligatoire ? d.modele : `${d.modele} (si fibre)`;
}

function sectionPorts(e, dalle, r) {
  const g = r.global;
  const proc = r.processeur;
  const compte = r.pxParDalle !== dalle.pxH * dalle.pxV
    ? `compté ${Math.max(dalle.pxH, proc.pxMinParDimension)} × ${Math.max(dalle.pxV, proc.pxMinParDimension)} px (minimum ${proc.nom})`
    : `${dalle.pxH} × ${dalle.pxV} px, pixels de la fiche`;
  const demi = r.pxParDemi ? `demi-dalle : ${nombre(r.pxParDemi)} px, ses vrais pixels pour la charge des ports` : null;
  const colonnes = g.colonnes.colonnesParPort
    ? `${pluriel(g.colonnes.colonnesParPort, 'colonne', 'colonnes')} de ${g.colonnes.segments[0]} dalles par port`
    : `chaque colonne en ${g.colonnes.segments.length} segments : ${g.colonnes.segments.join(' + ')}`;
  const redondance = (n) => (e.redondance ? `redondance : ${n} ports` : `${n} ports en redondance`);

  const champCapacite = proc[`capacitePort60Hz${r.reglages.bits}bits`] !== undefined ? `capacitePort60Hz${r.reglages.bits}bits` : 'debitUtileBps';
  const qualite = [r.capaciteDeduite ? 'déduit' : null, r.capaciteAConfirmer ? 'à confirmer' : null].filter(Boolean).join(', ');

  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Ports — ${proc.nom}`),
    el('dl', { class: 'tuiles' },
      tuile(`Capacité par port${proc.typePorts ? ` ${proc.typePorts}` : ''}`, `${nombre(entierInferieur(r.capacite))} px`, r.formule,
        `source : ${sourceLimite(proc, champCapacite)}`, qualite ? `valeur ${qualite}` : null),
      tuile('Pixels par dalle', `${nombre(r.pxParDalle)} px`, compte, demi),
      tuile('Dalles par port', nombre(r.dallesParPort),
        `partie entière de ${nombre(entierInferieur(r.capacite))} / ${nombre(r.pxParDalle)}`,
        r.plafondBoucle ? `plafonné à ${proc.maxDallesParBoucleRedondance} par boucle en redondance` : null),
      tuile('Ports au plus juste', nombre(g.serpentin.ports), `serpentin depuis ${LIBELLES_COIN[g.serpentin.depart]}`,
        g.serpentin.ecart ? `décompte théorique : ${nombre(g.auPlusJuste)}` : null,
        redondance(2 * g.serpentin.ports), texteCharge(g.serpentin.chargeMax),
        g.auPlusJusteRealisable ? null : 'non réalisable tel quel dans NovaLCT'),
      g.rectangles
        ? tuile('Conseil NovaLCT', nombre(g.rectangles.ports),
          `rectangles de ${pluriel(g.rectangles.colonnes, 'colonne', 'colonnes')} × ${pluriel(g.rectangles.rangees, 'rangée', 'rangées')}`,
          redondance(g.rectangles.redondance), 'chaque port compte le rectangle qui englobe ses dalles')
        : null,
      tuile('Ports en colonnes entières', nombre(g.colonnes.ports), colonnes, redondance(g.redondance.colonnes),
        texteCharge(g.chargeMax.colonnes)),
      g.seuil.dallesEnMoins !== null
        ? tuile('Seuil', pluriel(g.seuil.dallesEnMoins, 'dalle', 'dalles'), 'en moins évitent un port (au plus juste)')
        : null));
}

function tableControles(r) {
  const proc = r.processeur;
  const valeur = (nom, c) => {
    if (nom === 'pixels') return millions(c.valeur);
    if (nom === 'largeur' || nom === 'hauteur') return `${nombre(c.valeur)} px`;
    return nombre(c.valeur);
  };
  const limite = (nom, c) => {
    if (nom === 'pixels') return `${millions(c.limite)}${proc.pixelsGamme ? ` (gamme ${proc.pixelsGamme})` : ''}`;
    if (nom === 'largeur') return `${nombre(c.limite)} px${c.format ? ` en ${c.format}` : ''}, soit ${c.colonnesMax} colonnes`;
    if (nom === 'hauteur') return `${nombre(c.limite)} px`;
    return nombre(c.limite);
  };
  const source = (nom, c) => {
    if (nom === 'largeur' && c.format) return sourceFormat(proc, c.format);
    return sourceLimite(proc, nom === 'ports' ? champPorts(r) : CHAMP_LIMITE[nom]);
  };
  const libellePorts = [r.reglages.redondance ? 'redondance' : null, r.reglages.modeOptique ? 'mode optique' : null].filter(Boolean);
  const lignes = Object.entries(r.controles).map(([nom, c]) => el('tr', { class: c.nombre > 1 ? 'limite' : null },
    el('th', { scope: 'row' }, nom === 'ports' && libellePorts.length
      ? `${c.principaux ? 'Ports principaux' : 'Ports'} (${libellePorts.join(', ')})` : LIBELLES_CONTROLE[nom]),
    el('td', {}, valeur(nom, c)),
    el('td', {}, limite(nom, c), el('span', { class: 'source-ligne' }, source(nom, c))),
    el('td', { class: 'nombre' }, Number.isFinite(c.nombre) ? nombre(c.nombre) : '—')));
  return el('div', { class: 'tableau-defilant' },
    el('table', { class: 'table-donnees' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Contrôle'), el('th', {}, 'Mur'), el('th', {}, `Limite ${proc.modele}`), el('th', {}, 'Nb'))),
      el('tbody', {}, lignes)));
}

function tableDecoupage(r) {
  const proc = r.processeur;
  const distributeur = nomDistributeur(proc);
  const red = r.reglages.redondance;
  const ports = (p) => (red
    ? `${p.redondance.colonnes} (${2 * p.auPlusJusteSerpentin} au plus juste)`
    : `${p.colonnes} (${p.auPlusJusteSerpentin} au plus juste)`);
  const lignes = r.groupes.map((g, i) => el('tr', {},
    el('th', { scope: 'row' }, `n° ${i + 1}`),
    el('td', {}, `${g.premiereColonne} à ${g.derniereColonne}`,
      el('span', { class: 'source-ligne' }, pluriel(g.colonnes, 'colonne', 'colonnes')),
      r.grille.rangees > 1 ? el('span', { class: 'source-ligne' }, `rangées ${g.premiereRangee} à ${g.derniereRangee}`) : null,
      g.format ? el('span', { class: 'source-ligne' }, `canvas ${g.format}`) : null),
    el('td', {}, nombre(g.dalles), el('span', { class: 'source-ligne' }, millions(g.px))),
    el('td', {}, ports(g.ports), el('span', { class: 'source-ligne' }, texteCharge(g.chargeMax))),
    distributeur ? el('td', { class: 'nombre' }, nombre(red ? g.distributeurs.redondance : g.distributeurs.colonnes)) : null));
  const t = r.totaux;
  const total = el('tr', { class: 'total' },
    el('th', { scope: 'row' }, 'Total'),
    el('td', {}, pluriel(r.groupes.filter((g) => g.premiereRangee === 1).reduce((s, g) => s + g.colonnes, 0), 'colonne', 'colonnes'),
      r.grille.rangees > 1
        ? el('span', { class: 'source-ligne' }, pluriel(r.groupes.filter((g) => g.premiereColonne === 1).reduce((s, g) => s + g.rangees, 0), 'rangée', 'rangées'))
        : null),
    el('td', {}, nombre(r.groupes.reduce((s, g) => s + g.dalles, 0))),
    el('td', {}, ports(red ? { redondance: t.ports.redondance } : t.ports)),
    distributeur ? el('td', { class: 'nombre' }, nombre(red ? t.distributeurs.redondance : t.distributeurs.colonnes)) : null);
  return el('div', { class: 'tableau-defilant' },
    el('table', { class: 'table-donnees' },
      el('thead', {}, el('tr', {},
        el('th', {}, proc.modele), el('th', {}, 'Colonnes'), el('th', {}, 'Dalles'),
        el('th', {}, red ? 'Ports (redondance)' : 'Ports'),
        distributeur ? el('th', {}, distributeur) : null)),
      el('tbody', {}, lignes, total)));
}

function sectionProcesseur(r, conseil) {
  const proc = r.processeur;
  const titre = el('h3', {}, 'Processeur', r === conseil ? el('span', { class: 'badge badge-reussi' }, 'conseillé') : null);
  if (r.impossible) {
    return el('section', { class: 'bloc-resultats' }, titre, alerte(r.impossible, 'alerte-erreur'), r.global ? tableControles(r) : null);
  }
  const g = r.global;
  const distributeur = nomDistributeur(proc);
  const globalTexte = `Décompte global, sans découpage par processeur : ${g.serpentin.ports} ports au plus juste`
    + `${g.distributeurs && distributeur ? ` (${Math.ceil(g.serpentin.ports / proc.sortiesParDistributeur)} ${distributeur})` : ''}, `
    + `${g.colonnes.ports} en colonnes entières`
    + `${g.distributeurs && distributeur ? ` (${g.distributeurs.colonnes} ${distributeur})` : ''}.`;
  return el('section', { class: 'bloc-resultats' },
    titre,
    el('div', { class: 'carte resultat-principal' },
      el('p', { class: 'chiffre-cle' }, `${r.nombre} × ${proc.modele}`),
      el('p', { class: 'sous-titre' }, r.unSeulSuffit
        ? `Un seul ${proc.nom} suffit.`
        : `Limité par : ${r.limites.map((l) => LIBELLES_CONTROLE[l].toLowerCase()).join(', ')}. `
          + (r.grille.rangees > 1
            ? `Mur découpé en grille : ${pluriel(r.grille.colonnes, 'bloc', 'blocs')} de colonnes × ${pluriel(r.grille.rangees, 'bloc', 'blocs')} de rangées.`
            : 'Mur découpé en colonnes entières.')),
      r.seuil.colonnesEnMoins
        ? el('p', { class: 'demi' }, `${pluriel(r.seuil.colonnesEnMoins, 'colonne', 'colonnes')} en moins évitent un ${proc.nom}.`)
        : null),
    tableControles(r),
    el('p', { class: 'source' }, 'Ports comptés en colonnes entières. Le nombre de processeurs est le plus grand des contrôles.'),
    el('h4', {}, r.grille.rangees > 1 ? 'Découpage en grille' : 'Découpage en colonnes entières'),
    tableDecoupage(r),
    el('p', { class: 'source' }, globalTexte),
    el('p', { class: 'source' }, [
      proc.entrees ? `Entrées : ${proc.entrees}.` : null,
      proc.latence ? ` Latence : ${proc.latence}.` : null,
      proc.note ? ` ${proc.note}` : null,
    ].filter(Boolean).join('')));
}

function sectionAutres(e, evaluations, choisie) {
  const lignes = evaluations.map((r) => {
    const p = r.processeur;
    let resultat;
    if (r.aCompleter?.length) resultat = [el('strong', {}, 'à compléter'), el('span', { class: 'source-ligne' }, `manque : ${texteManquants(r.aCompleter)}`)];
    else if (r.nombre === null) resultat = [el('strong', {}, 'impossible'), el('span', { class: 'source-ligne' }, r.impossible)];
    else if (r.nombre === 1) resultat = '1 suffit';
    else resultat = `${r.nombre} nécessaires (${r.limites.map((l) => LIBELLES_CONTROLE[l].toLowerCase()).join(', ')})`;
    return el('tr', { class: r === choisie ? 'choisi' : (r.aCompleter?.length ? 'a-completer' : null) },
      el('th', { scope: 'row' }, p.modele),
      el('td', {}, p.pixelsGamme ?? (p.pixelsMax ? millions(p.pixelsMax) : '—')),
      el('td', { class: 'nombre' }, p.ports ? `${nombre(p.ports)}${p.typePorts ? ` × ${p.typePorts}` : ''}` : '—'),
      el('td', {}, resultat));
  });
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Processeurs ${NOMS_FAMILLE[e.famille]}${nomParc ? ` du parc ${nomParc}` : ''}`),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Modèle'), el('th', {}, 'Pixels'), el('th', {}, 'Ports'), el('th', {}, 'Pour ce mur'))),
        el('tbody', {}, lignes))));
}

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

let dernier = null;

// Résumé texte du dernier calcul, pour « Copier les résultats ».
export function resumeOngletData() {
  return dernier ? resumeData(dernier.choisie, dernier) : null;
}

// Calcule et affiche ; renvoie le processeur retenu (ou null) pour l'onglet Canvas.
function calculer(e) {
  dernier = null;
  if (!etatMur) return null;
  if (!etatMur.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return null;
  }
  const { dalle, mur } = etatMur;
  const reglages = {
    frequenceHz: e.frequenceHz, bits: e.bits, ull: e.ull, cartesPro: e.cartesPro, redondance: e.redondance, modeOptique: e.modeOptique,
    departCablage: departData,
  };

  const candidats = processeurs.filter((p) => p.famille === e.famille);
  if (candidats.length === 0) {
    remplacer(zone, alerte(`Aucun processeur ${NOMS_FAMILLE[e.famille]} dans le parc ${nomParc ?? 'actif'} : `
      + 'choisis une autre marque, un autre parc, ou « Tous ».', 'alerte-erreur'));
    return null;
  }
  let evaluations;
  try {
    evaluations = candidats.map((p) => evaluerProcesseur(mur, dalle, p, reglages));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return null;
  }
  const conseil = processeurConseille(evaluations);
  const choisie = e.processeur === 'conseille' ? conseil : evaluations.find((r) => r.processeur.id === e.processeur);

  const alertes = [];
  if (e.famille === 'brompton') alertes.push(alerte(`${RAPPEL_TESSERA}.`, 'alerte-info'));
  alertes.push(ligneManques(choisie?.manques));
  for (const texte of alertesSansManques(choisie?.alertes ?? [], choisie?.manques)) alertes.push(alerte(texte));
  if (!choisie) {
    remplacer(zone, ...alertes, alerte('Aucun processeur de cette marque ne convient à ce mur.', 'alerte-erreur'),
      sectionAutres(e, evaluations, null));
    return null;
  }
  if (choisie.global) {
    const { colonnes } = choisie.global.chargeMax;
    if (choisie.global.serpentin.ecart) alertes.push(alerte(choisie.global.serpentin.ecart, 'alerte-info'));
    for (const [charge, cablage] of [[choisie.global.serpentin.chargeMax, 'au plus juste'], [colonnes, 'en colonnes entières']]) {
      if (charge.auDela95) {
        alertes.push(alerte(`Câblage ${cablage} : un port est chargé à ${nombre(charge.taux * 100, 1)} %, `
          + 'au-delà de 95 %. Garde de la marge.'));
      }
    }
  }

  const carte = [dalle.carteReceptionMarque, dalle.carteReceptionModele].filter(Boolean).join(' ');
  const sourceCarte = dalle.sources?.carteReceptionModele ?? dalle.sources?.carteReceptionMarque;
  const recap = el('p', { class: 'recap-mur' },
    `Mur : ${mur.colonnes} × ${mur.lignes}${mur.rangeeDemi ? ' + rangée de demi-dalles' : ''} = ${pluriel(mur.dalles.total, 'dalle', 'dalles')} `
    + `${dalle.nom}, ${nombre(mur.pxLargeur)} × ${nombre(mur.pxHauteur)} px (${millions(mur.pxTotal)}). `
    + (carte ? `Carte de réception : ${carte}${sourceCarte ? ` (${sourceCarte.sources.map(sourceCourte).join(', ')})` : ''}. ` : ''),
    el('a', { href: '#mur' }, 'Modifier le mur'));

  dernier = { choisie, conseille: choisie === conseil, distributeur: nomDistributeur(choisie.processeur) };
  remplacer(zone, recap,
    ...alertes,
    choisie.global ? sectionPorts(e, dalle, choisie) : null,
    sectionProcesseur(choisie, conseil),
    sectionAutres(e, evaluations, choisie),
  );
  return choisie;
}

function mettreAJour() {
  const e = lireFormulaire();
  if (e.famille !== familleAffichee) preparerFamille(e.famille);
  const choisie = calculer(lireFormulaire());
  surChangement({
    famille: e.famille,
    reglages: { frequenceHz: e.frequenceHz, bits: e.bits, redondance: e.redondance },
    choisie,
    dalle: etatMur?.dalle ?? null,
    mur: etatMur?.mur ?? null,
  });
}

// `base` : { processeurs, distributeurs, sources } déjà résolus. `rappel(etat)` reçoit le processeur retenu
// et les réglages data après chaque calcul, pour l'onglet Canvas.
export function initialiserData(base, rappel = () => {}) {
  surChangement = rappel;
  const siPasParc = (evenement) => {
    if (evenement.target.name !== 'parc') mettreAJour();
  };
  formulaire.addEventListener('input', siPasParc);
  formulaire.addEventListener('change', siPasParc);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
  actualiserData(base, true);
}

// Nouvelle base ou nouveau parc actif : `base.processeurs` ne contient que les processeurs du parc actif.
export function actualiserData(base, premiereFois = false) {
  processeurs = base.processeurs;
  distributeurs = new Map(base.distributeurs.map((d) => [d.id, d]));
  sources = base.sources;
  nomParc = base.nomParc ?? null;
  preparerFamille(lireFormulaire().famille, !premiereFois);
  if (!premiereFois) mettreAJour();
}

// Appelé par l'onglet Schéma quand le coin de départ du câblage data change.
export function definirDepartData(depart) {
  departData = depart;
  if (etatMur) mettreAJour();
}

// Appelé par l'onglet Mur après chaque calcul.
export function murModifie(etat) {
  etatMur = etat;
  mettreAJour();
}
