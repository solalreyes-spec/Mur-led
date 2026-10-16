// Calculs du mur LED, module 4, data (2/4) : câblage des ports en colonnes, rangées ou au plus juste, cartes de sortie,
// convertisseurs, bloc d'un processeur, câblage d'une zone et d'une forme libre.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { EPS, ErreurSaisie, serpentin } from './commun.js';
import { mur } from './mur.js';
import { plusieursZones, ficheZone, mursDesZones } from './morceaux.js';
import { dallesParPort, chargePx, repartir, modeleCharge, penaliteLargeurChargee } from './capacites.js';

// Ports nécessaires pour un mur, au plus juste et en colonnes entières.
// Une colonne plus haute qu'un port est répartie en segments égaux ; la demi-dalle reste dans le segment de son bord.
// La limite en nombre de dalles (redondance Brompton : 50 par boucle) compte une demi-dalle pour une dalle.
// `pair` (redondance) : nombre pair de colonnes par port quand il en tient au moins deux, pour que la chaîne revienne
// au bord de départ ; sans redondance, le plus de colonnes entières par port.
export function cablage(m, parPort, charge = null, { pair = false } = {}) {
  if (!(parPort >= 1)) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
  const modele = modeleCharge(parPort, charge);
  const tient = (e, d) => e <= modele.maxEntieres && d <= modele.maxDemi(e);
  // COEX 1G : un port qui charge moins de 128 px de large perd de la capacité (rectangle chargé).
  const lmin = charge?.largeurMinPx ?? 0;
  const penalite = (largeur, hauteur) => penaliteLargeurChargee(largeur, hauteur, lmin);
  // Colorlight : la zone d'un port ne dépasse pas 4096 px de large ni de haut.
  const dmax = charge?.dimensionMaxPx ?? Infinity;
  const tientRect = (e, d, largeur, hauteur) => tient(e, d)
    && (dmax === Infinity || (largeur <= dmax && hauteur <= dmax))
    && (!lmin || modele.px(e, d) + penalite(largeur, hauteur) <= charge.capacite + EPS);
  const wDalle = charge?.largeurDallePx ?? 0;
  const hauteurSegment = (n, avecDemi) => (avecDemi ? (n - 1) * charge.pxHauteurDalle + charge.pxHauteurDemi : n * (charge?.pxHauteurDalle ?? 0));
  const entieresParColonne = m.lignes;
  const demiParColonne = m.rangeeDemi ? 1 : 0;
  const parColonne = entieresParColonne + demiParColonne;
  const total = m.dalles.total;

  // Au plus juste : chaque port prend le plus de dalles entières possible, puis des demi-dalles.
  const remplissage = [];
  let resteE = m.colonnes * entieresParColonne;
  let resteD = m.colonnes * demiParColonne;
  while (resteE + resteD > 0) {
    const e = Math.min(modele.maxEntieres, resteE);
    const d = Math.min(modele.maxDemi(e), resteD);
    if (e + d === 0) throw new ErreurSaisie('Une seule demi-dalle dépasse la capacité d\'un port.');
    remplissage.push({ e, d });
    resteE -= e;
    resteD -= d;
  }
  const auPlusJuste = remplissage.length;
  const pxPort = (e, d) => (modele.px ? modele.px(e, d) : null);

  let colonnes;
  if (tientRect(entieresParColonne, demiParColonne, wDalle, m.pxHauteur)) {
    let kmax = 1;
    while (kmax < m.colonnes && tientRect((kmax + 1) * entieresParColonne, (kmax + 1) * demiParColonne, (kmax + 1) * wDalle, m.pxHauteur)) kmax += 1;
    const k = pair && kmax >= 2 ? kmax - (kmax % 2) : kmax;
    colonnes = {
      colonnesParPort: k,
      colonnesParPortMax: kmax,
      segments: [parColonne],
      ports: Math.ceil(m.colonnes / k),
      dallesMaxParPort: k * parColonne,
      pxMaxParPort: modele.px ? pxPort(k * entieresParColonne, k * demiParColonne) + penalite(k * wDalle, m.pxHauteur) : null,
    };
  } else {
    const indexDemi = (s) => (demiParColonne ? (m.positionDemi === 'haut' ? 0 : s - 1) : -1);
    let tailles = null;
    let s = 2;
    for (; s <= parColonne; s += 1) {
      const essai = repartir(parColonne, s);
      if (essai.every((n, i) => (i === indexDemi(s) ? tientRect(n - 1, 1, wDalle, hauteurSegment(n, true)) : tientRect(n, 0, wDalle, hauteurSegment(n, false))))) {
        tailles = essai;
        break;
      }
    }
    if (!tailles) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
    const pxSegments = tailles.map((n, i) => (i === indexDemi(s)
      ? pxPort(n - 1, 1) + penalite(wDalle, hauteurSegment(n, true)) : pxPort(n, 0) + penalite(wDalle, hauteurSegment(n, false))));
    colonnes = {
      colonnesParPort: null,
      segments: tailles,
      ports: m.colonnes * s,
      dallesMaxParPort: tailles[0],
      pxMaxParPort: modele.px ? Math.max(...pxSegments) : null,
    };
  }

  const dernier = remplissage[remplissage.length - 1];
  return {
    dallesParPort: parPort,
    auPlusJuste,
    dallesMaxParPortAuPlusJuste: Math.max(...remplissage.map((p) => p.e + p.d)),
    pxMaxParPortAuPlusJuste: modele.px ? Math.max(...remplissage.map((p) => modele.px(p.e, p.d))) : null,
    colonnes,
    redondance: { auPlusJuste: 2 * auPlusJuste, colonnes: 2 * colonnes.ports },
    // Alerte de seuil : dalles du dernier port, à retirer pour l'économiser (au plus juste).
    seuil: { dallesEnMoins: auPlusJuste > 1 ? dernier.e + dernier.d : null },
    remplissage,
    total,
  };
}

