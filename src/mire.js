// Mire de mapping (document du 03/10/2026 « Mire de mapping et fiche contenu », § 1) : image PNG à la résolution
// exacte du mur, ou d'une zone de processeur, ou dans le cadre standard que la régie envoie. Elle reproduit le schéma
// de câblage : chaque dalle porte le libellé et la couleur de son port, tirés des mêmes fonctions que le Schéma
// (trajetsSchema, geometrieSchema, libellePortRang…). Le plan est pur ; le dessin passe par un canvas ; le fichier est
// un PNG RVB 8 bits sans transparence. La limite de surface du canvas se mesure sur l'appareil, jamais en dur.

import { pixelMap } from './calculs.js';
import { trajetsSchema, geometrieSchema, libellePortRang, lignesNomDalle, lignesPremierPixel } from './dessin-schema.js';
import { nomFichierMire } from './contenu.js';
import { nombreCourt } from './format.js';

export const GRIS_HORS_MUR = '#141414';

// Version de l'appli écrite sur la mire : celle du service worker qui sert l'appli (la version de son cache, une seule
// source), sinon celle de sw.js (page sans service worker). « v15 », ou null si rien ne répond.
export async function versionAppli({ delaiMs = 1500 } = {}) {
  const controle = globalThis.navigator?.serviceWorker?.controller;
  if (controle) {
    const v = await new Promise((fin) => {
      const canal = new MessageChannel();
      const minuterie = setTimeout(() => fin(null), delaiMs);
      canal.port1.onmessage = (e) => {
        clearTimeout(minuterie);
        fin(e.data?.version ?? null);
      };
      controle.postMessage({ type: 'version' }, [canal.port2]);
    });
    if (v) return `v${v}`;
  }
  try {
    const m = /const VERSION = (\d+);/.exec(await (await fetch('sw.js', { cache: 'no-store' })).text());
    return m ? `v${m[1]}` : null;
  } catch (erreur) {
    return null;
  }
}
const BLANC = '#ffffff';
const NOIR = '#000000';
const DAMIER_PX = 64;
const POLICE = 'Helvetica, Arial, sans-serif';

// Couleur du port assombrie (environ 25 %) pour le fond de la dalle.
export function assombrir(hex, k = 0.25) {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Limite du canvas, mesurée sur l'appareil : dernier pixel dessiné puis relu. Safari s'arrête vers 16,7 M px sur
// iPhone (4096 × 4096) ; le WebKit de macOS va plus loin. Mesurée une fois par session.
// ---------------------------------------------------------------------------

export function canvasPossible(largeur, hauteur) {
  const c = document.createElement('canvas');
  c.width = largeur;
  c.height = hauteur;
  let ok = false;
  try {
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(largeur - 1, hauteur - 1, 1, 1);
      ok = ctx.getImageData(largeur - 1, hauteur - 1, 1, 1).data[0] === 255;
    }
  } catch (erreur) {
    ok = false;
  }
  c.width = 0;
  c.height = 0;
  return ok && c !== null;
}

const COTE_PLAFOND = 16384;
let surfaceMesuree = null;
// Plus grand carré utilisable (la limite porte sur la surface), au plus 16 384 × 16 384 : bien au-delà d'un mur réel.
export function surfaceCanvasMax() {
  if (surfaceMesuree !== null) return surfaceMesuree;
  if (canvasPossible(COTE_PLAFOND, COTE_PLAFOND)) {
    surfaceMesuree = COTE_PLAFOND * COTE_PLAFOND;
    return surfaceMesuree;
  }
  let [bas, haut] = [1, COTE_PLAFOND];
  while (haut - bas > 1) {
    const milieu = Math.floor((bas + haut) / 2);
    if (canvasPossible(milieu, milieu)) bas = milieu;
    else haut = milieu;
  }
  surfaceMesuree = bas * bas;
  return surfaceMesuree;
}

// ---------------------------------------------------------------------------
// Plan d'une mire (pur)
// ---------------------------------------------------------------------------

