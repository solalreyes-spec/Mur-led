// Écran Planning (étape 23, lot 23c1, spec § 7) : dates des piges lues sur les Eventsoft des boîtes par le relais, gardées
// sur l'appareil (historique, hors ligne). Haut : état de chaque boîte et « Actualiser » ; liste des journées à venir,
// puis « Voir les dates passées » ; filtre par boîte ; réglages repliés en bas (adresse du relais, jetons, « Tester la
// connexion », repère de chaque boîte). L'adresse du relais et les jetons ne sont jamais écrits dans la page : champs
// masqués, vidés une fois enregistrés. Rien de cet écran ne part dans « Tout copier ».
// Lot 23c2 : choix Liste | Mois | Totaux (Liste à l'ouverture, la vue choisie reste jusqu'à la fermeture de l'appli),
// grille du mois, tableau des totaux, conflits sur les cartes.
// Lot 23d : case « Saisie dans Intermittent », « Copier pour Intermittent », alerte après saisie et filtre « À saisir »
// (Liste seulement) ; « Exporter le planning » et « Importer un planning » (sans adresse ni jetons) ; par boîte,
// « Ajouter à Calendrier » (webcal://) et « Copier l'adresse » (https://), adresses construites au moment de l'appui :
// le jeton Apple n'est jamais écrit dans la page.
// Étape 25, lot 25e1 : clé des devis (champ masqué comme les jetons) ; devis chiffrés lus par le relais avec le planning,
// déchiffrés et gardés sur l'appareil ; fraîcheur et erreur de chaque boîte ; sur la carte d'une journée, poste,
// « Ton matériel » et « Le reste du devis » ; poste ajouté à « Copier pour Intermittent ».
// Lot 25e2 : parc de chaque boîte dans les réglages ; sur la carte, murs du devis, processeurs du devis face au conseil,
// « Ajouter au parc », « Préparer les murs » puis « Ouvrir la presta », écart quand le devis a changé depuis.

import { el, remplacer } from './dom.js';
import { copier as copierTexte } from './copie.js';
import { partagerFichier } from './export.js';
import {
  CLES_PLANNING, CLE_DEVIS, PALETTE_BOITES, reglagesVides, reglagesComplets, adresseRelais, jetonValide, cleDevisValide, adressesApple,
  reglerParcBoite, parcBoite, nettoyerParcsBoites,
} from './planning/reglages.js';
import { lirePlanning, testerConnexion, lectureDue, lireDevis } from './planning/relais.js';
import { dechiffrerDevis, garderDevis, fraicheurDevis, choisirPresta, devisVu, mursDuDevis, ajoutsParc, lignesMontage } from './planning/devis.js';
import { vueListe, vueMois, vueTotaux, etatBoites } from './planning/affichage.js';
import { marquerVu, nombreNouvelles, saisirJournee, confirmerAlerteSaisie } from './planning/journees.js';
import { exporterPlanning, lireExportPlanning, importerPlanning, nomFichierPlanning } from './planning/sauvegarde.js';

const NOMS_COULEURS = ['Orange', 'Vert', 'Jaune', 'Violet', 'Bleu', 'Rose', 'Sable', 'Menthe'];
const VUES = [['liste', 'Liste'], ['mois', 'Mois'], ['totaux', 'Totaux']];
const JOURS_GRILLE = [['L', 'lundi'], ['M', 'mardi'], ['M', 'mercredi'], ['J', 'jeudi'], ['V', 'vendredi'], ['S', 'samedi'], ['D', 'dimanche']];

// Heures (« 17 h 06 ») et dates (« jeu. 29/10 ») jamais coupées en fin de ligne.
const insecable = (t) => String(t).replace(/\d+ h( \d\d)?/g, (m) => m.replace(/ /g, '\u00a0')).replace(/(\p{L}+\.) (\d\d\/\d\d)/gu, '$1\u00a0$2');

// Fiche proposée par le devis : nom avec la version, poids et puissance max entre parenthèses (lot 25e4).
const libelleFiche = (x) => (x.detail ? `${x.nom} (${x.detail})` : x.nom);
const pastille = (repere) => el('span', { class: 'pl-pastille', style: `--boite: ${repere.couleur}`, 'aria-hidden': 'true' }, repere.lettre);

