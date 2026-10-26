// NovaLCT pas à pas (étape 17, spec du 18/10/2026) : ce qu'il faut faire dans NovaLCT, et avant dans V-Can ou en
// façade, pour le mur ouvert, étape par étape. Fonctions pures, sans interface (l'écran viendra en 17b) : elles lisent
// ce que l'appli a déjà calculé (évaluation de Data, câblage retenu du Schéma, source de Canvas, configs du lot) et ne
// recalculent rien. Chaque étape cite sa source (manuel, version, paragraphe et page imprimée, ou formation) ; une
// étape sans source porte « à vérifier en formation », sans nom de menu inventé. Noms de menus en anglais, tels quels.

import { nombre } from './format.js';
import { mur as murDeDalles, evaluerProcesseur, cablageData, sourceConseillee, portsDoubles, CONTROLE_ETHERNET_NOVALCT } from './calculs.js';
import { texteProcesseurs, nomSecours, texteSecoursPort } from './secours.js';
import { arbreProcesseurs, texteCriteresConfig } from './fiches.js';
import {
  SOURCES_CONNEXION, ALERTE_NOVALCT, SOURCES_ALERTE_NOVALCT, controleProcesseur, cheminIP, autreSysteme,
} from './connexion.js';

export const SOURCES_NOVALCT = {
  'lct-5-5-0': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.5.0 (Novastar)',
    court: 'Manuel NovaLCT V5.5.0',
    confiance: 'constructeur',
  },
  // Secours par un second processeur (étape 22c) : le guide V5.0.0 (§ 5.1.7, hot backup en cascade).
  'lct-5-0-0': {
    titre: 'NovaLCT LED Configuration Tool, Synchronous System User Guide V5.0.0 (Novastar)',
    court: 'Manuel NovaLCT V5.0.0',
    confiance: 'constructeur',
  },
  'lct-5-8-1': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.8.1 (Novastar), consulté le 18 octobre 2026',
    court: 'Manuel NovaLCT V5.8.1',
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2025/12/NovaLCT-LED-Configuration-Tool-for-Synchronous-Control-System-User-Manual-V5.8.1.pdf',
  },
  'notes-lct-5-8-1': {
    titre: 'NovaLCT V5.8.1 Release Notes (Novastar)',
    court: 'Notes de version NovaLCT V5.8.1',
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2025/12/NovaLCT-V5.8.1-Release-Notes.pdf',
  },
  'vx1000-1-5-0': {
    titre: 'VX1000 All-in-One Controller User Manual V1.5.0 du 10 juin 2025 (Novastar)',
    court: 'Manuel VX1000 V1.5.0',
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2025/06/VX1000-All-in-One-Controller-User-Manual-V1.5.0.pdf',
  },
  'vcan-3-8-0': {
    titre: 'V-Can Video Control Software User Manual V3.8.0 (Novastar)',
    court: 'Manuel V-Can V3.8.0',
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/12/V-Can-Video-Control-Software-User-Manual-V3.8.0.pdf',
  },
  'vx1000-pro-1-4-0': {
    titre: 'VX1000 Pro All-in-One Controller Specifications V1.4.0 (Novastar)',
    court: 'Fiche VX1000 Pro V1.4.0',
    confiance: 'constructeur',
  },
  // Fiches et manuels relus pour les particularités des modèles (étape 18b, récupérés le 21 octobre 2026).
  'mctrl4k-1-2-1': {
    titre: 'MCTRL4K LED Display Controller Specifications V1.2.1 (Novastar)', court: 'Fiche MCTRL4K V1.2.1', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/11/MCTRL4K-LED-Display-Controller-Specifications-V1.2.1.pdf',
  },
  'mctrl4k-manuel-1-2-1': {
    titre: 'MCTRL4K LED Display Controller User Manual V1.2.1 (Novastar)', court: 'Manuel MCTRL4K V1.2.1', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/11/MCTRL4K-LED-Display-Controller-User-Manual-V1.2.1.pdf',
  },
  'cvt4k-s-1-0-6': {
    titre: 'CVT4K-S Fiber Converter Specifications V1.0.6 (Novastar)', court: 'Fiche CVT4K-S V1.0.6', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/10/CVT4K-S-Fiber-Converter-Specifications-V1.0.6.pdf',
  },
  'mctrl660-pro-1-4-1': {
    titre: 'MCTRL660 PRO Independent Controller Specifications V1.4.1 (Novastar)', court: 'Fiche MCTRL660 PRO V1.4.1', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/11/MCTRL660-PRO-Independent-Controller-Specifications-V1.4.1.pdf',
  },
  'mctrl-r5-1-0-5': {
    titre: 'MCTRL R5 LED Display Controller Specifications V1.0.5 (Novastar)', court: 'Fiche MCTRL R5 V1.0.5', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/11/MCTRL-R5-LED-Display-Controller-Specifications-V1.0.5.pdf',
  },
  'mctrl-r5-manuel-1-0-5': {
    titre: 'MCTRL R5 LED Display Controller User Manual V1.0.5 (Novastar)', court: 'Manuel MCTRL R5 V1.0.5', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2024/11/MCTRL-R5-LED-Display-Controller-User-Manual-V1.0.5.pdf',
  },
  'h9-1-8-0': {
    titre: 'H9 Video Wall Splicer Specifications V1.8.0 (Novastar)', court: 'Fiche H9 V1.8.0', confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2023/02/H9-Video-Wall-Splicer-Specifications-V1.8.0.pdf',
  },
  'formation-6': { titre: 'Formation (transcription 6)', court: 'Formation (transcription 6)', confiance: 'formation' },
  'formation-10': { titre: 'Formation (transcription 10)', court: 'Formation (transcription 10)', confiance: 'formation' },
  'formation-11': { titre: 'Formation (transcription 11)', court: 'Formation (transcription 11)', confiance: 'formation' },
  'formation-12': { titre: 'Formation (transcription 12)', court: 'Formation (transcription 12)', confiance: 'formation' },
  // Intégrateur (source tierce, signalée comme telle) : articles écrits pour NovaLCT-Mars et des MCTRL 600, 660, VX4S,
  // PBOX 100 malgré le titre, non datés, consultés le 25 octobre 2026 (spec de l'étape 22, F9).
  'daktronics-000020215': {
    titre: 'Daktronics, base de connaissances, article 000020215 : « NovaStar: How do I configure redundancy for a display using multiple MCTRL 4K sender boxes? », consulté le 25 octobre 2026',
    court: 'Daktronics (intégrateur), article 000020215',
    confiance: 'intégrateur',
    url: 'https://daktronics.com/en-us/support/kb/000020215',
  },
  'daktronics-dd3397344': {
    titre: 'Daktronics, base de connaissances, article DD3397344 : « NovaStar: How do I configure redundancy for a display using a sender box? », consulté le 25 octobre 2026',
    court: 'Daktronics (intégrateur), article DD3397344',
    confiance: 'intégrateur',
    url: 'https://daktronics.com/en-us/support/kb/DD3397344',
  },
  cdc: { titre: 'Cahier des charges du projet, mise en service Novastar', court: 'Cahier des charges du projet', confiance: 'choix de conception' },
  // Ton ordinateur (étape 19a) : sources des étapes 0.1 et 0.3, reprises de connexion.js.
  ...Object.fromEntries(['vmp-1-5-0', 'apple-boot-camp', 'ms-mac-arm', 'ms-emulation-arm', 'ms-faq-arm'].map((id) => [id, SOURCES_CONNEXION[id]])),
};

const src = (id, ref = null) => ({ id, ref, court: SOURCES_NOVALCT[id].court });

// ---------------------------------------------------------------------------
// Logiciel vidéo de chaque processeur NovaLCT (spec § 3.2)
// ---------------------------------------------------------------------------

const PREFIXE = 'novastar-';
const CARTES_ENVOI = ['mctrl300', 'mctrl500', 'mctrl600', 'mctrl660', 'mctrl660-pro', 'mctrl700', 'mctrl700-pro', 'mctrl-r5', 'mctrl4k', 'msd300', 'msd600'];
// Liste des produits de V-Can pour la résolution d'entrée (manuel V-Can V3.8.0 § 3.1.1.1).
const V_CAN = ['vx1000', 'vx600', 'vx400', 'vx16s', 'vx6s', 'novapro-uhd-jr'];
const VX_PRO = ['vx400-pro', 'vx600-pro', 'vx1000-pro', 'vx2000-pro'];
// Produits cités par le manuel V-Can V3.8.0 pour chaque fonction (« Applicable Products ») : MOSAIC (§ 3.1.1.3),
// « limited to full » (§ 3.1.1.6), Backup et Restore (§ 3.3.5 et § 3.3.6).
const V_CAN_FONCTIONS = {
  mosaic: ['vx1000', 'vx600', 'vx400', 'novapro-uhd-jr', 'vx16s'],
  limited: ['vx1000', 'vx600', 'vx400', 'novapro-uhd-jr'],
  sauvegarde: ['vx1000', 'vx600', 'vx400'],
};
// Tout-en-un dont le manuel NovaLCT règle l'entrée dans l'onglet Sending Card (§ 5.2.1 : « The V1160 and VX16s »).
const ENTREE_SENDING_CARD = ['vx16s'];
// Entrées d'après l'identifiant de la liaison (data/connectique.json) ; seules DVI, HDMI et DP se règlent (V-Can § 3.1.1.1).
const ENTREES = [[/^dvi/, 'DVI'], [/^hdmi/, 'HDMI'], [/^dp/, 'DisplayPort'], [/sdi$/, 'SDI'], [/^opt/, 'optique (OPT)'],
  [/^st2110/, 'ST 2110'], [/^hdbaset/, 'HDBaseT'], [/^dtp/, 'DTP2']];
const entreeReglable = (liaison) => /^(dvi|hdmi|dp)/.test(liaison ?? '');
const nomEntree = (liaison) => ENTREES.find(([motif]) => motif.test(liaison ?? ''))?.[1] ?? null;

export function groupeVideo(proc) {
  if (proc?.logiciel !== 'NovaLCT') return null;
  const id = String(proc.id ?? '').replace(PREFIXE, '');
  if (CARTES_ENVOI.includes(id)) {
    return {
      id: 'carte-envoi', libelle: 'Carte d\'envoi', logiciels: [], aVerifier: false,
      note: 'Carte d\'envoi : l\'entrée se règle dans NovaLCT, onglet Sending Card.',
      sources: [src('lct-5-5-0', '§ 5.2.1, p. 8')],
    };
  }
  if (V_CAN.includes(id)) {
    const analogie = id === 'vx600' || id === 'vx400';
    return {
      id: 'v-can', libelle: 'Tout-en-un réglé dans V-Can', logiciels: ['V-Can', 'façade'], aVerifier: id !== 'vx1000',
      note: id === 'vx1000'
        ? 'Entrée, couches, presets et sauvegarde dans V-Can ou en façade ; l\'écran dans NovaLCT.'
        : analogie
          ? `Menus du ${proc.modele} par analogie avec le VX1000 (pas de manuel utilisateur lu) : à vérifier en formation.`
          : `V-Can d'après sa liste de produits ; menus de façade relevés sur le VX1000 : à vérifier en formation.`,
      sources: [src('vcan-3-8-0', '§ 3.1.1.1, p. 6'), src('vx1000-1-5-0', '§ 1, p. 3')],
    };
  }
  if (VX_PRO.includes(id)) {
    return {
      id: 'vx-pro', libelle: 'VX Pro', logiciels: ['VICP', 'Unico'], aVerifier: true,
      note: 'Réglages vidéo dans VICP ou Unico, d\'après la fiche ; étapes à vérifier en formation.',
      sources: [src('vx1000-pro-1-4-0', 'p. 2')],
    };
  }
  return {
    id: 'autre', libelle: 'Autre', logiciels: [], aVerifier: true,
    note: 'Réglages vidéo en façade ou dans un autre logiciel : aucune source lue, à vérifier en formation.',
    sources: [],
  };
}

// ---------------------------------------------------------------------------
// Particularités des modèles (étape 18b, spec § 3.2) : chacune avec sa source, ou « à vérifier en formation »
// ---------------------------------------------------------------------------

