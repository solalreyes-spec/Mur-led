// Calculs du mur LED, module 3, électricité (indicatif : à valider par l'électricien).
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie, COINS, LIBELLES_COIN, suite, serpentin, remplirGlouton } from './commun.js';
import { plusieursZones, mursDesZones } from './morceaux.js';
import { repartir } from './capacites.js';
import { cablage, minimumTheorique, casesParGroupe, colonnesParPortZones, cablageForme } from './ports.js';

// ---------------------------------------------------------------------------
// Module 3 : électricité (indicatif : à valider par l'électricien)
// ---------------------------------------------------------------------------

export const TENSION_CALCUL_V = 220;
export const TENSION_THEORIQUE_V = 230;
export const MARGE_DEFAUT = 0.8;
export const DEPART_DEFAUT_A = 16;
export const ARRIVEES = { mono: [16, 32], tri: [16, 32, 63, 125] };
// Seuil magnétique bas des disjoncteurs, en multiple de In (NF EN 60898-1).
export const SEUILS_MAGNETIQUES = { B: 3, C: 5, D: 10 };
// Repère sans fiche : 1 kVA/m² pour un écran plein jour (Formation, support de cours), compté en watts.
export const W_PAR_M2_SANS_FICHE = 1000;
export const BTU_PAR_W = 3.412;

// Arrondi au milliwatt, pour effacer le bruit des nombres à virgule (220 × 16 × 0,8 = 2816).
export const arrondiW = (w) => Math.round(w * 1000) / 1000;

// Puissance utile d'une ligne : U × I × marge, ou la valeur saisie quand elle est donnée.
export function puissanceUtileLigne({ tensionV = TENSION_CALCUL_V, intensiteA = DEPART_DEFAUT_A, marge = MARGE_DEFAUT, puissanceUtileW = null } = {}) {
  if (puissanceUtileW) return puissanceUtileW;
  return arrondiW(tensionV * intensiteA * marge);
}

export function dallesParLigne(pMaxW, reglages = {}) {
  return Math.floor(puissanceUtileLigne(reglages) / pMaxW + EPS);
}

// P max d'une dalle : celle de la fiche ; estimée pour un gabarit ; sinon 1 kVA/m² de sa surface.
export function pMaxDalle(dalle) {
  if (dalle.pMaxW > 0) return { valeurW: dalle.pMaxW, estimee: dalle.gabarit === true, origine: dalle.gabarit ? 'gabarit' : 'fiche' };
  return { valeurW: ((dalle.largeurMm * dalle.hauteurMm) / 1e6) * W_PAR_M2_SANS_FICHE, estimee: true, origine: 'surface' };
}

function versPhases(lignes, tensionV, capacitePhaseW, affectation) {
  const phases = [1, 2, 3].map((numero) => ({ numero, lignes: 0, puissanceW: 0, intensiteA: 0 }));
  lignes.forEach((ligne, i) => {
    const p = phases[affectation(i, phases)];
    p.lignes += 1;
    p.puissanceW = arrondiW(p.puissanceW + ligne.puissanceW);
    ligne.phase = p.numero;
  });
  for (const p of phases) p.intensiteA = p.puissanceW / tensionV;
  const charges = phases.map((p) => p.puissanceW);
  const ecartW = arrondiW(Math.max(...charges) - Math.min(...charges));
  return {
    lignes,
    phases,
    ecartW,
    // Écart entre la phase la plus chargée et la moins chargée, rapporté à la plus chargée.
    ecartPourcent: Math.max(...charges) > 0 ? (100 * ecartW) / Math.max(...charges) : 0,
    ok: charges.every((w) => w <= capacitePhaseW + EPS),
  };
}

// Option au nombre minimal de lignes : les plus chargées d'abord, chacune sur la phase la moins chargée.
function repartitionMinimale(lignes, tensionV, capacitePhaseW) {
  const triees = [...lignes].sort((a, b) => b.puissanceW - a.puissanceW);
  const charge = [0, 0, 0];
  return versPhases(triees, tensionV, capacitePhaseW, (i) => {
    const phase = charge.indexOf(Math.min(...charge));
    charge[phase] += triees[i].puissanceW;
    return phase;
  });
}

