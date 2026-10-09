// Onglet Apprendre (spec du 09/10/2026, § 4) : il remplace l'écran qui listait les fiches « pourquoi ». En tête, la
// carte S'entraîner (67 points, un par question, dans l'ordre de la banque, avec la légende en texte), puis les quatre
// images de base en tuiles, puis les cinq familles de fiches, chacune avec son nombre de fiches ; une famille ouvre la
// liste de ses fiches, une fiche s'ouvre dans l'écran des fiches (`ouvrirFiche`). La progression est celle du mode
// entraînement (stockage de l'appli, clé « entrainement ») ; `actualiser()` la relit après une séance.

import { el, remplacer } from './dom.js';
import { iconeTrait } from './look.js';
import * as e from './entrainement.js';

const CLE = 'entrainement';
const INTRO = '5 questions tirées des fiches. Après chaque réponse, l\'image et l\'explication. Pas de chrono.';
// Famille de chacune des quatre images de base, dans leur ordre (données, courant, image, accroche).
const FAMILLES_IMAGES = ['donnees', 'electricite', 'image', 'accroche'];
const ETATS_POINTS = { 1: 'revoir', 2: 'encours', 3: 'acquise' };

export function monterApprendre(racine, {
  pourquoi, entrainement, stockage, enLigne = () => navigator.onLine, ouvrirFiche = () => {}, ouvrirEntrainement = () => {},
}) {
  const questions = entrainement?.questions ?? [];
  const fiches = new Map(pourquoi.fiches.map((f) => [f.id, f]));
  const etat = { vue: 'accueil', famille: null, suivis: {} };
  racine.classList.add('ap');

  async function lireProgression() {
    try {
      const lu = stockage ? await stockage.lire(CLE) : null;
      etat.suivis = e.suivisConnus(lu?.suivis ?? {}, questions);
    } catch (erreur) {
      etat.suivis = {};
    }
  }

  function carteEntrainement() {
    const texte = e.texteEtat(e.etatProgression(questions, etat.suivis));
    const progression = e.etatProgression(questions, etat.suivis);
    return el('section', { class: 'carte ap-entrainement' },
      el('h3', { class: 'ap-titre' }, 'S\'entraîner'),
      el('p', { class: 'ap-intro' }, INTRO),
      el('div', { class: 'ap-points', role: 'img', 'aria-label': texte },
        ...questions.map((q) => el('span', { class: 'ap-point', 'data-question': q.id, 'data-etat': ETATS_POINTS[etat.suivis[q.id]?.boite] ?? 'jamais' }))),
      el('p', { class: 'ap-legende' },
        el('span', { class: 'ap-cle', 'data-etat': 'jamais' }, `Jamais vues ${progression.jamais}`), ' · ',
        el('span', { class: 'ap-cle', 'data-etat': 'revoir' }, `À revoir ${progression.aRevoir}`), ' · ',
        el('span', { class: 'ap-cle', 'data-etat': 'encours' }, `En cours ${progression.enCours}`), ' · ',
        el('span', { class: 'ap-cle', 'data-etat': 'acquise' }, `Acquises ${progression.acquises}`)),
      el('div', { class: 'ap-modes' },
        el('button', { type: 'button', class: 'bouton bouton-principal ap-mode', 'data-mode': 'jour' }, 'Séance du jour'),
        el('div', { class: 'ap-modes-second' },
          el('button', { type: 'button', class: 'bouton ap-mode', 'data-mode': 'essentiels' }, 'Les 5 essentiels'),
          el('button', { type: 'button', class: 'bouton ap-mode', 'data-mode': 'famille' }, 'Par famille'))));
  }

  function images() {
    return el('section', { class: 'ap-images' },
      el('h3', {}, 'Quatre images pour tout retenir'),
      el('div', { class: 'ap-tuiles-images' }, ...pourquoi.images.map((x, i) => el('div', { class: 'ap-image', 'data-famille': FAMILLES_IMAGES[i] },
        iconeTrait(FAMILLES_IMAGES[i], 'ap-icone'),
        el('strong', {}, x.titre),
        el('p', {}, x.texte)))));
  }

  function familles() {
    return el('section', { class: 'ap-familles' },
      el('h3', {}, `Les ${pourquoi.fiches.length} fiches`),
      el('div', { class: 'ap-lignes' }, ...pourquoi.familles.map((f) => el('button', { type: 'button', class: 'bouton ap-famille', 'data-famille': f.id },
        iconeTrait(f.id, 'ap-icone'),
        el('span', { class: 'ap-famille-titre' }, f.titre),
        el('span', { class: 'ap-compte' }, String(f.fiches.length))))));
  }

  function dessinerAccueil() {
    racine.dataset.vue = 'accueil';
    remplacer(racine, carteEntrainement(), images(), familles());
  }

  function dessinerFamille() {
    const f = pourquoi.familles.find((x) => x.id === etat.famille);
    if (!f) {
      dessinerAccueil();
      return;
    }
    racine.dataset.vue = 'famille';
    remplacer(racine,
      el('div', { class: 'ap-barre' }, el('button', { type: 'button', class: 'bouton ap-retour' }, 'Retour')),
      el('section', { class: 'ap-fiches-famille', 'data-famille': f.id },
        el('h3', {}, f.titre),
        el('div', { class: 'pq-fiches' }, ...f.fiches.map((id) => el('button', { type: 'button', class: 'bouton pq-fiche-bouton', 'data-fiche': id },
          el('span', { class: 'pq-id' }, id), ` ${fiches.get(id)?.question ?? ''}`)))));
  }

  const dessiner = () => (etat.vue === 'famille' ? dessinerFamille() : dessinerAccueil());

  racine.addEventListener('click', (evenement) => {
    const b = evenement.target.closest('button');
    if (!b || !racine.contains(b)) return;
    if (b.matches('.ap-mode')) ouvrirEntrainement(b.dataset.mode);
    else if (b.matches('.ap-famille')) {
      etat.vue = 'famille';
      etat.famille = b.dataset.famille;
      dessiner();
    } else if (b.matches('.ap-retour')) {
      etat.vue = 'accueil';
      dessiner();
    } else if (b.dataset.fiche) ouvrirFiche(b.dataset.fiche);
  });

  const pret = lireProgression().then(dessiner);
  return {
    pret,
    // Relit la progression (après une séance du mode) et redessine la vue en cours.
    async actualiser() {
      await lireProgression();
      dessiner();
    },
    afficherAccueil() {
      etat.vue = 'accueil';
      dessiner();
    },
    afficherFamille(id) {
      etat.vue = 'famille';
      etat.famille = id;
      dessiner();
    },
  };
}
