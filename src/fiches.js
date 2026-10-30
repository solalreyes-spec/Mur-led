// Base locale : fiches de l'utilisateur, validation, fusion avec la base de départ, export et import, parcs.
// Fonctions pures, sans accès au stockage ni à l'interface. La base de départ (data/) reste en lecture seule.

import {
  resoudreFiche, champsManquants, champsManquantsRegie, BIT_DEPTH_PAR_DEFAUT, ErreurSaisie, PLUS_DEFAVORABLE, pixelsPourClassement,
} from './calculs.js';
import { nombre, nombreCourt, dateCourte } from './format.js';

export const TYPES = ['dalle', 'processeur', 'regie', 'bumper'];
export const LIBELLES_TYPE = { dalle: 'Dalle', processeur: 'Processeur', regie: 'Régie ou scaler', bumper: 'Bumper ou barre' };
// Types de valeur acceptés : ceux de la consigne, plus « moyenne » et « estimée » déjà présents dans la base.
// « plafond constructeur » : la fiche ne donne qu'un maximum (« <600 W/m² », « <15 kg »), ramené à la dalle.
// « nominal » : pitch du nom commercial (1,5 mm pour 500 mm / 320 px = 1,563 mm) ; les calculs prennent le pitch réel.
export const TYPES_VALEUR = ['max', 'typique', 'mesuré', 'moyenne', 'estimée', 'plafond constructeur', 'nominal'];
export const CONFIANCES = ['constructeur', 'loueur', 'revendeur', 'base tierce', 'presse spécialisée', 'mesuré', 'formation'];

// Champs connus par type. genre : 'brut' (texte ou nombre non sourcé : identité), 'nombre', 'entier', 'texte', 'liste'.
// niveau : 'enregistrer' (obligatoire pour enregistrer), 'complet' (obligatoire pour une fiche complète) ou absent.
export const CHAMPS = {
  dalle: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'version', libelle: 'Version', genre: 'brut' },
    { nom: 'gamme', libelle: 'Gamme (Black Pearl, Carbon MKII…)', genre: 'brut' },
    { nom: 'largeurMm', libelle: 'Largeur', genre: 'nombre', unite: 'mm', niveau: 'enregistrer' },
    { nom: 'hauteurMm', libelle: 'Hauteur', genre: 'nombre', unite: 'mm', niveau: 'enregistrer' },
    { nom: 'pxH', libelle: 'Pixels en largeur', genre: 'entier', unite: 'px', niveau: 'enregistrer' },
    { nom: 'pxV', libelle: 'Pixels en hauteur', genre: 'entier', unite: 'px', niveau: 'enregistrer' },
    { nom: 'pitchMm', libelle: 'Pitch', genre: 'nombre', unite: 'mm', niveau: 'complet' },
    { nom: 'profondeurMm', libelle: 'Profondeur', genre: 'nombre', unite: 'mm', niveau: 'complet' },
    { nom: 'poidsKg', libelle: 'Poids avec cadre', genre: 'nombre', unite: 'kg', niveau: 'complet' },
    { nom: 'pMaxW', libelle: 'P max', genre: 'nombre', unite: 'W', niveau: 'complet' },
    { nom: 'pMoyW', libelle: 'P moyenne', genre: 'nombre', unite: 'W' },
    { nom: 'tensionEntreeV', libelle: 'Tension d\'entrée', genre: 'nombre', unite: 'V', niveau: 'complet' },
    { nom: 'courantAppelA', libelle: 'Courant d\'appel', genre: 'nombre', unite: 'A' },
    { nom: 'courantAppelMs', libelle: 'Durée du courant d\'appel', genre: 'nombre', unite: 'ms' },
    { nom: 'chainagePowerMax', libelle: 'Chaînage power constructeur', genre: 'entier', unite: 'dalles par ligne 16 A' },
    { nom: 'carteReceptionMarque', libelle: 'Carte de réception (marque)', genre: 'texte', niveau: 'complet' },
    { nom: 'carteReceptionModele', libelle: 'Carte de réception (modèle)', genre: 'texte', niveau: 'complet' },
    { nom: 'fichierConfig', libelle: 'Fichier de config (rcfgx ou fixture pack, version)', genre: 'texte', niveau: 'complet' },
    { nom: 'bitsParCouleur', libelle: 'Bits par couleur', genre: 'entier', unite: 'bits' },
    { nom: 'rafraichissementHz', libelle: 'Rafraîchissement', genre: 'nombre', unite: 'Hz' },
    { nom: 'scan', libelle: 'Scan', genre: 'texte' },
    { nom: 'luminositeNits', libelle: 'Luminosité', genre: 'nombre', unite: 'nits' },
    { nom: 'indiceIP', libelle: 'Indice IP', genre: 'texte' },
    { nom: 'courbure', libelle: 'Courbure', genre: 'texte' },
    { nom: 'maxAccroche', libelle: 'Maximum en accroche', genre: 'nombre', unite: 'dalles', niveau: 'complet' },
    { nom: 'maxStack', libelle: 'Maximum en stack', genre: 'nombre', unite: 'dalles', niveau: 'complet' },
    { nom: 'ledsParPixel', libelle: 'LED par pixel', genre: 'entier' },
    { nom: 'rotationPossible', libelle: 'Rotation possible (portrait et paysage)', genre: 'booleen' },
  ],
  processeur: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    {
      nom: 'famille', libelle: 'Famille (brompton, novastar, colorlight, megapixel, linsn, kystar ou mooncell)', genre: 'brut', niveau: 'enregistrer',
      valeurs: ['brompton', 'novastar', 'colorlight', 'megapixel', 'linsn', 'kystar', 'mooncell'],
    },
    { nom: 'gamme', libelle: 'Gamme (MCTRL, VX Pro, Tessera…)', genre: 'brut' },
    { nom: 'pixelsMax', libelle: 'Pixels maxi', genre: 'entier', unite: 'px' },
    { nom: 'ports', libelle: 'Nombre de ports', genre: 'entier' },
    { nom: 'largeurMaxPx', libelle: 'Largeur maxi', genre: 'entier', unite: 'px' },
    { nom: 'hauteurMaxPx', libelle: 'Hauteur maxi', genre: 'entier', unite: 'px' },
    { nom: 'debitUtileBps', libelle: 'Débit utile par port', genre: 'nombre', unite: 'bit/s' },
    { nom: 'capacitePort60Hz8bits', libelle: 'Capacité par port à 60 Hz, 8 bits', genre: 'nombre', unite: 'px' },
    { nom: 'capacitePort60Hz10bits', libelle: 'Capacité par port à 60 Hz, 10 bits', genre: 'nombre', unite: 'px' },
    { nom: 'capacitePort60Hz12bits', libelle: 'Capacité par port à 60 Hz, 12 bits', genre: 'nombre', unite: 'px' },
    { nom: 'dallesMax', libelle: 'Dalles maxi', genre: 'entier' },
    { nom: 'hauteurReduitePortPx', libelle: 'Hauteur de port au-delà de laquelle la capacité baisse (Colorlight)', genre: 'entier', unite: 'px' },
    { nom: 'longueurCable5GM', libelle: 'Longueur maxi du câble des ports 5G', genre: 'nombre', unite: 'm' },
    { nom: 'entreesTypes', libelle: 'Entrées (types de liaison)', genre: 'liste' },
    { nom: 'latenceMinImages', libelle: 'Latence mini (0 si « 0 frame »)', genre: 'entierOuZero', unite: 'images' },
    { nom: 'latenceMaxImages', libelle: 'Latence maxi', genre: 'entierOuZero', unite: 'images' },
    { nom: 'puissanceW', libelle: 'Consommation', genre: 'nombre', unite: 'W' },
    { nom: 'poidsKg', libelle: 'Poids', genre: 'nombre', unite: 'kg' },
    { nom: 'hauteurU', libelle: 'Hauteur en rack', genre: 'nombre', unite: 'U' },
    { nom: 'statutCommercial', libelle: 'Statut commercial (actuel, ancien…)', genre: 'texte' },
  ],
  // Modèle générique (régies, switchers, scalers) : les entrées, sorties et emplacements sont des listes d'objets
  // ({ type, nombre, largeurMaxPx, hauteurMaxPx, frequenceMaxHz, source }), saisies dans le JSON (LISTES_SOURCEES).
  regie: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'gamme', libelle: 'Gamme', genre: 'brut' },
    { nom: 'role', libelle: 'Rôle', genre: 'brut' },
    { nom: 'position', libelle: 'Position (amont ou aval du processeur)', genre: 'brut', valeurs: ['amont', 'aval'] },
    { nom: 'sortiesTypes', libelle: 'Sorties (types de liaison)', genre: 'liste' },
    { nom: 'couches', libelle: 'Couches', genre: 'entier' },
    { nom: 'latence', libelle: 'Latence', genre: 'texte' },
    { nom: 'bitsParCouleur', libelle: 'Bits par couleur', genre: 'entier', unite: 'bits' },
    { nom: 'hauteurU', libelle: 'Hauteur en rack', genre: 'nombre', unite: 'U' },
    { nom: 'poidsKg', libelle: 'Poids', genre: 'nombre', unite: 'kg' },
    { nom: 'puissanceW', libelle: 'Consommation', genre: 'nombre', unite: 'W' },
    { nom: 'statutCommercial', libelle: 'Statut commercial (actuel, ancien, arrêté…)', genre: 'texte' },
  ],
  bumper: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'colonnes', libelle: 'Colonnes portées', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'poidsKg', libelle: 'Poids', genre: 'nombre', unite: 'kg', niveau: 'enregistrer' },
    { nom: 'cmuKg', libelle: 'CMU', genre: 'nombre', unite: 'kg' },
  ],
};

// Libellés des champs manquants pour les processeurs et régies (complétude calculée par calculs.js).
const LIBELLES_MANQUANTS = {
  capacite: 'Capacité par port (débit utile ou capacités à 60 Hz)',
  modesSortie: 'Modes de sortie',
  sortiesTypes: 'Sorties (types de liaison)',
};

export function libelleChamp(type, nom) {
  return CHAMPS[type]?.find((c) => c.nom === nom)?.libelle ?? LIBELLES_MANQUANTS[nom] ?? nom;
}

// Listes d'objets qui portent chacun leur source (processeurs : formats de canvas ; régies : modes de sortie,
// entrées, sorties, emplacements de cartes).
const LISTES_SOURCEES = ['formatsCanvas', 'modesSortie', 'entrees', 'sorties', 'emplacements'];

function estSourcee(champ) {
  return champ !== null && typeof champ === 'object' && !Array.isArray(champ) && ('valeur' in champ || 'valeurs' in champ);
}

const vide = (x) => x === null || x === undefined || x === '';

// Retire les champs vides : une valeur null (« la fiche ne donne rien ») compte comme absente.
export function nettoyerFiche(fiche) {
  const propre = {};
  for (const [nom, champ] of Object.entries(fiche)) {
    if (estSourcee(champ)) {
      if (champ.valeurs) {
        const valeurs = champ.valeurs.filter((x) => !vide(x?.valeur));
        if (valeurs.length > 0) propre[nom] = { ...champ, valeurs };
      } else if (!vide(champ.valeur)) {
        propre[nom] = champ;
      }
    } else if (!vide(champ)) {
      propre[nom] = champ;
    }
  }
  return propre;
}

function valeurValide(genre, valeur) {
  if (genre === 'nombre') return typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0;
  if (genre === 'entier') return Number.isInteger(valeur) && valeur > 0;
  if (genre === 'entierOuZero') return Number.isInteger(valeur) && valeur >= 0;
  if (genre === 'texte') return typeof valeur === 'string' && valeur.trim() !== '';
  if (genre === 'liste') return Array.isArray(valeur) && valeur.length > 0;
  if (genre === 'booleen') return typeof valeur === 'boolean';
  return true;
}

// Vérifie une fiche avant l'enregistrement.
// enregistrable : minimum de calcul présent, chaque valeur a une source connue, valeurs du bon genre.
// manquants : champs obligatoires pour une fiche complète. avertissements : ce qui mérite d'être vérifié.
export function validerFiche(type, fiche, sources = {}) {
  const erreurs = [];
  const avertissements = [];
  if (!TYPES.includes(type)) {
    return { enregistrable: false, erreurs: [`Type de fiche inconnu : ${type}.`], manquants: [], avertissements, fiche };
  }
  const propre = nettoyerFiche(fiche ?? {});
  const champs = CHAMPS[type];
  const sourcesUtilisees = new Set();

  for (const c of champs.filter((x) => x.niveau === 'enregistrer')) {
    if (propre[c.nom] === undefined) erreurs.push(`${c.libelle} : obligatoire pour enregistrer.`);
  }
  for (const c of champs.filter((x) => x.valeurs && propre[x.nom] !== undefined)) {
    if (!c.valeurs.includes(propre[c.nom])) erreurs.push(`${c.libelle} : « ${propre[c.nom]} » n'est pas une valeur possible.`);
  }

  for (const [nom, champ] of Object.entries(propre)) {
    if (!estSourcee(champ)) continue;
    const spec = champs.find((c) => c.nom === nom);
    const libelle = spec?.libelle ?? nom;
    for (const entree of champ.valeurs ?? [champ]) {
      if (!entree.source) erreurs.push(`${libelle} : valeur sans source.`);
      else if (!sources[entree.source]) erreurs.push(`${libelle} : source « ${entree.source} » inconnue.`);
      else sourcesUtilisees.add(entree.source);
      if (spec && !valeurValide(spec.genre, entree.valeur)) {
        erreurs.push(`${libelle} : « ${entree.valeur} » n'est pas ${{ nombre: 'un nombre positif', entier: 'un entier positif', entierOuZero: 'un entier positif ou nul', texte: 'un texte', liste: 'une liste', booleen: 'oui ou non (true ou false)' }[spec.genre] ?? 'valide'}.`);
      }
      if (entree.type !== undefined && !TYPES_VALEUR.includes(entree.type)) {
        erreurs.push(`${libelle} : type de valeur « ${entree.type} » inconnu (max, typique ou mesuré).`);
      }
    }
  }
  // Sources portées par des listes non sourcées (formats de canvas, modes de sortie, entrées, sorties et emplacements
  // du modèle générique des régies) : une source par élément.
  for (const nom of LISTES_SOURCEES) {
    if (!Array.isArray(propre[nom])) continue;
    for (const entree of propre[nom]) {
      if (!entree.source || !sources[entree.source]) erreurs.push(`${nom} : source « ${entree.source ?? ''} » absente ou inconnue.`);
      else sourcesUtilisees.add(entree.source);
      if ((nom === 'entrees' || nom === 'sorties') && !entree.type) erreurs.push(`${nom} : type de liaison absent.`);
      if (['entrees', 'sorties', 'emplacements'].includes(nom) && !(Number.isInteger(entree.nombre) && entree.nombre > 0)) {
        erreurs.push(`${nom} : nombre « ${entree.nombre ?? ''} » absent ou non entier.`);
      }
    }
  }
  for (const id of sourcesUtilisees) {
    const s = sources[id];
    if (!s.titre) erreurs.push(`Source « ${id} » : titre absent (nom du fichier et page).`);
    if (!s.date) avertissements.push(`Source « ${id} » : date du document absente.`);
  }
  if (type === 'dalle' || type === 'bumper') {
    const connus = new Set([...champs.map((c) => c.nom), ...CHAMPS_TECHNIQUES]);
    for (const nom of Object.keys(propre).filter((n) => !connus.has(n))) avertissements.push(`Champ inconnu : « ${nom} », ignoré par les calculs.`);
  }

  let manquants = [];
  if (erreurs.length === 0) {
    if (type === 'dalle' && !propre.gabarit) {
      manquants = champs.filter((c) => c.niveau === 'complet' && propre[c.nom] === undefined).map((c) => c.nom);
    } else if (type === 'processeur') {
      manquants = champsManquants(resoudreFiche(propre, sources));
    } else if (type === 'regie') {
      manquants = champsManquantsRegie(resoudreFiche(propre, sources));
    }
  }
  return { enregistrable: erreurs.length === 0, erreurs, manquants, avertissements, fiche: propre };
}

