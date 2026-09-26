// Onglet Base : ma base locale (fiches ajoutées, versions modifiées, parcs), saisie guidée ou JSON vérifié,
// consigne pour Claude, export et import. Aucune règle de validation ici : tout passe par fiches.js.

import { resoudreFiche, ErreurSaisie } from './calculs.js';
import {
  TYPES, LIBELLES_TYPE, CHAMPS, CONFIANCES, TYPES_VALEUR, libelleChamp, champsManquantsFiche, validerImport, importer,
  supprimerFiche, exporter, creerParc, renommerParc, supprimerParc, estMembre, basculerMembre,
  CONSIGNE_CLAUDE, MODELES_JSON, identifiant, CHAMPS_REGLAGE_PARC, reglageDalleParc, reglerDalleParc, reglerBitsParc,
  LOGICIELS, EXTENSIONS_CONFIG, CALIBRATIONS_TESSERA, FIRMWARES, ROLES_FICHIER, lotsDalleParc, ajouterLot, modifierLot,
  supprimerLot, reglerConfigLot, configLot, supprimerConfigLot, verifierFichierJoint, joindreFichier, detacherFichier,
  fichiersJoints, tailleFichiersJoints, alerteTailleFichier, migrerFichiersConfig, logicielDuProcesseur, reglerLogicielParc,
  logicielParc, fichesRetirees, retirerFicheRetiree, arbreDalles,
} from './fiches.js';
import { stockageDisponible, ecrireFichier, lireFichier, supprimerFichier, listerFichiers } from './stockage.js';
import { choixPartageFichier, partagerFichier, telecharger, NOTE_TELECHARGEMENT_CONFIG } from './export.js';
import { rappelFirmwarePersonnalise } from './rappels.js';
import { sourceCourte, lireNombre, nombre, nombreCourt, dateCourte } from './format.js';
import { el, remplacer } from './dom.js';

const $ = (id) => document.getElementById(id);
const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const badge = (texte, genre) => el('span', { class: `badge ${genre}` }, texte);
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const normaliser = (texte) => String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// { base, depart, fusion, parcActif } : ma base, la base de départ et leur fusion (fiches brutes avec statutBase).
let ctx = null;
let enregistrer = async () => true;
const ouvertes = new Set();

// Type de valeur proposé par défaut dans la saisie guidée.
const AVEC_TYPE = { pMaxW: 'max', pMoyW: 'typique' };
const NOMS_LISTE = { dalle: ['dalle', 'dalles'], processeur: ['processeur', 'processeurs'], regie: ['régie', 'régies'], bumper: ['bumper', 'bumpers'] };

function toutesSources() {
  const f = ctx.fusion;
  return { ...f.dalles.sources, ...f.processeurs.sources, ...f.regies.sources };
}

// Fiches brutes d'un type (gabarits exclus : génériques, non sourcés) et leur version résolue.
function fichesDuType(type) {
  const f = ctx.fusion;
  // Dalles : aussi les fiches d'information (LEDCAST), à compléter.
  const brutes = {
    dalle: [...f.dalles.dalles, ...(f.dalles.informations ?? [])], bumper: f.dalles.bumpers,
    processeur: [...f.processeurs.processeurs, ...(f.processeurs.informations ?? [])], regie: f.regies.regies,
  }[type] ?? [];
  const sources = { dalle: f.dalles.sources, bumper: f.dalles.sources, processeur: f.processeurs.sources, regie: f.regies.sources }[type];
  return brutes.map((brute) => ({ brute, resolue: resoudreFiche(brute, sources) }));
}

// Identifiants des sources citées par une fiche brute (valeurs sourcées, formats de canvas, modes de sortie).
function sourcesCitees(brute) {
  const ids = new Set();
  for (const champ of Object.values(brute)) {
    const entrees = Array.isArray(champ) ? champ : champ && typeof champ === 'object' ? champ.valeurs ?? [champ] : [];
    for (const x of entrees) if (x && typeof x === 'object' && typeof x.source === 'string') ids.add(x.source);
  }
  return [...ids];
}

function sansStatut(fiche) {
  const copie = { ...fiche };
  delete copie.statutBase;
  return copie;
}

// ---------------------------------------------------------------------------
// État du stockage
// ---------------------------------------------------------------------------

function afficherEtat() {
  const { base } = ctx;
  remplacer($('etat-stockage'),
    stockageDisponible() ? null : alerte('Stockage local indisponible (navigation privée ou stockage bloqué) : '
      + 'tes fiches restent en mémoire jusqu\'à la fermeture de la page. Exporte ta base avant de quitter.', 'alerte-erreur'),
    el('p', { class: 'recap-mur' }, `Ma base : ${pluriel(base.fiches.length, 'fiche ajoutée ou modifiée', 'fiches ajoutées ou modifiées')}, `
      + `${pluriel(base.parcs.length, 'parc', 'parcs')}. La base de départ reste intacte.`
      + { true: ' Stockage persistant accordé : le navigateur ne videra pas ta base pour faire de la place.',
        false: ' Stockage persistant non accordé par le navigateur : exporte ta base régulièrement.' }[ctx.persistant] ?? ''),
    el('div', { id: 'etat-fichiers' }));
  afficherEtatFichiers();
}

function afficherEtatFichiers() {
  const decrits = fichiersJoints(ctx.base);
  const n = decrits.length;
  const option = $('exporter-fichiers');
  option.disabled = n === 0;
  if (n === 0) option.checked = false;
  $('libelle-exporter-fichiers').textContent = n
    ? `Inclure les fichiers joints (${pluriel(n, 'fichier', 'fichiers')}, ${taille(tailleFichiersJoints(ctx.base))})`
    : 'Inclure les fichiers joints (aucun fichier joint)';
  const zone = $('etat-fichiers');
  if (!zone || !surAppareil) return;
  const idsDecrits = new Set(decrits.map((f) => f.id));
  const total = surAppareil.reduce((s, f) => s + (f.taille ?? 0), 0);
  const absents = decrits.filter((f) => !estPresent(f.id));
  const orphelins = surAppareil.filter((f) => !idsDecrits.has(f.id));
  let nettoyer = null;
  if (orphelins.length) {
    nettoyer = el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Les effacer de cet appareil');
    nettoyer.addEventListener('click', async () => {
      if (!confirm(`Effacer de cet appareil ${pluriel(orphelins.length, 'fichier', 'fichiers')} rattaché${orphelins.length > 1 ? 's' : ''} à aucun lot (${orphelins.map((f) => f.nom).join(', ')}) ?`)) return;
      await effacerFichiers(orphelins);
      afficherEtatFichiers();
    });
  }
  remplacer(zone,
    el('p', { class: 'recap-mur' }, `Fichiers joints (configs de dalles) : ${surAppareil.length
      ? `${pluriel(surAppareil.length, 'fichier', 'fichiers')}, ${taille(total)} sur cet appareil` : 'aucun sur cet appareil'}`
      + `${placeDisponible === null ? '' : ` ; place disponible pour l'appli : ${taille(placeDisponible)} (estimation du navigateur)`}.`
      + ' Ils restent sur cet appareil : jamais publiés, exportés seulement si tu le demandes.'),
    absents.length ? alerte(`${absents.length > 1 ? `${nombre(absents.length)} fichiers joints de ta base sont absents` : 'Un fichier joint de ta base est absent'}`
      + ` de cet appareil (${absents.map((f) => f.nom).join(', ')}) : base importée sans ses fichiers, ou venue d'un autre appareil. Joins-les de nouveau.`) : null,
    orphelins.length ? el('div', { class: 'alerte alerte-info' },
      `${orphelins.length > 1 ? `${nombre(orphelins.length)} fichiers sur cet appareil ne sont plus rattachés` : 'Un fichier sur cet appareil n\'est plus rattaché'}`
      + ` à aucun lot (${taille(orphelins.reduce((s, f) => s + (f.taille ?? 0), 0))}). `, nettoyer) : null);
}