// Minimum théorique (au plus juste) face au décompte retenu en colonnes entières, avec la raison de l'écart.
// `unite` : 'port' ou 'ligne' ; `pair` : nombre pair de colonnes imposé par la redondance.
export function minimumTheorique(c, minimum, m, unite, { pair = false } = {}) {
  const retenu = c.colonnes.ports;
  const pl = (n) => `${n} ${unite}${n > 1 ? 's' : ''}`;
  const raisons = [];
  const k = c.colonnes.colonnesParPort;
  if (!k) {
    raisons.push(`chaque colonne dépasse un${unite === 'ligne' ? 'e' : ''} ${unite} : elle est coupée en ${c.colonnes.segments.length} segments égaux`);
  } else {
    const kmax = c.colonnes.colonnesParPortMax;
    const sansPair = Math.ceil(m.colonnes / kmax);
    if (pair && k < kmax && retenu > sansPair) {
      raisons.push(`en redondance, ${k} colonnes par ${unite} au lieu de ${kmax} : un nombre pair ramène chaque chaîne au bord de départ `
        + `(${pl(sansPair)} sans cette règle)`);
    }
    if (sansPair > minimum) raisons.push(`une colonne n'est jamais coupée entre deux ${unite}s`);
  }
  return {
    nombre: minimum,
    raisons,
    texte: retenu === minimum ? null
      : `Minimum théorique : ${pl(minimum)} au plus juste, contre ${retenu} en colonnes entières. Écart : ${raisons.join(' ; ')}.`,
  };
}

// Formats de canvas d'un processeur : le canvas de sa fiche (1920 × 1080 natif sur M2, S4 et T1),
// puis ses préréglages (4K DCI des S8 et SX40) et ses formats Low Latency (M2, S4, T1).
export function formatsCanvas(proc) {
  const fiche = { nom: proc.canvasFixe ? proc.nomCanvasNatif ?? null : null, largeurPx: proc.largeurMaxPx, hauteurPx: proc.hauteurMaxPx, fiche: true };
  return [fiche, ...(proc.formatsCanvas ?? [])];
}

// Canvas à régler sur le processeur pour un bloc, ou null si aucun format ne l'accueille.
//   - préréglage ou format fixe (4K DCI, Low Latency, 1920 × 1080 natif) : le canvas est celui du format ;
//   - canvas libre Tessera (S8, SX40) : largeur paire, 720 px au minimum dans chaque dimension ;
//   - sinon (Novastar, COEX, Colorlight) : le canvas prend la taille du bloc.
export function canvasProcesseur(proc, largeurPx, hauteurPx) {
  const format = formatsCanvas(proc).find((f) => largeurPx <= f.largeurPx && hauteurPx <= f.hauteurPx);
  if (!format) return null;
  const resultat = (l, h) => ({ largeurPx: l, hauteurPx: h, format: format.nom, lowLatency: format.lowLatency === true });
  if (!format.fiche || proc.canvasFixe) return resultat(format.largeurPx, format.hauteurPx);
  const libre = proc.canvasLibre;
  if (libre) {
    const largeur = libre.largeurPaire && largeurPx % 2 === 1 ? largeurPx + 1 : largeurPx;
    return resultat(Math.max(largeur, libre.largeurMinPx), Math.max(hauteurPx, libre.hauteurMinPx));
  }
  return resultat(largeurPx, hauteurPx);
}

