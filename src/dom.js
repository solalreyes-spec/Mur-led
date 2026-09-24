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
