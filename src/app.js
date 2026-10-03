// Point d'entrée de l'appli : charge la base de départ et ma base locale, lance les onglets et gère la navigation.

import { resoudreFiche } from './calculs.js';
import { el, remplacer } from './dom.js';
import { baseVide, fusionner, filtrerParParc, appliquerReglagesParc, bitsReseauParc, migrerFichiersConfig } from './fiches.js';
import { lire, ecrire } from './stockage.js';
import { initialiserMur, actualiserMur, signalerErreurMur } from './ecran-mur.js';
import { initialiserData, actualiserData, murModifie, definirDepartData, processeurRetenu } from './ecran-data.js';
import { initialiserCanvas, actualiserRegies, donneesModifiees } from './ecran-canvas.js';
import { initialiserElec, murModifiePourElec, definirDepartElec } from './ecran-elec.js';
import {
  initialiserSchema, murModifiePourSchema, dataModifieePourSchema, elecModifiePourSchema, definirModeMur, effacerMontage, actualiserAffichageSchema,
  cablageRetenu,
} from './ecran-schema.js';
import { initialiserPoids, actualiserBumpers, murModifiePourPoids } from './ecran-poids.js';
import { initialiserBase, actualiserEcranBase } from './ecran-base.js';
import { restaurerConfiguration, suivreConfiguration, reglagesParDefaut } from './configuration.js';
import { initialiserCopie } from './copie.js';
import { monterDepannage, marqueDuProcesseur } from './ecran-depannage.js';
import { monterMireFiche } from './ecran-mire.js';
import { monterPourquoi, relierPourquoi } from './pourquoi.js';

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

