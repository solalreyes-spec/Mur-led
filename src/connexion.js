// Brancher l'ordinateur au processeur (étape 19a, spec du 22/10/2026) : l'adresse à donner à l'ordinateur, le port de
// contrôle de chaque processeur, le chemin des réglages réseau sur Mac et sur Windows, et ce que chaque logiciel de
// réglage permet sur un Mac. Module de contenu, comme novalct.js : textes et sources, aucun calcul de mur ; fonctions
// pures, sans interface. Chaque ligne cite sa source (aide Apple ou Microsoft, manuel du constructeur) ou porte
// « à vérifier », sans menu inventé.

export const SYSTEMES = ['mac', 'windows'];
export const NOMS_SYSTEMES = { mac: 'Mac', windows: 'Windows' };
// Choix « Mon ordinateur » gardé sur l'appareil (localStorage), Mac la première fois (choix de l'utilisateur).
export const CLE_ORDINATEUR = 'mur-led-ordinateur';
export const systemeConnu = (s) => (s === 'windows' ? 'windows' : 'mac');
export const autreSysteme = (s) => (systemeConnu(s) === 'mac' ? 'windows' : 'mac');

export const MARQUES_CONNEXION = [['novastar', 'Novastar'], ['coex', 'COEX'], ['brompton', 'Brompton'], ['megapixel', 'Megapixel'],
  ['colorlight', 'Colorlight'], ['autres', 'Autres (Linsn, Kystar, Mooncell)'], ['toutes', 'Toutes']];
const NOMS_MARQUES = Object.fromEntries(MARQUES_CONNEXION);

