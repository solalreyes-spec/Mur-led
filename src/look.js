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
