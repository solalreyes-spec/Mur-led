// Dessin du schéma (SVG) à partir des résultats de calculs.js : dalles en millimètres ou en pixels, trajets
// data ou élec en serpentin, blocs de processeurs. Sert à l'écran (couleurs du thème, mode rouge compris) et à
// l'export en image (couleurs d'impression sur fond blanc). Aucun calcul ici.

import { dallesDuMur, MODELES_DISTRIBUTEUR } from './calculs.js';
import { nombre, nombreCourt } from './format.js';
import { svg } from './dom.js';
import { couleurPort, stylesLignes } from './couleurs.js';

// Ports et lignes : leur numéro d'abord (au départ et sur chaque colonne du trajet), puis leur couleur (src/couleurs.js :
// une par port en data, celle de la phase en élec, avec un motif par ligne d'une même phase) ; fond de dalles alterné
// par port ou par ligne ; retours de secours en pointillés, dans leur propre couleur. `trace(couleur)` : couleur d'un
// trajet ; `texteSur(couleur)` : chiffre sur sa pastille. Noms de dalle (`nomDalle`) à 4,5:1 sur les deux fonds (N10).
export const PALETTE_ECRAN = {
  fond: 'var(--fond)', dalle: 'var(--dalle-a)', dalleAlt: 'var(--dalle-b)', demi: 'var(--surface)', bord: 'var(--bordure)',
  contour: 'var(--texte-doux)', texte: 'var(--texte)', texteDoux: 'var(--texte-doux)', nomDalle: 'var(--texte-dalle)', accent: 'var(--accent)', police: null,
  principal: 'var(--trace-principal)', secours: 'var(--trace-secours)',
  trace: (c) => `var(--${c.cle})`, lisere: 'var(--phase-lisere)', texteSur: (c) => (c.lisere ? 'var(--texte-sur-phase-2)' : 'var(--fond)'),
  fleche: (c) => (c.lisere ? 'var(--phase-2-fleche)' : `var(--${c.cle})`),
};
export const PALETTE_EXPORT = {
  fond: '#ffffff', dalle: '#f5f7fb', dalleAlt: '#c4cdda', demi: '#f8f9fb', bord: '#aab2bf', contour: '#5b6472',
  texte: '#1d2330', texteDoux: '#5b6472', nomDalle: '#424b5a', accent: '#0a66c2', police: 'Helvetica, Arial, sans-serif',
  principal: '#1565c0', secours: '#a63a00',
  trace: (c) => c.export, lisere: '#ffffff', texteSur: () => '#ffffff', fleche: (c) => c.export,
};

// Tirets d'un motif de ligne (trait d'épaisseur w, bouts arrondis) : trait plein, tirets, pointillés, tiret-point.
export function tiretsMotif(motif, w) {
  if (!motif || motif.id === 'plein') return null;
  if (motif.id === 'tirets') return `${w * 2.2} ${w * 2.2}`;
  if (motif.id === 'points') return `0.01 ${w * 2}`;
  return `${w * 2.2} ${w * 1.9} 0.01 ${w * 1.9}`;
}

const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const pourcent = (taux) => `${nombre(taux * 100, 1)} %`;

