// Fiche presta en PDF (lot 14d) : l'appli fabrique elle-même le fichier, sans bibliothèque ni police téléchargée, parce
// que l'impression du navigateur ne marche pas dans l'appli installée sur l'écran d'accueil de l'iPhone. Fonctions pures :
// texte en WinAnsi (Helvetica et Helvetica-Bold, polices standard de tout lecteur PDF, largeurs de leurs fichiers AFM),
// mise en page A4 portrait comme l'aperçu (titre, rappel, tableau « libellé : valeur », un bloc par mur), puis le fichier
// PDF 1.4 lui-même, tout en ASCII (accents en octal), flux non compressés.

export const A4 = { largeur: 595.28, hauteur: 841.89, marge: 40 };

// Largeurs Helvetica et Helvetica-Bold (millièmes de la taille), codes WinAnsi 32 à 126, puis 128 à 159, puis 160 à 255.
const ASCII = {
  normal: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
    778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222,
    222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  gras: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667,
    778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278,
    278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};
// Codes 128 à 159 : € (128), ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ (130 à 140), Ž (142), ‘ ’ “ ” • – — ˜ ™ š › œ (145 à 156), ž Ÿ (158, 159).
const SPECIAUX = {
  normal: { 128: 556, 130: 222, 131: 556, 132: 333, 133: 1000, 134: 556, 135: 556, 136: 333, 137: 1000, 138: 667, 139: 333, 140: 1000,
    142: 611, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 150: 556, 151: 1000, 152: 333, 153: 1000, 154: 500, 155: 333, 156: 944,
    158: 500, 159: 667 },
  gras: { 128: 556, 130: 278, 131: 556, 132: 500, 133: 1000, 134: 556, 135: 556, 136: 333, 137: 1000, 138: 667, 139: 333, 140: 1000,
    142: 611, 145: 278, 146: 278, 147: 500, 148: 500, 149: 350, 150: 556, 151: 1000, 152: 333, 153: 1000, 154: 556, 155: 333, 156: 944,
    158: 500, 159: 667 },
};
const LATIN1 = {
  normal: [278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278,
    333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722,
    722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556,
    556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
  gras: [278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278,
    333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722,
    722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556,
    556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556],
};
const CODES_SPECIAUX = new Map([...'€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ'].map((c, i) => [c, 128 + i]).filter(([c]) => c !== '\u0000'));
// Caractères absents de WinAnsi : remplacés par leur équivalent le plus proche ; le reste devient « ? ».
const REMPLACEMENTS = {
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '\n': ' ', '\t': ' ',
  '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≈': '~', '−': '-', '‑': '-', '‐': '-', '≠': '!=',
};

// Texte en WinAnsi : chaque caractère du résultat a pour code son octet WinAnsi.
export function versWinAnsi(texte) {
  let r = '';
  for (const c of String(texte)) {
    const code = c.charCodeAt(0);
    if (REMPLACEMENTS[c] !== undefined) r += REMPLACEMENTS[c];
    else if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) r += c;
    else if (CODES_SPECIAUX.has(c)) r += String.fromCharCode(CODES_SPECIAUX.get(c));
    else r += '?';
  }
  return r;
}

function largeurCode(code, gras) {
  const g = gras ? 'gras' : 'normal';
  if (code >= 32 && code <= 126) return ASCII[g][code - 32];
  if (code >= 160 && code <= 255) return LATIN1[g][code - 160];
  return SPECIAUX[g][code] ?? 556;
}

// Largeur d'un texte en points.
export function largeurTexte(texte, { gras = false, taille = 10 } = {}) {
  let somme = 0;
  for (const c of versWinAnsi(texte)) somme += largeurCode(c.charCodeAt(0), gras);
  return (somme * taille) / 1000;
}

