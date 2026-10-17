// Calculs du mur LED, module 8, liste de matériel d'un mur (étape 13a) : dalles et spares, processeurs, distributeurs,
// câbles data et élec rangés par longueurs du stock, multipaires, boîtiers, bumpers et moteurs, flight cases.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
// La liste compte, elle ne recalcule rien : elle reprend les résultats de Mur, Data, du câblage, d'Élec et de Poids.
import { nombreCourt } from '../format.js';
import { EPS } from './commun.js';
import { MODELES_DISTRIBUTEUR } from './capacites.js';
import { dallesDuMur } from './pixel-map.js';
import { MARGE_MOU_DEFAUT } from './cablage.js';

export const SPARES_POURCENT_DEFAUT = 5;
// Data en cuivre depuis une régie à plus de 10 m : multipaires (même seuil que les boîtiers de la distribution).
export const SEUIL_MULTIPAIRE_M = 10;
// Multipaire de 8 RJ45 dont 1 de secours : 7 câbles par multipaire.
export const CABLES_PAR_MULTIPAIRE = 7;
// Longueurs du stock par défaut, en mètres (choix de conception du projet, réglables par parc).
export const LONGUEURS_STOCK = {
  data: [1, 2, 5, 10, 20, 30, 50, 75, 100],
  multipaire: [25, 50, 75, 100],
  fibre: [50, 100, 150, 300],
  p16: [1, 2, 5, 10, 20, 25, 50],
  p17: [5, 10, 20, 25, 50],
};
export const RAPPEL_LISTE = 'Liste indicative, à vérifier avant le chargement.';
export const RAPPEL_RIGGER = 'Élingues, manilles et pieds de stack : à voir avec le rigger.';
const LIAISONS = 'fournies avec les dalles, à vérifier';
// Tolérance sur les longueurs : un câble de 10,0000001 m tient dans 10 m.
const EPS_M = 1e-6;

const pluriel = (n, un, plusieurs) => `${nombreCourt(n)} ${n > 1 ? plusieurs : un}`;

// Spares : n × pourcentage arrondi au-dessus, au moins 1 dès qu'il y a une dalle (0 % : aucun).
export function spares(n, pourcent = SPARES_POURCENT_DEFAUT) {
  if (!(n > 0) || !(pourcent > 0)) return 0;
  return Math.max(1, Math.ceil((n * pourcent) / 100 - EPS));
}

// Morceaux du stock pour un câble : la plus petite longueur qui suffit ; au-delà de la plus longue, autant de plus
// longues que nécessaire puis la plus courte qui couvre le reste (115 m avec 50 m au plus : 50 + 50 + 20).
// Longueur inconnue (distance non saisie) : null, « à mesurer ».
export function longueurStock(longueurM, longueurs) {
  if (longueurM === null || longueurM === undefined) return null;
  const stock = [...longueurs].sort((a, b) => a - b);
  const max = stock[stock.length - 1];
  const plusPetite = (x) => stock.find((l) => l >= x - EPS_M);
  if (longueurM <= max + EPS_M) return { morceaux: [plusPetite(longueurM)], raccords: false };
  const entiers = Math.floor(longueurM / max + EPS_M);
  const reste = longueurM - entiers * max;
  const morceaux = [...Array(entiers).fill(max), ...(reste > EPS_M ? [plusPetite(reste)] : [])];
  return { morceaux, raccords: morceaux.length > 1 };
}

// Câbles regroupés par longueur du stock, de la plus courte à la plus longue ; longueurs à mesurer et câbles en
// plusieurs morceaux (raccords) comptés à part.
export function grouperLongueurs(longueursM, longueurs) {
  const parLongueur = new Map();
  let aMesurer = 0;
  let raccords = 0;
  for (const x of longueursM) {
    const r = longueurStock(x, longueurs);
    if (!r) {
      aMesurer += 1;
      continue;
    }
    if (r.raccords) raccords += 1;
    for (const l of r.morceaux) parLongueur.set(l, (parLongueur.get(l) ?? 0) + 1);
  }
  return {
    parLongueur: [...parLongueur].sort((a, b) => a[0] - b[0]).map(([longueurM, nombre]) => ({ longueurM, nombre })),
    aMesurer,
    raccords,
  };
}

