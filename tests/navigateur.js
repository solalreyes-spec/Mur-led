// Contrôles qui demandent un navigateur (canvas, images PNG) : exécutés par tests.html seulement,
// pas par node --test. Ils vérifient les exports d'image de l'étape 8c.

import * as calculs from '../src/calculs.js';
import { pixelMapEnCanvas, canvasEnPng, schemaEnPng, enregistrer, TEINTES } from '../src/export.js';
import { geometrieSchema, trajetsSchema, construireSvg, repereSchema, PALETTE_EXPORT, PALETTE_ECRAN } from '../src/dessin-schema.js';
import { processeurDeBase, baseProcesseurs, dalleDeBase } from './base.js';
import { DALLE_CAS_13 } from './dalles-fictives.js';
import { versionCache, empreinteDeclaree, empreinteCache } from './fichiers.js';
import { VERSIONS_CACHE } from './versions-cache.js';
import { creerStockage } from '../src/stockage.js';
import * as couleurs from '../src/couleurs.js';
import * as dessinSchema from '../src/dessin-schema.js';

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
    titre: 'Schéma : une couleur par port (et celle des secours), fonds alternés par port, secours jamais en diagonale, départs au bon bord',
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
      v.egal('une couleur par port (7 couleurs, puis on recommence), plus celle des retours de secours', couleurs.size, Math.min(trajets.length, 7) + 1);
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
  {
    id: 'N10',
    titre: 'Schéma lisible à bout de bras (audit du 02/10/2026) : noms de dalle à 4,5:1 au moins sur les deux fonds de port, fonds des ports distincts (1,4:1 au moins), en thème sombre, en mode rouge et à l\'export (fond blanc)',
    etape: 'terrain',
    async verifier(v) {
      const jetons = await jetonsStyles();
      const palettes = [
        ['sombre', { a: jetons.sombre['--dalle-a'], b: jetons.sombre['--dalle-b'], nom: jetons.sombre['--texte-dalle'] }],
        ['rouge', { a: jetons.rouge['--dalle-a'], b: jetons.rouge['--dalle-b'], nom: jetons.rouge['--texte-dalle'] }],
        ['export', { a: PALETTE_EXPORT.dalle, b: PALETTE_EXPORT.dalleAlt, nom: PALETTE_EXPORT.nomDalle }],
      ];
      for (const [theme, p] of palettes) {
        const lisible = [p.a, p.b, p.nom].every((c) => /^#[0-9a-f]{6}$/i.test(c ?? ''));
        v.vrai(`${theme} : couleurs des fonds et des noms de dalle définies`, lisible);
        if (!lisible) continue;
        v.vrai(`${theme} : nom de dalle sur le fond du port impair, 4,5:1 au moins (${contraste(p.nom, p.a).toFixed(2)})`, contraste(p.nom, p.a) >= 4.5);
        v.vrai(`${theme} : nom de dalle sur le fond du port pair, 4,5:1 au moins (${contraste(p.nom, p.b).toFixed(2)})`, contraste(p.nom, p.b) >= 4.5);
        v.vrai(`${theme} : fonds des ports pair et impair distincts, 1,4:1 au moins (${contraste(p.a, p.b).toFixed(2)})`, contraste(p.a, p.b) >= 1.4);
      }
    },
  },
  {
    id: 'N11',
    titre: 'Code couleur du Schéma (audit terrain, lot 2) : chaque trajet à 3:1 au moins sur son fond (dalles des deux ports, fond hors du mur) en thème sombre, en mode rouge et à l\'export ; chiffres des pastilles à 4,5:1 ; un numéro gros sur chaque colonne de chaque trajet, sur le trait, hors des noms de dalle ; data : une couleur par port ; élec : couleur de la phase, motif par ligne d\'une même phase, liseré sous L2',
    etape: 'terrain',
    async verifier(v, contexte) {
      const hexa = (c) => /^#[0-9a-f]{6}$/i.test(c ?? '');
      const mini = (c, fonds) => (hexa(c) ? Math.min(...fonds.map((f) => contraste(c, f))) : 0);
      const jetons = await jetonsStyles();

      // 1. Contrastes, à l'écran (styles.css) et à l'export (fond blanc).
      for (const [theme, j] of [['sombre', jetons.sombre], ['rouge', jetons.rouge]]) {
        const fonds = [j['--dalle-a'], j['--dalle-b'], j['--fond']];
        const traces = [...[1, 2, 3, 4, 5, 6, 7].map((k) => [`port ${k}`, j[`--port-${k}`]]), ['phase L1', j['--phase-1']], ['phase L3', j['--phase-3']], ['retour de secours', j['--trace-secours']]];
        for (const [nom, c] of traces) v.vrai(`${theme} : ${nom} à 3:1 au moins sur chaque fond (${mini(c, fonds).toFixed(2)})`, mini(c, fonds) >= 3);
        const coeur = j['--phase-2'];
        const lisere = j['--phase-lisere'];
        v.vrai(`${theme} : phase L2 lisible, par sa couleur ou par son liseré`, mini(coeur, fonds) >= 3 || (mini(lisere, fonds) >= 3 && hexa(coeur) && contraste(coeur, lisere) >= 3));
        const surPastille = [...[1, 2, 3, 4, 5, 6, 7].map((k) => [j['--fond'], j[`--port-${k}`]]), [j['--fond'], j['--phase-1']], [j['--fond'], j['--phase-3']], [j['--texte-sur-phase-2'] ?? j['--fond'], coeur]];
        v.vrai(`${theme} : chiffres des pastilles à 4,5:1 au moins sur leur couleur`, surPastille.every(([t, f]) => hexa(t) && hexa(f) && contraste(t, f) >= 4.5));
      }
      const fondsExport = [PALETTE_EXPORT.dalle, PALETTE_EXPORT.dalleAlt, PALETTE_EXPORT.fond];
      const tracesExport = [...(couleurs.COULEURS_PORTS ?? []).map((c) => [c.nom, c.export]), ...Object.values(couleurs.COULEURS_PHASES ?? {}).map((c) => [c.nom, c.export]), ['retour de secours', PALETTE_EXPORT.secours]];
      v.vrai('export : 7 couleurs de port et 3 de phase', tracesExport.length === 11);
      for (const [nom, c] of tracesExport) v.vrai(`export : ${nom} à 3:1 au moins sur chaque fond (${mini(c, fondsExport).toFixed(2)})`, mini(c, fondsExport) >= 3);
      v.vrai('export : chiffres blancs des pastilles à 4,5:1 au moins', tracesExport.slice(0, 10).every(([, c]) => hexa(c) && contraste('#ffffff', c) >= 4.5));

      // 2. Dessin : mur Brompton de l'audit (4 × 5 BP2 V2 sur S8, 2 ports ; monophasé, 2 lignes).
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 4, 5);
      const e = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60, bits: 12 });
      const data = calculs.cablageData(m, bp2, e, { depart: 'haut-gauche' });
      const vd = data.variantes.find((x) => x.mode === data.conseil);
      const elecMono = calculs.cablageElec(m, bp2, calculs.electricite(m, bp2, { arrivee: { type: 'mono', intensiteA: 16 } }), { depart: 'haut-gauche' });
      const veMono = elecMono.variantes.find((x) => x.mode === elecMono.conseil);
      const dessiner = (vue, vdx, vex, palette = PALETTE_ECRAN, mur = m, dalle = bp2, ev = e) => {
        const trajets = trajetsSchema(vue, vdx, vex, null);
        const { svg } = construireSvg({ geo: geometrieSchema(vue, mur, dalle, calculs.pixelMap(mur, dalle, ev)), trajets, coin: 'haut-gauche', blocs: [], palette });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        return { svg, trajets };
      };
      const traits = (svg) => [...svg.querySelectorAll('polyline.trajet')];
      const motif = (x) => x.getAttribute('stroke-dasharray') ?? '';
      for (const [nom, vue] of [['vue physique', { vue: 'physique', canvasVue: 'mur', cablage: 'data' }], ['vue pixels', { vue: 'pixels', canvasVue: 'mur', cablage: 'data' }]]) {
        const { svg, trajets } = dessiner(vue, vd, null);
        v.egal(`${nom} : une couleur par port, dans l'ordre`, traits(svg).map((x) => x.style.stroke), ['var(--port-1)', 'var(--port-2)']);
        const cote = Math.min(...[...svg.querySelectorAll('[data-dalle] rect')].map((r) => Math.min(Number(r.getAttribute('width')), Number(r.getAttribute('height')))));
        const nomPolice = Number(svg.querySelector('.etiquette-dalle').getAttribute('font-size'));
        const noms = [...svg.querySelectorAll('.etiquette-dalle')].map((t) => t.getBBox());
        const coupe = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        for (const t of trajets) {
          const g = svg.querySelector(`[data-trajet="${t.cle}"]`);
          const pastilles = [...g.querySelectorAll('.numero-sur-trajet')];
          const colonnes = new Set(t.dalles.map((id) => id.split(' ')[0])).size;
          v.egal(`${nom}, ${t.cle} : un numéro par colonne du trajet (${colonnes})`, [pastilles.length, pastilles.every((p) => p.querySelector('text')?.textContent === t.etiquette)], [colonnes, true]);
          const police = Math.min(...pastilles.map((p) => Number(p.querySelector('text').getAttribute('font-size'))));
          v.vrai(`${nom}, ${t.cle} : numéros gros (0,25 × la dalle et 1,5 × le nom de dalle au moins)`, police >= 0.25 * cote && police >= 1.5 * nomPolice);
          const pts = g.querySelector('polyline').getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
          const distance = (x, y) => Math.min(...pts.slice(1).map((b, i) => {
            const a = pts[i];
            const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
            const k = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / l2)) : 0;
            return Math.hypot(x - a[0] - k * (b[0] - a[0]), y - a[1] - k * (b[1] - a[1]));
          }));
          v.vrai(`${nom}, ${t.cle} : chaque numéro posé sur le trait`, pastilles.every((p) => { const b = p.querySelector('rect').getBBox(); return distance(b.x + b.width / 2, b.y + b.height / 2) <= 0.13 * cote; }));
          v.vrai(`${nom}, ${t.cle} : aucun numéro sur un nom de dalle`, pastilles.every((p) => { const b = p.querySelector('rect').getBBox(); return noms.every((n) => !coupe(b, n)); }));
        }
        svg.remove();
      }
      const { svg: monoSvg } = dessiner({ vue: 'physique', canvasVue: 'mur', cablage: 'elec' }, null, veMono);
      v.egal('élec monophasé, 2 lignes : marron toutes les deux', traits(monoSvg).map((x) => x.style.stroke), ['var(--phase-1)', 'var(--phase-1)']);
      v.egal('élec monophasé : ligne 1 en trait plein, ligne 2 en tirets', traits(monoSvg).map((x) => motif(x) === ''), [true, false]);
      v.egal('élec monophasé : numéros 1 et 2 sur les trajets', [...monoSvg.querySelectorAll('.numero-sur-trajet text')].map((t) => t.textContent).filter((x, i, l) => l.indexOf(x) === i), ['1', '2']);
      monoSvg.remove();
      const m12 = calculs.mur(bp2, 12, 6);
      const e12 = calculs.evaluerProcesseur(m12, bp2, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60, bits: 12 });
      const elecTri = calculs.cablageElec(m12, bp2, calculs.electricite(m12, bp2, {}), { depart: 'haut-gauche' });
      const veTri = elecTri.variantes.find((x) => x.mode === elecTri.conseil);
      const { svg: triSvg, trajets: triTrajets } = dessiner({ vue: 'physique', canvasVue: 'mur', cablage: 'elec' }, null, veTri, PALETTE_ECRAN, m12, bp2, e12);
      const phases = veTri.lignesDetail.map((l) => l.phase);
      v.egal('élec triphasé : la couleur de la phase de chaque ligne', traits(triSvg).map((x) => x.style.stroke), phases.map((ph) => `var(--phase-${ph})`));
      const rangs = phases.map((ph, i) => phases.slice(0, i).filter((x) => x === ph).length);
      v.vrai('élec triphasé : même phase, motif différent ; même rang dans la phase, même motif',
        traits(triSvg).every((x, i) => traits(triSvg).every((y, k) => (phases[i] === phases[k] && i !== k ? motif(x) !== motif(y) : (rangs[i] === rangs[k] ? motif(x) === motif(y) : true)))));
      v.vrai('élec triphasé : liseré sous chaque ligne L2, et seulement sous elles',
        triTrajets.every((t, i) => Boolean(triSvg.querySelector(`[data-trajet="${t.cle}"] .lisere`)) === (phases[i] === 2)));
      triSvg.remove();
      const { svg: exportSvg } = dessiner({ vue: 'physique', canvasVue: 'mur', cablage: 'data' }, vd, null, PALETTE_EXPORT);
      v.egal('export : couleurs d\'impression des ports', traits(exportSvg).map((x) => x.style.stroke.startsWith('#') ? x.style.stroke : x.getAttribute('style').match(/stroke: (#[0-9a-f]{6})/i)?.[1]),
        (couleurs.COULEURS_PORTS ?? []).slice(0, 2).map((c) => c.export));
      exportSvg.remove();
    },
  },
  {
    id: 'N12',
    titre: 'Dessin du guide pas à pas : le port en cours en couleur, les autres atténués ; ses dalles numérotées de 1 à n dans l\'ordre du câble, dans leur dalle, jamais sur un nom de dalle, chiffres à 4,5:1 ; zoom qui contient toutes les dalles du port, au format du cadre ; sur le grand mur, départ visible dans le dessin ou dans l\'encart, numéros de 14 px au moins sur les 12 ports',
    etape: 'terrain',
    async verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      for (const [nom, colonnes, lignes] of [['mur Brompton 4 × 5', 4, 5], ['mur 12 × 6', 12, 6]]) {
        const m = calculs.mur(bp2, colonnes, lignes);
        const e = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 12 });
        const data = calculs.cablageData(m, bp2, e, { depart: 'haut-gauche' });
        const vd = data.variantes.find((x) => x.mode === data.conseil);
        const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
        const geo = geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, e));
        const trajets = trajetsSchema(vue, vd, null, null);
        const t = trajets[0];
        const { svg } = construireSvg({ geo, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_ECRAN, selection: t.cle, ordre: t.cle });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        const g = svg.querySelector(`[data-trajet="${t.cle}"]`);
        const numeros = [...g.querySelectorAll('.ordre-dalle')];
        v.egal(`${nom} : ${t.dalles.length} dalles numérotées, de 1 à ${t.dalles.length}`, numeros.map((n) => n.querySelector('text')?.textContent), t.dalles.map((_, i) => `${i + 1}`));
        v.vrai(`${nom} : chaque numéro dans sa dalle, dans l'ordre du câble`, numeros.length === t.dalles.length && numeros.every((n, i) => {
          const b = n.querySelector('rect').getBBox();
          const r = svg.querySelector(`[data-dalle="${t.dalles[i]}"] rect`).getBBox();
          return b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height;
        }));
        const noms = [...svg.querySelectorAll('.etiquette-dalle')].map((x) => x.getBBox());
        const coupe = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        v.vrai(`${nom} : aucun numéro sur un nom de dalle`, numeros.length > 0 && numeros.every((n) => noms.every((x) => !coupe(n.querySelector('rect').getBBox(), x))));
        v.vrai(`${nom} : numéros sur la couleur du port, chiffres sur la couleur de texte des pastilles`,
          numeros.length > 0 && numeros.every((n) => n.querySelector('rect').style.fill === 'var(--port-1)' && n.querySelector('text').style.fill === 'var(--fond)'));
        v.vrai(`${nom} : pas de pastille de colonne sur le port en cours (remplacée par les numéros)`, g.querySelectorAll('.numero-sur-trajet').length === 0);
        v.vrai(`${nom} : les autres ports atténués`, trajets.slice(1).every((x) => svg.querySelector(`[data-trajet="${x.cle}"]`).classList.contains('attenue')));
        v.vrai(`${nom} : dessin ordinaire sans numéros de dalle`, construireSvg({ geo, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_ECRAN }).svg.querySelectorAll('.ordre-dalle').length === 0);
        const cadre = dessinSchema.cadrageSurDalles?.(geo, t.dalles, 375 / 480);
        const contient = cadre && t.dalles.every((id) => { const r = geo.rects.get(id); return r.x >= cadre.x && r.y >= cadre.y && r.x + r.w <= cadre.x + cadre.w && r.y + r.h <= cadre.y + cadre.h; });
        v.vrai(`${nom} : zoom qui contient toutes les dalles du port`, Boolean(contient));
        v.vrai(`${nom} : zoom au format du cadre (375 × 480)`, Boolean(cadre) && Math.abs(cadre.w / cadre.h - 375 / 480) < 0.01);
        v.vrai(`${nom} : zoom serré sur le port (moins de la moitié du mur en largeur sur le 12 × 6)`, Boolean(cadre) && (colonnes < 12 || cadre.w < geo.largeur / 2));
        svg.remove();
        // Grand mur : sur chacun des ports, le départ (cadre du processeur, du XD ou du CVT, et rond numéroté du port) se
        // voit, dans le dessin quand il est près des dalles, sinon dans l'encart (« ← 2 × S8, port 2.6 ») ; le zoom reste
        // serré sur les dalles, numéros d'au moins 14 px à l'écran (cadre du guide à 375 px : 347 × 480 px, 347 × 410 en
        // grand affichage).
        if (colonnes === 12) {
          const repere = repereSchema('data', { evaluation: e, distanceM: null });
          const { svg: complet } = construireSvg({ geo, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_ECRAN, repere });
          complet.style.position = 'absolute';
          complet.style.left = '-5000px';
          document.body.append(complet);
          const dans = (c, b) => Boolean(c) && b.x >= c.x && b.y >= c.y && b.x + b.width <= c.x + c.w && b.y + b.height <= c.y + c.h;
          const boite = complet.querySelector('.repere rect').getBBox();
          const cote = Math.min(...[...geo.rects.values()].map((r) => Math.min(r.w, r.h)));
          for (const [mode, largeurPx, hauteurPx, police] of [['normal', 347, 480, 0.24], ['grand affichage', 347, 410, 0.27]]) {
            const sansDepart = [];
            const petits = [];
            let encarts = 0;
            for (const x of trajets) {
              const g = dessinSchema.cadrageGuide?.(geo, x.dalles, largeurPx / hauteurPx, { coin: 'haut-gauche', orientation: x.orientation, repere });
              const depart = complet.querySelector(`[data-trajet="${x.cle}"] .depart`).getBBox();
              const visible = Boolean(g) && dans(g.cadrage, boite) && dans(g.cadrage, depart);
              const encart = Boolean(g?.encart) && g.encart.repere === repere.lignes[0] && /^[←→↑↓↖↗↙↘]$/.test(g.encart.fleche)
                && dans(g.encart.cadrageDepart, boite) && dans(g.encart.cadrageDepart, depart);
              if (g?.encart) encarts += 1;
              if (!(visible ? !g.encart : encart)) sansDepart.push(x.etiquette);
              const taille = g ? police * cote * Math.min(largeurPx / g.cadrage.w, hauteurPx / g.cadrage.h) : 0;
              if (taille < 14) petits.push(`${x.etiquette} ${taille.toFixed(1)} px`);
            }
            v.egal(`${nom}, ${mode} : départ visible sur chacun des ${trajets.length} ports, dans le dessin ou dans l'encart (avec sa flèche et le cadre « ${repere.lignes[0]} »)`, sansDepart, []);
            v.egal(`${nom}, ${mode} : numéros des dalles de 14 px au moins à l'écran sur les ${trajets.length} ports`, petits, []);
            v.vrai(`${nom}, ${mode} : un encart pour les ports loin du départ, pas pour les premiers`, encarts > 0 && encarts < trajets.length);
          }
          complet.remove();
        }
      }
    },
  },
  {
    id: 'N13',
    titre: 'Grand affichage (option 2 de l\'audit), en plus du thème sombre ou du mode rouge : jetons de styles.css (zones de 60 px, texte de 19 px) ; dessin en vue physique avec des noms de dalle, des numéros et des traits plus grands, sans qu\'un nom passe sous un trait ou sous un numéro ; vue pixels inchangée, traits compris',
    etape: 'terrain',
    async verifier(v, contexte) {
      const css = await (await fetch('styles.css', { cache: 'no-store' })).text();
      const bloc = css.match(/:root\[data-taille="grand"\]\s*\{([^}]*)\}/)?.[1] ?? '';
      v.vrai('styles.css : bloc :root[data-taille="grand"] avec --cible: 60px', /--cible:\s*60px/.test(bloc));
      v.vrai('styles.css : texte de 19 px en grand affichage (html et body)', /:root\[data-taille="grand"\]\s*(body|html)[^{]*\{[^}]*font-size:\s*19px/.test(css) || /html\[data-taille="grand"\][^{]*\{[^}]*font-size:\s*19px/.test(css));
      v.vrai('styles.css : le grand affichage ne touche pas aux couleurs (thème sombre ou mode rouge gardé)', !/--(fond|texte|accent|port-\d|phase-\d|dalle-[ab])\s*:/.test(bloc));

      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const coupe = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      for (const [nom, colonnes, lignes] of [['mur Brompton 4 × 5', 4, 5], ['mur 12 × 6', 12, 6]]) {
        const m = calculs.mur(bp2, colonnes, lignes);
        const e = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 12 });
        const data = calculs.cablageData(m, bp2, e, { depart: 'haut-gauche' });
        const vd = data.variantes.find((x) => x.mode === data.conseil);
        for (const vueNom of ['physique', 'pixels']) {
          const vue = { vue: vueNom, canvasVue: 'mur', cablage: 'data' };
          const geo = geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, e));
          const trajets = trajetsSchema(vue, vd, null, null);
          const dessiner = (options) => {
            const { svg } = construireSvg({ geo, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_ECRAN, ...options });
            svg.style.position = 'absolute';
            svg.style.left = '-5000px';
            document.body.append(svg);
            return svg;
          };
          const normal = dessiner({});
          const grand = dessiner({ grand: true });
          const guide = dessiner({ grand: true, selection: trajets[0].cle, ordre: trajets[0].cle });
          const cote = Math.min(...[...grand.querySelectorAll('[data-dalle] rect')].map((r) => Math.min(Number(r.getAttribute('width')), Number(r.getAttribute('height')))));
          const taille = (svg, sel) => Number(svg.querySelector(sel)?.getAttribute('font-size') ?? 0);
          const epaisseur = (svg) => Number(svg.querySelector('polyline.trajet').getAttribute('stroke-width'));
          const ici = `${nom}, vue ${vueNom}`;
          if (vueNom === 'physique') {
            v.vrai(`${ici} : traits plus épais (1,3 × au moins)`, epaisseur(grand) >= 1.3 * epaisseur(normal));
            v.vrai(`${ici} : noms de dalle plus grands (1,1 × au moins)`, taille(grand, '.etiquette-dalle') >= 1.1 * taille(normal, '.etiquette-dalle'));
            v.vrai(`${ici} : numéros des trajets de 0,32 × la dalle au moins`, taille(grand, '.numero-sur-trajet text') >= 0.32 * cote - 1e-9);
            v.vrai(`${ici} : numéros du guide de 0,27 × la dalle au moins`, taille(guide, '.ordre-dalle text') >= 0.27 * cote - 1e-9);
          } else {
            // Vue pixels inchangée : son premier pixel (« x 1056 ») va presque jusqu'au trait central.
            v.egal(`${ici} : noms, numéros et traits inchangés`,
              [taille(grand, '.etiquette-dalle'), taille(grand, '.numero-sur-trajet text'), epaisseur(grand)],
              [taille(normal, '.etiquette-dalle'), taille(normal, '.numero-sur-trajet text'), epaisseur(normal)]);
          }
          for (const [quoi, svg] of [['grand affichage', grand], ['guide en grand affichage', guide]]) {
            const demi = epaisseur(svg) / 2;
            const tuiles = [...svg.querySelectorAll('[data-dalle]')];
            const sousTrait = tuiles.filter((g) => {
              const r = g.querySelector('rect');
              const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a)));
              return [...g.querySelectorAll('.etiquette-dalle')].some((t) => {
                const b = t.getBBox();
                const dedans = b.x >= x && b.y >= y && b.x + b.width <= x + w && b.y + b.height <= y + h;
                return !dedans || (b.x < x + w / 2 + demi && b.x + b.width > x + w / 2 - demi) || (b.y < y + h / 2 + demi && b.y + b.height > y + h / 2 - demi);
              });
            }).map((g) => g.dataset.dalle);
            v.egal(`${ici}, ${quoi} : noms de dalle dans leur dalle, jamais sous un trait`, sousTrait, []);
            const noms = [...svg.querySelectorAll('.etiquette-dalle')].map((t) => t.getBBox());
            const sousNumero = [...svg.querySelectorAll('.numero-sur-trajet rect, .ordre-dalle rect')].filter((p) => noms.some((n) => coupe(p.getBBox(), n)));
            v.egal(`${ici}, ${quoi} : aucun numéro sur un nom de dalle`, sousNumero.length, 0);
          }
          [normal, grand, guide].forEach((x) => x.remove());
        }
      }
    },
  },
];

// Contraste WCAG entre deux couleurs « #rrggbb ».
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Jetons de couleur de styles.css : thème sombre (:root), puis mode rouge (:root[data-mode="rouge"]) par-dessus.
export async function jetonsStyles() {
  const css = await (await fetch('styles.css', { cache: 'no-store' })).text();
  const sombre = {};
  const rougeSeul = {};
  for (const m of css.matchAll(/:root(\[data-mode="rouge"\])?\s*\{([^}]*)\}/g)) {
    for (const [, nom, valeur] of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) (m[1] ? rougeSeul : sombre)[nom] = valeur.trim();
  }
  return { sombre, rouge: { ...sombre, ...rougeSeul } };
}