// Champs manquants d'une fiche déjà résolue (valeurs simples), pour les alertes des onglets.
export function champsManquantsFiche(type, fiche) {
  if (type === 'dalle') {
    if (fiche.gabarit) return [];
    return CHAMPS.dalle.filter((c) => c.niveau === 'complet' && (fiche[c.nom] === undefined || fiche[c.nom] === null)).map((c) => c.nom);
  }
  if (type === 'processeur') return champsManquants(fiche);
  if (type === 'regie') return champsManquantsRegie(fiche);
  return [];
}

// Champs non sourcés reconnus sur une dalle ou un bumper (identité, liens, unités et conditions des maximums).
const CHAMPS_TECHNIQUES = [
  'id', 'nom', 'variante', 'alias', 'usage', 'note', 'statut', 'gabarit', 'demiDalle', 'demiDe', 'lot', 'type',
  'maxAccrocheUnite', 'maxAccrocheConditions', 'maxStackUnite', 'maxStackConditions', 'compatibles', 'forme',
  // Dalle en plusieurs versions : [{ id, nom }] et la version retenue par défaut (la plus défavorable).
  'declinaisons', 'declinaisonDefaut',
];

// Identifiant lisible à partir de la marque, du modèle et de la version : « roe-cb5-mkii ».
export function identifiant(fiche) {
  return [fiche.marque, fiche.modele, fiche.version]
    .filter(Boolean).join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function baseVide() {
  return { format: 'appli-mur-led/base-utilisateur', version: 1, sources: {}, fiches: [], parcs: [] };
}

// Ajoute ou remplace une fiche de l'utilisateur ; garde les sources qu'elle cite parmi celles fournies.
export function enregistrerFiche(base, type, fiche, sources = {}) {
  const propre = nettoyerFiche(fiche);
  if (!propre.id) propre.id = identifiant(propre);
  delete propre.statutBase;
  const cites = new Set();
  for (const champ of Object.values(propre)) {
    if (estSourcee(champ)) for (const x of champ.valeurs ?? [champ]) cites.add(x.source);
  }
  for (const nom of LISTES_SOURCEES) if (Array.isArray(propre[nom])) for (const x of propre[nom]) cites.add(x.source);
  const nouvellesSources = Object.fromEntries(Object.entries(sources).filter(([id]) => cites.has(id)));
  const fiches = base.fiches.filter((f) => !(f.type === type && f.fiche.id === propre.id));
  return { ...base, sources: { ...base.sources, ...nouvellesSources }, fiches: [...fiches, { type, fiche: propre }] };
}

// Supprime une fiche de l'utilisateur : pour une version modifiée, c'est le retour à l'original.
export function supprimerFiche(base, type, id) {
  return { ...base, fiches: base.fiches.filter((f) => !(f.type === type && f.fiche.id === id)) };
}

// Où vit chaque type dans la base de départ : [fichier, liste].
const EMPLACEMENTS = { dalle: ['dalles', 'dalles'], bumper: ['dalles', 'bumpers'], processeur: ['processeurs', 'processeurs'], regie: ['regies', 'regies'] };

// Base de départ + fiches de l'utilisateur. Chaque fiche porte statutBase : 'depart', 'modifiee' ou 'ajoutee'.
export function fusionner(depart, base) {
  const marquer = (liste) => (liste ?? []).map((f) => ({ ...f, statutBase: 'depart' }));
  const resultat = {
    dalles: {
      ...depart.dalles, dalles: marquer(depart.dalles?.dalles), gabarits: marquer(depart.dalles?.gabarits), bumpers: marquer(depart.dalles?.bumpers),
      informations: marquer(depart.dalles?.informations),
    },
    processeurs: { ...depart.processeurs, processeurs: marquer(depart.processeurs?.processeurs), informations: marquer(depart.processeurs?.informations) },
    regies: { ...depart.regies, regies: marquer(depart.regies?.regies) },
  };
  for (const fichier of Object.keys(resultat)) {
    resultat[fichier].sources = { ...(depart[fichier]?.sources ?? {}), ...base.sources };
  }
  for (const { type, fiche } of base.fiches) {
    const [fichier, nomListe] = EMPLACEMENTS[type];
    // Fiche d'information reprise par l'utilisateur : complète (dalle : dimensions et pixels ; processeur : champs
    // obligatoires du calcul), elle rejoint les fiches calculées ; sinon elle reste une fiche d'information, modifiée.
    const infos = { dalle: resultat.dalles.informations, processeur: resultat.processeurs.informations }[type] ?? [];
    const j = infos.findIndex((f) => f.id === fiche.id);
    if (j >= 0) {
      const complete = type === 'dalle'
        ? ['largeurMm', 'hauteurMm', 'pxH', 'pxV'].every((c) => !vide(fiche[c]))
        : champsManquants(resoudreFiche(fiche, resultat.processeurs.sources)).length === 0;
      if (complete) {
        infos.splice(j, 1);
        const calculee = { ...fiche, statutBase: 'modifiee' };
        if (calculee.statut === 'information') delete calculee.statut;
        resultat[fichier][nomListe].push(calculee);
      } else {
        infos[j] = { ...fiche, statutBase: 'modifiee' };
      }
      continue;
    }
    const liste = resultat[fichier][nomListe];
    const i = liste.findIndex((f) => f.id === fiche.id);
    if (i >= 0) liste[i] = { ...fiche, statutBase: 'modifiee' };
    else liste.push({ ...fiche, statutBase: 'ajoutee' });
  }
  return resultat;
}

const sansStatut = (fiche) => {
  const copie = { ...fiche };
  delete copie.statutBase;
  return copie;
};

// Export : par défaut mes fiches, mes versions modifiées, mes parcs et mes sources ; avec `tout`, la base entière.
export function exporter(base, depart, { tout = false, fichiers = null } = {}) {
  let fiches = base.fiches;
  let sources = { ...base.sources };
  if (tout) {
    const f = fusionner(depart, base);
    fiches = [
      ...[...f.dalles.dalles, ...f.dalles.gabarits].map((x) => ({ type: 'dalle', fiche: sansStatut(x) })),
      ...f.dalles.bumpers.map((x) => ({ type: 'bumper', fiche: sansStatut(x) })),
      ...f.processeurs.processeurs.map((x) => ({ type: 'processeur', fiche: sansStatut(x) })),
      ...f.regies.regies.map((x) => ({ type: 'regie', fiche: sansStatut(x) })),
    ];
    sources = { ...f.dalles.sources, ...f.processeurs.sources, ...f.regies.sources };
  }
  return {
    format: 'appli-mur-led/export',
    version: 1,
    contenu: tout ? 'base complète' : 'mes fiches et mes parcs',
    exporteLe: new Date().toISOString(),
    sources,
    fiches,
    parcs: base.parcs,
    // Fichiers joints (configs de dalles) : leur taille toujours, leur contenu seulement sur demande.
    tailleFichiersJoints: tailleFichiersJoints(base),
    ...(fichiers ? {
      fichiersJoints: fichiers.map((f) => ({ id: f.id, nom: f.nom, type: f.type ?? 'application/octet-stream', taille: f.contenu.byteLength, contenuBase64: versBase64(f.contenu) })),
    } : {}),
  };
}

// ArrayBuffer ↔ base64, par tranches (fichiers de plusieurs Mo).
function versBase64(buffer) {
  const octets = new Uint8Array(buffer);
  let texte = '';
  for (let i = 0; i < octets.length; i += 0x8000) texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(texte);
}
function depuisBase64(texte) {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return octets.buffer;
}

function sourcesDepart(depart) {
  return { ...(depart.dalles?.sources ?? {}), ...(depart.processeurs?.sources ?? {}), ...(depart.regies?.sources ?? {}) };
}

// Lit un JSON collé ou importé ({ sources, fiche } ou { sources, fiches: [{ type, fiche }] }) et vérifie chaque fiche.
export function validerImport(entree, sourcesConnues = {}) {
  let objet = entree;
  if (typeof entree === 'string') {
    try {
      objet = JSON.parse(entree);
    } catch (erreur) {
      return { entrees: [], sources: {}, parcs: [], erreurs: [`JSON illisible : ${erreur.message}`] };
    }
  }
  if (!objet || typeof objet !== 'object') return { entrees: [], sources: {}, parcs: [], erreurs: ['JSON vide ou mal formé.'] };
  // Fichier d'une presta (prestas.js) : il a ses fiches et ses parcs, mais s'importe depuis l'écran Prestas.
  if (objet.format === 'appli-mur-led/presta') return { entrees: [], sources: {}, parcs: [], erreurs: ['C\'est une presta : importe-la depuis l\'écran Prestas.'] };
  const sources = objet.sources ?? {};
  const brutes = objet.fiches ?? (objet.fiche ? [{ type: objet.type ?? objet.fiche.type, fiche: objet.fiche }] : []);
  const entrees = brutes.map(({ type, fiche }) => {
    const leType = type ?? fiche?.type;
    const copie = { ...(fiche ?? {}) };
    if (TYPES.includes(copie.type)) delete copie.type;
    return { type: leType, fiche: copie, validation: validerFiche(leType, copie, { ...sourcesConnues, ...sources }) };
  });
  return {
    entrees,
    sources,
    parcs: objet.parcs ?? [],
    fichiers: (objet.fichiersJoints ?? []).filter((f) => f && f.id && typeof f.contenuBase64 === 'string')
      .map((f) => ({ id: f.id, nom: f.nom, type: f.type, contenu: depuisBase64(f.contenuBase64) })),
    // Un export sans fiche mais avec des parcs (parcs de fiches de départ) est valable.
    erreurs: entrees.length || objet.parcs?.length ? [] : ['Aucune fiche trouvée : le JSON doit contenir « fiche » ou « fiches ».'],
  };
}

// Import : fusionne par défaut (ou remplace tout avec mode 'remplacer'). Les fiches identiques à la base de départ
// sont ignorées ; les fiches refusées sont listées avec leurs erreurs.
export function importer(base, json, depart, { mode = 'fusionner' } = {}) {
  const lecture = validerImport(json, sourcesDepart(depart));
  let resultat = mode === 'remplacer' ? baseVide() : base;
  const rapport = { ajoutees: [], ignorees: [], refusees: [], erreurs: lecture.erreurs };
  const origine = fusionner(depart, baseVide());
  for (const { type, fiche, validation } of lecture.entrees) {
    const [fichier, nomListe] = EMPLACEMENTS[type] ?? [];
    const listes = fichier ? [origine[fichier][nomListe], ...(type === 'dalle' ? [origine.dalles.gabarits] : [])] : [];
    const deDepart = listes.flat().find((f) => f.id === fiche.id);
    if (deDepart && JSON.stringify(nettoyerFiche(sansStatut(deDepart))) === JSON.stringify(nettoyerFiche(fiche))) {
      rapport.ignorees.push(fiche.id);
    } else if (!validation.enregistrable) {
      rapport.refusees.push({ id: fiche.id ?? identifiant(fiche), erreurs: validation.erreurs });
    } else {
      resultat = enregistrerFiche(resultat, type, validation.fiche, { ...sourcesDepart(depart), ...lecture.sources });
      rapport.ajoutees.push(fiche.id ?? identifiant(fiche));
    }
  }
  for (const parc of lecture.parcs) {
    resultat = { ...resultat, parcs: [...resultat.parcs.filter((p) => p.id !== parc.id), parc] };
  }
  // Seules les sources de l'utilisateur sont gardées : celles de la base de départ y sont déjà.
  const depSources = sourcesDepart(depart);
  resultat = { ...resultat, sources: Object.fromEntries(Object.entries(resultat.sources).filter(([id]) => !depSources[id] || lecture.sources[id])) };
  // Fichiers joints : à écrire sur l'appareil par l'appelant (stockage.js).
  return { base: resultat, rapport, fichiers: lecture.fichiers ?? [] };
}

// ---------------------------------------------------------------------------
// Parcs nommés : un par prestataire ; une fiche peut appartenir à plusieurs parcs.
// ---------------------------------------------------------------------------

export function creerParc(base, nom) {
  const racine = identifiant({ marque: nom }) || 'parc';
  let id = racine;
  for (let i = 2; base.parcs.some((p) => p.id === id); i += 1) id = `${racine}-${i}`;
  return { ...base, parcs: [...base.parcs, { id, nom, membres: [] }] };
}

export function renommerParc(base, id, nom) {
  return { ...base, parcs: base.parcs.map((p) => (p.id === id ? { ...p, nom } : p)) };
}

export function supprimerParc(base, id) {
  return { ...base, parcs: base.parcs.filter((p) => p.id !== id) };
}

export function estMembre(base, parcId, type, id) {
  return Boolean(base.parcs.find((p) => p.id === parcId)?.membres.some((m) => m.type === type && m.id === id));
}

export function basculerMembre(base, parcId, type, id) {
  return {
    ...base,
    parcs: base.parcs.map((p) => {
      if (p.id !== parcId) return p;
      const present = p.membres.some((m) => m.type === type && m.id === id);
      return { ...p, membres: present ? p.membres.filter((m) => !(m.type === type && m.id === id)) : [...p.membres, { type, id }] };
    }),
  };
}

// « Ajouter au parc » depuis un devis Eventsoft (étape 25, lot 25e2) : dalles et processeurs ajoutés aux membres sans
// doublon ; `references` ({ référence du devis: dalle choisie }) retenues par le parc, leur dalle ajoutée aussi. Jamais
// de « Nombre dans le parc » : il ne vient pas d'un devis.
export function ajouterAuParc(base, parcId, { dalles = [], processeurs = [], references = {} } = {}) {
  return {
    ...base,
    parcs: base.parcs.map((p) => {
      if (p.id !== parcId) return p;
      const membres = [...(p.membres ?? [])];
      const ajouter = (type, id) => {
        if (typeof id === 'string' && id && !membres.some((m) => m.type === type && m.id === id)) membres.push({ type, id });
      };
      dalles.forEach((id) => ajouter('dalle', id));
      processeurs.forEach((id) => ajouter('processeur', id));
      const choisies = Object.entries(references).filter(([ref, id]) => ref && typeof id === 'string' && id);
      choisies.forEach(([, id]) => ajouter('dalle', id));
      const copie = { ...p, membres };
      if (choisies.length) copie.references = { ...(p.references ?? {}), ...Object.fromEntries(choisies) };
      return copie;
    }),
  };
}

// Fiches du parc actif ; parcId null (« Tous ») : toute la liste.
export function filtrerParParc(liste, base, parcId, type) {
  if (!parcId) return liste;
  return liste.filter((f) => estMembre(base, parcId, type, f.id));
}

// Fiches d'information (LEDCAST : pages produit sans données de calcul) : options grisées de la liste des dalles.
export function optionsInformations(informations) {
  return (informations ?? []).map((d) => ({
    id: d.id,
    libelle: `${d.nom}${d.usage ? ` (${d.usage})` : ''} (information, à compléter)`,
    disabled: true,
  }));
}

// Réglages d'une dalle propres à un parc : une même dalle existe avec plusieurs cartes de réception selon le loueur.
// `declinaison` : version de la dalle chez ce prestataire (URMIII03 standard ou Black), identifiant de la fiche.
export const CHAMPS_REGLAGE_PARC = ['carteReceptionMarque', 'carteReceptionModele', 'fichierConfig', 'rotationPossible', 'declinaison'];

export function reglageDalleParc(base, parcId, dalleId) {
  return base.parcs.find((p) => p.id === parcId)?.reglages?.[dalleId] ?? null;
}

// Remplace le réglage d'une dalle dans un parc ; les champs vides sont retirés, un réglage vide disparaît.
export function reglerDalleParc(base, parcId, dalleId, reglage) {
  const propre = {};
  for (const nom of CHAMPS_REGLAGE_PARC) {
    let valeur = typeof reglage?.[nom] === 'string' ? reglage[nom].trim() : reglage?.[nom];
    // Rotation : oui ou non (« true » ou « false » depuis un formulaire), vide = la fiche décide.
    if (nom === 'rotationPossible' && typeof valeur === 'string') valeur = valeur === '' ? null : valeur === 'true';
    if (!vide(valeur)) propre[nom] = valeur;
  }
  return {
    ...base,
    parcs: base.parcs.map((p) => {
      if (p.id !== parcId) return p;
      const reglages = { ...(p.reglages ?? {}) };
      if (Object.keys(propre).length > 0) reglages[dalleId] = propre;
      else delete reglages[dalleId];
      const copie = { ...p, reglages };
      if (Object.keys(reglages).length === 0) delete copie.reglages;
      return copie;
    }),
  };
}

// Profondeur réseau d'un parc, par marque de processeur (Brompton réglé dans l'onglet Base) : 8, 10 ou 12 bits ;
// vide ou autre valeur = défaut de la marque.
const BITS_RESEAU = [8, 10, 12];
const SOURCE_DEFAUT_BITS = {
  brompton: 'défaut (livraison Tessera)', novastar: 'défaut Novastar', colorlight: 'défaut Colorlight',
  megapixel: 'défaut Megapixel (le plus défavorable, aucun défaut publié)',
  linsn: 'défaut Linsn (seule capacité publiée)', kystar: 'défaut Kystar (seule capacité publiée)', mooncell: 'défaut Mooncell (seule capacité publiée)',
};

export function reglerBitsParc(base, parcId, famille, valeur) {
  const bits = Number(valeur);
  return {
    ...base,
    parcs: base.parcs.map((p) => {
      if (p.id !== parcId) return p;
      const bitsReseau = { ...(p.bitsReseau ?? {}) };
      if (valeur !== '' && valeur !== null && BITS_RESEAU.includes(bits)) bitsReseau[famille] = bits;
      else delete bitsReseau[famille];
      const copie = { ...p, bitsReseau };
      if (Object.keys(bitsReseau).length === 0) delete copie.bitsReseau;
      return copie;
    }),
  };
}

// Profondeur réseau à prendre par défaut dans le parc actif (null : « Tous »), avec sa source.
export function bitsReseauParc(base, parcId, famille) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  const bits = parc?.bitsReseau?.[famille];
  if (BITS_RESEAU.includes(bits)) return { bits, source: `Parc ${parc.nom}` };
  return { bits: BIT_DEPTH_PAR_DEFAUT[famille], source: SOURCE_DEFAUT_BITS[famille] ?? 'défaut' };
}

