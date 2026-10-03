// Fiches « pourquoi » (data/pourquoi.json, document du 03/10/2026) : une explication imagée et sourcée par règle de
// l'appli. Deux usages :
// - un lien « Pourquoi ? » à côté de chaque résultat, alerte ou refus qui découle d'une règle (table
//   data/pourquoi-liens.json : écran, type d'élément, motif du texte, fiche), posé sans toucher aux calculs ;
// - l'écran des fiches : les quatre images de base, les fiches par famille, puis une fiche (question, « La règle »,
//   « L'image », « En vrai », « Si tu ne la respectes pas », source courte sous chaque ligne, titres complets en bas).

import { el, remplacer } from './dom.js';

const NIVEAUX_AFFICHES = { copie: 'copie', T: 'site tiers' };

// ---------------------------------------------------------------------------
// Liens « Pourquoi ? »
// ---------------------------------------------------------------------------

const motifs = new WeakMap();
const motifDe = (lien) => {
  if (!motifs.has(lien)) motifs.set(lien, new RegExp(lien.motif));
  return motifs.get(lien);
};
// Texte propre d'un élément, sans un lien « Pourquoi ? » déjà posé.
const texteDe = (e) => [...e.childNodes].filter((n) => !(n.nodeType === 1 && n.matches('.lien-pourquoi'))).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();

// Fiche d'un texte : la première entrée de la table dont le motif le reconnaît, sur cet écran et pour ce type d'élément.
export function ficheDuTexte(table, ecran, element, texte) {
  return table.liens.find((l) => l.ecran === ecran && l.element === element && motifDe(l).test(texte))?.fiche ?? null;
}

function boutonPourquoi(fiche, ouvrir) {
  const b = el('button', { type: 'button', class: 'bouton bouton-petit lien-pourquoi', 'data-fiche': fiche, 'aria-label': `Pourquoi ? Fiche ${fiche}` }, 'Pourquoi ?');
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ouvrir(fiche);
  });
  return b;
}

