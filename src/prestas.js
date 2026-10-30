// Prestas nommées (étape 10b) : plusieurs prestas sur l'appareil, plusieurs murs par presta, export et import d'une
// presta. Fonctions pures, sans accès à l'écran ni au stockage : l'écran et le stockage les appellent. L'heure
// (`maintenant`) et le tirage des identifiants (`alea`) peuvent être donnés par l'appelant (tests reproductibles).
//
// État : { index, murs }
//   index : { version, ouverte: { presta, mur }, prestas: [{ id, nom, debut, fin, lieu, notes, organisation, creeeLe,
//             modifieeLe, exporteeLe, archivee, murs: [{ id, nom }] }] }
//   `organisation` (étape 14a) : horaires, accès et contacts, facultative, absente quand tout est vide
//   (`organisationPresta` la lit toujours entière) ; exportée et importée avec la presta.
//   murs : { [id du mur]: { version, parc, configuration, montage, materiel } }, une clé de stockage par mur ;
//   `materiel` (étape 13b) : { liste, calculeeLe }, la liste de matériel du mur, jamais exportée ; `fiche` (étape 14b) :
//   { textes, calculeeLe }, les textes des onglets pour les fiches par métier, jamais exportés. `novalct` (étape 17b) :
//   { version, cases, avis }, le suivi du pas à pas NovaLCT, jamais exporté. Presta : `materiel`
//   { sparesPourcent, coches { [clé]: quantité cochée }, ajouts [{ id, libelle, quantite }] } facultatif (13c), jamais
//   exporté.
// `configuration` a la forme des saisies gardées (configuration.js) ; null : réglages par défaut.

import { ErreurSaisie, libelleLigne } from './calculs.js';
import { enregistrerFiche, fusionner, baseVide, nettoyerFiche, validerImport, fichiersJoints, tailleFichiersJoints } from './fiches.js';

export const VERSION_PRESTAS = 1;
export const FORMAT_PRESTA = 'appli-mur-led/presta';
// Formulaires dont les saisies sont gardées avec chaque mur (ceux de configuration.js).
// Distribution d'Élec (distance de l'arrivée 1 et son matériel) : oubliée jusqu'au lot 21b, perdue à l'import d'une presta.
export const FORMULAIRES_SAISIES = ['form-mur', 'form-data', 'form-source', 'form-elec', 'form-distribution', 'form-poids', 'form-schema', 'form-mire'];
export const LIMITES = { nomPresta: 60, nomMur: 40, lieu: 80, notes: 2000, horaire: 80, acces: 80, nomContact: 60, telephone: 30 };
const SANS_NOM = 'Presta sans nom';

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

function aleaParDefaut() {
  const octets = new Uint8Array(6);
  crypto.getRandomValues(octets);
  return [...octets].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const options = ({ maintenant = new Date(), alea = aleaParDefaut } = {}) => ({ maintenant, alea, iso: maintenant.toISOString() });

// Identifiant tiré au hasard, jamais dérivé du nom : « p-… » pour une presta, « m-… » pour un mur.
function nouvelId(prefixe, alea, pris) {
  for (;;) {
    const id = `${prefixe}-${alea()}`;
    if (!pris.has(id)) {
      pris.add(id);
      return id;
    }
  }
}
const idsPris = (etat) => new Set([...etat.index.prestas.map((p) => p.id), ...Object.keys(etat.murs)]);

const deux = (n) => String(n).padStart(2, '0');
const jourTexte = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
const jourIso = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
const texteJour = (iso) => iso.split('-').reverse().join('/');
const copie = (x) => (x === undefined || x === null ? null : JSON.parse(JSON.stringify(x)));
// JSON aux clés triées : deux fiches ou deux parcs identiques quel que soit l'ordre de leurs champs.
const stable = (x) => JSON.stringify(x, (cle, val) => (val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  : val));

// Nom suivi d'un suffixe (« (copie) »), coupé pour tenir dans la limite.
function avecSuffixe(nom, suffixe, max) {
  return `${nom}${suffixe}`.length <= max ? `${nom}${suffixe}` : `${nom.slice(0, max - suffixe.length).trimEnd()}${suffixe}`;
}

function trouverPresta(etat, id) {
  const p = etat.index.prestas.find((x) => x.id === id);
  if (!p) throw new ErreurSaisie('Presta introuvable.');
  return p;
}
const avecPresta = (etat, id, f) => ({ ...etat, index: { ...etat.index, prestas: etat.index.prestas.map((p) => (p.id === id ? f(p) : p)) } });
const murVide = (parc = null) => ({ version: VERSION_PRESTAS, parc, configuration: null, montage: null });
const prestaVide = (id, nom, murId, iso) => ({
  id, nom, debut: null, fin: null, lieu: '', notes: '', creeeLe: iso, modifieeLe: iso, exporteeLe: null, archivee: false,
  murs: [{ id: murId, nom: 'Mur 1' }],
});

// ---------------------------------------------------------------------------
// Vérification des saisies
// ---------------------------------------------------------------------------

function dateValide(x) {
  if (x === null || x === undefined || x === '') return null;
  const ok = typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))
    && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x;
  if (!ok) throw new ErreurSaisie(`Date illisible : ${x}.`);
  return x;
}

// Horaires, accès et contacts (étape 14a) : champs, libellés et longueur maxi ; tout facultatif, en texte libre.
export const HORAIRES = [['montage', 'Montage', 'du montage'], ['show', 'Show', 'du show'], ['demontage', 'Démontage', 'du démontage']];
export const ACCES = [['quai', 'Quai', 'Quai trop long'], ['ascenseur', 'Ascenseur', 'Ascenseur trop long'], ['chargeMaxi', 'Charge maxi', 'Charge maxi trop longue']];
export const CONTACTS = [['chefProjet', 'Chef de projet', 'chef de projet'], ['regie', 'Régie', 'régie'], ['electricien', 'Électricien', 'électricien'], ['rigger', 'Rigger', 'rigger']];

export function organisationVide() {
  return {
    horaires: Object.fromEntries(HORAIRES.map(([c]) => [c, ''])),
    acces: Object.fromEntries(ACCES.map(([c]) => [c, ''])),
    contacts: Object.fromEntries(CONTACTS.map(([c]) => [c, { nom: '', telephone: '' }])),
  };
}
const valeursOrganisation = (org) => [...Object.values(org.horaires), ...Object.values(org.acces), ...Object.values(org.contacts).flatMap((c) => [c.nom, c.telephone])];
const organisationRemplie = (org) => valeursOrganisation(org).some(Boolean);

// Organisation lue dans une saisie ou un fichier : groupes et champs connus seulement, texte, espaces de bord retirés.
function organisationValide(org) {
  const illisible = () => new ErreurSaisie('Horaires, accès et contacts illisibles.');
  const objet = (x) => x === undefined || x === null || (typeof x === 'object' && !Array.isArray(x));
  const texte = (x, max, message) => {
    if (x === undefined || x === null) return '';
    if (typeof x !== 'string') throw illisible();
    const t = x.trim();
    if (t.length > max) throw new ErreurSaisie(`${message} : ${max} caractères au plus.`);
    return t;
  };
  if (!objet(org) || !objet(org?.horaires) || !objet(org?.acces) || !objet(org?.contacts)) throw illisible();
  const { horaires = {}, acces = {}, contacts = {} } = org ?? {};
  return {
    horaires: Object.fromEntries(HORAIRES.map(([c, , de]) => [c, texte(horaires?.[c], LIMITES.horaire, `Horaire ${de} trop long`)])),
    acces: Object.fromEntries(ACCES.map(([c, , message]) => [c, texte(acces?.[c], LIMITES.acces, message)])),
    contacts: Object.fromEntries(CONTACTS.map(([c, , nom]) => {
      if (!objet(contacts?.[c])) throw illisible();
      return [c, {
        nom: texte(contacts?.[c]?.nom, LIMITES.nomContact, `Nom du contact ${nom} trop long`),
        telephone: texte(contacts?.[c]?.telephone, LIMITES.telephone, `Téléphone du contact ${nom} trop long`),
      }];
    })),
  };
}

