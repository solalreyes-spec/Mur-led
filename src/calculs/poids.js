// Calculs du mur LED, module 5, poids et accroche (indicatif : à valider par le rigger).
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombreCourt } from '../format.js';
import { EPS, ErreurSaisie } from './commun.js';
import { plusieursZones, ficheZone, mursDesZones } from './morceaux.js';
import { texteAngle, formeReelle } from './forme-reelle.js';
import { regrouperAlertes } from './elec.js';

// ---------------------------------------------------------------------------
// Module 5 : poids et accroche (indicatif : à valider par le rigger)
// ---------------------------------------------------------------------------

// Pont (truss) continu à portées égales, charge répartie : part de la charge totale reprise par chaque point.
export const PARTS_PONT = {
  1: [1],
  2: [0.5, 0.5],
  3: [0.1875, 0.625, 0.1875],
  4: [2 / 15, 11 / 30, 11 / 30, 2 / 15],
};

export const RAPPELS_POIDS = [
  'Résultats indicatifs : la structure est validée par le rigger.',
  'Préfère les élingues acier aux sangles textiles, à cause de la tenue au feu.',
  'Structure dimensionnée pour 5 fois le poids suspendu, selon ROE.',
];

// Arrondi au milligramme, pour effacer le bruit des nombres à virgule (90 × 13,6 = 1224).
const arrondiKg = (kg) => Math.round(kg * 1e6) / 1e6;
const texteKg = (kg) => `${nombreCourt(kg, 2)} kg`;

