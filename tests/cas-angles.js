// Angles et courbure (étape 9c) : cas fictifs, chacun inspiré d'une source publique citée (manuels, fiches, formation).
// Jamais le nom d'un client, d'une salle, d'un studio ni d'un événement, même pris dans une source publique.
// Repère (choix de conception du projet) : X vers la droite, Y vers le haut, Z vers le public, en mm ; lacet autour de Y (positif, la face
// tourne vers la droite), tangage autour de X (positif, la face penche vers le bas).

import * as calculs from '../src/calculs.js';
import { dalleDeBase, processeurDeBase } from './base.js';
import { DALLE_MAX_3M } from './dalles-fictives.js';

const BROMPTON_60_10 = { frequenceHz: 60, bits: 10 };
const NOVASTAR_60_8 = { frequenceHz: 60, bits: 8 };
// Arrondi à 0,1 mm ou 0,01°, comme le fichier des positions.
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const r2 = (x) => Math.round(x * 100) / 100 + 0;
// Une dalle de la forme réelle : centre (mm) et angles.
const dalleReelle = (f, id) => {
  const d = f.dalles.find((x) => x.id === id);
  if (!d) throw new Error(`Dalle ${id} absente de la forme réelle`);
  return [...d.centreMm.map(r1), r2(d.lacetDeg), r2(d.tangageDeg)];
};
const boite = (f) => [f.boiteMm.largeur, f.boiteMm.hauteur, f.boiteMm.profondeur].map(r1);
const erreur = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.message;
  }
  return '';
};
// Ce que la forme ne change pas : pixel map et processeurs.
const resumeData = (e) => [e.nombre, e.totaux.ports.colonnes, e.totaux.distributeurs?.colonnes ?? 0];

// Cas F5 de la 9b : mur de 37 × 9 BP2, plafond de 17 × 3 CB8 et 8 demi-CB8 (rangée du bas, colonnes 1 à 8), calé à droite.
const plafondF5 = (contexte, pose) => ({
  nom: 'PLAFOND', colonnes: 17, rangees: 3, dalle: dalleDeBase(contexte, 'roe-cb8'), demi: dalleDeBase(contexte, 'roe-cb8-demi'), rangeeDemi: true, positionDemi: 'bas',
  absentes: [9, 10, 11, 12, 13, 14, 15, 16, 17].map((c) => [c, 4]), placement: { type: 'dessus', zone: 'MUR', alignement: 'droite' }, ...(pose ? { pose } : {}),
});

