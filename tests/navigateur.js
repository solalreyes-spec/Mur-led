// Contrôles qui demandent un navigateur (canvas, images PNG) : exécutés par tests.html seulement,
// pas par node --test. Ils vérifient les exports d'image de l'étape 8c.

import * as calculs from '../src/calculs.js';
import { pixelMapEnCanvas, canvasEnPng, schemaEnPng, enregistrer, TEINTES } from '../src/export.js';
import { geometrieSchema, trajetsSchema, construireSvg, PALETTE_EXPORT } from '../src/dessin-schema.js';
import { processeurDeBase, baseProcesseurs } from './base.js';
import { DALLE_CAS_13 } from './dalles-fictives.js';

const DALLE_192 = { id: 'fictive-192', nom: 'Dalle 500 mm, 192 px', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 };

// Couleur d'un pixel d'une image décodée.
function pixel(image, x, y) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d');
  ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const decoder = async (blob) => createImageBitmap(blob);

export const NAVIGATEUR = [
  {
    id: 'N1',
    titre: 'PNG de la pixel map : exactement la taille du canvas, 1 pixel du fichier pour 1 pixel du mur',
    etape: '8c',
    async verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
      const zone = calculs.pixelMap(m, DALLE_CAS_13, e).canvas[1];
      const blob = await canvasEnPng(pixelMapEnCanvas(zone, {}));
      v.egal('fichier PNG', blob.type, 'image/png');
      const image = await decoder(blob);
      v.egal('taille du PNG', [image.width, image.height], [1152, 1152]);
      v.egal('pixel 191 : dernier de C7 R1', pixel(image, 191, 10), rgb(TEINTES[0]));
      v.egal('pixel 192 : premier de C8 R1', pixel(image, 192, 10), rgb(TEINTES[1]));
      v.egal('pixel (0, 192) : premier de C7 R2', pixel(image, 0, 192), rgb(TEINTES[2]));
    },
  },
  {
    id: 'N2',
    titre: 'Plus grand canvas de la base : une seule image, à sa taille exacte, mire comprise',
    etape: '8c',
    async verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const actifs = base.processeurs.map((p) => calculs.resoudreFiche(p, base.sources)).filter((p) => calculs.champsManquants(p).length === 0);
      const plusGrand = actifs.reduce((a, b) => (b.pixelsMax > a.pixelsMax ? b : a));
      const colonnes = Math.floor(Math.min(plusGrand.largeurMaxPx, 7680) / 192);
      const lignes = Math.floor(plusGrand.pixelsMax / (colonnes * 192 * 192));
      const zone = calculs.pixelMap(calculs.mur(DALLE_192, colonnes, lignes), DALLE_192).mur;
      v.egal(`${plusGrand.nom} : canvas de ${zone.largeurPx} × ${zone.hauteurPx} px, en une seule image`,
        [zone.largeurPx * zone.hauteurPx <= plusGrand.pixelsMax, calculs.tuilesImage(zone.largeurPx, zone.hauteurPx).length], [true, 1]);
      const image = await decoder(await canvasEnPng(pixelMapEnCanvas(zone, { grille: true, cercles: true, diagonales: true, numeros: true })));
      v.egal('taille du PNG', [image.width, image.height], [zone.largeurPx, zone.hauteurPx]);
    },
  },
  {
    id: 'N3',
    titre: 'Au-delà de 16,7 M px : export en tuiles, chacune exacte et sous la limite',
    etape: '8c',
    async verifier(v) {
      const zone = calculs.pixelMap(calculs.mur(DALLE_192, 40, 22), DALLE_192).mur;
      let refus = '';
      try {
        pixelMapEnCanvas(zone, {});
      } catch (erreur) {
        refus = erreur.message;
      }
      v.vrai(`image entière de ${zone.largeurPx} × ${zone.hauteurPx} px refusée : trop grande pour un iPhone`, /tuiles/.test(refus));
      const tuiles = calculs.tuilesImage(zone.largeurPx, zone.hauteurPx);
      v.vrai('plusieurs tuiles', tuiles.length > 1);
      for (const [i, t] of tuiles.entries()) {
        const image = await decoder(await canvasEnPng(pixelMapEnCanvas(zone, {}, t)));
        v.egal(`tuile ${i + 1} : taille exacte`, [image.width, image.height], [t.largeurPx, t.hauteurPx]);
        const dalle = zone.dalles.find((d) => t.x >= d.x[0] && t.x <= d.x[1] && t.y >= d.y[0] && t.y <= d.y[1]);
        const attendu = TEINTES[((dalle.colonne - 1) % 2) + 2 * ((dalle.rangee - 1) % 2)];
        v.egal(`tuile ${i + 1} : son premier pixel est celui du mur en (${t.x}, ${t.y})`, pixel(image, 0, 0), rgb(attendu));
      }
    },
  },
  {
    id: 'N4',
    titre: 'Schéma de câblage en image : PNG pour le chef de projet',
    etape: '8c',
    async verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
      const data = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche' });
      const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
      const geo = geometrieSchema(vue, m, DALLE_CAS_13, calculs.pixelMap(m, DALLE_CAS_13, e));
      const trajets = trajetsSchema(vue, data.variantes.find((x) => x.mode === data.conseil), null, null);
      const { svg } = construireSvg({ geo, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000 });
      const blob = await schemaEnPng(svg, { largeurPx: 2000, titre: 'Mur LED, câblage data', lignes: ['CÂBLAGE', 'Data : rectangles NovaLCT, départ en haut à gauche'] });
      v.egal('fichier PNG', blob.type, 'image/png');
      const image = await decoder(blob);
      v.egal('largeur de l\'image', image.width, 2000);
      v.vrai('hauteur : le dessin plus le texte', image.height > 1000 && image.width * image.height <= calculs.SURFACE_MAX_IMAGE);
      v.egal('fond blanc, lisible à l\'impression', pixel(image, 2, 2), [255, 255, 255]);
    },
  },  {
    id: 'N5',
    titre: 'Enregistrer une image : partage iOS d\'abord, téléchargement en secours',
    etape: '8c',
    async verifier(v) {
      const blob = await canvasEnPng(pixelMapEnCanvas(calculs.pixelMap(calculs.mur(DALLE_192, 2, 1), DALLE_192).mur, {}));
      // Faux navigateur et faux téléchargement : rien n'est vraiment partagé ni téléchargé pendant le test.
      const essai = async (share) => {
        const partages = [];
        const telecharges = [];
        const nav = { canShare: ({ files }) => files.every((f) => f instanceof File), share: (donnees) => { partages.push(donnees); return share(); } };
        const resultat = await enregistrer(blob, 'mur-led-pixel-map.png', { nav, telecharger: (b, nom) => telecharges.push(nom) });
        return { resultat, partages, telecharges };
      };
      const ok = await essai(() => Promise.resolve());
      v.egal('partage possible : feuille de partage, sans téléchargement', [ok.resultat, ok.telecharges.length], ['partage', 0]);
      const f = ok.partages[0]?.files?.[0];
      v.egal('le partage reçoit le PNG, avec son nom', [f?.name, f?.type, f?.size], ['mur-led-pixel-map.png', 'image/png', blob.size]);
      const annule = await essai(() => Promise.reject(new DOMException('annulé', 'AbortError')));
      v.egal('partage annulé par l\'utilisateur : rien d\'autre', [annule.resultat, annule.telecharges.length], ['annule', 0]);
      const refuse = await essai(() => Promise.reject(new DOMException('refusé', 'NotAllowedError')));
      v.egal('partage refusé par le navigateur : téléchargement en secours', [refuse.resultat, refuse.telecharges], ['telechargement', ['mur-led-pixel-map.png']]);
      const sans = await enregistrer(blob, 'sans-partage.png', { nav: {}, telecharger: () => {} });
      v.egal('navigateur sans partage : téléchargement', sans, 'telechargement');
    },
  },
];
