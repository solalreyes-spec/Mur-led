// Mode presta sur le terrain (étape 27, spec de l'étape) : check-list de mise en service d'un mur.
// Fonctions pures, hors de src/calculs/ (ce n'est pas un calcul du mur), sans accès à l'écran ni au stockage.
//
// Aucun contenu technique nouveau (spec § 3) : chaque ligne est un renvoi vers un texte sourcé qui existe déjà (lu à
// l'exécution par son identifiant : Dépannage, procédures du cahier des charges transcrites dans
// data/mise-en-service.json, rappels de rappels.js), une valeur calculée du mur (passée en entrée), ou une note de
// l'appli. `donnees` : { depannage, miseEnService }, les deux fichiers de data/.
//
// Entrées d'un mur (`entrees`), toutes calculées par les onglets :
//   marque ('brompton', 'novastar', 'coex', sinon une autre marque), nomMarque (« Colorlight »), logiciel (« NovaLCT »,
//   « VMP », « Tessera », « LEDVISION » ou null), parc { id, nom } ou null, processeur { id, nom, nombre, secours }
//   (secours : boîtiers de secours d'un secours par un second processeur, 0 sinon), redondance, reseau
//   { frequenceHz, bits, origine } (Brompton), avantDePartir (`avantDePartir` de fiches.js) ou null, montage
//   { data, elec } chacun { faites, total, texte } (`texteEtatMontage`) ou null, novalct { faites, total } ou null,
//   elec { arrivees [{ type, intensiteA }], lignes [{ numero, phase }], alerteAppel }, ports { principaux, secours },
//   canvas { source { largeurPx, hauteurPx, frequenceHz }, blocs [{ numero, xSource, ySource }], alertes },
//   fiches [{ id, nom, pixelsLargeur, pixelsHauteur, source, lots { nombre, retenus, aPreciser } ou null,
//   config { lignes, ids } }], ajouts [{ id, texte }], nonValides (onglets au calcul non valide : 'data', 'elec',
//   'canvas').

import { ErreurSaisie } from './calculs.js';
import { RAPPELS, SOURCES_RAPPELS } from './rappels.js';
import { texteLotsMelanges, logicielDuProcesseur, idConfig, MARQUES_FAMILLE } from './fiches.js';
import { nombre, nombreCourt, sourceCourte, texteDates, jourTexte, jourIso, nomSimple } from './format.js';
import { ligneSimple } from './resumes.js';

// Les douze étapes, toujours présentes et dans cet ordre pour toutes les marques (spec § 4.1) ; `onglet` : celui dont
// les valeurs viennent (calcul non valide : valeurs remplacées, case sans rapprochement).
export const ETAPES = [
  { id: 'depot', titre: 'Au dépôt', onglet: 'data' },
  { id: 'arrivee', titre: 'Arrivée électrique', onglet: 'elec' },
  { id: 'cablage-data', titre: 'Câblage data', onglet: 'data', calculee: true },
  { id: 'cablage-elec', titre: 'Câblage élec', onglet: 'elec', calculee: true },
  { id: 'tension', titre: 'Mise sous tension', onglet: 'elec' },
  { id: 'processeur', titre: 'Processeur et logiciel', onglet: 'data' },
  { id: 'config', titre: 'Config des dalles', onglet: 'data' },
  { id: 'ports', titre: 'Test des ports', onglet: 'data' },
  { id: 'mire', titre: 'Mire', onglet: null },
  { id: 'mapping', titre: 'Mapping et source', onglet: 'canvas' },
  { id: 'calibration', titre: 'Calibration et couleurs', onglet: null },
  { id: 'sauvegarde', titre: 'Sauvegarde', onglet: null },
];

// Mes étapes (spec § 4.6) : texte de 1 à 80 caractères, 20 au plus par mur. Carnet de pannes (§ 5.1) : 200 pannes au plus
// par mur, n° de série de 30 caractères au plus ; textes copiés (dalle, fiche, port, ligne, lot) bornés pour l'import.
export const LIMITES_TERRAIN = { texteAjout: 80, ajouts: 20, pannes: 200, serie: 30, texteCopie: 160 };
const PREFIXE_AJOUT = 'ajout-';

// Tous les renvois de la check-list (test D71 : chacun existe dans les données). « dep:T9.2:1 » : les lignes du numéro 1
// du nœud T9.2 du Dépannage ; « dep:T9:avertissement » ; « ms:ns:4 » : la ligne 4 de la procédure Novastar (toutes les
// lignes de ce numéro) ; « rappel:N7 ».
const procedure = (p, numeros) => numeros.map((n) => `ms:${p}:${n}`);
export const RENVOIS = [
  'dep:T9:avertissement', 'dep:T9.2:1', 'dep:T9.2:2', 'dep:T2.2:2', 'dep:T8.2:1', 'dep:T5.3:1',
  ...procedure('ns', ['1', '2', '3', '4', '5', '6', '7', 'c1', 'c2', 'c3']),
  ...procedure('br', ['1', '2', '3', '4', '5', '6', '7']),
  'rappel:N7', 'rappel:B4', 'rappel:C1', 'rappel:C2', 'rappel:C3', 'rappel:C4',
];
const CONNUS = new Set(RENVOIS);

const SOURCE_APPLI = 'Calcul de l\'appli';
const SOURCE_PARC = 'Calcul de l\'appli d\'après le parc';
const SOURCE_NOTE = 'Choix de conception du projet';
const NON_VALIDE = 'calcul non valide, corrige ce mur';
const NOMS_MARQUES = { brompton: 'Brompton', novastar: 'Novastar', coex: 'COEX' };

const copie = (x) => JSON.parse(JSON.stringify(x));

// Une ligne d'un renvoi au Dépannage s'affiche pour la marque du mur (marque en tableau comprise) ; sans marque, toujours.
const pourMarque = (ligne, marque) => ligne.marque == null
  || (Array.isArray(ligne.marque) ? ligne.marque.includes(marque) : ligne.marque === marque);