// Largeur la plus grande qu'accepte le processeur pour une hauteur donnée, et le format correspondant.
export function largeurMaxPour(proc, hauteurPx) {
  const possibles = formatsCanvas(proc).filter((f) => f.hauteurPx >= hauteurPx);
  if (possibles.length === 0) return { largeurPx: proc.largeurMaxPx, format: null };
  const meilleur = possibles.reduce((a, b) => (b.largeurPx > a.largeurPx ? b : a));
  return { largeurPx: meilleur.largeurPx, format: meilleur.nom };
}

// Ports à comparer à la limite du processeur, pour un câblage donné.
//   - Redondance sur SX40 : ports principaux (trunks A et C, 20 au plus), secourus par des XD miroirs (B et D).
//   - Redondance ailleurs : ports doublés, qui occupent les sorties du processeur.
//   - Sans redondance : ports en colonnes entières ; 40 en mode optique sur le MX40 Pro.
export function portsFaceALimite(c, proc, { redondance, modeOptique }) {
  if (redondance && proc.portsRedondance) return { valeur: c.colonnes.ports, limite: proc.portsRedondance, principaux: true };
  const limite = modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports;
  return { valeur: redondance ? c.redondance.colonnes : c.colonnes.ports, limite, principaux: false };
}

// Géométrie de la zone d'un port, pour les processeurs qui la limitent : réduction « largeur chargée » (COEX 1G)
// et largeur ou hauteur maxi d'une zone de port (Colorlight : 4096 px, fiche S20) ; rien pour les autres.
export function chargeGeometrie(proc, dalle, m) {
  if (!proc.largeurChargeeMinPx && !proc.dimensionMaxPortPx) return {};
  return {
    ...(proc.largeurChargeeMinPx ? { largeurMinPx: proc.largeurChargeeMinPx } : {}),
    ...(proc.dimensionMaxPortPx ? { dimensionMaxPx: proc.dimensionMaxPortPx } : {}),
    largeurDallePx: dalle.pxH,
    pxHauteurDalle: dalle.pxV,
    pxHauteurDemi: m.demi?.pxV ?? dalle.pxV,
  };
}

// Bloc du mur confié à un processeur : quelques colonnes et quelques rangées, avec la rangée
// de demi-dalles si elle y tombe.
export function sousMur(m, dalle, colonnes, premiereRangee, nbRangees) {
  const rangees = m.rangees.slice(premiereRangee - 1, premiereRangee - 1 + nbRangees);
  const avecDemi = rangees.includes('demi');
  return mur(dalle, colonnes, rangees.length - (avecDemi ? 1 : 0), {
    demi: m.demi,
    rangeeDemi: avecDemi,
    positionDemi: rangees[0] === 'demi' ? 'haut' : 'bas',
  });
}

// Cartes de sortie pour un nombre de ports : par ports d'une carte (série H), sinon par convertisseurs (MX2000 Pro, MX6000 Pro).
// Cartes de sortie d'un bloc sans zones (MX2000 Pro) : par les ports, et par le plafond d'une carte quand il est connu.
export function cartesPour(proc, ports, px = 0) {
  const carte = proc.carteSortie;
  const parPixels = carte.pixelsMax ? Math.ceil(px / carte.pixelsMax - EPS) : 0;
  if (carte.portsParCarte) return Math.max(Math.ceil(ports / carte.portsParCarte), parPixels);
  return Math.max(Math.ceil(Math.ceil(ports / proc.sortiesParDistributeur) / carte.convertisseursParCarte), parPixels);
}

