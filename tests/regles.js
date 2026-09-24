// Règles complémentaires : décisions prises en cours de projet (« Décisions de cadrage du MVP »
// du cahier des charges du projet), hors des 13 cas tests.

import * as calculs from '../src/calculs.js';
import * as fiches from '../src/fiches.js';
import * as resumes from '../src/resumes.js';
import { modeEnregistrement } from '../src/export.js';
import {
  DALLE_CAS_13, P10, CB5, CB5_DEMI, CB5_DEMI_ATYPIQUE, DEMI_TROP_ETROITE,
  CABINET_CAS_4, CABINET_CAS_5, DALLE_CAS_7, DALLE_64, DALLE_64X32, DALLE_16, DALLE_256,
  DALLE_CARTE_A10S, DALLE_CARTE_CA50E, DALLE_200, DALLE_120, DALLE_12,
  DALLE_100W_CHAINAGE, DALLE_APPEL, DALLE_SANS_PMAX, DALLE_MAX_METRES, DALLE_MAX_KILOS,
} from './dalles-fictives.js';
import { processeurDeBase, liaisonsDeBase, regieDeBase, dalleDeBase, bumperDeBase, baseProcesseurs } from './base.js';

// Tableau du manuel Tessera v3.5 §13.1.4 (repris dans le cahier des charges du projet) :
// fréquence → [8, 10, 12 bits, 8, 10, 12 bits en ULL].
const TABLEAU_BROMPTON = {
  24: [1312500, 1050000, 875000, 656250, 525000, 437500],
  25: [1260000, 1008000, 840000, 630000, 504000, 420000],
  30: [1050000, 840000, 700000, 525000, 420000, 350000],
  48: [656250, 525000, 437500, 328125, 262500, 218750],
  50: [630000, 504000, 420000, 315000, 252000, 210000],
  60: [525000, 420000, 350000, 262500, 210000, 175000],
  72: [437500, 350000, 291667, 218750, 175000, 145833],
  100: [315000, 252000, 210000, 157500, 126000, 105000],
  120: [262500, 210000, 175000, 131250, 105000, 87500],
  144: [218750, 175000, 145833, 109375, 87500, 72917],
  150: [210000, 168000, 140000, 105000, 84000, 70000],
  180: [175000, 140000, 116667, 87500, 70000, 58333],
  192: [164063, 131250, 109375, 82031, 65625, 54688],
  200: [157500, 126000, 105000, 78750, 63000, 52500],
  240: [131250, 105000, 87500, 65625, 52500, 43750],
  250: [126000, 100800, 84000, 63000, 50400, 42000],
};

const BROMPTON_60_10 = { frequenceHz: 60, bits: 10 };
const NOVASTAR_60_8 = { frequenceHz: 60, bits: 8 };

