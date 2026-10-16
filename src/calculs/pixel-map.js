// Calculs du mur LED, module 6, pixel map : dalles du mur, pixel map, positions par dalle (CSV, OBJ), sortie pliée,
// tuiles d'image, motif de la pixel map.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { ErreurSaisie } from './commun.js';
import { mur } from './mur.js';
import { plusieursZones, ficheZone, demiZone } from './morceaux.js';
import { tournerDansZone, rad, formeReelle } from './forme-reelle.js';
import { repartir } from './capacites.js';

// ---------------------------------------------------------------------------
// Module 6 : schéma de câblage et pixel map (étape 8)
// Colonnes de gauche à droite et rangées de haut en bas, numérotées à partir de 1 (« C3 R2 ») ;
// pixels de 0 à largeur − 1, pixel (0,0) en haut à gauche. Le dessin ne fait qu'afficher ces résultats.
// ---------------------------------------------------------------------------

// Limite des navigateurs sur iPhone : surface d'une image générée (4096 × 4096 px), pas un format fixe.
export const SURFACE_MAX_IMAGE = 16777216;
const COTE_MAX_IMAGE = 32767;

export const idDalle = (colonne, rangee) => `C${colonne} R${rangee}`;
// Mur en zones (étape 9a, D4) : « B · C3 R2 », colonne et rangée comptées dans la zone.
export const idDalleZone = (zone, colonne, rangee) => `${zone} · C${colonne} R${rangee}`;

// Dalles du mur, rangée par rangée : position et taille en millimètres et en pixels, chacune avec sa fiche
// (la demi-dalle garde la sienne).
export function dallesDuMur(m, dalle) {
  if (plusieursZones(m)) return dallesDesZones(m, dalle);
  const dalles = [];
  let yMm = 0;
  let yPx = 0;
  m.rangees.forEach((type, i) => {
    const fiche = type === 'demi' ? m.demi : dalle;
    for (let c = 1; c <= m.colonnes; c += 1) {
      dalles.push({
        id: idDalle(c, i + 1),
        colonne: c,
        rangee: i + 1,
        type,
        fiche,
        mm: { x: (c - 1) * dalle.largeurMm, y: yMm, largeur: fiche.largeurMm, hauteur: fiche.hauteurMm },
        px: { x: (c - 1) * dalle.pxH, y: yPx, largeur: fiche.pxH, hauteur: fiche.pxV },
      });
    }
    yMm += fiche.hauteurMm;
    yPx += fiche.pxV;
  });
  return dalles;
}

