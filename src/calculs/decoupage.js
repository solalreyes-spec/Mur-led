// Calculs du mur LED, module 4, data (3/4) : découpage du mur entre processeurs (colonnes, rangées, grille, zones,
// lignes de coupe, variantes), seuil de charge, rectangles NovaLCT.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { EPS, ErreurSaisie, suite } from './commun.js';
import { mur } from './mur.js';
import { plusieursZones, ficheZone, demiZone, avecFiches, mursDesZones, sousForme } from './morceaux.js';
import { tournerDansZone } from './forme-reelle.js';
import { murZones, recouvrement } from './mur-zones.js';
import { chargePx, repartir } from './capacites.js';
import { cablage, formatsCanvas, canvasProcesseur, largeurMaxPour, portsFaceALimite, cartesPour, rectanglesPorts, cartesParRectangles, cartesParZones, blocProcesseur, cablageZones, cablageForme, xColonne, largeurColonne } from './ports.js';

// Contrôles d'un processeur pour tout le mur, puis découpage : en colonnes entières d'abord,
// en rangées si le mur est trop haut, en grille s'il est à la fois trop large et trop haut.
export function decouper(m, dalle, proc, contexte) {
  if (plusieursZones(m)) return decouperZones(m, dalle, proc, contexte);
  const global = cablage(m, contexte.parPort, contexte.charge, { pair: contexte.pair });
  const ports = portsFaceALimite(global, proc, contexte);
  const hauteurMax = Math.max(...formatsCanvas(proc).map((f) => f.hauteurPx));
  const largeurMax = largeurMaxPour(proc, Math.min(m.pxHauteur, hauteurMax));
  const colonnesMax = Math.floor(largeurMax.largeurPx / dalle.pxH);
  const controle = (valeur, limiteValeur, nombre) => ({ valeur, limite: limiteValeur, nombre, depasse: valeur > limiteValeur });
  const controles = {
    pixels: { ...controle(m.pxTotal, proc.pixelsMax, Math.ceil(m.pxTotal / proc.pixelsMax)), compte: 'dalles' },
    largeur: {
      ...controle(m.pxLargeur, largeurMax.largeurPx, colonnesMax >= 1 ? Math.ceil(m.colonnes / colonnesMax) : Infinity),
      colonnesMax,
      format: largeurMax.format,
    },
    hauteur: controle(m.pxHauteur, hauteurMax, Math.ceil(m.pxHauteur / hauteurMax)),
    ports: { ...controle(ports.valeur, ports.limite, Math.ceil(ports.valeur / ports.limite)), principaux: ports.principaux },
  };
  if (proc.dallesMax) {
    controles.dalles = controle(m.dalles.total, proc.dallesMax, Math.ceil(m.dalles.total / proc.dallesMax));
  }
  // Série H, X100 Pro, Z8t : cartes de sortie nécessaires, chaque carte dans sa zone.
  if (proc.carteSortie?.largeurMaxPx) {
    const cartes = cartesParZones(proc, m, global, dalle, { redondance: contexte.redondance })?.length ?? null;
    controles.cartes = {
      ...controle(cartes ?? Infinity, proc.emplacementsSortie, cartes === null ? Infinity : Math.ceil(cartes / proc.emplacementsSortie)),
      zone: { largeurPx: proc.carteSortie.largeurMaxPx, hauteurPx: proc.carteSortie.hauteurMaxPx },
    };
  }
  const limites = Object.entries(controles).filter(([, c]) => c.nombre > 1).map(([nom]) => nom);
  const resultat = { global, controles, limites, nombre: null, grille: null, groupes: [], impossible: null };

  // Une seule dalle doit tenir dans un processeur, sinon aucun découpage ne suffit.
  const unite = blocProcesseur(m, dalle, proc, contexte, { colonnes: 1, premiereColonne: 1, rangees: 1, premiereRangee: 1 });
  if (!unite.ok) {
    resultat.impossible = `Une seule dalle (${dalle.pxH} × ${dalle.pxV} px) dépasse les limites d'un ${proc.nom}.`;
    return resultat;
  }

  const nbRangees = m.rangees.length;
  for (let n = Math.max(1, ...Object.values(controles).map((c) => c.nombre)); n <= m.colonnes * nbRangees; n += 1) {
    for (let nr = 1; nr <= Math.min(n, nbRangees); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > m.colonnes) continue;
      const blocs = [];
      let premiereRangee = 1;
      for (const rangees of repartir(nbRangees, nr)) {
        let premiereColonne = 1;
        for (const colonnes of repartir(m.colonnes, nc)) {
          blocs.push(blocProcesseur(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }));
          premiereColonne += colonnes;
        }
        premiereRangee += rangees;
      }
      if (blocs.every((b) => b.ok)) {
        return { ...resultat, nombre: n, grille: { colonnes: nc, rangees: nr }, groupes: blocs };
      }
    }
  }
  resultat.impossible = `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.`;
  return resultat;
}

