// Calculs du mur LED, forme réelle (étape 9c) : courbure, plis, pose libre, dalles tournées hors axe.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie } from './commun.js';
import { ficheZone, demiZone } from './morceaux.js';

// ---------------------------------------------------------------------------
// Forme réelle (étape 9c) : courbure d'une zone, pli sur le bord d'une autre
// zone, pose libre dans la salle. La pixel map, les ports et les lignes ne changent pas (vue développée de la 9b).
// Repère : X vers la droite, Y vers le haut, Z vers le public, en mm ; origine au coin bas gauche de la face de la
// première zone, X le long de sa corde. Lacet autour de Y (positif : la face tourne vers la droite), tangage autour de X
// (positif : la face penche vers le bas), roulis autour de Z ; orientation = lacet · tangage · roulis.
// ---------------------------------------------------------------------------

const SENS_COURBURE = ['concave', 'convexe'];

// Rotation d'une zone dans son plan (9c4) : hors axe quand l'angle n'est pas un multiple de 90°.
export const horsAxe = (z) => Number.isFinite(z.roulisDeg) && z.roulisDeg % 90 !== 0;
export function verifierRoulis(zones, noms) {
  zones.forEach((z, i) => {
    if (z.roulisDeg === undefined || z.roulisDeg === null) return;
    const nom = noms[i];
    if (!Number.isFinite(z.roulisDeg) || z.roulisDeg < 0 || z.roulisDeg >= 360) throw new ErreurSaisie(`${nom} : la rotation dans son plan est entre 0 et 359°.`);
    if (z.roulisDeg % 90 === 0 && z.roulisDeg !== 0) {
      throw new ErreurSaisie(`${nom} : quart de tour : échange colonnes et rangées, ou tourne la dalle si sa fiche le permet (rotation hors axe seulement ici).`);
    }
    if (horsAxe(z) && z.courbure) throw new ErreurSaisie(`${nom} : zone courbe : pas de rotation dans son plan.`);
  });
}
// Zone tournée de `deg` (sens inverse des aiguilles d'une montre vu du public) autour de son coin haut gauche, puis recalée
// sur son rectangle englobant : taille de ce rectangle (px arrondis au-dessus, mm) et décalage du coin haut gauche de la
// zone non tournée dans ce rectangle. Coordonnées vers le bas (pixels, vue développée en mm).
export function rotationZone(deg, d) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const cadre = (l, h) => {
    const coins = [[0, 0], [l, 0], [0, h], [l, h]].map(([x, y]) => [x * c + y * s, -x * s + y * c]);
    const min = [0, 1].map((k) => Math.min(...coins.map((p) => p[k])));
    const max = [0, 1].map((k) => Math.max(...coins.map((p) => p[k])));
    return { largeur: max[0] - min[0], hauteur: max[1] - min[1], decalage: [-min[0], -min[1]] };
  };
  const px = cadre(d.pxLargeur, d.pxHauteur);
  const mm = cadre(d.largeurMm, d.hauteurMm);
  return {
    deg, brut: { pxLargeur: d.pxLargeur, pxHauteur: d.pxHauteur, largeurMm: d.largeurMm, hauteurMm: d.hauteurMm },
    pxLargeur: Math.ceil(px.largeur - 1e-6), pxHauteur: Math.ceil(px.hauteur - 1e-6), largeurMm: mm.largeur, hauteurMm: mm.hauteur,
    decalagePx: px.decalage, decalageMm: mm.decalage,
  };
}
// Point (x, y vers le bas) d'une zone non tournée, à sa place dans le rectangle englobant de la zone tournée.
export const tournerDansZone = (r, x, y, enMm) => {
  const c = Math.cos(rad(r.deg));
  const s = Math.sin(rad(r.deg));
  const [dx, dy] = enMm ? r.decalageMm : r.decalagePx;
  return [x * c + y * s + dx, -x * s + y * c + dy];
};
const TYPES_POSE = ['prolongement', 'pliee', 'libre'];
const COURBURE_MAX_DEG = 45;
export const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI + 0;
const nombreFini = (x) => typeof x === 'number' && Number.isFinite(x);