// Sorties fibre : quels ports chaque fibre porte (`parFibre` ports par OPT principale), convertisseur au pied du mur.
const FIBRES = {
  mctrl4k: {
    texte: 'OPT1 porte les ports 1 à 8, OPT2 les ports 9 à 16 ; OPT3 copie OPT1 et OPT4 copie OPT2, en secours.',
    parFibre: 8,
    convertisseur: ' Au pied du mur : un CVT4K ; la fibre sur son OPT du même numéro, puis chaque câble de dalle sur le port du même '
      + 'numéro (fiche CVT4K-S : OPT1 pour les ports 1 à 8, OPT2 pour 9 à 16). Fibre monomode OS1 ou OS2, connecteurs LC, 10 km au plus.',
    aVerifier: false,
    sources: [['mctrl4k-1-2-1', 'p. 4'], ['mctrl4k-manuel-1-2-1', 'p. 4 et 8'], ['cvt4k-s-1-0-6', 'p. 3'], ['formation-10', null]],
  },
  'mctrl-r5': {
    texte: 'OPT1 copie les ports 1 à 8 ; OPT2 copie OPT1.',
    parFibre: 8,
    convertisseur: ` Convertisseur au pied du mur : la fiche ne le nomme pas, ${'à vérifier en formation'}.`,
    aVerifier: true,
    sources: [['mctrl-r5-1-0-5', 'p. 3'], ['mctrl-r5-manuel-1-0-5', 'p. 3']],
  },
  'mctrl660-pro': {
    texte: 'OPT1 porte les 6 ports ; OPT2 est le secours d\'OPT1.',
    parFibre: 6,
    convertisseur: ' Au pied du mur, la fiche dit que le MCTRL660 PRO peut lui-même servir de convertisseur (« can work as a sending card '
      + `and a fiber converter ») ; le convertisseur à prendre au stock : ${'à vérifier en formation'}.`,
    aVerifier: true,
    sources: [['mctrl660-pro-1-4-1', 'p. 1 et 4']],
  },
};
// Mode de travail (Set Working Mode, NovaLCT § 5.5 « Applicable Products ») ; ports optiques en hot backup ou copy.
const MODE_TRAVAIL = { 'mctrl660-pro': ['mctrl660-pro-1-4-1', 'p. 1'], 'mctrl-r5': null, h9: ['h9-1-8-0', 'p. 2'], 'novapro-uhd-jr': null };
const MODE_OPTIQUE = ['h9', 'novapro-uhd-jr'];
// Secours par un second processeur (étape 22c, spec § 4) : réglage Primary ou Backup en façade, d'après le manuel de
// chaque modèle (MCTRL4K § 6.5.5, MCTRL R5 § 6.6.5, VX1000 § 5.8.1 ; série H : « Backup between devices », fiche H9).
// `marque` : la fiche décrit la marque sur l'icône des ports (fixe en attente, clignotante une fois le secours en service).
const SECOURS_FACADE = {
  mctrl4k: { menu: 'Advanced Settings > Redundancy Settings', principal: 'Set as Primary', secours: 'Set as Backup', marque: true, source: ['mctrl4k-manuel-1-2-1', '§ 6.5.5, p. 18'] },
  'mctrl-r5': { menu: 'Advanced Settings > Redundancy Settings', principal: 'primary device', secours: 'backup device', marque: true, source: ['mctrl-r5-manuel-1-0-5', '§ 6.6.5, p. 14'] },
  vx1000: { menu: 'Advanced Settings > Device Backup', principal: 'Primary', secours: 'Backup', marque: false, source: ['vx1000-1-5-0', '§ 5.8.1, p. 35 et 36'] },
};
const FACADE_SERIE_H = {
  menu: 'page web ou écran tactile, sauvegarde entre appareils (« Backup between devices »)', principal: 'en principal', secours: 'en secours',
  marque: false, aVerifier: true, source: ['h9-1-8-0', 'p. 3'],
};
const facadeSecours = (idCourt) => SECOURS_FACADE[idCourt] ?? (/^h\d+$/.test(idCourt) ? FACADE_SERIE_H : null);
// Sens inversé du chemin du secours écrit par Novastar (VX1000 § 5.8.1 p. 36, MCTRL R5 § 6.6.5 p. 14) ; ailleurs, à vérifier.
const SENS_SECOURS_SOURCE = ['vx1000', 'mctrl-r5'];
// Cascade USB des boîtiers (F10) : prises et sources.
const CASCADE_USB = {
  mctrl4k: { entree: 'l\'USB IN', sortie: 'l\'USB OUT', source: ['mctrl4k-manuel-1-2-1', 'p. 4 ; § 4, p. 6'] },
  'mctrl-r5': { entree: 'l\'USB IN', sortie: 'l\'USB OUT', source: ['mctrl-r5-manuel-1-0-5', 'p. 4 et 5'] },
  'mctrl660-pro': { entree: 'l\'USB IN', sortie: 'l\'USB OUT', source: ['mctrl660-pro-1-4-1', 'p. 4'] },
  vx1000: { entree: 'l\'USB 2.0 de type B', sortie: 'l\'USB 2.0 de type A', source: ['vx1000-1-5-0', 'p. 7'] },
};
// Ports qui permettent Verify (Hot Backup Verification, manuel V5.5.0 § 5.3 : « MCTRL4K, MCTRL R5 and KT8 »).
const VERIFY = ['mctrl4k', 'mctrl-r5'];

// Secours de la source d'entrée (NovaLCT § 5.2.1, étape 10 : « For the MCTRL660 PRO and MCTRL R5 »).
const SECOURS_SOURCE = ['mctrl660-pro', 'mctrl-r5'];

// « ports 1 à 4 », « port 3 », « ports 1, 3 et 5 ».
function textePorts(liste) {
  const l = [...new Set(liste)].sort((a, b) => a - b);
  if (l.length === 1) return `port ${l[0]}`;
  const suite = l.every((x, i) => i === 0 || x === l[i - 1] + 1);
  return suite ? `ports ${l[0]} à ${l.at(-1)}` : `ports ${enumeration(l.map(String))}`;
}

// ---------------------------------------------------------------------------
// Versions de NovaLCT (spec § 3.3)
// ---------------------------------------------------------------------------

const VERSIONS_LUES = ['5.5.0', '5.8.1'];
// Noms qui changent entre les deux manuels lus ; tout le reste du parcours y porte le même nom.
const NOMS_VERSION = {
  charger: { '5.5.0': 'Load from File', '5.8.1': 'Import' },
  envoyerCartes: { '5.5.0': 'Send to Receiving Card', '5.8.1': 'Send' },
  enregistrerRcfgx: { '5.5.0': 'Save to File', '5.8.1': 'Export' },
  joints: { '5.5.0': 'Tools > Quickly Adjust Dark or Bright Lines > Adjust Dark or Bright Lines', '5.8.1': 'Tools > Quickly Adjust Dark or Bright Lines' },
};

// Version relevée dans le parc → manuel dont les noms passent en premier ; note quand la version n'est pas lue.
export function versionReference(version) {
  const brute = version == null ? '' : String(version).trim();
  if (!brute) return { premiere: '5.8.1', note: 'Version de NovaLCT du PC de régie à relever (onglet Base) : noms de la V5.8.1 en premier.' };
  const v = brute.replace(/^v/i, '');
  const m = /^(\d+)\.(\d+)(?:\.\d+)*$/.exec(v);
  if (!m) return { premiere: '5.8.1', note: `Version de NovaLCT illisible (« ${brute} ») : noms de la V5.8.1 en premier.` };
  const majeure = Number(m[1]);
  const mineure = Number(m[2]);
  const premiere = majeure > 5 || (majeure === 5 && mineure >= 8) ? '5.8.1' : '5.5.0';
  const note = VERSIONS_LUES.includes(v) ? null : `Noms relevés dans les manuels V5.5.0 et V5.8.1 ; ta version ${v} : à vérifier.`;
  return { premiere, note };
}

// « Import (V5.8.1) ou Load from File (V5.5.0) » : le nom de la version de référence d'abord.
export function nomMenu(cle, premiere = '5.8.1') {
  const noms = NOMS_VERSION[cle];
  const autre = VERSIONS_LUES.find((x) => x !== premiere);
  if (noms[premiere] === noms[autre]) return noms[premiere];
  return `${noms[premiere]} (V${premiere}) ou ${noms[autre]} (V${autre})`;
}

// ---------------------------------------------------------------------------
// Étapes (spec § 4)
// ---------------------------------------------------------------------------

const A_VERIFIER = 'à vérifier en formation';
// Titres fixes, aussi pour nommer une étape disparue dans le bandeau des cases.
const TITRES = {
  '0.1': 'PC de régie et logiciels', '0.2': 'Fichiers du lot', '0.3': 'Brancher le PC', '0.4': 'Tout en ligne, firmwares notés',
  '0.5': 'Connexion avancée', '0.6': 'Redondance : câble principal d\'abord', '0.7': 'Fibre, si le mur passe en fibre', '0.8': 'Synchronisation (genlock)',
  'A.1': 'Entrée à la taille du canvas', 'A.2': 'Deux entrées assemblées (MOSAIC)', 'A.3': 'Couche plein écran et preset',
  'A.4': 'Plage RGB Full', 'A.5': 'Sauvegarde du boîtier', 'A.6': 'Synchronisation des processeurs',
  'B.1': 'Ouvrir Screen Configuration', 'B.1a': 'Mode de travail : carte d\'envoi', 'B.2': 'Carte d\'envoi', 'B.2a': 'Secours de la source (facultatif)', 'B.3': 'Cartes de réception : fichier', 'B.4': 'Taille de carte',
  'B.5': 'Performance Settings : ne touche à rien', 'B.6': 'Screen Connection : la grille', 'B.8': 'Charge des ports',
  'B.9': 'Coordinate', 'B.10': 'Envoyer, enregistrer', 'B.11': 'Redondance des ports',
  'C.1': 'Nombre de cartes par port', 'C.2': 'Mapping', 'C.3': 'Mire', 'C.4': 'Luminosité', 'C.5': 'Test de la redondance', 'C.5a': 'Surveillance : « Backing up »',
  'S.1': 'Câbles de secours', 'S.2': 'Pas de config d\'écran', 'S.3': 'Réglé en secours (Backup)',
  'C.6': 'Lots mélangés : multi-batch', 'C.7': 'Joints de la zone courbe ou pliée', 'C.8': 'Le lendemain : Read from HW',
};
const titreDe = (id) => {
  const code = id.replace(/^P\d+\./, '');
  const port = /^B\.7\.(\d+)$/.exec(code);
  return port ? `Port ${port[1]}` : TITRES[code] ?? code;
};