// Libellés d'une dalle, en haut de la dalle : ligne 1 à environ 22 % du plus petit côté, lignes 2 et 3 à 11 % ; moins de
// 96 px de côté, seule la ligne 1 ; moins de 32 px, aucun texte. Chaque ligne garde sa zone (`boite`, largeur estimée
// par excès, contour compris) : rien ne s'y dessine par-dessus. Contour sombre de 2 px en ligne 1, 1 px ensuite.
const LARGEUR_CARACTERE = 0.62;
const INTERLIGNE = 1.15;
function textesDalle(lignes, x, y, w, h) {
  const cote = Math.min(w, h);
  if (cote < 32) return [];
  const gardees = cote < 96 ? lignes.slice(0, 1) : lignes;
  let haut = y + Math.max(3, Math.round(h * 0.05));
  return gardees.map((texte, i) => {
    const taille = Math.max(8, Math.round(cote * (i === 0 ? 0.22 : 0.11)));
    const contour = i === 0 ? 2 : 1;
    const largeur = Math.min(w * 0.9, texte.length * taille * LARGEUR_CARACTERE);
    const t = {
      texte, taille, contour, x: x + w / 2, y: haut + (taille * INTERLIGNE) / 2, largeurMax: w * 0.9,
      boite: { x: x + w / 2 - largeur / 2 - contour, y: haut - contour, w: largeur + 2 * contour, h: taille * INTERLIGNE + 2 * contour },
    };
    haut += taille * INTERLIGNE;
    return t;
  });
}

// Bloc d'infos et damier 1:1, dans la moitié basse de la dalle la plus proche du centre du mur, sous ses libellés et sans
// toucher ses bords. Lignes par priorité (processeur, projet, résolution, puis date et version s'il reste la place) ;
// damier de 64, puis 32, puis 16 px pour tenir, sinon pas de damier.
const DAMIERS = [64, 32, 16];
function blocCentral(lignes, mur, dalles) {
  const [cx, cy] = [mur.x + mur.largeur / 2, mur.y + mur.hauteur / 2];
  const distance = (d) => Math.hypot(d.x + d.w / 2 - cx, d.y + d.h / 2 - cy);
  const dalle = [...dalles].sort((a, b) => distance(a) - distance(b))[0];
  const marge = Math.max(3, Math.round(Math.min(dalle.w, dalle.h) * 0.04));
  const basLibelles = Math.max(dalle.y, ...dalle.textes.map((t) => t.boite.y + t.boite.h));
  const zone = { x: dalle.x + marge, y: Math.ceil(Math.max(dalle.y + dalle.h / 2, basLibelles + marge)), w: dalle.w - 2 * marge };
  zone.h = Math.floor(dalle.y + dalle.h - marge - zone.y);
  const ecart = 4;
  // Plus grande taille de texte (8 px au moins) qui tient pour `n` lignes dans une largeur donnée.
  const ajuster = (n, largeurTexte) => {
    const choisies = lignes.slice(0, n);
    for (let taille = 24; taille >= 8; taille -= 1) {
      const h = Math.ceil(n * taille * 1.25 + taille * 0.6);
      const w = Math.ceil(Math.max(...choisies.map((l) => l.length)) * taille * LARGEUR_CARACTERE + taille);
      if (h <= zone.h && w <= largeurTexte) return { taille, h, w, lignes: choisies };
    }
    return null;
  };
  for (const cote of [...DAMIERS, 0]) {
    if (cote > zone.h || cote > zone.w) continue;
    const largeurTexte = zone.w - (cote ? cote + ecart : 0);
    for (let n = lignes.length; n >= Math.min(lignes.length, 1); n -= 1) {
      const t = ajuster(n, largeurTexte);
      if (!t) continue;
      if (n < Math.min(3, lignes.length) && cote > 0) break; // les trois premières lignes passent avant le damier
      const bloc = { x: zone.x, y: zone.y + Math.floor((zone.h - t.h) / 2), w: t.w, h: t.h, lignes: t.lignes, taille: t.taille, contour: 1, dalle: dalle.id };
      const damier = cote ? { x: zone.x + zone.w - cote, y: zone.y + Math.floor((zone.h - cote) / 2), cote } : null;
      return { bloc, damier, zone };
    }
  }
  return { bloc: { x: zone.x, y: zone.y, w: 0, h: 0, lignes: [], taille: 8, contour: 1, dalle: dalle.id }, damier: null, zone };
}