const NOVASTAR = 'https://oss.novastar.tech/uploads';
const CONSULTE = 'consultée le 22 octobre 2026';
export const SOURCES_CONNEXION = {
  // Manuels communs avec le pas à pas NovaLCT : mêmes titres et liens (D68).
  'lct-5-5-0': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.5.0 (Novastar)',
    court: 'Manuel NovaLCT V5.5.0',
    confiance: 'constructeur',
  },
  'lct-5-8-1': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.8.1 (Novastar), consulté le 18 octobre 2026',
    court: 'Manuel NovaLCT V5.8.1',
    confiance: 'constructeur',
    url: `${NOVASTAR}/2025/12/NovaLCT-LED-Configuration-Tool-for-Synchronous-Control-System-User-Manual-V5.8.1.pdf`,
  },
  'vx1000-1-5-0': {
    titre: 'VX1000 All-in-One Controller User Manual V1.5.0 du 10 juin 2025 (Novastar)',
    court: 'Manuel VX1000 V1.5.0',
    confiance: 'constructeur',
    url: `${NOVASTAR}/2025/06/VX1000-All-in-One-Controller-User-Manual-V1.5.0.pdf`,
  },
  'vcan-3-8-0': {
    titre: 'V-Can Video Control Software User Manual V3.8.0 (Novastar)',
    court: 'Manuel V-Can V3.8.0',
    confiance: 'constructeur',
    url: `${NOVASTAR}/2024/12/V-Can-Video-Control-Software-User-Manual-V3.8.0.pdf`,
  },
  'mctrl4k-manuel-1-2-1': {
    titre: 'MCTRL4K LED Display Controller User Manual V1.2.1 (Novastar)', court: 'Manuel MCTRL4K V1.2.1', confiance: 'constructeur',
    url: `${NOVASTAR}/2024/11/MCTRL4K-LED-Display-Controller-User-Manual-V1.2.1.pdf`,
  },
  'mctrl660-pro-1-4-1': {
    titre: 'MCTRL660 PRO Independent Controller Specifications V1.4.1 (Novastar)', court: 'Fiche MCTRL660 PRO V1.4.1', confiance: 'constructeur',
    url: `${NOVASTAR}/2024/11/MCTRL660-PRO-Independent-Controller-Specifications-V1.4.1.pdf`,
  },
  'mctrl-r5-manuel-1-0-5': {
    titre: 'MCTRL R5 LED Display Controller User Manual V1.0.5 (Novastar)', court: 'Manuel MCTRL R5 V1.0.5', confiance: 'constructeur',
    url: `${NOVASTAR}/2024/11/MCTRL-R5-LED-Display-Controller-User-Manual-V1.0.5.pdf`,
  },
  // Propres à l'étape 19a.
  'vmp-1-5-0': {
    titre: 'VMP Vision Management Platform User Manual V1.5.0 (Novastar, gamme COEX), consulté le 22 octobre 2026',
    court: 'Manuel VMP V1.5.0', confiance: 'constructeur',
    url: `${NOVASTAR}/2025/09/VMP-Vision-Management-Platform-User-Manual-V1.5.0-1.pdf`,
  },
  'tessera-3-5': { titre: 'Tessera V3.5 User Manual, rév. A (Brompton)', court: 'Manuel Tessera V3.5', confiance: 'constructeur' },
  'megapixel-reseau': {
    titre: `Networking with HELIOS (aide Megapixel), ${CONSULTE}`, court: 'Aide Megapixel, réseau HELIOS', confiance: 'constructeur',
    url: 'https://support.megapixelvr.com/support/solutions/articles/103000297873-networking-with-helios-',
  },
  'ms-reseau': {
    titre: `Paramètres et tâches réseau essentiels dans Windows (aide Microsoft, Windows 10 et 11), ${CONSULTE}`,
    court: 'Aide Microsoft, réseau', confiance: 'constructeur',
    url: 'https://support.microsoft.com/fr-fr/windows/param%C3%A8tres-r%C3%A9seau-essentiels-et-t%C3%A2ches-dans-windows-f21a9bbc-c582-55cd-35e0-73431160a1b9',
  },
  'ms-mac-arm': {
    titre: `Options d'utilisation de Windows 11 avec des ordinateurs Mac avec des puces Apple M1, M2 et M3 (aide Microsoft), ${CONSULTE}`,
    court: 'Aide Microsoft, Windows 11 sur Mac', confiance: 'constructeur',
    url: 'https://support.microsoft.com/fr-fr/windows/options-for-using-windows-11-with-mac-computers-with-apple-m1-and-m2-chips-cd15fd62-9b34-4b78-b0bc-121baa3c568c',
  },
  'ms-emulation-arm': {
    titre: `How emulation works on Arm (Microsoft Learn), ${CONSULTE}`, court: 'Microsoft Learn, émulation sur Arm', confiance: 'constructeur',
    url: 'https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation',
  },
  'ms-faq-arm': {
    titre: `Frequently asked questions about support for Windows on Arm (Microsoft Learn), ${CONSULTE}`, court: 'Microsoft Learn, FAQ Windows sur Arm',
    confiance: 'constructeur', url: 'https://learn.microsoft.com/en-us/windows/arm/faq',
  },
  'apple-tcpip-saisir': {
    titre: `Saisir les réglages TCP/IP sur Mac (guide d'utilisation de macOS 27, Apple), ${CONSULTE}`, court: 'Aide Apple, saisir les réglages TCP/IP',
    confiance: 'constructeur', url: 'https://support.apple.com/fr-fr/guide/mac-help/mh141292/mac',
  },
  'apple-tcpip-modifier': {
    titre: `Modifier les réglages TCP/IP sur Mac (guide d'utilisation de macOS 27, Apple), ${CONSULTE}`, court: 'Aide Apple, modifier les réglages TCP/IP',
    confiance: 'constructeur', url: 'https://support.apple.com/fr-fr/guide/mac-help/mh14129/mac',
  },
  'apple-boot-camp': {
    titre: `Installation de Windows 10 sur votre Mac via l'assistant Boot Camp (assistance Apple), ${CONSULTE}`, court: 'Aide Apple, Boot Camp',
    confiance: 'constructeur', url: 'https://support.apple.com/fr-fr/102622',
  },
  'formation-15': { titre: 'Formation (transcription 15)', court: 'Formation (transcription 15)', confiance: 'formation' },
  conception: { titre: 'Choix de conception du projet', court: 'Choix de conception du projet', confiance: 'choix de conception' },
};
export const sourceConnexion = (id, ref = null) => ({ id, ref, court: SOURCES_CONNEXION[id].court });
const src = sourceConnexion;
const tessera = (ref) => src('tessera-3-5', ref);
const APPLE = [src('apple-tcpip-saisir'), src('apple-tcpip-modifier')];

