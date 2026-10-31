// Devis et poste lus dans Eventsoft (étape 25, lot 25b) : rapprochement avec le planning, domaines, dalles et
// processeurs reconnus dans la base, configuration proposée pour l'onglet Mur, processeurs comparés au niveau de la
// presta. Fonctions pures, hors du calcul du mur (spec de l'étape 25, § 5.5). Déchiffrement du devis envoyé par le robot (lot 25d, § 5.4).
// Lot 25e1 : lectures gardées sur l'appareil, fraîcheur, devis de chaque journée du planning.
// Lot 25e2 : titres sans « L= » (F12), murs sans forme, murs du devis pour toute la presta, « Ajouter au parc ».

import { dateParis } from './ics.js';
import { heure, jourMois } from './journees.js';
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
// soit ; celui de la section sinon). `references` : choix de dalle retenus par la boîte (`parc.references`) ; `membres`
// et `sansMembre` : dalles du parc de la boîte et références à rechoisir (lot 26c1).
export function classerDevis(sections, { dalles = [], processeurs = [], references = {}, membres = null, sansMembre = null } = {}) {
  return (sections ?? []).map((s) => {
    const lignes = (s.lignes ?? []).map((l) => {
      // Composant « * » (châssis, tile d'une dalle, devis réel du lot 25e3) : jamais une dalle ni un processeur.
      const composant = Boolean(l.composant);
      const dalle = composant ? { statut: 'aucune' } : reconnaitreDalle(l, dalles, { references, membres, sansMembre });
      return {
        ref: l.ref ?? '', designation: l.designation ?? '', composant, quantite: lireQuantite(l.quantite),
        dalle: dalle.statut === 'aucune' ? null : dalle,
        processeur: dalle.statut === 'aucune' && !composant ? reconnaitreProcesseur(l, processeurs) : null,
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
const decimales = (texte) => (String(texte).split(/[.,]/)[1] ?? '').length;
const lu = (texte) => ({ valeur: nombreLu(texte), decimales: decimales(texte) });

// Indices d'une désignation de dalle (lot 26c1, spec 26c § 4.2) : dimensions avec leur unité (mm, ou m : « [0.5mx0.5m] »,
// « 0,5 x 0,5 m »), pixels (« px » ou « pixels »), pitch écrit (« P2.6 », « Pitch 2,84 », « 2.6mm », de 0,5 à 16 mm,
// sans lettre après sauf « mm »), sinon pitch sans unité (« 2.8- », indice faible). Chaque valeur avec ses décimales
// écrites (tolérance selon la précision). Lus dans cet ordre, chaque morceau lu effacé avant le suivant.
const DIMS_MM = /(\d{2,4}(?:[.,]\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d{2,4}(?:[.,]\d+)?)\s*mm(?![a-z])/i;
const DIMS_M = /(\d+(?:[.,]\d+)?)\s*(?:m(?![a-wyz]))?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*m(?![a-z])/i;
const PIXELS = /(\d{2,4})\s*[x×*]\s*(\d{2,4})\s*(?:px|pixels?)\b/i;
const PITCH_ECRIT = /(?:pitch\s*:?\s*|(?:^|[^a-z0-9])p\s?|(?:^|[^a-z0-9.,]))(\d+(?:[.,]\d+)?)(\s*mm)?(?![a-z0-9])/gi;
const PITCH_SANS_UNITE = /(?:^|[^a-z0-9.,])(\d{1,2}[.,]\d+)(?![a-z0-9.,])/gi;
const PITCH_MIN_MM = 0.5;
const PITCH_MAX_MM = 16;
const pitchPlausible = (x) => x.valeur >= PITCH_MIN_MM && x.valeur <= PITCH_MAX_MM;
function lireIndices(designation) {
  let texte = ` ${sansAccents(designation)} `;
  const effacer = (m) => { texte = texte.replace(m[0], ' '); };
  const indices = { dims: null, px: null, pitch: null, pitchFaible: null };
  const mm = texte.match(DIMS_MM);
  const m = mm ? null : texte.match(DIMS_M);
  if (mm || m) {
    const [, a, b] = mm ?? m;
    indices.dims = { largeur: lu(a), hauteur: lu(b), facteur: mm ? 1 : 1000 };
    effacer(mm ?? m);
  }
  const px = texte.match(PIXELS);
  if (px) {
    indices.px = { pxH: Number(px[1]), pxV: Number(px[2]) };
    effacer(px);
  }
  // Pitch écrit : « P » ou « pitch » devant, ou « mm » derrière ; un nombre nu n'en est pas un.
  for (const p of texte.matchAll(PITCH_ECRIT)) {
    const avecP = /pitch|p\s?\d/i.test(p[0]);
    const x = lu(p[1]);
    if ((avecP || p[2]) && pitchPlausible(x)) {
      indices.pitch = x;
      effacer(p);
      break;
    }
  }
  if (!indices.pitch) {
    for (const p of texte.matchAll(PITCH_SANS_UNITE)) {
      const x = lu(p[1]);
      if (pitchPlausible(x)) {
        indices.pitchFaible = x;
        break;
      }
    }
  }
  return indices;
}

// Désignation de dalle : pitch (« Pitch 2.6mm », « P3,9 »), dimensions en mm (ou en m, lot 26c1), pixels. Rien de lu : null.
export function lireDesignation(designation) {
  const { dims, px, pitch } = lireIndices(designation);
  if (!pitch && !dims && !px) return null;
  return {
    pitchMm: pitch ? pitch.valeur : null,
    largeurMm: dims ? dims.largeur.valeur * dims.facteur : null,
    hauteurMm: dims ? dims.hauteur.valeur * dims.facteur : null,
    pxH: px ? px.pxH : null,
    pxV: px ? px.pxV : null,
  };
}

const EPSILON = 1e-9;
// Pitch selon la précision écrite (lot 26c1) : u = 10^−décimales, fiche dans [lu − max(½u ; 0,05) ; lu + max(u ; 0,05)[,
// par son pitch (nominal compris) ou son pitch réel (largeur / pxH).
const dansPitch = (valeur, x) => {
  const u = 10 ** -x.decimales;
  return valeur >= x.valeur - Math.max(u / 2, 0.05) - EPSILON && valeur < x.valeur + Math.max(u, 0.05) - EPSILON;
};
const pitchsDe = (d) => [d.pitchMm, d.largeurMm && d.pxH ? d.largeurMm / d.pxH : null].filter((p) => p > 0);
const pitchPasse = (d, x) => pitchsDe(d).some((p) => dansPitch(p, x));
// Dimensions à ± la moitié du dernier chiffre écrit (« 0,61 » m : ± 5 mm, la fiche à 609,6 mm passe).
const dimPasse = (valeur, x, facteur) => Math.abs(valeur - x.valeur * facteur) <= (10 ** -x.decimales / 2) * facteur + EPSILON;
const dimsPassent = (d, dims) => dimPasse(d.largeurMm, dims.largeur, dims.facteur) && dimPasse(d.hauteurMm, dims.hauteur, dims.facteur);
const pxPassent = (d, px) => d.pxH === px.pxH && d.pxV === px.pxV;
// Fiches utilisables : ni fiche d'information, ni fiche à compléter (dimensions et pixels).
const dalleUtilisable = (d) => d.statut !== 'information' && ['pxH', 'pxV', 'largeurMm', 'hauteurMm'].every((k) => d[k] > 0);
// Noms d'une fiche : modèle, alias, et modèle suivi de la version (« UPADIV2.6 » = Upad IV 2.6, lot 25e4).
const nomsFiche = (f) => [f.modele, ...[].concat(f.alias ?? []), f.modele && f.version ? `${f.modele} ${f.version}` : null].filter(Boolean).map(compact);
// Dalles : « MKII » s'écrit aussi « MK2 » (lot 26c1, choix de conception du projet).
const nomsDalle = (f) => nomsFiche(f).flatMap((n) => (n.includes('mkii') ? [n, n.replace('mkii', 'mk2')] : [n]));

// Lignes exclues d'office (lot 26c1, liste de l'utilisateur du 31/10/2026) : mots entiers, au singulier ou au pluriel.
const EXCLUSIONS_DALLE = ['flight', 'flightcase', 'case', 'bac', 'chassis', 'frame', 'tile', 'vierge', 'blank', 'bumper', 'cable', 'lest', 'echelle',
  'support', 'clamp', 'stacker', 'moniteur', 'lcd', 'telecommande'];
const exclue = (designation) => mots(designation).split(' ').some((m) => EXCLUSIONS_DALLE.some((e) => m === e || m === `${e}s` || m === `${e}x`));
// Gammes d'un seul mot courant : lues seulement avec leur marque.
const GAMMES_COURANTES = new Set(['compact', 'smart', 'armour', 'jet', 'diamond']);

// Gamme lue (mots entiers), la plus longue ; une gamme courante seulement avec la marque de ses fiches.
function gammeLue(designation, valides, marqueLue) {
  const lues = [...new Set(valides.map((d) => mots(d.gamme)).filter(Boolean))]
    .filter((g) => designation.includes(` ${g} `))
    .filter((g) => !GAMMES_COURANTES.has(g) || valides.some((d) => mots(d.gamme) === g && mots(d.marque) === marqueLue));
  return lues.sort((a, b) => b.length - a.length)[0] ?? null;
}

// Modèle lu : suites de 1 à 4 mots collés comparées aux noms des fiches, le plus long gagne ; un nom de moins de
// 3 caractères ou égal à la gamme (« Upad IV ») ne compte pas.
function modeleLu(designation, valides) {
  const jetons = String(designation ?? '').split(/[\s[\](),;/>]+/).map(compact).filter(Boolean);
  const suites = new Set();
  for (let i = 0; i < jetons.length; i += 1) {
    for (let n = 1; n <= 4 && i + n <= jetons.length; n += 1) suites.add(jetons.slice(i, i + n).join(''));
  }
  let meilleur = 0;
  let fiches = [];
  for (const d of valides) {
    const gamme = compact(d.gamme);
    const long = Math.max(0, ...nomsDalle(d).filter((n) => n.length >= 3 && n !== gamme && suites.has(n)).map((n) => n.length));
    if (!long) continue;
    if (long > meilleur) [meilleur, fiches] = [long, [d]];
    else if (long === meilleur) fiches.push(d);
  }
  return fiches;
}

const pitchFiche = (d) => d.pitchMm ?? Math.round((d.largeurMm / d.pxH) * 1000) / 1000;

// Ligne de devis → dalle de la base (lot 26c1, spec 26c § 4). Ordre : lignes exclues d'office (flight, châssis, tile,
// câble…), référence retenue par la boîte (`references[ref]`), puis candidates par la référence (modèle ou alias), sinon
// par le modèle lu dans la désignation, sinon toutes ; filtres : marque, pitch selon la précision écrite (alerte
// seulement avec une référence ou un modèle), dimensions, pixels, pitch sans unité (s'il laisse une fiche), gamme
// (ignorée si elle n'en laisse aucune). Une ligne de dalle entière écarte les demi-dalles ; une ligne qui ne trouve que
// des demi-dalles est une ligne de demi-dalle. Indices faibles seuls (pitch, dimensions ou gamme seuls) : rien.
// Plusieurs fiches et un indice fort : celles du parc de la boîte (`membres`), sauf pour une référence à rechoisir
// (`sansMembre`) ; une seule : reconnue (`par: 'membre'`), plusieurs : le choix réduit. Plusieurs fiches restantes :
// « choix » (l'utilisateur tranche, retenu ensuite par la référence de la boîte).
export function reconnaitreDalle(ligne, dalles, { references = {}, membres = null, sansMembre = null } = {}) {
  const valides = (dalles ?? []).filter(dalleUtilisable);
  const ref = String(ligne.ref ?? '').trim();
  const lue = lireDesignation(ligne.designation);
  const aucune = { statut: 'aucune', fiche: null, candidats: [], demi: false, par: null, lue };
  const resultat = (statut, fiches, par, alerte = null) => ({
    statut, fiche: statut === 'reconnue' ? fiches[0].id : null, candidats: fiches.map((f) => f.id).sort(), demi: Boolean(fiches[0]?.demiDe), par, lue,
    ...(alerte ? { alerte } : {}),
  });
  if (exclue(ligne.designation)) return aucune;
  const retenue = ref && references?.[ref] ? valides.find((d) => d.id === references[ref]) : null;
  if (retenue) return resultat('reconnue', [retenue], 'parc');

  const designation = ` ${mots(ligne.designation)} `;
  const indices = lireIndices(ligne.designation);
  const marqueLue = [...new Set(valides.map((d) => mots(d.marque)).filter(Boolean))].find((m) => designation.includes(` ${m} `)) ?? null;
  const cle = compact(ref);
  const parReference = cle ? valides.filter((d) => nomsDalle(d).includes(cle)) : [];
  const parModele = parReference.length ? [] : modeleLu(ligne.designation, valides);
  let par = 'caracteristiques';
  let trouvees = valides;
  if (parReference.length) [trouvees, par] = [parReference, 'reference'];
  else if (parModele.length) [trouvees, par] = [parModele, 'modele'];
  const nommee = par !== 'caracteristiques';
  if (marqueLue) trouvees = trouvees.filter((d) => mots(d.marque) === marqueLue);
  if (indices.pitch && !nommee) trouvees = trouvees.filter((d) => pitchPasse(d, indices.pitch));
  if (indices.dims) trouvees = trouvees.filter((d) => dimsPassent(d, indices.dims));
  if (indices.px) trouvees = trouvees.filter((d) => pxPassent(d, indices.px));
  if (indices.pitchFaible && !nommee) {
    const avecPitch = trouvees.filter((d) => pitchPasse(d, indices.pitchFaible));
    if (avecPitch.length) trouvees = avecPitch;
  }
  const gamme = gammeLue(designation, valides, marqueLue);
  const deLaGamme = gamme ? trouvees.filter((d) => `${mots(d.gamme)} `.startsWith(`${gamme} `)) : [];
  if (deLaGamme.length) trouvees = deLaGamme;
  const entieres = trouvees.filter((d) => !d.demiDe);
  let fiches = entieres.length ? entieres : trouvees;
  if (!fiches.length) return aucune;

  // Force des indices : référence ou modèle ; gamme et une caractéristique ; deux caractéristiques. Pixels seuls :
  // comme avant le lot 26c1, sans la fiche du parc ; le reste seul ne reconnaît rien.
  const caracteristiques = [indices.pitch, indices.dims, indices.px].filter(Boolean).length;
  const fort = nommee || (deLaGamme.length > 0 && caracteristiques >= 1) || caracteristiques >= 2;
  if (!fort && !(indices.px && caracteristiques === 1)) return aucune;
  if (fort && fiches.length > 1 && membres && !(sansMembre && new Set(sansMembre).has(ref))) {
    const duParc = new Set(membres);
    const membresDuParc = fiches.filter((d) => duParc.has(d.id) || (d.demiDe && duParc.has(d.demiDe)));
    if (membresDuParc.length === 1) return resultat('reconnue', membresDuParc, 'membre');
    if (membresDuParc.length > 1) fiches = membresDuParc;
  }
  // Pitch écrit hors tolérance d'une fiche nommée par sa référence ou son modèle : alerte, plus un filtre.
  const alerte = fiches.length === 1 && nommee && indices.pitch && !pitchPasse(fiches[0], indices.pitch)
    ? `Pitch lu ${virgule(indices.pitch.valeur)} mm, fiche à ${virgule(pitchFiche(fiches[0]))} mm : vérifie la dalle.` : null;
  return resultat(fiches.length === 1 ? 'reconnue' : 'choix', fiches, par, alerte);
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
// Titres sans « L= » (F12, lot 25e2) : « Installation de 6 totem », « 2 ECRANS » ; une dimension seule (« 4m »).
const MULTIPLE_NOM = /(?:^|\s)(\d+)\s+(?:totems?|ecrans?|murs?)\b/;
const DIMENSION_SEULE = new RegExp(`(?:^|\\s)${NOMBRE.replace('(cm|mm|m)?', '(cm|m)')}`, 'g');

function metres(m) {
  if (!m) return null;
  const valeur = nombreLu(m[1]);
  const unite = m[2] ?? (valeur >= 100 ? 'cm' : 'm');
  return { cm: valeur / 100, mm: valeur / 1000, m: valeur }[unite];
}

// Dimensions d'un titre de section : « L=4m », « L=4,5m », « H= » ou « Ht= », en m ou en cm ; multiplicateur
// « 4x », « x4 » ou « 4 x ». Titre sans dimensions : largeur et hauteur null. Titres sans « L= » (F12, lot 25e2) :
// crochets ignorés, « 6 totem » ou « 2 ECRANS » donnent le multiplicateur ; sans « L= » ni « H= », une dimension seule
// (« 4m ») est lue comme la hauteur, à confirmer (`hauteurAConfirmer`).
export function lireTitre(titre) {
  const t = sansAccents(titre).replace(/[[\]]/g, ' ');
  const multiple = t.match(MULTIPLE_AVANT) ?? t.match(MULTIPLE_APRES) ?? t.match(MULTIPLE_NOM);
  const lu = { largeurM: metres(t.match(LARGEUR)), hauteurM: metres(t.match(HAUTEUR)), multiplicateur: multiple ? Math.max(1, Number(multiple[1])) : 1 };
  if (lu.largeurM !== null || lu.hauteurM !== null) return lu;
  const seules = [...t.matchAll(DIMENSION_SEULE)];
  return seules.length === 1 ? { ...lu, hauteurM: metres(seules[0]), hauteurAConfirmer: true } : lu;
}

// Nom de mur : le titre sans ses dimensions, son multiplicateur, ses crochets ni « Installation de », première lettre
// en majuscule, coupé à 40 caractères numéro compris.
const NOM_MUR_MAX = 40;
function nomsMurs(titre, n) {
  const nettoye = String(titre ?? '')
    .replace(/[[\]]/g, ' ')
    .replace(/(?:^|\b)(?:L|Ht|H)\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|mm|m)?\b/gi, ' ')
    .replace(/(^|\s)\d+(?:[.,]\d+)?\s*(?:cm|m)(?=\s|$)/gi, ' ')
    .replace(/(^|\s)\d+\s?x(?=\s|$)/gi, ' ')
    .replace(/(^|\s)x\s?\d+(?=\s|$)/gi, ' ')
    .replace(/(^|\s)x(?=\s|$)/gi, ' ')
    .replace(/^\s*installation\s+d(?:e|es|u)\s+/i, ' ')
    .replace(/(^|\s)\d+\s+(?=(?:totems?|[ée]crans?|murs?)\b)/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s/\-–,;:]+$/, '')
    .trim();
  const base = nettoye ? nettoye[0].toUpperCase() + nettoye.slice(1) : 'Mur';
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
  // Première ligne reconnue de la section, la première à choisir seulement s'il n'y en a aucune (lot 26c1).
  const premiere = (entieres.find((l) => l.dalle.statut === 'reconnue') ?? entieres[0]).dalle;
  const dalle = premiere.statut === 'reconnue' ? premiere.fiche : null;
  const choixDalle = dalle ? [] : premiere.candidats;
  const cleDalle = (d) => d.fiche ?? d.candidats.join(' ');
  const memes = entieres.filter((l) => cleDalle(l.dalle) === cleDalle(premiere));
  const quantite = somme(memes);
  const demiLigne = lignesDalle.find((l) => l.dalle.demi && l.dalle.statut === 'reconnue');
  const demi = demiLigne?.dalle.fiche ?? null;
  const quantiteDemi = somme(lignesDalle.filter((l) => l.dalle.demi && l.dalle.fiche === demi));
  const { largeurM, hauteurM, multiplicateur: n, hauteurAConfirmer = false } = lireTitre(section.titre);
  const alertes = memes.length < entieres.length ? ['Plusieurs dalles dans la section : la première est proposée.'] : [];
  const proposition = { dalle, choixDalle, demi, quantite, multiplicateur: n, largeurM, hauteurM };
  if (n > 1 && quantite % n !== 0) alertes.push(`${virgule(quantite)} dalles ne se partagent pas en ${n} murs égaux.`);
  if (largeurM === null || hauteurM === null) {
    // Murs sans forme (lot 25e2) : leur dalle seule, la forme se choisit dans l'onglet Mur.
    const mursSansForme = nomsMurs(section.titre, n).map((nom) => ({ nom, demi, formulaires: { 'form-mur': { dalle: dalle ?? '', demi: Boolean(demi) } } }));
    const titre = hauteurAConfirmer ? `Hauteur lue dans le titre : ${virgule(hauteurM)} m, à confirmer ; largeur absente` : 'Titre sans dimensions';
    return { ...proposition, murs: [], mursSansForme, formeAChoisir: true, choixPositionDemi: false, alertes: [...alertes, `${titre} : ${virgule(quantite)} dalles, forme à choisir.`] };
  }
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
  return { ...proposition, murs, mursSansForme: [], formeAChoisir: false, choixPositionDemi: Boolean(demi), alertes };
}

// ---------------------------------------------------------------------------
// Montage du mur lu dans le devis (étape 26)
// ---------------------------------------------------------------------------

// Indices par mots entiers (libellé affiché, écritures sans accents, pluriels compris). « Accroche » seul et
// « échelle verticale » ne sont pas des indices ; « lest » seul l'est, une section de mur seule étant lue.
const INDICES_MONTAGE = {
  stack: [['support de sol', ['support de sol', 'supports de sol']], ['stacker', ['stacker', 'stackers']], ['base truss', ['base truss', 'bases truss']],
    ['base de sol', ['base de sol', 'bases de sol']], ['échelle de montage', ['echelle de montage', 'echelles de montage']],
    ['échelle de sol', ['echelle de sol', 'echelles de sol']], ['lest', ['lest', 'lests']]],
  accroche: [['bumper', ['bumper', 'bumpers']], ['barre d\'accroche', ['barre d accroche', 'barres d accroche']], ['flying bar', ['flying bar', 'flying bars']],
    ['hanging bar', ['hanging bar', 'hanging bars']], ['moteur', ['moteur', 'moteurs']], ['palan', ['palan', 'palans']],
    ['chain hoist', ['chain hoist', 'chain hoists']], ['élingue', ['elingue', 'elingues']], ['manille', ['manille', 'manilles']]],
};
// Indices d'un texte dans l'ordre où il les écrit (« Base truss 1m pour stacker » : base truss, puis stacker).
const indicesDe = (texte, sorte) => {
  const m = ` ${mots(texte)} `;
  return INDICES_MONTAGE[sorte]
    .map(([libelle, ecritures]) => [libelle, Math.min(...ecritures.map((e) => m.indexOf(` ${e} `)).filter((i) => i >= 0))])
    .filter(([, i]) => Number.isFinite(i)).sort((a, b) => a[1] - b[1]).map(([libelle]) => libelle);
};

// Montage d'une section classée (`classerDevis`) d'un mur : stack si elle n'a que des indices de stack, accroche
// si elle n'a que des indices d'accroche, « a-confirmer » sinon. Désignation et référence lues séparément (une
// référence collée ne compte pas), lignes « * » comprises, ligne de quantité 0 ignorée ; « au sol » dans le titre.
export function montageDevis(section) {
  const indices = { stack: [], accroche: [] };
  const lignes = [];
  const noter = (sorte, libelles) => libelles.forEach((l) => indices[sorte].includes(l) || indices[sorte].push(l));
  for (const l of section?.lignes ?? []) {
    if (l.quantite === 0) continue;
    let trouve = false;
    for (const sorte of ['stack', 'accroche']) {
      const libelles = [...indicesDe(l.designation, sorte), ...indicesDe(l.ref, sorte)];
      noter(sorte, libelles);
      trouve ||= libelles.length > 0;
    }
    if (trouve) lignes.push({ ref: l.ref, designation: l.designation });
  }
  if (` ${mots(section?.titre)} `.includes(' au sol ')) noter('stack', ['titre : au sol']);
  const montage = indices.stack.length && !indices.accroche.length ? 'stack' : (indices.accroche.length && !indices.stack.length ? 'accroche' : 'a-confirmer');
  return { montage, indices, lignes };
}

// Lignes « Montage lu dans le devis » de la carte (lot 26b), une par section de mur (`mursDuDevis.montages`) ; les deux
// sortes d'indices : en alerte. `prepares` : murs déjà préparés (presta liée), dont Poids n'est pas relu.
export function lignesMontage(montages, { prepares = [] } = {}) {
  const deja = new Set(prepares);
  return montages.map(({ titre, murs, montage, indices }) => {
    const mixte = indices.stack.length > 0 && indices.accroche.length > 0;
    let texte = `${titre || 'Sans titre'} : `;
    if (montage === 'a-confirmer') texte += `montage à confirmer dans Poids${mixte ? ` (stack : ${indices.stack.join(', ')} ; accroche : ${indices.accroche.join(', ')})` : ''}`;
    else texte += `${montage} (${indices[montage].join(', ')})`;
    if (montage !== 'a-confirmer' && murs.length && murs.every((n) => deja.has(n))) texte += murs.length > 1 ? ' ; murs déjà préparés, vérifie Poids' : ' ; mur déjà préparé, vérifie Poids';
    return { texte: `${texte}.`, alerte: mixte };
  });
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
  // Mur sans forme (titre sans dimensions, lot 25e2) : hors du conseil comme un mur dont la dalle reste à choisir.
  let sansForme = false;
  for (const m of murs) {
    const form = m.formulaires['form-mur'];
    const fiche = form.mode === 'taille' ? dalles.find((d) => d.id === form.dalle) : null;
    if (form.mode !== 'taille') sansForme = true;
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
  if (!listeConseil.length && sansConseil.length) texte = `${prevoit} ; l'appli ne conseille rien tant qu'une dalle${sansForme ? ' ou une forme' : ''} reste à choisir.`;
  else if (identique) texte = `${prevoit} ; l'appli en conseille ${virgule(listeConseil.reduce((s, p) => s + p.nombre, 0))}.`;
  else texte = `${prevoit} ; l'appli conseille ${texteListe(listeConseil)}.`;
  if (listeConseil.length && sansConseil.length) texte += ` Hors du conseil : ${sansConseil.join(', ')}.`;
  return { devis: listeDevis, conseil: listeConseil, identique, alerte: !identique, sansConseil, texte };
}

// ---------------------------------------------------------------------------
// Murs du devis et parc de la boîte (lot 25e2)
// ---------------------------------------------------------------------------

const membresDe = (parc, type) => new Set((parc?.membres ?? []).filter((m) => m.type === type).map((m) => m.id));
// Reconnaissance dans le parc de la boîte : ses références retenues, ses dalles (lot 26c1), les références à rechoisir.
const optionsParc = (parc, sansMembre) => ({ references: parc?.references ?? {}, membres: parc ? membresDe(parc, 'dalle') : null, sansMembre });
const nomFiche = (f) => [f.marque, f.modele, f.version, f.variante].filter(Boolean).join(' ') || f.id;
// Fiche proposée (dalle à choisir, « Ajouter au parc ») : nom avec la version, poids et puissance max retenus pour
// départager des fiches voisines (lot 25e4) ; sans l'un ni l'autre, pas de détail.
const ficheProposee = (id, fiches) => {
  const f = fiches.find((x) => x.id === id) ?? { id };
  const detail = [f.poidsKg > 0 ? `${virgule(f.poidsKg)} kg` : null, f.pMaxW > 0 ? `${virgule(f.pMaxW)} W max` : null].filter(Boolean).join(', ');
  return { id, nom: nomFiche(f), detail: detail || null };
};

// Murs proposés pour toute une presta du devis (`configurationProposee` de chaque section, murs sans forme compris),
// résumé et alertes de chaque mur, montage de chaque section (`montages`, étape 26), processeurs comparés au niveau de la presta (`processeursPresta`) dans le parc de la
// boîte : ses processeurs (tous s'il n'en a aucun), ses références de dalles, ses dalles (fiche du parc, lot 26c1,
// sauf pour les références de `sansMembre`). Devis refusé au compte, sans mur LED ni processeur : null. `quantites` et
// `bitsParFamille` : ceux du parc.
export function mursDuDevis(presta, base, { parc = null, quantites = null, bitsParFamille = {}, sansMembre = [] } = {}) {
  if (!presta || presta.devisNonAutorise || !presta.sections?.length) return null;
  const dalles = base?.dalles ?? [];
  const tous = base?.processeurs ?? [];
  const classe = classerDevis(presta.sections, { dalles, processeurs: tous, ...optionsParc(parc, sansMembre) });
  const murs = [];
  const resume = [];
  const alertes = [];
  const aChoisir = [];
  const montages = [];
  // Processeur du devis repris dans Data (lot 25e3) : celui de la section du mur (un seul modèle), sinon le seul modèle
  // du devis ; aucun ou plusieurs : le conseil de l'appli.
  const modeles = (lignes) => [...new Set(lignes.filter((l) => l.processeur).map((l) => l.processeur))];
  const duDevis = modeles(classe.flatMap((s) => s.lignes));
  const formData = (id) => {
    const fiche = id ? tous.find((p) => p.id === id) : null;
    return fiche ? { 'form-data': { famille: fiche.famille, processeur: fiche.id } } : {};
  };
  for (const s of classe) {
    const c = configurationProposee(s, { dalles });
    if (!c) continue;
    const section = modeles(s.lignes);
    const processeur = section.length === 1 ? section[0] : (section.length === 0 && duDevis.length === 1 ? duDevis[0] : null);
    const forme = c.formeAChoisir ? 'forme à choisir' : `${virgule(c.largeurM)} × ${virgule(c.hauteurM)} m${c.dalle ? '' : ', dalle à choisir'}`;
    // Montage lu dans la section (étape 26) : réglé dans Poids pour stack ou accroche, rien à confirmer.
    const { montage, indices } = montageDevis(s);
    const formPoids = montage === 'a-confirmer' ? {} : { 'form-poids': { mode: montage } };
    const deLaSection = [...c.murs, ...c.mursSansForme];
    for (const m of deLaSection) {
      murs.push({ ...m, formulaires: { ...m.formulaires, ...formData(processeur), ...formPoids } });
      resume.push(`${m.nom} : ${forme}`);
    }
    montages.push({ titre: s.titre, murs: deLaSection.map((m) => m.nom), montage, indices });
    const titre = s.titre || 'Sans titre';
    if (!c.dalle && c.choixDalle.length) {
      alertes.push(`${titre} : Dalle à choisir parmi ${c.choixDalle.length} fiches : choisis-la ci-dessous.`);
      const l = s.lignes.find((x) => x.dalle?.statut === 'choix' && !x.dalle.demi);
      if (l?.ref && !aChoisir.some((a) => a.ref === l.ref)) {
        aChoisir.push({ ref: l.ref, designation: l.designation, candidats: c.choixDalle.map((id) => ficheProposee(id, dalles)) });
      }
    }
    alertes.push(...c.alertes.map((a) => `${titre} : ${a}`));
    // Pitch du devis différent de la fiche nommée par sa référence ou son modèle (lot 26c1).
    for (const l of s.lignes) if (l.dalle?.alerte) alertes.push(`${titre} : ${l.ref || 'sans référence'} : ${l.dalle.alerte}`);
  }
  const avecProcesseur = classe.some((s) => s.lignes.some((l) => l.processeur));
  if (!murs.length && !avecProcesseur) return null;
  // Dalles retenues par le parc de la boîte (`parc.references`), une fois par référence : « Changer » sur la carte (lot 25e4).
  const retenues = [];
  // Dalles prises par le parc, seule fiche candidate qui en est membre (lot 26c1) : « Changer » la remet à choisir.
  const parMembre = [];
  for (const l of classe.flatMap((s) => s.lignes)) {
    const liste = { parc: retenues, membre: parMembre }[l.dalle?.par];
    if (liste && !liste.some((r) => r.ref === l.ref)) liste.push({ ref: l.ref, designation: l.designation, ...ficheProposee(l.dalle.fiche, dalles) });
  }
  const duParc = membresDe(parc, 'processeur');
  const processeurs = duParc.size ? tous.filter((p) => duParc.has(p.id)) : tous;
  // Prêts : chaque mur a sa dalle (une dalle à choisir se choisit d'abord sur la carte, retenue par le parc).
  const pret = murs.length > 0 && murs.every((m) => m.formulaires['form-mur'].dalle);
  return { murs, resume, alertes, aChoisir, retenues, parMembre, pret, montages, processeurs: processeursPresta(classe, murs, { dalles, processeurs, reglages: { frequenceHz: 60, bits: 8 }, quantites, bitsParFamille }) };
}

// « Ajouter au parc » : dalles (demi-dalles comprises) et processeurs reconnus dans le devis qui manquent au parc de la
// boîte, et dalles à choisir parmi plusieurs fiches (référence retenue ensuite par le parc). Jamais de quantité : le
// « Nombre dans le parc » ne vient pas d'un devis. Rien à ajouter : null.
export function ajoutsParc(presta, base, parc, { sansMembre = [] } = {}) {
  if (!presta || presta.devisNonAutorise || !parc) return null;
  const dalles = base?.dalles ?? [];
  const processeurs = base?.processeurs ?? [];
  const classe = classerDevis(presta.sections ?? [], { dalles, processeurs, ...optionsParc(parc, sansMembre) });
  const dansParc = { dalle: membresDe(parc, 'dalle'), processeur: membresDe(parc, 'processeur') };
  const ajout = { dalles: [], processeurs: [], aChoisir: [] };
  const vus = new Set();
  const proposer = (type, liste, id, fiches) => {
    if (dansParc[type].has(id) || vus.has(`${type}:${id}`)) return;
    vus.add(`${type}:${id}`);
    liste.push(type === 'dalle' ? ficheProposee(id, fiches) : { id, nom: nomFiche(fiches.find((x) => x.id === id) ?? { id }) });
  };
  for (const l of classe.flatMap((s) => s.lignes)) {
    if (l.dalle?.statut === 'reconnue') proposer('dalle', ajout.dalles, l.dalle.fiche, dalles);
    else if (l.dalle?.statut === 'choix' && l.ref && !vus.has(`ref:${l.ref}`)) {
      vus.add(`ref:${l.ref}`);
      ajout.aChoisir.push({ ref: l.ref, designation: l.designation, candidats: l.dalle.candidats.map((id) => ficheProposee(id, dalles)) });
    } else if (l.processeur) proposer('processeur', ajout.processeurs, l.processeur, processeurs);
  }
  return ajout.dalles.length || ajout.processeurs.length || ajout.aChoisir.length ? ajout : null;
}

// ---------------------------------------------------------------------------
// Déchiffrement du devis envoyé par le robot (lot 25d, spec § 5.4)
// ---------------------------------------------------------------------------

// Enveloppe { v: 1, iv, chiffre, mac } en base64 ; clés dérivées de la clé maîtresse par HKDF-SHA-256 (sel vide) ;
// HMAC-SHA-256 de l'octet de version + IV + chiffré vérifié avant de déchiffrer (AES-256-CBC, PKCS#7). Renvoie
// { ok: true, devis } ou { ok: false, code, erreur } ; jamais la clé dans une erreur.
const ETIQUETTES_DEVIS = { enc: 'mur-led devis enc', mac: 'mur-led devis mac' };
const VERSION_ENVELOPPE = 1;
const VERSION_DEVIS = 1;
const DATE_LECTURE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const ERREURS_DEVIS = {
  cle: 'Clé du devis illisible : colle la clé entière (64 caractères, chiffres et lettres de a à f).',
  format: 'Devis reçu illisible : ce n\'est pas un envoi du robot.',
  version: 'Devis envoyé par une version du robot que l\'appli ne connaît pas : mets l\'appli à jour.',
  mac: 'Devis refusé : il n\'a pas été chiffré avec ta clé, ou il a été modifié en route.',
  contenu: 'Devis déchiffré mais illisible : relance le robot.',
  rejeu: 'Devis refusé : il est plus ancien que le dernier devis reçu.',
};
const refusDevis = (code) => ({ ok: false, code, erreur: ERREURS_DEVIS[code] });

function base64(texte) {
  if (typeof texte !== 'string' || texte.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texte)) return null;
  try {
    return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function clesDevis(maitresse) {
  const { subtle } = globalThis.crypto;
  const base = await subtle.importKey('raw', maitresse, 'HKDF', false, ['deriveBits']);
  const deriver = (etiquette) => subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(etiquette) }, base, 256);
  const [enc, mac] = await Promise.all([deriver(ETIQUETTES_DEVIS.enc), deriver(ETIQUETTES_DEVIS.mac)]);
  return {
    enc: await subtle.importKey('raw', enc, 'AES-CBC', false, ['decrypt']),
    mac: await subtle.importKey('raw', mac, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']),
  };
}

export async function dechiffrerDevis(enveloppe, cleHex, { dernierLueLe = null } = {}) {
  const cle = String(cleHex ?? '').trim();
  if (!/^[0-9a-f]{64}$/i.test(cle)) return refusDevis('cle');
  let env = enveloppe;
  if (typeof env === 'string') {
    try {
      env = JSON.parse(env);
    } catch {
      return refusDevis('format');
    }
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) return refusDevis('format');
  const [iv, chiffre, mac] = [env.iv, env.chiffre, env.mac].map(base64);
  if (!iv || !chiffre || !mac || iv.length !== 16 || mac.length !== 32 || chiffre.length === 0 || chiffre.length % 16 !== 0) return refusDevis('format');
  if (env.v !== VERSION_ENVELOPPE) return refusDevis('version');
  const { subtle } = globalThis.crypto;
  const cles = await clesDevis(Uint8Array.from(cle.match(/../g), (x) => parseInt(x, 16)));
  const signe = new Uint8Array(1 + iv.length + chiffre.length);
  signe.set([env.v]);
  signe.set(iv, 1);
  signe.set(chiffre, 1 + iv.length);
  if (!(await subtle.verify('HMAC', cles.mac, mac, signe))) return refusDevis('mac');
  let devis;
  try {
    devis = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await subtle.decrypt({ name: 'AES-CBC', iv }, cles.enc, chiffre)));
  } catch {
    return refusDevis('contenu');
  }
  if (!devis || typeof devis !== 'object' || Array.isArray(devis)) return refusDevis('contenu');
  if (devis.version !== VERSION_DEVIS) return refusDevis('version');
  if (typeof devis.lueLe !== 'string' || !DATE_LECTURE.test(devis.lueLe) || !Array.isArray(devis.boites)) return refusDevis('contenu');
  if (dernierLueLe && Date.parse(devis.lueLe) < Date.parse(dernierLueLe)) return refusDevis('rejeu');
  return { ok: true, devis };
}

// ---------------------------------------------------------------------------
// Lectures gardées sur l'appareil (lot 25e1, spec § 5.5)
// ---------------------------------------------------------------------------

// Garde (clé CLE_DEVIS) : { lueLe (dernière lecture acceptée, contre le rejeu), recu, vu (onglet ouvert), choix
// (« boîte|idEventsoft » → presta du planning choisie), boites: { id: { erreur, lueLe, prestas: { idEventsoft: presta } } } }.
const gardeVide = () => ({ lueLe: null, recu: null, vu: null, choix: {}, boites: {} });
const memes = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const prestaLue = (p, lueLe) => ({
  idEventsoft: String(p.idEventsoft), nom: String(p.nom ?? ''), debut: String(p.debut ?? ''), fin: String(p.fin ?? ''),
  postes: Array.isArray(p.postes) ? p.postes : [], sections: Array.isArray(p.sections) ? p.sections : [],
  devisNonAutorise: p.devisNonAutorise === true, empreintes: p.empreintes ?? null, lueLe, change: null,
});

// Marque d'une presta relue : poste ou devis changé depuis la lecture gardée (une presta reprise d'un export n'a pas
// d'empreinte : rien à comparer). Une marque pas encore vue s'ajoute à la nouvelle.
function marque(vieille, neuve, recu, vu) {
  const avant = vieille?.change ?? null;
  if (!vieille || vieille.importee) return avant;
  const postes = !memes(vieille.postes, neuve.postes);
  const devis = !memes(vieille.empreintes?.devis, neuve.empreintes?.devis);
  if (!postes && !devis) return avant;
  const enAttente = avant && (vu === null || avant.le > vu) ? avant : null;
  return {
    le: recu,
    postes: postes || Boolean(enAttente?.postes),
    devis: devis || Boolean(enAttente?.devis),
    anciensPostes: enAttente?.postes ? enAttente.anciensPostes : (postes ? vieille.postes : null),
  };
}

// Lecture déchiffrée acceptée (`dechiffrerDevis`) ajoutée à la garde. Boîte en erreur : ses prestas et sa dernière
// lecture gardées. Presta absente d'une lecture (passée, hors de la fenêtre du robot) : gardée.
export function garderDevis(garde, devis, recu) {
  const avant = { ...gardeVide(), ...(garde ?? {}) };
  const boites = { ...avant.boites };
  for (const b of devis?.boites ?? []) {
    if (typeof b?.id !== 'string') continue;
    const ancienne = boites[b.id] ?? { erreur: null, lueLe: null, prestas: {} };
    if (b.erreur) {
      boites[b.id] = { ...ancienne, erreur: String(b.erreur) };
      continue;
    }
    const prestas = { ...ancienne.prestas };
    for (const p of b.prestas ?? []) {
      if (!p?.idEventsoft) continue;
      const neuve = prestaLue(p, devis.lueLe);
      prestas[neuve.idEventsoft] = { ...neuve, change: marque(prestas[neuve.idEventsoft], neuve, recu, avant.vu) };
    }
    boites[b.id] = { erreur: null, lueLe: devis.lueLe, prestas };
  }
  return { ...avant, lueLe: devis.lueLe, recu, boites };
}

// Presta du planning choisie pour un devis qui en touche deux (rapprochement « à choisir »).
export const choisirPresta = (garde, boite, idEventsoft, presta) => ({ ...gardeVide(), ...garde, choix: { ...(garde?.choix ?? {}), [`${boite}|${idEventsoft}`]: presta } });

// Onglet ouvert : les marques « Modifié » sont vues.
export const devisVu = (garde, maintenant) => (garde ? { ...garde, vu: maintenant } : garde);

// Erreurs du robot (§ 5.2), par code.
const ERREURS_ROBOT = {
  captcha: 'captcha demandé, le robot s\'est arrêté',
  'connexion-refusee': 'connexion refusée',
  pause: 'en pause après 2 refus de connexion : vérifie le mot de passe, puis relance le robot sur le Mac',
  'page-inconnue': 'page inconnue, le robot s\'est arrêté',
  reseau: 'Eventsoft injoignable',
  trousseau: 'mot de passe absent du Trousseau du Mac',
};
export const FRAICHEUR_DEVIS = 36 * 3600000;
const leA = (ms) => `${jourMois(dateParis(ms))} à ${heure(ms)}`;

// Fraîcheur : « Devis lus le 31/10 à 8 h », alerte au-delà de 36 h (Mac éteint ou envoi raté), erreur de chaque boîte.
export function fraicheurDevis(garde, reglages, maintenant) {
  if (!garde?.lueLe) return { texte: null, alerte: null, erreurs: [] };
  const lu = Date.parse(garde.lueLe);
  const nom = (id) => {
    const b = (reglages?.boites ?? []).find((x) => x.id === id);
    return b?.affichage || b?.nom || id;
  };
  const erreurs = Object.entries(garde.boites ?? {}).filter(([, b]) => b.erreur).map(([id, b]) => {
    const gardes = b.lueLe && Object.keys(b.prestas ?? {}).length ? `devis du ${leA(Date.parse(b.lueLe))} gardés` : 'aucun devis gardé';
    return { boite: id, texte: `${nom(id)} : devis non lus (${ERREURS_ROBOT[b.erreur] ?? 'erreur du robot'}), ${gardes}` };
  });
  return {
    texte: `Devis lus le ${leA(lu)}`,
    alerte: maintenant - lu > FRAICHEUR_DEVIS ? 'Devis lus il y a plus de 36 h : Mac éteint ou envoi raté ? Les devis gardés restent affichés.' : null,
    erreurs,
  };
}

// Devis de chaque phase du planning (`phasesActives`), par uid : la presta rapprochée, ou la question quand le devis
// touche deux prestas (une par candidate, tant que l'utilisateur n'a pas choisi).
export function liensDevis(garde, phases) {
  const liens = new Map();
  for (const [boite, b] of Object.entries(garde?.boites ?? {})) {
    for (const presta of Object.values(b.prestas ?? {})) {
      const r = rapprocher(presta, phases, { boite, choix: garde.choix?.[`${boite}|${presta.idEventsoft}`] ?? null });
      if (r.statut === 'liee') r.phases.forEach((uid) => liens.set(uid, { boite, presta }));
      if (r.statut !== 'a-choisir') continue;
      const question = { boite, idEventsoft: presta.idEventsoft, nomDevis: presta.nom };
      for (const nom of r.candidates) {
        for (const uid of rapprocher(presta, phases, { boite, choix: nom }).phases) if (!liens.has(uid)) liens.set(uid, { aChoisir: question });
      }
    }
  }
  return liens;
}

// Devis d'une journée (`date` « AAAA-MM-JJ ») : postes du jour, marques pas encore vues, devis lié au poste (sections
// classées, lignes avec leur quantité à afficher) ; devis refusé au compte : poste seul. `base` : { dalles, processeurs }.
export function devisDeJournee(lien, date, garde, base = null) {
  if (!lien) return null;
  if (lien.aChoisir) return { aChoisir: lien.aChoisir, postes: null, posteModifie: false, ancienPoste: null, devisModifie: false, nonAutorise: false, vue: null };
  const p = lien.presta;
  const postes = postesDuJour(p.postes, date);
  const vu = garde?.vu ?? null;
  const change = p.change && (vu === null || p.change.le > vu) ? p.change : null;
  const sections = classerDevis(p.sections, base ?? {})
    .map((s) => ({ ...s, lignes: s.lignes.map((l) => ({ ...l, quantiteTexte: l.quantite === null ? '' : virgule(l.quantite) })) }));
  return {
    boite: lien.boite, idEventsoft: p.idEventsoft, nom: p.nom, aChoisir: null,
    postes: textePostes(postes) || null,
    posteModifie: Boolean(change?.postes),
    ancienPoste: change?.postes ? textePostes(postesDuJour(change.anciensPostes, date)) || null : null,
    devisModifie: Boolean(change?.devis),
    nonAutorise: p.devisNonAutorise,
    vue: p.devisNonAutorise ? null : vueDevis(sections, postes),
  };
}

// Texte « Copier pour Intermittent » avec le poste du jour en dernière ligne (le texte de l'étape 23 ne change pas).
export const avecPoste = (texte, postes) => (postes ? `${texte}\nPoste : ${postes}` : texte);