// ---------------------------------------------------------------------------
// Matériel du parc (étape 13b) : longueurs du stock par famille de câble, flight case de chaque dalle
// ---------------------------------------------------------------------------

export const FAMILLES_LONGUEURS = ['data', 'multipaire', 'fibre', 'p16', 'p17'];
export const LIBELLES_LONGUEURS = {
  data: 'Câbles RJ45', multipaire: 'Multipaires 8 RJ45', fibre: 'Fibres', p16: 'Câbles 16 A', p17: 'Câbles P17 32 A tri',
};
const lireDecimal = (x) => Number(String(x).trim().replace(',', '.'));

// « 1, 2, 5, 10 » ou « 1 2 5 10 » (virgule décimale permise avec un point-virgule ou des espaces) : longueurs en mètres,
// triées, sans doublon ; vide = null (longueurs par défaut).
export function lireLongueurs(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return null;
  const morceaux = brut.includes(';') ? brut.split(';') : brut.split(/[\s,]+/);
  const valeurs = morceaux.map((x) => x.trim().replace(/\s*m$/i, '')).filter(Boolean).map(lireDecimal);
  if (!valeurs.length || valeurs.some((x) => !Number.isFinite(x) || x <= 0 || x > 1000)) {
    throw new ErreurSaisie('Longueurs du stock : des nombres de mètres, plus de 0 et 1000 au plus, séparés par des virgules (1, 2, 5, 10).');
  }
  return [...new Set(valeurs)].sort((a, b) => a - b);
}

// Longueurs d'une famille dans un parc ; texte vide : retour aux longueurs par défaut.
export function reglerLongueursParc(base, parcId, famille, texte) {
  if (!FAMILLES_LONGUEURS.includes(famille)) throw new ErreurSaisie('Famille de câble inconnue.');
  const longueurs = lireLongueurs(texte);
  return modifierParc(base, parcId, (p) => {
    const toutes = { ...(p.longueurs ?? {}) };
    if (longueurs) toutes[famille] = longueurs;
    else delete toutes[famille];
    const copie = { ...p, longueurs: toutes };
    if (Object.keys(toutes).length === 0) delete copie.longueurs;
    return copie;
  });
}

// Flight case d'une dalle dans un parc, tous champs facultatifs : dalles et demi-dalles par case (entiers),
// poids du case vide (kg) et dimensions (cm) ; une saisie vide disparaît.
export const CHAMPS_CASE = ['dallesParCase', 'demiParCase', 'poidsCaseKg', 'largeurCm', 'profondeurCm', 'hauteurCm'];
export function reglerCaseParc(base, parcId, dalleId, saisie) {
  const lu = {};
  for (const nom of CHAMPS_CASE) {
    const brut = saisie?.[nom];
    if (brut === null || brut === undefined || String(brut).trim() === '') continue;
    const n = lireDecimal(brut);
    const entier = nom === 'dallesParCase' || nom === 'demiParCase';
    if (!Number.isFinite(n) || n <= 0 || (entier && !Number.isInteger(n))) {
      throw new ErreurSaisie(entier ? 'Dalles par case : un nombre entier, 1 ou plus.' : 'Poids et dimensions du case : des nombres positifs.');
    }
    lu[nom] = n;
  }
  const reglage = {};
  if (lu.dallesParCase) reglage.dallesParCase = lu.dallesParCase;
  if (lu.demiParCase) reglage.demiParCase = lu.demiParCase;
  if (lu.poidsCaseKg) reglage.poidsCaseKg = lu.poidsCaseKg;
  if (lu.largeurCm || lu.profondeurCm || lu.hauteurCm) {
    reglage.dimensionsCm = { largeur: lu.largeurCm ?? null, profondeur: lu.profondeurCm ?? null, hauteur: lu.hauteurCm ?? null };
  }
  return modifierParc(base, parcId, (p) => {
    const cases = { ...(p.cases ?? {}) };
    if (Object.keys(reglage).length) cases[dalleId] = reglage;
    else delete cases[dalleId];
    const copie = { ...p, cases };
    if (Object.keys(cases).length === 0) delete copie.cases;
    return copie;
  });
}

// Ce que la liste de matériel lit du parc : nom, longueurs et cases ; null en « Tous ».
export function materielParc(base, parcId) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  return parc ? { nom: parc.nom, longueurs: parc.longueurs ?? {}, cases: parc.cases ?? {} } : null;
}

// ---------------------------------------------------------------------------
// Lots de fabrication, configs par logiciel, fichiers joints et logiciels des processeurs, par parc
// ---------------------------------------------------------------------------

export const LOGICIELS = ['NovaLCT', 'VMP', 'LEDVISION', 'Tessera'];
// Extensions acceptées : format récent d'abord, ancien format ensuite (.rcfg NovaLCT, .rcvp LEDVISION).
export const EXTENSIONS_CONFIG = { NovaLCT: ['.rcfgx', '.rcfg'], VMP: ['.ncp'], LEDVISION: ['.rcvbp', '.rcvp'] };
const finitPar = (nom, extensions) => extensions.some((e) => String(nom).toLowerCase().endsWith(e));
export const CALIBRATIONS_TESSERA = ['factory', 'mémoire 1', 'mémoire 2', 'mémoire 3'];
export const FIRMWARES = ['standard', 'personnalisé'];
const CHAMPS_CONFIG = ['nomFichier', 'version', 'date', 'provenance', 'multiBatch', 'typeFixture', 'firmwareDalle', 'fixturePack', 'calibration', 'firmware', 'autreFichier', 'notes'];
// Fichiers joints d'une config : le fichier de config, le multi-batch adjustment (NovaLCT), le fixture pack (Tessera),
// et un autre fichier de n'importe quelle extension (.scr d'écran NovaLCT, projet exporté…).
export const ROLES_FICHIER = { fichier: 'fichier', multiBatch: 'fichierMultiBatch', fixturePack: 'fichierFixturePack', autre: 'fichierAutre' };
export const TAILLE_ALERTE_FICHIER = 20 * 1024 * 1024;

const modifierParc = (base, parcId, f) => ({ ...base, parcs: base.parcs.map((p) => (p.id === parcId ? f(p) : p)) });
const lotsAvec = (parc, dalleId, lots) => {
  const tous = { ...(parc.lots ?? {}) };
  if (lots.length > 0) tous[dalleId] = lots;
  else delete tous[dalleId];
  const copie = { ...parc, lots: tous };
  if (Object.keys(tous).length === 0) delete copie.lots;
  return copie;
};

export function lotsDalleParc(base, parcId, dalleId) {
  return base.parcs.find((p) => p.id === parcId)?.lots?.[dalleId] ?? [];
}

function nettoyerLot(lot) {
  const identifiant = String(lot.identifiant ?? '').trim();
  if (!identifiant) throw new ErreurSaisie('Donne l\'identifiant ou la date du lot.');
  const q = typeof lot.quantite === 'string' ? lot.quantite.trim() : lot.quantite;
  let quantite = null;
  if (q !== '' && q !== null && q !== undefined) {
    const n = Number(q);
    if (!Number.isInteger(n) || n < 0) throw new ErreurSaisie('La quantité du lot est un nombre entier de dalles, positif ou nul.');
    quantite = n;
  }
  const notes = String(lot.notes ?? '').trim();
  return { identifiant, quantite, ...(notes ? { notes } : {}) };
}

let compteurLots = 0;
export function ajouterLot(base, parcId, dalleId, lot) {
  const propre = nettoyerLot(lot);
  compteurLots += 1;
  const id = `lot-${Date.now().toString(36)}-${compteurLots.toString(36)}`;
  return modifierParc(base, parcId, (p) => lotsAvec(p, dalleId, [...(p.lots?.[dalleId] ?? []), { id, ...propre, configs: [] }]));
}

export function modifierLot(base, parcId, dalleId, lotId, changements) {
  return modifierParc(base, parcId, (p) => lotsAvec(p, dalleId, (p.lots?.[dalleId] ?? []).map((l) => {
    if (l.id !== lotId) return l;
    const { identifiant, quantite, notes, ...reste } = l;
    return { ...reste, ...nettoyerLot({ identifiant, quantite, notes, ...changements }) };
  })));
}

export function supprimerLot(base, parcId, dalleId, lotId) {
  return modifierParc(base, parcId, (p) => lotsAvec(p, dalleId, (p.lots?.[dalleId] ?? []).filter((l) => l.id !== lotId)));
}

// Plusieurs configs NovaLCT par lot (étape 20) : chacune avec la fréquence et
// la luminosité maxi de son fichier (vides : valable pour toutes). Une config ajoutée a son `id` ; une config d'avant
// n'en a pas, son identifiant se déduit du lot et du logiciel, sans rien réécrire dans la base.
export const idConfig = (config, lotId) => config.id ?? `${lotId}:${config.logiciel}`;

// Nombre saisi, virgule décimale permise : null si vide, NaN si illisible.
function nombreSaisi(x) {
  if (x === null || x === undefined) return null;
  const texte = typeof x === 'number' ? x : String(x).trim().replace(',', '.');
  if (texte === '') return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : NaN;
}
const frequenceValable = (n) => typeof n === 'number' && n >= 1 && n <= 1000;
const luminositeValable = (n) => Number.isInteger(n) && n >= 100 && n <= 10000;
const memeFrequence = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);

