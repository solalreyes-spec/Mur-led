// Règles complémentaires, suite de tests/regles.js (R301 et suivantes), coupée le 05/11/2026 pour rester sous
// la limite de 1 Mo de la garde de publication. Mêmes règles, mêmes valeurs attendues ; la page de tests et
// node.test.js réunissent REGLES et REGLES_2.

import * as calculs from '../src/calculs.js';
import * as fiches from '../src/fiches.js';
import * as resumes from '../src/resumes.js';
import { modeEnregistrement, choixPartageFichier } from '../src/export.js';
import * as rappels from '../src/rappels.js';
import * as couleurs from '../src/couleurs.js';
import * as montage from '../src/montage.js';
import * as contenu from '../src/contenu.js';
import * as entrainement from '../src/entrainement.js';
import * as zones from '../src/zones.js';
import * as prestas from '../src/prestas.js';
import * as fichesMetier from '../src/fiches-metier.js';
import * as pdf from '../src/pdf.js';
import * as novalct from '../src/novalct.js';
import * as connexion from '../src/connexion.js';
import * as terrain from '../src/terrain.js';
import { nombre, sourceCourte } from '../src/format.js';
import {
  DALLE_CAS_13, P10, CB5, CB5_DEMI, CB5_DEMI_ATYPIQUE, DEMI_TROP_ETROITE,
  CABINET_CAS_4, CABINET_CAS_5, DALLE_CAS_7, DALLE_64, DALLE_64X32, DALLE_16, DALLE_256,
  DALLE_CARTE_A10S, DALLE_CARTE_CA50E, DALLE_200, DALLE_120, DALLE_12, DALLE_CAS_9_A, DALLE_CAS_9_B, DALLE_CAS_9_C,
  DALLE_100W_CHAINAGE, DALLE_APPEL, DALLE_SANS_PMAX, DALLE_MAX_METRES, DALLE_MAX_KILOS, DALLE_MAX_3M,
} from './dalles-fictives.js';
import { processeurDeBase, liaisonsDeBase, regieDeBase, dalleDeBase, bumperDeBase, baseProcesseurs, baseDalles } from './base.js';
import {
  questionsEntrainement, TABLEAU_BROMPTON, BROMPTON_60_10, NOVASTAR_60_8, COLORLIGHT_60_8, DALLE_I5A,
  DALLE_HC5, DALLE_128X256, pasAPasNovaLCT, etapeNovaLCT, ongletsTerrain, pasSecours,
  varianteSchema, xBp2, chaineCanvas, suiteDe, exercice, distributeursDeBase,
  imposerData, varianteImposee, pasAPasImpose, colonnesDesPorts, ligneDe, textesEssai,
  listeEssai, ORGANISATION_SAISIE, ORGANISATION_ESSAI, varianteConseil, MUR_FICTIF, ELEC_TRI_FICTIF,
  varianteFictive, varianteArrivees, elecArrivees, contenuBoitiers, distributionCoherente, messageErreur,
  colonnesDe, colonnesEntieres, droit, verifierCouverture, position, voisines,
  rectanglePlein, verifierPorts, verifierLignes, MAINTENANT_PRESTA, optionsPresta, horloge,
  configurationEssai, prestaEssai, autreAppareil, donneesTerrain, pannesEssai, entreesTerrain,
} from './regles.js';

export const REGLES_2 = [
  {
    id: 'R301',
    titre: 'Prestas (10b2, § 7) : ligne « Presta A, du 17 au 19/10/2026, Lieu B · Mur 1 » sous l\'en-tête daté de « Tout copier », texte d\'avant mot pour mot sans elle ; résumé d\'un mur lu dans ses saisies, sans calcul (dalle, taille, cible ou zones, parc)',
    etape: '10b',
    verifier(v) {
      const { presta } = prestaEssai(optionsPresta());
      v.egal('ligne de presta, avec ou sans dates et lieu', [prestas.lignePresta(presta, 'Mur 1'), prestas.lignePresta({ ...presta, debut: null, fin: null, lieu: '' }, 'Mur 2')],
        ['Presta A, du 17 au 19/10/2026, Lieu B · Mur 1', 'Presta A · Mur 2']);
      const date = new Date(2026, 9, 13);
      v.egal('Tout copier sans ligne de presta : le texte d\'avant', resumes.toutResumer(['MUR', null, 'DATA'], date), 'Mur LED, calcul du 13/10/2026\n\nMUR\n\nDATA');
      v.egal('Tout copier avec la ligne de presta, sous l\'en-tête daté', resumes.toutResumer(['MUR'], date, 'Presta A · Mur 1'), 'Mur LED, calcul du 13/10/2026\nPresta A · Mur 1\n\nMUR');
      const noms = { nomDalle: (id) => ({ 'roe-bp2-v2': 'BP2 V2' })[id] ?? null, nomParc: (id) => ({ 'prestataire-a': 'Prestataire A' })[id] ?? null };
      const resume = (champs, parc = null) => prestas.resumeMur({ parc, configuration: champs ? { formulaires: { 'form-mur': champs } } : null }, noms);
      v.egal('résumé d\'un mur', [
        resume({ mode: 'dalles', dalle: 'roe-bp2-v2', colonnes: '12', lignes: '6' }, 'prestataire-a'),
        resume({ mode: 'taille', dalle: 'roe-bp2-v2', largeurM: '6', hauteurM: '3.5' }),
        resume({ mode: 'resolution', dalle: 'roe-bp2-v2', largeurPx: '1920', hauteurPx: '1080' }),
        resume({ mode: 'zones', dalle: 'roe-bp2-v2', zones: JSON.stringify([{ nom: 'A' }, { nom: 'B' }]) }),
        resume({ mode: 'dalles', dalle: 'inconnue', colonnes: '4', lignes: '2' }, 'parc-supprime'),
        resume(null),
      ], [
        'BP2 V2, 12 × 6 dalles, parc Prestataire A', 'BP2 V2, cible 6 × 3,5 m', 'BP2 V2, cible 1920 × 1080 px', 'BP2 V2, 2 zones', 'Dalle inconnue, 4 × 2 dalles', 'Réglages par défaut',
      ]);
    },
  },
  {
    id: 'R302',
    titre: 'Prestas (10b2, § 4) : écritures du stockage après une opération : l\'index « prestas » s\'il a changé, la clé « mur:<id> » de chaque mur nouveau ou changé, les murs disparus effacés ; rien quand rien ne change',
    etape: '10b',
    verifier(v) {
      const o = optionsPresta();
      const { etat, presta } = prestaEssai(o);
      const cles = (e) => ({ ecrire: e.ecrire.map(([k]) => k).sort(), effacer: [...e.effacer].sort() });
      const [mur1, mur2] = presta.murs.map((m) => m.id);
      v.egal('rien ne change', prestas.ecrituresPrestas(etat, etat), { ecrire: [], effacer: [] });
      v.egal('premier enregistrement (migration) : l\'index et chaque mur', cles(prestas.ecrituresPrestas(null, etat)),
        { ecrire: ['prestas', ...Object.keys(etat.murs).map((id) => `mur:${id}`)].sort(), effacer: [] });
      const saisie = prestas.enregistrerMur(etat, mur2, { configuration: configurationEssai(8) }, horloge(o, '2026-10-13T16:00:00Z'));
      const ecr = prestas.ecrituresPrestas(etat, saisie);
      v.egal('saisie d\'un mur : sa clé et l\'index (date de modification)', cles(ecr), { ecrire: [`mur:${mur2}`, 'prestas'].sort(), effacer: [] });
      v.egal('valeurs écrites : le mur et l\'index', [ecr.ecrire.find(([k]) => k === `mur:${mur2}`)[1], ecr.ecrire.find(([k]) => k === 'prestas')[1]], [saisie.murs[mur2], saisie.index]);
      v.egal('ouvrir un autre mur : l\'index seulement', cles(prestas.ecrituresPrestas(etat, prestas.ouvrir(etat, presta.id, mur1))), { ecrire: ['prestas'], effacer: [] });
      v.egal('supprimer un mur : l\'index, et sa clé effacée', cles(prestas.ecrituresPrestas(etat, prestas.supprimerMur(etat, presta.id, mur1, o))), { ecrire: ['prestas'], effacer: [`mur:${mur1}`] });
    },
  },
  {
    id: 'R303',
    titre: 'Prestas (10b3, § 8) : rapport d\'import en phrases : presta ajoutée, gardée en copie ou remplacée, avec ses murs ; fiches et parcs ajoutés, gardés dans ma version, remplacés ou refusés (les identiques ne sont pas cités) ; fichiers de config décrits mais jamais dans le fichier',
    etape: '10b',
    verifier(v) {
      const vide = { fiches: { ajoutees: [], identiques: [], gardees: [], remplacees: [], refusees: [] }, parcs: { ajoutes: [], identiques: [], gardes: [], remplaces: [] }, fichiersDecrits: [] };
      v.egal('presta ajoutée, rien d\'autre', prestas.texteRapportImport({ ...vide, presta: 'ajoutee', nom: 'Presta A', murs: 2 }), ['Presta A importée, avec ses 2 murs.']);
      v.egal('copie et remplacement, un seul mur', [
        prestas.texteRapportImport({ ...vide, presta: 'copie', nom: 'Presta A (reçue le 16/10/2026)', murs: 1 }),
        prestas.texteRapportImport({ ...vide, presta: 'remplacee', nom: 'Presta A', murs: 1 }),
      ], [['Presta A (reçue le 16/10/2026) ajoutée à côté de la tienne, avec son mur.'], ['Ta presta Presta A remplacée par celle du fichier, avec son mur.']]);
      const complet = {
        presta: 'ajoutee', nom: 'Presta A', murs: 2,
        fiches: { ajoutees: ['essai-dalle-w', 'essai-dalle-z'], identiques: ['roe-cb5-mkii'], gardees: ['roe-bp2-v2'], remplacees: ['essai-proc'], refusees: [{ id: 'essai-vide', erreurs: ['x'] }] },
        parcs: { ajoutes: ['Prestataire B'], identiques: ['Prestataire C'], gardes: ['Prestataire A'], remplaces: ['Prestataire D'] },
        fichiersDecrits: ['BP2V2_A.rcfgx'],
      };
      v.egal('fiches, parcs et fichiers de config', prestas.texteRapportImport(complet), [
        'Presta A importée, avec ses 2 murs.',
        'Fiches ajoutées à ta base : essai-dalle-w, essai-dalle-z.',
        'Fiches gardées dans ta version, différente de celle du fichier (le calcul se fait avec la tienne) : roe-bp2-v2.',
        'Fiches remplacées par celles du fichier : essai-proc.',
        'Fiches refusées, incomplètes : essai-vide.',
        'Parcs ajoutés : Prestataire B.',
        'Parcs gardés dans ta version, différente de celle du fichier : Prestataire A.',
        'Parcs remplacés par ceux du fichier : Prestataire D.',
        'Fichiers de config jamais joints au fichier d\'une presta : BP2V2_A.rcfgx. Joins-les sur cet appareil si besoin (onglet Base, lots du parc).',
      ]);
    },
  },
  {
    id: 'R304',
    titre: 'Prestas, relecture du 16/10/2026 : version modifiée d\'une fiche de départ reçue dans un fichier annoncée comme conflit (fiche de départ gardée par défaut, ajoutée seulement par « Prendre ceux du fichier ») ; demi-dalle de ma base jointe à l\'export par le lien de sa dalle ; fichier mal formé refusé avec sa raison ; identifiant de mur inhabituel remplacé ; saisies inchangées : presta non marquée modifiée ; parc d\'un nouveau mur ou d\'une nouvelle presta donné par l\'appli',
    etape: '10b',
    verifier(v, contexte) {
      const o = optionsPresta();
      const { etat, presta, base, depart } = prestaEssai(o, contexte);
      const texte = JSON.stringify(prestas.exporterPresta(etat, presta.id, base, { ...o, versionAppli: 25 }).donnees);
      const neuf = prestas.migrer({}, o);
      const garde = prestas.importerPresta(neuf, fiches.baseVide(), depart, texte, {}, o);
      v.egal('fiche de départ modifiée reçue : conflit, gardée par défaut, absente de ma base', [prestas.verifierImportPresta(texte, neuf, fiches.baseVide(), depart).conflits.fiches, garde.rapport.fiches.gardees, garde.base.fiches.some((f) => f.fiche.id === 'roe-bp2-v2')],
        [['roe-bp2-v2'], ['roe-bp2-v2'], false]);
      const prise = prestas.importerPresta(neuf, fiches.baseVide(), depart, texte, { conflits: 'prendre' }, o);
      v.egal('« Prendre ceux du fichier » : ajoutée (9,5 kg)', [prise.rapport.fiches.remplacees, prise.base.fiches.find((f) => f.fiche.id === 'roe-bp2-v2')?.fiche.poidsKg.valeur], [['roe-bp2-v2'], 9.5]);
      const demi = contexte.dalles.dalles.find((d) => d.id === 'roe-cb5-mkii-demi');
      const baseDemi = fiches.enregistrerFiche(fiches.baseVide(), 'dalle', { ...demi, poidsKg: { valeur: 6, source: 'perso' } }, { perso: { titre: 'pesée', court: 'Pesée', date: '2026-10-16', confiance: 'mesuré' } });
      const murDemi = prestas.enregistrerMur(neuf, neuf.index.ouverte.mur, { configuration: { version: 2, sourceModifiee: false, formulaires: { 'form-mur': { mode: 'dalles', dalle: 'roe-cb5-mkii', demi: true, colonnes: '8', lignes: '4' } } } }, o);
      const pid = murDemi.index.ouverte.presta;
      v.egal('demi-dalle modifiée de ma base, reliée à la dalle de départ du mur : jointe à l\'export', [prestas.fichesUtilisees(murDemi, pid, baseDemi, depart).map((f) => f.fiche.id), prestas.exporterPresta(murDemi, pid, baseDemi, { ...o, depart }).donnees.fiches.map((f) => f.fiche.id)],
        [['roe-cb5-mkii-demi'], ['roe-cb5-mkii-demi']]);
      const donnees = JSON.parse(texte);
      const erreurs = (d) => prestas.verifierImportPresta(JSON.stringify(d), neuf, fiches.baseVide(), depart).erreurs;
      v.egal('fichier mal formé : refusé avec sa raison, jamais une erreur technique', [
        erreurs({ ...donnees, fiches: [null] }), erreurs({ ...donnees, fiches: [{ type: 'dalle', fiche: { nom: 'sans identifiant' } }] }), erreurs({ ...donnees, fiches: [{ fiche: { id: 'x' } }] }),
      ], [['Fiches du fichier illisibles.'], ['Fiches du fichier illisibles.'], ['Fiches du fichier illisibles.']]);
      const bizarre = { ...donnees, presta: { ...donnees.presta, id: '__proto__' }, murs: [{ ...donnees.murs[0], id: '__proto__' }, { ...donnees.murs[1], id: 'constructor' }] };
      const r = prestas.importerPresta(neuf, fiches.baseVide(), depart, JSON.stringify(bizarre), {}, o);
      const p = prestas.prestaOuverte(r.etat);
      v.vrai('identifiants inhabituels : remplacés, saisies de chaque mur bien gardées', /^p-/.test(p.id) && p.murs.every((m) => /^m-/.test(m.id) && Object.prototype.hasOwnProperty.call(r.etat.murs, m.id))
        && JSON.stringify(r.etat.murs[p.murs[0].id].configuration) === JSON.stringify(donnees.murs[0].configuration));
      const memes = prestas.enregistrerMur(etat, presta.murs[0].id, { configuration: etat.murs[presta.murs[0].id].configuration, montage: etat.murs[presta.murs[0].id].montage }, horloge(o, '2026-10-20T12:00:00Z'));
      v.vrai('saisies et suivi inchangés : rien ne change, presta non marquée modifiée', memes === etat);
      const parcDonne = prestas.ajouterMur(etat, presta.id, { parc: null }, o);
      const prestaParc = prestas.creerPresta(etat, { parc: 'prestataire-b' }, o);
      v.egal('parc donné par l\'appli à un nouveau mur (aucun) et à une nouvelle presta (Prestataire B)', [prestas.murOuvert(parcDonne).parc, prestas.murOuvert(prestaParc).parc], [null, 'prestataire-b']);
    },
  },
  {
    id: 'R305',
    titre: 'Prestas, relecture du 16/10/2026 : résumé d\'un mur en zones lu dans le champ caché tel que l\'appli l\'écrit (objet { zones: [...] } de zones.js) : « BP2 V2, 3 zones », « 1 zone »',
    etape: '10b',
    verifier(v) {
      const noms = { nomDalle: (id) => ({ 'roe-bp2-v2': 'BP2 V2' })[id] ?? null };
      const resume = (saisie) => prestas.resumeMur({ parc: null, configuration: { formulaires: { 'form-mur': { mode: 'zones', dalle: 'roe-bp2-v2', zones: zones.ecrireSaisieZones(saisie) } } } }, noms);
      v.egal('trois zones, puis une', [
        resume({ zones: [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 4, rangees: 2 }, { nom: 'C', colonnes: 2, rangees: 2 }], ecarts: 'reel', ecartsPx: [], yPx: null }),
        resume({ zones: [{ nom: 'A', colonnes: 4, rangees: 2 }], ecarts: 'reel', ecartsPx: [], yPx: null }),
      ], ['BP2 V2, 3 zones', 'BP2 V2, 1 zone']);
    },
  },
  {
    id: 'R306',
    titre: 'Grand mur (11-0, § 2.4) : 5 000 dalles au plus par mur, demi-dalles comptées, dans les modes Dalles, Taille, Résolution et Zones ; au-delà, erreur de saisie qui donne le nombre de dalles, la limite et la solution (plusieurs murs de la presta)',
    etape: '11-0',
    verifier(v) {
      v.egal('limite : 5 000 dalles', calculs.DALLES_MAX_MUR, 5000);
      const message = (n) => new RegExp(`^Mur de ${n.replace(' ', '\\s?')} dalles : l'appli calcule jusqu'à 5\\s?000 dalles par mur \\(au-delà, un téléphone peut manquer de mémoire\\)\\. Vérifie la saisie, ou découpe le mur en plusieurs murs de la presta\\.$`);
      const dalles = (colonnes, lignes, options = {}) => calculs.dimensionner(DALLE_CAS_7, { mode: 'dalles', colonnes, lignes }, options);
      v.egal('Dalles, 100 × 50 = 5 000 : accepté', [dalles(100, 50).erreurs, dalles(100, 50).mur?.dalles.total], [[], 5000]);
      v.egal('Dalles, 1 667 × 3 = 5 001 : refusé', dalles(1667, 3).mur, null);
      v.vrai('Dalles, 1 667 × 3 : message', message('5 001').test(dalles(1667, 3).erreurs[0] ?? ''), dalles(1667, 3).erreurs[0]);
      v.vrai('Dalles, 200 × 40 : « Mur de 8 000 dalles »', message('8 000').test(dalles(200, 40).erreurs[0] ?? ''), dalles(200, 40).erreurs[0]);
      const demi = (colonnes, lignes) => calculs.dimensionner(CB5, { mode: 'dalles', colonnes, lignes, rangeeDemi: true }, { demi: CB5_DEMI });
      v.egal('demi-dalles comptées : 100 × 49 + 100 demi = 5 000, accepté', [demi(100, 49).erreurs, demi(100, 49).mur?.dalles.total], [[], 5000]);
      v.vrai('demi-dalles comptées : 100 × 50 + 100 demi = 5 100, refusé', message('5 100').test(demi(100, 50).erreurs[0] ?? ''), demi(100, 50).erreurs[0]);
      const taille = (largeurMm, hauteurMm) => calculs.dimensionner(DALLE_CAS_7, { mode: 'taille', largeurMm, hauteurMm });
      v.egal('Taille, 50 × 25 m (100 × 50 dalles) : accepté', taille(50000, 25000).erreurs, []);
      v.vrai('Taille, 100 × 20 m (200 × 40 dalles) : refusé', message('8 000').test(taille(100000, 20000).erreurs[0] ?? ''), taille(100000, 20000).erreurs[0]);
      const resolution = calculs.dimensionner(DALLE_CAS_7, { mode: 'resolution', largeurPx: 38400, hauteurPx: 7680 });
      v.vrai('Résolution, 38 400 × 7 680 px (200 × 40 dalles) : refusé', message('8 000').test(resolution.erreurs[0] ?? ''), resolution.erreurs[0]);
      const enZones = (rangees) => () => calculs.murZones(DALLE_CAS_7, ['A', 'B', 'C', 'D'].map((nom) => ({ nom, colonnes: 50, rangees })), { ecarts: 'reel' });
      v.egal('Zones, 4 × (50 × 25) = 5 000 : accepté', enZones(25)().dalles.total, 5000);
      v.vrai('Zones, 4 × (50 × 26) = 5 200 : refusé', message('5 200').test(messageErreur(enZones(26))), messageErreur(enZones(26)));
    },
  },
  {
    id: 'R307',
    titre: 'Distribution (12a), conseil : lignes directes si l\'armoire est à 10 m au plus ou si la distance n\'est pas saisie ; au-delà, boîtiers 32 A tri de 6 prises (2 par phase), au nombre de max(lignes ÷ 6, lignes d\'une phase ÷ 2) arrondi au-dessus, chaque ligne dans l\'ordre du câblage au premier boîtier qui a une prise libre de sa phase',
    etape: '12a',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dist = (distanceArmoireM, options = {}) => calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', distanceArmoireM, mode: 'stack', ...options });
      v.egal('mur 24 × 6, tri 32 A : 9 lignes L1 L2 L3 dans l\'ordre du câblage', variante.lignesDetail.map((l) => l.phase), [1, 2, 3, 1, 2, 3, 1, 2, 3]);
      for (const d of [null, 10]) {
        const r = dist(d);
        v.egal(`armoire ${d === null ? 'non saisie' : 'à 10 m'} : lignes directes, 9 prises 16 A sur l'armoire`, [r.type, r.boitiers.length, r.lignes.map((l) => l.depuis), r.armoire],
          ['directe', 0, Array(9).fill('armoire'), { sortiesP17: 0, prises16: 9 }]);
      }
      const loin = dist(10.5);
      v.egal('armoire à 10,5 m : 2 boîtiers, lignes 1 à 6 puis 7 à 9, chacune sur une prise de sa phase', [loin.type, contenuBoitiers(loin)],
        ['boitiers', ['1L1 2L2 3L3 4L1 5L2 6L3', '7L1 8L2 9L3']]);
      v.egal('ce que l\'armoire fournit : 2 sorties P17 32 A tri, aucune prise 16 A', loin.armoire, { sortiesP17: 2, prises16: 0 });
      v.egal('chaque ligne dit d\'où elle part', loin.lignes.map((l) => `${l.numero} ${l.depuis} ${l.prise}`).slice(5, 7), ['6 B1 L3', '7 B2 L1']);
      v.egal('pose selon le montage : au sol derrière le mur en stack, sur le pont en accroche', [loin.pose, dist(10.5, { mode: 'accroche' }).pose], ['au sol derrière le mur', 'sur le pont']);
      v.vrai('lignes et phases inchangées, 2 prises par phase au plus par boîtier', distributionCoherente(loin, variante, 2));
      const fictif = (phases) => calculs.distributionElec(MUR_FICTIF, varianteFictive(phases), ELEC_TRI_FICTIF, { depart: 'bas-gauche', distanceArmoireM: 20 });
      v.egal('L1 L1 L1 L1 L2 L3 : 2 boîtiers (4 lignes sur L1), lignes 3 et 4 au boîtier 2', contenuBoitiers(fictif([1, 1, 1, 1, 2, 3])), ['1L1 2L1 5L2 6L3', '3L1 4L1']);
      v.egal('L1 L2 L1 L1 L2 L2 L3 L3 L3 : 2 boîtiers, chaque ligne au premier boîtier libre de sa phase', contenuBoitiers(fictif([1, 2, 1, 1, 2, 2, 3, 3, 3])),
        ['1L1 2L2 3L1 5L2 7L3 8L3', '4L1 6L2 9L3']);
      v.egal('7 lignes à tour de rôle : 2 boîtiers (7 ÷ 6)', contenuBoitiers(fictif([1, 2, 3, 1, 2, 3, 1])), ['1L1 2L2 3L3 4L1 5L2 6L3', '7L1']);
      const z = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 12, rangees: 6 }, { nom: 'B', colonnes: 15, rangees: 6 }], { ecarts: 'reel' });
      const vz = varianteConseil(z, DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dz = calculs.distributionElec(z, vz.variante, vz.elec, { depart: 'bas-gauche', distanceArmoireM: 30 });
      const n = (k) => vz.variante.lignesDetail.filter((l) => l.phase === k).length;
      v.egal('mur en zones : nombre de boîtiers de la règle, sur toutes les lignes du mur', dz.boitiers.length,
        Math.max(Math.ceil(vz.variante.lignesDetail.length / 6), ...[1, 2, 3].map((k) => Math.ceil(n(k) / 2))));
      v.vrai('mur en zones : lignes et phases inchangées', distributionCoherente(dz, vz.variante, 2));
    },
  },
  {
    id: 'R308',
    titre: 'Distribution (12a) : arrivée monophasée ou départs réglés au-delà de 16 A, lignes directes (les prises des boîtiers 32 A tri sont en 16 A), avec la note « câbles de tête longs » si l\'armoire est à plus de 10 m',
    etape: '12a',
    verifier(v) {
      const cas = (reglages, distanceArmoireM) => {
        const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { ...reglages, depart: 'bas-gauche' }, { depart: 'bas-gauche' });
        return calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', distanceArmoireM, mode: 'stack' });
      };
      const mono = { arrivee: { type: 'mono', intensiteA: 32 } };
      const monoLoin = cas(mono, 25);
      v.egal('mono, armoire à 25 m : lignes directes, sans boîtier', [monoLoin.type, monoLoin.boitiers.length, monoLoin.armoire.prises16], ['directe', 0, 4]);
      v.vrai('mono, armoire à 25 m : note des rallonges', monoLoin.notes.includes('Arrivée monophasée : pas de boîtier 32 A tri, lignes en direct sur l\'armoire à 25 m. Câbles de tête longs : prévois des rallonges 16 A.'), monoLoin.notes);
      v.egal('mono, prise sans phase', monoLoin.lignes[0].prise, null);
      v.egal('mono, armoire à 5 m : pas de note', cas(mono, 5).notes, []);
      const fort = cas({ departA: 20 }, 25);
      v.egal('départs de 20 A, armoire à 25 m : lignes directes', [fort.type, fort.boitiers.length], ['directe', 0]);
      v.vrai('départs de 20 A : note', fort.notes.includes('Départs réglés à 20 A : les prises des boîtiers 32 A tri sont en 16 A, lignes en direct sur l\'armoire à 25 m. Câbles de tête longs : prévois des rallonges 20 A.'), fort.notes);
      v.egal('départs de 20 A, armoire à 5 m : pas de note', cas({ departA: 20 }, 5).notes, []);
    },
  },
  {
    id: 'R309',
    titre: 'Distribution (12a), avec mon matériel : chaque champ facultatif (vide = supposé suffisant, dit dans le résultat), boîtiers au plus le nombre de boîtiers et de sorties P17 32 A, lignes restantes en direct ; armoire à 10 m au plus : en direct tant qu\'il y a des prises 16 A, puis boîtiers ; matériel insuffisant : refus avec ce qui manque',
    etape: '12a',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const mat = (distanceArmoireM, materiel, e = elec, va = variante) => calculs.distributionElec(m, va, e, { depart: 'bas-gauche', distanceArmoireM, mode: 'stack', choix: 'materiel', materiel });
      const vide = mat(25, {});
      v.egal('champs vides, armoire à 25 m : comme le conseil', [vide.choix, contenuBoitiers(vide), vide.refus], ['materiel', ['1L1 2L2 3L3 4L1 5L2 6L3', '7L1 8L2 9L3'], null]);
      v.egal('champs vides : le résultat dit ce qui est supposé (seulement le matériel utilisé)', vide.notes, [
        'Sorties P17 32 A tri de l\'armoire : non précisées, supposées suffisantes.',
        'Boîtiers 32 A tri : non précisés, supposés suffisants.',
        'Prises 16 A par boîtier : non précisées, 6 (2 par phase).',
      ]);
      const un = mat(25, { boitiers: 1 });
      v.egal('1 boîtier : lignes 1 à 6 sur le boîtier, 7 à 9 en direct', [un.type, contenuBoitiers(un), un.lignes.filter((l) => l.depuis === 'armoire').map((l) => l.numero), un.armoire],
        ['mixte', ['1L1 2L2 3L3 4L1 5L2 6L3'], [7, 8, 9], { sortiesP17: 1, prises16: 3 }]);
      v.vrai('1 boîtier : note des câbles de tête longs, prises 16 A supposées suffisantes', un.notes.some((n) => /^Armoire à 25 m : .*câbles de tête longs.*rallonges 16 A\.$/.test(n))
        && un.notes.includes('Prises 16 A de l\'armoire : non précisées, supposées suffisantes.'), un.notes);
      const sorties = mat(25, { sortiesP17: 1, boitiers: 3 });
      v.egal('3 boîtiers mais 1 sortie P17 : 1 boîtier utilisé', sorties.boitiers.length, 1);
      v.egal('refus : il manque 1 prise 16 A', [mat(25, { boitiers: 1, prises16: 2 }).refus, mat(25, { boitiers: 1, prises16: 2 }).manque],
        ['Il manque 1 prise 16 A : ajoute 1 boîtier 32 A tri, ou 1 prise 16 A sur l\'armoire.', { prises16: 1, boitiers: 1, sortiesP17: 0 }]);
      v.egal('refus : la sortie P17 manque', mat(25, { boitiers: 2, sortiesP17: 1, prises16: 0 }).refus,
        'Il manque 3 prises 16 A : ajoute 1 sortie P17 32 A tri sur l\'armoire, ou 3 prises 16 A sur l\'armoire.');
      v.egal('refus : boîtier et sortie P17 manquent', mat(25, { boitiers: 1, sortiesP17: 1, prises16: 0 }).refus,
        'Il manque 3 prises 16 A : ajoute 1 boîtier 32 A tri et 1 sortie P17 32 A tri sur l\'armoire, ou 3 prises 16 A sur l\'armoire.');
      v.egal('matériel suffisant : pas de refus', [mat(25, { boitiers: 2, sortiesP17: 2, prises16: 0 }).refus, mat(25, { boitiers: 2, sortiesP17: 2, prises16: 0 }).manque], [null, null]);
      v.egal('3 prises par boîtier (1 par phase) : 3 boîtiers', contenuBoitiers(mat(25, { prisesParBoitier: 3 })), ['1L1 2L2 3L3', '4L1 5L2 6L3', '7L1 8L2 9L3']);
      v.vrai('3 prises par boîtier : 1 prise par phase au plus', distributionCoherente(mat(25, { prisesParBoitier: 3 }), variante, 1));
      const pres = mat(5, { prises16: 4, boitiers: 1 });
      v.egal('armoire à 5 m, 4 prises 16 A : lignes 1 à 4 en direct, 5 à 9 sur un boîtier', [pres.type, pres.lignes.filter((l) => l.depuis === 'armoire').map((l) => l.numero), contenuBoitiers(pres), pres.armoire],
        ['mixte', [1, 2, 3, 4], ['5L2 6L3 7L1 8L2 9L3'], { sortiesP17: 1, prises16: 4 }]);
      v.egal('armoire à 5 m, assez de prises 16 A : tout en direct, sans note de boîtier', [mat(5, { prises16: 9 }).type, mat(5, { prises16: 9 }).notes], ['directe', []]);
      v.egal('armoire à 5 m, 4 prises 16 A, aucun boîtier : refus', mat(5, { prises16: 4, boitiers: 0 }).refus,
        'Il manque 5 prises 16 A : ajoute 1 boîtier 32 A tri, ou 5 prises 16 A sur l\'armoire.');
      const vingt = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche', departA: 20 }, { depart: 'bas-gauche' });
      v.egal('départs de 20 A, 4 prises : refus sans boîtier possible', mat(5, { prises16: 4 }, vingt.elec, vingt.variante).refus,
        'Il manque 2 prises 20 A sur l\'armoire (départs réglés à 20 A : les prises des boîtiers 32 A tri sont en 16 A).');
      const mono = varianteConseil(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { depart: 'bas-gauche', arrivee: { type: 'mono', intensiteA: 32 } }, { depart: 'bas-gauche' });
      v.egal('mono, 2 prises pour 4 lignes : refus', calculs.distributionElec(mono.m, mono.variante, mono.elec, { depart: 'bas-gauche', distanceArmoireM: 5, choix: 'materiel', materiel: { prises16: 2 } }).refus,
        'Il manque 2 prises 16 A sur l\'armoire (arrivée monophasée : pas de boîtier 32 A tri).');
    },
  },
  {
    id: 'R310',
    titre: 'Distribution (12a), câbles en nombre et en longueur : boîtier sur le bord de départ au milieu des têtes de ses lignes ; P17 32 A tri = (distance armoire–mur + trajet le long du bord jusqu\'au boîtier) × (1 + mou) ; câble de tête depuis le boîtier = trajet jusqu\'à la première dalle × (1 + mou), depuis l\'armoire comme aujourd\'hui ; sans distance, « à mesurer » (longueur nulle), le nombre reste',
    etape: '12a',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const r = calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', distanceArmoireM: 20, mode: 'stack' });
      v.egal('boîtiers au bas du mur, au milieu des têtes de leurs lignes', r.boitiers.map((b) => b.positionMm), [{ x: 4000, y: 3000 }, { x: 10250, y: 3000 }]);
      v.proche('P17 du boîtier 1 : (20 m + 4 m) × 1,10', r.boitiers[0].p17M, 26.4, 0.001);
      v.proche('P17 du boîtier 2 : (20 m + 10,25 m) × 1,10', r.boitiers[1].p17M, 33.275, 0.001);
      v.proche('ligne 1, câble de tête depuis le boîtier 1 : (3,75 + 0,25 m) × 1,10', r.lignes[0].longueurTeteM, 4.4, 0.001);
      v.proche('ligne 7, câble de tête depuis le boîtier 2 : (1 + 0,25 m) × 1,10', r.lignes[6].longueurTeteM, 1.375, 0.001);
      v.egal('récapitulatif : 2 câbles P17 32 A tri, 9 câbles de tête 16 A', [r.cables.p17.nombre, r.cables.tete.nombre], [2, 9]);
      v.proche('P17 : longueur totale', r.cables.p17.totalM, 59.675, 0.001);
      v.proche('P17 : le plus long', r.cables.p17.maxM, 33.275, 0.001);
      v.proche('câbles de tête : longueur totale', r.cables.tete.totalM, 19.525, 0.001);
      const direct = calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', distanceArmoireM: 5 });
      const reference = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche', distanceArmoireM: 5 }).variantes.find((x) => x.mode === variante.mode);
      v.egal('ligne directe : même longueur de câble de tête que le Schéma d\'aujourd\'hui', direct.lignes.map((l) => l.longueurTeteM.toFixed(6)), reference.lignesDetail.map((l) => l.longueurTeteM.toFixed(6)));
      const sans = calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche' });
      v.egal('sans distance : longueurs à mesurer, le nombre reste', [sans.lignes.every((l) => l.longueurTeteM === null), sans.cables.tete.nombre, sans.cables.tete.totalM, sans.cables.p17.nombre], [true, 9, null, 0]);
      const melange = calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', choix: 'materiel', materiel: { prises16: 4, boitiers: 1 } });
      v.egal('armoire non saisie, boîtier pour les lignes en trop : P17 à mesurer', [melange.boitiers.length, melange.boitiers[0].p17M, melange.cables.p17.totalM], [1, null, null]);
      const mixte = calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1 } });
      v.proche('ligne 7 en direct : (20 m + 9,25 + 0,25 m) × 1,10', mixte.lignes[6].longueurTeteM, 32.45, 0.001);
      const haut = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'haut-droite' }, { depart: 'haut-droite' });
      const rh = calculs.distributionElec(haut.m, haut.variante, haut.elec, { depart: 'haut-droite', distanceArmoireM: 20, mode: 'accroche' });
      v.egal('accroche, départ en haut à droite : boîtiers en haut du mur, sur le pont', [rh.pose, rh.boitiers.map((b) => b.positionMm)], ['sur le pont', [{ x: 8000, y: 0 }, { x: 1750, y: 0 }]]);
      v.proche('accroche, P17 du boîtier 1 : (20 m + 4 m depuis le coin droit) × 1,10', rh.boitiers[0].p17M, 26.4, 0.001);
      const rangees = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche' }).variantes.find((x) => x.mode === 'rangees');
      const rr = calculs.distributionElec(m, rangees, elec, { depart: 'bas-gauche', distanceArmoireM: 20 });
      v.vrai('câblage par rangées : boîtiers sur le côté de départ', rr.boitiers.length > 0 && rr.boitiers.every((b) => b.positionMm.x === 0), rr.boitiers.map((b) => b.positionMm));
    },
  },
  {
    id: 'R311',
    titre: 'Distribution (12a) : chaque ligne du câblage élec garde le centre de sa première dalle (teteMm), pour placer les boîtiers ; distance armoire au-delà de 10 m : SEUIL_BOITIERS_M',
    etape: '12a',
    verifier(v) {
      const { variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      v.egal('ligne 1 : C1 R6, centre à 250 mm du bord gauche et 2 750 mm du haut', [variante.lignesDetail[0].dalles[0], variante.lignesDetail[0].teteMm], ['C1 R6', { x: 250, y: 2750 }]);
      v.egal('seuil des boîtiers : 10 m', calculs.SEUIL_BOITIERS_M, 10);
      const z = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 4, rangees: 2 }], { ecarts: 'reel' });
      const vz = varianteConseil(z, DALLE_CAS_13, { depart: 'haut-gauche' }, { depart: 'haut-gauche' });
      v.vrai('mur en zones : têtes données aussi', vz.variante.lignesDetail.every((l) => Number.isFinite(l.teteMm?.x) && Number.isFinite(l.teteMm?.y)));
    },
  },
  {
    id: 'R312',
    titre: 'Distribution (12b), textes : « Armoire : 2 câbles P17 32 A tri vers les boîtiers », « Boîtier 1, sur le pont : lignes 1 et 4 (L1), 2 et 5 (L2), 3 et 6 (L3) », « En direct sur l\'armoire : ligne 6 (L3) », câbles en nombre et en longueur (« à mesurer » sans distance) ; monophasé sans phase',
    etape: '12b',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dist = (options) => calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', mode: 'stack', ...options });
      v.egal('une ligne, puis une ligne par phase', [resumes.texteLignesDistribution?.([{ numero: 6, phase: 3 }]), resumes.texteLignesDistribution?.([{ numero: 7, phase: 1 }, { numero: 8, phase: 2 }, { numero: 9, phase: 3 }])],
        ['ligne 6 (L3)', 'lignes 7 (L1), 8 (L2), 9 (L3)']);
      v.egal('trois lignes d\'une même phase, monophasé sans phase', [resumes.texteLignesDistribution?.([{ numero: 1, phase: 1 }, { numero: 4, phase: 1 }, { numero: 7, phase: 1 }]),
        resumes.texteLignesDistribution?.([1, 2, 3, 4].map((numero) => ({ numero, phase: 1 })), { mono: true })], ['lignes 1, 4 et 7 (L1)', 'lignes 1, 2, 3 et 4']);
      v.egal('longueur d\'un câble', [resumes.texteLongueurCable?.(26.4), resumes.texteLongueurCable?.(null)], ['26,4 m', 'à mesurer']);
      v.egal('boîtiers, armoire à 20 m', resumes.lignesDistribution?.(dist({ distanceArmoireM: 20 })), [
        'Armoire : 2 câbles P17 32 A tri vers les boîtiers',
        'Boîtier 1, au sol derrière le mur : lignes 1 et 4 (L1), 2 et 5 (L2), 3 et 6 (L3)',
        'Boîtier 2, au sol derrière le mur : lignes 7 (L1), 8 (L2), 9 (L3)',
        'Câbles P17 32 A tri : 2, 59,7 m en tout, le plus long 33,3 m',
        'Câbles de tête 16 A : 9, 19,5 m en tout, le plus long 4,4 m',
      ]);
      v.egal('un seul boîtier : « vers le boîtier »', resumes.lignesDistribution?.(dist({ distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1 } }))?.slice(0, 3), [
        'Armoire : 1 câble P17 32 A tri vers le boîtier',
        'Boîtier 1, au sol derrière le mur : lignes 1 et 4 (L1), 2 et 5 (L2), 3 et 6 (L3)',
        'En direct sur l\'armoire : lignes 7 (L1), 8 (L2), 9 (L3)',
      ]);
      v.egal('sans distance : lignes directes, longueur à mesurer', resumes.lignesDistribution?.(dist({})), [
        'En direct sur l\'armoire : lignes 1, 4 et 7 (L1), 2, 5 et 8 (L2), 3, 6 et 9 (L3)',
        'Câbles de tête 16 A : 9, longueur à mesurer',
      ]);
      const mono = varianteConseil(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { depart: 'bas-gauche', arrivee: { type: 'mono', intensiteA: 32 } }, { depart: 'bas-gauche' });
      v.egal('monophasé : lignes sans phase', resumes.lignesDistribution?.(calculs.distributionElec(mono.m, mono.variante, mono.elec, { depart: 'bas-gauche' }))?.[0],
        'En direct sur l\'armoire : lignes 1, 2, 3 et 4');
      const vingt = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche', departA: 20 }, { depart: 'bas-gauche' });
      v.egal('départs de 20 A : câbles de tête de 20 A', resumes.lignesDistribution?.(calculs.distributionElec(vingt.m, vingt.variante, vingt.elec, { depart: 'bas-gauche' }))?.at(-1),
        'Câbles de tête 20 A : 6, longueur à mesurer');
    },
  },
  {
    id: 'R313',
    titre: 'Distribution (12c), guide de montage élec : la phrase de chaque ligne dit d\'où elle part (« Branche-la sur le boîtier 1, prise L2 », « sur l\'armoire, prise L3 », monophasé « sur l\'armoire ») ; sans prise (matériel insuffisant) : « Prise à trouver » ; signature inchangée (case gardée) ; sans distribution, phrase d\'avant',
    etape: '12c',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dist = (options) => calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', mode: 'stack', ...options });
      const etapes = (d) => montage.etapesElec(variante, { depart: 'bas-gauche', distribution: d });
      const avant = montage.etapesElec(variante, { depart: 'bas-gauche' });
      const boites = etapes(dist({ distanceArmoireM: 20 }));
      v.vrai('ligne 2 : boîtier 1, prise L2', boites[1].phrase.endsWith('Branche-la sur le boîtier 1, prise L2 : câble de tête jusqu\'à C4 R6, puis suis les numéros.'), boites[1].phrase);
      v.egal('boîtier de chaque ligne', boites.map((x) => x.boitier), [1, 1, 1, 1, 1, 1, 2, 2, 2]);
      const directe = etapes(dist({}));
      v.vrai('ligne 1 directe : sur l\'armoire, prise L1', directe[0].phrase.endsWith('Branche-la sur l\'armoire, prise L1 : câble de tête jusqu\'à C1 R6, puis suis les numéros.'), directe[0].phrase);
      v.egal('ligne directe : pas de boîtier', directe[0].boitier, null);
      v.egal('signatures inchangées par la distribution (cases gardées)', [boites.map((x) => x.signature), directe.map((x) => x.signature)], [avant.map((x) => x.signature), avant.map((x) => x.signature)]);
      v.vrai('sans distribution : phrase d\'avant', avant[0].phrase.endsWith('Câble de tête depuis l\'armoire jusqu\'à C1 R6, puis suis les numéros.'), avant[0].phrase);
      const manque = etapes(dist({ distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1, prises16: 0 } }));
      v.vrai('ligne sans prise : « Prise à trouver »', manque[6].phrase.endsWith('Prise à trouver : le matériel saisi dans Élec ne suffit pas. Câble de tête jusqu\'à C19 R6, puis suis les numéros.'), manque[6].phrase);
      const mono = varianteConseil(calculs.mur(DALLE_CAS_13, 12, 6), DALLE_CAS_13, { depart: 'bas-gauche', arrivee: { type: 'mono', intensiteA: 32 } }, { depart: 'bas-gauche' });
      const em = montage.etapesElec(mono.variante, { depart: 'bas-gauche', distribution: calculs.distributionElec(mono.m, mono.variante, mono.elec, { depart: 'bas-gauche' }) });
      v.vrai('monophasé : sur l\'armoire, sans phase', em[0].phrase.endsWith('Branche-la sur l\'armoire : câble de tête jusqu\'à C1 R6, puis suis les numéros.'), em[0].phrase);
    },
  },
  {
    id: 'R314',
    titre: 'Distribution (12c), textes copiés : Élec reprend la distribution (phrase, armoire, boîtiers, lignes directes, câbles, notes, refus, rappel de l\'électricien) ; le Schéma dit d\'où part chaque ligne et donne son câble de tête depuis le boîtier ; sans distribution, textes d\'avant',
    etape: '12c',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dist = (options) => calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', mode: 'stack', ...options });
      const d = dist({ distanceArmoireM: 20 });
      const texte = resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m, distribution: d }).split('\n');
      const attendues = [
        'Distribution : armoire à 20 m, boîtiers 32 A tri au sol derrière le mur',
        'Armoire : 2 câbles P17 32 A tri vers les boîtiers',
        'Boîtier 1, au sol derrière le mur : lignes 1 et 4 (L1), 2 et 5 (L2), 3 et 6 (L3)',
        'Boîtier 2, au sol derrière le mur : lignes 7 (L1), 8 (L2), 9 (L3)',
        'Câbles P17 32 A tri : 2, 59,7 m en tout, le plus long 33,3 m',
        'Câbles de tête 16 A : 9, 19,5 m en tout, le plus long 4,4 m',
        'Rappel : distribution indicative, à valider avec l\'électricien (différentiel 30 mA, protections, sections et longueurs des câbles)',
      ];
      const debut = texte.indexOf(attendues[0]);
      v.egal('Élec : bloc de la distribution, dans l\'ordre', debut >= 0 ? texte.slice(debut, debut + attendues.length) : texte, attendues);
      const sans = resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m }).split('\n');
      v.vrai('Élec sans distribution : pas de bloc', !sans.some((l) => /^Distribution/.test(l)));
      const refus = resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m, distribution: dist({ distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1, prises16: 2 } }) }).split('\n');
      v.vrai('Élec, matériel : refus et notes', refus.includes('Distribution : armoire à 20 m, boîtiers 32 A tri au sol derrière le mur et lignes en direct, avec mon matériel')
        && refus.includes('Refus : Il manque 1 prise 16 A : ajoute 1 boîtier 32 A tri, ou 1 prise 16 A sur l\'armoire.')
        && refus.includes('Note : Sorties P17 32 A tri de l\'armoire : non précisées, supposées suffisantes.'), refus.filter((l) => /Distribution|Refus|Note/.test(l)).join(' / '));
      v.vrai('Élec, armoire non mesurée : lignes directes', resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m, distribution: dist({}) }).split('\n').includes('Distribution : armoire non mesurée, lignes directes'));
      const t = calculs.cablageElec(m, DALLE_CAS_13, elec, { depart: 'bas-gauche', distanceArmoireM: 20 });
      const schema = resumes.resumeCablage({ elec: t, modeElec: variante.mode, distribution: d });
      v.vrai('Schéma : ligne 1 depuis le boîtier 1, câble de tête depuis le boîtier', /^Ligne 1, phase L1 : .*, depuis le boîtier 1 \(L1\), câble de tête environ 5 m, /m.test(schema), schema.split('\n').find((l) => /^Ligne 1,/.test(l)));
      const mixte = resumes.resumeCablage({ elec: t, modeElec: variante.mode, distribution: dist({ distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1 } }) });
      v.vrai('Schéma : ligne 7 depuis l\'armoire', /^Ligne 7, phase L1 : .*, depuis l'armoire \(L1\), câble de tête environ 33 m, /m.test(mixte), mixte.split('\n').find((l) => /^Ligne 7,/.test(l)));
      v.vrai('Schéma sans distribution : texte d\'avant', /^Ligne 1, phase L1 : .*, 2340 W, câble de tête environ 23 m, /m.test(resumes.resumeCablage({ elec: t, modeElec: variante.mode })));
    },
  },
  {
    id: 'R315',
    titre: 'Liste de matériel (13a), spares et longueurs du stock : 5 % arrondi au-dessus, au moins 1 dès qu\'il y a une dalle, 0 % réglable ; chaque câble dans la plus petite longueur du stock qui suffit, au-delà de la plus longue autant de plus longues que nécessaire puis la plus courte qui couvre le reste (raccords à prévoir) ; longueur inconnue « à mesurer » ; longueurs par défaut de la spec',
    etape: '13a',
    verifier(v) {
      v.egal('spares : 144 → 8, 100 → 5, 101 → 6, 20 → 1, 1 → 1, 0 → 0',
        [144, 100, 101, 20, 1, 0].map((n) => calculs.spares(n)), [8, 5, 6, 1, 1, 0]);
      v.egal('spares réglables : 10 % de 144 → 15, 0 % → 0', [calculs.spares(144, 10), calculs.spares(144, 0)], [15, 0]);
      v.egal('pourcentage par défaut', calculs.SPARES_POURCENT_DEFAUT, 5);
      v.egal('longueurs du stock par défaut (spec § 4)', calculs.LONGUEURS_STOCK, {
        data: [1, 2, 5, 10, 20, 30, 50, 75, 100],
        multipaire: [25, 50, 75, 100],
        fibre: [50, 100, 150, 300],
        p16: [1, 2, 5, 10, 20, 25, 50],
        p17: [5, 10, 20, 25, 50],
      });
      const p16 = calculs.LONGUEURS_STOCK.p16;
      v.egal('plus petite longueur qui suffit : 0,3 → 1 ; 4,4 → 5 ; 5 → 5 ; 5,01 → 10',
        [0.3, 4.4, 5, 5.01].map((x) => calculs.longueurStock(x, p16).morceaux), [[1], [5], [5], [10]]);
      v.egal('une seule longueur : pas de raccord', calculs.longueurStock(4.4, p16).raccords, false);
      v.egal('115 m avec 50 m au plus : 2 × 50 m + 20 m, raccords à prévoir', calculs.longueurStock(115, p16), { morceaux: [50, 50, 20], raccords: true });
      v.egal('100 m avec 50 m au plus : 2 × 50 m', calculs.longueurStock(100, p16).morceaux, [50, 50]);
      v.egal('distance non saisie : à mesurer', calculs.longueurStock(null, p16), null);
      const g = calculs.grouperLongueurs([4.4, 4.4, 9.9, 15, null, 115], p16);
      v.egal('regroupées par longueur, à mesurer et raccords comptés', g, {
        parLongueur: [{ longueurM: 5, nombre: 2 }, { longueurM: 10, nombre: 1 }, { longueurM: 20, nombre: 2 }, { longueurM: 50, nombre: 2 }],
        aMesurer: 1,
        raccords: 1,
      });
      v.egal('texte groupé : « 6 × 10 m, 2 × 20 m »', calculs.texteLongueurs({ parLongueur: [{ longueurM: 10, nombre: 6 }, { longueurM: 20, nombre: 2 }], aMesurer: 0, raccords: 0 }), '6 × 10 m, 2 × 20 m');
      v.egal('texte groupé avec longueurs à mesurer', calculs.texteLongueurs({ parLongueur: [{ longueurM: 10, nombre: 1 }], aMesurer: 2, raccords: 0 }), '1 × 10 m, 2 longueurs à mesurer');
      v.egal('texte groupé : tout à mesurer', calculs.texteLongueurs({ parLongueur: [], aMesurer: 1, raccords: 0 }), '1 longueur à mesurer');
    },
  },
  {
    id: 'R316',
    titre: 'Liste de matériel (13a), dalles : fiche par fiche, demi-dalles sur leur propre fiche, spares de chaque fiche (5 % arrondi au-dessus, au moins 1) ; mur mixte : chaque fiche à part ; pourcentage réglable ; rappel « Liste indicative, à vérifier avant le chargement. »',
    etape: '13a',
    verifier(v) {
      const dalles = (liste) => liste.sections.find((s) => s.id === 'dalles').lignes.map((l) => [l.designation, l.quantite, l.auMur, l.spares]);
      const m = calculs.mur(DALLE_CAS_13, 12, 12);
      v.egal('144 dalles : 152 avec 8 spares', dalles(calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 })), [['Dalle du cas 13', 152, 144, 8]]);
      const l = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).sections[0].lignes[0];
      v.egal('détail : d\'où vient le nombre', l.detail, '144 au mur + 8 de spare (5 %, arrondi au-dessus)');
      v.egal('10 % de spare', dalles(calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, sparesPourcent: 10 })), [['Dalle du cas 13', 159, 144, 15]]);
      const md = calculs.mur(CB5, 10, 2, { demi: CB5_DEMI, rangeeDemi: true });
      v.egal('demi-dalles : leur fiche, leurs spares (au moins 1)', dalles(calculs.listeMateriel({ mur: md, dalle: CB5 })),
        [['CB5 MKII (copie de test)', 21, 20, 1], ['CB5 MKII demi-dalle (copie de test)', 11, 10, 1]]);
      const mixte = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 1, dalle: CB5 }], { ecarts: 'colles' });
      v.egal('mur mixte : chaque fiche à part', dalles(calculs.listeMateriel({ mur: mixte, dalle: DALLE_CAS_13 })),
        [['Dalle du cas 13', 9, 8, 1], ['CB5 MKII (copie de test)', 3, 2, 1]]);
      v.egal('pourcentage gardé dans la liste', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, sparesPourcent: 10 }).sparesPourcent, 10);
      v.egal('rappel de la liste', [calculs.RAPPEL_LISTE, calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).indicatif], ['Liste indicative, à vérifier avant le chargement.', true]);
      v.vrai('chaque ligne a une clé, la même d\'un calcul à l\'autre', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).sections[0].lignes[0].cle === calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, sparesPourcent: 10 }).sections[0].lignes[0].cle);
    },
  },
  {
    id: 'R317',
    titre: 'Liste de matériel (13a), data en cuivre : processeurs retenus, câbles de tête RJ45 à leur longueur du stock (un par port, retours de secours à part en redondance) ; régie à plus de 10 m : multipaires de 8 RJ45 dont 1 de secours, 1 pour 7 câbles (secours compris) à la longueur régie–mur mou compris, un câble court par câble au mur, cordons côté régie à mesurer ; à 10 m au plus ou non saisie : câbles directs ; liaisons entre dalles en nombre ; longueurs du parc',
    etape: '13a',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const mctrl = processeurDeBase(contexte, 'novastar-mctrl660');
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, mctrl, NOVASTAR_60_8);
      const data = (distanceRegieM, evaluation = e) => {
        const t = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'haut-gauche', distanceRegieM });
        return { evaluation, variante: t.variantes.find((x) => x.mode === t.conseil), distanceRegieM };
      };
      const lignes = (d, parc) => calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: d, parc }).sections.find((s) => s.id === 'data').lignes
        .map((l) => `${l.quantite} ${l.designation}${l.longueurM ? ` ${l.longueurM} m` : ''}${l.aMesurer ? ' (à mesurer)' : ''}`);
      v.egal('régie à 20 m : 2 processeurs, 1 multipaire de 25 m, câbles au mur, cordons côté régie, liaisons', lignes(data(20)), [
        `2 ${mctrl.nom}`,
        '1 Multipaire 8 RJ45 25 m',
        '1 Câble RJ45 au mur, du multipaire à la dalle 1 m',
        '1 Câble RJ45 au mur, du multipaire à la dalle 2 m',
        '3 Câble RJ45 au mur, du multipaire à la dalle 5 m',
        '1 Câble RJ45 au mur, du multipaire à la dalle 10 m',
        '6 Cordon RJ45 côté régie, du processeur au multipaire (à mesurer)',
        '66 Liaison RJ45 entre dalles',
      ]);
      v.egal('régie à 8 m : câbles de tête directs, 1 × 10 m et 5 × 20 m', lignes(data(8)), [
        `2 ${mctrl.nom}`, '1 Câble de tête RJ45 10 m', '5 Câble de tête RJ45 20 m', '66 Liaison RJ45 entre dalles',
      ]);
      v.egal('régie à 10 m : pas de multipaire', lignes(data(10)).some((l) => /Multipaire/.test(l)), false);
      v.egal('régie non saisie : 6 câbles de tête à mesurer', lignes(data(null)), [`2 ${mctrl.nom}`, '6 Câble de tête RJ45 (à mesurer)', '66 Liaison RJ45 entre dalles']);
      v.egal('longueurs du parc : 5, 15 et 25 m', lignes(data(8), { longueurs: { data: [5, 15, 25] } }).filter((l) => /tête/.test(l)), ['6 Câble de tête RJ45 15 m']);
      const liste = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: data(20) });
      const mp = liste.sections.find((s) => s.id === 'data').lignes.find((l) => /Multipaire/.test(l.designation));
      v.egal('multipaire : détail', mp.detail, '8 RJ45 dont 1 de secours, 1 pour 7 câbles (6 câbles), régie à 20 m, mou compris (22 m)');
      v.egal('liaisons : à vérifier', liste.sections.find((s) => s.id === 'data').lignes.at(-1).detail, 'fournies avec les dalles, à vérifier');
      // Redondance : MCTRL4K (secours du port p sur le port p + 8), 6 ports et 6 retours de secours.
      const e4k = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl4k'), { ...NOVASTAR_60_8, redondance: true });
      const d4k = data(20, e4k);
      const l4k = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: d4k }).sections.find((s) => s.id === 'data').lignes;
      const somme = (re) => l4k.filter((l) => re.test(l.designation)).reduce((s, l) => s + l.quantite, 0);
      v.egal('redondance à 20 m : 12 câbles, 2 multipaires, 12 câbles au mur, 12 cordons', [somme(/^Multipaire/), somme(/au mur/), somme(/côté régie/)], [2, 12, 12]);
      const ports = d4k.variante.processeurs.flatMap((p) => p.ports);
      const attendu = calculs.grouperLongueurs([...ports.map((p) => p.longueurCuivreM - 22), ...ports.map((p) => p.secours.retourM)], calculs.LONGUEURS_STOCK.data).parLongueur;
      v.egal('redondance : au mur, la longueur de chaque câble et de chaque retour de secours', l4k.filter((l) => /au mur/.test(l.designation)).map((l) => ({ longueurM: l.longueurM, nombre: l.quantite })), attendu);
      const l4kPres = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: data(8, e4k) }).sections.find((s) => s.id === 'data').lignes;
      v.egal('redondance à 8 m : 6 câbles de tête et 6 retours de secours directs', [
        l4kPres.filter((l) => l.designation === 'Câble de tête RJ45').reduce((s, l) => s + l.quantite, 0),
        l4kPres.filter((l) => l.designation === 'Retour de secours RJ45').reduce((s, l) => s + l.quantite, 0),
      ], [6, 6]);
      v.vrai('sans Data : la section le dit', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).sections.find((s) => s.id === 'data').notes.some((n) => /Data/.test(n)));
    },
  },
  {
    id: 'R318',
    titre: 'Liste de matériel (13a), data en fibre : XD ou CVT comptés dans Data (miroirs compris en redondance), une fibre par distributeur à la longueur régie–mur mou compris, longueur du stock fibre ; cuivre du distributeur à la dalle ; pas de multipaire',
    etape: '13a',
    verifier(v, contexte) {
      const m7 = calculs.mur(DALLE_CAS_7, 44, 10);
      const sx40 = processeurDeBase(contexte, 'brompton-sx40');
      const lignes = (reglages, distanceRegieM) => {
        const e = calculs.evaluerProcesseur(m7, DALLE_CAS_7, sx40, reglages);
        const t = calculs.cablageData(m7, DALLE_CAS_7, e, { depart: 'bas-gauche', distanceRegieM });
        const variante = t.variantes.find((x) => x.mode === t.conseil);
        const l = calculs.listeMateriel({ mur: m7, dalle: DALLE_CAS_7, data: { evaluation: e, variante, distanceRegieM } }).sections.find((s) => s.id === 'data').lignes;
        return { e, variante, l, n: (re) => l.filter((x) => re.test(x.designation)).reduce((s, x) => s + x.quantite, 0) };
      };
      const r = lignes(BROMPTON_60_10, 150);
      const xd = r.e.totaux.distributeurs.colonnes;
      v.egal('XD comptés comme Data, une fibre de 300 m par XD (165 m mou compris)', [r.n(/^XD$/), r.l.filter((x) => /^Fibre/.test(x.designation)).map((x) => [x.quantite, x.longueurM])], [xd, [[xd, 300]]]);
      v.egal('fibre : désignation', r.l.find((x) => /^Fibre/.test(x.designation)).designation, 'Fibre jusqu\'au XD');
      v.egal('pas de multipaire en fibre', r.n(/Multipaire/), 0);
      v.egal('câbles de tête depuis le XD : un par port', r.n(/^Câble de tête RJ45$/), r.variante.ports);
      v.egal('SX40 compté', r.l[0].designation, sx40.nom);
      const red = lignes({ ...BROMPTON_60_10, redondance: true }, 150);
      v.egal('redondance : XD miroirs compris, une fibre par XD', [red.n(/^XD$/), red.n(/^Fibre/)], [red.e.totaux.distributeurs.redondance, red.e.totaux.distributeurs.redondance]);
      v.egal('redondance : retours de secours', red.n(/^Retour de secours RJ45$/), red.variante.portsSecours);
      const sans = lignes(BROMPTON_60_10, null);
      v.egal('régie non saisie : fibres à mesurer', sans.l.filter((x) => /^Fibre/.test(x.designation)).map((x) => [x.quantite, x.aMesurer]), [[xd, true]]);
    },
  },
  {
    id: 'R319',
    titre: 'Liste de matériel (13a), élec : boîtiers 32 A tri, câbles P17 32 A tri et câbles de tête 16 A de la distribution (étape 12) à leurs longueurs du stock ; armoire non mesurée : câbles à mesurer, pas de boîtier ; liaisons power entre dalles en nombre ; refus de la distribution repris',
    etape: '13a',
    verifier(v) {
      const { m, elec, variante } = varianteConseil(calculs.mur(DALLE_CAS_13, 24, 6), DALLE_CAS_13, { depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const dist = (options) => calculs.distributionElec(m, variante, elec, { depart: 'bas-gauche', mode: 'stack', ...options });
      const section = (distribution) => calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, elec: { variante, distribution } }).sections.find((s) => s.id === 'elec');
      const lignes = (distribution) => section(distribution).lignes.map((l) => `${l.quantite} ${l.designation}${l.longueurM ? ` ${l.longueurM} m` : ''}${l.aMesurer ? ' (à mesurer)' : ''}`);
      v.egal('armoire à 20 m : 2 boîtiers, 2 P17 de 50 m, 9 câbles de tête 16 A, liaisons', lignes(dist({ distanceArmoireM: 20 })), [
        '2 Boîtier 32 A tri',
        '2 Câble P17 32 A tri 50 m',
        '1 Câble de tête 16 A 1 m',
        '4 Câble de tête 16 A 2 m',
        '4 Câble de tête 16 A 5 m',
        '135 Liaison power entre dalles',
      ]);
      v.egal('boîtier : détail (prises, pose)', section(dist({ distanceArmoireM: 20 })).lignes[0].detail, '6 prises 16 A (2 par phase), au sol derrière le mur');
      v.egal('armoire non mesurée : 9 câbles de tête à mesurer', lignes(dist({})), ['9 Câble de tête 16 A (à mesurer)', '135 Liaison power entre dalles']);
      const refus = dist({ distanceArmoireM: 20, choix: 'materiel', materiel: { boitiers: 1, prises16: 2 } });
      v.vrai('refus de la distribution repris en note', section(refus).notes.includes(`Distribution : ${refus.refus}`), section(refus).notes);
      v.egal('sans distribution : têtes de la variante, à mesurer', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, elec: { variante } }).sections.find((s) => s.id === 'elec').lignes.map((l) => [l.quantite, l.designation, l.aMesurer]),
        [[9, 'Câble de tête 16 A', true], [135, 'Liaison power entre dalles', false]]);
    },
  },
  {
    id: 'R320',
    titre: 'Liste de matériel (13a), accroche : bumpers (nombre et modèle) et moteurs (points d\'accroche de Poids) ; pont au-delà de 4 points : moteurs à voir avec le rigger ; stack : pieds et structure au rigger ; rappel « élingues, manilles et pieds de stack : à voir avec le rigger »',
    etape: '13a',
    verifier(v) {
      const m = calculs.mur(CB5, 10, 2);
      const section = (resultat, bumper = null) => calculs.listeMateriel({ mur: m, dalle: CB5, poids: { resultat, bumper } }).sections.find((s) => s.id === 'accroche');
      const lignes = (s) => s.lignes.map((l) => `${l.quantite} ${l.designation}`);
      const b = calculs.poids(m, CB5, { bumper: { poidsKg: 8.95, colonnes: 2 } });
      v.egal('5 bumpers de 2 colonnes, un moteur par bumper', lignes(section(b, { nom: 'Bumper CB5' })), ['5 Bumper CB5', '5 Moteur (point d\'accroche)']);
      v.egal('bumper sans nom', lignes(section(b)), ['5 Bumper', '5 Moteur (point d\'accroche)']);
      v.egal('pont sur 3 points : 3 moteurs', lignes(section(calculs.poids(m, CB5, { accroche: { type: 'pont', points: 3 } }))), ['3 Moteur (point d\'accroche)']);
      const cinq = section(calculs.poids(m, CB5, { accroche: { type: 'pont', points: 5 } }));
      v.egal('pont sur 5 points : moteurs à voir avec le rigger', [lignes(cinq), cinq.notes.includes('Moteurs : nombre et répartition à établir par le rigger (pont sur plus de 4 points, à portées inégales ou en porte-à-faux).')], [[], true]);
      const stack = section(calculs.poids(m, CB5, { mode: 'stack' }));
      v.egal('stack : rien à accrocher, pieds et structure au rigger', [lignes(stack), stack.notes.includes('Stack : pieds et structure à voir avec le rigger.')], [[], true]);
      v.egal('rappel du rigger', [calculs.RAPPEL_RIGGER, section(b).notes.includes(calculs.RAPPEL_RIGGER)], ['Élingues, manilles et pieds de stack : à voir avec le rigger.', true]);
      v.vrai('sans Poids : la section le dit', calculs.listeMateriel({ mur: m, dalle: CB5 }).sections.find((s) => s.id === 'accroche').notes.some((n) => /Poids/.test(n)));
    },
  },
  {
    id: 'R321',
    titre: 'Liste de matériel (13a), flight cases et poids transporté : cases = (dalles + spares) ÷ dalles par case du parc, arrondi au-dessus, fiche par fiche ; demi-dalles à part si le parc le précise, sinon « à préciser dans le parc » ; poids des cases pleines et volume quand le parc les donne ; sans saisie, « à préciser dans le parc » ; poids transporté (dalles, spares, cases) indicatif, le reste non compté',
    etape: '13a',
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 12, 12);
      const parc = { nom: 'Parc test', cases: { 'fictive-cas-13': { dallesParCase: 8, poidsCaseKg: 20, dimensionsCm: { largeur: 60, profondeur: 60, hauteur: 120 } } } };
      const liste = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, parc });
      const cases = liste.sections.find((s) => s.id === 'cases');
      v.egal('152 dalles à 8 par case : 19 cases', cases.lignes.map((l) => [l.quantite, l.designation, l.detail]), [[19, 'Flight case Dalle du cas 13', '152 dalles (spares compris), 8 par case, Parc test']]);
      v.proche('poids des cases pleines : 152 × 7,5 + 19 × 20 kg', cases.lignes[0].poidsPleinesKg, 1520, 0.001);
      v.proche('volume : 19 × 0,6 × 0,6 × 1,2 m', cases.lignes[0].volumeM3, 8.208, 0.0001);
      v.egal('6 par case : 26 cases (25,3 arrondi au-dessus)', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, parc: { cases: { 'fictive-cas-13': { dallesParCase: 6 } } } }).sections.find((s) => s.id === 'cases').lignes[0].quantite, 26);
      const sans = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).sections.find((s) => s.id === 'cases');
      v.egal('sans saisie : à préciser dans le parc', [sans.lignes, sans.notes], [[], ['Cases de Dalle du cas 13 : à préciser dans le parc.']]);
      const md = calculs.mur(CB5, 10, 2, { demi: CB5_DEMI, rangeeDemi: true });
      const cb = (c) => calculs.listeMateriel({ mur: md, dalle: CB5, parc: { cases: { 'test-cb5': c } } }).sections.find((s) => s.id === 'cases');
      const sansDemi = cb({ dallesParCase: 4 });
      v.egal('demi-dalles non précisées : à préciser', [sansDemi.lignes.map((l) => l.quantite), sansDemi.notes], [[6], ['Cases des demi-dalles CB5 MKII demi-dalle (copie de test) : à préciser dans le parc.']]);
      v.egal('demi-dalles à part : 11 à 6 par case, 2 cases', cb({ dallesParCase: 4, demiParCase: 6 }).lignes.map((l) => [l.quantite, l.designation]),
        [[6, 'Flight case CB5 MKII (copie de test)'], [2, 'Flight case CB5 MKII demi-dalle (copie de test)']]);
      v.egal('case sans poids : poids des cases pleines inconnu', cb({ dallesParCase: 4 }).lignes[0].poidsPleinesKg, null);
      v.proche('poids transporté : dalles et spares, cases vides', liste.poidsTransporte.kg, 1520, 0.001);
      v.egal('poids transporté : indicatif, ce qui n\'est pas compté', [liste.poidsTransporte.indicatif, liste.poidsTransporte.nonCompte], [true, 'processeurs, câbles et accroche non comptés']);
      const sansCase = calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).poidsTransporte;
      v.egal('sans case : dalles seules, cases non comptées', [sansCase.kg, sansCase.nonCompte], [1140, 'cases, processeurs, câbles et accroche non comptés']);
      const sansPoids = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_7, 2, 2), dalle: DALLE_CAS_7 }).poidsTransporte;
      v.egal('dalle sans poids : poids transporté inconnu', sansPoids.kg, null);
    },
  },
  {
    id: 'R322',
    titre: 'Liste de matériel (13b), réglages du parc : longueurs du stock par famille de câble (lues, triées, sans doublon ; vide = défaut ; refus avec la raison), flight case de chaque dalle (dalles et demi-dalles par case entiers, poids et dimensions positifs, tout facultatif ; vide = retiré) ; la liste lit le parc ; une fiche retirée de la base perd aussi son case',
    etape: '13b',
    verifier(v) {
      v.egal('lecture des longueurs : « 10, 2, 5 m, 2 » → 2, 5, 10', fiches.lireLongueurs('10, 2, 5 m, 2'), [2, 5, 10]);
      v.egal('espaces et virgule décimale avec point-virgule', [fiches.lireLongueurs('1 2 5'), fiches.lireLongueurs('1,5; 3')], [[1, 2, 5], [1.5, 3]]);
      v.egal('vide : longueurs par défaut', fiches.lireLongueurs('  '), null);
      let refus = null;
      try { fiches.lireLongueurs('5, -2'); } catch (e) { refus = e.message; }
      v.egal('longueur impossible : refus', refus, 'Longueurs du stock : des nombres de mètres, plus de 0 et 1000 au plus, séparés par des virgules (1, 2, 5, 10).');
      let base = fiches.creerParc(fiches.baseVide(), 'Parc A');
      const id = base.parcs[0].id;
      base = fiches.reglerLongueursParc(base, id, 'data', '5, 15, 25');
      v.egal('longueurs data du parc', base.parcs[0].longueurs, { data: [5, 15, 25] });
      v.egal('familles réglables', fiches.FAMILLES_LONGUEURS, ['data', 'multipaire', 'fibre', 'p16', 'p17']);
      v.egal('vide : retour au défaut, champ retiré', 'longueurs' in fiches.reglerLongueursParc(base, id, 'data', '').parcs[0], false);
      base = fiches.reglerCaseParc(base, id, 'fictive-cas-13', { dallesParCase: '8', demiParCase: '', poidsCaseKg: '20,5', largeurCm: '60', profondeurCm: '60', hauteurCm: '120' });
      v.egal('flight case de la dalle', base.parcs[0].cases['fictive-cas-13'], { dallesParCase: 8, poidsCaseKg: 20.5, dimensionsCm: { largeur: 60, profondeur: 60, hauteur: 120 } });
      let refusCase = null;
      try { fiches.reglerCaseParc(base, id, 'fictive-cas-13', { dallesParCase: '2,5' }); } catch (e) { refusCase = e.message; }
      v.egal('dalles par case non entier : refus', refusCase, 'Dalles par case : un nombre entier, 1 ou plus.');
      v.egal('saisie vide : case retiré', 'cases' in fiches.reglerCaseParc(base, id, 'fictive-cas-13', {}).parcs[0], false);
      v.egal('ce que la liste lit du parc', fiches.materielParc(base, id), { nom: 'Parc A', longueurs: { data: [5, 15, 25] }, cases: { 'fictive-cas-13': { dallesParCase: 8, poidsCaseKg: 20.5, dimensionsCm: { largeur: 60, profondeur: 60, hauteur: 120 } } } });
      v.egal('« Tous » : rien', fiches.materielParc(base, null), null);
      const liste = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, 12, 12), dalle: DALLE_CAS_13, parc: fiches.materielParc(base, id) });
      v.egal('la liste compte les cases du parc', liste.sections.find((s) => s.id === 'cases').lignes[0].quantite, 19);
      v.egal('fiche retirée de la base : son case retiré aussi', 'cases' in fiches.retirerFicheRetiree(base, id, 'dalle', 'fictive-cas-13').parcs[0], false);
    },
  },
  {
    id: 'R323',
    titre: 'Liste de matériel (13b), gardée avec le mur : liste et date enregistrées avec le mur sans marquer la presta modifiée, liste identique non réécrite ; jamais dans le fichier exporté (comme le suivi du montage) ; pourcentage de spare gardé avec la presta (5 % par défaut, de 0 à 100 %)',
    etape: '13b',
    verifier(v) {
      const o = optionsPresta();
      let e = prestas.migrer({ configuration: configurationEssai(12) }, o);
      const p = e.index.prestas[0];
      const murId = p.murs[0].id;
      const liste = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, 12, 12), dalle: DALLE_CAS_13 });
      const gardee = prestas.enregistrerListeMur(e, murId, liste, horloge(o, '2026-10-13T15:00:00Z'));
      v.egal('liste et date gardées avec le mur', [gardee.murs[murId].materiel.liste, gardee.murs[murId].materiel.calculeeLe], [liste, '2026-10-13T15:00:00.000Z']);
      v.egal('presta pas marquée modifiée', gardee.index.prestas[0].modifieeLe, p.modifieeLe);
      v.vrai('même liste plus tard : rien de réécrit', prestas.enregistrerListeMur(gardee, murId, JSON.parse(JSON.stringify(liste)), horloge(o, '2026-10-13T16:00:00Z')) === gardee);
      v.egal('liste gardée d\'un mur', prestas.listeGardee(gardee, murId)?.calculeeLe, '2026-10-13T15:00:00.000Z');
      v.egal('mur sans liste : null', prestas.listeGardee(e, murId), null);
      const { donnees } = prestas.exporterPresta(gardee, p.id, fiches.baseVide(), o);
      v.egal('fichier exporté : pas de liste', 'materiel' in donnees.murs[0], false);
      v.egal('spare par défaut', prestas.materielPresta(p), { sparesPourcent: 5 });
      e = prestas.reglerMaterielPresta(gardee, p.id, { sparesPourcent: 10 }, o);
      v.egal('spare gardé avec la presta', prestas.materielPresta(e.index.prestas[0]).sparesPourcent, 10);
      const refus = (x) => {
        try { prestas.reglerMaterielPresta(gardee, p.id, { sparesPourcent: x }, o); return null; } catch (err) { return err.message; }
      };
      v.egal('spare impossible : refus', [refus(-1), refus(101), refus('a')], Array(3).fill('Spare : un pourcentage de 0 à 100.'));
      v.egal('0 % permis', prestas.materielPresta(prestas.reglerMaterielPresta(gardee, p.id, { sparesPourcent: 0 }, o).index.prestas[0]).sparesPourcent, 0);
    },
  },
  {
    id: 'R324',
    titre: 'Liste de matériel (13c), total de la presta : mêmes lignes additionnées (même clé : même désignation, même longueur), dans l\'ordre des sections, avec le détail par mur ; notes de chaque mur nommées ; mur jamais ouvert depuis l\'étape 13 : « ouvre ce mur une fois pour compter son matériel » ; ajouts à la main en dernière section ; poids transporté additionné ; origine des longueurs du stock',
    etape: '13c',
    verifier(v, contexte) {
      const liste = (colonnes, parc = null) => calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, colonnes, 6), dalle: DALLE_CAS_13, parc });
      const t = calculs.totalMateriel([{ nom: 'Mur 1', liste: liste(12) }, { nom: 'Mur 2', liste: liste(4) }, { nom: 'Mur 3', liste: null }],
        { ajouts: [{ id: 'a1', libelle: 'Socapex 19 broches', quantite: 2 }] });
      const dalles = t.sections.find((s) => s.id === 'dalles').lignes;
      v.egal('dalles additionnées : 76 + 26', dalles.map((l) => [l.quantite, l.designation]), [[102, 'Dalle du cas 13']]);
      v.egal('détail par mur', [dalles[0].parMur, dalles[0].detail], [[{ nom: 'Mur 1', nombre: 76 }, { nom: 'Mur 2', nombre: 26 }], 'Mur 1 : 76 ; Mur 2 : 26']);
      v.egal('mur sans liste', [t.murs, t.manquants], [3, ['Mur 3']]);
      v.vrai('mur sans liste : le dire', t.notes.includes('Mur 3 : ouvre ce mur une fois pour compter son matériel.'), t.notes);
      v.egal('ordre des sections, ajouts à la fin', t.sections.map((s) => s.id), ['dalles', 'data', 'elec', 'accroche', 'cases', 'ajouts']);
      v.egal('ajouts à la main', t.sections.at(-1).lignes.map((l) => [l.cle, l.quantite, l.designation]), [['ajout|a1', 2, 'Socapex 19 broches']]);
      v.vrai('notes nommées par mur, regroupées quand elles sont les mêmes', t.sections.find((s) => s.id === 'cases').notes.includes('Mur 1, Mur 2 : Cases de Dalle du cas 13 : à préciser dans le parc.'),
        t.sections.find((s) => s.id === 'cases').notes);
      v.proche('poids transporté additionné : 102 × 7,5 kg', t.poidsTransporte.kg, 765, 0.001);
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const cab = (d) => calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'haut-gauche', distanceRegieM: d });
      const avecData = (d) => calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, data: { evaluation: e, variante: cab(d).variantes.find((x) => x.mode === 'colonnes'), distanceRegieM: d } });
      const deux = calculs.totalMateriel([{ nom: 'A', liste: avecData(8) }, { nom: 'B', liste: avecData(8) }]);
      v.egal('mêmes câbles de même longueur additionnés', deux.sections.find((s) => s.id === 'data').lignes.filter((l) => l.designation === 'Câble de tête RJ45').map((l) => [l.quantite, l.longueurM]), [[2, 10], [10, 20]]);
      v.egal('origine des longueurs : par défaut', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13 }).origineStock, { parc: null, familles: [] });
      v.egal('origine des longueurs : parc', calculs.listeMateriel({ mur: m, dalle: DALLE_CAS_13, parc: { nom: 'Parc A', longueurs: { data: [5, 15] } } }).origineStock, { parc: 'Parc A', familles: ['data'] });
      v.egal('libellé d\'une ligne', [calculs.libelleLigne({ designation: 'Câble de tête RJ45', longueurM: 10 }), calculs.libelleLigne({ designation: 'Câble de tête RJ45', longueurM: null, aMesurer: true })],
        ['Câble de tête RJ45, 10 m', 'Câble de tête RJ45, longueur à mesurer']);
    },
  },
  {
    id: 'R325',
    titre: 'Liste de matériel (13c), check-list et ajouts à la main gardés avec la presta : une ligne cochée vaut pour sa quantité ; quantité changée ou ligne disparue : décochée avec la raison (« … : 6 au lieu de 4, décoché »), jamais en silence, oubliée sur « Compris » ; « Tout décocher » ; cocher ne marque pas la presta modifiée ; ajout (libellé et quantité vérifiés), retrait',
    etape: '13c',
    verifier(v) {
      const o = optionsPresta();
      let e = prestas.migrer({ configuration: configurationEssai(12) }, o);
      const p = e.index.prestas[0];
      const ligne = (cle, quantite, designation, longueurM = null) => ({ cle, quantite, designation, longueurM, aMesurer: false });
      const total = (q) => ({ sections: [{ id: 'data', titre: 'Data', notes: [], lignes: [ligne('cable|Câble de tête RJ45|10', q, 'Câble de tête RJ45', 10), ligne('liaison|data', 66, 'Liaison RJ45 entre dalles')] }] });
      e = prestas.cocherLigne(e, p.id, 'cable|Câble de tête RJ45|10', 4, o);
      e = prestas.cocherLigne(e, p.id, 'liaison|data', 66, o);
      v.egal('cocher ne marque pas la presta modifiée', e.index.prestas[0].modifieeLe, p.modifieeLe);
      v.egal('lignes cochées', [...prestas.rapprocherCoches(e.index.prestas[0], total(4)).cochees].sort(), ['cable|Câble de tête RJ45|10', 'liaison|data']);
      const r = prestas.rapprocherCoches(e.index.prestas[0], total(6));
      v.egal('quantité changée : décochée avec la raison', [[...r.cochees], r.changees.map((x) => x.texte)], [['liaison|data'], ['Câble de tête RJ45, 10 m : 6 au lieu de 4, décoché']]);
      const sans = { sections: [{ id: 'data', titre: 'Data', notes: [], lignes: [ligne('liaison|data', 66, 'Liaison RJ45 entre dalles')] }] };
      v.egal('ligne disparue : décochée avec la raison', prestas.rapprocherCoches(e.index.prestas[0], sans).changees.map((x) => x.texte), ['Câble de tête RJ45, 10 m : plus dans la liste, décoché']);
      const compris = prestas.oublierCochesChangees(e, p.id, total(6), o);
      v.egal('« Compris » : la coche changée est oubliée, les autres restent', Object.keys(prestas.cochesPresta(compris.index.prestas[0])), ['liaison|data']);
      v.egal('décocher une ligne', Object.keys(prestas.cochesPresta(prestas.cocherLigne(e, p.id, 'liaison|data', null, o).index.prestas[0])), ['cable|Câble de tête RJ45|10']);
      v.egal('tout décocher', prestas.cochesPresta(prestas.toutDecocher(e, p.id, o).index.prestas[0]), {});
      let a = prestas.ajouterAjout(e, p.id, { libelle: ' Socapex 19 broches ', quantite: '2' }, o);
      v.egal('ajout à la main', prestas.ajoutsPresta(a.index.prestas[0]).map((x) => [x.libelle, x.quantite]), [['Socapex 19 broches', 2]]);
      a = prestas.ajouterAjout(a, p.id, { libelle: 'Gaffer', quantite: 6 }, o);
      const premier = prestas.ajoutsPresta(a.index.prestas[0])[0].id;
      v.egal('retrait d\'un ajout', prestas.ajoutsPresta(prestas.retirerAjout(a, p.id, premier, o).index.prestas[0]).map((x) => x.libelle), ['Gaffer']);
      const refus = (x) => {
        try { prestas.ajouterAjout(e, p.id, x, o); return null; } catch (err) { return err.message; }
      };
      v.egal('ajout impossible : refus', [refus({ libelle: '', quantite: 1 }), refus({ libelle: 'Harting', quantite: 0 }), refus({ libelle: 'Harting', quantite: '1,5' }), refus({ libelle: 'x'.repeat(81), quantite: 1 })],
        ['Donne le nom du matériel ajouté.', 'Quantité : un nombre entier, de 1 à 9999.', 'Quantité : un nombre entier, de 1 à 9999.', 'Nom du matériel ajouté trop long : 80 caractères au plus.']);
      v.vrai('fichier exporté : ni coches ni ajouts (presta)', !('materiel' in prestas.exporterPresta(a, p.id, fiches.baseVide(), o).donnees.presta));
    },
  },
  {
    id: 'R326',
    titre: 'Liste de matériel (13c), texte copié et fichier partagé : texte simple, une information par ligne, sans tiret de liste ; marqué indicatif ; spare, longueurs du stock et cases avec leur origine ; chaque ligne « quantité × désignation : détail », « , chargé » si elle est cochée ; murs sans liste ; poids transporté indicatif ; compte des lignes cochées ; nom du fichier',
    etape: '13c',
    verifier(v) {
      const parc = { nom: 'Parc A', longueurs: { data: [5, 15] }, cases: { 'fictive-cas-13': { dallesParCase: 8, poidsCaseKg: 20 } } };
      const l1 = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, 12, 12), dalle: DALLE_CAS_13, parc });
      const total = calculs.totalMateriel([{ nom: 'Mur 1', liste: l1 }, { nom: 'Mur 2', liste: null }], { ajouts: [{ id: 'a1', libelle: 'Socapex', quantite: 2 }] });
      const t = resumes.resumeMateriel({ titre: 'Presta A, total de 2 murs', total, sparesPourcent: 5, coches: new Set(['dalle|fictive-cas-13']) }).split('\n');
      v.egal('en-tête', t.slice(0, 5), [
        'MATÉRIEL',
        'Presta A, total de 2 murs',
        'Liste indicative, à vérifier avant le chargement.',
        'Spare des dalles : 5 % par fiche, arrondi au-dessus, au moins 1',
        'Longueurs du stock : Parc A (Câbles RJ45), par défaut pour les autres',
      ]);
      v.vrai('mur sans liste', t.includes('Mur 2 : ouvre ce mur une fois pour compter son matériel.'), t.join(' / '));
      v.vrai('ligne cochée', t.includes('152 × Dalle du cas 13 : 144 au mur + 8 de spare (5 %, arrondi au-dessus), chargé'), t.join(' / '));
      v.vrai('cases avec leur origine', t.includes('19 × Flight case Dalle du cas 13 : 152 dalles (spares compris), 8 par case, Parc A'), t.join(' / '));
      v.vrai('ajouts à la main', t.includes('AJOUTS À LA MAIN') && t.includes('2 × Socapex'), t.join(' / '));
      v.vrai('poids transporté indicatif', t.includes('POIDS TRANSPORTÉ') && t.includes('1520 kg, indicatif ; processeurs, câbles et accroche non comptés'), t.join(' / '));
      v.vrai('compte des lignes cochées', t.at(-1) === `Chargement : 1 ligne cochée sur ${total.sections.reduce((s, x) => s + x.lignes.length, 0)}`, t.at(-1));
      v.vrai('texte simple : aucune ligne ne commence par un tiret ou une puce', t.every((l) => !/^[\s•*-]/.test(l) && !/[—–]/.test(l)));
      const mur = resumes.resumeMateriel({ titre: 'Presta A · Mur 1', liste: l1, sparesPourcent: 5 }).split('\n');
      v.egal('liste d\'un mur : sans compte de chargement', [mur[1], mur.some((l) => /^Chargement/.test(l))], ['Presta A · Mur 1', false]);
      v.egal('nom du fichier', prestas.nomFichierMateriel('Presta A', new Date('2026-10-17T10:00:00Z')), 'mur-led-materiel-presta-a-2026-10-17.txt');
    },
  },
  {
    id: 'R327',
    titre: 'Nom du fichier exporté (lot du 17/10/2026) : lettres liées remplacées avant la simplification (œ → oe, æ → ae, ß → ss) ; « Cœur de scène » ne devient plus « c-ur-de-scene » ; liste de matériel aussi',
    etape: '13d',
    verifier(v) {
      v.egal('lettres liées', [prestas.nomFichierPresta('Cœur de scène', MAINTENANT_PRESTA), prestas.nomFichierPresta('ŒUVRE Æsir Straße', MAINTENANT_PRESTA)],
        ['mur-led-presta-coeur-de-scene-2026-10-13.json', 'mur-led-presta-oeuvre-aesir-strasse-2026-10-13.json']);
      v.egal('liste de matériel', prestas.nomFichierMateriel('Cœur', MAINTENANT_PRESTA), 'mur-led-materiel-coeur-2026-10-13.txt');
    },
  },
  {
    id: 'R328',
    titre: 'Suivi du montage (lot du 17/10/2026) : enregistré avec le mur sans marquer la presta modifiée (ouvrir le guide, cocher un port) ; une saisie la marque toujours',
    etape: '13d',
    verifier(v) {
      const o = optionsPresta();
      const e = prestas.migrer({ configuration: configurationEssai(12) }, o);
      const p = e.index.prestas[0];
      const murId = p.murs[0].id;
      const suivi = prestas.enregistrerMur(e, murId, { montage: { data: { coches: ['x'], courant: null, avis: null } } }, horloge(o, '2026-10-13T15:00:00Z'));
      v.egal('suivi enregistré, presta pas marquée modifiée', [suivi.murs[murId].montage.data.coches, suivi.index.prestas[0].modifieeLe], [['x'], p.modifieeLe]);
      const saisie = prestas.enregistrerMur(e, murId, { configuration: configurationEssai(8), montage: null }, horloge(o, '2026-10-13T15:00:00Z'));
      v.egal('saisie : presta marquée modifiée', saisie.index.prestas[0].modifieeLe, '2026-10-13T15:00:00.000Z');
    },
  },
  {
    id: 'R329',
    titre: 'Fiches par métier (14a, § 3) : horaires (montage, show, démontage), accès (quai, ascenseur, charge maxi) et contacts (chef de projet, régie, électricien, rigger : nom et téléphone) de la presta, tous facultatifs ; 80 caractères par horaire et par accès, 60 par nom, 30 par téléphone en texte libre ; espaces de bord retirés ; une saisie refusée donne sa raison ; presta d\'avant l\'étape 14 : organisation vide ; « Modifier » sans organisation la garde ; tout vidé : plus rien d\'écrit',
    etape: '14a',
    verifier(v) {
      const o = optionsPresta();
      const etat = prestas.migrer({}, o);
      const id = etat.index.prestas[0].id;
      const vide = prestas.organisationVide();
      const contact = { nom: '', telephone: '' };
      v.egal('organisation vide', vide, {
        horaires: { montage: '', show: '', demontage: '' }, acces: { quai: '', ascenseur: '', chargeMaxi: '' },
        contacts: { chefProjet: contact, regie: contact, electricien: contact, rigger: contact },
      });
      v.egal('presta d\'avant l\'étape 14 : organisation vide, rien d\'écrit', [prestas.organisationPresta(etat.index.prestas[0]), 'organisation' in etat.index.prestas[0]], [vide, false]);
      const infos = { nom: 'Presta A', debut: null, fin: null, lieu: '', notes: '' };
      const e = prestas.modifierPresta(etat, id, { ...infos, organisation: ORGANISATION_SAISIE }, horloge(o, '2026-10-14T12:00:00Z'));
      const p = e.index.prestas[0];
      v.egal('enregistrée, espaces de bord retirés', prestas.organisationPresta(p), ORGANISATION_ESSAI);
      v.egal('date de modification ; état de départ inchangé', [p.modifieeLe, 'organisation' in etat.index.prestas[0]], ['2026-10-14T12:00:00.000Z', false]);
      v.egal('« Modifier » sans organisation : elle est gardée', prestas.organisationPresta(prestas.modifierPresta(e, id, { ...infos, nom: 'Presta B' }, o).index.prestas[0]), ORGANISATION_ESSAI);
      v.egal('saisie partielle : le reste vide', prestas.organisationPresta(prestas.modifierPresta(etat, id, { ...infos, organisation: { acces: { quai: 'Quai C' } } }, o).index.prestas[0]),
        { ...vide, acces: { ...vide.acces, quai: 'Quai C' } });
      const videe = prestas.modifierPresta(e, id, { ...infos, organisation: { ...vide, acces: { quai: '   ', ascenseur: '', chargeMaxi: '' } } }, o).index.prestas[0];
      v.egal('tout vidé (espaces seuls compris) : plus rien d\'écrit', ['organisation' in videe, prestas.organisationPresta(videe)], [false, vide]);
      const essai = (org) => messageErreur(() => prestas.modifierPresta(e, id, { ...infos, organisation: org }, o));
      v.egal('refus, avec leur raison', [
        essai({ horaires: { montage: 'x'.repeat(81) } }), essai({ horaires: { show: 'x'.repeat(81) } }), essai({ horaires: { demontage: 'x'.repeat(81) } }),
        essai({ acces: { quai: 'x'.repeat(81) } }), essai({ acces: { ascenseur: 'x'.repeat(81) } }), essai({ acces: { chargeMaxi: 'x'.repeat(81) } }),
        essai({ contacts: { rigger: { nom: 'x'.repeat(61) } } }), essai({ contacts: { chefProjet: { telephone: '0'.repeat(31) } } }),
        essai('texte'), essai({ contacts: { regie: { nom: 12 } } }), essai({ horaires: ['jeudi'] }),
      ], [
        'Horaire du montage trop long : 80 caractères au plus.', 'Horaire du show trop long : 80 caractères au plus.', 'Horaire du démontage trop long : 80 caractères au plus.',
        'Quai trop long : 80 caractères au plus.', 'Ascenseur trop long : 80 caractères au plus.', 'Charge maxi trop longue : 80 caractères au plus.',
        'Nom du contact rigger trop long : 60 caractères au plus.', 'Téléphone du contact chef de projet trop long : 30 caractères au plus.',
        'Horaires, accès et contacts illisibles.', 'Horaires, accès et contacts illisibles.', 'Horaires, accès et contacts illisibles.',
      ]);
      v.egal('acceptés : 80, 60 et 30 caractères, téléphone en texte libre', [
        essai({ horaires: { montage: 'x'.repeat(80) }, acces: { chargeMaxi: 'x'.repeat(80) } }), essai({ contacts: { electricien: { nom: 'x'.repeat(60), telephone: '+33 0 00 00 00 00 (perso)' } } }),
        essai({ contacts: { regie: { telephone: '0'.repeat(30) } } }), essai(null), essai(undefined),
      ], ['', '', '', '', '']);
    },
  },
  {
    id: 'R330',
    titre: 'Fiches par métier (14a, § 3) : horaires, accès et contacts exportés avec la presta (rien quand tout est vide : en-tête identique à celui d\'avant), importés avec elle (fichier d\'avant l\'étape 14 : organisation vide ; « Remplacer la mienne » prend celle du fichier ; trop longue : fichier refusé avec la raison), recopiés par « Dupliquer »',
    etape: '14a',
    verifier(v, contexte) {
      const o = optionsPresta();
      const { etat: avant, presta, base, depart } = prestaEssai(o, contexte);
      const etat = prestas.modifierPresta(avant, presta.id, { ...presta, organisation: ORGANISATION_SAISIE }, o);
      const { donnees } = prestas.exporterPresta(etat, presta.id, base, o);
      v.egal('exportée avec la presta', donnees.presta.organisation, ORGANISATION_ESSAI);
      const ancien = prestas.exporterPresta(avant, presta.id, base, o).donnees;
      v.egal('vide : rien dans le fichier', Object.keys(ancien.presta), ['id', 'nom', 'debut', 'fin', 'lieu', 'notes']);
      const neuf = prestas.migrer({}, o);
      const r1 = prestas.importerPresta(neuf, base, depart, JSON.stringify(donnees), {}, o);
      v.egal('importée avec la presta', [r1.erreurs, prestas.organisationPresta(prestas.prestaOuverte(r1.etat))], [[], ORGANISATION_ESSAI]);
      const r2 = prestas.importerPresta(neuf, base, depart, JSON.stringify(ancien), {}, o);
      v.egal('fichier d\'avant l\'étape 14 : organisation vide', [r2.erreurs, prestas.organisationPresta(prestas.prestaOuverte(r2.etat))], [[], prestas.organisationVide()]);
      const r3 = prestas.importerPresta(etat, base, depart, JSON.stringify(ancien), { presta: 'remplacer' }, o);
      v.egal('« Remplacer la mienne » : celle du fichier', [r3.rapport.presta, prestas.organisationPresta(r3.etat.index.prestas.find((p) => p.id === presta.id))], ['remplacee', prestas.organisationVide()]);
      const trop = { ...donnees, presta: { ...donnees.presta, organisation: { contacts: { rigger: { telephone: '0'.repeat(31) } } } } };
      v.egal('trop longue : fichier refusé avec la raison', prestas.verifierImportPresta(JSON.stringify(trop), neuf, base, depart).erreurs,
        ['Téléphone du contact rigger trop long : 30 caractères au plus.']);
      const copieP = prestas.prestaOuverte(prestas.dupliquerPresta(etat, presta.id, o));
      v.egal('« Dupliquer » la recopie', [copieP.nom, prestas.organisationPresta(copieP)], ['Presta A (copie)', ORGANISATION_ESSAI]);
    },
  },
  {
    id: 'R331',
    titre: 'Fiches par métier (14b, § 4) : textes des onglets Mur, Data, Canvas, Élec et Poids gardés avec le mur, avec leur date, sans marquer la presta modifiée ; textes identiques non réécrits ; onglet au calcul non valide gardé à null ; jamais dans le fichier exporté ; recopiés par « Dupliquer »',
    etape: '14b',
    verifier(v, contexte) {
      const o = optionsPresta();
      const { etat, presta, base } = prestaEssai(o, contexte);
      const murId = presta.murs[0].id;
      const textes = { ...textesEssai(contexte), canvas: null };
      const gardee = prestas.enregistrerFicheMur(etat, murId, textes, horloge(o, '2026-10-17T15:00:00Z'));
      v.egal('textes et date gardés avec le mur', prestas.ficheGardee(gardee, murId), { textes, calculeeLe: '2026-10-17T15:00:00.000Z' });
      v.egal('presta pas marquée modifiée', gardee.index.prestas.find((p) => p.id === presta.id).modifieeLe, presta.modifieeLe);
      v.vrai('textes identiques : état inchangé', prestas.enregistrerFicheMur(gardee, murId, textes, horloge(o, '2026-10-17T16:00:00Z')) === gardee);
      v.egal('mur jamais gardé : rien', prestas.ficheGardee(gardee, presta.murs[1].id), null);
      v.vrai('jamais dans le fichier exporté', !JSON.stringify(prestas.exporterPresta(gardee, presta.id, base, o).donnees).includes('CANVAS') && !JSON.stringify(prestas.exporterPresta(gardee, presta.id, base, o).donnees).includes('calculeeLe'));
      const copieP = prestas.prestaOuverte(prestas.dupliquerPresta(gardee, presta.id, o));
      const dup = prestas.dupliquerPresta(gardee, presta.id, o);
      v.egal('« Dupliquer » recopie les textes', prestas.ficheGardee(dup, prestas.prestaOuverte(dup).murs[0].id)?.textes, textes);
      v.egal('mur introuvable : refus', messageErreur(() => prestas.enregistrerFicheMur(gardee, 'm-absent', textes, o)), 'Mur introuvable.');
      v.egal('copie nommée', copieP.nom, 'Presta A (copie)');
    },
  },
  {
    id: 'R332',
    titre: 'Fiches par métier (14b, § 4) : quatre métiers (rigger, électricien, régie, chef de projet) ; en-tête : presta, dates, lieu, horaires et accès remplis, contacts du métier puis du chef de projet (tous pour le chef de projet, contacts vides omis), date de la fiche ; rappel « Fiche indicative, à valider par … » selon le métier',
    etape: '14b',
    verifier(v) {
      v.egal('métiers', fichesMetier.METIERS.map((m) => [m.id, m.nom, m.titre]),
        [['rigger', 'Rigger', 'Fiche rigger'], ['electricien', 'Électricien', 'Fiche électricien'], ['regie', 'Régie', 'Fiche régie vidéo'], ['chefProjet', 'Chef de projet', 'Fiche chef de projet']]);
      const presta = { nom: 'Presta A', debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B', notes: '', organisation: ORGANISATION_ESSAI, murs: [] };
      const fiche = (metier) => fichesMetier.ficheMetier(metier, { presta, murs: [], date: new Date(2026, 9, 17, 12) });
      const tete = [['Presta', 'Presta A'], ['Dates', 'du 17 au 19/10/2026'], ['Lieu', 'Lieu B'], ['Montage', 'jeudi 8 h à 18 h'], ['Show', 'vendredi 20 h'], ['Quai', 'Quai B'], ['Charge maxi', '2 t']];
      const date = ['Date de la fiche', '17/10/2026'];
      v.egal('rigger : son contact (téléphone seul) et le chef de projet', fiche('rigger').entete, [...tete, ['Rigger', '00 00 00 00 04 (portable)'], ['Chef de projet', 'Contact A, 00 00 00 00 01'], date]);
      v.egal('électricien : contact vide omis, le chef de projet', fiche('electricien').entete, [...tete, ['Chef de projet', 'Contact A, 00 00 00 00 01'], date]);
      v.egal('régie : son contact (nom seul) et le chef de projet', fiche('regie').entete, [...tete, ['Régie', 'Contact B'], ['Chef de projet', 'Contact A, 00 00 00 00 01'], date]);
      v.egal('chef de projet : tous les contacts remplis', fiche('chefProjet').entete, [...tete, ['Chef de projet', 'Contact A, 00 00 00 00 01'], ['Régie', 'Contact B'], ['Rigger', '00 00 00 00 04 (portable)'], date]);
      v.egal('rappels', fichesMetier.METIERS.map((m) => fiche(m.id).rappel), [
        'Fiche indicative, à valider par le rigger.', 'Fiche indicative, à valider par l\'électricien.', 'Fiche indicative, à valider par la régie.',
        'Fiche indicative : accroche à valider par le rigger, électricité par l\'électricien, vidéo par la régie.',
      ]);
      v.egal('presta sans dates, lieu ni organisation : le nom et la date seulement', fichesMetier.ficheMetier('rigger', { presta: { nom: 'Presta C', murs: [] }, murs: [], date: new Date(2026, 9, 17, 12) }).entete,
        [['Presta', 'Presta C'], date]);
      v.egal('titre', fiche('regie').titre, 'Fiche régie vidéo');
      v.egal('métier inconnu : refus', messageErreur(() => fiche('cariste')), 'Métier inconnu : cariste.');
    },
  },
  {
    id: 'R333',
    titre: 'Fiches par métier (14b, § 4) : un bloc par mur ; rigger, le texte de Poids (sans son titre) en lignes « libellé : valeur », puis l\'accroche de la liste de matériel ; électricien, le texte d\'Élec puis la section Élec de la liste ; onglet au calcul non valide : « calcul non valide, corrige ce mur » ; mur jamais ouvert depuis l\'étape 14 : « Ouvre ce mur une fois pour sa fiche. »',
    etape: '14b',
    verifier(v, contexte) {
      const textes = textesEssai(contexte);
      const liste = listeEssai();
      const presta = { nom: 'Presta A', murs: [] };
      const murs = [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: { liste } }, { nom: 'Mur 2', fiche: null, materiel: null }];
      const f = (metier, m = murs) => fichesMetier.ficheMetier(metier, { presta, murs: m, date: new Date(2026, 9, 17, 12) });
      const enLignes = (t) => t.split('\n').slice(1).map((l) => { const i = l.indexOf(' : '); return i < 0 ? { libelle: '', valeur: l } : { libelle: l.slice(0, i), valeur: l.slice(i + 3) }; });
      const materiel = (id) => {
        const s = liste.sections.find((x) => x.id === id);
        return [...s.lignes.map((l) => ({ libelle: `${l.quantite} × ${calculs.libelleLigne(l)}`, valeur: l.detail ?? '' })), ...s.notes.map((n) => ({ libelle: 'Note', valeur: n }))];
      };
      const rigger = f('rigger');
      v.egal('un bloc par mur, avec la date des textes', rigger.blocs.map((b) => [b.titre, b.date]), [['Mur 1', '17/10/2026'], ['Mur 2', null]]);
      v.egal('rigger : texte de Poids, puis le matériel d\'accroche', rigger.blocs[0].lignes, [...enLignes(textes.poids), { titre: 'Matériel d\'accroche' }, ...materiel('accroche')]);
      v.vrai('rigger : poids et rappel du rigger repris', rigger.blocs[0].lignes.some((l) => l.libelle === 'Total suspendu' && l.valeur === '540 kg')
        && rigger.blocs[0].lignes.some((l) => l.valeur === calculs.RAPPEL_RIGGER));
      v.egal('électricien : texte d\'Élec, puis le matériel électrique', f('electricien').blocs[0].lignes, [...enLignes(textes.elec), { titre: 'Matériel électrique' }, ...materiel('elec')]);
      v.vrai('électricien : boîtiers de la liste repris', f('electricien').blocs[0].lignes.some((l) => l.libelle === '2 × Boîtier 32 A tri'));
      v.egal('mur jamais ouvert depuis l\'étape 14', [rigger.blocs[1].lignes, rigger.blocs[1].manque], [[], 'Ouvre ce mur une fois pour sa fiche.']);
      const invalide = f('electricien', [{ nom: 'Mur 1', fiche: { textes: { ...textes, elec: null }, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: { liste } }]);
      v.egal('onglet au calcul non valide', invalide.blocs[0].lignes[0], { libelle: 'Élec', valeur: 'calcul non valide, corrige ce mur' });
      const sansListe = f('rigger', [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: null }]);
      v.egal('liste de matériel absente : dit', sansListe.blocs[0].lignes.at(-1), { libelle: 'Matériel', valeur: 'ouvre ce mur une fois pour compter son matériel' });
    },
  },
  {
    id: 'R334',
    titre: 'Fiches par métier (14b, § 4) : régie vidéo, le texte de Canvas, puis les lignes de Data utiles à la régie (processeurs, réglages, processeur n° i, mapping, découpage, zones ; ni capacités, ni ports et couleurs du câblage), puis les exports à demander dans le Schéma (pixel map PNG, positions CSV, modèle 3D OBJ)',
    etape: '14b',
    verifier(v, contexte) {
      const textes = textesEssai(contexte);
      const f = fichesMetier.ficheMetier('regie', { presta: { nom: 'Presta A', murs: [] }, murs: [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: null }], date: new Date(2026, 9, 17, 12) });
      const lignes = f.blocs[0].lignes;
      const iData = lignes.findIndex((l) => l.titre === 'Data');
      const iExports = lignes.findIndex((l) => l.titre === 'Exports à demander dans le Schéma');
      v.vrai('texte de Canvas d\'abord', lignes[0].libelle === 'Source' && lignes.slice(0, iData).filter((l) => /^Processeur n° \d+, bloc$/.test(l.libelle)).length === 2);
      v.egal('lignes de Data utiles à la régie', lignes.slice(iData + 1, iExports).map((l) => `${l.libelle} : ${l.valeur}`), [
        'Processeur : 2 × Novastar MCTRL660', 'Réglages : 60 Hz, 8 bits réseau, sans redondance',
        ...textes.data.split('\n').filter((l) => /^MCTRL660 n° \d+ : /.test(l)),
      ]);
      v.vrai('processeur n° i présent (deux)', lignes.slice(iData + 1, iExports).filter((l) => /^MCTRL660 n° \d+$/.test(l.libelle)).length === 2);
      v.egal('exports à demander', lignes.slice(iExports + 1), [
        { libelle: 'Pixel map', valeur: 'PNG à la taille exacte du mur ou du canvas de chaque processeur' },
        { libelle: 'Positions des dalles', valeur: 'CSV' }, { libelle: 'Modèle 3D', valeur: 'OBJ' },
      ]);
      const filtre = fichesMetier.lignesDataRegie([
        'DATA', 'Processeur : 2 × S8', 'Capacité par port : 525 000 px', 'S8 n° 1 : colonnes 1 à 6 (36 dalles, 3 ports)',
        'S8 n° 1, port 1 : 12 dalles de C1 R1 à C2 R6, couleur bleu', 'Mapping : 1:1 ; pixels comptés par dalle : A 20 736', 'Découpage : zones entières (variante retenue), 2 × S8',
        'S8 n° 1, sortie dans la pixel map du mur : x 0 à 1151, y 0 à 575', 'Réglage des zones : groupes dans Tessera', 'Alerte : quelque chose',
      ].join('\n'));
      v.egal('filtre des lignes de Data', filtre.map((l) => l.libelle), ['Processeur', 'S8 n° 1', 'Mapping', 'Découpage', 'S8 n° 1, sortie dans la pixel map du mur', 'Réglage des zones']);
    },
  },
  {
    id: 'R335',
    titre: 'Fiches par métier (14b, § 4) : chef de projet, synthèse courte par mur (taille, dalles et spares, résolution, processeurs et ports, puissance, lignes et arrivée, mode et poids suspendu, alertes graves : refus, impossible, lignes de résultat à l\'état « dépasse », « dépassé » ou « ne passe pas », sans les alertes ordinaires ni doublon), puis le total de matériel de la presta sans les coches ; texte copié (titre, rappel, en-tête, un bloc par mur, une information par ligne, sans tiret)',
    etape: '14b',
    verifier(v, contexte) {
      const textes = textesEssai(contexte);
      const liste = listeEssai();
      const graves = {
        ...textes, elec: `${textes.elec}\nPhase L1 : 2 lignes, 7 000 W, 31,8 A, dépasse\nAlerte : une alerte ordinaire qui dépasse`,
        canvas: `${textes.canvas}\nRefus : liaison trop longue\nRefus : liaison trop longue`, poids: `${textes.poids}\nMaximum en accroche : 7 pour 6 dalles en hauteur, dépassé (essai)`,
      };
      const murs = [{ nom: 'Mur 1', fiche: { textes: graves, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: { liste } }, { nom: 'Mur 2', fiche: null, materiel: null }];
      const total = calculs.totalMateriel([{ nom: 'Mur 1', liste }, { nom: 'Mur 2', liste: null }]);
      const presta = { nom: 'Presta A', debut: '2026-10-17', fin: '2026-10-19', lieu: 'Lieu B', organisation: ORGANISATION_ESSAI, murs: [] };
      const f = fichesMetier.ficheMetier('chefProjet', { presta, murs, total, date: new Date(2026, 9, 17, 12) });
      const dalles = liste.sections[0].lignes[0];
      v.egal('synthèse du mur', f.blocs[0].lignes.map((l) => (l.titre ? `[${l.titre}]` : `${l.libelle} : ${l.valeur}`)), [
        ligneDe(textes.mur, 'Dalle'), 'Dalles : 12 × 6 = 72 (colonnes × lignes)', ligneDe(textes.mur, 'Taille'), ligneDe(textes.mur, 'Résolution'),
        `Dalles et spares : ${dalles.quantite} × ${calculs.libelleLigne(dalles)}, ${dalles.detail}`,
        'Processeur : 2 × Novastar MCTRL660', ligneDe(textes.data, 'Ports en colonnes entières'),
        'Puissance totale : 9,36 kW', ligneDe(textes.elec, 'Lignes en colonnes entières'), ligneDe(textes.elec, 'Arrivée'),
        'Mode : accroche', 'Total suspendu : 540 kg',
        '[Alertes graves]', 'Refus : liaison trop longue', 'Phase L1 : 2 lignes, 7 000 W, 31,8 A, dépasse', 'Maximum en accroche : 7 pour 6 dalles en hauteur, dépassé (essai)',
      ]);
      const sansAlerte = fichesMetier.ficheMetier('chefProjet', { presta, murs: [{ ...murs[0], fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' } }], total, date: new Date(2026, 9, 17, 12) });
      v.egal('sans alerte grave', sansAlerte.blocs[0].lignes.at(-1), { libelle: 'Alertes graves', valeur: 'aucune' });
      v.egal('mur jamais ouvert', f.blocs[1].manque, 'Ouvre ce mur une fois pour sa fiche.');
      v.egal('total de matériel : titre et sections de la liste', [f.fin.titre, f.fin.lignes.filter((l) => l.titre).map((l) => l.titre)],
        ['Matériel de la presta', total.sections.filter((s) => s.lignes.length || s.notes.length).map((s) => s.titre)]);
      v.vrai('total : quantités additionnées, mur sans liste signalé', f.fin.lignes.some((l) => l.libelle === `${dalles.quantite} × ${calculs.libelleLigne(dalles)}`)
        && f.fin.lignes.some((l) => /Mur 2/.test(l.valeur) && /ouvre ce mur/.test(l.valeur)));
      v.vrai('pas de coche dans la fiche', !JSON.stringify(f).includes('chargé'));
      const t = fichesMetier.texteFiche(f).split('\n');
      v.egal('texte copié : début', t.slice(0, 4), ['FICHE CHEF DE PROJET', 'Fiche indicative : accroche à valider par le rigger, électricité par l\'électricien, vidéo par la régie.', 'Presta : Presta A', 'Dates : du 17 au 19/10/2026']);
      v.vrai('texte copié : un titre par mur, date des textes, lignes « libellé : valeur »', t.includes('MUR 1') && t.includes('Textes du : 17/10/2026') && t.includes('Total suspendu : 540 kg')
        && t.includes('ALERTES GRAVES') && t.includes('MUR 2') && t.includes('Ouvre ce mur une fois pour sa fiche.') && t.includes('MATÉRIEL DE LA PRESTA'));
      v.egal('texte copié : sans tiret ni ligne vide ni puce', [/[—–]/.test(t.join('\n')), t.filter((l) => !l.trim() || /^\s*[-•*]/.test(l)).length], [false, 0]);
    },
  },
  {
    id: 'R336',
    titre: 'Fiches par métier (14c, § 5) : fichier partagé « mur-led-fiche-<métier>-<nom simplifié>-<AAAA-MM-JJ>.txt » ; chaque bloc garde l\'identifiant de son mur (« Ouvrir ce mur »)',
    etape: '14c',
    verifier(v) {
      v.egal('noms de fichier', fichesMetier.METIERS.map((m) => fichesMetier.nomFichierFiche('Presta Été / Cœur', m.id, MAINTENANT_PRESTA)), [
        'mur-led-fiche-rigger-presta-ete-coeur-2026-10-13.txt', 'mur-led-fiche-electricien-presta-ete-coeur-2026-10-13.txt',
        'mur-led-fiche-regie-presta-ete-coeur-2026-10-13.txt', 'mur-led-fiche-chef-de-projet-presta-ete-coeur-2026-10-13.txt',
      ]);
      const f = fichesMetier.ficheMetier('rigger', { presta: { nom: 'Presta A' }, murs: [{ id: 'm-a', nom: 'Mur 1', fiche: null, materiel: null }], date: new Date(2026, 9, 17, 12) });
      v.egal('identifiant du mur dans son bloc', f.blocs[0].murId, 'm-a');
    },
  },
  {
    id: 'R337',
    titre: 'Fiche en PDF (14d, § 10) : texte en WinAnsi (accents, œ, €, ×, ²), caractères absents remplacés (« → » devient « -> », « ≥ » devient « >= », espaces fines en espaces) ; largeurs Helvetica et Helvetica-Bold ; lignes coupées entre les mots, un mot trop long coupé ; fichier PDF 1.4 lisible : en-tête, objets à leur place dans la table xref, startxref, nombre de pages, polices standard en WinAnsiEncoding, fichier tout en ASCII (accents en octal)',
    etape: '14d',
    verifier(v, contexte) {
      v.egal('WinAnsi', [...pdf.versWinAnsi('é à œ € × ² Ç')].map((c) => c.charCodeAt(0)), [0xe9, 0x20, 0xe0, 0x20, 0x9c, 0x20, 0x80, 0x20, 0xd7, 0x20, 0xb2, 0x20, 0xc7]);
      v.egal('remplacements', pdf.versWinAnsi('a → b ≥ c\u202fd\u00a0e ≈ f − g ✓'), 'a -> b >= c d\u00a0e ~ f - g ?');
      v.egal('largeurs (points)', [pdf.largeurTexte('Ab', { taille: 10 }), pdf.largeurTexte('Ab', { gras: true, taille: 10 }), pdf.largeurTexte('é', { taille: 10 })], [12.23, 13.33, 5.56]);
      const largeur = pdf.largeurTexte('aaa bbb', { taille: 10 });
      v.egal('coupure entre les mots', pdf.couperTexte('aaa bbb ccc', largeur, { taille: 10 }), ['aaa bbb', 'ccc']);
      const long = pdf.couperTexte('x'.repeat(200), 100, { taille: 10 });
      v.vrai('mot trop long : morceaux dans la largeur, rien de perdu', long.length > 1 && long.every((l) => pdf.largeurTexte(l, { taille: 10 }) <= 100) && long.join('') === 'x'.repeat(200));
      v.egal('texte vide : une ligne vide', pdf.couperTexte('', 100, { taille: 10 }), ['']);
      const fiche = fichesMetier.ficheMetier('electricien', { presta: { nom: 'Presta Été' }, murs: [{ id: 'm-1', nom: 'Mur 1', fiche: { textes: textesEssai(contexte), calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: { liste: listeEssai() } }], date: new Date(2026, 9, 17, 12) });
      const f = pdf.pdfFiche(fiche);
      v.egal('en-tête et fin', [f.slice(0, 9), f.endsWith('%%EOF\n')], ['%PDF-1.4\n', true]);
      v.vrai('fichier tout en ASCII', [...f].every((c) => c.charCodeAt(0) < 128));
      const debutXref = f.lastIndexOf('\nxref\n') + 1;
      const xref = f.slice(debutXref);
      const n = Number(xref.split('\n')[1].split(' ')[1]);
      v.vrai(`table xref lue (${n} entrées)`, n > 5);
      const decalages = xref.split('\n').slice(2, 2 + n).map((l) => Number(l.slice(0, 10)));
      v.vrai(`table xref : ${n - 1} objets à leur place`, decalages.slice(1).every((d, i) => f.startsWith(`${i + 1} 0 obj`, d)));
      v.egal('startxref', Number(f.match(/startxref\n(\d+)\n/)?.[1]), debutXref);
      v.egal('pages : /Count égal aux pages', Number(f.match(/\/Count (\d+)/)?.[1]), (f.match(/\/Type \/Page\b/g) ?? []).length);
      v.vrai('polices standard en WinAnsiEncoding', /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/.test(f) && /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/.test(f));
      v.vrai('titre et accents encodés', f.includes('(Fiche \\351lectricien)') && f.includes('(Presta \\311t\\351)'));
    },
  },
  {
    id: 'R338',
    titre: 'Fiche en PDF (14d, § 10) : mise en page A4 portrait (marges de 40 pt) ; tout le texte de la fiche, chaque ligne « libellé : valeur » dans ses deux colonnes ; pied « Fiche … · presta · page n sur N » sur chaque page ; une longue fiche sur plusieurs pages, rien hors des marges, une ligne jamais coupée entre deux pages, un titre de mur jamais seul en bas de page',
    etape: '14d',
    verifier(v, contexte) {
      const textes = textesEssai(contexte);
      const liste = listeEssai();
      const murs = Array.from({ length: 12 }, (_, i) => ({ id: `m-${i}`, nom: `Mur ${i + 1}`, fiche: { textes, calculeeLe: '2026-10-17T10:00:00.000Z' }, materiel: { liste } }));
      const fiche = fichesMetier.ficheMetier('chefProjet', { presta: { nom: 'Presta A', organisation: ORGANISATION_ESSAI }, murs, total: calculs.totalMateriel(murs.map((m) => ({ nom: m.nom, liste }))), date: new Date(2026, 9, 17, 12) });
      const { pages } = pdf.mettreEnPage(fiche);
      const { largeur, hauteur, marge } = pdf.A4;
      v.egal('A4 portrait, marges de 40 pt', [largeur, hauteur, marge], [595.28, 841.89, 40]);
      v.vrai(`plusieurs pages (${pages.length})`, pages.length > 2);
      const tous = pages.flat();
      const dehors = tous.filter((x) => x.x < marge - 0.01 || x.x + pdf.largeurTexte(x.texte, x) > largeur - marge + 0.01 || x.y < marge - 0.01 || x.y > hauteur - marge + 0.01);
      v.egal('rien hors des marges', dehors.map((x) => x.texte), []);
      v.egal('pied de chaque page', pages.map((p) => p.find((x) => x.role === 'pied')?.texte), pages.map((_, i) => `Fiche chef de projet · Presta A · page ${i + 1} sur ${pages.length}`));
      const pageDe = new Map();
      const coupees = [];
      pages.forEach((p, i) => p.forEach((x) => {
        if (!x.rangee) return;
        if (pageDe.has(x.rangee) && pageDe.get(x.rangee) !== i) coupees.push(x.rangee);
        pageDe.set(x.rangee, i);
      }));
      v.egal('aucune ligne coupée entre deux pages', coupees, []);
      v.egal('aucun titre de mur seul en bas de page', pages.map((p) => p.filter((x) => x.role !== 'pied').at(-1)?.role).filter((r) => r === 'mur' || r === 'date'), []);
      const texteDe = (rangee, role) => tous.filter((x) => x.rangee === rangee && x.role === role).map((x) => x.texte).join(' ');
      const manquantes = [];
      fiche.entete.forEach(([libelle, valeur], i) => { if (texteDe(`e${i}`, 'libelle') !== libelle || texteDe(`e${i}`, 'valeur') !== valeur) manquantes.push(libelle); });
      fiche.blocs.forEach((b, i) => b.lignes.forEach((l, j) => {
        const r = `b${i}-${j}`;
        if (l.titre ? texteDe(r, 'sous-titre') !== l.titre : (texteDe(r, 'libelle') !== l.libelle || texteDe(r, 'valeur') !== l.valeur)) manquantes.push(`${b.titre} ${l.libelle ?? l.titre}`);
      }));
      fiche.fin.lignes.forEach((l, j) => {
        const r = `f-${j}`;
        if (l.titre ? texteDe(r, 'sous-titre') !== l.titre : (texteDe(r, 'libelle') !== l.libelle || texteDe(r, 'valeur') !== l.valeur)) manquantes.push(`fin ${l.libelle ?? l.titre}`);
      });
      v.egal('tout le texte de la fiche, chaque ligne dans ses deux colonnes', manquantes, []);
      v.egal('titres des murs', tous.filter((x) => x.role === 'mur').map((x) => x.texte), [...murs.map((m) => m.nom), 'Matériel de la presta']);
      const libelles = tous.filter((x) => x.role === 'libelle');
      const valeurs = tous.filter((x) => x.role === 'valeur' && x.rangee?.startsWith('b') && tous.some((y) => y.rangee === x.rangee && y.role === 'libelle'));
      v.vrai('deux colonnes : libellés à gauche, valeurs à droite (une ligne sans libellé prend toute la largeur)', libelles.every((x) => x.x === marge) && valeurs.every((x) => x.x > marge + 150));
      v.vrai('titre et rappel en tête de la première page', pages[0][0].texte === 'Fiche chef de projet' && pages[0][0].gras && pages[0].some((x) => x.role === 'rappel'));
    },
  },
  {
    id: 'R339',
    titre: 'Mon parc suffit-il ? (15a, § 3) : stock d\'une fiche = somme des quantités de ses lots dans le parc ; un lot sans quantité : stock « au moins » (inconnu) ; aucun lot : stock non saisi',
    etape: '15a',
    verifier(v) {
      v.egal('deux lots', calculs.stockFiche([{ identifiant: 'A', quantite: 100 }, { identifiant: 'B', quantite: 50 }]),
        { saisi: true, quantite: 150, sansQuantite: 0, connu: true });
      v.egal('un lot sans quantité : au moins 100', calculs.stockFiche([{ identifiant: 'A', quantite: 100 }, { identifiant: 'B', quantite: null }]),
        { saisi: true, quantite: 100, sansQuantite: 1, connu: false });
      v.egal('aucun lot', [calculs.stockFiche([]), calculs.stockFiche(undefined)],
        [{ saisi: false, quantite: 0, sansQuantite: 0, connu: false }, { saisi: false, quantite: 0, sansQuantite: 0, connu: false }]);
    },
  },
  {
    id: 'R340',
    titre: 'Mon parc suffit-il ? (15a, § 3) : besoin de chaque fiche = dalles du mur + spares (5 % par défaut, arrondi au-dessus, au moins 1, 0 % réglable) ; demi-dalles sur leur propre fiche ; mur mixte : chaque fiche à part',
    etape: '15a',
    verifier(v) {
      const m = calculs.mur(DALLE_CAS_13, 16, 9);
      v.egal('16 × 9 : 144 + 8', calculs.besoinDalles(m, DALLE_CAS_13),
        [{ ficheId: 'fictive-cas-13', nom: 'Dalle du cas 13', demi: false, auMur: 144, spares: 8, besoin: 152 }]);
      v.egal('0 % : sans spare', calculs.besoinDalles(m, DALLE_CAS_13, 0).map((b) => [b.spares, b.besoin]), [[0, 144]]);
      const demi = calculs.mur(CB5, 8, 3, { demi: CB5_DEMI, rangeeDemi: true });
      v.egal('demi-dalles sur leur fiche', calculs.besoinDalles(demi, CB5).map((b) => [b.ficheId, b.demi, b.auMur, b.spares]),
        [['test-cb5', false, 24, 2], ['test-cb5-demi', true, 8, 1]]);
      const mixte = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 2 }, { nom: 'B', colonnes: 2, rangees: 1, dalle: CB5 }], { ecarts: 'colles' });
      v.egal('mur mixte : chaque fiche à part', calculs.besoinDalles(mixte, DALLE_CAS_13).map((b) => [b.ficheId, b.auMur, b.besoin]),
        [['fictive-cas-13', 8, 9], ['test-cb5', 2, 3]]);
    },
  },
  {
    id: 'R341',
    titre: 'Mon parc suffit-il ? (15a, § 3, point 1 validé) : les autres murs de la presta du même parc prennent leur part du stock (dalles et spares de leur liste gardée) ; un mur jamais ouvert depuis l\'étape 13 compte zéro, avec la note « ouvre ce mur une fois »',
    etape: '15a',
    verifier(v) {
      const liste = (n) => calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, n, 1), dalle: DALLE_CAS_13 });
      const autres = [{ nom: 'Mur 2', liste: liste(76) }, { nom: 'Mur 3', liste: null }, { nom: 'Mur 4', liste: liste(19) }];
      v.egal('pris par les autres murs', calculs.prisAutresMurs(autres, 'fictive-cas-13'),
        { nombre: 100, parMur: [{ nom: 'Mur 2', nombre: 80 }, { nom: 'Mur 4', nombre: 20 }], nonComptes: ['Mur 3'] });
      v.egal('autre fiche : rien de pris', calculs.prisAutresMurs(autres, 'test-cb5').nombre, 0);
      const c = calculs.controleStock({ mur: calculs.mur(DALLE_CAS_13, 10, 8), dalle: DALLE_CAS_13, parc: { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }] } },
        autres: autres.slice(0, 2) });
      const f = c.fiches[0];
      v.egal('disponible : 150 − 80', [f.pris.nombre, f.disponible, f.etat], [80, 70, 'manque']);
      v.egal('lignes', f.lignes, [
        'Stock Dalle du cas 13 : 150 dans le parc Parc A, dont 80 pris par Mur 2',
        'À sortir : 84, 80 au mur + 4 de spare',
        'Il en manque 14 × Dalle du cas 13 : 70 disponibles pour 84, 80 au mur + 4 de spare.',
      ]);
      v.egal('note du mur jamais ouvert', c.notes, ['Mur 3 : ouvre ce mur une fois pour compter son matériel.']);
      const deux = calculs.controleStock({ mur: calculs.mur(DALLE_CAS_13, 1, 1), dalle: DALLE_CAS_13, parc: { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }] } }, autres });
      v.egal('plusieurs murs', deux.fiches[0].lignes[0], 'Stock Dalle du cas 13 : 150 dans le parc Parc A, dont 100 pris par les autres murs (Mur 2 : 80 ; Mur 4 : 20)');
    },
  },
  {
    id: 'R342',
    titre: 'Mon parc suffit-il ? (15a, § 3) : résultat par fiche, suffit, spares incomplets (« 6 sur 8 »), manque (« il en manque 12 »), inconnu (lot sans quantité, sans alerte devinée ; au moins X qui couvre déjà le besoin : suffit), non saisi ; pas de parc : rien ; l\'alerte « Lots trop petits » de R140 inchangée',
    etape: '15a',
    verifier(v) {
      const parc = (lots) => ({ nom: 'Parc A', lots: { 'fictive-cas-13': lots } });
      const essai = (c, l, lots, sparesPourcent) => calculs.controleStock({ mur: calculs.mur(DALLE_CAS_13, c, l), dalle: DALLE_CAS_13, parc: parc(lots), sparesPourcent }).fiches[0];
      const suffit = essai(16, 9, [{ identifiant: 'L1', quantite: 160 }]);
      v.egal('suffit', [suffit.etat, suffit.alerte, suffit.lignes], ['suffit', null, [
        'Stock Dalle du cas 13 : 160 dans le parc Parc A', 'À sortir : 152, 144 au mur + 8 de spare', 'Stock suffisant : 160 en stock pour 152.']]);
      const sp = essai(16, 9, [{ identifiant: 'L1', quantite: 150 }]);
      v.egal('spares incomplets', [sp.etat, sp.manque, sp.alerte], ['spares-incomplets', 2,
        'Spares incomplets, Dalle du cas 13 : 6 sur 8 (150 en stock pour 144 au mur + 8 de spare).']);
      const manque = essai(11, 14, [{ identifiant: 'L1', quantite: 150 }]);
      v.egal('il en manque 12', [manque.etat, manque.manque, manque.alerte], ['manque', 12,
        'Il en manque 12 × Dalle du cas 13 : 150 en stock pour 162, 154 au mur + 8 de spare.']);
      const inconnu = essai(16, 9, [{ identifiant: 'L1', quantite: 100 }, { identifiant: 'L2', quantite: null }]);
      v.egal('inconnu, sans alerte', [inconnu.etat, inconnu.alerte, inconnu.lignes], ['inconnu', null, [
        'Stock Dalle du cas 13 : au moins 100 dans le parc Parc A, un lot sans quantité, à préciser dans le parc',
        'À sortir : 152, 144 au mur + 8 de spare', 'Stock à préciser : au moins 100 connus pour 152.']]);
      const deuxSans = essai(16, 9, [{ identifiant: 'L1', quantite: 100 }, { identifiant: 'L2', quantite: null }, { identifiant: 'L3', quantite: null }]);
      v.vrai('deux lots sans quantité', deuxSans.lignes[0].endsWith(', 2 lots sans quantité, à préciser dans le parc'), deuxSans.lignes[0]);
      const auMoins = essai(16, 9, [{ identifiant: 'L1', quantite: 200 }, { identifiant: 'L2', quantite: null }]);
      v.egal('au moins 200 pour 152 : suffit', [auMoins.etat, auMoins.lignes[2]], ['suffit', 'Stock suffisant : au moins 200 en stock pour 152.']);
      const non = essai(16, 9, []);
      v.egal('non saisi', [non.etat, non.alerte, non.lignes], ['non-saisi', null, ['Stock Dalle du cas 13 non saisi dans le parc Parc A']]);
      const sansSpare = essai(16, 9, [{ identifiant: 'L1', quantite: 144 }], 0);
      v.egal('0 % de spare : 144 suffisent', [sansSpare.etat, sansSpare.lignes[1]], ['suffit', 'À sortir : 144 au mur, sans spare']);
      v.egal('pas de parc : rien', calculs.controleStock({ mur: calculs.mur(DALLE_CAS_13, 16, 9), dalle: DALLE_CAS_13, parc: null }), null);
      const tout = calculs.controleStock({ mur: calculs.mur(DALLE_CAS_13, 11, 14), dalle: DALLE_CAS_13, parc: parc([{ identifiant: 'L1', quantite: 150 }]) });
      v.egal('en tête : manque et alertes', [tout.manque, tout.alertes, tout.parcNom], [true, [manque.alerte], 'Parc A']);
      const lots = [{ id: 'l1', identifiant: 'L1', quantite: 150 }];
      v.egal('« Lots trop petits » inchangé', fiches.lotsDuMur(lots, 162).alertes, ['Lots trop petits : 150 dalles dans les lots pour 162 dans le mur.']);
    },
  },
  {
    id: 'R343',
    titre: 'Mon parc suffit-il ? (15a, § 4 et 11) : plus grand mur avec le stock, à la forme du mur (proportions de la cible en Taille ou Résolution, du mur saisi en Dalles, 16:9 sans saisie) : le plus de dalles parmi les murs à moins d\'une dalle de la proportion ; variantes à ±1 colonne ou ligne qui tiennent ; demi-dalles contre leur stock ; seulement quand le stock connu manque ; mur en zones refusé',
    etape: '15a',
    verifier(v) {
      const parc = (q, qDemi = null) => ({ nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: q }], 'test-cb5': [{ identifiant: 'L1', quantite: q }],
        ...(qDemi === null ? {} : { 'test-cb5-demi': [{ identifiant: 'D1', quantite: qDemi }] }) } });
      const grand = (m, dalle, demande, p, options = {}) => calculs.plusGrandMur({ mur: m, dalle, demande, controle: calculs.controleStock({ mur: m, dalle, parc: p }), ...options });
      const dalles16x9 = calculs.mur(DALLE_CAS_13, 16, 9);
      const r = grand(dalles16x9, DALLE_CAS_13, { mode: 'dalles', colonnes: 16, lignes: 9 }, parc(150));
      v.egal('Dalles 16 × 9, 150 en stock : 15 × 9', [r.proportion.origine, r.mur.mur.colonnes, r.mur.mur.lignes, r.mur.spares, r.mur.besoin, r.mur.ecart],
        ['saisie', 15, 9, 7, 142, { colonnes: -1, lignes: 0, dalles: -9 }]);
      v.egal('texte', r.mur.texte, '15 × 9 dalles, 7,5 × 4,5 m, 2880 × 1728 px : 135 + 7 de spare (−1 colonne)');
      v.egal('variantes qui tiennent', r.variantes.map((x) => [x.libelle, x.mur.colonnes, x.mur.lignes, x.besoin]), [['−1 colonne', 14, 9, 133], ['−1 ligne', 15, 8, 126]]);
      v.egal('stock suffisant : pas de plus grand mur', grand(dalles16x9, DALLE_CAS_13, { mode: 'dalles', colonnes: 16, lignes: 9 }, parc(152)), null);
      v.egal('stock inconnu : pas de plus grand mur', grand(dalles16x9, DALLE_CAS_13, { mode: 'dalles', colonnes: 16, lignes: 9 },
        { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 100 }, { identifiant: 'L2', quantite: null }] } }), null);
      const taille = calculs.dimensionner(DALLE_CAS_13, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 }).mur;
      const t = grand(taille, DALLE_CAS_13, { mode: 'taille', largeurMm: 6000, hauteurMm: 3000 }, parc(50));
      v.egal('Taille 6 × 3 m, 50 en stock : 9 × 5 (2:1 de la cible)', [t.proportion.origine, t.mur.mur.colonnes, t.mur.mur.lignes, t.mur.besoin, t.mur.ecart],
        ['cible', 9, 5, 48, { colonnes: -3, lignes: -1, dalles: -27 }]);
      const res = calculs.dimensionner(DALLE_CAS_13, { mode: 'resolution', largeurPx: 3840, hauteurPx: 2160 }).mur;
      const rr = grand(res, DALLE_CAS_13, { mode: 'resolution', largeurPx: 3840, hauteurPx: 2160 }, parc(150));
      v.egal('Résolution 3840 × 2160, 150 en stock : 15 × 9', [rr.proportion.origine, rr.proportion.unite, rr.mur.mur.colonnes, rr.mur.mur.lignes], ['cible', 'px', 15, 9]);
      const d = grand(dalles16x9, DALLE_CAS_13, null, parc(150));
      v.egal('sans saisie : 16:9', [d.proportion.origine, d.proportion.largeur / d.proportion.hauteur, d.mur.mur.colonnes, d.mur.mur.lignes], ['défaut', 16 / 9, 15, 9]);
      const m = calculs.mur(CB5, 8, 3, { demi: CB5_DEMI, rangeeDemi: true, positionDemi: 'bas' });
      const dm = grand(m, CB5, { mode: 'dalles', colonnes: 8, lignes: 3, rangeeDemi: true }, parc(20, 6), { demi: CB5_DEMI, positionDemi: 'bas' });
      v.egal('demi-dalles contre leur stock : 5 × 2 + 5 demi', [dm.mur.mur.colonnes, dm.mur.mur.lignes, dm.mur.mur.dalles, dm.mur.mur.positionDemi, dm.mur.spares, dm.mur.sparesDemi],
        [5, 2, { entieres: 10, demi: 5, total: 15 }, 'bas', 1, 1]);
      v.egal('variantes avec demi-dalles', dm.variantes.map((x) => x.libelle), ['−1 colonne', '−1 ligne', '+1 ligne']);
      const demiInconnue = grand(m, CB5, { mode: 'dalles', colonnes: 8, lignes: 3, rangeeDemi: true }, parc(20), { demi: CB5_DEMI, positionDemi: 'bas' });
      v.vrai('stock de demi-dalles non saisi : ne limite pas', demiInconnue.mur.mur.colonnes > 5, JSON.stringify(demiInconnue.mur.mur.dalles));
      const zones = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 10, rangees: 6 }, { nom: 'B', colonnes: 10, rangees: 6 }], { ecarts: 'colles' });
      v.egal('mur en zones : refusé', grand(zones, DALLE_CAS_13, { mode: 'zones' }, parc(50)), { refus: 'Mur en zones : réduis une zone à la main.' });
      v.egal('stock trop petit pour une dalle et son spare', grand(dalles16x9, DALLE_CAS_13, { mode: 'dalles', colonnes: 16, lignes: 9 }, parc(1)),
        { refus: 'Stock trop petit pour une seule dalle et son spare.' });
    },
  },
  {
    id: 'R344',
    titre: 'Mon parc suffit-il ? (15a, § 5) : total de la presta, chaque fiche contre le stock de son parc (« 152 × … : stock 150 dans le parc A, il en manque 2 ») ; murs de parcs différents à part ; mur sans parc : « pas de parc, stock non contrôlé » ; liste des manques pour le bandeau',
    etape: '15a',
    verifier(v) {
      const liste = (n, dalle = DALLE_CAS_13) => calculs.listeMateriel({ mur: calculs.mur(dalle, n, 8), dalle });
      const parcs = [
        { id: 'parc-a', nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }], 'test-cb5': [{ identifiant: 'C1', quantite: 10 }, { identifiant: 'C2', quantite: null }] } },
        { id: 'parc-b', nom: 'Parc B', lots: {} },
      ];
      const murs = [
        { nom: 'Mur 1', parc: 'parc-a', liste: liste(9) },
        { nom: 'Mur 2', parc: 'parc-a', liste: liste(9) },
        { nom: 'Mur 3', parc: 'parc-a', liste: liste(2, CB5) },
        { nom: 'Mur 4', parc: 'parc-b', liste: liste(5) },
        { nom: 'Mur 5', parc: null, liste: liste(1) },
        { nom: 'Mur 6', parc: 'parc-a', liste: null },
      ];
      const s = calculs.stockPresta(murs, parcs);
      v.egal('une ligne par parc et par fiche', s.lignes.map((l) => l.texte), [
        '152 × Dalle du cas 13 : stock 150 dans le parc Parc A, il en manque 2',
        '17 × CB5 MKII (copie de test) : stock au moins 10 dans le parc Parc A, un lot sans quantité, à préciser',
        '42 × Dalle du cas 13 : stock non saisi dans le parc Parc B',
        '9 × Dalle du cas 13 : pas de parc, stock non contrôlé',
      ]);
      v.egal('manques pour le bandeau', s.manques, ['Il en manque 2 × Dalle du cas 13 dans le parc Parc A (stock 150 pour 152).']);
      const assez = calculs.stockPresta(murs.slice(0, 1), parcs);
      v.egal('suffit', [assez.lignes[0].texte, assez.lignes[0].etat, assez.manques], ['76 × Dalle du cas 13 : stock 150 dans le parc Parc A, suffit', 'suffit', []]);
    },
  },
  {
    id: 'R345',
    titre: 'Mon parc suffit-il ? (15b, § 7) : texte copié du Mur, lignes de stock de chaque fiche, « Manque de stock : … » (spares incomplets en « Alerte »), murs jamais ouverts en note, plus grand mur et ses variantes ; mur en zones : la raison ; sans parc : texte inchangé',
    etape: '15b',
    verifier(v) {
      const parc = { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }] } };
      const m = calculs.mur(DALLE_CAS_13, 16, 9);
      const controle = calculs.controleStock({ mur: m, dalle: DALLE_CAS_13, parc });
      const grand = calculs.plusGrandMur({ mur: m, dalle: DALLE_CAS_13, demande: { mode: 'dalles', colonnes: 16, lignes: 9 }, controle });
      const sans = resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m }).split('\n');
      v.egal('sans stock : inchangé', resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m, stock: null }).split('\n'), sans);
      const t = resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m, stock: { controle, grand } }).split('\n');
      v.egal('début inchangé', t.slice(0, sans.length), sans);
      v.egal('lignes de stock à la fin', t.slice(sans.length), [
        'Stock Dalle du cas 13 : 150 dans le parc Parc A',
        'À sortir : 152, 144 au mur + 8 de spare',
        'Alerte : Spares incomplets, Dalle du cas 13 : 6 sur 8 (150 en stock pour 144 au mur + 8 de spare).',
        'Plus grand mur avec ton stock : 15 × 9 dalles, 7,5 × 4,5 m, 2880 × 1728 px : 135 + 7 de spare (−1 colonne)',
        'Variante −1 colonne : 14 × 9 dalles, 7 × 4,5 m, 2688 × 1728 px : 126 + 7 de spare (−2 colonnes)',
        'Variante −1 ligne : 15 × 8 dalles, 7,5 × 4 m, 2880 × 1536 px : 120 + 6 de spare (−1 colonne, −1 ligne)',
      ]);
      const m2 = calculs.mur(DALLE_CAS_13, 11, 14);
      const c2 = calculs.controleStock({ mur: m2, dalle: DALLE_CAS_13, parc, autres: [{ nom: 'Mur 3', liste: null }] });
      const t2 = resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m2, stock: { controle: c2, grand: null } }).split('\n');
      v.vrai('manque : « Manque de stock »', t2.includes('Manque de stock : Il en manque 12 × Dalle du cas 13 : 150 en stock pour 162, 154 au mur + 8 de spare.'), t2.slice(-4).join(' / '));
      v.vrai('mur jamais ouvert en note', t2.includes('Note : Mur 3 : ouvre ce mur une fois pour compter son matériel.'), t2.slice(-4).join(' / '));
      const zones = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 10, rangees: 8 }, { nom: 'B', colonnes: 10, rangees: 8 }], { ecarts: 'colles' });
      const cz = calculs.controleStock({ mur: zones, dalle: DALLE_CAS_13, parc });
      const tz = resumes.resumeMur({ dalle: DALLE_CAS_13, mur: zones, stock: { controle: cz, grand: calculs.plusGrandMur({ mur: zones, dalle: DALLE_CAS_13, demande: { mode: 'zones' }, controle: cz }) } }).split('\n');
      v.egal('mur en zones : stock et raison', tz.slice(-3), [
        'À sortir : 168, 160 au mur + 8 de spare',
        'Manque de stock : Il en manque 18 × Dalle du cas 13 : 150 en stock pour 168, 160 au mur + 8 de spare.',
        'Plus grand mur avec ton stock : Mur en zones : réduis une zone à la main.',
      ]);
    },
  },
  {
    id: 'R346',
    titre: 'Mon parc suffit-il ? (15b, § 5) : texte copié et partagé du total de la presta, manques de stock en tête (« Manque de stock : … »), section « STOCK DES PARCS » après les dalles ; sans stock : texte inchangé',
    etape: '15b',
    verifier(v) {
      const liste = (n) => calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, n, 8), dalle: DALLE_CAS_13 });
      const murs = [{ nom: 'Mur 1', parc: 'parc-a', liste: liste(9) }, { nom: 'Mur 2', parc: 'parc-a', liste: liste(9) }];
      const parcs = [{ id: 'parc-a', nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }] } }];
      const total = calculs.totalMateriel(murs);
      const sans = resumes.resumeMateriel({ titre: 'Presta A, total de 2 murs', total, sparesPourcent: 5 }).split('\n');
      v.egal('sans stock : inchangé', resumes.resumeMateriel({ titre: 'Presta A, total de 2 murs', total, sparesPourcent: 5, stock: null }).split('\n'), sans);
      const t = resumes.resumeMateriel({ titre: 'Presta A, total de 2 murs', total, sparesPourcent: 5, stock: calculs.stockPresta(murs, parcs) }).split('\n');
      const i = t.indexOf('Manque de stock : Il en manque 2 × Dalle du cas 13 dans le parc Parc A (stock 150 pour 152).');
      v.vrai('manque en tête, avant les dalles', i > 0 && i < t.indexOf('DALLES'), t.slice(0, 8).join(' / '));
      const s = t.indexOf('STOCK DES PARCS');
      v.vrai('section après les dalles, avant Data', s > t.indexOf('DALLES') && s < t.indexOf('DATA'), t.join(' / '));
      v.egal('ligne du stock', t[s + 1], '152 × Dalle du cas 13 : stock 150 dans le parc Parc A, il en manque 2');
    },
  },
  {
    id: 'R347',
    titre: 'Mon parc suffit-il ? (15b, point 3 validé) : fiche du chef de projet, « Manque de stock » de chaque mur dans ses alertes graves (spares incomplets : non) ; total de la presta : « Alertes graves de la presta » en tête, puis « Stock des parcs » après les dalles',
    etape: '15b',
    verifier(v, contexte) {
      const textes = textesEssai(contexte);
      const parc = { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 150 }] } };
      const texteMur = (m) => resumes.resumeMur({ dalle: DALLE_CAS_13, mur: m, stock: { controle: calculs.controleStock({ mur: m, dalle: DALLE_CAS_13, parc }), grand: null } });
      const m1 = calculs.mur(DALLE_CAS_13, 11, 14);
      const m2 = calculs.mur(DALLE_CAS_13, 16, 9);
      const l1 = calculs.listeMateriel({ mur: m1, dalle: DALLE_CAS_13 });
      const l2 = calculs.listeMateriel({ mur: m2, dalle: DALLE_CAS_13 });
      const calculeeLe = '2026-10-17T10:00:00.000Z';
      const murs = [
        { id: 'm-1', nom: 'Mur 1', fiche: { textes: { ...textes, mur: texteMur(m1) }, calculeeLe }, materiel: { liste: l1 } },
        { id: 'm-2', nom: 'Mur 2', fiche: { textes: { ...textes, mur: texteMur(m2) }, calculeeLe }, materiel: { liste: l2 } },
      ];
      const total = calculs.totalMateriel(murs.map((m) => ({ nom: m.nom, liste: m.materiel.liste })));
      const stock = calculs.stockPresta(murs.map((m) => ({ nom: m.nom, parc: 'parc-a', liste: m.materiel.liste })), [{ id: 'parc-a', ...parc }]);
      const fiche = fichesMetier.ficheMetier('chefProjet', { presta: { nom: 'Presta A' }, murs, total, stock, date: new Date(2026, 9, 17, 12) });
      const graves = (b) => b.lignes.slice(b.lignes.findIndex((l) => l.titre === 'Alertes graves') + 1);
      v.vrai('mur 1 : manque en alerte grave', graves(fiche.blocs[0]).some((l) => l.libelle === 'Manque de stock'
        && l.valeur === 'Il en manque 12 × Dalle du cas 13 : 150 en stock pour 162, 154 au mur + 8 de spare.'), JSON.stringify(graves(fiche.blocs[0])));
      v.vrai('mur 2 : spares incomplets hors des alertes graves', !fiche.blocs[1].lignes.some((l) => /Spares incomplets/.test(l.valeur ?? '')), JSON.stringify(fiche.blocs[1].lignes.slice(-3)));
      v.egal('total : alertes graves de la presta en tête', fiche.fin.lignes.slice(0, 2), [
        { titre: 'Alertes graves de la presta' },
        { libelle: 'Manque de stock', valeur: 'Il en manque 164 × Dalle du cas 13 dans le parc Parc A (stock 150 pour 314).' },
      ]);
      const s = fiche.fin.lignes.findIndex((l) => l.titre === 'Stock des parcs');
      v.vrai('« Stock des parcs » après les dalles', s > fiche.fin.lignes.findIndex((l) => l.titre === 'Dalles'), JSON.stringify(fiche.fin.lignes.map((l) => l.titre).filter(Boolean)));
      v.egal('ligne du stock', fiche.fin.lignes[s + 1], { libelle: '314 × Dalle du cas 13', valeur: 'stock 150 dans le parc Parc A, il en manque 164' });
      const sansStock = fichesMetier.ficheMetier('chefProjet', { presta: { nom: 'Presta A' }, murs, total, date: new Date(2026, 9, 17, 12) });
      v.vrai('sans stock : ni alertes de la presta ni stock', !sansStock.fin.lignes.some((l) => l.titre === 'Alertes graves de la presta' || l.titre === 'Stock des parcs'));
    },
  },
  {
    id: 'R348',
    titre: 'Mon parc suffit-il ? (15b) : une dalle tournée (identifiant « …-tournee ») garde les lots et le stock de sa fiche, dans le Mur, dans la part des autres murs et dans le total de la presta',
    etape: '15b',
    verifier(v) {
      const tournee = calculs.dalleTournee({ ...DALLE_CAS_13, rotationPossible: true });
      const parc = { nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 160 }] } };
      const c = calculs.controleStock({ mur: calculs.mur(tournee, 16, 9), dalle: tournee, parc });
      v.egal('stock de la fiche', [tournee.id, c.fiches[0].stock.quantite, c.fiches[0].etat], ['fictive-cas-13-tournee', 160, 'suffit']);
      const droite = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, 76, 1), dalle: DALLE_CAS_13 });
      const tourneeListe = calculs.listeMateriel({ mur: calculs.mur(tournee, 76, 1), dalle: tournee });
      v.egal('part d\'un autre mur, droite ou tournée', [calculs.prisAutresMurs([{ nom: 'Mur 2', liste: droite }], tournee.id).nombre,
        calculs.prisAutresMurs([{ nom: 'Mur 2', liste: tourneeListe }], DALLE_CAS_13.id).nombre], [80, 80]);
      const s = calculs.stockPresta([{ nom: 'Mur 1', parc: 'parc-a', liste: droite }, { nom: 'Mur 2', parc: 'parc-a', liste: tourneeListe }], [{ id: 'parc-a', ...parc }]);
      v.egal('total : une seule ligne pour la fiche', s.lignes.map((l) => [l.ficheId, l.quantite, l.etat]), [['fictive-cas-13', 160, 'suffit']]);
    },
  },
  {
    id: 'R349',
    titre: 'Mon parc suffit-il ? (15c, § 6) : « Nombre dans le parc » de chaque processeur (`parc.quantites`), entier de 1 à 99, facultatif (vide : retiré, pas de contrôle), refus avec la raison ; valeur illisible gardée dans un fichier ignorée ; retiré avec une fiche retirée',
    etape: '15c',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc A');
      base = fiches.reglerQuantiteParc(base, 'parc-a', 'brompton-s8', '2');
      base = fiches.reglerQuantiteParc(base, 'parc-a', 'novastar-mctrl660', 99);
      v.egal('gardées', [base.parcs[0].quantites, fiches.quantitesParc(base, 'parc-a')],
        [{ 'brompton-s8': 2, 'novastar-mctrl660': 99 }, { 'brompton-s8': 2, 'novastar-mctrl660': 99 }]);
      const vide = fiches.reglerQuantiteParc(fiches.reglerQuantiteParc(base, 'parc-a', 'brompton-s8', ' '), 'parc-a', 'novastar-mctrl660', '');
      v.egal('vide : retiré, plus rien d\'écrit', 'quantites' in vide.parcs[0], false);
      const refus = ['0', '100', '2,5', 'deux', -1].map((x) => messageErreur(() => fiches.reglerQuantiteParc(base, 'parc-a', 'brompton-s8', x)));
      v.egal('refus avec la raison', refus, Array(5).fill('Nombre dans le parc : un nombre entier de 1 à 99, ou vide.'));
      v.egal('« Tous » : aucune', fiches.quantitesParc(base, null), {});
      const lu = { ...base, parcs: [{ ...base.parcs[0], quantites: { 'brompton-s8': 2, x: 0, y: 'trois', z: 150 } }] };
      v.egal('valeur illisible d\'un fichier : ignorée', fiches.quantitesParc(lu, 'parc-a'), { 'brompton-s8': 2 });
      const retire = fiches.retirerFicheRetiree(base, 'parc-a', 'processeur', 'brompton-s8');
      v.egal('fiche retirée : son nombre aussi', retire.parcs[0].quantites, { 'novastar-mctrl660': 99 });
    },
  },
  {
    id: 'R350',
    titre: 'Mon parc suffit-il ? (15c, point 4 validé) : processeur conseillé, ceux dont le parc a assez en tête (sans nombre saisi : assez), puis le moins de processeurs, puis la plus petite capacité ; aucun n\'a assez : le conseil d\'avant ; sans nombres : inchangé',
    etape: '15c',
    verifier(v) {
      const ev = (id, nombre, pixelsMax) => ({ nombre, processeur: { id, modele: id.toUpperCase(), pixelsMax } });
      const evaluations = [ev('a', 2, 9e6), ev('b', 3, 2e6), ev('c', 3, 4e6), ev('d', null, 1e6)];
      v.egal('sans nombres : le moins de processeurs', [calculs.processeurConseille(evaluations).processeur.id, calculs.processeurConseille(evaluations, { quantites: {} }).processeur.id], ['a', 'a']);
      v.egal('a : 1 dans le parc pour 2 ; b sans nombre : b en tête', calculs.processeurConseille(evaluations, { quantites: { a: 1 } }).processeur.id, 'b');
      v.egal('b : 2 pour 3 ; c : 3 pour 3 (juste assez)', calculs.processeurConseille(evaluations, { quantites: { a: 1, b: 2, c: 3 } }).processeur.id, 'c');
      v.egal('aucun n\'a assez : le conseil d\'avant', calculs.processeurConseille(evaluations, { quantites: { a: 1, b: 2, c: 2 } }).processeur.id, 'a');
    },
  },
  {
    id: 'R351',
    titre: 'Mon parc suffit-il ? (15c, § 6) : nombre de processeurs du parc face au processeur retenu (conseillé ou choisi à la main) : « Dans le parc Parc A : 2 × MCTRL660 », alerte « Il en faut 2 × MCTRL660, le parc Parc A en a 1. » ; sans nombre : rien ; texte copié de Data : « Nombre dans le parc », « Manque de stock : … » (alerte grave de la fiche du chef de projet)',
    etape: '15c',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const r = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      v.egal('2 MCTRL660 pour ce mur', r.nombre, 2);
      v.egal('assez', calculs.controleQuantiteProcesseur(r, 2, 'Parc A'), { quantite: 2, parcNom: 'Parc A', assez: true, ligne: 'Dans le parc Parc A : 2 × MCTRL660', alerte: null });
      const court = calculs.controleQuantiteProcesseur(r, 1, 'Parc A');
      v.egal('pas assez', court, { quantite: 1, parcNom: 'Parc A', assez: false, ligne: 'Dans le parc Parc A : 1 × MCTRL660', alerte: 'Il en faut 2 × MCTRL660, le parc Parc A en a 1.' });
      v.egal('sans nombre, ou impossible : rien', [calculs.controleQuantiteProcesseur(r, undefined, 'Parc A'), calculs.controleQuantiteProcesseur({ ...r, nombre: null }, 1, 'Parc A')], [null, null]);
      const t = resumes.resumeData(r, { quantiteParc: court }).split('\n');
      v.vrai('texte copié : nombre et manque', t.includes('Nombre dans le parc Parc A : 1') && t.includes('Manque de stock : Il en faut 2 × MCTRL660, le parc Parc A en a 1.'), t.join(' / '));
      const ok = resumes.resumeData(r, { quantiteParc: calculs.controleQuantiteProcesseur(r, 2, 'Parc A') }).split('\n');
      v.vrai('assez : pas de manque', ok.includes('Nombre dans le parc Parc A : 2') && !ok.some((l) => l.startsWith('Manque de stock')), ok.join(' / '));
      v.egal('sans nombre : texte inchangé', resumes.resumeData(r, { quantiteParc: null }), resumes.resumeData(r, {}));
    },
  },
  {
    id: 'R352',
    titre: 'Mon parc suffit-il ? (15c, § 5 et 6) : total de la presta, processeurs face au nombre saisi dans leur parc (« 3 × Brompton S8 : stock 2 dans le parc Parc A, il en manque 1 »), après les dalles ; sans nombre saisi ou sans parc : aucune ligne ; manques dans la liste du bandeau',
    etape: '15c',
    verifier(v) {
      const liste = (n, nb) => {
        const l = calculs.listeMateriel({ mur: calculs.mur(DALLE_CAS_13, n, 8), dalle: DALLE_CAS_13 });
        const proc = { cle: 'processeur|brompton-s8', quantite: nb, designation: 'Brompton S8', longueurM: null, aMesurer: false, detail: 'retenu dans Data' };
        const mctrl = { cle: 'processeur|novastar-mctrl660', quantite: 1, designation: 'Novastar MCTRL660', longueurM: null, aMesurer: false, detail: 'retenu dans Data' };
        return { ...l, sections: l.sections.map((s) => (s.id === 'data' ? { ...s, lignes: [proc, mctrl] } : s)) };
      };
      const parcs = [{ id: 'parc-a', nom: 'Parc A', lots: { 'fictive-cas-13': [{ identifiant: 'L1', quantite: 200 }] }, quantites: { 'brompton-s8': 2 } }];
      const s = calculs.stockPresta([{ nom: 'Mur 1', parc: 'parc-a', liste: liste(9, 2) }, { nom: 'Mur 2', parc: 'parc-a', liste: liste(9, 1) }, { nom: 'Mur 3', parc: null, liste: liste(1, 1) }], parcs);
      v.egal('lignes', s.lignes.map((l) => l.texte), [
        '152 × Dalle du cas 13 : stock 200 dans le parc Parc A, suffit',
        '3 × Brompton S8 : stock 2 dans le parc Parc A, il en manque 1',
        '9 × Dalle du cas 13 : pas de parc, stock non contrôlé',
      ]);
      v.egal('clé et genre', [s.lignes[1].cle, s.lignes[1].genre], ['processeur|brompton-s8', 'processeur']);
      v.egal('manque', s.manques, ['Il en manque 1 × Brompton S8 dans le parc Parc A (stock 2 pour 3).']);
    },
  },
  {
    id: 'R353',
    titre: 'NovaLCT pas à pas (17a, spec § 3.2) : logiciel vidéo de chaque processeur NovaLCT de la base (cartes d\'envoi, V-Can, VX Pro, autres), avec sa source ; VX600 et VX400 par analogie avec le VX1000, à vérifier ; processeur d\'un autre logiciel : aucun',
    etape: '17a',
    verifier(v, contexte) {
      const procs = baseProcesseurs(contexte).processeurs.filter((p) => p.logiciel === 'NovaLCT');
      const groupes = {};
      for (const p of procs) {
        const g = novalct.groupeVideo(calculs.resoudreFiche(p, baseProcesseurs(contexte).sources));
        (groupes[g?.id ?? 'aucun'] ??= []).push(p.id.replace('novastar-', ''));
      }
      v.egal('groupes', groupes, {
        'carte-envoi': ['mctrl300', 'mctrl660', 'mctrl660-pro', 'mctrl-r5', 'mctrl4k', 'mctrl500', 'mctrl600', 'mctrl700', 'mctrl700-pro', 'msd300', 'msd600'],
        autre: ['vx2u', 'novapro-hd', 'vx4s', 'vx4u', 'vx4s-n', 'vx400s', 'vx2', 'vx2s', 'novapro-uhd', 'h2', 'h5', 'h9', 'h15', 'h20'],
        'v-can': ['vx6s', 'novapro-uhd-jr', 'vx1000', 'vx600', 'vx400', 'vx16s'],
        'vx-pro': ['vx400-pro', 'vx600-pro', 'vx1000-pro', 'vx2000-pro'],
      });
      const g = (id) => novalct.groupeVideo(processeurDeBase(contexte, `novastar-${id}`));
      v.egal('VX1000 : V-Can, manuel V-Can V3.8.0 § 3.1.1.1', [g('vx1000').logiciels, g('vx1000').sources.map((s) => s.id), g('vx1000').aVerifier], [['V-Can', 'façade'], ['vcan-3-8-0', 'vx1000-1-5-0'], false]);
      v.egal('VX600, VX400 : par analogie, à vérifier', [g('vx600').aVerifier, g('vx400').aVerifier, /analogie avec le VX1000/.test(g('vx600').note)], [true, true, true]);
      v.egal('MCTRL660 : rien avant NovaLCT', [g('mctrl660').logiciels, g('mctrl660').aVerifier], [[], false]);
      v.egal('VX1000 Pro : VICP ou Unico, à vérifier', [g('vx1000-pro').logiciels, g('vx1000-pro').aVerifier], [['VICP', 'Unico'], true]);
      v.egal('VX4S : à vérifier, sans source', [g('vx4s').aVerifier, g('vx4s').sources], [true, []]);
      v.egal('autres logiciels : aucun', [novalct.groupeVideo(processeurDeBase(contexte, 'brompton-s8')), novalct.groupeVideo(processeurDeBase(contexte, 'coex-mx40-pro'))], [null, null]);
    },
  },
  {
    id: 'R354',
    titre: 'NovaLCT pas à pas (17a, spec § 3.3 et choix 4) : version de référence d\'après la version relevée dans le parc (avant 5.8 : noms V5.5.0 d\'abord ; 5.8 et après : V5.8.1 d\'abord ; inconnue : V5.8.1, « à relever » ; autre que 5.5.0 et 5.8.1 : à vérifier) ; les deux noms quand ils diffèrent',
    etape: '17a',
    verifier(v) {
      const r = (x) => novalct.versionReference(x);
      v.egal('5.8.1 et V5.5.0', [r('5.8.1'), r('V5.5.0')], [{ premiere: '5.8.1', note: null }, { premiere: '5.5.0', note: null }]);
      v.egal('inconnue', [r(null), r('')], Array(2).fill({ premiere: '5.8.1', note: 'Version de NovaLCT du PC de régie à relever (onglet Base) : noms de la V5.8.1 en premier.' }));
      v.egal('5.6.2 : V5.5.0 d\'abord, à vérifier', r('5.6.2'), { premiere: '5.5.0', note: 'Noms relevés dans les manuels V5.5.0 et V5.8.1 ; ta version 5.6.2 : à vérifier.' });
      v.egal('5.9.2.1 : V5.8.1 d\'abord, à vérifier', r('V5.9.2.1'), { premiere: '5.8.1', note: 'Noms relevés dans les manuels V5.5.0 et V5.8.1 ; ta version 5.9.2.1 : à vérifier.' });
      v.egal('illisible', r('récente'), { premiere: '5.8.1', note: 'Version de NovaLCT illisible (« récente ») : noms de la V5.8.1 en premier.' });
      v.egal('noms', [novalct.nomMenu('charger', '5.5.0'), novalct.nomMenu('charger', '5.8.1'), novalct.nomMenu('envoyerCartes', '5.8.1'), novalct.nomMenu('enregistrerRcfgx', '5.5.0')], [
        'Load from File (V5.5.0) ou Import (V5.8.1)', 'Import (V5.8.1) ou Load from File (V5.5.0)',
        'Send (V5.8.1) ou Send to Receiving Card (V5.5.0)', 'Save to File (V5.5.0) ou Export (V5.8.1)']);
    },
  },
  {
    id: 'R355',
    titre: 'NovaLCT pas à pas (17a, spec § 4) : mur de 12 × 6 dalles du cas 13 sur MCTRL660 : un parcours par processeur, sans partie V-Can ; entrée à la source conseillée, grille de cartes, cartes de la taille de la dalle (128 × 128 par défaut), un pas par port (cartes, départ, sens, charge), Coordinate, enregistrement, contrôles',
    etape: '17a',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte);
      v.egal('processeur et groupe', [p.logiciel, p.processeur, p.groupe.id, p.nonCouvert], ['NovaLCT', 'MCTRL660', 'carte-envoi', []]);
      v.egal('parties', p.parties.map((x) => [x.id, x.titre]), [['0', 'Avant de partir et sur place'], ['P1', 'NovaLCT, MCTRL660 n° 1'], ['P2', 'NovaLCT, MCTRL660 n° 2'], ['C', 'Contrôles']]);
      const ids = (id) => p.parties.find((x) => x.id === id).etapes.map((e) => e.id);
      v.egal('étapes 0', ids('0'), ['0.1', '0.2', '0.3', '0.4', '0.5']);
      v.egal('étapes du processeur 1', ids('P1'), ['P1.B.1', 'P1.B.2', 'P1.B.3', 'P1.B.4', 'P1.B.5', 'P1.B.6', 'P1.B.7.1', 'P1.B.7.2', 'P1.B.7.3', 'P1.B.8', 'P1.B.9', 'P1.B.10']);
      v.egal('contrôles', ids('C'), ['C.1', 'C.2', 'C.3', 'C.4', 'C.8']);
      const t = (id) => etapeNovaLCT(p, id).texte;
      const contient = (id, morceaux) => v.vrai(`${id} : ${morceaux.join(' · ')}`, morceaux.every((m) => t(id).includes(m)), t(id));
      contient('0.5', ['User > Advanced Synchronous System User Login', '« admin »']);
      contient('P1.B.1', ['Settings > Screen Configuration', 'Configure Screen', 'Next']);
      contient('P1.B.2', ['Sending Card', 'Source Configuration', '1152 × 1152', '60 Hz', '8 bits', 'Set', 'Refresh', 'Save']);
      contient('P1.B.3', ['Receiving Card', 'Import (V5.8.1) ou Load from File (V5.5.0)', 'Send (V5.8.1) ou Send to Receiving Card (V5.5.0)', 'All Receiving Card']);
      contient('P1.B.4', ['Cabinet Information', 'Regular', '192 × 192', '128 × 128']);
      contient('P1.B.5', ['Performance Settings']);
      contient('P1.B.6', ['Screen Connection', 'Standard Screen', '6 colonnes × 6 rangées']);
      contient('P1.B.7.1', ['12 cartes', 'C1 R6', 'monte la colonne 1, descend la colonne 2', '192 × 192', `${nombre(442368)} px`, '68 %']);
      contient('P2.B.7.1', ['C7 R6', 'colonnes 1 et 2 de l\'écran (C7 et C8 du mur)']);
      contient('P1.B.8', ['Port Capacity', nombre(650000)]);
      v.egal('P1.B.8 : aucun port au-delà des 650 000 px', etapeNovaLCT(p, 'P1.B.8').alerte, null);
      contient('P1.B.9', ['Coordinate', '(0, 0)']);
      contient('P1.B.10', ['Send to HW', 'Save', 'Save to File', '.scr', 'Save System Configuration File', '.scfg']);
      contient('C.1', ['Read the Number of Receiving Cards', 'MCTRL660 n° 1 : port 1 : 12, port 2 : 12, port 3 : 12', 'MCTRL660 n° 2 : port 1 : 12']);
      v.egal('titre d\'un port', etapeNovaLCT(p, 'P1.B.7.2').titre, 'Port 2');
    },
  },
  {
    id: 'R356',
    titre: 'NovaLCT pas à pas (17a, spec § 4, partie A et B.8) : VX1000, partie « Avant NovaLCT » (V-Can ou façade, entrée à la source conseillée, MOSAIC, couche et preset, plage, sauvegarde du boîtier), onglet Sending Card à vérifier en formation ; à 50 Hz, ports au-delà des 650 000 px de NovaLCT signalés',
    etape: '17a',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000' });
      v.egal('parties', p.parties.map((x) => x.id), ['0', 'A', 'P1', 'C']);
      v.egal('partie A', [p.parties[1].titre, p.parties[1].etapes.map((e) => e.id)], ['Avant NovaLCT : V-Can ou façade du VX1000', ['A.1', 'A.2', 'A.3', 'A.4', 'A.5']]);
      const e = (id) => etapeNovaLCT(p, id);
      v.vrai('A.1 : V-Can et façade, 2304 × 1152 en Custom à 60 Hz', ['Programming > Input > Input', 'Input Settings', 'EDID', 'Custom', '2304 × 1152', '60 Hz'].every((m) => e('A.1').texte.includes(m)), e('A.1').texte);
      v.vrai('A.2 : MOSAIC', e('A.2').texte.includes('MOSAIC'), e('A.2').texte);
      v.egal('A.3 : ordre à vérifier en formation', e('A.3').aVerifier, true);
      v.vrai('A.5 : System > Backup', e('A.5').texte.includes('System > Backup'), e('A.5').texte);
      v.egal('P1.B.2 : à vérifier en formation, renvoi à A.1', [e('P1.B.2').aVerifier, e('P1.B.2').texte.includes('A.1')], [true, true]);
      const p50 = pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000', reglages: { frequenceHz: 50 } });
      const b8 = etapeNovaLCT(p50, 'P1.B.8');
      v.vrai('50 Hz : ports 1 à 4 à 663 552 px, avertissement de NovaLCT', b8.alerte?.includes('ports 1, 2, 3 et 4') && b8.alerte.includes(`${nombre(663552)} px`) && b8.alerte.includes(nombre(650000)), b8.alerte ?? 'pas d\'alerte');
      v.vrai('50 Hz : la capacité retenue reste celle de Data', b8.texte.includes(`${nombre(780000)} px`), b8.texte);
    },
  },
  {
    id: 'R357',
    titre: 'NovaLCT pas à pas (17a, spec § 4, 0.6, B.11 et C.5, choix 3) : redondance cochée : câble principal d\'abord, Redundancy et Add avec le port de secours du Schéma, test selon le processeur (Verify sur MCTRL4K, Ethernet Port Backup Test en façade du VX1000, à vérifier sinon) ; sans redondance : rien de tout cela',
    etape: '17a',
    verifier(v, contexte) {
      const k4 = pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', colonnes: 8, lignes: 4, reglages: { redondance: true } });
      v.vrai('0.6 : câble principal seul, puis secours', etapeNovaLCT(k4, '0.6')?.texte.includes('câble principal'), etapeNovaLCT(k4, '0.6')?.texte ?? 'absente');
      const b11 = etapeNovaLCT(k4, 'P1.B.11');
      v.vrai('B.11 : Redundancy, Add, port 1 et son secours port 9', b11 && ['Sending Card', 'Redundancy', 'Add', 'port 1, secours port 9', 'port 2, secours port 10'].every((m) => b11.texte.includes(m)), b11?.texte ?? 'absente');
      v.vrai('C.5 MCTRL4K : Verify', etapeNovaLCT(k4, 'C.5')?.texte.includes('Verify'), etapeNovaLCT(k4, 'C.5')?.texte ?? 'absente');
      const vx = pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000', reglages: { redondance: true } });
      v.vrai('C.5 VX1000 : Ethernet Port Backup Test', etapeNovaLCT(vx, 'C.5')?.texte.includes('Ethernet Port Backup Test'), etapeNovaLCT(vx, 'C.5')?.texte ?? 'absente');
      const m660 = pasAPasNovaLCT(contexte, { reglages: { redondance: true } });
      v.egal('C.5 MCTRL660 : à vérifier en formation', etapeNovaLCT(m660, 'C.5')?.aVerifier, true);
      const sans = pasAPasNovaLCT(contexte);
      v.egal('sans redondance : ni 0.6, ni B.11, ni C.5', ['0.6', 'P1.B.11', 'C.5'].map((id) => etapeNovaLCT(sans, id) ?? null), [null, null, null]);
    },
  },
  {
    id: 'R358',
    titre: 'NovaLCT pas à pas (17a, spec § 4, B.4 et B.7) : rangée de demi-dalles, deux tailles de carte lues dans leurs fiches, « Apply to Entire Row » sur le port qui la charge',
    etape: '17a',
    verifier(v, contexte) {
      const m = calculs.mur(CB5, 6, 3, { demi: CB5_DEMI, rangeeDemi: true });
      const p = pasAPasNovaLCT(contexte, { dalle: CB5, mur: m, depart: 'haut-gauche' });
      const t = (id) => etapeNovaLCT(p, id).texte;
      v.vrai('B.4 : 104 × 208 et 104 × 104', t('P1.B.4').includes('104 × 208') && t('P1.B.4').includes('104 × 104'), t('P1.B.4'));
      v.vrai('B.6 : 6 colonnes × 4 rangées', t('P1.B.6').includes('6 colonnes × 4 rangées'), t('P1.B.6'));
      v.vrai('B.7.1 : Apply to Entire Row, rangée 4 à 104 × 104', ['Apply to Entire Row', 'rangée 4', '104 × 104'].every((x) => t('P1.B.7.1').includes(x)), t('P1.B.7.1'));
    },
  },
  {
    id: 'R359',
    titre: 'NovaLCT pas à pas (17a, spec § 4, 0.2, B.3, C.6 et C.7) : configs du lot retenu : fichier .rcfgx et lot nommés, sans parc « choisis un parc », lot sans fichier, firmware personnalisé (N6), lots mélangés (multi-batch et .lxy), carte A10s Pro (NCP), zone courbe ou pliée (joints)',
    etape: '17a',
    verifier(v, contexte) {
      const config = (extra = {}) => ({ logiciel: 'NovaLCT', nomFichier: 'DALLE_A.rcfgx', version: '5.8.1', ...extra });
      const resultat = (lots, extra = {}) => ({ retenus: lots, melanges: lots.length > 1, firmwarePersonnalise: false, alertes: [], ...extra });
      const avec = (configs, options = {}) => pasAPasNovaLCT(contexte, { options: { configs, ...options } });
      const t = (p, id) => etapeNovaLCT(p, id)?.texte ?? 'absente';
      const simple = avec([{ libelle: null, resultat: resultat([{ identifiant: 'L1', configs: [config()] }]) }]);
      v.vrai('B.3 : fichier et lot', t(simple, 'P1.B.3').includes('DALLE_A.rcfgx (lot L1)'), t(simple, 'P1.B.3'));
      v.vrai('0.2 : fichier à prendre sur le PC', t(simple, '0.2').includes('DALLE_A.rcfgx'), t(simple, '0.2'));
      const tous = avec(null);
      v.vrai('« Tous » : choisis un parc', t(tous, 'P1.B.3').includes('Choisis un parc') && t(tous, '0.2').includes('Choisis un parc'), t(tous, 'P1.B.3'));
      const alerte = 'Aucun fichier de config pour cette dalle dans le parc Parc A : ajoute-le dans l\'onglet Base.';
      const sansFichier = avec([{ libelle: null, resultat: resultat([], { alertes: [alerte] }) }]);
      v.vrai('lot sans fichier : l\'alerte de Data', t(sansFichier, 'P1.B.3').includes(alerte), t(sansFichier, 'P1.B.3'));
      const perso = avec([{ libelle: null, resultat: resultat([{ identifiant: 'L1', configs: [config({ firmware: 'personnalisé' })] }], { firmwarePersonnalise: true }) }]);
      v.vrai('firmware personnalisé : rappel N6', t(perso, 'P1.B.3').includes('firmware personnalisé'), t(perso, 'P1.B.3'));
      const melanges = avec([{ libelle: null, resultat: resultat([{ identifiant: 'L1', configs: [config({ multiBatch: 'LOTS.lxy' })] }, { identifiant: 'L2', configs: [config()] }]) }]);
      v.vrai('lots mélangés : C.6 multi-batch', ['Tools > Multi-batch Adjustment', 'Apply Adjustment File', 'Save to Flash', 'LOTS.lxy'].every((x) => t(melanges, 'C.6').includes(x)), t(melanges, 'C.6'));
      v.egal('lots non mélangés : pas de C.6', etapeNovaLCT(simple, 'C.6') ?? null, null);
      const dalleA10sPro = { ...DALLE_CAS_13, id: 'fictive-carte-a10s-pro', carteReceptionMarque: 'Novastar', carteReceptionModele: 'A10s Pro' };
      const ncp = pasAPasNovaLCT(contexte, { dalle: dalleA10sPro });
      v.vrai('A10s Pro : NCP Management, Load NCP', ['NCP Management', 'Load NCP', 'Send NCP', 'Save to HW'].every((x) => t(ncp, 'P1.B.3').includes(x)), t(ncp, 'P1.B.3'));
      const courbe = avec(null, { courbe: true });
      v.vrai('zone courbe : C.7 Adjust Dark or Bright Lines', t(courbe, 'C.7').includes('Adjust Dark or Bright Lines'), t(courbe, 'C.7'));
      v.egal('mur à plat : pas de C.7', etapeNovaLCT(simple, 'C.7') ?? null, null);
    },
  },
  {
    id: 'R360',
    titre: 'NovaLCT pas à pas (17a, spec § 4, choix 6) : mur en zones : la grille, les ports, la charge et Coordinate remplacés par « Complex Screen et Set Blank : à vérifier en formation » ; processeur d\'un autre logiciel : pas de pas à pas',
    etape: '17a',
    verifier(v, contexte) {
      const m = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 4 }, { nom: 'B', colonnes: 4, rangees: 4 }], { ecarts: 'reel' });
      const p = pasAPasNovaLCT(contexte, { mur: m });
      v.vrai('non couvert : mur en zones', p.nonCouvert.length === 1 && /zones/.test(p.nonCouvert[0]), p.nonCouvert.join(' / '));
      v.egal('processeur 1 : B.6 seulement après B.5, puis B.10', p.parties.find((x) => x.id === 'P1').etapes.map((e) => e.id), ['P1.B.1', 'P1.B.2', 'P1.B.3', 'P1.B.4', 'P1.B.5', 'P1.B.6', 'P1.B.10']);
      const b6 = etapeNovaLCT(p, 'P1.B.6');
      v.egal('B.6 : Complex Screen et Set Blank, à vérifier en formation', [b6.aVerifier, b6.texte.includes('Complex Screen'), b6.texte.includes('Set Blank')], [true, true, true]);
      const m0 = calculs.mur(DALLE_CAS_13, 12, 6);
      const ev = calculs.evaluerProcesseur(m0, DALLE_CAS_13, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60, bits: 10 });
      v.egal('Brompton : pas de pas à pas', novalct.etapesNovaLCT({ mur: m0, dalle: DALLE_CAS_13, evaluation: ev, variante: null, source: null }), null);
    },
  },
  {
    id: 'R361',
    titre: 'NovaLCT pas à pas (17a, spec § 4 et règles du projet) : chaque étape a un titre, un texte, une source connue ou « à vérifier en formation » ; libellés de sources publiables (aucun fichier, aucun nom d\'organisme) ; signatures uniques ; texte sans tiret long',
    etape: '17a',
    verifier(v, contexte) {
      const config = { logiciel: 'NovaLCT', nomFichier: 'DALLE_A.rcfgx', multiBatch: 'LOTS.lxy' };
      const configs = [{ libelle: null, resultat: { retenus: [{ identifiant: 'L1', configs: [config] }, { identifiant: 'L2', configs: [config] }], melanges: true, firmwarePersonnalise: false, alertes: [] } }];
      const essais = [
        pasAPasNovaLCT(contexte),
        pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000', reglages: { redondance: true }, options: { configs, courbe: true, version: '5.6.2' } }),
        pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', colonnes: 8, lignes: 4, reglages: { redondance: true } }),
        pasAPasNovaLCT(contexte, { dalle: CB5, mur: calculs.mur(CB5, 6, 3, { demi: CB5_DEMI, rangeeDemi: true }) }),
        pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000-pro' }),
      ];
      const etapes = essais.flatMap((p) => p.parties.flatMap((x) => x.etapes));
      v.vrai(`étapes lues (${etapes.length})`, etapes.length > 100);
      v.egal('titre et texte', etapes.filter((e) => !e.titre || !e.texte).map((e) => e.id), []);
      v.egal('source ou « à vérifier en formation »', etapes.filter((e) => !e.sources.length && !e.aVerifier).map((e) => e.id), []);
      v.egal('codes de source connus', etapes.flatMap((e) => e.sources).filter((s) => !novalct.SOURCES_NOVALCT[s.id]).map((s) => s.id), []);
      const libelles = Object.values(novalct.SOURCES_NOVALCT).flatMap((s) => [s.titre, s.court]);
      v.egal('libellés publiables : ni chemin ni nom de fichier', libelles.filter((l) => /\/|\.(md|pdf|txt)\b/i.test(l)), []);
      v.egal('formation : « Formation (transcription n) » ou « Formation »', Object.values(novalct.SOURCES_NOVALCT).filter((s) => s.confiance === 'formation').map((s) => s.court).filter((c) => !/^Formation( \(transcription \d+\))?$/.test(c)), []);
      v.egal('signatures uniques dans chaque pas à pas', essais.map((p) => {
        const s = p.parties.flatMap((x) => x.etapes.map((e) => e.signature));
        return s.length - new Set(s).size;
      }), [0, 0, 0, 0, 0]);
      v.egal('« à vérifier en formation » écrit dans le texte', etapes.filter((e) => e.aVerifier && !e.texte.includes('à vérifier en formation')).map((e) => e.id), []);
      v.egal('sans tiret long', etapes.filter((e) => /[—–]/.test(`${e.titre} ${e.texte}`)).map((e) => e.id), []);
      v.vrai('VX1000 Pro : la note VICP ou Unico', essais[4].groupe.id === 'vx-pro' && etapeNovaLCT(essais[4], 'P1.B.2').aVerifier, essais[4].groupe.id);
      v.vrai('version 5.6.2 : note de version', essais[1].version.note?.includes('5.6.2'), essais[1].version.note ?? 'aucune');
    },
  },
  {
    id: 'R362',
    titre: 'NovaLCT pas à pas (17a, spec § 5) : rapprochement des cases : une case reste cochée si les valeurs de son étape n\'ont pas changé ; sinon (ou étape disparue) décochée, avec le texte du bandeau, jamais en silence',
    etape: '17a',
    verifier(v, contexte) {
      const avant = pasAPasNovaLCT(contexte);
      const toutes = avant.parties.flatMap((x) => x.etapes);
      const cases = Object.fromEntries(toutes.map((e) => [e.id, e.signature]));
      const meme = novalct.rapprocherNovaLCT(cases, pasAPasNovaLCT(contexte));
      v.egal('rien n\'a changé', [Object.keys(meme.cases).length, meme.perdues, meme.texte], [toutes.length, [], null]);
      const apres = pasAPasNovaLCT(contexte, { reglages: { frequenceHz: 50 } });
      const r = novalct.rapprocherNovaLCT({ 'P1.B.2': cases['P1.B.2'], '0.5': cases['0.5'] }, apres);
      v.egal('fréquence changée : carte d\'envoi décochée', [Object.keys(r.cases), r.perdues], [['0.5'], ['NovaLCT, MCTRL660 n° 1 : Carte d\'envoi']]);
      v.egal('bandeau', r.texte, 'Le mur a changé : étape « NovaLCT, MCTRL660 n° 1 : Carte d\'envoi » décochée (ses valeurs ne sont plus les mêmes).');
      const deux = novalct.rapprocherNovaLCT({ 'P1.B.2': 'ancienne', 'P1.B.11': 'disparue' }, apres);
      v.egal('deux étapes, dont une disparue', deux.texte, 'Le mur a changé : étapes « NovaLCT, MCTRL660 n° 1 : Carte d\'envoi », « Processeur 1 : Redondance des ports » décochées (leurs valeurs ne sont plus les mêmes ou l\'étape n\'existe plus).');
    },
  },
  {
    id: 'R363',
    titre: 'NovaLCT pas à pas (17b, spec § 5) : suivi des étapes (`novalct`) enregistré avec le mur sans marquer la presta modifiée ; vide dans la copie d\'un mur ou d\'une presta ; jamais exporté',
    etape: '17b',
    verifier(v) {
      const o = optionsPresta();
      const e = prestas.migrer({ configuration: configurationEssai(12) }, o);
      const p = e.index.prestas[0];
      const murId = p.murs[0].id;
      const suivi = { version: 1, cases: { 'P1.B.2': 'P1.B.2|{}' }, avis: null };
      const apres = prestas.enregistrerMur(e, murId, { novalct: suivi }, horloge(o, '2026-10-18T15:00:00Z'));
      v.egal('suivi enregistré, presta pas marquée modifiée', [apres.murs[murId].novalct, apres.index.prestas[0].modifieeLe], [suivi, p.modifieeLe]);
      suivi.cases['P1.B.3'] = 'x';
      v.egal('copie gardée, pas la référence', Object.keys(apres.murs[murId].novalct.cases), ['P1.B.2']);
      const copieMur = prestas.dupliquerMur(apres, p.id, murId, horloge(o, '2026-10-18T15:00:00Z'));
      v.egal('copie d\'un mur : suivi vide', copieMur.murs[copieMur.index.ouverte.mur].novalct ?? null, null);
      const copiePresta = prestas.dupliquerPresta(apres, p.id, horloge(o, '2026-10-18T15:00:00Z'));
      v.egal('copie d\'une presta : suivi vide', copiePresta.murs[copiePresta.index.ouverte.mur].novalct ?? null, null);
      const texte = JSON.stringify(prestas.exporterPresta(apres, p.id, fiches.baseVide(), { ...o, versionAppli: 33 }).donnees);
      v.vrai('jamais exporté', !texte.includes('novalct') && !texte.includes('P1.B.2'));
    },
  },
  {
    id: 'R364',
    titre: 'NovaLCT pas à pas (17b2, relecture point 1) : VX réglé dans V-Can : fréquence de sortie réglée dans B.2 (façade du VX1000, Screen Configuration > More Settings > Output Frame Rate, 60 Hz par défaut ; VX600 et VX400 par analogie, à vérifier) ; l\'avertissement des 650 000 px n\'est « attendu » qu\'après ce réglage',
    etape: '17b2',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000', reglages: { frequenceHz: 50 } });
      const b2 = etapeNovaLCT(p, 'P1.B.2');
      v.vrai('B.2 : Output Frame Rate à 50 Hz, 60 Hz par défaut', ['Screen Configuration > More Settings > Output Frame Rate', '50 Hz', '60 Hz par défaut'].every((x) => b2.texte.includes(x)), b2.texte);
      v.vrai('B.2 : source VX1000 § 5.2.7, p. 21', b2.sources.some((s) => s.id === 'vx1000-1-5-0' && s.ref === '§ 5.2.7, p. 21'));
      v.vrai('B.8 : attendu après le réglage de la sortie', etapeNovaLCT(p, 'P1.B.8').alerte?.includes('après le réglage de la fréquence de sortie (étape B.2)'), etapeNovaLCT(p, 'P1.B.8').alerte ?? 'pas d\'alerte');
      const vx600 = etapeNovaLCT(pasAPasNovaLCT(contexte, { procId: 'novastar-vx600', colonnes: 6, lignes: 4 }), 'P1.B.2');
      v.vrai('VX600 : Output Frame Rate par analogie, à vérifier en formation', vx600.texte.includes('Output Frame Rate') && vx600.texte.includes('à vérifier en formation') && vx600.aVerifier, vx600.texte);
    },
  },
  {
    id: 'R365',
    titre: 'NovaLCT pas à pas (17b2, relecture points 2 et 17) : B.3 : un seul fichier, All Receiving Card ; plusieurs fichiers ou une rangée de demi-dalles, Specify Receiving Card (un fichier à la fois sur ses cartes) ; toujours : ne coche pas Reset the Starting Coordinate of Receiving Card',
    etape: '17b2',
    verifier(v, contexte) {
      const config = (nom) => ({ logiciel: 'NovaLCT', nomFichier: nom });
      const un = pasAPasNovaLCT(contexte, { options: { configs: [{ libelle: null, resultat: { retenus: [{ identifiant: 'L1', configs: [config('A.rcfgx')] }], melanges: false, alertes: [] } }] } });
      const t1 = etapeNovaLCT(un, 'P1.B.3').texte;
      v.vrai('un fichier : All Receiving Card, pas Specify', t1.includes('All Receiving Card') && !t1.includes('Specify Receiving Card'), t1);
      v.vrai('Reset the Starting Coordinate of Receiving Card : à ne pas cocher', t1.includes('ne coche pas Reset the Starting Coordinate of Receiving Card'), t1);
      const deux = pasAPasNovaLCT(contexte, { options: { configs: [
        { libelle: 'Dalle A', resultat: { retenus: [{ identifiant: 'L1', configs: [config('A.rcfgx')] }], melanges: false, alertes: [] } },
        { libelle: 'Dalle B', resultat: { retenus: [{ identifiant: 'L2', configs: [config('B.rcfgx')] }], melanges: false, alertes: [] } },
      ] } });
      const t2 = etapeNovaLCT(deux, 'P1.B.3');
      v.vrai('deux fichiers : Specify Receiving Card, un fichier à la fois', t2.texte.includes('Specify Receiving Card') && t2.texte.includes('un fichier à la fois'), t2.texte);
      v.vrai('deux fichiers : sources manuel V5.5.0 p. 11 et formation 12', t2.sources.some((s) => s.id === 'lct-5-5-0' && s.ref === '§ 5.2.2.1, p. 11') && t2.sources.some((s) => s.id === 'formation-12'));
      const demi = pasAPasNovaLCT(contexte, { dalle: CB5, mur: calculs.mur(CB5, 6, 3, { demi: CB5_DEMI, rangeeDemi: true }) });
      v.vrai('rangée de demi-dalles : Specify Receiving Card', etapeNovaLCT(demi, 'P1.B.3').texte.includes('Specify Receiving Card'), etapeNovaLCT(demi, 'P1.B.3').texte);
    },
  },
  {
    id: 'R366',
    titre: 'NovaLCT pas à pas (17b2, relecture point 3) : chaque port : la taille de carte de Screen Connection reste à 128 × 128 même après le .rcfgx, tape la taille de la dalle avant de cliquer les cartes (formation, transcriptions 6 et 11)',
    etape: '17b2',
    verifier(v, contexte) {
      const b7 = etapeNovaLCT(pasAPasNovaLCT(contexte), 'P1.B.7.1');
      v.vrai('128 × 128 même après le .rcfgx, 192 × 192 à taper', ['128 × 128', 'même après', 'tape 192 × 192'].every((x) => b7.texte.includes(x)), b7.texte);
      v.vrai('sources : formation 6 et 11', ['formation-6', 'formation-11'].every((id) => b7.sources.some((s) => s.id === id)));
    },
  },
  {
    id: 'R367',
    titre: 'NovaLCT pas à pas (17b2, relecture point 4) : sortie pliée : un écran par tranche (à vérifier en formation), Coordinate de chaque tranche, couche à la taille de la sortie ; signatures qui changent avec les tranches',
    etape: '17b2',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 30, 2);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-vx1000'), NOVASTAR_60_8);
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const variante = c.variantes.find((x) => x.mode === c.conseil);
      const pliage = calculs.pliageSortie(m, DALLE_CAS_13, evaluation, [3840, 2160], { depart: 'bas-gauche' });
      v.egal('essai : un bloc plié en deux tranches', [evaluation.nombre, pliage.ok, pliage.blocs[0].tranches.length], [1, true, 2]);
      const source = { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60, standard: true, liaison: 'hdmi-2.0' };
      const p = novalct.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante, source, pliage });
      const b6 = etapeNovaLCT(p, 'P1.B.6');
      v.vrai('B.6 : nombre d\'écrans 2, un par tranche, à vérifier en formation', b6.aVerifier && b6.texte.includes('nombre d\'écrans 2') && !b6.texte.includes('nombre d\'écrans 1'), b6.texte);
      const b9 = etapeNovaLCT(p, 'P1.B.9');
      const [t1, t2] = pliage.blocs[0].tranches;
      v.vrai('B.9 : Coordinate de chaque tranche', b9.texte.includes(`${t1.nom} : Coordinate (${t1.sortie.x}, ${t1.sortie.y})`) && b9.texte.includes(`${t2.nom} : Coordinate (${t2.sortie.x}, ${t2.sortie.y})`), b9.texte);
      v.vrai('A.3 : couche à la taille de la sortie', etapeNovaLCT(p, 'A.3').texte.includes('3840 × 2160'), etapeNovaLCT(p, 'A.3').texte);
      const sans = novalct.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante, source });
      v.vrai('signature de B.9 différente avec et sans pliage', etapeNovaLCT(sans, 'P1.B.9').signature !== b9.signature);
    },
  },
  {
    id: 'R368',
    titre: 'NovaLCT pas à pas (17b2, relecture point 5) : variante de câblage marquée impossible dans le Schéma : sa raison en alerte dans la grille (B.6) et dans les alertes du pas à pas',
    etape: '17b2',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const variante = { ...c.variantes.find((x) => x.mode === c.conseil), possible: false, raison: 'Raison d\'essai : port trop chargé.' };
      const p = novalct.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante, source: null });
      v.vrai('B.6 : alerte avec la raison', etapeNovaLCT(p, 'P1.B.6').alerte?.includes('Raison d\'essai : port trop chargé.'), etapeNovaLCT(p, 'P1.B.6').alerte ?? 'pas d\'alerte');
      v.vrai('alertes du pas à pas', p.alertes.some((a) => a.includes('Raison d\'essai')), p.alertes.join(' / '));
      v.egal('variante possible : pas d\'alerte', etapeNovaLCT(pasAPasNovaLCT(contexte), 'P1.B.6').alerte, null);
    },
  },
  {
    id: 'R369',
    titre: 'NovaLCT pas à pas (17b2, relecture point 6) : A.1 nomme l\'entrée ; optique ou SDI : pas de réglage de résolution de l\'entrée (seules DVI, HDMI et DP), la source envoie la taille du canvas',
    etape: '17b2',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const evaluation = calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-vx1000'), NOVASTAR_60_8);
      const c = calculs.cablageData(m, DALLE_CAS_13, evaluation, { depart: 'bas-gauche' });
      const variante = c.variantes.find((x) => x.mode === c.conseil);
      const a1 = (liaison) => etapeNovaLCT(novalct.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation, variante,
        source: { largeurPx: 2304, hauteurPx: 1152, frequenceHz: 60, standard: false, liaison } }), 'A.1');
      const opt = a1('opt-10g');
      v.vrai('optique : nommée, pas de réglage de résolution', opt.texte.includes('Entrée optique (OPT)') && opt.texte.includes('pas de réglage de résolution') && opt.texte.includes('Only DVI, HDMI and DP connectors support input resolution settings'), opt.texte);
      v.vrai('SDI : pas de réglage de résolution', a1('12g-sdi').texte.includes('Entrée SDI') && a1('12g-sdi').texte.includes('pas de réglage de résolution'), a1('12g-sdi').texte);
      const hdmi = a1('hdmi-2.0');
      v.vrai('HDMI : nommée, réglage EDID', hdmi.texte.includes('Entrée HDMI') && hdmi.texte.includes('Programming > Input > Input') && !hdmi.texte.includes('pas de réglage de résolution'), hdmi.texte);
    },
  },
  {
    id: 'R370',
    titre: 'NovaLCT pas à pas (17b2, relecture points 8 à 12) : références de page corrigées ; chemin des joints selon la version ; VNNOX Care après Send to HW (V5.8.1) et pour le .scfg d\'un écran en ligne ; B.10 et C.2 décochés quand les ports changent ; étapes V-Can selon les produits cités par le manuel ; VX16s : entrée dans Sending Card ; synchronisation de plusieurs VX1000 ; NCP : Send et Send Mode Parameters',
    etape: '17b2',
    verifier(v, contexte) {
      const ref = (p, id, source, attendu) => etapeNovaLCT(p, id)?.sources.some((s) => s.id === source && s.ref === attendu);
      const vx = pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000', reglages: { redondance: true } });
      const m660 = pasAPasNovaLCT(contexte, { options: { courbe: true, version: '5.5.0' } });
      v.egal('pages', [
        ref(m660, '0.4', 'lct-5-8-1', '§ 9.5, p. 125 et 126'), ref(vx, 'A.5', 'vcan-3-8-0', '§ 3.3.5 et § 3.3.6, p. 55 et 56'), ref(vx, 'A.5', 'vx1000-1-5-0', '§ 7, p. 56 et 57'),
        ref(vx, 'C.5', 'vx1000-1-5-0', '§ 5.8.2, p. 38 et 39'), ref(vx, 'A.3', 'vcan-3-8-0', '§ 3.1.6 et § 3.1.15.1, p. 21, 22, 38 et 39'),
        novalct.groupeVideo(processeurDeBase(contexte, 'novastar-vx1000-pro')).sources[0].ref,
      ], [true, true, true, true, true, 'p. 2']);
      const c7 = etapeNovaLCT(m660, 'C.7');
      v.vrai('C.7 : chemin des deux versions, V5.5.0 d\'abord', c7.texte.includes('Tools > Quickly Adjust Dark or Bright Lines > Adjust Dark or Bright Lines (V5.5.0) ou Tools > Quickly Adjust Dark or Bright Lines (V5.8.1)') && ref(m660, 'C.7', 'lct-5-8-1', '§ 6.4, p. 69'), c7.texte);
      const b10 = etapeNovaLCT(m660, 'P1.B.10').texte;
      v.vrai('B.10 : VNNOX Care après Send to HW (V5.8.1) et pour le .scfg en ligne', b10.includes('VNNOX Care') && b10.includes('Bind') && b10.includes('écran en ligne'), b10);
      const plus = pasAPasNovaLCT(contexte, { lignes: 7 });
      const sig = (p, id) => etapeNovaLCT(p, id).signature;
      v.vrai('B.10 et C.2 changent avec les ports', sig(plus, 'P1.B.10') !== sig(pasAPasNovaLCT(contexte), 'P1.B.10') && sig(plus, 'C.2') !== sig(pasAPasNovaLCT(contexte), 'C.2'));
      const vx6s = pasAPasNovaLCT(contexte, { procId: 'novastar-vx6s', colonnes: 4, lignes: 3 });
      const vx16s = pasAPasNovaLCT(contexte, { procId: 'novastar-vx16s', colonnes: 8, lignes: 4 });
      v.egal('V-Can : produits non cités, à vérifier', [etapeNovaLCT(vx6s, 'A.2').aVerifier, etapeNovaLCT(vx6s, 'A.4').aVerifier, etapeNovaLCT(vx16s, 'A.4').aVerifier, etapeNovaLCT(vx16s, 'A.5').aVerifier,
        etapeNovaLCT(vx, 'A.2').aVerifier, etapeNovaLCT(vx, 'A.4').aVerifier, etapeNovaLCT(vx, 'A.5').aVerifier], [true, true, true, true, false, false, false]);
      const b2 = etapeNovaLCT(vx16s, 'P1.B.2');
      v.vrai('VX16s : entrée dans Sending Card, source V5.5.0 § 5.2.1', !b2.aVerifier && b2.texte.includes('Source Configuration') && ref(vx16s, 'P1.B.2', 'lct-5-5-0', '§ 5.2.1, p. 9 et 10'), b2.texte);
      const a6 = etapeNovaLCT(vx, 'A.6');
      v.vrai('deux VX1000 : synchronisation', vx.parties.filter((x) => x.processeur).length === 2 && a6?.texte.includes('Advanced Settings > Synchronization') && ref(vx, 'A.6', 'vx1000-1-5-0', '§ 5.8.4, p. 40 et 41'), a6?.texte ?? 'absente');
      v.egal('un seul VX1000 : pas de synchronisation', etapeNovaLCT(pasAPasNovaLCT(contexte, { procId: 'novastar-vx1000' }), 'A.6') ?? null, null);
      const dalleA10sPro = { ...DALLE_CAS_13, id: 'fictive-carte-a10s-pro', carteReceptionMarque: 'Novastar', carteReceptionModele: 'A10s Pro' };
      const ncp = etapeNovaLCT(pasAPasNovaLCT(contexte, { dalle: dalleA10sPro }), 'P1.B.3').texte;
      v.vrai('NCP : Send et Send Mode Parameters', ncp.includes('All Receiving Card, Send') && ncp.includes('Send Mode Parameters'), ncp);
    },
  },
  {
    id: 'R371',
    titre: 'NovaLCT pas à pas (17b3, redondance) : B.11 en tableau à remplir (numéro de la carte d\'envoi principale, port principal, numéro de la carte d\'envoi de secours, port de secours ; même numéro dans un même processeur), le second processeur a son propre parcours depuis le lot 22c (B.11 n\'en parle plus, modifié avec l\'accord de l\'utilisateur) ; redondance non cochée : note en tête de chaque processeur',
    etape: '17b3',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte, { reglages: { redondance: true } });
      const b11 = etapeNovaLCT(p, 'P1.B.11');
      v.egal('tableau : colonnes', b11?.tableau?.colonnes, ['Carte d\'envoi principale', 'Port principal', 'Carte d\'envoi de secours', 'Port de secours']);
      v.egal('tableau : une ligne par port, même carte d\'envoi', b11?.tableau?.lignes, [[1, 1, 1, 3], [1, 2, 1, 4]]);
      v.vrai('même numéro de carte d\'envoi ; plus de second processeur chaîné (lot 22c)', b11?.texte.includes('« enter the same value for serial numbers »') && !b11.texte.includes('Set as Backup, et dans le tableau'), b11?.texte ?? 'absente');
      v.vrai('sources : manuel V5.5.0 § 5.3, formation 12', b11?.sources.some((s) => s.id === 'lct-5-5-0' && s.ref === '§ 5.3, p. 27 et 28') && b11?.sources.some((s) => s.id === 'formation-12'));
      v.egal('redondance cochée : pas de note', p.parties.find((x) => x.id === 'P1').note ?? null, null);
      const sans = pasAPasNovaLCT(contexte);
      v.egal('redondance non cochée : note en tête de chaque processeur', sans.parties.filter((x) => x.processeur).map((x) => x.note),
        Array(2).fill('Redondance non cochée dans Data : pas de port de secours à régler. Si tu câbles des retours de secours, coche « Redondance » dans Data : l\'étape B.11 te donnera le tableau à remplir.'));
    },
  },
  {
    id: 'R372',
    titre: 'NovaLCT pas à pas (17c1, doutes de la relecture et formation) : multi-batch (avec le .lxy Apply Adjustment File, sans fichier Manual Adjustment) ; façade du VX en Custom sans Apply ; Refresh All puis Refresh ; chemin V-Can de la plage à vérifier ; câbles de secours branchés avant le tableau de la redondance (ordre corrigé au lot 22c avec l\'accord de l\'utilisateur) ; fréquence de Canvas signalée si elle diffère de Data ; chaque port en vue de face (Formation, transcription 11)',
    etape: '17c1',
    verifier(v, contexte) {
      const config = { logiciel: 'NovaLCT', nomFichier: 'A.rcfgx', multiBatch: 'LOTS.lxy' };
      const melanges = pasAPasNovaLCT(contexte, { reglages: { redondance: true }, options: { configs: [{ libelle: null, resultat: { retenus: [{ identifiant: 'L1', configs: [config] }, { identifiant: 'L2', configs: [config] }], melanges: true, alertes: [] } }] } });
      const c6 = etapeNovaLCT(melanges, 'C.6').texte;
      v.vrai('C.6 : avec le fichier Apply Adjustment File, sans fichier Manual Adjustment', c6.includes('avec le fichier LOTS.lxy, Apply Adjustment File') && c6.includes('sans fichier, Manual Adjustment'), c6);
      v.vrai('0.4 : Refresh All, puis Refresh', etapeNovaLCT(melanges, '0.4').texte.includes('Refresh All, puis Refresh'), etapeNovaLCT(melanges, '0.4').texte);
      const t11 = etapeNovaLCT(melanges, 'P1.B.11').texte;
      v.vrai('B.11 : câbles de secours branchés avant le tableau', t11.indexOf('câbles de secours') >= 0 && t11.indexOf('câbles de secours') < t11.indexOf('Redundancy, Add') && !t11.includes('puis branche les câbles de secours'), t11);
      const b7 = etapeNovaLCT(melanges, 'P1.B.7.1').texte;
      v.vrai('port : vue de face, gauche et droite inversées derrière le mur', b7.includes('vue de face') && b7.includes('derrière le mur'), b7);
      const m = calculs.mur(DALLE_CAS_13, 12, 6);
      const ev = (id) => calculs.evaluerProcesseur(m, DALLE_CAS_13, processeurDeBase(contexte, id), NOVASTAR_60_8);
      const avec = (id, source) => {
        const e = ev(id);
        const c = calculs.cablageData(m, DALLE_CAS_13, e, { depart: 'bas-gauche' });
        return novalct.etapesNovaLCT({ mur: m, dalle: DALLE_CAS_13, evaluation: e, variante: c.variantes.find((x) => x.mode === c.conseil), source });
      };
      const facade = (p) => etapeNovaLCT(p, 'A.1').texte.split('En façade')[1] ?? '';
      v.vrai('façade en Custom : pas de Apply', !facade(avec('novastar-vx1000', { largeurPx: 2304, hauteurPx: 1152, frequenceHz: 60, standard: false, liaison: 'hdmi-2.0' })).includes('Apply'));
      v.vrai('façade en Standard : Apply', facade(avec('novastar-vx1000', { largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60, standard: true, liaison: 'hdmi-2.0' })).includes('Apply'));
      v.vrai('A.4 : chemin V-Can à vérifier en formation', etapeNovaLCT(avec('novastar-vx1000', null), 'A.4').texte.includes('chemin exact dans V-Can : à vérifier en formation'));
      const b2 = etapeNovaLCT(avec('novastar-mctrl660', { largeurPx: 1152, hauteurPx: 1152, frequenceHz: 50, standard: false, liaison: 'hdmi-1.3' }), 'P1.B.2').texte;
      v.vrai('fréquence de Canvas différente de Data : signalée', b2.includes('la source de l\'onglet Canvas est à 50 Hz, Data à 60 Hz'), b2);
      const meme = etapeNovaLCT(avec('novastar-mctrl660', { largeurPx: 1152, hauteurPx: 1152, frequenceHz: 60, standard: false, liaison: 'hdmi-1.3' }), 'P1.B.2').texte;
      v.vrai('même fréquence : rien', !meme.includes('la source de l\'onglet Canvas est à'), meme);
    },
  },
  {
    id: 'R373',
    titre: 'NovaLCT pas à pas (17c1) : texte copié (`texteNovaLCT`) : titre, presta et mur, processeurs, étapes faites, une partie par titre en capitales, chaque étape (numéro, titre, « fait »), son texte, le tableau de la redondance, alertes, « à vérifier en formation », sources ; une information par ligne, sans tiret de liste ni tiret long, espaces simples',
    etape: '17c1',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte, { reglages: { redondance: true } });
      const b2 = etapeNovaLCT(p, 'P1.B.2');
      const total = p.parties.reduce((t, x) => t + x.etapes.length, 0);
      const t = novalct.texteNovaLCT(p, { 'P1.B.2': b2.signature }, { presta: 'Presta A', mur: 'Mur 1' });
      const lignes = t.split('\n');
      v.egal('en-tête', lignes.slice(0, 5), ['NOVALCT PAS À PAS', 'Presta : Presta A', 'Mur : Mur 1', `Processeurs : ${p.parties.filter((x) => x.processeur).length} × MCTRL660`, `Étapes faites : 1 sur ${total}`]);
      v.vrai('parties en capitales', lignes.includes('AVANT DE PARTIR ET SUR PLACE') && lignes.includes('NOVALCT, MCTRL660 N° 1') && lignes.includes('CONTRÔLES'), lignes.filter((l) => l === l.toUpperCase() && l.length > 3).join(' / '));
      v.vrai('étape faite marquée', lignes.includes('B.2 Carte d\'envoi : fait'), lignes.filter((l) => l.startsWith('B.2')).join(' / '));
      v.vrai('étape non faite', lignes.includes('0.5 Connexion avancée'));
      v.vrai('source', lignes.includes('Source : Manuel NovaLCT V5.5.0 § 4, p. 5 ; Manuel NovaLCT V5.8.1 § 4, p. 6 ; Formation (transcription 6)'));
      v.vrai('tableau de la redondance', lignes.includes('Redondance, port 1 : carte principale 1, port 1 ; carte de secours 1, port 3'), lignes.filter((l) => l.startsWith('Redondance, port')).join(' / '));
      v.egal('sans tiret de liste, tiret long ni double espace', lignes.filter((l) => /^\s*[-•]|[—–]| {2}/.test(l)), []);
    },
  },
  {
    id: 'R374',
    titre: 'NovaLCT pas à pas (17c1) : PDF (`ficheNovaLCT`, puis `pdfFiche` des fiches métier) : titre, rappel, en-tête (presta, mur, processeurs, étapes faites, date), un bloc par partie, lignes des étapes ; fichier PDF valide',
    etape: '17c1',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte);
      const f = novalct.ficheNovaLCT(p, {}, { presta: 'Presta A', mur: 'Mur 1', date: new Date(2026, 9, 18, 12) });
      v.egal('titre et en-tête', [f.titre, f.entete.map(([l]) => l)], ['NovaLCT pas à pas', ['Presta', 'Mur', 'Processeurs', 'Étapes faites', 'Date']]);
      v.egal('un bloc par partie', f.blocs.map((b) => b.titre), p.parties.map((x) => x.titre));
      v.vrai('lignes : étape en sous-titre, texte, source', f.blocs[0].lignes[0].titre === '0.1 PC de régie et logiciels' && f.blocs[0].lignes.some((l) => l.libelle === 'Source'));
      const fichier = pdf.pdfFiche(f);
      v.vrai('PDF valide', fichier.startsWith('%PDF-1.4') && fichier.trimEnd().endsWith('%%EOF') && /\/Count \d+/.test(fichier));
    },
  },
  {
    id: 'R375',
    titre: 'NovaLCT pas à pas (17c1) : résumé pour la fiche régie (`resumeNovaLCT`) : processeurs, étapes faites, entrée et grille de chaque processeur, où trouver le pas à pas ; repris dans la fiche régie sous « Pas à pas NovaLCT » quand le mur en a un, la fiche inchangée sinon',
    etape: '17c1',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte);
      const r = novalct.resumeNovaLCT(p, {});
      v.egal('résumé', r.split('\n'), ['NOVALCT', 'Processeurs : 2 × MCTRL660', `Étapes faites : 0 sur ${p.parties.reduce((t, x) => t + x.etapes.length, 0)}`,
        'Processeur n° 1 dans NovaLCT : entrée 1152 × 1152 à 60 Hz en 8 bits, grille de 6 colonnes × 6 rangées, 3 ports',
        'Processeur n° 2 dans NovaLCT : entrée 1152 × 1152 à 60 Hz en 8 bits, grille de 6 colonnes × 6 rangées, 3 ports',
        'Pas à pas : onglet Data, carte « NovaLCT pas à pas »']);
      const textes = { canvas: 'CANVAS ET SOURCE\nSource : 1152 × 1152 px à 60 Hz en HDMI 1.3', data: 'DATA\nProcesseur : 2 × MCTRL660' };
      const fiche = (t) => fichesMetier.ficheMetier('regie', { presta: { nom: 'Presta A', murs: [] }, murs: [{ nom: 'Mur 1', fiche: { textes: t, calculeeLe: '2026-10-18T10:00:00.000Z' }, materiel: null }], date: new Date(2026, 9, 18, 12) });
      const avec = fiche({ ...textes, novalct: r }).blocs[0].lignes;
      const i = avec.findIndex((l) => l.titre === 'Pas à pas NovaLCT');
      v.vrai('fiche régie : bloc « Pas à pas NovaLCT » avec ses lignes', i > 0 && avec[i + 1]?.libelle === 'Processeurs' && avec.some((l) => l.libelle === 'Processeur n° 1 dans NovaLCT'), JSON.stringify(avec.slice(i, i + 3)));
      v.egal('sans pas à pas : fiche inchangée', fiche(textes).blocs[0].lignes.some((l) => l.titre === 'Pas à pas NovaLCT'), false);
    },
  },
  {
    id: 'R376',
    titre: 'NovaLCT pas à pas (17c2, à blanc) : mur d\'exemple de la base (12 × 6 Absen M2.9, carte Novastar, 60 Hz, 8 bits, départ en bas à gauche) sur MCTRL660 ou VX1000, redondance au choix, avec son pas à pas et sa description ; dalle ou processeur absent de la base : rien',
    etape: '17c2',
    verifier(v, contexte) {
      const bd = baseDalles(contexte);
      const bp = baseProcesseurs(contexte);
      const base = {
        dalles: bd.dalles.map((f) => calculs.resoudreFiche(f, bd.sources)),
        processeurs: bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)),
        liaisons: liaisonsDeBase(contexte),
      };
      v.egal('mur d\'exemple', [novalct.MUR_A_BLANC.dalle, novalct.MUR_A_BLANC.colonnes, novalct.MUR_A_BLANC.lignes, novalct.MUR_A_BLANC.processeur],
        ['absen-m2-9', 12, 6, 'novastar-mctrl660']);
      const a = novalct.murABlanc(base);
      v.egal('MCTRL660 par défaut, sans redondance', [a?.resultat.processeur, a?.resultat.parties.map((x) => x.id), a?.evaluation.reglages.redondance],
        ['MCTRL660', ['0', 'P1', 'C'], false]);
      v.egal('description', a?.description, 'Mur d\'exemple : 12 × 6 Absen M2.9, 1 × MCTRL660, 60 Hz, 8 bits.');
      const b = novalct.murABlanc({ ...base, processeur: 'novastar-vx1000', redondance: true });
      v.vrai('VX1000 et redondance : partie V-Can, tableau de redondance', b?.resultat.parties.some((x) => x.id === 'A') && b.resultat.parties.flatMap((x) => x.etapes).some((e) => e.id === 'P1.B.11' && e.tableau?.lignes.length > 0));
      v.vrai('description avec la redondance', b?.description.endsWith(', redondance.'), b?.description ?? 'aucune');
      v.egal('dalle absente : rien', novalct.murABlanc({ ...base, dalles: [] }), null);
    },
  },
  {
    id: 'R377',
    titre: 'Code admin NovaLCT du parc (18a, spec § 2) : `parc.codeNovaLCT`, texte de 1 à 40 caractères, espaces de bord retirés, facultatif (vide : retiré), refus avec la raison ; valeur illisible d\'un fichier ignorée ; gardé dans l\'export de la base, retiré de l\'export d\'une presta ; import d\'une presta : parc identique sans tenir compte du code, code de l\'appareil gardé même en prenant le parc du fichier',
    etape: '18a',
    verifier(v, contexte) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const id = base.parcs[0].id;
      base = fiches.reglerCodeNovaLCT(base, id, '  code-essai ');
      v.egal('gardé, espaces de bord retirés', [base.parcs[0].codeNovaLCT, fiches.codeNovaLCT(base, id)], ['code-essai', 'code-essai']);
      v.egal('vide : retiré, plus rien d\'écrit', 'codeNovaLCT' in fiches.reglerCodeNovaLCT(base, id, '  ').parcs[0], false);
      v.egal('41 caractères : refus avec la raison', messageErreur(() => fiches.reglerCodeNovaLCT(base, id, 'x'.repeat(41))), 'Code admin NovaLCT : 40 caractères au plus, ou vide.');
      v.egal('40 caractères : gardé', fiches.codeNovaLCT(fiches.reglerCodeNovaLCT(base, id, 'x'.repeat(40)), id), 'x'.repeat(40));
      const lu = (x) => fiches.codeNovaLCT({ ...base, parcs: [{ ...base.parcs[0], codeNovaLCT: x }] }, id);
      v.egal('valeur illisible d\'un fichier : ignorée', [lu(1234), lu(''), lu('x'.repeat(41)), lu(null), lu({ code: 'a' })], [null, null, null, null, null]);
      v.egal('« Tous » ou parc inconnu : aucun', [fiches.codeNovaLCT(base, null), fiches.codeNovaLCT(base, 'autre')], [null, null]);
      v.egal('export de la base : gardé', fiches.exporter(base, null).parcs[0].codeNovaLCT, 'code-essai');

      const o = optionsPresta();
      const essai = prestaEssai(o, contexte);
      const pid = essai.base.parcs[0].id;
      const avecCode = fiches.reglerCodeNovaLCT(essai.base, pid, 'code-essai');
      const { donnees } = prestas.exporterPresta(essai.etat, essai.presta.id, avecCode, { ...o, versionAppli: 38 });
      v.egal('export d\'une presta : parc sans le code', [donnees.parcs.map((p) => p.nom), donnees.parcs.some((p) => 'codeNovaLCT' in p), JSON.stringify(donnees).includes('code-essai')],
        [['Prestataire A'], false, false]);
      const texte = JSON.stringify(donnees);
      v.egal('import sur l\'appareil qui a le code : parc identique, pas de conflit', prestas.verifierImportPresta(texte, essai.etat, avecCode, essai.depart).conflits.parcs, []);
      const r1 = prestas.importerPresta(prestas.migrer({}, o), avecCode, essai.depart, texte, { conflits: 'prendre' }, o);
      v.egal('« Prendre ceux du fichier », parc identique : code gardé', [r1.rapport.parcs.identiques, fiches.codeNovaLCT(r1.base, pid)], [['Prestataire A'], 'code-essai']);
      const autre = fiches.reglerCodeNovaLCT(autreAppareil(contexte), pid, 'autre-code');
      const r2 = prestas.importerPresta(prestas.migrer({}, o), autre, essai.depart, texte, { conflits: 'prendre' }, o);
      v.egal('parc différent pris du fichier : code de l\'appareil gardé', [r2.rapport.parcs.remplaces, fiches.codeNovaLCT(r2.base, pid)], [['Prestataire A'], 'autre-code']);
      const r3 = prestas.importerPresta(prestas.migrer({}, o), fiches.baseVide(), essai.depart, texte, {}, o);
      v.egal('parc absent ajouté : sans code', [r3.rapport.parcs.ajoutes, fiches.codeNovaLCT(r3.base, pid)], [['Prestataire A'], null]);
    },
  },
  {
    id: 'R378',
    titre: 'Code admin NovaLCT du parc (18a, spec § 2) : étape 0.5, défaut « admin » toujours dit ; parc avec un code : « Ton parc X a changé ce mot de passe », l\'étape porte le nom du parc pour l\'écran, jamais le code ; même signature avec ou sans code ; texte copié, PDF et résumé de la fiche régie : le code du parc dans l\'appli, jamais le code lui-même ; parc sans code : textes d\'avant ; à blanc : le parc aussi',
    etape: '18a',
    verifier(v, contexte) {
      const sans = pasAPasNovaLCT(contexte);
      const parc = { nom: 'Parc test', aCode: true };
      const avec = pasAPasNovaLCT(contexte, { options: { parc } });
      const sansCode = pasAPasNovaLCT(contexte, { options: { parc: { nom: 'Parc test', aCode: false } } });
      const [e0, e1, e2] = [sans, avec, sansCode].map((p) => etapeNovaLCT(p, '0.5'));
      v.vrai('défaut « admin » dit, avec ou sans code', [e0, e1].every((e) => e.texte.includes('mot de passe par défaut « admin »')), e1.texte);
      v.vrai('avec un code : le parc l\'a changé, code dans l\'appli', e1.texte.includes('Ton parc Parc test a changé ce mot de passe : prends son code dans l\'appli (onglet Base).'), e1.texte);
      v.egal('nom du parc pour l\'écran ; sans code : aucun', [e1.codeParc, e0.codeParc, e2.codeParc], ['Parc test', null, null]);
      v.egal('parc sans code : texte d\'avant', e2.texte, e0.texte);
      v.egal('même signature (changer le code ne décoche rien)', e1.signature, e0.signature);
      const lignes = novalct.texteNovaLCT(avec, {}, { presta: 'Presta A', mur: 'Mur 1' }).split('\n');
      v.vrai('texte copié : le code du parc dans l\'appli', lignes.some((l) => l.includes('Ton parc Parc test a changé ce mot de passe')));
      const pdfLignes = novalct.ficheNovaLCT(avec, {}, { presta: 'Presta A', mur: 'Mur 1' }).blocs[0].lignes;
      v.vrai('PDF : idem', pdfLignes.some((l) => (l.valeur ?? '').includes('Ton parc Parc test a changé ce mot de passe')));
      const resume = novalct.resumeNovaLCT(avec, {}).split('\n');
      v.vrai('fiche régie : le code du parc dans l\'appli', resume.includes('Mot de passe NovaLCT : celui du parc Parc test, dans l\'appli (onglet Base)'), resume.join(' / '));
      v.egal('fiche régie sans code : inchangée', novalct.resumeNovaLCT(sansCode, {}), novalct.resumeNovaLCT(sans, {}));
      const fuite = pasAPasNovaLCT(contexte, { options: { parc: { ...parc, code: 'code-essai' } } });
      v.egal('code passé par erreur : jamais dans le pas à pas, le texte, le PDF ni le résumé',
        [fuite, novalct.texteNovaLCT(fuite, {}), novalct.ficheNovaLCT(fuite, {}), novalct.resumeNovaLCT(fuite, {})].filter((x) => JSON.stringify(x).includes('code-essai')).length, 0);
      const bd = baseDalles(contexte);
      const bp = baseProcesseurs(contexte);
      const blanc = novalct.murABlanc({
        dalles: bd.dalles.map((f) => calculs.resoudreFiche(f, bd.sources)), processeurs: bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)),
        liaisons: liaisonsDeBase(contexte), parc,
      });
      v.egal('à blanc : le parc actif aussi', etapeNovaLCT(blanc.resultat, '0.5').codeParc, 'Parc test');
    },
  },
  {
    id: 'R379',
    titre: 'NovaLCT à blanc pour chaque processeur (18b, spec § 3.1) : liste des processeurs de la base réglés dans NovaLCT, sans les fiches « à compléter », groupés par gamme dans l\'ordre MCTRL, MSD, VX, VX Pro, NovaPro, série H, du plus petit au plus grand comme dans Data, « actuel » ou « ancien » ; MCTRL660 par défaut ; aucun processeur d\'un autre logiciel',
    etape: '18b',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const procs = bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources));
      const l = novalct.processeursABlanc(procs);
      const ids = l.groupes.flatMap((g) => g.processeurs.map((p) => p.id));
      const attendus = procs.filter((p) => p.logiciel === 'NovaLCT' && calculs.champsManquants(p).length === 0).map((p) => p.id);
      v.egal('tous les NovaLCT complets, une fois chacun', [...ids].sort(), [...attendus].sort());
      v.egal('34 processeurs (liste lue le 21/10/2026)', ids.length, 34);
      v.egal('MCTRL4K proposé, VX400s (à compléter) absent', [ids.includes('novastar-mctrl4k'), ids.includes('novastar-vx400s')], [true, false]);
      v.egal('gammes dans l\'ordre', l.groupes.map((g) => g.gamme), ['MCTRL', 'MSD (cartes d\'envoi)', 'VX', 'VX Pro', 'NovaPro', 'Série H']);
      v.egal('MCTRL du plus petit au plus grand, comme dans Data', l.groupes[0].processeurs.map((p) => p.modele),
        ['MCTRL300', 'MCTRL660', 'MCTRL660 Pro', 'MCTRL500', 'MCTRL600', 'MCTRL700', 'MCTRL700 Pro', 'MCTRL R5', 'MCTRL4K']);
      v.egal('libellé avec « actuel » ou « ancien »', [l.groupes[0].processeurs.at(-1).libelle, l.groupes[0].processeurs[3].libelle], ['MCTRL4K (actuel)', 'MCTRL500 (ancien)']);
      v.egal('MCTRL660 par défaut', l.defaut, 'novastar-mctrl660');
      v.egal('aucun processeur d\'un autre logiciel', ids.filter((id) => procs.find((p) => p.id === id).logiciel !== 'NovaLCT'), []);
    },
  },
  {
    id: 'R380',
    titre: 'NovaLCT à blanc pour chaque processeur (18b, spec § 3.1 et 3.2) : un pas à pas complet sur le mur d\'exemple pour chacun des processeurs de la liste, avec et sans redondance ; chaque étape a une source ou « à vérifier en formation »',
    etape: '18b',
    verifier(v, contexte) {
      const bd = baseDalles(contexte);
      const bp = baseProcesseurs(contexte);
      const base = { dalles: bd.dalles.map((f) => calculs.resoudreFiche(f, bd.sources)), processeurs: bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)), liaisons: liaisonsDeBase(contexte) };
      const ids = novalct.processeursABlanc(base.processeurs).groupes.flatMap((g) => g.processeurs.map((p) => p.id));
      const problemes = [];
      for (const id of ids) {
        for (const redondance of [false, true]) {
          const a = novalct.murABlanc({ ...base, processeur: id, redondance });
          if (!a?.resultat) {
            problemes.push(`${id}${redondance ? ' (redondance)' : ''} : ${a?.raison ?? 'aucun pas à pas'}`);
            continue;
          }
          const sans = a.resultat.parties.flatMap((x) => x.etapes).filter((e) => !e.sources.length && !e.aVerifier).map((e) => e.id);
          if (sans.length) problemes.push(`${id} : étapes sans source ni « à vérifier » ${sans.join(', ')}`);
          if (!a.resultat.parties.some((x) => x.processeur)) problemes.push(`${id} : aucune partie NovaLCT`);
        }
      }
      v.egal(`un pas à pas complet pour chacun des ${ids.length} processeurs`, problemes, []);
    },
  },
  {
    id: 'R381',
    titre: 'NovaLCT pas à pas, particularités des modèles (18b, spec § 3.2) : MCTRL4K, fibres OPT1 (ports 1 à 8) et OPT2 (9 à 16), OPT3 et OPT4 en secours, CVT4K au pied du mur, fibres du mur selon ses ports (redondance comprise) ; MCTRL R5 et MCTRL660 PRO, leurs fibres, convertisseur à vérifier ; mode de travail « sending card mode » (MCTRL660 PRO, MCTRL R5, H9, NovaPro UHD Jr), ports optiques en hot backup ou copy (H9, NovaPro UHD Jr) ; secours de la source, facultatif (MCTRL660 PRO, MCTRL R5) ; série H : cartes de sortie de Data, ports par carte à vérifier ; rien de tout cela sur un MCTRL660',
    etape: '18b',
    verifier(v, contexte) {
      const pas = (procId, reglages = {}) => pasAPasNovaLCT(contexte, { dalle: dalleDeBase(contexte, 'absen-m2-9'), procId, reglages });
      const ids = (p) => p.parties.flatMap((x) => x.etapes).map((e) => e.id);
      const k4 = pas('novastar-mctrl4k');
      const f = etapeNovaLCT(k4, '0.7');
      v.egal('MCTRL4K : étape fibre', f?.titre, 'Fibre, si le mur passe en fibre');
      v.vrai('MCTRL4K : OPT1 à OPT4 et CVT4K', /OPT1 porte les ports 1 à 8, OPT2 les ports 9 à 16 ; OPT3 copie OPT1 et OPT4 copie OPT2, en secours\./.test(f?.texte ?? '')
        && (f?.texte ?? '').includes('CVT4K'), f?.texte);
      v.vrai('MCTRL4K, 4 ports : une fibre, OPT1', (f?.texte ?? '').includes('Pour ce mur : OPT1 (ports 1 à 4)') && !(f?.texte ?? '').includes('OPT2 (ports'), f?.texte);
      v.egal('MCTRL4K : sources de la fibre', f?.sources.map((s) => `${s.id} ${s.ref}`), ['mctrl4k-1-2-1 p. 4', 'mctrl4k-manuel-1-2-1 p. 4 et 8', 'cvt4k-s-1-0-6 p. 3', 'formation-10 null']);
      const k4r = etapeNovaLCT(pas('novastar-mctrl4k', { redondance: true }), '0.7');
      v.vrai('MCTRL4K en redondance (colonnes paires : 6 ports) : secours 9 à 14 sur OPT2', (k4r?.texte ?? '').includes('Pour ce mur : OPT1 (ports 1 à 6) et OPT2 (ports 9 à 14)'), k4r?.texte);
      v.vrai('MCTRL4K : signature selon les fibres', k4r?.signature !== f?.signature);
      const r5 = etapeNovaLCT(pas('novastar-mctrl-r5'), '0.7');
      v.vrai('MCTRL R5 : OPT1 copie les ports 1 à 8, convertisseur à vérifier', (r5?.texte ?? '').includes('OPT1 copie les ports 1 à 8 ; OPT2 copie OPT1') && r5?.aVerifier === true, r5?.texte);
      const pro = pas('novastar-mctrl660-pro');
      const fp = etapeNovaLCT(pro, '0.7');
      v.vrai('MCTRL660 PRO : OPT1 et ses 6 ports, OPT2 en secours', (fp?.texte ?? '').includes('OPT1 porte les 6 ports ; OPT2 est le secours d\'OPT1') && fp?.aVerifier === true, fp?.texte);
      const mode = etapeNovaLCT(pro, 'P1.B.1a');
      v.vrai('MCTRL660 PRO : mode de travail', mode?.titre === 'Mode de travail : carte d\'envoi' && mode.texte.includes('Set Working Mode') && mode.texte.includes('sending card mode')
        && mode.texte.includes('fiber converter mode'), mode?.texte);
      v.egal('MCTRL660 PRO : sources du mode', mode?.sources.map((s) => `${s.id} ${s.ref}`), ['lct-5-5-0 § 5.5, p. 30 à 33', 'lct-5-8-1 § 5.5, p. 33 à 36', 'mctrl660-pro-1-4-1 p. 1']);
      const entree = etapeNovaLCT(pro, 'P1.B.2a');
      v.vrai('MCTRL660 PRO : secours de la source, facultatif', entree?.titre === 'Secours de la source (facultatif)' && entree.texte.includes('Source Backup Setting')
        && entree.texte.includes('Start source backup'), entree?.texte);
      v.vrai('MCTRL R5 : mode de travail et secours de la source, façade Input Backup', ids(pas('novastar-mctrl-r5')).includes('P1.B.1a')
        && (etapeNovaLCT(pas('novastar-mctrl-r5'), 'P1.B.2a')?.texte ?? '').includes('Input Backup'));
      const h9 = etapeNovaLCT(pas('novastar-h9'), 'P1.B.1a');
      v.vrai('H9 : mode de travail et ports optiques hot backup ou copy', (h9?.texte ?? '').includes('hot backup') && h9.texte.includes('copy'), h9?.texte);
      v.vrai('NovaPro UHD Jr : mode de travail', ids(pas('novastar-novapro-uhd-jr')).includes('P1.B.1a'));
      const h5 = etapeNovaLCT(pas('novastar-h5'), 'P1.B.6');
      v.vrai('série H : cartes de sortie de Data, ports par carte à vérifier', /carte(s)? H_20xRJ45/.test(h5?.texte ?? '') && (h5?.texte ?? '').includes('quels ports sont sur quelle carte') && h5.aVerifier === true, h5?.texte);
      const m660 = ids(pas('novastar-mctrl660'));
      v.egal('MCTRL660 : ni fibre, ni mode de travail, ni secours de la source', ['0.7', 'P1.B.1a', 'P1.B.2a'].filter((x) => m660.includes(x)), []);
    },
  },
  {
    id: 'R382',
    titre: 'NovaLCT pas à pas (18b) : un mur sur MCTRL4K choisi à la main dans Data a son pas à pas (cartes d\'envoi, 16 ports, Verify en redondance)',
    etape: '18b',
    verifier(v, contexte) {
      const p = pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', reglages: { redondance: true } });
      v.egal('pas à pas du MCTRL4K', [p?.processeur, p?.groupe.id, p?.parties.some((x) => x.processeur === 1)], ['MCTRL4K', 'carte-envoi', true]);
      v.vrai('redondance : Verify', (etapeNovaLCT(p, 'C.5')?.texte ?? '').includes('Verify'));
    },
  },
  {
    id: 'R383',
    titre: 'Config imposée, ports (18c1, spec § 4.1) : N ports principaux en colonnes entières, le plus égal possible, les plus chargés depuis le coin de départ (5 colonnes en 2 ports : 3 + 2) ; variante « Ma config (imposée) » en tête, retenue ; conseil de l\'appli inchangé, rappelé avec l\'écart ; N égal au conseil : « comme le conseil » ; sans option, rien ne change',
    etape: '18c1',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const sans = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche' });
      const t = imposerData(contexte, x, { ports: 2 });
      const vi = varianteImposee(t);
      v.egal('variante en tête', [t.variantes[0].mode, vi?.libelle, vi?.possible], ['imposee', 'Ma config (imposée)', true]);
      v.egal('conseil inchangé', [t.conseil, JSON.stringify(t.variantes.filter((y) => y.mode !== 'imposee')) === JSON.stringify(sans.variantes)], ['colonnes', true]);
      v.egal('retenue : la config imposée', t.retenue, 'imposee');
      v.egal('2 ports de 2 colonnes', colonnesDesPorts(vi), [[[1, 2], [3, 4]]]);
      v.egal('294 912 px chacun, 45,4 %', vi?.processeurs[0].ports.map((p) => [p.px, nombre(p.taux * 100, 1)]), [[294912, '45,4'], [294912, '45,4']]);
      if (vi) verifierPorts(v, vi, 16, x.e);
      v.egal('écart', [t.imposee?.ports, t.imposee?.conseil.ports, t.imposee?.ecart.valeur, t.imposee?.ecart.texte], [2, 1, 1, '1 port de plus']);
      v.egal('conseil rappelé', t.imposee?.texteConseil, `Conseil de l'appli : 1 port (${nombre(589824)} px, 90,7 %) ; écart : 1 port de plus.`);
      v.egal('contrôle', t.imposee?.texte, `2 ports imposés : port le plus chargé ${nombre(294912)} px pour ${nombre(650000)} px, ça passe.`);
      const cinq = exercice(contexte, 5, 4);
      v.egal('5 colonnes en 2 ports depuis la gauche : 3 + 2', colonnesDesPorts(varianteImposee(imposerData(contexte, cinq, { ports: 2 }))), [[[1, 2, 3], [4, 5]]]);
      v.egal('depuis la droite : 3 + 2 depuis le bord droit', colonnesDesPorts(varianteImposee(imposerData(contexte, cinq, { ports: 2 }, { depart: 'bas-droite' }))), [[[3, 4, 5], [1, 2]]]);
      const huit = imposerData(contexte, exercice(contexte, 8, 4), { ports: 3 });
      v.egal('8 colonnes en 3 ports : 3 + 3 + 2', colonnesDesPorts(varianteImposee(huit)), [[[1, 2, 3], [4, 5, 6], [7, 8]]]);
      const egal = imposerData(contexte, x, { ports: 1 });
      v.egal('N égal au conseil', [egal.imposee?.possible, egal.imposee?.ecart.valeur, egal.imposee?.ecart.texte], [true, 0, 'comme le conseil']);
      v.egal('sans option : ni config imposée ni variante retenue', ['imposee' in sans, 'retenue' in sans, sans.variantes.some((y) => y.mode === 'imposee')], [false, false, false]);
      const vide = imposerData(contexte, x, { ports: null });
      v.egal('ports vides, sans fibre : rien d\'imposé', [vide.imposee ?? null, vide.variantes.some((y) => y.mode === 'imposee')], [null, false]);
    },
  },
  {
    id: 'R384',
    titre: 'Config imposée, refus (18c1, spec § 4.1) : un port au-delà de sa capacité, plus de ports que de colonnes, plus de ports que le processeur (en redondance, ses ports principaux), 50 dalles par boucle Brompton, nombre illisible, mur en zones ; refus : la variante reste listée avec sa raison, le conseil reste retenu ; règle des 128 px des COEX recalculée',
    etape: '18c1',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const un = imposerData(contexte, exercice(contexte, 6, 4), { ports: 1 });
      v.egal('1 port pour 884 736 px : refus', [un.imposee?.possible, un.retenue, varianteImposee(un)?.possible], [false, 'colonnes', false]);
      v.vrai('raison', (un.imposee?.raison ?? '').includes(`Port 1 : ${nombre(884736)} px, plus que les ${nombre(650000)} px d'un port.`), un.imposee?.raison);
      v.egal('variante refusée : sa raison', varianteImposee(un)?.raison, un.imposee?.raison);
      v.egal('écart d\'un refus', un.imposee?.ecart.texte, '1 port de moins');
      v.egal('5 ports pour 4 colonnes', [imposerData(contexte, x, { ports: 5 }).imposee?.possible, imposerData(contexte, x, { ports: 5 }).imposee?.raison],
        [false, '5 ports pour 4 colonnes : une colonne serait coupée ; par rangées dans le Schéma.']);
      v.egal('17 ports : le MCTRL4K a 16 ports', imposerData(contexte, exercice(contexte, 18, 2), { ports: 17 }).imposee?.raison, '17 ports : le MCTRL4K a 16 ports.');
      v.egal('redondance : 9 ports principaux', imposerData(contexte, exercice(contexte, 18, 2, 'novastar-mctrl4k', { redondance: true }), { ports: 9 }).imposee?.raison,
        '9 ports : le MCTRL4K a 8 ports principaux en redondance.');
      v.egal('nombre illisible', [0, 2.5, -1, 1000].map((n) => imposerData(contexte, x, { ports: n }).imposee?.raison),
        Array(4).fill('Nombre de ports imposé : un nombre entier de 1 à 999, ou vide.'));
      const m64 = calculs.mur(DALLE_64, 2, 30);
      const s8 = calculs.evaluerProcesseur(m64, DALLE_64, processeurDeBase(contexte, 'brompton-s8'), { frequenceHz: 60, bits: 12, redondance: true });
      const boucle = imposerData(contexte, { dalle: DALLE_64, m: m64, e: s8 }, { ports: 1 });
      v.egal('S8 en redondance : 50 dalles par boucle', [s8.totaux.ports.colonnes, boucle.imposee?.possible], [2, false]);
      v.vrai('raison des 50 dalles', (boucle.imposee?.raison ?? '').includes('Port 1 : 60 dalles, plus que les 50 dalles d\'une boucle en redondance.'), boucle.imposee?.raison);
      const mx = calculs.mur(DALLE_64, 4, 10);
      const emx = calculs.evaluerProcesseur(mx, DALLE_64, processeurDeBase(contexte, 'coex-mx40-pro'), NOVASTAR_60_8);
      const vmx = varianteImposee(imposerData(contexte, { dalle: DALLE_64, m: mx, e: emx }, { ports: 4 }));
      v.vrai('MX40 Pro, 1 colonne de 64 px par port : capacité baissée de (128 − 64) × 640 px', vmx?.processeurs[0].ports.length === 4
        && vmx.processeurs[0].ports.every((p) => Math.abs(p.taux * emx.capacite - (p.px + 64 * 640)) < 1e-6), vmx?.processeurs[0].ports.map((p) => p.taux));
      const z = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 6 }, { nom: 'B', colonnes: 3, rangees: 6 }], { ecarts: 'main', ecartsPx: [84] });
      const ez = calculs.evaluerProcesseur(z, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      const tz = calculs.cablageData(z, DALLE_CAS_13, ez, { imposee: { ports: 2 } });
      v.egal('mur en zones : refusé en V1', [tz.imposee?.possible, tz.imposee?.raison, tz.retenue],
        [false, 'Config imposée : pas encore possible sur un mur en zones, de forme libre ou mixte ; le conseil de l\'appli reste.', 'colonnes']);
    },
  },
  {
    id: 'R385',
    titre: 'Config imposée, plusieurs processeurs et redondance (18c1, spec § 4.1, choix 1) : les N ports du mur répartis au prorata des colonnes de chaque processeur, au moins un chacun, le reste au plus fort reste ; en redondance, secours doublés (convention port p + moitié), alerte « retour de secours long » quand un port a un nombre impair de colonnes',
    etape: '18c1',
    verifier(v, contexte) {
      const deux = exercice(contexte, 18, 4, 'novastar-mctrl660');
      v.egal('MCTRL660, 18 × 4 : 2 processeurs de 9 colonnes', [deux.e.nombre, deux.e.groupes.map((g) => g.colonnes)], [2, [9, 9]]);
      const quatre = varianteImposee(imposerData(contexte, deux, { ports: 4 }));
      v.egal('4 ports : 2 par processeur, 5 + 4 colonnes', colonnesDesPorts(quatre), [[[1, 2, 3, 4, 5], [6, 7, 8, 9]], [[10, 11, 12, 13, 14], [15, 16, 17, 18]]]);
      v.egal('5 ports : 3 + 2', varianteImposee(imposerData(contexte, deux, { ports: 5 }))?.processeurs.map((p) => p.ports.length), [3, 2]);
      const dixSept = exercice(contexte, 17, 4, 'novastar-mctrl660');
      v.egal('17 colonnes : 9 + 8', dixSept.e.groupes.map((g) => g.colonnes), [9, 8]);
      v.egal('3 ports au prorata : 2 + 1', varianteImposee(imposerData(contexte, dixSept, { ports: 3 }))?.processeurs.map((p) => p.ports.length), [2, 1]);
      v.egal('1 port pour 2 processeurs', imposerData(contexte, deux, { ports: 1 }).imposee?.raison, '1 port pour 2 processeurs : au moins un port par processeur.');
      const red = varianteImposee(imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { ports: 2 }));
      v.egal('redondance : ports 1 et 2, secours 9 et 10', red?.processeurs[0].ports.map((p) => [p.numero, p.secours?.numero, p.secours?.convention]), [[1, 9, true], [2, 10, true]]);
      v.egal('colonnes paires : pas de retour long', [red?.portsSecours, red?.alertes.some((a) => a.includes('retour de secours long'))], [2, false]);
      const impair = varianteImposee(imposerData(contexte, exercice(contexte, 5, 4, 'novastar-mctrl4k', { redondance: true }), { ports: 2 }));
      v.vrai('3 + 2 colonnes en redondance : retour de secours long', impair?.alertes.some((a) => a.includes('retour de secours long')), impair?.alertes);
    },
  },
  {
    id: 'R386',
    titre: 'Config imposée, lignes (18c1, spec § 4.2) : N lignes en colonnes entières, le plus égal possible, même sens que la data ; refus d\'une ligne au-delà de la puissance utile ou du chaînage, de plus de lignes que de colonnes, d\'un mur en zones ; triphasé : la ligne la plus chargée sur la phase la moins chargée, écart entre phases ; courant d\'appel par ligne ; conseil inchangé, rappelé avec l\'écart',
    etape: '18c1',
    verifier(v, contexte) {
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const m5 = calculs.mur(upad, 5, 4);
      const mono = calculs.electricite(m5, upad, { arrivee: { type: 'mono', intensiteA: 32 }, depart: 'bas-gauche' });
      const sans = calculs.cablageElec(m5, upad, mono);
      const t = calculs.cablageElec(m5, upad, mono, { imposee: { lignes: 3 } });
      const vi = varianteImposee(t);
      v.egal('variante en tête, retenue, conseil inchangé', [t.variantes[0].mode, vi?.libelle, t.retenue, t.conseil,
        JSON.stringify(t.variantes.filter((y) => y.mode !== 'imposee')) === JSON.stringify(sans.variantes)], ['imposee', 'Ma config (imposée)', 'imposee', 'colonnes', true]);
      v.egal('3 lignes : 2 + 2 + 1 colonnes', [vi?.lignesDetail.map((l) => colonnesDe(l.dalles).sort((a, b) => a - b)), vi?.lignesDetail.map((l) => l.puissanceW)],
        [[[1, 2], [3, 4], [5]], [1320, 1320, 660]]);
      if (vi) verifierLignes(v, vi, 20, 2816, null);
      v.egal('conseil et écart', [t.imposee?.conseil.lignes, t.imposee?.ecart.texte, t.imposee?.texteConseil],
        [2, '1 ligne de plus', 'Conseil de l\'appli : 2 lignes ; écart : 1 ligne de plus.']);
      const un = calculs.cablageElec(m5, upad, mono, { imposee: { lignes: 1 } });
      v.egal('1 ligne de 3 300 W : refus', [un.imposee?.possible, un.retenue, un.imposee?.raison],
        [false, 'colonnes', `Ligne 1 : ${nombre(3300)} W, plus que les ${nombre(2816)} W utiles d'une ligne.`]);
      v.egal('6 lignes pour 5 colonnes', calculs.cablageElec(m5, upad, mono, { imposee: { lignes: 6 } }).imposee?.raison,
        '6 lignes pour 5 colonnes : une colonne serait coupée ; par rangées dans le Schéma.');
      v.egal('nombre illisible', calculs.cablageElec(m5, upad, mono, { imposee: { lignes: 0 } }).imposee?.raison, 'Nombre de lignes imposé : un nombre entier de 1 à 999, ou vide.');
      const mc = calculs.mur(DALLE_100W_CHAINAGE, 2, 4);
      const ec = calculs.electricite(mc, DALLE_100W_CHAINAGE, { arrivee: { type: 'mono', intensiteA: 32 } });
      v.egal('chaînage de 7 dalles', calculs.cablageElec(mc, DALLE_100W_CHAINAGE, ec, { imposee: { lignes: 1 } }).imposee?.raison,
        'Ligne 1 : 8 dalles, plus que les 7 dalles du chaînage power de la fiche.');
      const tri = calculs.electricite(m5, upad, { arrivee: { type: 'tri', intensiteA: 32 }, depart: 'bas-gauche' });
      const v4 = varianteImposee(calculs.cablageElec(m5, upad, tri, { imposee: { lignes: 4 } }));
      v.egal('triphasé, 4 lignes : 2 + 1 + 1 + 1, phases', [v4?.lignesDetail.map((l) => l.puissanceW), v4?.lignesDetail.map((l) => l.phase), v4?.phases.map((p) => p.puissanceW)],
        [[1320, 660, 660, 660], [1, 2, 3, 2], [1320, 1320, 660]]);
      v.egal('écart entre phases', v4 && nombre(v4.ecartPhasesPourcent, 1), '50,0');
      const ma = calculs.mur(DALLE_APPEL, 6, 4);
      const ea = calculs.electricite(ma, DALLE_APPEL, { arrivee: { type: 'mono', intensiteA: 32 }, courbe: 'B' });
      const va = varianteImposee(calculs.cablageElec(ma, DALLE_APPEL, ea, { imposee: { lignes: 2 } }));
      v.egal('courant d\'appel par ligne : 12 dalles de 5 A, seuil de 48 A en courbe B', [va?.appel?.picLigneA, va?.appel?.seuilA, va?.appel?.ok], [60, 48, false]);
      v.vrai('alerte du courant d\'appel', va?.alertes.some((a) => a.startsWith('Courant d\'appel : jusqu\'à 60 A sur une ligne')), va?.alertes);
      const z = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 6 }, { nom: 'B', colonnes: 3, rangees: 6 }], { ecarts: 'main', ecartsPx: [84] });
      const tz = calculs.cablageElec(z, DALLE_CAS_13, calculs.electricite(z, DALLE_CAS_13, {}), { imposee: { lignes: 2 } });
      v.egal('mur en zones : refusé en V1, le conseil reste retenu', [tz.imposee?.possible, tz.imposee?.raison, tz.retenue === tz.conseil],
        [false, 'Config imposée : pas encore possible sur un mur en zones, de forme libre ou mixte ; le conseil de l\'appli reste.', true]);
    },
  },
  {
    id: 'R387',
    titre: 'Config imposée, passer en fibre (18c1, spec § 4.3, choix A, C, D) : le convertisseur de la fiche du processeur, par processeur (MCTRL4K : CVT4K, ports non utilisés, fibres OPT ; VX1000 : CVT10 ; MCTRL660 Pro et MCTRL R5 : CVT10 de la base, à confirmer) ; sans sortie fibre (MCTRL660) : une paire de CVT310 par port, CVT320 au choix ; SX40 : déjà en fibre ; S4 : une paire de transceivers fibre Gigabit Ethernet par port (18c3, manuel Tessera ; changé avec l\'accord de l\'utilisateur) ; le cuivre part du convertisseur (plus d\'alerte des 100 m), la portée de la fibre est contrôlée (la plus courte des fiches) ; fibre sans nombre de ports : les ports du conseil',
    etape: '18c1',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const t = imposerData(contexte, x, { ports: 2, fibre: true }, { distanceRegieM: 150 });
      const f = t.imposee?.fibre;
      v.egal('MCTRL4K : 1 CVT4K, 14 ports non utilisés, fibre OPT1', [f?.possible, f?.modele, f?.convertisseurs, f?.portsNonUtilises, f?.fibres, f?.fibresSecours],
        [true, 'CVT4K', 1, 14, ['OPT1'], []]);
      const vi = varianteImposee(t);
      const colonnes = t.variantes.find((y) => y.mode === 'colonnes');
      v.vrai('cuivre depuis le CVT4K : l\'alerte des 100 m disparaît (elle reste sur le conseil en cuivre)',
        !vi?.alertes.some((a) => a.includes('100 m')) && colonnes.alertes.some((a) => a.includes('100 m')), vi?.alertes);
      v.proche('fibre : 150 m et 10 % de mou', vi?.processeurs[0].ports[0].fibreM, 165, 1e-9);
      v.vrai('cuivre : le trajet au pied du mur seulement', vi?.processeurs[0].ports[0].longueurCuivreM < 5, vi?.processeurs[0].ports[0].longueurCuivreM);
      v.egal('portée : la plus courte des fiches', [f?.porteeM, vi?.alertes.some((a) => a.startsWith('Fibre de'))], [300, false]);
      const loin = varianteImposee(imposerData(contexte, x, { ports: 2, fibre: true }, { distanceRegieM: 400 }));
      v.vrai('fibre de 440 m : au-delà des 300 m du CVT4K', loin?.alertes.some((a) => a.startsWith('Fibre de 440 m') && a.includes('300 m') && a.includes('CVT4K')), loin?.alertes);
      const fr = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('MCTRL4K en redondance : 12 ports non utilisés, OPT1 et OPT2, OPT3 et OPT4 en secours', [fr?.convertisseurs, fr?.portsNonUtilises, fr?.fibres, fr?.fibresSecours],
        [1, 12, ['OPT1', 'OPT2'], ['OPT3', 'OPT4']]);
      const vx = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-vx1000'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('VX1000 : 1 CVT10, 8 ports non utilisés', [vx?.modele, vx?.convertisseurs, vx?.portsNonUtilises, vx?.aConfirmer], ['CVT10', 1, 8, false]);
      const m660 = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('MCTRL660 : une paire de CVT310 par port', [m660?.modele, m660?.paires, m660?.convertisseurs, m660?.porteeM], ['CVT310', 2, 4, 550]);
      const m320 = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true, paire: 'novastar-cvt320' }).imposee?.fibre;
      v.egal('CVT320 au choix', [m320?.modele, m320?.paires, m320?.porteeM], ['CVT320', 2, 20000]);
      const pro = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl660-pro'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('MCTRL660 Pro : CVT10 de la base, à confirmer, fibre OPT1', [pro?.modele, pro?.convertisseurs, pro?.aConfirmer, pro?.fibres], ['CVT10', 1, true, ['OPT1']]);
      v.vrai('MCTRL660 Pro : la fiche le dit aussi convertisseur', (pro?.texte ?? '').includes('à confirmer') && (pro?.texte ?? '').includes('fiber converter'), pro?.texte);
      const r5 = imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl-r5'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('MCTRL R5 : CVT10 de la base, à confirmer', [r5?.modele, r5?.aConfirmer], ['CVT10', true]);
      const bp2 = (procId) => exercice(contexte, 6, 4, procId, { bits: 12 }, 'roe-bp2-v2');
      const sx = imposerData(contexte, bp2('brompton-sx40'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('SX40 : déjà en fibre', [sx?.deja, sx?.texte], [true, 'Le SX40 passe déjà en fibre par ses XD : la case « Passer en fibre » ne change rien.']);
      const s4 = imposerData(contexte, bp2('brompton-s4'), { ports: 3, fibre: true });
      v.egal('S4 : une paire de transceivers fibre par port, 2 nœuds par trajet, la config reste', [s4.imposee?.fibre.possible, s4.imposee?.fibre.modele, s4.imposee?.fibre.paires,
        s4.imposee?.fibre.noeuds, s4.imposee?.possible], [true, 'transceivers fibre Gigabit Ethernet', 3, 2, true]);
      const seule = imposerData(contexte, x, { ports: null, fibre: true });
      v.egal('fibre sans nombre de ports : le conseil en fibre', [seule.imposee?.possible, seule.imposee?.ports, varianteImposee(seule)?.ports, seule.imposee?.ecart.texte, seule.imposee?.fibre.convertisseurs],
        [true, null, 1, 'comme le conseil', 1]);
    },
  },
  {
    id: 'R388',
    titre: 'Config imposée, textes copiés (18c2, spec § 4.4) : Data « Ports : 2 (imposé ; conseil de l\'appli : 1) », le contrôle et la fibre ; refus avec sa raison et « conseil de l\'appli retenu » ; fibre seule ; Élec « Lignes : 2 (imposé ; conseil de l\'appli : 1) » ; dans les textes de Data et d\'Élec, après les lignes du conseil ; Schéma : la variante retenue, « Ma config (imposée) », sans choix à la main',
    etape: '18c2',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const t = imposerData(contexte, x, { ports: 2, fibre: true });
      v.egal('Data, config imposée', resumes.lignesConfigData(t.imposee), [
        'Ports : 2 (imposé ; conseil de l\'appli : 1)',
        `Ma config : 2 ports imposés : port le plus chargé ${nombre(294912)} px pour ${nombre(650000)} px, ça passe.`,
        'Fibre (imposée) : 1 CVT4K au pied du mur (16 ports, 14 non utilisés) ; fibre OPT1 (ports 1 à 2).',
      ]);
      const refus = imposerData(contexte, x, { ports: 5 });
      v.egal('Data, config refusée', resumes.lignesConfigData(refus.imposee),
        ['Config imposée refusée : 5 ports pour 4 colonnes : une colonne serait coupée ; par rangées dans le Schéma. Conseil de l\'appli retenu.']);
      v.egal('Data, fibre seule', resumes.lignesConfigData(imposerData(contexte, x, { ports: null, fibre: true }).imposee),
        ['Fibre (imposée) : 1 CVT4K au pied du mur (16 ports, 15 non utilisés) ; fibre OPT1 (port 1).']);
      v.egal('sans config imposée : rien', [resumes.lignesConfigData(null), resumes.lignesConfigElec(null)], [[], []]);
      const texteData = resumes.resumeData(x.e, { imposee: t.imposee }).split('\n');
      const iConseil = texteData.indexOf('Ports en colonnes entières : 1');
      v.vrai('texte de Data : la config imposée après les ports du conseil', iConseil >= 0 && texteData[iConseil + 1] === 'Ports : 2 (imposé ; conseil de l\'appli : 1)', texteData.join(' | '));
      const elec = calculs.electricite(x.m, x.dalle, { arrivee: { type: 'mono', intensiteA: 16 }, depart: 'bas-gauche' });
      const c = calculs.cablageElec(x.m, x.dalle, elec, { imposee: { lignes: 2 } });
      v.egal('Élec, config imposée', resumes.lignesConfigElec(c.imposee), ['Lignes : 2 (imposé ; conseil de l\'appli : 1)']);
      v.egal('Élec, config refusée', resumes.lignesConfigElec(calculs.cablageElec(x.m, x.dalle, elec, { imposee: { lignes: 5 } }).imposee),
        ['Config imposée refusée : 5 lignes pour 4 colonnes : une colonne serait coupée ; par rangées dans le Schéma. Conseil de l\'appli retenu.']);
      const texteElec = resumes.resumeElec(elec, { dalle: x.dalle, mur: x.m, imposee: c.imposee }).split('\n');
      const iLignes = texteElec.indexOf('Lignes en colonnes entières : 1');
      v.vrai('texte d\'Élec : la config imposée après les lignes du conseil', iLignes >= 0 && texteElec[iLignes + 1] === 'Lignes : 2 (imposé ; conseil de l\'appli : 1)', texteElec.join(' | '));
      const cablage = resumes.resumeCablage({ data: t, elec: c }).split('\n');
      v.vrai('Schéma : variantes retenues, « Ma config (imposée) »', cablage.includes('Data : Ma config (imposée), départ en bas à gauche')
        && cablage.some((l) => l.startsWith('Élec : Ma config (imposée), départ')), cablage.join(' | '));
    },
  },
  {
    id: 'R389',
    titre: 'Config imposée dans le pas à pas NovaLCT (18c3, spec § 4.4) : en fibre, l\'étape 0.7 devient « Fibre : ta config (imposée) » (convertisseur, nombre, fibres et ports du mur ; aussi pour le VX1000 et ses CVT10, le MCTRL660 et ses paires de CVT310) ; sa signature suit la fibre ; un pas par port imposé ; « Câblage : Ma config (imposée), 2 ports… » en tête, dans le texte copié et le résumé de la fiche régie ; sans config imposée, rien ne change',
    etape: '18c3',
    verifier(v, contexte) {
      const k4 = pasAPasImpose(contexte, 'novastar-mctrl4k', { ports: 2, fibre: true });
      const f = etapeNovaLCT(k4, '0.7');
      v.egal('MCTRL4K en fibre : titre', f?.titre, 'Fibre : ta config (imposée)');
      v.vrai('MCTRL4K en fibre : CVT4K, OPT1 et ses ports', (f?.texte ?? '').startsWith('Tu passes en fibre (ta config) : 1 CVT4K au pied du mur (16 ports, 14 non utilisés) ; fibre OPT1 (ports 1 à 2).')
        && (f?.texte ?? '').includes('Pour ce mur : OPT1 (ports 1 à 2)'), f?.texte);
      v.vrai('MCTRL4K en fibre : sources de la fiche', (f?.sources ?? []).some((s) => s.id === 'cvt4k-s-1-0-6'), JSON.stringify(f?.sources));
      v.egal('un pas par port imposé', k4.parties.flatMap((x) => x.etapes).map((e) => e.id).filter((id) => /\.B\.7\.\d+$/.test(id)), ['P1.B.7.1', 'P1.B.7.2']);
      v.egal('en tête', k4.imposee, 'Ma config (imposée), 2 ports, en fibre (1 CVT4K) ; le conseil de l\'appli reste dans Data.');
      const cuivre = pasAPasImpose(contexte, 'novastar-mctrl4k', { ports: 2 });
      v.egal('MCTRL4K en cuivre : l\'étape conditionnelle, « en fibre » absent', [etapeNovaLCT(cuivre, '0.7')?.titre, cuivre.imposee],
        ['Fibre, si le mur passe en fibre', 'Ma config (imposée), 2 ports ; le conseil de l\'appli reste dans Data.']);
      v.vrai('signature : la fibre décoche l\'étape', etapeNovaLCT(cuivre, '0.7')?.signature !== f?.signature);
      v.vrai('texte copié et résumé de la fiche régie', novalct.texteNovaLCT(k4, {}).split('\n').includes(`Câblage : ${k4.imposee}`)
        && novalct.resumeNovaLCT(k4, {}).split('\n').includes(`Câblage : ${k4.imposee}`), novalct.texteNovaLCT(k4, {}).split('\n').slice(0, 6).join(' | '));
      const vx = etapeNovaLCT(pasAPasImpose(contexte, 'novastar-vx1000', { ports: 2, fibre: true }), '0.7');
      v.vrai('VX1000 en fibre : CVT10, cahier des charges', (vx?.texte ?? '').startsWith('Tu passes en fibre (ta config) : 1 CVT10 au pied du mur')
        && (vx?.sources ?? []).some((s) => s.id === 'cdc'), vx?.texte);
      const m660 = etapeNovaLCT(pasAPasImpose(contexte, 'novastar-mctrl660', { ports: 2, fibre: true }), '0.7');
      v.vrai('MCTRL660 en fibre : paires de CVT310', (m660?.texte ?? '').startsWith('Tu passes en fibre (ta config) : 2 paires de CVT310'), m660?.texte);
      const conseil = pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', dalle: dalleDeBase(contexte, 'unilumin-upad-iv-2-6'), colonnes: 4, lignes: 4 });
      v.egal('sans config imposée : rien en tête, étape conditionnelle', [conseil.imposee, etapeNovaLCT(conseil, '0.7')?.titre], [null, 'Fibre, si le mur passe en fibre']);
    },
  },
  {
    id: 'R390',
    titre: 'Config imposée dans le guide de montage (18c3, choix 4) : en fibre, chaque câble de tête part du convertisseur au pied du mur (« du port 1 du CVT4K, au pied du mur », « depuis son CVT310 au pied du mur ») ; la fibre change la signature du port (case décochée avec le bandeau) ; sans fibre, un port imposé identique à celui du conseil garde sa signature',
    etape: '18c3',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const variante = (t) => t.variantes.find((y) => y.mode === t.retenue);
      const fibre = montage.etapesData(variante(imposerData(contexte, x, { ports: 2, fibre: true })), { depart: 'bas-gauche' });
      v.egal('port 1 en fibre', fibre[0]?.phrase, '8 dalles, de C1 R4 à C2 R4. Câble de tête du port 1 du CVT4K, au pied du mur, jusqu\'à C1 R4, puis suis les numéros.');
      const cuivre = montage.etapesData(variante(imposerData(contexte, x, { ports: 2 })), { depart: 'bas-gauche' });
      v.egal('port 1 en cuivre', cuivre[0]?.phrase, '8 dalles, de C1 R4 à C2 R4. Câble de tête du port 1 jusqu\'à C1 R4, puis suis les numéros.');
      v.vrai('la fibre change la signature', fibre[0]?.signature !== cuivre[0]?.signature);
      const conseil = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche' });
      const egal = montage.etapesData(variante(imposerData(contexte, x, { ports: 1 })), { depart: 'bas-gauche' });
      v.egal('sans fibre, même port que le conseil : même signature', egal[0]?.signature, montage.etapesData(conseil.variantes.find((y) => y.mode === 'colonnes'), { depart: 'bas-gauche' })[0]?.signature);
      const paires = montage.etapesData(variante(imposerData(contexte, exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true })), { depart: 'bas-gauche' });
      v.vrai('paires de CVT310', (paires[0]?.phrase ?? '').includes('Câble de tête du port 1, depuis son CVT310 au pied du mur, jusqu\'à C1 R4'), paires[0]?.phrase);
    },
  },
  {
    id: 'R391',
    titre: 'Config imposée dans la liste de matériel (18c3, choix 3) : en fibre, les convertisseurs comptés (plus de note « si fibre »), les fibres (OPT des ports, secours en redondance ; une par paire), les câbles de tête depuis le convertisseur, pas de multipaire ; note « Config imposée : 2 ports, 2 lignes, fibre. » ; transceivers des Brompton',
    etape: '18c3',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const liste = (xx, imposee, lignes = 2) => {
        const t = imposerData(contexte, xx, imposee, { distanceRegieM: 50 });
        const elec = calculs.electricite(xx.m, xx.dalle, { arrivee: { type: 'mono', intensiteA: 16 }, depart: 'bas-gauche' });
        const c = calculs.cablageElec(xx.m, xx.dalle, elec, { imposee: { lignes } });
        const vd = t.variantes.find((y) => y.mode === t.retenue);
        const ve = c.variantes.find((y) => y.mode === c.retenue);
        return calculs.listeMateriel({ mur: xx.m, dalle: xx.dalle, data: { evaluation: xx.e, variante: vd, distanceRegieM: 50, margeMou: 0.1 }, elec: { variante: ve, distribution: null, departA: 16 } })
          .sections.find((s) => s.id === 'data');
      };
      const total = (s, designation) => s.lignes.filter((l) => l.designation === designation).reduce((n, l) => n + l.quantite, 0);
      const k4 = liste(x, { ports: 2, fibre: true });
      v.egal('MCTRL4K : 1 CVT4K, 1 fibre, 2 câbles de tête, pas de multipaire', [total(k4, 'CVT4K'), total(k4, 'Fibre jusqu\'au CVT4K'), total(k4, 'Câble de tête RJ45'), total(k4, 'Multipaire 8 RJ45')], [1, 1, 2, 0]);
      v.vrai('CVT4K : détail', k4.lignes.find((l) => l.designation === 'CVT4K')?.detail === 'config imposée, en fibre ; 14 ports non utilisés', k4.lignes.find((l) => l.designation === 'CVT4K')?.detail);
      v.vrai('note de la config imposée, plus de « si fibre »', k4.notes.includes('Config imposée : 2 ports, 2 lignes, fibre.') && !k4.notes.some((n) => n.startsWith('Si tu passes en fibre')), k4.notes.join(' | '));
      const red = liste(exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { ports: 2, fibre: true });
      v.egal('MCTRL4K en redondance : 4 fibres (OPT1 à OPT4)', total(red, 'Fibre jusqu\'au CVT4K'), 4);
      const m660 = liste(exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true });
      v.egal('MCTRL660 : 4 CVT310, 2 fibres', [total(m660, 'CVT310'), total(m660, 'Fibre jusqu\'au CVT310')], [4, 2]);
      const cuivre = liste(x, { ports: 2 }, 1);
      v.vrai('sans fibre : la note dit 2 ports et 1 ligne, la régie loin en multipaire', cuivre.notes.includes('Config imposée : 2 ports, 1 ligne.') && total(cuivre, 'Multipaire 8 RJ45') === 1, cuivre.notes.join(' | '));
      const bp2 = exercice(contexte, 6, 4, 'brompton-s4', { bits: 12 }, 'roe-bp2-v2');
      const s4 = liste(bp2, { ports: 3, fibre: true });
      const tr = s4.lignes.find((l) => l.designation === 'Transceiver fibre Gigabit Ethernet');
      v.egal('S4 : 6 transceivers, 3 fibres', [tr?.quantite, total(s4, 'Fibre jusqu\'au transceiver')], [6, 3]);
      v.vrai('S4 : modèle à choisir', /modèle à choisir/.test(tr?.detail ?? ''), tr?.detail);
    },
  },
  {
    id: 'R392',
    titre: 'Config imposée dans les fiches par métier (18c3, spec § 4.4) : synthèse du chef de projet avec « Ports : 2 (imposé ; …) », la fibre et « Lignes : 2 (imposé ; …) » ; fiche régie avec les ports imposés et la fibre ; config refusée dans la synthèse',
    etape: '18c3',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const t = imposerData(contexte, x, { ports: 2, fibre: true });
      const elec = calculs.electricite(x.m, x.dalle, { arrivee: { type: 'mono', intensiteA: 16 }, depart: 'bas-gauche' });
      const c = calculs.cablageElec(x.m, x.dalle, elec, { imposee: { lignes: 2 } });
      const textes = { ...textesEssai(contexte), data: resumes.resumeData(x.e, { imposee: t.imposee }), elec: resumes.resumeElec(elec, { dalle: x.dalle, mur: x.m, imposee: c.imposee }) };
      const murs = [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-21T10:00:00.000Z' }, materiel: null }];
      const fiche = (metier, m = murs) => fichesMetier.ficheMetier(metier, { presta: { nom: 'Presta A', murs: [] }, murs: m, date: new Date(2026, 9, 21, 12) });
      const chef = fiche('chefProjet').blocs[0].lignes.map((l) => `${l.libelle} : ${l.valeur}`);
      v.vrai('chef de projet : ports, fibre et lignes imposés', ['Ports : 2 (imposé ; conseil de l\'appli : 1)', 'Lignes : 2 (imposé ; conseil de l\'appli : 1)'].every((l) => chef.includes(l))
        && chef.some((l) => l.startsWith('Fibre (imposée) : 1 CVT4K')), chef.join(' | '));
      const regie = fichesMetier.lignesDataRegie(textes.data).map((l) => `${l.libelle} : ${l.valeur}`);
      v.vrai('régie : ports imposés et fibre', regie.includes('Ports : 2 (imposé ; conseil de l\'appli : 1)') && regie.some((l) => l.startsWith('Fibre (imposée) :')), regie.join(' | '));
      const refus = { ...textes, data: resumes.resumeData(x.e, { imposee: imposerData(contexte, x, { ports: 5 }).imposee }) };
      const chefRefus = fiche('chefProjet', [{ nom: 'Mur 1', fiche: { textes: refus, calculeeLe: '2026-10-21T10:00:00.000Z' }, materiel: null }]).blocs[0].lignes;
      v.vrai('chef de projet : config refusée', chefRefus.some((l) => l.libelle === 'Config imposée refusée'), chefRefus.map((l) => l.libelle).join(' | '));
    },
  },
  {
    id: 'R393',
    titre: 'Config imposée, fibre des Brompton S4, S8, M2 et T1 (18c3, choix 1 ; manuel Tessera V3.5, § 13.1.2, p. 220) : une paire de transceivers fibre Gigabit Ethernet par port utilisé, secours compris, modèle à choisir, portée selon le transceiver ; 2 nœuds par trajet dans le contrôle du réseau Brompton (5 au plus) ; SX40 inchangé ; Colorlight sans sortie fibre : rien dans la base',
    etape: '18c3',
    verifier(v, contexte) {
      const bp2 = (procId, reglages = {}) => exercice(contexte, 6, 4, procId, { bits: 12, ...reglages }, 'roe-bp2-v2');
      const s4 = imposerData(contexte, bp2('brompton-s4'), { ports: 3, fibre: true }).imposee?.fibre;
      v.vrai('S4 : texte, source', (s4?.texte ?? '').startsWith('Passer en fibre : 3 paires de transceivers fibre Gigabit Ethernet, une par port')
        && (s4?.texte ?? '').includes('modèle à choisir') && (s4?.texte ?? '').includes('manuel Tessera V3.5, § 13.1.2, p. 220'), s4?.texte);
      v.egal('S4 : portée selon le transceiver, rien d\'inventé', [s4?.porteeM, s4?.aConfirmer, s4?.nombreFibres], [null, false, 3]);
      const s8 = imposerData(contexte, bp2('brompton-s8', { redondance: true }), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('S8 en redondance : secours compris', [s8?.paires, s8?.convertisseurs], [4, 8]);
      v.egal('réseau Brompton : 2 nœuds + 3 switches passent, + 4 refusés', [calculs.reseauBrompton({ switches: 3, convertisseursFibre: s4?.noeuds }).refus.length,
        calculs.reseauBrompton({ switches: 4, convertisseursFibre: s4?.noeuds }).refus.length], [0, 1]);
      const sx = imposerData(contexte, bp2('brompton-sx40'), { ports: 2, fibre: true }).imposee?.fibre;
      v.egal('SX40 : inchangé', [sx?.deja, sx?.noeuds ?? 0], [true, 0]);
      const m = calculs.mur(DALLE_64, 4, 4);
      const e = calculs.evaluerProcesseur(m, DALLE_64, processeurDeBase(contexte, 'colorlight-x16e'), { frequenceHz: 60, bits: 8 });
      v.egal('Colorlight X16E : rien dans la base', imposerData(contexte, { dalle: DALLE_64, m, e }, { ports: 2, fibre: true }).imposee?.fibre.texte,
        `Aucun convertisseur fibre dans la base pour le ${e.processeur.modele} : à vérifier.`);
    },
  },
  {
    id: 'R394',
    titre: 'Adresse de l\'ordinateur (19a, spec § 3.1, `adresseOrdinateur`) : mêmes trois premiers nombres que le processeur, dernier nombre 100 ou le premier libre au-dessus, masque 255.255.255.0, passerelle vide ; virgules du clavier lues comme des points ; .0 et .255 refusés, plages différentes refusées, texte illisible refusé avec la raison, 169.254 en alerte AutoIP, deux processeurs à la même adresse en alerte ; sans saisie, l\'exemple de la marque (Brompton 192.168.0.50, Novastar 192.168.0.10 du manuel VX1000), aucun pour les autres',
    etape: '19a',
    verifier(v) {
      const a = (x, o) => connexion.adresseOrdinateur(x, o);
      const r = a('192.168.0.10');
      v.egal('192.168.0.10 donne .100', [r.ok, r.adresse, r.masque, r.passerelle, r.exemple, r.processeurs], [true, '192.168.0.100', '255.255.255.0', '', false, ['192.168.0.10']]);
      v.egal('.100 pris : .101', a('192.168.0.100').adresse, '192.168.0.101');
      v.egal('.100 et .101 pris : .102', a('192.168.0.100 ; 192.168.0.101').adresse, '192.168.0.102');
      v.egal('liste d\'adresses', a(['10.0.0.100', '10.0.0.101']).adresse, '10.0.0.102');
      v.egal('de 100 à 254 pris : le premier libre en dessous', a(Array.from({ length: 155 }, (_, i) => `10.1.1.${100 + i}`)).adresse, '10.1.1.99');
      v.egal('virgules et espaces', [connexion.lireAdresses(' 192,168,0,10 '), a('192,168,0,10').adresse], [['192.168.0.10'], '192.168.0.100']);
      v.egal('deux adresses séparées par une virgule', connexion.lireAdresses('192.168.0.10, 192.168.0.11'), ['192.168.0.10', '192.168.0.11']);
      const ILLISIBLE = 'Tape l\'adresse lue sur le processeur, quatre nombres de 0 à 255 séparés par des points (192.168.0.10).';
      v.egal('texte illisible', ['abc', '192.168.0', '300.1.1.1', '192.168.0.1.5'].map((x) => [a(x).ok, a(x).erreur, a(x).adresse]), Array(4).fill([false, ILLISIBLE, null]));
      for (const x of ['192.168.0.0', '192.168.0.255']) {
        v.vrai(`${x} refusé`, !a(x).ok && (a(x).erreur ?? '').includes('adresse de réseau ou de diffusion'), a(x).erreur);
      }
      v.egal('deux plages', [a('192.168.0.10 192.168.1.10').ok, a('192.168.0.10 192.168.1.10').erreur],
        [false, 'Tes processeurs ne sont pas dans la même plage : règle-les d\'abord dans la même.']);
      const auto = a('169.254.12.7');
      v.vrai('169.254 : alerte AutoIP, pas d\'adresse proposée', auto.autoIP === true && auto.adresse === null
        && (auto.alertes ?? []).some((t) => t.includes('ne s\'est pas donné d\'adresse fixe') && t.includes('DHCP')), (auto.alertes ?? []).join(' | '));
      v.vrai('même adresse sur deux processeurs : alerte', (a('192.168.0.10 192.168.0.10').alertes ?? []).some((t) => t.includes('même adresse')));
      v.vrai('masque supposé', (r.note ?? '').includes('si le processeur affiche un autre masque, recopie-le'), r.note);
      v.vrai('sources : choix de conception et règle commune', ['conception', 'tessera-3-5', 'vx1000-1-5-0'].every((id) => (r.sources ?? []).some((s) => s.id === id)),
        (r.sources ?? []).map((s) => s.id).join(', '));
      const br = a('', { marque: 'brompton' });
      v.egal('vide, Brompton : 192.168.0.50 de la fiche', [br.ok, br.exemple, br.processeurs, br.adresse], [true, true, ['192.168.0.50'], '192.168.0.100']);
      const ns = a('', { marque: 'novastar' });
      v.vrai('vide, Novastar : exemple du VX1000, lis la tienne', ns.exemple === true && ns.processeurs?.[0] === '192.168.0.10' && ns.adresse === '192.168.0.100'
        && (ns.message ?? '').includes('lis la tienne'), ns.message);
      for (const marque of ['coex', 'megapixel', 'colorlight', 'autres', 'toutes', null]) {
        const x = a('', { marque });
        v.egal(`vide, ${marque} : pas d'exemple`, [x.ok, x.adresse, x.message],
          [false, null, 'Lis l\'adresse sur l\'écran du processeur et tape-la : l\'appli te donne celle de ton ordinateur.']);
      }
    },
  },
  {
    id: 'R395',
    titre: 'Port de contrôle et adresse de chaque processeur (19a, spec § 3.1, `CONTROLE_PROCESSEURS`) : MCTRL4K, MCTRL660 PRO, MCTRL R5, VX1000, MX40 Pro, Tessera (SX40, S8, S4, M2, T1) et HELIOS, chaque entrée sourcée par le manuel ou la fiche du modèle ; page web en dépannage pour le MCTRL4K et le MCTRL660 PRO ; un modèle absent : « vois la fiche du processeur », à vérifier',
    etape: '19a',
    verifier(v, contexte) {
      const table = connexion.CONTROLE_PROCESSEURS ?? [];
      const ids = table.flatMap((c) => c.ids);
      v.egal('modèles couverts', [...ids].sort(), ['brompton-m2', 'brompton-s4', 'brompton-s8', 'brompton-sx40', 'brompton-t1', 'coex-mx40-pro',
        'megapixel-helios-4k', 'megapixel-helios-8k', 'megapixel-helios-jr', 'novastar-mctrl-r5', 'novastar-mctrl4k', 'novastar-mctrl660-pro', 'novastar-vx1000']);
      const base = baseProcesseurs(contexte).processeurs.map((p) => p.id);
      v.egal('modèles de la base', ids.filter((id) => !base.includes(id)), []);
      v.egal('chaque entrée a une source connue', table.filter((c) => !c.sources.length || c.sources.some((s) => !connexion.SOURCES_CONNEXION[s.id])).map((c) => c.nom), []);
      const k4 = connexion.controleProcesseur('novastar-mctrl4k');
      v.vrai('MCTRL4K : Control ETHERNET, adresse en haut à droite, page web', k4.port.includes('Control ETHERNET') && k4.adresse.includes('en haut à droite de son écran d\'accueil')
        && k4.web === true && k4.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1'), JSON.stringify(k4));
      v.egal('page web : MCTRL4K et MCTRL660 PRO seulement', table.filter((c) => c.web).flatMap((c) => c.ids), ['novastar-mctrl4k', 'novastar-mctrl660-pro']);
      const t = connexion.controleProcesseur('brompton-s8');
      v.vrai('Tessera : 192.168.0.50 par défaut', t.adresse.includes('192.168.0.50') && t.sources.some((s) => s.id === 'tessera-3-5'), t.adresse);
      v.vrai('VX1000 : façade et V-Can', connexion.controleProcesseur('novastar-vx1000').reglage.includes('V-Can'));
      v.vrai('HELIOS : écran LCD de la façade', connexion.controleProcesseur('megapixel-helios-4k').adresse.includes('LCD'));
      v.egal('adresse affichée à vérifier : MCTRL660 PRO et MX40 Pro', table.filter((c) => c.aVerifier).flatMap((c) => c.ids), ['novastar-mctrl660-pro', 'coex-mx40-pro']);
      const inconnu = connexion.controleProcesseur('novastar-mctrl660');
      v.egal('MCTRL660 classique : à vérifier', [inconnu.inconnu, inconnu.aVerifier, inconnu.texte], [true, true, 'Port de contrôle et adresse : vois la fiche du processeur.']);
      v.egal('aucun processeur : pareil', connexion.controleProcesseur(null).inconnu, true);
    },
  },
  {
    id: 'R396',
    titre: 'Chemin de l\'adresse IP sur Mac et sur Windows (19a, spec § 2.3, `cheminIP`) : aide Apple (Réglages Système > Réseau > le service > Détails > TCP/IP > Configurer IPv4 : Manuellement, adresse du routeur vide, OK ; retour en Utilisation de DHCP ; adaptateur Ethernet du manuel Tessera), aide Microsoft (Paramètres > Réseau & Internet > Ethernet > Attribution d\'adresse IP : Modifier > Manuel > IPv4, Passerelle vide, Enregistrer ; Adresse IPv4 ; retour en automatique), chemin du Panneau de configuration (manuel Tessera, annexe C) ; chaque étape sourcée',
    etape: '19a',
    verifier(v) {
      const texte = (c) => c.etapes.map((e) => e.texte).join(' ');
      const mac = connexion.cheminIP('mac', { adresse: '192.168.0.100' });
      v.egal('Mac : système et titre', [mac.systeme, mac.titre], ['mac', 'Sur ton Mac']);
      v.egal('Mac : libellés d\'Apple', ['adaptateur', 'Réglages Système', 'Réseau', 'Détails', 'TCP/IP', 'Configurer IPv4 : Manuellement', '192.168.0.100', '255.255.255.0',
        'adresse du routeur', 'OK'].filter((m) => !texte(mac).includes(m)), []);
      v.vrai('Mac : retour en Utilisation de DHCP', mac.apres.texte.includes('Utilisation de DHCP'), mac.apres.texte);
      const win = connexion.cheminIP('windows', { adresse: '192.168.0.100' });
      v.egal('Windows : système et titre', [win.systeme, win.titre], ['windows', 'Sur Windows']);
      v.egal('Windows : libellés de Microsoft et chemin du Panneau de configuration', ['Paramètres', 'Réseau & Internet', 'Ethernet', 'Attribution d\'adresse IP', 'Modifier', 'Manuel', 'IPv4',
        'Adresse IP', 'Masque de sous-réseau', 'Passerelle', 'Enregistrer', 'Adresse IPv4', '192.168.0.100', 'Panneau de configuration'].filter((m) => !texte(win).includes(m)), []);
      v.vrai('Windows : retour en automatique (DHCP)', win.apres.texte.includes('DHCP'), win.apres.texte);
      v.egal('chaque étape sourcée', [mac, win].flatMap((c) => [...c.etapes, c.apres])
        .filter((e) => !e.sources.length || e.sources.some((s) => !connexion.SOURCES_CONNEXION[s.id])).map((e) => e.texte), []);
      const ids = (c) => c.etapes.flatMap((e) => e.sources.map((s) => s.id));
      v.vrai('sources : Apple et Tessera pour le Mac, Microsoft et Tessera pour Windows', ['apple-tcpip-saisir', 'tessera-3-5'].every((id) => ids(mac).includes(id))
        && ['ms-reseau', 'tessera-3-5'].every((id) => ids(win).includes(id)), `${ids(mac)} / ${ids(win)}`);
      v.vrai('sans adresse : la même plage que le processeur', texte(connexion.cheminIP('mac')).includes('même plage que le processeur'), texte(connexion.cheminIP('mac')));
      v.egal('système inconnu : Mac', connexion.cheminIP('linux').systeme, 'mac');
    },
  },
  {
    id: 'R397',
    titre: 'Logiciels sur Mac (19a, spec § 2.1 et 2.2, `logicielsConnexion`) : NovaLCT Windows seulement, avec l\'alerte (Windows 11 pour Arm dans Parallels, pas de Boot Camp, pilote, Ethernet à essayer, PC Windows de secours) et la page web des MCTRL4K et MCTRL660 PRO ; V-Can macOS 12, VMP macOS 10.15 et Windows pour Arm refusé, Tessera Remote de même version que le processeur, interface web de HELIOS ; LEDVISION et Linsn, Kystar, Mooncell à vérifier ; chacun dit comment il montre le processeur trouvé',
    etape: '19a',
    verifier(v) {
      const l = connexion.logicielsConnexion();
      const par = (id) => l.find((x) => x.id === id) ?? {};
      v.egal('logiciels', l.map((x) => x.id), ['novalct', 'v-can', 'vmp', 'tessera-remote', 'helios', 'ledvision', 'autres']);
      v.egal('sur Mac', l.map((x) => x.mac), [false, true, true, true, true, null, null]);
      const n = par('novalct');
      v.egal('NovaLCT : alerte', ['Windows seulement', 'Windows 11 pour Arm dans Parallels', 'pas de Boot Camp', 'pilote', 'Ethernet', 'PC Windows de secours']
        .filter((m) => !(n.alerte ?? '').includes(m)), []);
      v.vrai('NovaLCT : page web du MCTRL4K et du MCTRL660 PRO, à vérifier', ['MCTRL4K', 'MCTRL660 PRO', 'à vérifier'].every((m) => (n.pageWeb ?? '').includes(m)), n.pageWeb);
      v.egal('NovaLCT : sources Apple, Microsoft et Novastar', ['apple-boot-camp', 'ms-mac-arm', 'ms-emulation-arm', 'ms-faq-arm', 'lct-5-8-1', 'vmp-1-5-0']
        .filter((id) => !(n.sources ?? []).some((s) => s.id === id)), []);
      v.vrai('VMP : macOS 10.15, Windows pour Arm refusé', ['macOS 10.15', 'Windows pour Arm refusé'].every((m) => (par('vmp').conditions ?? '').includes(m)), par('vmp').conditions);
      v.vrai('V-Can : macOS 12', (par('v-can').conditions ?? '').includes('macOS 12'), par('v-can').conditions);
      v.vrai('Tessera Remote : même version que le processeur', (par('tessera-remote').conditions ?? '').includes('même version que le processeur'), par('tessera-remote').conditions);
      v.egal('LEDVISION, Linsn, Kystar, Mooncell : à vérifier, sans source', ['ledvision', 'autres'].map((id) => [par(id).aVerifier, par(id).sources?.length]), [[true, 0], [true, 0]]);
      v.egal('les autres sourcés', l.filter((x) => !x.aVerifier && (!x.sources.length || x.sources.some((s) => !connexion.SOURCES_CONNEXION[s.id]))).map((x) => x.id), []);
      v.egal('chacun dit comment il montre le processeur trouvé', l.filter((x) => !x.aVerifier && !x.verifie).map((x) => x.id), []);
    },
  },
  {
    id: 'R398',
    titre: 'Fiche « Brancher l\'ordinateur au processeur » (19a, spec § 3.5, `ficheConnexion`, `texteConnexion`, `feuilleConnexion`) : réponse (« Mets ton ordinateur en 192.168.0.100, masque 255.255.255.0, passerelle vide. »), puis le câble, le chemin du système choisi, la vérification dans le logiciel de la marque, le retour en DHCP et les logiciels sur Mac (NovaLCT en tête) ; l\'autre système à part ; texte copié une information par ligne, sans tiret ; feuille du PDF',
    etape: '19a',
    verifier(v) {
      const f = connexion.ficheConnexion({ systeme: 'mac', marque: 'novastar', modele: 'novastar-mctrl4k', adresses: '' });
      v.egal('réponse', f.reponse, 'Mets ton ordinateur en 192.168.0.100, masque 255.255.255.0, passerelle vide.');
      v.egal('étapes', f.etapes.map((e) => e.titre), ['Le câble', 'Sur ton Mac', 'Vérifie dans le logiciel', 'Après la presta', 'Ton logiciel sur Mac ?']);
      v.egal('autre système à part', f.autre.systeme, 'windows');
      const lignes = (e) => e.lignes.map((l) => l.texte).join(' ');
      v.vrai('câble : Control ETHERNET du MCTRL4K, adaptateur sur le Mac', ['Control ETHERNET', 'MCTRL4K', 'adaptateur'].every((m) => lignes(f.etapes[0]).includes(m)), lignes(f.etapes[0]));
      v.vrai('vérifier : NovaLCT d\'abord', f.etapes[2].lignes[0].texte.startsWith('NovaLCT'), f.etapes[2].lignes[0].texte);
      v.vrai('après la presta : DHCP', lignes(f.etapes[3]).includes('Utilisation de DHCP'), lignes(f.etapes[3]));
      v.vrai('logiciels sur Mac : NovaLCT en tête avec son alerte', f.etapes[4].lignes[0].texte.startsWith('NovaLCT') && f.etapes[4].lignes[0].texte.includes('PC Windows de secours'), f.etapes[4].lignes[0].texte);
      v.vrai('chaque ligne sourcée ou à vérifier', f.etapes.flatMap((e) => e.lignes).every((l) => l.sources.length || l.aVerifier));
      const w = connexion.ficheConnexion({ systeme: 'windows', marque: 'brompton', adresses: '192.168.0.50' });
      v.egal('Windows, Brompton', [w.etapes[1].titre, w.reponse, w.autre.systeme], ['Sur Windows', 'Mets ton ordinateur en 192.168.0.100, masque 255.255.255.0, passerelle vide.', 'mac']);
      v.vrai('Brompton : câble direct, pas de Wi-Fi, Tessera Remote', ['Cat 5e', 'Wi-Fi'].every((m) => lignes(w.etapes[0]).includes(m)) && w.etapes[2].lignes[0].texte.startsWith('Tessera Remote'), lignes(w.etapes[0]));
      const toutes = connexion.ficheConnexion({ systeme: 'mac', marque: 'toutes' });
      v.vrai('Toutes : pas d\'exemple, chaque logiciel', toutes.adresse.ok === false && toutes.etapes[2].lignes.length >= 6, toutes.reponse);
      const autres = connexion.ficheConnexion({ systeme: 'mac', marque: 'autres' });
      v.vrai('Autres : vois la fiche, à vérifier', autres.etapes[2].lignes.some((l) => l.texte.includes('vois la fiche du processeur') && l.aVerifier));
      v.egal('saisie illisible : la raison à la place de la réponse', connexion.ficheConnexion({ systeme: 'mac', marque: 'novastar', adresses: 'abc' }).reponse,
        'Tape l\'adresse lue sur le processeur, quatre nombres de 0 à 255 séparés par des points (192.168.0.10).');
      const t = connexion.texteConnexion(f);
      const tl = t.split('\n');
      v.egal('texte : titre', tl[0], 'BRANCHER L\'ORDINATEUR AU PROCESSEUR');
      v.egal('texte : sans tiret de liste, tiret long ni ligne vide', tl.filter((x) => !x.trim() || /^[-•]/.test(x) || /[—–]/.test(x)), []);
      v.vrai('texte : réponse, chemin du Mac, sources', t.includes(f.reponse) && t.includes('Réglages Système') && t.includes('Source :'), t);
      const p = connexion.feuilleConnexion(f, { date: new Date(2026, 9, 22) });
      v.vrai('PDF : titre, en-tête, blocs', p.titre === 'Brancher l\'ordinateur au processeur' && p.entete.some(([l, x]) => l === 'Mon ordinateur' && x === 'Mac')
        && p.entete.some(([l, x]) => l === 'Date' && x === '22/10/2026') && p.blocs.length === 5, JSON.stringify(p.entete));
    },
  },
  {
    id: 'R399',
    titre: 'Pas à pas NovaLCT et ton ordinateur (19a, spec § 3.3) : étape 0.1 sur Mac (Windows 11 pour Arm dans Parallels, pas de Boot Camp, pilote, Ethernet, PC Windows de secours, à vérifier chez toi ; page web des MCTRL4K et MCTRL660 PRO), inchangée sur Windows ou sans choix ; étape 0.3 avec le port de contrôle et l\'adresse du modèle, le chemin du système choisi et l\'autre à part, « vois la fiche du processeur » pour un modèle hors de la table ; signatures inchangées ; texte copié, PDF et à blanc',
    etape: '19a',
    verifier(v, contexte) {
      const k4 = (systeme) => pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', options: systeme ? { systeme } : {} });
      const sans = k4(null);
      const mac = k4('mac');
      const win = k4('windows');
      const aujourdhui = etapeNovaLCT(sans, '0.1').texte;
      v.vrai('sans choix : 0.1 d\'aujourd\'hui', aujourdhui.startsWith('NovaLCT tourne sous Windows : prends un PC Windows avec NovaLCT.'), aujourdhui);
      v.egal('Windows : 0.1 d\'aujourd\'hui', [etapeNovaLCT(win, '0.1').texte, etapeNovaLCT(win, '0.1').aVerifier], [aujourdhui, false]);
      const m01 = etapeNovaLCT(mac, '0.1');
      v.egal('Mac : 0.1', ['NovaLCT tourne sous Windows seulement.', 'Windows 11 pour Arm dans Parallels', 'pas de Boot Camp sur une puce Apple', 'pilote', 'essaie l\'Ethernet',
        'garde un PC Windows de secours', 'Dépannage sans Windows : sa page web, à vérifier.'].filter((m) => !m01.texte.includes(m)), []);
      v.egal('Mac : à vérifier chez toi', m01.aVerifier, 'chez toi, avant ta première presta');
      v.egal('Mac : sources connues du pas à pas', m01.sources.filter((s) => !novalct.SOURCES_NOVALCT[s.id]).map((s) => s.id), []);
      v.vrai('Mac : sources Apple et Microsoft', ['apple-boot-camp', 'ms-mac-arm', 'ms-emulation-arm'].every((id) => m01.sources.some((s) => s.id === id)), m01.sources.map((s) => s.id).join(', '));
      const signatures = (r) => r.parties.flatMap((p) => p.etapes.map((e) => e.signature));
      v.egal('signatures : Mac et Windows identiques', signatures(mac), signatures(win));
      v.egal('signatures : Windows et sans choix identiques', signatures(win), signatures(sans));
      const m03 = etapeNovaLCT(mac, '0.3');
      v.vrai('0.3 : Control ETHERNET et adresse du MCTRL4K', m03.texte.includes('En Ethernet : câble entre le port Control ETHERNET du MCTRL4K et ton ordinateur (adaptateur USB-C Ethernet sur un Mac).')
        && m03.texte.includes('Son adresse s\'affiche en haut à droite de son écran d\'accueil ; donne à l\'ordinateur la même plage.'), m03.texte);
      v.egal('0.3 : chemin du système choisi, l\'autre à part', [m03.connexion?.chemin.systeme, m03.connexion?.autre.systeme, etapeNovaLCT(win, '0.3').connexion?.chemin.systeme,
        etapeNovaLCT(sans, '0.3').connexion?.chemin.systeme], ['mac', 'windows', 'windows', 'windows']);
      v.vrai('0.3 : sources NovaLCT V5.8.1 § 3.1 et manuel MCTRL4K', m03.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 3.1, p. 4') && m03.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1'),
        m03.sources.map((s) => `${s.id} ${s.ref}`).join(', '));
      const p660 = pasAPasNovaLCT(contexte, { options: { systeme: 'mac' } });
      const e660 = etapeNovaLCT(p660, '0.3');
      v.vrai('MCTRL660 classique : vois la fiche, à vérifier', e660.texte.includes('Port de contrôle et adresse : vois la fiche du processeur, à vérifier en formation.') && e660.aVerifier === true, e660.texte);
      v.vrai('MCTRL660 classique : pas de page web', !etapeNovaLCT(p660, '0.1').texte.includes('page web'));
      v.vrai('MCTRL660 PRO : page web', etapeNovaLCT(pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl660-pro', options: { systeme: 'mac' } }), '0.1').texte.includes('sa page web'));
      const tm = novalct.texteNovaLCT(mac, {});
      v.vrai('texte copié : le chemin du Mac seulement', tm.includes('Configurer IPv4 : Manuellement') && !tm.includes('Réseau & Internet'));
      v.vrai('texte copié : le chemin de Windows', novalct.texteNovaLCT(win, {}).includes('Réseau & Internet'));
      const lignes0 = novalct.ficheNovaLCT(mac, {}).blocs[0].lignes;
      v.vrai('PDF : le chemin et « à vérifier chez toi »', lignes0.some((l) => (l.valeur ?? '').includes('Configurer IPv4 : Manuellement'))
        && lignes0.some((l) => l.libelle === 'À vérifier' && l.valeur === 'chez toi, avant ta première presta'));
      const bd = baseDalles(contexte);
      const bp = baseProcesseurs(contexte);
      const a = novalct.murABlanc({ dalles: bd.dalles.map((f) => calculs.resoudreFiche(f, bd.sources)), processeurs: bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)),
        liaisons: liaisonsDeBase(contexte), systeme: 'mac' });
      v.vrai('à blanc : Mac', etapeNovaLCT(a.resultat, '0.1').texte.includes('Parallels') && etapeNovaLCT(a.resultat, '0.3').connexion?.chemin.systeme === 'mac');
    },
  },
  {
    id: 'R400',
    titre: 'Champ `distributeur` des ports (19b1, spec § 4.1) : XD du SX40 (numéro, port, miroirs en redondance), CVT10 de la série H numérotés carte par carte, convertisseurs de la fibre imposée (CVT4K, paires de CVT310, transceivers des Brompton), secours compris ; rien en cuivre direct ; libellés des ports inchangés',
    etape: '19b1',
    verifier(v, contexte) {
      const d = (type, numero, port, miroir = false, paire = false) => ({ type, numero, port, miroir, paire });
      const ports = (variante) => variante?.processeurs.flatMap((p) => p.ports) ?? [];
      const sx = varianteSchema(contexte, xBp2(contexte, 'brompton-sx40', 22, 6));
      v.egal('SX40, 22 ports : ports 1, 10, 11 et 22', [1, 10, 11, 22].map((n) => ports(sx).find((p) => p.numero === n)?.distributeur),
        [d('XD', 1, 1), d('XD', 1, 10), d('XD', 2, 1), d('XD', 3, 2)]);
      v.egal('SX40 : libellés inchangés', ports(sx).map((p) => p.libelle), Array.from({ length: 22 }, (_, i) => `XD ${Math.floor(i / 10) + 1}, port ${(i % 10) + 1}`));
      const red = varianteSchema(contexte, xBp2(contexte, 'brompton-sx40', 20, 6, { redondance: true }));
      v.egal('SX40 en redondance : port 1 et son miroir, port 20 et son miroir', [1, 20].flatMap((n) => {
        const p = ports(red).find((x) => x.numero === n);
        return [p?.distributeur, p?.secours?.distributeur, p?.secours?.libelle];
      }), [d('XD', 1, 1), d('XD', 1, 1, true), 'XD miroir 1, port 1', d('XD', 2, 10), d('XD', 2, 10, true), 'XD miroir 2, port 10']);
      const h5 = varianteSchema(contexte, exercice(contexte, 60, 8, 'novastar-h5', { carteSortie: 'h-4xfiber' }));
      v.egal('H5, carte H_4xfiber : CVT10 de 8 ports, carte par carte', [1, 8, 9, 30].map((n) => ports(h5).find((p) => p.numero === n)?.distributeur),
        [d('CVT10', 1, 1), d('CVT10', 1, 8), d('CVT10', 2, 1), d('CVT10', 4, 6)]);
      v.egal('H5 : libellés inchangés', [9, 30].map((n) => ports(h5).find((p) => p.numero === n)?.libelle), ['CVT10 2, port 1', 'CVT10 4, port 6']);
      const cuivre = varianteSchema(contexte, exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }));
      v.egal('MCTRL4K en cuivre, redondance : aucun distributeur', ports(cuivre).flatMap((p) => [p.distributeur, p.secours?.distributeur]), [null, null]);
      const k4 = varianteSchema(contexte, exercice(contexte), { imposee: { ports: 2, fibre: true } });
      v.egal('cas 17, fibre imposée : CVT4K, même numéro de port', ports(k4).map((p) => p.distributeur), [d('CVT4K', 1, 1), d('CVT4K', 1, 2)]);
      v.egal('cas 17 : libellés inchangés', ports(k4).map((p) => p.libelle), ['port 1', 'port 2']);
      const k4r = varianteSchema(contexte, exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { imposee: { ports: 2, fibre: true } });
      v.egal('fibre imposée en redondance : secours 9 et 10 sur le CVT4K', ports(k4r).map((p) => [p.secours?.numero, p.secours?.distributeur]), [[9, d('CVT4K', 1, 9)], [10, d('CVT4K', 1, 10)]]);
      const m660 = varianteSchema(contexte, exercice(contexte, 4, 4, 'novastar-mctrl660'), { imposee: { ports: 2, fibre: true } });
      v.egal('MCTRL660 en fibre : une paire de CVT310 par port', ports(m660).map((p) => p.distributeur), [d('CVT310', 1, null, false, true), d('CVT310', 2, null, false, true)]);
      const s8 = varianteSchema(contexte, xBp2(contexte, 'brompton-s8', 6, 4, { redondance: true }), { imposee: { ports: 3, fibre: true } });
      v.egal('S8 en redondance, fibre : transceivers, secours compris (ports 1, 3, 5 et secours 2, 4, 6)', ports(s8).flatMap((p) => [p.distributeur, p.secours?.distributeur]),
        [1, 2, 3, 4, 5, 6].map((n) => d('transceiver', n, null, false, true)));
      const t = calculs.cablageData(exercice(contexte).m, exercice(contexte).dalle, exercice(contexte).e, { depart: 'bas-gauche', distributeurs: distributeursDeBase(contexte), imposee: { ports: 2, fibre: true } });
      v.egal('fibre imposée : le conseil reste en cuivre direct', ports(t.variantes.find((x) => x.mode === 'colonnes')).map((p) => p.distributeur), [null]);
    },
  },
  {
    id: 'R401',
    titre: 'Chaîne du Schéma, amont (19b1, spec § 4.1 et 4.2, `chaineSchema`) : source avec sa résolution et sa fréquence (« source conseillée (Canvas) » quand elle n\'est pas réglée), liaison et longueur (« longueur non saisie »), régie en tête sans sa source, chaque convertisseur, processeurs « 2 × MCTRL660 » ; sans chaîne de Canvas, les processeurs seuls avec « Chaîne à régler dans Canvas. »',
    etape: '19b1',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const variante = varianteSchema(contexte, x);
      const noeuds = (r) => r.amont.noeuds.map((n) => n.texte);
      const liens = (r) => r.amont.liens.map((l) => l.texte);
      const simple = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x), evaluation: x.e, variante });
      v.egal('source, liaison, processeur', [noeuds(simple), liens(simple), simple.amont.note], [['Source 3840 × 2160 60 Hz', 'MCTRL4K'], ['HDMI 2.0, 5 m'], null]);
      v.egal('rôles', simple.amont.noeuds.map((n) => n.role), ['source', 'processeur']);
      const vide = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x, { longueurM: null }), evaluation: x.e, variante });
      v.egal('longueur non saisie', liens(vide), ['HDMI 2.0, longueur non saisie']);
      const conseil = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x, { conseillee: true, source: { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 59.94 } }), evaluation: x.e, variante });
      v.egal('source conseillée', noeuds(conseil)[0], 'Source 1920 × 1080 59,94 Hz, source conseillée (Canvas)');
      const regie = regieDeBase(contexte, 'barco-e2-gen2');
      const avecRegie = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x, { regie }), evaluation: x.e, variante });
      v.egal('régie en tête, sans sa source', [noeuds(avecRegie)[0], avecRegie.amont.noeuds[0].role, avecRegie.amont.noeuds[0].detail],
        [`Régie ${regie.nom} (sa source n'est pas saisie)`, 'regie', 'sortie 3840 × 2160, 60 Hz']);
      const convertisseurs = [{ nom: 'Convertisseur A', liaison: '12g-sdi', longueurM: 80 }, { nom: 'Convertisseur B', liaison: '12g-sdi', longueurM: null }];
      const deux = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x, { convertisseurs, liaison: 'hdmi-2.0' }), evaluation: x.e, variante });
      v.egal('deux convertisseurs', [noeuds(deux), liens(deux)],
        [['Source 3840 × 2160 60 Hz', 'Convertisseur A', 'Convertisseur B', 'MCTRL4K'], ['HDMI 2.0, 5 m', '12G-SDI, 80 m', '12G-SDI, longueur non saisie']]);
      const x2 = exercice(contexte, 18, 4, 'novastar-mctrl660');
      const deuxProc = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x2), evaluation: x2.e, variante: varianteSchema(contexte, x2) });
      v.egal('deux processeurs', noeuds(deuxProc).at(-1), '2 × MCTRL660');
      const sans = calculs.chaineSchema({ chaine: null, evaluation: x.e, variante });
      v.egal('sans chaîne de Canvas', [noeuds(sans), liens(sans), sans.amont.note], [['MCTRL4K'], [], 'Chaîne à régler dans Canvas.']);
      v.egal('texte : la chaîne', simple.texte[0], 'Chaîne : Source 3840 × 2160 à 60 Hz, HDMI 2.0 5 m, MCTRL4K.');
      v.egal('texte : régie et convertisseurs', [avecRegie.texte[0], deux.texte[0]], [`Chaîne : Régie ${regie.nom} (sa source n'est pas saisie), sortie 3840 × 2160 à 60 Hz, HDMI 2.0 5 m, MCTRL4K.`,
        'Chaîne : Source 3840 × 2160 à 60 Hz, HDMI 2.0 5 m, Convertisseur A, 12G-SDI 80 m, Convertisseur B, 12G-SDI longueur non saisie, MCTRL4K.']);
      v.egal('texte sans chaîne', sans.texte[0], 'Chaîne : MCTRL4K (chaîne à régler dans Canvas).');
    },
  },
  {
    id: 'R402',
    titre: 'Chaîne du Schéma, aval Novastar (19b1, spec § 4.2) : cuivre seul (« câbles de tête, régie à 20 m »), CVT4K de la fibre imposée (cas 17, « fibre OPT1, 50 m »), en redondance avec les fibres qui portent les secours et leurs fibres de secours, un élément par processeur numéroté quand ils sont plusieurs ; texte d\'une ligne par processeur',
    etape: '19b1',
    verifier(v, contexte) {
      const aval = (x, options = {}, distanceM = 50) => calculs.chaineSchema({ chaine: null, evaluation: x.e, variante: varianteSchema(contexte, x, options), distanceM });
      const x = exercice(contexte);
      const cuivre = aval(x, {}, 20);
      v.egal('cuivre seul', cuivre.aval.map((p) => [p.nom, p.numero, p.appareils.length, p.liaison, p.versDalles]), [['MCTRL4K', null, 0, null, 'câbles de tête, régie à 20 m']]);
      v.egal('cuivre : texte', cuivre.texte[1], 'MCTRL4K : câbles de tête, régie à 20 m.');
      v.egal('distance non saisie', aval(x, {}, null).aval[0].versDalles, 'câbles de tête');
      const k4 = aval(x, { imposee: { ports: 2, fibre: true } });
      const p = k4.aval[0];
      v.egal('cas 17 : CVT4K au pied du mur', p.appareils.map((a) => [a.type, a.nom, a.numero, a.ports]), [['CVT4K', 'CVT4K', 1, [1, 2]]]);
      v.egal('cas 17 : fibre OPT1, 50 m', [p.liaison?.genre, p.liaison?.texte, p.liaison?.longueurM, p.versDalles], ['fibre', 'fibre OPT1, 50 m', 50, 'câbles de tête']);
      v.egal('cas 17 : texte', k4.texte[1], 'MCTRL4K : fibre OPT1 50 m jusqu\'au CVT4K au pied du mur, puis câbles de tête.');
      const red = aval(exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { imposee: { ports: 2, fibre: true } }).aval[0];
      v.egal('redondance : OPT1 et OPT2 (ports 1, 2, 9 et 10), OPT3 et OPT4 en secours', [red.appareils[0]?.ports, red.liaison?.texte],
        [[1, 2, 9, 10], 'fibres OPT1 et OPT2, OPT3 et OPT4 en secours, 50 m']);
      v.egal('fibre sans distance', aval(x, { imposee: { ports: 2, fibre: true } }, null).aval[0].liaison?.texte, 'fibre OPT1, longueur non saisie');
      const x2 = exercice(contexte, 18, 4, 'novastar-mctrl660');
      const deux = aval(x2, {}, 20);
      v.egal('deux processeurs numérotés', deux.aval.map((q) => [q.nom, q.numero]), [['MCTRL660 n° 1', 1], ['MCTRL660 n° 2', 2]]);
      v.egal('deux processeurs : une ligne chacun', deux.texte.slice(1), ['MCTRL660 n° 1 : câbles de tête, régie à 20 m.', 'MCTRL660 n° 2 : câbles de tête, régie à 20 m.']);
    },
  },
  {
    id: 'R403',
    titre: 'Chaîne du Schéma, aval du SX40 (19b1, spec § 4.2 et 4.3, choix a) : un XD par groupe de 10 ports (« XD 1 », « XD 2 », « XD 3 »), une fibre par XD ; le cuivre 10G saisi dans le réseau Brompton de Data avec le rappel « Cat6A 60 m au plus » (aide en ligne Tessera, annexe B) ; en redondance, les XD miroirs avec les ports de secours',
    etape: '19b1',
    verifier(v, contexte) {
      const x = xBp2(contexte, 'brompton-sx40', 22, 6);
      const variante = varianteSchema(contexte, x);
      const r = calculs.chaineSchema({ chaine: null, evaluation: x.e, variante, distanceM: 150 });
      const p = r.aval[0];
      v.egal('SX40 : 3 XD et leurs ports', p.appareils.map((a) => [a.nom, a.ports]), [['XD 1', suiteDe(1, 10)], ['XD 2', suiteDe(11, 20)], ['XD 3', [21, 22]]]);
      v.egal('une fibre par XD', [p.nom, p.liaison?.genre, p.liaison?.texte, p.liaison?.rappel], ['SX40', 'fibre', '3 fibres (une par XD), 150 m', null]);
      v.egal('texte', r.texte[1], 'SX40 : 3 fibres (une par XD) 150 m jusqu\'aux XD 1, XD 2 et XD 3 au pied du mur, puis câbles de tête.');
      const cu = calculs.chaineSchema({ chaine: null, evaluation: x.e, variante, distanceM: 150, reseau: { cuivre10G: { categorie: 'Cat6A', longueurM: 40 } } }).aval[0];
      v.egal('cuivre 10G du réseau Brompton', [cu.liaison?.genre, cu.liaison?.texte, cu.liaison?.rappel],
        ['cuivre', '3 câbles cuivre 10G Cat6A (un par XD), 40 m', 'Cat6A 60 m au plus (aide en ligne Tessera, annexe B).']);
      const un = xBp2(contexte, 'brompton-sx40', 8, 6);
      v.egal('un seul XD : « fibre »', calculs.chaineSchema({ chaine: null, evaluation: un.e, variante: varianteSchema(contexte, un), distanceM: 150 }).aval[0].liaison?.texte, 'fibre, 150 m');
      const xr = xBp2(contexte, 'brompton-sx40', 20, 6, { redondance: true });
      const red = calculs.chaineSchema({ chaine: null, evaluation: xr.e, variante: varianteSchema(contexte, xr), distanceM: 150 }).aval[0];
      v.egal('redondance : XD et XD miroirs', red.appareils.map((a) => [a.nom, a.miroir, a.ports]),
        [['XD 1', false, suiteDe(1, 10)], ['XD 2', false, suiteDe(11, 20)], ['XD miroir 1', true, suiteDe(21, 30)], ['XD miroir 2', true, suiteDe(31, 40)]]);
      v.egal('redondance : une fibre par XD, miroirs compris', red.liaison?.texte, '4 fibres (une par XD), 150 m');
    },
  },
  {
    id: 'R404',
    titre: 'Chaîne du Schéma, paires et transceivers de la fibre imposée (19b1, spec § 4.2) : MCTRL660 et ses paires de CVT310 (CVT320 au choix), S8 et ses paires de transceivers fibre (secours compris), une fibre par paire',
    etape: '19b1',
    verifier(v, contexte) {
      const aval = (x, imposee) => calculs.chaineSchema({ chaine: null, evaluation: x.e, variante: varianteSchema(contexte, x, { imposee }), distanceM: 50 });
      const m660 = aval(exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true });
      const p = m660.aval[0];
      v.egal('MCTRL660 : 2 paires de CVT310', [p.appareils.map((a) => [a.nom, a.paires, a.ports]), p.liaison?.texte], [[['2 paires de CVT310', 2, [1, 2]]], '2 fibres (une par paire), 50 m']);
      v.egal('MCTRL660 : texte', m660.texte[1], 'MCTRL660 : 2 fibres (une par paire) 50 m jusqu\'aux 2 paires de CVT310 au pied du mur, puis câbles de tête.');
      const cvt320 = aval(exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 2, fibre: true, paire: 'novastar-cvt320' }).aval[0];
      v.egal('CVT320 au choix', cvt320.appareils[0]?.nom, '2 paires de CVT320');
      const un = aval(exercice(contexte, 4, 4, 'novastar-mctrl660'), { ports: 1, fibre: true });
      v.egal('une seule paire', [un.aval[0].appareils[0]?.nom, un.aval[0].liaison?.texte, un.texte[1]],
        ['1 paire de CVT310', 'fibre, 50 m', 'MCTRL660 : fibre 50 m jusqu\'à sa paire de CVT310 au pied du mur, puis câbles de tête.']);
      const s8 = aval(xBp2(contexte, 'brompton-s8', 6, 4, { redondance: true }), { ports: 3, fibre: true }).aval[0];
      v.egal('S8 en redondance : 6 paires de transceivers, secours compris', [s8.appareils.map((a) => [a.nom, a.paires]), s8.liaison?.texte],
        [[['6 paires de transceivers fibre', 6]], '6 fibres (une par paire), 50 m']);
    },
  },
  {
    id: 'R405',
    titre: 'Chaîne du Schéma, grands murs et texte (19b1, spec § 4.2 et 4.6) : au-delà de 6 processeurs, un seul élément « 7 × MCTRL660 » dans l\'aval et la chaîne ; mur en zones : un élément par processeur ; texte copié sans tiret de liste ni tiret long',
    etape: '19b1',
    verifier(v, contexte) {
      const x = exercice(contexte, 48, 8, 'novastar-mctrl660');
      v.egal('48 × 8 : 7 MCTRL660', x.e.nombre, 7);
      const r = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x), evaluation: x.e, variante: varianteSchema(contexte, x), distanceM: 20 });
      v.egal('un seul élément', r.aval.map((p) => [p.nom, p.numero, p.nombre, p.versDalles]), [['7 × MCTRL660', null, 7, 'câbles de tête, régie à 20 m']]);
      v.egal('texte', r.texte, ['Chaîne : Source 3840 × 2160 à 60 Hz, HDMI 2.0 5 m, 7 × MCTRL660.', '7 × MCTRL660 : câbles de tête, régie à 20 m.']);
      const xs = xBp2(contexte, 'brompton-sx40', 22, 6);
      const six = calculs.chaineSchema({ chaine: null, evaluation: { ...xs.e, nombre: 7, groupes: Array(7).fill(xs.e.groupes[0]) },
        variante: { ...varianteSchema(contexte, xs), processeurs: Array.from({ length: 7 }, (_, i) => ({ ...varianteSchema(contexte, xs).processeurs[0], numero: i + 1 })) }, distanceM: 150 }).aval;
      v.egal('regroupé : appareils comptés', [six.length, six[0].appareils.map((a) => a.nom), six[0].liaison?.texte], [1, ['21 XD'], '21 fibres (une par XD), 150 m']);
      const z = calculs.murZones(DALLE_CAS_13, [{ nom: 'A', colonnes: 4, rangees: 6 }, { nom: 'B', colonnes: 3, rangees: 6 }], { ecarts: 'main', ecartsPx: [84] });
      const ez = calculs.evaluerProcesseur(z, DALLE_CAS_13, processeurDeBase(contexte, 'novastar-mctrl660'), NOVASTAR_60_8);
      const tz = calculs.cablageData(z, DALLE_CAS_13, ez, { depart: 'bas-gauche' });
      const rz = calculs.chaineSchema({ chaine: null, evaluation: ez, variante: tz.variantes.find((y) => y.mode === tz.conseil), distanceM: 20 });
      v.egal('mur en zones : un élément par processeur', rz.aval.length, ez.nombre);
      const k4 = calculs.chaineSchema({ chaine: chaineCanvas(contexte, exercice(contexte)), evaluation: exercice(contexte).e, variante: varianteSchema(contexte, exercice(contexte), { imposee: { ports: 2, fibre: true } }), distanceM: 50 });
      v.egal('sans tiret de liste, tiret long ni ligne vide', [...r.texte, ...k4.texte].filter((l) => !l.trim() || /^[-•]/.test(l) || /[—–]/.test(l)), []);
    },
  },
  {
    id: 'R406',
    titre: 'Phrases du guide avec la provenance du signal (19b3, spec § 4.5) : un appareil entre le processeur et les dalles, la phrase dit d\'où vient son signal (« Le CVT4K reçoit la fibre OPT1 du MCTRL4K (50 m). »), et au premier port de l\'appareil sur une fibre « Branche d\'abord… » ; XD du SX40 (fibre ou cuivre 10G), paires de CVT310 et transceivers, fibres de secours ; au-delà de 6 processeurs, chaque processeur nommé (choix b) ; sans longueur, sans parenthèse (choix e) ; signatures inchangées, cuivre direct inchangé',
    etape: '19b3',
    verifier(v, contexte) {
      const guide = (x, { imposee = null, distanceM = 50, reseau = null, variante = null } = {}) => {
        const vd = variante ?? varianteSchema(contexte, x, { imposee });
        const evaluation = variante ? { ...x.e, nombre: vd.processeurs.length } : x.e;
        const r = calculs.chaineSchema({ chaine: null, evaluation, variante: vd, distanceM, reseau });
        return { avec: montage.etapesData(vd, { depart: 'bas-gauche', provenance: r.provenance }), sans: montage.etapesData(vd, { depart: 'bas-gauche' }) };
      };
      const phrase = (etapes, cle) => etapes.find((e) => e.cle === cle)?.phrase ?? `${cle} absente`;
      const memesSignatures = (g) => g.avec.length === g.sans.length && g.avec.every((e, i) => e.signature === g.sans[i].signature);
      const x = exercice(contexte);
      const k4 = guide(x, { imposee: { ports: 2, fibre: true } });
      v.egal('cas 17, port 1 : branche d\'abord la fibre OPT1', phrase(k4.avec, 'p1-1'),
        '8 dalles, de C1 R4 à C2 R4. Branche d\'abord la fibre OPT1 du MCTRL4K (50 m) sur le CVT4K. Câble de tête du port 1 du CVT4K, au pied du mur, jusqu\'à C1 R4, puis suis les numéros.');
      v.vrai('cas 17, port 2 : le CVT4K reçoit la fibre OPT1', phrase(k4.avec, 'p1-2').includes('. Le CVT4K reçoit la fibre OPT1 du MCTRL4K (50 m). Câble de tête du port 2 du CVT4K, au pied du mur, jusqu\'à '), phrase(k4.avec, 'p1-2'));
      v.vrai('cas 17 : signatures inchangées', memesSignatures(k4));
      v.vrai('sans longueur : sans parenthèse', phrase(guide(x, { imposee: { ports: 2, fibre: true }, distanceM: null }).avec, 'p1-1').includes('Branche d\'abord la fibre OPT1 du MCTRL4K sur le CVT4K. '));
      const red = guide(exercice(contexte, 4, 4, 'novastar-mctrl4k', { redondance: true }), { imposee: { ports: 2, fibre: true } });
      v.vrai('redondance : la fibre de secours au premier port', phrase(red.avec, 'p1-1').includes('Branche d\'abord la fibre OPT1 du MCTRL4K (50 m) sur le CVT4K, et OPT3 en secours. '), phrase(red.avec, 'p1-1'));
      v.vrai('redondance : le retour de secours garde sa phrase', phrase(red.avec, 'p1-1').endsWith(phrase(red.sans, 'p1-1').split('. ').at(-1)) && phrase(red.sans, 'p1-1').includes('Retour de secours'));
      const xs = xBp2(contexte, 'brompton-sx40', 22, 6);
      const sx = guide(xs, { distanceM: 150 });
      v.vrai('SX40, port 1 : branche d\'abord la fibre sur le XD 1', phrase(sx.avec, 'p1-1').includes('. Branche d\'abord la fibre du SX40 (150 m) sur le XD 1. Câble de tête du XD 1, port 1 jusqu\'à '), phrase(sx.avec, 'p1-1'));
      v.vrai('SX40, port 2 : le XD 1 reçoit la fibre', phrase(sx.avec, 'p1-2').includes('. Le XD 1 reçoit la fibre du SX40 (150 m). Câble de tête du XD 1, port 2 jusqu\'à '), phrase(sx.avec, 'p1-2'));
      v.vrai('SX40, port 11 : premier port du XD 2', phrase(sx.avec, 'p1-11').includes('. Branche d\'abord la fibre du SX40 (150 m) sur le XD 2. '), phrase(sx.avec, 'p1-11'));
      v.vrai('SX40 : signatures inchangées', memesSignatures(sx));
      const cu = guide(xs, { distanceM: 150, reseau: { cuivre10G: { categorie: 'Cat6A', longueurM: 40 } } });
      v.vrai('cuivre 10G du réseau Brompton', phrase(cu.avec, 'p1-1').includes('. Branche d\'abord le câble cuivre 10G Cat6A du SX40 (40 m) sur le XD 1. '), phrase(cu.avec, 'p1-1'));
      const m660 = guide(exercice(contexte, 4, 4, 'novastar-mctrl660'), { imposee: { ports: 2, fibre: true } });
      v.vrai('paires de CVT310 : chaque port sa paire', ['p1-1', 'p1-2'].every((cle) => phrase(m660.avec, cle).includes('. Branche d\'abord la fibre du MCTRL660 (50 m) sur la paire de CVT310 de ce port. Câble de tête du port ')),
        phrase(m660.avec, 'p1-2'));
      const s8 = guide(xBp2(contexte, 'brompton-s8', 6, 4, { redondance: true }), { imposee: { ports: 3, fibre: true } });
      v.vrai('S8 : paire de transceivers fibre', phrase(s8.avec, 'p1-1').includes('. Branche d\'abord la fibre du S8 (50 m) sur la paire de transceivers fibre de ce port. '), phrase(s8.avec, 'p1-1'));
      const v1 = varianteSchema(contexte, xs);
      const sept = guide(xs, { distanceM: 150, variante: { ...v1, processeurs: Array.from({ length: 7 }, (_, i) => ({ ...v1.processeurs[0], numero: i + 1 })) } });
      v.vrai('7 SX40 : le processeur nommé dans la phrase (choix b)', phrase(sept.avec, 'p7-1').includes('. Branche d\'abord la fibre du SX40 n° 7 (150 m) sur le XD 1. '), phrase(sept.avec, 'p7-1'));
      const cuivre = guide(x, { distanceM: 20 });
      v.egal('cuivre direct : phrases inchangées', cuivre.avec.map((e) => e.phrase), cuivre.sans.map((e) => e.phrase));
      v.egal('sans provenance : la phrase d\'avant (R390)', phrase(k4.sans, 'p1-1'), '8 dalles, de C1 R4 à C2 R4. Câble de tête du port 1 du CVT4K, au pied du mur, jusqu\'à C1 R4, puis suis les numéros.');
    },
  },
  {
    id: 'R407',
    titre: 'Texte copié du Schéma avec la chaîne (19b3, spec § 4.6) : « Chaîne : … » puis une ligne par processeur, sous la ligne « Câbles », sans tiret de liste ni tiret long ; sans chaîne, le texte d\'avant',
    etape: '19b3',
    verifier(v, contexte) {
      const x = exercice(contexte);
      const t = imposerData(contexte, x, { ports: 2, fibre: true });
      const vd = t.variantes.find((y) => y.mode === t.retenue);
      const chaine = calculs.chaineSchema({ chaine: chaineCanvas(contexte, x), evaluation: x.e, variante: vd, distanceM: 50 });
      const avec = resumes.resumeCablage({ data: t, modeData: t.retenue, chaine }).split('\n');
      const sans = resumes.resumeCablage({ data: t, modeData: t.retenue }).split('\n');
      const i = avec.findIndex((l) => l.startsWith('Câbles : '));
      v.egal('sous « Câbles », la chaîne puis le processeur', avec.slice(i + 1, i + 3),
        ['Chaîne : Source 3840 × 2160 à 60 Hz, HDMI 2.0 5 m, MCTRL4K.', 'MCTRL4K : fibre OPT1 50 m jusqu\'au CVT4K au pied du mur, puis câbles de tête.']);
      v.egal('le reste inchangé', avec.filter((l) => !chaine.texte.includes(l)), sans);
      v.egal('sans chaîne : aucune ligne « Chaîne »', sans.filter((l) => l.startsWith('Chaîne')), []);
      v.egal('sans tiret de liste ni tiret long', avec.filter((l) => /^[-•]/.test(l) || /[—–]/.test(l)), []);
    },
  },
  {
    id: 'R408',
    titre: 'Plusieurs configs NovaLCT par lot (étape 20a, spec § 3.1) : identifiant, fréquence et luminosité maxi, doublon refusé, visée par le logiciel quand il n\'y en a qu\'une, fichiers et retrait d\'une seule config, valeurs illisibles ignorées',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      const configs = (b = base) => fiches.lotsDalleParc(b, parc, dalle)[0].configs;
      base = fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 800.rcfgx', frequenceHz: '60', luminositeMax: '800' });
      v.egal('critères gardés en nombres', [configs()[0].frequenceHz, configs()[0].luminositeMax], [60, 800]);
      v.egal('identifiant déduit d\'une config sans id', fiches.idConfig(configs()[0], lot), `${lot}:NovaLCT`);
      v.egal('une seule config NovaLCT : visée par le logiciel', fiches.configLot(base, parc, dalle, lot, 'NovaLCT').nomFichier, 'essai 800.rcfgx');
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '1200' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 50HZ 800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      v.egal('trois configs NovaLCT dans le lot', configs().map((c) => c.nomFichier), ['essai 800.rcfgx', 'essai 1200.rcfgx', 'essai 50HZ 800.rcfgx']);
      const id1200 = configs()[1].id;
      const id800 = fiches.idConfig(configs()[0], lot);
      v.vrai('identifiant écrit pour une config ajoutée', /^cfg-/.test(id1200) && id1200 !== configs()[2].id);
      v.egal('doublon refusé', messageErreur(() => fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'x.rcfgx', frequenceHz: '50', luminositeMax: '800' })),
        'Le lot A a déjà un fichier NovaLCT à 50 Hz et 800 cd/m² : change la fréquence ou la luminosité.');
      const deuxVides = () => fiches.ajouterConfigLot(fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'a.rcfgx' }), parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'b.rcfgx' });
      v.egal('doublon sans critère', messageErreur(deuxVides),
        'Le lot A a déjà un fichier NovaLCT sans fréquence et sans luminosité notée : change la fréquence ou la luminosité.');
      const modifiee = fiches.reglerConfigLot(base, parc, dalle, lot, { id: id1200, logiciel: 'NovaLCT', nomFichier: 'essai 1200 v2.rcfgx', frequenceHz: '60', luminositeMax: '1200' });
      v.egal('modifiée par son id, à sa place, sans doublon avec elle-même', configs(modifiee).map((c) => c.nomFichier), ['essai 800.rcfgx', 'essai 1200 v2.rcfgx', 'essai 50HZ 800.rcfgx']);
      v.egal('modifiée vers un doublon : refusé', messageErreur(() => fiches.reglerConfigLot(base, parc, dalle, lot, { id: id1200, logiciel: 'NovaLCT', frequenceHz: '60', luminositeMax: '800' })),
        'Le lot A a déjà un fichier NovaLCT à 60 Hz et 800 cd/m² : change la fréquence ou la luminosité.');
      const plusieurs = 'Plusieurs configs NovaLCT dans le lot A : précise laquelle.';
      v.egal('visée par le logiciel à plusieurs : refusée', messageErreur(() => fiches.configLot(base, parc, dalle, lot, 'NovaLCT')), plusieurs);
      v.egal('réglée sans id à plusieurs : refusée', messageErreur(() => fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'y.rcfgx' })), plusieurs);
      v.egal('59,94 avec la virgule', fiches.configLot(fiches.reglerConfigLot(base, parc, dalle, lot, { id: id1200, logiciel: 'NovaLCT', frequenceHz: '59,94', luminositeMax: '1200' }), parc, dalle, lot, id1200).frequenceHz, 59.94);
      v.egal('fréquence hors plage', messageErreur(() => fiches.reglerConfigLot(base, parc, dalle, lot, { id: id1200, logiciel: 'NovaLCT', frequenceHz: '0' })),
        'Fréquence du fichier : un nombre de 1 à 1000 Hz, ou vide.');
      v.egal('luminosité non entière', messageErreur(() => fiches.reglerConfigLot(base, parc, dalle, lot, { id: id1200, logiciel: 'NovaLCT', luminositeMax: '800.5' })),
        'Luminosité maxi du fichier : un nombre entier de 100 à 10 000 cd/m², ou vide.');
      v.egal('critères refusés hors NovaLCT', messageErreur(() => fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'VMP', nomFichier: 'x.ncp', frequenceHz: '50' })),
        'Fréquence et luminosité maxi : seulement pour une config NovaLCT.');
      v.egal('une seule config VMP par lot', messageErreur(() => fiches.ajouterConfigLot(fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'VMP', nomFichier: 'x.ncp' }), parc, dalle, lot, { logiciel: 'VMP', nomFichier: 'y.ncp' })),
        'Le lot A a déjà une config VMP.');
      base = fiches.joindreFichier(base, parc, dalle, lot, id1200, 'fichier', { id: 'f-1200', nom: 'essai 1200.rcfgx', taille: 4, date: '2026-10-25' });
      base = fiches.joindreFichier(base, parc, dalle, lot, id800, 'fichier', { id: 'f-800', nom: 'essai 800.rcfgx', taille: 4, date: '2026-10-25' });
      v.egal('fichiers joints avec leur config', fiches.fichiersJoints(base).map((f) => [f.id, f.configId]), [['f-800', id800], ['f-1200', id1200]]);
      v.egal('joindre par le logiciel à plusieurs : refusé', messageErreur(() => fiches.joindreFichier(base, parc, dalle, lot, 'NovaLCT', 'fichier', { id: 'f', nom: 'f.rcfgx', taille: 1, date: '2026-10-25' })), plusieurs);
      const sans1200 = fiches.supprimerConfigLot(base, parc, dalle, lot, id1200);
      v.egal('retrait d\'une seule config, avec ses seuls fichiers', [configs(sans1200).length, fiches.fichiersJoints(sans1200).map((f) => f.id)], [2, ['f-800']]);
      v.egal('détacher le fichier d\'une seule config', fiches.fichiersJoints(fiches.detacherFichier(base, parc, dalle, lot, id800, 'fichier')).map((f) => f.id), ['f-1200']);
      v.egal('critères illisibles d\'un fichier : ignorés', fiches.criteresConfig({ logiciel: 'NovaLCT', frequenceHz: 'abc', luminositeMax: 50 }), { frequenceHz: null, luminositeMax: null });
      v.egal('critères lisibles', fiches.criteresConfig({ logiciel: 'NovaLCT', frequenceHz: 50, luminositeMax: 800 }), { frequenceHz: 50, luminositeMax: 800 });
      v.egal('critères d\'une autre config : aucun', fiches.criteresConfig({ logiciel: 'VMP', frequenceHz: 50 }), { frequenceHz: null, luminositeMax: null });
      const importe = { id: 'l', identifiant: 'A', configs: [
        { logiciel: 'NovaLCT', id: 'c1', nomFichier: 'a.rcfgx', frequenceHz: 50, luminositeMax: 800 },
        { logiciel: 'NovaLCT', id: 'c2', nomFichier: 'b.rcfgx', frequenceHz: 50, luminositeMax: 800 },
      ] };
      v.egal('doublon venu d\'un fichier : signalé', fiches.doublonsNovaLCT(importe), ['Deux fichiers NovaLCT à 50 Hz et 800 cd/m² dans le lot A : corrige l\'un des deux.']);
      v.egal('sans doublon : rien', fiches.doublonsNovaLCT(fiches.lotsDalleParc(base, parc, dalle)[0]), []);
    },
  },
  {
    id: 'R409',
    titre: 'Fréquence et luminosité maxi proposées d\'après le nom du fichier NovaLCT (étape 20a, spec § 3.2) : « 50HZ », « 800 », 60 Hz du stock, plages, morceaux ambigus, valeurs marquées, doublon évité',
    etape: 'configs',
    verifier(v) {
      const p = (nom, autres = []) => fiches.proposerDepuisNom(nom, autres);
      const rien = { frequenceHz: null, luminositeMax: null, soixante: [] };
      v.egal('« essai 50HZ 800.rcfgx »', p('essai 50HZ 800.rcfgx'), { frequenceHz: 50, luminositeMax: 800, soixante: [] });
      v.egal('format du stock, doubles espaces', p('ESSAI1234  50HZ  1200.rcfgx'), { frequenceHz: 50, luminositeMax: 1200, soixante: [] });
      v.egal('« ESSAI1234 800.rcfgx » seul : sans fréquence', p('ESSAI1234 800.rcfgx'), { frequenceHz: null, luminositeMax: 800, soixante: [] });
      const autres = [
        { id: 'c800', nomFichier: 'ESSAI1234 800.rcfgx' },
        { id: 'c59', nomFichier: 'dalle 59.94Hz.rcfgx' },
        { id: 'c60', nomFichier: 'x.rcfgx', frequenceHz: 60 },
      ];
      v.egal('50 Hz : 60 Hz proposés aux autres sans « Hz » et sans fréquence', p('ESSAI1234  50HZ  800.rcfgx', autres).soixante, ['c800']);
      v.egal('sans « Hz » dans un lot qui a déjà 50 Hz : 60 Hz', p('ESSAI1234 1200.rcfgx', [{ id: 'c50', nomFichier: 'ESSAI1234  50HZ  800.rcfgx', frequenceHz: 50 }]),
        { frequenceHz: 60, luminositeMax: 1200, soixante: [] });
      v.egal('« dalle_59.94Hz.rcfgx »', p('dalle_59.94Hz.rcfgx').frequenceHz, 59.94);
      v.egal('virgule décimale', p('dalle 59,94Hz.rcfgx').frequenceHz, 59.94);
      v.egal('« dalle 50 Hz (800).rcfgx »', p('dalle 50 Hz (800).rcfgx'), { frequenceHz: 50, luminositeMax: 800, soixante: [] });
      v.egal('« ESSAI1234-P2.6.rcfgx » : rien', p('ESSAI1234-P2.6.rcfgx'), rien);
      v.egal('« 3840Hz 800.rcfgx » : rafraîchissement ignoré', p('3840Hz 800.rcfgx'), { frequenceHz: null, luminositeMax: 800, soixante: [] });
      v.egal('deux nombres (date) : rien', p('2022 1200.rcfgx').luminositeMax, null);
      v.egal('« 1000nits », « 1000 cd »', [p('dalle 1000nits.rcfgx').luminositeMax, p('dalle 1000 cd.rcfgx').luminositeMax], [1000, 1000]);
      v.egal('V5.4.3, 500x1000, 241101 : rien', ['V5.4.3', 'P3.9 500x1000 mm', '241101-CONFIG'].map((n) => p(`${n}.rcfgx`).luminositeMax), [null, null, null]);
      // Nom du fichier enregistré : valeurs proposées pour les seuls critères vides, marquées, sans doublon.
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT' });
      const premier = fiches.idConfig(fiches.lotsDalleParc(base, parc, dalle)[0].configs[0], lot);
      let r = fiches.nommerFichierConfig(base, parc, dalle, lot, premier, 'ESSAI1234 800.rcfgx');
      v.egal('message d\'une valeur', r.messages, ['Luminosité maxi 800 cd/m² lue dans le nom du fichier : vérifie-la.']);
      let c = fiches.configLot(r.base, parc, dalle, lot, premier);
      v.egal('valeur proposée et marquée', [c.nomFichier, c.frequenceHz ?? null, c.luminositeMax, c.critereDuNom], ['ESSAI1234 800.rcfgx', null, 800, { luminosite: true }]);
      v.egal('Mur : « d\'après le nom du fichier »', fiches.configsDuMur(r.base, parc, dalle, 10).lignes[1], 'Config NovaLCT : ESSAI1234 800.rcfgx (800 cd/m², d\'après le nom du fichier), lot A');
      base = fiches.ajouterConfigLot(r.base, parc, dalle, lot, { logiciel: 'NovaLCT' });
      const second = fiches.lotsDalleParc(base, parc, dalle)[0].configs[1].id;
      r = fiches.nommerFichierConfig(base, parc, dalle, lot, second, 'ESSAI1234  50HZ  800.rcfgx');
      v.egal('messages : la config, puis 60 Hz pour l\'autre', r.messages, [
        'Fréquence 50 Hz et luminosité maxi 800 cd/m² lues dans le nom du fichier : vérifie-les.',
        'Fréquence 60 Hz proposée pour ESSAI1234 800.rcfgx (sans « Hz » dans son nom) : vérifie-la.',
      ]);
      c = fiches.configLot(r.base, parc, dalle, lot, premier);
      v.egal('60 Hz proposés à l\'autre config, marqués', [c.frequenceHz, c.critereDuNom], [60, { frequence: true, luminosite: true }]);
      base = fiches.reglerConfigLot(r.base, parc, dalle, lot, { ...fiches.configLot(r.base, parc, dalle, lot, second), frequenceHz: '', luminositeMax: '1200', critereDuNom: undefined });
      c = fiches.configLot(base, parc, dalle, lot, second);
      v.egal('formulaire enregistré : critères saisis, marque effacée', [c.frequenceHz ?? null, c.luminositeMax, c.critereDuNom ?? null], [null, 1200, null]);
      r = fiches.nommerFichierConfig(base, parc, dalle, lot, second, 'ESSAI1234  50HZ  800.rcfgx');
      v.egal('nom inchangé : rien de reproposé', [r.messages, fiches.configLot(r.base, parc, dalle, lot, second).frequenceHz ?? null], [[], null]);
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT' });
      const troisieme = fiches.lotsDalleParc(base, parc, dalle)[0].configs[2].id;
      r = fiches.nommerFichierConfig(base, parc, dalle, lot, troisieme, 'copie 60HZ 800.rcfgx');
      v.egal('proposition en doublon : non appliquée, avec la raison', r.messages,
        ['Fréquence 60 Hz et luminosité maxi 800 cd/m² lues dans le nom du fichier, non appliquées : le lot A a déjà un fichier NovaLCT à 60 Hz et 800 cd/m².']);
      c = fiches.configLot(r.base, parc, dalle, lot, troisieme);
      v.egal('nom gardé, critères vides', [c.nomFichier, c.frequenceHz ?? null, c.luminositeMax ?? null], ['copie 60HZ 800.rcfgx', null, null]);
    },
  },
  {
    id: 'R410',
    titre: 'Fichier NovaLCT retenu pour le mur (étape 20a, spec § 4) : fréquence de Data, la plus proche à 1 Hz, luminosité choisie ou à choisir, sans luminosité notée, ordre de la liste',
    etape: 'configs',
    verifier(v) {
      const cfg = (id, nomFichier, frequenceHz = null, luminositeMax = null) => ({
        logiciel: 'NovaLCT', id, nomFichier, ...(frequenceHz ? { frequenceHz } : {}), ...(luminositeMax ? { luminositeMax } : {}),
      });
      const lot = (...configs) => ({ id: 'l', identifiant: 'A', configs });
      const stock = lot(cfg('a', 'essai 800.rcfgx', 60, 800), cfg('b', 'essai 1200.rcfgx', 60, 1200), cfg('c', 'essai 50HZ 800.rcfgx', 50, 800),
        cfg('d', 'essai 50HZ 1200.rcfgx', 50, 1200), { logiciel: 'VMP', nomFichier: 'x.ncp' });
      const choix = (l, frequenceHz, luminosite = null) => fiches.choisirConfigNovaLCT(l, { frequenceHz, luminosite });
      const id = (r) => r.retenue?.id ?? null;
      v.egal('60 Hz, 800', id(choix(stock, 60, 800)), 'a');
      v.egal('50 Hz, 1200', id(choix(stock, 50, 1200)), 'd');
      v.egal('autres : les trois autres NovaLCT', choix(stock, 60, 800).autres.map((c) => c.id), ['b', 'c', 'd']);
      let r = choix(stock, 60);
      v.egal('luminosité à choisir', [id(r), r.aChoisir, r.alertes, r.luminosites], [null, true, ['Lot A : choisis la luminosité maxi dans Data (800 ou 1200 cd/m²).'], [800, 1200]]);
      r = choix(stock, 59.94, 1200);
      v.egal('59,94 Hz : le fichier à 60 Hz, avec l\'alerte', [id(r), r.alertes], ['b', ['Aucun fichier NovaLCT à 59,94 Hz pour le lot A : pris celui à 60 Hz. Vérifie l\'image.']]);
      r = choix(stock, 48, 800);
      v.egal('48 Hz : aucun, alerte', [id(r), r.alertes], [null, ['Aucun fichier NovaLCT à 48 Hz pour le lot A (fichiers : essai 800.rcfgx à 60 Hz, essai 1200.rcfgx à 60 Hz, essai 50HZ 800.rcfgx à 50 Hz, essai 50HZ 1200.rcfgx à 50 Hz).']]);
      v.egal('49 Hz : celui à 50 Hz', id(choix(stock, 49, 800)), 'c');
      v.egal('59,5 Hz entre 59 et 60 : la plus basse', id(choix(lot(cfg('h', 'h.rcfgx', 60), cfg('g', 'g.rcfgx', 59)), 59.5)), 'g');
      r = choix(stock, 60, 1000);
      v.egal('luminosité choisie absente', [id(r), r.alertes], [null, ['Aucun fichier NovaLCT à 1000 cd/m² pour le lot A (fichiers à 800 et 1200 cd/m²).']]);
      const seul = lot(cfg('s', 'BP2V2_A.rcfgx'));
      v.egal('un seul fichier sans critère : retenu sans alerte, à toute fréquence', [50, 60, 59.94].map((f) => [id(choix(seul, f)), choix(seul, f).alertes]), [['s', []], ['s', []], ['s', []]]);
      const cinquante = lot(cfg('c', 'essai 50HZ.rcfgx', 50));
      r = choix(cinquante, 60);
      v.egal('un seul fichier à 50 Hz, Data à 60 Hz : aucun', [id(r), r.alertes], [null, ['Aucun fichier NovaLCT à 60 Hz pour le lot A (fichiers : essai 50HZ.rcfgx à 50 Hz).']]);
      const vide = lot(cfg('p', 'p.rcfgx', 60, 800), cfg('q', 'q.rcfgx', 60));
      r = choix(vide, 60);
      v.egal('sans luminosité notée : une luminosité de plus', [r.aChoisir, r.luminosites, r.alertes], [true, [800, null], ['Lot A : choisis la luminosité maxi dans Data (800 cd/m² ou sans luminosité notée).']]);
      v.egal('« Sans luminosité notée » choisi', id(choix(vide, 60, 'aucune')), 'q');
      r = choix(vide, 60, 1200);
      v.egal('luminosité absente : celui sans luminosité notée', [id(r), r.alertes], ['q', ['Lot A : aucun fichier à 1200 cd/m², pris celui sans luminosité notée.']]);
      const mixte = lot(cfg('m', 'm.rcfgx'), cfg('n', 'n.rcfgx', 60));
      v.egal('fréquence exacte avant sans fréquence', [id(choix(mixte, 60)), choix(mixte, 60).alertes], ['n', []]);
      r = choix(mixte, 50);
      v.egal('ni exacte ni proche : celui sans fréquence notée', [id(r), r.alertes], ['m', ['Aucun fichier NovaLCT à 50 Hz pour le lot A : pris celui sans fréquence notée. Vérifie l\'image.']]);
      v.egal('59,94 Hz : la plus proche n\'est pas masquée par une config sans fréquence', id(choix(lot(cfg('a', 'a.rcfgx', 60, 800), cfg('z', 'z.rcfgx', null, 1200)), 59.94, 800)), 'a');
      r = choix(lot(cfg('u', 'u.rcfgx', 60, 800)), 60, 1200);
      v.egal('une seule luminosité, autre choix dans Data : retenue, signalée', [id(r), r.alertes], ['u', ['Lot A : seul fichier à 800 cd/m² (choix de Data : 1200 cd/m²).']]);
      v.egal('doublon importé : l\'ordre de la liste', id(choix(lot(cfg('x', 'x.rcfgx', 50, 800), cfg('y', 'y.rcfgx', 50, 800)), 50)), 'x');
      r = choix(lot({ logiciel: 'VMP', nomFichier: 'x.ncp' }), 60);
      v.egal('aucune config NovaLCT : rien de retenu, rien d\'autre', [id(r), r.autres, r.alertes], [null, [], []]);
    },
  },
  {
    id: 'R411',
    titre: 'Lots et configs du mur avec la fréquence et la luminosité de Data (étape 20a, spec § 4) : par lot, ligne de la retenue et des autres fichiers, luminosités pour la liste, firmware du lot, lots mélangés ; sans fréquence, comme avant',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      for (const [identifiant, quantite] of [['A', '60'], ['B', '40']]) base = fiches.ajouterLot(base, parc, dalle, { identifiant, quantite });
      const [lotA, lotB] = fiches.lotsDalleParc(base, parc, dalle).map((l) => l.id);
      base = fiches.reglerConfigLot(base, parc, dalle, lotA, { logiciel: 'NovaLCT', nomFichier: 'essai 800.rcfgx', frequenceHz: '60', luminositeMax: '800', multiBatch: 'essai.lxy' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lotA, { logiciel: 'NovaLCT', nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '1200', firmware: 'personnalisé' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lotA, { logiciel: 'NovaLCT', nomFichier: 'essai 50HZ 800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      let c = fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT', frequenceHz: 60, luminosite: 1200 });
      v.egal('lignes : lots, la retenue, puis les autres fichiers', c.lignes, [
        'Lots utilisés : A',
        'Config NovaLCT : essai 1200.rcfgx (60 Hz, 1200 cd/m²), firmware personnalisé, lot A',
        'Autres fichiers NovaLCT du lot A : essai 800.rcfgx (60 Hz, 800 cd/m²), essai 50HZ 800.rcfgx (50 Hz, 800 cd/m²)',
      ]);
      v.egal('par lot', c.parLot.map((p) => [p.lot.identifiant, p.retenue.nomFichier, p.autres.length, p.aChoisir]), [['A', 'essai 1200.rcfgx', 2, false]]);
      v.egal('firmware personnalisé : une config du lot le dit', c.firmwarePersonnalise, true);
      v.egal('luminosités pour la liste de Data', [c.luminosites, c.plusieursLuminosites], [[800, 1200], true]);
      c = fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT', frequenceHz: 50 });
      v.egal('50 Hz : un seul fichier, pas de liste', [c.lignes[1], c.luminosites, c.plusieursLuminosites, c.alertes], ['Config NovaLCT : essai 50HZ 800.rcfgx (50 Hz, 800 cd/m²), lot A', [800], false, []]);
      c = fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT', frequenceHz: 60 });
      v.egal('à choisir : alerte, les fichiers du lot sans retenue', [c.lignes, c.alertes], [[
        'Lots utilisés : A',
        'Fichiers NovaLCT du lot A : essai 800.rcfgx (60 Hz, 800 cd/m²), essai 1200.rcfgx (60 Hz, 1200 cd/m²), essai 50HZ 800.rcfgx (50 Hz, 800 cd/m²)',
      ], ['Lot A : choisis la luminosité maxi dans Data (800 ou 1200 cd/m²).']]);
      base = fiches.reglerConfigLot(base, parc, dalle, lotB, { logiciel: 'NovaLCT', nomFichier: 'essai B.rcfgx' });
      c = fiches.configsDuMur(base, parc, dalle, 80, { logiciel: 'NovaLCT', frequenceHz: 60, luminosite: 800 });
      v.egal('lots mélangés : chaque lot son fichier', c.parLot.map((p) => p.retenue?.nomFichier ?? null), ['essai 800.rcfgx', 'essai B.rcfgx']);
      v.vrai('lots mélangés : l\'alerte d\'avant', c.melanges && c.alertes.some((a) => a.startsWith('Lots mélangés')));
      const avant = fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT' });
      v.egal('sans fréquence : toutes les configs, comme avant', [avant.lignes.length, avant.parLot ?? null], [4, null]);
      v.egal('Mur : chaque config avec ses critères', fiches.configsDuMur(base, parc, dalle, 50).lignes[1], 'Config NovaLCT : essai 800.rcfgx (60 Hz, 800 cd/m²), multi-batch essai.lxy, lot A');
      const vmp = fiches.reglerConfigLot(base, parc, dalle, lotA, { logiciel: 'VMP', nomFichier: 'essai.ncp' });
      v.egal('autre logiciel : la fréquence n\'y change rien', fiches.configsDuMur(vmp, parc, dalle, 50, { logiciel: 'VMP', frequenceHz: 50 }).lignes, ['Lots utilisés : A', 'Config VMP : essai.ncp, lot A']);
    },
  },
  {
    id: 'R412',
    titre: 'Check-list « Avant de partir » avec plusieurs fichiers NovaLCT (étape 20a, spec § 4) : le retenu marqué, les autres à prendre aussi, à choisir, aucun à cette fréquence, multi-batch du lot ; un seul fichier sans critère : les lignes d\'avant',
    etape: 'configs',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 800.rcfgx', frequenceHz: '60', luminositeMax: '800', multiBatch: 'essai.lxy' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '1200', firmware: 'personnalisé' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 50HZ 800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      const [c800, , c50] = fiches.lotsDalleParc(base, parc, dalle)[0].configs;
      base = fiches.joindreFichier(base, parc, dalle, lot, fiches.idConfig(c800, lot), 'fichier', { id: 'f800', nom: 'essai 800.rcfgx', taille: 4, date: '2026-10-25' });
      base = fiches.joindreFichier(base, parc, dalle, lot, c50.id, 'fichier', { id: 'f50', nom: 'essai 50HZ 800.rcfgx', taille: 4, date: '2026-10-25' });
      const groupes = [{ dalleId: dalle, n: 50, coches: null, libelle: null }];
      const mctrl = { id: 'novastar-mctrl4k', famille: 'novastar', logiciel: 'NovaLCT', nom: 'Novastar MCTRL4K' };
      const lignes = (o) => fiches.avantDePartir(base, parc, groupes, mctrl, { presents: new Set(['f800']), ...o }).lignes;
      const aussi = 'à prendre aussi si la fréquence ou la luminosité change sur place';
      v.egal('1200 retenu, les autres à prendre aussi', lignes({ frequenceHz: 60, luminosite: 1200 }), [
        { texte: 'Fichier de config essai 1200.rcfgx (lot A, retenu : 60 Hz, 1200 cd/m²) : pas joint dans l\'appli, prends-le avec toi', fait: false },
        { texte: 'Firmware personnalisé (lot A) : ne lance pas la mise à jour en ligne des cartes', fait: null },
        { texte: 'Multi-batch adjustment essai.lxy (lot A, avec la config essai 800.rcfgx) : pas joint dans l\'appli, prends-le avec toi', fait: false },
        { texte: `Fichier de config essai 800.rcfgx (lot A, ${aussi}) : sur cet appareil`, fait: true },
        { texte: `Fichier de config essai 50HZ 800.rcfgx (lot A, ${aussi}) : absent de cet appareil, joins-le de nouveau dans l'onglet Base`, fait: false },
        { texte: 'Version de NovaLCT non relevée pour ce processeur : relève-la dans l\'onglet Base', fait: false },
        { texte: 'Exporte ta base avec les fichiers joints avant de partir (onglet Base)', fait: null },
      ]);
      v.egal('800 retenu : son multi-batch sans renvoi', lignes({ frequenceHz: 60, luminosite: 800 }).slice(0, 3).map((l) => l.texte), [
        'Fichier de config essai 800.rcfgx (lot A, retenu : 60 Hz, 800 cd/m²) : sur cet appareil',
        'Firmware personnalisé (lot A) : ne lance pas la mise à jour en ligne des cartes',
        'Multi-batch adjustment essai.lxy (lot A) : pas joint dans l\'appli, prends-le avec toi',
      ]);
      const aChoisir = lignes({ frequenceHz: 60 });
      v.egal('à choisir : en tête, à faire', aChoisir[0], { texte: 'Fichier NovaLCT du lot A : à choisir (luminosité maxi dans Data)', fait: false });
      v.egal('à choisir : les trois fichiers à prendre aussi', aChoisir.filter((l) => l.texte.includes(aussi)).length, 3);
      v.egal('48 Hz : aucun fichier', lignes({ frequenceHz: 48, luminosite: 800 })[0], { texte: 'Fichier NovaLCT du lot A : aucun fichier à 48 Hz', fait: false });
      v.egal('1000 cd/m² : aucun fichier', lignes({ frequenceHz: 60, luminosite: 1000 })[0], { texte: 'Fichier NovaLCT du lot A : aucun fichier à 1000 cd/m²', fait: false });
      let simple = fiches.creerParc(fiches.baseVide(), 'Parc test');
      simple = fiches.ajouterLot(simple, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lotSimple = fiches.lotsDalleParc(simple, parc, dalle)[0].id;
      simple = fiches.reglerConfigLot(simple, parc, dalle, lotSimple, { logiciel: 'NovaLCT', nomFichier: 'seul.rcfgx' });
      simple = fiches.joindreFichier(simple, parc, dalle, lotSimple, 'NovaLCT', 'fichier', { id: 'fs', nom: 'seul.rcfgx', taille: 4, date: '2026-10-25' });
      const lignesSimple = (o) => fiches.avantDePartir(simple, parc, groupes, mctrl, { presents: new Set(['fs']), ...o }).lignes;
      v.egal('un seul fichier sans critère : les lignes d\'avant, même avec la fréquence de Data', lignesSimple({ frequenceHz: 50 }), lignesSimple({}));
      v.egal('… dont la ligne du fichier', lignesSimple({ frequenceHz: 50 })[0].texte, 'Fichier de config seul.rcfgx (lot A) : sur cet appareil');
      const texte = resumes.resumeAvantDePartir(fiches.avantDePartir(base, parc, groupes, mctrl, { presents: new Set(['f800']), frequenceHz: 60, luminosite: 1200 }));
      v.vrai('texte copié : le retenu, puis à prendre aussi', texte.includes('À faire : Fichier de config essai 1200.rcfgx (lot A, retenu : 60 Hz, 1200 cd/m²)')
        && texte.includes(`OK : Fichier de config essai 800.rcfgx (lot A, ${aussi}) : sur cet appareil`));
    },
  },
  {
    id: 'R413',
    titre: 'Pas à pas NovaLCT : fichiers retenus de chaque lot (étape 20a, spec § 4, `lireConfigs`) ; autres fichiers, multi-batch et firmware du lot ; sans `parLot`, la lecture d\'avant',
    etape: 'novalct',
    verifier(v) {
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.reglerConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 800.rcfgx', frequenceHz: '60', luminositeMax: '800', multiBatch: 'essai.lxy' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '1200', firmware: 'personnalisé' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 50HZ 800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      const lire = (o) => novalct.lireConfigs([{ libelle: null, resultat: fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT', ...o }) }]);
      const cfg = lire({ frequenceHz: 60, luminosite: 1200 });
      v.egal('fichiers : la retenue seule', cfg.fichiers, ['essai 1200.rcfgx (lot A, 60 Hz, 1200 cd/m²)']);
      v.egal('noms : un seul fichier, donc All Receiving Card', cfg.noms, ['essai 1200.rcfgx']);
      v.egal('autres fichiers', cfg.autres, ['essai 800.rcfgx (lot A, 60 Hz, 800 cd/m²)', 'essai 50HZ 800.rcfgx (lot A, 50 Hz, 800 cd/m²)']);
      v.egal('multi-batch du lot, même sur une autre config', cfg.lxy, ['essai.lxy']);
      v.egal('firmware personnalisé du lot', cfg.perso, true);
      const aChoisir = lire({ frequenceHz: 60 });
      v.egal('à choisir : aucun fichier retenu, l\'alerte', [aChoisir.fichiers, aChoisir.noms, aChoisir.alertes], [[], [], ['Lot A : choisis la luminosité maxi dans Data (800 ou 1200 cd/m²).']]);
      const avant = novalct.lireConfigs([{ libelle: null, resultat: { retenus: [{ identifiant: 'A', configs: [{ logiciel: 'NovaLCT', nomFichier: 'x.rcfgx' }] }], alertes: [] } }]);
      v.egal('structure d\'avant', [avant.fichiers, avant.noms, avant.autres], [['x.rcfgx (lot A)'], ['x.rcfgx'], []]);
      v.egal('pas de parc : comme avant', novalct.lireConfigs(null).aucunParc, true);
    },
  },
  {
    id: 'R414',
    titre: 'Texte copié de Data : luminosité maxi choisie (étape 20a, spec § 5.2), absente sans choix',
    etape: 'configs',
    verifier(v, contexte) {
      const m = calculs.mur(DALLE_CAS_7, 10, 5);
      const e = calculs.evaluerProcesseur(m, DALLE_CAS_7, processeurDeBase(contexte, 'novastar-mctrl4k'), NOVASTAR_60_8);
      const configs = { lignes: ['Lots utilisés : A', 'Config NovaLCT : essai 1200.rcfgx (60 Hz, 1200 cd/m²), lot A'], alertes: [], version: null };
      v.vrai('luminosité choisie', resumes.resumeData(e, { configs: { ...configs, luminosite: 1200 } })
        .includes('Config NovaLCT : essai 1200.rcfgx (60 Hz, 1200 cd/m²), lot A\nLuminosité maxi : 1200 cd/m² (fichier du lot)'));
      v.vrai('sans choix : rien', !resumes.resumeData(e, { configs }).includes('Luminosité maxi'));
    },
  },
  {
    id: 'R415',
    titre: 'Titre, badge et bouton « Retirer » d\'une config dans Base (étape 20b, spec § 5.1) : critères NovaLCT après le nom du logiciel, sans la marque « d\'après le nom du fichier » ; sans critère, les textes d\'avant',
    etape: 'configs',
    verifier(v) {
      if (typeof fiches.titreConfig !== 'function') { v.vrai('titreConfig exportée par fiches.js', false); return; }
      v.egal('NovaLCT à 50 Hz et 800 cd/m², lue dans le nom', fiches.titreConfig({ logiciel: 'NovaLCT', frequenceHz: 50, luminositeMax: 800, critereDuNom: { frequence: true } }),
        { titre: 'NovaLCT (Novastar), 50 Hz, 800 cd/m²', badge: 'NovaLCT 50 Hz, 800 cd/m²', retirer: 'Retirer la config NovaLCT 50 Hz, 800 cd/m²' });
      v.egal('NovaLCT sans critère', fiches.titreConfig({ logiciel: 'NovaLCT', nomFichier: 'essai.rcfgx' }),
        { titre: 'NovaLCT (Novastar)', badge: 'NovaLCT', retirer: 'Retirer la config NovaLCT' });
      v.egal('59,94 Hz seul', fiches.titreConfig({ logiciel: 'NovaLCT', frequenceHz: 59.94 }).titre, 'NovaLCT (Novastar), 59,94 Hz');
      v.egal('luminosité seule', fiches.titreConfig({ logiciel: 'NovaLCT', luminositeMax: 1200 }).badge, 'NovaLCT 1200 cd/m²');
      v.egal('Tessera', fiches.titreConfig({ logiciel: 'Tessera' }), { titre: 'Tessera (Brompton)', badge: 'Tessera', retirer: 'Retirer la config Tessera' });
      v.egal('critère illisible venu d\'un fichier : ignoré', fiches.titreConfig({ logiciel: 'NovaLCT', frequenceHz: 'abc', luminositeMax: 50 }).titre, 'NovaLCT (Novastar)');
      if (typeof fiches.texteCritereDuNom !== 'function') { v.vrai('texteCritereDuNom exportée par fiches.js', false); return; }
      v.egal('phrase sous le fichier : deux critères lus', fiches.texteCritereDuNom({ logiciel: 'NovaLCT', frequenceHz: 50, luminositeMax: 800, critereDuNom: { frequence: true, luminosite: true } }),
        'Fréquence 50 Hz et luminosité maxi 800 cd/m² lues dans le nom du fichier : vérifie-les.');
      v.egal('… un seul lu', fiches.texteCritereDuNom({ logiciel: 'NovaLCT', frequenceHz: 60, luminositeMax: 800, critereDuNom: { frequence: true } }),
        'Fréquence 60 Hz lue dans le nom du fichier : vérifie-la.');
      v.egal('… sans marque : rien', fiches.texteCritereDuNom({ logiciel: 'NovaLCT', frequenceHz: 60 }), null);
    },
  },
  {
    id: 'R416',
    titre: '« Ajouter une config » dans Base (étape 20b, spec § 5.1) : VMP, LEDVISION et Tessera disparaissent une fois présents, NovaLCT reste ; petit formulaire quand le lot a déjà une config NovaLCT ; aide quand la seule config NovaLCT en place n\'a aucun critère',
    etape: 'configs',
    verifier(v) {
      if (typeof fiches.ajoutConfig !== 'function') { v.vrai('ajoutConfig exportée par fiches.js', false); return; }
      v.egal('lot vide : les quatre logiciels, ajout d\'avant', fiches.ajoutConfig({ identifiant: 'A', configs: [] }),
        { logiciels: ['NovaLCT', 'VMP', 'LEDVISION', 'Tessera'], petitFormulaire: false, aide: null });
      v.egal('VMP présent, config à ranger ignorée', fiches.ajoutConfig({ identifiant: 'A', configs: [{ logiciel: 'VMP' }, { nomFichier: 'ancien.rcfgx' }] }).logiciels,
        ['NovaLCT', 'LEDVISION', 'Tessera']);
      v.egal('une config NovaLCT sans critère : petit formulaire et aide',
        fiches.ajoutConfig({ identifiant: 'A', configs: [{ logiciel: 'NovaLCT', nomFichier: 'essai.rcfgx' }, { logiciel: 'Tessera' }] }),
        { logiciels: ['NovaLCT', 'VMP', 'LEDVISION'], petitFormulaire: true,
          aide: 'La config NovaLCT déjà en place (essai.rcfgx) n\'a ni fréquence ni luminosité maxi : saisis-les dans son formulaire, la nouvelle doit en différer d\'au moins un critère.' });
      v.egal('sans nom de fichier', fiches.ajoutConfig({ identifiant: 'A', configs: [{ logiciel: 'NovaLCT' }] }).aide,
        'La config NovaLCT déjà en place n\'a ni fréquence ni luminosité maxi : saisis-les dans son formulaire, la nouvelle doit en différer d\'au moins un critère.');
      v.egal('une config NovaLCT avec un critère : sans aide', fiches.ajoutConfig({ identifiant: 'A', configs: [{ logiciel: 'NovaLCT', luminositeMax: 800 }] }),
        { logiciels: ['NovaLCT', 'VMP', 'LEDVISION', 'Tessera'], petitFormulaire: true, aide: null });
      v.egal('deux configs NovaLCT : sans aide', fiches.ajoutConfig({ identifiant: 'A', configs: [{ logiciel: 'NovaLCT' }, { logiciel: 'NovaLCT', id: 'cfg-1', frequenceHz: 50 }] }).aide, null);
    },
  },
  {
    id: 'R417',
    titre: 'Liste « Luminosité maxi » de Data (étape 20b, spec § 5.2) : visible seulement quand un lot retenu a plusieurs luminosités à la fréquence de Data ; « À choisir », les luminosités, « Sans luminosité notée » ; valeur gardée qui n\'est plus proposée ou liste cachée : à choisir',
    etape: 'configs',
    verifier(v) {
      if (typeof fiches.choixLuminosite !== 'function') { v.vrai('choixLuminosite exportée par fiches.js', false); return; }
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 800.rcfgx', frequenceHz: '60', luminositeMax: '800' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '1200' });
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai 50HZ 800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      const duMur = (b, f) => fiches.configsDuMur(b, parc, dalle, 50, { logiciel: 'NovaLCT', frequenceHz: f });
      const options = [{ valeur: '', texte: 'À choisir' }, { valeur: '800', texte: '800 cd/m²' }, { valeur: '1200', texte: '1200 cd/m²' }];
      v.egal('60 Hz, rien de choisi', fiches.choixLuminosite([duMur(base, 60)], ''), { visible: true, options, valeur: '', luminosite: null });
      v.egal('1200 choisi', fiches.choixLuminosite([duMur(base, 60)], '1200'), { visible: true, options, valeur: '1200', luminosite: 1200 });
      v.egal('valeur gardée plus proposée : à choisir', fiches.choixLuminosite([duMur(base, 60)], '1000'), { visible: true, options, valeur: '', luminosite: null });
      v.egal('50 Hz, une seule luminosité : cachée, valeur ignorée', fiches.choixLuminosite([duMur(base, 50)], '1200'), { visible: false, options: [], valeur: '', luminosite: null });
      v.egal('sans parc, sans NovaLCT ou sans fréquence : cachée', fiches.choixLuminosite([null, fiches.configsDuMur(base, parc, dalle, 50, { logiciel: 'NovaLCT' })], '800').visible, false);
      const sans = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT', nomFichier: 'essai.rcfgx', frequenceHz: '60' });
      v.egal('sans luminosité notée en dernier, choisie', fiches.choixLuminosite([duMur(sans, 60)], 'aucune'),
        { visible: true, options: [...options, { valeur: 'aucune', texte: 'Sans luminosité notée' }], valeur: 'aucune', luminosite: 'aucune' });
      // Deux fiches du mur (dalles entières et rangée de demi-dalles) : la réunion de leurs luminosités.
      let autre = fiches.ajouterLot(base, parc, 'roe-bp2', { identifiant: 'B', quantite: '10' });
      const lotB = fiches.lotsDalleParc(autre, parc, 'roe-bp2')[0].id;
      autre = fiches.ajouterConfigLot(autre, parc, 'roe-bp2', lotB, { logiciel: 'NovaLCT', nomFichier: 'demi 1000.rcfgx', frequenceHz: '60', luminositeMax: '1000' });
      const demi = fiches.configsDuMur(autre, parc, 'roe-bp2', 10, { logiciel: 'NovaLCT', frequenceHz: 60 });
      v.egal('deux fiches : réunion, de la plus basse à la plus haute', fiches.choixLuminosite([duMur(autre, 60), demi], '1000').options.map((o) => o.valeur), ['', '800', '1000', '1200']);
      v.egal('… et 1000 choisi', fiches.choixLuminosite([duMur(autre, 60), demi], '1000').luminosite, 1000);
    },
  },
  {
    id: 'R418',
    titre: 'Formulaire d\'une config dans Base (étape 20b, choix c) : champs enregistrés d\'abord (marque « d\'après le nom » effacée), puis le nouveau nom du fichier propose ses valeurs pour les critères restés vides ; autres logiciels : comme avant',
    etape: 'configs',
    verifier(v) {
      if (typeof fiches.enregistrerConfigFormulaire !== 'function') { v.vrai('enregistrerConfigFormulaire exportée par fiches.js', false); return; }
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT' });
      const id = fiches.lotsDalleParc(base, parc, dalle)[0].configs[0].id;
      base = fiches.nommerFichierConfig(base, parc, dalle, lot, id, 'essai 800.rcfgx').base;
      base = fiches.joindreFichier(base, parc, dalle, lot, id, 'fichier', { id: 'f1', nom: 'essai 800.rcfgx', taille: 4, date: '2026-10-25' });
      const config = (b) => fiches.configLot(b, parc, dalle, lot, id);
      v.egal('départ : luminosité lue dans le nom', fiches.texteCriteresConfig(config(base)), '800 cd/m², d\'après le nom du fichier');
      const champs = { nomFichier: 'essai 800.rcfgx', frequenceHz: '', luminositeMax: '800', version: 'V1', date: '', provenance: '', firmware: '', multiBatch: '', autreFichier: '', notes: '' };
      const meme = fiches.enregistrerConfigFormulaire(base, parc, dalle, lot, id, champs);
      v.egal('même nom : marque effacée, aucun message', [fiches.texteCriteresConfig(config(meme.base)), config(meme.base).version, meme.messages], ['800 cd/m²', 'V1', []]);
      v.egal('fichier joint gardé', config(meme.base).fichier?.id, 'f1');
      const nouveau = fiches.enregistrerConfigFormulaire(base, parc, dalle, lot, id, { ...champs, nomFichier: 'essai 50HZ 1200.rcfgx' });
      v.egal('nouveau nom : la luminosité saisie reste, la fréquence vient du nom', [fiches.criteresConfig(config(nouveau.base)), fiches.texteCriteresConfig(config(nouveau.base))],
        [{ frequenceHz: 50, luminositeMax: 800 }, '50 Hz, 800 cd/m², d\'après le nom du fichier']);
      v.egal('… avec le message', nouveau.messages, ['Fréquence 50 Hz lue dans le nom du fichier : vérifie-la.']);
      v.egal('fréquence saisie avec le nouveau nom : gardée, sans marque',
        fiches.criteresConfig(config(fiches.enregistrerConfigFormulaire(base, parc, dalle, lot, id, { ...champs, nomFichier: 'essai 50HZ 1200.rcfgx', frequenceHz: '60' }).base)),
        { frequenceHz: 60, luminositeMax: 800 });
      let refus = null;
      try { fiches.enregistrerConfigFormulaire(base, parc, dalle, lot, id, { ...champs, nomFichier: 'essai.ncp' }); } catch (e) { refus = e.message; }
      v.egal('mauvaise extension : refus', refus, 'Fichier de config NovaLCT : un fichier .rcfgx ou .rcfg.');
      let vmp = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'VMP' });
      vmp = fiches.enregistrerConfigFormulaire(vmp, parc, dalle, lot, 'VMP', { nomFichier: 'essai.ncp', version: '', date: '', provenance: '', firmware: '', autreFichier: '', notes: 'N' });
      v.egal('VMP : nom et notes enregistrés', [fiches.configLot(vmp.base, parc, dalle, lot, 'VMP').nomFichier, fiches.configLot(vmp.base, parc, dalle, lot, 'VMP').notes, vmp.messages], ['essai.ncp', 'N', []]);
    },
  },
  {
    id: 'R419',
    titre: 'Deuxième config NovaLCT d\'un lot par le petit formulaire de Base (étape 20b, spec § 5.1, choix a) : proposition d\'après le nom pour pré-remplir, création avec les critères saisis (sans marque), 60 Hz proposés aux autres fichiers, doublon refusé',
    etape: 'configs',
    verifier(v) {
      if (typeof fiches.ajouterConfigNovaLCT !== 'function' || typeof fiches.proposerPourLot !== 'function') {
        v.vrai('ajouterConfigNovaLCT et proposerPourLot exportées par fiches.js', false);
        return;
      }
      let base = fiches.creerParc(fiches.baseVide(), 'Parc test');
      const parc = base.parcs[0].id;
      const dalle = 'roe-bp2-v2';
      base = fiches.ajouterLot(base, parc, dalle, { identifiant: 'A', quantite: '60' });
      const lot = fiches.lotsDalleParc(base, parc, dalle)[0].id;
      base = fiches.ajouterConfigLot(base, parc, dalle, lot, { logiciel: 'NovaLCT' });
      const premier = fiches.lotsDalleParc(base, parc, dalle)[0].configs[0].id;
      base = fiches.nommerFichierConfig(base, parc, dalle, lot, premier, 'ESSAI1234 800.rcfgx').base;
      const lotA = () => fiches.lotsDalleParc(base, parc, dalle)[0];
      v.egal('proposition pour pré-remplir', fiches.proposerPourLot(lotA(), 'ESSAI1234  50HZ  800.rcfgx'), { frequenceHz: 50, luminositeMax: 800, soixante: [premier] });
      const r = fiches.ajouterConfigNovaLCT(base, parc, dalle, lot, { nomFichier: 'ESSAI1234  50HZ  800.rcfgx', frequenceHz: '50', luminositeMax: '800' });
      const configs = fiches.lotsDalleParc(r.base, parc, dalle)[0].configs;
      v.egal('deux configs NovaLCT', configs.length, 2);
      v.vrai('identifiant de la nouvelle', typeof r.id === 'string' && r.id.startsWith('cfg-') && configs[1].id === r.id, r.id);
      v.egal('la nouvelle : critères saisis, sans marque', [configs[1].nomFichier, fiches.texteCriteresConfig(configs[1])], ['ESSAI1234  50HZ  800.rcfgx', '50 Hz, 800 cd/m²']);
      v.egal('l\'autre : 60 Hz proposés, marqués', fiches.texteCriteresConfig(configs[0]), '60 Hz, 800 cd/m², d\'après le nom du fichier');
      v.egal('message', r.messages, ['Fréquence 60 Hz proposée pour ESSAI1234 800.rcfgx (sans « Hz » dans son nom) : vérifie-la.']);
      base = r.base;
      v.egal('fichier sans « Hz » dans un lot à 50 Hz : 60 Hz proposés', fiches.proposerPourLot(lotA(), 'ESSAI1234 1200.rcfgx'), { frequenceHz: 60, luminositeMax: 1200, soixante: [] });
      let refus = null;
      try { fiches.ajouterConfigNovaLCT(base, parc, dalle, lot, { nomFichier: 'autre.rcfgx', frequenceHz: '60', luminositeMax: '800' }); } catch (e) { refus = e.message; }
      v.egal('doublon refusé', refus, 'Le lot A a déjà un fichier NovaLCT à 60 Hz et 800 cd/m² : change la fréquence ou la luminosité.');
      const vide = fiches.ajouterConfigNovaLCT(base, parc, dalle, lot, { nomFichier: 'essai 1200.rcfgx', frequenceHz: '60', luminositeMax: '' });
      v.egal('luminosité laissée vide : lue dans le nom', [fiches.texteCriteresConfig(fiches.configLot(vide.base, parc, dalle, lot, vide.id)), vide.messages],
        ['60 Hz, 1200 cd/m², d\'après le nom du fichier', ['Luminosité maxi 1200 cd/m² lue dans le nom du fichier : vérifie-la.']]);
      const sansNom = fiches.ajouterConfigNovaLCT(base, parc, dalle, lot, { nomFichier: '', frequenceHz: '', luminositeMax: '1200' });
      v.egal('sans nom de fichier', [fiches.criteresConfig(fiches.configLot(sansNom.base, parc, dalle, lot, sansNom.id)), sansNom.messages], [{ frequenceHz: null, luminositeMax: 1200 }, []]);
    },
  },
  {
    id: 'R420',
    titre: 'Plusieurs arrivées (étape 21a, spec § 4.1) : liste lue avec repères A1, A2…, identifiants stables et libellés ; boîtier en direct seulement pour une 32 A tri ; contrôles qui nomment l\'arrivée ; départs au-delà de 16 A ou puissance utile au-delà d\'une prise 16 A : arrivée en boîtier refusée, les autres gardées ; arrivée de calcul ; alertes de l\'arrivée unique retirées',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.lireArrivees !== 'function') { v.vrai('lireArrivees exportée par calculs.js', false); return; }
      const deux = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier', distanceM: 12 }]);
      v.egal('63 A tri en armoire, 32 A tri en boîtier', deux, [
        { id: 'arr-1', numero: 1, repere: 'A1', type: 'tri', intensiteA: 63, branchement: 'armoire', distanceM: null, materiel: { prises16: null, sortiesP17: null }, libelle: 'Arrivée 1 : 63 A tri, armoire', refus: null },
        { id: 'arr-2', numero: 2, repere: 'A2', type: 'tri', intensiteA: 32, branchement: 'boitier', distanceM: 12, materiel: { prises16: null, sortiesP17: null }, libelle: 'Arrivée 2 : 32 A tri, en direct sur un boîtier', refus: null },
      ]);
      v.egal('identifiant donné gardé, mono', calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { id: 'arr-x', type: 'mono', intensiteA: 16 }])[1],
        { id: 'arr-x', numero: 2, repere: 'A2', type: 'mono', intensiteA: 16, branchement: 'armoire', distanceM: null, materiel: { prises16: null, sortiesP17: null }, libelle: 'Arrivée 2 : 16 A mono, armoire', refus: null });
      const refus = (liste, options) => messageErreur(() => calculs.lireArrivees(liste, options));
      const a1 = { type: 'tri', intensiteA: 63 };
      v.egal('boîtier sur une 63 A tri : refusé', refus([a1, { type: 'tri', intensiteA: 63, branchement: 'boitier' }]), 'Arrivée 2 : en direct sur un boîtier, seulement pour une 32 A tri.');
      v.egal('boîtier sur une 32 A mono : refusé', refus([a1, { type: 'mono', intensiteA: 32, branchement: 'boitier' }]), 'Arrivée 2 : en direct sur un boîtier, seulement pour une 32 A tri.');
      v.egal('intensité nulle', refus([a1, { type: 'tri', intensiteA: 0 }]), 'Arrivée 2 : indique son intensité, en ampères.');
      v.egal('type inconnu', refus([a1, { type: 'bi', intensiteA: 32 }]), 'Arrivée 2 : mono ou tri.');
      v.egal('distance négative', refus([a1, { type: 'tri', intensiteA: 32, distanceM: -1 }]), 'Arrivée 2 : la distance au mur est positive ou nulle.');
      v.egal('matériel non entier', refus([a1, { type: 'tri', intensiteA: 32, materiel: { prises16: 1.5 } }]), 'Arrivée 2 : prises 16 A libres sur l\'armoire, un nombre entier, 0 ou plus.');
      v.egal('aucune arrivée', refus([]), 'Indique au moins une arrivée.');
      const boitier = [a1, { type: 'tri', intensiteA: 32, branchement: 'boitier' }];
      v.egal('départs de 20 A : l\'arrivée en boîtier refusée, pas la liste', calculs.lireArrivees(boitier, { departA: 20 }).map((a) => a.refus),
        [null, 'Arrivée 2 : départs réglés à 20 A, les prises d\'un boîtier 32 A tri sont en 16 A. Branche-la sur une armoire.']);
      v.egal('puissance utile saisie de 4000 W : refusée en boîtier', calculs.lireArrivees(boitier, { puissanceUtileW: 4000 })[1].refus,
        'Arrivée 2 : puissance utile par ligne de 4000 W, au-delà d\'une prise 16 A (3680 W). Branche-la sur une armoire.');
      v.egal('arrivée de calcul : tri dès qu\'une arrivée est tri, la plus grosse', [
        calculs.arriveeDeCalcul(deux), calculs.arriveeDeCalcul(calculs.lireArrivees([{ type: 'mono', intensiteA: 32 }, { type: 'tri', intensiteA: 32 }])),
        calculs.arriveeDeCalcul(calculs.lireArrivees([{ type: 'mono', intensiteA: 16 }, { type: 'mono', intensiteA: 32 }])),
      ], [{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32 }, { type: 'mono', intensiteA: 32 }]);
      v.egal('alertes de l\'arrivée unique retirées', calculs.sansAlertesArrivee([
        'Arrivée tri 63 A : la phase la plus chargée demande 12480 W pour 11 088 W utiles par phase, même équilibrée. Il faut une arrivée plus forte.',
        'L\'arrivée mono 16 A porte 2816 W utiles (220 V, marge 80 %) : le mur demande 3000 W. Il faut une arrivée plus forte ou du triphasé.',
        'Une phase dépasse les 5632 W utiles de l\'arrivée : il faut une arrivée plus forte.',
        'Courant d\'appel : jusqu\'à 90 A sur une ligne.',
      ]), ['Courant d\'appel : jusqu\'à 90 A sur une ligne.']);
    },
  },
  {
    id: 'R421',
    titre: 'Répartition des lignes entre les arrivées (étape 21a, spec § 4.2, cas 1 et 2) : une seule arrivée en armoire, la variante telle quelle ; tout tient sur l\'arrivée en tête (la plus grosse, pas la première de la liste) : phases d\'aujourd\'hui, les autres « aucune ligne » ; boîtier seul trop petit : refus, ligne sans place ; arrivée en boîtier refusée par les départs : retirée',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const neuf = varianteArrivees(Array(9).fill(2340));
      v.vrai('une seule arrivée en armoire : la variante elle-même', calculs.repartirArrivees(neuf, elecArrivees(), calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }])) === neuf);
      const r = calculs.repartirArrivees(neuf, elecArrivees(), calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]));
      v.egal('tout tient sur A1 : phases de la variante, toutes sur A1', [r.lignesDetail.map((l) => `${l.repere}L${l.phase}`), r.parArrivee.map((a) => a.lignes)],
        [['A1L1', 'A1L2', 'A1L3', 'A1L1', 'A1L2', 'A1L3', 'A1L1', 'A1L2', 'A1L3'], [[1, 2, 3, 4, 5, 6, 7, 8, 9], []]]);
      v.egal('… note, aucun refus, ok', [r.notes, r.refus, r.ok], [['Arrivée 2 : aucune ligne, pas besoin de la tirer.'], [], true]);
      v.egal('… phases de A1', r.parArrivee[0].phases.map((p) => [p.numero, p.lignes, p.puissanceW]), [[1, 3, 7020], [2, 3, 7020], [3, 3, 7020]]);
      v.egal('… capacités par phase', r.parArrivee.map((a) => a.capaciteW), [11088, 5632]);
      v.vrai('la variante d\'origine n\'est pas modifiée', neuf.lignesDetail.every((l) => l.repere === undefined));
      const inverse = calculs.repartirArrivees(neuf, elecArrivees(), calculs.lireArrivees([{ type: 'tri', intensiteA: 32, branchement: 'boitier' }, { type: 'tri', intensiteA: 63 }]));
      v.egal('liste inversée : la plus grosse en tête (A2)', [new Set(inverse.lignesDetail.map((l) => l.repere)), inverse.notes], [new Set(['A2']), ['Arrivée 1 : aucune ligne, pas besoin de la tirer.']]);
      const seul = (n) => calculs.repartirArrivees(varianteArrivees(Array(n).fill(2340)), elecArrivees(), calculs.lireArrivees([{ type: 'tri', intensiteA: 32, branchement: 'boitier' }]));
      v.egal('boîtier seul, 6 lignes : 2 par phase, tout passe', [seul(6).lignesDetail.map((l) => l.phase), seul(6).refus], [[1, 2, 3, 1, 2, 3], []]);
      const sept = seul(7);
      v.egal('boîtier seul, 7 lignes : la 7e sans place', [sept.lignesDetail.map((l) => l.placee), sept.nonPlacees, sept.ok], [[true, true, true, true, true, true, false], [7], false]);
      v.egal('… refus', sept.refus, ['Les arrivées ne suffisent pas : ligne 7 sans place (A1 : 5632 W par phase). Ajoute une arrivée ou une plus forte, ou déplace une ligne à la main.']);
      const fort = calculs.repartirArrivees(neuf, elecArrivees({ departA: 20 }, 3520),
        calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }], { departA: 20 }));
      v.egal('départs de 20 A : A2 retirée, son refus, tout sur A1', [new Set(fort.lignesDetail.map((l) => l.repere)), fort.refus],
        [new Set(['A1']), ['Arrivée 2 : départs réglés à 20 A, les prises d\'un boîtier 32 A tri sont en 16 A. Branche-la sur une armoire.']]);
    },
  },
  {
    id: 'R422',
    titre: 'Répartition, conseil (étape 21a, spec § 4.2, cas 3 et 4) : la plus grosse arrivée remplie dans l\'ordre du câblage, puis la suivante sans retour en arrière ; dans chaque arrivée, les plus chargées d\'abord sur la phase la moins chargée qui a la place et une prise libre ; second essai au mieux avant le refus ; arrivée mono',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
      const r = calculs.repartirArrivees(varianteArrivees(Array(16).fill(2340)), elecArrivees(), arrivees);
      v.egal('16 lignes de 2340 W : 1 à 12 sur A1 (4 par phase), 13 à 16 sur le boîtier A2', r.lignesDetail.map((l) => `${l.numero}${l.repere}L${l.phase}`), [
        '1A1L1', '2A1L2', '3A1L3', '4A1L1', '5A1L2', '6A1L3', '7A1L1', '8A1L2', '9A1L3', '10A1L1', '11A1L2', '12A1L3', '13A2L1', '14A2L2', '15A2L3', '16A2L1']);
      v.egal('… charges par phase', r.parArrivee.map((a) => a.phases.map((p) => p.puissanceW)), [[9360, 9360, 9360], [4680, 2340, 2340]]);
      v.egal('… prises libres du boîtier, écart de A2', [r.parArrivee[1].phases.map((p) => p.prisesLibres), Math.round(r.parArrivee[1].ecartPourcent)], [[0, 1, 1], 50]);
      v.egal('… ok, sans note ni refus', [r.ok, r.notes, r.refus], [true, [], []]);
      const sansRetour = calculs.repartirArrivees(varianteArrivees([...Array(12).fill(2340), 2816, 1000]), elecArrivees(), arrivees);
      v.egal('sans retour en arrière : la ligne 14 (1000 W) reste sur A2 après la 13', sansRetour.lignesDetail.slice(11).map((l) => l.repere), ['A1', 'A2', 'A2']);
      const deuxieme = calculs.repartirArrivees(varianteArrivees([1000, 2800, 2800, 2800, 2800, 2800, 2800, 1700]), elecArrivees(),
        calculs.lireArrivees([{ type: 'tri', intensiteA: 32 }, { type: 'mono', intensiteA: 16 }]));
      v.egal('second essai : les plus chargées d\'abord, tout trouve sa place', deuxieme.lignesDetail.map((l) => `${l.repere}${l.phase === null ? '' : `L${l.phase}`}`),
        ['A2', 'A1L1', 'A1L2', 'A1L3', 'A1L1', 'A1L2', 'A1L3', 'A2']);
      v.egal('… note, aucun refus', [deuxieme.notes, deuxieme.refus], [['Répartition au mieux : les lignes voisines ne sont pas toutes sur la même arrivée.'], []]);
      v.egal('… arrivée mono : une seule « phase »', deuxieme.parArrivee[1].phases.map((p) => [p.numero, p.lignes, p.puissanceW]), [[null, 2, 2700]]);
      const trop = calculs.repartirArrivees(varianteArrivees([...Array(18).fill(2340), 2340, 2340]), elecArrivees(), arrivees);
      v.egal('20 lignes : 19 et 20 sans place, refus', [trop.nonPlacees, trop.refus],
        [[19, 20], [`Les arrivées ne suffisent pas : lignes 19 et 20 sans place (A1 : ${nombre(11088)} W par phase, A2 : 5632 W par phase). Ajoute une arrivée ou une plus forte, ou déplace une ligne à la main.`]]);
    },
  },
  {
    id: 'R423',
    titre: 'Répartition, correction à la main (étape 21a, spec § 4.2, cas 6) : choix repérés par la première dalle de la ligne, placés d\'abord ; débordement en watts « dépasse », prise en trop d\'un boîtier refusée (ligne sans place) ; choix oublié avec la raison ; seulement sur la variante retenue',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
      const neuf = varianteArrivees(Array(9).fill(2340));
      const un = calculs.repartirArrivees(neuf, elecArrivees(), arrivees, { manuel: { 'C1 R1': 'arr-2' } });
      v.egal('ligne 1 à la main sur A2, les autres sur A1 (phases refaites)', un.lignesDetail.map((l) => `${l.repere}L${l.phase}${l.manuel ? '*' : ''}`),
        ['A2L1*', 'A1L1', 'A1L2', 'A1L3', 'A1L1', 'A1L2', 'A1L3', 'A1L1', 'A1L2']);
      v.egal('… aucune note « aucune ligne »', un.notes, []);
      const seize = calculs.repartirArrivees(varianteArrivees(Array(16).fill(2340)), elecArrivees(), arrivees, { manuel: { 'C1 R1': 'arr-2' } });
      v.egal('16 lignes, la 1 sur A2 : 2 à 13 sur A1, 14 à 16 sur A2', seize.lignesDetail.map((l) => l.repere).join(''), 'A2' + 'A1'.repeat(12) + 'A2'.repeat(3));
      const armoire32 = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32 }]);
      const choix = (n, id) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`C${i + 1} R1`, id]));
      const depasse = calculs.repartirArrivees(neuf, elecArrivees(), armoire32, { manuel: choix(7, 'arr-2') });
      v.egal('7 lignes à la main sur une 32 A tri en armoire : alerte « dépasse »', depasse.alertes, ['Arrivée 2, phase L1 : 7020 W pour 5632 W utiles, dépasse.']);
      v.egal('… gardées, arrivée pas ok', [depasse.lignesDetail.filter((l) => l.repere === 'A2').length, depasse.parArrivee[1].ok, depasse.ok], [7, false, false]);
      const prise = calculs.repartirArrivees(neuf, elecArrivees(), arrivees, { manuel: choix(7, 'arr-2') });
      v.egal('7 lignes à la main sur le boîtier : la 7e sans prise', [prise.lignesDetail[6].placee, prise.nonPlacees, prise.refus],
        [false, [7], ['Arrivée 2 (boîtier) : 3 lignes sur L1 pour 2 prises.']]);
      v.egal('choix d\'une ligne disparue : oublié', calculs.repartirArrivees(neuf, elecArrivees(), arrivees, { manuel: { 'C99 R1': 'arr-2' } }).notes,
        ['Choix à la main oublié : la ligne qui partait de C99 R1 n\'existe plus.', 'Arrivée 2 : aucune ligne, pas besoin de la tirer.']);
      v.egal('choix d\'une arrivée retirée : oublié', calculs.repartirArrivees(neuf, elecArrivees(), arrivees, { manuel: { 'C1 R1': 'arr-9' } }).notes,
        ['Choix à la main oublié : l\'arrivée choisie pour la ligne qui partait de C1 R1 n\'existe plus.', 'Arrivée 2 : aucune ligne, pas besoin de la tirer.']);
      const autre = calculs.repartirArrivees(neuf, elecArrivees(), arrivees, { manuel: { 'C1 R1': 'arr-2' }, retenue: false });
      v.egal('autre variante que la retenue : conseil seul, note', [new Set(autre.lignesDetail.map((l) => l.repere)), autre.notes[0]],
        [new Set(['A1']), 'Choix à la main : seulement sur la variante retenue dans Élec.']);
    },
  },
  {
    id: 'R424',
    titre: 'Répartition sur un vrai mur (étape 21a, spec § 3) : lignes de la variante conseillée calculée sur l\'arrivée de calcul, alertes de l\'arrivée unique remplacées par celles de la répartition ; la variante réécrite garde ses dalles, sa puissance et son ordre',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
      const m = calculs.mur(DALLE_CAS_13, 48, 6);
      const { elec, variante } = varianteConseil(m, DALLE_CAS_13, { arrivee: calculs.arriveeDeCalcul(arrivees), depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      v.vrai('sur la seule 63 A tri, une phase déborde (alerte d\'aujourd\'hui)', elec.alertes.some((a) => a.startsWith('Arrivée tri 63 A')), elec.alertes);
      const r = calculs.repartirArrivees(variante, elec, arrivees);
      v.egal('avec la 32 A tri en boîtier : tout passe', [r.ok, r.refus, r.nonPlacees], [true, [], []]);
      v.vrai('chaque phase sous sa capacité', r.parArrivee.every((a) => a.phases.every((p) => p.puissanceW <= a.capaciteW)));
      v.egal('mêmes lignes, mêmes dalles, même ordre', r.lignesDetail.map((l) => [l.numero, l.dalles.join(), l.puissanceW]), variante.lignesDetail.map((l) => [l.numero, l.dalles.join(), l.puissanceW]));
      v.vrai('alertes de capacité de la variante retirées', !r.alertes.some((a) => a.startsWith('Une phase dépasse')), r.alertes);
      v.egal('repères dans l\'ordre du câblage : A1 d\'abord, puis A2', [...new Set(r.lignesDetail.map((l) => l.repere))], ['A1', 'A2']);
    },
  },
  {
    id: 'R425',
    titre: 'Distribution par arrivée (étape 21a, spec § 4.3) : arrivée en boîtier, ses lignes sur son boîtier, P17 depuis sa distance ; armoire près ou loin avec sa distance ; boîtiers numérotés dans l\'ordre du câblage ; boîtiers disponibles pris d\'abord par l\'arrivée en boîtier ; refus qui nomme l\'arrivée ; ligne sans place ; une seule arrivée en armoire : comme avant',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const mur = { largeurMm: 8000, hauteurMm: 3000 };
      const liste = (d1, d2 = 30, materiel1 = undefined) => calculs.lireArrivees([{ type: 'tri', intensiteA: 63, distanceM: d1, ...(materiel1 ? { materiel: materiel1 } : {}) }, { type: 'tri', intensiteA: 32, branchement: 'boitier', distanceM: d2 }]);
      const dist = (arrivees, options = {}) => {
        const r = calculs.repartirArrivees(varianteArrivees(Array(16).fill(2340)), elecArrivees(), arrivees);
        return calculs.distributionElec(mur, r, elecArrivees(), { depart: 'bas-gauche', mode: 'stack', arrivees, ...options });
      };
      const pres = dist(liste(5));
      v.egal('A1 à 5 m : lignes 1 à 12 en direct ; A2 : boîtier B1 avec 13 à 16', [pres.lignes.map((l) => `${l.numero}${l.depuis}`).join(' '), contenuBoitiers(pres)],
        [`${Array.from({ length: 12 }, (_, i) => `${i + 1}armoire`).join(' ')} 13B1 14B1 15B1 16B1`, ['13L1 14L2 15L3 16L1']]);
      v.egal('… le boîtier dit son arrivée', [pres.boitiers[0].arrivee, pres.boitiers[0].repere], ['arr-2', 'A2']);
      v.egal('… chaque ligne dit son arrivée', [pres.lignes[0].arrivee, pres.lignes[15].arrivee], ['arr-1', 'arr-2']);
      v.egal('… P17 de A2 : (30 m + 7 m le long du bord) × 1,1', pres.cables.p17.longueursM.map((x) => Math.round(x * 10) / 10), [40.7]);
      v.egal('… ce que chaque armoire fournit', [pres.armoire, pres.parArrivee.map((a) => [a.repere, a.sortiesP17, a.prises16])],
        [{ sortiesP17: 0, prises16: 12 }, [['A1', 0, 12], ['A2', 0, 0]]]);
      const loin = dist(liste(25));
      v.egal('A1 à 25 m : deux boîtiers pour A1, puis celui de A2, dans l\'ordre du câblage', [contenuBoitiers(loin), loin.boitiers.map((b) => b.repere)],
        [['1L1 2L2 3L3 4L1 5L2 6L3', '7L1 8L2 9L3 10L1 11L2 12L3', '13L1 14L2 15L3 16L1'], ['A1', 'A1', 'A2']]);
      const limite = dist(liste(25, 30, { prises16: 3 }), { choix: 'materiel', materiel: { boitiers: 2 } });
      v.egal('2 boîtiers disponibles : un pour A2, un pour A1, 3 prises sur l\'armoire de A1', [contenuBoitiers(limite).length, limite.lignes.filter((l) => l.depuis === null).map((l) => l.numero)],
        [2, [10, 11, 12]]);
      v.vrai('… refus qui nomme l\'arrivée et propose de déplacer une ligne', /^Arrivée 1 : il manque 3 prises 16 A.*, ou déplace une ligne sur une autre arrivée\.$/.test(limite.refus ?? ''), limite.refus);
      const r = calculs.repartirArrivees(varianteArrivees(Array(9).fill(2340)), elecArrivees(), calculs.lireArrivees([{ type: 'tri', intensiteA: 32, branchement: 'boitier' }]), { manuel: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`C${i + 1} R1`, 'arr-1'])) });
      const sansPlace = calculs.distributionElec(mur, r, elecArrivees(), { depart: 'bas-gauche', arrivees: calculs.lireArrivees([{ type: 'tri', intensiteA: 32, branchement: 'boitier' }]) });
      v.egal('ligne sans place dans la répartition : prise à trouver', sansPlace.lignes.filter((l) => l.depuis === null).map((l) => l.numero), [7, 8, 9].filter((n) => !r.lignesDetail[n - 1].placee));
      const seule = calculs.lireArrivees([{ type: 'tri', intensiteA: 63, distanceM: 25 }]);
      const variante = varianteFictive([1, 2, 3, 1, 2, 3, 1]);
      v.egal('une seule arrivée en armoire : la distribution d\'avant',
        calculs.distributionElec(MUR_FICTIF, variante, ELEC_TRI_FICTIF, { depart: 'bas-gauche', distanceArmoireM: 25, arrivees: seule }),
        calculs.distributionElec(MUR_FICTIF, variante, ELEC_TRI_FICTIF, { depart: 'bas-gauche', distanceArmoireM: 25 }));
    },
  },
  {
    id: 'R426',
    titre: 'Texte copié d\'Élec avec plusieurs arrivées (étape 21a, spec § 4.4 et 4.6) : « Arrivées : 2 », chaque arrivée avec sa capacité et ses lignes, ses phases, son écart ; lignes choisies à la main ; sans les lignes et alertes de l\'arrivée unique ; rappel des arrivées ; une seule arrivée : le texte d\'avant',
    etape: '21a',
    verifier(v) {
      if (typeof calculs.repartirArrivees !== 'function') { v.vrai('repartirArrivees exportée par calculs.js', false); return; }
      const arrivees = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }, { type: 'tri', intensiteA: 32, branchement: 'boitier' }]);
      const m = calculs.mur(DALLE_CAS_13, 48, 6);
      const { elec, variante } = varianteConseil(m, DALLE_CAS_13, { arrivee: calculs.arriveeDeCalcul(arrivees), depart: 'bas-gauche' }, { depart: 'bas-gauche' });
      const r = calculs.repartirArrivees(variante, elec, arrivees, { manuel: { [variante.lignesDetail[0].dalles[0]]: 'arr-2' } });
      const texte = resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m, repartition: r });
      const lignes = texte.split('\n');
      v.vrai('« Arrivées : 2 »', lignes.includes('Arrivées : 2'), texte);
      v.vrai('arrivée 1 : capacité et lignes', lignes.some((l) => l.startsWith('Arrivée 1 : tri 63 A, 11 088 W utiles par phase, lignes ')), texte);
      v.vrai('arrivée 2 : en direct sur un boîtier', lignes.some((l) => l.startsWith('Arrivée 2 : tri 32 A, 5632 W utiles par phase, en direct sur un boîtier, lignes 1')), texte);
      v.vrai('phases par arrivée', lignes.some((l) => /^Arrivée 1, phase L1 : \d+ lignes?, /.test(l)) && lignes.some((l) => /^Arrivée 2, phase L3 : /.test(l)), texte);
      v.vrai('écart par arrivée', lignes.some((l) => /^Arrivée 1, écart entre phases : \d+ %$/.test(l)), texte);
      v.vrai('ligne choisie à la main', lignes.includes('Ligne 1 : arrivée 2, choisie à la main'), texte);
      v.vrai('sans les lignes de l\'arrivée unique', !lignes.some((l) => /^(Arrivée : |Répartition : |Phase L\d : |Au minimum de lignes : )/.test(l)), texte);
      v.vrai('sans l\'alerte « Il faut une arrivée plus forte »', !texte.includes('Il faut une arrivée plus forte'), texte);
      v.vrai('rappel des arrivées', lignes.includes(`Rappel : ${calculs.RAPPEL_ARRIVEES}`) && calculs.RAPPEL_ARRIVEES.startsWith('Plusieurs arrivées : chaque ligne reste sur son arrivée'), texte);
      const seule = calculs.lireArrivees([{ type: 'tri', intensiteA: 63 }]);
      const r1 = calculs.repartirArrivees(variante, elec, seule);
      v.egal('une seule arrivée : le texte d\'avant', resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m, repartition: r1 }), resumes.resumeElec(elec, { dalle: DALLE_CAS_13, mur: m }));
    },
  },
  {
    id: 'R427',
    titre: 'Saisies d\'un mur dans une presta exportée (correctif du lot 21b) : le formulaire de la distribution d\'Élec (distance de l\'arrivée 1 et son matériel) fait partie des saisies gardées à l\'import',
    etape: '21b',
    verifier(v) {
      v.vrai('form-distribution dans FORMULAIRES_SAISIES', prestas.FORMULAIRES_SAISIES.includes('form-distribution'), prestas.FORMULAIRES_SAISIES);
    },
  },
  {
    id: 'R428',
    titre: 'Cascade USB des processeurs Novastar (étape 22a, spec § 4.1.3, F10) : `cascadeMax` sourcé sur la fiche du constructeur, MCTRL4K 10 (fiche V1.2.1, p. 5), MCTRL R5 8 (fiche V1.0.5, p. 4), MCTRL660 PRO 8 (fiche V1.4.1, p. 4) ; absent ailleurs (VX1000 : cascade USB sans maximum écrit)',
    etape: '22a',
    verifier(v, contexte) {
      const champ = (id) => {
        const p = processeurDeBase(contexte, id);
        return [p.cascadeMax, p.sources.cascadeMax?.source.id, p.sources.cascadeMax?.source.confiance, p.sources.cascadeMax?.note];
      };
      v.egal('MCTRL4K : 10, fiche V1.2.1', champ('novastar-mctrl4k'), [10, 'novastar-mctrl4k-v1-2-1', 'constructeur', '« Up to 10 units can be cascaded », p. 5']);
      v.egal('MCTRL R5 : 8, fiche V1.0.5', champ('novastar-mctrl-r5'), [8, 'novastar-mctrl-r5-v1-0-5', 'constructeur', '« Up to 8 devices can be cascaded », p. 4']);
      v.egal('MCTRL660 PRO : 8, fiche V1.4.1', champ('novastar-mctrl660-pro'), [8, 'novastar-mctrl660-pro-v1-4-1', 'constructeur', '« Up to 8 devices can be cascaded », p. 4']);
      v.egal('VX1000, MCTRL660, H5 : pas de maximum', ['novastar-vx1000', 'novastar-mctrl660', 'novastar-h5'].map((id) => processeurDeBase(contexte, id).cascadeMax), [undefined, undefined, undefined]);
    },
  },
  {
    id: 'R429',
    titre: 'Secours par un second processeur NovaLCT (étape 22a, spec § 5.1 et 5.2) : réglages `secours` et `liaisonSecours`, `portsDoubles` faux, contrôles et découpage comme sans redondance (ports principaux non doublés, capacité de l\'appareil sans moitié), nombre pair de colonnes par port gardé, `nombreSecours` = N et `nombreTotal` = 2N ; secours dans le même processeur : le calcul d\'avant ; saisie d\'avant l\'étape 22 : secours dans le même processeur',
    etape: '22a',
    verifier(v, contexte) {
      const x = (reglages) => exercice(contexte, 8, 6, 'novastar-mctrl660-pro', reglages);
      const e = x({ redondance: true, secours: 'processeur' }).e;
      v.egal('réglages : secours par un second processeur, sans cascade par défaut, ports non doublés',
        [e.reglages.redondance, e.reglages.secours, e.reglages.liaisonSecours, e.reglages.portsDoubles], [true, 'processeur', 'sansCascade', false]);
      v.egal('1 × MCTRL660 Pro + 1 de secours (au lieu de 2 avec les ports doublés)', [e.nombre, e.nombreSecours, e.nombreTotal], [1, 1, 2]);
      v.egal('ports comparés aux 6 du processeur, non doublés', [e.controles.ports.valeur, e.controles.ports.limite, e.controles.ports.principaux], [4, 6, false]);
      v.egal('capacité de l\'appareil : ses 6 ports, plafonnée par les 2,3 M px de la fiche', [e.capaciteAppareil.ports, e.capaciteAppareil.valeur], [6, 2300000]);
      v.egal('nombre pair de colonnes par port gardé', [e.colonnesPaires, e.global.colonnes.colonnesParPort, e.totaux.ports.colonnes], [true, 2, 4]);
      v.egal('résumé du secours', [e.secoursProcesseur?.nombre, e.secoursProcesseur?.liaison, e.secoursProcesseur?.texte],
        [1, 'sansCascade', 'par un second processeur (sans cascade, Primary et Backup)']);
      const ports = x({ redondance: true, secours: 'ports' }).e;
      v.egal('secours dans le même processeur : 2 × MCTRL660 Pro, ports doublés', [ports.nombre, ports.nombreSecours, ports.nombreTotal, ports.reglages.portsDoubles, ports.capaciteAppareil.ports, ports.capaciteAppareil.valeur, ports.secoursProcesseur],
        [2, 0, 2, true, 3, 1950000, null]);
      const avant = x({ redondance: true }).e;
      v.egal('saisie d\'avant l\'étape 22 (sans champ) : secours dans le même processeur', [avant.nombre, avant.reglages.secours, avant.reglages.portsDoubles, avant.nombreTotal], [2, 'ports', true, 2]);
      v.egal('… même découpage et mêmes totaux qu\'avec « ports »', JSON.stringify([avant.groupes, avant.totaux, avant.alertes]), JSON.stringify([ports.groupes, ports.totaux, ports.alertes]));
      const sans = x({ redondance: false, secours: 'processeur', liaisonSecours: 'cascade' }).e;
      v.egal('redondance non cochée : réglages ignorés', [sans.nombre, sans.nombreSecours, sans.nombreTotal, sans.reglages.secours, sans.reglages.portsDoubles, sans.secoursProcesseur], [1, 0, 1, 'ports', false, null]);
      const deux = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' }).e;
      v.egal('32 × 8 sur MCTRL4K : 2 + 2 de secours', [deux.nombre, deux.nombreSecours, deux.nombreTotal], [2, 2, 4]);
      v.vrai('convertisseurs de la fibre du secours : note', deux.notes.includes('Fibre du secours : chaque processeur de secours a ses propres convertisseurs, à vérifier.'), deux.notes);
      v.egal('… comptés par processeur, secours compris (CVT4K)', [deux.totaux.distributeurs.colonnes, deux.secoursProcesseur.distributeurs], [2, 2]);
    },
  },
  {
    id: 'R430',
    titre: 'Secours par un second processeur hors NovaLCT (étape 22a, spec § 5.1 et 5.2) : Brompton et COEX gardent la redondance de leur marque (ports doublés), avec la note du conseil ; série H en cascade refusée ; cascade au-delà du maximum du modèle : alerte ; modèle sans maximum : note',
    etape: '22a',
    verifier(v, contexte) {
      const s8 = (secours) => xBp2(contexte, 'brompton-s8', 12, 6, { redondance: true, secours }).e;
      const a = s8('processeur');
      const b = s8('ports');
      v.egal('S8 : ports doublés, comme le secours dans le même processeur', [a.reglages.portsDoubles, a.reglages.secours, a.nombre, a.nombreSecours, a.nombreTotal], [true, 'ports', b.nombre, 0, b.nombre]);
      v.egal('… mêmes groupes et totaux', JSON.stringify([a.groupes, a.totaux]), JSON.stringify([b.groupes, b.totaux]));
      v.vrai('… note du conseil', a.notes.includes(calculs.NOTE_SECOURS_AUTRES_MARQUES) && !b.notes.includes(calculs.NOTE_SECOURS_AUTRES_MARQUES), a.notes);
      v.egal('texte de la note', calculs.NOTE_SECOURS_AUTRES_MARQUES, 'Secours par un second processeur : seulement pour les processeurs NovaLCT ; les autres sont comptés avec le secours dans le même processeur (ports doublés), une protection différente.');
      const coex = exercice(contexte, 8, 6, 'coex-mx40-pro', { redondance: true, secours: 'processeur' }).e;
      v.egal('MX40 Pro (VMP) : ports doublés', [coex.reglages.portsDoubles, coex.nombreSecours], [true, 0]);
      const h5 = (liaisonSecours) => exercice(contexte, 16, 8, 'novastar-h5', { redondance: true, secours: 'processeur', liaisonSecours }).e;
      v.egal('série H en cascade : refus', h5('cascade').impossible, 'La série H ne se cascade pas en USB : prends la liaison sans cascade.');
      v.egal('série H sans cascade : 1 + 1 de secours', [h5('sansCascade').impossible, h5('sansCascade').nombreTotal], [null, 2]);
      const pro = (colonnes, liaisonSecours) => exercice(contexte, colonnes, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur', liaisonSecours }).e;
      const cinq = pro(50, 'cascade');
      v.egal('50 × 6 en cascade : 5 + 5 de secours, 10 boîtiers pour 8', [cinq.nombre, cinq.secoursProcesseur.cascade], [5, { boitiers: 10, max: 8, depasse: true, source: 'fiche MCTRL660 Pro V1.4.1, p. 4' }]);
      v.vrai('… alerte', cinq.alertes.includes('Cascade : 10 boîtiers (5 + 5 de secours), au-delà des 8 du MCTRL660 Pro en cascade USB (fiche MCTRL660 Pro V1.4.1, p. 4) : prends la liaison sans cascade.'), cinq.alertes);
      v.egal('… sans cascade : pas d\'alerte de cascade', [pro(50, 'sansCascade').secoursProcesseur.cascade, pro(50, 'sansCascade').alertes.some((t) => t.startsWith('Cascade'))], [null, false]);
      const quatre = pro(40, 'cascade');
      v.egal('40 × 6 en cascade : 8 boîtiers pour 8, ça passe', [quatre.nombre, quatre.secoursProcesseur.cascade.depasse, quatre.alertes.some((t) => t.startsWith('Cascade'))], [4, false, false]);
      const vx = exercice(contexte, 8, 6, 'novastar-vx1000', { redondance: true, secours: 'processeur', liaisonSecours: 'cascade' }).e;
      v.egal('VX1000 en cascade : maximum non écrit', vx.secoursProcesseur.cascade, { boitiers: 2, max: null, depasse: false, source: null });
      v.vrai('… note', vx.notes.includes('Liaison de cascade du VX1000 : nombre de boîtiers au plus, vois la fiche du processeur, à vérifier.'), vx.notes);
    },
  },
  {
    id: 'R431',
    titre: 'Parc et processeur conseillé avec un processeur de secours (étape 22a, spec § 5.2) : le parc compare 2N (« Il en faut 4 × MCTRL4K (2 + 2 de secours), le parc A en a 3. ») ; conseil sur le nombre total de boîtiers ; marque Novastar avec ce réglage : processeurs NovaLCT seulement',
    etape: '22a',
    verifier(v, contexte) {
      const deux = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' }).e;
      const q = (n) => calculs.controleQuantiteProcesseur(deux, n, 'A');
      v.egal('3 dans le parc : manque', [q(3).assez, q(3).alerte], [false, 'Il en faut 4 × MCTRL4K (2 + 2 de secours), le parc A en a 3.']);
      v.egal('4 dans le parc : assez', [q(4).assez, q(4).alerte], [true, null]);
      const sans = exercice(contexte, 32, 8, 'novastar-mctrl4k', {}).e;
      v.egal('sans secours : le texte d\'avant', calculs.controleQuantiteProcesseur(sans, 1, 'A').alerte, 'Il en faut 2 × MCTRL4K, le parc A en a 1.');
      const evals = (reglages, ids = ['novastar-mctrl660-pro', 'novastar-mctrl4k']) => ids.map((id) => exercice(contexte, 8, 6, id, reglages).e);
      v.egal('ports doublés : 1 MCTRL4K plutôt que 2 MCTRL660 Pro', calculs.processeurConseille(evals({ redondance: true })).processeur.id, 'novastar-mctrl4k');
      const secours = evals({ redondance: true, secours: 'processeur' });
      v.egal('second processeur : 1 + 1 de chaque, le plus petit (MCTRL660 Pro)', calculs.processeurConseille(secours).processeur.id, 'novastar-mctrl660-pro');
      v.egal('… parc avec 1 seul MCTRL660 Pro : il en faut 2, MCTRL4K', calculs.processeurConseille(secours, { quantites: { 'novastar-mctrl660-pro': 1 } }).processeur.id, 'novastar-mctrl4k');
      const melange = evals({ redondance: true, secours: 'processeur' }, ['novastar-mctrl660-pro', 'coex-mx40-pro']);
      v.egal('MX40 Pro (ports doublés, 1 boîtier) face au MCTRL660 Pro (1 + 1) : MX40 Pro', calculs.processeurConseille(melange).processeur.id, 'coex-mx40-pro');
      v.egal('… conseil limité aux NovaLCT (marque Novastar, second processeur)', calculs.processeurConseille(melange, { seulementNovaLCT: true }).processeur.id, 'novastar-mctrl660-pro');
    },
  },
  {
    id: 'R432',
    titre: 'Câblage avec un processeur de secours (étape 22a, spec § 4 et 5.3) : secours de chaque port sur le processeur n + N, même numéro de port, à la dernière dalle de la chaîne, sans convention ; ports principaux non divisés par deux ; chaîne du Schéma sans fibres de secours sur le principal',
    etape: '22a',
    verifier(v, contexte) {
      const x = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur' });
      const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche' });
      const c = t.variantes.find((y) => y.mode === 'colonnes');
      v.egal('4 ports principaux sur 6, possible', [c.possible, c.processeurs.length, c.processeurs[0].ports.map((p) => p.numero)], [true, 1, [1, 2, 3, 4]]);
      v.egal('secours : processeur n° 2, même port', c.processeurs[0].ports.map((p) => [p.secours.processeur, p.secours.numero, p.secours.libelle, p.secours.convention]),
        [1, 2, 3, 4].map((k) => [2, k, `secours n° 2, port ${k}`, false]));
      v.egal('retour depuis la dernière dalle, court (2 colonnes par port)', c.processeurs[0].ports.map((p) => p.secours.long), [false, false, false, false]);
      v.egal('secours et câbles de tête comptés', [c.portsSecours, c.cablesTete], [4, 8]);
      v.egal('note du secours', c.noteSecours, 'Secours : le processeur de secours n° 2 double le principal n° 1 ; chaque port de secours part de la dernière dalle de la chaîne du même port du principal.');
      const ports = calculs.cablageData(x.m, x.dalle, exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true }).e, { depart: 'bas-gauche' });
      v.vrai('secours dans le même processeur : convention port p + moitié, comme avant', ports.variantes.find((y) => y.mode === 'colonnes').processeurs[0].ports[0].secours.convention, ports);
      const d = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' });
      const cd = calculs.cablageData(d.m, d.dalle, d.e, { depart: 'bas-gauche' }).variantes.find((y) => y.mode === 'colonnes');
      v.egal('2 principaux : secours n° 3 et n° 4', cd.processeurs.map((p) => p.ports[0].secours.libelle), ['secours n° 3, port 1', 'secours n° 4, port 1']);
      v.egal('… note', cd.noteSecours, 'Secours : les processeurs de secours n° 3 à 4 doublent les principaux n° 1 à 2 (le secours de n est n + 2) ; chaque port de secours part de la dernière dalle de la chaîne du même port du principal.');
      const f = calculs.cablageData(d.m, d.dalle, d.e, { depart: 'bas-gauche', imposee: { ports: null, fibre: true }, distributeurs: distributeursDeBase(contexte), distanceRegieM: 50 });
      const ch = calculs.chaineSchema({ chaine: null, evaluation: d.e, variante: varianteImposee(f), distanceM: 50 });
      v.vrai('chaîne en fibre : pas de fibre de secours OPT3 ou OPT4 sur le principal', ch.aval.every((el) => !/secours/.test(el.liaison?.texte ?? '')), ch.aval.map((el) => el.liaison?.texte));
    },
  },
  {
    id: 'R433',
    titre: 'Liste de matériel avec un processeur de secours (étape 22a, spec § 5.3) : processeurs principaux et de secours sur une ligne ; sans cascade, switch et câbles Ethernet de contrôle (2N + 1) pour un modèle à contrôle Ethernet connu, sinon un câble USB par boîtier ; cascade : 2N − 1 câbles USB A vers B et un câble vers l\'ordinateur',
    etape: '22a',
    verifier(v, contexte) {
      const lignes = (procId, liaisonSecours, colonnes = 8) => {
        const x = exercice(contexte, colonnes, 6, procId, { redondance: true, secours: 'processeur', liaisonSecours });
        const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche', distanceRegieM: 8 });
        const data = { evaluation: x.e, variante: t.variantes.find((y) => y.mode === t.conseil), distanceRegieM: 8 };
        return calculs.listeMateriel({ mur: x.m, dalle: x.dalle, data }).sections.find((s) => s.id === 'data').lignes;
      };
      const texte = (l) => `${l.quantite} ${l.designation}${l.longueurM ? ` ${l.longueurM} m` : ''} : ${l.detail}`;
      const sans = lignes('novastar-mctrl660-pro', 'sansCascade');
      const pro = processeurDeBase(contexte, 'novastar-mctrl660-pro');
      v.egal('processeurs : 2, dont 1 de secours, même clé', [sans[0].cle, sans[0].quantite, sans[0].designation, sans[0].detail], ['processeur|novastar-mctrl660-pro', 2, pro.nom, 'retenu dans Data, 1 + 1 de secours']);
      v.egal('sans cascade, MCTRL660 PRO (contrôle Ethernet) : switch et 3 câbles', sans.filter((l) => l.cle.startsWith('controle|')).map(texte), [
        '1 Switch réseau : pour piloter les 2 boîtiers en Ethernet, une adresse par boîtier réglée en façade',
        '3 Câble Ethernet de contrôle : un par boîtier, un vers l\'ordinateur (choix de conception)',
      ]);
      v.egal('4 câbles de tête et 4 retours de secours', [sans.filter((l) => /^Câble de tête/.test(l.designation)).reduce((s, l) => s + l.quantite, 0), sans.filter((l) => /^Retour de secours/.test(l.designation)).reduce((s, l) => s + l.quantite, 0)], [4, 4]);
      v.egal('cascade : 1 câble de cascade, 1 vers l\'ordinateur', lignes('novastar-mctrl660-pro', 'cascade').filter((l) => l.cle.startsWith('controle|')).map(texte), [
        '1 Câble USB A vers B (USB 2.0), cascade des processeurs : de l\'USB OUT de chaque boîtier à l\'USB IN du suivant',
        '1 Câble USB vers l\'ordinateur : vers l\'USB IN du boîtier 1',
      ]);
      v.egal('cascade, 5 + 5 : 9 câbles de cascade', lignes('novastar-mctrl660-pro', 'cascade', 50).find((l) => l.cle === 'controle|usb-cascade').quantite, 9);
      v.egal('sans cascade, MCTRL660 (contrôle non connu) : un câble USB par boîtier', lignes('novastar-mctrl660', 'sansCascade').filter((l) => l.cle.startsWith('controle|')).map(texte), [
        '2 Câble USB vers l\'ordinateur : un par boîtier ; liaison au PC : vois la fiche du processeur, à vérifier',
      ]);
      const x = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true });
      const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche', distanceRegieM: 8 });
      const avant = calculs.listeMateriel({ mur: x.m, dalle: x.dalle, data: { evaluation: x.e, variante: t.variantes.find((y) => y.mode === t.conseil), distanceRegieM: 8 } }).sections.find((s) => s.id === 'data').lignes;
      v.egal('secours dans le même processeur : sans ligne de contrôle, comme avant', [avant[0].quantite, avant[0].detail, avant.some((l) => l.cle.startsWith('controle|'))], [2, 'retenu dans Data', false]);
    },
  },
  {
    id: 'R434',
    titre: 'Chaîne vidéo avec un processeur de secours (étape 22a, spec § 5.3) : 2N entrées à alimenter (sorties de régie demandées), alerte « à vérifier » sur la boucle vidéo, MCTRL4K sans sortie vidéo en boucle',
    etape: '22a',
    verifier(v, contexte) {
      const x = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' });
      const liaisons = liaisonsDeBase(contexte);
      const chaine = { source: { nom: 'Source', largeurPx: 3840, hauteurPx: 2160, frequenceHz: 60 }, liaison: 'hdmi-2.0', longueurM: 5, convertisseurs: [] };
      const r = calculs.controleChaine(chaine, { evaluation: x.e, liaisons, frequenceCalculHz: 60 });
      v.vrai('alerte des 4 entrées', r.alertes.includes('Secours par un second processeur : 4 entrées à alimenter (2 + 2 de secours), même format et même fréquence que les principaux : '
        + 'deux sorties de régie ou un distributeur vidéo. Le MCTRL4K n\'a pas de sortie vidéo en boucle (LOOP : genlock seulement ; manuel MCTRL4K V1.2.1, p. 4). '
        + 'Boucler la vidéo par le principal en ferait un point unique de panne : à vérifier.'), r.alertes);
      const regie = regieDeBase(contexte, 'barco-e2-gen2');
      const source = { largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60 };
      v.egal('régie : 4 sorties demandées', calculs.controleRegie(regie, x.e, source, liaisons).sortiesNecessaires, 4);
      const sans = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true });
      v.egal('secours dans le même processeur : 2 sorties, sans alerte de secours', [calculs.controleRegie(regie, sans.e, source, liaisons).sortiesNecessaires,
        calculs.controleChaine(chaine, { evaluation: sans.e, liaisons, frequenceCalculHz: 60 }).alertes.some((a) => a.startsWith('Secours par un second processeur'))], [2, false]);
      const vx = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur' });
      const rv = calculs.controleChaine(chaine, { evaluation: vx.e, liaisons, frequenceCalculHz: 60 });
      v.vrai('MCTRL660 Pro : sans la phrase du MCTRL4K', rv.alertes.some((a) => a.startsWith('Secours par un second processeur : 2 entrées à alimenter (1 + 1 de secours)') && !a.includes('LOOP')), rv.alertes);
    },
  },
  {
    id: 'R435',
    titre: 'Textes copiés avec un processeur de secours (étape 22a, spec § 5.2) : « Processeur : 1 × … + 1 de secours », « Redondance : par un second processeur (sans cascade, Primary et Backup) », ports non doublés, consommation, poids et hauteur en rack × 2N ; Canvas : processeurs et secours ; secours dans le même processeur : le texte d\'avant',
    etape: '22a',
    verifier(v, contexte) {
      const x = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur' });
      const texte = resumes.resumeData(x.e);
      const lignes = texte.split('\n');
      v.vrai('processeur et secours', lignes.includes(`Processeur : 1 × ${x.e.processeur.nom} + 1 de secours`), texte);
      v.vrai('redondance', lignes.includes('Redondance : par un second processeur (sans cascade, Primary et Backup)'), texte);
      v.vrai('pas de « Ports avec la redondance »', !lignes.some((l) => l.startsWith('Ports avec la redondance')), texte);
      v.vrai('ports du processeur non doublés', lignes.includes('MCTRL660 Pro n° 1 : colonnes 1 à 8 (48 dalles, 4 ports)'), texte);
      v.vrai('capacité de l\'appareil sur ses 6 ports', ligneDe(texte, 'Capacité de l\'appareil').startsWith('Capacité de l\'appareil : min(6 ports × '), texte);
      v.vrai('total des boîtiers', lignes.includes('Processeurs avec les secours : 2 × MCTRL660 Pro, 40 W, 9,2 kg, 2U'), texte);
      const cascade = resumes.resumeData(exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur', liaisonSecours: 'cascade' }).e);
      v.vrai('cascade', cascade.split('\n').includes('Redondance : par un second processeur (cascade, tableau)'), cascade);
      const avant = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true });
      const tAvant = resumes.resumeData(avant.e);
      v.egal('secours dans le même processeur : le texte d\'avant', tAvant, resumes.resumeData(exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'ports' }).e));
      v.vrai('… sans ligne de secours', !/de secours$|^Redondance : |^Processeurs avec les secours/m.test(tAvant), tAvant);
      const liaisons = liaisonsDeBase(contexte);
      const source = { ...calculs.sourceConseillee(x.e, liaisons, 60), bits: 8, espace: 'RGB', plage: 'Full' };
      const canvas = calculs.controleSource(source, x.e, liaisons, { famille: 'novastar', bitsReseau: 8, frequenceHz: 60 });
      const tc = resumes.resumeCanvas(canvas, { evaluation: x.e, source });
      v.vrai('Canvas : processeurs et secours', tc.split('\n').includes(`Processeurs : 1 × ${x.e.processeur.nom} + 1 de secours`), tc);
    },
  },
  {
    id: 'R436',
    titre: 'Contrôle Ethernet de la liste de matériel (étape 22a) : les processeurs NovaLCT à contrôle Ethernet connu sont ceux de la fiche « Brancher l\'ordinateur » (CONTROLE_PROCESSEURS)',
    etape: '22a',
    verifier(v, contexte) {
      const novaLCT = new Set(baseProcesseurs(contexte).processeurs.filter((p) => p.logiciel === 'NovaLCT').map((p) => p.id));
      const attendus = connexion.CONTROLE_PROCESSEURS.flatMap((c) => c.ids).filter((id) => novaLCT.has(id)).sort();
      v.egal('mêmes modèles', [...calculs.CONTROLE_ETHERNET_NOVALCT].sort(), attendus);
    },
  },
  {
    id: 'R437',
    titre: 'NovaLCT pas à pas avec un processeur de secours (lot 22b ; garde-fou remplacé au lot 22c avec l\'accord de l\'utilisateur) : B.11 du principal sans tableau, « Réglé en principal (Primary) » ; fibre (0.7) sans les ports de secours du même processeur ; secours dans le même processeur : B.11 avec son tableau',
    etape: '22b',
    verifier(v, contexte) {
      const upad = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const p = pasAPasNovaLCT(contexte, { dalle: upad, colonnes: 8, lignes: 6, procId: 'novastar-mctrl4k', reglages: { redondance: true, secours: 'processeur' } });
      const b11 = etapeNovaLCT(p, 'P1.B.11');
      v.egal('B.11 : sans tableau', b11?.tableau ?? null, null);
      v.egal('B.11 : réglé en principal', b11?.titre, 'Réglé en principal (Primary)');
      const fibres = etapeNovaLCT(p, '0.7')?.valeurs.fibres ?? [];
      v.vrai('fibre : OPT1 seulement, pas de port de secours sur le principal', fibres.length === 1 && fibres[0].startsWith('OPT1') && !fibres[0].includes('OPT2'), fibres);
      const ports = pasAPasNovaLCT(contexte, { dalle: upad, colonnes: 8, lignes: 6, procId: 'novastar-mctrl4k', reglages: { redondance: true } });
      v.vrai('secours dans le même processeur : B.11 avec son tableau', etapeNovaLCT(ports, 'P1.B.11')?.tableau?.lignes.length === 4
        && etapeNovaLCT(ports, 'P1.B.11').texte.includes('Onglet Sending Card, Redundancy, Add'), etapeNovaLCT(ports, 'P1.B.11'));
      v.vrai('… et la fibre de secours OPT2', (etapeNovaLCT(ports, '0.7')?.valeurs.fibres ?? []).join().includes('OPT2'), etapeNovaLCT(ports, '0.7')?.valeurs.fibres);
    },
  },
  {
    id: 'R438',
    titre: 'Chaîne du Schéma avec un processeur de secours (lot 22b, cadre « MCTRL4K secours n° 3 ») : amont « 2 × MCTRL4K + 2 de secours » ; chaque processeur principal a son secours (numéro n + N, nom, ports), une ligne du texte copié ; ses convertisseurs ne sont pas ceux du principal ; secours dans le même processeur : rien ne change',
    etape: '22b',
    verifier(v, contexte) {
      const chaine = (colonnes, procId, reglages, options = {}) => {
        const x = exercice(contexte, colonnes, colonnes > 8 ? 8 : 6, procId, reglages);
        const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche', distributeurs: distributeursDeBase(contexte), ...options });
        return calculs.chaineSchema({ chaine: null, evaluation: x.e, variante: t.variantes.find((y) => y.mode === (t.retenue ?? t.conseil)), distanceM: 20 });
      };
      const un = chaine(8, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur' });
      v.egal('amont : 1 + 1 de secours', un.amont.noeuds.at(-1).nom, 'MCTRL660 Pro + 1 de secours');
      v.egal('aval : le secours du principal', un.aval.map((e) => [e.nom, e.secours]), [['MCTRL660 Pro', { numero: 2, nom: 'MCTRL660 Pro secours n° 2', ports: [1, 2, 3, 4] }]]);
      v.vrai('texte copié : la ligne du secours', un.texte.includes('MCTRL660 Pro secours n° 2 : un retour de secours par port, depuis la dernière dalle de chaque port du MCTRL660 Pro.'), un.texte);
      const deux = chaine(32, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' });
      v.egal('amont : 2 + 2 de secours', deux.amont.noeuds.at(-1).nom, '2 × MCTRL4K + 2 de secours');
      v.egal('aval : secours n° 3 et n° 4', deux.aval.map((e) => [e.nom, e.secours?.nom, e.secours?.numero]), [['MCTRL4K n° 1', 'MCTRL4K secours n° 3', 3], ['MCTRL4K n° 2', 'MCTRL4K secours n° 4', 4]]);
      v.vrai('texte copié du secours n° 3', deux.texte.includes('MCTRL4K secours n° 3 : un retour de secours par port, depuis la dernière dalle de chaque port du MCTRL4K n° 1.'), deux.texte);
      const fibre = chaine(32, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' }, { imposee: { ports: null, fibre: true }, distanceRegieM: 50 });
      v.egal('en fibre : le principal n\'a que son CVT4K', fibre.aval.map((e) => e.appareils.map((a) => [a.nom, a.ports.length > 0])), [[['CVT4K', true]], [['CVT4K', true]]]);
      const ports = chaine(8, 'novastar-mctrl660-pro', { redondance: true });
      v.egal('secours dans le même processeur : pas de secours dans la chaîne', [ports.amont.noeuds.at(-1).nom, ports.aval.map((e) => 'secours' in e)], ['2 × MCTRL660 Pro', [false, false]]);
    },
  },
  {
    id: 'R439',
    titre: 'Guide de montage et texte copié du Schéma avec un processeur de secours (lot 22b) : « Retour de secours jusqu\'au MCTRL4K secours n° 3, port 1 », « secours sur le MCTRL4K secours n° 3, port 1 » ; signature du port inchangée ; secours dans le même processeur : le texte d\'avant',
    etape: '22b',
    verifier(v, contexte) {
      const x = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true, secours: 'processeur' });
      const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche' });
      const vd = t.variantes.find((y) => y.mode === t.conseil);
      const etapes = montage.etapesData(vd, { depart: 'bas-gauche' });
      v.vrai('guide : retour jusqu\'au secours n° 3, port 1', / Retour de secours jusqu'au MCTRL4K secours n° 3, port 1(, [\d,]+ m)?\.$/.test(etapes[0].phrase), etapes[0].phrase);
      v.vrai('guide : secours n° 4 pour le second principal', / Retour de secours jusqu'au MCTRL4K secours n° 4, port 1(, [\d,]+ m)?\.$/.test(etapes.find((e) => e.cle === 'p2-1').phrase), etapes.find((e) => e.cle === 'p2-1').phrase);
      v.egal('signature inchangée', etapes[0].signature, `bas-gauche|MCTRL4K n° 1|port 1|${vd.processeurs[0].ports[0].dalles.join(',')}`);
      const texte = resumes.resumeCablage({ data: t });
      v.vrai('texte copié : secours sur le processeur de secours', texte.split('\n').some((l) => l.startsWith('MCTRL4K n° 1, port 1 : ') && l.includes(', secours sur le MCTRL4K secours n° 3, port 1,')), texte);
      v.vrai('… jamais « secours secours »', !texte.includes('secours secours'), texte);
      const avant = exercice(contexte, 32, 8, 'novastar-mctrl4k', { redondance: true });
      const ta = calculs.cablageData(avant.m, avant.dalle, avant.e, { depart: 'bas-gauche' });
      const ea = montage.etapesData(ta.variantes.find((y) => y.mode === ta.conseil), { depart: 'bas-gauche' });
      v.vrai('secours dans le même processeur : le guide d\'avant', / Retour de secours jusqu'au port 9(, [\d,]+ m)?\.$/.test(ea[0].phrase), ea[0].phrase);
      v.vrai('… et le texte d\'avant', resumes.resumeCablage({ data: ta }).includes(', secours port 9,'), resumes.resumeCablage({ data: ta }));
    },
  },
  {
    id: 'R440',
    titre: 'Fiches par métier avec un processeur de secours (lot 22b) : la régie reçoit la redondance, les processeurs avec les secours et la liaison des boîtiers à l\'ordinateur (câbles de contrôle de la liste de matériel) ; le chef de projet, la redondance',
    etape: '22b',
    verifier(v, contexte) {
      const x = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true, secours: 'processeur' });
      const t = calculs.cablageData(x.m, x.dalle, x.e, { depart: 'bas-gauche', distanceRegieM: 8 });
      const liste = calculs.listeMateriel({ mur: x.m, dalle: x.dalle, data: { evaluation: x.e, variante: t.variantes.find((y) => y.mode === t.conseil), distanceRegieM: 8 } });
      const textes = { data: resumes.resumeData(x.e) };
      const regie = fichesMetier.lignesDataRegie(textes.data);
      v.vrai('régie : redondance et processeurs avec les secours', regie.some((l) => l.libelle === 'Redondance' && l.valeur === 'par un second processeur (sans cascade, Primary et Backup)')
        && regie.some((l) => l.libelle === 'Processeurs avec les secours'), regie);
      const fiche = fichesMetier.ficheMetier('regie', { presta: { nom: 'Presta A', murs: [] }, murs: [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-26T10:00:00.000Z' }, materiel: { liste } }], date: new Date(2026, 9, 26, 12) });
      const lignes = fichesMetier.texteFiche(fiche).split('\n');
      v.vrai('régie : liaison des boîtiers à l\'ordinateur', lignes.includes('LIAISON DES PROCESSEURS À L\'ORDINATEUR')
        && lignes.some((l) => l.startsWith('1 × Switch réseau : ')) && lignes.some((l) => l.startsWith('3 × Câble Ethernet de contrôle : ')), lignes);
      const chef = fichesMetier.texteFiche(fichesMetier.ficheMetier('chefProjet', { presta: { nom: 'Presta A', murs: [] }, murs: [{ nom: 'Mur 1', fiche: { textes, calculeeLe: '2026-10-26T10:00:00.000Z' }, materiel: { liste } }], date: new Date(2026, 9, 26, 12) }));
      v.vrai('chef de projet : processeur et redondance', chef.includes(`Processeur : 1 × ${x.e.processeur.nom} + 1 de secours`) && chef.includes('Redondance : par un second processeur (sans cascade, Primary et Backup)'), chef);
      const sans = exercice(contexte, 8, 6, 'novastar-mctrl660-pro', { redondance: true });
      const ts = calculs.cablageData(sans.m, sans.dalle, sans.e, { depart: 'bas-gauche', distanceRegieM: 8 });
      const ls = calculs.listeMateriel({ mur: sans.m, dalle: sans.dalle, data: { evaluation: sans.e, variante: ts.variantes.find((y) => y.mode === ts.conseil), distanceRegieM: 8 } });
      const fs = fichesMetier.texteFiche(fichesMetier.ficheMetier('regie', { presta: { nom: 'Presta A', murs: [] }, murs: [{ nom: 'Mur 1', fiche: { textes: { data: resumes.resumeData(sans.e) }, calculeeLe: '2026-10-26T10:00:00.000Z' }, materiel: { liste: ls } }], date: new Date(2026, 9, 26, 12) }));
      v.vrai('secours dans le même processeur : pas de liaison à l\'ordinateur', !fs.includes('LIAISON DES PROCESSEURS'), fs);
    },
  },
  {
    id: 'R441',
    titre: 'NovaLCT pas à pas, secours par un second processeur sans cascade (lot 22c, spec § 4.2 et § 6) : principal comme avant, B.11 « Réglé en principal (Primary) » sans tableau ; puis une partie par secours (« NovaLCT, MCTRL4K secours n° 2 ») : câbles de secours, port de communication du secours, B.2 à B.10 avec chaque port inversé (départ sur la dernière dalle du port du principal), rappel du sens, Set as Backup en façade selon le modèle (MCTRL4K, VX1000) ou à vérifier ; secours dans le même processeur : pas de partie de secours',
    etape: '22c',
    verifier(v, contexte) {
      const p = pasSecours(contexte);
      v.egal('parties', p.parties.map((x) => [x.id, x.titre, x.processeur ?? null, x.secours ?? null]),
        [['0', 'Avant de partir et sur place', null, null], ['P1', 'NovaLCT, MCTRL4K n° 1', 1, null], ['P2', 'NovaLCT, MCTRL4K secours n° 2', 2, { principal: 1, liaison: 'sansCascade' }], ['C', 'Contrôles', null, null]]);
      const b11 = etapeNovaLCT(p, 'P1.B.11');
      v.vrai('principal : B.11 Set as Primary, sans tableau', b11?.titre === 'Réglé en principal (Primary)' && b11.tableau === null
        && b11.texte.includes('Advanced Settings > Redundancy Settings, Set as Primary') && b11.texte.includes('onglet Sending Card, Set as Primary'), b11);
      v.egal('étapes du secours', p.parties[2].etapes.map((e) => e.id), ['P2.S.1', 'P2.B.1', 'P2.B.2', 'P2.B.3', 'P2.B.4', 'P2.B.5', 'P2.B.6',
        'P2.B.7.1', 'P2.B.7.2', 'P2.B.7.3', 'P2.B.7.4', 'P2.B.8', 'P2.B.9', 'P2.B.10', 'P2.S.3']);
      const s1 = etapeNovaLCT(p, 'P2.S.1');
      v.vrai('S.1 : câbles de secours sur la dernière dalle de chaque port du principal', s1?.titre === 'Câbles de secours' && s1.texte.includes('port 1 sur C2 R6')
        && s1.texte.includes('port 4 sur C8 R6') && s1.texte.includes('MCTRL4K n° 1'), s1?.texte ?? 'absente');
      v.vrai('B.1 : port de communication du secours', etapeNovaLCT(p, 'P2.B.1')?.texte.includes('port de communication du MCTRL4K secours n° 2'), etapeNovaLCT(p, 'P2.B.1')?.texte ?? 'absente');
      const b71 = etapeNovaLCT(p, 'P2.B.7.1');
      v.vrai('port 1 inversé : départ sur la dernière dalle, sens remonté', b71?.texte.includes('Départ sur C2 R6 (dernière dalle du port 1 du MCTRL4K n° 1')
        && b71.texte.includes('monte la colonne 2, descend la colonne 1') && b71.valeurs.inverse === true, b71?.texte ?? 'absente');
      v.vrai('principal : sens d\'avant', etapeNovaLCT(p, 'P1.B.7.1')?.texte.includes('Départ sur C1 R6'), etapeNovaLCT(p, 'P1.B.7.1')?.texte);
      v.egal('sens du MCTRL4K : à vérifier (Novastar ne l\'écrit que pour le VX1000 et le MCTRL R5)', b71?.aVerifier, true);
      v.vrai('note du secours : rappel du sens et de la cascade', ['inversé d\'après Novastar (manuels VX1000 et MCTRL R5)', 'Daktronics et la formation parlent aussi d\'une config identique',
        'Si les dalles d\'un port s\'inversent au basculement, prends l\'autre sens.', 'Si tu as un câble de cascade, la méthode cascade est celle de Novastar.'].every((x) => p.parties[2].note?.includes(x)), p.parties[2].note);
      const s3 = etapeNovaLCT(p, 'P2.S.3');
      v.vrai('S.3 MCTRL4K : Set as Backup en façade', s3?.titre === 'Réglé en secours (Backup)' && s3.texte.includes('Advanced Settings > Redundancy Settings, Set as Backup')
        && s3.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1' && s.ref === '§ 6.5.5, p. 18') && s3.aVerifier === false, s3);
      const vx = pasSecours(contexte, { procId: 'novastar-vx1000' });
      const vs3 = etapeNovaLCT(vx, 'P2.S.3');
      v.vrai('S.3 VX1000 : Device Backup en façade', vs3?.texte.includes('Advanced Settings > Device Backup') && vs3.sources.some((s) => s.id === 'vx1000-1-5-0' && s.ref === '§ 5.8.1, p. 35 et 36'), vs3);
      v.egal('VX1000 : sens inversé écrit par Novastar, pas à vérifier', etapeNovaLCT(vx, 'P2.B.7.1')?.aVerifier, false);
      const m660 = etapeNovaLCT(pasSecours(contexte, { procId: 'novastar-mctrl660' }), 'P2.S.3');
      v.vrai('S.3 sans menu de façade connu : onglet Sending Card, à vérifier, Daktronics cité', m660?.aVerifier === true && m660.texte.includes('Set as Backup')
        && m660.sources.some((s) => s.id === 'daktronics-000020215'), m660);
      const ports = pasAPasNovaLCT(contexte, { dalle: dalleDeBase(contexte, 'unilumin-upad-iv-2-6'), colonnes: 8, lignes: 6, procId: 'novastar-mctrl4k', reglages: { redondance: true } });
      v.egal('secours dans le même processeur : pas de partie de secours', ports.parties.map((x) => x.id), ['0', 'P1', 'C']);
    },
  },
  {
    id: 'R442',
    titre: 'NovaLCT pas à pas, secours par un second processeur en cascade (lot 22c, spec § 4.1 et § 6, tableau dans la partie du secours, choix de l\'utilisateur) : principaux sans B.11 ; chaque secours : câbles de secours, pas de config d\'écran (manuels V5.0.0, V5.5.0 et V5.8.1), Set as Backup (Set multiple devices), tableau carte n port k ↔ carte n + N port k ; B.1 : un seul port de communication avec les cartes d\'envoi 1 à 2N ; 0.3 : USB vers le boîtier 1 et câbles de cascade dans l\'ordre 1 à 2N',
    etape: '22c',
    verifier(v, contexte) {
      const p = pasSecours(contexte, { colonnes: 32, lignes: 8, liaison: 'cascade' });
      v.egal('parties', p.parties.map((x) => x.id), ['0', 'P1', 'P2', 'P3', 'P4', 'C']);
      v.egal('titres des secours', p.parties.slice(3, 5).map((x) => [x.titre, x.secours]), [['NovaLCT, MCTRL4K secours n° 3', { principal: 1, liaison: 'cascade' }], ['NovaLCT, MCTRL4K secours n° 4', { principal: 2, liaison: 'cascade' }]]);
      v.egal('principaux : pas de B.11', ['P1.B.11', 'P2.B.11'].map((id) => etapeNovaLCT(p, id) ?? null), [null, null]);
      v.egal('étapes du secours n° 3', p.parties[3].etapes.map((e) => e.id), ['P3.S.1', 'P3.S.2', 'P3.S.3', 'P3.B.11']);
      const s2 = etapeNovaLCT(p, 'P3.S.2');
      v.vrai('S.2 : pas de config d\'écran sur la carte d\'envoi 3', s2?.titre === 'Pas de config d\'écran' && s2.texte.includes('carte d\'envoi 3')
        && s2.texte.includes('« The sending card that is used in the completed screen configuration cannot be set as backup device »')
        && s2.sources.some((s) => s.id === 'lct-5-0-0' && s.ref === '§ 5.1.7, p. 34 et 36') && s2.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 31'), s2);
      const s3 = etapeNovaLCT(p, 'P3.S.3');
      v.vrai('S.3 : Set multiple devices, Set as Backup', s3?.texte.includes('Set multiple devices') && s3.texte.includes('Set as Backup') && s3.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 31'), s3);
      const t3 = etapeNovaLCT(p, 'P3.B.11');
      v.egal('tableau du secours n° 3', [t3?.titre, t3?.tableau?.lignes], ['Tableau Redundancy', Array.from({ length: 8 }, (_, i) => [1, i + 1, 3, i + 1])]);
      v.egal('tableau du secours n° 4', etapeNovaLCT(p, 'P4.B.11')?.tableau?.lignes, Array.from({ length: 8 }, (_, i) => [2, i + 1, 4, i + 1]));
      v.vrai('tableau : numéros dans la cascade, Si Add est grisé', t3?.texte.includes('« enter the actual serial numbers of the primary and backup sending cards after they are cascaded »')
        && t3.texte.includes('Si Add est grisé') && t3.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 32'), t3?.texte ?? 'absente');
      v.vrai('B.1 : un seul port de communication, cartes d\'envoi 1 à 4', etapeNovaLCT(p, 'P1.B.1')?.texte.includes('un seul port de communication')
        && etapeNovaLCT(p, 'P1.B.1').texte.includes('cartes d\'envoi 1 à 4') && etapeNovaLCT(p, 'P1.B.1').texte.includes('carte d\'envoi 1'), etapeNovaLCT(p, 'P1.B.1')?.texte);
      const c03 = etapeNovaLCT(p, '0.3');
      v.vrai('0.3 : USB vers le boîtier 1, cascade dans l\'ordre', ['USB IN du MCTRL4K n° 1', 'USB OUT', 'MCTRL4K n° 1, MCTRL4K n° 2, MCTRL4K secours n° 3 et MCTRL4K secours n° 4',
        '10 boîtiers au plus', 'un seul port de communication, 4 cartes d\'envoi'].every((x) => c03?.texte.includes(x)), c03?.texte ?? 'absente');
      v.vrai('0.3 : sources de la cascade (manuel MCTRL4K p. 4 et 6)', c03?.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1' && s.ref === 'p. 4 ; § 4, p. 6'), c03?.sources);
    },
  },
  {
    id: 'R443',
    titre: 'NovaLCT pas à pas, partie 0 et B.1 avec plusieurs boîtiers (lot 22c, spec § 6) : 0.3 sans cascade (une liaison par boîtier, switch et adresses, ou un câble USB chacun ; modèle sans Ethernet connu : vois la fiche) ; 0.6 dans l\'ordre (câbles principaux, config d\'écran, câbles de secours, puis Set as Backup ou le tableau) et la méthode choisie dans Data ; 0.8 genlock du MCTRL4K dès 2 boîtiers ; A.6 compte les secours ; B.1 : un port de communication par boîtier',
    etape: '22c',
    verifier(v, contexte) {
      const p = pasSecours(contexte);
      const c03 = etapeNovaLCT(p, '0.3');
      v.vrai('0.3 sans cascade : switch, adresses, un câble USB par boîtier', ['switch réseau', 'MCTRL4K n° 1 en 192.168.0.10', 'MCTRL4K secours n° 2 en 192.168.0.11', 'l\'ordinateur en 192.168.0.100, masque 255.255.255.0',
        'un câble USB par boîtier', '2 ports de communication'].every((x) => c03?.texte.includes(x)) && c03.aVerifier === true, c03?.texte ?? 'absente');
      const c660 = etapeNovaLCT(pasSecours(contexte, { procId: 'novastar-mctrl660' }), '0.3');
      v.vrai('0.3 sans Ethernet connu : vois la fiche', c660?.texte.includes('liaison au PC : vois la fiche du processeur, à vérifier'), c660?.texte ?? 'absente');
      const c06 = etapeNovaLCT(p, '0.6')?.texte ?? '';
      const ordre = ['câble principal', 'config d\'écran', 'puis branche les câbles de secours', 'Set as Backup ou le tableau'].map((x) => c06.indexOf(x));
      v.vrai('0.6 : dans l\'ordre', ordre.every((x, i) => x >= 0 && (i === 0 || x > ordre[i - 1])), c06);
      v.vrai('0.6 : méthode choisie dans Data', c06.includes('sans cascade (Primary et Backup)') && c06.includes('change-la dans Data'), c06);
      const meme = etapeNovaLCT(pasAPasNovaLCT(contexte, { reglages: { redondance: true } }), '0.6');
      v.vrai('0.6 dans un même processeur : sans la méthode, sans l\'ancienne phrase', !meme.texte.includes('change-la dans Data') && !meme.texte.includes('configure le premier seul'), meme.texte);
      v.vrai('0.6 : sources (manuel V5.8.1, Daktronics, formation)', meme.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 30') && meme.sources.some((s) => s.id === 'daktronics-dd3397344')
        && meme.sources.some((s) => s.id === 'formation-11'), meme.sources);
      const g = etapeNovaLCT(p, '0.8');
      v.vrai('0.8 MCTRL4K avec secours : genlock en cascade, sans saut à vérifier', g?.titre === 'Synchronisation (genlock)' && g.texte.includes('GENLOCK IN') && g.texte.includes('GENLOCK LOOP')
        && g.texte.includes('2 MCTRL4K (1 + 1 de secours)') && g.aVerifier === true && g.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1' && s.ref === 'p. 4 ; § 4, p. 6'), g);
      const deux = etapeNovaLCT(pasAPasNovaLCT(contexte, { dalle: dalleDeBase(contexte, 'unilumin-upad-iv-2-6'), colonnes: 32, lignes: 8, procId: 'novastar-mctrl4k' }), '0.8');
      v.vrai('0.8 : 2 MCTRL4K sans secours, genlock sans « à vérifier »', deux?.texte.includes('2 MCTRL4K sur le même écran') && deux.aVerifier === false, deux);
      v.egal('0.8 : un seul MCTRL4K, rien', etapeNovaLCT(pasAPasNovaLCT(contexte, { dalle: dalleDeBase(contexte, 'unilumin-upad-iv-2-6'), colonnes: 8, lignes: 6, procId: 'novastar-mctrl4k' }), '0.8') ?? null, null);
      const a6 = etapeNovaLCT(pasSecours(contexte, { procId: 'novastar-vx1000' }), 'A.6');
      v.vrai('A.6 : VX1000 et son secours', a6?.texte.startsWith('1 × VX1000 + 1 de secours sur le même écran') && a6.valeurs.secours === 1, a6?.texte ?? 'absente');
      const b1 = etapeNovaLCT(pasAPasNovaLCT(contexte), 'P1.B.1');
      v.vrai('B.1 avec 2 MCTRL660 : un port de communication par boîtier', b1.texte.includes('chaque boîtier relié en réseau ou en USB séparé est un port de communication')
        && b1.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 3.1 et § 3.2, p. 4'), b1.texte);
    },
  },
  {
    id: 'R444',
    titre: 'NovaLCT pas à pas, B.11 dans un même boîtier (lot 22c, spec § 6, relecture point 2) : câbles de secours branchés avant le tableau (« Redundancy related hardware connection is done ») ; « Si Add est grisé : pistes à vérifier » ; plus de phrase sur le second processeur chaîné (il a son parcours)',
    etape: '22c',
    verifier(v, contexte) {
      const b11 = etapeNovaLCT(pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', colonnes: 8, lignes: 4, reglages: { redondance: true } }), 'P1.B.11');
      v.vrai('câbles de secours avant le tableau', b11.texte.indexOf('câbles de secours') >= 0 && b11.texte.indexOf('câbles de secours') < b11.texte.indexOf('Redundancy, Add')
        && b11.texte.includes('« Redundancy related hardware connection is done »'), b11.texte);
      v.vrai('Si Add est grisé', b11.texte.includes('Si Add est grisé : pistes à vérifier : connexion avancée (étape 0.5), NovaLCT trop ancien (MCTRL4K : V5.2.0 ou plus pour le piloter), boîtier réglé en Backup.'), b11.texte);
      v.vrai('plus de second processeur chaîné', !b11.texte.includes('chaîné') && !b11.texte.includes('Set as Backup, et dans le tableau'), b11.texte);
      v.vrai('sources : V5.8.1 § 5.3 p. 30, manuel MCTRL4K § 7.5.1', b11.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 30 à 32') && b11.sources.some((s) => s.id === 'mctrl4k-manuel-1-2-1' && s.ref === '§ 7.5.1, p. 33'), b11.sources);
    },
  },
  {
    id: 'R445',
    titre: 'NovaLCT pas à pas, test de la redondance (lot 22c, spec § 4.3, C.5 et C.5a) : en attente rien ne change ; Verify seulement en cascade ou dans un même boîtier (MCTRL4K, MCTRL R5) ; VX1000 : Disable All (sans cascade) ou Disable Primary (cascade) ; le vrai test (câbles de sortie ou alimentation du principal, marque qui clignote), l\'entrée vidéo à vérifier, le symptôme des dalles inversées ; C.5a « Backing up » (V5.8.1) avec un processeur de secours',
    etape: '22c',
    verifier(v, contexte) {
      const c5 = etapeNovaLCT(pasSecours(contexte), 'C.5');
      v.vrai('sans cascade : en attente, vrai test, clignote, entrée vidéo, symptôme', ['rien ne change à l\'écran', 'débranche les câbles de sortie du principal, ou coupe son alimentation', 'clignote',
        'Couper seulement l\'entrée vidéo', 'Si les dalles d\'un port s\'inversent quand le secours prend le relais', 'prends l\'autre'].every((x) => c5?.texte.includes(x))
        && !c5.texte.includes('Verify') && c5.aVerifier === true, c5?.texte ?? 'absente');
      const cc = etapeNovaLCT(pasSecours(contexte, { colonnes: 32, lignes: 8, liaison: 'cascade' }), 'C.5');
      v.vrai('cascade : Verify, symptôme de la config du secours', cc?.texte.includes('Verify') && cc.texte.includes('sa propre config d\'écran'), cc?.texte ?? 'absente');
      v.vrai('VX1000 sans cascade : Disable All', etapeNovaLCT(pasSecours(contexte, { procId: 'novastar-vx1000' }), 'C.5')?.texte.includes('Disable All'));
      v.vrai('VX1000 en cascade : Disable Primary', etapeNovaLCT(pasSecours(contexte, { procId: 'novastar-vx1000', liaison: 'cascade' }), 'C.5')?.texte.includes('Disable Primary'));
      const a = etapeNovaLCT(pasSecours(contexte), 'C.5a');
      v.vrai('C.5a : Backing up, V5.8.1', a?.titre === 'Surveillance : « Backing up »' && a.texte.includes('en bleu') && a.sources.some((s) => s.id === 'lct-5-8-1' && s.ref === '§ 5.3, p. 31'), a);
      const meme = pasAPasNovaLCT(contexte, { procId: 'novastar-mctrl4k', colonnes: 8, lignes: 4, reglages: { redondance: true } });
      v.vrai('même boîtier : Verify, le vrai test sur un câble principal, pas de C.5a', etapeNovaLCT(meme, 'C.5').texte.includes('Verify') && etapeNovaLCT(meme, 'C.5').texte.includes('débranche le câble principal d\'un port')
        && !etapeNovaLCT(meme, 'C.5a'), etapeNovaLCT(meme, 'C.5').texte);
    },
  },
  {
    id: 'R446',
    titre: 'NovaLCT pas à pas avec un processeur de secours, titre, texte copié, PDF et fiche régie (lot 22c, spec § 6) : « 2 × MCTRL4K + 2 de secours » ; tableau du secours dans le PDF ; résumé avec la redondance et chaque secours ; étapes toutes sourcées ou à vérifier, sources connues, signatures uniques ; sans secours : le titre d\'avant',
    etape: '22c',
    verifier(v, contexte) {
      const p = pasSecours(contexte, { colonnes: 32, lignes: 8, liaison: 'cascade' });
      v.egal('titre', p.titreProcesseurs, '2 × MCTRL4K + 2 de secours');
      v.egal('secours', p.secours, { nombre: 2, liaison: 'cascade', texte: 'par un second processeur (cascade, tableau)' });
      const f = novalct.ficheNovaLCT(p, {}, { presta: 'Presta A', mur: 'Mur 1', date: new Date(2026, 9, 26) });
      v.egal('PDF : processeurs', f.entete.find(([l]) => l === 'Processeurs')?.[1], '2 × MCTRL4K + 2 de secours');
      const b3 = f.blocs.find((b) => b.titre === 'NovaLCT, MCTRL4K secours n° 3');
      v.vrai('PDF : tableau du secours n° 3', b3?.lignes.some((l) => l.libelle === 'Redondance, port 1' && l.valeur === 'carte principale 1, port 1 ; carte de secours 3, port 1'), b3?.lignes);
      v.vrai('texte copié : processeurs', novalct.texteNovaLCT(p, {}).includes('Processeurs : 2 × MCTRL4K + 2 de secours'));
      const r = novalct.resumeNovaLCT(p, {});
      v.vrai('fiche régie : processeurs, redondance, secours', r.includes('Processeurs : 2 × MCTRL4K + 2 de secours') && r.includes('Redondance : par un second processeur (cascade, tableau)')
        && r.includes('Processeur n° 3 (secours du n° 1) dans NovaLCT : pas de config d\'écran, Set as Backup, tableau Redundancy')
        && r.split('\n').filter((l) => l.startsWith('Processeur n° ')).length === 4, r);
      const s = pasSecours(contexte);
      v.vrai('fiche régie sans cascade : secours avec le chemin inversé', novalct.resumeNovaLCT(s, {}).includes('Processeur n° 2 (secours du n° 1) dans NovaLCT : entrée ')
        && novalct.resumeNovaLCT(s, {}).includes('chemin inversé, Set as Backup'), novalct.resumeNovaLCT(s, {}));
      const essais = [p, s, pasSecours(contexte, { procId: 'novastar-vx1000' }), pasSecours(contexte, { procId: 'novastar-mctrl660' }), pasSecours(contexte, { procId: 'novastar-vx1000', liaison: 'cascade' })];
      const etapes = essais.flatMap((x) => x.parties.flatMap((y) => y.etapes));
      v.egal('source ou « à vérifier »', etapes.filter((e) => !e.sources.length && !e.aVerifier).map((e) => e.id), []);
      v.egal('sources connues', etapes.flatMap((e) => e.sources).filter((x) => !novalct.SOURCES_NOVALCT[x.id]).map((x) => x.id), []);
      v.egal('signatures uniques', essais.map((x) => {
        const sig = x.parties.flatMap((y) => y.etapes.map((e) => e.signature));
        return sig.length - new Set(sig).size;
      }), [0, 0, 0, 0, 0]);
      v.egal('sans secours : titre d\'avant', [pasAPasNovaLCT(contexte).titreProcesseurs, pasAPasNovaLCT(contexte).secours], ['2 × MCTRL660', null]);
      const sources = ['lct-5-0-0', 'daktronics-000020215', 'daktronics-dd3397344'].map((id) => novalct.SOURCES_NOVALCT[id]);
      v.vrai('sources ajoutées : Daktronics intégrateur avec lien, V5.0.0 constructeur', sources[0]?.confiance === 'constructeur'
        && sources.slice(1).every((x) => x?.confiance === 'intégrateur' && x.url?.startsWith('https://daktronics.com/') && x.court.startsWith('Daktronics (intégrateur)')), sources);
    },
  },
  {
    id: 'R447',
    titre: 'NovaLCT à blanc avec un processeur de secours et textes du Dépannage (lot 22c, spec § 6 et § 7) : `murABlanc` reçoit `secours` et `liaisonSecours` (partie du secours, description) ; blocs ajoutés T10.3:3 (« Deux processeurs, NovaLCT n\'en montre qu\'un »), T11.1:3 et T5.2:3 (dalles inversées au basculement) pour Novastar seulement, sourcés, avec le lien vers le pas à pas',
    etape: '22c',
    verifier(v, contexte) {
      const bd = baseDalles(contexte);
      const bp = baseProcesseurs(contexte);
      const base = {
        dalles: bd.dalles.map((f) => calculs.resoudreFiche(f, bd.sources)),
        processeurs: bp.processeurs.map((f) => calculs.resoudreFiche(f, bp.sources)),
        liaisons: liaisonsDeBase(contexte),
      };
      const a = novalct.murABlanc({ ...base, redondance: true, secours: 'processeur' });
      v.egal('à blanc, sans cascade : partie du secours', a?.resultat.parties.map((x) => x.id), ['0', 'P1', 'P2', 'C']);
      v.egal('description', a?.description, 'Mur d\'exemple : 12 × 6 Absen M2.9, 1 × MCTRL660 + 1 de secours, 60 Hz, 8 bits, redondance par un second processeur (sans cascade, Primary et Backup).');
      const c = novalct.murABlanc({ ...base, redondance: true, secours: 'processeur', liaisonSecours: 'cascade' });
      v.vrai('à blanc, cascade : tableau du secours', c?.resultat.parties.find((x) => x.id === 'P2')?.etapes.some((e) => e.id === 'P2.B.11' && e.tableau?.lignes.length > 0), c?.resultat.parties.map((x) => x.id));
      v.egal('à blanc sans redondance : secours ignoré', novalct.murABlanc({ ...base, secours: 'processeur' })?.resultat.parties.map((x) => x.id), ['0', 'P1', 'C']);
      const aide = (cle, marque) => novalct.aideDepannageSecours(cle, marque);
      v.egal('T10.3:3 : titre', aide('T10.3:3', 'novastar')?.titre, 'Deux processeurs, NovaLCT n\'en montre qu\'un');
      v.vrai('T10.3:3 : port de communication, Detect Config, les deux méthodes', ['port de communication à part', 'Disable cascade communication', 'Méthode cascade (tableau)', 'Méthode sans cascade (Primary et Backup)']
        .every((x) => aide('T10.3:3', 'novastar')?.lignes.some((l) => l.texte.includes(x))), aide('T10.3:3', 'novastar'));
      v.egal('T11.1:3 : titre', aide('T11.1:3', 'novastar')?.titre, 'Les dalles d\'un port s\'inversent quand le secours prend le relais');
      v.vrai('T5.2:3 : rappel court', aide('T5.2:3', 'novastar')?.lignes.length === 1 && aide('T5.2:3', 'novastar').lignes[0].texte.includes('secours'), aide('T5.2:3', 'novastar'));
      v.egal('Novastar seulement', ['coex', 'brompton', null].map((m) => aide('T10.3:3', m)), [null, null, null]);
      v.egal('clé inconnue : rien', aide('T10.3:1', 'novastar'), null);
      const blocs = ['T10.3:3', 'T11.1:3', 'T5.2:3'].map((k) => aide(k, 'novastar'));
      v.egal('chaque ligne sourcée, sources connues', blocs.flatMap((b) => b.lignes).filter((l) => !l.sources.length || l.sources.some((s) => !novalct.SOURCES_NOVALCT[s.id])).map((l) => l.texte), []);
      v.egal('lien vers le pas à pas', blocs.map((b) => b.lienPasAPas), [true, true, true]);
    },
  },
  {
    id: 'R448',
    titre: 'Check-list de mise en service (lot 27a, spec § 4.1) : douze étapes toujours présentes et dans l\'ordre, pour toutes les marques ; renvois de chaque étape selon la marque du processeur (Novastar avec NovaLCT, avec un processeur de secours, COEX, Brompton avec et sans redondance, Colorlight) ; note de l\'appli quand la marque n\'a pas de procédure ; lignes de marque d\'un renvoi au Dépannage filtrées par marque',
    etape: '27a',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const ids = ['depot', 'arrivee', 'cablage-data', 'cablage-elec', 'tension', 'processeur', 'config', 'ports', 'mire', 'mapping', 'calibration', 'sauvegarde'];
      const titres = ['Au dépôt', 'Arrivée électrique', 'Câblage data', 'Câblage élec', 'Mise sous tension', 'Processeur et logiciel', 'Config des dalles',
        'Test des ports', 'Mire', 'Mapping et source', 'Calibration et couleurs', 'Sauvegarde'];
      const essais = {
        novastar: entreesTerrain('novastar'),
        secours: entreesTerrain('novastar', { processeur: { id: 'novastar-mctrl4k', nom: 'MCTRL4K', nombre: 2, secours: 2 }, redondance: true }),
        coex: entreesTerrain('coex'),
        brompton: entreesTerrain('brompton'),
        bromptonRedondance: entreesTerrain('brompton', { redondance: true }),
        colorlight: entreesTerrain('colorlight'),
      };
      const resultats = Object.fromEntries(Object.entries(essais).map(([k, e]) => [k, terrain.etapesTerrain(e, donnees)]));
      v.egal('douze étapes dans l\'ordre, toutes marques', Object.values(resultats).map((r) => r.etapes.map((e) => e.id)), Object.values(resultats).map(() => ids));
      v.egal('titres', resultats.novastar.etapes.map((e) => e.titre), titres);
      v.egal('total : 12', Object.values(resultats).map((r) => r.total), [12, 12, 12, 12, 12, 12]);
      const renvois = (r) => Object.fromEntries(r.etapes.map((e) => [e.id, e.lignes.filter((l) => l.type === 'renvoi').map((l) => l.renvoi)]));
      const commun = { depot: [], arrivee: ['dep:T9:avertissement'], 'cablage-data': [], 'cablage-elec': [], tension: ['dep:T9.2:1', 'dep:T9.2:2'] };
      v.egal('Novastar avec NovaLCT', renvois(resultats.novastar), {
        ...commun, processeur: ['ms:ns:1', 'ms:ns:2', 'ms:ns:3'], config: ['ms:ns:4', 'ms:ns:5', 'ms:ns:6', 'ms:ns:c1', 'ms:ns:c2'], ports: ['dep:T2.2:2'],
        mire: ['dep:T5.3:1'], mapping: [], calibration: [], sauvegarde: ['ms:ns:7'],
      });
      v.egal('Novastar, secours par un second processeur : NS c3', renvois(resultats.secours).processeur, ['ms:ns:1', 'ms:ns:2', 'ms:ns:3', 'ms:ns:c3']);
      v.egal('COEX', renvois(resultats.coex), {
        ...commun, processeur: [], config: ['rappel:C1', 'rappel:C2', 'rappel:C3', 'rappel:C4'], ports: ['dep:T2.2:2'], mire: ['dep:T5.3:1'], mapping: [], calibration: [], sauvegarde: [],
      });
      v.egal('Brompton sans redondance', renvois(resultats.brompton), {
        ...commun, processeur: ['ms:br:1', 'ms:br:2'], config: ['ms:br:3'], ports: ['dep:T8.2:1'], mire: ['dep:T5.3:1', 'ms:br:6'], mapping: ['ms:br:4'],
        calibration: ['ms:br:7'], sauvegarde: [],
      });
      v.egal('Brompton en redondance : BR 5', renvois(resultats.bromptonRedondance).ports, ['dep:T8.2:1', 'ms:br:5']);
      v.egal('Colorlight', renvois(resultats.colorlight), {
        ...commun, processeur: [], config: [], ports: [], mire: ['dep:T5.3:1'], mapping: [], calibration: [], sauvegarde: [],
      });
      const notes = (r) => r.etapes.filter((e) => e.lignes.some((l) => l.type === 'note')).map((e) => e.id);
      v.egal('notes : COEX', notes(resultats.coex), ['processeur', 'sauvegarde']);
      v.egal('notes : Brompton', notes(resultats.brompton), ['sauvegarde']);
      v.egal('notes : Novastar', notes(resultats.novastar), []);
      v.egal('notes : Colorlight', notes(resultats.colorlight), ['processeur', 'config', 'ports', 'calibration', 'sauvegarde']);
      const note = (r, id) => r.etapes.find((e) => e.id === id).lignes.find((l) => l.type === 'note');
      v.egal('note COEX (VMP)', note(resultats.coex, 'processeur')?.texte, 'Pas de procédure COEX pour cette étape dans l\'appli : suis la doc du constructeur (VMP).');
      v.egal('note Brompton (Tessera)', note(resultats.brompton, 'sauvegarde')?.texte, 'Pas de procédure Brompton pour cette étape dans l\'appli : suis la doc du constructeur (Tessera).');
      v.egal('note Colorlight (LEDVISION)', note(resultats.colorlight, 'ports')?.texte, 'Pas de procédure Colorlight pour cette étape dans l\'appli : suis la doc du constructeur (LEDVISION).');
      const sansLogiciel = terrain.etapesTerrain(entreesTerrain('colorlight', { nomMarque: 'Kystar', logiciel: null }), donnees);
      v.egal('logiciel inconnu', note(sansLogiciel, 'ports')?.texte, 'Pas de procédure Kystar pour cette étape dans l\'appli : suis la doc du constructeur (le logiciel du processeur).');
      v.egal('source des notes', note(resultats.coex, 'processeur')?.source, 'Choix de conception du projet');
      // Lignes d'un renvoi au Dépannage : celles du numéro, ligne générale toujours, lignes de marque pour la marque du mur.
      const t22 = (r) => r.etapes.find((e) => e.id === 'ports').lignes.find((l) => l.renvoi === 'dep:T2.2:2')?.lignes.map((l) => l.marque);
      v.egal('T2.2 ligne 2 en Novastar : générale et Novastar', t22(resultats.novastar), [null, 'novastar']);
      v.egal('T2.2 ligne 2 en COEX : générale et COEX', t22(resultats.coex), [null, 'coex']);
      const avert = resultats.novastar.etapes[1].lignes.find((l) => l.renvoi === 'dep:T9:avertissement');
      v.egal('avertissement de T9 : ses deux textes', avert?.lignes.map((l) => l.texte), donnees.depannage.arbres.find((a) => a.id === 'T9').avertissement.map((l) => l.texte));
      const ns4 = resultats.novastar.etapes[6].lignes.find((l) => l.renvoi === 'ms:ns:4');
      v.vrai('procédure lue dans les données, mot pour mot', ns4?.lignes[0]?.texte === 'Charger le bon fichier rcfgx ; en cas de doute, le tester d\'abord sur une ou deux dalles.', ns4);
      v.egal('procédure : source « Formation »', ns4?.lignes[0]?.sources.map((s) => [s.court, s.confiance]), [['Formation', 'formation']]);
      const br7 = resultats.brompton.etapes[10].lignes.find((l) => l.renvoi === 'ms:br:7');
      v.egal('BR 7 en deux lignes, la calibration sur la transcription 17', br7?.lignes.map((l) => l.sources.map((s) => s.court)), [['Formation'], ['Formation (transcription 17)']]);
      const c1 = resultats.coex.etapes[6].lignes.find((l) => l.renvoi === 'rappel:C1');
      v.egal('rappel C1 : titre et textes de rappels.js', [c1?.titre, c1?.lignes.length], [rappels.RAPPELS.find((r) => r.id === 'C1').titre, rappels.RAPPELS.find((r) => r.id === 'C1').textes.length]);
      // Valeurs du mur.
      const textes = (r, id) => r.etapes.find((e) => e.id === id).lignes.filter((l) => l.type === 'texte' || l.type === 'alerte').map((l) => l.texte);
      v.egal('processeurs du mur', textes(resultats.secours, 'processeur'), ['Processeurs : 2 × MCTRL4K + 2 de secours', 'Pas à pas NovaLCT : 9 sur 14']);
      v.egal('bouton du pas à pas NovaLCT (logiciel NovaLCT seulement)', [resultats.novastar, resultats.coex].map((r) => r.etapes[5].boutons), [['novalct'], []]);
      v.egal('Brompton : fréquence et profondeur réseau avec leur origine', textes(resultats.brompton, 'processeur'),
        ['Processeurs : 2 × S8', 'Fréquence et profondeur réseau : 60 Hz, 12 bits (défaut, livraison Tessera)']);
      v.egal('arrivée tri', textes(resultats.novastar, 'arrivee'), ['Arrivée : tri 32 A']);
      v.egal('arrivée mono', textes(terrain.etapesTerrain(entreesTerrain('novastar', { elec: { arrivees: [{ type: 'mono', intensiteA: 16 }], lignes: [{ numero: 1, phase: null }], alerteAppel: null } }), donnees), 'arrivee'), ['Arrivée : mono 16 A']);
      const deuxArrivees = terrain.etapesTerrain(entreesTerrain('novastar', { elec: { arrivees: [{ type: 'tri', intensiteA: 32 }, { type: 'tri', intensiteA: 63 }], lignes: [], alerteAppel: null } }), donnees);
      v.egal('deux arrivées', textes(deuxArrivees, 'arrivee'), ['Arrivée 1 : tri 32 A', 'Arrivée 2 : tri 63 A']);
      v.egal('mise sous tension : lignes dans l\'ordre, avec leur phase', textes(resultats.novastar, 'tension'), ['Ligne 1 · L1', 'Ligne 2 · L2']);
      const appel = terrain.etapesTerrain(entreesTerrain('novastar', { elec: { ...entreesTerrain('novastar').elec, alerteAppel: 'Courant d\'appel : 120 A au démarrage.' } }), donnees);
      v.egal('alerte de courant d\'appel', appel.etapes[4].lignes.filter((l) => l.type === 'alerte').map((l) => l.texte), ['Courant d\'appel : 120 A au démarrage.']);
      v.egal('config : pixels de la fiche et config du lot', textes(resultats.novastar, 'config'), ['Dalle : 176 × 176 px', 'Config NovaLCT : BP2V2_A.rcfgx, lot A']);
      const sansConfig = terrain.etapesTerrain(entreesTerrain('novastar', { fiches: [{ ...entreesTerrain('novastar').fiches[0], config: { lignes: [], ids: [] } }] }), donnees);
      v.egal('config absente', textes(sansConfig, 'config')[1], 'Aucun fichier de config pour Black Pearl BP2 V2 dans le parc Parc A : ajoute-le dans l\'onglet Base.');
      v.egal('ports', [textes(resultats.novastar, 'ports'), textes(resultats.secours, 'ports')], [['8 ports'], ['8 ports, 8 de secours']]);
      v.egal('mire : bouton', resultats.novastar.etapes[8].boutons, ['mire']);
      v.egal('mapping : source et blocs', textes(resultats.novastar, 'mapping'), ['Source : 1920 × 1080 px à 60 Hz', 'Processeur n° 1, dans sa source : x 0 à 1407, y 0 à 1055']);
      v.egal('au dépôt : lignes d\'« Avant de partir » et en-tête', [resultats.novastar.etapes[0].lignes.map((l) => [l.texte, l.fait]), resultats.novastar.etapes[0].resume],
        [entreesTerrain('novastar').avantDePartir.lignes.map((l) => [l.texte, l.fait]), '1 à faire']);
      v.egal('au dépôt : source', resultats.novastar.etapes[0].lignes[0].source, 'Calcul de l\'appli d\'après le parc');
      v.egal('au dépôt sans parc', textes(terrain.etapesTerrain(entreesTerrain('novastar', { parc: null, avantDePartir: null }), donnees), 'depot'),
        ['Pas de parc pour ce mur : rien de propre au parc à vérifier.']);
    },
  },
  {
    id: 'R449',
    titre: 'Check-list, étapes calculées (lot 27a, spec § 4.3) : « Câblage data » et « Câblage élec » reprennent l\'état du guide de montage, sans case à la main, faites quand tout est branché ; mur au calcul non valide : valeurs de l\'onglet remplacées par « calcul non valide, corrige ce mur »',
    etape: '27a',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const r = terrain.etapesTerrain(entreesTerrain('novastar'), donnees);
      const data = r.etapes.find((e) => e.id === 'cablage-data');
      v.egal('câblage data : état du guide, bouton, non faite', [data.calculee, data.faite, data.lignes.map((l) => l.texte), data.boutons], [true, false, ['Montage data : 1 port sur 2 branché (port 1)'], ['montage-data']]);
      const fini = terrain.etapesTerrain(entreesTerrain('novastar', { montage: { data: { faites: 2, total: 2, texte: '2 ports sur 2 branchés' }, elec: { faites: 2, total: 2, texte: '2 lignes sur 2 branchées' } } }), donnees);
      v.egal('tout branché : faites', fini.etapes.filter((e) => e.calculee).map((e) => [e.id, e.faite]), [['cablage-data', true], ['cablage-elec', true]]);
      v.egal('étapes à la main : toutes les autres', r.etapes.filter((e) => !e.calculee).length, 10);
      v.egal('pas de signature pour une étape calculée', data.signature, null);
      const coches = Object.fromEntries(r.etapes.filter((e) => !e.calculee).map((e) => [e.id, e.signature]));
      v.egal('état : 1 sur 12 avec la mire', terrain.etatTerrain(r, { mire: r.etapes[8].signature }), { faites: 1, total: 12 });
      v.egal('état : tout coché, câblage pas fini', terrain.etatTerrain(r, coches), { faites: 10, total: 12 });
      v.egal('état : tout coché et branché', terrain.etatTerrain(fini, coches), { faites: 12, total: 12 });
      v.egal('une case sur une étape calculée ne compte pas', terrain.etatTerrain(r, { 'cablage-data': 'x' }), { faites: 0, total: 12 });
      const invalide = terrain.etapesTerrain(entreesTerrain('novastar', { nonValides: ['elec'], elec: null }), donnees);
      const nv = (id) => invalide.etapes.find((e) => e.id === id);
      v.egal('Élec non valide : étapes en cause', invalide.etapes.filter((e) => !e.valide).map((e) => e.id), ['arrivee', 'cablage-elec', 'tension']);
      v.vrai('… valeurs remplacées, renvois gardés', nv('tension').lignes.some((l) => l.texte === 'calcul non valide, corrige ce mur')
        && nv('tension').lignes.some((l) => l.renvoi === 'dep:T9.2:1') && !nv('tension').lignes.some((l) => /^Ligne /.test(l.texte ?? '')), nv('tension').lignes);
      v.egal('… câblage élec non fait', nv('cablage-elec').faite, false);
      const sansData = terrain.etapesTerrain(entreesTerrain('novastar', { nonValides: ['data'], processeur: null, ports: null }), donnees);
      v.egal('Data non valide', sansData.etapes.filter((e) => !e.valide).map((e) => e.id), ['depot', 'cablage-data', 'processeur', 'config', 'ports']);
      const sansCanvas = terrain.etapesTerrain(entreesTerrain('novastar', { nonValides: ['canvas'], canvas: null }), donnees);
      v.egal('Canvas non valide', [sansCanvas.etapes.filter((e) => !e.valide).map((e) => e.id), sansCanvas.etapes[9].lignes.map((l) => l.texte)], [['mapping'], ['calcul non valide, corrige ce mur']]);
    },
  },
  {
    id: 'R450',
    titre: 'Check-list, signatures et rapprochement (lot 27a, spec § 4.3) : état du pas à pas NovaLCT, présence d\'un fichier ou version relevée changés : rien n\'est décoché ; processeur, config du lot ou lignes élec changés : case décochée avec sa raison et le bandeau ; étape disparue : décochée ; calcul non valide : pas de décoche',
    etape: '27a',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const e0 = entreesTerrain('novastar');
      const r0 = terrain.etapesTerrain(e0, donnees);
      const coches = Object.fromEntries(r0.etapes.filter((e) => !e.calculee).map((e) => [e.id, e.signature]));
      const signatures = r0.etapes.filter((e) => !e.calculee).map((e) => e.signature);
      v.egal('signatures uniques', new Set(signatures).size, signatures.length);
      const rien = (libelle, entrees) => {
        const r = terrain.rapprocherTerrain(terrain.etapesTerrain(entrees, donnees), coches);
        v.egal(`${libelle} : rien de décoché`, [Object.keys(r.coches).length, r.retirees, r.avis], [10, [], null]);
      };
      rien('état du pas à pas NovaLCT', { ...e0, novalct: { faites: 13, total: 14 } });
      rien('fichier absent de l\'appareil, ligne à faire', { ...e0, avantDePartir: { ...e0.avantDePartir, lignes: e0.avantDePartir.lignes.map((l, i) => (i === 0 ? { texte: 'Fichier de config BP2V2_A.rcfgx (lot A) : absent de cet appareil, joins-le de nouveau dans l\'onglet Base', fait: false } : l)) } });
      rien('version relevée', { ...e0, avantDePartir: { ...e0.avantDePartir, lignes: e0.avantDePartir.lignes.map((l, i) => (i === 1 ? { texte: 'NovaLCT 5.8.1 relevé le 01/11/2026 : même version sur le PC de régie', fait: null } : l)) } });
      rien('montage', { ...e0, montage: { data: { faites: 2, total: 2, texte: '2 ports sur 2 branchés' }, elec: e0.montage.elec } });
      rien('alertes de Canvas et courant d\'appel', { ...e0, canvas: { ...e0.canvas, alertes: ['Alerte EDID'] }, elec: { ...e0.elec, alerteAppel: 'Courant d\'appel' } });
      const decoche = (libelle, entrees, ids, avis) => {
        const r = terrain.rapprocherTerrain(terrain.etapesTerrain(entrees, donnees), coches);
        v.egal(`${libelle} : décochées`, r.retirees.map((x) => [x.id, x.raison]), ids.map((id) => [id, 'change']));
        v.egal(`${libelle} : gardées`, Object.keys(r.coches).length, 10 - ids.length);
        v.egal(`${libelle} : bandeau`, r.avis, avis);
      };
      decoche('processeur changé', { ...e0, processeur: { id: 'novastar-mctrl660', nom: 'MCTRL660', nombre: 1, secours: 0 } }, ['depot', 'processeur'],
        'Le mur a changé : « Au dépôt » et « Processeur et logiciel » décochées (leur contenu n\'est plus le même).');
      decoche('config du lot changée', { ...e0, fiches: [{ ...e0.fiches[0], config: { lignes: ['Config NovaLCT : BP2V2_B.rcfgx, lot A'], ids: ['A:cfg-2'] } }] }, ['config'],
        'Le mur a changé : « Config des dalles » décochée (son contenu n\'est plus le même).');
      decoche('lignes élec changées', { ...e0, elec: { ...e0.elec, lignes: [{ numero: 1, phase: 1 }, { numero: 2, phase: 3 }] } }, ['tension'],
        'Le mur a changé : « Mise sous tension » décochée (son contenu n\'est plus le même).');
      decoche('lot changé', { ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: 2, retenus: ['B'], aPreciser: false } }] }, ['depot', 'calibration'],
        'Le mur a changé : « Au dépôt » et « Calibration et couleurs » décochées (leur contenu n\'est plus le même).');
      const marque = terrain.rapprocherTerrain(terrain.etapesTerrain({ ...e0, ...entreesTerrain('coex') }, donnees), coches);
      v.egal('marque changée : toutes les cases décochées (la marque est dans chaque signature)', [marque.retirees.length, Object.keys(marque.coches).length], [10, 0]);
      const invalide = terrain.rapprocherTerrain(terrain.etapesTerrain({ ...e0, nonValides: ['elec'], elec: null }, donnees), coches);
      v.egal('calcul non valide : rien de décoché', [Object.keys(invalide.coches).length, invalide.retirees], [10, []]);
      v.egal('… et la case compte', terrain.etatTerrain(terrain.etapesTerrain({ ...e0, nonValides: ['elec'], elec: null }, donnees), coches).faites, 10);
      const avecAjout = { ...e0, ajouts: [{ id: 'a1', texte: 'Scotcher les câbles' }] };
      const ra = terrain.etapesTerrain(avecAjout, donnees);
      const cochesAjout = { ...coches, 'ajout-a1': ra.etapes[12].signature };
      const disparue = terrain.rapprocherTerrain(r0, cochesAjout);
      v.egal('étape disparue : décochée avec sa raison', [disparue.retirees, disparue.avis],
        [[{ id: 'ajout-a1', titre: 'Scotcher les câbles', raison: 'disparue' }], 'Le mur a changé : « Scotcher les câbles » décochée (cette étape n\'existe plus).']);
      const deux = terrain.texteChangementTerrain([{ id: 'config', titre: 'Config des dalles', raison: 'change' }, { id: 'ajout-a1', titre: 'Scotcher les câbles', raison: 'disparue' }]);
      v.egal('deux raisons', deux, 'Le mur a changé : « Config des dalles » décochée (son contenu n\'est plus le même) ; « Scotcher les câbles » décochée (cette étape n\'existe plus).');
      v.egal('rien de changé : pas de bandeau', terrain.texteChangementTerrain([]), null);
      v.egal('case d\'une étape calculée ignorée', terrain.rapprocherTerrain(r0, { 'cablage-data': 'x' }).coches, {});
    },
  },
  {
    id: 'R451',
    titre: 'Check-list, calibration et état des lots (lot 27a, spec § 4.2) : textes par fiche du mur (dalle et demi-dalle) : un seul lot, lots mélangés (texte de R140 selon le logiciel), lots à préciser, aucun lot coché, pas de lot noté ; rappel N7 (Novastar) ou B4 (Brompton) une fois quand une fiche a des lots mélangés, rien de plus en COEX',
    etape: '27a',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const e0 = entreesTerrain('novastar');
      const demi = { id: 'roe-bp2-v2-demi', nom: 'Black Pearl BP2 V2 demi', pixelsLargeur: 176, pixelsHauteur: 88, source: 'Fiche ROE', config: { lignes: [], ids: [] } };
      const calibration = (entrees) => terrain.etapesTerrain(entrees, donnees).etapes.find((e) => e.id === 'calibration');
      const textes = (et) => et.lignes.filter((l) => l.type === 'texte' || l.type === 'alerte').map((l) => l.texte);
      v.egal('un seul lot', textes(calibration(e0)), ['Un seul lot de Black Pearl BP2 V2 : lot A.']);
      const melanges = { ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: 2, retenus: ['A', 'B'], aPreciser: false } }, { ...demi, lots: { nombre: 1, retenus: ['C'], aPreciser: false } }] };
      const cm = calibration(melanges);
      v.egal('lots mélangés (NovaLCT) et demi-dalle', textes(cm), ['Black Pearl BP2 V2 : Lots mélangés (A, B), écarts de couleur possibles : multi-batch adjustment (NovaLCT).', 'Un seul lot de Black Pearl BP2 V2 demi : lot C.']);
      v.egal('… lots mélangés en alerte', cm.lignes.find((l) => /Lots mélangés/.test(l.texte ?? ''))?.type, 'alerte');
      v.egal('… rappel N7 une fois', cm.lignes.filter((l) => l.type === 'renvoi').map((l) => l.renvoi), ['rappel:N7']);
      const deuxMelanges = calibration({ ...melanges, fiches: [melanges.fiches[0], { ...demi, lots: { nombre: 2, retenus: ['C', 'D'], aPreciser: false } }] });
      v.egal('deux fiches mélangées : N7 une seule fois', deuxMelanges.lignes.filter((l) => l.type === 'renvoi').map((l) => l.renvoi), ['rappel:N7']);
      const br = calibration({ ...entreesTerrain('brompton'), fiches: melanges.fiches });
      v.egal('Brompton : BR 7 puis B4', br.lignes.filter((l) => l.type === 'renvoi').map((l) => l.renvoi), ['ms:br:7', 'rappel:B4']);
      v.vrai('… texte de calibration Brompton', textes(br)[0] === 'Black Pearl BP2 V2 : Lots mélangés (A, B), écarts de couleur possibles : même mémoire de calibration sur toutes les dalles (Brompton).', textes(br));
      const coex = calibration({ ...entreesTerrain('coex'), fiches: melanges.fiches });
      v.egal('COEX : la ligne « Lots mélangés » seule', [textes(coex)[0], coex.lignes.filter((l) => l.type === 'renvoi' || l.type === 'note').length],
        ['Black Pearl BP2 V2 : Lots mélangés (A, B), écarts de couleur possibles.', 0]);
      v.egal('lots à préciser', textes(calibration({ ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: 3, retenus: [], aPreciser: true } }] })),
        ['Black Pearl BP2 V2 : Lots utilisés : à préciser (plusieurs lots sans quantité) : coche ceux de ce mur dans l\'onglet Mur.']);
      v.egal('aucun lot coché', textes(calibration({ ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: 2, retenus: [], aPreciser: false } }] })),
        ['Black Pearl BP2 V2 : Aucun lot coché : coche ceux de ce mur dans l\'onglet Mur.']);
      v.egal('pas de lot dans le parc', textes(calibration({ ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: 0, retenus: [], aPreciser: false } }] })),
        ['Pas de lot noté pour Black Pearl BP2 V2 dans le parc.']);
      v.egal('sans parc', textes(calibration({ ...e0, parc: null, avantDePartir: null, fiches: [{ ...e0.fiches[0], lots: null }] })),
        ['Pas de lot noté pour Black Pearl BP2 V2 dans le parc.']);
      // Avec les vrais lots d'un parc : lotsDuMur donne les retenus que la check-list reçoit.
      const lots = [{ id: 'l1', identifiant: 'A', quantite: 50 }, { id: 'l2', identifiant: 'B', quantite: 50 }];
      const choix = fiches.lotsDuMur(lots, 72, null, { logiciel: 'NovaLCT' });
      const reel = calibration({ ...e0, fiches: [{ ...e0.fiches[0], lots: { nombre: lots.length, retenus: choix.retenus.map((l) => l.identifiant), aPreciser: choix.aPreciser } }] });
      v.vrai('lotsDuMur : deux lots retenus, même texte que l\'alerte R140', textes(reel)[0] === `Black Pearl BP2 V2 : ${fiches.texteLotsMelanges(['A', 'B'], 'NovaLCT')}`
        && choix.alertes.includes(fiches.texteLotsMelanges(['A', 'B'], 'NovaLCT')), textes(reel));
    },
  },
  {
    id: 'R452',
    titre: 'Check-list, mes étapes (lot 27a, spec § 4.6) : une étape par ajout après les douze, total 12 + ajouts ; texte de 1 à 80 caractères, espaces de bord retirés, 20 au plus par mur, refus avec la raison ; retirer une étape retire aussi sa case ; cocher, décocher, « Tout décocher » sans toucher aux étapes ajoutées',
    etape: '27a',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      let n = 0;
      const alea = () => `e${(n += 1)}`;
      let t = terrain.terrainVide();
      v.egal('terrain vide', t, { etat: null, coches: {}, ajouts: [] });
      t = terrain.ajouterEtape(t, '  Scotcher les câbles au sol  ', { alea });
      t = terrain.ajouterEtape(t, 'Photo du mur pour le chef de projet', { alea });
      v.egal('étapes ajoutées, texte nettoyé', t.ajouts, [{ id: 'e1', texte: 'Scotcher les câbles au sol' }, { id: 'e2', texte: 'Photo du mur pour le chef de projet' }]);
      const r = terrain.etapesTerrain({ ...entreesTerrain('novastar'), ajouts: t.ajouts }, donnees);
      v.egal('total 12 + 2', [r.total, r.etapes.length], [14, 14]);
      v.egal('étapes ajoutées à la fin', r.etapes.slice(12).map((e) => [e.id, e.titre, e.ajout, e.calculee]), [['ajout-e1', 'Scotcher les câbles au sol', true, false], ['ajout-e2', 'Photo du mur pour le chef de projet', true, false]]);
      v.vrai('refus : vide', /1 à 80 caractères/.test(messageErreur(() => terrain.ajouterEtape(t, '   ', { alea }))));
      v.vrai('refus : 81 caractères', /1 à 80 caractères/.test(messageErreur(() => terrain.ajouterEtape(t, 'x'.repeat(81), { alea }))));
      v.egal('80 caractères acceptés', terrain.ajouterEtape(t, 'y'.repeat(80), { alea }).ajouts.length, 3);
      let plein = terrain.terrainVide();
      for (let i = 0; i < 20; i += 1) plein = terrain.ajouterEtape(plein, `Étape ${i + 1}`, { alea });
      v.vrai('refus : 21e étape', /20 étapes ajoutées au plus/.test(messageErreur(() => terrain.ajouterEtape(plein, 'Encore une', { alea }))));
      const sig = r.etapes[12].signature;
      t = terrain.cocherEtape(t, 'ajout-e1', sig);
      t = terrain.cocherEtape(t, 'mire', r.etapes[8].signature);
      v.egal('cocher', Object.keys(t.coches), ['ajout-e1', 'mire']);
      v.egal('décocher', Object.keys(terrain.cocherEtape(t, 'mire', null).coches), ['ajout-e1']);
      v.egal('tout décocher : les étapes ajoutées gardent leur case', terrain.toutDecocher(t).coches, { 'ajout-e1': sig });
      const sans = terrain.retirerEtape(t, 'e1');
      v.egal('retirer : l\'étape et sa case', [sans.ajouts.map((a) => a.id), Object.keys(sans.coches)], [['e2'], ['mire']]);
      v.egal('état avec une étape ajoutée cochée', terrain.etatTerrain(r, { 'ajout-e1': sig }), { faites: 1, total: 14 });
      v.egal('signature d\'une étape ajoutée : son texte', terrain.etapesTerrain({ ...entreesTerrain('coex'), ajouts: [t.ajouts[0]] }, donnees).etapes[12].signature, sig);
    },
  },
  {
    id: 'R453',
    titre: 'Check-list gardée avec le mur (lot 27a, spec § 4.4, § 7) : `terrain` { etat, coches, ajouts } dans les données du mur ; cases et état sans marquer la presta modifiée, étapes ajoutées en la marquant ; terrain vide retiré ; murVide inchangé ; dupliquer un mur ou une presta garde les étapes ajoutées, sans les cases ni l\'état ; dans le fichier exporté seulement quand il est rempli (lot 27d, accord de l\'utilisateur du 05/11/2026)',
    etape: '27a',
    verifier(v) {
      const o = optionsPresta();
      const { etat, presta } = prestaEssai(o);
      const murId = presta.murs[0].id;
      const avant = etat.index.prestas.find((p) => p.id === presta.id).modifieeLe;
      const plus = horloge(o, '2026-11-01T14:00:00Z');
      v.egal('terrain d\'un mur jamais ouvert', prestas.terrainMur(etat, murId), { etat: null, coches: {}, ajouts: [] });
      const e1 = prestas.enregistrerMur(etat, murId, { terrain: { etat: { faites: 1, total: 12, calculeLe: '2026-11-01T14:00:00.000Z' }, coches: { mire: 'sig-mire' }, ajouts: [] } }, plus);
      v.egal('cases et état gardés', e1.murs[murId].terrain, { etat: { faites: 1, total: 12, calculeLe: '2026-11-01T14:00:00.000Z' }, coches: { mire: 'sig-mire' } });
      v.egal('… sans marquer la presta modifiée', e1.index.prestas.find((p) => p.id === presta.id).modifieeLe, avant);
      const e2 = prestas.enregistrerMur(e1, murId, { terrain: { ...prestas.terrainMur(e1, murId), ajouts: [{ id: 'e1', texte: 'Scotcher les câbles' }] } }, plus);
      v.egal('étape ajoutée : presta modifiée', e2.index.prestas.find((p) => p.id === presta.id).modifieeLe, '2026-11-01T14:00:00.000Z');
      v.egal('terrain lu entier', prestas.terrainMur(e2, murId), { etat: { faites: 1, total: 12, calculeLe: '2026-11-01T14:00:00.000Z' }, coches: { mire: 'sig-mire' }, ajouts: [{ id: 'e1', texte: 'Scotcher les câbles' }] });
      const e3 = prestas.enregistrerMur(e2, murId, { terrain: terrain.toutDecocher(prestas.terrainMur(e2, murId)) }, horloge(o, '2026-11-01T15:00:00Z'));
      v.egal('tout décocher : presta pas modifiée de nouveau', e3.index.prestas.find((p) => p.id === presta.id).modifieeLe, '2026-11-01T14:00:00.000Z');
      const vide = prestas.enregistrerMur(e1, murId, { terrain: terrain.terrainVide() }, plus);
      v.egal('terrain vide : retiré', 'terrain' in vide.murs[murId], false);
      const ajout = prestas.ajouterMur(e2, presta.id, {}, o);
      v.egal('murVide inchangé', Object.keys(ajout.murs[ajout.index.ouverte.mur]), ['version', 'parc', 'configuration', 'montage']);
      const d = prestas.dupliquerMur(e2, presta.id, murId, o);
      v.egal('dupliquer un mur : étapes ajoutées seules', d.murs[d.index.ouverte.mur].terrain, { ajouts: [{ id: 'e1', texte: 'Scotcher les câbles' }] });
      const sansAjout = prestas.dupliquerMur(e1, presta.id, murId, o);
      v.egal('dupliquer un mur sans étape ajoutée : pas de terrain', 'terrain' in sansAjout.murs[sansAjout.index.ouverte.mur], false);
      const dp = prestas.dupliquerPresta(e2, presta.id, o);
      const copie = dp.index.prestas.find((p) => p.id === dp.index.ouverte.presta);
      v.egal('dupliquer une presta : étapes ajoutées seules', dp.murs[copie.murs[0].id].terrain, { ajouts: [{ id: 'e1', texte: 'Scotcher les câbles' }] });
      v.egal('l\'original garde tout', d.murs[murId].terrain, e2.murs[murId].terrain);
      const { donnees } = prestas.exporterPresta(e2, presta.id, fiches.baseVide(), o);
      v.egal('dans le fichier exporté seulement quand il est rempli (lot 27d, accord de l\'utilisateur du 05/11/2026)', donnees.murs.map((m) => m.terrain ?? null), [e2.murs[murId].terrain, null]);
      v.egal('montage et NovaLCT toujours sans marquer la presta', prestas.enregistrerMur(e2, murId, { montage: { data: { branches: ['2'] } }, novalct: { cases: { a: 1 } } }, horloge(o, '2026-11-02T10:00:00Z'))
        .index.prestas.find((p) => p.id === presta.id).modifieeLe, '2026-11-01T14:00:00.000Z');
    },
  },
  {
    id: 'R454',
    titre: 'Source « cdc » du pas à pas NovaLCT (lot 27a, choix 9 de l\'utilisateur du 01/11/2026) : libellé « Formation », titre « Formation, mise en service Novastar », confiance « formation » ; les étapes qui la citent la gardent',
    etape: '27a',
    verifier(v, contexte) {
      v.egal('source cdc', novalct.SOURCES_NOVALCT.cdc, { titre: 'Formation, mise en service Novastar', court: 'Formation', confiance: 'formation' });
      const p = pasAPasNovaLCT(contexte);
      const cites = p.parties.flatMap((x) => x.etapes).filter((e) => e.sources.some((s) => s.id === 'cdc'));
      v.vrai('étapes qui la citent', cites.length > 0, cites.length);
      v.egal('… avec le libellé « Formation »', [...new Set(cites.flatMap((e) => e.sources.filter((s) => s.id === 'cdc').map((s) => s.court)))], ['Formation']);
    },
  },
  {
    id: 'R455',
    titre: 'Entrées de la check-list rassemblées depuis les vrais résultats des onglets (lot 27b, spec § 3 et § 8) : mur Novastar dans un parc (MCTRL4K, BP2 V2 en lot A avec sa config NovaLCT) : marque, logiciel, processeur, ports de la variante data retenue, arrivée et lignes de la variante élec retenue avec leur phase, source et blocs de Canvas, pixels lus dans la fiche avec leur source, lots et config du lot, « Avant de partir », suivis du montage et de NovaLCT repris tels quels',
    etape: '27b',
    verifier(v, contexte) {
      const o = ongletsTerrain(contexte);
      const e = terrain.entreesDuMur(o);
      v.egal('marque, logiciel, parc', [e.marque, e.nomMarque, e.logiciel, e.parc], ['novastar', 'Novastar', 'NovaLCT', { id: o.parc.id, nom: 'Parc A' }]);
      v.egal('processeur', e.processeur, { id: 'novastar-mctrl4k', nom: 'MCTRL4K', nombre: 1, secours: 0 });
      v.egal('redondance et réseau (Novastar : pas de ligne réseau)', [e.redondance, e.reseau], [false, null]);
      v.egal('ports de la variante data retenue', e.ports, { principaux: o.cablageData.ports, secours: 0 });
      v.vrai('… au moins un port', e.ports.principaux > 0, e.ports);
      v.egal('arrivée de l\'onglet Élec', e.elec.arrivees, [{ type: 'tri', intensiteA: 32 }]);
      v.egal('lignes de la variante élec retenue, avec leur phase', e.elec.lignes, o.elec.variante.lignesDetail.map((l) => ({ numero: l.numero, phase: l.phase })));
      v.vrai('… phases L1 à L3', e.elec.lignes.every((l) => [1, 2, 3].includes(l.phase)), e.elec.lignes);
      v.egal('pas d\'alerte de courant d\'appel', e.elec.alerteAppel, null);
      v.egal('source et blocs de Canvas', [e.canvas.source, e.canvas.blocs], [{ largeurPx: 1920, hauteurPx: 1080, frequenceHz: 60 }, [{ numero: 1, xSource: [0, 1407], ySource: [0, 703] }]]);
      v.egal('aucune alerte de source', e.canvas.alertes, []);
      const f = e.fiches[0];
      v.egal('une fiche, pixels lus dans la fiche', [e.fiches.length, f.id, f.nom, f.pixelsLargeur, f.pixelsHauteur], [1, 'roe-bp2-v2', o.data.dalle.nom, o.data.dalle.pxH, o.data.dalle.pxV]);
      v.egal('source des pixels : celle de la fiche', f.source, o.data.dalle.sources.pxH.sources.map(sourceCourte).join(', '));
      v.egal('lots retenus', f.lots, { nombre: 1, retenus: ['A'], aPreciser: false });
      v.egal('config du lot (sans la ligne des lots, reprise par la calibration)', f.config.lignes, o.data.groupes[0].configs.lignes.filter((l) => !l.startsWith('Lots utilisés')));
      v.vrai('… le fichier du lot', f.config.lignes.length === 1 && f.config.lignes[0].startsWith('Config NovaLCT : BP2V2_A.rcfgx'), f.config.lignes);
      v.egal('identifiant de la config retenue', f.config.ids, [fiches.idConfig(o.lot.configs[0], o.lot.id)]);
      v.egal('« Avant de partir » repris tel quel', e.avantDePartir, o.data.avantDePartir);
      v.egal('suivis repris tels quels', [e.montage, e.novalct], [o.montage, o.novalct]);
      v.egal('étapes ajoutées et calculs valides', [e.ajouts, e.nonValides], [[], []]);
      // Les entrées servent telles quelles à la check-list.
      const r = terrain.etapesTerrain(e, donneesTerrain(contexte));
      const textes = (id) => r.etapes.find((x) => x.id === id).lignes.filter((l) => l.type === 'texte' || l.type === 'alerte').map((l) => l.texte);
      v.egal('check-list : processeur', textes('processeur'), ['Processeur : 1 × MCTRL4K', 'Pas à pas NovaLCT : 9 sur 14']);
      v.egal('check-list : dalle et config', textes('config'), ['Dalle : 176 × 176 px', f.config.lignes[0]]);
      v.egal('check-list : arrivée', textes('arrivee'), ['Arrivée : tri 32 A']);
      v.egal('check-list : lignes', textes('tension'), e.elec.lignes.map((l) => `Ligne ${l.numero} · L${l.phase}`));
      v.egal('check-list : calibration', textes('calibration'), ['Un seul lot de ROE BP2 V2 : lot A.']);
      v.egal('check-list : câblage data', textes('cablage-data'), ['Montage data : 1 port sur 2 branché (port 1)']);
    },
  },
  {
    id: 'R456',
    titre: 'Entrées de la check-list, mur Brompton sans parc (lot 27b) : marque Brompton, logiciel Tessera, fréquence et profondeur réseau avec leur origine (celle de Data) ; sans parc, ni lots, ni config, ni « Avant de partir » ; en redondance, ports de secours de la variante retenue, aucun boîtier de secours',
    etape: '27b',
    verifier(v, contexte) {
      const o = ongletsTerrain(contexte, { procId: 'brompton-s8', colonnes: 12, rangees: 6, reglages: { bits: 12 }, parc: false, origineBits: 'défaut (livraison Tessera)' });
      const e = terrain.entreesDuMur(o);
      v.egal('marque et logiciel', [e.marque, e.nomMarque, e.logiciel], ['brompton', 'Brompton', 'Tessera']);
      v.egal('réseau Brompton', e.reseau, { frequenceHz: 60, bits: 12, origine: 'défaut (livraison Tessera)' });
      v.egal('processeur', e.processeur, { id: 'brompton-s8', nom: 'S8', nombre: o.data.evaluation.nombre, secours: 0 });
      v.egal('sans parc', [e.parc, e.avantDePartir, e.fiches[0].lots, e.fiches[0].config], [null, null, null, { lignes: [], ids: [] }]);
      const r = terrain.etapesTerrain(e, donneesTerrain(contexte));
      const textes = (id) => r.etapes.find((x) => x.id === id).lignes.filter((l) => l.type === 'texte' || l.type === 'alerte').map((l) => l.texte);
      v.egal('check-list : réseau', textes('processeur')[1], 'Fréquence et profondeur réseau : 60 Hz, 12 bits (défaut (livraison Tessera))');
      v.egal('check-list : au dépôt sans parc', textes('depot'), ['Pas de parc pour ce mur : rien de propre au parc à vérifier.']);
      v.egal('check-list : config sans parc', textes('config'), ['Dalle : 176 × 176 px', 'Choisis un parc pour voir ses lots et ses configs.']);
      v.egal('check-list : calibration sans lot', textes('calibration'), ['Pas de lot noté pour ROE BP2 V2 dans le parc.']);
      const red = terrain.entreesDuMur(ongletsTerrain(contexte, { procId: 'brompton-s8', colonnes: 12, rangees: 6, reglages: { bits: 12, redondance: true }, parc: false }));
      v.egal('redondance : ports de secours, aucun boîtier de secours', [red.redondance, red.ports.secours === red.ports.principaux, red.processeur.secours], [true, true, 0]);
    },
  },
  {
    id: 'R457',
    titre: 'Entrées de la check-list selon la marque (lot 27b) : Novastar avec un processeur de secours (« 1 × MCTRL4K + 1 de secours », ports de secours), COEX (gamme de Novastar, logiciel VMP), Colorlight (autre marque, son nom et LEDVISION)',
    etape: '27b',
    verifier(v, contexte) {
      const s = terrain.entreesDuMur(ongletsTerrain(contexte, { reglages: { redondance: true, secours: 'processeur' } }));
      v.egal('secours par un second processeur', [s.marque, s.processeur.nombre, s.processeur.secours, s.redondance], ['novastar', 1, 1, true]);
      v.vrai('… ports de secours', s.ports.secours > 0, s.ports);
      const r = terrain.etapesTerrain(s, donneesTerrain(contexte));
      v.egal('check-list : processeurs et secours', r.etapes[5].lignes[0].texte, 'Processeurs : 1 × MCTRL4K + 1 de secours');
      v.vrai('check-list : NS c3', r.etapes[5].lignes.some((l) => l.renvoi === 'ms:ns:c3'), r.etapes[5].lignes.map((l) => l.renvoi ?? l.texte));
      const c = terrain.entreesDuMur(ongletsTerrain(contexte, { procId: 'coex-mx40-pro' }));
      v.egal('COEX', [c.marque, c.nomMarque, c.logiciel, c.processeur.nom], ['coex', 'COEX', 'VMP', 'MX40 Pro']);
      const z = terrain.entreesDuMur(ongletsTerrain(contexte, { procId: 'colorlight-z6' }));
      v.egal('Colorlight', [z.marque, z.nomMarque, z.logiciel], ['autre', 'Colorlight', 'LEDVISION']);
    },
  },
  {
    id: 'R458',
    titre: 'Entrées de la check-list, calcul non valide (lot 27b, spec § 4.3) : Data sans processeur ou processeur qui ne convient pas, Élec sans résultat, Canvas refusé : onglets en cause dans `nonValides` ; tant qu\'un onglet n\'est pas valide, aucune case n\'est décochée (marque inconnue comprise) et les cases comptent',
    etape: '27b',
    verifier(v, contexte) {
      const o = ongletsTerrain(contexte);
      v.egal('tout valide', terrain.entreesDuMur(o).nonValides, []);
      const sansData = terrain.entreesDuMur({ ...o, data: null, cablageData: null });
      v.egal('Data sans résultat', [sansData.nonValides, sansData.marque, sansData.processeur, sansData.ports], [['data'], null, null, null]);
      const impossible = terrain.entreesDuMur({ ...o, data: { ...o.data, evaluation: { ...o.data.evaluation, groupes: [], impossible: 'Trop grand.' } } });
      v.egal('processeur qui ne convient pas : non valide, sa marque reste', [impossible.nonValides, impossible.marque], [['data'], 'novastar']);
      v.egal('Élec sans résultat', terrain.entreesDuMur({ ...o, elec: null }).nonValides, ['elec']);
      v.egal('Canvas sans contrôle', terrain.entreesDuMur({ ...o, canvas: null }).nonValides, ['canvas']);
      v.egal('Canvas refusé', terrain.entreesDuMur({ ...o, canvas: { ...o.canvas, controle: { ...o.canvas.controle, ok: false } } }).nonValides, ['canvas']);
      // Toutes les cases cochées sur le mur valide, puis Data perdu (marque inconnue : chaque signature change).
      const donnees = donneesTerrain(contexte);
      const r0 = terrain.etapesTerrain(terrain.entreesDuMur(o), donnees);
      const coches = Object.fromEntries(r0.etapes.filter((x) => x.signature).map((x) => [x.id, x.signature]));
      const r1 = terrain.etapesTerrain(sansData, donnees);
      const rapproche = terrain.rapprocherTerrain(r1, coches);
      v.egal('Data non valide : rien de décoché', [Object.keys(rapproche.coches).length, rapproche.retirees, rapproche.avis], [10, [], null]);
      v.egal('… les cases comptent', terrain.etatTerrain(r1, coches).faites, 10);
      const valide = terrain.rapprocherTerrain(terrain.etapesTerrain({ ...terrain.entreesDuMur(o), marque: 'coex', logiciel: 'VMP' }, donnees), coches);
      v.egal('calcul valide de nouveau, autre marque : décochées avec leur raison', valide.retirees.length, 10);
    },
  },
  {
    id: 'R459',
    titre: 'Entrées de la check-list, cas particuliers (lot 27b) : rangée de demi-dalles (sa fiche, ses pixels, ses lignes de config avec son nom), mur mixte (fiche de chaque zone), plusieurs arrivées, arrivée mono (lignes sans phase), alerte de courant d\'appel d\'Élec, alertes EDID et plage de Canvas seulement, étapes ajoutées reprises',
    etape: '27b',
    verifier(v, contexte) {
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const demi = dalleDeBase(contexte, 'roe-cb5-mkii-demi');
      const o = ongletsTerrain(contexte, { dalle: cb5, demi, colonnes: 6, rangees: 3 });
      const e = terrain.entreesDuMur(o);
      v.egal('deux fiches : dalle et demi-dalle, pixels de chacune', e.fiches.map((f) => [f.id, f.pixelsLargeur, f.pixelsHauteur]),
        [[cb5.id, cb5.pxH, cb5.pxV], [demi.id, demi.pxH, demi.pxV]]);
      v.vrai('lignes de config de la demi-dalle préfixées de son nom', e.fiches[1].config.lignes.length > 0 && e.fiches[1].config.lignes.every((l) => l.startsWith(`Demi-dalles (${demi.nom}) : `)), e.fiches[1].config.lignes);
      v.egal('lots de la demi-dalle', e.fiches[1].lots, { nombre: 1, retenus: ['D'], aPreciser: false });
      const mixte = terrain.entreesDuMur({ ...o, data: { ...o.data, groupes: [o.data.groupes[0]], mur: { ...o.data.mur, demi: null, mixte: true, zones: [{ dalle: cb5, demi: null }, { dalle: dalleDeBase(contexte, 'roe-bp2-v2'), demi: null }] } } });
      v.egal('mur mixte : la fiche de chaque zone, une fois', mixte.fiches.map((f) => [f.id, f.lots ? 'lots' : null]), [[cb5.id, 'lots'], ['roe-bp2-v2', null]]);
      const deux = terrain.entreesDuMur({ ...o, elec: { ...o.elec, arrivees: [{ id: 'arr-1', type: 'tri', intensiteA: 32 }, { id: 'arr-2', type: 'mono', intensiteA: 16 }] } });
      v.egal('plusieurs arrivées', deux.elec.arrivees, [{ type: 'tri', intensiteA: 32 }, { type: 'mono', intensiteA: 16 }]);
      const mono = ongletsTerrain(contexte, { arrivee: { type: 'mono', intensiteA: 32 }, colonnes: 4, rangees: 2 });
      v.egal('arrivée mono : lignes sans phase', terrain.entreesDuMur(mono).elec.lignes.map((l) => l.phase), mono.elec.variante.lignesDetail.map(() => null));
      const appel = ongletsTerrain(contexte, { dalle: { ...dalleDeBase(contexte, 'roe-bp2-v2'), courantAppelA: 40 } });
      const texteAppel = appel.elec.resultat.alertes.find((a) => a.startsWith('Courant d\'appel'));
      v.vrai('essai : Élec a une alerte de courant d\'appel', Boolean(texteAppel), appel.elec.resultat.alertes);
      v.egal('alerte de courant d\'appel reprise', terrain.entreesDuMur(appel).elec.alerteAppel, texteAppel);
      const liaisons = liaisonsDeBase(contexte);
      const ev = o.data.evaluation;
      const source = { largeurPx: 1920, hauteurPx: 1200, frequenceHz: 60, bits: 8, espace: 'YUV', plage: 'Limited', liaison: 'hdmi-2.0' };
      const controle = calculs.controleSource(source, ev, liaisons, { famille: 'novastar', bitsReseau: 8, frequenceHz: 60 });
      const alertes = terrain.entreesDuMur({ ...o, canvas: { source, controle } }).canvas.alertes;
      v.egal('alertes de Canvas : EDID et plage seulement', alertes, controle.alertes.filter((a) => /^Résolution de source|^Plage Limited/.test(a)));
      v.egal('… les deux', alertes.length, 2);
      v.egal('étapes ajoutées reprises', terrain.entreesDuMur({ ...o, ajouts: [{ id: 'a1', texte: 'Scotcher' }] }).ajouts, [{ id: 'a1', texte: 'Scotcher' }]);
    },
  },
  {
    id: 'R460',
    titre: 'Carnet de pannes, une panne (lot 27c, spec § 5.1) : dalle, fiche, port et ligne copiés et gardés tels quels ; symptôme S1 à S11 (Dépannage) ou « autre » ; remplacement dans la liste fermée des 7 ; lot en texte ou rien ; n° de série de 1 à 30 caractères, espaces de bord retirés, vide : rien ; date de saisie automatique ; refus avec la raison (symptôme inconnu, remplacement hors liste, n° trop long, dalle manquante, 201e panne) ; modifier ne change ni la date, ni la dalle, ni le port, ni la ligne ; supprimer ; lignes affichées dans l\'ordre de la spec § 7',
    etape: '27c',
    verifier(v, contexte) {
      const { depannage } = donneesTerrain(contexte);
      const symptomes = terrain.symptomesPanne(depannage);
      let n = 0;
      const o = { symptomes, alea: () => `p${(n += 1)}`, maintenant: () => new Date('2026-11-05T14:32:00Z') };
      v.egal('liste fermée des remplacements', terrain.REMPLACEMENTS,
        ['Dalle de spare', 'Module', 'Carte de réception', 'Alimentation', 'Autre pièce', 'Rien (réparée sur place)', 'Pas encore remplacée']);
      v.egal('symptômes du Dépannage', symptomes, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11']);
      const port = 'MCTRL4K n° 1, port 3, dalle 4 sur 10';
      const ligne = 'ligne 2, phase L2, dalle 3 sur 7';
      const saisie = {
        dalle: 'C3 R2', ficheId: 'roe-bp2-v2', fiche: 'Black Pearl BP2 V2', port, ligne,
        symptome: 'S2', remplacePar: 'Dalle de spare', lot: 'A', serieHS: '  BP2-0042 ', serieNouvelle: '',
      };
      const t = terrain.ajouterPanne(terrain.terrainVide(), saisie, o);
      const p1 = {
        id: 'p1', quand: '2026-11-05T14:32:00.000Z', dalle: 'C3 R2', ficheId: 'roe-bp2-v2', fiche: 'Black Pearl BP2 V2', port, ligne,
        symptome: 'S2', remplacePar: 'Dalle de spare', lot: 'A', serieHS: 'BP2-0042', serieNouvelle: null,
      };
      v.egal('panne gardée, n° nettoyés', t.pannes, [p1]);
      const avecEtapes = terrain.ajouterPanne({ ...terrain.terrainVide(), coches: { mire: 'sig' }, ajouts: [{ id: 'e1', texte: 'Scotcher' }] }, saisie, o);
      v.egal('cases et étapes ajoutées gardées', [avecEtapes.coches, avecEtapes.ajouts], [{ mire: 'sig' }, [{ id: 'e1', texte: 'Scotcher' }]]);
      const autre = terrain.ajouterPanne(t, { ...saisie, symptome: 'autre', port: null, ligne: null, lot: null, serieHS: '', remplacePar: 'Pas encore remplacée' }, o);
      v.egal('symptôme « autre », sans port, ligne, lot ni n°', [autre.pannes.length, autre.pannes[1].symptome, autre.pannes[1].port, autre.pannes[1].ligne, autre.pannes[1].lot, autre.pannes[1].serieHS],
        [2, 'autre', null, null, null, null]);
      v.egal('lot hors du parc (supprimé depuis) : le texte reste', terrain.ajouterPanne(t, { ...saisie, lot: 'C' }, o).pannes[1].lot, 'C');
      v.vrai('refus : symptôme inconnu', /Symptôme/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, symptome: 'S12' }, o))));
      v.vrai('refus : symptôme vide', /Symptôme/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, symptome: '' }, o))));
      v.vrai('refus : remplacement hors liste', /Remplacée par/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, remplacePar: 'Cadre' }, o))));
      v.vrai('refus : n° de série HS de 31 caractères', /30 caractères/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, serieHS: 'x'.repeat(31) }, o))));
      v.vrai('refus : n° de série nouvelle de 31 caractères', /30 caractères/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, serieNouvelle: 'x'.repeat(31) }, o))));
      v.egal('30 caractères acceptés', terrain.ajouterPanne(t, { ...saisie, serieNouvelle: 'y'.repeat(30) }, o).pannes[1].serieNouvelle, 'y'.repeat(30));
      v.vrai('refus : sans dalle', /dalle/.test(messageErreur(() => terrain.ajouterPanne(t, { ...saisie, dalle: '' }, o))));
      let plein = terrain.terrainVide();
      for (let i = 0; i < 200; i += 1) plein = terrain.ajouterPanne(plein, saisie, o);
      v.egal('200 pannes acceptées', plein.pannes.length, 200);
      v.vrai('refus : 201e panne', /200 pannes au plus/.test(messageErreur(() => terrain.ajouterPanne(plein, saisie, o))));
      const plusTard = { ...o, maintenant: () => new Date('2026-11-06T09:00:00Z') };
      const m = terrain.modifierPanne(t, 'p1', {
        symptome: 'S3', remplacePar: 'Module', lot: null, serieHS: 'X1', serieNouvelle: 'Y2', dalle: 'C9 R9', port: 'autre', ligne: 'autre', quand: '2020-01-01T00:00:00.000Z', ficheId: 'autre',
      }, plusTard);
      v.egal('modifier : seuls symptôme, remplacement, lot et n° changent', m.pannes,
        [{ ...p1, symptome: 'S3', remplacePar: 'Module', lot: null, serieHS: 'X1', serieNouvelle: 'Y2' }]);
      v.vrai('modifier : refus avec la raison', /Remplacée par/.test(messageErreur(() => terrain.modifierPanne(t, 'p1', { ...saisie, remplacePar: 'x' }, o))));
      v.vrai('modifier : panne introuvable', /Panne introuvable/.test(messageErreur(() => terrain.modifierPanne(t, 'p9', saisie, o))));
      v.egal('supprimer', terrain.pannesDe(terrain.supprimerPanne(autre, 'p1')).map((p) => p.id), [autre.pannes[1].id]);
      v.egal('supprimer la dernière : plus de pannes', terrain.pannesDe(terrain.supprimerPanne(t, 'p1')), []);
      v.egal('terrain vide : aucune panne', terrain.pannesDe(terrain.terrainVide()), []);
      v.egal('lignes d\'une panne (spec § 7)', terrain.lignesPanne(t.pannes[0], depannage), [
        ['Dalle', 'C3 R2, Black Pearl BP2 V2'], ['Symptôme', 'Des dalles entières sont noires'], ['Remplacée par', 'dalle de spare'], ['Lot', 'A'],
        ['N° de série HS', 'BP2-0042'], ['Data', port], ['Élec', ligne]]);
      v.egal('lignes vides omises, symptôme « autre »', terrain.lignesPanne(autre.pannes[1], depannage),
        [['Dalle', 'C3 R2, Black Pearl BP2 V2'], ['Symptôme', 'Autre'], ['Remplacée par', 'pas encore remplacée']]);
      v.egal('date affichée', terrain.texteQuand(new Date(2026, 10, 1, 14, 32).toISOString()), '01/11/2026 14:32');
    },
  },
  {
    id: 'R461',
    titre: 'Carnet de pannes, dalle touchée dans le Schéma (lot 27c, spec § 5.1, § 5.2) : nom de la dalle (« C3 R2 », « B · C3 R2 » en zones), fiche (demi-dalle sur la sienne), port copié de la variante data retenue (« MCTRL4K n° 1, port 3, dalle 4 sur 10 ») et ligne de la variante élec retenue (« ligne 2, phase L2, dalle 3 sur 7 », phase en tri seulement), quel que soit le câblage affiché ; vides sans variante',
    etape: '27c',
    verifier(v, contexte) {
      const o = ongletsTerrain(contexte, { colonnes: 8, rangees: 4 });
      const dalles = calculs.dallesDuMur(o.data.mur, o.data.dalle);
      const vd = o.cablageData;
      const ve = o.elec.variante;
      const d = dalles.find((x) => x.id === 'C3 R2');
      const p = terrain.panneDeLaDalle(d, { data: vd, elec: ve });
      const proc = vd.processeurs.find((x) => x.ports.some((pt) => pt.dalles.includes('C3 R2')));
      const pt = proc.ports.find((x) => x.dalles.includes('C3 R2'));
      const l = ve.lignesDetail.find((x) => x.dalles.includes('C3 R2'));
      v.egal('dalle et fiche', [p.dalle, p.ficheId, p.fiche], ['C3 R2', o.data.dalle.id, o.data.dalle.nom]);
      v.egal('port de la variante data', p.port, `MCTRL4K n° ${proc.numero}, ${pt.libelle}, dalle ${pt.dalles.indexOf('C3 R2') + 1} sur ${pt.dalles.length}`);
      v.vrai('… forme « MCTRL4K n° 1, port 3, dalle 4 sur 10 »', /^MCTRL4K n° \d+, port \d+, dalle \d+ sur \d+$/.test(p.port), p.port);
      v.egal('ligne de la variante élec, phase en tri', p.ligne, `ligne ${l.numero}, phase L${l.phase}, dalle ${l.dalles.indexOf('C3 R2') + 1} sur ${l.dalles.length}`);
      v.vrai('… essai : plusieurs phases', ve.phases.length > 1, ve.phases);
      const mono = ongletsTerrain(contexte, { arrivee: { type: 'mono', intensiteA: 32 }, colonnes: 4, rangees: 2 });
      const dm = calculs.dallesDuMur(mono.data.mur, mono.data.dalle).find((x) => x.id === 'C2 R1');
      v.vrai('arrivée mono : ligne sans phase', /^ligne \d+, dalle \d+ sur \d+$/.test(terrain.panneDeLaDalle(dm, { data: mono.cablageData, elec: mono.elec.variante }).ligne));
      v.egal('sans variante calculée : port et ligne vides', [terrain.panneDeLaDalle(d, {}).port, terrain.panneDeLaDalle(d, { data: null, elec: null }).ligne], [null, null]);
      const cb5 = dalleDeBase(contexte, 'roe-cb5-mkii');
      const demi = dalleDeBase(contexte, 'roe-cb5-mkii-demi');
      const od = ongletsTerrain(contexte, { dalle: cb5, demi, colonnes: 6, rangees: 3 });
      const dd = calculs.dallesDuMur(od.data.mur, od.data.dalle).find((x) => x.type === 'demi');
      const pd = terrain.panneDeLaDalle(dd, { data: od.cablageData, elec: od.elec.variante });
      v.egal('demi-dalle : sa fiche', [pd.ficheId, pd.fiche], [demi.id, demi.nom]);
      v.vrai('… et son port', Boolean(pd.port), pd);
      const zone = terrain.panneDeLaDalle({ id: calculs.idDalleZone('B', 3, 2), type: 'entiere', fiche: cb5 }, {});
      v.egal('mur en zones : « B · C3 R2 »', zone.dalle, 'B · C3 R2');
    },
  },
  {
    id: 'R462',
    titre: 'Carnet de pannes, lot de la pièce posée (lot 27c, spec § 5.1) : choix parmi les lots de la fiche dans le parc du mur, puis « Lot inconnu » ; par défaut le lot retenu de la fiche s\'il n\'y en a qu\'un ; sans parc, pas de choix',
    etape: '27c',
    verifier(v) {
      const lots = [{ id: 'l1', identifiant: 'A' }, { id: 'l2', identifiant: 'B' }];
      v.egal('un seul lot retenu : par défaut', terrain.lotsPourPanne(lots, ['A']), { choix: ['A', 'B', 'Lot inconnu'], defaut: 'A' });
      v.egal('lots mélangés : pas de défaut', terrain.lotsPourPanne(lots, ['A', 'B']), { choix: ['A', 'B', 'Lot inconnu'], defaut: null });
      v.egal('aucun lot retenu', terrain.lotsPourPanne(lots, []), { choix: ['A', 'B', 'Lot inconnu'], defaut: null });
      v.egal('parc sans lot de cette fiche', terrain.lotsPourPanne([], null), { choix: ['Lot inconnu'], defaut: null });
      v.egal('sans parc : pas de choix', terrain.lotsPourPanne(null, null), { choix: [], defaut: null });
      v.egal('« Lot inconnu » accepté comme lot', terrain.ajouterPanne(terrain.terrainVide(), {
        dalle: 'C1 R1', ficheId: 'f', fiche: 'F', port: null, ligne: null, symptome: 'autre', remplacePar: 'Module', lot: 'Lot inconnu',
      }, { symptomes: ['S1'], alea: () => 'x', maintenant: () => new Date('2026-11-05T10:00:00Z') }).pannes[0].lot, 'Lot inconnu');
    },
  },
  {
    id: 'R463',
    titre: 'Carnet de pannes, spares utilisés (lot 27c, spec § 5.3) : par fiche du mur (demi-dalles sur leur fiche), pannes « Dalle de spare » de ce `ficheId` sur les spares de la liste de matériel gardée du mur ; liste jamais calculée : « Ouvre ce mur une fois pour compter ses spares. » ; plus utilisés que prévus et aucun spare prévu en alerte ; presta : somme par fiche sur ses murs ; rien n\'est retiré de la liste',
    etape: '27c',
    verifier(v) {
      const liste = (lignes) => ({
        sections: [
          { id: 'dalles', lignes: lignes.map(([ficheId, designation, auMur, spares]) => ({ ficheId, designation, auMur, spares, quantite: auMur + spares })) },
          { id: 'data', lignes: [{ designation: 'MCTRL4K', quantite: 1 }] },
        ],
      });
      const panne = (ficheId, fiche, remplacePar = 'Dalle de spare') => ({ ficheId, fiche, remplacePar });
      const bp = (r) => panne('roe-bp2-v2', 'Black Pearl BP2 V2', r);
      const demi = panne('roe-bp2-v2-demi', 'BP2 V2 demi');
      const l1 = liste([['roe-bp2-v2', 'Black Pearl BP2 V2', 160, 8], ['roe-bp2-v2-demi', 'BP2 V2 demi', 16, 1]]);
      const avant = JSON.stringify(l1);
      const r = terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [bp(), bp(), bp('Module'), demi], liste: l1 }]);
      v.egal('par fiche, demi-dalle sur la sienne', r.lignes.map((l) => [l.texte, l.alerte]),
        [['Spares de Black Pearl BP2 V2 : 2 utilisés sur 8', false], ['Spares de BP2 V2 demi : 1 utilisé sur 1', false]]);
      v.egal('… sans note', r.notes, []);
      v.egal('rien n\'est retiré de la liste', JSON.stringify(l1), avant);
      const neuf = terrain.sparesUtilises([{ nom: 'Mur LED', pannes: Array.from({ length: 9 }, () => bp()), liste: l1 }]);
      v.egal('plus utilisés que prévus : alerte', [neuf.lignes[0].texte, neuf.lignes[0].alerte], ['Plus de spare de Black Pearl BP2 V2 : 9 utilisés pour 8 prévus.', true]);
      const zero = liste([['roe-bp2-v2', 'Black Pearl BP2 V2', 160, 0]]);
      const z = terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [bp(), bp()], liste: zero }]);
      v.egal('0 % de spare : alerte', [z.lignes[0].texte, z.lignes[0].alerte], ['Spares de Black Pearl BP2 V2 : 2 dalles de spare utilisées, aucune prévue.', true]);
      v.egal('… une seule', terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [bp()], liste: zero }]).lignes[0].texte, 'Spares de Black Pearl BP2 V2 : 1 dalle de spare utilisée, aucune prévue.');
      v.egal('0 % sans panne', terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [], liste: zero }]).lignes.map((l) => [l.texte, l.alerte]), [['Spares de Black Pearl BP2 V2 : 0 utilisé sur 0', false]]);
      const ailleurs = terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [panne('autre-dalle', 'Autre dalle')], liste: l1 }]);
      v.egal('fiche qui n\'est plus dans le mur : en alerte, après les autres', ailleurs.lignes.map((l) => [l.texte, l.alerte]),
        [['Spares de Black Pearl BP2 V2 : 0 utilisé sur 8', false], ['Spares de BP2 V2 demi : 0 utilisé sur 1', false], ['Spares de Autre dalle : 1 dalle de spare utilisée, aucune prévue.', true]]);
      v.egal('liste jamais calculée', terrain.sparesUtilises([{ nom: 'Mur LED', pannes: [bp()], liste: null }]), { lignes: [], notes: ['Ouvre ce mur une fois pour compter ses spares.'] });
      const presta = terrain.sparesUtilises([
        { nom: 'Mur LED', pannes: [bp(), bp()], liste: l1 },
        { nom: 'Mur LED 2', pannes: [bp()], liste: liste([['roe-bp2-v2', 'Black Pearl BP2 V2', 100, 5]]) },
        { nom: 'Arche', pannes: [bp()], liste: null },
      ], { presta: true });
      v.egal('presta : somme par fiche', presta.lignes.map((l) => l.texte), ['Spares de Black Pearl BP2 V2 : 3 utilisés sur 13', 'Spares de BP2 V2 demi : 0 utilisé sur 1']);
      v.egal('… mur sans liste nommé', presta.notes, ['Arche : ouvre ce mur une fois pour compter ses spares.']);
    },
  },
  {
    id: 'R464',
    titre: 'Carnet de pannes gardé avec le mur (lot 27c, spec § 5.1, § 7) : `terrain.pannes` dans les données du mur ; ajouter, modifier ou supprimer une panne marque la presta modifiée, une case non ; `terrainMur` lit les pannes ; dupliquer un mur ou une presta ne recopie pas les pannes ; `murVide` inchangé',
    etape: '27c',
    verifier(v) {
      const o = optionsPresta();
      const { etat, presta } = prestaEssai(o);
      const murId = presta.murs[0].id;
      const modifiee = (e) => e.index.prestas.find((p) => p.id === presta.id).modifieeLe;
      const opts = { symptomes: ['S2'], alea: () => 'p1', maintenant: () => new Date('2026-11-05T14:32:00Z') };
      const saisie = { dalle: 'C3 R2', ficheId: 'essai-dalle', fiche: 'Dalle d\'essai', port: null, ligne: null, symptome: 'S2', remplacePar: 'Dalle de spare', lot: null };
      const t1 = terrain.ajouterPanne(prestas.terrainMur(etat, murId), saisie, opts);
      const e1 = prestas.enregistrerMur(etat, murId, { terrain: t1 }, horloge(o, '2026-11-05T14:32:00Z'));
      v.egal('panne gardée seule', e1.murs[murId].terrain, { pannes: t1.pannes });
      v.egal('… presta modifiée', modifiee(e1), '2026-11-05T14:32:00.000Z');
      v.egal('terrain lu avec ses pannes', prestas.terrainMur(e1, murId), { etat: null, coches: {}, ajouts: [], pannes: t1.pannes });
      const e2 = prestas.enregistrerMur(e1, murId, { terrain: terrain.cocherEtape(prestas.terrainMur(e1, murId), 'mire', 'sig') }, horloge(o, '2026-11-05T15:00:00Z'));
      v.egal('cocher une case : presta pas modifiée, panne gardée', [modifiee(e2), e2.murs[murId].terrain.pannes.length], ['2026-11-05T14:32:00.000Z', 1]);
      const e3 = prestas.enregistrerMur(e2, murId, { terrain: terrain.modifierPanne(prestas.terrainMur(e2, murId), 'p1', { ...saisie, remplacePar: 'Module' }, opts) }, horloge(o, '2026-11-05T16:00:00Z'));
      v.egal('modifier : presta modifiée', [modifiee(e3), e3.murs[murId].terrain.pannes[0].remplacePar], ['2026-11-05T16:00:00.000Z', 'Module']);
      const d = prestas.dupliquerMur(e3, presta.id, murId, o);
      v.egal('dupliquer un mur : pas de pannes', 'terrain' in d.murs[d.index.ouverte.mur], false);
      const dp = prestas.dupliquerPresta(e3, presta.id, o);
      const copie = dp.index.prestas.find((p) => p.id === dp.index.ouverte.presta);
      v.egal('dupliquer une presta : pas de pannes', copie.murs.map((m) => 'terrain' in dp.murs[m.id]), copie.murs.map(() => false));
      v.egal('l\'original garde sa panne', d.murs[murId].terrain.pannes.length, 1);
      const e4 = prestas.enregistrerMur(e3, murId, { terrain: terrain.supprimerPanne(prestas.terrainMur(e3, murId), 'p1') }, horloge(o, '2026-11-05T17:00:00Z'));
      v.egal('supprimer : presta modifiée, plus de pannes', [modifiee(e4), 'pannes' in e4.murs[murId].terrain], ['2026-11-05T17:00:00.000Z', false]);
      const ajout = prestas.ajouterMur(e3, presta.id, {}, o);
      v.egal('murVide inchangé', Object.keys(ajout.murs[ajout.index.ouverte.mur]), ['version', 'parc', 'configuration', 'montage']);
    },
  },
  {
    id: 'R465',
    titre: 'Texte copié de l\'écran Terrain (lot 27d, spec § 7) : « MISE EN SERVICE », presta, mur, état, une ligne par étape (« OK : … », « À faire : … », son résumé entre parenthèses, étapes ajoutées comprises, calcul non valide signalé), sans les renvois ; « CARNET DE PANNES », chaque panne dans l\'ordre de saisie (« Panne 1 : date », puis ses lignes, vides omises), puis les spares utilisés du mur ; sans panne : « Aucune panne notée. » ; une information par ligne',
    etape: '27d',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const { depannage } = donnees;
      const r = terrain.etapesTerrain({ ...entreesTerrain('novastar'), ajouts: [{ id: 'e1', texte: 'Scotcher les câbles' }] }, donnees);
      const coches = { mire: r.etapes.find((e) => e.id === 'mire').signature, 'ajout-e1': r.etapes[12].signature };
      const { p1, p2, liste } = pannesEssai();
      const spares = terrain.sparesUtilises([{ nom: 'Mur 1', pannes: [p1, p2], liste }]);
      const t = terrain.resumeTerrain({ presta: 'Presta A', mur: 'Mur 1', resultat: r, coches, pannes: [p1, p2], spares, depannage }).split('\n');
      const etat = terrain.etatTerrain(r, coches);
      v.egal('en-tête', t.slice(0, 4), ['MISE EN SERVICE', 'Presta : Presta A', 'Mur : Mur 1', `Mise en service : ${etat.faites} sur 13`]);
      // Étapes de câblage : l'état du guide de montage ; les autres : leur résumé (« 1 à faire »).
      const guide = { 'cablage-data': '1 port sur 2 branché (port 1)', 'cablage-elec': '0 ligne sur 2 branchée' };
      const detail = (e) => guide[e.id] ?? e.resume;
      const attendues = r.etapes.map((e) => `${(e.calculee ? e.faite : Boolean(coches[e.id])) ? 'OK' : 'À faire'} : ${e.titre}${detail(e) ? ` (${detail(e)})` : ''}`);
      v.egal('une ligne par étape, sans les renvois', t.slice(4, 17), attendues);
      v.vrai('cases cochées et étape ajoutée', t.includes('OK : Mire') && t.includes('OK : Scotcher les câbles') && t.includes('À faire : Sauvegarde'), t);
      v.egal('câblage data avec l\'état du guide', t[6], 'À faire : Câblage data (1 port sur 2 branché (port 1))');
      v.egal('carnet, pannes dans l\'ordre de saisie, spares du mur', t.slice(17), [
        'CARNET DE PANNES',
        `Panne 1 : ${terrain.texteQuand(p1.quand)}`, 'Dalle : C3 R2, Black Pearl BP2 V2', 'Symptôme : Des dalles entières sont noires', 'Remplacée par : dalle de spare',
        'Lot : A', 'N° de série HS : BP2-0042', 'N° de série nouvelle : BP2-0107', 'Data : MCTRL4K n° 1, port 3, dalle 4 sur 10', 'Élec : ligne 2, phase L2, dalle 3 sur 7',
        `Panne 2 : ${terrain.texteQuand(p2.quand)}`, 'Dalle : C1 R1, Black Pearl BP2 V2', 'Symptôme : Autre', 'Remplacée par : module',
        'Spares de Black Pearl BP2 V2 : 1 utilisé sur 8',
      ]);
      v.vrai('une information par ligne, sans ligne vide', t.every((l) => l && l === resumes.ligneSimple(l)), t);
      const invalide = terrain.etapesTerrain({ ...entreesTerrain('novastar'), nonValides: ['data'] }, donnees);
      const ti = terrain.resumeTerrain({ presta: 'Presta A', mur: 'Mur 1', resultat: invalide, coches: {}, pannes: [], spares: terrain.sparesUtilises([{ nom: 'Mur 1', pannes: [], liste: null }]), depannage }).split('\n');
      v.vrai('calcul non valide signalé', ti.includes('À faire : Processeur et logiciel (calcul non valide)'), ti);
      v.egal('sans panne, liste jamais calculée', ti.slice(-3), ['CARNET DE PANNES', 'Aucune panne notée.', 'Ouvre ce mur une fois pour compter ses spares.']);
    },
  },
  {
    id: 'R466',
    titre: 'Noms des fichiers de l\'écran Terrain (lot 27d, spec § 7) : « mur-led-terrain-<presta>-<mur>-<date>.txt » et « mur-led-carnet-<presta>-<date>.pdf », noms simplifiés comme ceux des prestas (accents, lettres liées, 40 caractères au plus, « sans-nom »)',
    etape: '27d',
    verifier(v) {
      const d = new Date(2026, 10, 5, 14, 0);
      v.egal('texte partagé', terrain.nomFichierTerrain('Presta Été', 'Mur Cœur', d), 'mur-led-terrain-presta-ete-mur-coeur-2026-11-05.txt');
      v.egal('noms vides', terrain.nomFichierTerrain('', '  ', d), 'mur-led-terrain-sans-nom-sans-nom-2026-11-05.txt');
      v.egal('noms longs : 40 caractères chacun', terrain.nomFichierTerrain('a'.repeat(60), 'b'.repeat(60), d), `mur-led-terrain-${'a'.repeat(40)}-${'b'.repeat(40)}-2026-11-05.txt`);
      v.egal('PDF du carnet', terrain.nomFichierCarnet('Presta Été', d), 'mur-led-carnet-presta-ete-2026-11-05.pdf');
      v.egal('… même simplification que la presta', terrain.nomFichierCarnet('Œuvre — Salle n°2', d),
        prestas.nomFichierPresta('Œuvre — Salle n°2', d).replace(/^mur-led-presta-/, 'mur-led-carnet-').replace(/\.json$/, '.pdf'));
    },
  },
  {
    id: 'R467',
    titre: 'PDF du carnet de pannes (lot 27d, spec § 7) : fiche « Carnet de pannes » de toute la presta (titre, rappel, presta, dates, lieu, date de la fiche ; un bloc par mur : chaque panne en sous-titre « Panne 1 : date » puis ses lignes libellé / valeur, puis les spares utilisés du mur ; mur sans panne : « Aucune panne notée. » ; spares de la presta quand elle a plusieurs murs et des pannes), mise en page par mettreEnPage et pdfFiche',
    etape: '27d',
    verifier(v, contexte) {
      const { depannage } = donneesTerrain(contexte);
      const { p1, p2, liste } = pannesEssai();
      const presta = { nom: 'Presta A', debut: '2026-11-04', fin: '2026-11-06', lieu: 'Lieu B' };
      const murs = [{ id: 'm-1', nom: 'Mur 1', pannes: [p1, p2], liste }, { id: 'm-2', nom: 'Mur 2', pannes: [], liste: null }];
      const f = terrain.ficheCarnet({ presta, murs, depannage, date: new Date(2026, 10, 6, 12) });
      v.egal('titre et rappel', [f.titre, f.rappel], ['Carnet de pannes', 'Pannes notées sur le terrain. Rien n\'est retiré du stock du parc.']);
      v.egal('en-tête', f.entete, [['Presta', 'Presta A'], ['Dates', 'du 04 au 06/11/2026'], ['Lieu', 'Lieu B'], ['Date de la fiche', '06/11/2026']]);
      v.egal('un bloc par mur', f.blocs.map((b) => [b.titre, b.murId, b.date, b.manque]), [['Mur 1', 'm-1', null, null], ['Mur 2', 'm-2', null, null]]);
      const enLignes = (p) => terrain.lignesPanne(p, depannage).map(([libelle, valeur]) => ({ libelle, valeur }));
      v.egal('mur 1 : pannes dans l\'ordre de saisie, puis ses spares', f.blocs[0].lignes, [
        { titre: `Panne 1 : ${terrain.texteQuand(p1.quand)}` }, ...enLignes(p1),
        { titre: `Panne 2 : ${terrain.texteQuand(p2.quand)}` }, ...enLignes(p2),
        { titre: 'Spares utilisés' }, { libelle: '', valeur: 'Spares de Black Pearl BP2 V2 : 1 utilisé sur 8' },
      ]);
      v.egal('mur 2 sans panne', f.blocs[1].lignes, [{ libelle: '', valeur: 'Aucune panne notée.' }]);
      v.egal('spares de la presta', f.fin, { titre: 'Spares utilisés sur la presta', lignes: [
        { libelle: '', valeur: 'Spares de Black Pearl BP2 V2 : 1 utilisé sur 8' }, { libelle: '', valeur: 'Mur 2 : ouvre ce mur une fois pour compter ses spares.' }] });
      const seul = terrain.ficheCarnet({ presta: { nom: 'Presta C' }, murs: [murs[0]], depannage, date: new Date(2026, 10, 6, 12) });
      v.egal('un seul mur : pas de total ; presta sans dates ni lieu', [seul.fin, seul.entete], [null, [['Presta', 'Presta C'], ['Date de la fiche', '06/11/2026']]]);
      const vide = terrain.ficheCarnet({ presta, murs: murs.map((m) => ({ ...m, pannes: [] })), depannage, date: new Date(2026, 10, 6, 12) });
      v.egal('aucune panne dans la presta', [vide.blocs.map((b) => b.lignes), vide.fin], [[[{ libelle: '', valeur: 'Aucune panne notée.' }], [{ libelle: '', valeur: 'Aucune panne notée.' }]], null]);
      const { pages } = pdf.mettreEnPage(f);
      const textes = pages.flat().map((x) => x.texte);
      v.vrai('PDF : pannes, lignes et mur sans panne', textes.includes(`Panne 1 : ${terrain.texteQuand(p1.quand)}`) && textes.includes('C3 R2, Black Pearl BP2 V2')
        && textes.includes('Aucune panne notée.') && textes.includes('Spares utilisés sur la presta'), textes);
      v.egal('pied', pages[0].at(-1).texte, `Carnet de pannes · Presta A · page 1 sur ${pages.length}`);
      const fichier = pdf.pdfFiche(f);
      v.vrai('fichier PDF', fichier.startsWith('%PDF-1.4\n') && fichier.endsWith('%%EOF\n') && fichier.includes('(Carnet de pannes)'));
    },
  },
  {
    id: 'R468',
    titre: 'Fiche du chef de projet, carnet de pannes (lot 27d, spec § 7) : après la synthèse de chaque mur, « Carnet de pannes » (nombre de pannes, une ligne par panne : dalle, fiche, symptôme, remplacement, lot ; spares utilisés), rien sans panne ; aussi pour un mur jamais ouvert, après « Ouvre ce mur une fois pour sa fiche. » ; texte copié et PDF ; les autres métiers ne changent pas',
    etape: '27d',
    verifier(v, contexte) {
      const { depannage } = donneesTerrain(contexte);
      const textes = textesEssai(contexte);
      const liste = listeEssai();
      const d = liste.sections.find((s) => s.id === 'dalles').lignes[0];
      const { p1, p2 } = pannesEssai();
      const q1 = { ...p1, ficheId: d.ficheId, fiche: d.designation };
      const q2 = { ...p2, ficheId: d.ficheId, fiche: d.designation };
      const fiche = { textes, calculeeLe: '2026-11-05T10:00:00.000Z' };
      const murs = [
        { id: 'm-1', nom: 'Mur 1', fiche, materiel: { liste }, pannes: [q1, q2] },
        { id: 'm-2', nom: 'Mur 2', fiche: null, materiel: null, pannes: [q2] },
        { id: 'm-3', nom: 'Mur 3', fiche, materiel: { liste }, pannes: [] },
      ];
      const sansPannes = murs.map((m) => ({ ...m, pannes: [] }));
      const date = new Date(2026, 10, 6, 12);
      const presta = { nom: 'Presta A', murs: [] };
      const f = fichesMetier.ficheMetier('chefProjet', { presta, murs, depannage, date });
      const avant = fichesMetier.ficheMetier('chefProjet', { presta, murs: sansPannes, depannage, date });
      const n = avant.blocs[0].lignes.length;
      v.egal('synthèse du mur inchangée', f.blocs[0].lignes.slice(0, n), avant.blocs[0].lignes);
      const spares = terrain.sparesUtilises([{ nom: 'Mur 1', pannes: [q1, q2], liste }]).lignes.map((l) => {
        const i = l.texte.indexOf(' : ');
        return { libelle: l.texte.slice(0, i), valeur: l.texte.slice(i + 3) };
      });
      v.egal('carnet après la synthèse', f.blocs[0].lignes.slice(n), [
        { titre: 'Carnet de pannes' }, { libelle: 'Pannes', valeur: '2' },
        { libelle: `Panne 1 : ${terrain.texteQuand(q1.quand)}`, valeur: `C3 R2, ${d.designation} ; Des dalles entières sont noires ; remplacée par dalle de spare ; lot A` },
        { libelle: `Panne 2 : ${terrain.texteQuand(q2.quand)}`, valeur: `C1 R1, ${d.designation} ; Autre ; remplacée par module` },
        ...spares,
      ]);
      v.vrai('… spares du mur repris', spares.length === 1 && spares[0].libelle === `Spares de ${d.designation}`, spares);
      v.egal('mur jamais ouvert : message, puis son carnet', [f.blocs[1].manque, f.blocs[1].lignes], [fichesMetier.MUR_JAMAIS_OUVERT, [
        { titre: 'Carnet de pannes' }, { libelle: 'Pannes', valeur: '1' },
        { libelle: `Panne 1 : ${terrain.texteQuand(q2.quand)}`, valeur: `C1 R1, ${d.designation} ; Autre ; remplacée par module` },
        { libelle: 'Note', valeur: 'Ouvre ce mur une fois pour compter ses spares.' }]]);
      v.egal('mur sans panne : rien', f.blocs[2].lignes, avant.blocs[2].lignes);
      v.egal('mur jamais ouvert sans panne : rien', avant.blocs[1].lignes, []);
      for (const metier of ['rigger', 'electricien', 'regie']) {
        v.egal(`fiche ${metier} inchangée`, fichesMetier.ficheMetier(metier, { presta, murs, depannage, date }), fichesMetier.ficheMetier(metier, { presta, murs: sansPannes, depannage, date }));
      }
      const t = fichesMetier.texteFiche(f).split('\n');
      const i2 = t.indexOf('MUR 2');
      v.egal('texte copié : mur jamais ouvert, puis son carnet', t.slice(i2, i2 + 4), ['MUR 2', fichesMetier.MUR_JAMAIS_OUVERT, 'CARNET DE PANNES', 'Pannes : 1']);
      v.vrai('texte copié : une ligne par panne', t.includes(`Panne 1 : ${terrain.texteQuand(q1.quand)} : C3 R2, ${d.designation} ; Des dalles entières sont noires ; remplacée par dalle de spare ; lot A`), t);
      const textesPdf = pdf.mettreEnPage(f).pages.flat();
      v.egal('PDF : un sous-titre « Carnet de pannes » par mur qui en a', textesPdf.filter((x) => x.role === 'sous-titre' && x.texte === 'Carnet de pannes').length, 2);
      v.vrai('PDF : message du mur jamais ouvert gardé', textesPdf.some((x) => x.texte === fichesMetier.MUR_JAMAIS_OUVERT));
    },
  },
  {
    id: 'R469',
    titre: 'Fichier de presta, mise en service et carnet exportés (lot 27d, spec § 7) : chaque mur porte `terrain` { etat, coches, ajouts, pannes } quand l\'un d\'eux est rempli, rien sinon (en-tête du mur d\'avant) ; suivis du montage et du pas à pas NovaLCT jamais exportés',
    etape: '27d',
    verifier(v) {
      const o = optionsPresta();
      const { etat, presta } = prestaEssai(o);
      const [m1, m2] = presta.murs.map((m) => m.id);
      const { p1 } = pannesEssai();
      const t = { etat: { faites: 2, total: 13, calculeLe: '2026-11-05T14:00:00.000Z' }, coches: { mire: 'sig-mire' }, ajouts: [{ id: 'e1', texte: 'Scotcher' }], pannes: [p1] };
      const e1 = prestas.enregistrerMur(etat, m1, { terrain: t, novalct: { cases: { a: 1 } } }, o);
      const { donnees } = prestas.exporterPresta(e1, presta.id, fiches.baseVide(), o);
      v.egal('mur 1 : terrain entier', donnees.murs[0].terrain, t);
      v.egal('mur 1 : clés', Object.keys(donnees.murs[0]), ['id', 'nom', 'parc', 'configuration', 'terrain']);
      v.egal('mur 2 sans terrain : clés d\'avant', Object.keys(donnees.murs[1]), ['id', 'nom', 'parc', 'configuration']);
      const cases = prestas.enregistrerMur(etat, m2, { terrain: { etat: null, coches: { mire: 'sig' }, ajouts: [] } }, o);
      v.egal('cases seules : exportées seules', prestas.exporterPresta(cases, presta.id, fiches.baseVide(), o).donnees.murs[1].terrain, { coches: { mire: 'sig' } });
      v.vrai('montage et NovaLCT jamais exportés', donnees.murs.every((m) => !('montage' in m) && !('novalct' in m)));
    },
  },
  {
    id: 'R470',
    titre: 'Fichier de presta, import de la mise en service et du carnet (lot 27d, spec § 7) : repris tels quels ; fichier d\'avant l\'étape 27 : vide ; une panne, une étape ajoutée, une case ou l\'état illisible fait refuser le fichier avec la raison (symptôme, remplacement, n° de série, 201 pannes, identifiant en double, texte d\'étape, 21 étapes, case inconnue) ; Dépannage non chargé : symptômes « S » et un nombre acceptés ; sur l\'autre appareil, les cases de même signature restent, les étapes de câblage repartent à zéro ; dupliquer ne recopie ni cases ni pannes',
    etape: '27d',
    verifier(v, contexte) {
      const donnees = donneesTerrain(contexte);
      const symptomes = terrain.symptomesPanne(donnees.depannage);
      const o = optionsPresta();
      const { etat, presta, base, depart } = prestaEssai(o, contexte);
      const [m1] = presta.murs.map((m) => m.id);
      const r0 = terrain.etapesTerrain({ ...entreesTerrain('novastar'), ajouts: [{ id: 'e1', texte: 'Scotcher' }] }, donnees);
      const sig = (id) => r0.etapes.find((e) => e.id === id).signature;
      const { p1, p2 } = pannesEssai();
      const t = { etat: { faites: 2, total: 13, calculeLe: '2026-11-05T14:00:00.000Z' }, coches: { mire: sig('mire'), config: sig('config'), 'ajout-e1': sig('ajout-e1') }, ajouts: [{ id: 'e1', texte: 'Scotcher' }], pannes: [p1, p2] };
      const e1 = prestas.enregistrerMur(etat, m1, { terrain: t, montage: { data: { branches: ['1', '2'] } } }, o);
      const fichier = prestas.exporterPresta(e1, presta.id, base, o).donnees;
      const nom = fichier.murs[0].nom;
      const neuf = prestas.migrer({}, o);
      const r = prestas.importerPresta(neuf, base, depart, JSON.stringify(fichier), {}, { ...o, symptomes });
      v.egal('importé sans erreur', r.erreurs, []);
      const recue = prestas.prestaOuverte(r.etat);
      v.egal('mise en service et carnet repris', prestas.terrainMur(r.etat, recue.murs[0].id), t);
      v.egal('mur sans terrain : rien', 'terrain' in r.etat.murs[recue.murs[1].id], false);
      v.egal('suivi du montage : à zéro', r.etat.murs[recue.murs[0].id].montage, null);
      const rapproche = terrain.rapprocherTerrain(r0, prestas.terrainMur(r.etat, recue.murs[0].id).coches);
      v.egal('autre appareil : cases de même signature gardées', [rapproche.retirees, Object.keys(rapproche.coches).sort()], [[], ['ajout-e1', 'config', 'mire']]);
      const ancien = { ...fichier, murs: fichier.murs.map(({ terrain: _t, ...m }) => m) };
      const ra = prestas.importerPresta(neuf, base, depart, JSON.stringify(ancien), {}, { ...o, symptomes });
      v.egal('fichier d\'avant l\'étape 27 : vide', [ra.erreurs, prestas.terrainMur(ra.etat, prestas.prestaOuverte(ra.etat).murs[0].id)], [[], { etat: null, coches: {}, ajouts: [] }]);
      const avecTerrain = (x) => ({ ...fichier, murs: [{ ...fichier.murs[0], terrain: x }, fichier.murs[1]] });
      const erreurs = (x, s = symptomes) => prestas.verifierImportPresta(JSON.stringify(avecTerrain(x)), neuf, base, depart, { symptomes: s }).erreurs;
      const panne = (champs) => ({ ...t, pannes: [{ ...p1, ...champs }] });
      v.egal('refus : symptôme inconnu', erreurs(panne({ symptome: 'S12' })), [`${nom} : panne 1 illisible (Symptôme : choisis-en un dans la liste.)`]);
      v.egal('refus : remplacement hors liste', erreurs(panne({ remplacePar: 'Cadre' })), [`${nom} : panne 1 illisible (Remplacée par : choisis dans la liste.)`]);
      v.egal('refus : n° de série trop long', erreurs(panne({ serieNouvelle: 'x'.repeat(31) })), [`${nom} : panne 1 illisible (N° de série : 30 caractères au plus.)`]);
      v.egal('refus : panne sans date', erreurs(panne({ quand: 'hier' })), [`${nom} : panne 1 illisible (Date de la panne illisible.)`]);
      v.egal('refus : identifiant en double', erreurs({ ...t, pannes: [p1, { ...p2, id: p1.id }] }), [`${nom} : panne 2 illisible (identifiant en double.)`]);
      v.egal('refus : 201 pannes', erreurs({ ...t, pannes: Array.from({ length: 201 }, (_, i) => ({ ...p1, id: `p${i}` })) }), [`${nom} : 200 pannes au plus par mur.`]);
      v.egal('200 pannes acceptées', erreurs({ ...t, pannes: Array.from({ length: 200 }, (_, i) => ({ ...p1, id: `p${i}` })) }), []);
      v.egal('refus : carnet illisible', erreurs({ ...t, pannes: 'deux' }), [`${nom} : carnet de pannes illisible.`]);
      v.egal('refus : étape ajoutée trop longue', erreurs({ ...t, ajouts: [{ id: 'e1', texte: 'x'.repeat(81) }] }), [`${nom} : étape ajoutée 1 illisible (Étape ajoutée : écris de 1 à 80 caractères.)`]);
      v.egal('refus : 21 étapes ajoutées', erreurs({ ...t, coches: {}, ajouts: Array.from({ length: 21 }, (_, i) => ({ id: `e${i}`, texte: 'Étape' })) }), [`${nom} : 20 étapes ajoutées au plus par mur.`]);
      v.egal('refus : case qui n\'est pas un texte', erreurs({ ...t, coches: { mire: 5 } }), [`${nom} : cases de la mise en service illisibles.`]);
      v.egal('refus : case d\'une étape inconnue', erreurs({ ...t, coches: { inconnue: 'x' } }), [`${nom} : cases de la mise en service illisibles.`]);
      v.egal('refus : case d\'une étape calculée', erreurs({ ...t, coches: { 'cablage-data': 'x' } }), [`${nom} : cases de la mise en service illisibles.`]);
      const proto = JSON.stringify(avecTerrain(t)).replace('"mire":', '"__proto__":');
      v.egal('refus : case « __proto__ »', prestas.verifierImportPresta(proto, neuf, base, depart, { symptomes }).erreurs, [`${nom} : cases de la mise en service illisibles.`]);
      v.egal('refus : état illisible', erreurs({ ...t, etat: { faites: 'deux', total: 13 } }), [`${nom} : état de la mise en service illisible.`]);
      v.egal('refus : mise en service illisible', erreurs('texte'), [`${nom} : mise en service illisible.`]);
      v.egal('refus : rien de changé sur l\'appareil', prestas.importerPresta(neuf, base, depart, JSON.stringify(avecTerrain(panne({ symptome: 'S12' }))), {}, { ...o, symptomes }).etat, neuf);
      v.egal('Dépannage non chargé : « S » et un nombre acceptés', [erreurs(t, null), erreurs(panne({ symptome: 'S12' }), null)], [[], []]);
      v.egal('… autre symptôme refusé', erreurs(panne({ symptome: 'X1' }), null), [`${nom} : panne 1 illisible (Symptôme : choisis-en un dans la liste.)`]);
      const d = prestas.dupliquerMur(r.etat, recue.id, recue.murs[0].id, o);
      v.egal('dupliquer un mur importé : étapes ajoutées seules', d.murs[d.index.ouverte.mur].terrain, { ajouts: [{ id: 'e1', texte: 'Scotcher' }] });
    },
  },
];