// Cartes de sortie d'un bloc quand chaque carte a sa zone (série H, X100 Pro, Z8t) : les ports, dans l'ordre du
// câblage en colonnes entières, vont sur une carte tant qu'elle a des ports libres, que ses pixels suffisent et que la
// zone qu'elle charge reste dans sa largeur et sa hauteur maxi ; sinon sur la carte suivante. En redondance sans
// secours dédiés, les secours occupent la moitié des ports d'une carte. Renvoie le nombre de ports principaux de
// chaque carte (les convertisseurs se comptent carte par carte), ou null si un port seul dépasse une carte.
// Ports répartis sur les cartes de sortie, dans l'ordre du câblage : chaque carte prend des ports qui se suivent.
// D'abord le moins de cartes (chaque carte prend autant de ports qu'elle peut) ; puis, quand `sorties` est donné
// (MX2000 Pro, MX6000 Pro : CVT10 de 10 ports), la répartition au même nombre de cartes qui demande le moins de
// convertisseurs, comptés carte par carte (groupes complets d'abord, à égalité les premières cartes les plus pleines).
// `zones` : une zone par port ; `fusion(a, b)` : la zone qui contient a et b ; `tient(z, n)` : n ports de zone z sur une
// carte. Renvoie le nombre de ports de chaque carte, ou null si un port seul ne tient pas sur une carte.
export function repartirSurCartes(zones, fusion, tient, { sorties = null, facteur = 1 } = {}) {
  const cartes = [];
  let zone = null;
  for (const z of zones) {
    const essai = zone && fusion(zone, z);
    if (essai && tient(essai, cartes[cartes.length - 1] + 1)) {
      zone = essai;
      cartes[cartes.length - 1] += 1;
    } else {
      if (!tient(z, 1)) return null;
      zone = z;
      cartes.push(1);
    }
  }
  if (!sorties || cartes.length < 2) return cartes;
  // Plus longue suite de ports qui tient sur une carte à partir de chaque port (les limites ne font que croître).
  const n = zones.length;
  const longueur = zones.map((z, a) => {
    let b = a + 1;
    for (let union = z; b < n; b += 1) {
      const essai = fusion(union, zones[b]);
      if (!tient(essai, b - a + 1)) break;
      union = essai;
    }
    return b - a;
  });
  const k = cartes.length;
  const cout = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const choix = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(null));
  cout[0][n] = 0;
  for (let j = 1; j <= k; j += 1) {
    for (let a = n - 1; a >= 0; a -= 1) {
      for (let b = a + longueur[a]; b > a; b -= 1) {
        const total = Math.ceil((facteur * (b - a)) / sorties) + cout[j - 1][b];
        if (total < cout[j][a]) {
          cout[j][a] = total;
          choix[j][a] = b;
        }
      }
    }
  }
  if (!Number.isFinite(cout[k][0])) return cartes;
  const repartition = [];
  for (let j = k, a = 0; j >= 1; j -= 1) {
    const b = choix[j][a];
    repartition.push(b - a);
    a = b;
  }
  return repartition;
}

// Rectangle (en pixels) chargé par chaque port d'un sous-mur placé en (ox, oy), dans l'ordre du câblage en colonnes
// entières : k colonnes par port, ou chaque segment d'une colonne trop haute.
export function rectanglesPorts(sous, c, dalle, ox = 0, oy = 0) {
  if (sous.forme) return rectanglesPortsForme(sous, c, dalle, ox, oy);
  const hauteurs = sous.rangees.map((t) => (t === 'demi' ? sous.demi.pxV : dalle.pxV));
  const pxRangees = sous.rangees.map((t) => (t === 'demi' ? sous.demi.pxH * sous.demi.pxV : dalle.pxH * dalle.pxV));
  const debut = hauteurs.map((_, r) => hauteurs.slice(0, r).reduce((x, y) => x + y, 0));
  const somme = (t, a, b) => t.slice(a, b + 1).reduce((x, y) => x + y, 0);
  const rectangle = (c0, c1, r0, r1) => ({
    x0: ox + c0 * dalle.pxH, x1: ox + (c1 + 1) * dalle.pxH - 1, y0: oy + debut[r0], y1: oy + debut[r1] + hauteurs[r1] - 1,
    px: (c1 - c0 + 1) * somme(pxRangees, r0, r1),
  });
  const ports = [];
  const k = c.colonnes.colonnesParPort;
  if (k) {
    for (let x = 0; x < sous.colonnes; x += k) ports.push(rectangle(x, Math.min(x + k, sous.colonnes) - 1, 0, hauteurs.length - 1));
  } else {
    for (let x = 0; x < sous.colonnes; x += 1) {
      let r = 0;
      for (const n of c.colonnes.segments) {
        ports.push(rectangle(x, x, r, r + n - 1));
        r += n;
      }
    }
  }
  return ports;
}