// Organisation d'une presta, toujours entière (vide pour une presta d'avant l'étape 14).
export function organisationPresta(presta) {
  try {
    return organisationValide(presta?.organisation ?? null);
  } catch (erreur) {
    return organisationVide();
  }
}

// Infos d'une presta : nom obligatoire, dates AAAA-MM-JJ (fin jamais avant le début), lieu et notes libres ;
// organisation facultative (non donnée : `organisation` absent du résultat, celle de la presta reste).
function infosValides({ nom, debut, fin, lieu, notes, organisation } = {}) {
  const n = String(nom ?? '').trim();
  if (!n) throw new ErreurSaisie('Donne un nom à la presta.');
  if (n.length > LIMITES.nomPresta) throw new ErreurSaisie(`Nom de presta trop long : ${LIMITES.nomPresta} caractères au plus.`);
  const d = dateValide(debut);
  const f = dateValide(fin);
  if (f && !d) throw new ErreurSaisie('Date de fin sans date de début.');
  if (f && f < d) throw new ErreurSaisie(`La fin (${texteJour(f)}) est avant le début (${texteJour(d)}).`);
  const l = String(lieu ?? '').trim();
  if (l.length > LIMITES.lieu) throw new ErreurSaisie(`Lieu trop long : ${LIMITES.lieu} caractères au plus.`);
  const no = String(notes ?? '').trim();
  if (no.length > LIMITES.notes) throw new ErreurSaisie('Notes trop longues : 2 000 caractères au plus.');
  const infos = { nom: n, debut: d, fin: f, lieu: l, notes: no };
  if (organisation !== undefined && organisation !== null) infos.organisation = organisationValide(organisation);
  return infos;
}

// Infos enregistrées sur la presta : une organisation vide n'est pas écrite.
function avecInfos(p, infos) {
  const { organisation, ...reste } = infos;
  const suite = { ...p, ...reste };
  if (organisation === undefined) return suite;
  delete suite.organisation;
  return organisationRemplie(organisation) ? { ...suite, organisation } : suite;
}

// Nom de mur : obligatoire, unique dans sa presta (le mur `murId` peut garder le sien).
function nomMurValide(presta, nom, murId = null) {
  const n = String(nom ?? '').trim();
  if (!n) throw new ErreurSaisie('Donne un nom au mur.');
  if (n.length > LIMITES.nomMur) throw new ErreurSaisie(`Nom de mur trop long : ${LIMITES.nomMur} caractères au plus.`);
  if (presta.murs.some((m) => m.id !== murId && m.nom === n)) throw new ErreurSaisie(`Un autre mur de cette presta s'appelle déjà ${n}.`);
  return n;
}

// « Mur n » : le premier numéro libre de la presta.
export function nomMurLibre(presta) {
  for (let n = 1; ; n += 1) if (!presta.murs.some((m) => m.nom === `Mur ${n}`)) return `Mur ${n}`;
}

// ---------------------------------------------------------------------------
// Migration et lecture
// ---------------------------------------------------------------------------

// Premier lancement : la configuration en cours (saisies, parc actif, suivi du montage) devient « Presta sans nom »,
// avec « Mur 1 » ; un appareil neuf a un « Mur 1 » aux réglages par défaut.
export function migrer({ configuration = null, parcActif = null, montage = null } = {}, opts) {
  const o = options(opts);
  const pris = new Set();
  const pid = nouvelId('p', o.alea, pris);
  const mid = nouvelId('m', o.alea, pris);
  return {
    index: { version: VERSION_PRESTAS, ouverte: { presta: pid, mur: mid }, prestas: [prestaVide(pid, SANS_NOM, mid, o.iso)] },
    murs: { [mid]: { version: VERSION_PRESTAS, parc: parcActif ?? null, configuration: copie(configuration), montage: copie(montage) } },
  };
}

export function prestaOuverte(etat) {
  return etat.index.prestas.find((p) => p.id === etat.index.ouverte?.presta) ?? null;
}

// Mur ouvert : son nom et ses données ({ id, nom, version, parc, configuration, montage }).
export function murOuvert(etat) {
  const p = prestaOuverte(etat);
  const m = p?.murs.find((x) => x.id === etat.index.ouverte.mur);
  return m && etat.murs[m.id] ? { id: m.id, nom: m.nom, ...etat.murs[m.id] } : null;
}

export function ouvrir(etat, prestaId, murId = null) {
  const p = trouverPresta(etat, prestaId);
  const mur = murId ?? p.murs[0].id;
  if (!p.murs.some((m) => m.id === mur)) throw new ErreurSaisie('Mur introuvable.');
  return { ...etat, index: { ...etat.index, ouverte: { presta: prestaId, mur } } };
}

// Liste : la dernière modifiée en tête, les archivées à part.
export function listePrestas(etat) {
  const tri = (a, b) => (b.modifieeLe ?? '').localeCompare(a.modifieeLe ?? '') || a.nom.localeCompare(b.nom, 'fr');
  return {
    actives: etat.index.prestas.filter((p) => !p.archivee).sort(tri),
    archivees: etat.index.prestas.filter((p) => p.archivee).sort(tri),
  };
}

// « 17/10/2026 », « du 17 au 19/10/2026 », « du 30/10 au 02/11/2026 », « du 30/12/2026 au 02/01/2027 ».
export function texteDates(debut, fin) {
  if (!debut) return '';
  if (!fin || fin === debut) return texteJour(debut);
  const [a, ma, ja] = debut.split('-');
  const [b, mb, jb] = fin.split('-');
  if (a === b && ma === mb) return `du ${ja} au ${jb}/${mb}/${b}`;
  if (a === b) return `du ${ja}/${ma} au ${jb}/${mb}/${b}`;
  return `du ${texteJour(debut)} au ${texteJour(fin)}`;
}

// ---------------------------------------------------------------------------
// Prestas et murs
// ---------------------------------------------------------------------------

// Date de modification d'une presta (saisie d'un de ses murs, changement de ses infos ou de ses murs).
export function toucher(etat, prestaId, opts) {
  const o = options(opts);
  trouverPresta(etat, prestaId);
  return avecPresta(etat, prestaId, (p) => ({ ...p, modifieeLe: o.iso }));
}

export function modifierPresta(etat, prestaId, infos, opts) {
  const o = options(opts);
  trouverPresta(etat, prestaId);
  const v = infosValides(infos);
  return avecPresta(etat, prestaId, (p) => ({ ...avecInfos(p, v), modifieeLe: o.iso }));
}

// Parc d'un nouveau mur : celui que donne l'appli (`parc`, le parc actif, null si celui du mur a disparu), sinon celui
// du mur ouvert.
const parcNouveau = (etat, choix) => (Object.prototype.hasOwnProperty.call(choix, 'parc') ? choix.parc ?? null : murOuvert(etat)?.parc ?? null);