// Dalles, charge et secours d'un port, pour sa ligne de légende.
const detailPort = (port, p, plusieurs) => `${pluriel(port.dalles.length, 'dalle', 'dalles')}, ${pourcent(port.taux)}`
  + `${port.secours ? `, secours ${plusieurs ? `${p.numero}.${port.secours.numero}` : port.secours.numero}` : ''}`
  + `${port.secours?.retourM ? `, retour ${nombreCourt(port.secours.retourM, 1)} m` : ''}`;

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
        libelle: `${port.libelle} : ${detailPort(port, p, plusieurs)}`,
        // Puce de la légende : le numéro est déjà dans sa pastille ; le nom du port reste quand il dit autre chose
        // (« XD 2, port 1 », « CVT10 2, port 1 »).
        libelleCourt: port.libelle === `port ${port.numero}` ? detailPort(port, p, plusieurs) : `${port.libelle} : ${detailPort(port, p, plusieurs)}`,
        dalles: port.dalles,
        secours: port.secours,
        couleur: couleurPort(i),
        numero: plusieurs ? `${p.numero}.${port.numero}` : `${port.numero}`,
      };
    })).filter((t) => !canvasNumero || t.processeur === canvasNumero);
  }
  if (vue.cablage === 'elec' && ve) {
    const mono = ve.phases.length === 1;
    const styles = stylesLignes(ve.lignesDetail.map((l) => ({ numero: l.numero, phase: l.phase })), { mono });
    return ve.lignesDetail.map((l, i) => ({
      couleur: styles[i],
      numero: `${l.numero}`,
      cle: `l${l.numero}`,
      groupe: mono ? 'Lignes' : `Phase L${l.phase}`,
      rang: i,
      orientation: ve.orientation ?? 'colonnes',
      etiquette: mono ? `${l.numero}` : `${l.numero} · L${l.phase}`,
      etiquetteSecours: null,
      libelle: `ligne ${l.numero}${mono ? '' : `, L${l.phase}`} : ${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W`,
      libelleCourt: `${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W`,
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
  if (evaluation.distributeurObligatoire ?? proc.distributeurObligatoire) {
    return { lignes: [MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'Distributeur', distance ? `fibre ${distance} m` : null].filter(Boolean) };
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

// Départ des câbles, partagé par le dessin et le cadrage du guide : marge autour du mur, bord des départs (ronds
// numérotés des ports ou des lignes) et cadre du repère (processeur, XD, CVT ou armoire) hors du mur, au coin de départ.
export function geometrieDepart(geo, coin, { orientation = 'colonnes', repere = null } = {}) {
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const police = cote * 0.2;
  const bordY = coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35;
  const bordX = coin.endsWith('gauche') ? -marge * 0.35 : largeur + marge * 0.35;
  let cadreRepere = null;
  if (repere) {
    const parRangees = orientation === 'rangees';
    const n = repere.lignes.length;
    // Lignes suivantes en 0,85 de la première ; largeur d'un caractère prise à 0,6 de la taille.
    const plusLong = Math.max(...repere.lignes.map((l, i) => l.length * (i === 0 ? 1 : 0.85)));
    const w = marge * 0.8;
    const taille = Math.min(police * 1.1, (w * 0.88) / (plusLong * 0.6));
    const h = taille * (1.25 * n + 0.6);
    // Colonnes : à côté du mur, au niveau des départs ; rangées : dessous ou dessus, au droit des départs.
    const [cx, cy] = parRangees
      ? [bordX, coin.startsWith('haut') ? -marge * 0.55 : hauteur + marge * 0.55]
      : [coin.endsWith('gauche') ? -marge * 0.55 : largeur + marge * 0.55, bordY];
    cadreRepere = { cx, cy, w, h, taille, x: cx - w / 2, y: cy - h / 2 };
  }
  return { marge, cote, police, bordX, bordY, cadreRepere };
}

// Cadrage du guide pas à pas sur un port (ou une ligne) : ses dalles, son départ (rond numéroté au bord du mur) et le
// cadre du repère (processeur, XD, CVT ou armoire), par où l'on commence à brancher ; une marge courte autour, au
// format `aspect` (largeur / hauteur) du cadre de l'écran.
export function cadrageSurDalles(geo, dalles, aspect, { coin = 'haut-gauche', orientation = 'colonnes', repere = null } = {}) {
  const rects = dalles.map((id) => geo.rects.get(id)).filter(Boolean);
  if (rects.length === 0) return null;
  const g = geometrieDepart(geo, coin, { orientation, repere });
  const court = g.cote * 0.4;
  // Rond de départ : au bord des départs, au droit de la première dalle ; rayon le plus grand du dessin, trait compris.
  const premiere = rects[0];
  const [xd, yd] = orientation === 'rangees'
    ? [g.bordX, premiere.y + premiere.h / 2]
    : [premiere.x + premiere.w / 2, g.bordY];
  const r = g.police * 1.2 + g.cote * 0.03;
  const boites = [...rects, { x: xd - r, y: yd - r, w: 2 * r, h: 2 * r }, ...(g.cadreRepere ? [g.cadreRepere] : [])];
  let x = Math.min(...boites.map((b) => b.x)) - court;
  let y = Math.min(...boites.map((b) => b.y)) - court;
  let w = Math.max(...boites.map((b) => b.x + b.w)) + court - x;
  let h = Math.max(...boites.map((b) => b.y + b.h)) + court - y;
  if (w / h < aspect) {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  }
  return { x, y, w, h };
}

// SVG du schéma. `cadrage` : partie visible (zoom), sinon tout ; `largeurPx` : taille en pixels pour un export.
// `ordre` : trajet du guide pas à pas, ses dalles numérotées de 1 à n dans l'ordre du câble (au lieu des numéros de
// colonne). `grand` : grand affichage, en vue physique seulement (traits plus épais, noms de dalle et numéros plus
// grands) ; la vue pixels reste telle quelle : son premier pixel (« x 1056 ») va presque jusqu'au trait central.
// Renvoie le SVG et son cadre complet.
export function construireSvg({
  geo, trajets, coin, blocs = [], palette = PALETTE_ECRAN, cadrage = null, selection = null, dalleChoisie = null, largeurPx = null,
  repere = null, ordre = null, grand = false,
}) {
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const complet = { x: -marge, y: -marge, w: largeur + 2 * marge, h: hauteur + 2 * marge };
  const vue = cadrage ?? complet;
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const grandPhysique = grand && geo.unite !== 'px';
  const trait = cote * 0.07 * (grandPhysique ? 1.35 : 1);
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
    class: 'etiquette-dalle', x, y, 'font-size': taille, style: `fill: ${palette.nomDalle ?? palette.texteDoux}`, 'text-anchor': 'start',
  }, lignes.map((texte, i) => svg('tspan', { x, dy: i === 0 ? 0 : `${1.1}em` }, texte)));
  // Premier pixel de la dalle (vue pixels), coin bas gauche : un peu plus petit quand il est long (« x 1408 »), pour
  // rester à gauche du trait qui passe au centre de la dalle.
  const coordonnees = (r) => {
    const lignesCoord = [`x ${r.x}`, `y ${r.y}`];
    const plusLong = Math.max(...lignesCoord.map((l) => l.length));
    const taille = Math.min(cote * 0.11, (cote * 0.3) / (0.62 * plusLong));
    return ligne(r.x + bordTexte, r.y + r.h - bordTexte - taille * 1.35, taille, lignesCoord);
  };
  const tuiles = [...rects.entries()].map(([id, r]) => {
    const choisie = id === dalleChoisie;
    const tailleNom = cote * (grandPhysique ? 0.177 : 0.16);
    return svg('g', { 'data-dalle': id },
      svg('rect', {
        class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${choisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h,
        style: `fill: ${fondDalle(id, r)}; stroke: ${choisie ? palette.accent : palette.bord}`,
        'stroke-width': cote * (choisie ? 0.05 : 0.015),
      }),
      ligne(r.x + bordTexte, r.y + cote * 0.05 + tailleNom * 0.8, tailleNom, id.split(' ')),
      geo.unite === 'px' ? coordonnees(r) : null);
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
  // Flèches : une par couleur de trait.
  const fleches = new Map([[palette.principal, 'fleche']]);
  const fleche = (couleur) => {
    if (!fleches.has(couleur)) fleches.set(couleur, `fleche-${fleches.size}`);
    return `url(#${fleches.get(couleur)})`;
  };
  // Numéro gros sur chaque colonne (ou rangée) du trajet : sur le trait, un peu après le centre de la dalle du milieu,
  // pour laisser le nom de la dalle (coin haut gauche) et son premier pixel (coin bas gauche) lisibles. En vue pixels,
  // la bande libre entre les deux textes est plus étroite : numéro un peu plus petit, au milieu de cette bande.
  const vuePixels = geo.unite === 'px';
  const policeNumero = cote * (vuePixels ? 0.25 : grandPhysique ? 0.32 : 0.28);
  const numerosSurTrajet = (t, points, fond, texteNumero, contour) => {
    const parRangees = t.orientation === 'rangees';
    const groupes = [];
    for (const p of points) {
      const cle = parRangees ? p[1] : p[0];
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.cle === cle) dernier.points.push(p);
      else groupes.push({ cle, points: [p] });
    }
    const libelle = t.numero ?? t.etiquette;
    const h = policeNumero * (vuePixels ? 1 : 1.3);
    const w = Math.max(h, policeNumero * 0.62 * libelle.length + policeNumero * 0.5);
    return groupes.map((g) => {
      const [x, y] = g.points[Math.floor((g.points.length - 1) / 2)];
      const [cx, cy] = parRangees
        ? [x + cote * (grandPhysique ? 0.22 : 0.18), y]
        : [x, y + cote * (vuePixels ? 0.0265 : grandPhysique ? 0.16 : 0.09)];
      return svg('g', { class: 'numero-sur-trajet' },
        svg('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, style: `fill: ${fond}; stroke: ${contour}`, 'stroke-width': trait * 0.35 }),
        svg('text', {
          x: cx, y: cy, 'font-size': policeNumero, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `fill: ${texteNumero}`,
        }, libelle));
    });
  };
  // Guide pas à pas : numéro d'ordre dans le quart haut droit de chaque dalle, hors du nom (haut gauche) et du trait.
  const policeOrdre = cote * (grandPhysique ? 0.27 : 0.24);
  const numerosOrdre = (points, fond, texteNumero, contour) => points.map(([x, y], i) => {
    const libelle = `${i + 1}`;
    const h = policeOrdre * 1.42;
    const w = Math.max(h, policeOrdre * 0.62 * libelle.length + cote * 0.1);
    const [cx, cy] = [x + cote * 0.24, y - cote * 0.24];
    return svg('g', { class: 'ordre-dalle' },
      svg('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, style: `fill: ${fond}; stroke: ${contour}`, 'stroke-width': trait * 0.35 }),
      svg('text', {
        x: cx, y: cy, 'font-size': policeOrdre, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `fill: ${texteNumero}`,
      }, libelle));
  });
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
    // Trajet mis en évidence : 1,8 fois le trait normal, en grand affichage aussi (il ressort déjà, et ne mord pas sur les noms).
    const largeurTrait = selection === t.cle ? cote * 0.07 * 1.8 : trait;
    // Couleur du port ou de la phase (sinon la couleur principale), motif de la ligne, liseré clair sous un trait noir
    // (1,5 × le trait : le noir reste le plus visible).
    const couleur = t.couleur ? palette.trace(t.couleur) : palette.principal;
    const tirets = tiretsMotif(t.couleur?.motif, largeurTrait);
    const pointe = fleche(t.couleur ? palette.fleche(t.couleur) : palette.principal);
    const style = `fill: none; stroke: ${couleur}`;
    const lisere = t.couleur?.lisere ? `fill: none; stroke: ${palette.lisere}` : null;
    const texteNumero = t.couleur ? palette.texteSur(t.couleur) : palette.fond;
    const contour = t.couleur?.lisere ? palette.lisere : couleur;
    const listePoints = points.map((p) => p.join(',')).join(' ');
    return svg('g', { 'data-trajet': t.cle, class: actif ? null : 'attenue' },
      lisere ? svg('line', { class: 'lisere', x1: xd, y1: yd, x2: x0, y2: y0, style: lisere, 'stroke-width': largeurTrait * 1.5, 'stroke-linecap': 'round' }) : null,
      lisere ? svg('polyline', {
        class: 'lisere', points: listePoints, style: lisere, 'stroke-width': largeurTrait * 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }) : null,
      svg('line', { class: 'trajet', x1: xd, y1: yd, x2: x0, y2: y0, style, 'stroke-width': largeurTrait, 'stroke-linecap': 'round', 'stroke-dasharray': tirets }),
      svg('polyline', {
        class: 'trajet', points: listePoints, style, 'stroke-width': largeurTrait, 'stroke-dasharray': tirets,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-mid': pointe, 'marker-end': pointe,
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
      svg('circle', { class: 'depart', cx: xd, cy: yd, r: police * (t.etiquette.length > 3 ? 1.2 : 0.95), style: `fill: ${couleur}; stroke: ${contour}`, 'stroke-width': trait * 0.6 }),
      svg('text', {
        class: 'numero-trajet', x: xd, y: yd, 'font-size': police * (t.etiquette.length > 3 ? 0.62 : 0.95), style: `fill: ${texteNumero}`,
        'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, t.etiquette),
      t.cle === ordre ? numerosOrdre(points, couleur, texteNumero, contour) : numerosSurTrajet(t, points, couleur, texteNumero, contour));
  });

  // Repère du processeur (ou de l'armoire) au coin de départ, hors du mur, du côté des départs ; les câbles de tête
  // longent le bord de départ jusqu'au départ le plus loin.
  let dessinRepere = null;
  if (repere && departs.length > 0) {
    const parRangees = trajets[0].orientation === 'rangees';
    const n = repere.lignes.length;
    const gauche = coin.endsWith('gauche');
    const enHaut = coin.startsWith('haut');
    const { cx, cy, w, h, taille, x: xCadre, y: yCadre } = geometrieDepart(geo, coin, { orientation: trajets[0].orientation, repere }).cadreRepere;
    const cadre = { x: xCadre, y: yCadre };
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
  svg('defs', {}, [...fleches].map(([couleur, id]) => svg('marker', {
    id, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto',
  }, svg('path', { d: 'M1,1 L9,5 L1,9 z', style: `fill: ${couleur}` })))),
  svg('rect', { x: complet.x, y: complet.y, width: complet.w, height: complet.h, style: `fill: ${palette.fond}` }),
  svg('rect', { x: 0, y: 0, width: largeur, height: hauteur, style: `fill: none; stroke: ${palette.texteDoux}`, 'stroke-width': cote * 0.02 }),
  tuiles, contours, dessinRepere, lignes);
  return { svg: racine, complet };
}
