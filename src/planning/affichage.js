// Mise en forme du planning (étape 23, spec § 7) : dates courtes, horaires, lien Plans, état de chaque boîte, journées
// à venir et passées, retirées, indisponibilités, filtre par boîte (lot 23c1) ; alertes de conflit sur les cartes,
// grille du mois et tableau des totaux (lot 23c2) ; case Intermittent, alertes après saisie, texte à copier et filtre
// « À saisir » (lot 23d) ; durée de travail de chaque journée (lot 23d2) ; poste et devis de chaque journée (étape 25,
// lot 25e1). Fonctions pures.

import { dateParis, partiesParis } from './ics.js';
import {
  heure, duree, jourMois, construireJournees, journeesDeEtat, phasesActives, phasesRetirees, nombreNouvelles, conflits, totaux,
  alertesSaisies, texteIntermittent,
} from './journees.js';
import { PALETTE_BOITES } from './reglages.js';
import { liensDevis, devisDeJournee, avecPoste } from './devis.js';

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const HEURE = 3600000;
const JOUR = 86400000;
const jourUtc = (date) => {
  const [a, m, j] = date.split('-').map(Number);
  return Date.UTC(a, m - 1, j);
};
const ecartJours = (de, a) => Math.round((jourUtc(a) - jourUtc(de)) / JOUR);
const decaler = (date, jours) => new Date(jourUtc(date) + jours * JOUR).toISOString().slice(0, 10);

// « sam. 24/10 » à partir de « 2026-10-24 ».
export function dateCourte(date) {
  return `${JOURS_COURTS[new Date(jourUtc(date)).getUTCDay()]} ${jourMois(date)}`;
}

// Instant à minuit pile (heure de Paris).
const aMinuit = (ms) => {
  const p = partiesParis(ms);
  return p.heure === 0 && p.minute === 0 && p.seconde === 0;
};

// « 8 h – 18 h », « 19 h – 3 h +1 j » (fin le lendemain), « 18 h – minuit ». `date` : date de la journée.
export function horaires(debut, fin, date = dateParis(debut)) {
  const minuit = aMinuit(fin) && fin > debut;
  const jourFin = minuit ? decaler(dateParis(fin), -1) : dateParis(fin);
  const plus = ecartJours(date, jourFin);
  return `${heure(debut)} – ${minuit ? 'minuit' : heure(fin)}${plus > 0 ? ` +${plus} j` : ''}`;
}

// Lien vers Plans quand l'événement a une position (GEO).
export function lienPlans(geo) {
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return null;
  return `https://maps.apple.com/?q=${geo.lat},${geo.lon}`;
}

const leA = (ms) => `${jourMois(dateParis(ms))} à ${heure(ms)}`;
export const misAJour = (ms) => `Mis à jour le ${leA(ms)}`;

// Repère d'une boîte (réglages), avec des valeurs de secours pour une boîte sans réglage.
function reperes(reglages) {
  const parId = new Map((reglages?.boites ?? []).map((b) => [b.id, b]));
  return (id) => {
    const b = parId.get(id);
    return { nom: b?.affichage || b?.nom || id, lettre: b?.lettre ?? '?', couleur: b?.couleur ?? PALETTE_BOITES[0] };
  };
}

// État de chaque boîte : « Mis à jour le 27/10 à 14 h 05 », ou son erreur avec la date de ses données.
export function etatBoites(etat, reglages) {
  const repere = reperes(reglages);
  return (reglages?.boites ?? []).filter((b) => !b.absente).map((b) => {
    const eb = etat?.boites?.[b.id];
    const { nom } = repere(b.id);
    if (!eb) return { boite: b.id, nom, erreur: false, texte: 'Jamais lue' };
    if (eb.erreur) return { boite: b.id, nom, erreur: true, texte: `${eb.erreur.texte}, ${eb.lu ? `données du ${leA(eb.lu)}` : 'aucune donnée'}` };
    return { boite: b.id, nom, erreur: false, texte: misAJour(eb.lu) };
  });
}

