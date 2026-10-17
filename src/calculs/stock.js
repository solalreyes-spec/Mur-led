// Calculs du mur LED, module 9, stock du parc (étape 15a) : stock d'une fiche dans un parc (lots), besoin du mur (dalles
// et spares), part prise par les autres murs de la presta, résultat par fiche, plus grand mur possible avec le stock,
// total de la presta comparé au stock de chaque parc.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
// Le stock se lit dans le parc ; il ne modifie jamais un mur.
import { nombreCourt } from '../format.js';
import { DALLES_MAX_MUR, VARIANTES, mur } from './mur.js';
import { SPARES_POURCENT_DEFAUT, spares, dallesParFiche } from './materiel.js';

const enTexte = (x) => nombreCourt(x);
// Dalle tournée (« …-tournee », pixel-map.js) : elle garde les lots de sa fiche.
const idStock = (ficheId) => String(ficheId).replace(/-tournee$/, '');
const lotsSans = (k) => (k === 1 ? 'un lot' : `${enTexte(k)} lots`);

// Stock d'une fiche : somme des quantités de ses lots. Un lot sans quantité : stock « au moins » (connu: false) ;
// aucun lot : stock non saisi.
export function stockFiche(lots) {
  const liste = Array.isArray(lots) ? lots : [];
  if (liste.length === 0) return { saisi: false, quantite: 0, sansQuantite: 0, connu: false };
  const avec = liste.filter((l) => Number.isInteger(l.quantite));
  const sansQuantite = liste.length - avec.length;
  const quantite = avec.reduce((s, l) => s + l.quantite, 0);
  return { saisi: true, quantite, sansQuantite, connu: sansQuantite === 0 };
}

// Besoin de chaque fiche du mur : dalles au mur + spares (même compte que la liste de matériel).
export function besoinDalles(m, dalle, pourcent = SPARES_POURCENT_DEFAUT) {
  return dallesParFiche(m, dalle).map((f) => {
    const sp = spares(f.nombre, pourcent);
    return { ficheId: f.fiche.id, nom: f.fiche.nom, demi: f.demi, auMur: f.nombre, spares: sp, besoin: f.nombre + sp };
  });
}

// Part du stock prise par les autres murs de la presta du même parc : dalles et spares de leur liste gardée.
// Mur sans liste (jamais ouvert depuis l'étape 13) : compté zéro, nommé dans `nonComptes`.
export function prisAutresMurs(autres, ficheId) {
  const parMur = [];
  const nonComptes = [];
  for (const { nom, liste } of autres ?? []) {
    if (!liste) {
      nonComptes.push(nom);
      continue;
    }
    const ligne = liste.sections.find((s) => s.id === 'dalles')?.lignes.find((l) => idStock(l.ficheId) === idStock(ficheId));
    if (ligne?.quantite > 0) parMur.push({ nom, nombre: ligne.quantite });
  }
  return { nombre: parMur.reduce((s, x) => s + x.nombre, 0), parMur, nonComptes };
}

function textePris(pris) {
  if (!pris.nombre) return '';
  if (pris.parMur.length === 1) return `, dont ${enTexte(pris.nombre)} pris par ${pris.parMur[0].nom}`;
  return `, dont ${enTexte(pris.nombre)} pris par les autres murs (${pris.parMur.map((x) => `${x.nom} : ${enTexte(x.nombre)}`).join(' ; ')})`;
}

const texteBesoin = (b) => (b.spares ? `${enTexte(b.besoin)}, ${enTexte(b.auMur)} au mur + ${enTexte(b.spares)} de spare` : `${enTexte(b.auMur)} au mur, sans spare`);

