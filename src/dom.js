// Petit outil commun pour construire la page sans innerHTML.

export function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (valeur !== null && valeur !== undefined && valeur !== false) noeud.setAttribute(nom, valeur);
  }
  for (const enfant of enfants.flat()) {
    if (enfant !== null && enfant !== undefined && enfant !== false) noeud.append(enfant);
  }
  return noeud;
}

// Liste numérotée dont l'appli écrit elle-même les numéros (« 3. »), dans une colonne fixe à gauche, et le contenu dans
// la colonne suivante : la puce automatique d'un <ol> est décalée ou effacée par Safari quand l'élément commence par un
// bloc repliable (<details>). `elements` : [{ numero, contenu, attributs }] ; le rôle « list » garde la liste pour les
// lecteurs d'écran (Safari l'oublie quand la puce est retirée).
export function listeNumerotee(attributs, elements) {
  return el('ol', { ...attributs, class: ['liste-numerotee', attributs.class].filter(Boolean).join(' '), role: 'list' },
    ...elements.map(({ numero, contenu, attributs: a = {} }) => el('li', { ...a, class: ['element-numerote', a.class].filter(Boolean).join(' ') },
      el('span', { class: 'numero-liste' }, `${numero}.`),
      el('div', { class: 'contenu-liste' }, ...[contenu].flat(Infinity)))));
}

// Remplace le contenu d'un nœud ; accepte des listes et ignore null, undefined et false.
export function remplacer(noeud, ...enfants) {
  noeud.replaceChildren(...enfants.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
}

// Même chose en SVG (schéma de câblage).
const NS_SVG = 'http://www.w3.org/2000/svg';
export function svg(balise, attributs = {}, ...enfants) {
  const noeud = document.createElementNS(NS_SVG, balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (valeur !== null && valeur !== undefined && valeur !== false) noeud.setAttribute(nom, valeur);
  }
  for (const enfant of enfants.flat()) {
    if (enfant !== null && enfant !== undefined && enfant !== false) noeud.append(enfant);
  }
  return noeud;
}
