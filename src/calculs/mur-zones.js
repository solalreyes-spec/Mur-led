// Calculs du mur LED, mur en plusieurs zones (étapes 9a et 9b) : zones, placement, formes libres, murs mixtes.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { EPS, ErreurSaisie, suite } from './commun.js';
import { ratio, verifierDemi, mur, pitchLePlusFin, pixelsInterpoles, verifierNombreDalles } from './mur.js';
import { horsAxe, verifierRoulis, rotationZone, verifierFormeReelle } from './forme-reelle.js';

// ---------------------------------------------------------------------------
// Mur en plusieurs zones (étape 9a) : rectangles de dalles côte à côte, de gauche à droite vu de face, séparés par
// un écart réel et, dans la pixel map, par des pixels vides. Une seule dalle pour toutes les zones (mur mixte en 9b).
// ---------------------------------------------------------------------------

export const ZONES_MAX = 12;
// Marques sans règle publiée sur les vides d'un mur (9b, Z18) : recherche du 09/10/2026.
export const FAMILLES_SANS_REGLE_VIDES = ['colorlight', 'megapixel', 'linsn', 'kystar', 'mooncell'];
export const NOM_ZONE_MAX = 12;
const MODES_ECARTS = ['reel', 'main', 'colles'];
// Arrondi au pixel le plus proche (84,5 → 85), sans le bruit des nombres à virgule.
const arrondiPx = (x) => Math.floor(x + 0.5 + EPS);
const positifOuNul = (x) => x === undefined || x === null || (Number.isFinite(x) && x >= 0);
const entierPositifOuNul = (x) => Number.isInteger(x) && x >= 0;

// Pas qui convertit des millimètres en pixels : taille de la dalle ÷ ses pixels, en largeur et en hauteur. Le pas de la
// fiche est souvent arrondi (1,9 mm pour 1,953) : avec lui, deux zones posées au sol ne seraient plus alignées en bas
// dans la pixel map. Il reste donné pour mémoire.
function pasDeLaDalle(dalle) {
  return { mm: dalle.largeurMm / dalle.pxH, verticalMm: dalle.hauteurMm / dalle.pxV, ficheMm: dalle.pitchMm > 0 ? dalle.pitchMm : null };
}

