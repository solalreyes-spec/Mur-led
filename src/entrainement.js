// Mode entraînement : boîtes de Leitner, choix des séances, ordre des réponses, bilan. Fonctions pures, sans accès à
// l'interface (spec du 03/10/2026, § 2.3 ; règles R225 à R230). Le hasard est une fonction injectée (valeurs de 0 à 1),
// pour des tests reproductibles ; les dates sont des dates locales « AAAA-MM-JJ », sans l'heure.

export const THEMES = ['port', 'marge80', 'phases', 'scan', 'lots'];
// Échéance de chaque boîte, en jours après la dernière réponse : boîte 1 dès la séance suivante.
export const ECHEANCES_JOURS = { 1: 0, 2: 2, 3: 7 };
export const NOMBRE_QUESTIONS = 5;
export const MESSAGE_SANS_STOCKAGE = 'Progression non enregistrée sur cet appareil.';

// Hasard reproductible (mulberry32) : même graine, même suite.
export function hasardGraine(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Date locale d'un instant, sans l'heure.
export function dateLocale(date = new Date()) {
  const deux = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

// Jours entiers entre deux dates locales (comptés en UTC : un changement d'heure ne décale rien).
export function joursEntre(debut, fin) {
  const jour = (t) => {
    const [a, m, j] = t.split('-').map(Number);
    return Date.UTC(a, m - 1, j) / 86400000;
  };
  return Math.round(jour(fin) - jour(debut));
}

// Boîte après une réponse : juste, la suivante jusqu'à 3 (une question jamais vue part de la boîte 1, choix de
// l'utilisateur) ; fausse ou « Je ne sais pas », la boîte 1.
export function boiteApres(boite, juste) {
  return juste ? Math.min((boite ?? 1) + 1, 3) : 1;
}

export function enregistrerReponse(suivis, id, juste, aujourdhui) {
  return { ...suivis, [id]: { boite: boiteApres(suivis[id]?.boite, juste), date: aujourdhui } };
}

export function aRevoir(suivi, aujourdhui) {
  return joursEntre(suivi.date, aujourdhui) >= (ECHEANCES_JOURS[suivi.boite] ?? 0);
}

export function progressionVide() {
  return { version: 1, suivis: {} };
}

// Fiches de suivi des questions qui existent encore ; les autres sont ignorées.
export function suivisConnus(suivis, questions) {
  const ids = new Set(questions.map((q) => q.id));
  return Object.fromEntries(Object.entries(suivis ?? {}).filter(([id, s]) => ids.has(id) && [1, 2, 3].includes(s?.boite) && typeof s.date === 'string'));
}

// État : jamais vues (sans boîte), à revoir (boîte 1), en cours (boîte 2), acquises (boîte 3).
export function etatProgression(questions, suivis) {
  const connus = suivisConnus(suivis, questions);
  const e = { jamais: 0, aRevoir: 0, enCours: 0, acquises: 0 };
  for (const q of questions) {
    const boite = connus[q.id]?.boite;
    if (!boite) e.jamais += 1;
    else if (boite === 1) e.aRevoir += 1;
    else if (boite === 2) e.enCours += 1;
    else e.acquises += 1;
  }
  return e;
}

export function texteEtat(e) {
  return `Jamais vues ${e.jamais} · À revoir ${e.aRevoir} · En cours ${e.enCours} · Acquises ${e.acquises}`;
}

// Mélange de Fisher-Yates, avec le hasard injecté.
export function melanger(liste, hasard) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Questions dans l'ordre de priorité du § 2.3 : boîte 1 la plus ancienne d'abord, boîte 2 à revoir, jamais vues au
// hasard, boîte 3 à revoir, puis, pour compléter, les questions vues il y a le plus longtemps. À date égale, l'ordre
// de la banque.
export function priorites(questions, suivis, { aujourdhui, hasard }) {
  const connus = suivisConnus(suivis, questions);
  const rang = new Map(questions.map((q, i) => [q.id, i]));
  const parDate = (a, b) => connus[a.id].date.localeCompare(connus[b.id].date) || rang.get(a.id) - rang.get(b.id);
  const vues = (filtre) => questions.filter((q) => connus[q.id] && filtre(connus[q.id])).sort(parDate);
  const boite1 = vues((s) => s.boite === 1);
  const boite2 = vues((s) => s.boite === 2 && aRevoir(s, aujourdhui));
  const jamais = melanger(questions.filter((q) => !connus[q.id]), hasard);
  const boite3 = vues((s) => s.boite === 3 && aRevoir(s, aujourdhui));
  const reste = vues((s) => s.boite !== 1 && !aRevoir(s, aujourdhui));
  return [...boite1, ...boite2, ...jamais, ...boite3, ...reste];
}

// Choix d'une séance du jour, dans l'ordre de priorité, jamais deux questions d'une même fiche.
export function choisirSeance(questions, suivis, { aujourdhui, hasard, nombre = NOMBRE_QUESTIONS }) {
  const choix = [];
  const fiches = new Set();
  for (const q of priorites(questions, suivis, { aujourdhui, hasard })) {
    if (choix.length === nombre) break;
    if (fiches.has(q.fiche)) continue;
    choix.push(q);
    fiches.add(q.fiche);
  }
  return choix;
}

// Séance du jour : le choix, puis mélangé pour alterner les familles.
export function seanceDuJour(questions, suivis, opts) {
  return melanger(choisirSeance(questions, suivis, opts), opts.hasard);
}

// Les 5 essentiels : dans chaque thème, dans l'ordre, la question prioritaire.
export function cinqEssentiels(questions, suivis, { aujourdhui, hasard, themes = THEMES }) {
  return themes.map((t) => priorites(questions.filter((q) => q.theme === t), suivis, { aujourdhui, hasard })[0]).filter(Boolean);
}

// Ordre sans deux questions d'une même fiche à la suite, quand c'est possible : à chaque place, parmi les questions
// restantes d'une autre fiche que la précédente, celle de la fiche qui en a le plus, puis l'ordre reçu.
function sansSuite(liste) {
  const reste = [...liste];
  const ordre = [];
  const restantes = (fiche) => reste.filter((q) => q.fiche === fiche).length;
  while (reste.length) {
    const avant = ordre[ordre.length - 1]?.fiche;
    let k = -1;
    reste.forEach((q, i) => {
      if (q.fiche !== avant && (k === -1 || restantes(q.fiche) > restantes(reste[k].fiche))) k = i;
    });
    ordre.push(...reste.splice(k === -1 ? 0 : k, 1));
  }
  return ordre;
}

// Par famille : 5 questions de la famille, une par fiche tant que possible ; sinon une seconde question d'une même
// fiche (Régie, Accroche), jamais à la suite.
export function parFamille(questions, suivis, famille, { aujourdhui, hasard, nombre = NOMBRE_QUESTIONS }) {
  const ordre = priorites(questions.filter((q) => q.famille === famille), suivis, { aujourdhui, hasard });
  const choix = [];
  const fiches = new Set();
  for (const q of ordre) {
    if (choix.length < nombre && !fiches.has(q.fiche)) {
      choix.push(q);
      fiches.add(q.fiche);
    }
  }
  for (const q of ordre) if (choix.length < nombre && !choix.includes(q)) choix.push(q);
  return sansSuite(melanger(choix, hasard));
}

// Nombre au début d'une réponse, lu avec la virgule décimale et les espaces de milliers (« 1,4 m », « 262 500 px ») ;
// null si la réponse ne commence pas par un nombre.
export function nombreEnTete(texte) {
  const m = /^\s*(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:,(\d+))?(?!\d)/.exec(texte ?? '');
  if (!m) return null;
  return Number(`${m[1].replace(/[ \u00a0\u202f]/g, '')}${m[2] ? `.${m[2]}` : ''}`);
}

// Réponses d'une question : en ordre croissant quand toutes commencent par un nombre, mélangées sinon.
export function ordreReponses(question, hasard) {
  const reponses = [{ texte: question.bonne, bonne: true }, ...question.autres.map((texte) => ({ texte, bonne: false }))];
  if (reponses.every((r) => nombreEnTete(r.texte) !== null)) return [...reponses].sort((a, b) => nombreEnTete(a.texte) - nombreEnTete(b.texte));
  return melanger(reponses, hasard);
}

export function texteBilan(bonnes, total) {
  return `${bonnes} bonne${bonnes > 1 ? 's' : ''} réponse${bonnes > 1 ? 's' : ''} sur ${total}.`;
}