// Largeur seule : le moins de blocs de colonnes entières dont la pixel map, vides compris, tient dans `largeurMax`.
function blocsEnLargeur(m, dalle, largeurMax) {
  if (m.zones.some((z) => ficheZone(m, z, dalle).pxH > largeurMax)) return Infinity;
  let blocs = 1;
  let debut = xColonne(m, dalle, 1);
  for (let c = 2; c <= m.colonnes; c += 1) {
    const x = xColonne(m, dalle, c);
    if (x + largeurColonne(m, dalle, c) - debut > largeurMax) {
      blocs += 1;
      debut = x;
    }
  }
  return blocs;
}

// Zones découpables en rangées : toutes de mêmes rangées, à la même hauteur dans la pixel map.
const zonesUniformes = (m) => m.zones.every((z) => !z.forme && z.lignes === m.zones[0].lignes && z.y === m.zones[0].y);

// Colonnes de chaque port d'un morceau rectangulaire : k colonnes par port, ou une colonne coupée en segments.
function groupesUniformes(nbColonnes, colonnes) {
  const k = colonnes.colonnesParPort;
  const groupes = [];
  if (k) {
    for (let x = 1; x <= nbColonnes; x += k) groupes.push([x, Math.min(x + k - 1, nbColonnes)]);
  } else {
    for (let x = 1; x <= nbColonnes; x += 1) for (let n = 0; n < colonnes.segments.length; n += 1) groupes.push([x, x]);
  }
  return groupes;
}

// Bloc d'un processeur à travers les zones : les colonnes [premiereColonne, +colonnes[ du mur, et en zones uniformes les
// rangées [premiereRangee, +rangees[. Chaque morceau de zone est câblé à part ; le bloc est contrôlé sur son propre
// canvas, du coin haut gauche de son premier morceau au coin bas droit du dernier, vides compris.
function blocZones(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees, premiereRangee }) {
  const fin = premiereColonne + colonnes - 1;
  const morceaux = [];
  for (const z of m.zones) {
    const a = Math.max(premiereColonne, z.premiereColonne);
    const b = Math.min(fin, z.premiereColonne + z.colonnes - 1);
    if (a > b) continue;
    morceaux.push(morceauZone(m, dalle, z, a - z.premiereColonne + 1, b - z.premiereColonne + 1, rangees ? premiereRangee : 1, rangees ?? z.lignes));
  }
  return blocMorceaux(m, dalle, proc, contexte, morceaux, { colonnes, premiereColonne, rangees, premiereRangee });
}

// Morceau d'une zone : ses colonnes a à b et, pour une zone rectangulaire, ses rangées r0 à r0 + nr − 1 (comptées dans la
// zone). Zone de forme libre : le morceau est cadré sur ses dalles présentes, coupé en hauteur seulement par une bande
// entre deux coupes horizontales (px depuis le haut de la zone, Z19) ; ses rangées vont de la plus haute à la plus basse
// de ses dalles.
function morceauZone(m, dalleMur, z, a, b, r0 = 1, nr = z.lignes, bande = null) {
  const dalle = ficheZone(m, z, dalleMur);
  const sous = avecFiches(z.forme ? sousForme(z, dalle, demiZone(m, z), a, b, bande) : mur(dalle, b - a + 1, nr), dalle, demiZone(m, z));
  let rangees = [r0, nr];
  if (z.forme) {
    const lignes = sous.forme.colonnes.flatMap((c) => c.cases.filter((x) => x.presente).map((x) => x.rangee));
    rangees = bande && lignes.length ? [Math.min(...lignes), Math.max(...lignes) - Math.min(...lignes) + 1] : [1, z.forme.types.length];
  }
  const x = z.x + (a - 1) * dalle.pxH;
  const y = z.forme ? z.y + sous.forme.haut : z.y + (r0 - 1) * dalle.pxV;
  // Zone tournée hors axe (9c4) : le morceau occupe le rectangle qui englobe ses dalles tournées, et ses pixels comptent
  // deux fois pour l'appareil (relecture du 13/10/2026).
  if (z.roulis) {
    const coins = [[x, y], [x + sous.pxLargeur, y], [x, y + sous.pxHauteur], [x + sous.pxLargeur, y + sous.pxHauteur]]
      .map(([cx, cy]) => tournerDansZone(z.roulis, cx - z.x, cy - z.y, false));
    const min = [0, 1].map((k) => Math.min(...coins.map((c) => c[k])));
    const max = [0, 1].map((k) => Math.max(...coins.map((c) => c[k])));
    const x0 = z.x + Math.max(0, Math.floor(min[0] + 1e-6));
    const y0 = z.y + Math.max(0, Math.floor(min[1] + 1e-6));
    return {
      zone: z.index, nom: z.nom, premiereColonne: a, colonnes: b - a + 1, premiereRangee: rangees[0], rangees: rangees[1],
      x: x0, y: y0, sous, cadre: { largeurPx: Math.min(z.x + z.pxLargeur, z.x + Math.ceil(max[0] - 1e-6)) - x0, hauteurPx: Math.min(z.y + z.pxHauteur, z.y + Math.ceil(max[1] - 1e-6)) - y0 },
      pxCompte: 2 * sous.pxTotal,
    };
  }
  return {
    zone: z.index, nom: z.nom, premiereColonne: a, colonnes: b - a + 1, premiereRangee: rangees[0], rangees: rangees[1], x, y, sous,
  };
}