// Poids d'un mur en zones (étape 9a) : chaque zone est une structure à part (ses bumpers, ses points, son maximum en
// accroche ou en stack), puis les totaux ; les autres charges suspendues comptent une fois, pour tout le mur.
// Alertes d'un bumper, d'un point d'accroche ou du maximum en accroche (retirées d'une zone accrochée sous une autre).
const ALERTES_ACCROCHE = /^(CMU du bumper|Pont sur plus de 4 points|Autres charges suspendues|CMU du moteur|Maximum en accroche|Fiche sans maximum en accroche)/;
function poidsZones(m, dalle, reglages) {
  const { mode = 'accroche', autresKg = 0, accroche = { type: 'bumpers' } } = reglages;
  if (!(autresKg >= 0)) throw new ErreurSaisie('Les poids de câbles et d\'autres charges sont positifs ou nuls.');
  const noms = m.zones.map((z) => z.nom);
  const murs = mursDesZones(m, dalle);
  const saisies = m.saisie?.zones ?? [];
  // Zone accrochée sous une autre (9b5, Z27, en accroche seulement) : son poids passe sur les colonnes au-dessus d'elle.
  const reference = m.zones.map((z, i) => {
    const p = saisies[i]?.placement;
    return mode === 'accroche' && p?.type === 'dessous' && p.accrocheeSous ? m.zones.findIndex((x) => x.nom === p.zone) : -1;
  });
  const seul = murs.map((s, i) => poids(s, s.fiche ?? dalle, { ...reglages, autresKg: 0, zoneCourbe: Boolean(saisies[i]?.courbure) }));
  const alertesAccroche = [];
  // Colonnes d'une zone, zones accrochées dessous comprises (en cascade).
  const memo = new Map();
  const colonnesTotales = (i) => {
    if (memo.has(i)) return memo.get(i);
    const colonnes = seul[i].colonnes.map((c) => ({ kg: c.kg, dalles: c.dalles }));
    let hauteurMm = 0;
    m.zones.forEach((zb, b) => {
      if (reference[b] !== i) return;
      const zh = m.zones[i];
      const largeurH = zh.largeurMm / zh.colonnes;
      const largeurB = zb.largeurMm / zb.colonnes;
      const dessous = colonnesTotales(b);
      dessous.colonnes.forEach((c, j) => {
        const k = Math.floor((zb.xMm + (j + 0.5) * largeurB - zh.xMm) / largeurH);
        if (k < 0 || k >= zh.colonnes) {
          alertesAccroche.push(`${zb.nom} · C${j + 1} accrochée sous ${zh.nom} : aucune colonne de ${zh.nom} au-dessus d'elle, accroche à revoir avec le rigger.`);
          return;
        }
        // Colonne du dessus sans dalle en bas (absente, ou colonne remontée) : rien ne tient celle-ci (9c, Z41).
        const colonneH = zh.forme?.colonnes[k];
        const bas = colonneH?.cases.at(-1);
        const vide = colonneH && (!bas.presente ? `${zh.nom} · C${k + 1} R${bas.rangee} absente`
          : colonneH.decalageMm > 0 ? `${zh.nom} · C${k + 1} remontée de ${nombreCourt(colonneH.decalageMm, 1)} mm` : null);
        if (vide) alertesAccroche.push(`${zb.nom} · C${j + 1} accrochée sous un vide (${vide}) : rien ne la tient, accroche à revoir avec le rigger.`);
        colonnes[k] = { kg: colonnes[k].kg + c.kg, dalles: colonnes[k].dalles + c.dalles };
      });
      // L'écart vertical entre les deux zones compte dans la hauteur accrochée (9c, Z41, par prudence).
      hauteurMm = Math.max(hauteurMm, zb.hauteurMm + (saisies[b]?.placement?.ecartMm ?? 0) + dessous.hauteurMm);
      const fh = ficheZone(m, zh, dalle);
      const fb = ficheZone(m, zb, dalle);
      if (fh.id !== fb.id) {
        alertesAccroche.push(`${zb.nom} accrochée sous ${zh.nom} : dalles différentes accrochées l'une sous l'autre (${fb.nom} sous ${fh.nom}) : `
          + 'vérifie avec le constructeur que les verrous et les bumpers sont compatibles.');
      }
    });
    const total = { colonnes, hauteurMm };
    memo.set(i, total);
    return total;
  };
  const parZone = murs.map((s, i) => {
    const total = colonnesTotales(i);
    const ajouts = total.colonnes.map((c, j) => ({ kg: arrondiKg(c.kg - seul[i].colonnes[j].kg), dalles: c.dalles - seul[i].colonnes[j].dalles }));
    const r = ajouts.some((a) => a.kg > EPS || a.dalles > 0)
      ? poids(s, s.fiche ?? dalle, { ...reglages, autresKg: 0, ajoutsColonnes: ajouts, hauteurAjouteeMm: total.hauteurMm, zoneCourbe: Boolean(saisies[i]?.courbure) })
      : seul[i];
    // Zone accrochée : ni point ni bumper à elle, son maximum se contrôle avec la zone du dessus ; ses alertes de
    // bumper, de point et de maximum (et le manque du maximum) partent avec eux.
    if (reference[i] < 0) return r;
    return {
      ...r, points: null, bumpers: [], bumpersKg: 0, maximum: null, accrocheeSous: m.zones[reference[i]].nom,
      alertes: r.alertes.filter((a) => !ALERTES_ACCROCHE.test(a)), manques: r.manques.filter((x) => x.champ !== 'maxAccroche'),
    };
  });
  const somme = (f) => arrondiKg(parZone.reduce((t, r) => t + f(r), 0));
  const dallesKg = somme((r) => r.dallesKg);
  const cablesKg = somme((r) => r.cablesKg);
  const bumpersKg = somme((r) => r.bumpersKg);
  const murKg = arrondiKg(dallesKg + cablesKg);
  const suspenduKg = arrondiKg(murKg + bumpersKg + autresKg);
  const alertes = [...regrouperAlertes(parZone.map((r) => r.alertes), noms), ...alertesAccroche];
  // Zone au plafond ou inclinée (9c, Z40) : le maximum de la fiche est écrit pour une accroche verticale.
  if (mode === 'accroche' && saisies.some((z) => z.pose)) {
    formeReelle(m, dalle).zones.forEach((z, i) => {
      if (Math.abs(z.tangageDeg) > 1e-6 && reference[i] < 0) {
        alertes.push(`${z.nom} : zone au plafond ou inclinée (tangage ${texteAngle(z.tangageDeg)}) : maximum en accroche de la fiche écrit pour une accroche verticale ; `
          + 'accroche à plat à valider par le rigger.');
      }
    });
  }
  // Les autres charges ne sont sur aucun point de zone : à placer avec le rigger, pont compris.
  if (mode === 'accroche' && autresKg > 0) {
    alertes.push(`Autres charges suspendues (${texteKg(autresKg)}) : à reprendre sur un point ou sur la structure, avec le rigger.`);
  }
  // Zones qui pendent à un pont : pas celles accrochées sous une autre.
  const surPont = reference.filter((x) => x < 0).length;
  if (mode === 'accroche' && accroche.type === 'pont' && accroche.poidsPontKg > 0 && surPont > 1) {
    alertes.push(`Pont : chaque zone pend à son propre pont ; ses ${texteKg(accroche.poidsPontKg)} sont comptés pour chacune des `
      + `${surPont} zones. Si plusieurs zones partagent un pont, la répartition doit être établie par le rigger.`);
  }
  const manques = parZone.flatMap((r) => r.manques).filter((x, i, t) => t.findIndex((y) => y.texte === x.texte) === i);
  // Maximum le plus juste : la zone la plus proche de sa limite (ou au-delà).
  const maxima = parZone.map((r, i) => r.maximum && { ...r.maximum, zone: noms[i] }).filter(Boolean);
  const maximum = maxima.length ? maxima.reduce((a, b) => (b.valeur / b.limite > a.valeur / a.limite ? b : a)) : null;
  return {
    mode,
    poidsDalleKg: dalle.poidsKg,
    poidsDemiKg: null,
    dallesKg,
    cablesKg,
    bumpersKg,
    autresKg,
    murKg,
    suspenduKg,
    kgParM2: dallesKg / m.surfaceM2,
    kgParMetre: suspenduKg / (m.zones.reduce((t, z) => t + z.largeurMm, 0) / 1000),
    colonnes: parZone.flatMap((r, i) => r.colonnes.map((c) => ({ ...c, zone: noms[i] }))),
    bumpers: parZone.flatMap((r, i) => r.bumpers.map((b) => ({ ...b, zone: noms[i] }))),
    // Points d'accroche : zone par zone (chaque zone pend à sa structure).
    points: null,
    maximum,
    zones: parZone.map((r, i) => ({ nom: noms[i], ...r })),
    alertes,
    manques,
    rappels: RAPPELS_POIDS,
    indicatif: true,
  };
}