// Critères d'une config NovaLCT ; valeur illisible (fichier importé) ignorée, aucun pour un autre logiciel.
export function criteresConfig(config) {
  const nova = config?.logiciel === 'NovaLCT';
  return {
    frequenceHz: nova && frequenceValable(config.frequenceHz) ? config.frequenceHz : null,
    luminositeMax: nova && luminositeValable(config.luminositeMax) ? config.luminositeMax : null,
  };
}
const memesCriteres = (a, b) => memeFrequence(a.frequenceHz, b.frequenceHz) && a.luminositeMax === b.luminositeMax;

// « à 50 Hz et 800 cd/m² », « sans fréquence et sans luminosité notée ».
function texteCriteres({ frequenceHz: f, luminositeMax: l }) {
  const lum = l === null ? 'sans luminosité notée' : `${f === null ? 'à ' : ''}${nombre(l)} cd/m²`;
  return `${f === null ? 'sans fréquence' : `à ${nombreCourt(f)} Hz`} et ${lum}`;
}

// Critères d'une config en clair : « 50 Hz, 800 cd/m² », avec « d'après le nom du fichier » tant que la valeur lue
// dans le nom n'a pas été revue ; '' sans critère.
export function texteCriteresConfig(config) {
  const { frequenceHz: f, luminositeMax: l } = criteresConfig(config);
  const morceaux = [f !== null && `${nombreCourt(f)} Hz`, l !== null && `${nombre(l)} cd/m²`].filter(Boolean);
  const marque = config?.critereDuNom;
  if (marque && ((marque.frequence && f !== null) || (marque.luminosite && l !== null))) morceaux.push('d\'après le nom du fichier');
  return morceaux.join(', ');
}

// Marque « lue dans le nom du fichier », gardée pour les seuls critères qui ont une valeur.
function marqueDuNom(marque, propre) {
  if (!marque || typeof marque !== 'object') return null;
  const garde = {
    ...(marque.frequence && propre.frequenceHz !== undefined ? { frequence: true } : {}),
    ...(marque.luminosite && propre.luminositeMax !== undefined ? { luminosite: true } : {}),
  };
  return Object.keys(garde).length ? garde : null;
}

function nettoyerConfig(config) {
  const { logiciel } = config;
  if (!LOGICIELS.includes(logiciel)) throw new ErreurSaisie('Logiciel de la config : NovaLCT, VMP, LEDVISION ou Tessera.');
  const propre = { logiciel };
  for (const champ of CHAMPS_CONFIG) {
    const valeur = String(config[champ] ?? '').trim();
    if (valeur) propre[champ] = valeur;
  }
  const extensions = EXTENSIONS_CONFIG[logiciel];
  if (propre.nomFichier && extensions && !finitPar(propre.nomFichier, extensions)) {
    throw new ErreurSaisie(`Fichier de config ${logiciel} : un fichier ${extensions.join(' ou ')}.`);
  }
  if (propre.fixturePack && !finitPar(propre.fixturePack, ['.tfp'])) throw new ErreurSaisie('Fixture pack Brompton : un fichier .tfp.');
  if (propre.calibration && logiciel === 'Tessera' && !CALIBRATIONS_TESSERA.includes(propre.calibration)) {
    throw new ErreurSaisie('Calibration Brompton : factory ou mémoire 1 à 3.');
  }
  if (propre.firmware && !FIRMWARES.includes(propre.firmware)) throw new ErreurSaisie('Firmware de la dalle : standard ou personnalisé par le fabricant.');
  // Fréquence et luminosité maxi du fichier : NovaLCT seulement (étape 20).
  const frequence = nombreSaisi(config.frequenceHz);
  const luminosite = nombreSaisi(config.luminositeMax);
  if ((frequence !== null || luminosite !== null) && logiciel !== 'NovaLCT') {
    throw new ErreurSaisie('Fréquence et luminosité maxi : seulement pour une config NovaLCT.');
  }
  if (frequence !== null) {
    if (!frequenceValable(frequence)) throw new ErreurSaisie('Fréquence du fichier : un nombre de 1 à 1000 Hz, ou vide.');
    propre.frequenceHz = frequence;
  }
  if (luminosite !== null) {
    if (!luminositeValable(luminosite)) throw new ErreurSaisie('Luminosité maxi du fichier : un nombre entier de 100 à 10 000 cd/m², ou vide.');
    propre.luminositeMax = luminosite;
  }
  const marque = marqueDuNom(config.critereDuNom, propre);
  if (marque) propre.critereDuNom = marque;
  if (typeof config.id === 'string' && config.id) propre.id = config.id;
  return propre;
}

const avecConfigs = (base, parcId, dalleId, lotId, f) => modifierParc(base, parcId, (p) => lotsAvec(p, dalleId,
  (p.lots?.[dalleId] ?? []).map((l) => (l.id === lotId ? { ...l, configs: f(l.configs ?? [], l) } : l))));
const lotDe = (base, parcId, dalleId, lotId) => lotsDalleParc(base, parcId, dalleId).find((l) => l.id === lotId) ?? null;
const jointsDe = (config) => Object.fromEntries(Object.values(ROLES_FICHIER).filter((cle) => config?.[cle]).map((cle) => [cle, config[cle]]));

// Config d'un lot visée par son identifiant, ou par son logiciel quand le lot n'en a qu'une de ce logiciel.
function trouverConfig(lot, configs, cible) {
  const parId = configs.find((c) => idConfig(c, lot.id) === cible);
  if (parId) return parId;
  const memes = configs.filter((c) => c.logiciel === cible);
  if (memes.length > 1) throw new ErreurSaisie(`Plusieurs configs ${cible} dans le lot ${lot.identifiant} : précise laquelle.`);
  return memes[0] ?? null;
}

// Deux configs NovaLCT d'un lot jamais à la même fréquence et à la même luminosité ; `sauf` : la config modifiée.
function refuserDoublon(lot, configs, propre, sauf) {
  if (propre.logiciel !== 'NovaLCT') return;
  const criteres = criteresConfig(propre);
  if (configs.some((c) => c.logiciel === 'NovaLCT' && idConfig(c, lot.id) !== sauf && memesCriteres(criteresConfig(c), criteres))) {
    throw new ErreurSaisie(`Le lot ${lot.identifiant} a déjà un fichier NovaLCT ${texteCriteres(criteres)} : change la fréquence ou la luminosité.`);
  }
}

// Doublons venus d'un fichier importé (l'appli les refuse à la saisie) : une alerte par paire de critères.
export function doublonsNovaLCT(lot) {
  const vus = [];
  const alertes = [];
  for (const c of (lot.configs ?? []).filter((x) => x.logiciel === 'NovaLCT')) {
    const criteres = criteresConfig(c);
    if (!vus.some((v) => memesCriteres(v, criteres))) vus.push(criteres);
    else {
      const texte = `Deux fichiers NovaLCT ${texteCriteres(criteres)} dans le lot ${lot.identifiant} : corrige l'un des deux.`;
      if (!alertes.includes(texte)) alertes.push(texte);
    }
  }
  return alertes;
}

// Une config par logiciel et par lot, plusieurs pour NovaLCT (étape 20). Avec `id`, cette config est modifiée à sa
// place ; sans, celle du même logiciel est remplacée (refusé pour NovaLCT quand le lot en a plusieurs). Les fichiers
// déjà joints restent attachés.
export function reglerConfigLot(base, parcId, dalleId, lotId, config) {
  const propre = nettoyerConfig(config);
  return avecConfigs(base, parcId, dalleId, lotId, (configs, lot) => {
    if (propre.id) {
      const i = configs.findIndex((c) => idConfig(c, lot.id) === propre.id);
      if (i < 0) throw new ErreurSaisie('Config introuvable dans ce lot.');
      refuserDoublon(lot, configs, propre, propre.id);
      const nouvelle = { ...propre, ...jointsDe(configs[i]) };
      // Identifiant déduit d'une config d'avant : jamais écrit.
      if (!configs[i].id) delete nouvelle.id;
      return configs.map((c, j) => (j === i ? nouvelle : c));
    }
    const avant = trouverConfig(lot, configs, propre.logiciel);
    refuserDoublon(lot, configs, propre, avant ? idConfig(avant, lot.id) : null);
    return [...configs.filter((c) => c !== avant), { ...propre, ...(avant?.id ? { id: avant.id } : {}), ...jointsDe(avant) }];
  });
}

// Nouvelle config d'un lot avec son identifiant : plusieurs pour NovaLCT, une seule pour les autres logiciels.
let compteurConfigs = 0;
export function ajouterConfigLot(base, parcId, dalleId, lotId, config) {
  const { id: _id, ...sansId } = config;
  const propre = nettoyerConfig(sansId);
  return avecConfigs(base, parcId, dalleId, lotId, (configs, lot) => {
    if (propre.logiciel !== 'NovaLCT' && configs.some((c) => c.logiciel === propre.logiciel)) {
      throw new ErreurSaisie(`Le lot ${lot.identifiant} a déjà une config ${propre.logiciel}.`);
    }
    refuserDoublon(lot, configs, propre, null);
    compteurConfigs += 1;
    return [...configs, { ...propre, id: `cfg-${Date.now().toString(36)}-${compteurConfigs.toString(36)}` }];
  });
}

// `cible` : identifiant de la config, ou son logiciel quand le lot n'en a qu'une de ce logiciel.
export function configLot(base, parcId, dalleId, lotId, cible) {
  const lot = lotDe(base, parcId, dalleId, lotId);
  return lot ? trouverConfig(lot, lot.configs ?? [], cible) : null;
}

export function supprimerConfigLot(base, parcId, dalleId, lotId, cible) {
  return avecConfigs(base, parcId, dalleId, lotId, (configs, lot) => {
    const config = trouverConfig(lot, configs, cible);
    return configs.filter((c) => c !== config);
  });
}

// Fréquence et luminosité maxi lues dans le nom d'un fichier NovaLCT (étape 20, spec § 3.2) : morceaux séparés par les
// espaces, « _ », « - » et les parenthèses ; « 50HZ » ou « 50 Hz » de 1 à 1000 Hz (« 3840Hz », le rafraîchissement
// des LED, ignoré) ; un nombre seul de 100 à 10 000, « nits » ou « cd » permis ; une seule valeur de chaque, sinon rien.
const morceauxDuNom = (nom) => String(nom ?? '').replace(/\.[^.\s]+$/, '').split(/[\s_\-()]+/).filter(Boolean);
function lireNomFichier(nom) {
  const morceaux = morceauxDuNom(nom);
  const frequences = [];
  const luminosites = [];
  const pris = new Set();
  let mentionHz = false;
  morceaux.forEach((m, i) => {
    const colle = /^(\d+(?:[.,]\d+)?)hz$/i.exec(m);
    const seul = /^\d+(?:[.,]\d+)?$/.test(m) && /^hz$/i.test(morceaux[i + 1] ?? '');
    if (!colle && !seul) return;
    mentionHz = true;
    pris.add(i);
    const f = Number((colle ? colle[1] : m).replace(',', '.'));
    if (frequenceValable(f)) frequences.push(f);
  });
  morceaux.forEach((m, i) => {
    const l = pris.has(i) ? null : /^(\d+)(?:nits|cd)?$/i.exec(m);
    if (l && luminositeValable(Number(l[1]))) luminosites.push(Number(l[1]));
  });
  return { frequenceHz: frequences.length === 1 ? frequences[0] : null, luminositeMax: luminosites.length === 1 ? luminosites[0] : null, mentionHz };
}

// Proposition pour un nom de fichier ; `autres` : les autres configs NovaLCT du lot { id, nomFichier, frequenceHz }.
// Convention du stock (collègue de l'utilisateur) : « 50HZ » dans le nom, 50 Hz ; sans mention, 60 Hz. Les 60 Hz ne
// sont proposés que si une config du lot est à 50 Hz (`soixante` : les autres configs à qui les proposer).
export function proposerDepuisNom(nom, autres = []) {
  const lu = lireNomFichier(nom);
  const cinquante = (c) => frequenceValable(c.frequenceHz) && memeFrequence(c.frequenceHz, 50);
  const frequenceHz = lu.frequenceHz ?? (!lu.mentionHz && autres.some(cinquante) ? 60 : null);
  const soixante = lu.frequenceHz !== null && memeFrequence(lu.frequenceHz, 50)
    ? autres.filter((c) => c.nomFichier && !frequenceValable(c.frequenceHz) && !lireNomFichier(c.nomFichier).mentionHz).map((c) => c.id)
    : [];
  return { frequenceHz, luminositeMax: lu.luminositeMax, soixante };
}

// « Fréquence 50 Hz et luminosité maxi 800 cd/m² » ; `deux` pour l'accord.
function texteLu({ frequenceHz, luminositeMax }) {
  const morceaux = [
    frequenceHz !== undefined && `Fréquence ${nombreCourt(frequenceHz)} Hz`,
    luminositeMax !== undefined && `${frequenceHz !== undefined ? 'l' : 'L'}uminosité maxi ${nombre(luminositeMax)} cd/m²`,
  ].filter(Boolean);
  return { texte: morceaux.join(' et '), deux: morceaux.length > 1 };
}

