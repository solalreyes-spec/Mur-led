// Écran Dépannage : arbres de diagnostic sourcés (data/depannage.json), hors ligne, sans aucun accès au réseau.
// Accueil (réflexes en court, symptômes en gros boutons, annexes), étapes (lignes numérotées, lignes de marque
// repliables, source de chaque ligne en petit, réponses), fins, annexes et liste des sources. Le texte des données est
// affiché tel quel : « {n} » devient un renvoi en exposant vers la source n, « [?] » le badge « à confirmer »,
// « annexe A » à « annexe D » un lien vers l'annexe, « mire de l'appli » un lien vers la mire (écran « Mire et fiche
// contenu »). Aucun calcul ici.

import { el, remplacer, listeNumerotee } from './dom.js';

const CHOIX_MARQUES = [['novastar', 'Novastar'], ['coex', 'COEX'], ['brompton', 'Brompton'], ['toutes', 'Toutes']];
const NOMS_MARQUES = { novastar: 'Novastar', coex: 'COEX', brompton: 'Brompton' };
const NIVEAUX_AFFICHES = { CC: 'copie sur un site tiers' };

// Marque d'un processeur pour les lignes de marque : Brompton, COEX (gamme Novastar) ou Novastar ; null pour une marque
// que ces arbres ne couvrent pas (Colorlight, Megapixel, Linsn…).
export function marqueDuProcesseur(processeur) {
  if (!processeur) return null;
  if (processeur.famille === 'brompton') return 'brompton';
  if (processeur.famille === 'novastar') return processeur.gamme === 'COEX' ? 'coex' : 'novastar';
  return null;
}

