// Calculs du mur LED, config imposée (étape 18c) : nombre de ports ou de
// lignes choisi par l'utilisateur, passage en fibre. Contrôles et répartitions ; le câblage lui-même reste dans cablage.js,
// qui ajoute la variante « Ma config (imposée) » sans jamais remplacer le conseil.
// Module de src/calculs.js, le point d'entrée qui réexporte tout : fonctions pures, sans accès à l'interface.
import { nombre, nombreCourt } from '../format.js';
import { LIBELLE_IMPOSEE, minuscule } from './commun.js';
import { plusieursZones } from './morceaux.js';
import { repartir, MODELES_DISTRIBUTEUR } from './capacites.js';

export const IMPOSE_MAX = 999;
export const PAIRE_DEFAUT = 'novastar-cvt310';
const REFUS_MUR = 'Config imposée : pas encore possible sur un mur en zones, de forme libre ou mixte ; le conseil de l\'appli reste.';

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Sorties fibre en copie, port par port : fibre principale, ports qu'elle porte, fibre de secours.
// MCTRL4K : fiche V1.2.1 p. 4, manuel V1.2.1 p. 4 et 8 ; NovaPro UHD : manuel V1.2.0 ; MCTRL660 PRO : fiche V1.4.1 p. 4.
const FIBRES_SORTIE = {
  'novastar-mctrl4k': [{ nom: 'OPT1', ports: [1, 8], secours: 'OPT3' }, { nom: 'OPT2', ports: [9, 16], secours: 'OPT4' }],
  'novastar-novapro-uhd': [{ nom: 'OPT1', ports: [1, 8], secours: 'OPT3' }, { nom: 'OPT2', ports: [9, 16], secours: 'OPT4' }],
  'novastar-mctrl660-pro': [{ nom: 'OPT1', ports: [1, 6], secours: 'OPT2' }],
};

// Nombre saisi : vide (null), ou entier de 1 à 999. `unite` : 'port' ou 'ligne'.
export function nombreImpose(n, unite) {
  if (n === null || n === undefined || n === '') return { valeur: null, refus: null };
  if (!Number.isInteger(n) || n < 1 || n > IMPOSE_MAX) return { valeur: undefined, refus: `Nombre de ${unite}s imposé : un nombre entier de 1 à ${IMPOSE_MAX}, ou vide.` };
  return { valeur: n, refus: null };
}

export { LIBELLE_IMPOSEE };

// Mur en zones, de forme libre, mixte ou tourné hors axe : refusé en V1 (choix de conception n° 3 de la spec).
export const refusMurImpose = (m) => (plusieursZones(m) ? REFUS_MUR : null);

// `n` ports répartis entre les processeurs au prorata de leurs colonnes (choix n° 1) : au moins un chacun, puis le reste
// au plus fort reste (à égalité, le premier). 3 ports pour 9 + 8 colonnes : 2 + 1.
export function repartirAuProrata(n, colonnes) {
  if (n < colonnes.length) return { refus: `${pluriel(n, 'port')} pour ${colonnes.length} processeurs : au moins un port par processeur.` };
  const total = colonnes.reduce((a, b) => a + b, 0);
  const quotas = colonnes.map((c) => (n * c) / total);
  const parts = quotas.map((q) => Math.max(1, Math.floor(q)));
  while (parts.reduce((a, b) => a + b, 0) > n) {
    const i = parts.reduce((k, p, j) => (p > 1 && (k < 0 || p >= parts[k]) ? j : k), -1);
    parts[i] -= 1;
  }
  while (parts.reduce((a, b) => a + b, 0) < n) {
    const i = quotas.reduce((k, q, j) => (q - parts[j] > quotas[k] - parts[k] ? j : k), 0);
    parts[i] += 1;
  }
  return { parts };
}

// Ports (ou lignes) imposés d'un bloc de `colonnes` colonnes : colonnes entières, le plus égal possible, les plus
// grands d'abord depuis le côté de départ (5 en 2 : 3 + 2). Plus de ports que de colonnes : seulement quand une colonne
// dépasse un port (`segmentsMin` segments au moins) et que chaque colonne prend le même nombre de segments égaux.
export function taillesImposees(n, colonnes, { unite = 'port', segmentsMin = null, parColonne = Infinity } = {}) {
  if (n <= colonnes) return { tailles: repartir(colonnes, n) };
  const s = n / colonnes;
  if (segmentsMin && Number.isInteger(s) && s >= segmentsMin && s <= parColonne) return { segments: repartir(parColonne, s) };
  return { refus: `${n} ${unite}s pour ${pluriel(colonnes, 'colonne')} : une colonne serait coupée ; par rangées dans le Schéma.` };
}