export const REGLES = [
  {
    id: 'R1',
    titre: 'Taille cible : le plus proche par défaut, avec l\'écart signé',
    etape: 1,
    verifier(v) {
      // 5,8 m en CB5 (600 mm) : 10 colonnes = 6,0 m (+0,2) plutôt que 9 = 5,4 m (−0,4).
      const r = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 5800, hauteurMm: 2400 });
      v.egal('colonnes', r.mur.colonnes, 10);
      v.egal('écart largeur (mm)', r.ecart.largeur, 200);
      v.egal('lignes', r.mur.lignes, 2);
      v.egal('écart hauteur (mm)', r.ecart.hauteur, 0);
    },
  },
  {
    id: 'R2',
    titre: '« Ne pas dépasser » la largeur, sans toucher à la hauteur',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 5800, hauteurMm: 3500 }, { neDepassePasLargeur: true });
      v.egal('colonnes (9 = 5,4 m)', r.mur.colonnes, 9);
      v.egal('écart largeur (mm)', r.ecart.largeur, -400);
      v.egal('lignes : toujours le plus proche (3 = 3,6 m)', r.mur.lignes, 3);
    },
  },
  {
    id: 'R3',
    titre: '« Ne pas dépasser » la hauteur, sans toucher à la largeur',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 5800, hauteurMm: 3500 }, { neDepassePasHauteur: true });
      v.egal('lignes (2 = 2,4 m)', r.mur.lignes, 2);
      v.egal('écart hauteur (mm)', r.ecart.hauteur, -1100);
      v.egal('colonnes : toujours le plus proche (10 = 6,0 m)', r.mur.colonnes, 10);
    },
  },
  {
    id: 'R4',
    titre: 'À égalité d\'écart, la plus petite taille',
    etape: 1,
    verifier(v) {
      // 3 m en CB5 (1200 mm) : 2,4 m (−0,6) et 3,6 m (+0,6) sont à égalité.
      const r = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 });
      v.egal('lignes', r.mur.lignes, 2);
      v.egal('pas de demi-dalles sans la case cochée', r.mur.dalles.demi, 0);
    },
  },
  {
    id: 'R5',
    titre: 'Résolution cible : même règle, écart en pixels',
    etape: 1,
    verifier(v) {
      // 1000 px de large en P10 (64 px) : 16 colonnes = 1024 px (+24) plutôt que 15 = 960 (−40).
      const proche = calculs.dimensionner(P10, { mode: 'resolution', largeurPx: 1000, hauteurPx: 640 });
      v.egal('le plus proche : colonnes', proche.mur.colonnes, 16);
      v.egal('le plus proche : écart (px)', proche.ecart.largeur, 24);
      const contraint = calculs.dimensionner(P10, { mode: 'resolution', largeurPx: 1000, hauteurPx: 640 }, { neDepassePasLargeur: true });
      v.egal('ne pas dépasser : colonnes', contraint.mur.colonnes, 15);
      v.egal('ne pas dépasser : écart (px)', contraint.ecart.largeur, -40);
    },
  },
  {
    id: 'R6',
    titre: 'Variantes à ±1 colonne ou ligne toujours affichées',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(DALLE_CAS_13, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 }, { neDepassePasLargeur: true });
      v.egal('variantes', r.variantes.map((x) => x.libelle), ['−1 colonne', '+1 colonne', '−1 ligne', '+1 ligne']);
      v.egal('colonnes × lignes', r.variantes.map((x) => [x.mur.colonnes, x.mur.lignes]), [[11, 6], [13, 6], [12, 5], [12, 7]]);
      v.egal('écarts (mm)', r.variantes.map((x) => [x.ecart.largeur, x.ecart.hauteur]), [[-500, 0], [500, 0], [0, -500], [0, 500]]);
      v.egal('hors contrainte « ne pas dépasser »', r.variantes.map((x) => x.horsContrainte), [false, true, false, false]);
      const parNombre = calculs.dimensionner(DALLE_CAS_13, { mode: 'dalles', colonnes: 12, lignes: 6 });
      v.egal('aussi en mode nombre de dalles', parNombre.variantes.length, 4);
    },
  },
  {
    id: 'R7',
    titre: 'Demi-dalles cochées : rangée de demi-dalles quand elle rapproche de la cible',
    etape: 1,
    verifier(v) {
      // 3 m en CB5 : 2 rangées entières (2,4 m) + 1 rangée de demi-dalles (0,6 m) = 3,0 m.
      const r = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 }, { demi: CB5_DEMI });
      v.egal('rangées entières', r.mur.lignes, 2);
      v.egal('rangée de demi-dalles', r.mur.rangeeDemi, true);
      v.egal('écart hauteur (mm)', r.ecart.hauteur, 0);
      v.egal('dalles entières, demi-dalles, total', [r.mur.dalles.entieres, r.mur.dalles.demi, r.mur.dalles.total], [20, 10, 30]);
      v.egal('hauteur (px) : 2 × 208 + 104', r.mur.pxHauteur, 520);
      v.egal('fiche de la demi-dalle utilisée', r.mur.demi.id, 'test-cb5-demi');
    },
  },
  {
    id: 'R8',
    titre: 'Demi-dalle : sa propre fiche, jamais la moitié de la dalle entière',
    etape: 1,
    verifier(v) {
      const r = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 2, rangeeDemi: true }, { demi: CB5_DEMI_ATYPIQUE });
      v.egal('hauteur (px) : 2 × 208 + 100 lus dans la fiche', r.mur.pxHauteur, 516);
    },
  },
  {
    id: 'R9',
    titre: 'Rangée de demi-dalles en haut ou en bas, au choix',
    etape: 1,
    verifier(v) {
      const haut = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 2, rangeeDemi: true }, { demi: CB5_DEMI, positionDemi: 'haut' });
      const bas = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 2, rangeeDemi: true }, { demi: CB5_DEMI, positionDemi: 'bas' });
      v.egal('en haut (rangées de haut en bas)', haut.mur.rangees, ['demi', 'entiere', 'entiere']);
      v.egal('en bas (rangées de haut en bas)', bas.mur.rangees, ['entiere', 'entiere', 'demi']);
    },
  },
  {
    id: 'R10',
    titre: 'Cas impossibles signalés clairement',
    etape: 1,
    verifier(v) {
      const tropPetit = calculs.dimensionner(CB5, { mode: 'taille', largeurMm: 500, hauteurMm: 2400 }, { neDepassePasLargeur: true });
      v.egal('0,5 m sans dépasser en 600 mm : pas de mur', tropPetit.mur, null);
      v.vrai('0,5 m sans dépasser en 600 mm : message', tropPetit.erreurs.length > 0);
      const etroite = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 2, rangeeDemi: true }, { demi: DEMI_TROP_ETROITE });
      v.egal('demi-dalle moins large que la dalle : pas de mur', etroite.mur, null);
      v.vrai('demi-dalle moins large que la dalle : message', etroite.erreurs.length > 0);
      const sansFiche = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 2, rangeeDemi: true });
      v.vrai('rangée de demi-dalles sans fiche : message', sansFiche.erreurs.length > 0);
      const negatif = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: -2, lignes: 2 });
      v.vrai('nombre de colonnes négatif : message', negatif.erreurs.length > 0);
    },
  },
  {
    id: 'R11',
    titre: 'Densité sur les vrais pixels de la fiche',
    etape: 1,
    verifier(v) {
      // P2.6 de 500 mm à 192 px : 147 456 px/m², pas 147 929 comme avec un pitch arrondi à 2,6.
      v.proche('px/m²', calculs.densite(DALLE_CAS_13).pxParM2, 147456, 1e-9);
      v.proche('pitch calculé (mm)', calculs.pitchCalculeMm(DALLE_CAS_13), 500 / 192, 1e-12);
      v.egal('LED/m² inconnues sans la fiche', calculs.densite(DALLE_CAS_13).ledsParM2, null);
    },
  },
  {
    id: 'R12',
    titre: 'Capacité Brompton : la formule redonne le tableau du manuel, à l\'arrondi près',
    etape: 2,
    verifier(v) {
      const ecarts = [];
      let compares = 0;
      for (const [frequence, valeurs] of Object.entries(TABLEAU_BROMPTON)) {
        valeurs.forEach((attendu, i) => {
          const bits = [8, 10, 12][i % 3];
          const exacte = calculs.capacitePort('brompton', { frequenceHz: Number(frequence), bits, ull: i >= 3 });
          compares += 1;
          if (Math.abs(exacte - attendu) > 0.5) ecarts.push(`${frequence} Hz ${bits} bits${i >= 3 ? ' ULL' : ''}`);
        });
      }
      v.egal('valeurs comparées', compares, 96);
      v.egal('écarts de plus de 0,5 px', ecarts, []);
      v.egal('affichage à l\'entier inférieur : 192 Hz, 8 bits (164 062,5)', calculs.entierInferieur(calculs.capacitePort('brompton', { frequenceHz: 192, bits: 8 })), 164062);
    },
  },
  {
    id: 'R13',
    titre: 'Capacité Novastar : tableau du support Oliverdy',
    etape: 2,
    verifier(v) {
      const c = (frequenceHz, bits) => calculs.entierInferieur(calculs.capacitePort('novastar', { frequenceHz, bits }));
      v.egal('60 Hz : 8 bits, 10 bits', [c(60, 8), c(60, 10)], [650000, 325000]);
      v.egal('50 Hz : 8 bits, 10 bits', [c(50, 8), c(50, 10)], [780000, 390000]);
      v.egal('30 Hz : 8 bits, 12 bits', [c(30, 8), c(30, 12)], [1300000, 650000]);
    },
  },
  {
    id: 'R14',
    titre: 'MX40 Pro : 950 000 000 bit/s, 10 bits à part avec cartes A8s Pro ou A10s Pro',
    etape: 2,
    verifier(v, contexte) {
      const debitBps = processeurDeBase(contexte, 'coex-mx40-pro').debitUtileBps;
      const c = (bits, cartesPro = false) => calculs.entierInferieur(calculs.capacitePort('novastar', { frequenceHz: 60, bits, cartesPro, debitBps }));
      v.egal('8 bits', c(8), 659722);
      v.egal('10 bits avec cartes A8s Pro ou A10s Pro', c(10, true), 494791);
      v.egal('10 bits sans ces cartes', c(10), 329861);
      v.egal('12 bits, même avec ces cartes', c(12, true), 329861);
    },
  },
  {
    id: 'R15',
    titre: 'Colonne plus haute qu\'un port : segments égaux',
    etape: 2,
    verifier(v) {
      const parPort = calculs.dallesParPort(calculs.capacitePort('brompton', BROMPTON_60_10), 192 * 192);
      v.egal('dalles par port (192 × 192 px, 60 Hz, 10 bits)', parPort, 11);
      const colonne = (lignes) => calculs.cablage(calculs.mur(DALLE_CAS_7, 1, lignes), parPort).colonnes;
      v.egal('20 dalles : 2 segments de 10, pas 11 + 9', colonne(20).segments, [10, 10]);
      v.egal('20 dalles : ports', colonne(20).ports, 2);
      v.egal('21 dalles : 11 + 10', colonne(21).segments, [11, 10]);
      v.egal('23 dalles : 3 segments de 8, 8 et 7', colonne(23).segments, [8, 8, 7]);
      v.egal('3 colonnes de 20 dalles : 6 ports', calculs.cablage(calculs.mur(DALLE_CAS_7, 3, 20), parPort).colonnes.ports, 6);
    },
  },
  {
    id: 'R16',
    titre: 'Bit depth par défaut selon la marque, avec le rappel Tessera',
    etape: 2,
    verifier(v) {
      v.egal('Brompton', calculs.BIT_DEPTH_PAR_DEFAUT.brompton, 10);
      v.egal('Novastar', calculs.BIT_DEPTH_PAR_DEFAUT.novastar, 8);
      v.egal('rappel Tessera', calculs.RAPPEL_TESSERA,
        'Tessera est livré en 12 bits : passe le réglage réseau en 10 bits, ou calcule en 12 bits si tu ne peux pas le changer');
    },
  },
  {
    id: 'R17',
    titre: 'Bit depth réseau jamais inférieur à la source : règle propre à Tessera',
    etape: 2,
    verifier(v) {
      v.vrai('Brompton, réseau 8 bits, source SDI 10 bits : alerte', calculs.alerteBitDepthSource('brompton', 8, 10) !== null);
      v.egal('Brompton, réseau 10 bits, source 10 bits : rien', calculs.alerteBitDepthSource('brompton', 10, 10), null);
      v.egal('Novastar, réseau 8 bits, source 10 bits : rien', calculs.alerteBitDepthSource('novastar', 8, 10), null);
      v.egal('source non précisée : rien', calculs.alerteBitDepthSource('brompton', 8, null), null);
    },
  },
  {
    id: 'R18',
    titre: 'Port au-delà de 95 % signalé, pas en dessous',
    etape: 2,
    verifier(v) {
      const capacite = calculs.capacitePort('novastar', NOVASTAR_60_8);
      v.vrai('29 dalles de 208 × 104 px (96,5 %) : signalé', calculs.chargePort(29, 208 * 104, capacite).auDela95);
      v.egal('28 dalles (93,2 %) : pas signalé', calculs.chargePort(28, 208 * 104, capacite).auDela95, false);
    },
  },
  {
    id: 'R19',
    titre: 'Alerte de seuil : dalles ou colonnes en moins pour un port ou un processeur de moins',
    etape: 2,
    verifier(v, contexte) {
      const m4 = calculs.dimensionner(CABINET_CAS_4, { mode: 'resolution', largeurPx: 3008, hauteurPx: 432 }).mur;
      v.egal('cas 4 : 1 cabinet en moins évite le 3e port', calculs.cablage(m4, 211).seuil.dallesEnMoins, 1);
      const m13 = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m13, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('cas 13 en MCTRL660 : 4 colonnes en moins pour un seul processeur', e.seuil.colonnesEnMoins, 4);
    },
  },
  {
    id: 'R20',
    titre: 'Redondance Brompton : 50 dalles au plus par boucle',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_64, 10, 10);
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      v.egal('sans redondance : 102 dalles de 64 × 64 px par port', calculs.evaluerProcesseur(m, DALLE_64, s8, BROMPTON_60_10).dallesParPort, 102);
      v.egal('avec redondance : 50', calculs.evaluerProcesseur(m, DALLE_64, s8, { ...BROMPTON_60_10, redondance: true }).dallesParPort, 50);
      const mctrl = processeurDeBase(contexte, 'novastar-mctrl660');
      v.egal('Novastar avec redondance : pas de plafond (158)', calculs.evaluerProcesseur(m, DALLE_64, mctrl, { ...NOVASTAR_60_8, redondance: true }).dallesParPort, 158);
    },
  },
  {
    id: 'R21',
    titre: 'SX40 : chaque dalle compte au moins 64 px par dimension',
    etape: 2,
    verifier(v, contexte) {
      v.egal('dalle 64 × 32 px sur SX40', calculs.pixelsComptes(DALLE_64X32, processeurDeBase(contexte, 'brompton-sx40')), 4096);
      v.egal('dalle 64 × 32 px sur S8', calculs.pixelsComptes(DALLE_64X32, processeurDeBase(contexte, 'brompton-s8')), 2048);
    },
  },
  {
    id: 'R22',
    titre: 'Plusieurs processeurs : le plus grand des contrôles, puis découpage en colonnes entières',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const mctrl660 = processeurDeBase(contexte, 'novastar-mctrl660');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, mctrl660, NOVASTAR_60_8);
      v.egal('contrôles pixels, largeur, hauteur, ports', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e.controles[c].nombre), [2, 1, 1, 2]);
      v.egal('processeurs', e.nombre, 2);
      v.egal('colonnes par processeur', e.groupes.map((g) => g.colonnes), [6, 6]);
      v.egal('ports par processeur (colonnes entières)', e.groupes.map((g) => g.ports.colonnes), [3, 3]);
      const r = calculs.evaluerProcesseur(m, DALLE_CAS_13, mctrl660, { ...NOVASTAR_60_8, redondance: true });
      v.egal('redondance : processeurs', r.nombre, 3);
      v.egal('redondance : colonnes par processeur', r.groupes.map((g) => g.colonnes), [4, 4, 4]);
      v.egal('redondance : ports par processeur', r.groupes.map((g) => g.ports.redondance.colonnes), [4, 4, 4]);
    },
  },
  {
    id: 'R23',
    titre: 'Un XD n\'appartient qu\'à un seul processeur',
    etape: 2,
    verifier(v, contexte) {
      // 25 colonnes de 192 px = 4800 px : au-delà des 4094 px d'un SX40, donc 2 SX40 (13 et 12 colonnes).
      const m = calculs.mur(DALLE_CAS_7, 25, 10);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, sx40, BROMPTON_60_10);
      v.egal('SX40', e.nombre, 2);
      v.egal('colonnes par SX40', e.groupes.map((g) => g.colonnes), [13, 12]);
      v.egal('XD par SX40', e.groupes.map((g) => g.distributeurs.colonnes), [2, 2]);
      v.egal('XD au total : 4, pas 3', e.totaux.distributeurs.colonnes, 4);
      const r = calculs.evaluerProcesseur(m, DALLE_CAS_7, sx40, { ...BROMPTON_60_10, redondance: true });
      v.egal('redondance : 25 ports principaux, 20 au plus par SX40, donc 2 SX40', r.nombre, 2);
      v.egal('redondance : colonnes par SX40', r.groupes.map((g) => g.colonnes), [13, 12]);
      v.egal('redondance : XD par SX40 (2 principaux et 2 miroirs)', r.groupes.map((g) => g.distributeurs.redondance), [4, 4]);
      v.egal('redondance : XD au total', r.totaux.distributeurs.redondance, 8);
    },
  },
  {
    id: 'R24',
    titre: 'Mur plus haut que le canvas : découpage en rangées',
    etape: 2,
    verifier(v, contexte) {
      // 22 rangées de 192 px = 4224 px, au-delà des 4095 px de haut d'un SX40 : 2 SX40 de 11 rangées.
      const m = calculs.mur(DALLE_CAS_7, 4, 22);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      v.egal('contrôle hauteur', [e.controles.hauteur.depasse, e.controles.hauteur.nombre], [true, 2]);
      v.egal('SX40', e.nombre, 2);
      v.egal('grille : colonnes × rangées', [e.grille.colonnes, e.grille.rangees], [1, 2]);
      v.egal('rangées par SX40', e.groupes.map((g) => g.rangees), [11, 11]);
      v.egal('rangées 1 à 11, puis 12 à 22', e.groupes.map((g) => [g.premiereRangee, g.derniereRangee]), [[1, 11], [12, 22]]);
      v.egal('pas de message « impossible »', e.impossible, null);
    },
  },
  {
    id: 'R25',
    titre: 'Dalles maxi du processeur, quand la fiche les donne',
    etape: 2,
    verifier(v, contexte) {
      // 600 dalles de 16 × 16 px : 153 600 px et 480 × 320 px tiennent dans un T1, mais pas 600 dalles (500 maxi).
      const m = calculs.mur(DALLE_16, 30, 20);
      const e = calculs.evaluerProcesseur(m, DALLE_16, processeurDeBase(contexte, 'brompton-t1'), BROMPTON_60_10);
      v.egal('pixels, largeur, hauteur, ports : 1 T1', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e.controles[c].nombre), [1, 1, 1, 1]);
      v.egal('dalles : 2 T1', e.controles.dalles.nombre, 2);
      v.egal('T1 nécessaires', e.nombre, 2);
    },
  },
  {
    id: 'R26',
    titre: 'Processeur conseillé : le moins de processeurs, puis la plus petite capacité en pixels',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const novastar = contexte.processeurs.processeurs
        .filter((p) => p.famille === 'novastar')
        .map((p) => calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, p.id), NOVASTAR_60_8));
      const conseil = calculs.processeurConseille(novastar);
      v.egal('cas 13 en Novastar : VX6s (3,9 M, 6 ports) suffit seul', [conseil.processeur.id, conseil.nombre], ['novastar-vx6s', 1]);
      const mctrl = novastar.filter((e) => e.processeur.id.startsWith('novastar-mctrl3') || e.processeur.id === 'novastar-mctrl660');
      v.egal('entre MCTRL300 (3) et MCTRL660 (2) : 2 MCTRL660', calculs.processeurConseille(mctrl).processeur.id, 'novastar-mctrl660');
    },
  },
  {
    id: 'R27',
    titre: 'Préréglage 4K DCI : 4096 px de large si la hauteur ne dépasse pas 2160 px',
    etape: 2,
    verifier(v, contexte) {
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      // 16 dalles de 256 px = 4096 px, sur 8 rangées = 2048 px de haut : un seul SX40, en 4K DCI.
      const bas = calculs.evaluerProcesseur(calculs.mur(DALLE_256, 16, 8), DALLE_256, sx40, BROMPTON_60_10);
      v.egal('4096 × 2048 px : SX40', bas.nombre, 1);
      v.egal('4096 × 2048 px : format de canvas', bas.groupes[0].format, '4K DCI (préréglage)');
      // 9 rangées = 2304 px : au-delà de 2160, la limite redevient 4094 px (15 colonnes de 256 px).
      const haut = calculs.evaluerProcesseur(calculs.mur(DALLE_256, 16, 9), DALLE_256, sx40, BROMPTON_60_10);
      v.egal('4096 × 2304 px : colonnes au plus par SX40', haut.controles.largeur.colonnesMax, 15);
      v.egal('4096 × 2304 px : SX40', haut.nombre, 2);
      v.egal('4096 × 2304 px : canvas personnalisé', haut.groupes.map((g) => g.format), [null, null]);
    },
  },
  {
    id: 'R28',
    titre: 'Mur trop large et trop haut : découpage en grille',
    etape: 2,
    verifier(v, contexte) {
      // 30 × 25 dalles de 192 px = 5760 × 4800 px : 2 colonnes de processeurs × 2 rangées.
      const m = calculs.mur(DALLE_CAS_7, 30, 25);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      v.egal('contrôles pixels, largeur, hauteur, ports', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e.controles[c].nombre), [4, 2, 2, 3]);
      v.egal('SX40', e.nombre, 4);
      v.egal('grille : colonnes × rangées', [e.grille.colonnes, e.grille.rangees], [2, 2]);
      v.egal('colonnes par SX40', e.groupes.map((g) => g.colonnes), [15, 15, 15, 15]);
      v.egal('rangées par SX40', e.groupes.map((g) => g.rangees), [13, 13, 12, 12]);
      v.egal('ports par SX40 (colonnes de 13 dalles en 2 segments)', e.groupes.map((g) => g.ports.colonnes), [30, 30, 30, 30]);
    },
  },
  {
    id: 'R29',
    titre: 'Redondance SX40 : 20 ports principaux (trunks A et C), doublés par 2 XD miroirs (B et D)',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), { ...BROMPTON_60_10, redondance: true });
      v.egal('contrôle ports : 44 ports principaux pour 20 par SX40', [e.controles.ports.valeur, e.controles.ports.limite, e.controles.ports.nombre], [44, 20, 3]);
      v.egal('SX40', e.nombre, 3);
      v.egal('colonnes par SX40', e.groupes.map((g) => g.colonnes), [15, 15, 14]);
      v.egal('ports doublés par SX40', e.groupes.map((g) => g.ports.redondance.colonnes), [30, 30, 28]);
      v.egal('XD au total (4 par SX40)', e.totaux.distributeurs.redondance, 12);
    },
  },
  {
    id: 'R30',
    titre: 'Processeur conseillé : tient compte de la redondance',
    etape: 2,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const novastar = contexte.processeurs.processeurs
        .filter((p) => p.famille === 'novastar')
        .map((p) => calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, p.id), { ...NOVASTAR_60_8, redondance: true }));
      const conseil = calculs.processeurConseille(novastar);
      v.egal('cas 13 en redondance : 12 ports doublés, un MCTRL4K (16 ports) suffit', [conseil.processeur.id, conseil.nombre], ['novastar-mctrl4k', 1]);
      v.egal('le VX6s (6 ports) ne suffit plus seul', novastar.find((e) => e.processeur.id === 'novastar-vx6s').nombre, 2);
    },
  },
  {
    id: 'R31',
    titre: 'MX40 Pro : 20 ports en cuivre, 40 en mode optique avec convertisseurs',
    etape: 2,
    verifier(v, contexte) {
      // 24 colonnes de 10 dalles de 192 px : 24 ports en colonnes entières, 8,85 M px.
      const m = calculs.mur(DALLE_CAS_7, 24, 10);
      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      const cuivre = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx40, NOVASTAR_60_8);
      v.egal('cuivre : 2 MX40 Pro, limités par les ports', [cuivre.nombre, cuivre.limites], [2, ['ports']]);
      const optique = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx40, { ...NOVASTAR_60_8, modeOptique: true });
      v.egal('mode optique : limite de ports', optique.controles.ports.limite, 40);
      v.egal('mode optique : un seul MX40 Pro', optique.nombre, 1);
      const mctrl4k = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl4k'), { ...NOVASTAR_60_8, modeOptique: true });
      v.egal('sans mode optique dans sa fiche, le MCTRL4K garde 16 ports', mctrl4k.controles.ports.limite, 16);
    },
  },
  {
    id: 'R32',
    titre: 'Demi-dalle : vrais pixels pour la charge des ports, une dalle pour les limites en nombre',
    etape: 2,
    verifier(v, contexte) {
      // CB5 : 9 rangées de 104 × 208 px et une rangée de demi-dalles de 104 × 104 px, 60 Hz, 10 bits.
      const m = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 9, rangeeDemi: true }, { demi: CB5_DEMI }).mur;
      const e = calculs.evaluerProcesseur(m, CB5, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      v.egal('dalles entières par port', e.dallesParPort, 19);
      v.egal('colonnes par port (2 × 205 504 px ≤ 420 000)', e.global.colonnes.colonnesParPort, 2);
      v.egal('ports en colonnes entières (10 si la demi-dalle comptait pour une dalle)', e.global.colonnes.ports, 5);
      v.egal('ports au plus juste (6 si la demi-dalle comptait pour une dalle)', e.global.auPlusJuste, 5);
      v.egal('port le plus chargé en colonnes entières (px)', e.global.chargeMax.colonnes.px, 411008);
      v.egal('dalles comptées pour la limite du SX40 : 90 + 10 demi-dalles', e.controles.dalles.valeur, 100);
    },
  },
  {
    id: 'R33',
    titre: 'CX40 Pro : capacité de la fiche à 60 Hz, proportionnelle à la fréquence (déduit)',
    etape: '2b',
    verifier(v, contexte) {
      const cx40 = processeurDeBase(contexte, 'coex-cx40-pro');
      const c = (frequenceHz, bits) => calculs.capacitePortProcesseur(cx40, { frequenceHz, bits });
      v.egal('60 Hz : 8, 10 et 12 bits', [8, 10, 12].map((b) => calculs.entierInferieur(c(60, b).capacite)), [2951200, 2213200, 1475600]);
      v.egal('60 Hz : valeur de la fiche, pas déduite', c(60, 8).deduit, false);
      v.egal('50 Hz, 8 bits : 2 951 200 × 60 / 50', calculs.entierInferieur(c(50, 8).capacite), 3541440);
      v.egal('50 Hz : marqué déduit', c(50, 8).deduit, true);
    },
  },
  {
    id: 'R34',
    titre: 'Colorlight : 655 360 px à 60 Hz en 8 bits, la moitié en 10 et 12 bits (déduit, à confirmer)',
    etape: '2b',
    verifier(v, contexte) {
      const s6f = processeurDeBase(contexte, 'colorlight-s6f');
      const c = (frequenceHz, bits) => calculs.capacitePortProcesseur(s6f, { frequenceHz, bits });
      v.egal('60 Hz, 8 bits', calculs.entierInferieur(c(60, 8).capacite), 655360);
      v.egal('60 Hz, 8 bits : hypothèse à confirmer, pas déduite', [c(60, 8).deduit, c(60, 8).aConfirmer], [false, true]);
      v.egal('60 Hz, 10 et 12 bits : moitié', [c(60, 10), c(60, 12)].map((x) => calculs.entierInferieur(x.capacite)), [327680, 327680]);
      v.egal('10 bits : déduit et à confirmer', [c(60, 10).deduit, c(60, 10).aConfirmer], [true, true]);
      v.egal('50 Hz, 8 bits : 655 360 × 60 / 50, déduit', [calculs.entierInferieur(c(50, 8).capacite), c(50, 8).deduit], [786432, true]);
      v.egal('8 bits par défaut', calculs.BIT_DEPTH_PAR_DEFAUT.colorlight, 8);
    },
  },
  {
    id: 'R35',
    titre: 'MX20 : formule du MX40 Pro, à confirmer',
    etape: '2b',
    verifier(v, contexte) {
      const mx20 = processeurDeBase(contexte, 'coex-mx20');
      const c = calculs.capacitePortProcesseur(mx20, { frequenceHz: 60, bits: 8 });
      v.egal('60 Hz, 8 bits : comme le MX40 Pro', calculs.entierInferieur(c.capacite), 659722);
      v.egal('marqué à confirmer', c.aConfirmer, true);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 12, 6), DALLE_CAS_7, mx20, NOVASTAR_60_8);
      v.vrai('alerte « à confirmer » dans le résultat', e.alertes.some((a) => a.includes('confirmer')));
      v.egal('calculé quand même', e.nombre, 1);
    },
  },
  {
    id: 'R36',
    titre: 'Modèle à compléter : visible dans la base, jamais utilisé dans un calcul',
    etape: '2b',
    verifier(v, contexte) {
      const manquants = (id) => calculs.champsManquants(processeurDeBase(contexte, id));
      v.egal('MX30', manquants('coex-mx30'), ['capacite', 'pixelsMax', 'largeurMaxPx', 'hauteurMaxPx']);
      v.egal('X16E', manquants('colorlight-x16e'), ['pixelsMax', 'largeurMaxPx', 'hauteurMaxPx']);
      v.egal('VX20', manquants('colorlight-vx20'), ['largeurMaxPx', 'hauteurMaxPx']);
      v.egal('Z6', manquants('colorlight-z6'), ['capacite', 'ports']);
      v.egal('Z8t', manquants('colorlight-z8t'), ['capacite', 'ports', 'hauteurMaxPx']);
      v.egal('S6F et X8E complets', [manquants('colorlight-s6f'), manquants('colorlight-x8e')], [[], []]);
      const m = calculs.mur(DALLE_CAS_7, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'colorlight-vx20'), NOVASTAR_60_8);
      v.egal('VX20 : aucun calcul, champs à compléter', [e.nombre, e.aCompleter], [null, ['largeurMaxPx', 'hauteurMaxPx']]);
      v.egal('VX20 : pas de ports calculés', e.global, null);
      const conseil = calculs.processeurConseille([e]);
      v.egal('jamais conseillé', conseil, null);
    },
  },
  {
    id: 'R37',
    titre: 'CX40 Pro : cartes de réception 5G seulement',
    etape: '2b',
    verifier(v, contexte) {
      const cx40 = processeurDeBase(contexte, 'coex-cx40-pro');
      const evaluer = (dalle) => calculs.evaluerProcesseur(calculs.mur(dalle, 12, 6), dalle, cx40, NOVASTAR_60_8);
      const a10s = evaluer(DALLE_CARTE_A10S);
      v.egal('carte A10s : refusé', a10s.nombre, null);
      v.vrai('carte A10s : la raison cite les cartes 5G et l\'A10s', /5G/.test(a10s.impossible ?? '') && /A10s/.test(a10s.impossible ?? ''));
      const inconnue = evaluer(DALLE_CAS_7);
      v.egal('carte inconnue : calculé', inconnue.nombre, 1);
      v.vrai('carte inconnue : alerte', inconnue.alertes.some((a) => a.includes('5G')));
      const ca50e = evaluer(DALLE_CARTE_CA50E);
      v.egal('carte CA50E : calculé, sans alerte de carte', [ca50e.nombre, ca50e.alertes.some((a) => a.includes('5G'))], [1, false]);
    },
  },
  {
    id: 'R38',
    titre: 'Colorlight : nombre de processeurs et processeur conseillé',
    etape: '2b',
    verifier(v, contexte) {
      // Cas 13 : 12 × 6 dalles de 192 px, 2,65 M px ; 655 360 px par port donnent 17 dalles par port.
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const colorlight = contexte.processeurs.processeurs
        .filter((p) => p.famille === 'colorlight')
        .map((p) => calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, p.id), NOVASTAR_60_8));
      const nombre = (id) => colorlight.find((e) => e.processeur.id === id).nombre;
      v.egal('S6F (2,3 M px) : 2 ; X8E (5,24 M px) : 1', [nombre('colorlight-s6f'), nombre('colorlight-x8e')], [2, 1]);
      v.egal('X8E : dalles par port', colorlight.find((e) => e.processeur.id === 'colorlight-x8e').dallesParPort, 17);
      v.egal('conseillé : X8E', calculs.processeurConseille(colorlight).processeur.id, 'colorlight-x8e');
    },
  },
  {
    id: 'R39',
    titre: 'CX40 Pro : 6 ports 5G et 9 M px',
    etape: '2b',
    verifier(v, contexte) {
      // Cas 7 : 44 × 10 dalles de 192 px, 16,2 M px ; 80 dalles par port 5G en 8 bits.
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-cx40-pro'), NOVASTAR_60_8);
      v.egal('dalles par port', e.dallesParPort, 80);
      v.egal('contrôles pixels, largeur, hauteur, ports', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e.controles[c].nombre), [2, 1, 1, 1]);
      v.egal('CX40 Pro : 2, de 22 colonnes', [e.nombre, e.groupes.map((g) => g.colonnes)], [2, [22, 22]]);
    },
  },
  {
    id: 'R40',
    titre: 'M2, S4 et T1 : 1920 × 1080 natif, et formats qui forcent le Low Latency Mode',
    etape: '3a',
    verifier(v, contexte) {
      const m2 = processeurDeBase(contexte, 'brompton-m2');
      const b8 = { frequenceHz: 60, bits: 8 };
      const canvas = (e) => [e.nombre, e.groupes[0].canvas.format, e.groupes[0].canvas.lowLatency];
      v.egal('1600 × 1000 px : natif', canvas(calculs.evaluerProcesseur(calculs.mur(DALLE_200, 8, 5), DALLE_200, m2, b8)), [1, '1920 × 1080 (natif)', false]);
      v.egal('1600 × 1200 px : un M2 en Low Latency Mode', canvas(calculs.evaluerProcesseur(calculs.mur(DALLE_200, 8, 6), DALLE_200, m2, b8)), [1, '1600 × 1200 (Low Latency Mode)', true]);
      const large = calculs.evaluerProcesseur(calculs.mur(DALLE_120, 20, 5), DALLE_120, m2, b8);
      v.egal('2400 × 600 px : un M2 en 2880 × 720', canvas(large), [1, '2880 × 720 (Low Latency Mode)', true]);
      v.egal('2400 × 600 px : canvas fixe du format', [large.groupes[0].canvas.largeurPx, large.groupes[0].canvas.hauteurPx], [2880, 720]);
    },
  },
  {
    id: 'R41',
    titre: 'Canvas à régler : Tessera libre (largeur paire, 720 px mini), formats fixes, Novastar à la taille du bloc',
    etape: '3a',
    verifier(v, contexte) {
      const c = (id, largeurPx, hauteurPx) => {
        const x = calculs.canvasProcesseur(processeurDeBase(contexte, id), largeurPx, hauteurPx);
        return x && [x.largeurPx, x.hauteurPx, x.format];
      };
      v.egal('SX40, 2303 × 500 px : largeur paire, 720 px au minimum', c('brompton-sx40', 2303, 500), [2304, 720, null]);
      v.egal('SX40, 4096 × 2048 px : préréglage 4K DCI', c('brompton-sx40', 4096, 2048), [4096, 2160, '4K DCI (préréglage)']);
      v.egal('SX40, 4200 × 500 px : aucun format', c('brompton-sx40', 4200, 500), null);
      v.egal('M2, 1600 × 1000 px : 1920 × 1080 natif', c('brompton-m2', 1600, 1000), [1920, 1080, '1920 × 1080 (natif)']);
      v.egal('MCTRL660, 2303 × 500 px : à la taille du bloc', c('novastar-mctrl660', 2303, 500), [2303, 500, null]);
    },
  },
  {
    id: 'R42',
    titre: 'Coordonnées des blocs : de 0 à largeur − 1, dans le mur et dans la source',
    etape: '3a',
    verifier(v, contexte) {
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const cas7 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 44, 10), DALLE_CAS_7, sx40, BROMPTON_60_10);
      v.egal('cas 7 : x dans le mur', cas7.groupes.map((g) => g.x), [[0, 2879], [2880, 5759], [5760, 8447]]);
      v.egal('cas 7 : y dans le mur', cas7.groupes.map((g) => g.y), [[0, 1919], [0, 1919], [0, 1919]]);
      const grille = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 30, 25), DALLE_CAS_7, sx40, BROMPTON_60_10);
      v.egal('grille 2 × 2 : x', grille.groupes.map((g) => g.x[0]), [0, 2880, 0, 2880]);
      v.egal('grille 2 × 2 : y (13 rangées de 192 px au-dessus)', grille.groupes.map((g) => g.y), [[0, 2495], [0, 2495], [2496, 4799], [2496, 4799]]);
    },
  },
  {
    id: 'R43',
    titre: 'Liaisons : débit de pixels actifs comparé au format maxi (approximation)',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const controle = (id, largeurPx, hauteurPx, frequenceHz) => calculs.controleLiaison(liaisons.find((l) => l.id === id), { largeurPx, hauteurPx, frequenceHz });
      const ok = (...args) => controle(...args).ok;
      v.egal('HDMI 2.0 : 3840 × 2160 et 4096 × 2160 à 60 Hz', [ok('hdmi-2.0', 3840, 2160, 60), ok('hdmi-2.0', 4096, 2160, 60)], [true, true]);
      v.egal('HDMI 2.0 : format forcé 8192 × 1080 à 60 Hz, même débit', ok('hdmi-2.0', 8192, 1080, 60), true);
      v.egal('HDMI 2.0 : 4096 × 2400 à 60 Hz, trop', ok('hdmi-2.0', 4096, 2400, 60), false);
      v.egal('HDMI 1.4 : 3840 × 2160 à 60 Hz refusé, à 24 Hz accepté', [ok('hdmi-1.4', 3840, 2160, 60), ok('hdmi-1.4', 3840, 2160, 24)], [false, true]);
      v.egal('HDMI 1.3 : 2048 × 1536 à 75 Hz ; HDMI 1.0 à 1.2 : pas 1920 × 1200 à 60 Hz', [ok('hdmi-1.3', 2048, 1536, 75), ok('hdmi-1.2', 1920, 1200, 60)], [true, false]);
      v.egal('DVI single link : 1920 × 1200 à 60 Hz, pas 2560 × 1440', [ok('dvi-single', 1920, 1200, 60), ok('dvi-single', 2560, 1440, 60)], [true, false]);
      v.egal('DVI dual link : 2560 × 1600 à 60 Hz', ok('dvi-dual', 2560, 1600, 60), true);
      v.egal('3G-SDI : 1920 × 1080 à 60 Hz ; 12G-SDI : 3840 × 2160 à 60 Hz', [ok('3g-sdi', 1920, 1080, 60), ok('12g-sdi', 3840, 2160, 60)], [true, true]);
      const sdi6 = controle('6g-sdi', 3840, 2160, 30);
      v.egal('6G-SDI : UHD à 30 i/s, limite déduite', [sdi6.ok, sdi6.deduit], [true, true]);
      v.egal('6G-SDI : UHD à 60 i/s refusé', ok('6g-sdi', 3840, 2160, 60), false);
      const dp = controle('dp-1.2', 4096, 2160, 60);
      v.egal('DisplayPort 1.2 : 4096 × 2160 à 60 Hz, à confirmer', [dp.ok, dp.aConfirmer], [true, true]);
      v.egal('toujours marqué « approximation »', dp.approximation, true);
    },
  },
  {
    id: 'R44',
    titre: 'Entrée du processeur : la liaison doit exister, une entrée plus ancienne limite, la fiche reste prioritaire',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const entree = (id, largeurPx, hauteurPx, liaison) => calculs.controleEntree(processeurDeBase(contexte, id), { largeurPx, hauteurPx, frequenceHz: 60, liaison }, liaisons);
      const sx40 = entree('brompton-sx40', 3840, 2160, 'hdmi-2.0');
      v.egal('SX40 en HDMI 2.0, 3840 × 2160 à 60 Hz', [sx40.ok, sx40.liaison.id], [true, 'hdmi-2.0']);
      const mctrl = entree('novastar-mctrl660', 3840, 2160, 'hdmi-2.0');
      v.egal('MCTRL660 : son entrée HDMI 1.3 limite, refusé', [mctrl.ok, mctrl.liaison.id], [false, 'hdmi-1.3']);
      v.vrai('MCTRL660 : la raison cite l\'HDMI 1.3', /HDMI 1\.3/.test(mctrl.refus ?? ''));
      const dvi = entree('brompton-sx40', 1920, 1080, 'dvi-single');
      v.egal('SX40 en DVI : pas d\'entrée DVI', [dvi.ok, /DVI/.test(dvi.refus ?? '')], [false, true]);
      const s6f = entree('colorlight-s6f', 3840, 2160, 'hdmi-2.0');
      v.egal('S6F : sa fiche limite l\'entrée à 1920 × 1200', [s6f.ok, /1920 × 1200/.test(s6f.refus ?? '')], [false, true]);
      v.vrai('S6F : version HDMI non précisée, alerte', s6f.alertes.some((a) => a.includes('version')));
      v.egal('S6F : 1920 × 1080 à 60 Hz accepté', entree('colorlight-s6f', 1920, 1080, 'hdmi-2.0').ok, true);
      v.egal('MX40 Pro : 8192 × 1080 à 60 Hz en HDMI 2.0', entree('coex-mx40-pro', 8192, 1080, 'hdmi-2.0').ok, true);
    },
  },
  {
    id: 'R45',
    titre: 'Source : chaque bloc de processeur doit tenir dans l\'image source',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 44, 10), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const controle = (largeurPx, hauteurPx) => calculs.controleSource(
        { largeurPx, hauteurPx, frequenceHz: 60, bits: 10, liaison: 'hdmi-2.0', espace: 'RGB', plage: 'Full' },
        e, liaisons, { famille: 'brompton', bitsReseau: 10, frequenceHz: 60 },
      );
      v.egal('3840 × 2160 : les 3 blocs de 2880 × 1920 (ou 2688) tiennent', controle(3840, 2160).blocs.map((b) => b.tient), [true, true, true]);
      v.egal('3840 × 2160 : aucun refus', controle(3840, 2160).refus, []);
      v.egal('1920 × 1080 : aucun bloc ne tient', controle(1920, 1080).blocs.map((b) => b.tient), [false, false, false]);
      v.vrai('1920 × 1080 : refus', controle(1920, 1080).refus.length > 0);
    },
  },
  {
    id: 'R46',
    titre: 'Résolution de source non standard : alerte EDID',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const edid = (largeurPx, hauteurPx) => calculs.controleSource(
        { largeurPx, hauteurPx, frequenceHz: 60, bits: 10, liaison: 'hdmi-2.0', espace: 'RGB', plage: 'Full' },
        e, liaisons, { famille: 'brompton', bitsReseau: 10, frequenceHz: 60 },
      ).alertes.some((a) => a.includes('EDID'));
      v.egal('1920 × 1080 et 3840 × 2160 : pas d\'alerte', [edid(1920, 1080), edid(3840, 2160)], [false, false]);
      v.egal('2560 × 1440 : alerte', edid(2560, 1440), true);
    },
  },
  {
    id: 'R47',
    titre: 'Plage Limited : noirs laiteux ; RGB Full conseillé',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const alertes = (espace, plage) => calculs.controleSource(
        { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60, bits: 10, liaison: 'hdmi-2.0', espace, plage },
        e, liaisons, { famille: 'brompton', bitsReseau: 10, frequenceHz: 60 },
      ).alertes;
      v.vrai('Limited : alerte noirs laiteux', alertes('RGB', 'Limited').some((a) => a.includes('noirs laiteux')));
      v.vrai('YUV : alerte', alertes('YUV', 'Full').some((a) => a.includes('YUV')));
      v.egal('RGB Full : ni l\'une ni l\'autre', alertes('RGB', 'Full').some((a) => a.includes('noirs laiteux') || a.includes('YUV')), false);
    },
  },
  {
    id: 'R48',
    titre: 'Fréquence de la source au-dessus de celle du calcul data : alerte',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const alerte = (frequenceSource, frequenceData) => calculs.controleSource(
        { largeurPx: 1920, hauteurPx: 1080, frequenceHz: frequenceSource, bits: 10, liaison: 'hdmi-2.0', espace: 'RGB', plage: 'Full' },
        e, liaisons, { famille: 'brompton', bitsReseau: 10, frequenceHz: frequenceData },
      ).alertes.some((a) => a.includes('fréquence'));
      v.egal('source 60 Hz, data calculée à 50 Hz : alerte', alerte(60, 50), true);
      v.egal('source 50 Hz, data calculée à 60 Hz : rien (conseil du formateur)', alerte(50, 60), false);
    },
  },
  {
    id: 'R49',
    titre: 'Bit depth de la source : la règle Tessera passe dans le contrôle de la source',
    etape: '3a',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const alerte = (famille, bitsReseau, bits) => calculs.controleSource(
        { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60, bits, liaison: 'hdmi-2.0', espace: 'RGB', plage: 'Full' },
        e, liaisons, { famille, bitsReseau, frequenceHz: 60 },
      ).alertes.some((a) => a.includes('Tessera'));
      v.egal('Brompton, réseau 8 bits, source 10 bits : alerte', alerte('brompton', 8, 10), true);
      v.egal('Brompton, réseau 10 bits, source 10 bits : rien', alerte('brompton', 10, 10), false);
      v.egal('Novastar, réseau 8 bits, source 10 bits : rien', alerte('novastar', 8, 10), false);
    },
  },
  {
    id: 'R50',
    titre: 'Source conseillée : plus petit format standard qui contient le plus grand bloc, meilleure entrée du processeur',
    etape: '3b',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const conseil = (dalle, colonnes, lignes, proc, frequenceHz = 60) => {
        const s = calculs.sourceConseillee(calculs.evaluerProcesseur(calculs.mur(dalle, colonnes, lignes), dalle, proc, BROMPTON_60_10), liaisons, frequenceHz);
        return [s.largeurPx, s.hauteurPx, s.frequenceHz, s.liaison, s.standard];
      };
      v.egal('1920 × 960 px sur SX40 : 1920 × 1080, HDMI 2.0', conseil(DALLE_CAS_7, 10, 5, sx40), [1920, 1080, 60, 'hdmi-2.0', true]);
      v.egal('cas 7 : blocs de 2880 × 1920, donc 3840 × 2160', conseil(DALLE_CAS_7, 44, 10, sx40), [3840, 2160, 60, 'hdmi-2.0', true]);
      v.egal('4096 × 2048 px : 4096 × 2160', conseil(DALLE_256, 16, 8, sx40), [4096, 2160, 60, 'hdmi-2.0', true]);
      v.egal('fréquence du calcul data', conseil(DALLE_CAS_7, 10, 5, sx40, 50)[2], 50);
      v.egal('blocs de 1920 × 4032 px : aucun format standard, la taille du bloc', conseil(DALLE_CAS_7, 20, 21, sx40), [1920, 4032, 60, 'hdmi-2.0', false]);
      const entree = (id) => calculs.meilleureEntree(processeurDeBase(contexte, id), liaisons).id;
      v.egal('meilleure entrée : MCTRL660 (HDMI 1.3 plutôt que DVI)', entree('novastar-mctrl660'), 'hdmi-1.3');
      v.egal('meilleure entrée : S6F (HDMI de version inconnue compté au plus bas, donc DVI)', entree('colorlight-s6f'), 'dvi-single');
    },
  },
  {
    id: 'R51',
    titre: 'M2 et S4 : 2 073 600 px, un mur plein HD tient dans un seul processeur',
    etape: '3b',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_120, 16, 9);
      const b8 = { frequenceHz: 60, bits: 8 };
      for (const id of ['brompton-m2', 'brompton-s4']) {
        const e = calculs.evaluerProcesseur(m, DALLE_120, processeurDeBase(contexte, id), b8);
        v.egal(`${id} : 1920 × 1080 px, un seul, en natif`, [e.nombre, e.groupes[0].canvas.format], [1, '1920 × 1080 (natif)']);
      }
    },
  },
  {
    id: 'R52',
    titre: 'Rectangle englobant NovaLCT : le décompte en rectangles devient le conseil (MCTRL, VX, NovaPro)',
    etape: '3b',
    verifier(v, contexte) {
      const m13 = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m13, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('cas 13, MCTRL660 : au plus juste du formateur', e.global.auPlusJuste, 5);
      v.egal('cas 13 : rectangles NovaLCT, 6 ports de 2 colonnes × 6 rangées',
        [e.global.rectangles.ports, e.global.rectangles.colonnes, e.global.rectangles.rangees], [6, 2, 6]);
      v.egal('cas 13 : au plus juste non réalisable tel quel dans NovaLCT', e.global.auPlusJusteRealisable, false);
      const m4 = calculs.dimensionner(CABINET_CAS_4, { mode: 'resolution', largeurPx: 3008, hauteurPx: 432 }).mur;
      const e4 = calculs.evaluerProcesseur(m4, CABINET_CAS_4, processeurDeBase(contexte, 'novastar-mctrl300'), NOVASTAR_60_8);
      v.egal('cas 4 : 3 ports en rectangles, au plus juste réalisable', [e4.global.rectangles.ports, e4.global.auPlusJusteRealisable], [3, true]);
      const sx40 = calculs.evaluerProcesseur(m13, DALLE_CAS_13, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const mx40 = calculs.evaluerProcesseur(m13, DALLE_CAS_13, processeurDeBase(contexte, 'coex-mx40-pro'), NOVASTAR_60_8);
      v.egal('Brompton et COEX (VMP) : pas de contrainte de rectangle', [sx40.global.rectangles, mx40.global.rectangles], [null, null]);
    },
  },
  {
    id: 'R53',
    titre: 'Dalles de moins de 16 px : simple alerte Tessera, sans chiffrer',
    etape: '3b',
    verifier(v, contexte) {
      const alerte = (dalle, id, reglages) => calculs.evaluerProcesseur(calculs.mur(dalle, 10, 10), dalle, processeurDeBase(contexte, id), reglages)
        .alertes.some((a) => a.includes('barres de charge'));
      v.egal('dalle de 12 px sur S8 : alerte', alerte(DALLE_12, 'brompton-s8', BROMPTON_60_10), true);
      v.egal('dalle de 16 px sur S8 : rien', alerte(DALLE_16, 'brompton-s8', BROMPTON_60_10), false);
      v.egal('dalle de 12 px sur MCTRL660 : rien (règle Tessera)', alerte(DALLE_12, 'novastar-mctrl660', NOVASTAR_60_8), false);
      const s8 = calculs.evaluerProcesseur(calculs.mur(DALLE_12, 10, 10), DALLE_12, processeurDeBase(contexte, 'brompton-s8'), BROMPTON_60_10);
      v.egal('pas de chiffrage : dalles par port inchangées (420 000 / 144)', s8.dallesParPort, 2916);
    },
  },
  {
    id: 'R54',
    titre: 'Régie Barco E2 Gen 2 : une sortie par processeur, résolution et connectique de sortie',
    etape: '3b',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const e2 = regieDeBase(contexte, 'barco-e2-gen2');
      const cas7 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 44, 10), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const source = (largeurPx, hauteurPx, liaison = 'hdmi-2.0') => ({ largeurPx, hauteurPx, frequenceHz: 60, liaison });
      const controle = (evaluation, s, multiviewer = false) => calculs.controleRegie(e2, evaluation, s, liaisons, { multiviewer });
      const r = controle(cas7, source(3840, 2160));
      v.egal('cas 7 : 3 sorties nécessaires sur 8', [r.sortiesNecessaires, r.sortiesDisponibles, r.ok], [3, 8, true]);
      v.egal('multiviewer : 6 sorties 4K60', controle(cas7, source(3840, 2160), true).sortiesDisponibles, 6);
      v.egal('4096 × 2400 à 60 Hz : passe', controle(cas7, source(4096, 2400)).ok, true);
      v.egal('4096 × 2560 : trop haut pour une sortie', controle(cas7, source(4096, 2560)).ok, false);
      const sept = { ...cas7, nombre: 7 };
      v.egal('7 processeurs avec multiviewer : 7 sorties pour 6, refusé', controle(sept, source(3840, 2160), true).ok, false);
      const dix = { ...cas7, nombre: 10 };
      const hd = controle(dix, source(1920, 1080));
      v.egal('10 processeurs en 1920 × 1080 : mode 18 sorties 2048 × 1200', [hd.ok, hd.sortiesDisponibles], [true, 18]);
      v.egal('mode 18 sorties avec multiviewer : non retenu (à confirmer), refusé', controle(dix, source(1920, 1080), true).ok, false);
      v.egal('liaison DVI : la E2 n\'a pas de sortie DVI', controle(cas7, source(1920, 1080, 'dvi-single')).ok, false);
      v.egal('liaison 3G-SDI : sortie 12G-SDI', controle(cas7, source(1920, 1080, '3g-sdi')).ok, true);
    },
  },
  {
    id: 'R55',
    titre: 'Régie à compléter : visible, jamais utilisée dans un contrôle',
    etape: '3b',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const aquilon = regieDeBase(contexte, 'analogway-livepremier-aquilon');
      v.vrai('LivePremier Aquilon : champs manquants', calculs.champsManquantsRegie(aquilon).length > 0);
      v.egal('E2 Gen 2 : complète', calculs.champsManquantsRegie(regieDeBase(contexte, 'barco-e2-gen2')), []);
      const cas7 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 44, 10), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const r = calculs.controleRegie(aquilon, cas7, { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60, liaison: 'hdmi-2.0' }, liaisons, {});
      v.egal('aucun contrôle : ok indéterminé, champs à compléter listés', [r.ok, r.aCompleter.length > 0], [null, true]);
    },
  },
  {
    id: 'R56',
    titre: 'Source conseillée : taille du bloc en résolution personnalisée quand le format standard ne passe pas l\'entrée',
    etape: '3b',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const e = calculs.evaluerProcesseur(calculs.mur(bp2, 12, 6), bp2, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const s = calculs.sourceConseillee(e, liaisons, 60);
      v.egal('MCTRL660, mur de 2112 × 1056 px : 2112 × 1056 en HDMI 1.3, personnalisé', [s.largeurPx, s.hauteurPx, s.liaison, s.standard], [2112, 1056, 'hdmi-1.3', false]);
      v.egal('raison : le 3840 × 2160 ne passe pas l\'entrée', [s.raison, s.formatStandard], ['entree', [3840, 2160]]);
      const r = calculs.controleSource({ ...s, bits: 8, espace: 'RGB', plage: 'Full' }, e, liaisons, { famille: 'novastar', bitsReseau: 8, frequenceHz: 60 });
      v.egal('la source conseillée passe', r.refus, []);
      const edid = r.alertes.find((a) => a.includes('EDID')) ?? '';
      v.vrai('alerte EDID avec les deux autres options (entrée 4K, mur en 1920 × 1080)', edid.includes('entrée 4K') && edid.includes('1920 × 1080'));
    },
  },
  {
    id: 'R57',
    titre: 'Contrôle de processeur dépassé : alerte explicite',
    etape: '3b',
    verifier(v, contexte) {
      const e13 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.vrai('cas 13 : 2,65 M px au-delà des 2,3 M px d\'un MCTRL660', e13.alertes.some((a) => a.includes('2,65 M px') && a.includes('2,3 M px')));
      const e7 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 44, 10), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      v.vrai('cas 7 : 8448 px de large au-delà d\'un SX40', e7.alertes.some((a) => a.includes('8448 px')));
      const un = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      v.egal('un seul processeur suffit : pas d\'alerte de dépassement', un.alertes.filter((a) => a.includes('au-delà')), []);
    },
  },
  {
    id: 'R58',
    titre: 'Marge réglable : 84 BP2 V2 demandent 6 lignes à 80 %, 7 à 70 % et 8 à 60 %',
    etape: 4,
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 12, 7);
      const lignes = (marge) => calculs.electricite(m, bp2, { marge }).lignes.auPlusJuste.nombre;
      v.egal('P max retenue (W)', calculs.electricite(m, bp2, {}).pMax.dalle.valeurW, 190);
      v.egal('80 %, 70 %, 60 %', [lignes(0.8), lignes(0.7), lignes(0.6)], [6, 7, 8]);
    },
  },
  {
    id: 'R59',
    titre: 'Chaînage power du constructeur : la plus petite des deux limites',
    etape: 4,
    verifier(v, contexte) {
      const faible = calculs.electricite(calculs.mur(DALLE_100W_CHAINAGE, 10, 5), DALLE_100W_CHAINAGE, {}).dallesParLigne;
      v.egal('100 W, chaînage 7 : 28 en puissance, 7 retenues', [faible.puissance, faible.chainage, faible.retenu, faible.limite], [28, 7, 7, 'chaînage']);
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const lourde = calculs.electricite(calculs.mur(cb5, 10, 2), cb5, {}).dallesParLigne;
      v.egal('CB5 MKII (480 W, chaînage 7) : 5 en puissance, retenues', [lourde.puissance, lourde.chainage, lourde.retenu, lourde.limite], [5, 7, 5, 'puissance']);
    },
  },
  {
    id: 'R60',
    titre: 'Demi-dalles : leur propre P max',
    etape: 4,
    verifier(v) {
      const m = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 9, rangeeDemi: true }, { demi: CB5_DEMI }).mur;
      const e = calculs.electricite(m, CB5, {});
      v.egal('P max de la demi-dalle (W)', e.pMax.demi.valeurW, 250);
      v.egal('puissance totale : 90 × 480 + 10 × 250 (W)', e.puissanceTotaleW, 45700);
    },
  },
  {
    id: 'R61',
    titre: 'Triphasé : charge et intensité de chaque phase, contrôle face à l\'arrivée',
    etape: 4,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const tri32 = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 32 } });
      v.egal('32 A tri : 5 632 W utiles par phase', tri32.arrivee.capacitePhaseW, 5632);
      v.proche('intensité par phase (A)', tri32.triphase.auPlusJuste.equilibre.phases[0].intensiteA, 3120 / 220, 1e-9);
      v.egal('32 A tri : équilibre accepté', tri32.triphase.auPlusJuste.equilibre.ok, true);
      const tri16 = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 16 } });
      v.egal('16 A tri : 3 120 W pour 2 816 W par phase, refusé', tri16.triphase.auPlusJuste.equilibre.ok, false);
      v.vrai('16 A tri : alerte sur les phases', tri16.alertes.some((a) => a.includes('phase')));
    },
  },
  {
    id: 'R62',
    titre: 'Monophasé : l\'arrivée doit porter toutes les lignes',
    etape: 4,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const mono = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 32 } });
      v.egal('32 A mono : 9 360 W pour 5 632 W utiles, refusé', [mono.monophase.puissanceW, mono.monophase.capaciteW, mono.monophase.ok], [9360, 5632, false]);
      v.vrai('alerte sur l\'arrivée', mono.alertes.some((a) => a.includes('arrivée')));
      const petit = calculs.electricite(calculs.mur(DALLE_CAS_13, 4, 5), DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 16 } });
      v.egal('20 dalles (2 600 W) sur 16 A mono : accepté', petit.monophase.ok, true);
    },
  },
  {
    id: 'R63',
    titre: 'Lignes power en colonnes entières, avec l\'équilibre des phases',
    etape: 4,
    verifier(v) {
      const e = calculs.electricite(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 32 } });
      v.egal('colonnes de 6 dalles : 3 par ligne, 4 lignes', [e.lignes.colonnes.colonnesParLigne, e.lignes.colonnes.nombre], [3, 4]);
      v.egal('équilibre : 6 lignes de 2 colonnes', e.triphase.colonnes.equilibre.lignes.map((l) => l.colonnes), [2, 2, 2, 2, 2, 2]);
      const haute = calculs.electricite(calculs.mur(DALLE_CAS_13, 2, 30), DALLE_CAS_13, {});
      v.egal('colonne de 30 dalles, 21 par ligne : 2 segments de 15', haute.lignes.colonnes.segments, [15, 15]);
    },
  },
  {
    id: 'R64',
    titre: 'Courant d\'appel : pic d\'une ligne face au seuil magnétique bas (NF EN 60898-1)',
    etape: 4,
    verifier(v) {
      const m = calculs.mur(DALLE_APPEL, 12, 6);
      const appel = (courbe) => calculs.electricite(m, DALLE_APPEL, { courbe });
      const c = appel('C');
      v.egal('courbe C : 21 dalles × 5 A = 105 A pour 5 × 16 = 80 A', [c.appel.picLigneA, c.appel.seuilA, c.appel.ok], [105, 80, false]);
      v.vrai('alerte prudente (quelques millisecondes)', c.alertes.some((a) => a.includes('prudent')));
      v.egal('courbe D : 160 A, accepté', [appel('D').appel.seuilA, appel('D').appel.ok], [160, true]);
      v.egal('courbe B : 48 A', appel('B').appel.seuilA, 48);
      const inconnue = appel(null);
      v.egal('courbe inconnue : C', inconnue.appel.courbe, 'C');
      v.vrai('courbe inconnue : à vérifier avec l\'électricien', inconnue.alertes.some((a) => a.includes('courbe à vérifier avec l\'électricien')));
      v.egal('sans courant d\'appel dans la fiche : pas de contrôle', calculs.electricite(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, {}).appel, null);
    },
  },
  {
    id: 'R65',
    titre: 'Sans P max : 1 kVA/m² ; gabarit : P max estimée non sourcée',
    etape: 4,
    verifier(v, contexte) {
      const sans = calculs.electricite(calculs.mur(DALLE_SANS_PMAX, 4, 4), DALLE_SANS_PMAX, {});
      v.egal('dalle de 0,25 m² : 250 W estimés', [sans.pMax.dalle.valeurW, sans.pMax.dalle.estimee, sans.pMax.dalle.origine], [250, true, 'surface']);
      v.vrai('alerte 1 kVA/m²', sans.alertes.some((a) => a.includes('1 kVA/m²')));
      const p26 = dalleDeBase(contexte, 'gabarit-p2-6-interieur');
      const gabarit = calculs.electricite(calculs.mur(p26, 4, 4), p26, {});
      v.egal('gabarit P2.6 : 130 W estimés', [gabarit.pMax.dalle.valeurW, gabarit.pMax.dalle.estimee, gabarit.pMax.dalle.origine], [130, true, 'gabarit']);
      v.vrai('alerte non sourcé', gabarit.alertes.some((a) => a.includes('non sourcé')));
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const fiche = calculs.electricite(calculs.mur(bp2, 4, 4), bp2, {});
      v.egal('fiche avec P max : pas d\'estimation', [fiche.pMax.dalle.estimee, fiche.alertes.some((a) => a.includes('1 kVA/m²') || a.includes('non sourcé'))], [false, false]);
    },
  },
  {
    id: 'R66',
    titre: 'Maximum théorique à 230 V affiché à côté, et BTU/h',
    etape: 4,
    verifier(v) {
      const e = calculs.electricite(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, {});
      v.egal('ligne 16 A : 2 816 W utiles, 3 680 W théoriques à 230 V', [e.ligne.utileW, e.ligne.maxi230W], [2816, 3680]);
      v.egal('dalles de 130 W : 28 théoriques à 230 V', e.dallesParLigne.theoriques230, 28);
      v.proche('BTU/h = W × 3,412', e.btuH, 9360 * 3.412, 1e-6);
    },
  },
  {
    id: 'R67',
    titre: 'Départs réglables, arrivée en valeur libre',
    etape: 4,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      v.egal('départs de 32 A : 43 dalles de 130 W par ligne', calculs.electricite(m, DALLE_CAS_13, { departA: 32 }).dallesParLigne.retenu, 43);
      const libre = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 400 } });
      v.egal('arrivée tri 400 A (Powerlock) : 70 400 W utiles par phase', libre.arrivee.capacitePhaseW, 70400);
    },
  },
  {
    id: 'R68',
    titre: 'Poids : demi-dalles à leur propre poids, câbles entre dalles, autres charges suspendues',
    etape: 5,
    verifier(v) {
      const m = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 10, lignes: 9, rangeeDemi: true }, { demi: CB5_DEMI }).mur;
      const p = calculs.poids(m, CB5, { cablesKgParDalle: 0.5, autresKg: 30 });
      v.proche('dalles : 90 × 13,6 + 10 × 7,2 (kg)', p.dallesKg, 1296, 1e-9);
      v.proche('câbles : 100 dalles × 0,5 kg', p.cablesKg, 50, 1e-9);
      v.proche('charge suspendue : dalles, câbles, autres (kg)', p.suspenduKg, 1376, 1e-9);
      v.proche('une colonne : 9 × 13,6 + 7,2 + 10 × 0,5 (kg)', p.colonnes[0].kg, 134.6, 1e-9);
      const sansCables = calculs.poids(m, CB5, {});
      v.vrai('câbles à 0 : rappel', sansCables.alertes.some((a) => a.includes('câbles')));
    },
  },
  {
    id: 'R69',
    titre: 'Bumpers : poids, colonnes par bumper, CMU quand elle est donnée',
    etape: 5,
    verifier(v, contexte) {
      const barre2 = bumperDeBase(contexte, 'roe-carbon-barre-2-colonnes');
      const m = calculs.mur(CB5, 10, 2);
      const p = calculs.poids(m, CB5, { bumper: { poidsKg: barre2.poidsKg, colonnes: barre2.colonnes } });
      v.egal('5 barres de 2 colonnes', p.bumpers.length, 5);
      v.proche('poids des barres (kg)', p.bumpersKg, 44.75, 1e-9);
      v.proche('charge d\'une barre : 2 colonnes de 2 CB5 + 8,95 kg', p.bumpers[0].kg, 63.35, 1e-9);
      const cmu = calculs.poids(m, CB5, { bumper: { poidsKg: 8.95, colonnes: 2, cmuKg: 50 } });
      v.egal('CMU de 50 kg dépassée', cmu.bumpers[0].ok, false);
      v.vrai('alerte CMU du bumper', cmu.alertes.some((a) => a.includes('CMU')));
      const impair = calculs.poids(calculs.mur(CB5, 11, 2), CB5, { bumper: { poidsKg: 8.95, colonnes: 2 } });
      v.egal('11 colonnes en barres de 2 : 6 barres, la dernière sur 1 colonne', [impair.bumpers.length, impair.bumpers[5].colonnes], [6, [11, 11]]);
    },
  },
  {
    id: 'R70',
    titre: 'Pont continu à portées égales : 2, 3 et 4 points, au-delà renvoi au rigger',
    etape: 5,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const parts = (points, egales = true) => calculs.poids(m, DALLE_CAS_13, { accroche: { type: 'pont', points, porteesEgales: egales, poidsPontKg: 60 } }).points;
      v.proche('charge sur le pont : 540 kg de mur + 60 kg de pont', parts(3).totalKg, 600, 1e-9);
      v.egal('2 points', parts(2).points.map((p) => p.part), [0.5, 0.5]);
      v.egal('3 points : 18,75 %, 62,5 %, 18,75 %', parts(3).points.map((p) => p.part), [0.1875, 0.625, 0.1875]);
      v.egal('4 points : 13,3 %, 36,7 %, 36,7 %, 13,3 %', parts(4).points.map((p) => Math.round(p.part * 1000) / 10), [13.3, 36.7, 36.7, 13.3]);
      v.proche('3 points : 375 kg au point central', parts(3).points[1].kg, 375, 1e-9);
      v.egal('5 points : renvoi au rigger', [parts(5).renvoiRigger, parts(5).points], [true, null]);
      v.egal('portées inégales : renvoi au rigger', parts(3, false).renvoiRigger, true);
      v.egal('marqué indicatif', parts(3).indicatif, true);
    },
  },
  {
    id: 'R71',
    titre: 'Points d\'accroche : parts égales si chaque bumper a son point ; CMU du moteur saisie',
    etape: 5,
    verifier(v) {
      const m = calculs.mur(CB5, 10, 2);
      const direct = calculs.poids(m, CB5, { bumper: { poidsKg: 8.95, colonnes: 2 }, accroche: { type: 'bumpers', cmuMoteurKg: 250, configurationMoteur: 'D8+' } });
      v.egal('un point par barre : 5 points', direct.points.points.length, 5);
      v.proche('charge d\'un point : sa barre (kg)', direct.points.points[0].kg, 63.35, 1e-9);
      v.egal('CMU du moteur (250 kg, D8+) : tenue', [direct.points.ok, direct.points.configurationMoteur], [true, 'D8+']);
      const pont = calculs.poids(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { accroche: { type: 'pont', points: 3, porteesEgales: true, cmuMoteurKg: 250 } });
      v.egal('pont 3 points, 337,5 kg au centre pour 250 kg : refusé', pont.points.ok, false);
      v.vrai('alerte CMU du moteur', pont.alertes.some((a) => a.includes('CMU du moteur')));
    },
  },
  {
    id: 'R72',
    titre: 'Maximum en accroche : dans l\'unité de la fiche (dalles, mètres, kilos), avec ses conditions',
    etape: 5,
    verifier(v, contexte) {
      const ar = dalleDeBase(contexte, 'infiled-ar3-9');
      const max = (dalle, colonnes, lignes) => calculs.poids(calculs.mur(dalle, colonnes, lignes), dalle, {}).maximum;
      v.egal('AR3.9 : 11 rangées, tenu', [max(ar, 4, 11).ok, max(ar, 4, 11).valeur, max(ar, 4, 11).limite, max(ar, 4, 11).unite], [true, 11, 11, 'dalles']);
      v.egal('AR3.9 : 12 rangées, dépassé', max(ar, 4, 12).ok, false);
      const metres = max(DALLE_MAX_METRES, 4, 12);
      v.egal('maximum de 5 m : mur de 6 m, dépassé', [metres.ok, metres.valeur, metres.unite], [false, 6, 'm']);
      v.egal('conditions affichées', metres.conditions, 'matériel du constructeur, usage intérieur');
      const kilos = max(DALLE_MAX_KILOS, 4, 8);
      v.egal('maximum de 60 kg : colonne de 8 × 7,5 kg = 60 kg, tenu', [kilos.ok, kilos.valeur, kilos.unite], [true, 60, 'kg']);
      v.egal('maximum de 60 kg : colonne de 9 dalles, dépassé', max(DALLE_MAX_KILOS, 4, 9).ok, false);
      const demi = calculs.poids(calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 4, lignes: 10, rangeeDemi: true }, { demi: CB5_DEMI }).mur,
        { ...CB5, maxAccroche: 10 }, {}).maximum;
      v.egal('demi-dalle comptée pour une dalle : 11 rangées pour 10', [demi.valeur, demi.ok], [11, false]);
      v.vrai('fiche sans maximum : alerte', calculs.poids(calculs.mur(DALLE_CAS_13, 4, 4), DALLE_CAS_13, {}).alertes.some((a) => a.includes('maximum en accroche')));
    },
  },
  {
    id: 'R73',
    titre: 'Stack : maximum en stack de la fiche',
    etape: 5,
    verifier(v, contexte) {
      const ez = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
      const stack = (lignes) => calculs.poids(calculs.mur(ez, 4, lignes), ez, { mode: 'stack' }).maximum;
      v.egal('EZ2.6 mk2 : 18 en stack, tenu', [stack(18).ok, stack(18).limite], [true, 18]);
      v.egal('19 en stack, dépassé', stack(19).ok, false);
      v.egal('en stack, pas de points d\'accroche', calculs.poids(calculs.mur(ez, 4, 4), ez, { mode: 'stack' }).points, null);
    },
  },
  {
    id: 'R74',
    titre: 'Charge surfacique et par mètre linéaire, rappels du rigger',
    etape: 5,
    verifier(v) {
      const p = calculs.poids(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { bumper: { poidsKg: 6, colonnes: 1 } });
      v.proche('par mètre linéaire : (540 + 12 × 6) kg / 6 m', p.kgParMetre, 102, 1e-9);
      v.egal('marqué indicatif', p.indicatif, true);
      const rappels = p.rappels.join(' ');
      v.vrai('rappels : rigger, élingues acier, 5 fois le poids (ROE)', rappels.includes('rigger') && rappels.includes('élingues acier') && rappels.includes('5 fois'));
    },
  },
  {
    id: 'R75',
    titre: 'Fiche enregistrable : minimum de calcul, une source connue par valeur',
    etape: 6,
    verifier(v) {
      const sources = { s1: { titre: 'fiche_test.pdf, p. 2', court: 'Fiche test', date: '2025-01-15', confiance: 'constructeur' } };
      const valeur = (x) => ({ valeur: x, source: 's1' });
      const base = { id: 'test-dalle', marque: 'Test', modele: 'X1', largeurMm: valeur(500), hauteurMm: valeur(500), pxH: valeur(192), pxV: valeur(192) };
      const ok = (fiche) => fiches.validerFiche('dalle', fiche, sources).enregistrable;
      v.egal('minimum complet : enregistrable', ok(base), true);
      const sansPx = { ...base };
      delete sansPx.pxV;
      const r = fiches.validerFiche('dalle', sansPx, sources);
      v.egal('sans pixels en hauteur : refusée', r.enregistrable, false);
      v.vrai('la raison nomme le champ', r.erreurs.some((e) => e.includes('Pixels en hauteur')));
      v.egal('valeur sans source : refusée', ok({ ...base, poidsKg: { valeur: 9 } }), false);
      v.egal('source inconnue : refusée', ok({ ...base, poidsKg: { valeur: 9, source: 'inconnue' } }), false);
      v.egal('pixels non entiers : refusée', ok({ ...base, pxH: valeur(192.5) }), false);
      v.egal('type de valeur hors liste : refusée', ok({ ...base, pMaxW: { valeur: 150, source: 's1', type: 'maximum' } }), false);
      v.egal('type « max » : accepté', ok({ ...base, pMaxW: { valeur: 150, source: 's1', type: 'max' } }), true);
      v.egal('champ vide (null) : accepté, compté comme absent', ok({ ...base, poidsKg: { valeur: null, source: 's1' } }), true);
      v.egal('champ vide retiré au nettoyage', 'poidsKg' in fiches.nettoyerFiche({ ...base, poidsKg: { valeur: null, source: 's1' } }), false);
    },
  },
  {
    id: 'R76',
    titre: 'Deux niveaux : fiche complète ou incomplète, avec la liste de ce qui manque',
    etape: 6,
    verifier(v, contexte) {
      const sources = { s1: { titre: 'fiche_test.pdf, p. 2', court: 'Fiche test', date: '2025-01-15', confiance: 'constructeur' } };
      const valeur = (x) => ({ valeur: x, source: 's1' });
      const minimale = { id: 'test-dalle', marque: 'Test', modele: 'X1', largeurMm: valeur(500), hauteurMm: valeur(500), pxH: valeur(192), pxV: valeur(192) };
      v.egal('fiche minimale : ce qui manque pour être complète', fiches.validerFiche('dalle', minimale, sources).manquants, [
        'pitchMm', 'profondeurMm', 'poidsKg', 'pMaxW', 'tensionEntreeV', 'carteReceptionMarque', 'carteReceptionModele', 'fichierConfig', 'maxAccroche', 'maxStack',
      ]);
      const bp2 = contexte.dalles.dalles.find((d) => d.id === 'roe-bp2-v2');
      const r = fiches.validerFiche('dalle', bp2, contexte.dalles.sources);
      v.egal('BP2 V2 de la base : enregistrable mais incomplète', [r.enregistrable, r.manquants.length > 0], [true, true]);
      v.egal('même liste sur la fiche résolue (onglets)', fiches.champsManquantsFiche('dalle', calculs.resoudreFiche(bp2, contexte.dalles.sources)), r.manquants);
      const gabarit = calculs.resoudreFiche(contexte.dalles.gabarits[0], contexte.dalles.sources);
      v.egal('gabarit : pas de liste (déjà signalé non sourcé)', fiches.champsManquantsFiche('dalle', gabarit), []);
      const mx30 = contexte.processeurs.processeurs.find((p) => p.id === 'coex-mx30');
      v.egal('processeur MX30 : incomplet, capacité et canvas manquants',
        fiches.validerFiche('processeur', mx30, contexte.processeurs.sources).manquants, ['capacite', 'pixelsMax', 'largeurMaxPx', 'hauteurMaxPx']);
    },
  },
  {
    id: 'R77',
    titre: 'Valeurs contradictoires saisies : chacune sa source, la plus défavorable retenue',
    etape: 6,
    verifier(v) {
      const sources = {
        s1: { titre: 'fiche_a.pdf, p. 1', court: 'Fiche A', date: '2024-01-01', confiance: 'constructeur' },
        s2: { titre: 'fiche_b.pdf, p. 3', court: 'Fiche B', date: '2025-06-01', confiance: 'loueur' },
      };
      const fiche = {
        id: 'test-contradictions', marque: 'Test', modele: 'Y', largeurMm: { valeur: 500, source: 's1' }, hauteurMm: { valeur: 500, source: 's1' },
        pxH: { valeur: 192, source: 's1' }, pxV: { valeur: 192, source: 's1' },
        pMaxW: { valeurs: [{ valeur: 180, source: 's1', type: 'max' }, { valeur: 200, source: 's2', type: 'max' }] },
      };
      v.egal('enregistrable', fiches.validerFiche('dalle', fiche, sources).enregistrable, true);
      v.egal('P max retenue : 200 W', calculs.resoudreFiche(fiche, sources).pMaxW, 200);
      const sansSource = { ...fiche, pMaxW: { valeurs: [{ valeur: 180, source: 's1' }, { valeur: 200 }] } };
      v.egal('une valeur contradictoire sans source : refusée', fiches.validerFiche('dalle', sansSource, sources).enregistrable, false);
    },
  },
  {
    id: 'R78',
    titre: 'Mes versions passent devant la base de départ, avec un retour possible à l\'original',
    etape: 6,
    verifier(v, contexte) {
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      const sources = { perso: { titre: 'pesée atelier, fiche de relevé p. 1', court: 'Pesée', date: '2026-09-20', confiance: 'mesuré' } };
      const bp2 = contexte.dalles.dalles.find((d) => d.id === 'roe-bp2-v2');
      let base = fiches.enregistrerFiche(fiches.baseVide(), 'dalle', { ...bp2, poidsKg: { valeur: 9.5, source: 'perso', type: 'mesuré' } }, sources);
      base = fiches.enregistrerFiche(base, 'dalle', {
        id: 'test-nouvelle', marque: 'Test', modele: 'Z', largeurMm: { valeur: 500, source: 'perso' }, hauteurMm: { valeur: 500, source: 'perso' },
        pxH: { valeur: 128, source: 'perso' }, pxV: { valeur: 128, source: 'perso' },
      }, sources);
      const fusion = fiches.fusionner(depart, base);
      const bp2Fusion = fusion.dalles.dalles.find((d) => d.id === 'roe-bp2-v2');
      v.egal('BP2 V2 : ma version passe devant (9,5 kg), badge « version modifiée »', [calculs.resoudreFiche(bp2Fusion, fusion.dalles.sources).poidsKg, bp2Fusion.statutBase], [9.5, 'modifiee']);
      v.egal('nouvelle fiche ajoutée', fusion.dalles.dalles.find((d) => d.id === 'test-nouvelle')?.statutBase, 'ajoutee');
      v.egal('une seule BP2 V2 dans la liste', fusion.dalles.dalles.filter((d) => d.id === 'roe-bp2-v2').length, 1);
      v.egal('base de départ intacte', contexte.dalles.dalles.find((d) => d.id === 'roe-bp2-v2').poidsKg.valeur, 9.35);
      const retour = fiches.fusionner(depart, fiches.supprimerFiche(base, 'dalle', 'roe-bp2-v2'));
      const bp2Retour = retour.dalles.dalles.find((d) => d.id === 'roe-bp2-v2');
      v.egal('retour à l\'original : 9,35 kg, statut départ', [calculs.resoudreFiche(bp2Retour, retour.dalles.sources).poidsKg, bp2Retour.statutBase], [9.35, 'depart']);
    },
  },
  {
    id: 'R79',
    titre: 'Export : mes fiches par défaut, tout en option ; import sans perte',
    etape: 6,
    verifier(v, contexte) {
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      const sources = { perso: { titre: 'relevé atelier p. 1', court: 'Relevé', date: '2026-09-20', confiance: 'mesuré' } };
      const bp2 = contexte.dalles.dalles.find((d) => d.id === 'roe-bp2-v2');
      let base = fiches.enregistrerFiche(fiches.baseVide(), 'dalle', { ...bp2, poidsKg: { valeur: 9.5, source: 'perso' } }, sources);
      base = fiches.creerParc(base, 'Prestataire A');
      base = fiches.basculerMembre(base, base.parcs[0].id, 'dalle', 'roe-bp2-v2');
      const exportDefaut = fiches.exporter(base, depart);
      v.egal('export par défaut : ma seule fiche', exportDefaut.fiches.map((f) => f.fiche.id), ['roe-bp2-v2']);
      v.egal('export par défaut : mes parcs et mes sources', [exportDefaut.parcs.length, Object.keys(exportDefaut.sources)], [1, ['perso']]);
      const toutes = fiches.exporter(base, depart, { tout: true });
      v.vrai('export complet : la base de départ en plus', toutes.fiches.length > 30);
      const reimport = fiches.importer(fiches.baseVide(), JSON.parse(JSON.stringify(exportDefaut)), depart);
      v.egal('import de mon export : mêmes fiches et mêmes parcs', [reimport.base.fiches, reimport.base.parcs], [base.fiches, base.parcs]);
      const reimportTout = fiches.importer(fiches.baseVide(), JSON.parse(JSON.stringify(toutes)), depart);
      v.egal('import de l\'export complet : les fiches de départ inchangées sont ignorées', reimportTout.base.fiches.map((f) => f.fiche.id), ['roe-bp2-v2']);
    },
  },
  {
    id: 'R80',
    titre: 'Parcs nommés : une fiche dans plusieurs parcs, « Tous » par défaut',
    etape: 6,
    verifier(v, contexte) {
      let base = fiches.creerParc(fiches.creerParc(fiches.baseVide(), 'Prestataire A'), 'Prestataire B');
      const [a, b] = base.parcs.map((p) => p.id);
      base = fiches.basculerMembre(base, a, 'dalle', 'roe-bp2-v2');
      base = fiches.basculerMembre(base, b, 'dalle', 'roe-bp2-v2');
      base = fiches.basculerMembre(base, a, 'dalle', 'roe-cb5-mkii');
      const dalles = contexte.dalles.dalles;
      const ids = (parc) => fiches.filtrerParParc(dalles, base, parc, 'dalle').map((d) => d.id);
      v.egal('parc A', ids(a), ['roe-bp2-v2', 'roe-cb5-mkii']);
      v.egal('parc B', ids(b), ['roe-bp2-v2']);
      v.egal('Tous : toute la base', ids(null).length, dalles.length);
      v.egal('noms des parcs', base.parcs.map((p) => p.nom), ['Prestataire A', 'Prestataire B']);
      base = fiches.basculerMembre(base, a, 'dalle', 'roe-cb5-mkii');
      v.egal('retirer une fiche d\'un parc', ids(a), ['roe-bp2-v2']);
    },
  },
  {
    id: 'R81',
    titre: 'Processeur conseillé limité au parc actif',
    etape: 6,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      let base = fiches.creerParc(fiches.baseVide(), 'Prestataire A');
      const parc = base.parcs[0].id;
      base = fiches.basculerMembre(base, parc, 'processeur', 'novastar-mctrl660');
      const novastar = contexte.processeurs.processeurs.filter((p) => p.famille === 'novastar');
      const conseil = (parcActif) => calculs.processeurConseille(fiches.filtrerParParc(novastar, base, parcActif, 'processeur')
        .map((p) => calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, p.id), NOVASTAR_60_8)));
      v.egal('Tous : VX6s', conseil(null).processeur.id, 'novastar-vx6s');
      v.egal('parc avec le seul MCTRL660 : 2 MCTRL660', [conseil(parc).processeur.id, conseil(parc).nombre], ['novastar-mctrl660', 2]);
    },
  },
  {
    id: 'R82',
    titre: 'JSON collé : vérifié avant enregistrement, avec ce qui manque',
    etape: 6,
    verifier(v) {
      const illisible = fiches.validerImport('{ pas du json', {});
      v.vrai('JSON illisible : erreur claire', illisible.erreurs.some((e) => e.includes('JSON')));
      const texte = JSON.stringify({
        sources: { f: { titre: 'dalle_x.pdf, p. 4', court: 'Fiche X', date: '2025-03-01', confiance: 'constructeur' } },
        fiche: { type: 'dalle', id: 'test-json', marque: 'Test', modele: 'J', largeurMm: { valeur: 500, source: 'f' }, hauteurMm: { valeur: 500, source: 'f' }, pxH: { valeur: 200, source: 'f' }, pxV: { valeur: 200, source: 'f' } },
      });
      const r = fiches.validerImport(texte, {});
      v.egal('une fiche lue, enregistrable', [r.entrees.length, r.entrees[0].validation.enregistrable], [1, true]);
      v.vrai('ce qui manque est listé', r.entrees[0].validation.manquants.includes('poidsKg'));
      const sansDate = JSON.stringify({ sources: { f: { titre: 'dalle_x.pdf, p. 4', court: 'Fiche X', confiance: 'constructeur' } }, fiche: JSON.parse(texte).fiche });
      v.vrai('source sans date : avertissement', fiches.validerImport(sansDate, {}).entrees[0].validation.avertissements.some((a) => a.includes('date')));
    },
  },
  {
    id: 'R83',
    titre: 'Consigne pour Claude et modèles de JSON : le modèle passe la vérification',
    etape: 6,
    verifier(v) {
      const c = fiches.CONSIGNE_CLAUDE;
      v.vrai('consigne : source par valeur, fichier, page et date', c.includes('source') && c.includes('page') && c.includes('date'));
      v.vrai('consigne : type de valeur', c.includes('max, typique ou mesuré'));
      v.vrai('consigne : aucune valeur inventée, champ vide', c.includes('aucune valeur inventée') && c.includes('null'));
      v.vrai('consigne : toutes les valeurs contradictoires', c.includes('contradictoires'));
      for (const type of ['dalle', 'processeur', 'regie', 'bumper']) {
        const r = fiches.validerImport(JSON.stringify(fiches.MODELES_JSON[type]), {});
        v.egal(`modèle ${type} : enregistrable`, r.entrees[0]?.validation.enregistrable, true);
      }
    },
  },
  {
    id: 'R84',
    titre: 'Fiche incomplète : chaque onglet dit ce qu\'il ne peut pas calculer',
    etape: 6,
    verifier(v, contexte) {
      const sansPoids = { ...DALLE_CAS_13 };
      delete sansPoids.poidsKg;
      let message = '';
      try {
        calculs.poids(calculs.mur(sansPoids, 4, 4), sansPoids, {});
      } catch (erreur) {
        message = erreur.message;
      }
      v.vrai('sans poids : pas de calcul de poids, dit clairement', message.includes('pas de calcul de poids'));
      const carte = (dalle, id) => calculs.evaluerProcesseur(calculs.mur(dalle, 12, 6), dalle, processeurDeBase(contexte, id), NOVASTAR_60_8)
        .alertes.filter((a) => a.includes('Carte de réception'));
      v.egal('sans carte de réception : une alerte de compatibilité', carte(DALLE_CAS_13, 'novastar-mctrl660').length, 1);
      v.egal('carte connue : pas d\'alerte', carte(DALLE_CARTE_A10S, 'novastar-mctrl660').length, 0);
      v.egal('CX40 Pro sans carte : une seule alerte, pas de doublon', carte(DALLE_CAS_13, 'coex-cx40-pro').length, 1);
    },
  },
  {
    id: 'R85',
    titre: 'Fiche incomplète : chaque calcul liste ses propres manques (P max, carte, maximum en accroche ou en stack)',
    etape: 7,
    verifier(v, contexte) {
      const e = calculs.electricite(calculs.mur(DALLE_SANS_PMAX, 4, 4), DALLE_SANS_PMAX, {});
      v.egal('élec sans P max : un manque, la P max', e.manques.map((x) => x.champ), ['pMaxW']);
      v.vrai('élec : le texte du manque est aussi une alerte', e.alertes.includes(e.manques[0]?.texte));
      v.egal('élec avec P max : aucun manque', calculs.electricite(calculs.mur(DALLE_CAS_13, 4, 4), DALLE_CAS_13, {}).manques, []);
      const m13 = calculs.mur(DALLE_CAS_13, 12, 6);
      v.egal('poids en accroche sans maximum : maximum en accroche', calculs.poids(m13, DALLE_CAS_13, {}).manques.map((x) => x.champ), ['maxAccroche']);
      v.egal('poids en stack sans maximum : maximum en stack', calculs.poids(m13, DALLE_CAS_13, { mode: 'stack' }).manques.map((x) => x.champ), ['maxStack']);
      v.egal('poids avec maximum : aucun manque', calculs.poids(calculs.mur(DALLE_MAX_METRES, 4, 4), DALLE_MAX_METRES, {}).manques, []);
      const data = (dalle, id) => calculs.evaluerProcesseur(calculs.mur(dalle, 12, 6), dalle, processeurDeBase(contexte, id), NOVASTAR_60_8);
      const sansCarte = data(DALLE_CAS_13, 'novastar-mctrl660');
      v.egal('data sans carte : un manque, le modèle de carte', sansCarte.manques.map((x) => x.champ), ['carteReceptionModele']);
      v.vrai('data : le texte du manque est aussi une alerte', sansCarte.alertes.includes(sansCarte.manques[0]?.texte));
      v.egal('data avec carte : aucun manque', data(DALLE_CARTE_A10S, 'novastar-mctrl660').manques, []);
      v.egal('CX40 Pro sans carte : un seul manque', data(DALLE_CAS_13, 'coex-cx40-pro').manques.length, 1);
    },
  },
  {
    id: 'R86',
    titre: 'Carte de réception et fichier de config réglés pour une dalle dans un parc ; la valeur de la fiche reste visible',
    etape: 7,
    verifier(v, contexte) {
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.basculerMembre(base, parc, 'dalle', 'roe-bp2-v2');
      const reglage = { carteReceptionMarque: 'Megapixel', carteReceptionModele: 'HELIOS', fichierConfig: 'BP2V2_Helios_v3' };
      base = fiches.reglerDalleParc(base, parc, 'roe-bp2-v2', reglage);
      v.egal('réglage enregistré dans le parc', fiches.reglageDalleParc(base, parc, 'roe-bp2-v2'), reglage);
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const reglee = fiches.appliquerReglagesParc(bp2, base, parc);
      v.egal('valeurs du parc retenues', [reglee.carteReceptionMarque, reglee.carteReceptionModele, reglee.fichierConfig], ['Megapixel', 'HELIOS', 'BP2V2_Helios_v3']);
      v.egal('source : le parc', [reglee.sources.carteReceptionModele?.reglageParc, reglee.sources.carteReceptionModele?.source.court], [true, 'Parc Loueur A']);
      v.vrai('fiche de départ intacte', bp2.carteReceptionModele === undefined && bp2.sources.carteReceptionModele === undefined);
      v.egal('parc « Tous » : la fiche telle quelle', fiches.appliquerReglagesParc(bp2, base, null), bp2);
      let b2 = fiches.basculerMembre(base, parc, 'dalle', DALLE_CARTE_A10S.id);
      b2 = fiches.reglerDalleParc(b2, parc, DALLE_CARTE_A10S.id, { carteReceptionModele: 'A8s Pro' });
      const a10s = fiches.appliquerReglagesParc(DALLE_CARTE_A10S, b2, parc);
      v.egal('seul le champ réglé change', [a10s.carteReceptionMarque, a10s.carteReceptionModele], ['Novastar', 'A8s Pro']);
      v.egal('valeur de la fiche visible à côté', a10s.sources.carteReceptionModele?.autres.map((x) => x.valeur), ['A10s']);
      const vide = fiches.reglerDalleParc(b2, parc, DALLE_CARTE_A10S.id, { carteReceptionModele: '' });
      v.egal('réglage vidé : retour à la fiche', fiches.reglageDalleParc(vide, parc, DALLE_CARTE_A10S.id), null);
    },
  },
  {
    id: 'R87',
    titre: 'Réglage du parc : utilisé pour la compatibilité de la carte, gardé à l\'export',
    etape: 7,
    verifier(v, contexte) {
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur B');
      const parc = base.parcs[0].id;
      base = fiches.basculerMembre(base, parc, 'dalle', DALLE_CAS_13.id);
      base = fiches.reglerDalleParc(base, parc, DALLE_CAS_13.id, { carteReceptionMarque: 'Novastar', carteReceptionModele: 'A8s Pro' });
      const dalle = fiches.appliquerReglagesParc(DALLE_CAS_13, base, parc);
      const evaluer = (id) => calculs.evaluerProcesseur(calculs.mur(dalle, 12, 6), dalle, processeurDeBase(contexte, id), NOVASTAR_60_8);
      v.egal('carte réglée dans le parc : plus de manque', evaluer('novastar-mctrl660').manques, []);
      const cx = evaluer('coex-cx40-pro');
      v.vrai('CX40 Pro : carte A8s Pro du parc refusée (pas une carte 5G)', Boolean(cx.impossible) && cx.impossible.includes('A8s Pro'));
      const exporte = fiches.exporter(base, depart);
      const reimport = fiches.importer(fiches.baseVide(), JSON.parse(JSON.stringify(exporte)), depart);
      v.egal('export de parcs seuls : import sans erreur', reimport.rapport.erreurs, []);
      v.egal('export puis import : réglage du parc conservé', fiches.reglageDalleParc(reimport.base, parc, DALLE_CAS_13.id),
        { carteReceptionMarque: 'Novastar', carteReceptionModele: 'A8s Pro' });
    },
  },
  {
    id: 'R88',
    titre: 'Copier les résultats : résumé du Mur, une information par ligne',
    etape: 7,
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const lignes = resumes.resumeMur({ dalle: bp2, mur: calculs.mur(bp2, 12, 6) }).split('\n');
      v.egal('titre', lignes[0], 'MUR');
      for (const attendue of ['Dalle : ROE BP2 V2', 'Dalles : 12 × 6 = 72 (colonnes × lignes)', 'Taille : 6,00 × 3,00 m',
        'Résolution : 2112 × 1056 px', 'Pixels : 2 230 272 px', 'Surface : 18,00 m²', 'Pitch : 2,841 mm']) {
        v.vrai(`ligne « ${attendue} »`, lignes.includes(attendue));
      }
      v.vrai('source des dimensions et des pixels', lignes.some((l) => l.startsWith('Dimensions et pixels : ')));
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const demi = dalleDeBase(contexte, 'roe-cb5-mkii-demi');
      const avecDemi = resumes.resumeMur({ dalle: cb5, mur: calculs.mur(cb5, 10, 2, { demi, rangeeDemi: true, positionDemi: 'haut' }) }).split('\n');
      v.vrai('rangée de demi-dalles', avecDemi.some((l) => l.startsWith('Demi-dalles : 10 ') && l.endsWith('rangée en haut')));
      v.vrai('total des éléments', avecDemi.includes('Total : 30 éléments'));
    },
  },
  {
    id: 'R89',
    titre: 'Copier les résultats : résumés Data et Canvas',
    etape: 7,
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const r = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const data = resumes.resumeData(r, { conseille: true }).split('\n');
      v.egal('titre', data[0], 'DATA');
      for (const attendue of ['Processeur : 2 × Novastar MCTRL660, conseillé', 'Réglages : 60 Hz, 8 bits réseau, sans redondance',
        'Capacité par port : 650 000 px', 'Dalles par port : 17']) {
        v.vrai(`ligne « ${attendue} »`, data.includes(attendue));
      }
      v.vrai('alerte de carte reprise', data.some((l) => l.startsWith('Alerte : Carte de réception')));
      const liaisons = liaisonsDeBase(contexte);
      const source = { ...calculs.sourceConseillee(r, liaisons, 60), bits: 8, espace: 'RGB', plage: 'Full' };
      const c = calculs.controleSource(source, r, liaisons, { famille: 'novastar', bitsReseau: 8, frequenceHz: 60 });
      const canvas = resumes.resumeCanvas(c, { evaluation: r, source }).split('\n');
      v.egal('titre', canvas[0], 'CANVAS ET SOURCE');
      v.vrai('source envoyée', canvas.some((l) => l.startsWith(`Source : ${source.largeurPx} × ${source.hauteurPx} px à 60 Hz en `)));
      v.egal('un bloc par processeur', canvas.filter((l) => /^Processeur n° \d+, bloc : /.test(l)).length, 2);
    },
  },
  {
    id: 'R90',
    titre: 'Copier les résultats : Élec et Poids marqués « indicatif, à valider »',
    etape: 7,
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const elec = resumes.resumeElec(calculs.electricite(m, DALLE_CAS_13, {}), { dalle: DALLE_CAS_13, mur: m }).split('\n');
      v.egal('élec : titre avec la mention', elec[0], 'ÉLECTRICITÉ : indicatif, à valider par l\'électricien');
      v.vrai('puissance totale', elec.includes('Puissance totale : 9,36 kW'));
      v.vrai('une ligne par phase', ['L1', 'L2', 'L3'].every((p) => elec.some((l) => l.startsWith(`Phase ${p} : `))));
      const poids = resumes.resumePoids(calculs.poids(m, DALLE_CAS_13, {}), { dalle: DALLE_CAS_13, mur: m }).split('\n');
      v.egal('poids : titre avec la mention', poids[0], 'POIDS : indicatif, à valider par le rigger');
      v.vrai('total suspendu', poids.includes('Total suspendu : 540 kg'));
      v.vrai('manque repris : maximum en accroche', poids.some((l) => l.startsWith('Alerte : Fiche sans maximum en accroche')));
    },
  },
  {
    id: 'R91',
    titre: 'Texte copié : sans tirets de liste ni tirets longs, espaces simples, résumés enchaînés',
    etape: 7,
    verifier(v, contexte) {
      v.egal('tirets longs remplacés', resumes.ligneSimple('Câblage — au plus juste – colonnes'), 'Câblage, au plus juste, colonnes');
      v.egal('pas de puce en début de ligne', resumes.ligneSimple('- 12 dalles'), '12 dalles');
      v.egal('espaces fines remplacées', resumes.ligneSimple('2\u202f230\u202f272 px'), '2 230 272 px');
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const r = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const tout = resumes.toutResumer([
        resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m }),
        resumes.resumeData(r, {}),
        null,
        resumes.resumeElec(calculs.electricite(m, DALLE_CAS_13, {}), { dalle: DALLE_CAS_13, mur: m }),
        resumes.resumePoids(calculs.poids(m, DALLE_CAS_13, {}), { dalle: DALLE_CAS_13, mur: m }),
      ], new Date(2026, 8, 24));
      const lignes = tout.split('\n');
      v.egal('en-tête', lignes[0], 'Mur LED, calcul du 24/09/2026');
      v.egal('aucun tiret long', /[—–]/.test(tout), false);
      v.egal('aucune ligne en puce', lignes.filter((l) => /^\s*[-•*]/.test(l)), []);
      v.egal('aucune espace insécable', /[\u00a0\u202f]/.test(tout), false);
      v.egal('en-tête et 4 résumés séparés par une ligne vide', tout.split('\n\n').length, 5);
    },
  },  {
    id: 'R92',
    titre: 'Carte de réception d\'une autre marque que le processeur : refus avec la raison ; carte inconnue : alerte',
    etape: 7,
    verifier(v, contexte) {
      const evaluer = (dalle, id) => calculs.evaluerProcesseur(calculs.mur(dalle, 12, 6), dalle, processeurDeBase(contexte, id),
        { frequenceHz: 60, bits: processeurDeBase(contexte, id).famille === 'brompton' ? 10 : 8 });
      const megapixel = { ...DALLE_CAS_7, id: 'fictive-carte-megapixel', nom: 'Dalle à carte Megapixel', carteReceptionMarque: 'Megapixel', carteReceptionModele: 'HELIOS' };
      const mctrl = evaluer(megapixel, 'novastar-mctrl660');
      v.egal('Megapixel sur MCTRL660 : refusé', mctrl.nombre, null);
      v.vrai('la raison cite la marque du processeur et la carte', /Novastar/.test(mctrl.impossible ?? '') && /Megapixel HELIOS/.test(mctrl.impossible ?? ''));
      v.egal('Megapixel sur SX40 : refusé', evaluer(megapixel, 'brompton-sx40').nombre, null);
      const novastarSurBrompton = evaluer(DALLE_CARTE_A10S, 'brompton-sx40');
      v.vrai('carte Novastar sur SX40 : refusé, cartes Brompton seulement', novastarSurBrompton.nombre === null && /Brompton/.test(novastarSurBrompton.impossible ?? ''));
      const x8e = evaluer(DALLE_CARTE_A10S, 'colorlight-x8e');
      v.vrai('carte Novastar sur Colorlight X8E : refusé, cartes Colorlight seulement', x8e.nombre === null && /Colorlight/.test(x8e.impossible ?? ''));
      v.vrai('carte Novastar sur MCTRL660 : calculé', evaluer(DALLE_CARTE_A10S, 'novastar-mctrl660').nombre >= 1);
      v.vrai('carte Novastar sur COEX MX40 Pro (gamme Novastar) : calculé', evaluer(DALLE_CARTE_A10S, 'coex-mx40-pro').nombre >= 1);
      const brompton = { ...DALLE_CAS_7, id: 'fictive-carte-brompton', nom: 'Dalle à carte Brompton', carteReceptionMarque: 'Brompton', carteReceptionModele: 'R2+' };
      const sx40 = evaluer(brompton, 'brompton-sx40');
      v.egal('carte Brompton sur SX40 : calculé, sans manque', [sx40.nombre, sx40.manques], [1, []]);
      const sansModele = { ...DALLE_CAS_7, id: 'fictive-novastar-sans-modele', nom: 'Dalle Novastar sans modèle', carteReceptionMarque: 'Novastar' };
      v.egal('même marque sans modèle : calculé avec l\'alerte actuelle', evaluer(sansModele, 'novastar-mctrl660').manques.map((m) => m.champ), ['carteReceptionModele']);
      const inconnue = evaluer(DALLE_CAS_7, 'brompton-sx40');
      v.egal('carte inconnue : calculé avec l\'alerte actuelle', [inconnue.nombre, inconnue.manques.map((m) => m.champ)], [1, ['carteReceptionModele']]);
    },
  },  {
    id: 'R93',
    titre: 'Pixel map du cas 13 : chaque dalle une fois, ses pixels exacts, un canvas par processeur',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const dalles = calculs.dallesDuMur(m, DALLE_CAS_13);
      v.egal('72 dalles, chacune une seule fois', [dalles.length, new Set(dalles.map((d) => d.id)).size], [72, 72]);
      v.egal('première dalle en haut à gauche : C1 R1, pixel (0,0), 0 mm',
        [dalles[0].id, dalles[0].px.x, dalles[0].px.y, dalles[0].mm.x, dalles[0].mm.y], ['C1 R1', 0, 0, 0, 0]);
      v.egal('dernière dalle : C12 R6, 500 × 500 mm', [dalles[71].id, dalles[71].mm.x, dalles[71].mm.y, dalles[71].mm.largeur], ['C12 R6', 5500, 2500, 500]);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const pm = calculs.pixelMap(m, DALLE_CAS_13, e);
      verifierCouverture(v, 'mur de 2304 × 1152 px', pm.mur.dalles, 2304, 1152);
      v.egal('un canvas par processeur', pm.canvas.length, 2);
      pm.canvas.forEach((c) => verifierCouverture(v, `canvas n° ${c.numero} : bloc de ${c.bloc.largeurPx} × ${c.bloc.hauteurPx} px`, c.dalles, c.bloc.largeurPx, c.bloc.hauteurPx));
      const ids = pm.canvas.flatMap((c) => c.dalles.map((d) => d.id));
      v.egal('chaque dalle dans un seul canvas', [ids.length, new Set(ids).size], [72, 72]);
      v.egal('canvas n° 2 : position dans le mur', [pm.canvas[1].xMur, pm.canvas[1].yMur], [[1152, 2303], [0, 1151]]);
      v.egal('canvas n° 2 : bloc dans sa source, de 0 à largeur − 1', pm.canvas[1].source, { x: [0, 1151], y: [0, 1151] });
      v.egal('canvas n° 2 : C7 R1 en (0,0) de son canvas', pm.canvas[1].dalles.find((d) => d.id === 'C7 R1').x, [0, 191]);
      v.vrai('dalles dans le canvas du processeur', pm.canvas.every((c) => c.dalles.every((d) => d.x[1] < c.canvas.largeurPx && d.y[1] < c.canvas.hauteurPx)));
    },
  },
  {
    id: 'R94',
    titre: 'Vue physique et pixel map : demi-dalles et dalles de 500 × 1000 mm',
    etape: '8a',
    verifier(v, contexte) {
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const demi = dalleDeBase(contexte, 'roe-cb5-mkii-demi');
      const m = calculs.mur(cb5, 4, 2, { demi, rangeeDemi: true, positionDemi: 'haut' });
      const dalles = calculs.dallesDuMur(m, cb5);
      v.egal('12 dalles, rangée 1 en demi-dalles', [dalles.length, dalles.filter((d) => d.type === 'demi').map((d) => d.rangee)], [12, [1, 1, 1, 1]]);
      const c1r2 = dalles.find((d) => d.id === 'C1 R2');
      v.egal('C1 R2 sous la demi-dalle : ses vrais pixels et millimètres', [c1r2.mm.y, c1r2.mm.hauteur, c1r2.px.y, c1r2.px.hauteur], [600, 1200, 104, 208]);
      verifierCouverture(v, 'mur avec demi-dalles', calculs.pixelMap(m, cb5).mur.dalles, m.pxLargeur, m.pxHauteur);
      const m5 = calculs.mur(CABINET_CAS_5, 10, 3);
      const d5 = calculs.dallesDuMur(m5, CABINET_CAS_5);
      v.egal('cas 5 : cabinets de 500 × 1000 mm, 192 × 384 px', [d5[0].mm.largeur, d5[0].mm.hauteur, d5[0].px.largeur, d5[0].px.hauteur], [500, 1000, 192, 384]);
      const dernier = calculs.pixelMap(m5, CABINET_CAS_5).mur.dalles.find((d) => d.id === 'C10 R3');
      v.egal('cas 5 : C10 R3 de x 1728 à 1919, y 768 à 1151', [dernier.x, dernier.y], [[1728, 1919], [768, 1151]]);
      verifierCouverture(v, 'cas 5 : 1920 × 1152 px', calculs.pixelMap(m5, CABINET_CAS_5).mur.dalles, 1920, 1152);
    },
  },
  {
    id: 'R95',
    titre: 'Câblage data du cas 7 : chaque dalle une fois, aucun port dépassé, mêmes décomptes que l\'onglet Data',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const t = calculs.cablageData(m, DALLE_CAS_7, e, { depart: 'haut-gauche' });
      v.egal('variantes', t.variantes.map((x) => x.mode), ['colonnes', 'rangees', 'auPlusJuste']);
      for (const variante of t.variantes.filter((x) => x.possible)) verifierPorts(v, variante, 440, e);
      const par = (mode) => t.variantes.find((x) => x.mode === mode).processeurs.map((p) => p.ports.length);
      v.egal('par colonnes : ports par SX40, comme l\'onglet Data', par('colonnes'), e.groupes.map((g) => g.ports.colonnes));
      v.egal('au plus juste : ports par SX40, comme l\'onglet Data', par('auPlusJuste'), e.groupes.map((g) => g.ports.auPlusJuste));
      const ports = t.variantes[0].processeurs[0].ports;
      v.egal('ports du SX40 sur ses XD', [ports[0].libelle, ports[10].libelle], ['XD 1, port 1', 'XD 2, port 1']);
      v.egal('conseil : par colonnes', t.conseil, 'colonnes');
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const demi = dalleDeBase(contexte, 'roe-cb5-mkii-demi');
      const md = calculs.mur(cb5, 4, 2, { demi, rangeeDemi: true, positionDemi: 'haut' });
      const ed = calculs.evaluerProcesseur(md, cb5, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      for (const variante of calculs.cablageData(md, cb5, ed, { depart: 'bas-droite' }).variantes.filter((x) => x.possible)) verifierPorts(v, variante, 12, ed);
    },
  },
  {
    id: 'R96',
    titre: 'Serpentin depuis les quatre coins : dalles voisines, départ au coin choisi',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const departs = { 'haut-gauche': 'C1 R1', 'haut-droite': 'C6 R1', 'bas-gauche': 'C1 R6', 'bas-droite': 'C6 R6' };
      v.egal('quatre coins', calculs.COINS, Object.keys(departs));
      for (const [depart, premiere] of Object.entries(departs)) {
        const t = calculs.cablageData(m, DALLE_CAS_13, e, { depart });
        for (const variante of t.variantes) {
          const chemins = variante.processeurs.flatMap((p) => p.ports.map((port) => port.dalles));
          v.vrai(`${depart}, ${variante.mode} : dalles d'un même port toujours voisines`, chemins.every(voisines));
        }
        v.egal(`${depart} : premier port du processeur 1 depuis ${premiere}`, t.variantes[0].processeurs[0].ports[0].dalles[0], premiere);
      }
      const elec = calculs.electricite(m, DALLE_CAS_13, {});
      for (const depart of calculs.COINS) {
        const t = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart });
        v.vrai(`élec ${depart} : dalles d'une même ligne voisines`, t.variantes.every((x) => x.lignesDetail.every((l) => voisines(l.dalles))));
      }
    },
  },
  {
    id: 'R97',
    titre: 'Redondance : secours selon la marque (paires Brompton, N + p Novastar), rectangles NovaLCT respectés',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const mctrl = processeurDeBase(contexte, 'novastar-mctrl660');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, mctrl, NOVASTAR_60_8);
      const t = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche' });
      v.egal('MCTRL660 : variantes avec les rectangles NovaLCT', t.variantes.map((x) => x.mode), ['colonnes', 'rangees', 'auPlusJuste', 'rectangles']);
      const rect = t.variantes.find((x) => x.mode === 'rectangles');
      v.egal('rectangles : 3 ports de 2 colonnes par MCTRL660', rect.processeurs.map((p) => p.ports.map((x) => x.dalles.length)), [[12, 12, 12], [12, 12, 12]]);
      v.vrai('rectangles : chaque port couvre un rectangle plein', rect.processeurs.every((p) => p.ports.every((x) => rectanglePlein(x.dalles))));
      verifierPorts(v, rect, 72, e);
      v.egal('conseil NovaLCT : les rectangles', t.conseil, 'rectangles');
      const apj = t.variantes.find((x) => x.mode === 'auPlusJuste');
      v.egal('au plus juste : non réalisable tel quel dans NovaLCT', [apj.possible, /non réalisable tel quel dans NovaLCT/.test(apj.raison ?? '')], [false, true]);
      const er = calculs.evaluerProcesseur(m, DALLE_CAS_13, mctrl, { ...NOVASTAR_60_8, redondance: true });
      const col = calculs.cablageData(m, DALLE_CAS_13, er, { depart: 'haut-gauche' }).variantes.find((x) => x.mode === 'colonnes');
      const ports = col.processeurs.flatMap((p) => p.ports);
      v.vrai('redondance : chaque port a son secours', ports.every((p) => p.secours !== null));
      v.vrai('redondance : secours distincts des ports principaux', col.processeurs.every((p) => {
        const numeros = [...p.ports.map((x) => x.numero), ...p.ports.map((x) => x.secours.numero)];
        return new Set(numeros).size === numeros.length;
      }));
      v.egal('redondance : ports doublés, comme l\'onglet Data', col.processeurs.map((p) => 2 * p.ports.length), er.groupes.map((g) => g.ports.redondance.colonnes));
      v.egal('câbles de tête : ports et secours', col.cablesTete, 2 * ports.length);
      v.egal('Novastar : secours du port 1 = port 3 sur un MCTRL660 (N + p, N = moitié des ports)', [ports[0].secours.libelle, ports[0].secours.convention], ['port 3', true]);
      v.vrai('Novastar : convention affichée comme telle', /convention par défaut, à régler dans le logiciel du processeur/.test(col.noteSecours ?? ''));
      const e4k = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl4k'), { ...NOVASTAR_60_8, redondance: true });
      v.egal('MCTRL4K : secours du port 1 = port 9 (vu en formation)',
        calculs.cablageData(m, DALLE_CAS_13, e4k, { depart: 'haut-gauche' }).variantes[0].processeurs[0].ports[0].secours.libelle, 'port 9');
      const es8 = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'brompton-s8'), { ...BROMPTON_60_10, redondance: true });
      const s8 = calculs.cablageData(m, DALLE_CAS_13, es8, { depart: 'haut-gauche' }).variantes[0];
      v.egal('S8 : paires de ports voisins, impair principal et pair secours',
        s8.processeurs[0].ports.map((x) => [x.libelle, x.secours.libelle]), [['port 1', 'port 2'], ['port 3', 'port 4'], ['port 5', 'port 6'], ['port 7', 'port 8']]);
      v.egal('S8 : règle Brompton, pas une convention', [s8.processeurs[0].ports[0].secours.convention, s8.noteSecours], [false, null]);
      const t1 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_13, 2, 2), DALLE_CAS_13, processeurDeBase(contexte, 'brompton-t1'), { ...BROMPTON_60_10, redondance: true });
      v.vrai('T1 : un seul port, pas de redondance possible', t1.nombre === null && /un seul port/.test(t1.impossible ?? ''));
      const m7 = calculs.mur(DALLE_CAS_7, 44, 10);
      const e7 = calculs.evaluerProcesseur(m7, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), { ...BROMPTON_60_10, redondance: true });
      const p7 = calculs.cablageData(m7, DALLE_CAS_7, e7, { depart: 'haut-gauche' }).variantes[0].processeurs[0].ports[0];
      v.egal('SX40 en redondance : secours sur le XD miroir', [p7.libelle, p7.secours.libelle], ['XD 1, port 1', 'XD miroir 1, port 1']);
    },
  },
  {
    id: 'R98',
    titre: 'Câblage élec : chaque dalle une fois, lignes et phases comme l\'onglet Élec, chaînage respecté',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const elec = calculs.electricite(m, DALLE_CAS_13, {});
      const t = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche' });
      v.egal('variantes', t.variantes.map((x) => x.mode), ['colonnes', 'colonnesEquilibre', 'rangees', 'auPlusJuste', 'auPlusJusteEquilibre']);
      for (const variante of t.variantes) verifierLignes(v, variante, 72, elec.ligne.utileW, DALLE_CAS_13.chainagePowerMax);
      const nb = (mode) => t.variantes.find((x) => x.mode === mode).lignesDetail.length;
      v.egal('lignes : comme l\'onglet Élec', [nb('colonnes'), nb('auPlusJuste'), nb('auPlusJusteEquilibre')],
        [elec.lignes.colonnes.nombre, elec.lignes.auPlusJuste.nombre, elec.triphase.auPlusJuste.equilibre.lignes.length]);
      v.egal('équilibre : charge des phases comme l\'onglet Élec', t.variantes.find((x) => x.mode === 'auPlusJusteEquilibre').phases.map((p) => p.puissanceW),
        elec.triphase.auPlusJuste.equilibre.phases.map((p) => p.puissanceW));
      v.egal('conseil : au plus juste, phases équilibrées', t.conseil, 'auPlusJusteEquilibre');
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const m5 = calculs.mur(cb5, 10, 4);
      const e5 = calculs.electricite(m5, cb5, {});
      for (const variante of calculs.cablageElec(m5, cb5, e5, { depart: 'haut-droite' }).variantes) verifierLignes(v, variante, 40, e5.ligne.utileW, 7);
      const mono = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 32 } });
      const tm = calculs.cablageElec(m, DALLE_CAS_13, mono, { depart: 'haut-gauche' });
      v.egal('mono : pas de variante équilibrée, une seule phase', [tm.variantes.map((x) => x.mode), tm.variantes[0].lignesDetail.every((l) => l.phase === 1)],
        [['colonnes', 'rangees', 'auPlusJuste'], true]);
    },
  },
  {
    id: 'R99',
    titre: 'Longueur des câbles de tête : estimée avec une marge de mou (10 % par défaut), alerte au-delà de 100 m de cuivre pour la data',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const t = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche', distanceRegieM: 90 });
      const col = t.variantes.find((x) => x.mode === 'colonnes');
      const ports = col.processeurs.flatMap((p) => p.ports);
      v.proche('port 1 : (90 m + trajet jusqu\'au centre de C1 R1, 0,5 m) × 1,10 de mou par défaut', ports[0].longueurCuivreM, 99.55, 0.001);
      v.proche('port depuis C5 R1 : (90 + 2,5 m) × 1,10', ports.find((p) => p.dalles[0] === 'C5 R1').longueurCuivreM, 101.75, 0.001);
      v.vrai('mou compté dans le contrôle : au-delà de 100 m en cuivre, alerte, passer en fibre (CVT10)', col.alertes.some((a) => /100 m/.test(a) && /fibre/.test(a) && /CVT10/.test(a)));
      const sansMou = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche', distanceRegieM: 90, margeMou: 0 }).variantes.find((x) => x.mode === 'colonnes');
      v.proche('marge de mou réglable : à 0 %, 90,5 m', sansMou.processeurs[0].ports[0].longueurCuivreM, 90.5, 0.001);
      v.vrai('à 0 % de mou : plus d\'alerte', !sansMou.alertes.some((a) => /100 m/.test(a)));
      v.egal('sans distance : pas d\'estimation', calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche' }).variantes[0].processeurs[0].ports[0].longueurCuivreM, null);
      const m7 = calculs.mur(DALLE_CAS_7, 44, 10);
      const e7 = calculs.evaluerProcesseur(m7, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), BROMPTON_60_10);
      const c7 = calculs.cablageData(m7, DALLE_CAS_7, e7, { depart: 'bas-gauche', distanceRegieM: 150 }).variantes[0];
      const p7 = c7.processeurs[0].ports[0];
      v.proche('SX40 : la distance passe en fibre jusqu\'au XD, mou compris', p7.fibreM, 165, 0.001);
      v.proche('SX40 : le cuivre part du pied du mur, mou compris', p7.longueurCuivreM, 0.55, 0.001);
      v.vrai('SX40 : pas d\'alerte cuivre', !c7.alertes.some((a) => /100 m/.test(a)));
      const elec = calculs.electricite(m, DALLE_CAS_13, {});
      const l1 = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche', distanceArmoireM: 30 }).variantes[0].lignesDetail[0];
      v.proche('élec : ligne 1, (30 m + trajet jusqu\'à C1 R6) × 1,10', l1.longueurTeteM, 33.55, 0.001);
    },
  },
  {
    id: 'R100',
    titre: 'Rotation portrait ou paysage seulement si la fiche le permet',
    etape: '8a',
    verifier(v, contexte) {
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      let message = '';
      try {
        calculs.dalleTournee(cb5);
      } catch (erreur) {
        message = erreur.message;
      }
      v.vrai('fiche sans « rotation possible » : refus clair', /rotation/i.test(message));
      const tournee = calculs.dalleTournee({ ...cb5, rotationPossible: true });
      v.egal('CB5 tournée : 1200 × 600 mm, 208 × 104 px', [tournee.largeurMm, tournee.hauteurMm, tournee.pxH, tournee.pxV], [1200, 600, 208, 104]);
      v.vrai('nom marqué « tournée »', /tournée/.test(tournee.nom));
      const sources = { f: { titre: 'fiche.pdf, p. 2', court: 'Fiche', date: '2025-01', confiance: 'constructeur' } };
      const fiche = { marque: 'T', modele: 'R', largeurMm: { valeur: 500, source: 'f' }, hauteurMm: { valeur: 1000, source: 'f' }, pxH: { valeur: 192, source: 'f' }, pxV: { valeur: 384, source: 'f' } };
      v.egal('champ « rotation possible » accepté', fiches.validerFiche('dalle', { ...fiche, rotationPossible: { valeur: true, source: 'f' } }, sources).enregistrable, true);
      v.egal('« rotation possible » : oui ou non seulement', fiches.validerFiche('dalle', { ...fiche, rotationPossible: { valeur: 'oui', source: 'f' } }, sources).enregistrable, false);
    },
  },
  {
    id: 'R101',
    titre: 'Export d\'image : limite en surface (16 777 216 px), tuiles au-delà',
    etape: '8a',
    verifier(v, contexte) {
      v.egal('limite de surface', calculs.SURFACE_MAX_IMAGE, 16777216);
      v.egal('4096 × 2160 : une seule image', calculs.tuilesImage(4096, 2160), [{ x: 0, y: 0, largeurPx: 4096, hauteurPx: 2160 }]);
      v.egal('NovaPro UHD Jr, 7680 × 1350 (10,4 M px) : une seule image', calculs.tuilesImage(7680, 1350).length, 1);
      const grand = calculs.tuilesImage(7680, 4320);
      v.vrai('7680 × 4320 (33 M px) : plusieurs tuiles, chacune sous la limite', grand.length > 1 && grand.every((x) => x.largeurPx * x.hauteurPx <= calculs.SURFACE_MAX_IMAGE));
      verifierCouverture(v, 'tuiles de 7680 × 4320 : sans trou ni chevauchement',
        grand.map((x, i) => ({ id: `T${i}`, x: [x.x, x.x + x.largeurPx - 1], y: [x.y, x.y + x.hauteurPx - 1] })), 7680, 4320);
      const actifs = baseProcesseurs(contexte).processeurs.map((p) => calculs.resoudreFiche(p, baseProcesseurs(contexte).sources)).filter((p) => calculs.champsManquants(p).length === 0);
      const plusGrand = actifs.reduce((a, b) => (b.pixelsMax > a.pixelsMax ? b : a));
      v.egal('plus grand canvas de la base : NovaPro UHD Jr, 10,4 M px, une seule image', [plusGrand.id, plusGrand.pixelsMax <= calculs.SURFACE_MAX_IMAGE], ['novastar-novapro-uhd-jr', true]);
      v.vrai('Colorlight Z8t (17,69 M px, à compléter) : il passerait en tuiles', calculs.tuilesImage(16384, 1080).length > 1);
    },
  },
  {
    id: 'R102',
    titre: 'Copier les résultats : le câblage en texte simple',
    etape: '8a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const data = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche', distanceRegieM: 20 });
      const elec = calculs.cablageElec(m, DALLE_CAS_13, calculs.electricite(m, DALLE_CAS_13, {}), { depart: 'bas-droite' });
      const texte = resumes.resumeCablage({ data, modeData: 'rectangles', elec, modeElec: 'auPlusJusteEquilibre' });
      const lignes = texte.split('\n');
      v.egal('titre', lignes[0], 'CÂBLAGE');
      v.vrai('data : variante et départ', lignes.includes('Data : rectangles NovaLCT, départ en haut à gauche'));
      v.vrai('data : une ligne par port, avec sa première et sa dernière dalle', lignes.some((l) => /^MCTRL660 n° 1, port 1 : 12 dalles de C1 R1 à C2 R1, /.test(l)));
      v.vrai('élec : marquée indicatif, à valider', lignes.includes('Élec : au plus juste, phases équilibrées, départ en bas à droite (indicatif, à valider par l\'électricien)'));
      v.vrai('élec : une ligne par câble, avec sa phase', lignes.some((l) => /^Ligne 1, phase L1 : 12 dalles de C12 R6 à /.test(l)));
      v.egal('aucun tiret long ni puce', [/[—–]/.test(texte), lignes.filter((l) => /^\s*[-•*]/.test(l))], [false, []]);
    },
  },  {
    id: 'R103',
    titre: 'Au plus juste avec demi-dalles : le serpentin réel fait foi, le décompte théorique reste affiché',
    etape: '8a',
    verifier(v, contexte) {
      const md = calculs.mur(CB5, 10, 4, { demi: CB5_DEMI, rangeeDemi: true, positionDemi: 'haut' });
      const e = calculs.evaluerProcesseur(md, CB5, processeurDeBase(contexte, 'novastar-vx6s'), { frequenceHz: 60, bits: 10, departCablage: 'haut-gauche' });
      v.egal('VX6s : décompte théorique 3 ports, serpentin 4', [e.global.auPlusJuste, e.global.serpentin.ports], [3, 4]);
      v.egal('serpentin par processeur et au total', [e.groupes.map((g) => g.ports.auPlusJusteSerpentin), e.totaux.ports.auPlusJusteSerpentin], [[4], 4]);
      v.vrai('raison de l\'écart donnée', /serpentin/.test(e.global.serpentin.ecart ?? ''));
      v.egal('même nombre que le schéma de câblage', calculs.cablageData(md, CB5, e, { depart: 'haut-gauche' }).variantes
        .find((x) => x.mode === 'auPlusJuste').processeurs.map((p) => p.ports.length), [4]);
      const me = calculs.mur(CB5, 4, 6, { demi: CB5_DEMI, rangeeDemi: true, positionDemi: 'haut' });
      const el = calculs.electricite(me, CB5, { depart: 'bas-gauche' });
      v.egal('élec : décompte théorique 5 lignes, serpentin 6', [el.lignes.auPlusJuste.theorique, el.lignes.auPlusJuste.nombre], [5, 6]);
      v.vrai('élec : raison de l\'écart donnée', /serpentin/.test(el.lignes.auPlusJuste.ecart ?? ''));
      v.egal('élec : même nombre que le schéma de câblage', calculs.cablageElec(me, CB5, el, { depart: 'bas-gauche' }).variantes
        .find((x) => x.mode === 'auPlusJuste').lignesDetail.length, 6);
      const eq = el.triphase.auPlusJuste.equilibre.lignes;
      v.vrai('élec : l\'équilibre part du serpentin (6 lignes au moins, multiple de 3)', eq.length >= 6 && eq.length % 3 === 0);
      const m13 = calculs.mur(DALLE_CAS_13, 12, 6);
      const e13 = calculs.evaluerProcesseur(m13, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('sans demi-dalles : pas d\'écart en data', [e13.global.auPlusJuste, e13.global.serpentin.ports, e13.global.serpentin.ecart], [5, 5, null]);
      const el13 = calculs.electricite(m13, DALLE_CAS_13, {});
      v.egal('sans demi-dalles : pas d\'écart en élec', [el13.lignes.auPlusJuste.theorique, el13.lignes.auPlusJuste.nombre, el13.lignes.auPlusJuste.ecart], [4, 4, null]);
    },
  },
  {
    id: 'R104',
    titre: 'Rotation réglable par parc : le prestataire sait si ses bumpers permettent de tourner les dalles',
    etape: '8a',
    verifier(v, contexte) {
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur R');
      const parc = base.parcs[0].id;
      base = fiches.basculerMembre(base, parc, 'dalle', 'roe-cb5-mkii');
      v.vrai('la rotation fait partie des réglages de parc', fiches.CHAMPS_REGLAGE_PARC.includes('rotationPossible'));
      base = fiches.reglerDalleParc(base, parc, 'roe-cb5-mkii', { rotationPossible: true });
      v.egal('réglage enregistré', fiches.reglageDalleParc(base, parc, 'roe-cb5-mkii'), { rotationPossible: true });
      const vue = fiches.appliquerReglagesParc(cb5, base, parc);
      v.egal('dans ce parc : rotation possible, avec le parc pour source', [vue.rotationPossible, vue.sources.rotationPossible?.source.court], [true, 'Parc Loueur R']);
      v.egal('dalle tournée dans ce parc', calculs.dalleTournee(vue).largeurMm, 1200);
      const non = fiches.appliquerReglagesParc({ ...cb5, rotationPossible: true }, fiches.reglerDalleParc(base, parc, 'roe-cb5-mkii', { rotationPossible: false }), parc);
      v.egal('le parc peut aussi dire non', non.rotationPossible, false);
      v.egal('saisie « oui » du formulaire', fiches.reglageDalleParc(fiches.reglerDalleParc(base, parc, 'roe-cb5-mkii', { rotationPossible: 'true' }), parc, 'roe-cb5-mkii'), { rotationPossible: true });
      v.egal('« Tous » : la fiche seule', fiches.appliquerReglagesParc(cb5, base, null).rotationPossible, undefined);
    },
  },  {
    id: 'R105',
    titre: 'Pixel map exportée : fond de chaque dalle à ses pixels exacts, mire et numéros en option',
    etape: '8c',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const zone = calculs.pixelMap(m, DALLE_CAS_13, e).canvas[1];
      const nu = calculs.motifPixelMap(zone, {});
      v.egal('taille exacte du canvas', [nu.largeurPx, nu.hauteurPx], [1152, 1152]);
      verifierCouverture(v, 'fonds : chaque dalle à ses pixels', nu.fonds.map((f, i) => ({ id: `F${i}`, x: [f.x, f.x + f.largeur - 1], y: [f.y, f.y + f.hauteur - 1] })), 1152, 1152);
      const teinte = (id) => nu.fonds.find((f) => f.id === id).teinte;
      v.vrai('dalles voisines de teintes différentes', teinte('C7 R1') !== teinte('C8 R1') && teinte('C7 R1') !== teinte('C7 R2') && teinte('C8 R1') !== teinte('C8 R2'));
      v.egal('sans option : ni mire ni numéros', [nu.contours.length, nu.traits.length, nu.cercles.length, nu.textes.length], [0, 0, 0, 0]);
      const tout = calculs.motifPixelMap(zone, { grille: true, cercles: true, diagonales: true, numeros: true });
      v.egal('grille : un contour par dalle', tout.contours.length, 36);
      v.egal('diagonales : deux par dalle, deux sur tout le bloc', tout.traits.length, 36 * 2 + 2);
      v.egal('cercles : un par dalle, un sur tout le bloc', tout.cercles.length, 37);
      v.egal('numéros : un par dalle, avec son premier pixel', [tout.textes.length, tout.textes[0].texte, tout.textes[0].detail], [36, 'C7 R1', '0, 0']);
      const dedans = (x, y) => x >= 0 && y >= 0 && x <= 1152 && y <= 1152;
      v.vrai('mire entièrement dans le canvas',
        tout.traits.every((t) => dedans(t.x1, t.y1) && dedans(t.x2, t.y2)) && tout.cercles.every((c) => dedans(c.cx - c.r, c.cy - c.r) && dedans(c.cx + c.r, c.cy + c.r)));
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const petit = calculs.mur(DALLE_CAS_13, 3, 3);
      const zonePetite = calculs.pixelMap(petit, DALLE_CAS_13, calculs.evaluerProcesseur(petit, DALLE_CAS_13, sx40, BROMPTON_60_10)).canvas[0];
      const motif = calculs.motifPixelMap(zonePetite, {});
      v.egal('SX40 : canvas de 720 × 720 px au minimum, bloc de 576 × 576 en haut à gauche',
        [motif.largeurPx, motif.hauteurPx, Math.max(...motif.fonds.map((f) => f.x + f.largeur)), Math.max(...motif.fonds.map((f) => f.y + f.hauteur))], [720, 720, 576, 576]);
    },
  },  {
    id: 'R106',
    titre: 'Enregistrer une image : feuille de partage quand l\'appareil sait partager des fichiers, téléchargement sinon',
    etape: '8c',
    verifier(v) {
      const fichiers = [{ name: 'pixel-map.png', type: 'image/png' }];
      const partage = { share: () => Promise.resolve(), canShare: () => true };
      v.egal('iPhone (partage de fichiers possible) : feuille de partage', modeEnregistrement(partage, fichiers), 'partage');
      v.egal('navigateur sans partage : téléchargement', modeEnregistrement({}, fichiers), 'telechargement');
      v.egal('partage sans fichiers (canShare refuse) : téléchargement', modeEnregistrement({ ...partage, canShare: () => false }, fichiers), 'telechargement');
      v.egal('share sans canShare : téléchargement, par prudence', modeEnregistrement({ share: partage.share }, fichiers), 'telechargement');
      v.egal('canShare en erreur : téléchargement', modeEnregistrement({ ...partage, canShare: () => { throw new Error('non'); } }, fichiers), 'telechargement');
      v.egal('pas de navigateur : téléchargement', modeEnregistrement(undefined, fichiers), 'telechargement');
    },
  },  {
    id: 'R107',
    titre: 'Capacité des ports 1G Brompton : la formule donne exactement les valeurs de l\'aide en ligne Tessera (13.1.4)',
    etape: 2,
    verifier(v, contexte) {
      // Brompton, aide en ligne Tessera, page « Output Capacity » (13.1.4), consultée le 25/09/2026 : 8, 10 et 12 bits par couleur.
      const constructeur = {
        24: [1312500, 1050000, 875000],
        25: [1260000, 1008000, 840000],
        30: [1050000, 840000, 700000],
      };
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      for (const [frequence, valeurs] of Object.entries(constructeur)) {
        valeurs.forEach((attendu, i) => {
          const reglages = { frequenceHz: Number(frequence), bits: [8, 10, 12][i] };
          v.egal(`${frequence} Hz, ${reglages.bits} bits`, calculs.capacitePort('brompton', reglages), attendu);
          v.egal(`${frequence} Hz, ${reglages.bits} bits, ULL : la moitié`, calculs.capacitePort('brompton', { ...reglages, ull: true }), attendu / 2);
          v.egal(`${frequence} Hz, ${reglages.bits} bits : même valeur avec la fiche du SX40`, calculs.capacitePortProcesseur(sx40, reglages).capacite, attendu);
        });
      }
    },
  },
];