// Relit la liste des fichiers de l'appareil (sans les contenus) et la place disponible ; la liste des fiches
// ne se redessine que si des fichiers sont apparus ou ont disparu.
async function rafraichirFichiers() {
  const avant = surAppareil ? surAppareil.map((f) => f.id).sort().join() : null;
  surAppareil = await listerFichiers();
  try {
    const estimation = await navigator.storage?.estimate?.();
    placeDisponible = Number.isFinite(estimation?.quota) && Number.isFinite(estimation?.usage) ? estimation.quota - estimation.usage : null;
  } catch (erreur) {
    placeDisponible = null;
  }
  afficherEtatFichiers();
  if (avant !== surAppareil.map((f) => f.id).sort().join()) afficherFiches();
}

// ---------------------------------------------------------------------------
// Parcs
// ---------------------------------------------------------------------------

function compterMembres(parc) {
  const comptes = Object.keys(NOMS_LISTE).map((type) => {
    const n = fichesDuType(type).filter(({ brute }) => estMembre(ctx.base, parc.id, type, brute.id)).length;
    return n ? pluriel(n, ...NOMS_LISTE[type]) : null;
  }).filter(Boolean);
  return comptes.length ? comptes.join(', ') : 'vide';
}

// Fiches retirées de la base de départ (LEDCAST) encore citées par un parc : signalées, retirées sur demande
// (membre, réglage, lots et leurs fichiers joints). Rien n'est retiré en silence.
function afficherFichesRetirees() {
  const liste = fichesRetirees(ctx.base, ctx.depart);
  remplacer($('fiches-retirees'), liste.length ? el('div', { class: 'alerte' },
    el('p', {}, `${liste.length > 1 ? `${nombre(liste.length)} fiches retirées` : 'Une fiche retirée'} de la base de départ `
      + `(par exemple les fiches LEDCAST, une erreur de marque) ${liste.length > 1 ? 'sont encore citées' : 'est encore citée'} par un parc :`),
    el('ul', { class: 'rappels' }, liste.map((x) => {
      const bouton = el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Retirer du parc');
      bouton.addEventListener('click', async () => {
        const joints = fichiersDe(x.parcId, x.id);
        if (!confirm(`Retirer ${x.id} du parc « ${x.parcNom} »${x.reglage ? ', avec son réglage' : ''}${x.lots ? ` et ${pluriel(x.lots, 'lot', 'lots')}` : ''}${avecFichiers(joints)} ?`)) return;
        await effacerFichiers(joints);
        enregistrer(retirerFicheRetiree(ctx.base, x.parcId, x.type, x.id));
      });
      return el('li', {}, `${x.id} (${x.type}), parc ${x.parcNom}${x.reglage ? ', réglage' : ''}${x.lots ? `, ${pluriel(x.lots, 'lot', 'lots')}` : ''} `, bouton);
    }))) : null);
}

function afficherParcs() {
  afficherFichesRetirees();
  const { base, parcActif } = ctx;
  remplacer($('liste-parcs'), base.parcs.length === 0
    ? el('li', { class: 'compte' }, 'Aucun parc : les onglets Mur et Data montrent toute la base (« Tous »).')
    : base.parcs.map((parc) => {
      const champ = el('input', { type: 'text', value: parc.nom, 'aria-label': `Nom du parc ${parc.nom}` });
      champ.addEventListener('change', () => {
        const nom = champ.value.trim();
        if (nom && nom !== parc.nom) enregistrer(renommerParc(ctx.base, parc.id, nom));
        else champ.value = parc.nom;
      });
      const bouton = el('button', { class: 'bouton bouton-discret', type: 'button' }, 'Supprimer');
      bouton.addEventListener('click', async () => {
        const joints = fichiersDe(parc.id, null);
        if (!confirm(`Supprimer le parc « ${parc.nom} »${avecFichiers(joints)} ? Ses fiches restent dans la base.`)) return;
        await effacerFichiers(joints);
        enregistrer(supprimerParc(ctx.base, parc.id));
      });
      // Profondeur réseau Tessera de ce prestataire : elle remplace le défaut (12 bits, livraison Tessera).
      const bits = el('select', { 'aria-label': `Profondeur réseau Brompton du parc ${parc.nom}` },
        el('option', { value: '' }, 'Brompton : défaut 12 bits'),
        [8, 10, 12].map((n) => el('option', { value: String(n) }, `Brompton : ${n} bits`)));
      bits.value = parc.bitsReseau?.brompton ? String(parc.bitsReseau.brompton) : '';
      bits.addEventListener('change', () => enregistrer(reglerBitsParc(ctx.base, parc.id, 'brompton', bits.value)));
      return el('li', {}, champ,
        el('span', { class: 'compte' }, `${compterMembres(parc)}${parc.id === parcActif ? ' · parc actif' : ''}`),
        bits,
        bouton);
    }));
}

// ---------------------------------------------------------------------------
// Liste des fiches
// ---------------------------------------------------------------------------

function modifierFiche(type, brute) {
  const toutes = toutesSources();
  const sources = Object.fromEntries(sourcesCitees(brute).filter((id) => toutes[id]).map((id) => [id, toutes[id]]));
  $('json-fiche').value = JSON.stringify({ sources, fiche: { type, ...sansStatut(brute) } }, null, 2);
  choisirMode('json');
  verifierJson();
  $('bloc-saisie').scrollIntoView({ block: 'start' });
}

// Carte de réception et rotation de cette dalle chez ce prestataire ; vide = valeur de la fiche.
// Le fichier de config se range désormais dans les lots (ci-dessous) : l'ancien réglage est gardé tel quel.
const CHAMPS_FORMULAIRE_REGLAGE = CHAMPS_REGLAGE_PARC.filter((nom) => nom !== 'fichierConfig');
function formulaireReglage(parc, brute, resolue) {
  const actuel = reglageDalleParc(ctx.base, parc.id, brute.id) ?? {};
  const champs = CHAMPS_FORMULAIRE_REGLAGE.map((nom) => {
    const id = `reglage-${parc.id}-${brute.id}-${nom}`;
    // Dalle en plusieurs versions (URMIII03, Upad IV 2.6) : celle de ce prestataire ; vide = la plus défavorable.
    if (nom === 'declinaison') {
      if (!resolue.declinaisons?.length) return null;
      const defaut = resolue.declinaisons.find((x) => x.id === resolue.declinaisonDefaut)?.nom ?? 'la plus défavorable';
      return el('div', { class: 'champ' },
        el('label', { for: id }, 'Version de la dalle dans ce parc'),
        el('select', { id, name: nom },
          el('option', { value: '', selected: actuel.declinaison ? null : '' }, `non précisée : la plus défavorable (${defaut})`),
          resolue.declinaisons.map((x) => el('option', { value: x.id, selected: actuel.declinaison === x.id ? '' : null }, x.nom))));
    }
    if (nom === 'rotationPossible') {
      const deFiche = resolue.rotationPossible === undefined ? 'non précisé' : (resolue.rotationPossible ? 'oui' : 'non');
      const actuelle = actuel.rotationPossible === undefined ? '' : String(actuel.rotationPossible);
      return el('div', { class: 'champ' },
        el('label', { for: id }, 'Rotation possible avec les bumpers de ce parc'),
        el('select', { id, name: nom },
          el('option', { value: '', selected: actuelle === '' ? '' : null }, `comme la fiche (${deFiche})`),
          el('option', { value: 'true', selected: actuelle === 'true' ? '' : null }, 'oui'),
          el('option', { value: 'false', selected: actuelle === 'false' ? '' : null }, 'non')));
    }
    return el('div', { class: 'champ' },
      el('label', { for: id }, `${libelleChamp('dalle', nom)}, dans ce parc`),
      el('input', { id, name: nom, type: 'text', autocomplete: 'off', value: actuel[nom] ?? null,
        placeholder: resolue[nom] ? `fiche : ${resolue[nom]}` : 'fiche : non précisé' }));
  });
  const formulaire = el('form', { class: 'formulaire reglage-parc', novalidate: '' },
    el('p', { class: 'compte' }, 'Laisse vide pour garder la valeur de la fiche.'),
    champs,
    el('button', { class: 'bouton', type: 'submit' }, 'Enregistrer pour ce parc'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    enregistrer(reglerDalleParc(ctx.base, parc.id, brute.id,
      Object.fromEntries(CHAMPS_REGLAGE_PARC.map((n) => [n, donnees.has(n) ? donnees.get(n) : actuel[n]]))));
  });
  return formulaire;
}