// « 6 × 10 m, 2 × 20 m, 1 longueur à mesurer ».
export function texteLongueurs(groupe) {
  return [
    ...groupe.parLongueur.map((x) => `${nombreCourt(x.nombre)} × ${nombreCourt(x.longueurM)} m`),
    ...(groupe.aMesurer ? [pluriel(groupe.aMesurer, 'longueur à mesurer', 'longueurs à mesurer')] : []),
  ].join(', ');
}

// Une ligne de la liste. `cle` : la même pour le même matériel (addition du total de la presta, check-list).
const ligneListe = (cle, quantite, designation, detail, extra = {}) => ({ cle, quantite, designation, longueurM: null, aMesurer: false, detail, ...extra });

// Lignes d'une sorte de câble : une par longueur du stock, puis les longueurs à mesurer ; raccords en note.
function lignesCables(designation, longueursM, stock, detail, notes, { detailMesurer = 'longueur à mesurer' } = {}) {
  const g = grouperLongueurs(longueursM, stock);
  const lignes = g.parLongueur.map((x) => ligneListe(`cable|${designation}|${x.longueurM}`, x.nombre, designation, detail, { longueurM: x.longueurM }));
  if (g.aMesurer) lignes.push(ligneListe(`cable|${designation}|a-mesurer`, g.aMesurer, designation, detailMesurer, { aMesurer: true }));
  if (g.raccords) {
    notes.push(`${designation} : ${pluriel(g.raccords, 'câble', 'câbles')} de plus de ${nombreCourt(Math.max(...stock))} m, raccords à prévoir.`);
  }
  return lignes;
}

// Dalles du mur fiche par fiche, dans l'ordre du mur (mur mixte : chaque fiche à part ; demi-dalles sur leur fiche).
export function dallesParFiche(m, dalle) {
  const fiches = new Map();
  for (const d of dallesDuMur(m, dalle)) {
    const f = fiches.get(d.fiche.id) ?? { fiche: d.fiche, demi: d.type === 'demi' || Boolean(d.fiche.demiDe), nombre: 0 };
    f.nombre += 1;
    fiches.set(d.fiche.id, f);
  }
  return [...fiches.values()];
}

function sectionDalles(fiches, pourcent) {
  const lignes = fiches.map((f) => {
    const sp = spares(f.nombre, pourcent);
    const detail = `${nombreCourt(f.nombre)} au mur${sp ? ` + ${nombreCourt(sp)} de spare (${nombreCourt(pourcent)} %, arrondi au-dessus)` : ', sans spare'}`;
    return ligneListe(`dalle|${f.fiche.id}`, f.nombre + sp, f.fiche.nom, detail, { auMur: f.nombre, spares: sp, ficheId: f.fiche.id });
  });
  return { id: 'dalles', titre: 'Dalles', lignes, notes: [] };
}