// Nom du fichier de config enregistré (fichier joint ou nom tapé) : pour NovaLCT, quand le nom change, les critères
// vides prennent la proposition du nom, marquée « lue dans le nom du fichier » ; jamais de doublon (proposition non
// appliquée, avec la raison). Rend la base et les messages à montrer.
export function nommerFichierConfig(base, parcId, dalleId, lotId, cible, nom) {
  const lot = lotDe(base, parcId, dalleId, lotId);
  const config = lot ? trouverConfig(lot, lot.configs ?? [], cible) : null;
  if (!config) throw new ErreurSaisie('Config introuvable dans ce lot.');
  const id = idConfig(config, lotId);
  const nomFichier = String(nom ?? '').trim();
  const messages = [];
  if (config.logiciel !== 'NovaLCT' || nomFichier === (config.nomFichier ?? '')) {
    return { base: reglerConfigLot(base, parcId, dalleId, lotId, { ...config, id, nomFichier }), messages };
  }
  const autres = (lot.configs ?? []).filter((c) => c.logiciel === 'NovaLCT' && c !== config)
    .map((c) => ({ id: idConfig(c, lotId), nomFichier: c.nomFichier, frequenceHz: criteresConfig(c).frequenceHz }));
  const proposition = proposerDepuisNom(nomFichier, autres);
  const actuels = criteresConfig(config);
  const ajout = {
    ...(actuels.frequenceHz === null && proposition.frequenceHz !== null ? { frequenceHz: proposition.frequenceHz } : {}),
    ...(actuels.luminositeMax === null && proposition.luminositeMax !== null ? { luminositeMax: proposition.luminositeMax } : {}),
  };
  const marque = { ...(config.critereDuNom ?? {}), ...('frequenceHz' in ajout ? { frequence: true } : {}), ...('luminositeMax' in ajout ? { luminosite: true } : {}) };
  let nouvelle;
  if (Object.keys(ajout).length === 0) nouvelle = reglerConfigLot(base, parcId, dalleId, lotId, { ...config, id, nomFichier });
  else {
    const { texte, deux } = texteLu(ajout);
    try {
      nouvelle = reglerConfigLot(base, parcId, dalleId, lotId, { ...config, id, nomFichier, ...ajout, critereDuNom: marque });
      messages.push(`${texte} ${deux ? 'lues' : 'lue'} dans le nom du fichier : vérifie-${deux ? 'les' : 'la'}.`);
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      // Proposition en doublon (ou nom refusé : l'erreur revient au second essai) : le nom seul est gardé.
      nouvelle = reglerConfigLot(base, parcId, dalleId, lotId, { ...config, id, nomFichier });
      messages.push(`${texte} ${deux ? 'lues' : 'lue'} dans le nom du fichier, non appliquée${deux ? 's' : ''} : le lot ${lot.identifiant} `
        + `a déjà un fichier NovaLCT ${texteCriteres({ ...actuels, ...ajout })}.`);
    }
  }
  for (const autreId of proposition.soixante) {
    const autre = configLot(nouvelle, parcId, dalleId, lotId, autreId);
    try {
      nouvelle = reglerConfigLot(nouvelle, parcId, dalleId, lotId, { ...autre, id: autreId, frequenceHz: 60, critereDuNom: { ...(autre.critereDuNom ?? {}), frequence: true } });
      messages.push(`Fréquence 60 Hz proposée pour ${autre.nomFichier} (sans « Hz » dans son nom) : vérifie-la.`);
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      messages.push(`Fréquence 60 Hz non proposée pour ${autre.nomFichier} : le lot ${lot.identifiant} a déjà un fichier NovaLCT `
        + `${texteCriteres({ frequenceHz: 60, luminositeMax: criteresConfig(autre).luminositeMax })}.`);
    }
  }
  return { base: nouvelle, messages };
}

// Écran Base (étape 20b) : titre, badge et bouton « Retirer » d'une config, critères NovaLCT sans la marque du nom.
export const NOMS_LOGICIEL = { NovaLCT: 'NovaLCT (Novastar)', VMP: 'VMP (COEX)', LEDVISION: 'LEDVISION (Colorlight)', Tessera: 'Tessera (Brompton)' };
export function titreConfig(config) {
  const { frequenceHz: f, luminositeMax: l } = criteresConfig(config);
  const criteres = [f !== null && `${nombreCourt(f)} Hz`, l !== null && `${nombre(l)} cd/m²`].filter(Boolean).join(', ');
  const court = `${config.logiciel}${criteres ? ` ${criteres}` : ''}`;
  return { titre: `${NOMS_LOGICIEL[config.logiciel]}${criteres ? `, ${criteres}` : ''}`, badge: court, retirer: `Retirer la config ${court}` };
}

// Phrase de la Base tant que la marque « lue dans le nom du fichier » reste : « Fréquence 50 Hz et luminosité maxi
// 800 cd/m² lues dans le nom du fichier : vérifie-les. » ; null sans marque.
export function texteCritereDuNom(config) {
  const { frequenceHz, luminositeMax } = criteresConfig(config);
  const marque = config?.critereDuNom ?? {};
  const lu = {
    ...(marque.frequence && frequenceHz !== null ? { frequenceHz } : {}),
    ...(marque.luminosite && luminositeMax !== null ? { luminositeMax } : {}),
  };
  if (Object.keys(lu).length === 0) return null;
  const { texte, deux } = texteLu(lu);
  return `${texte} ${deux ? 'lues' : 'lue'} dans le nom du fichier : vérifie-${deux ? 'les' : 'la'}.`;
}

// « Ajouter une config » d'un lot : VMP, LEDVISION et Tessera une seule fois, NovaLCT toujours ; petit formulaire
// (fichier, fréquence, luminosité) quand le lot a déjà une config NovaLCT, avec une aide si la seule en place n'a aucun
// critère (la nouvelle doit en différer).
export function ajoutConfig(lot) {
  const configs = lot.configs ?? [];
  const nova = configs.filter((c) => c.logiciel === 'NovaLCT');
  const seule = nova.length === 1 ? nova[0] : null;
  const sansCritere = seule && Object.values(criteresConfig(seule)).every((x) => x === null);
  return {
    logiciels: LOGICIELS.filter((l) => l === 'NovaLCT' || !configs.some((c) => c.logiciel === l)),
    petitFormulaire: nova.length > 0,
    aide: sansCritere ? `La config NovaLCT déjà en place${seule.nomFichier ? ` (${seule.nomFichier})` : ''} n'a ni fréquence ni luminosité maxi : `
      + 'saisis-les dans son formulaire, la nouvelle doit en différer d\'au moins un critère.' : null,
  };
}

// Proposition d'après le nom pour une config d'un lot (`sauf` : la config elle-même), comme nommerFichierConfig.
export function proposerPourLot(lot, nom, sauf = null) {
  const autres = (lot.configs ?? []).filter((c) => c.logiciel === 'NovaLCT' && idConfig(c, lot.id) !== sauf)
    .map((c) => ({ id: idConfig(c, lot.id), nomFichier: c.nomFichier, frequenceHz: criteresConfig(c).frequenceHz }));
  return proposerDepuisNom(nom, autres);
}

// Formulaire d'une config (choix c du lot 20b) : les champs sont enregistrés avec l'ancien nom du fichier (la marque
// « d'après le nom » disparaît), puis le nouveau nom propose ses valeurs pour les critères restés vides.
export function enregistrerConfigFormulaire(base, parcId, dalleId, lotId, cible, champs) {
  const config = configLot(base, parcId, dalleId, lotId, cible);
  if (!config) throw new ErreurSaisie('Config introuvable dans ce lot.');
  const id = idConfig(config, lotId);
  const { nomFichier, ...autres } = champs;
  const avecAncienNom = reglerConfigLot(base, parcId, dalleId, lotId, { ...autres, logiciel: config.logiciel, id, nomFichier: config.nomFichier ?? '' });
  if (nomFichier === undefined) return { base: avecAncienNom, messages: [] };
  return nommerFichierConfig(avecAncienNom, parcId, dalleId, lotId, id, nomFichier);
}

// Nouvelle config NovaLCT par le petit formulaire (choix a du lot 20b) : créée avec les critères saisis (pré-remplis
// d'après le nom, vus par l'utilisateur : sans marque), puis nommée (60 Hz proposés aux autres fichiers du lot,
// critères restés vides lus dans le nom). Rend la base, l'identifiant de la config et les messages.
export function ajouterConfigNovaLCT(base, parcId, dalleId, lotId, { nomFichier = '', frequenceHz = '', luminositeMax = '' } = {}) {
  const avec = ajouterConfigLot(base, parcId, dalleId, lotId, { logiciel: 'NovaLCT', frequenceHz, luminositeMax });
  const { id } = lotDe(avec, parcId, dalleId, lotId).configs.at(-1);
  if (!String(nomFichier).trim()) return { base: avec, id, messages: [] };
  return { id, ...nommerFichierConfig(avec, parcId, dalleId, lotId, id, nomFichier) };
}

// Liste « Luminosité maxi » de Data (étape 20b) : `resultats`, configsDuMur de chaque fiche du mur (null permis) ;
// `valeur`, la valeur gardée ('' à choisir, '800', 'aucune'). Visible seulement si un lot retenu a plusieurs
// luminosités à la fréquence de Data ; cachée ou plus proposée, la valeur gardée vaut « À choisir ».
export function choixLuminosite(resultats, valeur) {
  const valables = (resultats ?? []).filter(Boolean);
  if (!valables.some((r) => r.plusieursLuminosites)) return { visible: false, options: [], valeur: '', luminosite: null };
  const luminosites = [...new Set(valables.flatMap((r) => r.luminosites ?? []))].sort(triLuminosites);
  const options = [{ valeur: '', texte: 'À choisir' },
    ...luminosites.map((l) => (l === null ? { valeur: 'aucune', texte: 'Sans luminosité notée' } : { valeur: String(l), texte: `${nombre(l)} cd/m²` }))];
  const retenue = options.some((o) => o.valeur === valeur && valeur !== '') ? valeur : '';
  return { visible: true, options, valeur: retenue, luminosite: retenue === '' ? null : retenue === 'aucune' ? 'aucune' : Number(retenue) };
}

// Extension d'un fichier choisi sur l'appareil (le sélecteur laisse tout choisir) : fichier de config selon le logiciel,
// fixture pack en .tfp ; multi-batch et autre fichier, n'importe quelle extension.
export function verifierFichierJoint(logiciel, role, nom) {
  if (role === 'fichier') {
    const extensions = EXTENSIONS_CONFIG[logiciel];
    if (!extensions) throw new ErreurSaisie('Brompton : joins le fixture pack (.tfp) ou un autre fichier.');
    if (!finitPar(nom, extensions)) throw new ErreurSaisie(`Fichier de config ${logiciel} : un fichier ${extensions.join(' ou ')}.`);
  }
  if (role === 'fixturePack' && !finitPar(nom, ['.tfp'])) throw new ErreurSaisie('Fixture pack Brompton : un fichier .tfp.');
  if (!ROLES_FICHIER[role]) throw new ErreurSaisie('Fichier joint : fichier de config, multi-batch adjustment, fixture pack ou autre fichier.');
  return true;
}

// Fichier joint à une config (`cible` : son identifiant, ou son logiciel) : seulement son nom, sa taille et sa date ;
// le contenu reste sur l'appareil. Sans config de ce logiciel dans le lot, elle est créée.
export function joindreFichier(base, parcId, dalleId, lotId, cible, role, { id, nom, taille, date }) {
  const cle = ROLES_FICHIER[role];
  if (!cle) throw new ErreurSaisie('Fichier joint : fichier de config, multi-batch adjustment, fixture pack ou autre fichier.');
  return avecConfigs(base, parcId, dalleId, lotId, (configs, lot) => {
    const avant = trouverConfig(lot, configs, cible);
    if (avant) return configs.map((c) => (c === avant ? { ...c, [cle]: { id, nom, taille, date } } : c));
    if (!LOGICIELS.includes(cible)) throw new ErreurSaisie('Config introuvable dans ce lot.');
    return [...configs, { logiciel: cible, [cle]: { id, nom, taille, date } }];
  });
}

export function detacherFichier(base, parcId, dalleId, lotId, cible, role) {
  const cle = ROLES_FICHIER[role];
  return avecConfigs(base, parcId, dalleId, lotId, (configs, lot) => {
    const config = trouverConfig(lot, configs, cible);
    return configs.map((c) => {
      if (c !== config) return c;
      const copie = { ...c };
      delete copie[cle];
      return copie;
    });
  });
}

// Tous les fichiers joints décrits dans la base, avec leur place (parc, dalle, lot, config, logiciel, rôle).
export function fichiersJoints(base) {
  const liste = [];
  for (const parc of base.parcs ?? []) {
    for (const [dalleId, lots] of Object.entries(parc.lots ?? {})) {
      for (const lot of lots) {
        for (const config of lot.configs ?? []) {
          for (const [role, cle] of Object.entries(ROLES_FICHIER)) {
            if (config[cle]) liste.push({ ...config[cle], parcId: parc.id, dalleId, lotId: lot.id, configId: idConfig(config, lot.id), logiciel: config.logiciel, role });
          }
        }
      }
    }
  }
  return liste;
}

export function tailleFichiersJoints(base) {
  return fichiersJoints(base).reduce((s, f) => s + (f.taille ?? 0), 0);
}

export function alerteTailleFichier(taille) {
  return taille > TAILLE_ALERTE_FICHIER
    ? `Fichier de ${(taille / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo, au-delà de 20 Mo : il occupe beaucoup de place sur l'appareil.`
    : null;
}

// Ancien champ « fichier de config » d'un parc : repris en premier lot « sans identifiant », une seule fois ;
// le réglage du parc reste tel quel.
export function migrerFichiersConfig(base) {
  return {
    ...base,
    parcs: base.parcs.map((parc) => {
      let copie = parc;
      for (const [dalleId, reglage] of Object.entries(parc.reglages ?? {})) {
        if (!reglage.fichierConfig || (copie.lots?.[dalleId] ?? []).length > 0) continue;
        copie = lotsAvec(copie, dalleId, [{
          id: 'lot-sans-identifiant', identifiant: 'sans identifiant', quantite: null,
          notes: 'Repris du fichier de config réglé pour ce parc.', configs: [{ logiciel: null, nomFichier: reglage.fichierConfig }],
        }]);
      }
      return copie;
    }),
  };
}

// Logiciel qui règle un processeur : Tessera (Brompton), VMP (COEX), NovaLCT (Novastar), LEDVISION (Colorlight),
// HELIOS (Megapixel, interface web). Linsn, Kystar, Mooncell : logiciel de réglage de la fiche (`logicielReglage` :
// LEDSet, Kystar Control System, AutoLEDSetup ; pages de téléchargement citées, non relues [TIERS]).
// Configs HELIOS, Linsn, Kystar et Mooncell : pas encore gérées par l'appli.
export function logicielDuProcesseur(proc) {
  if (proc.famille === 'brompton') return 'Tessera';
  if (proc.famille === 'colorlight') return 'LEDVISION';
  if (proc.famille === 'megapixel') return 'HELIOS';
  const reglage = typeof proc.logicielReglage === 'object' ? proc.logicielReglage?.valeur : proc.logicielReglage;
  if (reglage) return reglage;
  if (['linsn', 'kystar', 'mooncell'].includes(proc.famille)) return `logiciel ${MARQUES_FAMILLE[proc.famille]}`;
  return proc.logiciel === 'VMP' ? 'VMP' : 'NovaLCT';
}

// Version du logiciel ou du firmware d'un processeur du parc, et date du relevé ; version vide : relevé retiré.
export function reglerLogicielParc(base, parcId, proc, { version = '', dateReleve = '' } = {}) {
  return modifierParc(base, parcId, (p) => {
    const logiciels = { ...(p.logiciels ?? {}) };
    const v = String(version).trim();
    if (v) logiciels[proc.id] = { logiciel: logicielDuProcesseur(proc), version: v, dateReleve: String(dateReleve).trim() || null };
    else delete logiciels[proc.id];
    const copie = { ...p, logiciels };
    if (Object.keys(logiciels).length === 0) delete copie.logiciels;
    return copie;
  });
}