// ---------------------------------------------------------------------------
// Lots de fabrication d'une dalle dans un parc, configs par logiciel et fichiers joints (restent sur l'appareil)
// ---------------------------------------------------------------------------

const MO = 1024 * 1024;
function taille(octets) {
  if (!Number.isFinite(octets)) return '—';
  if (octets >= 1024 * MO) return `${nombreCourt(octets / (1024 * MO), 1)} Go`;
  if (octets >= MO) return `${nombreCourt(octets / MO, 1)} Mo`;
  return `${nombreCourt(octets > 0 ? Math.max(octets / 1024, 0.1) : 0, 1)} ko`;
}

const NOMS_LOGICIEL = { NovaLCT: 'NovaLCT (Novastar)', VMP: 'VMP (COEX)', LEDVISION: 'LEDVISION (Colorlight)', Tessera: 'Tessera (Brompton)' };
// Logiciel proposé d'abord, selon la marque de la carte de réception.
const LOGICIEL_DE_MARQUE = { brompton: 'Tessera', novastar: 'NovaLCT', coex: 'VMP', colorlight: 'LEDVISION' };
const CHAMPS_CONFIG_FORMULAIRE = {
  NovaLCT: ['nomFichier', 'version', 'date', 'provenance', 'firmware', 'multiBatch', 'autreFichier', 'notes'],
  VMP: ['nomFichier', 'version', 'date', 'provenance', 'firmware', 'autreFichier', 'notes'],
  LEDVISION: ['nomFichier', 'version', 'date', 'provenance', 'firmware', 'autreFichier', 'notes'],
  Tessera: ['typeFixture', 'firmwareDalle', 'fixturePack', 'version', 'date', 'provenance', 'calibration', 'firmware', 'autreFichier', 'notes'],
};
// Fichiers qu'on peut joindre à une config, et le champ texte qui garde leur nom.
const ROLES_JOINTS = { NovaLCT: ['fichier', 'multiBatch', 'autre'], VMP: ['fichier', 'autre'], LEDVISION: ['fichier', 'autre'], Tessera: ['fixturePack', 'autre'] };
const CHAMP_DU_ROLE = { fichier: 'nomFichier', multiBatch: 'multiBatch', fixturePack: 'fixturePack', autre: 'autreFichier' };
const NOMS_ROLE = { fichier: 'Fichier de config', multiBatch: 'Multi-batch adjustment', fixturePack: 'Fixture pack', autre: 'Autre fichier' };
const TEXTES_OPTION = { standard: 'standard', personnalisé: 'personnalisé par le fabricant' };

function libelleConfig(logiciel, champ) {
  return {
    nomFichier: `Fichier de config (${(EXTENSIONS_CONFIG[logiciel] ?? []).join(' ou ')})`,
    version: 'Version de la config',
    date: 'Date de la config',
    provenance: 'Provenance (fabricant, loueur…)',
    firmware: 'Firmware de la dalle',
    multiBatch: 'Multi-batch adjustment (.lxy, facultatif)',
    typeFixture: 'Type de fixture dans Tessera',
    firmwareDalle: 'Version du firmware de la dalle',
    fixturePack: 'Fixture pack (.tfp, facultatif)',
    calibration: 'Calibration utilisée',
    autreFichier: 'Autre fichier (facultatif : .scr d\'écran, projet exporté…)',
    notes: 'Notes',
  }[champ];
}

function champTexte(id, nom, libelle, valeur, attributs = {}) {
  return el('div', { class: 'champ' },
    el('label', { for: id }, libelle),
    el('input', { id, name: nom, type: 'text', autocomplete: 'off', value: valeur ?? null, ...attributs }));
}

function champConfig(prefixe, logiciel, nom, valeur) {
  const id = `${prefixe}-${nom}`;
  if (nom === 'firmware' || nom === 'calibration') {
    return el('div', { class: 'champ' },
      el('label', { for: id }, libelleConfig(logiciel, nom)),
      el('select', { id, name: nom },
        el('option', { value: '' }, 'non précisé'),
        (nom === 'firmware' ? FIRMWARES : CALIBRATIONS_TESSERA)
          .map((o) => el('option', { value: o, selected: valeur === o ? '' : null }, TEXTES_OPTION[o] ?? o))));
  }
  return champTexte(id, nom, libelleConfig(logiciel, nom), valeur, nom === 'date' ? { type: 'date' } : {});
}

// Applique un changement de ma base ; une saisie refusée s'affiche dans la zone, sans rien enregistrer.
function essayer(zone, changer) {
  try {
    return changer();
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
    return null;
  }
}

// Fichiers joints sur cet appareil (sans leur contenu) et place laissée par le navigateur ; null tant que non lus.
let surAppareil = null;
let placeDisponible = null;
const estPresent = (id) => !surAppareil || surAppareil.some((f) => f.id === id);

async function effacerFichiers(liste) {
  for (const f of liste) await supprimerFichier(f.id);
  const ids = new Set(liste.map((f) => f.id));
  if (surAppareil) surAppareil = surAppareil.filter((f) => !ids.has(f.id));
}

const fichiersDe = (parcId, dalleId, lotId = null, logiciel = undefined) => fichiersJoints(ctx.base).filter((f) => f.parcId === parcId
  && (dalleId === null || f.dalleId === dalleId) && (lotId === null || f.lotId === lotId) && (logiciel === undefined || f.logiciel === logiciel));
const avecFichiers = (liste) => (liste.length
  ? ` et ${liste.length > 1 ? `ses ${liste.length} fichiers joints` : 'son fichier joint'} (${taille(liste.reduce((s, f) => s + (f.taille ?? 0), 0))}) de cet appareil`
  : '');

