// Devis et poste lus dans Eventsoft (étape 25, lot 25b) : rapprochement avec le planning, domaines, dalles et
// processeurs reconnus dans la base, configuration proposée pour l'onglet Mur, processeurs comparés au niveau de la
// presta. Fonctions pures, hors du calcul du mur (spec de l'étape 25, § 5.5). Le déchiffrement arrive au lot 25d.

import { dateParis } from './ics.js';
import { dimensionner, evaluerToutesMarques, processeurConseille, champsManquants } from '../calculs.js';

const sansAccents = (texte) => String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Mots seuls, sans casse, accents ni ponctuation (« SALON FICTIF - Hall 1 » → « salon fictif hall 1 »).
const mots = (texte) => sansAccents(texte).replace(/[^a-z0-9]+/g, ' ').trim();
// Référence ou modèle collé (« Upad IV 2 Pro » → « upadiv2pro », « URMIII2.6 » → « urmiii2.6 »).
const compact = (texte) => sansAccents(texte).replace(/[^a-z0-9.]+/g, '');
const comparerNoms = (a, b) => a.localeCompare(b, 'fr', { numeric: true });
const virgule = (n) => String(n).replace('.', ',');

// ---------------------------------------------------------------------------
// Rapprochement presta Eventsoft ↔ presta du planning
// ---------------------------------------------------------------------------

// Inclusion d'un nom dans l'autre : seulement à partir de 4 caractères, par mots entiers.
const INCLUSION_MIN = 4;
function lienNoms(a, b) {
  const x = mots(a);
  const y = mots(b);
  if (!x || !y) return null;
  if (x === y) return 'egal';
  const [court, long] = x.length <= y.length ? [x, y] : [y, x];
  return court.length >= INCLUSION_MIN && ` ${long} `.includes(` ${court} `) ? 'inclus' : null;
}

// Presta du devis ({ nom, debut, fin } en « AAAA-MM-JJ ») face aux phases du planning (`phasesActives`) : même boîte,
// nom souple (identique de préférence, sinon l'un contient l'autre), dates qui se chevauchent ; indisponibilités
// écartées. Une seule presta : liée ; plusieurs : à choisir, sauf `choix` (nom retenu par l'utilisateur) parmi elles.
export function rapprocher(presta, phases, { boite, choix = null } = {}) {
  const touchees = (phases ?? [])
    .filter((p) => p.boite === boite && !p.indispo && p.presta)
    .map((p) => ({ p, lien: lienNoms(presta.nom, p.presta) }))
    .filter(({ p, lien }) => lien && dateParis(p.debut) <= presta.fin && presta.debut <= dateParis(Math.max(p.debut, p.fin - 1)));
  const egales = touchees.filter((t) => t.lien === 'egal');
  const retenues = (egales.length ? egales : touchees).map((t) => t.p);
  const candidates = [...new Set(retenues.map((p) => p.presta))].sort(comparerNoms);
  const nom = candidates.length === 1 ? candidates[0] : (candidates.includes(choix) ? choix : null);
  return {
    statut: nom ? 'liee' : (candidates.length ? 'a-choisir' : 'aucune'),
    presta: nom,
    candidates,
    phases: nom ? retenues.filter((p) => p.presta === nom).map((p) => p.uid) : [],
  };
}

// ---------------------------------------------------------------------------
// Postes (Personnel, un poste par créneau)
// ---------------------------------------------------------------------------

// Postes d'une journée (« AAAA-MM-JJ ») : créneaux du jour (« JJ/MM » tel que lu) et postes sans jour ; même poste
// en casse différente compté une fois.
export function postesDuJour(postes, date) {
  const jjmm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const vus = new Set();
  const liste = [];
  for (const { jour, poste } of postes ?? []) {
    const texte = String(poste ?? '').trim();
    const cle = mots(texte);
    if (!texte || vus.has(cle) || (jour && jour !== jjmm && jour !== date)) continue;
    vus.add(cle);
    liste.push(texte);
  }
  return liste;
}

