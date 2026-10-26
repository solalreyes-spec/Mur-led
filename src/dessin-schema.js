// Dessin du schéma (SVG) à partir des résultats de calculs.js : dalles en millimètres ou en pixels, trajets
// data ou élec en serpentin, blocs de processeurs. Sert à l'écran (couleurs du thème, mode rouge compris) et à
// l'export en image (couleurs d'impression sur fond blanc). Aucun calcul ici.

import { dallesDuMur, MODELES_DISTRIBUTEUR, formeReelle, aFormeReelle, coinsTournes } from './calculs.js';
import { nombre, nombreCourt } from './format.js';
import { svg, el } from './dom.js';
import { couleurPort, stylesLignes } from './couleurs.js';
import { repereSecours, texteSecoursPort } from './secours.js';

// Ports et lignes : leur numéro d'abord (au départ et sur chaque colonne du trajet), puis leur couleur (src/couleurs.js :
// une par port en data, celle de la phase en élec, avec un motif par ligne d'une même phase) ; fond de dalles alterné
// par port ou par ligne ; retours de secours en pointillés, dans leur propre couleur. `trace(couleur)` : couleur d'un
// trajet ; `texteSur(couleur)` : chiffre sur sa pastille. Noms de dalle (`nomDalle`) à 4,5:1 sur les deux fonds (N10).
export const PALETTE_ECRAN = {
  fond: 'var(--fond)', dalle: 'var(--dalle-a)', dalleAlt: 'var(--dalle-b)', demi: 'var(--surface)', bord: 'var(--bordure)',
  contour: 'var(--trait-schema)', texte: 'var(--texte)', texteDoux: 'var(--trait-schema)', nomDalle: 'var(--texte-dalle)', accent: 'var(--famille)', police: null,
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
  + `${port.secours ? `, secours ${repereSecours(port.secours, p.numero, plusieurs)}` : ''}`
  + `${port.secours?.retourM ? `, retour ${nombreCourt(port.secours.retourM, 1)} m` : ''}`;

// Libellés d'une dalle, partagés par le schéma et la mire de mapping (src/mire.js), pour ne jamais diverger : port et
// rang de la dalle dans son câble (« 2.6 · 3 », le rang du guide pas à pas), colonne et rangée (« C3 R2 »), premier
// pixel (« x 1536 », « y 512 »).
export const rangDansTrajet = (trajet, id) => trajet.dalles.indexOf(id) + 1;
export const libellePortRang = (trajet, id) => `${trajet.numero} · ${rangDansTrajet(trajet, id)}`;
// Mur en zones : « B · C3 R2 » s'écrit « C3 R2 » sur la dalle, le nom de la zone est au-dessus de la zone.
export const lignesNomDalle = (id) => (id.includes(' · ') ? id.split(' · ')[1] : id).split(' ');
// Dalle tournée hors axe (9c4) : son premier pixel est son coin haut gauche tourné, arrondi au pixel.
export const lignesPremierPixel = (r) => {
  if (!r.rotation) return [`x ${r.x}`, `y ${r.y}`];
  const [x, y] = coinsTournes(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, r.rotation)[3];
  return [`x ${Math.round(x)}`, `y ${Math.round(y)}`];
};
// Rotation SVG d'une dalle tournée (sens inverse des aiguilles d'une montre vu de face : angle négatif en SVG).
export const transformDalle = (r) => (r.rotation ? `rotate(${-r.rotation} ${r.x + r.w / 2} ${r.y + r.h / 2})` : null);

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
        // Secours par un second processeur (étape 22) : « 3.1 », processeur de secours . port.
        etiquetteSecours: repereSecours(port.secours, p.numero, plusieurs),
        libelleSecours: port.secours ? texteSecoursPort(port.secours, p.modele) : null,
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

// Ligne de légende des retours de secours ; avec un second processeur (étape 22), l'exemple du premier repère.
export function legendeSecours(trajets) {
  const avec = trajets.filter((t) => t.secours);
  if (!avec.length) return null;
  const premier = avec.find((t) => t.secours.processeur);
  if (!premier) return 'retours de secours';
  const plusieurs = new Set(avec.map((t) => t.secours.processeur)).size > 1;
  return `retours de secours, vers ${plusieurs ? 'les processeurs' : 'le processeur'} de secours (${premier.etiquetteSecours} : ${premier.libelleSecours})`;
}

// Port d'un processeur de secours, méthode sans cascade (étape 22c, spec § 4.2.5) : le trajet du port k du principal
// parcouru dans l'autre sens, de la dernière dalle à la première ; départ numéroté du repère du secours (« 2.1 »), au
// droit de sa dernière dalle comme le bout du retour, sans retour de secours ; couleur du port gardée.
export const trajetSecoursInverse = (t) => ({
  ...t, dalles: [...t.dalles].reverse(), etiquette: t.etiquetteSecours ?? t.etiquette, secours: null, etiquetteSecours: null, inverse: true,
  // Repères du retour du principal : le départ du secours est sur la rangée de ses bouts (22e).
  retourDe: { etiquette: t.etiquette, etiquetteSecours: t.etiquetteSecours ?? '' },
});

// Géométrie de la vue : rectangles des dalles (mm ou px) et taille du cadre.
// `vue.vue` : 'physique' ou 'pixels' ; `vue.canvasVue` : 'mur' ou 'p2' (canvas du processeur n° 2).
export function geometrieSchema(vue, mur, dalle, pm) {
  return avecFormeReelle(avecAbsentes(avecZones(geometrieSansZones(vue, mur, dalle, pm)), vue, mur, dalle), vue, mur, dalle);
}

// Forme réelle (9c2) : la vue physique reste développée ; chaque pli est marqué sur le bord commun des deux zones
// (« 90° concave »), chaque zone courbe porte sa courbure (« MUR : concave 2,5° par jonction »).
function avecFormeReelle(geo, vue, mur, dalle) {
  if (vue.vue !== 'physique' || geo.canvas || !mur.zones || !aFormeReelle(mur)) return geo;
  const f = formeReelle(mur, dalle);
  const basMin = Math.min(...mur.zones.map((z) => z.basMm));
  const hautMax = basMin + mur.hauteurMm;
  const cadre = (z) => ({ x0: z.xMm, x1: z.xMm + z.largeurMm, y0: hautMax - z.basMm - z.hauteurMm, y1: hautMax - z.basMm });
  const zone = (nom) => cadre(mur.zones.find((z) => z.nom === nom));
  const deg = (x) => `${nombreCourt(x, 2)}°`;
  const plis = f.plis.map((p) => {
    const r = zone(p.zones[0]);
    const d = zone(p.zones[1]);
    const texte = `${deg(p.angleDeg)} ${p.sens}`;
    if (p.bord === 'droit') {
      const haut = Math.max(r.y0, d.y0) < Math.min(r.y1, d.y1) ? [Math.max(r.y0, d.y0), Math.min(r.y1, d.y1)] : [d.y0, d.y1];
      return { x1: r.x1, y1: haut[0], x2: r.x1, y2: haut[1], vertical: true, texte };
    }
    const y = p.bord === 'haut' ? r.y0 : r.y1;
    return { x1: Math.max(r.x0, d.x0), y1: y, x2: Math.min(r.x1, d.x1), y2: y, vertical: false, texte };
  });
  const courbures = f.zones.filter((z) => z.courbure).map((z) => {
    const c = zone(z.nom);
    return { x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0, texte: `${z.nom} : ${z.courbure.sens} ${deg(z.courbure.angleDeg)} par jonction` };
  });
  return plis.length || courbures.length ? { ...geo, plis, courbures } : geo;
}

// Formes libres (9b6) : place de chaque dalle absente, dessinée en pointillés (vue physique et vue pixels du mur).
function avecAbsentes(geo, vue, mur, dalle) {
  if (!mur.zones?.some((z) => z.forme) || geo.canvas) return geo;
  const basMin = Math.min(...mur.zones.map((z) => z.basMm));
  const hautMax = basMin + mur.hauteurMm;
  const absentes = mur.zones.filter((z) => z.forme).flatMap((z) => {
    const f = z.dalle ?? dalle;
    const yMm = hautMax - z.basMm - z.hauteurMm;
    return z.forme.colonnes.flatMap((col, j) => col.cases.filter((x) => !x.presente).map((x) => (vue.vue === 'physique'
      ? { x: z.xMm + j * f.largeurMm, y: yMm + x.yMm, w: f.largeurMm, h: x.hMm }
      : { x: z.x + j * f.pxH, y: z.y + x.y, w: f.pxH, h: x.h })));
  });
  return absentes.length ? { ...geo, absentes } : geo;
}

// Mur en zones (étape 9a) : rectangle de chaque zone (ou morceau de zone) dans la vue, d'après ses dalles. Sortie pliée
// (9b7) : aucun nom, les tranches collées ne laissent pas de place hors d'elles (liste des tranches dans l'onglet).
function avecZones(geo) {
  if ([...geo.rects.values()].some((r) => r.tranche)) return geo;
  const parZone = new Map();
  for (const r of geo.rects.values()) {
    if (!r.d?.zone) continue;
    const z = parZone.get(r.d.zone) ?? { nom: r.d.zone, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    z.x0 = Math.min(z.x0, r.x);
    z.y0 = Math.min(z.y0, r.y);
    z.x1 = Math.max(z.x1, r.x + r.w);
    z.y1 = Math.max(z.y1, r.y + r.h);
    parZone.set(r.d.zone, z);
  }
  const zones = [...parZone.values()].map((z) => ({ nom: z.nom, x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0 }));
  return zones.length ? { ...geo, zones } : geo;
}

function geometrieSansZones(vue, mur, dalle, pm) {
  const dalles = dallesDuMur(mur, dalle);
  if (vue.vue === 'physique') {
    return {
      unite: 'mm',
      largeur: mur.largeurMm,
      hauteur: mur.hauteurMm,
      rects: new Map(dalles.map((d) => [d.id, { x: d.mm.x, y: d.mm.y, w: d.mm.largeur, h: d.mm.hauteur, d, ...(d.rotation ? { rotation: d.rotation } : {}) }])),
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
      // Sortie pliée (9b7) : chaque dalle avec le nom de sa tranche, pour nommer les tranches au lieu des zones.
      rects: new Map(canvas.dalles.map((z) => [z.id, {
        x: z.x[0], y: z.y[0], w: z.x[1] - z.x[0] + 1, h: z.y[1] - z.y[0] + 1, d: parId.get(z.id), ...(z.tranche ? { tranche: z.tranche } : {}), ...(z.rotation ? { rotation: z.rotation } : {}),
      }])),
    };
  }
  return {
    unite: 'px',
    largeur: mur.pxLargeur,
    hauteur: mur.pxHauteur,
    rects: new Map(dalles.map((d) => [d.id, { x: d.px.x, y: d.px.y, w: d.px.largeur, h: d.px.hauteur, d, ...(d.rotation ? { rotation: d.rotation } : {}) }])),
  };
}

// Repère dessiné au coin de départ : processeurs (ou XD au pied du mur, la régie en fibre) pour la data, armoire
// pour l'élec, avec la distance saisie. `evaluation` : processeur retenu dans l'onglet Data. `fibre` : « Passer en fibre »
// de la config imposée (étape 18c), le convertisseur au pied du mur et la régie en fibre.
export function repereSchema(cablage, { evaluation = null, distanceM = null, fibre = null } = {}) {
  const distance = distanceM === null || distanceM === undefined ? null : nombreCourt(distanceM, 1);
  if (cablage === 'elec') return { lignes: ['Armoire', distance ? `à ${distance} m` : null].filter(Boolean) };
  if (cablage !== 'data' || !evaluation?.processeur) return null;
  const proc = evaluation.processeur;
  if (evaluation.distributeurObligatoire ?? proc.distributeurObligatoire) {
    return { lignes: [MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'Distributeur', distance ? `fibre ${distance} m` : null].filter(Boolean) };
  }
  const n = evaluation.nombre ?? 1;
  if (fibre?.possible && !fibre.deja) {
    return { lignes: [`${n > 1 ? `${n} × ` : ''}${proc.modele}`, `${fibre.modele} au pied du mur`, distance ? `fibre ${distance} m` : null].filter(Boolean) };
  }
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

// Cadrage sur un port (ou une ligne) : ses dalles et, avec `depart`, son départ (rond numéroté au bord du mur) et le
// cadre du repère (processeur, XD, CVT ou armoire) ; une marge courte autour, au format `aspect` (largeur / hauteur)
// du cadre de l'écran.
export function cadrageSurDalles(geo, dalles, aspect, { coin = 'haut-gauche', orientation = 'colonnes', repere = null, depart = true } = {}) {
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
  const boites = depart ? [...rects, { x: xd - r, y: yd - r, w: 2 * r, h: 2 * r }, ...(g.cadreRepere ? [g.cadreRepere] : [])] : rects;
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

// Cadrage du guide pas à pas : serré sur les dalles du port. Son départ (cadre du processeur, du XD, du CVT ou de
// l'armoire, et rond numéroté du port) entre dans le dessin s'il coûte peu (numéros réduits de 12 % au plus) ; sinon il
// passe dans un encart en coin, avec une flèche vers lui (« ← MCTRL660, port 4 ») et le cadrage qui le montre. L'encart
// se pose dans une bande réservée en haut du dessin (17 % de sa hauteur), au-dessus des dalles : il ne cache jamais la
// première dalle, et il prend la place du rond de départ, dont il redit le numéro.
const SEUIL_DEPART_DANS_LE_DESSIN = 0.88;
const BANDE_ENCART = 0.17;
const FLECHES = { 'haut-gauche': '↖', haut: '↑', 'haut-droite': '↗', gauche: '←', droite: '→', 'bas-gauche': '↙', bas: '↓', 'bas-droite': '↘' };
export function cadrageGuide(geo, dalles, aspect, { coin = 'haut-gauche', orientation = 'colonnes', repere = null } = {}) {
  const serre = cadrageSurDalles(geo, dalles, aspect, { coin, orientation, repere, depart: false });
  const avecDepart = cadrageSurDalles(geo, dalles, aspect, { coin, orientation, repere, depart: true });
  if (!serre || !avecDepart) return null;
  if (serre.w / avecDepart.w >= SEUIL_DEPART_DANS_LE_DESSIN) return { cadrage: avecDepart, encart: null };
  // Zoom serré avec la bande de l'encart : marge courte sur les côtés et en bas, la bande en haut.
  const rects = dalles.map((id) => geo.rects.get(id)).filter(Boolean);
  const court = Math.min(...[...geo.rects.values()].map((r) => Math.min(r.w, r.h))) * 0.4;
  let x = Math.min(...rects.map((r) => r.x)) - court;
  let w = Math.max(...rects.map((r) => r.x + r.w)) + court - x;
  const haut = Math.min(...rects.map((r) => r.y));
  const bas = Math.max(...rects.map((r) => r.y + r.h)) + court;
  let h = (bas - haut) / (1 - BANDE_ENCART);
  if (w / h < aspect) {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    h = w / aspect;
  }
  // La bande garde 17 % de la hauteur finale ; ce qui reste en trop (zoom limité par la largeur) va en bas.
  const cadrage = { x, y: haut - BANDE_ENCART * h, w, h };
  // Flèche du centre du zoom vers le départ (le cadre du repère, sinon le rond de départ de la première dalle).
  const g = geometrieDepart(geo, coin, { orientation, repere });
  const premiere = geo.rects.get(dalles[0]);
  const [xc, yc] = g.cadreRepere
    ? [g.cadreRepere.cx, g.cadreRepere.cy]
    : orientation === 'rangees' ? [g.bordX, premiere.y + premiere.h / 2] : [premiere.x + premiere.w / 2, g.bordY];
  const dx = xc - (cadrage.x + cadrage.w / 2);
  const dy = yc - (cadrage.y + cadrage.h / 2);
  const horizontal = Math.abs(dx) > 2 * Math.abs(dy) ? (dx < 0 ? 'gauche' : 'droite') : null;
  const vertical = Math.abs(dy) > 2 * Math.abs(dx) ? (dy < 0 ? 'haut' : 'bas') : null;
  const direction = horizontal ?? vertical ?? `${dy < 0 ? 'haut' : 'bas'}-${dx < 0 ? 'gauche' : 'droite'}`;
  return {
    cadrage,
    encart: {
      fleche: FLECHES[direction],
      repere: repere?.lignes?.[0] ?? null,
      // Coin de l'écran où poser l'encart : en haut (sa bande), du côté du départ.
      coin: { x: dx < 0 ? 'gauche' : 'droite', y: 'haut' },
      cadrageDepart: avecDepart,
    },
  };
}

// SVG du schéma. `cadrage` : partie visible (zoom), sinon tout ; `largeurPx` : taille en pixels pour un export.
// `ordre` : trajet du guide pas à pas, ses dalles numérotées de 1 à n dans l'ordre du câble (au lieu des numéros de
// colonne). `grand` : grand affichage, en vue physique seulement (traits plus épais, noms de dalle et numéros plus
// grands) ; la vue pixels reste telle quelle : son premier pixel (« x 1056 ») va presque jusqu'au trait central.
// Renvoie le SVG et son cadre complet.
// Grand mur (11-0) : au-delà de 2 000 dalles, le dessin se simplifie (une bande par segment de port, sans nom ni
// coordonnées de dalle) et le guide ne dessine que le port en cours ; mêmes ports, départs et couleurs.
export const SEUIL_DESSIN_SIMPLIFIE = 2000;

// Cadre complet d'un dessin : le mur et une marge de 12 % de son plus grand côté ; avec la chaîne (19b2), agrandi de ce
// qu'il faut pour la contenir, du côté du départ seulement.
export function cadreComplet(geo, chaine = null, secours = null) {
  const marge = 0.12 * Math.max(geo.largeur, geo.hauteur);
  const base = { x: -marge, y: -marge, w: geo.largeur + 2 * marge, h: geo.hauteur + 2 * marge };
  // Rangée des bouts de secours (22e), plus loin du mur que les départs : le cadre y va, du côté du départ seulement.
  const loin = secours ? rangeeSecours(geo, secours) : null;
  if (loin) {
    const { coin, trajets } = secours;
    const sens = (trajets[0].orientation === 'rangees' ? coin.endsWith('gauche') : coin.startsWith('haut')) ? -1 : 1;
    const dehors = loin.bord + sens * loin.hors;
    const [cle, taille] = trajets[0].orientation === 'rangees' ? ['x', 'w'] : ['y', 'h'];
    if (sens < 0 && dehors < base[cle]) { base[taille] += base[cle] - dehors; base[cle] = dehors; } else if (sens > 0) base[taille] = Math.max(base[taille], dehors - base[cle]);
  }
  if (!chaine?.boite) return base;
  const b = chaine.boite;
  const x = Math.min(base.x, b.x);
  const y = Math.min(base.y, b.y);
  return { x, y, w: Math.max(base.x + base.w, b.x + b.w) - x, h: Math.max(base.y + base.h, b.y + b.h) - y };
}

// Départ d'un trajet (rond numéroté au bord de départ, au droit de sa première dalle) et bout de son retour de secours,
// au droit de sa dernière dalle ; sur le départ de sa chaîne (une colonne par port), le bout passe plus loin du mur et le
// pointillé longe le trait principal sans le cacher. Partagé par le dessin des trajets et la chaîne (19b2).
const rayonDepart = (police, etiquette) => police * (etiquette.length > 3 ? 1.2 : 0.95);

// Rangée des bouts de secours (22e) : distance du bord de départ au centre des bouts, pour toute redondance ; plus loin du
// mur que les ronds des départs (et que la ligne des câbles de tête qui longe le bord), jamais sur eux.
function horsBoutsSecours(trajets, police, trait) {
  const avec = trajets.filter((t) => t.secours || t.retourDe).map((t) => t.retourDe ?? t);
  if (!avec.length) return 0;
  return Math.max(...avec.map((t) => rayonDepart(police, t.etiquette)))
    + Math.max(...avec.map((t) => rayonDepart(police, t.etiquetteSecours ?? '')))
    + trait * 1.5;
}

// Étendue de la rangée des bouts pour le cadre complet : `bord` (bord de départ, sur l'axe du départ) et `hors` (du bord
// au dehors des bouts, avec une demi-police de marge), ou null sans retour de secours.
function rangeeSecours(geo, { coin, trajets, grand = false }) {
  if (!trajets?.some((t) => t.secours || t.retourDe)) return null;
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const police = cote * 0.2;
  const trait = cote * 0.07 * (grand && geo.unite !== 'px' ? 1.35 : 1);
  const parRangees = trajets[0].orientation === 'rangees';
  const bord = parRangees ? (coin.endsWith('gauche') ? -marge * 0.35 : largeur + marge * 0.35) : (coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35);
  const rS = Math.max(...trajets.filter((t) => t.secours || t.retourDe).map((t) => rayonDepart(police, (t.retourDe ?? t).etiquetteSecours ?? '')));
  return { bord, hors: horsBoutsSecours(trajets, police, trait) + rS + police * 0.5 };
}
function pointsTrajet(t, rects, { bordX, bordY, police, trait, versExterieurX, versExterieurY, horsBouts = 0 }) {
  const ids = t.dalles.filter((id) => rects.has(id));
  if (ids.length === 0) return null;
  const points = ids.map((id) => centre(rects.get(id)));
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  const parRangees = t.orientation === 'rangees';
  // Port d'un processeur de secours (inverse) : son départ est au bout du retour du principal, sur la rangée des bouts.
  const [xd, yd] = t.inverse ? (parRangees ? [bordX + versExterieurX * horsBouts, y0] : [x0, bordY + versExterieurY * horsBouts])
    : parRangees ? [bordX, y0] : [x0, bordY];
  const rDepart = rayonDepart(police, t.etiquette);
  const rSecours = t.etiquetteSecours ? rayonDepart(police, t.etiquetteSecours) : 0;
  // Bout du retour sur sa propre rangée (22e), plus loin du mur que les départs ; sur la ligne de sa première dalle
  // (une colonne ou une rangée par port), le retour longe le trait principal sans le cacher.
  const surDepart = Boolean(t.secours) && Math.abs(parRangees ? yn - y0 : xn - x0) < trait;
  const decalage = surDepart ? trait * 1.6 : 0;
  const [xs, ys] = !t.secours ? (parRangees ? [bordX, yn] : [xn, bordY])
    : parRangees ? [bordX + versExterieurX * horsBouts, yn + decalage] : [xn + decalage, bordY + versExterieurY * horsBouts];
  return { ids, points, x0, y0, xn, yn, xd, yd, xs, ys, rDepart, rSecours, surDepart, decalage };
}

// Cadres côte à côte le long d'un bord : chacun au plus près de son centre voulu, sans se toucher (écart `ecart`) ; les
// cadres qui se gênent forment un groupe centré sur la moyenne de leurs centres voulus. Renvoie les centres, dans l'ordre.
function espacer(items, ecart) {
  const ordre = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.centre - b.centre || a.i - b.i);
  const placer = (g) => {
    let decalage = 0;
    const offsets = g.membres.map((m) => {
      const o = decalage + m.taille / 2;
      decalage += m.taille + ecart;
      return o;
    });
    g.debut = g.membres.reduce((s, m, k) => s + m.centre - offsets[k], 0) / g.membres.length;
    g.total = decalage - ecart;
    g.offsets = offsets;
    return g;
  };
  let groupes = ordre.map((m) => placer({ membres: [m] }));
  for (let k = 0; k < groupes.length - 1;) {
    const [a, b] = [groupes[k], groupes[k + 1]];
    if (a.debut + a.total + ecart > b.debut + 1e-9) {
      groupes = [...groupes.slice(0, k), placer({ membres: [...a.membres, ...b.membres] }), ...groupes.slice(k + 2)];
      k = Math.max(0, k - 1);
    } else {
      k += 1;
    }
  }
  const centres = new Array(items.length);
  for (const g of groupes) g.membres.forEach((m, k) => { centres[m.i] = g.debut + g.offsets[k]; });
  return centres;
}

// Étiquette d'une liaison coupée après ses virgules, en lignes de 24 caractères au plus quand c'est possible.
function couperEtiquette(texte, max = 24) {
  const lignes = [];
  for (const morceau of texte.split(/(?<=,) /)) {
    const derniere = lignes[lignes.length - 1];
    if (derniere && derniere.length + 1 + morceau.length <= max) lignes[lignes.length - 1] = `${derniere} ${morceau}`;
    else lignes.push(morceau);
  }
  return lignes;
}

// Taille d'un cadre de texte : première ligne en gras (0,7 de la taille par caractère), les suivantes à 0,85 de la taille.
function tailleCadre(lignes, taille) {
  const plusLong = Math.max(...lignes.map((l, i) => l.length * (i === 0 ? 0.7 : 0.85 * 0.6)));
  return { w: plusLong * taille + taille * 1.2, h: taille * (1.25 * lignes.length + 0.6) };
}

// Chaîne dans le dessin du mur (19b2, spec § 4.3), vue de tout le mur en câblage data : un cadre par processeur sur le
// bord de départ, au droit de ses départs, plus loin du mur que les ronds des départs (et les bouts de secours qui y
// passent) ; ses appareils au pied du mur (`aval` de chaineSchema : CVT, XD, XD miroirs, paires, transceivers) entre les
// départs et lui, chacun au droit de ses ports, et une liaison (fibre ou cuivre 10G) du processeur à chacun, avec une
// étiquette par processeur plus loin que son cadre ; les câbles de tête partent de l'appareil (les retours de secours
// d'un XD miroir aussi) ; sans appareil, le chemin des câbles de tête le long du bord. Au-delà de PROCESSEURS_CADRES_MAX,
// rien ici : un seul cadre au coin (`repereChaine`). Renvoie les cadres, liaisons, étiquettes, chemins, le point
// d'attache de chaque trajet et la boîte de l'ensemble (pour `cadreComplet`), ou null.
export function geometrieChaine(geo, coin, trajets, aval, { grand = false } = {}) {
  if (!aval?.length || !trajets?.length || (aval.length === 1 && aval[0].nombre > 1)) return null;
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const police = cote * 0.2;
  const trait = cote * 0.07 * (grand && geo.unite !== 'px' ? 1.35 : 1);
  const parRangees = trajets[0].orientation === 'rangees';
  const bordY = coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35;
  const bordX = coin.endsWith('gauche') ? -marge * 0.35 : largeur + marge * 0.35;
  const versExterieurY = coin.startsWith('haut') ? -1 : 1;
  const versExterieurX = coin.endsWith('gauche') ? -1 : 1;
  const bord = parRangees ? bordX : bordY;
  const s = parRangees ? versExterieurX : versExterieurY;
  // Point à `le` le long du bord de départ et `hors` plus loin du mur que lui.
  const pt = (le, hors) => (parRangees ? [bord + s * hors, le] : [le, bord + s * hors]);
  const leDe = ([x, y]) => (parRangees ? y : x);
  const horsDe = ([x, y]) => s * ((parRangees ? x : y) - bord);
  const horsBouts = horsBoutsSecours(trajets, police, trait);
  const points = new Map(trajets.map((t) => [t.cle, pointsTrajet(t, rects, { bordX, bordY, police, trait, versExterieurX, versExterieurY, horsBouts })]));
  // Profondeur des départs : ronds et bouts de secours qui passent plus loin du mur.
  let profondeur = 0;
  for (const p of points.values()) {
    if (!p) continue;
    profondeur = Math.max(profondeur, horsDe([p.xd, p.yd]) + p.rDepart);
    if (p.rSecours) profondeur = Math.max(profondeur, horsDe([p.xs, p.ys]) + p.rSecours);
  }
  const taille = police * (grand ? 1.1 : 1);
  const tailleEtiquette = taille * 0.85;
  const dims = (lignes) => {
    const { w, h } = tailleCadre(lignes, taille);
    return { w, h, le: parRangees ? h : w, hors: parRangees ? w : h };
  };
  const numeroPort = (t) => Number(t.cle.split('-')[1]);
  const processeurs = [...new Set(trajets.map((t) => t.processeur))];
  const milieu = (valeurs) => (Math.min(...valeurs) + Math.max(...valeurs)) / 2;

  const elements = aval.map((e, i) => {
    const siens = trajets.filter((t) => t.processeur === processeurs[i] && points.get(t.cle));
    const departs = siens.map((t) => leDe([points.get(t.cle).xd, points.get(t.cle).yd]));
    const appareils = e.appareils.map((a) => {
      const principaux = siens.filter((t) => a.ports.includes(numeroPort(t)));
      const secours = siens.filter((t) => t.secours && a.ports.includes(t.secours.numero));
      const le = [...principaux.map((t) => leDe([points.get(t.cle).xd, points.get(t.cle).yd])),
        ...secours.map((t) => leDe([points.get(t.cle).xs, points.get(t.cle).ys]))];
      return { a, principaux, secours: a.miroir ? secours : [], voulu: le.length ? milieu(le) : milieu(departs), lignes: [a.nom], ...dims([a.nom]) };
    });
    const lignes = appareils.length ? [e.nom] : [e.nom, e.versDalles.replace(/^câbles de tête(, )?/, '')].filter(Boolean);
    const etiquette = e.liaison && appareils.length ? couperEtiquette(e.liaison.texte) : null;
    const etiquetteDims = etiquette ? (() => {
      const w = Math.max(...etiquette.map((l) => l.length)) * 0.6 * tailleEtiquette;
      const h = etiquette.length * 1.2 * tailleEtiquette;
      return { w, h, le: parRangees ? h : w, hors: parRangees ? w : h };
    })() : null;
    // Processeur de secours (étape 22, cadre « MCTRL4K secours n° 3 ») : sur la rangée des processeurs, au droit des bouts
    // de ses retours, donc à côté de son principal ; chaque retour relié à lui en pointillés.
    const retours = e.secours ? siens.filter((t) => t.secours?.processeur) : [];
    const secours = retours.length ? {
      retours, lignes: [e.secours.nom], ...dims([e.secours.nom]),
      voulu: milieu(retours.map((t) => leDe([points.get(t.cle).xs, points.get(t.cle).ys]))),
    } : null;
    return { e, siens, departs, appareils, lignes, ...dims(lignes), voulu: departs.length ? milieu(departs) : 0, etiquette, etiquetteDims, secours };
  });
  const tousAppareils = elements.flatMap((x) => x.appareils);
  const ecart = police * 0.5;
  espacer(tousAppareils.map((a) => ({ centre: a.voulu, taille: a.le })), ecart).forEach((c, k) => { tousAppareils[k].centre = c; });
  const rangee = elements.flatMap((x) => [{ x, taille: Math.max(x.le, x.etiquetteDims?.le ?? 0), voulu: x.voulu }, ...(x.secours ? [{ x: x.secours, taille: x.secours.le, voulu: x.secours.voulu }] : [])]);
  espacer(rangee.map((y) => ({ centre: y.voulu, taille: y.taille })), ecart).forEach((c, k) => { rangee[k].x.centre = c; });
  const tousSecours = elements.map((x) => x.secours).filter(Boolean);
  // Câbles de tête partis d'un appareil (et retours d'un XD miroir) : chacun son point d'attache sur le côté de l'appareil
  // tourné vers le mur, dans l'ordre de ses départs ; il sort droit de l'appareil jusqu'à son niveau, longe le bord
  // jusqu'au droit de son départ, puis arrive droit sur son rond (jamais sur un autre). Niveaux : le plus long câble le
  // plus près des appareils, deux câbles qui se recouvrent le long du bord jamais au même niveau.
  const cables = tousAppareils.flatMap((a) => {
    const cibles = a.principaux.map((t) => ({ t, vers: [points.get(t.cle).xd, points.get(t.cle).yd] }))
      .sort((u, w) => leDe(u.vers) - leDe(w.vers));
    // Départ en face de l'appareil : le câble sort en face de lui, tout droit.
    return cibles.map((c, k) => {
      const cible = leDe(c.vers);
      const enFace = cibles.length === 1 && Math.abs(cible - a.centre) <= a.le * 0.35;
      const attache = enFace ? cible : a.centre - a.le * 0.35 + (cibles.length > 1 ? (a.le * 0.7 * k) / (cibles.length - 1) : a.le * 0.35);
      return { ...c, carte: 'principal', appareil: a, cible, attache, bas: Math.min(cible, attache), haut: Math.max(cible, attache) };
    });
  });
  // Retours de secours (22e) : un tronc commun par XD miroir ou par processeur de secours. Il part du cadre (queue droite
  // jusqu'à son niveau), longe le bord au droit de tous les bouts de ses retours ; chaque bout y descend par un petit trait.
  const troncs = [
    ...tousAppareils.filter((a) => a.secours.length).map((a) => ({ appareil: a, du: 'appareil', retours: a.secours })),
    ...tousSecours.map((sc) => ({ appareil: sc, du: 'secours', retours: sc.retours })),
  ].map((tr) => {
    const bouts = tr.retours.map((t) => ({ t, cible: leDe([points.get(t.cle).xs, points.get(t.cle).ys]) }));
    const toutes = [tr.appareil.centre, ...bouts.map((b) => b.cible)];
    return { ...tr, bouts, bas: Math.min(...toutes), haut: Math.max(...toutes) };
  });
  const niveaux = [];
  const marge2 = police * 0.3;
  for (const c of [...cables, ...troncs].sort((u, w) => (w.haut - w.bas) - (u.haut - u.bas))) {
    const [bas, haut] = [c.bas - marge2, c.haut + marge2];
    let n = niveaux.findIndex((pris) => pris.every(([b, h]) => h <= bas || b >= haut));
    if (n < 0) n = niveaux.push([]) - 1;
    niveaux[n].push([bas, haut]);
    c.niveau = n;
  }
  // Rangée des appareils au-delà de la bande des câbles, puis celle des processeurs ; leurs étiquettes plus loin encore.
  const pas = trait * 1.6;
  const hors0 = profondeur + police * 0.4 + pas * (niveaux.length + 1);
  const horsAppareils = tousAppareils.length ? Math.max(...tousAppareils.map((a) => a.hors)) : 0;
  const centreAppareils = hors0 + horsAppareils / 2;
  const horsProcesseurs = Math.max(...elements.map((x) => x.hors), ...tousSecours.map((x) => x.hors));
  const centreProcesseurs = (tousAppareils.length ? hors0 + horsAppareils + police * 2 : hors0) + horsProcesseurs / 2;

  const boite = (le, hors, d) => {
    const [cx, cy] = pt(le, hors);
    return { cx, cy, x: cx - d.w / 2, y: cy - d.h / 2, w: d.w, h: d.h };
  };
  const cadres = [];
  const liaisons = [];
  const etiquettes = [];
  const chemins = [];
  const appareilDe = new Map();
  const descentes = new Map();
  const dessinsTroncs = [];
  for (const c of cables) {
    const niveau = hors0 - pas * (c.niveau + 1);
    appareilDe.set(c.t.cle, [pt(c.attache, centreAppareils - c.appareil.hors / 2), pt(c.attache, niveau), pt(c.cible, niveau)]);
  }
  for (const tr of troncs) {
    const niveau = hors0 - pas * (tr.niveau + 1);
    const centreRangee = tr.du === 'secours' ? centreProcesseurs : centreAppareils;
    dessinsTroncs.push({
      queue: [pt(tr.appareil.centre, centreRangee - tr.appareil.hors / 2), pt(tr.appareil.centre, niveau)],
      rail: tr.bas < tr.haut ? [pt(tr.bas, niveau), pt(tr.haut, niveau)] : null,
    });
    for (const b of tr.bouts) {
      const p = points.get(b.t.cle);
      descentes.set(b.t.cle, [pt(b.cible, niveau), pt(b.cible, horsDe([p.xs, p.ys]) + p.rSecours)]);
    }
  }
  for (const x of elements) {
    // Cadres dans l'ordre, du mur vers l'extérieur : les appareils, puis le processeur.
    const versMur = pt(x.centre, centreProcesseurs - x.hors / 2);
    for (const a of x.appareils) {
      cadres.push({ role: 'appareil', nom: a.a.nom, lignes: a.lignes, taille, ...boite(a.centre, centreAppareils, a) });
      liaisons.push({ genre: x.e.liaison?.genre ?? 'fibre', de: versMur, a: pt(a.centre, centreAppareils + a.hors / 2) });
    }
    cadres.push({ role: 'processeur', nom: x.e.nom, lignes: x.lignes, taille, ...boite(x.centre, centreProcesseurs, x) });
    if (x.secours) cadres.push({ role: 'secours', nom: x.e.secours.nom, lignes: x.secours.lignes, taille, ...boite(x.secours.centre, centreProcesseurs, x.secours) });
    if (x.etiquette) {
      const d = x.etiquetteDims;
      const b = boite(x.centre, centreProcesseurs + x.hors / 2 + taille * 0.4 + d.hors / 2, d);
      etiquettes.push({ texte: x.e.liaison.texte, lignes: x.etiquette, taille: tailleEtiquette, ancre: parRangees ? 'start' : 'middle', ...b });
    }
    if (!x.appareils.length && x.departs.length) {
      // Câbles de tête du processeur : jusqu'au bord, puis le long du bord jusqu'au départ le plus loin.
      const bas = Math.min(x.centre, ...x.departs);
      const haut = Math.max(x.centre, ...x.departs);
      chemins.push([[versMur, pt(x.centre, 0)], [pt(bas, 0), pt(haut, 0)]]);
    }
  }
  const boites = [...cadres, ...etiquettes];
  const pad = police * 0.5;
  const bx = Math.min(...boites.map((b) => b.x)) - pad;
  const by = Math.min(...boites.map((b) => b.y)) - pad;
  return {
    cadres, liaisons, etiquettes, chemins, appareilDe, troncs: dessinsTroncs, descentes,
    boite: { x: bx, y: by, w: Math.max(...boites.map((b) => b.x + b.w)) + pad - bx, h: Math.max(...boites.map((b) => b.y + b.h)) + pad - by },
  };
}

// Au-delà de PROCESSEURS_CADRES_MAX processeurs (19b2) : un seul cadre au coin de départ, le repère d'avant, avec le nom
// (« 7 × MCTRL660 »), les appareils au pied du mur et la liaison, ou la régie sans appareil.
export function repereChaine(e) {
  if (!e.appareils?.length) return { lignes: [e.nom, e.versDalles.replace(/^câbles de tête(, )?/, '')].filter(Boolean) };
  const noms = e.appareils.map((a) => a.nom);
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0];
  return { lignes: [e.nom, `${liste} au pied du mur`, e.liaison?.texte].filter(Boolean) };
}

// Guide pas à pas d'un grand mur : seulement les dalles du port en cours, dans le cadre du mur entier.
export function geometrieGuide(geo, dalles) {
  if (geo.rects.size <= SEUIL_DESSIN_SIMPLIFIE) return geo;
  return { ...geo, rects: new Map(dalles.filter((id) => geo.rects.has(id)).map((id) => [id, geo.rects.get(id)])), absentes: [] };
}

// Bandes du dessin simplifié : les dalles voisines d'un même trajet et d'un même fond, dans une même colonne (une même
// rangée pour un câblage par rangées), réunies en un rectangle ; une dalle tournée reste seule.
function bandesDalles(rects, trajets, fondDalle) {
  const trajetDe = new Map(trajets.flatMap((t) => t.dalles.map((id) => [id, t])));
  const groupes = new Map();
  const seules = [];
  for (const [id, r] of rects) {
    if (r.rotation) {
      seules.push({ ...r, fond: fondDalle(id, r), transform: transformDalle(r) });
      continue;
    }
    const t = trajetDe.get(id);
    const parRangees = t?.orientation === 'rangees';
    const fond = fondDalle(id, r);
    const cle = `${t?.cle ?? ''}|${fond}|${parRangees ? `r${r.y}|${r.h}` : `c${r.x}|${r.w}`}`;
    if (!groupes.has(cle)) groupes.set(cle, { parRangees, fond, rects: [] });
    groupes.get(cle).rects.push(r);
  }
  const bandes = [];
  for (const { parRangees, fond, rects: liste } of groupes.values()) {
    const [debut, longueur] = parRangees ? ['x', 'w'] : ['y', 'h'];
    liste.sort((a, b) => a[debut] - b[debut]);
    let b = null;
    for (const r of liste) {
      if (b && r[debut] <= b[debut] + b[longueur] + 1e-6 * r[longueur]) {
        b[longueur] = Math.max(b[longueur], r[debut] + r[longueur] - b[debut]);
      } else {
        b = { x: r.x, y: r.y, w: r.w, h: r.h, fond };
        bandes.push(b);
      }
    }
  }
  return [...bandes, ...seules];
}

// Points d'un trajet sans ses points alignés (dessin simplifié) : le trait est le même, avec une flèche à chaque coude.
function sansPointsAlignes(points) {
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const [a, b] = [points[i - 1], points[i + 1]];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9 * (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])) ** 2;
  });
}