// Nouvelle presta, ouverte aussitôt : « Presta du JJ/MM/AAAA » par défaut, un « Mur 1 » aux réglages par défaut,
// avec le parc du mur ouvert.
export function creerPresta(etat, choix = {}, opts) {
  const { nom } = choix;
  const o = options(opts);
  const { nom: n } = infosValides({ nom: nom ?? `Presta du ${jourTexte(o.maintenant)}` });
  const pris = idsPris(etat);
  const pid = nouvelId('p', o.alea, pris);
  const mid = nouvelId('m', o.alea, pris);
  return {
    index: { ...etat.index, ouverte: { presta: pid, mur: mid }, prestas: [...etat.index.prestas, prestaVide(pid, n, mid, o.iso)] },
    murs: { ...etat.murs, [mid]: murVide(parcNouveau(etat, choix)) },
  };
}

// Nouveau mur, ouvert : réglages par défaut, parc du mur en cours.
export function ajouterMur(etat, prestaId, choix = {}, opts) {
  const { nom } = choix;
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const n = nomMurValide(p, nom ?? nomMurLibre(p));
  const mid = nouvelId('m', o.alea, idsPris(etat));
  const e = avecPresta(etat, prestaId, (x) => ({ ...x, modifieeLe: o.iso, murs: [...x.murs, { id: mid, nom: n }] }));
  return { index: { ...e.index, ouverte: { presta: prestaId, mur: mid } }, murs: { ...etat.murs, [mid]: murVide(parcNouveau(etat, choix)) } };
}

export function renommerMur(etat, prestaId, murId, nom, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  if (!p.murs.some((m) => m.id === murId)) throw new ErreurSaisie('Mur introuvable.');
  const n = nomMurValide(p, nom, murId);
  return avecPresta(etat, prestaId, (x) => ({ ...x, modifieeLe: o.iso, murs: x.murs.map((m) => (m.id === murId ? { ...m, nom: n } : m)) }));
}

// Saisies, parc, suivi du montage ou du pas à pas NovaLCT d'un mur ({ configuration, parc, montage, novalct }, chacun
// facultatif).
export function enregistrerMur(etat, murId, champs, opts) {
  const actuel = etat.murs[murId];
  if (!actuel) throw new ErreurSaisie('Mur introuvable.');
  const maj = { ...actuel };
  if ('configuration' in champs) maj.configuration = copie(champs.configuration);
  if ('parc' in champs) maj.parc = champs.parc ?? null;
  if ('montage' in champs) maj.montage = copie(champs.montage);
  // Suivi du pas à pas NovaLCT (étape 17b), comme celui du montage.
  if ('novalct' in champs) maj.novalct = copie(champs.novalct);
  // Rien de changé : la presta n'est pas marquée modifiée (ouvrir le guide de montage, relire les saisies).
  if (JSON.stringify(maj) === JSON.stringify(actuel)) return etat;
  const e = { ...etat, murs: { ...etat.murs, [murId]: maj } };
  // Le suivi du montage ou du pas à pas NovaLCT seul (ouvrir le guide, cocher une case) ne marque pas la presta modifiée :
  // rien n'a été saisi.
  const saisi = JSON.stringify({ ...maj, montage: null, novalct: null }) !== JSON.stringify({ ...actuel, montage: null, novalct: null });
  const presta = etat.index.prestas.find((p) => p.murs.some((m) => m.id === murId));
  return presta && saisi ? toucher(e, presta.id, opts) : e;
}

// Liste de matériel d'un mur (étape 13b), calculée quand il est ouvert et gardée avec lui, avec sa date. Elle ne marque
// pas la presta modifiée (rien n'a été saisi) ; une liste identique n'est pas réécrite. Jamais dans le fichier exporté.
export function enregistrerListeMur(etat, murId, liste, opts) {
  const actuel = etat.murs[murId];
  if (!actuel) throw new ErreurSaisie('Mur introuvable.');
  if (JSON.stringify(actuel.materiel?.liste ?? null) === JSON.stringify(liste)) return etat;
  const o = options(opts);
  return { ...etat, murs: { ...etat.murs, [murId]: { ...actuel, materiel: { liste: copie(liste), calculeeLe: o.iso } } } };
}

export const listeGardee = (etat, murId) => etat.murs[murId]?.materiel ?? null;

// Textes des onglets d'un mur pour les fiches par métier (étape 14b) : { mur, data, canvas, elec, poids }, chacun le
// texte copié de l'onglet ou null (calcul non valide), gardés avec le mur et leur date comme la liste de matériel :
// sans marquer la presta modifiée, jamais exportés, non réécrits s'ils n'ont pas changé.
export function enregistrerFicheMur(etat, murId, textes, opts) {
  const actuel = etat.murs[murId];
  if (!actuel) throw new ErreurSaisie('Mur introuvable.');
  if (JSON.stringify(actuel.fiche?.textes ?? null) === JSON.stringify(textes)) return etat;
  const o = options(opts);
  return { ...etat, murs: { ...etat.murs, [murId]: { ...actuel, fiche: { textes: copie(textes), calculeeLe: o.iso } } } };
}

export const ficheGardee = (etat, murId) => etat.murs[murId]?.fiche ?? null;

// Réglages de la liste de matériel gardés avec la presta : pourcentage de spare (5 % par défaut).
export const SPARES_DEFAUT_PRESTA = 5;
export const materielPresta = (presta) => ({ sparesPourcent: presta?.materiel?.sparesPourcent ?? SPARES_DEFAUT_PRESTA });
export function reglerMaterielPresta(etat, prestaId, { sparesPourcent }, opts) {
  const o = options(opts);
  trouverPresta(etat, prestaId);
  const n = typeof sparesPourcent === 'number' ? sparesPourcent : Number(String(sparesPourcent).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100 || String(sparesPourcent).trim() === '') throw new ErreurSaisie('Spare : un pourcentage de 0 à 100.');
  return avecPresta(etat, prestaId, (p) => ({ ...p, materiel: { ...(p.materiel ?? {}), sparesPourcent: n }, modifieeLe: o.iso }));
}

// Check-list de chargement (étape 13c), gardée avec la presta : une ligne du total cochée vaut pour sa quantité.
// Cocher ne marque pas la presta modifiée (rien n'a été saisi). `quantite` null : décochée.
export const cochesPresta = (presta) => presta?.materiel?.coches ?? {};
const avecMateriel = (etat, prestaId, f) => avecPresta(etat, prestaId, (p) => {
  const materiel = f({ ...(p.materiel ?? {}) });
  for (const cle of ['coches', 'ajouts']) {
    if (materiel[cle] && !Object.keys(materiel[cle]).length) delete materiel[cle];
  }
  const copieP = { ...p, materiel };
  if (!Object.keys(materiel).length) delete copieP.materiel;
  return copieP;
});
export function cocherLigne(etat, prestaId, cle, quantite) {
  trouverPresta(etat, prestaId);
  return avecMateriel(etat, prestaId, (m) => {
    const coches = { ...(m.coches ?? {}) };
    if (quantite === null || quantite === undefined) delete coches[cle];
    else coches[cle] = quantite;
    return { ...m, coches };
  });
}
export function toutDecocher(etat, prestaId) {
  trouverPresta(etat, prestaId);
  return avecMateriel(etat, prestaId, (m) => ({ ...m, coches: {} }));
}