// ---------------------------------------------------------------------------
// Adresse de l'ordinateur (spec § 3.1)
// ---------------------------------------------------------------------------

export const MASQUE = '255.255.255.0';
const ILLISIBLE = 'Tape l\'adresse lue sur le processeur, quatre nombres de 0 à 255 séparés par des points (192.168.0.10).';
const PLAGES = 'Tes processeurs ne sont pas dans la même plage : règle-les d\'abord dans la même.';
const SANS_EXEMPLE = 'Lis l\'adresse sur l\'écran du processeur et tape-la : l\'appli te donne celle de ton ordinateur.';
const NOTE_MASQUE = 'Masque supposé 255.255.255.0 : si le processeur affiche un autre masque, recopie-le.';
const AUTOIP = 'Adresse en 169.254 : le processeur ne s\'est pas donné d\'adresse fixe (AutoIP). Donne-lui-en une, ou passe l\'ordinateur en DHCP.';
// Règle commune : même plage, même masque, une adresse différente par appareil.
const SOURCES_ADRESSE = [src('conception'), tessera('§ 14.1.2, p. 243'), src('vx1000-1-5-0', '§ 5.11.2, p. 50'), src('formation-15')];
// Exemple de la marque quand rien n'est saisi : l'adresse publiée par Brompton, celle que montre le manuel du VX1000.
const EXEMPLES = {
  brompton: { adresse: '192.168.0.50', sources: [tessera('§ 4.5, p. 41 et § 14.1.2, p. 243')],
    message: 'Exemple : 192.168.0.50, l\'adresse par défaut d\'un processeur Tessera ; si elle a été changée, lis la tienne sur le processeur.' },
  novastar: { adresse: '192.168.0.10', sources: [src('vx1000-1-5-0', '§ 4, p. 12')],
    message: 'Exemple : 192.168.0.10, l\'adresse que montre le manuel du VX1000 ; lis la tienne sur l\'écran du processeur.' },
};

// Adresses tapées : virgules du clavier décimal lues comme des points, séparées par des espaces ou des points-virgules.
export function lireAdresses(saisie) {
  return [saisie ?? ''].flat().flatMap((t) => String(t).replace(/,/g, '.').split(/[\s;]+/))
    .map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean);
}
const nombres = (texte) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texte);
  const n = m ? m.slice(1).map(Number) : null;
  return n && n.every((x) => x <= 255) ? n : null;
};

// `saisie` : texte du champ ou liste d'adresses lues sur les processeurs ; `marque` donne l'exemple quand rien n'est saisi.
export function adresseOrdinateur(saisie, { marque = null } = {}) {
  const base = { masque: MASQUE, passerelle: '', note: NOTE_MASQUE, sources: SOURCES_ADRESSE, exemple: false, autoIP: false, alertes: [], erreur: null, message: null };
  const refus = (erreur) => ({ ...base, ok: false, adresse: null, processeurs: [], erreur });
  const lues = lireAdresses(saisie);
  if (!lues.length) {
    const ex = EXEMPLES[marque];
    if (!ex) return { ...base, ok: false, vide: true, adresse: null, processeurs: [], message: SANS_EXEMPLE };
    return { ...adresseOrdinateur(ex.adresse), exemple: true, message: ex.message, sources: [...ex.sources, ...SOURCES_ADRESSE] };
  }
  const n = lues.map(nombres);
  if (n.some((x) => !x)) return refus(ILLISIBLE);
  const bord = n.find((x) => x[3] === 0 || x[3] === 255);
  if (bord) return refus(`${bord.join('.')} : adresse de réseau ou de diffusion, pas celle d'un appareil. Relis l'adresse du processeur.`);
  const processeurs = n.map((x) => x.join('.'));
  if (n.some((x) => x[0] === 169 && x[1] === 254)) {
    return { ...base, ok: false, autoIP: true, adresse: null, processeurs, alertes: [AUTOIP], sources: [...SOURCES_ADRESSE, src('megapixel-reseau')] };
  }
  const plage = (x) => x.slice(0, 3).join('.');
  if (new Set(n.map(plage)).size > 1) return refus(PLAGES);
  const pris = new Set(n.map((x) => x[3]));
  const candidats = [...Array.from({ length: 155 }, (_, i) => 100 + i), ...Array.from({ length: 99 }, (_, i) => 99 - i)];
  const libre = candidats.find((x) => !pris.has(x));
  if (libre === undefined) return refus('Plus aucune adresse libre dans cette plage.');
  const doubles = processeurs.filter((a, i) => processeurs.indexOf(a) !== i);
  const alertes = [...new Set(doubles)].map((a) => `Deux processeurs ont la même adresse (${a}) : change l'une d'elles, chaque appareil doit avoir la sienne.`);
  return { ...base, ok: true, adresse: `${plage(n[0])}.${libre}`, processeurs, alertes };
}