// Bloc d'un processeur fait de morceaux de zones : câblage morceau par morceau, contrôles sur son canvas (du coin haut
// gauche de son premier morceau au coin bas droit du dernier, vides compris). `meta` : colonnes et rangées du mur qu'il
// couvre (découpage de la 9a), ou rien (lignes de coupe, variantes).
function blocMorceaux(m, dalle, proc, contexte, morceaux, { colonnes = null, premiereColonne = null, rangees = null, premiereRangee = null } = {}) {
  const fin = premiereColonne === null ? null : premiereColonne + colonnes - 1;
  const c = cablageZones(morceaux.map((p) => p.sous), contexte.parPort, contexte.charge, { pair: contexte.pair, chargeDe: contexte.chargeDe });
  const x0 = Math.min(...morceaux.map((p) => p.x));
  // Morceau d'une zone tournée (9c4) : son rectangle englobant et ses pixels comptés deux fois.
  const largeurDe = (p) => p.cadre?.largeurPx ?? p.sous.pxLargeur;
  const hauteurDe = (p) => p.cadre?.hauteurPx ?? p.sous.pxHauteur;
  const x1 = Math.max(...morceaux.map((p) => p.x + largeurDe(p) - 1));
  const y0 = Math.min(...morceaux.map((p) => p.y));
  const y1 = Math.max(...morceaux.map((p) => p.y + hauteurDe(p) - 1));
  const largeurPx = x1 - x0 + 1;
  const hauteurPx = y1 - y0 + 1;
  const px = morceaux.reduce((s, p) => s + (p.pxCompte ?? p.sous.pxTotal), 0);
  const dalles = morceaux.reduce((s, p) => s + p.sous.dalles.total, 0);
  const ports = portsFaceALimite(c, proc, contexte);
  const canvas = canvasProcesseur(proc, largeurPx, hauteurPx);
  const sorties = proc.sortiesParDistributeur;
  // Série H, X100 Pro, Z8t, MX6000 Pro : cartes comptées par zones, sur les rectangles des ports dans le canvas du bloc.
  const rectangles = () => morceaux.flatMap((p, i) => rectanglesPorts(p.sous, c.parties[i], p.sous.fiche ?? dalle, p.x, p.y));
  const parZones = proc.carteSortie?.largeurMaxPx || proc.carteSortie?.pixelsMax ? {
    colonnes: cartesParRectangles(proc, rectangles()),
    redondance: cartesParRectangles(proc, rectangles(), { redondance: true }),
  } : null;
  const zones = parZones && { colonnes: parZones.colonnes?.length ?? Infinity, redondance: parZones.redondance?.length ?? Infinity };
  const convertisseurs = (liste, facteur) => (liste ? liste.reduce((t, n) => t + Math.ceil((facteur * n) / sorties), 0) : Infinity);
  const ok = px <= proc.pixelsMax
    && canvas !== null
    && ports.valeur <= ports.limite
    && (!proc.dallesMax || dalles <= proc.dallesMax)
    && (!zones || (contexte.redondance ? zones.redondance : zones.colonnes) <= proc.emplacementsSortie);
  // Ports numérotés dans le processeur, morceau après morceau, de gauche à droite.
  let numero = 1;
  const parties = morceaux.map((p, i) => {
    const cp = c.parties[i];
    const n = cp.colonnes.ports;
    // Colonnes de chaque port, comptées dans la zone : [première, dernière].
    const decalage = p.premiereColonne - 1;
    const groupes = (cp.colonnes.groupes ?? groupesUniformes(p.colonnes, cp.colonnes)).map(([g0, g1]) => [g0 + decalage, g1 + decalage]);
    const partie = {
      zone: p.zone,
      nom: p.nom,
      nomAffiche: p.nom,
      premiereColonne: p.premiereColonne,
      colonnes: p.colonnes,
      premiereRangee: p.premiereRangee,
      rangees: p.rangees,
      // Coin haut gauche dans la pixel map du mur, et dans l'entrée du processeur (le bloc en haut à gauche de sa source).
      x: p.x,
      y: p.y,
      dansEntree: { x: p.x - x0, y: p.y - y0 },
      largeurPx: largeurDe(p),
      hauteurPx: hauteurDe(p),
      dalles: p.sous.dalles.total,
      px: p.pxCompte ?? p.sous.pxTotal,
      ports: { colonnes: n, premier: numero, dernier: numero + n - 1, auPlusJuste: cp.auPlusJuste, redondance: cp.redondance, groupes },
    };
    // Le morceau lui-même, pour le serpentin de Data ; hors du JSON de l'évaluation.
    Object.defineProperty(partie, 'sous', { value: p.sous, enumerable: false });
    numero += n;
    return partie;
  });
  return {
    colonnes,
    premiereColonne,
    derniereColonne: fin,
    rangees: rangees ?? Math.max(...morceaux.map((p) => p.rangees)),
    premiereRangee: rangees ? premiereRangee : 1,
    derniereRangee: rangees ? premiereRangee + rangees - 1 : Math.max(...morceaux.map((p) => p.rangees)),
    format: canvas?.format ?? null,
    canvas,
    x: [x0, x1],
    y: [y0, y1],
    dalles,
    px,
    largeurPx,
    hauteurPx,
    // Pixels vides dans la largeur du bloc (écarts entre ses morceaux).
    videsLargeurPx: largeurPx - parties.reduce((s, p) => s + p.largeurPx, 0),
    ports: { auPlusJuste: c.auPlusJuste, colonnes: c.colonnes.ports, redondance: c.redondance },
    distributeurs: sorties ? {
      colonnes: parZones ? convertisseurs(parZones.colonnes, 1) : Math.ceil(c.colonnes.ports / sorties),
      auPlusJuste: Math.ceil(c.auPlusJuste / sorties),
      redondance: parZones
        ? (proc.portsRedondance ? 2 * convertisseurs(parZones.redondance, 1) : convertisseurs(parZones.redondance, 2))
        : 2 * Math.ceil(c.colonnes.ports / sorties),
    } : null,
    cartesSortie: zones ?? (proc.carteSortie ? {
      colonnes: cartesPour(proc, c.colonnes.ports, px),
      redondance: cartesPour(proc, proc.portsRedondance ? c.colonnes.ports : 2 * c.colonnes.ports, px),
    } : null),
    chargeMax: chargePx(c.colonnes.pxMaxParPort, contexte.capacite),
    parties,
    ok,
  };
}

