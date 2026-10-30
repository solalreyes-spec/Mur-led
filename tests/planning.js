// Série PL (étape 23, lot 23a) : lecture des plannings iCal d'Eventsoft et journées de travail, sur les plannings
// inventés de tests/planning-fictif.js. Règles : spec de l'étape 23, § 6.

import * as ics from '../src/planning/ics.js';
import * as jr from '../src/planning/journees.js';
import {
  MAINTENANT_FICTIF, calendrier, EVENEMENTS_A, EVENEMENTS_B, EVENEMENTS_C,
  PLANNING_A, PLANNING_B, PLANNING_C, NOMS_FICTIFS, ADRESSE_FICTIVE, JETON_FICTIF, JETON_APPLE_FICTIF, relaisFictif,
  DEVIS_SALON, DEVIS_CONGRES, DESIGNATIONS_FICTIVES, DEVIS_EXPO, LECTURE_DEVIS,
} from './planning-fictif.js';
import * as calculs from '../src/calculs.js';
import { baseDalles, baseProcesseurs } from './base.js';

const H = 3600000;
const JOUR = 24 * H;
const utc = (a, mo, j, h = 0, mi = 0, s = 0) => Date.UTC(a, mo - 1, j, h, mi, s);
const lire = (texte, boite = 'Boîte A') => ics.lireCalendrier(texte, { boite });
// Un calendrier minimal autour de quelques lignes d'événements.
const cal = (evenements, sep = '\r\n') => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...evenements.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join(sep) + sep;
const unEvenement = (lignes, boite) => lire(cal([['UID:x@fictif', ...lignes]]), boite).evenements[0];
const parUid = (lecture) => Object.fromEntries(lecture.evenements.map((e) => [e.uid, e]));
// Une phase de travail donnée directement (journées, conflits, totaux).
const phase = (boite, presta, nom, debut, fin, uid = `${boite}-${debut}`, extra = {}) => ({
  boite, uid, debut, fin, presta, phase: nom, lieu: '', client: '', geo: null, indispo: false, ...extra,
});
// État des trois boîtes fictives après une première lecture à MAINTENANT_FICTIF.
function etatFictif() {
  const boites = {};
  for (const [id, texte] of [['boite-a', PLANNING_A], ['boite-b', PLANNING_B], ['boite-c', PLANNING_C]]) {
    boites[id] = jr.appliquerLecture(undefined, lire(texte, NOMS_FICTIFS[id]), MAINTENANT_FICTIF, { nom: NOMS_FICTIFS[id] }).etat;
  }
  return { boites };
}
// Devis (lot 25b) : dalles et processeurs de data/, valeurs retenues comme dans l'appli.
function baseDevis(contexte) {
  const d = baseDalles(contexte);
  const p = baseProcesseurs(contexte);
  return { dalles: d.dalles.map((f) => calculs.resoudreFiche(f, d.sources)), processeurs: p.processeurs.map((f) => calculs.resoudreFiche(f, p.sources)) };
}
const resumeJournee = (j) => [j.boite, j.date, j.presta, j.phases.map((p) => p.uid), j.heures];