// Une étape : la signature ne dépend que de son identifiant et de ses valeurs (pas de l'ordre des noms de version).
// `tableau` : { colonnes, lignes } à remplir dans le logiciel (redondance), ou null.
// `codeParc` : nom du parc dont l'écran montre le code admin NovaLCT (étape 0.5), jamais le code lui-même.
// `aVerifier` : true (« à vérifier en formation ») ou ce qu'il reste à vérifier et où (« chez toi, avant ta première presta »).
// `connexion` : { chemin, autre } de cheminIP (étape 0.3, 19a), hors de la signature : changer d'ordinateur ne décoche rien.
function etape(id, texte, sources, { titre = titreDe(id), valeurs = {}, aVerifier = false, alerte = null, tableau = null, codeParc = null, connexion = null } = {}) {
  return { id, titre, texte, sources, aVerifier, alerte, tableau, codeParc, connexion, valeurs, signature: `${id}|${JSON.stringify(valeurs)}` };
}
// Texte de « à vérifier » d'une étape.
export const verifierOu = (e) => (typeof e.aVerifier === 'string' ? e.aVerifier : 'en formation');

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const dim = (l, h) => `${l} × ${h}`;
const enumeration = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`);
const position = (nom) => {
  const m = /^C(\d+) R(\d+)$/.exec(nom);
  return m ? { c: Number(m[1]), r: Number(m[2]) } : null;
};

// Carte de réception qui se règle par NCP dans NovaLCT V5.8.1 (§ 5.2.2) : A10s Pro.
const parNCP = (dalle) => /a10s\s*-?\s*pro/i.test(String(dalle?.carteReceptionModele ?? ''));

// Ce que la 17a ne détaille pas (spec § 4, choix 6).
function nonCouverts(m, dalle) {
  const raisons = [];
  if ((m.zones?.length ?? 0) > 1) raisons.push('Mur en zones');
  if (m.mixte) raisons.push('Mur mixte');
  if (m.horsAxe) raisons.push('Dalles hors axe');
  if ((m.zones ?? []).some((z) => z.forme)) raisons.push('Forme libre');
  if (dalle?.orientation === 'tournee') raisons.push('Dalles tournées');
  return raisons.map((r) => `${r} : la connexion de l'écran (Complex Screen, Set Blank) n'est pas détaillée ; ${A_VERIFIER}.`);
}

// Configs NovaLCT des lots retenus (configsDuMur de Data, une entrée par fiche du mur) ; null : pas de parc choisi.
// Avec la fréquence de Data (étape 20, `parLot`) : le fichier retenu de chaque lot, et à part les autres fichiers ;
// sans `parLot`, toutes les configs NovaLCT des lots, comme avant.
export function lireConfigs(configs) {
  if (!configs) return { aucunParc: true, fichiers: [], noms: [], autres: [], lxy: [], alertes: [], melanges: false, perso: false };
  const retenues = [];
  const autres = [];
  for (const { libelle, resultat } of configs) {
    if (resultat?.parLot) {
      for (const { lot, retenue, autres: reste } of resultat.parLot) {
        if (retenue) retenues.push({ libelle, lot: lot.identifiant, config: retenue });
        autres.push(...reste.map((config) => ({ libelle, lot: lot.identifiant, config })));
      }
    } else {
      retenues.push(...(resultat?.retenus ?? []).flatMap((lot) => (lot.configs ?? [])
        .filter((c) => c.logiciel === 'NovaLCT')
        .map((c) => ({ libelle, lot: lot.identifiant, config: c }))));
    }
  }
  const decrire = ({ libelle, lot, config }) => {
    const criteres = texteCriteresConfig(config);
    return `${libelle ? `${libelle} : ` : ''}${config.nomFichier ?? 'fichier non précisé'} (lot ${lot}${criteres ? `, ${criteres}` : ''})`;
  };
  return {
    aucunParc: false,
    fichiers: retenues.map(decrire),
    noms: [...new Set(retenues.map(({ config }) => config.nomFichier ?? null))],
    autres: autres.map(decrire),
    // Le multi-batch concerne le lot : lu sur toutes ses configs NovaLCT.
    lxy: [...new Set([...retenues, ...autres].map(({ config }) => config.multiBatch).filter(Boolean))],
    alertes: configs.flatMap(({ libelle, resultat }) => (resultat?.alertes ?? []).map((a) => (libelle ? `${libelle} : ${a}` : a))),
    melanges: configs.some(({ resultat }) => resultat?.melanges),
    perso: configs.some(({ resultat }) => resultat?.firmwarePersonnalise),
  };
}
const CHOISIS_PARC = 'Choisis un parc pour voir ses lots et ses configs.';

// Chemin d'un port dans la grille de son processeur : « monte la colonne 1, descend la colonne 2 ».
function sensDuCable(cases) {
  const tronçons = [];
  for (const p of cases) {
    const t = tronçons.at(-1);
    const dernier = t?.cases.at(-1);
    if (t && t.cases.length === 1 && (p.c === dernier.c || p.r === dernier.r)) {
      t.axe = p.c === dernier.c ? 'colonne' : 'rangee';
      t.cases.push(p);
    } else if (t && ((t.axe === 'colonne' && p.c === dernier.c) || (t.axe === 'rangee' && p.r === dernier.r))) {
      t.cases.push(p);
    } else {
      tronçons.push({ axe: null, cases: [p] });
    }
  }
  return tronçons.map(({ axe, cases: c }) => {
    const [a, b] = [c[0], c.at(-1)];
    if (axe === 'colonne') return `${b.r < a.r ? 'monte' : 'descend'} la colonne ${a.c}`;
    if (axe === 'rangee') return `va vers la ${b.c > a.c ? 'droite' : 'gauche'} sur la rangée ${a.r}`;
    return `passe par la carte colonne ${a.c}, rangée ${a.r}`;
  }).join(', ');
}

// Où sont les cartes d'un port : colonnes entières, rangées entières, ou de telle carte à telle carte.
function placeDuPort(cases, g) {
  const cols = [...new Set(cases.map((p) => p.c))].sort((x, y) => x - y);
  const rows = [...new Set(cases.map((p) => p.r))].sort((x, y) => x - y);
  const mur = (axe, liste, decalage) => liste.map((x) => `${axe}${x + decalage - 1}`);
  const suite = (nom, liste, axe, decalage) => {
    const murs = mur(axe, liste, decalage);
    if (liste.length === 1) return `${nom} ${liste[0]} de l'écran (${murs[0]} du mur)`;
    const pluriel = `${nom}s`;
    if (liste.length === 2) return `${pluriel} ${liste[0]} et ${liste[1]} de l'écran (${murs[0]} et ${murs[1]} du mur)`;
    return `${pluriel} ${liste[0]} à ${liste.at(-1)} de l'écran (${murs[0]} à ${murs.at(-1)} du mur)`;
  };
  if (cases.length === cols.length * g.rangees) return suite('colonne', cols, 'C', g.premiereColonne);
  if (cases.length === rows.length * g.colonnes) return suite('rangée', rows, 'R', g.premiereRangee);
  return `de la carte colonne ${cases[0].c}, rangée ${cases[0].r} à la carte colonne ${cases.at(-1).c}, rangée ${cases.at(-1).r} de l'écran`;
}

const pourcent = (taux) => `${nombre(taux * 100)} %`;
const SEUIL_AVERTISSEMENT = 650000;

