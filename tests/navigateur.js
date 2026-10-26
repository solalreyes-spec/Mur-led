// Contrôles qui demandent un navigateur (canvas, images PNG) : exécutés par tests.html seulement,
// pas par node --test. Ils vérifient les exports d'image de l'étape 8c.

import * as calculs from '../src/calculs.js';
import { pixelMapEnCanvas, canvasEnPng, schemaEnPng, enregistrer, modeEnregistrement, TEINTES } from '../src/export.js';
import { geometrieSchema, trajetsSchema, construireSvg, repereSchema, PALETTE_EXPORT, PALETTE_ECRAN } from '../src/dessin-schema.js';
import { processeurDeBase, baseProcesseurs, dalleDeBase, liaisonsDeBase, regieDeBase } from './base.js';
import { DALLE_CAS_13, DALLE_CAS_7, CB5, CB5_DEMI } from './dalles-fictives.js';
import { versionCache, empreinteDeclaree, empreinteCache, listeCache } from './fichiers.js';
import { VERSIONS_CACHE } from './versions-cache.js';
import { creerStockage } from '../src/stockage.js';
import * as couleurs from '../src/couleurs.js';
import * as dessinSchema from '../src/dessin-schema.js';
import { el } from '../src/dom.js';
import * as exportImage from '../src/export.js';

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
// Étape 11e : Canvas dans la famille de la régie (turquoise), Schéma dans sa propre famille (vert anis).
const ONGLETS_LOOK = [['mur', 'image'], ['data', 'donnees'], ['canvas', 'regie'], ['elec', 'electricite'], ['poids', 'accroche'],
  ['schema', 'schema'], ['depannage', 'depannage'], ['base', 'base'], ['apprendre', 'apprendre']];
