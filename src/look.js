// Nouveau look « Couleurs LED » (spec du 09/10/2026) : famille de chaque onglet et des fiches, barre de charge en
// 20 segments, mur en petits carrés, icônes de trait. Le décor n'apparaît que s'il informe ; il est caché aux lecteurs
// d'écran (aria-hidden), car le texte qu'il accompagne (charge en %, colonnes × lignes) reste écrit à côté.

import { el } from './dom.js';
import { nombre } from './format.js';
import { geometrieSchema } from './dessin-schema.js';

// Famille de chaque onglet (§ 2) : sa couleur sert à l'icône, au titre, au bouton principal et au fond teinté.
export const FAMILLES_ONGLETS = {
  mur: 'image', data: 'donnees', canvas: 'regie', elec: 'electricite', poids: 'accroche',
  schema: 'schema', depannage: 'depannage', base: 'base', apprendre: 'apprendre', planning: 'presta',
};

// Famille d'une fiche « pourquoi » ou d'une question, d'après la lettre de son identifiant (D, E, I, R, A).
const FAMILLES_LETTRES = { D: 'donnees', E: 'electricite', I: 'image', R: 'regie', A: 'accroche' };
export function familleDeFiche(id) {
  return FAMILLES_LETTRES[String(id ?? '').replace(/^Q-/, '').charAt(0)] ?? null;
}

// Barre de charge : 20 segments allumés à la proportion de la charge (au moins un dès qu'il y a une charge, 20 au
// plus) ; en couleur de famille jusqu'à 80 %, d'alerte au-delà, d'échec au-delà du seuil de refus (100 % par défaut).
export const SEGMENTS_CHARGE = 20;
export function segmentsCharge(charge, { seuilAlerte = 0.8, seuilRefus = 1 } = {}) {
  const c = Number.isFinite(charge) ? Math.max(0, charge) : 0;
  const allumes = c > 0 ? Math.min(SEGMENTS_CHARGE, Math.max(1, Math.round(c * SEGMENTS_CHARGE))) : 0;
  const niveau = c > seuilRefus ? 'echec' : c > seuilAlerte ? 'alerte' : 'famille';
  return { allumes, niveau };
}

export function barreCharge(charge, options = {}) {
  const { allumes, niveau } = segmentsCharge(charge, options);
  const segments = Array.from({ length: SEGMENTS_CHARGE }, (_, i) => el('span', { class: `bc-seg${i < allumes ? ' allume' : ''}` }));
  // Graduations : un trait tous les 25 %, et le seuil d'alerte (80 %) marqué à part.
  const graduations = [0, 25, 50, 75, 100].map((p) => el('span', { class: 'bc-trait', style: `left: ${p}%` }));
  const seuil = Math.round((options.seuilAlerte ?? 0.8) * 100);
  return el('div', { class: 'barre-charge', 'data-niveau': niveau, 'aria-hidden': 'true' },
    el('div', { class: 'bc-segments' }, ...segments),
    el('div', { class: 'bc-graduations' }, ...graduations, el('span', { class: 'bc-trait bc-seuil', style: `left: ${seuil}%` })));
}