// `stockage` : { lire, ecrire } (IndexedDB de l'appli) ; `surNouvelles(n)` : pastille de l'onglet ; `copier(texte)` :
// presse-papiers (false si la copie échoue) ; `ouvrir(url)` : abonnement webcal:// ; `partager(contenu, nom)` : fichier
// exporté (feuille de partage, sinon téléchargement) ; `base()` : { dalles, processeurs } de la base de l'appli (dalles et
// processeurs des devis reconnus), null tant qu'elle n'est pas chargée ; avec `parcs` et `contexteParc(id)` ({ quantites,
// bitsParFamille }) pour le parc de chaque boîte (lot 25e2). `actions` (lot 25e2, prestas de l'appli) : `lien(lien, noms)`
// (presta liée au devis ou null), `preparer(demande)`, `ouvrir(prestaId, murId)`, `vu(prestaId, empreinte)`,
// `ajouterAuParc(parcId, ajout)`.
export function monterPlanning(racine, {
  stockage, fetch = (...a) => globalThis.fetch(...a), maintenant = () => Date.now(), enLigne = () => navigator.onLine, surNouvelles = () => {},
  copier = copierTexte, ouvrir = (url) => { window.location.href = url; },
  partager = (contenu, nom) => partagerFichier(contenu, nom, 'application/json'), base = () => null, actions = null,
}) {
  const etat = {
    reglages: reglagesVides(), donnees: null, masquees: new Set(), passees: false, demandes: [], message: null, enCours: false,
    vue: 'liste', mois: null, jour: null, aSaisir: false, statutCarte: null,
    devis: null, messageDevis: null, devisOuverts: new Set(), erreurMurs: null,
  };
  racine.classList.add('pl');
  const contenu = el('div', { class: 'pl-contenu' });

  // File des opérations : une lecture à la fois ; `calme()` attend que tout soit fini.
  let file = Promise.resolve();
  const enFile = (operation) => {
    file = file.then(operation).catch(() => {});
    return file;
  };
  async function calme() {
    await pret;
    let vue;
    do {
      vue = file;
      await vue;
    } while (vue !== file);
  }

  const enregistrerReglages = () => stockage?.ecrire(CLES_PLANNING.reglages, etat.reglages);
  const enregistrerDonnees = () => stockage?.ecrire(CLES_PLANNING.etat, etat.donnees);
  const enregistrerDevis = () => stockage?.ecrire(CLE_DEVIS, etat.devis);
  const signaler = () => surNouvelles(etat.donnees ? nombreNouvelles(etat.donnees) : 0);

  // ---------------------------------------------------------------------------
  // Réglages (construits une fois : la saisie en cours n'est jamais effacée par un nouvel affichage).

  const champ = (id, libelle, aide) => {
    const entree = el('input', { id, type: 'password', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    return { entree, bloc: el('div', { class: 'champ' }, el('label', { for: id }, libelle), entree, aide ? el('p', { class: 'pl-aide' }, aide) : null) };
  };
  const relais = champ('pl-relais', 'Adresse du relais', 'Adresse https:// de ton relais Cloudflare (guide du relais).');
  const jeton = champ('pl-jeton', 'Jeton de l\'appli');
  const jetonApple = champ('pl-jeton-apple', 'Jeton Apple', 'Pour les abonnements Calendrier : un bouton par boîte, plus bas.');
  const cleDevis = champ('pl-cle-devis', 'Clé des devis', 'Pour lire les devis envoyés par le robot du Mac : 64 caractères.');
  const etatReglage = el('ul', { class: 'pl-etat-reglage' });
  const erreurReglage = el('p', { class: 'pl-erreur-reglage', role: 'alert' });
  const resultatTest = el('div', { class: 'pl-resultat-test', role: 'status', 'aria-live': 'polite' });
  const listeBoites = el('div', { class: 'pl-boites-reglage' });
  const boutonEnregistrer = el('button', { class: 'bouton pl-enregistrer', type: 'button', 'data-icone': 'enregistrer' }, 'Enregistrer');
  const boutonTester = el('button', { class: 'bouton pl-tester', type: 'button' }, 'Tester la connexion');
  const boutonEffacer = el('button', { class: 'bouton bouton-danger pl-effacer', type: 'button'}, 'Effacer l\'adresse et les jetons');
  const statutApple = el('p', { class: 'pl-apple-statut', role: 'status', 'aria-live': 'polite' });
  const boutonExporter = el('button', { class: 'bouton pl-exporter', type: 'button', 'data-icone': 'partager' }, 'Exporter le planning');
  const boutonImporter = el('button', { class: 'bouton pl-importer', type: 'button', 'data-icone': 'importer' }, 'Importer un planning');
  // Aucun filtre « accept » : comme pour l'import de la base (certains iPhone grisent les .json).
  const choixImport = el('input', { id: 'pl-import', type: 'file', hidden: '' });
  const resultatSauvegarde = el('p', { class: 'pl-resultat-sauvegarde', role: 'status', 'aria-live': 'polite' });
  const reglages = el('details', { class: 'carte pl-reglages' },
    el('summary', {}, 'Réglages du planning'),
    etatReglage,
    el('div', { class: 'formulaire' }, relais.bloc, jeton.bloc, jetonApple.bloc, cleDevis.bloc),
    erreurReglage,
    el('div', { class: 'actions' }, boutonEnregistrer, boutonTester),
    resultatTest,
    listeBoites,
    statutApple,
    el('h3', {}, 'Sauvegarde'),
    el('p', { class: 'pl-aide' }, 'Pour changer de téléphone : tes dates gardées, les cases Intermittent, les noms, couleurs et lettres des boîtes. Sans l\'adresse du relais ni les jetons, à saisir à nouveau.'),
    el('div', { class: 'actions pl-sauvegarde' }, boutonExporter, boutonImporter, choixImport),
    resultatSauvegarde,
    el('p', { class: 'pl-aide' }, 'L\'adresse, les jetons et la clé des devis restent sur ce téléphone : jamais dans un export, une presta ni « Tout copier ».'),
    el('div', { class: 'actions pl-actions-danger' }, boutonEffacer));

  function afficherEtatReglage() {
    const r = etat.reglages;
    remplacer(etatReglage,
      el('li', {}, `Adresse du relais : ${r.relais ? 'enregistrée' : 'à saisir'}`),
      el('li', {}, `Jeton de l'appli : ${r.jeton ? 'enregistré' : 'à saisir'}`),
      el('li', {}, `Jeton Apple : ${r.jetonApple ? 'enregistré' : 'à saisir'}`),
      el('li', {}, `Clé des devis : ${r.cleDevis ? 'enregistrée' : 'à saisir'}`));
    relais.entree.placeholder = r.relais ? 'Enregistrée, laisse vide' : 'https://…';
    jeton.entree.placeholder = r.jeton ? 'Enregistré, laisse vide' : '';
    jetonApple.entree.placeholder = r.jetonApple ? 'Enregistré, laisse vide' : '';
    cleDevis.entree.placeholder = r.cleDevis ? 'Enregistrée, laisse vide' : '';
    const avecApple = Boolean(adressesApple(r, 'x'));
    const presentes = (r.boites ?? []).filter((b) => !b.absente);
    // Abonnements Calendrier repliés (lot 23e) : faits une fois par téléphone ; le repli garde son état d'ouverture.
    const abonnementsOuverts = Boolean(listeBoites.querySelector('details.pl-abonnements')?.open);
    remplacer(listeBoites, presentes.length === 0 ? null : [
      el('h3', {}, 'Boîtes'),
      avecApple ? null : el('p', { class: 'pl-aide pl-apple-manque' }, 'Saisis le jeton Apple pour t\'abonner dans Calendrier : un abonnement par boîte apparaîtra sous les boîtes.'),
      ...presentes.map((b) => {
        const nom = el('input', { type: 'text', id: `pl-nom-${b.id}`, value: b.affichage, maxlength: '40', autocomplete: 'off' });
        const lettre = el('input', { type: 'text', id: `pl-lettre-${b.id}`, value: b.lettre, maxlength: '1', autocomplete: 'off', autocapitalize: 'characters', class: 'pl-lettre' });
        const couleur = el('select', { id: `pl-couleur-${b.id}` }, ...PALETTE_BOITES.map((c, i) => el('option', { value: c, selected: c === b.couleur ? '' : null }, NOMS_COULEURS[i])));
        const changer = () => {
          const lettreLue = lettre.value.trim().toUpperCase().slice(0, 1);
          etat.reglages = {
            ...etat.reglages,
            boites: etat.reglages.boites.map((x) => (x.id === b.id ? { ...x, affichage: nom.value.trim() || x.nom, lettre: lettreLue || x.lettre, couleur: couleur.value } : x)),
          };
          enregistrerReglages();
          afficher();
        };
        for (const e of [nom, lettre, couleur]) e.addEventListener('change', changer);
        // Parc de la boîte (lot 25e2) : repris par les murs préparés depuis ses devis.
        const parcs = base()?.parcs ?? [];
        const parc = el('select', { id: `pl-parc-${b.id}` }, el('option', { value: '' }, 'Aucun'),
          ...parcs.map((x) => el('option', { value: x.id, selected: x.id === b.parc ? '' : null }, x.nom)));
        parc.addEventListener('change', () => {
          etat.reglages = reglerParcBoite(etat.reglages, b.id, parc.value || null);
          enregistrerReglages();
          afficher();
        });
        return el('fieldset', { class: 'pl-boite-reglage' },
          el('legend', {}, pastille(b), ` ${b.nom}`),
          el('div', { class: 'champ' }, el('label', { for: nom.id }, 'Nom affiché'), nom),
          el('div', { class: 'paire' },
            el('div', { class: 'champ' }, el('label', { for: lettre.id }, 'Lettre'), lettre),
            el('div', { class: 'champ' }, el('label', { for: couleur.id }, 'Couleur'), couleur)),
          el('div', { class: 'champ' }, el('label', { for: parc.id }, 'Parc'), parc,
            el('p', { class: 'pl-aide' }, 'Repris par les murs préparés depuis les devis de cette boîte.')));
      }),
      avecApple
        ? el('details', { class: 'pl-abonnements', open: abonnementsOuverts ? '' : null },
          el('summary', {}, 'Refaire un abonnement Calendrier'),
          el('div', { class: 'pl-rappel-apple' },
            el('p', { class: 'pl-aide' }, '« Ajouter à Calendrier » t\'abonne au planning de la boîte, sans les indisponibilités. Si tu es déjà abonné aux liens Eventsoft dans Calendrier, désabonne-toi de ceux-là pour éviter les doublons : dans Calendrier, Calendriers, bouton i du calendrier, Se désabonner.'),
            el('p', { class: 'pl-aide' }, 'Si le bouton n\'ouvre pas Calendrier : « Copier l\'adresse », puis dans Calendrier, Calendriers, Nouv. calendrier, Ajouter un calendrier avec abonnement, et colle l\'adresse.')),
          ...presentes.map((b) => el('div', { class: 'pl-abonnement' },
            el('p', { class: 'pl-abonnement-titre' }, pastille(b), el('span', { class: 'pl-abonnement-nom' }, b.affichage)),
            boutonsApple(b))))
        : null,
    ]);
  }

  // Abonnement Calendrier d'une boîte : adresses construites au moment de l'appui, jamais écrites dans la page.
  function boutonsApple(b) {
    const ajouter = el('button', { class: 'bouton pl-ajouter-calendrier', type: 'button', 'data-icone': 'ajouter' }, 'Ajouter à Calendrier');
    const copierAdresse = el('button', { class: 'bouton pl-copier-adresse', type: 'button', 'data-icone': 'copier' }, 'Copier l\'adresse');
    ajouter.addEventListener('click', () => {
      const a = adressesApple(etat.reglages, b.id);
      if (!a) return;
      statutApple.textContent = `Calendrier va proposer l'abonnement au planning de ${b.affichage}.`;
      ouvrir(a.webcal);
    });
    copierAdresse.addEventListener('click', () => {
      const a = adressesApple(etat.reglages, b.id);
      if (!a) return;
      const envoi = copier(a.https);
      enFile(async () => {
        const ok = (await envoi) !== false;
        statutApple.textContent = ok ? `Adresse copiée pour ${b.affichage} : colle-la dans Calendrier.` : 'Copie impossible sur ce navigateur.';
      });
    });
    return el('div', { class: 'actions pl-apple' }, ajouter, copierAdresse);
  }

  boutonExporter.addEventListener('click', () => {
    if (!etat.donnees?.boites || !Object.keys(etat.donnees.boites).length) {
      resultatSauvegarde.textContent = 'Aucune date à exporter.';
      return;
    }
    const t = maintenant();
    const envoi = partager(JSON.stringify(exporterPlanning(etat.reglages, etat.donnees, t, etat.devis), null, 2), nomFichierPlanning(t));
    enFile(async () => {
      try {
        const r = await envoi;
        resultatSauvegarde.textContent = r?.mode === 'annule' ? ''
          : r?.mode === 'telechargement' ? 'Planning exporté dans Téléchargements. Garde le fichier pour ton prochain téléphone.'
            : 'Planning exporté. Garde le fichier (Fichiers, AirDrop) pour ton prochain téléphone.';
      } catch {
        resultatSauvegarde.textContent = 'Export impossible sur ce navigateur.';
      }
    });
  });

  boutonImporter.addEventListener('click', () => choixImport.click());
  choixImport.addEventListener('change', () => {
    const fichier = choixImport.files?.[0];
    if (!fichier) return;
    enFile(async () => {
      let contenu;
      try {
        contenu = await fichier.text();
      } catch {
        contenu = '';
      }
      choixImport.value = '';
      const lu = lireExportPlanning(contenu);
      if (!lu.ok) {
        resultatSauvegarde.textContent = lu.erreur;
        return;
      }
      const r = importerPlanning(etat.reglages, etat.donnees, lu.donnees, etat.devis);
      etat.reglages = r.reglages;
      etat.donnees = r.etat;
      etat.devis = r.devis;
      await enregistrerDonnees();
      await enregistrerReglages();
      await enregistrerDevis();
      resultatSauvegarde.textContent = r.texte;
      afficherEtatReglage();
      afficher();
      signaler();
    });
  });

  boutonEnregistrer.addEventListener('click', () => {
    const r = { ...etat.reglages };
    const erreurs = [];
    if (relais.entree.value.trim()) {
      const a = adresseRelais(relais.entree.value);
      if (a.ok) r.relais = a.adresse;
      else erreurs.push(a.erreur);
    }
    for (const [c, cle, nom] of [[jeton, 'jeton', 'Jeton de l\'appli'], [jetonApple, 'jetonApple', 'Jeton Apple']]) {
      if (!c.entree.value.trim()) continue;
      const j = jetonValide(c.entree.value);
      if (j.ok) r[cle] = j.jeton;
      else erreurs.push(`${nom} : ${j.erreur}`);
    }
    if (cleDevis.entree.value.trim()) {
      const c = cleDevisValide(cleDevis.entree.value);
      if (c.ok) r.cleDevis = c.cle;
      else erreurs.push(c.erreur);
    }
    erreurReglage.textContent = erreurs.join(' ');
    if (erreurs.length) return;
    for (const c of [relais, jeton, jetonApple, cleDevis]) c.entree.value = '';
    etat.reglages = r;
    enFile(async () => {
      await enregistrerReglages();
      afficherEtatReglage();
      afficher();
      if (reglagesComplets(etat.reglages)) await lire();
    });
  });

  boutonTester.addEventListener('click', () => enFile(async () => {
    const r = etat.reglages;
    if (!reglagesComplets(r)) {
      remplacer(resultatTest, el('p', { class: 'alerte alerte-info' }, 'Règle d\'abord l\'adresse du relais et le jeton de l\'appli.'));
      return;
    }
    remplacer(resultatTest, el('p', {}, 'Test en cours…'));
    const test = await testerConnexion({ adresse: r.relais, jeton: r.jeton, fetch });
    remplacer(resultatTest, el('div', { class: `alerte ${test.ok ? 'alerte-ok' : 'alerte-erreur'}` }, ...test.lignes.map((l) => el('p', {}, l))));
  }));

  boutonEffacer.addEventListener('click', () => {
    if (!confirm('Effacer l\'adresse du relais, les jetons et la clé des devis de ce téléphone ? Tes dates et tes devis gardés restent.')) return;
    etat.reglages = { ...etat.reglages, relais: null, jeton: null, jetonApple: null, cleDevis: null };
    enFile(async () => {
      await enregistrerReglages();
      afficherEtatReglage();
      afficher();
    });
  });

  // ---------------------------------------------------------------------------
  // Lecture

  async function lire(confirmer = []) {
    etat.enCours = true;
    afficher();
    const res = await lirePlanning({ reglages: etat.reglages, etat: etat.donnees, maintenant: maintenant(), fetch, confirmer });
    etat.enCours = false;
    if (res.ok) {
      etat.donnees = res.etat;
      etat.reglages = res.reglages;
      etat.demandes = res.messages.filter((m) => m.type === 'demande');
      etat.message = null;
      await enregistrerDonnees();
      await enregistrerReglages();
      afficherEtatReglage();
      await lireLesDevis();
    } else etat.message = res.texte;
    signaler();
    afficher();
  }

  // Devis envoyés par le robot (§ 5.4) : lus avec le planning quand la clé est enregistrée. Lecture plus ancienne que la
  // dernière acceptée (rejeu, ou relais pas encore à jour) : ignorée sans message.
  async function lireLesDevis() {
    const r = etat.reglages;
    etat.messageDevis = null;
    if (!r.cleDevis) return;
    const lu = await lireDevis({ adresse: r.relais, jeton: r.jeton, fetch });
    if (!lu.ok) {
      etat.messageDevis = `Devis non lus : ${lu.texte}`;
      return;
    }
    if (lu.enveloppe === null) return;
    const d = await dechiffrerDevis(lu.enveloppe, r.cleDevis, { dernierLueLe: etat.devis?.lueLe ?? null });
    if (!d.ok) {
      if (d.code !== 'rejeu') etat.messageDevis = d.erreur;
      return;
    }
    etat.devis = garderDevis(etat.devis, d.devis, maintenant());
    await enregistrerDevis();
  }
  const lectureAuto = () => enFile(async () => {
    if (reglagesComplets(etat.reglages) && lectureDue(etat.donnees, maintenant(), { enLigne: enLigne() })) await lire();
  });

  // ---------------------------------------------------------------------------
  // Affichage

  function carteJournee(c) {
    const repere = { lettre: c.lettre, couleur: c.couleur };
    const puces = [
      c.nouveau ? el('span', { class: 'puce-info pl-puce-nouveau' }, 'Nouveau') : null,
      c.modifie ? el('span', { class: 'puce-info pl-puce-modifie' }, 'Modifié') : null,
      c.aVerifier ? el('span', { class: 'puce-info pl-puce-verifier' }, 'À vérifier') : null,
      c.conflit ? el('span', { class: 'puce-info pl-puce-conflit' }, 'Conflit') : null,
      c.repos ? el('span', { class: 'puce-info pl-puce-repos' }, 'Repos court') : null,
      c.devis?.posteModifie ? el('span', { class: 'puce-info pl-puce-modifie pl-puce-poste-modifie' }, 'Poste modifié') : null,
      c.devis?.devisModifie ? el('span', { class: 'puce-info pl-puce-modifie pl-puce-devis-modifie' }, 'Devis modifié') : null,
    ].filter(Boolean);
    const lieu = c.lieu ? (c.plans ? el('a', { href: c.plans, target: '_blank', rel: 'noopener noreferrer' }, c.lieu) : c.lieu) : null;
    return el('article', { class: `pl-carte${c.retiree ? ' pl-retiree' : ''}`, 'data-cle': c.cle },
      el('div', { class: 'pl-carte-tete' },
        pastille(repere),
        el('span', { class: 'pl-boite' }, c.nom),
        el('span', { class: 'pl-jour' }, insecable(c.jour)),
        el('span', { class: 'pl-horaires' }, insecable(c.horaires)),
        el('span', { class: 'pl-duree' }, insecable(c.duree))),
      puces.length ? el('div', { class: 'pl-puces' }, ...puces) : null,
      el('p', { class: 'pl-presta' }, c.presta),
      c.phases ? el('p', { class: 'pl-detail' }, c.phases) : null,
      lieu ? el('p', { class: 'pl-detail' }, lieu, c.autresLieux?.length ? ` (aussi : ${c.autresLieux.join(', ')})` : '') : null,
      c.client ? el('p', { class: 'pl-detail' }, c.client, c.autresClients?.length ? ` (aussi : ${c.autresClients.join(', ')})` : '') : null,
      ...c.ancien.map((a) => el('p', { class: 'pl-ancien' }, insecable(a))),
      blocDevis(c),
      ...(c.alertes ?? []).map((a) => el('p', { class: `pl-alerte pl-alerte-${a.type}` }, insecable(a.texte))),
      c.retiree ? el('p', { class: 'pl-retire-texte' }, c.retiree) : null,
      c.alerteSaisie ? alerteSaisie(c.alerteSaisie) : null,
      c.retiree ? null : blocIntermittent(c));
  }

  // Devis de la journée : poste, « Ton matériel » ouvert, « Le reste du devis » replié (repli gardé jusqu'à la fermeture
  // de l'appli) ; devis qui touche deux prestas : « C'est cette presta » ; devis refusé au compte : poste seul.
  function blocDevis(c) {
    const d = c.devis;
    if (!d) return null;
    if (d.aChoisir) {
      const choisir = el('button', { class: 'bouton', type: 'button', 'data-focus': `choix-devis-${c.cle}` }, 'C\'est cette presta');
      choisir.addEventListener('click', () => enFile(async () => {
        etat.devis = choisirPresta(etat.devis, d.aChoisir.boite, d.aChoisir.idEventsoft, c.presta);
        await enregistrerDevis();
        afficher();
      }));
      return el('div', { class: 'pl-devis pl-devis-choix' }, el('p', {}, `Devis « ${d.aChoisir.nomDevis} » : est-ce cette presta ?`), el('div', { class: 'actions' }, choisir));
    }
    const section = (s) => el('section', { class: 'pl-devis-section' },
      el('h4', {}, s.titre || 'Sans titre'),
      el('ul', {}, ...s.lignes.map((l) => el('li', {},
        l.quantiteTexte ? el('span', { class: 'pl-devis-qte' }, `${l.quantiteTexte}\u00a0× `) : null,
        l.ref ? el('span', { class: 'pl-devis-ref' }, l.ref) : null,
        l.ref ? ' ' : null,
        l.designation))));
    const repli = (classe, titre, sections, ouvert) => {
      const cle = `${c.cle}|${classe}`;
      const bloc = el('details', { class: `pl-devis-bloc ${classe}`, open: (ouvert ? !etat.devisOuverts.has(`${cle}|ferme`) : etat.devisOuverts.has(cle)) ? '' : null },
        el('summary', {}, titre), ...sections.map(section));
      bloc.addEventListener('toggle', () => {
        etat.devisOuverts.delete(cle);
        etat.devisOuverts.delete(`${cle}|ferme`);
        if (bloc.open !== ouvert) etat.devisOuverts.add(ouvert ? `${cle}|ferme` : cle);
      });
      return bloc;
    };
    const nombre = (n) => `${n} ${n > 1 ? 'sections' : 'section'}`;
    const v = d.vue;
    return el('div', { class: 'pl-devis' },
      d.postes ? el('p', { class: 'pl-poste' }, `Poste : ${d.postes}`) : null,
      d.ancienPoste ? el('p', { class: 'pl-ancien' }, `Avant : ${d.ancienPoste}`) : null,
      d.nonAutorise ? el('p', { class: 'pl-aide pl-devis-refuse' }, 'Devis non ouvert à ton compte dans Eventsoft : poste seul.') : null,
      v && v.toutReplie && v.reste.length ? repli('pl-reste-devis', `Le devis (${nombre(v.reste.length)})`, v.reste, false) : null,
      v && !v.toutReplie ? (v.tonMateriel.length ? repli('pl-ton-materiel', v.titre, v.tonMateriel, true) : el('p', { class: 'pl-aide' }, `${v.titre} : rien dans le devis.`)) : null,
      v && !v.toutReplie && v.reste.length ? repli('pl-reste-devis', `Le reste du devis (${nombre(v.reste.length)})`, v.reste, false) : null,
      blocMurs(c, d));
  }

  // Murs du devis (lot 25e2) : murs proposés, processeurs du devis face au conseil, « Ajouter au parc » de la boîte,
  // « Préparer les murs » (rien n'est créé sans appui) ou « Ouvrir la presta », écart quand le devis a changé depuis.
  function blocMurs(c, d) {
    const b = base();
    const presta = etat.devis?.boites?.[d.boite]?.prestas?.[d.idEventsoft];
    if (!b || !presta || d.nonAutorise) return null;
    const parcId = parcBoite(etat.reglages, d.boite, (b.parcs ?? []).map((x) => x.id));
    const parc = parcId ? b.parcs.find((x) => x.id === parcId) : null;
    const contexte = parcId ? b.contexteParc?.(parcId) ?? {} : {};
    const m = mursDuDevis(presta, b, { parc, quantites: contexte.quantites ?? null, bitsParFamille: contexte.bitsParFamille ?? {} });
    const ajoutBrut = parc ? ajoutsParc(presta, b, parc) : null;
    // Dalle à choisir (lot 25e3) : sous « Murs du devis », plus dans « Ajouter au parc ».
    const ajout = ajoutBrut && (ajoutBrut.dalles.length || ajoutBrut.processeurs.length) ? ajoutBrut : null;
    if (!m && !ajout) return null;
    const lien = { boite: d.boite, idEventsoft: d.idEventsoft, empreinte: presta.empreintes?.devis ?? null };
    const noms = m?.murs.map((x) => x.nom) ?? [];
    const lie = noms.length ? actions?.lien?.(lien, noms) ?? null : null;
    const agir = (classe, texte, operation, principal = false) => {
      const bouton = el('button', { class: `bouton${principal ? ' bouton-principal' : ''} ${classe}`, type: 'button' }, texte);
      bouton.addEventListener('click', () => enFile(async () => {
        etat.erreurMurs = null;
        try {
          await operation();
        } catch (erreur) {
          etat.erreurMurs = { cle: c.cle, texte: erreur.message };
        }
        afficher();
      }));
      return bouton;
    };
    const preparer = () => actions.preparer({ nom: presta.nom, debut: presta.debut, fin: presta.fin, lieu: c.lieu ?? '', murs: m.murs, lien, parc: parcId });
    const boutons = [];
    if (actions && noms.length) {
      if (!lie) {
        if (m.pret) boutons.push(agir('pl-preparer-murs', 'Préparer les murs', preparer, true));
      }
      else {
        boutons.push(agir('pl-ouvrir-presta', 'Ouvrir la presta', () => actions.ouvrir(lie.prestaId, lie.murOuvrir), !lie.ecart && !lie.manquants.length));
        if (lie.ecart) boutons.push(agir('pl-lien-vu', 'C\'est vu', () => actions.vu(lie.prestaId, lien.empreinte)));
        else if (lie.manquants.length && m.pret) boutons.push(agir('pl-completer-murs', `Compléter les murs (${lie.manquants.length})`, preparer, true));
      }
    }
    return el('div', { class: 'pl-devis-murs' },
      m?.murs.length ? el('p', { class: 'pl-murs-titre' }, m.murs.length > 1 ? `Murs du devis (${m.murs.length})` : 'Mur du devis') : null,
      m?.murs.length ? el('ul', { class: 'pl-murs-liste' }, ...m.resume.map((t) => el('li', {}, t))) : null,
      montage(m, lie, noms),
      ...(m?.alertes ?? []).map((t) => el('p', { class: 'pl-devis-alerte' }, t)),
      parc ? null : choixParc(c, d, b.parcs ?? []),
      ...choixDalles(c, parc, m?.aChoisir ?? []),
      ...dallesRetenues(parc, m?.retenues ?? []),
      m?.processeurs ? el('p', { class: `pl-devis-processeurs${m.processeurs.alerte ? ' pl-devis-processeurs-ecart' : ''}` }, m.processeurs.texte) : null,
      ajout && actions?.ajouterAuParc ? blocAjoutParc(c, parc, ajout) : null,
      lie ? el('p', { class: 'pl-aide pl-presta-liee' }, `Presta de l'appli : ${lie.nom}`) : null,
      lie?.ecart ? el('p', { class: 'pl-devis-ecart' }, 'Devis modifié depuis la préparation des murs : vérifie tes murs, rien n\'a été changé.') : null,
      etat.erreurMurs?.cle === c.cle ? el('p', { class: 'pl-devis-erreur-murs', role: 'alert' }, etat.erreurMurs.texte) : null,
      boutons.length ? el('div', { class: 'actions' }, ...boutons) : null);
  }

  // Montage lu dans le devis (étape 26) : une ligne par section de mur, les deux sortes d'indices en alerte ; murs
  // déjà préparés d'une presta liée : « vérifie Poids » (leur réglage n'est pas relu ni touché).
  function montage(m, lie, noms) {
    if (!m?.montages?.length) return null;
    const prepares = lie ? noms.filter((n) => !lie.manquants.includes(n)) : [];
    return el('div', { class: 'pl-montage' }, el('p', { class: 'pl-murs-titre' }, 'Montage lu dans le devis'),
      ...lignesMontage(m.montages, { prepares }).map((l) => el('p', { class: `pl-montage-ligne${l.alerte ? ' pl-devis-alerte' : ''}` }, l.texte)));
  }

  // Parc de la boîte choisi sur la carte quand elle n'en a pas (lot 25e4), gardé dans les réglages du planning comme le
  // sélecteur « Parc » de la boîte ; base sans parc : la phrase qui renvoie à l'onglet Base.
  function choixParc(c, d, parcs) {
    if (!parcs.length) return el('p', { class: 'pl-aide pl-aucun-parc' }, 'Aucun parc dans ta base : crée-le dans l\'onglet Base.');
    const boite = (etat.reglages.boites ?? []).find((x) => x.id === d.boite);
    const id = `pl-parc-carte-${c.cle.replace(/[^a-z0-9-]/gi, '-')}`;
    const select = el('select', { id, class: 'pl-parc-carte' }, el('option', { value: '' }, 'Aucun'), ...parcs.map((x) => el('option', { value: x.id }, x.nom)));
    select.addEventListener('change', () => {
      if (!select.value) return;
      etat.reglages = reglerParcBoite(etat.reglages, d.boite, select.value);
      enregistrerReglages();
      afficherEtatReglage();
      afficher();
    });
    return el('div', { class: 'champ pl-champ-parc' },
      el('label', { for: id }, `Parc de ${boite?.affichage ?? d.boite}`), select,
      el('p', { class: 'pl-aide pl-parc-carte-aide' }, 'Le choix est retenu pour tous les devis de cette boîte.'));
  }

  // Dalle du devis à choisir parmi plusieurs fiches (lot 25e3) : un sélecteur par référence, le choix est retenu par le
  // parc de la boîte (`parc.references`) et sert aux devis suivants ; sans parc, le parc se choisit d'abord (`choixParc`).
  function choixDalles(c, parc, aChoisir) {
    if (!aChoisir.length || !actions?.ajouterAuParc || !parc) return [];
    return aChoisir.map((a, i) => {
      const id = `pl-dalle-${c.cle.replace(/[^a-z0-9-]/gi, '-')}-${i}`;
      const select = el('select', { id, class: 'pl-choix-dalle' }, el('option', { value: '' }, 'Choisis la fiche'), ...a.candidats.map((x) => el('option', { value: x.id }, libelleFiche(x))));
      select.addEventListener('change', () => {
        if (!select.value) return;
        enFile(async () => {
          await actions.ajouterAuParc(parc.id, { dalles: [], processeurs: [], references: { [a.ref]: select.value } });
          afficher();
        });
      });
      return el('div', { class: 'champ pl-champ-dalle' }, el('label', { for: id }, `${a.ref} : ${a.designation}`), select);
    });
  }

  // Dalle retenue par le parc pour une référence du devis, avec « Changer » qui l'oublie (lot 25e4) : la dalle redevient
  // à choisir sur la carte.
  function dallesRetenues(parc, retenues) {
    if (!parc || !actions?.changerDalle) return [];
    return retenues.map((r) => {
      const changer = el('button', { class: 'bouton pl-changer-dalle', type: 'button', 'aria-label': `Changer la dalle de ${r.ref}` }, 'Changer');
      changer.addEventListener('click', () => enFile(async () => {
        await actions.changerDalle(parc.id, r.ref);
        afficher();
      }));
      return el('div', { class: 'pl-dalle-retenue-ligne' }, el('p', { class: 'pl-dalle-retenue' }, `${r.ref} : ${libelleFiche(r)}`), changer);
    });
  }

  // « Ajouter au parc » replié : fiches du devis absentes du parc de la boîte ; jamais de « Nombre dans le parc ».
  function blocAjoutParc(c, parc, ajout) {
    const nombre = ajout.dalles.length + ajout.processeurs.length;
    const bouton = el('button', { class: 'bouton pl-ajouter-parc', type: 'button' }, 'Ajouter au parc');
    bouton.addEventListener('click', () => enFile(async () => {
      await actions.ajouterAuParc(parc.id, { dalles: ajout.dalles.map((x) => x.id), processeurs: ajout.processeurs.map((x) => x.id), references: {} });
      afficher();
    }));
    const ligne = (type, x) => el('li', {}, `${type} : ${libelleFiche(x)}`);
    return el('details', { class: 'pl-ajout-parc' },
      el('summary', {}, `Ajouter au parc ${parc.nom} (${nombre})`),
      el('ul', {}, ...ajout.dalles.map((x) => ligne('Dalle', x)), ...ajout.processeurs.map((x) => ligne('Processeur', x))),
      el('p', { class: 'pl-aide' }, 'Le nombre dans le parc ne change pas : saisis-le dans l\'onglet Base.'),
      el('div', { class: 'actions' }, bouton));
  }

  // Alerte forte « Modifiée (ou Retirée) après saisie dans Intermittent », jusqu'à « C'est corrigé ».
  function alerteSaisie(a) {
    const corrige = el('button', { class: 'bouton', type: 'button', 'data-focus': `corrige-${a.boite}-${a.cle}` }, 'C\'est corrigé');
    corrige.addEventListener('click', () => enFile(async () => {
      etat.donnees = confirmerAlerteSaisie(etat.donnees, a.boite, a.cle);
      await enregistrerDonnees();
      afficher();
    }));
    return el('div', { class: 'alerte alerte-erreur pl-alerte-saisie' }, el('p', {}, el('strong', {}, a.texte)), el('div', { class: 'actions' }, corrige));
  }

  // Case « Saisie dans Intermittent » et « Copier pour Intermittent » (fiche en texte simple).
  function blocIntermittent(c) {
    const caseSaisie = el('input', { type: 'checkbox', checked: c.saisie ? '' : null, 'data-focus': `saisie-${c.cle}` });
    caseSaisie.addEventListener('change', () => {
      const coche = caseSaisie.checked;
      enFile(async () => {
        etat.donnees = saisirJournee(etat.donnees, c.cle, coche, maintenant());
        await enregistrerDonnees();
        afficher();
      });
    });
    const copie = el('button', { class: 'bouton pl-copier-intermittent', type: 'button', 'data-icone': 'copier', 'data-focus': `copier-${c.cle}` }, 'Copier pour Intermittent');
    copie.addEventListener('click', () => {
      const envoi = copier(c.copie);
      enFile(async () => {
        const ok = (await envoi) !== false;
        etat.statutCarte = { cle: c.cle, texte: ok ? 'Copié : colle-le dans Intermittent.' : 'Copie impossible : recopie la fiche ci-dessous.', fiche: ok ? null : c.copie };
        afficher();
      });
    });
    const statut = etat.statutCarte?.cle === c.cle ? etat.statutCarte : null;
    return el('div', { class: 'pl-intermittent' },
      el('label', { class: 'case pl-saisie' }, caseSaisie, el('span', {}, 'Saisie dans Intermittent')),
      copie,
      statut ? el('p', { class: 'pl-statut-carte', role: 'status' }, statut.texte) : null,
      statut?.fiche ? el('pre', { class: 'pl-fiche-texte' }, statut.fiche) : null);
  }

  function blocIndispos(liste) {
    if (!liste.length) return null;
    return el('details', { class: 'pl-indispos' },
      el('summary', {}, `${liste.length} ${liste.length > 1 ? 'indisponibilités' : 'indisponibilité'}`),
      el('ul', {}, ...liste.map((i) => el('li', {}, pastille(i), ' ', insecable(i.texte)))));
  }

  function accueil() {
    const ouvrir = el('button', { class: 'bouton bouton-principal', type: 'button' }, 'Régler le planning');
    ouvrir.addEventListener('click', () => {
      reglages.open = true;
      reglages.scrollIntoView?.({ block: 'start' });
      relais.entree.focus?.();
    });
    return el('section', { class: 'carte pl-accueil' },
      el('h3', {}, 'Planning des piges'),
      el('p', {}, 'Toutes tes dates Eventsoft, de toutes tes boîtes, au même endroit.'),
      el('p', {}, 'L\'appli les lit par ton relais Cloudflare et les garde sur ce téléphone, pour les voir hors ligne.'),
      el('p', {}, 'Pour commencer, colle l\'adresse du relais et ton jeton dans les réglages.'),
      ouvrir);
  }

  function afficher() {
    // Parc supprimé de la base (lot 25e2) : le réglage de ses boîtes est vidé.
    const parcs = base()?.parcs;
    if (parcs) {
      const nettoyes = nettoyerParcsBoites(etat.reglages, parcs.map((x) => x.id));
      if (nettoyes !== etat.reglages) {
        etat.reglages = nettoyes;
        enregistrerReglages();
        afficherEtatReglage();
      }
    }
    if (!reglagesComplets(etat.reglages) && !etat.donnees) {
      remplacer(contenu, accueil());
      return;
    }
    const boites = (etat.reglages.boites ?? []).filter((b) => !b.absente);
    const visibles = boites.map((b) => b.id).filter((id) => !etat.masquees.has(id));
    const actualiser = el('button', { class: 'bouton bouton-principal pl-actualiser', type: 'button', disabled: etat.enCours ? '' : null }, etat.enCours ? 'Lecture en cours…' : 'Actualiser');
    actualiser.addEventListener('click', () => enFile(() => lire()));
    const etats = etatBoites(etat.donnees, etat.reglages);
    const demandes = etat.demandes.map((d) => {
      const retirer = el('button', { class: 'bouton', type: 'button' }, 'Retirer');
      const garder = el('button', { class: 'bouton', type: 'button' }, 'Garder');
      retirer.addEventListener('click', () => enFile(() => lire([d.boite])));
      garder.addEventListener('click', () => {
        etat.demandes = etat.demandes.filter((x) => x !== d);
        afficher();
      });
      return el('div', { class: 'alerte pl-demande', role: 'alert' }, el('p', {}, d.texte), el('div', { class: 'actions' }, retirer, garder));
    });
    const filtres = boites.length > 1 ? el('div', { class: 'pl-filtres', role: 'group', 'aria-label': 'Boîtes affichées' }, ...boites.map((b) => {
      const bouton = el('button', { class: 'puce-trajet pl-filtre', type: 'button', 'aria-pressed': etat.masquees.has(b.id) ? 'false' : 'true', 'data-focus': `filtre-${b.id}` }, pastille(b), ` ${b.affichage}`);
      bouton.addEventListener('click', () => {
        if (etat.masquees.has(b.id)) etat.masquees.delete(b.id);
        else etat.masquees.add(b.id);
        afficher();
      });
      return bouton;
    })) : null;
    const choixVue = el('fieldset', { class: 'segmente pl-vues' },
      el('legend', { class: 'cache-visuel' }, 'Vue du planning'),
      el('div', { class: 'segments' }, VUES.map(([id, nom]) => {
        const radio = el('input', { type: 'radio', name: 'pl-vue', value: id, checked: id === etat.vue ? '' : null, 'data-focus': `vue-${id}` });
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          etat.vue = id;
          afficher();
        });
        return el('label', {}, radio, el('span', {}, nom));
      })));
    const filtre = etat.masquees.size ? visibles : null;
    const devis = etat.devis ? { garde: etat.devis, base: base() } : null;
    const liste = etat.vue === 'liste' ? vueListe(etat.donnees, etat.reglages, maintenant(), { boites: filtre, aSaisir: etat.aSaisir, devis }) : null;
    const filtreSaisir = liste ? el('button', {
      class: 'puce-trajet pl-filtre-saisir', type: 'button', 'aria-pressed': etat.aSaisir ? 'true' : 'false', 'data-focus': 'filtre-saisir',
    }, `À saisir dans Intermittent (${liste.nombreASaisir})`) : null;
    filtreSaisir?.addEventListener('click', () => {
      etat.aSaisir = !etat.aSaisir;
      afficher();
    });
    const corps = etat.vue === 'mois' ? vueMoisElements(filtre, devis)
      : etat.vue === 'totaux' ? vueTotauxElements(filtre)
        : vueListeElements(liste);
    const fraicheur = fraicheurDevis(etat.devis, etat.reglages, maintenant());
    const etatDevis = etat.reglages.cleDevis || etat.devis ? [
      el('p', { class: 'pl-devis-fraicheur' }, fraicheur.texte ? insecable(fraicheur.texte) : 'Aucun devis reçu du robot du Mac pour l\'instant.'),
      fraicheur.alerte ? el('p', { class: 'alerte pl-devis-vieux' }, fraicheur.alerte) : null,
      ...fraicheur.erreurs.map((e) => el('p', { class: 'pl-devis-erreur' }, insecable(e.texte))),
    ] : [];
    const focus = contenu.contains(document.activeElement) ? document.activeElement.dataset?.focus : null;
    remplacer(contenu,
      el('section', { class: 'carte pl-haut' },
        el('ul', { class: 'pl-etats' }, ...etats.map((e) => {
          const b = boites.find((x) => x.id === e.boite);
          return el('li', { class: e.erreur ? 'pl-en-erreur' : null }, b ? pastille(b) : null, el('span', { class: 'pl-etat-boite' }, insecable(e.erreur ? e.texte : `${e.nom} : ${e.texte}`)));
        })),
        ...etatDevis,
        el('div', { class: 'pl-messages', role: 'status', 'aria-live': 'polite' },
          etat.message ? el('p', { class: 'alerte alerte-erreur' }, etat.message) : null,
          etat.messageDevis ? el('p', { class: 'alerte alerte-erreur' }, etat.messageDevis) : null,
          !enLigne() ? el('p', { class: 'alerte alerte-info' }, 'Hors ligne : dates gardées sur ce téléphone.') : null,
          ...demandes),
        el('div', { class: 'actions' }, actualiser)),
      choixVue,
      filtres,
      filtreSaisir ? el('div', { class: 'pl-filtres pl-filtres-saisir' }, filtreSaisir) : null,
      ...corps);
    if (focus) contenu.querySelector(`[data-focus="${focus}"]`)?.focus();
  }

  function vueListeElements(vue) {
    const voir = el('button', { class: 'bouton pl-voir-passees', type: 'button', 'aria-expanded': etat.passees ? 'true' : 'false', 'data-focus': 'passees' }, etat.passees ? 'Masquer les dates passées' : 'Voir les dates passées');
    voir.addEventListener('click', () => {
      etat.passees = !etat.passees;
      afficher();
    });
    return [
      el('section', { class: 'pl-a-venir' },
        el('h3', {}, 'À venir'),
        vue.aVenir.length ? vue.aVenir.map(carteJournee) : el('p', { class: 'pl-vide' }, etat.aSaisir ? 'Rien à saisir à venir.' : 'Aucune date à venir.'),
        blocIndispos(vue.indisposAVenir)),
      voir,
      el('section', { class: 'pl-passees', hidden: etat.passees ? null : '' },
        el('h3', {}, 'Dates passées'),
        vue.passees.length ? vue.passees.map(carteJournee) : el('p', { class: 'pl-vide' }, etat.aSaisir ? 'Rien à saisir dans les dates passées.' : 'Aucune date passée.'),
        blocIndispos(vue.indisposPassees)),
    ];
  }

  // Grille du mois : un bouton par jour du mois (étiquette lue : date, boîtes, indisponible, conflit, repos court),
  // le jour touché enfoncé et ses journées sous la grille ; mois précédent et suivant.
  function vueMoisElements(filtre, devis) {
    const m = vueMois(etat.donnees, etat.reglages, maintenant(), { mois: etat.mois, boites: filtre, jour: etat.jour, devis });
    const changerMois = (mois) => {
      etat.mois = mois;
      etat.jour = null;
      afficher();
    };
    const precedent = el('button', { class: 'bouton bouton-icone pl-mois-precedent', type: 'button', 'aria-label': 'Mois précédent', 'data-focus': 'mois-precedent' }, '‹');
    const suivant = el('button', { class: 'bouton bouton-icone pl-mois-suivant', type: 'button', 'aria-label': 'Mois suivant', 'data-focus': 'mois-suivant' }, '›');
    precedent.addEventListener('click', () => changerMois(m.precedent));
    suivant.addEventListener('click', () => changerMois(m.suivant));
    const jourCase = (c) => {
      const classes = ['pl-mois-jour', c.dansMois ? null : 'pl-mois-hors', c.aujourdhui ? 'pl-aujourdhui' : null, c.indispo ? 'pl-jour-indispo' : null].filter(Boolean).join(' ');
      const dedans = [
        el('span', { class: 'pl-mois-num' }, String(c.numero)),
        c.boites.length ? el('span', { class: 'pl-mois-pastilles' }, ...c.boites.map((b) => pastille(b))) : null,
        c.conflit ? el('span', { class: 'pl-marque-conflit', 'aria-hidden': 'true' }, '!') : c.repos ? el('span', { class: 'pl-marque-repos', 'aria-hidden': 'true' }, '!') : null,
      ];
      if (!c.dansMois) return el('div', { class: classes, 'data-date': c.date, 'aria-hidden': 'true' }, dedans[0]);
      const bouton = el('button', {
        class: classes, type: 'button', 'data-date': c.date, 'data-focus': `jour-${c.date}`, 'aria-label': c.etiquette,
        'aria-pressed': etat.jour === c.date ? 'true' : 'false', 'aria-current': c.aujourdhui ? 'date' : null,
      }, ...dedans);
      bouton.addEventListener('click', () => {
        etat.jour = etat.jour === c.date ? null : c.date;
        afficher();
      });
      return bouton;
    };
    const j = m.jour;
    const sousGrille = j
      ? el('section', { class: 'pl-jour-choisi' },
        el('h3', {}, j.titre),
        ...j.cartes.map(carteJournee),
        j.indispos.length ? el('ul', { class: 'pl-indispos-jour' }, ...j.indispos.map((i) => el('li', {}, pastille(i), ' ', insecable(i.texte)))) : null,
        !j.cartes.length && !j.indispos.length ? el('p', { class: 'pl-vide' }, 'Rien ce jour-là.') : null)
      : el('section', { class: 'pl-jour-choisi' }, el('p', { class: 'pl-aide' }, 'Touche un jour pour voir ses dates.'));
    return [
      el('section', { class: 'pl-mois' },
        el('div', { class: 'pl-mois-tete' }, precedent, el('h3', { class: 'pl-mois-titre', 'aria-live': 'polite' }, m.titre), suivant),
        el('div', { class: 'pl-mois-semaine', 'aria-hidden': 'true' }, ...JOURS_GRILLE.map(([l, nom]) => el('abbr', { title: nom }, l))),
        el('div', { class: 'pl-mois-grille' }, ...m.semaines.flat().map(jourCase)),
        el('ul', { class: 'pl-mois-legende' },
          el('li', {}, el('span', { class: 'pl-marque-conflit', 'aria-hidden': 'true' }, '!'), 'conflit'),
          el('li', {}, el('span', { class: 'pl-marque-repos', 'aria-hidden': 'true' }, '!'), 'moins de 11 h de repos'),
          el('li', {}, el('span', { class: 'pl-hachures', 'aria-hidden': 'true' }), 'indisponible'))),
      sousGrille,
    ];
  }

  // Tableau des totaux : une colonne par boîte et le total, une ligne par mois ; il défile dans son cadre.
  function vueTotauxElements(filtre) {
    const t = vueTotaux(etat.donnees, etat.reglages, maintenant(), { boites: filtre });
    const valeur = (c, extra = null) => el('td', { class: c.journees ? null : 'pl-zero' },
      el('span', { class: 'pl-totaux-j' }, c.texte), el('span', { class: 'pl-totaux-h' }, insecable(c.heuresTexte)), extra);
    const d = t.douzeMois;
    return [
      el('section', { class: 'carte pl-douze-mois' },
        el('h3', {}, d.titre),
        el('p', { class: 'pl-douze-valeur' }, insecable(d.texte)),
        d.aVenirTexte ? el('p', { class: 'pl-douze-venir' }, d.aVenirTexte) : null),
      t.lignes.length
        ? el('div', { class: 'tableau-defilant pl-totaux-cadre' },
          el('table', { class: 'pl-totaux' },
            el('thead', {}, el('tr', {},
              el('th', { scope: 'col' }, 'Mois'),
              ...t.colonnes.map((c) => el('th', { scope: 'col' }, pastille(c), ' ', c.nom)),
              el('th', { scope: 'col' }, 'Total'))),
            el('tbody', {}, ...t.lignes.map((l) => el('tr', { class: l.partie ? 'pl-mois-en-cours' : null },
              el('th', { scope: 'row' }, l.titre),
              ...l.cellules.map((c) => valeur(c)),
              valeur(l.total, el('span', { class: 'pl-totaux-d' }, l.total.datesTexte)))))))
        : el('p', { class: 'pl-vide' }, 'Aucune journée.'),
      el('p', { class: 'pl-aide pl-note-heures' }, t.note),
    ];
  }

  remplacer(racine, contenu, reglages);

  const pret = (async () => {
    try {
      etat.reglages = { ...reglagesVides(), ...((await stockage?.lire(CLES_PLANNING.reglages)) ?? {}) };
      etat.donnees = (await stockage?.lire(CLES_PLANNING.etat)) ?? null;
      etat.devis = (await stockage?.lire(CLE_DEVIS)) ?? null;
    } catch {
      // Stockage indisponible : écran vide, réglages à saisir.
    }
    afficherEtatReglage();
    afficher();
    signaler();
    await lectureAuto();
  })();

  return {
    pret,
    calme,
    lectureAuto,
    // Base de l'appli chargée ou changée (parcs, fiches) : choix du parc des boîtes et murs des devis refaits.
    rafraichirBase: async () => {
      await pret;
      afficherEtatReglage();
      afficher();
    },
    actualiser: () => {
      enFile(() => lire());
      return calme();
    },
    // L'onglet est ouvert : lecture si elle est due, puis les marques « Nouveau » et « Modifié » vues (elles restent
    // affichées jusqu'au prochain affichage) et la pastille de l'onglet effacée.
    ouvrir: async () => {
      await lectureAuto();
      await calme();
      afficher();
      if (etat.donnees?.boites) {
        const t = maintenant();
        etat.donnees = { ...etat.donnees, boites: Object.fromEntries(Object.entries(etat.donnees.boites).map(([id, eb]) => [id, marquerVu(eb, t)])) };
        await enregistrerDonnees();
      }
      if (etat.devis) {
        etat.devis = devisVu(etat.devis, maintenant());
        await enregistrerDevis();
      }
      surNouvelles(0);
    },
  };
}