// Zones : [{ nom, colonnes, rangees, ecartMm (avec la zone de gauche, à partir de la 2e), basMm (hauteur du bas au-dessus
// du bas le plus bas) }]. Écarts dans la pixel map : 'reel' (écart réel ÷ pas, arrondi), 'main' (ecartsPx entre deux
// zones et, si donné, yPx de chaque zone) ou 'colles' (0 px). Y d'une zone : (haut le plus haut − haut de la zone) ÷ pas.
// Mur : pixel map avec ses vides (pxLargeur, pxHauteur, pxCanvas), pixels utiles des dalles (pxTotal), taille réelle avec
// les écarts. Une seule zone : exactement le mur du mode Dalles, avec la description de sa zone.
export function murZones(dalleMur, zones, { ecarts = 'reel', ecartsPx = [], yPx = null, xPx = null, demi: demiMur = null, mapping = '1:1' } = {}) {
  if (!Array.isArray(zones) || zones.length === 0) throw new ErreurSaisie('Ajoute au moins une zone.');
  if (zones.length > ZONES_MAX) throw new ErreurSaisie(`${ZONES_MAX} zones au plus.`);
  if (!MODES_ECARTS.includes(ecarts)) throw new ErreurSaisie('Choisis les écarts dans la pixel map : comme l\'écart réel, à la main ou zones collées.');
  const noms = [];
  zones.forEach((z, i) => {
    const zone = `Zone ${i + 1}`;
    if (!Number.isInteger(z.colonnes) || z.colonnes < 1) throw new ErreurSaisie(`${zone} : le nombre de colonnes doit être un entier d'au moins 1.`);
    if (!Number.isInteger(z.rangees) || z.rangees < 1) throw new ErreurSaisie(`${zone} : le nombre de rangées doit être un entier d'au moins 1.`);
    const nom = String(z.nom ?? '').trim();
    if (!nom) throw new ErreurSaisie(`${zone} : donne-lui un nom.`);
    if (nom.length > NOM_ZONE_MAX) throw new ErreurSaisie(`${zone} : ${NOM_ZONE_MAX} caractères au plus pour le nom, pour qu'il tienne sur le dessin.`);
    if (noms.includes(nom)) throw new ErreurSaisie(`Deux zones portent le même nom (« ${nom} ») : donne-leur des noms différents.`);
    noms.push(nom);
    if (i > 0 && !positifOuNul(z.ecartMm)) throw new ErreurSaisie(`${zone} : l'écart avec la zone de gauche est un nombre de millimètres positif ou nul.`);
    if (!positifOuNul(z.basMm)) throw new ErreurSaisie(`${zone} : la hauteur du bas est un nombre de millimètres positif ou nul.`);
  });
  // Zones placées au-dessus, en dessous ou librement (9b2) ; sinon, zones côte à côte de la 9a.
  const typePlacement = (z) => z.placement?.type ?? 'droite';
  const placees = zones.some((z) => typePlacement(z) !== 'droite');
  if (ecarts === 'main') {
    for (let i = 1; i < zones.length; i += 1) {
      if (typePlacement(zones[i]) !== 'droite') continue;
      if (!entierPositifOuNul(ecartsPx[i - 1])) throw new ErreurSaisie(`Écart ${i} dans la pixel map : un nombre entier de pixels, positif ou nul.`);
    }
    if (xPx) {
      zones.forEach((z, i) => {
        if (xPx[i] !== null && xPx[i] !== undefined && !entierPositifOuNul(xPx[i])) {
          throw new ErreurSaisie(`Zone ${i + 1} : la position X dans la pixel map est un nombre entier de pixels, positif ou nul.`);
        }
      });
    }
    if (yPx) {
      zones.forEach((z, i) => {
        if (!entierPositifOuNul(yPx[i])) throw new ErreurSaisie(`Zone ${i + 1} : la position Y dans la pixel map est un nombre entier de pixels, positif ou nul.`);
      });
    }
  }

  // Mur mixte (9b3) : une dalle par zone (`dalle`, et sa demi-dalle `demi`) ; sans elle, la dalle du mur.
  const mixte = zones.some((z) => z.dalle && z.dalle.id !== dalleMur.id);
  // Mapping interpolé (Tessera M2 et T1, Z17) : chaque dalle prend sa taille ÷ le pitch le plus fin du mur, en pixels.
  const fichesReelles = [dalleMur, demiMur, ...zones.flatMap((z) => [z.dalle, z.demi])].filter(Boolean);
  const pasInterpole = mixte && mapping === 'interpole' ? pitchLePlusFin(fichesReelles) : null;
  const virtuelles = new Map();
  const virtuelle = (f) => {
    if (!f || !pasInterpole) return f;
    if (!virtuelles.has(f)) {
      const r = pixelsInterpoles(f, pasInterpole);
      virtuelles.set(f, { ...f, pxH: r.pxH, pxV: r.pxV, pxReels: { pxH: f.pxH, pxV: f.pxV } });
    }
    return virtuelles.get(f);
  };
  const dalle = virtuelle(dalleMur);
  const demi = virtuelle(demiMur);
  const ficheDe = (z) => virtuelle(z.dalle ?? dalleMur);
  const demiDe = (z) => virtuelle(z.dalle ? z.demi ?? null : demiMur);
  // Rotation dans le plan d'une zone (9c4) : vérifiée avant la géométrie (rectangle englobant).
  verifierRoulis(zones, noms);
  // Pas de référence (Z15) : le plus fin des pas réels du mur, en largeur et en hauteur ; une seule dalle : son pas (9a).
  const fiches = [dalle, ...zones.flatMap((z) => [ficheDe(z), demiDe(z)])].filter(Boolean);
  const pas = mixte
    ? { mm: Math.min(...fiches.map((f) => f.largeurMm / f.pxH)), verticalMm: Math.min(...fiches.map((f) => f.hauteurMm / f.pxV)), ficheMm: null }
    : pasDeLaDalle(dalle);
  const murs = zones.map((z) => mur(ficheDe(z), z.colonnes, z.rangees));
  // Formes libres (9b) : dalles absentes, colonnes décalées, rangée de demi-dalles ; null pour un rectangle plein.
  const formes = zones.map((z, i) => formeZone(z, noms[i], ficheDe(z), demiDe(z), pas));
  const listeEcarts = [];
  let xMm = 0;
  let x = 0;
  let colonne = 1;
  const description = zones.map((z, i) => {
    const m = murs[i];
    if (i > 0) {
      const mm = z.ecartMm ?? 0;
      const pxCalcule = arrondiPx(mm / pas.mm);
      const px = { main: ecartsPx[i - 1], colles: 0, reel: pxCalcule }[ecarts];
      listeEcarts.push({ entre: [noms[i - 1], noms[i]], mm, px, pxCalcule });
      xMm += mm;
      x += px;
    }
    const f = formes[i];
    const d = {
      index: i, nom: noms[i], colonnes: z.colonnes, lignes: z.rangees, premiereColonne: colonne,
      xMm, basMm: z.basMm ?? 0, largeurMm: m.largeurMm, hauteurMm: f ? f.hauteurMm : m.hauteurMm,
      x, y: 0, pxLargeur: m.pxLargeur, pxHauteur: f ? f.hauteurPx : m.pxHauteur,
      dalles: f ? f.dalles.total : m.dalles.total, pxTotal: f ? f.pxTotal : m.pxTotal,
      ...(f ? { forme: f } : {}),
      ...(mixte ? { dalle: ficheDe(z), demi: demiDe(z) } : {}),
    };
    // Zone tournée hors axe (9c4, Z36, Z38) : elle occupe le rectangle qui englobe sa forme tournée, en px et en mm ;
    // sa dalle porte la marque `horsAxe` (charge comptée deux fois, Z37).
    if (horsAxe(z)) {
      d.roulis = rotationZone(z.roulisDeg, d);
      d.pxLargeur = d.roulis.pxLargeur;
      d.pxHauteur = d.roulis.pxHauteur;
      d.largeurMm = d.roulis.largeurMm;
      d.hauteurMm = d.roulis.hauteurMm;
      const fiche = ficheDe(z);
      const demiFiche = demiDe(z);
      d.dalle = { ...fiche, horsAxe: true };
      d.demi = demiFiche ? { ...demiFiche, horsAxe: true } : null;
    }
    xMm += d.largeurMm;
    x += d.pxLargeur;
    colonne += z.colonnes;
    return d;
  });
  const saisie = {
    zones: zones.map((z) => ({ ...z })),
    options: { ecarts, ecartsPx: [...ecartsPx], yPx: yPx ? [...yPx] : null, ...(xPx ? { xPx: [...xPx] } : {}), ...(demiMur ? { demi: demiMur } : {}) },
  };
  const avecForme = formes.some(Boolean);
  const ficheReelle = (z) => z.dalle ?? dalleMur;
  const tournees = zones.some(horsAxe);
  if (zones.length === 1 && !avecForme && !placees && !mixte && !tournees) {
    verifierNombreDalles(murs[0].dalles.total);
    verifierFormeReelle(zones, description, ficheReelle);
    return { ...murs[0], zones: description, ecarts: [], pas, modeEcarts: ecarts, pxCanvas: murs[0].pxTotal, saisie, sauts: [], superposees: [] };
  }

  let hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
  let basMin = Math.min(...description.map((d) => d.basMm));
  if (placees) {
    listeEcarts.length = 0;
    listeEcarts.push(...placerZones(zones, description, { ecarts, ecartsPx, yPx, xPx, pas }));
    hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
    basMin = 0;
    xMm = Math.max(...description.map((d) => d.xMm + d.largeurMm));
    x = Math.max(...description.map((d) => d.x + d.pxLargeur));
  } else {
    description.forEach((d, i) => {
      d.y = ecarts === 'main' && yPx ? yPx[i] : arrondiPx((hautMax - d.basMm - d.hauteurMm) / pas.verticalMm);
    });
  }
  // Forme réelle (9c) : courbure, plis et poses vérifiés sur la vue développée.
  verifierFormeReelle(zones, description, ficheReelle);
  const pxLargeur = x;
  const pxHauteur = Math.max(...description.map((d) => d.y + d.pxHauteur));
  const entieres = description.reduce((s, d) => s + (d.forme ? d.forme.dalles.entieres : d.dalles), 0);
  const nbDemi = description.reduce((s, d) => s + (d.forme ? d.forme.dalles.demi : 0), 0);
  verifierNombreDalles(entieres + nbDemi);
  const lignes = Math.max(...zones.map((z) => z.rangees));
  return {
    colonnes: colonne - 1,
    lignes,
    rangeeDemi: false,
    positionDemi: null,
    // Fiche des demi-dalles du mur, dès qu'une zone de la dalle du mur a sa rangée de demi-dalles.
    demi: zones.some((z) => z.rangeeDemi && !(z.dalle && z.dalle.id !== dalleMur.id)) ? demi : null,
    rangees: Array(lignes).fill('entiere'),
    dalles: { entieres, demi: nbDemi, total: entieres + nbDemi },
    largeurMm: xMm,
    hauteurMm: hautMax - basMin,
    pxLargeur,
    pxHauteur,
    // Pixels utiles : les dalles seulement ; la pixel map avec ses vides est pxCanvas.
    pxTotal: description.reduce((s, d) => s + d.pxTotal, 0),
    pxCanvas: pxLargeur * pxHauteur,
    surfaceM2: description.reduce((s, d, i) => s + (d.forme ? d.forme.surfaceM2 : murs[i].surfaceM2), 0),
    // Murs séparés : une diagonale ne veut rien dire.
    diagonaleM: null,
    ratio: ratio(pxLargeur, pxHauteur),
    zones: description,
    ecarts: listeEcarts,
    pas,
    modeEcarts: ecarts,
    saisie,
    sauts: description.flatMap((d) => (d.forme ? sautsForme(d.nom, d.forme) : [])),
    ...(mixte ? { mixte: true, mapping: pasInterpole ? 'interpole' : '1:1', dallePrincipale: dalle, ...(pasInterpole ? { pasInterpole } : {}) } : {}),
    // Dalles tournées hors axe (9c4) : Tessera M2 et T1 seulement, chaque dalle comptée deux fois.
    ...(tournees ? { horsAxe: true } : {}),
    // Zones qui se recouvrent dans la pixel map (posées à la main) : elles affichent la même image.
    superposees: zonesSuperposees(description),
  };
}