// Le pas à pas du mur ouvert, ou null si le processeur ne se règle pas dans NovaLCT.
// `configs` : [{ libelle, resultat: configsDuMur(...) }] (null : pas de parc) ; `version` : version de NovaLCT relevée
// dans le parc ; `pliage` : pliageSortie de Canvas ; `courbe` : une zone courbe ou pliée ; `parc` : { nom, aCode } du parc
// actif (étape 18a), le code lui-même n'entre jamais dans le pas à pas. `systeme` : choix « Mon ordinateur » (mac ou
// windows, étape 19a) ; sans choix, le texte de Windows d'avant l'étape 19.
export function etapesNovaLCT({ mur: m, dalle, evaluation, variante, source, configs = null, version = null, pliage = null, courbe = false, parc = null, systeme = null }) {
  const proc = evaluation?.processeur;
  if (!proc || proc.logiciel !== 'NovaLCT') return null;
  const groupe = groupeVideo(proc);
  const ver = versionReference(version);
  const nom = (cle) => nomMenu(cle, ver.premiere);
  const { frequenceHz: freq, bits, redondance, liaisonSecours } = evaluation.reglages;
  const groupes = evaluation.groupes ?? [];
  const nb = groupes.length;
  const modele = proc.modele;
  // Secours par un second processeur (étape 22c) : N processeurs de secours, n + N double n ; `cascade` : méthode cascade
  // (tableau), sinon sans cascade (Primary et Backup).
  const nbSecours = redondance ? (evaluation.nombreSecours ?? 0) : 0;
  const avecSecours = nbSecours > 0;
  const cascade = avecSecours && liaisonSecours === 'cascade';
  const total = nb + nbSecours;
  const nomBoitier = (k) => (k > nb ? nomSecours(modele, k) : `${modele} n° ${k}`);
  const titreProcesseurs = texteProcesseurs({ nombre: nb, nombreSecours: nbSecours, processeur: proc });
  const cfg = lireConfigs(configs);
  const nonCouvert = nonCouverts(m, dalle);
  const demi = m.rangeeDemi ? m.demi : null;
  const vcan = groupe.id === 'v-can';
  const vx1000 = proc.id === `${PREFIXE}vx1000`;
  const idCourt = String(proc.id ?? '').replace(PREFIXE, '');
  const cite = (fonction) => V_CAN_FONCTIONS[fonction].includes(idCourt);
  const pasCite = (fonction) => (cite(fonction) ? '' : ` Le manuel V-Can ne cite pas le ${modele} pour cette fonction : ${A_VERIFIER}.`);
  const plie = (i) => Boolean(pliage?.ok && pliage.blocs?.[i] && !pliage.blocs[i].tel);
  const taillePliee = pliage?.format ? dim(pliage.format.largeurPx, pliage.format.hauteurPx) : null;
  // Variante de câblage marquée impossible dans le Schéma (relecture point 5) : sa raison en alerte.
  const alerteVariante = variante && variante.possible === false
    ? `Câblage retenu dans le Schéma impossible : ${variante.raison ?? 'raison non donnée'}` : null;
  const largeurSource = source?.largeurPx ?? Math.max(0, ...groupes.map((g) => g.largeurPx));
  const hauteurSource = source?.hauteurPx ?? Math.max(0, ...groupes.map((g) => g.hauteurPx));
  const personnalisee = source ? !source.standard : true;
  const lct55 = (ref) => src('lct-5-5-0', ref);
  const lct58 = (ref) => src('lct-5-8-1', ref);
  const facade = facadeSecours(idCourt);
  const siAddGrise = ' Si Add est grisé : pistes à vérifier : connexion avancée (étape 0.5), NovaLCT trop ancien (MCTRL4K : V5.2.0 ou plus pour '
    + 'le piloter), boîtier réglé en Backup.';
  const sourcesAddGrise = [src('mctrl4k-manuel-1-2-1', '§ 7.5.1, p. 33'), lct58('§ 4, p. 6')];
  const codeParc = parc?.aCode && parc.nom ? String(parc.nom) : null;
  // Ton ordinateur (étape 19a) : sur Mac, l'alerte de NovaLCT ; port de contrôle et adresse du modèle, chemin du système.
  const mac = systeme === 'mac';
  const controle = controleProcesseur(proc);
  const sys = mac ? 'mac' : 'windows';
  const texteControle = controle.inconnu ? ` ${controle.texte.replace(/\.$/, `, ${A_VERIFIER}.`)}`
    : ` En Ethernet : câble entre le port ${controle.ethernet} du ${modele} et ton ordinateur (adaptateur USB-C Ethernet sur un Mac).`
      + `${controle.adresse ? ` ${controle.adresse} ; donne à l'ordinateur la même plage.` : ` Où lire son adresse : ${A_VERIFIER} ; donne à l'ordinateur la même plage.`}`;

  // Étape 0.3 avec un processeur de secours (étape 22c, spec § 4.1.3 et § 4.2.2) : cascade USB dans l'ordre 1 à 2N, ou une
  // liaison par boîtier (switch et une adresse chacun, choix de conception ; ou un câble USB chacun, Daktronics).
  function etapeConnexionSecours() {
    const boitiers = Array.from({ length: total }, (_, i) => i + 1);
    const usb = CASCADE_USB[idCourt];
    const sources = [lct58('§ 3.1, p. 4')];
    let texte;
    if (cascade) {
      const max = evaluation.secoursProcesseur?.cascade?.max ?? null;
      texte = usb
        ? `Cascade : branche le PC à ${usb.entree} du ${modele} n° 1, puis ${usb.sortie} de chaque boîtier à ${usb.entree} du suivant, dans `
          + `l'ordre : ${enumeration(boitiers.map(nomBoitier))}${max ? ` (${max} boîtiers au plus)` : ''}.`
        : `Cascade de ${enumeration(boitiers.map(nomBoitier))} dans cet ordre ; liaison de cascade : vois la fiche du processeur, ${A_VERIFIER}.`;
      texte += ` View Details of Device : un seul port de communication, ${total} cartes d'envoi attendues. PC relié en Ethernet au `
        + `${modele} n° 1 : pilotage des autres boîtiers par la cascade, ${A_VERIFIER}.`;
      if (usb) sources.push(src(...usb.source));
    } else {
      const ethernet = CONTROLE_ETHERNET_NOVALCT.includes(proc.id);
      const adresses = enumeration(boitiers.map((k) => `${nomBoitier(k)} en 192.168.0.${9 + k}`));
      texte = ethernet
        ? `Une liaison par boîtier. En Ethernet : chaque ${modele} et l'ordinateur sur un switch réseau, câble entre le port `
          + `${controle.ethernet} de chaque boîtier et le switch ; donne à chaque boîtier, en façade, sa propre adresse : ${adresses} ; `
          + `l'ordinateur en 192.168.0.100, masque 255.255.255.0 (deux boîtiers neufs ont peut-être la même adresse : ${A_VERIFIER}).`
          + `${controle.reglage ? ` ${controle.reglage}` : ''} Ou un câble USB par boîtier.`
        : `Une liaison par boîtier (switch réseau, ou un câble USB chacun) ; liaison au PC : vois la fiche du processeur, ${A_VERIFIER}.`;
      texte += ` View Details of Device : ${total} ports de communication, un par boîtier.`;
      sources.push(...(ethernet ? [src('vx1000-1-5-0', '§ 4, p. 12'), src('cdc')] : []), src('daktronics-000020215'));
    }
    return etape('0.3', texte, [...sources, ...controle.sources.map((s) => src(s.id, s.ref))],
      { valeurs: { nb, secours: nbSecours, liaison: liaisonSecours }, aVerifier: true, connexion: { chemin: cheminIP(sys), autre: cheminIP(autreSysteme(sys)) } });
  }

  // Partie 0 : avant de partir et sur place.
  const fichiersTexte = cfg.aucunParc ? CHOISIS_PARC : [
    cfg.fichiers.length ? `${cfg.fichiers.join(', ')}` : 'le .rcfgx de chaque lot',
    ...(cfg.lxy.length ? [`multi-batch ${cfg.lxy.join(', ')}`] : []),
  ].join(' ; ');
  const partie0 = [
    etape('0.1', [
      mac ? ALERTE_NOVALCT : 'NovaLCT tourne sous Windows : prends un PC Windows avec NovaLCT.',
      mac && controle.web ? 'Dépannage sans Windows : sa page web, à vérifier.' : null,
      vcan ? `V-Can (Windows ou Mac) pour régler l'entrée du ${modele}.` : null,
      groupe.id === 'vx-pro' ? `VICP ou Unico pour le ${modele} : ${A_VERIFIER}.` : null,
      ver.note ?? `Noms des menus d'après les manuels V5.5.0 et V5.8.1, ceux de la V${ver.premiere} en premier.`,
    ].filter(Boolean).join(' '), [lct55('§ 1, p. 1'), ...(mac ? SOURCES_ALERTE_NOVALCT.map((s) => src(s.id, s.ref)) : []),
      ...(mac && controle.web ? controle.sources.map((s) => src(s.id, s.ref)) : []), ...(vcan ? [src('vcan-3-8-0', '§ 2.2, p. 2')] : [])],
    { valeurs: { premiere: ver.premiere, note: ver.note, groupe: groupe.id }, aVerifier: mac ? 'chez toi, avant ta première presta' : false }),
    etape('0.2', `Sur le PC de régie : ${fichiersTexte.replace(/\.$/, '')}.${cfg.alertes.length ? ` ${cfg.alertes.join(' ')}` : ''} `
      + 'Prends aussi le .scr ou le .scfg déjà faits pour ce mur, s\'il y en a.',
    [src('cdc'), lct55('§ 5.1, p. 6')], { valeurs: { fichiers: cfg.fichiers, lxy: cfg.lxy, aucunParc: cfg.aucunParc } }),
    avecSecours ? etapeConnexionSecours() : etape('0.3', `Branche le PC au ${modele} avec le câble de contrôle, en USB ou en Ethernet. View Details of Device donne `
      + `le port de communication et le nombre de cartes d'envoi vues : ${nb} attendue${nb > 1 ? 's' : ''} (${nb} × ${modele}).${texteControle}`,
    [lct55('§ 3, p. 3'), lct58('§ 3, p. 4'), lct58('§ 3.1, p. 4'), ...controle.sources.map((s) => src(s.id, s.ref))],
    { valeurs: { nb }, aVerifier: controle.inconnu || controle.aVerifier, connexion: { chemin: cheminIP(sys), autre: cheminIP(autreSysteme(sys)) } }),
    etape('0.4', `Mur allumé, tout en ligne : Settings > Hardware Information, Refresh All, puis Refresh, et note les versions du ${modele} `
      + 'et des cartes de réception (onglet Base, version du parc).',
    [lct55('§ 9.5, p. 116 et 117'), lct58('§ 9.5, p. 125 et 126'), src('cdc')]),
    etape('0.5', 'Menu User > Advanced Synchronous System User Login, mot de passe par défaut « admin ».'
      + `${codeParc ? ` Ton parc ${codeParc} a changé ce mot de passe : prends son code dans l'appli (onglet Base).` : ''} Sans processeur `
      + 'branché, User > Demonstration Login permet de s\'entraîner.',
    [lct55('§ 4, p. 5'), lct58('§ 4, p. 6'), src('formation-6')], { codeParc }),
    // Ordre corrigé (étape 22c, F1, F9, F15) : câbles principaux, config d'écran, câbles de secours, puis la redondance.
    ...(redondance ? [etape('0.6', 'Redondance : branche d\'abord le câble principal seul (les câbles principaux), fais la config d\'écran, '
      + 'puis branche les câbles de secours, et seulement ensuite la redondance (Set as Backup ou le tableau) : « Redundancy related '
      + 'hardware connection is done » avant de la régler. Tout brancher d\'un coup peut créer des conflits.'
      + `${!avecSecours ? '' : cascade
        ? ' Secours par un second processeur, méthode cascade (tableau) : boîtiers cascadés en USB, le secours sans config d\'écran, puis le '
          + 'tableau Redundancy. Méthode choisie dans Data (choix « Liaison ») : change-la dans Data.'
        : ' Secours par un second processeur, méthode sans cascade (Primary et Backup) : chaque boîtier relié à part à l\'ordinateur, '
          + 'avec sa propre config, réglé en principal ou en secours. Méthode choisie dans Data (choix « Liaison ») : change-la dans Data.'}`,
    [lct58('§ 5.3, p. 30'), src('daktronics-dd3397344'), src('formation-11'), src('formation-12'), src('cdc')],
    { valeurs: avecSecours ? { liaison: liaisonSecours } : {} })] : []),
  ];
  // Fibre (étape 18b) : les OPT que ce mur utilise, d'après les ports principaux et de secours du câblage retenu.
  // Config imposée en fibre (étape 18c3) : l'étape devient la vraie, avec le convertisseur et son nombre, pour tout
  // processeur (CVT10 des VX, paires de CVT310 : règle du cahier des charges).
  const fibre = FIBRES[idCourt];
  const fibreImposee = variante?.mode === 'imposee' && variante.fibre?.possible && !variante.fibre.deja ? variante.fibre : null;
  if (fibre || fibreImposee) {
    const parProc = !fibre ? [] : (variante?.processeurs ?? []).map((pv) => {
      const ports = pv.ports.flatMap((p) => [p.numero, ...(redondance && p.secours && !p.secours.processeur ? [p.secours.numero] : [])]);
      const opt = new Map();
      for (const n of ports) {
        const k = Math.ceil(n / fibre.parFibre);
        opt.set(k, [...(opt.get(k) ?? []), n]);
      }
      const liste = [...opt].sort(([a], [b]) => a - b).map(([k, l]) => `OPT${k} (${textePorts(l)})`);
      return `${nb > 1 ? `${modele} n° ${pv.numero} : ` : ''}${enumeration(liste)}`;
    });
    const detail = fibre ? `${fibre.texte}${parProc.length ? ` Pour ce mur : ${parProc.join(' ; ')}.` : ''}${fibre.convertisseur}` : '';
    partie0.push(fibreImposee
      ? etape('0.7', `Tu passes en fibre (ta config) : ${fibreImposee.texte.replace(/^Passer en fibre : /, '')}${detail ? ` ${detail}` : ''}`,
        [...(fibre ? fibre.sources.map(([id, ref]) => src(id, ref)) : []), src('cdc')],
        { titre: 'Fibre : ta config (imposée)', aVerifier: Boolean(fibre?.aVerifier || fibreImposee.aConfirmer),
          valeurs: { fibres: parProc, impose: [fibreImposee.designation, fibreImposee.convertisseurs] } })
      : etape('0.7', `Si tu passes en fibre : ${detail}`,
        fibre.sources.map(([id, ref]) => src(id, ref)), { aVerifier: fibre.aVerifier, valeurs: { fibres: parProc } }));
  }
  // Plusieurs MCTRL4K sur le même écran (étape 22c, F16) : genlock en cascade, secours compris.
  if (idCourt === 'mctrl4k' && total > 1) {
    partie0.push(etape('0.8', `${total} MCTRL4K${avecSecours ? ` (${nb} + ${nbSecours} de secours)` : ''} sur le même écran : pour qu'ils sortent `
      + 'l\'image en même temps (« Multiple MCTRL4K devices output image simultaneously »), relie-les en cascade par GENLOCK IN et '
      + 'GENLOCK LOOP, 10 au plus : un signal de synchronisation (Bi-level, Tri-level ou Blackburst) sur le GENLOCK IN du premier, '
      + 'puis le GENLOCK LOOP de chaque boîtier vers le GENLOCK IN du suivant.'
      + `${avecSecours ? ` Genlock commun nécessaire pour un basculement sans saut vers le secours : ${A_VERIFIER}.` : ''}`,
    [src('mctrl4k-manuel-1-2-1', 'p. 4 ; § 4, p. 6')], { valeurs: avecSecours ? { total, secours: nbSecours } : { total }, aVerifier: avecSecours }));
  }
  const parties = [{ id: '0', titre: 'Avant de partir et sur place', etapes: partie0 }];

  // Partie A : avant NovaLCT, pour les tout-en-un réglés dans V-Can.
  if (vcan) {
    const g0 = groupes[0];
    const mode = personnalisee ? 'Custom' : 'Standard';
    const facadeAVerifier = groupe.aVerifier ? ` Menus de façade relevés sur le VX1000 : ${A_VERIFIER}.` : '';
    const liaison = source?.liaison ?? null;
    const entree = nomEntree(liaison);
    const avantEntree = !entree ? '' : entreeReglable(liaison) ? `Entrée ${entree}. `
      : `Entrée ${entree} : pas de réglage de résolution sur cette entrée (« Only DVI, HDMI and DP connectors support input resolution `
        + `settings ») ; la source envoie directement ${dim(largeurSource, hauteurSource)} à ${nombre(freq)} Hz. Sur une entrée DVI, HDMI ou DP : `;
    const couche = plie(0) ? `de la sortie pliée (${taillePliee})` : `du bloc (${dim(g0.largeurPx, g0.hauteurPx)})`;
    parties.push({
      id: 'A',
      titre: `Avant NovaLCT : V-Can ou façade du ${modele}`,
      etapes: [
        etape('A.1', `${avantEntree}${avantEntree.endsWith(': ') ? 'entrée' : 'Entrée'} à ${dim(largeurSource, hauteurSource)} à ${nombre(freq)} Hz, en ${mode}`
          + `${personnalisee ? ' (résolution personnalisée, alerte EDID de l\'onglet Canvas)' : ''}. Dans V-Can : `
          + `Programming > Input > Input, choisis l'entrée, ${mode}, puis Apply. En façade : Input Settings, l'entrée, EDID, `
          + `mode ${mode}, ${personnalisee ? 'Width et Height, Frame Rate' : 'Resolution, Frame Rate, puis Apply'}.${facadeAVerifier}`,
        [src('vcan-3-8-0', '§ 3.1.1.1, p. 6 et 7'), src('vx1000-1-5-0', '§ 5.4.1, p. 26 à 28')],
        { valeurs: { l: largeurSource, h: hauteurSource, freq, mode, liaison }, aVerifier: groupe.aVerifier }),
        etape('A.2', 'Si la source arrive sur deux entrées du même type : V-Can, Programming > Input, Source « DVI MOSAIC » ; '
          + `en façade, Input Settings > MOSAIC, de 64 à 2048 px par zone. Sinon, passe cette étape.${pasCite('mosaic')}`,
        [src('vcan-3-8-0', '§ 3.1.1.3, p. 8'), src('vx1000-1-5-0', '§ 5.4.6, p. 30')], { aVerifier: !cite('mosaic') }),
        etape('A.3', `Couche principale à la taille ${couche}, en haut à gauche, puis `
          + `un preset (V-Can : Save Preset ; façade : Preset Settings, Save). Ordre exact : ${A_VERIFIER}.`,
        [src('vcan-3-8-0', '§ 3.1.6 et § 3.1.15.1, p. 21, 22, 38 et 39'), src('vx1000-1-5-0', '§ 5.5.1, p. 31')],
        { valeurs: { couche }, aVerifier: true }),
        etape('A.4', 'Plage : RGB Full conseillé. Source en Limited : active la conversion « limited to full » '
          + `(V-Can : Programming > Input, réglages avancés, chemin exact dans V-Can : ${A_VERIFIER} ; façade : Color Range sur On).${pasCite('limited')}`,
        [src('vcan-3-8-0', '§ 3.1.1.6, p. 11 et 12'), src('vx1000-1-5-0', '§ 5.4.5, p. 29')], { aVerifier: !cite('limited') }),
        etape('A.5', 'Réglages finis : sauvegarde du boîtier dans V-Can, System > Backup, Export (fichier .img) ; '
          + `System > Restore le recharge.${pasCite('sauvegarde')}`,
        [src('vx1000-1-5-0', '§ 7, p. 56 et 57'), src('vcan-3-8-0', '§ 3.3.5 et § 3.3.6, p. 55 et 56')],
        { valeurs: { l: largeurSource, h: hauteurSource, freq, couche }, aVerifier: !cite('sauvegarde') }),
        // Plusieurs processeurs sur le même écran : même source de synchronisation (VX1000 § 5.8.4).
        // Secours compris (étape 22c) : « 1 × VX1000 + 1 de secours ».
        ...(total > 1 ? [etape('A.6', `${titreProcesseurs} sur le même écran : la même source de synchronisation sur chacun. En façade : `
          + `Advanced Settings > Synchronization, Status sur On, puis Source.${vx1000 ? '' : ` Menus relevés sur le VX1000 : ${A_VERIFIER}.`}`,
        [src('vx1000-1-5-0', '§ 5.8.4, p. 40 et 41')], { valeurs: nbSecours ? { nb, secours: nbSecours } : { nb }, aVerifier: !vx1000 })] : []),
      ],
    });
  }

  // Partie B : NovaLCT, un parcours par processeur.
  const pxDalle = dim(dalle.pxH, dalle.pxV);
  const pxDemi = demi ? dim(demi.pxH, demi.pxV) : null;
  // Un parcours de Screen Configuration : celui du processeur n, ou (`sec`) celui de son processeur de secours sans
  // cascade (étape 22c, spec § 4.2.5) : mêmes réglages, chaque port en sens inversé depuis la dernière dalle du principal.
  const parcours = (g, i, sec = null) => {
    const n = i + 1;
    const numero = sec ? n + nb : n;
    const pre = `P${numero}.`;
    const ports = variante?.processeurs?.[i]?.ports ?? [];
    const etapes = [];
    const sourcesB1 = [lct55('§ 5.2.1, p. 8 et 9'), lct58('§ 5.2.1, p. 9'), ...(total > 1 ? [lct58('§ 3.1 et § 3.2, p. 4')] : [])];
    if (sec) {
      etapes.push(etape(`${pre}B.1`, `Settings > Screen Configuration, choisis le port de communication du ${nomBoitier(numero)} (son adresse IP, ou son `
        + `USB), Configure Screen, puis Next. Mêmes réglages que le ${modele} n° ${n}, sauf le chemin de chaque port, inversé (étapes B.7).`,
      sourcesB1, { valeurs: { n: numero } }));
    } else if (cascade) {
      etapes.push(etape(`${pre}B.1`, `Settings > Screen Configuration, choisis le port de communication de la cascade (un seul port de communication `
        + `avec les cartes d'envoi 1 à ${total}), puis la carte d'envoi ${n} (${modele} n° ${n}), Configure Screen, puis Next.`,
      sourcesB1, { valeurs: { n } }));
    } else {
      etapes.push(etape(`${pre}B.1`, `Settings > Screen Configuration, choisis le port de communication du ${modele} n° ${n}`
        + `${total > 1 ? ' (chaque boîtier relié en réseau ou en USB séparé est un port de communication à part ; en cascade, un seul port de '
          + 'communication avec les cartes d\'envoi 1, 2…)' : ''}, Configure Screen, puis Next.`,
      sourcesB1, { valeurs: { n } }));
    }
    if (idCourt in MODE_TRAVAIL) {
      const fiche = MODE_TRAVAIL[idCourt];
      etapes.push(etape(`${pre}B.1a`, `Onglet Sending Card : Set Working Mode, choisis le ${modele}, puis sending card mode (et non fiber `
        + 'converter mode), OK.'
        + `${MODE_OPTIQUE.includes(idCourt) ? ' Puis le mode de ses ports optiques : hot backup (la même image vers le même écran, par un '
          + 'convertisseur principal et un de secours) ou copy (la même image vers deux écrans).' : ''}`,
      [lct55('§ 5.5, p. 30 à 33'), lct58('§ 5.5, p. 33 à 36'), ...(fiche ? [src(...fiche)] : [])]));
    }

    const bloc = plie(i) ? `sortie pliée : ${taillePliee}` : `bloc du processeur : ${dim(g.largeurPx, g.hauteurPx)}, en haut à gauche`;
    // Fréquence de la source de Canvas différente de celle de Data (relecture, doute 22) : les deux sont dites.
    const ecartFrequence = source?.frequenceHz && source.frequenceHz !== freq
      ? ` Attention : la source de l'onglet Canvas est à ${nombre(source.frequenceHz)} Hz, Data à ${nombre(freq)} Hz.` : '';
    if (groupe.id === 'carte-envoi' || ENTREE_SENDING_CARD.includes(idCourt)) {
      const conseilBits = bits > 8 ? ` Le manuel conseille 8 bits (« The recommended input source bit depth is 8 bit ») ; Data règle ${bits} bits.` : '';
      etapes.push(etape(`${pre}B.2`, 'Onglet Sending Card : Automatic Selection, ou choisis l\'entrée, puis Send. Dans Source '
        + `Configuration : résolution ${dim(largeurSource, hauteurSource)}${personnalisee ? ' en résolution personnalisée' : ''} `
        + `(source conseillée de l'onglet Canvas ; ${bloc}), Refresh Rate ${nombre(freq)} Hz, Bit Depth ${bits} bits ; `
        + `puis Set, Refresh et Save.${conseilBits}${ecartFrequence}`,
      [lct55('§ 5.2.1, p. 9 et 10'), lct58('§ 5.2.1, p. 10')],
      { valeurs: { l: largeurSource, h: hauteurSource, freq, bits } }));
    } else {
      const ou = vcan ? 'dans V-Can ou en façade (étape A.1)' : groupe.id === 'vx-pro' ? 'dans VICP ou Unico' : 'en façade ou dans son logiciel';
      // Fréquence de sortie vers les dalles (relecture point 1) : 60 Hz par défaut sur le VX1000 (§ 5.2.7, p. 21).
      const sortie = vcan ? ` Fréquence de sortie vers les dalles : ${nombre(freq)} Hz (60 Hz par défaut) ; en façade, Screen Configuration > `
        + `More Settings > Output Frame Rate${vx1000 ? '' : ` (relevé sur le VX1000, ${A_VERIFIER})`}.` : '';
      etapes.push(etape(`${pre}B.2`, `L'entrée du ${modele} se règle ${ou} : ${dim(largeurSource, hauteurSource)} à ${nombre(freq)} Hz, `
        + `${bits} bits (${bloc}).${sortie}${ecartFrequence} Ce que l'onglet Sending Card de NovaLCT montre pour ce processeur : ${A_VERIFIER}.`,
      vcan ? [src('vcan-3-8-0', '§ 3.1.1.1, p. 6'), src('vx1000-1-5-0', '§ 5.2.7, p. 21')] : groupe.sources,
      { valeurs: { l: largeurSource, h: hauteurSource, freq, bits }, aVerifier: true }));
    }

    if (SECOURS_SOURCE.includes(idCourt)) {
      const r5 = idCourt === 'mctrl-r5';
      etapes.push(etape(`${pre}B.2a`, 'Facultatif : onglet Sending Card, Set à côté de Source Backup Setting, coche Start source backup, '
        + 'choisis l\'entrée de secours de chaque entrée principale, puis OK. Sinon, passe cette étape.'
        + `${r5 ? ' En façade du MCTRL R5 : Input Backup, une entrée de secours pour chaque entrée principale ; une fois le secours en '
          + 'service, le choix de la source ne revient pas en arrière (« the video source selection is irreversible »).' : ''}`,
      [lct55('§ 5.2.1, p. 9 et 10'), lct58('§ 5.2.1, p. 9'), ...(r5 ? [src('mctrl-r5-manuel-1-0-5', '§ 6.6.7, p. 14')] : [])]));
    }

    const fichierLot = cfg.aucunParc ? `le .rcfgx du lot (${CHOISIS_PARC})` : cfg.fichiers.length ? cfg.fichiers.join(', ') : 'le .rcfgx du lot';
    const alertesLot = cfg.alertes.length ? ` ${cfg.alertes.join(' ')}` : '';
    const perso = cfg.perso ? ' Ce lot a un firmware personnalisé : ne lance pas la mise à jour en ligne des cartes, elle le '
      + 'remplacerait par un firmware standard (rappel N6).' : '';
    // Plusieurs fichiers, ou une rangée de demi-dalles (sa propre fiche) : un fichier à la fois, sur ses seules cartes
    // (relecture point 2 ; formation, transcription 12) ; All Receiving Card enverrait le même fichier à toutes.
    const specifier = cfg.noms.length > 1 || Boolean(demi);
    const pasReset = ' Dans la fenêtre d\'envoi, ne coche pas Reset the Starting Coordinate of Receiving Card : toutes les cartes '
      + 'afficheraient le coin haut gauche de la source.';
    const envoi = specifier
      ? `${nom('envoyerCartes')}, Specify Receiving Card (par topologie ou par adresse physique) : choisis les seules cartes des dalles `
        + `de ce fichier${demi ? ' (la rangée de demi-dalles a sa propre fiche, donc son propre fichier)' : ''}, puis Send ; recommence `
        + 'pour chaque fichier. All Receiving Card enverrait le même fichier à toutes les cartes de la carte d\'envoi.'
      : `${nom('envoyerCartes')}, All Receiving Card.`;
    if (parNCP(dalle)) {
      etapes.push(etape(`${pre}B.3`, `Carte ${dalle.carteReceptionModele} : onglet Receiving Card, NCP Management, Load NCP, `
        + 'choisis le .ncp du lot, Send NCP, All Receiving Card, Send, puis Save to HW. Si la dalle a plusieurs modes d\'affichage : '
        + `choisis le mode, puis Send Mode Parameters.${alertesLot}${perso}`,
      [lct58('§ 5.2.2.2, p. 21 et 22')], { valeurs: { ncp: true, fichiers: cfg.fichiers } }));
    } else {
      etapes.push(etape(`${pre}B.3`, `Onglet Receiving Card : ${nom('charger')}, ${specifier ? 'un fichier à la fois : ' : 'choisis '}${fichierLot}. `
        + `Puis ${envoi} Envoie le fichier sans modifier aucun paramètre : il garde ses réglages `
        + `d'origine (rappel N3) ; note la version de NovaLCT qui l'a créé (rappel N4).${pasReset}${alertesLot}${perso}`,
      [lct55('§ 5.2.2.1, p. 11'), lct58('§ 5.2.2.1, p. 10 et 20'), src('notes-lct-5-8-1', cfg.perso ? '§ 2.2, § 4.1.1 et § 5.1' : '§ 2.2 et § 5.1'),
        ...(specifier ? [src('formation-12')] : [])],
      { valeurs: { ncp: false, fichiers: cfg.fichiers, aucunParc: cfg.aucunParc, specifier } }));
    }

    etapes.push(etape(`${pre}B.4`, `Cabinet Information : Regular, ${pxDalle} px, les pixels de la fiche ${dalle.nom}`
      + `${demi ? ` ; rangée de demi-dalles : ${pxDemi} px (fiche ${demi.nom})` : ''}. NovaLCT propose 128 × 128 par défaut : `
      + `vérifie que le fichier chargé donne bien ${pxDalle}. Une carte par dalle : « Generally, one receiving card loads one cabinet ».`
      + `${dalle.orientation === 'tournee' ? ` Dalles tournées : Set Rotation, ${A_VERIFIER}.` : ''}`,
    [lct55('§ 5.2.2.2.2, p. 18'), lct55('§ 5.2.3, p. 20'), src('formation-6'), src('cdc')],
    { valeurs: { px: pxDalle, demi: pxDemi }, aVerifier: dalle.orientation === 'tournee' }));

    etapes.push(etape(`${pre}B.5`, 'Performance Settings : ne touche à rien, les modules peuvent être abîmés. Seule exception '
      + 'du manuel : après un changement de Refresh Rate dans Sending Card, renvoie tels quels les paramètres de performance de '
      + 'l\'onglet Receiving Card, sans les modifier.',
    [src('formation-6'), src('cdc'), lct55('§ 5.2.1, p. 9')]));

    if (nonCouvert.length) {
      etapes.push(etape(`${pre}B.6`, `${nonCouvert.join(' ')} Dans NovaLCT : Complex Screen, et Set Blank pour les places vides `
        + '(conseil du manuel : configurer d\'abord un écran standard). Les ports de l\'onglet Data et du Schéma restent justes.',
      [lct55('§ 5.2.3, p. 22 et 23')], { aVerifier: true, alerte: alerteVariante, valeurs: { nonCouvert } }));
    } else {
      const zone = nb > 1 ? `, les cartes C${g.premiereColonne} à C${g.derniereColonne}, R${g.premiereRangee} à R${g.derniereRangee} du mur` : '';
      const tranches = plie(i) ? pliage.blocs[i].tranches : [];
      if (tranches.length) {
        // Sortie pliée (relecture point 4) : un écran par tranche, réglage de l'appli à confirmer.
        etapes.push(etape(`${pre}B.6`, `Sortie pliée dans ${taillePliee} (onglet Canvas) : ${tranches.length} tranches, donc nombre d'écrans `
          + `${tranches.length} dans Screen Connection, un écran par tranche avec sa grille : ${tranches.map((t) => `${t.nom}, `
            + `${t.colonnes[1] - t.colonnes[0] + 1} colonnes × ${g.rangees} rangées (C${t.colonnes[0]} à C${t.colonnes[1]} du mur)`).join(' ; ')}. `
          + `Un écran par tranche est le réglage retenu par l'appli : ${A_VERIFIER}.`,
        [lct55('§ 5.2.3, p. 20 et 21'), lct58('§ 5.2.3, p. 24')],
        { aVerifier: true, alerte: alerteVariante, valeurs: { tranches: tranches.map((t) => [t.nom, ...t.colonnes]), rangees: g.rangees } }));
      } else {
        // Série H (étape 18b) : les cartes de sortie de Data ; leurs ports dans Screen Connection ne sont pas décrits par les sources lues.
        const carte = proc.carteSortie;
        const nCartes = carte ? g.cartesSortie?.[portsDoubles(evaluation) ? 'redondance' : 'colonnes'] ?? null : null;
        const cartes = carte ? ` Cartes de sortie : ${nCartes ? `${nCartes} carte${nCartes > 1 ? 's' : ''}` : 'cartes'} ${carte.nomCourt ?? carte.modele} `
          + `(onglet Data) ; quels ports sont sur quelle carte dans Screen Connection : ${A_VERIFIER}.` : '';
        etapes.push(etape(`${pre}B.6`, `Onglet Screen Connection : nombre d'écrans 1 (les ports du ${modele} chargent le même écran), `
          + `Configure. Standard Screen : ${g.colonnes} colonnes × ${g.rangees} rangées de cartes${zone}.${cartes}`,
        [lct55('§ 5.2.3, p. 20 et 21'), lct58('§ 5.2.3, p. 24')],
        { alerte: alerteVariante, aVerifier: Boolean(carte), valeurs: { colonnes: g.colonnes, rangees: g.rangees, c: g.premiereColonne, r: g.premiereRangee, cartes: nCartes } }));
      }

      for (const port of ports) {
        // Secours sans cascade : le même port, parcouru depuis sa dernière dalle.
        const dalles = sec ? [...port.dalles].reverse() : port.dalles;
        const cases = dalles.map(position).filter(Boolean)
          .map((p) => ({ ...p, c: p.c - g.premiereColonne + 1, r: p.r - g.premiereRangee + 1, demi: m.rangees?.[p.r - 1] === 'demi' }));
        const demis = cases.filter((p) => p.demi);
        const rangeeDemi = demis[0]?.r;
        const detail = demis.length
          ? `${cases.length} cartes : ${cases.length - demis.length} de ${pxDalle} et ${demis.length} de ${pxDemi} (demi-dalles, rangée ${rangeeDemi})`
          : `${cases.length} cartes de ${pxDalle}`;
        const premiere = cases[0];
        const secours = sec || !redondance || !port.secours ? ''
          : port.secours.processeur ? ` Secours : ${texteSecoursPort(port.secours, modele)} (sa partie, après les principaux).`
            : ` Secours : ${port.secours.libelle} (étape B.11).`;
        const depart = sec ? `Départ sur ${dalles[0]} (dernière dalle du ${port.libelle} du ${modele} n° ${n}, carte colonne ${premiere.c}, rangée `
          + `${premiere.r} de l'écran), chemin inversé : ${sensDuCable(cases)}.`
          : `Départ sur ${port.dalles[0]} (carte colonne ${premiere.c}, rangée ${premiere.r} de l'écran), puis : ${sensDuCable(cases)}.`;
        etapes.push(etape(`${pre}B.7.${port.numero}`, `${detail}, ${placeDuPort(cases, g)}. ${depart} Dans NovaLCT : `
          + `choisis le ${port.libelle}. Taille de carte : Screen Connection affiche 128 × 128 par défaut, même après l'envoi du `
          + `.rcfgx ; tape ${pxDalle} avant de cliquer les cartes. Puis clique les cartes dans cet ordre (ou une connexion rapide `
          + `qui suit le même chemin).${demis.length ? ` Rangée ${rangeeDemi} : règle la hauteur à ${demi.pxV} px, puis Apply to Entire Row.` : ''} `
          + `Charge : ${nombre(port.px)} px, ${pourcent(port.taux)} de la capacité de Data (${nombre(evaluation.capacite)} px).${secours}`
          + ' Dessin et Screen Connection en vue de face, côté public : derrière le mur, la gauche et la droite sont inversées.'
          + `${plie(i) ? ` Sortie pliée : colonnes comptées dans le bloc entier ; dans NovaLCT, celles de la tranche du port (${A_VERIFIER}).` : ''}`,
        [lct55('§ 5.2.3, p. 21'), lct58('§ 5.2.3, p. 24 et 25'), src('formation-6'), src('formation-11'),
          ...(sec ? [src('vx1000-1-5-0', '§ 5.8.1, p. 36'), src('mctrl-r5-manuel-1-0-5', '§ 6.6.5, p. 14')] : [])],
        { titre: majuscule(port.libelle), aVerifier: plie(i) || Boolean(sec && !SENS_SECOURS_SOURCE.includes(idCourt)),
          valeurs: { port: port.libelle, dalles, px: pxDalle, demi: pxDemi, plie: plie(i), ...(sec ? { inverse: true } : {}) } }));
      }

      const audela = ports.filter((p) => p.px > SEUIL_AVERTISSEMENT);
      let alerte = null;
      if (audela.length) {
        const memes = audela.every((p) => p.px === audela[0].px);
        const noms = audela.map((p) => p.libelle.replace(/^port /, ''));
        const liste = memes
          ? `${audela.length > 1 ? `ports ${enumeration(noms)}` : audela[0].libelle} à ${nombre(audela[0].px)} px`
          : enumeration(audela.map((p) => `${p.libelle} à ${nombre(p.px)} px`));
        alerte = `NovaLCT avertira : ${liste}, au-delà des ${nombre(SEUIL_AVERTISSEMENT)} px qu'il compte par défaut. Message attendu`
          + `${vcan ? ' après le réglage de la fréquence de sortie (étape B.2)' : ''} ; `
          + `la capacité retenue reste celle de Data (${nombre(evaluation.capacite)} px à ${nombre(freq)} Hz).`;
      }
      etapes.push(etape(`${pre}B.8`, `En V5.8.1, Port Capacity montre la charge de chaque port. NovaLCT compte ${nombre(SEUIL_AVERTISSEMENT)} px `
        + 'par port par défaut et avertit au-delà, même quand la fréquence permet plus. Capacité retenue par l\'appli à '
        + `${nombre(freq)} Hz en ${bits} bits : ${nombre(evaluation.capacite)} px par port (onglet Data).`,
      [lct58('§ 5.2.3, p. 25'), src('formation-11')], { alerte, valeurs: { audela: audela.map((p) => [p.libelle, p.px]), capacite: evaluation.capacite } }));

      etapes.push(etape(`${pre}B.9`, tranches.length
        ? `Sortie pliée dans ${taillePliee}, un écran par tranche à sa place dans la sortie : ${tranches.map((t) => `${t.nom} : Coordinate (${t.sortie.x}, ${t.sortie.y})`).join(' ; ')}. `
          + `Réglage par tranche : ${A_VERIFIER}.`
        : `Coordinate : (0, 0), le bloc du ${nomBoitier(numero)} en haut à gauche de sa source.`,
      [lct55('§ 5.2.3, p. 24'), lct58('§ 5.2.3, p. 28')],
      { aVerifier: tranches.length > 0, valeurs: { plie: plie(i), tranches: tranches.map((t) => [t.nom, t.sortie.x, t.sortie.y]) } }));
    }

    etapes.push(etape(`${pre}B.10`, 'Send to HW, puis Save pour enregistrer dans le matériel. En V5.8.1, après Send to HW, NovaLCT '
      + 'propose de lier l\'écran à VNNOX Care (Bind, avec un compte). Save to File garde la connexion de l\'écran (.scr) : range-la '
      + 'dans un dossier au nom de la presta. Save System Configuration File (.scfg) : pour un écran en ligne, le manuel demande un '
      + `compte VNNOX Care (enregistrement sur le cloud et le PC) ; pour un écran hors ligne, un emplacement sur le PC. Sans compte, sur un écran en ligne : ${A_VERIFIER}. `
      + 'Joins le .scr ou le .scfg au lot dans l\'onglet Base (autre fichier).',
    [lct55('§ 5.2.3, p. 23'), lct55('§ 5.2.4, p. 25 et 26'), lct58('§ 5.2.3, p. 27'), lct58('§ 5.2.4, p. 28 à 30'), src('formation-11')],
    { valeurs: { grille: [g.colonnes, g.rangees, g.premiereColonne, g.premiereRangee], ports: ports.map((p) => [p.libelle, p.dalles]), plie: plie(i) } }));

    if (sec) {
      // Secours sans cascade (spec § 4.2.6) : en façade sur un modèle qui a ce menu ; dans NovaLCT, la carte qui a une
      // config d'écran est refusée en secours (F3) : à vérifier, comme Daktronics le fait.
      const refus = '« The sending card that is used in the completed screen configuration cannot be set as backup device »';
      etapes.push(facade
        ? etape(`${pre}S.3`, `En façade du ${nomBoitier(numero)} : ${facade.menu}, ${facade.secours}`
          + `${facade.marque ? ' ; une petite marque apparaît sur l\'icône de ses ports' : ''}. Dans NovaLCT (onglet Sending Card, Set as Backup), `
          + `comme le fait Daktronics, le manuel refuse une carte qui a une config d'écran (${refus}) : ${A_VERIFIER}.`,
        [src(...facade.source), lct58('§ 5.3, p. 31'), src('daktronics-000020215')], { aVerifier: Boolean(facade.aVerifier), valeurs: { n: numero } })
        : etape(`${pre}S.3`, `Pas de menu de façade connu pour le ${modele} : onglet Sending Card, Set as Backup (« Set a single device »), puis Send, `
          + `comme le fait Daktronics ; le manuel refuse pourtant une carte qui a une config d'écran (${refus}) : ${A_VERIFIER}.`,
        [lct58('§ 5.3, p. 31'), src('daktronics-000020215')], { aVerifier: true, valeurs: { n: numero } }));
    } else if (avecSecours && !cascade) {
      // Principal sans cascade (spec § 4.2.3) : réglé en principal, sans tableau.
      etapes.push(etape(`${pre}B.11`, `Règle le ${modele} n° ${n} en principal : ${facade ? `en façade, ${facade.menu}, ${facade.principal} ; ` : ''}`
        + 'ou dans NovaLCT, onglet Sending Card, Set as Primary (« Set a single device »), puis Send. Pas de tableau Redundancy : '
        + 'chaque boîtier a sa propre config (méthode sans cascade).',
      [...(facade ? [src(...facade.source)] : []), lct58('§ 5.3, p. 31'), src('daktronics-000020215')],
      { titre: 'Réglé en principal (Primary)', aVerifier: Boolean(facade?.aVerifier), valeurs: { n, liaison: 'sansCascade' } }));
    } else if (redondance && !avecSecours) {
      const doubles = ports.filter((p) => p.secours);
      const paires = doubles.map((p) => `${p.libelle}, secours ${p.secours.libelle}`);
      // Le petit tableau de la fenêtre Redundancy Settings (étape 17b3) : une ligne par port, même numéro de carte d'envoi
      // pour un secours dans le même processeur (« enter the same value for serial numbers », manuel V5.5.0 § 5.3).
      // Câbles de secours branchés avant le tableau (étape 22c, F1 : « hardware connection is done »).
      const tableau = {
        colonnes: ['Carte d\'envoi principale', 'Port principal', 'Carte d\'envoi de secours', 'Port de secours'],
        lignes: doubles.map((p) => [1, p.numero, 1, p.secours.numero]),
      };
      etapes.push(etape(`${pre}B.11`, 'Branche d\'abord les câbles de secours (étape 0.6) : « Redundancy related hardware connection is done » '
        + 'avant la redondance. Onglet Sending Card, Redundancy, Add : remplis le tableau ci-dessous, une ligne par port, Add à chaque ligne, '
        + `puis Close, puis Send ou Save. Secours dans le même ${modele} : le même numéro de carte d'envoi, 1, en principal `
        + `et en secours (« enter the same value for serial numbers ») ; ports : ${paires.join(' ; ')}. Ports de secours : convention `
        + `par défaut de l'appli (Schéma), à régler dans le logiciel.${siAddGrise}`,
      [lct55('§ 5.3, p. 27 et 28'), lct58('§ 5.3, p. 30 à 32'), ...(vx1000 ? [src('vx1000-1-5-0', '§ 5.8.1, p. 37')] : []), src('formation-11'), src('formation-12'),
        ...sourcesAddGrise],
      { valeurs: { paires }, tableau }));
    }
    return etapes;
  };

  // Câbles de secours du processeur de secours n + N (spec § 4.1.6 et § 4.2.4) : après la config d'écran du principal.
  const cablesSecours = (n, numero, ports) => etape(`P${numero}.S.1`, `Câbles principaux branchés et config d'écran du ${modele} n° ${n} envoyée : `
    + `branche maintenant les câbles de secours du ${nomBoitier(numero)} : ${ports.map((p) => `port ${p.secours?.numero ?? p.numero} sur ${p.dalles.at(-1)}`).join(', ')} `
    + `(la dernière dalle de chaque port du ${modele} n° ${n}). « Redundancy related hardware connection is done » avant la redondance.`,
  [lct58('§ 5.3, p. 30'), src('daktronics-dd3397344'), src('formation-11')],
  { valeurs: { ports: ports.map((p) => [p.secours?.numero ?? p.numero, p.dalles.at(-1)]) } });

  // Méthode cascade (spec § 4.1.5 à 4.1.8) : pas de config d'écran sur le secours, Set as Backup, puis le tableau.
  const parcoursCascade = (n, numero, ports) => {
    const tableau = {
      colonnes: ['Carte d\'envoi principale', 'Port principal', 'Carte d\'envoi de secours', 'Port de secours'],
      lignes: ports.filter((p) => p.secours).map((p) => [n, p.numero, numero, p.secours.numero]),
    };
    return [
      cablesSecours(n, numero, ports),
      etape(`P${numero}.S.2`, `Ne configure pas la carte d'envoi ${numero} (${nomBoitier(numero)}) dans Screen Configuration : « The sending card `
        + 'that is used in the completed screen configuration cannot be set as backup device ». Si elle a déjà une config d\'écran, efface-la '
        + 'd\'abord. Pas de chemin à dessiner : le secours prend la suite des cartes après la coupure (« take over the sending cards behind the '
        + `disconnection point »), dans l'ordre que connaît le ${modele} n° ${n}.`,
      [lct55('§ 5.3, p. 27'), lct58('§ 5.3, p. 31'), src('lct-5-0-0', '§ 5.1.7, p. 34 et 36')], { valeurs: { n: numero } }),
      etape(`P${numero}.S.3`, `Onglet Sending Card, zone Redundancy : Set (« Set multiple devices »), Set as Backup, coche la carte d'envoi ${numero} `
        + `(${nomBoitier(numero)}), puis Set.`,
      [lct58('§ 5.3, p. 31')], { valeurs: { n: numero } }),
      etape(`P${numero}.B.11`, 'Onglet Sending Card, Redundancy, Add : remplis le tableau ci-dessous, une ligne par port, Add à chaque ligne, puis '
        + 'Close, puis Send ou Save. Numéros des cartes d\'envoi dans la cascade (« enter the actual serial numbers of the primary and backup '
        + `sending cards after they are cascaded ») : ${n} pour le ${modele} n° ${n}, ${numero} pour son secours.${siAddGrise}`,
      [lct55('§ 5.3, p. 27 et 28'), lct58('§ 5.3, p. 32'), src('daktronics-000020215'), ...sourcesAddGrise],
      { titre: 'Tableau Redundancy', valeurs: { lignes: tableau.lignes }, tableau }),
    ];
  };

  groupes.forEach((g, i) => {
    const n = i + 1;
    parties.push({
      id: `P${n}`, titre: `NovaLCT, ${modele} n° ${n}`, processeur: n, etapes: parcours(g, i),
      note: redondance ? null : 'Redondance non cochée dans Data : pas de port de secours à régler. Si tu câbles des retours de secours, '
        + 'coche « Redondance » dans Data : l\'étape B.11 te donnera le tableau à remplir.',
    });
  });
  // Une partie par processeur de secours, après les principaux (spec § 6).
  if (avecSecours) {
    groupes.forEach((g, i) => {
      const n = i + 1;
      const numero = n + nb;
      const ports = variante?.processeurs?.[i]?.ports ?? [];
      parties.push({
        id: `P${numero}`, titre: `NovaLCT, ${nomBoitier(numero)}`, processeur: numero, secours: { principal: n, liaison: liaisonSecours },
        etapes: cascade ? parcoursCascade(n, numero, ports) : [cablesSecours(n, numero, ports), ...parcours(g, i, true)],
        note: cascade ? null : 'Sens du chemin du secours : inversé d\'après Novastar (manuels VX1000 et MCTRL R5) ; Daktronics et la formation '
          + 'parlent aussi d\'une config identique : à vérifier sur ton modèle. Si les dalles d\'un port s\'inversent au basculement, prends '
          + 'l\'autre sens. Si tu as un câble de cascade, la méthode cascade est celle de Novastar.',
      });
    });
  }

  // Partie C : contrôles.
  const attendus = (variante?.processeurs ?? []).map((pv) => `${modele} n° ${pv.numero} : ${pv.ports.map((p) => `${p.libelle} : ${p.dalles.length}`).join(', ')}`);
  const controles = [
    etape('C.1', `Screen Connection, Read the Number of Receiving Cards, port par port. Attendu : ${attendus.join(' ; ')}.`,
      [lct55('§ 5.2.3, p. 24'), lct58('§ 5.2.3, p. 28')], { valeurs: { attendus } }),
    etape('C.2', `Enable Mapping : chaque carte affiche son numéro sur le mur ; compare avec le Schéma.${vx1000
      ? ' En façade du VX1000 : Screen Configuration > More Settings > Mapping (« P:05 » numéro du port, « #001 » numéro de la carte).' : ''}`,
    [lct55('§ 5.2.3, p. 24'), ...(vx1000 ? [src('vx1000-1-5-0', '§ 5.2.5, p. 19 et 20')] : [])], { valeurs: { attendus } }),
    etape('C.3', 'Mire : Tools > Screen Control, choisis une mire puis Send (Black Out, Freeze ou Normal pour l\'affichage) ; '
      + 'en V5.8.1, aussi Test Pattern dans Screen Connection.',
    [lct55('§ 8.6, p. 100 et 101'), lct58('§ 5.2.3, p. 28')]),
    etape('C.4', 'Après l\'envoi du .rcfgx, la luminosité peut revenir à 100 % ou à 60 % : vérifie-la dans Settings > Brightness, '
      + 'Manual Adjustment, puis Save to HW.',
    [src('cdc'), lct55('§ 6.2.1, p. 50 et 51')]),
  ];
  // Test de la redondance (spec § 4.3, étape 22c) : Verify seulement en cascade ou dans un même boîtier (après le tableau,
  // F11), Ethernet Port Backup Test en façade du VX1000, puis le vrai test et le symptôme des dalles inversées.
  if (redondance) {
    const verify = VERIFY.includes(idCourt);
    const texteVerify = 'Sending Card, Redundancy, Verify : Enable Hot Backup Verification ; si l\'image reste normale, '
      + 'les ports de secours marchent. Puis Disable Hot Backup Verification.';
    const sourcesVerify = [lct55('§ 5.3, p. 28'), lct58('§ 5.3, p. 32')];
    if (!avecSecours) {
      const vrai = ' Puis le vrai test : débranche le câble principal d\'un port : l\'image doit tenir ; rebranche-le.';
      if (verify) {
        controles.push(etape('C.5', `${texteVerify}${vrai}`, [lct55('§ 5.3, p. 28'), src('vx1000-1-5-0', '§ 5.8.1, p. 36')]));
      } else if (vx1000) {
        controles.push(etape('C.5', `En façade : Advanced Settings > Ethernet Port Backup Test, Disable Primary : l'image doit rester ; puis Enable All.${vrai}`,
          [src('vx1000-1-5-0', '§ 5.8.2, p. 38 et 39'), src('vx1000-1-5-0', '§ 5.8.1, p. 36')]));
      } else {
        controles.push(etape('C.5', `Test de la redondance sur le ${modele} : Verify n'existe que sur MCTRL4K, MCTRL R5 et KT8 ; `
          + `méthode ${A_VERIFIER}.${vrai}`, [lct55('§ 5.3, p. 26'), src('vx1000-1-5-0', '§ 5.8.1, p. 36')], { aVerifier: true }));
      }
    } else {
      const morceaux = ['En attente, rien ne change à l\'écran : c\'est normal.'];
      const sources = [];
      if (cascade && verify) {
        morceaux.push(texteVerify);
        sources.push(...sourcesVerify);
      } else if (cascade && !vx1000) {
        morceaux.push('Verify n\'existe que sur MCTRL4K, MCTRL R5 et KT8.');
        sources.push(lct55('§ 5.3, p. 26'));
      }
      if (vx1000) {
        morceaux.push(`En façade du ${modele} n° 1 : Advanced Settings > Ethernet Port Backup Test, ${cascade ? 'Disable Primary' : 'Disable All'} : `
          + 'l\'image doit rester ; puis Enable All.');
        sources.push(src('vx1000-1-5-0', '§ 5.8.2, p. 38 et 39'));
      }
      morceaux.push('Puis le vrai test : débranche les câbles de sortie du principal, ou coupe son alimentation : l\'image doit tenir'
        + `${facade?.marque ? ', avec une marque qui clignote (une fois par seconde) sur les icônes des ports du secours' : ''}. Rebranche : `
        + `tout doit revenir. Couper seulement l'entrée vidéo ne fait sans doute pas basculer : ${A_VERIFIER}.`);
      sources.push(src('vx1000-1-5-0', '§ 5.8.1, p. 35'), ...(facade?.marque ? [src(...facade.source)] : []));
      morceaux.push(cascade
        ? 'Si les dalles d\'un port s\'inversent quand le secours prend le relais : le secours a sa propre config d\'écran, ou le tableau n\'est '
          + 'pas envoyé (étapes S.2 et B.11 du secours).'
        : 'Si les dalles d\'un port s\'inversent quand le secours prend le relais : le sens du chemin du secours ne va pas ; prends l\'autre '
          + '(inversé si tu l\'avais identique, identique si tu l\'avais inversé).');
      sources.push(...(cascade ? [lct58('§ 5.3, p. 31')] : [src('vx1000-1-5-0', '§ 5.8.1, p. 36'), src('formation-11')]));
      controles.push(etape('C.5', morceaux.join(' '), sources, { aVerifier: true, valeurs: { liaison: liaisonSecours } }));
      controles.push(etape('C.5a', 'Dans la surveillance de NovaLCT V5.8.1, les cartes de réception du secours en attente s\'affichent en bleu '
        + '(« Backing up ») : le secours est prêt. Le manuel V5.5.0 n\'en parle pas.', [lct58('§ 5.3, p. 31')]));
    }
  }
  if (cfg.melanges) {
    controles.push(etape('C.6', `Lots mélangés : Tools > Multi-batch Adjustment ; ${cfg.lxy.length
      ? `avec le fichier ${cfg.lxy.join(', ')}, Apply Adjustment File` : 'avec le fichier .lxy du parc, s\'il existe, Apply Adjustment File'} ; `
      + 'sans fichier, Manual Adjustment, le réglage lot par lot, puis Apply et Save to Flash (rappel N7).',
    [lct55('§ 6.3, p. 58 à 63')], { valeurs: { lxy: cfg.lxy } }));
  }
  if (courbe) {
    controles.push(etape('C.7', `Zone courbe ou pliée : ${nom('joints')}, choisis les joints, règle, puis Save to HW.`,
      [lct55('§ 6.4, p. 63 et 64'), lct58('§ 6.4, p. 69')]));
  }
  controles.push(etape('C.8', 'Le lendemain, si NovaLCT ne voit plus l\'écran (« No Screen ») : Screen Connection, Read from HW '
    + 'relit ce qui est dans le processeur ; ne renvoie pas une configuration refaite à la hâte.',
  [lct55('§ 12.2.1, p. 132'), lct55('§ 5.2.3, p. 24'), src('formation-11')]));
  parties.push({ id: 'C', titre: 'Contrôles', etapes: controles });

  return {
    logiciel: 'NovaLCT', processeur: modele, groupe, version: ver, parties, nonCouvert, alertes: alerteVariante ? [alerteVariante] : [],
    // « 2 × MCTRL4K + 2 de secours » (étape 22c) : titre de l'écran, du PDF, du texte copié et de la fiche régie.
    titreProcesseurs,
    secours: avecSecours ? { nombre: nbSecours, liaison: liaisonSecours, texte: evaluation.secoursProcesseur?.texte ?? null } : null,
    parc: codeParc ? { nom: codeParc, aCode: true } : null,
    // Config imposée (étape 18c3) : rappelée en tête, dans le texte copié, le PDF et la fiche régie.
    imposee: variante?.mode === 'imposee'
      ? `Ma config (imposée), ${variante.ports} port${variante.ports > 1 ? 's' : ''}${fibreImposee ? `, en fibre (${fibreImposee.convertisseurs} ${fibreImposee.designation})` : ''} ; `
        + 'le conseil de l\'appli reste dans Data.'
      : null,
  };
}