// Nombre d'un processeur dans le parc (étape 15c) : entier de 1 à 99, facultatif ; vide : retiré (pas de contrôle).
export const QUANTITE_PROCESSEUR_MAX = 99;
const quantiteValable = (n) => Number.isInteger(n) && n >= 1 && n <= QUANTITE_PROCESSEUR_MAX;
export function reglerQuantiteParc(base, parcId, processeurId, valeur) {
  const brut = valeur === null || valeur === undefined ? '' : String(valeur).trim();
  const n = brut === '' ? null : Number(brut);
  if (n !== null && !quantiteValable(n)) throw new ErreurSaisie(`Nombre dans le parc : un nombre entier de 1 à ${QUANTITE_PROCESSEUR_MAX}, ou vide.`);
  return modifierParc(base, parcId, (p) => {
    const quantites = { ...(p.quantites ?? {}) };
    if (n === null) delete quantites[processeurId];
    else quantites[processeurId] = n;
    const copie = { ...p, quantites };
    if (Object.keys(quantites).length === 0) delete copie.quantites;
    return copie;
  });
}

// Nombres des processeurs du parc ({ identifiant: nombre }), valeurs illisibles d'un fichier ignorées ; {} en « Tous ».
export function quantitesParc(base, parcId) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  return Object.fromEntries(Object.entries(parc?.quantites ?? {}).filter(([, n]) => quantiteValable(n)));
}

// Code admin NovaLCT du parc (étape 18a) : le mot de passe de User > Advanced Synchronous System User Login quand le
// prestataire a changé le défaut « admin ». Texte de 1 à 40 caractères, facultatif ; vide : retiré. Gardé sur l'appareil
// seulement : jamais dans un PDF, un texte copié ni l'export d'une presta.
export const CODE_NOVALCT_MAX = 40;
const codeValable = (x) => typeof x === 'string' && x.trim().length >= 1 && x.trim().length <= CODE_NOVALCT_MAX;
export function reglerCodeNovaLCT(base, parcId, valeur) {
  const brut = valeur === null || valeur === undefined ? '' : String(valeur).trim();
  if (brut.length > CODE_NOVALCT_MAX) throw new ErreurSaisie(`Code admin NovaLCT : ${CODE_NOVALCT_MAX} caractères au plus, ou vide.`);
  return modifierParc(base, parcId, (p) => {
    const copie = { ...p, codeNovaLCT: brut };
    if (!brut) delete copie.codeNovaLCT;
    return copie;
  });
}

// Code du parc, ou null (« Tous », pas de code, valeur illisible d'un fichier).
export function codeNovaLCT(base, parcId) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  return codeValable(parc?.codeNovaLCT) ? parc.codeNovaLCT.trim() : null;
}

export function logicielParc(base, parcId, processeurId) {
  if (!parcId) return null;
  return base.parcs.find((p) => p.id === parcId)?.logiciels?.[processeurId] ?? null;
}

// Version relevée du logiciel d'un processeur dans le parc actif ; null en « Tous ».
export function texteLogicielParc(base, parcId, proc) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  if (!parc) return null;
  const releve = logicielParc(base, parcId, proc.id);
  if (!releve) return `Version de ${logicielDuProcesseur(proc)} non relevée pour ce processeur dans le parc ${parc.nom}.`;
  return `${releve.logiciel} ${releve.version} dans le parc ${parc.nom}${releve.dateReleve ? `, relevé le ${dateCourte(releve.dateReleve)}` : ''}.`;
}

// ---------------------------------------------------------------------------
// Lots et configs du mur (onglets Mur et Data)
// ---------------------------------------------------------------------------

const aQuantite = (lot) => Number.isInteger(lot.quantite);

// Plus petit ensemble de lots dont les quantités couvrent `n` dalles : le moins de lots, puis le moins de dalles
// en trop, puis l'ordre de la liste.
function plusPetitEnsemble(lots, n) {
  let meilleur = null;
  const limite = Math.min(lots.length, 16);
  for (let masque = 1; masque < 2 ** limite; masque += 1) {
    const indices = [];
    let total = 0;
    for (let i = 0; i < limite; i += 1) {
      if (masque & (2 ** i)) {
        indices.push(i);
        total += lots[i].quantite;
      }
    }
    if (total < n) continue;
    const mieux = !meilleur || indices.length < meilleur.indices.length
      || (indices.length === meilleur.indices.length && (total < meilleur.total
        || (total === meilleur.total && indices.join() < meilleur.indices.join())));
    if (mieux) meilleur = { indices, total };
  }
  return meilleur ? meilleur.indices.map((i) => lots[i]) : lots;
}

// Lots cochés par défaut pour un mur de `n` dalles : un seul lot, coché d'office ; sinon le premier lot de la liste
// dont la quantité suffit, puis le moins de lots possible. Lots trop petits : tous ceux qui ont une quantité, et le
// seul lot sans quantité s'il n'y en a qu'un. Plusieurs lots sans quantité : null (« à préciser »).
function choisirLots(lots, n) {
  if (lots.length === 1) return [...lots];
  const avec = lots.filter(aQuantite);
  const sans = lots.filter((l) => !aQuantite(l));
  const seul = avec.find((l) => l.quantite >= n);
  if (seul) return [seul];
  if (avec.reduce((t, l) => t + l.quantite, 0) >= n) {
    const choisis = new Set(plusPetitEnsemble(avec, n));
    return lots.filter((l) => choisis.has(l));
  }
  if (sans.length === 0) return [...avec];
  if (sans.length === 1) return [...lots];
  return null;
}

// Alerte « lots mélangés » : la conduite à tenir selon le logiciel (Mur : les deux).
export function texteLotsMelanges(identifiants, logiciel = null) {
  const debut = `Lots mélangés (${identifiants.join(', ')}), écarts de couleur possibles`;
  if (logiciel === 'NovaLCT') return `${debut} : multi-batch adjustment (NovaLCT).`;
  if (logiciel === 'Tessera') return `${debut} : même mémoire de calibration sur toutes les dalles (Brompton).`;
  if (logiciel === null) return `${debut} : multi-batch adjustment (NovaLCT) ou même mémoire de calibration (Brompton).`;
  return `${debut}.`;
}

// Lots retenus pour le mur : cochés à la main (`coches`, identifiants), sinon par défaut ; avec leurs alertes.
export function lotsDuMur(lots, n, coches = null, { logiciel = null } = {}) {
  const alertes = [];
  // Cases cochées d'un lot supprimé depuis : retour au choix par défaut.
  const main = Array.isArray(coches) && (coches.length === 0 || lots.some((l) => coches.includes(l.id)));
  let retenus = [];
  let aPreciser = false;
  if (lots.length === 0) return { retenus, parDefaut: !main, aPreciser, melanges: false, alertes };
  if (main) {
    retenus = lots.filter((l) => coches.includes(l.id));
    if (retenus.length === 0) alertes.push('Aucun lot coché : coche ceux de ce mur dans l\'onglet Mur.');
  } else {
    const choix = choisirLots(lots, n);
    if (choix === null) {
      aPreciser = true;
      alertes.push('Lots utilisés : à préciser (plusieurs lots sans quantité) : coche ceux de ce mur dans l\'onglet Mur.');
    } else retenus = choix;
  }
  const melanges = retenus.length > 1;
  if (melanges) alertes.push(texteLotsMelanges(retenus.map((l) => l.identifiant), logiciel));
  if (retenus.length > 0 && retenus.every(aQuantite)) {
    const total = retenus.reduce((t, l) => t + l.quantite, 0);
    if (total < n) alertes.push(`Lots trop petits : ${nombre(total)} dalles dans les lots pour ${nombre(n)} dans le mur.`);
  }
  return { retenus, parDefaut: !main, aPreciser, melanges, alertes };
}

// Une config d'un lot en une ligne : « Config NovaLCT : BP2V2_A.rcfgx, lot 2024-03 A ».
function ligneConfig(config, lot) {
  const morceaux = config.logiciel === 'Tessera'
    ? [config.typeFixture && `fixture ${config.typeFixture}`, config.firmwareDalle && `firmware de la dalle ${config.firmwareDalle}`,
      config.fixturePack && `fixture pack ${config.fixturePack}`, config.calibration && `calibration ${config.calibration}`]
    : [fichierEtCriteres(config), config.multiBatch && `multi-batch ${config.multiBatch}`];
  morceaux.push(config.version && `version ${config.version}`, config.firmware === 'personnalisé' && 'firmware personnalisé');
  const texte = morceaux.filter(Boolean).join(', ') || 'non précisée';
  return `Config ${config.logiciel ?? '(logiciel à préciser)'} : ${texte}, lot ${lot.identifiant}`;
}

// « 50HZ 800.rcfgx (50 Hz, 800 cd/m²) » ; sans critère, le nom seul.
function fichierEtCriteres(config) {
  const criteres = texteCriteresConfig(config);
  return `${config.nomFichier ?? 'fichier non précisé'}${criteres ? ` (${criteres})` : ''}`;
}

const nomsLots = (noms) => `${noms.length > 1 ? 'lots' : 'lot'} ${noms.join(', ')}`;

// Luminosités dans l'ordre croissant, « sans luminosité notée » (null) en dernier.
const triLuminosites = (a, b) => (a === null ? 1 : b === null ? -1 : a - b);
// « 800 ou 1200 cd/m² », « 800 cd/m² ou sans luminosité notée ».
function listeLuminosites(luminosites, mot) {
  const nombres = luminosites.filter((l) => l !== null).map((l) => nombre(l));
  const debut = nombres.length ? `${nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} ${mot} ` : ''}${nombres.at(-1)} cd/m²` : '';
  if (!luminosites.includes(null)) return debut;
  return debut ? `${debut} ${mot} sans luminosité notée` : 'sans luminosité notée';
}

// Fichier NovaLCT retenu pour un lot du mur (étape 20, spec § 4) : la fréquence de Data (à 0,01 Hz), sinon la plus
// proche à 1 Hz au plus (à égalité, la plus basse), puis les configs sans fréquence ; parmi elles, la luminosité choisie
// dans Data quand elles en ont plusieurs (`luminosite` : un nombre, 'aucune' pour « sans luminosité notée », null pour
// « à choisir »), sinon celle sans luminosité notée ; la fréquence exacte d'abord, puis l'ordre de la liste.
export function choisirConfigNovaLCT(lot, { frequenceHz, luminosite = null } = {}) {
  const nova = (lot.configs ?? []).filter((c) => c.logiciel === 'NovaLCT');
  const resultat = { retenue: null, autres: nova, alertes: [], aChoisir: false, luminosites: [], manque: null };
  if (nova.length === 0) return resultat;
  const id = lot.identifiant;
  const avec = nova.map((config) => ({ config, ...criteresConfig(config) }));
  const sansFrequence = avec.filter((x) => x.frequenceHz === null);
  const notees = avec.filter((x) => x.frequenceHz !== null);
  const exactes = notees.filter((x) => memeFrequence(x.frequenceHz, frequenceHz));
  const freq = `${nombreCourt(frequenceHz)} Hz`;
  let candidates = [...exactes, ...sansFrequence];
  let proche = null;
  if (exactes.length === 0 && notees.length) {
    const ecarts = [...new Set(notees.map((x) => x.frequenceHz))].filter((f) => Math.abs(f - frequenceHz) <= 1 + 1e-9)
      .sort((a, b) => Math.abs(a - frequenceHz) - Math.abs(b - frequenceHz) || a - b);
    proche = ecarts[0] ?? null;
    candidates = [...notees.filter((x) => proche !== null && memeFrequence(x.frequenceHz, proche)), ...sansFrequence];
    if (candidates.length === 0) {
      const fichiers = avec.map((x) => `${x.config.nomFichier ?? 'fichier non précisé'} à ${nombreCourt(x.frequenceHz)} Hz`).join(', ');
      return { ...resultat, alertes: [`Aucun fichier NovaLCT à ${freq} pour le lot ${id} (fichiers : ${fichiers}).`], manque: `aucun fichier à ${freq}` };
    }
  }
  const luminosites = [...new Set(candidates.map((x) => x.luminositeMax))].sort(triLuminosites);
  const alertes = [];
  let choisies = candidates;
  let aChoisir = false;
  let manque = null;
  if (luminosites.length > 1) {
    if (luminosite === null || luminosite === undefined || luminosite === '') {
      aChoisir = true;
      choisies = [];
      manque = 'à choisir (luminosité maxi dans Data)';
      alertes.push(`Lot ${id} : choisis la luminosité maxi dans Data (${listeLuminosites(luminosites, 'ou')}).`);
    } else {
      const voulue = luminosite === 'aucune' ? null : luminosite;
      choisies = candidates.filter((x) => x.luminositeMax === voulue);
      if (choisies.length === 0 && voulue !== null) {
        choisies = candidates.filter((x) => x.luminositeMax === null);
        if (choisies.length) alertes.push(`Lot ${id} : aucun fichier à ${nombre(voulue)} cd/m², pris celui sans luminosité notée.`);
      }
      if (choisies.length === 0) {
        const quoi = voulue === null ? 'sans luminosité notée' : `à ${nombre(voulue)} cd/m²`;
        manque = `aucun fichier ${quoi}`;
        alertes.push(`Aucun fichier NovaLCT ${quoi} pour le lot ${id} (fichiers à ${listeLuminosites(luminosites, 'et')}).`);
      }
    }
  } else if (typeof luminosite === 'number' && luminosites[0] !== null && luminosites[0] !== luminosite) {
    alertes.push(`Lot ${id} : seul fichier à ${nombre(luminosites[0])} cd/m² (choix de Data : ${nombre(luminosite)} cd/m²).`);
  }
  const prise = choisies[0] ?? null;
  if (exactes.length === 0 && notees.length) {
    const quoi = prise ? (prise.frequenceHz !== null ? `pris celui à ${nombreCourt(prise.frequenceHz)} Hz` : 'pris celui sans fréquence notée')
      : `fichiers ${proche !== null ? `à ${nombreCourt(proche)} Hz` : 'sans fréquence notée'} proposés`;
    alertes.unshift(`Aucun fichier NovaLCT à ${freq} pour le lot ${id} : ${quoi}. Vérifie l'image.`);
  }
  const retenue = prise?.config ?? null;
  return { retenue, autres: nova.filter((c) => c !== retenue), alertes, aChoisir, luminosites, manque };
}

