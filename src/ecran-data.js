// Onglet Data et processeur. Aucune règle de calcul ici : tout passe par calculs.js,
// et chaque résultat affiche la valeur utilisée et sa source.

import {
  evaluerProcesseur, evaluerToutesMarques, processeurConseille, entierInferieur,
  BIT_DEPTH_PAR_DEFAUT, rappelTessera, gainDixBits, LIBELLES_COIN, ErreurSaisie,
} from './calculs.js';
import { nombre, nombreCourt, sourceCourte, lireNombre } from './format.js';
import { el, remplacer } from './dom.js';
import { alertesSansManques, ligneManques } from './manques.js';
import { resumeData, consommationProcesseur, resumeAvantDePartir, texteCapaciteAppareil, texteLatence } from './resumes.js';
import { configsDuMur, logicielDuProcesseur, texteLogicielParc, avantDePartir, arbreProcesseurs, MARQUES_FAMILLE } from './fiches.js';
import { listerFichiers } from './stockage.js';
import { rappelsConfig } from './rappels.js';

const formulaire = document.getElementById('form-data');
const zone = document.getElementById('resultats-data');

let processeurs = [];
// Fiches d'information (VX4, MCTRL610) : grisées dans le choix du processeur.
let informations = [];
let distributeurs = new Map();
let sources = {};
let etatMur = null;
let familleAffichee = null;
let surChangement = () => {};
let nomParc = null;
// Profondeur réseau par défaut de chaque marque dans le parc actif : { bits, source } (réglage du parc ou défaut).
let bitsParDefaut = {};
// Cartes de réception de la base, pour le contrôle d'une carte face à la dalle.
let cartesReception = [];
const defautBits = (famille) => bitsParDefaut[famille] ?? { bits: BIT_DEPTH_PAR_DEFAUT[famille], source: 'défaut' };
// Profondeur choisie et d'où elle vient : défaut de la marque, réglage du parc, ou réglage à la main.
function origineBits(famille, bits) {
  const d = defautBits(famille);
  return bits === d.bits ? d.source : `réglé à la main (défaut : ${d.bits} bits, ${d.source})`;
}
function cocherBits(bits) {
  for (const radio of formulaire.querySelectorAll('input[name="bits"]')) radio.checked = Number(radio.value) === bits;
}
// Coin de départ du câblage data, choisi dans l'onglet Schéma : le serpentin au plus juste en dépend.
let departData = 'haut-gauche';
// { base, parcId } : ma base et le parc actif, pour les lots, les configs et la version des logiciels.
let contexteLots = { base: null, parcId: null };
// Fichiers joints présents sur l'appareil (identifiants), pour la check-list ; null tant que non lus.
let presents = null;
let derniereListe = null;

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
  cartes: 'Cartes de sortie',
};
const CHAMP_LIMITE = { pixels: 'pixelsMax', largeur: 'largeurMaxPx', hauteur: 'hauteurMaxPx', ports: 'ports', dalles: 'dallesMax', cartes: 'emplacementsSortie' };

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
    carteSortie: d.get('carteSortie') || 'auto',
  };
}

// Change de marque : bit depth par défaut de la marque et réglages propres à sa famille (ULL, cartes de sortie…).
function preparerFamille(famille, garderReglages = false) {
  if (!garderReglages) cocherBits(defautBits(famille).bits);
  for (const bloc of formulaire.querySelectorAll('[data-famille]')) bloc.hidden = bloc.dataset.famille !== famille;
  familleAffichee = famille;
}

// ---------------------------------------------------------------------------
// Choix du processeur : recherche, marque (famille de calcul), gamme, modèle
// ---------------------------------------------------------------------------