// Mention « hors mur » dans la plus grande bande libre du cadre.
function mentionHorsMur(cadre, mur) {
  const bandes = [
    { x: 0, y: 0, w: mur.x, h: cadre.hauteurPx },
    { x: mur.x + mur.largeur, y: 0, w: cadre.largeurPx - mur.x - mur.largeur, h: cadre.hauteurPx },
    { x: 0, y: 0, w: cadre.largeurPx, h: mur.y },
    { x: 0, y: mur.y + mur.hauteur, w: cadre.largeurPx, h: cadre.hauteurPx - mur.y - mur.hauteur },
  ].filter((b) => b.w > 0 && b.h > 0).sort((a, b) => b.w * b.h - a.w * a.h);
  if (!bandes.length) return null;
  const b = bandes[0];
  const taille = Math.max(10, Math.min(64, Math.round(Math.min(b.h * 0.3, b.w / 6))));
  return { texte: 'hors mur', x: b.x + b.w / 2, y: b.y + b.h / 2, taille, contour: 2, largeurMax: b.w * 0.9 };
}

// Plan d'une zone : `geo` (rectangles en px, comme la vue pixels du Schéma), `trajets` (ports du Schéma),
// `largeur` × `hauteur` de la zone, lignes du bloc central, `cadre` facultatif ({ largeurPx, hauteurPx, x, y }).
export function planMire({ geo, trajets, largeur, hauteur, lignesBloc, cadre = null }) {
  const decalage = cadre ? { x: cadre.x, y: cadre.y } : { x: 0, y: 0 };
  const mur = { x: decalage.x, y: decalage.y, largeur, hauteur };
  const parDalle = new Map(trajets.flatMap((t) => t.dalles.map((id) => [id, t])));
  const dalles = [...geo.rects.entries()].map(([id, r]) => {
    const t = parDalle.get(id) ?? null;
    const bord = t?.couleur?.ecran ?? '#808080';
    const [x, y] = [r.x + decalage.x, r.y + decalage.y];
    // Mur en zones : la mire n'a pas de nom de zone au-dessus des zones, la dalle garde donc le nom de sa zone.
    const nom = id.includes(' · ') ? id : lignesNomDalle(id).join(' ');
    const lignes = [t ? libellePortRang(t, id) : '', nom, lignesPremierPixel({ x, y }).join(' ')];
    return { id, x, y, w: r.w, h: r.h, bord, fond: assombrir(bord), textes: textesDalle(lignes, x, y, r.w, r.h) };
  });
  const { bloc, damier, zone: zoneBloc } = blocCentral(lignesBloc, mur, dalles);
  return {
    largeur: cadre ? cadre.largeurPx : largeur,
    hauteur: cadre ? cadre.hauteurPx : hauteur,
    mur,
    dalles,
    diagonales: [[mur.x, mur.y, mur.x + largeur, mur.y + hauteur], [mur.x + largeur, mur.y, mur.x, mur.y + hauteur]],
    cercle: { cx: mur.x + largeur / 2, cy: mur.y + hauteur / 2, r: 0.45 * Math.min(largeur, hauteur) },
    bloc,
    damier,
    zoneBloc,
    horsMur: cadre ? mentionHorsMur(cadre, mur) : null,
    // Mur en zones : les vides entre les zones au gris « hors mur », pour ne pas les confondre avec un noir du contenu.
    vides: Boolean(geo.zones),
  };
}

const mpx = (n) => `${nombreCourt(n / 1e6, 1)} M px`;

