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
import { nombre, nombreCourt, sourceCourte } from './format.js';

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

// Mes étapes (spec § 4.6) : texte de 1 à 80 caractères, 20 au plus par mur.
export const LIMITES_TERRAIN = { texteAjout: 80, ajouts: 20 };
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

export const terrainVide = () => ({ etat: null, coches: {}, ajouts: [] });
const lire = (t) => ({ etat: t?.etat ?? null, coches: { ...(t?.coches ?? {}) }, ajouts: [...(t?.ajouts ?? [])] });
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
