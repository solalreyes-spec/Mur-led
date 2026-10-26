// Calculs du mur LED, module 6, câblage du Schéma : câblage data et câblage élec, dalle par dalle.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie, COINS, LIBELLE_IMPOSEE, suite, serpentin, remplirGlouton, portsDoubles } from './commun.js';
import { mur } from './mur.js';
import { plusieursZones, ficheZone, mursDesZones } from './morceaux.js';
import { entierInferieur, pixelsComptes, dallesParPort, repartir, penaliteGroupe, texteCable5G, MODELES_DISTRIBUTEUR } from './capacites.js';
import { cablage, chargeGeometrie, sousMur, repartirSurCartes, groupesForme, optionsConvertisseurs, cablageForme } from './ports.js';
import { rectanglesNovaLCT } from './decoupage.js';
import { arrondiW, pMaxDalle } from './elec.js';
import { idDalle, idDalleZone, dallesDuMur } from './pixel-map.js';
import {
  refusMurImpose, nombreImpose, planPortsImposes, taillesImposees, ecartImpose, fibreImposee, alertePortee,
  texteConseilPorts, texteConseilLignes, textePortsImposes
} from './config-imposee.js';

const LIMITE_CUIVRE_M = 100;

const limiteCuivre = (proc) => (proc.typePorts === '5G' && proc.longueurCable5GM ? proc.longueurCable5GM : LIMITE_CUIVRE_M);

export const MARGE_MOU_DEFAUT = 0.1;
// Processeurs sans sortie fibre (MCTRL300, MCTRL660, VX2U, VX4S, VX6s…) : fibre seulement par convertisseurs sur chaque port.
const TEXTE_SANS_FIBRE = 'pas de sortie fibre : une paire de CVT310 (multimode, 550 m) ou CVT320 (monomode, 20 km) par port au-delà de 100 m';
// Colorlight sans sortie fibre : les H10FN2, H10FN et H10Fix demandent une sortie fibre 10G.
const TEXTE_SANS_FIBRE_COLORLIGHT = 'pas de sortie fibre : une paire de convertisseurs Ethernet-fibre 1G par port au-delà de 100 m '
  + '(les H10FN2, H10FN et H10Fix demandent une sortie fibre 10G ; choix de conception du projet)';
// HELIOS Jr : ports 1G en cuivre, sans sortie fibre.
const TEXTE_SANS_FIBRE_MEGAPIXEL = 'pas de sortie fibre : une paire de convertisseurs Ethernet-fibre 1G par port au-delà de 100 m '
  + '(choix de conception du projet), ou un HELIOS 4K ou 8K avec ses switches';
const TEXTES_SANS_FIBRE = { colorlight: TEXTE_SANS_FIBRE_COLORLIGHT, megapixel: TEXTE_SANS_FIBRE_MEGAPIXEL };
// Convertisseurs de même rôle, cités en note.
const AUTRES_DISTRIBUTEURS = { 'colorlight-h10fn2': 'H10FN ou H10Fix' };
// Distributeur fibre proposé quand le cuivre dépasse 100 m, si la fiche du processeur n'en nomme pas.
const FIBRE_PAR_FAMILLE = { brompton: 'XD', novastar: 'CVT10', colorlight: 'convertisseurs fibre', megapixel: 'switches' };

// Identifiant d'une position [colonne du mur, rangée] : en zones, la colonne est comptée de 1 à m.colonnes à travers les
// zones et la rangée dans la zone.
function identifiantDalle(m) {
  // Une seule zone (de forme libre) : « C3 R2 », comme ses dalles (dallesDesZones).
  if (!plusieursZones(m) || m.zones.length === 1) return (c, r) => idDalle(c, r);
  return (c, r) => {
    const z = m.zones.find((x) => c < x.premiereColonne + x.colonnes);
    return idDalleZone(z.nom, c - z.premiereColonne + 1, r);
  };
}

// Règles du terrain (étape 8b) : un port ou une ligne prend des colonnes entières et part du bord de départ.

// Groupes de colonnes entières depuis le côté de départ, chacun en serpentin depuis le bord de départ :
// k colonnes par groupe, ou la taille de chaque groupe (tableau).
function lotsDeColonnes(cols, rows, tailles, coin) {
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const liste = Array.isArray(tailles) ? tailles : repartirParLots(ordreCols.length, tailles);
  const groupes = [];
  let avant = 0;
  for (const n of liste) {
    groupes.push(serpentin(ordreCols.slice(avant, avant + n).sort((a, b) => a - b), rows, 'vertical', coin));
    avant += n;
  }
  return groupes;
}

// Lots de k, le dernier avec le reste.
function repartirParLots(total, k) {
  return Array.from({ length: Math.ceil(total / k) }, (_, i) => Math.min(k, total - i * k));
}

// Colonne plus haute qu'un port ou qu'une ligne : chaque colonne en segments égaux (tailles de haut en bas,
// comme `cablage`), chacun partant de son extrémité côté bord de départ.
function segmentsDeColonnes(cols, rows, tailles, coin) {
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const segments = [];
  let debut = 0;
  for (const n of tailles) {
    segments.push(rows.slice(debut, debut + n));
    debut += n;
  }
  const ordreSegments = coin.startsWith('haut') ? segments : [...segments].reverse();
  return ordreCols.flatMap((col) => ordreSegments.map((seg) => serpentin([col], seg, 'vertical', coin)));
}

// Groupes par rangées entières depuis le bord de départ, en serpentin depuis le côté de départ : le plus de rangées
// qui tiennent, en nombre pair en redondance (data). Une rangée qui ne tient pas seule est coupée en segments égaux
// de colonnes.
function groupesRangees(cols, rows, poids, capacite, plafond, coin, { pair = false, penalite = null } = {}) {
  const ordreRows = coin.startsWith('haut') ? rows : [...rows].reverse();
  const ordreCols = coin.endsWith('gauche') ? cols : [...cols].reverse();
  const positions = (rs) => rs.flatMap((r) => cols.map((c) => [c, r]));
  const tient = (ps) => ps.reduce((s, p) => s + poids(p), 0) + (penalite && ps.length ? penalite(ps) : 0) <= capacite + EPS && ps.length <= plafond;
  const lots = (k) => {
    const groupes = [];
    for (let i = 0; i < ordreRows.length; i += k) groupes.push(ordreRows.slice(i, i + k));
    return groupes;
  };
  let kmax = 0;
  for (let n = 1; n <= ordreRows.length && lots(n).every((l) => tient(positions(l))); n += 1) kmax = n;
  if (kmax >= 1) {
    for (let k = pair && kmax >= 2 ? kmax - (kmax % 2) : kmax; k >= 1; k -= 1) {
      if (lots(k).every((l) => tient(positions(l)))) return lots(k).map((l) => serpentin(cols, [...l].sort((a, b) => a - b), 'horizontal', coin));
    }
  }
  const groupes = [];
  for (const r of ordreRows) {
    let s = 1;
    while (s < cols.length && !repartir(cols.length, s).every((n, i, tailles) => {
      const avant = tailles.slice(0, i).reduce((a, b) => a + b, 0);
      return tient(ordreCols.slice(avant, avant + n).map((c) => [c, r]));
    })) s += 1;
    let avant = 0;
    for (const n of repartir(cols.length, s)) {
      groupes.push(serpentin(ordreCols.slice(avant, avant + n).sort((a, b) => a - b), [r], 'horizontal', coin));
      avant += n;
    }
  }
  return groupes;
}

