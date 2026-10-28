// Sauvegarde du planning des piges (étape 23, lot 23d, spec § 6.8) : export et import en JSON (format
// appli-mur-led/planning) de l'historique, des cases Intermittent et des repères des boîtes, pour changer de téléphone.
// Jamais l'adresse du relais ni les jetons : seuls les champs de la liste blanche sont écrits et relus. Fonctions pures.

import { dateParis } from './ics.js';
import { journeesDeEtat } from './journees.js';

export const FORMAT_PLANNING = 'appli-mur-led/planning';
const VERSION = 1;
const ILLISIBLE = 'Fichier illisible : ce n\'est pas un export du planning.';

export const nomFichierPlanning = (maintenant) => `mur-led-planning-${dateParis(maintenant)}.json`;

// ---------------------------------------------------------------------------
// Liste blanche : chaque valeur relue ou écrite passe par ces fonctions ; tout autre champ est laissé de côté.

const objet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const texte = (x) => (typeof x === 'string' ? x : '');
const nombre = (x) => (Number.isFinite(x) ? x : null);
const idValide = (id) => typeof id === 'string' && /^[a-z0-9-]+$/.test(id);

function repere(b) {
  if (!objet(b) || !idValide(b.id) || !/^#[0-9a-f]{6}$/i.test(b.couleur ?? '')) return null;
  const lettre = texte(b.lettre).slice(0, 1);
  return { id: b.id, nom: texte(b.nom).slice(0, 80) || b.id, affichage: texte(b.affichage).slice(0, 40) || texte(b.nom) || b.id, couleur: b.couleur, lettre: lettre || '?' };
}

const resume = (a) => (objet(a) && nombre(a.debut) !== null && nombre(a.fin) !== null
  ? { debut: a.debut, fin: a.fin, presta: texte(a.presta), phase: texte(a.phase), lieu: texte(a.lieu), client: texte(a.client) }
  : null);

function evenement(ev) {
  if (!objet(ev) || !texte(ev.uid) || nombre(ev.debut) === null || nombre(ev.fin) === null) return null;
  const geo = objet(ev.geo) && nombre(ev.geo.lat) !== null && nombre(ev.geo.lon) !== null ? { lat: ev.geo.lat, lon: ev.geo.lon } : null;
  return {
    uid: ev.uid, debut: ev.debut, fin: ev.fin, presta: texte(ev.presta), phase: texte(ev.phase), lieu: texte(ev.lieu), client: texte(ev.client),
    geo, indispo: ev.indispo === true, aVerifier: ev.aVerifier === true, journeeEntiere: ev.journeeEntiere === true,
  };
}

function changement(c) {
  if (!objet(c) || !['nouveau', 'modifie'].includes(c.type) || nombre(c.le) === null) return null;
  return c.type === 'modifie' ? { type: c.type, le: c.le, ancien: resume(c.ancien) } : { type: c.type, le: c.le };
}

function entree(e, uid) {
  const ev = evenement(e?.ev);
  if (!ev || ev.uid !== uid) return null;
  return { ev, empreinte: texte(e.empreinte), change: changement(e.change), retiree: nombre(e.retiree), horsFenetre: e.horsFenetre === true };
}

function saisie(s) {
  if (!objet(s) || !Array.isArray(s.uids) || !s.uids.length || !s.uids.every((u) => typeof u === 'string')) return null;
  return { uids: [...s.uids], empreinte: texte(s.empreinte), date: texte(s.date), le: nombre(s.le) };
}

const nettoyees = (source, fonction) => Object.fromEntries(Object.entries(objet(source) ? source : {})
  .map(([cle, x]) => [cle, fonction(x, cle)]).filter(([, x]) => x !== null));

// État d'une boîte : dernière lecture, phases et saisies ; jamais son erreur (elle peut citer une adresse).
const etatBoite = (eb) => ({ lu: nombre(eb?.lu), vu: nombre(eb?.vu), phases: nettoyees(eb?.phases, entree), saisies: nettoyees(eb?.saisies, saisie), erreur: null });

const etatBoites = (boites) => Object.fromEntries(Object.entries(objet(boites) ? boites : {}).filter(([id]) => idValide(id)).map(([id, eb]) => [id, etatBoite(eb)]));

// ---------------------------------------------------------------------------

// Contenu du fichier exporté.
export function exporterPlanning(reglages, etat, maintenant) {
  return {
    format: FORMAT_PLANNING,
    version: VERSION,
    exporte: maintenant,
    boites: (reglages?.boites ?? []).map(repere).filter(Boolean),
    etat: { boites: etatBoites(etat?.boites) },
  };
}

// Texte d'un fichier choisi : { ok, donnees } ou { ok: false, erreur }.
export function lireExportPlanning(contenu) {
  let brut;
  try {
    brut = JSON.parse(contenu);
  } catch {
    return { ok: false, erreur: ILLISIBLE };
  }
  if (!objet(brut) || brut.format !== FORMAT_PLANNING || brut.version !== VERSION || !Array.isArray(brut.boites) || !objet(brut.etat) || !objet(brut.etat.boites)) {
    return { ok: false, erreur: ILLISIBLE };
  }
  return { ok: true, donnees: { exporte: nombre(brut.exporte), boites: brut.boites.map(repere).filter(Boolean), etat: { boites: etatBoites(brut.etat.boites) } } };
}

const reglagesVidesSiBesoin = (r) => ({ relais: null, jeton: null, jetonApple: null, ...(r ?? {}) });
const pluriel = (n, mot, suite = '') => `${n} ${mot}${n > 1 ? 's' : ''}${suite}`;

// Import d'un fichier relu par lireExportPlanning : ajoute seulement ce qui manque. Le téléphone garde ses propres phases,
// lectures, repères et réglages (adresse du relais et jetons jamais touchés). Une phase du fichier absente du téléphone
// n'est pas ajoutée si elle tombe dans la fenêtre que le téléphone a lue après le fichier (retirée depuis) ; une case
// Intermittent n'est ajoutée que si ses phases sont là et qu'aucune case du téléphone ne les couvre.
// Renvoie { reglages, etat, texte }.
export function importerPlanning(reglages, etat, donnees) {
  const avant = { boites: {}, essai: null, ...(etat ?? {}) };
  const clesAvant = new Set(journeesDeEtat(avant).map((j) => j.cle));
  const boites = { ...avant.boites };
  let phasesAjoutees = 0;
  let casesAjoutees = 0;
  for (const [id, imp] of Object.entries(donnees.etat.boites)) {
    const local = boites[id] ? { lu: null, vu: null, phases: {}, saisies: {}, erreur: null, ...boites[id] } : null;
    const phases = { ...(local?.phases ?? {}) };
    const lues = Object.values(phases).filter((e) => !e.retiree && !e.horsFenetre).map((e) => e.ev.debut);
    const fenetre = local?.lu != null && lues.length ? Math.min(...lues) : Infinity;
    for (const [uid, e] of Object.entries(imp.phases)) {
      if (phases[uid]) continue;
      if (!e.retiree && !e.horsFenetre && local?.lu != null && (imp.lu ?? 0) <= local.lu && e.ev.debut >= fenetre) continue;
      phases[uid] = e;
      phasesAjoutees += 1;
    }
    const saisies = { ...(local?.saisies ?? {}) };
    const couvertes = new Set(Object.values(saisies).flatMap((s) => s.uids));
    for (const [cle, s] of Object.entries(imp.saisies)) {
      if (saisies[cle] || s.uids.some((u) => couvertes.has(u)) || !s.uids.some((u) => phases[u])) continue;
      saisies[cle] = s;
      casesAjoutees += 1;
    }
    boites[id] = local ? { ...local, phases, saisies } : { ...imp, phases, saisies };
  }
  const connues = new Set((reglages?.boites ?? []).map((b) => b.id));
  const nouvelles = donnees.boites.filter((b) => !connues.has(b.id));
  const apres = { ...avant, boites };
  const journees = journeesDeEtat(apres).filter((j) => !clesAvant.has(j.cle)).length;

  const parties = [
    journees ? pluriel(journees, 'journée') : null,
    casesAjoutees ? pluriel(casesAjoutees, 'case', ' Intermittent') : null,
    nouvelles.length ? pluriel(nouvelles.length, 'boîte') : null,
  ].filter(Boolean);
  const nombres = [journees, casesAjoutees, nouvelles.length].filter(Boolean);
  let resumeTexte;
  if (parties.length) {
    const liste = parties.length > 1 ? `${parties.slice(0, -1).join(', ')} et ${parties.at(-1)}` : parties[0];
    resumeTexte = `Planning importé : ${liste} ajoutée${parties.length > 1 || nombres[0] > 1 ? 's' : ''}.`;
  } else if (phasesAjoutees) {
    resumeTexte = 'Planning importé : indisponibilités ou dates retirées ajoutées, aucune nouvelle journée.';
  } else resumeTexte = 'Planning importé : rien de nouveau, tout était déjà sur ce téléphone.';

  return {
    reglages: { ...reglagesVidesSiBesoin(reglages), boites: [...(reglages?.boites ?? []), ...nouvelles] },
    etat: apres,
    texte: resumeTexte,
  };
}
