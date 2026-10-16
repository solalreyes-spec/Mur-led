// Prestas sur l'appareil (étape 10b) : lecture au lancement, ou migration de la configuration en cours la première
// fois ; écritures après chaque opération (prestas.js, ecrituresPrestas), dans l'ordre où elles ont été demandées.
// Les clés d'avant (« configuration », « parc-actif », « montage ») restent telles quelles, en secours.

import { lire, ecrire, effacer } from './stockage.js';
import { migrer, ecrituresPrestas, CLE_INDEX, cleMur, VERSION_PRESTAS } from './prestas.js';

const murVide = () => ({ version: VERSION_PRESTAS, parc: null, configuration: null, montage: null });

// Renvoie { etat, migre } : l'état gardé, ou celui de la migration (à enregistrer).
export async function chargerPrestas() {
  const index = await lire(CLE_INDEX);
  if (index?.prestas?.length) {
    const murs = {};
    for (const p of index.prestas) {
      for (const m of p.murs) murs[m.id] = (await lire(cleMur(m.id))) ?? murVide();
    }
    const presta = index.prestas.find((p) => p.id === index.ouverte?.presta) ?? index.prestas[0];
    const mur = presta.murs.find((m) => m.id === index.ouverte?.mur) ?? presta.murs[0];
    return { etat: { index: { ...index, ouverte: { presta: presta.id, mur: mur.id } }, murs }, migre: false };
  }
  const etat = migrer({ configuration: await lire('configuration'), parcActif: await lire('parc-actif'), montage: await lire('montage') });
  return { etat, migre: true };
}

// Écritures en file : chaque état est comparé au dernier écrit. Les murs d'abord, l'index ensuite : une coupure
// laisse l'index d'avant avec des murs complets.
export function creerEnregistreur(premier) {
  let ecrit = premier;
  let file = Promise.resolve(true);
  return function enregistrer(etat) {
    const avant = ecrit;
    ecrit = etat;
    file = file.then(async () => {
      const { ecrire: aEcrire, effacer: aEffacer } = ecrituresPrestas(avant, etat);
      let ok = true;
      for (const [cle, valeur] of [...aEcrire.filter(([k]) => k !== CLE_INDEX), ...aEcrire.filter(([k]) => k === CLE_INDEX)]) {
        ok = (await ecrire(cle, valeur)) && ok;
      }
      for (const cle of aEffacer) await effacer(cle);
      return ok;
    }).catch(() => false);
    return file;
  };
}