const $choix = (id) => document.getElementById(id);
const CONSEILS = [
  ['conseille', 'Conseillé dans la marque (le moins de processeurs)'],
  ['conseille-tout', 'Conseillé, toutes marques du parc'],
];
const estConseil = (valeur) => CONSEILS.some(([v]) => v === valeur);
const BADGES = { modifiee: ' (version modifiée)', ajoutee: ' (ma fiche)' };
const choisissable = (f) => !f.information && !f.aCompleter && !f.calculHorsAppli;
const libelleModele = (f) => {
  const precisions = [f.statut, f.information ? 'information à compléter' : null, f.calculHorsAppli, !f.information && f.aCompleter ? 'à compléter' : null].filter(Boolean);
  return `${f.modele}${BADGES[f.statutBase] ?? ''}${precisions.length ? ` (${precisions.join(', ')})` : ''}`;
};

// Sélecteur caché « processeur » : les deux conseils et tous les processeurs du parc ; il garde la valeur retenue.
function remplirCache() {
  const select = formulaire.elements.processeur;
  const avant = select.value;
  remplacer(select, CONSEILS.map(([v, t]) => el('option', { value: v }, t)), processeurs.map((p) => el('option', { value: p.id }, p.nom)));
  select.value = [...select.options].some((o) => o.value === avant) ? avant : 'conseille';
}

// Remplit marque, gamme et modèle, et renvoie { id, famille } retenus :
//   - { marque } : cette marque, sa première gamme ; le conseil reste (conseil dans la marque par défaut) ;
//   - { marque, gamme } : cette gamme et son premier modèle ;
//   - { id } : ce modèle ou ce conseil ;
//   - { recherche: true } : le premier modèle trouvé ;
//   - rien : l'état des valeurs retenues (saisies gardées, nouveau parc).
function remplirChoixProcesseur(demande = {}) {
  const cache = formulaire.elements.processeur;
  const actuel = { id: cache.value || 'conseille', famille: formulaire.elements.famille.value };
  const q = $choix('recherche-processeur').value.trim();
  const arbre = arbreProcesseurs(processeurs, { informations, recherche: q });
  const etat = $choix('etat-choix-processeur');
  const [selMarque, selGamme, selModele] = ['processeur-marque', 'processeur-gamme', 'processeur-modele'].map($choix);
  if (arbre.length === 0) {
    etat.textContent = `Aucun processeur pour « ${q} » : le choix ne change pas.`;
    return actuel;
  }
  const idVoulu = demande.id ?? actuel.id;
  const trouver = (pred) => {
    for (const m of arbre) for (const g of m.gammes) { const f = g.fiches.find(pred); if (f) return { m, g, f }; }
    return null;
  };
  let m = null;
  let g = null;
  let id = idVoulu;
  if (demande.marque) {
    m = arbre.find((x) => x.marque === demande.marque) ?? arbre[0];
    g = (demande.gamme && m.gammes.find((x) => x.gamme === demande.gamme)) || m.gammes.find((x) => x.fiches.some(choisissable)) || m.gammes[0];
    const premier = g.fiches.find(choisissable);
    if (demande.gamme) id = premier?.id ?? (estConseil(actuel.id) ? actuel.id : 'conseille');
    else id = estConseil(actuel.id) ? actuel.id : 'conseille';
  } else if (demande.recherche && q) {
    const t = trouver(choisissable);
    if (t) ({ m, g } = t);
    id = t ? t.f.id : actuel.id;
  }
  if (!m && !estConseil(id)) {
    const t = trouver((f) => f.id === id);
    if (t) ({ m, g } = t);
  }
  // Conseil ou valeurs remises : la marque et la gamme affichées restent quand elles conviennent.
  if (!m) m = arbre.find((x) => x.marque === selMarque.value && x.famille === actuel.famille) ?? arbre.find((x) => x.famille === actuel.famille) ?? arbre[0];
  if (!g && estConseil(id)) g = m.gammes.find((x) => x.gamme === selGamme.value) ?? null;
  if (!g) g = m.gammes.find((x) => x.fiches.some(choisissable)) ?? m.gammes[0];
  if (!estConseil(id) && !g.fiches.some((f) => f.id === id && choisissable(f))) id = 'conseille';
  remplacer(selMarque, arbre.map((x) => el('option', { value: x.marque }, x.marque)));
  remplacer(selGamme, m.gammes.map((x) => el('option', { value: x.gamme }, x.gamme)));
  remplacer(selModele,
    el('optgroup', { label: 'Conseil de l\'appli' }, CONSEILS.map(([v, t]) => el('option', { value: v }, v === 'conseille' ? `Conseillé dans ${m.marque}` : t))),
    el('optgroup', { label: `Gamme ${g.gamme}` }, g.fiches.map((f) => el('option', { value: f.id, disabled: choisissable(f) ? null : '' }, libelleModele(f)))));
  selMarque.value = m.marque;
  selGamme.value = g.gamme;
  selModele.value = id;
  for (const sel of [selMarque, selGamme, selModele]) sel.disabled = false;
  etat.textContent = g.fiches.some(choisissable) ? '' : `Gamme ${g.gamme} : aucun modèle calculable (à compléter dans l'onglet Base).`;
  return { id, famille: m.famille };
}