// Rectangles des ports d'un morceau de forme libre : colonnes de chaque port, cadrées sur leurs dalles présentes ; une
// colonne coupée en segments donne un rectangle par segment.
// Dalles présentes de chaque port (ou ligne) d'un morceau de forme libre, d'après ses groupes de colonnes ; une colonne
// coupée en segments égaux apparaît une fois par segment.
export function casesParGroupe(sous, groupes) {
  const fois = new Map();
  for (const [a, b] of groupes) if (a === b) fois.set(a, (fois.get(a) ?? 0) + 1);
  const vus = new Map();
  return groupes.map(([a, b]) => {
    let cases = sous.forme.colonnes.slice(a - 1, b).flatMap((col) => col.cases.filter((x) => x.presente).map((x) => ({ ...x, colonne: col.colonne })));
    const n = a === b ? fois.get(a) : 1;
    if (n > 1) {
      const rang = vus.get(a) ?? 0;
      vus.set(a, rang + 1);
      const tailles = repartir(cases.length, n);
      const debut = tailles.slice(0, rang).reduce((t, x) => t + x, 0);
      cases = cases.slice(debut, debut + tailles[rang]);
    }
    return cases;
  });
}

// Ports (ou lignes) d'un morceau de forme libre dans le Schéma (9b6) : les colonnes de chaque groupe, en serpentin depuis
// le coin de départ sur les dalles présentes seulement, les groupes pris depuis le côté et le bord de départ. `c0` :
// numéro de la première colonne du morceau dans le mur.
export function groupesForme(sous, c0, groupes, coin) {
  const gauche = coin.endsWith('gauche');
  const haut = coin.startsWith('haut');
  const items = casesParGroupe(sous, groupes).map((cases) => {
    const cols = [...new Set(cases.map((x) => c0 + x.colonne - 1))].sort((a, b) => a - b);
    const rows = [...new Set(cases.map((x) => x.rangee))].sort((a, b) => a - b);
    const dans = new Set(cases.map((x) => `${c0 + x.colonne - 1},${x.rangee}`));
    return { positions: serpentin(cols, rows, 'vertical', coin).filter(([c, r]) => dans.has(`${c},${r}`)), col: cols[0], haut: rows[0], bas: rows[rows.length - 1] };
  }).filter((x) => x.positions.length);
  items.sort((a, b) => (gauche ? a.col - b.col : b.col - a.col) || (haut ? a.haut - b.haut : b.bas - a.bas));
  return items.map((x) => x.positions);
}

function rectanglesPortsForme(sous, c, dalle, ox, oy) {
  const groupes = c.colonnes.groupes;
  const listes = casesParGroupe(sous, groupes);
  return groupes.map(([a, b], n) => {
    const cases = listes[n];
    const fiche = (x) => (x.type === 'demi' ? sous.demi : dalle);
    return {
      x0: ox + (a - 1) * dalle.pxH, x1: ox + b * dalle.pxH - 1,
      y0: oy + Math.min(...cases.map((x) => x.y)), y1: oy + Math.max(...cases.map((x) => x.y + x.h)) - 1,
      px: cases.reduce((t, x) => t + fiche(x).pxH * fiche(x).pxV, 0),
    };
  });
}

// Cartes de sortie à zones : les ports, dans l'ordre, vont sur une carte tant que le rectangle qu'elle charge tient.
export function cartesParRectangles(proc, rectangles, { redondance = false } = {}) {
  const carte = proc.carteSortie;
  const parCarte = redondance && !proc.portsRedondance ? Math.floor(carte.portsParCarte / 2) : carte.portsParCarte;
  // MX2000 Pro : pas de zone par carte, seulement ses ports et son plafond.
  const tient = (z, n) => n <= parCarte && z.px <= (carte.pixelsMax ?? Infinity)
    && z.x1 - z.x0 + 1 <= (carte.largeurMaxPx ?? Infinity) && z.y1 - z.y0 + 1 <= (carte.hauteurMaxPx ?? Infinity);
  const fusion = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), px: a.px + b.px });
  return repartirSurCartes(rectangles, fusion, tient, optionsConvertisseurs(proc, redondance));
}

export function cartesParZones(proc, sous, c, dalle, options = {}) {
  return cartesParRectangles(proc, rectanglesPorts(sous, c, dalle), options);
}

// MX2000 Pro et MX6000 Pro : CVT10 comptés carte par carte, avec la répartition qui en demande le moins.
export function optionsConvertisseurs(proc, redondance) {
  if (!(proc.carteSortie1G || proc.carteSortie5G) || !proc.sortiesParDistributeur) return {};
  return { sorties: proc.sortiesParDistributeur, facteur: redondance && !proc.portsRedondance ? 2 : 1 };
}

