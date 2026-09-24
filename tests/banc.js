// Contrôle du banc de test lui-même : si ces vérifications échouent,
// les résultats des 13 cas ne sont pas fiables.

import * as calculs from '../src/calculs.js';
import { creerVerif, executerCas } from './verif.js';

export const BANC = [
  {
    id: 'B1',
    titre: 'src/calculs.js se charge comme module ES',
    verifier(v) {
      v.vrai('module chargé', typeof calculs === 'object');
    },
  },
  {
    id: 'B2',
    titre: 'egal accepte deux valeurs identiques',
    verifier(v) {
      const w = creerVerif();
      w.egal('3 = 3', 3, 3);
      w.egal('[176, 176] = [176, 176]', [176, 176], [176, 176]);
      v.vrai('nombres identiques acceptés', w.controles[0].ok);
      v.vrai('tableaux identiques acceptés', w.controles[1].ok);
    },
  },
  {
    id: 'B3',
    titre: 'egal signale un écart',
    verifier(v) {
      const w = creerVerif();
      w.egal('15 624 contre 15 625', 15624, 15625);
      w.egal('"10" contre 10', '10', 10);
      v.vrai('écart de 1 détecté', w.controles[0].ok === false);
      v.vrai('texte et nombre distingués', w.controles[1].ok === false);
    },
  },
  {
    id: 'B4',
    titre: 'proche respecte la tolérance',
    verifier(v) {
      const w = creerVerif();
      w.proche('432,5376 contre 432,54 ± 0,005', 432.5376, 432.54, 0.005);
      w.proche('432,5376 contre 432,53 ± 0,005', 432.5376, 432.53, 0.005);
      v.vrai('dans la tolérance : accepté', w.controles[0].ok);
      v.vrai('hors tolérance : refusé', w.controles[1].ok === false);
    },
  },
  {
    id: 'B5',
    titre: 'statut de chaque cas',
    verifier(v) {
      v.egal('cas sans vérification', executerCas({}).statut, 'a-venir');
      v.egal('cas sans contrôle', executerCas({ verifier() {} }).statut, 'erreur');
      v.egal('cas qui plante', executerCas({ verifier() { throw new Error('test'); } }).statut, 'erreur');
      v.egal('cas réussi', executerCas({ verifier(w) { w.egal('x', 1, 1); } }).statut, 'reussi');
      v.egal('cas en échec', executerCas({ verifier(w) { w.egal('x', 1, 2); } }).statut, 'echec');
    },
  },
];
