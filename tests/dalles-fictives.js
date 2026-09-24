// Dalles utilisées par les tests. Elles restent ici, jamais dans la base de l'appli (data/).
// Même forme que les fiches résolues par calculs.resoudreFiche : valeurs simples, en mm et en px.

// Dalles fictives des cas tests du cahier des charges.
export const P10 = { id: 'fictive-p10', nom: 'P10 fictive (cas 1 et 2)', fictive: true, largeurMm: 640, hauteurMm: 640, pxH: 64, pxV: 64 };
export const P5 = { id: 'fictive-p5', nom: 'P5 fictive (cas 2)', fictive: true, largeurMm: 320, hauteurMm: 320, pxH: 64, pxV: 64 };
// P16 en DIP 2R1G1B : 1 pixel = 4 LED.
export const P16_DIP = { id: 'fictive-p16', nom: 'P16 DIP fictive (cas 3)', fictive: true, largeurMm: 256, hauteurMm: 256, pxH: 16, pxV: 16, ledsParPixel: 4 };
// Dalle du récapitulatif du cahier des charges (cas 13).
export const DALLE_CAS_13 = { id: 'fictive-cas-13', nom: 'Dalle du cas 13', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192, poidsKg: 7.5, pMaxW: 130 };
// Cabinets et dalles des cas data. Les millimètres des cas 4 et 6 ne sont pas donnés : valeurs fictives sans effet sur la data.
export const CABINET_CAS_4 = { id: 'fictive-cas-4', nom: 'Cabinet 64 × 48 px (cas 4)', fictive: true, largeurMm: 640, hauteurMm: 480, pxH: 64, pxV: 48 };
export const CABINET_CAS_5 = { id: 'fictive-cas-5', nom: 'Cabinet 500 × 1000 mm (cas 5)', fictive: true, largeurMm: 500, hauteurMm: 1000, pxH: 192, pxV: 384 };
export const DALLE_CAS_6 = { id: 'fictive-cas-6', nom: 'Dalle 208 × 104 px (cas 6)', fictive: true, largeurMm: 1200, hauteurMm: 600, pxH: 208, pxV: 104 };
export const DALLE_CAS_7 = { id: 'fictive-cas-7', nom: 'Dalle 500 mm, 192 px (cas 7)', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 };

// Dalles fictives des règles de l'étape 2.
export const DALLE_64 = { id: 'fictive-64', nom: 'Dalle 64 × 64 px', fictive: true, largeurMm: 400, hauteurMm: 400, pxH: 64, pxV: 64 };
export const DALLE_64X32 = { id: 'fictive-64x32', nom: 'Dalle 64 × 32 px', fictive: true, largeurMm: 500, hauteurMm: 250, pxH: 64, pxV: 32 };
export const DALLE_16 = { id: 'fictive-16', nom: 'Dalle 16 × 16 px', fictive: true, largeurMm: 160, hauteurMm: 160, pxH: 16, pxV: 16 };

// Copies des fiches CB5 MKII du cahier des charges du projet, pour tester les règles de dimensionnement.
export const CB5 = { id: 'test-cb5', nom: 'CB5 MKII (copie de test)', largeurMm: 600, hauteurMm: 1200, pxH: 104, pxV: 208, poidsKg: 13.6, pMaxW: 480, demiDalle: 'test-cb5-demi' };
export const CB5_DEMI = { id: 'test-cb5-demi', nom: 'CB5 MKII demi-dalle (copie de test)', largeurMm: 600, hauteurMm: 600, pxH: 104, pxV: 104, poidsKg: 7.2, pMaxW: 250, demiDe: 'test-cb5' };

// Demi-dalle dont la fiche diffère volontairement de la moitié de la dalle entière (100 px au lieu de 104) :
// prouve que le calcul lit la fiche de la demi-dalle.
export const CB5_DEMI_ATYPIQUE = { ...CB5_DEMI, id: 'test-cb5-demi-atypique', pxV: 100 };
// Demi-dalle moins large que la dalle entière : ne peut pas former une rangée.
export const DEMI_TROP_ETROITE = { ...CB5_DEMI, id: 'test-demi-etroite', largeurMm: 500, pxH: 88 };
// Dalle de 256 px pour le préréglage 4K DCI (16 × 256 = 4096 px).
export const DALLE_256 = { id: 'fictive-256', nom: 'Dalle 256 × 256 px', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 256, pxV: 256 };

// Dalles fictives de l'étape 2b : carte de réception connue ou non, pour le CX40 Pro (cartes 5G seulement).
export const DALLE_CARTE_A10S = { ...DALLE_CAS_7, id: 'fictive-carte-a10s', nom: 'Dalle à carte A10s', carteReceptionMarque: 'Novastar', carteReceptionModele: 'A10s' };
export const DALLE_CARTE_CA50E = { ...DALLE_CAS_7, id: 'fictive-carte-ca50e', nom: 'Dalle à carte CA50E', carteReceptionMarque: 'Novastar', carteReceptionModele: 'CA50E' };

// Dalles fictives de l'étape 3a (formats de canvas des Tessera M2, S4 et T1).
export const DALLE_200 = { id: 'fictive-200', nom: 'Dalle 200 × 200 px', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 200, pxV: 200 };
export const DALLE_120 = { id: 'fictive-120', nom: 'Dalle 120 × 120 px', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 120, pxV: 120 };

// Dalles du cas 9 (manuel Tessera §6.5.1, mapping interpolé) : A en 5 mm, B en 7,8 mm, C en 15,6 mm.
export const DALLE_CAS_9_A = { id: 'fictive-cas-9-a', nom: 'Dalle A (cas 9)', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 100, pxV: 100 };
export const DALLE_CAS_9_B = { id: 'fictive-cas-9-b', nom: 'Dalle B (cas 9)', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 64, pxV: 64 };
export const DALLE_CAS_9_C = { id: 'fictive-cas-9-c', nom: 'Dalle C (cas 9)', fictive: true, largeurMm: 1000, hauteurMm: 500, pxH: 64, pxV: 32 };
// Petite dalle : moins de 16 px dans une dimension.
export const DALLE_12 = { id: 'fictive-12', nom: 'Dalle 12 × 12 px', fictive: true, largeurMm: 120, hauteurMm: 120, pxH: 12, pxV: 12 };

// Dalles fictives de l'étape 4 (électricité).
export const DALLE_100W_CHAINAGE = { id: 'fictive-100w', nom: 'Dalle 100 W, chaînage 7', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192, pMaxW: 100, chainagePowerMax: 7 };
export const DALLE_APPEL = { ...DALLE_CAS_13, id: 'fictive-appel', nom: 'Dalle 130 W, courant d\'appel 5 A', courantAppelA: 5, courantAppelMs: 3 };
export const DALLE_SANS_PMAX = { id: 'fictive-sans-pmax', nom: 'Dalle sans P max', fictive: true, largeurMm: 500, hauteurMm: 500, pxH: 192, pxV: 192 };

// Dalles fictives de l'étape 5 : maximum en accroche exprimé en mètres ou en kilos, avec conditions.
export const DALLE_MAX_METRES = { ...DALLE_CAS_13, id: 'fictive-max-m', nom: 'Dalle à maximum en mètres', maxAccroche: 5, maxAccrocheUnite: 'm', maxAccrocheConditions: 'matériel du constructeur, usage intérieur' };
export const DALLE_MAX_KILOS = { ...DALLE_CAS_13, id: 'fictive-max-kg', nom: 'Dalle à maximum en kilos', maxAccroche: 60, maxAccrocheUnite: 'kg' };
