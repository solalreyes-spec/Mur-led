// Dessin du schéma (SVG) à partir des résultats de calculs.js : dalles en millimètres ou en pixels, trajets
// data ou élec en serpentin, blocs de processeurs. Sert à l'écran (couleurs du thème, mode rouge compris) et à
// l'export en image (couleurs d'impression sur fond blanc). Aucun calcul ici.

import { dallesDuMur } from './calculs.js';
import { nombre, nombreCourt } from './format.js';
import { svg } from './dom.js';

// Deux couleurs seulement : câbles principaux, et câbles de secours en pointillés. Les ports (ou les lignes) se
// distinguent par un fond de dalles alterné (deux gris) et par leur numéro au départ de chaque chaîne.
export const PALETTE_ECRAN = {
  fond: 'var(--fond)', dalle: 'var(--dalle-a)', dalleAlt: 'var(--dalle-b)', demi: 'var(--surface)', bord: 'var(--bordure)',
  contour: 'var(--texte-doux)', texte: 'var(--texte)', texteDoux: 'var(--texte-doux)', accent: 'var(--accent)', police: null,
  principal: 'var(--trace-principal)', secours: 'var(--trace-secours)',
};
export const PALETTE_EXPORT = {
  fond: '#ffffff', dalle: '#eef1f6', dalleAlt: '#d5dce7', demi: '#f8f9fb', bord: '#aab2bf', contour: '#5b6472',
  texte: '#1d2330', texteDoux: '#5b6472', accent: '#0a66c2', police: 'Helvetica, Arial, sans-serif',
  principal: '#1565c0', secours: '#e65100',
};

const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const pourcent = (taux) => `${nombre(taux * 100, 1)} %`;

// Trajets à dessiner : un par port (data) ou par ligne (élec), avec son rang (fond alterné), son sens et ses dalles.
// `vue.cablage` : 'data', 'elec' ou 'aucun' ; `canvasNumero` limite la data aux ports de ce processeur.
export function trajetsSchema(vue, vd, ve, canvasNumero = null) {
  if (vue.cablage === 'data' && vd) {
    const plusieurs = vd.processeurs.length > 1;
    let rang = 0;
    return vd.processeurs.flatMap((p) => p.ports.map((port) => {
      const i = rang;
      rang += 1;
      return {
        cle: `p${p.numero}-${port.numero}`,
        groupe: plusieurs ? `${p.modele} n° ${p.numero}` : p.modele,
        processeur: p.numero,
        rang: i,
        orientation: vd.orientation ?? 'colonnes',
        etiquette: plusieurs ? `${p.numero}.${port.numero}` : `${port.numero}`,
        libelle: `${port.libelle} : ${pluriel(port.dalles.length, 'dalle', 'dalles')}, ${pourcent(port.taux)}`
          + `${port.secours?.retourM ? `, retour de secours ${nombreCourt(port.secours.retourM, 1)} m` : ''}`,
        dalles: port.dalles,
        secours: port.secours,
      };
    })).filter((t) => !canvasNumero || t.processeur === canvasNumero);
  }
  if (vue.cablage === 'elec' && ve) {
    const mono = ve.phases.length === 1;
    return ve.lignesDetail.map((l, i) => ({
      cle: `l${l.numero}`,
      groupe: mono ? 'Lignes' : `Phase L${l.phase}`,
      rang: i,
      orientation: ve.orientation ?? 'colonnes',
      etiquette: mono ? `${l.numero}` : `${l.numero} · L${l.phase}`,
      libelle: `ligne ${l.numero}${mono ? '' : `, L${l.phase}`} : ${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W`,
      dalles: l.dalles,
      secours: null,
    }));
  }
  return [];
}