export function textePostes(liste) {
  if (liste.length <= 1) return liste[0] ?? '';
  return `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Domaines
// ---------------------------------------------------------------------------

export const DOMAINES = ['MUR LED', 'VIDÉO', 'LUMIÈRE', 'SON', 'STRUCTURE / ACCROCHE', 'DÉCO / TAPISSERIE', 'ÉLECTRICITÉ', 'AUTRE'];
export const LIBELLES_DOMAINE = {
  'MUR LED': 'mur LED', 'VIDÉO': 'vidéo', 'LUMIÈRE': 'lumière', 'SON': 'son', 'STRUCTURE / ACCROCHE': 'structure / accroche',
  'DÉCO / TAPISSERIE': 'déco / tapisserie', 'ÉLECTRICITÉ': 'électricité', 'AUTRE': 'autre',
};
// Mots-clés sans accents, par mots entiers, dans l'ordre des domaines (« PAR LED » n'est pas un mur LED).
const MOTS_CLES = [
  ['MUR LED', ['mur led', 'murs led', 'ecran led', 'ecrans led', 'led wall', 'dalle', 'dalles', 'demi dalle', 'demi dalles']],
  ['VIDÉO', ['video', 'videos', 'videoprojecteur', 'videoprojection', 'camera', 'cameras', 'moniteur', 'moniteurs', 'watchout', 'modulopi',
    'melangeur', 'mixeur video', 'scaler', 'sdi', 'hdmi', 'media serveur']],
  ['LUMIÈRE', ['lumiere', 'lumieres', 'eclairage', 'lyre', 'lyres', 'projecteur', 'projecteurs', 'par', 'gradateur', 'gradateurs', 'pupitreur',
    'poursuite', 'dmx']],
  ['SON', ['son', 'sono', 'sonorisation', 'audio', 'micro', 'micros', 'enceinte', 'enceintes', 'diffusion', 'ampli', 'amplis']],
  ['STRUCTURE / ACCROCHE', ['structure', 'structures', 'accroche', 'accroches', 'pont', 'ponts', 'truss', 'moteur', 'moteurs', 'palan', 'palans',
    'elingue', 'elingues', 'rigging', 'praticable', 'praticables']],
  ['DÉCO / TAPISSERIE', ['deco', 'decoration', 'decor', 'tapisserie', 'moquette', 'rideau', 'rideaux', 'pendrillon', 'pendrillons', 'frise',
    'frises', 'habillage', 'mobilier', 'tissu']],
  ['ÉLECTRICITÉ', ['electricite', 'electrique', 'electriques', 'armoire', 'armoires', 'groupe electrogene', 'p17', 'energie']],
];

function domaineTexte(texte) {
  const m = ` ${mots(texte)} `;
  return MOTS_CLES.find(([, cles]) => cles.some((c) => m.includes(` ${c} `)))?.[0] ?? null;
}

// Poste → domaine par ses mots, AUTRE sinon (ROAD 4H, RESPONSABLE TECHNIQUE, TSL…).
export const domainePoste = (poste) => domaineTexte(poste) ?? 'AUTRE';

// Quantité telle que lue (« 64.0 », « 2,5 ») ; illisible : null.
export function lireQuantite(quantite) {
  if (typeof quantite === 'number') return Number.isFinite(quantite) ? quantite : null;
  const texte = String(quantite ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(texte) ? Number(texte) : null;
}

// Domaine d'une section par ses lignes (titre muet) : le plus fréquent, à égalité le premier rencontré.
function domaineDesLignes(lignes) {
  const compte = new Map();
  for (const l of lignes) {
    const d = l.dalle || l.processeur ? 'MUR LED' : domaineTexte(l.designation);
    if (d) compte.set(d, (compte.get(d) ?? 0) + 1);
  }
  let choisi = null;
  for (const [d, n] of compte) if (!choisi || n > compte.get(choisi)) choisi = d;
  return choisi;
}

// Sections du devis classées : domaine de la section par son titre, puis ses lignes ; chaque ligne avec sa
// quantité lue, sa dalle ou son processeur reconnus dans la base, et son domaine (MUR LED si reconnue, où qu'elle
// soit ; celui de la section sinon). `references` : choix de dalle retenus par la boîte (`parc.references`).
export function classerDevis(sections, { dalles = [], processeurs = [], references = {} } = {}) {
  return (sections ?? []).map((s) => {
    const lignes = (s.lignes ?? []).map((l) => {
      const dalle = reconnaitreDalle(l, dalles, { references });
      return {
        ref: l.ref ?? '', designation: l.designation ?? '', composant: Boolean(l.composant), quantite: lireQuantite(l.quantite),
        dalle: dalle.statut === 'aucune' ? null : dalle,
        processeur: dalle.statut === 'aucune' ? reconnaitreProcesseur(l, processeurs) : null,
      };
    });
    const domaine = domaineTexte(s.titre) ?? domaineDesLignes(lignes) ?? 'AUTRE';
    return { titre: s.titre ?? '', domaine, lignes: lignes.map((l) => ({ ...l, domaine: l.dalle || l.processeur ? 'MUR LED' : domaine })) };
  });
}

// Devis lié au poste : « Ton matériel » (sections du domaine du poste, et lignes de ce domaine prises dans les
// autres sections) puis « Le reste du devis ». Poste AUTRE ou inconnu : tout replié.
export function vueDevis(sections, postes) {
  const domaines = [...new Set((postes ?? []).map(domainePoste).filter((d) => d !== 'AUTRE'))];
  if (!domaines.length) return { domaines, titre: null, tonMateriel: [], reste: sections, toutReplie: true };
  const tonMateriel = [];
  const reste = [];
  for (const s of sections) {
    if (domaines.includes(s.domaine)) {
      tonMateriel.push(s);
      continue;
    }
    const miennes = s.lignes.filter((l) => domaines.includes(l.domaine));
    const autres = s.lignes.filter((l) => !domaines.includes(l.domaine));
    if (miennes.length) tonMateriel.push({ ...s, lignes: miennes });
    if (autres.length) reste.push({ ...s, lignes: autres });
  }
  return { domaines, titre: `Ton matériel : ${domaines.map((d) => LIBELLES_DOMAINE[d]).join(', ')}`, tonMateriel, reste, toutReplie: false };
}

// ---------------------------------------------------------------------------
// Dalles et processeurs reconnus dans la base
// ---------------------------------------------------------------------------

const nombreLu = (texte) => Number(texte.replace(',', '.'));

// Désignation de dalle : pitch (« Pitch 2.6mm », « P3,9 »), dimensions en mm, pixels. Rien de lu : null.
export function lireDesignation(designation) {
  const texte = String(designation ?? '');
  const pitch = texte.match(/(?:pitch\s*:?\s*|\bp\s?)(\d+(?:[.,]\d+)?)\s*(?:mm)?/i);
  const dims = texte.match(/(\d{2,4}(?:[.,]\d+)?)\s*[x×*]\s*(\d{2,4}(?:[.,]\d+)?)\s*mm/i);
  const px = texte.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})\s*(?:px|pixels?)\b/i);
  if (!pitch && !dims && !px) return null;
  return {
    pitchMm: pitch ? nombreLu(pitch[1]) : null,
    largeurMm: dims ? nombreLu(dims[1]) : null,
    hauteurMm: dims ? nombreLu(dims[2]) : null,
    pxH: px ? Number(px[1]) : null,
    pxV: px ? Number(px[2]) : null,
  };
}

const PITCH_TOLERANCE_MM = 0.05;
const pitchDe = (d) => d.pitchMm ?? (d.largeurMm && d.pxH ? d.largeurMm / d.pxH : null);
// Fiches utilisables : ni fiche d'information, ni fiche à compléter (dimensions et pixels).
const dalleUtilisable = (d) => d.statut !== 'information' && ['pxH', 'pxV', 'largeurMm', 'hauteurMm'].every((k) => d[k] > 0);
const nomsFiche = (f) => [f.modele, ...[].concat(f.alias ?? [])].filter(Boolean).map(compact);

// Ligne de devis → dalle de la base. Ordre : référence retenue par la boîte (`references[ref]`), puis référence
// égale au modèle ou à un alias, puis marque, pitch (à 0,05 mm), dimensions et pixels de la désignation. Une ligne de
// dalle entière écarte les demi-dalles ; une ligne qui ne trouve que des demi-dalles est une ligne de demi-dalle.
// Plusieurs fiches : « choix » (l'utilisateur tranche, retenu ensuite par la référence de la boîte).
export function reconnaitreDalle(ligne, dalles, { references = {} } = {}) {
  const valides = (dalles ?? []).filter(dalleUtilisable);
  const ref = String(ligne.ref ?? '').trim();
  const lue = lireDesignation(ligne.designation);
  const resultat = (statut, fiches, par) => ({
    statut, fiche: statut === 'reconnue' ? fiches[0].id : null, candidats: fiches.map((f) => f.id).sort(), demi: Boolean(fiches[0]?.demiDe), par, lue,
  });
  const retenue = ref && references?.[ref] ? valides.find((d) => d.id === references[ref]) : null;
  if (retenue) return resultat('reconnue', [retenue], 'parc');

  const designation = ` ${mots(ligne.designation)} `;
  const marqueLue = [...new Set(valides.map((d) => mots(d.marque)).filter(Boolean))].find((m) => designation.includes(` ${m} `)) ?? null;
  const correspond = (d) => (!marqueLue || mots(d.marque) === marqueLue) && (!lue || (
    (lue.pitchMm === null || Math.abs((pitchDe(d) ?? Infinity) - lue.pitchMm) < PITCH_TOLERANCE_MM)
    && (lue.largeurMm === null || (d.largeurMm === lue.largeurMm && d.hauteurMm === lue.hauteurMm))
    && (lue.pxH === null || (d.pxH === lue.pxH && d.pxV === lue.pxV))));
  const cle = compact(ref);
  const parReference = cle ? valides.filter((d) => nomsFiche(d).includes(cle)) : [];
  let trouvees;
  let par;
  if (parReference.length) [trouvees, par] = [parReference.filter(correspond), 'reference'];
  else if (lue) [trouvees, par] = [valides.filter(correspond), 'caracteristiques'];
  else trouvees = [];
  const entieres = trouvees.filter((d) => !d.demiDe);
  const fiches = entieres.length ? entieres : trouvees;
  if (!fiches.length) return { statut: 'aucune', fiche: null, candidats: [], demi: false, par: null, lue };
  return resultat(fiches.length === 1 ? 'reconnue' : 'choix', fiches, par);
}

// Ligne de devis → processeur de la base (complet, hors fiche d'information) : référence égale au modèle ou à un
// alias, sinon un mot de la désignation (3 caractères au moins). Aucun : null.
export function reconnaitreProcesseur(ligne, processeurs) {
  const utilisables = (processeurs ?? []).filter((p) => p.statut !== 'information' && champsManquants(p).length === 0);
  const cle = compact(ligne.ref);
  let trouve = cle ? utilisables.find((p) => nomsFiche(p).includes(cle)) : null;
  if (!trouve) {
    const jetons = new Set(String(ligne.designation ?? '').split(/\s+/).map(compact).filter((j) => j.length >= 3));
    trouve = utilisables.find((p) => nomsFiche(p).some((n) => jetons.has(n)));
  }
  return trouve?.id ?? null;
}

// ---------------------------------------------------------------------------
// Titres et configuration proposée
// ---------------------------------------------------------------------------

const NOMBRE = '(\\d+(?:[.,]\\d+)?)\\s*(cm|mm|m)?\\b';
const LARGEUR = new RegExp(`(?:^|[^a-z])l\\s*=\\s*${NOMBRE}`);
const HAUTEUR = new RegExp(`(?:^|[^a-z])ht?\\s*=\\s*${NOMBRE}`);
const MULTIPLE_AVANT = /(?:^|\s)(\d+)\s?x(?=\s|$)(?!\s*\d)/;
const MULTIPLE_APRES = /(?:^|\s)x\s?(\d+)(?=\s|$)/;

function metres(m) {
  if (!m) return null;
  const valeur = nombreLu(m[1]);
  const unite = m[2] ?? (valeur >= 100 ? 'cm' : 'm');
  return { cm: valeur / 100, mm: valeur / 1000, m: valeur }[unite];
}

// Dimensions d'un titre de section : « L=4m », « L=4,5m », « H= » ou « Ht= », en m ou en cm ; multiplicateur
// « 4x », « x4 » ou « 4 x ». Titre sans dimensions : largeur et hauteur null.
export function lireTitre(titre) {
  const t = sansAccents(titre);
  const multiple = t.match(MULTIPLE_AVANT) ?? t.match(MULTIPLE_APRES);
  return { largeurM: metres(t.match(LARGEUR)), hauteurM: metres(t.match(HAUTEUR)), multiplicateur: multiple ? Math.max(1, Number(multiple[1])) : 1 };
}

// Nom de mur : le titre sans ses dimensions ni son multiplicateur, coupé à 40 caractères numéro compris.
const NOM_MUR_MAX = 40;
function nomsMurs(titre, n) {
  const base = String(titre ?? '')
    .replace(/(?:^|\b)(?:L|Ht|H)\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m)?\b/gi, ' ')
    .replace(/(^|\s)\d+\s?x(?=\s|$)/gi, ' ')
    .replace(/(^|\s)x\s?\d+(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s/\-–,;:]+$/, '')
    .trim() || 'Mur';
  if (n === 1) return [base.slice(0, NOM_MUR_MAX).trim()];
  return Array.from({ length: n }, (_, i) => `${base.slice(0, NOM_MUR_MAX - ` ${i + 1}`.length).trim()} ${i + 1}`);
}

const somme = (lignes) => lignes.reduce((s, l) => s + (l.quantite ?? 0), 0);

// Configuration proposée pour une section classée (`classerDevis`) qui a des dalles : murs au format des saisies de
// l'onglet Mur (mode taille, largeur et hauteur du titre, dalle) ; c'est l'onglet Mur qui calcule colonnes, rangées,
// écart et variantes. Quantité contrôlée sans bloquer (spares, composants « * ») ; demi-dalles : leur fiche,
// « demi-dalles disponibles » coché, haut ou bas au choix. Section sans dalle entière : null.
export function configurationProposee(section, { dalles = [] } = {}) {
  const lignesDalle = (section?.lignes ?? []).filter((l) => l.dalle);
  const entieres = lignesDalle.filter((l) => !l.dalle.demi);
  if (!entieres.length) return null;
  const premiere = entieres[0].dalle;
  const dalle = premiere.statut === 'reconnue' ? premiere.fiche : null;
  const choixDalle = dalle ? [] : premiere.candidats;
  const cleDalle = (d) => d.fiche ?? d.candidats.join(' ');
  const memes = entieres.filter((l) => cleDalle(l.dalle) === cleDalle(premiere));
  const quantite = somme(memes);
  const demiLigne = lignesDalle.find((l) => l.dalle.demi && l.dalle.statut === 'reconnue');
  const demi = demiLigne?.dalle.fiche ?? null;
  const quantiteDemi = somme(lignesDalle.filter((l) => l.dalle.demi && l.dalle.fiche === demi));
  const { largeurM, hauteurM, multiplicateur: n } = lireTitre(section.titre);
  const alertes = memes.length < entieres.length ? ['Plusieurs dalles dans la section : la première est proposée.'] : [];
  const proposition = { dalle, choixDalle, demi, quantite, multiplicateur: n, largeurM, hauteurM };
  if (largeurM === null || hauteurM === null) {
    return { ...proposition, murs: [], formeAChoisir: true, choixPositionDemi: false, alertes: [...alertes, `Titre sans dimensions : ${virgule(quantite)} dalles, forme à choisir.`] };
  }
  if (n > 1 && quantite % n !== 0) alertes.push(`${virgule(quantite)} dalles ne se partagent pas en ${n} murs égaux.`);
  const fiche = dalle ? dalles.find((d) => d.id === dalle) : null;
  if (fiche) {
    const ficheDemi = demi ? dalles.find((d) => d.id === demi) ?? null : null;
    const calcul = dimensionner(fiche, { mode: 'taille', largeurMm: largeurM * 1000, hauteurMm: hauteurM * 1000 }, { demi: ficheDemi });
    const dims = `${virgule(largeurM)} × ${virgule(hauteurM)} m`;
    const demande = n > 1 ? `${n} murs de ${dims} en demandent` : `${dims} en demande`;
    if (calcul.mur) {
      const attendues = n * calcul.mur.dalles.entieres;
      if (quantite !== attendues) alertes.push(`Le devis prévoit ${virgule(quantite)} dalles ; ${demande} ${attendues} (spares possibles).`);
      const attenduesDemi = n * calcul.mur.dalles.demi;
      if (demi && quantiteDemi !== attenduesDemi) alertes.push(`Le devis prévoit ${virgule(quantiteDemi)} demi-dalles ; ${demande} ${attenduesDemi}.`);
    } else alertes.push(...calcul.erreurs);
  }
  const murs = nomsMurs(section.titre, n).map((nom) => ({
    nom,
    demi,
    formulaires: { 'form-mur': { mode: 'taille', largeurM: String(largeurM), hauteurM: String(hauteurM), dalle: dalle ?? '', demi: Boolean(demi) } },
  }));
  return { ...proposition, murs, formeAChoisir: false, choixPositionDemi: Boolean(demi), alertes };
}

// ---------------------------------------------------------------------------
// Processeurs au niveau de la presta
// ---------------------------------------------------------------------------

const texteListe = (liste) => liste.map((p) => `${virgule(p.nombre)} × ${p.modele}`).join(' + ');
function ajouter(compte, id, modele, nombre) {
  const p = compte.get(id) ?? { id, modele, nombre: 0 };
  p.nombre += nombre;
  compte.set(id, p);
}
const enListe = (compte) => [...compte.values()].sort((a, b) => comparerNoms(a.modele, b.modele));

// Processeurs du devis (lignes reconnues, toutes sections) face à la somme des processeurs conseillés pour les murs
// proposés (`evaluerToutesMarques` puis `processeurConseille`, boîtiers de secours compris). Mur sans dalle : hors
// du conseil, nommé dans `sansConseil`.
export function processeursPresta(sections, murs, { dalles = [], processeurs = [], reglages, quantites = null, bitsParFamille = {} } = {}) {
  const utilisables = processeurs.filter((p) => p.statut !== 'information' && champsManquants(p).length === 0);
  const devis = new Map();
  for (const s of sections) {
    for (const l of s.lignes) {
      if (l.processeur && l.quantite > 0) ajouter(devis, l.processeur, processeurs.find((p) => p.id === l.processeur)?.modele ?? l.ref, l.quantite);
    }
  }
  const conseil = new Map();
  const sansConseil = [];
  for (const m of murs) {
    const form = m.formulaires['form-mur'];
    const fiche = dalles.find((d) => d.id === form.dalle);
    const calcul = fiche && dimensionner(fiche, { mode: 'taille', largeurMm: Number(form.largeurM) * 1000, hauteurMm: Number(form.hauteurM) * 1000 },
      { demi: (m.demi && dalles.find((d) => d.id === m.demi)) || null });
    const choisi = calcul?.mur ? processeurConseille(evaluerToutesMarques(calcul.mur, fiche, utilisables, reglages, { bitsParFamille }), { quantites }) : null;
    if (choisi) ajouter(conseil, choisi.processeur.id, choisi.processeur.modele, choisi.nombre + (choisi.nombreSecours ?? 0));
    else sansConseil.push(m.nom);
  }
  const listeDevis = enListe(devis);
  const listeConseil = enListe(conseil);
  const identique = JSON.stringify(listeDevis) === JSON.stringify(listeConseil);
  const prevoit = listeDevis.length ? `Le devis prévoit ${texteListe(listeDevis)}` : 'Le devis ne prévoit aucun processeur';
  let texte;
  if (!listeConseil.length && sansConseil.length) texte = `${prevoit} ; l'appli ne conseille rien tant qu'une dalle reste à choisir.`;
  else if (identique) texte = `${prevoit} ; l'appli en conseille ${virgule(listeConseil.reduce((s, p) => s + p.nombre, 0))}.`;
  else texte = `${prevoit} ; l'appli conseille ${texteListe(listeConseil)}.`;
  if (listeConseil.length && sansConseil.length) texte += ` Hors du conseil : ${sansConseil.join(', ')}.`;
  return { devis: listeDevis, conseil: listeConseil, identique, alerte: !identique, sansConseil, texte };
}
