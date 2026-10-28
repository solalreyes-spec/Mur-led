// Plannings iCal inventés pour la série PL (étape 23) : trois boîtes fictives (« Boîte A », « Boîte B », « Boîte C »),
// prestas, salles et clients fictifs. Ils reproduisent les particularités relevées sur de vrais exports du
// 27/10/2026 (spec de l'étape 23, § 4), sans aucune de leurs données : un événement par phase, nom de presta avec
// plusieurs « / », catégorie avec une espace finale, « Demontage » sans accent, heures en UTC, minuit écrit 23:59:59,
// indisponibilités « Autre » et « Travail = … », retour à la ligne nu (LF seul) dans un fichier en CRLF, lignes de
// plus de 75 octets non repliées.

// Instant de référence des tests : mardi 27/10/2026 à 10 h, heure de Paris (heure d'hiver).
export const MAINTENANT_FICTIF = Date.UTC(2026, 9, 27, 9, 0, 0);

const ENTETE_EVENEMENT = '20261027T020000Z';

// Un événement au format d'Eventsoft. `debut` et `fin` : valeurs iCal telles quelles (« 20260612T060000Z »).
// `lieu` absent : pas de ligne LOCATION ; `client` absent : DESCRIPTION vide, comme pour les indisponibilités.
export function vevent({ uid, debut, fin, summary, categories, lieu, client, geo }) {
  return [
    'BEGIN:VEVENT',
    `DTSTART:${debut}`,
    `DTEND:${fin}`,
    `SUMMARY:${summary}`,
    ...(lieu === undefined ? [] : [`LOCATION:${lieu}`]),
    ...(geo === undefined ? [] : [`GEO:${geo}`]),
    `UID:${uid}`,
    ...(categories === undefined ? [] : [`CATEGORIES:${categories}`]),
    `DESCRIPTION:${client ?? ''}`,
    `DTSTAMP:${ENTETE_EVENEMENT}`,
    `CREATED:${ENTETE_EVENEMENT}`,
    'LAST-MODIFIED:19700101T000000Z',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'STATUS:CONFIRMED',
    'CLASS:PUBLIC',
    'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    'END:VEVENT',
  ];
}

// Un calendrier complet. `sep` : fin de ligne (CRLF comme Eventsoft, ou LF seul pour PL1).
export function calendrier({ calname, evenements, sep = '\r\n' }) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fictif//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'COLOR:DodgerBlue',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
    'X-WR-RELCALID;VALUE=TEXT:calendrier-fictif',
    `X-WR-CALNAME:${calname}`,
    'X-WR-CALDESC:Agenda des prestations EventSoft / Planning fictif / Technicien FICTIF',
    'X-WR-TIMEZONE:Europe/Paris',
    ...evenements.flatMap(vevent),
    'END:VCALENDAR',
  ].join(sep) + sep;
}

// Boîte A : « Installation » avec une espace finale, nom de presta à plusieurs « / », démontage de nuit rattaché à la
// veille, lieu de plus de 75 octets non replié, indisponibilité « Autre / Indisponible sur demande… ».
export const EVENEMENTS_A = [
  {
    uid: 'a1@fictif', debut: '20260612T060000Z', fin: '20260612T160000Z',
    summary: 'Salon fictif / Hall 1 / Stand 12 / Installation', categories: 'Installation ',
    lieu: 'Parc des expositions fictif, hall 1, allée centrale, porte de livraison numéro 4',
    client: 'Agence fictive A', geo: '48.8566;2.3522',
  },
  {
    uid: 'a2@fictif', debut: '20260612T223000Z', fin: '20260613T030000Z',
    summary: 'Salon fictif / Hall 1 / Stand 12 / Démontage', categories: 'Démontage',
    lieu: 'Parc des expositions fictif, hall 1, allée centrale, porte de livraison numéro 4',
    client: 'Agence fictive A', geo: '48.8566;2.3522',
  },
  {
    uid: 'a3@fictif', debut: '20260708T170000Z', fin: '20260709T010000Z',
    summary: 'Gala fictif / Prestation', categories: 'Prestation', lieu: 'Salle fictive', client: 'Client fictif A',
  },
  {
    uid: 'a4@fictif', debut: '20260802T220000Z', fin: '20260803T215959Z',
    summary: 'Autre / Indisponible sur demande de disponibilité', categories: 'Autre',
  },
  {
    uid: 'a5@fictif', debut: '20261116T030000Z', fin: '20261116T073000Z',
    summary: 'Congrès fictif / Installation', categories: 'Installation ', lieu: 'Centre fictif', client: 'Client fictif A',
  },
  {
    uid: 'a6@fictif', debut: '20261116T080000Z', fin: '20261116T170000Z',
    summary: 'Congrès fictif / Prestation', categories: 'Prestation', lieu: 'Centre fictif', client: 'Client fictif A',
  },
];