// Limites de courbure d'une fiche (Z28), lues dans son texte : « concave 10° », « concave 15° à convexe 10° », « ±5° »,
// « −5° à +10° » (convexe 5°, concave 10° : « + » concave chez Absen et Unilumin). null sans courbure ; concave ou
// convexe à null si le texte ne se lit pas.
export function limitesCourbure(fiche) {
  const texte = fiche?.courbure;
  if (typeof texte !== 'string' || !texte.trim()) return null;
  const t = texte.replace(/−/g, '-').replace(/,/g, '.');
  const nombre = (re) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };
  let concaveDeg = nombre(/concave\s*(\d+(?:\.\d+)?)\s*°/i);
  let convexeDeg = nombre(/convexe\s*(\d+(?:\.\d+)?)\s*°/i);
  const pm = nombre(/±\s*(\d+(?:\.\d+)?)\s*°/);
  if (pm !== null) {
    concaveDeg = pm;
    convexeDeg = pm;
  } else if (concaveDeg === null && convexeDeg === null) {
    const negatif = nombre(/-\s*(\d+(?:\.\d+)?)\s*°/);
    const positif = nombre(/\+\s*(\d+(?:\.\d+)?)\s*°/);
    if (negatif !== null || positif !== null) {
      convexeDeg = negatif ?? 0;
      concaveDeg = positif ?? 0;
    }
  } else {
    concaveDeg ??= 0;
    convexeDeg ??= 0;
  }
  return { concaveDeg, convexeDeg, texte, source: fiche.sources?.courbure?.source ?? null };
}

// Source d'une valeur de fiche, avec sa confiance quand elle n'est pas « constructeur ».
function texteSourceValeur(source) {
  if (!source?.court) return 'fiche';
  return /^constructeur$/.test(source.confiance ?? 'constructeur') ? source.court : `${source.court}, ${source.confiance}`;
}