// Plan des ports imposés d'un mur : refus du mur ou du nombre, répartition entre processeurs, ports de chaque processeur
// face aux siens (en redondance, ses ports principaux).
export function planPortsImposes(m, evaluation, ports) {
  const refusMur = refusMurImpose(m);
  if (refusMur) return { valeur: undefined, parProcesseur: null, refus: [refusMur] };
  const n = nombreImpose(ports, 'port');
  if (n.refus) return { valeur: undefined, parProcesseur: null, refus: [n.refus] };
  if (n.valeur === null) return { valeur: null, parProcesseur: null, refus: [] };
  const proc = evaluation.processeur;
  const { redondance, modeOptique } = evaluation.reglages;
  const r = repartirAuProrata(n.valeur, evaluation.groupes.map((g) => g.colonnes));
  if (r.refus) return { valeur: n.valeur, parProcesseur: null, refus: [r.refus] };
  const limite = modeOptique && proc.portsOptionOptique ? proc.portsOptionOptique : proc.ports;
  const max = redondance ? proc.portsRedondance ?? Math.floor(limite / 2) : limite;
  const plusieurs = r.parts.length > 1;
  const refus = r.parts.map((k, i) => (k > max
    ? `${plusieurs ? `Processeur n° ${i + 1} : ` : ''}${pluriel(k, 'port')} : le ${proc.modele} a ${pluriel(max, 'port')}${redondance ? ' principaux en redondance' : ''}.`
    : null)).filter(Boolean);
  return { valeur: n.valeur, parProcesseur: r.parts, refus };
}

// Écart signé avec le conseil : « 1 port de plus », « 2 lignes de moins », « comme le conseil ».
export function ecartImpose(n, conseil, unite) {
  if (!Number.isInteger(n)) return null;
  const d = n - conseil;
  return { valeur: d, texte: d === 0 ? 'comme le conseil' : `${pluriel(Math.abs(d), unite)} de ${d > 0 ? 'plus' : 'moins'}` };
}

const metres = (m) => (m >= 1000 ? `${nombreCourt(m / 1000, 1)} km` : `${nombreCourt(m)} m`);

// Portée de la fibre d'un convertisseur : la plus courte de ses fiches, et le texte de toutes les valeurs.
function porteeDe(fiche) {
  const s = fiche?.sources?.porteeFibreM;
  if (!(fiche?.porteeFibreM > 0)) return { porteeM: null, porteeTexte: null };
  const valeurs = s ? [s, ...s.autres] : [];
  const detail = valeurs.length > 1 ? `${s.note ?? valeurs.map((g) => metres(g.valeur)).join(' ou ')} ; ` : '';
  return { porteeM: fiche.porteeFibreM, porteeTexte: `${detail}${valeurs.map((g) => minuscule(g.source.court)).filter((c, i, t) => t.indexOf(c) === i).join(', ')}` };
}

// Brompton S4, S8, M2 et T1 (étape 18c3) : « The Tessera Protocol can be transmitted over standard gigabit ethernet
// compliant fibre optic hardware for single runs exceeding this distance », et « fibre optic transceivers count as
// switches » dans la limite de cinq (manuel Tessera V3.5, § 13.1.2, p. 220).
const SOURCE_FIBRE_BROMPTON = 'manuel Tessera V3.5, § 13.1.2, p. 220';
export const TRANSCEIVER_BROMPTON = 'Transceiver fibre Gigabit Ethernet';