export const recouvrement = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
function zonesSuperposees(description) {
  const paires = [];
  description.forEach((a, i) => description.slice(i + 1).forEach((b) => {
    if (recouvrement(a.x, a.x + a.pxLargeur, b.x, b.x + b.pxLargeur) && recouvrement(a.y, a.y + a.pxHauteur, b.y, b.y + b.pxHauteur)) paires.push([a.nom, b.nom]);
  }));
  return paires;
}

const ALIGNEMENTS = ['gauche', 'centre', 'droite'];
// Placement des zones (9b2, Z14) : « à droite de » la zone d'avant (9a), « au-dessus de » ou « en dessous de » une zone
// (écart vertical, alignement gauche, centre ou droite, puis décalage), ou « libre » (X et hauteur du bas en mm).
// Positions en mm, ramenées au coin bas gauche du mur ; refus des références inconnues, des boucles et des zones qui se
// chevauchent sur le mur. Pixel map en chaîne, chaque écart arrondi à part : X de la référence + décalage ÷ pas ; Y de la
// référence moins la hauteur de la zone et l'écart (au-dessus), ou plus la hauteur de la référence et l'écart (en dessous) ;
// les zones « à droite de » et « libres » prennent leur Y de la hauteur réelle (9a). À la main : X et Y saisis. Puis le plus
// petit X et le plus petit Y valent 0. Rend les écarts entre zones côte à côte.
function placerZones(zones, description, { ecarts, ecartsPx, yPx, xPx, pas }) {
  const noms = description.map((d) => d.nom);
  const type = (i) => zones[i].placement?.type ?? 'droite';
  const reference = zones.map((z, i) => {
    const p = z.placement ?? {};
    const nom = noms[i];
    const t = type(i);
    if (!['droite', 'dessus', 'dessous', 'libre'].includes(t)) throw new ErreurSaisie(`${nom} : placement inconnu.`);
    if (t === 'droite') return i > 0 ? i - 1 : null;
    if (t === 'libre') {
      if (!positifOuNul(p.xMm) || !positifOuNul(p.basMm)) throw new ErreurSaisie(`${nom} : X et hauteur du bas sont des millimètres positifs ou nuls.`);
      return null;
    }
    if (p.zone === nom) throw new ErreurSaisie(`${nom} : une zone ne se place pas par rapport à elle-même.`);
    const r = noms.indexOf(p.zone);
    if (r < 0) throw new ErreurSaisie(`${nom} : la zone « ${p.zone ?? ''} » n'existe pas.`);
    if (!positifOuNul(p.ecartMm)) throw new ErreurSaisie(`${nom} : l'écart avec la zone de référence est un nombre de millimètres positif ou nul.`);
    if (p.alignement !== undefined && !ALIGNEMENTS.includes(p.alignement)) throw new ErreurSaisie(`${nom} : alignement à gauche, au centre ou à droite.`);
    if (p.decalageMm !== undefined && !Number.isFinite(p.decalageMm)) throw new ErreurSaisie(`${nom} : le décalage est un nombre de millimètres.`);
    return r;
  });
  // Ordre de calcul : chaque zone après sa référence.
  const ordre = [];
  const etat = zones.map(() => 0);
  const visiter = (i, chemin) => {
    if (etat[i] === 2) return;
    if (etat[i] === 1) throw new ErreurSaisie(`Zones ${chemin.map((j) => noms[j]).join(', ')} : placements en boucle, chacune placée par rapport à une autre.`);
    etat[i] = 1;
    if (reference[i] !== null) visiter(reference[i], [...chemin, i]);
    etat[i] = 2;
    ordre.push(i);
  };
  zones.forEach((_, i) => visiter(i, [i]));

  const decalage = (i) => {
    const p = zones[i].placement ?? {};
    const r = description[reference[i]];
    const d = description[i];
    const base = { gauche: 0, centre: (r.largeurMm - d.largeurMm) / 2, droite: r.largeurMm - d.largeurMm }[p.alignement ?? 'gauche'];
    return base + (p.decalageMm ?? 0);
  };
  // Millimètres.
  for (const i of ordre) {
    const d = description[i];
    const z = zones[i];
    const p = z.placement ?? {};
    const r = reference[i] === null ? null : description[reference[i]];
    if (type(i) === 'droite') {
      d.xMm = r ? r.xMm + r.largeurMm + (z.ecartMm ?? 0) : 0;
      d.basMm = z.basMm ?? 0;
    } else if (type(i) === 'libre') {
      d.xMm = p.xMm;
      d.basMm = p.basMm;
    } else {
      d.xMm = r.xMm + decalage(i);
      d.basMm = type(i) === 'dessus' ? r.basMm + r.hauteurMm + (p.ecartMm ?? 0) : r.basMm - (p.ecartMm ?? 0) - d.hauteurMm;
    }
  }
  const xMin = Math.min(...description.map((d) => d.xMm));
  const basMin = Math.min(...description.map((d) => d.basMm));
  for (const d of description) {
    d.xMm -= xMin;
    d.basMm -= basMin;
  }
  description.forEach((a, i) => description.slice(i + 1).forEach((b) => {
    if (recouvrement(a.xMm, a.xMm + a.largeurMm, b.xMm, b.xMm + b.largeurMm) && recouvrement(a.basMm, a.basMm + a.hauteurMm, b.basMm, b.basMm + b.hauteurMm)) {
      throw new ErreurSaisie(`Les zones ${a.nom} et ${b.nom} se chevauchent sur le mur : change leur placement ou leurs écarts.`);
    }
  }));

  // Pixels.
  const hautMax = Math.max(...description.map((d) => d.basMm + d.hauteurMm));
  const main = ecarts === 'main';
  const ecartPx = (mm, pasMm) => (ecarts === 'colles' ? 0 : arrondiPx(mm / pasMm));
  const listeEcarts = [];
  for (const i of ordre) {
    const d = description[i];
    const z = zones[i];
    const p = z.placement ?? {};
    const r = reference[i] === null ? null : description[reference[i]];
    const yReel = () => arrondiPx((hautMax - d.basMm - d.hauteurMm) / pas.verticalMm);
    if (type(i) === 'droite') {
      if (r) {
        const mm = z.ecartMm ?? 0;
        const pxCalcule = arrondiPx(mm / pas.mm);
        const px = { main: ecartsPx[i - 1], colles: 0, reel: pxCalcule }[ecarts];
        listeEcarts.push({ entre: [r.nom, d.nom], mm, px, pxCalcule });
        d.x = r.x + r.pxLargeur + px;
      } else d.x = 0;
      d.y = yReel();
    } else if (type(i) === 'libre') {
      d.x = arrondiPx(p.xMm / pas.mm);
      d.y = yReel();
    } else {
      // Alignement en pixels (un mur mixte en 1:1 n'est pas à l'échelle réelle), puis le décalage converti au pas.
      const base = { gauche: 0, centre: arrondiPx((r.pxLargeur - d.pxLargeur) / 2), droite: r.pxLargeur - d.pxLargeur }[p.alignement ?? 'gauche'];
      d.x = r.x + base + arrondiPx((p.decalageMm ?? 0) / pas.mm);
      const ecart = ecartPx(p.ecartMm ?? 0, pas.verticalMm);
      d.y = type(i) === 'dessus' ? r.y - d.pxHauteur - ecart : r.y + r.pxHauteur + ecart;
    }
    if (main && xPx && xPx[i] !== null && xPx[i] !== undefined) d.x = xPx[i];
    if (main && yPx) d.y = yPx[i];
  }
  const x0 = Math.min(...description.map((d) => d.x));
  const y0 = Math.min(...description.map((d) => d.y));
  for (const d of description) {
    d.x -= x0;
    d.y -= y0;
  }
  return listeEcarts;
}

