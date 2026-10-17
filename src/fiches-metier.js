// Fiches presta par métier (étape 14b) : rigger, électricien, régie vidéo, chef
// de projet. Fonctions pures : elles trient les textes déjà copiés des onglets (gardés avec chaque mur, prestas.js) et la
// liste de matériel gardée, sans rien recalculer. Une fiche : titre, rappel, en-tête de la presta, un bloc par mur, et
// pour le chef de projet le total de matériel de la presta. Chaque ligne est { libelle, valeur }, ou { titre } pour un
// sous-titre.

import { libelleLigne, ErreurSaisie } from './calculs.js';
import { ligneSimple } from './resumes.js';
import { texteDates, organisationPresta, nomFichierPresta, HORAIRES, ACCES, CONTACTS } from './prestas.js';

export const METIERS = [
  { id: 'rigger', nom: 'Rigger', titre: 'Fiche rigger', rappel: 'Fiche indicative, à valider par le rigger.' },
  { id: 'electricien', nom: 'Électricien', titre: 'Fiche électricien', rappel: 'Fiche indicative, à valider par l\'électricien.' },
  { id: 'regie', nom: 'Régie', titre: 'Fiche régie vidéo', rappel: 'Fiche indicative, à valider par la régie.' },
  {
    id: 'chefProjet', nom: 'Chef de projet', titre: 'Fiche chef de projet',
    rappel: 'Fiche indicative : accroche à valider par le rigger, électricité par l\'électricien, vidéo par la régie.',
  },
];

export const MUR_JAMAIS_OUVERT = 'Ouvre ce mur une fois pour sa fiche.';
const NON_VALIDE = 'calcul non valide, corrige ce mur';
const ONGLETS = { mur: 'Mur', data: 'Data', canvas: 'Canvas', elec: 'Élec', poids: 'Poids' };
const EXPORTS = [
  { libelle: 'Pixel map', valeur: 'PNG à la taille exacte du mur ou du canvas de chaque processeur' },
  { libelle: 'Positions des dalles', valeur: 'CSV' },
  { libelle: 'Modèle 3D', valeur: 'OBJ' },
];

const deux = (n) => String(n).padStart(2, '0');
const jour = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;

// « Libellé : valeur » ; une ligne sans « : » garde son texte en valeur.
function enLigne(texte) {
  const i = texte.indexOf(' : ');
  return i < 0 ? { libelle: '', valeur: texte } : { libelle: texte.slice(0, i), valeur: texte.slice(i + 3) };
}
// Lignes d'un texte copié, sans son titre (première ligne : « POIDS : indicatif… », « DATA »…).
const lignesTexte = (texte) => String(texte).split('\n').slice(1).filter((l) => l.trim()).map(enLigne);

// Lignes de Data utiles à la régie : processeurs, réglages, processeur n° i (et sa sortie dans la pixel map, ses zones),
// mapping, découpage, réglage des zones ; ni capacités, ni ports du câblage (leur couleur), ni alertes.
const LIBELLES_DATA_REGIE = ['Processeur', 'Configuration', 'Réglages', 'Profondeur réseau', 'Mapping', 'Découpage', 'Variantes', 'Réglage des zones'];
export function lignesDataRegie(texteData) {
  return lignesTexte(texteData).filter((l) => LIBELLES_DATA_REGIE.includes(l.libelle)
    || (/^.+ n° \d+(,|$)/.test(l.libelle) && !/, couleur [^,]+$/.test(l.valeur)));
}

// Lignes d'une section de la liste de matériel : « quantité × désignation : détail », puis ses notes.
function lignesSection(liste, id) {
  const s = liste?.sections.find((x) => x.id === id);
  if (!s) return [];
  return [...s.lignes.map((l) => ({ libelle: `${l.quantite} × ${libelleLigne(l)}`, valeur: l.detail ?? '' })), ...s.notes.map((n) => ({ libelle: 'Note', valeur: n }))];
}

