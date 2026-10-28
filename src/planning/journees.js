// Journées de travail du planning des piges (étape 23, spec § 6.4 à 6.8) : regroupement des phases, lectures
// successives (nouveautés, changements, historique), conflits entre boîtes, totaux par mois, fiche pour Intermittent.
// Fonctions pures, sans écran ni réseau. Une phase : un événement lu par ics.js, avec `boite` (identifiant).

import { dateParis, partiesParis, normaliser } from './ics.js';

const HEURE = 3600000;
const JOUR = 24 * HEURE;
// Rattachement à la veille (choix de conception, à confirmer sur les vrais plannings) : phase qui commence avant 6 h
// et au plus 10 h après la fin d'une phase de la même presta commencée la veille.
const RATTACHEMENT_AVANT = 6;
const ECART_RATTACHEMENT = 10 * HEURE;
// Repos quotidien de 11 h (Code du travail, art. L3131-1, à vérifier pour l'intermittence).
const REPOS_QUOTIDIEN = 11 * HEURE;
// Phase retirée du planning : gardée en gris 30 jours, puis oubliée (sauf journée saisie dans Intermittent).
const GARDE_RETIREES = 30 * JOUR;

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const deux = (n) => String(n).padStart(2, '0');

function decalerDate(date, jours) {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Mise en forme

// « 8 h », « 8 h 30 », heure de Paris.
export function heure(ms) {
  const p = partiesParis(ms);
  return `${p.heure} h${p.minute ? ` ${deux(p.minute)}` : ''}`;
}

// Durée : « 4 h », « 10 h 30 », « 45 min ».
export function duree(ms) {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m > 0) return `${m} min`;
  return `${h} h${m ? ` ${deux(m)}` : ''}`;
}

// « 12/06 » à partir de « 2026-06-12 ».
export const jourMois = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// ---------------------------------------------------------------------------
// Journées (§ 6.4)

