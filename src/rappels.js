// Rappels sourcés sur les configs de dalles, affichés dans l'onglet Data selon le logiciel qui règle le processeur
// (NovaLCT, VMP pour COEX, Tessera pour Brompton). Citations en anglais telles quelles, avec leur traduction ;
// résumés en français pour les sources lues sans citation. Colorlight (LEDVISION) : aucune source, aucun rappel.

export const SOURCES_RAPPELS = {
  'novalct-guide-5-0-0': {
    titre: 'NovaLCT V5.0.0, Synchronous System User Guide (Novastar)',
    court: 'Guide NovaLCT V5.0.0',
    date: null,
    confiance: 'constructeur',
  },
  'novalct-manuel-5-4-7-1': {
    titre: 'NovaLCT LED Configuration Tool for Synchronous Control System, User Manual V5.4.7.1 (Novastar), consulté le 25/09/2026',
    court: 'Manuel NovaLCT V5.4.7.1',
    date: null,
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2023/06/NovaLCT-LED-Configuration-Tool-for-Synchronous-Control-System-User-Manual-V5.4.7.1.pdf',
  },
  'novalct-notes-5-8-1': {
    titre: 'NovaLCT V5.8.1 Release Notes (Novastar), consultées le 25/09/2026',
    court: 'Notes de version NovaLCT V5.8.1',
    date: null,
    confiance: 'constructeur',
    url: 'https://oss.novastar.tech/uploads/2025/12/NovaLCT-V5.8.1-Release-Notes.pdf',
  },
  'ledincloud-novalct': {
    titre: 'Guide de configuration NovaLCT (LedInCloud), document tiers',
    court: 'Guide LedInCloud',
    date: null,
    confiance: 'tiers',
  },
  'coex-wiki-ncp': {
    titre: 'Wiki COEX Novastar, page NCP File, consultée le 25/09/2026',
    court: 'Wiki COEX, NCP File',
    date: null,
    confiance: 'constructeur',
    url: 'https://coex.novastar.wiki/en/Intro&Info/NCP-File',
  },
  'coex-cvt8-5g-v1-1-0': {
    titre: 'Fiche COEX CVT8-5G Fiber Converter V1.1.0 (copie non officielle)',
    court: 'Fiche CVT8-5G V1.1.0',
    date: '2026-05-11',
    confiance: 'constructeur, copie non officielle',
    url: 'https://novastar.show/api/specs?path=cvt8-5g-fiber-converter.pdf',
  },
  'tessera-manuel-3-5': {
    titre: 'Manuel Tessera V3.5 Rev A (Brompton)',
    court: 'Manuel Tessera V3.5',
    date: null,
    confiance: 'constructeur',
  },
  'formation-oliverdy-2026-09': {
    titre: 'Formation Oliverdy, septembre 2026',
    court: 'Formation Oliverdy',
    date: '2026-09',
    confiance: 'formation',
  },
};

