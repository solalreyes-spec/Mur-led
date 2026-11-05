// Point d'entrée de l'appli : charge la base de départ et ma base locale, lance les onglets et gère la navigation.

import { resoudreFiche, listeMateriel, totalMateriel, stockPresta, ErreurSaisie, mur as murDeDalles, evaluerProcesseur } from './calculs.js';
import { el, remplacer } from './dom.js';
import {
  baseVide, fusionner, filtrerParParc, appliquerReglagesParc, bitsReseauParc, migrerFichiersConfig, materielParc, quantitesParc, logicielParc, codeNovaLCT,
  ajouterAuParc, oublierReference, configsDuMur, lotsDalleParc,
} from './fiches.js';
import { lire, ecrire, stockageDisponible, suspendreEcritures, ecrituresSuspendues } from './stockage.js';
import { surveillerOnglets } from './onglets.js';
import { initialiserMur, actualiserMur, signalerErreurMur, resumeOngletMur } from './ecran-mur.js';
import {
  initialiserData, actualiserData, murModifie, definirDepartData, processeurRetenu, resumeOngletData, definirNovaLCT, configsNovaLCT, entreesTerrainData,
} from './ecran-data.js';
import { initialiserCanvas, actualiserRegies, donneesModifiees, resumeOngletCanvas, sourceAffichee, controleAffiche } from './ecran-canvas.js';
import { initialiserElec, murModifiePourElec, definirDepartElec, definirModeElec, resumeOngletElec, resultatElec } from './ecran-elec.js';
import {
  initialiserSchema, murModifiePourSchema, dataModifieePourSchema, elecModifiePourSchema, definirModeMur, effacerMontage, actualiserAffichageSchema, revenirAMaConfig,
  cablageRetenu, sortieModifieePourSchema, chaineModifieePourSchema, definirStockageMontage, rechargerMontage, entreesMateriel, dessinPortNovaLCT,
  etatMontage, ouvrirGuideMontage, panneDalleChoisie, appuiDalleDesactive,
} from './ecran-schema.js';
import { initialiserPoids, actualiserBumpers, murModifiePourPoids, poidsRetenu, resumeOngletPoids } from './ecran-poids.js';
import { initialiserBase, actualiserEcranBase } from './ecran-base.js';
import {
  restaurerConfiguration, suivreConfiguration, reglagesParDefaut, definirSauvegarde, sauverMaintenant, releverDefauts, appliquerConfiguration,
} from './configuration.js';
import * as prestas from './prestas.js';
import { chargerPrestas, creerEnregistreur } from './prestas-appareil.js';
import { monterPrestas, remplirBoutonPresta, fichierExportPresta } from './ecran-prestas.js';
import { monterMateriel } from './ecran-materiel.js';
import { monterFiches } from './ecran-fiches.js';
import { monterNovaLCT, carteNovaLCT, blocDepannageSecours } from './ecran-novalct.js';
import {
  etapesNovaLCT, rapprocherNovaLCT, groupeVideo, versionReference, ficheNovaLCT, texteNovaLCT, resumeNovaLCT, murABlanc, processeursABlanc, MUR_A_BLANC,
  faitesSur,
} from './novalct.js';
import * as terrain from './terrain.js';
import { monterTerrain } from './ecran-terrain.js';
import { texteProcesseurs } from './secours.js';
import { METIERS, ficheMetier, texteFiche, nomFichierFiche } from './fiches-metier.js';
import { pdfFiche } from './pdf.js';
import { enregistrer, fichierTexte } from './export.js';
import { initialiserCopie, copier } from './copie.js';
import { resumeMateriel } from './resumes.js';
import { monterDepannage, marqueDuProcesseur } from './ecran-depannage.js';
import { monterMireFiche } from './ecran-mire.js';
import { monterPourquoi, relierPourquoi } from './pourquoi.js';
import { monterEntrainement } from './ecran-entrainement.js';
import { monterApprendre } from './ecran-apprendre.js';
import { monterPlanning } from './ecran-planning.js';
import { CLE_ORDINATEUR, systemeConnu, marqueConnexion } from './connexion.js';
import { carteConnexion, blocDepannage } from './ecran-connexion.js';
import { FAMILLES_ONGLETS, animerLogo, lireFondIcone, appliquerFondIcone, monterFondIcone, FOND_ICONE_DEFAUT } from './look.js';
import { versionAppli } from './mire.js';

// Hors ligne : le service worker garde les fichiers de l'appli. Il prévient quand une nouvelle version est prête.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (evenement) => {
    if (evenement.data?.type === 'nouvelle-version') document.getElementById('bandeau-maj').hidden = false;
  });
}
document.getElementById('recharger').addEventListener('click', () => location.reload());

// Deux onglets de l'appli (lot du 17/10/2026) : le dernier ouvert prend la main ; celui-ci cesse d'écrire sur
// l'appareil (rien d'écrasé) et le dit, avec « Recharger ici ». Fenêtre principale seulement : une copie dans un
// cadre (bancs qui simulent un rechargement) n'est pas un onglet.
if (window.top === window) {
  surveillerOnglets({
    surRemplace: () => {
      suspendreEcritures();
      document.getElementById('autre-onglet').hidden = false;
      document.body.classList.add('montage-ouvert');
    },
  });
}
document.getElementById('autre-onglet-recharger').addEventListener('click', () => location.reload());