// Texte d'un onglet, ou « calcul non valide » quand l'onglet n'avait pas de calcul valide.
const texteOuManque = (textes, onglet, f) => (textes[onglet] ? f(textes[onglet]) : [{ libelle: ONGLETS[onglet], valeur: NON_VALIDE }]);
const materielOuManque = (materiel, titre, id) => (materiel?.liste
  ? [{ titre }, ...lignesSection(materiel.liste, id)]
  : [{ libelle: 'Matériel', valeur: 'ouvre ce mur une fois pour compter son matériel' }]);

// Alertes graves (chef de projet) : refus, impossibilités, et lignes de résultat dont l'état est « dépasse », « dépassé »
// ou « ne passe pas » (phase, maximum en accroche, liaison, charge, courant d'appel) ; les alertes, notes et rappels
// restent sur la fiche de leur métier. Une même ligne une fois.
const estGrave = (l) => ['Refus', 'Impossible'].includes(l.libelle)
  || (!['Alerte', 'Note', 'Rappel'].includes(l.libelle) && /(^|, )(dépasse|dépassé|ne passe pas)(?=$|[ ,(])/.test(l.valeur));

// Synthèse du chef de projet : quelques lignes de chaque onglet, les dalles et spares de la liste, les alertes graves.
const SYNTHESE = [
  ['mur', ['Dalle', 'Dalles', 'Demi-dalles', 'Zones', 'Taille', 'Taille réelle', 'Taille développée', 'Résolution', 'Pixel map']],
  ['dalles'],
  ['data', ['Processeur', 'Ports en colonnes entières', 'Ports avec la redondance']],
  ['elec', ['Puissance totale', 'Arrivée', 'Lignes en colonnes entières']],
  ['poids', ['Mode', 'Total suspendu', 'Total']],
];
function syntheseMur({ textes }, materiel) {
  const lignes = [];
  for (const [onglet, libelles] of SYNTHESE) {
    if (onglet === 'dalles') {
      const s = materiel?.liste?.sections.find((x) => x.id === 'dalles');
      for (const l of s?.lignes ?? []) lignes.push({ libelle: 'Dalles et spares', valeur: `${l.quantite} × ${libelleLigne(l)}, ${l.detail}` });
    } else {
      lignes.push(...texteOuManque(textes, onglet, (t) => lignesTexte(t).filter((l) => libelles.includes(l.libelle))));
    }
  }
  const vues = new Set();
  const graves = Object.keys(ONGLETS).flatMap((o) => (textes[o] ? lignesTexte(textes[o]) : [])).filter(estGrave).filter((l) => {
    const cle = `${l.libelle} : ${l.valeur}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  lignes.push(...(graves.length ? [{ titre: 'Alertes graves' }, ...graves] : [{ libelle: 'Alertes graves', valeur: 'aucune' }]));
  return lignes;
}

// Contenu d'un bloc de mur selon le métier.
function lignesMur(metier, fiche, materiel) {
  const { textes } = fiche;
  if (metier === 'rigger') return [...texteOuManque(textes, 'poids', lignesTexte), ...materielOuManque(materiel, 'Matériel d\'accroche', 'accroche')];
  if (metier === 'electricien') return [...texteOuManque(textes, 'elec', lignesTexte), ...materielOuManque(materiel, 'Matériel électrique', 'elec')];
  if (metier === 'regie') {
    return [...texteOuManque(textes, 'canvas', lignesTexte), { titre: 'Data' }, ...texteOuManque(textes, 'data', lignesDataRegie),
      { titre: 'Exports à demander dans le Schéma' }, ...EXPORTS];
  }
  return syntheseMur(fiche, materiel);
}

// En-tête : presta, dates, lieu, horaires et accès remplis, contacts du métier puis du chef de projet (tous pour le chef
// de projet), date de la fiche.
function entete(metier, presta, date) {
  const org = organisationPresta(presta);
  const contact = (c) => [org.contacts[c].nom, org.contacts[c].telephone].filter(Boolean).join(', ');
  const ordre = metier === 'chefProjet' ? CONTACTS.map(([c]) => c) : [metier, 'chefProjet'];
  const lignes = [
    ['Presta', presta.nom], ['Dates', texteDates(presta.debut, presta.fin)], ['Lieu', presta.lieu ?? ''],
    ...HORAIRES.map(([c, libelle]) => [libelle, org.horaires[c]]),
    ...ACCES.map(([c, libelle]) => [libelle, org.acces[c]]),
    ...ordre.map((c) => [CONTACTS.find(([x]) => x === c)[1], contact(c)]),
  ];
  return [...lignes.filter(([, valeur]) => valeur), ['Date de la fiche', jour(date)]];
}

// Fiche d'un métier pour toute la presta. `murs` : [{ id, nom, fiche (textes gardés) ou null, materiel (liste gardée) ou
// null }] dans l'ordre de la presta ; `total` : total de matériel de la presta (chef de projet).
export function ficheMetier(metier, { presta, murs = [], total = null, date = new Date() }) {
  const m = METIERS.find((x) => x.id === metier);
  if (!m) throw new ErreurSaisie(`Métier inconnu : ${metier}.`);
  const blocs = murs.map((mur) => (mur.fiche
    ? { titre: mur.nom, murId: mur.id ?? null, date: jour(new Date(mur.fiche.calculeeLe)), lignes: lignesMur(metier, mur.fiche, mur.materiel), manque: null }
    : { titre: mur.nom, murId: mur.id ?? null, date: null, lignes: [], manque: MUR_JAMAIS_OUVERT }));
  let fin = null;
  if (metier === 'chefProjet' && total) {
    const lignes = [];
    for (const s of total.sections) {
      if (!s.lignes.length && !s.notes.length) continue;
      lignes.push({ titre: s.titre }, ...s.lignes.map((l) => ({ libelle: `${l.quantite} × ${libelleLigne(l)}`, valeur: l.detail ?? '' })),
        ...s.notes.map((n) => ({ libelle: 'Note', valeur: n })));
    }
    lignes.push(...total.notes.map((n) => ({ libelle: 'Note', valeur: n })));
    fin = { titre: 'Matériel de la presta', lignes };
  }
  return { metier, titre: m.titre, rappel: m.rappel, entete: entete(metier, presta, date), blocs, fin };
}

// Texte copié ou partagé : une information par ligne, titres en capitales, sans tiret ni ligne vide.
export function texteFiche(fiche) {
  const ligne = (l) => (l.titre ? l.titre.toUpperCase() : [l.libelle, l.valeur].filter(Boolean).join(' : '));
  const lignes = [fiche.titre.toUpperCase(), fiche.rappel, ...fiche.entete.map(([libelle, valeur]) => `${libelle} : ${valeur}`)];
  for (const b of fiche.blocs) {
    lignes.push(b.titre.toUpperCase());
    if (b.manque) lignes.push(b.manque);
    else lignes.push(`Textes du : ${b.date}`, ...b.lignes.map(ligne));
  }
  if (fiche.fin) lignes.push(fiche.fin.titre.toUpperCase(), ...fiche.fin.lignes.map(ligne));
  return lignes.map(ligneSimple).filter(Boolean).join('\n');
}

// Fichier partagé : « mur-led-fiche-<métier>-<nom simplifié>-<AAAA-MM-JJ>.txt ».
const METIER_FICHIER = { rigger: 'rigger', electricien: 'electricien', regie: 'regie', chefProjet: 'chef-de-projet' };
export const nomFichierFiche = (nom, metier, maintenant = new Date()) => nomFichierPresta(nom, maintenant)
  .replace(/^mur-led-presta-/, `mur-led-fiche-${METIER_FICHIER[metier]}-`).replace(/\.json$/, '.txt');