// Coin de départ en millimètres, et trajet le long du mur jusqu'au centre d'une dalle (en mètres).
function trajetDepuisCoin(m, coin, d) {
  const x0 = coin.endsWith('gauche') ? 0 : m.largeurMm;
  const y0 = coin.startsWith('haut') ? 0 : m.hauteurMm;
  return (Math.abs(d.mm.x + d.mm.largeur / 2 - x0) + Math.abs(d.mm.y + d.mm.hauteur / 2 - y0)) / 1000;
}

// Retour de secours : de la dernière dalle au bord de départ en longeant la structure (le long de sa colonne, ou de
// sa rangée pour un câblage par rangées), puis le long du bord jusqu'au coin. Jamais en diagonale. Points en mm.
function cheminSecours(m, coin, d, orientation) {
  const xc = d.mm.x + d.mm.largeur / 2;
  const yc = d.mm.y + d.mm.hauteur / 2;
  const x0 = coin.endsWith('gauche') ? 0 : m.largeurMm;
  const y0 = coin.startsWith('haut') ? 0 : m.hauteurMm;
  return orientation === 'rangees' ? [[xc, yc], [x0, yc], [x0, y0]] : [[xc, yc], [xc, y0], [x0, y0]];
}
const centreDalle = (d) => ({ x: d.mm.x + d.mm.largeur / 2, y: d.mm.y + d.mm.hauteur / 2 });
const longueurCheminM = (chemin) => chemin.reduce((s, p, i) => (i === 0 ? 0 : s + Math.abs(p[0] - chemin[i - 1][0]) + Math.abs(p[1] - chemin[i - 1][1])), 0) / 1000;

// Coin de départ selon le mode du mur : en bas pour un mur posé (stack), en haut pour un mur accroché ; le bord
// peut être forcé quand la régie ou l'armoire arrive par l'autre côté. Côté : celui du processeur ou de l'armoire.
export function coinDepart({ mode = 'accroche', cote = 'gauche', bord = 'auto' } = {}) {
  const vertical = bord === 'haut' || bord === 'bas' ? bord : (mode === 'stack' ? 'bas' : 'haut');
  return `${vertical}-${cote === 'droite' ? 'droite' : 'gauche'}`;
}

export const MENTION_AU_PLUS_JUSTE = 'optimisation, rarement câblé ainsi sur le terrain';

// Rectangle englobant d'un port en pixels réels, tel que NovaLCT le compte.
function pxRectangleEnglobant(positions, dalle, hauteurs) {
  const cs = positions.map((p) => p[0]);
  const rs = positions.map((p) => p[1]);
  const largeur = (Math.max(...cs) - Math.min(...cs) + 1) * dalle.pxH;
  const hauteur = suite(Math.min(...rs), Math.max(...rs)).reduce((s, r) => s + hauteurs[r - 1], 0);
  return largeur * hauteur;
}

const LIBELLES_DATA = { imposee: LIBELLE_IMPOSEE, colonnes: 'par colonnes', rangees: 'par rangées', auPlusJuste: 'au plus juste', rectangles: 'rectangles NovaLCT' };

// Variante imposée refusée avant tout câblage (mur, nombre, répartition) : listée avec sa raison, sans trajet.
const imposeeRefusee = (raison, propres) => ({
  mode: 'imposee', libelle: LIBELLE_IMPOSEE, orientation: 'colonnes', mention: null, ecart: null, possible: false, raison, alertes: [], ...propres,
});

// Note du câblage avec des processeurs de secours (étape 22) : n principaux, secours n° n + 1 à 2n.
function noteProcesseurSecours(n) {
  if (!n) return null;
  const suiteCable = 'chaque port de secours part de la dernière dalle de la chaîne du même port du principal.';
  return n === 1 ? `Secours : le processeur de secours n° 2 double le principal n° 1 ; ${suiteCable}`
    : `Secours : les processeurs de secours n° ${n + 1} à ${2 * n} doublent les principaux n° 1 à ${n} (le secours de n est n + ${n}) ; ${suiteCable}`;
}