// Une fiche du mur contre son stock : suffit, spares incomplets, manque, inconnu (lot sans quantité, sans alerte
// devinée), non saisi.
function controleFiche(b, lots, pris, parcNom) {
  const stock = stockFiche(lots);
  const base = { ...b, stock, pris, disponible: 0, etat: 'non-saisi', manque: 0, alerte: null };
  if (!stock.saisi) return { ...base, lignes: [`Stock ${b.nom} non saisi dans le parc ${parcNom}`] };
  const disponible = Math.max(0, stock.quantite - pris.nombre);
  const auMoins = stock.connu ? '' : 'au moins ';
  const mot = pris.nombre ? 'disponibles' : 'en stock';
  const lignes = [
    `Stock ${b.nom} : ${auMoins}${enTexte(stock.quantite)} dans le parc ${parcNom}${textePris(pris)}`
      + (stock.connu ? '' : `, ${lotsSans(stock.sansQuantite)} sans quantité, à préciser dans le parc`),
    `À sortir : ${texteBesoin(b)}`,
  ];
  let etat;
  let alerte = null;
  if (disponible >= b.besoin) {
    etat = 'suffit';
    lignes.push(`Stock suffisant : ${auMoins}${enTexte(disponible)} ${mot} pour ${enTexte(b.besoin)}.`);
  } else if (!stock.connu) {
    etat = 'inconnu';
    lignes.push(`Stock à préciser : au moins ${enTexte(disponible)} connus pour ${enTexte(b.besoin)}.`);
  } else if (disponible >= b.auMur) {
    etat = 'spares-incomplets';
    alerte = `Spares incomplets, ${b.nom} : ${enTexte(disponible - b.auMur)} sur ${enTexte(b.spares)} (${enTexte(disponible)} ${mot} pour ${enTexte(b.auMur)} au mur + ${enTexte(b.spares)} de spare).`;
  } else {
    etat = 'manque';
    alerte = `Il en manque ${enTexte(b.besoin - disponible)} × ${b.nom} : ${enTexte(disponible)} ${mot} pour ${texteBesoin(b)}.`;
  }
  if (alerte) lignes.push(alerte);
  const manque = etat === 'spares-incomplets' || etat === 'manque' ? b.besoin - disponible : 0;
  return { ...base, disponible, etat, manque, alerte, lignes };
}

// Stock du parc pour le mur ouvert. `parc` : { nom, lots } (null en « Tous » : rien) ; `autres` : les autres murs de la
// presta du même parc, { nom, liste } (liste gardée, null si jamais ouverte).
export function controleStock(entrees) {
  const { dalle, parc, autres = [], sparesPourcent = SPARES_POURCENT_DEFAUT } = entrees;
  if (!parc) return null;
  const m = entrees.mur;
  const fichesMur = besoinDalles(m, dalle, sparesPourcent)
    .map((b) => controleFiche(b, parc.lots?.[idStock(b.ficheId)], prisAutresMurs(autres, b.ficheId), parc.nom));
  const alertes = fichesMur.map((f) => f.alerte).filter(Boolean);
  return {
    parcNom: parc.nom,
    sparesPourcent,
    fiches: fichesMur,
    manque: alertes.length > 0,
    alertes,
    notes: prisAutresMurs(autres, null).nonComptes.map((nom) => `${nom} : ouvre ce mur une fois pour compter son matériel.`),
  };
}

// ---------------------------------------------------------------------------
// Plus grand mur possible avec le stock
// ---------------------------------------------------------------------------

function texteEcart(e) {
  const parts = [];
  const un = (x, mot) => `${x > 0 ? '+' : '−'}${enTexte(Math.abs(x))} ${mot}${Math.abs(x) > 1 ? 's' : ''}`;
  if (e.colonnes) parts.push(un(e.colonnes, 'colonne'));
  if (e.lignes) parts.push(un(e.lignes, 'ligne'));
  return parts.length ? parts.join(', ') : 'même taille';
}

// Proportions : cible (Taille en m, Résolution en px), mur saisi (Dalles, en m), 16:9 sans saisie.
function proportionDe(demande, m) {
  if (demande?.mode === 'taille') return { origine: 'cible', unite: 'mm', largeur: demande.largeurMm, hauteur: demande.hauteurMm };
  if (demande?.mode === 'resolution') return { origine: 'cible', unite: 'px', largeur: demande.largeurPx, hauteur: demande.hauteurPx };
  if (demande?.mode === 'dalles') return { origine: 'saisie', unite: 'mm', largeur: m.largeurMm, hauteur: m.hauteurMm };
  return { origine: 'défaut', unite: 'mm', largeur: 16, hauteur: 9 };
}