// ---------------------------------------------------------------------------
// Cases cochées (spec § 5) : une case vaut pour la signature de son étape
// ---------------------------------------------------------------------------

// `cases` : { identifiant d'étape : signature au moment où elle a été cochée }. Rend les cases gardées, les étapes
// décochées (libellé) et le texte du bandeau (null si rien n'a changé).
export function rapprocherNovaLCT(cases, resultat) {
  const etapes = new Map((resultat?.parties ?? []).flatMap((p) => p.etapes.map((e) => [e.id, { ...e, libelle: `${p.titre} : ${e.titre}` }])));
  const gardees = {};
  const changees = [];
  const disparues = [];
  for (const [id, signature] of Object.entries(cases ?? {})) {
    const e = etapes.get(id);
    if (e && e.signature === signature) gardees[id] = signature;
    else if (e) changees.push(e.libelle);
    else {
      // Étape disparue d'un processeur : son numéro avec le titre (« Processeur 1 : Redondance des ports »).
      const p = /^P(\d+)\./.exec(id);
      disparues.push(p ? `Processeur ${p[1]} : ${titreDe(id)}` : titreDe(id));
    }
  }
  const perdues = [...changees, ...disparues];
  if (perdues.length === 0) return { cases: gardees, perdues, texte: null };
  const noms = perdues.map((x) => `« ${x} »`).join(', ');
  let raison;
  if (perdues.length === 1) raison = changees.length ? 'ses valeurs ne sont plus les mêmes' : 'l\'étape n\'existe plus';
  else if (!disparues.length) raison = 'leurs valeurs ne sont plus les mêmes';
  else if (!changees.length) raison = 'ces étapes n\'existent plus';
  else raison = 'leurs valeurs ne sont plus les mêmes ou l\'étape n\'existe plus';
  const texte = perdues.length === 1
    ? `Le mur a changé : étape ${noms} décochée (${raison}).`
    : `Le mur a changé : étapes ${noms} décochées (${raison}).`;
  return { cases: gardees, perdues, texte };
}