// Option équilibrée : lignes en multiple de 3, réparties à tour de rôle sur L1, L2 et L3.
function repartitionEquilibree(lignes, tensionV, capacitePhaseW) {
  return versPhases(lignes.map((l) => ({ ...l })), tensionV, capacitePhaseW, (i) => i % 3);
}

const multipleDe3 = (n) => Math.ceil(n / 3) * 3;

// Alertes de plusieurs zones : une alerte commune à toutes les zones est donnée une fois ; une alerte propre à
// certaines zones les nomme (« Zone A : … », « Zones A, B : … »).
export function regrouperAlertes(listes, noms) {
  const ordre = [];
  const zonesDe = new Map();
  listes.forEach((liste, i) => liste.forEach((texte) => {
    if (!zonesDe.has(texte)) {
      zonesDe.set(texte, []);
      ordre.push(texte);
    }
    if (!zonesDe.get(texte).includes(noms[i])) zonesDe.get(texte).push(noms[i]);
  }));
  return ordre.map((texte) => {
    const zones = zonesDe.get(texte);
    return zones.length === listes.length ? texte : `${zones.length > 1 ? 'Zones' : 'Zone'} ${zones.join(', ')} : ${texte}`;
  });
}

// Électricité d'un mur en zones (étape 9a) : lignes calculées zone par zone, jamais à cheval sur deux zones ; en
// triphasé, équilibre des phases sur toutes les lignes de toutes les zones ensemble, avec les critères du mur d'une
// seule pièce (écart entre phases le plus faible ; à écart égal, le moins de lignes ; à lignes égales, les plus
// régulières). Recherche : on part du minimum de lignes de chaque zone, puis on change la répartition d'une seule zone à
// la fois (n'importe laquelle de ses répartitions en colonnes entières), en gardant le meilleur changement, tant qu'il
// améliore (choix de conception : le nombre de combinaisons croît trop vite pour toutes les essayer).
function electriciteZones(m, dalle, reglages) {
  const murs = mursDesZones(m, dalle);
  // Mur mixte (9b5) : chaque zone à la P max de sa propre dalle.
  const parZone = murs.map((s) => electricite(s, s.fiche ?? dalle, reglages));
  const premier = parZone[0];
  const { tensionV, arrivee, depart } = premier.reglages;
  const noms = m.zones.map((z) => z.nom);
  // La phase d'une ligne vient de la répartition de tout le mur, jamais du calcul d'une zone seule.
  const avecZone = (lignes, i) => lignes.map(({ phase, ...l }) => ({ ...l, zone: noms[i] }));
  const lignesColonnes = parZone.flatMap((r, i) => avecZone(r.lignes.colonnes.lignes, i));
  const lignesApj = parZone.flatMap((r, i) => avecZone(r.lignes.auPlusJuste.lignes, i));
  const puissanceTotaleW = arrondiW(parZone.reduce((t, r) => t + r.puissanceTotaleW, 0));
  const capacitePhaseW = premier.arrivee.capacitePhaseW;
  // Les contrôles de l'arrivée se font sur tout le mur, pas zone par zone.
  const alertes = regrouperAlertes(parZone.map((r) => r.alertes.filter((a) => !/^(L'arrivée mono|Arrivée tri)/.test(a))), noms);
  const apj = lignesApj.length;
  const minimum = { nombre: apj, raisons: [], texte: null };
  const pose = (retenues, raisonEquilibre = null) => {
    minimum.raisons = [];
    if (lignesColonnes.length > apj) minimum.raisons.push('une colonne n\'est jamais coupée entre deux lignes, et une ligne ne passe jamais d\'une zone à l\'autre');
    if (raisonEquilibre) minimum.raisons.push(raisonEquilibre);
    minimum.texte = retenues === apj ? null
      : `Minimum théorique : ${apj} ligne${apj > 1 ? 's' : ''} au plus juste, contre ${retenues} en colonnes entières. Écart : ${minimum.raisons.join(' ; ')}.`;
  };
  const resultat = {
    reglages: premier.reglages,
    pMax: premier.pMax,
    manques: parZone.flatMap((r) => r.manques).filter((x, i, t) => t.findIndex((y) => y.texte === x.texte) === i),
    puissanceTotaleW,
    btuH: puissanceTotaleW * BTU_PAR_W,
    ligne: premier.ligne,
    dallesParLigne: premier.dallesParLigne,
    zones: parZone.map((r, i) => ({
      nom: noms[i], lignes: r.lignes.colonnes.nombre, lignesAuPlusJuste: r.lignes.auPlusJuste.nombre, puissanceW: r.puissanceTotaleW,
      ...(m.mixte ? { pMax: r.pMax, dallesParLigne: r.dallesParLigne } : {}),
    })),
    lignes: {
      auPlusJuste: { nombre: apj, lignes: lignesApj, theorique: parZone.reduce((t, r) => t + r.lignes.auPlusJuste.theorique, 0), depart, ecart: null },
      colonnes: {
        nombre: lignesColonnes.length,
        colonnesParLigne: colonnesParPortZones(parZone.map((r) => r.lignes.colonnes.colonnesParLigne), murs.map((s) => s.colonnes)),
        segments: parZone[murs.reduce((a, x, i) => (x.pxHauteur > murs[a].pxHauteur ? i : a), 0)].lignes.colonnes.segments,
        lignes: lignesColonnes,
      },
      retenues: lignesColonnes.length,
      minimum,
    },
    arrivee: premier.arrivee,
    monophase: null,
    triphase: null,
    appel: parZone.map((r) => r.appel).filter(Boolean).reduce((a, b) => (!a || b.picLigneA > a.picLigneA ? b : a), null),
    alertes,
  };
  const copie = (lignes) => lignes.map((l) => ({ ...l }));
  if (arrivee.type === 'mono') {
    const ok = puissanceTotaleW <= capacitePhaseW + EPS;
    resultat.monophase = { puissanceW: puissanceTotaleW, capaciteW: capacitePhaseW, intensiteA: puissanceTotaleW / tensionV, ok };
    if (!ok) {
      alertes.push(`L'arrivée mono ${nombreCourt(arrivee.intensiteA)} A porte ${nombreCourt(capacitePhaseW)} W utiles `
        + `(${nombreCourt(tensionV)} V, marge ${nombreCourt(premier.reglages.marge * 100)} %) : le mur demande ${nombreCourt(puissanceTotaleW)} W. `
        + 'Il faut une arrivée plus forte ou du triphasé.');
    }
    pose(lignesColonnes.length);
    return resultat;
  }
  // Répartitions possibles de chaque zone en colonnes entières, du minimum de lignes à une colonne par ligne : au
  // minimum, le plus de colonnes par ligne (3 + 1) et la plus régulière (2 + 2) ; colonne coupée en segments : lignes fixes.
  const options = parZone.map((r, i) => {
    const lc = r.lignes.colonnes;
    // Zone de forme libre : ses lignes en colonnes entières, telles quelles (choix de conception, 9b5).
    if (!lc.colonnesParLigne || murs[i].forme) return [avecZone(lc.lignes, i)];
    const z = m.zones[i];
    const pDalle = r.pMax.dalle.valeurW;
    const tailles = [lc.lignes.map((l) => l.colonnes), ...suite(lc.lignes.length, z.colonnes).map((n) => repartir(z.colonnes, n))]
      .filter((t, j, liste) => liste.findIndex((u) => u.join() === t.join()) === j);
    return tailles.map((t) => t.map((k) => ({ colonnes: k, dalles: k * z.lignes, puissanceW: arrondiW(k * z.lignes * pDalle), zone: z.nom })));
  });
  const evaluer = (indices) => {
    const lignes = indices.flatMap((j, i) => copie(options[i][j]));
    const tailles = lignes.map((l) => l.colonnes);
    const option = repartitionMinimale(lignes, tensionV, capacitePhaseW);
    return { ecartW: option.ecartW, n: lignes.length, irregularite: Math.max(...tailles) - Math.min(...tailles), option, indices };
  };
  const avant = (a, b) => a.ecartW < b.ecartW - EPS
    || (Math.abs(a.ecartW - b.ecartW) <= EPS && (a.n < b.n || (a.n === b.n && a.irregularite < b.irregularite)));
  let courant = evaluer(options.map(() => 0));
  for (;;) {
    let meilleur = null;
    options.forEach((o, i) => {
      for (let j = 0; j < o.length; j += 1) {
        if (j === courant.indices[i]) continue;
        const essai = evaluer(courant.indices.map((x, k) => (k === i ? j : x)));
        if (!meilleur || avant(essai, meilleur)) meilleur = essai;
      }
    });
    if (!meilleur || !avant(meilleur, courant)) break;
    courant = meilleur;
  }
  const equilibre = courant.option;
  const minimumColonnes = repartitionMinimale(copie(lignesColonnes), tensionV, capacitePhaseW);
  resultat.triphase = {
    // Au plus juste à phases équilibrées (lignes en multiple de 3 le long du serpentin) : pas encore en zones.
    auPlusJuste: { equilibre: null, minimum: repartitionMinimale(copie(lignesApj), tensionV, capacitePhaseW) },
    colonnes: { equilibre, minimum: minimumColonnes },
  };
  resultat.lignes.retenues = equilibre.lignes.length;
  const pc = (x) => `${nombreCourt(x, 0)} %`;
  pose(equilibre.lignes.length, equilibre.lignes.length > minimumColonnes.lignes.length
    ? `équilibre des phases : ${equilibre.lignes.length} lignes au lieu de ${minimumColonnes.lignes.length}, `
      + `écart entre phases ${pc(equilibre.ecartPourcent)} au lieu de ${pc(minimumColonnes.ecartPourcent)}` : null);
  if (!equilibre.ok) {
    const max = Math.max(...equilibre.phases.map((p) => p.puissanceW));
    alertes.push(`Arrivée tri ${nombreCourt(arrivee.intensiteA)} A : la phase la plus chargée demande ${nombreCourt(max)} W `
      + `pour ${nombreCourt(capacitePhaseW)} W utiles par phase, même équilibrée. Il faut une arrivée plus forte.`);
  }
  return resultat;
}

// Électricité d'un mur, calculée par phase, jamais sur le total.
// Réglages : tensionV (220), marge (0,8), puissanceUtileW (facultatif), departA (16),
// arrivee { type: 'mono' | 'tri', intensiteA }, courbe ('B', 'C', 'D' ou null).
export function electricite(m, dalle, reglages = {}) {
  if (plusieursZones(m)) return electriciteZones(m, dalle, reglages);
  const {
    tensionV = TENSION_CALCUL_V, marge = MARGE_DEFAUT, puissanceUtileW = null, departA = DEPART_DEFAUT_A,
    arrivee = { type: 'tri', intensiteA: 32 }, courbe = null, depart = 'haut-gauche',
  } = reglages;
  if (!(tensionV > 0)) throw new ErreurSaisie('Indique une tension de calcul supérieure à zéro.');
  if (!COINS.includes(depart)) throw new ErreurSaisie('Choisis le coin de départ du câblage.');
  if (!(marge > 0 && marge <= 1)) throw new ErreurSaisie('La marge est comprise entre 1 et 100 %.');
  if (!(departA > 0)) throw new ErreurSaisie('Indique l\'intensité des départs, en ampères.');
  if (!(arrivee.intensiteA > 0) || !['mono', 'tri'].includes(arrivee.type)) throw new ErreurSaisie('Indique l\'arrivée : mono ou tri, et son intensité.');
  if (puissanceUtileW !== null && !(puissanceUtileW > 0)) throw new ErreurSaisie('La puissance utile par ligne doit être supérieure à zéro.');

  const alertes = [];
  const manques = [];
  const pDalle = pMaxDalle(dalle);
  const pDemi = m.demi ? pMaxDalle(m.demi) : null;
  for (const [fiche, p] of [[dalle, pDalle], [m.demi, pDemi]]) {
    if (!p) continue;
    if (p.origine === 'surface') {
      const texte = `P max absente de la fiche ${fiche.nom} : estimée à ${nombreCourt(p.valeurW)} W avec le repère de 1 kVA/m², `
        + 'source Formation (support de cours). Remplace-la par la P max de la fiche dès que possible.';
      alertes.push(texte);
      manques.push({ champ: 'pMaxW', fiche: fiche.nom, texte });
    } else if (p.origine === 'gabarit') {
      alertes.push(`Gabarit ${fiche.nom} : P max estimée à ${nombreCourt(p.valeurW)} W, non sourcé. Remplace-la par la P max de la fiche.`);
    }
  }

  const utileW = puissanceUtileLigne({ tensionV, intensiteA: departA, marge, puissanceUtileW });
  const ligne = {
    utileW,
    theoriqueW: arrondiW(tensionV * departA),
    maxi230W: arrondiW(TENSION_THEORIQUE_V * departA),
    origine: puissanceUtileW ? 'champ' : 'calcul',
  };
  const parPuissance = Math.floor(utileW / pDalle.valeurW + EPS);
  const chainage = dalle.chainagePowerMax ?? null;
  const retenu = chainage ? Math.min(parPuissance, chainage) : parPuissance;
  if (retenu < 1) {
    throw new ErreurSaisie(`Une dalle (${nombreCourt(pDalle.valeurW)} W) dépasse la puissance utile d'une ligne (${nombreCourt(utileW)} W).`);
  }
  const dallesLigne = {
    puissance: parPuissance,
    chainage,
    retenu,
    limite: chainage && chainage < parPuissance ? 'chaînage' : 'puissance',
    theoriques230: Math.floor(ligne.maxi230W / pDalle.valeurW + EPS),
  };

  // Même moteur que les ports : les watts remplacent les pixels, le chaînage joue le rôle du plafond.
  const charge = { capacite: utileW, pxParDalle: pDalle.valeurW, pxParDemi: pDemi ? pDemi.valeurW : pDalle.valeurW, plafond: chainage ?? Infinity };
  // Zone de forme libre (9b5, Z26) : colonnes entières de hauteurs réelles, le plus de colonnes par ligne.
  const c = m.forme ? cablageForme(m, retenu, charge) : cablage(m, retenu, charge);
  const watts = (e, d) => arrondiW(e * pDalle.valeurW + d * (pDemi ? pDemi.valeurW : 0));
  // Au plus juste le long du vrai serpentin depuis le coin de départ : il fait foi. Le décompte théorique
  // (dalles entières d'abord, puis demi-dalles) reste donné en second.
  const presente = m.forme ? ([col, r]) => m.forme.colonnes[col - 1].cases[r - 1].presente : () => true;
  const serpent = serpentin(suite(1, m.colonnes), suite(1, m.rangees.length), 'vertical', depart).filter(presente);
  const poidsW = ([, r]) => (m.rangees[r - 1] === 'demi' ? charge.pxParDemi : charge.pxParDalle);
  const versLigne = (grp) => {
    const d = grp.filter(([, r]) => m.rangees[r - 1] === 'demi').length;
    return { entieres: grp.length - d, demi: d, dalles: grp.length, puissanceW: watts(grp.length - d, d) };
  };
  const lignesAuPlusJuste = remplirGlouton(serpent, poidsW, utileW, chainage ?? Infinity).map(versLigne);
  const theorique = c.remplissage.length;

  const entieresParColonne = m.lignes;
  const demiParColonne = m.rangeeDemi ? 1 : 0;
  let lignesColonnes;
  if (m.forme) {
    lignesColonnes = casesParGroupe(m, c.colonnes.groupes).map((cases, n) => {
      const d = cases.filter((x) => x.type === 'demi').length;
      const [a, b] = c.colonnes.groupes[n];
      return { colonnes: b - a + 1, dalles: cases.length, puissanceW: watts(cases.length - d, d) };
    });
  } else if (c.colonnes.colonnesParPort) {
    const k = c.colonnes.colonnesParPort;
    lignesColonnes = [];
    for (let reste = m.colonnes; reste > 0; reste -= k) {
      const n = Math.min(k, reste);
      lignesColonnes.push({ colonnes: n, dalles: n * (entieresParColonne + demiParColonne), puissanceW: watts(n * entieresParColonne, n * demiParColonne) });
    }
  } else {
    const indexDemi = demiParColonne ? (m.positionDemi === 'haut' ? 0 : c.colonnes.segments.length - 1) : -1;
    const segment = c.colonnes.segments.map((n, i) => (i === indexDemi
      ? { colonnes: 1, dalles: n, puissanceW: watts(n - 1, 1) }
      : { colonnes: 1, dalles: n, puissanceW: watts(n, 0) }));
    lignesColonnes = Array.from({ length: m.colonnes }, () => segment.map((s) => ({ ...s }))).flat();
  }

  const puissanceTotaleW = watts(m.dalles.entieres, m.dalles.demi);
  const capacitePhaseW = arrondiW(tensionV * arrivee.intensiteA * marge);
  const resultat = {
    reglages: { tensionV, marge, puissanceUtileW, departA, arrivee, courbe, depart },
    pMax: { dalle: pDalle, demi: pDemi },
    manques,
    puissanceTotaleW,
    btuH: puissanceTotaleW * BTU_PAR_W,
    ligne,
    dallesParLigne: dallesLigne,
    lignes: {
      auPlusJuste: {
        nombre: lignesAuPlusJuste.length,
        lignes: lignesAuPlusJuste,
        theorique,
        depart,
        ecart: lignesAuPlusJuste.length === theorique ? null
          : `Au plus juste : ${lignesAuPlusJuste.length} lignes en suivant le vrai serpentin depuis ${LIBELLES_COIN[depart]}, `
            + `contre ${theorique} au décompte théorique. Le serpentin alterne dalles entières et demi-dalles : `
            + 'une ligne ne peut pas toujours être remplie au plus juste.',
      },
      colonnes: { nombre: lignesColonnes.length, colonnesParLigne: c.colonnes.colonnesParPort, segments: c.colonnes.segments, lignes: lignesColonnes },
      // Lignes retenues : en colonnes entières, au minimum ; en triphasé, celles de l'équilibre des phases.
      retenues: lignesColonnes.length,
      minimum: minimumTheorique(c, lignesAuPlusJuste.length, m, 'ligne'),
    },
    arrivee: {
      type: arrivee.type,
      intensiteA: arrivee.intensiteA,
      capacitePhaseW,
      capacite230W: arrondiW(TENSION_THEORIQUE_V * arrivee.intensiteA),
    },
    monophase: null,
    triphase: null,
    appel: null,
    alertes,
  };

  if (arrivee.type === 'mono') {
    const ok = puissanceTotaleW <= capacitePhaseW + EPS;
    resultat.monophase = { puissanceW: puissanceTotaleW, capaciteW: capacitePhaseW, intensiteA: puissanceTotaleW / tensionV, ok };
    if (!ok) {
      alertes.push(`L'arrivée mono ${nombreCourt(arrivee.intensiteA)} A porte ${nombreCourt(capacitePhaseW)} W utiles `
        + `(${nombreCourt(tensionV)} V, marge ${nombreCourt(marge * 100)} %) : le mur demande ${nombreCourt(puissanceTotaleW)} W. `
        + 'Il faut une arrivée plus forte ou du triphasé.');
    }
  } else {
    // Équilibre au plus juste : lignes en multiple de 3, dalles du serpentin réparties au plus égal.
    let equilibreApj = null;
    for (let n = multipleDe3(lignesAuPlusJuste.length); n <= Math.max(3, serpent.length); n += 3) {
      const lignes = [];
      let avant = 0;
      for (const k of repartir(serpent.length, n)) {
        lignes.push(versLigne(serpent.slice(avant, avant + k)));
        avant += k;
      }
      if (lignes.every((l) => l.puissanceW <= utileW + EPS && l.dalles <= (chainage ?? Infinity) && l.dalles > 0)) {
        equilibreApj = repartitionEquilibree(lignes, tensionV, capacitePhaseW);
        break;
      }
    }
    // Équilibre des phases en colonnes entières (conseil) : parmi les répartitions des colonnes entières, du minimum
    // de lignes à une colonne par ligne, l'écart entre phases le plus faible ; à écart égal, le moins de lignes ;
    // à lignes égales, les plus régulières (3-3-2-2 plutôt que 3-3-3-1). Chaque ligne, des plus chargées aux moins
    // chargées, va sur la phase la moins chargée. Colonne coupée en segments : les lignes sont fixes.
    let equilibreColonnes;
    if (c.colonnes.colonnesParPort) {
      const versLignes = (tailles) => tailles.map((k) => ({
        colonnes: k, dalles: k * (entieresParColonne + demiParColonne), puissanceW: watts(k * entieresParColonne, k * demiParColonne),
      }));
      const candidats = [lignesColonnes.map((l) => l.colonnes), ...suite(lignesColonnes.length, m.colonnes).map((n) => repartir(m.colonnes, n))];
      const avant = (a, b) => a.ecartW < b.ecartW - EPS
        || (Math.abs(a.ecartW - b.ecartW) <= EPS && (a.n < b.n || (a.n === b.n && a.irregularite < b.irregularite)));
      let meilleur = null;
      for (const tailles of candidats) {
        const option = repartitionMinimale(versLignes(tailles), tensionV, capacitePhaseW);
        const cle = { ecartW: option.ecartW, n: tailles.length, irregularite: Math.max(...tailles) - Math.min(...tailles), option };
        if (!meilleur || avant(cle, meilleur)) meilleur = cle;
      }
      equilibreColonnes = meilleur.option;
    } else {
      equilibreColonnes = repartitionMinimale(lignesColonnes.map((l) => ({ ...l })), tensionV, capacitePhaseW);
    }
    resultat.triphase = {
      auPlusJuste: { equilibre: equilibreApj, minimum: repartitionMinimale(lignesAuPlusJuste, tensionV, capacitePhaseW) },
      colonnes: { equilibre: equilibreColonnes, minimum: repartitionMinimale(lignesColonnes, tensionV, capacitePhaseW) },
    };
    // Conseil : l'équilibre des phases en colonnes entières ; le minimum de lignes est proposé en second.
    const conseil = equilibreColonnes;
    const minimumColonnes = resultat.triphase.colonnes.minimum;
    resultat.lignes.retenues = conseil.lignes.length;
    if (conseil.lignes.length > minimumColonnes.lignes.length) {
      const pc = (x) => `${nombreCourt(x, 0)} %`;
      const ecart = resultat.lignes.minimum;
      ecart.raisons.push(`équilibre des phases : ${conseil.lignes.length} lignes au lieu de ${minimumColonnes.lignes.length}, `
        + `écart entre phases ${pc(conseil.ecartPourcent)} au lieu de ${pc(minimumColonnes.ecartPourcent)}`);
      ecart.texte = `Minimum théorique : ${ecart.nombre} ligne${ecart.nombre > 1 ? 's' : ''} au plus juste, contre ${conseil.lignes.length} `
        + `en colonnes entières. Écart : ${ecart.raisons.join(' ; ')}.`;
    }
    if (!conseil.ok) {
      const max = Math.max(...conseil.phases.map((p) => p.puissanceW));
      alertes.push(`Arrivée tri ${nombreCourt(arrivee.intensiteA)} A : la phase la plus chargée demande ${nombreCourt(max)} W `
        + `pour ${nombreCourt(capacitePhaseW)} W utiles par phase, même équilibrée. Il faut une arrivée plus forte.`);
    }
  }

  // Courant d'appel : allumage simultané de toutes les dalles d'une ligne (prudent), seuil magnétique bas.
  if (dalle.courantAppelA > 0) {
    const courbeRetenue = courbe ?? 'C';
    if (!courbe) {
      alertes.push('Courbe du disjoncteur non précisée : contrôle en courbe C, la plus courante ; courbe à vérifier avec l\'électricien.');
    }
    const appelDemi = m.demi?.courantAppelA ?? dalle.courantAppelA;
    const pic = Math.max(...c.remplissage.map(({ e, d }) => e * dalle.courantAppelA + d * appelDemi));
    const seuilA = SEUILS_MAGNETIQUES[courbeRetenue] * departA;
    resultat.appel = { courbe: courbeRetenue, seuilA, picLigneA: pic, dureeMs: dalle.courantAppelMs ?? null, ok: pic <= seuilA + EPS };
    if (!resultat.appel.ok) {
      alertes.push(`Courant d'appel : jusqu'à ${nombreCourt(pic)} A sur une ligne si toutes ses dalles s'allument en même temps, `
        + `au-delà du seuil magnétique bas d'un disjoncteur courbe ${courbeRetenue} ${nombreCourt(departA)} A (${nombreCourt(seuilA)} A). `
        + 'Contrôle prudent : le pic ne dure que quelques millisecondes. Allume ligne par ligne et fais vérifier la courbe par l\'électricien.');
    }
  }

  return resultat;
}