// Lignes d'un texte dans une largeur : coupées entre les mots ; un mot trop long est coupé où il faut.
export function couperTexte(texte, largeur, police = {}) {
  const tient = (t) => largeurTexte(t, police) <= largeur;
  const lignes = [];
  let courante = '';
  for (const mot of String(texte).split(' ')) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (tient(essai)) {
      courante = essai;
      continue;
    }
    if (courante) lignes.push(courante);
    courante = '';
    let reste = mot;
    while (!tient(reste)) {
      let n = reste.length - 1;
      while (n > 1 && !tient(reste.slice(0, n))) n -= 1;
      lignes.push(reste.slice(0, n));
      reste = reste.slice(n);
    }
    courante = reste;
  }
  lignes.push(courante);
  return lignes;
}

// Mise en page de la fiche : pages de textes placés { x, y (ligne de base, depuis le bas), texte, gras, taille, role,
// rangee } et traits par page. Rôles : titre, rappel, mur, date, sous-titre, libelle, valeur, texte, pied. Une ligne du
// tableau ne se coupe jamais entre deux pages ; un titre de mur (et un sous-titre) part avec la ligne qui le suit.
const CORPS = 10;
const INTERLIGNE = 12.5;
export function mettreEnPage(fiche) {
  const { largeur, hauteur, marge } = A4;
  const droite = largeur - marge;
  const colonne = (droite - marge) * 0.36;
  const xValeur = marge + colonne + 10;
  const haut = hauteur - marge;
  const bas = marge + 16;
  const pages = [];
  const traits = [];
  let page;
  let y;
  const nouvellePage = () => {
    page = [];
    pages.push(page);
    traits.push([]);
    y = haut;
  };
  nouvellePage();
  const texte = (t, x, ligne, options) => page.push({ x, y: ligne, texte: t, gras: false, taille: CORPS, ...options });
  const trait = (x1, y1, x2, y2, epaisseur, gris) => traits.at(-1).push({ x1, y1, x2, y2, epaisseur, gris });

  // Une ligne du tableau : ses lignes de texte et sa hauteur.
  const preparerLigne = (l) => {
    if (l.titre) return { sousTitre: couperTexte(l.titre, droite - marge, { gras: true }), hauteur: 11 + INTERLIGNE };
    const plein = !l.libelle;
    const gauche = plein ? [] : couperTexte(l.libelle, colonne, { gras: true });
    const valeur = couperTexte(l.valeur ?? '', plein ? droite - marge : droite - xValeur);
    return { gauche, valeur, plein, hauteur: 5 + Math.max(gauche.length, valeur.length) * INTERLIGNE };
  };
  const placerLigne = (p, rangee) => {
    if (p.sousTitre) {
      p.sousTitre.forEach((t, i) => texte(t, marge, y - 8 - 9 - i * INTERLIGNE, { gras: true, role: 'sous-titre', rangee }));
      y -= p.hauteur;
      return;
    }
    trait(marge, y, droite, y, 0.4, 0.6);
    p.gauche.forEach((t, i) => texte(t, marge, y - 11 - i * INTERLIGNE, { gras: true, role: 'libelle', rangee }));
    p.valeur.forEach((t, i) => texte(t, p.plein ? marge : xValeur, y - 11 - i * INTERLIGNE, { role: 'valeur', rangee }));
    y -= p.hauteur;
  };
  // Lignes d'un tableau, chacune sur une seule page ; `avant` : hauteur qui doit rester avec la première (titre de mur).
  const tableau = (lignes, prefixe, avant = null) => {
    const prepa = lignes.map(preparerLigne);
    prepa.forEach((p, j) => {
      // Un sous-titre part avec la ligne qui le suit.
      const suite = p.sousTitre && prepa[j + 1] ? prepa[j + 1].hauteur : 0;
      if (j === 0 && avant) {
        if (y - avant.hauteur - p.hauteur - suite < bas) nouvellePage();
        avant.placer();
      } else if (y - p.hauteur - suite < bas) nouvellePage();
      placerLigne(p, `${prefixe}${j}`);
    });
    if (!lignes.length && avant) {
      if (y - avant.hauteur < bas) nouvellePage();
      avant.placer();
    }
  };
  // Titre de mur (13 pt, filet dessous) et date des textes, placés avec la première ligne qui suit.
  const titreMur = (titre, date) => ({
    hauteur: 14 + 21 + (date ? 13 : 0),
    placer() {
      if (y !== haut) y -= 14;
      texte(titre, marge, y - 13, { gras: true, taille: 13, role: 'mur' });
      trait(marge, y - 17, droite, y - 17, 1.2, 0);
      y -= 21;
      if (date) {
        texte(`Textes du ${date}`, marge, y - 9, { taille: 9, role: 'date' });
        y -= 13;
      }
    },
  });

  texte(fiche.titre, marge, y - 16, { gras: true, taille: 16, role: 'titre' });
  y -= 24;
  couperTexte(fiche.rappel, droite - marge).forEach((t) => {
    texte(t, marge, y - 10, { role: 'rappel' });
    y -= INTERLIGNE;
  });
  y -= 6;
  tableau(fiche.entete.map(([libelle, valeur]) => ({ libelle, valeur })), 'e');
  fiche.blocs.forEach((b, i) => {
    if (b.manque) tableau([{ libelle: '', valeur: b.manque }], `b${i}-m`, titreMur(b.titre, null));
    else tableau(b.lignes, `b${i}-`, titreMur(b.titre, b.date));
  });
  if (fiche.fin) tableau(fiche.fin.lignes, 'f-', titreMur(fiche.fin.titre, null));

  const presta = fiche.entete.find(([libelle]) => libelle === 'Presta')?.[1] ?? '';
  pages.forEach((p, i) => p.push({ x: marge, y: marge, texte: `${fiche.titre} · ${presta} · page ${i + 1} sur ${pages.length}`, gras: false, taille: 8, role: 'pied' }));
  return { pages, traits };
}