// Le sélecteur laisse tout choisir (Safari iOS grise les types qu'il ne connaît pas) : l'extension est vérifiée ici.
async function joindre(parc, brute, lot, logiciel, role, champ, zone, ancien) {
  const fichier = champ.files?.[0];
  if (!fichier) return;
  champ.value = '';
  if (!essayer(zone, () => verifierFichierJoint(logiciel, role, fichier.name))) return;
  zone.textContent = `Lecture de ${fichier.name}…`;
  const contenu = await fichier.arrayBuffer();
  const config = configLot(ctx.base, parc.id, brute.id, lot.id, logiciel) ?? { logiciel };
  // Le champ texte du rôle prend le nom du fichier joint.
  let nouvelle = essayer(zone, () => reglerConfigLot(ctx.base, parc.id, brute.id, lot.id, { ...config, [CHAMP_DU_ROLE[role]]: fichier.name }));
  if (!nouvelle) return;
  const id = `fichier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const infos = { id, nom: fichier.name, taille: contenu.byteLength, date: new Date().toISOString() };
  await ecrireFichier(id, { nom: fichier.name, type: fichier.type || 'application/octet-stream', contenu });
  surAppareil?.push(infos);
  nouvelle = joindreFichier(nouvelle, parc.id, brute.id, lot.id, logiciel, role, infos);
  if (ancien) await effacerFichiers([ancien]);
  await enregistrer(nouvelle);
}

// Partage d'un fichier joint : lu sur l'appareil au premier appui, feuille de partage au second (Safari ne l'ouvre
// que sur un appui direct) ; téléchargement vers Fichiers si l'appareil ne sait pas partager ce fichier.
async function preparerPartage(joint, zone) {
  const f = await lireFichier(joint.id);
  if (!f) {
    remplacer(zone, alerte('Fichier absent de cet appareil : joins-le de nouveau, ou importe un export qui le contient.', 'alerte-erreur'));
    return;
  }
  const type = f.type || 'application/octet-stream';
  const blob = new Blob([f.contenu], { type });
  if (choixPartageFichier(navigator, [new File([blob], f.nom, { type })]).mode !== 'partage') {
    telecharger(blob, f.nom);
    remplacer(zone, el('p', { class: 'note' }, NOTE_TELECHARGEMENT_CONFIG));
    return;
  }
  const partager = el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Partager maintenant');
  partager.addEventListener('click', async () => {
    const { mode, note } = await partagerFichier(f.contenu, f.nom, type);
    remplacer(zone, el('p', { class: 'note' }, { partage: `${f.nom} partagé.`, annule: 'Partage annulé.', telechargement: note }[mode]));
  });
  const secours = el('button', { type: 'button', class: 'bouton bouton-petit bouton-discret' }, 'Télécharger');
  secours.addEventListener('click', () => {
    telecharger(blob, f.nom);
    remplacer(zone, el('p', { class: 'note' }, NOTE_TELECHARGEMENT_CONFIG));
  });
  remplacer(zone, el('span', {}, `${f.nom} prêt (${taille(f.taille)}). `), el('span', { class: 'actions' }, partager, secours));
}

function elementFichierJoint(parc, brute, lot, config, role) {
  const { logiciel } = config;
  const joint = config[ROLES_FICHIER[role]];
  const zone = el('div', { class: 'etat-copie', 'aria-live': 'polite' });
  const id = `joindre-${parc.id}-${brute.id}-${lot.id}-${logiciel}-${role}`;
  // Aucun filtre « accept » : voir joindre().
  const choix = el('input', { id, type: 'file' });
  choix.addEventListener('change', () => joindre(parc, brute, lot, logiciel, role, choix, zone, joint));
  const extensions = { fichier: ` (${EXTENSIONS_CONFIG[logiciel]?.join(' ou ')})`, fixturePack: ' (.tfp)', multiBatch: ' (.lxy)' }[role] ?? '';
  if (!joint) {
    return el('li', {},
      el('div', { class: 'champ' }, el('label', { for: id }, `${NOMS_ROLE[role]}${extensions} : joindre un fichier`), choix),
      zone);
  }
  const partager = el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Partager le fichier');
  partager.addEventListener('click', () => preparerPartage(joint, zone));
  const retirer = el('button', { type: 'button', class: 'bouton bouton-petit bouton-discret' }, 'Retirer');
  retirer.addEventListener('click', async () => {
    if (!confirm(`Retirer ${joint.nom} et l'effacer de cet appareil ?`)) return;
    await effacerFichiers([joint]);
    enregistrer(detacherFichier(ctx.base, parc.id, brute.id, lot.id, logiciel, role));
  });
  const trop = alerteTailleFichier(joint.taille);
  return el('li', {},
    el('p', { class: 'fichier-joint' }, el('strong', {}, `${NOMS_ROLE[role]} : `), `${joint.nom}, ${taille(joint.taille)}`,
      joint.date ? `, joint le ${dateCourte(String(joint.date).slice(0, 10))}` : '',
      estPresent(joint.id) ? null : [' ', badge('absent de cet appareil', 'badge-alerte')]),
    trop ? alerte(trop) : null,
    el('div', { class: 'actions' }, partager, retirer),
    el('div', { class: 'champ' }, el('label', { for: id }, 'Remplacer par un autre fichier'), choix),
    zone);
}

// Config reprise de l'ancien champ « fichier de config » : son logiciel reste à choisir. Le nom va dans le champ du
// fichier s'il en a l'extension, dans les notes sinon (sans deviner).
function elementConfigReprise(parc, brute, lot, config) {
  const zone = el('div', { 'aria-live': 'polite' });
  const choix = el('select', { 'aria-label': 'Logiciel de cette config' },
    LOGICIELS.map((l) => el('option', { value: l }, NOMS_LOGICIEL[l])));
  const ranger = el('button', { type: 'button', class: 'bouton' }, 'Ranger dans cette config');
  ranger.addEventListener('click', () => {
    const logiciel = choix.value;
    const nom = config.nomFichier;
    const extensions = EXTENSIONS_CONFIG[logiciel];
    const rangement = extensions && extensions.some((e) => nom.toLowerCase().endsWith(e)) ? { nomFichier: nom }
      : logiciel === 'Tessera' && nom.toLowerCase().endsWith('.tfp') ? { fixturePack: nom }
        : { notes: `Ancien réglage « fichier de config » : ${nom}` };
    const existante = configLot(ctx.base, parc.id, brute.id, lot.id, logiciel) ?? {};
    const notes = [existante.notes, rangement.notes].filter(Boolean).join(' ; ');
    const nouvelle = essayer(zone, () => reglerConfigLot(supprimerConfigLot(ctx.base, parc.id, brute.id, lot.id, null), parc.id, brute.id, lot.id,
      { ...existante, ...rangement, logiciel, notes }));
    if (nouvelle) enregistrer(nouvelle);
  });
  return el('div', { class: 'config-lot' },
    alerte(`Repris de l'ancien réglage « fichier de config » : ${config.nomFichier}. Choisis le logiciel de cette config.`, 'alerte-info'),
    el('div', { class: 'actions' }, choix, ranger),
    zone);
}

function elementConfig(parc, brute, lot, config) {
  if (!config.logiciel) return elementConfigReprise(parc, brute, lot, config);
  const { logiciel } = config;
  const zone = el('div', { 'aria-live': 'polite' });
  const champs = CHAMPS_CONFIG_FORMULAIRE[logiciel];
  const formulaire = el('form', { class: 'formulaire', novalidate: '' },
    champs.map((nom) => champConfig(`config-${parc.id}-${brute.id}-${lot.id}-${logiciel}`, logiciel, nom, config[nom])),
    el('button', { class: 'bouton', type: 'submit' }, 'Enregistrer la config'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    const nouvelle = essayer(zone, () => reglerConfigLot(ctx.base, parc.id, brute.id, lot.id,
      { logiciel, ...Object.fromEntries(champs.map((n) => [n, donnees.get(n)])) }));
    if (nouvelle) enregistrer(nouvelle);
  });
  const retirer = el('button', { type: 'button', class: 'bouton bouton-discret' }, `Retirer la config ${logiciel}`);
  retirer.addEventListener('click', async () => {
    const joints = fichiersDe(parc.id, brute.id, lot.id, logiciel);
    if (!confirm(`Retirer la config ${logiciel} du lot « ${lot.identifiant} »${avecFichiers(joints)} ?`)) return;
    await effacerFichiers(joints);
    enregistrer(supprimerConfigLot(ctx.base, parc.id, brute.id, lot.id, logiciel));
  });
  // Firmware personnalisé (NovaLCT) : le rappel N6, sous le formulaire.
  const n6 = logiciel === 'NovaLCT' && config.firmware === 'personnalisé' ? rappelFirmwarePersonnalise() : null;
  return el('div', { class: 'config-lot' },
    el('h5', {}, NOMS_LOGICIEL[logiciel]),
    formulaire,
    n6 ? el('div', { class: 'alerte alerte-info' }, el('strong', {}, `${n6.titre} : `),
      n6.textes.map((t) => el('p', { class: 'rappel-texte' }, t.texte.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»'),
        el('span', { class: 'source' }, ` (${sourceCourte(t.source)}${t.section ? `, ${t.section}` : ''}${t.source.confiance === 'tiers' ? ', source tierce' : ''})`)))) : null,
    zone,
    el('p', { class: 'compte' }, 'Fichiers joints : ils restent sur cet appareil, jamais publiés.'),
    el('ul', { class: 'fichiers-joints' }, ROLES_JOINTS[logiciel].map((role) => elementFichierJoint(parc, brute, lot, config, role))),
    el('div', { class: 'actions' }, retirer));
}