const distincts = (valeurs) => [...new Set(valeurs.filter(Boolean))];

// Alertes de conflit (§ 6.6) de chaque journée, par clé : calculées sur toutes les boîtes, même masquées par le filtre
// (un conflit avec une boîte masquée reste un conflit), avec le nom affiché des boîtes.
function alertesParJournee(actives, repere) {
  const noms = Object.fromEntries([...new Set(actives.map((j) => j.boite))].map((id) => [id, repere(id).nom]));
  const parCle = new Map();
  for (const c of conflits(actives, noms)) {
    for (const cle of new Set(c.journees)) {
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle).push({ type: c.type, texte: c.texte });
    }
  }
  return parCle;
}

// Saisies Intermittent de toutes les boîtes, avec leurs alertes « Modifiée » ou « Retirée après saisie » (§ 6.8).
function saisiesParBoite(etat, actives) {
  return Object.entries(etat?.boites ?? {}).flatMap(([boite, eb]) => {
    const alertes = new Map(alertesSaisies(eb, actives.filter((j) => j.boite === boite)).map((a) => [a.cle, a]));
    return Object.entries(eb?.saisies ?? {}).map(([cle, s]) => {
      const a = alertes.get(cle);
      return { boite, uids: s.uids, alerte: a ? { boite, cle, type: a.type, texte: a.texte } : null };
    });
  });
}

// Devis de chaque journée : `devis` = { garde, base } (option des vues), null sans devis gardé.
function devisJournees(devis, etat) {
  if (!devis?.garde) return () => null;
  const liens = liensDevis(devis.garde, phasesActives(etat));
  return (j) => {
    const touches = j.uids.map((u) => liens.get(u)).filter(Boolean);
    return devisDeJournee(touches.find((l) => l.presta) ?? touches[0] ?? null, j.date, devis.garde, devis.base);
  };
}

function carte(j, repere, retiree = null, alertes = [], saisies = [], devis = null) {
  const r = repere(j.boite);
  const liees = saisies.filter((s) => s.boite === j.boite && s.uids.some((u) => j.uids.includes(u)));
  const alerteSaisie = liees.map((s) => s.alerte).find((a) => a && a.type === (retiree ? 'retiree' : 'modifiee')) ?? null;
  const anciens = (j.anciens ?? []).map((a) => {
    const date = dateParis(a.debut);
    const lieu = a.lieu && a.lieu !== j.lieu ? `, ${a.lieu}` : '';
    return `Avant : ${date !== j.date ? `${dateCourte(date)}, ` : ''}${horaires(a.debut, a.fin, date)}${lieu}`;
  });
  return {
    cle: retiree ? `${j.cle}|retiree` : j.cle, boite: j.boite, nom: r.nom, lettre: r.lettre, couleur: r.couleur,
    date: j.date, jour: dateCourte(j.date), debut: j.debut, horaires: horaires(j.debut, j.fin, j.date),
    duree: `${duree(j.heures * HEURE)} de travail`,
    presta: j.presta, phases: distincts(j.phases.map((p) => p.phase)).join(', '),
    lieu: j.lieu, autresLieux: j.autresLieux, client: j.client, autresClients: j.autresClients, plans: lienPlans(j.geo),
    nouveau: !retiree && Boolean(j.nouveau), modifie: !retiree && Boolean(j.modifie), ancien: retiree ? [] : anciens,
    retiree: retiree ? `Retirée du planning de ${r.nom} le ${jourMois(dateParis(retiree))}` : null,
    aVerifier: Boolean(j.aVerifier),
    alertes, conflit: alertes.some((a) => a.type === 'conflit'), repos: alertes.some((a) => a.type === 'repos'),
    saisie: retiree ? liees.length > 0 : Boolean(j.saisie), alerteSaisie, copie: retiree ? null : avecPoste(texteIntermittent(j, r.nom), devis?.postes),
    devis: retiree ? null : devis,
  };
}