// Câblage data : pour chaque processeur (bloc du découpage de l'onglet Data), les ports en serpentin depuis le coin
// de départ, dans chaque variante. Options : depart (un des COINS), distanceRegieM (facultatif), margeMou (0,10),
// nomDistributeur. Secours en redondance : XD miroirs sur SX40 ; paires de ports voisins sur les autres Brompton
// (impair principal, pair secours) ; ailleurs port p + moitié des ports, convention par défaut à régler dans le logiciel.
// Processeur de secours (étape 22, NovaLCT) : le port k du secours n + N part de la dernière dalle de la chaîne du port k
// du principal n ; les ports du principal ne sont pas divisés par deux.
// Config imposée (18c) : `imposee` { ports, fibre, paire } ajoute en tête la variante « Ma config (imposée) », retenue
// quand elle passe (`retenue`), et son résumé (`imposee`) ; le conseil ne change pas. `distributeurs` : fiches des
// convertisseurs de la base, pour la fibre.
export function cablageData(m, dalle, evaluation, {
  depart = 'haut-gauche', distanceRegieM = null, margeMou = MARGE_MOU_DEFAUT, nomDistributeur = null, imposee = null, distributeurs = [],
} = {}) {
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(margeMou >= 0)) throw new ErreurSaisie('La marge de mou est positive ou nulle.');
  if (!evaluation?.groupes?.length) return { depart, conseil: null, variantes: [], alertes: [evaluation?.impossible ?? 'Aucun processeur retenu.'] };
  // Mur mixte (9b3) : le mur tel que le processeur le compte (pixels interpolés sur les M2 et T1).
  if (evaluation.mur) {
    m = evaluation.mur;
    dalle = m.dallePrincipale ?? dalle;
  }
  const proc = evaluation.processeur;
  const { redondance, modeOptique } = evaluation.reglages;
  const doubles = portsDoubles(evaluation);
  const secoursN = evaluation.secoursProcesseur ? evaluation.nombre : 0;
  const capacite = evaluation.capacite;
  const plafond = redondance && proc.maxDallesParBoucleRedondance ? proc.maxDallesParBoucleRedondance : Infinity;
  const dalles = new Map(dallesDuMur(m, dalle).map((d) => [d.id, d]));
  const cle = identifiantDalle(m);
  const tuile = ([c, r]) => dalles.get(cle(c, r));
  // Formes libres (9b6) : seules les dalles présentes sont câblées ; mur mixte : chaque dalle à ses propres pixels.
  const existe = (p) => dalles.has(cle(...p));
  const poids = (p) => {
    const t = tuile(p);
    if (!t) return 0;
    if (m.mixte || m.horsAxe) return pixelsComptes(t.fiche, proc);
    return t.type === 'demi' ? evaluation.pxParDemi : evaluation.pxParDalle;
  };
  const hauteurs = m.rangees.map((type) => (type === 'demi' ? m.demi.pxV : dalle.pxV));
  const charge = { capacite, pxParDalle: evaluation.pxParDalle, pxParDemi: evaluation.pxParDemi ?? evaluation.pxParDalle, plafond, ...chargeGeometrie(proc, dalle, m) };
  const chargeDeFiche = (fiche, demiFiche) => {
    const px = pixelsComptes(fiche, proc);
    const pxDemi = demiFiche ? pixelsComptes(demiFiche, proc) : px;
    return {
      parPort: dallesParPort(capacite, px, { plafond }),
      charge: { ...charge, pxParDalle: px, pxParDemi: pxDemi, ...chargeGeometrie(proc, fiche, { demi: demiFiche }), ...(proc.logiciel === 'NovaLCT' ? { rectangle: true } : {}) },
    };
  };
  const enFormes = m.mixte || m.horsAxe || m.zones?.some((z) => z.forme);
  // Rectangle englobant d'un groupe de dalles, d'après leurs pixels (formes libres, mur mixte).
  const rectangleGroupe = (grp) => {
    const t = grp.map(tuile).filter(Boolean);
    return (Math.max(...t.map((d) => d.px.x + d.px.largeur)) - Math.min(...t.map((d) => d.px.x)))
      * (Math.max(...t.map((d) => d.px.y + d.px.hauteur)) - Math.min(...t.map((d) => d.px.y)));
  };
  const rectanglePort = (grp) => (enFormes ? rectangleGroupe(grp) : pxRectangleEnglobant(grp, dalle, hauteurs));
  // COEX 1G : réduction de capacité d'un port qui charge moins de 128 px de large (rectangle englobant).
  const penalite = penaliteGroupe(charge, m.rangees);
  const sorties = proc.sortiesParDistributeur;
  const surDistributeur = Boolean((evaluation.distributeurObligatoire ?? proc.distributeurObligatoire) && sorties);
  const modeleDistributeur = MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'XD';
  const fibre = nomDistributeur ?? MODELES_DISTRIBUTEUR[proc.distributeur] ?? FIBRE_PAR_FAMILLE[proc.famille] ?? 'convertisseurs fibre';
  const novaLCT = proc.logiciel === 'NovaLCT';
  const cinqG = proc.typePorts === '5G';

  // Cartes à zones (Z8t, X100 Pro, série H) : convertisseurs numérotés carte par carte, dans l'ordre des ports ;
  // sinon par groupes de `sorties` ports.
  // `distributeur` (19b1) : le même boîtier en champ structuré, pour le Schéma ; null en cuivre direct.
  let numerotation = null;
  const distributeurPort = (n, miroir = false) => {
    if (!surDistributeur) return null;
    const x = numerotation?.[n - 1] ?? { conv: Math.ceil(n / sorties), port: ((n - 1) % sorties) + 1 };
    return { type: modeleDistributeur, numero: x.conv, port: x.port, miroir, paire: false };
  };
  const libellePort = (n, miroir = false) => {
    const x = distributeurPort(n, miroir);
    return x ? `${x.type}${miroir ? ' miroir' : ''} ${x.numero}, port ${x.port}` : `port ${n}`;
  };
  const numerotationParCartes = (groupes) => {
    const carte = proc.carteSortie;
    if (!surDistributeur || !(carte?.largeurMaxPx || carte?.pixelsMax)) return null;
    const parCarte = doubles && !proc.portsRedondance ? Math.floor(carte.portsParCarte / 2) : carte.portsParCarte;
    const tient = (z, n) => n <= parCarte && z.px <= (carte.pixelsMax ?? Infinity) + EPS
      && z.x1 - z.x0 <= (carte.largeurMaxPx ?? Infinity) && z.y1 - z.y0 <= (carte.hauteurMaxPx ?? Infinity);
    const zones = groupes.map((grp) => {
      const t = grp.map(tuile);
      return {
        x0: Math.min(...t.map((d) => d.px.x)), x1: Math.max(...t.map((d) => d.px.x + d.px.largeur)),
        y0: Math.min(...t.map((d) => d.px.y)), y1: Math.max(...t.map((d) => d.px.y + d.px.hauteur)),
        px: grp.reduce((somme, q) => somme + poids(q), 0),
      };
    });
    const fusion = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), px: a.px + b.px });
    const cartes = repartirSurCartes(zones, fusion, tient, optionsConvertisseurs(proc, doubles));
    if (!cartes) return null;
    // Convertisseurs numérotés carte par carte, dans l'ordre des ports.
    const resultat = [];
    let avant = 0;
    for (const nCarte of cartes) {
      for (let k = 0; k < nCarte; k += 1) resultat.push({ conv: avant + Math.floor(k / sorties) + 1, port: (k % sorties) + 1 });
      avant += Math.ceil(nCarte / sorties);
    }
    return resultat;
  };
  const pairesBrompton = doubles && proc.famille === 'brompton' && !proc.portsRedondance;
  const moitie = Math.floor((modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports) / 2);
  const convention = doubles && !proc.portsRedondance && !pairesBrompton;
  // Numéro et libellé d'un port principal (rang p) du processeur n° i + 1 et de son secours.
  const portEtSecours = (p, nb, i) => {
    const principal = { numero: p, libelle: libellePort(p), distributeur: distributeurPort(p) };
    if (!redondance) return { ...principal, secours: null };
    if (secoursN) {
      // Convertisseurs du secours numérotés à la suite de ceux de son principal.
      const n = i + 1 + secoursN;
      const x = distributeurPort(p);
      const avant = numerotation ? Math.max(...numerotation.map((y) => y.conv)) : Math.ceil(nb / sorties);
      return { ...principal, secours: { processeur: n, numero: p, libelle: `secours n° ${n}, port ${p}`, distributeur: x && { ...x, numero: x.numero + avant }, convention: false } };
    }
    if (proc.portsRedondance) return { ...principal, secours: { numero: nb + p, libelle: libellePort(p, true), distributeur: distributeurPort(p, true), convention: false } };
    if (pairesBrompton) {
      return { numero: 2 * p - 1, libelle: `port ${2 * p - 1}`, distributeur: null, secours: { numero: 2 * p, libelle: `port ${2 * p}`, distributeur: null, convention: false } };
    }
    return { ...principal, secours: { numero: p + moitie, libelle: `port ${p + moitie}`, distributeur: distributeurPort(p + moitie), convention: true } };
  };
  // Fibre imposée (18c3) : convertisseur de chaque port, secours compris ; même numéro de port sur un convertisseur
  // en copie (CVT4K), une paire par port (CVT310 ou CVT320, transceivers des Brompton).
  const distributeurFibre = (fibreImp, n) => {
    if (fibreImp.type === 'copie') return { type: fibreImp.modele, numero: Math.ceil(n / sorties), port: ((n - 1) % sorties) + 1, miroir: false, paire: false };
    return { type: fibreImp.type === 'transceivers' ? 'transceiver' : fibreImp.modele, numero: n, port: null, miroir: false, paire: true };
  };
  const mou = 1 + margeMou;

  const limite = doubles && proc.portsRedondance ? proc.portsRedondance : (modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports);
  const utilises = (nb) => (doubles && !proc.portsRedondance ? 2 * nb : nb);
  // Config imposée : ports de chaque processeur (ceux du conseil quand seule la fibre est cochée), fibre.
  const avecImposee = Boolean(imposee && ((imposee.ports ?? null) !== null || imposee.fibre));
  const plan = avecImposee ? planPortsImposes(m, evaluation, imposee.ports ?? null) : null;
  const portsImposes = plan && !plan.refus.length ? plan.parProcesseur ?? evaluation.groupes.map((g) => g.ports.colonnes) : null;
  const fibreImp = portsImposes && imposee.fibre ? fibreImposee(evaluation, portsImposes, { distributeurs, paire: imposee.paire }) : null;
  const enFibre = Boolean(fibreImp?.possible && !fibreImp.deja);
  const modes = [...(avecImposee ? ['imposee'] : []), 'colonnes', 'rangees', 'auPlusJuste', ...(novaLCT ? ['rectangles'] : [])];
  const variantes = modes.map((mode) => {
    if (mode === 'imposee' && plan.refus.length) {
      return imposeeRefusee(plan.refus.join(' '), { processeurs: [], ports: 0, portsSecours: 0, chargeMax: null, cablesTete: 0, liaisons: 0, noteSecours: null });
    }
    // En fibre (config imposée), le cuivre part du convertisseur au pied du mur, comme avec un distributeur obligatoire.
    const viaConvertisseur = surDistributeur || (mode === 'imposee' && enFibre);
    const raisons = [];
    const notes = [];
    const orientation = mode === 'rangees' ? 'rangees' : 'colonnes';
    const processeurs = evaluation.groupes.map((g, i) => {
      // Mur en zones : chaque morceau de zone câblé à part (un port ne passe jamais d'une zone à l'autre), les morceaux
      // pris depuis le côté du départ ; sinon le bloc entier.
      const morceaux = g.parties
        ? g.parties.map((p) => {
          const c0 = m.zones[p.zone].premiereColonne + p.premiereColonne - 1;
          // Forme libre : les dalles du morceau seulement (coupé en hauteur, une rangée peut être à cheval sur deux morceaux).
          const dans = p.sous?.forme ? new Set(p.sous.forme.colonnes.flatMap((c) => c.cases.filter((x) => x.presente).map((x) => `${c0 + c.colonne - 1},${x.rangee}`))) : null;
          return { cols: suite(c0, c0 + p.colonnes - 1), rows: suite(p.premiereRangee, p.premiereRangee + p.rangees - 1), sous: p.sous ?? mur(dalle, p.colonnes, p.rangees), dans };
        })
        : [{ cols: suite(g.premiereColonne, g.derniereColonne), rows: suite(g.premiereRangee, g.derniereRangee), sous: sousMur(m, dalle, g.colonnes, g.premiereRangee, g.rangees) }];
      const groupesDuMorceau = ({ cols, rows, sous, dans }) => {
      const ici = dans ? (p) => existe(p) && dans.has(`${p[0]},${p[1]}`) : existe;
      let groupes;
      if (sous.forme && (mode === 'colonnes' || mode === 'rectangles')) {
        // Forme libre (9b6) : les ports de l'onglet Data (colonnes entières de hauteurs réelles ; pour NovaLCT, chacun
        // est déjà un rectangle réalisable).
        const t = chargeDeFiche(sous.fiche ?? dalle, sous.demiFiche ?? m.demi);
        groupes = groupesForme(sous, cols[0], cablageForme(sous, t.parPort, t.charge, { pair: evaluation.colonnesPaires, depuisDroite: depart.endsWith('droite') }).colonnes.groupes, depart);
      } else if (mode === 'imposee' && plan.parProcesseur) {
        // Ports imposés : colonnes entières, le plus égal possible ; segments égaux si une colonne dépasse un port.
        const cBloc = cablage(sous, evaluation.dallesParPort, charge, { pair: evaluation.colonnesPaires });
        const r = taillesImposees(plan.parProcesseur[i], cols.length, {
          segmentsMin: cBloc.colonnes.colonnesParPort ? null : cBloc.colonnes.segments.length, parColonne: rows.length,
        });
        if (r.refus) raisons.push(`${evaluation.groupes.length > 1 ? `Processeur n° ${i + 1} : ` : ''}${r.refus}`);
        groupes = r.refus ? [] : (r.tailles ? lotsDeColonnes(cols, rows, r.tailles, depart) : segmentsDeColonnes(cols, rows, r.segments, depart));
      } else if (mode === 'colonnes' || mode === 'imposee') {
        // Mêmes colonnes par port que l'onglet Data : le plus possible, en nombre pair en redondance
        // (sauf s'il coûte un processeur). Mur mixte : la charge de la dalle du morceau.
        const t = (m.mixte || m.horsAxe) && sous.fiche ? chargeDeFiche(sous.fiche, sous.demiFiche) : { parPort: evaluation.dallesParPort, charge };
        const cBloc = cablage(sous, t.parPort, t.charge, { pair: evaluation.colonnesPaires });
        const k = cBloc.colonnes.colonnesParPort;
        if (k) {
          groupes = lotsDeColonnes(cols, rows, k, depart);
        } else {
          groupes = segmentsDeColonnes(cols, rows, cBloc.colonnes.segments, depart);
          notes.push(`Processeur n° ${i + 1} : une colonne dépasse la capacité d'un port. Elle est coupée en ${cBloc.colonnes.segments.length} `
            + 'segments égaux : les ports éloignés du bord démarrent au milieu de leur colonne, leur câble de tête longe la colonne.');
        }
      } else if (mode === 'rangees') {
        groupes = groupesRangees(cols, rows, (p) => (ici(p) ? poids(p) : 0), capacite, plafond, depart, { pair: evaluation.colonnesPaires, penalite })
          .map((grp) => grp.filter(ici)).filter((grp) => grp.length);
      } else if (mode === 'auPlusJuste') {
        groupes = remplirGlouton(serpentin(cols, rows, 'vertical', depart).filter(ici), poids, capacite, plafond, penalite);
        if (novaLCT) {
          const trop = groupes.findIndex((grp) => rectanglePort(grp) > capacite + EPS);
          if (trop >= 0) {
            raisons.push(`Au plus juste non réalisable tel quel dans NovaLCT : le port ${trop + 1} du processeur n° ${i + 1} compte le rectangle qui englobe `
              + `ses dalles (${nombreCourt(rectanglePort(groupes[trop]))} px), au-delà des `
              + `${nombreCourt(entierInferieur(capacite))} px d'un port. Prends les rectangles NovaLCT.`);
          }
        }
      } else {
        const r = rectanglesNovaLCT(sous, sous.fiche ?? dalle, capacite);
        // Pavage de rectanglesNovaLCT : colonnes regroupées depuis la gauche, rangées depuis le haut ;
        // les ports partent du coin de départ.
        const lotsCols = [];
        for (let k = 0; k < cols.length; k += r.colonnes) lotsCols.push(cols.slice(k, k + r.colonnes));
        const lotsRows = [];
        for (let k = 0; k < rows.length; k += r.rangees) lotsRows.push(rows.slice(k, k + r.rangees));
        const ordreLotsCols = depart.endsWith('gauche') ? lotsCols : [...lotsCols].reverse();
        const ordreLotsRows = depart.startsWith('haut') ? lotsRows : [...lotsRows].reverse();
        groupes = ordreLotsCols.flatMap((lc) => ordreLotsRows.map((lr) => serpentin(lc, lr, 'vertical', depart)));
      }
      return groupes;
      };
      const groupes = (depart.endsWith('droite') ? [...morceaux].reverse() : morceaux).flatMap(groupesDuMorceau);

      const nb = groupes.length;
      if (utilises(nb) > limite) {
        raisons.push(`Le processeur n° ${i + 1} demande ${utilises(nb)} ports${doubles && proc.portsRedondance ? ' principaux' : ''}, `
          + `au-delà des ${limite} d'un ${proc.nom}.`);
      }
      numerotation = numerotationParCartes(groupes);
      if (mode === 'imposee' && groupes.length && surDistributeur && (proc.carteSortie?.largeurMaxPx || proc.carteSortie?.pixelsMax) && !numerotation) {
        raisons.push(`Processeur n° ${i + 1} : les ports imposés ne tiennent pas dans les cartes de sortie du ${proc.nom}.`);
      }
      const ports = groupes.map((grp, j) => {
        const px = grp.reduce((s, p) => s + poids(p), 0);
        const trajet = trajetDepuisCoin(m, depart, tuile(grp[0]));
        const base = portEtSecours(j + 1, nb, i);
        if (mode === 'imposee' && enFibre) {
          base.distributeur = distributeurFibre(fibreImp, base.numero);
          if (base.secours) base.secours.distributeur = distributeurFibre(fibreImp, base.secours.numero);
        }
        if (base.secours) {
          // Retour de secours le long de la structure ; long quand la chaîne finit loin du bord de départ.
          const derniere = tuile(grp[grp.length - 1]);
          const chemin = cheminSecours(m, depart, derniere, orientation);
          const long = orientation === 'rangees'
            ? Math.abs(chemin[0][0] - chemin[1][0]) > derniere.mm.largeur
            : Math.abs(chemin[0][1] - chemin[1][1]) > derniere.mm.hauteur;
          const murM = longueurCheminM(chemin);
          base.secours = {
            ...base.secours,
            chemin,
            retourM: murM * mou,
            long,
            longueurCuivreM: distanceRegieM === null ? null : (viaConvertisseur ? murM : distanceRegieM + murM) * mou,
          };
        }
        return {
          ...base,
          dalles: grp.map(([c, r]) => cle(c, r)),
          px,
          taux: (px + (penalite ? penalite(grp) : 0)) / capacite,
          longueurCuivreM: distanceRegieM === null ? null : (viaConvertisseur ? trajet : distanceRegieM + trajet) * mou,
          fibreM: distanceRegieM !== null && viaConvertisseur ? distanceRegieM * mou : null,
        };
      });
      // Config imposée : chaque port face à sa capacité et au plafond de dalles (50 par boucle Brompton en redondance).
      if (mode === 'imposee') {
        const prefixe = evaluation.groupes.length > 1 ? `Processeur n° ${i + 1}, port` : 'Port';
        for (const p of ports) {
          if (p.taux > 1 + EPS) {
            raisons.push(`${prefixe} ${p.numero} : ${nombreCourt(p.px)} px, plus que les ${nombreCourt(entierInferieur(capacite))} px d'un port`
              + `${penalite ? ' (capacité baissée sous 128 px de large)' : ''}.`);
          }
          if (p.dalles.length > plafond) raisons.push(`${prefixe} ${p.numero} : ${p.dalles.length} dalles, plus que les ${plafond} dalles d'une boucle en redondance.`);
        }
      }
      return { numero: i + 1, modele: proc.modele, ports };
    });

    const tous = processeurs.flatMap((p) => p.ports);
    const alertes = [];
    // 5G : Cat6A obligatoire, 100 m au plus comme en 1G (fiche CVT8-5G) ; Colorlight : câble blindé, 80 m (fiches Z3 et Z8t).
    const limiteM = limiteCuivre(proc);
    const longs = tous.filter((p) => p.longueurCuivreM > limiteM);
    if (cinqG) alertes.push(`Ports 5G : ${proc.longueurCable5GM ? '' : 'câble '}${texteCable5G(proc)}.`);
    if (longs.length > 0) {
      const autres = AUTRES_DISTRIBUTEURS[proc.distributeur];
      alertes.push(`${longs.length} câble${longs.length > 1 ? 's' : ''} de tête en cuivre au-delà de ${limiteM} m `
        + `(jusqu'à ${nombreCourt(Math.max(...longs.map((p) => p.longueurCuivreM)), 1)} m) : l'Ethernet en cuivre s'arrête à ${limiteM} m, `
        + (proc.sortiesFibre === 'aucune'
          ? `et le ${proc.modele} n'a ${TEXTES_SANS_FIBRE[proc.famille] ?? TEXTE_SANS_FIBRE}.`
          : `passe en fibre avec des ${fibre} au pied du mur${autres && !nomDistributeur ? ` (${autres} possibles)` : ''}.`));
    }
    if (mode === 'imposee' && enFibre && tous.length) {
      const portee = alertePortee(fibreImp, Math.max(...tous.map((p) => p.fibreM ?? 0)));
      if (portee) alertes.push(portee);
    }
    const retoursLongs = tous.filter((p) => p.secours?.long).map((p) => p.secours.retourM);
    if (retoursLongs.length > 0) {
      const [min, max] = [Math.min(...retoursLongs), Math.max(...retoursLongs)].map((x) => nombreCourt(x, 1));
      alertes.push(`${retoursLongs.length} port${retoursLongs.length > 1 ? 's finissent' : ' finit'} au bord opposé au départ `
        + `(nombre impair de ${orientation === 'rangees' ? 'rangées' : 'colonnes'}) : retour de secours long, `
        + `${min === max ? `${min} m` : `de ${min} m à ${max} m`} le long de la structure.`);
    }
    return {
      mode,
      libelle: LIBELLES_DATA[mode],
      ...(mode === 'imposee' ? { fibre: fibreImp } : {}),
      orientation,
      mention: mode === 'auPlusJuste' ? MENTION_AU_PLUS_JUSTE : null,
      ecart: notes.length ? notes.join(' ') : null,
      possible: raisons.length === 0,
      raison: raisons.length ? raisons.join(' ') : null,
      processeurs,
      ports: tous.length,
      portsSecours: redondance ? tous.length : 0,
      chargeMax: Math.max(...tous.map((p) => p.taux)),
      cablesTete: redondance ? 2 * tous.length : tous.length,
      liaisons: tous.reduce((s, p) => s + p.dalles.length - 1, 0),
      noteSecours: convention
        ? `Secours : port p + ${moitie} sur chaque ${proc.modele} (le secours du port 1 est le port ${1 + moitie}), `
          + 'convention par défaut, à régler dans le logiciel du processeur.'
        : noteProcesseurSecours(secoursN),
      alertes,
    };
  });
  // Conseil : colonnes entières, comme sur le terrain ; l'au plus juste reste une optimisation.
  if (!avecImposee) return { depart, conseil: 'colonnes', variantes, alertes: [] };
  const conseilV = variantes.find((x) => x.mode === 'colonnes');
  const vi = variantes[0];
  const plusCharge = (v) => v.processeurs.flatMap((p) => p.ports).reduce((a, b) => (b.taux > a.taux ? b : a));
  const pc = plusCharge(conseilV);
  const conseil = { ports: conseilV.ports, px: pc.px, taux: pc.taux };
  const ecart = ecartImpose(plan.valeur === null ? conseilV.ports : plan.valeur, conseilV.ports, 'port');
  const resume = {
    ports: plan.valeur ?? null,
    possible: vi.possible,
    raison: vi.raison,
    conseil,
    ecart,
    texte: vi.possible ? textePortsImposes(vi.ports, plusCharge(vi).px, entierInferieur(capacite)) : null,
    texteConseil: texteConseilPorts(conseil, ecart),
    fibre: fibreImp,
  };
  return { depart, conseil: 'colonnes', retenue: vi.possible ? 'imposee' : 'colonnes', variantes, alertes: [], imposee: resume };
}

