// Contrôles qui demandent un navigateur (canvas, images PNG) : exécutés par tests.html seulement,
// pas par node --test. Ils vérifient les exports d'image de l'étape 8c.

import * as calculs from '../src/calculs.js';
import { pixelMapEnCanvas, canvasEnPng, schemaEnPng, enregistrer, TEINTES } from '../src/export.js';
import { geometrieSchema, trajetsSchema, construireSvg, repereSchema, PALETTE_EXPORT, PALETTE_ECRAN } from '../src/dessin-schema.js';
import { processeurDeBase, baseProcesseurs, dalleDeBase, liaisonsDeBase, regieDeBase } from './base.js';
import { DALLE_CAS_13 } from './dalles-fictives.js';
import { versionCache, empreinteDeclaree, empreinteCache, listeCache } from './fichiers.js';
import { VERSIONS_CACHE } from './versions-cache.js';
import { creerStockage } from '../src/stockage.js';
import * as couleurs from '../src/couleurs.js';
import * as dessinSchema from '../src/dessin-schema.js';
import { el } from '../src/dom.js';

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

// Écran Dépannage, monté hors de la page des tests (largeur d'un téléphone). Le module est chargé à la demande :
// absent, seuls ces tests échouent.
async function moduleDepannage(v) {
  try {
    return await import('../src/ecran-depannage.js');
  } catch (erreur) {
    v.vrai(`module src/ecran-depannage.js chargé (${erreur.message})`, false);
    return null;
  }
}
function monterDepannage(module, donnees, options = {}) {
  const racine = document.createElement('div');
  racine.style.cssText = 'position:absolute;left:-10000px;top:0;width:375px';
  document.body.append(racine);
  const ecran = module.monterDepannage(racine, donnees, options);
  return { racine, ecran, retirer: () => racine.remove() };
}
const texteDe = (e) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const boutonTexte = (racine, debut) => [...racine.querySelectorAll('button')].find((b) => texteDe(b).startsWith(debut));
// Hors ligne : tout appel réseau échoue (et il est noté), navigator.onLine vaut false.
async function sansReseau(action) {
  const fetchAvant = window.fetch;
  const appels = [];
  window.fetch = (adresse) => {
    appels.push(String(adresse));
    return Promise.reject(new TypeError('hors ligne'));
  };
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  try {
    await action(appels);
  } finally {
    window.fetch = fetchAvant;
    delete navigator.onLine;
  }
}
const rgbVersHex = (c) => `#${(c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('')}`;
// Fond réel d'un élément : le premier fond non transparent en remontant.
function fondDe(e) {
  for (let x = e; x; x = x.parentElement) {
    const c = getComputedStyle(x).backgroundColor;
    if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return rgbVersHex(c);
  }
  return '#ffffff';
}