// Journée à saisir dans Intermittent : sans la case (dates retirées exclues), ou en alerte après saisie.
const aSaisirCarte = (c) => (!c.retiree && !c.saisie) || Boolean(c.alerteSaisie);

// Dernier jour touché par un créneau (une fin à minuit pile ne touche pas le lendemain).
const dernierJour = (p) => (aMinuit(p.fin) && p.fin > p.debut ? decaler(dateParis(p.fin), -1) : dateParis(p.fin));

// Jours touchés par une indisponibilité, du premier au dernier.
function joursCouverts(p) {
  const jours = [];
  for (let d = dateParis(p.debut), fin = dernierJour(p); d <= fin && jours.length < 400; d = decaler(d, 1)) jours.push(d);
  return jours.length ? jours : [dateParis(p.debut)];
}

// Texte d'une indisponibilité : une journée entière, un créneau, ou plusieurs jours (dates seules).
function texteIndispo(p, nom) {
  const debut = dateParis(p.debut);
  const dernier = dernierJour(p);
  if (dernier !== debut) return `${nom} : indisponible du ${dateCourte(debut)} au ${dateCourte(dernier)}`;
  if (aMinuit(p.debut) && aMinuit(p.fin)) return `${nom} : indisponible le ${dateCourte(debut)}`;
  return `${nom} : indisponible le ${dateCourte(debut)}, ${horaires(p.debut, p.fin, debut)}`;
}

// Liste : journées à venir (aujourd'hui en premier), puis passées (les plus récentes d'abord), retirées comprises
// (barrées) ; indisponibilités à part, à venir et passées. `boites` : identifiants gardés par le filtre (toutes sinon) ;
// `aSaisir` : seulement les journées à saisir dans Intermittent, sans indisponibilités. `nombreASaisir` : leur nombre,
// avec le filtre par boîte. `devis` : { garde, base }, poste et devis sur les cartes (lot 25e1).
export function vueListe(etat, reglages, maintenant, { boites = null, aSaisir = false, devis = null } = {}) {
  const garder = (id) => !boites || boites.includes(id);
  const repere = reperes(reglages);
  const aujourdhui = dateParis(maintenant);
  const actives = etat?.boites ? journeesDeEtat(etat) : [];
  const retirees = etat?.boites ? phasesRetirees(etat) : [];
  const alertes = alertesParJournee(actives, repere);
  const saisies = saisiesParBoite(etat, actives);
  const devisDe = devisJournees(devis, etat);
  const toutes = [
    ...actives.filter((j) => garder(j.boite)).map((j) => carte(j, repere, null, alertes.get(j.cle) ?? [], saisies, devisDe(j))),
    ...construireJournees(retirees.map((p) => ({ ...p, indispo: false })))
      .filter((j) => garder(j.boite))
      .map((j) => carte(j, repere, Math.max(...j.phases.map((p) => p.retiree)), [], saisies)),
  ];
  const cartes = aSaisir ? toutes.filter(aSaisirCarte) : toutes;
  const indispos = (etat?.boites && !aSaisir ? phasesActives(etat) : []).filter((p) => p.indispo && garder(p.boite))
    .map((p) => ({ boite: p.boite, ...repere(p.boite), date: dateParis(p.debut), debut: p.debut, fin: p.fin, texte: texteIndispo(p, repere(p.boite).nom) }));
  return {
    aVenir: cartes.filter((c) => c.date >= aujourdhui).sort((a, b) => a.debut - b.debut),
    passees: cartes.filter((c) => c.date < aujourdhui).sort((a, b) => b.debut - a.debut),
    indisposAVenir: indispos.filter((i) => i.fin > maintenant).sort((a, b) => a.debut - b.debut),
    indisposPassees: indispos.filter((i) => i.fin <= maintenant).sort((a, b) => b.debut - a.debut),
    nouvelles: etat?.boites ? nombreNouvelles(etat) : 0,
    nombreASaisir: toutes.filter(aSaisirCarte).length,
  };
}