// Lots et configs d'une dalle du mur dans le parc actif, pour le logiciel du processeur (Data) ou tous (Mur, null).
// NovaLCT avec la fréquence de Data (étape 20) : le fichier retenu de chaque lot (`parLot`), les autres fichiers et les
// luminosités proposées dans Data ; sans fréquence, toutes les configs, comme avant.
export function configsDuMur(base, parcId, dalleId, n, { coches = null, logiciel = null, frequenceHz = null, luminosite = null } = {}) {
  const vide = { lots: [], retenus: [], parDefaut: true, melanges: false, firmwarePersonnalise: false, lignes: [], alertes: [], note: null };
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  if (!parc) return { ...vide, note: 'Choisis un parc pour voir ses lots et ses configs.' };
  const lots = lotsDalleParc(base, parcId, dalleId);
  if (lots.length === 0) {
    return { ...vide, alertes: [`Aucun fichier de config pour cette dalle dans le parc ${parc.nom} : ajoute-le dans l'onglet Base.`] };
  }
  const choix = lotsDuMur(lots, n, coches, { logiciel });
  const lignes = choix.retenus.length ? [`Lots utilisés : ${choix.retenus.map((l) => l.identifiant).join(', ')}`] : [];
  const alertes = [...choix.alertes];
  const sansConfig = [];
  const sansFichier = [];
  let firmwarePersonnalise = false;
  const parFrequence = logiciel === 'NovaLCT' && typeof frequenceHz === 'number';
  const parLot = [];
  const alertesChoix = [];
  for (const lot of choix.retenus) {
    const configs = (lot.configs ?? []).filter((c) => logiciel === null || c.logiciel === logiciel);
    if (configs.length === 0) sansConfig.push(lot.identifiant);
    if (parFrequence) {
      const r = choisirConfigNovaLCT(lot, { frequenceHz, luminosite });
      parLot.push({ lot, ...r });
      if (configs.length === 0) continue;
      if (r.retenue) {
        lignes.push(ligneConfig(r.retenue, lot));
        if (!r.retenue.nomFichier) sansFichier.push(lot.identifiant);
      }
      if (r.autres.length) lignes.push(`${r.retenue ? 'Autres fichiers' : 'Fichiers'} NovaLCT du lot ${lot.identifiant} : ${r.autres.map(fichierEtCriteres).join(', ')}`);
      if (configs.some((c) => c.firmware === 'personnalisé')) firmwarePersonnalise = true;
      alertesChoix.push(...r.alertes);
      continue;
    }
    for (const c of configs) {
      lignes.push(ligneConfig(c, lot));
      if (c.firmware === 'personnalisé') firmwarePersonnalise = true;
      if (logiciel && logiciel !== 'Tessera' && !c.nomFichier) sansFichier.push(lot.identifiant);
    }
  }
  if (sansConfig.length) {
    alertes.push(logiciel
      ? `Aucune config ${logiciel} pour cette dalle (${nomsLots(sansConfig)}).`
      : `Aucun fichier de config pour cette dalle (${nomsLots(sansConfig)}).`);
  }
  if (sansFichier.length) alertes.push(`Aucun fichier de config ${logiciel} pour cette dalle (${nomsLots(sansFichier)}).`);
  alertes.push(...alertesChoix);
  const choixNovaLCT = parFrequence ? {
    parLot,
    luminosites: [...new Set(parLot.flatMap((p) => p.luminosites))].sort(triLuminosites),
    plusieursLuminosites: parLot.some((p) => p.luminosites.length > 1),
  } : {};
  return { ...vide, lots, retenus: choix.retenus, parDefaut: choix.parDefaut, melanges: choix.melanges, firmwarePersonnalise, lignes, alertes, ...choixNovaLCT };
}

// ---------------------------------------------------------------------------
// Check-list « Avant de partir » (bas de l'onglet Data, reprise dans « Tout copier »)
// ---------------------------------------------------------------------------

// Chaque ligne : fait = true (prêt), false (à faire), null (à vérifier sur place). `presents` : identifiants des
// fichiers joints présents sur l'appareil (null : inconnu). Null en « Tous ». NovaLCT avec la fréquence et la luminosité
// de Data (étape 20) : le fichier retenu de chaque lot, puis les autres « à prendre aussi ».
export function avantDePartir(base, parcId, groupes, proc, { presents = null, frequenceHz = null, luminosite = null } = {}) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  if (!parc) return null;
  const logiciel = logicielDuProcesseur(proc);
  const lignes = [];
  const ajouter = (texte, fait) => lignes.push({ texte, fait });
  // Fichier joint : sur l'appareil ou absent ; nom seulement : à prendre avec soi. `precision` : « lot A, retenu… ».
  const fichier = (libelle, joint, nom, lot, precision = `lot ${lot}`) => {
    if (joint) {
      const ici = !presents || presents.has(joint.id);
      ajouter(`${libelle} ${joint.nom} (${precision}) : ${ici ? (presents ? 'sur cet appareil' : 'joint dans l\'appli')
        : 'absent de cet appareil, joins-le de nouveau dans l\'onglet Base'}`, ici);
      return true;
    }
    if (nom) {
      ajouter(`${libelle} ${nom} (${precision}) : pas joint dans l'appli, prends-le avec toi`, false);
      return true;
    }
    return false;
  };
  // Un lot en NovaLCT avec plusieurs fichiers possibles (`parLot` de configsDuMur).
  const lotNovaLCT = ({ lot, retenue, autres, manque }) => {
    const id = lot.identifiant;
    const nova = (lot.configs ?? []).filter((x) => x.logiciel === 'NovaLCT');
    if (nova.length === 0) {
      ajouter(`Config ${logiciel} du lot ${id} : aucune, ajoute-la dans l'onglet Base`, false);
      return;
    }
    if (retenue) {
      const criteres = texteCriteresConfig(retenue);
      const precision = `lot ${id}${autres.length ? ', retenu' : ''}${criteres ? ` : ${criteres}` : ''}`;
      if (!fichier('Fichier de config', retenue.fichier, retenue.nomFichier, id, precision)) {
        ajouter(`Fichier de config ${logiciel} (lot ${id}) : non précisé, ajoute-le dans l'onglet Base`, false);
      }
    } else ajouter(`Fichier NovaLCT du lot ${id} : ${manque}`, false);
    if (nova.some((x) => x.firmware === 'personnalisé')) ajouter(`Firmware personnalisé (lot ${id}) : ne lance pas la mise à jour en ligne des cartes`, null);
    // Le multi-batch concerne le lot : celui de la config retenue, sinon celui d'une autre config du lot.
    const avecLxy = [retenue, ...autres].find((x) => x && (x.fichierMultiBatch || x.multiBatch));
    if (avecLxy) {
      fichier('Multi-batch adjustment', avecLxy.fichierMultiBatch, avecLxy.multiBatch, id,
        avecLxy === retenue ? `lot ${id}` : `lot ${id}, avec la config ${avecLxy.nomFichier ?? 'sans nom de fichier'}`);
    }
    if (retenue) fichier('Autre fichier', retenue.fichierAutre, retenue.autreFichier, id);
    for (const autre of autres) {
      fichier('Fichier de config', autre.fichier, autre.nomFichier, id, `lot ${id}, à prendre aussi si la fréquence ou la luminosité change sur place`);
      fichier('Autre fichier', autre.fichierAutre, autre.autreFichier, id);
    }
  };
  // Logiciel sans configs dans l'appli (HELIOS) : une seule ligne à vérifier.
  if (!LOGICIELS.includes(logiciel)) ajouter(`Configs ${logiciel} : pas encore gérées par l'appli ; vérifie les dalles et leur firmware dans ${logiciel}`, null);
  for (const g of LOGICIELS.includes(logiciel) ? groupes : []) {
    const debut = lignes.length;
    const c = configsDuMur(base, parcId, g.dalleId, g.n, { coches: g.coches, logiciel, frequenceHz, luminosite });
    if (c.lots.length === 0) ajouter(`Aucun fichier de config pour cette dalle dans le parc ${parc.nom} : ajoute-le dans l'onglet Base`, false);
    else if (c.retenus.length === 0) ajouter('Lots utilisés : à préciser dans l\'onglet Mur', false);
    if (c.parLot) c.parLot.forEach(lotNovaLCT);
    const configs = c.parLot ? [] : c.retenus.map((lot) => ({ lot, config: (lot.configs ?? []).find((x) => x.logiciel === logiciel) ?? null }));
    for (const { lot, config } of configs) {
      const id = lot.identifiant;
      if (!config) {
        ajouter(`Config ${logiciel} du lot ${id} : aucune, ajoute-la dans l'onglet Base`, false);
        continue;
      }
      if (logiciel === 'Tessera') {
        fichier('Fixture pack', config.fichierFixturePack, config.fixturePack, id);
        const reperes = [config.typeFixture && `type de fixture ${config.typeFixture}`, config.firmwareDalle && `firmware de la dalle ${config.firmwareDalle}`].filter(Boolean);
        if (reperes.length) {
          const texte = reperes.join(', ');
          ajouter(`${texte.charAt(0).toUpperCase()}${texte.slice(1)} (lot ${id}) : à vérifier dans Tessera`, null);
        } else ajouter(`Type de fixture et firmware de la dalle (lot ${id}) : non précisés`, false);
      } else {
        if (!fichier('Fichier de config', config.fichier, config.nomFichier, id)) ajouter(`Fichier de config ${logiciel} (lot ${id}) : non précisé, ajoute-le dans l'onglet Base`, false);
        if (logiciel === 'NovaLCT' && config.firmware === 'personnalisé') {
          ajouter(`Firmware personnalisé (lot ${id}) : ne lance pas la mise à jour en ligne des cartes`, null);
        }
        if (logiciel === 'NovaLCT') fichier('Multi-batch adjustment', config.fichierMultiBatch, config.multiBatch, id);
      }
      fichier('Autre fichier', config.fichierAutre, config.autreFichier, id);
    }
    const noms = c.retenus.map((l) => l.identifiant);
    const avecConfig = configs.filter((x) => x.config);
    const toutesNovaLCT = c.retenus.flatMap((lot) => (lot.configs ?? []).filter((x) => x.logiciel === 'NovaLCT'));
    if (logiciel === 'NovaLCT' && c.melanges && !toutesNovaLCT.some((config) => config.fichierMultiBatch || config.multiBatch)) {
      ajouter(`Multi-batch adjustment (.lxy) pour les lots ${noms.join(', ')} : aucun fichier`, false);
    }
    if (logiciel === 'Tessera' && avecConfig.length) {
      const calibrations = avecConfig.map(({ lot, config }) => ({ id: lot.identifiant, calibration: config.calibration ?? null }));
      const connues = calibrations.filter((x) => x.calibration);
      if (!c.melanges) {
        if (connues.length) ajouter(`Calibration ${connues[0].calibration} (lot ${connues[0].id}) : à vérifier dans Tessera`, null);
      } else if (connues.length < calibrations.length) {
        ajouter(`Calibration non précisée (${calibrations.filter((x) => !x.calibration).map((x) => `lot ${x.id}`).join(', ')}) : même mémoire sur toutes les dalles`, false);
      } else if (new Set(connues.map((x) => x.calibration)).size > 1) {
        ajouter(`Calibrations différentes selon les lots (${connues.map((x) => `${x.id} ${x.calibration}`).join(', ')}) : règle la même mémoire sur toutes les dalles`, false);
      } else ajouter(`Calibration ${connues[0].calibration} sur tous les lots : à vérifier dans Tessera`, null);
    }
    // Rangée de demi-dalles : ses lignes portent son nom.
    if (g.libelle) for (let i = debut; i < lignes.length; i += 1) lignes[i].texte = `${g.libelle}, ${lignes[i].texte.charAt(0).toLowerCase()}${lignes[i].texte.slice(1)}`;
  }
  const releve = logicielParc(base, parcId, proc.id);
  if (releve) ajouter(`${releve.logiciel} ${releve.version}${releve.dateReleve ? ` relevé le ${dateCourte(releve.dateReleve)}` : ''} : même version sur le PC de régie`, null);
  else ajouter(`Version de ${logiciel} non relevée pour ce processeur : relève-la dans l'onglet Base`, false);
  if (logiciel === 'Tessera') ajouter('Exporte une copie du projet Tessera avant toute mise à jour du firmware (manuel Tessera V3.5, §14.10)', null);
  if (fichiersJoints(base).some((f) => f.parcId === parcId)) ajouter('Exporte ta base avec les fichiers joints avant de partir (onglet Base)', null);
  return { nomParc: parc.nom, lignes };
}

// Dalle résolue vue dans un parc : les valeurs réglées pour ce parc passent devant, avec le parc pour source ;
// la valeur de la fiche reste visible dans « autres ». Parc null (« Tous ») ou sans réglage : la fiche telle quelle.
export function appliquerReglagesParc(dalle, base, parcId) {
  const reglage = parcId ? reglageDalleParc(base, parcId, dalle.id) : null;
  // Version : celle réglée pour la dalle, sinon (demi-dalle) celle de sa dalle entière.
  const declinaison = parcId && dalle.declinaisons?.length
    ? (reglage?.declinaison ?? (dalle.demiDe ? reglageDalleParc(base, parcId, dalle.demiDe)?.declinaison : undefined)) : undefined;
  const version = dalle.declinaisons?.find((x) => x.id === declinaison) ?? null;
  if (!reglage && !version) return dalle;
  const parc = base.parcs.find((p) => p.id === parcId);
  const source = { id: `parc-${parc.id}`, titre: `Réglage du parc ${parc.nom}`, court: `Parc ${parc.nom}`, date: null, confiance: 'réglage du parc' };
  const resultat = { ...dalle, sources: { ...(dalle.sources ?? {}) }, reglageParc: parc.nom };
  if (version) {
    appliquerVersion(resultat, version, source, parc);
    resultat.declinaisonRetenue = { ...version, parc: parc.nom };
  }
  for (const [nom, valeur] of Object.entries(reglage ?? {})) {
    if (nom === 'declinaison') continue;
    const deFiche = dalle.sources?.[nom];
    let autres = [];
    if (deFiche) autres = [{ valeur: deFiche.valeur, type: deFiche.type ?? null, source: deFiche.source, sources: deFiche.sources }, ...deFiche.autres];
    else if (!vide(dalle[nom])) autres = [{ valeur: dalle[nom], type: null, source: null, sources: [] }];
    resultat[nom] = valeur;
    resultat.sources[nom] = {
      valeur, source, sources: [source], type: null, autres, conflit: false, conflitSansRegle: false, note: null, reglageParc: true,
    };
  }
  return resultat;
}