// Mires d'un mur câblé : mire du mur entier (ou dans le cadre de la source) et, quand le mur est réparti sur plusieurs
// processeurs, une mire par zone, coordonnées relatives à la zone. Chacune : possible ou non (limite du canvas, mur
// hors du cadre) avec son message, son plan et son nom de fichier.
export function preparerMires({ mur, dalle, evaluation = null, variante = null, projet = '', date = '', version = null, cadre = null, surfaceMax = null }) {
  const limite = surfaceMax ?? surfaceCanvasMax();
  const pm = pixelMap(mur, dalle, evaluation);
  const plusieurs = pm.canvas.length > 1;
  const nomProjet = projet?.trim() || null;
  const lignesBloc = (l, h) => [nomProjet, `${l} × ${h} px`, date || null, version ? `Mur LED ${version}` : null].filter(Boolean);

  const largeurImage = cadre ? cadre.largeurPx : mur.pxLargeur;
  const hauteurImage = cadre ? cadre.hauteurPx : mur.pxHauteur;
  const entier = { largeur: largeurImage, hauteur: hauteurImage, possible: true, message: null, plan: null, nom: nomFichierMire({ projet, largeurPx: largeurImage, hauteurPx: hauteurImage }) };
  if (cadre && (cadre.x < 0 || cadre.y < 0 || cadre.x + mur.pxLargeur > cadre.largeurPx || cadre.y + mur.pxHauteur > cadre.hauteurPx)) {
    entier.possible = false;
    entier.message = `Le mur (${mur.pxLargeur} × ${mur.pxHauteur} px) placé en x ${cadre.x}, y ${cadre.y} ne tient pas dans le cadre de `
      + `${cadre.largeurPx} × ${cadre.hauteurPx} px : change sa position ou le cadre.`;
  } else if (largeurImage * hauteurImage > limite) {
    entier.possible = false;
    entier.message = `Mire du mur entier trop grande pour cet appareil : ${mpx(largeurImage * hauteurImage)} pour une limite mesurée de ${mpx(limite)}. `
      + (plusieurs ? 'Utilise les mires par processeur.' : 'Le mur n\'a qu\'un processeur : pas de mire par processeur.');
  } else {
    const geo = geometrieSchema({ vue: 'pixels', canvasVue: 'mur' }, mur, dalle, pm);
    entier.plan = planMire({ geo, trajets: trajetsSchema({ cablage: 'data' }, variante, null), largeur: mur.pxLargeur, hauteur: mur.pxHauteur, lignesBloc: lignesBloc(largeurImage, hauteurImage), cadre });
  }

  const processeurs = plusieurs ? pm.canvas.map((c) => {
    const [l, h] = [c.bloc.largeurPx, c.bloc.hauteurPx];
    const p = { numero: c.numero, modele: evaluation.processeur.modele, largeur: l, hauteur: h, possible: true, message: null, plan: null, nom: nomFichierMire({ projet, largeurPx: l, hauteurPx: h, processeur: c.numero }) };
    if (l * h > limite) {
      p.possible = false;
      p.message = `Mire du processeur ${c.numero} trop grande pour cet appareil : ${mpx(l * h)} pour une limite mesurée de ${mpx(limite)}.`;
      return p;
    }
    const geo = geometrieSchema({ vue: 'pixels', canvasVue: `p${c.numero}` }, mur, dalle, pm);
    p.plan = planMire({
      geo, trajets: trajetsSchema({ cablage: 'data' }, variante, null, c.numero), largeur: l, hauteur: h,
      lignesBloc: [`Processeur ${c.numero}, ${p.modele}`, ...lignesBloc(l, h)],
    });
    return p;
  }) : [];
  return { mur: entier, processeurs, limite };
}

// ---------------------------------------------------------------------------
// Dessin : fond noir, dalles, puis éléments communs, puis texte.
// ---------------------------------------------------------------------------

// Texte centré en (x, y), réduit pour tenir dans sa largeur, avec un contour sombre (`contour` px autour des lettres) :
// lisible sur les diagonales et le cercle, qui restent dessous.
function texteAjuste(ctx, t, couleur = BLANC) {
  let taille = t.taille;
  ctx.font = `700 ${taille}px ${POLICE}`;
  while (taille > 6 && t.largeurMax && ctx.measureText(t.texte).width > t.largeurMax) {
    taille -= 1;
    ctx.font = `700 ${taille}px ${POLICE}`;
  }
  if (t.contour) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = t.contour * 2;
    ctx.strokeStyle = NOIR;
    ctx.strokeText(t.texte, t.x, t.y);
  }
  ctx.fillStyle = couleur;
  ctx.fillText(t.texte, t.x, t.y);
}

