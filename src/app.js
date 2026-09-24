// Point d'entrée de l'appli : charge la base de départ et ma base locale, lance les onglets et gère la navigation.

import { resoudreFiche } from './calculs.js';
import { el, remplacer } from './dom.js';
import { baseVide, fusionner, filtrerParParc, appliquerReglagesParc } from './fiches.js';
import { lire, ecrire } from './stockage.js';
import { initialiserMur, actualiserMur, signalerErreurMur } from './ecran-mur.js';
import { initialiserData, actualiserData, murModifie } from './ecran-data.js';
import { initialiserCanvas, actualiserRegies, donneesModifiees } from './ecran-canvas.js';
import { initialiserElec, murModifiePourElec } from './ecran-elec.js';
import { initialiserPoids, actualiserBumpers, murModifiePourPoids } from './ecran-poids.js';
import { initialiserBase, actualiserEcranBase } from './ecran-base.js';
import { restaurerConfiguration, suivreConfiguration, reglagesParDefaut } from './configuration.js';
import { initialiserCopie } from './copie.js';

// Hors ligne : le service worker garde les fichiers de l'appli. Il prévient quand une nouvelle version est prête.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (evenement) => {
    if (evenement.data?.type === 'nouvelle-version') document.getElementById('bandeau-maj').hidden = false;
  });
}
document.getElementById('recharger').addEventListener('click', () => location.reload());

// Mode rouge : toute l'appli en rouge sur noir, gardé pour la prochaine ouverture.
const boutonRouge = document.getElementById('mode-rouge');
function appliquerMode(rouge) {
  if (rouge) document.documentElement.dataset.mode = 'rouge';
  else delete document.documentElement.dataset.mode;
  boutonRouge.setAttribute('aria-pressed', String(rouge));
  document.querySelector('meta[name="theme-color"]').content = rouge ? '#000000' : '#0e1014';
}
appliquerMode(document.documentElement.dataset.mode === 'rouge');
boutonRouge.addEventListener('click', () => {
  const rouge = document.documentElement.dataset.mode !== 'rouge';
  appliquerMode(rouge);
  try {
    localStorage.setItem('mur-led-mode', rouge ? 'rouge' : 'sombre');
  } catch (erreur) {
    // Stockage bloqué : le mode vaut pour cette session.
  }
});

