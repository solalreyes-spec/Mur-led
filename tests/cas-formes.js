// Formes libres (étape 9b) : cas fictifs, chacun inspiré d'une source publique citée (manuels, fiches, formation).
// Jamais le nom d'un client, d'une salle, d'un studio ni d'un événement, même pris dans une source publique.

import * as calculs from '../src/calculs.js';
import { dalleDeBase, processeurDeBase } from './base.js';
import { DALLE_1000X500 } from './dalles-fictives.js';

const NOVASTAR_60_8 = { frequenceHz: 60, bits: 8 };

// Liste de dalles absentes [colonne, rangée] : `rangees` de la colonne `colonne` (rangée 1 en haut).
const absentes = (colonne, rangees) => rangees.map((r) => [colonne, r]);

// Cas F1 : porte de 1 m × 2 m en bas au milieu d'un mur de 10 × 5 dalles de 500 mm (colonnes 5 et 6, rangées 2 à 5).
const PORTE = [...absentes(5, [2, 3, 4, 5]), ...absentes(6, [2, 3, 4, 5])];
// Cas F2 : escalier de 7 colonnes posées au sol, hauteurs 2, 3, 4, 5, 4, 3, 2 dalles (grille de 7 × 5, haut absent).
const ESCALIER = [...absentes(1, [1, 2, 3]), ...absentes(2, [1, 2]), ...absentes(3, [1]), ...absentes(5, [1]), ...absentes(6, [1, 2]), ...absentes(7, [1, 2, 3])];

// Cas F3 : trois écrans empilés, centrés (slide de la formation et transcription 13), de haut en bas.
const TROIS_ECRANS = [
  { nom: 'HAUT', colonnes: 34, rangees: 20 },
  { nom: 'MILIEU', colonnes: 36, rangees: 11, placement: { type: 'dessous', zone: 'HAUT', alignement: 'centre' } },
  { nom: 'BAS', colonnes: 34, rangees: 5, placement: { type: 'dessous', zone: 'MILIEU', alignement: 'centre' } },
];
// Position (x, y) de chaque zone dans la pixel map.
const positions = (m) => m.zones.map((z) => [z.nom, z.x, z.y]);
// Morceaux de chaque bloc et leurs ports : « nom affiché, ports ».
const morceaux = (groupes) => groupes.map((g) => g.parties.map((p) => `${p.nomAffiche} ${p.ports.colonnes}`));

// Câblage retenu d'une zone : premier et dernier numéro de colonne de chaque port.
const groupes = (e) => e.groupes.flatMap((g) => g.parties.flatMap((p) => p.ports.groupes));

