// Versions du cache de l'appli (sw.js) et empreinte des fichiers de chacune (test N8). Une ligne par publication :
// quand un fichier de l'appli change, VERSION et EMPREINTE changent dans sw.js, et une ligne s'ajoute ici.
export const VERSIONS_CACHE = [
  { version: 2, empreinte: '2e9d6331c6b605154a883bc46b0665d614439c1bb19d23e9d6c6af0968fdf31f', date: '2026-09-25', note: 'Chantier COEX et LEDCAST' },
  { version: 3, empreinte: 'a6f734a8506f54b2b9b01ee0485c7a6ce03c722a93a0f679485f934d52841d11', date: '2026-09-25', note: 'Configs, lots et check-list ; catalogue ROE, Unilumin et LEDECA' },
  { version: 4, empreinte: '1a584981faba490f5866d111a85da4607401cfa9ea00d598c0d4aada881aa28a', date: '2026-09-25', note: 'Correctif : choix de la marque, de la gamme et de la version dans le Mur' },
  { version: 5, empreinte: '24c7f4a394ea4e6ed6883c2ccc067f0797715d96c61567aacbd468dd2ef23791', date: '2026-09-26', note: 'Processeurs : Novastar relevés, choix du processeur, fiches PDF relues, Colorlight' },
  { version: 6, empreinte: '33f6d08ee3b133221328604eae661cece8c93bf7c7c1e831f50d5b0a0937dc45', date: '2026-09-26', note: 'Amont et aval : fréquence pixel, budgets des régies, chaîne, régies, mélangeurs, convertisseurs, serveurs, HDBaseT' },
  { version: 7, empreinte: 'e1c555deebcd61312f404c0bb5a6faa093bd3057a0b61c7511b212f360bbe465', date: '2026-10-02', note: 'Processeurs : Brompton relu (XD-T, XD-S, HFR, ULL, R2), Megapixel HELIOS et switches, Linsn, Kystar, Mooncell' },
  { version: 8, empreinte: 'a37a68ebc691e00016c644c6a73b2d97338bb4a78036cb1e34d566d977326753', date: '2026-10-02', note: 'COEX : carte MX_8×5G_Base-T, plafond par carte de sortie, CVT10 comptés carte par carte, règle des 128 px en 5G' },
  { version: 9, empreinte: '1f33d82fe592d23c7a99f2f94a70ffa468ec748f2eb2e423d50e6d8fcd40553d', date: '2026-10-02', note: 'Data : alternative « SX40 + XD » pour un S8, S4, M2 ou T1' },
  { version: 10, empreinte: '6dac80a60b87e3e71d520f25bd10194583e42d99085b18b6039d6bdbe6637866', date: '2026-10-02', note: 'Mélangeurs Roland relus dans leurs manuels (sorties Program, alerte OUTPUT 3 du V-8HD, note PREVIEW du V-1HD, cadences), cadence contrôlée sortie par sortie' },
  { version: 11, empreinte: 'f7d83ee8d4a7bd7c9562b5907febf1ab0be5f394478f71a3f703114f0ea1f118', date: '2026-10-03', note: 'Terrain : zones de 48 px, onglets visibles, dessin du Schéma avant ses réglages, contrastes, alerte des 95 % ; code couleur du câblage (numéros sur les trajets, une couleur par port, couleur de phase et motif en élec)' },
  { version: 12, empreinte: '4192c4275b154befa70b12d1d9396bd9550c678ca465a665141f966a8792af88', date: '2026-10-03', note: 'Guide de câblage pas à pas (zoom avec le départ du port) ; grand affichage, en plus du thème sombre ou du mode rouge' },
  { version: 13, empreinte: 'bfe10783380878ce142f6043351a08343c162f4f19dc1afecf36884c48633dff', date: '2026-10-03', note: 'Guide pas à pas : port loin de son départ, zoom serré sur ses dalles et encart du départ (« ← MCTRL660, port 4 ») au-dessus des dalles ; « Recentrer » à côté de la case' },
  { version: 14, empreinte: '48bf4943c8219dc7b782f24e226f34a77a61e6377138924774a0633234652546', date: '2026-10-03', note: 'Écran Dépannage : arbres de diagnostic sourcés hors ligne (symptômes, étapes, lignes de marque, badges « à confirmer », annexes) ; huit onglets' },
];