// Géométrie de la vue : rectangles des dalles (mm ou px) et taille du cadre.
// `vue.vue` : 'physique' ou 'pixels' ; `vue.canvasVue` : 'mur' ou 'p2' (canvas du processeur n° 2).
export function geometrieSchema(vue, mur, dalle, pm) {
  const dalles = dallesDuMur(mur, dalle);
  if (vue.vue === 'physique') {
    return {
      unite: 'mm',
      largeur: mur.largeurMm,
      hauteur: mur.hauteurMm,
      rects: new Map(dalles.map((d) => [d.id, { x: d.mm.x, y: d.mm.y, w: d.mm.largeur, h: d.mm.hauteur, d }])),
    };
  }
  const numero = vue.canvasVue?.startsWith('p') ? Number(vue.canvasVue.slice(1)) : null;
  const canvas = numero ? pm?.canvas.find((c) => c.numero === numero) : null;
  if (canvas) {
    const parId = new Map(dalles.map((d) => [d.id, d]));
    return {
      unite: 'px',
      canvas,
      largeur: canvas.canvas?.largeurPx ?? canvas.bloc.largeurPx,
      hauteur: canvas.canvas?.hauteurPx ?? canvas.bloc.hauteurPx,
      rects: new Map(canvas.dalles.map((z) => [z.id, { x: z.x[0], y: z.y[0], w: z.x[1] - z.x[0] + 1, h: z.y[1] - z.y[0] + 1, d: parId.get(z.id) }])),
    };
  }
  return {
    unite: 'px',
    largeur: mur.pxLargeur,
    hauteur: mur.pxHauteur,
    rects: new Map(dalles.map((d) => [d.id, { x: d.px.x, y: d.px.y, w: d.px.largeur, h: d.px.hauteur, d }])),
  };
}

// Contour de chaque bloc de processeur quand le mur entier est dessiné et découpé.
export function blocsSchema(geo, pm, { vueCanvas = null, cablage = 'data' } = {}) {
  if (vueCanvas || !pm || pm.canvas.length < 2 || cablage === 'elec') return [];
  return pm.canvas.map((c) => {
    const rs = c.dalles.map((z) => geo.rects.get(z.id));
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y, libelle: `Processeur n° ${c.numero}` };
  });
}

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