// ---------------------------------------------------------------------------
// Port de contrôle et adresse de chaque processeur (spec § 3.1), lus dans leur manuel ou leur fiche
// ---------------------------------------------------------------------------

// `ethernet` : nom du port Ethernet de contrôle ; `adresse` : où la lire (null : non publié, à vérifier) ; `web` : page web de réglage, dépannage partiel sans Windows.
export const CONTROLE_PROCESSEURS = [
  {
    ids: ['novastar-mctrl4k'], nom: 'MCTRL4K', ethernet: 'Control ETHERNET', port: 'Control ETHERNET, ou USB (USB IN)',
    adresse: 'Son adresse s\'affiche en haut à droite de son écran d\'accueil',
    reglage: 'En façade : Communication Settings, adresse manuelle ou automatique, USB Preferred ou LAN Preferred.',
    web: true, aVerifier: false, sources: [src('mctrl4k-manuel-1-2-1', 'p. 4 ; p. 26 et 27 ; § 7.4, p. 31 et 32')],
  },
  {
    ids: ['novastar-mctrl660-pro'], nom: 'MCTRL660 PRO', ethernet: 'Control ETHERNET', port: 'Control ETHERNET (USB IN pour le débogage)',
    adresse: null, reglage: null, web: true, aVerifier: true, sources: [src('mctrl660-pro-1-4-1', 'p. 2 et 4')],
  },
  {
    ids: ['novastar-mctrl-r5'], nom: 'MCTRL R5', ethernet: 'Control ETHERNET', port: 'Control ETHERNET, ou USB',
    adresse: 'Son adresse s\'affiche sur son écran d\'accueil',
    reglage: 'En façade : Communication Settings, adresse manuelle ou automatique, USB Preferred ou LAN Preferred.',
    web: false, aVerifier: false, sources: [src('mctrl-r5-manuel-1-0-5', 'p. 3 ; § 5, p. 6 ; p. 15')],
  },
  {
    ids: ['novastar-vx1000'], nom: 'VX1000', ethernet: 'ETHERNET', port: 'ETHERNET, ou USB 2.0 (type B)',
    adresse: 'Son adresse s\'affiche sur son écran d\'accueil',
    reglage: 'En façade : Communication > Network, Mode Manual, puis Apply ; ou dans V-Can : System > Network.',
    web: false, aVerifier: false, sources: [src('vx1000-1-5-0', 'p. 7 ; § 4, p. 12 ; § 5.11.2, p. 50 et 51'), src('vcan-3-8-0', '§ 3.3.9, p. 58')],
  },
  {
    ids: ['coex-mx40-pro'], nom: 'MX40 Pro', ethernet: 'Ethernet', port: 'Ethernet, câble direct vers l\'ordinateur',
    adresse: null, reglage: 'En façade : Communication Settings > Network Settings, Mode Manual (IP Address, Subnet Mask, Default Gateway), puis Apply.',
    web: false, aVerifier: true, sources: [src('vmp-1-5-0', '§ 4.1, p. 5 et 6')],
  },
  {
    ids: ['brompton-sx40', 'brompton-s8', 'brompton-s4', 'brompton-m2', 'brompton-t1'], nom: 'Tessera', ethernet: 'réseau',
    port: 'port réseau, câble Cat 5e direct (Auto MDI-X, sans switch)',
    adresse: 'Adresse par défaut : 192.168.0.50, masque 255.255.255.0',
    reglage: 'Sur le processeur ou dans Tessera Remote : adresse fixe ou DHCP.',
    web: false, aVerifier: false, sources: [tessera('§ 4.5, p. 41 ; § 14.1.2, p. 243')],
  },
  {
    ids: ['megapixel-helios-jr', 'megapixel-helios-4k', 'megapixel-helios-8k'], nom: 'HELIOS', ethernet: 'réseau', port: 'réseau, l\'ordinateur sur le même réseau',
    adresse: 'Son adresse s\'affiche sur l\'écran LCD de sa façade',
    reglage: 'Ordinateur en DHCP (automatique) ou en adresse fixe dans la même plage ; une adresse en 169.254 veut dire AutoIP (pas de serveur DHCP).',
    web: false, aVerifier: false, sources: [src('megapixel-reseau')],
  },
];
const INCONNU = { inconnu: true, aVerifier: true, texte: 'Port de contrôle et adresse : vois la fiche du processeur.', sources: [], web: false };
// `processeur` : identifiant ou fiche.
export function controleProcesseur(processeur) {
  const id = typeof processeur === 'object' ? processeur?.id : processeur;
  return CONTROLE_PROCESSEURS.find((c) => c.ids.includes(id)) ?? INCONNU;
}

