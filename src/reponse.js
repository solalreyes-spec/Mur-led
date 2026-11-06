// Réponse d'abord (étape 28) : carte « Résumé » de l'onglet Mur et ligne de titre des blocs « Réglages » de Data,
// Élec et Canvas. Fonctions pures : elles trient les textes copiés des onglets et les chiffres déjà affichés, sans rien
// recalculer, et lisent les textes bruts des formulaires (FormData), sans interface.

import { libelleLigne, portsDoubles } from './calculs.js';
import { SYNTHESE, estGrave, lignesTexte } from './fiches-metier.js';
import { ligneSimple } from './resumes.js';
import { texteProcesseurs } from './secours.js';
import { nombre, nombreCourt, lireNombre } from './format.js';

// ---------------------------------------------------------------------------------------------------------------
// Carte Résumé (spec § 5)

const ONGLETS = [
  { onglet: 'mur', titre: 'Mur' },
  { onglet: 'data', titre: 'Data' },
  { onglet: 'canvas', titre: 'Canvas' },
  { onglet: 'elec', titre: 'Élec', indicatif: true },
  { onglet: 'poids', titre: 'Poids', indicatif: true },
];
const NOMS = Object.fromEntries(ONGLETS.map((o) => [o.onglet, o.titre]));

// Libellés retenus par onglet : ceux de la synthèse du chef de projet ; Canvas, la source et la chaîne vers la régie.
const LIBELLES = {
  ...Object.fromEntries(SYNTHESE.filter(([, libelles]) => libelles)),
  canvas: ['Source', 'Liaison', 'Sortie du serveur', 'Régie', 'Sorties disponibles'],
};
// Plusieurs arrivées (constat 5) : « Arrivées » et « Arrivée 1 », « Arrivée 2 »… en plus, dans Élec seulement.
const enPlus = (onglet, libelle) => onglet === 'elec' && (libelle === 'Arrivées' || /^Arrivée \d+$/.test(libelle));

// Valeurs estimées, déduites, à confirmer ou non sourcées (CLAUDE.md, constat 11) : toujours signalées, mots entiers,
// hors notes et rappels.
const SIGNALEE = /(^|[^\p{L}])(estimée?s?|déduite?s?|à confirmer|non sourcée?s?)(?![\p{L}])/u;
const estSignalee = (l) => !['Note', 'Rappel'].includes(l.libelle) && SIGNALEE.test(l.valeur);

const pluriel = (n, singulier, forme) => `${nombre(n)} ${n > 1 ? forme : singulier}`;
const pourcent = (x) => `${nombre(x * 100, 1)} %`;
const nettoyer = (l) => ({ libelle: ligneSimple(l.libelle), valeur: ligneSimple(l.valeur) });

// Chiffre clé de Data : « Port le plus chargé : 85,8 % » ; d'Élec : « Ligne la plus chargée : 3280 W sur 3520 W (93,2 %) ».
function ligneChiffre(onglet, c) {
  if (!c) return null;
  const impose = c.impose ? ', Ma config' : '';
  if (onglet === 'data' && Number.isFinite(c.chargeMax)) return { libelle: 'Port le plus chargé', valeur: `${pourcent(c.chargeMax)}${impose}` };
  if (onglet === 'elec' && Number.isFinite(c.ligneMaxW) && c.departW > 0) {
    return { libelle: 'Ligne la plus chargée', valeur: `${nombreCourt(c.ligneMaxW, 1)} W sur ${nombreCourt(c.departW, 1)} W (${pourcent(c.ligneMaxW / c.departW)})${impose}` };
  }
  return null;
}