// Affiché seulement quand le stock connu manque (dalles + spares). Parmi les murs « à la forme » (largeur idéale pour
// ces lignes, ou hauteur idéale pour ces colonnes, à moins d'une dalle), celui qui a le plus de dalles ; à égalité, le
// rapport le plus proche, puis le moins de lignes. Demi-dalles : même rangée que la saisie, contre leur propre stock.
// Un stock inconnu ou non saisi ne limite pas. Puis les variantes à ±1 colonne ou ligne qui tiennent aussi.
export function plusGrandMur(entrees) {
  const { dalle, demande = null, controle } = entrees;
  const m = entrees.mur;
  if (!controle?.fiches.some((f) => f.etat === 'manque' || f.etat === 'spares-incomplets')) return null;
  if (m.zones?.length) return { refus: 'Mur en zones : réduis une zone à la main.' };
  const pourcent = controle.sparesPourcent ?? SPARES_POURCENT_DEFAUT;
  const rangeeDemi = Boolean(m.rangeeDemi);
  const demi = rangeeDemi ? m.demi : null;
  const limite = (id) => {
    const f = controle.fiches.find((x) => x.ficheId === id);
    return f?.stock.connu ? f.disponible : null;
  };
  const dEntieres = limite(dalle.id);
  const dDemi = demi ? limite(demi.id) : null;
  const proportion = proportionDe(demande, m);
  const px = proportion.unite === 'px';
  const w = px ? dalle.pxH : dalle.largeurMm;
  const h = px ? dalle.pxV : dalle.hauteurMm;
  const hd = demi ? (px ? demi.pxV : demi.hauteurMm) : 0;
  const r = proportion.largeur / proportion.hauteur;

  const tient = (c, l) => {
    if (c < 1 || l < 1) return false;
    const e = c * l;
    if (e + (rangeeDemi ? c : 0) > DALLES_MAX_MUR) return false;
    if (dEntieres !== null && e + spares(e, pourcent) > dEntieres) return false;
    if (rangeeDemi && dDemi !== null && c + spares(c, pourcent) > dDemi) return false;
    return true;
  };
  const cMax = Math.min(DALLES_MAX_MUR, dEntieres ?? (rangeeDemi && dDemi !== null ? dDemi : DALLES_MAX_MUR));
  const lIdeal = (c) => (c * w / r - hd) / h;
  const cIdeal = (l) => ((l * h + hd) * r) / w;
  const lMax = Math.min(DALLES_MAX_MUR, dEntieres ?? Math.ceil(lIdeal(cMax)) + 1);
  const candidats = new Map();
  const retenir = (c, l) => {
    if (tient(c, l)) candidats.set(`${c}×${l}`, [c, l]);
  };
  for (let c = 1; c <= cMax; c += 1) {
    const x = lIdeal(c);
    retenir(c, Math.floor(x));
    retenir(c, Math.ceil(x));
  }
  for (let l = 1; l <= lMax; l += 1) {
    const x = cIdeal(l);
    if (Math.floor(x) <= cMax) retenir(Math.floor(x), l);
    if (Math.ceil(x) <= cMax) retenir(Math.ceil(x), l);
  }
  const total = ([c, l]) => c * l + (rangeeDemi ? c : 0);
  const ecartRapport = ([c, l]) => Math.abs(Math.log((c * w) / (l * h + hd) / r));
  const tries = [...candidats.values()].sort((a, b) => total(b) - total(a) || ecartRapport(a) - ecartRapport(b) || a[1] - b[1]);
  if (!tries.length) return { refus: 'Stock trop petit pour une seule dalle et son spare.' };

  const construire = (c, l) => {
    const mm = mur(dalle, c, l, { demi, rangeeDemi, positionDemi: m.positionDemi ?? 'bas' });
    const sp = spares(c * l, pourcent);
    const spDemi = rangeeDemi ? spares(c, pourcent) : 0;
    const ecart = { colonnes: c - m.colonnes, lignes: l - m.lignes, dalles: mm.dalles.total - m.dalles.total };
    const texteSp = (x, s) => (s ? `${enTexte(x)} + ${enTexte(s)} de spare` : `${enTexte(x)}, sans spare`);
    const texte = `${enTexte(c)} × ${enTexte(l)} dalles${rangeeDemi ? ` et ${enTexte(c)} demi-dalles` : ''}, ${nombreCourt(mm.largeurMm / 1000, 3)} × ${nombreCourt(mm.hauteurMm / 1000, 3)} m, `
      + `${enTexte(mm.pxLargeur)} × ${enTexte(mm.pxHauteur)} px : ${texteSp(c * l, sp)}${rangeeDemi ? `, demi-dalles ${texteSp(c, spDemi)}` : ''} (${texteEcart(ecart)})`;
    return { mur: mm, spares: sp, sparesDemi: spDemi, besoin: c * l + sp, besoinDemi: rangeeDemi ? c + spDemi : 0, ecart, texte };
  };
  const [c, l] = tries[0];
  return {
    proportion,
    mur: construire(c, l),
    variantes: VARIANTES.filter(({ dc, dl }) => tient(c + dc, l + dl)).map(({ libelle, dc, dl }) => ({ libelle, ...construire(c + dc, l + dl) })),
  };
}

// ---------------------------------------------------------------------------
// Processeurs du parc (étape 15c)
// ---------------------------------------------------------------------------