export const CAS_ANGLES = [
  {
    id: 'G1',
    etiquette: 'Cas G1',
    titre: 'Mur courbe (courbure d\'une zone)',
    donnees: '37 × 9 ROE BP2 (500 mm, 176 × 176 px), concave 2,5° par jonction ; SX40 à 60 Hz en 10 bits',
    attendu: 'rayon 11 460,1 mm, corde 16 556,7 mm, profondeur 3 532,6 mm, 90° au total ; boîte 16 556,7 × 4 500 × 3 532,6 mm ; '
      + 'pixel map, processeurs et poids du mur à plat ; refus au-delà de concave 10° et en convexe',
    source: 'Fictif ; mur courbe de 333 BP2 d\'un communiqué Brompton de 2020 (forme non publiée) ; BP2 « Concave 10° » (manuel ROE V1.8, p. 13) ; '
      + 'modèle « Tile Angle » de disguise (angle d\'une dalle par rapport à sa voisine)',
    etape: '9c1',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const zone = { nom: 'MUR', colonnes: 37, rangees: 9 };
      const m = calculs.murZones(bp2, [{ ...zone, courbure: { sens: 'concave', angleDeg: 2.5 } }]);
      const plat = calculs.murZones(bp2, [zone]);
      const f = calculs.formeReelle(m, bp2);
      const c = f.zones[0].courbure;
      v.egal('rayon, corde, profondeur (mm), angle total (°)', [r1(c.rayonMm), r1(c.cordeMm), r1(c.profondeurMm), r2(c.angleTotalDeg)], [11460.1, 16556.7, 3532.6, 90]);
      v.egal('boîte réelle (mm) et développé', [...boite(f), f.developpeMm], [16556.7, 4500, 3532.6, 18500]);
      v.egal('colonnes 1, 19 et 37 (rangée du bas) : centre et lacet',
        [dalleReelle(f, 'C1 R9'), dalleReelle(f, 'C19 R9'), dalleReelle(f, 'C37 R9')],
        [[176.8, 250, -176.8, 45, 0], [8278.3, 250, -3532.6, 0, 0], [16379.9, 250, -176.8, -45, 0]]);
      v.egal('333 dalles dans la forme réelle', f.dalles.length, 333);
      v.egal('pixel map du mur à plat', [m.pxLargeur, m.pxHauteur, m.pxTotal], [plat.pxLargeur, plat.pxHauteur, plat.pxTotal]);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      v.egal('processeurs, ports et XD du mur à plat', resumeData(calculs.evaluerProcesseur(m, bp2, sx40, BROMPTON_60_10)),
        resumeData(calculs.evaluerProcesseur(plat, bp2, sx40, BROMPTON_60_10)));
      v.egal('poids du mur à plat', calculs.poids(m, bp2, { mode: 'accroche' }).dallesKg, 3113.55);
      v.vrai('note des crans des verrous', f.notes.some((n) => /crans/.test(n) && /2,5°/.test(n)));
      v.vrai('refus au-delà de concave 10°', /concave 10° au plus/.test(erreur(() => calculs.murZones(bp2, [{ ...zone, courbure: { sens: 'concave', angleDeg: 12.5 } }]))));
      v.vrai('refus en convexe : BP2 concave seulement', /concave seulement/.test(erreur(() => calculs.murZones(bp2, [{ ...zone, courbure: { sens: 'convexe', angleDeg: 2.5 } }]))));
      const pl = dalleDeBase(contexte, 'absen-pl2-5-pro-v10');
      const fPl = calculs.formeReelle(calculs.murZones(pl, [{ ...zone, courbure: { sens: 'concave', angleDeg: 2.5 } }]), pl);
      v.vrai('fiche sans courbure : alerte, pas de refus', fPl.alertes.some((a) => /courbure non donnée par la fiche/.test(a)));
    },
  },
  {
    id: 'G2',
    etiquette: 'Cas G2',
    titre: 'Plafond au-dessus d\'un mur (angle entre deux zones)',
    donnees: 'Cas F5 de la 9b (mur 37 × 9 BP2 à plat, plafond 17 × 3 CB8 et 8 demi-CB8, calé à droite), plafond plié à 90° concave sur le bord haut du mur',
    attendu: 'plafond face vers le bas à 4 500 mm, de x 8 300 à 18 500 et de z 0 à 4 200 ; boîte 18 500 × 4 500 × 4 200 mm ; Data du cas F5 ; '
      + 'alertes d\'angle au-delà des verrous et de zone au plafond',
    source: 'Fictif ; cas F5 (communiqué Brompton de 2020 : mur de BP2, plafond de CB8) ; dalles d\'angle et barres chanfreinées (manuel ROE V1.8, § 9)',
    etape: '9c1',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const mur = { nom: 'MUR', colonnes: 37, rangees: 9 };
      const m = calculs.murZones(bp2, [mur, plafondF5(contexte, { type: 'pliee', sens: 'concave', angleDeg: 90 })]);
      const plat = calculs.murZones(bp2, [mur, plafondF5(contexte, null)]);
      const f = calculs.formeReelle(m, bp2);
      v.egal('PLAFOND · C1 R4 (demi-dalle) et C17 R1 : centre, lacet, tangage',
        [dalleReelle(f, 'PLAFOND · C1 R4'), dalleReelle(f, 'PLAFOND · C17 R1')], [[8600, 4500, 300, 0, 90], [18200, 4500, 3600, 0, 90]]);
      v.egal('boîte réelle (mm)', boite(f), [18500, 4500, 4200]);
      v.egal('pixel map du cas F5', [m.pxLargeur, m.pxHauteur], [6512, 2088]);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      v.egal('2 SX40 et 4 XD, comme le cas F5', resumeData(calculs.evaluerProcesseur(m, bp2, sx40, BROMPTON_60_10)),
        resumeData(calculs.evaluerProcesseur(plat, bp2, sx40, BROMPTON_60_10)));
      v.egal('un pli : PLAFOND sur le bord haut de MUR, 90° concave', f.plis.map((p) => [p.zones, p.bord, p.sens, p.angleDeg]), [[['MUR', 'PLAFOND'], 'haut', 'concave', 90]]);
      v.vrai('alerte : angle au-delà des verrous des deux dalles', f.alertes.some((a) => /PLAFOND/.test(a) && /au-delà des verrous/.test(a)));
      const p = calculs.poids(m, bp2, { mode: 'accroche' });
      v.vrai('alerte : zone au plafond, maximum écrit pour une accroche verticale', p.alertes.some((a) => /PLAFOND/.test(a) && /accroche verticale/.test(a)));
    },
  },
  {
    id: 'G3',
    etiquette: 'Cas G3',
    titre: 'Deux bandeaux face à face dans un couloir (pose libre)',
    donnees: 'Cas F7 de la 9b empilé (A et B de 40 × 1 INFiLED EZ2.6 MK2, B sous A dans la pixel map, MCTRL4K à 60 Hz en 8 bits) ; '
      + 'B posé face à A, couloir de 3 000 mm : coin bas gauche de sa face en x 20 000, y 0, z 3 000, lacet 180°',
    attendu: 'A · C1 en (250, 250, 0), lacet 0 ; B · C1 en (19 750, 250, 3 000), lacet 180° ; boîte 20 000 × 500 × 3 000 mm ; pixel map 7680 × 384, '
      + '1 MCTRL4K, 6 ports, inchangés',
    source: 'Fictif ; ta réponse du 10/10/2026 (bandeaux « de chaque côté d\'un couloir ») ; cas F7 de la 9b',
    etape: '9c1',
    verifier(v, contexte) {
      const ez = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const zones = (pose) => [{ nom: 'A', colonnes: 40, rangees: 1 },
        { nom: 'B', colonnes: 40, rangees: 1, placement: { type: 'dessous', zone: 'A' }, ...(pose ? { pose } : {}) }];
      const m = calculs.murZones(ez, zones({ type: 'libre', xMm: 20000, basMm: 0, zMm: 3000, lacetDeg: 180, tangageDeg: 0 }));
      const f = calculs.formeReelle(m, ez);
      v.egal('A · C1 et B · C1 : centre, lacet, tangage', [dalleReelle(f, 'A · C1 R1'), dalleReelle(f, 'B · C1 R1')], [[250, 250, 0, 0, 0], [19750, 250, 3000, 180, 0]]);
      v.egal('boîte réelle (mm)', boite(f), [20000, 500, 3000]);
      v.egal('pixel map 7680 × 384', [m.pxLargeur, m.pxHauteur], [7680, 384]);
      const mctrl4k = processeurDeBase(contexte, 'novastar-mctrl4k');
      const e = calculs.evaluerProcesseur(m, ez, mctrl4k, NOVASTAR_60_8);
      v.egal('1 MCTRL4K, 6 ports', resumeData(e).slice(0, 2), [1, 6]);
      v.egal('processeurs, ports et distributeurs du cas F7 empilé, à plat', resumeData(e), resumeData(calculs.evaluerProcesseur(calculs.murZones(ez, zones(null)), ez, mctrl4k, NOVASTAR_60_8)));
      v.egal('pose libre : aucun pli', f.plis, []);
    },
  },
  {
    id: 'G4',
    etiquette: 'Cas G4',
    titre: 'Coin d\'une pièce (angle concave de 90°)',
    donnees: 'A 12 × 6 INFiLED EZ2.6 MK2 (6 × 3 m), B 8 × 6 à droite de A, plié à 90° concave ; MCTRL4K',
    attendu: 'B · C1 R6 en (6 000, 250, 250), lacet −90° ; B · C8 R6 en (6 000, 250, 3 750) ; boîte 6 000 × 3 000 × 4 000 mm ; pixel map 3840 × 1152 ; '
      + 'alerte « courbure non donnée par la fiche » au pli',
    source: 'Fictif ; murs en angle (cahier des charges du projet) ; dalles d\'angle à 90° (manuel ROE V1.8, § 9)',
    etape: '9c1',
    verifier(v, contexte) {
      const ez = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const m = calculs.murZones(ez, [{ nom: 'A', colonnes: 12, rangees: 6 }, { nom: 'B', colonnes: 8, rangees: 6, pose: { type: 'pliee', sens: 'concave', angleDeg: 90 } }], { ecarts: 'colles' });
      const f = calculs.formeReelle(m, ez);
      v.egal('B · C1 R6 et B · C8 R6 : centre, lacet, tangage', [dalleReelle(f, 'B · C1 R6'), dalleReelle(f, 'B · C8 R6')], [[6000, 250, 250, -90, 0], [6000, 250, 3750, -90, 0]]);
      v.egal('boîte réelle (mm)', boite(f), [6000, 3000, 4000]);
      v.egal('pixel map 3840 × 1152, comme à plat', [m.pxLargeur, m.pxHauteur, m.pxTotal], [3840, 1152, 4423680]);
      v.vrai('alerte : courbure de l\'EZ2.6 non donnée, pli à faire tenir autrement', f.alertes.some((a) => /A et B/.test(a) && /courbure non donnée par la fiche/.test(a)));
      v.vrai('pli concave : pas d\'alerte de caissons', !f.alertes.some((a) => /se touchent à l.arrière/.test(a)));
    },
  },
  {
    id: 'G5',
    etiquette: 'Cas G5',
    titre: 'Poteau habillé (quatre angles convexes)',
    donnees: 'Quatre zones A, B, C, D de 2 × 6 INFiLED EZ2.6 MK2 (1 × 3 m), chacune à droite de la précédente, pliée à 90° convexe',
    attendu: 'centres des colonnes 1 : A (250, z 0, lacet 0), B (1 000, z −250, 90°), C (750, z −1 000, 180°), D (0, z −750, −90°) ; boîte 1 000 × 3 000 × 1 000 mm ; '
      + 'alerte de caissons à chaque angle convexe (75,5 mm de profondeur)',
    source: 'Fictif ; murs en angle (cahier des charges du projet) ; profondeur de l\'EZ2.6 (LEDwallcentral, base tierce)',
    etape: '9c1',
    verifier(v, contexte) {
      const ez = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const convexe = { type: 'pliee', sens: 'convexe', angleDeg: 90 };
      const m = calculs.murZones(ez, [{ nom: 'A', colonnes: 2, rangees: 6 }, ...['B', 'C', 'D'].map((nom) => ({ nom, colonnes: 2, rangees: 6, pose: convexe }))], { ecarts: 'colles' });
      const f = calculs.formeReelle(m, ez);
      v.egal('colonnes 1 (rangée du bas) : centre, lacet',
        ['A', 'B', 'C', 'D'].map((z) => dalleReelle(f, `${z} · C1 R6`)),
        [[250, 250, 0, 0, 0], [1000, 250, -250, 90, 0], [750, 250, -1000, 180, 0], [0, 250, -750, -90, 0]]);
      v.egal('boîte réelle (mm)', boite(f), [1000, 3000, 1000]);
      const caissons = f.alertes.filter((a) => /se touchent à l.arrière/.test(a));
      v.egal('alerte de caissons aux trois plis', caissons.length, 3);
      v.vrai('profondeur et source de la profondeur citées', caissons.every((a) => /75,5 mm/.test(a) && /LEDwallcentral/.test(a)));
    },
  },
  {
    id: 'G6',
    etiquette: 'Cas G6',
    titre: 'Dalles tournées hors axe (Tessera T1)',
    donnees: 'Zone de 4 × 2 ROE BP2 tournée de 45° dans son plan ; T1 à 60 Hz, 8 bits réglés à la main',
    attendu: 'pixel map de 747 × 747 px ; 495 616 px comptés (deux fois chaque dalle), port à 94,4 %, appareil à 99,1 % ; 9 dalles : T1 refusé, M2 ; refus hors M2 et T1',
    source: 'Fictif ; manuel Tessera V3.5, § 7.14.5 (p. 101 et 102) et § 13.1.4 (p. 226)',
    etape: '9c4',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const zone = (colonnes, rangees) => calculs.murZones(bp2, [{ nom: 'BIAIS', colonnes, rangees, roulisDeg: 45 }]);
      const m = zone(4, 2);
      v.egal('pixel map : rectangle englobant de 747 × 747 px', [m.pxLargeur, m.pxHauteur], [747, 747]);
      v.egal('taille réelle : 2 121,3 × 2 121,3 mm', [r1(m.largeurMm), r1(m.hauteurMm)], [2121.3, 2121.3]);
      const csv = calculs.texteCSV(calculs.positionsDalles(m, bp2)).split('\n');
      const coin = (id) => csv.find((l) => l.startsWith(`${id},`)).split(',').slice(7, 9).map(Number);
      v.egal('coins haut gauche de C1 R1 et de C4 R2 dans la pixel map', [coin('C1 R1'), coin('C4 R2')], [[0, 497.8], [497.8, 248.9]]);
      v.vrai('roulis de 45° dans la liste', csv.slice(1).every((l) => l.endsWith(',45')));
      const t1 = processeurDeBase(contexte, 'brompton-t1');
      const e = calculs.evaluerProcesseur(m, bp2, t1, NOVASTAR_60_8);
      v.egal('T1 en 8 bits : 1 T1, 495 616 px comptés au port et à l\'appareil', [e.nombre, e.groupes[0].chargeMax.px, e.controles.pixels.valeur], [1, 495616, 495616]);
      v.egal('port à 94,4 %, sans alerte de port ; appareil à 99,1 % de 500 000 px',
        [Math.round(e.groupes[0].chargeMax.taux * 1000) / 10, e.groupes[0].chargeMax.auDela95, Math.round((e.controles.pixels.valeur / e.controles.pixels.limite) * 1000) / 10], [94.4, false, 99.1]);
      v.vrai('note : dalles hors axe comptées deux fois', e.notes.some((n) => /8 dalles hors axe comptées deux fois/.test(n)));
      const neuf = zone(3, 3);
      v.egal('9 dalles : 557 568 px, T1 refusé (2 T1), 1 M2', [calculs.evaluerProcesseur(neuf, bp2, t1, NOVASTAR_60_8).controles.pixels.valeur,
        calculs.evaluerProcesseur(neuf, bp2, t1, NOVASTAR_60_8).nombre, calculs.evaluerProcesseur(neuf, bp2, processeurDeBase(contexte, 'brompton-m2'), NOVASTAR_60_8).nombre], [557568, 2, 1]);
      for (const id of ['brompton-sx40', 'brompton-s8', 'brompton-s4']) {
        v.vrai(`${id} : refus, M2 et T1 seulement`, /rotation hors axe : Tessera M2 et T1 seulement \(manuel Tessera § 7\.14\.5\)/.test(calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, id), NOVASTAR_60_8).impossible ?? ''));
      }
      for (const id of ['novastar-mctrl4k', 'coex-mx40-pro', 'colorlight-vx20', 'megapixel-helios-8k']) {
        v.vrai(`${id} : refus, non documentée`, /rotation hors axe non documentée pour ce processeur/.test(calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, id), NOVASTAR_60_8).impossible ?? ''));
      }
    },
  },
  {
    id: 'G7',
    etiquette: 'Cas G7',
    titre: 'Zone accrochée sous un vide (reste de la 9b)',
    donnees: 'Dalle fictive de 500 mm, 9 kg, accroche 3,0 m au plus ; A 4 × 4, A · C2 R4 absente ; B 4 × 1 en dessous de A, accrochée sous A, écart vertical 600 mm',
    attendu: 'alerte « B · C2 accrochée sous un vide (A · C2 R4 absente) » ; hauteur comptée 3,1 m (écart compris), au-delà de 3,0 m',
    source: 'Fictif ; choix de conception du projet (zone accrochée sous des dalles absentes, écart compté dans le maximum en mètres)',
    etape: '9c1',
    verifier(v) {
      const m = calculs.murZones(DALLE_MAX_3M, [{ nom: 'A', colonnes: 4, rangees: 4, absentes: [[2, 4]] },
        { nom: 'B', colonnes: 4, rangees: 1, placement: { type: 'dessous', zone: 'A', ecartMm: 600, accrocheeSous: true } }]);
      const p = calculs.poids(m, DALLE_MAX_3M, { mode: 'accroche' });
      v.vrai('alerte : B · C2 accrochée sous un vide', p.alertes.some((a) => /B · C2 accrochée sous un vide \(A · C2 R4 absente\)/.test(a)));
      v.egal('une seule colonne sous un vide', p.alertes.filter((a) => /sous un vide/.test(a)).length, 1);
      v.egal('hauteur comptée pour le maximum (m), écart compris', p.maximum && [p.maximum.valeur, p.maximum.unite, p.maximum.ok], [3.1, 'm', false]);
    },
  },
];