// Stockage persistant : le navigateur n'efface pas ma base pour faire de la place.
async function demanderStockagePersistant() {
  try {
    if (!navigator.storage?.persist) return null;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (erreur) {
    return null;
  }
}
let persistant = null;

const ONGLETS = ['mur', 'data', 'canvas', 'elec', 'poids', 'base'];

async function lireJson(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${chemin} introuvable (réponse ${reponse.status})`);
  return reponse.json();
}

function afficherOnglet() {
  const demande = location.hash.slice(1);
  const actif = ONGLETS.includes(demande) ? demande : 'mur';
  for (const id of ONGLETS) {
    document.getElementById(id).hidden = id !== actif;
    const lien = document.querySelector(`.onglet[href="#${id}"]`);
    if (id === actif) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', () => {
  afficherOnglet();
  window.scrollTo(0, 0);
});
afficherOnglet();

const erreurAlerte = (message) => el('div', { class: 'alerte alerte-erreur', role: 'alert' }, message);

// Base de départ (data/), en lecture seule.
const depart = { dalles: null, processeurs: null, regies: null };
try {
  depart.dalles = await lireJson('data/dalles.json');
} catch (erreur) {
  signalerErreurMur(`Impossible de charger la base de dalles : ${erreur.message}. Lance l'appli avec lancer.command.`);
}
try {
  depart.processeurs = await lireJson('data/processeurs.json');
} catch (erreur) {
  remplacer(document.getElementById('resultats-data'),
    erreurAlerte(`Impossible de charger la base de processeurs : ${erreur.message}. Lance l'appli avec lancer.command.`));
}
let connectique = null;
try {
  const base = await lireJson('data/connectique.json');
  connectique = { liaisons: base.liaisons.map((l) => resoudreFiche(l, base.sources)) };
} catch (erreur) {
  remplacer(document.getElementById('resultats-canvas'),
    erreurAlerte(`Impossible de charger la base de connectique : ${erreur.message}. Lance l'appli avec lancer.command.`));
}
// Régies et scalers : facultatives, l'onglet Canvas fonctionne sans elles.
let erreurRegies = null;
try {
  depart.regies = await lireJson('data/regies.json');
} catch (erreur) {
  erreurRegies = erreur.message;
}

// Ma base (fiches ajoutées, versions modifiées, parcs, sources) et le parc actif, gardés dans IndexedDB.
let base = (await lire('base-utilisateur')) ?? baseVide();
let parcActif = (await lire('parc-actif')) ?? null;
if (!base.parcs.some((p) => p.id === parcActif)) parcActif = null;

// Fusion base de départ + ma base, puis résolution des valeurs sourcées.
function construire() {
  const f = fusionner(depart, base);
  const resoudre = (liste, sources) => (liste ?? []).map((x) => resoudreFiche(x, sources));
  return {
    fusion: f,
    dalles: resoudre(f.dalles.dalles, f.dalles.sources),
    gabarits: resoudre(f.dalles.gabarits, f.dalles.sources),
    bumpers: resoudre(f.dalles.bumpers, f.dalles.sources),
    processeurs: resoudre(f.processeurs.processeurs, f.processeurs.sources),
    distributeurs: resoudre(f.processeurs.distributeurs, f.processeurs.sources),
    sourcesProcesseurs: f.processeurs.sources,
    regies: resoudre(f.regies.regies, f.regies.sources),
    sourcesRegies: f.regies.sources,
  };
}

// Sélecteurs « Parc actif » des onglets Mur et Data, toujours synchronisés.
const selecteursParc = [...document.querySelectorAll('.selecteur-parc')];
function remplirParcs() {
  for (const select of selecteursParc) {
    remplacer(select,
      el('option', { value: '' }, 'Tous'),
      base.parcs.map((p) => el('option', { value: p.id }, p.nom)));
    select.value = parcActif ?? '';
  }
}

let courant = construire();
const nomParc = () => base.parcs.find((p) => p.id === parcActif)?.nom ?? null;
// Dalles vues dans le parc actif : carte de réception et fichier de config réglés pour ce parc.
const pourMur = () => {
  const dalles = courant.dalles.map((d) => appliquerReglagesParc(d, base, parcActif));
  return { dalles, gabarits: courant.gabarits, visibles: filtrerParParc(dalles, base, parcActif, 'dalle'), nomParc: nomParc() };
};
const pourData = () => ({
  processeurs: filtrerParParc(courant.processeurs, base, parcActif, 'processeur'),
  distributeurs: courant.distributeurs,
  sources: courant.sourcesProcesseurs,
  nomParc: nomParc(),
});

// Après chaque changement de ma base ou du parc actif : tous les onglets suivent.
function appliquer() {
  courant = construire();
  remplirParcs();
  if (depart.processeurs) actualiserData(pourData());
  if (connectique) actualiserRegies(courant.regies, courant.sourcesRegies);
  if (depart.dalles) {
    actualiserBumpers(courant.bumpers);
    actualiserMur(pourMur());
  }
  actualiserEcranBase({ base, depart, fusion: courant.fusion, parcActif, persistant });
}

// Enregistre ma nouvelle base ; renvoie false si le stockage local n'a pas pu l'écrire.
async function enregistrerBase(nouvelle) {
  base = nouvelle;
  if (!base.parcs.some((p) => p.id === parcActif)) {
    parcActif = null;
    await ecrire('parc-actif', null);
  }
  const ok = await ecrire('base-utilisateur', base);
  appliquer();
  return ok;
}

for (const select of selecteursParc) {
  select.addEventListener('change', async () => {
    parcActif = select.value || null;
    await ecrire('parc-actif', parcActif);
    appliquer();
  });
}
remplirParcs();

// Chaîne des onglets : Mur → Data → Canvas.
if (connectique) {
  initialiserCanvas({ ...connectique, regies: courant.regies, sourcesRegies: courant.sourcesRegies, erreurRegies });
}
if (depart.processeurs) initialiserData(pourData(), connectique ? donneesModifiees : () => {});
initialiserElec();
if (depart.dalles) {
  initialiserPoids(courant.bumpers);
  initialiserMur(pourMur(), (etat) => {
    if (depart.processeurs) murModifie(etat);
    murModifiePourElec(etat);
    murModifiePourPoids(etat);
  });
}
initialiserBase({ base, depart, fusion: courant.fusion, parcActif, persistant }, enregistrerBase);

// Saisies de la dernière session, puis sauvegarde automatique ; copie des résultats.
await restaurerConfiguration();
suivreConfiguration();
initialiserCopie();
// Demandé après le démarrage : certains navigateurs posent la question à l'utilisateur.
demanderStockagePersistant().then((accorde) => {
  persistant = accorde;
  actualiserEcranBase({ base, depart, fusion: courant.fusion, parcActif, persistant });
});
document.getElementById('reglages-defaut').addEventListener('click', () => {
  if (confirm('Remettre toutes les saisies des onglets Mur, Data, Canvas, Élec et Poids à leurs valeurs par défaut ? Ta base et tes parcs ne changent pas.')) {
    reglagesParDefaut();
  }
});