function elementLot(parc, brute, resolue, lot) {
  const cle = `lot:${parc.id}:${brute.id}:${lot.id}`;
  const prefixe = `lot-${parc.id}-${brute.id}-${lot.id}`;
  const zone = el('div', { 'aria-live': 'polite' });
  const formulaire = el('form', { class: 'formulaire', novalidate: '' },
    champTexte(`${prefixe}-identifiant`, 'identifiant', 'Identifiant ou date du lot', lot.identifiant),
    champTexte(`${prefixe}-quantite`, 'quantite', 'Quantité (dalles)', lot.quantite, { inputmode: 'numeric' }),
    champTexte(`${prefixe}-notes`, 'notes', 'Notes', lot.notes),
    el('button', { class: 'bouton', type: 'submit' }, 'Enregistrer le lot'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    const nouvelle = essayer(zone, () => modifierLot(ctx.base, parc.id, brute.id, lot.id,
      { identifiant: donnees.get('identifiant'), quantite: donnees.get('quantite'), notes: donnees.get('notes') }));
    if (nouvelle) enregistrer(nouvelle);
  });

  const configs = lot.configs ?? [];
  const libres = LOGICIELS.filter((l) => !configs.some((c) => c.logiciel === l));
  const conseille = LOGICIEL_DE_MARQUE[normaliser(reglageDalleParc(ctx.base, parc.id, brute.id)?.carteReceptionMarque ?? resolue.carteReceptionMarque)];
  const choix = el('select', { 'aria-label': `Logiciel de la nouvelle config du lot ${lot.identifiant}` },
    [...libres.filter((l) => l === conseille), ...libres.filter((l) => l !== conseille)].map((l) => el('option', { value: l }, NOMS_LOGICIEL[l])));
  const ajouter = el('button', { type: 'button', class: 'bouton' }, 'Ajouter une config');
  ajouter.addEventListener('click', () => {
    const nouvelle = essayer(zone, () => reglerConfigLot(ctx.base, parc.id, brute.id, lot.id, { logiciel: choix.value }));
    if (nouvelle) enregistrer(nouvelle);
  });
  const supprimer = el('button', { type: 'button', class: 'bouton bouton-discret' }, 'Supprimer le lot');
  supprimer.addEventListener('click', async () => {
    const joints = fichiersDe(parc.id, brute.id, lot.id);
    if (!confirm(`Supprimer le lot « ${lot.identifiant} »${avecFichiers(joints)} ?`)) return;
    await effacerFichiers(joints);
    enregistrer(supprimerLot(ctx.base, parc.id, brute.id, lot.id));
  });

  const details = el('details', { class: 'lot', open: ouvertes.has(cle) ? '' : null },
    el('summary', {},
      el('span', { class: 'cas-titre' }, `Lot ${lot.identifiant}`),
      el('span', { class: 'puces' },
        badge(lot.quantite === null || lot.quantite === undefined ? 'quantité non saisie' : pluriel(lot.quantite, 'dalle', 'dalles'), 'badge-a-venir'),
        configs.map((c) => badge(c.logiciel ?? 'config à ranger', c.logiciel ? 'badge-info' : 'badge-alerte')))),
    el('div', { class: 'cas-corps' },
      formulaire,
      zone,
      configs.map((c) => elementConfig(parc, brute, lot, c)),
      libres.length ? el('div', { class: 'actions' }, choix, ajouter) : null,
      el('div', { class: 'actions' }, supprimer)));
  details.addEventListener('toggle', () => (details.open ? ouvertes.add(cle) : ouvertes.delete(cle)));
  return el('li', {}, details);
}

// Lots d'une dalle dans un parc : identifiant ou date, quantité, notes, puis une config par logiciel.
function sectionLots(parc, brute, resolue) {
  const lots = lotsDalleParc(ctx.base, parc.id, brute.id);
  const prefixe = `nouveau-lot-${parc.id}-${brute.id}`;
  const zone = el('div', { 'aria-live': 'polite' });
  const formulaire = el('form', { class: 'formulaire', novalidate: '' },
    champTexte(`${prefixe}-identifiant`, 'identifiant', 'Identifiant ou date du lot', null),
    champTexte(`${prefixe}-quantite`, 'quantite', 'Quantité (dalles, facultatif)', null, { inputmode: 'numeric' }),
    champTexte(`${prefixe}-notes`, 'notes', 'Notes (facultatif)', null),
    el('button', { class: 'bouton', type: 'submit' }, 'Ajouter le lot'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    const nouvelle = essayer(zone, () => ajouterLot(ctx.base, parc.id, brute.id,
      { identifiant: donnees.get('identifiant'), quantite: donnees.get('quantite'), notes: donnees.get('notes') }));
    if (!nouvelle) return;
    // Le nouveau lot s'ouvre, prêt pour sa config.
    const cree = lotsDalleParc(nouvelle, parc.id, brute.id).at(-1);
    ouvertes.add(`lot:${parc.id}:${brute.id}:${cree.id}`);
    enregistrer(nouvelle);
  });
  const cleAjout = `ajout-lot:${parc.id}:${brute.id}`;
  const ajout = el('details', { class: 'ajout-lot', open: ouvertes.has(cleAjout) || lots.length === 0 ? '' : null },
    el('summary', {}, 'Ajouter un lot'),
    formulaire,
    zone);
  ajout.addEventListener('toggle', () => (ajout.open ? ouvertes.add(cleAjout) : ouvertes.delete(cleAjout)));
  return el('div', { class: 'lots-parc' },
    el('h5', {}, `Lots et configs, parc ${parc.nom}`),
    lots.length ? el('ul', { class: 'liste-lots' }, lots.map((lot) => elementLot(parc, brute, resolue, lot))) : null,
    ajout);
}

// Version du logiciel ou du firmware d'un processeur du parc, et date du relevé.
function formulaireLogiciel(parc, brute, resolue) {
  const logiciel = logicielDuProcesseur(resolue);
  const actuel = logicielParc(ctx.base, parc.id, brute.id) ?? {};
  const prefixe = `logiciel-${parc.id}-${brute.id}`;
  const formulaire = el('form', { class: 'formulaire reglage-parc', novalidate: '' },
    champTexte(`${prefixe}-version`, 'version', `Version de ${logiciel} ou du firmware, dans ce parc`, actuel.version, { placeholder: 'non relevée' }),
    champTexte(`${prefixe}-date`, 'dateReleve', 'Date du relevé', actuel.dateReleve, { type: 'date' }),
    el('p', { class: 'compte' }, 'Laisse la version vide pour retirer le relevé.'),
    el('button', { class: 'bouton', type: 'submit' }, 'Enregistrer pour ce parc'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    enregistrer(reglerLogicielParc(ctx.base, parc.id, resolue, { version: donnees.get('version'), dateReleve: donnees.get('dateReleve') }));
  });
  return formulaire;
}