// Lot 23c1 : modules du planning chargés à la demande (null et un échec s'ils manquent : tests écrits avant le code).
async function importerPlanning(v, chemin) {
  try {
    return await import(chemin);
  } catch (erreur) {
    v.vrai(`${chemin} chargé (${erreur.message})`, false);
    return null;
  }
}
// Contraste WCAG entre deux couleurs « #rrggbb ».
function contraste(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const PLANNING = [
  {
    id: 'PL1',
    titre: 'Lecture iCal : calendrier valide (page HTML, fichier tronqué, calendrier vide), lignes repliées, valeurs décodées (\\N compris), CRLF, LF seul, LF nu dans une valeur d\'un fichier CRLF, ligne de plus de 75 octets',
    etape: '23a',
    verifier(v) {
      const html = '<!doctype html><html><body>Connexion</body></html>';
      v.egal('page HTML refusée', [ics.calendrierValide(html), lire(html, 'Boîte B').ok, lire(html, 'Boîte B').erreur], [false, false, 'Boîte B : réponse illisible']);
      const tronque = PLANNING_A.slice(0, Math.floor(PLANNING_A.length / 2));
      v.egal('fichier tronqué refusé', [ics.calendrierValide(tronque), lire(tronque).ok], [false, false]);
      v.egal('texte vide refusé', [ics.calendrierValide(''), ics.calendrierValide(null)], [false, false]);
      const vide = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
      v.egal('calendrier valide sans événement accepté', [lire(vide).ok, lire(vide).evenements.length], [true, 0]);
      v.vrai('espaces et fins de ligne de bord ignorés', ics.calendrierValide(`\r\n  ${PLANNING_A}\r\n\r\n`));
      v.egal('fichier CRLF : 6 événements', lire(PLANNING_A).evenements.length, 6);
      const plie = lire(cal([['UID:x@fictif', 'DTSTART:20260708T170000Z', 'DTEND:20260708T180000Z', 'SUMMARY:Gala fic', ' tif / Pres', '\ttation', 'CATEGORIES:Prestation']])).evenements[0];
      v.egal('lignes repliées dépliées (espace et tabulation)', plie.presta, 'Gala fictif');
      const decode = unEvenement(['DTSTART:20260708T170000Z', 'SUMMARY:Bal\\, fictif\\; soir\\Nsuite\\nfin\\\\ / Prestation', 'CATEGORIES:Prestation', 'LOCATION:Salle\\, fictive']);
      v.egal('\\, \\; \\N \\n \\\\ décodés', [decode.presta, decode.lieu], ['Bal, fictif; soir\nsuite\nfin\\', 'Salle, fictive']);
      const lf = lire(calendrier({ calname: 'EventSoft / Boîte B', evenements: EVENEMENTS_B, sep: '\n' }), 'Boîte B');
      v.egal('fichier en LF seul : même lecture qu\'en CRLF', lf.evenements, lire(PLANNING_B, 'Boîte B').evenements);
      const c = parUid(lire(PLANNING_C, 'Boîte C'));
      v.egal('LF nu dans un fichier CRLF : fait partie de la valeur, la lecture continue', [Object.keys(c).length, c['c4@fictif'].client, c['c2@fictif'].phase], [7, 'Agence fictive C\nService événements', 'Autre']);
      v.vrai('LF nu : le texte qui suit reste dans le SUMMARY', c['c2@fictif'].presta.endsWith('Foire fictive\nsuite du texte'));
      const lieu = EVENEMENTS_A[0].lieu;
      v.vrai('la ligne LOCATION du planning A fait plus de 75 octets', new TextEncoder().encode(`LOCATION:${lieu}`).length > 75);
      v.egal('ligne de plus de 75 octets lue entière', parUid(lire(PLANNING_A))['a1@fictif'].lieu, lieu);
      v.egal('nom du calendrier', lire(PLANNING_A).nom, 'EventSoft / Boîte A');
    },
  },
  {
    id: 'PL2',
    titre: 'Dates : UTC, TZID de Paris, sans fuseau, TZID inconnu (note), date seule avec et sans DTEND, DURATION, DATE-TIME sans fin',
    etape: '23a',
    verifier(v) {
      const attendu = utc(2026, 5, 20, 7, 30);
      v.egal('UTC (Z)', unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal / Prestation']).debut, attendu);
      v.egal('TZID=Europe/Paris', unEvenement(['DTSTART;TZID=Europe/Paris:20260520T093000', 'SUMMARY:Bal / Prestation']).debut, attendu);
      v.egal('sans fuseau : heure de Paris', unEvenement(['DTSTART:20260520T093000', 'SUMMARY:Bal / Prestation']).debut, attendu);
      const inconnu = lire(cal([['UID:x@fictif', 'DTSTART;TZID=America/New_York:20260520T093000', 'SUMMARY:Bal / Prestation']]));
      v.egal('TZID inconnu : lu en heure de Paris', inconnu.evenements[0].debut, attendu);
      v.vrai('TZID inconnu : note « fuseau inconnu »', inconnu.notes.some((n) => /fuseau inconnu/i.test(n) && n.includes('America/New_York')));
      const deuxJours = unEvenement(['DTSTART;VALUE=DATE:20260520', 'DTEND;VALUE=DATE:20260522', 'SUMMARY:Bal / Prestation']);
      v.egal('date seule avec DTEND : de minuit à minuit, heure de Paris', [deuxJours.debut, deuxJours.fin, deuxJours.journeeEntiere], [utc(2026, 5, 19, 22), utc(2026, 5, 21, 22), true]);
      const unJour = unEvenement(['DTSTART;VALUE=DATE:20260520', 'SUMMARY:Bal / Prestation']);
      v.egal('date seule sans DTEND : un jour (RFC 5545 § 3.6.1)', [unJour.debut, unJour.fin], [utc(2026, 5, 19, 22), utc(2026, 5, 20, 22)]);
      const changement = unEvenement(['DTSTART:20261025', 'SUMMARY:Bal / Prestation']);
      v.egal('date seule le jour du passage à l\'heure d\'hiver : 25 h', changement.fin - changement.debut, 25 * H);
      v.egal('DURATION PT1H30M', unEvenement(['DTSTART:20260520T073000Z', 'DURATION:PT1H30M', 'SUMMARY:Bal / Prestation']).fin, attendu + 1.5 * H);
      v.egal('DURATION P1DT2H', unEvenement(['DTSTART:20260520T073000Z', 'DURATION:P1DT2H', 'SUMMARY:Bal / Prestation']).fin, attendu + 26 * H);
      v.egal('DURATION P1W sur une date seule', unEvenement(['DTSTART;VALUE=DATE:20260520', 'DURATION:P1W', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 5, 26, 22));
      v.egal('DURATION P1D la nuit du changement d\'heure : jour du calendrier', unEvenement(['DTSTART;TZID=Europe/Paris:20261024T120000', 'DURATION:P1D', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 10, 25, 11));
      const sansFin = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal / Prestation']);
      v.egal('DATE-TIME sans DTEND ni DURATION : durée nulle', sansFin.fin, sansFin.debut);
    },
  },
  {
    id: 'PL3',
    titre: 'Heure de Paris sans Intl : changements d\'heure 2026 et 2027, heure ambiguë (la première) et inexistante (une heure plus tard), même résultat qu\'Intl sur toute l\'année 2026',
    etape: '23a',
    verifier(v) {
      v.egal('29/03/2026 : 0 h 59 min 59 UTC en hiver, 1 h UTC en été', [ics.decalageParis(utc(2026, 3, 29, 0, 59, 59)), ics.decalageParis(utc(2026, 3, 29, 1))], [H, 2 * H]);
      v.egal('25/10/2026 : 0 h 59 min 59 UTC en été, 1 h UTC en hiver', [ics.decalageParis(utc(2026, 10, 25, 0, 59, 59)), ics.decalageParis(utc(2026, 10, 25, 1))], [2 * H, H]);
      v.egal('2027 : 28/03 et 31/10', [ics.decalageParis(utc(2027, 3, 28, 1)), ics.decalageParis(utc(2027, 3, 28, 0, 59)), ics.decalageParis(utc(2027, 10, 31, 1)), ics.decalageParis(utc(2027, 10, 31, 0, 59))], [2 * H, H, H, 2 * H]);
      const p = ics.partiesParis(utc(2026, 3, 29, 1));
      v.egal('29/03/2026 à 1 h UTC : 3 h à Paris', [p.annee, p.mois, p.jour, p.heure, p.minute], [2026, 3, 29, 3, 0]);
      v.egal('été et hiver', [ics.instantParis(2026, 7, 1, 12), ics.instantParis(2026, 12, 1, 12)], [utc(2026, 7, 1, 10), utc(2026, 12, 1, 11)]);
      v.egal('25/10/2026 à 2 h 30, ambiguë : la première (heure d\'été)', ics.instantParis(2026, 10, 25, 2, 30), utc(2026, 10, 25, 0, 30));
      v.egal('29/03/2026 à 2 h 30, inexistante : 3 h 30 (heure d\'été)', ics.instantParis(2026, 3, 29, 2, 30), utc(2026, 3, 29, 1, 30));
      v.egal('dateParis le 31/12 à 23 h 30 UTC', ics.dateParis(utc(2026, 12, 31, 23, 30)), '2027-01-01');
      let format;
      try {
        format = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
      } catch (erreur) {
        v.vrai(`Intl avec le fuseau Europe/Paris (${erreur.message})`, false);
        return;
      }
      const instants = [];
      for (let t = utc(2026, 1, 1); t < utc(2027, 1, 1); t += H) instants.push(t);
      for (const bascule of [utc(2026, 3, 29, 1), utc(2026, 10, 25, 1)]) for (let t = bascule - 2 * H; t <= bascule + 2 * H; t += 60000) instants.push(t, t - 1000);
      const ecarts = instants.filter((t) => {
        const parts = Object.fromEntries(format.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
        const q = ics.partiesParis(t);
        return [q.annee, q.mois, q.jour, q.heure, q.minute, q.seconde].join(' ') !== [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second].map(Number).join(' ');
      });
      v.egal(`écarts avec Intl sur ${instants.length} instants de 2026`, ecarts.map((t) => new Date(t).toISOString()).slice(0, 5), []);
    },
  },
  {
    id: 'PL4',
    titre: 'Minuit d\'Eventsoft : 23:59:59 heure de Paris lu comme minuit, en début et en fin, en été et en hiver, en UTC et en heure locale',
    etape: '23a',
    verifier(v) {
      const c = parUid(lire(PLANNING_C, 'Boîte C'));
      v.egal('fin à 21:59:59 Z en été → minuit du 21/09', c['c5@fictif'].fin, utc(2026, 9, 20, 22));
      v.egal('début à 21:59:59 Z en été → minuit du 21/09', c['c6@fictif'].debut, utc(2026, 9, 20, 22));
      v.egal('fin à 22:59:59 Z en hiver (déduit) → minuit', unEvenement(['DTSTART:20261120T180000Z', 'DTEND:20261120T225959Z', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 11, 20, 23));
      v.egal('heure locale 23:59:59 → minuit', unEvenement(['DTSTART;TZID=Europe/Paris:20261120T180000', 'DTEND;TZID=Europe/Paris:20261120T235959', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 11, 20, 23));
      v.egal('23:59:58 inchangé', unEvenement(['DTSTART:20260920T160000Z', 'DTEND:20260920T215958Z', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 9, 20, 21, 59, 58));
      v.egal('22:59:59 Z en été (0 h 59 min 59 à Paris) inchangé', unEvenement(['DTSTART:20260920T160000Z', 'DTEND:20260920T225959Z', 'SUMMARY:Bal / Prestation']).fin, utc(2026, 9, 20, 22, 59, 59));
      v.egal('fonction seule', [ics.minuitEventsoft(utc(2026, 9, 20, 21, 59, 59)), ics.minuitEventsoft(utc(2026, 9, 20, 21, 59, 58))], [utc(2026, 9, 20, 22), utc(2026, 9, 20, 21, 59, 58)]);
    },
  },
  {
    id: 'PL5',
    titre: 'Presta et phase : nom à plusieurs « / », espace finale, « Demontage », CATEGORIES vide ou absent, dernier segment qui n\'est pas la phase, UID en double, fin avant le début, lieu, client et GEO',
    etape: '23a',
    verifier(v) {
      const a = parUid(lire(PLANNING_A));
      v.egal('plusieurs « / » et espace finale', [a['a1@fictif'].presta, a['a1@fictif'].phase], ['Salon fictif / Hall 1 / Stand 12', 'Installation']);
      v.egal('lieu, client, GEO', [a['a1@fictif'].client, a['a1@fictif'].geo, a['a3@fictif'].geo, a['a3@fictif'].lieu], ['Agence fictive A', { lat: 48.8566, lon: 2.3522 }, null, 'Salle fictive']);
      const b = parUid(lire(PLANNING_B, 'Boîte B'));
      v.egal('« Demontage » sans accent', [b['b2@fictif'].presta, b['b2@fictif'].phase], ['Forum fictif', 'Demontage']);
      v.egal('« Demontage » = « Démontage » une fois normalisé', ics.normaliser(' Demontage ') === ics.normaliser('DÉMONTAGE'), true);
      const vide = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal fictif / Prestation', 'CATEGORIES:']);
      v.egal('CATEGORIES vide : dernier segment du SUMMARY', [vide.presta, vide.phase], ['Bal fictif', 'Prestation']);
      const absent = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal fictif / Hall 2 / Répétition']);
      v.egal('CATEGORIES absent', [absent.presta, absent.phase], ['Bal fictif / Hall 2', 'Répétition']);
      const seul = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal fictif']);
      v.egal('sans « / » ni CATEGORIES : « sans phase »', [seul.presta, seul.phase], ['Bal fictif', 'sans phase']);
      const autre = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal / Soirée', 'CATEGORIES:Prestation']);
      v.egal('dernier segment qui n\'est pas la phase : SUMMARY entier', [autre.presta, autre.phase], ['Bal / Soirée', 'Prestation']);
      const casse = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal / demontage', 'CATEGORIES:Démontage']);
      v.egal('phase comparée sans accents ni casse', casse.presta, 'Bal');
      const double = lire(cal([
        ['UID:d@fictif', 'DTSTART:20260520T073000Z', 'SUMMARY:Bal / Installation'],
        ['UID:d@fictif', 'DTSTART:20260521T073000Z', 'SUMMARY:Bal / Prestation'],
      ]));
      v.egal('UID en double : le dernier gagne', [double.evenements.length, double.evenements[0].phase], [1, 'Prestation']);
      const envers = lire(cal([['UID:e@fictif', 'DTSTART:20260520T100000Z', 'DTEND:20260520T080000Z', 'SUMMARY:Bal / Prestation']]));
      v.egal('fin avant le début : durée nulle', envers.evenements[0].fin, envers.evenements[0].debut);
      v.vrai('fin avant le début : signalée', envers.notes.some((n) => /fin avant le début/i.test(n)));
    },
  },
  {
    id: 'PL6',
    titre: 'Indisponibilités (« Autre », « Autre » seul, « Travail = … », « Indisponible » dans le titre) et « Autre » avec un lieu ou un client (travail à vérifier) ; catégorie nouvelle notée une fois',
    etape: '23a',
    verifier(v) {
      const indispos = (lecture) => lecture.evenements.filter((e) => e.indispo).map((e) => e.uid);
      v.egal('Boîte A : « Autre / Indisponible sur demande… »', indispos(lire(PLANNING_A)), ['a4@fictif']);
      v.egal('Boîte B : « Travail = INTERMITTENTS »', indispos(lire(PLANNING_B, 'Boîte B')), ['b3@fictif']);
      v.egal('Boîte C : LF nu et « Autre » seul', indispos(lire(PLANNING_C, 'Boîte C')), ['c2@fictif', 'c3@fictif']);
      v.egal('« Travail=… » sans espaces', unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Travail=AUTRE', 'CATEGORIES:Travail=AUTRE']).indispo, true);
      v.egal('« INDISPONIBLE » dans le titre', unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Bal / INDISPONIBLE', 'CATEGORIES:Prestation']).indispo, true);
      const avecLieu = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Autre / Bal', 'CATEGORIES:Autre', 'LOCATION:Salle fictive']);
      v.egal('« Autre » avec un lieu : travail à vérifier', [avecLieu.indispo, avecLieu.aVerifier], [false, true]);
      const avecClient = unEvenement(['DTSTART:20260520T073000Z', 'SUMMARY:Autre / Bal', 'CATEGORIES:Autre', 'DESCRIPTION:Client fictif']);
      v.egal('« Autre » avec un client : travail à vérifier', [avecClient.indispo, avecClient.aVerifier], [false, true]);
      v.egal('travail ordinaire : pas à vérifier', parUid(lire(PLANNING_A))['a1@fictif'].aVerifier, false);
      const nouvelle = lire(cal([
        ['UID:m1@fictif', 'DTSTART:20260520T073000Z', 'SUMMARY:Bal / Montage', 'CATEGORIES:Montage'],
        ['UID:m2@fictif', 'DTSTART:20260521T073000Z', 'SUMMARY:Bal / Montage', 'CATEGORIES:Montage'],
      ]), 'Boîte B');
      v.egal('catégorie nouvelle : travail, notée une fois', [nouvelle.evenements.map((e) => e.indispo), nouvelle.notes], [[false, false], ['Nouvelle catégorie chez Boîte B : « Montage »']]);
      v.egal('catégories connues des trois plannings : aucune note', [lire(PLANNING_A).notes, lire(PLANNING_B, 'Boîte B').notes, lire(PLANNING_C, 'Boîte C').notes], [[], [], []]);
    },
  },
  {
    id: 'PL7',
    titre: 'Journées : phase avant 6 h rattachée à la veille (même boîte, même presta, au plus 10 h d\'écart), écart trop grand, sans phase la veille, pas de cascade, nuits des changements d\'heure, heures = réunion des phases',
    etape: '23a',
    verifier(v) {
      const etat = etatFictif();
      const toutes = jr.journeesDeEtat(etat);
      const a = toutes.filter((j) => j.boite === 'boite-a');
      v.egal('Boîte A : démontage de 0 h 30 rattaché à l\'installation de la veille', a.map(resumeJournee), [
        ['boite-a', '2026-06-12', 'Salon fictif / Hall 1 / Stand 12', ['a1@fictif', 'a2@fictif'], 14.5],
        ['boite-a', '2026-07-08', 'Gala fictif', ['a3@fictif'], 8],
        ['boite-a', '2026-11-16', 'Congrès fictif', ['a5@fictif', 'a6@fictif'], 13.5],
      ]);
      v.egal('journée : début, fin, lieu, client', [a[0].debut, a[0].fin, a[0].lieu, a[0].client, a[0].autresLieux], [utc(2026, 6, 12, 6), utc(2026, 6, 13, 3), EVENEMENTS_A[0].lieu, 'Agence fictive A', []]);
      v.egal('indisponibilités hors des journées', toutes.some((j) => j.phases.some((p) => p.indispo)), false);
      const c = toutes.filter((j) => j.boite === 'boite-c');
      v.egal('Boîte C : démontage à minuit d\'Eventsoft rattaché à la veille', c.map(resumeJournee), [
        ['boite-c', '2026-05-20', 'Expo fictive', ['c1@fictif'], 2],
        ['boite-c', '2026-05-21', 'Expo fictive', ['c4@fictif'], 2],
        ['boite-c', '2026-09-20', 'Soirée fictive', ['c5@fictif', 'c6@fictif'], 10],
        ['boite-c', '2026-10-20', 'Expo fictive 2', ['c7@fictif'], 10],
      ]);
      const dates = (phases) => jr.construireJournees(phases).map((j) => [j.date, j.uids, j.heures]);
      v.egal('install le 25/10 de 10 h à 17 h, démontage le 26 de 1 h à 3 h : une journée le 25', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 10, 25, 9), utc(2026, 10, 25, 16), 'i'),
        phase('x', 'Bal', 'Démontage', utc(2026, 10, 26, 0), utc(2026, 10, 26, 2), 'd'),
      ]), [['2026-10-25', ['i', 'd'], 9]]);
      v.egal('nuit du passage à l\'heure d\'hiver : démontage de 1 h à 5 h (5 h réelles) rattaché au 24/10', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 10, 24, 16), utc(2026, 10, 24, 21), 'i'),
        phase('x', 'Bal', 'Démontage', utc(2026, 10, 24, 23), utc(2026, 10, 25, 4), 'd'),
      ]), [['2026-10-24', ['i', 'd'], 10]]);
      v.egal('install seule le 22 de 0 h à 5 h : journée du 22', dates([phase('x', 'Bal', 'Installation', utc(2026, 5, 21, 22), utc(2026, 5, 22, 3), 'i')]), [['2026-05-22', ['i'], 5]]);
      v.egal('install le 16 de 4 h à 8 h 30 sans phase la veille : journée du 16', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 11, 16, 3), utc(2026, 11, 16, 7, 30), 'i'),
        phase('x', 'Bal', 'Prestation', utc(2026, 11, 14, 8), utc(2026, 11, 14, 17), 'p'),
      ]), [['2026-11-14', ['p'], 9], ['2026-11-16', ['i'], 4.5]]);
      v.egal('écart de 10 h tout juste : rattachée', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 6), utc(2026, 6, 10, 15), 'i'),
        phase('x', 'Bal', 'Démontage', utc(2026, 6, 11, 1), utc(2026, 6, 11, 3), 'd'),
      ]).map((j) => j[0]), ['2026-06-10']);
      v.egal('écart de plus de 10 h : journée à part', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 6), utc(2026, 6, 10, 10), 'i'),
        phase('x', 'Bal', 'Démontage', utc(2026, 6, 11, 1), utc(2026, 6, 11, 3), 'd'),
      ]).map((j) => j[0]), ['2026-06-10', '2026-06-11']);
      v.egal('début à 6 h tout juste : journée à part', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 15), utc(2026, 6, 10, 20), 'i'),
        phase('x', 'Bal', 'Démontage', utc(2026, 6, 11, 4), utc(2026, 6, 11, 6), 'd'),
      ]).map((j) => j[0]), ['2026-06-10', '2026-06-11']);
      v.egal('autre presta ou autre boîte la veille : pas de rattachement', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 15), utc(2026, 6, 10, 20), 'i'),
        phase('x', 'Gala', 'Démontage', utc(2026, 6, 10, 23), utc(2026, 6, 11, 1), 'g'),
        phase('y', 'Bal', 'Démontage', utc(2026, 6, 10, 23), utc(2026, 6, 11, 1), 'y'),
      ]).map((j) => j[0]), ['2026-06-10', '2026-06-11', '2026-06-11']);
      v.egal('pas de cascade : une phase rattachée ne sert pas de veille', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 5, 18), utc(2026, 6, 5, 21), 'i'),
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 6, 3), utc(2026, 6, 6, 18), 'p'),
        phase('x', 'Bal', 'Démontage', utc(2026, 6, 7, 0), utc(2026, 6, 7, 2), 'd'),
      ]), [['2026-06-05', ['i', 'p'], 18], ['2026-06-07', ['d'], 2]]);
      v.egal('phases qui se chevauchent : comptées une fois', dates([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 8), utc(2026, 6, 10, 12), 'i'),
        phase('x', 'Bal', 'Répétition', utc(2026, 6, 10, 10), utc(2026, 6, 10, 14), 'r'),
      ]), [['2026-06-10', ['i', 'r'], 6]]);
      const lieux = jr.construireJournees([
        phase('x', 'Bal', 'Installation', utc(2026, 6, 10, 8), utc(2026, 6, 10, 12), 'i', { lieu: 'Salle 1', client: 'Client 1' }),
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 13), utc(2026, 6, 10, 14), 'p', { lieu: 'Salle 2', client: 'Client 1' }),
      ])[0];
      v.egal('lieu de la première phase, les autres listés', [lieux.lieu, lieux.autresLieux, lieux.client, lieux.autresClients], ['Salle 1', ['Salle 2'], 'Client 1', []]);
      v.egal('clé : boîte, presta normalisée, date', lieux.cle, 'x|bal|2026-06-10');
    },
  },
  {
    id: 'PL8',
    titre: 'Lectures successives : première lecture, nouveautés et pastille, modifiées (ancien horaire), rapprochement retirée + nouvelle, retirées (30 jours), sortie de la fenêtre gardée, boîte en erreur, plus de la moitié disparue, journée saisie puis modifiée ou retirée',
    etape: '23a',
    verifier(v) {
      const opt = { nom: 'Boîte A' };
      const t1 = MAINTENANT_FICTIF;
      const avec = (liste) => lire(calendrier({ calname: 'EventSoft / Boîte A', evenements: liste }));
      const r1 = jr.appliquerLecture(undefined, avec(EVENEMENTS_A), t1, opt);
      v.egal('première lecture : rien de nouveau', [r1.nouveaux, Object.keys(r1.etat.phases).length, r1.etat.lu], [[], 6, t1]);
      v.egal('première lecture : pastille à 0', jr.nombreNouvelles({ boites: { 'boite-a': r1.etat } }), 0);

      const t2 = t1 + H;
      const a7 = { uid: 'a7@fictif', debut: '20261117T080000Z', fin: '20261117T170000Z', summary: 'Congrès fictif / Démontage', categories: 'Démontage', lieu: 'Centre fictif', client: 'Client fictif A' };
      const a6bis = { ...EVENEMENTS_A[5], fin: '20261116T180000Z' };
      const indispo = { uid: 'a8@fictif', debut: '20261201T080000Z', fin: '20261201T170000Z', summary: 'Autre / Indisponible sur demande de disponibilité', categories: 'Autre' };
      const liste2 = [...EVENEMENTS_A.slice(0, 5), a6bis, a7, indispo];
      const r2 = jr.appliquerLecture(r1.etat, avec(liste2), t2, opt);
      v.egal('nouvelle phase et phase modifiée (indisponibilité nouvelle ignorée)', [r2.nouveaux, r2.modifies, r2.retires], [['a7@fictif'], ['a6@fictif'], []]);
      v.egal('ancien horaire gardé', r2.etat.phases['a6@fictif'].change.ancien.fin, utc(2026, 11, 16, 17));
      const etat2 = { boites: { 'boite-a': r2.etat } };
      v.egal('pastille : une journée nouvelle', jr.nombreNouvelles(etat2), 1);
      const j2 = jr.journeesDeEtat(etat2);
      v.egal('journées marquées Nouveau et Modifié', j2.map((j) => [j.date, j.nouveau, j.modifie]), [
        ['2026-06-12', false, false], ['2026-07-08', false, false], ['2026-11-16', false, true], ['2026-11-17', true, false],
      ]);
      const vu = jr.marquerVu(r2.etat, t2 + 60000);
      v.egal('onglet ouvert après la lecture : plus rien de nouveau', [jr.nombreNouvelles({ boites: { 'boite-a': vu } }), jr.journeesDeEtat({ boites: { 'boite-a': vu } }).some((j) => j.nouveau || j.modifie)], [0, false]);
      const r2b = jr.appliquerLecture(vu, avec(liste2), t2 + 2 * H, opt);
      v.egal('relecture identique : rien ne change', [r2b.nouveaux, r2b.modifies, r2b.retires, jr.nombreNouvelles({ boites: { 'boite-a': r2b.etat } })], [[], [], [], 0]);

      const t3 = t2 + 3 * H;
      const a5bis = { ...EVENEMENTS_A[4], uid: 'a5-bis@fictif', debut: '20261116T033000Z' };
      const liste3 = [...EVENEMENTS_A.slice(0, 4), a5bis, a6bis, a7, indispo];
      const r3 = jr.appliquerLecture(r2b.etat, avec(liste3), t3, opt);
      v.egal('UID changé, même presta, phase et date : rapproché en « Modifié »', [r3.nouveaux, r3.modifies, r3.retires, r3.etat.phases['a5@fictif']], [[], ['a5-bis@fictif'], [], undefined]);
      v.egal('rapprochement : ancien horaire', r3.etat.phases['a5-bis@fictif'].change.ancien.debut, utc(2026, 11, 16, 3));

      const t4 = t3 + H;
      const liste4 = [...EVENEMENTS_A.slice(0, 4), a5bis, a6bis, indispo];
      const r4 = jr.appliquerLecture(r3.etat, avec(liste4), t4, opt);
      v.egal('phase future absente : retirée, gardée en gris', [r4.retires, r4.etat.phases['a7@fictif'].retiree, r4.demande], [['a7@fictif'], t4, null]);
      const etat4 = { boites: { 'boite-a': r4.etat } };
      v.egal('retirée : hors des journées, dans les retirées', [jr.journeesDeEtat(etat4).some((j) => j.uids.includes('a7@fictif')), jr.phasesRetirees(etat4).map((p) => p.uid)], [false, ['a7@fictif']]);
      const r4b = jr.appliquerLecture(r4.etat, avec(liste4), t4 + 29 * JOUR, opt);
      v.egal('retirée gardée 29 jours', r4b.etat.phases['a7@fictif']?.retiree, t4);
      const r4c = jr.appliquerLecture(r4b.etat, avec(liste4), t4 + 31 * JOUR, opt);
      v.egal('retirée oubliée après 30 jours', r4c.etat.phases['a7@fictif'], undefined);

      const liste5 = [...EVENEMENTS_A.slice(2, 4), a5bis, a6bis, indispo];
      const r5 = jr.appliquerLecture(r4.etat, avec(liste5), t4 + H, opt);
      v.egal('phases passées plus anciennes que le flux : gardées dans l\'historique', [r5.retires, r5.horsFenetre, r5.etat.phases['a1@fictif'].horsFenetre], [[], ['a1@fictif', 'a2@fictif'], true]);
      v.egal('historique compté dans les journées', jr.journeesDeEtat({ boites: { 'boite-a': r5.etat } }).map((j) => j.date), ['2026-06-12', '2026-07-08', '2026-11-16']);
      const r5b = jr.appliquerLecture(r5.etat, avec(liste5), t4 + 400 * JOUR, opt);
      v.egal('historique jamais effacé', r5b.etat.phases['a1@fictif']?.horsFenetre, true);
      const sansA3 = [EVENEMENTS_A[0], EVENEMENTS_A[1], EVENEMENTS_A[3], a5bis, a6bis];
      v.egal('phase passée absente mais dans la fenêtre du flux : retirée', jr.appliquerLecture(r4.etat, avec(sansA3), t4 + H, opt).retires, ['a3@fictif']);

      const erreur = jr.appliquerLecture(r4.etat, lire('<html></html>', 'Boîte A'), t4 + H, opt);
      v.egal('boîte en erreur : rien retiré, données gardées, erreur notée', [erreur.retires, erreur.etat.phases, erreur.etat.lu, erreur.etat.erreur.texte], [[], r4.etat.phases, r4.etat.lu, 'Boîte A : réponse illisible']);

      const futures = [...EVENEMENTS_A.slice(0, 4), indispo];
      const r7 = jr.appliquerLecture(r4.etat, avec(futures), t4 + H, opt);
      v.egal('toutes les phases futures disparues : rien retiré, question', [r7.retires, r7.demande?.texte, r7.etat.phases['a6@fictif'].retiree], [[], 'Boîte A : 2 dates sur 2 ont disparu du planning. Les retirer ?', null]);
      const r7c = jr.appliquerLecture(r4.etat, avec(futures), t4 + H, { ...opt, confirmer: true });
      v.egal('retrait confirmé', [r7c.retires, r7c.demande], [['a5-bis@fictif', 'a6@fictif'], null]);
      const videA = jr.appliquerLecture(r4.etat, lire('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'), t4 + H, opt);
      v.egal('calendrier vide : rien retiré sans confirmation', [videA.retires, videA.demande?.disparues, videA.demande?.sur], [[], 2, 2]);

      const journee = jr.journeesDeEtat(etat4).find((j) => j.date === '2026-11-16');
      const saisi = jr.marquerSaisie(r4.etat, journee, t4 + H);
      const alertes = (etatBoite) => jr.alertesSaisies(etatBoite, jr.journeesDeEtat({ boites: { 'boite-a': etatBoite } }));
      v.egal('journée saisie : marquée, sans alerte', [jr.estSaisie(saisi, journee), alertes(saisi)], [true, []]);
      const a6ter = { ...a6bis, fin: '20261116T190000Z' };
      const r8 = jr.appliquerLecture(saisi, avec([...EVENEMENTS_A.slice(0, 4), a5bis, a6ter]), t4 + 2 * H, opt);
      v.egal('saisie puis modifiée : alerte forte', alertes(r8.etat).map((x) => [x.cle, x.type, x.texte]), [['boite-a|congres fictif|2026-11-16', 'modifiee', 'Modifiée après saisie dans Intermittent : corrige-la là-bas']]);
      const confirme = jr.confirmerSaisie(r8.etat, 'boite-a|congres fictif|2026-11-16', jr.journeesDeEtat({ boites: { 'boite-a': r8.etat } }));
      v.egal('alerte confirmée : disparaît', alertes(confirme), []);
      const r9 = jr.appliquerLecture(confirme, avec(EVENEMENTS_A.slice(0, 4)), t4 + 3 * H, { ...opt, confirmer: true });
      v.egal('saisie puis retirée : alerte forte', alertes(r9.etat).map((x) => [x.type, x.texte]), [['retiree', 'Retirée après saisie dans Intermittent : corrige-la là-bas']]);
      const r9b = jr.appliquerLecture(r9.etat, avec(EVENEMENTS_A.slice(0, 4)), t4 + 60 * JOUR, opt);
      v.egal('retirée après saisie : gardée au-delà de 30 jours', [Boolean(r9b.etat.phases['a6@fictif']), alertes(r9b.etat).length], [true, 1]);
      const rapproche = jr.appliquerLecture(saisi, avec([...EVENEMENTS_A.slice(0, 4), { ...a5bis, uid: 'a5-ter@fictif' }, a6bis]), t4 + 2 * H, opt);
      v.egal('rapprochement : la saisie suit le nouvel UID', [alertes(rapproche.etat).length, Object.values(rapproche.etat.saisies)[0].uids.includes('a5-ter@fictif')], [0, true]);
    },
  },
  {
    id: 'PL9',
    titre: 'Conflits entre boîtes (intervalles semi-ouverts), deux boîtes le même jour (information), moins de 11 h de repos (alerte), indisponibilité et même boîte sans alerte',
    etape: '23a',
    verifier(v) {
      const liste = jr.conflits(jr.journeesDeEtat(etatFictif()), NOMS_FICTIFS);
      v.egal('plannings fictifs : un conflit, une alerte de repos, une information', liste.map((c) => [c.type, c.texte]), [
        ['suite', 'Deux boîtes le 20/05 : 1 h entre les deux'],
        ['conflit', 'Conflit : Boîte A (8 h – 18 h) et Boîte B (14 h – 22 h) le 12/06.'],
        ['repos', '4 h de repos entre Boîte A (fin 3 h) et Boîte B (début 7 h) le 09/07'],
      ]);
      v.egal('conflit : les deux journées citées', liste[1].journees, ['boite-a|salon fictif / hall 1 / stand 12|2026-06-12', 'boite-b|concert fictif|2026-06-12']);
      const noms = { x: 'Boîte X', y: 'Boîte Y' };
      const types = (phases) => jr.conflits(jr.construireJournees(phases), noms).map((c) => c.type);
      v.egal('fin à 18 h, début à 18 h : pas de chevauchement', types([
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 6), utc(2026, 6, 10, 16)),
        phase('y', 'Gala', 'Prestation', utc(2026, 6, 10, 16), utc(2026, 6, 10, 20)),
      ]), ['suite']);
      v.egal('une seconde de chevauchement : conflit', types([
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 6), utc(2026, 6, 10, 16, 0, 1)),
        phase('y', 'Gala', 'Prestation', utc(2026, 6, 10, 16), utc(2026, 6, 10, 20)),
      ]), ['conflit']);
      v.egal('même boîte qui se chevauche : rien', types([
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 6), utc(2026, 6, 10, 16)),
        phase('x', 'Gala', 'Prestation', utc(2026, 6, 10, 10), utc(2026, 6, 10, 20)),
      ]), []);
      v.egal('11 h de repos tout juste : rien', types([
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 10), utc(2026, 6, 10, 20)),
        phase('y', 'Gala', 'Prestation', utc(2026, 6, 11, 7), utc(2026, 6, 11, 12)),
      ]), []);
      const repos = jr.conflits(jr.construireJournees([
        phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 10), utc(2026, 6, 10, 20)),
        phase('y', 'Gala', 'Prestation', utc(2026, 6, 11, 6, 30), utc(2026, 6, 11, 12)),
      ]), noms);
      v.egal('10 h 30 de repos : alerte', repos.map((c) => c.texte), ['10 h 30 de repos entre Boîte X (fin 22 h) et Boîte Y (début 8 h 30) le 11/06']);
      const indispo = { ...phase('y', 'Autre', 'Autre', utc(2026, 6, 10, 8), utc(2026, 6, 10, 20)), indispo: true };
      v.egal('travail pendant une indisponibilité d\'une autre boîte : pas de conflit', types([phase('x', 'Bal', 'Prestation', utc(2026, 6, 10, 10), utc(2026, 6, 10, 18)), indispo]), []);
    },
  },
  {
    id: 'PL10',
    titre: 'Totaux par mois et par boîte (journées, heures planifiées, fait et à venir), 12 derniers mois glissants (bornes comprises, historique compris, à venir à part), jours différents',
    etape: '23a',
    verifier(v) {
      const t = jr.totaux(jr.journeesDeEtat(etatFictif()), MAINTENANT_FICTIF);
      const mois = Object.fromEntries(t.mois.map((m) => [m.mois, m]));
      v.egal('mois présents', t.mois.map((m) => m.mois), ['2026-05', '2026-06', '2026-07', '2026-09', '2026-10', '2026-11']);
      v.egal('juin : une journée par boîte, une seule date', [mois['2026-06'].boites['boite-a'].journees, mois['2026-06'].boites['boite-a'].heures, mois['2026-06'].boites['boite-b'].journees, mois['2026-06'].total.journees, mois['2026-06'].total.heures, mois['2026-06'].joursDifferents], [1, 14.5, 1, 2, 22.5, 1]);
      const octobre = mois['2026-10'];
      v.egal('mois en cours : fait et à venir séparés', [octobre.total.journees, octobre.total.fait.journees, octobre.total.fait.heures, octobre.total.aVenir.journees, octobre.total.aVenir.heures], [2, 1, 10, 1, 10]);
      v.egal('12 derniers mois : du 27/10/2025 au 27/10/2026', [t.douzeMois.du, t.douzeMois.au], ['2025-10-27', '2026-10-27']);
      v.egal('12 derniers mois : journées passées, heures, jours différents, à venir', [t.douzeMois.journees, t.douzeMois.heures, t.douzeMois.joursDifferents, t.douzeMois.aVenir], [9, 62.5, 7, 2]);
      const bornes = jr.totaux(jr.construireJournees([
        phase('x', 'Ancien', 'Prestation', utc(2025, 10, 26, 8), utc(2025, 10, 26, 10)),
        phase('x', 'Borne', 'Prestation', utc(2025, 10, 27, 8), utc(2025, 10, 27, 10)),
        phase('x', 'Aujourd\'hui', 'Prestation', utc(2026, 10, 27, 15), utc(2026, 10, 27, 18)),
        phase('x', 'Demain', 'Prestation', utc(2026, 10, 28, 8), utc(2026, 10, 28, 10)),
      ]), MAINTENANT_FICTIF).douzeMois;
      v.egal('bornes : un an plus tôt et aujourd\'hui compris, demain à venir', [bornes.journees, bornes.heures, bornes.aVenir], [2, 5, 1]);
    },
  },
  {
    id: 'PL11',
    titre: 'Texte « Copier pour Intermittent » : employeur, date, début, fin, heures planifiées, lieu, presta, client, une information par ligne, sans tiret',
    etape: '23a',
    verifier(v) {
      const journees = jr.journeesDeEtat(etatFictif());
      const a = journees.find((j) => j.boite === 'boite-a' && j.date === '2026-06-12');
      v.egal('journée de nuit', jr.texteIntermittent(a, 'Boîte A'), [
        'Employeur : Boîte A',
        'Date : vendredi 12/06/2026',
        'Début : 8 h',
        'Fin : 5 h le 13/06',
        'Heures planifiées : 14 h 30',
        `Lieu : ${EVENEMENTS_A[0].lieu}`,
        'Presta : Salon fictif / Hall 1 / Stand 12',
        'Client : Agence fictive A',
        'Heures planifiées dans Eventsoft, pas les heures payées',
      ].join('\n'));
      const c = journees.find((j) => j.boite === 'boite-c' && j.date === '2026-05-21');
      v.egal('sans lieu, client sur deux lignes', jr.texteIntermittent(c, 'Boîte C'), [
        'Employeur : Boîte C',
        'Date : jeudi 21/05/2026',
        'Début : 10 h',
        'Fin : 12 h',
        'Heures planifiées : 2 h',
        'Presta : Expo fictive',
        'Client : Agence fictive C, Service événements',
        'Heures planifiées dans Eventsoft, pas les heures payées',
      ].join('\n'));
      const texte = journees.map((j) => jr.texteIntermittent(j, NOMS_FICTIFS[j.boite])).join('\n');
      v.vrai('aucun tiret long ni puce', !/[—–•]|^\s*-/m.test(texte));
    },
  },
  {
    id: 'PL12',
    titre: 'Planning pour Apple Calendrier : indisponibilités retirées telles quelles, LF nu préservé, minuit d\'Eventsoft réécrit, nom de la boîte, le reste identique à l\'octet ; réponse illisible refusée',
    etape: '23a',
    verifier(v) {
      const apple = ics.planningApple(PLANNING_C, { nom: 'Boîte C' });
      const minuit = (e) => ({ ...e, debut: e.debut.replace('T215959Z', 'T220000Z'), fin: e.fin.replace('T215959Z', 'T220000Z') });
      const attendu = calendrier({ calname: 'Boîte C', evenements: EVENEMENTS_C.filter((e) => !['c2@fictif', 'c3@fictif'].includes(e.uid)).map(minuit) });
      v.egal('identique au planning attendu', apple, attendu);
      v.egal('événements gardés', lire(apple, 'Boîte C').evenements.map((e) => e.uid), ['c1@fictif', 'c4@fictif', 'c5@fictif', 'c6@fictif', 'c7@fictif']);
      v.vrai('LF nu du client gardé', apple.includes('DESCRIPTION:Agence fictive C\nService événements\r\n'));
      v.vrai('aucune indisponibilité', !/Indisponible|CATEGORIES:Autre/.test(apple));
      v.vrai('minuit réécrit', apple.includes('DTEND:20260920T220000Z') && apple.includes('DTSTART:20260920T220000Z') && !apple.includes('T215959Z'));
      v.vrai('fréquence de mise à jour reprise', apple.includes('REFRESH-INTERVAL;VALUE=DURATION:PT30M\r\n'));
      const a = ics.planningApple(PLANNING_A, { nom: 'Boîte A, salle; 1' });
      v.vrai('nom échappé', a.includes('X-WR-CALNAME:Boîte A\\, salle\\; 1\r\n'));
      v.egal('indisponibilité de 23:59:59 retirée avec son bloc', [a.includes('a4@fictif'), (a.match(/BEGIN:VEVENT/g) ?? []).length], [false, 5]);
      const lf = ics.planningApple(calendrier({ calname: 'EventSoft / Boîte B', evenements: EVENEMENTS_B, sep: '\n' }), { nom: 'Boîte B' });
      v.egal('fichier en LF seul : LF gardé', lf, calendrier({ calname: 'Boîte B', evenements: EVENEMENTS_B.filter((e) => e.uid !== 'b3@fictif'), sep: '\n' }));
      v.egal('local : 23:59:59 → minuit du lendemain', ics.planningApple(cal([['UID:x@fictif', 'DTSTART;TZID=Europe/Paris:20261120T180000', 'DTEND;TZID=Europe/Paris:20261120T235959', 'SUMMARY:Bal / Prestation']]), { nom: 'X' }).includes('DTEND;TZID=Europe/Paris:20261121T000000\r\n'), true);
      v.egal('réponse illisible : rien', [ics.planningApple('<html></html>', { nom: 'Boîte C' }), ics.planningApple(PLANNING_C.slice(0, 500), { nom: 'Boîte C' })], [null, null]);
    },
  },

  {
    id: 'PL13',
    titre: 'Client du relais (lot 23c1) : adresse en https:// seulement, jeton entier ; requêtes sans cookie, sans cache ni référent, jeton dans l\'en-tête et jamais dans l\'adresse ; « Tester la connexion » distingue jeton refusé, relais injoignable (délai compris) et boîte en erreur ; lecture des boîtes (une boîte en erreur n\'empêche pas les autres, rien de nouveau à la première lecture, question « Les retirer ? » puis retraits confirmés) ; lecture automatique après 15 min, en réseau seulement ; aucun message ne contient l\'adresse ni le jeton',
    etape: '23c1',
    async verifier(v) {
      const rl = await importerPlanning(v, '../src/planning/relais.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!rl || !rg) return;
      const textes = [];
      // Contrôle des fuites sur ce que l'appli affiche (textes, lignes, messages), pas sur les réglages que le test repasse
      // à l'appel suivant (ils contiennent l'adresse et le jeton, gardés sur l'appareil ; correction accordée le 27/10/2026).
      const garder = (x) => { textes.push(JSON.stringify({ type: x.type, texte: x.texte, lignes: x.lignes, messages: x.messages, boites: x.boites })); return x; };

      v.egal('adresse sans https:// complétée, barre finale retirée', rg.adresseRelais(' relais.exemple.test/ '), { ok: true, adresse: 'https://relais.exemple.test' });
      v.egal('adresse en https:// gardée', rg.adresseRelais('https://relais.exemple.test'), { ok: true, adresse: 'https://relais.exemple.test' });
      const refus = ['http://relais.exemple.test', '', 'https://relais.exemple.test/?q=1', 'https://', 'ftp://relais.exemple.test'].map((a) => rg.adresseRelais(a));
      v.egal('http://, vide, paramètres, illisible : refusés', refus.map((r) => r.ok), [false, false, false, false, false]);
      v.vrai('http:// refusé avec la raison', /https:\/\//.test(refus[0].erreur) && /clair/.test(refus[0].erreur));
      v.vrai('aucun refus ne répète l\'adresse saisie', refus.every((r) => !String(r.erreur).includes('exemple')));
      v.egal('jeton entier accepté, espaces de bord retirés', rg.jetonValide(`  ${JETON_FICTIF}\n`), { ok: true, jeton: JETON_FICTIF });
      v.egal('jeton trop court, avec espace ou « / » : refusé', ['court', `${JETON_FICTIF} x`, `${JETON_FICTIF}/x`, ''].map((j) => rg.jetonValide(j).ok), [false, false, false, false]);
      v.vrai('refus du jeton sans le jeton', !rg.jetonValide(`${JETON_FICTIF} x`).erreur.includes(JETON_FICTIF));

      // Boîtes de la liste, lues sur un relais simulé.
      const relais = relaisFictif();
      const boites = garder(await rl.lireBoites({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relais.fetch }));
      v.egal('liste des boîtes lue, sans lien', boites, { ok: true, boites: [{ id: 'boite-a', nom: 'Boîte A' }, { id: 'boite-b', nom: 'Boîte B' }, { id: 'boite-c', nom: 'Boîte C' }] });
      const appel = relais.appels[0];
      v.egal('requête : GET sur /boites.json, jeton dans l\'en-tête, sans cookie, cache ni référent',
        [appel.url, appel.options.method ?? 'GET', appel.options.headers?.Authorization, appel.options.cache, appel.options.credentials, appel.options.referrerPolicy],
        [`${ADRESSE_FICTIVE}/boites.json`, 'GET', `Bearer ${JETON_FICTIF}`, 'no-store', 'omit', 'no-referrer']);
      const jetonFaux = garder(await rl.lireBoites({ adresse: ADRESSE_FICTIVE, jeton: `${JETON_FICTIF}-faux`, fetch: relais.fetch }));
      const injoignable = garder(await rl.lireBoites({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ reseau: true }).fetch }));
      const lent = garder(await rl.lireBoites({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ jamais: true }).fetch, delai: 50 }));
      const panne = garder(await rl.lireBoites({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ statut: 500 }).fetch }));
      v.egal('jeton refusé, relais injoignable, délai dépassé, réponse inattendue', [jetonFaux.type, injoignable.type, lent.type, panne.type], ['jeton', 'injoignable', 'injoignable', 'reponse']);
      v.vrai('textes distincts', new Set([jetonFaux.texte, injoignable.texte, panne.texte]).size === 3);

      // Test de connexion : une boîte en erreur.
      const enPanne = relaisFictif({ boites: { 'boite-b': { statut: 503 }, 'boite-c': { statut: 'illisible' } } });
      const test = garder(await rl.testerConnexion({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: enPanne.fetch }));
      v.egal('test de connexion : boîte en erreur, détail par boîte', [test.ok, test.type, test.lignes.length], [false, 'boite', 4]);
      v.vrai('test de connexion : relais joint, trois boîtes', /3 boîtes/.test(test.lignes[0]));
      v.vrai('Boîte A lue, Boîte B (503) et Boîte C (pas un planning) en erreur', /^Boîte A : planning lu/.test(test.lignes[1]) && /^Boîte B : .*503/.test(test.lignes[2]) && /^Boîte C : .*pas un planning/.test(test.lignes[3]));
      const testOk = garder(await rl.testerConnexion({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif().fetch }));
      const testJeton = garder(await rl.testerConnexion({ adresse: ADRESSE_FICTIVE, jeton: 'jeton-faux-mais-assez-long-pour-etre-lu-0000', fetch: relaisFictif().fetch }));
      const testReseau = garder(await rl.testerConnexion({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ reseau: true }).fetch }));
      v.egal('test de connexion : tout bon, jeton refusé, injoignable', [testOk.ok, testOk.type ?? null, testJeton.type, testReseau.type], [true, null, 'jeton', 'injoignable']);

      // Lecture des plannings : première lecture, boîte en erreur, nouveautés.
      const reglages = { ...rg.reglagesVides(), relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF };
      const premiere = garder(await rl.lirePlanning({ reglages, etat: null, maintenant: MAINTENANT_FICTIF, fetch: enPanne.fetch }));
      v.egal('première lecture : boîtes enregistrées dans les réglages', premiere.reglages.boites.map((b) => [b.id, b.nom, b.affichage]), [['boite-a', 'Boîte A', 'Boîte A'], ['boite-b', 'Boîte B', 'Boîte B'], ['boite-c', 'Boîte C', 'Boîte C']]);
      v.egal('Boîte A lue malgré les deux autres en erreur, rien de nouveau', [premiere.ok, Object.keys(premiere.etat.boites['boite-a'].phases).length, premiere.nouveaux], [true, 6, 0]);
      v.egal('erreurs des boîtes B et C', premiere.messages.map((m) => [m.boite, m.type, m.texte]), [['boite-b', 'erreur', 'Boîte B : pas joignable'], ['boite-c', 'erreur', 'Boîte C : réponse illisible']]);
      v.egal('heure de l\'essai gardée', premiere.etat.essai, MAINTENANT_FICTIF);
      const plusTard = MAINTENANT_FICTIF + 20 * 60000;
      const ajout = calendrier({ calname: 'EventSoft / Boîte A', evenements: [...EVENEMENTS_A, { uid: 'a7@fictif', debut: '20261205T080000Z', fin: '20261205T170000Z', summary: 'Forum fictif 2 / Installation', categories: 'Installation', lieu: 'Centre fictif', client: 'Client fictif A' }] });
      const seconde = garder(await rl.lirePlanning({ reglages: premiere.reglages, etat: premiere.etat, maintenant: plusTard, fetch: relaisFictif({ boites: { 'boite-a': { texte: ajout } } }).fetch }));
      v.egal('seconde lecture : une journée nouvelle, B et C lues', [seconde.nouveaux, seconde.messages.length, seconde.etat.boites['boite-b'].erreur, Object.keys(seconde.etat.boites['boite-c'].phases).length], [1, 0, null, 7]);
      // Disparition massive : question, puis retraits confirmés.
      const vide = calendrier({ calname: 'EventSoft / Boîte A', evenements: EVENEMENTS_A.slice(0, 4) });
      const plusTard2 = plusTard + 20 * 60000;
      const sansRetrait = garder(await rl.lirePlanning({ reglages: seconde.reglages, etat: seconde.etat, maintenant: plusTard2, fetch: relaisFictif({ boites: { 'boite-a': { texte: vide } } }).fetch }));
      const demande = sansRetrait.messages.find((m) => m.type === 'demande');
      v.egal('plus de la moitié disparue : question, rien de retiré', [demande?.boite, demande?.texte, Object.values(sansRetrait.etat.boites['boite-a'].phases).filter((e) => e.retiree).length],
        ['boite-a', 'Boîte A : 3 dates sur 3 ont disparu du planning. Les retirer ?', 0]);
      const confirme = garder(await rl.lirePlanning({ reglages: seconde.reglages, etat: sansRetrait.etat, maintenant: plusTard2, fetch: relaisFictif({ boites: { 'boite-a': { texte: vide } } }).fetch, confirmer: ['boite-a'] }));
      v.egal('retraits confirmés : trois phases retirées, aucune question', [Object.values(confirme.etat.boites['boite-a'].phases).filter((e) => e.retiree).length, confirme.messages.length], [3, 0]);
      // Jeton refusé : rien ne change.
      const refuse = garder(await rl.lirePlanning({ reglages: { ...seconde.reglages, jeton: 'jeton-faux-mais-assez-long-pour-etre-lu-0000' }, etat: seconde.etat, maintenant: plusTard2, fetch: relaisFictif().fetch }));
      v.egal('jeton refusé : lecture arrêtée, état inchangé', [refuse.ok, refuse.type, JSON.stringify(refuse.etat) === JSON.stringify(seconde.etat)], [false, 'jeton', true]);
      const sansReglage = await rl.lirePlanning({ reglages: rg.reglagesVides(), etat: null, maintenant: plusTard2, fetch: relaisFictif().fetch });
      v.egal('sans réglage : aucune requête', [sansReglage.ok, sansReglage.type], [false, 'reglages']);

      // Lecture automatique.
      const due = (etat, ms, enLigne = true) => rl.lectureDue(etat, ms, { enLigne });
      v.egal('lecture due : jamais lu, 10 min, 15 min, hors ligne', [due(null, MAINTENANT_FICTIF), due(premiere.etat, MAINTENANT_FICTIF + 10 * 60000), due(premiere.etat, MAINTENANT_FICTIF + 15 * 60000), due(premiere.etat, MAINTENANT_FICTIF + 60 * 60000, false)], [true, false, true, false]);

      const tout = textes.join('\n');
      v.vrai('aucun résultat ne contient l\'adresse du relais ni le jeton', !tout.includes('exemple.test') && !tout.includes(JETON_FICTIF));
      v.vrai('aucune requête ne met le jeton dans l\'adresse', [relais, enPanne].flatMap((r) => r.appels).every((a) => !a.url.includes(JETON_FICTIF)));
    },
  },
  {
    id: 'PL14',
    titre: 'Liste du planning (lot 23c1) : date « sam. 24/10 », horaires « 11 h – 3 h +1 j » (minuit écrit « minuit »), lien Plans, « Mis à jour le … » ; repère de chaque boîte (couleur distincte, lettre distincte, lettre à 4,5:1 sur sa pastille, en mode rouge aussi), réglages de la boîte gardés à chaque lecture ; journées à venir (aujourd\'hui en premier) puis passées (les plus récentes d\'abord), « Nouveau », « Modifié » avec l\'ancien horaire, retirées barrées, indisponibilités à part, filtre par boîte, boîte en erreur avec la date de ses données',
    etape: '23c1',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!af || !rg) return;
      v.egal('dates courtes', ['2026-10-24', '2026-10-25', '2026-06-01'].map(af.dateCourte), ['sam. 24/10', 'dim. 25/10', 'lun. 01/06']);
      v.egal('horaires', [
        af.horaires(utc(2026, 6, 12, 6), utc(2026, 6, 12, 16), '2026-06-12'),
        af.horaires(utc(2026, 7, 8, 17), utc(2026, 7, 9, 1), '2026-07-08'),
        af.horaires(utc(2026, 9, 20, 16), utc(2026, 9, 20, 22), '2026-09-20'),
        af.horaires(utc(2026, 11, 16, 7, 30), utc(2026, 11, 16, 11), '2026-11-16'),
        af.horaires(utc(2026, 6, 12, 6), utc(2026, 6, 14, 3), '2026-06-12'),
      ], ['8 h – 18 h', '19 h – 3 h +1 j', '18 h – minuit', '8 h 30 – 12 h', '8 h – 5 h +2 j']);
      v.egal('lien Plans', [af.lienPlans({ lat: 48.8566, lon: 2.3522 }), af.lienPlans(null)], ['https://maps.apple.com/?q=48.8566,2.3522', null]);
      v.egal('mis à jour (heure d\'hiver)', af.misAJour(utc(2026, 10, 27, 13, 5)), 'Mis à jour le 27/10 à 14 h 05');

      // Repère des boîtes.
      v.vrai('palette : au moins 6 couleurs distinctes', rg.PALETTE_BOITES.length >= 6 && new Set(rg.PALETTE_BOITES).size === rg.PALETTE_BOITES.length);
      const faibles = [...rg.PALETTE_BOITES, '#ff3b30'].filter((c) => contraste(c, rg.TEXTE_PASTILLE) < 4.5);
      v.egal('lettre à 4,5:1 sur chaque pastille, rouge compris', faibles, []);
      v.egal('lettres par défaut distinctes', [rg.lettresParDefaut(['Mars', 'Mistral', 'Azur']), rg.lettresParDefaut(['Boîte A', 'Boîte B', 'Boîte C'])], [['M', 'I', 'A'], ['B', 'O', 'I']]);
      const gardees = [{ id: 'boite-b', nom: 'Boîte B', affichage: 'Mon B', couleur: rg.PALETTE_BOITES[3], lettre: 'Z' }, { id: 'boite-x', nom: 'Boîte X', affichage: 'Boîte X', couleur: rg.PALETTE_BOITES[0], lettre: 'X' }];
      const fusion = rg.fusionnerBoites(gardees, [{ id: 'boite-a', nom: 'Boîte A' }, { id: 'boite-b', nom: 'Boîte B renommée' }]);
      v.egal('fusion : réglages gardés, nouvelle boîte à la première couleur libre, boîte disparue gardée à part',
        fusion.map((b) => [b.id, b.nom, b.affichage, b.couleur, b.lettre, Boolean(b.absente)]),
        [['boite-a', 'Boîte A', 'Boîte A', rg.PALETTE_BOITES[1], 'B', false], ['boite-b', 'Boîte B renommée', 'Mon B', rg.PALETTE_BOITES[3], 'Z', false], ['boite-x', 'Boîte X', 'Boîte X', rg.PALETTE_BOITES[0], 'X', true]]);

      // Liste sur l'état des trois boîtes fictives.
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const etat = etatFictif();
      const liste = af.vueListe(etat, reglages, MAINTENANT_FICTIF);
      v.egal('à venir : aujourd\'hui en premier', liste.aVenir.map((c) => [c.boite, c.jour, c.horaires, c.presta]),
        [['boite-b', 'jeu. 29/10', '7 h – 17 h', 'Séminaire fictif'], ['boite-a', 'lun. 16/11', '4 h – 18 h', 'Congrès fictif']]);
      v.egal('passées : les plus récentes d\'abord', liste.passees.map((c) => [c.boite, c.date]), [
        ['boite-c', '2026-10-20'], ['boite-c', '2026-09-20'], ['boite-b', '2026-07-09'], ['boite-a', '2026-07-08'], ['boite-b', '2026-06-12'], ['boite-a', '2026-06-12'],
        ['boite-c', '2026-05-21'], ['boite-b', '2026-05-20'], ['boite-c', '2026-05-20'],
      ]);
      const salon = liste.passees.find((c) => c.boite === 'boite-a' && c.date === '2026-06-12');
      v.egal('carte : repère, horaires de nuit, phases, lieu, client, Plans', [salon.nom, salon.lettre, salon.couleur, salon.horaires, salon.phases, salon.lieu, salon.client, salon.plans],
        ['Boîte A', 'B', rg.PALETTE_BOITES[0], '8 h – 5 h +1 j', 'Installation, Démontage', EVENEMENTS_A[0].lieu, 'Agence fictive A', 'https://maps.apple.com/?q=48.8566,2.3522']);
      v.egal('minuit d\'Eventsoft rattaché', liste.passees.find((c) => c.date === '2026-09-20').horaires, '18 h – 4 h +1 j');
      v.egal('indisponibilités à part : aucune à venir, quatre passées', [liste.indisposAVenir.length, liste.indisposPassees.length], [0, 4]);
      v.vrai('indisponibilité : boîte et dates', /^Boîte C : indisponible du (mar\. )?01\/09 au (jeu\. )?10\/09$/.test(liste.indisposPassees.find((i) => i.boite === 'boite-c' && i.date === '2026-09-01')?.texte ?? ''));
      const filtre = af.vueListe(etat, reglages, MAINTENANT_FICTIF, { boites: ['boite-a'] });
      v.egal('filtre par boîte', [filtre.aVenir.length, filtre.passees.length, filtre.indisposPassees.length], [1, 2, 1]);

      // Nouveau, Modifié, retirée, erreur.
      const relu = calendrier({ calname: 'EventSoft / Boîte B', evenements: [
        ...EVENEMENTS_B.filter((e) => e.uid !== 'b5@fictif'),
        { ...EVENEMENTS_B[4], debut: '20261029T070000Z' },
        { uid: 'b6@fictif', debut: '20261203T080000Z', fin: '20261203T120000Z', summary: 'Gala fictif B / Prestation', categories: 'Prestation', lieu: 'Salle fictive B', client: 'Client fictif B' },
      ] });
      const apres = MAINTENANT_FICTIF + 3600000;
      const etat2 = { ...etat, boites: { ...etat.boites, 'boite-b': jr.appliquerLecture(etat.boites['boite-b'], lire(relu, 'Boîte B'), apres, { nom: 'Boîte B' }).etat } };
      const l2 = af.vueListe(etat2, reglages, apres);
      const sem = l2.aVenir.find((c) => c.presta === 'Séminaire fictif');
      v.egal('« Modifié » avec l\'ancien horaire', [sem.modifie, sem.nouveau, sem.horaires, sem.ancien], [true, false, '8 h – 17 h', ['Avant : 7 h – 17 h']]);
      v.egal('« Nouveau »', [l2.aVenir.find((c) => c.presta === 'Gala fictif B')?.nouveau, l2.nouvelles], [true, 1]);
      const sansA = calendrier({ calname: 'EventSoft / Boîte A', evenements: EVENEMENTS_A.filter((e) => e.uid !== 'a6@fictif') });
      const etat3 = { ...etat, boites: { ...etat.boites, 'boite-a': jr.appliquerLecture(etat.boites['boite-a'], lire(sansA, 'Boîte A'), apres, { nom: 'Boîte A', confirmer: true }).etat } };
      const l3 = af.vueListe(etat3, reglages, apres);
      v.egal('phase retirée : sa journée reste (l\'autre phase), la phase retirée à part, barrée', [l3.aVenir.filter((c) => c.presta === 'Congrès fictif').map((c) => [c.horaires, Boolean(c.retiree)])],
        [[['4 h – 8 h 30', false], ['9 h – 18 h', true]]]);
      v.egal('texte de la retirée', l3.aVenir.find((c) => c.retiree)?.retiree, 'Retirée du planning de Boîte A le 27/10');
      const etat4 = { ...etat, boites: { ...etat.boites, 'boite-b': jr.appliquerLecture(etat.boites['boite-b'], { ok: false, erreur: 'Boîte B : pas joignable' }, apres, { nom: 'Boîte B' }).etat } };
      v.egal('boîte en erreur : message avec la date de ses données', af.etatBoites(etat4, reglages).map((e) => [e.boite, e.texte]), [
        ['boite-a', 'Mis à jour le 27/10 à 10 h'], ['boite-b', 'Boîte B : pas joignable, données du 27/10 à 10 h'], ['boite-c', 'Mis à jour le 27/10 à 10 h'],
      ]);
      v.egal('boîte jamais lue', af.etatBoites({ boites: { 'boite-a': jr.appliquerLecture(undefined, { ok: false, erreur: 'Boîte A : pas joignable' }, apres, {}).etat } }, reglages)[0].texte, 'Boîte A : pas joignable, aucune donnée');
    },
  },
  {
    id: 'PL15',
    titre: 'Données du planning gardées à part (lot 23c1) : les clés planning-reglages et planning-etat n\'apparaissent que dans le module des réglages du planning, lu seulement par l\'écran Planning ; ni l\'export de la base, ni l\'export d\'une presta, ni « Tout copier », ni « Repartir des réglages par défaut », ni l\'import de la base n\'en parlent ; le Planning n\'a aucun bouton data-copier (vérifié aussi dans l\'appli par outils/verif-planning.js)',
    etape: '23c1',
    async verifier(v, contexte) {
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      const f = contexte?.fichiers ?? {};
      v.vrai('fichiers de l\'appli lus', typeof f['index.html'] === 'string');
      if (!rg) return;
      v.egal('clés du planning', rg.CLES_PLANNING, { reglages: 'planning-reglages', etat: 'planning-etat' });
      const js = Object.entries(f).filter(([chemin, texte]) => chemin.endsWith('.js') && typeof texte === 'string');
      v.egal('clés écrites en clair dans un seul module', js.filter(([, t]) => /planning-(reglages|etat)/.test(t)).map(([c]) => c), ['src/planning/reglages.js']);
      v.egal('réglages du planning importés par l\'écran Planning seulement (sw.js, qui liste chaque fichier du cache, mis à part : correction accordée le 27/10/2026)', js.filter(([c, t]) => !c.startsWith('src/planning/') && c !== 'sw.js' && /planning\/reglages\.js/.test(t)).map(([c]) => c), ['src/ecran-planning.js']);
      v.egal('export de la base, export d\'une presta, copie, réglages par défaut, écran Base : aucun mot « planning »',
        ['src/fiches.js', 'src/prestas.js', 'src/prestas-appareil.js', 'src/copie.js', 'src/resumes.js', 'src/configuration.js', 'src/ecran-base.js'].filter((c) => typeof f[c] !== 'string' || /planning/i.test(f[c])), []);
      const section = /<section id="planning"[\s\S]*?<\/section>/.exec(f['index.html'] ?? '')?.[0] ?? null;
      v.vrai('section Planning présente', section !== null);
      v.egal('aucun bouton data-copier dans le Planning', [/data-copier/.test(section ?? ''), /data-copier|dataset\.copier/.test(f['src/ecran-planning.js'] ?? 'data-copier')], [false, false]);
    },
  },
  {
    id: 'PL16',
    titre: 'Vue Mois (lot 23c2) : semaines du lundi au dimanche (4, 5 ou 6), jours hors du mois sans marque, aujourd\'hui marqué, une pastille par boîte dans l\'ordre des réglages, journée de nuit sur sa date, hachures pour une indisponibilité seule (pas sous une date d\'une autre boîte), marque de conflit et de repos court (aussi quand l\'autre boîte est masquée), mois précédent et suivant d\'une année à l\'autre, journées et indisponibilités du jour touché, filtre par boîte',
    etape: '23c2',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!af || !rg) return;
      if (typeof af.vueMois !== 'function') {
        v.vrai('vueMois présente', false);
        return;
      }
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const etat = etatFictif();
      const mois = (m, options = {}) => af.vueMois(etat, reglages, MAINTENANT_FICTIF, { mois: m, ...options });
      const cellule = (vue, date) => vue.semaines.flat().find((c) => c.date === date);
      const marques = (c) => [c.boites.map((b) => b.boite), c.indispo, c.conflit, c.repos];

      const octobre = af.vueMois(etat, reglages, MAINTENANT_FICTIF);
      v.egal('par défaut le mois en cours : titre, mois voisins', [octobre.mois, octobre.titre, octobre.precedent, octobre.suivant], ['2026-10', 'Octobre 2026', '2026-09', '2026-11']);
      v.egal('octobre 2026 : 5 semaines du lundi 28/09 au dimanche 01/11', [octobre.semaines.length, octobre.semaines.every((s) => s.length === 7), octobre.semaines[0][0].date, octobre.semaines.at(-1)[6].date], [5, true, '2026-09-28', '2026-11-01']);
      v.egal('aujourd\'hui marqué, une seule fois', octobre.semaines.flat().filter((c) => c.aujourdhui).map((c) => [c.date, c.numero, c.etiquette]), [['2026-10-27', 27, 'mar. 27/10, aujourd\'hui']]);
      v.egal('jours hors du mois', [cellule(octobre, '2026-09-28').dansMois, cellule(octobre, '2026-10-01').dansMois, cellule(octobre, '2026-11-01').dansMois], [false, true, false]);
      v.egal('pastilles d\'octobre', [marques(cellule(octobre, '2026-10-20')), marques(cellule(octobre, '2026-10-29'))], [[['boite-c'], false, false, false], [['boite-b'], false, false, false]]);
      v.egal('pastille : repère de la boîte', cellule(octobre, '2026-10-29').boites[0], { boite: 'boite-b', nom: 'Boîte B', lettre: 'O', couleur: rg.PALETTE_BOITES[1] });
      const novembre = mois('2026-11');
      v.egal('novembre 2026 (commence un dimanche) : 6 semaines', [novembre.semaines.length, novembre.semaines[0][0].date, novembre.semaines.at(-1)[6].date], [6, '2026-10-26', '2026-12-06']);
      v.egal('une date hors du mois affiché : aucune marque', [marques(cellule(novembre, '2026-10-29')), marques(cellule(novembre, '2026-11-16'))], [[[], false, false, false], [['boite-a'], false, false, false]]);
      const fevrier = mois('2027-02');
      v.egal('février 2027 (commence un lundi, 28 jours) : 4 semaines', [fevrier.semaines.length, fevrier.semaines[0][0].date, fevrier.semaines.at(-1)[6].date, fevrier.titre], [4, '2027-02-01', '2027-02-28', 'Février 2027']);
      v.egal('d\'une année à l\'autre', [mois('2026-12').suivant, mois('2027-01').precedent, mois('2027-01').titre], ['2027-01', '2026-12', 'Janvier 2027']);

      const juin = mois('2026-06');
      v.egal('juin : deux boîtes en conflit le 12, journée de nuit sur sa date', [marques(cellule(juin, '2026-06-12')), marques(cellule(juin, '2026-06-13'))], [[['boite-a', 'boite-b'], false, true, false], [[], false, false, false]]);
      v.egal('juin : indisponibilité seule le 20 (hachures)', marques(cellule(juin, '2026-06-20')), [[], true, false, false]);
      v.egal('étiquettes lues', [cellule(juin, '2026-06-12').etiquette, cellule(juin, '2026-06-20').etiquette, cellule(juin, '2026-06-10').etiquette],
        ['ven. 12/06, Boîte A, Boîte B, conflit', 'sam. 20/06, indisponible', 'mer. 10/06']);
      const juillet = mois('2026-07');
      v.egal('juillet : repos court sur les deux dates, indisponibilité sous une date d\'une autre boîte sans hachures', [marques(cellule(juillet, '2026-07-08')), marques(cellule(juillet, '2026-07-09'))],
        [[['boite-a'], false, false, true], [['boite-b'], false, false, true]]);
      v.egal('étiquette d\'un repos court', cellule(juillet, '2026-07-08').etiquette, 'mer. 08/07, Boîte A, repos court');
      const juilletB = mois('2026-07', { boites: ['boite-b'] });
      v.egal('filtre Boîte B : son indisponibilité seule le 08, repos court sur sa date seulement', [marques(cellule(juilletB, '2026-07-08')), marques(cellule(juilletB, '2026-07-09'))],
        [[[], true, false, false], [['boite-b'], false, false, true]]);
      v.egal('filtre Boîte A : le conflit avec la Boîte B masquée reste marqué', marques(cellule(mois('2026-06', { boites: ['boite-a'] }), '2026-06-12')), [['boite-a'], false, true, false]);
      const septembre = mois('2026-09');
      v.egal('septembre : indisponibilité de dix jours, minuit d\'Eventsoft rattaché à la veille',
        [['01', '05', '10', '11'].map((j) => cellule(septembre, `2026-09-${j}`).indispo), marques(cellule(septembre, '2026-09-20')), marques(cellule(septembre, '2026-09-21'))],
        [[true, true, true, false], [['boite-c'], false, false, false], [[], false, false, false]]);

      v.egal('sans jour touché : rien sous la grille', juin.jour, null);
      const jour12 = mois('2026-06', { jour: '2026-06-12' }).jour;
      v.egal('jour touché : ses journées dans l\'ordre, avec leurs alertes', [jour12.date, jour12.titre, jour12.cartes.map((c) => [c.boite, c.horaires, c.alertes.map((a) => a.type)]), jour12.indispos],
        ['2026-06-12', 'ven. 12/06', [['boite-a', '8 h – 5 h +1 j', ['conflit']], ['boite-b', '14 h – 22 h', ['conflit']]], []]);
      v.egal('jour touché : indisponibilités du jour', [mois('2026-06', { jour: '2026-06-20' }).jour.indispos.map((i) => i.texte), mois('2026-09', { jour: '2026-09-05' }).jour.indispos.map((i) => i.texte)],
        [['Boîte C : indisponible le sam. 20/06'], ['Boîte C : indisponible du mar. 01/09 au jeu. 10/09']]);
      v.egal('jour touché, filtre Boîte B', mois('2026-06', { jour: '2026-06-12', boites: ['boite-b'] }).jour.cartes.map((c) => c.boite), ['boite-b']);
      v.egal('mois illisible : le mois en cours', af.vueMois(etat, reglages, MAINTENANT_FICTIF, { mois: 'juin' }).mois, '2026-10');
      v.egal('sans données : grille vide', af.vueMois(null, reglages, MAINTENANT_FICTIF).semaines.flat().filter((c) => c.boites.length || c.indispo).length, 0);
    },
  },
  {
    id: 'PL17',
    titre: 'Totaux à l\'écran (lot 23c2) : une colonne par boîte, une ligne par mois du plus récent au plus ancien, mois sans journée compris, le mois en cours en deux lignes (à venir, fait), journées et heures planifiées par boîte, total du mois avec ses dates différentes ; 12 derniers mois avec « + n journées à venir » ; mention « heures planifiées dans Eventsoft » ; filtre par boîte',
    etape: '23c2',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!af || !rg) return;
      if (typeof af.vueTotaux !== 'function') {
        v.vrai('vueTotaux présente', false);
        return;
      }
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const etat = etatFictif();
      const lignes = (t) => t.lignes.map((l) => [l.titre, ...l.cellules.map((c) => `${c.texte} ${c.heuresTexte}`), `${l.total.texte} ${l.total.heuresTexte} ${l.total.datesTexte}`]);
      const t = af.vueTotaux(etat, reglages, MAINTENANT_FICTIF);
      v.egal('colonnes : les boîtes dans l\'ordre des réglages', t.colonnes.map((c) => [c.boite, c.nom, c.lettre]), [['boite-a', 'Boîte A', 'B'], ['boite-b', 'Boîte B', 'O'], ['boite-c', 'Boîte C', 'I']]);
      v.egal('lignes : du plus récent au plus ancien, août sans journée, octobre en deux lignes', lignes(t), [
        ['Novembre 2026', '1 j 13 h 30', '0 j 0 h', '0 j 0 h', '1 j 13 h 30 1 date'],
        ['Octobre 2026, à venir', '0 j 0 h', '1 j 10 h', '0 j 0 h', '1 j 10 h 1 date'],
        ['Octobre 2026, fait', '0 j 0 h', '0 j 0 h', '1 j 10 h', '1 j 10 h 1 date'],
        ['Septembre 2026', '0 j 0 h', '0 j 0 h', '1 j 10 h', '1 j 10 h 1 date'],
        ['Août 2026', '0 j 0 h', '0 j 0 h', '0 j 0 h', '0 j 0 h 0 date'],
        ['Juillet 2026', '1 j 8 h', '1 j 5 h', '0 j 0 h', '2 j 13 h 2 dates'],
        ['Juin 2026', '1 j 14 h 30', '1 j 8 h', '0 j 0 h', '2 j 22 h 30 1 date'],
        ['Mai 2026', '0 j 0 h', '1 j 3 h', '2 j 4 h', '3 j 7 h 2 dates'],
      ]);
      v.egal('valeurs exactes gardées', [t.lignes[6].total.heures, t.lignes[6].cellules[0].journees, t.lignes[0].mois, t.lignes[1].partie, t.lignes[2].partie, t.lignes[0].partie], [22.5, 1, '2026-11', 'à venir', 'fait', null]);
      v.egal('12 derniers mois', [t.douzeMois.titre, t.douzeMois.texte, t.douzeMois.aVenirTexte, t.douzeMois.heures],
        ['12 derniers mois, du 27/10/2025 au 27/10/2026', '9 journées, 62 h 30, 7 jours différents', '+ 2 journées à venir', 62.5]);
      v.egal('mention des heures', t.note, 'Heures planifiées dans Eventsoft, pas les heures payées.');
      const c = af.vueTotaux(etat, reglages, MAINTENANT_FICTIF, { boites: ['boite-c'] });
      v.egal('filtre Boîte C : une colonne, ses mois seulement', [c.colonnes.map((x) => x.boite), c.lignes.map((l) => l.titre)],
        [['boite-c'], ['Octobre 2026, à venir', 'Octobre 2026, fait', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026', 'Mai 2026']]);
      v.egal('filtre Boîte C : 12 derniers mois, rien à venir', [c.douzeMois.texte, c.douzeMois.aVenirTexte], ['4 journées, 24 h, 4 jours différents', null]);
      const vide = af.vueTotaux(null, reglages, MAINTENANT_FICTIF);
      v.egal('sans données', [vide.lignes, vide.douzeMois.texte, vide.douzeMois.aVenirTexte, vide.note], [[], '0 journée, 0 h, 0 jour différent', null, 'Heures planifiées dans Eventsoft, pas les heures payées.']);
      const une = af.vueTotaux(etat, reglages, MAINTENANT_FICTIF, { boites: ['boite-a'] });
      v.egal('singulier : une journée à venir', [une.douzeMois.texte, une.douzeMois.aVenirTexte], ['2 journées, 22 h 30, 2 jours différents', '+ 1 journée à venir']);
    },
  },
  {
    id: 'PL18',
    titre: 'Conflits sur les cartes (lot 23c2) : conflit, repos de moins de 11 h et deux boîtes le même jour sur les deux journées citées, avec le nom affiché des boîtes ; calculés sur toutes les boîtes, même masquées par le filtre ; jamais sur une date retirée ; dates passées comprises ; indisponibilité sans alerte',
    etape: '23c2',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!af || !rg) return;
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const etat = etatFictif();
      const alertes = (liste) => Object.fromEntries([...liste.aVenir, ...liste.passees].map((c) => [`${c.boite} ${c.date}${c.retiree ? ' retirée' : ''}`, (c.alertes ?? []).map((a) => [a.type, a.texte])]));
      const conflit = ['conflit', 'Conflit : Boîte A (8 h – 18 h) et Boîte B (14 h – 22 h) le 12/06.'];
      const repos = ['repos', '4 h de repos entre Boîte A (fin 3 h) et Boîte B (début 7 h) le 09/07'];
      const suite = ['suite', 'Deux boîtes le 20/05 : 1 h entre les deux'];
      v.egal('alertes de chaque carte', alertes(af.vueListe(etat, reglages, MAINTENANT_FICTIF)), {
        'boite-b 2026-10-29': [], 'boite-a 2026-11-16': [],
        'boite-c 2026-10-20': [], 'boite-c 2026-09-20': [],
        'boite-b 2026-07-09': [repos], 'boite-a 2026-07-08': [repos],
        'boite-b 2026-06-12': [conflit], 'boite-a 2026-06-12': [conflit],
        'boite-c 2026-05-21': [], 'boite-b 2026-05-20': [suite], 'boite-c 2026-05-20': [suite],
      });
      const salon = af.vueListe(etat, reglages, MAINTENANT_FICTIF).passees.find((c) => c.boite === 'boite-a' && c.date === '2026-06-12');
      v.egal('puces : conflit et repos court', [salon.conflit, salon.repos, af.vueListe(etat, reglages, MAINTENANT_FICTIF).passees.find((c) => c.date === '2026-07-08').repos], [true, false, true]);
      const filtre = alertes(af.vueListe(etat, reglages, MAINTENANT_FICTIF, { boites: ['boite-a'] }));
      v.egal('filtre Boîte A : les alertes avec la Boîte B masquée restent', [filtre['boite-a 2026-06-12'], filtre['boite-a 2026-07-08']], [[conflit], [repos]]);
      const renommees = { ...reglages, boites: reglages.boites.map((b) => (b.id === 'boite-b' ? { ...b, affichage: 'Mon B' } : b)) };
      v.egal('nom affiché de la boîte', alertes(af.vueListe(etat, renommees, MAINTENANT_FICTIF))['boite-a 2026-06-12'], [['conflit', 'Conflit : Boîte A (8 h – 18 h) et Mon B (14 h – 22 h) le 12/06.']]);
      const sansB1 = calendrier({ calname: 'EventSoft / Boîte B', evenements: EVENEMENTS_B.filter((e) => e.uid !== 'b1@fictif') });
      const apres = MAINTENANT_FICTIF + H;
      const etat2 = { ...etat, boites: { ...etat.boites, 'boite-b': jr.appliquerLecture(etat.boites['boite-b'], lire(sansB1, 'Boîte B'), apres, { nom: 'Boîte B' }).etat } };
      const a2 = alertes(af.vueListe(etat2, reglages, apres));
      v.egal('date retirée : ni alerte sur elle ni conflit avec elle', [a2['boite-b 2026-06-12 retirée'], a2['boite-a 2026-06-12']], [[], []]);
    },
  },
  {
    id: 'PL19',
    titre: 'Case « Saisie dans Intermittent » (lot 23d, § 6.8) : cochée et décochée par la clé de la journée ; texte « Copier pour Intermittent » sur chaque carte, avec le nom affiché ; alerte forte « Modifiée après saisie… » sur la journée modifiée et « Retirée après saisie… » sur la carte retirée, gardées jusqu\'à confirmation ; filtre « À saisir » : journées passées et à venir sans la case, plus celles en alerte, sans indisponibilités ni dates retirées confirmées, avec le filtre par boîte, et leur nombre',
    etape: '23d',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      v.vrai('saisirJournee et confirmerAlerteSaisie présentes', typeof jr.saisirJournee === 'function' && typeof jr.confirmerAlerteSaisie === 'function');
      if (!af || !rg || typeof jr.saisirJournee !== 'function' || typeof jr.confirmerAlerteSaisie !== 'function') return;
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const T = MAINTENANT_FICTIF;
      const toutes = (e, o = {}, t = T) => {
        const l = af.vueListe(e, reglages, t, o);
        return [...l.aVenir, ...l.passees];
      };
      const carteDe = (e, boite, date, { retiree = false, t = T, ...o } = {}) => toutes(e, o, t).find((c) => c.boite === boite && c.date === date && Boolean(c.retiree) === retiree);
      let etat = etatFictif();
      v.egal('au départ : aucune case, aucune alerte, 11 journées à saisir', [toutes(etat).filter((c) => c.saisie).length, toutes(etat).filter((c) => c.alerteSaisie).length, af.vueListe(etat, reglages, T).nombreASaisir], [0, 0, 11]);
      const salon = carteDe(etat, 'boite-a', '2026-06-12');
      const journeeSalon = jr.journeesDeEtat(etat).find((j) => j.cle === salon.cle);
      v.egal('texte à copier sur la carte', salon.copie, jr.texteIntermittent(journeeSalon, 'Boîte A'));
      const renommees = { ...reglages, boites: reglages.boites.map((b) => (b.id === 'boite-a' ? { ...b, affichage: 'Mon A' } : b)) };
      v.vrai('texte à copier avec le nom affiché', af.vueListe(etat, renommees, T).passees.find((c) => c.cle === salon.cle).copie.startsWith('Employeur : Mon A\n'));

      etat = jr.saisirJournee(etat, salon.cle, true, T);
      v.egal('case cochée : gardée avec les UID et l\'empreinte', [carteDe(etat, 'boite-a', '2026-06-12').saisie, Object.values(etat.boites['boite-a'].saisies).map((s) => [s.uids, s.empreinte === jr.empreinteJournee(journeeSalon), s.le])],
        [true, [[['a1@fictif', 'a2@fictif'], true, T]]]);
      v.egal('cochée deux fois : une seule saisie', Object.keys(jr.saisirJournee(etat, salon.cle, true, T + H).boites['boite-a'].saisies).length, 1);
      const decochee = jr.saisirJournee(etat, salon.cle, false, T);
      v.egal('décochée : plus de saisie', [carteDe(decochee, 'boite-a', '2026-06-12').saisie, Object.keys(decochee.boites['boite-a'].saisies).length], [false, 0]);
      v.egal('clé inconnue : rien ne change', jr.saisirJournee(etat, 'boite-z|rien|2026-01-01', true, T), etat);

      const filtre = af.vueListe(etat, reglages, T, { aSaisir: true });
      v.egal('À saisir : la journée cochée sortie, 10 restent, passées et à venir', [filtre.nombreASaisir, filtre.aVenir.length + filtre.passees.length, filtre.aVenir.length, [...filtre.aVenir, ...filtre.passees].some((c) => c.cle === salon.cle)], [10, 10, 2, false]);
      v.egal('À saisir : sans indisponibilités', [filtre.indisposAVenir.length, filtre.indisposPassees.length], [0, 0]);
      const filtreA = af.vueListe(etat, reglages, T, { aSaisir: true, boites: ['boite-a'] });
      v.egal('À saisir avec le filtre Boîte A', [filtreA.nombreASaisir, [...filtreA.aVenir, ...filtreA.passees].map((c) => c.date)], [2, ['2026-11-16', '2026-07-08']]);

      // Gala (Boîte A, 08/07) saisi lui aussi ; puis le salon change d'horaire et le gala disparaît du planning.
      const gala = carteDe(etat, 'boite-a', '2026-07-08');
      etat = jr.saisirJournee(etat, gala.cle, true, T);
      const apres = T + H;
      const evenements = EVENEMENTS_A.filter((e) => e.uid !== 'a3@fictif').map((e) => (e.uid === 'a1@fictif' ? { ...e, debut: '20260612T070000Z' } : e));
      etat = { ...etat, boites: { ...etat.boites, 'boite-a': jr.appliquerLecture(etat.boites['boite-a'], lire(calendrier({ calname: 'EventSoft / Boîte A', evenements }), 'Boîte A'), apres, { nom: 'Boîte A' }).etat } };
      const modifiee = carteDe(etat, 'boite-a', '2026-06-12', { t: apres });
      const retiree = carteDe(etat, 'boite-a', '2026-07-08', { retiree: true, t: apres });
      v.egal('journée modifiée après saisie : case gardée, alerte forte', [modifiee?.saisie, modifiee?.alerteSaisie?.type, modifiee?.alerteSaisie?.texte],
        [true, 'modifiee', 'Modifiée après saisie dans Intermittent : corrige-la là-bas']);
      v.egal('journée retirée après saisie : carte retirée gardée, alerte forte', [Boolean(retiree), retiree?.saisie, retiree?.alerteSaisie?.type, retiree?.alerteSaisie?.texte],
        [true, true, 'retiree', 'Retirée après saisie dans Intermittent : corrige-la là-bas']);
      const enAlerte = af.vueListe(etat, reglages, apres, { aSaisir: true });
      v.egal('À saisir : les deux journées en alerte comprises', [enAlerte.nombreASaisir, [...enAlerte.aVenir, ...enAlerte.passees].filter((c) => c.alerteSaisie).map((c) => c.date)], [11, ['2026-07-08', '2026-06-12']]);
      const relue = { ...etat, boites: { ...etat.boites, 'boite-a': jr.appliquerLecture(etat.boites['boite-a'], lire(calendrier({ calname: 'EventSoft / Boîte A', evenements }), 'Boîte A'), apres + H, { nom: 'Boîte A' }).etat } };
      v.egal('alertes gardées après une autre lecture', [carteDe(relue, 'boite-a', '2026-06-12', { t: apres + H })?.alerteSaisie?.type, carteDe(relue, 'boite-a', '2026-07-08', { retiree: true, t: apres + H })?.alerteSaisie?.type], ['modifiee', 'retiree']);

      etat = jr.confirmerAlerteSaisie(etat, 'boite-a', modifiee.alerteSaisie.cle);
      const corrigee = carteDe(etat, 'boite-a', '2026-06-12', { t: apres });
      v.egal('modification confirmée : alerte retirée, case gardée', [corrigee.alerteSaisie, corrigee.saisie], [null, true]);
      etat = jr.confirmerAlerteSaisie(etat, 'boite-a', retiree.alerteSaisie.cle);
      const oubliee = carteDe(etat, 'boite-a', '2026-07-08', { retiree: true, t: apres });
      v.egal('retrait confirmé : carte retirée sans case ni alerte', [Boolean(oubliee), oubliee?.saisie, oubliee?.alerteSaisie], [true, false, null]);
      v.egal('À saisir après les confirmations : 9 journées', af.vueListe(etat, reglages, apres, { aSaisir: true }).nombreASaisir, 9);
    },
  },
  {
    id: 'PL20',
    titre: 'Export et import du planning (lot 23d, § 6.8) : fichier « mur-led-planning-<date>.json » au format appli-mur-led/planning, avec l\'historique, les cases Intermittent, les noms, couleurs et lettres des boîtes, jamais l\'adresse du relais ni les jetons (liste blanche) ; fichier illisible ou d\'un autre format refusé ; import sur un téléphone neuf (tout repris, réglages du téléphone intacts) ; import sur un téléphone qui a déjà des dates : ajoute seulement ce qui manque, garde ses propres versions et repères ; deuxième import : rien de nouveau',
    etape: '23d',
    async verifier(v) {
      const sv = await importerPlanning(v, '../src/planning/sauvegarde.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!sv || !rg) return;
      const T = MAINTENANT_FICTIF;
      const boites = rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))).map((b) => (b.id === 'boite-b' ? { ...b, affichage: 'Mon B', lettre: 'M' } : b));
      const reglages = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: JETON_APPLE_FICTIF, boites };
      // Historique : une phase ancienne de la Boîte C, sortie depuis du flux.
      const ancienne = { uid: 'c0@fictif', debut: '20260410T070000Z', fin: '20260410T150000Z', summary: 'Foire fictive / Installation', categories: 'Installation', lieu: 'Hall fictif C', client: 'Client fictif C' };
      let source = etatFictif();
      const avecAncienne = jr.appliquerLecture(undefined, lire(calendrier({ calname: 'EventSoft / Boîte C', evenements: [ancienne, ...EVENEMENTS_C] }), 'Boîte C'), T - 30 * JOUR, { nom: 'Boîte C' }).etat;
      source = { ...source, essai: T, boites: { ...source.boites, 'boite-c': jr.appliquerLecture(avecAncienne, lire(PLANNING_C, 'Boîte C'), T, { nom: 'Boîte C' }).etat } };
      const cle = (boite, date) => jr.journeesDeEtat(source).find((j) => j.boite === boite && j.date === date).cle;
      source = jr.saisirJournee(source, cle('boite-a', '2026-06-12'), true, T);
      source = jr.saisirJournee(source, cle('boite-b', '2026-10-29'), true, T);
      // Valeurs piégées : rien hors de la liste blanche ne doit partir.
      source = { ...source, relais: ADRESSE_FICTIVE, boites: { ...source.boites, 'boite-b': { ...source.boites['boite-b'], jeton: JETON_FICTIF, erreur: { le: T, texte: `Boîte B : pas joignable (${ADRESSE_FICTIVE})` } } } };

      v.egal('nom du fichier', sv.nomFichierPlanning(T), 'mur-led-planning-2026-10-27.json');
      const exporte = sv.exporterPlanning(reglages, source, T);
      const texte = JSON.stringify(exporte);
      v.egal('format, version, date', [exporte.format, exporte.version, exporte.exporte], ['appli-mur-led/planning', 1, T]);
      v.egal('ni adresse du relais ni jetons', [texte.includes('exemple.test'), texte.includes(JETON_FICTIF), texte.includes(JETON_APPLE_FICTIF)], [false, false, false]);
      v.egal('repères des boîtes', exporte.boites, boites.map(({ id, nom, affichage, couleur, lettre }) => ({ id, nom, affichage, couleur, lettre })));
      v.egal('historique compris (phase sortie du flux)', Boolean(exporte.etat.boites['boite-c'].phases['c0@fictif']?.horsFenetre), true);

      v.egal('fichier illisible refusé', sv.lireExportPlanning('{ pas du json'), { ok: false, erreur: 'Fichier illisible : ce n\'est pas un export du planning.' });
      v.egal('autre format refusé', sv.lireExportPlanning(JSON.stringify({ format: 'appli-mur-led/base', version: 1 })).ok, false);
      v.egal('version inconnue refusée', sv.lireExportPlanning(JSON.stringify({ ...exporte, version: 99 })).ok, false);
      const lu = sv.lireExportPlanning(JSON.stringify(exporte, null, 2));
      v.vrai('export relu', lu.ok);

      // Téléphone neuf : réglages à lui (autre relais), aucune date.
      const neufs = { relais: 'https://autre.relais.test', jeton: 'jeton-du-telephone-neuf-pour-les-tests-1234', jetonApple: null, boites: [] };
      const piege = JSON.parse(JSON.stringify(exporte));
      piege.relais = 'https://piege.relais.test';
      piege.jeton = 'jeton-piege-pour-les-tests-0123456789abcdef';
      piege.boites[0].relais = 'https://piege.relais.test';
      const imp = sv.importerPlanning(neufs, null, sv.lireExportPlanning(JSON.stringify(piege)).donnees);
      const cles = (e) => jr.journeesDeEtat(e).map((j) => j.cle).sort();
      v.egal('téléphone neuf : toutes les journées reprises', cles(imp.etat), cles(source));
      v.egal('cases Intermittent reprises', jr.journeesDeEtat(imp.etat).filter((j) => j.saisie).map((j) => `${j.boite} ${j.date}`).sort(), ['boite-a 2026-06-12', 'boite-b 2026-10-29']);
      v.egal('réglages du téléphone intacts, repères repris', [imp.reglages.relais, imp.reglages.jeton, imp.reglages.jetonApple, imp.reglages.boites.map((b) => [b.id, b.affichage, b.lettre])],
        [neufs.relais, neufs.jeton, null, [['boite-a', 'Boîte A', 'B'], ['boite-b', 'Mon B', 'M'], ['boite-c', 'Boîte C', 'I']]]);
      v.vrai('valeurs piégées ignorées', !JSON.stringify(imp).includes('piege'));
      v.egal('dernière lecture du fichier gardée, lecture due sur ce téléphone', [imp.etat.boites['boite-a'].lu, imp.etat.essai ?? null], [T, null]);
      v.egal('erreur d\'une boîte jamais reprise', imp.etat.boites['boite-b'].erreur ?? null, null);
      v.egal('résumé', imp.texte, 'Planning importé : 12 journées, 2 cases Intermittent et 3 boîtes ajoutées.');
      const encore = sv.importerPlanning(imp.reglages, imp.etat, lu.donnees);
      v.egal('deuxième import : rien de nouveau', [encore.texte, cles(encore.etat)], ['Planning importé : rien de nouveau, tout était déjà sur ce téléphone.', cles(source)]);

      // Téléphone qui a déjà des dates : le salon y a changé d'horaire, la Boîte A s'y appelle autrement.
      let local = etatFictif();
      const evenements = EVENEMENTS_A.map((e) => (e.uid === 'a1@fictif' ? { ...e, debut: '20260612T070000Z' } : e));
      local = { ...local, essai: T + H, boites: { ...local.boites, 'boite-a': jr.appliquerLecture(local.boites['boite-a'], lire(calendrier({ calname: 'EventSoft / Boîte A', evenements }), 'Boîte A'), T + H, { nom: 'Boîte A' }).etat } };
      local = jr.saisirJournee(local, jr.journeesDeEtat(local).find((j) => j.boite === 'boite-c' && j.date === '2026-10-20').cle, true, T + H);
      const reglagesLocaux = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: null, boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))).map((b) => (b.id === 'boite-b' ? { ...b, affichage: 'Ma B' } : b)) };
      const fusion = sv.importerPlanning(reglagesLocaux, local, lu.donnees);
      v.egal('fusion : la phase manquante ajoutée, la version du téléphone gardée', [Boolean(fusion.etat.boites['boite-c'].phases['c0@fictif']), fusion.etat.boites['boite-a'].phases['a1@fictif'].ev.debut], [true, utc(2026, 6, 12, 7)]);
      v.egal('fusion : cases des deux côtés', jr.journeesDeEtat(fusion.etat).filter((j) => j.saisie).map((j) => `${j.boite} ${j.date}`).sort(), ['boite-a 2026-06-12', 'boite-b 2026-10-29', 'boite-c 2026-10-20']);
      v.egal('fusion : repères et lectures du téléphone gardés', [fusion.reglages.boites.find((b) => b.id === 'boite-b').affichage, fusion.etat.boites['boite-a'].lu, fusion.etat.essai, fusion.reglages.relais], ['Ma B', T + H, T + H, ADRESSE_FICTIVE]);
      v.egal('fusion : résumé', fusion.texte, 'Planning importé : 1 journée et 2 cases Intermittent ajoutées.');
    },
  },
  {
    id: 'PL21',
    titre: 'Adresses d\'abonnement Apple (lot 23d, § 7) : webcal:// et https:// vers /apple/<jeton Apple>/<boîte>.ics sur le relais ; rien sans adresse du relais, sans jeton Apple ou pour une boîte d\'identifiant illisible ; jamais le jeton de l\'appli',
    etape: '23d',
    async verifier(v) {
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!rg) return;
      v.vrai('adressesApple présente', typeof rg.adressesApple === 'function');
      if (typeof rg.adressesApple !== 'function') return;
      const reglages = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: JETON_APPLE_FICTIF, boites: [] };
      v.egal('deux adresses', rg.adressesApple(reglages, 'boite-a'), {
        webcal: `webcal://relais.exemple.test/apple/${JETON_APPLE_FICTIF}/boite-a.ics`,
        https: `https://relais.exemple.test/apple/${JETON_APPLE_FICTIF}/boite-a.ics`,
      });
      v.egal('sans jeton Apple, sans adresse, boîte illisible : rien', [
        rg.adressesApple({ ...reglages, jetonApple: null }, 'boite-a'), rg.adressesApple({ ...reglages, relais: null }, 'boite-a'),
        rg.adressesApple(reglages, '../boites.json'), rg.adressesApple(reglages, ''),
      ], [null, null, null, null]);
      v.vrai('jamais le jeton de l\'appli', !JSON.stringify(rg.adressesApple(reglages, 'boite-b')).includes(JETON_FICTIF));
    },
  },
  {
    id: 'PL22',
    titre: 'Durée de travail de chaque carte (lot 23d2) : « 10 h de travail » sous les horaires, comptée sur les phases planifiées (la pause entre deux phases ne compte pas : « 14 h 30 de travail »), « 45 min de travail » pour une courte journée, aussi sur une carte retirée',
    etape: '23d2',
    async verifier(v) {
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      if (!af || !rg) return;
      const reglages = { ...rg.reglagesVides(), boites: rg.fusionnerBoites([], Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))) };
      const T = MAINTENANT_FICTIF;
      const carteDe = (e, boite, date, { retiree = false, t = T } = {}) => {
        const l = af.vueListe(e, reglages, t);
        return [...l.aVenir, ...l.passees].find((c) => c.boite === boite && c.date === date && Boolean(c.retiree) === retiree);
      };
      const etat = etatFictif();
      v.egal('durées des journées du jeu fictif', [carteDe(etat, 'boite-b', '2026-10-29')?.duree, carteDe(etat, 'boite-a', '2026-06-12')?.duree, carteDe(etat, 'boite-c', '2026-05-21')?.duree],
        ['10 h de travail', '14 h 30 de travail', '2 h de travail']);
      const apres = T + H;
      const sansA3 = calendrier({ calname: 'EventSoft / Boîte A', evenements: EVENEMENTS_A.filter((e) => e.uid !== 'a3@fictif') });
      const etatRetire = { ...etat, boites: { ...etat.boites, 'boite-a': jr.appliquerLecture(etat.boites['boite-a'], lire(sansA3, 'Boîte A'), apres, { nom: 'Boîte A' }).etat } };
      v.egal('carte retirée : sa durée aussi', carteDe(etatRetire, 'boite-a', '2026-07-08', { retiree: true, t: apres })?.duree, '8 h de travail');
      const visite = { uid: 'c9@fictif', debut: '20261105T090000Z', fin: '20261105T094500Z', summary: 'Visite fictive / Livraison', categories: 'Livraison' };
      const avecVisite = { ...etat, boites: { ...etat.boites, 'boite-c': jr.appliquerLecture(etat.boites['boite-c'], lire(calendrier({ calname: 'EventSoft / Boîte C', evenements: [...EVENEMENTS_C, visite] }), 'Boîte C'), apres, { nom: 'Boîte C' }).etat } };
      v.egal('journée de 45 min', carteDe(avecVisite, 'boite-c', '2026-11-05', { t: apres })?.duree, '45 min de travail');
    },
  },
  {
    id: 'PL23',
    titre: 'Devis Eventsoft (lot 25b) : presta du devis rapprochée de celle du planning de la même boîte, par nom souple (casse, accents, tirets) et dates qui se chevauchent ; même nom à d\'autres dates (salon annuel) écarté ; deux candidates : aucune choisie, le choix de l\'utilisateur gardé',
    etape: '25b',
    async verifier(v) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const salon = 'Salon fictif / Hall 1 / Stand 12';
      const phases = [
        phase('boite-a', salon, 'Installation', utc(2026, 6, 12, 6), utc(2026, 6, 12, 16), 's1'),
        phase('boite-a', salon, 'Démontage', utc(2026, 6, 12, 22, 30), utc(2026, 6, 13, 3), 's2'),
        phase('boite-a', salon, 'Installation', utc(2027, 6, 11, 6), utc(2027, 6, 11, 16), 's3'),
        phase('boite-b', salon, 'Installation', utc(2026, 6, 12, 6), utc(2026, 6, 12, 16), 's4'),
        phase('boite-a', 'Congrès fictif / Salle 1', 'Installation', utc(2026, 11, 16, 8), utc(2026, 11, 16, 17), 'c1'),
        phase('boite-a', 'Congrès fictif / Salle 2', 'Installation', utc(2026, 11, 16, 8), utc(2026, 11, 16, 17), 'c2'),
        phase('boite-a', 'Gala fictif', 'Prestation', utc(2026, 7, 8, 17), utc(2026, 7, 9, 1), 'g1'),
        phase('boite-a', 'Gala fictif / Soirée', 'Prestation', utc(2026, 7, 8, 17), utc(2026, 7, 9, 1), 'g2'),
        phase('boite-a', 'Autre', 'Autre', utc(2026, 7, 8, 0), utc(2026, 7, 9, 0), 'i1', { indispo: true }),
      ];
      const r = (presta, options = {}) => dv.rapprocher(presta, phases, { boite: 'boite-a', ...options });
      v.egal('salon : lié, phases de la boîte A de 2026 seulement', r(DEVIS_SALON), { statut: 'liee', presta: salon, candidates: [salon], phases: ['s1', 's2'] });
      v.egal('édition suivante du salon : celle de 2027', r({ ...DEVIS_SALON, debut: '2027-06-11', fin: '2027-06-11' }).phases, ['s3']);
      v.egal('salon à d\'autres dates : aucune', r({ ...DEVIS_SALON, debut: '2025-06-12', fin: '2025-06-13' }).statut, 'aucune');
      v.egal('même salon dans la boîte B : la phase de la boîte B seule', dv.rapprocher(DEVIS_SALON, phases, { boite: 'boite-b' }).phases, ['s4']);
      v.egal('nom identique préféré à un nom qui le contient', r({ nom: 'GALA FICTIF', debut: '2026-07-08', fin: '2026-07-08' }).presta, 'Gala fictif');
      v.egal('nom du planning contenu dans celui du devis', r({ nom: 'Gala Fictif 2026', debut: '2026-07-08', fin: '2026-07-09' }).presta, 'Gala fictif');
      const deux = r(DEVIS_CONGRES);
      v.egal('deux candidates : aucune choisie', [deux.statut, deux.presta, deux.candidates], ['a-choisir', null, ['Congrès fictif / Salle 1', 'Congrès fictif / Salle 2']]);
      const choisie = r(DEVIS_CONGRES, { choix: 'Congrès fictif / Salle 2' });
      v.egal('choix de l\'utilisateur gardé', [choisie.statut, choisie.presta, choisie.phases], ['liee', 'Congrès fictif / Salle 2', ['c2']]);
      v.egal('choix qui n\'est plus candidat : à choisir', r(DEVIS_CONGRES, { choix: 'Congrès fictif / Salle 3' }).statut, 'a-choisir');
      v.egal('indisponibilité jamais rapprochée', r({ nom: 'Autre', debut: '2026-07-08', fin: '2026-07-08' }).statut, 'aucune');
      v.egal('nom trop court : pas de rapprochement par inclusion', r({ nom: 'Ga', debut: '2026-07-08', fin: '2026-07-09' }).statut, 'aucune');
    },
  },
  {
    id: 'PL24',
    titre: 'Devis Eventsoft (lot 25b) : domaine de chaque section par le titre puis les lignes (note interne en titre), ligne reconnue comme dalle ou processeur de la base classée MUR LED où qu\'elle soit (processeur de la régie vidéo), projecteur « PAR LED » en lumière ; poste → domaine en majuscules ou en casse mixte, AUTRE sinon',
    etape: '25b',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const base = baseDevis(contexte);
      const classe = dv.classerDevis(DEVIS_SALON.sections, base);
      v.egal('domaine de chaque section', classe.map((s) => s.domaine),
        ['MUR LED', 'VIDÉO', 'LUMIÈRE', 'SON', 'STRUCTURE / ACCROCHE', 'DÉCO / TAPISSERIE', 'ÉLECTRICITÉ', 'AUTRE']);
      v.egal('régie vidéo : processeur reconnu en MUR LED, mélangeur en VIDÉO', classe[1].lignes.map((l) => [l.domaine, l.processeur]),
        [['MUR LED', 'novastar-mctrl660'], ['VIDÉO', null]]);
      const [dalle, bumper] = classe[0].lignes;
      v.egal('dalle reconnue, quantités lues, composant « * »', [dalle.dalle?.fiche, dalle.quantite, bumper.composant, bumper.quantite, bumper.dalle],
        ['unilumin-urmiii04-500x1000', 26, true, 4, null]);
      v.egal('projecteur « PAR LED » : lumière, pas mur LED', classe[2].lignes[0].domaine, 'LUMIÈRE');
      v.egal('quantités', ['64.0', '999.9', '2,5', '', 'abc', null].map(dv.lireQuantite), [64, 999.9, 2.5, null, null, null]);
      const sansMot = dv.classerDevis([{ titre: 'Lot 2', lignes: [{ ref: 'X1', designation: DESIGNATIONS_FICTIVES.urm48, quantite: '4.0', composant: false }] }], base);
      v.egal('titre sans mot-clé, ligne de dalle : MUR LED', sansMot[0].domaine, 'MUR LED');
      v.egal('poste → domaine', ['TECHNICIEN MUR LED', 'Assistant Mur Led', 'TECHNICIEN VIDEO SV', 'TECHNICIEN MODULOPI / WATCHOUT', 'PUPITREUR LUMIERE NIV 1',
        'Technicien Son', 'ROAD 4H', 'RESPONSABLE TECHNIQUE', 'TSL', '*', ''].map(dv.domainePoste),
      ['MUR LED', 'MUR LED', 'VIDÉO', 'VIDÉO', 'LUMIÈRE', 'SON', 'AUTRE', 'AUTRE', 'AUTRE', 'AUTRE', 'AUTRE']);
    },
  },
  {
    id: 'PL25',
    titre: 'Devis Eventsoft (lot 25b) : « Ton matériel : mur LED » (sections et lignes du domaine du poste, processeur de la régie compris) puis « Le reste du devis » ; deux postes : les deux domaines ; poste AUTRE ou inconnu : tout replié ; postes par créneau (« JJ/MM »), même poste en casse différente fusionné, poste sans jour sur chaque jour',
    etape: '25b',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const classe = dv.classerDevis(DEVIS_SALON.sections, baseDevis(contexte));
      const titres = (liste) => liste.map((s) => [s.titre, s.lignes.map((l) => l.ref)]);
      const mur = dv.vueDevis(classe, ['TECHNICIEN MUR LED', 'Assistant Mur Led']);
      v.egal('poste mur LED', [mur.domaines, mur.titre, mur.toutReplie], [['MUR LED'], 'Ton matériel : mur LED', false]);
      v.egal('ton matériel : l\'écran et le processeur de la régie', titres(mur.tonMateriel),
        [['ECRAN LED FOND DE SCENE L=4m H=3m', ['URMIII04', 'BUMP-FICT']], ['REGIE VIDEO', ['MCTRL660']]]);
      v.egal('le reste du devis : 7 sections, la régie sans le processeur', [mur.reste.length, titres(mur.reste).slice(0, 2)],
        [7, [['REGIE VIDEO', ['MEL-FICT']], ['ECLAIRAGE', ['PAR-FICT']]]]);
      const video = dv.vueDevis(classe, ['TECHNICIEN VIDEO SV']);
      v.egal('poste vidéo : toute la régie', [video.titre, titres(video.tonMateriel), video.reste.length],
        ['Ton matériel : vidéo', [['REGIE VIDEO', ['MCTRL660', 'MEL-FICT']]], 7]);
      const deux = dv.vueDevis(classe, ['TECHNICIEN MUR LED', 'Technicien Son']);
      v.egal('deux postes : les deux domaines', [deux.titre, deux.tonMateriel.map((s) => s.titre)],
        ['Ton matériel : mur LED, son', ['ECRAN LED FOND DE SCENE L=4m H=3m', 'REGIE VIDEO', 'SONORISATION']]);
      for (const postes of [['ROAD 4H'], []]) {
        const autre = dv.vueDevis(classe, postes);
        v.egal(`poste ${postes[0] ?? 'inconnu'} : tout replié`, [autre.titre, autre.tonMateriel, autre.reste.length, autre.toutReplie], [null, [], 8, true]);
      }
      v.egal('postes du 12/06 : même poste en casse différente fusionné', dv.postesDuJour(DEVIS_SALON.postes, '2026-06-12'), ['TECHNICIEN MUR LED']);
      v.egal('postes du 13/06', dv.postesDuJour(DEVIS_SALON.postes, '2026-06-13'), ['ASSISTANT MUR LED']);
      v.egal('aucun créneau ce jour-là : rien', dv.postesDuJour(DEVIS_SALON.postes, '2026-06-14'), []);
      v.egal('casse mixte, deux postes le même jour, poste sans jour en plus', dv.postesDuJour(DEVIS_CONGRES.postes, '2026-11-16'),
        ['Assistant Mur Led', 'Road 4h', 'TECHNICIEN VIDEO SV']);
      v.egal('poste sans jour : chaque jour', dv.postesDuJour(DEVIS_CONGRES.postes, '2026-11-17'), ['TECHNICIEN VIDEO SV']);
      v.egal('texte des postes : un, deux, aucun', [dv.textePostes(['TECHNICIEN MUR LED']), dv.textePostes(['Assistant Mur Led', 'Road 4h']), dv.textePostes([])],
        ['TECHNICIEN MUR LED', 'Assistant Mur Led et Road 4h', '']);
    },
  },
  {
    id: 'PL26',
    titre: 'Devis Eventsoft (lot 25b) : dalle reconnue par la désignation (marque, pitch à 0,05 mm, dimensions, pixels) et la référence (modèle, alias) ; les 5 fiches Unilumin 500 × 500 mm en 192 × 192 px : choix, retenu ensuite par la référence du parc ; fiches d\'information et à compléter écartées ; demi-dalle par sa propre fiche ; processeur par référence ou désignation',
    etape: '25b',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const base = baseDevis(contexte);
      v.egal('désignation lue', dv.lireDesignation(DESIGNATIONS_FICTIVES.upad26), { pitchMm: 2.6, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 });
      v.egal('autre écriture, puis aucune', [dv.lireDesignation('Ecran P3,9 500x1000 mm 128x256px'), dv.lireDesignation('Câble DMX 10 m')],
        [{ pitchMm: 3.9, largeurMm: 500, hauteurMm: 1000, pxH: 128, pxV: 256 }, null]);
      const court = (r) => [r.statut, r.fiche, r.demi, r.par];
      const reco = (designation, ref = '', options = {}, dalles = base.dalles) => dv.reconnaitreDalle({ ref, designation }, dalles, options);
      const cinq = ['unilumin-upad-iv-2-6', 'unilumin-upad-iv-2-6-pro', 'unilumin-upad-iv-c', 'unilumin-upad-iv-s', 'unilumin-urmiii2-6'];
      const ambigu = reco(DESIGNATIONS_FICTIVES.upad26, 'UPADIV2.6');
      v.egal('5 fiches Unilumin : choix de l\'utilisateur', [ambigu.statut, ambigu.fiche, ambigu.candidats], ['choix', null, cinq]);
      const avecIncompletes = [...base.dalles,
        { id: 'fictive-information', marque: 'Unilumin', statut: 'information', pitchMm: 2.6, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 },
        { id: 'fictive-a-completer', marque: 'Unilumin', pitchMm: 2.6, largeurMm: 500, hauteurMm: 500 }];
      v.egal('fiches d\'information et à compléter écartées', reco(DESIGNATIONS_FICTIVES.upad26, 'UPADIV2.6', {}, avecIncompletes).candidats, cinq);
      v.egal('choix retenu par la référence du parc', court(reco(DESIGNATIONS_FICTIVES.upad26, 'UPADIV2.6', { references: { 'UPADIV2.6': 'unilumin-upad-iv-c' } })),
        ['reconnue', 'unilumin-upad-iv-c', false, 'parc']);
      v.egal('référence du parc vers une fiche disparue : choix', reco(DESIGNATIONS_FICTIVES.upad26, 'UPADIV2.6', { references: { 'UPADIV2.6': 'fiche-retiree' } }).statut, 'choix');
      v.egal('alias de la fiche', court(reco('DALLE LED UNILUMIN UPAD IV 2 PRO', 'UPADIV2PRO')), ['reconnue', 'unilumin-upad-iv-2-6-pro', false, 'reference']);
      v.egal('modèle de la fiche : la dalle entière, pas sa demi-dalle', court(reco('Dalle LED', 'URMIII04')), ['reconnue', 'unilumin-urmiii04-500x1000', false, 'reference']);
      v.egal('par les caractéristiques', court(reco(DESIGNATIONS_FICTIVES.urm48, 'REF-FICT')), ['reconnue', 'unilumin-urmiii04-500x1000', false, 'caracteristiques']);
      v.egal('pitch à 0,05 mm près : 4,83 oui, 4,9 non', [reco(DESIGNATIONS_FICTIVES.urm48.replace('4.8mm', '4.83mm')).fiche, reco(DESIGNATIONS_FICTIVES.urm48.replace('4.8mm', '4.9mm')).statut],
        ['unilumin-urmiii04-500x1000', 'aucune']);
      v.egal('demi-dalle : sa propre fiche', court(reco(DESIGNATIONS_FICTIVES.urm48demi)), ['reconnue', 'unilumin-urmiii04-500x500', true, 'caracteristiques']);
      v.egal('ligne qui n\'est pas une dalle', reco('Câble DMX 10 m', 'DMX10'), { statut: 'aucune', fiche: null, candidats: [], demi: false, par: null, lue: null });
      const proc = (ref, designation) => dv.reconnaitreProcesseur({ ref, designation }, base.processeurs);
      v.egal('processeurs : par référence, par désignation, aucun', [proc('MCTRL4K', 'Processeur NOVASTAR MCTRL4K'), proc('PROC-12', 'Processeur NOVASTAR MCTRL660'), proc('MEL-FICT', 'Mélangeur vidéo fictif')],
        ['novastar-mctrl4k', 'novastar-mctrl660', null]);
    },
  },
  {
    id: 'PL27',
    titre: 'Devis Eventsoft (lot 25b) : dimensions lues dans les titres (« L=4m », « L=4,5m », « H= », « Ht= », cm, « 4x », « x4 », « 4 x ») et configuration proposée au format de l\'onglet Mur (mode taille, dalle) ; quantité contrôlée sans bloquer (spares), non multiple du multiplicateur, titre sans dimensions, demi-dalles proposées, dalle à choisir, noms coupés à 40 caractères',
    etape: '25b',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const base = baseDevis(contexte);
      const t = (largeurM, hauteurM, multiplicateur = 1) => ({ largeurM, hauteurM, multiplicateur });
      v.egal('formats de titre', ['ECRAN LED L=4m H=3m', 'Mur LED L=4,5m Ht=2.5m', 'Ecran L=450cm H=250cm', 'L = 6 m / H = 3,5 m',
        'ECRAN LED 4x L=2m H=1m', 'ECRAN x4 L=2m H=1m', 'ECRAN 4 x L=2m H=1m', 'ECRAN LED'].map(dv.lireTitre),
      [t(4, 3), t(4.5, 2.5), t(4.5, 2.5), t(6, 3.5), t(2, 1, 4), t(2, 1, 4), t(2, 1, 4), t(null, null)]);
      const salon = dv.classerDevis(DEVIS_SALON.sections, base);
      const fond = dv.configurationProposee(salon[0], base);
      v.egal('fond de scène : un mur de 4 × 3 m en URMIII04, 26 dalles pour 24', [fond.murs, fond.alertes], [
        [{ nom: 'ECRAN LED FOND DE SCENE', demi: null, formulaires: { 'form-mur': { mode: 'taille', largeurM: '4', hauteurM: '3', dalle: 'unilumin-urmiii04-500x1000', demi: false } } }],
        ['Le devis prévoit 26 dalles ; 4 × 3 m en demande 24 (spares possibles).'],
      ]);
      v.egal('section sans dalle : rien', dv.configurationProposee(salon[1], base), null);
      const congres = dv.classerDevis(DEVIS_CONGRES.sections, base);
      const lat = dv.configurationProposee(congres[0], base);
      const resume = (c) => c.murs.map((m) => [m.nom, m.formulaires['form-mur'].largeurM, m.formulaires['form-mur'].hauteurM]);
      v.egal('« 2x » : deux murs nommés 1 et 2, quantité juste', [resume(lat), lat.alertes], [[['ECRANS LATERAUX 1', '2', '1'], ['ECRANS LATERAUX 2', '2', '1']], []]);
      const centre = dv.configurationProposee(congres[1], base);
      const formCentre = centre.murs[0].formulaires['form-mur'];
      v.egal('demi-dalles : leur fiche, « demi-dalles disponibles » coché, haut ou bas au choix', [resume(centre), centre.murs[0].demi, formCentre.demi, 'positionDemi' in formCentre, centre.choixPositionDemi, centre.alertes],
        [[['ECRAN CENTRAL', '4', '2.5']], 'unilumin-urmiii04-500x500', true, false, true, []]);
      const neuf = dv.configurationProposee({ ...congres[0], lignes: [{ ...congres[0].lignes[0], quantite: 9 }] }, base);
      v.egal('quantité non multiple du multiplicateur', neuf.alertes,
        ['9 dalles ne se partagent pas en 2 murs égaux.', 'Le devis prévoit 9 dalles ; 2 murs de 2 × 1 m en demandent 8 (spares possibles).']);
      const sansDim = dv.configurationProposee({ ...congres[0], titre: 'ECRANS LATERAUX' }, base);
      v.egal('titre sans dimensions : quantité seule, forme au choix', [sansDim.murs, sansDim.formeAChoisir, sansDim.quantite, sansDim.alertes],
        [[], true, 8, ['Titre sans dimensions : 8 dalles, forme à choisir.']]);
      const section = (titre, ref, designation, quantite) => dv.classerDevis([{ titre, lignes: [{ ref, designation, quantite, composant: false }] }], base)[0];
      const cinq = ['unilumin-upad-iv-2-6', 'unilumin-upad-iv-2-6-pro', 'unilumin-upad-iv-c', 'unilumin-upad-iv-s', 'unilumin-urmiii2-6'];
      const amb = dv.configurationProposee(section('ECRAN L=4m H=2m', 'UPADIV2.6', DESIGNATIONS_FICTIVES.upad26, '32.0'), base);
      v.egal('dalle à choisir : mur proposé sans dalle, sans contrôle de quantité', [amb.dalle, amb.choixDalle, amb.murs[0].formulaires['form-mur'].dalle, amb.alertes], [null, cinq, '', []]);
      const parc = dv.configurationProposee(dv.classerDevis([{ titre: 'ECRAN L=4m H=2m', lignes: [{ ref: 'UPADIV2.6', designation: DESIGNATIONS_FICTIVES.upad26, quantite: '32.0', composant: false }] }],
        { ...base, references: { 'UPADIV2.6': 'unilumin-upad-iv-c' } })[0], base);
      v.egal('dalle retenue par le parc, quantité juste', [parc.dalle, parc.murs[0].formulaires['form-mur'].dalle, parc.alertes], ['unilumin-upad-iv-c', 'unilumin-upad-iv-c', []]);
      const long = dv.configurationProposee(section(`${'X'.repeat(50)} 2x L=2m H=1m`, 'URMIII04', DESIGNATIONS_FICTIVES.urm48, '8.0'), base);
      v.egal('noms coupés à 40 caractères', long.murs.map((m) => m.nom), [`${'X'.repeat(38)} 1`, `${'X'.repeat(38)} 2`]);
    },
  },
  {
    id: 'PL28',
    titre: 'Devis Eventsoft (lot 25b) : processeurs comparés au niveau de la presta (somme des processeurs conseillés pour les murs proposés, toutes marques de la liste, face au total du devis) : « Le devis prévoit 1 × MCTRL660 ; l\'appli en conseille 1. » ou l\'écart',
    etape: '25b',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const base = baseDevis(contexte);
      const deux = base.processeurs.filter((p) => ['novastar-mctrl660', 'novastar-mctrl4k'].includes(p.id));
      const reglages = { frequenceHz: 60, bits: 8 };
      const presta = (sections, processeurs = deux) => {
        const classe = dv.classerDevis(sections, base);
        const murs = classe.flatMap((s) => dv.configurationProposee(s, base)?.murs ?? []);
        return dv.processeursPresta(classe, murs, { dalles: base.dalles, processeurs, reglages });
      };
      const un660 = [{ id: 'novastar-mctrl660', modele: 'MCTRL660', nombre: 1 }];
      const salon = presta(DEVIS_SALON.sections);
      v.egal('salon : le devis et l\'appli d\'accord', [salon.devis, salon.conseil, salon.identique, salon.texte],
        [un660, un660, true, 'Le devis prévoit 1 × MCTRL660 ; l\'appli en conseille 1.']);
      const congres = presta(DEVIS_CONGRES.sections);
      v.egal('congrès : 3 murs, un MCTRL660 chacun, face aux 2 MCTRL4K du devis', [congres.devis, congres.conseil, congres.identique, congres.texte],
        [[{ id: 'novastar-mctrl4k', modele: 'MCTRL4K', nombre: 2 }], [{ id: 'novastar-mctrl660', modele: 'MCTRL660', nombre: 3 }], false,
          'Le devis prévoit 2 × MCTRL4K ; l\'appli conseille 3 × MCTRL660.']);
      const seul4k = presta(DEVIS_CONGRES.sections, deux.filter((p) => p.id === 'novastar-mctrl4k'));
      v.egal('même modèle, nombre différent', seul4k.texte, 'Le devis prévoit 2 × MCTRL4K ; l\'appli conseille 3 × MCTRL4K.');
      v.egal('devis sans processeur', presta(DEVIS_CONGRES.sections.slice(0, 2)).texte, 'Le devis ne prévoit aucun processeur ; l\'appli conseille 3 × MCTRL660.');
      const amb = presta([{ titre: 'ECRAN L=4m H=2m', lignes: [{ ref: 'UPADIV2.6', designation: DESIGNATIONS_FICTIVES.upad26, quantite: '32.0', composant: false }] }, ...DEVIS_SALON.sections.slice(1, 2)]);
      v.egal('mur dont la dalle est à choisir : hors du conseil, signalé', [amb.sansConseil, amb.conseil, amb.texte],
        [['ECRAN'], [], 'Le devis prévoit 1 × MCTRL660 ; l\'appli ne conseille rien tant qu\'une dalle reste à choisir.']);
    },
  },
  {
    id: 'PL29',
    titre: 'Devis Eventsoft (lot 25d) : déchiffrement de bout en bout (HKDF-SHA-256, AES-256-CBC, HMAC-SHA-256 vérifié avant) sur le vecteur commun au robot ; refus d\'une clé illisible, d\'une enveloppe mal formée, d\'une version inconnue, d\'un HMAC faux, d\'un contenu illisible et d\'un rejeu ; la clé jamais dans une erreur ni dans l\'export du planning',
    etape: '25d',
    async verifier(v) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      const sv = await importerPlanning(v, '../src/planning/sauvegarde.js');
      if (!dv || !sv) return;
      if (typeof dv.dechiffrerDevis !== 'function') {
        v.vrai('dechiffrerDevis exportée par src/planning/devis.js', false);
        return;
      }
      const vec = await (await fetch(new URL('./vecteur-chiffrement.json', import.meta.url), { cache: 'no-store' })).json();
      const hex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
      const b64 = (o) => btoa(String.fromCharCode(...new Uint8Array(o)));
      const d64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      // Enveloppe scellée ici avec les clés dérivées du vecteur (calculées par openssl), sans passer par le code testé.
      async function sceller(clair, { version = 1, cleEnc = vec.cleEnc, cleMac = vec.cleMac } = {}) {
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const kEnc = await crypto.subtle.importKey('raw', hex(cleEnc), 'AES-CBC', false, ['encrypt']);
        const kMac = await crypto.subtle.importKey('raw', hex(cleMac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, kEnc, new TextEncoder().encode(clair)));
        const mac = await crypto.subtle.sign('HMAC', kMac, Uint8Array.from([version, ...iv, ...chiffre]));
        return JSON.stringify({ v: version, iv: b64(iv), chiffre: b64(chiffre), mac: b64(mac) });
      }
      const texte = JSON.stringify(vec.enveloppe);
      const bon = await dv.dechiffrerDevis(texte, vec.cle);
      v.egal('vecteur commun : contenu retrouvé à l\'octet près', [bon.ok, JSON.stringify(bon.devis)], [true, JSON.stringify(JSON.parse(vec.clair))]);
      v.egal('enveloppe donnée en objet', (await dv.dechiffrerDevis(vec.enveloppe, vec.cle)).ok, true);
      v.egal('clé en majuscules, espaces de bord retirés', (await dv.dechiffrerDevis(texte, `  ${vec.cle.toUpperCase()}\n`)).ok, true);
      const code = async (env, cle = vec.cle, options) => (await dv.dechiffrerDevis(env, cle, options)).code;
      v.egal('clé illisible (63 caractères, lettre hors hexadécimal, absente)', [await code(texte, vec.cle.slice(1)), await code(texte, `${vec.cle.slice(1)}g`), await code(texte, null)], ['cle', 'cle', 'cle']);
      const env = vec.enveloppe;
      v.egal('enveloppe mal formée (texte, champ absent, base64 faux, IV de 15 octets, MAC de 31 octets)', [
        await code('{ pas du json'), await code(JSON.stringify({ v: 1, iv: env.iv, mac: env.mac })), await code(JSON.stringify({ ...env, chiffre: '%%%' })),
        await code(JSON.stringify({ ...env, iv: b64(d64(env.iv).slice(1)) })), await code(JSON.stringify({ ...env, mac: b64(d64(env.mac).slice(1)) })),
      ], ['format', 'format', 'format', 'format', 'format']);
      v.egal('version d\'enveloppe inconnue', await code(JSON.stringify({ ...env, v: 2 })), 'version');
      const macFaux = d64(env.mac);
      macFaux[0] ^= 1;
      const chiffreTouche = d64(env.chiffre);
      chiffreTouche[chiffreTouche.length - 1] ^= 1;
      const ivTouche = d64(env.iv);
      ivTouche[0] ^= 1;
      v.egal('HMAC faux, chiffré ou IV retouché, autre clé : refus avant de déchiffrer', [
        await code(JSON.stringify({ ...env, mac: b64(macFaux) })), await code(JSON.stringify({ ...env, chiffre: b64(chiffreTouche) })),
        await code(JSON.stringify({ ...env, iv: b64(ivTouche) })), await code(texte, 'ff'.repeat(32)),
      ], ['mac', 'mac', 'mac', 'mac']);
      v.egal('version 2 scellée avec la bonne clé : refusée aussi', await code(await sceller(vec.clair, { version: 2 })), 'version');
      const contenu = JSON.parse(vec.clair);
      v.egal('contenu illisible (pas du JSON, sans boîtes, sans date de lecture)', [
        await code(await sceller('pas du json')), await code(await sceller(JSON.stringify({ ...contenu, boites: null }))),
        await code(await sceller(JSON.stringify({ ...contenu, lueLe: 'hier' }))),
      ], ['contenu', 'contenu', 'contenu']);
      v.egal('version de contenu inconnue', await code(await sceller(JSON.stringify({ ...contenu, version: 2 }))), 'version');
      v.egal('rejeu : lecture plus ancienne que la dernière acceptée refusée, même date acceptée, plus récente acceptée', [
        await code(texte, vec.cle, { dernierLueLe: '2026-11-01T07:00:01Z' }),
        (await dv.dechiffrerDevis(texte, vec.cle, { dernierLueLe: contenu.lueLe })).ok,
        (await dv.dechiffrerDevis(texte, vec.cle, { dernierLueLe: '2026-10-31T19:00:00Z' })).ok,
      ], ['rejeu', true, true]);
      const deux = [await sceller(vec.clair), await sceller(vec.clair)];
      v.vrai('IV tiré à chaque envoi : deux enveloppes du même contenu diffèrent et se lisent', deux[0] !== deux[1] && (await Promise.all(deux.map((e) => dv.dechiffrerDevis(e, vec.cle)))).every((r) => r.ok));
      const refus = await Promise.all([[texte, vec.cle.slice(1)], [JSON.stringify({ ...env, mac: b64(macFaux) })], [texte, vec.cle, { dernierLueLe: '2027-01-01T00:00:00Z' }]].map(([e, c = vec.cle, o]) => dv.dechiffrerDevis(e, c, o)));
      v.vrai('chaque refus a un texte en français, sans la clé ni les clés dérivées', refus.every((r) => !r.ok && typeof r.erreur === 'string' && r.erreur.length > 10
        && ![vec.cle, vec.cle.slice(1), vec.cleEnc, vec.cleMac].some((k) => r.erreur.toLowerCase().includes(k))));
      const reglages = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: JETON_APPLE_FICTIF, cleDevis: vec.cle, boites: [] };
      v.vrai('clé du devis absente de l\'export du planning', !JSON.stringify(sv.exporterPlanning(reglages, null, Date.UTC(2026, 10, 1))).includes(vec.cle));
      const imp = sv.importerPlanning(reglages, null, sv.lireExportPlanning(JSON.stringify({ ...sv.exporterPlanning({ boites: [] }, null, 0), cleDevis: 'ff'.repeat(32) })).donnees);
      v.egal('import d\'un planning : la clé du téléphone gardée, jamais celle du fichier', imp.reglages.cleDevis, vec.cle);
    },
  },
  {
    id: 'PL30',
    titre: 'Devis Eventsoft sur l\'appareil (lot 25e1) : GET /devis par le relais (jeton dans l\'en-tête, 204 = rien encore) ; clé des devis de 64 caractères hexadécimaux, refus sans répéter la saisie ; dernière lecture gardée par presta, gardée après la presta, prestas d\'une boîte en erreur gardées, poste ou devis changé marqué « Modifié » jusqu\'à l\'ouverture de l\'onglet ; fraîcheur (« Devis lus le 27/10 à 8 h », alerte au-delà de 36 h, erreur de chaque boîte) ; poste et devis lié au poste sur la carte de la journée rapprochée, deux candidates à trancher, devis refusé au compte, poste ajouté au texte pour Intermittent',
    etape: '25e1',
    async verifier(v, contexte) {
      const rl = await importerPlanning(v, '../src/planning/relais.js');
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      const af = await importerPlanning(v, '../src/planning/affichage.js');
      if (!rl || !rg || !dv || !af) return;
      const manque = ['lireDevis'].filter((f) => typeof rl[f] !== 'function')
        .concat(['cleDevisValide'].filter((f) => typeof rg[f] !== 'function'))
        .concat(['garderDevis', 'fraicheurDevis', 'choisirPresta', 'devisVu'].filter((f) => typeof dv[f] !== 'function'));
      v.egal('fonctions du lot 25e1 exportées', manque, []);
      if (manque.length) return;

      // Relais.
      const relais = relaisFictif({ devis: 'enveloppe-fictive' });
      const lu = await rl.lireDevis({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relais.fetch });
      const appel = relais.appels[0];
      v.egal('GET /devis : enveloppe rendue, jeton dans l\'en-tête, jamais dans l\'adresse', [lu, appel.url, appel.options.method, appel.options.headers.Authorization, appel.url.includes(JETON_FICTIF)],
        [{ ok: true, enveloppe: 'enveloppe-fictive' }, `${ADRESSE_FICTIVE}/devis`, 'GET', `Bearer ${JETON_FICTIF}`, false]);
      v.egal('204 : rien encore', await rl.lireDevis({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif().fetch }), { ok: true, enveloppe: null });
      const refus = await Promise.all([
        rl.lireDevis({ adresse: ADRESSE_FICTIVE, jeton: 'autre-jeton', fetch: relaisFictif().fetch }),
        rl.lireDevis({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ reseau: true }).fetch }),
        rl.lireDevis({ adresse: ADRESSE_FICTIVE, jeton: JETON_FICTIF, fetch: relaisFictif({ statut: 500 }).fetch }),
      ]);
      v.egal('jeton refusé, relais injoignable, réponse inattendue', refus.map((r) => [r.ok, r.type]), [[false, 'jeton'], [false, 'injoignable'], [false, 'reponse']]);
      v.vrai('aucun texte de refus ne cite l\'adresse ni le jeton', refus.every((r) => r.texte && !r.texte.includes('exemple.test') && !r.texte.includes(JETON_FICTIF)));

      // Clé des devis.
      const cle = 'ab'.repeat(32);
      v.egal('clé de 64 caractères hexadécimaux, en minuscules, espaces de bord retirés', rg.cleDevisValide(`  ${cle.toUpperCase()}\n`), { ok: true, cle });
      const mauvaises = [cle.slice(1), `${cle.slice(1)}g`, '', `${cle} ${cle}`].map(rg.cleDevisValide);
      v.vrai('clé trop courte, hors hexadécimal, vide ou double : refus en français sans la saisie', mauvaises.every((r) => !r.ok && r.erreur.length > 10 && !r.erreur.includes(cle.slice(1, 20))));
      v.egal('réglages vides : clé des devis à saisir ; clé de la garde des devis', [rg.reglagesVides().cleDevis, rg.CLE_DEVIS], [null, 'planning-devis']);

      // Garde.
      const recu1 = Date.UTC(2026, 9, 27, 8, 0);
      const g1 = dv.garderDevis(null, LECTURE_DEVIS, recu1);
      v.egal('première lecture : lueLe, prestas par boîte, boîte B en erreur sans presta', [
        g1.lueLe, g1.recu, Object.keys(g1.boites['boite-a'].prestas).sort(), g1.boites['boite-b'].erreur, Object.keys(g1.boites['boite-b'].prestas), g1.boites['boite-a'].erreur,
      ], ['2026-10-27T07:00:00Z', recu1, ['000000101', '000000102'], 'connexion-refusee', [], null]);
      const salon1 = g1.boites['boite-a'].prestas['000000101'];
      v.egal('presta gardée telle que lue, sans marque à la première lecture', [salon1.nom, salon1.debut, salon1.fin, salon1.postes, salon1.sections, salon1.empreintes, salon1.change],
        [DEVIS_SALON.nom, DEVIS_SALON.debut, DEVIS_SALON.fin, DEVIS_SALON.postes, DEVIS_SALON.sections, DEVIS_SALON.empreintes, null]);
      v.egal('devis refusé au compte : poste seul', [g1.boites['boite-c'].prestas['000000301'].devisNonAutorise, g1.boites['boite-c'].prestas['000000301'].sections], [true, []]);
      const recu2 = Date.UTC(2026, 9, 27, 18, 0);
      const salonChange = { ...DEVIS_SALON, postes: [{ jour: '12/06', poste: 'ASSISTANT MUR LED' }], empreintes: { devis: 'autre-empreinte-devis', personnel: 'autre-empreinte-personnel' } };
      const g2 = dv.garderDevis(g1, {
        version: 1, lueLe: '2026-10-27T17:00:00Z',
        boites: [{ id: 'boite-a', erreur: 'reseau', prestas: [] }, { id: 'boite-b', prestas: [salonChange] }, { id: 'boite-c', prestas: [] }],
      }, recu2);
      v.egal('boîte A en erreur : ses prestas et sa dernière lecture gardées', [Object.keys(g2.boites['boite-a'].prestas).sort(), g2.boites['boite-a'].erreur, g2.boites['boite-a'].lueLe],
        [['000000101', '000000102'], 'reseau', '2026-10-27T07:00:00Z']);
      v.egal('boîte C lue sans sa presta passée : presta gardée (Intermittent plus tard)', [Object.keys(g2.boites['boite-c'].prestas), g2.boites['boite-c'].erreur, g2.boites['boite-c'].lueLe], [['000000301'], null, '2026-10-27T17:00:00Z']);
      v.egal('boîte B lue à nouveau : erreur effacée', [g2.boites['boite-b'].erreur, Object.keys(g2.boites['boite-b'].prestas)], [null, ['000000101']]);
      const g3 = dv.garderDevis(g2, { version: 1, lueLe: '2026-10-28T07:00:00Z', boites: [{ id: 'boite-a', prestas: [salonChange, DEVIS_CONGRES] }] }, recu2 + 3600000);
      const c3 = g3.boites['boite-a'].prestas['000000101'].change;
      v.egal('poste et devis changés : marque avec l\'ancien poste', [c3?.le, c3?.postes, c3?.devis, c3?.anciensPostes], [recu2 + 3600000, true, true, DEVIS_SALON.postes]);
      const g4 = dv.garderDevis(g3, { version: 1, lueLe: '2026-10-28T17:00:00Z', boites: [{ id: 'boite-a', prestas: [salonChange, DEVIS_CONGRES] }] }, recu2 + 7200000);
      v.egal('lecture suivante sans changement : la marque reste', g4.boites['boite-a'].prestas['000000101'].change, c3);
      v.egal('congrès inchangé : aucune marque', g4.boites['boite-a'].prestas['000000102'].change, null);

      // Fraîcheur.
      const reglages = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: null, cleDevis: cle, boites: Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom, affichage: nom, lettre: nom.slice(-1), couleur: '#ff8a5c' })) };
      const f1 = dv.fraicheurDevis(g1, reglages, Date.parse(g1.lueLe) + 36 * 3600000);
      v.egal('fraîcheur : date de lecture, pas d\'alerte à 36 h', [f1.texte, f1.alerte], ['Devis lus le 27/10 à 8 h', null]);
      v.vrai('au-delà de 36 h : alerte (Mac éteint ou envoi raté)', /36 h/.test(dv.fraicheurDevis(g1, reglages, Date.parse(g1.lueLe) + 36 * 3600000 + 60000).alerte ?? ''));
      v.egal('erreur de chaque boîte, avec ce qui est gardé', [dv.fraicheurDevis(g1, reglages, recu1).erreurs, dv.fraicheurDevis(g2, reglages, recu2).erreurs], [
        [{ boite: 'boite-b', texte: 'Boîte B : devis non lus (connexion refusée), aucun devis gardé' }],
        [{ boite: 'boite-a', texte: 'Boîte A : devis non lus (Eventsoft injoignable), devis du 27/10 à 8 h gardés' }],
      ]);
      v.egal('aucune lecture : rien à dire', dv.fraicheurDevis(null, reglages, recu1), { texte: null, alerte: null, erreurs: [] });

      // Cartes.
      const etat = etatFictif();
      const base = baseDevis(contexte);
      const tout = (vue) => [...vue.aVenir, ...vue.passees];
      const carteDe = (vue, boite, date) => tout(vue).find((c) => c.boite === boite && c.date === date && !c.retiree);
      const sans = af.vueListe(etat, reglages, MAINTENANT_FICTIF);
      const avec = af.vueListe(etat, reglages, MAINTENANT_FICTIF, { devis: { garde: g1, base } });
      v.egal('sans devis : cartes et texte Intermittent inchangés', [carteDe(sans, 'boite-a', '2026-11-16')?.devis ?? null, carteDe(sans, 'boite-a', '2026-11-16')?.copie === carteDe(avec, 'boite-a', '2026-11-16')?.copie.split('\nPoste : ')[0]], [null, true]);
      const congres = carteDe(avec, 'boite-a', '2026-11-16')?.devis;
      v.egal('congrès : postes du jour, matériel du poste ouvert, reste replié', [
        congres?.postes, congres?.vue.titre, congres?.vue.tonMateriel.map((s) => s.titre), congres?.vue.reste.length, congres?.vue.toutReplie, congres?.nonAutorise, congres?.aChoisir,
      ], ['Assistant Mur Led, Road 4h et TECHNICIEN VIDEO SV', 'Ton matériel : mur LED, vidéo', ['ECRANS LATERAUX 2x L=2m H=1m', 'ECRAN CENTRAL L=4m H=2,5m', 'REGIE VIDEO'], 0, false, false, null]);
      v.vrai('poste ajouté au texte pour Intermittent, en dernière ligne', carteDe(avec, 'boite-a', '2026-11-16')?.copie.includes('\nPoste : Assistant Mur Led, Road 4h et TECHNICIEN VIDEO SV'));
      const salon = carteDe(avec, 'boite-a', '2026-06-12')?.devis;
      v.egal('salon : un poste le 12/06 (casse différente comptée une fois), processeur de la régie dans le matériel mur LED, mélangeur dans le reste', [
        salon?.postes, salon?.vue.tonMateriel.map((s) => [s.titre, s.lignes.map((l) => l.ref)]), salon?.vue.reste.find((s) => s.titre === 'REGIE VIDEO')?.lignes.map((l) => l.ref),
      ], ['TECHNICIEN MUR LED', [['ECRAN LED FOND DE SCENE L=4m H=3m', ['URMIII04', 'BUMP-FICT']], ['REGIE VIDEO', ['MCTRL660']]], ['MEL-FICT']]);
      v.egal('lignes prêtes à afficher : quantité lue sans « .0 »', salon?.vue.tonMateriel[0].lignes.map((l) => l.quantiteTexte), ['26', '4']);
      const expo = carteDe(avec, 'boite-c', '2026-10-20')?.devis;
      v.egal('devis refusé au compte : poste seul, sans section', [expo?.postes, expo?.nonAutorise, expo?.vue], ['ASSISTANT LUMIERE', true, null]);
      v.egal('boîte en erreur sans devis gardé : rien sur ses cartes', tout(avec).filter((c) => c.boite === 'boite-b').map((c) => c.devis ?? null).filter(Boolean), []);
      v.egal('journée sans devis rapproché : rien', carteDe(avec, 'boite-a', '2026-07-08')?.devis ?? null, null);
      const gModif = dv.garderDevis(g1, { version: 1, lueLe: '2026-10-27T17:00:00Z', boites: [{ id: 'boite-a', prestas: [salonChange] }] }, recu2);
      const modifiee = (g) => carteDe(af.vueListe(etat, reglages, MAINTENANT_FICTIF, { devis: { garde: g, base } }), 'boite-a', '2026-06-12')?.devis;
      v.egal('poste changé : « Modifié » avec l\'ancien poste, jusqu\'à l\'ouverture de l\'onglet', [
        modifiee(gModif)?.posteModifie, modifiee(gModif)?.ancienPoste, modifiee(gModif)?.devisModifie, modifiee(dv.devisVu(gModif, recu2 + 1))?.posteModifie, modifiee(dv.devisVu(gModif, recu2 + 1))?.devisModifie,
      ], [true, 'TECHNICIEN MUR LED', true, false, false]);

      // Deux candidates.
      const deux = jr.appliquerLecture(undefined, lire(calendrier({ calname: 'EventSoft / Boîte A', evenements: [
        { uid: 'k1@fictif', debut: '20261116T080000Z', fin: '20261116T170000Z', summary: 'Congrès fictif / Salle 1 / Installation', categories: 'Installation' },
        { uid: 'k2@fictif', debut: '20261116T080000Z', fin: '20261116T170000Z', summary: 'Congrès fictif / Salle 2 / Installation', categories: 'Installation' },
      ] }), 'Boîte A'), MAINTENANT_FICTIF, { nom: 'Boîte A' }).etat;
      const etatDeux = { boites: { 'boite-a': deux } };
      const cartesDeux = (g) => af.vueListe(etatDeux, reglages, MAINTENANT_FICTIF, { devis: { garde: g, base } }).aVenir;
      v.egal('deux candidates : question sur chaque carte, aucun devis affiché', cartesDeux(g1).map((c) => [c.presta, c.devis?.aChoisir ?? null, c.devis?.vue ?? null]), [
        ['Congrès fictif / Salle 1', { boite: 'boite-a', idEventsoft: '000000102', nomDevis: 'Congrès fictif' }, null],
        ['Congrès fictif / Salle 2', { boite: 'boite-a', idEventsoft: '000000102', nomDevis: 'Congrès fictif' }, null],
      ]);
      const gChoix = dv.choisirPresta(g1, 'boite-a', '000000102', 'Congrès fictif / Salle 2');
      v.egal('choix gardé : le devis sur la presta choisie seulement', cartesDeux(gChoix).map((c) => [c.presta, Boolean(c.devis?.vue), c.devis?.aChoisir ?? null]),
        [['Congrès fictif / Salle 1', false, null], ['Congrès fictif / Salle 2', true, null]]);
      v.egal('garde d\'origine non modifiée par le choix', g1.choix?.['boite-a|000000102'] ?? null, null);
    },
  },
  {
    id: 'PL31',
    titre: 'Devis Eventsoft et sauvegarde (lot 25e1) : le poste suit l\'export du planning (liste blanche : nom, dates et postes de chaque presta), jamais les sections du devis, les empreintes ni la clé ; import : postes ajoutés aux prestas absentes, celles du téléphone et sa clé gardées ; ancien export sans postes lu ; clé de la garde des devis écrite seulement dans src/planning/reglages.js, absente de l\'export de la base, d\'une presta, de « Tout copier » et de « Repartir »',
    etape: '25e1',
    async verifier(v, contexte) {
      const sv = await importerPlanning(v, '../src/planning/sauvegarde.js');
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!sv || !dv || typeof dv.garderDevis !== 'function') {
        v.vrai('garderDevis exportée par src/planning/devis.js', false);
        return;
      }
      const cle = 'cd'.repeat(32);
      const reglages = { relais: ADRESSE_FICTIVE, jeton: JETON_FICTIF, jetonApple: JETON_APPLE_FICTIF, cleDevis: cle, boites: [] };
      const garde = dv.garderDevis(null, LECTURE_DEVIS, Date.UTC(2026, 9, 27, 8));
      const etat = etatFictif();
      const exporte = sv.exporterPlanning(reglages, etat, MAINTENANT_FICTIF, garde);
      v.egal('postes exportés par boîte et presta : nom, dates, postes', exporte.postes?.['boite-a']?.['000000101'], { nom: DEVIS_SALON.nom, debut: DEVIS_SALON.debut, fin: DEVIS_SALON.fin, postes: DEVIS_SALON.postes });
      v.egal('poste d\'un devis refusé au compte exporté aussi', exporte.postes?.['boite-c']?.['000000301']?.postes, DEVIS_EXPO.postes);
      const texte = JSON.stringify(exporte);
      v.egal('ni sections, ni désignations, ni empreintes, ni clé, ni adresse ni jetons dans l\'export', ['URMIII04', 'ECRAN CENTRAL', DESIGNATIONS_FICTIVES.urm48, 'empreinte-devis-fictive', cle, 'exemple.test', JETON_FICTIF].filter((x) => texte.includes(x)), []);
      v.egal('export sans garde : postes vides', sv.exporterPlanning(reglages, etat, MAINTENANT_FICTIF).postes, {});
      const relu = sv.lireExportPlanning(JSON.stringify({ ...exporte, postes: { ...exporte.postes, 'boite-x': { 1: { nom: 'X', debut: '2026-01-01', fin: '2026-01-01', postes: [{ poste: 'P'.repeat(200), sections: [1] }], sections: [{ titre: 'T' }] } }, 'MAUVAIS ID': {} } }));
      v.egal('relu en liste blanche : champs inconnus retirés, poste coupé à 80, identifiant de boîte contrôlé', [relu.ok, relu.donnees.postes['boite-x']['1'], relu.donnees.postes['MAUVAIS ID']],
        [true, { nom: 'X', debut: '2026-01-01', fin: '2026-01-01', postes: [{ poste: 'P'.repeat(80) }] }, undefined]);
      const ancien = sv.lireExportPlanning(JSON.stringify({ ...exporte, postes: undefined }));
      v.egal('ancien export sans postes : lu, postes vides', [ancien.ok, ancien.donnees?.postes], [true, {}]);
      const local = dv.garderDevis(null, { version: 1, lueLe: '2026-10-29T07:00:00Z', boites: [{ id: 'boite-a', prestas: [{ ...DEVIS_SALON, postes: [{ poste: 'POSTE DU TELEPHONE' }] }] }] }, Date.UTC(2026, 9, 29, 8));
      const imp = sv.importerPlanning({ ...reglages, cleDevis: 'ef'.repeat(32) }, null, sv.lireExportPlanning(texte).donnees, local);
      v.egal('import : presta du téléphone gardée telle quelle, prestas absentes ajoutées avec leurs postes seuls, clé du téléphone gardée', [
        imp.devis.boites['boite-a'].prestas['000000101'].postes, imp.devis.boites['boite-a'].prestas['000000101'].sections.length > 0,
        imp.devis.boites['boite-a'].prestas['000000102'].postes, imp.devis.boites['boite-a'].prestas['000000102'].sections, imp.devis.boites['boite-c'].prestas['000000301'].postes,
        imp.devis.lueLe, imp.reglages.cleDevis,
      ], [[{ poste: 'POSTE DU TELEPHONE' }], true, DEVIS_CONGRES.postes, [], DEVIS_EXPO.postes, '2026-10-29T07:00:00Z', 'ef'.repeat(32)]);
      const sansGarde = sv.importerPlanning(reglages, null, sv.lireExportPlanning(texte).donnees);
      v.egal('import sans garde sur le téléphone : postes repris, aucune date de lecture (le prochain envoi est accepté)', [sansGarde.devis?.boites['boite-a'].prestas['000000102'].postes, sansGarde.devis?.lueLe], [DEVIS_CONGRES.postes, null]);

      const f = contexte?.fichiers ?? {};
      const js = Object.entries(f).filter(([chemin, t]) => chemin.endsWith('.js') && typeof t === 'string');
      v.egal('clé « planning-devis » écrite en clair dans un seul module', js.filter(([, t]) => /planning-devis/.test(t)).map(([c]) => c), ['src/planning/reglages.js']);
      v.egal('export de la base, d\'une presta, copie, réglages par défaut, écran Base : ni garde des devis ni clé',
        ['src/fiches.js', 'src/prestas.js', 'src/prestas-appareil.js', 'src/copie.js', 'src/resumes.js', 'src/configuration.js', 'src/ecran-base.js', 'src/app.js'].filter((c) => typeof f[c] !== 'string' || /planning-devis|cleDevis|CLE_DEVIS/.test(f[c])), []);
    },
  },
  {
    id: 'PL32',
    titre: 'Devis Eventsoft (lot 25e2) : titres sans « L= » (F12) : « [6 x Totems en T 4m ] » (6 murs, hauteur de 4 m à confirmer, largeur absente) et « Installation de 6 totem » (6 murs sans dimensions) ; murs sans forme proposés avec leur dalle, forme à choisir dans l\'onglet Mur ; noms sans crochets ni « Installation de » ; titres avec « L= » lus comme avant',
    etape: '25e2',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      const base = baseDevis(contexte);
      const t = (largeurM, hauteurM, multiplicateur = 1, extra = {}) => ({ largeurM, hauteurM, multiplicateur, ...extra });
      const confirmer = { hauteurAConfirmer: true };
      v.egal('titres sans « L= »', ['[6 x Totems en T 4m ]', 'Installation de 6 totem', 'Installation de 6 totems LED', 'ECRAN LED 3m', '2 ECRANS 250cm', 'Installation de 6 jours'].map(dv.lireTitre),
        [t(null, 4, 6, confirmer), t(null, null, 6), t(null, null, 6), t(null, 3, 1, confirmer), t(null, 2.5, 2, confirmer), t(null, null)]);
      v.egal('titres avec « L= » ou « H= » : une dimension seule ignorée', ['ECRAN 3 m L=4m H=2m', 'ECRAN L=4m'].map(dv.lireTitre), [t(4, 2), t(4, null)]);
      const dalle = 'unilumin-urmiii04-500x1000';
      const section = (titre, quantite) => dv.classerDevis([{ titre, lignes: [{ ref: 'URMIII04', designation: DESIGNATIONS_FICTIVES.urm48, quantite, composant: false }] }], base)[0];
      const noms = (nom) => [1, 2, 3, 4, 5, 6].map((i) => `${nom} ${i}`);
      const totems = dv.configurationProposee(section('[6 x Totems en T 4m ]', '24.0'), base);
      v.egal('totems : forme à choisir, six murs sans forme avec leur dalle, hauteur à confirmer', [
        totems.murs, totems.formeAChoisir, totems.multiplicateur, totems.hauteurM, totems.mursSansForme?.map((m) => m.nom), totems.mursSansForme?.[0]?.formulaires, totems.alertes,
      ], [[], true, 6, 4, noms('Totems en T'), { 'form-mur': { dalle, demi: false } }, ['Hauteur lue dans le titre : 4 m, à confirmer ; largeur absente : 24 dalles, forme à choisir.']]);
      const install = dv.configurationProposee(section('Installation de 6 totem', '25.0'), base);
      v.egal('« Installation de 6 totem » : « Totem 1 » à « Totem 6 », quantité non multiple signalée', [install.mursSansForme?.map((m) => m.nom), install.alertes],
        [noms('Totem'), ['25 dalles ne se partagent pas en 6 murs égaux.', 'Titre sans dimensions : 25 dalles, forme à choisir.']]);
      const sansDim = dv.configurationProposee(section('ECRANS LATERAUX', '8.0'), base);
      v.egal('titre sans dimensions ni nombre : un mur sans forme', [sansDim.murs, sansDim.mursSansForme?.map((m) => m.nom), sansDim.alertes], [[], ['ECRANS LATERAUX'], ['Titre sans dimensions : 8 dalles, forme à choisir.']]);
      v.egal('mur avec ses dimensions : aucun mur sans forme', dv.configurationProposee(section('ECRAN L=4m H=2m', '16.0'), base).mursSansForme, []);
    },
  },
  {
    id: 'PL33',
    titre: 'Devis Eventsoft (lot 25e2) : « Préparer les murs » : presta créée avec les murs proposés à la place du « Mur 1 » vide (nom coupé à 60, lieu à 80, dates du devis, saisies de l\'onglet Mur, parc de la boîte), lien au devis, `lienDevis` (boîte, presta Eventsoft, empreinte) ; presta liée complétée sans doublon ; devis modifié depuis : écart signalé, murs non touchés, « C\'est vu » ; lien ni dupliqué ni exporté ; aucun mur : rien de créé',
    etape: '25e2',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      const pr = await importerPlanning(v, '../src/prestas.js');
      const fi = await importerPlanning(v, '../src/fiches.js');
      if (!dv || !pr || !fi) return;
      if (typeof pr.preparerMurs !== 'function') {
        v.vrai('preparerMurs exportée par src/prestas.js', false);
        return;
      }
      const base = baseDevis(contexte);
      const opts = { maintenant: new Date(Date.UTC(2026, 9, 30, 9)) };
      const depart = pr.migrer({}, opts);
      const murs = dv.classerDevis(DEVIS_CONGRES.sections, base).map((s) => dv.configurationProposee(s, base)).filter(Boolean).flatMap((p) => [...p.murs, ...p.mursSansForme]);
      const nomsProposes = murs.map((m) => m.nom);
      const lien = { boite: 'boite-a', idEventsoft: DEVIS_CONGRES.idEventsoft, empreinte: DEVIS_CONGRES.empreintes.devis };
      const e1 = pr.preparerMurs(depart, { nom: `${DEVIS_CONGRES.nom} ${'N'.repeat(80)}`, debut: DEVIS_CONGRES.debut, fin: DEVIS_CONGRES.fin, lieu: 'L'.repeat(100), murs, lien, parc: 'parc-test' }, opts);
      const p1 = pr.prestaOuverte(e1);
      v.egal('presta créée : nom à 60, lieu à 80, dates, murs du devis sans « Mur 1 », lien', [
        e1.index.prestas.length, p1.nom.length, p1.nom.startsWith('Congrès fictif'), p1.lieu.length, p1.debut, p1.fin, p1.murs.map((m) => m.nom), p1.lienDevis,
      ], [2, 60, true, 80, '2026-11-16', '2026-11-16', ['ECRANS LATERAUX 1', 'ECRANS LATERAUX 2', 'ECRAN CENTRAL'], { ...lien, murs: nomsProposes }]);
      const m1 = e1.murs[p1.murs[0].id];
      v.egal('premier mur ouvert, parc de la boîte, saisies de l\'onglet Mur', [e1.index.ouverte.mur, m1.parc, m1.configuration], [p1.murs[0].id, 'parc-test',
        { version: 2, sourceModifiee: false, formulaires: { 'form-mur': { mode: 'taille', largeurM: '2', hauteurM: '1', dalle: 'unilumin-urmiii04-500x1000', demi: false } } }]);
      v.egal('mur avec demi-dalles : « demi-dalles disponibles » coché', e1.murs[p1.murs[2].id].configuration.formulaires['form-mur'].demi, true);
      v.egal('état du lien : presta, sans écart, rien à compléter', pr.etatLienDevis(e1, lien, nomsProposes), { prestaId: p1.id, nom: p1.nom, ecart: false, manquants: [], murOuvrir: p1.murs[0].id });
      v.egal('aucune presta liée : null', pr.etatLienDevis(depart, lien, nomsProposes), null);
      v.vrai('second appui : rien de changé, aucun doublon', pr.preparerMurs(e1, { nom: 'X', murs, lien }, opts) === e1);

      const lien2 = { ...lien, empreinte: 'empreinte-devis-fictive-3' };
      const murs2 = [...murs, { nom: 'ECRAN SCENE', demi: null, formulaires: { 'form-mur': { mode: 'taille', largeurM: '3', hauteurM: '2', dalle: 'unilumin-urmiii04-500x1000', demi: false } } }];
      const e2 = pr.renommerMur(pr.ajouterMur(e1, p1.id, { nom: 'ECRAN SCENE' }, opts), p1.id, p1.murs[0].id, 'Latéral jardin', opts);
      const etat2 = pr.etatLienDevis(e2, lien2, murs2.map((m) => m.nom));
      v.egal('devis modifié depuis : écart, mur nouveau à compléter', [etat2.ecart, etat2.manquants], [true, ['ECRAN SCENE']]);
      let refus = null;
      try {
        pr.preparerMurs(e2, { nom: 'X', murs: murs2, lien: lien2 }, opts);
      } catch (erreur) {
        refus = erreur.message;
      }
      v.egal('écart : murs non touchés, refus expliqué', refus, 'Devis modifié depuis la préparation des murs : vérifie tes murs, rien n\'a été changé.');
      const e4 = pr.preparerMurs(pr.lienDevisVu(e2, p1.id, lien2.empreinte, opts), { nom: 'X', murs: murs2, lien: lien2 }, opts);
      const p4 = pr.prestaOuverte(e4);
      v.egal('« C\'est vu » puis compléter : seul le mur nouveau, sous un nom libre ; murs renommés gardés', [p4.id, p4.nom, p4.murs.map((m) => m.nom), p4.lienDevis.murs, e4.index.ouverte.mur === p4.murs.at(-1).id],
        [p1.id, p1.nom, ['Latéral jardin', 'ECRANS LATERAUX 2', 'ECRAN CENTRAL', 'ECRAN SCENE', 'ECRAN SCENE 2'], [...nomsProposes, 'ECRAN SCENE'], true]);
      v.egal('plus rien à compléter', pr.etatLienDevis(e4, lien2, murs2.map((m) => m.nom)).manquants, []);

      v.egal('presta dupliquée : sans lien', 'lienDevis' in pr.prestaOuverte(pr.dupliquerPresta(e4, p1.id, opts)), false);
      const exporte = JSON.stringify(pr.exporterPresta(e4, p1.id, fi.baseVide(), opts).donnees);
      v.vrai('presta exportée : sans lien', !exporte.includes('"lienDevis"') && !exporte.includes(DEVIS_CONGRES.idEventsoft) && !exporte.includes(lien2.empreinte));
      let vide = null;
      try {
        pr.preparerMurs(depart, { nom: 'X', murs: [], lien }, opts);
      } catch (erreur) {
        vide = erreur.message;
      }
      v.egal('aucun mur : rien de créé', vide, 'Aucun mur à préparer dans ce devis.');
      const autre = pr.prestaOuverte(pr.preparerMurs(depart, { nom: '  ', debut: '2026-13-01', fin: '2026-06-01', murs: [murs[2], murs[2]], lien: { ...lien, idEventsoft: '9' } }, opts));
      v.egal('nom vide, date illisible, deux murs du même nom : nom par défaut, sans dates, noms rendus uniques', [autre.nom, autre.debut, autre.fin, autre.murs.map((m) => m.nom)],
        ['Presta du devis', null, null, ['ECRAN CENTRAL', 'ECRAN CENTRAL 2']]);
    },
  },
  {
    id: 'PL34',
    titre: 'Devis Eventsoft (lot 25e2) : murs proposés pour toute la presta et processeurs comparés au niveau de la presta dans le parc de la boîte (ses processeurs, ses références de dalles) ; alertes des sections avec leur titre ; murs sans forme hors du conseil ; devis sans mur LED ni processeur : rien',
    etape: '25e2',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      if (!dv) return;
      if (typeof dv.mursDuDevis !== 'function') {
        v.vrai('mursDuDevis exportée par src/planning/devis.js', false);
        return;
      }
      const base = baseDevis(contexte);
      const parc = { id: 'parc-test', nom: 'Parc test', membres: [{ type: 'processeur', id: 'novastar-mctrl4k' }] };
      const congres = dv.mursDuDevis(DEVIS_CONGRES, base, { parc });
      v.egal('congrès : trois murs, résumé, processeurs du parc', [congres.murs.map((m) => m.nom), congres.resume, congres.processeurs?.texte, congres.processeurs?.alerte],
        [['ECRANS LATERAUX 1', 'ECRANS LATERAUX 2', 'ECRAN CENTRAL'], ['ECRANS LATERAUX 1 : 2 × 1 m', 'ECRANS LATERAUX 2 : 2 × 1 m', 'ECRAN CENTRAL : 4 × 2,5 m'],
          'Le devis prévoit 2 × MCTRL4K ; l\'appli conseille 3 × MCTRL4K.', true]);
      const salon = dv.mursDuDevis(DEVIS_SALON, base, { parc: { ...parc, membres: [{ type: 'processeur', id: 'novastar-mctrl660' }] } });
      v.egal('salon : d\'accord, alerte de la section reprise avec son titre', [salon.processeurs?.texte, salon.processeurs?.alerte, salon.alertes],
        ['Le devis prévoit 1 × MCTRL660 ; l\'appli en conseille 1.', false, ['ECRAN LED FOND DE SCENE L=4m H=3m : Le devis prévoit 26 dalles ; 4 × 3 m en demande 24 (spares possibles).']]);
      const tous = dv.mursDuDevis(DEVIS_CONGRES, base, {});
      v.egal('sans parc (ou parc sans processeur) : toute la base', [tous.processeurs.devis, tous.processeurs.conseil.length > 0, dv.mursDuDevis(DEVIS_CONGRES, base, { parc: { ...parc, membres: [] } }).processeurs.texte === tous.processeurs.texte],
        [[{ id: 'novastar-mctrl4k', modele: 'MCTRL4K', nombre: 2 }], true, true]);
      const ligne = (ref, designation, quantite) => ({ ref, designation, quantite, composant: false });
      const totems = dv.mursDuDevis({ ...DEVIS_CONGRES, sections: [{ titre: '[6 x Totems en T 4m ]', lignes: [ligne('URMIII04', DESIGNATIONS_FICTIVES.urm48, '24.0')] }] }, base, { parc });
      v.egal('totems : six murs sans forme, hors du conseil', [totems.murs.length, totems.resume[0], totems.processeurs.sansConseil.length, totems.processeurs.texte],
        [6, 'Totems en T 1 : forme à choisir', 6, 'Le devis ne prévoit aucun processeur ; l\'appli ne conseille rien tant qu\'une dalle ou une forme reste à choisir.']);
      const amb = { ...DEVIS_CONGRES, sections: [{ titre: 'ECRAN L=4m H=2m', lignes: [ligne('UPADIV2.6', DESIGNATIONS_FICTIVES.upad26, '32.0')] }] };
      const sansRef = dv.mursDuDevis(amb, base, { parc });
      const avecRef = dv.mursDuDevis(amb, base, { parc: { ...parc, references: { 'UPADIV2.6': 'unilumin-upad-iv-c' } } });
      v.egal('dalle à choisir, puis retenue par la référence du parc', [sansRef.resume, sansRef.alertes, avecRef.murs[0].formulaires['form-mur'].dalle, avecRef.alertes],
        [['ECRAN : 4 × 2 m, dalle à choisir'], ['ECRAN L=4m H=2m : Dalle à choisir parmi 5 fiches : choisis-la ci-dessous.'], 'unilumin-upad-iv-c', []]);
      v.egal('devis refusé au compte, devis sans mur LED ni processeur : rien', [dv.mursDuDevis(DEVIS_EXPO, base, { parc }), dv.mursDuDevis({ ...DEVIS_SALON, sections: DEVIS_SALON.sections.slice(2) }, base, {})], [null, null]);
    },
  },
  {
    id: 'PL35',
    titre: 'Planning (lot 25e2) : parc de chaque boîte (réglages du planning, gardé à la lecture des boîtes, dans l\'export du planning, vidé si le parc est supprimé) ; « Ajouter au parc » : dalles, demi-dalles et processeurs du devis absents du parc, dalle à choisir retenue par sa référence, jamais « Nombre dans le parc » ; fiche retirée citée par une référence signalée et retirée',
    etape: '25e2',
    async verifier(v, contexte) {
      const rg = await importerPlanning(v, '../src/planning/reglages.js');
      const sv = await importerPlanning(v, '../src/planning/sauvegarde.js');
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      const fi = await importerPlanning(v, '../src/fiches.js');
      if (!rg || !sv || !dv || !fi) return;
      if (typeof rg.reglerParcBoite !== 'function' || typeof dv.ajoutsParc !== 'function' || typeof fi.ajouterAuParc !== 'function') {
        v.vrai('reglerParcBoite, ajoutsParc et ajouterAuParc exportées', false);
        return;
      }
      const boite = { id: 'boite-a', nom: 'Boîte A', affichage: 'A', couleur: '#ff8a5c', lettre: 'A' };
      const r1 = rg.reglerParcBoite({ ...rg.reglagesVides(), boites: [boite] }, 'boite-a', 'parc-test');
      v.egal('parc réglé pour la boîte, lu seulement s\'il existe', [r1.boites[0].parc, rg.parcBoite(r1, 'boite-a', ['parc-test']), rg.parcBoite(r1, 'boite-a', []), rg.parcBoite(r1, 'boite-z', ['parc-test'])],
        ['parc-test', 'parc-test', null, null]);
      v.egal('« Aucun » : réglage retiré', 'parc' in rg.reglerParcBoite(r1, 'boite-a', null).boites[0], false);
      v.egal('lecture des boîtes sur le relais : parc gardé', rg.fusionnerBoites(r1.boites, [{ id: 'boite-a', nom: 'Boîte A' }])[0].parc, 'parc-test');
      v.egal('parc supprimé : réglage vidé ; rien à vider : mêmes réglages', ['parc' in rg.nettoyerParcsBoites(r1, ['autre']).boites[0], rg.nettoyerParcsBoites(r1, ['parc-test']) === r1], [false, true]);
      const exporte = sv.exporterPlanning(r1, etatFictif(), MAINTENANT_FICTIF);
      const relu = sv.lireExportPlanning(JSON.stringify({ ...exporte, boites: [...exporte.boites, { ...boite, id: 'boite-x', parc: 'Parc illisible !' }] }));
      v.egal('export du planning : parc de la boîte, identifiant contrôlé à la relecture', [exporte.boites[0].parc, relu.donnees.boites[0].parc, 'parc' in relu.donnees.boites[1]], ['parc-test', 'parc-test', false]);

      const base = baseDevis(contexte);
      const parcVide = { id: 'parc-test', nom: 'Parc test', membres: [] };
      const a1 = dv.ajoutsParc(DEVIS_CONGRES, base, parcVide);
      v.egal('congrès, parc vide : dalle, demi-dalle et processeur proposés', [a1.dalles.map((d) => d.id), a1.processeurs.map((p) => p.id), a1.aChoisir],
        [['unilumin-urmiii04-500x1000', 'unilumin-urmiii04-500x500'], ['novastar-mctrl4k'], []]);
      const plein = { ...parcVide, membres: [...a1.dalles.map((d) => ({ type: 'dalle', id: d.id })), { type: 'processeur', id: 'novastar-mctrl4k' }] };
      v.egal('parc qui a tout : rien à ajouter', dv.ajoutsParc(DEVIS_CONGRES, base, plein), null);
      const amb = { ...DEVIS_CONGRES, sections: [{ titre: 'ECRAN L=4m H=2m', lignes: [{ ref: 'UPADIV2.6', designation: DESIGNATIONS_FICTIVES.upad26, quantite: '32.0', composant: false }] }] };
      const a2 = dv.ajoutsParc(amb, base, parcVide);
      v.egal('dalle à choisir : ses 5 fiches', [a2.dalles, a2.aChoisir.map((c) => [c.ref, c.candidats.length])], [[], [['UPADIV2.6', 5]]]);
      const a3 = dv.ajoutsParc(amb, base, { ...parcVide, references: { 'UPADIV2.6': 'unilumin-upad-iv-c' } });
      v.egal('référence du parc : la fiche retenue proposée', [a3.dalles.map((d) => d.id), a3.aChoisir], [['unilumin-upad-iv-c'], []]);

      const b1 = fi.ajouterAuParc({ parcs: [{ ...parcVide, quantites: { 'novastar-mctrl4k': 2 } }] }, 'parc-test',
        { dalles: ['unilumin-urmiii04-500x1000'], processeurs: ['novastar-mctrl4k'], references: { 'UPADIV2.6': 'unilumin-upad-iv-c' } });
      v.egal('ajouté : membres, référence retenue (sa fiche entre au parc), nombre dans le parc intact', [b1.parcs[0].membres, b1.parcs[0].references, b1.parcs[0].quantites], [
        [{ type: 'dalle', id: 'unilumin-urmiii04-500x1000' }, { type: 'processeur', id: 'novastar-mctrl4k' }, { type: 'dalle', id: 'unilumin-upad-iv-c' }],
        { 'UPADIV2.6': 'unilumin-upad-iv-c' }, { 'novastar-mctrl4k': 2 }]);
      v.egal('second ajout : aucun doublon', fi.ajouterAuParc(b1, 'parc-test', { dalles: ['unilumin-urmiii04-500x1000'] }).parcs[0].membres.length, 3);
      v.egal('jamais de nombre dans le parc', 'quantites' in fi.ajouterAuParc({ parcs: [parcVide] }, 'parc-test', { processeurs: ['novastar-mctrl4k'], quantites: { 'novastar-mctrl4k': 3 } }).parcs[0], false);

      const depart = { dalles: contexte.dalles, processeurs: contexte.processeurs, regies: contexte.regies };
      let ancienne = fi.creerParc(fi.baseVide(), 'Parc test');
      ancienne = { ...ancienne, parcs: [{ ...ancienne.parcs[0], references: { 'OLD-REF': 'dalle-disparue', 'URMIII04': 'unilumin-urmiii04-500x1000' } }] };
      const pid = ancienne.parcs[0].id;
      v.egal('fiche retirée citée par une référence : signalée', fi.fichesRetirees(ancienne, depart), [{ parcId: pid, parcNom: 'Parc test', type: 'dalle', id: 'dalle-disparue', reglage: false, lots: 0 }]);
      v.egal('retirée du parc : sa référence aussi', fi.retirerFicheRetiree(ancienne, pid, 'dalle', 'dalle-disparue').parcs[0].references, { 'URMIII04': 'unilumin-urmiii04-500x1000' });
    },
  },
  {
    id: 'PL36',
    titre: 'Devis Eventsoft (lot 25e3, devis réel) : lignes « * » (châssis, tiles) jamais lues comme des dalles ni des processeurs ; noms des murs sans « x » entre les dimensions ; processeur du devis repris dans Data pour chaque mur (celui de sa section, sinon le seul modèle du devis) ; dalle à choisir listée une fois par référence, murs prêts seulement quand chaque dalle est choisie ; « Préparer les murs » refuse un mur sans dalle',
    etape: '25e3',
    async verifier(v, contexte) {
      const dv = await importerPlanning(v, '../src/planning/devis.js');
      const pr = await importerPlanning(v, '../src/prestas.js');
      if (!dv || !pr) return;
      const base = baseDevis(contexte);
      const ligne = (ref, designation, quantite, composant = false) => ({ ref, designation, quantite, composant });
      const chassis = ligne('*UPADIV2.6FRAME', 'Châssis UNILUMIN 500 x 500mm', '64.0', true);
      const tile = ligne('*UPADIV2.6TILE', 'Tile UNILUMIN UPADVI2.6 96 x 96 pixels', '64.0', true);
      const mctrl = (n) => ligne('MCTRL4K', 'Processeur mur led Input DVI-D & HDMI 4K 16 sorties Ethernet / 4 opt ports MCTRL4K', n);
      const dalle = (n) => ligne('UPADIV2.6', DESIGNATIONS_FICTIVES.upad26, n);
      const reel = { ...DEVIS_CONGRES, sections: [
        { titre: 'Mur de led central L=4m x Ht=4m', lignes: [dalle('64.0'), chassis, mctrl('1.0')] },
        { titre: '4x Totem Led L=2m x Ht=4m', lignes: [dalle('128.0'), chassis, mctrl('2.0')] },
        { titre: 'Contre-marche L=8m x Ht=0.5m', lignes: [dalle('16.0'), chassis, tile] },
      ] };
      const classe = dv.classerDevis(reel.sections, base);
      v.egal('châssis et tiles « * » : ni dalle ni processeur', classe[2].lignes.slice(1).map((l) => [l.dalle, l.processeur]), [[null, null], [null, null]]);
      const parc = { id: 'parc-test', nom: 'Parc test', membres: [], references: { 'UPADIV2.6': 'unilumin-upad-iv-2-6' } };
      const m = dv.mursDuDevis(reel, base, { parc });
      v.egal('noms sans « x », aucune fausse alerte « Plusieurs dalles »', [m.murs.map((x) => x.nom), m.alertes.filter((a) => /Plusieurs dalles/.test(a))],
        [['Mur de led central', 'Totem Led 1', 'Totem Led 2', 'Totem Led 3', 'Totem Led 4', 'Contre-marche'], []]);
      v.egal('processeur du devis dans Data : celui de la section, sinon le seul modèle du devis', m.murs.map((x) => x.formulaires['form-data']),
        Array(6).fill({ famille: 'novastar', processeur: 'novastar-mctrl4k' }));
      v.egal('dalle retenue par le parc : murs prêts', [m.pret, m.aChoisir, m.murs[0].formulaires['form-mur'].dalle], [true, [], 'unilumin-upad-iv-2-6']);
      const deux = dv.mursDuDevis({ ...reel, sections: [...reel.sections, { titre: 'REGIE VIDEO', lignes: [ligne('MCTRL660', 'Processeur NOVASTAR MCTRL660', '1.0')] }] }, base, { parc });
      v.egal('deux modèles dans le devis : mur sans processeur dans sa section laissé au conseil', [deux.murs[0].formulaires['form-data']?.processeur, deux.murs[5].formulaires['form-data']], ['novastar-mctrl4k', undefined]);
      const sans = dv.mursDuDevis(reel, base, { parc: { ...parc, references: {} } });
      v.egal('dalle à choisir : une fois par référence, murs pas prêts, alerte', [sans.pret, sans.aChoisir.map((a) => [a.ref, a.candidats.length]), sans.alertes[0]],
        [false, [['UPADIV2.6', 5]], 'Mur de led central L=4m x Ht=4m : Dalle à choisir parmi 5 fiches : choisis-la ci-dessous.']);
      let refus = null;
      try {
        pr.preparerMurs(pr.migrer({}), { nom: 'X', murs: sans.murs, lien: { boite: 'boite-a', idEventsoft: '1', empreinte: 'e' } });
      } catch (erreur) {
        refus = erreur.message;
      }
      v.egal('« Préparer les murs » sans dalle : refus, rien de créé', refus, 'Choisis la dalle de chaque mur avant de préparer les murs.');
    },
  },
];
