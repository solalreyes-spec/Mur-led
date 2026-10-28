// Série PL (étape 23, lot 23a) : lecture des plannings iCal d'Eventsoft et journées de travail, sur les plannings
// inventés de tests/planning-fictif.js. Règles : spec de l'étape 23, § 6.

import * as ics from '../src/planning/ics.js';
import * as jr from '../src/planning/journees.js';
import {
  MAINTENANT_FICTIF, calendrier, EVENEMENTS_A, EVENEMENTS_B, EVENEMENTS_C,
  PLANNING_A, PLANNING_B, PLANNING_C, NOMS_FICTIFS, ADRESSE_FICTIVE, JETON_FICTIF, JETON_APPLE_FICTIF, relaisFictif,
} from './planning-fictif.js';

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
];