// Passer en fibre (spec § 4.3) : le convertisseur que la fiche du processeur prévoit, compté par processeur (un
// convertisseur n'appartient qu'à un processeur). `ports` : ports principaux de chaque processeur.
// Options : distributeurs (fiches résolues de la base), paire (CVT310 par défaut, choix n° 6).
// Pour la liste de matériel et le guide (18c3) : `type` (deja, copie, paires, transceivers, aucun), `designation` d'un
// convertisseur, `nombreFibres` (copie : les OPT qui portent les ports, par processeur, et leurs secours en redondance ;
// sans table des OPT, une par convertisseur, secours à vérifier ; paires : une par paire), `origine` du câble de tête
// au pied du mur (à la suite du nom du port), `noeuds` sur chaque trajet (réseau Brompton).
export function fibreImposee(evaluation, ports, { distributeurs = [], paire = PAIRE_DEFAUT } = {}) {
  const proc = evaluation.processeur;
  const { redondance } = evaluation.reglages;
  const fiche = (id) => distributeurs.find((d) => d.id === id) ?? null;
  const modele = (id) => MODELES_DISTRIBUTEUR[id] ?? fiche(id)?.modele ?? id;
  const vide = {
    possible: false, deja: false, type: 'aucun', modele: null, designation: null, convertisseurs: null, paires: null, portsNonUtilises: null, fibres: [], fibresSecours: [],
    nombreFibres: 0, fibresSecoursAVerifier: false, origine: null, noeuds: 0, aConfirmer: false, porteeM: null, porteeTexte: null, note: null,
  };
  if (evaluation.distributeurObligatoire ?? proc.distributeurObligatoire) {
    return { ...vide, possible: true, deja: true, type: 'deja', modele: modele(proc.distributeur), texte: `Le ${proc.modele} passe déjà en fibre par ses ${modele(proc.distributeur)} : la case « Passer en fibre » ne change rien.` };
  }
  // Ports utilisés de chaque processeur, secours compris (convention port p + moitié des ports).
  const utilises = ports.map((n) => (redondance && !proc.portsRedondance ? 2 * n : n));
  const totalUtilises = utilises.reduce((a, b) => a + b, 0);
  if (proc.sortiesFibre === 'aucune' && proc.famille === 'novastar') {
    const f = fiche(paire) ?? fiche(PAIRE_DEFAUT);
    const m = f?.modele ?? modele(paire);
    return {
      ...vide, possible: true, type: 'paires', modele: m, designation: m, paires: totalUtilises, convertisseurs: 2 * totalUtilises, nombreFibres: totalUtilises,
      origine: `, depuis son ${m} au pied du mur`, ...porteeDe(f),
      texte: `Passer en fibre : ${pluriel(totalUtilises, 'paire')} de ${m}${f?.fibre ? ` (${f.fibre})` : ''}, une par port`
        + `${redondance ? ', secours compris' : ''} : un convertisseur côté régie, l'autre au pied du mur ; le ${proc.modele} n'a pas de sortie fibre.`,
    };
  }
  if (proc.famille === 'brompton') {
    return {
      ...vide, possible: true, type: 'transceivers', modele: 'transceivers fibre Gigabit Ethernet', designation: TRANSCEIVER_BROMPTON, paires: totalUtilises,
      convertisseurs: 2 * totalUtilises, nombreFibres: totalUtilises, origine: ', depuis son transceiver fibre au pied du mur', noeuds: 2,
      texte: `Passer en fibre : ${pluriel(totalUtilises, 'paire')} de transceivers fibre Gigabit Ethernet, une par port${redondance ? ', secours compris' : ''} : `
        + 'un côté régie, l\'autre au pied du mur ; modèle à choisir (Brompton n\'en nomme pas), portée selon le transceiver. Chaque transceiver compte '
        + `comme un switch : 2 sur chaque trajet, 5 au plus entre le ${proc.modele} et la dalle la plus loin (${SOURCE_FIBRE_BROMPTON}).`,
    };
  }
  const sorties = proc.sortiesParDistributeur;
  if (!proc.distributeur || !sorties) return { ...vide, texte: `Aucun convertisseur fibre dans la base pour le ${proc.modele} : à vérifier.` };
  const f = fiche(proc.distributeur);
  const nombres = utilises.map((u) => Math.ceil(u / sorties));
  const convertisseurs = nombres.reduce((a, b) => a + b, 0);
  const portsNonUtilises = nombres.reduce((t, k, i) => t + k * sorties - utilises[i], 0);
  // Fibres : celles qui portent un port utilisé (secours compris) ; en redondance, leurs fibres de secours.
  const moitie = Math.floor(proc.ports / 2);
  const numeros = new Set(ports.flatMap((n) => Array.from({ length: n }, (_, j) => j + 1)).flatMap((p) => (redondance && !proc.portsRedondance ? [p, p + moitie] : [p])));
  const table = (FIBRES_SORTIE[proc.id] ?? []).filter((x) => [...numeros].some((p) => p >= x.ports[0] && p <= x.ports[1]));
  const fibres = table.map((x) => x.nom);
  const fibresSecours = redondance ? table.map((x) => x.secours) : [];
  // Fibres de chaque processeur : celles qui portent ses ports (ses secours compris), doublées en redondance.
  const tableComplete = FIBRES_SORTIE[proc.id] ?? null;
  const nombreFibres = tableComplete
    ? ports.reduce((t, n) => {
      const siens = Array.from({ length: n }, (_, j) => j + 1).flatMap((q) => (redondance && !proc.portsRedondance ? [q, q + moitie] : [q]));
      const k = tableComplete.filter((x) => siens.some((q) => q >= x.ports[0] && q <= x.ports[1])).length;
      return t + (redondance ? 2 * k : k);
    }, 0)
    : convertisseurs;
  const aConfirmer = proc.sources?.sortiesParDistributeur?.source?.confiance !== 'constructeur';
  const note = proc.sources?.sortiesFibre?.note ?? null;
  const portsFibre = table.map((x) => {
    const sur = [...numeros].filter((p) => p >= x.ports[0] && p <= x.ports[1]).sort((a, b) => a - b);
    return `${x.nom} (port${sur.length > 1 ? `s ${sur[0]} à ${sur[sur.length - 1]}` : ` ${sur[0]}`})`;
  });
  const m = modele(proc.distributeur);
  return {
    ...vide, possible: true, type: 'copie', modele: m, designation: m, convertisseurs, portsNonUtilises, fibres, fibresSecours, aConfirmer, note, ...porteeDe(f),
    nombreFibres, fibresSecoursAVerifier: Boolean(redondance && !tableComplete), origine: ` du ${m}, au pied du mur`,
    texte: `Passer en fibre : ${convertisseurs} ${m}${nombres.length > 1 ? ` (${nombres.join(' + ')}, un jeu par processeur)` : ''} au pied du mur `
      + `(${sorties} ports${convertisseurs > 1 ? ' chacun' : ''}, ${portsNonUtilises} non utilisé${portsNonUtilises > 1 ? 's' : ''})`
      + `${portsFibre.length ? ` ; fibre${portsFibre.length > 1 ? 's' : ''} ${portsFibre.join(' et ')}` : ''}`
      + `${fibresSecours.length ? `, ${fibresSecours.join(' et ')} en secours` : ''}`
      + `${aConfirmer ? ` ; convertisseur d'après le ${minuscule(proc.sources?.sortiesParDistributeur?.source?.court) ?? 'cahier des charges du projet'}, à confirmer${note ? ` ; fiche du ${proc.modele} : ${note}` : ''}` : ''}.`,
  };
}

