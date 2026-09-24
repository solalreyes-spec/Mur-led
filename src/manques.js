// Manques de la fiche qui touchent le calcul d'un onglet : une seule ligne repliable, avec la conséquence
// de chaque manque ; le détail reste dans la ligne dépliée, et la liste complète dans l'onglet Base.

import { el } from './dom.js';

const CONSEQUENCES = {
  pMaxW: 'P max absente, estimée avec le repère de 1 kVA/m²',
  carteReceptionModele: 'carte de réception non précisée, compatibilité non vérifiée',
  maxAccroche: 'maximum en accroche absent, non contrôlé',
  maxStack: 'maximum en stack absent, non contrôlé',
};

// Alertes du calcul sans celles déjà reprises dans la ligne des manques.
export function alertesSansManques(alertes, manques = []) {
  const textes = new Set(manques.map((m) => m.texte));
  return alertes.filter((a) => !textes.has(a));
}

export function ligneManques(manques = []) {
  if (manques.length === 0) return null;
  const resume = [...new Set(manques.map((m) => CONSEQUENCES[m.champ] ?? m.champ))].join(' ; ');
  return el('details', { class: 'alerte manques' },
    el('summary', {}, `Fiche incomplète : ${resume}.`),
    manques.map((m) => el('p', {}, m.texte)),
    el('p', { class: 'note' }, 'Liste complète de ce qui manque à la fiche : onglet Base.'));
}