// ---------------------------------------------------------------------------
// Chemin des réglages réseau (spec § 2.3) : aide Apple (macOS 27) et Microsoft (Windows 10 et 11)
// ---------------------------------------------------------------------------

export function cheminIP(systeme, { adresse = null, masque = MASQUE } = {}) {
  const valeur = adresse ?? 'une adresse de la même plage que le processeur (mêmes trois premiers nombres, dernier différent)';
  if (systemeConnu(systeme) === 'windows') {
    const ms = src('ms-reseau');
    return {
      systeme: 'windows', titre: 'Sur Windows',
      etapes: [
        { texte: 'Paramètres > Réseau & Internet > Ethernet, puis le réseau de la carte reliée au processeur.', sources: [ms] },
        { texte: 'À côté de Attribution d\'adresse IP : Modifier, puis Manuel, et active IPv4.', sources: [ms] },
        { texte: `Adresse IP ${valeur}, Masque de sous-réseau ${masque}, Passerelle vide (les DNS aussi). Puis Enregistrer.`, sources: [ms, src('conception')] },
        { texte: 'Vérifie sur la même page : Adresse IPv4.', sources: [ms] },
        { texte: 'Autre chemin, par le Panneau de configuration : Centre Réseau et partage (Network and Sharing Centre) > Modifier les paramètres de la carte '
          + '(Change adapter settings) > la carte reliée au processeur > Propriétés > Protocole Internet version 4 (TCP/IPv4) > Utiliser l\'adresse IP suivante '
          + '(Use the following IP address).', sources: [tessera('annexe C, p. 272 et 273')] },
      ],
      apres: { texte: 'Après la presta : reviens en automatique (DHCP), au même endroit.', sources: [ms, src('conception')] },
    };
  }
  return {
    systeme: 'mac', titre: 'Sur ton Mac',
    etapes: [
      { texte: 'Branche ton adaptateur USB-C Ethernet : un Mac récent n\'a pas de prise Ethernet.', sources: [tessera('annexe C, p. 274')] },
      { texte: 'Menu Apple > Réglages Système > Réseau, puis le service de l\'adaptateur Ethernet > Détails > TCP/IP.', sources: APPLE },
      { texte: `Configurer IPv4 : Manuellement ; adresse IPv4 ${valeur}, masque de sous-réseau ${masque}, adresse du routeur vide. Puis OK.`,
        sources: [...APPLE, src('conception')] },
    ],
    apres: { texte: 'Après la presta : Configurer IPv4 : Utilisation de DHCP, au même endroit.', sources: [src('apple-tcpip-modifier')] },
  };
}

