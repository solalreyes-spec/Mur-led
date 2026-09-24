// Petit banc de test sans dépendance, commun à tests.html et à `node --test`.
// Un cas reçoit un objet `v` et y enregistre ses contrôles. Chaque contrôle garde
// son libellé, la valeur obtenue et la valeur attendue, pour les afficher en clair.

export function creerVerif() {
  const controles = [];
  const noter = (controle) => {
    controles.push(controle);
    return controle.ok;
  };
  return {
    controles,
    // Égalité stricte ; les tableaux et objets sont comparés par contenu.
    egal: (libelle, obtenu, attendu) =>
      noter({ libelle, obtenu, attendu, ok: memeValeur(obtenu, attendu) }),
    // Écart absolu toléré, pour les valeurs que le support donne arrondies.
    proche: (libelle, obtenu, attendu, tolerance) =>
      noter({
        libelle, obtenu, attendu, tolerance,
        ok: typeof obtenu === 'number' && Math.abs(obtenu - attendu) <= tolerance,
      }),
    vrai: (libelle, condition) =>
      noter({ libelle, obtenu: condition, attendu: true, ok: condition === true }),
  };
}

function memeValeur(a, b) {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

// Même chose pour un cas asynchrone (images, canvas) : `verifier` renvoie une promesse.
export async function executerCasAsync(cas, contexte = {}) {
  const v = creerVerif();
  try {
    await cas.verifier(v, contexte);
  } catch (erreur) {
    return { statut: 'erreur', controles: v.controles, erreur };
  }
  if (v.controles.length === 0) {
    return { statut: 'erreur', controles: [], erreur: new Error('Aucun contrôle dans ce cas.') };
  }
  return { statut: v.controles.every((c) => c.ok) ? 'reussi' : 'echec', controles: v.controles };
}

// Statuts : 'a-venir' (pas encore de vérification), 'reussi', 'echec', 'erreur'.
// `contexte` porte les données lues une seule fois (par exemple data/dalles.json).
export function executerCas(cas, contexte = {}) {
  if (typeof cas.verifier !== 'function') return { statut: 'a-venir', controles: [] };
  const v = creerVerif();
  try {
    cas.verifier(v, contexte);
  } catch (erreur) {
    return { statut: 'erreur', controles: v.controles, erreur };
  }
  if (v.controles.length === 0) {
    return { statut: 'erreur', controles: [], erreur: new Error('Aucun contrôle dans ce cas.') };
  }
  return { statut: v.controles.every((c) => c.ok) ? 'reussi' : 'echec', controles: v.controles };
}