const LIBELLES_ELEC = {
  imposee: LIBELLE_IMPOSEE,
  colonnes: 'par colonnes',
  colonnesEquilibre: 'par colonnes, phases équilibrées',
  rangees: 'par rangées',
  auPlusJuste: 'au plus juste',
  auPlusJusteEquilibre: 'au plus juste, phases équilibrées',
};

// Phases des lignes : à tour de rôle (équilibre), ou chaque ligne, des plus chargées aux moins chargées,
// sur la phase la moins chargée (option au minimum de lignes). Monophasé : une seule phase.
function phasesDesLignes(lignes, { equilibre, mono, tensionV, capacitePhaseW }) {
  const nbPhases = mono ? 1 : 3;
  const phases = suite(1, nbPhases).map((numero) => ({ numero, lignes: 0, puissanceW: 0, intensiteA: 0 }));
  const ordre = equilibre || mono ? lignes.map((_, i) => i) : lignes.map((_, i) => i).sort((a, b) => lignes[b].puissanceW - lignes[a].puissanceW || a - b);
  ordre.forEach((i) => {
    let p;
    if (mono) p = phases[0];
    else if (equilibre) p = phases[i % 3];
    else p = phases.reduce((a, b) => (b.puissanceW < a.puissanceW - EPS ? b : a));
    p.lignes += 1;
    p.puissanceW = arrondiW(p.puissanceW + lignes[i].puissanceW);
    lignes[i].phase = p.numero;
  });
  for (const p of phases) p.intensiteA = p.puissanceW / tensionV;
  return { phases, ok: phases.every((p) => p.puissanceW <= capacitePhaseW + EPS) };
}