// Coches face au total : lignes cochées (même quantité) ; coches dont la quantité a changé ou dont la ligne a disparu,
// avec la raison, jamais en silence (« Câble de tête RJ45, 10 m : 6 au lieu de 4, décoché »).
export function rapprocherCoches(presta, total) {
  const coches = cochesPresta(presta);
  const lignes = new Map(total.sections.flatMap((s) => s.lignes).map((l) => [l.cle, l]));
  const cochees = new Set();
  const changees = [];
  for (const [cle, quantite] of Object.entries(coches)) {
    const l = lignes.get(cle);
    if (l && l.quantite === quantite) cochees.add(cle);
    else if (l) changees.push({ cle, texte: `${libelleLigne(l)} : ${l.quantite} au lieu de ${quantite}, décoché` });
    else changees.push({ cle, texte: `${libelleDeCle(cle)} : plus dans la liste, décoché` });
  }
  return { cochees, changees };
}
// Désignation lue dans la clé d'une ligne disparue : « cable|Câble de tête RJ45|10 » → « Câble de tête RJ45, 10 m ».
function libelleDeCle(cle) {
  const [sorte, nom, longueur] = cle.split('|');
  if (sorte === 'cable') return libelleLigne({ designation: nom, longueurM: Number(longueur) || null, aMesurer: longueur === 'a-mesurer' });
  return nom ?? cle;
}
// « Compris » : les coches changées sont oubliées, les autres restent.
export function oublierCochesChangees(etat, prestaId, total) {
  const p = trouverPresta(etat, prestaId);
  const { changees } = rapprocherCoches(p, total);
  if (!changees.length) return etat;
  return avecMateriel(etat, prestaId, (m) => {
    const coches = { ...(m.coches ?? {}) };
    for (const c of changees) delete coches[c.cle];
    return { ...m, coches };
  });
}

// Ajouts à la main (Socapex, Harting, rallonges, gaffer…), gardés avec la presta.
export const LIMITE_AJOUT = 80;
export const ajoutsPresta = (presta) => presta?.materiel?.ajouts ?? [];
export function ajouterAjout(etat, prestaId, { libelle, quantite }, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const l = String(libelle ?? '').trim().replace(/\s+/g, ' ');
  if (!l) throw new ErreurSaisie('Donne le nom du matériel ajouté.');
  if (l.length > LIMITE_AJOUT) throw new ErreurSaisie(`Nom du matériel ajouté trop long : ${LIMITE_AJOUT} caractères au plus.`);
  const q = typeof quantite === 'number' ? quantite : Number(String(quantite ?? '').trim().replace(',', '.'));
  if (!Number.isInteger(q) || q < 1 || q > 9999) throw new ErreurSaisie('Quantité : un nombre entier, de 1 à 9999.');
  const id = nouvelId('a', o.alea, new Set(ajoutsPresta(p).map((x) => x.id)));
  const e = avecMateriel(etat, prestaId, (m) => ({ ...m, ajouts: [...(m.ajouts ?? []), { id, libelle: l, quantite: q }] }));
  return toucher(e, prestaId, opts);
}
export function retirerAjout(etat, prestaId, ajoutId, opts) {
  trouverPresta(etat, prestaId);
  const e = avecMateriel(etat, prestaId, (m) => {
    const ajouts = (m.ajouts ?? []).filter((x) => x.id !== ajoutId);
    const copieM = { ...m, ajouts };
    if (!ajouts.length) delete copieM.ajouts;
    return copieM;
  });
  return toucher(e, prestaId, opts);
}

// Copie d'un mur, ouverte : mêmes saisies et même parc, suivis du montage et de NovaLCT vides.
export function dupliquerMur(etat, prestaId, murId, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const source = p.murs.find((m) => m.id === murId);
  if (!source) throw new ErreurSaisie('Mur introuvable.');
  let nom = avecSuffixe(source.nom, ' (copie)', LIMITES.nomMur);
  for (let k = 2; p.murs.some((m) => m.nom === nom); k += 1) nom = avecSuffixe(source.nom, ` (copie ${k})`, LIMITES.nomMur);
  const mid = nouvelId('m', o.alea, idsPris(etat));
  const e = avecPresta(etat, prestaId, (x) => ({ ...x, modifieeLe: o.iso, murs: [...x.murs, { id: mid, nom }] }));
  return { index: { ...e.index, ouverte: { presta: prestaId, mur: mid } }, murs: { ...etat.murs, [mid]: { ...copie(etat.murs[murId]), montage: null, novalct: null } } };
}

// Copie d'une presta, ouverte : infos et murs (saisies et parcs), non archivée, jamais exportée, suivis vides.
export function dupliquerPresta(etat, prestaId, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const pris = idsPris(etat);
  const pid = nouvelId('p', o.alea, pris);
  const murs = p.murs.map((m) => ({ id: nouvelId('m', o.alea, pris), nom: m.nom, source: m.id }));
  const presta = {
    ...p, id: pid, nom: avecSuffixe(p.nom, ' (copie)', LIMITES.nomPresta), creeeLe: o.iso, modifieeLe: o.iso, exporteeLe: null, archivee: false,
    murs: murs.map(({ id, nom }) => ({ id, nom })),
  };
  // Lien avec le devis (étape 25) : la copie n'est pas la presta du devis.
  delete presta.lienDevis;
  const donnees = { ...etat.murs };
  for (const m of murs) donnees[m.id] = { ...copie(etat.murs[m.source] ?? murVide()), montage: null, novalct: null };
  return { index: { ...etat.index, ouverte: { presta: pid, mur: murs[0].id }, prestas: [...etat.index.prestas, presta] }, murs: donnees };
}

// ---------------------------------------------------------------------------
// Murs préparés depuis un devis Eventsoft (étape 25, lot 25e2, spec § 5.5)
// ---------------------------------------------------------------------------

// Saisies gardées d'un mur proposé : format de configuration.js (version 2), la source suit le conseil.
const VERSION_CONFIGURATION = 2;
const configurationProposee = (m) => ({ version: VERSION_CONFIGURATION, sourceModifiee: false, formulaires: copie(m.formulaires) });
const prestaDuDevis = (etat, lien) => etat.index.prestas.find((p) => p.lienDevis?.boite === lien.boite && p.lienDevis?.idEventsoft === lien.idEventsoft) ?? null;
const ECART_DEVIS = 'Devis modifié depuis la préparation des murs : vérifie tes murs, rien n\'a été changé.';

// Nom libre dans la presta : « ECRAN », puis « ECRAN 2 », « ECRAN 3 »…, 40 caractères au plus.
function nomLibre(pris, nom) {
  const base = String(nom ?? '').trim().slice(0, LIMITES.nomMur) || 'Mur';
  let n = base;
  for (let k = 2; pris.has(n); k += 1) n = avecSuffixe(base, ` ${k}`, LIMITES.nomMur);
  pris.add(n);
  return n;
}
const dateOuNull = (x) => {
  try {
    return dateValide(x);
  } catch {
    return null;
  }
};

// Presta liée au devis (`lien` : { boite, idEventsoft, empreinte }) : null si aucune ; sinon son nom, l'écart (devis
// modifié depuis la préparation), les murs proposés pas encore préparés et le premier mur à ouvrir.
export function etatLienDevis(etat, lien, nomsProposes = []) {
  const p = prestaDuDevis(etat, lien);
  if (!p) return null;
  const prepares = new Set(p.lienDevis.murs ?? []);
  return { prestaId: p.id, nom: p.nom, ecart: p.lienDevis.empreinte !== lien.empreinte, manquants: nomsProposes.filter((n) => !prepares.has(n)), murOuvrir: p.murs[0]?.id ?? null };
}