// Module d'écran encore absent (tests écrits avant le code) : null au lieu d'une erreur de chargement.
async function importerSiPresent(chemin) {
  try {
    return await import(chemin);
  } catch (erreur) {
    return null;
  }
}

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
    titre: 'Aperçu du mur (§ 3, refait à l\'étape 11c, § 8) : petits carrés aux proportions réelles en millimètres (dalle de 500 × 1 000 mm deux fois plus haute que large), damier de deux tons de la famille, 72 dalles sur le 12 × 6 ; jusqu\'à 1 000 dalles chacune dessinée ; au-delà, le contour et un trait toutes les 10 dalles, avec une note ; dessin caché aux lecteurs d\'écran',
    etape: 'look',
    async verifier(v, contexte) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look?.apercuMur) {
        v.vrai('apercuMur exportée par look.js', false);
        return;
      }
      const { sombre } = await jetonsStyles();
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', class: 'carte', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      try {
        const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
        const apercu = look.apercuMur(calculs.mur(bp2, 12, 6), bp2);
        cadre.append(apercu ?? '');
        const carres = [...(apercu?.querySelectorAll('.ap-dalle') ?? [])];
        v.egal('12 × 6 : 72 carrés, damier (36 et 36), premier clair', [carres.length, carres.filter((c) => c.classList.contains('ap-b')).length, carres[0]?.classList.contains('ap-a'), carres[1]?.classList.contains('ap-b'), carres[12]?.classList.contains('ap-b')],
          [72, 36, true, true, true]);
        v.egal('deux tons de la famille', [rgbVersHex(getComputedStyle(carres[0]).fill), rgbVersHex(getComputedStyle(carres[1]).fill)], [sombre['--famille-image'], sombre['--famille-image-bord']]);
        v.egal('proportions réelles : 6 000 × 3 000 mm', apercu?.querySelector('svg')?.getAttribute('viewBox'), '0 0 6000 3000');
        const haute = { id: 'fictive-haute', nom: 'Dalle 500 × 1000', largeurMm: 500, hauteurMm: 1000, pxH: 128, pxV: 256 };
        const a2 = look.apercuMur(calculs.mur(haute, 3, 2), haute);
        const r = a2?.querySelector('.ap-dalle');
        v.egal('dalle de 500 × 1 000 mm : deux fois plus haute que large', [a2?.querySelector('svg')?.getAttribute('viewBox'), Number(r?.getAttribute('height')) / Number(r?.getAttribute('width'))], ['0 0 1500 2000', 2]);
        v.vrai('dessin caché aux lecteurs d\'écran', apercu?.querySelector('svg')?.getAttribute('aria-hidden') === 'true');
        v.egal('1 000 dalles (40 × 25) : chacune dessinée', look.apercuMur(calculs.mur(bp2, 40, 25), bp2)?.querySelectorAll('.ap-dalle').length, 1000);
        const grand = look.apercuMur(calculs.mur(bp2, 50, 30), bp2);
        v.egal('1 500 dalles (50 × 30) : contour, 4 traits verticaux et 2 horizontaux, aucune dalle, une note', [grand?.querySelectorAll('.ap-dalle').length, grand?.querySelectorAll('.ap-contour').length,
          grand?.querySelectorAll('.ap-trait-v').length, grand?.querySelectorAll('.ap-trait-h').length, texteDe(grand?.querySelector('.apercu-note'))],
        [0, 1, 4, 2, '1500 dalles : un trait toutes les 10 dalles.']);
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
    titre: 'Mur en petits carrés en mode Zones (étape 9a ; aperçu du mur de l\'étape 11c) : chaque zone à sa place réelle (écarts et hauteur du bas, en % du mur), autant de carrés que de dalles, décoratif ; au-delà de 1 000 dalles, le contour de chaque zone au lieu des carrés',
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
        const apercu = look.apercuMur(m, dalle);
        cadre.append(apercu ?? '');
        const dessin = apercu?.querySelector('svg');
        const carres = (zone) => [...(dessin?.querySelectorAll(`.ap-dalle[data-zone="${zone}"]`) ?? [])];
        v.egal('chaque zone dessinée, un carré par dalle', [carres('A').length, carres('B').length], [16, 4]);
        const [, , W, H] = (dessin?.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
        const n = (r, a) => Number(r.getAttribute(a));
        const b = carres('B');
        const x0 = Math.min(...b.map((r) => n(r, 'x')));
        const x1 = Math.max(...b.map((r) => n(r, 'x') + n(r, 'width')));
        const y0 = Math.min(...b.map((r) => n(r, 'y')));
        const y1 = Math.max(...b.map((r) => n(r, 'y') + n(r, 'height')));
        v.egal('zone B : à 3 m du bord gauche sur 4 m, 1 m de large (en % de la largeur)', [Math.round((100 * x0) / W), Math.round((100 * (x1 - x0)) / W)], [75, 25]);
        v.egal('zone B : bas à 0,5 m du sol, haut à 1,5 m sur 2 m (en % de la hauteur)', [Math.round((100 * y0) / H), Math.round((100 * (y1 - y0)) / H)], [25, 50]);
        const boite = dessin.getBoundingClientRect();
        v.vrai('proportions du mur réel (4 × 2 m)', Math.abs(boite.width / boite.height - 2) < 0.02);
        v.vrai('décoratif : caché aux lecteurs d\'écran', dessin?.getAttribute('aria-hidden') === 'true');
        const grand = look.apercuMur(calculs.murZones(dalle, [{ nom: 'A', colonnes: 40, rangees: 20 }, { nom: 'B', colonnes: 21, rangees: 10 }]), dalle);
        v.egal('au-delà de 1 000 dalles : le contour de chaque zone, aucun carré', [grand?.querySelectorAll('.ap-contour').length, grand?.querySelectorAll('.ap-dalle').length], [2, 0]);
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
  {
    id: 'N61',
    titre: 'Sortie pliée (étape 9b7, S7) : export PNG et mire de la sortie pliée, à la taille du format (3840 × 2160), tranches à leur place dans la sortie, étiquettes de la slide (nom, « x, y // largeur × hauteur », taille en m), noir hors des tranches ; cas F8 bis',
    etape: '9b',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const m = calculs.murZones(DALLE_CAS_7, [{ nom: 'A', colonnes: 40, rangees: 1 }, { nom: 'B', colonnes: 40, rangees: 1, placement: { type: 'dessous', zone: 'A' } }]);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8 });
      const pliage = calculs.pliageSortie(m, DALLE_CAS_7, e, [3840, 2160]);
      const pm = calculs.pixelMapPliee(calculs.pixelMap(m, DALLE_CAS_7, e), m, pliage);
      const c = pm.canvas[0];
      v.egal('canvas plié : 3840 × 2160, les 80 dalles', [c.bloc.largeurPx, c.bloc.hauteurPx, c.dalles.length], [3840, 2160, 80]);
      const place = (id) => { const d = c.dalles.find((x) => x.id === id); return d ? [d.x, d.y] : null; };
      v.egal('dalles à leur place dans la sortie', [place('A · C1 R1'), place('A · C18 R1'), place('B · C40 R1')],
        [[[0, 191], [0, 191]], [[0, 191], [192, 383]], [[960, 1151], [960, 1151]]]);
      v.egal('étiquettes des tranches', calculs.motifPixelMap(c).etiquettes.slice(0, 3).map((x) => x.lignes),
        [['A 1/3', '0, 0 // 3264 × 192', '8,5 × 0,5 m'], ['A 2/3', '0, 192 // 3264 × 192', '8,5 × 0,5 m'], ['A 3/3', '0, 384 // 1152 × 192', '3 × 0,5 m']]);
      const canvas = pixelMapEnCanvas(c);
      v.egal('PNG à la taille de la sortie', [canvas.width, canvas.height], [3840, 2160]);
      const ctx = canvas.getContext('2d');
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      v.vrai('dans une tranche : pas noir ; à droite de A 1/3 et sous la dernière étagère : noir',
        pixel(100, 150) !== '0,0,0' && pixel(3500, 100) === '0,0,0' && pixel(100, 1300) === '0,0,0', `${pixel(100, 150)} ; ${pixel(3500, 100)} ; ${pixel(100, 1300)}`);
      const data = calculs.cablageData(m, DALLE_CAS_7, e, { depart: 'haut-gauche' });
      const variante = data.variantes.find((x) => x.mode === data.conseil);
      const mires = mire.preparerMires({ mur: m, dalle: DALLE_CAS_7, evaluation: e, variante, pliage, surfaceMax: 16777216 });
      const p = mires.processeurs[0];
      v.egal('mire du processeur : à la taille de la sortie pliée', [mires.processeurs.length, p?.largeur, p?.hauteur, Boolean(p?.plan)], [1, 3840, 2160, true]);
    },
  },
  {
    id: 'N62',
    titre: 'Forme réelle à l\'écran (étape 9c2) : bloc « Forme réelle » de chaque carte de zone (replié sans réglage de la 9c, courbure avec rayon, corde et profondeur, pli ou pose libre), réglages hors du formulaire ; vue de dessus du mur courbe (cas G1) et du plafond (cas G2) aux proportions, rien pour un mur à plat ; Schéma : trait mixte et angle sur chaque pli, courbure de la zone écrite',
    etape: '9c2',
    async verifier(v, contexte) {
      const zones = await moduleAppli(v, '../src/zones.js');
      const look = await moduleAppli(v, '../src/look.js');
      if (!zones || !look) return;
      const retirer = await chargerStylesLook();
      const formulaire = el('form', { 'data-famille': 'image', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(formulaire);
      let recu = null;
      try {
        const saisie = { ...zones.lireSaisieZones(''), zones: [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 2 }] };
        let ed = zones.monterEditeurZones({ saisie, surChange: (s) => { recu = s; }, largeurColonne: () => 500 });
        formulaire.replaceChildren(ed);
        const bloc = (i) => ed.querySelectorAll('.carte-zone')[i].querySelector('details.forme-reelle');
        v.egal('un bloc « Forme réelle » par zone, replié', [ed.querySelectorAll('details.forme-reelle').length, bloc(0).open, bloc(0).querySelector('summary').textContent], [2, false, 'Forme réelle']);
        v.egal('première zone : pas de pose réelle', [Boolean(bloc(0).querySelector('[data-reglage="poseType"]')), Boolean(bloc(1).querySelector('[data-reglage="poseType"]'))], [false, true]);
        v.egal('aucun réglage dans le formulaire', formulaire.elements.length, 0);
        const sens = bloc(0).querySelector('[data-reglage="courbureSens"]');
        sens.value = 'concave';
        sens.dispatchEvent(new Event('change', { bubbles: true }));
        const angle = bloc(0).querySelector('[data-reglage="courbureAngle"]');
        v.vrai('courbure : angle proposé', Boolean(angle));
        angle.value = '2,5';
        angle.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('courbure gardée', recu?.zones[0].courbure, { sens: 'concave', angleDeg: 2.5 });
        v.egal('rayon, corde, profondeur en direct', bloc(0).querySelector('.grandeurs-courbure')?.textContent,
          'Rayon 11,46 m, corde 2 m, profondeur 0,04 m, 7,5° au total');
        v.vrai('bloc ouvert une fois réglé', bloc(0).open);
        const type = bloc(1).querySelector('[data-reglage="poseType"]');
        type.value = 'pliee';
        type.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('pli proposé : sens et angle', [Boolean(bloc(1).querySelector('[data-reglage="poseSens"]')), Boolean(bloc(1).querySelector('[data-reglage="poseAngle"]'))], [true, true]);
        const pli = bloc(1).querySelector('[data-reglage="poseAngle"]');
        pli.value = '90';
        pli.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('pli gardé (concave par défaut)', recu?.zones[1].pose, { type: 'pliee', sens: 'concave', angleDeg: 90 });
        const libre = bloc(1).querySelector('[data-reglage="poseType"]');
        libre.value = 'libre';
        libre.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('pose libre : X, bas, Z, lacet, tangage', ['poseX', 'poseBas', 'poseZ', 'poseLacet', 'poseTangage'].map((n) => Boolean(bloc(1).querySelector(`[data-reglage="${n}"]`))), [true, true, true, true, true]);
        v.egal('pose libre gardée', recu?.zones[1].pose, { type: 'libre', xMm: 0, basMm: 0, zMm: 0, lacetDeg: 0, tangageDeg: 0 });
        const cibles = [...ed.querySelectorAll('details.forme-reelle select, details.forme-reelle input')].map((x) => x.getBoundingClientRect().height);
        v.vrai('réglages de 48 px au moins', cibles.every((h) => h >= 47.5));
        v.vrai('rien ne dépasse 375 px', ed.scrollWidth <= 375);

        const bp2 = dalleDeBase(contexte, 'roe-bp2');
        const g1 = calculs.murZones(bp2, [{ nom: 'MUR', colonnes: 37, rangees: 9, courbure: { sens: 'concave', angleDeg: 2.5 } }]);
        const vue1 = look.vueDessus(calculs.formeReelle(g1, bp2));
        formulaire.replaceChildren(vue1);
        const svg1 = vue1?.querySelector('svg');
        v.vrai('vue de dessus du mur courbe : un trait par colonne', Boolean(svg1) && svg1.querySelectorAll('.colonne-dessus').length === 37);
        const vb = svg1.getAttribute('viewBox').split(' ').map(Number);
        v.egal('aux proportions de la boîte (largeur ÷ profondeur)', Math.round((vb[2] / vb[3]) * 100) / 100, Math.round((16556.7 / 3532.6) * 100) / 100);
        v.egal('légende', vue1.querySelector('.legende-dessus')?.textContent, 'Vue de dessus, public en bas : 16,56 × 3,53 m (largeur × profondeur)');
        const cb8 = dalleDeBase(contexte, 'roe-cb8');
        const g2 = calculs.murZones(bp2, [{ nom: 'MUR', colonnes: 37, rangees: 9 }, { nom: 'PLAFOND', colonnes: 17, rangees: 3, dalle: cb8, placement: { type: 'dessus', zone: 'MUR', alignement: 'droite' }, pose: { type: 'pliee', sens: 'concave', angleDeg: 90 } }]);
        const vue2 = look.vueDessus(calculs.formeReelle(g2, bp2));
        v.egal('plafond : dalles en hachures, mur en traits', [vue2.querySelectorAll('.dalle-plafond').length, vue2.querySelectorAll('.colonne-dessus').length], [51, 37]);
        const ez = dalleDeBase(contexte, 'infiled-ez2-6-mk2');
        v.egal('mur à plat : pas de vue de dessus', look.vueDessus(calculs.formeReelle(calculs.murZones(ez, [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 4, rangees: 2 }]), ez)), null);

        const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
        const geo = geometrieSchema(vue, g2, bp2, null);
        const { svg } = construireSvg({ geo, trajets: [], coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000 });
        v.egal('Schéma : un trait de pli, sur le haut du mur, de x 8 300 à 18 500 mm', [...svg.querySelectorAll('.pli')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a)))), [[8300, 3600, 18500, 3600]]);
        v.vrai('Schéma : trait mixte', [...svg.querySelectorAll('.pli')].every((l) => (l.getAttribute('stroke-dasharray') ?? '').split(' ').length === 4));
        v.egal('Schéma : angle du pli écrit', [...svg.querySelectorAll('.etiquette-pli')].map((t) => t.textContent), ['90° concave']);
        const geo1 = geometrieSchema(vue, g1, bp2, null);
        const s1 = construireSvg({ geo: geo1, trajets: [], coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000 }).svg;
        v.egal('Schéma : courbure de la zone écrite', [...s1.querySelectorAll('.etiquette-courbure')].map((t) => t.textContent), ['MUR : concave 2,5° par jonction']);
      } finally {
        formulaire.remove();
        retirer();
      }
    },
  },
  {
    id: 'N63',
    titre: 'Liste des positions par dalle, fichiers (étape 9c3) : CSV et OBJ du cas G2 en fichiers UTF-8 (types text/csv et model/obj, contenu relu à l\'octet près, accents compris) ; feuille de partage quand l\'appareil sait partager le fichier, téléchargement sinon',
    etape: '9c3',
    async verifier(v, contexte) {
      const exp = await moduleAppli(v, '../src/export.js');
      if (!exp) return;
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const cb8 = dalleDeBase(contexte, 'roe-cb8');
      const g2 = calculs.murZones(bp2, [{ nom: 'MUR', colonnes: 37, rangees: 9 }, { nom: 'PLAFOND', colonnes: 17, rangees: 3, dalle: cb8, placement: { type: 'dessus', zone: 'MUR', alignement: 'droite' }, pose: { type: 'pliee', sens: 'concave', angleDeg: 90 } }]);
      const p = calculs.positionsDalles(g2, bp2);
      const csv = exp.fichierTexte(calculs.texteCSV(p), 'mur-led-positions.csv', 'text/csv');
      const obj = exp.fichierTexte(calculs.texteOBJ(p), 'mur-led-modele-3d.obj', 'model/obj');
      v.egal('types et noms', [csv.type.split(';')[0], csv.name, obj.type.split(';')[0], obj.name], ['text/csv', 'mur-led-positions.csv', 'model/obj', 'mur-led-modele-3d.obj']);
      const texteCsv = await csv.text();
      v.egal('CSV relu tel quel : 384 lignes et l\'en-tête', [texteCsv === calculs.texteCSV(p), texteCsv.split('\n').length], [true, 385]);
      v.vrai('accents en UTF-8 (« · » des noms de dalles)', (await csv.arrayBuffer()).byteLength > texteCsv.length && /MUR · C1 R1/.test(texteCsv));
      const texteObj = await obj.text();
      v.egal('OBJ : 384 faces, deux objets', [texteObj.split('\n').filter((l) => l.startsWith('f ')).length, texteObj.split('\n').filter((l) => l.startsWith('o ')).length], [384, 2]);
      const accepte = { share: () => Promise.resolve(), canShare: () => true };
      const refuse = { share: () => Promise.resolve(), canShare: () => false };
      v.egal('partage si l\'appareil le sait, téléchargement sinon', [exp.modeEnregistrement(accepte, [csv]), exp.modeEnregistrement(refuse, [obj])], ['partage', 'telechargement']);
    },
  },
  {
    id: 'N64',
    titre: 'Dalles tournées hors axe (étape 9c4) : export PNG de la pixel map (dalles tournées, noir hors des dalles dans le rectangle englobant), mire (gris « hors mur » au coin du rectangle) et Schéma (dalle dessinée tournée, vue physique et vue pixels) ; cas G6',
    etape: '9c4',
    async verifier(v, contexte) {
      const mire = await moduleAppli(v, '../src/mire.js');
      if (!mire) return;
      const bp2 = dalleDeBase(contexte, 'roe-bp2');
      const m = calculs.murZones(bp2, [{ nom: 'BIAIS', colonnes: 4, rangees: 2, roulisDeg: 45 }]);
      const e = calculs.evaluerProcesseur(m, bp2, processeurDeBase(contexte, 'brompton-t1'), { frequenceHz: 60, bits: 8, departCablage: 'bas-gauche' });
      const pm = calculs.pixelMap(m, bp2, e);
      const canvas = pixelMapEnCanvas(pm.mur);
      const px = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      // Centre de C1 R1 : coin haut gauche (0 ; 497,8), tourné de 45° : centre en (124,4 ; 497,8).
      v.egal('PNG : 747 × 747 px', [canvas.width, canvas.height], [747, 747]);
      v.vrai('PNG : centre de C1 R1 allumé', px(canvas, 124, 497) !== '0,0,0');
      v.egal('PNG : coin haut gauche du rectangle englobant, hors des dalles, noir', [px(canvas, 3, 3), px(canvas, 743, 743)], ['0,0,0', '0,0,0']);
      const data = calculs.cablageData(m, bp2, e, { depart: 'bas-gauche' });
      const variante = data.variantes.find((x) => x.mode === data.conseil);
      const mires = mire.preparerMires({ mur: m, dalle: bp2, evaluation: e, variante, surfaceMax: 16777216 });
      const c = mire.dessinerMire(mires.mur.plan);
      const hex = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).map((k) => k.toString(16).padStart(2, '0')).join('');
      v.egal('mire : coin du rectangle englobant (hors des dalles et des diagonales) au gris hors mur, centre de C1 R1 pas gris', [hex(5, 60), hex(124, 497) !== '141414'], ['141414', true]);
      for (const vue of ['physique', 'pixels']) {
        const geo = geometrieSchema({ vue, canvasVue: 'mur', cablage: 'data' }, m, bp2, pm);
        const { svg } = construireSvg({ geo, trajets: trajetsSchema({ cablage: 'data' }, variante, null, null), coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 1000 });
        const g = svg.querySelector('[data-dalle="C1 R1"]');
        v.vrai(`Schéma, vue ${vue} : dalle tournée de 45° (sens inverse des aiguilles d'une montre vu de face)`, /rotate\(-45 /.test(g?.getAttribute('transform') ?? ''));
      }
      const zones = await moduleAppli(v, '../src/zones.js');
      if (!zones) return;
      let recu = null;
      const ed = zones.monterEditeurZones({ saisie: { ...zones.lireSaisieZones(''), zones: [{ nom: 'A', colonnes: 4, rangees: 2 }] }, surChange: (x) => { recu = x; }, largeurColonne: () => 500 });
      document.body.append(ed);
      try {
        const champ = ed.querySelector('details.forme-reelle [data-reglage="roulis"]');
        v.vrai('éditeur : rotation dans son plan proposée', Boolean(champ));
        champ.value = '45';
        champ.dispatchEvent(new Event('change', { bubbles: true }));
        v.egal('éditeur : rotation gardée', recu?.zones[0].roulisDeg, 45);
      } finally {
        ed.remove();
      }
    },
  },
  {
    id: 'N65',
    titre: 'Écran Prestas (10b2, § 7) : presta ouverte en tête (nom, dates et lieu, dernier export), ses murs avec leur résumé, le mur ouvert marqué, carte de chaque mur et menus « ⋯ » de chaque mur et de la presta (11b) ; autres prestas, la dernière modifiée en tête, avec « Ouvrir » ; archivées repliées ; « Nouvelle presta » ; rappel d\'export sans stockage persistant ; « Modifier » et « Renommer » dans l\'écran, erreur affichée ; chaque bouton appelle son action ; cibles de 48 px, rien ne dépasse à 375 px, noms longs compris',
    etape: '10b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      let n = 0;
      const o = (iso) => ({ maintenant: new Date(iso), alea: () => `n${(n += 1)}` });
      let etat = pr.migrer({}, o('2026-10-13T08:00:00Z'));
      etat = pr.creerPresta(etat, { nom: 'Presta B' }, o('2026-10-13T09:00:00Z'));
      const b = etat.index.ouverte.presta;
      etat = pr.creerPresta(etat, { nom: 'Presta C' }, o('2026-10-13T10:00:00Z'));
      etat = pr.archiverPresta(etat, etat.index.ouverte.presta, true);
      const long = 'Presta'.padEnd(60, 'x');
      const murLong = 'Mur'.padEnd(40, 'y');
      etat = pr.creerPresta(etat, { nom: long }, o('2026-10-13T11:00:00Z'));
      const a = etat.index.ouverte.presta;
      etat = pr.modifierPresta(etat, a, { nom: long, debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B', notes: '' }, o('2026-10-13T11:00:00Z'));
      etat = pr.ajouterMur(etat, a, { nom: murLong }, o('2026-10-13T11:30:00Z'));
      const [mur1, mur2] = etat.index.prestas.find((p) => p.id === a).murs.map((m) => m.id);
      etat = pr.ouvrir(etat, a, mur1);
      const appels = [];
      const actions = Object.fromEntries(['ouvrir', 'creerPresta', 'ajouterMur', 'dupliquerMur', 'supprimerMur', 'dupliquerPresta', 'archiverPresta', 'supprimerPresta']
        .map((nom) => [nom, async (...args) => { appels.push([nom, ...args]); }]));
      actions.modifierPresta = async (id, infos) => {
        appels.push(['modifierPresta', id, infos]);
        if (!infos.nom.trim()) throw new calculs.ErreurSaisie('Donne un nom à la presta.');
      };
      actions.renommerMur = async (id, murId, nom) => { appels.push(['renommerMur', id, murId, nom]); };
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      try {
        const ecran = ep.monterPrestas(racine, { actions, resumeMur: (m) => (m.configuration ? 'résumé' : 'Réglages par défaut'), confirmer: () => true });
        ecran.afficher(etat, { persistant: false });
        const tete = racine.querySelector('.pr-ouverte');
        v.egal('presta ouverte en tête : nom, dates et lieu, export', [texteDe(tete?.querySelector('.pr-nom')), texteDe(tete?.querySelector('.pr-infos')), texteDe(tete?.querySelector('.pr-export'))],
          [long, 'du 17 au 19/10/2026 · Lieu B', 'Jamais exportée']);
        const murs = [...racine.querySelectorAll('.pr-mur')];
        v.egal('ses murs : nom, résumé, le mur ouvert marqué', murs.map((m) => [texteDe(m.querySelector('.pr-mur-nom')), texteDe(m.querySelector('.pr-mur-resume')), m.getAttribute('aria-current')]),
          [['Mur 1', 'Réglages par défaut', 'true'], [murLong, 'Réglages par défaut', null]]);
        // 11b : la carte d'un mur s'ouvre d'un appui (sauf le mur ouvert), ses actions rares dans son menu « ⋯ » ; la presta
        // garde « Ajouter un mur », « Exporter » et « Plus », le reste dans le menu « Plus ».
        const ouvrirMenu = (b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); };
        const menuDe = (b) => { ouvrirMenu(b); return [...document.getElementById(b.getAttribute('aria-controls'))?.querySelectorAll('button') ?? []]; };
        const dansMenu = (b, texte) => menuDe(b).find((x) => texteDe(x) === texte);
        v.egal('carte d\'un mur : appui sur la carte (sauf le mur ouvert) et bouton « ⋯ »', murs.map((m) => [Boolean(m.querySelector('.pr-mur-ouvrir')), m.querySelector('.pr-menu-bouton')?.getAttribute('aria-label')]),
          [[false, 'Actions de Mur 1'], [true, `Actions de ${murLong}`]]);
        v.egal('menu d\'un mur', murs.map((m) => menuDe(m.querySelector('.pr-menu-bouton')).map(texteDe)), [['Matériel', 'Renommer', 'Dupliquer', 'Supprimer'], ['Matériel', 'Renommer', 'Dupliquer', 'Supprimer']]);
        const plus = [...racine.querySelectorAll('.pr-actions-presta button')].find((x) => texteDe(x) === 'Plus');
        v.egal('boutons de la presta', [...racine.querySelectorAll('.pr-actions-presta button')].map(texteDe), ['Ajouter un mur', 'Matériel', 'Fiches', 'Exporter', 'Plus']);
        v.egal('menu « Plus » de la presta', menuDe(plus).map(texteDe), ['Modifier', 'Dupliquer', 'Archiver', 'Supprimer la presta']);
        plus.click();
        v.egal('autres prestas, la dernière modifiée en tête, avec le nombre de murs', [...racine.querySelectorAll('.pr-autres .pr-presta')].map((p) => [texteDe(p.querySelector('.pr-nom')), texteDe(p.querySelector('.pr-infos'))]),
          [['Presta B', '1 mur'], ['Presta sans nom', '1 mur']]);
        v.egal('archivées repliées', [texteDe(racine.querySelector('.pr-archivees > summary')), racine.querySelector('.pr-archivees')?.open], ['Archivées (1)', false]);
        v.egal('« Nouvelle presta »', texteDe(racine.querySelector('.pr-nouvelle')), 'Nouvelle presta');
        v.vrai('rappel d\'export sans stockage persistant', /Exporte tes prestas/.test(texteDe(racine)));
        const boutons = [...racine.querySelectorAll('button, summary')].filter((x) => x.getBoundingClientRect().width > 0);
        v.egal('cibles de 48 px au moins', boutons.filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe), []);
        const droite = racine.getBoundingClientRect().right;
        v.egal('rien ne dépasse à 375 px, noms longs compris', [...racine.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > droite + 0.5).map((x) => x.className || x.tagName), []);
        murs[1].querySelector('button').click();
        racine.querySelector('.pr-autres .pr-presta button').click();
        racine.querySelector('.pr-nouvelle').click();
        const boutonPresta = (texte) => [...racine.querySelectorAll('.pr-actions-presta button')].find((x) => texteDe(x) === texte) ?? dansMenu(plus, texte);
        for (const texte of ['Ajouter un mur', 'Dupliquer', 'Archiver', 'Supprimer la presta']) boutonPresta(texte).click();
        dansMenu(murs[1].querySelector('.pr-menu-bouton'), 'Dupliquer').click();
        dansMenu(murs[1].querySelector('.pr-menu-bouton'), 'Supprimer').click();
        await attendre();
        v.egal('chaque bouton appelle son action', appels.map((x) => x.join(' ')), [
          `ouvrir ${a} ${mur2}`, `ouvrir ${b}`, 'creerPresta', `ajouterMur ${a}`, `dupliquerPresta ${a}`, `archiverPresta ${a} true`, `supprimerPresta ${a}`,
          `dupliquerMur ${a} ${mur2}`, `supprimerMur ${a} ${mur2}`,
        ]);
        appels.length = 0;
        boutonPresta('Modifier').click();
        const form = racine.querySelector('.pr-formulaire');
        v.egal('« Modifier » : formulaire rempli', ['nom', 'debut', 'fin', 'lieu', 'notes'].map((c) => form?.elements[c]?.value), [long, '2026-10-17', '2026-10-19', 'Lieu B', '']);
        form.elements.nom.value = ' ';
        form.requestSubmit();
        await attendre();
        v.egal('erreur affichée dans le formulaire', texteDe(form.querySelector('.alerte')), 'Donne un nom à la presta.');
        form.elements.nom.value = 'Presta A';
        form.requestSubmit();
        await attendre();
        v.egal('enregistré : infos envoyées, formulaire fermé', [appels.at(-1)?.[2], racine.querySelector('.pr-formulaire')],
          [{ nom: 'Presta A', debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B', notes: '', organisation: pr.organisationVide?.() }, null]);
        dansMenu(murs[1].querySelector('.pr-menu-bouton'), 'Renommer').click();
        const renommer = racine.querySelector('.pr-renommer');
        v.egal('« Renommer » : champ dans la ligne du mur, nom actuel', [renommer?.closest('.pr-mur') === murs[1], renommer?.elements.nom.value], [true, murLong]);
        renommer.elements.nom.value = 'Retour scène';
        renommer.requestSubmit();
        await attendre();
        v.egal('renommé', appels.at(-1)?.join(' '), `renommerMur ${a} ${mur2} Retour scène`);
        const exporte = { ...etat, index: { ...etat.index, prestas: etat.index.prestas.map((p) => (p.id === a ? { ...p, exporteeLe: '2026-10-12T08:00:00.000Z' } : p)) } };
        ecran.afficher(exporte, { persistant: true });
        v.egal('date du dernier export ; pas de rappel avec le stockage persistant', [texteDe(racine.querySelector('.pr-export')), /Exporte tes prestas/.test(texteDe(racine))], ['Exportée le 12/10/2026', false]);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N66',
    titre: 'Bouton « Presta · Mur » de l\'en-tête (10b2, § 7 ; fil d\'Ariane de l\'étape 11d) : sous la rangée du titre, au-dessus des outils, en pleine largeur ; nom de la presta puis nom du mur sur une seule ligne, chacun coupé par « … » s\'il ne tient pas, nom entier dans l\'étiquette accessible ; zone d\'appui de 48 px (60 en grand affichage) ; rien ne dépasse à 375 px',
    etape: '10b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      if (!ep) return;
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const entete = page.querySelector('header.entete-app');
      const source = entete?.querySelector('#bouton-presta');
      v.vrai('fil d\'Ariane : sous la rangée du titre, au-dessus des outils', Boolean(source) && source.parentElement === entete
        && Boolean(source.previousElementSibling?.classList.contains('titre-app')) && Boolean(source.nextElementSibling?.classList.contains('outils-entete')));
      if (!source) return;
      const retirer = await chargerStylesLook();
      const cadre = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      const copie = (avecBouton) => {
        const e = document.importNode(entete, true);
        for (const x of e.querySelectorAll('[id]')) {
          x.dataset.ident = x.id;
          x.removeAttribute('id');
        }
        if (!avecBouton) e.querySelector('[data-ident="bouton-presta"]').remove();
        e.querySelector('[data-ident="version-appli"]').textContent = 'v25';
        cadre.append(e);
        return e;
      };
      const avant = document.documentElement.dataset.taille;
      try {
        const long = 'Presta'.padEnd(60, 'x');
        const murLong = 'Mur'.padEnd(40, 'y');
        for (const taille of ['normal', 'grand']) {
          if (taille === 'grand') document.documentElement.dataset.taille = 'grand';
          else delete document.documentElement.dataset.taille;
          cadre.replaceChildren();
          const sans = copie(false);
          const avec = copie(true);
          const bouton = avec.querySelector('[data-ident="bouton-presta"]');
          ep.remplirBoutonPresta(bouton, { presta: { nom: long }, mur: { nom: murLong } });
          const largeurUtile = avec.getBoundingClientRect().width - parseFloat(getComputedStyle(avec).paddingLeft) - parseFloat(getComputedStyle(avec).paddingRight);
          v.vrai(`${taille} : pleine largeur (${Math.round(bouton.getBoundingClientRect().width)} px sur ${Math.round(largeurUtile)})`, Math.abs(bouton.getBoundingClientRect().width - largeurUtile) <= 1);
          void sans;
          const cible = taille === 'grand' ? 60 : 48;
          v.vrai(`${taille} : zone d'appui de ${cible} px au moins (${Math.round(bouton.getBoundingClientRect().height)} px)`, bouton.getBoundingClientRect().height >= cible - 0.5);
          const droite = cadre.getBoundingClientRect().right;
          v.egal(`${taille} : rien ne dépasse à 375 px`, [...avec.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > droite + 0.5).map((x) => x.className || x.tagName), []);
          const lignes = [bouton.querySelector('.bp-presta'), bouton.querySelector('.bp-mur')];
          v.vrai(`${taille} : presta et mur sur la même ligne`, Math.abs(lignes[0].getBoundingClientRect().top - lignes[1].getBoundingClientRect().top) <= 2);
          v.egal(`${taille} : presta puis mur, chacun coupé par « … »`, lignes.map((x) => [texteDe(x), getComputedStyle(x).whiteSpace, getComputedStyle(x).textOverflow, x.scrollWidth > x.clientWidth]),
            [[long, 'nowrap', 'ellipsis', true], [murLong, 'nowrap', 'ellipsis', true]]);
          v.egal(`${taille} : étiquette accessible`, bouton.getAttribute('aria-label'), `Prestas : ${long}, ${murLong}`);
        }
        ep.remplirBoutonPresta(cadre.querySelector('[data-ident="bouton-presta"]'), { presta: { nom: 'Presta A' }, mur: { nom: 'Mur 1' } });
        v.egal('noms courts, entiers', [texteDe(cadre.querySelector('.bp-presta')), texteDe(cadre.querySelector('.bp-mur')), cadre.querySelector('.bp-presta').scrollWidth > cadre.querySelector('.bp-presta').clientWidth],
          ['Presta A', 'Mur 1', false]);
      } finally {
        if (avant) document.documentElement.dataset.taille = avant;
        else delete document.documentElement.dataset.taille;
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N67',
    titre: 'Export d\'une presta (10b3, § 8) : fichier JSON « mur-led-presta-<nom>-<date>.json » au format presta ; feuille de partage quand l\'appareil sait partager le fichier, téléchargement sinon ; bouton « Exporter » à côté de la date du dernier export, note après un téléchargement, rien après une feuille fermée',
    etape: '10b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      let n = 0;
      const o = { maintenant: new Date('2026-10-16T12:00:00Z'), alea: () => `e${(n += 1)}` };
      let etat = pr.creerPresta(pr.migrer({}, o), { nom: 'Presta A' }, o);
      const a = etat.index.ouverte.presta;
      const { donnees } = pr.exporterPresta(etat, a, { fiches: [], parcs: [], sources: {} }, { ...o, versionAppli: 25 });
      const fichier = ep.fichierExportPresta(donnees, o.maintenant);
      v.egal('fichier : nom, type, contenu', [fichier.name, fichier.type, JSON.parse(await fichier.text())], ['mur-led-presta-presta-a-2026-10-16.json', 'application/json', donnees]);
      const partages = [];
      const telecharges = [];
      const navPartage = { canShare: ({ files }) => files[0].type === 'application/json', share: async ({ files }) => { partages.push(files[0].name); } };
      const navSans = {};
      v.egal('feuille de partage si l\'appareil sait partager le fichier, téléchargement sinon', [
        await enregistrer(fichier, fichier.name, { nav: navPartage, telecharger: (b, nom) => telecharges.push(nom) }),
        await enregistrer(fichier, fichier.name, { nav: navSans, telecharger: (b, nom) => telecharges.push(nom) }),
      ], ['partage', 'telechargement']);
      v.egal('fichier partagé, puis téléchargé', [partages, telecharges], [[fichier.name], [fichier.name]]);
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const reponses = ['telechargement', 'annule', 'partage'];
      const appels = [];
      try {
        const ecran = ep.monterPrestas(racine, { actions: { exporter: async (id) => { appels.push(id); return reponses.shift(); } }, confirmer: () => true });
        ecran.afficher(etat, { persistant: true });
        const bouton = racine.querySelector('.pr-export-bloc button');
        v.egal('bouton « Exporter » à côté de la date du dernier export', [texteDe(bouton), Boolean(bouton?.closest('.pr-ouverte')), bouton?.getBoundingClientRect().height >= 47.5], ['Exporter', true, true]);
        const note = () => texteDe(racine.querySelector('.pr-export-bloc .pr-note-export'));
        bouton.click();
        await new Promise((fin) => setTimeout(fin, 0));
        v.egal('après un téléchargement : où trouver le fichier', note(), 'Fichier enregistré dans Fichiers (Téléchargements) : envoie-le par AirDrop, Messages ou Mail.');
        bouton.click();
        await new Promise((fin) => setTimeout(fin, 0));
        v.egal('feuille fermée sans envoyer : rien', note(), '');
        bouton.click();
        await new Promise((fin) => setTimeout(fin, 0));
        v.egal('après une feuille de partage : presta exportée', [note(), appels], ['Presta exportée.', [a, a, a]]);
      } finally {
        racine.remove();
        retirer();
      }
      const reel = modeEnregistrement(navigator, [fichier]);
      v.vrai(`ce navigateur : ${reel === 'partage' ? 'feuille de partage' : 'téléchargement'} pour un fichier JSON`, reel === 'partage' || reel === 'telechargement');
    },
  },
  {
    id: 'N68',
    titre: 'Import d\'une presta dans l\'écran (10b3, § 8) : bouton « Importer une presta » et sélecteur de fichier sans filtre ; fichier refusé : sa raison ; presta déjà là ou fiches et parcs différents : choix « Garder les deux » et « Garder les miens » cochés par défaut, les fiches et parcs nommés ; « Remplacer » ou « Prendre » demandent une confirmation ; rapport en phrases ; « Annuler »',
    etape: '10b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      const etat = pr.migrer({}, { maintenant: new Date('2026-10-16T12:00:00Z'), alea: (() => { let n = 0; return () => `i${(n += 1)}`; })() });
      const analyses = [
        { erreurs: ['C\'est un export de la base : importe-le dans l\'onglet Base.'] },
        { erreurs: [], donnees: { presta: { nom: 'Presta A' }, murs: [{}, {}] }, prestaExiste: true, conflits: { fiches: ['roe-bp2-v2'], parcs: ['Prestataire A'] } },
      ];
      const rapport = { presta: 'copie', nom: 'Presta A (reçue le 16/10/2026)', murs: 2, fiches: { ajoutees: [], identiques: [], gardees: ['roe-bp2-v2'], remplacees: [], refusees: [] }, parcs: { ajoutes: [], identiques: [], gardes: ['Prestataire A'], remplaces: [] }, fichiersDecrits: [] };
      const lus = [];
      const importes = [];
      const confirmations = [];
      let accepter = false;
      const actions = {
        verifierImport: async (texte) => { lus.push(texte); return analyses[Math.min(lus.length - 1, 1)]; },
        importer: async (texte, choix) => { importes.push([texte, choix]); return rapport; },
      };
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 50));
      const choisirFichier = async (texte) => {
        const champ = racine.querySelector('.pr-fichier-import');
        const dt = new DataTransfer();
        dt.items.add(new File([texte], 'mur-led-presta-presta-a-2026-10-16.json', { type: 'application/json' }));
        champ.files = dt.files;
        champ.dispatchEvent(new Event('change', { bubbles: true }));
        await attendre();
      };
      try {
        const ecran = ep.monterPrestas(racine, { actions, confirmer: (t) => { confirmations.push(t); return accepter; } });
        ecran.afficher(etat, { persistant: true });
        const bouton = [...racine.querySelectorAll('button')].find((b) => texteDe(b) === 'Importer une presta');
        const champ = racine.querySelector('.pr-fichier-import');
        v.egal('bouton « Importer une presta » ; sélecteur de fichier caché, sans filtre', [Boolean(bouton), champ?.type, champ?.hasAttribute('accept'), champ?.hidden], [true, 'file', false, true]);
        await choisirFichier('{"format":"appli-mur-led/export"}');
        v.egal('fichier refusé : sa raison', texteDe(racine.querySelector('.pr-import .alerte-erreur')), 'C\'est un export de la base : importe-le dans l\'onglet Base.');
        await choisirFichier('{"format":"appli-mur-led/presta"}');
        const panneau = racine.querySelector('.pr-import');
        v.egal('titre du choix', texteDe(panneau?.querySelector('.pr-import-titre')), 'Importer « Presta A » (2 murs)');
        const coche = (nom) => panneau?.querySelector(`input[name="${nom}"]:checked`)?.value;
        v.egal('choix par défaut : garder les deux, garder les miens', [coche('choixPresta'), coche('choixConflits')], ['deux', 'garder']);
        v.vrai('fiches et parcs différents nommés', /roe-bp2-v2/.test(texteDe(panneau)) && /Prestataire A/.test(texteDe(panneau)));
        panneau.querySelector('input[name="choixPresta"][value="remplacer"]').click();
        [...panneau.querySelectorAll('button')].find((b) => texteDe(b) === 'Importer').click();
        await attendre();
        v.egal('« Remplacer la mienne » : confirmation demandée, refusée : rien importé', [confirmations.length, importes.length], [1, 0]);
        panneau.querySelector('input[name="choixPresta"][value="deux"]').click();
        [...panneau.querySelectorAll('button')].find((b) => texteDe(b) === 'Importer').click();
        await attendre();
        v.egal('« Garder les deux » et « Garder les miens » : sans confirmation, texte du fichier et choix envoyés', [confirmations.length, importes[0]],
          [1, ['{"format":"appli-mur-led/presta"}', { presta: 'deux', conflits: 'garder' }]]);
        v.egal('rapport en phrases', [...racine.querySelectorAll('.pr-import .pr-rapport li')].map(texteDe), pr.texteRapportImport(rapport));
        await choisirFichier('{"format":"appli-mur-led/presta"}');
        accepter = true;
        racine.querySelector('.pr-import input[name="choixConflits"][value="prendre"]').click();
        [...racine.querySelectorAll('.pr-import button')].find((b) => texteDe(b) === 'Importer').click();
        await attendre();
        v.egal('« Prendre ceux du fichier » : confirmation, puis import', [confirmations.length, importes[1]?.[1]], [2, { presta: 'deux', conflits: 'prendre' }]);
        await choisirFichier('{"format":"appli-mur-led/presta"}');
        [...racine.querySelectorAll('.pr-import button')].find((b) => texteDe(b) === 'Annuler').click();
        await attendre();
        v.egal('« Annuler » : choix retiré, rien importé', [racine.querySelector('.pr-import')?.childElementCount ?? 0, importes.length], [0, 2]);
        const droite = racine.getBoundingClientRect().right;
        v.egal('rien ne dépasse à 375 px', [...racine.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > droite + 0.5).map((x) => x.className || x.tagName), []);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N69',
    titre: 'Écran Prestas, relecture du 16/10/2026 : un double appui ne lance qu\'une action (« Nouvelle presta », « Importer » du choix d\'import) tant que la première n\'est pas finie ; ensuite les boutons répondent de nouveau',
    etape: '10b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      const etat = pr.migrer({}, { maintenant: new Date('2026-10-16T12:00:00Z'), alea: (() => { let n = 0; return () => `d${(n += 1)}`; })() });
      const appels = [];
      let finir = null;
      const lente = (nom) => (...args) => {
        appels.push(nom);
        return new Promise((fin) => { finir = () => fin(nom === 'importer' ? { presta: 'ajoutee', nom: 'Presta A', murs: 1, fiches: { ajoutees: [], identiques: [], gardees: [], remplacees: [], refusees: [] }, parcs: { ajoutes: [], identiques: [], gardes: [], remplaces: [] }, fichiersDecrits: [] } : undefined); });
      };
      const actions = {
        creerPresta: lente('creerPresta'),
        importer: lente('importer'),
        verifierImport: async () => ({ erreurs: [], donnees: { presta: { nom: 'Presta A' }, murs: [{}] }, prestaExiste: false, conflits: { fiches: [], parcs: [] } }),
      };
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 50));
      try {
        const ecran = ep.monterPrestas(racine, { actions, confirmer: () => true });
        ecran.afficher(etat, { persistant: true });
        racine.querySelector('.pr-nouvelle').click();
        racine.querySelector('.pr-nouvelle').click();
        await attendre();
        v.egal('« Nouvelle presta » appuyé deux fois : une seule action', appels, ['creerPresta']);
        finir();
        await attendre();
        racine.querySelector('.pr-nouvelle').click();
        await attendre();
        v.egal('action finie : le bouton répond de nouveau', appels, ['creerPresta', 'creerPresta']);
        finir();
        await attendre();
        const champ = racine.querySelector('.pr-fichier-import');
        const dt = new DataTransfer();
        dt.items.add(new File(['{}'], 'presta.json', { type: 'application/json' }));
        champ.files = dt.files;
        champ.dispatchEvent(new Event('change', { bubbles: true }));
        await attendre();
        const importer = [...racine.querySelectorAll('.pr-import-choix button')].find((b) => texteDe(b) === 'Importer');
        importer.click();
        importer.click();
        await attendre();
        v.egal('« Importer » appuyé deux fois : un seul import', appels.filter((a) => a === 'importer').length, 1);
        finir();
        await attendre();
        v.egal('import fini : rapport affiché', texteDe(racine.querySelector('.pr-rapport li')), 'Presta A importée, avec son mur.');
      } finally {
        racine.remove();
      }
    },
  },
  {
    id: 'N70',
    titre: 'Grand mur (11-0, § 2.4) : au-delà de 2 000 dalles, le Schéma (vue physique et vue pixels) se dessine simplifié : une bande par segment de port au lieu d\'une forme par dalle, sans nom ni coordonnées de dalle, moins de 5 000 éléments ; mêmes ports, mêmes départs, mêmes couleurs et mêmes processeurs que le dessin complet, chaque dalle couverte par une bande de sa couleur ; à 2 000 dalles, dessin complet',
    etape: '11-0',
    async verifier(v, contexte) {
      v.egal('seuil : 2 000 dalles', dessinSchema.SEUIL_DESSIN_SIMPLIFIE, 2000);
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      const preparer = (colonnes, lignes, nomVue) => {
        const m = calculs.mur(bp2, colonnes, lignes);
        const e = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 12 });
        const data = calculs.cablageData(m, bp2, e, { depart: 'haut-gauche' });
        const vd = data.variantes.find((x) => x.mode === data.conseil);
        const vue = { vue: nomVue, canvasVue: 'mur', cablage: 'data' };
        const pm = calculs.pixelMap(m, bp2, e);
        const geo = geometrieSchema(vue, m, bp2, pm);
        return { geo, trajets: trajetsSchema(vue, vd, null, null), blocs: dessinSchema.blocsSchema(geo, pm, { cablage: 'data' }), coin: 'haut-gauche', palette: PALETTE_ECRAN };
      };
      const departs = (svg) => [...svg.querySelectorAll('[data-trajet]')].map((g) => {
        const c = g.querySelector('.depart');
        return `${g.dataset.trajet} ${Number(c.getAttribute('cx')).toFixed(3)} ${Number(c.getAttribute('cy')).toFixed(3)} ${c.style.fill} ${g.querySelector('.numero-trajet').textContent}`;
      });
      for (const nomVue of ['physique', 'pixels']) {
        const p = preparer(69, 29, nomVue);
        const simple = construireSvg(p).svg;
        const complet = construireSvg({ ...p, simplifie: false }).svg;
        v.vrai(`${nomVue}, 69 × 29 = 2 001 dalles : dessin simplifié`, simple.classList.contains('simplifie') && !complet.classList.contains('simplifie'));
        v.egal(`${nomVue} : aucune forme ni aucun nom de dalle`, simple.querySelectorAll('[data-dalle], .etiquette-dalle').length, 0);
        const n = simple.getElementsByTagName('*').length;
        v.vrai(`${nomVue} : moins de 5 000 éléments (${n} ; dessin complet ${complet.getElementsByTagName('*').length})`, n < 5000);
        v.egal(`${nomVue} : mêmes ports, mêmes départs, mêmes numéros et couleurs`, departs(simple), departs(complet));
        v.egal(`${nomVue} : mêmes processeurs`, [...simple.querySelectorAll('.etiquette-bloc')].map(texteDe), [...complet.querySelectorAll('.etiquette-bloc')].map(texteDe));
        const bandes = [...simple.querySelectorAll('.bande')].map((b) => ({ x: Number(b.getAttribute('x')), y: Number(b.getAttribute('y')), w: Number(b.getAttribute('width')), h: Number(b.getAttribute('height')), fill: b.style.fill }));
        const surface = (liste) => liste.reduce((t, r) => t + r.w * r.h, 0);
        const rects = [...p.geo.rects.values()];
        v.vrai(`${nomVue} : les bandes couvrent exactement les dalles (${bandes.length} bandes)`, bandes.length > 0 && Math.abs(surface(bandes) - surface(rects)) < 1e-6 * surface(rects));
        const fondDe = (id) => complet.querySelector(`[data-dalle="${id}"] rect`).style.fill;
        const fautes = [...p.geo.rects].filter(([id, r]) => {
          const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
          const b = bandes.find((x) => cx > x.x && cx < x.x + x.w && cy > x.y && cy < x.y + x.h);
          return !b || b.fill !== fondDe(id);
        }).map(([id]) => id);
        v.egal(`${nomVue} : chaque dalle dans une bande de sa couleur`, fautes.slice(0, 5), []);
      }
      const p = preparer(50, 40, 'physique');
      const dessin = construireSvg(p).svg;
      v.vrai('50 × 40 = 2 000 dalles : dessin complet, 2 000 dalles dessinées', !dessin.classList.contains('simplifie') && dessin.querySelectorAll('[data-dalle]').length === 2000);
    },
  },
  {
    id: 'N71',
    titre: 'Grand mur (11-0, § 2.4) : au-delà de 2 000 dalles, le guide pas à pas ne dessine que les dalles du port en cours (numérotées dans l\'ordre du câble, son seul trajet), dans le cadre du mur entier ; à 2 000 dalles, tout le mur comme aujourd\'hui',
    etape: '11-0',
    async verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const s8 = processeurDeBase(contexte, 'brompton-s8');
      for (const [colonnes, lignes, simplifie] of [[69, 29, true], [50, 40, false]]) {
        const nom = `${colonnes} × ${lignes}`;
        const m = calculs.mur(bp2, colonnes, lignes);
        const e = calculs.evaluerProcesseur(m, bp2, s8, { frequenceHz: 60, bits: 12 });
        const data = calculs.cablageData(m, bp2, e, { depart: 'haut-gauche' });
        const vd = data.variantes.find((x) => x.mode === data.conseil);
        const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
        const geo = geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, e));
        const trajets = trajetsSchema(vue, vd, null, null);
        const t = trajets[1];
        const g = dessinSchema.geometrieGuide?.(geo, t.dalles);
        if (!g) {
          v.vrai('geometrieGuide exportée', false);
          return;
        }
        v.egal(`${nom} : ${simplifie ? 'dalles du port seulement' : 'tout le mur'}`, g.rects.size, simplifie ? t.dalles.length : colonnes * lignes);
        v.egal(`${nom} : cadre du mur entier`, [g.largeur, g.hauteur], [geo.largeur, geo.hauteur]);
        const { svg } = construireSvg({ geo: g, trajets, coin: 'haut-gauche', blocs: [], palette: PALETTE_ECRAN, selection: t.cle, ordre: t.cle });
        v.egal(`${nom} : dalles du port numérotées de 1 à ${t.dalles.length}`, [...svg.querySelectorAll('.ordre-dalle text')].map((x) => x.textContent), t.dalles.map((_, i) => `${i + 1}`));
        if (simplifie) {
          v.egal(`${nom} : le seul trajet du port en cours`, [...svg.querySelectorAll('[data-trajet]')].map((x) => x.dataset.trajet), [t.cle]);
          v.vrai(`${nom} : dessin sous 2 000 éléments (${svg.getElementsByTagName('*').length})`, svg.getElementsByTagName('*').length < 2000);
        }
      }
    },
  },
  {
    id: 'N73',
    titre: 'Boutons (11a, § 5) : cinq styles dans chaque famille (presta comprise), en thème sombre et en mode rouge : principal (fond de la famille, texte foncé), secondaire (fond et bordure teintés, liseré clair en haut, icône de la couleur de la famille), discret (sans fond ni cadre, texte de la famille), danger (sans fond, bordure et texte rouges, icône poubelle ; bordure de 2 px en mode rouge), icône seule (48 × 48) ; texte à 4,5:1 sur son fond réel ; cibles de 48 px, 60 en grand affichage ; cartes avec un liseré clair en haut',
    etape: '11a',
    async verifier(v) {
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const html = document.documentElement;
      const avant = { mode: html.dataset.mode, taille: html.dataset.taille };
      const cs = (e, pseudo = null) => getComputedStyle(e, pseudo);
      const lum = (c) => luminance(rgbVersHex(c));
      try {
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          delete html.dataset.taille;
          const fautes = [];
          for (const famille of ['image', 'donnees', 'electricite', 'accroche', 'depannage', 'base', 'apprendre', 'regie', 'presta']) {
            const carte = el('section', { class: 'carte', 'data-famille': famille },
              el('button', { class: 'bouton bouton-principal', type: 'button' }, 'Enregistrer'),
              el('button', { class: 'bouton', type: 'button', 'data-icone': 'copier' }, 'Copier les résultats'),
              el('button', { class: 'bouton bouton-discret', type: 'button' }, 'Annuler'),
              el('button', { class: 'bouton bouton-danger', type: 'button' }, 'Supprimer'),
              el('button', { class: 'bouton bouton-icone', type: 'button', 'aria-label': 'Actions de Mur 1' }, '⋯'));
            racine.replaceChildren(carte);
            const [p, s, d, x, i] = carte.querySelectorAll('button');
            const couleur = rgbVersHex(cs(el('span')).color);
            const sonde = el('span', { style: 'color: var(--famille)' });
            carte.append(sonde);
            const fam = rgbVersHex(cs(sonde).color);
            sonde.style.color = 'var(--famille-fond)';
            const famFond = rgbVersHex(cs(sonde).color);
            sonde.style.color = 'var(--famille-bord)';
            const famBord = rgbVersHex(cs(sonde).color);
            sonde.style.color = 'var(--echec)';
            const echec = rgbVersHex(cs(sonde).color);
            sonde.remove();
            void couleur;
            const k = (e) => contraste(rgbVersHex(cs(e).color), fondDe(e));
            const faute = (cond, texte) => { if (!cond) fautes.push(`${famille} : ${texte}`); };
            // Étape 11d : dans la Base, le principal est clair (fond du texte), le gris de la famille ayant l'air désactivé.
            const fondPrincipal = famille === 'base' ? rgbVersHex(cs(carte).color) : fam;
            faute(rgbVersHex(cs(p).backgroundColor) === fondPrincipal && k(p) >= 4.5, `principal (fond ${rgbVersHex(cs(p).backgroundColor)}, ${k(p).toFixed(2)}:1)`);
            faute(rgbVersHex(cs(s).backgroundColor) === famFond && rgbVersHex(cs(s).borderLeftColor) === famBord && k(s) >= 4.5, `secondaire (fond ${rgbVersHex(cs(s).backgroundColor)}, bord ${rgbVersHex(cs(s).borderLeftColor)}, ${k(s).toFixed(2)}:1)`);
            faute(lum(cs(s).borderTopColor) > lum(cs(s).borderLeftColor), 'secondaire : liseré clair en haut');
            faute(cs(s, '::before').content !== 'none' && rgbVersHex(cs(s, '::before').backgroundColor) === fam && /url/.test(cs(s, '::before').webkitMaskImage ?? cs(s, '::before').maskImage ?? ''), 'secondaire : icône de la couleur de la famille');
            faute(/rgba\(.*,\s*0\)|transparent/.test(cs(d).backgroundColor) && /rgba\(.*,\s*0\)|transparent/.test(cs(d).borderLeftColor) && rgbVersHex(cs(d).color) === fam && k(d) >= 4.5, `discret (${cs(d).backgroundColor}, ${cs(d).borderLeftColor}, ${k(d).toFixed(2)}:1)`);
            faute(/rgba\(.*,\s*0\)|transparent/.test(cs(x).backgroundColor) && rgbVersHex(cs(x).borderLeftColor) === echec && rgbVersHex(cs(x).color) === echec && k(x) >= 4.5, `danger (${cs(x).backgroundColor}, ${rgbVersHex(cs(x).borderLeftColor)}, ${k(x).toFixed(2)}:1)`);
            faute(/url/.test(cs(x, '::before').webkitMaskImage ?? cs(x, '::before').maskImage ?? ''), 'danger : icône poubelle');
            faute(parseFloat(cs(x).borderLeftWidth) === (mode === 'rouge' ? 2 : 1), `danger : bordure de ${cs(x).borderLeftWidth}`);
            const r = i.getBoundingClientRect();
            faute(Math.round(r.width) === 48 && Math.round(r.height) === 48, `icône seule ${Math.round(r.width)} × ${Math.round(r.height)}`);
            faute([p, s, d, x].every((b) => b.getBoundingClientRect().height >= 47.5), 'cibles de 48 px');
            faute(lum(cs(carte).borderTopColor) > lum(cs(carte).borderLeftColor), 'carte : liseré clair en haut');
          }
          v.egal(`${mode} : styles, contrastes, cibles`, fautes.slice(0, 10), []);
          html.dataset.taille = 'grand';
          const carte = el('section', { class: 'carte', 'data-famille': 'image' },
            ['bouton bouton-principal', 'bouton', 'bouton bouton-discret', 'bouton bouton-danger'].map((c) => el('button', { class: c, type: 'button' }, 'Action')),
            el('button', { class: 'bouton bouton-icone', type: 'button', 'aria-label': 'Actions' }, '⋯'));
          racine.replaceChildren(carte);
          v.egal(`${mode}, grand affichage : cibles de 60 px`, [...carte.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((r) => Math.min(r.width, r.height) < 59.5).length, 0);
        }
      } finally {
        if (avant.mode) html.dataset.mode = avant.mode;
        else delete html.dataset.mode;
        if (avant.taille) html.dataset.taille = avant.taille;
        else delete html.dataset.taille;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N74',
    titre: 'Écran Prestas refait (11b, § 6) : carte de chaque mur (un seul bouton qui l\'ouvre, flèche ›), le mur ouvert sans bouton ni flèche, avec la puce « Ouvert » ; un seul menu « ⋯ » ouvert à la fois, refermé par « ⋯ » ou Échap (Échap ne ferme pas l\'écran) ; « Renommer » à la place du menu ; « Supprimer » en danger, à 16 px des autres ; dates et lieu en puces (texte lu inchangé) ; pastille d\'export orange puis verte ; autres prestas en cartes ; cibles de 48 px, rien ne dépasse à 375 px, menus ouverts et noms longs compris',
    etape: '11b',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      let n = 0;
      const o = (iso) => ({ maintenant: new Date(iso), alea: () => `m${(n += 1)}` });
      let etat = pr.migrer({}, o('2026-10-16T08:00:00Z'));
      etat = pr.creerPresta(etat, { nom: 'Presta B' }, o('2026-10-16T09:00:00Z'));
      const long = 'Presta'.padEnd(60, 'x');
      etat = pr.creerPresta(etat, { nom: long }, o('2026-10-16T10:00:00Z'));
      const a = etat.index.ouverte.presta;
      etat = pr.modifierPresta(etat, a, { nom: long, debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B', notes: '' }, o('2026-10-16T10:00:00Z'));
      etat = pr.ajouterMur(etat, a, { nom: 'Mur'.padEnd(40, 'y') }, o('2026-10-16T10:30:00Z'));
      etat = pr.ouvrir(etat, a, etat.index.prestas.find((p) => p.id === a).murs[0].id);
      const actions = Object.fromEntries(['ouvrir', 'creerPresta', 'ajouterMur', 'dupliquerMur', 'supprimerMur', 'dupliquerPresta', 'archiverPresta', 'supprimerPresta', 'modifierPresta', 'renommerMur', 'exporter']
        .map((nom) => [nom, async () => {}]));
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px', 'data-famille': 'presta' });
      document.body.append(racine);
      let echapApp = 0;
      const ecouteApp = (e) => { if (e.key === 'Escape') echapApp += 1; };
      document.addEventListener('keydown', ecouteApp);
      const visibles = () => [...racine.querySelectorAll('button, summary')].filter((x) => x.getBoundingClientRect().width > 0);
      const ouverts = () => [...racine.querySelectorAll('.pr-menu')].filter((m) => !m.hidden).length;
      try {
        const ecran = ep.monterPrestas(racine, { actions, resumeMur: () => 'Réglages par défaut', confirmer: () => true });
        ecran.afficher(etat, { persistant: true });
        const murs = [...racine.querySelectorAll('.pr-mur')];
        v.egal('mur ouvert : ni bouton de carte ni flèche, puce « Ouvert » ; autre mur : carte-bouton avec flèche', murs.map((m) => [
          Boolean(m.querySelector('.pr-mur-ouvrir')), Boolean(m.querySelector('.pr-fleche')), texteDe(m.querySelector('.pr-puce-ouvert'))]),
        [[false, false, 'Ouvert'], [true, true, '']]);
        v.egal('la carte-bouton contient le nom et le résumé', [texteDe(murs[1].querySelector('.pr-mur-ouvrir .pr-mur-nom')), texteDe(murs[1].querySelector('.pr-mur-ouvrir .pr-mur-resume'))],
          ['Mur'.padEnd(40, 'y'), 'Réglages par défaut']);
        v.egal('menus fermés au départ', ouverts(), 0);
        const menuMur = murs[1].querySelector('.pr-menu-bouton');
        const plus = [...racine.querySelectorAll('.pr-actions-presta button')].find((x) => texteDe(x) === 'Plus');
        menuMur.click();
        v.egal('« ⋯ » d\'un mur : son menu ouvert sous la carte', [ouverts(), menuMur.getAttribute('aria-expanded'), document.getElementById(menuMur.getAttribute('aria-controls'))?.closest('.pr-mur') === murs[1]], [1, 'true', true]);
        plus.click();
        v.egal('« Plus » : un seul menu ouvert à la fois', [ouverts(), menuMur.getAttribute('aria-expanded'), plus.getAttribute('aria-expanded')], [1, 'false', 'true']);
        const droite = racine.getBoundingClientRect().right;
        const depasse = () => [...racine.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > droite + 0.5).map((x) => x.className || x.tagName);
        v.egal('menu de la presta ouvert : rien ne dépasse à 375 px', depasse(), []);
        v.egal('menu de la presta ouvert : cibles de 48 px', visibles().filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe), []);
        const ecart = (menu) => {
          const d = menu.querySelector('.bouton-danger');
          if (!d) return -1;
          const r = d.getBoundingClientRect();
          return Math.min(...[...menu.querySelectorAll('button')].filter((x) => x !== d).map((x) => {
            const b = x.getBoundingClientRect();
            return Math.max(b.left - r.right, r.left - b.right, b.top - r.bottom, r.top - b.bottom);
          }));
        };
        const menuPresta = document.getElementById(plus.getAttribute('aria-controls'));
        v.vrai(`« Supprimer la presta » en danger, à 16 px au moins des autres (${ecart(menuPresta)})`, ecart(menuPresta) >= 15.5);
        plus.click();
        v.egal('« Plus » de nouveau : menu refermé', ouverts(), 0);
        menuMur.click();
        v.vrai(`« Supprimer » d\'un mur en danger, à 16 px au moins des autres (${ecart(document.getElementById(menuMur.getAttribute('aria-controls')))})`,
          ecart(document.getElementById(menuMur.getAttribute('aria-controls'))) >= 15.5);
        v.egal('menu d\'un mur ouvert : rien ne dépasse, cibles de 48 px', [depasse(), visibles().filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe)], [[], []]);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        v.egal('Échap : menu refermé, l\'écran ne reçoit pas Échap', [ouverts(), echapApp], [0, 0]);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        v.egal('Échap sans menu ouvert : l\'appli le reçoit (fermeture de l\'écran)', echapApp, 1);
        menuMur.click();
        [...document.getElementById(menuMur.getAttribute('aria-controls')).querySelectorAll('button')].find((x) => texteDe(x) === 'Renommer').click();
        v.egal('« Renommer » : champ dans la carte du mur, menu refermé', [racine.querySelector('.pr-renommer')?.closest('.pr-mur') === murs[1], ouverts()], [true, 0]);
        const infos = racine.querySelector('.pr-ouverte .pr-infos');
        v.egal('dates et lieu en puces, texte lu inchangé', [[...infos.querySelectorAll('.pr-puce')].map(texteDe), texteDe(infos)], [['du 17 au 19/10/2026', 'Lieu B'], 'du 17 au 19/10/2026 · Lieu B']);
        const pastille = () => {
          const e = racine.querySelector('.pr-ouverte .pr-export');
          return [texteDe(e), rgbVersHex(getComputedStyle(e, '::before').backgroundColor)];
        };
        const sonde = el('span', { style: 'color: var(--alerte)' });
        racine.append(sonde);
        const orange = rgbVersHex(getComputedStyle(sonde).color);
        sonde.style.color = 'var(--ok)';
        const vert = rgbVersHex(getComputedStyle(sonde).color);
        sonde.remove();
        v.egal('jamais exportée : pastille orange', pastille(), ['Jamais exportée', orange]);
        ecran.afficher({ ...etat, index: { ...etat.index, prestas: etat.index.prestas.map((p) => (p.id === a ? { ...p, exporteeLe: '2026-10-12T08:00:00.000Z' } : p)) } }, { persistant: true });
        v.egal('exportée : pastille verte', pastille(), ['Exportée le 12/10/2026', vert]);
        const autre = racine.querySelector('.pr-autres .pr-presta');
        v.egal('autres prestas : une carte-bouton (nom, infos, flèche)', [autre?.querySelectorAll('button').length, Boolean(autre?.querySelector('button .pr-nom')), Boolean(autre?.querySelector('button .pr-fleche'))], [1, true, true]);
      } finally {
        document.removeEventListener('keydown', ecouteApp);
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N75',
    titre: 'Aperçu du mur (11c, § 8) : rangée de demi-dalles à demi-hauteur, d\'un ton plus clair, en bas ou en haut ; zones à leur place, écart entre zones laissé vide ; dalles absentes d\'une forme libre en vide ; mur mixte d\'un troisième ton ; dalles tournées dessinées tournées ; cotes en mètres et en pixels ; étiquette pour les lecteurs d\'écran ; moins de 1 000 éléments à 5 000 dalles ; ton clair à 3:1 sur la carte, ton foncé à 1,5:1 du clair et de la carte, en sombre et en rouge',
    etape: '11c',
    async verifier(v, contexte) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look?.apercuMur) {
        v.vrai('apercuMur exportée par look.js', false);
        return;
      }
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', class: 'carte', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      const html = document.documentElement;
      const mode = html.dataset.mode;
      const nb = (a, sel) => a?.querySelectorAll(sel).length ?? -1;
      try {
        const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
        for (const position of ['bas', 'haut']) {
          const m = calculs.dimensionner(CB5, { mode: 'dalles', colonnes: 4, lignes: 2, rangeeDemi: true }, { demi: CB5_DEMI, positionDemi: position }).mur;
          const a = look.apercuMur(m, CB5);
          const demi = [...(a?.querySelectorAll('.ap-demi') ?? [])];
          const entiere = a?.querySelector('.ap-dalle:not(.ap-demi)');
          v.egal(`demi-dalles en ${position} : 4, demi-hauteur, ${position === 'bas' ? 'sous' : 'au-dessus de'} la dernière rangée`, [demi.length, Number(demi[0]?.getAttribute('height')) * 2 === Number(entiere?.getAttribute('height')),
            position === 'bas' ? Number(demi[0]?.getAttribute('y')) === 2400 : Number(demi[0]?.getAttribute('y')) === 0], [4, true, true]);
          if (position === 'bas') {
            cadre.replaceChildren(a);
            v.vrai('ton des demi-dalles plus clair que le ton foncé du damier', luminance(rgbVersHex(getComputedStyle(demi[0]).fill)) > luminance(rgbVersHex(getComputedStyle(a.querySelector('.ap-b')).fill)));
            v.egal('étiquette', a.getAttribute('aria-label'), 'Aperçu du mur : 4 × 2 dalles et une rangée de demi-dalles en bas, 2,40 × 3,00 m, 416 × 520 px');
            v.egal('cotes : largeur dessous, hauteur à droite', [texteDe(a.querySelector('.apercu-largeur')), texteDe(a.querySelector('.apercu-hauteur'))], ['2,40 m · 416 px', '3,00 m 520 px']);
          }
        }
        const zones = calculs.murZones(bp2, [{ nom: 'A', colonnes: 2, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 2, ecartMm: 1000 }], { ecarts: 'reel' });
        const az = look.apercuMur(zones, bp2);
        const xs = [...(az?.querySelectorAll('.ap-dalle') ?? [])].map((r) => [Number(r.getAttribute('x')), Number(r.getAttribute('x')) + Number(r.getAttribute('width'))]);
        v.egal('zones : 8 dalles, écart de 1 m vide (rien entre 1 000 et 2 000 mm)', [xs.length, xs.some(([x0, x1]) => x1 > 1000.5 && x0 < 1999.5)], [8, false]);
        const forme = calculs.murZones(bp2, [{ nom: 'A', colonnes: 3, rangees: 2, absentes: [[2, 1]] }], { ecarts: 'reel' });
        v.egal('forme libre : la dalle absente laissée vide', nb(look.apercuMur(forme, bp2), '.ap-dalle'), 5);
        const mixte = calculs.murZones(bp2, [{ nom: 'A', colonnes: 2, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 2, dalle: DALLE_CAS_13 }], { ecarts: 'reel' });
        v.egal('mur mixte : les dalles de l\'autre fiche d\'un troisième ton', nb(look.apercuMur(mixte, bp2), '.ap-autre'), 4);
        const biais = calculs.murZones(bp2, [{ nom: 'BIAIS', colonnes: 4, rangees: 2, roulisDeg: 45 }], { ecarts: 'reel' });
        v.vrai('dalles tournées dessinées tournées', [...(look.apercuMur(biais, bp2)?.querySelectorAll('.ap-dalle') ?? [])].every((r) => /rotate\(/.test(r.getAttribute('transform') ?? '')));
        const limite = look.apercuMur(calculs.mur(bp2, 100, 50), bp2);
        v.vrai(`5 000 dalles : moins de 1 000 éléments (${limite?.getElementsByTagName('*').length})`, limite && limite.getElementsByTagName('*').length < 1000);
        const a = look.apercuMur(calculs.mur(bp2, 12, 6), bp2);
        cadre.replaceChildren(a);
        for (const m of ['sombre', 'rouge']) {
          if (m === 'rouge') html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          const fondCarte = rgbVersHex(getComputedStyle(cadre).backgroundColor);
          const clair = rgbVersHex(getComputedStyle(a.querySelector('.ap-a')).fill);
          const fonce = rgbVersHex(getComputedStyle(a.querySelector('.ap-b')).fill);
          v.vrai(`${m} : ton clair à 3:1 sur la carte (${contraste(clair, fondCarte).toFixed(2)}), ton foncé à 1,5:1 du clair (${contraste(clair, fonce).toFixed(2)}) et de la carte (${contraste(fonce, fondCarte).toFixed(2)})`,
            contraste(clair, fondCarte) >= 3 && contraste(clair, fonce) >= 1.5 && contraste(fonce, fondCarte) >= 1.5);
        }
      } finally {
        if (mode) html.dataset.mode = mode;
        else delete html.dataset.mode;
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N76',
    titre: 'Aperçu du mur, lignes de cote (11d, § 13.2) : sous le dessin, une ligne de sa largeur avec une butée à chaque bout et « 6,00 m · 2112 px » centré ; à droite, une ligne verticale de sa hauteur, butées, « 3,00 m » et « 1056 px » ; cotes en 12 px, 14 px en grand affichage ; zones collées : le contour de chaque zone se voit aussi sous 1 000 dalles',
    etape: '11d',
    async verifier(v, contexte) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look?.apercuMur) return;
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', class: 'carte', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      const html = document.documentElement;
      const taille = html.dataset.taille;
      try {
        const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
        for (const t of ['normal', 'grand']) {
          if (t === 'grand') html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const a = look.apercuMur(calculs.mur(bp2, 12, 6), bp2);
          cadre.replaceChildren(a);
          const dessin = a.querySelector('svg').getBoundingClientRect();
          const h = a.querySelector('.cote-h');
          const vv = a.querySelector('.cote-v');
          const rh = h?.getBoundingClientRect();
          const rv = vv?.getBoundingClientRect();
          const th = h?.querySelector('.cote-texte')?.getBoundingClientRect();
          v.egal(`${t} : cotes écrites`, [texteDe(h), texteDe(vv)], ['6,00 m · 2112 px', '3,00 m 1056 px']);
          v.vrai(`${t} : ligne de cote horizontale de la largeur du dessin, sous lui, texte centré`, rh && Math.abs(rh.width - dessin.width) <= 1.5 && rh.top >= dessin.bottom - 0.5
            && th && Math.abs((th.left + th.right) / 2 - (rh.left + rh.right) / 2) <= 2);
          v.vrai(`${t} : ligne de cote verticale de la hauteur du dessin, à sa droite`, rv && Math.abs(rv.height - dessin.height) <= 1.5 && rv.left >= dessin.right - 0.5);
          v.vrai(`${t} : butées aux deux bouts des deux cotes`, [h, vv].every((x) => x && getComputedStyle(x, '::before').content !== 'none' && getComputedStyle(x, '::after').content !== 'none'));
          v.egal(`${t} : cotes en ${t === 'grand' ? 14 : 12} px`, parseFloat(getComputedStyle(h.querySelector('.cote-texte')).fontSize), t === 'grand' ? 14 : 12);
        }
        delete html.dataset.taille;
        const collees = calculs.murZones(bp2, [{ nom: 'A', colonnes: 3, rangees: 2 }, { nom: 'B', colonnes: 3, rangees: 2 }], { ecarts: 'reel' });
        v.egal('zones collées : un contour par zone', look.apercuMur(collees, bp2)?.querySelectorAll('.ap-zone').length, 2);
        v.egal('mur d\'une seule zone : pas de contour de zone', look.apercuMur(calculs.mur(bp2, 4, 2), bp2)?.querySelectorAll('.ap-zone').length, 0);
      } finally {
        if (taille) html.dataset.taille = taille;
        else delete html.dataset.taille;
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N77',
    titre: 'Écran Prestas, mini-aperçu (11d, § 13.2) : proportions d\'un mur lues dans ses saisies sans calcul (Dalles : colonnes × lignes et taille de la dalle ; Taille : la cible ; Résolution : la cible en pixels ; réglages par défaut : 6 × 3 m ; Zones : inconnues) ; vignette de 44 × 28 px au plus à gauche du nom, aux proportions, cachée aux lecteurs d\'écran ; aucune si les proportions sont inconnues ; résumé écrit inchangé',
    etape: '11d',
    async verifier(v) {
      const pr = await moduleAppli(v, '../src/prestas.js');
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      if (!pr || !ep) return;
      if (!pr.proportionsMur) {
        v.vrai('proportionsMur exportée par prestas.js', false);
        return;
      }
      const fiche = (id) => ({ 'roe-bp2-v2': { largeurMm: 500, hauteurMm: 500 }, haute: { largeurMm: 500, hauteurMm: 1000 } })[id] ?? null;
      const mur = (f) => ({ configuration: f ? { formulaires: { 'form-mur': f } } : null });
      const p = (m) => pr.proportionsMur(m, { ficheDalle: fiche });
      v.egal('Dalles 12 × 6 de 500 × 500 ; 3 × 2 de 500 × 1000 ; Taille 6 × 3 m ; Résolution 1920 × 1080 ; défaut ; Zones', [
        p(mur({ mode: 'dalles', dalle: 'roe-bp2-v2', colonnes: '12', lignes: '6' })),
        p(mur({ mode: 'dalles', dalle: 'haute', colonnes: '3', lignes: '2' })),
        p(mur({ mode: 'taille', dalle: 'roe-bp2-v2', largeurM: '6', hauteurM: '3' })),
        p(mur({ mode: 'resolution', dalle: 'roe-bp2-v2', largeurPx: '1920', hauteurPx: '1080' })),
        p(mur(null)),
        p(mur({ mode: 'zones', dalle: 'roe-bp2-v2', zones: '{"zones":[]}' })),
      ], [{ largeur: 6000, hauteur: 3000 }, { largeur: 1500, hauteur: 2000 }, { largeur: 6, hauteur: 3 }, { largeur: 1920, hauteur: 1080 }, { largeur: 6, hauteur: 3 }, null]);
      v.egal('saisie illisible : inconnue', p(mur({ mode: 'dalles', dalle: 'inconnue', colonnes: '12', lignes: '6' })), null);
      let n = 0;
      const o = () => ({ maintenant: new Date('2026-10-16T12:00:00Z'), alea: () => `v${(n += 1)}` });
      let etat = pr.migrer({}, o());
      const a = etat.index.ouverte.presta;
      etat = pr.ajouterMur(etat, a, {}, o());
      const [m1, m2] = etat.index.prestas.find((x) => x.id === a).murs.map((x) => x.id);
      etat = pr.enregistrerMur(etat, m1, { configuration: { formulaires: { 'form-mur': { mode: 'dalles', dalle: 'roe-bp2-v2', colonnes: '12', lignes: '6' } } } });
      etat = pr.enregistrerMur(etat, m2, { configuration: { formulaires: { 'form-mur': { mode: 'zones', dalle: 'roe-bp2-v2', zones: '{"zones":[]}' } } } });
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px', 'data-famille': 'presta' });
      document.body.append(racine);
      try {
        const ecran = ep.monterPrestas(racine, { actions: {}, resumeMur: () => 'résumé', proportionsMur: (m) => pr.proportionsMur(m, { ficheDalle: fiche }) });
        ecran.afficher(etat, { persistant: true });
        const murs = [...racine.querySelectorAll('.pr-mur')];
        const vignette = murs[0].querySelector('.pr-vignette');
        const r = vignette?.getBoundingClientRect();
        const nom = murs[0].querySelector('.pr-mur-nom').getBoundingClientRect();
        v.vrai(`vignette du mur en Dalles : 44 × 28 px au plus, proportions 2:1 (${r ? `${r.width.toFixed(1)} × ${r.height.toFixed(1)}` : 'aucune'}), à gauche du nom, cachée aux lecteurs d'écran`,
          r && r.width <= 44.5 && r.height <= 28.5 && Math.abs(r.width / r.height - 2) < 0.05 && r.right <= nom.left + 0.5 && vignette.getAttribute('aria-hidden') === 'true');
        v.egal('mur en zones : pas de vignette', murs[1].querySelector('.pr-vignette'), null);
        v.egal('résumé écrit inchangé', texteDe(murs[0].querySelector('.pr-mur-resume')), 'résumé');
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N78',
    titre: 'Une couleur par rubrique (11e, § 14) : en thème sombre, les neuf onglets et l\'écran Prestas ont dix couleurs différentes ; Mur bleu ciel, Data indigo, Canvas turquoise, Schéma vert anis ; guide de montage dans la famille du Schéma, mire dans celle du Mur ; aperçu du mur à joint de 1 px et coins à 12 %',
    etape: '11e',
    async verifier(v, contexte) {
      const look = await moduleAppli(v, '../src/look.js');
      if (!look) return;
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const { sombre } = await jetonsStyles();
      const couleurs = [...page.querySelectorAll('.onglet')].map((o) => [o.getAttribute('href').slice(1), sombre[`--famille-${o.dataset.famille}`]]);
      couleurs.push(['prestas', sombre[`--famille-${page.getElementById('prestas')?.dataset.famille}`]]);
      v.egal('dix couleurs différentes', new Set(couleurs.map(([, c]) => c?.toLowerCase())).size, 10);
      v.egal('Mur, Data, Canvas, Schéma', Object.fromEntries(couleurs.filter(([o]) => ['mur', 'data', 'canvas', 'schema'].includes(o)).map(([o, c]) => [o, c?.toLowerCase()])),
        { mur: '#38bdf8', data: '#818cf8', canvas: '#2dd4bf', schema: '#a3e635' });
      v.egal('guide de montage dans la famille du Schéma, mire dans celle du Mur, panneaux dans celle de leur onglet', [page.getElementById('montage')?.dataset.famille, page.getElementById('mire-fiche')?.dataset.famille,
        page.getElementById('canvas')?.dataset.famille, page.getElementById('schema')?.dataset.famille], ['schema', 'image', 'regie', 'schema']);
      v.egal('familles des onglets dans look.js', [look.FAMILLES_ONGLETS.canvas, look.FAMILLES_ONGLETS.schema], ['regie', 'schema']);
      const retirer = await chargerStylesLook();
      const cadre = el('div', { 'data-famille': 'image', class: 'carte', style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(cadre);
      try {
        const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
        const a = look.apercuMur(calculs.mur(bp2, 12, 6), bp2);
        cadre.append(a);
        const r = a.querySelector('.ap-dalle');
        v.egal('aperçu : joint de 1 px, coins à 12 % du côté', [parseFloat(getComputedStyle(r).strokeWidth), Number(r.getAttribute('rx')) / Math.min(Number(r.getAttribute('width')), Number(r.getAttribute('height')))], [1, 0.12]);
      } finally {
        cadre.remove();
        retirer();
      }
    },
  },
  {
    id: 'N79',
    titre: 'Distribution dans Élec (12b) : section « Distribution » après les lignes et les phases (#resultats-elec), avant le courant d\'appel et les rappels (#resultats-elec-suite) ; son formulaire gardé avec le mur (form-distribution) : distance armoire–mur, choix « Conseil » ou « Avec mon matériel », champs du matériel (prises 16 A, sorties P17 32 A tri, boîtiers, prises par boîtier : non précisé, 6 ou 3) cachés en conseil ; un seul champ de distance armoire dans l\'appli, plus dans le Schéma',
    etape: '12b',
    async verifier(v) {
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const q = (x) => page.querySelector(x);
      const section = q('#elec #distribution-elec');
      const form = q('#distribution-elec form#form-distribution');
      v.vrai('section « Distribution » dans Élec, avec son titre et son formulaire', Boolean(section && form) && /^Distribution$/.test(section.querySelector('h3')?.textContent.trim() ?? ''));
      const avant = (a, b) => Boolean(a && b) && Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      v.vrai('ordre : lignes et phases, Distribution, puis courant d\'appel et rappels', avant(q('#resultats-elec'), section) && avant(section, q('#resultats-elec-suite')));
      v.vrai('résultats de la distribution sous son formulaire', Boolean(q('#distribution-elec #resultats-distribution')) && avant(form, q('#resultats-distribution')));
      v.egal('un seul champ de distance armoire dans l\'appli, dans la Distribution', [page.querySelectorAll('[name=distanceArmoireM]').length, form?.querySelector('[name=distanceArmoireM]')?.id, q('#form-schema [name=distanceArmoireM]')], [1, 'distance-armoire', null]);
      v.egal('choix « Conseil » (coché) ou « Avec mon matériel »', [...(form?.querySelectorAll('input[name=choixDistribution]') ?? [])].map((r) => `${r.value}${r.hasAttribute('checked') ? '*' : ''}`), ['conseil*', 'materiel']);
      const bloc = q('#bloc-materiel');
      v.vrai('champs du matériel cachés en conseil', Boolean(bloc) && bloc.hasAttribute('hidden') && form?.contains(bloc));
      v.egal('champs du matériel', ['prises16', 'sortiesP17', 'boitiers', 'prisesParBoitier'].map((nom) => {
        const champ = bloc?.querySelector(`[name=${nom}]`);
        return champ ? `${nom}:${champ.tagName.toLowerCase()}:${page.querySelector(`label[for="${champ.id}"]`) ? 'libellé' : 'sans libellé'}` : `${nom}:absent`;
      }), ['prises16:input:libellé', 'sortiesP17:input:libellé', 'boitiers:input:libellé', 'prisesParBoitier:select:libellé']);
      v.egal('prises par boîtier : non précisé, 6 ou 3', [...(bloc?.querySelector('[name=prisesParBoitier]')?.options ?? [])].map((o) => o.value), ['', '6', '3']);
      v.vrai('Schéma : la distance armoire renvoie à Élec', /Élec/.test(q('#form-schema #rappel-distance-armoire')?.textContent ?? '') && Boolean(q('#form-schema #rappel-distance-armoire a[href="#elec"]')));
    },
  },
  {
    id: 'N80',
    titre: 'Distribution dans le Schéma (12c) : chaque boîtier dessiné en petit cadre « B1 » hors du mur, sur le bord de départ, au droit de ses lignes, plus loin du mur que leurs départs et sans les toucher ; chacune de ses lignes part de lui (trait vers son départ) ; câble P17 en tirets de l\'armoire aux boîtiers ; texte aux couleurs du repère ; sans boîtier, rien de plus',
    etape: '12c',
    async verifier(v, contexte) {
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const m = calculs.mur(bp2, 24, 6);
      const elec = calculs.electricite(m, bp2, { depart: 'bas-gauche' });
      const t = calculs.cablageElec(m, bp2, elec, { depart: 'bas-gauche' });
      const ve = t.variantes.find((x) => x.mode === t.conseil);
      const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'elec' };
      const dessiner = (boitiers) => {
        const { svg } = construireSvg({
          geo: geometrieSchema(vue, m, bp2, calculs.pixelMap(m, bp2, null)), trajets: trajetsSchema(vue, null, ve, null), coin: 'bas-gauche', blocs: [],
          palette: PALETTE_EXPORT, largeurPx: 2000, repere: repereSchema('elec', { distanceM: 25 }), boitiers,
        });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        return svg;
      };
      const d = calculs.distributionElec(m, ve, elec, { depart: 'bas-gauche', distanceArmoireM: 25, mode: 'stack' });
      const boitiers = d.boitiers.map((b) => ({ nom: b.nom, trajets: b.lignes.map((l) => `l${l.numero}`) }));
      const svg = dessiner(boitiers);
      try {
        const cadres = [...svg.querySelectorAll('g.boitier')];
        v.egal('2 boîtiers, « B1 » et « B2 »', cadres.map((g) => g.querySelector('text')?.textContent), ['B1', 'B2']);
        const boite = (g) => {
          const r = g.querySelector('rect');
          return ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a)));
        };
        const departs = (cles) => cles.map((cle) => svg.querySelector(`[data-trajet="${cle}"] circle.depart`)).map((c) => ['cx', 'cy', 'r'].map((a) => Number(c.getAttribute(a))));
        const fautes = [];
        cadres.forEach((g, i) => {
          const [x, y, w, h] = boite(g);
          const ds = departs(boitiers[i].trajets);
          if (y <= m.hauteurMm) fautes.push(`${boitiers[i].nom} : pas sous le mur`);
          if (!ds.every(([, cy, r]) => y > cy + r)) fautes.push(`${boitiers[i].nom} : pas plus loin du mur que ses départs`);
          const cx = x + w / 2;
          if (cx < Math.min(...ds.map((p) => p[0])) - 1 || cx > Math.max(...ds.map((p) => p[0])) + 1) fautes.push(`${boitiers[i].nom} : pas au droit de ses lignes`);
          const tous = [...svg.querySelectorAll('circle.depart')].map((c) => ['cx', 'cy', 'r'].map((a) => Number(c.getAttribute(a))));
          if (tous.some(([px, py, r]) => px + r > x && px - r < x + w && py + r > y && py - r < y + h)) fautes.push(`${boitiers[i].nom} : touche un départ`);
        });
        v.egal('boîtiers sous le mur en stack, au droit de leurs lignes, plus loin que les départs, sans les toucher', fautes, []);
        const liens = boitiers.flatMap((b) => b.trajets).filter((cle) => svg.querySelector(`[data-trajet="${cle}"] .depuis-boitier`));
        v.egal('chaque ligne d\'un boîtier part de lui', liens.length, 12);
        const p17 = svg.querySelector('.repere .cable-p17');
        v.vrai('câble P17 en tirets de l\'armoire aux boîtiers', Boolean(p17) && Boolean(p17.getAttribute('stroke-dasharray')));
        const texteRepere = svg.querySelector('.repere text')?.getAttribute('style');
        v.egal('texte du boîtier aux couleurs du repère', cadres[0]?.querySelector('text')?.getAttribute('style'), texteRepere);
        v.egal('lignes d\'un boîtier : plus de chemin des câbles de tête depuis l\'armoire', svg.querySelectorAll('.chemin-tete').length, 0);
      } finally {
        svg.remove();
      }
      const sans = dessiner(undefined);
      try {
        v.egal('sans boîtier : ni cadre, ni câble P17, chemin des câbles de tête gardé', [sans.querySelectorAll('g.boitier').length, sans.querySelectorAll('.cable-p17').length, sans.querySelectorAll('.chemin-tete').length], [0, 0, 1]);
      } finally {
        sans.remove();
      }
    },
  },
  {
    id: 'N81',
    titre: 'Écran Matériel d\'un mur (13b) : presta et mur en tête, rappel « Liste indicative… », spare de la presta réglable (erreur affichée, valeur remise), une section par famille de matériel dans l\'ordre (Dalles, Data, Élec, Accroche, Flight cases), chaque ligne avec sa quantité, sa désignation, sa longueur et son détail, notes, poids transporté ; liste calculée avec un autre spare signalée ; mur jamais ouvert : « Ouvre ce mur une fois pour compter son matériel. » et « Ouvrir ce mur » ; cibles de 48 px, rien ne dépasse à 375 px',
    etape: '13b',
    async verifier(v, contexte) {
      const em = await moduleAppli(v, '../src/ecran-materiel.js');
      if (!em) return;
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
      const t = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche', distanceRegieM: 20 });
      const liste = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: { evaluation: e, variante: t.variantes.find((x) => x.mode === t.conseil), distanceRegieM: 20 } });
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px', class: 'pr mat', 'data-famille': 'presta' });
      document.body.append(racine);
      const appels = [];
      let refuser = false;
      const actions = {
        reglerSpares: async (id, valeur) => {
          appels.push(['spares', id, valeur]);
          if (refuser) throw new Error('Spare : un pourcentage de 0 à 100.');
        },
        ouvrirMur: async (id, murId) => appels.push(['ouvrir', id, murId]),
      };
      const texte = (x) => (x?.textContent ?? '').replace(/\s+/g, ' ').trim();
      try {
        const ecran = em.monterMateriel(racine, { actions });
        const presta = { id: 'p1', nom: 'Presta A' };
        const mur = { id: 'm1', nom: 'Mur 1' };
        ecran.afficherMur({ presta, mur, gardee: { liste, calculeeLe: '2026-10-17T08:00:00Z' }, ouvert: true, pourcent: 5 });
        v.egal('presta et mur en tête', [texte(racine.querySelector('.pr-sur-titre')), texte(racine.querySelector('.mat-nom-mur'))], ['Presta A', 'Mur 1']);
        v.vrai('rappel indicatif', texte(racine).includes('Liste indicative, à vérifier avant le chargement.'));
        v.egal('sections dans l\'ordre', [...racine.querySelectorAll('.mat-titre')].map(texte), ['Dalles', 'Data', 'Élec', 'Accroche', 'Flight cases', 'Poids transporté']);
        const lignes = [...racine.querySelectorAll('.mat-ligne')].map((l) => `${texte(l.querySelector('.mat-qte'))} ${texte(l.querySelector('.mat-nom'))}`);
        v.vrai('lignes : quantité, désignation, longueur', lignes.includes('76 Dalle du cas 13') && lignes.includes('1 Multipaire 8 RJ45, 25 m')
          && lignes.includes('3 Câble RJ45 au mur, du multipaire à la dalle, 5 m') && lignes.includes('6 Cordon RJ45 côté régie, du processeur au multipaire, longueur à mesurer'), lignes.join(' / '));
        v.vrai('détail sous la ligne', texte(racine.querySelector('.mat-ligne .mat-detail')) === '72 au mur + 4 de spare (5 %, arrondi au-dessus)', texte(racine.querySelector('.mat-ligne .mat-detail')));
        v.vrai('notes des sections', texte(racine).includes('Élec : non calculé, ouvre l\'onglet Élec.') && texte(racine).includes('Cases de Dalle du cas 13 : à préciser dans le parc.'));
        v.vrai('poids transporté indicatif (76 dalles × 7,5 kg)', /570 kg/.test(texte(racine)) && /indicatif/.test(texte(racine.querySelector('.mat-poids'))), texte(racine.querySelector('.mat-poids')));
        const champ = racine.querySelector('#mat-spares');
        champ.value = '10';
        champ.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 20));
        v.egal('spare : action appelée', appels.at(-1), ['spares', 'p1', '10']);
        refuser = true;
        champ.value = '200';
        champ.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 20));
        v.vrai('spare refusé : erreur affichée, valeur remise', texte(racine.querySelector('.mat-erreur')).includes('Spare : un pourcentage de 0 à 100.') && champ.value === '5');
        const cibles = [...racine.querySelectorAll('button, input')].filter((x) => x.getBoundingClientRect().width > 0);
        v.vrai('cibles de 48 px', cibles.every((x) => x.getBoundingClientRect().height >= 47.5), cibles.map((x) => Math.round(x.getBoundingClientRect().height)).join(', '));
        const bord = racine.getBoundingClientRect().right;
        v.vrai('rien ne dépasse à 375 px', [...racine.querySelectorAll('*')].every((x) => x.getBoundingClientRect().right <= bord + 0.5));
        ecran.afficherMur({ presta, mur: { id: 'm2', nom: 'Mur 2' }, gardee: { liste, calculeeLe: '2026-10-17T08:00:00Z' }, ouvert: false, pourcent: 10 });
        v.vrai('autre spare : liste à recalculer', texte(racine).includes('Liste calculée avec 5 % de spare : ouvre ce mur pour la recalculer à 10 %.') && /Liste calculée le 17\/10\/2026/.test(texte(racine)));
        ecran.afficherMur({ presta, mur: { id: 'm3', nom: 'Mur 3' }, gardee: null, ouvert: false, pourcent: 5 });
        v.vrai('mur jamais ouvert : le dire', texte(racine).includes('Ouvre ce mur une fois pour compter son matériel.'));
        const ouvrir = [...racine.querySelectorAll('button')].find((b) => texte(b) === 'Ouvrir ce mur');
        ouvrir?.click();
        await new Promise((r) => setTimeout(r, 20));
        v.egal('« Ouvrir ce mur »', appels.at(-1), ['ouvrir', 'p1', 'm3']);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N82',
    titre: 'Écran Matériel, total de la presta (13c) : nombre de murs et lignes cochées en tête, rappel, murs sans liste, chaque ligne avec sa case à cocher (48 px) qui appelle « cocher » avec sa quantité, ligne cochée marquée ; bandeau des lignes décochées avec la raison et « Compris » ; ajouts à la main (formulaire, erreur affichée, « Retirer ») ; « Tout décocher » avec confirmation, grisé sans coche ; « Copier la liste » et « Partager » ; rien ne dépasse à 375 px',
    etape: '13c',
    async verifier(v) {
      const em = await moduleAppli(v, '../src/ecran-materiel.js');
      if (!em) return;
      const liste = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, 12, 6), dalle: DALLE_CAS_13 });
      const total = calculs.totalMateriel([{ nom: 'Mur 1', liste }, { nom: 'Mur 2', liste: null }], { ajouts: [{ id: 'a1', libelle: 'Socapex 19 broches', quantite: 2 }] });
      const retirerStyles = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px', class: 'pr mat', 'data-famille': 'presta' });
      document.body.append(racine);
      const appels = [];
      let refuser = null;
      const confirmations = [];
      const action = (nom) => async (...x) => {
        appels.push([nom, ...x]);
        if (refuser) throw new Error(refuser);
        return nom === 'copier' ? true : (nom === 'partager' ? 'partage' : undefined);
      };
      const actions = Object.fromEntries(['reglerSpares', 'ouvrirMur', 'cocher', 'toutDecocher', 'compris', 'ajouter', 'retirerAjout', 'copier', 'partager'].map((n) => [n, action(n)]));
      const texte = (x) => (x?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const attendre = () => new Promise((r) => setTimeout(r, 20));
      const boutonDe = (libelle) => [...racine.querySelectorAll('button')].find((b) => texte(b) === libelle);
      try {
        const ecran = em.monterMateriel(racine, { actions, confirmer: (t) => { confirmations.push(t); return true; } });
        const presta = { id: 'p1', nom: 'Presta A' };
        ecran.afficherPresta({ presta, total, coches: new Set(['dalle|fictive-cas-13']), changees: [], pourcent: 5 });
        v.vrai('en tête : murs et lignes cochées', texte(racine.querySelector('.mat-date')) === `2 murs ; chargement : 1 ligne cochée sur ${total.sections.reduce((s, x) => s + x.lignes.length, 0)}.`, texte(racine.querySelector('.mat-date')));
        v.vrai('rappel et mur sans liste', texte(racine).includes('Liste indicative, à vérifier avant le chargement.') && texte(racine).includes('Mur 2 : ouvre ce mur une fois pour compter son matériel.'));
        const cases = [...racine.querySelectorAll('input.mat-case')];
        v.egal('une case par ligne', cases.length, total.sections.reduce((s, x) => s + x.lignes.length, 0));
        v.vrai('ligne cochée marquée', cases[0].checked && racine.querySelector('.mat-ligne').classList.contains('mat-cochee'));
        const cible = (x) => x.closest('label').getBoundingClientRect().height;
        v.vrai('cases de 48 px (toute la ligne)', cases.every((c) => cible(c) >= 47.5), cases.map((c) => Math.round(cible(c))).join(', '));
        cases[1].click();
        await attendre();
        const l1 = total.sections.flatMap((s) => s.lignes)[1];
        v.egal('cocher : clé et quantité', appels.at(-1), ['cocher', 'p1', l1.cle, l1.quantite]);
        cases[0].click();
        await attendre();
        v.egal('décocher : quantité nulle', appels.at(-1), ['cocher', 'p1', 'dalle|fictive-cas-13', null]);
        ecran.afficherPresta({ presta, total, coches: new Set(), changees: [{ cle: 'x', texte: 'Câble de tête RJ45, 10 m : 6 au lieu de 4, décoché' }], pourcent: 5 });
        v.vrai('bandeau des lignes décochées', texte(racine.querySelector('.mat-bandeau')).includes('Câble de tête RJ45, 10 m : 6 au lieu de 4, décoché'));
        boutonDe('Compris').click();
        await attendre();
        v.egal('« Compris »', appels.at(-1), ['compris', 'p1']);
        v.vrai('« Tout décocher » grisé sans coche', boutonDe('Tout décocher').disabled);
        const ajouts = racine.querySelector('[data-section="ajouts"]');
        v.vrai('ajout à la main listé, avec « Retirer »', texte(ajouts).includes('Socapex 19 broches') && Boolean(boutonDe('Retirer')));
        const form = ajouts.querySelector('form.mat-ajout');
        form.elements.libelle.value = 'Harting 16';
        form.elements.quantite.value = '3';
        form.requestSubmit();
        await attendre();
        v.egal('ajouter', appels.at(-1), ['ajouter', 'p1', { libelle: 'Harting 16', quantite: '3' }]);
        refuser = 'Quantité : un nombre entier, de 1 à 9999.';
        form.requestSubmit();
        await attendre();
        v.vrai('ajout refusé : erreur affichée', texte(racine.querySelector('.mat-erreur')).includes('Quantité : un nombre entier'));
        refuser = null;
        boutonDe('Retirer').click();
        await attendre();
        v.egal('retirer', appels.at(-1), ['retirerAjout', 'p1', 'a1']);
        ecran.afficherPresta({ presta, total, coches: new Set(['dalle|fictive-cas-13']), changees: [], pourcent: 5 });
        boutonDe('Tout décocher').click();
        await attendre();
        v.vrai('« Tout décocher » : confirmation, puis action', confirmations.at(-1) === 'Décocher la ligne cochée de Presta A ?' && appels.at(-1)[0] === 'toutDecocher', confirmations.at(-1));
        boutonDe('Copier la liste').click();
        await attendre();
        v.vrai('« Copier la liste »', appels.at(-1)[0] === 'copier' && texte(racine.querySelector('.mat-note-partage')) === 'Liste copiée.');
        boutonDe('Partager').click();
        await attendre();
        v.egal('« Partager »', appels.at(-1), ['partager']);
        const bord = racine.getBoundingClientRect().right;
        v.vrai('rien ne dépasse à 375 px', [...racine.querySelectorAll('*')].every((x) => x.getBoundingClientRect().right <= bord + 0.5));
        const petits = [...racine.querySelectorAll('button, input:not(.mat-case)')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().height < 47.5);
        v.vrai('cibles de 48 px', petits.length === 0, petits.map((x) => texte(x) || x.name).join(', '));
      } finally {
        racine.remove();
        retirerStyles();
      }
    },
  },
  {
    id: 'N83',
    titre: 'Deux onglets de l\'appli (lot du 17/10/2026) : le dernier ouvert prend la main, l\'ancien est prévenu une fois (canal entre onglets) ; écritures suspendues : rien n\'est plus écrit sur l\'appareil (base de test séparée), la lecture reste',
    etape: '13d',
    async verifier(v) {
      const mo = await moduleAppli(v, '../src/onglets.js');
      if (!mo) return;
      const nom = 'appli-mur-led-tests';
      const st = creerStockage(nom);
      await st.ecrire('essai', 1);
      st.suspendre();
      v.egal('écriture suspendue : refusée', [await st.ecrire('essai', 2), await st.effacer('essai'), st.suspendu()], [false, false, true]);
      v.egal('la valeur sur l\'appareil reste', await creerStockage(nom).lire('essai'), 1);
      await new Promise((r) => { const q = indexedDB.deleteDatabase(nom); q.onsuccess = r; q.onerror = r; q.onblocked = r; });
      const canal = `mur-led-onglets-test-${Date.now()}`;
      const prevenus = [];
      const a = mo.surveillerOnglets({ canal, id: 'a', surRemplace: () => prevenus.push('a') });
      await new Promise((r) => setTimeout(r, 50));
      const b = mo.surveillerOnglets({ canal, id: 'b', surRemplace: () => prevenus.push('b') });
      await new Promise((r) => setTimeout(r, 100));
      v.egal('le premier onglet est prévenu, pas le dernier', prevenus, ['a']);
      a.arreter();
      b.arreter();
    },
  },
  {
    id: 'N84',
    titre: 'Écran Prestas, « Modifier » (14a) : partie repliable « Horaires, accès et contacts » sous les notes, fermée quand tout est vide, ouverte quand quelque chose est rempli ; horaires, accès, puis un groupe par contact (nom, téléphone en champ « tel ») ; champs remplis ; envoyée avec les infos (`organisation`) ; erreur affichée, partie ouverte ; cibles de 48 px, rien ne dépasse à 375 px',
    etape: '14a',
    async verifier(v) {
      const ep = await moduleAppli(v, '../src/ecran-prestas.js');
      const pr = await moduleAppli(v, '../src/prestas.js');
      if (!ep || !pr) return;
      let n = 0;
      const o = () => ({ maintenant: new Date('2026-10-17T08:00:00Z'), alea: () => `n${(n += 1)}` });
      let etat = pr.migrer({}, o());
      const a = etat.index.ouverte.presta;
      const appels = [];
      const actions = Object.fromEntries(['ouvrir', 'creerPresta', 'ajouterMur', 'dupliquerMur', 'supprimerMur', 'dupliquerPresta', 'archiverPresta', 'supprimerPresta', 'renommerMur', 'exporter']
        .map((nom) => [nom, async () => {}]));
      // Comme l'appli : la presta est vérifiée par prestas.js, une saisie refusée lève son erreur.
      actions.modifierPresta = async (id, infos) => {
        appels.push(infos);
        etat = pr.modifierPresta(etat, id, infos, o());
      };
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const modifier = () => {
        const plus = [...racine.querySelectorAll('.pr-actions-presta button')].find((x) => texteDe(x) === 'Plus');
        if (plus.getAttribute('aria-expanded') !== 'true') plus.click();
        [...document.getElementById(plus.getAttribute('aria-controls'))?.querySelectorAll('button') ?? []].find((x) => texteDe(x) === 'Modifier')?.click();
        return racine.querySelector('.pr-formulaire');
      };
      const NOMS = ['horaires-montage', 'horaires-show', 'horaires-demontage', 'acces-quai', 'acces-ascenseur', 'acces-chargeMaxi',
        ...['chefProjet', 'regie', 'electricien', 'rigger'].flatMap((c) => [`contacts-${c}-nom`, `contacts-${c}-telephone`])].map((x) => `org-${x}`);
      try {
        const ecran = ep.monterPrestas(racine, { actions, confirmer: () => true });
        ecran.afficher(etat, { persistant: true });
        let form = modifier();
        const partie = form?.querySelector('details.pr-organisation');
        v.egal('partie repliable sous les notes, fermée quand tout est vide', [texteDe(partie?.querySelector('summary')), partie?.previousElementSibling?.querySelector('textarea')?.name, partie?.open],
          ['Horaires, accès et contacts', 'notes', false]);
        v.egal('groupes : horaires, accès, un par contact', [...(partie?.querySelectorAll('fieldset > legend') ?? [])].map(texteDe), ['Horaires', 'Accès', 'Chef de projet', 'Régie', 'Électricien', 'Rigger']);
        v.egal('champs dans l\'ordre, avec leur libellé', [...(partie?.querySelectorAll('label') ?? [])].map((l) => [texteDe(l.querySelector('span')), l.querySelector('input')?.name]),
          [['Montage', NOMS[0]], ['Show', NOMS[1]], ['Démontage', NOMS[2]], ['Quai', NOMS[3]], ['Ascenseur', NOMS[4]], ['Charge maxi', NOMS[5]],
            ...[6, 8, 10, 12].flatMap((i) => [['Nom', NOMS[i]], ['Téléphone', NOMS[i + 1]]])]);
        v.egal('téléphones en champ « tel », longueurs maxi', NOMS.map((x) => [form.elements[x]?.type, form.elements[x]?.maxLength]),
          NOMS.map((x) => (x.endsWith('telephone') ? ['tel', 30] : x.endsWith('nom') ? ['text', 60] : ['text', 80])));
        partie.open = true;
        await attendre();
        const cibles = [partie.querySelector('summary'), ...NOMS.map((x) => form.elements[x])].map((x) => x?.getBoundingClientRect());
        const bord = racine.getBoundingClientRect();
        v.vrai(`cibles de 48 px au moins (${Math.round(Math.min(...cibles.map((r) => r?.height ?? 0)))} px)`, cibles.every((r) => r && r.height >= 47.5));
        v.vrai('rien ne dépasse à 375 px', racine.scrollWidth <= 375 && cibles.every((r) => r.left >= bord.left - 0.5 && r.right <= bord.right + 0.5));
        form.elements['org-horaires-montage'].value = ' jeudi 8 h à 18 h ';
        form.elements['org-acces-quai'].value = 'Quai B';
        form.elements['org-contacts-rigger-nom'].value = 'Contact D';
        form.elements['org-contacts-rigger-telephone'].value = '0'.repeat(31);
        form.requestSubmit();
        await attendre();
        v.egal('erreur affichée, partie ouverte', [texteDe(form.querySelector('.alerte')), partie.open, racine.contains(form)],
          ['Téléphone du contact rigger trop long : 30 caractères au plus.', true, true]);
        form.elements['org-contacts-rigger-telephone'].value = '00 00 00 00 04';
        form.requestSubmit();
        await attendre();
        const vide = pr.organisationVide();
        v.egal('enregistrée : envoyée avec les infos, telle que saisie', appels.at(-1)?.organisation, {
          ...vide, horaires: { ...vide.horaires, montage: ' jeudi 8 h à 18 h ' }, acces: { ...vide.acces, quai: 'Quai B' },
          contacts: { ...vide.contacts, rigger: { nom: 'Contact D', telephone: '00 00 00 00 04' } },
        });
        v.egal('formulaire fermé', racine.querySelector('.pr-formulaire'), null);
        ecran.afficher(etat, { persistant: true });
        form = modifier();
        v.egal('rouvert : partie ouverte, champs remplis', [form?.querySelector('details.pr-organisation')?.open, ...['org-horaires-montage', 'org-acces-quai', 'org-contacts-rigger-nom', 'org-contacts-rigger-telephone', 'org-horaires-show'].map((x) => form?.elements[x]?.value)],
          [true, 'jeudi 8 h à 18 h', 'Quai B', 'Contact D', '00 00 00 00 04', '']);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N85',
    titre: 'Écran « Fiches » (14c, § 5) : choix segmenté des quatre métiers (le choisi coché, un choix appelle son action) ; aperçu : titre, rappel, en-tête et un tableau par mur (« libellé : valeur », sous-titres), mur jamais ouvert avec « Ouvrir ce mur » ; « PDF » (lot 14d), « Copier », « Partager » appellent leur action ; fiche des tableaux sans bouton hors de l\'écran ; cibles de 48 px ; rien ne dépasse à 375 px, en sombre et en rouge',
    etape: '14c',
    async verifier(v) {
      const ef = await moduleAppli(v, '../src/ecran-fiches.js');
      const fm = await moduleAppli(v, '../src/fiches-metier.js');
      if (!ef || !fm) return;
      const textes = {
        mur: 'MUR\nDalles : 10 × 5 = 50 (colonnes × lignes)', data: 'DATA\nProcesseur : 1 × Brompton S8', canvas: 'CANVAS ET SOURCE\nSource : 1920 × 1080 px à 60 Hz en HDMI 2.0',
        elec: 'ÉLECTRICITÉ : indicatif, à valider par l\'électricien\nPuissance totale : 4,5 kW', poids: 'POIDS : indicatif, à valider par le rigger\nMode : accroche\nTotal suspendu : 420 kg',
      };
      const presta = { id: 'p-a', nom: 'Presta-de-nom-tres-long-sans-espace-pour-voir-le-retour-ligne', debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B' };
      const murs = [{ id: 'm-1', nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: null }, { id: 'm-2', nom: 'Mur 2', fiche: null, materiel: null }];
      const fiche = (metier) => fm.ficheMetier(metier, { presta, murs, date: new Date(2026, 9, 17, 12) });
      const appels = [];
      const actions = Object.fromEntries(['choisirMetier', 'ouvrirMur', 'pdf', 'copier', 'partager'].map((nom) => [nom, async (...args) => { appels.push([nom, ...args]); return nom === 'copier' ? true : 'partage'; }]));
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      try {
        const ecran = ef.monterFiches(racine, { actions });
        ecran.afficher({ presta, fiche: fiche('chefProjet'), metier: 'chefProjet' });
        const choix = [...racine.querySelectorAll('.segments input[name=metier]')];
        v.egal('choix segmenté : quatre métiers, le choisi coché', [choix.map((x) => texteDe(x.closest('label'))), choix.map((x) => x.checked)],
          [['Rigger', 'Électricien', 'Régie', 'Chef de projet'], [false, false, false, true]]);
        choix[0].click();
        await attendre();
        v.egal('un choix appelle son action', appels.at(-1), ['choisirMetier', 'rigger']);
        ecran.afficher({ presta, fiche: fiche('rigger'), metier: 'rigger' });
        const apercu = racine.querySelector('.fi-fiche');
        v.egal('aperçu : titre et rappel', [texteDe(apercu?.querySelector('.fi-titre')), texteDe(apercu?.querySelector('.fi-rappel'))], ['Fiche rigger', 'Fiche indicative, à valider par le rigger.']);
        v.egal('en-tête en tableau', [...(apercu?.querySelectorAll('.fi-entete tr') ?? [])].map((tr) => [texteDe(tr.querySelector('th')), texteDe(tr.querySelector('td'))]),
          [['Presta', presta.nom], ['Dates', 'du 17 au 19/10/2026'], ['Lieu', 'Lieu B'], ['Date de la fiche', '17/10/2026']]);
        const blocs = [...(apercu?.querySelectorAll('.fi-mur') ?? [])];
        v.egal('un bloc par mur, titre et date', blocs.map((b) => [texteDe(b.querySelector('h4')), texteDe(b.querySelector('.fi-date'))]), [['Mur 1', 'Textes du 17/10/2026'], ['Mur 2', '']]);
        v.egal('lignes du mur 1 : « libellé : valeur » et sous-titre', [...blocs[0].querySelectorAll('tr')].map((tr) => (tr.classList.contains('fi-sous-titre') ? `[${texteDe(tr)}]` : `${texteDe(tr.querySelector('th'))} : ${texteDe(tr.querySelector('td'))}`)),
          ['Mode : accroche', 'Total suspendu : 420 kg', 'Matériel : ouvre ce mur une fois pour compter son matériel']);
        v.egal('mur jamais ouvert : message', texteDe(blocs[1].querySelector('.alerte')), 'Ouvre ce mur une fois pour sa fiche.');
        [...blocs[1].querySelectorAll('button')].find((b) => texteDe(b) === 'Ouvrir ce mur')?.click();
        await attendre();
        v.egal('« Ouvrir ce mur »', appels.at(-1), ['ouvrirMur', 'p-a', 'm-2']);
        const boutons = [...racine.querySelectorAll('.fi-actions button')];
        v.egal('boutons', boutons.map(texteDe), ['PDF', 'Copier', 'Partager']);
        const notes = [];
        for (const b of boutons) {
          b.click();
          await attendre();
          await attendre();
          notes.push(texteDe(racine.querySelector('.fi-note')));
        }
        v.egal('chaque bouton appelle son action', appels.slice(-3).map((a) => a[0]), ['pdf', 'copier', 'partager']);
        v.egal('notes : copie annoncée, partage sans note', notes.slice(1), ['Fiche copiée.', '']);
        const page = ef.elementFiche(fiche('regie'));
        v.egal('page imprimée : la fiche sans bouton ni choix', [page.querySelectorAll('button, input').length, texteDe(page.querySelector('.fi-titre'))], [0, 'Fiche régie vidéo']);
        const cibles = [...racine.querySelectorAll('button, .segments label')].map((x) => x.getBoundingClientRect());
        v.vrai(`cibles de 48 px au moins (${Math.round(Math.min(...cibles.map((r) => r.height)))} px)`, cibles.every((r) => r.height >= 47.5));
        const bord = racine.getBoundingClientRect();
        const deborde = () => [...racine.querySelectorAll('*')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right > bord.right + 0.5; }).map((x) => x.className || x.tagName);
        v.egal('375 px, sombre : rien ne dépasse', deborde(), []);
        document.documentElement.dataset.mode = 'rouge';
        v.egal('375 px, rouge : rien ne dépasse', deborde(), []);
      } finally {
        delete document.documentElement.dataset.mode;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N86',
    titre: 'NovaLCT pas à pas (17b, spec § 5) : carte de Data « NovaLCT pas à pas » : titre, processeurs, V-Can annoncé pour un VX réglé dans V-Can, ligne de version, état des étapes, bouton principal « Ouvrir le pas à pas » qui appelle son action ; cible de 48 px ; rien ne dépasse à 375 px',
    etape: '17b',
    async verifier(v) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      if (!en) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      let ouvert = 0;
      try {
        const carte = en.carteNovaLCT({ processeur: 'MCTRL660', nombre: 2, groupe: 'carte-envoi', version: 'Noms des menus : V5.8.1 en premier.', etat: 'Aucune étape faite sur 34.' }, { ouvrir: () => { ouvert += 1; } });
        racine.append(carte);
        v.egal('titre', texteDe(carte.querySelector('h3')), 'NovaLCT pas à pas');
        v.egal('texte', texteDe(carte.querySelector('.nl-carte-texte')), '2 × MCTRL660 : ce qu\'il faut faire dans NovaLCT pour ce mur, étape par étape, avec ses valeurs et la source de chaque étape.');
        v.egal('version et état', [texteDe(carte.querySelector('.source')), texteDe(carte.querySelector('.nl-etat'))], ['Noms des menus : V5.8.1 en premier.', 'Aucune étape faite sur 34.']);
        const bouton = carte.querySelector('button');
        v.egal('bouton principal', [texteDe(bouton), bouton?.classList.contains('bouton-principal')], ['Ouvrir le pas à pas', true]);
        bouton?.click();
        v.egal('le bouton appelle son action', ouvert, 1);
        v.vrai(`cible de 48 px au moins (${Math.round(bouton?.getBoundingClientRect().height ?? 0)} px)`, (bouton?.getBoundingClientRect().height ?? 0) >= 47.5);
        const vx = en.carteNovaLCT({ processeur: 'VX1000', nombre: 1, groupe: 'v-can', version: '', etat: '2 étapes sur 31 faites.' }, { ouvrir: () => {} });
        v.vrai('VX réglé dans V-Can : annoncé', texteDe(vx.querySelector('.nl-carte-texte')).includes('et avant dans V-Can ou en façade'), texteDe(vx.querySelector('.nl-carte-texte')));
        const bord = racine.getBoundingClientRect();
        v.egal('375 px : rien ne dépasse', [...racine.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > bord.right + 0.5).map((x) => x.className || x.tagName), []);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N87',
    titre: 'NovaLCT pas à pas (17b, spec § 5) : écran plein : état « n étapes sur N faites », choix des parties (Avant, V-Can, Processeur n, Contrôles), une carte par étape (titre, texte, noms des menus en chasse fixe, sources courtes, « À vérifier en formation », alerte), dessin sous chaque port, case « Fait » qui appelle son action avec la signature, bandeau « Le mur a changé » et « Compris », « Partie suivante », « Tout décocher » confirmé dans l\'écran',
    etape: '17b',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const pasAPas = (procId, reglages = {}) => {
        const m = calculs.mur(DALLE_CAS_13, 12, 6);
        const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, procId), { frequenceHz: 60, bits: 8, ...reglages });
        const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
        const variante = c.variantes.find((x) => x.mode === c.conseil);
        return nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante, source: calculs.sourceConseillee(evaluation, liaisonsDeBase(contexte), evaluation.reglages.frequenceHz) });
      };
      const appels = [];
      const actions = {
        cocher: async (...a) => { appels.push(['cocher', ...a]); },
        compris: async () => { appels.push(['compris']); },
        toutDecocher: async () => { appels.push(['toutDecocher']); },
        dessinPort: (etape) => el('div', { class: 'dessin-essai' }, etape.id),
      };
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const ids = () => [...racine.querySelectorAll('.nl-etape')].map((x) => x.dataset.etape);
      const partie = (nom) => [...racine.querySelectorAll('.nl-parties label')].find((l) => texteDe(l) === nom)?.querySelector('input');
      try {
        const r = pasAPas('novastar-mctrl660');
        const total = r.parties.reduce((t, p) => t + p.etapes.length, 0);
        const ecran = en.monterNovaLCT(racine, { actions });
        ecran.afficher({ resultat: r, cases: {}, avis: null });
        v.egal('état', texteDe(racine.querySelector('.nl-etat')), `Aucune étape faite sur ${total}.`);
        v.egal('parties', [...racine.querySelectorAll('.nl-parties label')].map(texteDe), ['Avant', 'Processeur 1', 'Processeur 2', 'Contrôles']);
        v.egal('première partie affichée', [texteDe(racine.querySelector('.nl-partie-titre')), ids()], ['Avant de partir et sur place', ['0.1', '0.2', '0.3', '0.4', '0.5']]);
        const e05 = racine.querySelector('[data-etape="0.5"]');
        v.egal('titre de l\'étape, avec son numéro (les textes renvoient à « l\'étape A.1 »)', texteDe(e05?.querySelector('h4')), '0.5 Connexion avancée');
        v.vrai('noms des menus en chasse fixe', [...(e05?.querySelectorAll('code.nl-menu') ?? [])].map(texteDe).includes('User > Advanced Synchronous System User Login'), texteDe(e05));
        v.vrai('sources courtes', texteDe(e05?.querySelector('.nl-sources')).includes('Manuel NovaLCT V5.5.0 § 4, p. 5'), texteDe(e05?.querySelector('.nl-sources')));
        partie('Processeur 1').click();
        await attendre();
        v.egal('processeur 1', ids(), r.parties[1].etapes.map((x) => x.id));
        v.egal('dessin sous chaque port seulement', [...racine.querySelectorAll('.dessin-essai')].map(texteDe), ['P1.B.7.1', 'P1.B.7.2', 'P1.B.7.3']);
        const caseB2 = racine.querySelector('[data-etape="P1.B.2"] .nl-case input');
        caseB2.click();
        await attendre();
        v.egal('case cochée : action avec la signature', appels.at(-1), ['cocher', 'P1.B.2', r.parties[1].etapes[1].signature]);
        caseB2.click();
        await attendre();
        v.egal('case décochée : signature nulle', appels.at(-1), ['cocher', 'P1.B.2', null]);
        ecran.afficher({ resultat: r, cases: { 'P1.B.2': r.parties[1].etapes[1].signature, '0.1': r.parties[0].etapes[0].signature }, avis: 'Le mur a changé : étape « Port 4 » décochée (l\'étape n\'existe plus).' });
        v.egal('cases gardées et état', [racine.querySelector('[data-etape="P1.B.2"] .nl-case input')?.checked, texteDe(racine.querySelector('.nl-etat'))], [true, `2 étapes sur ${total} faites.`]);
        v.egal('même partie après un nouvel affichage', texteDe(racine.querySelector('.nl-partie-titre')), 'NovaLCT, MCTRL660 n° 1');
        v.egal('bandeau', texteDe(racine.querySelector('.nl-avis span')), 'Le mur a changé : étape « Port 4 » décochée (l\'étape n\'existe plus).');
        racine.querySelector('.nl-avis button')?.click();
        await attendre();
        v.egal('« Compris »', appels.at(-1), ['compris']);
        boutonTexte(racine, 'Partie suivante')?.click();
        await attendre();
        v.egal('« Partie suivante »', texteDe(racine.querySelector('.nl-partie-titre')), 'NovaLCT, MCTRL660 n° 2');
        boutonTexte(racine, 'Tout décocher')?.click();
        await attendre();
        v.egal('« Tout décocher » demande confirmation', [appels.at(-1)[0], Boolean(boutonTexte(racine, 'Oui, tout décocher'))], ['compris', true]);
        boutonTexte(racine, 'Oui, tout décocher')?.click();
        await attendre();
        v.egal('confirmé', appels.at(-1), ['toutDecocher']);
        const vx = pasAPas('novastar-vx1000', { frequenceHz: 50 });
        ecran.afficher({ resultat: vx, cases: {}, avis: null });
        v.egal('VX1000 : partie V-Can', [...racine.querySelectorAll('.nl-parties label')].map(texteDe), ['Avant', 'V-Can', 'Processeur 1', 'Contrôles']);
        partie('V-Can').click();
        await attendre();
        v.egal('« À vérifier en formation » marqué', [...racine.querySelectorAll('.nl-a-verifier')].map((x) => x.closest('.nl-etape')?.dataset.etape), ['A.3']);
        partie('Processeur 1').click();
        await attendre();
        v.vrai('alerte des 650 000 px dans son étape', texteDe(racine.querySelector('[data-etape="P1.B.8"] .alerte')).startsWith('NovaLCT avertira'), texteDe(racine.querySelector('[data-etape="P1.B.8"]')));
        v.egal('« Partie suivante » absent sur la dernière partie', (partie('Contrôles').click(), await attendre(), boutonTexte(racine, 'Partie suivante') ?? null), null);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N88',
    titre: 'NovaLCT pas à pas (17b) : à 375 px, en sombre, en rouge et en grand affichage : rien ne dépasse, cibles de 48 px (cases de 64 px, 60 et 64 px en grand affichage), noms des menus et « À vérifier en formation » à 4,5:1 sur leur fond',
    etape: '17b',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-vx1000'), { frequenceHz: 50, bits: 8, redondance: true });
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const r = nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: calculs.sourceConseillee(evaluation, liaisonsDeBase(contexte), 50) });
      const retirer = await chargerStylesLook();
      const ecranPlein = el('div', { class: 'montage prestas novalct', 'data-famille': 'donnees', style: 'position:absolute;left:-10000px;top:0;width:375px;height:900px' });
      const racine = el('div', { class: 'mf-defilant pr nl' });
      ecranPlein.append(racine);
      document.body.append(ecranPlein);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      try {
        const ecran = en.monterNovaLCT(racine, { actions: { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null } });
        ecran.afficher({ resultat: r, cases: {}, avis: 'Le mur a changé : étape « Port 4 » décochée (l\'étape n\'existe plus).' });
        const parties = [...racine.querySelectorAll('.nl-parties input')];
        for (const [mode, taille] of [['sombre', null], ['rouge', null], ['sombre', 'grand'], ['rouge', 'grand']]) {
          if (mode === 'rouge') document.documentElement.dataset.mode = 'rouge';
          else delete document.documentElement.dataset.mode;
          if (taille) document.documentElement.dataset.taille = taille;
          else delete document.documentElement.dataset.taille;
          const nom = `${mode}${taille ? ', grand affichage' : ''}`;
          const debordements = [];
          const petites = [];
          const contrastes = [];
          for (const p of parties) {
            p.click();
            await attendre();
            const bord = ecranPlein.getBoundingClientRect();
            debordements.push(...[...ecranPlein.querySelectorAll('*')].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.right > bord.right + 0.5; }).map((x) => `${p.value} : ${x.className || x.tagName}`));
            const minimum = taille ? 59.5 : 47.5;
            petites.push(...[...racine.querySelectorAll('button, .nl-parties label')].filter((x) => x.getBoundingClientRect().height < minimum).map((x) => `${p.value} : ${texteDe(x)}`));
            petites.push(...[...racine.querySelectorAll('.nl-case')].filter((x) => x.getBoundingClientRect().height < 63.5).map((x) => `${p.value} : case`));
            for (const x of racine.querySelectorAll('code.nl-menu, .nl-a-verifier')) {
              const k = contraste(rgbVersHex(getComputedStyle(x).color), fondDe(x));
              if (k < 4.5) contrastes.push(`${texteDe(x)} : ${k.toFixed(2)}`);
            }
          }
          v.egal(`${nom} : rien ne dépasse`, [...new Set(debordements)], []);
          v.egal(`${nom} : cibles`, [...new Set(petites)], []);
          v.egal(`${nom} : contrastes`, [...new Set(contrastes)], []);
        }
      } finally {
        delete document.documentElement.dataset.mode;
        delete document.documentElement.dataset.taille;
        ecranPlein.remove();
        retirer();
      }
    },
  },
  {
    id: 'N89',
    titre: 'NovaLCT pas à pas (17b3) : tableau de la redondance dans son étape (en-têtes, une ligne par port), note « Redondance non cochée » en tête de la partie ; rien ne dépasse à 375 px, en sombre et en rouge',
    etape: '17b3',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const pasAPas = (redondance) => {
        const m = calculs.mur(DALLE_CAS_13, 12, 6);
        const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8, redondance });
        const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
        return nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null });
      };
      const retirer = await chargerStylesLook();
      const ecranPlein = el('div', { class: 'montage prestas novalct', 'data-famille': 'donnees', style: 'position:absolute;left:-10000px;top:0;width:375px;height:900px' });
      const racine = el('div', { class: 'mf-defilant pr nl' });
      ecranPlein.append(racine);
      document.body.append(ecranPlein);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const partie = (nom) => [...racine.querySelectorAll('.nl-parties label')].find((l) => texteDe(l) === nom)?.querySelector('input');
      try {
        const ecran = en.monterNovaLCT(racine, { actions: { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null } });
        ecran.afficher({ resultat: pasAPas(true), cases: {}, avis: null });
        partie('Processeur 1').click();
        await attendre();
        const tableau = racine.querySelector('[data-etape="P1.B.11"] table.nl-tableau');
        v.egal('en-têtes', [...(tableau?.querySelectorAll('th') ?? [])].map(texteDe), ['Carte d\'envoi principale', 'Port principal', 'Carte d\'envoi de secours', 'Port de secours']);
        v.egal('lignes', [...(tableau?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.querySelectorAll('td')].map(texteDe)), [['1', '1', '1', '3'], ['1', '2', '1', '4']]);
        v.egal('redondance cochée : pas de note', racine.querySelector('.nl-note-partie'), null);
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') document.documentElement.dataset.mode = 'rouge';
          const bord = ecranPlein.getBoundingClientRect();
          v.egal(`${mode} : rien ne dépasse`, [...ecranPlein.querySelectorAll('*')].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.right > bord.right + 0.5; }).map((x) => x.className || x.tagName), []);
        }
        delete document.documentElement.dataset.mode;
        ecran.afficher({ resultat: pasAPas(false), cases: {}, avis: null });
        await attendre();
        const note = racine.querySelector('.nl-note-partie');
        v.vrai('redondance non cochée : note en tête de la partie', texteDe(note).startsWith('Redondance non cochée dans Data') && note?.previousElementSibling?.classList.contains('nl-partie-titre'), texteDe(note) || 'absente');
      } finally {
        delete document.documentElement.dataset.mode;
        ecranPlein.remove();
        retirer();
      }
    },
  },
  {
    id: 'N90',
    titre: 'NovaLCT pas à pas (lot 17b4, réactivité sur iPhone) : cocher une case met à jour la case, sa carte et l\'état sur place, sans redessiner l\'écran ni ses dessins ; bouton « Fermer le pas à pas » en bas de l\'écran, qui appelle son action',
    etape: '17b4',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const r = nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null });
      const total = r.parties.reduce((t, p) => t + p.etapes.length, 0);
      const appels = [];
      let dessins = 0;
      const actions = {
        cocher: async (...a) => { appels.push(['cocher', ...a]); },
        compris: async () => {}, toutDecocher: async () => {},
        fermer: () => { appels.push(['fermer']); },
        dessinPort: () => { dessins += 1; return el('div', { class: 'dessin-essai' }); },
      };
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      try {
        const ecran = en.monterNovaLCT(racine, { actions });
        ecran.afficher({ resultat: r, cases: {}, avis: null });
        [...racine.querySelectorAll('.nl-parties label')].find((l) => texteDe(l) === 'Processeur 1')?.querySelector('input').click();
        await attendre();
        const li = racine.querySelector('[data-etape="P1.B.2"]');
        const avant = dessins;
        li.querySelector('.nl-case input').click();
        await attendre();
        v.egal('case cochée : sur place, sans redessin', [li.isConnected, dessins - avant, li.classList.contains('nl-faite'), texteDe(racine.querySelector('.nl-etat'))],
          [true, 0, true, `1 étape sur ${total} faite.`]);
        v.egal('action appelée avec la signature', appels.at(-1), ['cocher', 'P1.B.2', r.parties[1].etapes[1].signature]);
        li.querySelector('.nl-case input').click();
        await attendre();
        v.egal('case décochée : sur place', [li.isConnected, li.classList.contains('nl-faite'), texteDe(racine.querySelector('.nl-etat')), appels.at(-1)[2]],
          [true, false, `Aucune étape faite sur ${total}.`, null]);
        const bas = boutonTexte(racine, 'Fermer le pas à pas');
        v.vrai('bouton « Fermer le pas à pas » en bas, après « Partie suivante »', Boolean(bas) && bas.closest('.nl-pied') !== null);
        bas?.click();
        await attendre();
        v.egal('il appelle son action', appels.at(-1), ['fermer']);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N91',
    titre: 'NovaLCT pas à pas (17c1) : boutons « PDF » et « Copier » en tête de l\'écran (secondaires, « Partie suivante » reste le seul principal), qui appellent leur action ; note « Pas à pas copié. » ; cibles de 56 px',
    etape: '17c1',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const r = nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null });
      const appels = [];
      const actions = {
        cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null,
        copier: async () => { appels.push('copier'); return true; },
        pdf: async () => { appels.push('pdf'); return 'partage'; },
      };
      const retirer = await chargerStylesLook();
      const ecranPlein = el('div', { class: 'montage prestas novalct', 'data-famille': 'donnees', style: 'position:absolute;left:-10000px;top:0;width:375px;height:900px' });
      const racine = el('div', { class: 'mf-defilant pr nl' });
      ecranPlein.append(racine);
      document.body.append(ecranPlein);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      try {
        const ecran = en.monterNovaLCT(racine, { actions });
        ecran.afficher({ resultat: r, cases: {}, avis: null });
        const boutons = [...racine.querySelectorAll('.nl-actions button')];
        v.egal('boutons en tête', boutons.map(texteDe), ['PDF', 'Copier']);
        v.egal('un seul principal dans l\'écran', [...racine.querySelectorAll('.bouton-principal')].map(texteDe), ['Partie suivante ▶']);
        boutons[1]?.click();
        await attendre();
        await attendre();
        v.egal('« Copier » : action et note', [appels.at(-1), texteDe(racine.querySelector('.nl-note'))], ['copier', 'Pas à pas copié.']);
        boutons[0]?.click();
        await attendre();
        await attendre();
        v.egal('« PDF » : action', appels.at(-1), 'pdf');
        v.vrai('cibles de 56 px', boutons.every((b) => b.getBoundingClientRect().height >= 55.5));
      } finally {
        ecranPlein.remove();
        retirer();
      }
    },
  },
  {
    id: 'N92',
    titre: 'NovaLCT pas à pas (17c2, à blanc) : carte « NovaLCT à blanc » en dernier dans Apprendre quand l\'appli la fournit (choix du processeur dans la liste, MCTRL660 ou VX1000 ici, case Redondance, « Ouvrir à blanc » qui appelle son action avec les choix), absente sinon ; l\'écran du pas à pas montre la note du mur d\'exemple en tête',
    etape: '17c2',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!ap || !en || !nl) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const ouvertures = [];
      try {
        const sans = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {} });
        await sans.pret;
        v.egal('sans option : pas de carte', racine.querySelector('.ap-novalct'), null);
        racine.replaceChildren();
        // Adapté le 21/10/2026 avec l'accord de l'utilisateur (18b) : liste de tous les processeurs NovaLCT au lieu de deux boutons.
        const bp = baseProcesseurs(contexte);
        const liste = nl.processeursABlanc(bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)));
        const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {},
          novalct: { ouvrir: (choix) => ouvertures.push(choix), processeurs: liste } });
        await ecran.pret;
        const carte = racine.querySelector('.ap-novalct');
        v.egal('carte en dernier, titre', [carte === racine.lastElementChild, texteDe(carte?.querySelector('h3'))], [true, 'NovaLCT à blanc']);
        const choixProc = carte?.querySelector('select[name="nl-processeur"]');
        v.vrai('choix du processeur : MCTRL660 et VX1000 dans la liste', ['novastar-mctrl660', 'novastar-vx1000'].every((id) => [...(choixProc?.options ?? [])].some((o) => o.value === id)));
        const ouvrir = [...(carte?.querySelectorAll('button') ?? [])].find((b) => texteDe(b) === 'Ouvrir à blanc');
        ouvrir?.click();
        await attendre();
        v.egal('« Ouvrir à blanc » : MCTRL660 sans redondance par défaut', ouvertures.at(-1), { processeur: 'novastar-mctrl660', redondance: false });
        choixProc.value = 'novastar-vx1000';
        choixProc.dispatchEvent(new Event('input', { bubbles: true }));
        choixProc.dispatchEvent(new Event('change', { bubbles: true }));
        carte.querySelector('input[name="nl-redondance"]')?.click();
        ouvrir?.click();
        await attendre();
        v.egal('VX1000 et redondance', ouvertures.at(-1), { processeur: 'novastar-vx1000', redondance: true });
        v.vrai('cibles de 48 px', [...carte.querySelectorAll('button, select, label.case')].every((x) => x.getBoundingClientRect().height >= 47.5));
        const m = calculs.mur(DALLE_CAS_13, 12, 6);
        const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
        const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
        const r = nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null });
        racine.replaceChildren();
        const pas = en.monterNovaLCT(racine, { actions: { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null } });
        pas.afficher({ resultat: r, cases: {}, avis: null, note: 'Mur d\'exemple : essai.' });
        v.egal('écran : note du mur d\'exemple en tête', texteDe(racine.querySelector('.nl-a-blanc')), 'À blanc. Mur d\'exemple : essai.');
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N93',
    titre: 'Code admin NovaLCT du parc (18a, spec § 2) : à l\'étape 0.5 du pas à pas, « Code du parc X » masqué, « Afficher » le montre en clair et devient « Masquer », un nouvel affichage le masque de nouveau ; sans code donné à l\'écran, rien ; cible de 48 px',
    etape: '18a',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      try {
        const m = calculs.mur(DALLE_CAS_13, 12, 6);
        const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), { frequenceHz: 60, bits: 8 });
        const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
        const r = nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null, parc: { nom: 'Parc test', aCode: true } });
        const pas = en.monterNovaLCT(racine, { actions: { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null } });
        pas.afficher({ resultat: r, cases: {}, avis: null, code: 'code-essai' });
        const bloc = () => racine.querySelector('[data-etape="0.5"] .nl-code');
        const boutonCode = () => bloc()?.querySelector('button');
        v.vrai('bloc du code à l\'étape 0.5', Boolean(bloc()));
        v.vrai('masqué : le code n\'est pas dans la page', !racine.textContent.includes('code-essai') && texteDe(bloc()).startsWith('Code du parc Parc test : ••••'), texteDe(bloc()));
        v.egal('bouton « Afficher »', [texteDe(boutonCode()), boutonCode()?.getAttribute('aria-pressed')], ['Afficher', 'false']);
        v.vrai('cible de 48 px', (boutonCode()?.getBoundingClientRect().height ?? 0) >= 47.5);
        boutonCode()?.click();
        v.vrai('« Afficher » : le code en clair', texteDe(bloc()).includes('code-essai'), texteDe(bloc()));
        v.egal('le bouton devient « Masquer »', [texteDe(boutonCode()), boutonCode()?.getAttribute('aria-pressed')], ['Masquer', 'true']);
        boutonCode()?.click();
        v.vrai('« Masquer » : masqué de nouveau', !texteDe(bloc()).includes('code-essai'));
        boutonCode()?.click();
        pas.afficher({ resultat: r, cases: {}, avis: null, code: 'code-essai' });
        v.vrai('nouvel affichage : masqué', !racine.textContent.includes('code-essai'));
        pas.afficher({ resultat: r, cases: {}, avis: null });
        v.egal('sans code donné à l\'écran : pas de bloc', bloc(), null);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N94',
    titre: 'NovaLCT à blanc pour chaque processeur (18b, spec § 3.1) : dans Apprendre, recherche (sans tenir compte des espaces, tirets et accents) et liste groupée par gamme de tous les processeurs NovaLCT, MCTRL660 par défaut ; « mctrl 4k » garde le MCTRL4K et le choisit, « Ouvrir à blanc » l\'envoie ; recherche sans résultat : message, choix inchangé ; cibles de 48 px, rien ne dépasse à 375 px',
    etape: '18b',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!ap || !nl) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ouvertures = [];
      try {
        const bp = baseProcesseurs(contexte);
        const liste = nl.processeursABlanc(bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)));
        const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {},
          novalct: { ouvrir: (choix) => ouvertures.push(choix), processeurs: liste } });
        await ecran.pret;
        const carte = racine.querySelector('.ap-novalct');
        const choix = carte?.querySelector('select[name="nl-processeur"]');
        const recherche = carte?.querySelector('input[type="search"]');
        v.egal('liste : une gamme par groupe, 34 processeurs, MCTRL660 choisi', [[...(choix?.querySelectorAll('optgroup') ?? [])].map((g) => g.label), choix?.options.length, choix?.value],
          [['MCTRL', 'MSD (cartes d\'envoi)', 'VX', 'VX Pro', 'NovaPro', 'Série H'], 34, 'novastar-mctrl660']);
        recherche.value = 'mctrl 4k';
        recherche.dispatchEvent(new Event('input', { bubbles: true }));
        v.egal('« mctrl 4k » : le MCTRL4K seul, choisi', [[...choix.options].map((o) => o.value), choix.value], [['novastar-mctrl4k'], 'novastar-mctrl4k']);
        [...carte.querySelectorAll('button')].find((b) => texteDe(b) === 'Ouvrir à blanc')?.click();
        v.egal('« Ouvrir à blanc » : MCTRL4K', ouvertures.at(-1), { processeur: 'novastar-mctrl4k', redondance: false });
        recherche.value = 'zzz';
        recherche.dispatchEvent(new Event('input', { bubbles: true }));
        v.egal('« zzz » : message, choix inchangé', [texteDe(carte.querySelector('.ap-novalct-aucun')), choix.value], ['Aucun processeur pour « zzz » : le choix ne change pas.', 'novastar-mctrl4k']);
        recherche.value = 'Vx-1000';
        recherche.dispatchEvent(new Event('input', { bubbles: true }));
        v.vrai('« Vx-1000 » : VX1000 et VX1000 Pro', ['novastar-vx1000', 'novastar-vx1000-pro'].every((id) => [...choix.options].some((o) => o.value === id)), [...choix.options].map((o) => o.value).join(', '));
        v.vrai('cibles de 48 px', [choix, recherche, ...carte.querySelectorAll('button')].every((x) => x.getBoundingClientRect().height >= 47.5));
        // Les options d'une liste ne sont pas dessinées dans la page : seuls les éléments affichés comptent.
        const dessines = [...carte.querySelectorAll('*')].filter((x) => (!x.closest('select') || x === choix) && x.getBoundingClientRect().width > 0);
        const bord = carte.getBoundingClientRect().right;
        v.egal('375 px : rien ne dépasse de la carte', dessines.filter((x) => x.getBoundingClientRect().right > bord + 0.5)
          .map((x) => `${x.tagName.toLowerCase()}${x.className ? `.${x.className}` : ''} ${Math.round(x.getBoundingClientRect().right - bord)} px`), []);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N95',
    titre: 'Config imposée dans Data (18c2, spec § 4.1) : bloc repliable « Ma config » dans le formulaire de Data, donc gardé avec les saisies du mur : nombre de ports imposé (clavier numérique, vide = conseil de l\'appli), « Passer en fibre », paire CVT310 (par défaut) ou CVT320 cachée tant qu\'elle ne sert pas, zone d\'état lue à voix haute ; à 375 px, en sombre et en mode rouge : cibles de 48 px, rien ne dépasse',
    etape: '18c2',
    async verifier(v) {
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const bloc = page.getElementById('form-data')?.querySelector('details#ma-config-data');
      v.vrai('bloc dans le formulaire de Data', Boolean(bloc));
      if (!bloc) return;
      v.egal('titre du bloc', texteDe(bloc.querySelector('summary')), 'Ma config : imposer un découpage');
      const ports = bloc.querySelector('input[name="portsImposes"]');
      v.egal('nombre de ports imposé', [ports?.getAttribute('inputmode'), texteDe(bloc.querySelector(`label[for="${ports?.id}"]`)), ports?.getAttribute('placeholder')],
        ['numeric', 'Nombre de ports imposé', 'conseil de l\'appli']);
      v.egal('passer en fibre', [bloc.querySelector('input[name="fibreImposee"]')?.type, texteDe(bloc.querySelector('input[name="fibreImposee"]')?.closest('label'))],
        ['checkbox', 'Passer en fibre (le convertisseur de la fiche du processeur)']);
      const paires = [...bloc.querySelectorAll('input[name="paireFibre"]')];
      v.egal('paire de convertisseurs : CVT310 par défaut, cachée', [paires.map((p) => [p.value, p.checked]), bloc.querySelector('#bloc-paire-fibre')?.hidden],
        [[['novastar-cvt310', true], ['novastar-cvt320', false]], true]);
      v.egal('zone d\'état', bloc.querySelector('#etat-ma-config-data')?.getAttribute('aria-live'), 'polite');
      await mesurerMaConfig(v, bloc, 'Data');
    },
  },
  {
    id: 'N96',
    titre: 'Config imposée dans Élec (18c2, spec § 4.2) : bloc repliable « Ma config » dans le formulaire d\'Élec, gardé avec les saisies du mur : nombre de lignes imposé (clavier numérique, vide = conseil de l\'appli), zone d\'état lue à voix haute ; à 375 px, en sombre et en mode rouge : cibles de 48 px, rien ne dépasse',
    etape: '18c2',
    async verifier(v) {
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const bloc = page.getElementById('form-elec')?.querySelector('details#ma-config-elec');
      v.vrai('bloc dans le formulaire d\'Élec', Boolean(bloc));
      if (!bloc) return;
      v.egal('titre du bloc', texteDe(bloc.querySelector('summary')), 'Ma config : imposer un découpage');
      const lignes = bloc.querySelector('input[name="lignesImposees"]');
      v.egal('nombre de lignes imposé', [lignes?.getAttribute('inputmode'), texteDe(bloc.querySelector(`label[for="${lignes?.id}"]`)), lignes?.getAttribute('placeholder')],
        ['numeric', 'Nombre de lignes imposé', 'conseil de l\'appli']);
      v.egal('zone d\'état', bloc.querySelector('#etat-ma-config-elec')?.getAttribute('aria-live'), 'polite');
      await mesurerMaConfig(v, bloc, 'Élec');
    },
  },
  {
    id: 'N97',
    titre: 'Config imposée dans le Schéma (18c2, spec § 4.4) : repère du départ en fibre, « MCTRL4K », « CVT4K au pied du mur », « fibre 50 m » ; paire de CVT310 du MCTRL660 de même ; sans fibre, la régie en cuivre comme avant ; SX40 : ses XD, comme avant',
    etape: '18c2',
    verifier(v, contexte) {
      const b = baseProcesseurs(contexte);
      const distributeurs = b.distributeurs.map((d) => calculs.resoudreFiche(d, b.sources));
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const m = calculs.mur(upad, 4, 4);
      const fibre = (procId) => {
        const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, procId), { frequenceHz: 60, bits: 8 });
        return { e, fibre: calculs.cablageData(m, upad, e, { distributeurs, imposee: { ports: 2, fibre: true } }).imposee.fibre };
      };
      const k4 = fibre('novastar-mctrl4k');
      v.egal('MCTRL4K en fibre', repereSchema('data', { evaluation: k4.e, distanceM: 50, fibre: k4.fibre }), { lignes: ['MCTRL4K', 'CVT4K au pied du mur', 'fibre 50 m'] });
      v.egal('MCTRL4K en cuivre', repereSchema('data', { evaluation: k4.e, distanceM: 50 }), { lignes: ['MCTRL4K', 'régie à 50 m'] });
      const m660 = fibre('novastar-mctrl660');
      v.egal('MCTRL660, paires de CVT310', repereSchema('data', { evaluation: m660.e, distanceM: 50, fibre: m660.fibre }), { lignes: ['MCTRL660', 'CVT310 au pied du mur', 'fibre 50 m'] });
      const bp2 = dalleDeBase(contexte, 'roe-bp2-v2');
      const mb = calculs.mur(bp2, 12, 6);
      const sx40 = calculs.evaluerProcesseur(mb, bp2, processeurDeBase(contexte, 'brompton-sx40'), { frequenceHz: 60, bits: 10 });
      const fsx = calculs.cablageData(mb, bp2, sx40, { distributeurs, imposee: { ports: 6, fibre: true } }).imposee.fibre;
      v.egal('SX40 : ses XD, comme avant', repereSchema('data', { evaluation: sx40, distanceM: 150, fibre: fsx }), { lignes: ['XD', 'fibre 150 m'] });
    },
  },
  {
    id: 'N98',
    titre: 'Fiche « Brancher l\'ordinateur au processeur » dans Apprendre (19a, spec § 3.2 et 3.5) : carte juste avant « NovaLCT à blanc », choix « Mon ordinateur » (Mac coché, Windows gardé par son action), autre système replié, marque du processeur de Data, champ des adresses en clavier décimal (virgules acceptées) et sa réponse, Copier et PDF ; cibles de 48 px (60 en grand affichage), rien ne dépasse à 375 px, texte à 4,5:1 en sombre et en rouge',
    etape: '19a',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const cx = await moduleAppli(v, '../src/ecran-connexion.js');
      if (!ap || !cx) return;
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const { mode, taille } = html.dataset;
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const gardes = [];
      const copies = [];
      let pdf = 0;
      try {
        const carte = () => cx.carteConnexion({
          systeme: 'mac', garderSysteme: (s) => gardes.push(s), marque: 'novastar', modele: 'novastar-mctrl4k', enLigne: () => false,
          copier: async (t) => { copies.push(t); return true; }, pdf: async () => { pdf += 1; return 'partage'; },
        });
        const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {},
          connexion: { carte }, novalct: { ouvrir: () => {}, processeurs: { groupes: [], defaut: 'novastar-mctrl660' } } });
        await ecran.pret;
        const c = racine.querySelector('.ap-connexion');
        v.egal('carte juste avant NovaLCT à blanc, titre', [c?.nextElementSibling?.classList.contains('ap-novalct'), texteDe(c?.querySelector('h3'))], [true, 'Brancher l\'ordinateur au processeur']);
        if (!c) return;
        const radio = (x) => c.querySelector(`input[name="cx-systeme"][value="${x}"]`);
        v.egal('Mac coché', [radio('mac')?.checked, radio('windows')?.checked], [true, false]);
        v.egal('marque de Data', c.querySelector('select[name="cx-marque"]')?.value, 'novastar');
        const autre = () => c.querySelector('details.cx-autre');
        v.vrai('chemin du Mac, Windows replié', texteDe(c.querySelector('.cx-etapes')).includes('Réglages Système') && texteDe(autre()?.querySelector('summary')) === 'Sur Windows' && !autre().open);
        v.vrai('réponse sans saisie : l\'exemple', texteDe(c.querySelector('.cx-reponse')).startsWith('Mets ton ordinateur en 192.168.0.100'), texteDe(c.querySelector('.cx-reponse')));
        const champ = c.querySelector('input[name="cx-adresses"]');
        v.egal('champ : clavier décimal, étiquette', [champ?.getAttribute('inputmode'), texteDe(c.querySelector(`label[for="${champ?.id}"]`))], ['decimal', 'Adresses des processeurs (lues sur leur écran)']);
        champ.value = '192,168,1,20';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        v.egal('réponse', texteDe(c.querySelector('.cx-reponse')), 'Mets ton ordinateur en 192.168.1.100, masque 255.255.255.0, passerelle vide.');
        radio('windows').click();
        v.egal('Windows gardé', gardes, ['windows']);
        v.vrai('chemin de Windows, Mac replié', texteDe(c.querySelector('.cx-etapes')).includes('Réseau & Internet') && texteDe(autre()?.querySelector('summary')) === 'Sur ton Mac');
        v.vrai('adresse saisie gardée', texteDe(c.querySelector('.cx-reponse')).includes('192.168.1.100'));
        boutonTexte(c, 'Copier')?.click();
        await attendre();
        v.vrai('Copier : le texte de la fiche', (copies[0] ?? '').startsWith('BRANCHER L\'ORDINATEUR AU PROCESSEUR') && copies[0].includes('Réseau & Internet'), copies[0]);
        boutonTexte(c, 'PDF')?.click();
        await attendre();
        v.egal('PDF', pdf, 1);
        c.querySelectorAll('details').forEach((d) => { d.open = true; });
        for (const [rouge, grand] of [[false, false], [true, false], [false, true]]) {
          if (rouge) html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          if (grand) html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const nom = `${rouge ? 'mode rouge' : 'sombre'}${grand ? ', grand affichage' : ''}`;
          const cible = grand ? 59.5 : 47.5;
          const cibles = [...c.querySelectorAll('button, select, input:not([type="radio"]), summary'), ...[...c.querySelectorAll('input[type="radio"]')].map((x) => x.closest('label'))];
          v.egal(`${nom} : cibles`, cibles.filter((x) => x.getBoundingClientRect().height < cible).map((x) => texteDe(x) || x.name), []);
          const bord = racine.getBoundingClientRect().right;
          v.egal(`${nom} : rien ne dépasse`, [...c.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5)
            .map((x) => `${x.tagName.toLowerCase()}.${x.className}`), []);
          const textes = [...c.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getBoundingClientRect().width > 0);
          v.egal(`${nom} : texte à 4,5:1`, textes.filter((x) => contraste(rgbVersHex(getComputedStyle(x).color), fondDe(x)) < 4.5).map((x) => texteDe(x).slice(0, 40)), []);
        }
      } finally {
        if (mode) html.dataset.mode = mode;
        else delete html.dataset.mode;
        if (taille) html.dataset.taille = taille;
        else delete html.dataset.taille;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N99',
    titre: 'Dépannage, T10.3 (19a, spec § 3.4) : sous la ligne 1 (« même plage d\'adresses IP »), le bloc de l\'appli « Comment faire sur ton Mac », marqué « Ajouté par l\'appli », avec l\'adresse à saisir selon la marque, le chemin du système, l\'autre système replié, le lien vers la fiche d\'Apprendre et ses propres sources ; rien dans les autres étapes ni dans la table des sources du Dépannage ; Windows choisi : « Comment faire sur Windows » ; 375 px, contrastes en sombre et en rouge, grand affichage',
    etape: '19a',
    async verifier(v, contexte) {
      const module = await moduleDepannage(v);
      const cx = await moduleAppli(v, '../src/ecran-connexion.js');
      if (!module || !cx) return;
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const { mode, taille } = html.dataset;
      const fiches = [];
      const choix = { systeme: 'mac' };
      const ajouts = { 'T10.3:1': () => cx.blocDepannage({ systeme: choix.systeme, marque: 'brompton', ouvrirFiche: () => fiches.push('connexion'), enLigne: () => false }) };
      const { racine, ecran, retirer: enlever } = monterDepannage(module, contexte.depannage, { projet: { marque: 'brompton', nom: 'S8' }, enLigne: () => false, ajouts });
      try {
        ecran.afficher('T10.3');
        const bloc = racine.querySelector('.cx-depannage');
        v.egal('bloc dans l\'étape 1, après sa ligne', [texteDe(bloc?.closest('.element-numerote')?.querySelector('.numero-liste')),
          bloc?.previousElementSibling?.matches('.dep-ligne') ?? false], ['1.', true]);
        if (!bloc) return;
        v.egal('marqué, titre', [texteDe(bloc.querySelector('.cx-ajout')), texteDe(bloc.querySelector('h3'))], ['Ajouté par l\'appli', 'Comment faire sur ton Mac']);
        v.vrai('adresse Brompton', texteDe(bloc).includes('192.168.0.100') && texteDe(bloc).includes('192.168.0.50'), texteDe(bloc));
        v.vrai('chemin du Mac, Windows replié', texteDe(bloc).includes('Réglages Système') && texteDe(bloc.querySelector('details > summary')) === 'Sur Windows' && !bloc.querySelector('details').open);
        v.vrai('sources du bloc', texteDe(bloc.querySelector('.cx-sources')).includes('Aide Apple'), texteDe(bloc.querySelector('.cx-sources')));
        boutonTexte(bloc, 'Fiche Brancher l\'ordinateur')?.click();
        v.egal('lien vers la fiche', fiches, ['connexion']);
        bloc.querySelectorAll('details').forEach((d) => { d.open = true; });
        for (const [rouge, grand] of [[false, false], [true, false], [false, true]]) {
          if (rouge) html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          if (grand) html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const nom = `${rouge ? 'mode rouge' : 'sombre'}${grand ? ', grand affichage' : ''}`;
          const bord = racine.getBoundingClientRect().right;
          v.egal(`${nom} : rien ne dépasse`, [...bloc.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5)
            .map((x) => `${x.tagName.toLowerCase()}.${x.className}`), []);
          const textes = [...bloc.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getBoundingClientRect().width > 0);
          v.egal(`${nom} : texte à 4,5:1`, textes.filter((x) => contraste(rgbVersHex(getComputedStyle(x).color), fondDe(x)) < 4.5).map((x) => texteDe(x).slice(0, 40)), []);
          v.egal(`${nom} : cibles`, [...bloc.querySelectorAll('summary, button')].filter((x) => x.getBoundingClientRect().height < (grand ? 59.5 : 47.5)).map(texteDe), []);
          if (grand) v.egal('grand affichage : texte à 19 px', textes.filter((x) => parseFloat(getComputedStyle(x).fontSize) < 18.5).map((x) => texteDe(x).slice(0, 40)), []);
        }
        delete html.dataset.mode;
        delete html.dataset.taille;
        ecran.afficher('T10.2');
        v.egal('autre étape : rien', racine.querySelector('.cx-depannage'), null);
        ecran.sources();
        v.vrai('table des sources du Dépannage inchangée', racine.querySelectorAll('.dep-source-entree').length === contexte.depannage.sources.length && !texteDe(racine).includes('Aide Apple'));
        choix.systeme = 'windows';
        ecran.afficher('T10.3');
        v.egal('Windows choisi', texteDe(racine.querySelector('.cx-depannage h3')), 'Comment faire sur Windows');
      } finally {
        if (mode) html.dataset.mode = mode;
        else delete html.dataset.mode;
        if (taille) html.dataset.taille = taille;
        else delete html.dataset.taille;
        enlever();
        retirer();
      }
    },
  },
  {
    id: 'N100',
    titre: 'Pas à pas NovaLCT sur Mac (19a, spec § 3.3) : étape 0.1 « À vérifier chez toi, avant ta première presta » ; étape 0.3 avec le chemin du Mac replié, Windows replié à part et « Fiche Brancher l\'ordinateur » qui appelle son action, cibles de 48 px ; sans choix d\'ordinateur, l\'étape 0.1 sans badge',
    etape: '19a',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const ouvertures = [];
      try {
        const m = calculs.mur(DALLE_CAS_13, 12, 6);
        const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8 });
        const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
        const pasAPas = (options) => nl.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null, ...options });
        const pas = en.monterNovaLCT(racine, { actions: { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null, ouvrirConnexion: () => ouvertures.push('connexion') } });
        pas.afficher({ resultat: pasAPas({ systeme: 'mac' }), cases: {}, avis: null });
        const carte = (id) => racine.querySelector(`.nl-etape[data-etape="${id}"]`);
        v.egal('0.1 : à vérifier chez toi', texteDe(carte('0.1')?.querySelector('.nl-a-verifier')), 'À vérifier chez toi, avant ta première presta');
        const c03 = carte('0.3');
        const chemins = [...(c03?.querySelectorAll('details.nl-chemin') ?? [])];
        v.egal('0.3 : deux chemins repliés, le Mac d\'abord', chemins.map((d) => [texteDe(d.querySelector('summary')), d.open]), [['Sur ton Mac : le chemin', false], ['Sur Windows', false]]);
        v.vrai('chemin du Mac', texteDe(chemins[0]).includes('Configurer IPv4 : Manuellement'), texteDe(chemins[0]));
        boutonTexte(c03, 'Fiche Brancher l\'ordinateur')?.click();
        v.egal('lien vers la fiche', ouvertures, ['connexion']);
        chemins.forEach((d) => { d.open = true; });
        v.egal('cibles de 48 px', [...(c03?.querySelectorAll('summary, button') ?? [])].filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe), []);
        pas.afficher({ resultat: pasAPas({}), cases: {}, avis: null });
        v.egal('sans choix : 0.1 sans badge', carte('0.1')?.querySelector('.nl-a-verifier'), null);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N101',
    titre: 'Chaîne dans le Schéma, cadres (19b2, spec § 4.3) : un cadre par processeur sur le bord de départ, plus loin du mur que les départs et au droit de ses départs ; appareils au pied du mur (CVT4K, XD 1, XD miroir 1, paires de CVT310, transceivers) entre les départs et le processeur, au droit de leurs ports ; sans appareil « régie à 20 m » ; accroche, câblage par rangées et mur en zones ; au-delà de 6 processeurs, un seul cadre au coin (repère « 7 × MCTRL660 »)',
    etape: '19b2',
    verifier(v, contexte) {
      try {
        const noms = (x) => cadresChaine(x.svg).map((c) => [c.role, c.nom]);
        // 1. Cuivre seul : le processeur et la distance de la régie, sous le mur en stack, au-dessus en accroche.
        const cuivre = chaineDessinee(contexte, { distanceM: 20 });
        v.egal('cuivre : un cadre, le processeur et la régie', cadresChaine(cuivre.svg).map((c) => [c.role, c.lignes]), [['processeur', ['MCTRL4K', 'régie à 20 m']]]);
        v.egal('cuivre : plus de repère au coin', cuivre.svg.querySelectorAll('.repere').length, 0);
        v.egal('cuivre : le chemin des câbles de tête', cuivre.svg.querySelectorAll('.chaine .chemin-tete').length, 1);
        const deps = (x, filtre = () => true) => [...departsDe(x.svg)].filter(([cle]) => filtre(cle)).map(([, c]) => c);
        const [p] = cadresChaine(cuivre.svg);
        v.vrai('stack : le cadre sous le mur, plus loin que les départs', p.y > cuivre.geo.hauteur && p.y > Math.max(...deps(cuivre).map((c) => c.cy + c.r)));
        v.vrai('au droit de ses départs', auDroit(p, deps(cuivre), 'colonnes'));
        const accroche = chaineDessinee(contexte, { distanceM: 20, coin: 'haut-droite' });
        const [pa] = cadresChaine(accroche.svg);
        v.vrai('accroche : le cadre au-dessus du mur, plus loin que les départs', pa && pa.y + pa.h < 0 && pa.y + pa.h < Math.min(...deps(accroche).map((c) => c.cy - c.r)));
        // 2. Deux processeurs : un cadre chacun, au droit de ses ports, sans se toucher.
        const deux = chaineDessinee(contexte, { procId: 'novastar-mctrl660', colonnes: 18, distanceM: 20 });
        const [c1, c2] = cadresChaine(deux.svg);
        v.egal('deux processeurs : un cadre chacun', noms(deux), [['processeur', 'MCTRL660 n° 1'], ['processeur', 'MCTRL660 n° 2']]);
        v.vrai('chacun au droit de ses départs, sans se toucher', c1 && c2 && auDroit(c1, deps(deux, (k) => k.startsWith('p1-')), 'colonnes')
          && auDroit(c2, deps(deux, (k) => k.startsWith('p2-')), 'colonnes') && !chevauchent(c1, c2));
        // 3. Appareils au pied du mur : entre les départs et le processeur.
        const k4 = chaineDessinee(contexte, { imposee: { ports: 2, fibre: true } });
        v.egal('cas 17 en fibre : le CVT4K, puis le MCTRL4K', noms(k4), [['appareil', 'CVT4K'], ['processeur', 'MCTRL4K']]);
        const [cvt, mctrl] = cadresChaine(k4.svg);
        v.vrai('CVT4K plus loin que les départs, MCTRL4K plus loin que le CVT4K', cvt && mctrl && cvt.y > Math.max(...deps(k4).map((c) => c.cy + c.r)) && mctrl.y > cvt.y + cvt.h);
        v.egal('le MCTRL4K sans la régie (la fibre la dit)', mctrl?.lignes, ['MCTRL4K']);
        const sx = chaineDessinee(contexte, { dalleId: 'roe-bp2-v2', procId: 'brompton-sx40', colonnes: 22, rangees: 6, reglages: { bits: 12 } });
        v.egal('SX40 : 3 XD et le SX40', noms(sx), [['appareil', 'XD 1'], ['appareil', 'XD 2'], ['appareil', 'XD 3'], ['processeur', 'SX40']]);
        const xd = cadresChaine(sx.svg).filter((c) => c.role === 'appareil');
        const portsXd = (k) => (cle) => Math.ceil(Number(cle.split('-')[1]) / 10) === k;
        v.vrai('chaque XD au droit de ses ports', xd.length === 3 && xd.every((c, i) => auDroit(c, deps(sx, portsXd(i + 1)), 'colonnes')));
        const red = chaineDessinee(contexte, { dalleId: 'roe-bp2-v2', procId: 'brompton-sx40', colonnes: 20, rangees: 6, reglages: { bits: 12, redondance: true } });
        const tous = cadresChaine(red.svg);
        const de = (nom) => tous.find((c) => c.nom === nom);
        v.egal('SX40 en redondance : XD et XD miroirs', tous.filter((c) => c.role === 'appareil').map((c) => c.nom).sort(), ['XD 1', 'XD 2', 'XD miroir 1', 'XD miroir 2']);
        v.vrai('chaque XD miroir à côté de son XD, sur la même rangée', ['1', '2'].every((k) => de(`XD miroir ${k}`) && de(`XD ${k}`)
          && Math.abs(de(`XD miroir ${k}`).cy - de(`XD ${k}`).cy) < 1e-6
          && Math.abs(de(`XD miroir ${k}`).cx - de(`XD ${k}`).cx) < Math.abs(de(`XD miroir ${k}`).cx - de(`XD ${k === '1' ? '2' : '1'}`).cx)));
        const m660 = chaineDessinee(contexte, { procId: 'novastar-mctrl660', imposee: { ports: 2, fibre: true } });
        v.egal('MCTRL660 en fibre : ses paires de CVT310', noms(m660), [['appareil', '2 paires de CVT310'], ['processeur', 'MCTRL660']]);
        const s8 = chaineDessinee(contexte, { dalleId: 'roe-bp2-v2', procId: 'brompton-s8', colonnes: 6, rangees: 4, reglages: { bits: 12, redondance: true }, imposee: { ports: 3, fibre: true } });
        v.egal('S8 en fibre : ses transceivers', noms(s8), [['appareil', '6 paires de transceivers fibre'], ['processeur', 'S8']]);
        // 4. Câblage par rangées : à côté du mur, au droit des départs.
        const rangees = chaineDessinee(contexte, { mode: 'rangees', distanceM: 20 });
        const [pr] = cadresChaine(rangees.svg);
        v.vrai('par rangées : le cadre à gauche du mur, plus loin que les départs', pr && pr.x + pr.w < 0 && pr.x + pr.w < Math.min(...deps(rangees).map((c) => c.cx - c.r)));
        v.vrai('par rangées : au droit des départs', pr && auDroit(pr, deps(rangees), 'rangees'));
        // 5. Mur en zones : un cadre par processeur, sur le bord de départ du dessin.
        const zones = chaineDessinee(contexte, { procId: 'novastar-mctrl660', zones: [{ nom: 'A', colonnes: 4, rangees: 6 }, { nom: 'B', colonnes: 3, rangees: 6 }] });
        const cz = cadresChaine(zones.svg);
        v.vrai(`mur en zones : un cadre par processeur (${zones.e.nombre})`, cz.length === zones.e.nombre && cz.every((c) => c.role === 'processeur' && c.y > zones.geo.hauteur));
        // 6. Au-delà de 6 processeurs : un seul cadre, le repère du coin.
        const sept = chaineDessinee(contexte, { procId: 'novastar-mctrl660', colonnes: 48, rangees: 8, distanceM: 20 });
        v.egal('7 MCTRL660 : pas de cadre par processeur', [sept.e.nombre, sept.g, cadresChaine(sept.svg).length], [7, null, 0]);
        v.egal('7 MCTRL660 : un seul cadre au coin', dessinSchema.repereChaine?.(sept.chaine.aval[0]), { lignes: ['7 × MCTRL660', 'régie à 20 m'] });
        const sx7 = { ...sx.chaine.aval[0], nom: '7 × SX40', nombre: 7, appareils: [{ nom: '21 XD' }], liaison: { texte: '21 fibres (une par XD), 50 m' } };
        v.egal('regroupé avec appareils : nom, appareils, liaison', dessinSchema.repereChaine?.(sx7), { lignes: ['7 × SX40', '21 XD au pied du mur', '21 fibres (une par XD), 50 m'] });
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N102',
    titre: 'Chaîne dans le Schéma, liaisons (19b2, spec § 4.3, choix b à d) : fibre en tirets longs, couleur des contours, du processeur à chaque appareil, avec une étiquette par processeur plus loin que son cadre (« fibre OPT1, 50 m », fibres de secours dans l\'étiquette) ; cuivre 10G du SX40 en trait plein ; câbles de tête partis de l\'appareil, couleur du port ; retours de secours reliés au XD miroir ; cuivre direct : le chemin des câbles de tête',
    etape: '19b2',
    verifier(v, contexte) {
      try {
        const liaisons = (x) => [...x.svg.querySelectorAll('.liaison-chaine')];
        const etiquettes = (x) => [...x.svg.querySelectorAll('.etiquette-liaison')].map((t) => t.dataset.texte);
        const bouts = (l) => sommets(l).filter((_, i, liste) => i === 0 || i === liste.length - 1);
        const surBord = (pt, c) => pt[0] >= c.x - 1e-6 && pt[0] <= c.x + c.w + 1e-6 && pt[1] >= c.y - 1e-6 && pt[1] <= c.y + c.h + 1e-6;
        const relie = (l, a, b) => { const [u, w] = bouts(l); return (surBord(u, a) && surBord(w, b)) || (surBord(u, b) && surBord(w, a)); };
        const k4 = chaineDessinee(contexte, { imposee: { ports: 2, fibre: true } });
        const [cvt, mctrl] = cadresChaine(k4.svg);
        const [fibre] = liaisons(k4);
        v.vrai('cas 17 : une fibre du MCTRL4K au CVT4K', liaisons(k4).length === 1 && fibre.classList.contains('fibre') && relie(fibre, cvt, mctrl));
        const [tiret, blanc] = (fibre?.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).map(Number);
        v.vrai('fibre en tirets longs (3 fois le trait au moins), couleur des contours', tiret >= 3 * Number(fibre?.getAttribute('stroke-width')) && blanc > 0
          && fibre?.style.stroke === PALETTE_EXPORT.contour.replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
        v.egal('cas 17 : étiquette', etiquettes(k4), ['fibre OPT1, 50 m']);
        const lab = k4.svg.querySelector('.etiquette-liaison')?.getBBox();
        v.vrai('étiquette plus loin du mur que le cadre du processeur', lab && lab.y > mctrl.y + mctrl.h);
        const red = chaineDessinee(contexte, { reglages: { redondance: true }, imposee: { ports: 2, fibre: true } });
        v.egal('redondance Novastar : une fibre dessinée, les secours dans l\'étiquette', [liaisons(red).length, etiquettes(red)], [1, ['fibres OPT1 et OPT2, OPT3 et OPT4 en secours, 50 m']]);
        v.egal('redondance Novastar : bouts de secours non reliés', red.svg.querySelectorAll('.depuis-appareil.secours').length, 0);
        const xsx = { dalleId: 'roe-bp2-v2', procId: 'brompton-sx40', colonnes: 22, rangees: 6, reglages: { bits: 12 } };
        const sx = chaineDessinee(contexte, xsx);
        const cs = cadresChaine(sx.svg);
        const proc = cs.find((c) => c.role === 'processeur');
        v.vrai('SX40 : une fibre vers chaque XD', liaisons(sx).length === 3 && cs.filter((c) => c.role === 'appareil').every((a) => liaisons(sx).some((l) => l.classList.contains('fibre') && relie(l, a, proc))));
        v.egal('SX40 : une étiquette', etiquettes(sx), ['3 fibres (une par XD), 50 m']);
        const cu = chaineDessinee(contexte, { ...xsx, reseau: { cuivre10G: { categorie: 'Cat6A', longueurM: 40 } } });
        v.vrai('cuivre 10G : trait plein', liaisons(cu).length === 3 && liaisons(cu).every((l) => l.classList.contains('cuivre-10g') && !l.getAttribute('stroke-dasharray')));
        v.egal('cuivre 10G : étiquette', etiquettes(cu), ['3 câbles cuivre 10G Cat6A (un par XD), 40 m']);
        // Câbles de tête : de l'appareil au départ, couleur du port.
        const xdDe = (cle) => cs.find((c) => c.nom === `XD ${Math.ceil(Number(cle.split('-')[1]) / 10)}`);
        const fautes = [...sx.svg.querySelectorAll('[data-trajet]')].filter((g) => {
          const lignes = [...g.querySelectorAll('.depuis-appareil')];
          const dep = g.querySelector('.depart');
          const [u, w] = lignes[0] ? bouts(lignes[0]) : [[NaN, NaN], [NaN, NaN]];
          return lignes.length !== 1 || !surBord(u, xdDe(g.dataset.trajet)) || Math.hypot(w[0] - Number(dep.getAttribute('cx')), w[1] - Number(dep.getAttribute('cy'))) > 1e-6
            || lignes[0].style.stroke !== g.querySelector('polyline.trajet').style.stroke;
        }).map((g) => g.dataset.trajet);
        v.egal('SX40 : chaque câble de tête part de son XD, couleur du port', fautes, []);
        const sr = chaineDessinee(contexte, { dalleId: 'roe-bp2-v2', procId: 'brompton-sx40', colonnes: 20, rangees: 6, reglages: { bits: 12, redondance: true } });
        const csr = cadresChaine(sr.svg);
        const secoursFautes = [...sr.svg.querySelectorAll('[data-trajet]')].filter((g) => {
          const l = g.querySelector('.depuis-appareil.secours');
          const b = g.querySelector('.bout-secours');
          if (!l || !b) return true;
          const [u, w] = bouts(l);
          const miroir = csr.find((c) => c.nom === `XD miroir ${Math.ceil(Number(g.dataset.trajet.split('-')[1]) / 10)}`);
          return !surBord(u, miroir) || Math.hypot(w[0] - Number(b.getAttribute('cx')), w[1] - Number(b.getAttribute('cy'))) > 1e-6;
        }).map((g) => g.dataset.trajet);
        v.egal('SX40 en redondance : chaque retour de secours relié à son XD miroir', secoursFautes, []);
        const cuivre = chaineDessinee(contexte, { distanceM: 20 });
        v.egal('cuivre direct : ni fibre ni câble depuis un appareil, le chemin des câbles de tête', [liaisons(cuivre).length, cuivre.svg.querySelectorAll('.depuis-appareil').length,
          cuivre.svg.querySelectorAll('.chaine .chemin-tete').length], [0, 0, 1]);
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N103',
    titre: 'Chaîne dans le Schéma, lisibilité (19b2, spec § 4.3, comme N7) : aucun nom de dalle, rond de départ, bout de secours ni numéro sous un cadre ou une étiquette de la chaîne ; cadres et étiquettes sans se toucher, hors du mur, dans le dessin ; aucune liaison ni câble de tête sur un autre cadre ; vue physique, vue pixels, grand affichage, accroche, rangées et dessin simplifié',
    etape: '19b2',
    verifier(v, contexte) {
      const bp2 = { dalleId: 'roe-bp2-v2', reglages: { bits: 12 } };
      const murs = [
        ['2 × MCTRL660 en cuivre', { procId: 'novastar-mctrl660', colonnes: 18, distanceM: 20 }],
        ['cas 17 en fibre', { imposee: { ports: 2, fibre: true } }],
        ['MCTRL4K en redondance, fibre', { reglages: { redondance: true }, imposee: { ports: 2, fibre: true } }],
        ['SX40 et 3 XD', { ...bp2, procId: 'brompton-sx40', colonnes: 22, rangees: 6 }],
        ['SX40 en redondance', { ...bp2, procId: 'brompton-sx40', colonnes: 20, rangees: 6, reglages: { bits: 12, redondance: true } }],
        ['S8 et transceivers', { ...bp2, procId: 'brompton-s8', colonnes: 6, rangees: 4, reglages: { bits: 12, redondance: true }, imposee: { ports: 3, fibre: true } }],
        ['MCTRL660 et CVT310', { procId: 'novastar-mctrl660', imposee: { ports: 2, fibre: true } }],
        ['par rangées', { mode: 'rangees', distanceM: 20 }],
      ];
      const essais = [];
      for (const [nom, o] of murs) {
        for (const coin of ['bas-gauche', 'haut-droite']) {
          for (const vue of ['physique', 'pixels']) {
            for (const grand of [false, true]) essais.push([`${nom}, ${coin}, ${vue}${grand ? ', grand' : ''}`, { ...o, coin, vue, grand }]);
          }
        }
      }
      essais.push(['SX40 et 3 XD, dessin simplifié', { ...murs[3][1], simplifie: true }], ['cas 17, dessin simplifié', { ...murs[1][1], simplifie: true }]);
      const fautes = [];
      try {
        for (const [nom, o] of essais) {
          const x = chaineDessinee(contexte, o);
          const cadres = cadresChaine(x.svg);
          if (!cadres.length) { fautes.push(`${nom} : aucun cadre`); x.svg.remove(); continue; }
          const etiquettes = [...x.svg.querySelectorAll('.etiquette-liaison')].map((t) => t.getBBox());
          const obstacles = [...cadres, ...etiquettes];
          const boite = (c) => ({ x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r });
          const proteges = [
            ...[...x.svg.querySelectorAll('.etiquette-dalle, .numero-sur-trajet rect, .numero-trajet, .numero-secours')].map((t) => (t.tagName === 'rect' ? boiteRect(t) : bb(t.getBBox()))),
            ...disquesDe(x.svg, '.depart, .bout-secours').map(boite),
          ];
          obstacles.forEach((a, i) => obstacles.slice(i + 1).forEach((b) => { if (chevauchent(bb(a), bb(b))) fautes.push(`${nom} : deux éléments de la chaîne se touchent`); }));
          if (obstacles.some((a) => proteges.some((p) => chevauchent(bb(a), p)))) fautes.push(`${nom} : un numéro ou un nom sous la chaîne`);
          if (cadres.some((c) => chevauchent(c, { x: 0, y: 0, w: x.geo.largeur, h: x.geo.hauteur }))) fautes.push(`${nom} : un cadre sur le mur`);
          const [vx, vy, vw, vh] = x.svg.getAttribute('viewBox').split(/\s+/).map(Number);
          if (obstacles.some((a) => { const b = bb(a); return b.x < vx || b.y < vy || b.x + b.w > vx + vw || b.y + b.h > vy + vh; })) fautes.push(`${nom} : hors du dessin`);
          // Liaisons et câbles de tête : jamais sur un autre cadre ni sur une étiquette (bouts exclus) ; un câble de tête
          // ne passe sur aucun rond de départ ni bout de secours, sauf le sien au bout.
          const ronds = [...x.svg.querySelectorAll('.depart, .bout-secours')].map((c) => ({ ...disquesDe(c.parentNode, `.${c.getAttribute('class')}`)[0], g: c.parentNode }));
          for (const l of x.svg.querySelectorAll('.liaison-chaine, .depuis-appareil')) {
            const s = sommets(l);
            const points = s.slice(1).flatMap(([x2, y2], k) => {
              const [x1, y1] = s[k];
              return Array.from({ length: 19 }, (_, i) => [x1 + ((x2 - x1) * (i + 1)) / 20, y1 + ((y2 - y1) * (i + 1)) / 20]);
            }).slice(0, -1);
            const touche = obstacles.filter((a) => { const b = bb(a); return points.some(([px, py]) => px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h); });
            if (touche.length) fautes.push(`${nom} : un trait passe sur un cadre ou une étiquette (${l.getAttribute('class')})`);
            if (l.classList.contains('depuis-appareil')) {
              const fin = s[s.length - 1];
              // Les ronds des autres ports (le bout de secours de son propre port, posé sur son câble, reste au-dessus).
              const autres = ronds.filter((c) => c.g !== l.parentNode);
              if (points.some(([px, py]) => autres.some((c) => Math.hypot(px - c.cx, py - c.cy) < c.r))) fautes.push(`${nom} : un câble de tête passe sur un autre rond`);
            }
          }
          x.svg.remove();
        }
        v.egal(`${essais.length} dessins : chaîne lisible`, [...new Set(fautes)], []);
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N104',
    titre: 'Chaîne dans le Schéma, contrastes (19b2, spec § 4.3, comme N11) : trait de la fibre et du cuivre (couleur des contours) à 3:1 au moins sur le fond hors du mur, textes des cadres et des étiquettes à 4,5:1, en sombre, en mode rouge et à l\'export ; le dessin prend ces couleurs',
    etape: '19b2',
    async verifier(v, contexte) {
      const jetons = await jetonsStyles();
      for (const [theme, j] of [['sombre', jetons.sombre], ['rouge', jetons.rouge]]) {
        v.vrai(`${theme} : liaisons à 3:1 sur le fond (${contraste(j['--trait-schema'], j['--fond']).toFixed(2)})`, contraste(j['--trait-schema'], j['--fond']) >= 3);
        v.vrai(`${theme} : textes de la chaîne à 4,5:1 sur le fond (${contraste(j['--texte'], j['--fond']).toFixed(2)})`, contraste(j['--texte'], j['--fond']) >= 4.5);
      }
      v.vrai('export : liaisons à 3:1 sur le blanc', contraste(PALETTE_EXPORT.contour, PALETTE_EXPORT.fond) >= 3);
      v.vrai('export : textes à 4,5:1 sur le blanc', contraste(PALETTE_EXPORT.texte, PALETTE_EXPORT.fond) >= 4.5);
      try {
        const x = chaineDessinee(contexte, { imposee: { ports: 2, fibre: true }, palette: PALETTE_ECRAN });
        const styles = [...x.svg.querySelectorAll('.cadre-chaine rect, .cadre-chaine text, .liaison-chaine, .etiquette-liaison')].map((e) => e.getAttribute('style'));
        v.egal('écran : cadres sur le fond, textes en couleur du texte, liaisons en couleur des contours', [...new Set(styles)].sort(),
          ['fill: none; stroke: var(--trait-schema)', 'fill: var(--fond); stroke: var(--trait-schema)', 'fill: var(--texte)'].sort());
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N105',
    titre: 'Chaîne dans le Schéma, export (19b2, spec § 4.3) : cadre complet agrandi du côté du départ seulement, de ce qu\'il faut, pour contenir la chaîne ; l\'image de 2000 px suit ce cadre ; sans chaîne, le cadre d\'avant',
    etape: '19b2',
    async verifier(v, contexte) {
      try {
        for (const [nom, o] of [['cas 17, stack', { imposee: { ports: 2, fibre: true } }], ['cas 17, accroche', { imposee: { ports: 2, fibre: true }, coin: 'haut-droite' }],
          ['SX40, stack', { dalleId: 'roe-bp2-v2', procId: 'brompton-sx40', colonnes: 22, rangees: 6, reglages: { bits: 12 } }]]) {
          const x = chaineDessinee(contexte, o);
          const base = dessinSchema.cadreComplet(x.geo);
          const avec = dessinSchema.cadreComplet(x.geo, x.g);
          const obstacles = [...cadresChaine(x.svg), ...[...x.svg.querySelectorAll('.etiquette-liaison')].map((t) => bb(t.getBBox()))];
          const enHaut = (o.coin ?? 'bas-gauche').startsWith('haut');
          const cote = Math.min(...[...x.geo.rects.values()].map((r) => Math.min(r.w, r.h)));
          const bord = enHaut ? avec.y : avec.y + avec.h;
          const loin = enHaut ? Math.min(...obstacles.map((b) => b.y)) : Math.max(...obstacles.map((b) => b.y + b.h));
          v.vrai(`${nom} : le côté opposé au départ ne bouge pas`, enHaut ? Math.abs(avec.y + avec.h - (base.y + base.h)) < 1e-6 : Math.abs(avec.y - base.y) < 1e-6);
          v.vrai(`${nom} : la chaîne dans le cadre, marge de 0,25 dalle au plus au-delà`, obstacles.length > 0 && obstacles.every((b) => b.x >= avec.x && b.x + b.w <= avec.x + avec.w
            && b.y >= avec.y && b.y + b.h <= avec.y + avec.h) && (avec.h === base.h || Math.abs(bord - loin) <= cote * 0.25 + 1e-6));
          v.egal(`${nom} : image de 2000 px sur ce cadre`, [x.svg.getAttribute('viewBox'), Number(x.svg.getAttribute('height'))],
            [`${avec.x} ${avec.y} ${avec.w} ${avec.h}`, Math.round((2000 * avec.h) / avec.w)]);
          if (nom === 'SX40, stack') {
            const png = await decoder(await schemaEnPng(x.svg, { largeurPx: 2000, titre: 'Mur LED', lignes: [] }));
            v.vrai(`${nom} : PNG de 2000 px, plus haut que le dessin`, png.width === 2000 && png.height >= Math.round((2000 * avec.h) / avec.w));
          }
          x.svg.remove();
        }
        const geo = chaineDessinee(contexte, {}).geo;
        v.egal('sans chaîne : le cadre d\'avant', dessinSchema.cadreComplet(geo, null), dessinSchema.cadreComplet(geo));
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N106',
    titre: 'Bande « Chaîne » du Schéma (19b3, spec § 4.4) : liste ordonnée lue comme une liste (nœuds et liaisons de gauche à droite, flèches cachées aux lecteurs d\'écran), régie en tête avec sa sortie, source conseillée signalée, lien « Modifier dans Canvas » de 48 px au bout ; sans chaîne de Canvas, les processeurs et « Chaîne à régler dans Canvas. »',
    etape: '19b3',
    async verifier(v, contexte) {
      if (!dessinSchema.bandeChaine) { v.vrai('bandeChaine exportée par dessin-schema.js', false); return; }
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      try {
        const monter = (amont) => { racine.replaceChildren(dessinSchema.bandeChaine(amont)); return racine.firstElementChild; };
        const lus = (b) => [...b.querySelectorAll('ol > li')].map((li) => {
          const copie = li.cloneNode(true);
          copie.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
          return texteDe(copie);
        });
        const convertisseurs = [{ nom: 'Convertisseur A', liaison: '12g-sdi', longueurM: 80 }];
        const b = monter(amontEssai(contexte, { convertisseurs }));
        const liste = b.querySelector('ol');
        v.vrai('une liste ordonnée nommée « Chaîne »', liste && /^Chaîne/.test(liste.getAttribute('aria-label') ?? ''), liste?.getAttribute('aria-label'));
        v.egal('nœuds et liaisons dans l\'ordre', lus(b), ['Source 3840 × 2160 60 Hz', 'HDMI 2.0, 5 m', 'Convertisseur A', '12G-SDI, 80 m', 'MCTRL4K']);
        v.egal('liaisons : une flèche cachée aux lecteurs d\'écran', [...b.querySelectorAll('ol > li.bc-lien')].map((li) => li.querySelector('[aria-hidden="true"]')?.textContent), ['→', '→']);
        const lien = b.querySelector('a.bc-modifier');
        v.egal('lien vers Canvas au bout', [texteDe(lien), lien?.getAttribute('href'), b.lastElementChild === lien], ['Modifier dans Canvas', '#canvas', true]);
        v.vrai('lien de 48 px', lien && lien.getBoundingClientRect().height >= 47.5, String(lien?.getBoundingClientRect().height));
        const regie = regieDeBase(contexte, 'barco-e2-gen2');
        const br = monter(amontEssai(contexte, { regie }));
        v.vrai('régie en tête, avec sa sortie', lus(br)[0].startsWith(`Régie ${regie.nom} (sa source n'est pas saisie)`) && lus(br)[0].includes('sortie 3840 × 2160, 60 Hz'), lus(br)[0]);
        v.egal('source conseillée signalée', lus(monter(amontEssai(contexte, { conseillee: true })))[0], 'Source 3840 × 2160 60 Hz, source conseillée (Canvas)');
        const sans = monter(amontEssai(contexte, { sansChaine: true }));
        v.egal('sans chaîne de Canvas : les processeurs et la note', [lus(sans), texteDe(sans.querySelector('.bc-note')), texteDe(sans.querySelector('a.bc-modifier'))],
          [['MCTRL4K'], 'Chaîne à régler dans Canvas.', 'Modifier dans Canvas']);
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N107',
    titre: 'Bande « Chaîne » à 375 px (19b3, spec § 4.4) : une longue chaîne (régie, trois convertisseurs) passe à la ligne sans défilement de côté, en normal et en grand affichage ; textes à 4,5:1 sur leur fond réel, en sombre et en mode rouge',
    etape: '19b3',
    async verifier(v, contexte) {
      if (!dessinSchema.bandeChaine) { v.vrai('bandeChaine exportée par dessin-schema.js', false); return; }
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:343px' });
      document.body.append(racine);
      const html = document.documentElement;
      const avant = { taille: html.dataset.taille, mode: html.dataset.mode };
      try {
        const convertisseurs = [1, 2, 3].map((k) => ({ nom: `Convertisseur fibre ${k}`, liaison: '12g-sdi', longueurM: 80 * k }));
        racine.append(dessinSchema.bandeChaine(amontEssai(contexte, { regie: regieDeBase(contexte, 'barco-e2-gen2'), convertisseurs })));
        const b = racine.firstElementChild;
        for (const taille of ['normal', 'grand']) {
          if (taille === 'grand') html.dataset.taille = 'grand'; else delete html.dataset.taille;
          const cadre = racine.getBoundingClientRect();
          const items = [...b.querySelectorAll('ol > li, a.bc-modifier')];
          v.vrai(`${taille} : pas de défilement de côté`, b.scrollWidth <= b.clientWidth + 1 && items.every((x) => x.getBoundingClientRect().right <= cadre.right + 0.5),
            `${b.scrollWidth} > ${b.clientWidth}`);
          v.vrai(`${taille} : la bande passe à la ligne`, new Set(items.map((x) => Math.round(x.getBoundingClientRect().top))).size >= 2);
        }
        delete html.dataset.taille;
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') html.dataset.mode = 'rouge'; else delete html.dataset.mode;
          const textes = [...b.querySelectorAll('ol > li, ol > li *, a.bc-modifier')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
          const faibles = textes.map((x) => [texteDe(x), contraste(rgbVersHex(getComputedStyle(x).color), fondDe(x))]).filter(([, c]) => c < 4.5);
          v.egal(`${mode} : textes à 4,5:1`, faibles.map(([t, c]) => `${t} (${c.toFixed(2)})`), []);
        }
      } finally {
        if (avant.taille) html.dataset.taille = avant.taille; else delete html.dataset.taille;
        if (avant.mode) html.dataset.mode = avant.mode; else delete html.dataset.mode;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N108',
    titre: 'Export PNG du Schéma avec la bande « Chaîne » (19b3, spec § 4.4) : la bande en haut de l\'image, sous le titre et au-dessus du mur ; l\'image garde ses 2000 px de large et grandit de la hauteur de la bande ; verifierTailleSchema compte la bande (un mur tout juste sous la limite sans bande est refusé avec elle, avec la raison)',
    etape: '19b3',
    async verifier(v, contexte) {
      if (!exportImage.hauteurBandeSchema) { v.vrai('hauteurBandeSchema exportée par export.js', false); return; }
      try {
        const amont = amontEssai(contexte, { convertisseurs: [{ nom: 'Convertisseur A', liaison: '12g-sdi', longueurM: 80 }] });
        const x = chaineDessinee(contexte, { imposee: { ports: 2, fibre: true } });
        const hb = exportImage.hauteurBandeSchema(amont, 2000);
        v.vrai(`bande d'une rangée au moins (${hb} px)`, hb >= 40);
        const sans = await decoder(await schemaEnPng(x.svg, { largeurPx: 2000, titre: 'Mur LED', lignes: [] }));
        const blob = await schemaEnPng(x.svg, { largeurPx: 2000, titre: 'Mur LED', lignes: [], bande: amont });
        const avec = await decoder(blob);
        v.egal('2000 px de large, plus haute de la bande', [avec.width, avec.height - sans.height], [2000, hb]);
        // La bande est dessinée entre le titre et le mur : des pixels sombres dans sa hauteur.
        const c = el('canvas', { width: 2000, height: avec.height });
        const ctx = c.getContext('2d');
        ctx.drawImage(avec, 0, 0);
        const haut = 40 + Math.round(36 * 1.6);
        const zone = ctx.getImageData(0, haut, 2000, hb).data;
        let sombres = 0;
        for (let i = 0; i < zone.length; i += 4) if (zone[i] + zone[i + 1] + zone[i + 2] < 200) sombres += 1;
        v.vrai(`la bande est dessinée sous le titre (${sombres} pixels sombres)`, sombres > 500);
        // Limite de surface : la plus grande hauteur de dessin acceptée sans bande, refusée avec elle.
        const passe = (h, bande) => { try { exportImage.verifierTailleSchema(2000, 2000, h, { titre: true, bande }); return true; } catch { return false; } };
        let bas = 1000;
        let hautH = 20000;
        while (hautH - bas > 1) { const m = Math.floor((bas + hautH) / 2); if (passe(m, null)) bas = m; else hautH = m; }
        v.vrai('tout juste sous la limite : accepté sans bande, refusé avec', passe(bas, null) && !passe(bas, amont));
        let raison = '';
        try { exportImage.verifierTailleSchema(2000, 2000, bas, { titre: true, bande: amont }); } catch (erreur) { raison = erreur.message; }
        v.vrai('refus avec la raison', raison.includes('limite des navigateurs'), raison);
        x.svg.remove();
      } finally {
        document.querySelectorAll('body > svg').forEach((s) => s.remove());
      }
    },
  },
  {
    id: 'N109',
    titre: 'Plusieurs arrivées, résultats d\'Élec (21b, spec § 5) : section « Arrivées », une carte par arrivée (repère, libellé, capacité, phases avec ✗ et « limite » au-delà, lignes, écart), refus et notes ; liste des lignes avec, pour chacune, le choix « Arrivée » (« Conseil (A1) », A1, A2) qui renvoie la première dalle et l\'arrivée ; « Revenir au conseil » quand une ligne est choisie à la main',
    etape: '21b',
    async verifier(v) {
      const module = await importerSiPresent('../src/ecran-arrivees.js');
      if (!module?.sectionArrivees) { v.vrai('sectionArrivees exportée par src/ecran-arrivees.js', false); return; }
      const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
      const m = calculs.mur(DALLE_CAS_13, 48, 6);
      const elec = calculs.electricite(m, DALLE_CAS_13, { arrivee: calculs.arriveeDeCalcul(arrivees), depart: 'bas-gauche' });
      const t = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche' });
      const variante = t.variantes.find((x) => x.mode === t.conseil);
      const conseil = calculs.repartirArrivees(variante, elec, arrivees);
      const choix = [];
      const s = module.sectionArrivees(conseil, { conseil, surChoix: (dalle, id) => choix.push([dalle, id]), surConseil: () => choix.push('conseil') });
      v.egal('titre', texteDe(s.querySelector('h3')), 'Arrivées');
      v.egal('une carte par arrivée, repère et libellé', [...s.querySelectorAll('.carte-arrivee h4')].map(texteDe),
        ['A1 · Arrivée 1 : 63 A tri, armoire', 'A2 · Arrivée 2 : 32 A tri, en direct sur un boîtier']);
      v.vrai('capacité et lignes de A1', /11\s088 W utiles par phase/.test(texteDe(s.querySelector('.carte-arrivee'))) && /lignes 1 à \d+/.test(texteDe(s.querySelector('.carte-arrivee'))), texteDe(s.querySelector('.carte-arrivee')));
      v.egal('trois phases par arrivée tri', [...s.querySelectorAll('.carte-arrivee')].map((c) => c.querySelectorAll('tbody tr').length), [3, 3]);
      const lignes = [...s.querySelectorAll('.lignes-arrivees tbody tr')];
      v.egal('une ligne du tableau par ligne de dalles', lignes.length, variante.lignesDetail.length);
      const liste = lignes[0].querySelector('select');
      v.egal('choix de la ligne 1 : conseil, A1, A2', [...liste.options].map((o) => [o.value, o.textContent]), [['', 'Conseil (A1)'], ['arr-1', 'A1'], ['arr-2', 'A2']]);
      v.vrai('liste nommée pour les lecteurs d\'écran', /Arrivée de la ligne 1/.test(liste.getAttribute('aria-label') ?? ''), liste.getAttribute('aria-label'));
      liste.value = 'arr-2';
      liste.dispatchEvent(new Event('change', { bubbles: true }));
      v.egal('choix renvoyé : première dalle et arrivée', choix, [[variante.lignesDetail[0].dalles[0], 'arr-2']]);
      v.egal('sans choix à la main : pas de « Revenir au conseil »', s.querySelector('.revenir-conseil'), null);
      const main = calculs.repartirArrivees(variante, elec, arrivees, { manuel: { [variante.lignesDetail[0].dalles[0]]: 'arr-2' } });
      const s2 = module.sectionArrivees(main, { conseil, surChoix: () => {}, surConseil: () => choix.push('conseil') });
      v.egal('choix gardé dans la liste', s2.querySelector('.lignes-arrivees tbody tr select').value, 'arr-2');
      s2.querySelector('.revenir-conseil').click();
      v.egal('« Revenir au conseil »', choix.at(-1), 'conseil');
      const seul = calculs.lireArrivees([{ type: 'tri', intensiteA: 32 }, { type: 'tri', intensiteA: 16 }]);
      const trop = calculs.repartirArrivees(variante, elec, seul, { manuel: Object.fromEntries(variante.lignesDetail.map((l) => [l.dalles[0], 'arr-2'])) });
      const s3 = module.sectionArrivees(trop, { conseil: calculs.repartirArrivees(variante, elec, seul), surChoix: () => {}, surConseil: () => {} });
      v.vrai('phase qui dépasse : ✗ et ligne marquée', s3.querySelectorAll('.carte-arrivee tr.limite').length > 0, texteDe(s3));
      v.vrai('alerte « dépasse » affichée', [...s3.querySelectorAll('.alerte')].some((a) => /dépasse\.$/.test(texteDe(a))), texteDe(s3));
      v.vrai('note « aucune ligne » affichée', [...s3.querySelectorAll('.alerte')].some((a) => texteDe(a).includes('Arrivée 1 : aucune ligne')), texteDe(s3));
    },
  },
  {
    id: 'N110',
    titre: 'Plusieurs arrivées, saisie (21b, spec § 5) : carte d\'une arrivée ajoutée (type, intensité de la liste ou libre, branchement seulement pour une 32 A tri, distance, matériel de son armoire en « Avec mon matériel »), champs sans nom (saisies gardées par le champ caché), « Retirer l\'arrivée » ; conversion vers lireArrivees',
    etape: '21b',
    async verifier(v) {
      const module = await importerSiPresent('../src/ecran-arrivees.js');
      if (!module?.carteSaisieArrivee) { v.vrai('carteSaisieArrivee exportée par src/ecran-arrivees.js', false); return; }
      const recu = [];
      const carte = (saisie, materiel = false) => module.carteSaisieArrivee(saisie, { numero: 2, choixMateriel: materiel, surChange: (x) => recu.push(x), surRetirer: () => recu.push('retirer') });
      const base = { id: 'arr-x', type: 'tri', intensite: '32', libre: '', branchement: 'armoire', distance: '', prises16: '', sortiesP17: '' };
      const c = carte(base);
      v.egal('titre', texteDe(c.querySelector('h4')), 'Arrivée 2');
      v.egal('aucun champ nommé', [...c.querySelectorAll('input, select')].filter((x) => x.name).length, 0);
      v.vrai('chaque champ a son libellé', [...c.querySelectorAll('input, select')].every((x) => c.querySelector(`label[for="${x.id}"]`)));
      const visible = (cle) => { const x = c.querySelector(`[data-champ="${cle}"]`); return Boolean(x) && !x.closest('[hidden]'); };
      v.egal('32 A tri, armoire, conseil : branchement visible, matériel caché, valeur libre cachée', [visible('branchement'), visible('prises16'), visible('libre')], [true, false, false]);
      const c63 = carte({ ...base, intensite: '63' });
      v.vrai('63 A tri : pas de branchement', !c63.querySelector('[data-champ="branchement"]') || Boolean(c63.querySelector('[data-champ="branchement"]').closest('[hidden]')));
      const cm = carte(base, true);
      v.vrai('« Avec mon matériel », armoire : prises 16 A et sorties P17 visibles', !cm.querySelector('[data-champ="prises16"]').closest('[hidden]') && !cm.querySelector('[data-champ="sortiesP17"]').closest('[hidden]'));
      const cb = carte({ ...base, branchement: 'boitier' }, true);
      v.vrai('boîtier : pas de matériel d\'armoire', Boolean(cb.querySelector('[data-champ="prises16"]').closest('[hidden]')));
      const distance = c.querySelector('[data-champ="distance"]');
      distance.value = '30';
      distance.dispatchEvent(new Event('input', { bubbles: true }));
      v.egal('saisie renvoyée', recu.at(-1), { ...base, distance: '30' });
      const intensite = c.querySelector('[data-champ="intensite"]');
      v.egal('intensités de la liste tri et valeur libre', [...intensite.options].map((o) => o.value), ['16', '32', '63', '125', 'libre']);
      [...c.querySelectorAll('button')].find((b) => texteDe(b) === 'Retirer l\'arrivée').click();
      v.egal('retirer', recu.at(-1), 'retirer');
      v.egal('vers lireArrivees', [module.versArrivee({ ...base, distance: '12,5', prises16: '4' }), module.versArrivee({ ...base, intensite: 'libre', libre: '95' }).intensiteA, module.versArrivee({ ...base, type: 'mono', intensite: '32', branchement: 'boitier' }).branchement],
        [{ id: 'arr-x', type: 'tri', intensiteA: 32, branchement: 'armoire', distanceM: 12.5, materiel: { prises16: 4, sortiesP17: null } }, 95, 'armoire']);
    },
  },
  {
    id: 'N111',
    titre: 'Plusieurs arrivées à 375 px (21b) : section « Arrivées » et carte de saisie sans défilement de côté, listes et boutons de 48 px, en sombre et en mode rouge',
    etape: '21b',
    async verifier(v) {
      const module = await importerSiPresent('../src/ecran-arrivees.js');
      if (!module?.sectionArrivees || !module?.carteSaisieArrivee) { v.vrai('ecran-arrivees.js', false); return; }
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px;padding:0 16px;box-sizing:border-box', 'data-famille': 'electricite' });
      document.body.append(racine);
      try {
        const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
        const m = calculs.mur(DALLE_CAS_13, 48, 6);
        const elec = calculs.electricite(m, DALLE_CAS_13, { arrivee: calculs.arriveeDeCalcul(arrivees), depart: 'bas-gauche' });
        const t = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche' });
        const r = calculs.repartirArrivees(t.variantes.find((x) => x.mode === t.conseil), elec, arrivees);
        for (const mode of ['sombre', 'rouge']) {
          if (mode === 'rouge') document.documentElement.dataset.mode = 'rouge';
          racine.replaceChildren(module.sectionArrivees(r, { conseil: r, surChoix: () => {}, surConseil: () => {} }),
            module.carteSaisieArrivee({ id: 'arr-x', type: 'tri', intensite: 'libre', libre: '', branchement: 'armoire', distance: '', prises16: '', sortiesP17: '' }, { numero: 2, choixMateriel: true, surChange: () => {}, surRetirer: () => {} }));
          const trop = [...racine.querySelectorAll('*')].filter((x) => {
            const b = x.getBoundingClientRect();
            const cadre = racine.getBoundingClientRect();
            let coupe = false;
            for (let p = x.parentElement; p && p !== racine; p = p.parentElement) if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX)) coupe = true;
            return b.width > 0 && !coupe && b.right > cadre.right + 1;
          });
          v.egal(`${mode} : rien ne dépasse 375 px`, trop.map((x) => x.tagName), []);
          const petits = [...racine.querySelectorAll('select, button, input')].filter((x) => x.getBoundingClientRect().height > 0 && x.getBoundingClientRect().height < 47.5);
          v.egal(`${mode} : listes, champs et boutons de 48 px`, petits.map((x) => `${x.tagName} ${x.getBoundingClientRect().height}`), []);
        }
      } finally {
        delete document.documentElement.dataset.mode;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N112',
    titre: 'Secours par un second processeur dans Data (22b, spec § 5.1) : sous la redondance, choix « Secours » (dans le même processeur par défaut, ou par un second processeur) et « Liaison » (sans cascade par défaut, ou cascade), dans le formulaire de Data donc gardés avec les saisies, cachés au départ ; visibles avec la redondance pour la marque Novastar, un processeur NovaLCT choisi ou conseillé, ou le conseil toutes marques avec un NovaLCT dans le parc ; à 375 px, en sombre et en mode rouge : cibles de 48 px, rien ne dépasse',
    etape: '22b',
    async verifier(v) {
      const page = new DOMParser().parseFromString(await (await fetch('index.html', { cache: 'no-store' })).text(), 'text/html');
      const bloc = page.getElementById('form-data')?.querySelector('#bloc-secours');
      v.vrai('bloc dans le formulaire de Data, après la case Redondance', Boolean(bloc)
        && Boolean(page.querySelector('#form-data input[name="redondance"]')?.compareDocumentPosition(bloc) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (!bloc) return;
      v.egal('caché au départ', bloc.hidden, true);
      const choix = (nom) => [...bloc.querySelectorAll(`input[name="${nom}"]`)].map((x) => [x.value, x.checked, texteDe(x.closest('label'))]);
      v.egal('secours : même processeur par défaut', choix('secours'), [['ports', true, 'Dans le même processeur (ports doublés)'], ['processeur', false, 'Par un second processeur']]);
      v.egal('liaison : sans cascade par défaut', choix('liaisonSecours'), [['sansCascade', true, 'Sans cascade (Primary et Backup)'], ['cascade', false, 'Cascade (tableau)']]);
      v.egal('liaison cachée tant que le secours est dans le même processeur', bloc.querySelector('#bloc-liaison-secours')?.hidden, true);
      v.egal('légendes', [...bloc.querySelectorAll('legend')].map(texteDe), ['Secours', 'Liaison des deux processeurs']);
      const module = await importerSiPresent('../src/secours.js');
      if (!module?.choixSecoursVisible) { v.vrai('choixSecoursVisible exportée par src/secours.js', false); return; }
      const vis = (x) => module.choixSecoursVisible({ redondance: true, famille: 'brompton', mode: 'conseille', processeur: null, novaLCTDansParc: false, ...x });
      v.egal('règle de visibilité', [
        vis({ redondance: false, famille: 'novastar' }), vis({ famille: 'novastar' }), vis({ processeur: { logiciel: 'NovaLCT' }, mode: 'manuel' }),
        vis({ processeur: { logiciel: 'Tessera' }, mode: 'manuel' }), vis({ mode: 'conseille-tout', novaLCTDansParc: true }), vis({ mode: 'conseille-tout' }), vis({}),
      ], [false, true, true, false, true, false, false]);
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const racine = el('form', { class: 'carte formulaire', style: 'position:absolute;left:-10000px;top:0;width:375px;box-sizing:border-box' });
      const copie = document.importNode(bloc, true);
      copie.hidden = false;
      copie.querySelectorAll('[hidden]').forEach((x) => { x.hidden = false; });
      racine.append(copie);
      document.body.append(racine);
      try {
        for (const rouge of [false, true]) {
          if (rouge) html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          const nom = rouge ? 'mode rouge' : 'sombre';
          const cibles = [...copie.querySelectorAll('input')].map((x) => x.closest('label'));
          v.egal(`${nom} : cibles de 48 px`, cibles.filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe), []);
          const bord = racine.getBoundingClientRect().right;
          v.egal(`${nom} : rien ne dépasse`, [...copie.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5).map((x) => x.tagName), []);
        }
      } finally {
        delete html.dataset.mode;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N113',
    titre: 'Repère des secours par un second processeur dans le Schéma (22b, repère « 3.1 » choisi par l\'utilisateur) : bout du retour numéroté « numéro du processeur de secours . port » (« 2.1 » avec un principal, « 3.1 » et « 4.1 » avec deux), puce de la légende « secours 3.1 », ligne de légende des retours avec le nom du processeur de secours ; secours dans le même processeur : le repère d\'avant (« 9 », « 1.9 »)',
    etape: '22b',
    verifier(v, contexte) {
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const trajets = (colonnes, rangees, reglages) => {
        const m = calculs.mur(upad, colonnes, rangees);
        const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8, ...reglages });
        const t = calculs.cablageData(m, upad, e, { depart: 'bas-gauche' });
        return trajetsSchema({ cablage: 'data' }, t.variantes.find((x) => x.mode === t.conseil), null);
      };
      const un = trajets(8, 6, { redondance: true, secours: 'processeur' });
      v.egal('un principal : 2.1 à 2.4', un.map((t) => t.etiquetteSecours), ['2.1', '2.2', '2.3', '2.4']);
      v.egal('… départs numérotés comme avant', un.map((t) => t.etiquette), ['1', '2', '3', '4']);
      v.vrai('puce de la légende : secours 2.1', /, secours 2\.1(,|$)/.test(un[0].libelleCourt), un[0].libelleCourt);
      const deux = trajets(32, 8, { redondance: true, secours: 'processeur' });
      v.egal('deux principaux : 3.k et 4.k', [deux.find((t) => t.cle === 'p1-1').etiquetteSecours, deux.find((t) => t.cle === 'p2-1').etiquetteSecours], ['3.1', '4.1']);
      v.egal('ligne de légende des retours', dessinSchema.legendeSecours?.(deux), 'retours de secours, vers les processeurs de secours (3.1 : MCTRL4K secours n° 3, port 1)');
      v.egal('… un principal', dessinSchema.legendeSecours?.(un), 'retours de secours, vers le processeur de secours (2.1 : MCTRL4K secours n° 2, port 1)');
      const ports = trajets(8, 6, { redondance: true });
      v.egal('secours dans le même processeur : le repère d\'avant', [ports[0].etiquetteSecours, dessinSchema.legendeSecours?.(ports)], ['9', 'retours de secours']);
    },
  },
  {
    id: 'N114',
    titre: 'Cadre du processeur de secours dans la chaîne du Schéma (22b, cadre « MCTRL4K secours n° 3 » choisi par l\'utilisateur) : à côté de son principal, sur la même rangée, sans le toucher ni toucher le mur ; chaque retour de secours relié à lui en pointillés couleur secours ; deux principaux : chaque secours plus près du sien ; secours dans le même processeur : pas de cadre de secours',
    etape: '22b',
    verifier(v, contexte) {
      const essai = (colonnes, rangees, reglages) => chaineDessinee(contexte, { colonnes, rangees, reglages, distanceM: 20 });
      const un = essai(8, 6, { redondance: true, secours: 'processeur' });
      try {
        const cadres = cadresChaine(un.svg);
        const principal = cadres.find((c) => c.role === 'processeur');
        const secours = cadres.find((c) => c.role === 'secours');
        v.egal('cadres : le principal et son secours', cadres.map((c) => [c.role, c.lignes[0]]), [['processeur', 'MCTRL4K'], ['secours', 'MCTRL4K secours n° 2']]);
        v.vrai('même rangée, sans se toucher', Math.abs(principal.cy - secours.cy) < 1e-6 && !chevauchent(principal, secours), [principal, secours]);
        v.vrai('hors du mur', !chevauchent(secours, { x: 0, y: 0, w: un.geo.largeur, h: un.geo.hauteur }), secours);
        const liens = [...un.svg.querySelectorAll('[data-trajet] .depuis-appareil.secours')];
        v.egal('un retour relié par port', liens.length, 4);
        const bouts = disquesDe(un.svg, '.bout-secours');
        const finit = liens.every((l) => { const p = sommets(l).at(-1); return bouts.some((b) => Math.hypot(b.cx - p[0], b.cy - p[1]) < 1e-6); });
        const part = liens.every((l) => { const [x, y] = sommets(l)[0]; return x >= secours.x - 1e-6 && x <= secours.x + secours.w + 1e-6 && Math.abs(y - secours.y) < 1e-6; });
        v.vrai('du cadre du secours jusqu\'au bout de chaque retour', finit && part, liens.map((l) => sommets(l)));
        v.vrai('pointillés couleur secours', liens.every((l) => Boolean(l.getAttribute('stroke-dasharray')) && l.getAttribute('style').includes(PALETTE_EXPORT.secours)));
      } finally {
        un.svg.remove();
      }
      const deux = essai(32, 8, { redondance: true, secours: 'processeur' });
      try {
        const c = cadresChaine(deux.svg);
        const de = (nom) => c.find((x) => x.lignes[0] === nom);
        v.egal('quatre cadres', c.map((x) => x.lignes[0]).sort(), ['MCTRL4K n° 1', 'MCTRL4K n° 2', 'MCTRL4K secours n° 3', 'MCTRL4K secours n° 4']);
        v.vrai('chaque secours plus près de son principal', Math.abs(de('MCTRL4K secours n° 3').cx - de('MCTRL4K n° 1').cx) < Math.abs(de('MCTRL4K secours n° 3').cx - de('MCTRL4K n° 2').cx)
          && Math.abs(de('MCTRL4K secours n° 4').cx - de('MCTRL4K n° 2').cx) < Math.abs(de('MCTRL4K secours n° 4').cx - de('MCTRL4K n° 1').cx), c);
        v.vrai('aucun cadre n\'en touche un autre', c.every((a, i) => c.every((b, j) => i === j || !chevauchent(a, b))), c);
      } finally {
        deux.svg.remove();
      }
      const ports = essai(8, 6, { redondance: true });
      try {
        v.egal('secours dans le même processeur : pas de cadre de secours', cadresChaine(ports.svg).filter((x) => x.role === 'secours').length, 0);
      } finally {
        ports.svg.remove();
      }
    },
  },
  {
    id: 'N115',
    titre: 'Pas à pas NovaLCT avec un processeur de secours (22c, spec § 6) : titre de l\'écran « 1 × MCTRL4K + 1 de secours » (resultat.titreProcesseurs, pas « 2 × MCTRL4K »), parties « Processeur 1 », « Secours n° 2 » ; deux principaux : « Secours n° 3 » et « Secours n° 4 » ; carte de Data avec le même titre ; sans secours, le titre d\'avant ; choix des parties à 375 px sans débordement',
    etape: '22c',
    async verifier(v, contexte) {
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!en || !nl) return;
      const retirer = await chargerStylesLook();
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const actions = { cocher: async () => {}, compris: async () => {}, toutDecocher: async () => {}, dessinPort: () => null };
      try {
        const ecran = en.monterNovaLCT(racine, { actions });
        const essai = (colonnes, reglages) => {
          ecran.afficher({ resultat: pasAPasSecours(contexte, nl, { colonnes, rangees: colonnes > 8 ? 8 : 6, ...reglages }), cases: {}, avis: null });
          return [texteDe(racine.querySelector('.pr-sur-titre')), [...racine.querySelectorAll('.nl-parties label')].map(texteDe)];
        };
        v.egal('un principal et son secours', essai(8, { redondance: true, secours: 'processeur' }),
          ['1 × MCTRL4K + 1 de secours', ['Avant', 'Processeur 1', 'Secours n° 2', 'Contrôles']]);
        v.egal('deux principaux, en cascade', essai(32, { redondance: true, secours: 'processeur', liaisonSecours: 'cascade' }),
          ['2 × MCTRL4K + 2 de secours', ['Avant', 'Processeur 1', 'Processeur 2', 'Secours n° 3', 'Secours n° 4', 'Contrôles']]);
        const bord = racine.getBoundingClientRect().right;
        v.egal('375 px : le choix des parties ne dépasse pas', [...racine.querySelectorAll('.nl-parties *')].filter((x) => x.getBoundingClientRect().right > bord + 0.5).map(texteDe), []);
        v.egal('secours dans le même processeur : le titre d\'avant', essai(32, { redondance: true }), ['2 × MCTRL4K', ['Avant', 'Processeur 1', 'Processeur 2', 'Contrôles']]);
        const carte = en.carteNovaLCT({ processeur: 'MCTRL4K', nombre: 1, titre: '1 × MCTRL4K + 1 de secours', groupe: 'carte-envoi', version: '', etat: 'Aucune étape cochée.' }, { ouvrir: () => {} });
        v.vrai('carte de Data : le titre avec les secours', texteDe(carte.querySelector('.nl-carte-texte')).startsWith('1 × MCTRL4K + 1 de secours : ce qu\'il faut faire dans NovaLCT'), texteDe(carte.querySelector('.nl-carte-texte')));
      } finally {
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N116',
    titre: 'NovaLCT à blanc avec un processeur de secours (22c, spec § 6) : dans la carte d\'Apprendre, sous la case Redondance, choix « Secours » (dans le même processeur par défaut, ou par un second processeur) visible avec la redondance, et « Liaison des deux processeurs » (sans cascade par défaut, ou cascade) visible avec le second processeur ; « Ouvrir à blanc » transmet secours et liaisonSecours (rien de plus avec le secours dans le même processeur) ; refus du mur d\'exemple signalé dans la carte ; à 375 px, en sombre et en mode rouge : cibles de 48 px, rien ne dépasse',
    etape: '22c',
    async verifier(v, contexte) {
      const ap = await moduleAppli(v, '../src/ecran-apprendre.js');
      const nl = await moduleAppli(v, '../src/novalct.js');
      if (!ap || !nl) return;
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const racine = el('div', { style: 'position:absolute;left:-10000px;top:0;width:375px' });
      document.body.append(racine);
      const attendre = () => new Promise((fin) => setTimeout(fin, 0));
      const ouvertures = [];
      let reponse;
      try {
        const bp = baseProcesseurs(contexte);
        const liste = nl.processeursABlanc(bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)));
        const ecran = ap.monterApprendre(racine, { pourquoi: contexte.pourquoi, entrainement: contexte.entrainement, stockage: null, enLigne: () => false, ouvrirFiche: () => {}, ouvrirEntrainement: () => {},
          novalct: { ouvrir: (choix) => { ouvertures.push(choix); return reponse; }, processeurs: liste } });
        await ecran.pret;
        const carte = racine.querySelector('.ap-novalct');
        const groupe = (nom) => carte?.querySelector(`input[name="${nom}"]`)?.closest('fieldset') ?? null;
        const choix = (nom) => [...(carte?.querySelectorAll(`input[name="${nom}"]`) ?? [])].map((x) => [x.value, x.checked, texteDe(x.closest('label'))]);
        const radio = (nom, valeur) => carte?.querySelector(`input[name="${nom}"][value="${valeur}"]`);
        const visibles = () => [groupe('nl-secours'), groupe('nl-liaison')].map((g) => Boolean(g) && !g.closest('[hidden]'));
        v.egal('choix, dans l\'ordre', [choix('nl-secours'), choix('nl-liaison')], [
          [['ports', true, 'Dans le même processeur (ports doublés)'], ['processeur', false, 'Par un second processeur']],
          [['sansCascade', true, 'Sans cascade (Primary et Backup)'], ['cascade', false, 'Cascade (tableau)']]]);
        v.egal('légendes', [groupe('nl-secours'), groupe('nl-liaison')].map((g) => texteDe(g?.querySelector('legend'))), ['Secours', 'Liaison des deux processeurs']);
        v.egal('sans redondance : cachés', visibles(), [false, false]);
        const redondance = carte?.querySelector('input[name="nl-redondance"]');
        v.vrai('après la case Redondance', Boolean(redondance && groupe('nl-secours') && (redondance.compareDocumentPosition(groupe('nl-secours')) & Node.DOCUMENT_POSITION_FOLLOWING)));
        redondance?.click();
        v.egal('redondance : secours visible, liaison cachée', visibles(), [true, false]);
        const ouvrir = () => [...(carte?.querySelectorAll('button') ?? [])].find((b) => texteDe(b) === 'Ouvrir à blanc')?.click();
        ouvrir();
        await attendre();
        v.egal('secours dans le même processeur : choix d\'avant', ouvertures.at(-1), { processeur: 'novastar-mctrl660', redondance: true });
        radio('nl-secours', 'processeur')?.click();
        v.egal('second processeur : liaison visible', visibles(), [true, true]);
        ouvrir();
        await attendre();
        v.egal('second processeur, sans cascade', ouvertures.at(-1), { processeur: 'novastar-mctrl660', redondance: true, secours: 'processeur', liaisonSecours: 'sansCascade' });
        radio('nl-liaison', 'cascade')?.click();
        ouvrir();
        await attendre();
        v.egal('cascade', ouvertures.at(-1), { processeur: 'novastar-mctrl660', redondance: true, secours: 'processeur', liaisonSecours: 'cascade' });
        reponse = 'La série H ne se cascade pas en USB : prends la liaison sans cascade.';
        ouvrir();
        await attendre();
        v.egal('refus du mur d\'exemple : la raison dans la carte', texteDe(carte?.querySelector('.ap-novalct-refus')), reponse);
        reponse = undefined;
        ouvrir();
        await attendre();
        v.egal('… effacée au choix suivant qui passe', texteDe(carte?.querySelector('.ap-novalct-refus')), '');
        redondance?.click();
        v.egal('redondance décochée : cachés', visibles(), [false, false]);
        ouvrir();
        await attendre();
        v.egal('… et plus transmis', ouvertures.at(-1), { processeur: 'novastar-mctrl660', redondance: false });
        redondance?.click();
        for (const rouge of [false, true]) {
          if (rouge) html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          const nom = rouge ? 'mode rouge' : 'sombre';
          const cibles = [...carte.querySelectorAll('input[type="radio"]')].map((x) => x.closest('label'));
          v.egal(`${nom} : cibles de 48 px`, cibles.filter((x) => x.getBoundingClientRect().height < 47.5).map(texteDe), []);
          const bord = racine.getBoundingClientRect().right;
          v.egal(`${nom} : rien ne dépasse`, [...carte.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5).map((x) => x.tagName), []);
        }
      } finally {
        delete html.dataset.mode;
        racine.remove();
        retirer();
      }
    },
  },
  {
    id: 'N117',
    titre: 'Dépannage avec un processeur de secours (22c, spec § 7) : blocs « Ajouté par l\'appli » sous l\'étape 3 de T10.3 (« Deux processeurs, NovaLCT n\'en montre qu\'un »), de T11.1 et de T5.2, chaque ligne avec ses sources, pour la marque Novastar seulement (rien pour COEX ni Brompton) ; les ajouts reçoivent la marque et le projet avec son logiciel ; bouton « Pas à pas NovaLCT » quand le processeur du projet se règle dans NovaLCT, pas sans projet ; table des sources du Dépannage inchangée ; 375 px, contrastes en sombre et en rouge, grand affichage',
    etape: '22c',
    async verifier(v, contexte) {
      const module = await moduleDepannage(v);
      const en = await moduleAppli(v, '../src/ecran-novalct.js');
      if (!module || !en) return;
      if (!en.blocDepannageSecours) { v.vrai('blocDepannageSecours exportée par src/ecran-novalct.js', false); return; }
      const retirer = await chargerStylesLook();
      const html = document.documentElement;
      const { mode, taille } = html.dataset;
      const recus = [];
      const ouvertures = [];
      const ajouts = Object.fromEntries(['T10.3:3', 'T11.1:3', 'T5.2:3'].map((cle) => [cle, (marque, projet) => {
        recus.push([cle, marque, projet?.logiciel ?? null]);
        return en.blocDepannageSecours(cle, { marque, projet, enLigne: () => false, ouvrirPasAPas: () => ouvertures.push(cle) });
      }]));
      const projet = { marque: 'novastar', nom: 'MCTRL4K', logiciel: 'NovaLCT' };
      let m = monterDepannage(module, contexte.depannage, { projet, enLigne: () => false, ajouts });
      const bloc = () => m.racine.querySelector('.nl-depannage');
      try {
        const titres = { 'T10.3': 'Deux processeurs, NovaLCT n\'en montre qu\'un', 'T11.1': 'Les dalles d\'un port s\'inversent quand le secours prend le relais', 'T5.2': 'Avec un processeur de secours' };
        for (const [noeud, titre] of Object.entries(titres)) {
          m.ecran.afficher(noeud);
          const b = bloc();
          v.egal(`${noeud} : dans l'étape 3, marqué, titre`, [texteDe(b?.closest('.element-numerote')?.querySelector('.numero-liste')), texteDe(b?.querySelector('.cx-ajout')), texteDe(b?.querySelector('h3'))],
            ['3.', 'Ajouté par l\'appli', titre]);
          const lignes = b?.querySelectorAll('.cx-texte').length ?? 0;
          v.vrai(`${noeud} : chaque ligne avec sa source`, lignes > 0 && lignes === b.querySelectorAll('.cx-sources').length
            && [...b.querySelectorAll('.cx-sources')].every((s) => texteDe(s).startsWith('Source : ')), texteDe(b));
          boutonTexte(b ?? m.racine, 'Pas à pas NovaLCT')?.click();
        }
        v.egal('« Pas à pas NovaLCT » appelle son action', ouvertures, ['T10.3:3', 'T11.1:3', 'T5.2:3']);
        v.vrai('les ajouts reçoivent la marque et le projet avec son logiciel', recus.length >= 3 && recus.every((r) => r[1] === 'novastar' && r[2] === 'NovaLCT'), JSON.stringify(recus));
        m.ecran.afficher('T10.3');
        v.vrai('T10.3 : port de communication et les deux méthodes', ['port de communication', 'Detect Config', 'Méthode cascade', 'Méthode sans cascade'].every((x) => texteDe(bloc()).includes(x))
          && texteDe(bloc()).includes('Manuel NovaLCT V5.8.1'), texteDe(bloc()));
        bloc()?.querySelectorAll('details').forEach((d) => { d.open = true; });
        for (const [rouge, grand] of [[false, false], [true, false], [false, true]]) {
          if (rouge) html.dataset.mode = 'rouge';
          else delete html.dataset.mode;
          if (grand) html.dataset.taille = 'grand';
          else delete html.dataset.taille;
          const nom = `${rouge ? 'mode rouge' : 'sombre'}${grand ? ', grand affichage' : ''}`;
          const b = bloc();
          const bord = m.racine.getBoundingClientRect().right;
          v.egal(`${nom} : rien ne dépasse`, [...b.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5)
            .map((x) => `${x.tagName.toLowerCase()}.${x.className}`), []);
          const textes = [...b.querySelectorAll('*')].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getBoundingClientRect().width > 0);
          v.egal(`${nom} : texte à 4,5:1`, textes.filter((x) => contraste(rgbVersHex(getComputedStyle(x).color), fondDe(x)) < 4.5).map((x) => texteDe(x).slice(0, 40)), []);
          v.egal(`${nom} : cibles`, [...b.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().height < (grand ? 59.5 : 47.5)).map(texteDe), []);
          if (grand) v.egal('grand affichage : texte à 19 px', textes.filter((x) => parseFloat(getComputedStyle(x).fontSize) < 18.5).map((x) => texteDe(x).slice(0, 40)), []);
        }
        delete html.dataset.mode;
        delete html.dataset.taille;
        m.ecran.afficher('T10.2');
        v.egal('autre étape : rien', bloc(), null);
        m.ecran.sources();
        v.vrai('table des sources du Dépannage inchangée', m.racine.querySelectorAll('.dep-source-entree').length === contexte.depannage.sources.length && !texteDe(m.racine).includes('Daktronics'));
        for (const [p, nom] of [[{ marque: 'coex', nom: 'COEX MX40 Pro', logiciel: 'VMP' }, 'COEX'], [{ marque: 'brompton', nom: 'S8', logiciel: 'Tessera' }, 'Brompton']]) {
          m.ecran.definirProjet(p);
          v.egal(`${nom} : aucun bloc`, ['T10.3', 'T11.1', 'T5.2'].map((n) => { m.ecran.afficher(n); return bloc(); }), [null, null, null]);
        }
        m.retirer();
        m = monterDepannage(module, contexte.depannage, { projet: null, enLigne: () => false, ajouts });
        m.racine.querySelector('[data-marque="novastar"]')?.click();
        m.ecran.afficher('T10.3');
        v.egal('sans projet, Novastar choisi : le bloc, sans bouton', [Boolean(bloc()), boutonTexte(bloc() ?? m.racine, 'Pas à pas NovaLCT') ?? null], [true, null]);
      } finally {
        if (mode) html.dataset.mode = mode;
        else delete html.dataset.mode;
        if (taille) html.dataset.taille = taille;
        else delete html.dataset.taille;
        m.retirer();
        retirer();
      }
    },
  },
  {
    id: 'N118',
    titre: 'Dessin d\'un port du processeur de secours (22c, spec § 6, méthode sans cascade) : le port k du secours (étape P2.B.7.k) reprend les dalles du port k du principal dans l\'ordre inverse (trajetSecoursInverse) : départ numéroté « 2.1 » au droit de la dernière dalle, au bout du retour de secours du principal, dalle 1 du guide = dernière dalle du principal, flèche vers la première ; pas de bout de secours ; couleur du port gardée',
    etape: '22c',
    verifier(v, contexte) {
      if (!dessinSchema.trajetSecoursInverse) { v.vrai('trajetSecoursInverse exportée par src/dessin-schema.js', false); return; }
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const m = calculs.mur(upad, 8, 6);
      const e = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8, redondance: true, secours: 'processeur' });
      const c = calculs.cablageData(m, upad, e, { depart: 'bas-gauche' });
      const vueSchema = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
      const geo = geometrieSchema(vueSchema, m, upad, calculs.pixelMap(m, upad, e));
      const t = trajetsSchema(vueSchema, c.variantes.find((x) => x.mode === c.conseil), null, null).find((x) => x.cle === 'p1-1');
      const inv = dessinSchema.trajetSecoursInverse(t);
      v.egal('dalles dans l\'ordre inverse', inv.dalles, [...t.dalles].reverse());
      v.egal('départ « 2.1 », sans bout de secours, couleur gardée', [inv.etiquette, inv.etiquetteSecours ?? null, inv.secours ?? null, inv.couleur], ['2.1', null, null, t.couleur]);
      v.egal('le trajet du principal n\'est pas touché', [t.dalles[0], t.etiquette, t.etiquetteSecours], ['C1 R6', '1', '2.1']);
      const dessin = (tr) => {
        const { svg } = construireSvg({ geo, trajets: [tr], coin: 'bas-gauche', blocs: [], palette: PALETTE_EXPORT, largeurPx: 2000, ordre: tr.cle, selection: tr.cle });
        svg.style.position = 'absolute';
        svg.style.left = '-5000px';
        document.body.append(svg);
        return svg;
      };
      const principal = dessin(t);
      const secours = dessin(inv);
      try {
        const bout = disquesDe(principal, '.bout-secours')[0];
        const depart = disquesDe(secours, '.depart')[0];
        v.vrai('départ du secours au bout du retour du principal', Boolean(bout && depart) && Math.hypot(bout.cx - depart.cx, bout.cy - depart.cy) < 1e-6, [bout, depart]);
        v.egal('pas de bout de secours', secours.querySelectorAll('.bout-secours').length, 0);
        const centre = (id) => { const r = geo.rects.get(id); return [r.x + r.w / 2, r.y + r.h / 2]; };
        const premier = sommets(secours.querySelector('polyline.trajet'))[0];
        v.vrai('trait parti de la dernière dalle du principal', Math.hypot(premier[0] - centre(t.dalles.at(-1))[0], premier[1] - centre(t.dalles.at(-1))[1]) < 1e-6, premier);
        const numeros = [...secours.querySelectorAll('.ordre-dalle text')].map(texteDe);
        v.egal('dalles numérotées de 1 à n depuis la dernière', numeros, t.dalles.map((_, i) => String(i + 1)));
        // Numéro d'une dalle : la pastille dont le centre tombe dans la dalle (quart haut droit).
        const numeroDe = (id) => {
          const d = geo.rects.get(id);
          const g = [...secours.querySelectorAll('.ordre-dalle')].find((x) => {
            const r = boiteRect(x.querySelector('rect'));
            const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
            return cx > d.x && cx < d.x + d.w && cy > d.y && cy < d.y + d.h;
          });
          return texteDe(g?.querySelector('text'));
        };
        v.egal('dalle 1 du guide = dernière du principal, n = première', [numeroDe(t.dalles.at(-1)), numeroDe(t.dalles[0])], ['1', String(t.dalles.length)]);
      } finally {
        principal.remove();
        secours.remove();
      }
    },
  },
];

// Pas à pas NovaLCT d'essai (22c) : Upad IV 2.6 sur MCTRL4K, 8 × 6 (un principal) ou 32 × 8 (deux), départ en bas à gauche.
function pasAPasSecours(contexte, nl, { colonnes = 8, rangees = 6, ...reglages } = {}) {
  const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
  const m = calculs.mur(upad, colonnes, rangees);
  const evaluation = calculs.evaluerProcesseur(m, upad, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8, ...reglages });
  const c = calculs.cablageData(m, upad, evaluation, { depart: 'bas-gauche' });
  return nl.etapesNovaLCT({ mur: m, dalle: upad, evaluation, variante: c.variantes.find((x) => x.mode === c.conseil), source: null });
}

// Bande « Chaîne » (19b3) : amont de `chaineSchema` sur l'exercice (Upad IV 2.6 en 4 × 4 sur MCTRL4K), chaîne de Canvas
// comme `chaineAffichee` la donne (source, liaison, convertisseurs, régie, source conseillée), ou sans chaîne.
function amontEssai(contexte, { convertisseurs = [], regie = null, conseillee = false, sansChaine = false } = {}) {
  const dalle = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
  const m = calculs.mur(dalle, 4, 4);
  const e = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, 'novastar-mctrl4k'), { frequenceHz: 60, bits: 8 });
  const source = { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60 };
  const c = calculs.controleChaine({ source: { nom: 'Source', ...source }, liaison: 'hdmi-2.0', longueurM: 5, convertisseurs },
    { evaluation: e, liaisons: liaisonsDeBase(contexte), frequenceCalculHz: 60, regie });
  const chaine = sansChaine ? null : { maillons: c.maillons, source, regie: regie ? { nom: regie.nom } : null, conseillee };
  return calculs.chaineSchema({ chaine, evaluation: e }).amont;
}

// Chaîne dans le Schéma (19b2) : mur d'essai (Upad IV 2.6 en 4 × 4 sur MCTRL4K par défaut), variante retenue (config
// imposée comprise), aval de `chaineSchema`, géométrie de la chaîne et dessin d'export de 2000 px monté hors de l'écran.
function chaineDessinee(contexte, {
  dalleId = 'unilumin-upad-iv-2-6', procId = 'novastar-mctrl4k', colonnes = 4, rangees = 4, reglages = {}, imposee = null, coin = 'bas-gauche', mode = null,
  vue = 'physique', distanceM = 50, reseau = null, palette = PALETTE_EXPORT, grand = false, simplifie = null, zones = null,
} = {}) {
  const dalle = zones ? DALLE_CAS_13 : dalleDeBase(contexte, dalleId);
  const m = zones ? calculs.murZones(DALLE_CAS_13, zones, { ecarts: 'main', ecartsPx: [84] }) : calculs.mur(dalle, colonnes, rangees);
  const e = calculs.evaluerProcesseur(m, dalle, processeurDeBase(contexte, procId), { frequenceHz: 60, bits: 8, ...reglages });
  const b = baseProcesseurs(contexte);
  const distributeurs = b.distributeurs.map((d) => calculs.resoudreFiche(d, b.sources));
  const t = calculs.cablageData(m, dalle, e, { depart: coin, distributeurs, imposee });
  const vd = t.variantes.find((x) => x.mode === (mode ?? t.retenue ?? t.conseil));
  const chaine = calculs.chaineSchema({ chaine: null, evaluation: e, variante: vd, distanceM, reseau });
  const vueSchema = { vue, canvasVue: 'mur', cablage: 'data' };
  const geo = geometrieSchema(vueSchema, m, dalle, calculs.pixelMap(m, dalle, e));
  const trajets = trajetsSchema(vueSchema, vd, null, null);
  const g = dessinSchema.geometrieChaine?.(geo, coin, trajets, chaine.aval, { grand }) ?? null;
  const { svg } = construireSvg({ geo, trajets, coin, blocs: [], palette, largeurPx: 2000, chaine: g, grand, simplifie });
  svg.style.position = 'absolute';
  svg.style.left = '-5000px';
  document.body.append(svg);
  return { svg, geo, g, m, e, vd, chaine, trajets };
}
// Sommets d'un trait : ligne (x1, y1, x2, y2) ou polyligne.
const sommets = (l) => (l.tagName === 'line' ? [['x1', 'y1'], ['x2', 'y2']].map((a) => a.map((k) => Number(l.getAttribute(k))))
  : l.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number)));
const boiteRect = (r) => ({ x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) });
const bb = (b) => ({ x: b.x, y: b.y, w: b.w ?? b.width, h: b.h ?? b.height });
const chevauchent = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// Cadres de la chaîne : rôle, nom, lignes de texte et rectangle.
function cadresChaine(svg) {
  return [...svg.querySelectorAll('.cadre-chaine')].map((g) => {
    const b = boiteRect(g.querySelector('rect'));
    return { role: g.dataset.role, nom: g.dataset.nom, lignes: [...g.querySelectorAll('text')].map(texteDe), ...b, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  });
}
const disquesDe = (svg, sel) => [...svg.querySelectorAll(sel)].map((c) => ({ cx: Number(c.getAttribute('cx')), cy: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) }));
// Rond de départ de chaque trajet, par clé.
const departsDe = (svg) => new Map([...svg.querySelectorAll('[data-trajet]')].map((g) => [g.dataset.trajet, disquesDe(g, '.depart')[0]]));
// Cadre au droit de ses départs : son étendue le long du bord croise celle des départs.
function auDroit(c, departs, orientation) {
  if (!c || !departs.length) return false;
  const [a, l, k] = orientation === 'rangees' ? [c.y, c.h, 'cy'] : [c.x, c.w, 'cx'];
  const min = Math.min(...departs.map((d) => d[k]));
  const max = Math.max(...departs.map((d) => d[k]));
  return a <= max && a + l >= min;
}

// Bloc « Ma config » (18c2) monté seul à 375 px, ouvert, tous ses champs visibles : cibles de 48 px et débordement,
// en thème sombre puis en mode rouge.
async function mesurerMaConfig(v, bloc, onglet) {
  const retirer = await chargerStylesLook();
  const html = document.documentElement;
  const mode = html.dataset.mode;
  const racine = el('form', { class: 'carte formulaire', style: 'position:absolute;left:-10000px;top:0;width:375px;box-sizing:border-box' });
  const copie = document.importNode(bloc, true);
  copie.open = true;
  copie.querySelectorAll('[hidden]').forEach((x) => { x.hidden = false; });
  racine.append(copie);
  document.body.append(racine);
  try {
    for (const rouge of [false, true]) {
      if (rouge) html.dataset.mode = 'rouge';
      else delete html.dataset.mode;
      const nom = `${onglet}, ${rouge ? 'mode rouge' : 'sombre'}`;
      const cibles = [copie.querySelector('summary'), ...copie.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])'),
        ...[...copie.querySelectorAll('input[type="radio"], input[type="checkbox"]')].map((x) => x.closest('label'))];
      v.egal(`${nom} : cibles de 48 px`, cibles.filter((x) => x.getBoundingClientRect().height < 47.5).map((x) => texteDe(x) || x.name), []);
      const bord = racine.getBoundingClientRect().right;
      v.egal(`${nom} : rien ne dépasse`, [...copie.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > bord + 0.5)
        .map((x) => `${x.tagName.toLowerCase()}${x.className ? `.${x.className}` : ''}`), []);
    }
  } finally {
    if (mode) html.dataset.mode = mode;
    else delete html.dataset.mode;
    racine.remove();
    retirer();
  }
}

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