function sectionData(data, stock) {
  const section = { id: 'data', titre: 'Data', lignes: [], notes: [] };
  const e = data?.evaluation;
  if (!e?.groupes?.length || !data.variante) {
    section.notes.push(e?.impossible ? `Data : ${e.impossible}` : 'Data : aucun processeur retenu, ouvre l\'onglet Data.');
    return section;
  }
  const proc = e.processeur;
  const red = Boolean(e.reglages?.redondance);
  const v = data.variante;
  const distance = data.distanceRegieM ?? null;
  const mou = 1 + (data.margeMou ?? MARGE_MOU_DEFAUT);
  const L = section.lignes;
  L.push(ligneListe(`processeur|${proc.id}`, e.nombre, proc.nom, 'retenu dans Data'));
  if (proc.carteSortie && e.totaux?.cartesSortie) {
    L.push(ligneListe(`carte|${proc.carteSortie.nomCourt}`, e.totaux.cartesSortie, `Carte de sortie ${proc.carteSortie.nomCourt}`, `dans ${proc.modele}`));
  }
  // XD, CVT, convertisseurs : comptés comme Data ; seulement « si fibre » quand ils ne sont pas obligatoires.
  const dist = e.totaux?.distributeurs;
  const obligatoire = Boolean(e.distributeurObligatoire ?? proc.distributeurObligatoire);
  const modele = data.distributeur?.modele ?? MODELES_DISTRIBUTEUR[proc.distributeur] ?? 'convertisseur';
  const nbDist = dist ? (red ? dist.redondance : dist.colonnes) : 0;
  if (dist && nbDist && obligatoire) {
    L.push(ligneListe(`distributeur|${modele}`, nbDist, modele, red ? 'comptés dans Data, redondance comprise' : 'comptés dans Data'));
  } else if (dist && nbDist) {
    section.notes.push(`Si tu passes en fibre : ${nombreCourt(nbDist)} × ${modele} (comptés dans Data).`);
  }
  const ports = v.processeurs.flatMap((p) => p.ports);
  const surDistributeur = obligatoire && Boolean(dist);
  const tetes = ports.map((p) => p.longueurCuivreM);
  const secours = ports.filter((p) => p.secours).map((p) => p.secours.longueurCuivreM);
  if (surDistributeur) {
    // Fibre : une par distributeur, à la longueur régie–mur ; cuivre du distributeur à la dalle.
    const fibreM = distance === null ? null : distance * mou;
    L.push(...lignesCables(`Fibre jusqu'au ${modele}`, Array(nbDist).fill(fibreM), stock.fibre,
      `une par ${modele}, régie à ${nombreCourt(distance ?? 0)} m, mou compris`, section.notes,
      { detailMesurer: 'longueur à mesurer (distance régie–mur non saisie)' }));
    L.push(...lignesCables('Câble de tête RJ45', tetes, stock.data, `du ${modele} à la première dalle, mou compris`, section.notes,
      { detailMesurer: 'longueur à mesurer (distance régie–mur non saisie)' }));
    if (secours.length) L.push(...lignesCables('Retour de secours RJ45', secours, stock.data, `de la dernière dalle au ${modele}, mou compris`, section.notes));
  } else if (distance !== null && distance > SEUIL_MULTIPAIRE_M + EPS) {
    // Régie loin : multipaires (secours compris), un câble court au mur par câble, un cordon côté régie.
    const tronc = distance * mou;
    const auMur = [...tetes, ...secours].map((x) => x - tronc);
    const nbMp = Math.ceil(auMur.length / CABLES_PAR_MULTIPAIRE);
    L.push(...lignesCables('Multipaire 8 RJ45', Array(nbMp).fill(tronc), stock.multipaire,
      `8 RJ45 dont 1 de secours, 1 pour 7 câbles (${pluriel(auMur.length, 'câble', 'câbles')}), régie à ${nombreCourt(distance)} m, mou compris (${nombreCourt(tronc, 1)} m)`,
      section.notes));
    L.push(...lignesCables('Câble RJ45 au mur, du multipaire à la dalle', auMur, stock.data, 'trajet le long du mur, mou compris', section.notes));
    L.push(ligneListe('cable|Cordon RJ45 côté régie, du processeur au multipaire|a-mesurer', auMur.length, 'Cordon RJ45 côté régie, du processeur au multipaire',
      'longueur à mesurer', { aMesurer: true }));
  } else {
    const d = distance === null ? null : `régie à ${nombreCourt(distance)} m, trajet le long du mur, mou compris`;
    L.push(...lignesCables('Câble de tête RJ45', tetes, stock.data, d, section.notes, { detailMesurer: 'longueur à mesurer (distance régie–mur non saisie)' }));
    if (secours.length) L.push(...lignesCables('Retour de secours RJ45', secours, stock.data, d, section.notes, { detailMesurer: 'longueur à mesurer (distance régie–mur non saisie)' }));
  }
  if ([...tetes, ...secours].some((x) => x > 100 + EPS)) section.notes.push('Câbles en cuivre au-delà de 100 m : l\'Ethernet ne passe pas, vois l\'alerte du Schéma.');
  if (v.liaisons) L.push(ligneListe('liaison|data', v.liaisons, 'Liaison RJ45 entre dalles', LIAISONS));
  return section;
}