// Mur en zones : chaque zone à sa place réelle (mm, haut le plus haut à 0) et dans la pixel map (px, vides compris).
function dallesDesZones(m, dalleMur) {
  const basMin = Math.min(...m.zones.map((z) => z.basMm));
  const hautMax = basMin + m.hauteurMm;
  // Une seule zone (de forme libre) : noms sans la zone, « C3 R2 », comme le mode Dalles.
  const nommer = m.zones.length > 1 ? idDalleZone : (zone, c, r) => idDalle(c, r);
  return m.zones.flatMap((z) => tournerDalles(z, dallesZone(z)));
  // Zone tournée hors axe (9c4) : chaque dalle tournée autour du coin haut gauche de la zone, recalée dans son rectangle
  // englobant ; la dalle garde sa taille, son centre tourne, `rotation` donne l'angle.
  function tournerDalles(z, dalles) {
    if (!z.roulis) return dalles;
    const yMm = hautMax - z.basMm - z.hauteurMm;
    return dalles.map((d) => {
      const [cx, cy] = tournerDansZone(z.roulis, d.px.x - z.x + d.px.largeur / 2, d.px.y - z.y + d.px.hauteur / 2, false);
      const [mx, my] = tournerDansZone(z.roulis, d.mm.x - z.xMm + d.mm.largeur / 2, d.mm.y - yMm + d.mm.hauteur / 2, true);
      return {
        ...d, rotation: z.roulis.deg,
        px: { ...d.px, x: z.x + cx - d.px.largeur / 2, y: z.y + cy - d.px.hauteur / 2 },
        mm: { ...d.mm, x: z.xMm + mx - d.mm.largeur / 2, y: yMm + my - d.mm.hauteur / 2 },
      };
    });
  }
  function dallesZone(z) {
    // Mur mixte : chaque zone avec sa dalle et sa demi-dalle.
    const dalle = ficheZone(m, z, dalleMur);
    const demi = demiZone(m, z);
    const yMm = hautMax - z.basMm - z.hauteurMm;
    const dalles = [];
    if (z.forme) {
      // Forme libre : rangée par rangée, les dalles présentes seulement, chacune avec sa fiche (la demi-dalle garde la sienne).
      for (let r = 1; r <= z.forme.types.length; r += 1) {
        for (const col of z.forme.colonnes) {
          const x = col.cases[r - 1];
          if (!x.presente) continue;
          const fiche = x.type === 'demi' ? demi : dalle;
          const j = col.colonne;
          dalles.push({
            id: nommer(z.nom, j, r),
            colonne: z.premiereColonne + j - 1,
            colonneZone: j,
            rangee: r,
            zone: z.nom,
            type: x.type,
            fiche,
            mm: { x: z.xMm + (j - 1) * dalle.largeurMm, y: yMm + x.yMm, largeur: fiche.largeurMm, hauteur: fiche.hauteurMm },
            px: { x: z.x + (j - 1) * dalle.pxH, y: z.y + x.y, largeur: fiche.pxH, hauteur: fiche.pxV },
          });
        }
      }
      return dalles;
    }
    for (let r = 1; r <= z.lignes; r += 1) {
      for (let j = 1; j <= z.colonnes; j += 1) {
        dalles.push({
          id: nommer(z.nom, j, r),
          colonne: z.premiereColonne + j - 1,
          colonneZone: j,
          rangee: r,
          zone: z.nom,
          type: 'entiere',
          fiche: dalle,
          mm: { x: z.xMm + (j - 1) * dalle.largeurMm, y: yMm + (r - 1) * dalle.hauteurMm, largeur: dalle.largeurMm, hauteur: dalle.hauteurMm },
          px: { x: z.x + (j - 1) * dalle.pxH, y: z.y + (r - 1) * dalle.pxV, largeur: dalle.pxH, hauteur: dalle.pxV },
        });
      }
    }
    return dalles;
  }
}

// Pixel map : le mur à sa résolution native, puis un canvas par processeur (bloc posé en (0,0) de son canvas,
// à la même place dans sa source). Chaque dalle : x et y de son premier à son dernier pixel.
export function pixelMap(m, dalle, evaluation = null) {
  // Mur mixte : le mur tel que le processeur le compte (pixels interpolés sur les M2 et T1), comme cablageData.
  if (evaluation?.mur) {
    m = evaluation.mur;
    dalle = m.dallePrincipale ?? dalle;
  }
  const dalles = dallesDuMur(m, dalle);
  const enZones = plusieursZones(m);
  const indexZone = enZones ? new Map(m.zones.map((z, i) => [z.nom, i])) : null;
  const zone = (d, x0 = 0, y0 = 0) => ({
    id: d.id, colonne: d.colonne, rangee: d.rangee, type: d.type,
    ...(enZones ? { zone: indexZone.get(d.zone), colonneZone: d.colonneZone } : {}),
    ...(d.rotation ? { rotation: d.rotation } : {}),
    x: [d.px.x - x0, d.px.x - x0 + d.px.largeur - 1],
    y: [d.px.y - y0, d.px.y - y0 + d.px.hauteur - 1],
  });
  // Mur en zones (étape 9a) : chaque zone, ou morceau de zone dans un canvas, pour les étiquettes de la pixel map.
  const etiquette = (nom, index, x, y, largeurPx, hauteurPx, colonnes, rangees) => {
    // Mur mixte : la taille réelle avec la dalle de la zone ; forme libre : celle de la zone (décalages compris).
    const z = enZones ? m.zones[index] : null;
    const f = z ? ficheZone(m, z, dalle) : dalle;
    const largeurM = (colonnes * f.largeurMm) / 1000;
    const hauteurM = z?.forme && rangees >= z.forme.types.length ? z.hauteurMm / 1000 : (rangees * f.hauteurMm) / 1000;
    return { nom, index, x, y, largeurPx, hauteurPx, largeurM, hauteurM };
  };
  // Dalles d'un bloc : celles de ses morceaux de zones (zone, colonnes et rangées dans la zone) ; sinon ses colonnes
  // et rangées du mur.
  // Forme libre coupée en hauteur : la dalle dans la bande du morceau (en pixels, les colonnes décalées n'ont pas leurs
  // rangées à la même hauteur).
  const dansRangees = (p, d) => (m.zones[p.zone].forme
    ? d.px.y >= p.y && d.px.y + d.px.hauteur <= p.y + p.hauteurPx
    : d.rangee >= p.premiereRangee && d.rangee < p.premiereRangee + p.rangees);
  const dansBloc = (g) => (g.parties
    ? (d) => g.parties.some((p) => m.zones[p.zone].nom === d.zone && d.colonneZone >= p.premiereColonne && d.colonneZone < p.premiereColonne + p.colonnes
      && dansRangees(p, d))
    : (d) => d.colonne >= g.premiereColonne && d.colonne <= g.derniereColonne && d.rangee >= g.premiereRangee && d.rangee <= g.derniereRangee);
  const canvas = (evaluation?.groupes ?? []).map((g, i) => ({
    numero: i + 1,
    bloc: { largeurPx: g.largeurPx, hauteurPx: g.hauteurPx },
    canvas: g.canvas,
    xMur: g.x,
    yMur: g.y,
    source: { x: [0, g.largeurPx - 1], y: [0, g.hauteurPx - 1] },
    dalles: dalles.filter(dansBloc(g)).map((d) => zone(d, g.x[0], g.y[0])),
    ...(g.parties ? {
      zones: g.parties.map((p) => etiquette(p.nomAffiche, p.zone, p.dansEntree.x, p.dansEntree.y, p.largeurPx, p.hauteurPx, p.colonnes, p.rangees)),
    } : {}),
  }));
  return {
    mur: {
      largeurPx: m.pxLargeur,
      hauteurPx: m.pxHauteur,
      dalles: dalles.map((d) => zone(d)),
      ...(enZones ? { zones: m.zones.map((z, i) => etiquette(z.nom, i, z.x, z.y, z.pxLargeur, z.pxHauteur, z.colonnes, z.lignes)) } : {}),
    },
    canvas,
  };
}