// Monte l'écran dans `racine`. `projet` : { marque, nom } du processeur retenu dans Data quand des saisies sont gardées,
// sinon null (choix de marque demandé). `enLigne` : les liens web des sources ne servent qu'en ligne.
export function monterDepannage(racine, donnees, {
  projet = null, enLigne = () => navigator.onLine, defiler = () => {}, ouvrirMire = null,
  liensPourquoi = [], ouvrirPourquoi = null, ouvrirListePourquoi = null,
} = {}) {
  const noeuds = new Map(donnees.noeuds.map((n) => [n.id, n]));
  const annexes = new Map(donnees.annexes.map((a) => [a.id, a]));
  const sources = new Map(donnees.sources.map((s) => [s.code, s]));
  const arbres = new Map(donnees.arbres.map((a) => [a.id, a]));
  const etat = { pile: [], projet, marque: projet?.marque ?? null, choixManuel: false };
  racine.classList.add('dep');

  // Mots de l'étape affichée qui ouvrent une fiche « pourquoi » (« EDID » en T5.3, « HDCP » en T6.6…) : leur première
  // occurrence dans les lignes de l'étape (ou dans l'avertissement de son arbre) devient un lien.
  let motsActifs = [];
  const motsLies = new Set();
  function lierMots(chaine) {
    const morceaux = [];
    let reste = chaine;
    for (;;) {
      const prochain = motsActifs
        .filter((l) => !motsLies.has(l.id))
        .map((l) => ({ l, i: reste.indexOf(l.mot) }))
        .filter((x) => x.i >= 0)
        .sort((a, b) => a.i - b.i)[0];
      if (!prochain || !ouvrirPourquoi) break;
      motsLies.add(prochain.l.id);
      if (prochain.i > 0) morceaux.push(reste.slice(0, prochain.i));
      morceaux.push(el('a', { href: '#pourquoi', class: 'dep-lien-pourquoi', 'data-fiche': prochain.l.fiche }, prochain.l.mot));
      reste = reste.slice(prochain.i + prochain.l.mot.length);
    }
    if (reste) morceaux.push(reste);
    return morceaux;
  }

  // --- Texte : renvois, badges, liens d'annexe, renvoi d'un réflexe vers un arbre ------------------------------------
  function texte(chaine, { vers = null, mots = false } = {}) {
    const morceaux = [];
    const motif = /\{(\d+)\}|\[\?\]|\bannexe ([A-D])\b|→ (T\d+)\b|mire de l'appli/g;
    let pos = 0;
    for (const m of chaine.matchAll(motif)) {
      if (m.index > pos) morceaux.push(chaine.slice(pos, m.index));
      if (m[1]) morceaux.push(el('sup', { class: 'dep-renvoi' }, m[1]));
      else if (m[0] === '[?]') morceaux.push(el('span', { class: 'dep-badge' }, 'à confirmer'));
      else if (m[2]) morceaux.push(el('button', { type: 'button', class: 'dep-lien-annexe', 'data-annexe': m[2] }, `annexe ${m[2]}`));
      else if (m[3] && vers) morceaux.push('→ ', el('a', { href: '#depannage', class: 'dep-lien-noeud', 'data-vers': vers }, m[3]));
      else if (m[0] === 'mire de l\'appli' && ouvrirMire) morceaux.push(el('a', { href: '#mire', class: 'dep-lien-mire' }, m[0]));
      else morceaux.push(m[0]);
      pos = m.index + m[0].length;
    }
    if (pos < chaine.length) morceaux.push(chaine.slice(pos));
    return mots ? morceaux.flatMap((m) => (typeof m === 'string' ? lierMots(m) : [m])) : morceaux;
  }

  function source(s) {
    const fiche = sources.get(s.code);
    const libelle = fiche?.libelle ?? s.code;
    const nom = fiche?.url && enLigne() ? el('a', { href: fiche.url, target: '_blank', rel: 'noopener' }, libelle) : libelle;
    const niveau = NIVEAUX_AFFICHES[fiche?.niveau];
    return el('span', { class: 'dep-source' },
      s.note ? `${s.note} ` : null, nom, s.ref ? `, ${s.ref}` : null, niveau ? ` (${niveau})` : null);
  }

  // Sources sous une ligne, en petit ; `balise` « span » dans un bouton (un paragraphe n'y a pas sa place).
  function blocSources(liste, balise = 'p') {
    if (!liste?.length) return null;
    const morceaux = [];
    liste.forEach((s, i) => {
      if (i > 0) morceaux.push(' ; ');
      if (s.renvoi !== undefined && liste.findIndex((x) => x.renvoi === s.renvoi) === i) morceaux.push(el('span', { class: 'dep-source-numero' }, `${s.renvoi} `));
      morceaux.push(source(s));
    });
    return el(balise, { class: 'dep-sources' }, ...morceaux);
  }

  // --- Lignes --------------------------------------------------------------------------------------------------------
  const ouverte = (marque) => etat.marque === 'toutes' || [].concat(marque).includes(etat.marque);
  const nomMarque = (l) => l.etiquette ?? [].concat(l.marque).map((m) => NOMS_MARQUES[m]).join(' et ');

  function ligne(l) {
    const corps = [el('p', { class: 'dep-texte' }, ...texte(l.texte, { mots: true })), blocSources(l.sources)];
    if (l.marque === null || l.marque === undefined) {
      return el('div', { class: 'dep-ligne', 'data-sources': l.sources.length }, ...corps);
    }
    return el('details', { class: 'dep-ligne dep-ligne-marque', 'data-marque': [].concat(l.marque).join(' '), 'data-sources': l.sources.length, open: ouverte(l.marque) ? '' : null },
      el('summary', {}, el('span', { class: 'dep-marque' }, nomMarque(l))),
      el('div', { class: 'dep-corps' }, ...corps));
  }

  function lignes(liste) {
    if (!liste.length) return null;
    if (liste.every((l) => l.numero === undefined)) return el('div', { class: 'dep-lignes' }, ...liste.map(ligne));
    const etapes = [];
    for (const l of liste) {
      const derniere = etapes[etapes.length - 1];
      if (derniere && derniere.numero === l.numero) derniere.lignes.push(l);
      else etapes.push({ numero: l.numero, lignes: [l] });
    }
    // Numéros écrits par l'appli : une étape qui commence par un encadré de marque garde son numéro (N37).
    return listeNumerotee({ class: 'dep-etapes' }, etapes.map((e) => ({
      numero: e.numero,
      contenu: el('div', { class: 'dep-lignes' }, ...e.lignes.map(ligne)),
      attributs: { class: `dep-etape${e.lignes[0].marque === null || e.lignes[0].marque === undefined ? '' : ' commence-par-encadre'}` },
    })));
  }

  // --- Choix de marque -----------------------------------------------------------------------------------------------
  function choixMarque() {
    let note;
    if (etat.projet?.marque && !etat.choixManuel) note = `Processeur de ton projet : ${etat.projet.nom}.`;
    else if (etat.projet?.nom && !etat.projet.marque) note = `Ton projet : ${etat.projet.nom}. ${donnees.perimetre}`;
    else if (!etat.marque) note = 'Choisis la marque de ton processeur : ses lignes s\'ouvrent, les autres restent repliées.';
    return el('div', { class: 'dep-marques' },
      el('div', { class: 'dep-marques-choix', role: 'group', 'aria-label': 'Marque du processeur' },
        ...CHOIX_MARQUES.map(([id, nom]) => el('button', { type: 'button', class: 'bouton', 'data-marque': id, 'aria-pressed': String(etat.marque === id) }, nom))),
      note ? el('p', { class: 'dep-note' }, note) : null);
  }

  // --- Écrans --------------------------------------------------------------------------------------------------------
  function barre() {
    return el('div', { class: 'dep-barre' },
      el('button', { type: 'button', class: 'bouton dep-retour' }, '◀ Retour'),
      el('button', { type: 'button', class: 'bouton dep-recommencer' }, 'Recommencer'));
  }

  function ecranAccueil() {
    racine.dataset.ecran = 'accueil';
    delete racine.dataset.noeud;
    delete racine.dataset.annexe;
    remplacer(racine,
      choixMarque(),
      el('h3', { class: 'dep-intertitre' }, 'Réflexes avant tout'),
      el('div', { class: 'dep-reflexes' }, ...donnees.reflexes.map((r) => el('details', { class: 'dep-reflexe' },
        el('summary', {}, `${r.id} · ${r.titre}`),
        el('div', { class: 'dep-corps' },
          el('p', { class: 'dep-texte' }, el('strong', {}, r.titre), ...texte(r.texte)),
          blocSources(r.sources),
          r.lignes.length ? el('div', { class: 'dep-lignes' }, ...r.lignes.map((l) => el('div', { class: 'dep-ligne', 'data-sources': l.sources.length },
            el('p', { class: 'dep-texte' }, ...texte(l.texte, { vers: l.vers })), blocSources(l.sources)))) : null)))),
      el('h3', { class: 'dep-intertitre' }, 'Quel est le symptôme ?'),
      el('div', { class: 'dep-symptomes' }, ...donnees.symptomes.map((s) => el('button', { type: 'button', class: 'bouton dep-symptome', 'data-vers': s.vers }, s.texte))),
      ouvrirListePourquoi ? el('h3', { class: 'dep-intertitre' }, 'Pourquoi ces règles ?') : null,
      ouvrirListePourquoi ? el('button', { type: 'button', class: 'bouton dep-bouton-pourquoi' }, 'Comprendre les règles') : null,
      el('h3', { class: 'dep-intertitre' }, 'Annexes'),
      el('div', { class: 'dep-annexes' },
        ...donnees.annexes.map((a) => el('button', { type: 'button', class: 'bouton dep-bouton-annexe', 'data-annexe': a.id }, `Annexe ${a.id} · ${a.titre}`)),
        el('button', { type: 'button', class: 'bouton dep-bouton-sources' }, 'Sources')));
  }

  function ecranNoeud(n) {
    motsActifs = liensPourquoi.filter((l) => l.element === 'mot' && (l.noeud === n.id || l.noeud === n.arbre));
    motsLies.clear();
    racine.dataset.ecran = 'noeud';
    racine.dataset.noeud = n.id;
    delete racine.dataset.annexe;
    const arbre = arbres.get(n.arbre);
    const marques = n.lignes.some((l) => l.marque !== null && l.marque !== undefined);
    if (n.type === 'fin') {
      const annexe = n.annexe ? annexes.get(n.annexe) : null;
      remplacer(racine, barre(),
        el('h2', { class: 'dep-titre dep-fin' }, n.titre),
        annexe ? contenuAnnexe(annexe, { titre: true }) : null);
      return;
    }
    remplacer(racine, barre(),
      el('p', { class: 'dep-contexte' }, `${arbre.id} · ${arbre.titre} · `, el('span', { class: 'dep-id' }, n.id)),
      arbre.avertissement ? el('div', { class: 'dep-avertissement', role: 'note' }, ...arbre.avertissement.map(ligne)) : null,
      el('h2', { class: 'dep-titre' }, ...texte(n.titre)),
      blocSources(n.sourcesTitre),
      el('div', { class: 'dep-contenu' }, lignes(n.lignes)),
      el('div', { class: 'dep-reponses', role: 'group', 'aria-label': n.type === 'question' ? 'Ta réponse' : 'Résultat' },
        ...n.choix.map((c) => el('button', { type: 'button', class: 'bouton dep-reponse', 'data-vers': c.vers },
          el('span', { class: 'dep-reponse-texte' }, ...texte(c.libelle)),
          blocSources(c.sources, 'span')))),
      blocSources(n.sourcesChoix),
      // Choix de marque sous les réponses : le contenu de l'étape reste dans le premier écran ; chaque ligne de marque
      // s'ouvre aussi d'un appui.
      marques ? el('div', { class: 'dep-marques-bas' }, el('h3', { class: 'dep-intertitre' }, 'Lignes de marque'), choixMarque()) : null);
  }

  function tableau(t) {
    return el('div', { class: 'dep-tableau-cadre' }, el('table', { class: 'dep-tableau' },
      el('thead', {}, el('tr', {}, ...t.colonnes.map((c) => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...t.lignes.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, ...texte(c))))))));
  }

  // Tableau B : une carte par appareil (l'écran d'un téléphone n'a pas la place de cinq colonnes).
  function cartesAppareils(t) {
    return el('div', { class: 'dep-appareils' }, ...t.lignes.map((r) => el('section', { class: 'dep-appareil' },
      el('h4', {}, r.appareil),
      el('dl', {}, ...r.cases.flatMap((c, i) => (c.texte ? [
        el('dt', {}, t.colonnes[i + 1]),
        el('dd', {}, el('span', { class: 'dep-texte' }, ...texte(c.texte)), blocSources(c.sources)),
      ] : []))))));
  }

  function annexeLigne(l) {
    return el('li', { class: 'dep-annexe-ligne' },
      el('p', { class: 'dep-texte' }, l.titre ? el('strong', {}, l.titre) : null, ...texte(l.texte)),
      blocSources(l.sources));
  }

  function contenuAnnexe(a, { titre = false } = {}) {
    return el('section', { class: 'dep-annexe', 'data-annexe': a.id },
      titre ? el('h3', { class: 'dep-intertitre' }, `Annexe ${a.id} · ${a.titre}`) : null,
      ...a.sections.map((s) => el('section', { class: 'dep-annexe-section' },
        el('h4', {}, s.titre),
        s.texte ? el('p', { class: 'dep-texte' }, ...texte(s.texte.trim())) : null,
        blocSources(s.sources),
        s.tableau ? tableau(s.tableau) : null,
        s.lignes?.length ? el('ul', { class: 'dep-annexe-lignes' }, ...s.lignes.map(annexeLigne)) : null)),
      a.tableau ? cartesAppareils(a.tableau) : null,
      a.lignes?.length ? el('ul', { class: 'dep-annexe-lignes' }, ...a.lignes.map(annexeLigne)) : null);
  }

  function ecranAnnexe(a) {
    racine.dataset.ecran = 'annexe';
    racine.dataset.annexe = a.id;
    delete racine.dataset.noeud;
    remplacer(racine, barre(), el('h2', { class: 'dep-titre' }, `Annexe ${a.id} · ${a.titre}`), contenuAnnexe(a));
  }

  function ecranSources() {
    racine.dataset.ecran = 'sources';
    delete racine.dataset.noeud;
    delete racine.dataset.annexe;
    const niveaux = donnees.niveaux;
    remplacer(racine, barre(), el('h2', { class: 'dep-titre' }, 'Sources'),
      el('p', { class: 'dep-note' }, enLigne() ? 'Les liens s\'ouvrent dans le navigateur.' : 'Hors ligne : les liens web des sources servent seulement en ligne.'),
      el('ul', { class: 'dep-liste-sources' }, ...donnees.sources.map((s) => el('li', { class: 'dep-source-entree' },
        el('p', { class: 'dep-texte' }, s.url && enLigne() ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.libelle) : s.libelle),
        el('p', { class: 'dep-sources' }, [s.version, niveaux[s.niveau]].filter(Boolean).join(' · '))))));
  }

  // --- Navigation ----------------------------------------------------------------------------------------------------
  function dessiner() {
    const haut = etat.pile[etat.pile.length - 1];
    if (!haut) ecranAccueil();
    else if (haut.type === 'noeud') ecranNoeud(noeuds.get(haut.id));
    else if (haut.type === 'annexe') ecranAnnexe(annexes.get(haut.id));
    else ecranSources();
  }
  function aller(entree) {
    etat.pile.push(entree);
    dessiner();
    defiler();
  }

  racine.addEventListener('click', (evenement) => {
    const cible = evenement.target.closest('button, a.dep-lien-noeud, a.dep-lien-mire, a.dep-lien-pourquoi');
    if (!cible || !racine.contains(cible)) return;
    if (cible.matches('a')) evenement.preventDefault();
    if (cible.matches('.dep-lien-mire')) {
      ouvrirMire?.();
      return;
    }
    if (cible.matches('.dep-lien-pourquoi')) {
      ouvrirPourquoi?.(cible.dataset.fiche);
      return;
    }
    if (cible.matches('.dep-bouton-pourquoi')) {
      ouvrirListePourquoi?.();
      return;
    }
    if (cible.dataset.marque) {
      etat.marque = cible.dataset.marque;
      etat.choixManuel = true;
      dessiner();
    } else if (cible.matches('.dep-retour')) {
      etat.pile.pop();
      dessiner();
      defiler();
    } else if (cible.matches('.dep-recommencer')) {
      etat.pile = [];
      dessiner();
      defiler();
    } else if (cible.dataset.annexe) {
      aller({ type: 'annexe', id: cible.dataset.annexe });
    } else if (cible.matches('.dep-bouton-sources')) {
      aller({ type: 'sources' });
    } else if (cible.dataset.vers && noeuds.has(cible.dataset.vers)) {
      aller({ type: 'noeud', id: cible.dataset.vers });
    }
  });

  dessiner();
  return {
    afficher: (id) => aller({ type: 'noeud', id }),
    annexe: (id) => aller({ type: 'annexe', id }),
    sources: () => aller({ type: 'sources' }),
    accueil: () => {
      etat.pile = [];
      dessiner();
    },
    // Projet du moment (onglet ouvert de nouveau) : sa marque s'applique tant que l'utilisateur n'en a pas choisi une.
    definirProjet(nouveau) {
      etat.projet = nouveau;
      if (!etat.choixManuel) etat.marque = nouveau?.marque ?? null;
      dessiner();
    },
  };
}
