// Dessin du schéma (SVG) à partir des résultats de calculs.js : dalles en millimètres ou en pixels, trajets
// data ou élec en serpentin, blocs de processeurs. Sert à l'écran (couleurs du thème, mode rouge compris) et à
// l'export en image (couleurs d'impression sur fond blanc). Aucun calcul ici.

import { dallesDuMur } from './calculs.js';
import { nombre, nombreCourt } from './format.js';
import { svg } from './dom.js';

const NB_COULEURS = 8;
// Motifs de trait, pour distinguer les trajets sans compter sur la couleur (mode rouge, impression en noir).
export const MOTIFS = [null, [3, 2], [0.6, 1.6]];

export const PALETTE_ECRAN = {
  fond: 'var(--fond)', dalle: 'var(--surface-2)', demi: 'var(--surface)', bord: 'var(--bordure)', contour: 'var(--texte-doux)',
  texte: 'var(--texte)', texteDoux: 'var(--texte-doux)', accent: 'var(--accent)', police: null,
  trace: (i) => `var(--trace-${(i % NB_COULEURS) + 1})`,
  phase: (n) => `var(--phase-${n})`,
};
const TRACES_EXPORT = ['#1565c0', '#e65100', '#2e7d32', '#ad1457', '#6a1b9a', '#00838f', '#8d6e00', '#c62828'];
const PHASES_EXPORT = ['#c62828', '#1565c0', '#2e7d32'];
export const PALETTE_EXPORT = {
  fond: '#ffffff', dalle: '#eef1f6', demi: '#f8f9fb', bord: '#aab2bf', contour: '#5b6472',
  texte: '#1d2330', texteDoux: '#5b6472', accent: '#0a66c2', police: 'Helvetica, Arial, sans-serif',
  trace: (i) => TRACES_EXPORT[i % NB_COULEURS],
  phase: (n) => PHASES_EXPORT[n - 1],
};

const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const pourcent = (taux) => `${nombre(taux * 100, 1)} %`;

// Couleur d'un trajet dans une palette.
export const couleurTrajet = (t, palette) => (t.teinte.type === 'phase' ? palette.phase(t.teinte.numero) : palette.trace(t.teinte.index));

// Trajets à dessiner : un par port (data) ou par ligne (élec), avec sa teinte, son motif et ses dalles.
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
        etiquette: plusieurs ? `${p.numero}.${port.numero}` : `${port.numero}`,
        libelle: `${port.libelle} : ${pluriel(port.dalles.length, 'dalle', 'dalles')}, ${pourcent(port.taux)}`,
        dalles: port.dalles,
        teinte: { type: 'trace', index: i },
        motif: MOTIFS[Math.floor(i / NB_COULEURS) % MOTIFS.length],
        secours: port.secours,
      };
    })).filter((t) => !canvasNumero || t.processeur === canvasNumero);
  }
  if (vue.cablage === 'elec' && ve) {
    const mono = ve.phases.length === 1;
    return ve.lignesDetail.map((l) => ({
      cle: `l${l.numero}`,
      groupe: mono ? 'Lignes' : `Phase L${l.phase}`,
      etiquette: `${l.numero}`,
      libelle: `ligne ${l.numero}${mono ? '' : `, L${l.phase}`} : ${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W`,
      dalles: l.dalles,
      teinte: { type: 'phase', numero: mono ? 1 : l.phase },
      motif: mono ? null : MOTIFS[(l.phase - 1) % MOTIFS.length],
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
  const couleurs = [...new Set(trajets.map((t) => couleurTrajet(t, palette)))];
  const idMarqueur = new Map(couleurs.map((c, i) => [c, `fleche-${i}`]));

  const tuiles = [...rects.entries()].map(([id, r]) => {
    const choisie = id === dalleChoisie;
    return svg('g', { 'data-dalle': id },
      svg('rect', {
        class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${choisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h,
        style: `fill: ${r.d?.type === 'demi' ? palette.demi : palette.dalle}; stroke: ${choisie ? palette.accent : palette.bord}`,
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

  // Trajet : talon depuis le bord du côté du départ, serpentin fléché, retour de redondance en pointillés.
  const bordY = coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35;
  const lignes = trajets.map((t) => {
    const points = t.dalles.filter((id) => rects.has(id)).map((id) => centre(rects.get(id)));
    if (points.length === 0) return null;
    const couleur = couleurTrajet(t, palette);
    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];
    const actif = selection === null || selection === t.cle;
    const largeurTrait = trait * (selection === t.cle ? 1.8 : 1);
    const pointilles = t.motif ? t.motif.map((x) => x * trait * 2).join(' ') : null;
    const style = `fill: none; stroke: ${couleur}`;
    const fleche = `url(#${idMarqueur.get(couleur)})`;
    return svg('g', { 'data-trajet': t.cle, class: actif ? null : 'attenue' },
      svg('line', { class: 'trajet', x1: x0, y1: bordY, x2: x0, y2: y0, style, 'stroke-width': largeurTrait, 'stroke-dasharray': pointilles, 'stroke-linecap': 'round' }),
      svg('polyline', {
        class: 'trajet', points: points.map((p) => p.join(',')).join(' '), style, 'stroke-width': largeurTrait, 'stroke-dasharray': pointilles,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-mid': fleche, 'marker-end': fleche,
      }),
      t.secours ? svg('line', { class: 'trajet', x1: xn, y1: yn, x2: xn, y2: bordY, style, 'stroke-width': largeurTrait * 0.7, 'stroke-dasharray': `${trait * 1.2} ${trait * 1.4}` }) : null,
      svg('circle', { cx: x0, cy: bordY, r: police * 0.95, style: `fill: ${palette.fond}; stroke: ${couleur}`, 'stroke-width': trait * 0.6 }),
      svg('text', {
        class: 'numero-trajet', x: x0, y: bordY, 'font-size': police * (t.etiquette.length > 3 ? 0.7 : 0.95), style: `fill: ${couleur}`,
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
  svg('defs', {}, couleurs.map((c, i) => svg('marker', {
    id: `fleche-${i}`, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto',
  }, svg('path', { d: 'M1,1 L9,5 L1,9 z', style: `fill: ${c}` })))),
  svg('rect', { x: complet.x, y: complet.y, width: complet.w, height: complet.h, style: `fill: ${palette.fond}` }),
  svg('rect', { x: 0, y: 0, width: largeur, height: hauteur, style: `fill: none; stroke: ${palette.texteDoux}`, 'stroke-width': cote * 0.02 }),
  tuiles, contours, lignes);
  return { svg: racine, complet };
}
