// Contrôles qui demandent un navigateur (canvas, images PNG) : exécutés par tests.html seulement,
// pas par node --test. Ils vérifient les exports d'image de l'étape 8c.

import * as calculs from '../src/calculs.js';
import { pixelMapEnCanvas, canvasEnPng, schemaEnPng, enregistrer, TEINTES } from '../src/export.js';
import { geometrieSchema, trajetsSchema, construireSvg, repereSchema, PALETTE_EXPORT } from '../src/dessin-schema.js';
import { processeurDeBase, baseProcesseurs, dalleDeBase } from './base.js';
import { DALLE_CAS_13 } from './dalles-fictives.js';
import { versionCache, empreinteDeclaree, empreinteCache } from './fichiers.js';
import { VERSIONS_CACHE } from './versions-cache.js';
import { creerStockage } from '../src/stockage.js';

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
    titre: 'Plus grand canvas de la base : en une seule image quand il tient (VX2000 Pro, par la capacité de l\'appareil ; à égalité avec X20, VX20, X20m et Z5, le premier de la base), en tuiles exactes au-delà (MX6000 Pro), mire comprise',
    etape: '8c',
    async verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      // Série H exclue : processeur par cartes d'envoi, ses pixels maxi dépendent des cartes installées (le H20 serait le plus grand).
      const actifs = base.processeurs.map((p) => calculs.resoudreFiche(p, base.sources))
        .filter((p) => !p.cartesSortieLED && calculs.champsManquants(p).length === 0);
      const mire = { grille: true, cercles: true, diagonales: true, numeros: true };
      // Le plus grand canvas qui tient en une seule image (16 777 216 px au plus), comparé par la capacité de l'appareil :
      // min(ports × capacité d'un port à 60 Hz, à la profondeur par défaut de la marque ; pixels maxi de la fiche).
      const capaciteAppareil = (p) => Math.min(p.ports * calculs.capacitePortProcesseur(p, { frequenceHz: 60 }).capacite, p.pixelsMax);
      const unique = actifs.map((p) => ({ ...p, capaciteAppareil: capaciteAppareil(p) }))
        .filter((p) => Number.isFinite(p.capaciteAppareil) && p.capaciteAppareil <= calculs.SURFACE_MAX_IMAGE)
        .reduce((a, b) => (b.capaciteAppareil > a.capaciteAppareil ? b : a));
      const colonnes = Math.floor(Math.min(unique.largeurMaxPx, 7680) / 192);
      const lignes = Math.floor(unique.capaciteAppareil / (colonnes * 192 * 192));
      const zone = calculs.pixelMap(calculs.mur(DALLE_192, colonnes, lignes), DALLE_192).mur;
      v.egal(`${unique.nom} : canvas de ${zone.largeurPx} × ${zone.hauteurPx} px, en une seule image`,
        [unique.id, zone.largeurPx * zone.hauteurPx <= unique.capaciteAppareil, calculs.tuilesImage(zone.largeurPx, zone.hauteurPx).length], ['novastar-vx2000-pro', true, 1]);
      const image = await decoder(await canvasEnPng(pixelMapEnCanvas(zone, mire)));
      v.egal('taille du PNG', [image.width, image.height], [zone.largeurPx, zone.hauteurPx]);
      // Le plus grand canvas de la base, à ses limites (largeur, hauteur, pixels) : en tuiles, chacune exacte.
      const plusGrand = actifs.reduce((a, b) => (b.pixelsMax > a.pixelsMax ? b : a));
      const colonnesG = Math.floor(plusGrand.largeurMaxPx / 192);
      const lignesG = Math.floor(Math.min(plusGrand.hauteurMaxPx, plusGrand.pixelsMax / (colonnesG * 192)) / 192);
      const zoneG = calculs.pixelMap(calculs.mur(DALLE_192, colonnesG, lignesG), DALLE_192).mur;
      const tuiles = calculs.tuilesImage(zoneG.largeurPx, zoneG.hauteurPx);
      v.egal(`${plusGrand.nom} : canvas de ${zoneG.largeurPx} × ${zoneG.hauteurPx} px, en ${tuiles.length} tuiles sous la limite`,
        [plusGrand.id, zoneG.largeurPx * zoneG.hauteurPx <= plusGrand.pixelsMax, tuiles.length > 1, tuiles.every((x) => x.largeurPx * x.hauteurPx <= calculs.SURFACE_MAX_IMAGE)],
        ['coex-mx6000-pro', true, true, true]);
      const premiere = await decoder(await canvasEnPng(pixelMapEnCanvas(zoneG, mire, tuiles[0])));
      v.egal('première tuile à sa taille exacte', [premiere.width, premiere.height], [tuiles[0].largeurPx, tuiles[0].hauteurPx]);
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
  },  {
    id: 'N6',
    titre: 'Schéma : deux couleurs (principal et secours), fonds alternés par port, secours jamais en diagonale, départs au bon bord',
    etape: '8b',
    async verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 12, 6);
      const e = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60, bits: 10, redondance: true, departCablage: 'bas-gauche' });
      const data = calculs.cablageData(m, bp2, e, { depart: 'bas-gauche' });
      const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
      const geo = geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, e));
      const trajets = trajetsSchema(vue, data.variantes.find((x) => x.mode === data.conseil), null, null);
      const { svg } = construireSvg({ geo, trajets, coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT });
      const couleurs = new Set([...svg.querySelectorAll('.trajet')].map((x) => x.style.stroke));
      v.egal('deux couleurs de câbles : principal et secours', couleurs.size, 2);
      const secours = [...svg.querySelectorAll('.secours')];
      v.vrai('un retour de secours par port', secours.length === trajets.length);
      v.vrai('retours de secours : jamais en diagonale', secours.every((l) => l.getAttribute('x1') === l.getAttribute('x2') || l.getAttribute('y1') === l.getAttribute('y2')));
      const fond = (id) => svg.querySelector(`[data-dalle="${id}"] rect`).style.fill;
      v.vrai('fonds alternés : deux ports voisins en gris différents, un même port en un seul gris', fond('C1 R1') === fond('C2 R1') && fond('C1 R1') !== fond('C3 R1'));
      v.vrai('stack : chaque départ sous le mur', [...svg.querySelectorAll('.depart')].every((c) => Number(c.getAttribute('cy')) > m.hauteurMm));
    },
  },
  {
    id: 'N7',
    titre: 'Schéma : noms des dalles dans leur coin haut gauche, hors des traits ; numéro au bout de chaque retour de secours ; repère du processeur ou de l\'armoire au coin de départ',
    etape: '8b',
    async verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const m = calculs.mur(bp2, 12, 6);
      const evaluer = (bits) => calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits, redondance: true, departCablage: 'bas-gauche' });
      const e10 = evaluer(10);
      const dessiner = (e, vue, coin, repere = null) => {
        const data = calculs.cablageData(m, bp2, e, { depart: coin, distanceRegieM: 20 });
        const vd = data.variantes.find((x) => x.mode === data.conseil);
        const { svg } = construireSvg({
          geo: geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, e)), trajets: trajetsSchema(vue, vd, null, null), coin, blocs: [],
          palette: PALETTE_EXPORT, largeurPx: 2000, repere,
        });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        return { svg, vd };
      };
      const physique = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };

      // 1. Chaque nom de dalle reste dans sa dalle, hors de la croix où passent les traits (centre de la dalle).
      for (const [nom, vue] of [['vue physique', physique], ['vue pixels', { ...physique, vue: 'pixels' }]]) {
        const { svg } = dessiner(e10, vue, 'bas-gauche');
        const tuiles = [...svg.querySelectorAll('[data-dalle]')];
        const rects = tuiles.map((g) => g.querySelector('rect'));
        const cote = Math.min(...rects.map((r) => Math.min(Number(r.getAttribute('width')), Number(r.getAttribute('height')))));
        const demiTrait = cote * 0.07;
        const fautes = tuiles.filter((g) => {
          const r = g.querySelector('rect');
          const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a)));
          return [...g.querySelectorAll('.etiquette-dalle')].some((t) => {
            const b = t.getBBox();
            const dedans = b.x >= x && b.y >= y && b.x + b.width <= x + w && b.y + b.height <= y + h;
            const surVerticale = b.x < x + w / 2 + demiTrait && b.x + b.width > x + w / 2 - demiTrait;
            const surHorizontale = b.y < y + h / 2 + demiTrait && b.y + b.height > y + h / 2 - demiTrait;
            return !dedans || surVerticale || surHorizontale;
          });
        });
        v.egal(`${nom} : noms des dalles dans leur dalle, jamais sous un trait`, fautes.map((g) => g.dataset.dalle), []);
        const premier = tuiles[0].querySelector('.etiquette-dalle').getBBox();
        const r0 = rects[0];
        v.vrai(`${nom} : nom de C1 R1 dans son coin haut gauche`,
          premier.x < Number(r0.getAttribute('x')) + Number(r0.getAttribute('width')) / 2 && premier.y < Number(r0.getAttribute('y')) + Number(r0.getAttribute('height')) / 2);
        svg.remove();
      }

      // 2. Numéro au bout de chaque retour de secours, comme les départs ; jamais sur un départ.
      const disques = (svg, classe) => [...svg.querySelectorAll(classe)].map((c) => ['cx', 'cy', 'r'].map((a) => Number(c.getAttribute(a))));
      const chevauche = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < a[2] + b[2];
      for (const [nom, e] of [['2 colonnes par port (10 bits)', e10], ['1 colonne par port (12 bits)', evaluer(12)]]) {
        const { svg, vd } = dessiner(e, physique, 'bas-gauche');
        const attendus = vd.processeurs.flatMap((p) => p.ports.map((q) => `${p.numero}.${q.secours.numero}`));
        v.egal(`${nom} : un numéro par retour de secours, celui du port de secours`, [...svg.querySelectorAll('.numero-secours')].map((t) => t.textContent), attendus);
        const secours = disques(svg, '.bout-secours');
        const departs = disques(svg, '.depart');
        v.vrai(`${nom} : bouts de secours sous le mur en stack`, secours.length === attendus.length && secours.every((c) => c[1] > m.hauteurMm));
        v.vrai(`${nom} : aucun numéro de secours sur un départ`, secours.every((s) => departs.every((d) => !chevauche(s, d))));
        svg.remove();
      }
      v.egal('BP2 V2 sur S8 en redondance, 10 bits : secours 1.2, 1.4, 1.6 puis 2.2, 2.4, 2.6', dessiner(e10, physique, 'bas-gauche').vd.processeurs
        .flatMap((p) => p.ports.map((q) => `${p.numero}.${q.secours.numero}`)), ['1.2', '1.4', '1.6', '2.2', '2.4', '2.6']);
      document.querySelectorAll('body > svg').forEach((s) => s.remove());

      // 3. Repère du processeur (ou de l'armoire) au coin de départ : sous le mur en stack, au-dessus en accroche.
      v.egal('repère data : processeurs et distance de la régie', repereSchema('data', { evaluation: e10, distanceM: 20 }), { lignes: ['2 × S8', 'régie à 20 m'] });
      v.egal('repère data sans distance', repereSchema('data', { evaluation: e10, distanceM: null }), { lignes: ['2 × S8'] });
      v.egal('repère élec : armoire', repereSchema('elec', { distanceM: 15 }), { lignes: ['Armoire', 'à 15 m'] });
      const sx40 = calculs.evaluerProcesseur(calculs.mur(bp2, 12, 6), bp2, processeurDeBase(contexte, 'brompton-sx40'), { frequenceHz: 60, bits: 10 });
      v.egal('repère SX40 : le cuivre part du XD au pied du mur, la régie en fibre', repereSchema('data', { evaluation: sx40, distanceM: 150 }), { lignes: ['XD', 'fibre 150 m'] });
      for (const [coin, dessous, gauche] of [['bas-gauche', true, true], ['haut-droite', false, false]]) {
        const { svg } = dessiner(e10, physique, coin, repereSchema('data', { evaluation: e10, distanceM: 20 }));
        const cadre = svg.querySelector('.repere rect');
        const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(cadre.getAttribute(a)));
        v.vrai(`${coin} : repère ${dessous ? 'sous' : 'au-dessus du'} mur`, dessous ? y + h / 2 > m.hauteurMm : y + h / 2 < 0);
        v.vrai(`${coin} : repère du côté ${gauche ? 'gauche' : 'droit'}, hors du mur`, gauche ? x + w <= 0 : x >= m.largeurMm);
        v.vrai(`${coin} : repère nommé`, svg.querySelector('.repere').textContent.includes('2 × S8'));
        const chemin = svg.querySelector('.chemin-tete');
        const xs = disques(svg, '.depart').map((c) => c[0]);
        const [x1, x2] = [Number(chemin.getAttribute('x1')), Number(chemin.getAttribute('x2'))].sort((a, b) => a - b);
        v.vrai(`${coin} : câbles de tête le long du bord, du repère au départ le plus loin`,
          chemin.getAttribute('y1') === chemin.getAttribute('y2') && x1 <= Math.min(...xs) && x2 >= Math.max(...xs));
        svg.remove();
      }
    },
  },
  {
    id: 'N8',
    titre: 'Mise à jour des appareils : un fichier de l\'appli qui change sans nouvelle version du cache (sw.js) fait échouer ce test',
    etape: 7,
    async verifier(v) {
      const texte = await (await fetch('sw.js', { cache: 'no-store' })).text();
      const version = versionCache(texte);
      const declaree = empreinteDeclaree(texte);
      const calculee = await empreinteCache(texte, async (chemin) => (await fetch(chemin, { cache: 'no-store' })).arrayBuffer());
      v.vrai('sw.js : version du cache et empreinte déclarées, cache nommé d\'après la version',
        version !== null && declaree !== null && /const CACHE = `mur-led-v\$\{VERSION\}`;/.test(texte));
      v.egal('empreinte des fichiers de l\'appli (si un fichier change : nouvelle VERSION et EMPREINTE dans sw.js, une ligne dans tests/versions-cache.js)', calculee, declaree);
      const connue = VERSIONS_CACHE.find((x) => x.version === version);
      v.egal('version enregistrée avec cette même empreinte : changer un fichier demande une nouvelle version', connue?.empreinte, declaree);
      v.egal('la version de sw.js est la dernière enregistrée', version, VERSIONS_CACHE[VERSIONS_CACHE.length - 1].version);
      v.vrai('versions croissantes, une empreinte différente à chaque version',
        VERSIONS_CACHE.every((x, i, t) => i === 0 || (x.version > t[i - 1].version && x.empreinte !== t[i - 1].empreinte)));
    },
  },
  {
    id: 'N9',
    titre: 'Fichiers joints stockés sur l\'appareil (IndexedDB), dans une base de test séparée : écrire, lire à l\'octet près, taille, liste, supprimer',
    etape: 'configs',
    async verifier(v) {
      const nom = 'appli-mur-led-tests';
      const st = creerStockage(nom);
      await st.ecrireFichier('t1', { nom: 'essai.rcfgx', type: 'application/octet-stream', contenu: new Uint8Array([1, 2, 3, 250]).buffer });
      const f = await st.lireFichier('t1');
      v.egal('relu à l\'octet près, avec son nom et sa taille', [f?.nom, f?.taille, [...new Uint8Array(f?.contenu ?? new ArrayBuffer(0))]], ['essai.rcfgx', 4, [1, 2, 3, 250]]);
      v.egal('liste des fichiers : nom et taille, sans le contenu', (await st.listerFichiers()).map((x) => [x.id, x.nom, x.taille, 'contenu' in x]), [['t1', 'essai.rcfgx', 4, false]]);
      await st.supprimerFichier('t1');
      v.egal('supprimé', await st.lireFichier('t1'), null);
      await new Promise((r) => { const q = indexedDB.deleteDatabase(nom); q.onsuccess = r; q.onerror = r; q.onblocked = r; });
      v.vrai('base de test séparée de celle de l\'appli', nom !== 'appli-mur-led');
    },
  },
];