export function dessinerMire(plan) {
  const canvas = document.createElement('canvas');
  canvas.width = plan.largeur;
  canvas.height = plan.hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`Image de ${plan.largeur} × ${plan.hauteur} px impossible sur cet appareil.`);
  ctx.imageSmoothingEnabled = false;
  const { mur } = plan;
  ctx.fillStyle = plan.horsMur || plan.largeur !== mur.largeur || plan.hauteur !== mur.hauteur ? GRIS_HORS_MUR : NOIR;
  ctx.fillRect(0, 0, plan.largeur, plan.hauteur);
  ctx.fillStyle = plan.vides ? GRIS_HORS_MUR : NOIR;
  ctx.fillRect(mur.x, mur.y, mur.largeur, mur.hauteur);

  // Dalles : fond du port assombri, bord de 1 px à l'intérieur de la dalle, couleur du port.
  ctx.lineWidth = 1;
  for (const d of plan.dalles) {
    ctx.fillStyle = d.fond;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = d.bord;
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
  }

  // Éléments communs : diagonales et cercle de 2 px, cadre de 1 px, bloc central, damier 1:1.
  ctx.strokeStyle = BLANC;
  ctx.lineWidth = 2;
  for (const [x1, y1, x2, y2] of plan.diagonales) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(plan.cercle.cx, plan.cercle.cy, plan.cercle.r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeRect(mur.x + 0.5, mur.y + 0.5, mur.largeur - 1, mur.hauteur - 1);
  const b = plan.bloc;
  if (b.w > 0 && b.h > 0) {
    ctx.fillStyle = NOIR;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
  const dm = plan.damier;
  if (dm) {
    const motif = ctx.createImageData(dm.cote, dm.cote);
    for (let j = 0; j < dm.cote; j += 1) {
      for (let i = 0; i < dm.cote; i += 1) {
        const v = (i + j) % 2 === 0 ? 255 : 0;
        motif.data.set([v, v, v, 255], (j * dm.cote + i) * 4);
      }
    }
    ctx.putImageData(motif, dm.x, dm.y);
  }

  // Texte : blanc, gras, sans empattement.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of plan.dalles) for (const t of d.textes) texteAjuste(ctx, t);
  b.lignes.forEach((ligne, i) => texteAjuste(ctx, {
    texte: ligne, taille: b.taille, contour: b.contour, x: b.x + b.w / 2, y: b.y + b.h / 2 + (i - (b.lignes.length - 1) / 2) * b.taille * 1.25,
    largeurMax: b.w - b.taille,
  }));
  if (plan.horsMur) texteAjuste(ctx, plan.horsMur, '#bfbfbf');
  return canvas;
}

// ---------------------------------------------------------------------------
// PNG RVB 8 bits sans transparence (le PNG du canvas est en RVBA) : lignes filtrées (filtre 0), compressées par le
// navigateur (CompressionStream, format zlib), puis IHDR, sRGB, IDAT, IEND. Sans CompressionStream : le PNG du canvas.
// ---------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, donnees) {
  const tete = new Uint8Array(8);
  const vue = new DataView(tete.buffer);
  vue.setUint32(0, donnees.length);
  for (let i = 0; i < 4; i += 1) tete[4 + i] = type.charCodeAt(i);
  const pied = new Uint8Array(4);
  const aCalculer = new Uint8Array(4 + donnees.length);
  aCalculer.set(tete.subarray(4), 0);
  aCalculer.set(donnees, 4);
  new DataView(pied.buffer).setUint32(0, crc32(aCalculer));
  return [tete, donnees, pied];
}

export async function pngRvb(canvas) {
  if (typeof CompressionStream !== 'function') {
    return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Image impossible à produire sur cet appareil.'))), 'image/png'));
  }
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d');
  const flux = new CompressionStream('deflate');
  const ecrivain = flux.writable.getWriter();
  const compresse = new Response(flux.readable).arrayBuffer();
  const bande = Math.max(1, Math.floor(4000000 / (W * 4)));
  for (let y = 0; y < H; y += bande) {
    const h = Math.min(bande, H - y);
    const rgba = ctx.getImageData(0, y, W, h).data;
    const lignes = new Uint8Array(h * (W * 3 + 1));
    let k = 0;
    for (let j = 0; j < h; j += 1) {
      lignes[k] = 0;
      k += 1;
      for (let i = (j * W) * 4, fin = ((j + 1) * W) * 4; i < fin; i += 4) {
        lignes[k] = rgba[i];
        lignes[k + 1] = rgba[i + 1];
        lignes[k + 2] = rgba[i + 2];
        k += 3;
      }
    }
    await ecrivain.write(lignes);
  }
  await ecrivain.close();
  const ihdr = new Uint8Array(13);
  const vue = new DataView(ihdr.buffer);
  vue.setUint32(0, W);
  vue.setUint32(4, H);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Blob([signature, ...bloc('IHDR', ihdr), ...bloc('sRGB', new Uint8Array([0])),
    ...bloc('IDAT', new Uint8Array(await compresse)), ...bloc('IEND', new Uint8Array(0))], { type: 'image/png' });
}