export const CAS_FORMES = [
  {
    id: 'F1',
    etiquette: 'Cas F1',
    titre: 'Mur avec une porte (dalles absentes)',
    donnees: '10 × 5 dalles INFiLED EZ2.6 MK2 (500 mm, 192 × 192 px) ; porte de 1 m × 2 m en bas au milieu : colonnes 5 et 6, '
      + 'rangées 2 à 5 absentes ; 60 Hz, 8 bits (Novastar) ; S8 en 12 et 10 bits',
    attendu: '42 dalles, pixel map 1920 × 960 ; COEX MX40 Pro 3 ports (4 pour le mur plein) ; MCTRL660 4 ports, comme le mur plein '
      + '(rectangle NovaLCT) ; S8 en 12 bits 8 ports et 1 S8 (10 ports et 2 S8 pour le mur plein)',
    source: 'Fictif, inspiré du guide NovaLCT V5.5.0 (Set Blank, p. 22), de la FAQ Novastar (Q27, Q74, via un revendeur) et de la fiche '
      + 'MX40 Pro V1.2.2 (p. 2, « blank pixels do not count »)',
    etape: '9b',
    verifier(v, contexte) {
      const dalle = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const zone = { nom: 'Mur', colonnes: 10, rangees: 5 };
      const m = calculs.murZones(dalle, [{ ...zone, absentes: PORTE }]);
      const plein = calculs.murZones(dalle, [zone]);
      v.egal('dalles', m.dalles.total, 42);
      v.egal('pixel map inchangée (px)', [m.pxLargeur, m.pxHauteur, m.pxCanvas], [1920, 960, 1843200]);
      v.egal('pixels utiles', m.pxTotal, 1548288);

      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      const coex = calculs.evaluerProcesseur(m, dalle, mx40, NOVASTAR_60_8);
      v.egal('MX40 Pro : 3 ports, colonnes 1 à 3, 4 à 8, 9 et 10', [coex.totaux.ports.colonnes, groupes(coex)], [3, [[1, 3], [4, 8], [9, 10]]]);
      v.egal('MX40 Pro : port le plus chargé à 94,99 %, sans alerte des 95 %',
        [coex.groupes[0].chargeMax.px, Math.round(coex.groupes[0].chargeMax.taux * 10000) / 100, coex.groupes[0].chargeMax.auDela95], [626688, 94.99, false]);
      v.egal('MX40 Pro, mur plein : 4 ports', calculs.evaluerProcesseur(plein, dalle, mx40, NOVASTAR_60_8).totaux.ports.colonnes, 4);

      const mctrl = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('MCTRL660 : 4 ports, comme le mur plein (rectangle NovaLCT, vides compris)', [mctrl.totaux.ports.colonnes, groupes(mctrl)],
        [4, [[1, 3], [4, 6], [7, 9], [10, 10]]]);
      v.egal('MCTRL660 : charge du port 2 en rectangle (15 dalles pour 7 réelles)', mctrl.groupes[0].chargeMax.px, 15 * 36864);

      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const douze = calculs.evaluerProcesseur(m, dalle, s8, { frequenceHz: 60, bits: 12 });
      v.egal('S8 en 12 bits : 8 ports, un seul S8', [douze.totaux.ports.colonnes, douze.nombre], [8, 1]);
      const pleinDouze = calculs.evaluerProcesseur(plein, dalle, s8, { frequenceHz: 60, bits: 12 });
      v.egal('S8 en 12 bits, mur plein : 10 ports, deux S8', [pleinDouze.totaux.ports.colonnes, pleinDouze.nombre], [10, 2]);
      const dix = calculs.evaluerProcesseur(m, dalle, s8, { frequenceHz: 60, bits: 10 });
      v.egal('S8 en 10 bits : 4 ports (5 pour le mur plein), ports de 11 dalles à 96,5 %, alerte',
        [dix.totaux.ports.colonnes, calculs.evaluerProcesseur(plein, dalle, s8, { frequenceHz: 60, bits: 10 }).totaux.ports.colonnes, dix.groupes[0].chargeMax.auDela95],
        [4, 5, true]);
      v.egal('une porte en bas n\'est pas un saut dans une chaîne', m.sauts, []);
    },
  },
  {
    id: 'F2',
    etiquette: 'Cas F2',
    titre: 'Escalier (colonnes de hauteurs différentes)',
    donnees: '7 colonnes de ROE Black Pearl BP2 (176 × 176 px) posées au sol, hauteurs 2, 3, 4, 5, 4, 3, 2 dalles ; 60 Hz, 8 bits (Novastar) ; '
      + 'S8 en 10 et 12 bits',
    attendu: '23 dalles, pixel map 1232 × 880 ; MCTRL660 2 ports, le premier en rectangle de 20 dalles pour 14 (95,3 %, alerte) ; '
      + 'MX40 Pro 2 ports (colonnes 1 à 6, 98,6 %) ; S8 3 ports en 10 et en 12 bits',
    source: 'Fictif, inspiré des conseils de loueur sur les murs en escalier (ledmax.co) et du rectangle NovaLCT (formation, transcription 6 ; '
      + 'FAQ Novastar Q25, via un revendeur)',
    etape: '9b',
    verifier(v, contexte) {
      const dalle = dalleDeBase(contexte, 'roe-bp2');
      const m = calculs.murZones(dalle, [{ nom: 'Escalier', colonnes: 7, rangees: 5, absentes: ESCALIER }]);
      v.egal('dalles', m.dalles.total, 23);
      v.egal('pixel map (px), rectangle et pixels utiles', [m.pxLargeur, m.pxHauteur, m.pxCanvas, m.pxTotal], [1232, 880, 1084160, 712448]);

      const mctrl = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('MCTRL660 : 2 ports, colonnes 1 à 4 et 5 à 7', [mctrl.totaux.ports.colonnes, groupes(mctrl)], [2, [[1, 4], [5, 7]]]);
      v.egal('MCTRL660 : port 1 compté en rectangle de 4 × 5 dalles, alerte des 95 %',
        [mctrl.groupes[0].chargeMax.px, mctrl.groupes[0].chargeMax.auDela95], [20 * 30976, true]);

      const coex = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, 'coex-mx40-pro'), NOVASTAR_60_8);
      v.egal('MX40 Pro : 2 ports, colonnes 1 à 6 (21 dalles) et 7', [coex.totaux.ports.colonnes, groupes(coex)], [2, [[1, 6], [7, 7]]]);
      v.egal('MX40 Pro : 98,6 %, alerte', [coex.groupes[0].chargeMax.px, coex.groupes[0].chargeMax.auDela95], [21 * 30976, true]);

      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const dix = calculs.evaluerProcesseur(m, dalle, s8, { frequenceHz: 60, bits: 10 });
      v.egal('S8 en 10 bits (13 par port) : 2-3-4, 5-4-3, 2', [dix.totaux.ports.colonnes, groupes(dix)], [3, [[1, 3], [4, 6], [7, 7]]]);
      const douze = calculs.evaluerProcesseur(m, dalle, s8, { frequenceHz: 60, bits: 12 });
      v.egal('S8 en 12 bits (11 par port) : 2-3-4, 5-4, 3-2', [douze.totaux.ports.colonnes, groupes(douze)], [3, [[1, 3], [4, 5], [6, 7]]]);
    },
  },
  {
    id: 'F3',
    etiquette: 'Cas F3',
    titre: 'Trois écrans empilés (zones l\'une au-dessus de l\'autre)',
    donnees: 'Dalle fictive de 1 m × 0,5 m, 128 × 64 px ; HAUT 34 × 20, MILIEU 36 × 11 sous HAUT, BAS 34 × 5 sous MILIEU, centrés, '
      + 'sans écart ; MX40 Pro à 60 Hz en 8 bits',
    attendu: 'pixel map 4608 × 2304 ; 2 MX40 Pro coupés à X 2304, 10 + 10 ports ; variante « zones entières » : HAUT seul, MILIEU et BAS '
      + 'ensemble (comme la formation) ; « un processeur par zone » : 3',
    source: 'Fictif, inspiré de la slide « pixel maps, output 1 » de la formation et de la transcription 13 (mur du haut, bandeau du '
      + 'milieu, bandeau du bas ; les deux bandeaux sur la même électronique, série COEX)',
    etape: '9b',
    verifier(v, contexte) {
      const m = calculs.murZones(DALLE_1000X500, TROIS_ECRANS);
      v.egal('pixel map (px)', [m.pxLargeur, m.pxHauteur], [4608, 2304]);
      v.egal('positions des zones', positions(m), [['HAUT', 128, 0], ['MILIEU', 0, 1280], ['BAS', 128, 1984]]);
      v.egal('pixels utiles', m.pxTotal, 10207232);
      v.egal('taille réelle (m)', [m.largeurMm, m.hauteurMm], [36000, 18000]);
      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      const e = calculs.evaluerProcesseur(m, DALLE_1000X500, mx40, NOVASTAR_60_8);
      v.egal('2 MX40 Pro, coupés à X 2304', [e.nombre, e.groupes.map((g) => g.x)], [2, [[0, 2303], [2304, 4607]]]);
      v.egal('morceaux et ports', morceaux(e.groupes), [['HAUT 1/2 5', 'MILIEU 1/2 3', 'BAS 1/2 2'], ['HAUT 2/2 5', 'MILIEU 2/2 3', 'BAS 2/2 2']]);
      v.egal('ports du HAUT de 80 dalles : 99,3 %, alerte', e.groupes[0].chargeMax.auDela95, true);
      v.egal('variante « zones entières » : HAUT seul, MILIEU et BAS ensemble', [e.variantes.zonesEntieres.nombre, morceaux(e.variantes.zonesEntieres.groupes)],
        [2, [['HAUT 9'], ['MILIEU 6', 'BAS 3']]]);
      v.egal('variante « un processeur par zone » : 3', e.variantes.unParZone.nombre, 3);
    },
  },
  {
    id: 'F7',
    etiquette: 'Cas F7',
    titre: 'Deux bandeaux d\'une rangée, de chaque côté d\'un couloir',
    donnees: 'Deux bandeaux de 40 × 1 dalle INFiLED EZ2.6 MK2 (20 m × 0,5 m, 7680 × 192 px) ; B empilé sous A dans la pixel map, ou à droite ; '
      + 'MCTRL4K à 60 Hz en 8 bits',
    attendu: 'empilés : pixel map 7680 × 384, 1 MCTRL4K, 6 ports ; côte à côte : 15 360 px de large, 2 MCTRL4K',
    source: 'Fictif, d\'après la réponse de l\'utilisateur du 10/10/2026 (bandeaux d\'une seule rangée de chaque côté d\'un couloir) et la slide '
      + '« pixel maps, output 1 » de la formation (écrans empilés dans une sortie)',
    etape: '9b',
    verifier(v, contexte) {
      const dalle = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const mctrl4k = processeurDeBase(contexte, 'novastar-mctrl4k');
      const a = { nom: 'A', colonnes: 40, rangees: 1 };
      const empiles = calculs.murZones(dalle, [a, { nom: 'B', colonnes: 40, rangees: 1, placement: { type: 'dessous', zone: 'A' } }]);
      v.egal('empilés : pixel map et positions', [empiles.pxLargeur, empiles.pxHauteur, positions(empiles)], [7680, 384, [['A', 0, 0], ['B', 0, 192]]]);
      const e = calculs.evaluerProcesseur(empiles, dalle, mctrl4k, NOVASTAR_60_8);
      v.egal('empilés : 1 MCTRL4K, 3 ports par bandeau', [e.nombre, e.totaux.ports.colonnes, e.groupes[0].parties.map((p) => p.ports.colonnes)], [1, 6, [3, 3]]);
      v.egal('empilés : variantes', [e.variantes.zonesEntieres.nombre, e.variantes.unParZone.nombre], [1, 2]);
      const cote = calculs.murZones(dalle, [a, { nom: 'B', colonnes: 40, rangees: 1 }], { ecarts: 'colles' });
      const f = calculs.evaluerProcesseur(cote, dalle, mctrl4k, NOVASTAR_60_8);
      v.egal('côte à côte : 15 360 px, 2 MCTRL4K', [cote.pxLargeur, f.nombre], [15360, 2]);
    },
  },
  {
    id: 'F4',
    etiquette: 'Cas F4',
    titre: 'Écran central et deux écrans latéraux d\'un autre pitch (mur mixte, 1:1)',
    donnees: 'Centre 16 × 8 INFiLED EZ2.6 MK2 (192 × 192 px) ; côtés 6 × 2 INFiLED AR3.9 (500 × 1000 mm, 128 × 256 px), à 1 m du centre, '
      + 'haut aligné sur le haut du centre ; MCTRL4K à 60 Hz en 8 bits',
    attendu: '152 dalles ; pas de référence 2,604 mm, écart de 1 m = 384 px ; pixel map 5376 × 1536, X 0, 1152, 4608 ; 1 MCTRL4K, 10 ports ; '
      + 'un screen NovaLCT et un fichier de carte par dalle',
    source: 'Fictif, inspiré d\'une configuration type de fabricant (Unilight : écran principal de 8 × 4 m et deux écrans de 3 × 2 m), d\'un '
      + 'conseil de fabricant (Unishine : pitch plus grossier sur les côtés) et de la formation (transcription 12 : un screen et un fichier '
      + 'par type de dalle)',
    etape: '9b',
    verifier(v, contexte) {
      const centre = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const cote = dalleDeBase(contexte, 'infiled-ar3-9');
      const lateral = (nom) => ({ nom, colonnes: 6, rangees: 2, dalle: cote, basMm: 2000, ecartMm: 1000 });
      const m = calculs.murZones(centre, [{ ...lateral('GAUCHE'), ecartMm: undefined }, { nom: 'CENTRE', colonnes: 16, rangees: 8, ecartMm: 1000 }, lateral('DROITE')]);
      v.egal('dalles, mur mixte', [m.dalles.total, m.mixte], [152, true]);
      v.egal('pas de référence : le plus fin (500 ÷ 192 mm)', Math.round(m.pas.mm * 1000) / 1000, 2.604);
      v.egal('pixel map, X et Y des zones', [m.pxLargeur, m.pxHauteur, positions(m)], [5376, 1536, [['GAUCHE', 0, 0], ['CENTRE', 1152, 0], ['DROITE', 4608, 0]]]);
      v.egal('pixels utiles', m.pxTotal, 5505024);
      v.egal('taille réelle (mm)', [m.largeurMm, m.hauteurMm], [16000, 4000]);
      const e = calculs.evaluerProcesseur(m, centre, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      v.egal('1 MCTRL4K, 10 ports (1 par côté, 8 au centre)', [e.nombre, e.totaux.ports.colonnes, e.groupes[0].parties.map((p) => p.ports.colonnes)], [1, 10, [1, 8, 1]]);
      v.vrai('un screen NovaLCT et un fichier de carte par dalle', e.notes.some((n) => /un screen NovaLCT par dalle/.test(n) && /RCFG/.test(n)));
    },
  },
  {
    id: 'F5',
    etiquette: 'Cas F5',
    titre: 'Mur et plafond de dalles différentes (Brompton)',
    donnees: 'Mur 37 × 9 ROE Black Pearl BP2 ; plafond 17 × 3 ROE Carbon CB8 et 8 demi-CB8 (rangée du bas, colonnes 1 à 8), au-dessus du mur, '
      + 'calé à droite ; SX40 à 60 Hz en 10 bits, XD',
    attendu: 'pixel map 6512 × 2088, plafond à X 5288 ; 2 SX40 et 4 XD (19 colonnes du mur, puis 18 colonnes et le plafond : 19 et 20 ports) ; '
      + 'variante « un processeur par zone » : 3 SX40 et 5 XD, comme le communiqué',
    source: 'Fictif pour la forme ; nombres de dalles, de processeurs et de distributeurs d\'un communiqué Brompton de 2020 sur un studio de '
      + 'production virtuelle (mur de BP2, plafond de CB8, 3 SX40 et 5 XD, dont 2 SX40 et 4 XD pour le mur)',
    etape: '9b',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const cb8 = dalleDeBase(contexte, 'roe-cb8');
      const demi = dalleDeBase(contexte, 'roe-cb8-demi');
      const plafond = {
        nom: 'PLAFOND', colonnes: 17, rangees: 3, dalle: cb8, demi, rangeeDemi: true, positionDemi: 'bas',
        absentes: [9, 10, 11, 12, 13, 14, 15, 16, 17].map((c) => [c, 4]), placement: { type: 'dessus', zone: 'MUR', alignement: 'droite' },
      };
      const m = calculs.murZones(bp2, [{ nom: 'MUR', colonnes: 37, rangees: 9 }, plafond]);
      v.egal('dalles : 333 BP2, 51 CB8 et 8 demi-CB8', [m.zones.map((z) => z.dalles), m.dalles.demi], [[333, 59], 8]);
      v.egal('pixels du mur et du plafond', m.zones.map((z) => z.pxTotal), [10315008, 570240]);
      v.egal('pixel map et positions', [m.pxLargeur, m.pxHauteur, positions(m)], [6512, 2088, [['MUR', 0, 504], ['PLAFOND', 5288, 0]]]);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const e = calculs.evaluerProcesseur(m, bp2, sx40, { frequenceHz: 60, bits: 10 });
      v.egal('2 SX40, 4 XD', [e.nombre, e.totaux.distributeurs.colonnes], [2, 4]);
      v.egal('morceaux et ports', morceaux(e.groupes), [['MUR 1/2 19'], ['MUR 2/2 18', 'PLAFOND 2']]);
      const ports = e.groupes[1].parties[1];
      v.egal('plafond : colonnes 1 à 12 (98,7 %, alerte), puis 13 à 17', [ports.ports.groupes, e.groupes[1].chargeMax.auDela95], [[[1, 12], [13, 17]], true]);
      const unParZone = e.variantes.unParZone;
      v.egal('un processeur par zone : 3 SX40 et 5 XD, comme le communiqué',
        [unParZone.nombre, unParZone.groupes.reduce((t, g) => t + g.distributeurs.colonnes, 0)], [3, 5]);
    },
  },
];
