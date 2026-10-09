// Cas réels : murs de prestas de l'utilisateur, lus sur leurs synoptiques (les synoptiques ne sont pas publiés).
// Jamais le nom du client, de la salle ou du prestataire : « cas réel n ».

import * as calculs from '../src/calculs.js';
import { dalleDeBase, processeurDeBase, liaisonsDeBase } from './base.js';

// Cas réel 1 (étape 9a, mur en plusieurs zones) : cinq zones côte à côte, de gauche à droite vu de face.
const ZONES_CAS_REEL_1 = [['C', 14], ['B-C', 9], ['B', 14], ['A-B', 9], ['A', 14]].map(([nom, colonnes]) => ({ nom, colonnes, rangees: 8 }));

export const CAS_REELS = [
  {
    id: 'réel 1',
    etiquette: 'Cas réel 1',
    titre: 'Cinq zones séparées par des vides, trois MCTRL4K',
    donnees: 'Unilumin Upad IV 2.6 ; zones C, B-C, B, A-B et A de 14, 9, 14, 9 et 14 colonnes sur 8 rangées ; 84 px entre deux zones '
      + 'dans la pixel map ; MCTRL4K à 50 Hz en 8 bits, sans redondance',
    attendu: 'pixel map de 11 856 × 1536 px ; 3 MCTRL4K ; blocs de 3924, 4008 et 3924 px ; 10, 11 et 10 ports ; une zone recommence '
      + 'toujours un port (3 colonnes : 2 + 1)',
    source: 'Synoptiques data de la presta (cas réel 1) ; valeurs calculées par les règles de l\'appli : choix de conception du projet',
    etape: '9a',
    verifier(v, contexte) {
      const dalle = dalleDeBase(contexte, 'unilumin-upad-iv-2-6');
      const proc = processeurDeBase(contexte, 'novastar-mctrl4k');
      const m = calculs.murZones(dalle, ZONES_CAS_REEL_1, { ecarts: 'main', ecartsPx: [84, 84, 84, 84] });

      // Valeurs lues sur le synoptique.
      v.egal('dalles', m.dalles.total, 480);
      v.egal('pixel map du mur (px)', [m.pxLargeur, m.pxHauteur], [11856, 1536]);
      v.egal('X des zones dans la pixel map', m.zones.map((z) => z.x), [0, 2772, 4584, 7356, 9168]);
      v.egal('Y des zones dans la pixel map', m.zones.map((z) => z.y), [0, 0, 0, 0, 0]);
      v.egal('écarts dans la pixel map', m.ecarts.map((e) => e.px), [84, 84, 84, 84]);
      const e = calculs.evaluerProcesseur(m, dalle, proc, { frequenceHz: 50, bits: 8 });
      v.egal('calcul possible', e.impossible ?? null, null);
      v.egal('processeurs', e.nombre, 3);
      v.egal('blocs (largeur × hauteur, px)', e.groupes.map((g) => [g.largeurPx, g.hauteurPx]), [[3924, 1536], [4008, 1536], [3924, 1536]]);
      v.egal('morceaux de zones par bloc (nom, colonnes)', e.groupes.map((g) => g.parties.map((p) => `${p.nomAffiche} ${p.colonnes}`)),
        [['C 14', 'B-C 1/2 6'], ['B-C 2/2 3', 'B 14', 'A-B 1/2 3'], ['A-B 2/2 6', 'A 14']]);
      v.egal('ports par bloc', e.groupes.map((g) => g.ports.colonnes), [10, 11, 10]);
      v.egal('ports par morceau de zone', e.groupes.map((g) => g.parties.map((p) => p.ports.colonnes)), [[7, 3], [2, 7, 2], [3, 7]]);
      v.egal('numéros des ports du processeur 2 (B-C 2/2, B, A-B 1/2)', e.groupes[1].parties.map((p) => [p.ports.premier, p.ports.dernier]),
        [[1, 2], [3, 9], [10, 11]]);
      v.egal('un CVT4K par processeur', e.groupes.map((g) => g.distributeurs.colonnes), [1, 1, 1]);

      // Valeurs données par les règles de l'appli (choix de conception du projet).
      v.egal('capacité par port à 50 Hz en 8 bits', e.capacite, 780000);
      v.egal('colonnes par port', e.global.colonnes.colonnesParPort, 2);
      v.egal('pixels utiles (sans les vides)', m.pxTotal, 17694720);
      v.egal('sortie de chaque processeur dans la pixel map du mur (X, Y)', e.groupes.map((g) => [g.x[0], g.y[0]]), [[0, 0], [3924, 0], [7932, 0]]);
      v.egal('morceaux de zones dans l\'entrée du processeur (X)', e.groupes.map((g) => g.parties.map((p) => p.dansEntree.x)),
        [[0, 2772], [0, 660, 3432], [0, 1236]]);
      v.egal('morceaux de zones dans l\'entrée du processeur (Y)', e.groupes.map((g) => g.parties.map((p) => p.dansEntree.y)),
        [[0, 0], [0, 0, 0], [0, 0]]);
      const source = calculs.sourceConseillee(e, liaisonsDeBase(contexte), 50);
      v.egal('source conseillée : 4096 × 2160 à 50 Hz (plus grand bloc 4008 × 1536)',
        [source.largeurPx, source.hauteurPx, source.frequenceHz, source.raison], [4096, 2160, 50, 'standard']);
      v.egal('seuil : 2 colonnes de moins dans une seule zone, n\'importe laquelle, pour 2 MCTRL4K',
        [e.seuil.colonnesEnMoins, e.seuil.zonesEnMoins], [2, ['C', 'B-C', 'B', 'A-B', 'A']]);
      const p = calculs.poids(m, dalle, { mode: 'stack', cablesKgParDalle: 0 });
      v.egal('poids des dalles par zone (6,3 kg, fiche)', p.zones.map((z) => z.dallesKg), [705.6, 453.6, 705.6, 453.6, 705.6]);
      v.egal('poids des dalles au total', p.dallesKg, 3024);

      // Mode « comme l'écart réel » : 219 mm au pas de 2,604 mm donnent les mêmes 84 px.
      const reel = calculs.murZones(dalle, ZONES_CAS_REEL_1.map((z, i) => ({ ...z, ecartMm: i > 0 ? 219 : undefined })), { ecarts: 'reel' });
      v.egal('écart réel de 219 mm : 84 px, même pixel map', [reel.ecarts.map((x) => x.px), reel.pxLargeur, reel.pxHauteur],
        [[84, 84, 84, 84], 11856, 1536]);
      v.egal('taille réelle avec 219 mm d\'écart (mm)', [reel.largeurMm, reel.hauteurMm], [30876, 4000]);
    },
  },
];