// `quand` : toujours, lotsMelanges, firmwarePersonnalise ou cvt8. Chaque texte : citation (anglais, telle quelle)
// éventuelle, texte en français (traduction de la citation, ou résumé de la source), source et section.
export const RAPPELS = [
  {
    id: 'N1', logiciel: 'NovaLCT', quand: 'toujours', titre: 'Types de fichiers',
    textes: [
      {
        citation: 'There are four types of configuration files at present, the module configuration file, the receiving card configuration file, the LED display configuration file and the system configuration file.',
        texte: 'Il existe aujourd\'hui quatre types de fichiers de configuration : celui du module, celui de la carte de réception, celui de l\'écran LED et celui du système.',
        source: 'novalct-guide-5-0-0', section: '§5.1.11',
      },
      {
        texte: 'Carte de réception : .rcfgx ou .rcfg ; connexion d\'écran : .scr ; système : .scfg. Range le .scr ou le .scfg dans « autre fichier ».',
        source: 'novalct-manuel-5-4-7-1', section: '§5.2.2.1 et §5.2.4',
      },
    ],
  },
  {
    id: 'N2', logiciel: 'NovaLCT', quand: 'toujours', titre: 'Enregistrer le rcfgx',
    textes: [{
      texte: '« Enregistrez toujours les fichiers rcfgx après avoir effectué des modifications afin d\'éviter de perdre les configurations. »',
      source: 'ledincloud-novalct',
    }],
  },
  {
    id: 'N3', logiciel: 'NovaLCT', quand: 'toujours', titre: 'Charger sans modifier',
    textes: [{
      texte: 'Un .rcfgx chargé puis envoyé sans modifier aucun paramètre garde les réglages d\'origine du fichier. Si tu modifies un paramètre, '
        + 'NovaLCT applique les réglages de sa version, et le rendu peut être anormal si le fichier est mal lu.',
      source: 'novalct-notes-5-8-1', section: '§2.2',
    }],
  },
  {
    id: 'N4', logiciel: 'NovaLCT', quand: 'toujours', titre: 'Version du fichier',
    textes: [{
      texte: 'Au chargement, NovaLCT V5.8.1 affiche la version de NovaLCT qui a créé le fichier : note-la dans la version de la config.',
      source: 'novalct-notes-5-8-1', section: '§5.1',
    }],
  },
  {
    id: 'N5', logiciel: 'NovaLCT', quand: 'toujours', titre: 'Mise à jour du programme',
    textes: [{
      citation: 'It not recommended changing the program unless there are problems with the hardware.',
      texte: 'Il n\'est pas recommandé de changer le programme, sauf en cas de problème matériel.',
      source: 'novalct-guide-5-0-0', section: 'chap. 15',
    }],
  },
  {
    id: 'N6', logiciel: 'NovaLCT', quand: 'firmwarePersonnalise', titre: 'Firmware personnalisé',
    textes: [
      {
        texte: '« Il existe une différence majeure entre un firmware standard et un firmware personnalisé. Ce dernier est conçu sur mesure [...] ; '
          + 'il est donc fortement déconseillé de le modifier sans consulter le fabricant de l\'écran. »',
        source: 'ledincloud-novalct',
      },
      {
        texte: 'La mise à jour en ligne des cartes de réception ne propose que les firmwares standard. '
          + 'Donc ne lance pas la mise à jour en ligne des cartes sur une dalle à firmware personnalisé : elle le remplacerait par un firmware standard.',
        source: 'novalct-notes-5-8-1', section: '§4.1.1',
      },
    ],
  },
  {
    id: 'N7', logiciel: 'NovaLCT', quand: 'lotsMelanges', titre: 'Multi-batch adjustment',
    textes: [
      {
        citation: 'Quickly adjust the chromaticity of each batch of cabinet to achieve the effect of reference model. After adjusting well, save the adjustment parameter into a file; next time, load the file to finish adjustment quickly without manual adjustment.',
        texte: 'Ajuste rapidement la chromaticité de chaque lot de caissons pour obtenir le rendu du modèle de référence. Une fois le réglage fait, '
          + 'enregistre ses paramètres dans un fichier ; la fois suivante, charge ce fichier pour finir le réglage vite, sans réglage manuel.',
        source: 'novalct-guide-5-0-0', section: 'chap. 10',
      },
      {
        texte: 'Le réglage multi-batch s\'enregistre dans un fichier .lxy.',
        source: 'novalct-manuel-5-4-7-1', section: '§6.3',
      },
    ],
  },
  {
    id: 'C1', logiciel: 'VMP', quand: 'toujours', titre: 'Contenu du NCP',
    textes: [{
      texte: 'Le NCP réunit dans un seul fichier le .rcfgx, le firmware de la carte de réception et l\'Image Booster. Selon la dalle, il contient aussi '
        + 'la compensation thermique, la fréquence adaptative et le multi-mode. Un NCP par modèle de dalle, chargé par VMP.',
      source: 'coex-wiki-ncp',
    }],
  },
  {
    id: 'C2', logiciel: 'VMP', quand: 'toujours', titre: 'Firmware dans le NCP',
    textes: [{
      texte: 'Le firmware est rangé dans le NCP pour qu\'une mise à jour vers la version standard ne fasse pas perdre les fonctions personnalisées.',
      source: 'coex-wiki-ncp',
    }],
  },
  {
    id: 'C3', logiciel: 'VMP', quand: 'toujours', titre: 'Cabinet Library',
    textes: [{
      texte: 'Importe le NCP dans la Cabinet Library du processeur avec VMP ; les versions récentes de VMP la synchronisent entre processeurs et ordinateurs.',
      source: 'coex-wiki-ncp',
    }],
  },
  {
    id: 'C4', logiciel: 'VMP', quand: 'toujours', titre: 'Dalles en A10s Pro',
    textes: [{
      texte: 'Les dalles neuves en A10s Pro sont livrées avec leur NCP ; pour les autres cartes Armor, le fabricant le produit sur demande.',
      source: 'coex-wiki-ncp',
    }],
  },
  {
    id: 'V1', logiciel: null, quand: 'cvt8', titre: 'Mise à jour du CVT8-5G',
    textes: [{
      texte: 'Le programme du CVT8-5G se met à jour par son port USB-B, avec NovaLCT V5.4.0 ou plus récent ; ce port ne sert pas au chaînage.',
      source: 'coex-cvt8-5g-v1-1-0',
    }],
  },
  {
    id: 'B1', logiciel: 'Tessera', quand: 'toujours', titre: 'Firmware du processeur',
    textes: [{
      citation: 'In most cases, using the latest processor firmware release is enough to ensure support for all known panel types.',
      texte: 'Dans la plupart des cas, la dernière version du firmware du processeur suffit pour prendre en charge tous les types de dalles connus.',
      source: 'tessera-manuel-3-5', section: '§14.5',
    }],
  },
  {
    id: 'B2', logiciel: 'Tessera', quand: 'toujours', titre: 'Firmware des dalles',
    textes: [
      {
        texte: 'Si Tessera affiche « XX detected devices are not running the specified firmware version » (XX appareils détectés n\'ont pas la version '
          + 'de firmware indiquée), le firmware des dalles ne correspond pas au fixture pack prioritaire.',
        source: 'tessera-manuel-3-5', section: '§14.5',
      },
      {
        citation: 'Reload firmware: Re-applies firmware for selected fixtures from the prioritized pack in the Fixture Library.',
        texte: 'Reload firmware : réapplique aux dalles sélectionnées le firmware du pack prioritaire de la Fixture Library.',
        source: 'tessera-manuel-3-5', section: '§7.3.1',
      },
    ],
  },
  {
    id: 'B3', logiciel: 'Tessera', quand: 'toujours', titre: 'Avant une mise à jour',
    textes: [
      {
        citation: 'It is best practice to export copies of important project files before a firmware upgrade.',
        texte: 'Il est recommandé d\'exporter une copie des fichiers de projet importants avant une mise à jour du firmware.',
        source: 'tessera-manuel-3-5', section: '§14.10',
      },
      {
        citation: 'Newer firmware versions are backwards compatible with older versions of firmware. However new projects created on newer versions of firmware will not normally work on older versions.',
        texte: 'Les nouvelles versions du firmware sont compatibles avec les anciennes. En revanche, un projet créé sur une version plus récente '
          + 'ne fonctionne normalement pas sur une version plus ancienne.',
        source: 'tessera-manuel-3-5', section: '§14.10',
      },
    ],
  },
  {
    id: 'B4', logiciel: 'Tessera', quand: 'lotsMelanges', titre: 'Calibration',
    textes: [
      {
        citation: 'The Selected Calibration drop-down menu allows the user to select between the different calibration profiles that are stored within the fixture\'s R2 or R2+ receiver card.',
        texte: 'Le menu Selected Calibration permet de choisir entre les profils de calibration stockés dans la carte de réception R2 ou R2+ de la dalle.',
        source: 'tessera-manuel-3-5', section: '§7.3.4',
      },
      {
        texte: 'Chaque dalle a une calibration d\'usine (factory) et trois mémoires ; la calibration est stockée dans le module : '
          + 'un module remplacé garde sa propre calibration.',
        source: 'formation-oliverdy-2026-09',
      },
    ],
  },
];

// Rappels à afficher pour le logiciel du processeur retenu, avec leurs sources complètes.
export function rappelsConfig({ logiciel, lotsMelanges = false, firmwarePersonnalise = false, cvt8 = false }) {
  const conditions = { toujours: true, lotsMelanges, firmwarePersonnalise, cvt8 };
  return RAPPELS
    .filter((r) => (r.logiciel === null || r.logiciel === logiciel) && conditions[r.quand])
    .map((r) => ({
      ...r,
      textes: r.textes.map((t) => ({ ...t, source: { id: t.source, ...SOURCES_RAPPELS[t.source] } })),
    }));
}

// Rappel N6 seul (firmware personnalisé), repris sous le champ Firmware dans l'onglet Base.
export function rappelFirmwarePersonnalise() {
  return rappelsConfig({ logiciel: 'NovaLCT', firmwarePersonnalise: true }).find((r) => r.id === 'N6');
}
