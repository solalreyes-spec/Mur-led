// Base locale : fiches de l'utilisateur, validation, fusion avec la base de départ, export et import, parcs.
// Fonctions pures, sans accès au stockage ni à l'interface. La base de départ (data/) reste en lecture seule.

import { resoudreFiche, champsManquants, champsManquantsRegie, BIT_DEPTH_PAR_DEFAUT, ErreurSaisie, PLUS_DEFAVORABLE } from './calculs.js';
import { nombre, dateCourte } from './format.js';

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
    { nom: 'famille', libelle: 'Famille (brompton, novastar ou colorlight)', genre: 'brut', niveau: 'enregistrer', valeurs: ['brompton', 'novastar', 'colorlight'] },
    { nom: 'pixelsMax', libelle: 'Pixels maxi', genre: 'entier', unite: 'px' },
    { nom: 'ports', libelle: 'Nombre de ports', genre: 'entier' },
    { nom: 'largeurMaxPx', libelle: 'Largeur maxi', genre: 'entier', unite: 'px' },
    { nom: 'hauteurMaxPx', libelle: 'Hauteur maxi', genre: 'entier', unite: 'px' },
    { nom: 'debitUtileBps', libelle: 'Débit utile par port', genre: 'nombre', unite: 'bit/s' },
    { nom: 'capacitePort60Hz8bits', libelle: 'Capacité par port à 60 Hz, 8 bits', genre: 'nombre', unite: 'px' },
    { nom: 'capacitePort60Hz10bits', libelle: 'Capacité par port à 60 Hz, 10 bits', genre: 'nombre', unite: 'px' },
    { nom: 'capacitePort60Hz12bits', libelle: 'Capacité par port à 60 Hz, 12 bits', genre: 'nombre', unite: 'px' },
    { nom: 'dallesMax', libelle: 'Dalles maxi', genre: 'entier' },
    { nom: 'entreesTypes', libelle: 'Entrées (types de liaison)', genre: 'liste' },
  ],
  regie: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'role', libelle: 'Rôle', genre: 'brut' },
    { nom: 'sortiesTypes', libelle: 'Sorties (types de liaison)', genre: 'liste' },
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
        erreurs.push(`${libelle} : « ${entree.valeur} » n'est pas ${{ nombre: 'un nombre positif', entier: 'un entier positif', texte: 'un texte', liste: 'une liste', booleen: 'oui ou non (true ou false)' }[spec.genre] ?? 'valide'}.`);
      }
      if (entree.type !== undefined && !TYPES_VALEUR.includes(entree.type)) {
        erreurs.push(`${libelle} : type de valeur « ${entree.type} » inconnu (max, typique ou mesuré).`);
      }
    }
  }
  // Sources portées par des listes non sourcées (formats de canvas, modes de sortie).
  for (const nom of ['formatsCanvas', 'modesSortie']) {
    for (const entree of propre[nom] ?? []) {
      if (!entree.source || !sources[entree.source]) erreurs.push(`${nom} : source « ${entree.source ?? ''} » absente ou inconnue.`);
      else sourcesUtilisees.add(entree.source);
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
  for (const nom of ['formatsCanvas', 'modesSortie']) for (const x of propre[nom] ?? []) cites.add(x.source);
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
    processeurs: { ...depart.processeurs, processeurs: marquer(depart.processeurs?.processeurs) },
    regies: { ...depart.regies, regies: marquer(depart.regies?.regies) },
  };
  for (const fichier of Object.keys(resultat)) {
    resultat[fichier].sources = { ...(depart[fichier]?.sources ?? {}), ...base.sources };
  }
  for (const { type, fiche } of base.fiches) {
    const [fichier, nomListe] = EMPLACEMENTS[type];
    // Fiche d'information (LEDCAST) reprise par l'utilisateur : complète (dimensions et pixels), elle devient une dalle ;
    // sinon elle reste une fiche d'information, en version modifiée.
    const infos = type === 'dalle' ? resultat.dalles.informations : [];
    const j = infos.findIndex((f) => f.id === fiche.id);
    if (j >= 0) {
      const complete = ['largeurMm', 'hauteurMm', 'pxH', 'pxV'].every((c) => !vide(fiche[c]));
      if (complete) {
        infos.splice(j, 1);
        const dalle = { ...fiche, statutBase: 'modifiee' };
        if (dalle.statut === 'information') delete dalle.statut;
        resultat.dalles.dalles.push(dalle);
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
const SOURCE_DEFAUT_BITS = { brompton: 'défaut (livraison Tessera)', novastar: 'défaut Novastar', colorlight: 'défaut Colorlight' };

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
  return propre;
}

const avecConfigs = (base, parcId, dalleId, lotId, f) => modifierParc(base, parcId, (p) => lotsAvec(p, dalleId,
  (p.lots?.[dalleId] ?? []).map((l) => (l.id === lotId ? { ...l, configs: f(l.configs ?? []) } : l))));

// Une config par logiciel et par lot ; les fichiers déjà joints restent attachés.
export function reglerConfigLot(base, parcId, dalleId, lotId, config) {
  const propre = nettoyerConfig(config);
  return avecConfigs(base, parcId, dalleId, lotId, (configs) => {
    const avant = configs.find((c) => c.logiciel === propre.logiciel) ?? {};
    const joints = Object.fromEntries(Object.values(ROLES_FICHIER).filter((cle) => avant[cle]).map((cle) => [cle, avant[cle]]));
    return [...configs.filter((c) => c.logiciel !== propre.logiciel), { ...propre, ...joints }];
  });
}

export function configLot(base, parcId, dalleId, lotId, logiciel) {
  return lotsDalleParc(base, parcId, dalleId).find((l) => l.id === lotId)?.configs?.find((c) => c.logiciel === logiciel) ?? null;
}

export function supprimerConfigLot(base, parcId, dalleId, lotId, logiciel) {
  return avecConfigs(base, parcId, dalleId, lotId, (configs) => configs.filter((c) => c.logiciel !== logiciel));
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

// Fichier joint à une config : seulement son nom, sa taille et sa date ; le contenu reste sur l'appareil.
export function joindreFichier(base, parcId, dalleId, lotId, logiciel, role, { id, nom, taille, date }) {
  const cle = ROLES_FICHIER[role];
  if (!cle) throw new ErreurSaisie('Fichier joint : fichier de config, multi-batch adjustment, fixture pack ou autre fichier.');
  return avecConfigs(base, parcId, dalleId, lotId, (configs) => {
    const avant = configs.find((c) => c.logiciel === logiciel) ?? { logiciel };
    return [...configs.filter((c) => c.logiciel !== logiciel), { ...avant, [cle]: { id, nom, taille, date } }];
  });
}

export function detacherFichier(base, parcId, dalleId, lotId, logiciel, role) {
  const cle = ROLES_FICHIER[role];
  return avecConfigs(base, parcId, dalleId, lotId, (configs) => configs.map((c) => {
    if (c.logiciel !== logiciel) return c;
    const copie = { ...c };
    delete copie[cle];
    return copie;
  }));
}

// Tous les fichiers joints décrits dans la base, avec leur place (parc, dalle, lot, logiciel, rôle).
export function fichiersJoints(base) {
  const liste = [];
  for (const parc of base.parcs ?? []) {
    for (const [dalleId, lots] of Object.entries(parc.lots ?? {})) {
      for (const lot of lots) {
        for (const config of lot.configs ?? []) {
          for (const [role, cle] of Object.entries(ROLES_FICHIER)) {
            if (config[cle]) liste.push({ ...config[cle], parcId: parc.id, dalleId, lotId: lot.id, logiciel: config.logiciel, role });
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

// Logiciel qui règle un processeur : Tessera (Brompton), VMP (COEX), NovaLCT (Novastar), LEDVISION (Colorlight).
export function logicielDuProcesseur(proc) {
  if (proc.famille === 'brompton') return 'Tessera';
  if (proc.famille === 'colorlight') return 'LEDVISION';
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
    : [config.nomFichier ?? 'fichier non précisé', config.multiBatch && `multi-batch ${config.multiBatch}`];
  morceaux.push(config.version && `version ${config.version}`, config.firmware === 'personnalisé' && 'firmware personnalisé');
  const texte = morceaux.filter(Boolean).join(', ') || 'non précisée';
  return `Config ${config.logiciel ?? '(logiciel à préciser)'} : ${texte}, lot ${lot.identifiant}`;
}

const nomsLots = (noms) => `${noms.length > 1 ? 'lots' : 'lot'} ${noms.join(', ')}`;

// Lots et configs d'une dalle du mur dans le parc actif, pour le logiciel du processeur (Data) ou tous (Mur, null).
export function configsDuMur(base, parcId, dalleId, n, { coches = null, logiciel = null } = {}) {
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
  for (const lot of choix.retenus) {
    const configs = (lot.configs ?? []).filter((c) => logiciel === null || c.logiciel === logiciel);
    if (configs.length === 0) sansConfig.push(lot.identifiant);
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
  return { ...vide, lots, retenus: choix.retenus, parDefaut: choix.parDefaut, melanges: choix.melanges, firmwarePersonnalise, lignes, alertes };
}

// ---------------------------------------------------------------------------
// Check-list « Avant de partir » (bas de l'onglet Data, reprise dans « Tout copier »)
// ---------------------------------------------------------------------------

// Chaque ligne : fait = true (prêt), false (à faire), null (à vérifier sur place). `presents` : identifiants des
// fichiers joints présents sur l'appareil (null : inconnu). Null en « Tous ».
export function avantDePartir(base, parcId, groupes, proc, { presents = null } = {}) {
  const parc = parcId ? base.parcs.find((p) => p.id === parcId) : null;
  if (!parc) return null;
  const logiciel = logicielDuProcesseur(proc);
  const lignes = [];
  const ajouter = (texte, fait) => lignes.push({ texte, fait });
  // Fichier joint : sur l'appareil ou absent ; nom seulement : à prendre avec soi.
  const fichier = (libelle, joint, nom, lot) => {
    if (joint) {
      const ici = !presents || presents.has(joint.id);
      ajouter(`${libelle} ${joint.nom} (lot ${lot}) : ${ici ? (presents ? 'sur cet appareil' : 'joint dans l\'appli')
        : 'absent de cet appareil, joins-le de nouveau dans l\'onglet Base'}`, ici);
      return true;
    }
    if (nom) {
      ajouter(`${libelle} ${nom} (lot ${lot}) : pas joint dans l'appli, prends-le avec toi`, false);
      return true;
    }
    return false;
  };
  for (const g of groupes) {
    const debut = lignes.length;
    const c = configsDuMur(base, parcId, g.dalleId, g.n, { coches: g.coches, logiciel });
    if (c.lots.length === 0) ajouter(`Aucun fichier de config pour cette dalle dans le parc ${parc.nom} : ajoute-le dans l'onglet Base`, false);
    else if (c.retenus.length === 0) ajouter('Lots utilisés : à préciser dans l\'onglet Mur', false);
    const configs = c.retenus.map((lot) => ({ lot, config: (lot.configs ?? []).find((x) => x.logiciel === logiciel) ?? null }));
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
    if (logiciel === 'NovaLCT' && c.melanges && !avecConfig.some(({ config }) => config.fichierMultiBatch || config.multiBatch)) {
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
// Fiches retirées de la base de départ encore citées par un parc (membre, réglage, lots, logiciel)
// ---------------------------------------------------------------------------

export function fichesRetirees(base, depart) {
  const f = fusionner(depart, base);
  const connus = {
    dalle: new Set([...f.dalles.dalles, ...f.dalles.gabarits, ...(f.dalles.informations ?? [])].map((x) => x.id)),
    bumper: new Set(f.dalles.bumpers.map((x) => x.id)),
    processeur: new Set(f.processeurs.processeurs.map((x) => x.id)),
    regie: new Set(f.regies.regies.map((x) => x.id)),
  };
  const liste = [];
  for (const parc of base.parcs) {
    const cites = [
      ...(parc.membres ?? []).map((m) => [m.type, m.id]),
      ...Object.keys(parc.reglages ?? {}).map((id) => ['dalle', id]),
      ...Object.keys(parc.lots ?? {}).map((id) => ['dalle', id]),
      ...Object.keys(parc.logiciels ?? {}).map((id) => ['processeur', id]),
    ];
    const vus = new Set();
    for (const [type, id] of cites) {
      const cle = `${type}:${id}`;
      if (vus.has(cle) || connus[type]?.has(id)) continue;
      vus.add(cle);
      liste.push({
        parcId: parc.id, parcNom: parc.nom, type, id,
        reglage: Boolean(parc.reglages?.[id] || parc.logiciels?.[id]), lots: (parc.lots?.[id] ?? []).length,
      });
    }
  }
  return liste;
}

// Retire du parc une fiche qui n'existe plus : membre, réglage, lots et logiciel. Les fichiers joints de ses lots
// sont à effacer de l'appareil par l'appelant (fichiersJoints avant l'appel).
export function retirerFicheRetiree(base, parcId, type, id) {
  return modifierParc(base, parcId, (p) => {
    const copie = { ...p, membres: (p.membres ?? []).filter((m) => !(m.type === type && m.id === id)) };
    for (const cle of ['reglages', 'lots', 'logiciels']) {
      if (!copie[cle]?.[id]) continue;
      const reste = { ...copie[cle] };
      delete reste[id];
      if (Object.keys(reste).length) copie[cle] = reste;
      else delete copie[cle];
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
