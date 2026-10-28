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

import { el, remplacer } from './dom.js';
import { copier as copierTexte } from './copie.js';
import { partagerFichier } from './export.js';
import { CLES_PLANNING, PALETTE_BOITES, reglagesVides, reglagesComplets, adresseRelais, jetonValide, adressesApple } from './planning/reglages.js';
import { lirePlanning, testerConnexion, lectureDue } from './planning/relais.js';
import { vueListe, vueMois, vueTotaux, etatBoites } from './planning/affichage.js';
import { marquerVu, nombreNouvelles, saisirJournee, confirmerAlerteSaisie } from './planning/journees.js';
import { exporterPlanning, lireExportPlanning, importerPlanning, nomFichierPlanning } from './planning/sauvegarde.js';

const NOMS_COULEURS = ['Orange', 'Vert', 'Jaune', 'Violet', 'Bleu', 'Rose', 'Sable', 'Menthe'];
const VUES = [['liste', 'Liste'], ['mois', 'Mois'], ['totaux', 'Totaux']];
const JOURS_GRILLE = [['L', 'lundi'], ['M', 'mardi'], ['M', 'mercredi'], ['J', 'jeudi'], ['V', 'vendredi'], ['S', 'samedi'], ['D', 'dimanche']];

// Heures (« 17 h 06 ») et dates (« jeu. 29/10 ») jamais coupées en fin de ligne.
const insecable = (t) => String(t).replace(/\d+ h( \d\d)?/g, (m) => m.replace(/ /g, '\u00a0')).replace(/(\p{L}+\.) (\d\d\/\d\d)/gu, '$1\u00a0$2');

const pastille = (repere) => el('span', { class: 'pl-pastille', style: `--boite: ${repere.couleur}`, 'aria-hidden': 'true' }, repere.lettre);