// Mire et fiche contenu : modules chargés à la demande (absents, seuls ces tests échouent) ; mur de BP2 V2 câblé
// comme dans le Schéma (variante conseillée, départ en haut à gauche).
async function moduleAppli(v, chemin) {
  try {
    return await import(chemin);
  } catch (erreur) {
    v.vrai(`module ${chemin.slice(3)} chargé (${erreur.message})`, false);
    return null;
  }
}
function murCable(contexte, colonnes, lignes, id = 'brompton-s8') {
  const dalle = dalleDeBase(contexte, 'roe-bp2-v2');
  const m = calculs.mur(dalle, colonnes, lignes);
  const evaluation = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, id), { frequenceHz: 60, bits: id.startsWith('brompton') ? 12 : 8 });
  const data = calculs.cablageData(m, dalle, evaluation, { depart: 'haut-gauche' });
  return { mur: m, dalle, evaluation, variante: data.variantes.find((x) => x.mode === data.conseil) };
}
const rgbHex = (p) => `#${p.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
// Nouveau look : onglets et familles attendus (§ 3 de la spec du 09/10/2026) ; feuille de styles de l'appli chargée
// dans la page de tests le temps d'un contrôle.
const ONGLETS_LOOK = [['mur', 'image'], ['data', 'donnees'], ['canvas', 'image'], ['elec', 'electricite'], ['poids', 'accroche'],
  ['schema', 'donnees'], ['depannage', 'depannage'], ['base', 'base'], ['apprendre', 'apprendre']];
async function chargerStylesLook() {
  const feuille = el('link', { rel: 'stylesheet', href: 'styles.css' });
  await new Promise((fin) => {
    feuille.onload = fin;
    feuille.onerror = fin;
    document.head.append(feuille);
  });
  return () => feuille.remove();
}
// Distance d'un point aux deux diagonales et au cercle de la mire : les pixels de contrôle s'en tiennent à l'écart.
function loinDesTraits(plan, x, y) {
  const { largeur: W, hauteur: H } = plan.mur;
  const px = x - plan.mur.x;
  const py = y - plan.mur.y;
  const d1 = Math.abs(H * px - W * py) / Math.hypot(W, H);
  const d2 = Math.abs(H * (W - px) - W * py) / Math.hypot(W, H);
  const dc = Math.abs(Math.hypot(x - plan.cercle.cx, y - plan.cercle.cy) - plan.cercle.r);
  const dans = (b) => b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
  return d1 > 4 && d2 > 4 && dc > 4 && !dans(plan.bloc) && !dans({ ...plan.damier, w: plan.damier.cote, h: plan.damier.cote });
}

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
  {
    id: 'N14',
    titre: 'Dépannage hors ligne : S2, puis « Une dalle seule », arrive sur T2.5 ; Retour revient à T2.1 ; Recommencer revient à la liste ; « annexe A » à « annexe C » du texte en liens, les 4 annexes depuis l\'accueil ; FIN-APPEL affiche l\'annexe D ; avertissement de T9 ; aucun accès au réseau, fichiers dans le cache du service worker ; liens web des sources seulement en ligne',
    etape: 'depannage',
    async verifier(v, contexte) {
      const cache = listeCache(contexte.fichiers?.['sw.js']);
      v.vrai('data/depannage.json dans le cache du service worker', cache.includes('data/depannage.json'));
      v.vrai('src/ecran-depannage.js dans le cache du service worker', cache.includes('src/ecran-depannage.js'));
      const d = contexte.depannage;
      v.vrai('data/depannage.json lu', Boolean(d));
      const module = await moduleDepannage(v);
      if (!d || !module) return;
      await sansReseau(async (appels) => {
        const { racine, ecran, retirer } = monterDepannage(module, d, { projet: null });
        try {
          v.egal('ouverture : accueil', racine.dataset.ecran, 'accueil');
          v.egal('accueil : réflexes R1 à R3 en court', [...racine.querySelectorAll('.dep-reflexe summary')].map(texteDe), d.reflexes.map((r) => `${r.id} · ${r.titre}`));
          v.egal('accueil : les 11 symptômes en gros boutons', [...racine.querySelectorAll('.dep-symptome')].map(texteDe), d.symptomes.map((x) => x.texte));
          boutonTexte(racine, d.symptomes[1].texte)?.click();
          v.egal('S2 : T2.1', racine.dataset.noeud, 'T2.1');
          boutonTexte(racine, 'Une dalle seule')?.click();
          v.egal('« Une dalle seule » : T2.5', racine.dataset.noeud, 'T2.5');
          racine.querySelector('.dep-retour')?.click();
          v.egal('Retour : T2.1', racine.dataset.noeud, 'T2.1');
          racine.querySelector('.dep-recommencer')?.click();
          v.egal('Recommencer : la liste des symptômes', [racine.dataset.ecran, racine.querySelectorAll('.dep-symptome').length], ['accueil', 11]);
          ecran.afficher('T2.5');
          const lien = racine.querySelector('.dep-lien-annexe[data-annexe="A"]');
          v.vrai('T2.5 : « annexe A » en lien', texteDe(lien) === 'annexe A');
          lien?.click();
          v.egal('lien : annexe A', [racine.dataset.ecran, racine.dataset.annexe], ['annexe', 'A']);
          racine.querySelector('.dep-retour')?.click();
          v.egal('Retour : T2.5', racine.dataset.noeud, 'T2.5');
          // « annexe A » à « annexe C » sont cités dans le texte (« annexe D » ne l'est que par FIN-APPEL, qui l'affiche).
          const liens = new Set();
          const relever = () => racine.querySelectorAll('.dep-lien-annexe').forEach((a) => liens.add(a.dataset.annexe));
          for (const n of d.noeuds) {
            ecran.afficher(n.id);
            relever();
          }
          ecran.accueil();
          racine.querySelectorAll('.dep-reflexe').forEach((x) => { x.open = true; });
          relever();
          v.egal('« annexe A », « annexe B », « annexe C » du texte : des liens', [...liens].sort(), ['A', 'B', 'C']);
          v.egal('accueil : un bouton par annexe, A à D', [...racine.querySelectorAll('.dep-bouton-annexe')].map((b) => b.dataset.annexe), ['A', 'B', 'C', 'D']);
          ecran.afficher('FIN-APPEL');
          v.egal('FIN-APPEL : message', texteDe(racine.querySelector('.dep-titre')), 'Appelle ton responsable ou le dépôt.');
          v.egal('FIN-APPEL : annexe D affichée, ses 6 points', racine.querySelectorAll('.dep-annexe[data-annexe="D"] .dep-annexe-ligne').length, 6);
          ecran.afficher('FIN-OK');
          v.egal('FIN-OK : message', texteDe(racine.querySelector('.dep-titre')), 'C\'est réglé.');
          ecran.afficher('T9.3');
          v.egal('T9 : avertissement en tête, 2 lignes', racine.querySelectorAll('.dep-avertissement .dep-ligne').length, 2);
          ecran.afficher('T5.3');
          v.egal('hors ligne : sources sans lien web', racine.querySelectorAll('.dep-sources a[href^="http"]').length, 0);
          v.egal('aucun accès au réseau pendant le parcours', appels, []);
        } finally {
          retirer();
        }
      });
      const enLigne = monterDepannage(module, d, { projet: null, enLigne: () => true });
      enLigne.ecran.afficher('T5.3');
      v.vrai('en ligne : lien web vers la source', enLigne.racine.querySelectorAll('.dep-sources a[href^="https://"]').length > 0);
      enLigne.retirer();
    },
  },
  {
    id: 'N15',
    titre: 'Dépannage, lignes de marque : projet ouvert avec un processeur Brompton, lignes Brompton dépliées et les autres repliées ; sans projet, un choix de marque (Novastar, COEX, Brompton, Toutes) ; marque d\'un processeur de la base',
    etape: 'depannage',
    async verifier(v, contexte) {
      const d = contexte.depannage;
      v.vrai('data/depannage.json lu', Boolean(d));
      const module = await moduleDepannage(v);
      if (!d || !module) return;
      v.egal('marque du processeur : S8, MCTRL660, MX40 Pro, X20 (pas couvert)',
        ['brompton-s8', 'novastar-mctrl660', 'coex-mx40-pro', 'colorlight-x20'].map((id) => module.marqueDuProcesseur(processeurDeBase(contexte, id))),
        ['brompton', 'novastar', 'coex', null]);
      const etat = (racine) => [...racine.querySelectorAll('.dep-ligne-marque')].map((x) => `${x.dataset.marque}:${x.open ? 'dépliée' : 'repliée'}`);
      let m = monterDepannage(module, d, { projet: { marque: 'brompton', nom: 'S8' } });
      v.egal('projet Brompton : Brompton choisi d\'office', [...m.racine.querySelectorAll('.dep-marques button[aria-pressed="true"]')].map(texteDe), ['Brompton']);
      v.vrai('projet Brompton : le processeur du projet est nommé', texteDe(m.racine.querySelector('.dep-marques')).includes('S8'));
      m.ecran.afficher('T1.3');
      v.egal('T1.3, projet Brompton : Brompton dépliée, Novastar et COEX repliées', etat(m.racine), ['brompton:dépliée', 'novastar:repliée', 'coex:repliée']);
      v.vrai('T1.3 : la ligne commune reste visible', texteDe(m.racine).includes('Repasse en Normal.'));
      m.retirer();
      m = monterDepannage(module, d, { projet: null });
      v.egal('sans projet : choix de marque', [...m.racine.querySelectorAll('.dep-marques button')].map(texteDe), ['Novastar', 'COEX', 'Brompton', 'Toutes']);
      v.egal('sans projet : aucune marque choisie d\'office', m.racine.querySelectorAll('.dep-marques button[aria-pressed="true"]').length, 0);
      m.ecran.afficher('T1.3');
      v.egal('T1.3 sans projet : lignes de marque repliées', etat(m.racine), ['brompton:repliée', 'novastar:repliée', 'coex:repliée']);
      m.racine.querySelector('.dep-marques button[data-marque="toutes"]')?.click();
      v.egal('« Toutes » : toutes dépliées', etat(m.racine), ['brompton:dépliée', 'novastar:dépliée', 'coex:dépliée']);
      m.racine.querySelector('.dep-marques button[data-marque="coex"]')?.click();
      v.egal('« COEX » : COEX seule dépliée', etat(m.racine), ['brompton:repliée', 'novastar:repliée', 'coex:dépliée']);
      m.ecran.afficher('T7.2');
      v.egal('T7.2, COEX : « Novastar et COEX » dépliée', etat(m.racine), ['brompton:repliée', 'novastar coex:dépliée', 'brompton:repliée']);
      m.retirer();
    },
  },
  {
    id: 'N16',
    titre: 'Dépannage, badges et sources : badge « à confirmer » sur chaque ligne [?] ; sous chaque ligne sa source en petit, sous son libellé publié (jamais le code interne) ; renvois numérotés quand une ligne a plusieurs sources',
    etape: 'depannage',
    async verifier(v, contexte) {
      const d = contexte.depannage;
      v.vrai('data/depannage.json lu', Boolean(d));
      const module = await moduleDepannage(v);
      if (!d || !module) return;
      const m = monterDepannage(module, d, { projet: null });
      m.racine.querySelector('.dep-marques button[data-marque="toutes"]')?.click();
      const fautes = [];
      let badges = 0;
      const codeInterne = /(?<![\w-])(NS-A10|NS-A5S|NS-LCT|NS-VX1000|NS-VXPRO|CX-MX40|BR-LED|BR-TESS|BR-FORM|F-PDF1|F\d{1,2}|CDC)(?![\w-])/;
      for (const n of d.noeuds) {
        m.ecran.afficher(n.id);
        const attendus = n.lignes.filter((l) => l.aConfirmer).length;
        const vus = m.racine.querySelectorAll('.dep-contenu .dep-badge').length;
        badges += vus;
        if (vus !== attendus) fautes.push(`${n.id} : ${vus} badges pour ${attendus} lignes [?]`);
        const texte = texteDe(m.racine);
        if (texte.includes('[?]')) fautes.push(`${n.id} : « [?] » affiché tel quel`);
        if (/\{\d+\}/.test(texte)) fautes.push(`${n.id} : renvoi « {n} » affiché tel quel`);
        const code = texte.match(codeInterne);
        if (code) fautes.push(`${n.id} : code interne affiché (${code[1]})`);
        const sansSource = [...m.racine.querySelectorAll('.dep-contenu .dep-ligne')].filter((x) => x.dataset.sources > 0 && !x.querySelector('.dep-sources'));
        if (sansSource.length) fautes.push(`${n.id} : ${sansSource.length} lignes sourcées sans leurs sources dessous`);
      }
      v.egal('nœuds : badges, « [?] », renvois et codes internes', fautes, []);
      v.egal('badges « à confirmer » des nœuds', badges, d.noeuds.flatMap((n) => n.lignes).filter((l) => l.aConfirmer).length);
      m.ecran.afficher('T1.4');
      v.egal('badge : « à confirmer »', texteDe(m.racine.querySelector('.dep-badge')), 'à confirmer');
      m.ecran.afficher('T2.3');
      v.egal('T2.3, étape 1 : « Formation (transcription 7) » sous la ligne', texteDe(m.racine.querySelector('.dep-etape .dep-sources')), 'Formation (transcription 7)');
      m.ecran.afficher('T2.6');
      v.vrai('T2.6 : support de cours en « Formation (support de cours) »', texteDe(m.racine).includes('Formation (support de cours)'));
      m.ecran.afficher('T4.3');
      v.vrai('T4.3 : cahier des charges en « Cahier des charges de l\'appli »', texteDe(m.racine).includes('Cahier des charges de l\'appli'));
      m.ecran.afficher('T1.2');
      const brompton = m.racine.querySelector('.dep-ligne-marque[data-marque="brompton"]');
      v.egal('T1.2, Brompton : 3 renvois dans le texte, 3 sources numérotées dessous',
        [brompton?.querySelectorAll('.dep-renvoi').length, brompton?.querySelectorAll('.dep-source').length], [3, 3]);
      const cases = d.annexes.find((a) => a.id === 'B').tableau.lignes.flatMap((r) => r.cases).filter((c) => c.aConfirmer).length;
      m.ecran.annexe('B');
      v.egal(`annexe B : ${cases} cases [?] avec leur badge`, m.racine.querySelectorAll('.dep-badge').length, cases);
      v.vrai('annexe B : aucun code interne affiché', !codeInterne.test(texteDe(m.racine)));
      m.ecran.sources();
      v.egal('liste des sources : 22 entrées, sans code interne', [m.racine.querySelectorAll('.dep-source-entree').length, codeInterne.test(texteDe(m.racine))], [22, false]);
      m.retirer();
    },
  },
  {
    id: 'N17',
    titre: 'Dépannage en grand affichage, thème sombre et mode rouge : texte de 19 px, boutons de 60 px, réponses et symptômes de 64 px ; texte à 4,5:1 sur son fond ; rien ne déborde à 375 px (styles.css)',
    etape: 'depannage',
    async verifier(v, contexte) {
      const d = contexte.depannage;
      v.vrai('data/depannage.json lu', Boolean(d));
      const module = await moduleDepannage(v);
      if (!d || !module) return;
      const feuille = document.createElement('link');
      feuille.rel = 'stylesheet';
      feuille.href = 'styles.css';
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, reponse, police] = taille === 'grand' ? [60, 64, 19] : [48, 52, 0];
            const m = monterDepannage(module, d, { projet: { marque: 'brompton', nom: 'S8' } });
            m.racine.style.background = 'var(--fond)';
            const fautes = [];
            for (const [nom, aller] of [['accueil', () => m.ecran.accueil()], ['T1.3', () => m.ecran.afficher('T1.3')], ['T2.5', () => m.ecran.afficher('T2.5')],
              ['T9.2', () => m.ecran.afficher('T9.2')], ['FIN-APPEL', () => m.ecran.afficher('FIN-APPEL')], ['annexe B', () => m.ecran.annexe('B')], ['sources', () => m.ecran.sources()]]) {
              aller();
              m.racine.querySelectorAll('details').forEach((x) => { x.open = true; });
              const textes = [...m.racine.querySelectorAll('*')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.getClientRects().length);
              for (const e of textes) {
                const style = getComputedStyle(e);
                if (police && !e.closest('.dep-renvoi') && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const c = contraste(rgbVersHex(style.color), fondDe(e));
                if (c < 4.5) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » à ${c.toFixed(2)}:1`);
              }
              for (const b of m.racine.querySelectorAll('button, summary')) {
                if (b.closest('.dep-lien-annexe') || !b.getClientRects().length) continue;
                const h = b.getBoundingClientRect().height;
                const attendu = b.matches('.dep-reponse, .dep-symptome') ? reponse : mini;
                if (h < attendu - 0.5) fautes.push(`${nom} : « ${texteDe(b).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (m.racine.scrollWidth > 375.5) fautes.push(`${nom} : ${m.racine.scrollWidth} px de large`);
            }
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            m.retirer();
          }
        }
      } finally {
        feuille.remove();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N18',
    titre: 'Alertes et avertissements de l\'appli (alerte, erreur, info, ok, fiche incomplète, bandeau « Recharger », avertissement du Dépannage, conflit de valeurs), en thème sombre et en mode rouge : tout texte à 4,5:1 au moins sur son fond, texte de l\'alerte, lien, gras, texte secondaire et bouton compris ; corrigé dans le style commun, sans exception pour l\'avertissement de T9 (styles.css)',
    etape: 'contraste',
    async verifier(v) {
      const css = await (await fetch('styles.css', { cache: 'no-store' })).text();
      v.vrai('aucune exception de mode rouge pour l\'avertissement du Dépannage (fond à part)', !/data-mode="rouge"\]\s*\.dep-avertissement\s*\{[^}]*background/.test(css));
      const feuille = document.createElement('link');
      feuille.rel = 'stylesheet';
      feuille.href = 'styles.css';
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = html.dataset.mode;
      // Contenu type d'une alerte : son texte, un lien, du gras, un texte secondaire et un bouton.
      const contenu = () => ['Texte de l\'alerte ', el('a', { href: '#' }, 'lien'), ' ', el('strong', {}, 'gras'),
        el('p', { class: 'note' }, 'Texte secondaire'), el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Bouton')];
      const modeles = [
        ['alerte', () => el('div', { class: 'alerte' }, ...contenu())],
        ['erreur', () => el('div', { class: 'alerte alerte-erreur' }, ...contenu())],
        ['info', () => el('div', { class: 'alerte alerte-info' }, ...contenu())],
        ['ok', () => el('div', { class: 'alerte alerte-ok' }, ...contenu())],
        ['fiche incomplète', () => el('details', { class: 'alerte manques', open: '' }, el('summary', {}, 'Fiche incomplète'), el('p', {}, 'Ce qui manque'), el('p', { class: 'note' }, 'Liste complète dans Base'))],
        ['bandeau « Recharger »', () => el('div', { class: 'bandeau-maj' }, el('span', {}, 'Une nouvelle version est prête.'), el('button', { type: 'button', class: 'bouton bouton-petit' }, 'Recharger'))],
        ['avertissement du Dépannage', () => el('div', { class: 'dep' }, el('div', { class: 'dep-avertissement' },
          el('div', { class: 'dep-ligne' }, el('p', { class: 'dep-texte' }, 'Avant de brancher le mur'), el('p', { class: 'dep-sources' }, 'Formation (transcription 3)'))))],
        ['conflit de valeurs', () => el('div', { class: 'carte' }, el('p', { class: 'conflit' }, 'Autres valeurs : 160 W'))],
      ];
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px;background:var(--fond);color:var(--texte)' });
          document.body.append(cadre);
          const fautes = [];
          for (const [nom, creer] of modeles) {
            const alerte = creer();
            cadre.append(alerte);
            for (const e of [alerte, ...alerte.querySelectorAll('*')]) {
              if (![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) || !e.getClientRects().length) continue;
              const c = contraste(rgbVersHex(getComputedStyle(e).color), fondDe(e));
              if (c < 4.5) fautes.push(`${nom}, ${e.tagName.toLowerCase()}${e.className ? `.${e.className.split(' ').join('.')}` : ''} : ${c.toFixed(2)}:1`);
            }
          }
          v.egal(`${mode} : textes des alertes sous 4,5:1`, fautes, []);
          cadre.remove();
        }
      } finally {
        feuille.remove();
        if (avant) html.dataset.mode = avant;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N19',
    titre: 'Mire du mur : PNG en RVB 8 bits, sans transparence, à la taille exacte du mur ; bord de chaque dalle à la couleur de son port et libellés du Schéma (port et rang, colonne et rangée, premier pixel), fond assombri ; cadre blanc aux coins ; damier de 1 px au bon endroit',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const c = murCable(contexte, 4, 3);
      const r = mire.preparerMires({ ...c, projet: 'Salon B', date: '3 octobre 2026', version: 'v15' });
      const plan = r.mur.plan;
      v.egal('mire du mur : taille du mur, nom sans espace ni accent', [plan.largeur, plan.hauteur, r.mur.nom], [c.mur.pxLargeur, c.mur.pxHauteur, `mire_salonb_${c.mur.pxLargeur}x${c.mur.pxHauteur}.png`]);
      v.egal('bloc central : projet, résolution, date, version', plan.bloc.lignes, ['Salon B', `${c.mur.pxLargeur} × ${c.mur.pxHauteur} px`, '3 octobre 2026', 'Mur LED v15']);
      // Libellés et couleurs : ceux du Schéma (trajetsSchema, geometrieSchema).
      const trajets = trajetsSchema({ cablage: 'data' }, c.variante, null);
      const geo = geometrieSchema({ vue: 'pixels', canvasVue: 'mur' }, c.mur, c.dalle, calculs.pixelMap(c.mur, c.dalle, c.evaluation));
      const libelles = plan.dalles.filter((d) => {
        const t = trajets.find((x) => x.dalles.includes(d.id));
        const g = geo.rects.get(d.id);
        return !(t && d.bord === t.couleur.ecran && d.textes.map((x) => x.texte).join(' | ') === `${t.numero} · ${t.dalles.indexOf(d.id) + 1} | ${d.id} | x ${g.x} y ${g.y}`);
      }).map((d) => d.id);
      v.egal('dalles dont la couleur ou les libellés diffèrent du Schéma', libelles, []);
      const jetons = (await jetonsStyles()).sombre;
      v.egal('couleurs des ports sur la mire : celles du Schéma à l\'écran (styles.css, thème sombre)', couleurs.COULEURS_PORTS.map((x) => x.ecran), [1, 2, 3, 4, 5, 6, 7].map((k) => jetons[`--port-${k}`]));
      const blob = await mire.pngRvb(mire.dessinerMire(plan));
      const octets = new Uint8Array(await blob.arrayBuffer());
      v.egal('PNG, RVB (type de couleur 2), 8 bits, sans transparence', [blob.type, String.fromCharCode(...octets.slice(1, 4)), octets[25], octets[24]], ['image/png', 'PNG', 2, 8]);
      const image = await decoder(blob);
      v.egal('taille du PNG', [image.width, image.height], [plan.largeur, plan.hauteur]);
      const fautes = [];
      let vus = 0;
      for (const d of plan.dalles) {
        const bord = [d.x, d.y + Math.round(d.h * 0.3)];
        const fond = [d.x + Math.round(d.w * 0.12), d.y + Math.round(d.h * 0.12)];
        if (d.x > 0 && loinDesTraits(plan, ...bord)) {
          vus += 1;
          if (rgbHex(pixel(image, ...bord)) !== d.bord) fautes.push(`${d.id} bord ${rgbHex(pixel(image, ...bord))} au lieu de ${d.bord}`);
        }
        if (loinDesTraits(plan, ...fond) && rgbHex(pixel(image, ...fond)) !== d.fond) fautes.push(`${d.id} fond ${rgbHex(pixel(image, ...fond))} au lieu de ${d.fond}`);
      }
      v.egal(`pixels de contrôle des dalles (${vus} bords vérifiés)`, fautes, []);
      v.vrai('bords vérifiés sur plusieurs dalles', vus >= 4);
      v.egal('cadre blanc : coins haut gauche et bas droit', [rgbHex(pixel(image, 0, 0)), rgbHex(pixel(image, plan.largeur - 1, plan.hauteur - 1))], ['#ffffff', '#ffffff']);
      const { x, y, cote } = plan.damier;
      const p = (dx, dy) => rgbHex(pixel(image, x + dx, y + dy));
      v.vrai(`damier de ${cote} px en (${x}, ${y}) : pixels alternés noir et blanc`, [64, 32, 16].includes(cote) && ['#000000', '#ffffff'].includes(p(0, 0)) && p(1, 0) !== p(0, 0) && ['#000000', '#ffffff'].includes(p(1, 0)) && p(1, 1) === p(0, 0) && p(cote - 1, cote - 1) === p(0, 0) && p(cote - 2, cote - 1) !== p(0, 0));
      v.egal('fond de la dalle : couleur du port à environ 25 %', plan.dalles.every((d) => {
        const [a, b] = [d.bord, d.fond].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
        return a.every((k, i) => Math.abs(b[i] - Math.round(k * 0.25)) <= 1);
      }), true);
    },
  },
  {
    id: 'N20',
    titre: 'Mire par processeur (mur réparti sur 2 S8) : une mire par zone, à la taille de la zone, en tête « Processeur n, modèle », coordonnées relatives à la zone, seulement les ports de ce processeur',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const c = murCable(contexte, 24, 3);
      v.egal('mur de 24 × 3 BP2 V2 : 2 S8', c.evaluation.groupes.length, 2);
      const r = mire.preparerMires({ ...c, date: '3 octobre 2026' });
      v.egal('une mire par processeur, à la taille de sa zone', r.processeurs.map((p) => [p.numero, p.largeur, p.hauteur]), c.evaluation.groupes.map((g, i) => [i + 1, g.largeurPx, g.hauteurPx]));
      const p2 = r.processeurs[1];
      v.egal('nom du fichier', p2.nom, `mire_proc2_${p2.largeur}x${p2.hauteur}.png`);
      v.egal('en tête : « Processeur 2, S8 »', p2.plan.bloc.lignes[0], `Processeur 2, ${c.evaluation.processeur.modele}`);
      const premiere = p2.plan.dalles.find((d) => d.x === 0 && d.y === 0);
      v.egal('première dalle de la zone : coordonnées relatives, « x 0 y 0 »', premiere?.textes[2]?.texte, 'x 0 y 0');
      v.vrai('seulement les ports du processeur 2', p2.plan.dalles.every((d) => d.textes[0].texte.startsWith('2.')));
      const image = await decoder(await mire.pngRvb(mire.dessinerMire(p2.plan)));
      v.egal('PNG du processeur 2 à la taille de sa zone', [image.width, image.height], [p2.largeur, p2.hauteur]);
    },
  },
  {
    id: 'N21',
    titre: 'Limite du canvas mesurée sur l\'appareil (dernier pixel dessiné puis relu), jamais codée en dur ; mur au-delà de la limite : pas de mire du mur entier, un message, les mires par processeur proposées',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const limite = mire.surfaceCanvasMax();
      v.vrai(`limite mesurée sur ce navigateur : ${limite.toLocaleString('fr-FR')} px, au moins 16 777 216 (4096 × 4096)`, limite >= 16777216);
      v.vrai('la limite est une vraie frontière : un canvas de cette surface marche', mire.canvasPossible(4096, Math.floor(limite / 4096)));
      v.egal('limite gardée pour la session', mire.surfaceCanvasMax(), limite);
      const c = murCable(contexte, 24, 3);
      const r = mire.preparerMires({ ...c, date: '3 octobre 2026', surfaceMax: 1500000 });
      v.egal('mur de 2,2 M px au-delà d\'une limite de 1,5 M px : pas de mire du mur entier', [r.mur.possible, r.mur.plan], [false, null]);
      v.vrai('message : trop grande pour cet appareil, mires par processeur', /trop grande/.test(r.mur.message ?? '') && /par processeur/.test(r.mur.message ?? ''));
      v.egal('mires par processeur possibles', r.processeurs.map((p) => p.possible), [true, true]);
      const seul = mire.preparerMires({ ...murCable(contexte, 4, 3), date: '3 octobre 2026', surfaceMax: 100000 });
      v.vrai('un seul processeur au-delà de la limite : message, aucune mire', !seul.mur.possible && seul.processeurs.length === 0 && /trop grande/.test(seul.mur.message ?? ''));
    },
  },
  {
    id: 'N22',
    titre: 'Mire dans le cadre de la source : image à la taille du cadre standard, mur placé en X, Y, le reste en gris très foncé avec « hors mur » ; mur qui ne tient pas dans le cadre : message',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const c = murCable(contexte, 4, 3);
      const r = mire.preparerMires({ ...c, date: '3 octobre 2026', cadre: { largeurPx: 1920, hauteurPx: 1080, x: 100, y: 50 } });
      const plan = r.mur.plan;
      v.egal('taille : le cadre ; mur en X, Y', [plan.largeur, plan.hauteur, plan.mur.x, plan.mur.y, plan.mur.largeur, plan.mur.hauteur], [1920, 1080, 100, 50, c.mur.pxLargeur, c.mur.pxHauteur]);
      v.egal('nom du fichier : taille du cadre', r.mur.nom, 'mire_1920x1080.png');
      v.egal('mention « hors mur »', plan.horsMur?.texte, 'hors mur');
      const image = await decoder(await mire.pngRvb(mire.dessinerMire(plan)));
      v.egal('hors du mur : gris très foncé ; coin du mur : blanc', [rgbHex(pixel(image, 0, 0)), rgbHex(pixel(image, 99, 49)), rgbHex(pixel(image, 100, 50)), rgbHex(pixel(image, 100 + c.mur.pxLargeur - 1, 50 + c.mur.pxHauteur - 1))],
        [mire.GRIS_HORS_MUR, mire.GRIS_HORS_MUR, '#ffffff', '#ffffff']);
      const dehors = mire.preparerMires({ ...c, date: '3 octobre 2026', cadre: { largeurPx: 1920, hauteurPx: 1080, x: 1500, y: 0 } });
      v.vrai('mur qui dépasse du cadre : pas de mire, message', !dehors.mur.possible && /ne tient pas/.test(dehors.mur.message ?? ''));
    },
  },
  {
    id: 'N23',
    titre: 'Écran « Mire et fiche contenu » hors ligne : boutons des mires (mur entier et par processeur), mire générée sans accès au réseau ; fiche contenu (ratio, zones par processeur, consignes sourcées, texte partagé sans tiret) ; fichiers dans le cache du service worker',
    etape: 'mire',
    async verifier(v, contexte) {
      const cache = listeCache(contexte.fichiers?.['sw.js']);
      v.egal('fichiers de la mire et de la fiche dans le cache du service worker', ['src/contenu.js', 'src/mire.js', 'src/ecran-mire.js', 'data/fiche-contenu.json'].filter((f) => !cache.includes(f)), []);
      const module = await moduleAppli(v, '../src/ecran-mire.js');
      const donnees = contexte.ficheContenu;
      v.vrai('data/fiche-contenu.json lu', Boolean(donnees));
      if (!module || !donnees) return;
      const c = murCable(contexte, 24, 3);
      await sansReseau(async (appels) => {
        const racine = document.createElement('div');
        racine.style.cssText = 'position:absolute;left:-10000px;top:0;width:375px';
        document.body.append(racine);
        try {
          const ecran = module.monterMireFiche(racine, donnees, { contexte: () => c, date: new Date(2026, 9, 3), version: 'v15', surfaceMax: 16777216 });
          ecran.afficher('mire');
          v.egal('mires proposées : mur entier et un bouton par processeur', [...racine.querySelectorAll('.mf-generer')].map((b) => b.dataset.mire), ['mur', 'p1', 'p2']);
          await ecran.generer('p2');
          v.vrai('mire du processeur 2 générée et affichée', Boolean(racine.querySelector('.mf-apercu img')) && /mire_proc2_/.test(texteDe(racine.querySelector('.mf-apercu'))));
          ecran.afficher('fiche');
          const texte = ecran.texte();
          v.vrai('fiche : ratio réduit et décimal', texte.includes(`ratio ${c.mur.pxLargeur / 2 === c.mur.pxHauteur ? '2:1 (2,00)' : ''}`) || /ratio \d+:\d+ \(\d+,\d\d\)/.test(texte));
          v.egal('fiche : zones des 2 processeurs', racine.querySelectorAll('.mf-zone').length, 2);
          v.egal('consignes fixes, chacune avec sa source', [racine.querySelectorAll('.mf-consignes > li').length, [...racine.querySelectorAll('.mf-consignes > li')].every((li) => li.querySelector('.dep-sources, .mf-sources'))], [9, true]);
          v.egal('texte partagé : aucun tiret', texte.match(/[-—–]/g), null);
          v.vrai('texte partagé : première ligne « Fiche contenu », mire jointe', /^Fiche contenu/.test(texte) && /Carte des dalles jointe : mire_/.test(texte));
          v.egal('aucun accès au réseau', appels, []);
        } finally {
          racine.remove();
        }
      });
    },
  },
  {
    id: 'N24',
    titre: 'Écran « Mire et fiche contenu » en grand affichage, thème sombre et mode rouge : texte de 19 px, boutons de 60 px, texte à 4,5:1 sur son fond, rien ne déborde à 375 px (styles.css)',
    etape: 'mire',
    async verifier(v, contexte) {
      const module = await moduleAppli(v, '../src/ecran-mire.js');
      const donnees = contexte.ficheContenu;
      if (!module || !donnees) {
        v.vrai('module et données de la fiche', false);
        return;
      }
      const feuille = document.createElement('link');
      feuille.rel = 'stylesheet';
      feuille.href = 'styles.css';
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      const c = murCable(contexte, 24, 3);
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, police] = taille === 'grand' ? [60, 19] : [48, 0];
            const racine = document.createElement('div');
            racine.style.cssText = 'position:absolute;left:-10000px;top:0;width:375px;background:var(--fond);color:var(--texte)';
            document.body.append(racine);
            const ecran = module.monterMireFiche(racine, donnees, { contexte: () => c, date: new Date(2026, 9, 3), version: 'v15', surfaceMax: 16777216 });
            const fautes = [];
            for (const section of ['mire', 'fiche']) {
              ecran.afficher(section);
              racine.querySelectorAll('details').forEach((x) => { x.open = true; });
              for (const e of [...racine.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getClientRects().length)) {
                const style = getComputedStyle(e);
                if (police && !e.closest('sup, .mf-exposant') && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${section} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const k = contraste(rgbVersHex(style.color), fondDe(e));
                if (k < 4.5) fautes.push(`${section} : « ${texteDe(e).slice(0, 30)} » à ${k.toFixed(2)}:1`);
              }
              for (const b of racine.querySelectorAll('button, summary, select, input')) {
                if (!b.getClientRects().length || b.matches('input[type="checkbox"], input[type="radio"]')) continue;
                const h = b.getBoundingClientRect().height;
                if (h < mini - 0.5) fautes.push(`${section} : « ${(texteDe(b) || b.name || b.tagName).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (racine.scrollWidth > 375.5) fautes.push(`${section} : ${racine.scrollWidth} px de large`);
            }
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            racine.remove();
          }
        }
      } finally {
        feuille.remove();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N25',
    titre: 'Dépannage : « mire de l\'appli » (nouvelles étapes 1 de T5.2 et T5.3) est un lien qui ouvre la mire',
    etape: 'mire',
    async verifier(v, contexte) {
      const d = contexte.depannage;
      const module = await moduleDepannage(v);
      if (!d || !module) return;
      const ouvertures = [];
      const m = monterDepannage(module, d, { projet: null, ouvrirMire: () => ouvertures.push('mire') });
      for (const id of ['T5.2', 'T5.3']) {
        m.ecran.afficher(id);
        const lien = m.racine.querySelector('.dep-etape .dep-lien-mire');
        v.egal(`${id}, étape 1 : lien « mire de l'appli »`, [texteDe(m.racine.querySelector('.dep-etape .contenu-liste')).startsWith('Affiche la mire de l\'appli'), texteDe(lien)], [true, 'mire de l\'appli']);
        lien?.click();
      }
      v.egal('chaque lien ouvre la mire', ouvertures, ['mire', 'mire']);
      m.retirer();
    },
  },
  {
    id: 'N26',
    titre: 'Mire : libellés des dalles prioritaires (retouche du 03/10/2026). Chaque dalle a sa ligne 1 ; le bloc d\'infos et le damier vont dans la moitié basse de la dalle la plus proche du centre, sans toucher ses bords ni une zone de libellé ; damier de 64, 32 ou 16 px ; bloc par priorité (processeur, projet, résolution, puis date et version) ; tout le texte avec un contour sombre (2 px en ligne 1, 1 px sinon)',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const coupe = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const cas = [
        ['mur 12 × 6, un MCTRL660', mire.preparerMires({ ...murCable(contexte, 12, 6, 'novastar-mctrl660'), projet: 'Salon B', date: '3 octobre 2026', version: 'v15' }).mur.plan],
        ['mire du processeur 2, 24 × 3 sur deux S8', mire.preparerMires({ ...murCable(contexte, 24, 3), projet: 'Salon B', date: '3 octobre 2026', version: 'v15' }).processeurs[1]?.plan],
      ];
      for (const [nom, plan] of cas) {
        if (!plan) {
          v.vrai(`${nom} : plan`, false);
          continue;
        }
        v.egal(`${nom} : chaque dalle a sa ligne 1`, plan.dalles.filter((d) => !d.textes[0]?.texte).map((d) => d.id), []);
        const zones = plan.dalles.flatMap((d) => d.textes.map((t) => ({ ...t.boite, id: d.id })));
        v.vrai(`${nom} : chaque libellé a sa zone`, zones.length > 0 && zones.every((b) => b.w > 0 && b.h > 0));
        const centre = [plan.mur.x + plan.mur.largeur / 2, plan.mur.y + plan.mur.hauteur / 2];
        const distance = (d) => Math.hypot(d.x + d.w / 2 - centre[0], d.y + d.h / 2 - centre[1]);
        const proche = [...plan.dalles].sort((a, b) => distance(a) - distance(b))[0];
        const b = plan.bloc;
        const dm = plan.damier ? { x: plan.damier.x, y: plan.damier.y, w: plan.damier.cote, h: plan.damier.cote } : null;
        const dansMoitieBasse = (r) => r.x >= proche.x + 2 && r.x + r.w <= proche.x + proche.w - 2 && r.y >= proche.y + proche.h / 2 && r.y + r.h <= proche.y + proche.h - 2;
        v.vrai(`${nom} : bloc d'infos dans la moitié basse de ${proche.id}, la dalle la plus proche du centre, sans toucher ses bords`, Boolean(b) && dansMoitieBasse(b));
        v.vrai(`${nom} : damier de 64, 32 ou 16 px dans la même moitié basse`, dm === null || ([64, 32, 16].includes(dm.w) && dansMoitieBasse(dm)));
        v.vrai(`${nom} : damier présent (la place suffit)`, dm !== null);
        const z = plan.zoneBloc;
        v.vrai(`${nom} : zone libre de la demi-dalle sous les libellés, sans toucher les bords`, Boolean(z) && dansMoitieBasse(z) && zones.every((x) => !coupe(x, z)));
        v.egal(`${nom} : damier de la plus grande taille qui tient dans la demi-dalle (zone libre de ${z?.w} × ${z?.h} px)`, dm?.w ?? null, [64, 32, 16].find((c) => c <= z?.h && c <= z?.w) ?? null);
        v.egal(`${nom} : libellés croisés par le bloc ou le damier`, zones.filter((z) => coupe(z, b) || (dm && coupe(z, dm))).map((z) => z.id), []);
        v.vrai(`${nom} : bloc et damier ne se croisent pas`, !dm || !coupe(b, dm));
        v.egal(`${nom} : contour sombre de tout le texte, 2 px en ligne 1, 1 px en lignes 2 et 3`,
          plan.dalles.flatMap((d) => d.textes.map((t, i) => t.contour === (i === 0 ? 2 : 1))).every(Boolean) && plan.bloc.contour === 1, true);
      }
      v.egal('bloc de la mire du processeur 2 : processeur, projet, résolution d\'abord', cas[1][1]?.bloc.lignes.slice(0, 3), ['Processeur 2, S8', 'Salon B', '2112 × 528 px']);
    },
  },
  {
    id: 'N27',
    titre: 'Mire : la version écrite dans le bloc vient de la même source que la version du cache (le service worker qui sert l\'appli, sinon sw.js) ; elles sont égales',
    etape: 'mire',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      const ecranMire = await moduleAppli(v, '../src/ecran-mire.js');
      const donnees = contexte.ficheContenu;
      if (!mire || !ecranMire || !donnees) return;
      const version = await mire.versionAppli?.();
      const controle = navigator.serviceWorker?.controller;
      if (controle) v.vrai(`page servie par le service worker : son cache mur-led-${version?.slice(1)} existe`, (await caches.keys()).includes(`mur-led-${version?.slice(1)}`));
      else v.egal('version de la mire : celle de sw.js', version, `v${versionCache(contexte.fichiers?.['sw.js'])}`);
      const racine = document.createElement('div');
      racine.style.cssText = 'position:absolute;left:-10000px;top:0;width:375px';
      document.body.append(racine);
      const ecran = ecranMire.monterMireFiche(racine, donnees, { contexte: () => murCable(contexte, 4, 3), date: new Date(2026, 9, 3), surfaceMax: 16777216 });
      await ecran.pret;
      v.egal('écran de la mire : même version, sans la lui donner', ecran.version?.(), version);
      racine.remove();
    },
  },
  {
    id: 'N28',
    titre: 'Mire et fiche : sous chaque ligne un libellé court de source (« Elecom (site tiers) », « Tessera §6.3 », « AVIXA DISCAS »…), sans lien ; titres complets et liens seulement dans la liste des sources en bas de l\'écran ; introductions sans citation de la transcription',
    etape: 'mire',
    async verifier(v, contexte) {
      const module = await moduleAppli(v, '../src/ecran-mire.js');
      const donnees = contexte.ficheContenu;
      if (!module || !donnees) return;
      for (const enLigne of [false, true]) {
        const racine = document.createElement('div');
        racine.style.cssText = 'position:absolute;left:-10000px;top:0;width:375px';
        document.body.append(racine);
        const ecran = module.monterMireFiche(racine, donnees, { contexte: () => murCable(contexte, 24, 3), date: new Date(2026, 9, 3), version: 'v15', surfaceMax: 16777216, enLigne: () => enLigne });
        ecran.afficher('fiche');
        const consignes = [...racine.querySelectorAll('.mf-consignes > li')];
        const sources = (li) => texteDe(li?.querySelector('.mf-sources'));
        if (!enLigne) {
          v.egal('consigne 1 : « Elecom (site tiers) »', sources(consignes[0]), 'Elecom (site tiers)');
          v.egal('consigne 4 : renvois et libellés courts', sources(consignes[3]), '1 Elecom (site tiers) ; LEDWallCentral (site tiers) ; 2 Tessera §12.1');
          const hors = [...racine.querySelectorAll('*')].filter((e) => !e.closest('.mf-liste-sources') && [...e.childNodes].some((n) => n.nodeType === 3 && /checklist complète|Content creation essentials|User Manual/.test(n.textContent)));
          v.egal('titres complets hors de la liste des sources', hors.length, 0);
          v.egal('intro de la fiche : texte d\'écran', texteDe(racine.querySelector('.mf-fiche .mf-bloc .mf-texte-ligne')), 'Ce que le graphiste et la régie doivent respecter. Envoie la fiche avec la mire, puis câble exactement comme la carte envoyée.');
        }
        const liste = racine.querySelector('.mf-fiche .mf-liste-sources');
        v.egal(`${enLigne ? 'en ligne' : 'hors ligne'} : liste des sources en bas, 16 entrées`, liste?.querySelectorAll('.mf-source-entree').length, 16);
        v.egal(`${enLigne ? 'en ligne' : 'hors ligne'} : liens seulement dans la liste, et seulement en ligne`,
          [racine.querySelectorAll('.mf-sources a').length, (liste?.querySelectorAll('a[href^="https://"]').length ?? 0) > 0], [0, enLigne]);
        ecran.afficher('mire');
        v.egal(`${enLigne ? 'en ligne' : 'hors ligne'} : intro de la mire : texte d'écran`, texteDe(racine.querySelector('.mf-mire .mf-bloc .mf-texte-ligne')),
          'Image à la résolution exacte du mur : chaque dalle porte son numéro et la couleur de son port, comme sur le schéma. Affichée depuis la source, elle vérifie tout le chemin jusqu\'aux dalles.');
        v.vrai(`${enLigne ? 'en ligne' : 'hors ligne'} : liste des sources aussi en bas de la mire`, Boolean(racine.querySelector('.mf-mire .mf-liste-sources')));
        racine.remove();
      }
    },
  },
  {
    id: 'N29',
    titre: 'Pourquoi ? : sous une alerte de surcharge de port (Data), un lien « Pourquoi ? » ouvre la fiche D1 sans quitter l\'écran ; la fiche : sa question en titre, « La règle », « L\'image », « En vrai », « Si tu ne la respectes pas », une source courte sous chaque ligne sourcée',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const d = contexte.pourquoi;
      const t = contexte.pourquoiLiens;
      v.vrai('données lues', Boolean(d && t));
      if (!pq || !d || !t) return;
      const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' },
        el('section', { id: 'data' }, el('div', { class: 'alerte' }, 'Câblage retenu, en colonnes entières : un port est chargé à 97,4 %, au-delà de 95 %. Garde de la marge.')));
      document.body.append(cadre);
      const ouvertes = [];
      const hash = location.hash;
      pq.relierPourquoi(t, { racine: cadre, ouvrir: (id) => ouvertes.push(id) });
      pq.relierPourquoi(t, { racine: cadre, ouvrir: (id) => ouvertes.push(id) });
      const liens = cadre.querySelectorAll('.lien-pourquoi');
      v.egal('un seul lien « Pourquoi ? », vers D1, même relié deux fois', [liens.length, texteDe(liens[0]), liens[0]?.dataset.fiche], [1, 'Pourquoi ?', 'D1']);
      liens[0]?.click();
      v.egal('appui : la fiche D1 s\'ouvre, l\'écran ne change pas', [ouvertes, location.hash], [['D1'], hash]);
      cadre.remove();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ecran = pq.monterPourquoi(racine, d, { enLigne: () => false });
      ecran.afficherFiche('D1');
      const d1 = d.fiches.find((f) => f.id === 'D1');
      v.egal('titre : la question', texteDe(racine.querySelector('.pq-question')), d1.question);
      v.egal('parties', [...racine.querySelectorAll('.pq-partie h3')].map(texteDe), ['La règle', 'L\'image', 'En vrai', 'Si tu ne la respectes pas']);
      v.egal('sources courtes sous « La règle »', texteDe(racine.querySelector('.pq-partie .pq-sources')), 'Fiches Novastar ; Tessera p.205');
      v.vrai('titres complets seulement dans la liste des sources', !texteDe([...racine.querySelectorAll('.pq-partie')].map((x) => texteDe(x)).join(' ')).includes('Tessera User Manual') && texteDe(racine.querySelector('.pq-liste-sources')).includes('Tessera User Manual'));
      ecran.afficherFiche('E1');
      const versE2 = racine.querySelector('.pq-lien-fiche[data-fiche="E2"]');
      v.vrai('E1 : « (E2) » est un lien vers E2', Boolean(versE2));
      versE2?.click();
      v.egal('lien vers E2 : la fiche E2 s\'ouvre', texteDe(racine.querySelector('.pq-question')), d.fiches.find((f) => f.id === 'E2').question);
      racine.remove();
    },
  },
  {
    id: 'N30',
    titre: 'Pourquoi ? : « EDID » dans T5.3 et T6.5 du Dépannage ouvre I8, l\'étape HDCP de T6.6 ouvre I9, « Sortie demandée à la régie » de la fiche contenu ouvre I8',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const moduleD = await moduleDepannage(v);
      const moduleMire = await moduleAppli(v, '../src/ecran-mire.js');
      const t = contexte.pourquoiLiens;
      if (!pq || !moduleD || !moduleMire || !t || !contexte.depannage || !contexte.ficheContenu) {
        v.vrai('modules et données', false);
        return;
      }
      const ouvertes = [];
      const m = monterDepannage(moduleD, contexte.depannage, { projet: null, liensPourquoi: t.liens, ouvrirPourquoi: (id) => ouvertes.push(id) });
      for (const [noeud, mot, fiche] of [['T5.3', 'EDID', 'I8'], ['T6.5', 'EDID', 'I8'], ['T6.6', 'HDCP', 'I9']]) {
        m.ecran.afficher(noeud);
        const lien = m.racine.querySelector(`.dep-contenu .dep-lien-pourquoi[data-fiche="${fiche}"]`);
        v.egal(`${noeud} : « ${mot} » en lien vers ${fiche}, une seule fois`, [texteDe(lien), m.racine.querySelectorAll('.dep-lien-pourquoi').length], [mot, 1]);
        lien?.click();
      }
      v.egal('liens du Dépannage ouverts', ouvertes, ['I8', 'I8', 'I9']);
      m.retirer();
      const cadre = el('div', { id: 'mire-fiche', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      const racine = el('div');
      cadre.append(racine);
      const ecranMire = moduleMire.monterMireFiche(racine, contexte.ficheContenu, { contexte: () => murCable(contexte, 4, 3), date: new Date(2026, 9, 3), version: 'v16', surfaceMax: 16777216 });
      ecranMire.afficher('fiche');
      const fiche = [];
      pq.relierPourquoi(t, { racine: document, ouvrir: (id) => fiche.push(id) });
      const dt = [...cadre.querySelectorAll('.mf-valeurs dt')].find((x) => texteDe(x).startsWith('Sortie demandée à la régie'));
      dt?.querySelector('.lien-pourquoi')?.click();
      v.egal('« Sortie demandée à la régie » : I8', fiche, ['I8']);
      cadre.remove();
    },
  },
  {
    id: 'N31',
    titre: 'Pourquoi ? : l\'accueil du Dépannage (« Comprendre les règles ») mène aux fiches, maintenant dans l\'onglet Apprendre ; il montre les quatre images de base, puis les cinq familles avec leur nombre de fiches (50 en tout), et une fiche s\'ouvre d\'un appui',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const moduleD = await moduleDepannage(v);
      const d = contexte.pourquoi;
      if (!ap || !moduleD || !d) {
        v.vrai('modules et données', false);
        return;
      }
      const listes = [];
      const m = monterDepannage(moduleD, contexte.depannage, { projet: null, ouvrirListePourquoi: () => listes.push('liste') });
      const bouton = m.racine.querySelector('.dep-bouton-pourquoi');
      v.egal('accueil du Dépannage : « Comprendre les règles »', texteDe(bouton), 'Comprendre les règles');
      bouton?.click();
      v.egal('appui : les fiches s\'ouvrent', listes, ['liste']);
      m.retirer();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ouvertes = [];
      const ecran = ap.monterApprendre(racine, { pourquoi: d, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: (id) => ouvertes.push(id), ouvrirEntrainement: () => {} });
      await ecran.pret;
      v.egal('quatre images de base', [...racine.querySelectorAll('.ap-image strong')].map(texteDe), d.images.map((x) => x.titre));
      v.vrai('les images avant les familles', Boolean(racine.querySelector('.ap-images')?.compareDocumentPosition(racine.querySelector('.ap-familles')) & Node.DOCUMENT_POSITION_FOLLOWING));
      v.egal('familles et nombre de fiches', [...racine.querySelectorAll('button.ap-famille')].map((f) => `${texteDe(f.querySelector('.ap-famille-titre'))} ${texteDe(f.querySelector('.ap-compte'))}`), ['Données 22', 'Électricité 6', 'Image 14', 'Régie et chaîne vidéo 4', 'Accroche 4']);
      racine.querySelector('button.ap-famille[data-famille="image"]')?.click();
      racine.querySelector('.pq-fiche-bouton[data-fiche="I8"]')?.click();
      v.egal('appui sur I8 : la fiche I8 s\'ouvre', ouvertes, ['I8']);
      racine.remove();
    },
  },
  {
    id: 'N32',
    titre: 'Pourquoi ? hors ligne, en grand affichage, en thème sombre et en mode rouge : fiche sans accès au réseau, texte de 19 px, boutons de 60 px, texte à 4,5:1, rien ne déborde à 375 px ; liens web des sources seulement en ligne',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const d = contexte.pourquoi;
      if (!pq || !d) return;
      await sansReseau(async (appels) => {
        const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
        document.body.append(racine);
        const ecran = pq.monterPourquoi(racine, d);
        ecran.afficherFiche('I8');
        v.egal('hors ligne : aucun accès au réseau, aucun lien web', [appels, racine.querySelectorAll('a[href^="http"]').length], [[], 0]);
        racine.remove();
      });
      const enLigne = el('div');
      document.body.append(enLigne);
      pq.monterPourquoi(enLigne, d, { enLigne: () => true }).afficherFiche('E2');
      v.vrai('en ligne : liens web dans la liste des sources seulement', enLigne.querySelectorAll('.pq-liste-sources a[href^="https://"]').length > 0 && enLigne.querySelectorAll('.pq-sources a').length === 0);
      enLigne.remove();
      const feuille = el('link', { rel: 'stylesheet', href: 'styles.css' });
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, police] = taille === 'grand' ? [60, 19] : [48, 0];
            const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px;background:var(--fond);color:var(--texte)' });
            document.body.append(racine);
            const ecran = pq.monterPourquoi(racine, d, { enLigne: () => false });
            const fautes = [];
            for (const [nom, aller] of [['I8', () => ecran.afficherFiche('I8')], ['E1', () => ecran.afficherFiche('E1')]]) {
              aller();
              for (const e of [...racine.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getClientRects().length)) {
                const style = getComputedStyle(e);
                if (police && !e.closest('sup') && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const k = contraste(rgbVersHex(style.color), fondDe(e));
                if (k < 4.5) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » à ${k.toFixed(2)}:1`);
              }
              for (const b of racine.querySelectorAll('button')) {
                if (!b.getClientRects().length || b.closest('.pq-lien-fiche')) continue;
                const h = b.getBoundingClientRect().height;
                if (h < mini - 0.5) fautes.push(`${nom} : « ${texteDe(b).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (racine.scrollWidth > 375.5) fautes.push(`${nom} : ${racine.scrollWidth} px de large`);
            }
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            racine.remove();
          }
        }
      } finally {
        feuille.remove();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N33',
    titre: 'Pourquoi ? : huit liaisons du second lot, chacune ouvre la bonne fiche, sur le texte réel de l\'appli : une seule dalle au-delà des limites d\'un processeur (canevas ou carte ; la limite d\'un port a son propre message, relié à D1) → D14 ; aucun découpage ne tient → D5 ; processeur qui refuse la profondeur et entrée limitée en bits → D3 ; ULL hors SX40 et S8 → D9 ; HFR → D2 ; P17 bleu et rouge, 32 A tri → E4 ; structure à 5 fois le poids (ROE) → A1 ; élingues acier → A4 (second lot)',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const t = contexte.pourquoiLiens;
      if (!pq || !t) return;
      const proc = (id) => processeurDeBase(contexte, id);
      const evaluer = (dalle, colonnes, rangees, id, reglages) => calculs.evaluerProcesseur(calculs.mur(dalle, colonnes, rangees), dalle, proc(id), reglages);
      // 300 000 px : tient dans un port du M2 (525 000 px en 8 bits), dans aucun de ses formats (1920 × 1080, Low Latency jusqu'à 2880 × 720).
      const large = { id: 'fictive-3000x100', nom: 'Dalle 3000 × 100 px', fictive: true, largeurMm: 3000, hauteurMm: 100, pxH: 3000, pxV: 100 };
      const hfr = { id: 'fictive-120k', nom: 'Dalle 400 × 300 px', fictive: true, largeurMm: 500, hauteurMm: 375, pxH: 400, pxV: 300 };
      const textes = {
        dalleLimites: evaluer(large, 2, 1, 'brompton-m2', { frequenceHz: 60, bits: 8 }).impossible,
        // Cas rare (une dalle passe, aucune grille ne tient) : la phrase du code, avec le nom du processeur.
        decoupage: `Aucun découpage en colonnes et en rangées ne tient dans des ${proc('brompton-s8').nom}.`,
        profondeur: calculs.refusBitsReseau(proc('coex-ku20'), 10),
        entreeBits: calculs.controleEntree(proc('novastar-vx400-pro'), { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60, liaison: 'hdmi-1.3', bits: 10 }, liaisonsDeBase(contexte)).refus,
        ull: evaluer(DALLE_192, 4, 2, 'brompton-s4', { frequenceHz: 60, bits: 10, ull: true }).impossible,
        hfr: evaluer(hfr, 4, 2, 'brompton-sx40', { frequenceHz: 120, bits: 8 }).alertes.find((x) => x.startsWith('HFR')),
        p17: 'P17 bleu = 230 V, P17 rouge = 400 V triphasé ; 32 A tri = 3 phases de 32 A.',
        structure: calculs.RAPPELS_POIDS.find((x) => x.startsWith('Structure dimensionnée')),
        elingues: calculs.RAPPELS_POIDS.find((x) => x.startsWith('Préfère les élingues')),
      };
      v.egal('textes réels obtenus', Object.entries(textes).filter(([, x]) => !x).map(([k]) => k), []);
      v.vrai('n° 1 : la dalle passe la capacité d\'un port, pas le canevas du M2', /^Une seule dalle \(3000 × 100 px\) dépasse les limites d'un /.test(textes.dalleLimites ?? ''));
      const cas = [
        ['data', 'alerte', textes.dalleLimites, 'D14'],
        ['data', 'alerte', textes.decoupage, 'D5'],
        ['data', 'alerte', textes.profondeur, 'D3'],
        ['canvas', 'alerte', textes.entreeBits, 'D3'],
        ['data', 'alerte', textes.ull, 'D9'],
        ['data', 'alerte', textes.hfr, 'D2'],
        ['elec', 'rappel', textes.p17, 'E4'],
        ['poids', 'rappel', textes.structure, 'A1'],
        ['poids', 'rappel', textes.elingues, 'A4'],
      ];
      const obtenu = [];
      for (const [ecran, genre, texte, attendu] of cas) {
        const element = genre === 'alerte' ? el('p', { class: 'alerte alerte-erreur' }, texte ?? '') : el('li', {}, texte ?? '');
        const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' },
          el('section', { id: ecran }, genre === 'alerte' ? element : el('ul', { class: 'rappels' }, element)));
        document.body.append(cadre);
        const ouvertes = [];
        pq.relierPourquoi(t, { racine: cadre, ouvrir: (id) => ouvertes.push(id) });
        const liens = cadre.querySelectorAll('.lien-pourquoi');
        liens[0]?.click();
        obtenu.push(`${ecran} « ${(texte ?? '').slice(0, 40)} » : ${liens.length} lien${liens.length > 1 ? 's' : ''}, ${ouvertes.join(',') || 'rien'}`);
        cadre.remove();
      }
      v.egal('chaque lien ouvre la bonne fiche', obtenu,
        cas.map(([ecran, , texte, attendu]) => `${ecran} « ${(texte ?? '').slice(0, 40)} » : ${attendu ? '1 lien' : '0 lien'}, ${attendu ?? 'rien'}`));
    },
  },
  {
    id: 'N34',
    titre: 'Pourquoi ? second lot : une alerte par nouvelle famille ouvre la bonne fiche, sur le texte réel de l\'appli : dalles de moins de 16 px (D16, Data), switch manageable dans le réseau Brompton (D21, Data), plage Limited (I11, Canvas), budget d\'une régie dépassé (R1, Canvas), pont sur plus de 4 points (A3, Poids)',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const t = contexte.pourquoiLiens;
      if (!pq || !t) return;
      const liaisons = liaisonsDeBase(contexte);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const petite = { id: 'fictive-200x15', nom: 'Dalle 200 × 15 px', fictive: true, largeurMm: 500, hauteurMm: 37.5, pxH: 200, pxV: 15 };
      const e = calculs.evaluerProcesseur(calculs.mur(DALLE_192, 10, 5), DALLE_192, sx40, { frequenceHz: 60, bits: 10 });
      const cas = [
        ['data', 'D16', calculs.evaluerProcesseur(calculs.mur(petite, 4, 4), petite, sx40, { frequenceHz: 60, bits: 10 }).alertes.find((x) => x.startsWith('Dalles de moins de 16 px'))],
        ['data', 'D21', calculs.reseauBrompton({ switches: 1, switchManageable: true }).refus.find((x) => x.startsWith('Switch manageable'))],
        ['canvas', 'I11', calculs.controleSource({ largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60, bits: 10, liaison: 'hdmi-2.0', espace: 'RGB', plage: 'Limited' },
          e, liaisons, { famille: 'brompton', bitsReseau: 10, frequenceHz: 60 }).alertes.find((x) => x.startsWith('Plage Limited'))],
        ['canvas', 'R1', calculs.controleRegie(regieDeBase(contexte, 'barco-e2-gen2'), { nombre: 3 }, { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60, liaison: 'hdmi-2.0' }, liaisons)
          .refus.find((x) => x.startsWith('Budget de la régie'))],
        ['poids', 'A3', calculs.poids(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { accroche: { type: 'pont', points: 5, porteesEgales: true } })
          .alertes.find((x) => x.startsWith('Pont sur plus de 4 points'))],
      ];
      v.egal('textes réels obtenus', cas.filter(([, , texte]) => !texte).map(([, f]) => f), []);
      const obtenu = cas.map(([ecran, , texte]) => {
        const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' }, el('section', { id: ecran }, el('p', { class: 'alerte alerte-erreur' }, texte ?? '')));
        document.body.append(cadre);
        const ouvertes = [];
        pq.relierPourquoi(t, { racine: cadre, ouvrir: (id) => ouvertes.push(id) });
        cadre.querySelector('.lien-pourquoi')?.click();
        cadre.remove();
        return `${ecran} « ${(texte ?? '').slice(0, 30)} » : ${ouvertes.join(',') || 'rien'}`;
      });
      v.egal('chaque alerte ouvre sa fiche', obtenu, cas.map(([ecran, f, texte]) => `${ecran} « ${(texte ?? '').slice(0, 30)} » : ${f}`));
    },
  },
  {
    id: 'N35',
    titre: 'Pourquoi ? : la ligne « Recul » de la fiche contenu (BP2 V2 : minimal environ 2,8 m, confortable environ 5,7 m) porte un lien « Pourquoi ? » vers I5 et sa source « Cahier des charges de l\'appli » ; le texte partagé la reprend',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const moduleMire = await moduleAppli(v, '../src/ecran-mire.js');
      const t = contexte.pourquoiLiens;
      if (!pq || !moduleMire || !t || !contexte.ficheContenu) return;
      const cadre = el('div', { id: 'mire-fiche', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      const racine = el('div');
      cadre.append(racine);
      const ecran = moduleMire.monterMireFiche(racine, contexte.ficheContenu, { contexte: () => murCable(contexte, 4, 3), date: new Date(2026, 9, 3), version: 'v17', surfaceMax: 16777216 });
      ecran.afficher('fiche');
      const ouvertes = [];
      pq.relierPourquoi(t, { racine: document, ouvrir: (id) => ouvertes.push(id) });
      const dt = [...cadre.querySelectorAll('.mf-valeurs dt')].find((x) => texteDe(x).startsWith('Recul'));
      const dd = dt?.nextElementSibling;
      v.vrai('ligne « Recul » : minimal environ 2,8 m, confortable environ 5,7 m', texteDe(dd).startsWith('minimal environ 2,8 m, confortable environ 5,7 m'), texteDe(dd));
      v.vrai('source de la ligne : Cahier des charges de l\'appli', texteDe(dd).includes('Cahier des charges de l\'appli'), texteDe(dd));
      dt?.querySelector('.lien-pourquoi')?.click();
      v.egal('« Pourquoi ? » de la ligne « Recul » : I5', ouvertes, ['I5']);
      v.vrai('texte partagé : la ligne du recul', ecran.texte().split('\n').includes('Recul : minimal environ 2,8 m, confortable environ 5,7 m'));
      cadre.remove();
    },
  },
  {
    id: 'N36',
    titre: 'Pourquoi ? second lot en grand affichage, thème sombre et mode rouge : fiches R1, A3, D20 et D21 (texte de 19 px, boutons de 60 px, texte à 4,5:1, rien ne déborde à 375 px) ; une source qui regroupe plusieurs documents (D20 : fiches R2 et R2+, fiches des cartes Novastar) les liste chacun, avec son lien seulement en ligne ; « Règle de l\'appli » sous les lignes de l\'appli (A3)',
    etape: 'pourquoi',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const d = contexte.pourquoi;
      if (!pq || !d) return;
      const enLigne = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(enLigne);
      const e1 = pq.monterPourquoi(enLigne, d, { enLigne: () => true });
      e1.afficherFiche('D20');
      const liste = enLigne.querySelector('.pq-liste-sources');
      const documents = [...(liste?.querySelectorAll('.pq-source-document') ?? [])];
      v.egal('D20 en ligne : 9 documents listés (2 fiches R2, 7 fiches de cartes Novastar), chacun avec son lien', [documents.length, documents.filter((x) => x.querySelector('a[href^="https://"]')).length], [9, 9]);
      v.egal('aucun lien sous les lignes', enLigne.querySelectorAll('.pq-sources a').length, 0);
      e1.afficherFiche('A3');
      v.vrai('A3 : « Règle de l\'appli » sous « La règle »', texteDe(enLigne.querySelector('.pq-partie-regle .pq-sources')).includes('Règle de l\'appli'));
      enLigne.remove();
      const horsLigne = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(horsLigne);
      pq.monterPourquoi(horsLigne, d, { enLigne: () => false }).afficherFiche('D20');
      v.egal('D20 hors ligne : documents listés sans lien', [horsLigne.querySelectorAll('.pq-source-document').length, horsLigne.querySelectorAll('a[href^="http"]').length], [9, 0]);
      horsLigne.remove();
      const feuille = el('link', { rel: 'stylesheet', href: 'styles.css' });
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, police] = taille === 'grand' ? [60, 19] : [48, 0];
            const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px;background:var(--fond);color:var(--texte)' });
            document.body.append(racine);
            const ecran = pq.monterPourquoi(racine, d, { enLigne: () => false });
            const fautes = [];
            for (const id of ['R1', 'A3', 'D20', 'D21']) {
              ecran.afficherFiche(id);
              for (const e of [...racine.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getClientRects().length)) {
                const style = getComputedStyle(e);
                if (police && !e.closest('sup') && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${id} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const k = contraste(rgbVersHex(style.color), fondDe(e));
                if (k < 4.5) fautes.push(`${id} : « ${texteDe(e).slice(0, 30)} » à ${k.toFixed(2)}:1`);
              }
              for (const b of racine.querySelectorAll('button')) {
                if (!b.getClientRects().length || b.closest('.pq-lien-fiche')) continue;
                const h = b.getBoundingClientRect().height;
                if (h < mini - 0.5) fautes.push(`${id} : « ${texteDe(b).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (racine.scrollWidth > 375.5) fautes.push(`${id} : ${racine.scrollWidth} px de large`);
            }
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            racine.remove();
          }
        }
      } finally {
        feuille.remove();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N37',
    titre: 'Listes numérotées (Dépannage T5.2 et T1.3 avec un projet COEX, mode d\'emploi et consignes de la fiche contenu) à 375 px, en affichage normal et en grand affichage, encadrés de marque fermés puis ouverts : chaque numéro est écrit par l\'appli (pas la puce automatique, que Safari décale ou efface à côté d\'un bloc repliable), visible, et tous les numéros d\'une liste ont le même bord gauche ; le contenu de chaque étape, encadré compris, commence au même bord gauche',
    etape: 'depannage',
    async verifier(v, contexte) {
      const moduleD = await moduleDepannage(v);
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      const moduleMire = await moduleAppli(v, '../src/ecran-mire.js');
      if (!moduleD || !pq || !moduleMire || !contexte.depannage || !contexte.pourquoi || !contexte.ficheContenu) return;
      const feuille = el('link', { rel: 'stylesheet', href: 'styles.css' });
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      // Contrôle d'une liste : un numéro écrit par l'appli dans chaque élément, visible, au même bord gauche ; contenus alignés.
      const controleListe = (nom, ol) => {
        const fautes = [];
        if (!ol) return [`${nom} : liste absente`];
        const items = [...ol.children].filter((x) => x.matches('li'));
        const numeros = items.map((li) => li.querySelector(':scope > .numero-liste'));
        if (numeros.some((x) => !x)) return [`${nom} : ${numeros.filter((x) => !x).length} élément(s) sans numéro écrit par l'appli`];
        items.forEach((li, k) => {
          const n = numeros[k];
          const r = n.getBoundingClientRect();
          const rl = li.getBoundingClientRect();
          const style = getComputedStyle(n);
          if (!n.getClientRects().length || r.width < 1 || r.height < 1 || style.visibility === 'hidden' || Number(style.opacity) === 0) fautes.push(`${nom} : numéro ${texteDe(n)} invisible`);
          if (r.left < rl.left - 0.5 || r.right > rl.right + 0.5) fautes.push(`${nom} : numéro ${texteDe(n)} hors de son élément`);
          if (!/^\d+\.$/.test(texteDe(n))) fautes.push(`${nom} : numéro « ${texteDe(n)} »`);
        });
        const bords = numeros.map((x) => x.getBoundingClientRect().left);
        if (Math.max(...bords) - Math.min(...bords) > 0.5) fautes.push(`${nom} : bords gauches des numéros ${bords.map((x) => x.toFixed(1)).join(', ')}`);
        const contenus = items.map((li) => li.querySelector(':scope > .contenu-liste')?.getBoundingClientRect().left ?? NaN);
        if (contenus.some(Number.isNaN) || Math.max(...contenus) - Math.min(...contenus) > 0.5) fautes.push(`${nom} : bords gauches des contenus ${contenus.map((x) => x.toFixed(1)).join(', ')}`);
        return fautes;
      };
      const html = document.documentElement;
      const avant = html.dataset.taille;
      try {
        for (const taille of ['normal', 'grand']) {
          if (taille === 'grand') html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const fautes = [];
          const m = monterDepannage(moduleD, contexte.depannage, { projet: { marque: 'coex', nom: 'COEX MX40 Pro' } });
          for (const noeud of ['T5.2', 'T1.3']) {
            m.ecran.afficher(noeud);
            const marques = [...m.racine.querySelectorAll('details.dep-ligne-marque')];
            if (noeud === 'T5.2' && marques.filter((x) => !x.open).length !== 2) fautes.push('T5.2 : Novastar et Brompton devraient être fermés avec un projet COEX');
            fautes.push(...controleListe(`${noeud} fermés`, m.racine.querySelector('ol.dep-etapes')));
            marques.forEach((x) => { x.open = true; });
            fautes.push(...controleListe(`${noeud} ouverts`, m.racine.querySelector('ol.dep-etapes')));
          }
          m.retirer();
          const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
          document.body.append(cadre);
          const ecran = moduleMire.monterMireFiche(cadre, contexte.ficheContenu, { contexte: () => murCable(contexte, 4, 3), date: new Date(2026, 9, 3), version: 'v17', surfaceMax: 16777216 });
          ecran.afficher('mire');
          fautes.push(...controleListe('mode d\'emploi de la mire', cadre.querySelector('ol.mf-liste')));
          ecran.afficher('fiche');
          fautes.push(...controleListe('consignes de la fiche', cadre.querySelector('ol.mf-consignes')));
          cadre.remove();
          v.egal(`${taille} : numéros visibles et alignés`, fautes.slice(0, 12), []);
        }
      } finally {
        feuille.remove();
        if (avant) html.dataset.taille = avant;
        else delete html.dataset.taille;
      }
    },
  },
  {
    id: 'N38',
    titre: 'Entraînement : la carte « S\'entraîner » est en tête de l\'onglet Apprendre et ouvre le mode ; 9 onglets, Apprendre le dernier, aucun pour le mode lui-même',
    etape: 'entrainement',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      if (!ap || !contexte.pourquoi) return;
      const ouvertures = [];
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: (mode) => ouvertures.push(mode) });
      await ecran.pret;
      const carte = racine.firstElementChild;
      v.egal('premier élément de l\'onglet : la carte « S\'entraîner »', [carte?.matches('.ap-entrainement'), texteDe(carte?.querySelector('h3'))], [true, 'S\'entraîner']);
      v.vrai('les quatre images juste après', Boolean(carte?.nextElementSibling?.matches('.ap-images')));
      carte?.querySelector('button.ap-mode')?.click();
      v.egal('appui : le mode s\'ouvre', ouvertures, ['jour']);
      racine.remove();
      const page = new DOMParser().parseFromString(contexte.fichiers?.['index.html'] ?? '', 'text/html');
      const onglets = [...page.querySelectorAll('nav.onglets .onglet')];
      v.egal('9 onglets, Apprendre le dernier, aucun pour le mode', [onglets.length, texteDe(onglets[8]), onglets.some((o) => /entra/i.test(o.textContent))], [9, 'Apprendre', false]);
      v.vrai('écran plein du mode dans la page, comme la mire', Boolean(page.querySelector('#entrainement.montage[role="dialog"] #ecran-entrainement')) && Boolean(page.querySelector('#entrainement-fermer')));
    },
  },
  {
    id: 'N39',
    titre: 'Entraînement, une séance complète : « Question 1 sur 5 · Données », réponses en ordre croissant, « Je ne sais pas » ; après le choix, réponses bloquées, marques en texte sur la réponse choisie et la bonne, verdict en texte qui prend le focus dans une zone annoncée, l\'image de la fiche (sauf « pas d\'image »), l\'appui mot pour mot avec la source de sa partie, le calcul pour une question de calcul ; « Lire la fiche D1 » puis « Retour » à la question dans le même état ; bilan « 2 bonnes réponses sur 5. » avec ✓ et ✗ et le lien de chaque fiche ; boîtes enregistrées',
    etape: 'entrainement',
    async verifier(v, contexte) {
      const ent = await moduleAppli(v, '../src/ecran-entrainement.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      if (!ent || !calc || !contexte.entrainement || !contexte.pourquoi) return;
      const memoire = new Map();
      const stockage = { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, JSON.parse(JSON.stringify(x))); return true; } };
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ecran = ent.monterEntrainement(racine, { donnees: contexte.entrainement, pourquoi: contexte.pourquoi, stockage, hasard: calc.hasardGraine(1), aujourdhui: () => '2026-10-04', enLigne: () => false });
      await ecran.pret;
      ecran.demarrerAvec(['Q-D1-1', 'Q-D2-1', 'Q-I5-1', 'Q-D17-1', 'Q-A3-1'], 'essentiels');
      const reponses = () => [...racine.querySelectorAll('.en-reponse')];
      const choisir = (debut) => reponses().find((b) => texteDe(b).startsWith(debut))?.click();
      const suivante = () => racine.querySelector('.en-suivante')?.click();
      v.egal('en tête', texteDe(racine.querySelector('.en-contexte')), 'Question 1 sur 5 · Données');
      v.egal('réponses en ordre croissant', reponses().map(texteDe), ['262 144 px', '525 000 px', '650 000 px', '1 000 000 px']);
      v.vrai('« Je ne sais pas » sous les réponses', texteDe(racine.querySelector('.en-ne-sait-pas')) === 'Je ne sais pas');
      v.egal('zone de l\'explication annoncée', racine.querySelector('.en-explication')?.getAttribute('aria-live'), 'polite');
      choisir('525 000 px');
      const verdict = racine.querySelector('.en-verdict');
      v.egal('verdict en texte', texteDe(verdict), '✗ Pas cette fois. La bonne réponse : 650 000 px.');
      v.vrai('focus sur le verdict', document.activeElement === verdict);
      v.vrai('réponses et « Je ne sais pas » bloqués', reponses().every((b) => b.disabled) && racine.querySelector('.en-ne-sait-pas')?.disabled);
      v.vrai('marques en texte : ✗ sur la réponse choisie, ✓ sur la bonne', texteDe(reponses()[1]).includes('✗') && texteDe(reponses()[2]).includes('✓') && !texteDe(reponses()[0]).match(/[✓✗]/));
      const d1 = contexte.pourquoi.fiches.find((f) => f.id === 'D1');
      v.vrai('l\'image de la fiche', texteDe(racine.querySelector('.en-image')).includes(d1.parties.find((x) => x.cle === 'image').texte.slice(0, 30)));
      v.vrai('l\'appui, mot pour mot', texteDe(racine.querySelector('.en-appui')).includes('un port 1G porte au plus 650 000 px chez Novastar et 525 000 px chez Brompton, en 8 bits à 60 Hz'));
      v.egal('la source de sa partie, avec les libellés publiés des fiches', texteDe(racine.querySelector('.en-source')), 'La règle · Fiches Novastar ; Tessera p.205');
      v.vrai('pas de calcul pour une question de valeur', !racine.querySelector('.en-calcul'));
      const lire = racine.querySelector('.en-lire-fiche');
      v.egal('lien vers la fiche', texteDe(lire), 'Lire la fiche D1');
      lire?.click();
      v.egal('la fiche D1 s\'ouvre dans le mode', [racine.dataset.vue, texteDe(racine.querySelector('.pq-question'))], ['fiche', d1.question]);
      racine.querySelector('.en-retour')?.click();
      v.egal('« Retour » : la question, dans le même état', [racine.dataset.vue, texteDe(racine.querySelector('.en-verdict')), reponses().every((b) => b.disabled), texteDe(reponses()[1]).includes('✗')],
        ['question', '✗ Pas cette fois. La bonne réponse : 650 000 px.', true, true]);
      suivante();
      v.egal('question 2', texteDe(racine.querySelector('.en-contexte')), 'Question 2 sur 5 · Données');
      choisir('262 500 px');
      v.egal('bonne réponse', texteDe(racine.querySelector('.en-verdict')), '✓ Bonne réponse.');
      v.vrai('le calcul', texteDe(racine.querySelector('.en-calcul')).includes('525 000 × 60 ÷ 120 = 262 500 px.'));
      suivante();
      racine.querySelector('.en-ne-sait-pas')?.click();
      v.egal('« Je ne sais pas »', texteDe(racine.querySelector('.en-verdict')), 'La réponse : 2,8 m et 5,7 m.');
      suivante();
      choisir('1 080 px');
      v.vrai('D17 : pas d\'image (« pas d\'image : … » dans la fiche)', !racine.querySelector('.en-image'));
      suivante();
      choisir('62,5 %');
      v.egal('dernière question : « Voir le bilan »', texteDe(racine.querySelector('.en-suivante')), 'Voir le bilan');
      suivante();
      v.egal('bilan', [racine.dataset.vue, texteDe(racine.querySelector('.en-score'))], ['bilan', '2 bonnes réponses sur 5.']);
      const lignes = [...racine.querySelectorAll('.en-bilan li')];
      v.egal('bilan : ✓ ou ✗ et le lien de chaque fiche', lignes.map((l) => `${texteDe(l.querySelector('.en-resultat'))} ${l.querySelector('.en-lire-fiche')?.dataset.fiche}`), ['✗ D1', '✓ D2', '✗ I5', '✗ D17', '✓ A3']);
      v.egal('boutons du bilan', [...racine.querySelectorAll('.en-encore, .en-fermer')].map(texteDe), ['Encore 5 questions', 'Fermer']);
      const suivis = memoire.get('entrainement')?.suivis ?? {};
      v.egal('boîtes enregistrées après chaque réponse', ['Q-D1-1', 'Q-D2-1', 'Q-I5-1', 'Q-D17-1', 'Q-A3-1'].map((id) => suivis[id]?.boite), [1, 2, 1, 1, 2]);
      v.egal('date locale, sans l\'heure', suivis['Q-D1-1']?.date, '2026-10-04');
      racine.remove();
    },
  },
  {
    id: 'N40',
    titre: 'Entraînement : progression gardée après rechargement (état « Jamais vues · À revoir · En cours · Acquises ») ; fiche de suivi d\'une question inconnue ignorée ; stockage bloqué : le mode marche et affiche « Progression non enregistrée sur cet appareil. » ; « Effacer ma progression » confirmé par un second bouton dans l\'écran, jamais une fenêtre du navigateur',
    etape: 'entrainement',
    async verifier(v, contexte) {
      const ent = await moduleAppli(v, '../src/ecran-entrainement.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      if (!ent || !calc || !contexte.entrainement || !contexte.pourquoi) return;
      const memoire = new Map([['entrainement', { version: 1, suivis: { 'Q-XX-9': { boite: 2, date: '2026-10-01' } } }]]);
      const stockage = { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, JSON.parse(JSON.stringify(x))); return true; } };
      const monter = async (st) => {
        const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
        document.body.append(racine);
        const ecran = ent.monterEntrainement(racine, { donnees: contexte.entrainement, pourquoi: contexte.pourquoi, stockage: st, hasard: calc.hasardGraine(2), aujourdhui: () => '2026-10-04', enLigne: () => false });
        await ecran.pret;
        return { racine, ecran };
      };
      const a = await monter(stockage);
      v.egal('accueil : état, l\'inconnue ignorée', texteDe(a.racine.querySelector('.en-etat')), 'Jamais vues 67 · À revoir 0 · En cours 0 · Acquises 0');
      a.ecran.demarrerAvec(['Q-D1-1', 'Q-E1-1'], 'essentiels');
      [...a.racine.querySelectorAll('.en-reponse')].find((b) => texteDe(b).startsWith('650 000 px'))?.click();
      await new Promise((r) => setTimeout(r, 50));
      a.racine.querySelector('.en-suivante')?.click();
      [...a.racine.querySelectorAll('.en-reponse')].find((b) => texteDe(b).startsWith('50 %'))?.click();
      await new Promise((r) => setTimeout(r, 50));
      a.racine.remove();
      const b = await monter(stockage);
      v.egal('après rechargement : la progression est gardée', texteDe(b.racine.querySelector('.en-etat')), 'Jamais vues 65 · À revoir 1 · En cours 1 · Acquises 0');
      v.vrai('pas de ligne de stockage quand il marche', !b.racine.querySelector('.en-stockage'));
      const fenetres = [];
      const confirmAvant = window.confirm;
      window.confirm = (m) => { fenetres.push(m); return true; };
      try {
        b.racine.querySelector('.en-effacer')?.click();
        v.vrai('« Effacer ma progression » : un second bouton dans l\'écran', Boolean(b.racine.querySelector('.en-confirmer')) && Boolean(b.racine.querySelector('.en-annuler')));
        v.egal('rien n\'est effacé avant la confirmation', texteDe(b.racine.querySelector('.en-etat')), 'Jamais vues 65 · À revoir 1 · En cours 1 · Acquises 0');
        b.racine.querySelector('.en-confirmer')?.click();
        await new Promise((r) => setTimeout(r, 50));
        v.egal('effacée', [texteDe(b.racine.querySelector('.en-etat')), Object.keys(memoire.get('entrainement')?.suivis ?? {}).length], ['Jamais vues 67 · À revoir 0 · En cours 0 · Acquises 0', 0]);
        v.egal('aucune fenêtre du navigateur', fenetres, []);
      } finally {
        window.confirm = confirmAvant;
      }
      b.racine.remove();
      const bloque = { lire: async () => { throw new Error('stockage bloqué'); }, ecrire: async () => { throw new Error('stockage bloqué'); } };
      const c = await monter(bloque);
      v.egal('stockage bloqué : la ligne prévue', texteDe(c.racine.querySelector('.en-stockage')), 'Progression non enregistrée sur cet appareil.');
      c.racine.querySelector('.en-mode[data-mode="essentiels"]')?.click();
      v.egal('stockage bloqué : la séance démarre', texteDe(c.racine.querySelector('.en-contexte')), 'Question 1 sur 5 · Données');
      c.racine.querySelector('.en-ne-sait-pas')?.click();
      await new Promise((r) => setTimeout(r, 50));
      v.vrai('stockage bloqué : la réponse est traitée', texteDe(c.racine.querySelector('.en-verdict')).startsWith('La réponse : '));
      c.racine.remove();
    },
  },
  {
    id: 'N41',
    titre: 'Entraînement en grand affichage, thème sombre et mode rouge (écran plein comme la mire) : accueil, question après une mauvaise réponse, bilan ; texte de 19 px, boutons de 60 px (64 px dans l\'écran plein), texte à 4,5:1 sur son fond, texte secondaire compris, rien ne déborde à 375 px',
    etape: 'entrainement',
    async verifier(v, contexte) {
      const ent = await moduleAppli(v, '../src/ecran-entrainement.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      if (!ent || !calc || !contexte.entrainement || !contexte.pourquoi) return;
      const feuille = el('link', { rel: 'stylesheet', href: 'styles.css' });
      await new Promise((fin) => {
        feuille.onload = fin;
        feuille.onerror = fin;
        document.head.append(feuille);
      });
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, police] = taille === 'grand' ? [64, 19] : [56, 0];
            const cadre = el('div', { class: 'montage entrainement', style: 'position:absolute;left:-10000px;top:0;width:375px;height:auto;inset:auto;background:var(--fond);color:var(--texte)' });
            const racine = el('div');
            cadre.append(racine);
            document.body.append(cadre);
            const memoire = new Map();
            const ecran = ent.monterEntrainement(racine, { donnees: contexte.entrainement, pourquoi: contexte.pourquoi,
              stockage: { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, x); return true; } }, hasard: calc.hasardGraine(3), aujourdhui: () => '2026-10-04', enLigne: () => false });
            await ecran.pret;
            const fautes = [];
            const controler = (nom) => {
              for (const e of [...racine.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getClientRects().length)) {
                const style = getComputedStyle(e);
                if (police && !e.closest('sup') && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const k = contraste(rgbVersHex(style.color), fondDe(e));
                if (k < 4.5) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » à ${k.toFixed(2)}:1`);
              }
              for (const b of racine.querySelectorAll('button')) {
                if (!b.getClientRects().length || b.closest('.pq-lien-fiche')) continue;
                const h = b.getBoundingClientRect().height;
                if (h < mini - 0.5) fautes.push(`${nom} : « ${texteDe(b).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (cadre.scrollWidth > 375.5) fautes.push(`${nom} : ${cadre.scrollWidth} px de large`);
            };
            ecran.afficherAccueil();
            racine.querySelector('.en-mode[data-mode="famille"]')?.click();
            racine.querySelector('.en-effacer')?.click();
            controler('accueil');
            ecran.demarrerAvec(['Q-D1-1', 'Q-E4-3', 'Q-I13-1', 'Q-R2-1', 'Q-A3-1'], 'essentiels');
            [...racine.querySelectorAll('.en-reponse')].find((b) => texteDe(b).startsWith('525 000 px'))?.click();
            controler('question');
            for (let k = 0; k < 4; k += 1) {
              racine.querySelector('.en-suivante')?.click();
              racine.querySelector('.en-ne-sait-pas')?.click();
            }
            controler('dernière question');
            racine.querySelector('.en-suivante')?.click();
            controler('bilan');
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            cadre.remove();
          }
        }
      } finally {
        feuille.remove();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N42',
    titre: 'Entraînement hors ligne : le mode s\'ouvre et fait une séance complète sans aucun accès au réseau (fiche ouverte depuis une question comprise, sans lien web)',
    etape: 'entrainement',
    async verifier(v, contexte) {
      const ent = await moduleAppli(v, '../src/ecran-entrainement.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      if (!ent || !calc || !contexte.entrainement || !contexte.pourquoi) return;
      await sansReseau(async (appels) => {
        const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
        document.body.append(racine);
        const memoire = new Map();
        const ecran = ent.monterEntrainement(racine, { donnees: contexte.entrainement, pourquoi: contexte.pourquoi,
          stockage: { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, x); return true; } }, hasard: calc.hasardGraine(4), aujourdhui: () => '2026-10-04' });
        await ecran.pret;
        racine.querySelector('.en-mode[data-mode="jour"]')?.click();
        let questions = 0;
        for (let k = 0; k < 5; k += 1) {
          if (racine.dataset.vue !== 'question') break;
          questions += 1;
          racine.querySelector('.en-reponse')?.click();
          if (k === 0) {
            racine.querySelector('.en-lire-fiche')?.click();
            v.vrai('hors ligne : la fiche s\'ouvre, sans lien web', racine.dataset.vue === 'fiche' && racine.querySelectorAll('a[href^="http"]').length === 0);
            racine.querySelector('.en-retour')?.click();
          }
          racine.querySelector('.en-suivante')?.click();
        }
        v.egal('hors ligne : séance du jour de 5 questions, puis le bilan', [questions, racine.dataset.vue], [5, 'bilan']);
        v.egal('hors ligne : aucun accès au réseau', appels, []);
        racine.remove();
      });
    },
  },
  {
    id: 'N43',
    titre: 'Nouveau look, onglets (§ 3) : 9 onglets en grille de 3 × 3 dans l\'ordre Mur, Data, Canvas / Élec, Poids, Schéma / Dépannage, Base, Apprendre, chacun avec sa famille et une icône de trait ; chaque panneau porte la famille de son onglet ; l\'onglet ouvert a le fond teinté et la bordure de sa famille, libellé en gras ; cibles de 48 px, 60 px en grand affichage',
    etape: 'look',
    async verifier(v, contexte) {
      const look = await moduleAppli(v, '../src/look.js');
      const page = new DOMParser().parseFromString(contexte.fichiers?.['index.html'] ?? '', 'text/html');
      const onglets = [...page.querySelectorAll('nav.onglets a.onglet')];
      v.egal('9 onglets dans l\'ordre, chacun avec sa famille', onglets.map((o) => `${o.getAttribute('href')} ${o.dataset.famille}`), ONGLETS_LOOK.map(([o, f]) => `#${o} ${f}`));
      v.egal('une icône de trait par onglet', onglets.filter((o) => !o.querySelector('svg.icone-onglet')).map((o) => o.getAttribute('href')), []);
      v.egal('chaque panneau porte la famille de son onglet', ONGLETS_LOOK.map(([o]) => page.getElementById(o)?.dataset.famille ?? null), ONGLETS_LOOK.map(([, f]) => f));
      if (look) v.egal('src/look.js : même correspondance', ONGLETS_LOOK.map(([o]) => look.FAMILLES_ONGLETS?.[o] ?? null), ONGLETS_LOOK.map(([, f]) => f));
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const avant = html.dataset.taille;
      try {
        for (const taille of ['normal', 'grand']) {
          if (taille === 'grand') html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
          cadre.innerHTML = page.querySelector('nav.onglets')?.outerHTML ?? '';
          document.body.append(cadre);
          const liens = [...cadre.querySelectorAll('a.onglet')];
          liens.forEach((a) => a.removeAttribute('aria-current'));
          liens[3]?.setAttribute('aria-current', 'page');
          const ouvert = liens[3];
          if (ouvert) {
            const s = getComputedStyle(ouvert);
            v.egal(`${taille} : onglet Élec ouvert, bordure et fond teinté de sa famille, libellé en gras`,
              [rgbVersHex(s.borderTopColor), rgbVersHex(s.backgroundColor), Number(s.fontWeight) >= 700],
              [sombre['--famille-electricite'], sombre['--famille-electricite-fond'], true]);
            v.egal(`${taille} : un onglet fermé garde la bordure neutre`, rgbVersHex(getComputedStyle(liens[0]).borderTopColor), sombre['--bordure']);
          }
          const hauts = liens.map((a) => Math.round(a.getBoundingClientRect().top));
          v.vrai(`${taille} : grille de 3 × 3 (trois onglets par rangée, trois rangées)`, hauts.length === 9 && hauts[0] === hauts[2] && hauts[3] > hauts[2] && hauts[3] === hauts[5] && hauts[6] > hauts[5] && hauts[6] === hauts[8]);
          const mini = taille === 'grand' ? 60 : 48;
          v.egal(`${taille} : cibles de ${mini} px au moins, aucun libellé coupé, rien ne déborde`, liens.filter((a) => a.getBoundingClientRect().height < mini - 0.5 || a.scrollWidth > a.clientWidth + 0.5
            || a.getBoundingClientRect().right > cadre.getBoundingClientRect().right + 0.5).map((a) => texteDe(a)), []);
          v.egal(`${taille} : icône dans la couleur de famille de son onglet`, liens.filter((a) => {
            const c = getComputedStyle(a.querySelector('svg.icone-onglet') ?? a).color;
            return rgbVersHex(c) !== sombre[`--famille-${a.dataset.famille}`];
          }).map((a) => texteDe(a)), []);
          cadre.remove();
        }
      } finally {
        retirer();
        if (avant) html.dataset.taille = avant;
        else delete html.dataset.taille;
      }
    },
  },
  {
    id: 'N44',
    titre: 'Onglet Apprendre (§ 4) : carte S\'entraîner en tête (titre, phrase, 67 points dans l\'ordre de la banque, 17 par ligne, éteints, à revoir, en cours, acquis selon la progression enregistrée, légende en texte avec les quatre nombres, étiquette accessible ; « Séance du jour » en bouton principal, puis « Les 5 essentiels » et « Par famille ») ; quatre images en tuiles avec leur icône ; cinq familles avec leur nombre de fiches, qui ouvrent leurs fiches',
    etape: 'look',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      const d = contexte.pourquoi;
      const banque = contexte.entrainement?.questions ?? [];
      if (!ap || !calc || !d || banque.length !== 67) return;
      const suivis = {
        [banque[0].id]: { boite: 1, date: '2026-10-01' }, [banque[1].id]: { boite: 2, date: '2026-10-01' },
        [banque[2].id]: { boite: 3, date: '2026-10-01' }, 'Q-XX-9': { boite: 2, date: '2026-10-01' },
      };
      const memoire = new Map([['entrainement', { version: 1, suivis }]]);
      const stockage = { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, x); return true; } };
      const fiches = [];
      const modes = [];
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      try {
        const ecran = ap.monterApprendre(racine, { pourquoi: d, entrainement: contexte.entrainement, stockage, enLigne: () => false,
          ouvrirFiche: (id) => fiches.push(id), ouvrirEntrainement: (mode) => modes.push(mode) });
        await ecran.pret;
        const carte = racine.querySelector('.ap-entrainement');
        v.vrai('carte S\'entraîner en tête de l\'onglet', Boolean(carte) && racine.firstElementChild === carte);
        v.egal('titre et phrase', [texteDe(carte?.querySelector('h3')), texteDe(carte?.querySelector('.ap-intro'))],
          ['S\'entraîner', '5 questions tirées des fiches. Après chaque réponse, l\'image et l\'explication. Pas de chrono.']);
        const points = [...racine.querySelectorAll('.ap-points .ap-point')];
        const attendus = banque.map((q, i) => ['revoir', 'encours', 'acquise'][i] ?? 'jamais');
        v.egal('67 points dans l\'ordre de la banque, selon la progression enregistrée (question inconnue ignorée)',
          [points.length, points.map((p) => p.dataset.question).join(','), points.map((p) => p.dataset.etat).join(',')],
          [67, banque.map((q) => q.id).join(','), attendus.join(',')]);
        const etat = calc.texteEtat(calc.etatProgression(banque, suivis));
        v.egal('légende en texte et étiquette accessible du groupe : les quatre nombres', [etat, texteDe(racine.querySelector('.ap-legende')), racine.querySelector('.ap-points')?.getAttribute('aria-label'), racine.querySelector('.ap-points')?.getAttribute('role')],
          ['Jamais vues 64 · À revoir 1 · En cours 1 · Acquises 1', etat, etat, 'img']);
        const hauts = points.map((p) => Math.round(p.getBoundingClientRect().top));
        v.vrai('17 points par ligne', hauts[0] === hauts[16] && hauts[17] > hauts[16] && hauts[17] === hauts[33] && hauts[34] > hauts[33]);
        const { sombre } = await jetonsStyles();
        v.egal('couleurs des points : éteint, corail, ambre, vert', [points[66], points[0], points[1], points[2]].map((p) => rgbVersHex(getComputedStyle(p).backgroundColor)),
          ['--point-eteint', '--point-revoir', '--point-encours', '--point-acquise'].map((n) => sombre[n]));
        const boutons = [...(carte?.querySelectorAll('button.ap-mode') ?? [])];
        v.egal('« Séance du jour » en bouton principal, puis « Les 5 essentiels » et « Par famille »', boutons.map((b) => `${texteDe(b)}${b.classList.contains('bouton-principal') ? ' (principal)' : ''}`),
          ['Séance du jour (principal)', 'Les 5 essentiels', 'Par famille']);
        boutons.forEach((b) => b.click());
        v.egal('chaque bouton ouvre le mode', modes, ['jour', 'essentiels', 'famille']);
        const images = [...racine.querySelectorAll('.ap-images .ap-image')];
        v.egal('quatre images en tuiles, chacune avec l\'icône de sa famille, son titre et sa phrase',
          images.map((t) => `${t.dataset.famille} ${Boolean(t.querySelector('svg.ap-icone'))} ${texteDe(t.querySelector('strong'))} ${texteDe(t.querySelector('p'))}`),
          d.images.map((x, i) => `${['donnees', 'electricite', 'image', 'accroche'][i]} true ${x.titre} ${x.texte}`));
        const colonnes = images.map((t) => Math.round(t.getBoundingClientRect().left));
        v.vrai('tuiles en deux colonnes', colonnes.length === 4 && colonnes[0] === colonnes[2] && colonnes[1] === colonnes[3] && colonnes[1] > colonnes[0]);
        const familles = [...racine.querySelectorAll('button.ap-famille')];
        v.egal('cinq familles avec leur nombre de fiches', familles.map((b) => `${b.dataset.famille} ${texteDe(b.querySelector('.ap-famille-titre'))} ${texteDe(b.querySelector('.ap-compte'))}`),
          d.familles.map((f) => `${f.id} ${f.titre} ${f.fiches.length}`));
        familles.find((b) => b.dataset.famille === 'image')?.click();
        v.egal('Image : ses 14 fiches', [racine.dataset.vue, [...racine.querySelectorAll('.pq-fiche-bouton')].map((b) => b.dataset.fiche).join(',')],
          ['famille', d.familles.find((f) => f.id === 'image').fiches.join(',')]);
        racine.querySelector('.pq-fiche-bouton[data-fiche="I8"]')?.click();
        v.egal('appui sur I8 : la fiche s\'ouvre', fiches, ['I8']);
        racine.querySelector('.ap-retour')?.click();
        v.vrai('« Retour » ramène à l\'onglet', racine.dataset.vue === 'accueil' && racine.firstElementChild?.matches('.ap-entrainement'));
        memoire.set('entrainement', { version: 1, suivis: { ...suivis, [banque[3].id]: { boite: 3, date: '2026-10-02' } } });
        await ecran.actualiser();
        v.egal('après une séance : les points et la légende suivent', [racine.querySelectorAll('.ap-point[data-etat="acquise"]').length, texteDe(racine.querySelector('.ap-legende'))],
          [2, 'Jamais vues 63 · À revoir 1 · En cours 1 · Acquises 2']);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N45',
    titre: 'Anciens liens vers la liste des fiches : la liste et son bouton « S\'entraîner » ont disparu ; « Toutes les fiches » d\'une fiche ouvre l\'onglet Apprendre ; « Comprendre les règles » du Dépannage et « Fermer » du mode mènent à l\'onglet Apprendre',
    etape: 'look',
    async verifier(v, contexte) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      if (!pq || !contexte.pourquoi) return;
      const listes = [];
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ecran = pq.monterPourquoi(racine, contexte.pourquoi, { enLigne: () => false, ouvrirListe: () => listes.push('apprendre') });
      v.vrai('plus de vue « liste » dans l\'écran des fiches', typeof ecran.afficherListe === 'undefined');
      ecran.afficherFiche('E2');
      v.vrai('plus de bouton « S\'entraîner » dans l\'écran des fiches', !racine.querySelector('.pq-entrainement'));
      racine.querySelector('.pq-vers-liste')?.click();
      v.egal('« Toutes les fiches » ouvre l\'onglet Apprendre', listes, ['apprendre']);
      racine.remove();
      const app = contexte.fichiers?.['src/app.js'] ?? '';
      v.vrai('app.js : onglet « apprendre » dans la liste des onglets', /const ONGLETS = \[[^\]]*'apprendre'/.test(app));
      v.vrai('app.js : « Comprendre les règles », « Toutes les fiches » et « Fermer » du mode mènent à l\'onglet Apprendre',
        /ouvrirListePourquoi:[^,\n]*allerApprendre/.test(app) && /ouvrirListe:[^,\n]*allerApprendre/.test(app) && /function allerApprendre\(\)[\s\S]{0,200}location\.hash = 'apprendre'/.test(app) && !/afficherListe/.test(app));
    },
  },
  {
    id: 'N46',
    titre: 'Barre de charge (§ 3) : 20 segments, allumés à la proportion de la charge, en couleur de famille jusqu\'à 80 %, en couleur d\'alerte au-delà, en couleur d\'échec au-delà du seuil de refus ; graduations dessous ; décorative (la charge reste écrite)',
    etape: 'look',
    async verifier(v) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look) return;
      v.egal('segments allumés et niveau', [0, 0.01, 0.5, 0.8, 0.805, 0.885, 1, 1.02, 1.6].map((c) => {
        const s = look.segmentsCharge(c);
        return `${s.allumes} ${s.niveau}`;
      }), ['0 famille', '1 famille', '10 famille', '16 famille', '16 alerte', '18 alerte', '20 alerte', '20 echec', '20 echec']);
      v.egal('seuil de refus réglable', `${look.segmentsCharge(0.97, { seuilRefus: 0.95 }).niveau}`, 'echec');
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'donnees', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      try {
        for (const [charge, couleur] of [[0.5, '--famille-donnees'], [0.885, '--alerte'], [1.02, '--echec']]) {
          const barre = look.barreCharge(charge);
          cadre.append(barre);
          const segs = [...barre.querySelectorAll('.bc-seg')];
          const allumes = segs.filter((s) => s.classList.contains('allume'));
          v.egal(`${charge * 100} % : 20 segments, ${look.segmentsCharge(charge).allumes} allumés en ${couleur}, éteints en --point-eteint, graduations, cachée aux lecteurs d'écran`,
            [segs.length, allumes.length, rgbVersHex(getComputedStyle(allumes[0]).backgroundColor), rgbVersHex(getComputedStyle(segs[19].classList.contains('allume') ? segs[0] : segs[19]).backgroundColor),
              Boolean(barre.querySelector('.bc-graduations')), barre.getAttribute('aria-hidden')],
            [20, look.segmentsCharge(charge).allumes, sombre[couleur], segs[19].classList.contains('allume') ? sombre[couleur] : sombre['--point-eteint'], true, 'true']);
        }
      } finally {
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N47',
    titre: 'Mur en petits carrés (§ 3) : une grille colonnes × lignes en damier de deux tons de la famille, présente à 72 dalles (12 × 6), absente au-delà de 1 000 dalles',
    etape: 'look',
    async verifier(v) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look) return;
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      try {
        const grille = look.murCarres(12, 6);
        cadre.append(grille ?? '');
        const carres = [...(grille?.querySelectorAll('.mc') ?? [])];
        const hauts = carres.map((c) => Math.round(c.getBoundingClientRect().top));
        v.egal('12 × 6 : 72 carrés, 12 par rangée, damier (36 et 36)', [carres.length, hauts[0] === hauts[11] && hauts[12] > hauts[11], carres.filter((c) => c.classList.contains('ton-b')).length,
          carres[0]?.classList.contains('ton-b'), carres[1]?.classList.contains('ton-b'), carres[12]?.classList.contains('ton-b')], [72, true, 36, false, true, true]);
        v.egal('deux tons de la famille', [rgbVersHex(getComputedStyle(carres[0]).backgroundColor), rgbVersHex(getComputedStyle(carres[1]).backgroundColor)],
          [sombre['--famille-image-bord'], sombre['--famille-image']]);
        v.vrai('décorative : cachée aux lecteurs d\'écran', grille?.getAttribute('aria-hidden') === 'true');
        v.egal('1 000 dalles : présente ; 1 001 et 40 × 26 : absente', [Boolean(look.murCarres(40, 25)), look.murCarres(1001, 1), look.murCarres(40, 26)], [true, null, null]);
      } finally {
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N48',
    titre: 'Pastille « Pourquoi ? » (§ 3) : discrète (fond teinté, bordure teintée, texte en couleur de famille), 32 px de haut à l\'œil, zone de toucher de 48 px au moins ; taille normale de bouton en grand affichage (60 px)',
    etape: 'look',
    async verifier(v) {
      const pq = await moduleAppli(v, '../src/pourquoi.js');
      if (!pq) return;
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const avant = html.dataset.taille;
      try {
        for (const taille of ['normal', 'grand']) {
          if (taille === 'grand') html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const cadre = el('div', { class: 'zone-essai', 'data-famille': 'donnees', style: 'position:absolute;left:-10000px;top:0;width:375px' },
            el('p', { class: 'alerte' }, 'Essai de pastille'));
          document.body.append(cadre);
          pq.relierPourquoi({ ecrans: { essai: '.zone-essai' }, liens: [{ ecran: 'essai', element: 'alerte', motif: 'Essai', fiche: 'D1' }] }, { racine: cadre, ouvrir: () => {} });
          const b = cadre.querySelector('.lien-pourquoi');
          const avantB = b ? getComputedStyle(b, '::before') : null;
          const [mini, visuel] = taille === 'grand' ? [60, 60] : [48, 32];
          v.egal(`${taille} : zone de toucher de ${mini} px au moins, pastille visible de ${visuel} px`, [b ? b.getBoundingClientRect().height >= mini - 0.5 : false, avantB ? Math.round(parseFloat(avantB.height)) >= visuel - 1 && Math.round(parseFloat(avantB.height)) <= Math.max(visuel, b.getBoundingClientRect().height) : false],
            [true, true]);
          if (taille === 'normal') v.egal('normal : 32 px à l\'œil', avantB ? Math.round(parseFloat(avantB.height)) : null, 32);
          v.egal(`${taille} : texte en couleur de famille, fond et bordure teintés`, [rgbVersHex(getComputedStyle(b).color), avantB ? rgbVersHex(avantB.backgroundColor) : null, avantB ? rgbVersHex(avantB.borderTopColor) : null],
            [sombre['--famille-donnees'], sombre['--famille-donnees-fond'], sombre['--famille-donnees-bord']]);
          cadre.remove();
        }
      } finally {
        retirer();
        if (avant) html.dataset.taille = avant;
        else delete html.dataset.taille;
      }
    },
  },
  {
    id: 'N49',
    titre: 'Nouveau look sans décor (§ 1) : aucune ombre portée, lueur, dégradé ni animation dans styles.css (box-shadow, text-shadow, drop-shadow, gradient, @keyframes)',
    etape: 'look',
    async verifier(v, contexte) {
      const css = contexte.fichiers?.['styles.css'] ?? '';
      v.egal('aucune ombre, lueur, dégradé ni animation', ['box-shadow', 'text-shadow', 'drop-shadow', 'gradient', '@keyframes'].filter((m) => css.includes(m)), []);
    },
  },
  {
    id: 'N50',
    titre: 'Onglet Apprendre hors ligne, en grand affichage, en thème sombre et en mode rouge : aucun accès au réseau ; texte de 19 px, boutons de 60 px, texte à 4,5:1 sur son fond, rien ne déborde à 375 px ; en mode rouge, les points restent distincts par leur clarté',
    etape: 'look',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      if (!ap || !contexte.pourquoi || !contexte.entrainement) return;
      const banque = contexte.entrainement.questions;
      const suivis = { [banque[0].id]: { boite: 1, date: '2026-10-01' }, [banque[1].id]: { boite: 2, date: '2026-10-01' }, [banque[2].id]: { boite: 3, date: '2026-10-01' } };
      const stockage = { lire: async () => ({ version: 1, suivis }), ecrire: async () => true };
      const monter = async () => {
        const racine = el('div', { 'data-famille': 'apprendre', style: 'position:absolute;left:-10000px;top:0;width:375px;background:var(--fond);color:var(--texte)' });
        document.body.append(racine);
        const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {} });
        await ecran.pret;
        return { racine, ecran };
      };
      await sansReseau(async (appels) => {
        const { racine, ecran } = await monter();
        racine.querySelector('button.ap-famille')?.click();
        ecran.afficherAccueil();
        v.egal('hors ligne : aucun accès au réseau, aucun lien web', [appels, racine.querySelectorAll('a[href^="http"]').length], [[], 0]);
        racine.remove();
      });
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          for (const taille of ['normal', 'grand']) {
            if (taille === 'grand') html.dataset.taille = 'grand';
            else delete html.dataset.taille;
            const [mini, police] = taille === 'grand' ? [60, 19] : [48, 0];
            const { racine, ecran } = await monter();
            const fautes = [];
            for (const [nom, aller] of [['accueil', () => ecran.afficherAccueil()], ['famille', () => ecran.afficherFamille('donnees')]]) {
              aller();
              for (const e of [...racine.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getClientRects().length)) {
                const style = getComputedStyle(e);
                if (police && parseFloat(style.fontSize) < police - 0.05) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » en ${style.fontSize}`);
                const k = contraste(rgbVersHex(style.color), fondDe(e));
                if (k < 4.5) fautes.push(`${nom} : « ${texteDe(e).slice(0, 30)} » à ${k.toFixed(2)}:1`);
              }
              for (const b of racine.querySelectorAll('button')) {
                if (!b.getClientRects().length) continue;
                const h = b.getBoundingClientRect().height;
                if (h < mini - 0.5) fautes.push(`${nom} : « ${texteDe(b).slice(0, 30)} » haut de ${h.toFixed(0)} px`);
              }
              if (racine.scrollWidth > 375.5) fautes.push(`${nom} : ${racine.scrollWidth} px de large`);
            }
            v.egal(`${mode}, ${taille} : texte, contrastes, cibles et largeur`, fautes.slice(0, 12), []);
            if (mode === 'rouge' && taille === 'normal') {
              ecran.afficherAccueil();
              const couleursPoints = ['revoir', 'encours', 'acquise', 'jamais'].map((e) => rgbVersHex(getComputedStyle(racine.querySelector(`.ap-point[data-etat="${e}"]`)).backgroundColor));
              v.egal('mode rouge : quatre clartés de points distinctes', new Set(couleursPoints).size, 4);
            }
            racine.remove();
          }
        }
      } finally {
        retirer();
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
      }
    },
  },
  {
    id: 'N51',
    titre: 'S\'entraîner (§ 5) : progression en 5 segments (juste vert, faux ou « Je ne sais pas » corail, en cours couleur de famille, à venir éteint), chacun avec son étiquette « Question n sur 5 » ; réponses chiffrées en chasse fixe ; après la réponse, le verdict puis l\'image en premier, dans un encadré au fond teinté de la famille de la question ; « Question suivante » en bouton principal de cette famille',
    etape: 'look',
    async verifier(v, contexte) {
      const ent = await moduleAppli(v, '../src/ecran-entrainement.js');
      const calc = await moduleAppli(v, '../src/entrainement.js');
      if (!ent || !calc || !contexte.entrainement || !contexte.pourquoi) return;
      const memoire = new Map();
      const stockage = { lire: async (k) => memoire.get(k), ecrire: async (k, x) => { memoire.set(k, x); return true; } };
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      try {
        const ecran = ent.monterEntrainement(racine, { donnees: contexte.entrainement, pourquoi: contexte.pourquoi, stockage, hasard: calc.hasardGraine(3), aujourdhui: () => '2026-10-09', enLigne: () => false });
        await ecran.pret;
        const banque = new Map(contexte.entrainement.questions.map((q) => [q.id, q]));
        ecran.demarrerAvec(['Q-I5-1', 'Q-D1-1', 'Q-E1-1', 'Q-A1-1', 'Q-R1-1'].filter((id) => banque.has(id)), 'essentiels');
        const segments = () => [...racine.querySelectorAll('.en-progression .en-segment')];
        v.egal('5 segments, étiquettes « Question n sur 5 »', segments().map((s) => s.getAttribute('aria-label')), [1, 2, 3, 4, 5].map((n) => `Question ${n} sur 5`));
        v.egal('au départ : en cours, puis à venir', segments().map((s) => s.dataset.etat), ['encours', 'avenir', 'avenir', 'avenir', 'avenir']);
        v.egal('texte du contexte inchangé', texteDe(racine.querySelector('.en-contexte')), 'Question 1 sur 5 · Image');
        const reponses = [...racine.querySelectorAll('.en-reponse')];
        v.vrai('Q-I5-1 : réponses chiffrées en chasse fixe', reponses.length > 0 && reponses.every((b) => b.classList.contains('chiffres') && /mono|menlo|consolas/i.test(getComputedStyle(b).fontFamily)));
        v.egal('couleur du segment en cours : celle de la famille de la question', rgbVersHex(getComputedStyle(segments()[0]).backgroundColor), sombre['--famille-image']);
        reponses.find((b) => texteDe(b) !== banque.get('Q-I5-1').bonne && !texteDe(b).startsWith(banque.get('Q-I5-1').bonne))?.click();
        await new Promise((r) => setTimeout(r, 50));
        const enfants = [...(racine.querySelector('.en-explication')?.children ?? [])];
        v.egal('après une mauvaise réponse : le verdict, puis l\'image en premier', enfants.slice(0, 2).map((e) => e.className.split(' ').find((c) => ['en-verdict', 'en-bloc-image'].includes(c)) ?? e.className), ['en-verdict', 'en-bloc-image']);
        const image = racine.querySelector('.en-bloc-image');
        v.egal('encadré de l\'image au fond teinté de la famille de la question', [image?.closest('[data-famille]')?.dataset.famille, image ? rgbVersHex(getComputedStyle(image).backgroundColor) : null], ['image', sombre['--famille-image-fond']]);
        const suivante = racine.querySelector('.en-suivante');
        v.egal('« Question suivante » : bouton principal de la famille, texte foncé', [suivante?.classList.contains('bouton-principal'), rgbVersHex(getComputedStyle(suivante).backgroundColor), rgbVersHex(getComputedStyle(suivante).color)],
          [true, sombre['--famille-image'], sombre['--sur-famille']]);
        v.egal('segment 1 : faux, en corail', [segments()[0].dataset.etat, rgbVersHex(getComputedStyle(segments()[0]).backgroundColor)], ['faux', sombre['--point-revoir']]);
        suivante?.click();
        v.egal('question 2 : 1 faux, 2 en cours', segments().map((s) => s.dataset.etat), ['faux', 'encours', 'avenir', 'avenir', 'avenir']);
        [...racine.querySelectorAll('.en-reponse')].find((b) => texteDe(b).startsWith(banque.get('Q-D1-1').bonne))?.click();
        await new Promise((r) => setTimeout(r, 50));
        v.egal('segment 2 : juste, en vert', [segments()[1].dataset.etat, rgbVersHex(getComputedStyle(segments()[1]).backgroundColor)], ['juste', sombre['--point-acquise']]);
        racine.querySelector('.en-suivante')?.click();
        racine.querySelector('.en-ne-sait-pas')?.click();
        await new Promise((r) => setTimeout(r, 50));
        v.egal('« Je ne sais pas » : corail ; à venir : éteint', [segments()[2].dataset.etat, rgbVersHex(getComputedStyle(segments()[4]).backgroundColor)], ['faux', sombre['--point-eteint']]);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N52',
    titre: 'Éditeur de zones de l\'onglet Mur (étape 9a) : une carte par zone (nom, colonnes, rangées, écart réel, hauteur du bas), ajouter, retirer, déplacer à gauche ; aucun champ dans le formulaire (seul le texte gardé l\'est) ; « À la main » reprend les valeurs calculées et montre un écart en px par écart et un Y par zone ; 12 zones au plus ; zones à toucher de 48 px',
    etape: '9a',
    async verifier(v) {
      const zones = await moduleAppli(v, '../src/zones.js');
      if (!zones) return;
      const retirer = await chargerStylesLook();
      const formulaire = el('form', { 'data-famille': 'image', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(formulaire);
      let recu = null;
      const monter = (saisie, mur = null) => {
        const editeur = zones.monterEditeurZones({ saisie, mur, surChange: (s) => { recu = s; } });
        formulaire.replaceChildren(editeur);
        return editeur;
      };
      try {
        let ed = monter(zones.lireSaisieZones(''));
        const cartes = () => [...ed.querySelectorAll('.carte-zone')];
        v.egal('deux cartes, champs de chaque carte', [cartes().length, cartes()[1].querySelectorAll('[data-champ]').length, cartes()[0].querySelectorAll('[data-champ]').length], [2, 5, 4]);
        v.egal('aucun champ de l\'éditeur dans le formulaire', formulaire.elements.length, 0);
        v.egal('nom : 12 caractères au plus', cartes()[0].querySelector('[data-champ="nom"]').maxLength, 12);
        v.egal('déplacer à gauche : pas sur la première ; retirer possible', [cartes()[0].querySelector('[data-action="gauche"]').disabled, cartes()[1].querySelector('[data-action="gauche"]').disabled,
          cartes()[0].querySelector('[data-action="retirer"]').disabled], [true, false, false]);
        const colonnes = cartes()[1].querySelector('[data-champ="colonnes"]');
        colonnes.value = '7';
        colonnes.dispatchEvent(new Event('input', { bubbles: true }));
        v.egal('saisie : colonnes de la zone 2', recu?.zones[1].colonnes, 7);
        ed.querySelector('[data-action="ajouter"]').click();
        v.egal('ajouter : trois zones, trois cartes', [recu?.zones.length, cartes().length], [3, 3]);
        cartes()[2].querySelector('[data-action="gauche"]').click();
        v.egal('déplacer à gauche', recu?.zones.map((z) => z.nom), ['Zone 1', 'Zone 3', 'Zone 2']);
        cartes()[0].querySelector('[data-action="retirer"]').click();
        v.egal('retirer', recu?.zones.map((z) => z.nom), ['Zone 3', 'Zone 2']);
        const choix = [...ed.querySelectorAll('.choix-ecarts input')];
        v.egal('écarts dans la pixel map : trois choix', choix.map((c) => c.closest('label').textContent.trim()), ['Comme l\'écart réel', 'À la main', 'Zones collées']);
        const dalle = { id: 'f', nom: 'f', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 };
        const saisie = { ...zones.lireSaisieZones(''), zones: [{ nom: 'A', colonnes: 2, rangees: 3 }, { nom: 'B', colonnes: 2, rangees: 2, ecartMm: 260 }] };
        const calculs = await import('../src/calculs.js');
        ed = monter(saisie, calculs.murZones(dalle, ...zones.argumentsMurZones(saisie)));
        const main = [...ed.querySelectorAll('.choix-ecarts input')].find((c) => c.value === 'main');
        main.checked = true;
        main.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('à la main : valeurs calculées reprises', [recu?.ecarts, recu?.ecartsPx, recu?.yPx], ['main', [100], [0, 192]]);
        v.egal('à la main : un écart en px et un Y par zone à l\'écran', [ed.querySelectorAll('[data-champ="ecartPx"]').length, ed.querySelectorAll('[data-champ="yPx"]').length], [1, 2]);
        let douze = zones.lireSaisieZones('');
        for (let i = 0; i < 10; i += 1) douze = zones.ajouterZone(douze);
        ed = monter(douze);
        v.egal('12 zones : ajouter grisé', ed.querySelector('[data-action="ajouter"]').disabled, true);
        ed = monter(zones.retirerZone(zones.lireSaisieZones(''), 0));
        v.egal('une seule zone : retirer grisé', ed.querySelector('[data-action="retirer"]').disabled, true);
        const petits = [...ed.querySelectorAll('button, input:not([type="radio"])')].filter((b) => b.getBoundingClientRect().height < 48 - 0.5);
        v.egal('zones à toucher de 48 px au moins', petits.map((b) => b.textContent || b.dataset.champ), []);
      } finally {
        formulaire.remove();
        retirer();
      }
    },
  },
  {
    id: 'N57',
    titre: 'Mur en petits carrés en mode Zones (étape 9a) : une grille par zone, à sa place réelle (écarts et hauteur du bas, en % du mur), autant de carrés que de dalles, décoratif ; rien au-delà de 1 000 dalles',
    etape: '9a',
    async verifier(v) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look) return;
      const calculs = await import('../src/calculs.js');
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      try {
        const dalle = { id: 'f', nom: 'f', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 };
        const m = calculs.murZones(dalle, [{ nom: 'A', colonnes: 4, rangees: 4 }, { nom: 'B', colonnes: 2, rangees: 2, ecartMm: 1000, basMm: 500 }]);
        const dessin = look.murCarresZones(m);
        cadre.append(dessin ?? '');
        const grilles = [...(dessin?.querySelectorAll('.mur-carres') ?? [])];
        v.egal('une grille par zone, un carré par dalle', [grilles.length, grilles.map((g) => g.querySelectorAll('.mc').length)], [2, [16, 4]]);
        const boite = dessin.getBoundingClientRect();
        const b = grilles[1].getBoundingClientRect();
        const pc = (x) => Math.round((100 * x) / boite.width);
        v.egal('zone B : à 3 m du bord gauche sur 4 m, 1 m de large (en % de la largeur)', [pc(b.left - boite.left), pc(b.width)], [75, 25]);
        v.egal('zone B : bas à 0,5 m du sol, haut à 1,5 m sur 2 m (en % de la hauteur)', [Math.round((100 * (b.top - boite.top)) / boite.height), Math.round((100 * b.height) / boite.height)], [25, 50]);
        v.vrai('proportions du mur réel (4 × 2 m)', Math.abs(boite.width / boite.height - 2) < 0.02);
        v.vrai('décoratif : caché aux lecteurs d\'écran', dessin.getAttribute('aria-hidden') === 'true');
        const grand = calculs.murZones(dalle, [{ nom: 'A', colonnes: 40, rangees: 20 }, { nom: 'B', colonnes: 21, rangees: 10 }]);
        v.egal('au-delà de 1 000 dalles : rien', look.murCarresZones(grand), null);
      } finally {
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N58',
    titre: 'Schéma en zones (étape 9a4) : dalles à leur place, aucune dalle dans un vide, nom de chaque zone hors du mur, au-dessus de sa zone, du côté opposé au départ, et dans sa largeur ; noms des dalles courts (« C3 R2 »), dans leur dalle, hors des traits',
    etape: '9a',
    async verifier(v, contexte) {
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const m = calculs.murZones(upad, [{ nom: 'A', colonnes: 4, rangees: 3 }, { nom: 'B', colonnes: 3, rangees: 3, ecartMm: 1000 }], { ecarts: 'reel' });
      const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8, departCablage: 'bas-gauche' });
      const data = calculs.cablageData(m, upad, e, { depart: 'bas-gauche' });
      const vd = data.variantes.find((x) => x.mode === data.conseil);
      for (const vueNom of ['physique', 'pixels']) {
        const vue = { vue: vueNom, canvasVue: 'mur', cablage: 'data' };
        const geo = geometrieSchema(vue, m, upad, calculs.pixelMap(m, upad, e));
        const { svg } = construireSvg({ geo, trajets: trajetsSchema(vue, vd, null, null), coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000 });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        try {
          const rects = [...svg.querySelectorAll('[data-dalle] rect')].map((r) => ['x', 'width'].map((a) => Number(r.getAttribute(a))));
          const finA = Math.max(...geo.zones.filter((z) => z.nom === 'A').map((z) => z.x + z.w));
          const debutB = geo.zones.find((z) => z.nom === 'B').x;
          v.vrai(`${vueNom} : un vide entre A et B, sans dalle`, debutB > finA + 1 && rects.every(([x, w]) => x + w <= finA + 1e-6 || x >= debutB - 1e-6));
          const noms = [...svg.querySelectorAll('.nom-zone')];
          v.egal(`${vueNom} : noms des zones`, noms.map((t) => t.textContent), ['A', 'B']);
          v.vrai(`${vueNom} : chaque nom au-dessus de sa zone (départ en bas), dans sa largeur`, noms.every((t, i) => {
            const b = t.getBBox();
            const z = geo.zones[i];
            return b.y + b.height <= z.y + 1e-6 && b.x >= z.x - 1e-6 && b.x + b.width <= z.x + z.w + 1e-6;
          }));
          v.egal(`${vueNom} : noms des dalles courts`, [...svg.querySelectorAll('[data-dalle="B · C1 R1"] .etiquette-dalle tspan')].slice(0, 2).map((t) => t.textContent), ['C1', 'R1']);
        } finally {
          svg.remove();
        }
      }
    },
  },
  {
    id: 'N54',
    titre: 'Export PNG de la pixel map en zones (étape 9a4b) : vides en noir, deux tons d\'une couleur par zone, étiquette de chaque zone ou morceau comme la slide de la formation (nom, « x, y // largeur × hauteur », taille en m) ; cas réel 1 : 11 856 × 1536 px en 2 tuiles, chaque processeur en un fichier',
    etape: '9a',
    async verifier(v, contexte) {
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const zones = [['C', 14], ['B-C', 9], ['B', 14], ['A-B', 9], ['A', 14]].map(([nom, colonnes]) => ({ nom, colonnes, rangees: 8 }));
      const m = calculs.murZones(upad, zones, { ecarts: 'main', ecartsPx: [84, 84, 84, 84] });
      const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 50, bits: 8 });
      const pm = calculs.pixelMap(m, upad, e);
      const motifMur = calculs.motifPixelMap(pm.mur);
      v.egal('mur : étiquettes des zones', motifMur.etiquettes.map((x) => x.lignes), [
        ['C', '0, 0 // 2688 × 1536', '7 × 4 m'], ['B-C', '2772, 0 // 1728 × 1536', '4,5 × 4 m'], ['B', '4584, 0 // 2688 × 1536', '7 × 4 m'],
        ['A-B', '7356, 0 // 1728 × 1536', '4,5 × 4 m'], ['A', '9168, 0 // 2688 × 1536', '7 × 4 m']]);
      v.egal('mur : 2 tuiles au-delà de 16,7 M px', calculs.tuilesImage(pm.mur.largeurPx, pm.mur.hauteurPx).length, 2);
      const motif2 = calculs.motifPixelMap(pm.canvas[1]);
      v.egal('processeur 2 : étiquettes des morceaux', motif2.etiquettes.map((x) => x.lignes), [
        ['B-C 2/2', '0, 0 // 576 × 1536', '1,5 × 4 m'], ['B', '660, 0 // 2688 × 1536', '7 × 4 m'], ['A-B 1/2', '3432, 0 // 576 × 1536', '1,5 × 4 m']]);
      v.egal('processeur 2 : une seule image', calculs.tuilesImage(pm.canvas[1].bloc.largeurPx, pm.canvas[1].bloc.hauteurPx).length, 1);
      const canvas = pixelMapEnCanvas(pm.canvas[1]);
      v.egal('processeur 2 : taille exacte', [canvas.width, canvas.height], [4008, 1536]);
      const ctx = canvas.getContext('2d');
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      v.egal('vide entre B-C et B (x 600) : noir', pixel(600, 1400), '0,0,0');
      const bc = pixel(100, 1400);
      const b = pixel(2000, 1400);
      v.vrai(`B-C et B : deux couleurs de zone différentes, ni noires (${bc} ; ${b})`, bc !== b && bc !== '0,0,0' && b !== '0,0,0');
      v.vrai('deux tons dans une zone : deux dalles voisines de B différentes', pixel(700, 1400) !== pixel(900, 1400));
      const seul = calculs.pixelMap(calculs.mur(upad, 4, 3), upad, null);
      v.egal('mur d\'une seule pièce : pas d\'étiquette de zone, teintes d\'avant', [calculs.motifPixelMap(seul.mur).etiquettes.length, calculs.motifPixelMap(seul.mur).fonds.map((f) => f.teinte).slice(0, 4)], [0, [0, 1, 0, 1]]);
    },
  },
  {
    id: 'N55',
    titre: 'Mire en zones (étape 9a4b) : vides au gris « hors mur » (#141414), dalles nommées avec leur zone ; cas réel 1 : mire du mur entier trop grande pour un iPhone, une mire par processeur',
    etape: '9a',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const zones = [['C', 14], ['B-C', 9], ['B', 14], ['A-B', 9], ['A', 14]].map(([nom, colonnes]) => ({ nom, colonnes, rangees: 8 }));
      const m = calculs.murZones(upad, zones, { ecarts: 'main', ecartsPx: [84, 84, 84, 84] });
      const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 50, bits: 8, departCablage: 'bas-gauche' });
      const data = calculs.cablageData(m, upad, e, { depart: 'bas-gauche' });
      const variante = data.variantes.find((x) => x.mode === data.conseil);
      const mires = mire.preparerMires({ mur: m, dalle: upad, evaluation: e, variante, surfaceMax: 16777216 });
      v.egal('mur entier : refusé sur iPhone, renvoi aux mires par processeur', [mires.mur.possible, /mires par processeur/.test(mires.mur.message ?? '')], [false, true]);
      v.egal('mires par processeur', mires.processeurs.map((p) => [p.possible, p.largeur, p.hauteur]), [[true, 3924, 1536], [true, 4008, 1536], [true, 3924, 1536]]);
      const plan = mires.processeurs[1].plan;
      v.vrai('dalle nommée avec sa zone', plan.dalles.find((d) => d.id === 'B · C1 R1')?.textes.some((t) => t.texte === 'B · C1 R1'));
      const canvas = mire.dessinerMire(plan);
      const ctx = canvas.getContext('2d');
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('');
      v.egal('vide entre B-C et B (x 610, y 1400) : gris hors mur', pixel(610, 1400), '141414');
    },
  },
  {
    id: 'N59',
    titre: 'Écran « Forme de la zone » (étape 9b4) : grille vue de face, une case de 48 px au moins par dalle, défilant dans son cadre ; un appui retire ou remet une dalle ; en mode « Glisser », un glissé peint les cases traversées ; décalage d\'une colonne ; rangée de demi-dalles à part ; « Tout remettre » ; compte « n dalles sur m » ; Retour et Échap ferment',
    etape: '9b',
    async verifier(v) {
      const forme = await moduleAppli(v, '../src/ecran-forme.js');
      if (!forme) return;
      const retirer = await chargerStylesLook();
      let recu = null;
      let ferme = false;
      const zone = { nom: 'B', colonnes: 6, rangees: 3, rangeeDemi: true, positionDemi: 'bas' };
      const ecran = forme.ouvrirForme({ zone, surChange: (z) => { recu = z; }, surFermer: () => { ferme = true; } });
      try {
        v.egal('écran plein ouvert, titre', [ecran.hidden, ecran.querySelector('h2')?.textContent], [false, 'Forme de B']);
        const cases = () => [...ecran.querySelectorAll('.case-forme')];
        v.egal('une case par place : 6 × 3 et 6 demi-dalles', [cases().length, ecran.querySelectorAll('.case-forme[data-type="demi"]').length], [24, 6]);
        const taille = cases()[0].getBoundingClientRect();
        v.vrai('cases de 48 px au moins', taille.width >= 47.5 && taille.height >= 47.5);
        v.egal('la grille défile dans son cadre', getComputedStyle(ecran.querySelector('.grille-forme-cadre')).overflowX, 'auto');
        const compte = () => ecran.querySelector('.compte-forme').textContent;
        v.egal('compte de départ', compte(), '24 dalles sur 24');
        const c2r1 = ecran.querySelector('.case-forme[data-colonne="2"][data-rangee="1"]');
        c2r1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        c2r1.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
        v.egal('appui : C2 R1 absente', [recu?.absentes, compte(), ecran.querySelector('.case-forme[data-colonne="2"][data-rangee="1"]').getAttribute('aria-pressed')], [[[2, 1]], '23 dalles sur 24', 'false']);
        ecran.querySelector('input[name="modeForme"][value="glisser"]').click();
        v.egal('mode « Glisser » : la grille ne défile plus au doigt', getComputedStyle(ecran.querySelector('.grille-forme')).touchAction, 'none');
        const a = ecran.querySelector('.case-forme[data-colonne="4"][data-rangee="2"]');
        a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
        forme.peindreSur(ecran, ecran.querySelector('.case-forme[data-colonne="5"][data-rangee="2"]'));
        a.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
        v.egal('glissé : C4 R2 et C5 R2 absentes', recu?.absentes, [[2, 1], [4, 2], [5, 2]]);
        ecran.querySelector('.entete-colonne[data-colonne="3"]').click();
        const decalage = ecran.querySelector('input[name="decalageColonne"]');
        v.vrai('décalage de la colonne 3 proposé', Boolean(decalage) && /colonne 3/.test(decalage.closest('label')?.textContent ?? ''));
        decalage.value = '250';
        decalage.dispatchEvent(new Event('input', { bubbles: true }));
        v.egal('décalage gardé', recu?.decalagesMm, [0, 0, 250]);
        ecran.querySelector('[data-action="remettre"]').click();
        v.egal('tout remettre', ['absentes' in recu, 'decalagesMm' in recu, compte()], [false, false, '24 dalles sur 24']);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        v.egal('Échap ferme', [ferme, ecran.isConnected], [true, false]);
        const autre = forme.ouvrirForme({ zone, surChange: () => {}, surFermer: () => { ferme = 'retour'; } });
        autre.querySelector('[data-action="fermer"]').click();
        v.egal('Retour ferme', [ferme, autre.isConnected], ['retour', false]);
      } finally {
        ecran.remove();
        retirer();
      }
    },
  },
  {
    id: 'N60',
    titre: 'Formes libres (étape 9b6) : Schéma, export PNG et mire d\'un mur avec une porte (dalles absentes) et d\'un mur mixte : dalles absentes en pointillés dans le Schéma, en noir dans l\'export, au gris « hors mur » dans la mire ; chaque dalle d\'un mur mixte à sa taille',
    etape: '9b',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const porte = [5, 6].flatMap((c) => [2, 3, 4, 5].map((r) => [c, r]));
      const m = calculs.murZones(DALLE_CAS_13, [{ nom: 'MUR', colonnes: 10, rangees: 5, absentes: porte }]);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8, departCablage: 'bas-gauche' });
      const data = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'bas-gauche' });
      const variante = data.variantes.find((x) => x.mode === data.conseil);
      const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
      const geo = geometrieSchema(vue, m, DALLE_CAS_13, calculs.pixelMap(m, DALLE_CAS_13, e));
      const { svg } = construireSvg({ geo, trajets: trajetsSchema(vue, variante, null, null), coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000 });
      v.egal('Schéma : 42 dalles, 8 dalles absentes en pointillés', [svg.querySelectorAll('[data-dalle]').length, svg.querySelectorAll('.dalle-absente').length], [42, 8]);
      v.vrai('Schéma : pointillés', [...svg.querySelectorAll('.dalle-absente')].every((r) => r.getAttribute('stroke-dasharray')));
      const pm = calculs.pixelMap(m, DALLE_CAS_13, e);
      const canvas = pixelMapEnCanvas(pm.mur);
      const ctx = canvas.getContext('2d');
      const pixel = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      v.egal('export : taille exacte, porte en noir, dalle allumée', [canvas.width, canvas.height, pixel(canvas, 864, 480), pixel(canvas, 96, 480) !== '0,0,0'], [1920, 960, '0,0,0', true]);
      void ctx;
      const mires = mire.preparerMires({ mur: m, dalle: DALLE_CAS_13, evaluation: e, variante, surfaceMax: 16777216 });
      const plan = mires.mur.plan;
      v.egal('mire : 42 dalles nommées', plan.dalles.length, 42);
      const c = mire.dessinerMire(plan);
      const hex = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).map((k) => k.toString(16).padStart(2, '0')).join('');
      v.egal('mire : porte au gris hors mur', hex(864, 600), '141414');
      const mixte = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 2, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 2, dalle: { id: 'f64', nom: 'Dalle 64 px', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 64, pxV: 64 } }], { ecarts: 'colles' });
      const geoPx = geometrieSchema({ vue: 'pixels', canvasVue: 'mur', cablage: 'data' }, mixte, DALLE_CAS_13, calculs.pixelMap(mixte, DALLE_CAS_13, null));
      v.egal('mur mixte, vue pixels : chaque dalle à sa taille', [geoPx.rects.get('A · C1 R1').w, geoPx.rects.get('B · C1 R1').w, geoPx.rects.get('B · C1 R1').x], [192, 64, 384]);
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