// Alertes graves des cinq textes (règle de la fiche du chef de projet), chacune avec son onglet, une même ligne une fois.
function alertesGraves(textes) {
  const vues = new Set();
  return ONGLETS.flatMap(({ onglet }) => (textes[onglet] ? lignesTexte(textes[onglet]).filter(estGrave).map((l) => ({ onglet, ...nettoyer(l) })) : []))
    .filter((l) => {
      const cle = `${l.libelle} : ${l.valeur}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
}

// `textes` : textes copiés des cinq onglets (null sans calcul valide) ; `chiffres` : { data, elec } (chiffres clés de
// leur écran, ou null) ; `materiel` : liste de matériel du mur (listeMateriel) ou null ; `terrain` : { etat, pannes }.
export function resumeDuMur({ textes = {}, chiffres = null, materiel = null, terrain = null }) {
  if (!textes.mur) return { valide: false, titre: [], sections: [], graves: [] };
  const sections = ONGLETS.map(({ onglet, titre, indicatif = false }) => {
    const texte = textes[onglet];
    if (!texte) return { onglet, titre, indicatif, valide: false, entete: null, lignes: [] };
    const lignes = lignesTexte(texte).filter((l) => LIBELLES[onglet].includes(l.libelle) || enPlus(onglet, l.libelle) || estSignalee(l)).map(nettoyer);
    const chiffre = ligneChiffre(onglet, chiffres?.[onglet]);
    if (chiffre) lignes.push(nettoyer(chiffre));
    return { onglet, titre, indicatif, valide: true, entete: ligneSimple(texte.split('\n')[0]), lignes };
  });
  // Dalles et spares : section « dalles » de la liste, comme la synthèse du chef de projet.
  const dalles = (materiel?.sections.find((s) => s.id === 'dalles')?.lignes ?? [])
    .map((l) => nettoyer({ libelle: 'Dalles et spares', valeur: `${l.quantite} × ${libelleLigne(l)}${l.detail ? `, ${l.detail}` : ''}` }));
  if (dalles.length) sections.push({ onglet: 'materiel', titre: 'Matériel', indicatif: false, valide: true, entete: 'MATÉRIEL', lignes: dalles });
  // Terrain : état gardé à la dernière ouverture de l'écran Terrain, pannes du carnet.
  const etat = terrain?.etat;
  const pannes = terrain?.pannes?.length ?? 0;
  const lignesTerrain = [
    etat && Number.isFinite(etat.faites) && Number.isFinite(etat.total) ? { libelle: 'Mise en service', valeur: `${nombre(etat.faites)} sur ${nombre(etat.total)}` } : null,
    pannes ? { libelle: 'Pannes', valeur: nombre(pannes) } : null,
  ].filter(Boolean);
  if (lignesTerrain.length) sections.push({ onglet: 'terrain', titre: 'Terrain', indicatif: false, valide: true, entete: 'TERRAIN', lignes: lignesTerrain });

  const graves = alertesGraves(textes);
  // Ligne de titre : chiffres clés des onglets au calcul valide seulement.
  const d = textes.data ? chiffres?.data : null;
  const e = textes.elec ? chiffres?.elec : null;
  const poids = textes.poids ? lignesTexte(textes.poids).find((l) => l.libelle === 'Total suspendu' || l.libelle === 'Total') : null;
  const titre = [
    d?.processeurs ? { texte: ligneSimple(d.processeurs) } : null,
    Number.isFinite(d?.ports) ? { texte: `${pluriel(d.ports, 'port', 'ports')}${Number.isFinite(d.portsRedondance) ? `, ${nombre(d.portsRedondance)} avec la redondance` : ''}` } : null,
    Number.isFinite(e?.lignes) ? { texte: pluriel(e.lignes, 'ligne', 'lignes') } : null,
    poids ? { texte: ligneSimple(poids.valeur) } : null,
    graves.length ? { texte: pluriel(graves.length, 'alerte grave', 'alertes graves'), grave: true } : null,
  ].filter(Boolean);
  return { valide: true, titre, sections, graves };
}

// Chiffres clés affichés par Data et Élec (spec § 8, lot 28b), pour le résumé : les mêmes expressions que leurs écrans,
// jamais un autre calcul. `impose` : { variante, resume } de la config imposée quand elle passe (Ma config), sinon null.
// Data : processeurs (« 2 × MCTRL4K + 2 de secours »), ports retenus (colonnes entières, ou imposés), ports avec la
// redondance dans le même processeur (le texte copié « Ports avec la redondance » ; absent avec Ma config, dont le nombre
// de ports est celui saisi), charge du port le plus chargé ; null sans calcul ou processeur qui ne convient pas.
export function chiffresData(r, impose = null) {
  if (!r?.processeur || r.impossible) return null;
  const g = r.global;
  return {
    processeurs: texteProcesseurs(r),
    ports: g ? (impose ? impose.variante.ports : g.colonnes.ports) : null,
    portsRedondance: g && !impose && portsDoubles(r) ? g.redondance.colonnes : null,
    chargeMax: g ? (impose ? impose.variante.chargeMax : g.chargeMax.colonnes.taux) : null,
    impose: Boolean(impose),
  };
}
// Élec : lignes retenues (colonnes entières, phases équilibrées en tri, ou imposées), puissance de la ligne la plus
// chargée et puissance de son départ (U × I) ; null sans calcul.
export function chiffresElec(r, impose = null) {
  if (!r) return null;
  const lignesRetenues = impose ? impose.variante.lignesDetail : (r.triphase?.colonnes.equilibre ?? r.lignes.colonnes).lignes;
  return {
    lignes: impose ? impose.variante.lignes : r.lignes.retenues,
    ligneMaxW: Math.max(...lignesRetenues.map((l) => l.puissanceW)),
    departW: r.ligne.theoriqueW,
    impose: Boolean(impose),
  };
}

// Texte de « Copier le résumé » (spec § 5.4) : une information par ligne, « Libellé : valeur », titres en capitales
// (ceux des textes copiés des onglets), alertes graves suivies de leur onglet.
export function texteResume(resume, { presta = null, mur = null } = {}) {
  const lignes = ['RÉSUMÉ', presta?.nom ? `Presta : ${presta.nom}` : null, mur?.nom ? `Mur : ${mur.nom}` : null];
  if (!resume.valide) {
    lignes.push('Mur non valide');
  } else {
    for (const s of resume.sections) {
      if (!s.valide) {
        lignes.push(`${s.titre} : calcul non valide`);
        continue;
      }
      lignes.push(s.entete, ...s.lignes.map((l) => (l.libelle ? `${l.libelle} : ${l.valeur}` : l.valeur)));
    }
    if (resume.graves.length) lignes.push('ALERTES GRAVES', ...resume.graves.map((g) => `${g.libelle} : ${g.valeur} (${NOMS[g.onglet]})`));
    else lignes.push('Alertes graves : aucune');
  }
  return lignes.filter(Boolean).map(ligneSimple).filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Blocs « Réglages » (spec § 6) : à partir des textes bruts des champs (`bruts` : { nom: texte }, case cochée « on »),
// des noms des champs visibles (`visibles` : liste ou ensemble, null quand tous le sont).

const visible = (visibles, nom) => !visibles || (visibles instanceof Set ? visibles.has(nom) : visibles.includes(nom));
const rempli = (x) => x !== undefined && x !== null && String(x).trim() !== '';
const coche = (bruts, nom, visibles) => visible(visibles, nom) && rempli(bruts[nom]);

// Contrôles d'une saisie (vrai quand elle se lit) ; un champ absent du formulaire n'est pas contrôlé.
const positif = (t) => lireNombre(t) > 0;
const videOuPositif = (t) => !rempli(t) || lireNombre(t) > 0;
const videOuNonNegatif = (t) => !rempli(t) || lireNombre(t) >= 0;
const videOuEntierNonNegatif = (t) => !rempli(t) || (Number.isInteger(lireNombre(t)) && lireNombre(t) >= 0);
const entierPositif = (t) => Number.isInteger(lireNombre(t)) && lireNombre(t) >= 1;
// Latence en images, comme la lit Canvas : vide, « 3 », « 3-5 » ou « 3 à 5 ».
const LATENCE = /^(\d+)(?:\s*(?:-|à)\s*(\d+))?$/;
const latenceLisible = (t) => !rempli(t) || LATENCE.test(String(t).trim());

const CONTROLES_DATA = [
  ['frequence', positif, 'fréquence'],
  ['reseauSwitches', videOuEntierNonNegatif, 'switches'],
  ['reseauConvertisseurs', videOuEntierNonNegatif, 'convertisseurs fibre'],
  ['cuivreLongueurM', videOuNonNegatif, 'longueur du cuivre'],
];
const CONTROLES_ELEC = [
  ['departA', positif, 'départs'],
  ['tensionV', positif, 'tension'],
  ['puissanceUtileW', videOuPositif, 'puissance utile'],
];
const CONTROLES_CANVAS = [
  ['frequenceHz', positif, 'fréquence'],
  ['longueurM', videOuNonNegatif, 'longueur'],
  ['latenceSource', latenceLisible, 'latence'],
  ['couchesParSortie', entierPositif, 'couches par sortie'],
  ...[1, 2, 3].flatMap((i) => [[`conv${i}Longueur`, videOuNonNegatif, `longueur du convertisseur ${i}`], [`conv${i}Latence`, latenceLisible, `latence du convertisseur ${i}`]]),
];

function invalides(controles, bruts, visibles) {
  return controles.filter(([nom, lisible]) => bruts[nom] !== undefined && visible(visibles, nom) && !lisible(bruts[nom])).map(([nom]) => nom);
}
export const champsInvalidesData = (bruts, { visibles = null } = {}) => invalides(CONTROLES_DATA, bruts, visibles);
export const champsInvalidesElec = (bruts, { visibles = null } = {}) => invalides(CONTROLES_ELEC, bruts, visibles);
export const champsInvalidesCanvas = (bruts, { visibles = null } = {}) => invalides(CONTROLES_CANVAS, bruts, visibles);

// Morceau d'un champ contrôlé : son texte quand la saisie se lit, « <nom> illisible » en alerte sinon ; null quand le
// champ est caché, absent, ou que `texte` n'a rien à dire (valeur par défaut).
function morceau(controles, bruts, visibles, nom, texte) {
  if (bruts[nom] === undefined || !visible(visibles, nom)) return null;
  const [, lisible, libelle] = controles.find((c) => c[0] === nom);
  if (!lisible(bruts[nom])) return { texte: `${libelle} illisible`, alerte: true };
  const t = texte(bruts[nom]);
  return t ? { texte: t } : null;
}
// Nom court d'une option : son texte jusqu'à la première parenthèse ou virgule (« XD-T (10 ports…) » : « XD-T »).
const court = (libelle) => String(libelle).split(' (')[0].split(', ')[0].trim();
const nomDe = (liste, id) => (liste ?? []).find((x) => x.id === id)?.nom ?? id;
const fini = (morceaux) => morceaux.filter(Boolean).map((m) => (typeof m === 'string' ? { texte: m } : m));

// Data : « 60 Hz · 12 bits · sans redondance », puis les réglages qui diffèrent du défaut ou cochés. `libelles` :
// textes des options choisies (distributeur, switch Megapixel, carte de sortie).
export function ligneReglagesData(bruts, { visibles = null, libelles = {} } = {}) {
  const m = (nom, texte) => morceau(CONTROLES_DATA, bruts, visibles, nom, texte);
  const choix = (nom, defaut, prefixe = '') => (visible(visibles, nom) && rempli(bruts[nom]) && bruts[nom] !== defaut ? `${prefixe}${court(libelles[nom] ?? bruts[nom])}` : null);
  const redondance = rempli(bruts.redondance);
  const secours = redondance && visible(visibles, 'secours') && bruts.secours === 'processeur';
  const cuivre = coche(bruts, 'cuivreCategorie', visibles);
  // « cuivre Cat6A 30 m » ; une longueur illisible fait son propre morceau, en alerte.
  const longueur = cuivre ? m('cuivreLongueurM', (t) => (rempli(t) ? `${nombreCourt(lireNombre(t), 1)} m` : null)) : null;
  return fini([
    m('frequence', (t) => `${nombreCourt(lireNombre(t))} Hz`),
    rempli(bruts.bits) ? `${bruts.bits} bits` : null,
    secours ? 'secours par un second processeur' : redondance ? 'redondance' : 'sans redondance',
    secours && visible(visibles, 'liaisonSecours') && bruts.liaisonSecours === 'cascade' ? 'cascade' : null,
    coche(bruts, 'luminosite', visibles) && lireNombre(bruts.luminosite) > 0 ? `${nombre(lireNombre(bruts.luminosite))} cd/m²` : null,
    coche(bruts, 'ull', visibles) ? 'ULL' : null,
    choix('distributeur', 'brompton-xd'),
    m('reseauSwitches', (t) => (lireNombre(t) > 0 ? pluriel(lireNombre(t), 'switch', 'switches') : null)),
    m('reseauConvertisseurs', (t) => (lireNombre(t) > 0 ? pluriel(lireNombre(t), 'convertisseur fibre', 'convertisseurs fibre') : null)),
    coche(bruts, 'reseauManageable', visibles) ? 'switch manageable' : null,
    coche(bruts, 'reseau10G', visibles) ? '10G' : null,
    coche(bruts, 'fibreMode', visibles) ? `fibre ${bruts.fibreMode}${coche(bruts, 'fibreConnecteur', visibles) ? ` ${bruts.fibreConnecteur}` : ''}` : null,
    cuivre ? `cuivre ${bruts.cuivreCategorie}${longueur && !longueur.alerte ? ` ${longueur.texte}` : ''}` : null,
    longueur?.alerte ? longueur : null,
    choix('switchMegapixel', 'netgear-m4250-msm4214x'),
    coche(bruts, 'lien25G', visibles) ? '2,5G' : null,
    coche(bruts, 'mode20G', visibles) ? 'mode 20G' : null,
    coche(bruts, 'cartesPro', visibles) ? 'cartes Pro' : null,
    coche(bruts, 'modeOptique', visibles) ? 'mode 40 ports' : null,
    choix('carteSortie', 'auto', 'carte '),
  ]);
}

// Élec : « départs 16 A · 220 V · marge 80 % », puis la puissance utile et la courbe saisies.
export function ligneReglagesElec(bruts, { visibles = null } = {}) {
  const m = (nom, texte) => morceau(CONTROLES_ELEC, bruts, visibles, nom, texte);
  return fini([
    m('departA', (t) => `départs ${nombreCourt(lireNombre(t))} A`),
    m('tensionV', (t) => `${nombreCourt(lireNombre(t))} V`),
    rempli(bruts.marge) && Number.isFinite(Number(bruts.marge)) ? `marge ${nombreCourt(Number(bruts.marge) * 100)} %` : null,
    m('puissanceUtileW', (t) => (rempli(t) ? `puissance utile ${nombre(lireNombre(t))} W` : null)),
    coche(bruts, 'courbe', visibles) ? `courbe ${bruts.courbe}` : null,
  ]);
}

// Canvas : « 60 Hz · 8 bits · HDMI 2.0 · RGB Full », puis la source de la base, la longueur, la latence, la régie et
// les convertisseurs. `liaisons`, `regies`, `sources` : listes { id, nom } des choix.
export function ligneReglagesCanvas(bruts, { visibles = null, liaisons = [], regies = [], sources = [] } = {}) {
  const m = (nom, texte) => morceau(CONTROLES_CANVAS, bruts, visibles, nom, texte);
  const latence = (t) => {
    const x = String(t).trim().match(LATENCE);
    return x[2] && x[2] !== x[1] ? `${x[1]} à ${x[2]} images` : `${x[1]} ${Number(x[1]) > 1 ? 'images' : 'image'}`;
  };
  const nb = Number(bruts.nbConvertisseurs) || 0;
  return fini([
    m('frequenceHz', (t) => `${nombreCourt(lireNombre(t))} Hz`),
    rempli(bruts.bits) ? `${bruts.bits} bits` : null,
    coche(bruts, 'liaison', visibles) ? nomDe(liaisons, bruts.liaison) : null,
    [bruts.espace, bruts.plage].filter(rempli).join(' ') || null,
    coche(bruts, 'sourceAppareil', visibles) ? nomDe(sources, bruts.sourceAppareil) : null,
    m('longueurM', (t) => (rempli(t) ? `${nombreCourt(lireNombre(t), 1)} m` : null)),
    m('latenceSource', (t) => (rempli(t) ? `latence ${latence(t)}` : null)),
    coche(bruts, 'regie', visibles) ? nomDe(regies, bruts.regie) : null,
    m('couchesParSortie', () => null),
    visible(visibles, 'nbConvertisseurs') && nb > 0 ? pluriel(nb, 'convertisseur', 'convertisseurs') : null,
    ...[1, 2, 3].flatMap((i) => [m(`conv${i}Longueur`, () => null), m(`conv${i}Latence`, () => null)]),
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// États de repli (spec § 4) : préférences de l'appareil, « ouvert » ou « ferme » ; pour les Réglages, un état par
// onglet { data, elec, canvas }. Le stockage (localStorage) est reçu en paramètre ; une erreur rend le défaut.

const ETATS = ['ouvert', 'ferme'];
export function lireRepli(stockage, cle, defaut) {
  let brut = null;
  try {
    brut = stockage?.getItem(cle) ?? null;
  } catch {
    brut = null;
  }
  if (typeof defaut === 'string') return ETATS.includes(brut) ? brut : defaut;
  let lu = null;
  try {
    lu = brut === null ? null : JSON.parse(brut);
  } catch {
    lu = null;
  }
  return Object.fromEntries(Object.entries(defaut).map(([k, d]) => [k, lu && typeof lu === 'object' && ETATS.includes(lu[k]) ? lu[k] : d]));
}
export function garderRepli(stockage, cle, valeur) {
  try {
    if (!stockage) return false;
    stockage.setItem(cle, typeof valeur === 'string' ? valeur : JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}