// Alerte de portée : la fibre la plus longue face à la portée retenue du convertisseur.
export function alertePortee(fibre, fibreMaxM) {
  if (!fibre?.porteeM || !(fibreMaxM > fibre.porteeM)) return null;
  return `Fibre de ${nombreCourt(fibreMaxM, 1)} m (régie–mur, mou compris) : au-delà des ${metres(fibre.porteeM)} du ${fibre.modele}`
    + `${fibre.porteeTexte ? ` (${fibre.porteeTexte})` : ''}.`;
}

// Textes du conseil rappelé sous la config imposée.
export function texteConseilPorts(conseil, ecart) {
  const pl = conseil.ports > 1 ? 'port le plus chargé : ' : '';
  return `Conseil de l'appli : ${pluriel(conseil.ports, 'port')} (${pl}${nombre(conseil.px)} px, ${nombre(conseil.taux * 100, 1)} %)`
    + `${ecart ? ` ; écart : ${ecart.texte}` : ''}.`;
}
export function texteConseilLignes(conseil, ecart) {
  return `Conseil de l'appli : ${pluriel(conseil.lignes, 'ligne')}${ecart ? ` ; écart : ${ecart.texte}` : ''}.`;
}
export const textePortsImposes = (n, pxMax, capacite) => `${pluriel(n, 'port')} imposé${n > 1 ? 's' : ''} : port le plus chargé ${nombre(pxMax)} px pour ${nombre(capacite)} px, ça passe.`;