// Choix fait dans un des sélecteurs ou par la recherche : valeurs retenues dans les champs cachés. Le calcul suit, par
// l'écouteur du formulaire (l'évènement remonte jusqu'à lui). Un vrai choix envoie « input » puis « change » : le choix
// est retenu dès « input », avant le recalcul.
function retenirChoixProcesseur(demande) {
  const { id, famille } = remplirChoixProcesseur(demande);
  const cache = formulaire.elements.processeur;
  if ([...cache.options].some((o) => o.value === id)) cache.value = id;
  formulaire.elements.famille.value = famille;
}

function initialiserChoixProcesseur() {
  const ecouter = (id, action) => {
    for (const type of ['input', 'change']) $choix(id).addEventListener(type, (e) => action(e.target.value));
  };
  ecouter('processeur-marque', (marque) => retenirChoixProcesseur({ marque }));
  ecouter('processeur-gamme', (gamme) => retenirChoixProcesseur({ marque: $choix('processeur-marque').value, gamme }));
  ecouter('processeur-modele', (id) => retenirChoixProcesseur({ id }));
  $choix('recherche-processeur').addEventListener('input', () => retenirChoixProcesseur({ recherche: true }));
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

// Convertisseurs du processeur retenu : obligatoires (XD du SX40, CVT10 du MX40 Pro en mode 40 ports) ou seulement si fibre.
function nomDistributeur(r) {
  const d = distributeurs.get(r.processeur.distributeur);
  if (!d) return null;
  return r.distributeurObligatoire ? d.modele : `${d.modele} (si fibre)`;
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
      + `${g.colonnes.colonnesParPort < g.colonnes.colonnesParPortMax ? ' (nombre pair en redondance)' : ''}`
    : `chaque colonne en ${g.colonnes.segments.length} segments égaux : ${g.colonnes.segments.join(' + ')}`;
  const redondance = (n) => (e.redondance ? `redondance : ${n} ports` : `${n} ports en redondance`);

  const champCapacite = r.champCapacite;
  const qualite = [r.capaciteDeduite ? 'déduit' : null, r.capaciteAConfirmer ? 'à confirmer' : null].filter(Boolean).join(', ');

  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Ports — ${proc.nom}`),
    el('dl', { class: 'tuiles' },
      tuile(`Capacité par port${proc.typePorts ? ` ${proc.typePorts}` : ''}`, `${nombre(entierInferieur(r.capacite))} px`, r.formule,
        `source : ${sourceLimite(proc, champCapacite)}`, qualite ? `valeur ${qualite}` : null,
        `profondeur réseau : ${r.reglages.bits} bits, ${origineBits(proc.famille, r.reglages.bits)}`),
      r.capaciteAppareil
        ? tuile('Capacité de l\'appareil', `${nombre(entierInferieur(r.capaciteAppareil.valeur))} px`, texteCapaciteAppareil(r.capaciteAppareil),
          r.capaciteAppareil.limite === 'ports' ? 'les ports limitent avant le total de la fiche' : 'le total de la fiche limite avant les ports')
        : null,
      tuile('Pixels par dalle', `${nombre(r.pxParDalle)} px`, compte, demi),
      tuile('Dalles par port', nombre(r.dallesParPort),
        `partie entière de ${nombre(entierInferieur(r.capacite))} / ${nombre(r.pxParDalle)}`,
        r.plafondBoucle ? `plafonné à ${proc.maxDallesParBoucleRedondance} par boucle en redondance` : null),
      tuile('Ports en colonnes entières', nombre(g.colonnes.ports), colonnes, redondance(g.redondance.colonnes),
        texteCharge(g.chargeMax.colonnes), 'retenus, comme le schéma'),
      tuile('Minimum théorique', nombre(g.serpentin.ports), `au plus juste, serpentin depuis ${LIBELLES_COIN[g.serpentin.depart]}`,
        g.serpentin.ecart ? `décompte théorique : ${nombre(g.auPlusJuste)}` : null,
        redondance(2 * g.serpentin.ports), texteCharge(g.serpentin.chargeMax),
        g.auPlusJusteRealisable ? null : 'non réalisable tel quel dans NovaLCT',
        ...g.minimum.raisons.map((raison) => `écart : ${raison}`)),
      g.rectangles
        ? tuile('Conseil NovaLCT', nombre(g.rectangles.ports),
          `rectangles de ${pluriel(g.rectangles.colonnes, 'colonne', 'colonnes')} × ${pluriel(g.rectangles.rangees, 'rangée', 'rangées')}`,
          redondance(g.rectangles.redondance), 'chaque port compte le rectangle qui englobe ses dalles')
        : null,
      g.seuil.dallesEnMoins !== null
        ? tuile('Seuil', pluriel(g.seuil.dallesEnMoins, 'dalle', 'dalles'), 'en moins évitent un port (au plus juste)')
        : null));
}

function tableControles(r) {
  const proc = r.processeur;
  const valeur = (nom, c) => {
    if (nom === 'pixels') return millions(c.valeur);
    if (!Number.isFinite(c.valeur)) return '—';
    if (nom === 'largeur' || nom === 'hauteur') return `${nombre(c.valeur)} px`;
    return nombre(c.valeur);
  };
  const limite = (nom, c) => {
    if (nom === 'pixels') return `${millions(c.limite)}${proc.pixelsGamme ? ` (gamme ${proc.pixelsGamme})` : ''}`;
    if (nom === 'largeur') return `${nombre(c.limite)} px${c.format ? ` en ${c.format}` : ''}, soit ${c.colonnesMax} colonnes`;
    if (nom === 'hauteur') return `${nombre(c.limite)} px`;
    if (nom === 'cartes') return `${nombre(c.limite)}, zone de ${nombre(c.zone.largeurPx)} × ${nombre(c.zone.hauteurPx)} px par carte`;
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
  const distributeur = nomDistributeur(r);
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
  const distributeur = nomDistributeur(r);
  const globalTexte = `Décompte global, sans découpage par processeur : ${g.colonnes.ports} ports en colonnes entières`
    + `${g.distributeurs && distributeur ? ` (${g.distributeurs.colonnes} ${distributeur})` : ''}, `
    + `${g.serpentin.ports} au plus juste (minimum théorique)`
    + `${g.distributeurs && distributeur ? ` (${Math.ceil(g.serpentin.ports / proc.sortiesParDistributeur)} ${distributeur})` : ''}.`;
  return el('section', { class: 'bloc-resultats' },
    titre,
    el('div', { class: 'carte resultat-principal' },
      el('p', { class: 'chiffre-cle' }, `${r.nombre} × ${proc.modele}`),
      r.configuration ? el('p', { class: 'sous-titre' }, r.configuration) : null,
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
      proc.sortiesOptiques ? ` Sorties optiques : ${proc.sortiesOptiques}.` : null,
      proc.sortiesFibre === 'aucune' ? ` Sorties fibre : aucune, ${proc.sources?.sortiesFibre?.note ?? 'pas de sortie fibre'}.` : null,
      texteLatence(proc) ? ` Latence : ${texteLatence(proc)}${proc.latence ? `, ${proc.latence}` : ''}.` : (proc.latence ? ` Latence : ${proc.latence}.` : null),
      proc.statutCommercial ? ` Statut : ${proc.statutCommercial}${proc.sources?.statutCommercial?.note ? `, ${proc.sources.statutCommercial.note}` : ''}.` : null,
      proc.note ? ` ${proc.note}` : null,
    ].filter(Boolean).join('')),
    consoLigne(r),
    (r.carteReception ?? []).filter((x) => x.capacite).map((x) => el('p', { class: 'source' },
      `${x.texte} : ${x.ok ? 'passe' : 'dépassé'}${x.note ? `. ${x.note}` : ''}. Source : ${x.carte.sources?.capacites?.sources.map(sourceCourte).join(', ') ?? 'fiche de la carte'}.`)));
}

// Consommation et poids du processeur et de ses convertisseurs, affichés sans calcul.
function consoLigne(r) {
  const d = distributeurs.get(r.processeur.distributeur);
  const texte = [
    consommationProcesseur(r.processeur),
    d?.puissanceW || d?.poidsKg
      ? `${d.modele} : ${[d.puissanceW ? `${nombreCourt(d.puissanceW)} W` : null, d.poidsKg ? `${nombreCourt(d.poidsKg, 2)} kg` : null].filter(Boolean).join(', ')} chacun`
      : null,
  ].filter(Boolean).join(' ; ');
  return texte ? el('p', { class: 'source' }, `Consommation et poids : ${texte}.`) : null;
}

// Lots et configs du mur pour le logiciel du processeur retenu, version relevée dans le parc, rappels sourcés.
function configsData(choisie) {
  const { base, parcId } = contexteLots;
  if (!base || base.parcs.length === 0) return null;
  const logiciel = logicielDuProcesseur(choisie.processeur);
  const groupes = (etatMur?.lots ?? []).map((g) => ({ g, c: configsDuMur(base, parcId, g.dalleId, g.n, { coches: g.coches, logiciel }) }));
  const prefixe = (g, texte) => (g.libelle ? `${g.libelle} : ${texte.charAt(0).toLowerCase()}${texte.slice(1)}` : texte);
  return {
    logiciel,
    note: groupes.find(({ c }) => c.note)?.c.note ?? null,
    lignes: groupes.flatMap(({ g, c }) => c.lignes.map((l) => prefixe(g, l))),
    alertes: groupes.flatMap(({ g, c }) => c.alertes.map((a) => prefixe(g, a))),
    version: texteLogicielParc(base, parcId, choisie.processeur),
    rappels: rappelsConfig({
      logiciel,
      lotsMelanges: groupes.some(({ c }) => c.melanges),
      firmwarePersonnalise: groupes.some(({ c }) => c.firmwarePersonnalise),
      cvt8: choisie.processeur.distributeur === 'coex-cvt8-5g',
    }),
  };
}

const CONFIANCES_AFFICHEES = { tiers: 'source tierce' };
// Guillemets français collés à leur texte : jamais un « » seul en début de ligne.
const insecables = (t) => t.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»');
function elementRappel(r) {
  return el('li', {},
    el('strong', {}, r.titre),
    r.textes.map((t) => el('p', { class: 'rappel-texte' },
      t.citation ? [el('span', { class: 'citation', lang: 'en' }, insecables(`« ${t.citation} »`)), el('br')] : null,
      insecables(t.texte),
      el('span', { class: 'source' }, ` (${sourceCourte(t.source)}${t.section ? `, ${t.section}` : ''}`
        + `${t.source.confiance === 'constructeur' ? '' : `, ${CONFIANCES_AFFICHEES[t.source.confiance] ?? t.source.confiance}`})`))));
}

function sectionConfigs(c) {
  if (!c) return null;
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Configs des dalles (${c.logiciel})`),
    c.note ? el('p', { class: 'note' }, c.note) : null,
    c.lignes.map((l) => el('p', { class: 'ligne-config' }, l)),
    c.version ? el('p', { class: 'source' }, c.version) : null,
    c.alertes.map((a) => alerte(a)),
    c.rappels.length ? el('details', { class: 'rappels-config' },
      el('summary', {}, `Rappels ${c.logiciel === 'VMP' ? 'VMP (COEX)' : c.logiciel} (${c.rappels.length})`),
      el('ul', { class: 'rappels' }, c.rappels.map(elementRappel))) : null);
}

