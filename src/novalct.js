// NovaLCT pas à pas (étape 17, spec du 18/10/2026) : ce qu'il faut faire dans NovaLCT, et avant dans V-Can ou en
// façade, pour le mur ouvert, étape par étape. Fonctions pures, sans interface (l'écran viendra en 17b) : elles lisent
// ce que l'appli a déjà calculé (évaluation de Data, câblage retenu du Schéma, source de Canvas, configs du lot) et ne
// recalculent rien. Chaque étape cite sa source (manuel, version, paragraphe et page imprimée, ou formation) ; une
// étape sans source porte « à vérifier en formation », sans nom de menu inventé. Noms de menus en anglais, tels quels.

import { nombre } from './format.js';
import { mur as murDeDalles, evaluerProcesseur, cablageData, sourceConseillee } from './calculs.js';

export const SOURCES_NOVALCT = {
  'lct-5-5-0': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.5.0 (Novastar)',
    court: 'Manuel NovaLCT V5.5.0',
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
  'formation-6': { titre: 'Formation (transcription 6)', court: 'Formation (transcription 6)', confiance: 'formation' },
  'formation-11': { titre: 'Formation (transcription 11)', court: 'Formation (transcription 11)', confiance: 'formation' },
  'formation-12': { titre: 'Formation (transcription 12)', court: 'Formation (transcription 12)', confiance: 'formation' },
  cdc: { titre: 'Cahier des charges du projet, mise en service Novastar', court: 'Cahier des charges du projet', confiance: 'choix de conception' },
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
  '0.5': 'Connexion avancée', '0.6': 'Redondance : câble principal d\'abord',
  'A.1': 'Entrée à la taille du canvas', 'A.2': 'Deux entrées assemblées (MOSAIC)', 'A.3': 'Couche plein écran et preset',
  'A.4': 'Plage RGB Full', 'A.5': 'Sauvegarde du boîtier', 'A.6': 'Synchronisation des processeurs',
  'B.1': 'Ouvrir Screen Configuration', 'B.2': 'Carte d\'envoi', 'B.3': 'Cartes de réception : fichier', 'B.4': 'Taille de carte',
  'B.5': 'Performance Settings : ne touche à rien', 'B.6': 'Screen Connection : la grille', 'B.8': 'Charge des ports',
  'B.9': 'Coordinate', 'B.10': 'Envoyer, enregistrer', 'B.11': 'Redondance des ports',
  'C.1': 'Nombre de cartes par port', 'C.2': 'Mapping', 'C.3': 'Mire', 'C.4': 'Luminosité', 'C.5': 'Test de la redondance',
  'C.6': 'Lots mélangés : multi-batch', 'C.7': 'Joints de la zone courbe ou pliée', 'C.8': 'Le lendemain : Read from HW',
};
const titreDe = (id) => {
  const code = id.replace(/^P\d+\./, '');
  const port = /^B\.7\.(\d+)$/.exec(code);
  return port ? `Port ${port[1]}` : TITRES[code] ?? code;
};