const nombrePdf = (n) => String(Math.round(n * 100) / 100);
// Chaîne PDF entre parenthèses : WinAnsi, \ ( ) échappés, octets hors ASCII en octal.
function chainePdf(texte) {
  let r = '';
  for (const c of versWinAnsi(texte)) {
    const code = c.charCodeAt(0);
    if (c === '\\' || c === '(' || c === ')') r += `\\${c}`;
    else if (code < 32 || code > 126) r += `\\${code.toString(8).padStart(3, '0')}`;
    else r += c;
  }
  return `(${r})`;
}

// Le fichier PDF de la fiche (texte ASCII, à mettre tel quel dans un fichier « application/pdf »).
export function pdfFiche(fiche) {
  const { pages, traits } = mettreEnPage(fiche);
  const presta = fiche.entete.find(([libelle]) => libelle === 'Presta')?.[1] ?? '';
  const objets = [];
  const n = 5 + pages.length * 2;
  objets[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objets[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objets[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objets[5] = `<< /Title ${chainePdf(`${fiche.titre}, ${presta}`)} /Producer (Appli mur LED) >>`;
  pages.forEach((p, i) => {
    const flux = [
      ...traits[i].map((t) => `${nombrePdf(t.gris)} G ${nombrePdf(t.epaisseur)} w ${nombrePdf(t.x1)} ${nombrePdf(t.y1)} m ${nombrePdf(t.x2)} ${nombrePdf(t.y2)} l S`),
      ...p.map((x) => `BT /${x.gras ? 'F2' : 'F1'} ${nombrePdf(x.taille)} Tf ${nombrePdf(x.x)} ${nombrePdf(x.y)} Td ${chainePdf(x.texte)} Tj ET`),
    ].join('\n');
    objets[6 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largeur} ${A4.hauteur}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`;
    objets[7 + 2 * i] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  });
  let sortie = '%PDF-1.4\n';
  const decalages = [];
  for (let k = 1; k <= n; k += 1) {
    decalages[k] = sortie.length;
    sortie += `${k} 0 obj\n${objets[k]}\nendobj\n`;
  }
  const xref = sortie.length;
  sortie += `xref\n0 ${n + 1}\n0000000000 65535 f \n${decalages.slice(1).map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('')}`;
  sortie += `trailer\n<< /Size ${n + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return sortie;
}