// Morceau d'une zone partagée entre plusieurs blocs : « B-C 1/2 », « B-C 2/2 » ; une zone entière garde son nom.
function nommerMorceaux(blocs) {
  const parZone = new Map();
  for (const b of blocs) for (const p of b.parties) parZone.set(p.zone, [...(parZone.get(p.zone) ?? []), p]);
  for (const liste of parZone.values()) {
    if (liste.length > 1) liste.forEach((p, i) => { p.nomAffiche = `${p.nom} ${i + 1}/${liste.length}`; });
  }
}

// Contrôles et découpage d'un mur en zones : pixels utiles (les vides ne chargent aucun port) ; largeur et hauteur de
// la pixel map, vides compris ; ports zone par zone. Colonnes entières à travers les zones, en groupes aussi égaux que
// possible ; en rangées seulement si toutes les zones ont les mêmes rangées à la même hauteur.
function decouperZones(m, dalle, proc, contexte) {
  const murs = mursDesZones(m, dalle);
  const global = cablageZones(murs, contexte.parPort, contexte.charge, { pair: contexte.pair, chargeDe: contexte.chargeDe });
  const ports = portsFaceALimite(global, proc, contexte);
  const hauteurMax = Math.max(...formatsCanvas(proc).map((f) => f.hauteurPx));
  const largeurMax = largeurMaxPour(proc, Math.min(m.pxHauteur, hauteurMax));
  const colonnesMax = Math.floor(largeurMax.largeurPx / dalle.pxH);
  const controle = (valeur, limiteValeur, nombre) => ({ valeur, limite: limiteValeur, nombre, depasse: valeur > limiteValeur });
  const controles = {
    pixels: { ...controle(m.pxTotal, proc.pixelsMax, Math.ceil(m.pxTotal / proc.pixelsMax)), compte: 'dalles' },
    largeur: {
      ...controle(m.pxLargeur, largeurMax.largeurPx, empilees(m) ? bandesEnLargeur(m, dalle, largeurMax.largeurPx) : blocsEnLargeur(m, dalle, largeurMax.largeurPx)),
      colonnesMax,
      format: largeurMax.format,
    },
    hauteur: controle(m.pxHauteur, hauteurMax, Math.ceil(m.pxHauteur / hauteurMax)),
    ports: { ...controle(ports.valeur, ports.limite, Math.ceil(ports.valeur / ports.limite)), principaux: ports.principaux },
  };
  if (proc.dallesMax) {
    controles.dalles = controle(m.dalles.total, proc.dallesMax, Math.ceil(m.dalles.total / proc.dallesMax));
  }
  if (proc.carteSortie?.largeurMaxPx) {
    const rectangles = m.zones.flatMap((z, i) => rectanglesPorts(murs[i], global.parties[i], murs[i].fiche ?? dalle, z.x, z.y + (murs[i].forme?.haut ?? 0)));
    const cartes = cartesParRectangles(proc, rectangles, { redondance: contexte.redondance })?.length ?? null;
    controles.cartes = {
      ...controle(cartes ?? Infinity, proc.emplacementsSortie, cartes === null ? Infinity : Math.ceil(cartes / proc.emplacementsSortie)),
      zone: { largeurPx: proc.carteSortie.largeurMaxPx, hauteurPx: proc.carteSortie.hauteurMaxPx },
    };
  }
  const limites = Object.entries(controles).filter(([, c]) => c.nombre > 1).map(([nom]) => nom);
  const resultat = { global, controles, limites, nombre: null, grille: null, groupes: [], impossible: null };

  const unite = blocProcesseur(mur(dalle, 1, 1), dalle, proc, contexte, { colonnes: 1, premiereColonne: 1, rangees: 1, premiereRangee: 1 });
  if (!unite.ok) {
    resultat.impossible = `Une seule dalle (${dalle.pxH} × ${dalle.pxV} px) dépasse les limites d'un ${proc.nom}.`;
    return resultat;
  }

  // Variante retenue dans Data (9b2, Z20) : zones entières, ou un processeur par zone.
  if (contexte.decoupage === 'zonesEntieres' || contexte.decoupage === 'unParZone') {
    return { ...resultat, ...decouperVariante(m, dalle, proc, contexte, contexte.decoupage) };
  }
  const uniformes = zonesUniformes(m);
  const nbRangees = uniformes ? m.zones[0].lignes : 1;
  const depart = Math.max(1, ...Object.values(controles).map((c) => c.nombre));
  // Zones empilées (9b2, Z19) : découpage par lignes de coupe ; sinon celui de la 9a, puis les lignes de coupe pour des
  // zones de hauteurs différentes trop hautes pour un processeur.
  const parCoupes = () => {
    const r = decouperCoupes(m, dalle, proc, contexte, depart);
    return r ? { ...resultat, ...r } : null;
  };
  if (empilees(m)) return parCoupes() ?? { ...resultat, impossible: `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.` };
  for (let n = depart; Number.isFinite(n) && n <= m.colonnes * nbRangees; n += 1) {
    for (let nr = 1; nr <= Math.min(n, nbRangees); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > m.colonnes) continue;
      const blocs = [];
      let premiereRangee = 1;
      for (const rangees of repartir(nbRangees, nr)) {
        let premiereColonne = 1;
        for (const colonnes of repartir(m.colonnes, nc)) {
          blocs.push(blocZones(m, dalle, proc, contexte, { colonnes, premiereColonne, rangees: uniformes ? rangees : null, premiereRangee }));
          premiereColonne += colonnes;
        }
        premiereRangee += rangees;
      }
      if (blocs.every((b) => b.ok)) {
        nommerMorceaux(blocs);
        return { ...resultat, nombre: n, grille: { colonnes: nc, rangees: nr }, groupes: blocs };
      }
    }
  }
  if (!uniformes) {
    const r = parCoupes();
    if (r) return r;
  }
  resultat.impossible = `Aucun découpage en colonnes et en rangées ne tient dans des ${proc.nom}.`;
  return resultat;
}