function elementFiche(type, { brute, resolue }) {
  const cle = `${type}:${brute.id}`;
  const manquants = champsManquantsFiche(type, resolue);
  const toutes = toutesSources();
  const parcs = ctx.base.parcs;

  const cases = parcs.map((parc) => {
    const membre = estMembre(ctx.base, parc.id, type, brute.id);
    const caseParc = el('input', { type: 'checkbox', checked: membre ? '' : null });
    caseParc.addEventListener('change', () => enregistrer(basculerMembre(ctx.base, parc.id, type, brute.id)));
    return el('div', {}, el('label', { class: 'case' }, caseParc, el('span', {}, parc.nom)),
      type === 'dalle' && membre ? [formulaireReglage(parc, brute, resolue), sectionLots(parc, brute, resolue)] : null,
      type === 'processeur' && membre ? formulaireLogiciel(parc, brute, resolue) : null);
  });

  const actions = [];
  const boutonModifier = el('button', { class: 'bouton', type: 'button' }, 'Modifier');
  boutonModifier.addEventListener('click', () => modifierFiche(type, brute));
  actions.push(boutonModifier);
  if (brute.statutBase === 'modifiee') {
    const bouton = el('button', { class: 'bouton', type: 'button' }, 'Revenir à l\'original');
    bouton.addEventListener('click', () => {
      if (confirm(`Revenir à la fiche d'origine de ${resolue.nom} ? Ta version modifiée sera effacée.`)) {
        enregistrer(supprimerFiche(ctx.base, type, brute.id));
      }
    });
    actions.push(bouton);
  }
  if (brute.statutBase === 'ajoutee') {
    const bouton = el('button', { class: 'bouton', type: 'button' }, 'Supprimer');
    bouton.addEventListener('click', () => {
      if (confirm(`Supprimer ta fiche ${resolue.nom} ? Exporte ta base avant si tu veux la garder.`)) {
        enregistrer(supprimerFiche(ctx.base, type, brute.id));
      }
    });
    actions.push(bouton);
  }

  const details = el('details', { class: 'cas', open: ouvertes.has(cle) ? '' : null },
    el('summary', {},
      el('span', { class: 'cas-titre' }, resolue.nom),
      el('span', { class: 'puces' },
        brute.statutBase === 'modifiee' ? badge('version modifiée', 'badge-info') : null,
        brute.statutBase === 'ajoutee' ? badge('ma fiche', 'badge-reussi') : null,
        brute.statut === 'information' ? badge('information, à compléter', 'badge-alerte')
          : (manquants.length ? badge(type === 'dalle' ? 'incomplète' : 'à compléter', 'badge-alerte') : null),
        parcs.filter((p) => estMembre(ctx.base, p.id, type, brute.id)).map((p) => {
          if (type === 'processeur') {
            const l = logicielParc(ctx.base, p.id, brute.id);
            return badge(l ? `${p.nom} : ${l.logiciel} ${l.version}` : p.nom, 'badge-a-venir');
          }
          const r = reglageDalleParc(ctx.base, p.id, brute.id);
          const carte = r ? [r.carteReceptionMarque, r.carteReceptionModele].filter(Boolean).join(' ') : '';
          const lots = type === 'dalle' ? lotsDalleParc(ctx.base, p.id, brute.id).length : 0;
          return badge(`${p.nom}${carte ? ` : ${carte}` : ''}${lots ? `, ${pluriel(lots, 'lot', 'lots')}` : ''}`, 'badge-a-venir');
        }))),
    el('div', { class: 'cas-corps formulaire' },
      el('p', { class: 'source' }, `Identifiant : ${brute.id}${resolue.alias ? ` ; aussi appelée ${[].concat(resolue.alias).join(', ')}` : ''}`),
      manquants.length
        ? alerte(`Fiche incomplète : il manque ${manquants.map((m) => libelleChamp(type, m)).join(', ')}. `
          + 'Les onglets disent ce qu\'ils ne peuvent pas calculer, sans deviner.')
        : null,
      el('div', {},
        el('h4', {}, 'Sources'),
        el('ul', { class: 'rappels' }, sourcesCitees(brute).map((id) => el('li', {},
          toutes[id] ? `${sourceCourte(toutes[id])} : ${toutes[id].titre ?? id}` : `${id} (source inconnue)`)))),
      el('div', {},
        el('h4', {}, 'Parcs'),
        cases.length ? cases : el('p', { class: 'compte' }, 'Crée un parc pour y ranger cette fiche.')),
      el('div', { class: 'actions' }, actions)));
  details.addEventListener('toggle', () => (details.open ? ouvertes.add(cle) : ouvertes.delete(cle)));
  return el('li', {}, details);
}

function afficherFiches() {
  const type = $('filtre-type').value;
  const texte = normaliser($('filtre-texte').value.trim());
  const liste = fichesDuType(type).filter(({ brute, resolue }) => !texte
    || normaliser(`${resolue.nom} ${[].concat(resolue.alias ?? []).join(' ')} ${brute.id}`).includes(texte));
  remplacer($('liste-fiches'), liste.length
    ? liste.map((f) => elementFiche(type, f))
    : el('li', { class: 'compte' }, 'Aucune fiche.'));
}

// ---------------------------------------------------------------------------
// Saisie guidée : prépare le JSON d'une fiche avec une source, puis le vérifie comme un JSON collé.
// ---------------------------------------------------------------------------

function champGuide(type, c) {
  const id = `g-${c.nom}`;
  const libelle = `${c.libelle}${c.unite ? ` (${c.unite})` : ''}${c.niveau === 'enregistrer' ? ' *' : ''}`;
  let saisie;
  if (c.valeurs) {
    saisie = el('select', { id, name: c.nom }, el('option', { value: '' }, '—'), c.valeurs.map((v) => el('option', { value: v }, v)));
  } else if (c.genre === 'booleen') {
    saisie = el('select', { id, name: c.nom }, el('option', { value: '' }, 'non précisé'), el('option', { value: 'true' }, 'oui'), el('option', { value: 'false' }, 'non'));
  } else if (c.genre === 'nombre' || c.genre === 'entier' || c.genre === 'entierOuZero' || (type === 'bumper' && c.nom === 'colonnes')) {
    saisie = el('input', { id, name: c.nom, inputmode: c.genre === 'nombre' ? 'decimal' : 'numeric', autocomplete: 'off' });
  } else {
    saisie = el('input', { id, name: c.nom, type: 'text', autocomplete: 'off',
      placeholder: c.genre === 'liste' ? 'séparés par des virgules' : null });
  }
  if (!AVEC_TYPE[c.nom]) return el('div', { class: 'champ' }, el('label', { for: id }, libelle), saisie);
  return el('div', { class: 'paire' },
    el('div', { class: 'champ' }, el('label', { for: id }, libelle), saisie),
    el('div', { class: 'champ' }, el('label', { for: `${id}-type` }, 'Type de valeur'),
      el('select', { id: `${id}-type`, name: `${c.nom}-type` },
        TYPES_VALEUR.map((t) => el('option', { value: t, selected: t === AVEC_TYPE[c.nom] ? '' : null }, t)))));
}

// Dalles compatibles d'un bumper : groupées par marque et par gamme, avec la recherche du Mur (nom ou pitch).
// La recherche masque les cases sans les retirer : les cases cochées restent cochées.
function choixCompatibles() {
  const dalles = fichesDuType('dalle').filter(({ brute }) => brute.statut !== 'information').map(({ resolue }) => resolue);
  const arbre = arbreDalles(dalles);
  const recherche = el('input', { type: 'search', autocomplete: 'off', placeholder: 'BP2, URMIII03, 2,6…', 'aria-label': 'Rechercher une dalle compatible' });
  const marques = arbre.map((m) => el('details', { class: 'groupe-marque' },
    el('summary', {}, m.marque),
    m.gammes.map((g) => el('div', { class: 'groupe-gamme' },
      el('p', { class: 'compte' }, g.gamme),
      g.fiches.map((f) => el('label', { class: 'case', 'data-id': f.id },
        el('input', { type: 'checkbox', name: 'compatibles', value: f.id }), el('span', {}, f.libelle)))))));
  recherche.addEventListener('input', () => {
    const q = recherche.value.trim();
    const gardees = new Set(arbreDalles(dalles, { recherche: q }).flatMap((m) => m.gammes.flatMap((g) => g.fiches.map((f) => f.id))));
    for (const label of recherche.closest('fieldset').querySelectorAll('label[data-id]')) label.hidden = !gardees.has(label.dataset.id);
    for (const groupe of recherche.closest('fieldset').querySelectorAll('.groupe-gamme')) groupe.hidden = !groupe.querySelector('label:not([hidden])');
    for (const details of marques) {
      details.hidden = !details.querySelector('label:not([hidden])');
      if (q) details.open = !details.hidden;
    }
  });
  return el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, 'Dalles compatibles'), recherche, marques);
}

