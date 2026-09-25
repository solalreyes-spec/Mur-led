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
        etiquetteSecours: port.secours ? (plusieurs ? `${p.numero}.${port.secours.numero}` : `${port.secours.numero}`) : null,
        libelle: `${port.libelle} : ${pluriel(port.dalles.length, 'dalle', 'dalles')}, ${pourcent(port.taux)}`
          + `${port.secours ? `, secours ${plusieurs ? `${p.numero}.${port.secours.numero}` : port.secours.numero}` : ''}`
          + `${port.secours?.retourM ? `, retour ${nombreCourt(port.secours.retourM, 1)} m` : ''}`,
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
      etiquetteSecours: null,
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

// Repère dessiné au coin de départ : processeurs (ou XD au pied du mur, la régie en fibre) pour la data, armoire
// pour l'élec, avec la distance saisie. `evaluation` : processeur retenu dans l'onglet Data.
export function repereSchema(cablage, { evaluation = null, distanceM = null } = {}) {
  const distance = distanceM === null || distanceM === undefined ? null : nombreCourt(distanceM, 1);
  if (cablage === 'elec') return { lignes: ['Armoire', distance ? `à ${distance} m` : null].filter(Boolean) };
  if (cablage !== 'data' || !evaluation?.processeur) return null;
  const proc = evaluation.processeur;
  if (proc.distributeurObligatoire) {
    return { lignes: [proc.famille === 'brompton' ? 'XD' : 'Distributeur', distance ? `fibre ${distance} m` : null].filter(Boolean) };
  }
  const n = evaluation.nombre ?? 1;
  return { lignes: [`${n > 1 ? `${n} × ` : ''}${proc.modele}`, distance ? `régie à ${distance} m` : null].filter(Boolean) };
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
  repere = null,
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

  // Nom de la dalle dans son coin haut gauche (colonne, puis rangée dessous) et, en vue pixels, son premier pixel
  // dans le coin bas gauche : les traits passent au centre de la dalle, les deux restent lisibles.
  const bordTexte = cote * 0.09;
  // Ligne de base placée à la main (y : première ligne) : Safari ignore « dominant-baseline » sur un texte à plusieurs lignes.
  const ligne = (x, y, taille, lignes) => svg('text', {
    class: 'etiquette-dalle', x, y, 'font-size': taille, style: `fill: ${palette.texteDoux}`, 'text-anchor': 'start',
  }, lignes.map((texte, i) => svg('tspan', { x, dy: i === 0 ? 0 : `${1.1}em` }, texte)));
  const tuiles = [...rects.entries()].map(([id, r]) => {
    const choisie = id === dalleChoisie;
    const tailleNom = cote * 0.16;
    const tailleCoord = cote * 0.11;
    return svg('g', { 'data-dalle': id },
      svg('rect', {
        class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${choisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h,
        style: `fill: ${fondDalle(id, r)}; stroke: ${choisie ? palette.accent : palette.bord}`,
        'stroke-width': cote * (choisie ? 0.05 : 0.015),
      }),
      ligne(r.x + bordTexte, r.y + cote * 0.05 + tailleNom * 0.8, tailleNom, id.split(' ')),
      geo.unite === 'px'
        ? ligne(r.x + bordTexte, r.y + r.h - bordTexte - tailleCoord * 1.35, tailleCoord, [`x ${r.x}`, `y ${r.y}`])
        : null);
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
  const versExterieurY = coin.startsWith('haut') ? -1 : 1;
  const versExterieurX = coin.endsWith('gauche') ? -1 : 1;
  const rayon = (etiquette) => police * (etiquette.length > 3 ? 1.2 : 0.95);
  const departs = [];
  const lignes = trajets.map((t) => {
    const points = t.dalles.filter((id) => rects.has(id)).map((id) => centre(rects.get(id)));
    if (points.length === 0) return null;
    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];
    const parRangees = t.orientation === 'rangees';
    const [xd, yd] = parRangees ? [bordX, y0] : [x0, bordY];
    let [xs, ys] = parRangees ? [bordX, yn] : [xn, bordY];
    departs.push(parRangees ? yd : xd);
    // Bout du retour de secours, numéroté comme les départs ; sur le départ de sa chaîne (une colonne par port),
    // le numéro passe plus loin du mur et le pointillé longe le trait principal sans le cacher.
    const rDepart = rayon(t.etiquette);
    const rSecours = t.etiquetteSecours ? rayon(t.etiquetteSecours) : 0;
    const surDepart = t.secours && Math.hypot(xs - xd, ys - yd) < rDepart + rSecours;
    const decalage = surDepart ? trait * 1.6 : 0;
    const [xn2, yn2] = parRangees ? [xn, yn + decalage] : [xn + decalage, yn];
    if (surDepart) {
      if (parRangees) {
        xs += versExterieurX * (rDepart + rSecours + trait);
        ys += decalage;
      } else {
        ys += versExterieurY * (rDepart + rSecours + trait);
        xs += decalage;
      }
    }
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
        class: 'trajet secours', x1: xn2, y1: yn2, x2: xs, y2: ys, style: `fill: none; stroke: ${palette.secours}`,
        'stroke-width': largeurTrait * 0.8, 'stroke-dasharray': `${trait * 1.2} ${trait * 1.2}`,
      }) : null,
      t.etiquetteSecours ? svg('circle', {
        class: 'bout-secours', cx: xs, cy: ys, r: rSecours,
        style: `fill: ${palette.fond}; stroke: ${palette.secours}`, 'stroke-width': trait * 0.6, 'stroke-dasharray': `${trait * 0.9} ${trait * 0.6}`,
      }) : null,
      t.etiquetteSecours ? svg('text', {
        class: 'numero-secours', x: xs, y: ys, 'font-size': police * (t.etiquetteSecours.length > 3 ? 0.62 : 0.95), style: `fill: ${palette.secours}`,
        'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, t.etiquetteSecours) : null,
      svg('circle', { class: 'depart', cx: xd, cy: yd, r: police * (t.etiquette.length > 3 ? 1.2 : 0.95), style: `fill: ${palette.fond}; stroke: ${palette.principal}`, 'stroke-width': trait * 0.6 }),
      svg('text', {
        class: 'numero-trajet', x: xd, y: yd, 'font-size': police * (t.etiquette.length > 3 ? 0.62 : 0.95), style: `fill: ${palette.principal}`,
        'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, t.etiquette));
  });

  // Repère du processeur (ou de l'armoire) au coin de départ, hors du mur, du côté des départs ; les câbles de tête
  // longent le bord de départ jusqu'au départ le plus loin.
  let dessinRepere = null;
  if (repere && departs.length > 0) {
    const parRangees = trajets[0].orientation === 'rangees';
    const n = repere.lignes.length;
    // Lignes suivantes en 0,85 de la première ; largeur d'un caractère prise à 0,6 de la taille.
    const plusLong = Math.max(...repere.lignes.map((l, i) => l.length * (i === 0 ? 1 : 0.85)));
    const w = marge * 0.8;
    const taille = Math.min(police * 1.1, (w * 0.88) / (plusLong * 0.6));
    const h = taille * (1.25 * n + 0.6);
    const gauche = coin.endsWith('gauche');
    const enHaut = coin.startsWith('haut');
    // Colonnes : à côté du mur, au niveau des départs ; rangées : dessous ou dessus, au droit des départs.
    const [cx, cy] = parRangees
      ? [bordX, enHaut ? -marge * 0.55 : hauteur + marge * 0.55]
      : [gauche ? -marge * 0.55 : largeur + marge * 0.55, bordY];
    const cadre = { x: cx - w / 2, y: cy - h / 2 };
    // Câbles de tête : du repère au départ le plus loin, le long du bord de départ.
    const chemin = parRangees
      ? { x1: bordX, y1: enHaut ? cadre.y + h : cadre.y, x2: bordX, y2: enHaut ? Math.max(...departs) : Math.min(...departs) }
      : { x1: gauche ? cadre.x + w : cadre.x, y1: bordY, x2: gauche ? Math.max(...departs) : Math.min(...departs), y2: bordY };
    dessinRepere = svg('g', { class: 'repere' },
      svg('line', {
        class: 'chemin-tete', ...chemin,
        style: `stroke: ${palette.contour}`, 'stroke-width': trait * 0.5, 'stroke-dasharray': `${trait * 0.3} ${trait * 0.9}`, 'stroke-linecap': 'round',
      }),
      svg('rect', {
        x: cadre.x, y: cadre.y, width: w, height: h, rx: taille * 0.3,
        style: `fill: ${palette.fond}; stroke: ${palette.contour}`, 'stroke-width': trait * 0.5,
      }),
      repere.lignes.map((texte, i) => svg('text', {
        x: cx, y: cy + (i - (n - 1) / 2) * taille * 1.25, 'font-size': taille * (i === 0 ? 1 : 0.85),
        style: `fill: ${i === 0 ? palette.texte : palette.texteDoux}`, 'font-weight': i === 0 ? 700 : 400,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, texte)));
  }

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
  tuiles, contours, dessinRepere, lignes);
  return { svg: racine, complet };
}