// Carte « Avant de partir » : prête (✓), à faire (☐) ou à vérifier sur place (?).
const SIGNES_DEPART = { true: '✓', false: '☐', null: '?' };
const LIBELLES_DEPART = { true: 'prêt', false: 'à faire', null: 'à vérifier' };
const CLASSES_DEPART = { true: 'depart-pret', false: 'depart-a-faire', null: 'depart-a-verifier' };
function afficherDepart(liste, avecParcs) {
  derniereListe = liste;
  const carte = document.getElementById('avant-de-partir');
  carte.hidden = !avecParcs;
  if (!avecParcs) return;
  document.getElementById('titre-depart').textContent = liste ? `Avant de partir, parc ${liste.nomParc}` : 'Avant de partir';
  remplacer(document.getElementById('liste-depart'), liste
    ? el('ul', { class: 'liste-depart' }, liste.lignes.map((l) => el('li', { class: CLASSES_DEPART[l.fait] },
      el('span', { class: 'signe-depart', 'aria-label': LIBELLES_DEPART[l.fait] }, SIGNES_DEPART[l.fait]), el('span', {}, l.texte))))
    : el('p', { class: 'note' }, 'Choisis un parc pour préparer la check-list de ce mur.'));
}

async function rafraichirPresents() {
  const avant = presents ? [...presents].sort().join() : null;
  presents = new Set((await listerFichiers()).map((f) => f.id));
  if (avant !== [...presents].sort().join() && etatMur) mettreAJour();
}