// Matrices 3 × 3 (lignes).
const matrice = (a) => a;
const IDENTITE = matrice([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
const rotY = (d) => {
  const c = Math.cos(rad(d));
  const s = Math.sin(rad(d));
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
};
const rotX = (d) => {
  const c = Math.cos(rad(d));
  const s = Math.sin(rad(d));
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
};
const rotZ = (d) => {
  const c = Math.cos(rad(d));
  const s = Math.sin(rad(d));
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
};
const produit = (a, b) => a.map((ligne) => [0, 1, 2].map((j) => ligne[0] * b[0][j] + ligne[1] * b[1][j] + ligne[2] * b[2][j]));
const appliquer = (m, v) => m.map((ligne) => ligne[0] * v[0] + ligne[1] * v[1] + ligne[2] * v[2]);
const ajouter = (a, b) => a.map((x, i) => x + b[i]);
// Lacet, tangage, roulis d'une orientation (ordre Y, X, Z) ; tangage de ±90° : roulis à 0.
function angles(m) {
  const sx = Math.max(-1, Math.min(1, -m[1][2]));
  const tangage = deg(Math.asin(sx));
  if (Math.abs(Math.abs(sx) - 1) < 1e-9) return { lacet: deg(Math.atan2(-m[2][0], m[0][0])), tangage, roulis: 0 };
  return { lacet: deg(Math.atan2(m[0][2], m[2][2])), tangage, roulis: deg(Math.atan2(m[1][0], m[1][1])) };
}
const propre = (x) => (Math.abs(x) < 1e-9 ? 0 : x);

// Colonnes d'une zone courbe de n colonnes de largeur w (facettes planes, A1) : début de chaque colonne (a le long de la
// corde, c vers le public) et son lacet dans le repère de la zone ; posée symétrique, la corde le long de a. `debut` et
// `nombre` : colonnes d'une zone qui suit la courbe d'une autre (même polygone, décalé d'un nombre entier de colonnes).
function colonnesCourbe(n, w, phi, s, debut = 0, nombre = n) {
  const beta = (k) => s * ((n - 1) / 2 - k) * phi;
  const pas = (k) => [w * Math.cos(rad(beta(k))), -w * Math.sin(rad(beta(k)))];
  const point = (k) => {
    let a = 0;
    let c = 0;
    for (let i = 0; i < k; i += 1) [a, c] = [a + pas(i)[0], c + pas(i)[1]];
    for (let i = -1; i >= k; i -= 1) [a, c] = [a - pas(i)[0], c - pas(i)[1]];
    return [a, c];
  };
  return Array.from({ length: nombre }, (_, j) => ({ debut: point(debut + j), beta: beta(debut + j) + 0 }));
}

// Grandeurs d'une zone courbe (modèle de disguise) : rayon aux arêtes, corde, profondeur de la corde au point le plus
// loin, angle entre la première et la dernière colonne.
export function grandeursCourbure(n, w, courbure) {
  const phi = courbure.angleDeg;
  const rayonMm = w / (2 * Math.sin(rad(phi) / 2));
  return {
    sens: courbure.sens,
    angleDeg: phi,
    rayonMm,
    cordeMm: 2 * rayonMm * Math.sin((n * rad(phi)) / 2),
    profondeurMm: n % 2 === 0 ? rayonMm * (1 - Math.cos((n * rad(phi)) / 2)) : rayonMm * (Math.cos(rad(phi) / 2) - Math.cos((n * rad(phi)) / 2)),
    angleTotalDeg: (n - 1) * phi,
  };
}

const typePlacementZone = (z) => z.placement?.type ?? 'droite';
const typePose = (z) => z.pose?.type ?? 'prolongement';
// Zone de référence de chaque zone (index), ou null : zone d'avant pour « à droite de », zone nommée au-dessus ou en
// dessous, rien pour une zone libre.
function referencesZones(zones, noms) {
  return zones.map((z, i) => {
    const t = typePlacementZone(z);
    if (t === 'droite') return i > 0 ? i - 1 : null;
    if (t === 'libre') return null;
    const r = noms.indexOf(z.placement?.zone);
    return r >= 0 ? r : null;
  });
}
const memeCourbure = (a, b) => Boolean(a && b) && a.sens === b.sens && Math.abs(a.angleDeg - b.angleDeg) < EPS;
export const texteAngle = (x) => `${nombreCourt(x, 2)}°`;

// Saisie de la forme réelle (§ 4.1) : refus avec la raison. `description` : zones placées dans la vue développée (mm).
export function verifierFormeReelle(zones, description, ficheReelle) {
  if (!zones.some((z) => z.courbure || z.pose || z.roulisDeg)) return;
  const noms = description.map((d) => d.nom);
  const reference = referencesZones(zones, noms);
  const racine = reference.findIndex((r) => r === null);
  zones.forEach((z, i) => {
    const nom = noms[i];
    const fiche = ficheReelle(z);
    const c = z.courbure;
    if (c) {
      if (c.axe && c.axe !== 'horizontal') throw new ErreurSaisie(`${nom} : courbure verticale : pas encore prévue (colonnes courbes seulement).`);
      if (!SENS_COURBURE.includes(c.sens)) throw new ErreurSaisie(`${nom} : courbure concave ou convexe.`);
      if (!nombreFini(c.angleDeg) || c.angleDeg < 0.1 - EPS || c.angleDeg > COURBURE_MAX_DEG + EPS) {
        throw new ErreurSaisie(`${nom} : l'angle de courbure par jonction est entre 0,1 et ${COURBURE_MAX_DEG}°.`);
      }
      const lim = limitesCourbure(fiche);
      if (lim) {
        const max = c.sens === 'concave' ? lim.concaveDeg : lim.convexeDeg;
        const autre = c.sens === 'concave' ? 'convexe' : 'concave';
        if (max !== null && c.angleDeg > max + EPS) {
          throw new ErreurSaisie(max > 0
            ? `${nom} : ${fiche.nom} : ${c.sens} ${texteAngle(max)} au plus (${texteSourceValeur(lim.source)}).`
            : `${nom} : ${fiche.nom} : ${autre} seulement (${texteSourceValeur(lim.source)}).`);
        }
      }
      if (z.colonnes * c.angleDeg > 360 + EPS) {
        throw new ErreurSaisie(`${nom} : ${z.colonnes} colonnes à ${texteAngle(c.angleDeg)} font plus d'un tour : la zone se recouvre.`);
      }
    }
    const p = z.pose;
    const t = typePose(z);
    if (!TYPES_POSE.includes(t)) throw new ErreurSaisie(`${nom} : pose réelle inconnue (dans le prolongement, pliée ou libre).`);
    if (i === racine && t !== 'prolongement') throw new ErreurSaisie(`${nom} : la première zone porte le repère du mur : ni pli ni pose libre pour elle.`);
    if (t === 'libre') {
      if (![p.xMm, p.basMm, p.zMm].every(nombreFini)) throw new ErreurSaisie(`${nom} : X, hauteur du bas et Z sont des nombres de millimètres.`);
      if (!nombreFini(p.lacetDeg) || p.lacetDeg < -180 - EPS || p.lacetDeg > 180 + EPS) throw new ErreurSaisie(`${nom} : le lacet est entre −180 et 180°.`);
      if (!nombreFini(p.tangageDeg) || p.tangageDeg < -90 - EPS || p.tangageDeg > 90 + EPS) throw new ErreurSaisie(`${nom} : le tangage est entre −90 et 90°.`);
      return;
    }
    const r = reference[i];
    const tp = typePlacementZone(z);
    if (t === 'pliee') {
      if (r === null) throw new ErreurSaisie(`${nom} : pas de bord commun avec une autre zone (zone placée librement) : choisis une pose libre.`);
      if (horsAxe(zones[r])) throw new ErreurSaisie(`${nom} : pli impossible sur le bord de ${noms[r]}, zone tournée hors axe : choisis une pose libre.`);
      if (!SENS_COURBURE.includes(p.sens)) throw new ErreurSaisie(`${nom} : pli concave ou convexe.`);
      if (!nombreFini(p.angleDeg) || p.angleDeg < 0.1 - EPS || p.angleDeg > 179.9 + EPS) throw new ErreurSaisie(`${nom} : l'angle du pli est entre 0,1 et 179,9°.`);
    }
    // Pli « à droite de » : il faut un bord commun (les hauteurs des deux zones se recouvrent).
    if (t === 'pliee' && r !== null && tp === 'droite') {
      const a = description[i];
      const b = description[r];
      if (!(Math.min(a.basMm + a.hauteurMm, b.basMm + b.hauteurMm) - Math.max(a.basMm, b.basMm) > EPS)) {
        throw new ErreurSaisie(`${nom} : pas de bord commun avec ${noms[r]} (leurs hauteurs ne se recouvrent pas) : choisis une pose libre.`);
      }
    }
    if (r === null || tp === 'droite') return;
    // Zone courbe pliée sur un bord haut ou bas : son bord bas ou haut n'est pas droit (relecture du 13/10/2026).
    if (t === 'pliee' && z.courbure) throw new ErreurSaisie(`${nom} : zone courbe : pli sur le bord haut ou bas impossible, son bord n'est pas droit.`);
    // Au-dessus ou en dessous d'une autre zone : bord droit, ou même courbure alignée sur ses colonnes.
    const zr = zones[r];
    if (zr.courbure) {
      if (t === 'pliee') throw new ErreurSaisie(`${nom} : pli impossible sur le bord de ${noms[r]}, zone courbe : son bord n'est pas droit.`);
      if (!memeCourbure(z.courbure, zr.courbure)) {
        throw new ErreurSaisie(`${nom} : au-dessus ou en dessous de ${noms[r]}, zone courbe, une zone suit sa courbe : même courbure (${zr.courbure.sens} ${texteAngle(zr.courbure.angleDeg)}).`);
      }
      const w = ficheReelle(zr).largeurMm;
      const decalage = description[i].xMm - description[r].xMm;
      if (Math.abs(ficheReelle(z).largeurMm - w) > EPS || Math.abs(decalage / w - Math.round(decalage / w)) > 1e-6) {
        throw new ErreurSaisie(`${nom} : pour suivre la courbe de ${noms[r]}, mêmes largeurs de colonne et zone alignée sur une colonne de ${noms[r]}.`);
      }
    } else if (z.courbure && t === 'prolongement') {
      throw new ErreurSaisie(`${nom} : zone courbe au-dessus ou en dessous de ${noms[r]}, à plat : la zone de référence doit avoir la même courbure.`);
    }
  });
}

// Forme réelle chargée ? (un réglage de la 9c dans une zone)
export const aFormeReelle = (m) => (m.saisie?.zones ?? []).some((z) => z.courbure || z.pose || z.roulisDeg);

// Cases d'une zone, de haut en bas : colonne, rangée, type, haut (mm depuis le haut de la zone), hauteur, présence.
function casesZoneReelle(m, d, fiche, demi) {
  if (d.forme) return d.forme.colonnes.flatMap((c) => c.cases.map((x) => ({ colonne: c.colonne, rangee: x.rangee, type: x.type, yMm: x.yMm, hMm: x.hMm, presente: x.presente })));
  const types = m.zones ? Array(d.lignes).fill('entiere') : m.rangees;
  const hauteur = (t) => (t === 'demi' ? demi.hauteurMm : fiche.hauteurMm);
  const cases = [];
  for (let c = 1; c <= d.colonnes; c += 1) {
    let y = 0;
    types.forEach((t, r) => {
      cases.push({ colonne: c, rangee: r + 1, type: t, yMm: y, hMm: hauteur(t), presente: true });
      y += hauteur(t);
    });
  }
  return cases;
}

// Forme réelle du mur (Z29, Z31 à Z34) : chaque dalle présente avec le centre de sa face (mm) et ses angles, les quatre
// coins de sa face, la boîte réelle, le développé, la courbure de chaque zone, les plis ; alertes et notes.
export function formeReelle(m, dalle) {
  const zonesM = m.zones ?? [{ nom: 'MUR', colonnes: m.colonnes, lignes: m.lignes, xMm: 0, basMm: 0, largeurMm: m.largeurMm, hauteurMm: m.hauteurMm }];
  const saisies = m.saisie?.zones ?? zonesM.map(() => ({}));
  const noms = zonesM.map((z) => z.nom);
  const prefixe = zonesM.length > 1;
  const fiches = zonesM.map((z) => (m.zones ? ficheZone(m, z, dalle) : dalle));
  const demis = zonesM.map((z) => (m.zones ? demiZone(m, z) : m.demi));
  // Fiche réelle (pas de pixels interpolés) : pour la courbure et la profondeur, les champs viennent de la même fiche.
  const reference = referencesZones(saisies.map((s, i) => ({ ...s, nom: noms[i] })), noms);
  const racine = Math.max(0, reference.findIndex((r) => r === null));
  const alertes = [];
  const notes = [];
  const plis = [];
  const reperes = new Array(zonesM.length).fill(null);
  const colonnes = new Array(zonesM.length).fill(null);
  const sansBordCommun = [];

  // Zone qui suit la courbe de sa zone de référence (au-dessus ou en dessous, même courbure) ; pile jusqu'à sa base.
  const suitCourbe = (i) => {
    const s = saisies[i] ?? {};
    const r = reference[i];
    return r !== null && Boolean(s.courbure) && typePlacementZone(s) !== 'droite' && typePose(s) === 'prolongement' && Boolean(saisies[r]?.courbure);
  };
  const pileCourbe = (i) => {
    if (!suitCourbe(i)) return { racine: i, k0: 0 };
    const r = reference[i];
    const bas = pileCourbe(r);
    return { racine: bas.racine, k0: bas.k0 + Math.round((zonesM[i].xMm - zonesM[r].xMm) / fiches[i].largeurMm) };
  };
  // Colonnes de chaque zone dans son repère : courbe propre, courbe de la zone de référence, ou à plat.
  const colonnesDe = (i) => {
    if (colonnes[i]) return colonnes[i];
    const d = zonesM[i];
    const s = saisies[i] ?? {};
    const w = fiches[i].largeurMm;
    const r = reference[i];
    if (suitCourbe(i)) {
      // Zones courbes empilées : le polygone de la zone la plus basse de la pile, décalé des colonnes cumulées.
      const { racine: z0, k0 } = pileCourbe(i);
      colonnes[i] = colonnesCourbe(zonesM[z0].colonnes, w, s.courbure.angleDeg, s.courbure.sens === 'concave' ? 1 : -1, k0, d.colonnes);
    } else if (s.courbure) {
      colonnes[i] = colonnesCourbe(d.colonnes, w, s.courbure.angleDeg, s.courbure.sens === 'concave' ? 1 : -1);
    } else {
      colonnes[i] = colonnesCourbe(d.colonnes, w, 0, 1);
    }
    return colonnes[i];
  };

  // Repère de chaque zone : origine (coin bas gauche de sa face, au début de sa première colonne) et orientation.
  const repere = (i, chemin = []) => {
    if (reperes[i]) return reperes[i];
    if (chemin.includes(i)) throw new ErreurSaisie('Placements en boucle.');
    const d = zonesM[i];
    const s = saisies[i] ?? {};
    const p = s.pose ?? {};
    const r = reference[i];
    let resultat;
    if (typePose(s) === 'libre') {
      resultat = { o: [p.xMm, p.basMm, p.zMm], m: produit(rotY(p.lacetDeg), rotX(p.tangageDeg)) };
    } else if (r === null) {
      if (i === racine) resultat = { o: [0, 0, 0], m: IDENTITE };
      else {
        const z0 = zonesM[racine];
        const r0 = repere(racine, [...chemin, i]);
        resultat = { o: ajouter(r0.o, appliquer(r0.m, [d.xMm - z0.xMm, d.basMm - z0.basMm, 0])), m: r0.m };
        sansBordCommun.push(d.nom);
      }
    } else {
      const zr = zonesM[r];
      const rr = repere(r, [...chemin, i]);
      const pliee = typePose(s) === 'pliee';
      const signe = p.sens === 'concave' ? 1 : -1;
      const tp = typePlacementZone(s);
      const bordCommun = Math.min(d.basMm + d.hauteurMm, zr.basMm + zr.hauteurMm) - Math.max(d.basMm, zr.basMm) > EPS;
      if (tp === 'droite' && !bordCommun && !pliee && i !== racine) {
        // Pas de bord commun avec la zone d'avant (hauteurs disjointes) : sa place de la vue à plat, par rapport à la
        // première zone (relecture du 13/10/2026).
        const z0 = zonesM[racine];
        const r0 = repere(racine, [...chemin, i]);
        resultat = { o: ajouter(r0.o, appliquer(r0.m, [d.xMm - z0.xMm, d.basMm - z0.basMm, 0])), m: r0.m };
        sansBordCommun.push(d.nom);
      } else if (tp === 'droite') {
        // Bord droit de la zone de référence : bout de sa dernière colonne, à la hauteur du bas de la zone.
        // Zone tournée hors axe (9c4) : le bord droit de son rectangle englobant.
        const derniere = zr.roulis ? { debut: [zr.largeurMm, 0], beta: 0 } : colonnesDe(r).at(-1);
        const wr = zr.roulis ? 0 : fiches[r].largeurMm;
        const bout = [derniere.debut[0] + wr * Math.cos(rad(derniere.beta)), derniere.debut[1] - wr * Math.sin(rad(derniere.beta))];
        const sortie = derniere.beta + (pliee ? -signe * p.angleDeg : 0);
        const charniere = ajouter(rr.o, appliquer(rr.m, [bout[0], d.basMm - zr.basMm, bout[1]]));
        const direction = produit(rr.m, rotY(sortie));
        const o = ajouter(charniere, appliquer(direction, [s.ecartMm ?? 0, 0, 0]));
        resultat = { o, m: produit(direction, rotY(-colonnesDe(i)[0].beta)) };
        if (pliee) plis.push({ zones: [noms[r], noms[i]], bord: 'droit', sens: p.sens, angleDeg: p.angleDeg });
      } else if (saisies[r]?.courbure && !pliee) {
        // Zone qui suit la courbe de sa référence : même repère, décalée en hauteur.
        resultat = { o: ajouter(rr.o, appliquer(rr.m, [0, d.basMm - zr.basMm, 0])), m: rr.m };
      } else {
        const dessus = tp === 'dessus';
        const ecart = s.placement?.ecartMm ?? 0;
        const tangage = pliee ? (dessus ? signe : -signe) * p.angleDeg : 0;
        const mz = produit(rr.m, rotX(tangage));
        const charniere = ajouter(rr.o, appliquer(rr.m, [d.xMm - zr.xMm, dessus ? zr.hauteurMm : 0, 0]));
        const o = dessus ? ajouter(charniere, appliquer(mz, [0, ecart, 0])) : ajouter(charniere, appliquer(mz, [0, -(ecart + d.hauteurMm), 0]));
        resultat = { o, m: mz };
        if (pliee) plis.push({ zones: [noms[r], noms[i]], bord: dessus ? 'haut' : 'bas', sens: p.sens, angleDeg: p.angleDeg });
      }
    }
    reperes[i] = resultat;
    return resultat;
  };

  const dalles = [];
  const coins = [];
  const zones = zonesM.map((d, i) => {
    const s = saisies[i] ?? {};
    const rep = repere(i);
    const cols = colonnesDe(i);
    const w = fiches[i].largeurMm;
    // Zone tournée hors axe (9c4) : la zone non tournée (sa hauteur brute), tournée autour de son coin haut gauche, puis
    // recalée dans son rectangle englobant (repère de la zone : u vers la droite, v vers le haut).
    const r = d.roulis;
    const hauteurZone = r ? r.brut.hauteurMm : d.hauteurMm;
    const plan = (u, v) => {
      if (!r) return [u, v];
      const [x, y] = tournerDansZone(r, u, hauteurZone - v, true);
      return [x, d.hauteurMm - y];
    };
    for (const x of casesZoneReelle(m, d, fiches[i], demis[i])) {
      if (!x.presente) continue;
      const col = cols[x.colonne - 1];
      const v0 = hauteurZone - x.yMm - x.hMm;
      const local = (u, v) => {
        if (r) {
          const [U, V] = plan(col.debut[0] + u, v);
          return [U, V, 0];
        }
        return [col.debut[0] + u * Math.cos(rad(col.beta)), v, col.debut[1] - u * Math.sin(rad(col.beta))];
      };
      const monde = (u, v) => ajouter(rep.o, appliquer(rep.m, local(u, v))).map(propre);
      const a = angles(produit(rep.m, produit(rotY(col.beta), rotZ(r ? r.deg : 0))));
      const faces = [monde(0, v0), monde(w, v0), monde(w, v0 + x.hMm), monde(0, v0 + x.hMm)];
      coins.push(...faces);
      dalles.push({
        id: `${prefixe ? `${d.nom} · ` : ''}C${x.colonne} R${x.rangee}`, zone: d.nom, colonne: x.colonne, rangee: x.rangee, type: x.type,
        fiche: x.type === 'demi' ? demis[i] : fiches[i], largeurMm: w, hauteurMm: x.hMm,
        centreMm: monde(w / 2, v0 + x.hMm / 2), lacetDeg: propre(a.lacet), tangageDeg: propre(a.tangage), roulisDeg: propre(a.roulis), coinsMm: faces,
      });
    }
    const a = angles(rep.m);
    const courbure = s.courbure ? grandeursCourbure(d.colonnes, w, s.courbure) : null;
    if (s.courbure) {
      const lim = limitesCourbure(fiches[i]);
      if (!lim) alertes.push(`${d.nom} : courbure non donnée par la fiche ${fiches[i].nom} : vérifie les verrous avec le loueur.`);
      notes.push(`${d.nom} : verrous réglables par crans selon la dalle : vérifie que ${texteAngle(s.courbure.angleDeg)} existe sur les verrous (Formation, transcription 3).`);
    }
    return { nom: d.nom, courbure, lacetDeg: propre(a.lacet), tangageDeg: propre(a.tangage), pose: typePose(s) };
  });

  // Plis (Z32 à Z34) : verrous des deux dalles, caissons au pli convexe, couleur de deux dalles différentes.
  for (const pli of plis) {
    const [ir, id] = pli.zones.map((n) => noms.indexOf(n));
    const deux = [fiches[ir], fiches[id]].filter((f, k, t) => t.findIndex((g) => g.id === f.id) === k);
    const tete = `${pli.zones[0]} et ${pli.zones[1]} : pli de ${texteAngle(pli.angleDeg)} ${pli.sens}`;
    const inconnues = deux.filter((f) => !limitesCourbure(f));
    const depassees = deux.filter((f) => {
      const lim = limitesCourbure(f);
      const max = lim && (pli.sens === 'concave' ? lim.concaveDeg : lim.convexeDeg);
      return lim && max !== null && pli.angleDeg > max + EPS;
    });
    if (inconnues.length) {
      alertes.push(`${tete} ; courbure non donnée par la fiche ${inconnues.map((f) => f.nom).join(' ni ')} : à faire tenir par une structure ou une pièce d'angle, vérifie avec le loueur.`);
    }
    if (depassees.length) {
      const limites = depassees.map((f) => {
        const lim = limitesCourbure(f);
        const max = pli.sens === 'concave' ? lim.concaveDeg : lim.convexeDeg;
        return `${f.nom} : ${max > 0 ? `${pli.sens} ${texteAngle(max)} au plus` : `${pli.sens === 'concave' ? 'convexe' : 'concave'} seulement`}, ${texteSourceValeur(lim.source)}`;
      });
      alertes.push(`${tete}, au-delà des verrous (${limites.join(' ; ')}) : structure propre, ou pièces d'angle de la gamme `
        + '(manuel ROE V1.8, § 9 : dalles d\'angle à 90° des BO2, BO3, BP3).');
    }
    if (pli.sens === 'convexe' && (inconnues.length || deux.some((f) => {
      const lim = limitesCourbure(f);
      return lim && pli.angleDeg > (lim.convexeDeg ?? 0) + EPS;
    }))) {
      const profondes = deux.filter((f) => f.profondeurMm > 0).sort((a, b) => b.profondeurMm - a.profondeurMm);
      const p = profondes[0];
      const profondeur = p ? `${nombreCourt(p.profondeurMm, 1)} mm de profondeur, ${texteSourceValeur(p.sources?.profondeurMm?.source)}` : 'profondeur non donnée par la fiche';
      alertes.push(`${pli.zones[0]} et ${pli.zones[1]} : angle convexe de ${texteAngle(pli.angleDeg)}, les caissons (${profondeur}) se touchent à l'arrière : `
        + 'dalle d\'angle, jour au coin ou structure, à voir avec le constructeur.');
    }
    if (fiches[ir].id !== fiches[id].id) {
      notes.push(`${pli.zones[0]} et ${pli.zones[1]} : dalles différentes au pli : écarts de couleur possibles au coin, réglage ou sortie à part (Formation, transcription 2).`);
    }
  }

  // Zone sans bord commun (placée librement dans la vue à plat, ou à droite d'une zone sans hauteur commune) dans un mur
  // courbe ou plié : sa place réelle suit la vue à plat (relecture du 13/10/2026).
  if (saisies.some((z) => z.courbure || z.pose?.type === 'pliee')) {
    for (const nom of sansBordCommun) {
      notes.push(`${nom} : pas de bord commun avec une autre zone : sa place réelle suit la vue à plat, depuis la première zone ; règle-la en pose libre si besoin.`);
    }
  }
  const min = [0, 1, 2].map((k) => Math.min(...coins.map((c) => c[k])));
  const max = [0, 1, 2].map((k) => Math.max(...coins.map((c) => c[k])));
  return {
    dalles,
    zones,
    plis,
    boiteMm: { largeur: max[0] - min[0], hauteur: max[1] - min[1], profondeur: max[2] - min[2], min, max },
    developpeMm: m.largeurMm,
    alertes,
    notes,
  };
}