// Forme d'une zone (9b, Z13) : grille colonnes × rangées (rangée 1 en haut, la rangée de demi-dalles comptée avec les
// autres), dalles absentes [colonne, rangée], décalage de chaque colonne vers le haut (mm), rangée de demi-dalles en
// haut ou en bas, avec sa propre fiche. Chaque case a sa place dans la zone (y depuis le haut de la zone, en px et
// en mm). La zone grandit vers le haut de son plus grand décalage. null pour un rectangle plein.
function formeZone(z, nom, dalle, demi, pas) {
  const absentes = z.absentes ?? [];
  const decalages = z.decalagesMm ?? [];
  const avecDemi = Boolean(z.rangeeDemi);
  if (!Array.isArray(absentes) || !Array.isArray(decalages)) throw new ErreurSaisie(`${nom} : forme illisible.`);
  decalages.forEach((mm, j) => {
    if (!positifOuNul(mm)) throw new ErreurSaisie(`${nom} : le décalage de la colonne ${j + 1} est un nombre de millimètres positif ou nul.`);
  });
  if (decalages.length > z.colonnes) throw new ErreurSaisie(`${nom} : plus de décalages que de colonnes.`);
  if (absentes.length === 0 && !decalages.some((mm) => mm > 0) && !avecDemi) return null;
  if (avecDemi) {
    if (z.positionDemi !== undefined && z.positionDemi !== 'haut' && z.positionDemi !== 'bas') {
      throw new ErreurSaisie(`${nom} : la rangée de demi-dalles va en haut ou en bas.`);
    }
    verifierDemi(dalle, demi);
  }
  const types = Array(z.rangees).fill('entiere');
  if (avecDemi) {
    if (z.positionDemi === 'haut') types.unshift('demi');
    else types.push('demi');
  }
  for (const a of absentes) {
    const [c, r] = Array.isArray(a) ? a : [];
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 1 || c > z.colonnes || r < 1 || r > types.length) {
      throw new ErreurSaisie(`${nom} : la dalle C${c} R${r} est hors de la grille (${z.colonnes} colonnes, ${types.length} rangées).`);
    }
  }
  const absente = new Set(absentes.map(([c, r]) => `${c},${r}`));
  if (absente.size >= z.colonnes * types.length) throw new ErreurSaisie(`${nom} : toutes les dalles sont absentes.`);
  const vide = (j) => types.every((_, r) => absente.has(`${j},${r + 1}`));
  for (const j of [1, z.colonnes]) {
    if (vide(j)) throw new ErreurSaisie(`${nom} : la colonne ${j} n'a aucune dalle : retire-la, ou réduis le nombre de colonnes.`);
  }

  const fiche = (t) => (t === 'demi' ? demi : dalle);
  const hPx = types.map((t) => fiche(t).pxV);
  const hMm = types.map((t) => fiche(t).hauteurMm);
  const cumul = (t, r) => t.slice(0, r).reduce((s, h) => s + h, 0);
  const basePx = cumul(hPx, types.length);
  const baseMm = cumul(hMm, types.length);
  const decalageMm = (j) => decalages[j - 1] ?? 0;
  const decalagePx = (j) => arrondiPx(decalageMm(j) / pas.verticalMm);
  const suiteColonnes = suite(1, z.colonnes);
  const hauteurPx = Math.max(...suiteColonnes.map((j) => decalagePx(j) + basePx));
  const hauteurMm = Math.max(...suiteColonnes.map((j) => decalageMm(j) + baseMm));
  const colonnes = suiteColonnes.map((j) => {
    const hautPx = hauteurPx - decalagePx(j) - basePx;
    const hautMm = hauteurMm - decalageMm(j) - baseMm;
    return {
      colonne: j,
      decalageMm: decalageMm(j),
      decalagePx: decalagePx(j),
      cases: types.map((type, r) => ({
        rangee: r + 1, type, presente: !absente.has(`${j},${r + 1}`),
        y: hautPx + cumul(hPx, r), h: hPx[r], yMm: hautMm + cumul(hMm, r), hMm: hMm[r],
      })),
    };
  });
  const presentes = colonnes.flatMap((c) => c.cases.filter((x) => x.presente));
  const nbDemi = presentes.filter((x) => x.type === 'demi').length;
  return {
    types,
    positionDemi: avecDemi ? (z.positionDemi === 'haut' ? 'haut' : 'bas') : null,
    colonnes,
    hauteurPx,
    hauteurMm,
    dalles: { entieres: presentes.length - nbDemi, demi: nbDemi, total: presentes.length },
    pxTotal: presentes.reduce((s, x) => s + fiche(x.type).pxH * fiche(x.type).pxV, 0),
    surfaceM2: presentes.reduce((s, x) => s + (fiche(x.type).largeurMm * fiche(x.type).hauteurMm) / 1e6, 0),
  };
}

// Sauts dans une chaîne (Z22) : dalles absentes entre deux dalles présentes d'une même colonne (une fenêtre).
// Une dalle absente au bord de la colonne n'est pas un saut.
function sautsForme(nom, forme) {
  const sauts = [];
  for (const c of forme.colonnes) {
    const presentes = c.cases.filter((x) => x.presente);
    for (let i = 1; i < presentes.length; i += 1) {
      const [a, b] = [presentes[i - 1], presentes[i]];
      if (b.rangee - a.rangee > 1) {
        const manquantes = c.cases.slice(a.rangee, b.rangee - 1);
        sauts.push({ zone: nom, colonne: c.colonne, entre: [a.rangee, b.rangee], dalles: manquantes.length, mm: manquantes.reduce((s, x) => s + x.hMm, 0) });
      }
    }
  }
  return sauts;
}