function construireGuidee() {
  const type = $('guidee-type').value;
  const champs = CHAMPS[type];
  const groupe = (titre, liste) => (liste.length ? el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, titre), liste.map((c) => champGuide(type, c))) : null);
  const facultatifs = champs.filter((c) => !c.niveau);
  const compatibles = type === 'bumper' ? choixCompatibles() : null;
  remplacer($('guidee-champs'),
    el('p', { class: 'note' }, '* obligatoire pour enregistrer. Un champ laissé vide reste vide : l\'appli ne devine jamais une valeur.'),
    groupe('Obligatoires pour enregistrer', champs.filter((c) => c.niveau === 'enregistrer')),
    groupe('Pour une fiche complète', champs.filter((c) => c.niveau === 'complet')),
    type === 'regie' ? el('p', { class: 'note' }, 'Entrées, sorties (type de liaison, nombre, format maxi, chacune avec sa source) ou modes de sortie : à ajouter dans le JSON à l\'étape suivante (voir le modèle de régie).') : null,
    compatibles,
    facultatifs.length ? el('details', { class: 'fiche' }, el('summary', {}, 'Autres champs'),
      el('div', { class: 'formulaire' }, facultatifs.map((c) => champGuide(type, c)))) : null,
    el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, 'Source de toutes ces valeurs'),
      el('div', { class: 'champ' }, el('label', { for: 'g-source-titre' }, 'Fichier et page *'),
        el('input', { id: 'g-source-titre', type: 'text', autocomplete: 'off', placeholder: 'fiche_CB5_MKII.pdf, p. 2' })),
      el('div', { class: 'champ' }, el('label', { for: 'g-source-court' }, 'Nom court'),
        el('input', { id: 'g-source-court', type: 'text', autocomplete: 'off', placeholder: 'Fiche ROE' })),
      el('div', { class: 'paire' },
        el('div', { class: 'champ' }, el('label', { for: 'g-source-date' }, 'Date du document'),
          el('input', { id: 'g-source-date', type: 'text', autocomplete: 'off', placeholder: 'AAAA-MM-JJ' })),
        el('div', { class: 'champ' }, el('label', { for: 'g-source-confiance' }, 'Origine'),
          el('select', { id: 'g-source-confiance' }, CONFIANCES.map((x) => el('option', { value: x }, x)))))));
}

function preparerJson() {
  const type = $('guidee-type').value;
  const zone = $('guidee-champs');
  const valeurDe = (nom) => zone.querySelector(`[name="${nom}"]`)?.value.trim() ?? '';
  const titre = $('g-source-titre').value.trim();
  const court = $('g-source-court').value.trim();
  const fiche = { type };
  for (const c of CHAMPS[type]) {
    const brut = valeurDe(c.nom);
    if (brut === '') continue;
    let valeur = brut;
    if (c.genre === 'nombre' || c.genre === 'entier' || c.genre === 'entierOuZero' || (type === 'bumper' && c.nom === 'colonnes')) {
      const n = lireNombre(brut);
      valeur = Number.isFinite(n) ? n : brut;
    } else if (c.genre === 'liste') {
      valeur = brut.split(',').map((x) => x.trim()).filter(Boolean);
    } else if (c.genre === 'booleen') {
      valeur = brut === 'true';
    }
    fiche[c.nom] = c.genre === 'brut' ? valeur : { valeur, source: 'SOURCE', ...(AVEC_TYPE[c.nom] ? { type: valeurDe(`${c.nom}-type`) } : {}) };
  }
  if (type === 'bumper') fiche.compatibles = [...zone.querySelectorAll('input[name="compatibles"]:checked')].map((x) => x.value);

  // Identifiant de source propre à la fiche, sans écraser une source existante.
  const racine = `saisie-${identifiant(fiche) || 'fiche'}`;
  let idSource = racine;
  for (let i = 2; toutesSources()[idSource]; i += 1) idSource = `${racine}-${i}`;
  for (const champ of Object.values(fiche)) if (champ?.source === 'SOURCE') champ.source = idSource;
  const sources = {
    [idSource]: { titre, court: court || titre, date: $('g-source-date').value.trim() || null, confiance: $('g-source-confiance').value },
  };
  $('json-fiche').value = JSON.stringify({ sources, fiche }, null, 2);
  choisirMode('json');
  verifierJson();
}

// ---------------------------------------------------------------------------
// JSON collé : vérification en direct, puis enregistrement
// ---------------------------------------------------------------------------

function choisirMode(mode) {
  for (const radio of document.querySelectorAll('input[name="modeSaisie"]')) radio.checked = radio.value === mode;
  $('saisie-guidee').hidden = mode !== 'guidee';
  $('saisie-json').hidden = mode !== 'json';
}

function nomFiche(fiche) {
  return fiche.nom ?? ([fiche.marque, fiche.modele, fiche.version].filter(Boolean).join(' ') || 'sans nom');
}

function statutEntree(type, fiche) {
  const id = fiche.id ?? identifiant(fiche);
  const existante = LIBELLES_TYPE[type] ? fichesDuType(type).find(({ brute }) => brute.id === id)?.brute : null;
  if (!existante) return `Nouvelle fiche (identifiant ${id}).`;
  if (existante.statutBase === 'depart') return `Remplacera la fiche de départ ${id} par ta version modifiée ; retour à l'original possible.`;
  return `Remplacera ta fiche ${id}.`;
}

function verifierJson() {
  const texte = $('json-fiche').value.trim();
  const bouton = $('enregistrer-json');
  bouton.disabled = true;
  if (!texte) {
    remplacer($('rapport-json'), el('p', { class: 'note' }, 'Colle ici le JSON d\'une fiche : l\'appli vérifie les sources et dit ce qui manque avant d\'enregistrer.'));
    return;
  }
  const lecture = validerImport(texte, toutesSources());
  if (lecture.erreurs.length) {
    remplacer($('rapport-json'), lecture.erreurs.map((x) => alerte(x, 'alerte-erreur')));
    return;
  }
  remplacer($('rapport-json'), lecture.entrees.map(({ type, fiche, validation: v }) => el('div', { class: 'rapport-fiche' },
    el('h4', {}, `${LIBELLES_TYPE[type] ?? 'Type inconnu'} ${nomFiche(fiche)}`),
    v.enregistrable
      ? alerte(`Enregistrable. ${statutEntree(type, fiche)}`, 'alerte-ok')
      : alerte('Pas enregistrable : corrige les erreurs ci-dessous.', 'alerte-erreur'),
    v.erreurs.map((x) => alerte(x, 'alerte-erreur')),
    v.manquants.length
      ? alerte(`Fiche incomplète : il manque ${v.manquants.map((m) => libelleChamp(type, m)).join(', ')}. `
        + 'Elle peut être enregistrée ; les onglets diront ce qu\'ils ne peuvent pas calculer.')
      : null,
    v.avertissements.map((x) => alerte(x, 'alerte-info')))));
  bouton.disabled = !lecture.entrees.some((x) => x.validation.enregistrable);
}

