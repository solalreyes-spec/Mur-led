// Secours par un second processeur (étape 22, lot 22b) : textes et règle d'affichage partagés par Data, Canvas, le
// Schéma, le guide de montage et les textes copiés. Fonctions pures, sans interface.

// Choix « Secours » et « Liaison » de Data (spec § 5.1) : visibles avec la redondance, pour la marque Novastar, un
// processeur réglé dans NovaLCT (choisi à la main ou conseillé), ou le conseil toutes marques quand le parc a un
// processeur NovaLCT (le réglage change alors la comparaison). Cachés, ils gardent leur valeur et ne comptent pas.
export function choixSecoursVisible({ redondance, famille, mode, processeur = null, novaLCTDansParc = false }) {
  if (!redondance) return false;
  if (famille === 'novastar') return true;
  if (mode === 'conseille-tout') return Boolean(novaLCTDansParc);
  return processeur?.logiciel === 'NovaLCT';
}

// « 1 × MCTRL4K + 1 de secours » ; sans processeur de secours, « 2 × MCTRL4K ».
export const texteProcesseurs = (r, nom = r.processeur.modele) => `${r.nombre} × ${nom}${r.nombreSecours > 0 ? ` + ${r.nombreSecours} de secours` : ''}`;

// Cadre et textes du processeur de secours : « MCTRL4K secours n° 3 » (choix de l'utilisateur au lot 22b).
export const nomSecours = (modele, numero) => `${modele} secours n° ${numero}`;

// Repère du bout d'un retour de secours : « 3.1 » (processeur de secours . port) pour un second processeur ; sinon le
// repère d'avant (« 9 », « 1.9 » avec plusieurs processeurs).
export function repereSecours(secours, numeroProcesseur, plusieurs) {
  if (!secours) return null;
  if (secours.processeur) return `${secours.processeur}.${secours.numero}`;
  return plusieurs ? `${numeroProcesseur}.${secours.numero}` : `${secours.numero}`;
}

// Où arrive le retour de secours d'un port : « MCTRL4K secours n° 3, port 1 », ou « port 9 » dans le même processeur.
export const texteSecoursPort = (secours, modele) => (secours.processeur ? `${modele} ${secours.libelle}` : secours.libelle);