// Pixels couverts exactement une fois : dans le cadre, surfaces égales et aucun chevauchement.
function verifierCouverture(v, libelle, dalles, largeur, hauteur) {
  const dedans = dalles.every((d) => d.x[0] >= 0 && d.y[0] >= 0 && d.x[1] <= largeur - 1 && d.y[1] <= hauteur - 1 && d.x[1] >= d.x[0] && d.y[1] >= d.y[0]);
  const surface = dalles.reduce((s, d) => s + (d.x[1] - d.x[0] + 1) * (d.y[1] - d.y[0] + 1), 0);
  let chevauchement = false;
  for (let i = 0; i < dalles.length && !chevauchement; i += 1) {
    for (let j = i + 1; j < dalles.length; j += 1) {
      const a = dalles[i];
      const b = dalles[j];
      if (a.x[0] <= b.x[1] && b.x[0] <= a.x[1] && a.y[0] <= b.y[1] && b.y[0] <= a.y[1]) {
        chevauchement = true;
        break;
      }
    }
  }
  v.egal(`${libelle} : dans le cadre, sans trou ni chevauchement`, [dedans, surface, chevauchement], [true, largeur * hauteur, false]);
}

const position = (id) => id.match(/^C(\d+) R(\d+)$/).slice(1).map(Number);