// SVG du schéma. `cadrage` : partie visible (zoom), sinon tout ; `largeurPx` : taille en pixels pour un export.
// Renvoie le SVG et son cadre complet.
export function construireSvg({
  geo, trajets, coin, blocs = [], palette = PALETTE_ECRAN, cadrage = null, selection = null, dalleChoisie = null, largeurPx = null,
}) {
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const complet = { x: -marge, y: -marge, w: largeur + 2 * marge, h: hauteur + 2 * marge };
  const vue = cadrage ?? complet;
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const trait = cote * 0.07;
  const police = cote * 0.2;
  // Fond alterné : dalles d'un port (ou d'une ligne) en un gris, celles du suivant dans l'autre.
  const rangDe = new Map(trajets.flatMap((t) => t.dalles.map((id) => [id, t.rang])));
  const fondDalle = (id, r) => {
    if (rangDe.has(id)) return rangDe.get(id) % 2 === 0 ? palette.dalle : palette.dalleAlt;
    return r.d?.type === 'demi' ? palette.demi : palette.dalle;
  };

  const tuiles = [...rects.entries()].map(([id, r]) => {
    const choisie = id === dalleChoisie;
    return svg('g', { 'data-dalle': id },
      svg('rect', {
        class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${choisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h,
        style: `fill: ${fondDalle(id, r)}; stroke: ${choisie ? palette.accent : palette.bord}`,
        'stroke-width': cote * (choisie ? 0.05 : 0.015),
      }),
      svg('text', {
        class: 'etiquette-dalle', x: r.x + r.w / 2, y: r.y + r.h / 2 - (geo.unite === 'px' ? police * 0.6 : 0), 'font-size': police,
        style: `fill: ${palette.texteDoux}`, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, id),
      geo.unite === 'px' ? svg('text', {
        class: 'etiquette-dalle', x: r.x + r.w / 2, y: r.y + r.h / 2 + police * 0.7, 'font-size': police * 0.75,
        style: `fill: ${palette.texteDoux}`, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, `${r.x}, ${r.y}`) : null);
  });

  // Nom du bloc du côté opposé au départ des câbles, pour ne pas croiser leurs numéros.
  const contours = blocs.map((b) => svg('g', {},
    svg('rect', { class: 'bloc', x: b.x, y: b.y, width: b.w, height: b.h, style: `fill: none; stroke: ${palette.contour}`, 'stroke-width': trait * 0.6, 'stroke-dasharray': `${trait * 2} ${trait * 1.5}` }),
    svg('text', {
      class: 'etiquette-bloc', x: b.x + trait, y: coin.startsWith('haut') ? b.y + b.h + police * 1.4 : b.y - trait * 1.5,
      'font-size': police * 1.1, style: `fill: ${palette.texte}`, 'font-weight': 700,
    }, b.libelle)));

  // Trajet : talon depuis le bord de départ (bas en stack, haut en accroche ; côté gauche ou droit pour un câblage
  // par rangées), serpentin fléché, retour de secours en pointillés le long de la dernière colonne (ou rangée),
  // jamais en diagonale.
  const bordY = coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35;
  const bordX = coin.endsWith('gauche') ? -marge * 0.35 : largeur + marge * 0.35;
  const lignes = trajets.map((t) => {
    const points = t.dalles.filter((id) => rects.has(id)).map((id) => centre(rects.get(id)));
    if (points.length === 0) return null;
    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];
    const parRangees = t.orientation === 'rangees';
    const [xd, yd] = parRangees ? [bordX, y0] : [x0, bordY];
    const [xs, ys] = parRangees ? [bordX, yn] : [xn, bordY];
    const actif = selection === null || selection === t.cle;
    const largeurTrait = trait * (selection === t.cle ? 1.8 : 1);
    const style = `fill: none; stroke: ${palette.principal}`;
    return svg('g', { 'data-trajet': t.cle, class: actif ? null : 'attenue' },
      svg('line', { class: 'trajet', x1: xd, y1: yd, x2: x0, y2: y0, style, 'stroke-width': largeurTrait, 'stroke-linecap': 'round' }),
      svg('polyline', {
        class: 'trajet', points: points.map((p) => p.join(',')).join(' '), style, 'stroke-width': largeurTrait,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-mid': 'url(#fleche)', 'marker-end': 'url(#fleche)',
      }),
      t.secours ? svg('line', {
        class: 'trajet secours', x1: xn, y1: yn, x2: xs, y2: ys, style: `fill: none; stroke: ${palette.secours}`,
        'stroke-width': largeurTrait * 0.8, 'stroke-dasharray': `${trait * 1.2} ${trait * 1.2}`,
      }) : null,
      svg('circle', { class: 'depart', cx: xd, cy: yd, r: police * (t.etiquette.length > 3 ? 1.2 : 0.95), style: `fill: ${palette.fond}; stroke: ${palette.principal}`, 'stroke-width': trait * 0.6 }),
      svg('text', {
        class: 'numero-trajet', x: xd, y: yd, 'font-size': police * (t.etiquette.length > 3 ? 0.62 : 0.95), style: `fill: ${palette.principal}`,
        'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, t.etiquette));
  });

  const hauteurPx = largeurPx ? Math.round((largeurPx * complet.h) / complet.w) : null;
  const racine = svg('svg', {
    viewBox: `${vue.x} ${vue.y} ${vue.w} ${vue.h}`,
    width: largeurPx,
    height: hauteurPx,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': `Schéma du mur, ${geo.unite === 'mm' ? 'vue physique en millimètres' : 'vue en pixels'}`,
    'font-family': palette.police,
    style: largeurPx ? null : `aspect-ratio: ${complet.w} / ${complet.h}`,
  },
  svg('defs', {}, svg('marker', {
    id: 'fleche', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto',
  }, svg('path', { d: 'M1,1 L9,5 L1,9 z', style: `fill: ${palette.principal}` }))),
  svg('rect', { x: complet.x, y: complet.y, width: complet.w, height: complet.h, style: `fill: ${palette.fond}` }),
  svg('rect', { x: 0, y: 0, width: largeur, height: hauteur, style: `fill: none; stroke: ${palette.texteDoux}`, 'stroke-width': cote * 0.02 }),
  tuiles, contours, lignes);
  return { svg: racine, complet };
}