function sectionElec(elec, stock) {
  const section = { id: 'elec', titre: 'Élec', lignes: [], notes: [] };
  const v = elec?.variante;
  if (!v) {
    section.notes.push('Élec : non calculé, ouvre l\'onglet Élec.');
    return section;
  }
  const d = elec.distribution ?? null;
  const departA = d?.departA ?? elec.departA ?? 16;
  const tete = `Câble de tête ${nombreCourt(departA)} A`;
  const L = section.lignes;
  if (d) {
    if (d.boitiers.length) {
      const prises = elec.prisesParBoitier ?? 6;
      L.push(ligneListe(`boitier|${prises}`, d.boitiers.length, 'Boîtier 32 A tri', `${prises} prises 16 A (${prises / 3} par phase), ${d.pose}`));
      L.push(...lignesCables('Câble P17 32 A tri', d.cables.p17.longueursM, stock.p17, `de l'armoire au boîtier, mou compris`, section.notes,
        { detailMesurer: 'longueur à mesurer (distance armoire–mur non saisie)' }));
    }
    L.push(...lignesCables(tete, d.cables.tete.longueursM, stock.p16, 'depuis le boîtier ou l\'armoire, mou compris', section.notes,
      { detailMesurer: 'longueur à mesurer (distance armoire–mur non saisie)' }));
    if (d.refus) section.notes.push(`Distribution : ${d.refus}`);
  } else {
    L.push(...lignesCables(tete, v.lignesDetail.map((l) => l.longueurTeteM ?? null), stock.p16, 'depuis l\'armoire, mou compris', section.notes,
      { detailMesurer: 'longueur à mesurer (distance armoire–mur non saisie)' }));
  }
  if (v.liaisons) L.push(ligneListe('liaison|power', v.liaisons, 'Liaison power entre dalles', LIAISONS));
  return section;
}

function sectionAccroche(poids) {
  const section = { id: 'accroche', titre: 'Accroche', lignes: [], notes: [] };
  const r = poids?.resultat;
  if (!r) {
    section.notes.push('Poids : non calculé, ouvre l\'onglet Poids pour les bumpers et les moteurs.', RAPPEL_RIGGER);
    return section;
  }
  if (r.mode === 'stack') {
    section.notes.push('Stack : pieds et structure à voir avec le rigger.', RAPPEL_RIGGER);
    return section;
  }
  const nom = poids.bumper?.nom ?? 'Bumper';
  if (r.bumpers.length) {
    const [a, b] = r.bumpers[0].colonnes;
    section.lignes.push(ligneListe(`bumper|${nom}`, r.bumpers.length, nom, `${pluriel(b - a + 1, 'colonne', 'colonnes')} par bumper, comme Poids`));
  }
  // Points d'accroche : un moteur par point ; zone par zone pour un mur en zones.
  const points = r.zones ? r.zones.map((z) => z.points).filter(Boolean) : [r.points].filter(Boolean);
  if (points.some((p) => p.renvoiRigger || !p.points)) {
    section.notes.push('Moteurs : nombre et répartition à établir par le rigger (pont sur plus de 4 points, à portées inégales ou en porte-à-faux).');
  } else if (points.length) {
    const n = points.reduce((s, p) => s + p.points.length, 0);
    const detail = points.every((p) => p.type === 'pont') ? 'points du pont, comme Poids'
      : (r.bumpers.length ? 'un par bumper, comme Poids' : 'un par colonne, comme Poids');
    section.lignes.push(ligneListe('moteur', n, 'Moteur (point d\'accroche)', detail));
  }
  section.notes.push(RAPPEL_RIGGER);
  return section;
}