// Valeurs propres à une version réglée dans le parc : pour chaque champ qui dépend de la version, la valeur de
// cette version (la plus défavorable si elle en a plusieurs), sinon la valeur commune ; aucune : champ retiré.
function appliquerVersion(resultat, version, source, parc) {
  for (const [nom, s] of Object.entries(resultat.sources)) {
    const groupes = [s, ...s.autres];
    if (!groupes.some((g) => g.declinaisons?.length)) continue;
    const propres = groupes.filter((g) => !g.nonRetenue && g.declinaisons?.includes(version.id));
    const candidats = propres.length ? propres : groupes.filter((g) => !g.nonRetenue && !g.declinaisons?.length);
    if (candidats.length === 0) {
      delete resultat[nom];
      delete resultat.sources[nom];
      continue;
    }
    const sens = PLUS_DEFAVORABLE[nom];
    let choisi = candidats[0];
    if (sens === 'max') choisi = candidats.reduce((a, b) => (b.valeur > a.valeur ? b : a));
    if (sens === 'min') choisi = candidats.reduce((a, b) => (b.valeur < a.valeur ? b : a));
    const autres = groupes.filter((g) => g.valeur !== choisi.valeur || Boolean(g.nonRetenue) !== Boolean(choisi.nonRetenue))
      .map((g) => ({ valeur: g.valeur, type: g.type ?? null, source: g.source ?? g.sources[0], sources: g.sources, declinaisons: g.declinaisons ?? [], ...(g.nonRetenue ? { nonRetenue: true } : {}) }));
    resultat[nom] = choisi.valeur;
    resultat.sources[nom] = {
      valeur: choisi.valeur, source, sources: [source, ...choisi.sources], type: choisi.type ?? null, declinaisons: choisi.declinaisons ?? [],
      autres, conflit: false, conflitSansRegle: false, note: `version « ${version.nom} » réglée dans le parc ${parc.nom}`, reglageParc: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Choix de la dalle : marque, puis gamme, puis version, avec une recherche par nom ou par pitch
// ---------------------------------------------------------------------------

const sansAccents = (texte) => String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pitchDe = (d) => d.pitchMm ?? (d.largeurMm && d.pxH ? d.largeurMm / d.pxH : null);
const comparerNoms = (a, b) => a.localeCompare(b, 'fr', { numeric: true });

// Dalles (et fiches d'information, grisées) rangées par marque et par gamme ; le modèle sert de gamme quand la fiche
// n'en donne pas. Les dalles du parc actif (`parc` : identifiants) passent en premier à chaque niveau.
// Recherche : un pitch (« 2,6 », « 2.6 », « P2.6 », à 0,05 mm près, pitch de la fiche ou largeur / pixels) ou un nom.
export function arbreDalles(dalles, { informations = [], parc = null, recherche = '' } = {}) {
  const q = sansAccents(recherche).trim();
  const enPitch = q.replace(/^p(?=\d)/, '').replace(',', '.');
  const pitchCherche = /^\d+(\.\d+)?$/.test(enPitch) ? Number(enPitch) : null;
  const correspond = (d) => {
    if (!q) return true;
    const p = pitchDe(d);
    if (pitchCherche !== null && p && Math.abs(p - pitchCherche) < 0.05) return true;
    return sansAccents(`${d.nom} ${d.gamme ?? ''} ${[].concat(d.alias ?? []).join(' ')} ${d.id}`).includes(q);
  };
  const marques = new Map();
  const entrees = [...dalles.map((d) => [d, false]), ...informations.map((d) => [d, true])];
  for (const [d, information] of entrees) {
    if (!correspond(d)) continue;
    const duParc = Boolean(parc?.has(d.id));
    const gamme = d.gamme || d.modele;
    if (!marques.has(d.marque)) marques.set(d.marque, new Map());
    const gammes = marques.get(d.marque);
    if (!gammes.has(gamme)) gammes.set(gamme, []);
    // Version : sans répéter la gamme quand le modèle porte son nom (Jasper 2.6 → « 2.6 »).
    const morceaux = d.modele === gamme && (d.version || d.variante) ? [d.version, d.variante] : [d.modele, d.version, d.variante];
    gammes.get(gamme).push({
      id: d.id, libelle: morceaux.filter(Boolean).join(' '), information, parc: duParc, pitch: pitchDe(d), demi: Boolean(d.demiDe),
    });
  }
  const parcDabord = (a, b) => Number(b.parc) - Number(a.parc);
  return [...marques].map(([marque, gammes]) => {
    const liste = [...gammes].map(([gamme, fiches]) => ({
      gamme,
      parc: fiches.some((f) => f.parc),
      // Même pitch : la dalle entière avant sa demi-dalle.
      fiches: fiches.sort((a, b) => parcDabord(a, b) || (a.pitch ?? Infinity) - (b.pitch ?? Infinity) || Number(a.demi) - Number(b.demi)
        || comparerNoms(a.libelle, b.libelle)),
    })).sort((a, b) => parcDabord(a, b) || comparerNoms(a.gamme, b.gamme));
    return { marque, parc: liste.some((g) => g.parc), gammes: liste };
  }).sort((a, b) => parcDabord(a, b) || comparerNoms(a.marque, b.marque));
}

// ---------------------------------------------------------------------------
// Choix du processeur (Data) : marque (famille de calcul), gamme, modèle, avec une recherche par nom
// ---------------------------------------------------------------------------

// Marque affichée : la famille de calcul (COEX est une gamme Novastar).
export const MARQUES_FAMILLE = {
  brompton: 'Brompton', novastar: 'Novastar', colorlight: 'Colorlight', megapixel: 'Megapixel', linsn: 'Linsn', kystar: 'Kystar', mooncell: 'Mooncell',
};
const compact = (texte) => sansAccents(texte).replace(/[\s-]+/g, '');

// Processeurs (et fiches d'information, grisées, en dernier) rangés par marque, puis par gamme, du plus petit au plus
// grand (pixels maxi, puis nom) ; statut « actuel » ou « ancien » dans le libellé ; fiches à compléter signalées.
// Recherche : modèle, nom, alias ou identifiant, sans tenir compte des espaces, des tirets ni des accents.
export function arbreProcesseurs(processeurs, { informations = [], recherche = '' } = {}) {
  const q = compact(recherche);
  const correspond = (p) => !q || compact(`${p.modele} ${p.nom} ${[].concat(p.alias ?? []).join(' ')} ${p.id}`).includes(q);
  const marques = new Map();
  for (const [p, information] of [...processeurs.map((p) => [p, false]), ...informations.map((p) => [p, true])]) {
    if (!correspond(p)) continue;
    const marque = MARQUES_FAMILLE[p.famille] ?? p.marque;
    if (!marques.has(marque)) marques.set(marque, { famille: p.famille, gammes: new Map() });
    const gammes = marques.get(marque).gammes;
    const gamme = p.gamme || p.modele;
    if (!gammes.has(gamme)) gammes.set(gamme, []);
    gammes.get(gamme).push({
      id: p.id, modele: p.modele, statut: p.statutCommercial ?? null, libelle: `${p.modele}${p.statutCommercial ? ` (${p.statutCommercial})` : ''}`,
      information, aCompleter: !information && champsManquants(p).length > 0, pixels: pixelsPourClassement(p),
      statutBase: p.statutBase ?? null, calculHorsAppli: p.calculHorsAppli ?? null,
    });
  }
  const parTaille = (a, b) => Number(a.information) - Number(b.information)
    || (a.pixels ?? Infinity) - (b.pixels ?? Infinity) || comparerNoms(a.modele, b.modele);
  return [...marques].map(([marque, { famille, gammes }]) => ({
    marque,
    famille,
    gammes: [...gammes].map(([gamme, liste]) => ({ gamme, fiches: liste.sort(parTaille) })).sort((a, b) => comparerNoms(a.gamme, b.gamme)),
  })).sort((a, b) => comparerNoms(a.marque, b.marque));
}

// ---------------------------------------------------------------------------
// Fiches retirées de la base de départ encore citées par un parc (membre, réglage, lots, logiciel)
// ---------------------------------------------------------------------------

export function fichesRetirees(base, depart) {
  const f = fusionner(depart, base);
  const connus = {
    dalle: new Set([...f.dalles.dalles, ...f.dalles.gabarits, ...(f.dalles.informations ?? [])].map((x) => x.id)),
    bumper: new Set(f.dalles.bumpers.map((x) => x.id)),
    processeur: new Set([...f.processeurs.processeurs, ...(f.processeurs.informations ?? [])].map((x) => x.id)),
    regie: new Set(f.regies.regies.map((x) => x.id)),
  };
  const liste = [];
  for (const parc of base.parcs) {
    const cites = [
      ...(parc.membres ?? []).map((m) => [m.type, m.id]),
      ...Object.keys(parc.reglages ?? {}).map((id) => ['dalle', id]),
      ...Object.keys(parc.lots ?? {}).map((id) => ['dalle', id]),
      ...Object.keys(parc.cases ?? {}).map((id) => ['dalle', id]),
      ...Object.keys(parc.logiciels ?? {}).map((id) => ['processeur', id]),
      ...Object.keys(parc.quantites ?? {}).map((id) => ['processeur', id]),
      // Références de dalles retenues depuis les devis (étape 25, lot 25e2).
      ...Object.values(parc.references ?? {}).map((id) => ['dalle', id]),
    ];
    const vus = new Set();
    for (const [type, id] of cites) {
      const cle = `${type}:${id}`;
      if (vus.has(cle) || connus[type]?.has(id)) continue;
      vus.add(cle);
      liste.push({
        parcId: parc.id, parcNom: parc.nom, type, id,
        reglage: Boolean(parc.reglages?.[id] || parc.logiciels?.[id] || parc.quantites?.[id]), lots: (parc.lots?.[id] ?? []).length,
      });
    }
  }
  return liste;
}

// Retire du parc une fiche qui n'existe plus : membre, réglage, lots, logiciel et nombre dans le parc. Les fichiers joints de ses lots
// sont à effacer de l'appareil par l'appelant (fichiersJoints avant l'appel).
export function retirerFicheRetiree(base, parcId, type, id) {
  return modifierParc(base, parcId, (p) => {
    const copie = { ...p, membres: (p.membres ?? []).filter((m) => !(m.type === type && m.id === id)) };
    for (const cle of ['reglages', 'lots', 'logiciels', 'cases', 'quantites']) {
      if (!copie[cle]?.[id]) continue;
      const reste = { ...copie[cle] };
      delete reste[id];
      if (Object.keys(reste).length) copie[cle] = reste;
      else delete copie[cle];
    }
    if (type === 'dalle' && Object.values(copie.references ?? {}).includes(id)) {
      const reste = Object.fromEntries(Object.entries(copie.references).filter(([, f]) => f !== id));
      if (Object.keys(reste).length) copie.references = reste;
      else delete copie.references;
    }
    return copie;
  });
}

// ---------------------------------------------------------------------------
// Consigne pour Claude et modèles de JSON
// ---------------------------------------------------------------------------

export const CONSIGNE_CLAUDE = `Lis la fiche constructeur jointe et produis un JSON au format du modèle ci-dessous, pour l'appli mur LED.

Règles :
1. Chaque valeur porte une source : un identifiant déclaré dans « sources », avec le nom du fichier et la page dans « titre », et la date du document dans « date » (AAAA-MM-JJ, ou AAAA-MM, ou AAAA). Si la date n'est pas écrite, mets null.
2. Indique le type de valeur quand la fiche le précise : « max, typique ou mesuré » (champ « type »). Une puissance doit toujours préciser si elle est max ou typique.
3. Ne mets aucune valeur inventée : quand la fiche ne donne rien, laisse le champ à null. Ne calcule jamais les pixels à partir de la largeur et du pitch.
4. Si la fiche, ou plusieurs documents, donnent des valeurs contradictoires, garde-les toutes dans « valeurs », chacune avec sa source. Ne choisis pas toi-même.
5. Les dimensions sont en millimètres, les poids en kilogrammes, les puissances en watts, les pixels en nombre entier.
6. Réponds seulement avec le JSON, sans commentaire.`;

const SOURCE_MODELE = { titre: 'nom_du_fichier.pdf, p. 3', court: 'Fiche constructeur', date: '2025-01-15', confiance: 'constructeur' };
const s = (valeur, extra = {}) => ({ valeur, source: 'fiche-constructeur', ...extra });

export const MODELES_JSON = {
  dalle: {
    sources: { 'fiche-constructeur': SOURCE_MODELE, 'fiche-loueur': { titre: 'fiche_loueur.pdf, p. 1', court: 'Fiche loueur', date: null, confiance: 'loueur' } },
    fiche: {
      type: 'dalle', marque: 'Marque', modele: 'Modèle', version: 'V1',
      pitchMm: s(2.6), largeurMm: s(500), hauteurMm: s(500), profondeurMm: s(80),
      pxH: s(192), pxV: s(192), poidsKg: s(7.5),
      pMaxW: { valeurs: [s(160, { type: 'max' }), { valeur: 180, source: 'fiche-loueur', type: 'max' }] },
      pMoyW: s(null, { type: 'typique' }),
      tensionEntreeV: s(230), carteReceptionMarque: s('Novastar'), carteReceptionModele: s('A8s Pro'),
      fichierConfig: s(null), maxAccroche: s(20), maxStack: s(null), rotationPossible: s(null),
    },
  },
  processeur: {
    sources: { 'fiche-constructeur': SOURCE_MODELE },
    fiche: {
      type: 'processeur', marque: 'Marque', modele: 'Modèle', famille: 'novastar',
      pixelsMax: s(2300000), ports: s(4), largeurMaxPx: s(3840), hauteurMaxPx: s(2560),
      debitUtileBps: s(936000000), entreesTypes: s(['hdmi-2.0', 'dvi-single']),
    },
  },
  regie: {
    sources: { 'fiche-constructeur': SOURCE_MODELE },
    fiche: {
      type: 'regie', marque: 'Marque', modele: 'Modèle', role: 'Mélangeur',
      modesSortie: [{ nom: '4K60', sorties: 4, sortiesAvecMultiviewer: null, largeurMaxPx: 3840, hauteurMaxPx: 2160, frequenceHz: 60, source: 'fiche-constructeur' }],
      sortiesTypes: s(['hdmi-2.0', '12g-sdi']),
    },
  },
  bumper: {
    sources: { 'fiche-constructeur': SOURCE_MODELE },
    fiche: { type: 'bumper', marque: 'Marque', modele: 'Bumper 1 colonne', colonnes: 1, poidsKg: s(5), cmuKg: s(null), compatibles: [] },
  },
};