// Poids d'un mur et répartition sur les points d'accroche.
// Réglages : mode ('accroche' ou 'stack'), bumper { poidsKg, colonnes, cmuKg }, cablesKgParDalle, autresKg,
// accroche { type: 'bumpers' | 'pont', points, porteesEgales, poidsPontKg, cmuMoteurKg, configurationMoteur }.
export function poids(m, dalle, reglages = {}) {
  const {
    mode = 'accroche', bumper = null, cablesKgParDalle = 0, autresKg = 0, accroche = { type: 'bumpers' },
  } = reglages;
  if (plusieursZones(m)) return poidsZones(m, dalle, reglages);
  if (!['accroche', 'stack'].includes(mode)) throw new ErreurSaisie('Choisis accroche ou stack.');
  if (!(dalle.poidsKg > 0)) throw new ErreurSaisie(`Fiche incomplète : poids absent de la fiche ${dalle.nom}, pas de calcul de poids.`);
  if (m.demi && !(m.demi.poidsKg > 0)) throw new ErreurSaisie(`Fiche incomplète : poids absent de la fiche ${m.demi.nom}, pas de calcul de poids.`);
  if (!(cablesKgParDalle >= 0) || !(autresKg >= 0)) throw new ErreurSaisie('Les poids de câbles et d\'autres charges sont positifs ou nuls.');
  if (bumper && (!(bumper.poidsKg >= 0) || !Number.isInteger(bumper.colonnes) || bumper.colonnes < 1)) {
    throw new ErreurSaisie('Indique le poids d\'un bumper et le nombre de colonnes qu\'il porte.');
  }

  const alertes = [];
  const manques = [];
  const pDemi = m.demi ? m.demi.poidsKg : 0;
  const dallesParColonne = m.rangees.length;
  const colonneKg = arrondiKg(m.lignes * dalle.poidsKg + (m.rangeeDemi ? pDemi : 0) + dallesParColonne * cablesKgParDalle);
  // Zone de forme libre (9b5, Z27) : chaque colonne pesée sur ses dalles présentes.
  let colonnes = m.forme
    ? m.forme.colonnes.map((col, i) => {
      const cases = col.cases.filter((x) => x.presente);
      return { numero: i + 1, dalles: cases.length, kg: arrondiKg(cases.reduce((t, x) => t + (x.type === 'demi' ? pDemi : dalle.poidsKg) + cablesKgParDalle, 0)) };
    })
    : Array.from({ length: m.colonnes }, (_, i) => ({ numero: i + 1, dalles: dallesParColonne, kg: colonneKg }));
  // Zone accrochée sous celle-ci (9b5, Z27) : ses colonnes s'ajoutent aux colonnes au-dessus d'elles.
  const ajouts = reglages.ajoutsColonnes ?? [];
  colonnes = colonnes.map((c, i) => (ajouts[i] ? { ...c, dalles: c.dalles + ajouts[i].dalles, kg: arrondiKg(c.kg + ajouts[i].kg) } : c));
  const ajoutKg = arrondiKg(ajouts.reduce((t, a) => t + (a?.kg ?? 0), 0));
  const dallesKg = arrondiKg(m.dalles.entieres * dalle.poidsKg + m.dalles.demi * pDemi);
  const cablesKg = arrondiKg(m.dalles.total * cablesKgParDalle);
  if (!cablesKgParDalle) {
    alertes.push('Poids des câbles entre dalles non renseigné (0 kg) : ajoute-le, par dalle, pour une charge réaliste.');
  }

  // Bumpers ou barres : chacun porte ses colonnes ; le dernier peut en porter moins.
  let bumpers = [];
  if (bumper && mode === 'accroche') {
    for (let debut = 1; debut <= m.colonnes; debut += bumper.colonnes) {
      const fin = Math.min(debut + bumper.colonnes - 1, m.colonnes);
      const kg = arrondiKg(colonnes.slice(debut - 1, fin).reduce((t, c) => t + c.kg, 0) + bumper.poidsKg);
      const ok = bumper.cmuKg ? kg <= bumper.cmuKg + EPS : null;
      bumpers.push({ numero: bumpers.length + 1, colonnes: [debut, fin], kg, cmuKg: bumper.cmuKg ?? null, ok });
    }
    const depasses = bumpers.filter((b) => b.ok === false);
    if (depasses.length > 0) {
      alertes.push(`CMU du bumper (${texteKg(bumper.cmuKg)}) dépassée : ${depasses.length > 1 ? `${depasses.length} bumpers portent` : 'un bumper porte'} `
        + `jusqu'à ${texteKg(Math.max(...depasses.map((b) => b.kg)))}.`);
    }
  }
  const bumpersKg = arrondiKg(bumpers.length * (bumper?.poidsKg ?? 0));
  const murKg = arrondiKg(dallesKg + cablesKg);
  // Charge suspendue de cette zone, zones accrochées dessous comprises.
  const suspenduKg = arrondiKg(murKg + bumpersKg + autresKg + ajoutKg);

  // Points d'accroche (pas en stack).
  let points = null;
  if (mode === 'accroche') {
    const cmu = accroche.cmuMoteurKg ?? null;
    if (accroche.type === 'pont') {
      const n = accroche.points;
      const totalKg = arrondiKg(suspenduKg + (accroche.poidsPontKg ?? 0));
      // Zone courbe (9c, Z39) : un pont droit ne suit pas la courbe.
      const courbe = Boolean(reglages.zoneCourbe ?? m.saisie?.zones?.[0]?.courbure);
      const horsParts = !(n >= 1 && n <= 4 && Number.isInteger(n)) || accroche.porteesEgales === false;
      const renvoiRigger = horsParts || courbe;
      const liste = renvoiRigger ? null : PARTS_PONT[n].map((part, i) => ({ numero: i + 1, part, kg: arrondiKg(part * totalKg) }));
      points = { type: 'pont', points: liste, totalKg, renvoiRigger, cmuMoteurKg: cmu, configurationMoteur: accroche.configurationMoteur ?? null, indicatif: true };
      if (horsParts) {
        alertes.push('Pont sur plus de 4 points, à portées inégales ou en porte-à-faux : la répartition doit être établie par le rigger.');
      }
      if (courbe) {
        alertes.push('Zone courbe : un pont droit ne suit pas la courbe ; la répartition sur le pont doit être établie par le rigger (pont courbe ou portées inégales).');
      }
    } else {
      // Chaque bumper (ou, sans bumper renseigné, chaque colonne) pend à son propre point : parts égales.
      const liste = bumpers.length > 0
        ? bumpers.map((b) => ({ numero: b.numero, kg: b.kg, colonnes: b.colonnes }))
        : colonnes.map((c) => ({ numero: c.numero, kg: c.kg, colonnes: [c.numero, c.numero] }));
      points = {
        type: 'bumpers', points: liste, totalKg: arrondiKg(liste.reduce((s, p) => s + p.kg, 0)), renvoiRigger: false,
        cmuMoteurKg: cmu, configurationMoteur: accroche.configurationMoteur ?? null, indicatif: true,
      };
      if (autresKg > 0) alertes.push(`Autres charges suspendues (${texteKg(autresKg)}) : à reprendre sur un point ou sur la structure, avec le rigger.`);
    }
    points.ok = cmu && points.points ? points.points.every((p) => p.kg <= cmu + EPS) : null;
    if (points.ok === false) {
      const max = Math.max(...points.points.map((p) => p.kg));
      alertes.push(`CMU du moteur (${texteKg(cmu)}${points.configurationMoteur ? `, ${points.configurationMoteur}` : ''}) dépassée : `
        + `jusqu'à ${texteKg(max)} sur un point.`);
    }
  }

  // Maximum en accroche ou en stack de la fiche, dans son unité ; une demi-dalle compte pour une dalle.
  const champ = mode === 'stack' ? 'maxStack' : 'maxAccroche';
  const libelleMode = mode === 'stack' ? 'stack' : 'accroche';
  let maximum = null;
  if (dalle[champ] > 0) {
    const unite = dalle[`${champ}Unite`] ?? 'dalles';
    const valeurs = {
      dalles: Math.max(...colonnes.map((c) => c.dalles)),
      m: (m.hauteurMm + (reglages.hauteurAjouteeMm ?? 0)) / 1000,
      kg: Math.max(...colonnes.map((c) => c.kg)),
    };
    const valeur = valeurs[unite];
    maximum = {
      mode,
      valeur,
      limite: dalle[champ],
      unite,
      conditions: dalle[`${champ}Conditions`] ?? null,
      sources: dalle.sources?.[champ]?.sources ?? [],
      ok: valeur <= dalle[champ] + EPS,
    };
    if (!maximum.ok) {
      alertes.push(`Maximum en ${libelleMode} dépassé : ${nombreCourt(valeur, 2)} ${unite} pour ${nombreCourt(maximum.limite, 2)} ${unite} au plus`
        + `${maximum.conditions ? ` (${maximum.conditions})` : ''}.`);
    }
  } else {
    const texte = `Fiche sans maximum en ${libelleMode} : à vérifier avec le constructeur et le rigger.`;
    alertes.push(texte);
    manques.push({ champ, texte });
  }

  return {
    mode,
    poidsDalleKg: dalle.poidsKg,
    poidsDemiKg: m.demi ? pDemi : null,
    // Dalles de ce mur (ou de cette zone) seulement, et charge des zones accrochées dessous (9b5).
    ...(ajoutKg > 0 ? { dallesPropres: m.dalles.total, ajoutKg } : {}),
    dallesKg,
    cablesKg,
    bumpersKg,
    autresKg,
    murKg,
    suspenduKg,
    kgParM2: dallesKg / m.surfaceM2,
    kgParMetre: suspenduKg / (m.largeurMm / 1000),
    colonnes,
    bumpers,
    points,
    maximum,
    alertes,
    manques,
    rappels: RAPPELS_POIDS,
    indicatif: true,
  };
}