// ---------------------------------------------------------------------------
// Logiciels de réglage et le Mac (spec § 2.1 et 2.2)
// ---------------------------------------------------------------------------

export const ALERTE_NOVALCT = 'NovaLCT tourne sous Windows seulement. Sur ton Mac : Windows 11 pour Arm dans Parallels (pas de Boot Camp sur une puce Apple) ; '
  + 'l\'installation de NovaLCT et la liaison USB n\'y sont pas garanties (pilote), essaie l\'Ethernet. Essaie tout ça avant ta première presta et '
  + 'garde un PC Windows de secours.';
export const SOURCES_ALERTE_NOVALCT = [src('lct-5-8-1', '§ 1, p. 1 ; § 2, p. 2'), src('apple-boot-camp'), src('ms-mac-arm'), src('ms-emulation-arm'), src('ms-faq-arm'),
  src('vmp-1-5-0', '§ 3.1, p. 3')];
const NOTE_M4 = 'Microsoft autorise Windows 11 pour Arm dans Parallels Desktop 18, 19 et 20 sur les puces M1, M2 et M3 : le M4 n\'est pas cité. '
  + 'Le VMP de Novastar refuse Windows pour Arm, indice défavorable.';
const PAGE_WEB = 'Dépannage sans Windows : la page web du MCTRL4K (depuis un ordinateur ou un téléphone, Chrome 50 ou plus récent conseillé) et celle '
  + 'du MCTRL660 PRO ; ce qu\'elles permettent est à vérifier.';

export function logicielsConnexion() {
  return [
    {
      id: 'novalct', nom: 'NovaLCT', marques: ['novastar'], mac: false, aVerifier: false,
      conditions: 'Windows seulement (Windows 10 64 bits conseillé).', alerte: ALERTE_NOVALCT, noteMac: NOTE_M4, pageWeb: PAGE_WEB,
      verifie: 'View Details of Device : le port de communication montre une adresse IP en Ethernet, « USB » en USB.',
      sources: [src('lct-5-8-1', '§ 1, p. 1 ; § 2, p. 2 ; § 3.2, p. 4'), ...SOURCES_ALERTE_NOVALCT.slice(1), src('mctrl4k-manuel-1-2-1', '§ 7.4, p. 31'),
        src('mctrl660-pro-1-4-1', 'p. 2')],
    },
    {
      id: 'v-can', nom: 'V-Can', marques: ['novastar'], mac: true, aVerifier: false,
      conditions: 'Windows 7 ou plus récent, macOS 12 ou plus récent ; pour le VX1000, VX600, VX400, VX16s, NovaPro UHD Jr…',
      verifie: 'avant de brancher en Ethernet, l\'appareil et l\'ordinateur dans la même plage ; son adresse se règle dans System > Network, puis reconnecte l\'appareil.',
      sources: [src('vcan-3-8-0', '§ 1, p. 1 ; § 2.2, p. 2 ; § 3.3.9, p. 58')],
    },
    {
      id: 'vmp', nom: 'VMP', marques: ['coex'], mac: true, aVerifier: false,
      conditions: 'macOS 10.15 ou plus récent, Intel i5 ou Apple M1 ou plus récent ; sur PC, Windows 10 64 bits, Windows pour Arm refusé.',
      verifie: 'les processeurs trouvés s\'affichent dans la liste des projets ; sinon, Add Controller par son adresse IP.',
      sources: [src('vmp-1-5-0', '§ 3.1 et 3.2, p. 3 ; § 4.1, p. 5 et 6 ; § 4.3.2, p. 8')],
    },
    {
      id: 'tessera-remote', nom: 'Tessera Remote', marques: ['brompton'], mac: true, aVerifier: false,
      conditions: 'Windows et macOS ; la même version que le processeur, sinon recharge son firmware ou installe la version qui va avec.',
      verifie: 'les processeurs trouvés s\'affichent avec leur nom, leur version, leur type et leur adresse IP ; double-clique pour te connecter.',
      sources: [tessera('§ 4.2, p. 38 ; § 4.4, p. 40 ; § 4.6, p. 42')],
    },
    {
      id: 'helios', nom: 'Interface web HELIOS', marques: ['megapixel'], mac: true, aVerifier: false,
      conditions: 'dans un navigateur, sur Mac comme sur PC.',
      verifie: 'l\'adresse du HELIOS tapée dans la barre d\'adresse du navigateur ouvre son interface.',
      sources: [src('megapixel-reseau')],
    },
    {
      id: 'ledvision', nom: 'LEDVISION', marques: ['colorlight'], mac: null, aVerifier: true, verifie: null, sources: [],
      conditions: 'sur Mac, à vérifier : aucune source de Colorlight lue sur LEDVISION et le Mac.',
    },
    {
      id: 'autres', nom: 'Linsn, Kystar, Mooncell', marques: ['autres'], mac: null, aVerifier: true, verifie: null, sources: [],
      conditions: 'logiciel et port de contrôle : vois la fiche du processeur, à vérifier.',
    },
  ];
}