// Câblage élec : lignes en serpentin depuis le coin de départ, dans chaque variante, avec leur phase.
// `elec` est le résultat de electricite() pour ce mur ; son coin de départ sert par défaut, pour que les lignes
// au plus juste soient celles de l'onglet Élec. Options : depart, distanceArmoireM (facultatif), margeMou (0,10).
// Config imposée (18c) : `imposee` { lignes } ajoute en tête la variante « Ma config (imposée) », retenue quand elle passe
// (`retenue`), et son résumé (`imposee`) ; le conseil ne change pas.
export function cablageElec(m, dalle, elec, { depart = elec.reglages.depart ?? 'haut-gauche', distanceArmoireM = null, margeMou = MARGE_MOU_DEFAUT, imposee = null } = {}) {
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(margeMou >= 0)) throw new ErreurSaisie('La marge de mou est positive ou nulle.');
  const t = cablageElecConseil(m, dalle, elec, { depart, distanceArmoireM, margeMou, imposee });
  if ((imposee?.lignes ?? null) === null) return t;
  // Résumé de la config imposée, à côté du conseil.
  const vi = t.variantes[0];
  const conseilV = t.variantes.find((x) => x.mode === t.conseil);
  const n = nombreImpose(imposee.lignes, 'ligne').valeur;
  const ecart = ecartImpose(n, conseilV.lignes, 'ligne');
  return {
    ...t,
    retenue: vi.possible ? 'imposee' : t.conseil,
    imposee: { lignes: n ?? null, possible: vi.possible, raison: vi.raison, conseil: { lignes: conseilV.lignes }, ecart, texteConseil: texteConseilLignes({ lignes: conseilV.lignes }, ecart) },
  };
}

