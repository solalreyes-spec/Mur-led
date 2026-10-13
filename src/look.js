// Nouveau look « Couleurs LED » (spec du 09/10/2026) : famille de chaque onglet et des fiches, barre de charge en
// 20 segments, mur en petits carrés, icônes de trait. Le décor n'apparaît que s'il informe ; il est caché aux lecteurs
// d'écran (aria-hidden), car le texte qu'il accompagne (charge en %, colonnes × lignes) reste écrit à côté.

import { el } from './dom.js';

// Famille de chaque onglet (§ 2) : sa couleur sert à l'icône, au titre, au bouton principal et au fond teinté.
export const FAMILLES_ONGLETS = {
  mur: 'image', data: 'donnees', canvas: 'image', elec: 'electricite', poids: 'accroche',
  schema: 'donnees', depannage: 'depannage', base: 'base', apprendre: 'apprendre',
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

// Mur en petits carrés : colonnes × lignes en damier de deux tons de la famille ; rien au-delà de 1 000 dalles.
export const DALLES_MAX_CARRES = 1000;
export function murCarres(colonnes, lignes) {
  const n = colonnes * lignes;
  if (!(colonnes > 0 && lignes > 0) || n > DALLES_MAX_CARRES) return null;
  const carres = [];
  for (let r = 0; r < lignes; r += 1) {
    for (let c = 0; c < colonnes; c += 1) carres.push(el('span', { class: `mc${(r + c) % 2 ? ' ton-b' : ''}` }));
  }
  return el('div', { class: 'mur-carres', 'aria-hidden': 'true', style: `grid-template-columns: repeat(${colonnes}, minmax(0, 1fr)); --rapport: ${colonnes} / ${lignes}` }, ...carres);
}

// Zone de forme libre (9b) : une case par place, en % de la zone, décalages compris ; dalle absente en creux.
function carresForme(z) {
  const pc = (x) => `${(100 * x).toFixed(4)}%`;
  const largeur = 1 / z.colonnes;
  const carres = z.forme.colonnes.flatMap((col, j) => col.cases.map((x, r) => el('span', {
    class: `mc${(r + j) % 2 ? ' ton-b' : ''}${x.presente ? '' : ' absente'}`,
    style: `left: ${pc(j * largeur)}; width: ${pc(largeur)}; top: ${pc(x.yMm / z.hauteurMm)}; height: ${pc(x.hMm / z.hauteurMm)}`,
  })));
  return el('div', { class: 'mur-carres mur-carres-forme', 'aria-hidden': 'true' }, ...carres);
}

// Mur en zones (étape 9a) : une grille par zone, à sa place réelle (écarts et hauteur du bas), en % du mur entier,
// aux proportions du mur réel ; rien au-delà de 1 000 dalles en tout.
export function murCarresZones(m) {
  if (!m?.zones?.length || m.dalles.total > DALLES_MAX_CARRES || !(m.largeurMm > 0 && m.hauteurMm > 0)) return null;
  const basMin = Math.min(...m.zones.map((z) => z.basMm));
  const hautMax = basMin + m.hauteurMm;
  const pc = (x) => `${(100 * x).toFixed(4)}%`;
  const grilles = m.zones.map((z) => {
    // Forme libre (9b) : chaque place à sa position réelle dans la zone, les dalles absentes en creux.
    const grille = z.forme ? carresForme(z) : murCarres(z.colonnes, z.lignes);
    grille.style.left = pc(z.xMm / m.largeurMm);
    grille.style.width = pc(z.largeurMm / m.largeurMm);
    grille.style.top = pc((hautMax - z.basMm - z.hauteurMm) / m.hauteurMm);
    grille.style.height = pc(z.hauteurMm / m.hauteurMm);
    return grille;
  });
  return el('div', { class: 'mur-carres-zones', 'aria-hidden': 'true', style: `--rapport: ${m.largeurMm} / ${m.hauteurMm}` }, ...grilles);
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