export function construireSvg({
  geo, trajets, coin, blocs = [], palette = PALETTE_ECRAN, cadrage = null, selection = null, dalleChoisie = null, largeurPx = null,
  repere = null, ordre = null, grand = false, simplifie = null, boitiers = null, chaine = null,
}) {
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const complet = cadreComplet(geo, chaine, { coin, trajets, grand });
  const simple = simplifie ?? rects.size > SEUIL_DESSIN_SIMPLIFIE;
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
    const lignesCoord = lignesPremierPixel(r);
    const plusLong = Math.max(...lignesCoord.map((l) => l.length));
    const taille = Math.min(cote * 0.11, (cote * 0.3) / (0.62 * plusLong));
    return ligne(r.x + bordTexte, r.y + r.h - bordTexte - taille * 1.35, taille, lignesCoord);
  };
  const tuiles = simple ? bandesDalles(rects, trajets, fondDalle).map((b) => svg('rect', {
    class: 'bande', x: b.x, y: b.y, width: b.w, height: b.h, transform: b.transform ?? null,
    style: `fill: ${b.fond}; stroke: ${palette.bord}`, 'stroke-width': cote * 0.015,
  })) : [...rects.entries()].map(([id, r]) => {
    const choisie = id === dalleChoisie;
    const tailleNom = cote * (grandPhysique ? 0.177 : 0.16);
    return svg('g', { 'data-dalle': id, transform: transformDalle(r) },
      svg('rect', {
        class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${choisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h,
        style: `fill: ${fondDalle(id, r)}; stroke: ${choisie ? palette.accent : palette.bord}`,
        'stroke-width': cote * (choisie ? 0.05 : 0.015),
      }),
      ligne(r.x + bordTexte, r.y + cote * 0.05 + tailleNom * 0.8, tailleNom, lignesNomDalle(id)),
      geo.unite === 'px' ? coordonnees(r) : null);
  });

  // Formes libres (9b6) : chaque dalle absente en pointillés, sans fond.
  const absentes = (geo.absentes ?? []).map((r) => svg('rect', {
    class: 'dalle-absente', x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none',
    style: `stroke: ${palette.bord}`, 'stroke-width': cote * 0.02, 'stroke-dasharray': `${cote * 0.06} ${cote * 0.05}`,
  }));

  // Mur en zones : nom de chaque zone hors du mur, du côté opposé au départ, au-delà du nom des blocs ; réduit pour
  // tenir dans la largeur de sa zone.
  const nomsZones = (geo.zones ?? []).map((z) => {
    const taille = Math.min(police * 1.3, (z.w * 0.9) / (0.62 * Math.max(1, z.nom.length)));
    const y = coin.startsWith('haut') ? z.y + z.h + police * 3.2 + taille : z.y - police * 2.8;
    return svg('text', {
      class: 'nom-zone', x: z.x + z.w / 2, y, 'font-size': taille, 'text-anchor': 'middle', 'font-weight': 700, style: `fill: ${palette.texte}`,
    }, z.nom);
  });

  // Forme réelle (9c2) : plis en trait mixte sur le bord commun, angle et courbure écrits hors du mur, du côté opposé
  // au départ, au-delà des noms des zones.
  const versHaut = !coin.startsWith('haut');
  const plis = (geo.plis ?? []).map((p) => svg('g', {},
    svg('line', {
      class: 'pli', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, style: `stroke: ${palette.contour}`, 'stroke-width': trait * 0.8,
      'stroke-dasharray': `${trait * 3} ${trait * 1.2} ${trait * 0.4} ${trait * 1.2}`,
    }),
    p.vertical
      ? svg('text', {
        class: 'etiquette-pli', x: p.x1, y: versHaut ? Math.min(p.y1, p.y2) - police * 5.6 : Math.max(p.y1, p.y2) + police * 6.2,
        'font-size': police * 0.9, 'text-anchor': 'middle', style: `fill: ${palette.texte}`,
      }, p.texte)
      : svg('text', {
        class: 'etiquette-pli', x: coin.endsWith('gauche') ? p.x2 + police * 0.6 : p.x1 - police * 0.6, y: p.y1 + police * 0.35,
        'font-size': police * 0.9, 'text-anchor': coin.endsWith('gauche') ? 'start' : 'end', style: `fill: ${palette.texte}`,
      }, p.texte)));
  const courbures = (geo.courbures ?? []).map((c) => svg('text', {
    class: 'etiquette-courbure', x: c.x + c.w / 2, y: versHaut ? c.y - police * 4.3 : c.y + c.h + police * 4.8,
    'font-size': Math.min(police * 0.9, (c.w * 0.95) / (0.55 * c.texte.length)), 'text-anchor': 'middle', style: `fill: ${palette.texte}`,
  }, c.texte));

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
  const departs = [];
  // Distribution (étape 12c) : `boitiers` = [{ nom: 'B1', trajets: ['l1', 'l4', …] }]. Chaque boîtier est un petit cadre
  // hors du mur, sur le bord de départ, au droit de ses lignes et plus loin que leurs départs ; ses lignes partent de lui.
  const departDe = new Map(trajets.map((t) => {
    const r = t.dalles.map((id) => rects.get(id)).find(Boolean);
    if (!r) return [t.cle, null];
    const [x0, y0] = centre(r);
    return [t.cle, t.orientation === 'rangees' ? [bordX, y0] : [x0, bordY]];
  }));
  const boitierRangees = trajets[0]?.orientation === 'rangees';
  const hBoitier = police * 1.5;
  const wBoitier = police * 2.4;
  const ecartBoitier = Math.max(marge * 0.35, police * 1.2 + (boitierRangees ? wBoitier : hBoitier) / 2 + trait);
  const milieu = (valeurs) => (Math.min(...valeurs) + Math.max(...valeurs)) / 2;
  const cadresBoitiers = (boitiers ?? []).map((b) => {
    const points = b.trajets.map((cle) => departDe.get(cle)).filter(Boolean);
    if (!points.length) return null;
    const [cx, cy] = boitierRangees
      ? [bordX + versExterieurX * ecartBoitier, milieu(points.map((p) => p[1]))]
      : [milieu(points.map((p) => p[0])), bordY + versExterieurY * ecartBoitier];
    // Point d'attache des lignes : le côté du cadre tourné vers le mur.
    const attache = boitierRangees ? [cx - versExterieurX * (wBoitier / 2), cy] : [cx, cy - versExterieurY * (hBoitier / 2)];
    return { ...b, cx, cy, attache };
  }).filter(Boolean);
  const boitierDe = new Map(cadresBoitiers.flatMap((b) => b.trajets.map((cle) => [cle, b])));
  const departsDirects = [];
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
  const numerosOrdre = (t, ids, points, fond, texteNumero, contour) => points.map(([x, y], i) => {
    const libelle = `${rangDansTrajet(t, ids[i])}`;
    const h = policeOrdre * 1.42;
    const w = Math.max(h, policeOrdre * 0.62 * libelle.length + cote * 0.1);
    const [cx, cy] = [x + cote * 0.24, y - cote * 0.24];
    return svg('g', { class: 'ordre-dalle' },
      svg('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, style: `fill: ${fond}; stroke: ${contour}`, 'stroke-width': trait * 0.35 }),
      svg('text', {
        x: cx, y: cy, 'font-size': policeOrdre, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `fill: ${texteNumero}`,
      }, libelle));
  });
  const horsBouts = horsBoutsSecours(trajets, police, trait);
  const lignes = trajets.map((t) => {
    // Bout du retour de secours, numéroté comme les départs (`pointsTrajet`).
    const pts = pointsTrajet(t, rects, { bordX, bordY, police, trait, versExterieurX, versExterieurY, horsBouts });
    if (!pts) return null;
    const { ids, points, x0, y0, xn, yn, xd, yd, xs, ys, rSecours, decalage } = pts;
    const parRangees = t.orientation === 'rangees';
    departs.push(parRangees ? yd : xd);
    // Câbles de tête partis d'un boîtier (élec, 12c) ou d'un appareil au pied du mur (data, 19b2).
    const boitier = boitierDe.get(t.cle);
    // Appareil au pied du mur (data, 19b2) : point d'attache et coude du câble de tête (`geometrieChaine`).
    const appareil = chaine?.appareilDe.get(t.cle);
    if (!boitier && !appareil) departsDirects.push(parRangees ? yd : xd);
    const [xn2, yn2] = parRangees ? [xn, yn + decalage] : [xn + decalage, yn];
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
    const listePoints = (simple ? sansPointsAlignes(points) : points).map((p) => p.join(',')).join(' ');
    // Ligne d'un boîtier : elle part de lui (trait du boîtier jusqu'à son départ, sous le rond numéroté).
    const depuisBoitier = boitier ? [
      lisere ? svg('line', {
        class: 'lisere', x1: boitier.attache[0], y1: boitier.attache[1], x2: xd, y2: yd, style: lisere, 'stroke-width': largeurTrait * 1.2, 'stroke-linecap': 'round',
      }) : null,
      svg('line', {
        class: 'depuis-boitier', x1: boitier.attache[0], y1: boitier.attache[1], x2: xd, y2: yd, style, 'stroke-width': largeurTrait * 0.8,
        'stroke-linecap': 'round', 'stroke-dasharray': tirets,
      }),
    ] : null;
    const depuisAppareil = appareil ? svg('polyline', {
      class: 'depuis-appareil', points: [...appareil, [xd, yd]].map((p) => p.join(',')).join(' '), style,
      'stroke-width': largeurTrait * 0.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': tirets,
    }) : null;
    // Bout du retour relié au tronc commun de son XD miroir ou de son processeur de secours (22e) : un petit trait.
    const descente = chaine?.descentes.get(t.cle);
    const versTronc = descente && t.etiquetteSecours ? svg('line', {
      class: 'descente-secours', x1: descente[0][0], y1: descente[0][1], x2: descente[1][0], y2: descente[1][1], style: `fill: none; stroke: ${palette.secours}`,
      'stroke-width': largeurTrait * 0.6, 'stroke-linecap': 'round', 'stroke-dasharray': `${trait * 1.2} ${trait * 1.2}`,
    }) : null;
    return svg('g', { 'data-trajet': t.cle, class: actif ? null : 'attenue' },
      depuisBoitier,
      depuisAppareil,
      versTronc,
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
      svg('circle', { class: 'depart', cx: xd, cy: yd, r: rayonDepart(police, t.etiquette), style: `fill: ${couleur}; stroke: ${contour}`, 'stroke-width': trait * 0.6 }),
      svg('text', {
        class: 'numero-trajet', x: xd, y: yd, 'font-size': police * (t.etiquette.length > 3 ? 0.62 : 0.95), style: `fill: ${texteNumero}`,
        'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, t.etiquette),
      // Dessin simplifié : le numéro au départ seulement (pas de pastille sur chaque colonne).
      t.cle === ordre ? numerosOrdre(t, ids, points, couleur, texteNumero, contour) : simple ? null : numerosSurTrajet(t, points, couleur, texteNumero, contour));
  });

  // Repère du processeur (ou de l'armoire) au coin de départ, hors du mur, du côté des départs ; les câbles de tête
  // longent le bord de départ jusqu'au départ le plus loin.
  let dessinRepere = null;
  // Boîtiers de la distribution : cadre « B1 » au fond du dessin, sous les lignes qui en partent.
  const dessinBoitiers = cadresBoitiers.length ? svg('g', { class: 'boitiers' }, cadresBoitiers.map((b) => svg('g', { class: 'boitier', 'data-boitier': b.nom },
    svg('rect', {
      x: b.cx - wBoitier / 2, y: b.cy - hBoitier / 2, width: wBoitier, height: hBoitier, rx: police * 0.3,
      style: `fill: ${palette.fond}; stroke: ${palette.contour}`, 'stroke-width': trait * 0.5,
    }),
    svg('text', {
      x: b.cx, y: b.cy, 'font-size': police * 0.95, style: `fill: ${palette.texte}`, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    }, b.nom)))) : null;
  if (repere && departs.length > 0) {
    const parRangees = trajets[0].orientation === 'rangees';
    const n = repere.lignes.length;
    const gauche = coin.endsWith('gauche');
    const enHaut = coin.startsWith('haut');
    const { cx, cy, w, h, taille, x: xCadre, y: yCadre } = geometrieDepart(geo, coin, { orientation: trajets[0].orientation, repere }).cadreRepere;
    const cadre = { x: xCadre, y: yCadre };
    // Câbles de tête : du repère au départ le plus loin, le long du bord de départ.
    // Lignes directes seulement : celles d'un boîtier partent de lui.
    const loin = (liste) => (parRangees ? (enHaut ? Math.max(...liste) : Math.min(...liste)) : (gauche ? Math.max(...liste) : Math.min(...liste)));
    const chemin = !departsDirects.length ? null : parRangees
      ? { x1: bordX, y1: enHaut ? cadre.y + h : cadre.y, x2: bordX, y2: loin(departsDirects) }
      : { x1: gauche ? cadre.x + w : cadre.x, y1: bordY, x2: loin(departsDirects), y2: bordY };
    // Câble P17 32 A tri : de l'armoire au boîtier le plus loin, sur la ligne des boîtiers, en tirets.
    const plusLoin = cadresBoitiers.length ? loin(cadresBoitiers.map((b) => (parRangees ? b.cy : b.cx))) : null;
    const ligneBoitiers = cadresBoitiers.length ? (parRangees ? cadresBoitiers[0].cx : cadresBoitiers[0].cy) : null;
    const p17 = cadresBoitiers.length ? (parRangees
      ? [[cx, cy], [ligneBoitiers, cy], [ligneBoitiers, plusLoin]]
      : [[cx, cy], [cx, ligneBoitiers], [plusLoin, ligneBoitiers]]) : null;
    dessinRepere = svg('g', { class: 'repere' },
      chemin ? svg('line', {
        class: 'chemin-tete', ...chemin,
        style: `stroke: ${palette.contour}`, 'stroke-width': trait * 0.5, 'stroke-dasharray': `${trait * 0.3} ${trait * 0.9}`, 'stroke-linecap': 'round',
      }) : null,
      p17 ? svg('polyline', {
        class: 'cable-p17', points: p17.map((p) => p.join(',')).join(' '), fill: 'none',
        style: `fill: none; stroke: ${palette.contour}`, 'stroke-width': trait * 0.6, 'stroke-dasharray': `${trait * 1.6} ${trait * 0.9}`, 'stroke-linejoin': 'round',
      }) : null,
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

  // Chaîne (19b2) : liaisons sous les cadres, chemins des câbles de tête en pointillés comme ceux du repère.
  const dessinChaine = chaine ? svg('g', { class: 'chaine' },
    chaine.chemins.map((segments) => svg('path', {
      class: 'chemin-tete', d: segments.map(([a, b]) => `M${a.join(',')} L${b.join(',')}`).join(' '), fill: 'none',
      style: `stroke: ${palette.contour}`, 'stroke-width': trait * 0.5, 'stroke-dasharray': `${trait * 0.3} ${trait * 0.9}`, 'stroke-linecap': 'round',
    })),
    chaine.troncs.map((tr) => svg('g', { class: 'troncs-secours' },
      tr.rail ? svg('line', {
        class: 'tronc-secours', x1: tr.rail[0][0], y1: tr.rail[0][1], x2: tr.rail[1][0], y2: tr.rail[1][1], style: `fill: none; stroke: ${palette.secours}`,
        'stroke-width': trait * 0.6, 'stroke-linecap': 'round', 'stroke-dasharray': `${trait * 1.2} ${trait * 1.2}`,
      }) : null,
      svg('line', {
        class: 'queue-secours', x1: tr.queue[0][0], y1: tr.queue[0][1], x2: tr.queue[1][0], y2: tr.queue[1][1], style: `fill: none; stroke: ${palette.secours}`,
        'stroke-width': trait * 0.6, 'stroke-linecap': 'round', 'stroke-dasharray': `${trait * 1.2} ${trait * 1.2}`,
      }))),
    chaine.liaisons.map((l) => svg('line', {
      class: `liaison-chaine ${l.genre === 'fibre' ? 'fibre' : 'cuivre-10g'}`, x1: l.de[0], y1: l.de[1], x2: l.a[0], y2: l.a[1],
      style: `fill: none; stroke: ${palette.contour}`, 'stroke-width': trait * (l.genre === 'fibre' ? 0.6 : 0.45),
      'stroke-dasharray': l.genre === 'fibre' ? `${trait * 3} ${trait * 1.2}` : null,
    })),
    chaine.cadres.map((c) => svg('g', { class: 'cadre-chaine', 'data-role': c.role, 'data-nom': c.nom },
      // Processeur de secours (étape 22) : contour en pointillés couleur secours, comme ses retours.
      svg('rect', {
        x: c.x, y: c.y, width: c.w, height: c.h, rx: c.taille * 0.3,
        style: `fill: ${palette.fond}; stroke: ${c.role === 'secours' ? palette.secours : palette.contour}`, 'stroke-width': trait * 0.5,
        'stroke-dasharray': c.role === 'secours' ? `${trait * 1.2} ${trait * 0.8}` : null,
      }),
      c.lignes.map((texte, i) => svg('text', {
        x: c.cx, y: c.cy + (i - (c.lignes.length - 1) / 2) * c.taille * 1.25, 'font-size': c.taille * (i === 0 ? 1 : 0.85),
        style: `fill: ${palette.texte}`, 'font-weight': i === 0 ? 700 : 400, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, texte)))),
    chaine.etiquettes.map((e) => svg('g', { class: 'etiquette-liaison', 'data-texte': e.texte, style: `fill: ${palette.texte}` },
      e.lignes.map((texte, i) => svg('text', {
        x: e.ancre === 'start' ? e.x : e.cx, y: e.y + e.taille * 1.2 * (i + 0.5), 'font-size': e.taille,
        'text-anchor': e.ancre, 'dominant-baseline': 'central',
      }, texte))))) : null;

  const hauteurPx = largeurPx ? Math.round((largeurPx * complet.h) / complet.w) : null;
  const racine = svg('svg', {
    class: simple ? 'simplifie' : null,
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
  // Cadre du mur ; en zones, seulement en vue pixels (le cadre de la pixel map, vides compris).
  geo.zones && geo.unite !== 'px' ? null
    : svg('rect', { x: 0, y: 0, width: largeur, height: hauteur, style: `fill: none; stroke: ${palette.texteDoux}`, 'stroke-width': cote * 0.02 }),
  absentes, tuiles, plis, contours, nomsZones, courbures, dessinRepere, dessinBoitiers, dessinChaine, lignes);
  return { svg: racine, complet };
}

// Bande « Chaîne » sous le dessin (étape 19b3, spec § 4.4 ; au-dessus, elle sortait le dessin du premier écran) : `amont` de chaineSchema en liste ordonnée, nœuds
// encadrés et liaisons « → HDMI 2.0, 5 m » (flèche cachée aux lecteurs d'écran), qui passe à la ligne ; la note
// « Chaîne à régler dans Canvas. » sans chaîne, puis le lien « Modifier dans Canvas » au bout. Le rôle « list » garde
// la liste pour les lecteurs d'écran (Safari l'oublie quand la puce est retirée).
export function bandeChaine(amont) {
  const elements = amont.noeuds.flatMap((n, i) => [
    el('li', { class: `bc-noeud bc-${n.role}` }, el('span', { class: 'bc-nom' }, n.texte), n.detail ? el('span', { class: 'bc-detail' }, ` ${n.detail}`) : null),
    amont.liens[i] && i < amont.noeuds.length - 1
      ? el('li', { class: 'bc-lien' }, el('span', { class: 'bc-fleche', 'aria-hidden': 'true' }, '→'), ` ${amont.liens[i].texte}`) : null,
  ]);
  return el('div', { class: 'bande-chaine' },
    el('ol', { class: 'bc-liste', role: 'list', 'aria-label': 'Chaîne vidéo, de la source aux processeurs' }, elements),
    amont.note ? el('p', { class: 'bc-note' }, amont.note) : null,
    el('a', { class: 'bc-modifier', href: '#canvas' }, 'Modifier dans Canvas'));
}