// Zones l'une au-dessus de l'autre : deux zones qui se recouvrent en X dans la pixel map.
function empilees(m) {
  return m.zones.some((a, i) => m.zones.slice(i + 1).some((b) => recouvrement(a.x, a.x + a.pxLargeur, b.x, b.x + b.pxLargeur)));
}

// Lignes de coupe (9b2, Z19) : X où une coupe verticale ne traverse aucune dalle (pour chaque zone qui couvre ce X, c'est
// un bord de colonne), et Y de même pour une coupe horizontale (dans une zone de forme libre, un Y qui ne traverse aucune
// de ses dalles présentes). Bords de la pixel map compris.
export function lignesDeCoupe(m, dalle) {
  const zones = plusieursZones(m) ? m.zones : [{ x: 0, y: 0, pxLargeur: m.pxLargeur, pxHauteur: m.pxHauteur, colonnes: m.colonnes, lignes: m.lignes }];
  const dedans = (v, debut, taille) => v > debut && v < debut + taille;
  const xs = new Set([0, m.pxLargeur]);
  const ys = new Set([0, m.pxHauteur]);
  const f = (z) => z.dalle ?? dalle;
  for (const z of zones) {
    for (let k = 0; k <= z.colonnes; k += 1) xs.add(z.x + k * f(z).pxH);
    if (z.forme) {
      ys.add(z.y);
      ys.add(z.y + z.pxHauteur);
      for (const c of z.forme.colonnes) {
        for (const x of c.cases.filter((x) => x.presente)) {
          ys.add(z.y + x.y);
          ys.add(z.y + x.y + x.h);
        }
      }
    } else {
      for (let k = 0; k <= z.lignes; k += 1) ys.add(z.y + k * f(z).pxV);
    }
  }
  const x = [...xs].filter((v) => zones.every((z) => !dedans(v, z.x, z.pxLargeur) || (v - z.x) % f(z).pxH === 0));
  const traverse = (z, v) => z.forme.colonnes.some((c) => c.cases.some((x) => x.presente && dedans(v, z.y + x.y, x.h)));
  const y = [...ys].filter((v) => zones.every((z) => !dedans(v, z.y, z.pxHauteur) || (z.forme ? !traverse(z, v) : (v - z.y) % f(z).pxV === 0)));
  return { x: x.sort((a, b) => a - b), y: y.sort((a, b) => a - b) };
}