// Pose les liens dans `racine` (le document par défaut), sur chaque écran de la table : alertes et notes (`.alerte`),
// tuiles de résultat (titre `dt` d'une `.tuile`), lignes désignées par un sélecteur (lien dans la ligne, à la fin). Un
// élément vu une fois est marqué (data-pourquoi) : relier de nouveau ne double jamais un lien.
export function relierPourquoi(table, { racine = document, ouvrir }) {
  for (const [ecran, selecteur] of Object.entries(table.ecrans ?? {})) {
    const zones = racine.matches?.(selecteur) ? [racine] : [...racine.querySelectorAll(selecteur)];
    for (const zone of zones) {
      for (const a of zone.querySelectorAll('.alerte:not([data-pourquoi])')) {
        const fiche = ficheDuTexte(table, ecran, 'alerte', texteDe(a));
        a.dataset.pourquoi = fiche ?? '';
        if (fiche) a.append(' ', boutonPourquoi(fiche, ouvrir));
      }
      for (const t of zone.querySelectorAll('.tuile:not([data-pourquoi])')) {
        const titre = t.querySelector('dt');
        const fiche = titre ? ficheDuTexte(table, ecran, 'tuile', texteDe(titre)) : null;
        t.dataset.pourquoi = fiche ?? '';
        if (fiche) t.append(boutonPourquoi(fiche, ouvrir));
      }
      for (const l of table.liens.filter((x) => x.ecran === ecran && x.element === 'ligne')) {
        for (const e of zone.querySelectorAll(`${l.selecteur}:not([data-pourquoi])`)) {
          if (!motifDe(l).test(texteDe(e))) continue;
          e.dataset.pourquoi = l.fiche;
          e.append(' ', boutonPourquoi(l.fiche, ouvrir));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Écran des fiches
// ---------------------------------------------------------------------------

export function monterPourquoi(racine, donnees, { enLigne = () => navigator.onLine, defiler = () => {} } = {}) {
  const fiches = new Map(donnees.fiches.map((f) => [f.id, f]));
  const sources = new Map(donnees.sources.map((s) => [s.code, s]));
  const familles = new Map(donnees.familles.map((f) => [f.id, f]));
  const etat = { vue: 'liste', fiche: null };
  racine.classList.add('pq');

  // Texte : renvois {n} en exposant, renvois vers une autre fiche (« (E2) », « comme en D1 ») en lien.
  const texte = (chaine, courante) => {
    const morceaux = [];
    let pos = 0;
    for (const m of chaine.matchAll(/\{(\d+)\}|\b([DEIA]\d{1,2})\b/g)) {
      if (m[2] && (!fiches.has(m[2]) || m[2] === courante)) continue;
      if (m.index > pos) morceaux.push(chaine.slice(pos, m.index));
      morceaux.push(m[1]
        ? el('sup', { class: 'pq-renvoi' }, m[1])
        : el('button', { type: 'button', class: 'pq-lien-fiche', 'data-fiche': m[2] }, m[2]));
      pos = m.index + m[0].length;
    }
    if (pos < chaine.length) morceaux.push(chaine.slice(pos));
    return morceaux;
  };
  // Sous chaque ligne : libellé court, sans lien (« Tessera p.205 », « Formation (transcription 6) »).
  const blocSources = (liste) => {
    if (!liste?.length) return null;
    const morceaux = [];
    liste.forEach((s, i) => {
      const fiche = sources.get(s.code);
      if (i > 0) morceaux.push(' ; ');
      if (s.renvoi !== undefined && liste.findIndex((x) => x.renvoi === s.renvoi) === i) morceaux.push(el('span', { class: 'pq-source-numero' }, `${s.renvoi} `));
      const niveau = NIVEAUX_AFFICHES[fiche?.niveau];
      morceaux.push(`${fiche?.court ?? s.code}${s.ref ? ` ${s.ref}` : ''}${niveau ? ` (${niveau})` : ''}`);
    });
    return el('p', { class: 'pq-sources' }, ...morceaux);
  };
  // Liste des sources en bas : titres complets, liens web seulement en ligne.
  const listeSources = (codes) => el('section', { class: 'pq-liste-sources' },
    el('h3', {}, 'Sources'),
    el('ul', {}, ...donnees.sources.filter((s) => !codes || codes.has(s.code)).map((s) => el('li', { class: 'pq-source-entree' },
      s.url && enLigne() ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.libelle) : s.libelle))),
    enLigne() ? null : el('p', { class: 'pq-note' }, 'Hors ligne : les liens servent seulement en ligne.'));

  function dessinerListe() {
    racine.dataset.vue = 'liste';
    delete racine.dataset.fiche;
    remplacer(racine,
      el('section', { class: 'pq-images' },
        el('h3', {}, 'Quatre images pour tout retenir'),
        el('ol', {}, ...donnees.images.map((x) => el('li', { class: 'pq-image' }, el('strong', {}, x.titre), ` ${x.texte}`)))),
      ...donnees.familles.map((f) => el('section', { class: 'pq-famille' },
        el('h3', {}, f.titre),
        el('div', { class: 'pq-fiches' }, ...f.fiches.map((id) => el('button', { type: 'button', class: 'bouton pq-fiche-bouton', 'data-fiche': id },
          el('span', { class: 'pq-id' }, id), ` ${fiches.get(id).question}`))))),
      listeSources(null));
  }

  function dessinerFiche(id) {
    const f = fiches.get(id);
    if (!f) return;
    racine.dataset.vue = 'fiche';
    racine.dataset.fiche = id;
    const codes = new Set(f.parties.flatMap((p) => p.sources.map((s) => s.code)));
    remplacer(racine,
      el('div', { class: 'pq-barre' }, el('button', { type: 'button', class: 'bouton pq-vers-liste' }, 'Toutes les fiches')),
      el('p', { class: 'pq-contexte' }, `${familles.get(f.famille)?.titre} · ${f.id}`),
      el('h2', { class: 'pq-question' }, f.question),
      ...f.parties.map((p) => el('section', { class: `pq-partie pq-partie-${p.cle}` },
        el('h3', {}, p.titre),
        el('p', { class: 'pq-texte' }, ...texte(p.texte, f.id)),
        blocSources(p.sources))),
      codes.size ? listeSources(codes) : null);
  }

  racine.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !racine.contains(b)) return;
    if (b.dataset.fiche) {
      etat.vue = 'fiche';
      etat.fiche = b.dataset.fiche;
      dessinerFiche(etat.fiche);
      defiler();
    } else if (b.matches('.pq-vers-liste')) {
      etat.vue = 'liste';
      dessinerListe();
      defiler();
    }
  });

  dessinerListe();
  return {
    afficherFiche(id) {
      etat.vue = 'fiche';
      etat.fiche = id;
      dessinerFiche(id);
    },
    afficherListe() {
      etat.vue = 'liste';
      dessinerListe();
    },
  };
}