// ---------------------------------------------------------------------------
// Texte copié, PDF et fiche régie (étape 17c1)
// ---------------------------------------------------------------------------

const deux = (n) => String(n).padStart(2, '0');
const jour = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
const numeroEtape = (id) => id.replace(/^P\d+\./, '');
const faitesSur = (resultat, cases) => {
  const etapes = resultat.parties.flatMap((p) => p.etapes);
  return { faites: etapes.filter((e) => cases?.[e.id] === e.signature).length, total: etapes.length };
};
const nombreProcesseurs = (resultat) => resultat.parties.filter((p) => p.processeur && !p.secours).length;
const titreDesProcesseurs = (resultat) => resultat.titreProcesseurs ?? `${nombreProcesseurs(resultat)} × ${resultat.processeur}`;
const sourcesTexte = (e) => e.sources.map((s) => `${s.court}${s.ref ? ` ${s.ref}` : ''}`).join(' ; ');

// Le pas à pas en tableau, pour le PDF des fiches métier (`pdfFiche`) et le texte copié : en-tête, un bloc par partie,
// chaque étape en sous-titre (« B.2 Carte d'envoi : fait »), son texte, le tableau de la redondance, l'alerte, « à
// vérifier en formation », ses sources.
export function ficheNovaLCT(resultat, cases, { presta = '', mur = '', date = new Date() } = {}) {
  const { faites, total } = faitesSur(resultat, cases);
  const lignesEtape = (e) => [
    { titre: `${numeroEtape(e.id)} ${e.titre}${cases?.[e.id] === e.signature ? ' : fait' : ''}` },
    { libelle: '', valeur: e.texte },
    ...(e.tableau?.lignes ?? []).map((l) => ({ libelle: `Redondance, port ${l[1]}`, valeur: `carte principale ${l[0]}, port ${l[1]} ; carte de secours ${l[2]}, port ${l[3]}` })),
    ...(e.alerte ? [{ libelle: 'Alerte', valeur: e.alerte }] : []),
    ...(e.connexion ? [{ libelle: e.connexion.chemin.titre, valeur: [...e.connexion.chemin.etapes, e.connexion.chemin.apres].map((x) => x.texte).join(' ') }] : []),
    ...(e.aVerifier ? [{ libelle: 'À vérifier', valeur: verifierOu(e) }] : []),
    { libelle: 'Source', valeur: sourcesTexte(e) || 'aucune source lue' },
  ];
  return {
    titre: 'NovaLCT pas à pas',
    rappel: `Noms des menus des manuels NovaLCT V5.5.0 et V5.8.1, ceux de la V${resultat.version.premiere} en premier ; `
      + 'une étape « à vérifier en formation » n\'a pas de source sûre.',
    entete: [['Presta', presta], ['Mur', mur], ['Processeurs', titreDesProcesseurs(resultat)],
      ...(resultat.secours ? [['Redondance', resultat.secours.texte]] : []),
      ['Étapes faites', `${faites} sur ${total}`], ...(resultat.imposee ? [['Câblage', resultat.imposee]] : []), ['Date', jour(date)]],
    blocs: resultat.parties.map((p) => ({
      titre: p.titre, date: null, manque: null,
      lignes: [...(p.note ? [{ libelle: 'Note', valeur: p.note }] : []), ...p.etapes.flatMap(lignesEtape)],
    })),
    fin: null,
  };
}