// Largeur seule, zones empilées : le moins de blocs entre lignes de coupe dont la largeur tient dans `largeurMax`.
function bandesEnLargeur(m, dalle, largeurMax) {
  const { x } = lignesDeCoupe(m, dalle);
  let blocs = 1;
  let debut = x[0];
  for (let i = 1; i < x.length; i += 1) {
    if (x[i] - x[i - 1] > largeurMax) return Infinity;
    if (x[i] - debut > largeurMax) {
      blocs += 1;
      debut = x[i - 1];
    }
  }
  return blocs;
}

// Morceaux de zones dans le rectangle [xa, xb[ × [ya, yb[ de la pixel map, bornes sur des lignes de coupe.
function morceauxRectangle(m, dalle, xa, xb, ya, yb) {
  const morceaux = [];
  for (const z of m.zones) {
    const x0 = Math.max(xa, z.x);
    const x1 = Math.min(xb, z.x + z.pxLargeur);
    const y0 = Math.max(ya, z.y);
    const y1 = Math.min(yb, z.y + z.pxHauteur);
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const f = ficheZone(m, z, dalle);
    const a = Math.round((x0 - z.x) / f.pxH) + 1;
    const b = Math.round((x1 - z.x) / f.pxH);
    // Forme libre coupée en hauteur : la bande entre les deux coupes.
    const bande = z.forme && (y0 > z.y || y1 < z.y + z.pxHauteur) ? [y0 - z.y, y1 - z.y] : null;
    const p = morceauZone(m, dalle, z, a, b, Math.round((y0 - z.y) / f.pxV) + 1, Math.round((y1 - y0) / f.pxV), bande);
    if (p.sous.dalles.total > 0) morceaux.push(p);
  }
  return morceaux;
}

// Groupes de bandes consécutives, aussi peu larges que possible : le plus petit maximum `taille` qui laisse au plus
// `nombre` groupes, chaque groupe aussi grand que possible de gauche à droite (ou de haut en bas) et accepté par `tient`.
function grouperBandes(bornes, nombre, tient = () => true) {
  const bandes = bornes.length - 1;
  const essai = (taille) => {
    const groupes = [];
    let i = 0;
    while (i < bandes) {
      if (bornes[i + 1] - bornes[i] > taille || !tient(i, i)) return null;
      let j = i;
      while (j + 1 < bandes && bornes[j + 2] - bornes[i] <= taille && tient(i, j + 1)) j += 1;
      groupes.push([i, j]);
      if (groupes.length > nombre) return null;
      i = j + 1;
    }
    return groupes;
  };
  let bas = Math.max(...bornes.slice(1).map((b, i) => b - bornes[i]));
  let haut = bornes[bandes] - bornes[0];
  if (!essai(haut)) return null;
  while (bas < haut) {
    const milieu = Math.floor((bas + haut) / 2);
    if (essai(milieu)) haut = milieu;
    else bas = milieu + 1;
  }
  return essai(haut);
}

// Découpage par lignes de coupe (9b2, Z19) : le moins de processeurs ; colonnes d'abord, puis rangées si le mur est trop
// haut, puis grille ; les rangées par la hauteur la plus faible, puis les colonnes par la largeur la plus faible qui laisse
// chaque bloc passer ses contrôles, chaque bloc aussi large que possible de gauche à droite. Un bloc sans dalle n'a pas
// de processeur.
function decouperCoupes(m, dalle, proc, contexte, depart) {
  const { x: xs, y: ys } = lignesDeCoupe(m, dalle);
  const cache = new Map();
  const bloc = (xa, xb, ya, yb) => {
    const cle = `${xa},${xb},${ya},${yb}`;
    if (!cache.has(cle)) {
      const morceaux = morceauxRectangle(m, dalle, xa, xb, ya, yb);
      cache.set(cle, morceaux.length ? blocMorceaux(m, dalle, proc, contexte, morceaux) : null);
    }
    return cache.get(cle);
  };
  const maxi = (xs.length - 1) * (ys.length - 1);
  for (let n = depart; n <= maxi; n += 1) {
    for (let nr = 1; nr <= Math.min(n, ys.length - 1); nr += 1) {
      const nc = n / nr;
      if (!Number.isInteger(nc) || nc > xs.length - 1) continue;
      const lignes = grouperBandes(ys, nr);
      if (!lignes) continue;
      const tient = (i, j) => lignes.every(([a, b]) => {
        const r = bloc(xs[i], xs[j + 1], ys[a], ys[b + 1]);
        return r === null || r.ok;
      });
      const colonnes = grouperBandes(xs, nc, tient);
      if (!colonnes) continue;
      const blocs = lignes.flatMap(([a, b]) => colonnes.map(([i, j]) => bloc(xs[i], xs[j + 1], ys[a], ys[b + 1]))).filter(Boolean);
      nommerMorceaux(blocs);
      return { nombre: blocs.length, grille: { colonnes: colonnes.length, rangees: lignes.length }, groupes: blocs };
    }
  }
  return null;
}