// Durée de la réunion d'intervalles : deux phases qui se chevauchent ne comptent qu'une fois.
function dureeReunion(phases) {
  const tries = phases.map((p) => [p.debut, p.fin]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let debut = null;
  let fin = null;
  for (const [d, f] of tries) {
    if (fin === null || d > fin) {
      if (fin !== null) total += fin - debut;
      [debut, fin] = [d, f];
    } else fin = Math.max(fin, f);
  }
  return fin === null ? 0 : total + fin - debut;
}

const distincts = (valeurs) => [...new Set(valeurs.filter(Boolean))];

// Une journée = une boîte, une presta, une date (heure de Paris), avec ses phases de travail. Une phase qui commence
// avant 6 h est rattachée à la veille quand la même presta de la même boîte a une phase qui commence la veille (date
// du calendrier) et finit au plus 10 h avant elle ; une phase rattachée ne sert pas de veille (pas de cascade).
// Les indisponibilités sont laissées de côté.
export function construireJournees(phases) {
  const travail = phases.filter((p) => !p.indispo).sort((a, b) => a.debut - b.debut);
  const rattachees = new Set();
  const groupes = new Map();
  for (const p of travail) {
    let date = dateParis(p.debut);
    if (partiesParis(p.debut).heure < RATTACHEMENT_AVANT) {
      const veille = decalerDate(date, -1);
      const ancre = travail.find((q) => q !== p && !rattachees.has(q) && q.boite === p.boite
        && normaliser(q.presta) === normaliser(p.presta) && dateParis(q.debut) === veille
        && q.debut < p.debut && p.debut - q.fin <= ECART_RATTACHEMENT);
      if (ancre) {
        date = veille;
        rattachees.add(p);
      }
    }
    const cle = `${p.boite}|${normaliser(p.presta)}|${date}`;
    if (!groupes.has(cle)) groupes.set(cle, { cle, boite: p.boite, date, phases: [] });
    groupes.get(cle).phases.push(p);
  }
  return [...groupes.values()].map(({ cle, boite, date, phases: liste }) => {
    const lieux = distincts(liste.map((p) => p.lieu));
    const clients = distincts(liste.map((p) => p.client));
    return {
      cle, boite, date, presta: liste[0].presta,
      debut: Math.min(...liste.map((p) => p.debut)),
      fin: Math.max(...liste.map((p) => p.fin)),
      heures: dureeReunion(liste) / HEURE,
      phases: liste, uids: liste.map((p) => p.uid),
      lieu: lieux[0] ?? '', autresLieux: lieux.slice(1),
      client: clients[0] ?? '', autresClients: clients.slice(1),
      geo: liste.find((p) => p.geo)?.geo ?? null,
      aVerifier: liste.some((p) => p.aVerifier),
    };
  }).sort((a, b) => a.debut - b.debut || (a.cle < b.cle ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Lectures successives (§ 6.5). État d'une boîte : { lu, vu, phases: { uid: entrée }, saisies, erreur } ;
// entrée : { ev, empreinte, change: { type: 'nouveau' | 'modifie', le, ancien } | null, retiree, horsFenetre }.

// Empreinte d'une phase : début, fin, presta, phase, lieu, client (jamais DTSTAMP, LAST-MODIFIED ni SEQUENCE).
export function empreintePhase(ev) {
  return JSON.stringify([ev.debut, ev.fin, ev.presta, ev.phase, ev.lieu, ev.client]);
}

const resume = (ev) => ({ debut: ev.debut, fin: ev.fin, presta: ev.presta, phase: ev.phase, lieu: ev.lieu, client: ev.client });
const cleRapprochement = (ev) => JSON.stringify([normaliser(ev.presta), normaliser(ev.phase), dateParis(ev.debut), ev.indispo]);

// Compare une lecture (résultat de lireCalendrier) au dernier état gardé de la boîte. Première lecture : rien de
// nouveau. Phase absente : rapprochée d'une nouvelle de même presta, phase et date (« Modifié ») ; passée et plus
// ancienne que le flux, gardée dans l'historique sans limite ; sinon retirée (gardée 30 jours). Une boîte en erreur
// ne retire rien ; plus de la moitié des phases futures disparues : rien n'est retiré sans `confirmer`, `demande`
// porte la question.
export function appliquerLecture(etatBoite, lecture, maintenant, { nom = '', confirmer = false } = {}) {
  const avant = { lu: null, vu: null, phases: {}, saisies: {}, erreur: null, ...(etatBoite ?? {}) };
  const resultat = { nouveaux: [], modifies: [], retires: [], horsFenetre: [], demande: null, erreur: null };
  if (!lecture?.ok) {
    const texte = lecture?.erreur ?? `${nom || 'Planning'} : réponse illisible`;
    return { ...resultat, etat: { ...avant, erreur: { le: maintenant, texte } }, erreur: texte };
  }
  const premiere = avant.lu === null;
  const evenements = lecture.evenements;
  const lus = new Set(evenements.map((e) => e.uid));
  const debutFenetre = evenements.length > 0 ? Math.min(...evenements.map((e) => e.debut)) : Infinity;
  const saisies = Object.fromEntries(Object.entries(avant.saisies).map(([cle, s]) => [cle, { ...s, uids: [...s.uids] }]));
  const absents = Object.keys(avant.phases).filter((uid) => !lus.has(uid) && !avant.phases[uid].retiree && !avant.phases[uid].horsFenetre);
  const rapproches = new Set();
  const phases = {};

  for (const ev of evenements) {
    const empreinte = empreintePhase(ev);
    let ancienne = avant.phases[ev.uid];
    if (!ancienne) {
      const uidAncien = absents.find((u) => !rapproches.has(u) && cleRapprochement(avant.phases[u].ev) === cleRapprochement(ev));
      if (uidAncien) {
        rapproches.add(uidAncien);
        ancienne = avant.phases[uidAncien];
        for (const s of Object.values(saisies)) s.uids = s.uids.map((u) => (u === uidAncien ? ev.uid : u));
      }
    }
    let change = null;
    if (ev.indispo) change = null;
    else if (!ancienne) {
      if (!premiere) {
        change = { type: 'nouveau', le: maintenant };
        resultat.nouveaux.push(ev.uid);
      }
    } else if (ancienne.empreinte !== empreinte) {
      change = { type: 'modifie', le: maintenant, ancien: resume(ancienne.ev) };
      resultat.modifies.push(ev.uid);
    } else change = ancienne.change ?? null;
    phases[ev.uid] = { ev, empreinte, change, retiree: null, horsFenetre: false };
  }

  const aRetirer = [];
  for (const [uid, entree] of Object.entries(avant.phases)) {
    if (lus.has(uid) || rapproches.has(uid)) continue;
    if (entree.retiree || entree.horsFenetre) phases[uid] = entree;
    else if (entree.ev.indispo) continue;
    else if (entree.ev.fin <= maintenant && entree.ev.debut < debutFenetre) {
      phases[uid] = { ...entree, horsFenetre: true };
      resultat.horsFenetre.push(uid);
    } else aRetirer.push(uid);
  }
  const futures = Object.values(avant.phases).filter((e) => !e.retiree && !e.horsFenetre && !e.ev.indispo && e.ev.fin > maintenant).length;
  const futuresRetirees = aRetirer.filter((uid) => avant.phases[uid].ev.fin > maintenant).length;
  if (!confirmer && futuresRetirees > 0 && futuresRetirees * 2 > futures) {
    const texte = `${nom || 'Planning'} : ${futuresRetirees} ${futuresRetirees > 1 ? 'dates' : 'date'} sur ${futures} ${futuresRetirees > 1 ? 'ont' : 'a'} disparu du planning. Les retirer ?`;
    resultat.demande = { disparues: futuresRetirees, sur: futures, texte };
    for (const uid of aRetirer) phases[uid] = avant.phases[uid];
  } else {
    for (const uid of aRetirer) {
      phases[uid] = { ...avant.phases[uid], retiree: maintenant };
      resultat.retires.push(uid);
    }
  }

  const saisis = new Set(Object.values(saisies).flatMap((s) => s.uids));
  for (const [uid, entree] of Object.entries(phases)) {
    if (entree.retiree && maintenant - entree.retiree > GARDE_RETIREES && !saisis.has(uid)) delete phases[uid];
  }
  return { ...resultat, etat: { lu: maintenant, vu: avant.vu, phases, saisies, erreur: null } };
}

// L'onglet Planning a été ouvert : les marques « Nouveau » et « Modifié » d'avant disparaissent.
export function marquerVu(etatBoite, maintenant) {
  return { ...etatBoite, vu: maintenant };
}

function entrees(etat) {
  return Object.entries(etat?.boites ?? {}).flatMap(([boite, eb]) => Object.values(eb?.phases ?? {}).map((e) => ({ boite, e })));
}

// Phases encore au planning ou dans l'historique (indisponibilités comprises), avec leur boîte.
export function phasesActives(etat) {
  return entrees(etat).filter(({ e }) => !e.retiree).map(({ boite, e }) => ({ ...e.ev, boite }));
}

// Phases retirées du planning, gardées en gris (avec la date du retrait).
export function phasesRetirees(etat) {
  return entrees(etat).filter(({ e }) => e.retiree).map(({ boite, e }) => ({ ...e.ev, boite, retiree: e.retiree }));
}

// Journées de toutes les boîtes, avec « Nouveau », « Modifié » (anciens horaires) et la case Intermittent.
export function journeesDeEtat(etat) {
  return construireJournees(phasesActives(etat)).map((j) => {
    const eb = etat.boites[j.boite];
    const changes = j.phases.map((p) => eb.phases[p.uid]?.change).filter((c) => c && c.le > (eb.vu ?? -Infinity));
    return {
      ...j,
      nouveau: changes.some((c) => c.type === 'nouveau'),
      modifie: changes.some((c) => c.type === 'modifie'),
      anciens: changes.filter((c) => c.type === 'modifie').map((c) => c.ancien),
      saisie: estSaisie(eb, j),
    };
  });
}

// Pastille de l'onglet : nombre de journées nouvelles.
export function nombreNouvelles(etat) {
  return journeesDeEtat(etat).filter((j) => j.nouveau).length;
}

// ---------------------------------------------------------------------------
// Case « Saisie dans Intermittent » (§ 6.8) : gardée avec les UID des phases et l'empreinte de la journée.

export function empreinteJournee(journee) {
  return JSON.stringify([journee.date, journee.phases.map(empreintePhase).sort()]);
}

export function marquerSaisie(etatBoite, journee, maintenant) {
  const saisie = { uids: [...journee.uids], empreinte: empreinteJournee(journee), date: journee.date, le: maintenant };
  return { ...etatBoite, saisies: { ...(etatBoite.saisies ?? {}), [journee.cle]: saisie } };
}

export function retirerSaisie(etatBoite, cle) {
  const saisies = { ...(etatBoite.saisies ?? {}) };
  delete saisies[cle];
  return { ...etatBoite, saisies };
}

export function estSaisie(etatBoite, journee) {
  return Object.values(etatBoite?.saisies ?? {}).some((s) => s.uids.some((u) => journee.uids.includes(u)));
}

const liees = (saisie, journees) => journees.filter((j) => j.uids.some((u) => saisie.uids.includes(u)));

// Journées saisies puis modifiées ou retirées du planning. `journees` : celles de la même boîte.
export function alertesSaisies(etatBoite, journees) {
  return Object.entries(etatBoite?.saisies ?? {}).flatMap(([cle, s]) => {
    const actuelles = liees(s, journees);
    if (actuelles.length === 0) return [{ cle, type: 'retiree', date: s.date, texte: 'Retirée après saisie dans Intermittent : corrige-la là-bas' }];
    if (actuelles.length > 1 || empreinteJournee(actuelles[0]) !== s.empreinte) {
      return [{ cle, type: 'modifiee', date: s.date, texte: 'Modifiée après saisie dans Intermittent : corrige-la là-bas' }];
    }
    return [];
  });
}

// L'utilisateur a corrigé Intermittent : la saisie suit la journée actuelle, ou disparaît si la journée est retirée.
export function confirmerSaisie(etatBoite, cle, journees) {
  const s = etatBoite?.saisies?.[cle];
  if (!s) return etatBoite;
  const actuelles = liees(s, journees);
  const sans = retirerSaisie(etatBoite, cle);
  if (actuelles.length === 0) return sans;
  const j = actuelles[0];
  return { ...sans, saisies: { ...sans.saisies, [cle]: { ...s, uids: [...j.uids], empreinte: empreinteJournee(j), date: j.date } } };
}

// Case cochée (`coche`) ou décochée sur une journée, par sa clé d'affichage ; renvoie l'état complet. Décochée : toutes
// les saisies liées à ses phases disparaissent. Clé inconnue : état inchangé.
export function saisirJournee(etat, cle, coche, maintenant) {
  const j = journeesDeEtat(etat).find((x) => x.cle === cle);
  if (!j) return etat;
  const eb = etat.boites[j.boite];
  let suite = eb;
  if (coche) {
    if (estSaisie(eb, j)) return etat;
    suite = marquerSaisie(eb, j, maintenant);
  } else {
    for (const [c, s] of Object.entries(eb.saisies ?? {})) if (s.uids.some((u) => j.uids.includes(u))) suite = retirerSaisie(suite, c);
  }
  return { ...etat, boites: { ...etat.boites, [j.boite]: suite } };
}

// Alerte « après saisie » confirmée par l'utilisateur (`cle` : clé de la saisie) ; renvoie l'état complet.
export function confirmerAlerteSaisie(etat, boite, cle) {
  const eb = etat?.boites?.[boite];
  if (!eb?.saisies?.[cle]) return etat;
  const journees = journeesDeEtat(etat).filter((j) => j.boite === boite);
  return { ...etat, boites: { ...etat.boites, [boite]: confirmerSaisie(eb, cle, journees) } };
}

// ---------------------------------------------------------------------------
// Conflits (§ 6.6), sur les phases de travail : intervalles semi-ouverts (fin à 18 h, début à 18 h : pas de
// chevauchement). Boîtes différentes qui se chevauchent : conflit ; qui commencent le même jour : information ;
// jours différents avec moins de 11 h entre les deux : alerte de repos. Même boîte : rien.

export function conflits(journees, noms = {}) {
  const nomDe = (boite) => noms[boite] ?? boite;
  const liste = [];
  for (let i = 0; i < journees.length; i += 1) {
    for (let k = i + 1; k < journees.length; k += 1) {
      const a = journees[i];
      const b = journees[k];
      if (a.boite === b.boite || a.debut >= b.fin + JOUR || b.debut >= a.fin + JOUR) continue;
      let conflit = null;
      let suite = null;
      for (const p of a.phases) {
        for (const q of b.phases) {
          const [x, y] = p.debut <= q.debut ? [p, q] : [q, p];
          if (y.debut < x.fin) {
            if (!conflit || x.debut < conflit.x.debut) conflit = { x, y };
          } else {
            const [avantP, apres] = p.fin <= q.debut ? [p, q] : [q, p];
            const ecart = apres.debut - avantP.fin;
            if (!suite || ecart < suite.ecart) suite = { x: avantP, y: apres, ecart };
          }
        }
      }
      const cleDe = (phase) => (a.phases.includes(phase) ? a.cle : b.cle);
      if (conflit) {
        const { x, y } = conflit;
        liste.push({
          type: 'conflit', instant: y.debut, journees: [cleDe(x), cleDe(y)],
          texte: `Conflit : ${nomDe(x.boite)} (${heure(x.debut)} – ${heure(x.fin)}) et ${nomDe(y.boite)} (${heure(y.debut)} – ${heure(y.fin)}) le ${jourMois(dateParis(y.debut))}.`,
        });
      } else if (suite) {
        const { x, y, ecart } = suite;
        const journeesCitees = [cleDe(x), cleDe(y)];
        if (dateParis(x.debut) === dateParis(y.debut)) {
          liste.push({ type: 'suite', instant: y.debut, journees: journeesCitees, texte: `Deux boîtes le ${jourMois(dateParis(x.debut))} : ${duree(ecart)} entre les deux` });
        } else if (ecart < REPOS_QUOTIDIEN) {
          liste.push({
            type: 'repos', instant: y.debut, journees: journeesCitees,
            texte: `${duree(ecart)} de repos entre ${nomDe(x.boite)} (fin ${heure(x.fin)}) et ${nomDe(y.boite)} (début ${heure(y.debut)}) le ${jourMois(dateParis(y.debut))}`,
          });
        }
      }
    }
  }
  return liste.sort((p, q) => p.instant - q.instant);
}

// ---------------------------------------------------------------------------
// Totaux (§ 6.7) : par mois (date de la journée) et par boîte, journées et heures planifiées, fait (jusqu'à aujourd'hui
// compris) et à venir ; 12 derniers mois glissants, du même jour un an plus tôt à aujourd'hui compris, journées passées
// seulement (historique compris), avec à part le nombre de journées à venir. Une date travaillée pour deux boîtes :
// une journée pour chacune, une seule date dans « jours différents ».

export function totaux(journees, maintenant) {
  const aujourdhui = dateParis(maintenant);
  const du = `${Number(aujourdhui.slice(0, 4)) - 1}${aujourdhui.slice(4)}`;
  const compte = () => ({ journees: 0, heures: 0 });
  const detail = () => ({ ...compte(), fait: compte(), aVenir: compte() });
  const ajouter = (t, j) => {
    t.journees += 1;
    t.heures += j.heures;
  };
  const mois = new Map();
  const douzeMois = { du, au: aujourdhui, journees: 0, heures: 0, joursDifferents: 0, aVenir: 0 };
  const jours12 = new Set();
  for (const j of journees) {
    const cle = j.date.slice(0, 7);
    if (!mois.has(cle)) mois.set(cle, { mois: cle, boites: {}, total: detail(), jours: new Set() });
    const m = mois.get(cle);
    if (!m.boites[j.boite]) m.boites[j.boite] = detail();
    const passee = j.date <= aujourdhui;
    for (const t of [m.boites[j.boite], m.total]) {
      ajouter(t, j);
      ajouter(passee ? t.fait : t.aVenir, j);
    }
    m.jours.add(j.date);
    if (passee && j.date >= du) {
      ajouter(douzeMois, j);
      jours12.add(j.date);
    }
    if (!passee) douzeMois.aVenir += 1;
  }
  douzeMois.joursDifferents = jours12.size;
  return {
    aujourdhui,
    mois: [...mois.values()].sort((a, b) => (a.mois < b.mois ? -1 : 1))
      .map(({ mois: m, boites, total, jours }) => ({ mois: m, boites, total, joursDifferents: jours.size })),
    douzeMois,
  };
}

// ---------------------------------------------------------------------------
// Fiche pour Intermittent (§ 6.8) : texte simple, une information par ligne, sans tiret ni puce.

const ligneSimple = (texte) => String(texte).replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();

export function texteIntermittent(journee, nom) {
  const [a, m, j] = journee.date.split('-').map(Number);
  const jourSemaine = JOURS_SEMAINE[new Date(Date.UTC(a, m - 1, j)).getUTCDay()];
  const autreJour = (ms) => (dateParis(ms) !== journee.date ? ` le ${jourMois(dateParis(ms))}` : '');
  return [
    `Employeur : ${nom}`,
    `Date : ${jourSemaine} ${deux(j)}/${deux(m)}/${a}`,
    `Début : ${heure(journee.debut)}${autreJour(journee.debut)}`,
    `Fin : ${heure(journee.fin)}${autreJour(journee.fin)}`,
    `Heures planifiées : ${duree(journee.heures * HEURE)}`,
    journee.lieu ? `Lieu : ${journee.lieu}` : null,
    `Presta : ${journee.presta}`,
    journee.client ? `Client : ${journee.client}` : null,
    'Heures planifiées dans Eventsoft, pas les heures payées',
  ].filter(Boolean).map(ligneSimple).join('\n');
}