// Liste des positions par dalle (9c3, Z42, Z43) : pour le serveur média ou la 3D. Chaque dalle présente, dans l'ordre
// des zones, puis des colonnes et des rangées : sa place dans la pixel map du mur (mapping retenu compris, coins dans
// l'ordre bas gauche, bas droit, haut droit, haut gauche), son processeur et son port (câblage retenu, `variante` de
// cablageData), le centre de sa face (mm), ses angles et ses quatre coins (formeReelle). Pixels du contenu : une sortie
// pliée (9b7) ne change pas cette liste.
export function positionsDalles(m, dalle, { evaluation = null, variante = null, pliage = null } = {}) {
  const f = formeReelle(m, dalle);
  const pm = pixelMap(m, dalle, evaluation);
  const px = new Map(pm.mur.dalles.map((d) => [d.id, d]));
  const ports = new Map();
  for (const p of variante?.processeurs ?? []) for (const port of p.ports) for (const id of port.dalles) ports.set(id, { processeur: p.numero, port: port.numero });
  const dalles = f.dalles.map((d) => {
    const q = px.get(d.id);
    const x0 = q.x[0];
    const y0 = q.y[0];
    const w = q.x[1] - q.x[0] + 1;
    const h = q.y[1] - q.y[0] + 1;
    // Dalle tournée hors axe (9c4) : ses coins tournent autour de son centre ; px_x et px_y, son coin haut gauche.
    const pxCoins = q.rotation ? coinsTournes(x0 + w / 2, y0 + h / 2, w, h, q.rotation) : [[x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0], [x0, y0]];
    return {
      id: d.id, zone: d.zone, colonne: d.colonne, rangee: d.rangee, fiche: d.fiche?.id ?? '', largeurMm: d.largeurMm, hauteurMm: d.hauteurMm,
      px: { x: pxCoins[3][0], y: pxCoins[3][1], largeur: w, hauteur: h }, pxCoins,
      ...(ports.get(d.id) ?? { processeur: null, port: null }),
      centreMm: d.centreMm, lacetDeg: d.lacetDeg, tangageDeg: d.tangageDeg, roulisDeg: d.roulisDeg, coinsMm: d.coinsMm,
    };
  });
  return { dalles, largeurPx: pm.mur.largeurPx, hauteurPx: pm.mur.hauteurPx, plie: Boolean(pliage?.plie) };
}