function cablageElecConseil(m, dalle, elec, { depart, distanceArmoireM, margeMou, imposee }) {
  const dalles = new Map(dallesDuMur(m, dalle).map((d) => [d.id, d]));
  const cle = identifiantDalle(m);
  const tuile = ([c, r]) => dalles.get(cle(c, r));
  const pDalle = elec.pMax.dalle.valeurW;
  const pDemi = elec.pMax.demi ? elec.pMax.demi.valeurW : pDalle;
  // Formes libres (9b6) : dalles présentes seulement ; mur mixte : chaque dalle à sa P max.
  const pMaxFiche = new Map();
  const pFiche = (f) => {
    if (!pMaxFiche.has(f.id)) pMaxFiche.set(f.id, pMaxDalle(f).valeurW);
    return pMaxFiche.get(f.id);
  };
  const poids = (p) => {
    const t = tuile(p);
    if (!t) return 0;
    if (m.mixte) return pFiche(t.fiche);
    return t.type === 'demi' ? pDemi : pDalle;
  };
  const utileW = elec.ligne.utileW;
  const plafond = elec.dallesParLigne.chainage ?? Infinity;
  const mono = elec.arrivee.type === 'mono';
  const { tensionV } = elec.reglages;
  const capacitePhaseW = elec.arrivee.capacitePhaseW;
  const cols = suite(1, m.colonnes);
  const rows = suite(1, m.rangees.length);
  const charge = { capacite: utileW, pxParDalle: pDalle, pxParDemi: pDemi, plafond };
  const avecImposee = (imposee?.lignes ?? null) !== null;
  // Mur en zones : lignes zone par zone (jamais à cheval), les zones prises depuis le côté du départ.
  if (plusieursZones(m)) {
    const z = cablageElecZones(m, dalle, elec, { depart, distanceArmoireM, margeMou, tuile, cle, poids, charge, pFiche, existe: (p) => dalles.has(cle(...p)) });
    if (!avecImposee) return z;
    const refusee = imposeeRefusee(refusMurImpose(m), { lignesDetail: [], lignes: 0, phases: [], ecartPhasesPourcent: null, ok: true, chargeMax: null, cablesTete: 0, liaisons: 0 });
    return { ...z, variantes: [refusee, ...z.variantes] };
  }
  const c = cablage(m, elec.dallesParLigne.retenu, charge);
  const serpent = serpentin(cols, rows, 'vertical', depart);

  // Une ligne prend autant de colonnes entières qu'elle en supporte avec la marge choisie ; jamais une colonne
  // coupée, sauf colonne plus lourde qu'une ligne (segments égaux).
  const kmax = c.colonnes.colonnesParPort;
  const coupee = kmax ? null : `Une colonne dépasse une ligne : elle est coupée en ${c.colonnes.segments.length} segments égaux, `
    + 'les lignes éloignées du bord démarrent au milieu de leur colonne.';
  const notes = { colonnes: coupee, colonnesEquilibre: coupee };
  // Lignes imposées : colonnes entières, le plus égal possible, même sens que la data ; refus du nombre ou du découpage.
  const nombreLignes = avecImposee ? nombreImpose(imposee.lignes, 'ligne') : null;
  const tailles = nombreLignes?.valeur ? taillesImposees(nombreLignes.valeur, m.colonnes, {
    unite: 'ligne', segmentsMin: kmax ? null : c.colonnes.segments.length, parColonne: rows.length,
  }) : null;
  const refusImpose = nombreLignes?.refus ?? tailles?.refus ?? null;
  const groupesDe = {
    imposee: () => (tailles.tailles ? lotsDeColonnes(cols, rows, tailles.tailles, depart) : segmentsDeColonnes(cols, rows, tailles.segments, depart)),
    colonnes: () => (kmax ? lotsDeColonnes(cols, rows, kmax, depart) : segmentsDeColonnes(cols, rows, c.colonnes.segments, depart)),
    // Répartition conseillée de l'onglet Élec en triphasé : mêmes lignes, dans l'ordre depuis le côté de départ.
    colonnesEquilibre: () => lotsDeColonnes(cols, rows, elec.triphase.colonnes.equilibre.lignes.map((l) => l.colonnes), depart),
    rangees: () => groupesRangees(cols, rows, poids, utileW, plafond, depart),
    auPlusJuste: () => remplirGlouton(serpent, poids, utileW, plafond),
    auPlusJusteEquilibre: () => {
      for (let n = elec.triphase.auPlusJuste.equilibre.lignes.length; n <= Math.max(3, serpent.length); n += 3) {
        const groupes = [];
        let avant = 0;
        for (const k of repartir(serpent.length, n)) {
          groupes.push(serpent.slice(avant, avant + k));
          avant += k;
        }
        if (groupes.every((g) => g.length > 0 && g.length <= plafond && g.reduce((s, p) => s + poids(p), 0) <= utileW + EPS)) return groupes;
      }
      return null;
    },
  };
  // Variante équilibrée en colonnes entières seulement quand ses lignes diffèrent du minimum de lignes.
  const taillesOption = (option) => option?.lignes.map((l) => l.colonnes).join(' ');
  const equilibreDistinct = !mono && kmax && elec.triphase.colonnes.equilibre
    && taillesOption(elec.triphase.colonnes.equilibre) !== taillesOption(elec.triphase.colonnes.minimum);
  const modes = [...(avecImposee ? ['imposee'] : []), ...(mono
    ? ['colonnes', 'rangees', 'auPlusJuste']
    : ['colonnes', ...(equilibreDistinct ? ['colonnesEquilibre'] : []), 'rangees', 'auPlusJuste',
      ...(elec.triphase.auPlusJuste.equilibre ? ['auPlusJusteEquilibre'] : [])])];

  const variantes = modes.map((mode) => {
    if (mode === 'imposee' && (refusMurImpose(m) || refusImpose)) {
      return imposeeRefusee(refusMurImpose(m) ?? refusImpose, { lignesDetail: [], lignes: 0, phases: [], ecartPhasesPourcent: null, ok: true, chargeMax: null, cablesTete: 0, liaisons: 0 });
    }
    const groupes = groupesDe[mode]();
    const lignesDetail = groupes.map((grp, i) => {
      const puissanceW = arrondiW(grp.reduce((s, p) => s + poids(p), 0));
      return {
        numero: i + 1,
        phase: null,
        dalles: grp.map(([col, r]) => cle(col, r)),
        puissanceW,
        taux: puissanceW / utileW,
        longueurTeteM: distanceArmoireM === null ? null : (distanceArmoireM + trajetDepuisCoin(m, depart, tuile(grp[0]))) * (1 + margeMou),
        // Centre de la première dalle, en mm : place des boîtiers de la distribution (étape 12a).
        teteMm: centreDalle(tuile(grp[0])),
      };
    });
    // Au plus juste équilibré et rangées : lignes à tour de rôle sur L1, L2 et L3 ; colonnes entières et au plus juste :
    // les plus chargées d'abord sur la phase la moins chargée, comme l'onglet Élec.
    const equilibre = ['auPlusJusteEquilibre', 'rangees'].includes(mode);
    const { phases, ok } = phasesDesLignes(lignesDetail, { equilibre, mono, tensionV, capacitePhaseW });
    const charges = phases.map((p) => p.puissanceW);
    const alertes = ok ? [] : [`Une phase dépasse les ${nombreCourt(capacitePhaseW)} W utiles de l'arrivée : il faut une arrivée plus forte.`];
    // Lignes imposées : chacune face à la puissance utile et au chaînage de la fiche ; courant d'appel ligne par ligne.
    const raisons = [];
    let appel = null;
    if (mode === 'imposee') {
      for (const l of lignesDetail) {
        if (l.puissanceW > utileW + EPS) raisons.push(`Ligne ${l.numero} : ${nombreCourt(l.puissanceW)} W, plus que les ${nombreCourt(utileW)} W utiles d'une ligne.`);
        if (l.dalles.length > plafond) raisons.push(`Ligne ${l.numero} : ${l.dalles.length} dalles, plus que les ${plafond} dalles du chaînage power de la fiche.`);
      }
      if (elec.appel) {
        const appelDemi = m.demi?.courantAppelA ?? dalle.courantAppelA;
        const picLigneA = Math.max(...groupes.map((grp) => grp.reduce((s, p) => s + (tuile(p)?.type === 'demi' ? appelDemi : dalle.courantAppelA), 0)));
        appel = { ...elec.appel, picLigneA, ok: picLigneA <= elec.appel.seuilA + EPS };
        if (!appel.ok) {
          alertes.push(`Courant d'appel : jusqu'à ${nombreCourt(picLigneA)} A sur une ligne si toutes ses dalles s'allument en même temps, `
            + `au-delà du seuil magnétique bas d'un disjoncteur courbe ${appel.courbe} ${nombreCourt(elec.reglages.departA)} A (${nombreCourt(appel.seuilA)} A). `
            + 'Contrôle prudent : le pic ne dure que quelques millisecondes. Allume ligne par ligne et fais vérifier la courbe par l\'électricien.');
        }
      }
    }
    return {
      mode,
      libelle: LIBELLES_ELEC[mode],
      ...(mode === 'imposee' ? { appel } : {}),
      orientation: mode === 'rangees' ? 'rangees' : 'colonnes',
      mention: mode.startsWith('auPlusJuste') ? MENTION_AU_PLUS_JUSTE : null,
      ecart: notes[mode] ?? null,
      possible: raisons.length === 0,
      raison: raisons.length ? raisons.join(' ') : null,
      lignesDetail,
      lignes: lignesDetail.length,
      phases,
      ecartPhasesPourcent: mono || Math.max(...charges) === 0 ? null : (100 * (Math.max(...charges) - Math.min(...charges))) / Math.max(...charges),
      ok,
      chargeMax: Math.max(...lignesDetail.map((l) => l.taux)),
      cablesTete: lignesDetail.length,
      liaisons: lignesDetail.reduce((s, l) => s + l.dalles.length - 1, 0),
      alertes,
    };
  });
  // Conseil : en triphasé, l'équilibre des phases en colonnes entières ; en monophasé, le minimum de lignes.
  return { depart, conseil: modes.includes('colonnesEquilibre') ? 'colonnesEquilibre' : 'colonnes', variantes, alertes: [] };
}

