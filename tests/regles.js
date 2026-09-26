// Règles complémentaires : décisions prises en cours de projet (« Décisions de cadrage du MVP »
// du cahier des charges du projet), hors des 13 cas tests.

import * as calculs from '../src/calculs.js';
import * as fiches from '../src/fiches.js';
import * as resumes from '../src/resumes.js';
import { modeEnregistrement, choixPartageFichier } from '../src/export.js';
import * as rappels from '../src/rappels.js';
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
const COLORLIGHT_60_8 = { frequenceHz: 60, bits: 8 };
// Dalles des tests Colorlight (étape Pb) : carte 1G i5A, carte 5G HC5, dalle haute de 128 × 256 px.
const DALLE_I5A = { ...DALLE_CAS_7, id: 'fictive-carte-i5a', nom: 'Dalle à carte i5A', carteReceptionMarque: 'Colorlight', carteReceptionModele: 'i5A' };
const DALLE_HC5 = { ...DALLE_CAS_7, id: 'fictive-carte-hc5', nom: 'Dalle à carte HC5', carteReceptionMarque: 'Colorlight', carteReceptionModele: 'HC5' };
const DALLE_128X256 = { id: 'fictive-128x256', nom: 'Dalle 128 × 256 px', fictive: true, largeurMm: 500, hauteurMm: 1000, pxH: 128, pxV: 256 };

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
      v.egal('Brompton', calculs.BIT_DEPTH_PAR_DEFAUT.brompton, 12);
      v.egal('Novastar', calculs.BIT_DEPTH_PAR_DEFAUT.novastar, 8);
      v.egal('rappel Tessera', calculs.rappelTessera({ frequenceHz: 60 }).replace(/\u202f/g, ' '),
        'Défaut 12 bits (livraison Tessera) ; en 10 bits, capacité par port de 420 000 px');
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
    titre: 'CX40 Pro : capacité de la fiche à 60 Hz (carte XA50 Pro), proportionnelle à la fréquence (déduit)',
    etape: '2b',
    verifier(v, contexte) {
      const cx40 = processeurDeBase(contexte, 'coex-cx40-pro');
      const c = (frequenceHz, bits) => calculs.capacitePortProcesseur(cx40, { frequenceHz, bits, carte: 'XA50 Pro' });
      v.egal('60 Hz : 8, 10 et 12 bits', [8, 10, 12].map((b) => calculs.entierInferieur(c(60, b).capacite)), [2951200, 2291312, 1475600]);
      v.egal('60 Hz : valeur de la fiche, pas déduite', c(60, 8).deduit, false);
      v.egal('50 Hz, 8 bits : 2 951 200 × 60 / 50', calculs.entierInferieur(c(50, 8).capacite), 3541440);
      v.egal('50 Hz : marqué déduit', c(50, 8).deduit, true);
    },
  },
  {
    id: 'R34',
    titre: 'Colorlight : 650 000 px à 60 Hz en 8 bits (fiches X20 et VX20), la moitié en 10 bits (déduit, à confirmer), 12 bits refusé',
    etape: '2b',
    verifier(v, contexte) {
      const s6f = processeurDeBase(contexte, 'colorlight-s6f');
      const c = (frequenceHz, bits) => calculs.capacitePortProcesseur(s6f, { frequenceHz, bits });
      v.egal('60 Hz, 8 bits', calculs.entierInferieur(c(60, 8).capacite), 650000);
      v.egal('60 Hz, 8 bits : ni déduit ni à confirmer (fiches constructeur)', [c(60, 8).deduit, c(60, 8).aConfirmer], [false, false]);
      v.egal('60 Hz, 10 bits : moitié ; 12 bits : non publié, pas de calcul', [calculs.entierInferieur(c(60, 10).capacite), s6f.bitsReseauPossibles], [325000, [8, 10]]);
      v.egal('10 bits : déduit et à confirmer', [c(60, 10).deduit, c(60, 10).aConfirmer], [true, true]);
      v.egal('50 Hz, 8 bits : 650 000 × 60 / 50, déduit', [calculs.entierInferieur(c(50, 8).capacite), c(50, 8).deduit], [780000, true]);
      v.egal('8 bits par défaut', calculs.BIT_DEPTH_PAR_DEFAUT.colorlight, 8);
    },
  },
  {
    id: 'R35',
    titre: 'MX20 : formule du MX40 Pro, débit constructeur (wiki COEX)',
    etape: '2b',
    verifier(v, contexte) {
      const mx20 = processeurDeBase(contexte, 'coex-mx20');
      const c = calculs.capacitePortProcesseur(mx20, { frequenceHz: 60, bits: 8 });
      v.egal('60 Hz, 8 bits : comme le MX40 Pro', calculs.entierInferieur(c.capacite), 659722);
      v.egal('plus marqué à confirmer', c.aConfirmer, false);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 12, 6), DALLE_CAS_7, mx20, NOVASTAR_60_8);
      v.vrai('plus d\'alerte « à confirmer » dans le résultat', !e.alertes.some((a) => a.includes('confirmer')));
      v.egal('calculé quand même', e.nombre, 1);
    },
  },
  {
    id: 'R36',
    titre: 'Modèle à compléter : visible dans la base, jamais utilisé dans un calcul',
    etape: '2b',
    verifier(v, contexte) {
      const manquants = (id) => calculs.champsManquants(processeurDeBase(contexte, id));
      v.egal('MX30 : complet', manquants('coex-mx30'), []);
      v.egal('X16E : complet (fiche V1.1, copie)', manquants('colorlight-x16e'), []);
      v.egal('VX20 : complet (fiche V1.20)', manquants('colorlight-vx20'), []);
      v.egal('Z6 : complet (fiche V2.2, copie)', manquants('colorlight-z6'), []);
      v.egal('Z8t : complet (fiche V2.1, cartes de sortie)', manquants('colorlight-z8t'), []);
      v.egal('S6F et X8E complets', [manquants('colorlight-s6f'), manquants('colorlight-x8e')], [[], []]);
      const m = calculs.mur(DALLE_CAS_7, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-vx400s'), NOVASTAR_60_8);
      v.egal('VX400s : aucun calcul, champs à compléter', [e.nombre, e.aCompleter], [null, ['largeurMaxPx', 'hauteurMaxPx']]);
      v.egal('VX400s : pas de ports calculés', e.global, null);
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
      // Alertes de carte seulement : l'alerte câble (Cat6A, fiche CVT8-5G) cite aussi « 5G ».
      const alerteCarte = (a) => a.startsWith('Carte de réception') && a.includes('5G');
      v.vrai('carte inconnue : alerte', inconnue.alertes.some(alerteCarte));
      const ca50e = evaluer(DALLE_CARTE_CA50E);
      v.egal('carte CA50E : calculé, sans alerte de carte', [ca50e.nombre, ca50e.alertes.some(alerteCarte)], [1, false]);
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
      v.egal('conseillé : X6 (3,9 M px, le plus petit qui suffit)', calculs.processeurConseille(colorlight).processeur.id, 'colorlight-x6');
    },
  },
  {
    id: 'R39',
    titre: 'CX40 Pro : 6 ports 5G et 9 M px',
    etape: '2b',
    verifier(v, contexte) {
      // Cas 7 : 44 × 10 dalles de 192 px, 16,2 M px ; carte inconnue : 70 dalles par port 5G en 8 bits (2 592 000 px).
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-cx40-pro'), NOVASTAR_60_8);
      v.egal('dalles par port', e.dallesParPort, 70);
      v.egal('contrôles pixels, largeur, hauteur, ports', ['pixels', 'largeur', 'hauteur', 'ports'].map((c) => e.controles[c].nombre), [2, 1, 1, 2]);
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
      v.egal('10 processeurs en 1920 × 1080 : mode 16 sorties Program 2048 × 1200', [hd.ok, hd.sortiesDisponibles], [true, 16]);
      v.egal('mode 16 sorties avec multiviewer : non retenu (à confirmer), refusé', controle(dix, source(1920, 1080), true).ok, false);
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
      v.proche('poids des barres (kg)', p.bumpersKg, 53.6, 1e-9);
      v.proche('charge d\'une barre : 2 colonnes de 2 CB5 + 10,72 kg', p.bumpers[0].kg, 65.12, 1e-9);
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
      v.egal('processeur MX30 : complet',
        fiches.validerFiche('processeur', mx30, contexte.processeurs.sources).manquants, []);
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
      v.egal('conseil, même en NovaLCT : colonnes entières (règle du terrain)', t.conseil, 'colonnes');
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
      v.egal('colonnes entières, au minimum : autant de colonnes que la ligne en supporte, 4 lignes de 3 colonnes',
        t.variantes.find((x) => x.mode === 'colonnes').lignesDetail.map((l) => colonnesDe(l.dalles).length), [3, 3, 3, 3]);
      v.egal('colonnes entières, phases équilibrées : 6 lignes de 2 colonnes, 3 120 W par phase, écart 0 %',
        [nb('colonnesEquilibre'), t.variantes.find((x) => x.mode === 'colonnesEquilibre').phases.map((p) => p.puissanceW),
          t.variantes.find((x) => x.mode === 'colonnesEquilibre').ecartPhasesPourcent], [6, [3120, 3120, 3120], 0]);
      v.egal('au plus juste : comme l\'onglet Élec', [nb('auPlusJuste'), nb('auPlusJusteEquilibre')],
        [elec.lignes.auPlusJuste.nombre, elec.triphase.auPlusJuste.equilibre.lignes.length]);
      v.egal('équilibre : charge des phases comme l\'onglet Élec', t.variantes.find((x) => x.mode === 'auPlusJusteEquilibre').phases.map((p) => p.puissanceW),
        elec.triphase.auPlusJuste.equilibre.phases.map((p) => p.puissanceW));
      v.egal('conseil en triphasé : colonnes entières, phases équilibrées', t.conseil, 'colonnesEquilibre');
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const m5 = calculs.mur(cb5, 10, 4);
      const e5 = calculs.electricite(m5, cb5, {});
      for (const variante of calculs.cablageElec(m5, cb5, e5, { depart: 'haut-droite' }).variantes) verifierLignes(v, variante, 40, e5.ligne.utileW, 7);
      const mono = calculs.electricite(m, DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 32 } });
      const tm = calculs.cablageElec(m, DALLE_CAS_13, mono, { depart: 'haut-gauche' });
      v.egal('mono : pas de variante équilibrée, une seule phase', [tm.variantes.map((x) => x.mode), tm.variantes[0].lignesDetail.every((l) => l.phase === 1)],
        [['colonnes', 'rangees', 'auPlusJuste'], true]);
      v.egal('mono : conseil au minimum de lignes, 4 lignes de 3 colonnes',
        [tm.conseil, tm.variantes.find((x) => x.mode === 'colonnes').lignesDetail.map((l) => colonnesDe(l.dalles).length)], ['colonnes', [3, 3, 3, 3]]);
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
      v.vrai('mou compté dans le contrôle : au-delà de 100 m en cuivre, alerte ; MCTRL660 sans sortie fibre : une paire de CVT310 ou CVT320 par port',
        col.alertes.some((a) => /100 m/.test(a) && /pas de sortie fibre/.test(a) && /CVT310/.test(a) && /CVT320/.test(a)));
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
      v.egal('plus grand canvas de la base : MX6000 Pro, 141 M px, au-delà de la limite : en tuiles', [plusGrand.id, plusGrand.pixelsMax <= calculs.SURFACE_MAX_IMAGE], ['coex-mx6000-pro', false]);
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
      const e = calculs.evaluerProcesseur(md, CB5, processeurDeBase(contexte, 'novastar-mctrl660-pro'), { frequenceHz: 60, bits: 10, departCablage: 'haut-gauche' });
      v.egal('MCTRL660 Pro : décompte théorique 3 ports, serpentin 4', [e.global.auPlusJuste, e.global.serpentin.ports], [3, 4]);
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
  },  {
    id: 'R108',
    titre: 'Départ du câblage selon le mode du mur : en bas en stack, en haut en accroche, forçable',
    etape: '8b',
    verifier(v, contexte) {
      v.egal('stack, côté gauche : en bas à gauche', calculs.coinDepart({ mode: 'stack', cote: 'gauche' }), 'bas-gauche');
      v.egal('accroche, côté droit : en haut à droite', calculs.coinDepart({ mode: 'accroche', cote: 'droite' }), 'haut-droite');
      v.egal('automatique par défaut', calculs.coinDepart({ mode: 'stack', cote: 'droite', bord: 'auto' }), 'bas-droite');
      v.egal('stack forcé en haut (régie arrivant par le haut)', calculs.coinDepart({ mode: 'stack', cote: 'gauche', bord: 'haut' }), 'haut-gauche');
      v.egal('accroche forcée en bas (armoire arrivant par le bas)', calculs.coinDepart({ mode: 'accroche', cote: 'droite', bord: 'bas' }), 'bas-droite');
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 12, 6);
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      for (const [mode, rangee] of [['stack', 6], ['accroche', 1]]) {
        const coin = calculs.coinDepart({ mode, cote: 'gauche' });
        const e = calculs.evaluerProcesseur(m, bp2, s8, { ...BROMPTON_60_10, departCablage: coin });
        const data = calculs.cablageData(m, bp2, e, { depart: coin });
        const elec = calculs.cablageElec(m, bp2, calculs.electricite(m, bp2, { depart: coin }), { depart: coin });
        const premieres = [
          ...data.variantes.find((x) => x.mode === data.conseil).processeurs.flatMap((p) => p.ports.map((x) => x.dalles[0])),
          ...elec.variantes.find((x) => x.mode === elec.conseil).lignesDetail.map((l) => l.dalles[0]),
        ];
        v.vrai(`${mode} : chaque entrée data et chaque arrivée élec au bord ${rangee === 6 ? 'bas (rangée 6)' : 'haut (rangée 1)'}`, premieres.every((id) => position(id)[1] === rangee));
      }
    },
  },
  {
    id: 'R109',
    titre: 'Variante conseillée : colonnes entières, le plus de colonnes par port ; nombre pair seulement en redondance',
    etape: '8b',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const essais = [
        ['BP2 V2 12 × 6 sur S8', bp2, calculs.mur(bp2, 12, 6), 'brompton-s8', BROMPTON_60_10],
        ['cas 13 sur MCTRL660', DALLE_CAS_13, calculs.mur(DALLE_CAS_13, 12, 6), 'novastar-mctrl660', NOVASTAR_60_8],
        ['cas 7 sur SX40', DALLE_CAS_7, calculs.mur(DALLE_CAS_7, 44, 10), 'brompton-sx40', BROMPTON_60_10],
        ['cas 5 sur MCTRL660', CABINET_CAS_5, calculs.mur(CABINET_CAS_5, 10, 3), 'novastar-mctrl660', NOVASTAR_60_8],
      ];
      for (const [nom, dalle, m, id, reglages] of essais) {
        const e = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, id), { ...reglages, departCablage: 'bas-gauche' });
        const t = calculs.cablageData(m, dalle, e, { depart: 'bas-gauche' });
        v.egal(`${nom} : conseil par colonnes entières`, t.conseil, 'colonnes');
        v.vrai(`${nom} : aucune colonne coupée entre deux ports`, colonnesEntieres(t.variantes.find((x) => x.mode === 'colonnes').processeurs.flatMap((p) => p.ports), m.rangees.length));
        v.egal(`${nom} : au plus juste disponible, mais signalé`, t.variantes.find((x) => x.mode === 'auPlusJuste').mention, 'optimisation, rarement câblé ainsi sur le terrain');
      }
      const m5 = calculs.mur(DALLE_CAS_13, 12, 5);
      const conseillee = (id) => {
        const e = calculs.evaluerProcesseur(m5, DALLE_CAS_13, processeurDeBase(contexte, id), NOVASTAR_60_8);
        return calculs.cablageData(m5, DALLE_CAS_13, e, { depart: 'bas-gauche' }).variantes.find((x) => x.mode === 'colonnes');
      };
      const k4 = conseillee('novastar-mctrl4k');
      v.egal('MCTRL4K sans redondance, colonnes de 5 dalles : 3 colonnes par port, 4 ports comme l\'onglet Data',
        k4.processeurs[0].ports.map((p) => colonnesDe(p.dalles).length), [3, 3, 3, 3]);
      const k660 = conseillee('novastar-mctrl660');
      v.egal('MCTRL660 sans redondance : 3 colonnes par port', k660.processeurs[0].ports.map((p) => colonnesDe(p.dalles).length), [3, 3, 3, 3]);
    },
  },
  {
    id: 'R110',
    titre: 'Retour de secours : le long de la dernière colonne jusqu\'au bord de départ, jamais en diagonale, longueur affichée',
    etape: '8b',
    verifier(v, contexte) {
      const m7 = calculs.mur(DALLE_CAS_7, 44, 10);
      const e7 = calculs.evaluerProcesseur(m7, DALLE_CAS_7, processeurDeBase(contexte, 'brompton-sx40'), { ...BROMPTON_60_10, redondance: true, departCablage: 'bas-gauche' });
      const v7 = calculs.cablageData(m7, DALLE_CAS_7, e7, { depart: 'bas-gauche' }).variantes.find((x) => x.mode === 'colonnes');
      const p = v7.processeurs[0].ports[0];
      v.vrai('chemin du secours : segments verticaux ou horizontaux seulement', v7.processeurs.every((pr) => pr.ports.every((x) => droit(x.secours.chemin))));
      v.egal('cas 7 en stack : de la dernière dalle (en haut de C1) au bord bas, puis au coin', p.secours.chemin, [[250, 250], [250, 5000], [0, 5000]]);
      v.proche('longueur du retour le long du mur : (4,75 + 0,25 m) × 1,10 de mou', p.secours.retourM, 5.5, 0.001);
      v.egal('une colonne par port, nombre impair : retour long', p.secours.long, true);
      v.vrai('alerte « retour de secours long »', v7.alertes.some((a) => /retour de secours long/.test(a) && /5,5 m/.test(a)));
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 12, 6);
      const e = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'brompton-s8'), { ...BROMPTON_60_10, redondance: true, departCablage: 'bas-gauche' });
      const vc = calculs.cablageData(m, bp2, e, { depart: 'bas-gauche', distanceRegieM: 20 }).variantes.find((x) => x.mode === 'colonnes');
      const p2 = vc.processeurs[0].ports[0];
      v.egal('BP2 V2 sur S8 : deux colonnes par port, la chaîne revient en bas, retour court', [p2.secours.long, p2.secours.chemin], [false, [[750, 2750], [750, 3000], [0, 3000]]]);
      v.proche('longueur du retour de secours avec la distance régie : (20 + 1 m) × 1,10', p2.secours.longueurCuivreM, 23.1, 0.001);
      v.vrai('pas d\'alerte de retour long', !vc.alertes.some((a) => /retour de secours long/.test(a)));
    },
  },
  {
    id: 'R111',
    titre: 'Élec : autant de colonnes entières que la ligne en supporte ; en triphasé, l\'équilibre des phases ; tête au même bord que la data',
    etape: '8b',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      for (const [nom, dalle, conseil] of [['BP2 V2 (190 W, deux colonnes au plus)', bp2, 'colonnes'],
        ['cas 13 (130 W, trois colonnes tiennent, deux équilibrent les phases)', DALLE_CAS_13, 'colonnesEquilibre']]) {
        const m = calculs.mur(dalle, 12, 6);
        const t = calculs.cablageElec(m, dalle, calculs.electricite(m, dalle, { depart: 'bas-gauche' }), { depart: 'bas-gauche' });
        const vc = t.variantes.find((x) => x.mode === t.conseil);
        v.egal(`${nom} : conseil en colonnes entières, phases équilibrées`, t.conseil, conseil);
        v.egal(`${nom} : 6 lignes de 2 colonnes entières`, vc.lignesDetail.map((l) => colonnesDe(l.dalles).length), [2, 2, 2, 2, 2, 2]);
        v.vrai(`${nom} : aucune colonne coupée entre deux lignes`, colonnesEntieres(vc.lignesDetail, 6));
        v.vrai(`${nom} : chaque tête en bas (rangée 6)`, vc.lignesDetail.every((l) => position(l.dalles[0])[1] === 6));
        v.egal(`${nom} : au plus juste signalé`, t.variantes.find((x) => x.mode === 'auPlusJuste').mention, 'optimisation, rarement câblé ainsi sur le terrain');
      }
    },
  },
  {
    id: 'R112',
    titre: 'Data et Schéma comptent les mêmes ports en colonnes entières ; nombre pair en redondance, sauf s\'il coûte un processeur ; minimum théorique en second',
    etape: '8b',
    verifier(v, contexte) {
      const colonnesDuSchema = (m, dalle, e) => calculs.cablageData(m, dalle, e, { depart: 'bas-gauche' }).variantes.find((x) => x.mode === 'colonnes');
      const m5 = calculs.mur(DALLE_CAS_13, 12, 5);
      const e4 = calculs.evaluerProcesseur(m5, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl4k'), { ...NOVASTAR_60_8, redondance: true, departCablage: 'bas-gauche' });
      const s4 = colonnesDuSchema(m5, DALLE_CAS_13, e4);
      v.egal('MCTRL4K en redondance : 2 colonnes par port (nombre pair), 6 ports principaux dans Data comme dans Schéma',
        [e4.global.colonnes.colonnesParPort, e4.totaux.ports.colonnes, s4.processeurs[0].ports.map((p) => colonnesDe(p.dalles).length)], [2, 6, [2, 2, 2, 2, 2, 2]]);
      v.egal('MCTRL4K en redondance : 12 ports avec les secours', e4.totaux.ports.redondance.colonnes, 12);
      v.egal('minimum théorique en second : 4 ports au plus juste', e4.global.minimum.nombre, 4);
      v.vrai('raison de l\'écart : le nombre pair en redondance', /nombre pair/.test(e4.global.minimum.texte ?? '') && /2 colonnes par port au lieu de 3/.test(e4.global.minimum.texte ?? ''));
      const e660 = calculs.evaluerProcesseur(m5, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { ...NOVASTAR_60_8, redondance: true, departCablage: 'bas-gauche' });
      const s660 = colonnesDuSchema(m5, DALLE_CAS_13, e660);
      v.egal('MCTRL660 en redondance : le nombre pair coûterait un processeur (3 au lieu de 2), gardé à 3 colonnes par port',
        [e660.nombre, e660.pairAbandonne, e660.global.colonnes.colonnesParPort], [2, { avecPair: 3, sansPair: 2 }, 3]);
      v.vrai('alerte : nombre pair abandonné, retour de secours long', e660.alertes.some((a) => /nombre pair/.test(a) && /3 × Novastar MCTRL660 au lieu de 2/.test(a) && /retour de secours est long/.test(a)));
      v.egal('schéma : 3 colonnes par port sur chaque MCTRL660', s660.processeurs.map((p) => p.ports.map((q) => colonnesDe(q.dalles).length)), [[3, 3], [3, 3]]);
      v.vrai('schéma : retours de secours longs signalés, de 3,9 m à 8,8 m', s660.alertes.some((a) => /retour de secours long, de 3,9 m à 8,8 m/.test(a)));
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 12, 6);
      for (const redondance of [false, true]) {
        const e = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'brompton-s8'), { ...BROMPTON_60_10, redondance, departCablage: 'bas-gauche' });
        const s = colonnesDuSchema(m, bp2, e);
        v.egal(`BP2 V2 sur S8${redondance ? ' en redondance' : ''} : mêmes ports dans Data et dans Schéma`,
          e.totaux.ports.colonnes, s.processeurs.reduce((n, p) => n + p.ports.length, 0));
      }
    },
  },
  {
    id: 'R113',
    titre: 'Élec en triphasé : conseil à l\'équilibre des phases en colonnes entières, écart en pourcentage, minimum de lignes en second',
    etape: '8b',
    verifier(v) {
      const e = calculs.electricite(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 32 } });
      const { equilibre, minimum } = e.triphase.colonnes;
      v.egal('cas 13 : équilibre de 6 lignes de 2 colonnes, écart 0 %', [equilibre.lignes.map((l) => l.colonnes), equilibre.ecartW, equilibre.ecartPourcent],
        [[2, 2, 2, 2, 2, 2], 0, 0]);
      v.egal('minimum en second : 4 lignes de 3 colonnes, 2 340 W d\'écart, 50 %', [minimum.lignes.map((l) => l.colonnes), minimum.ecartW, minimum.ecartPourcent],
        [[3, 3, 3, 3], 2340, 50]);
      v.egal('lignes retenues : celles de l\'équilibre', e.lignes.retenues, 6);
      v.vrai('raison de l\'écart au minimum théorique : l\'équilibre des phases', /équilibre des phases : 6 lignes au lieu de 4/.test(e.lignes.minimum.texte ?? ''));
      const e10 = calculs.electricite(calculs.mur(DALLE_CAS_13, 10, 6), DALLE_CAS_13, { arrivee: { type: 'tri', intensiteA: 32 } });
      v.egal('dalle du cas 13 en 10 × 6 : à écart égal (25 %), le moins de lignes, et les plus régulières : 3-3-2-2 plutôt que 3-3-3-1',
        [e10.triphase.colonnes.equilibre.lignes.map((l) => l.colonnes), e10.triphase.colonnes.equilibre.phases.map((p) => p.puissanceW),
          e10.triphase.colonnes.equilibre.ecartPourcent], [[3, 3, 2, 2], [2340, 2340, 3120], 25]);
      const mono = calculs.electricite(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { arrivee: { type: 'mono', intensiteA: 32 } });
      v.egal('monophasé : rien ne change, le minimum de lignes', [mono.triphase, mono.lignes.retenues], [null, 4]);
    },
  },
  {
    id: 'R114',
    titre: 'Brompton : 12 bits par défaut (livraison Tessera), profondeur réseau réglable par parc, rappel avec la capacité en 10 bits',
    etape: '8b',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const e = calculs.evaluerProcesseur(calculs.mur(bp2, 12, 6), bp2, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60 });
      v.egal('sans réglage : 12 bits, 350 000 px par port, 11 dalles de BP2 V2 par port', [e.reglages.bits, Math.floor(e.capacite), e.dallesParPort], [12, 350000, 11]);
      const simple = (texte) => texte.replace(/\u202f/g, ' ');
      v.egal('rappel à 60 Hz', simple(calculs.rappelTessera({ frequenceHz: 60 })), 'Défaut 12 bits (livraison Tessera) ; en 10 bits, capacité par port de 420 000 px');
      v.egal('rappel à 50 Hz : capacité recalculée', simple(calculs.rappelTessera({ frequenceHz: 50 })), 'Défaut 12 bits (livraison Tessera) ; en 10 bits, capacité par port de 504 000 px');
      v.egal('rappel en ULL à 60 Hz : divisée par 2', simple(calculs.rappelTessera({ frequenceHz: 60, ull: true })), 'Défaut 12 bits (livraison Tessera) ; en 10 bits, capacité par port de 210 000 px');
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const id = base.parcs[0].id;
      v.egal('parc sans réglage : le défaut', fiches.bitsReseauParc(base, id, 'brompton'), { bits: 12, source: 'défaut (livraison Tessera)' });
      base = fiches.reglerBitsParc(base, id, 'brompton', '10');
      v.egal('parc réglé à 10 bits : il remplace le défaut, source « Parc Loueur A »', fiches.bitsReseauParc(base, id, 'brompton'), { bits: 10, source: 'Parc Loueur A' });
      v.egal('« Tous » : le défaut', fiches.bitsReseauParc(base, null, 'brompton'), { bits: 12, source: 'défaut (livraison Tessera)' });
      v.egal('Novastar : son défaut, 8 bits', fiches.bitsReseauParc(base, id, 'novastar'), { bits: 8, source: 'défaut Novastar' });
      v.egal('valeur hors de 8, 10 ou 12 : refusée', fiches.bitsReseauParc(fiches.reglerBitsParc(base, id, 'brompton', '9'), id, 'brompton').bits, 12);
      v.egal('champ vidé : retour au défaut', fiches.bitsReseauParc(fiches.reglerBitsParc(base, id, 'brompton', ''), id, 'brompton').bits, 12);
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      const relu = fiches.importer(fiches.baseVide(), JSON.stringify(fiches.exporter(base, depart)), depart).base;
      v.egal('réglage du parc gardé à l\'export et à l\'import', fiches.bitsReseauParc(relu, id, 'brompton'), { bits: 10, source: 'Parc Loueur A' });
    },
  },
  {
    id: 'R115',
    titre: 'Rappel Brompton : le même processeur en 10 bits, quand cela économise des processeurs',
    etape: '8b',
    verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const m = calculs.mur(bp2, 12, 6);
      const gain = (reglages, mur = m) => calculs.gainDixBits(mur, bp2, calculs.evaluerProcesseur(mur, bp2, s8, { frequenceHz: 60, ...reglages }));
      const douze = gain({ bits: 12 });
      v.egal('BP2 V2 12 × 6 en 12 bits : 6 ports et 1 S8 en 10 bits, au lieu de 2', [douze?.ports, douze?.nombre, douze?.avant], [6, 1, 2]);
      v.egal('ligne du rappel', douze?.texte, 'en 10 bits : 6 ports, 1 × S8 au lieu de 2');
      v.egal('en redondance : 2 S8 au lieu de 3', gain({ bits: 12, redondance: true })?.texte, 'en 10 bits : 6 ports + 6 de secours, 2 × S8 au lieu de 3');
      v.egal('déjà en 10 bits : pas de ligne', gain({ bits: 10 }), null);
      v.egal('8 bits : pas de ligne (10 bits ne ferait pas mieux)', gain({ bits: 8 }), null);
      v.egal('même nombre de processeurs en 10 bits (4 × 6) : pas de ligne', gain({ bits: 12 }, calculs.mur(bp2, 4, 6)), null);
      const mctrl = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 10 });
      v.egal('Novastar : jamais de ligne', calculs.gainDixBits(m, bp2, mctrl), null);
    },
  },
  {
    id: 'R116',
    titre: 'Règle 3 : une valeur corrigée par le constructeur est retenue ; l\'ancienne reste visible, « non retenue », même plus défavorable',
    etape: 'sources',
    verifier(v) {
      const champ = { valeurs: [{ valeur: 4147200, source: 'fiche' }, { valeur: 4100000, source: 'ancienne', nonRetenue: true }] };
      const r = calculs.valeurRetenue(champ, 'min', {});
      v.egal('valeur constructeur retenue, même plus haute', [r.valeur, r.source.id], [4147200, 'fiche']);
      v.egal('ancienne visible, marquée non retenue', r.autres.map((x) => [x.valeur, x.nonRetenue]), [[4100000, true]]);
      v.egal('pas de conflit à trancher : la correction décide', r.conflit, false);
      const deux = calculs.valeurRetenue({ valeurs: [{ valeur: 10, source: 'a' }, { valeur: 12, source: 'b' }, { valeur: 9, source: 'c', nonRetenue: true }] }, 'max', {});
      v.egal('parmi les autres, la plus défavorable reste retenue', [deux.valeur, deux.conflit, deux.autres.map((x) => [x.valeur, Boolean(x.nonRetenue)])], [12, true, [[10, false], [9, true]]]);
    },
  },
  {
    id: 'R117',
    titre: 'Manuel ROE Carbon MKII V1.8 : 7 CB5 MKII par ligne à 220 et 240 V, 3 à 110 V (16 A, sans marge) ; processing Brompton, Megapixel VR ou Evision ; structure pour 5 fois le poids',
    etape: 'sources',
    verifier(v, contexte) {
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const m = calculs.mur(cb5, 4, 3);
      const parLigne = (tensionV) => calculs.electricite(m, cb5, { tensionV, marge: 1, departA: 16 }).dallesParLigne;
      v.egal('220 V : 7 dalles par ligne', parLigne(220).retenu, 7);
      v.egal('240 V : 7, limité par le chaînage (8 en puissance)', [parLigne(240).retenu, parLigne(240).limite, parLigne(240).puissance], [7, 'chaînage', 8]);
      v.egal('110 V : 3 dalles par ligne', parLigne(110).retenu, 3);
      v.egal('chaînage : manuel Carbon MKII V1.8, constructeur', [cb5.sources.chainagePowerMax.source.id, cb5.sources.chainagePowerMax.source.confiance], ['roe-manuel-carbon-mkii-v1-8', 'constructeur']);
      v.vrai('processing Brompton, Megapixel VR ou Evision : la carte dépend du parc', cb5.carteReceptionMarque === undefined && ['Brompton', 'Megapixel VR', 'Evision'].every((x) => (cb5.note ?? '').includes(x)));
      v.vrai('rappel poids : structure pour 5 fois le poids, selon ROE', calculs.poids(m, cb5, {}).rappels.some((x) => /5 fois le poids/.test(x)));
      v.egal('source du rappel : manuel Carbon MKII V1.8, constructeur', contexte.dalles.sources['roe-structure-5-fois'].confiance, 'constructeur');
    },
  },
  {
    id: 'R118',
    titre: 'Entrées de la fiche du processeur prioritaires sur la norme : MX30 (HDMI 2.0, HDMI 1.4, DP 1.1, 2 × 3G-SDI)',
    etape: 'sources',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const mx30 = processeurDeBase(contexte, 'coex-mx30');
      v.egal('entrées structurées, source fiche MX30 V1.0.1', [mx30.entreesTypes, mx30.sources.entreesTypes.source.id], [['hdmi-2.0', 'hdmi-1.4', 'dp', '3g-sdi'], 'coex-mx30-v1-0-1']);
      const entree = (largeurPx, hauteurPx, frequenceHz, liaison) => calculs.controleEntree(mx30, { largeurPx, hauteurPx, frequenceHz, liaison }, liaisons);
      const hdmi14 = liaisons.find((l) => l.id === 'hdmi-1.4');
      v.egal('HDMI 1.4 : 4096 × 1080 à 60 Hz refusé par la norme de la base, accepté par la fiche du MX30',
        [calculs.controleLiaison(hdmi14, { largeurPx: 4096, hauteurPx: 1080, frequenceHz: 60 }).ok, entree(4096, 1080, 60, 'hdmi-1.4').ok], [false, true]);
      v.egal('HDMI 1.4 : 4096 px de large au plus', entree(4608, 960, 60, 'hdmi-1.4').ok, false);
      const dp = entree(4096, 1080, 60, 'dp-1.2');
      v.egal('DisplayPort : contrôle sur l\'entrée DP 1.1 de la fiche, 4096 × 1080 à 60 Hz', [dp.ok, dp.alertes.some((a) => a.includes('DP 1.1'))], [true, true]);
      v.egal('DisplayPort : 4096 × 2160 à 60 Hz dépasse l\'entrée DP 1.1', entree(4096, 2160, 60, 'dp-1.2').ok, false);
      v.egal('HDMI 2.0 : 8192 × 1080 à 60 Hz passe (même débit), 8192 px de large au plus', [entree(8192, 1080, 60, 'hdmi-2.0').ok, entree(8704, 1016, 60, 'hdmi-2.0').ok], [true, false]);
      v.egal('HDMI 2.0 : 7680 px de haut au plus', [entree(1080, 7680, 60, 'hdmi-2.0').ok, entree(1024, 8192, 60, 'hdmi-2.0').ok], [true, false]);
      v.egal('3G-SDI : 1920 × 1080 à 60 Hz, pas 3840 × 2160', [entree(1920, 1080, 60, '3g-sdi').ok, entree(3840, 2160, 30, '3g-sdi').ok], [true, false]);
      v.vrai('fiche : sorties 10 ports 1G, OPT 1 porte les ports 1 à 10, OPT 2 en est la copie', /OPT 2/.test(mx30.note ?? '') && /copie/.test(mx30.note ?? ''));
      const mctrl = calculs.controleEntree(processeurDeBase(contexte, 'novastar-mctrl660'), { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60, liaison: 'hdmi-2.0' }, liaisons);
      v.egal('processeur sans formats de fiche : contrôle par la norme, comme avant (MCTRL660, HDMI 1.3)', [mctrl.ok, mctrl.liaison.id], [false, 'hdmi-1.3']);
    },
  },
  {
    id: 'R119',
    titre: 'COEX, ports 1G : largeur chargée d\'au moins 128 px, sinon capacité du port réduite de (128 − largeur) × hauteur',
    etape: 'coex',
    verifier(v, contexte) {
      v.egal('exemple de la fiche : colonne de 104 px sur 1248 px, 29 952 px en moins', calculs.penaliteLargeurChargee(104, 1248, 128), 29952);
      v.egal('128 px de large ou plus : pas de réduction', [calculs.penaliteLargeurChargee(128, 1248, 128), calculs.penaliteLargeurChargee(208, 1248, 128)], [0, 0]);
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const m = calculs.mur(cb5, 4, 30);
      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      v.egal('MX40 Pro : largeur chargée mini de 128 px, sourcée', [mx40.largeurChargeeMinPx, mx40.sources.largeurChargeeMinPx.source.id], [128, 'coex-mx40-pro-v1-5']);
      const e = calculs.evaluerProcesseur(m, cb5, mx40, { frequenceHz: 60, bits: 8 });
      // Colonne de 30 CB5 : 104 × 6240 = 648 960 px, 798 720 px avec la réduction, au-delà des 659 722 px d'un port.
      v.egal('MX40 Pro : colonne de 30 CB5 coupée en 2 segments de 15, 8 ports', [e.global.colonnes.segments, e.global.colonnes.ports], [[15, 15], 8]);
      v.vrai('alerte : largeur chargée de 104 px, 74 880 px de capacité en moins par port', e.alertes.some((a) => a.includes('128') && /74.880/.test(a)));
      const k4 = calculs.evaluerProcesseur(m, cb5, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8 });
      v.egal('Novastar hors COEX : pas de réduction, une colonne par port', [k4.global.colonnes.colonnesParPort, k4.global.colonnes.ports], [1, 4]);
      const auPlusJuste = calculs.cablageData(m, cb5, e, { depart: 'bas-gauche' }).variantes.find((x) => x.mode === 'auPlusJuste');
      const hors = auPlusJuste.processeurs.flatMap((p) => p.ports).filter((port) => {
        const cols = new Set(port.dalles.map((id) => id.split(' ')[0]));
        const rangs = new Set(port.dalles.map((id) => id.split(' ')[1]));
        return port.px + calculs.penaliteLargeurChargee(cols.size * 104, rangs.size * 208, 128) > e.capacite + 1e-6;
      });
      v.egal('au plus juste : chaque port tient, réduction comprise', hors.length, 0);
      const sans = calculs.evaluerProcesseur(m, cb5, { ...mx40, largeurChargeeMinPx: undefined }, { frequenceHz: 60, bits: 8 });
      v.egal('Data : le serpentin au plus juste compte la réduction (5 ports, 4 sans elle)', [e.global.serpentin.ports, sans.global.serpentin.ports], [5, 4]);
    },
  },
  {
    id: 'R120',
    titre: 'MX40 Pro en mode 40 ports : CVT10 obligatoires, un par groupe de 10 ports, comptés par processeur ; cuivre depuis le pied du mur',
    etape: 'coex',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx40, { ...NOVASTAR_60_8, modeOptique: true });
      v.egal('2 MX40 Pro (pixels), 22 ports chacun, 3 CVT10 chacun', [e.nombre, e.groupes.map((g) => g.ports.colonnes), e.groupes.map((g) => g.distributeurs.colonnes)], [2, [22, 22], [3, 3]]);
      v.egal('CVT10 obligatoires en mode 40 ports', e.distributeurObligatoire, true);
      const cuivre = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx40, NOVASTAR_60_8);
      v.egal('mode 20 ports : CVT10 seulement si fibre', cuivre.distributeurObligatoire, false);
      const t = calculs.cablageData(m, DALLE_CAS_7, e, { depart: 'bas-gauche', distanceRegieM: 80 }).variantes.find((x) => x.mode === 'colonnes');
      const port = t.processeurs[0].ports[0];
      v.proche('fibre jusqu\'au CVT10 : 80 m × 1,10', port.fibreM, 88, 1e-9);
      v.proche('cuivre depuis le pied du mur : trajet seul jusqu\'au centre de C1 R10 (0,5 m) × 1,10', port.longueurCuivreM, 0.55, 1e-9);
    },
  },
  {
    id: 'R121',
    titre: 'COEX 5G : câble Cat6A obligatoire (wiki COEX), 100 m au plus (fiche CVT8-5G V1.1.0, copie non officielle) ; CVT8-5G si fibre, 8 ports 5G',
    etape: 'coex',
    verifier(v, contexte) {
      const cx40 = processeurDeBase(contexte, 'coex-cx40-pro');
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, cx40, NOVASTAR_60_8);
      v.vrai('Data : Cat6A obligatoire, 100 m au plus avec sa source', e.alertes.some((a) => a.includes('Cat6A') && a.includes('100 m') && a.includes('fiche CVT8-5G V1.1.0, copie non officielle')));
      v.egal('CVT8-5G, 8 ports 5G, seulement si fibre', [cx40.distributeur, cx40.sortiesParDistributeur, e.distributeurObligatoire], ['coex-cvt8-5g', 8, false]);
      const t = calculs.cablageData(m, DALLE_CAS_7, e, { depart: 'bas-gauche', distanceRegieM: 150 }).variantes.find((x) => x.mode === 'colonnes');
      v.vrai('Schéma : seuil de 100 m en 5G, régie à 150 m : passe en fibre avec des CVT8-5G', t.alertes.some((a) => a.includes('au-delà de 100 m') && a.includes('CVT8-5G')));
      v.vrai('Schéma : Cat6A avec sa source', t.alertes.some((a) => a.includes('Cat6A') && a.includes('fiche CVT8-5G V1.1.0, copie non officielle')));
      const mx40 = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-mx40-pro'), NOVASTAR_60_8);
      v.vrai('1G : pas d\'alerte Cat6A', !mx40.alertes.some((a) => a.includes('Cat6A')));
    },
  },
  {
    id: 'R122',
    titre: 'Data : consommation et poids du processeur et des convertisseurs affichés, repris dans le texte copié',
    etape: 'coex',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 44, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-mx40-pro'), { ...NOVASTAR_60_8, modeOptique: true });
      const cvt10 = calculs.resoudreFiche(baseProcesseurs(contexte).distributeurs.find((x) => x.id === 'novastar-cvt10'), baseProcesseurs(contexte).sources);
      const lignes = resumes.resumeData(e, { distributeur: 'CVT10', puissanceDistributeurW: cvt10.puissanceW }).split('\n');
      v.vrai('processeur : 95 W, 7,5 kg, 1U', lignes.includes('MX40 Pro : 95 W, 7,5 kg, 1U chacun'));
      v.vrai('convertisseurs : 22 W chacun', lignes.some((l) => l.startsWith('CVT10 : 6') && l.includes('22 W chacun')));
    },
  },
  {
    id: 'R123',
    titre: 'Règle des 128 px : source constructeur pour le MX40 Pro, « déduit » par analogie pour les MX20 et MX30 (absente de leur fiche) ; format HDMI 2.0 du MX40 Pro de sa fiche',
    etape: 'coex',
    verifier(v, contexte) {
      const source = (id) => processeurDeBase(contexte, id).sources.largeurChargeeMinPx.source;
      v.egal('MX40 Pro : fiche V1.5.0, constructeur', [source('coex-mx40-pro').id, source('coex-mx40-pro').confiance], ['coex-mx40-pro-v1-5', 'constructeur']);
      for (const id of ['coex-mx20', 'coex-mx30']) {
        const s = source(id);
        v.egal(`${id} : 128 px par analogie, « déduit »`, [processeurDeBase(contexte, id).largeurChargeeMinPx, s.id, s.confiance], [128, 'coex-largeur-chargee-analogie', 'déduit']);
        v.vrai(`${id} : la source dit « par analogie avec la fiche MX40 Pro, absente de sa fiche »`, /par analogie avec la fiche MX40 Pro/.test(s.titre) && /absente de sa fiche/.test(s.titre));
      }
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const e = calculs.evaluerProcesseur(calculs.mur(cb5, 4, 30), cb5, processeurDeBase(contexte, 'coex-mx30'), { frequenceHz: 60, bits: 8 });
      v.vrai('MX30 : alerte des 128 px marquée « déduit »', e.alertes.some((a) => a.includes('128') && a.includes('déduit')));
      const mx40 = processeurDeBase(contexte, 'coex-mx40-pro');
      const hdmi = mx40.entreesFormats.find((f) => f.type === 'hdmi-2.0');
      v.egal('MX40 Pro : HDMI 2.0 à 4096 × 2160 ou 8192 × 1080 à 60 Hz, de sa fiche', [hdmi.largeurPx, hdmi.hauteurPx, hdmi.frequenceHz, hdmi.largeurMaxPx, mx40.sources.entreesFormats.source.id],
        [4096, 2160, 60, 8192, 'coex-mx40-pro-v1-5']);
    },
  },
  {
    id: 'R124',
    titre: 'KU20 : 8 bits seulement par défaut, 10 et 12 bits refusés avec la raison (programme personnalisé)',
    etape: 'coex',
    verifier(v, contexte) {
      const ku20 = processeurDeBase(contexte, 'coex-ku20');
      const m = calculs.mur(DALLE_CAS_7, 12, 6);
      const e8 = calculs.evaluerProcesseur(m, DALLE_CAS_7, ku20, NOVASTAR_60_8);
      v.egal('8 bits : 1 KU20, 6 ports de 2 colonnes', [e8.nombre, e8.global.colonnes.ports, e8.global.colonnes.colonnesParPort], [1, 6, 2]);
      const e10 = calculs.evaluerProcesseur(m, DALLE_CAS_7, ku20, { frequenceHz: 60, bits: 10 });
      v.vrai('10 bits : refusé, programme personnalisé', e10.nombre === null && /programme personnalisé/.test(e10.impossible ?? ''));
      const e12 = calculs.evaluerProcesseur(m, DALLE_CAS_7, ku20, { frequenceHz: 60, bits: 12 });
      v.vrai('12 bits : refusé', e12.nombre === null && /8 bits/.test(e12.impossible ?? ''));
      v.egal('règle des 128 px par analogie (déduit)', ku20.sources.largeurChargeeMinPx.source.confiance, 'déduit');
      const liaisons = liaisonsDeBase(contexte);
      v.egal('entrée HDMI 1.3 de la fiche : 1920 × 1200 à 60 Hz passe, 2304 × 1152 à 60 Hz non',
        [1920, 2304].map((l) => calculs.controleEntree(ku20, { largeurPx: l, hauteurPx: l === 1920 ? 1200 : 1152, frequenceHz: 60, liaison: 'hdmi-1.3' }, liaisons).ok), [true, false]);
    },
  },
  {
    id: 'R125',
    titre: 'SP60 Pro : processeur sous-pixel, fiche d\'information, refusé dans Data avec « processeur sous-pixel, calcul hors appli »',
    etape: 'coex',
    verifier(v, contexte) {
      const sp60 = processeurDeBase(contexte, 'coex-sp60-pro');
      const m = calculs.mur(DALLE_CAS_7, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, sp60, NOVASTAR_60_8);
      v.egal('refusé avec la raison', [e.nombre, /processeur sous-pixel, calcul hors appli/.test(e.impossible ?? '')], [null, true]);
      v.egal('jamais conseillé', calculs.processeurConseille([e]), null);
      v.egal('fiche : 20 ports 1G, 8192 × 7680, 2 × HDMI 2.0', [sp60.ports, sp60.largeurMaxPx, sp60.hauteurMaxPx, sp60.entreesTypes], [20, 8192, 7680, ['hdmi-2.0']]);
    },
  },
  {
    id: 'R126',
    titre: 'MX2000 Pro et MX6000 Pro : cartes de sortie selon la carte des dalles (4x10G et CVT10, ou 1 × 40G et CVT8-5G), plafond de pixels, fibre jusqu\'aux convertisseurs',
    etape: 'coex',
    verifier(v, contexte) {
      const mx6000 = processeurDeBase(contexte, 'coex-mx6000-pro');
      const mx2000 = processeurDeBase(contexte, 'coex-mx2000-pro');
      const m = calculs.mur(DALLE_CAS_7, 42, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx6000, NOVASTAR_60_8);
      v.egal('carte inconnue : 4x10G, 42 ports 1G, 5 CVT10 sur 2 cartes', [e.nombre, e.totaux.ports.colonnes, e.totaux.distributeurs.colonnes, e.totaux.cartesSortie], [1, 42, 5, 2]);
      v.egal('affichage de la configuration', e.configuration, 'MX6000 Pro + 2 cartes 4x10G + 5 CVT10');
      v.vrai('alerte : carte de réception inconnue, 4x10G par défaut', e.alertes.some((a) => a.includes('Carte de réception inconnue') && a.includes('4x10G')));
      v.egal('MX6000 Pro : 8 emplacements, 320 ports 1G au plus ; CVT10 obligatoires', [e.controles.ports.limite, e.distributeurObligatoire], [320, true]);
      const e5 = calculs.evaluerProcesseur(m, DALLE_CARTE_CA50E, mx6000, NOVASTAR_60_8);
      v.egal('carte CA50E (5G) : 1 × 40G, 2 951 200 px par port, 6 ports 5G, 1 CVT8-5G', [calculs.entierInferieur(e5.capacite), e5.totaux.ports.colonnes, e5.configuration],
        [2951200, 6, 'MX6000 Pro + 1 carte 1 × 40G + 1 CVT8-5G']);
      v.egal('5G : 64 ports au plus (8 cartes × 8)', e5.controles.ports.limite, 64);
      const force = calculs.evaluerProcesseur(m, DALLE_CARTE_CA50E, mx6000, { ...NOVASTAR_60_8, carteSortie: '4x10g' });
      v.egal('choix à la main : 4x10G même avec des cartes 5G', force.configuration, 'MX6000 Pro + 2 cartes 4x10G + 5 CVT10');
      const e2 = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx2000, NOVASTAR_60_8);
      v.egal('MX2000 Pro : 2 emplacements, 80 ports 1G au plus', [e2.controles.ports.limite, e2.configuration], [80, 'MX2000 Pro + 2 cartes 4x10G + 5 CVT10']);
      v.vrai('MX2000 Pro : carte 1 × 40G citée par le wiki COEX, absente de sa fiche', /absente de sa fiche/.test(mx2000.sources.carteSortie5G.source.titre));
      const petit = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 42, 10), DALLE_CAS_7, { ...mx2000, pixelsMax: 10000000 }, NOVASTAR_60_8);
      v.egal('plafond aux pixels maxi du processeur', petit.nombre, 2);
      const t = calculs.cablageData(m, DALLE_CAS_7, e, { depart: 'bas-gauche', distanceRegieM: 50 }).variantes.find((x) => x.mode === 'colonnes');
      v.proche('fibre jusqu\'au CVT10 : 50 m × 1,10', t.processeurs[0].ports[0].fibreM, 55, 1e-9);
      v.egal('ports nommés par convertisseur', t.processeurs[0].ports[10].libelle, 'CVT10 2, port 1');
    },
  },
  {
    id: 'R127',
    titre: 'MX6000 Pro : formats des cartes d\'entrée de sa fiche contrôlés (HDMI 2.0, DP 1.2, HDMI 2.1, DP 1.4, ST 2110) ; MX2000 Pro, mêmes cartes 4K et 8K par analogie (déduit)',
    etape: 'coex',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      v.egal('liaisons 8K et ST 2110 connues de l\'appli', ['hdmi-2.1', 'dp-1.4', 'st2110-25g', 'st2110-100g'].every((id) => liaisons.some((l) => l.id === id)), true);
      const mx6000 = processeurDeBase(contexte, 'coex-mx6000-pro');
      const entree = (proc, l, h, f, liaison) => calculs.controleEntree(proc, { largeurPx: l, hauteurPx: h, frequenceHz: f, liaison }, liaisons);
      v.egal('HDMI 2.0 : 8192 × 1080 et 1080 × 8192 à 60 Hz passent, 8704 px de large non',
        [entree(mx6000, 8192, 1080, 60, 'hdmi-2.0').ok, entree(mx6000, 1080, 8192, 60, 'hdmi-2.0').ok, entree(mx6000, 8704, 1016, 60, 'hdmi-2.0').ok], [true, true, false]);
      v.egal('DP 1.2 : pareil', [entree(mx6000, 8192, 1080, 60, 'dp-1.2').ok, entree(mx6000, 8704, 1016, 60, 'dp-1.2').ok], [true, false]);
      v.egal('HDMI 2.1 : 8192 × 4320 à 30 Hz, pas à 60 Hz', [entree(mx6000, 8192, 4320, 30, 'hdmi-2.1').ok, entree(mx6000, 8192, 4320, 60, 'hdmi-2.1').ok], [true, false]);
      const dp60 = entree(mx6000, 7680, 4320, 60, 'dp-1.4');
      v.egal('DP 1.4 : 7680 × 4320 à 30 Hz ; à 60 Hz avec la carte DP 1.4 8K à 60 Hz, signalée',
        [entree(mx6000, 7680, 4320, 30, 'dp-1.4').ok, dp60.ok, dp60.alertes.some((a) => a.includes('carte DP 1.4 8K à 60 Hz'))], [true, true, true]);
      v.egal('DP 1.4 : 7680 px de large au plus', entree(mx6000, 8192, 4320, 30, 'dp-1.4').ok, false);
      v.egal('ST 2110 25G : 4096 × 2160 ou 8192 × 1080 à 60 Hz, pas 8192 × 2160',
        [entree(mx6000, 4096, 2160, 60, 'st2110-25g').ok, entree(mx6000, 8192, 1080, 60, 'st2110-25g').ok, entree(mx6000, 8192, 2160, 60, 'st2110-25g').ok], [true, true, false]);
      v.egal('ST 2110 100G : 8192 × 4320 à 60 Hz en une source', entree(mx6000, 8192, 4320, 60, 'st2110-100g').ok, true);
      const mx2000 = processeurDeBase(contexte, 'coex-mx2000-pro');
      v.egal('MX2000 Pro : formats 4K et 8K par analogie, « déduit »', [entree(mx2000, 8192, 4320, 30, 'hdmi-2.1').ok, mx2000.sources.entreesFormats.source.confiance], [true, 'déduit']);
      v.egal('MX2000 Pro : pas de ST 2110', entree(mx2000, 4096, 2160, 60, 'st2110-25g').ok, false);
    },
  },
  {
    id: 'R128',
    titre: 'MX6000 Pro : 16 384 px de large ou de haut par carte de sortie et 141 M px ; au-delà de 8192 px, un seul processeur mais plusieurs sources (8192 px maxi par entrée)',
    etape: 'coex',
    verifier(v, contexte) {
      const mx6000 = processeurDeBase(contexte, 'coex-mx6000-pro');
      const m = calculs.mur(DALLE_CAS_7, 60, 10);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, mx6000, NOVASTAR_60_8);
      v.egal('mur de 11 520 × 1920 px : un seul MX6000 Pro', e.nombre, 1);
      v.vrai('alerte : plusieurs sources nécessaires, 8192 px maxi par entrée', e.alertes.some((a) => a.includes('plusieurs sources nécessaires') && a.includes('8192')));
      v.egal('au-delà de 16 384 px de large : deux MX6000 Pro', calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 86, 2), DALLE_CAS_7, mx6000, NOVASTAR_60_8).nombre, 2);
      v.vrai('sous 8192 px : pas d\'alerte de sources', !calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 42, 10), DALLE_CAS_7, mx6000, NOVASTAR_60_8).alertes.some((a) => a.includes('plusieurs sources')));
      v.egal('MX2000 Pro : 8192 px pour le mur, deux processeurs à 11 520 px', calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-mx2000-pro'), NOVASTAR_60_8).nombre, 2);
    },
  },
  {
    id: 'R129',
    titre: 'Carte de réception connue : dimensions de la dalle face à la capacité d\'une carte à la profondeur choisie ; IC inconnu, IC classiques ; « non précisé » signalé ; alerte, jamais de refus',
    etape: 'coex',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const cartes = bp.cartesReception.map((c) => calculs.resoudreFiche(c, bp.sources));
      const dalle = (modele, pxH, pxV, extra = {}) => ({ ...DALLE_CAS_7, id: 'fictive-carte', nom: `Dalle ${pxH} × ${pxV} px`, pxH, pxV, carteReceptionMarque: 'Novastar', carteReceptionModele: modele, ...extra });
      const c = (d, bits) => calculs.controleCarteReception(d, cartes, bits);
      const a5s = c(dalle('A5s Plus', 400, 300), 8);
      v.egal('A5s Plus, 8 bits, IC inconnu : 384 × 384 (IC classiques) ; 400 px de large, dépassé', [a5s.capacite.largeurPx, a5s.capacite.hauteurPx, a5s.ok], [384, 384, false]);
      v.vrai('note : IC classiques retenus, 512 × 384 avec IC PWM', /IC classiques/.test(a5s.alerte) && /512 × 384/.test(a5s.alerte));
      v.egal('A5s Plus avec IC PWM connus : 512 × 384, passe', c(dalle('A5s Plus', 400, 300, { typeIC: 'PWM' }), 8).ok, true);
      v.egal('A5s Plus, 10 bits : 192 × 384 (IC classiques), 200 px de large dépassé', c(dalle('A5s Plus', 200, 300), 10).ok, false);
      const a7s = c(dalle('A7s Plus', 256, 256), 10);
      v.egal('A7s Plus, 10 bits : non précisé, signalé, pas de contrôle', [a7s.ok, /non précisée/.test(a7s.alerte)], [null, true]);
      v.egal('A10s Pro, 12 bits : 512 × 256, une dalle de 256 × 512 dépasse', c(dalle('A10s Pro', 256, 512), 12).ok, false);
      v.egal('CA50E, 12 bits : 512 × 480, dalle de 500 × 500 dépassée ; 8 bits : 768 × 512, passe', [c(dalle('CA50E', 500, 500), 12).ok, c(dalle('CA50E', 500, 500), 8).ok], [false, true]);
      v.egal('XA50 Pro, 12 bits : 620 × 512, dalle de 600 × 500 passe', c(dalle('XA50 Pro', 600, 500), 12).ok, true);
      const plusN = c(dalle('A10s Plus N', 520, 100), 8);
      v.egal('A10s Plus-N (nom écrit sans tiret), 8 bits : 512 × 512 IC PWM seulement, 520 px de large dépassé', [plusN.carte.modele, plusN.ok], ['A10s Plus-N', false]);
      v.egal('carte absente de la base (A10s) : pas de contrôle', c(dalle('A10s', 176, 176), 8), null);
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 12, 6), dalle('A5s Plus', 400, 300), processeurDeBase(contexte, 'coex-mx40-pro'), { ...NOVASTAR_60_8, cartesReception: cartes });
      v.egal('Data : alerte de carte, sans refus', [e.nombre !== null, e.alertes.some((x) => x.includes('A5s Plus') && x.includes('384 × 384'))], [true, true]);
      v.egal('Data : contrôle de carte gardé dans le résultat', e.carteReception?.[0]?.carte.modele, 'A5s Plus');
    },
  },
  {
    id: 'R130',
    titre: 'Fiches « information » (LEDECA LDSOSP04.8ST, angles Graphite, gammes ROE non relevées) : grisées dans la liste des dalles, jamais choisies ; complétées par l\'utilisateur, elles deviennent des dalles',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = contexte.dalles;
      const infos = base.informations.map((f) => calculs.resoudreFiche(f, base.sources));
      const options = fiches.optionsInformations(infos);
      v.egal('une option par fiche, grisée, marquée « information, à compléter »',
        [options.length, options.every((o) => o.disabled && o.libelle.includes('(information, à compléter)'))], [13, true]);
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      const brute = base.informations.find((f) => f.id === 'ledeca-ldsosp04-8st');
      const complete = { ...brute, largeurMm: { valeur: 500, source: 'test' }, hauteurMm: { valeur: 1000, source: 'test' }, pxH: { valeur: 104, source: 'test' }, pxV: { valeur: 208, source: 'test' } };
      const maBase = { ...fiches.baseVide(), fiches: [{ type: 'dalle', fiche: complete }], sources: { test: { titre: 'Test', court: 'Test', date: null, confiance: 'constructeur' } } };
      const f = fiches.fusionner(depart, maBase);
      v.egal('complétée : passe dans les dalles (version modifiée) et quitte les fiches d\'information',
        [f.dalles.dalles.find((d) => d.id === 'ledeca-ldsosp04-8st')?.statutBase, f.dalles.informations.some((d) => d.id === 'ledeca-ldsosp04-8st')], ['modifiee', false]);
    },
  },
  {
    id: 'R131',
    titre: 'Lots de fabrication par dalle et par parc : identifiant ou date, quantité, notes',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.creerParc(fiches.baseVide(), 'Loueur A'), 'Loueur B');
      const [a, b] = base.parcs.map((p) => p.id);
      base = fiches.ajouterLot(base, a, 'roe-bp2-v2', { identifiant: 'Lot 2023-05', quantite: '120', notes: 'Stock Paris' });
      const lots = fiches.lotsDalleParc(base, a, 'roe-bp2-v2');
      v.egal('lot ajouté, quantité en nombre entier', [lots.length, lots[0].identifiant, lots[0].quantite, lots[0].notes], [1, 'Lot 2023-05', 120, 'Stock Paris']);
      v.vrai('chaque lot a son identifiant interne', typeof lots[0].id === 'string' && lots[0].id.length > 0);
      v.egal('quantité vide : non saisie', fiches.lotsDalleParc(fiches.ajouterLot(base, a, 'roe-bp2-v2', { identifiant: 'Lot B', quantite: '' }), a, 'roe-bp2-v2')[1].quantite, null);
      v.vrai('identifiant ou date obligatoire', /identifiant ou la date/.test(messageErreur(() => fiches.ajouterLot(base, a, 'roe-bp2-v2', { identifiant: ' ' }))));
      v.vrai('quantité entière et positive', /quantité/.test(messageErreur(() => fiches.ajouterLot(base, a, 'roe-bp2-v2', { identifiant: 'X', quantite: '-3' })))
        && /quantité/.test(messageErreur(() => fiches.ajouterLot(base, a, 'roe-bp2-v2', { identifiant: 'X', quantite: '2.5' }))));
      const modifie = fiches.modifierLot(base, a, 'roe-bp2-v2', lots[0].id, { quantite: '80', notes: 'Après casse' });
      v.egal('lot modifié', [fiches.lotsDalleParc(modifie, a, 'roe-bp2-v2')[0].quantite, fiches.lotsDalleParc(modifie, a, 'roe-bp2-v2')[0].notes], [80, 'Après casse']);
      v.egal('lots séparés par dalle et par parc', [fiches.lotsDalleParc(base, a, 'roe-cb5-mkii').length, fiches.lotsDalleParc(base, b, 'roe-bp2-v2').length], [0, 0]);
      v.egal('lot supprimé', fiches.lotsDalleParc(fiches.supprimerLot(base, a, 'roe-bp2-v2', lots[0].id), a, 'roe-bp2-v2').length, 0);
    },
  },
  {
    id: 'R132',
    titre: 'Config d\'un lot, une par logiciel : NovaLCT (.rcfgx, multi-batch éventuel), VMP (.ncp), LEDVISION (.rcvbp), Tessera (type de fixture, firmware de la dalle, fixture pack .tfp, calibration factory ou mémoire 1 à 3) ; firmware standard ou personnalisé',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: 'Lot A' });
      const lot = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      const regler = (config) => fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, config);
      base = regler({ logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx', version: '3', date: '2024-03-01', provenance: 'ROE', firmware: 'personnalisé', multiBatch: 'BP2_lotA.mbd' });
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'VMP', nomFichier: 'BP2V2.ncp', version: '1', provenance: 'Novastar', firmware: 'standard' });
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'Tessera', typeFixture: 'ROE BP2V2', firmwareDalle: '3.2.1', fixturePack: 'ROE_BP2V2.tfp', calibration: 'mémoire 2', firmware: 'standard' });
      const config = (logiciel) => fiches.configLot(base, parc, 'roe-bp2-v2', lot, logiciel);
      v.egal('NovaLCT', [config('NovaLCT').nomFichier, config('NovaLCT').multiBatch, config('NovaLCT').firmware], ['BP2V2_A.rcfgx', 'BP2_lotA.mbd', 'personnalisé']);
      v.egal('VMP', [config('VMP').nomFichier, config('VMP').provenance], ['BP2V2.ncp', 'Novastar']);
      v.egal('Tessera', [config('Tessera').typeFixture, config('Tessera').firmwareDalle, config('Tessera').fixturePack, config('Tessera').calibration], ['ROE BP2V2', '3.2.1', 'ROE_BP2V2.tfp', 'mémoire 2']);
      v.egal('une config par logiciel : la nouvelle remplace l\'ancienne', fiches.configLot(fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'VMP', nomFichier: 'BP2V2_v2.ncp' }), parc, 'roe-bp2-v2', lot, 'VMP').nomFichier, 'BP2V2_v2.ncp');
      v.vrai('extension du fichier selon le logiciel', /\.rcfgx/.test(messageErreur(() => regler({ logiciel: 'NovaLCT', nomFichier: 'BP2V2.ncp' })))
        && /\.rcvbp/.test(messageErreur(() => regler({ logiciel: 'LEDVISION', nomFichier: 'x.rcfgx' })))
        && /\.tfp/.test(messageErreur(() => regler({ logiciel: 'Tessera', fixturePack: 'x.zip' }))));
      v.vrai('calibration Brompton : factory ou mémoire 1 à 3', /factory ou mémoire 1 à 3/.test(messageErreur(() => regler({ logiciel: 'Tessera', calibration: 'mémoire 4' }))));
      v.vrai('firmware : standard ou personnalisé', /standard ou personnalisé/.test(messageErreur(() => regler({ logiciel: 'VMP', firmware: 'autre' }))));
      v.vrai('logiciel connu', /NovaLCT, VMP, LEDVISION ou Tessera/.test(messageErreur(() => regler({ logiciel: 'Autre' }))));
      v.egal('config supprimée', fiches.configLot(fiches.supprimerConfigLot(base, parc, 'roe-bp2-v2', lot, 'VMP'), parc, 'roe-bp2-v2', lot, 'VMP'), null);
    },
  },
  {
    id: 'R133',
    titre: 'Fichier de config déjà réglé dans un parc : repris en premier lot « sans identifiant », sans rien perdre',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.reglerDalleParc(base, parc, 'roe-bp2-v2', { fichierConfig: 'BP2V2_Helios_v3' });
      const migree = fiches.migrerFichiersConfig(base);
      const lots = fiches.lotsDalleParc(migree, parc, 'roe-bp2-v2');
      v.egal('un lot « sans identifiant » avec le fichier', [lots.length, lots[0].identifiant, lots[0].quantite, lots[0].configs[0].nomFichier, lots[0].configs[0].logiciel],
        [1, 'sans identifiant', null, 'BP2V2_Helios_v3', null]);
      v.egal('le réglage du parc reste', fiches.reglageDalleParc(migree, parc, 'roe-bp2-v2').fichierConfig, 'BP2V2_Helios_v3');
      v.egal('reprise faite une seule fois', fiches.lotsDalleParc(fiches.migrerFichiersConfig(migree), parc, 'roe-bp2-v2').length, 1);
      const avecLot = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: 'Lot A' });
      v.egal('dalle qui a déjà des lots : rien ajouté', fiches.lotsDalleParc(fiches.migrerFichiersConfig(avecLot), parc, 'roe-bp2-v2').map((l) => l.identifiant), ['Lot A']);
    },
  },
  {
    id: 'R134',
    titre: 'Processeurs du parc : logiciel ou firmware (Tessera, NovaLCT, VMP, LEDVISION), version et date du relevé',
    etape: 'configs',
    verifier(v, contexte) {
      v.egal('logiciel selon le processeur', ['brompton-s8', 'novastar-mctrl660', 'coex-mx40-pro', 'colorlight-s6f'].map((id) => fiches.logicielDuProcesseur(processeurDeBase(contexte, id))),
        ['Tessera', 'NovaLCT', 'VMP', 'LEDVISION']);
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      base = fiches.reglerLogicielParc(base, parc, s8, { version: '4.1.2', dateReleve: '2026-09-20' });
      v.egal('version et date gardées', fiches.logicielParc(base, parc, 'brompton-s8'), { logiciel: 'Tessera', version: '4.1.2', dateReleve: '2026-09-20' });
      v.egal('version vidée : relevé retiré', fiches.logicielParc(fiches.reglerLogicielParc(base, parc, s8, { version: '' }), parc, 'brompton-s8'), null);
      v.egal('« Tous » : rien', fiches.logicielParc(base, null, 'brompton-s8'), null);
    },
  },
  {
    id: 'R135',
    titre: 'Fichiers joints : nom, taille et date gardés dans la base (le contenu reste sur l\'appareil), total occupé, alerte au-delà de 20 Mo',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: 'Lot A' });
      const lot = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx' });
      base = fiches.joindreFichier(base, parc, 'roe-bp2-v2', lot, 'NovaLCT', 'fichier', { id: 'f1', nom: 'BP2V2_A.rcfgx', taille: 48213, date: '2026-09-25' });
      base = fiches.joindreFichier(base, parc, 'roe-bp2-v2', lot, 'NovaLCT', 'multiBatch', { id: 'f2', nom: 'BP2_lotA.mbd', taille: 1000, date: '2026-09-25' });
      v.egal('fichier joint décrit dans la config', fiches.configLot(base, parc, 'roe-bp2-v2', lot, 'NovaLCT').fichier, { id: 'f1', nom: 'BP2V2_A.rcfgx', taille: 48213, date: '2026-09-25' });
      v.egal('total occupé et liste des fichiers', [fiches.tailleFichiersJoints(base), fiches.fichiersJoints(base).map((f) => f.id)], [49213, ['f1', 'f2']]);
      v.vrai('pas de contenu dans la base : seulement nom, taille, date', !JSON.stringify(base).includes('contenu'));
      v.vrai('au-delà de 20 Mo : alerte', /20 Mo/.test(fiches.alerteTailleFichier(21 * 1024 * 1024) ?? '') && fiches.alerteTailleFichier(19 * 1024 * 1024) === null);
      const detache = fiches.detacherFichier(base, parc, 'roe-bp2-v2', lot, 'NovaLCT', 'fichier');
      v.egal('fichier détaché : le nom reste, plus de fichier joint', [fiches.configLot(detache, parc, 'roe-bp2-v2', lot, 'NovaLCT').nomFichier, fiches.configLot(detache, parc, 'roe-bp2-v2', lot, 'NovaLCT').fichier, fiches.tailleFichiersJoints(detache)],
        ['BP2V2_A.rcfgx', undefined, 1000]);
    },
  },
  {
    id: 'R136',
    titre: 'Export de la base : fichiers joints en option, décochée par défaut, avec leur taille ; l\'import les restitue',
    etape: 'configs',
    verifier(v, contexte) {
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: 'Lot A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx' });
      base = fiches.joindreFichier(base, parc, 'roe-bp2-v2', lot, 'NovaLCT', 'fichier', { id: 'f1', nom: 'BP2V2_A.rcfgx', taille: 4, date: '2026-09-25' });
      const sans = fiches.exporter(base, depart);
      v.egal('par défaut : lots et config exportés, pas les fichiers ; leur taille est donnée', [Boolean(sans.fichiersJoints), sans.tailleFichiersJoints, sans.parcs[0].lots['roe-bp2-v2'][0].identifiant], [false, 4, 'Lot A']);
      const octets = new Uint8Array([0, 255, 42, 7]);
      const avec = fiches.exporter(base, depart, { fichiers: [{ id: 'f1', nom: 'BP2V2_A.rcfgx', type: 'application/octet-stream', contenu: octets.buffer }] });
      v.egal('avec l\'option : les fichiers joints dans le JSON', avec.fichiersJoints.map((f) => [f.id, f.nom, f.taille]), [['f1', 'BP2V2_A.rcfgx', 4]]);
      const lu = fiches.importer(fiches.baseVide(), JSON.stringify(avec), depart);
      v.egal('import : fichiers restitués à l\'octet près', [lu.fichiers.length, [...new Uint8Array(lu.fichiers[0].contenu)]], [1, [0, 255, 42, 7]]);
      v.egal('import : lots et config retrouvés', fiches.configLot(lu.base, parc, 'roe-bp2-v2', lot, 'NovaLCT').fichier.id, 'f1');
      v.egal('import sans fichiers : rien à écrire', fiches.importer(fiches.baseVide(), JSON.stringify(sans), depart).fichiers, []);
    },
  },
  {
    id: 'R137',
    titre: 'Fichiers de config : NovaLCT .rcfgx ou .rcfg, LEDVISION .rcvbp ou .rcvp, VMP .ncp, fixture pack Tessera .tfp ; « autre fichier » de n\'importe quelle extension ; extension vérifiée dans l\'appli',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur A');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: 'Lot A' });
      const lot = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      const regler = (config) => fiches.configLot(fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, config), parc, 'roe-bp2-v2', lot, config.logiciel);
      v.egal('ancien format NovaLCT .rcfg et Colorlight .rcvp acceptés, majuscules comprises',
        [regler({ logiciel: 'NovaLCT', nomFichier: 'BP2_ancien.rcfg' }).nomFichier, regler({ logiciel: 'LEDVISION', nomFichier: 'BP2.RCVP' }).nomFichier, regler({ logiciel: 'NovaLCT', nomFichier: 'BP2.RCFGX' }).nomFichier],
        ['BP2_ancien.rcfg', 'BP2.RCVP', 'BP2.RCFGX']);
      v.vrai('message de refus : les deux extensions', /\.rcfgx ou \.rcfg/.test(messageErreur(() => regler({ logiciel: 'NovaLCT', nomFichier: 'x.ncp' })))
        && /\.rcvbp ou \.rcvp/.test(messageErreur(() => regler({ logiciel: 'LEDVISION', nomFichier: 'x.rcfgx' }))));
      v.egal('« autre fichier » : n\'importe quelle extension', regler({ logiciel: 'NovaLCT', autreFichier: 'ecran.scr' }).autreFichier, 'ecran.scr');
      const accepte = (logiciel, role, nom) => messageErreur(() => fiches.verifierFichierJoint(logiciel, role, nom)) === '';
      v.egal('fichier joint : extension vérifiée selon le logiciel et le rôle',
        [accepte('NovaLCT', 'fichier', 'BP2.rcfgx'), accepte('NovaLCT', 'fichier', 'BP2.rcfg'), accepte('NovaLCT', 'fichier', 'ecran.scr'), accepte('VMP', 'fichier', 'BP2.ncp'),
          accepte('LEDVISION', 'fichier', 'BP2.rcvp'), accepte('Tessera', 'fixturePack', 'ROE.tfp'), accepte('Tessera', 'fixturePack', 'ROE.zip'),
          accepte('NovaLCT', 'multiBatch', 'lotA.bin'), accepte('NovaLCT', 'autre', 'ecran.scr'), accepte('Tessera', 'autre', 'projet.tessera')],
        [true, true, false, true, true, true, false, true, true, true]);
      v.vrai('refus avec la raison de l\'appli', /\.rcfgx ou \.rcfg/.test(messageErreur(() => fiches.verifierFichierJoint('NovaLCT', 'fichier', 'ecran.scr'))));
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'NovaLCT', nomFichier: 'BP2.rcfgx' });
      base = fiches.joindreFichier(base, parc, 'roe-bp2-v2', lot, 'NovaLCT', 'autre', { id: 'f9', nom: 'ecran.scr', taille: 10, date: '2026-09-25' });
      v.egal('autre fichier joint, compté dans les fichiers de l\'appareil', [fiches.configLot(base, parc, 'roe-bp2-v2', lot, 'NovaLCT').fichierAutre.nom, fiches.fichiersJoints(base).map((f) => f.role)], ['ecran.scr', ['autre']]);
    },
  },
  {
    id: 'R138',
    titre: 'Partager un fichier de config : feuille de partage si l\'appareil sait partager ce fichier, sinon téléchargement vers Fichiers, avec « depuis Fichiers, AirDrop vers le PC de régie »',
    etape: 'configs',
    verifier(v) {
      const fichiers = [{ name: 'BP2V2_A.rcfgx', type: 'application/octet-stream' }];
      const partage = { share: () => Promise.resolve(), canShare: () => true };
      v.egal('partage possible : feuille de partage, pas de note', choixPartageFichier(partage, fichiers), { mode: 'partage', note: null });
      const secours = choixPartageFichier({}, fichiers);
      v.egal('navigateur sans partage : téléchargement vers Fichiers', secours.mode, 'telechargement');
      v.vrai('avec la note pour la régie', /depuis Fichiers, AirDrop vers le PC de régie/.test(secours.note ?? ''));
      v.egal('canShare refuse ce type de fichier (.ncp) : téléchargement', choixPartageFichier({ ...partage, canShare: () => false }, [{ name: 'BP2.ncp', type: '' }]).mode, 'telechargement');
      v.egal('canShare en erreur : téléchargement', choixPartageFichier({ ...partage, canShare: () => { throw new Error('non'); } }, fichiers).mode, 'telechargement');
    },
  },
  {
    id: 'R139',
    titre: 'Lots du mur cochés par défaut : le premier lot qui suffit, sinon le moins de lots (puis le moins de dalles en trop) ; un seul lot, même sans quantité, coché d\'office ; plusieurs lots sans quantité : « à préciser »',
    etape: 'configs',
    verifier(v) {
      const lot = (id, quantite) => ({ id, identifiant: id, quantite, configs: [] });
      const retenus = (lots, n, coches) => fiches.lotsDuMur(lots, n, coches).retenus.map((l) => l.id);
      const AB = [lot('A', 60), lot('B', 40)];
      v.egal('A 60, B 40, mur de 50 : A seul, sans alerte', [retenus(AB, 50), fiches.lotsDuMur(AB, 50).alertes], [['A'], []]);
      const r80 = fiches.lotsDuMur(AB, 80);
      v.egal('mur de 80 : A et B', [r80.retenus.map((l) => l.id), r80.melanges], [['A', 'B'], true]);
      v.vrai('lots mélangés signalés', r80.alertes.some((a) => a.startsWith('Lots mélangés (A, B), écarts de couleur possibles')));
      const r120 = fiches.lotsDuMur(AB, 120);
      v.egal('mur de 120 : A et B, lots trop petits', [r120.retenus.map((l) => l.id), r120.alertes.includes('Lots trop petits : 100 dalles dans les lots pour 120 dans le mur.')], [['A', 'B'], true]);
      const sansQuantite = fiches.lotsDuMur([lot('A', null), lot('B', null)], 50);
      v.egal('plusieurs lots sans quantité : rien par défaut, « à préciser »', [sansQuantite.retenus, sansQuantite.aPreciser, sansQuantite.alertes.some((a) => a.startsWith('Lots utilisés : à préciser'))], [[], true, true]);
      const seul = fiches.lotsDuMur([lot('A', null)], 50);
      v.egal('un seul lot sans quantité : coché d\'office, sans alerte', [seul.retenus.map((l) => l.id), seul.aPreciser, seul.alertes], [['A'], false, []]);
      v.egal('A sans quantité, B 30, mur de 20 : B', retenus([lot('A', null), lot('B', 30)], 20), ['B']);
      v.egal('A sans quantité, B 30, mur de 50 : B ne suffit pas, A complète (un seul lot sans quantité)', retenus([lot('A', null), lot('B', 30)], 50), ['A', 'B']);
      v.egal('B 30, C 70, D 40, mur de 100 : C et B (juste 100), pas C et D', retenus([lot('B', 30), lot('C', 70), lot('D', 40)], 100), ['B', 'C']);
      v.egal('A et B sans quantité, C 100, mur de 50 : C suffit', retenus([lot('A', null), lot('B', null), lot('C', 100)], 50), ['C']);
      const main = fiches.lotsDuMur(AB, 80, ['A']);
      v.egal('coché à la main : A seul pour un mur de 80, lots trop petits', [main.retenus.map((l) => l.id), main.parDefaut, main.alertes], [['A'], false, ['Lots trop petits : 60 dalles dans les lots pour 80 dans le mur.']]);
      const aucun = fiches.lotsDuMur(AB, 80, []);
      v.egal('tout décoché à la main : aucun lot, signalé', [aucun.retenus, aucun.alertes.some((a) => a.startsWith('Aucun lot coché'))], [[], true]);
      v.egal('pas de lot : rien', [fiches.lotsDuMur([], 50).retenus, fiches.lotsDuMur([], 50).alertes], [[], []]);
    },
  },
  {
    id: 'R140',
    titre: 'Mur et Data : « Config NovaLCT : fichier, lot », config absente pour le logiciel, lots mélangés selon le logiciel, parc sans lots, « Tous », version du logiciel relevée dans le parc',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Essai');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: '2024-03 A', quantite: '60' });
      const lotA = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotA, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx' });
      const nova = fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50, { logiciel: 'NovaLCT' });
      v.egal('NovaLCT : lot et fichier', [nova.lignes, nova.alertes], [['Lots utilisés : 2024-03 A', 'Config NovaLCT : BP2V2_A.rcfgx, lot 2024-03 A'], []]);
      v.egal('processeur Brompton, pas de config Tessera', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50, { logiciel: 'Tessera' }).alertes,
        ['Aucune config Tessera pour cette dalle (lot 2024-03 A).']);
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotA, { logiciel: 'Tessera', typeFixture: 'ROE BP2V2', firmwareDalle: '3.2.1', fixturePack: 'ROE_BP2V2.tfp', calibration: 'mémoire 2' });
      v.egal('Tessera : fixture, firmware de la dalle, fixture pack, calibration', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50, { logiciel: 'Tessera' }).lignes[1],
        'Config Tessera : fixture ROE BP2V2, firmware de la dalle 3.2.1, fixture pack ROE_BP2V2.tfp, calibration mémoire 2, lot 2024-03 A');
      v.egal('Mur (sans logiciel) : toutes les configs du lot', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50).lignes.length, 3);
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: '2024-05 B', quantite: '40' });
      const lotB = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[1].id;
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotB, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_B.rcfgx' });
      const deux = fiches.configsDuMur(base, parc, 'roe-bp2-v2', 80, { logiciel: 'NovaLCT' });
      v.egal('deux lots : les deux fichiers', deux.lignes, ['Lots utilisés : 2024-03 A, 2024-05 B', 'Config NovaLCT : BP2V2_A.rcfgx, lot 2024-03 A', 'Config NovaLCT : BP2V2_B.rcfgx, lot 2024-05 B']);
      v.egal('lots mélangés, partie NovaLCT', deux.alertes, ['Lots mélangés (2024-03 A, 2024-05 B), écarts de couleur possibles : multi-batch adjustment (NovaLCT).']);
      v.egal('lots mélangés, partie Brompton', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 80, { logiciel: 'Tessera' }).alertes[0],
        'Lots mélangés (2024-03 A, 2024-05 B), écarts de couleur possibles : même mémoire de calibration sur toutes les dalles (Brompton).');
      v.egal('lots mélangés, Mur : les deux', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 80).alertes[0],
        'Lots mélangés (2024-03 A, 2024-05 B), écarts de couleur possibles : multi-batch adjustment (NovaLCT) ou même mémoire de calibration (Brompton).');
      v.egal('lots cochés à la main', fiches.configsDuMur(base, parc, 'roe-bp2-v2', 80, { logiciel: 'NovaLCT', coches: [lotB] }).lignes[1], 'Config NovaLCT : BP2V2_B.rcfgx, lot 2024-05 B');
      v.egal('parc sans lots pour cette dalle', fiches.configsDuMur(base, parc, 'roe-cb5-mkii', 50, { logiciel: 'NovaLCT' }).alertes,
        ['Aucun fichier de config pour cette dalle dans le parc Essai : ajoute-le dans l\'onglet Base.']);
      const tous = fiches.configsDuMur(base, null, 'roe-bp2-v2', 50, { logiciel: 'NovaLCT' });
      v.egal('« Tous » : choisir un parc', [tous.lignes, tous.alertes, tous.note], [[], [], 'Choisis un parc pour voir ses lots et ses configs.']);
      const proc = { id: 'novastar-mctrl4k', famille: 'novastar', logiciel: 'NovaLCT', nom: 'Novastar MCTRL4K' };
      v.egal('version non relevée', fiches.texteLogicielParc(base, parc, proc), 'Version de NovaLCT non relevée pour ce processeur dans le parc Essai.');
      const releve = fiches.reglerLogicielParc(base, parc, proc, { version: 'V5.8.1', dateReleve: '2026-09-25' });
      v.egal('version relevée', fiches.texteLogicielParc(releve, parc, proc), 'NovaLCT V5.8.1 dans le parc Essai, relevé le 25/09/2026.');
      v.egal('« Tous » : pas de version', fiches.texteLogicielParc(releve, null, proc), null);
    },
  },
  {
    id: 'R141',
    titre: 'Rappels sourcés des configs selon le logiciel du processeur : NovaLCT, VMP (COEX), Tessera ; multi-batch ou calibration si lots mélangés ; firmware personnalisé ; CVT8-5G ; aucun pour Colorlight',
    etape: 'configs',
    verifier(v) {
      const ids = (options) => rappels.rappelsConfig(options).map((r) => r.id);
      v.egal('NovaLCT', ids({ logiciel: 'NovaLCT' }), ['N1', 'N2', 'N3', 'N4', 'N5']);
      v.egal('NovaLCT, firmware personnalisé et lots mélangés', ids({ logiciel: 'NovaLCT', firmwarePersonnalise: true, lotsMelanges: true }), ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7']);
      v.egal('COEX (VMP)', ids({ logiciel: 'VMP' }), ['C1', 'C2', 'C3', 'C4']);
      v.egal('COEX avec CVT8-5G', ids({ logiciel: 'VMP', cvt8: true }), ['C1', 'C2', 'C3', 'C4', 'V1']);
      v.egal('Brompton', ids({ logiciel: 'Tessera' }), ['B1', 'B2', 'B3']);
      v.egal('Brompton, lots mélangés : calibration', ids({ logiciel: 'Tessera', lotsMelanges: true }), ['B1', 'B2', 'B3', 'B4']);
      v.egal('Colorlight : aucune source, aucun rappel', ids({ logiciel: 'LEDVISION', lotsMelanges: true }), []);
      const tous = rappels.rappelsConfig({ logiciel: 'NovaLCT', firmwarePersonnalise: true, lotsMelanges: true })
        .concat(rappels.rappelsConfig({ logiciel: 'VMP', cvt8: true }), rappels.rappelsConfig({ logiciel: 'Tessera', lotsMelanges: true }));
      v.vrai('chaque rappel : un texte et sa source', tous.every((r) => r.textes.length > 0 && r.textes.every((t) => t.texte && t.source?.titre && t.source?.confiance)));
      const r = Object.fromEntries(tous.map((x) => [x.id, x]));
      const citations = (id) => r[id].textes.map((t) => t.citation).filter(Boolean);
      v.egal('N1, citation du guide V5.0.0 §5.1.11', citations('N1')[0], 'There are four types of configuration files at present, the module configuration file, the receiving card configuration file, the LED display configuration file and the system configuration file.');
      v.egal('N5, citation du chap. 15', citations('N5')[0], 'It not recommended changing the program unless there are problems with the hardware.');
      v.egal('B3, deux citations du §14.10', citations('B3').length, 2);
      v.vrai('N6 finit par la mise en garde sur la mise à jour en ligne', r.N6.textes.at(-1).texte.endsWith('Donc ne lance pas la mise à jour en ligne des cartes sur une dalle à firmware personnalisé : elle le remplacerait par un firmware standard.'));
      v.vrai('N7 : fichier .lxy', r.N7.textes.some((t) => t.texte.includes('.lxy')));
      v.egal('confiance des sources tierces et des copies', [r.N2.textes[0].source.confiance, r.V1.textes[0].source.confiance, r.B4.textes.at(-1).source.confiance],
        ['tiers', 'constructeur, copie non officielle', 'formation']);
    },
  },
  {
    id: 'R142',
    titre: 'Texte copié de Data : lots utilisés, ligne de config et version du logiciel, sans les rappels',
    etape: 'configs',
    verifier(v, contexte) {
      let base = fiches.creerParc(fiches.baseVide(), 'Essai');
      const parc = base.parcs[0].id;
      base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant: '2024-03 A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2')[0].id;
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lot, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx' });
      const m = calculs.mur(DALLE_CAS_7, 10, 5);
      const proc = processeurDeBase(contexte, 'novastar-mctrl4k');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, proc, NOVASTAR_60_8);
      const configs = fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50, { logiciel: 'NovaLCT' });
      const texte = resumes.resumeData(e, { configs: { ...configs, version: 'NovaLCT V5.8.1 dans le parc Essai, relevé le 25/09/2026.' } });
      v.vrai('lots et config', texte.includes('Lots utilisés : 2024-03 A\nConfig NovaLCT : BP2V2_A.rcfgx, lot 2024-03 A'));
      v.vrai('version du logiciel', texte.includes('NovaLCT V5.8.1 dans le parc Essai, relevé le 25/09/2026.'));
      const absent = resumes.resumeData(e, { configs: fiches.configsDuMur(base, parc, 'roe-bp2-v2', 50, { logiciel: 'Tessera' }) });
      v.vrai('config absente : en alerte', absent.includes('Alerte : Aucune config Tessera pour cette dalle (lot 2024-03 A).'));
      v.vrai('sans les rappels', !texte.includes('Guide NovaLCT') && !texte.includes('four types'));
    },
  },
  {
    id: 'R143',
    titre: 'Check-list « Avant de partir » (bas de Data) : fichiers de config sur l\'appareil ou à prendre, multi-batch ou calibration si lots mélangés, firmware personnalisé, version du logiciel, export de la base',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Essai');
      const parc = base.parcs[0].id;
      for (const [identifiant, quantite] of [['2024-03 A', '60'], ['2024-05 B', '40']]) base = fiches.ajouterLot(base, parc, 'roe-bp2-v2', { identifiant, quantite });
      const [lotA, lotB] = fiches.lotsDalleParc(base, parc, 'roe-bp2-v2').map((l) => l.id);
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotA, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_A.rcfgx', firmware: 'personnalisé' });
      base = fiches.joindreFichier(base, parc, 'roe-bp2-v2', lotA, 'NovaLCT', 'fichier', { id: 'f1', nom: 'BP2V2_A.rcfgx', taille: 4, date: '2026-09-25' });
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotB, { logiciel: 'NovaLCT', nomFichier: 'BP2V2_B.rcfgx' });
      const groupes = [{ dalleId: 'roe-bp2-v2', n: 80, coches: null, libelle: null }];
      const mctrl = { id: 'novastar-mctrl4k', famille: 'novastar', logiciel: 'NovaLCT', nom: 'Novastar MCTRL4K' };
      const liste = fiches.avantDePartir(base, parc, groupes, mctrl, { presents: new Set(['f1']) });
      v.egal('NovaLCT, lots A et B mélangés', liste.lignes, [
        { texte: 'Fichier de config BP2V2_A.rcfgx (lot 2024-03 A) : sur cet appareil', fait: true },
        { texte: 'Firmware personnalisé (lot 2024-03 A) : ne lance pas la mise à jour en ligne des cartes', fait: null },
        { texte: 'Fichier de config BP2V2_B.rcfgx (lot 2024-05 B) : pas joint dans l\'appli, prends-le avec toi', fait: false },
        { texte: 'Multi-batch adjustment (.lxy) pour les lots 2024-03 A, 2024-05 B : aucun fichier', fait: false },
        { texte: 'Version de NovaLCT non relevée pour ce processeur : relève-la dans l\'onglet Base', fait: false },
        { texte: 'Exporte ta base avec les fichiers joints avant de partir (onglet Base)', fait: null },
      ]);
      v.egal('fichier joint absent de l\'appareil', fiches.avantDePartir(base, parc, groupes, mctrl, { presents: new Set() }).lignes[0],
        { texte: 'Fichier de config BP2V2_A.rcfgx (lot 2024-03 A) : absent de cet appareil, joins-le de nouveau dans l\'onglet Base', fait: false });
      const releve = fiches.reglerLogicielParc(base, parc, mctrl, { version: 'V5.8.1', dateReleve: '2026-09-25' });
      v.vrai('version relevée : à vérifier sur le PC de régie', fiches.avantDePartir(releve, parc, groupes, mctrl, { presents: new Set(['f1']) }).lignes
        .some((l) => l.texte === 'NovaLCT V5.8.1 relevé le 25/09/2026 : même version sur le PC de régie' && l.fait === null));
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotA, { logiciel: 'Tessera', typeFixture: 'ROE BP2V2', firmwareDalle: '3.2.1', fixturePack: 'ROE_BP2V2.tfp', calibration: 'mémoire 2' });
      base = fiches.reglerConfigLot(base, parc, 'roe-bp2-v2', lotB, { logiciel: 'Tessera', calibration: 'mémoire 1' });
      const s8 = { id: 'brompton-s8', famille: 'brompton', nom: 'Brompton S8' };
      const tessera = fiches.avantDePartir(base, parc, groupes, s8, { presents: new Set(['f1']) }).lignes;
      const a = (texte) => tessera.find((l) => l.texte === texte);
      v.egal('Tessera : fixture pack à prendre', a('Fixture pack ROE_BP2V2.tfp (lot 2024-03 A) : pas joint dans l\'appli, prends-le avec toi')?.fait, false);
      v.egal('Tessera : type de fixture et firmware de la dalle à vérifier', a('Type de fixture ROE BP2V2, firmware de la dalle 3.2.1 (lot 2024-03 A) : à vérifier dans Tessera')?.fait, null);
      v.egal('Tessera : lot sans type de fixture', a('Type de fixture et firmware de la dalle (lot 2024-05 B) : non précisés')?.fait, false);
      v.egal('Tessera : calibrations différentes selon les lots', a('Calibrations différentes selon les lots (2024-03 A mémoire 2, 2024-05 B mémoire 1) : règle la même mémoire sur toutes les dalles')?.fait, false);
      v.egal('Tessera : exporter le projet avant une mise à jour', a('Exporte une copie du projet Tessera avant toute mise à jour du firmware (manuel Tessera V3.5, §14.10)')?.fait, null);
      v.egal('pas de firmware personnalisé côté Tessera (rappel NovaLCT)', tessera.some((l) => l.texte.startsWith('Firmware personnalisé')), false);
      v.egal('parc sans lots pour cette dalle', fiches.avantDePartir(base, parc, [{ dalleId: 'roe-cb5-mkii', n: 20, coches: null, libelle: null }], mctrl).lignes[0],
        { texte: 'Aucun fichier de config pour cette dalle dans le parc Essai : ajoute-le dans l\'onglet Base', fait: false });
      v.egal('« Tous » : pas de check-list', fiches.avantDePartir(base, null, groupes, mctrl), null);
    },
  },
  {
    id: 'R144',
    titre: 'Check-list « Avant de partir » en texte simple (OK, À faire, À vérifier), reprise dans « Tout copier »',
    etape: 'configs',
    verifier(v) {
      const liste = { nomParc: 'Essai', lignes: [
        { texte: 'Fichier de config BP2V2_A.rcfgx (lot 2024-03 A) : sur cet appareil', fait: true },
        { texte: 'Version de NovaLCT non relevée pour ce processeur : relève-la dans l\'onglet Base', fait: false },
        { texte: 'Firmware personnalisé (lot 2024-03 A) : ne lance pas la mise à jour en ligne des cartes', fait: null },
      ] };
      const texte = resumes.resumeAvantDePartir(liste);
      v.egal('texte', texte, 'AVANT DE PARTIR, parc Essai\n'
        + 'OK : Fichier de config BP2V2_A.rcfgx (lot 2024-03 A) : sur cet appareil\n'
        + 'À faire : Version de NovaLCT non relevée pour ce processeur : relève-la dans l\'onglet Base\n'
        + 'À vérifier : Firmware personnalisé (lot 2024-03 A) : ne lance pas la mise à jour en ligne des cartes');
      v.egal('pas de check-list : rien', resumes.resumeAvantDePartir(null), null);
      v.vrai('« Tout copier » la reprend', resumes.toutResumer(['DATA\nProcesseur : 1 × MCTRL4K', texte], new Date(2026, 8, 25)).endsWith(texte));
    },
  },
  {
    id: 'R145',
    titre: 'Dalle en deux versions (URMIII03 standard ou Black, Upad IV 2.6 scan 1/8 ou 1/16) : la plus défavorable par défaut, version réglable par parc (source « Parc X »), demi-dalle de la même version',
    etape: 'catalogue',
    verifier(v, contexte) {
      const u03 = dalleDeBase(contexte, 'unilumin-urmiii03-500x1000');
      const demi = dalleDeBase(contexte, 'unilumin-urmiii03-500x500');
      let base = fiches.creerParc(fiches.baseVide(), 'Loueur U');
      const parc = base.parcs[0].id;
      v.egal('sans réglage : Black, scan 1/8', [fiches.appliquerReglagesParc(u03, base, parc).pMaxW, fiches.appliquerReglagesParc(u03, base, parc).scan], [420, '1/8']);
      base = fiches.reglerDalleParc(base, parc, 'unilumin-urmiii03-500x1000', { declinaison: 'standard' });
      const reglee = fiches.appliquerReglagesParc(u03, base, parc);
      v.egal('version standard réglée dans le parc : 335 W, 100 W, scan 1/16', [reglee.pMaxW, reglee.pMoyW, reglee.scan], [335, 100, '1/16']);
      v.vrai('source « Parc Loueur U », la fiche de la version reste citée', reglee.sources.pMaxW.sources.some((x) => x.court === 'Parc Loueur U')
        && reglee.sources.pMaxW.sources.some((x) => x.id === 'unilumin-fiche-urmiii03-v2-6'));
      v.egal('420 W de la version Black visible', reglee.sources.pMaxW.autres.map((x) => x.valeur), [420]);
      v.egal('valeurs communes aux deux versions : inchangées', [reglee.poidsKg, reglee.pxV], [14.6, 256]);
      v.egal('demi-dalle sans réglage propre : même version que sa dalle (170 W)', fiches.appliquerReglagesParc(demi, base, parc).pMaxW, 170);
      v.egal('« Tous » : la plus défavorable', fiches.appliquerReglagesParc(u03, base, null).pMaxW, 420);
      v.egal('version inconnue : ignorée', fiches.appliquerReglagesParc(u03, fiches.reglerDalleParc(base, parc, 'unilumin-urmiii03-500x1000', { declinaison: 'autre' }), parc).pMaxW, 420);
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const b2 = fiches.reglerDalleParc(base, parc, 'unilumin-upad-iv-2-6', { declinaison: 'scan-1-16' });
      v.egal('Upad IV 2.6 en scan 1/16 : scan réglé, 120 W de la fiche Unilumin visible',
        [fiches.appliquerReglagesParc(upad, b2, parc).scan, [fiches.appliquerReglagesParc(upad, b2, parc).pMaxW, ...fiches.appliquerReglagesParc(upad, b2, parc).sources.pMaxW.autres.map((x) => x.valeur)].includes(120)], ['1/16', true]);
      v.vrai('réglage de la version dans le formulaire du parc', fiches.CHAMPS_REGLAGE_PARC.includes('declinaison'));
    },
  },
  {
    id: 'R146',
    titre: 'Valeur « plafond constructeur » (LEDECA : « <600 W/m² », « <15 kg ») : type accepté, affiché avec la P max dans Élec et avec le poids dans Poids',
    etape: 'catalogue',
    verifier(v, contexte) {
      v.vrai('type de valeur accepté dans une fiche', fiches.TYPES_VALEUR.includes('plafond constructeur'));
      const dalle = dalleDeBase(contexte, 'ledeca-ldaosp03-9st');
      const m = calculs.mur(dalle, 8, 4);
      const elec = resumes.resumeElec(calculs.electricite(m, dalle, {}), { dalle, mur: m });
      v.vrai('Élec : P max retenue 300 W, plafond constructeur', /P max retenue[^:]* : 300 W \(.*plafond constructeur.*\)/.test(elec));
      const poids = resumes.resumePoids(calculs.poids(m, dalle, {}), { dalle, mur: m });
      v.vrai('Poids : 15 kg, plafond constructeur', /Poids d'une dalle : 15 kg \(.*plafond constructeur.*\)/.test(poids));
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m2 = calculs.mur(bp2, 4, 3);
      v.vrai('valeur ordinaire : pas de mention', !resumes.resumeElec(calculs.electricite(m2, bp2, {}), { dalle: bp2, mur: m2 }).includes('plafond'));
    },
  },
  {
    id: 'R147',
    titre: 'Choix de la dalle : marque, puis gamme, puis version ; dalles du parc actif en premier ; recherche par nom ou par pitch ; fiches d\'information grisées dans leur gamme',
    etape: 'catalogue',
    verifier(v) {
      const dalle = (id, marque, gamme, modele, version, pitchMm, extra = {}) => ({ id, marque, gamme, modele, version, pitchMm, largeurMm: 500, hauteurMm: 500, pxH: 176, pxV: 176, nom: [marque, modele, version].filter(Boolean).join(' '), ...extra });
      const dalles = [
        dalle('unilumin-urmiii3', 'Unilumin', 'URMIII', 'URMIII3', null, 3.9),
        dalle('roe-bp2-v2', 'ROE', 'Black Pearl', 'BP2', 'V2', 2.84),
        dalle('absen-pl2-5-pro-v10', 'Absen', undefined, 'PL2.5 Pro', 'V10', 2.5),
        dalle('roe-cb5-mkii', 'ROE', 'Carbon MKII', 'CB5', 'MKII', 5.77),
        dalle('roe-dm2-6', 'ROE', 'Diamond', 'DM2.6', null, 2.6),
        dalle('roe-gp2-6', 'ROE', 'Graphite', 'GP2.6', null, undefined, { largeurMm: 500, pxH: 192 }),
      ];
      const informations = [{ id: 'roe-jasper-2-6', marque: 'ROE', gamme: 'Jasper', modele: 'Jasper', version: '2.6', pitchMm: 2.6, nom: 'ROE Jasper 2.6', statut: 'information' }];
      const arbre = fiches.arbreDalles(dalles, { informations, parc: new Set(['roe-cb5-mkii']) });
      v.egal('marques : celle du parc actif en premier, puis par ordre alphabétique', arbre.map((m) => m.marque), ['ROE', 'Absen', 'Unilumin']);
      v.egal('gammes : celle du parc en premier', arbre[0].gammes.map((g) => g.gamme), ['Carbon MKII', 'Black Pearl', 'Diamond', 'Graphite', 'Jasper']);
      v.egal('sans gamme : le modèle sert de gamme', arbre[1].gammes.map((g) => g.gamme), ['PL2.5 Pro']);
      v.egal('fiche d\'information grisée dans sa gamme', arbre[0].gammes.find((g) => g.gamme === 'Jasper').fiches.map((f) => [f.id, f.information]), [['roe-jasper-2-6', true]]);
      v.egal('version : libellé sans la marque ni la gamme', arbre[0].gammes.find((g) => g.gamme === 'Black Pearl').fiches[0].libelle, 'BP2 V2');
      const ids = (a) => a.flatMap((m) => m.gammes.flatMap((g) => g.fiches.map((f) => f.id)));
      v.egal('recherche par nom (sans accents ni majuscules)', ids(fiches.arbreDalles(dalles, { informations, recherche: 'bp2' })), ['roe-bp2-v2']);
      v.egal('recherche par pitch : « 2,6 », « 2.6 » ou « P2.6 » (pitch de la fiche ou largeur / pixels)', ['2,6', '2.6', 'P2.6'].map((q) => ids(fiches.arbreDalles(dalles, { informations, recherche: q }))),
        [['roe-dm2-6', 'roe-gp2-6', 'roe-jasper-2-6'], ['roe-dm2-6', 'roe-gp2-6', 'roe-jasper-2-6'], ['roe-dm2-6', 'roe-gp2-6', 'roe-jasper-2-6']]);
      v.egal('recherche sans résultat : liste vide', fiches.arbreDalles(dalles, { recherche: 'zzz' }), []);
      const parc = fiches.arbreDalles(dalles, { parc: new Set(['roe-dm2-6', 'roe-bp2-v2']) })[0].gammes;
      v.egal('dans une marque, gammes du parc puis les autres', parc.map((g) => [g.gamme, g.parc]), [['Black Pearl', true], ['Diamond', true], ['Carbon MKII', false], ['Graphite', false]]);
    },
  },
  {
    id: 'R148',
    titre: 'Fiches retirées de la base de départ (LEDCAST) encore citées par un parc : signalées dans Base, retirées du parc sur demande avec leurs réglages et leurs lots',
    etape: 'catalogue',
    verifier(v, contexte) {
      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      let base = fiches.creerParc(fiches.baseVide(), 'Ancien parc');
      const parc = base.parcs[0].id;
      base = fiches.basculerMembre(base, parc, 'dalle', 'ledcast-flex-2-5');
      base = fiches.basculerMembre(base, parc, 'dalle', 'roe-bp2-v2');
      base = fiches.reglerDalleParc(base, parc, 'ledcast-flex-2-5', { carteReceptionMarque: 'Novastar' });
      base = fiches.ajouterLot(base, parc, 'ledcast-flex-2-5', { identifiant: 'Lot 1' });
      v.egal('fiche retirée signalée, avec son réglage et ses lots', fiches.fichesRetirees(base, depart),
        [{ parcId: parc, parcNom: 'Ancien parc', type: 'dalle', id: 'ledcast-flex-2-5', reglage: true, lots: 1 }]);
      const nettoyee = fiches.retirerFicheRetiree(base, parc, 'dalle', 'ledcast-flex-2-5');
      v.egal('retirée du parc : membre, réglage et lots', [fiches.estMembre(nettoyee, parc, 'dalle', 'ledcast-flex-2-5'), fiches.reglageDalleParc(nettoyee, parc, 'ledcast-flex-2-5'),
        fiches.lotsDalleParc(nettoyee, parc, 'ledcast-flex-2-5').length, fiches.estMembre(nettoyee, parc, 'dalle', 'roe-bp2-v2')], [false, null, 0, true]);
      v.egal('plus rien à signaler', fiches.fichesRetirees(nettoyee, depart), []);
      const maFiche = { ...fiches.baseVide(), fiches: [{ type: 'dalle', fiche: { id: 'ledcast-flex-2-5', marque: 'LEDCAST', modele: 'Flex', largeurMm: { valeur: 500, source: 't' }, hauteurMm: { valeur: 500, source: 't' }, pxH: { valeur: 200, source: 't' }, pxV: { valeur: 200, source: 't' } } }],
        parcs: base.parcs };
      v.egal('fiche gardée dans ma base (version complétée) : rien à signaler', fiches.fichesRetirees(maFiche, depart), []);
    },
  },
  {
    id: 'R149',
    titre: 'Pitch nominal (nom commercial) : affiché pour information, jamais utilisé ; les calculs (taille, résolution, canvas, charge des ports, mapping interpolé) prennent le pitch réel (Upad IV 1.5 MIP : 320 px sur 500 mm)',
    etape: 'catalogue',
    verifier(v, contexte) {
      const mip = dalleDeBase(contexte, 'unilumin-upad-iv-1-5-mip');
      v.egal('fiche : 1,5 mm « nominal », 320 px sur 500 mm', [mip.pitchMm, mip.sources.pitchMm.type, mip.pxH, mip.largeurMm], [1.5, 'nominal', 320, 500]);
      v.egal('pitch réel : 500 / 320 = 1,5625 mm', [calculs.pitchCalculeMm(mip), calculs.densite(mip).pitchMm], [1.5625, 1.5625]);
      const r = calculs.dimensionner(mip, { mode: 'taille', largeurMm: 2000, hauteurMm: 1000 });
      v.egal('mur de 2 × 1 m : 4 × 2 dalles, 1280 × 640 px (pixels de la fiche, pas 2000 / 1,5 = 1333)', [r.mur.colonnes, r.mur.lignes, r.mur.pxLargeur, r.mur.pxHauteur], [4, 2, 1280, 640]);
      const e = calculs.evaluerProcesseur(r.mur, mip, processeurDeBase(contexte, 'brompton-s8'), BROMPTON_60_10);
      v.egal('charge d\'un port : 320 × 320 = 102 400 px par dalle', e.pxParDalle, 102400);
      v.egal('mapping interpolé : pitch de référence réel', calculs.pitchLePlusFin([mip, dalleDeBase(contexte, 'roe-bp2-v2')]), 1.5625);
      v.vrai('texte copié du Mur : pitch réel', resumes.resumeMur({ dalle: mip, mur: r.mur }).includes('Pitch : 1,563 mm'));
      const nominaux = contexte.dalles.dalles.map((f) => calculs.resoudreFiche(f, contexte.dalles.sources)).filter((d) => d.sources.pitchMm?.type === 'nominal').map((d) => d.id);
      v.egal('dalles à pitch nominal', nominaux, ['roe-bq4-6', 'roe-bq4-6-demi', 'roe-v4st', 'unilumin-urmiii2-500x1000', 'unilumin-urmiii2-500x500',
        'unilumin-upad-iv-1-9-pro-f', 'unilumin-upad-iv-1-9-pro-xr', 'unilumin-upad-iv-1-5-mip', 'ledeca-ldaisp02-9st', 'ledeca-ldaisp01-9stq']);
      v.vrai('type de valeur accepté dans une fiche', fiches.TYPES_VALEUR.includes('nominal'));
    },
  },
  {
    id: 'R150',
    titre: 'Capacité de l\'appareil = min(ports × capacité d\'un port, capacité totale de la fiche), affichée et reprise dans le texte copié',
    etape: 'processeurs',
    verifier(v, contexte) {
      const vx4s = processeurDeBase(contexte, 'novastar-vx4s');
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 10, 5), DALLE_CAS_7, vx4s, NOVASTAR_60_8);
      const c = e.capaciteAppareil;
      v.egal('VX4S : 4 ports × 650 000 = 2,6 M, mais 2,3 M au total', [c.ports, calculs.entierInferieur(c.capacitePort), calculs.entierInferieur(c.sommePorts), c.pixelsMax, calculs.entierInferieur(c.valeur), c.limite],
        [4, 650000, 2600000, 2300000, 2300000, 'total']);
      v.vrai('texte copié : la ligne « Capacité de l\'appareil »', /Capacité de l'appareil : min\(4 ports × 650.000 = 2.600.000 px ; total de la fiche 2.300.000 px\) = 2.300.000 px/.test(resumes.resumeData(e)));
      const t1 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 2, 2), DALLE_CAS_7, processeurDeBase(contexte, 'brompton-t1'), { frequenceHz: 60, bits: 12 });
      v.egal('T1 en 12 bits : un port de 350 000 px limite avant le total (500 000)', [calculs.entierInferieur(t1.capaciteAppareil.valeur), t1.capaciteAppareil.limite], [350000, 'ports']);
    },
  },
  {
    id: 'R151',
    titre: 'Colorlight : zone d\'un port limitée à 4096 px de large ou de haut (fiche S20) ; colonnes par port réduites, colonne trop haute coupée en segments ; découpage sur plusieurs processeurs gardé (D30)',
    etape: 'processeurs',
    verifier(v, contexte) {
      const x8e = processeurDeBase(contexte, 'colorlight-x8e');
      v.egal('X8E : 4096 px par port, par analogie avec la fiche S20', [x8e.dimensionMaxPortPx, x8e.sources.dimensionMaxPortPx.source.confiance], [4096, 'déduit']);
      const large = { id: 'test-256x64', nom: 'Test 256 × 64 px', largeurMm: 500, hauteurMm: 125, pxH: 256, pxV: 64 };
      const e1 = calculs.evaluerProcesseur(calculs.mur(large, 19, 2), large, x8e, { frequenceHz: 60, bits: 8 });
      v.egal('19 colonnes de 256 px : 16 colonnes par port (4096 px), 2 ports, alors que la capacité en permettait 19', [e1.global.colonnes.colonnesParPort, e1.global.colonnes.ports], [16, 2]);
      v.vrai('alerte chiffrée', e1.alertes.some((a) => a.includes('4096 px') && a.includes('2 ports') && a.includes('1 port')));
      const haute = { id: 'test-128x256', nom: 'Test 128 × 256 px', largeurMm: 500, hauteurMm: 1000, pxH: 128, pxV: 256 };
      const e2 = calculs.evaluerProcesseur(calculs.mur(haute, 2, 20), haute, x8e, { frequenceHz: 60, bits: 8 });
      v.egal('colonne de 5120 px : 2 segments de 10 dalles (2560 px), 4 ports au lieu de 2', [e2.global.colonnes.segments, e2.global.colonnes.ports], [[10, 10], 4]);
      const sansLimite = calculs.evaluerProcesseur(calculs.mur(large, 20, 2), large, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      v.egal('Novastar : pas de limite par port en pixels, seulement la capacité', sansLimite.global.colonnes.colonnesParPort, 19);
    },
  },
  {
    id: 'R152',
    titre: 'Novastar, 10 bits propre à chaque modèle : valeur de la fiche (320 000 ou 325 000), sinon 320 000 « déduit, à confirmer » (la plus petite publiée) ; modèles sans entrée 10 bits : 10 bits refusé',
    etape: 'processeurs',
    verifier(v, contexte) {
      const port = (id, bits) => calculs.capacitePortProcesseur(processeurDeBase(contexte, id), { frequenceHz: 60, bits });
      const e = (x) => [calculs.entierInferieur(x.capacite), x.deduit, x.aConfirmer];
      v.egal('MCTRL4K et NovaPro UHD Jr : 320 000 (fiches)', [e(port('novastar-mctrl4k', 10)), e(port('novastar-novapro-uhd-jr', 10))], [[320000, false, false], [320000, false, false]]);
      v.egal('MCTRL660 Pro et MCTRL R5 : 325 000 (fiches)', [e(port('novastar-mctrl660-pro', 10)), e(port('novastar-mctrl-r5', 10))], [[325000, false, false], [325000, false, false]]);
      for (const id of ['novastar-mctrl660', 'novastar-vx4s', 'novastar-vx4u', 'novastar-vx2u', 'novastar-novapro-hd', 'novastar-vx6s']) {
        v.egal(`${id} : 320 000 en 10 et 12 bits, déduit et à confirmer`, [e(port(id, 10)), e(port(id, 12))], [[320000, true, true], [320000, true, true]]);
      }
      v.egal('8 bits : toujours 650 000', calculs.entierInferieur(port('novastar-mctrl660', 8).capacite), 650000);
      const mctrl300 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 4, 3), DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl300'), { frequenceHz: 60, bits: 10 });
      v.vrai('MCTRL300 : pas d\'entrée 10 bits, refus avec la raison', mctrl300.nombre === null && /8 bits/.test(mctrl300.impossible ?? '') && /pas d'entrée 10 bits/.test(mctrl300.impossible ?? ''));
      v.egal('MX40 Pro, 10 bits avec cartes Pro : 480 000 (catalogue 2022, A10s Pro), la formule (494 791) visible dans la note',
        [calculs.entierInferieur(calculs.capacitePortProcesseur(processeurDeBase(contexte, 'coex-mx40-pro'), { frequenceHz: 60, bits: 10, cartesPro: true }).capacite),
          /494.791/.test(calculs.capacitePortProcesseur(processeurDeBase(contexte, 'coex-mx40-pro'), { frequenceHz: 60, bits: 10, cartesPro: true }).notes.join(' '))], [480000, true]);
      v.egal('MX40 Pro, 10 bits sans cartes Pro : formule inchangée', calculs.entierInferieur(calculs.capacitePortProcesseur(processeurDeBase(contexte, 'coex-mx40-pro'), { frequenceHz: 60, bits: 10 }).capacite), 329861);
    },
  },
  {
    id: 'R153',
    titre: 'Colorlight : 650 000 px par port 1G à 60 Hz en 8 bits (fiches X20 et VX20), 655 360 (X100 Pro) visible non retenu, proportionnel à la fréquence ; 10 bits ÷ 2 « déduit, à confirmer » sauf fiche ×0,75 ; 12 bits refusé (non publié)',
    etape: 'processeurs',
    verifier(v, contexte) {
      const s6f = processeurDeBase(contexte, 'colorlight-s6f');
      const c = (frequenceHz, bits) => calculs.capacitePortProcesseur(s6f, { frequenceHz, bits });
      v.egal('8 bits à 60 Hz : 650 000, source constructeur, plus « à confirmer »', [calculs.entierInferieur(c(60, 8).capacite), c(60, 8).aConfirmer, s6f.sources.capacitePort60Hz8bits.source.confiance],
        [650000, false, 'constructeur']);
      v.egal('655 360 (fiches X100 Pro) visible, non retenu', s6f.sources.capacitePort60Hz8bits.autres.filter((x) => x.nonRetenue).map((x) => x.valeur), [655360]);
      v.egal('120 Hz : 320 000, déduit des fiches X8m, X12m… (R172)', [calculs.entierInferieur(c(120, 8).capacite), c(120, 8).deduit], [320000, true]);
      v.egal('10 bits : ÷ 2, déduit et à confirmer', [calculs.entierInferieur(c(60, 10).capacite), c(60, 10).deduit, c(60, 10).aConfirmer], [325000, true, true]);
      const e12 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 4, 3), DALLE_CAS_7, s6f, { frequenceHz: 60, bits: 12 });
      v.vrai('12 bits refusé : « capacité 12 bits non publiée par Colorlight »', e12.nombre === null && /capacité 12 bits non publiée par Colorlight/.test(e12.impossible ?? ''));
      v.egal('fiche complète sans valeur 12 bits', calculs.champsManquants(s6f), []);
    },
  },
  {
    id: 'R154',
    titre: 'Sorties fibre qui copient ou secourent les ports Ethernet : aucune capacité ajoutée ; le MX40 Pro garde son mode 40 ports',
    etape: 'processeurs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 60, 20);
      const e4k = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      v.egal('MCTRL4K : fibre en copie, 16 ports seulement', [e4k.processeur.sortiesFibre, e4k.controles.ports.limite], ['copie', 16]);
      v.vrai('MCTRL4K : note affichée', e4k.alertes.some((a) => /fibre/i.test(a) && /aucune capacité/.test(a)));
      const mx40 = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'coex-mx40-pro'), { ...NOVASTAR_60_8, modeOptique: true });
      v.egal('MX40 Pro, mode optique : 40 ports', [mx40.processeur.sortiesFibre, mx40.controles.ports.limite], ['ports en plus', 40]);
    },
  },
  {
    id: 'R155',
    titre: 'Relevé des sources : les valeurs en conflit, la plus défavorable retenue et les autres visibles avec leurs sources',
    etape: 'processeurs',
    verifier(v, contexte) {
      const conflits = calculs.valeursEnConflit(contexte.dalles.dalles, contexte.dalles.sources, calculs.PLUS_DEFAVORABLE);
      const bp2 = conflits.find((x) => x.id === 'roe-bp2-v2' && x.champ === 'pMaxW');
      v.egal('BP2 V2 : P max 190 W retenus, 160 et 185 W visibles', [bp2?.retenue.valeur, bp2?.autres.map((x) => x.valeur)], [190, [160, 185]]);
      v.vrai('chaque conflit porte ses sources', conflits.every((x) => x.retenue.sources.length > 0 && x.autres.every((a) => a.sources.length > 0)));
      v.egal('une valeur « non retenue » (corrigée par le constructeur) n\'est pas un conflit', conflits.some((x) => x.id === 'roe-cb5-mkii-demi' && x.champ === 'poidsKg'), false);
    },
  },
  {
    id: 'R156',
    titre: 'Régies, switchers, scalers : modèle générique (entrées et sorties par type et nombre, format maxi, couches, latence, bits, emplacements, U, poids, conso, statut) ; modes de sortie déduits pour le contrôle du Canvas',
    etape: 'processeurs',
    verifier(v, contexte) {
      const sources = { t: { titre: 'Fiche test', court: 'Test', date: '2026-09-26', confiance: 'constructeur' } };
      const regie = {
        marque: 'Test', modele: 'Switcher 8', role: 'switcher', position: 'amont',
        entrees: [{ type: 'hdmi-2.0', nombre: 4, largeurMaxPx: 4096, hauteurMaxPx: 2160, frequenceMaxHz: 60, source: 't' }],
        sorties: [{ type: 'dvi-single', nombre: 8, largeurMaxPx: 1920, hauteurMaxPx: 1200, frequenceMaxHz: 60, source: 't' }],
        couches: { valeur: 6, source: 't' }, latence: { valeur: '1 image', source: 't' }, bitsParCouleur: { valeur: 10, source: 't' },
        emplacements: [{ role: 'sortie', nombre: 4, source: 't' }], hauteurU: { valeur: 2, source: 't' }, poidsKg: { valeur: 5.3, source: 't' },
        puissanceW: { valeur: 50, source: 't' }, statutCommercial: { valeur: 'ancien', source: 't' },
      };
      const r = fiches.validerFiche('regie', regie, sources);
      v.egal('fiche générique enregistrable et complète', [r.enregistrable, r.erreurs, r.manquants], [true, [], []]);
      const resolue = calculs.resoudreFiche(r.fiche, sources);
      v.egal('modes de sortie déduits des sorties', calculs.modesSortieRegie(resolue, liaisonsDeBase(contexte)).map((m) => [m.nom, m.sorties, m.largeurMaxPx, m.hauteurMaxPx, m.frequenceHz]), [['8 × DVI single link', 8, 1920, 1200, 60]]);
      v.egal('types de sortie déduits', calculs.sortiesTypesRegie(resolue), ['dvi-single']);
      const controle = calculs.controleRegie(resolue, { nombre: 2 }, { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60, liaison: 'dvi-single' }, liaisonsDeBase(contexte));
      v.egal('contrôle Canvas : 8 sorties DVI pour 2 processeurs', [controle.ok, controle.sortiesDisponibles], [true, 8]);
      const sansSource = fiches.validerFiche('regie', { ...regie, sorties: [{ ...regie.sorties[0], source: undefined }] }, sources);
      v.egal('chaque entrée ou sortie a sa source', sansSource.enregistrable, false);
    },
  },
  {
    id: 'R157',
    titre: 'Novastar série H : cartes d\'envoi LED par emplacement (H_20xRJ45, H_16xRJ45+2xfiber, H_4xfiber), comme les MX6000 Pro ; ports, capacité et convertisseurs comptés par carte',
    etape: 'processeurs',
    verifier(v, contexte) {
      const h5 = processeurDeBase(contexte, 'novastar-h5');
      const m = calculs.mur(DALLE_CAS_7, 30, 10);
      const e = (proc, reglages = {}) => calculs.evaluerProcesseur(m, DALLE_CAS_7, proc, { ...NOVASTAR_60_8, ...reglages });
      const rj = e(h5);
      v.egal('par défaut H_20xRJ45 : 30 ports, 2 cartes, 1 processeur', [rj.nombre, rj.totaux.ports.colonnes, rj.configuration], [1, 30, 'H5 + 2 cartes H_20xRJ45']);
      v.egal('H5 : 3 emplacements, 60 ports, 39 M px, 32 256 px (3 cartes de 10 752 px côte à côte)', [rj.controles.ports.limite, rj.controles.pixels.limite, rj.controles.largeur.limite], [60, 39000000, 32256]);
      v.vrai('H5 : largeur de l\'appareil marquée « déduit : cartes côte à côte »', /déduit : cartes côte à côte/.test(rj.processeur.sources.largeurMaxPx.source.court)
        && rj.processeur.sources.largeurMaxPx.source.confiance === 'déduit');
      const dix = e(h5, { bits: 10 });
      v.egal('10 bits : 320 000 px par port (fiche)', [calculs.entierInferieur(dix.capacite), dix.capaciteDeduite], [320000, false]);
      const fibre = e(h5, { carteSortie: 'h-4xfiber' });
      v.egal('H_4xfiber : 1 carte, un CVT10 par fibre, obligatoires', [fibre.configuration, fibre.distributeurObligatoire, fibre.totaux.distributeurs.colonnes], ['H5 + 1 carte H_4xfiber + 4 CVT10', true, 4]);
      v.vrai('H_4xfiber : 8 ports utilisés sur 10 par CVT10, déduit', fibre.alertes.some((a) => /8 ports utilisés sur 10/.test(a) && /déduit/.test(a)));
      const fibreDix = e(h5, { carteSortie: 'h-4xfiber', bits: 10 });
      v.egal('H_4xfiber : 10 bits 320 000, déduit', [calculs.entierInferieur(fibreDix.capacite), fibreDix.capaciteDeduite], [320000, true]);
      const copie = e(h5, { carteSortie: 'h-16xrj45' });
      v.egal('H_16xRJ45+2xfiber : 2 cartes, fibre en copie, CVT4K seulement si fibre', [copie.configuration, copie.processeur.sortiesFibre, copie.distributeurObligatoire, copie.processeur.distributeur],
        ['H5 + 2 cartes H_16xRJ45+2xfiber', 'copie', false, 'novastar-cvt4k']);
      const h2 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 50, 10), DALLE_CAS_7, processeurDeBase(contexte, 'novastar-h2'), NOVASTAR_60_8);
      v.egal('H2 : 2 emplacements, 40 ports ; 50 ports demandent 2 × H2', [h2.controles.ports.limite, h2.nombre], [40, 2]);
    },
  },
  {
    id: 'R158',
    titre: 'Novastar, 10 bits des nouveaux modèles : VX400, VX600 et VX1000 Pro à 325 000 « déduit » (règle du VX2000 Pro) avec la note HDR ; VX2000 Pro à 480 000 avec l\'A10s Pro (par analogie) ; 320 000 « déduit, à confirmer » quand l\'entrée accepte le 10 bits ; refus sans entrée 10 bits',
    etape: 'processeurs',
    verifier(v, contexte) {
      const port = (id, bits, carte = null) => calculs.capacitePortProcesseur(processeurDeBase(contexte, id), { frequenceHz: 60, bits, carte });
      const e = (x) => [calculs.entierInferieur(x.capacite), x.deduit];
      for (const id of ['novastar-vx400-pro', 'novastar-vx600-pro', 'novastar-vx1000-pro']) {
        v.egal(`${id} : 325 000 en 10 bits, déduit`, e(port(id, 10)), [325000, true]);
        v.vrai(`${id} : note HDR (÷ 4, 162 500 px)`, port(id, 10).notes.some((n) => /HDR/.test(n) && /162.500/.test(n)));
      }
      v.egal('VX2000 Pro, carte inconnue : 325 000 (fiche)', e(port('novastar-vx2000-pro', 10)), [325000, false]);
      v.egal('VX2000 Pro avec l\'A10s Pro : 480 000, déduit par analogie', e(port('novastar-vx2000-pro', 10, 'A10s Pro')), [480000, true]);
      v.egal('VX2000 Pro avec l\'A8s Pro : 325 000 (seule l\'A10s Pro est citée)', e(port('novastar-vx2000-pro', 10, 'A8s Pro')), [325000, false]);
      v.egal('VX2000 Pro en 8 bits : 650 000, sans note de carte', [calculs.entierInferieur(port('novastar-vx2000-pro', 8).capacite), port('novastar-vx2000-pro', 8).notes], [650000, []]);
      for (const id of ['novastar-mctrl500', 'novastar-mctrl600', 'novastar-msd600', 'novastar-vx16s', 'novastar-novapro-uhd', 'novastar-vx4s-n']) {
        const x = port(id, 10);
        v.egal(`${id} : 320 000 en 10 bits, déduit et à confirmer`, [calculs.entierInferieur(x.capacite), x.deduit, x.aConfirmer], [320000, true, true]);
      }
      for (const id of ['novastar-vx1000', 'novastar-vx600', 'novastar-vx400', 'novastar-mctrl700', 'novastar-mctrl700-pro', 'novastar-msd300']) {
        const r = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 4, 3), DALLE_CAS_7, processeurDeBase(contexte, id), { frequenceHz: 60, bits: 10 });
        v.vrai(`${id} : 10 bits refusé avec la raison`, r.nombre === null && /travaille en 8 bits/.test(r.impossible ?? ''));
      }
    },
  },
  {
    id: 'R159',
    titre: 'Convertisseurs Novastar : CVT4K (MCTRL4K, NovaPro UHD et UHD Jr, 16 ports), CVT310 ou CVT320 un par port (MCTRL500), CVT10 (VX Pro) avec les ports non utilisés signalés ; CVT10 : 22 W retenus, 18 W de la fiche visibles',
    etape: 'processeurs',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const d = (id) => calculs.resoudreFiche(bp.distributeurs.find((x) => x.id === id), bp.sources);
      for (const id of ['novastar-mctrl4k', 'novastar-novapro-uhd', 'novastar-novapro-uhd-jr']) {
        const p = processeurDeBase(contexte, id);
        v.egal(`${id} : CVT4K, 16 ports`, [p.distributeur, p.sortiesParDistributeur], ['novastar-cvt4k', 16]);
      }
      const cvt4k = d('novastar-cvt4k');
      v.egal('CVT4K : 16 ports 1G, 21 W retenus (version S), 10 W (M) visibles, 4,6 kg, 2U',
        [cvt4k.sorties, cvt4k.puissanceW, cvt4k.sources.puissanceW.autres.map((x) => x.valeur), cvt4k.poidsKg, cvt4k.hauteurU], [16, 21, [10], 4.6, 2]);
      const cvt10 = d('novastar-cvt10');
      v.egal('CVT10 : 22 W retenus (wiki COEX), 18 W de la fiche V1.3.2 visibles, 2,1 kg', [cvt10.puissanceW, cvt10.sources.puissanceW.autres.map((x) => x.valeur), cvt10.poidsKg], [22, [18], 2.1]);
      v.egal('CVT310 et CVT320 : un port 1G chacun, multimode 550 m ou monomode 20 km', [d('novastar-cvt310').sorties, d('novastar-cvt320').sorties, /550 m/.test(d('novastar-cvt310').fibre), /20 km/.test(d('novastar-cvt320').fibre)], [1, 1, true, true]);
      const m = calculs.mur(DALLE_CAS_7, 16, 3);
      const m500 = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl500'), NOVASTAR_60_8);
      v.egal('MCTRL500 : un CVT310 par port', [m500.processeur.distributeur, m500.totaux.ports.colonnes, m500.totaux.distributeurs.colonnes], ['novastar-cvt310', 4, 4]);
      const vx = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-vx400-pro'), NOVASTAR_60_8);
      v.egal('VX400 Pro : 4 ports, 1 CVT10, 6 ports du CVT10 non utilisés', [vx.totaux.ports.colonnes, vx.totaux.distributeurs.colonnes, vx.totaux.distributeurs.portsNonUtilises], [4, 1, 6]);
      v.vrai('texte copié : ports non utilisés', resumes.resumeData(vx, { distributeur: 'CVT10' }).split('\n').includes('CVT10 : 1, 6 ports non utilisés'));
    },
  },
  {
    id: 'R160',
    titre: 'Sorties fibre en copie ou secours des ports Ethernet (VX1000, NovaPro UHD, MCTRL500, carte H_16xRJ45+2xfiber) : aucune capacité ajoutée ; la carte H_4xfiber est une vraie sortie',
    etape: 'processeurs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 60, 20);
      for (const [id, ports] of [['novastar-vx1000', 10], ['novastar-novapro-uhd', 16], ['novastar-mctrl500', 4]]) {
        const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, id), NOVASTAR_60_8);
        v.egal(`${id} : fibre en copie, ${ports} ports au plus`, [e.processeur.sortiesFibre, e.controles.ports.limite], ['copie', ports]);
        v.vrai(`${id} : alerte « aucune capacité ajoutée »`, e.alertes.some((a) => /aucune capacité ajoutée/.test(a)));
      }
      const h5 = processeurDeBase(contexte, 'novastar-h5');
      const copie = calculs.evaluerProcesseur(m, DALLE_CAS_7, h5, { ...NOVASTAR_60_8, carteSortie: 'h-16xrj45' });
      v.vrai('carte H_16xRJ45+2xfiber : alerte « aucune capacité ajoutée »', copie.alertes.some((a) => /aucune capacité ajoutée/.test(a)));
      const fibre = calculs.evaluerProcesseur(m, DALLE_CAS_7, h5, { ...NOVASTAR_60_8, carteSortie: 'h-4xfiber' });
      v.egal('carte H_4xfiber : vraie sortie, 96 ports (3 cartes × 4 fibres × 8 ports)', [fibre.alertes.some((a) => /aucune capacité ajoutée/.test(a)), fibre.controles.ports.limite], [false, 96]);
    },
  },
  {
    id: 'R161',
    titre: 'Processeurs Novastar : statut commercial (actuel ou ancien) et latence chiffrée en images, avec leurs sources ; ligne « Latence » du texte copié de Data',
    etape: 'processeurs',
    verifier(v, contexte) {
      const p = (id) => processeurDeBase(contexte, id);
      v.egal('statuts', ['novastar-vx2000-pro', 'novastar-mctrl4k', 'novastar-novapro-uhd', 'novastar-vx4u'].map((id) => p(id).statutCommercial), ['actuel', 'actuel', 'ancien', 'ancien']);
      v.egal('VX4U : « discontinued » selon un revendeur, confiance revendeur', p('novastar-vx4u').sources.statutCommercial.source.confiance, 'revendeur');
      const vx = p('novastar-vx2000-pro');
      v.egal('VX2000 Pro : de 0 à 3 images (fiche V1.4.0)', [vx.latenceMinImages, vx.latenceMaxImages, vx.sources.latenceMinImages.source.id], [0, 3, 'novastar-vx2000-pro-v1-4-0']);
      v.egal('NovaPro UHD : au moins 1 image (« as low as »), maximum non publié', [p('novastar-novapro-uhd').latenceMinImages, p('novastar-novapro-uhd').latenceMaxImages], [1, undefined]);
      const m = calculs.mur(DALLE_CAS_7, 10, 5);
      v.vrai('texte copié : latence de 0 à 3 images', /Latence : 0 à 3 images/.test(resumes.resumeData(calculs.evaluerProcesseur(m, DALLE_CAS_7, vx, NOVASTAR_60_8))));
      v.vrai('texte copié : au moins 1 image, maximum non publié',
        /Latence : au moins 1 image, maximum non publié/.test(resumes.resumeData(calculs.evaluerProcesseur(m, DALLE_CAS_7, p('novastar-novapro-uhd'), NOVASTAR_60_8))));
    },
  },
  {
    id: 'R162',
    titre: 'Sélecteur de processeur (Data) : marque (famille de calcul, COEX dans Novastar), gamme, modèle du plus petit au plus grand avec « actuel » ou « ancien » ; fiches à compléter et d\'information grisées ; recherche par nom ou alias',
    etape: 'processeurs',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const procs = bp.processeurs.map((x) => calculs.resoudreFiche(x, bp.sources));
      const infos = (bp.informations ?? []).map((x) => calculs.resoudreFiche(x, bp.sources));
      const arbre = fiches.arbreProcesseurs(procs, { informations: infos });
      v.egal('marques et famille de calcul', arbre.map((m) => [m.marque, m.famille]), [['Brompton', 'brompton'], ['Colorlight', 'colorlight'], ['Novastar', 'novastar']]);
      const gammes = (marque) => arbre.find((m) => m.marque === marque).gammes;
      v.egal('gammes Novastar, COEX compris', gammes('Novastar').map((g) => g.gamme), ['COEX', 'MCTRL', 'MSD (cartes d\'envoi)', 'NovaPro', 'Série H', 'VX', 'VX Pro']);
      const fichesDe = (marque, gamme) => gammes(marque).find((g) => g.gamme === gamme).fiches;
      v.egal('VX Pro : du plus petit au plus grand, statut dans le libellé', fichesDe('Novastar', 'VX Pro').map((x) => x.libelle),
        ['VX400 Pro (actuel)', 'VX600 Pro (actuel)', 'VX1000 Pro (actuel)', 'VX2000 Pro (actuel)']);
      v.egal('MCTRL : par capacité ; MCTRL610, fiche d\'information, en dernier et grisé', fichesDe('Novastar', 'MCTRL').map((x) => [x.libelle, x.information]),
        [['MCTRL300 (actuel)', false], ['MCTRL660 (actuel)', false], ['MCTRL660 Pro (actuel)', false], ['MCTRL500 (ancien)', false], ['MCTRL600 (actuel)', false],
          ['MCTRL700 (actuel)', false], ['MCTRL700 Pro (actuel)', false], ['MCTRL R5 (actuel)', false], ['MCTRL4K (actuel)', false], ['MCTRL610 (ancien)', true]]);
      v.vrai('VX400s : à compléter, grisé', fichesDe('Novastar', 'VX').find((x) => x.id === 'novastar-vx400s').aCompleter);
      const cherche = (q) => fiches.arbreProcesseurs(procs, { informations: infos, recherche: q }).map((m) => [m.marque, m.gammes.map((g) => [g.gamme, g.fiches.map((x) => x.id)])]);
      v.egal('recherche « vx1000 »', cherche('vx1000'), [['Novastar', [['VX', ['novastar-vx1000']], ['VX Pro', ['novastar-vx1000-pro']]]]]);
      v.egal('recherche sans espace ni tiret : « mctrl 4k », « MX40 », alias « MSD300-1 »', [cherche('mctrl 4k'), cherche('MX40'), cherche('msd300-1')],
        [[['Novastar', [['MCTRL', ['novastar-mctrl4k']]]]], [['Novastar', [['COEX', ['coex-mx40-pro']]]]], [['Novastar', [['MSD (cartes d\'envoi)', ['novastar-msd300']]]]]]);
    },
  },
  {
    id: 'R163',
    titre: 'Conseil « toutes marques du parc » : chaque marque à sa profondeur réseau par défaut (réglage du parc compris), la marque choisie à celle du formulaire ; le moins de processeurs, puis la plus petite capacité',
    etape: 'processeurs',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const procs = bp.processeurs.map((x) => calculs.resoudreFiche(x, bp.sources));
      const m = calculs.mur(DALLE_CAS_13, 12, 5);
      const evals = calculs.evaluerToutesMarques(m, DALLE_CAS_13, procs, { frequenceHz: 60, bits: 10 }, { famille: 'novastar', bitsParFamille: { brompton: 12 } });
      const bits = (id) => evals.find((e) => e.processeur.id === id).reglages.bits;
      v.egal('Novastar au formulaire (10 bits), Brompton au réglage du parc (12), Colorlight au défaut (8)', [bits('novastar-mctrl4k'), bits('brompton-s8'), bits('colorlight-s6f')], [10, 12, 8]);
      const conseil = calculs.processeurConseille(evals);
      const seuls = evals.filter((e) => e.nombre === 1);
      v.egal('un seul processeur, la plus petite capacité parmi ceux qui suffisent seuls', [conseil.nombre, conseil.processeur.pixelsMax], [1, Math.min(...seuls.map((e) => e.processeur.pixelsMax))]);
      v.vrai('plusieurs marques parmi les candidats', new Set(seuls.map((e) => e.processeur.famille)).size > 1);
    },
  },
  {
    id: 'R164',
    titre: 'Formats d\'entrée des fiches Novastar (PDF relus le 26/09/2026) : VX400 et VX600 en format personnalisé, VX Pro, et limite de 3840 × 1080 à 60 Hz en 10 ou 12 bits (VX16s, UHD Jr)',
    etape: 'processeurs',
    verifier(v, contexte) {
      const liaisons = liaisonsDeBase(contexte);
      const entree = (id, largeurPx, hauteurPx, liaison, bits = 8, frequenceHz = 60) => calculs.controleEntree(processeurDeBase(contexte, id), { largeurPx, hauteurPx, frequenceHz, liaison, bits }, liaisons);
      v.egal('VX16s, HDMI 2.0 : 3840 × 2160 en 8 bits, 3840 × 1080 au plus en 10 bits', [entree('novastar-vx16s', 3840, 2160, 'hdmi-2.0').ok, entree('novastar-vx16s', 3840, 2160, 'hdmi-2.0', 10).ok,
        entree('novastar-vx16s', 3840, 1080, 'hdmi-2.0', 10).ok], [true, false, true]);
      v.vrai('VX16s en 10 bits : refus chiffré avec la condition', /3840 × 1080/.test(entree('novastar-vx16s', 3840, 2160, 'hdmi-2.0', 12).refus ?? ''));
      v.egal('UHD Jr, DP 1.2 : 3840 × 2160 en 8 bits, pas en 10 bits', [entree('novastar-novapro-uhd-jr', 3840, 2160, 'dp-1.2').ok, entree('novastar-novapro-uhd-jr', 3840, 2160, 'dp-1.2', 10).ok], [true, false]);
      v.egal('VX400, DVI : 3840 × 648 et 800 × 2784 en format personnalisé ; pas 3840 × 700 ni 600 × 3840',
        [entree('novastar-vx400', 3840, 648, 'dvi-single').ok, entree('novastar-vx400', 800, 2784, 'dvi-single').ok, entree('novastar-vx400', 3840, 700, 'dvi-single').ok,
          entree('novastar-vx400', 600, 3840, 'dvi-single').ok], [true, true, false, false]);
      v.egal('la norme DVI seule refusait 3840 × 648', calculs.controleLiaison(liaisons.find((l) => l.id === 'dvi-single'), { largeurPx: 3840, hauteurPx: 648, frequenceHz: 60 }).ok, false);
      v.egal('VX400 Pro, HDMI 1.3 : 2048 px de large au plus, 8 bits seulement', [entree('novastar-vx400-pro', 2048, 1080, 'hdmi-1.3').ok, entree('novastar-vx400-pro', 2560, 1080, 'hdmi-1.3').ok,
        entree('novastar-vx400-pro', 1920, 1080, 'hdmi-1.3', 10).ok], [true, false, false]);
      v.vrai('VX400 Pro, HDMI 1.3 en 10 bits : refus avec la raison', /8 bits/.test(entree('novastar-vx400-pro', 1920, 1080, 'hdmi-1.3', 10).refus ?? ''));
      v.egal('VX400 Pro, HDMI 2.0 : 8192 × 1080 à 60 Hz, mais pas 1080 × 8192 (8188 au plus)', [entree('novastar-vx400-pro', 8192, 1080, 'hdmi-2.0').ok, entree('novastar-vx400-pro', 1080, 8192, 'hdmi-2.0').ok], [true, false]);
    },
  },
  {
    id: 'R165',
    titre: 'Colorlight, port de plus de 1280 px de haut : alerte « constructeur » sur S20 et S20F (fiche S20 V2.1) ; simple note d\'information sur les autres Colorlight 1G ; rien à 1280 px pile ni en 5G',
    etape: 'processeurs',
    verifier(v, contexte) {
      const texte = 'capacité réduite au-delà de 1280 px de haut, valeur non publiée : vérifie dans LEDVISION';
      const evalue = (id, rangees, dalle = DALLE_128X256) => calculs.evaluerProcesseur(calculs.mur(dalle, 4, rangees), dalle, processeurDeBase(contexte, id), COLORLIGHT_60_8);
      for (const id of ['colorlight-s20', 'colorlight-s20f']) {
        const p = processeurDeBase(contexte, id);
        v.egal(`${id} : 1280 px, source constructeur (fiche S20 V2.1)`, [p.hauteurReduitePortPx, p.sources.hauteurReduitePortPx.source.confiance, p.sources.hauteurReduitePortPx.source.court],
          [1280, 'constructeur', 'Fiche S20 V2.1']);
        const e = evalue(id, 6);
        v.vrai(`${id}, colonne de 1536 px : alerte avec la hauteur chargée et la fiche`, e.alertes.some((a) => a.includes(texte) && a.includes('1536 px') && a.includes('Fiche S20 V2.1')));
        v.egal(`${id} : aucune note en plus de l'alerte`, e.notes.filter((n) => n.includes('1280')).length, 0);
        const pile = evalue(id, 5);
        v.vrai(`${id}, colonne de 1280 px pile : rien`, !pile.alertes.some((a) => a.includes('1280')));
      }
      const x20 = evalue('colorlight-x20', 6);
      v.vrai('X20 : note d\'information, sans alerte', x20.notes.some((n) => n.includes('règle écrite sur la fiche S20, non confirmée pour ce modèle') && n.includes('1536 px'))
        && !x20.alertes.some((a) => a.includes('1280')));
      v.egal('X20 : pas de champ 1280 sur sa fiche', processeurDeBase(contexte, 'colorlight-x20').hauteurReduitePortPx, undefined);
      const z3 = evalue('colorlight-z3', 6, { ...DALLE_128X256, carteReceptionMarque: 'Colorlight', carteReceptionModele: 'HC5' });
      v.vrai('Z3 (ports 5G) : ni alerte ni note', z3.nombre === 1 && !z3.alertes.some((a) => a.includes('1280')) && !z3.notes.some((n) => n.includes('1280')));
      const novastar = calculs.evaluerProcesseur(calculs.mur(DALLE_128X256, 4, 6), DALLE_128X256, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      v.egal('Novastar : aucune note', novastar.notes.length, 0);
    },
  },
  {
    id: 'R166',
    titre: 'Colorlight, fibre : copie des ports (X20), H10FN2 conseillé au-delà de 100 m (H10FN, H10Fix en note) ; sans sortie fibre (X4m) : convertisseurs par port ; fibre seule : H10FN2 obligatoires (S20F) ou H2F (Z4F)',
    etape: 'processeurs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 12, 5);
      const x20 = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'colorlight-x20'), COLORLIGHT_60_8);
      v.vrai('X20 : fibre en copie, aucune capacité ajoutée', x20.alertes.some((a) => a.includes('Sorties fibre du Colorlight X20') && a.includes('aucune capacité ajoutée') && a.includes('20 ports au plus')));
      const cx20 = calculs.cablageData(m, DALLE_CAS_7, x20, { depart: 'bas-gauche', distanceRegieM: 150 });
      v.vrai('X20 à 150 m : fibre avec des H10FN2 au pied du mur, H10FN ou H10Fix possibles', cx20.variantes.find((x) => x.mode === 'colonnes').alertes.some((a) => a.includes('H10FN2 au pied du mur') && a.includes('H10FN ou H10Fix')));
      const x4m = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 6, 5), DALLE_CAS_7, processeurDeBase(contexte, 'colorlight-x4m'), COLORLIGHT_60_8);
      const cx4m = calculs.cablageData(calculs.mur(DALLE_CAS_7, 6, 5), DALLE_CAS_7, x4m, { depart: 'bas-gauche', distanceRegieM: 150 });
      v.vrai('X4m à 150 m : pas de sortie fibre, une paire de convertisseurs Ethernet-fibre par port', cx4m.variantes.find((x) => x.mode === 'colonnes').alertes.some((a) => a.includes('pas de sortie fibre') && a.includes('Ethernet-fibre')));
      v.vrai('X4m : pas de CVT310 (Novastar)', !cx4m.variantes.find((x) => x.mode === 'colonnes').alertes.some((a) => a.includes('CVT310')));
      // S20F : fibre seule, 2 fibres actives et 2 de secours ; 36 colonnes de 192 × 960 px : 3 colonnes par port, 12 ports.
      const grand = calculs.mur(DALLE_CAS_7, 36, 5);
      const s20f = processeurDeBase(contexte, 'colorlight-s20f');
      const e = calculs.evaluerProcesseur(grand, DALLE_CAS_7, s20f, COLORLIGHT_60_8);
      v.egal('S20F : 1 processeur, 12 ports, 2 H10FN2 obligatoires', [e.nombre, e.totaux.ports.colonnes, e.distributeurObligatoire, e.totaux.distributeurs.colonnes], [1, 12, true, 2]);
      const cs20f = calculs.cablageData(grand, DALLE_CAS_7, e, { depart: 'bas-gauche' });
      v.egal('S20F : ports nommés sur leur H10FN2', cs20f.variantes.find((x) => x.mode === 'colonnes').processeurs[0].ports[10].libelle, 'H10FN2 2, port 1');
      const r = calculs.evaluerProcesseur(grand, DALLE_CAS_7, s20f, { ...COLORLIGHT_60_8, redondance: true });
      v.egal('S20F en redondance : 20 ports principaux au plus, H10FN2 miroirs sur les fibres de secours', [s20f.portsRedondance, r.nombre, r.totaux.distributeurs.redondance], [20, 1, 4]);
      // Z4F : 2 fibres 2,5G, chacune vers un H2F de 2 ports.
      const z4f = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 8, 5), DALLE_CAS_7, processeurDeBase(contexte, 'colorlight-z4f'), COLORLIGHT_60_8);
      v.egal('Z4F : 3 ports, 2 H2F obligatoires', [z4f.totaux.ports.colonnes, z4f.distributeurObligatoire, z4f.totaux.distributeurs.colonnes, calculs.MODELES_DISTRIBUTEUR[z4f.processeur.distributeur]], [3, true, 2, 'H2F']);
    },
  },
  {
    id: 'R167',
    titre: 'Colorlight, ports 5G : capacité de la fiche (Z3 : 2,8 M et 2,1 M px), cartes de réception 5G seulement (HC5, RV5000), câble blindé Cat6 ou mieux, 80 m au plus (constructeur sur Z3 et Z8t, déduit de la fiche Z8t ailleurs)',
    etape: 'processeurs',
    verifier(v, contexte) {
      const z3 = processeurDeBase(contexte, 'colorlight-z3');
      const port = (bits) => calculs.entierInferieur(calculs.capacitePortProcesseur(z3, { frequenceHz: 60, bits }).capacite);
      v.egal('Z3 : 6 ports 5G, 2 800 000 px en 8 bits, 2 100 000 en 10 bits', [z3.ports, z3.typePorts, port(8), port(10)], [6, '5G', 2800000, 2100000]);
      const m = calculs.mur(DALLE_HC5, 10, 5);
      const e = calculs.evaluerProcesseur(m, DALLE_HC5, z3, COLORLIGHT_60_8);
      v.vrai('Z3 avec HC5 : calcul, alerte câble 80 m, fiche Z3', e.nombre === 1 && e.alertes.some((a) => a.includes('câble blindé Cat6 ou mieux, 80 m au plus') && a.includes('Fiche Z3 V2.0')));
      const c = calculs.cablageData(m, DALLE_HC5, e, { depart: 'bas-gauche', distanceRegieM: 75 });
      v.vrai('Z3 à 75 m (plus le trajet et 10 % de mou) : au-delà de 80 m', c.variantes.find((x) => x.mode === 'colonnes').alertes.some((a) => a.includes('au-delà de 80 m')));
      const i5a = calculs.evaluerProcesseur(m, DALLE_I5A, z3, COLORLIGHT_60_8);
      v.vrai('Z3 avec une carte i5A (1G) : refus, cartes 5G acceptées citées', i5a.nombre === null && /HC5, RV5000/.test(i5a.impossible ?? ''));
      const inconnue = calculs.evaluerProcesseur(m, DALLE_CAS_7, z3, COLORLIGHT_60_8);
      v.vrai('Z3, carte inconnue : alerte de compatibilité', inconnue.nombre === 1 && inconnue.manques.some((x) => x.champ === 'carteReceptionModele' && x.texte.includes('cartes 5G')));
      const z8t = calculs.evaluerProcesseur(m, DALLE_HC5, processeurDeBase(contexte, 'colorlight-z8t'), COLORLIGHT_60_8);
      v.vrai('Z8t, carte 4 × 5G : 80 m, fiche Z8t', z8t.alertes.some((a) => a.includes('80 m au plus') && a.includes('Fiche Z8t V2.1')));
      const x100 = calculs.evaluerProcesseur(m, DALLE_HC5, processeurDeBase(contexte, 'colorlight-x100-pro-4u'), { ...COLORLIGHT_60_8, carteSortie: 'x100-4x5g' });
      v.vrai('X100 Pro, carte 4 × 5G : 80 m déduit de la fiche Z8t', x100.alertes.some((a) => a.includes('80 m au plus') && a.includes('déduit de la fiche Z8t')));
      v.vrai('COEX inchangé : Cat6A, 100 m', calculs.evaluerProcesseur(calculs.mur(DALLE_CARTE_CA50E, 10, 5), DALLE_CARTE_CA50E, processeurDeBase(contexte, 'coex-cx40-pro'), NOVASTAR_60_8)
        .alertes.some((a) => a.includes('Cat6A obligatoire')));
    },
  },
  {
    id: 'R168',
    titre: 'X100 Pro et Z8t par cartes de sortie : 10 × 1G, 2 × 10G fibre (H10FN2), 4 × 5G (X100 Pro : ancienne version de fiche) ; pixels plafonnés par l\'appareil ; carte par défaut selon la carte de réception des dalles',
    etape: 'processeurs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_I5A, 36, 5);
      const x4u = processeurDeBase(contexte, 'colorlight-x100-pro-4u');
      const e1 = calculs.evaluerProcesseur(m, DALLE_I5A, x4u, COLORLIGHT_60_8);
      v.egal('4U, carte i5A : cartes 10 × 1G par défaut, 40 ports, 26 M px (4 × 6,55 M plafonnés par l\'appareil)',
        [e1.processeur.carteSortie.id, e1.processeur.ports, e1.processeur.pixelsMax, e1.configuration], ['x100-10x1g', 40, 26000000, 'X100 Pro-4U + 2 cartes 10×1G']);
      const e2 = calculs.evaluerProcesseur(m, DALLE_I5A, x4u, { ...COLORLIGHT_60_8, carteSortie: 'x100-2x10g' });
      v.egal('4U, cartes fibre 2 × 10G : un H10FN2 par carte, obligatoire', [e2.distributeurObligatoire, e2.configuration], [true, 'X100 Pro-4U + 2 cartes 2×10G + 2 H10FN2']);
      const e3 = calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 36, 5), DALLE_HC5, x4u, { ...COLORLIGHT_60_8, carteSortie: 'x100-4x5g' });
      v.egal('4U, cartes 4 × 5G : 2 ports actifs par carte, 2 940 000 px par port, 4 × 5,89 M px',
        [e3.processeur.ports, calculs.entierInferieur(e3.capacite), e3.processeur.pixelsMax, e3.configuration], [8, 2940000, 23560000, 'X100 Pro-4U + 2 cartes 4×5G']);
      v.vrai('4U, cartes 4 × 5G : ancienne version de fiche signalée', e3.alertes.some((a) => a.includes('ancienne version de fiche')));
      const auto5G = calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 36, 5), DALLE_HC5, x4u, COLORLIGHT_60_8);
      v.egal('4U, carte HC5 et choix par défaut : cartes 4 × 5G', auto5G.processeur.carteSortie.id, 'x100-4x5g');
      const x7u = calculs.evaluerProcesseur(m, DALLE_I5A, processeurDeBase(contexte, 'colorlight-x100-pro-7u'), COLORLIGHT_60_8);
      v.egal('7U : 8 cartes, 80 ports, 52 M px', [x7u.processeur.ports, x7u.processeur.pixelsMax], [80, 52000000]);
      const z8t = processeurDeBase(contexte, 'colorlight-z8t');
      const z1 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 36, 5), DALLE_CAS_7, z8t, COLORLIGHT_60_8);
      v.egal('Z8t, carte de réception inconnue : cartes 4 × 5G par défaut, 8 ports', [z1.processeur.carteSortie.id, z1.processeur.ports], ['z8t-4x5g', 8]);
      v.vrai('Z8t, carte inconnue : alerte qui propose la carte fibre', z1.alertes.some((a) => a.includes('Carte de réception inconnue') && a.includes('4×10G')));
      const z2 = calculs.evaluerProcesseur(m, DALLE_I5A, z8t, COLORLIGHT_60_8);
      v.egal('Z8t, carte i5A (1G) : cartes fibre 4 × 10G, 40 ports par H10FN2, 23,59 M px (plafond de l\'appareil)',
        [z2.processeur.carteSortie.id, z2.processeur.ports, z2.processeur.pixelsMax, z2.distributeurObligatoire, z2.configuration],
        ['z8t-4x10g', 40, 23590000, true, 'Z8t + 1 carte 4×10G + 2 H10FN2']);
      v.egal('Z8t : 16 384 × 8192 pour l\'appareil (fiche), zone de 8192 px par carte', [z2.processeur.largeurMaxPx, z2.processeur.hauteurMaxPx, z2.controles.cartes.zone.largeurPx], [16384, 8192, 8192]);
    },
  },
  {
    id: 'R169',
    titre: 'Colorlight, périmètre : fiche officielle ou copie calculable ; page revendeur seule calculable en confiance « revendeur » si elle donne ports, capacité totale, largeur et hauteur (X4e, Z4, X8E), sinon fiche d\'information (S6, Z6 Pro)',
    etape: 'processeurs',
    verifier(v, contexte) {
      for (const id of ['colorlight-x4e', 'colorlight-z4', 'colorlight-x8e']) {
        const p = processeurDeBase(contexte, id);
        v.egal(`${id} : calculable`, calculs.champsManquants(p), []);
        v.egal(`${id} : ports et capacité totale en confiance revendeur`, [p.sources.ports.source.confiance, p.sources.pixelsMax.source.confiance], ['revendeur', 'revendeur']);
      }
      const base = baseProcesseurs(contexte);
      for (const id of ['colorlight-s6', 'colorlight-z6-pro']) {
        const f = base.informations.find((x) => x.id === id);
        v.egal(`${id} : fiche d'information`, f?.statut, 'information');
        v.vrai(`${id} : absent des processeurs calculables`, !base.processeurs.some((x) => x.id === id));
      }
      for (const id of ['colorlight-x16e', 'colorlight-z6']) {
        v.egal(`${id} : complété par sa fiche (copie)`, calculs.champsManquants(processeurDeBase(contexte, id)), []);
      }
    },
  },
  {
    id: 'R170',
    titre: 'Colorlight, 10 bits : × 0,75 quand la fiche le montre (487 500, la valeur arrondie de la fiche visible), 5G selon la fiche, sinon 325 000 « déduit, à confirmer »',
    etape: 'processeurs',
    verifier(v, contexte) {
      const port = (id, bits = 10) => calculs.capacitePortProcesseur(processeurDeBase(contexte, id), { frequenceHz: 60, bits });
      for (const id of ['colorlight-vx6', 'colorlight-vx10', 'colorlight-z4-pro', 'colorlight-z5', 'colorlight-x100-pro-4u']) {
        v.egal(`${id} : 487 500 en 10 bits, de la fiche`, [calculs.entierInferieur(port(id).capacite), port(id).deduit], [487500, false]);
      }
      const conflits = calculs.valeursEnConflit(baseProcesseurs(contexte).processeurs, baseProcesseurs(contexte).sources);
      const vx6 = conflits.find((x) => x.id === 'colorlight-vx6' && x.champ === 'capacitePort60Hz10bits');
      v.egal('VX6 : 490 000 de la fiche, arrondi, visible', vx6?.autres.map((a) => a.valeur), [490000]);
      v.egal('Z3 (5G) : 2 100 000', calculs.entierInferieur(port('colorlight-z3').capacite), 2100000);
      v.egal('X4m : 325 000, déduit', [calculs.entierInferieur(port('colorlight-x4m').capacite), port('colorlight-x4m').deduit], [325000, true]);
    },
  },
  {
    id: 'R171',
    titre: 'Colorlight, fibres de secours : redondance par convertisseurs miroirs (S20F, cartes fibre du X100 Pro) ; ports principaux comptés, cartes non doublées',
    etape: 'processeurs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_I5A, 36, 5);
      const e = calculs.evaluerProcesseur(m, DALLE_I5A, processeurDeBase(contexte, 'colorlight-x100-pro-4u'), { ...COLORLIGHT_60_8, carteSortie: 'x100-2x10g', redondance: true });
      v.egal('X100 Pro-4U, cartes 2 × 10G en redondance : 18 ports principaux (colonnes paires), 2 cartes, 2 H10FN2 et 2 miroirs',
        [e.totaux.ports.colonnes, e.totaux.cartesSortie, e.configuration], [18, 2, 'X100 Pro-4U + 2 cartes 2×10G + 4 H10FN2']);
      const s20f = processeurDeBase(contexte, 'colorlight-s20f');
      v.egal('S20F : secours par les fibres FIBER 1 et 2 BACKUP, déduit', [s20f.portsRedondance, s20f.sources.portsRedondance.source.confiance], [20, 'déduit']);
    },
  },
  {
    id: 'R172',
    titre: 'Colorlight, 120 et 240 Hz : valeur de la fiche quand elle existe (320 000 et 160 000 px par port 1G en 8 bits), sinon 320 000 et 160 000 « déduit des fiches X8m, X12m… » ; entre deux fréquences publiées, la plus défavorable des deux proportions',
    etape: 'processeurs',
    verifier(v, contexte) {
      const port = (id, frequenceHz, bits = 8, reglages = {}) => calculs.capacitePortProcesseur(processeurDeBase(contexte, id), { frequenceHz, bits, ...reglages });
      const e = (x) => [calculs.entierInferieur(x.capacite), x.deduit];
      v.egal('X8m, fiche : 320 000 à 120 Hz, 160 000 à 240 Hz, non déduits', [e(port('colorlight-x8m', 120)), e(port('colorlight-x8m', 240))], [[320000, false], [160000, false]]);
      v.egal('VX6, fiche en 10 bits : 240 000 à 120 Hz, 120 000 à 240 Hz', [e(port('colorlight-vx6', 120, 10)), e(port('colorlight-vx6', 240, 10))], [[240000, false], [120000, false]]);
      const x6 = port('colorlight-x6', 120);
      v.egal('X6, sans valeur publiée : 320 000 à 120 Hz, déduit', e(x6), [320000, true]);
      v.vrai('X6 : source « déduit des fiches X8m, X12m… » citée', /déduit des fiches X8m, X12m/.test(x6.formule + x6.notes.join(' ')));
      v.egal('X6 à 240 Hz : 160 000, déduit', e(port('colorlight-x6', 240)), [160000, true]);
      v.egal('X6 à 100 Hz : la plus défavorable de 650 000 × 60/100 et 320 000 × 120/100 (384 000)', e(port('colorlight-x6', 100)), [384000, true]);
      v.egal('X6 à 50 Hz : proportionnel depuis 60 Hz (780 000)', e(port('colorlight-x6', 50)), [780000, true]);
      v.vrai('50 Hz : note « capacité à 50 Hz déduite du débit, aucune fiche Colorlight ne la publie »',
        port('colorlight-x6', 50).notes.some((n) => n.includes('capacité à 50 Hz déduite du débit, aucune fiche Colorlight ne la publie')));
      v.egal('X6 à 60 Hz : inchangé, 650 000', e(port('colorlight-x6', 60)), [650000, false]);
      v.egal('X6 en 10 bits (moitié) : 160 000 à 120 Hz, 80 000 à 240 Hz, déduits', [e(port('colorlight-x6', 120, 10)), e(port('colorlight-x6', 240, 10))], [[160000, true], [80000, true]]);
      v.egal('Z4 Pro, 10 bits : 240 000 à 120 Hz (fiche), 120 000 à 240 Hz (déduit des fiches VX6…)', [e(port('colorlight-z4-pro', 120, 10)), e(port('colorlight-z4-pro', 240, 10))], [[240000, false], [120000, true]]);
      v.egal('Z3 (5G), fiche : 1 400 000 à 120 Hz en 8 bits, 520 000 à 240 Hz en 10 bits (sous la proportion, 525 000)',
        [e(port('colorlight-z3', 120)), e(port('colorlight-z3', 240, 10))], [[1400000, false], [520000, false]]);
      const z8t = (f, bits = 8) => calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 4, 2), DALLE_HC5, processeurDeBase(contexte, 'colorlight-z8t'), { frequenceHz: f, bits });
      v.egal('Z8t, carte 4 × 5G : 1 470 000 à 120 Hz (fiche), 735 000 à 240 Hz (proportionnel depuis 120 Hz, déduit)',
        [[calculs.entierInferieur(z8t(120).capacite), z8t(120).capaciteDeduite], [calculs.entierInferieur(z8t(240).capacite), z8t(240).capaciteDeduite]], [[1470000, false], [735000, true]]);
      v.egal('Novastar inchangé (formule) : MCTRL4K à 120 Hz, 325 000', calculs.entierInferieur(calculs.capacitePortProcesseur(processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 120, bits: 8 }).capacite), 325000);
    },
  },
  {
    id: 'R173',
    titre: 'Cartes de sortie à zone limitée (Z8t 8192 px, série H 10 752 px…) : la limite vaut pour la zone de chaque carte, le mur se répartit entre les cartes comme entre les ports ; un appareil de plus seulement quand ses cartes ne suffisent pas',
    etape: 'processeurs',
    verifier(v, contexte) {
      const z8t = processeurDeBase(contexte, 'colorlight-z8t');
      // 50 colonnes de 192 px (9600 px) sur 5 rangées : 15 colonnes par port 5G, 4 ports ; 2 ports par carte (45 colonnes = 8640 px > 8192).
      const e1 = calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 50, 5), DALLE_HC5, z8t, COLORLIGHT_60_8);
      v.egal('Z8t, mur de 9600 px : 1 appareil, 4 ports, 2 cartes 4×5G', [e1.nombre, e1.totaux.ports.colonnes, e1.totaux.cartesSortie, e1.configuration], [1, 4, 2, 'Z8t + 2 cartes 4×5G']);
      v.egal('Z8t : contrôle des cartes, 2 sur 2', [e1.controles.cartes.valeur, e1.controles.cartes.limite, e1.controles.cartes.depasse], [2, 2, false]);
      const e2 = calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 90, 5), DALLE_HC5, z8t, COLORLIGHT_60_8);
      v.egal('Z8t, mur de 17 280 px (au-delà de 16 384) : 2 appareils', e2.nombre, 2);
      // 45 colonnes, 1 rangée : un port 5G prendrait 79 colonnes (15 168 px) ; il reste dans la zone de sa carte (42 colonnes, 8064 px).
      const e3 = calculs.evaluerProcesseur(calculs.mur(DALLE_HC5, 45, 1), DALLE_HC5, z8t, COLORLIGHT_60_8);
      v.egal('Z8t : un port ne dépasse pas la zone de sa carte (42 colonnes au plus)', [e3.nombre, e3.global.colonnes.colonnesParPort, e3.totaux.ports.colonnes], [1, 42, 2]);
      // Carte fibre 4×10G : 17 colonnes de 192 px par port 1G (3264 px), 2 ports par zone de 8192 px ; 68 colonnes, 4 ports, 2 cartes, un H10FN2 par carte.
      const e4 = calculs.evaluerProcesseur(calculs.mur(DALLE_I5A, 68, 1), DALLE_I5A, z8t, COLORLIGHT_60_8);
      v.egal('Z8t, cartes fibre : convertisseurs comptés carte par carte', [e4.nombre, e4.totaux.ports.colonnes, e4.configuration], [1, 4, 'Z8t + 2 cartes 4×10G + 2 H10FN2']);
      // Série H : H5, 3 cartes H_20xRJ45 de 10 752 px ; 60 colonnes de 192 px (11 520 px), 3 colonnes par port, 20 ports.
      const h5 = processeurDeBase(contexte, 'novastar-h5');
      const h = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 60, 5), DALLE_CAS_7, h5, NOVASTAR_60_8);
      v.egal('H5, mur de 11 520 px : 1 châssis, 2 cartes (18 ports dans 10 368 px, puis 2)', [h.nombre, h.totaux.ports.colonnes, h.totaux.cartesSortie, h.configuration],
        [1, 20, 2, 'H5 + 2 cartes H_20xRJ45']);
      v.egal('H5 : largeur de l\'appareil, 3 cartes de 10 752 px côte à côte', h.controles.largeur.limite, 32256);
      const h2 = calculs.evaluerProcesseur(calculs.mur(DALLE_CAS_7, 170, 1), DALLE_CAS_7, processeurDeBase(contexte, 'novastar-h2'), NOVASTAR_60_8);
      v.vrai('H2, mur de 32 640 px (au-delà de 2 × 10 752) : plusieurs châssis, alerte des cartes', h2.nombre >= 2 && h2.alertes.some((a) => a.includes('cartes H_20xRJ45') && /10.752 × 10.752 px/.test(a)));
    },
  },
];

// Message de l'erreur levée par `f`, ou chaîne vide.
function messageErreur(f) {
  try {
    f();
  } catch (erreur) {
    return erreur.message;
  }
  return '';
}

// Colonnes touchées par un trajet.
function colonnesDe(ids) {
  return [...new Set(ids.map((id) => position(id)[0]))];
}

// Chaque colonne entière dans un seul trajet (port ou ligne) : aucune colonne coupée entre deux trajets.
function colonnesEntieres(trajets, nbRangees) {
  const proprietaire = new Map();
  for (const [i, t] of trajets.entries()) {
    for (const id of t.dalles) {
      const [c] = position(id);
      if (proprietaire.has(c) && proprietaire.get(c) !== i) return false;
      proprietaire.set(c, i);
    }
  }
  return trajets.every((t) => colonnesDe(t.dalles).every((c) => t.dalles.filter((id) => position(id)[0] === c).length === nbRangees));
}

// Chemin fait de segments verticaux ou horizontaux seulement.
function droit(chemin) {
  return chemin.every((p, i) => i === 0 || p[0] === chemin[i - 1][0] || p[1] === chemin[i - 1][1]);
}

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
