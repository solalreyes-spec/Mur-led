// Code couleur du câblage (audit terrain du 02/10/2026, lot 2). Le numéro du port ou de la ligne reste l'identifiant ;
// la couleur le renforce seulement (en mode rouge, toutes les couleurs deviennent rouges). Fonctions pures.
// Data : une couleur par port, dans l'ordre des ports, 7 couleurs puis on recommence ; pas d'orange, réservé aux
// retours de secours. Élec : la couleur de la phase (L1 marron, L2 noir avec un liseré clair, L3 gris ; monophasé :
// marron) et, pour les lignes d'une même phase, un motif (trait plein, tirets, pointillés, tiret-point).
// Écran : variables de styles.css (--port-1 à --port-7, --phase-1 à --phase-3, --phase-lisere) ; export sur fond
// blanc : couleurs d'impression ci-dessous. Au moins 3:1 sur chaque fond, chiffres des pastilles à 4,5:1 (test N11).

export const COULEURS_PORTS = [
  { nom: 'bleu', export: '#0b5cad' },
  { nom: 'jaune', export: '#6e5a00' },
  { nom: 'vert', export: '#1d7a34' },
  { nom: 'rose', export: '#a8246a' },
  { nom: 'turquoise', export: '#00706a' },
  { nom: 'violet', export: '#6a3fc0' },
  { nom: 'rouge', export: '#b3261e' },
];

export const COULEURS_PHASES = {
  1: { nom: 'marron', export: '#6f421b' },
  2: { nom: 'noir', export: '#000000', lisere: true },
  3: { nom: 'gris', export: '#61666e' },
};

export const MOTIFS = [
  { id: 'plein', nom: 'trait plein' },
  { id: 'tirets', nom: 'tirets' },
  { id: 'points', nom: 'pointillés' },
  { id: 'tiret-point', nom: 'tiret-point' },
];

// Couleur d'un port d'après son rang dans le câblage (0 pour le premier port du premier processeur).
export function couleurPort(rang) {
  const i = rang % COULEURS_PORTS.length;
  return { cle: `port-${i + 1}`, nom: COULEURS_PORTS[i].nom, export: COULEURS_PORTS[i].export, lisere: false, motif: MOTIFS[0] };
}

// Style de chaque ligne électrique : couleur de sa phase (marron en monophasé), motif selon son rang parmi les lignes
// de la même phase. `lignes` : [{ numero, phase }] dans l'ordre des lignes.
export function stylesLignes(lignes, { mono = false } = {}) {
  const vues = new Map();
  return lignes.map((l) => {
    const phase = mono ? 1 : l.phase;
    const rang = vues.get(phase) ?? 0;
    vues.set(phase, rang + 1);
    const c = COULEURS_PHASES[phase];
    return { cle: `phase-${phase}`, nom: c.nom, export: c.export, lisere: Boolean(c.lisere), motif: MOTIFS[rang % MOTIFS.length] };
  });
}

// Ports d'une variante de câblage data (calculs.cablageData), dans l'ordre, avec leur processeur et leur couleur.
export function portsEnCouleurs(variante) {
  if (!variante?.processeurs) return [];
  let rang = 0;
  return variante.processeurs.flatMap((p) => p.ports.map((port) => {
    const couleur = couleurPort(rang);
    rang += 1;
    return { processeur: p.numero, modele: p.modele, numero: port.numero, libelle: port.libelle, dalles: port.dalles, taux: port.taux, couleur };
  }));
}