// `stockage` : { lire, ecrire } (IndexedDB de l'appli) ; `surNouvelles(n)` : pastille de l'onglet ; `copier(texte)` :
// presse-papiers (false si la copie échoue) ; `ouvrir(url)` : abonnement webcal:// ; `partager(contenu, nom)` : fichier
// exporté (feuille de partage, sinon téléchargement).
export function monterPlanning(racine, {
  stockage, fetch = (...a) => globalThis.fetch(...a), maintenant = () => Date.now(), enLigne = () => navigator.onLine, surNouvelles = () => {},
  copier = copierTexte, ouvrir = (url) => { window.location.href = url; },
  partager = (contenu, nom) => partagerFichier(contenu, nom, 'application/json'),
}) {
  const etat = {
    reglages: reglagesVides(), donnees: null, masquees: new Set(), passees: false, demandes: [], message: null, enCours: false,
    vue: 'liste', mois: null, jour: null, aSaisir: false, statutCarte: null,
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
    el('div', { class: 'formulaire' }, relais.bloc, jeton.bloc, jetonApple.bloc),
    erreurReglage,
    el('div', { class: 'actions' }, boutonEnregistrer, boutonTester),
    resultatTest,
    listeBoites,
    statutApple,
    el('h3', {}, 'Sauvegarde'),
    el('p', { class: 'pl-aide' }, 'Pour changer de téléphone : tes dates gardées, les cases Intermittent, les noms, couleurs et lettres des boîtes. Sans l\'adresse du relais ni les jetons, à saisir à nouveau.'),
    el('div', { class: 'actions pl-sauvegarde' }, boutonExporter, boutonImporter, choixImport),
    resultatSauvegarde,
    el('p', { class: 'pl-aide' }, 'L\'adresse et les jetons restent sur ce téléphone : jamais dans un export, une presta ni « Tout copier ».'),
    el('div', { class: 'actions pl-actions-danger' }, boutonEffacer));

  function afficherEtatReglage() {
    const r = etat.reglages;
    remplacer(etatReglage,
      el('li', {}, `Adresse du relais : ${r.relais ? 'enregistrée' : 'à saisir'}`),
      el('li', {}, `Jeton de l'appli : ${r.jeton ? 'enregistré' : 'à saisir'}`),
      el('li', {}, `Jeton Apple : ${r.jetonApple ? 'enregistré' : 'à saisir'}`));
    relais.entree.placeholder = r.relais ? 'Enregistrée, laisse vide' : 'https://…';
    jeton.entree.placeholder = r.jeton ? 'Enregistré, laisse vide' : '';
    jetonApple.entree.placeholder = r.jetonApple ? 'Enregistré, laisse vide' : '';
    const avecApple = Boolean(adressesApple(r, 'x'));
    remplacer(listeBoites, (r.boites ?? []).filter((b) => !b.absente).length === 0 ? null : [
      el('h3', {}, 'Boîtes'),
      avecApple
        ? el('div', { class: 'pl-rappel-apple' },
          el('p', { class: 'pl-aide' }, '« Ajouter à Calendrier » t\'abonne au planning de la boîte, sans les indisponibilités. Si tu es déjà abonné aux liens Eventsoft dans Calendrier, désabonne-toi de ceux-là pour éviter les doublons : dans Calendrier, Calendriers, bouton i du calendrier, Se désabonner.'),
          el('p', { class: 'pl-aide' }, 'Si le bouton n\'ouvre pas Calendrier : « Copier l\'adresse », puis dans Calendrier, Calendriers, Nouv. calendrier, Ajouter un calendrier avec abonnement, et colle l\'adresse.'))
        : el('p', { class: 'pl-aide pl-apple-manque' }, 'Saisis le jeton Apple pour t\'abonner dans Calendrier : un bouton par boîte apparaîtra ici.'),
      ...r.boites.filter((b) => !b.absente).map((b) => {
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
        return el('fieldset', { class: 'pl-boite-reglage' },
          el('legend', {}, pastille(b), ` ${b.nom}`),
          el('div', { class: 'champ' }, el('label', { for: nom.id }, 'Nom affiché'), nom),
          el('div', { class: 'paire' },
            el('div', { class: 'champ' }, el('label', { for: lettre.id }, 'Lettre'), lettre),
            el('div', { class: 'champ' }, el('label', { for: couleur.id }, 'Couleur'), couleur)),
          avecApple ? boutonsApple(b) : null);
      }),
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
    const envoi = partager(JSON.stringify(exporterPlanning(etat.reglages, etat.donnees, t), null, 2), nomFichierPlanning(t));
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
      const r = importerPlanning(etat.reglages, etat.donnees, lu.donnees);
      etat.reglages = r.reglages;
      etat.donnees = r.etat;
      await enregistrerDonnees();
      await enregistrerReglages();
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
    erreurReglage.textContent = erreurs.join(' ');
    if (erreurs.length) return;
    for (const c of [relais, jeton, jetonApple]) c.entree.value = '';
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
    if (!confirm('Effacer l\'adresse du relais et les jetons de ce téléphone ? Tes dates gardées restent.')) return;
    etat.reglages = { ...etat.reglages, relais: null, jeton: null, jetonApple: null };
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
    } else etat.message = res.texte;
    signaler();
    afficher();
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
    ].filter(Boolean);
    const lieu = c.lieu ? (c.plans ? el('a', { href: c.plans, target: '_blank', rel: 'noopener noreferrer' }, c.lieu) : c.lieu) : null;
    return el('article', { class: `pl-carte${c.retiree ? ' pl-retiree' : ''}`, 'data-cle': c.cle },
      el('div', { class: 'pl-carte-tete' },
        pastille(repere),
        el('span', { class: 'pl-boite' }, c.nom),
        el('span', { class: 'pl-jour' }, insecable(c.jour)),
        el('span', { class: 'pl-horaires' }, insecable(c.horaires))),
      puces.length ? el('div', { class: 'pl-puces' }, ...puces) : null,
      el('p', { class: 'pl-presta' }, c.presta),
      c.phases ? el('p', { class: 'pl-detail' }, c.phases) : null,
      lieu ? el('p', { class: 'pl-detail' }, lieu, c.autresLieux?.length ? ` (aussi : ${c.autresLieux.join(', ')})` : '') : null,
      c.client ? el('p', { class: 'pl-detail' }, c.client, c.autresClients?.length ? ` (aussi : ${c.autresClients.join(', ')})` : '') : null,
      ...c.ancien.map((a) => el('p', { class: 'pl-ancien' }, insecable(a))),
      ...(c.alertes ?? []).map((a) => el('p', { class: `pl-alerte pl-alerte-${a.type}` }, insecable(a.texte))),
      c.retiree ? el('p', { class: 'pl-retire-texte' }, c.retiree) : null,
      c.alerteSaisie ? alerteSaisie(c.alerteSaisie) : null,
      c.retiree ? null : blocIntermittent(c));
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
    const liste = etat.vue === 'liste' ? vueListe(etat.donnees, etat.reglages, maintenant(), { boites: filtre, aSaisir: etat.aSaisir }) : null;
    const filtreSaisir = liste ? el('button', {
      class: 'puce-trajet pl-filtre-saisir', type: 'button', 'aria-pressed': etat.aSaisir ? 'true' : 'false', 'data-focus': 'filtre-saisir',
    }, `À saisir dans Intermittent (${liste.nombreASaisir})`) : null;
    filtreSaisir?.addEventListener('click', () => {
      etat.aSaisir = !etat.aSaisir;
      afficher();
    });
    const corps = etat.vue === 'mois' ? vueMoisElements(filtre)
      : etat.vue === 'totaux' ? vueTotauxElements(filtre)
        : vueListeElements(liste);
    const focus = contenu.contains(document.activeElement) ? document.activeElement.dataset?.focus : null;
    remplacer(contenu,
      el('section', { class: 'carte pl-haut' },
        el('ul', { class: 'pl-etats' }, ...etats.map((e) => {
          const b = boites.find((x) => x.id === e.boite);
          return el('li', { class: e.erreur ? 'pl-en-erreur' : null }, b ? pastille(b) : null, el('span', { class: 'pl-etat-boite' }, insecable(e.erreur ? e.texte : `${e.nom} : ${e.texte}`)));
        })),
        el('div', { class: 'pl-messages', role: 'status', 'aria-live': 'polite' },
          etat.message ? el('p', { class: 'alerte alerte-erreur' }, etat.message) : null,
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
  function vueMoisElements(filtre) {
    const m = vueMois(etat.donnees, etat.reglages, maintenant(), { mois: etat.mois, boites: filtre, jour: etat.jour });
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
      surNouvelles(0);
    },
  };
}
