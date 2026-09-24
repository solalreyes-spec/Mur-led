// Exports d'image : pixel map en PNG à la taille exacte du canvas (1 pixel du fichier = 1 pixel du mur), en tuiles
// au-delà de la surface permise sur iPhone, et schéma de câblage en PNG pour le chef de projet.
// Le motif vient de calculs.js (motifPixelMap) : ici, seulement le dessin et le fichier.

import { motifPixelMap, SURFACE_MAX_IMAGE } from './calculs.js';

// Teintes des dalles, alternées pour que deux voisines ne se confondent jamais.
export const TEINTES = ['#2f5b8c', '#3d7a4b', '#7a4677', '#8a6a2a'];
const MIRE = 'rgba(255, 255, 255, 0.85)';
const MIRE_BLOC = '#ffd400';

function nouveauCanvas(largeurPx, hauteurPx) {
  if (largeurPx * hauteurPx > SURFACE_MAX_IMAGE) {
    throw new Error(`Image de ${largeurPx} × ${hauteurPx} px : au-delà de la limite des navigateurs sur iPhone `
      + '(16,7 M px). Exporte-la en tuiles.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = largeurPx;
  canvas.height = hauteurPx;
  return canvas;
}

// Pixel map d'une zone (mur ou canvas d'un processeur) dans un canvas à sa taille exacte, ou seulement une tuile
// ({ x, y, largeurPx, hauteurPx }) de cette zone. Hors des dalles : noir.
export function pixelMapEnCanvas(zone, options = {}, tuile = null) {
  const motif = motifPixelMap(zone, options);
  const t = tuile ?? { x: 0, y: 0, largeurPx: motif.largeurPx, hauteurPx: motif.hauteurPx };
  const canvas = nouveauCanvas(t.largeurPx, t.hauteurPx);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, t.largeurPx, t.hauteurPx);
  ctx.translate(-t.x, -t.y);
  for (const f of motif.fonds) {
    ctx.fillStyle = TEINTES[f.teinte];
    ctx.fillRect(f.x, f.y, f.largeur, f.hauteur);
  }
  // Traits d'un pixel posés sur les pixels (décalage d'un demi-pixel), bords de dalles compris.
  ctx.lineWidth = 1;
  ctx.strokeStyle = MIRE;
  for (const c of motif.contours) ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.largeur - 1, c.hauteur - 1);
  for (const tr of motif.traits) {
    ctx.strokeStyle = tr.global ? MIRE_BLOC : MIRE;
    ctx.lineWidth = tr.global ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tr.x1, tr.y1);
    ctx.lineTo(tr.x2, tr.y2);
    ctx.stroke();
  }
  for (const c of motif.cercles) {
    ctx.strokeStyle = c.global ? MIRE_BLOC : MIRE;
    ctx.lineWidth = c.global ? 2 : 1;
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, Math.max(0, c.r), 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of motif.textes) {
    for (const [texte, taille, dy] of [[tx.texte, tx.taille, -0.55], [tx.detail, Math.round(tx.taille * 0.7), 0.6]]) {
      ctx.font = `700 ${taille}px Helvetica, Arial, sans-serif`;
      ctx.lineWidth = Math.max(2, taille / 6);
      ctx.strokeStyle = '#000000';
      ctx.strokeText(texte, tx.x, tx.y + dy * tx.taille);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(texte, tx.x, tx.y + dy * tx.taille);
    }
  }
  return canvas;
}

export function canvasEnPng(canvas) {
  return new Promise((resoudre, rejeter) => {
    canvas.toBlob((blob) => (blob ? resoudre(blob) : rejeter(new Error('Image impossible à produire sur cet appareil.'))), 'image/png');
  });
}

// Lignes de texte coupées à la largeur disponible.
function couperLignes(ctx, lignes, largeur) {
  const resultat = [];
  for (const ligne of lignes) {
    let courante = '';
    for (const mot of ligne.split(' ')) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (ctx.measureText(essai).width > largeur && courante) {
        resultat.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    resultat.push(courante);
  }
  return resultat;
}

// Schéma de câblage (SVG construit avec la palette d'export) en PNG : un titre, le dessin, puis le texte du câblage.
export async function schemaEnPng(svgElement, { largeurPx = 2000, titre = '', lignes = [] } = {}) {
  const [, , vbL, vbH] = svgElement.getAttribute('viewBox').split(/\s+/).map(Number);
  const hauteurDessin = Math.round((largeurPx * vbH) / vbL);
  const xml = new XMLSerializer().serializeToString(svgElement);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const marge = 40;
    const taille = 26;
    const interligne = 36;
    const mesure = document.createElement('canvas').getContext('2d');
    mesure.font = `${taille}px Helvetica, Arial, sans-serif`;
    let texte = couperLignes(mesure, lignes, largeurPx - 2 * marge);
    const hauteurTitre = titre ? interligne * 1.6 : 0;
    const hauteurDe = (n) => Math.ceil(marge + hauteurTitre + hauteurDessin + marge / 2 + n * interligne + marge);
    // Texte trop long pour la limite de surface : il est tronqué, la suite reste dans « Copier les résultats ».
    while (texte.length > 0 && largeurPx * hauteurDe(texte.length) > SURFACE_MAX_IMAGE) texte = texte.slice(0, -2);
    if (texte.length < lignes.length && texte.length > 0) texte.push('… suite dans « Copier les résultats ».');
    const canvas = nouveauCanvas(largeurPx, hauteurDe(texte.length));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1d2330';
    ctx.textBaseline = 'top';
    if (titre) {
      ctx.font = `700 ${Math.round(taille * 1.3)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(titre, marge, marge);
    }
    ctx.drawImage(image, 0, marge + hauteurTitre, largeurPx, hauteurDessin);
    ctx.font = `${taille}px Helvetica, Arial, sans-serif`;
    texte.forEach((ligne, i) => ctx.fillText(ligne, marge, marge + hauteurTitre + hauteurDessin + marge / 2 + i * interligne));
    return await canvasEnPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Façon d'enregistrer une image : la feuille de partage (sur iPhone : Enregistrer l'image, AirDrop, Messages) quand
// l'appareil sait partager des fichiers, le téléchargement sinon. Depuis l'écran d'accueil, le partage est plus sûr.
export function modeEnregistrement(nav, fichiers) {
  try {
    return typeof nav?.share === 'function' && typeof nav?.canShare === 'function' && nav.canShare({ files: fichiers })
      ? 'partage' : 'telechargement';
  } catch (erreur) {
    return 'telechargement';
  }
}

// Enregistre une image : partage d'abord, téléchargement en secours si le navigateur refuse le partage.
// Renvoie 'partage', 'annule' (feuille fermée par l'utilisateur) ou 'telechargement'. À appeler depuis un appui.
export async function enregistrer(blob, nom, { nav = globalThis.navigator, telecharger: secours = telecharger } = {}) {
  const fichier = new File([blob], nom, { type: blob.type || 'image/png' });
  if (modeEnregistrement(nav, [fichier]) === 'partage') {
    try {
      await nav.share({ files: [fichier], title: nom });
      return 'partage';
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return 'annule';
    }
  }
  secours(blob, nom);
  return 'telechargement';
}

// Téléchargement classique : sur ordinateur, dans le dossier Téléchargements.
export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
