// Les 13 cas tests du cahier des charges (cahier des charges du projet, « Validation et sécurité »).
// Le cas 13 couvre quatre modules : il est découpé en quatre parties testées à des étapes différentes.
// Un cas sans fonction `verifier` est « à venir » : il n'est ni réussi ni en échec.
// `etape` = étape du plan où le cas doit passer au vert.

import * as calculs from '../src/calculs.js';
import * as format from '../src/format.js';
import {
  P10, P5, P16_DIP, DALLE_CAS_13, CABINET_CAS_4, CABINET_CAS_5, DALLE_CAS_6, DALLE_CAS_7,
  DALLE_CAS_9_A, DALLE_CAS_9_B, DALLE_CAS_9_C,
} from './dalles-fictives.js';
import { dalleDeBase, processeurDeBase } from './base.js';

const NOVASTAR_60_8 = { frequenceHz: 60, bits: 8 };

export const CAS = [
  {
    id: '1',
    titre: 'Grand mur P10',
    donnees: 'Dalles fictives de 640 mm, 64 × 64 px, 44 × 24',
    attendu: '1056 dalles, 28,16 × 15,36 m, 2816 × 1536 px, 432,54 m² (le support écrit 432,53), diagonale 32,08 m',
    source: 'Support Oliverdy p. 6',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(P10, { mode: 'dalles', colonnes: 44, lignes: 24 });
      const m = r.mur;
      v.egal('dalles', m.dalles.total, 1056);
      v.egal('taille (mm)', [m.largeurMm, m.hauteurMm], [28160, 15360]);
      v.egal('taille affichée (m)', [format.nombre(m.largeurMm / 1000, 2), format.nombre(m.hauteurMm / 1000, 2)], ['28,16', '15,36']);
      v.egal('résolution (px)', [m.pxLargeur, m.pxHauteur], [2816, 1536]);
      v.proche('surface exacte (m²)', m.surfaceM2, 432.5376, 1e-9);
      v.egal('surface affichée (m²)', format.nombre(m.surfaceM2, 2), '432,54');
      v.egal('diagonale affichée (m)', format.nombre(m.diagonaleM, 2), '32,08');
    },
  },
  {
    id: '2',
    titre: 'Taille pour une résolution',
    donnees: '768 × 576 px, dalles fictives P10 et P5',
    attendu: '7,68 × 5,76 m en P10 ; 3,84 × 2,88 m en P5, soit une surface 4 fois plus petite',
    source: 'Support Oliverdy p. 5',
    etape: 1,
    verifier(v) {
      const p10 = calculs.dimensionner(P10, { mode: 'resolution', largeurPx: 768, hauteurPx: 576 });
      const p5 = calculs.dimensionner(P5, { mode: 'resolution', largeurPx: 768, hauteurPx: 576 });
      v.egal('P10 : taille (mm)', [p10.mur.largeurMm, p10.mur.hauteurMm], [7680, 5760]);
      v.egal('P10 : résolution atteinte, écart (px)', [p10.ecart.largeur, p10.ecart.hauteur], [0, 0]);
      v.egal('P5 : taille (mm)', [p5.mur.largeurMm, p5.mur.hauteurMm], [3840, 2880]);
      v.egal('P5 : résolution atteinte, écart (px)', [p5.ecart.largeur, p5.ecart.hauteur], [0, 0]);
      v.proche('surface P10 / surface P5', p10.mur.surfaceM2 / p5.mur.surfaceM2, 4, 1e-9);
    },
  },
  {
    id: '3',
    titre: 'Densité',
    donnees: 'P16, pixel 2R1G1B',
    attendu: '3906 px/m² affichés (3 906,25 exact), 15 625 LED/m². Le support écrit 15 624 à cause d\'un arrondi intermédiaire',
    source: 'Support Oliverdy p. 16',
    etape: 1,
    verifier(v) {
      const d = calculs.densite(P16_DIP);
      v.proche('px/m² exact', d.pxParM2, 3906.25, 1e-9);
      v.egal('px/m² affichés', format.nombre(d.pxParM2, 0), '3906');
      v.proche('LED/m² exact', d.ledsParM2, 15625, 1e-9);
      v.egal('LED/m² affichées', format.nombre(d.ledsParM2, 0), '15 625');
    },
  },
  {
    id: '4',
    titre: 'Choix du processeur Novastar',
    donnees: 'Écran 3008 × 432 px, cabinets 64 × 48 px, 60 Hz, 8 bits',
    attendu: '423 cabinets, 1 299 456 px ; 211 cabinets par port, donc 3 ports ; MCTRL300 refusé (2 ports) malgré moins de 1,3 M px ; 6 ports avec redondance',
    source: 'Cahier des charges du projet (formation)',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.dimensionner(CABINET_CAS_4, { mode: 'resolution', largeurPx: 3008, hauteurPx: 432 }).mur;
      v.egal('cabinets', m.dalles.total, 423);
      v.egal('pixels', m.pxTotal, 1299456);
      const capacite = calculs.capacitePort('novastar', NOVASTAR_60_8);
      const parPort = calculs.dallesParPort(capacite, 64 * 48);
      v.egal('cabinets par port', parPort, 211);
      const c = calculs.cablage(m, parPort);
      v.egal('ports', c.auPlusJuste, 3);
      v.egal('ports avec redondance', c.redondance.auPlusJuste, 6);
      const mctrl300 = calculs.evaluerProcesseur(m, CABINET_CAS_4, processeurDeBase(contexte, 'novastar-mctrl300'), NOVASTAR_60_8);
      v.egal('MCTRL300 : 1 299 456 px tiennent dans 1,3 M', mctrl300.controles.pixels.nombre, 1);
      v.egal('MCTRL300 : 2 ports seulement', mctrl300.controles.ports.limite, 2);
      v.egal('MCTRL300 refusé seul, à cause des ports', [mctrl300.unSeulSuffit, mctrl300.limites], [false, ['ports']]);
    },
  },
  {
    id: '5',
    titre: 'Cabinets par port',
    donnees: '10 × 3 cabinets de 500 × 1000 mm, 192 × 384 px, 60 Hz, 8 bits',
    attendu: '5 × 3 m, 1920 × 1152 px, pitch 2,6 mm ; 8 cabinets par port, donc 4 ports, ou 5 si câblé par colonnes entières',
    source: 'Cahier des charges du projet (formation)',
    etape: 2,
    verifier(v) {
      const m = calculs.dimensionner(CABINET_CAS_5, { mode: 'dalles', colonnes: 10, lignes: 3 }).mur;
      v.egal('taille (mm)', [m.largeurMm, m.hauteurMm], [5000, 3000]);
      v.egal('résolution (px)', [m.pxLargeur, m.pxHauteur], [1920, 1152]);
      v.egal('pitch affiché (mm)', format.nombreCourt(calculs.pitchCalculeMm(CABINET_CAS_5), 1), '2,6');
      const parPort = calculs.dallesParPort(calculs.capacitePort('novastar', NOVASTAR_60_8), 192 * 384);
      v.egal('cabinets par port', parPort, 8);
      const c = calculs.cablage(m, parPort);
      v.egal('ports au plus juste', c.auPlusJuste, 4);
      v.egal('ports en colonnes entières', c.colonnes.ports, 5);
    },
  },
  {
    id: '6',
    titre: 'Port à la limite',
    donnees: '30 dalles de 208 × 104 px sur un port Novastar, 60 Hz, 8 bits',
    attendu: '648 960 px, soit 99,8 % des 650 000',
    source: 'Cahier des charges du projet (formation)',
    etape: 2,
    verifier(v) {
      const capacite = calculs.capacitePort('novastar', NOVASTAR_60_8);
      v.egal('capacité du port', calculs.entierInferieur(capacite), 650000);
      v.egal('dalles par port', calculs.dallesParPort(capacite, 208 * 104), 30);
      const charge = calculs.chargePort(30, DALLE_CAS_6.pxH * DALLE_CAS_6.pxV, capacite);
      v.egal('pixels sur le port', charge.px, 648960);
      v.egal('taux affiché (%)', format.nombre(charge.taux * 100, 1), '99,8');
      v.vrai('au-delà de 95 % : signalé', charge.auDela95);
    },
  },
  {
    id: '7',
    titre: 'Studio Brompton',
    donnees: '44 × 10 dalles de 500 mm, 192 × 192 px, 60 Hz',
    attendu: '22 × 5 m, 8448 × 1920 px ; alerte 16,2 M px, au-delà des 9 M px d\'un SX40 ; 3 SX40 (pixels 2, largeur 3 avec 21 colonnes au plus, hauteur 1, ports 2), découpés en 15, 15 et 14 colonnes ; 10 bits : 11 dalles par port, 44 ports en colonnes entières (15 + 15 + 14) et 6 XD (2 par SX40), 41 ports au plus juste (14 + 14 + 13) ; 8 bits : 14 par port, 32 ports au plus juste (11 + 11 + 10), 44 en colonnes entières, 6 XD. Note : décompte global du formateur, sans découpage par processeur : en 10 bits, 40 ports et 4 XD au plus juste, 44 ports et 5 XD en colonnes entières ; en 8 bits, 32 ports',
    source: 'Cahier des charges du projet (formation) ; découpage par processeur : choix de conception du projet',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.dimensionner(DALLE_CAS_7, { mode: 'dalles', colonnes: 44, lignes: 10 }).mur;
      v.egal('taille (mm)', [m.largeurMm, m.hauteurMm], [22000, 5000]);
      v.egal('résolution (px)', [m.pxLargeur, m.pxHauteur], [8448, 1920]);
      v.egal('pixels affichés (M)', format.nombre(m.pxTotal / 1e6, 1), '16,2');
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const e10 = calculs.evaluerProcesseur(m, DALLE_CAS_7, sx40, { frequenceHz: 60, bits: 10 });
      v.vrai('au-delà des 9 M px d\'un SX40 : signalé', e10.controles.pixels.depasse);
      v.egal('contrôles pixels, largeur, hauteur, ports', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e10.controles[c].nombre), [2, 3, 1, 2]);
      v.egal('largeur : 21 colonnes au plus par SX40', e10.controles.largeur.colonnesMax, 21);
      v.egal('SX40', e10.nombre, 3);
      v.egal('colonnes par SX40', e10.groupes.map((g) => g.colonnes), [15, 15, 14]);
      v.egal('10 bits : dalles par port', e10.dallesParPort, 11);
      v.egal('10 bits : ports en colonnes entières par SX40', e10.groupes.map((g) => g.ports.colonnes), [15, 15, 14]);
      v.egal('10 bits : XD par SX40', e10.groupes.map((g) => g.distributeurs.colonnes), [2, 2, 2]);
      v.egal('10 bits : ports en colonnes entières et XD', [e10.totaux.ports.colonnes, e10.totaux.distributeurs.colonnes], [44, 6]);
      v.egal('10 bits : ports au plus juste par SX40', e10.groupes.map((g) => g.ports.auPlusJuste), [14, 14, 13]);
      v.egal('10 bits : ports au plus juste', e10.totaux.ports.auPlusJuste, 41);
      v.egal('note, décompte global au plus juste : ports et XD', [e10.global.auPlusJuste, e10.global.distributeurs.auPlusJuste], [40, 4]);
      v.egal('note, décompte global en colonnes entières : ports et XD', [e10.global.colonnes.ports, e10.global.distributeurs.colonnes], [44, 5]);
      const e8 = calculs.evaluerProcesseur(m, DALLE_CAS_7, sx40, { frequenceHz: 60, bits: 8 });
      v.egal('8 bits : dalles par port', e8.dallesParPort, 14);
      v.egal('8 bits : ports au plus juste par SX40', e8.groupes.map((g) => g.ports.auPlusJuste), [11, 11, 10]);
      v.egal('8 bits : ports au plus juste, en colonnes entières, XD',
        [e8.totaux.ports.auPlusJuste, e8.totaux.ports.colonnes, e8.totaux.distributeurs.colonnes], [32, 44, 6]);
      v.egal('note, 8 bits : décompte global au plus juste', e8.global.auPlusJuste, 32);
    },
  },
  {
    id: '8',
    titre: 'Lignes élec',
    donnees: '230 V × 16 A = 3 680 W ; 220 V × 16 A = 3 520 W',
    attendu: 'Dalle de 135 W max : 27 théoriques, jamais appliqué par le formateur ; dalle de 300 W : 12 théoriques à 230 V, 11 à 220 V, 10 avec les 3 000 W du formateur (champ « puissance utile par ligne »), 9 avec 80 % à 220 V',
    source: 'Cahier des charges du projet (formation)',
    etape: 4,
    verifier(v) {
      v.egal('230 V × 16 A (W)', calculs.puissanceUtileLigne({ tensionV: 230, intensiteA: 16, marge: 1 }), 3680);
      v.egal('220 V × 16 A (W)', calculs.puissanceUtileLigne({ tensionV: 220, intensiteA: 16, marge: 1 }), 3520);
      v.egal('135 W : 27 théoriques à 230 V', calculs.dallesParLigne(135, { tensionV: 230, intensiteA: 16, marge: 1 }), 27);
      v.egal('300 W : 12 théoriques à 230 V', calculs.dallesParLigne(300, { tensionV: 230, intensiteA: 16, marge: 1 }), 12);
      v.egal('300 W : 11 à 220 V', calculs.dallesParLigne(300, { tensionV: 220, intensiteA: 16, marge: 1 }), 11);
      v.egal('300 W : 10 avec les 3 000 W du formateur', calculs.dallesParLigne(300, { puissanceUtileW: 3000 }), 10);
      v.egal('300 W : 9 avec 80 % à 220 V', calculs.dallesParLigne(300, { tensionV: 220, intensiteA: 16, marge: 0.8 }), 9);
    },
  },
  {
    id: '9',
    titre: 'Mapping interpolé Tessera',
    donnees: 'A : 5 mm, 500 × 500 mm, 100 × 100 px ; B : 7,8 mm, 64 × 64 px ; C : 15,6 mm, 1000 × 500 mm, 64 × 32 px',
    attendu: 'A compte 10 000 px, B 10 000 (4 096 en 1:1), C 20 000 (2 048 en 1:1), dans le canvas comme dans la charge du port ; interpolé seulement sur M2 et T1, SX40, S8 et S4 restent en 1:1',
    source: 'Manuel Tessera §6.5.1 et §13.1.4',
    etape: '3b',
    verifier(v, contexte) {
      const [A, B, C] = [DALLE_CAS_9_A, DALLE_CAS_9_B, DALLE_CAS_9_C];
      const reference = calculs.pitchLePlusFin([A, B, C]);
      v.proche('pitch le plus fin du mur (mm)', reference, 5, 1e-9);
      const interpole = (d) => calculs.pixelsInterpoles(d, reference).total;
      v.egal('mapping interpolé : A, B, C', [interpole(A), interpole(B), interpole(C)], [10000, 10000, 20000]);
      v.egal('en 1:1 : B, C', [B.pxH * B.pxV, C.pxH * C.pxV], [4096, 2048]);
      const compte = (id, d) => calculs.pixelsComptesMapping(d, processeurDeBase(contexte, id), reference);
      v.egal('M2 et T1 : C compte 20 000 px (canvas et charge du port)', [compte('brompton-m2', C), compte('brompton-t1', C)], [20000, 20000]);
      v.egal('S8 et S4 : C reste en 1:1, 2 048 px', [compte('brompton-s8', C), compte('brompton-s4', C)], [2048, 2048]);
      v.egal('SX40 : 1:1, avec son minimum de 64 px par dimension (64 × 64)', compte('brompton-sx40', C), 4096);
    },
  },
  {
    id: '10',
    titre: 'BP2V2 en 6 × 3,5 m',
    donnees: '84 dalles de 176 × 176 px, 60 Hz, processeur Brompton',
    attendu: '8 bits : 16 dalles par port, 6 ports ; 12 bits : 11 par port, 12 ports en colonnes, donc plus qu\'un S8',
    source: 'Cahier des charges du projet, corrigé',
    etape: 2,
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.dimensionner(bp2, { mode: 'taille', largeurMm: 6000, hauteurMm: 3500 }).mur;
      v.egal('dalles (12 × 7)', [m.colonnes, m.lignes, m.dalles.total], [12, 7, 84]);
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const e8 = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 8 });
      v.egal('8 bits : dalles par port', e8.dallesParPort, 16);
      v.egal('8 bits : ports', e8.global.auPlusJuste, 6);
      const e12 = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 12 });
      v.egal('12 bits : dalles par port', e12.dallesParPort, 11);
      v.egal('12 bits : ports en colonnes', e12.global.colonnes.ports, 12);
      v.egal('12 bits : plus qu\'un S8 (8 ports)', [e12.unSeulSuffit, e12.limites], [false, ['ports']]);
    },
  },
  {
    id: '11',
    titre: 'Capacités Brompton',
    donnees: 'Formule du module 4',
    attendu: '25 Hz 8 bits : 1 260 000 ; 144 Hz 12 bits : 145 833 ; 60 Hz 10 bits en ULL : 210 000',
    source: 'Manuel Tessera §13.1.4',
    etape: 2,
    verifier(v) {
      const c = (frequenceHz, bits, ull = false) => calculs.entierInferieur(calculs.capacitePort('brompton', { frequenceHz, bits, ull }));
      v.egal('25 Hz, 8 bits', c(25, 8), 1260000);
      v.egal('144 Hz, 12 bits', c(144, 12), 145833);
      v.egal('60 Hz, 10 bits, ULL', c(60, 10, true), 210000);
    },
  },
  {
    id: '12',
    titre: 'Capacités Novastar',
    donnees: 'Formule du module 4',
    attendu: '50 Hz 8 bits : 780 000 ; 30 Hz 10 ou 12 bits : 650 000',
    source: 'Support Oliverdy p. 34',
    etape: 2,
    verifier(v) {
      const c = (frequenceHz, bits) => calculs.entierInferieur(calculs.capacitePort('novastar', { frequenceHz, bits }));
      v.egal('50 Hz, 8 bits', c(50, 8), 780000);
      v.egal('30 Hz, 10 bits', c(30, 10), 650000);
      v.egal('30 Hz, 12 bits', c(30, 12), 650000);
    },
  },
  {
    id: '13 taille',
    titre: 'Récapitulatif du cahier des charges : taille',
    donnees: '6 × 3 m, dalles de 500 × 500 mm, 192 × 192 px',
    attendu: '72 dalles, 2304 × 1152 px',
    source: 'Cahier des charges du projet, recalculé',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(DALLE_CAS_13, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 });
      v.egal('colonnes × lignes', [r.mur.colonnes, r.mur.lignes], [12, 6]);
      v.egal('dalles', r.mur.dalles.total, 72);
      v.egal('résolution (px)', [r.mur.pxLargeur, r.mur.pxHauteur], [2304, 1152]);
      v.egal('écart à la cible (mm)', [r.ecart.largeur, r.ecart.hauteur], [0, 0]);
    },
  },
  {
    id: '13 data',
    titre: 'Récapitulatif du cahier des charges : data',
    donnees: '72 dalles de 192 × 192 px, Novastar 60 Hz 8 bits',
    attendu: '17 dalles par port, 5 ports (6 en colonnes entières), 10 avec redondance ; alerte 2,65 M px, au-delà d\'un MCTRL660',
    source: 'Cahier des charges du projet, recalculé',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.dimensionner(DALLE_CAS_13, { mode: 'dalles', colonnes: 12, lignes: 6 }).mur;
      const parPort = calculs.dallesParPort(calculs.capacitePort('novastar', NOVASTAR_60_8), 192 * 192);
      v.egal('dalles par port', parPort, 17);
      const c = calculs.cablage(m, parPort);
      v.egal('ports au plus juste, en colonnes entières', [c.auPlusJuste, c.colonnes.ports], [5, 6]);
      v.egal('redondance : au plus juste, en colonnes entières', [c.redondance.auPlusJuste, c.redondance.colonnes], [10, 12]);
      const mctrl660 = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('pixels affichés (M)', format.nombre(m.pxTotal / 1e6, 2), '2,65');
      v.vrai('au-delà d\'un MCTRL660 (2,3 M) : signalé', mctrl660.controles.pixels.depasse);
    },
  },
  {
    id: '13 élec',
    titre: 'Récapitulatif du cahier des charges : électricité',
    donnees: '72 dalles de 130 W',
    attendu: '9 360 W ; 16 A à 80 % : 21 dalles par ligne à 220 V (22 à 230 V) ; monophasé : 4 lignes ; 32 A tri : 6 lignes de 12 dalles, 2 par phase, 3 120 W par phase, et l\'option à 4 lignes avec au moins 3 900 W sur la phase la plus chargée',
    source: 'Cahier des charges du projet, recalculé',
    etape: 4,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const mono = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 32 } });
      v.egal('puissance totale (W)', mono.puissanceTotaleW, 9360);
      v.egal('16 A à 80 % : 21 dalles par ligne à 220 V', mono.dallesParLigne.retenu, 21);
      v.egal('22 à 230 V', calculs.dallesParLigne(130, { tensionV: 230, intensiteA: 16, marge: 0.8 }), 22);
      v.egal('monophasé : 4 lignes', mono.lignes.auPlusJuste.nombre, 4);
      const tri = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 32 } });
      const equilibre = tri.triphase.auPlusJuste.equilibre;
      v.egal('32 A tri : 6 lignes de 12 dalles', equilibre.lignes.map((l) => l.dalles), [12, 12, 12, 12, 12, 12]);
      v.egal('2 lignes par phase', equilibre.phases.map((p) => p.lignes), [2, 2, 2]);
      v.egal('3 120 W par phase', equilibre.phases.map((p) => p.puissanceW), [3120, 3120, 3120]);
      const minimum = tri.triphase.auPlusJuste.minimum;
      v.egal('option au minimum : 4 lignes', minimum.lignes.length, 4);
      v.vrai('option à 4 lignes : au moins 3 900 W sur la phase la plus chargée', Math.max(...minimum.phases.map((p) => p.puissanceW)) >= 3900);
    },
  },
  {
    id: '13 poids',
    titre: 'Récapitulatif du cahier des charges : poids',
    donnees: '72 dalles de 7,5 kg, 6 × 3 m',
    attendu: '540 kg (30 kg/m²)',
    source: 'Cahier des charges du projet, recalculé',
    etape: 5,
    verifier(v) {
      const p = calculs.poids(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, {});
      v.proche('poids des dalles (kg)', p.dallesKg, 540, 1e-9);
      v.proche('charge surfacique (kg/m²)', p.kgParM2, 30, 1e-9);
    },
  },
];