// « Préparer les murs » : crée la presta du devis (le « Mur 1 » vide de `prestaVide` remplacé par les murs proposés,
// nom à 60 caractères, lieu à 80, dates du devis, parc de la boîte) avec le lien `lienDevis`, ou complète la presta liée
// des seuls murs pas encore préparés. Devis modifié depuis : refus, murs non touchés. Rien à compléter : même état.
export function preparerMurs(etat, { nom, debut = null, fin = null, lieu = '', murs = [], lien, parc = null }, opts) {
  if (!murs.length) throw new ErreurSaisie('Aucun mur à préparer dans ce devis.');
  const o = options(opts);
  const pris = idsPris(etat);
  const liee = prestaDuDevis(etat, lien);
  if (liee && liee.lienDevis.empreinte !== lien.empreinte) throw new ErreurSaisie(ECART_DEVIS);
  const dejaPrepares = new Set(liee?.lienDevis.murs ?? []);
  const nouveaux = murs.filter((m) => !dejaPrepares.has(m.nom));
  if (!nouveaux.length) return etat;
  const noms = new Set(liee ? liee.murs.map((m) => m.nom) : []);
  const ajoutes = nouveaux.map((m) => ({ id: nouvelId('m', o.alea, pris), nom: nomLibre(noms, m.nom), configuration: configurationProposee(m) }));
  const donnees = { ...etat.murs };
  for (const m of ajoutes) donnees[m.id] = { ...murVide(parc), configuration: m.configuration };
  const lienDevis = { boite: lien.boite, idEventsoft: lien.idEventsoft, empreinte: lien.empreinte, murs: [...dejaPrepares, ...nouveaux.map((m) => m.nom)] };
  const listeMurs = ajoutes.map(({ id, nom: n }) => ({ id, nom: n }));
  if (liee) {
    const e = avecPresta(etat, liee.id, (x) => ({ ...x, modifieeLe: o.iso, lienDevis, murs: [...x.murs, ...listeMurs] }));
    return { index: { ...e.index, ouverte: { presta: liee.id, mur: ajoutes[0].id } }, murs: donnees };
  }
  const pid = nouvelId('p', o.alea, pris);
  const d = dateOuNull(debut);
  const f = d ? dateOuNull(fin) : null;
  const presta = {
    ...prestaVide(pid, String(nom ?? '').trim().slice(0, LIMITES.nomPresta).trim() || 'Presta du devis', null, o.iso),
    debut: d, fin: f && f >= d ? f : null, lieu: String(lieu ?? '').trim().slice(0, LIMITES.lieu).trim(), murs: listeMurs, lienDevis,
  };
  return { index: { ...etat.index, ouverte: { presta: pid, mur: ajoutes[0].id }, prestas: [...etat.index.prestas, presta] }, murs: donnees };
}

// « C'est vu » : le devis modifié est retenu pour la presta liée ; ses murs ne changent pas.
export function lienDevisVu(etat, prestaId, empreinte, opts) {
  const p = trouverPresta(etat, prestaId);
  if (!p.lienDevis) return etat;
  const o = options(opts);
  return avecPresta(etat, prestaId, (x) => ({ ...x, modifieeLe: o.iso, lienDevis: { ...x.lienDevis, empreinte } }));
}

// Archiver ne change pas la date de modification : la presta garde sa place.
export function archiverPresta(etat, prestaId, archivee = true) {
  trouverPresta(etat, prestaId);
  return avecPresta(etat, prestaId, (p) => ({ ...p, archivee: Boolean(archivee) }));
}

// Le dernier mur d'une presta ne se supprime pas ; le mur ouvert supprimé laisse la place au premier restant.
export function supprimerMur(etat, prestaId, murId, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  if (!p.murs.some((m) => m.id === murId)) throw new ErreurSaisie('Mur introuvable.');
  if (p.murs.length <= 1) throw new ErreurSaisie('Une presta garde au moins un mur : supprime la presta si tu n\'en veux plus.');
  const restants = p.murs.filter((m) => m.id !== murId);
  const e = avecPresta(etat, prestaId, (x) => ({ ...x, modifieeLe: o.iso, murs: restants }));
  const murs = { ...etat.murs };
  delete murs[murId];
  const ouverte = etat.index.ouverte?.mur === murId ? { presta: prestaId, mur: restants[0].id } : etat.index.ouverte;
  return { index: { ...e.index, ouverte }, murs };
}

// Une presta part avec ses murs. Ouverte, elle laisse la place à la dernière modifiée des autres ; la dernière presta
// supprimée est remplacée par une presta vide « Presta sans nom ».
export function supprimerPresta(etat, prestaId, opts) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const murs = { ...etat.murs };
  for (const m of p.murs) delete murs[m.id];
  const restantes = etat.index.prestas.filter((x) => x.id !== prestaId);
  if (!restantes.length) {
    const pris = idsPris(etat);
    const pid = nouvelId('p', o.alea, pris);
    const mid = nouvelId('m', o.alea, pris);
    return { index: { ...etat.index, ouverte: { presta: pid, mur: mid }, prestas: [prestaVide(pid, SANS_NOM, mid, o.iso)] }, murs: { [mid]: murVide() } };
  }
  let ouverte = etat.index.ouverte;
  if (ouverte?.presta === prestaId) {
    const liste = listePrestas({ index: { prestas: restantes } });
    const suivante = liste.actives[0] ?? liste.archivees[0];
    ouverte = { presta: suivante.id, mur: suivante.murs[0].id };
  }
  return { index: { ...etat.index, ouverte, prestas: restantes }, murs };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Chaînes et clés citées dans un objet, y compris dans les champs qui gardent du JSON (zones du Mur).
