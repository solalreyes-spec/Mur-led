// Calculs du mur LED, lecture d'un mur en zones : plusieurs zones ou non, dalle et demi-dalle de chaque zone,
// morceaux de mur d'une zone (rectangle ou forme libre).
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { mur } from './mur.js';

// Calcul en zones : plusieurs zones, ou une seule zone de forme libre (une zone rectangulaire seule est le mode Dalles).
export const plusieursZones = (m) => (m.zones?.length ?? 0) > 1 || Boolean(m.zones?.[0]?.forme) || Boolean(m.mixte) || Boolean(m.horsAxe);
// Dalle et demi-dalle d'une zone : les siennes dans un mur mixte (9b3), sinon celles du mur.
export const ficheZone = (m, z, dalle) => z.dalle ?? dalle;
export const demiZone = (m, z) => (z.dalle ? z.demi ?? null : m.demi);
// Un morceau de mur garde sa dalle et sa demi-dalle (hors JSON), pour la charge de ses ports dans un mur mixte.
export function avecFiches(sous, fiche, demi) {
  Object.defineProperty(sous, 'fiche', { value: fiche, enumerable: false });
  Object.defineProperty(sous, 'demiFiche', { value: demi, enumerable: false });
  return sous;
}
export const mursDesZones = (m, dalle) => m.zones.map((z) => {
  const f = ficheZone(m, z, dalle);
  return avecFiches(z.forme ? sousForme(z, f, demiZone(m, z), 1, z.colonnes) : mur(f, z.colonnes, z.lignes), f, demiZone(m, z));
});

// Morceau d'une zone de forme libre : ses colonnes a à b (comptées dans la zone), et en option une bande de hauteur,
// cadré sur ses dalles présentes. Mêmes
// champs qu'un mur, plus `forme` : chaque colonne avec ses cases (y depuis le haut du morceau) et `haut`, la place du
// haut du morceau sous le haut de la zone (px).
export function sousForme(z, dalle, demi, a, b, bande = null) {
  const fiche = (t) => (t === 'demi' ? demi : dalle);
  // Bande [haut, bas[ (px depuis le haut de la zone, coupes horizontales de Z19) : les dalles hors de la bande n'en font
  // pas partie.
  const dansBande = (x) => !bande || (x.y >= bande[0] && x.y + x.h <= bande[1]);
  const colonnes = z.forme.colonnes.slice(a - 1, b)
    .map((c) => (bande ? { ...c, cases: c.cases.map((x) => (x.presente && !dansBande(x) ? { ...x, presente: false } : x)) } : c));
  const presentes = colonnes.flatMap((c) => c.cases.filter((x) => x.presente));
  const haut = presentes.length ? Math.min(...presentes.map((x) => x.y)) : 0;
  const bas = presentes.length ? Math.max(...presentes.map((x) => x.y + x.h)) : 0;
  const hautMm = presentes.length ? Math.min(...presentes.map((x) => x.yMm)) : 0;
  const basMm = presentes.length ? Math.max(...presentes.map((x) => x.yMm + x.hMm)) : 0;
  const nbDemi = presentes.filter((x) => x.type === 'demi').length;
  const n = b - a + 1;
  return {
    colonnes: n,
    lignes: z.lignes,
    rangees: [...z.forme.types],
    rangeeDemi: z.forme.types.includes('demi'),
    positionDemi: z.forme.positionDemi,
    demi: z.forme.types.includes('demi') ? demi : null,
    dalles: { entieres: presentes.length - nbDemi, demi: nbDemi, total: presentes.length },
    largeurMm: n * dalle.largeurMm,
    hauteurMm: basMm - hautMm,
    pxLargeur: n * dalle.pxH,
    pxHauteur: bas - haut,
    pxTotal: presentes.reduce((s, x) => s + fiche(x.type).pxH * fiche(x.type).pxV, 0),
    surfaceM2: presentes.reduce((s, x) => s + (fiche(x.type).largeurMm * fiche(x.type).hauteurMm) / 1e6, 0),
    forme: {
      haut,
      colonnes: colonnes.map((c, i) => ({ ...c, colonne: i + 1, cases: c.cases.map((x) => ({ ...x, y: x.y - haut })) })),
    },
  };
}
// Hauteur la plus grande que charge un port : celle du mur, ou de la zone la plus haute.
export const hauteurPortsPx = (m) => (plusieursZones(m) ? Math.max(...m.zones.map((z) => z.pxHauteur)) : m.pxHauteur);
