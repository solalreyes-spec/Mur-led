// Stockage local en IndexedDB : ma base (fiches, versions modifiées, parcs, sources), le parc actif et les fichiers
// joints (configs de dalles). Les fichiers joints restent sur l'appareil : jamais publiés, exportés seulement sur
// demande. En navigation privée ou si IndexedDB est bloqué, les données restent en mémoire le temps de la session.

const MAGASIN = 'donnees';
const PREFIXE_FICHIER = 'fichier:';
// Nom, type, taille et date de chaque fichier, rangés à part : la liste se lit sans charger les contenus.
const PREFIXE_INFOS = 'infos-fichier:';

// Un stockage par base IndexedDB : celle de l'appli (« appli-mur-led »), ou une base à part pour les tests.
export function creerStockage(nomBase) {
  const memoire = new Map();
  let disponible = typeof indexedDB !== 'undefined';

  function ouvrir() {
    return new Promise((resoudre, rejeter) => {
      const requete = indexedDB.open(nomBase, 1);
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
      transaction.oncomplete = () => {
        db.close();
        resoudre(requete.result);
      };
      transaction.onerror = () => {
        db.close();
        rejeter(transaction.error);
      };
    });
  }

  async function lire(cle) {
    if (!disponible) return memoire.get(cle);
    try {
      return await operation('readonly', (magasin) => magasin.get(cle));
    } catch (erreur) {
      disponible = false;
      return memoire.get(cle);
    }
  }

  async function ecrire(cle, valeur) {
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

  async function effacer(cle) {
    memoire.delete(cle);
    if (!disponible) return false;
    try {
      await operation('readwrite', (magasin) => magasin.delete(cle));
      return true;
    } catch (erreur) {
      disponible = false;
      return false;
    }
  }

  async function cles() {
    if (!disponible) return [...memoire.keys()];
    try {
      return await operation('readonly', (magasin) => magasin.getAllKeys());
    } catch (erreur) {
      disponible = false;
      return [...memoire.keys()];
    }
  }

  // Fichier joint : { nom, type, contenu (ArrayBuffer) } ; la taille et la date sont ajoutées.
  async function ecrireFichier(id, { nom, type = 'application/octet-stream', contenu }) {
    const infos = { id, nom, type, taille: contenu.byteLength, date: new Date().toISOString() };
    const ok = await ecrire(`${PREFIXE_FICHIER}${id}`, { ...infos, contenu });
    return (await ecrire(`${PREFIXE_INFOS}${id}`, infos)) && ok;
  }

  async function lireFichier(id) {
    return (await lire(`${PREFIXE_FICHIER}${id}`)) ?? null;
  }

  async function supprimerFichier(id) {
    const ok = await effacer(`${PREFIXE_FICHIER}${id}`);
    return (await effacer(`${PREFIXE_INFOS}${id}`)) && ok;
  }

  // Fichiers présents sur l'appareil : nom, type, taille et date, sans le contenu.
  async function listerFichiers() {
    const liste = [];
    for (const cle of await cles()) {
      if (typeof cle !== 'string' || !cle.startsWith(PREFIXE_INFOS)) continue;
      const f = await lire(cle);
      if (f) liste.push({ id: f.id, nom: f.nom, type: f.type, taille: f.taille, date: f.date });
    }
    return liste;
  }

  return {
    lire, ecrire, ecrireFichier, lireFichier, supprimerFichier, listerFichiers,
    disponible: () => disponible,
  };
}

// Stockage de l'appli.
const appli = creerStockage('appli-mur-led');
export const lire = appli.lire;
export const ecrire = appli.ecrire;
export const ecrireFichier = appli.ecrireFichier;
export const lireFichier = appli.lireFichier;
export const supprimerFichier = appli.supprimerFichier;
export const listerFichiers = appli.listerFichiers;

export function stockageDisponible() {
  return appli.disponible();
}