// Marque d'un processeur pour la fiche (famille de calcul, COEX à part).
export function marqueConnexion(processeur) {
  if (!processeur) return null;
  const f = processeur.famille;
  if (f === 'novastar') return processeur.gamme === 'COEX' ? 'coex' : 'novastar';
  if (['brompton', 'megapixel', 'colorlight'].includes(f)) return f;
  return ['linsn', 'kystar', 'mooncell'].includes(f) ? 'autres' : null;
}

// ---------------------------------------------------------------------------
// La fiche « Brancher l'ordinateur au processeur » (spec § 3.5), son texte copié et sa feuille de PDF
// ---------------------------------------------------------------------------

// Ligne d'un logiciel dans « Ton logiciel sur Mac ? ».
function ligneMac(l) {
  const texte = l.mac === false ? `${l.alerte} ${l.noteMac} ${l.pageWeb}` : l.mac ? `oui, ${l.conditions}` : l.conditions;
  return { texte: `${l.nom} : ${texte}`, sources: l.sources, aVerifier: l.aVerifier };
}

// `systeme` : mac ou windows ; `marque` : une de MARQUES_CONNEXION ; `modele` : identifiant du processeur de Data ;
// `adresses` : le champ « Adresses des processeurs ».
export function ficheConnexion({ systeme, marque = 'toutes', modele = null, adresses = '' } = {}) {
  const sys = systemeConnu(systeme);
  const m = NOMS_MARQUES[marque] ? marque : 'toutes';
  const adresse = adresseOrdinateur(adresses, { marque: m });
  const reponse = adresse.ok ? `Mets ton ordinateur en ${adresse.adresse}, masque ${adresse.masque}, passerelle vide.`
    : adresse.erreur ?? adresse.alertes[0] ?? adresse.message;
  const controle = modele ? controleProcesseur(modele) : null;
  const tous = logicielsConnexion();
  const deLaMarque = m === 'toutes' ? tous : tous.filter((l) => l.marques.includes(m));
  const brompton = m === 'brompton' || m === 'toutes';
  const cable = [
    { texte: 'Câble Ethernet direct entre le port de contrôle du processeur et ton ordinateur.', sources: [src('lct-5-8-1', '§ 3.1, p. 4'), src('vmp-1-5-0', '§ 4.1, p. 5')] },
    controle && !controle.inconnu ? { texte: `${controle.nom} : ${controle.port}.`, sources: controle.sources } : null,
    controle && !controle.inconnu ? (controle.adresse ? { texte: `${controle.adresse}.`, sources: controle.sources }
      : { texte: `${controle.nom} : où lire son adresse, à vérifier.`, sources: [], aVerifier: true }) : null,
    controle?.inconnu ? { texte: controle.texte, sources: [], aVerifier: true } : null,
    sys === 'mac' ? { texte: 'Sur ton Mac : un adaptateur USB, Thunderbolt ou USB-C Gigabit Ethernet (un Mac récent n\'a pas de prise Ethernet).', sources: [tessera('annexe C, p. 274')] } : null,
    brompton ? { texte: 'Brompton : un câble Cat 5e suffit, sans switch (Auto MDI-X) ; pas de Wi-Fi, ni de réseau à 100 ou 10 Mbit/s.', sources: [tessera('§ 4.5, p. 41')] } : null,
  ].filter(Boolean);
  const chemin = cheminIP(sys, { adresse: adresse.ok ? adresse.adresse : null });
  const autre = cheminIP(autreSysteme(sys), { adresse: adresse.ok ? adresse.adresse : null });
  const verifier = deLaMarque.map((l) => (l.verifie ? { texte: `${l.nom} : ${l.verifie}`, sources: l.sources, aVerifier: false }
    : { texte: `${l.nom} : ${l.conditions}`, sources: [], aVerifier: true }));
  const etapes = [
    { titre: 'Le câble', lignes: cable },
    { titre: chemin.titre, lignes: chemin.etapes.map((e) => ({ ...e, aVerifier: false })) },
    { titre: 'Vérifie dans le logiciel', lignes: verifier },
    { titre: 'Après la presta', lignes: [{ ...chemin.apres, aVerifier: false }] },
    { titre: 'Ton logiciel sur Mac ?', lignes: tous.map(ligneMac) },
  ];
  return { titre: 'Brancher l\'ordinateur au processeur', systeme: sys, marque: m, modele: controle?.nom ?? null, adresse, reponse, etapes, autre };
}