// Grand affichage (option 2 de l'audit terrain) : textes, zones à toucher et dessin du Schéma plus grands, en plus du
// thème sombre ou du mode rouge ; gardé pour la prochaine ouverture.
const boutonGrand = document.getElementById('grand-affichage');
function appliquerTaille(grand) {
  if (grand) document.documentElement.dataset.taille = 'grand';
  else delete document.documentElement.dataset.taille;
  boutonGrand.setAttribute('aria-pressed', String(grand));
}
appliquerTaille(document.documentElement.dataset.taille === 'grand');
boutonGrand.addEventListener('click', () => {
  const grand = document.documentElement.dataset.taille !== 'grand';
  appliquerTaille(grand);
  try {
    localStorage.setItem('mur-led-taille', grand ? 'grand' : 'normal');
  } catch (erreur) {
    // Stockage bloqué : le choix vaut pour cette session.
  }
  actualiserAffichageSchema();
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

const ONGLETS = ['mur', 'data', 'canvas', 'elec', 'poids', 'schema', 'depannage', 'base'];

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

// Appareils en amont et en aval (étape Pf3) : un fichier par famille, facultatifs.
depart.appareils = {};
for (const famille of ['melangeurs', 'convertisseurs', 'serveurs', 'switches']) {
  try {
    depart.appareils[famille] = await lireJson(`data/${famille}.json`);
  } catch (erreur) {
    depart.appareils[famille] = null;
  }
}
// Écran Dépannage : arbres de diagnostic, facultatifs (les autres onglets fonctionnent sans eux).
let depannage = null;
try {
  depannage = await lireJson('data/depannage.json');
} catch (erreur) {
  remplacer(document.getElementById('ecran-depannage'),
    erreurAlerte(`Impossible de charger le dépannage : ${erreur.message}. Lance l'appli avec lancer.command.`));
}

// Mire et fiche contenu : consignes, mode d'emploi et sources (facultatifs : sans eux, pas de bouton).
let ficheContenu = null;
try {
  ficheContenu = await lireJson('data/fiche-contenu.json');
} catch (erreur) {
  ficheContenu = null;
}

// Fiches « pourquoi » et table des liens (facultatives : sans elles, ni lien « Pourquoi ? » ni bouton dans le Dépannage).
let pourquoi = null;
let liensPourquoi = null;
try {
  [pourquoi, liensPourquoi] = await Promise.all([lireJson('data/pourquoi.json'), lireJson('data/pourquoi-liens.json')]);
} catch (erreur) {
  pourquoi = null;
  liensPourquoi = null;
}

const appareils = Object.fromEntries(Object.entries(depart.appareils)
  .map(([famille, b]) => [famille, (b?.appareils ?? []).map((x) => resoudreFiche(x, b.sources))]));

// Ma base (fiches ajoutées, versions modifiées, parcs, sources) et le parc actif, gardés dans IndexedDB.
let base = (await lire('base-utilisateur')) ?? baseVide();
// Ancien champ « fichier de config » d'un parc : repris une fois en premier lot « sans identifiant ».
const migree = migrerFichiersConfig(base);
if (JSON.stringify(migree) !== JSON.stringify(base)) {
  base = migree;
  await ecrire('base-utilisateur', base);
}
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
    informations: resoudre(f.dalles.informations, f.dalles.sources),
    bumpers: resoudre(f.dalles.bumpers, f.dalles.sources),
    processeurs: resoudre(f.processeurs.processeurs, f.processeurs.sources),
    informationsProcesseurs: resoudre(f.processeurs.informations, f.processeurs.sources),
    cartesReception: resoudre(f.processeurs.cartesReception, f.processeurs.sources),
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
  return {
    dalles, gabarits: courant.gabarits, informations: courant.informations, visibles: filtrerParParc(dalles, base, parcActif, 'dalle'), nomParc: nomParc(),
    // Lots et configs des dalles dans le parc actif.
    lots: { base, parcId: parcActif },
  };
};
const pourData = () => ({
  processeurs: filtrerParParc(courant.processeurs, base, parcActif, 'processeur'),
  // Fiches d'information (VX4, MCTRL610) : visibles et grisées dans le choix du processeur, hors parc actif.
  informations: parcActif ? [] : courant.informationsProcesseurs,
  // Fiche du SX40, même hors du parc actif : alternative « SX40 + XD » dans Data.
  sx40: courant.processeurs.find((p) => p.id === 'brompton-sx40') ?? null,
  // Convertisseurs et distributeurs des processeurs, et switches des HELIOS (famille switch).
  distributeurs: [...courant.distributeurs, ...(appareils.switches ?? [])],
  sources: courant.sourcesProcesseurs,
  nomParc: nomParc(),
  // Cartes de réception de la base : capacité d'une carte face à la dalle.
  cartesReception: courant.cartesReception,
  // Profondeur réseau par défaut dans le parc actif, par marque.
  bitsParDefaut: Object.fromEntries(['brompton', 'novastar', 'colorlight', 'megapixel', 'linsn', 'kystar', 'mooncell'].map((f) => [f, bitsReseauParc(base, parcActif, f)])),
  // Lots et configs des dalles, version des logiciels relevée dans le parc actif.
  lots: { base, parcId: parcActif },
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

// Chaîne des onglets : Mur → Data → Canvas et Schéma ; Mur → Élec → Schéma ; Mur → Poids.
// Le Schéma renvoie le coin de départ du câblage aux onglets Data et Élec (serpentin au plus juste).
initialiserSchema({
  surDepart: ({ data, elec }) => {
    definirDepartData(data);
    definirDepartElec(elec);
  },
});
if (connectique) {
  initialiserCanvas({ ...connectique, regies: courant.regies, sourcesRegies: courant.sourcesRegies, erreurRegies, appareils });
}
if (depart.processeurs) {
  initialiserData(pourData(), (etat) => {
    if (connectique) donneesModifiees(etat);
    dataModifieePourSchema(etat);
  });
}
initialiserElec(elecModifiePourSchema);
if (depart.dalles) {
  initialiserPoids(courant.bumpers);
  initialiserMur(pourMur(), (etat) => {
    if (depart.processeurs) murModifie(etat);
    murModifiePourElec(etat);
    murModifiePourPoids(etat);
    murModifiePourSchema(etat);
  });
}
initialiserBase({ base, depart, fusion: courant.fusion, parcActif, persistant }, enregistrerBase);

// Mode du mur (accroche ou stack, onglet Poids) : il décide du bord de départ des câbles dans le Schéma.
const formPoids = document.getElementById('form-poids');
const publierModeMur = () => definirModeMur(new FormData(formPoids).get('mode'));
formPoids.addEventListener('change', publierModeMur);
publierModeMur();

// Mire et fiche contenu : écran plein ouvert par le bouton du Mur ou par « mire de l'appli » dans le Dépannage. Monté
// avant la reprise des saisies (son formulaire « form-mire » est gardé avec les autres).
const panneauMire = document.getElementById('mire-fiche');
let ecranMire = null;
let ecranDepannage = null;
function ouvrirMire(section = 'mire') {
  if (!ecranMire) return;
  panneauMire.hidden = false;
  document.body.classList.add('montage-ouvert');
  ecranMire.afficher(section);
  document.getElementById('ecran-mire').scrollTop = 0;
}
function fermerMire() {
  if (panneauMire.hidden) return;
  panneauMire.hidden = true;
  document.body.classList.remove('montage-ouvert');
}

// Fiches « pourquoi » : écran plein au-dessus de l'écran en cours (onglet, mire ou fiche contenu), qui reste en place
// dessous ; « Fermer » ou Échap y revient. Les liens « Pourquoi ? » sont posés après chaque affichage par un observateur
// qui relit les écrans de la table (data/pourquoi-liens.json), sans toucher aux calculs.
const panneauPourquoi = document.getElementById('pourquoi');
let ecranPourquoi = null;
function ouvrirPourquoi(id = null) {
  if (!ecranPourquoi) return;
  if (id) ecranPourquoi.afficherFiche(id);
  else ecranPourquoi.afficherListe();
  panneauPourquoi.hidden = false;
  document.body.classList.add('montage-ouvert');
  document.getElementById('ecran-pourquoi').scrollTop = 0;
}
function fermerPourquoi() {
  if (panneauPourquoi.hidden) return false;
  panneauPourquoi.hidden = true;
  if (panneauMire.hidden) document.body.classList.remove('montage-ouvert');
  return true;
}
if (pourquoi && liensPourquoi) {
  const defilant = document.getElementById('ecran-pourquoi');
  ecranPourquoi = monterPourquoi(defilant, pourquoi, { defiler: () => { defilant.scrollTop = 0; } });
  const relier = () => relierPourquoi(liensPourquoi, { racine: document, ouvrir: ouvrirPourquoi });
  new MutationObserver(relier).observe(document.querySelector('main'), { childList: true, subtree: true });
  new MutationObserver(relier).observe(panneauMire, { childList: true, subtree: true });
  relier();
}
document.getElementById('pourquoi-fermer').addEventListener('click', fermerPourquoi);
if (ficheContenu) {
  ecranMire = monterMireFiche(document.getElementById('ecran-mire'), ficheContenu, {
    contexte: cablageRetenu,
    ouvrirDepannage: (id) => {
      fermerMire();
      location.hash = 'depannage';
      ecranDepannage?.afficher(id);
    },
  });
} else {
  document.getElementById('bouton-mire').hidden = true;
}
document.getElementById('bouton-mire').addEventListener('click', () => ouvrirMire('mire'));
document.getElementById('mire-fermer').addEventListener('click', fermerMire);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fermerPourquoi()) fermerMire(); });
window.addEventListener('hashchange', () => {
  fermerPourquoi();
  fermerMire();
});