export function blocProcesseur(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }) {
  const sous = sousMur(m, dalle, colonnes, premiereRangee, rangees);
  const c = cablage(sous, contexte.parPort, contexte.charge, { pair: contexte.pair });
  const ports = portsFaceALimite(c, proc, contexte);
  const canvas = canvasProcesseur(proc, sous.pxLargeur, sous.pxHauteur);
  const sorties = proc.sortiesParDistributeur;
  // Position du bloc dans le mur, en pixels, de 0 à largeur − 1.
  const xPx = (premiereColonne - 1) * dalle.pxH;
  const yPx = premiereRangee > 1 ? sousMur(m, dalle, 1, 1, premiereRangee - 1).pxHauteur : 0;
  // Série H, X100 Pro, Z8t : cartes comptées par zones, convertisseurs carte par carte.
  const parZones = proc.carteSortie?.largeurMaxPx || proc.carteSortie?.pixelsMax ? {
    colonnes: cartesParZones(proc, sous, c, dalle),
    redondance: cartesParZones(proc, sous, c, dalle, { redondance: true }),
  } : null;
  const zones = parZones && { colonnes: parZones.colonnes?.length ?? Infinity, redondance: parZones.redondance?.length ?? Infinity };
  const convertisseurs = (liste, facteur) => (liste ? liste.reduce((t, n) => t + Math.ceil((facteur * n) / sorties), 0) : Infinity);
  const ok = sous.pxTotal <= proc.pixelsMax
    && canvas !== null
    && ports.valeur <= ports.limite
    && (!proc.dallesMax || sous.dalles.total <= proc.dallesMax)
    && (!zones || (contexte.redondance ? zones.redondance : zones.colonnes) <= proc.emplacementsSortie);
  return {
    colonnes,
    premiereColonne,
    derniereColonne: premiereColonne + colonnes - 1,
    rangees,
    premiereRangee,
    derniereRangee: premiereRangee + rangees - 1,
    format: canvas?.format ?? null,
    canvas,
    x: [xPx, xPx + sous.pxLargeur - 1],
    y: [yPx, yPx + sous.pxHauteur - 1],
    dalles: sous.dalles.total,
    px: sous.pxTotal,
    largeurPx: sous.pxLargeur,
    hauteurPx: sous.pxHauteur,
    ports: { auPlusJuste: c.auPlusJuste, colonnes: c.colonnes.ports, redondance: c.redondance },
    distributeurs: sorties ? {
      colonnes: parZones ? convertisseurs(parZones.colonnes, 1) : Math.ceil(c.colonnes.ports / sorties),
      auPlusJuste: Math.ceil(c.auPlusJuste / sorties),
      // Secours dédiés : convertisseurs miroirs ; sinon les ports doublés de chaque carte.
      redondance: parZones
        ? (proc.portsRedondance ? 2 * convertisseurs(parZones.redondance, 1) : convertisseurs(parZones.redondance, 2))
        : 2 * Math.ceil(c.colonnes.ports / sorties),
    } : null,
    // MX2000 Pro, MX6000 Pro : cartes de sortie qui portent ces convertisseurs ; série H : ports par carte.
    cartesSortie: zones ?? (proc.carteSortie ? {
      colonnes: cartesPour(proc, c.colonnes.ports, sous.pxTotal),
      redondance: cartesPour(proc, proc.portsRedondance ? c.colonnes.ports : 2 * c.colonnes.ports, sous.pxTotal),
    } : null),
    chargeMax: chargePx(c.colonnes.pxMaxParPort, contexte.capacite),
    ok,
  };
}

// Mur en plusieurs zones (étape 9a) ---------------------------------------------------------------------------------

// Colonnes par port (ou par ligne) d'un ensemble de zones : la plus petite de celles que la largeur de leur zone ne
// borne pas (une zone de 3 colonnes en prend au plus 3 par port) ; si toutes sont bornées, la plus grande.
export function colonnesParPortZones(valeurs, colonnes) {
  if (valeurs.some((k) => k === null)) return null;
  const libres = valeurs.filter((k, i) => k < colonnes[i]);
  return libres.length ? Math.min(...libres) : Math.max(...valeurs);
}

