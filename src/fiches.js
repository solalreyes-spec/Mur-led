// Base locale : fiches de l'utilisateur, validation, fusion avec la base de départ, export et import, parcs.
// Fonctions pures, sans accès au stockage ni à l'interface. La base de départ (data/) reste en lecture seule.

import { resoudreFiche, champsManquants, champsManquantsRegie, BIT_DEPTH_PAR_DEFAUT } from './calculs.js';

export const TYPES = ['dalle', 'processeur', 'regie', 'bumper'];
export const LIBELLES_TYPE = { dalle: 'Dalle', processeur: 'Processeur', regie: 'Régie ou scaler', bumper: 'Bumper ou barre' };
// Types de valeur acceptés : ceux de la consigne, plus « moyenne » et « estimée » déjà présents dans la base.
export const TYPES_VALEUR = ['max', 'typique', 'mesuré', 'moyenne', 'estimée'];
export const CONFIANCES = ['constructeur', 'loueur', 'revendeur', 'base tierce', 'presse spécialisée', 'mesuré', 'formation'];

// Champs connus par type. genre : 'brut' (texte ou nombre non sourcé : identité), 'nombre', 'entier', 'texte', 'liste'.
// niveau : 'enregistrer' (obligatoire pour enregistrer), 'complet' (obligatoire pour une fiche complète) ou absent.
export const CHAMPS = {
  dalle: [
    { nom: 'marque', libelle: 'Marque', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'modele', libelle: 'Modèle', genre: 'brut', niveau: 'enregistrer' },
    { nom: 'version', libelle: 'Version', genre: 'brut' },
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
    dalles: { ...depart.dalles, dalles: marquer(depart.dalles?.dalles), gabarits: marquer(depart.dalles?.gabarits), bumpers: marquer(depart.dalles?.bumpers) },
    processeurs: { ...depart.processeurs, processeurs: marquer(depart.processeurs?.processeurs) },
    regies: { ...depart.regies, regies: marquer(depart.regies?.regies) },
  };
  for (const fichier of Object.keys(resultat)) {
    resultat[fichier].sources = { ...(depart[fichier]?.sources ?? {}), ...base.sources };
  }
  for (const { type, fiche } of base.fiches) {
    const [fichier, nomListe] = EMPLACEMENTS[type];
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
export function exporter(base, depart, { tout = false } = {}) {
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
  };
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
  return { base: resultat, rapport };
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

// Réglages d'une dalle propres à un parc : une même dalle existe avec plusieurs cartes de réception selon le loueur.
export const CHAMPS_REGLAGE_PARC = ['carteReceptionMarque', 'carteReceptionModele', 'fichierConfig', 'rotationPossible'];

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

// Dalle résolue vue dans un parc : les valeurs réglées pour ce parc passent devant, avec le parc pour source ;
// la valeur de la fiche reste visible dans « autres ». Parc null (« Tous ») ou sans réglage : la fiche telle quelle.
export function appliquerReglagesParc(dalle, base, parcId) {
  const reglage = parcId ? reglageDalleParc(base, parcId, dalle.id) : null;
  if (!reglage) return dalle;
  const parc = base.parcs.find((p) => p.id === parcId);
  const source = { id: `parc-${parc.id}`, titre: `Réglage du parc ${parc.nom}`, court: `Parc ${parc.nom}`, date: null, confiance: 'réglage du parc' };
  const resultat = { ...dalle, sources: { ...(dalle.sources ?? {}) }, reglageParc: parc.nom };
  for (const [nom, valeur] of Object.entries(reglage)) {
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