// Saisies de la dernière session, puis sauvegarde automatique ; copie des résultats.
await restaurerConfiguration();
suivreConfiguration();
initialiserCopie();

// Dépannage : avec des saisies gardées (un projet), la marque du processeur retenu dans Data déplie ses lignes ; sans
// saisies, l'écran demande la marque. Relu à chaque ouverture de l'onglet.
async function projetDepannage() {
  if (!(await lire('configuration'))) return null;
  const processeur = processeurRetenu();
  return processeur ? { marque: marqueDuProcesseur(processeur), nom: processeur.nom } : null;
}
if (depannage) {
  ecranDepannage = monterDepannage(document.getElementById('ecran-depannage'), depannage,
    {
      projet: await projetDepannage(),
      defiler: () => window.scrollTo(0, 0),
      ouvrirMire: () => ouvrirMire('mire'),
      liensPourquoi: ecranPourquoi ? liensPourquoi.liens : [],
      ouvrirPourquoi: ecranPourquoi ? ouvrirPourquoi : null,
      ouvrirListePourquoi: ecranPourquoi ? () => ouvrirPourquoi() : null,
    });
  window.addEventListener('hashchange', async () => {
    if (location.hash === '#depannage') ecranDepannage.definirProjet(await projetDepannage());
  });
}
// Demandé après le démarrage : certains navigateurs posent la question à l'utilisateur.
demanderStockagePersistant().then((accorde) => {
  persistant = accorde;
  actualiserEcranBase({ base, depart, fusion: courant.fusion, parcActif, persistant });
});
document.getElementById('reglages-defaut').addEventListener('click', () => {
  if (confirm('Remettre toutes les saisies des onglets Mur, Data, Canvas, Élec, Poids et Schéma à leurs valeurs par défaut, et effacer le suivi du montage ? Ta base et tes parcs ne changent pas.')) {
    reglagesParDefaut();
    effacerMontage();
  }
});