// Variantes de découpage (9b2, Z20). « Zones entières » : aucune zone coupée, sauf une zone trop grande pour un
// processeur, coupée seule ; groupes de zones voisines dans la liste, le moins de processeurs, puis le groupe le plus
// chargé le moins chargé possible, puis le premier groupe le plus grand. « Un processeur par zone » : aucun processeur ne
// porte deux zones.
function decouperVariante(m, dalle, proc, contexte, mode) {
  const zones = m.zones;
  const entiere = (indices) => blocMorceaux(m, dalle, proc, contexte, indices.map((i) => morceauZone(m, dalle, zones[i], 1, zones[i].colonnes)));
  // Une zone seule, coupée en colonnes et en rangées si elle ne tient pas d'un bloc (forme libre : en bandes entre ses
  // coupes horizontales, Z19).
  const seule = (i) => {
    const z = zones[i];
    const un = entiere([i]);
    if (un.ok) return [un];
    const ys = z.forme ? lignesDeCoupe({ zones: [{ ...z, x: 0, y: 0 }], pxLargeur: z.pxLargeur, pxHauteur: z.pxHauteur }, ficheZone(m, z, dalle)).y : null;
    const rangeesMax = z.forme ? ys.length - 1 : z.lignes;
    for (let n = 2; n <= z.colonnes * rangeesMax; n += 1) {
      for (let nr = 1; nr <= Math.min(n, rangeesMax); nr += 1) {
        const nc = n / nr;
        if (!Number.isInteger(nc) || nc > z.colonnes) continue;
        // Rangées de blocs : [première rangée, rangées, bande].
        let lignes;
        if (z.forme) {
          lignes = grouperBandes(ys, nr)?.map(([a, b]) => [1, z.lignes, nr > 1 ? [ys[a], ys[b + 1]] : null]);
          if (!lignes) continue;
        } else {
          let r0 = 1;
          lignes = repartir(rangeesMax, nr).map((nbR) => {
            r0 += nbR;
            return [r0 - nbR, nbR, null];
          });
        }
        const blocs = [];
        for (const [r0, nbR, bande] of lignes) {
          let a = 1;
          for (const nbC of repartir(z.colonnes, nc)) {
            const morceau = morceauZone(m, dalle, z, a, a + nbC - 1, r0, nbR, bande);
            if (morceau.sous.dalles.total > 0) blocs.push(blocMorceaux(m, dalle, proc, contexte, [morceau]));
            a += nbC;
          }
        }
        if (blocs.every((b) => b.ok)) return blocs;
      }
    }
    return null;
  };
  const seules = zones.map((_, i) => seule(i));
  if (seules.some((b) => b === null)) return { nombre: null, groupes: [], impossible: `Une zone ne tient dans aucun découpage en ${proc.nom}.` };
  let groupes;
  if (mode === 'unParZone') {
    groupes = seules.flat();
  } else {
    const tientSeule = zones.map((_, i) => seules[i].length === 1);
    const cache = new Map();
    const groupe = (a, b) => {
      const cle = `${a},${b}`;
      if (!cache.has(cle)) cache.set(cle, a === b ? seules[a] : (entiere(suite(a, b)).ok ? [entiere(suite(a, b))] : null));
      return cache.get(cle);
    };
    let meilleur = null;
    for (let masque = 0; masque < 2 ** (zones.length - 1); masque += 1) {
      const morceaux = [];
      let debut = 0;
      for (let i = 0; i < zones.length; i += 1) {
        if (i === zones.length - 1 || masque & (2 ** i)) {
          morceaux.push([debut, i]);
          debut = i + 1;
        }
      }
      if (morceaux.some(([a, b]) => b > a && suite(a, b).some((i) => !tientSeule[i]))) continue;
      const blocs = morceaux.map(([a, b]) => groupe(a, b));
      if (blocs.some((x) => x === null)) continue;
      const liste = blocs.flat();
      const cles = [liste.length, Math.max(...liste.map((x) => x.px)), ...morceaux.map(([a, b]) => -(b - a + 1))];
      // Clés comparées dans l'ordre : processeurs, pixels du bloc le plus chargé, taille des groupes (le premier le plus grand).
      const ecart = meilleur ? cles.findIndex((v, k) => v !== meilleur.cles[k]) : -1;
      if (!meilleur || (ecart >= 0 && cles[ecart] < (meilleur.cles[ecart] ?? Infinity))) meilleur = { cles, liste };
    }
    groupes = meilleur.liste;
  }
  nommerMorceaux(groupes);
  return { nombre: groupes.length, grille: null, groupes };
}