// ---------------------------------------------------------------------------
// Vue Mois (lot 23c2) : grille du lundi au dimanche ; sur chaque jour du mois, une pastille par boîte qui y a une journée
// (ordre des réglages), hachures pour une indisponibilité seule (aucune journée affichée ce jour-là), marque de conflit
// ou de repos court sur la date de chaque journée citée qui est affichée. `jour` : date touchée, ses journées (retirées
// comprises) et ses indisponibilités sous la grille.

const moisValide = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? '');
const dateValide = (d) => /^\d{4}-\d\d-\d\d$/.test(d ?? '');
const moisVoisin = (m, n) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const titreMois = (m) => `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function vueMois(etat, reglages, maintenant, { mois = null, boites = null, jour = null, devis = null } = {}) {
  const garder = (id) => !boites || boites.includes(id);
  const repere = reperes(reglages);
  const aujourdhui = dateParis(maintenant);
  const m = moisValide(mois) ? mois : aujourdhui.slice(0, 7);
  const ordre = (reglages?.boites ?? []).map((b) => b.id);
  const rang = (id) => (ordre.includes(id) ? ordre.indexOf(id) : ordre.length);
  const actives = etat?.boites ? journeesDeEtat(etat) : [];
  const parDate = new Map();
  for (const j of actives.filter((x) => garder(x.boite))) {
    if (!parDate.has(j.date)) parDate.set(j.date, new Set());
    parDate.get(j.date).add(j.boite);
  }
  const indispos = phasesActives(etat).filter((p) => p.indispo && garder(p.boite));
  const joursIndispo = new Set(indispos.flatMap(joursCouverts));
  const marques = { conflit: new Set(), repos: new Set() };
  const parCle = new Map(actives.map((j) => [j.cle, j]));
  for (const [cle, liste] of alertesParJournee(actives, repere)) {
    const j = parCle.get(cle);
    if (!j || !garder(j.boite)) continue;
    for (const a of liste) marques[a.type]?.add(j.date);
  }

  const cellule = (date) => {
    const numero = Number(date.slice(8, 10));
    if (date.slice(0, 7) !== m) return { date, numero, dansMois: false, aujourdhui: false, boites: [], indispo: false, conflit: false, repos: false, etiquette: dateCourte(date) };
    const ids = [...(parDate.get(date) ?? [])].sort((a, b) => rang(a) - rang(b));
    const c = {
      date, numero, dansMois: true, aujourdhui: date === aujourdhui,
      boites: ids.map((id) => ({ boite: id, ...repere(id) })),
      indispo: ids.length === 0 && joursIndispo.has(date),
      conflit: marques.conflit.has(date), repos: marques.repos.has(date),
    };
    c.etiquette = [dateCourte(date), c.aujourdhui && 'aujourd\'hui', ...c.boites.map((b) => b.nom), c.indispo && 'indisponible', c.conflit && 'conflit', c.repos && 'repos court']
      .filter(Boolean).join(', ');
    return c;
  };
  const premier = `${m}-01`;
  const dernier = decaler(`${moisVoisin(m, 1)}-01`, -1);
  const semaines = [];
  for (let d = decaler(premier, -((new Date(jourUtc(premier)).getUTCDay() + 6) % 7)); d <= dernier;) {
    const semaine = [];
    for (let i = 0; i < 7; i += 1, d = decaler(d, 1)) semaine.push(cellule(d));
    semaines.push(semaine);
  }

  let choisi = null;
  if (dateValide(jour) && jour.slice(0, 7) === m) {
    const liste = vueListe(etat, reglages, maintenant, { boites, devis });
    choisi = {
      date: jour, titre: dateCourte(jour),
      cartes: [...liste.aVenir, ...liste.passees].filter((c) => c.date === jour).sort((a, b) => a.debut - b.debut),
      indispos: indispos.filter((p) => joursCouverts(p).includes(jour)).sort((a, b) => a.debut - b.debut)
        .map((p) => ({ boite: p.boite, ...repere(p.boite), texte: texteIndispo(p, repere(p.boite).nom) })),
    };
  }
  return { mois: m, titre: titreMois(m), precedent: moisVoisin(m, -1), suivant: moisVoisin(m, 1), semaines, jour: choisi };
}

// ---------------------------------------------------------------------------
// Totaux (lot 23c2, § 6.7) : une colonne par boîte (ordre des réglages), une ligne par mois du plus récent au plus ancien,
// du premier au dernier mois qui a une journée (mois vides compris) ; le mois en cours en deux lignes, « à venir » puis
// « fait ». Total du mois avec ses dates différentes ; 12 derniers mois glissants ; journées à venir à part.

export const NOTE_HEURES = 'Heures planifiées dans Eventsoft, pas les heures payées.';
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const dateLongue = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const compteTexte = ({ journees, heures }) => ({ journees, heures, texte: `${journees} j`, heuresTexte: duree(heures * HEURE) });

export function vueTotaux(etat, reglages, maintenant, { boites = null } = {}) {
  const garder = (id) => !boites || boites.includes(id);
  const repere = reperes(reglages);
  const actives = (etat?.boites ? journeesDeEtat(etat) : []).filter((j) => garder(j.boite));
  const t = totaux(actives, maintenant);
  const avecJournees = new Set(actives.map((j) => j.boite));
  const ids = [
    ...(reglages?.boites ?? []).filter((b) => garder(b.id) && (!b.absente || avecJournees.has(b.id))).map((b) => b.id),
    ...[...avecJournees].filter((id) => !(reglages?.boites ?? []).some((b) => b.id === id)),
  ];
  const parMois = new Map(t.mois.map((x) => [x.mois, x]));
  const enCours = t.aujourdhui.slice(0, 7);
  const lignes = [];
  if (t.mois.length) {
    for (let m = t.mois.at(-1).mois; m >= t.mois[0].mois; m = moisVoisin(m, -1)) {
      const donnees = parMois.get(m);
      for (const partie of m === enCours ? ['à venir', 'fait'] : [null]) {
        const cle = partie === 'fait' ? 'fait' : 'aVenir';
        const compte = (x) => (partie ? x?.[cle] : x) ?? { journees: 0, heures: 0 };
        const dates = new Set(actives.filter((j) => j.date.slice(0, 7) === m && (!partie || (partie === 'fait') === (j.date <= t.aujourdhui))).map((j) => j.date));
        lignes.push({
          mois: m, partie, titre: partie ? `${titreMois(m)}, ${partie}` : titreMois(m),
          cellules: ids.map((id) => ({ boite: id, ...compteTexte(compte(donnees?.boites[id])) })),
          total: { ...compteTexte(compte(donnees?.total)), dates: dates.size, datesTexte: pluriel(dates.size, 'date') },
        });
      }
    }
  }
  const d = t.douzeMois;
  return {
    colonnes: ids.map((id) => ({ boite: id, ...repere(id) })),
    lignes,
    douzeMois: {
      ...d,
      titre: `12 derniers mois, du ${dateLongue(d.du)} au ${dateLongue(d.au)}`,
      texte: `${pluriel(d.journees, 'journée')}, ${duree(d.heures * HEURE)}, ${pluriel(d.joursDifferents, 'jour')} différent${d.joursDifferents > 1 ? 's' : ''}`,
      aVenirTexte: d.aVenir ? `+ ${pluriel(d.aVenir, 'journée')} à venir` : null,
    },
    note: NOTE_HEURES,
  };
}
