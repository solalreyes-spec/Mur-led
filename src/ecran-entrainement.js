// Écran du mode entraînement (spec du 03/10/2026, § 1 et § 2) : accueil, question, fiche lue depuis une question ou le
// bilan, bilan. Monté dans l'écran plein #entrainement, ouvert depuis la carte S'entraîner de l'onglet Apprendre.
// Nouveau look (spec du 09/10/2026, § 5) : progression en 5 segments, réponses chiffrées en chasse fixe, l'image d'abord
// dans un encadré teinté de la famille de la question, « Question suivante » en bouton principal de cette famille.
// Questions de data/entrainement.json, fiches de data/pourquoi.json. Stockage injecté (celui de l'appli, IndexedDB avec
// repli en mémoire), hasard et date injectés (tests reproductibles). Pas de chrono, pas de note : le bilan dit combien
// de réponses étaient bonnes et quelles fiches relire.

import { el, remplacer } from './dom.js';
import { monterPourquoi, libelleSourceCourt } from './pourquoi.js';
import * as e from './entrainement.js';
import { familleDeFiche } from './look.js';

const CLE = 'entrainement';
const TITRES_PARTIES = { regle: 'La règle', vrai: 'En vrai', consequence: 'Si tu ne la respectes pas' };
const INTRO = '5 questions tirées des fiches. Après chaque réponse, l\'image et l\'explication. Pas de chrono.';