// Coins d'un rectangle de centre (cx, cy), tourné de `deg` (sens inverse des aiguilles d'une montre vu du public),
// coordonnées vers le bas : bas gauche, bas droit, haut droit, haut gauche.
export function coinsTournes(cx, cy, w, h, deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([x, y]) => [cx + x * c + y * s, cy - x * s + y * c]);
}
const chiffre = (x, decimales) => {
  const k = 10 ** decimales;
  return String(Math.round(x * k) / k + 0);
};
const champCsv = (x) => {
  const s = x === null || x === undefined ? '' : String(x);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const ENTETE_CSV = ['dalle', 'zone', 'colonne', 'rangee', 'fiche', 'largeur_mm', 'hauteur_mm', 'px_x', 'px_y', 'px_largeur', 'px_hauteur',
  'processeur', 'port', 'x_mm', 'y_mm', 'z_mm', 'lacet_deg', 'tangage_deg', 'roulis_deg'];
// CSV : UTF-8, virgule, point décimal, en-têtes sans accent ; mm et px à 0,1 près, angles à 0,01° (Z42).
export function texteCSV(positions) {
  const lignes = positions.dalles.map((d) => [
    d.id, d.zone, d.colonne, d.rangee, d.fiche, chiffre(d.largeurMm, 1), chiffre(d.hauteurMm, 1),
    chiffre(d.px.x, 1), chiffre(d.px.y, 1), chiffre(d.px.largeur, 1), chiffre(d.px.hauteur, 1), d.processeur, d.port,
    ...d.centreMm.map((x) => chiffre(x, 1)), chiffre(d.lacetDeg, 2), chiffre(d.tangageDeg, 2), chiffre(d.roulisDeg, 2),
  ].map(champCsv).join(','));
  return [ENTETE_CSV.join(','), ...lignes].join('\n');
}

// OBJ : en mètres, un objet par zone, une face carrée par dalle (sommets bas gauche, bas droit, haut droit, haut gauche,
// sens inverse des aiguilles d'une montre vu du public), UV = place de la dalle dans la pixel map, de 0 à 1, v = 1 en
// haut ; repère en commentaire (Z43). Commentaires sans accent, lus par tous les logiciels 3D.
export function texteOBJ(positions) {
  const { largeurPx: W, hauteurPx: H } = positions;
  const lignes = [
    '# Mur LED : modele 3D exporte par l\'appli, une face par dalle presente',
    '# Unites : metres. Repere : X vers la droite, Y vers le haut, Z vers le public ; origine au coin bas gauche de la face de la premiere zone',
    `# UV : place de chaque dalle dans la pixel map du mur (${W} x ${H} px), de 0 a 1, v = 1 en haut`,
    ...(positions.plie ? ['# Sortie du serveur pliee : place des tranches dans l\'onglet Canvas (le modele suit le contenu, a plat)'] : []),
  ];
  let zone = null;
  let n = 0;
  for (const d of positions.dalles) {
    if (d.zone !== zone) {
      zone = d.zone;
      lignes.push(`o ${String(zone).replace(/\s+/g, '_')}`);
    }
    for (const c of d.coinsMm) lignes.push(`v ${c.map((x) => chiffre(x / 1000, 6)).join(' ')}`);
    for (const [x, y] of d.pxCoins) lignes.push(`vt ${chiffre(x / W, 6)} ${chiffre(1 - y / H, 6)}`);
    lignes.push(`f ${[1, 2, 3, 4].map((k) => `${n + k}/${n + k}`).join(' ')}`);
    n += 4;
  }
  return lignes.join('\n');
}

// Sortie pliée (9b7, S7) : la pixel map de chaque processeur plié, à la taille du format de la sortie, chaque dalle
// déplacée avec sa tranche (de sa place dans le contenu à sa place dans la sortie), une étiquette par tranche comme
// la slide de la formation. Les processeurs non pliés restent tels quels. `m` : le mur (noms des zones).
export function pixelMapPliee(pm, m, pliage) {
  if (!pliage?.plie) return pm;
  const nomZone = (d) => (d.zone !== undefined ? m.zones[d.zone].nom : 'Mur');
  const indexZone = (nom) => (m.zones ? m.zones.findIndex((z) => z.nom === nom) : 0);
  const canvas = pm.canvas.map((c, i) => {
    const b = pliage.blocs[i];
    if (!b || b.tel || !b.ok) return c;
    const { largeurPx, hauteurPx } = pliage.format;
    const dalles = c.dalles.map((d) => {
      const xMur = d.x[0] + c.xMur[0];
      const yMur = d.y[0] + c.yMur[0];
      const colonne = d.colonneZone ?? d.colonne;
      const t = b.tranches.find((x) => x.zone === nomZone(d) && colonne >= x.colonnes[0] && colonne <= x.colonnes[1]
        && yMur >= x.contenu.y && yMur < x.contenu.y + x.contenu.hauteurPx);
      if (!t) return null;
      const dx = t.sortie.x - t.contenu.x;
      const dy = t.sortie.y - t.contenu.y;
      return { ...d, tranche: t.nom, x: [xMur + dx, xMur + dx + d.x[1] - d.x[0]], y: [yMur + dy, yMur + dy + d.y[1] - d.y[0]] };
    }).filter(Boolean);
    return {
      ...c,
      plie: true,
      bloc: { largeurPx, hauteurPx },
      canvas: null,
      largeurPx,
      hauteurPx,
      source: { x: [0, largeurPx - 1], y: [0, hauteurPx - 1] },
      dalles,
      zones: b.tranches.map((t) => ({
        nom: t.nom, index: Math.max(0, indexZone(t.zone)), x: t.sortie.x, y: t.sortie.y,
        largeurPx: t.contenu.largeurPx, hauteurPx: t.contenu.hauteurPx, largeurM: t.largeurM, hauteurM: t.hauteurM,
      })),
    };
  });
  return { ...pm, canvas };
}

// Dalle tournée d'un quart de tour (portrait ↔ paysage), seulement si sa fiche le permet.
export function dalleTournee(dalle) {
  if (dalle.rotationPossible !== true) {
    throw new ErreurSaisie(`La fiche de ${dalle.nom} ne dit pas que la dalle peut tourner : pas de rotation, `
      + 'la dalle reste dans le sens de sa fiche.');
  }
  const s = dalle.sources ?? {};
  return {
    ...dalle,
    id: `${dalle.id}-tournee`,
    nom: `${dalle.nom} (tournée)`,
    largeurMm: dalle.hauteurMm,
    hauteurMm: dalle.largeurMm,
    pxH: dalle.pxV,
    pxV: dalle.pxH,
    demiDalle: null,
    orientation: 'tournee',
    sources: { ...s, largeurMm: s.hauteurMm, hauteurMm: s.largeurMm, pxH: s.pxV, pxV: s.pxH },
  };
}

// Tuiles d'export d'une image : une seule si sa surface tient dans la limite des navigateurs sur iPhone,
// sinon le moins de tuiles possible, chacune sous la limite, sans trou ni chevauchement.
export function tuilesImage(largeurPx, hauteurPx, { surfaceMax = SURFACE_MAX_IMAGE } = {}) {
  if (largeurPx * hauteurPx <= surfaceMax && largeurPx <= COTE_MAX_IMAGE && hauteurPx <= COTE_MAX_IMAGE) {
    return [{ x: 0, y: 0, largeurPx, hauteurPx }];
  }
  let meilleur = null;
  for (let nx = 1; nx <= largeurPx; nx += 1) {
    const l = Math.ceil(largeurPx / nx);
    if (l > COTE_MAX_IMAGE) continue;
    const ny = Math.max(Math.ceil(hauteurPx / Math.floor(surfaceMax / l)), Math.ceil(hauteurPx / COTE_MAX_IMAGE));
    if (!meilleur || nx * ny < meilleur.nx * meilleur.ny) meilleur = { nx, ny };
    if (ny === 1) break;
  }
  const tuiles = [];
  let y = 0;
  for (const h of repartir(hauteurPx, meilleur.ny)) {
    let x = 0;
    for (const l of repartir(largeurPx, meilleur.nx)) {
      tuiles.push({ x, y, largeurPx: l, hauteurPx: h });
      x += l;
    }
    y += h;
  }
  return tuiles;
}

// Motif de la pixel map exportée, à la taille exacte de la zone (le mur, ou le canvas d'un processeur avec son bloc
// en haut à gauche) : fond de chaque dalle en quatre teintes alternées, pour distinguer ses voisines. En option,
// la mire (contour de chaque dalle, diagonales et cercle de chaque dalle, plus deux diagonales et un cercle sur tout
// le bloc, marqués `global`) et les numéros de dalles avec leur premier pixel. Le dessin ne fait que l'afficher.
export function motifPixelMap(zone, { grille = false, cercles = false, diagonales = false, numeros = false } = {}) {
  const largeurPx = zone.canvas ? zone.canvas.largeurPx : zone.largeurPx ?? zone.bloc.largeurPx;
  const hauteurPx = zone.canvas ? zone.canvas.hauteurPx : zone.hauteurPx ?? zone.bloc.hauteurPx;
  const fonds = zone.dalles.map((d) => ({
    id: d.id,
    x: d.x[0],
    y: d.y[0],
    largeur: d.x[1] - d.x[0] + 1,
    hauteur: d.y[1] - d.y[0] + 1,
    teinte: ((d.colonne - 1) % 2) + 2 * ((d.rangee - 1) % 2),
    // Mur en zones : une couleur par zone, deux tons en damier (comme la slide de la formation).
    ...(d.zone !== undefined ? { zone: d.zone, ton: (d.colonneZone + d.rangee) % 2 } : {}),
  }));
  // Dalle tournée hors axe (9c4) : ses quatre coins (bas gauche, bas droit, haut droit, haut gauche) et son angle.
  zone.dalles.forEach((d, i) => {
    if (!d.rotation) return;
    const f = fonds[i];
    f.rotation = d.rotation;
    f.coins = coinsTournes(f.x + f.largeur / 2, f.y + f.hauteur / 2, f.largeur, f.hauteur, d.rotation);
  });
  const coins = (f) => f.coins ?? [[f.x, f.y + f.hauteur], [f.x + f.largeur, f.y + f.hauteur], [f.x + f.largeur, f.y], [f.x, f.y]];
  const tous = fonds.flatMap(coins);
  const x0 = Math.min(...tous.map((c) => c[0]));
  const y0 = Math.min(...tous.map((c) => c[1]));
  const bloc = { x: x0, y: y0, largeur: Math.max(...tous.map((c) => c[0])) - x0, hauteur: Math.max(...tous.map((c) => c[1])) - y0 };
  const traits = [];
  const ronds = [];
  if (diagonales) {
    for (const f of fonds) {
      const [bg, bd, hd, hg] = coins(f);
      traits.push({ x1: hg[0], y1: hg[1], x2: bd[0], y2: bd[1], global: false });
      traits.push({ x1: hd[0], y1: hd[1], x2: bg[0], y2: bg[1], global: false });
    }
    traits.push({ x1: bloc.x, y1: bloc.y, x2: bloc.x + bloc.largeur, y2: bloc.y + bloc.hauteur, global: true });
    traits.push({ x1: bloc.x + bloc.largeur, y1: bloc.y, x2: bloc.x, y2: bloc.y + bloc.hauteur, global: true });
  }
  if (cercles) {
    for (const f of fonds) ronds.push({ cx: f.x + f.largeur / 2, cy: f.y + f.hauteur / 2, r: Math.min(f.largeur, f.hauteur) / 2 - 0.5, global: false });
    ronds.push({ cx: bloc.x + bloc.largeur / 2, cy: bloc.y + bloc.hauteur / 2, r: Math.min(bloc.largeur, bloc.hauteur) / 2 - 0.5, global: true });
  }
  return {
    largeurPx,
    hauteurPx,
    bloc,
    fonds,
    contours: grille ? fonds.map(({ x, y, largeur, hauteur, coins: c }) => ({ x, y, largeur, hauteur, ...(c ? { coins: c } : {}) })) : [],
    traits,
    cercles: ronds,
    textes: numeros
      ? fonds.map((f) => ({
        x: f.x + f.largeur / 2, y: f.y + f.hauteur / 2, texte: f.id, detail: `${f.x}, ${f.y}`,
        taille: Math.max(8, Math.round(Math.min(f.largeur, f.hauteur) * 0.16)),
      }))
      : [],
    // Mur en zones : au centre de chaque zone (ou morceau), son nom, « x, y // largeur × hauteur » et sa taille en m.
    etiquettes: (zone.zones ?? []).map((z) => ({
      x: z.x + z.largeurPx / 2,
      y: z.y + z.hauteurPx / 2,
      lignes: [z.nom, `${z.x}, ${z.y} // ${z.largeurPx} × ${z.hauteurPx}`, `${nombreCourt(z.largeurM, 2)} × ${nombreCourt(z.hauteurM, 2)} m`],
      taille: Math.max(12, Math.round(Math.min(z.largeurPx, z.hauteurPx) * 0.05)),
      largeurMax: z.largeurPx * 0.9,
    })),
  };
}