// Résumé texte de la check-list, pour « Copier la check-list » et « Tout copier ».
export function resumeOngletDepart() {
  return resumeAvantDePartir(derniereListe);
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
      el('th', { scope: 'row' }, e.processeur === 'conseille-tout' ? p.nom : p.modele),
      el('td', {}, p.pixelsGamme ?? (p.pixelsMax ? millions(p.pixelsMax) : '—')),
      el('td', { class: 'nombre' }, p.ports ? `${nombre(p.ports)}${p.typePorts ? ` × ${p.typePorts}` : ''}` : '—'),
      el('td', {}, resultat));
  });
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, `Processeurs ${e.processeur === 'conseille-tout' ? 'de toutes les marques' : NOMS_FAMILLE[e.famille]}${nomParc ? ` du parc ${nomParc}` : ''}`),
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
  afficherDepart(null, false);
  if (!etatMur) return null;
  if (!etatMur.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return null;
  }
  const { dalle, mur } = etatMur;
  const reglages = {
    frequenceHz: e.frequenceHz, bits: e.bits, ull: e.ull, cartesPro: e.cartesPro, redondance: e.redondance, modeOptique: e.modeOptique,
    carteSortie: e.carteSortie,
    cartesReception,
    departCablage: departData,
  };

  const toutes = e.processeur === 'conseille-tout';
  const candidats = toutes ? processeurs : processeurs.filter((p) => p.famille === e.famille);
  if (candidats.length === 0) {
    remplacer(zone, alerte(`Aucun processeur ${NOMS_FAMILLE[e.famille]} dans le parc ${nomParc ?? 'actif'} : `
      + 'choisis une autre marque, un autre parc, ou « Tous ».', 'alerte-erreur'));
    return null;
  }
  const bitsParFamille = Object.fromEntries(Object.keys(MARQUES_FAMILLE).map((f) => [f, defautBits(f).bits]));
  let evaluations;
  try {
    evaluations = toutes
      ? evaluerToutesMarques(mur, dalle, candidats, reglages, { famille: e.famille, bitsParFamille })
      : candidats.map((p) => evaluerProcesseur(mur, dalle, p, reglages));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return null;
  }
  const conseil = processeurConseille(evaluations);
  const choisie = estConseil(e.processeur) ? conseil : evaluations.find((r) => r.processeur.id === e.processeur);

  const alertes = [];
  if (toutes) {
    alertes.push(alerte(`Conseil toutes marques du parc : ${MARQUES_FAMILLE[e.famille]} à ${e.bits} bits comme réglé, les autres marques à leur `
      + `profondeur réseau par défaut (${Object.keys(MARQUES_FAMILLE).filter((f) => f !== e.famille).map((f) => `${MARQUES_FAMILLE[f]} ${bitsParFamille[f]} bits`).join(', ')}).`, 'alerte-info'));
  }
  // Rappel Tessera ; en 12 bits, le même processeur en 10 bits quand cela en économise.
  const gain = choisie ? gainDixBits(mur, dalle, choisie) : null;
  if ((choisie?.processeur.famille ?? e.famille) === 'brompton') {
    alertes.push(alerte([`${rappelTessera({ frequenceHz: e.frequenceHz, ull: e.ull })}.`,
      ...(gain ? [el('br'), `${gain.texte.charAt(0).toUpperCase()}${gain.texte.slice(1)}.`] : [])], 'alerte-info'));
  }
  alertes.push(ligneManques(choisie?.manques));
  for (const texte of alertesSansManques(choisie?.alertes ?? [], choisie?.manques)) alertes.push(alerte(texte));
  // Informations sans alerte (Colorlight : règle des 1280 px de la fiche S20 sur un autre modèle).
  for (const texte of choisie?.notes ?? []) alertes.push(alerte(texte, 'alerte-info'));
  if (!choisie) {
    remplacer(zone, ...alertes, alerte('Aucun processeur de cette marque ne convient à ce mur.', 'alerte-erreur'),
      sectionAutres(e, evaluations, null));
    return null;
  }
  if (choisie.global) {
    const { colonnes } = choisie.global.chargeMax;
    if (choisie.global.serpentin.ecart) alertes.push(alerte(choisie.global.serpentin.ecart, 'alerte-info'));
    for (const [charge, cablage] of [[colonnes, 'en colonnes entières'], [choisie.global.serpentin.chargeMax, 'au plus juste']]) {
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

  const configs = configsData(choisie);
  const { base, parcId } = contexteLots;
  const avecParcs = Boolean(base?.parcs.length);
  afficherDepart(avecParcs ? avantDePartir(base, parcId, etatMur.lots ?? [], choisie.processeur, { presents }) : null, avecParcs);
  dernier = {
    choisie, conseille: choisie === conseil, distributeur: nomDistributeur(choisie),
    puissanceDistributeurW: distributeurs.get(choisie.processeur.distributeur)?.puissanceW ?? null,
    origineBits: origineBits(choisie.processeur.famille, choisie.reglages.bits),
    gainDixBits: gain,
    configs,
  };
  remplacer(zone, recap,
    ...alertes,
    choisie.global ? sectionPorts(e, dalle, choisie) : null,
    sectionProcesseur(choisie, conseil),
    sectionConfigs(configs),
    sectionAutres(e, evaluations, choisie),
  );
  return choisie;
}

function mettreAJour() {
  // Listes visibles alignées sur les valeurs retenues (saisies gardées remises, nouveau parc).
  retenirChoixProcesseur({});
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
  initialiserChoixProcesseur();
  actualiserData(base, true);
}

// Nouvelle base ou nouveau parc actif : `base.processeurs` ne contient que les processeurs du parc actif.
export function actualiserData(base, premiereFois = false) {
  processeurs = base.processeurs;
  informations = base.informations ?? [];
  distributeurs = new Map(base.distributeurs.map((d) => [d.id, d]));
  sources = base.sources;
  nomParc = base.nomParc ?? null;
  cartesReception = base.cartesReception ?? [];
  contexteLots = base.lots ?? { base: null, parcId: null };
  rafraichirPresents();
  // Nouveau parc actif : sa profondeur réseau remplace le défaut de la marque affichée.
  const famille = lireFormulaire().famille;
  const avant = defautBits(famille).bits;
  bitsParDefaut = base.bitsParDefaut ?? {};
  remplirCache();
  retenirChoixProcesseur({});
  preparerFamille(lireFormulaire().famille, !premiereFois);
  if (!premiereFois && defautBits(famille).bits !== avant) cocherBits(defautBits(famille).bits);
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