// Câblage élec d'un mur en zones (étape 9a) : chaque zone câblée à part, dans les variantes par colonnes (au minimum de
// lignes, et en triphasé celles de l'équilibre de l'onglet Élec), par rangées et au plus juste ; phases comme le mur
// d'une seule pièce. L'au plus juste à phases équilibrées n'existe pas encore en zones.
function cablageElecZones(m, dalle, elec, { depart, distanceArmoireM, margeMou, tuile, cle, poids, charge, pFiche, existe }) {
  const mono = elec.arrivee.type === 'mono';
  const { tensionV } = elec.reglages;
  const capacitePhaseW = elec.arrivee.capacitePhaseW;
  const utileW = elec.ligne.utileW;
  const plafond = charge.plafond;
  const murs = mursDesZones(m, dalle);
  // Lignes d'une zone : celles de l'onglet Élec, à la P max de sa dalle (mur mixte) ; forme libre : colonnes de hauteurs
  // réelles, dalles présentes seulement (9b6).
  const zones = (depart.endsWith('droite') ? [...m.zones].reverse() : m.zones).map((z) => {
    const sous = murs[z.index];
    const fiche = ficheZone(m, z, dalle);
    const p = m.mixte ? pFiche(fiche) : charge.pxParDalle;
    const pD = sous.demiFiche ? (m.mixte ? pFiche(sous.demiFiche) : charge.pxParDemi) : p;
    const chainage = fiche.chainagePowerMax ?? null;
    const parLigne = m.mixte ? Math.min(Math.floor(utileW / p + EPS), chainage ?? Infinity) : elec.dallesParLigne.retenu;
    const ch = { ...charge, pxParDalle: p, pxParDemi: pD, plafond: m.mixte ? chainage ?? Infinity : plafond };
    return {
      z, sous, ch, parLigne, cols: suite(z.premiereColonne, z.premiereColonne + z.colonnes - 1), rows: suite(1, sous.rangees.length),
      c: sous.forme ? cablageForme(sous, parLigne, ch) : cablage(sous, parLigne, ch),
    };
  });
  const coupees = zones.filter((x) => !x.c.colonnes.colonnesParPort).map((x) => x.z.nom);
  const coupee = coupees.length ? `Une colonne dépasse une ligne (zone${coupees.length > 1 ? 's' : ''} ${coupees.join(', ')}) : elle est coupée en segments égaux, `
    + 'les lignes éloignées du bord démarrent au milieu de leur colonne.' : null;
  const tailles = (option) => option?.lignes.map((l) => l.colonnes).join(' ');
  const equilibre = elec.triphase?.colonnes.equilibre;
  const equilibreDistinct = !mono && !coupees.length && equilibre && tailles(equilibre) !== tailles(elec.triphase.colonnes.minimum);
  const colonnesZone = ({ sous, cols, rows, c, ch, parLigne }) => {
    if (sous.forme) {
      const groupes = depart.endsWith('droite') ? cablageForme(sous, parLigne, ch, { depuisDroite: true }).colonnes.groupes : c.colonnes.groupes;
      return groupesForme(sous, cols[0], groupes, depart);
    }
    return c.colonnes.colonnesParPort
      ? lotsDeColonnes(cols, rows, c.colonnes.colonnesParPort, depart) : segmentsDeColonnes(cols, rows, c.colonnes.segments, depart);
  };
  const garder = (groupes) => groupes.map((grp) => grp.filter(existe)).filter((grp) => grp.length);
  const groupesDe = {
    colonnes: () => zones.flatMap(colonnesZone),
    // Forme libre : ses lignes de l'onglet Élec, telles quelles (9b5).
    colonnesEquilibre: () => zones.flatMap((x) => (x.sous.forme ? colonnesZone(x) : lotsDeColonnes(x.cols, x.rows,
      equilibre.lignes.filter((l) => l.zone === x.z.nom).map((l) => l.colonnes).sort((a, b) => b - a), depart))),
    // Chaque zone à son chaînage (mur mixte : celui de sa dalle).
    rangees: () => zones.flatMap(({ cols, rows, ch }) => garder(groupesRangees(cols, rows, poids, utileW, ch.plafond, depart))),
    auPlusJuste: () => zones.flatMap(({ cols, rows, ch }) => remplirGlouton(serpentin(cols, rows, 'vertical', depart).filter(existe), poids, utileW, ch.plafond)),
  };
  const notes = { colonnes: coupee, colonnesEquilibre: coupee };
  const modes = ['colonnes', ...(equilibreDistinct ? ['colonnesEquilibre'] : []), 'rangees', 'auPlusJuste'];
  const variantes = modes.map((mode) => {
    const lignesDetail = groupesDe[mode]().map((grp, i) => {
      const puissanceW = arrondiW(grp.reduce((s, p) => s + poids(p), 0));
      return {
        numero: i + 1,
        phase: null,
        dalles: grp.map(([col, r]) => cle(col, r)),
        puissanceW,
        taux: puissanceW / utileW,
        longueurTeteM: distanceArmoireM === null ? null : (distanceArmoireM + trajetDepuisCoin(m, depart, tuile(grp[0]))) * (1 + margeMou),
        // Centre de la première dalle, en mm : place des boîtiers de la distribution (étape 12a).
        teteMm: centreDalle(tuile(grp[0])),
      };
    });
    const { phases, ok } = phasesDesLignes(lignesDetail, { equilibre: mode === 'rangees', mono, tensionV, capacitePhaseW });
    const charges = phases.map((p) => p.puissanceW);
    return {
      mode,
      libelle: LIBELLES_ELEC[mode],
      orientation: mode === 'rangees' ? 'rangees' : 'colonnes',
      mention: mode === 'auPlusJuste' ? MENTION_AU_PLUS_JUSTE : null,
      ecart: notes[mode] ?? null,
      possible: true,
      raison: null,
      lignesDetail,
      lignes: lignesDetail.length,
      phases,
      ecartPhasesPourcent: mono || Math.max(...charges) === 0 ? null : (100 * (Math.max(...charges) - Math.min(...charges))) / Math.max(...charges),
      ok,
      chargeMax: Math.max(...lignesDetail.map((l) => l.taux)),
      cablesTete: lignesDetail.length,
      liaisons: lignesDetail.reduce((s, l) => s + l.dalles.length - 1, 0),
      alertes: ok ? [] : [`Une phase dépasse les ${nombreCourt(capacitePhaseW)} W utiles de l'arrivée : il faut une arrivée plus forte.`],
    };
  });
  return { depart, conseil: modes.includes('colonnesEquilibre') ? 'colonnesEquilibre' : 'colonnes', variantes, alertes: [] };
}