// Aperçu du mur (étape 11c, spec du 16/10/2026 § 8) : la géométrie du Schéma en vue physique (zones, écarts, formes
// libres, demi-dalles, murs mixtes, dalles tournées, plis), dessinée en petits carrés arrondis : damier de deux tons de
// la famille, demi-dalles d'un ton plus clair, dalles d'une autre fiche d'un troisième ton, vides laissés vides. Au-delà
// de 1 000 dalles, le contour du mur ou de chaque zone et un trait toutes les 10 dalles. Cotes discrètes en mètres et
// en pixels ; le dessin est caché aux lecteurs d'écran, l'étiquette dit le mur.
export const DALLES_MAX_APERCU = 1000;
const NS_APERCU = 'http://www.w3.org/2000/svg';
const svgApercu = (nom, attributs = {}) => {
  const e = document.createElementNS(NS_APERCU, nom);
  for (const [k, v] of Object.entries(attributs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  return e;
};
const metres = (mm) => `${nombre(mm / 1000, 2)} m`;
export function apercuMur(m, dalle) {
  if (!m || !(m.largeurMm > 0 && m.hauteurMm > 0)) return null;
  const W = m.largeurMm;
  const H = m.hauteurMm;
  const dessin = svgApercu('svg', { class: 'apercu-dessin', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet', style: `--ap-rapport: ${W / H}` });
  // Dalles de moins de 8 px à l'écran (mur très large) : trait de séparation aminci, le damier reste lisible. Largeur
  // dessinée estimée : 260 px au plus dans la carte à 375 px, 220 px de haut au plus.
  const cotePx = (Math.min(260, (220 * W) / H) * Math.min(dalle.largeurMm, dalle.hauteurMm)) / W;
  if (cotePx < 8) dessin.classList.add('ap-serre');
  const total = m.dalles.total;
  const zones = m.zones?.length > 1 || m.zones?.some((z) => z.forme || z.roulis) ? m.zones : null;
  if (total <= DALLES_MAX_APERCU) {
    const geo = geometrieSchema({ vue: 'physique', canvasVue: 'mur' }, m, dalle, null);
    for (const r of geo.rects.values()) {
      const d = r.d ?? {};
      const ton = d.type === 'demi' ? 'ap-demi' : d.fiche && d.fiche.id !== dalle.id && zones ? 'ap-autre' : (d.colonne + d.rangee) % 2 ? 'ap-b' : 'ap-a';
      dessin.append(svgApercu('rect', {
        class: `ap-dalle ${ton}`, 'data-zone': d.zone ?? null, x: r.x, y: r.y, width: r.w, height: r.h, rx: 0.12 * Math.min(r.w, r.h),
        transform: r.rotation ? `rotate(${-r.rotation} ${r.x + r.w / 2} ${r.y + r.h / 2})` : null,
      }));
    }
    for (const p of geo.plis ?? []) dessin.append(svgApercu('line', { class: 'ap-pli', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 }));
    // Plusieurs zones (11d) : le contour de chacune, visible même quand elles se touchent.
    if (m.zones?.length > 1) for (const z of geo.zones ?? []) dessin.append(svgApercu('rect', { class: 'ap-zone', x: z.x, y: z.y, width: z.w, height: z.h }));
  } else {
    // Grand mur : contour de chaque zone (du mur entier sans zones) et un trait toutes les 10 dalles.
    const basMin = m.zones ? Math.min(...m.zones.map((z) => z.basMm)) : 0;
    const cadres = (m.zones ?? [null]).map((z) => {
      const fiche = z?.dalle ?? dalle;
      return z ? { x: z.xMm, y: basMin + H - z.basMm - z.hauteurMm, w: z.largeurMm, h: z.hauteurMm, colonnes: z.colonnes, lignes: z.lignes, fiche }
        : { x: 0, y: 0, w: W, h: H, colonnes: m.colonnes, lignes: m.lignes, fiche };
    });
    for (const c of cadres) {
      dessin.append(svgApercu('rect', { class: 'ap-contour', x: c.x, y: c.y, width: c.w, height: c.h, rx: 0.12 * Math.min(c.fiche.largeurMm, c.fiche.hauteurMm) }));
      for (let k = 10; k < c.colonnes; k += 10) dessin.append(svgApercu('line', { class: 'ap-trait ap-trait-v', x1: c.x + k * c.fiche.largeurMm, y1: c.y, x2: c.x + k * c.fiche.largeurMm, y2: c.y + c.h }));
      for (let k = 10; k < c.lignes; k += 10) dessin.append(svgApercu('line', { class: 'ap-trait ap-trait-h', x1: c.x, y1: c.y + k * c.fiche.hauteurMm, x2: c.x + c.w, y2: c.y + k * c.fiche.hauteurMm }));
    }
  }
  const demi = m.rangeeDemi ? ` et une rangée de demi-dalles ${m.positionDemi === 'haut' ? 'en haut' : 'en bas'}` : '';
  const quoi = m.zones?.length > 1 ? `${m.zones.length} zones, ${total} dalles` : `${m.colonnes} × ${m.lignes} dalles${demi}`;
  // Lignes de cote (11d) : sous le dessin, un trait de sa largeur avec une butée à chaque bout et le texte centré ; à
  // droite, un trait de sa hauteur.
  return el('div', { class: 'apercu', role: 'img', 'aria-label': `Aperçu du mur : ${quoi}, ${nombre(W / 1000, 2)} × ${metres(H)}, ${nombre(m.pxLargeur)} × ${nombre(m.pxHauteur)} px` },
    el('div', { class: 'apercu-grille' }, dessin,
      el('div', { class: 'cote cote-v apercu-hauteur' }, el('span', { class: 'cote-texte' }, el('span', {}, metres(H)), ' ', el('span', {}, `${nombre(m.pxHauteur)} px`))),
      el('div', { class: 'cote cote-h apercu-largeur' }, el('span', { class: 'cote-texte' }, `${metres(W)} · ${nombre(m.pxLargeur)} px`))),
    total > DALLES_MAX_APERCU ? el('p', { class: 'apercu-note' }, `${total} dalles : un trait toutes les 10 dalles.`) : null);
}

// Vue de dessus du mur (9c2) : chaque zone vue d'en haut, public en bas, aux proportions de la boîte réelle ; une
// colonne debout est un trait (son bord bas), une dalle couchée ou inclinée (plafond) un quadrilatère en hachures.
// `forme` : formeReelle(m, dalle) ; null pour un mur à plat (rien de plus que le mur en petits carrés).
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (nom, attributs = {}, enfants = []) => {
  const e = document.createElementNS(SVG_NS, nom);
  for (const [k, v] of Object.entries(attributs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  for (const enfant of enfants) if (enfant) e.append(enfant);
  return e;
};
const metresCourts = (mm) => String(Math.round(mm / 10) / 100).replace('.', ',');
export function vueDessus(forme) {
  if (!forme || !forme.zones.some((z) => z.courbure || z.pose !== 'prolongement')) return null;
  const b = forme.boiteMm;
  const largeur = Math.max(b.largeur, 1);
  const profondeur = Math.max(b.profondeur, largeur * 0.02);
  const point = (c) => `${c[0]},${c[2]}`;
  const vues = new Set();
  const traits = [];
  const couchees = [];
  for (const d of forme.dalles) {
    if (Math.abs(d.tangageDeg) > 1) {
      couchees.push(svgEl('polygon', { class: 'dalle-plafond', points: d.coinsMm.map(point).join(' '), fill: 'url(#hachures-dessus)', stroke: 'currentColor', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      continue;
    }
    const cle = `${d.zone}|${d.colonne}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    const [a, c] = [d.coinsMm[0], d.coinsMm[1]];
    traits.push(svgEl('line', { class: 'colonne-dessus', x1: a[0], y1: a[2], x2: c[0], y2: c[2], stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
  }
  const pas = Math.max(largeur, profondeur) / 60;
  const dessin = svgEl('svg', {
    viewBox: `${b.min[0]} ${b.min[2]} ${largeur} ${profondeur}`, preserveAspectRatio: 'xMidYMid meet', overflow: 'visible', role: 'img',
    'aria-label': 'Vue de dessus du mur', style: `aspect-ratio: ${largeur} / ${profondeur}`,
  }, [
    svgEl('defs', {}, [svgEl('pattern', { id: 'hachures-dessus', patternUnits: 'userSpaceOnUse', width: pas, height: pas, patternTransform: 'rotate(45)' },
      [svgEl('line', { x1: 0, y1: 0, x2: 0, y2: pas, stroke: 'currentColor', 'stroke-width': pas / 4 })])]),
    ...couchees, ...traits,
  ]);
  return el('figure', { class: 'vue-dessus' },
    dessin,
    el('figcaption', { class: 'legende-dessus' }, `Vue de dessus, public en bas : ${metresCourts(b.largeur)} × ${metresCourts(b.profondeur)} m (largeur × profondeur)`));
}

// Icônes de trait (24 × 24, trait de 2 px, couleur du texte qui les porte).
const TRACES = {
  mur: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M9 5v14M15 5v14M3 12h18"/>',
  data: '<path d="M4 7h11M4 12h16M4 17h8"/><circle cx="18" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  canvas: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  elec: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  poids: '<path d="M12 3v4M6 7h12l2 13H4z"/><circle cx="12" cy="3" r="1"/>',
  schema: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4.5a2 2 0 0 1 2 2V14"/>',
  depannage: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-1-1-3z"/>',
  base: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  apprendre: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  donnees: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  electricite: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>',
  accroche: '<path d="M12 2v6M8 8h8v3a4 4 0 0 1-8 0zM12 15v7"/>',
  regie: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M7 10v4M11 10v4M15 10h2M15 14h2"/>',
};
export function iconeTrait(nom, classe) {
  const texte = `<svg xmlns="http://www.w3.org/2000/svg" class="${classe}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" `
    + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRACES[nom] ?? ''}</svg>`;
  return document.importNode(new DOMParser().parseFromString(texte, 'image/svg+xml').documentElement, true);
}

// Icônes des onglets, telles qu'écrites dans index.html (test N43 : même tracé que celui de l'appli).
export const TRACES_ICONES = TRACES;

// Animation d'ouverture du logo (étape 24, spec § 10 et § 12) : les 8 dalles du tour arrivent de hors de l'écran,
// chacune de son côté, agrandies et tournées, puis rétrécissent à leur place ; celle du centre monte tout droit du bas
// de l'écran (étape 24c : plus lent, 1,6 s par dalle, tout en place en 2,2 s, à la demande de l'utilisateur). Seule
// animation de l'appli (choix de l'utilisateur). Rien si la page est cachée (la ligne de temps n'avancerait pas) ou si
// le téléphone demande moins d'animations ; dans tous les cas, les dalles cachées par index.html sont montrées.
const ECHELLE_DEPART = 6;
const DUREE_DALLE = 1600;
const ATTENTES_LOGO = [150, 250, 350, 250, 450, 450, 350, 450, 550];
export function animerLogo(svg, {
  largeur = innerWidth,
  hauteur = innerHeight,
  reduit = matchMedia('(prefers-reduced-motion: reduce)').matches,
  visible = document.visibilityState === 'visible',
} = {}) {
  const dalles = [...(svg?.querySelectorAll('g.ld') ?? [])];
  const animations = [];
  if (!reduit && visible && typeof dalles[0]?.animate === 'function') {
    dalles.forEach((g, k) => {
      const b = g.getBoundingClientRect();
      const dx = (k % 3) - 1;
      const dy = Math.floor(k / 3) - 1;
      const finale = { transform: 'none', opacity: 1 };
      const depasse = { transform: 'scale(1.6)', opacity: 1, offset: 0.7 };
      const centre = dx === 0 && dy === 0;
      // Hors de l'écran : centre de la dalle au-delà du bord, de la moitié de la diagonale de la dalle agrandie et 8 px.
      const marge = (b.width / 2) * ECHELLE_DEPART * Math.SQRT2 + 8;
      const cx = (b.left + b.right) / 2;
      const cy = (b.top + b.bottom) / 2;
      const tx = dx < 0 ? -(cx + marge) : dx > 0 ? largeur - cx + marge : 0;
      const ty = dy < 0 ? -(cy + marge) : dy > 0 || centre ? hauteur - cy + marge : 0;
      const tourne = centre ? '' : ` rotate(${k % 2 ? 30 : -30}deg)`;
      const depart = { transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)${tourne} scale(${ECHELLE_DEPART})`, opacity: 0.9 };
      animations.push(g.animate([depart, depasse, finale],
        { duration: DUREE_DALLE, delay: ATTENTES_LOGO[k], easing: 'cubic-bezier(.2,.85,.3,1.12)', fill: 'backwards' }));
    });
  }
  delete document.documentElement.dataset.logo;
  return animations;
}
