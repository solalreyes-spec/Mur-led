// Logique de calcul du mur LED : fonctions pures, sans accès à l'interface.
// Règles et données : cahier des charges du projet.
// Les calculs se font en valeurs exactes ; l'arrondi n'intervient qu'à l'affichage.
// Unités internes : millimètres et pixels.
//
// Point d'entrée : le code est réparti en modules par domaine dans src/calculs/ (étape 10a). Ce fichier réexporte
// tout ce que les écrans et les tests utilisent. Couches, de la plus basse à la plus haute : commun, valeurs-sourcees,
// mur, morceaux, forme-reelle, mur-zones, capacites, ports, decoupage, processeur, elec, poids, pixel-map, cablage,
// distribution, canvas, regies. Un module n'importe que des couches plus basses et ne lit au chargement aucune valeur
// d'un autre module, sauf de commun.js : pas d'import circulaire.

export { ErreurSaisie, COINS, LIBELLES_COIN } from './calculs/commun.js';
export { PLUS_DEFAVORABLE, valeurRetenue, resoudreFiche, valeursEnConflit } from './calculs/valeurs-sourcees.js';
export { pitchCalculeMm, densite, DALLES_MAX_MUR, verifierNombreDalles, mur, dimensionner, pitchLePlusFin, pixelsInterpoles } from './calculs/mur.js';
export { limitesCourbure, grandeursCourbure, aFormeReelle, formeReelle } from './calculs/forme-reelle.js';
export { ZONES_MAX, NOM_ZONE_MAX, murZones } from './calculs/mur-zones.js';
export { DEBIT_UTILE_BPS, BIT_DEPTH_PAR_DEFAUT, SEUIL_CHARGE_PORT, rappelTessera, entierInferieur, capacitePort,
  formuleCapacite, refusBitsReseau, capacitePortProcesseur, champsManquants, controleCarteReception, familleDeCarte,
  verifierCarte, pixelsComptes, pixelsComptesMapping, dallesParPort, alerteBitDepthSource, chargePort,
  penaliteLargeurChargee, capaciteHelios, texteCable5G, MODELES_DISTRIBUTEUR } from './calculs/capacites.js';
export { cablage, canvasProcesseur } from './calculs/ports.js';
export { lignesDeCoupe } from './calculs/decoupage.js';
export { pixelsPourClassement, pixelsMaxSelonFrequence, evaluerProcesseur, alternativeSX40, evaluerToutesMarques,
  processeurConseille, gainDixBits } from './calculs/processeur.js';
export { TENSION_CALCUL_V, TENSION_THEORIQUE_V, MARGE_DEFAUT, DEPART_DEFAUT_A, ARRIVEES, SEUILS_MAGNETIQUES,
  W_PAR_M2_SANS_FICHE, BTU_PAR_W, puissanceUtileLigne, dallesParLigne, pMaxDalle, electricite } from './calculs/elec.js';
export { PARTS_PONT, RAPPELS_POIDS, poids } from './calculs/poids.js';
export { SURFACE_MAX_IMAGE, idDalle, idDalleZone, dallesDuMur, pixelMap, positionsDalles, coinsTournes, ENTETE_CSV,
  texteCSV, texteOBJ, pixelMapPliee, dalleTournee, tuilesImage, motifPixelMap } from './calculs/pixel-map.js';
export { MARGE_MOU_DEFAUT, coinDepart, MENTION_AU_PLUS_JUSTE, cablageData, cablageElec } from './calculs/cablage.js';
export { SEUIL_BOITIERS_M, PRISES_BOITIER_DEFAUT, PRISES_BOITIER, distributionElec } from './calculs/distribution.js';
export { RESOLUTIONS_STANDARD, frequencePixel, controleLiaison, controleEntree, controleSource, meilleureEntree,
  sourceConseillee, plierBloc, pliageSortie, pliagePropose } from './calculs/canvas.js';
export { modesSortieRegie, budgetRegie, uniteCouche, sortiesTypesRegie, champsManquantsRegie, controleRegie,
  latenceChaine, controleCadence, reseauBrompton, SEUILS_LONGUEUR_M, controleLongueur, controleLongueurLiaison,
  FAMILLES_APPAREILS, maillonDepuisFiche, CONVERTISSEURS_MAX, controleChaine } from './calculs/regies.js';