function chaines(x, acc = new Set()) {
  if (typeof x === 'string') {
    acc.add(x);
    const t = x.trim();
    if (/^[[{]/.test(t)) {
      try {
        chaines(JSON.parse(t), acc);
      } catch (erreur) {
        // simple texte
      }
    }
  } else if (Array.isArray(x)) {
    for (const y of x) chaines(y, acc);
  } else if (x && typeof x === 'object') {
    for (const [cle, y] of Object.entries(x)) {
      acc.add(cle);
      chaines(y, acc);
    }
  }
  return acc;
}

// Parcs des murs de la presta, tels qu'ils sont dans ma base.
export function parcsUtilises(etat, prestaId, base) {
  const ids = new Set(trouverPresta(etat, prestaId).murs.map((m) => etat.murs[m.id]?.parc).filter(Boolean));
  return (base.parcs ?? []).filter((p) => ids.has(p.id));
}

// Fiches de ma base (fiches perso et versions modifiées) citées par les saisies des murs, zones comprises, ou par leurs
// parcs (membres, réglages, lots), et de proche en proche par les fiches citées (demi-dalle d'une dalle, `demiDalle`,
// même quand la dalle est celle de la base de départ, donnée par `depart`). Les fiches de la base de départ ne partent
// pas : l'autre appareil les a.
export function fichesUtilisees(etat, prestaId, base, depart = null) {
  const cites = new Set();
  for (const m of trouverPresta(etat, prestaId).murs) chaines(etat.murs[m.id]?.configuration ?? null, cites);
  for (const parc of parcsUtilises(etat, prestaId, base)) chaines(parc, cites);
  const mesFiches = new Map((base.fiches ?? []).map((f) => [f.fiche.id, f.fiche]));
  const deDepart = new Map();
  if (depart) {
    const o = fusionner(depart, baseVide());
    for (const f of [...o.dalles.dalles, ...o.dalles.gabarits, ...o.dalles.bumpers, ...o.processeurs.processeurs, ...o.regies.regies]) deDepart.set(f.id, f);
  }
  const vus = new Set();
  const aVoir = [...cites];
  while (aVoir.length) {
    const id = aVoir.pop();
    if (vus.has(id)) continue;
    vus.add(id);
    const fiche = mesFiches.get(id) ?? deDepart.get(id);
    if (fiche) for (const c of chaines(fiche)) if (!vus.has(c) && (mesFiches.has(c) || deDepart.has(c))) aVoir.push(c);
  }
  return (base.fiches ?? []).filter((f) => vus.has(f.fiche.id));
}

// Fichier d'une presta : infos, murs (sans suivi de montage), fiches, sources et parcs utilisés ; fichiers de config
// décrits par leur taille, jamais leur contenu. Renvoie aussi l'état avec la date d'export de la presta. `opts.depart` :
// base de départ, pour suivre les demi-dalles des dalles de départ.
export function exporterPresta(etat, prestaId, base, opts = {}) {
  const o = options(opts);
  const p = trouverPresta(etat, prestaId);
  const fiches = copie(fichesUtilisees(etat, prestaId, base, opts.depart ?? null));
  // Code admin NovaLCT du parc (étape 18a) : jamais dans un fichier de presta, qui se partage.
  const parcs = copie(parcsUtilises(etat, prestaId, base)).map(sansCode);
  const citees = chaines(fiches);
  const donnees = {
    format: FORMAT_PRESTA,
    version: VERSION_PRESTAS,
    exporteLe: o.iso,
    versionAppli: opts.versionAppli ?? null,
    presta: { id: p.id, nom: p.nom, debut: p.debut, fin: p.fin, lieu: p.lieu, notes: p.notes, ...(p.organisation ? { organisation: copie(p.organisation) } : {}) },
    murs: p.murs.map((m) => ({ id: m.id, nom: m.nom, parc: etat.murs[m.id]?.parc ?? null, configuration: copie(etat.murs[m.id]?.configuration) })),
    fiches,
    sources: Object.fromEntries(Object.entries(base.sources ?? {}).filter(([id]) => citees.has(id)).map(([id, s]) => [id, copie(s)])),
    parcs,
    tailleFichiersJoints: tailleFichiersJoints({ parcs }),
  };
  return { donnees, etat: avecPresta(etat, prestaId, (x) => ({ ...x, exporteeLe: o.iso })) };
}

// Liste de matériel partagée : « mur-led-materiel-<nom simplifié>-<AAAA-MM-JJ>.txt ».
export const nomFichierMateriel = (nom, maintenant = new Date()) => nomFichierPresta(nom, maintenant).replace(/^mur-led-presta-/, 'mur-led-materiel-').replace(/\.json$/, '.txt');

// « mur-led-presta-<nom simplifié>-<AAAA-MM-JJ>.json ».
export function nomFichierPresta(nom, maintenant = new Date()) {
  // Lettres liées remplacées avant la simplification (« Cœur » → « coeur », pas « c-ur »).
  const simple = String(nom ?? '').replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'sans-nom';
  return `mur-led-presta-${simple}-${jourIso(maintenant)}.json`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const refus = (message) => ({ erreurs: [message], donnees: null });
// Identifiant d'un fichier gardé seulement s'il a la forme de ceux de l'appli (« p-… », « m-… ») ; sinon un nouveau
// est tiré à l'import (un « __proto__ » perdrait les saisies du mur).
const idValable = (id, prefixe) => (typeof id === 'string' && new RegExp(`^${prefixe}-[A-Za-z0-9-]{1,40}$`).test(id) ? id : null);
const valeurSaisie = (x) => typeof x === 'string' || typeof x === 'boolean';

// Saisies d'un mur lues dans un fichier : formulaires connus seulement, valeurs texte ou case à cocher.
function configurationLue(c) {
  if (c === null || c === undefined) return { ok: true, configuration: null };
  if (typeof c !== 'object' || Array.isArray(c) || !c.formulaires || typeof c.formulaires !== 'object') return { ok: false };
  const formulaires = {};
  for (const [id, valeurs] of Object.entries(c.formulaires)) {
    if (!valeurs || typeof valeurs !== 'object' || Array.isArray(valeurs) || !Object.values(valeurs).every(valeurSaisie)) return { ok: false };
    if (FORMULAIRES_SAISIES.includes(id)) formulaires[id] = { ...valeurs };
  }
  return { ok: true, configuration: { version: Number.isInteger(c.version) ? c.version : 1, sourceModifiee: c.sourceModifiee === true, formulaires } };
}

function lireFichierPresta(texte) {
  let objet;
  try {
    objet = typeof texte === 'string' ? JSON.parse(texte) : texte;
  } catch (erreur) {
    return refus(`Fichier illisible : ${erreur.message}`);
  }
  if (!objet || typeof objet !== 'object') return refus('Fichier illisible : vide.');
  if (objet.format === 'appli-mur-led/export') return refus('C\'est un export de la base : importe-le dans l\'onglet Base.');
  if (objet.format !== FORMAT_PRESTA || typeof objet.version !== 'number') return refus('Ce fichier n\'est pas une presta de l\'appli Mur LED.');
  if (objet.version > VERSION_PRESTAS) return refus('Presta faite par une version plus récente de l\'appli : mets l\'appli à jour avant de l\'importer.');
  let infos;
  try {
    infos = infosValides(objet.presta ?? {});
  } catch (erreur) {
    return refus(erreur.message);
  }
  if (!Array.isArray(objet.murs) || !objet.murs.length) return refus('Presta sans mur : rien à importer.');
  const murs = [];
  for (const m of objet.murs) {
    const nom = String(m?.nom ?? '').trim();
    if (!nom) return refus('Un mur du fichier n\'a pas de nom.');
    if (nom.length > LIMITES.nomMur) return refus(`${nom} : nom de mur trop long (${LIMITES.nomMur} caractères au plus).`);
    if (murs.some((x) => x.nom === nom)) return refus(`Deux murs s'appellent ${nom}.`);
    const lu = configurationLue(m.configuration);
    if (!lu.ok || !(m.parc === null || m.parc === undefined || typeof m.parc === 'string')) return refus(`${nom} : saisies illisibles.`);
    murs.push({ id: idValable(m.id, 'm'), nom, parc: m.parc ?? null, configuration: lu.configuration });
  }
  const parcs = objet.parcs ?? [];
  if (!Array.isArray(parcs) || !parcs.every((p) => p && typeof p.id === 'string' && typeof p.nom === 'string')) return refus('Parcs du fichier illisibles.');
  const fiches = objet.fiches ?? [];
  const ficheLisible = (f) => f && typeof f === 'object' && typeof f.type === 'string' && f.fiche && typeof f.fiche === 'object'
    && typeof f.fiche.id === 'string' && f.fiche.id.trim() !== '';
  if (!Array.isArray(fiches) || !fiches.every(ficheLisible)) return refus('Fiches du fichier illisibles.');
  const sources = objet.sources && typeof objet.sources === 'object' ? objet.sources : {};
  return {
    erreurs: [],
    donnees: { presta: { id: idValable(objet.presta.id, 'p'), ...infos }, murs, fiches: copie(fiches), sources: copie(sources), parcs: copie(parcs) },
  };
}

const sourcesDepart = (depart) => ({ ...(depart?.dalles?.sources ?? {}), ...(depart?.processeurs?.sources ?? {}), ...(depart?.regies?.sources ?? {}) });

// Chaque fiche du fichier face à ma base : identique, absente (à ajouter si elle est valable), ou différente de la mienne.
function comparerFiches(donnees, base, depart) {
  const lecture = validerImport({ sources: donnees.sources, fiches: donnees.fiches }, sourcesDepart(depart));
  const origine = fusionner(depart ?? {}, baseVide());
  const listesDepart = { dalle: [...origine.dalles.dalles, ...origine.dalles.gabarits], bumper: origine.dalles.bumpers, processeur: origine.processeurs.processeurs, regie: origine.regies.regies };
  const propre = (f) => {
    const c = { ...f };
    delete c.statutBase;
    return stable(nettoyerFiche(c));
  };
  return lecture.entrees.map((entree) => {
    const { type, fiche } = entree;
    const mienne = base.fiches.find((f) => f.type === type && f.fiche.id === fiche.id);
    const deDepart = (listesDepart[type] ?? []).find((f) => f.id === fiche.id);
    let etat = 'absente';
    // La fiche de départ compte comme la mienne quand je n'en ai pas de version modifiée : une autre version reçue est
    // un conflit, gardée par défaut (elle changerait les calculs de toutes mes prestas).
    if (mienne) etat = propre(mienne.fiche) === propre(fiche) ? 'identique' : 'conflit';
    else if (deDepart) etat = propre(deDepart) === propre(fiche) ? 'identique' : 'conflit';
    return { ...entree, etat };
  });
}

// Parc sans son code admin NovaLCT (étape 18a) : le code reste sur l'appareil, hors des fichiers de presta.
function sansCode(parc) {
  const { codeNovaLCT, ...reste } = parc;
  return reste;
}

// Le code de l'appareil ne compte pas dans la comparaison (le fichier n'en a jamais).
function comparerParcs(donnees, base) {
  return donnees.parcs.map((parc) => {
    const mien = base.parcs.find((p) => p.id === parc.id);
    return { parc, etat: !mien ? 'absent' : stable(sansCode(mien)) === stable(sansCode(parc)) ? 'identique' : 'conflit' };
  });
}

const trie = (liste) => [...liste].sort((a, b) => a.localeCompare(b, 'fr'));

// Vérification avant l'import : erreurs, presta déjà sur l'appareil, fiches et parcs différents des miens.
export function verifierImportPresta(texte, etat, base, depart) {
  const lu = lireFichierPresta(texte);
  if (lu.erreurs.length) return { ...lu, prestaExiste: false, conflits: { fiches: [], parcs: [] } };
  const { donnees } = lu;
  return {
    erreurs: [],
    donnees,
    prestaExiste: Boolean(donnees.presta.id && etat.index.prestas.some((p) => p.id === donnees.presta.id)),
    conflits: {
      fiches: trie(comparerFiches(donnees, base, depart).filter((f) => f.etat === 'conflit').map((f) => f.fiche.id)),
      parcs: trie(comparerParcs(donnees, base).filter((p) => p.etat === 'conflit').map((p) => p.parc.nom)),
    },
  };
}

// Import d'une presta. Choix : `presta` 'deux' (garder les deux, par défaut) ou 'remplacer' quand elle est déjà sur
// l'appareil ; `conflits` 'garder' (mes fiches et mes parcs, par défaut) ou 'prendre' (ceux du fichier).
// Renvoie { etat, base, rapport, mursSupprimes, erreurs } ; un fichier refusé ne change rien. Les fichiers de config
// ne sont jamais dans le fichier : `rapport.fichiersDecrits` les nomme.
export function importerPresta(etat, base, depart, texte, choix = {}, opts) {
  const o = options(opts);
  const lu = verifierImportPresta(texte, etat, base, depart);
  if (lu.erreurs.length) return { etat, base, rapport: null, mursSupprimes: [], erreurs: lu.erreurs };
  const { donnees } = lu;
  const prendre = choix.conflits === 'prendre';

  // Fiches : absentes et valables ajoutées, identiques ignorées, différentes gardées ou prises du fichier.
  const fiches = { ajoutees: [], identiques: [], gardees: [], remplacees: [], refusees: [] };
  let nouvelleBase = base;
  const sources = { ...sourcesDepart(depart), ...donnees.sources };
  for (const f of comparerFiches(donnees, base, depart)) {
    const id = f.fiche.id;
    if (f.etat === 'identique') fiches.identiques.push(id);
    else if (f.etat === 'conflit' && !prendre) fiches.gardees.push(id);
    else if (!f.validation.enregistrable) fiches.refusees.push({ id, erreurs: f.validation.erreurs });
    else {
      nouvelleBase = enregistrerFiche(nouvelleBase, f.type, f.validation.fiche, sources);
      (f.etat === 'conflit' ? fiches.remplacees : fiches.ajoutees).push(id);
    }
  }
  const depSources = sourcesDepart(depart);
  nouvelleBase = { ...nouvelleBase, sources: Object.fromEntries(Object.entries(nouvelleBase.sources).filter(([id]) => !depSources[id] || donnees.sources[id])) };

  // Parcs : absents ajoutés, identiques ignorés, différents gardés ou pris du fichier.
  const parcs = { ajoutes: [], identiques: [], gardes: [], remplaces: [] };
  for (const { parc, etat: e } of comparerParcs(donnees, base)) {
    if (e === 'identique') parcs.identiques.push(parc.nom);
    else if (e === 'conflit' && !prendre) parcs.gardes.push(parc.nom);
    else if (e === 'conflit') {
      // Parc pris du fichier : le code admin NovaLCT de l'appareil reste (étape 18a).
      nouvelleBase = { ...nouvelleBase, parcs: nouvelleBase.parcs.map((p) => (p.id === parc.id ? { ...sansCode(parc), ...(p.codeNovaLCT ? { codeNovaLCT: p.codeNovaLCT } : {}) } : p)) };
      parcs.remplaces.push(parc.nom);
    } else {
      nouvelleBase = { ...nouvelleBase, parcs: [...nouvelleBase.parcs, sansCode(parc)] };
      parcs.ajoutes.push(parc.nom);
    }
  }
  for (const liste of [...Object.values(fiches), ...Object.values(parcs)]) {
    liste.sort((a, b) => (a.id ?? a).localeCompare(b.id ?? b, 'fr'));
  }

  // Presta : ajoutée telle quelle, gardée en copie « (reçue le …) », ou remplaçant la mienne.
  const pris = idsPris(etat);
  const existante = donnees.presta.id ? etat.index.prestas.find((p) => p.id === donnees.presta.id) : null;
  const mode = !existante ? 'ajoutee' : choix.presta === 'remplacer' ? 'remplacee' : 'copie';
  const { id: idFichier, ...infos } = donnees.presta;
  let pid;
  if (mode === 'remplacee') pid = existante.id;
  else if (mode === 'ajoutee' && idFichier) {
    pid = idFichier;
    pris.add(pid);
  } else pid = nouvelId('p', o.alea, pris);
  const nom = mode === 'copie' ? avecSuffixe(infos.nom, ` (reçue le ${jourTexte(o.maintenant)})`, LIMITES.nomPresta) : infos.nom;
  const murs = donnees.murs.map((m) => {
    let id;
    if (mode === 'ajoutee' && m.id && !pris.has(m.id)) {
      id = m.id;
      pris.add(id);
    } else id = nouvelId('m', o.alea, pris);
    return { id, nom: m.nom, parc: m.parc, configuration: m.configuration };
  });
  const presta = {
    id: pid, ...avecInfos({}, infos), nom, creeeLe: mode === 'remplacee' ? existante.creeeLe : o.iso, modifieeLe: o.iso, exporteeLe: null, archivee: false,
    murs: murs.map(({ id, nom: n }) => ({ id, nom: n })),
  };
  const donneesMurs = { ...etat.murs };
  const mursSupprimes = mode === 'remplacee' ? existante.murs.map((m) => m.id) : [];
  for (const id of mursSupprimes) delete donneesMurs[id];
  for (const m of murs) donneesMurs[m.id] = { version: VERSION_PRESTAS, parc: m.parc, configuration: m.configuration, montage: null };
  const prestas = mode === 'remplacee' ? etat.index.prestas.map((p) => (p.id === pid ? presta : p)) : [...etat.index.prestas, presta];
  return {
    etat: { index: { ...etat.index, ouverte: { presta: pid, mur: murs[0].id }, prestas }, murs: donneesMurs },
    base: nouvelleBase,
    rapport: {
      presta: mode,
      nom,
      murs: murs.length,
      fiches,
      parcs,
      fichiersDecrits: trie([...new Set(fichiersJoints({ parcs: donnees.parcs }).map((f) => f.nom))]),
    },
    mursSupprimes,
    erreurs: [],
  };
}

// ---------------------------------------------------------------------------
// Textes et stockage
// ---------------------------------------------------------------------------

// Ligne de « Tout copier » : « Presta A, du 17 au 19/10/2026, Lieu B · Mur 1 ».
export function lignePresta(presta, nomMur) {
  const tete = [presta.nom, texteDates(presta.debut, presta.fin), presta.lieu].filter(Boolean).join(', ');
  return `${tete} · ${nomMur}`;
}

// Résumé d'un mur lu dans ses saisies, sans calcul : « BP2 V2, 12 × 6 dalles, parc Prestataire A ».
export function resumeMur(mur, { nomDalle = () => null, nomParc = () => null } = {}) {
  const f = mur?.configuration?.formulaires?.['form-mur'];
  if (!f) return 'Réglages par défaut';
  const virgule = (x) => String(x ?? '').replace('.', ',');
  // Champ caché des zones : l'objet { zones: [...] } de zones.js (ecrireSaisieZones).
  let nombreZones = 0;
  try {
    const lu = JSON.parse(f.zones || '{}');
    nombreZones = (Array.isArray(lu) ? lu : lu?.zones ?? []).length;
  } catch (erreur) {
    nombreZones = 0;
  }
  const taille = {
    dalles: `${f.colonnes} × ${f.lignes} dalles`,
    taille: `cible ${virgule(f.largeurM)} × ${virgule(f.hauteurM)} m`,
    resolution: `cible ${f.largeurPx} × ${f.hauteurPx} px`,
    zones: `${nombreZones} zone${nombreZones > 1 ? 's' : ''}`,
  }[f.mode];
  const parc = mur.parc ? nomParc(mur.parc) : null;
  return [nomDalle(f.dalle) ?? 'Dalle inconnue', taille, parc ? `parc ${parc}` : null].filter(Boolean).join(', ');
}

// Proportions d'un mur lues dans ses saisies, sans calcul (mini-aperçu de l'écran Prestas, étape 11d) : Dalles,
// colonnes × lignes et taille de la dalle (`ficheDalle(id)`) ; Taille et Résolution, la cible ; réglages par défaut,
// 6 × 3 m ; Zones ou saisie illisible : null.
export function proportionsMur(mur, { ficheDalle = () => null } = {}) {
  const f = mur?.configuration?.formulaires?.['form-mur'];
  if (!f) return { largeur: 6, hauteur: 3 };
  const n = (x) => Number(String(x ?? '').replace(',', '.'));
  const si = (largeur, hauteur) => (largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null);
  if (f.mode === 'dalles') {
    const d = ficheDalle(f.dalle);
    return d ? si(n(f.colonnes) * d.largeurMm, n(f.lignes) * d.hauteurMm) : null;
  }
  if (f.mode === 'taille') return si(n(f.largeurM), n(f.hauteurM));
  if (f.mode === 'resolution') return si(n(f.largeurPx), n(f.hauteurPx));
  return null;
}

// Clés de stockage : l'index des prestas, et une clé par mur.
export const CLE_INDEX = 'prestas';
export const cleMur = (id) => `mur:${id}`;

// Écritures après une opération : l'index s'il a changé, chaque mur nouveau ou changé ; les murs disparus effacés.
// `avant` vaut null au premier enregistrement (migration).
export function ecrituresPrestas(avant, apres) {
  const ecrire = [];
  const effacer = [];
  if (!avant || JSON.stringify(avant.index) !== JSON.stringify(apres.index)) ecrire.push([CLE_INDEX, apres.index]);
  for (const [id, mur] of Object.entries(apres.murs)) {
    if (!avant || JSON.stringify(avant.murs[id]) !== JSON.stringify(mur)) ecrire.push([cleMur(id), mur]);
  }
  for (const id of Object.keys(avant?.murs ?? {})) if (!(id in apres.murs)) effacer.push(cleMur(id));
  return { ecrire, effacer };
}

// Rapport d'import en phrases (les fiches et parcs identiques aux miens ne sont pas cités).
export function texteRapportImport(r) {
  const liste = (x) => x.map((e) => e.id ?? e).join(', ');
  const murs = r.murs > 1 ? `ses ${r.murs} murs` : 'son mur';
  const lignes = [{
    ajoutee: `${r.nom} importée, avec ${murs}.`,
    copie: `${r.nom} ajoutée à côté de la tienne, avec ${murs}.`,
    remplacee: `Ta presta ${r.nom} remplacée par celle du fichier, avec ${murs}.`,
  }[r.presta]];
  const f = r.fiches;
  const p = r.parcs;
  if (f.ajoutees.length) lignes.push(`Fiches ajoutées à ta base : ${liste(f.ajoutees)}.`);
  if (f.gardees.length) lignes.push(`Fiches gardées dans ta version, différente de celle du fichier (le calcul se fait avec la tienne) : ${liste(f.gardees)}.`);
  if (f.remplacees.length) lignes.push(`Fiches remplacées par celles du fichier : ${liste(f.remplacees)}.`);
  if (f.refusees.length) lignes.push(`Fiches refusées, incomplètes : ${liste(f.refusees)}.`);
  if (p.ajoutes.length) lignes.push(`Parcs ajoutés : ${liste(p.ajoutes)}.`);
  if (p.gardes.length) lignes.push(`Parcs gardés dans ta version, différente de celle du fichier : ${liste(p.gardes)}.`);
  if (p.remplaces.length) lignes.push(`Parcs remplacés par ceux du fichier : ${liste(p.remplaces)}.`);
  if (r.fichiersDecrits.length) {
    lignes.push(`Fichiers de config jamais joints au fichier d'une presta : ${liste(r.fichiersDecrits)}. Joins-les sur cet appareil si besoin (onglet Base, lots du parc).`);
  }
  return lignes;
}