// Nombre de processeurs retenus face au nombre saisi dans le parc (null sans nombre, ou processeur impossible).
export function controleQuantiteProcesseur(evaluation, quantite, parcNom) {
  if (!Number.isInteger(quantite) || !Number.isInteger(evaluation?.nombre)) return null;
  const modele = evaluation.processeur.modele;
  const assez = evaluation.nombre <= quantite;
  return {
    quantite,
    parcNom,
    assez,
    ligne: `Dans le parc ${parcNom} : ${enTexte(quantite)} × ${modele}`,
    alerte: assez ? null : `Il en faut ${enTexte(evaluation.nombre)} × ${modele}, le parc ${parcNom} en a ${enTexte(quantite)}.`,
  };
}

// ---------------------------------------------------------------------------
// Total de la presta contre le stock de chaque parc
// ---------------------------------------------------------------------------

// `murs` : { nom, parc (identifiant ou null), liste (gardée, null si jamais ouverte : déjà signalée par le total) } ;
// `parcs` : ceux de la base ({ id, nom, lots, quantites }). Une ligne par parc et par fiche, murs sans parc en dernier ;
// processeurs (15c) : seulement ceux dont le nombre est saisi dans leur parc.
export function stockPresta(murs, parcs) {
  const groupes = new Map();
  for (const mu of murs) {
    if (!mu.liste) continue;
    const parc = mu.parc ? (parcs ?? []).find((p) => p.id === mu.parc) ?? null : null;
    for (const l of mu.liste.sections.find((s) => s.id === 'dalles')?.lignes ?? []) {
      const cle = `${parc?.id ?? ''}|${idStock(l.ficheId)}`;
      const g = groupes.get(cle) ?? { parc, genre: 'dalle', ficheId: idStock(l.ficheId), designation: l.designation, total: 0 };
      g.total += l.quantite;
      groupes.set(cle, g);
    }
    for (const l of mu.liste.sections.find((s) => s.id === 'data')?.lignes ?? []) {
      const procId = l.cle.startsWith('processeur|') ? l.cle.slice('processeur|'.length) : null;
      if (!procId || !parc || !Number.isInteger(parc.quantites?.[procId])) continue;
      const cle = `${parc.id}|processeur|${procId}`;
      const g = groupes.get(cle) ?? { parc, genre: 'processeur', procId, designation: l.designation, total: 0 };
      g.total += l.quantite;
      groupes.set(cle, g);
    }
  }
  const lignes = [...groupes.values()].sort((a, b) => Number(!a.parc) - Number(!b.parc)).map((g) => {
    const quantite = g.total;
    const tete = `${enTexte(quantite)} × ${g.designation}`;
    const ligne = {
      cle: g.genre === 'processeur' ? `processeur|${g.procId}` : `dalle|${g.ficheId}`, genre: g.genre, ficheId: g.ficheId ?? null,
      parcId: g.parc?.id ?? null, parcNom: g.parc?.nom ?? null, designation: g.designation, quantite,
    };
    if (!g.parc) return { ...ligne, stock: null, etat: 'sans-parc', manque: 0, texte: `${tete} : pas de parc, stock non contrôlé` };
    const stock = g.genre === 'processeur'
      ? { saisi: true, quantite: g.parc.quantites[g.procId], sansQuantite: 0, connu: true }
      : stockFiche(g.parc.lots?.[g.ficheId]);
    const dans = `dans le parc ${g.parc.nom}`;
    if (!stock.saisi) return { ...ligne, stock, etat: 'non-saisi', manque: 0, texte: `${tete} : stock non saisi ${dans}` };
    const auMoins = stock.connu ? '' : 'au moins ';
    if (stock.quantite >= quantite) return { ...ligne, stock, etat: 'suffit', manque: 0, texte: `${tete} : stock ${auMoins}${enTexte(stock.quantite)} ${dans}, suffit` };
    if (!stock.connu) {
      return { ...ligne, stock, etat: 'inconnu', manque: 0, texte: `${tete} : stock au moins ${enTexte(stock.quantite)} ${dans}, ${lotsSans(stock.sansQuantite)} sans quantité, à préciser` };
    }
    const manque = quantite - stock.quantite;
    return { ...ligne, stock, etat: 'manque', manque, texte: `${tete} : stock ${enTexte(stock.quantite)} ${dans}, il en manque ${enTexte(manque)}` };
  });
  return {
    lignes,
    manques: lignes.filter((l) => l.etat === 'manque')
      .map((l) => `Il en manque ${enTexte(l.manque)} × ${l.designation} dans le parc ${l.parcNom} (stock ${enTexte(l.stock.quantite)} pour ${enTexte(l.quantite)}).`),
  };
}