// Câblage de plusieurs morceaux de zones : chacun câblé à part (un port ne passe jamais d'une zone à l'autre), puis
// les décomptes additionnés. `parties` : le câblage de chaque morceau, dans l'ordre.
export function cablageZones(murs, parPort, charge, options) {
  // Mur mixte : chaque morceau avec la charge de sa propre dalle.
  const pour = (s) => (options?.chargeDe && s.fiche ? options.chargeDe(s.fiche, s.demiFiche) : { parPort, charge });
  const parties = murs.map((s) => {
    const p = pour(s);
    return s.forme ? cablageForme(s, p.parPort, p.charge, options) : cablage(s, p.parPort, p.charge, options);
  });
  const variable = parties.some((c) => c.colonnes.variable);
  const somme = (f) => parties.reduce((t, c) => t + f(c), 0);
  const maxi = (f) => {
    const valeurs = parties.map(f).filter((x) => x !== null && x !== undefined);
    return valeurs.length ? Math.max(...valeurs) : null;
  };
  const colonnes = murs.map((s) => s.colonnes);
  const plusHaute = murs.reduce((a, s, i) => (s.pxHauteur > murs[a].pxHauteur ? i : a), 0);
  const ports = somme((c) => c.colonnes.ports);
  const auPlusJuste = somme((c) => c.auPlusJuste);
  return {
    dallesParPort: parPort,
    auPlusJuste,
    dallesMaxParPortAuPlusJuste: maxi((c) => c.dallesMaxParPortAuPlusJuste),
    pxMaxParPortAuPlusJuste: maxi((c) => c.pxMaxParPortAuPlusJuste),
    colonnes: {
      colonnesParPort: colonnesParPortZones(parties.map((c) => c.colonnes.colonnesParPort), colonnes),
      colonnesParPortMax: colonnesParPortZones(parties.map((c) => c.colonnes.colonnesParPortMax ?? null), colonnes),
      segments: parties[plusHaute].colonnes.segments,
      ports,
      dallesMaxParPort: maxi((c) => c.colonnes.dallesMaxParPort),
      pxMaxParPort: maxi((c) => c.colonnes.pxMaxParPort),
      ...(variable ? { variable: true } : {}),
    },
    redondance: { auPlusJuste: 2 * auPlusJuste, colonnes: 2 * ports },
    seuil: { dallesEnMoins: null },
    remplissage: parties.flatMap((c) => c.remplissage),
    total: somme((c) => c.total),
    parties,
  };
}

