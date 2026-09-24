// Stockage local en IndexedDB : ma base (fiches, versions modifiées, parcs, sources) et le parc actif.
// En navigation privée ou si IndexedDB est bloqué, les données restent en mémoire le temps de la session.

const NOM_BASE = 'appli-mur-led';
const MAGASIN = 'donnees';
const memoire = new Map();
let disponible = typeof indexedDB !== 'undefined';

function ouvrir() {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN);
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

async function operation(mode, action) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const transaction = db.transaction(MAGASIN, mode);
    const requete = action(transaction.objectStore(MAGASIN));
    transaction.oncomplete = () => resoudre(requete.result);
    transaction.onerror = () => rejeter(transaction.error);
  });
}

export async function lire(cle) {
  if (!disponible) return memoire.get(cle);
  try {
    return await operation('readonly', (magasin) => magasin.get(cle));
  } catch (erreur) {
    disponible = false;
    return memoire.get(cle);
  }
}

export async function ecrire(cle, valeur) {
  memoire.set(cle, valeur);
  if (!disponible) return false;
  try {
    await operation('readwrite', (magasin) => magasin.put(valeur, cle));
    return true;
  } catch (erreur) {
    disponible = false;
    return false;
  }
}

export function stockageDisponible() {
  return disponible;
}