// Boîte B : « Demontage » sans accent, indisponibilité « Travail = INTERMITTENTS » en même temps qu'une date de la
// Boîte A, une date en conflit avec la Boîte A, une après moins de 11 h de repos, deux dates le même jour que la Boîte C.
export const EVENEMENTS_B = [
  {
    uid: 'b1@fictif', debut: '20260612T120000Z', fin: '20260612T200000Z',
    summary: 'Concert fictif / Installation', categories: 'Installation', lieu: 'Salle fictive B', client: 'Client fictif B',
  },
  {
    uid: 'b2@fictif', debut: '20260709T050000Z', fin: '20260709T100000Z',
    summary: 'Forum fictif / Demontage', categories: 'Demontage', lieu: 'Salle fictive B', client: 'Client fictif B',
  },
  {
    uid: 'b3@fictif', debut: '20260708T160000Z', fin: '20260709T020000Z',
    summary: 'Travail = INTERMITTENTS', categories: 'Travail = INTERMITTENTS',
  },
  {
    uid: 'b4@fictif', debut: '20260520T070000Z', fin: '20260520T100000Z',
    summary: 'Salon fictif 2 / Installation', categories: 'Installation', lieu: 'Salle fictive B', client: 'Client fictif B',
  },
  {
    uid: 'b5@fictif', debut: '20261029T060000Z', fin: '20261029T160000Z',
    summary: 'Séminaire fictif / Installation', categories: 'Installation', lieu: 'Salle fictive B', client: 'Client fictif B',
  },
];

// Boîte C : Livraison, Suivi de dossier, retour à la ligne nu dans une valeur (une indisponibilité et un client),
// « Autre » seul sur dix jours, minuit d'Eventsoft (23:59:59) en fin et en début de deux phases de travail.
export const EVENEMENTS_C = [
  {
    uid: 'c1@fictif', debut: '20260520T040000Z', fin: '20260520T060000Z',
    summary: 'Expo fictive / Livraison', categories: 'Livraison', lieu: 'Hall fictif C', client: 'Agence fictive C',
  },
  {
    uid: 'c4@fictif', debut: '20260521T080000Z', fin: '20260521T100000Z',
    summary: 'Expo fictive / Suivi de dossier', categories: 'Suivi de dossier', client: 'Agence fictive C\nService événements',
  },
  {
    uid: 'c2@fictif', debut: '20260619T220000Z', fin: '20260620T215959Z',
    summary: 'Autre / Indisponible sur la phase du 12/06/2026 sur la prestation Foire fictive\nsuite du texte', categories: 'Autre',
  },
  {
    uid: 'c3@fictif', debut: '20260901T120000Z', fin: '20260910T215959Z', summary: 'Autre', categories: 'Autre',
  },
  {
    uid: 'c5@fictif', debut: '20260920T160000Z', fin: '20260920T215959Z',
    summary: 'Soirée fictive / Prestation', categories: 'Prestation', lieu: 'Hall fictif C', client: 'Client fictif C',
  },
  {
    uid: 'c6@fictif', debut: '20260920T215959Z', fin: '20260921T020000Z',
    summary: 'Soirée fictive / Démontage', categories: 'Démontage', lieu: 'Hall fictif C', client: 'Client fictif C',
  },
  {
    uid: 'c7@fictif', debut: '20261020T060000Z', fin: '20261020T160000Z',
    summary: 'Expo fictive 2 / Installation', categories: 'Installation', lieu: 'Hall fictif C', client: 'Client fictif C',
  },
];

export const PLANNING_A = calendrier({ calname: 'EventSoft / Boîte A', evenements: EVENEMENTS_A });
export const PLANNING_B = calendrier({ calname: 'EventSoft / Boîte B', evenements: EVENEMENTS_B });
export const PLANNING_C = calendrier({ calname: 'EventSoft / Boîte C', evenements: EVENEMENTS_C });

export const NOMS_FICTIFS = { 'boite-a': 'Boîte A', 'boite-b': 'Boîte B', 'boite-c': 'Boîte C' };

// Relais simulé (lot 23c1) : adresse et jeton inventés, jamais ceux du vrai relais ; même comportement que relais/source.js
// (404 sans détail pour un jeton faux, 502 { boite, statut } pour une boîte en erreur).
export const ADRESSE_FICTIVE = 'https://relais.exemple.test';
export const JETON_FICTIF = 'jeton-fictif-de-l-appli-pour-les-tests-abcdefghij';
// Jeton Apple inventé (lot 23d) : abonnements Calendrier, jamais celui du vrai relais.
export const JETON_APPLE_FICTIF = 'jeton-fictif-apple-pour-les-tests-klmnopqrstuvwxyz';
export function relaisFictif({ reseau = false, jamais = false, statut = null, boites = {} } = {}) {
  const appels = [];
  const textes = { 'boite-a': PLANNING_A, 'boite-b': PLANNING_B, 'boite-c': PLANNING_C };
  const reponse = (code, corps, type = 'application/json') => ({ ok: code >= 200 && code < 300, status: code, headers: { get: () => type }, text: async () => corps, json: async () => JSON.parse(corps) });
  async function fetch(url, options = {}) {
    appels.push({ url, options });
    if (jamais) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Arrêt', 'AbortError')));
      });
    }
    if (reseau) throw new TypeError('Load failed');
    if (statut) return reponse(statut, 'Erreur', 'text/plain');
    if (options.headers?.Authorization !== `Bearer ${JETON_FICTIF}`) return reponse(404, 'Introuvable', 'text/plain');
    const chemin = url.slice(ADRESSE_FICTIVE.length);
    if (chemin === '/boites.json') return reponse(200, JSON.stringify(Object.entries(NOMS_FICTIFS).map(([id, nom]) => ({ id, nom }))));
    const m = /^\/ics\/([a-z0-9-]+)$/.exec(chemin);
    if (!m || !NOMS_FICTIFS[m[1]]) return reponse(404, 'Introuvable', 'text/plain');
    const regle = boites[m[1]] ?? {};
    if (regle.statut) return reponse(502, JSON.stringify({ boite: m[1], statut: regle.statut }));
    return reponse(200, regle.texte ?? textes[m[1]], 'text/calendar; charset=utf-8');
  }
  return { fetch, appels };
}