// Dalles consécutives d'un trajet : voisines (une colonne ou une rangée d'écart).
function voisines(ids) {
  return ids.every((id, i) => {
    if (i === 0) return true;
    const [c1, r1] = position(ids[i - 1]);
    const [c2, r2] = position(id);
    return Math.abs(c1 - c2) + Math.abs(r1 - r2) === 1;
  });
}

function rectanglePlein(ids) {
  const pos = ids.map(position);
  const cs = pos.map((p) => p[0]);
  const rs = pos.map((p) => p[1]);
  return (Math.max(...cs) - Math.min(...cs) + 1) * (Math.max(...rs) - Math.min(...rs) + 1) === ids.length;
}

// Une variante data : chaque dalle une seule fois, aucun port au-delà de sa capacité ni de son plafond de dalles.
function verifierPorts(v, variante, total, evaluation) {
  const ports = variante.processeurs.flatMap((p) => p.ports);
  const ids = ports.flatMap((p) => p.dalles);
  v.egal(`${variante.mode} : chaque dalle une seule fois`, [ids.length, new Set(ids).size], [total, total]);
  const plafond = evaluation.reglages.redondance && evaluation.processeur.maxDallesParBoucleRedondance ? evaluation.processeur.maxDallesParBoucleRedondance : Infinity;
  v.vrai(`${variante.mode} : aucun port au-delà de sa capacité`, ports.every((p) => p.px <= evaluation.capacite + 1e-6 && p.taux <= 1 + 1e-9 && p.dalles.length <= plafond));
}

// Une variante élec : chaque dalle une seule fois, aucune ligne au-delà de sa puissance utile ni du chaînage.
function verifierLignes(v, variante, total, utileW, chainage) {
  const ids = variante.lignesDetail.flatMap((l) => l.dalles);
  v.egal(`${variante.mode} : chaque dalle une seule fois`, [ids.length, new Set(ids).size], [total, total]);
  v.vrai(`${variante.mode} : aucune ligne au-delà de ${utileW} W${chainage ? ` ni de ${chainage} dalles` : ''}`,
    variante.lignesDetail.every((l) => l.puissanceW <= utileW + 1e-6 && l.dalles.length <= (chainage ?? Infinity)));
}