// Une étape : la signature ne dépend que de son identifiant et de ses valeurs (pas de l'ordre des noms de version).
// `tableau` : { colonnes, lignes } à remplir dans le logiciel (redondance), ou null.
function etape(id, texte, sources, { titre = titreDe(id), valeurs = {}, aVerifier = false, alerte = null, tableau = null } = {}) {
  return { id, titre, texte, sources, aVerifier, alerte, tableau, valeurs, signature: `${id}|${JSON.stringify(valeurs)}` };
}

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
function lireConfigs(configs) {
  if (!configs) return { aucunParc: true, fichiers: [], noms: [], lxy: [], alertes: [], melanges: false, perso: false };
  const lots = configs.flatMap(({ libelle, resultat }) => (resultat?.retenus ?? []).flatMap((lot) => (lot.configs ?? [])
    .filter((c) => c.logiciel === 'NovaLCT')
    .map((c) => ({ libelle, lot: lot.identifiant, config: c }))));
  return {
    aucunParc: false,
    fichiers: lots.map(({ libelle, lot, config }) => `${libelle ? `${libelle} : ` : ''}${config.nomFichier ?? 'fichier non précisé'} (lot ${lot})`),
    noms: [...new Set(lots.map(({ config }) => config.nomFichier ?? null))],
    lxy: [...new Set(lots.map(({ config }) => config.multiBatch).filter(Boolean))],
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
// dans le parc ; `pliage` : pliageSortie de Canvas ; `courbe` : une zone courbe ou pliée.
export function etapesNovaLCT({ mur: m, dalle, evaluation, variante, source, configs = null, version = null, pliage = null, courbe = false }) {
  const proc = evaluation?.processeur;
  if (!proc || proc.logiciel !== 'NovaLCT') return null;
  const groupe = groupeVideo(proc);
  const ver = versionReference(version);
  const nom = (cle) => nomMenu(cle, ver.premiere);
  const { frequenceHz: freq, bits, redondance } = evaluation.reglages;
  const groupes = evaluation.groupes ?? [];
  const nb = groupes.length;
  const modele = proc.modele;
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

  // Partie 0 : avant de partir et sur place.
  const fichiersTexte = cfg.aucunParc ? CHOISIS_PARC : [
    cfg.fichiers.length ? `${cfg.fichiers.join(', ')}` : 'le .rcfgx de chaque lot',
    ...(cfg.lxy.length ? [`multi-batch ${cfg.lxy.join(', ')}`] : []),
  ].join(' ; ');
  const partie0 = [
    etape('0.1', [
      'NovaLCT tourne sous Windows : prends un PC Windows avec NovaLCT.',
      vcan ? `V-Can (Windows ou Mac) pour régler l'entrée du ${modele}.` : null,
      groupe.id === 'vx-pro' ? `VICP ou Unico pour le ${modele} : ${A_VERIFIER}.` : null,
      ver.note ?? `Noms des menus d'après les manuels V5.5.0 et V5.8.1, ceux de la V${ver.premiere} en premier.`,
    ].filter(Boolean).join(' '), [lct55('§ 1, p. 1'), ...(vcan ? [src('vcan-3-8-0', '§ 2.2, p. 2')] : [])],
    { valeurs: { premiere: ver.premiere, note: ver.note, groupe: groupe.id } }),
    etape('0.2', `Sur le PC de régie : ${fichiersTexte.replace(/\.$/, '')}.${cfg.alertes.length ? ` ${cfg.alertes.join(' ')}` : ''} `
      + 'Prends aussi le .scr ou le .scfg déjà faits pour ce mur, s\'il y en a.',
    [src('cdc'), lct55('§ 5.1, p. 6')], { valeurs: { fichiers: cfg.fichiers, lxy: cfg.lxy, aucunParc: cfg.aucunParc } }),
    etape('0.3', `Branche le PC au ${modele} avec le câble de contrôle, en USB ou en Ethernet. View Details of Device donne `
      + `le port de communication et le nombre de cartes d'envoi vues : ${nb} attendue${nb > 1 ? 's' : ''} (${nb} × ${modele}).`,
    [lct55('§ 3, p. 3'), lct58('§ 3, p. 4')], { valeurs: { nb } }),
    etape('0.4', `Mur allumé, tout en ligne : Settings > Hardware Information, Refresh All, puis Refresh, et note les versions du ${modele} `
      + 'et des cartes de réception (onglet Base, version du parc).',
    [lct55('§ 9.5, p. 116 et 117'), lct58('§ 9.5, p. 125 et 126'), src('cdc')]),
    etape('0.5', 'Menu User > Advanced Synchronous System User Login, mot de passe par défaut « admin ». Sans processeur '
      + 'branché, User > Demonstration Login permet de s\'entraîner.',
    [lct55('§ 4, p. 5'), lct58('§ 4, p. 6'), src('formation-6')]),
    ...(redondance ? [etape('0.6', 'Redondance : branche d\'abord le câble principal seul, configure, puis branche les câbles '
      + 'de secours ; tout brancher d\'un coup peut créer des conflits. Deux processeurs en redondance : configure le premier '
      + 'seul avant de brancher le second.', [src('formation-11'), src('formation-12'), src('cdc')])] : []),
  ];
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
        ...(nb > 1 ? [etape('A.6', `${nb} × ${modele} sur le même écran : la même source de synchronisation sur chacun. En façade : `
          + `Advanced Settings > Synchronization, Status sur On, puis Source.${vx1000 ? '' : ` Menus relevés sur le VX1000 : ${A_VERIFIER}.`}`,
        [src('vx1000-1-5-0', '§ 5.8.4, p. 40 et 41')], { valeurs: { nb }, aVerifier: !vx1000 })] : []),
      ],
    });
  }

  // Partie B : NovaLCT, un parcours par processeur.
  const pxDalle = dim(dalle.pxH, dalle.pxV);
  const pxDemi = demi ? dim(demi.pxH, demi.pxV) : null;
  groupes.forEach((g, i) => {
    const n = i + 1;
    const pre = `P${n}.`;
    const ports = variante?.processeurs?.[i]?.ports ?? [];
    const etapes = [];
    etapes.push(etape(`${pre}B.1`, `Settings > Screen Configuration, choisis le port de communication du ${modele} n° ${n}`
      + `${nb > 1 ? ' (une carte d\'envoi par port de communication dans la liste)' : ''}, Configure Screen, puis Next.`,
    [lct55('§ 5.2.1, p. 8 et 9'), lct58('§ 5.2.1, p. 9')], { valeurs: { n } }));

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
        etapes.push(etape(`${pre}B.6`, `Onglet Screen Connection : nombre d'écrans 1 (les ports du ${modele} chargent le même écran), `
          + `Configure. Standard Screen : ${g.colonnes} colonnes × ${g.rangees} rangées de cartes${zone}.`,
        [lct55('§ 5.2.3, p. 20 et 21'), lct58('§ 5.2.3, p. 24')],
        { alerte: alerteVariante, valeurs: { colonnes: g.colonnes, rangees: g.rangees, c: g.premiereColonne, r: g.premiereRangee } }));
      }

      for (const port of ports) {
        const cases = port.dalles.map(position).filter(Boolean)
          .map((p) => ({ ...p, c: p.c - g.premiereColonne + 1, r: p.r - g.premiereRangee + 1, demi: m.rangees?.[p.r - 1] === 'demi' }));
        const demis = cases.filter((p) => p.demi);
        const rangeeDemi = demis[0]?.r;
        const detail = demis.length
          ? `${cases.length} cartes : ${cases.length - demis.length} de ${pxDalle} et ${demis.length} de ${pxDemi} (demi-dalles, rangée ${rangeeDemi})`
          : `${cases.length} cartes de ${pxDalle}`;
        const premiere = cases[0];
        const secours = redondance && port.secours ? ` Secours : ${port.secours.libelle} (étape B.11).` : '';
        etapes.push(etape(`${pre}B.7.${port.numero}`, `${detail}, ${placeDuPort(cases, g)}. Départ sur ${port.dalles[0]} `
          + `(carte colonne ${premiere.c}, rangée ${premiere.r} de l'écran), puis : ${sensDuCable(cases)}. Dans NovaLCT : `
          + `choisis le ${port.libelle}. Taille de carte : Screen Connection affiche 128 × 128 par défaut, même après l'envoi du `
          + `.rcfgx ; tape ${pxDalle} avant de cliquer les cartes. Puis clique les cartes dans cet ordre (ou une connexion rapide `
          + `qui suit le même chemin).${demis.length ? ` Rangée ${rangeeDemi} : règle la hauteur à ${demi.pxV} px, puis Apply to Entire Row.` : ''} `
          + `Charge : ${nombre(port.px)} px, ${pourcent(port.taux)} de la capacité de Data (${nombre(evaluation.capacite)} px).${secours}`
          + ' Dessin et Screen Connection en vue de face, côté public : derrière le mur, la gauche et la droite sont inversées.'
          + `${plie(i) ? ` Sortie pliée : colonnes comptées dans le bloc entier ; dans NovaLCT, celles de la tranche du port (${A_VERIFIER}).` : ''}`,
        [lct55('§ 5.2.3, p. 21'), lct58('§ 5.2.3, p. 24 et 25'), src('formation-6'), src('formation-11')],
        { titre: majuscule(port.libelle), aVerifier: plie(i), valeurs: { port: port.libelle, dalles: port.dalles, px: pxDalle, demi: pxDemi, plie: plie(i) } }));
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
        : `Coordinate : (0, 0), le bloc du ${modele} n° ${n} en haut à gauche de sa source.`,
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

    if (redondance) {
      const avecSecours = ports.filter((p) => p.secours);
      const paires = avecSecours.map((p) => `${p.libelle}, secours ${p.secours.libelle}`);
      // Le petit tableau de la fenêtre Redundancy Settings (étape 17b3) : une ligne par port, même numéro de carte d'envoi
      // pour un secours dans le même processeur (« enter the same value for serial numbers », manuel V5.5.0 § 5.3).
      const tableau = {
        colonnes: ['Carte d\'envoi principale', 'Port principal', 'Carte d\'envoi de secours', 'Port de secours'],
        lignes: avecSecours.map((p) => [1, p.numero, 1, p.secours.numero]),
      };
      etapes.push(etape(`${pre}B.11`, `Onglet Sending Card, Redundancy, Add : remplis le tableau ci-dessous, une ligne par port, Add à `
        + `chaque ligne, Close, puis Send ou Save, puis branche les câbles de secours. Secours dans le même ${modele} : le même numéro de carte d'envoi, 1, en principal `
        + `et en secours (« enter the same value for serial numbers ») ; ports : ${paires.join(' ; ')}. Ports de secours : convention `
        + 'par défaut de l\'appli (Schéma), à régler dans le logiciel. Secours par un second processeur chaîné au premier : sur lui, '
        + 'Set as Backup, et dans le tableau le numéro de carte d\'envoi de secours est son numéro dans la cascade (2 pour le second) ; '
        + 'configure le premier seul avant (étape 0.6).',
      [lct55('§ 5.3, p. 27 et 28'), lct58('§ 5.3, p. 31 et 32'), ...(vx1000 ? [src('vx1000-1-5-0', '§ 5.8.1, p. 37')] : []), src('formation-11'), src('formation-12')],
      { valeurs: { paires }, tableau }));
    }
    parties.push({
      id: `P${n}`, titre: `NovaLCT, ${modele} n° ${n}`, processeur: n, etapes,
      note: redondance ? null : 'Redondance non cochée dans Data : pas de port de secours à régler. Si tu câbles des retours de secours, '
        + 'coche « Redondance » dans Data : l\'étape B.11 te donnera le tableau à remplir.',
    });
  });

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
  if (redondance) {
    if ([`${PREFIXE}mctrl4k`, `${PREFIXE}mctrl-r5`].includes(proc.id)) {
      controles.push(etape('C.5', 'Sending Card, Redundancy, Verify : Enable Hot Backup Verification ; si l\'image reste normale, '
        + 'les ports de secours marchent. Puis Disable Hot Backup Verification.', [lct55('§ 5.3, p. 28')]));
    } else if (vx1000) {
      controles.push(etape('C.5', 'En façade : Advanced Settings > Ethernet Port Backup Test, Disable Primary : l\'image doit rester ; '
        + 'puis Enable All.', [src('vx1000-1-5-0', '§ 5.8.2, p. 38 et 39')]));
    } else {
      controles.push(etape('C.5', `Test de la redondance sur le ${modele} : Verify n'existe que sur MCTRL4K, MCTRL R5 et KT8 ; `
        + `méthode ${A_VERIFIER}.`, [lct55('§ 5.3, p. 26')], { aVerifier: true }));
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

  return { logiciel: 'NovaLCT', processeur: modele, groupe, version: ver, parties, nonCouvert, alertes: alerteVariante ? [alerteVariante] : [] };
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
const nombreProcesseurs = (resultat) => resultat.parties.filter((p) => p.processeur).length;
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
    ...(e.aVerifier ? [{ libelle: 'À vérifier', valeur: 'en formation' }] : []),
    { libelle: 'Source', valeur: sourcesTexte(e) || 'aucune source lue' },
  ];
  return {
    titre: 'NovaLCT pas à pas',
    rappel: `Noms des menus des manuels NovaLCT V5.5.0 et V5.8.1, ceux de la V${resultat.version.premiere} en premier ; `
      + 'une étape « à vérifier en formation » n\'a pas de source sûre.',
    entete: [['Presta', presta], ['Mur', mur], ['Processeurs', `${nombreProcesseurs(resultat)} × ${resultat.processeur}`],
      ['Étapes faites', `${faites} sur ${total}`], ['Date', jour(date)]],
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
  const lignes = ['NOVALCT', `Processeurs : ${nombreProcesseurs(resultat)} × ${resultat.processeur}`, `Étapes faites : ${faites} sur ${total}`];
  for (const p of resultat.parties.filter((x) => x.processeur)) {
    const b2 = p.etapes.find((e) => e.id.endsWith('.B.2'))?.valeurs ?? {};
    const b6 = p.etapes.find((e) => e.id.endsWith('.B.6'))?.valeurs ?? {};
    const ports = p.etapes.filter((e) => /\.B\.7\.\d+$/.test(e.id)).length;
    const grille = b6.colonnes ? `grille de ${b6.colonnes} colonnes × ${b6.rangees} rangées, ${ports} ports` : 'grille : voir le pas à pas';
    lignes.push(`Processeur n° ${p.processeur} dans NovaLCT : entrée ${b2.l} × ${b2.h} à ${nombre(b2.freq)} Hz en ${b2.bits} bits, ${grille}`);
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
  processeurs: ['novastar-mctrl660', 'novastar-vx1000'],
};

// `dalles`, `processeurs` : fiches résolues de la base ; `liaisons` : liaisons résolues. Rend le mur, l'évaluation, la
// variante conseillée, la source conseillée, le pas à pas et sa description ; null si la dalle ou le processeur manque.
export function murABlanc({ dalles = [], processeurs = [], liaisons = [], processeur = MUR_A_BLANC.processeurs[0], redondance = false }) {
  const dalle = dalles.find((d) => d.id === MUR_A_BLANC.dalle);
  const proc = processeurs.find((p) => p.id === processeur);
  if (!dalle || !proc) return null;
  const { colonnes, lignes, frequenceHz, bits, depart } = MUR_A_BLANC;
  const m = murDeDalles(dalle, colonnes, lignes);
  const evaluation = evaluerProcesseur(m, dalle, proc, { frequenceHz, bits, redondance });
  if (!evaluation?.groupes?.length) return null;
  const c = cablageData(m, dalle, evaluation, { depart });
  const variante = c.variantes.find((x) => x.mode === c.conseil) ?? null;
  const source = sourceConseillee(evaluation, liaisons, frequenceHz);
  const resultat = etapesNovaLCT({ mur: m, dalle, evaluation, variante, source });
  return {
    mur: m, dalle, evaluation, variante, source, depart, resultat,
    description: `Mur d'exemple : ${colonnes} × ${lignes} ${dalle.nom}, ${evaluation.nombre} × ${proc.modele}, ${nombre(frequenceHz)} Hz, ${bits} bits`
      + `${redondance ? ', redondance' : ''}.`,
  };
}