// Minimum théorique (au plus juste, zone par zone) face au décompte retenu en colonnes entières.
export function minimumTheoriqueZones(c, minimum, murs, unite, { pair = false } = {}) {
  const retenu = c.colonnes.ports;
  const pl = (n) => `${n} ${unite}${n > 1 ? 's' : ''}`;
  const un = unite === 'ligne' ? 'une' : 'un';
  const raisons = [];
  if (c.parties.some((p) => !p.colonnes.colonnesParPort)) {
    raisons.push(`une colonne dépasse ${un} ${unite} : elle est coupée en segments égaux`);
  }
  const sansPair = c.parties.reduce((t, p, i) => t + (p.colonnes.colonnesParPortMax
    ? Math.ceil(murs[i].colonnes / p.colonnes.colonnesParPortMax) : p.colonnes.ports), 0);
  if (pair && retenu > sansPair) {
    raisons.push(`en redondance, nombre pair de colonnes par ${unite} : chaque chaîne revient au bord de départ (${pl(sansPair)} sans cette règle)`);
  }
  if (sansPair > minimum) raisons.push(`une colonne n'est jamais coupée entre deux ${unite}s, et ${un} ${unite} ne passe jamais d'une zone à l'autre`);
  return {
    nombre: minimum,
    raisons,
    texte: retenu === minimum ? null
      : `Minimum théorique : ${pl(minimum)} au plus juste, contre ${retenu} en colonnes entières. Écart : ${raisons.join(' ; ')}.`,
  };
}

// Seuil processeur en zones : le moins de colonnes à retirer d'une seule zone pour économiser un processeur, et les
// zones où ce nombre suffit.
export function seuilZones(m, dalle, proc, contexte, nombre) {
  let meilleur = null;
  const zonesEnMoins = [];
  if (nombre > 1) {
    m.saisie.zones.forEach((z, i) => {
      for (let c = 1; c < z.colonnes && (meilleur === null || c <= meilleur); c += 1) {
        // Retirer une colonne d'une zone de forme libre : sa dernière colonne, avec ses dalles absentes et son décalage.
        const reste = z.colonnes - c;
        const zones = m.saisie.zones.map((x, j) => (j !== i ? x : {
          ...x,
          colonnes: reste,
          ...(x.absentes ? { absentes: x.absentes.filter(([col]) => col <= reste) } : {}),
          ...(x.decalagesMm ? { decalagesMm: x.decalagesMm.slice(0, reste) } : {}),
        }));
        let n = null;
        try {
          n = decouper(murZones(dalle, zones, m.saisie.options), dalle, proc, contexte).nombre;
        } catch (erreur) {
          if (!(erreur instanceof ErreurSaisie)) throw erreur;
        }
        if (n !== null && n < nombre) {
          if (meilleur === null || c < meilleur) {
            meilleur = c;
            zonesEnMoins.length = 0;
          }
          zonesEnMoins.push(m.zones[i].nom);
          break;
        }
      }
    });
  }
  return { colonnesEnMoins: meilleur, zonesEnMoins };
}

// Rectangles NovaLCT zone par zone (un port ne passe jamais d'une zone à l'autre).
export function rectanglesZones(m, dalle, capacite) {
  // Zone de forme libre : les colonnes entières comptées en rectangles sont déjà réalisables (9b, Z21).
  const enRectangles = (s, fiche) => {
    const px = fiche.pxH * fiche.pxV;
    const charge = { capacite, rectangle: true, pxParDalle: px, pxParDemi: m.demi ? m.demi.pxH * m.demi.pxV : px };
    const ports = cablageForme(s, Math.floor(capacite / px + EPS), charge).colonnes.ports;
    return { ports, colonnes: null, rangees: null, redondance: 2 * ports };
  };
  const parZone = mursDesZones(m, dalle).map((s) => (s.forme ? enRectangles(s, s.fiche ?? dalle) : rectanglesNovaLCT(s, s.fiche ?? dalle, capacite)));
  if (parZone.some((r) => !r)) return null;
  const ports = parZone.reduce((t, r) => t + r.ports, 0);
  return { ports, colonnes: parZone[0].colonnes, rangees: parZone[0].rangees, redondance: 2 * ports, parZone };
}

// NovaLCT (MCTRL, VX, NovaPro) compte pour chaque port tout le rectangle qui englobe ses dalles, vides compris.
// Décompte en rectangles : pavage du mur en rectangles de a colonnes × b rangées (rangées regroupées de haut
// en bas), chaque rectangle tenant dans un port ; on garde le moins de ports, puis les rectangles les plus hauts.
export function rectanglesNovaLCT(m, dalle, capacite) {
  const hauteurs = m.rangees.map((type) => (type === 'demi' ? m.demi.pxV : dalle.pxV));
  let meilleur = null;
  for (let b = 1; b <= hauteurs.length; b += 1) {
    const tranches = [];
    for (let i = 0; i < hauteurs.length; i += b) tranches.push(hauteurs.slice(i, i + b).reduce((s, h) => s + h, 0));
    const colonnesMax = Math.floor(capacite / (dalle.pxH * Math.max(...tranches)) + EPS);
    if (colonnesMax < 1) continue;
    const a = Math.min(colonnesMax, m.colonnes);
    const ports = Math.ceil(m.colonnes / a) * tranches.length;
    if (!meilleur || ports < meilleur.ports || (ports === meilleur.ports && b >= meilleur.rangees)) {
      meilleur = { ports, colonnes: a, rangees: b };
    }
  }
  return meilleur && { ...meilleur, redondance: 2 * meilleur.ports };
}