const sourcesTexte = (sources) => [...new Set(sources.map((s) => `${s.court}${s.ref ? ` ${s.ref}` : ''}`))].join(' ; ');
const libelleMarque = (f) => `${NOMS_MARQUES[f.marque]}${f.modele ? ` (${f.modele})` : ''}`;
// Phrases sous la réponse : exemple, alertes et masque supposé.
const notesAdresse = (a) => [a.message && a.ok ? a.message : null, ...(a.ok ? a.alertes : []), a.ok ? a.note : null].filter(Boolean);

// Texte copié : une information par ligne, titres en capitales, sans tiret de liste ni ligne vide.
export function texteConnexion(f) {
  const lignes = [f.titre.toUpperCase(), `Mon ordinateur : ${NOMS_SYSTEMES[f.systeme]}`, `Marque : ${libelleMarque(f)}`, f.reponse, ...notesAdresse(f.adresse)];
  const bloc = (titre, liste) => {
    lignes.push(titre.toUpperCase(), ...liste.map((l) => `${l.texte}${l.aVerifier ? ' (à vérifier)' : ''}`));
    const s = sourcesTexte(liste.flatMap((l) => l.sources));
    if (s) lignes.push(`Source : ${s}`);
  };
  for (const e of f.etapes) bloc(e.titre, e.lignes);
  bloc(f.autre.titre, [...f.autre.etapes, f.autre.apres]);
  return lignes.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

const deux = (n) => String(n).padStart(2, '0');
const jour = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
// Feuille pour `pdfFiche` (src/pdf.js) : en-tête, un bloc par étape ; l'autre système à la suite du chemin.
export function feuilleConnexion(f, { date = new Date() } = {}) {
  const lignesDe = (liste) => [
    ...liste.flatMap((l) => [{ libelle: '', valeur: l.texte }, ...(l.aVerifier ? [{ libelle: 'À vérifier', valeur: 'pas de source sûre' }] : [])]),
    ...(liste.some((l) => l.sources.length) ? [{ libelle: 'Source', valeur: sourcesTexte(liste.flatMap((l) => l.sources)) }] : []),
  ];
  return {
    titre: f.titre,
    rappel: 'Chemins de l\'aide Apple et Microsoft et des manuels des constructeurs ; une ligne « à vérifier » n\'a pas de source sûre.',
    entete: [['Mon ordinateur', NOMS_SYSTEMES[f.systeme]], ['Marque', libelleMarque(f)], ['Adresse', f.reponse], ['Date', jour(date)]],
    blocs: f.etapes.map((e, i) => ({
      titre: e.titre, date: null, manque: null,
      lignes: [...(i === 0 ? notesAdresse(f.adresse).map((n) => ({ libelle: 'Adresse', valeur: n })) : []), ...lignesDe(e.lignes),
        ...(i === 1 ? [{ titre: f.autre.titre }, ...lignesDe([...f.autre.etapes, f.autre.apres])] : [])],
    })),
    fin: null,
  };
}