export function monterEntrainement(racine, {
  donnees, pourquoi, stockage, hasard = Math.random, aujourdhui = () => e.dateLocale(new Date()), enLigne = () => navigator.onLine,
  fermer = () => {}, defiler = () => {},
}) {
  const questions = donnees.questions;
  const parId = new Map(questions.map((q) => [q.id, q]));
  const fiches = new Map(pourquoi.fiches.map((f) => [f.id, f]));
  const familles = new Map(donnees.familles.map((f) => [f.id, f.titre]));
  const etat = { suivis: {}, enregistre: true, vue: 'accueil', seance: null, familles: false, confirmer: false, message: null, retour: null, fiche: null };
  racine.classList.add('en');

  // --- Stockage : le mode marche sans lui, avec la ligne prévue -----------------------------------------------------
  async function charger() {
    try {
      const lu = await stockage.lire(CLE);
      etat.suivis = e.suivisConnus(lu?.suivis ?? {}, questions);
      if (stockage.disponible && !stockage.disponible()) etat.enregistre = false;
    } catch (erreur) {
      etat.enregistre = false;
    }
  }
  async function sauver() {
    try {
      const ok = await stockage.ecrire(CLE, { version: 1, suivis: etat.suivis });
      if (ok === false && etat.enregistre) {
        etat.enregistre = false;
        if (etat.vue !== 'question') dessiner();
      }
    } catch (erreur) {
      etat.enregistre = false;
    }
  }
  const ligneStockage = () => (etat.enregistre ? null : el('p', { class: 'en-stockage' }, e.MESSAGE_SANS_STOCKAGE));

  // --- Accueil ------------------------------------------------------------------------------------------------------
  function dessinerAccueil() {
    remplacer(racine,
      el('p', { class: 'en-intro' }, INTRO),
      el('div', { class: 'en-modes' },
        el('button', { type: 'button', class: 'bouton en-mode', 'data-mode': 'jour' }, 'Séance du jour'),
        el('button', { type: 'button', class: 'bouton en-mode', 'data-mode': 'essentiels' }, 'Les 5 essentiels'),
        el('button', { type: 'button', class: 'bouton en-mode', 'data-mode': 'famille', 'aria-expanded': String(etat.familles) }, 'Par famille')),
      etat.familles ? el('div', { class: 'en-familles' }, ...donnees.familles.map((f) => el('button', { type: 'button', class: 'bouton en-famille', 'data-famille': f.id }, f.titre))) : null,
      el('p', { class: 'en-etat' }, e.texteEtat(e.etatProgression(questions, etat.suivis))),
      ligneStockage(),
      etat.message ? el('p', { class: 'en-note', role: 'status' }, etat.message) : null,
      etat.confirmer
        ? el('div', { class: 'en-confirmation' },
          el('p', {}, 'Effacer toute ta progression ? Toutes les questions repartent sans boîte.'),
          el('div', { class: 'en-boutons' },
            el('button', { type: 'button', class: 'bouton en-confirmer' }, 'Oui, effacer'),
            el('button', { type: 'button', class: 'bouton en-annuler' }, 'Annuler')))
        : el('button', { type: 'button', class: 'bouton en-effacer' }, 'Effacer ma progression'));
  }

  // --- Séance -------------------------------------------------------------------------------------------------------
  function commencer(ids, mode, famille = null) {
    etat.seance = { mode, famille, ids, index: 0, reponses: ids.map(() => null), ordres: ids.map((id) => e.ordreReponses(parId.get(id), hasard)) };
    etat.vue = 'question';
    etat.message = null;
    dessiner();
    defiler();
  }
  function demarrer(mode, famille = null) {
    const opts = { aujourdhui: aujourdhui(), hasard };
    const choix = mode === 'jour' ? e.seanceDuJour(questions, etat.suivis, opts)
      : mode === 'essentiels' ? e.cinqEssentiels(questions, etat.suivis, opts)
        : e.parFamille(questions, etat.suivis, famille, opts);
    commencer(choix.map((q) => q.id), mode, famille);
  }

  function marque(rep, i, r) {
    if (!r) return null;
    if (rep.bonne) return el('span', { class: 'en-marque' }, r.choix === i ? ' ✓ ton choix, bonne réponse' : ' ✓ bonne réponse');
    return r.choix === i ? el('span', { class: 'en-marque' }, ' ✗ ton choix') : null;
  }

  function explication(q, r) {
    const fiche = fiches.get(q.fiche);
    const image = fiche?.parties.find((p) => p.cle === 'image')?.texte ?? '';
    const verdict = r.juste ? '✓ Bonne réponse.' : r.choix === null ? `La réponse : ${q.bonne}.` : `✗ Pas cette fois. La bonne réponse : ${q.bonne}.`;
    return [
      el('p', { class: `en-verdict ${r.juste ? 'juste' : 'faux'}`, tabindex: '-1' }, verdict),
      image && !/^pas d'image/i.test(image) ? el('section', { class: 'en-bloc en-bloc-image' }, el('h4', {}, 'L\'image'), el('p', { class: 'en-image' }, image)) : null,
      el('section', { class: 'en-bloc' }, el('h4', {}, 'Ce que dit la fiche'),
        ...q.appuis.flatMap((a) => [
          el('p', { class: 'en-appui' }, `« ${a.texte} »`),
          el('p', { class: 'en-source' }, `${TITRES_PARTIES[a.partie]}${a.sources.length ? ` · ${a.sources.map((s) => libelleSourceCourt(pourquoi, s)).join(' ; ')}` : ''}`),
        ])),
      q.calcul ? el('section', { class: 'en-bloc' }, el('h4', {}, 'Le calcul'), el('p', { class: 'en-calcul' }, q.calcul)) : null,
      el('button', { type: 'button', class: 'bouton en-lire-fiche', 'data-fiche': q.fiche }, `Lire la fiche ${q.fiche}`),
      el('button', { type: 'button', class: 'bouton bouton-principal en-suivante' }, etat.seance.index === etat.seance.ids.length - 1 ? 'Voir le bilan' : 'Question suivante'),
    ];
  }

  // Progression : un segment par question (juste, faux ou « Je ne sais pas », en cours, à venir), la couleur ne porte
  // jamais seule l'information (étiquette de chaque segment, contexte écrit dessous).
  function progression() {
    const s = etat.seance;
    return el('div', { class: 'en-progression' }, ...s.ids.map((id, i) => {
      const r = s.reponses[i];
      const etatSegment = r ? (r.juste ? 'juste' : 'faux') : i === s.index ? 'encours' : 'avenir';
      return el('span', { class: 'en-segment', 'data-etat': etatSegment, role: 'img', 'aria-label': `Question ${i + 1} sur ${s.ids.length}` });
    }));
  }

  function dessinerQuestion() {
    const s = etat.seance;
    const q = parId.get(s.ids[s.index]);
    const r = s.reponses[s.index];
    const chiffrees = s.ordres[s.index].every((rep) => e.nombreEnTete(rep.texte) !== null);
    racine.dataset.famille = familleDeFiche(q.fiche) ?? 'apprendre';
    remplacer(racine,
      progression(),
      el('p', { class: 'en-contexte' }, `Question ${s.index + 1} sur ${s.ids.length} · ${familles.get(q.famille) ?? ''}`),
      el('h3', { class: 'en-enonce' }, q.question),
      el('div', { class: 'en-reponses' }, ...s.ordres[s.index].map((rep, i) => el('button', {
        type: 'button',
        class: `bouton en-reponse${chiffrees ? ' chiffres' : ''}${r && rep.bonne ? ' bonne' : ''}${r && r.choix === i && !rep.bonne ? ' fausse' : ''}`,
        'data-index': i,
        disabled: r ? '' : null,
      }, rep.texte, marque(rep, i, r)))),
      el('button', { type: 'button', class: 'bouton en-ne-sait-pas', disabled: r ? '' : null }, 'Je ne sais pas'),
      el('div', { class: 'en-explication', 'aria-live': 'polite' }, ...(r ? explication(q, r) : [])));
  }

  function repondre(choix) {
    const s = etat.seance;
    if (!s || s.reponses[s.index]) return;
    const juste = choix !== null && s.ordres[s.index][choix].bonne;
    s.reponses[s.index] = { choix, juste };
    etat.suivis = e.enregistrerReponse(etat.suivis, s.ids[s.index], juste, aujourdhui());
    dessiner();
    racine.querySelector('.en-verdict')?.focus();
    sauver();
  }

  // --- Bilan --------------------------------------------------------------------------------------------------------
  function dessinerBilan() {
    const s = etat.seance;
    const bonnes = s.reponses.filter((r) => r?.juste).length;
    remplacer(racine,
      el('p', { class: 'en-score' }, e.texteBilan(bonnes, s.ids.length)),
      el('ul', { class: 'en-bilan' }, ...s.ids.map((id, i) => {
        const q = parId.get(id);
        const juste = Boolean(s.reponses[i]?.juste);
        return el('li', { class: juste ? 'juste' : 'faux' },
          el('span', { class: 'en-resultat', 'aria-label': juste ? 'bonne réponse' : 'à revoir' }, juste ? '✓' : '✗'),
          el('span', { class: 'en-bilan-question' }, q.question),
          el('button', { type: 'button', class: 'bouton en-lire-fiche', 'data-fiche': q.fiche }, `Fiche ${q.fiche}`));
      })),
      ligneStockage(),
      el('div', { class: 'en-boutons' },
        el('button', { type: 'button', class: 'bouton bouton-principal en-encore' }, 'Encore 5 questions'),
        el('button', { type: 'button', class: 'bouton en-fermer' }, 'Fermer')));
  }

  // --- Fiche lue depuis le mode : « Retour » ramène à la question ou au bilan, dans le même état ---------------------
  function dessinerFiche() {
    const contenu = el('div');
    remplacer(racine, el('div', { class: 'en-barre' }, el('button', { type: 'button', class: 'bouton en-retour' }, 'Retour')), contenu);
    monterPourquoi(contenu, pourquoi, { enLigne, versListe: false }).afficherFiche(etat.fiche);
  }

  function dessiner() {
    racine.dataset.vue = etat.vue;
    if (etat.vue !== 'question') racine.dataset.famille = 'apprendre';
    if (etat.vue === 'question') dessinerQuestion();
    else if (etat.vue === 'bilan') dessinerBilan();
    else if (etat.vue === 'fiche') dessinerFiche();
    else dessinerAccueil();
  }

  racine.addEventListener('click', async (evenement) => {
    const b = evenement.target.closest('button');
    if (!b || !racine.contains(b) || b.disabled || b.closest('.pq')) return;
    if (b.matches('.en-mode')) {
      if (b.dataset.mode === 'famille') {
        etat.familles = !etat.familles;
        dessiner();
      } else demarrer(b.dataset.mode);
    } else if (b.matches('.en-famille')) {
      demarrer('famille', b.dataset.famille);
    } else if (b.matches('.en-reponse')) {
      repondre(Number(b.dataset.index));
    } else if (b.matches('.en-ne-sait-pas')) {
      repondre(null);
    } else if (b.matches('.en-suivante')) {
      const s = etat.seance;
      if (s.index < s.ids.length - 1) s.index += 1;
      else etat.vue = 'bilan';
      dessiner();
      defiler();
    } else if (b.matches('.en-lire-fiche')) {
      etat.retour = etat.vue;
      etat.fiche = b.dataset.fiche;
      etat.vue = 'fiche';
      dessiner();
      defiler();
    } else if (b.matches('.en-retour')) {
      etat.vue = etat.retour ?? 'accueil';
      dessiner();
    } else if (b.matches('.en-encore')) {
      demarrer(etat.seance.mode, etat.seance.famille);
    } else if (b.matches('.en-fermer')) {
      fermer();
    } else if (b.matches('.en-effacer')) {
      etat.confirmer = true;
      etat.message = null;
      dessiner();
      racine.querySelector('.en-annuler')?.focus();
    } else if (b.matches('.en-annuler')) {
      etat.confirmer = false;
      dessiner();
    } else if (b.matches('.en-confirmer')) {
      etat.suivis = e.progressionVide().suivis;
      etat.confirmer = false;
      etat.message = 'Progression effacée.';
      dessiner();
      await sauver();
    }
  });

  const pret = charger().then(() => dessiner());
  return {
    pret,
    // Accueil du mode : une séance fermée en cours garde ses réponses, elle ne reprend pas.
    // `familles` : familles dépliées (« Par famille » de l'onglet Apprendre).
    afficherAccueil({ familles = false } = {}) {
      etat.vue = 'accueil';
      etat.familles = familles;
      etat.confirmer = false;
      etat.message = null;
      dessiner();
    },
    demarrer,
    // Séance avec des questions choisies (tests, et « Les 5 essentiels » d'une autre source).
    demarrerAvec(ids, mode = 'essentiels') {
      commencer(ids.filter((id) => parId.has(id)), mode);
    },
  };
}