// Câblage d'un morceau de zone de forme libre (9b, Z21) : colonnes entières de gauche à droite, chacune avec ses dalles
// présentes ; un port prend le plus de colonnes qui tiennent (le remplissage glouton donne le moins de ports). Charge :
// les dalles du port, ou pour NovaLCT (`charge.rectangle`) le rectangle qui englobe ses dalles, vides et décalages
// compris. Une colonne qui ne tient pas seule : segments égaux de ses dalles présentes. Redondance : nombre pair de
// colonnes par port. Au plus juste théorique : comme un mur d'une pièce, sur le total des dalles.
export function cablageForme(s, parPort, charge, { pair = false, depuisDroite = false } = {}) {
  // Départ à droite (Schéma) : colonnes groupées depuis la droite, le port incomplet au bout, comme un rectangle de la 9a.
  if (depuisDroite) {
    const miroir = { ...s, forme: { ...s.forme, colonnes: [...s.forme.colonnes].reverse() } };
    const r = cablageForme(miroir, parPort, charge, { pair });
    return { ...r, colonnes: { ...r.colonnes, groupes: r.colonnes.groupes.map(([a, b]) => [s.colonnes - b + 1, s.colonnes - a + 1]) } };
  }
  const colonnes = s.forme.colonnes.map((c) => c.cases.filter((x) => x.presente));
  const largeurColonne = s.pxLargeur / s.colonnes;
  const pxCase = (x) => (charge ? (x.type === 'demi' ? charge.pxParDemi : charge.pxParDalle) : 1);
  const capacite = charge ? charge.capacite : parPort;
  const plafond = charge?.plafond ?? Infinity;
  const lmin = charge?.largeurMinPx ?? 0;
  const dmax = charge?.dimensionMaxPx ?? Infinity;
  // Charge d'un ensemble de cases sur `n` colonnes, et s'il tient dans un port.
  const charger = (cases, n) => {
    const largeur = n * largeurColonne;
    const hauteur = cases.length ? Math.max(...cases.map((x) => x.y + x.h)) - Math.min(...cases.map((x) => x.y)) : 0;
    const px = charge?.rectangle ? largeur * hauteur : cases.reduce((t, x) => t + pxCase(x), 0);
    return { px: px + penaliteLargeurChargee(largeur, hauteur, lmin), dalles: cases.length, largeur, hauteur };
  };
  const tient = (c) => c.px <= capacite + EPS && c.dalles <= plafond && c.largeur <= dmax && c.hauteur <= dmax;
  const groupes = [];
  const segmentsColonnes = [];
  const segment = [];
  const chargesPorts = [];
  let i = 0;
  while (i < colonnes.length) {
    if (!tient(charger(colonnes[i], 1))) {
      const cases = colonnes[i];
      let decoupe = null;
      for (let n = 2; n <= cases.length && !decoupe; n += 1) {
        let debut = 0;
        const morceaux = repartir(cases.length, n).map((t) => {
          const m = cases.slice(debut, debut + t);
          debut += t;
          return m;
        });
        if (morceaux.every((m) => tient(charger(m, 1)))) decoupe = morceaux;
      }
      if (!decoupe) throw new ErreurSaisie('Une seule dalle dépasse la capacité d\'un port.');
      for (const m of decoupe) {
        groupes.push([i + 1, i + 1]);
        segment.push(true);
        chargesPorts.push(charger(m, 1));
      }
      segmentsColonnes.push(decoupe.map((m) => m.length));
      i += 1;
      continue;
    }
    let k = 1;
    while (i + k < colonnes.length && tient(charger(colonnes.slice(i, i + k + 1).flat(), k + 1))) k += 1;
    if (pair && k > 1 && k % 2 === 1) k -= 1;
    groupes.push([i + 1, i + k]);
    segment.push(false);
    chargesPorts.push(charger(colonnes.slice(i, i + k).flat(), k));
    i += k;
  }

  // Au plus juste théorique, sur le total des dalles (comme `cablage`).
  const modele = modeleCharge(parPort, charge);
  const remplissage = [];
  let resteE = s.dalles.entieres;
  let resteD = s.dalles.demi;
  while (resteE + resteD > 0) {
    const e = Math.min(modele.maxEntieres, resteE);
    const d = Math.min(modele.maxDemi(e), resteD);
    if (e + d === 0) throw new ErreurSaisie('Une seule demi-dalle dépasse la capacité d\'un port.');
    remplissage.push({ e, d });
    resteE -= e;
    resteD -= d;
  }
  const entiers = groupes.filter((_, n) => !segment[n]);
  const plusLongs = segmentsColonnes.reduce((x, seg) => (seg.reduce((t, n) => t + n, 0) > x.reduce((t, n) => t + n, 0) ? seg : x), []);
  return {
    dallesParPort: parPort,
    auPlusJuste: remplissage.length,
    dallesMaxParPortAuPlusJuste: Math.max(...remplissage.map((p) => p.e + p.d)),
    pxMaxParPortAuPlusJuste: modele.px ? Math.max(...remplissage.map((p) => modele.px(p.e, p.d))) : null,
    colonnes: {
      colonnesParPort: entiers.length ? Math.max(...entiers.map(([a, b]) => b - a + 1)) : null,
      colonnesParPortMax: null,
      variable: true,
      groupes,
      segments: plusLongs.length ? plusLongs : [Math.max(...colonnes.map((c) => c.length))],
      ports: groupes.length,
      dallesMaxParPort: Math.max(...chargesPorts.map((c) => c.dalles)),
      pxMaxParPort: charge ? Math.max(...chargesPorts.map((c) => c.px)) : null,
    },
    redondance: { auPlusJuste: 2 * remplissage.length, colonnes: 2 * groupes.length },
    seuil: { dallesEnMoins: null },
    remplissage,
    total: s.dalles.total,
  };
}

// Câblage d'un mur, d'une seule pièce ou en zones.
export function cablageMur(m, dalle, parPort, charge, options) {
  return plusieursZones(m) ? cablageZones(mursDesZones(m, dalle), parPort, charge, options) : cablage(m, parPort, charge, options);
}

// Abscisse (px) d'une colonne du mur, comptée de 1 à m.colonnes à travers les zones.
export function xColonne(m, dalle, colonne) {
  const z = m.zones.find((x) => colonne < x.premiereColonne + x.colonnes);
  return z.x + (colonne - z.premiereColonne) * ficheZone(m, z, dalle).pxH;
}
// Largeur (px) d'une colonne du mur, comptée de 1 à m.colonnes à travers les zones.
export function largeurColonne(m, dalle, colonne) {
  return ficheZone(m, m.zones.find((x) => colonne < x.premiereColonne + x.colonnes), dalle).pxH;
}