// Le texte d'un renvoi, lu dans les données : { renvoi, origine, titre, lignes } (lignes copiées), null s'il n'existe pas.
export function resoudreRenvoi(id, { depannage = null, miseEnService = null } = {}) {
  let m = /^dep:(T\d+):avertissement$/.exec(id);
  if (m) {
    const arbre = depannage?.arbres?.find((a) => a.id === m[1]);
    return arbre?.avertissement?.length ? { renvoi: id, origine: 'depannage', titre: arbre.titre, lignes: copie(arbre.avertissement) } : null;
  }
  m = /^dep:(T[\d.]+):(\d+)$/.exec(id);
  if (m) {
    const noeud = depannage?.noeuds?.find((n) => n.id === m[1]);
    const lignes = (noeud?.lignes ?? []).filter((l) => l.numero === Number(m[2]));
    return lignes.length ? { renvoi: id, origine: 'depannage', noeud: noeud.id, titre: noeud.titre, lignes: copie(lignes) } : null;
  }
  m = /^ms:([a-z]+):(\w+)$/.exec(id);
  if (m) {
    const proc = miseEnService?.procedures?.find((p) => p.id === m[1]);
    const lignes = (miseEnService?.lignes ?? []).filter((l) => l.procedure === m[1] && l.numero === m[2]);
    if (!proc || !lignes.length) return null;
    const sources = miseEnService.sources ?? {};
    return {
      renvoi: id, origine: 'procedure', titre: proc.titre,
      lignes: lignes.map((l) => ({ id: l.id, texte: l.texte, marque: l.marque, sources: l.sources.map((s) => ({ id: s, ...sources[s] })) })),
    };
  }
  m = /^rappel:(\w+)$/.exec(id);
  if (m) {
    const r = RAPPELS.find((x) => x.id === m[1]);
    if (!r) return null;
    return {
      renvoi: id, origine: 'rappel', titre: r.titre,
      lignes: r.textes.map((t) => ({ texte: t.texte, citation: t.citation ?? null, sources: [{ id: t.source, ...SOURCES_RAPPELS[t.source], ref: t.section ?? null }] })),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Étapes d'un mur
// ---------------------------------------------------------------------------

// Les étapes de la check-list d'un mur (spec § 4.1) : { marque, etapes, total }. Chaque étape : { id, numero, titre,
// ajout, calculee, faite (étape calculée), valide, resume, lignes, boutons, signature (null pour une étape calculée) }.
// Lignes : { type: 'texte' | 'alerte' | 'note', texte, source, fait? } ou { type: 'renvoi', renvoi, origine, titre,
// lignes } (lignes du Dépannage filtrées par marque).
export function etapesTerrain(entrees, donnees) {
  const marque = Object.prototype.hasOwnProperty.call(NOMS_MARQUES, entrees.marque) ? entrees.marque : 'autre';
  const nomMarque = NOMS_MARQUES[marque] ?? entrees.nomMarque ?? 'de cette marque';
  const logiciel = entrees.logiciel ?? null;
  const nonValides = new Set(entrees.nonValides ?? []);
  const fiches = entrees.fiches ?? [];
  const parc = entrees.parc ?? null;
  const proc = entrees.processeur ?? null;
  const secours = proc?.secours ?? 0;
  const melanges = fiches.some((f) => (f.lots?.retenus?.length ?? 0) > 1);

  const texte = (t, source = SOURCE_APPLI) => ({ type: 'texte', texte: t, source });
  const alerte = (t, source = SOURCE_APPLI) => ({ type: 'alerte', texte: t, source });
  const note = () => ({
    type: 'note', source: SOURCE_NOTE,
    texte: `Pas de procédure ${nomMarque} pour cette étape dans l'appli : suis la doc du constructeur (${logiciel ?? 'le logiciel du processeur'}).`,
  });
  const renvoi = (id) => {
    if (!CONNUS.has(id)) throw new Error(`Renvoi inconnu de la check-list : ${id}`);
    const r = resoudreRenvoi(id, donnees);
    if (!r) return null;
    return { type: 'renvoi', ...r, lignes: r.origine === 'depannage' ? r.lignes.filter((l) => pourMarque(l, marque)) : r.lignes };
  };
  const renvois = (ids) => ids.map(renvoi).filter(Boolean);

  // Contenu de chaque étape : lignes, boutons et valeurs stables de sa signature (spec § 4.3).
  const contenus = {
    depot: () => {
      const a = entrees.avantDePartir;
      const lignes = a ? a.lignes.map((l) => ({ ...texte(l.texte, SOURCE_PARC), fait: l.fait }))
        : [texte('Pas de parc pour ce mur : rien de propre au parc à vérifier.')];
      const aFaire = a ? a.lignes.filter((l) => l.fait === false).length : 0;
      return {
        lignes, resume: aFaire ? `${nombre(aFaire)} à faire` : null,
        valeurs: { parc: parc?.id ?? null, processeur: proc?.id ?? null, lots: fiches.map((f) => [f.id, f.lots?.retenus ?? null]) },
      };
    },
    arrivee: () => {
      const arrivees = entrees.elec?.arrivees ?? [];
      const plusieurs = arrivees.length > 1;
      return {
        lignes: [renvoi('dep:T9:avertissement'),
          ...arrivees.map((a, i) => texte(`Arrivée${plusieurs ? ` ${i + 1}` : ''} : ${a.type} ${nombreCourt(a.intensiteA)} A`))],
        valeurs: { arrivees: arrivees.map((a) => [a.type, a.intensiteA]) },
      };
    },
    'cablage-data': () => cablage('data'),
    'cablage-elec': () => cablage('elec'),
    tension: () => {
      const lignes = [...(entrees.elec?.lignes ?? [])].sort((a, b) => a.numero - b.numero);
      return {
        lignes: [...renvois(['dep:T9.2:1', 'dep:T9.2:2']),
          ...lignes.map((l) => texte(`Ligne ${l.numero}${l.phase ? ` · L${l.phase}` : ''}`)),
          ...(entrees.elec?.alerteAppel ? [alerte(entrees.elec.alerteAppel)] : [])],
        valeurs: { lignes: lignes.map((l) => [l.numero, l.phase ?? null]) },
      };
    },
    processeur: () => {
      const valeurs = proc ? [texte(`Processeur${proc.nombre > 1 || secours ? 's' : ''} : ${nombre(proc.nombre)} × ${proc.nom}${secours ? ` + ${nombre(secours)} de secours` : ''}`)] : [];
      const boutons = [];
      let suite = [];
      if (marque === 'novastar') {
        suite = renvois(['ms:ns:1', 'ms:ns:2', 'ms:ns:3']);
        if (logiciel === 'NovaLCT') {
          const n = entrees.novalct;
          suite.push(texte(`Pas à pas NovaLCT : ${n ? `${nombre(n.faites)} sur ${nombre(n.total)}` : 'pas encore ouvert'}`));
          boutons.push('novalct');
        }
        if (secours) suite.push(renvoi('ms:ns:c3'));
      } else if (marque === 'brompton') {
        suite = renvois(['ms:br:1', 'ms:br:2']);
        const r = entrees.reseau;
        if (r) suite.push(texte(`Fréquence et profondeur réseau : ${nombreCourt(r.frequenceHz)} Hz, ${r.bits} bits${r.origine ? ` (${r.origine})` : ''}`));
      } else suite = [note()];
      return {
        lignes: [...valeurs, ...suite], boutons,
        valeurs: { modele: proc?.id ?? null, nombre: proc?.nombre ?? null, secours, logiciel },
      };
    },
    config: () => {
      const valeurs = [];
      for (const f of fiches) {
        valeurs.push(texte(`${fiches.length > 1 ? f.nom : 'Dalle'} : ${f.pixelsLargeur} × ${f.pixelsHauteur} px`, f.source ?? SOURCE_APPLI));
      }
      for (const f of fiches) {
        const lignes = f.config?.lignes ?? [];
        if (lignes.length) valeurs.push(...lignes.map((l) => texte(l, SOURCE_PARC)));
        else if (!parc) valeurs.push(texte('Choisis un parc pour voir ses lots et ses configs.'));
        else valeurs.push(alerte(`Aucun fichier de config pour ${f.nom} dans le parc ${parc.nom} : ajoute-le dans l'onglet Base.`, SOURCE_PARC));
      }
      const suite = {
        novastar: () => renvois(['ms:ns:4', 'ms:ns:5', 'ms:ns:6', 'ms:ns:c1', 'ms:ns:c2']),
        coex: () => renvois(['rappel:C1', 'rappel:C2', 'rappel:C3', 'rappel:C4']),
        brompton: () => renvois(['ms:br:3']),
        autre: () => [note()],
      }[marque]();
      return {
        lignes: [...valeurs, ...suite],
        valeurs: { fiches: fiches.map((f) => [f.id, f.pixelsLargeur, f.pixelsHauteur]), configs: fiches.map((f) => f.config?.ids ?? []) },
      };
    },
    ports: () => {
      const p = entrees.ports;
      const valeurs = p ? [texte(`${nombre(p.principaux)} port${p.principaux > 1 ? 's' : ''}${p.secours ? `, ${nombre(p.secours)} de secours` : ''}`)] : [];
      const suite = {
        novastar: () => renvois(['dep:T2.2:2']),
        coex: () => renvois(['dep:T2.2:2']),
        brompton: () => renvois(['dep:T8.2:1', ...(entrees.redondance ? ['ms:br:5'] : [])]),
        autre: () => [note()],
      }[marque]();
      return { lignes: [...valeurs, ...suite], valeurs: { principaux: p?.principaux ?? null, secours: p?.secours ?? null } };
    },
    mire: () => ({
      lignes: renvois(['dep:T5.3:1', ...(marque === 'brompton' ? ['ms:br:6'] : [])]),
      boutons: ['mire'],
      valeurs: {},
    }),
    mapping: () => {
      const c = entrees.canvas;
      const valeurs = c ? [
        texte(`Source : ${c.source.largeurPx} × ${c.source.hauteurPx} px à ${nombreCourt(c.source.frequenceHz)} Hz`),
        ...c.blocs.map((b) => texte(`Processeur n° ${b.numero}, dans sa source : x ${b.xSource[0]} à ${b.xSource[1]}, y ${b.ySource[0]} à ${b.ySource[1]}`)),
        ...(c.alertes ?? []).map((x) => alerte(x)),
      ] : [];
      return {
        lignes: [...valeurs, ...(marque === 'brompton' ? renvois(['ms:br:4']) : [])],
        valeurs: { source: c ? [c.source.largeurPx, c.source.hauteurPx, c.source.frequenceHz] : null, blocs: (c?.blocs ?? []).map((b) => [b.numero, b.xSource, b.ySource]) },
      };
    },
    calibration: () => {
      const lignes = fiches.map((f) => etatLots(f, logiciel, texte, alerte));
      if (marque === 'novastar' && melanges) lignes.push(renvoi('rappel:N7'));
      if (marque === 'brompton') lignes.push(...renvois(['ms:br:7', ...(melanges ? ['rappel:B4'] : [])]));
      if (marque === 'autre') lignes.push(note());
      return { lignes, valeurs: { lots: fiches.map((f) => [f.id, f.lots?.retenus ?? null]) } };
    },
    sauvegarde: () => ({ lignes: marque === 'novastar' ? renvois(['ms:ns:7']) : [note()], valeurs: {} }),
  };

  function cablage(type) {
    const m = entrees.montage?.[type] ?? null;
    const mot = type === 'data' ? 'data' : 'élec';
    return {
      lignes: [texte(`Montage ${mot} : ${m ? m.texte : 'pas encore suivi dans le guide'}`)],
      boutons: [`montage-${type}`],
      faite: Boolean(m && m.total > 0 && m.faites >= m.total),
    };
  }

  const etapes = ETAPES.map((def, i) => {
    const c = contenus[def.id]();
    const valide = !(def.onglet && nonValides.has(def.onglet));
    let lignes = c.lignes;
    // Calcul non valide : les valeurs de l'onglet en cause deviennent « calcul non valide », renvois et notes restent.
    if (!valide) lignes = [alerte(NON_VALIDE), ...lignes.filter((l) => l.type === 'renvoi' || l.type === 'note')];
    return {
      id: def.id, numero: i + 1, titre: def.titre, ajout: false, calculee: Boolean(def.calculee),
      faite: def.calculee ? valide && c.faite : null,
      valide, resume: valide ? c.resume ?? null : null, lignes, boutons: c.boutons ?? [],
      signature: def.calculee ? null : JSON.stringify([def.id, marque, c.lignes.filter((l) => l.type === 'renvoi').map((l) => l.renvoi), c.valeurs]),
    };
  });
  for (const a of entrees.ajouts ?? []) {
    etapes.push({
      id: `${PREFIXE_AJOUT}${a.id}`, numero: etapes.length + 1, titre: a.texte, ajout: true, calculee: false, faite: null,
      valide: true, resume: null, lignes: [], boutons: [], signature: JSON.stringify([`${PREFIXE_AJOUT}${a.id}`, a.texte]),
    });
  }
  // Un onglet au calcul non valide : aucune case n'est décochée, même d'une étape dont la signature a changé (la marque
  // peut être inconnue tant que Data n'a pas de processeur).
  return { marque, etapes, total: etapes.length, gele: nonValides.size > 0 };
}

// État des lots d'une fiche du mur (spec § 4.2), textes de lotsDuMur et des alertes R140.
function etatLots(f, logiciel, texte, alerte) {
  const l = f.lots;
  if (!l || !l.nombre) return texte(`Pas de lot noté pour ${f.nom} dans le parc.`, SOURCE_PARC);
  const retenus = l.retenus ?? [];
  if (retenus.length > 1) return alerte(`${f.nom} : ${texteLotsMelanges(retenus, logiciel)}`, SOURCE_PARC);
  if (retenus.length === 1) return texte(`Un seul lot de ${f.nom} : lot ${retenus[0]}.`, SOURCE_PARC);
  if (l.aPreciser) return alerte(`${f.nom} : Lots utilisés : à préciser (plusieurs lots sans quantité) : coche ceux de ce mur dans l'onglet Mur.`, SOURCE_PARC);
  return alerte(`${f.nom} : Aucun lot coché : coche ceux de ce mur dans l'onglet Mur.`, SOURCE_PARC);
}

// ---------------------------------------------------------------------------
// Entrées d'un mur rassemblées depuis les résultats des onglets (lot 27b)
// ---------------------------------------------------------------------------

// Alertes de Canvas reprises à l'étape « Mapping et source » : EDID (résolution non standard) et plage Limited.
const ALERTES_SOURCE = /^(Résolution de source|Plage Limited)/;
const LIGNE_LOTS = /^Lots utilisés : /;

// Marque d'un processeur pour la check-list : Brompton, COEX (gamme de Novastar), Novastar, sinon 'autre' avec son nom.
function marqueDe(proc) {
  if (!proc) return { marque: null, nomMarque: null };
  if (proc.famille === 'brompton') return { marque: 'brompton', nomMarque: 'Brompton' };
  if (proc.famille === 'novastar') return proc.gamme === 'COEX' ? { marque: 'coex', nomMarque: 'COEX' } : { marque: 'novastar', nomMarque: 'Novastar' };
  return { marque: 'autre', nomMarque: MARQUES_FAMILLE[proc.famille] ?? proc.marque ?? null };
}

// Lots et config d'un groupe de lots du mur (`configs` : résultat de configsDuMur pour le logiciel du processeur).
function lotsEtConfig(configs, logiciel, libelle) {
  if (!configs || configs.note) return { lots: null, config: { lignes: [], ids: [] } };
  const retenus = configs.retenus ?? [];
  const lots = configs.lots.length ? {
    nombre: configs.lots.length, retenus: retenus.map((l) => l.identifiant), aPreciser: retenus.length === 0 && configs.parDefaut,
  } : null;
  const ids = configs.parLot
    ? configs.parLot.filter((p) => p.retenue).map((p) => idConfig(p.retenue, p.lot.id))
    : retenus.flatMap((lot) => (lot.configs ?? []).filter((c) => !logiciel || c.logiciel === logiciel).map((c) => idConfig(c, lot.id)));
  const prefixe = (t) => (libelle ? `${libelle} : ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t);
  return { lots, config: { lignes: configs.lignes.filter((l) => !LIGNE_LOTS.test(l)).map(prefixe), ids } };
}

// Entrées de `etapesTerrain` à partir des résultats des onglets, tels que l'appli les calcule :
//   data { evaluation (processeur retenu de Data), origineBits, avantDePartir, mur, dalle, groupes [{ dalleId, libelle,
//   configs (configsDuMur) }] } ; parc { id, nom } ; cablageData (variante data retenue du Schéma) ; elec { resultat
//   (electricite), arrivees (plusieurs arrivées, sinon null), variante (variante élec retenue du Schéma) } ; canvas
//   { source, controle (controleSource) } ; montage { data, elec } ; novalct { faites, total } ; ajouts.
// Un onglet sans résultat (ou un processeur qui ne convient pas, une source refusée) est dans `nonValides`.
export function entreesDuMur({
  data = null, parc = null, cablageData = null, elec = null, canvas = null, montage = null, novalct = null, ajouts = [],
} = {}) {
  const ev = data?.evaluation ?? null;
  const proc = ev?.processeur ?? null;
  const nonValides = [];
  if (!ev?.groupes?.length) nonValides.push('data');
  if (!elec?.resultat) nonValides.push('elec');
  if (!canvas?.controle?.ok) nonValides.push('canvas');
  const logiciel = proc ? logicielDuProcesseur(proc) : null;

  // Fiches du mur : les groupes de lots (dalle, demi-dalle), puis les fiches des zones d'un mur mixte.
  const parId = new Map([data?.dalle, data?.mur?.demi, ...(data?.mur?.mixte ? (data.mur.zones ?? []).flatMap((z) => [z.dalle, z.demi]) : [])]
    .filter(Boolean).map((f) => [f.id, f]));
  const fiches = [];
  const vues = new Set();
  const ajouterFiche = (fiche, groupe = null) => {
    if (!fiche || vues.has(fiche.id)) return;
    vues.add(fiche.id);
    const sources = fiche.sources?.pxH?.sources ?? [];
    fiches.push({
      id: fiche.id, nom: fiche.nom, pixelsLargeur: fiche.pxH, pixelsHauteur: fiche.pxV,
      source: sources.length ? sources.map(sourceCourte).join(', ') : 'Fiche de la dalle',
      ...lotsEtConfig(groupe?.configs ?? null, logiciel, groupe?.libelle ?? null),
    });
  };
  for (const g of data?.groupes ?? []) ajouterFiche(parId.get(g.dalleId), g);
  for (const f of parId.values()) ajouterFiche(f);

  const r = elec?.resultat ?? null;
  const tri = r?.arrivee?.type === 'tri';
  const controle = canvas?.controle ?? null;
  return {
    ...marqueDe(proc),
    logiciel,
    parc: parc ? { id: parc.id, nom: parc.nom } : null,
    processeur: proc ? { id: proc.id, nom: proc.modele ?? proc.nom, nombre: ev.nombre, secours: ev.nombreSecours ?? 0 } : null,
    redondance: Boolean(ev?.reglages?.redondance),
    reseau: proc?.famille === 'brompton' ? { frequenceHz: ev.reglages.frequenceHz, bits: ev.reglages.bits, origine: data.origineBits ?? null } : null,
    avantDePartir: data?.avantDePartir ?? null,
    montage, novalct,
    elec: r ? {
      arrivees: (elec.arrivees ?? [r.arrivee]).map((a) => ({ type: a.type, intensiteA: a.intensiteA })),
      lignes: (elec.variante?.lignesDetail ?? []).map((l) => ({ numero: l.numero, phase: tri ? l.phase ?? null : null })),
      alerteAppel: r.appel && !r.appel.ok ? r.alertes.find((a) => a.startsWith('Courant d\'appel')) ?? null : null,
    } : null,
    ports: cablageData ? { principaux: cablageData.ports, secours: cablageData.portsSecours ?? 0 } : null,
    canvas: controle ? {
      source: { largeurPx: canvas.source.largeurPx, hauteurPx: canvas.source.hauteurPx, frequenceHz: canvas.source.frequenceHz },
      blocs: controle.blocs.map((b) => ({ numero: b.numero, xSource: b.xSource, ySource: b.ySource })),
      alertes: controle.alertes.filter((a) => ALERTES_SOURCE.test(a)),
    } : null,
    fiches,
    ajouts: [...ajouts],
    nonValides,
  };
}

// ---------------------------------------------------------------------------
// Cases, rapprochement, état
// ---------------------------------------------------------------------------

// Titre d'une étape cochée qui a disparu, lu dans sa signature (étape ajoutée : son texte).
function titreCoche(id, signature) {
  const def = ETAPES.find((e) => e.id === id);
  if (def) return def.titre;
  try {
    const s = JSON.parse(signature);
    if (Array.isArray(s) && typeof s[1] === 'string') return s[1];
  } catch {
    // signature illisible : titre générique
  }
  return 'Étape ajoutée';
}

// Cases gardées avec le mur ({ [id de l'étape]: signature }) rapprochées des étapes du moment (spec § 4.3) : une case
// dont l'étape a disparu ou dont la signature a changé est décochée avec sa raison ('change', 'disparue'), jamais en
// silence ; une étape au calcul non valide garde sa case. Renvoie { coches, retirees, avis }.
export function rapprocherTerrain(resultat, coches) {
  const rang = new Map(resultat.etapes.map((e, i) => [e.id, i]));
  const gardees = {};
  const retirees = [];
  for (const [id, signature] of Object.entries(coches ?? {})) {
    const e = resultat.etapes[rang.get(id)];
    if (e?.calculee) continue;
    if (resultat.gele || (e && (!e.valide || e.signature === signature))) gardees[id] = signature;
    else if (!e) retirees.push({ id, titre: titreCoche(id, signature), raison: 'disparue' });
    else retirees.push({ id, titre: e.titre, raison: 'change' });
  }
  retirees.sort((a, b) => (rang.get(a.id) ?? Infinity) - (rang.get(b.id) ?? Infinity));
  return { coches: gardees, retirees, avis: texteChangementTerrain(retirees) };
}

// « Le mur a changé : « Config des dalles » décochée (son contenu n'est plus le même). »
export function texteChangementTerrain(retirees) {
  if (!retirees?.length) return null;
  const parties = [];
  for (const [raison, un, plusieurs] of [
    ['change', 'son contenu n\'est plus le même', 'leur contenu n\'est plus le même'],
    ['disparue', 'cette étape n\'existe plus', 'ces étapes n\'existent plus'],
  ]) {
    const noms = retirees.filter((x) => x.raison === raison).map((x) => `« ${x.titre} »`);
    if (!noms.length) continue;
    const liste = noms.join(', ').replace(/, ([^,]*)$/, ' et $1');
    parties.push(`${liste} décochée${noms.length > 1 ? 's' : ''} (${noms.length > 1 ? plusieurs : un})`);
  }
  return `Le mur a changé : ${parties.join(' ; ')}.`;
}

// Case affichée cochée : gardée avec sa signature du moment, ou gardée telle quelle tant qu'un calcul n'est pas valide.
export const etapeCochee = (resultat, e, coches) => Object.prototype.hasOwnProperty.call(coches ?? {}, e.id)
  && (resultat.gele || !e.valide || coches[e.id] === e.signature);

// « Mise en service : 5 sur 12 » (spec § 4.4) : étapes calculées faites, et cases cochées de même signature (ou d'une
// étape au calcul non valide).
export function etatTerrain(resultat, coches) {
  const faites = resultat.etapes.filter((e) => (e.calculee ? e.faite : etapeCochee(resultat, e, coches))).length;
  return { faites, total: resultat.etapes.length };
}

// ---------------------------------------------------------------------------
// Suivi gardé avec le mur : { etat, coches, ajouts }
// ---------------------------------------------------------------------------

// `pannes` (lot 27c) : présent seulement quand le carnet en a, comme dans les données du mur.
export const terrainVide = () => ({ etat: null, coches: {}, ajouts: [] });
const lire = (t) => ({
  etat: t?.etat ?? null, coches: { ...(t?.coches ?? {}) }, ajouts: [...(t?.ajouts ?? [])],
  ...(t?.pannes?.length ? { pannes: copie(t.pannes) } : {}),
});
const aleaParDefaut = () => Math.random().toString(36).slice(2, 10);

// Ajoute une étape à moi (spec § 4.6) : texte de 1 à 80 caractères, espaces de bord retirés, 20 au plus par mur.
export function ajouterEtape(t, texte, { alea = aleaParDefaut } = {}) {
  const x = lire(t);
  const propre = String(texte ?? '').trim();
  if (!propre || propre.length > LIMITES_TERRAIN.texteAjout) throw new ErreurSaisie(`Étape ajoutée : écris de 1 à ${LIMITES_TERRAIN.texteAjout} caractères.`);
  if (x.ajouts.length >= LIMITES_TERRAIN.ajouts) throw new ErreurSaisie(`${LIMITES_TERRAIN.ajouts} étapes ajoutées au plus par mur : retire-en une avant d'en ajouter.`);
  let id = alea();
  while (x.ajouts.some((a) => a.id === id)) id = alea();
  return { ...x, ajouts: [...x.ajouts, { id, texte: propre }] };
}

// Retire une étape ajoutée et sa case.
export function retirerEtape(t, ajoutId) {
  const x = lire(t);
  delete x.coches[`${PREFIXE_AJOUT}${ajoutId}`];
  return { ...x, ajouts: x.ajouts.filter((a) => a.id !== ajoutId) };
}

// Coche une étape avec sa signature du moment, ou la décoche (signature null).
export function cocherEtape(t, etapeId, signature) {
  const x = lire(t);
  if (signature) x.coches[etapeId] = signature;
  else delete x.coches[etapeId];
  return x;
}

// « Tout décocher » : les étapes ajoutées gardent leur case (les étapes calculées n'en ont pas).
export function toutDecocher(t) {
  const x = lire(t);
  return { ...x, coches: Object.fromEntries(Object.entries(x.coches).filter(([id]) => id.startsWith(PREFIXE_AJOUT))) };
}


// ---------------------------------------------------------------------------
// Carnet de pannes (lot 27c, spec § 5)
// ---------------------------------------------------------------------------

// Ce qui a remplacé la dalle ou la pièce HS : liste fermée, aucun texte libre (spec § 5.1).
export const REMPLACEMENTS = ['Dalle de spare', 'Module', 'Carte de réception', 'Alimentation', 'Autre pièce', 'Rien (réparée sur place)', 'Pas encore remplacée'];
export const SPARE = 'Dalle de spare';
export const LOT_INCONNU = 'Lot inconnu';
export const SYMPTOME_AUTRE = 'autre';
const CHAMPS_MODIFIABLES = ['symptome', 'remplacePar', 'lot', 'serieHS', 'serieNouvelle'];

// Identifiants des symptômes du Dépannage (S1 à S11), dans leur ordre.
export const symptomesPanne = (depannage) => (depannage?.symptomes ?? []).map((s) => s.id);

// Pannes d'un suivi gardé (aucune : liste vide).
export const pannesDe = (t) => copie(t?.pannes ?? []);

// Texte facultatif : espaces de bord retirés, vide → null, sinon de 1 à `max` caractères.
function texteFacultatif(valeur, max, message) {
  if (valeur == null) return null;
  const propre = String(valeur).trim();
  if (!propre) return null;
  if (propre.length > max) throw new ErreurSaisie(message);
  return propre;
}

// Une panne complète vérifiée (saisie, modification, et plus tard import) : renvoie la panne nettoyée ou refuse avec la
// raison. `symptomes` : identifiants du Dépannage ; « autre » toujours accepté.
export function verifierPanne(p, { symptomes = [] } = {}) {
  const copieMax = LIMITES_TERRAIN.texteCopie;
  const dalle = texteFacultatif(p?.dalle, copieMax, 'Nom de la dalle trop long.');
  if (!dalle) throw new ErreurSaisie('Panne sans dalle : touche la dalle dans le Schéma.');
  const ficheId = texteFacultatif(p.ficheId, copieMax, 'Fiche de la dalle illisible.');
  const fiche = texteFacultatif(p.fiche, copieMax, 'Nom de la fiche trop long.');
  if (!ficheId || !fiche) throw new ErreurSaisie('Panne sans fiche de dalle : touche la dalle dans le Schéma.');
  if (typeof p.symptome !== 'string' || !(p.symptome === SYMPTOME_AUTRE || symptomes.includes(p.symptome))) {
    throw new ErreurSaisie('Symptôme : choisis-en un dans la liste.');
  }
  if (!REMPLACEMENTS.includes(p.remplacePar)) throw new ErreurSaisie('Remplacée par : choisis dans la liste.');
  const serie = `N° de série : ${LIMITES_TERRAIN.serie} caractères au plus.`;
  const quand = typeof p.quand === 'string' && !Number.isNaN(Date.parse(p.quand)) ? p.quand : null;
  if (!quand) throw new ErreurSaisie('Date de la panne illisible.');
  return {
    id: String(p.id), quand, dalle, ficheId, fiche,
    port: texteFacultatif(p.port, copieMax, 'Port trop long.'),
    ligne: texteFacultatif(p.ligne, copieMax, 'Ligne trop longue.'),
    symptome: p.symptome, remplacePar: p.remplacePar,
    lot: texteFacultatif(p.lot, copieMax, 'Lot trop long.'),
    serieHS: texteFacultatif(p.serieHS, LIMITES_TERRAIN.serie, serie),
    serieNouvelle: texteFacultatif(p.serieNouvelle, LIMITES_TERRAIN.serie, serie),
  };
}

const avecPannes = (x, pannes) => {
  const { pannes: _ancien, ...reste } = x;
  return pannes.length ? { ...reste, pannes } : reste;
};

// Ajoute une panne (spec § 5.1) : date de saisie automatique, 200 au plus par mur.
export function ajouterPanne(t, saisie, { symptomes = [], alea = aleaParDefaut, maintenant = () => new Date() } = {}) {
  const x = lire(t);
  const pannes = x.pannes ?? [];
  if (pannes.length >= LIMITES_TERRAIN.pannes) throw new ErreurSaisie(`${LIMITES_TERRAIN.pannes} pannes au plus par mur : supprime-en une avant d'en ajouter.`);
  let id = alea();
  while (pannes.some((p) => p.id === id)) id = alea();
  const panne = verifierPanne({ ...saisie, id, quand: maintenant().toISOString() }, { symptomes });
  return avecPannes(x, [...pannes, panne]);
}

// Modifie une panne : symptôme, remplacement, lot et n° de série seulement ; la date, la dalle, sa fiche, le port et la
// ligne copiés à la saisie ne changent jamais.
export function modifierPanne(t, panneId, champs, { symptomes = [] } = {}) {
  const x = lire(t);
  const pannes = x.pannes ?? [];
  const i = pannes.findIndex((p) => p.id === panneId);
  if (i < 0) throw new ErreurSaisie('Panne introuvable : elle a peut-être été supprimée.');
  const maj = { ...pannes[i] };
  for (const c of CHAMPS_MODIFIABLES) maj[c] = champs?.[c] ?? null;
  const panne = verifierPanne(maj, { symptomes });
  return avecPannes(x, pannes.map((p, j) => (j === i ? panne : p)));
}

export function supprimerPanne(t, panneId) {
  const x = lire(t);
  return avecPannes(x, (x.pannes ?? []).filter((p) => p.id !== panneId));
}

// Dalle touchée dans le Schéma (spec § 5.1, § 5.2) : nom, fiche (demi-dalle sur la sienne), port de la variante data
// retenue et ligne de la variante élec retenue, quel que soit le câblage affiché ; vides sans variante. `dalle` : une
// dalle de `dallesDuMur` ({ id, fiche }).
export function panneDeLaDalle(dalle, { data = null, elec = null } = {}) {
  const id = dalle.id;
  let port = null;
  for (const p of data?.processeurs ?? []) {
    const x = p.ports.find((pt) => pt.dalles.includes(id));
    if (x) {
      port = `${p.modele} n° ${p.numero}, ${x.libelle}, dalle ${x.dalles.indexOf(id) + 1} sur ${x.dalles.length}`;
      break;
    }
  }
  const l = elec?.lignesDetail?.find((x) => x.dalles.includes(id)) ?? null;
  const ligne = l ? `ligne ${l.numero}${(elec.phases?.length ?? 0) > 1 ? `, phase L${l.phase}` : ''}, dalle ${l.dalles.indexOf(id) + 1} sur ${l.dalles.length}` : null;
  return { dalle: id, ficheId: dalle.fiche.id, fiche: dalle.fiche.nom, port, ligne };
}

// Lots proposés pour la pièce posée (spec § 5.1) : ceux de la fiche dans le parc du mur, puis « Lot inconnu » ; par
// défaut le lot retenu de la fiche s'il n'y en a qu'un. `lots` : lots de la fiche dans le parc, null sans parc.
export function lotsPourPanne(lots, retenus) {
  if (!lots) return { choix: [], defaut: null };
  const r = retenus ?? [];
  return { choix: [...lots.map((l) => l.identifiant), LOT_INCONNU], defaut: r.length === 1 ? r[0] : null };
}

// Spares utilisés (spec § 5.3), pour un mur ou une presta (`presta`) : par fiche, pannes « Dalle de spare » de ce
// `ficheId` sur les spares de la liste de matériel gardée de chaque mur (`liste`, null si elle n'a jamais été calculée).
// Rien n'est retiré du stock du parc ni de la liste. Renvoie { lignes [{ ficheId, fiche, utilises, prevus, texte,
// alerte }], notes }.
export function sparesUtilises(murs, { presta = false } = {}) {
  const parFiche = new Map();
  const notes = [];
  for (const m of murs) {
    if (!m.liste) {
      notes.push(presta ? `${m.nom} : ouvre ce mur une fois pour compter ses spares.` : 'Ouvre ce mur une fois pour compter ses spares.');
      continue;
    }
    for (const l of m.liste.sections?.find((s) => s.id === 'dalles')?.lignes ?? []) {
      const f = parFiche.get(l.ficheId) ?? { ficheId: l.ficheId, fiche: l.designation, utilises: 0, prevus: 0 };
      f.prevus += l.spares ?? 0;
      parFiche.set(l.ficheId, f);
    }
    for (const p of m.pannes ?? []) {
      if (p.remplacePar !== SPARE) continue;
      const f = parFiche.get(p.ficheId) ?? { ficheId: p.ficheId, fiche: p.fiche, utilises: 0, prevus: 0 };
      f.utilises += 1;
      parFiche.set(p.ficheId, f);
    }
  }
  const lignes = [...parFiche.values()].map((f) => {
    if (f.prevus === 0 && f.utilises > 0) {
      const un = f.utilises === 1;
      return { ...f, alerte: true, texte: `Spares de ${f.fiche} : ${nombre(f.utilises)} dalle${un ? '' : 's'} de spare utilisée${un ? '' : 's'}, aucune prévue.` };
    }
    if (f.utilises > f.prevus) return { ...f, alerte: true, texte: `Plus de spare de ${f.fiche} : ${nombre(f.utilises)} utilisés pour ${nombre(f.prevus)} prévus.` };
    return { ...f, alerte: false, texte: `Spares de ${f.fiche} : ${nombre(f.utilises)} utilisé${f.utilises > 1 ? 's' : ''} sur ${nombre(f.prevus)}` };
  });
  return { lignes, notes };
}

// Date et heure d'une panne : « 01/11/2026 14:32 », heure de l'appareil.
export function texteQuand(iso) {
  const d = new Date(iso);
  const deux = (n) => String(n).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

// Texte d'un symptôme (« Des dalles entières sont noires »), « Autre » pour « autre ».
export function texteSymptome(id, depannage) {
  if (id === SYMPTOME_AUTRE) return 'Autre';
  return depannage?.symptomes?.find((s) => s.id === id)?.texte ?? id;
}

// Lignes libellé / valeur d'une panne, dans l'ordre de la spec § 7, lignes vides omises.
export function lignesPanne(p, depannage) {
  const minuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  return [
    ['Dalle', `${p.dalle}, ${p.fiche}`],
    ['Symptôme', texteSymptome(p.symptome, depannage)],
    ['Remplacée par', minuscule(p.remplacePar)],
    ['Lot', p.lot],
    ['N° de série HS', p.serieHS],
    ['N° de série nouvelle', p.serieNouvelle],
    ['Data', p.port],
    ['Élec', p.ligne],
  ].filter(([, valeur]) => valeur);
}


// ---------------------------------------------------------------------------
// Copie, partage, PDF du carnet, fiche du chef de projet, fichier de presta (lot 27d, spec § 7)
// ---------------------------------------------------------------------------

const AUCUNE_PANNE = 'Aucune panne notée.';

// Texte copié ou partagé de l'écran Terrain, pour le mur ouvert : une information par ligne. `presta`, `mur` : noms ;
// `resultat` : etapesTerrain ; `coches` : cases gardées ; `pannes` : carnet dans l'ordre de saisie ; `spares` :
// sparesUtilises du mur.
export function resumeTerrain({ presta, mur, resultat, coches, pannes = [], spares = null, depannage = null }) {
  const etat = etatTerrain(resultat, coches);
  const lignes = ['MISE EN SERVICE', `Presta : ${presta}`, `Mur : ${mur}`, `Mise en service : ${nombre(etat.faites)} sur ${nombre(etat.total)}`];
  for (const e of resultat.etapes) {
    const faite = e.calculee ? e.faite : etapeCochee(resultat, e, coches);
    // Étape de câblage : l'état du guide, lu dans sa ligne (« Montage data : 1 port sur 2 branché »).
    const cablage = e.calculee ? e.lignes.find((l) => l.type === 'texte' && /^Montage [^:]+ : /.test(l.texte))?.texte.replace(/^Montage [^:]+ : /, '') : null;
    const detail = !e.valide ? 'calcul non valide' : cablage ?? e.resume;
    lignes.push(`${faite ? 'OK' : 'À faire'} : ${e.titre}${detail ? ` (${detail})` : ''}`);
  }
  lignes.push('CARNET DE PANNES');
  if (!pannes.length) lignes.push(AUCUNE_PANNE);
  pannes.forEach((p, i) => {
    lignes.push(`Panne ${i + 1} : ${texteQuand(p.quand)}`, ...lignesPanne(p, depannage).map(([libelle, valeur]) => `${libelle} : ${valeur}`));
  });
  lignes.push(...(spares?.lignes ?? []).map((l) => l.texte), ...(spares?.notes ?? []));
  return lignes.map(ligneSimple).filter(Boolean).join('\n');
}

// « mur-led-terrain-<presta>-<mur>-<AAAA-MM-JJ>.txt », noms simplifiés comme ceux des prestas.
export const nomFichierTerrain = (presta, mur, maintenant = new Date()) => `mur-led-terrain-${nomSimple(presta)}-${nomSimple(mur)}-${jourIso(maintenant)}.txt`;
// « mur-led-carnet-<presta>-<AAAA-MM-JJ>.pdf ».
export const nomFichierCarnet = (presta, maintenant = new Date()) => `mur-led-carnet-${nomSimple(presta)}-${jourIso(maintenant)}.pdf`;

const ligneTexte = (valeur) => ({ libelle: '', valeur });

// Fiche « Carnet de pannes » de toute la presta, pour pdfFiche et mettreEnPage (pdf.js) : en-tête, un bloc par mur
// (chaque panne en sous-titre puis ses lignes, puis les spares du mur ; « Aucune panne notée. » sans panne), spares de la
// presta quand elle a plusieurs murs et des pannes. `murs` : [{ id, nom, pannes, liste (liste de matériel gardée ou
// null) }] dans l'ordre de la presta.
export function ficheCarnet({ presta, murs = [], depannage = null, date = new Date() }) {
  const entete = [['Presta', presta.nom], ['Dates', texteDates(presta.debut, presta.fin)], ['Lieu', presta.lieu ?? '']]
    .filter(([, valeur]) => valeur);
  const blocs = murs.map((m) => {
    const pannes = m.pannes ?? [];
    if (!pannes.length) return { titre: m.nom, murId: m.id ?? null, date: null, lignes: [ligneTexte(AUCUNE_PANNE)], manque: null };
    const s = sparesUtilises([{ nom: m.nom, pannes, liste: m.liste ?? null }]);
    const lignes = pannes.flatMap((p, i) => [{ titre: `Panne ${i + 1} : ${texteQuand(p.quand)}` },
      ...lignesPanne(p, depannage).map(([libelle, valeur]) => ({ libelle, valeur }))]);
    lignes.push({ titre: 'Spares utilisés' }, ...s.lignes.map((l) => ligneTexte(l.texte)), ...s.notes.map(ligneTexte));
    return { titre: m.nom, murId: m.id ?? null, date: null, lignes, manque: null };
  });
  let fin = null;
  if (murs.length > 1 && murs.some((m) => m.pannes?.length)) {
    const s = sparesUtilises(murs.map((m) => ({ nom: m.nom, pannes: m.pannes ?? [], liste: m.liste ?? null })), { presta: true });
    fin = { titre: 'Spares utilisés sur la presta', lignes: [...s.lignes.map((l) => ligneTexte(l.texte)), ...s.notes.map(ligneTexte)] };
  }
  return {
    metier: 'carnet', titre: 'Carnet de pannes', rappel: 'Pannes notées sur le terrain. Rien n\'est retiré du stock du parc.',
    entete: [...entete, ['Date de la fiche', jourTexte(date)]], blocs, fin,
  };
}

// Carnet d'un mur dans la fiche du chef de projet (spec § 7) : nombre, une ligne par panne (dalle, fiche, symptôme,
// remplacement, lot), spares utilisés ; rien sans panne. Lignes { libelle, valeur } ou { titre }.
export function lignesCarnet({ nom = '', pannes = [], liste = null }, depannage = null) {
  if (!pannes.length) return [];
  const minuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const s = sparesUtilises([{ nom, pannes, liste }]);
  return [
    { titre: 'Carnet de pannes' }, { libelle: 'Pannes', valeur: nombre(pannes.length) },
    ...pannes.map((p, i) => ({
      libelle: `Panne ${i + 1} : ${texteQuand(p.quand)}`,
      valeur: [`${p.dalle}, ${p.fiche}`, texteSymptome(p.symptome, depannage), `remplacée par ${minuscule(p.remplacePar)}`, p.lot ? `lot ${p.lot}` : null].filter(Boolean).join(' ; '),
    })),
    ...s.lignes.map((l) => {
      const i = l.texte.indexOf(' : ');
      return { libelle: l.texte.slice(0, i), valeur: l.texte.slice(i + 3) };
    }),
    ...s.notes.map((n) => ({ libelle: 'Note', valeur: n })),
  ];
}

// Mise en service et carnet lus dans un fichier de presta (spec § 7) : forme, longueurs et symptômes vérifiés comme à la
// saisie ; refus avec la raison (ErreurSaisie). `symptomes` : identifiants du Dépannage ; null (Dépannage non chargé) :
// « S » et un nombre acceptés. Renvoie le suivi { etat, coches, ajouts, pannes } (comme terrainVide quand rien n'est
// rempli), ou null sans suivi.
const ID_AJOUT = /^[A-Za-z0-9]{1,40}$/;
const ID_PANNE = /^[A-Za-z0-9-]{1,40}$/;
const CASES = new Set(ETAPES.filter((e) => !e.calculee).map((e) => e.id));
const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
export function lireTerrain(t, { symptomes = null } = {}) {
  if (t === null || t === undefined) return null;
  if (!objet(t)) throw new ErreurSaisie('mise en service illisible.');
  const etat = t.etat ?? null;
  if (etat !== null) {
    const entier = (n) => Number.isInteger(n) && n >= 0;
    const total = ETAPES.length + LIMITES_TERRAIN.ajouts;
    if (!objet(etat) || !entier(etat.faites) || !entier(etat.total) || etat.faites > etat.total || etat.total > total
      || (etat.calculeLe != null && (typeof etat.calculeLe !== 'string' || Number.isNaN(Date.parse(etat.calculeLe))))) {
      throw new ErreurSaisie('état de la mise en service illisible.');
    }
  }
  const ajouts = t.ajouts ?? [];
  if (!Array.isArray(ajouts)) throw new ErreurSaisie('étapes ajoutées illisibles.');
  if (ajouts.length > LIMITES_TERRAIN.ajouts) throw new ErreurSaisie(`${LIMITES_TERRAIN.ajouts} étapes ajoutées au plus par mur.`);
  const ajoutsLus = [];
  ajouts.forEach((a, i) => {
    const raison = (message) => new ErreurSaisie(`étape ajoutée ${i + 1} illisible (${message})`);
    if (!objet(a) || typeof a.id !== 'string' || !ID_AJOUT.test(a.id)) throw raison('identifiant illisible.');
    if (ajoutsLus.some((x) => x.id === a.id)) throw raison('identifiant en double.');
    const texte = typeof a.texte === 'string' ? a.texte.trim() : '';
    if (!texte || texte.length > LIMITES_TERRAIN.texteAjout) throw raison(`Étape ajoutée : écris de 1 à ${LIMITES_TERRAIN.texteAjout} caractères.`);
    ajoutsLus.push({ id: a.id, texte });
  });
  const coches = t.coches ?? {};
  const illisibles = new ErreurSaisie('cases de la mise en service illisibles.');
  if (!objet(coches)) throw illisibles;
  const cochesLues = {};
  for (const [id, signature] of Object.entries(coches)) {
    const connue = CASES.has(id) || (id.startsWith(PREFIXE_AJOUT) && ID_AJOUT.test(id.slice(PREFIXE_AJOUT.length)));
    if (!connue || typeof signature !== 'string' || !signature || signature.length > 20000) throw illisibles;
    cochesLues[id] = signature;
  }
  const pannes = t.pannes ?? [];
  if (!Array.isArray(pannes)) throw new ErreurSaisie('carnet de pannes illisible.');
  if (pannes.length > LIMITES_TERRAIN.pannes) throw new ErreurSaisie(`${LIMITES_TERRAIN.pannes} pannes au plus par mur.`);
  const liste = symptomes ?? Array.from({ length: 99 }, (_, i) => `S${i + 1}`);
  const pannesLues = [];
  pannes.forEach((p, i) => {
    const raison = (message) => new ErreurSaisie(`panne ${i + 1} illisible (${message})`);
    if (!objet(p) || typeof p.id !== 'string' || !ID_PANNE.test(p.id)) throw raison('identifiant illisible.');
    if (pannesLues.some((x) => x.id === p.id)) throw raison('identifiant en double.');
    try {
      pannesLues.push(verifierPanne(p, { symptomes: liste }));
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      throw raison(erreur.message);
    }
  });
  return {
    etat: etat ? { faites: etat.faites, total: etat.total, calculeLe: etat.calculeLe ?? null } : null,
    coches: cochesLues, ajouts: ajoutsLus, ...(pannesLues.length ? { pannes: pannesLues } : {}),
  };
}