// Mode rouge : toute l'appli en rouge sur noir, gardé pour la prochaine ouverture.
const boutonRouge = document.getElementById('mode-rouge');
function appliquerMode(rouge) {
  if (rouge) document.documentElement.dataset.mode = 'rouge';
  else delete document.documentElement.dataset.mode;
  boutonRouge.setAttribute('aria-pressed', String(rouge));
  document.querySelector('meta[name="theme-color"]').content = rouge ? '#000000' : '#0b0d11';
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

// Mon ordinateur (étape 19a) : Mac ou Windows, gardé sur l'appareil (« mur-led-ordinateur »), Mac la première fois ;
// il sert à Apprendre, au pas à pas NovaLCT et au Dépannage, jamais à une presta (ni exporté ni copié avec elle).
let ordinateur = null;
function lireOrdinateur() {
  if (!ordinateur) {
    try {
      ordinateur = systemeConnu(localStorage.getItem(CLE_ORDINATEUR));
    } catch (erreur) {
      ordinateur = 'mac';
    }
  }
  return ordinateur;
}
function garderOrdinateur(systeme) {
  ordinateur = systemeConnu(systeme);
  try {
    localStorage.setItem(CLE_ORDINATEUR, ordinateur);
  } catch (erreur) {
    // Stockage bloqué : le choix vaut pour cette session.
  }
}

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

const ONGLETS = ['mur', 'data', 'canvas', 'elec', 'poids', 'schema', 'depannage', 'base', 'apprendre', 'planning'];

async function lireJson(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${chemin} introuvable (réponse ${reponse.status})`);
  return reponse.json();
}

function afficherOnglet() {
  const demande = location.hash.slice(1);
  const actif = ONGLETS.includes(demande) ? demande : 'mur';
  // Nouveau look : la racine prend la famille de l'onglet ouvert (en-tête, écrans pleins).
  document.documentElement.dataset.famille = FAMILLES_ONGLETS[actif];
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

// Planning des piges (étape 23, lot 23c1) : monté avant la base, il ne dépend d'aucune donnée du mur. Lecture par le
// relais à l'ouverture de l'appli, au retour sur l'appli et à l'ouverture de l'onglet (si la dernière a plus de 15 min).
// Dalles et processeurs des devis (étape 25, lot 25e1) : reconnus dès que la base est chargée.
let baseDevis = null;
const ecranPlanning = monterPlanning(document.getElementById('ecran-planning'), {
  stockage: { lire, ecrire },
  base: () => baseDevis,
  // Murs préparés depuis un devis (lot 25e2) : presta de l'appli liée au devis, ouverte dans l'onglet Mur ; « Ajouter au
  // parc » change ma base (jamais le nombre dans le parc).
  actions: {
    lien: (lien, noms) => prestas.etatLienDevis(etatPrestas, lien, noms),
    // Presta préparée ou ouverte : onglet Mur, puis l'écran Prestas avec tous ses murs (lot 25e3).
    preparer: async (demande) => {
      await operationPrestas((e) => prestas.preparerMurs(e, { ...demande, parc: demande.parc ?? parcActif }));
      ouvrirPrestasSurMur();
    },
    ouvrir: async (prestaId, murId) => {
      await operationPrestas((e) => prestas.ouvrir(e, prestaId, murId));
      ouvrirPrestasSurMur();
    },
    vu: (prestaId, empreinte) => operationPrestas((e) => prestas.lienDevisVu(e, prestaId, empreinte)),
    ajouterAuParc: (parcId, ajout) => enregistrerBase(ajouterAuParc(base, parcId, ajout)),
    changerDalle: (parcId, ref) => enregistrerBase(oublierReference(base, parcId, ref)),
  },
  surNouvelles: (n) => {
    const pastille = document.querySelector('.onglet[href="#planning"] .pastille-onglet');
    if (!pastille) return;
    pastille.hidden = n === 0;
    pastille.textContent = n > 0 ? String(n) : '';
    pastille.setAttribute('aria-label', n > 1 ? `${n} nouvelles dates` : 'une nouvelle date');
  },
});
if (location.hash === '#planning') ecranPlanning.ouvrir();
window.addEventListener('hashchange', () => {
  if (location.hash === '#planning') ecranPlanning.ouvrir();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (location.hash === '#planning') ecranPlanning.ouvrir();
  else ecranPlanning.lectureAuto();
});

const erreurAlerte = (message) => el('div', { class: 'alerte alerte-erreur', role: 'alert' }, message);

// Logo : animation d'ouverture avant la première attente (étape 24), pour qu'il n'apparaisse pas avant.
animerLogo(document.querySelector('svg.logo-app'));
// Fond de l'icône de l'écran d'accueil choisi dans la Base (étape 24d) : graphite par défaut, déjà écrit dans la page.
if (lireFondIcone() !== FOND_ICONE_DEFAUT) appliquerFondIcone(lireFondIcone());
monterFondIcone(document.querySelector('#carte-icone'));

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

// Procédures de mise en service du cahier des charges (étape 27), pour l'écran Terrain : facultatives (sans elles, les
// étapes gardent leurs valeurs et leurs renvois au Dépannage).
let miseEnService = null;
try {
  miseEnService = await lireJson('data/mise-en-service.json');
} catch (erreur) {
  miseEnService = null;
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

// Questions du mode entraînement (facultatives : sans elles, pas de bouton « S'entraîner »).
let questionsEntrainement = null;
try {
  questionsEntrainement = await lireJson('data/entrainement.json');
} catch (erreur) {
  questionsEntrainement = null;
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
// Prestas (étape 10b) : la presta et le mur ouverts, gardés sur l'appareil (la première fois, la configuration en cours
// devient « Presta sans nom · Mur 1 ») ; le parc actif est celui du mur ouvert.
const chargement = await chargerPrestas();
let etatPrestas = chargement.etat;
const enregistrerPrestas = creerEnregistreur(chargement.migre ? null : etatPrestas);
if (chargement.migre) enregistrerPrestas(etatPrestas);
let parcActif = null;
// Parc du mur ouvert absent de ma base (supprimé depuis) : calcul en « Tous », avec une alerte dans le Mur.
let parcDisparu = null;
function lireParcDuMur() {
  parcActif = prestas.murOuvert(etatPrestas)?.parc ?? null;
  parcDisparu = parcActif && !base.parcs.some((p) => p.id === parcActif) ? parcActif : null;
  if (parcDisparu) parcActif = null;
}
lireParcDuMur();
// Saisies, parc ou suivi du montage du mur ouvert, enregistrés avec lui.
function majMur(champs) {
  const mur = prestas.murOuvert(etatPrestas);
  if (!mur) return;
  etatPrestas = prestas.enregistrerMur(etatPrestas, mur.id, champs);
  enregistrerPrestas(etatPrestas);
}
definirSauvegarde((config) => {
  const mur = prestas.murOuvert(etatPrestas);
  if (mur && JSON.stringify(mur.configuration) !== JSON.stringify(config)) majMur({ configuration: config });
  // Une dalle ou un processeur choisi de nouveau : l'alerte « introuvable » se retire.
  alertesMurOuvert();
  return true;
});
definirStockageMontage({
  lire: async () => prestas.murOuvert(etatPrestas)?.montage ?? null,
  ecrire: async (valeur) => {
    majMur({ montage: valeur });
    return true;
  },
});

// NovaLCT pas à pas (étape 17b) : carte de l'onglet Data quand le processeur retenu se règle dans NovaLCT, écran plein
// ouvert par son bouton (jamais tout seul). Le pas à pas lit le câblage retenu du Schéma, la source de Canvas, les
// configs des lots de Data et la version du parc ; le suivi des étapes est gardé avec le mur ouvert (`novalct`), sans
// marquer la presta modifiée. À l'ouverture, une case dont l'étape a changé est décochée et le bandeau le dit.
const panneauNovaLCT = document.getElementById('novalct');
let resultatNovaLCT = null;
let verrouNovaLCT = null;
// Défilement de la page avant l'ouverture (lot 17b4) : la page remonte en haut, comme pour Prestas, puis revient.
let defilementNovaLCT = 0;
const SUIVI_NOVALCT_VIDE = { version: 1, cases: {}, avis: null };
// À blanc (étape 17c2) : mur d'exemple d'Apprendre, son suivi gardé à part (clé « novalct-a-blanc »), jamais avec un mur.
const CLE_NOVALCT_A_BLANC = 'novalct-a-blanc';
let modeNovaLCT = 'mur';
let aBlancNovaLCT = null;
let suiviABlanc = null;
const suiviDuMur = () => prestas.murOuvert(etatPrestas)?.novalct ?? SUIVI_NOVALCT_VIDE;
const suiviNovaLCT = () => (modeNovaLCT === 'blanc' ? suiviABlanc ?? SUIVI_NOVALCT_VIDE : suiviDuMur());
function garderSuiviNovaLCT(suivi) {
  if (modeNovaLCT === 'blanc') {
    suiviABlanc = suivi;
    Promise.resolve(ecrire(CLE_NOVALCT_A_BLANC, suivi)).catch(() => {});
  } else {
    majMur({ novalct: suivi });
  }
}
const versionNovaLCT = (proc) => logicielParc(base, parcActif, proc.id)?.version ?? null;
// Code admin NovaLCT du parc actif (étape 18a) : le pas à pas ne connaît que le nom du parc, l'écran reçoit le code.
const codeParcNovaLCT = () => codeNovaLCT(base, parcActif);
function parcNovaLCT() {
  const parc = parcActif ? base.parcs.find((p) => p.id === parcActif) : null;
  return parc ? { nom: parc.nom, aCode: Boolean(codeParcNovaLCT()) } : null;
}
function texteVersionNovaLCT(version) {
  const v = versionReference(version);
  return v.note ?? `NovaLCT ${version} dans le parc : noms des menus de la V${v.premiere} en premier.`;
}
function etatCarteNovaLCT() {
  const n = Object.keys(suiviDuMur().cases ?? {}).length;
  return n === 0 ? 'Aucune étape cochée.' : `${n} ${n > 1 ? 'étapes cochées' : 'étape cochée'}.`;
}
function majCarteNovaLCT() {
  const etat = document.querySelector('.nl-carte .nl-etat');
  if (etat) etat.textContent = etatCarteNovaLCT();
}
function pasAPasNovaLCT() {
  const c = cablageRetenu();
  if (!c?.evaluation || c.evaluation.processeur.logiciel !== 'NovaLCT') return null;
  const courbe = (c.mur.saisie?.zones ?? []).some((z) => z.courbure || z.pose?.type === 'pliee');
  return etapesNovaLCT({
    mur: c.mur, dalle: c.dalle, evaluation: c.evaluation, variante: c.variante, source: sourceAffichee(), configs: configsNovaLCT(),
    version: versionNovaLCT(c.evaluation.processeur), pliage: c.pliage, courbe, parc: parcNovaLCT(), systeme: lireOrdinateur(),
  });
}
function enregistrerNovaLCT(suivi) {
  garderSuiviNovaLCT(suivi);
  if (resultatNovaLCT && !panneauNovaLCT.hidden) {
    ecranNovaLCT.afficher({ resultat: resultatNovaLCT, cases: suivi?.cases ?? {}, avis: suivi?.avis ?? null, note: modeNovaLCT === 'blanc' ? aBlancNovaLCT?.description : null, code: codeParcNovaLCT() });
  }
  majCarteNovaLCT();
}
async function garderEcranNovaLCT() {
  try {
    verrouNovaLCT = (await navigator.wakeLock?.request?.('screen')) ?? null;
  } catch (erreur) {
    verrouNovaLCT = null;
  }
}
const nomsNovaLCT = () => (modeNovaLCT === 'blanc' ? { presta: 'Révision à blanc', mur: 'Mur d\'exemple' }
  : { presta: prestas.prestaOuverte(etatPrestas)?.nom ?? '', mur: prestas.murOuvert(etatPrestas)?.nom ?? '' });
// Renvoie false quand le mur ouvert n'a pas de pas à pas NovaLCT.
function ouvrirNovaLCT() {
  modeNovaLCT = 'mur';
  aBlancNovaLCT = null;
  const r = pasAPasNovaLCT();
  if (r) ouvrirPasAPas(r);
  return Boolean(r);
}
// À blanc : le mur d'exemple de la base (processeur, redondance, secours et liaison choisis dans Apprendre), son suivi
// relu à part. Sans mur d'exemple (série H en cascade…), renvoie la raison, affichée dans la carte d'Apprendre.
async function ouvrirNovaLCTABlanc({ processeur, redondance, secours = 'ports', liaisonSecours = 'sansCascade' }) {
  const a = murABlanc({
    dalles: courant.dalles, processeurs: courant.processeurs, liaisons: connectique?.liaisons ?? [], processeur, redondance, secours, liaisonSecours,
    parc: parcNovaLCT(), systeme: lireOrdinateur(),
  });
  if (!a) {
    const proc = courant.processeurs.find((p) => p.id === processeur);
    const dalle = courant.dalles.find((d) => d.id === MUR_A_BLANC.dalle);
    const e = proc && dalle ? evaluerProcesseur(murDeDalles(dalle, MUR_A_BLANC.colonnes, MUR_A_BLANC.lignes), dalle, proc,
      { frequenceHz: MUR_A_BLANC.frequenceHz, bits: MUR_A_BLANC.bits, redondance, secours, liaisonSecours }) : null;
    return e?.impossible ?? 'Pas de mur d\'exemple pour ce choix.';
  }
  try {
    suiviABlanc = (await lire(CLE_NOVALCT_A_BLANC)) ?? SUIVI_NOVALCT_VIDE;
  } catch (erreur) {
    suiviABlanc = SUIVI_NOVALCT_VIDE;
  }
  modeNovaLCT = 'blanc';
  aBlancNovaLCT = a;
  ouvrirPasAPas(a.resultat);
}
function ouvrirPasAPas(r) {
  const avant = suiviNovaLCT();
  const rapproche = rapprocherNovaLCT(avant.cases, r);
  const suivi = { version: 1, cases: rapproche.cases, avis: rapproche.texte ?? avant.avis ?? null };
  resultatNovaLCT = r;
  ecranNovaLCT.revenirAuDebut();
  defilementNovaLCT = window.scrollY;
  window.scrollTo(0, 0);
  panneauNovaLCT.hidden = false;
  document.body.classList.add('montage-ouvert');
  if (JSON.stringify(suivi) !== JSON.stringify(avant)) enregistrerNovaLCT(suivi);
  else ecranNovaLCT.afficher({ resultat: r, cases: suivi.cases, avis: suivi.avis, note: modeNovaLCT === 'blanc' ? aBlancNovaLCT.description : null, code: codeParcNovaLCT() });
  document.getElementById('ecran-novalct').scrollTop = 0;
  garderEcranNovaLCT();
}
function fermerNovaLCT() {
  if (panneauNovaLCT.hidden) return false;
  panneauNovaLCT.hidden = true;
  resultatNovaLCT = null;
  modeNovaLCT = 'mur';
  aBlancNovaLCT = null;
  document.body.classList.remove('montage-ouvert');
  window.scrollTo(0, defilementNovaLCT);
  try {
    verrouNovaLCT?.release?.();
  } catch (erreur) {
    // Rien à faire : le navigateur a déjà relâché l'écran.
  }
  verrouNovaLCT = null;
  majCarteNovaLCT();
  return true;
}
const ecranNovaLCT = monterNovaLCT(document.getElementById('ecran-novalct'), {
  actions: {
    // L'écran a déjà mis la case à jour : l'enregistrement attend la fin de l'appui, sans redessiner (lot 17b4).
    cocher: async (id, signature) => {
      await new Promise((fin) => setTimeout(fin, 0));
      const s = suiviNovaLCT();
      const cases = { ...s.cases };
      if (signature) cases[id] = signature;
      else delete cases[id];
      garderSuiviNovaLCT({ ...s, cases });
      majCarteNovaLCT();
    },
    fermer: () => fermerNovaLCT(),
    // Texte copié et PDF du pas à pas (étape 17c1) : presta et mur ouverts, cases du suivi.
    copier: async () => copier(texteNovaLCT(resultatNovaLCT, suiviNovaLCT().cases, nomsNovaLCT())),
    pdf: async () => {
      const { presta, mur } = nomsNovaLCT();
      const nom = prestas.nomFichierPresta(`${presta} ${mur}`).replace(/^mur-led-presta-/, 'mur-led-novalct-').replace(/\.json$/, '.pdf');
      return enregistrer(new File([pdfFiche(ficheNovaLCT(resultatNovaLCT, suiviNovaLCT().cases, nomsNovaLCT()))], nom, { type: 'application/pdf' }), nom);
    },
    compris: async () => enregistrerNovaLCT({ ...suiviNovaLCT(), avis: null }),
    toutDecocher: async () => enregistrerNovaLCT({ ...SUIVI_NOVALCT_VIDE }),
    dessinPort: (etape) => dessinPortNovaLCT(etape.id, modeNovaLCT === 'blanc' ? aBlancNovaLCT : null),
    // Étape 0.3 (19a) : la fiche « Brancher l'ordinateur au processeur » d'Apprendre.
    ouvrirConnexion: () => {
      fermerNovaLCT();
      allerConnexion();
    },
  },
});
definirNovaLCT((choisie) => carteNovaLCT({
  processeur: choisie.processeur.modele, nombre: choisie.nombre, titre: texteProcesseurs(choisie), groupe: groupeVideo(choisie.processeur)?.id ?? null,
  version: texteVersionNovaLCT(versionNovaLCT(choisie.processeur)), etat: etatCarteNovaLCT(),
}, { ouvrir: ouvrirNovaLCT }));
document.getElementById('novalct-fermer').addEventListener('click', fermerNovaLCT);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fermerNovaLCT()) e.stopPropagation();
}, true);
window.addEventListener('hashchange', fermerNovaLCT);
document.addEventListener('visibilitychange', () => { if (!panneauNovaLCT.hidden && document.visibilityState === 'visible') garderEcranNovaLCT(); });

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
// Dalles, processeurs et parcs pour les devis du planning ; parc de chaque boîte (lot 25e2) : nombre dans le parc et
// profondeur réseau de chaque marque.
const FAMILLES_BITS = ['brompton', 'novastar', 'colorlight', 'megapixel', 'linsn', 'kystar', 'mooncell'];
const pourDevis = () => ({
  dalles: courant.dalles, processeurs: courant.processeurs, informationsProcesseurs: courant.informationsProcesseurs, parcs: base.parcs,
  contexteParc: (id) => ({ quantites: quantitesParc(base, id), bitsParFamille: Object.fromEntries(FAMILLES_BITS.map((f) => [f, bitsReseauParc(base, id, f).bits])) }),
});
baseDevis = pourDevis();
ecranPlanning.rafraichirBase();
const nomParc = () => base.parcs.find((p) => p.id === parcActif)?.nom ?? null;
// Dalles vues dans le parc actif : carte de réception et fichier de config réglés pour ce parc.
const pourMur = () => {
  const dalles = courant.dalles.map((d) => appliquerReglagesParc(d, base, parcActif));
  return {
    dalles, gabarits: courant.gabarits, informations: courant.informations, visibles: filtrerParParc(dalles, base, parcActif, 'dalle'), nomParc: nomParc(),
    // Lots et configs des dalles dans le parc actif.
    lots: { base, parcId: parcActif },
    stock: stockDuMur(),
  };
};
// Stock du parc actif pour le mur ouvert (étape 15b) : lots du parc, listes gardées des autres murs de la presta du même
// parc, spare de la presta ; null en « Tous ».
function stockDuMur() {
  const parc = base.parcs.find((p) => p.id === parcActif);
  const presta = prestas.prestaOuverte(etatPrestas);
  if (!parc || !presta) return null;
  const ouvert = etatPrestas.index.ouverte?.mur;
  const autres = presta.murs.filter((m) => m.id !== ouvert && etatPrestas.murs[m.id]?.parc === parcActif)
    .map((m) => ({ nom: m.nom, liste: prestas.listeGardee(etatPrestas, m.id)?.liste ?? null }));
  return { parc: { nom: parc.nom, lots: parc.lots ?? {} }, autres, sparesPourcent: prestas.materielPresta(presta).sparesPourcent };
}
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
  bitsParDefaut: Object.fromEntries(FAMILLES_BITS.map((f) => [f, bitsReseauParc(base, parcActif, f)])),
  // Lots et configs des dalles, version des logiciels relevée dans le parc actif.
  lots: { base, parcId: parcActif },
  // Nombre de chaque processeur dans le parc actif (étape 15c).
  quantites: quantitesParc(base, parcActif),
});

// Après chaque changement de ma base ou du parc actif : tous les onglets suivent.
function appliquer() {
  courant = construire();
  baseDevis = pourDevis();
  ecranPlanning.rafraichirBase();
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
  if (parcActif && !base.parcs.some((p) => p.id === parcActif)) {
    parcActif = null;
    await ecrire('parc-actif', null);
    majMur({ parc: null });
  }
  const ok = await ecrire('base-utilisateur', base);
  appliquer();
  return ok;
}

for (const select of selecteursParc) {
  select.addEventListener('change', async () => {
    parcActif = select.value || null;
    parcDisparu = null;
    await ecrire('parc-actif', parcActif);
    majMur({ parc: parcActif });
    appliquer();
    alertesMurOuvert();
  });
}
remplirParcs();

// Chaîne des onglets : Mur → Data → Canvas et Schéma ; Mur → Élec → Schéma ; Mur → Poids.
// Le Schéma renvoie le coin de départ du câblage aux onglets Data et Élec (serpentin au plus juste).
initialiserSchema({
  surDepart: ({ data, elec, margeMou }) => {
    definirDepartData(data);
    definirDepartElec(elec, { margeMou });
  },
  // Bouton « Terrain » de la barre du dessin (étape 27) : le mur ouvert, calculs déjà prêts.
  surTerrain: () => ouvrirTerrain(),
  // « Signaler une panne » sous la fiche d'une dalle (lot 27c) : Terrain sur le formulaire, dalle, port et ligne copiés.
  surPanne: () => {
    const saisie = panneDalleChoisie();
    if (saisie) ouvrirTerrain({ panne: saisie });
  },
});
if (connectique) {
  initialiserCanvas({ ...connectique, regies: courant.regies, sourcesRegies: courant.sourcesRegies, erreurRegies, appareils },
    { surSortieModifiee: sortieModifieePourSchema, surChaineModifiee: chaineModifieePourSchema });
}
if (depart.processeurs) {
  initialiserData(pourData(), (etat) => {
    if (connectique) donneesModifiees(etat);
    dataModifieePourSchema(etat);
  }, { surConfigImposee: () => revenirAMaConfig('data') });
}
// Config imposée changée (étape 18c) : le Schéma revient à « Ma config ».
initialiserElec(elecModifiePourSchema, { surConfigImposee: () => revenirAMaConfig('elec') });
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
// Il décide aussi de la pose des boîtiers 32 A tri de la distribution (Élec) : sur le pont, ou au sol derrière le mur.
const publierModeMur = () => {
  const mode = new FormData(formPoids).get('mode');
  definirModeMur(mode);
  definirModeElec(mode);
};
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
  if (!id) {
    allerApprendre();
    return;
  }
  ecranPourquoi.afficherFiche(id);
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
// Onglet Apprendre (il remplace la liste des fiches) : tout ce qui menait à la liste y mène, écrans pleins fermés.
let ecranApprendre = null;
function allerApprendre() {
  fermerEntrainement();
  fermerPourquoi();
  fermerMire();
  ecranApprendre?.afficherAccueil();
  location.hash = 'apprendre';
}
// Fiche « Brancher l'ordinateur au processeur » (étape 19a), depuis le pas à pas ou le Dépannage : onglet Apprendre,
// la carte à l'écran, après le retour en haut de page que fait le changement d'onglet.
function allerConnexion() {
  const deja = location.hash === '#apprendre';
  if (!deja) window.addEventListener('hashchange', () => ecranApprendre?.afficherConnexion(), { once: true });
  allerApprendre();
  if (deja) ecranApprendre?.afficherConnexion();
}
// Processeur de la fiche : celui retenu dans Data quand un mur a des saisies, sa marque et son modèle ; sinon « Toutes ».
function processeurConnexion() {
  const p = prestas.murOuvert(etatPrestas)?.configuration ? processeurRetenu() : null;
  return { marque: marqueConnexion(p) ?? 'toutes', modele: p?.id ?? null };
}
const carteConnexionAppli = () => carteConnexion({
  systeme: lireOrdinateur(), garderSysteme: garderOrdinateur, ...processeurConnexion(), copier: (texte) => copier(texte),
  pdf: async (feuille) => {
    const nom = `mur-led-connexion-${new Date().toISOString().slice(0, 10)}.pdf`;
    return enregistrer(new File([pdfFiche(feuille)], nom, { type: 'application/pdf' }), nom);
  },
});
// Mode entraînement : écran plein au-dessus de l'onglet Apprendre ; « Fermer » ou Échap y ramène, et ses 67 points
// suivent la séance. « Séance du jour » et « Les 5 essentiels » lancent la séance ; « Par famille » ouvre l'accueil du
// mode, familles dépliées (« Effacer ma progression » y reste, en bas).
const panneauEntrainement = document.getElementById('entrainement');
const defilantEntrainement = document.getElementById('ecran-entrainement');
let ecranEntrainement = null;
function ouvrirEntrainement(mode = null) {
  if (!ecranEntrainement) return;
  if (mode === 'jour' || mode === 'essentiels') ecranEntrainement.demarrer(mode);
  else ecranEntrainement.afficherAccueil({ familles: mode === 'famille' });
  panneauEntrainement.hidden = false;
  document.body.classList.add('montage-ouvert');
  defilantEntrainement.scrollTop = 0;
}
function fermerEntrainement() {
  if (panneauEntrainement.hidden) return false;
  panneauEntrainement.hidden = true;
  if (panneauPourquoi.hidden && panneauMire.hidden) document.body.classList.remove('montage-ouvert');
  ecranApprendre?.actualiser();
  return true;
}
if (pourquoi && questionsEntrainement) {
  ecranEntrainement = monterEntrainement(defilantEntrainement, {
    donnees: questionsEntrainement,
    pourquoi,
    stockage: { lire, ecrire, disponible: stockageDisponible },
    fermer: fermerEntrainement,
    defiler: () => { defilantEntrainement.scrollTop = 0; },
  });
}
document.getElementById('entrainement-fermer').addEventListener('click', fermerEntrainement);
if (pourquoi && liensPourquoi) {
  const defilant = document.getElementById('ecran-pourquoi');
  ecranPourquoi = monterPourquoi(defilant, pourquoi, {
    defiler: () => { defilant.scrollTop = 0; },
    ouvrirListe: allerApprendre,
  });
  const relier = () => relierPourquoi(liensPourquoi, { racine: document, ouvrir: ouvrirPourquoi });
  new MutationObserver(relier).observe(document.querySelector('main'), { childList: true, subtree: true });
  new MutationObserver(relier).observe(panneauMire, { childList: true, subtree: true });
  relier();
}
document.getElementById('pourquoi-fermer').addEventListener('click', fermerPourquoi);
if (pourquoi) {
  ecranApprendre = monterApprendre(document.getElementById('ecran-apprendre'), {
    pourquoi,
    entrainement: questionsEntrainement,
    stockage: { lire, ecrire },
    ouvrirFiche: ouvrirPourquoi,
    ouvrirEntrainement,
    // Étape 18b : tous les processeurs de la base réglés dans NovaLCT (base de départ et mes fiches).
    novalct: { ouvrir: ouvrirNovaLCTABlanc, processeurs: processeursABlanc(courant.processeurs) },
    // Étape 19a : la fiche « Brancher l'ordinateur au processeur », refaite à chaque ouverture de l'onglet.
    connexion: { carte: carteConnexionAppli },
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#apprendre') ecranApprendre.actualiserConnexion();
  });
} else {
  remplacer(document.getElementById('ecran-apprendre'), erreurAlerte('Fiches « pourquoi » introuvables : l\'onglet Apprendre ne peut pas s\'afficher.'));
}
// Version de l'appli à droite du titre : celle du cache qui sert l'appli.
// Son numéro est aussi écrit dans le fichier d'une presta exportée.
let numeroVersion = null;
versionAppli().then((v) => {
  document.getElementById('version-appli').textContent = v ?? '';
  numeroVersion = Number(/\d+/.exec(v ?? '')?.[0]) || null;
});
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
// Échap ferme l'écran du dessus : le mode entraînement, puis la fiche ou la liste des fiches, puis la mire.
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fermerEntrainement() && !fermerPourquoi()) fermerMire(); });
window.addEventListener('hashchange', () => {
  fermerEntrainement();
  fermerPourquoi();
  fermerMire();
});

// Mur ouvert : alertes quand son parc, sa dalle ou son processeur manquent sur cet appareil.
function alertesMurOuvert() {
  const f = prestas.murOuvert(etatPrestas)?.configuration?.formulaires ?? {};
  const lignes = [];
  if (parcDisparu) lignes.push('Le parc de ce mur n\'existe plus sur cet appareil : calcul avec toutes les fiches (« Tous »).');
  const connue = (id) => [...courant.dalles, ...courant.gabarits].some((d) => d.id === id);
  const dalle = f['form-mur']?.dalle;
  if (dalle && !connue(dalle)) lignes.push(`Dalle de ce mur introuvable sur cet appareil : ${dalle}.`);
  // Mode Zones : la dalle propre de chaque zone (mur mixte).
  if (f['form-mur']?.mode === 'zones') {
    let zones = [];
    try {
      zones = JSON.parse(f['form-mur'].zones || '{}').zones ?? [];
    } catch (erreur) {
      zones = [];
    }
    for (const z of zones) if (z.dalleId && !connue(z.dalleId)) lignes.push(`Dalle de la zone ${z.nom} introuvable sur cet appareil : ${z.dalleId}.`);
  }
  const processeur = f['form-data']?.processeur;
  if (processeur && !/^conseil/.test(processeur) && !courant.processeurs.some((x) => x.id === processeur)) {
    lignes.push(`Processeur de ce mur introuvable sur cet appareil : ${processeur}.`);
  }
  remplacer(document.getElementById('alertes-mur-ouvert'), lignes.map((t) => el('div', { class: 'alerte' }, t)));
}

// Bouton « Presta · Mur » de l'en-tête et écran Prestas.
const boutonPresta = document.getElementById('bouton-presta');
const actualiserBoutonPresta = () => remplirBoutonPresta(boutonPresta, { presta: prestas.prestaOuverte(etatPrestas), mur: prestas.murOuvert(etatPrestas) });
const panneauPrestas = document.getElementById('prestas');
let ecranPrestas = null;

// Un autre mur ouvert : son parc, ses saisies (réglages par défaut d'abord) et son suivi du montage.
async function ouvrirMurCourant() {
  lireParcDuMur();
  await ecrire('parc-actif', parcActif);
  appliquer();
  await appliquerConfiguration(prestas.murOuvert(etatPrestas)?.configuration ?? null);
  await rechargerMontage();
  alertesMurOuvert();
}
// Liste de matériel du mur ouvert (étape 13b) : calculée sur les résultats affichés (Mur, Data, câblage retenu du
// Schéma, distribution d'Élec, Poids) et gardée avec lui. Calculée à l'ouverture de Prestas ou de Matériel et avant de
// changer de mur, jamais pendant la frappe. Mur invalide : rien de changé. Aux mêmes moments, les textes copiés des
// onglets pour les fiches par métier (étape 14b) ; un onglet au calcul non valide garde null (la fiche le dit).
function garderListeMurOuvert() {
  const mur = prestas.murOuvert(etatPrestas);
  if (!mur) return;
  const textes = { mur: resumeOngletMur(), data: resumeOngletData(), canvas: resumeOngletCanvas(), elec: resumeOngletElec(), poids: resumeOngletPoids() };
  // Pas à pas NovaLCT (étape 17c1) : son résumé pour la fiche régie, quand le processeur du mur se règle dans NovaLCT.
  const pasAPas = pasAPasNovaLCT();
  if (pasAPas) textes.novalct = resumeNovaLCT(pasAPas, suiviNovaLCT().cases);
  const avecTextes = prestas.enregistrerFicheMur(etatPrestas, mur.id, textes);
  if (avecTextes !== etatPrestas) {
    etatPrestas = avecTextes;
    enregistrerPrestas(etatPrestas);
  }
  let liste = null;
  try {
    const entrees = entreesMateriel();
    if (entrees) {
      liste = listeMateriel({
        ...entrees, poids: poidsRetenu(), parc: materielParc(base, parcActif),
        sparesPourcent: prestas.materielPresta(prestas.prestaOuverte(etatPrestas)).sparesPourcent,
      });
    }
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
  }
  if (!liste) return;
  const apres = prestas.enregistrerListeMur(etatPrestas, mur.id, liste);
  if (apres !== etatPrestas) {
    etatPrestas = apres;
    enregistrerPrestas(etatPrestas);
  }
}
// Opération sur les prestas (prestas.js) : les saisies en attente vont d'abord au mur ouvert ; une erreur de saisie
// remonte à l'écran Prestas, qui l'affiche.
async function operationPrestas(calcul) {
  sauverMaintenant();
  garderListeMurOuvert();
  const avant = etatPrestas;
  etatPrestas = calcul(avant);
  enregistrerPrestas(etatPrestas);
  if (etatPrestas.index.ouverte.mur !== avant.index.ouverte.mur) await ouvrirMurCourant();
  actualiserBoutonPresta();
  ecranPrestas?.afficher(etatPrestas, { persistant });
}
// Écran Prestas sur l'onglet Mur (murs préparés depuis un devis, lot 25e3) : un changement d'onglet ferme l'écran
// Prestas, il s'ouvre donc après.
function ouvrirPrestasSurMur() {
  if (location.hash === '#mur') {
    ouvrirPrestas();
    return;
  }
  window.addEventListener('hashchange', () => ouvrirPrestas(), { once: true });
  location.hash = 'mur';
}
function fermerPrestas() {
  if (panneauPrestas.hidden) return false;
  panneauPrestas.hidden = true;
  document.body.classList.remove('montage-ouvert');
  return true;
}
function ouvrirPrestas() {
  sauverMaintenant();
  garderListeMurOuvert();
  ecranPrestas.afficher(etatPrestas, { persistant, ouverture: true });
  panneauPrestas.hidden = false;
  document.body.classList.add('montage-ouvert');
  document.getElementById('ecran-prestas').scrollTop = 0;
}
const nomDalle = (id) => [...courant.dalles, ...courant.gabarits].find((d) => d.id === id)?.nom ?? null;
const nomParcDe = (id) => base.parcs.find((p) => p.id === id)?.nom ?? null;
ecranPrestas = monterPrestas(document.getElementById('ecran-prestas'), {
  resumeMur: (m) => prestas.resumeMur(m, { nomDalle, nomParc: nomParcDe }),
  proportionsMur: (m) => prestas.proportionsMur(m, { ficheDalle: (id) => courant.dalles.find((x) => x.id === id) ?? null }),
  actions: {
    // Ouvrir une presta ou un mur ferme l'écran : on revient au mur.
    ouvrir: async (id, murId = null) => {
      await operationPrestas((e) => prestas.ouvrir(e, id, murId));
      fermerPrestas();
    },
    // Nouveau mur, nouvelle presta : le parc actif (« Tous » quand celui du mur ouvert a disparu).
    creerPresta: () => operationPrestas((e) => prestas.creerPresta(e, { parc: parcActif })),
    modifierPresta: (id, infos) => operationPrestas((e) => prestas.modifierPresta(e, id, infos)),
    ajouterMur: (id) => operationPrestas((e) => prestas.ajouterMur(e, id, { parc: parcActif })),
    renommerMur: (id, murId, nom) => operationPrestas((e) => prestas.renommerMur(e, id, murId, nom)),
    dupliquerMur: (id, murId) => operationPrestas((e) => prestas.dupliquerMur(e, id, murId)),
    supprimerMur: (id, murId) => operationPrestas((e) => prestas.supprimerMur(e, id, murId)),
    dupliquerPresta: (id) => operationPrestas((e) => prestas.dupliquerPresta(e, id)),
    archiverPresta: (id, archivee) => operationPrestas((e) => prestas.archiverPresta(e, id, archivee)),
    supprimerPresta: (id) => operationPrestas((e) => prestas.supprimerPresta(e, id)),
    materielMur: async (id, murId) => ouvrirMateriel(id, murId),
    // « Terrain » de la carte du mur (étape 27) : ce mur ouvert (Prestas se ferme), puis sa check-list, ses calculs prêts.
    terrain: async (id, murId) => {
      await operationPrestas((e) => prestas.ouvrir(e, id, murId));
      fermerPrestas();
      await ouvrirTerrain();
    },
    materielPresta: async (id) => ouvrirMateriel(id, null),
    fichesPresta: async (id) => ouvrirFiches(id),
    // Export : feuille de partage ou téléchargement, sans attente avant (Safari n'ouvre la feuille qu'en réponse
    // directe à un appui) ; la date d'export n'est gardée que si le fichier est parti.
    exporter: async (id) => {
      sauverMaintenant();
      const { donnees } = prestas.exporterPresta(etatPrestas, id, base, { versionAppli: numeroVersion, depart });
      const fichier = fichierExportPresta(donnees);
      const mode = await enregistrer(fichier, fichier.name);
      if (mode !== 'annule') await operationPrestas((e) => prestas.exporterPresta(e, id, base, { versionAppli: numeroVersion, depart }).etat);
      return mode;
    },
    verifierImport: async (texte) => {
      sauverMaintenant();
      return prestas.verifierImportPresta(texte, etatPrestas, base, depart, { symptomes: depannage ? terrain.symptomesPanne(depannage) : null });
    },
    // Import : ma base d'abord (fiches et parcs du fichier), puis la presta, ouverte.
    importer: async (texte, choix) => {
      sauverMaintenant();
      const r = prestas.importerPresta(etatPrestas, base, depart, texte, choix, { symptomes: depannage ? terrain.symptomesPanne(depannage) : null });
      if (r.erreurs.length) throw new Error(r.erreurs[0]);
      if (r.base !== base) await enregistrerBase(r.base);
      await operationPrestas(() => r.etat);
      return r.rapport;
    },
  },
});
// Écran Matériel (étape 13b) : au-dessus de Prestas, qui reste ouvert dessous ; « Fermer » ou Échap y revient.
const panneauMateriel = document.getElementById('materiel');
let vueMateriel = null;
// Total de la presta (étape 13c) : les listes gardées de ses murs, ses ajouts à la main.
const totalDe = (presta) => totalMateriel(presta.murs.map((m) => ({ nom: m.nom, liste: prestas.listeGardee(etatPrestas, m.id)?.liste ?? null })),
  { ajouts: prestas.ajoutsPresta(presta) });
// Total de la presta contre le stock de chaque parc (étape 15b).
const stockDe = (presta) => stockPresta(presta.murs.map((m) => ({ nom: m.nom, parc: etatPrestas.murs[m.id]?.parc ?? null, liste: prestas.listeGardee(etatPrestas, m.id)?.liste ?? null })),
  base.parcs);
// Ce que montre l'écran Matériel : un mur, ou le total de la presta (murId null), et son texte copié.
function contenuMateriel() {
  const presta = etatPrestas.index.prestas.find((p) => p.id === vueMateriel?.prestaId);
  if (!presta) return null;
  const pourcent = prestas.materielPresta(presta).sparesPourcent;
  if (vueMateriel.murId === null) {
    const total = totalDe(presta);
    const stock = stockDe(presta);
    const { cochees, changees } = prestas.rapprocherCoches(presta, total);
    return {
      presta, total, stock, coches: cochees, changees, pourcent,
      texte: () => resumeMateriel({ titre: `${presta.nom}, total de ${presta.murs.length > 1 ? `${presta.murs.length} murs` : '1 mur'}`, total, sparesPourcent: pourcent, coches: cochees, stock }),
    };
  }
  const mur = presta.murs.find((m) => m.id === vueMateriel.murId);
  if (!mur) return null;
  const gardee = prestas.listeGardee(etatPrestas, mur.id);
  return {
    presta, mur, gardee, pourcent, ouvert: etatPrestas.index.ouverte?.mur === mur.id,
    texte: () => (gardee ? resumeMateriel({ titre: `${presta.nom} · ${mur.nom}`, liste: gardee.liste, sparesPourcent: pourcent }) : ''),
  };
}
function afficherMateriel() {
  if (!vueMateriel) return;
  const c = contenuMateriel();
  if (!c) {
    fermerMateriel();
    return;
  }
  if (c.total) ecranMateriel.afficherPresta(c);
  else ecranMateriel.afficherMur(c);
}
// Check-list et ajouts : enregistrés tout de suite, l'écran Prestas suit.
function majMateriel(calcul) {
  etatPrestas = calcul(etatPrestas);
  enregistrerPrestas(etatPrestas);
  ecranPrestas?.afficher(etatPrestas, { persistant });
  afficherMateriel();
}
function ouvrirMateriel(prestaId, murId = null) {
  sauverMaintenant();
  const ouverte = etatPrestas.index.ouverte;
  if (ouverte?.mur === murId || (murId === null && ouverte?.presta === prestaId)) garderListeMurOuvert();
  vueMateriel = { prestaId, murId };
  afficherMateriel();
  panneauMateriel.hidden = false;
  document.body.classList.add('montage-ouvert');
  document.getElementById('ecran-materiel').scrollTop = 0;
}
function fermerMateriel() {
  if (panneauMateriel.hidden) return false;
  panneauMateriel.hidden = true;
  vueMateriel = null;
  if (panneauPrestas.hidden) document.body.classList.remove('montage-ouvert');
  return true;
}
const ecranMateriel = monterMateriel(document.getElementById('ecran-materiel'), {
  actions: {
    reglerSpares: async (prestaId, valeur) => {
      await operationPrestas((e) => prestas.reglerMaterielPresta(e, prestaId, { sparesPourcent: valeur }));
      if (etatPrestas.index.ouverte?.presta === prestaId) {
        garderListeMurOuvert();
        // Stock du Mur : besoin recompté avec le nouveau spare.
        if (depart.dalles) actualiserMur(pourMur());
      }
      afficherMateriel();
    },
    ouvrirMur: async (prestaId, murId) => {
      await operationPrestas((e) => prestas.ouvrir(e, prestaId, murId));
      garderListeMurOuvert();
      afficherMateriel();
    },
    cocher: async (prestaId, cle, quantite) => majMateriel((e) => prestas.cocherLigne(e, prestaId, cle, quantite)),
    toutDecocher: async (prestaId) => majMateriel((e) => prestas.toutDecocher(e, prestaId)),
    compris: async (prestaId) => majMateriel((e) => prestas.oublierCochesChangees(e, prestaId, totalDe(e.index.prestas.find((p) => p.id === prestaId)))),
    ajouter: async (prestaId, ajout) => majMateriel((e) => prestas.ajouterAjout(e, prestaId, ajout)),
    retirerAjout: async (prestaId, id) => majMateriel((e) => prestas.retirerAjout(e, prestaId, id)),
    copier: async () => copier(contenuMateriel()?.texte() ?? ''),
    // Partage : feuille de partage ou téléchargement, sans attente avant (Safari n'ouvre la feuille qu'en réponse directe
    // à un appui).
    partager: async () => {
      const c = contenuMateriel();
      const nom = prestas.nomFichierMateriel(c.mur ? `${c.presta.nom} ${c.mur.nom}` : c.presta.nom);
      return enregistrer(fichierTexte(c.texte(), nom, 'text/plain'), nom);
    },
  },
});
document.getElementById('materiel-fermer').addEventListener('click', fermerMateriel);
// Échap ferme d'abord Matériel, sans fermer Prestas dessous.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fermerMateriel()) e.stopPropagation();
}, true);
window.addEventListener('hashchange', fermerMateriel);
// Écran Fiches (étape 14c) : au-dessus de Prestas, qui reste ouvert dessous ; « Fermer » ou Échap y revient. Le métier
// choisi est gardé sur l'appareil (localStorage « mur-led-metier »), Rigger la première fois.
const panneauFiches = document.getElementById('fiches');
const CLE_METIER = 'mur-led-metier';
let vueFiches = null;
function metierGarde() {
  try {
    const m = localStorage.getItem(CLE_METIER);
    return METIERS.some((x) => x.id === m) ? m : METIERS[0].id;
  } catch (erreur) {
    return METIERS[0].id;
  }
}
// Fiche du métier choisi : textes et listes gardés de chaque mur de la presta, total de matériel.
function contenuFiches() {
  const presta = etatPrestas.index.prestas.find((p) => p.id === vueFiches?.prestaId);
  if (!presta) return null;
  // Pannes de chaque mur (lot 27d) : le carnet de la fiche du chef de projet.
  const murs = presta.murs.map((m) => ({
    id: m.id, nom: m.nom, fiche: prestas.ficheGardee(etatPrestas, m.id), materiel: prestas.listeGardee(etatPrestas, m.id), pannes: terrain.pannesDe(prestas.terrainMur(etatPrestas, m.id)),
  }));
  return { presta, metier: vueFiches.metier, fiche: ficheMetier(vueFiches.metier, { presta, murs, total: totalDe(presta), stock: stockDe(presta), depannage }) };
}
function afficherFiches() {
  const c = contenuFiches();
  if (!c) {
    fermerFiches();
    return;
  }
  ecranFiches.afficher(c);
}
function ouvrirFiches(prestaId) {
  sauverMaintenant();
  if (etatPrestas.index.ouverte?.presta === prestaId) garderListeMurOuvert();
  vueFiches = { prestaId, metier: metierGarde() };
  afficherFiches();
  panneauFiches.hidden = false;
  document.body.classList.add('montage-ouvert');
  document.getElementById('ecran-fiches').scrollTop = 0;
}
function fermerFiches() {
  if (panneauFiches.hidden) return false;
  panneauFiches.hidden = true;
  vueFiches = null;
  if (panneauPrestas.hidden) document.body.classList.remove('montage-ouvert');
  return true;
}
const ecranFiches = monterFiches(document.getElementById('ecran-fiches'), {
  actions: {
    choisirMetier: async (metier) => {
      vueFiches.metier = metier;
      try {
        localStorage.setItem(CLE_METIER, metier);
      } catch (erreur) {
        // Stockage du navigateur refusé : le choix vaut pour cette ouverture.
      }
      afficherFiches();
    },
    ouvrirMur: async (prestaId, murId) => {
      await operationPrestas((e) => prestas.ouvrir(e, prestaId, murId));
      garderListeMurOuvert();
      afficherFiches();
    },
    // PDF fait par l'appli (lot 14d : l'impression du navigateur ne marche pas dans l'appli installée sur l'iPhone), puis
    // la feuille de partage, d'où Imprimer, Enregistrer dans Fichiers ou AirDrop ; sans attente avant (Safari n'ouvre
    // la feuille qu'en réponse directe à un appui) ; téléchargé sur ordinateur.
    pdf: async () => {
      const c = contenuFiches();
      const nom = nomFichierFiche(c.presta.nom, c.metier).replace(/\.txt$/, '.pdf');
      return enregistrer(new File([pdfFiche(c.fiche)], nom, { type: 'application/pdf' }), nom);
    },
    copier: async () => copier(texteFiche(contenuFiches().fiche)),
    partager: async () => {
      const c = contenuFiches();
      const nom = nomFichierFiche(c.presta.nom, c.metier);
      return enregistrer(fichierTexte(texteFiche(c.fiche), nom, 'text/plain'), nom);
    },
  },
});
document.getElementById('fiches-fermer').addEventListener('click', fermerFiches);
// Échap ferme d'abord Fiches, sans fermer Prestas dessous.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fermerFiches()) e.stopPropagation();
}, true);
window.addEventListener('hashchange', fermerFiches);
// Écran Terrain (étape 27, lot 27b) : check-list de mise en service du mur ouvert, écran plein au-dessus de l'appli ;
// « Fermer » ou Échap ramène à l'onglet affiché. Les entrées sont rassemblées une fois les calculs du mur prêts, jamais
// pendant un changement de mur ; à l'ouverture, une case dont l'étape a changé est décochée et le bandeau le dit
// (« Compris » l'oublie). Les cases et l'état sont gardés avec le mur sans marquer la presta modifiée ; les étapes
// ajoutées la marquent (prestas.js).
const panneauTerrain = document.getElementById('terrain');
let vueTerrain = null;
// Partie affichée (« Mise en service » ou « Pannes », lot 27c) : le dernier choix, gardé sur l'appareil.
const CLE_VUE_TERRAIN = 'mur-led-terrain-vue';
function lireVueTerrain() {
  try {
    return localStorage.getItem(CLE_VUE_TERRAIN) === 'pannes' ? 'pannes' : 'service';
  } catch (erreur) {
    return 'service';
  }
}
function garderVueTerrain(partie) {
  try {
    localStorage.setItem(CLE_VUE_TERRAIN, partie);
  } catch (erreur) {
    // Stockage indisponible : le choix vaut pour cette ouverture.
  }
}
let verrouTerrain = null;
// Bandeau du changement, par mur, jusqu'à « Compris » (le temps de l'ouverture de l'appli).
const avisTerrain = new Map();
const terrainOuvert = () => prestas.terrainMur(etatPrestas, prestas.murOuvert(etatPrestas)?.id);
// Entrées de la check-list du mur ouvert, depuis les résultats affichés des onglets (Data, Élec, Canvas, câblage retenu du
// Schéma, guide de montage, pas à pas NovaLCT).
function entreesTerrainMur() {
  const d = entreesTerrainData();
  const schema = entreesMateriel();
  const elec = resultatElec();
  const pasAPas = pasAPasNovaLCT();
  const parc = base.parcs.find((p) => p.id === parcActif) ?? null;
  return terrain.entreesDuMur({
    // Configs de chaque groupe de lots : celles de Data (logiciel du processeur), sinon toutes celles du lot.
    data: d ? {
      ...d,
      groupes: d.groupes.map((g, i) => ({
        ...g, configs: d.configs?.parFiche?.[i]?.resultat ?? (parc ? configsDuMur(base, parc.id, g.dalleId, g.n, { coches: g.coches }) : null),
      })),
    } : null,
    parc,
    cablageData: schema?.data?.variante ?? null,
    elec: elec ? { ...elec, variante: schema?.elec?.variante ?? null } : null,
    canvas: controleAffiche(),
    montage: etatMontage(),
    novalct: pasAPas ? faitesSur(pasAPas, suiviNovaLCT().cases) : null,
    ajouts: terrainOuvert().ajouts,
  });
}
// Check-list gardée avec le mur ouvert ; une écriture refusée (autre onglet, stockage indisponible) est affichée.
async function garderTerrain(t) {
  const mur = prestas.murOuvert(etatPrestas);
  if (!mur) return;
  etatPrestas = prestas.enregistrerMur(etatPrestas, mur.id, { terrain: t });
  const ok = await enregistrerPrestas(etatPrestas);
  ecranTerrain?.signalerEcriture(ok ? null : ecrituresSuspendues()
    ? 'Rien n\'est enregistré sur cet appareil : l\'appli est ouverte dans un autre onglet. Recharge l\'onglet que tu utilises.'
    : 'Pas enregistré sur cet appareil : le stockage du navigateur est indisponible.');
}
const etatAvecDate = (resultat, coches) => ({ ...terrain.etatTerrain(resultat, coches), calculeLe: new Date().toISOString() });
// Carnet de pannes du mur ouvert (lot 27c) : pannes, spares utilisés (mur, et presta quand elle a plusieurs murs, sur les
// listes de matériel gardées), lots de chaque fiche dans le parc du mur, formulaire ouvert.
function carnetTerrain() {
  const presta = prestas.prestaOuverte(etatPrestas);
  const mur = prestas.murOuvert(etatPrestas);
  const pannes = terrain.pannesDe(terrainOuvert());
  const liste = (murId) => prestas.listeGardee(etatPrestas, murId)?.liste ?? null;
  const parc = base.parcs.find((p) => p.id === parcActif) ?? null;
  const fichesMur = vueTerrain.entrees.fiches ?? [];
  const f = vueTerrain.formulaire;
  const ids = new Set([...fichesMur.map((x) => x.id), ...pannes.map((p) => p.ficheId), ...(f ? [(f.panne ?? f.saisie).ficheId] : [])]);
  const lots = Object.fromEntries([...ids].map((id) => [id, terrain.lotsPourPanne(parc ? lotsDalleParc(base, parc.id, id) : null,
    fichesMur.find((x) => x.id === id)?.lots?.retenus ?? null)]));
  const autres = (presta?.murs ?? []).length > 1;
  return {
    pannes, lots, formulaire: f, simplifie: appuiDalleDesactive(),
    spares: {
      mur: terrain.sparesUtilises([{ nom: mur?.nom ?? '', pannes, liste: liste(mur?.id) }]),
      presta: autres ? terrain.sparesUtilises(presta.murs.map((m) => ({ nom: m.nom, pannes: terrain.pannesDe(prestas.terrainMur(etatPrestas, m.id)), liste: liste(m.id) })), { presta: true }) : null,
    },
  };
}
// Texte copié ou partagé de l'écran Terrain (lot 27d) : mise en service et carnet du mur ouvert, tels qu'affichés.
function texteTerrain() {
  const mur = prestas.murOuvert(etatPrestas);
  return terrain.resumeTerrain({
    presta: prestas.prestaOuverte(etatPrestas)?.nom ?? '', mur: mur?.nom ?? '', resultat: vueTerrain.resultat, coches: vueTerrain.coches,
    pannes: terrain.pannesDe(terrainOuvert()), spares: carnetTerrain().spares.mur, depannage,
  });
}
function afficherTerrain() {
  const mur = prestas.murOuvert(etatPrestas);
  ecranTerrain.afficher({
    presta: prestas.prestaOuverte(etatPrestas)?.nom ?? '', mur: mur?.nom ?? '', resultat: vueTerrain.resultat, coches: vueTerrain.coches,
    avis: avisTerrain.get(mur?.id) ?? null, vue: vueTerrain.partie, carnet: carnetTerrain(),
  });
}
// Carnet changé (panne ajoutée, modifiée, supprimée) : gardé avec le mur, la presta marquée modifiée (prestas.js).
async function majCarnet(t) {
  vueTerrain = { ...vueTerrain, formulaire: null };
  await garderTerrain(t);
  afficherTerrain();
  document.getElementById('ecran-terrain').scrollTop = 0;
}
// Recalcule les étapes (après une étape ajoutée ou retirée) sans rapprocher : seules les cases changent par l'utilisateur.
async function majTerrain(calcul) {
  const t = calcul(terrainOuvert());
  const resultat = terrain.etapesTerrain({ ...vueTerrain.entrees, ajouts: t.ajouts }, { depannage, miseEnService });
  vueTerrain = { ...vueTerrain, resultat, coches: t.coches };
  await garderTerrain({ ...t, etat: etatAvecDate(resultat, t.coches) });
  afficherTerrain();
}
async function garderEcranTerrain() {
  try {
    verrouTerrain = (await navigator.wakeLock?.request?.('screen')) ?? null;
  } catch (erreur) {
    verrouTerrain = null;
  }
}
// `panne` (lot 27c) : dalle touchée dans le Schéma, l'écran s'ouvre sur le formulaire du carnet.
async function ouvrirTerrain({ panne = null } = {}) {
  const mur = prestas.murOuvert(etatPrestas);
  if (!ecranTerrain || !mur) return;
  // Saisies en attente, puis les calculs repoussés du mur (grand mur, changement de mur) avant de lire les onglets.
  sauverMaintenant();
  await new Promise((fin) => setTimeout(fin, 0));
  if (prestas.murOuvert(etatPrestas)?.id !== mur.id) return;
  // Liste de matériel à jour, pour les spares prévus du carnet.
  garderListeMurOuvert();
  const entrees = entreesTerrainMur();
  const resultat = terrain.etapesTerrain(entrees, { depannage, miseEnService });
  const t = terrainOuvert();
  const r = terrain.rapprocherTerrain(resultat, t.coches);
  if (r.avis) avisTerrain.set(mur.id, r.avis);
  vueTerrain = {
    murId: mur.id, entrees, resultat, coches: r.coches,
    partie: panne ? 'pannes' : lireVueTerrain(), formulaire: panne ? { saisie: panne } : null,
  };
  panneauTerrain.hidden = false;
  document.body.classList.add('montage-ouvert');
  afficherTerrain();
  document.getElementById('ecran-terrain').scrollTop = 0;
  garderEcranTerrain();
  await garderTerrain({ ...t, coches: r.coches, etat: etatAvecDate(resultat, r.coches) });
}
function fermerTerrain() {
  if (panneauTerrain.hidden) return false;
  panneauTerrain.hidden = true;
  vueTerrain = null;
  document.body.classList.remove('montage-ouvert');
  try {
    verrouTerrain?.release?.();
  } catch (erreur) {
    // Rien à faire : le navigateur a déjà relâché l'écran.
  }
  verrouTerrain = null;
  return true;
}
const ecranTerrain = monterTerrain(document.getElementById('ecran-terrain'), {
  depannage,
  actions: {
    cocher: async (id, signature) => {
      const t = terrain.cocherEtape(terrainOuvert(), id, signature);
      vueTerrain = { ...vueTerrain, coches: t.coches };
      await garderTerrain({ ...t, etat: etatAvecDate(vueTerrain.resultat, t.coches) });
    },
    compris: async () => {
      avisTerrain.delete(vueTerrain.murId);
      afficherTerrain();
    },
    ajouter: async (texte) => majTerrain((t) => terrain.ajouterEtape(t, texte)),
    retirer: async (id) => majTerrain((t) => terrain.retirerEtape(t, id)),
    toutDecocher: async () => majTerrain((t) => terrain.toutDecocher(t)),
    // Carnet de pannes (lot 27c).
    vue: async (partie) => {
      garderVueTerrain(partie);
      vueTerrain = { ...vueTerrain, partie, formulaire: null };
      afficherTerrain();
    },
    formulaire: async (choix) => {
      const panne = choix ? terrain.pannesDe(terrainOuvert()).find((p) => p.id === choix.panneId) : null;
      if (choix && !panne) throw new ErreurSaisie('Panne introuvable : elle a peut-être été supprimée.');
      vueTerrain = { ...vueTerrain, formulaire: panne ? { panne } : null };
      afficherTerrain();
      document.getElementById('ecran-terrain').scrollTop = 0;
    },
    enregistrerPanne: async (panneId, champs) => {
      const opts = { symptomes: terrain.symptomesPanne(depannage) };
      const t = panneId ? terrain.modifierPanne(terrainOuvert(), panneId, champs, opts)
        : terrain.ajouterPanne(terrainOuvert(), { ...vueTerrain.formulaire.saisie, ...champs }, opts);
      await majCarnet(t);
    },
    supprimerPanne: async (panneId) => majCarnet(terrain.supprimerPanne(terrainOuvert(), panneId)),
    // « Voir l'arbre » : le Dépannage ouvert au premier nœud du symptôme.
    voirArbre: async (symptome) => {
      const s = depannage?.symptomes?.find((x) => x.id === symptome);
      fermerTerrain();
      location.hash = 'depannage';
      if (s) ecranDepannage?.afficher(s.vers);
    },
    ouvrirSchema: async () => {
      fermerTerrain();
      location.hash = 'schema';
    },
    // Pied (lot 27d, spec § 7) : texte du mur ouvert copié ou partagé (.txt), PDF du carnet de toute la presta ; feuille
    // de partage ou téléchargement, sans attente avant (Safari n'ouvre la feuille qu'en réponse directe à un appui).
    copier: async () => copier(texteTerrain()),
    partager: async () => {
      const nom = terrain.nomFichierTerrain(prestas.prestaOuverte(etatPrestas)?.nom ?? '', prestas.murOuvert(etatPrestas)?.nom ?? '');
      return enregistrer(fichierTexte(texteTerrain(), nom, 'text/plain'), nom);
    },
    pdf: async () => {
      const presta = prestas.prestaOuverte(etatPrestas);
      const murs = presta.murs.map((m) => ({ id: m.id, nom: m.nom, pannes: terrain.pannesDe(prestas.terrainMur(etatPrestas, m.id)), liste: prestas.listeGardee(etatPrestas, m.id)?.liste ?? null }));
      const nom = terrain.nomFichierCarnet(presta.nom);
      return enregistrer(new File([pdfFiche(terrain.ficheCarnet({ presta, murs, depannage }))], nom, { type: 'application/pdf' }), nom);
    },
    // Boutons des étapes : Terrain se ferme, leur écran s'ouvre (leur retour ne rouvre pas Terrain, spec § 6).
    ouvrir: async (quoi) => {
      fermerTerrain();
      if (quoi === 'mire') ouvrirMire('mire');
      else if (quoi === 'novalct') {
        if (!ouvrirNovaLCT()) location.hash = 'data';
      } else if (!ouvrirGuideMontage(quoi === 'montage-elec' ? 'elec' : 'data')) location.hash = 'schema';
    },
  },
});
document.getElementById('terrain-fermer').addEventListener('click', fermerTerrain);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fermerTerrain()) e.stopPropagation();
}, true);
window.addEventListener('hashchange', fermerTerrain);
document.addEventListener('visibilitychange', () => { if (!panneauTerrain.hidden && document.visibilityState === 'visible') garderEcranTerrain(); });
boutonPresta.addEventListener('click', ouvrirPrestas);
document.getElementById('prestas-fermer').addEventListener('click', fermerPrestas);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerPrestas(); });
window.addEventListener('hashchange', fermerPrestas);
actualiserBoutonPresta();

// Saisies du mur ouvert, puis sauvegarde automatique ; copie des résultats. Les valeurs de départ des formulaires sont
// relevées avant (réglages par défaut d'un nouveau mur).
releverDefauts();
await restaurerConfiguration(prestas.murOuvert(etatPrestas)?.configuration ?? null);
suivreConfiguration();
alertesMurOuvert();
initialiserCopie({
  lignePresta: () => {
    const p = prestas.prestaOuverte(etatPrestas);
    const m = prestas.murOuvert(etatPrestas);
    return p && m ? prestas.lignePresta(p, m.nom) : null;
  },
});

// Dépannage : avec des saisies gardées (un projet), la marque du processeur retenu dans Data déplie ses lignes ; sans
// saisies, l'écran demande la marque. Relu à chaque ouverture de l'onglet.
async function projetDepannage() {
  if (!prestas.murOuvert(etatPrestas)?.configuration) return null;
  const processeur = processeurRetenu();
  return processeur ? { marque: marqueDuProcesseur(processeur), nom: processeur.nom, logiciel: processeur.logiciel ?? null } : null;
}
if (depannage) {
  ecranDepannage = monterDepannage(document.getElementById('ecran-depannage'), depannage,
    {
      projet: await projetDepannage(),
      defiler: () => window.scrollTo(0, 0),
      ouvrirMire: () => ouvrirMire('mire'),
      liensPourquoi: ecranPourquoi ? liensPourquoi.liens : [],
      ouvrirPourquoi: ecranPourquoi ? ouvrirPourquoi : null,
      ouvrirListePourquoi: ecranApprendre ? () => allerApprendre() : null,
      // Étape 19a : sous la ligne 1 de T10.3, le chemin de ton ordinateur et le lien vers la fiche d'Apprendre.
      ajouts: {
        'T10.3:1': (marque) => blocDepannage({ systeme: lireOrdinateur(), marque, ouvrirFiche: ecranApprendre ? allerConnexion : null }),
        // Étape 22c : processeur de secours (Novastar), avec le bouton du pas à pas quand le projet se règle dans NovaLCT ;
        // sans pas à pas calculé pour le mur ouvert, l'onglet Data.
        ...Object.fromEntries(['T10.3:3', 'T11.1:3', 'T5.2:3'].map((cle) => [cle, (marque, projet) => blocDepannageSecours(cle, {
          marque, projet, ouvrirPasAPas: () => { if (!ouvrirNovaLCT()) location.hash = '#data'; },
        })])),
      },
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
  const mur = prestas.murOuvert(etatPrestas)?.nom ?? 'le mur ouvert';
  if (confirm(`Remettre toutes les saisies de ${mur} (onglets Mur, Data, Canvas, Élec, Poids et Schéma) à leurs valeurs par défaut, et effacer son suivi du montage et du pas à pas NovaLCT ? Les autres murs, ta base et tes parcs ne changent pas.`)) {
    reglagesParDefaut();
    effacerMontage();
    majMur({ novalct: null });
  }
});