function afficherRapport(zone, rapport, stocke, titre) {
  const { ajoutees, ignorees, refusees, erreurs } = rapport;
  const nomParcActif = ctx.base.parcs.find((p) => p.id === ctx.parcActif)?.nom;
  const horsParc = ajoutees.filter((id) => !TYPES.some((type) => estMembre(ctx.base, ctx.parcActif, type, id)));
  remplacer(zone,
    titre ? el('h4', {}, titre) : null,
    erreurs.map((x) => alerte(x, 'alerte-erreur')),
    ajoutees.length ? alerte(`${pluriel(ajoutees.length, 'fiche enregistrée', 'fiches enregistrées')} : ${ajoutees.join(', ')}.`, 'alerte-ok') : null,
    ignorees.length ? alerte(`${pluriel(ignorees.length, 'fiche identique', 'fiches identiques')} à la base de départ, rien à enregistrer`
      + `${ignorees.length <= 5 ? ` : ${ignorees.join(', ')}` : ''}.`, 'alerte-info') : null,
    refusees.map((r) => alerte(`Refusée : ${r.id}. ${r.erreurs.join(' ')}`, 'alerte-erreur')),
    ajoutees.length && !stocke ? alerte('Stockage local indisponible : enregistré pour cette session seulement. Exporte ta base.', 'alerte-erreur') : null,
    horsParc.length && nomParcActif
      ? alerte(`${horsParc.join(', ')} hors du parc actif « ${nomParcActif} » : coche ce parc dans la fiche (liste des fiches) `
        + 'pour la voir dans les onglets Mur et Data.', 'alerte-info')
      : null);
}

async function enregistrerJson() {
  const texte = $('json-fiche').value.trim();
  const { base, rapport } = importer(ctx.base, texte, ctx.depart, { mode: 'fusionner' });
  if (rapport.erreurs.length) {
    afficherRapport($('rapport-json'), rapport, true);
    return;
  }
  const stocke = rapport.ajoutees.length ? await enregistrer(base) : true;
  if (rapport.ajoutees.length) $('json-fiche').value = '';
  $('enregistrer-json').disabled = true;
  afficherRapport($('rapport-json'), rapport, stocke);
}

// ---------------------------------------------------------------------------
// Consigne pour Claude, export et import
// ---------------------------------------------------------------------------

function afficherConsigne() {
  const type = $('modele-type').value;
  $('consigne-texte').value = `${CONSIGNE_CLAUDE}\n\nModèle :\n${JSON.stringify(MODELES_JSON[type], null, 2)}`;
}

async function copierConsigne() {
  const bouton = $('copier-consigne');
  const texte = $('consigne-texte').value;
  try {
    await navigator.clipboard.writeText(texte);
  } catch (erreur) {
    $('consigne-texte').select();
    document.execCommand('copy');
  }
  bouton.textContent = 'Copié';
  setTimeout(() => { bouton.textContent = 'Copier la consigne et le modèle'; }, 2000);
}

function dateDuJour() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function exporterBase() {
  const tout = $('exporter-tout').checked;
  const avecJoints = $('exporter-fichiers').checked;
  const { base } = ctx;
  if (!tout && base.fiches.length === 0 && base.parcs.length === 0) {
    remplacer($('rapport-import'), alerte('Ta base est vide : rien à exporter. Coche « Tout exporter » pour la base complète.', 'alerte-info'));
    return;
  }
  // Fichiers joints : seulement sur demande, lus sur l'appareil ; ceux qui manquent sont signalés.
  let fichiers = null;
  const manquants = [];
  if (avecJoints) {
    fichiers = [];
    for (const f of fichiersJoints(base)) {
      const lu = await lireFichier(f.id);
      if (lu) fichiers.push(lu);
      else manquants.push(f.nom);
    }
  }
  const donnees = exporter(base, ctx.depart, { tout, fichiers });
  const url = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }));
  const lien = el('a', { href: url, download: `mur-led-base-${dateDuJour()}.json` });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  remplacer($('rapport-import'),
    alerte(`Export : ${pluriel(donnees.fiches.length, 'fiche', 'fiches')}, ${pluriel(donnees.parcs.length, 'parc', 'parcs')}`
      + `${tout ? ', base de départ comprise' : ''}`
      + `${fichiers ? `, ${pluriel(fichiers.length, 'fichier joint', 'fichiers joints')} (${taille(fichiers.reduce((s, f) => s + f.contenu.byteLength, 0))})` : ', sans les fichiers joints'}.`, 'alerte-ok'),
    manquants.length ? alerte(`Absents de cet appareil, donc pas dans l'export : ${manquants.join(', ')}.`) : null);
}

async function importerFichier() {
  const champ = $('fichier-import');
  const fichier = champ.files[0];
  if (!fichier) return;
  const mode = document.querySelector('input[name="modeImport"]:checked').value;
  if (mode === 'remplacer' && !confirm('Remplacer toute ta base (fiches, versions modifiées, parcs) par ce fichier ? Exporte-la avant si tu veux la garder.')) {
    champ.value = '';
    return;
  }
  const texte = await fichier.text();
  const { base, rapport, fichiers } = importer(ctx.base, texte, ctx.depart, { mode });
  // Fichier illisible : ma base reste telle quelle, même en mode « remplacer ».
  if (!rapport.erreurs.length) {
    for (const f of fichiers) {
      await ecrireFichier(f.id, f);
      surAppareil?.push({ id: f.id, nom: f.nom, taille: f.contenu.byteLength });
    }
  }
  const stocke = rapport.erreurs.length ? true : await enregistrer(migrerFichiersConfig(base));
  afficherRapport($('rapport-import'), rapport, stocke, `Import de ${fichier.name}${mode === 'remplacer' && !rapport.erreurs.length ? ' (base remplacée)' : ''}`);
  if (!rapport.erreurs.length && fichiers.length) {
    $('rapport-import').append(alerte(`${pluriel(fichiers.length, 'fichier joint rangé', 'fichiers joints rangés')} sur cet appareil `
      + `(${taille(fichiers.reduce((s, f) => s + f.contenu.byteLength, 0))}).`, 'alerte-ok'));
  }
  champ.value = '';
}

// ---------------------------------------------------------------------------

export function actualiserEcranBase(contexte) {
  ctx = contexte;
  afficherEtat();
  afficherParcs();
  afficherFiches();
  rafraichirFichiers();
}

// `enregistrerBase(nouvelle)` enregistre ma base, met à jour tous les onglets et renvoie false si le stockage a échoué.
export function initialiserBase(contexte, enregistrerBase) {
  enregistrer = enregistrerBase;
  $('form-parc').addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const champ = evenement.target.elements.nom;
    const nom = champ.value.trim();
    if (!nom) return;
    champ.value = '';
    enregistrer(creerParc(ctx.base, nom));
  });
  $('filtre-type').addEventListener('change', afficherFiches);
  $('filtre-texte').addEventListener('input', afficherFiches);
  for (const radio of document.querySelectorAll('input[name="modeSaisie"]')) {
    radio.addEventListener('change', () => choisirMode(radio.value));
  }
  $('guidee-type').addEventListener('change', construireGuidee);
  $('preparer-json').addEventListener('click', preparerJson);
  $('json-fiche').addEventListener('input', verifierJson);
  $('enregistrer-json').addEventListener('click', enregistrerJson);
  $('modele-type').addEventListener('change', afficherConsigne);
  $('copier-consigne').addEventListener('click', copierConsigne);
  $('exporter').addEventListener('click', exporterBase);
  $('fichier-import').addEventListener('change', importerFichier);
  actualiserEcranBase(contexte);
  construireGuidee();
  verifierJson();
  afficherConsigne();
}