// Flight cases fiche par fiche : (dalles + spares) ÷ dalles par case, arrondi au-dessus. Une demi-dalle prend sa propre
// saisie, sinon les demi-dalles par case de sa dalle ; sans saisie, « à préciser dans le parc ».
function sectionCases(dalles, parc) {
  const section = { id: 'cases', titre: 'Flight cases', lignes: [], notes: [] };
  const saisies = parc?.cases ?? {};
  const nomParc = parc?.nom ? `, ${parc.nom}` : '';
  for (const l of dalles.lignes) {
    const f = l.fiche;
    const saisiePropre = saisies[f.id];
    const parente = l.demi ? saisies[f.demiDe] : null;
    const reglage = saisiePropre?.dallesParCase > 0 ? { parCase: saisiePropre.dallesParCase, ...saisiePropre }
      : (parente?.demiParCase > 0 ? { parCase: parente.demiParCase, ...parente } : null);
    if (!reglage) {
      section.notes.push(`${l.demi ? 'Cases des demi-dalles' : 'Cases de'} ${f.nom} : à préciser dans le parc.`);
      continue;
    }
    const n = Math.ceil(l.quantite / reglage.parCase - EPS);
    const dim = reglage.dimensionsCm;
    const volumeM3 = dim?.largeur > 0 && dim?.profondeur > 0 && dim?.hauteur > 0 ? (n * dim.largeur * dim.profondeur * dim.hauteur) / 1e6 : null;
    const poidsPleinesKg = reglage.poidsCaseKg > 0 && f.poidsKg > 0 ? l.quantite * f.poidsKg + n * reglage.poidsCaseKg : null;
    section.lignes.push(ligneListe(`case|${f.id}`, n, `Flight case ${f.nom}`,
      `${pluriel(l.quantite, 'dalle', 'dalles')} (spares compris), ${nombreCourt(reglage.parCase)} par case${nomParc}`,
      { ficheId: f.id, poidsCaseKg: reglage.poidsCaseKg > 0 ? reglage.poidsCaseKg : null, poidsPleinesKg, volumeM3 }));
  }
  return section;
}

// Liste de matériel d'un mur. Entrées, chacune facultative sauf le mur :
// data { evaluation, variante (câblage data retenu), distanceRegieM, margeMou, distributeur { modele } },
// elec { variante (câblage élec retenu), distribution (distributionElec), departA, prisesParBoitier },
// poids { resultat (poids()), bumper { nom } }, parc { nom, longueurs { data, multipaire, fibre, p16, p17 },
// cases { [dalleId]: { dallesParCase, demiParCase, poidsCaseKg, dimensionsCm { largeur, profondeur, hauteur } } } }.
export function listeMateriel(entrees) {
  const { dalle, data = null, elec = null, poids = null, parc = null, sparesPourcent = SPARES_POURCENT_DEFAUT } = entrees;
  const m = entrees.mur;
  const stock = Object.fromEntries(Object.entries(LONGUEURS_STOCK).map(([famille, defaut]) => {
    const reglees = parc?.longueurs?.[famille];
    return [famille, Array.isArray(reglees) && reglees.length ? [...reglees].sort((a, b) => a - b) : defaut];
  }));
  const fiches = dallesParFiche(m, dalle);
  const dalles = sectionDalles(fiches, sparesPourcent);
  const lignesFiches = dalles.lignes.map((l, i) => ({ ...l, fiche: fiches[i].fiche, demi: fiches[i].demi }));
  const cases = sectionCases({ lignes: lignesFiches }, parc);

  // Poids transporté : dalles et spares, cases vides quand chaque fiche a son case pesé ; indicatif.
  const dallesKg = lignesFiches.every((l) => l.fiche.poidsKg > 0) ? lignesFiches.reduce((s, l) => s + l.quantite * l.fiche.poidsKg, 0) : null;
  const casesPesees = lignesFiches.every((l) => cases.lignes.find((c) => c.ficheId === l.fiche.id)?.poidsCaseKg);
  const casesKg = casesPesees ? cases.lignes.reduce((s, c) => s + c.quantite * c.poidsCaseKg, 0) : null;
  const poidsTransporte = {
    kg: dallesKg === null ? null : dallesKg + (casesKg ?? 0),
    dallesKg,
    casesKg,
    nonCompte: casesPesees ? 'processeurs, câbles et accroche non comptés' : 'cases, processeurs, câbles et accroche non comptés',
    indicatif: true,
  };
  return {
    sparesPourcent,
    sections: [dalles, sectionData(data, stock), sectionElec(elec, stock), sectionAccroche(poids), cases],
    poidsTransporte,
    stock,
    // Origine des longueurs du stock : le parc pour les familles qu'il règle, le défaut pour les autres.
    origineStock: {
      parc: parc && Object.keys(parc.longueurs ?? {}).some((f) => parc.longueurs[f]?.length) ? parc.nom ?? null : null,
      familles: Object.keys(LONGUEURS_STOCK).filter((f) => parc?.longueurs?.[f]?.length),
    },
    rappel: RAPPEL_LISTE,
    indicatif: true,
  };
}