// Texte copié : une information par ligne, titres des parties en capitales, sans tiret de liste ni ligne vide.
export function texteNovaLCT(resultat, cases, { presta = '', mur = '' } = {}) {
  const f = ficheNovaLCT(resultat, cases, { presta, mur });
  const ligne = (l) => (l.titre ? l.titre : [l.libelle, l.valeur].filter(Boolean).join(' : '));
  const lignes = ['NOVALCT PAS À PAS', ...f.entete.filter(([libelle, valeur]) => valeur && libelle !== 'Date').map(([l, v]) => `${l} : ${v}`)];
  if (resultat.version.note) lignes.push(resultat.version.note);
  for (const b of f.blocs) lignes.push(b.titre.toUpperCase(), ...b.lignes.map(ligne));
  return lignes.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// Résumé pour la fiche régie : processeurs, étapes faites, entrée et grille de chaque processeur, où trouver le pas à pas.
export function resumeNovaLCT(resultat, cases) {
  const { faites, total } = faitesSur(resultat, cases);
  const lignes = ['NOVALCT', `Processeurs : ${titreDesProcesseurs(resultat)}`, ...(resultat.secours ? [`Redondance : ${resultat.secours.texte}`] : []),
    `Étapes faites : ${faites} sur ${total}`];
  // Code admin du parc (étape 18a) : où le trouver, jamais le code.
  if (resultat.parc?.aCode) lignes.push(`Mot de passe NovaLCT : celui du parc ${resultat.parc.nom}, dans l'appli (onglet Base)`);
  if (resultat.imposee) lignes.push(`Câblage : ${resultat.imposee}`);
  for (const p of resultat.parties.filter((x) => x.processeur)) {
    const b2 = p.etapes.find((e) => e.id.endsWith('.B.2'))?.valeurs ?? {};
    const b6 = p.etapes.find((e) => e.id.endsWith('.B.6'))?.valeurs ?? {};
    const ports = p.etapes.filter((e) => /\.B\.7\.\d+$/.test(e.id)).length;
    const grille = b6.colonnes ? `grille de ${b6.colonnes} colonnes × ${b6.rangees} rangées, ${ports} ports` : 'grille : voir le pas à pas';
    // Processeur de secours (étape 22c) : sans config d'écran en cascade, chemin inversé sans cascade.
    const nom = `Processeur n° ${p.processeur}${p.secours ? ` (secours du n° ${p.secours.principal})` : ''} dans NovaLCT`;
    if (p.secours?.liaison === 'cascade') lignes.push(`${nom} : pas de config d'écran, Set as Backup, tableau Redundancy`);
    else lignes.push(`${nom} : entrée ${b2.l} × ${b2.h} à ${nombre(b2.freq)} Hz en ${b2.bits} bits, ${grille}${p.secours ? ', chemin inversé, Set as Backup' : ''}`);
  }
  lignes.push('Pas à pas : onglet Data, carte « NovaLCT pas à pas »');
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// À blanc (étape 17c2) : le pas à pas sur un mur d'exemple de la base, pour réviser sans mur
// ---------------------------------------------------------------------------

// Mur d'exemple : une dalle réelle de la base à carte Novastar, jamais une dalle fictive des tests.
export const MUR_A_BLANC = {
  dalle: 'absen-m2-9', colonnes: 12, lignes: 6, frequenceHz: 60, bits: 8, depart: 'bas-gauche',
  // Processeur choisi par défaut ; tous les processeurs réglés dans NovaLCT sont proposés (étape 18b, processeursABlanc).
  processeur: 'novastar-mctrl660',
};

// Processeurs proposés à blanc (étape 18b) : ceux de la base réglés dans NovaLCT, sans les fiches à compléter, groupés
// par gamme (MCTRL, MSD, VX, VX Pro, NovaPro, série H), du plus petit au plus grand comme dans Data (arbreProcesseurs).
const ORDRE_GAMMES = ['MCTRL', 'MSD (cartes d\'envoi)', 'VX', 'VX Pro', 'NovaPro', 'Série H'];
export function processeursABlanc(processeurs = []) {
  const arbre = arbreProcesseurs(processeurs.filter((p) => p.logiciel === 'NovaLCT'));
  const rang = (g) => (ORDRE_GAMMES.includes(g) ? ORDRE_GAMMES.indexOf(g) : ORDRE_GAMMES.length);
  const groupes = arbre.flatMap((m) => m.gammes)
    .map(({ gamme, fiches }) => ({ gamme, processeurs: fiches.filter((f) => !f.aCompleter && !f.information && !f.calculHorsAppli)
      .map((f) => ({ id: f.id, modele: f.modele, libelle: f.libelle })) }))
    .filter((g) => g.processeurs.length)
    .sort((a, b) => rang(a.gamme) - rang(b.gamme) || a.gamme.localeCompare(b.gamme, 'fr'));
  return { groupes, defaut: MUR_A_BLANC.processeur };
}

// `dalles`, `processeurs` : fiches résolues de la base ; `liaisons` : liaisons résolues. Rend le mur, l'évaluation, la
// variante conseillée, la source conseillée, le pas à pas et sa description ; null si la dalle ou le processeur manque.
// `parc` : { nom, aCode } du parc actif, pour le code admin de l'étape 0.5 (étape 18a).
// `systeme` : choix « Mon ordinateur » (étape 19a).
// `secours`, `liaisonSecours` : choix « Secours » et « Liaison » de Data (étape 22c), pris en compte avec la redondance.
export function murABlanc({ dalles = [], processeurs = [], liaisons = [], processeur = MUR_A_BLANC.processeur, redondance = false, secours = 'ports',
  liaisonSecours = 'sansCascade', parc = null, systeme = null }) {
  const dalle = dalles.find((d) => d.id === MUR_A_BLANC.dalle);
  const proc = processeurs.find((p) => p.id === processeur);
  if (!dalle || !proc) return null;
  const { colonnes, lignes, frequenceHz, bits, depart } = MUR_A_BLANC;
  const m = murDeDalles(dalle, colonnes, lignes);
  const evaluation = evaluerProcesseur(m, dalle, proc, { frequenceHz, bits, redondance, secours, liaisonSecours });
  if (!evaluation?.groupes?.length) return null;
  const c = cablageData(m, dalle, evaluation, { depart });
  const variante = c.variantes.find((x) => x.mode === c.conseil) ?? null;
  const source = sourceConseillee(evaluation, liaisons, frequenceHz);
  const resultat = etapesNovaLCT({ mur: m, dalle, evaluation, variante, source, parc, systeme });
  return {
    mur: m, dalle, evaluation, variante, source, depart, resultat,
    description: `Mur d'exemple : ${colonnes} × ${lignes} ${dalle.nom}, ${texteProcesseurs(evaluation, proc.modele)}, ${nombre(frequenceHz)} Hz, ${bits} bits`
      + `${redondance ? `, redondance${evaluation.secoursProcesseur ? ` ${evaluation.secoursProcesseur.texte}` : ''}` : ''}.`,
  };
}

// ---------------------------------------------------------------------------
// Dépannage (étape 22c, spec § 7) : aide ajoutée par l'appli sous une ligne, hors des données transcrites
// ---------------------------------------------------------------------------

const lct58d = (ref) => src('lct-5-8-1', ref);
const SENS_SOURCES = [src('vx1000-1-5-0', '§ 5.8.1, p. 36'), src('mctrl-r5-manuel-1-0-5', '§ 6.6.5, p. 14'), src('daktronics-000020215'), src('formation-11')];
const CONFIG_SECOURS_SOURCES = [lct58d('§ 5.3, p. 31'), lct58d('§ 5.3, p. 32')];
const AIDES_SECOURS = {
  // Constat 2 du cas réel 2 : deux boîtiers en réseau par un switch, une seule carte d'envoi dans Screen Configuration.
  'T10.3:3': {
    titre: 'Deux processeurs, NovaLCT n\'en montre qu\'un',
    lignes: [
      { texte: 'Chaque boîtier relié en réseau (même par un switch) ou par son propre câble USB est un port de communication à part : choisis-le '
        + 'dans la liste de Screen Configuration. Les cartes d\'envoi 1, 2… ne s\'affichent ensemble que pour des boîtiers cascadés en USB.',
      sources: [lct58d('§ 3.1 et § 3.2, p. 4'), lct58d('§ 8.9, p. 116'), lct58d('§ 5.3, p. 32')] },
      { texte: 'En cascade : Detect Config (clic droit sur l\'icône de NovaLCT dans la barre des tâches), décoche Disable cascade communication, '
        + 'sinon NovaLCT ne se connecte qu\'au premier boîtier ; puis System > Reconnect.', sources: [lct58d('§ 3.2, p. 4 et 5')] },
      { texte: 'Méthode cascade (tableau) : boîtiers cascadés en USB, un seul port de communication, le secours sans config d\'écran, puis le '
        + 'tableau Redundancy.', sources: [lct58d('§ 5.3, p. 30 à 32')] },
      { texte: 'Méthode sans cascade (Primary et Backup) : chaque boîtier à part, avec sa propre config, réglé en principal ou en secours en façade.',
        sources: [src('vx1000-1-5-0', '§ 5.8.1, p. 35 et 36'), src('mctrl-r5-manuel-1-0-5', '§ 6.6.5, p. 14'), src('daktronics-000020215')] },
    ],
  },
  // Symptôme du constat 4 (spec § 4.3).
  'T11.1:3': {
    titre: 'Les dalles d\'un port s\'inversent quand le secours prend le relais',
    lignes: [
      { texte: 'Méthode sans cascade : le sens du chemin du secours ne va pas ; prends l\'autre (inversé si tu l\'avais identique, identique si tu '
        + 'l\'avais inversé). Novastar demande le chemin inversé (VX1000, MCTRL R5) ; Daktronics et la formation parlent aussi d\'une config '
        + 'identique : à vérifier sur ton modèle.', sources: SENS_SOURCES },
      { texte: 'Méthode cascade : le secours a sa propre config d\'écran (efface-la, puis Set as Backup), ou le tableau Redundancy n\'est pas envoyé.',
        sources: CONFIG_SECOURS_SOURCES },
    ],
  },
  'T5.2:3': {
    titre: 'Avec un processeur de secours',
    lignes: [
      { texte: 'Dalles d\'un port inversées seulement quand le secours prend le relais : le sens du chemin du secours (sans cascade) ou sa config '
        + 'd\'écran (cascade) ; vois le pas à pas NovaLCT.', sources: [...SENS_SOURCES, ...CONFIG_SECOURS_SOURCES] },
    ],
  },
};

// Bloc de la clé « nœud:numéro d'étape » pour la marque du moment : Novastar seulement (pas COEX, réglé dans VMP) ; null
// sinon. `lienPasAPas` : le bloc propose le pas à pas NovaLCT quand le processeur du projet s'y règle.
export function aideDepannageSecours(cle, marque) {
  const aide = AIDES_SECOURS[cle];
  return aide && marque === 'novastar' ? { ...aide, lienPasAPas: true } : null;
}