// « Câble de tête RJ45, 10 m », « Câble de tête RJ45, longueur à mesurer ».
export const libelleLigne = (l) => `${l.designation}${l.longueurM ? `, ${nombreCourt(l.longueurM)} m` : ''}${l.aMesurer ? ', longueur à mesurer' : ''}`;

// Total de la presta (étape 13c) : les listes gardées de ses murs additionnées, ligne par ligne (même clé : même
// désignation, même longueur), dans l'ordre des sections, avec le détail par mur ; notes de chaque mur nommées (les
// mêmes regroupées) ; mur sans liste : à ouvrir une fois ; ajouts à la main en dernière section. `murs` : [{ nom, liste }].
export function totalMateriel(murs, { ajouts = [] } = {}) {
  const avec = murs.filter((m) => m.liste);
  const manquants = murs.filter((m) => !m.liste).map((m) => m.nom);
  const sections = [];
  for (const { nom, liste } of avec) {
    for (const s of liste.sections) {
      let cible = sections.find((x) => x.id === s.id);
      if (!cible) {
        cible = { id: s.id, titre: s.titre, lignes: [], notesParTexte: new Map() };
        sections.push(cible);
      }
      for (const l of s.lignes) {
        const deja = cible.lignes.find((x) => x.cle === l.cle);
        if (deja) {
          deja.quantite += l.quantite;
          deja.parMur.push({ nom, nombre: l.quantite });
        } else {
          cible.lignes.push({ ...l, parMur: [{ nom, nombre: l.quantite }] });
        }
      }
      for (const n of s.notes) cible.notesParTexte.set(n, [...(cible.notesParTexte.get(n) ?? []), nom]);
    }
  }
  const ordre = ['dalles', 'data', 'elec', 'accroche', 'cases'];
  sections.sort((a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id));
  const finales = sections.map(({ notesParTexte, ...s }) => ({
    ...s,
    lignes: s.lignes.map((l) => ({ ...l, detail: l.parMur.length > 1 ? l.parMur.map((x) => `${x.nom} : ${nombreCourt(x.nombre)}`).join(' ; ') : l.detail })),
    notes: [...notesParTexte].map(([n, noms]) => `${noms.join(', ')} : ${n}`),
  }));
  if (ajouts.length) {
    finales.push({
      id: 'ajouts', titre: 'Ajouts à la main', notes: [],
      lignes: ajouts.map((a) => ligneListe(`ajout|${a.id}`, a.quantite, a.libelle, null, { parMur: [] })),
    });
  }
  const poids = avec.map((m) => m.liste.poidsTransporte);
  const kg = poids.length && poids.every((p) => p.kg !== null) ? poids.reduce((s, p) => s + p.kg, 0) : null;
  const casesComptees = poids.every((p) => p.casesKg !== null);
  return {
    murs: murs.length,
    manquants,
    notes: manquants.map((nom) => `${nom} : ouvre ce mur une fois pour compter son matériel.`),
    sparesPourcent: [...new Set(avec.map((m) => m.liste.sparesPourcent))],
    origineStock: avec.map((m) => m.liste.origineStock).filter(Boolean),
    sections: finales,
    poidsTransporte: {
      kg,
      nonCompte: casesComptees ? 'processeurs, câbles et accroche non comptés' : 'cases, processeurs, câbles et accroche non comptés',
      indicatif: true,
    },
    rappel: RAPPEL_LISTE,
    indicatif: true,
  };
}
