// Contrôle de la base de départ (data/dalles.json et data/processeurs.json). Les fichiers sont lus
// par la page de tests (ou par node.test.js) et passés à chaque vérification dans `contexte`.

import * as calculs from '../src/calculs.js';
import { baseDalles as lireBase, baseProcesseurs, baseConnectique, baseRegies } from './base.js';
import { listeCache, fichiersCharges } from './fichiers.js';

function fichiersAppli(contexte) {
  if (!contexte?.fichiers) throw new Error(`fichiers de l'appli non lus${contexte?.erreurFichiers ? ` : ${contexte.erreurFichiers}` : ''}`);
  return contexte.fichiers;
}

const IDS_REFERENCE = [
  'roe-bp2-v2', 'roe-cb5-mkii', 'roe-cb5-mkii-demi', 'roe-cb3-mkii', 'absen-pl2-5-pro-v10', 'absen-pl1-9-pro-v10',
];

function toutesLesFiches(base) {
  return [...base.dalles, ...base.gabarits];
}

function fiche(base, id) {
  return toutesLesFiches(base).find((f) => f.id === id);
}

// Champs chiffrés d'une fiche : { valeur, source } ou { valeurs: [{ valeur, source }, …] }.
function valeursSourcees(f) {
  return Object.entries(f)
    .filter(([, champ]) => champ && typeof champ === 'object' && ('valeur' in champ || 'valeurs' in champ))
    .flatMap(([nom, champ]) => (champ.valeurs ?? [champ]).map((x) => ({ nom, ...x })));
}

export const DONNEES = [
  {
    id: 'D1',
    titre: 'Les 6 dalles de référence sont dans la base',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const ids = base.dalles.map((f) => f.id);
      v.egal('dalles de référence absentes', IDS_REFERENCE.filter((id) => !ids.includes(id)), []);
    },
  },
  {
    id: 'D2',
    titre: 'Chaque valeur a une source connue',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      for (const f of toutesLesFiches(base)) {
        const sansSource = valeursSourcees(f).filter((x) => !base.sources[x.source]).map((x) => x.nom);
        v.egal(`${f.id} : valeurs sans source`, sansSource, []);
      }
    },
  },
  {
    id: 'D3',
    titre: 'Pitch de la fiche contrôlé par largeur / pixels : à 0,01 mm près, à 0,1 mm pour un pitch « nominal » (nom commercial) ; fiche sans pitch ignorée (le Mur le calcule)',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      for (const f of base.dalles) {
        const d = calculs.resoudreFiche(f, base.sources);
        if (d.pitchMm === undefined) continue;
        const nominal = d.sources.pitchMm.type === 'nominal';
        v.proche(`${f.id} : ${d.largeurMm} / ${d.pxH}${nominal ? ' (nominal)' : ''}`, calculs.pitchCalculeMm(d), d.pitchMm, nominal ? 0.1 : 0.01);
      }
    },
  },
  {
    id: 'D4',
    titre: 'Pixels lus dans la fiche, jamais déduits de largeur / pitch',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('CB5 MKII : pixels de la fiche', [cb5.pxH, cb5.pxV], [104, 208]);
      v.vrai('600 / 5,77 ne donne pas un entier', !Number.isInteger(cb5.largeurMm / cb5.pitchMm));
    },
  },
  {
    id: 'D5',
    titre: 'Valeurs contradictoires : la plus défavorable sert au calcul, les autres restent visibles',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const bp2 = calculs.resoudreFiche(fiche(base, 'roe-bp2-v2'), base.sources);
      v.egal('BP2 V2 : P max retenue (W)', bp2.pMaxW, 190);
      v.egal('BP2 V2 : autres valeurs (W)', bp2.sources.pMaxW.autres.map((x) => x.valeur), [160, 185]);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('CB5 MKII : poids retenu (kg)', cb5.poidsKg, 13.6);
      const pl25 = calculs.resoudreFiche(fiche(base, 'absen-pl2-5-pro-v10'), base.sources);
      v.egal('PL2.5 Pro V10 : poids retenu (kg)', pl25.poidsKg, 8.8);
      v.egal('PL2.5 Pro V10 : P max retenue (W)', pl25.pMaxW, 192.5);
      v.egal('PL2.5 Pro V10 : rafraîchissement retenu (Hz)', pl25.rafraichissementHz, 3840);
      v.egal('PL2.5 Pro V10 : conflit signalé', pl25.sources.rafraichissementHz.conflit, true);
    },
  },
  {
    id: 'D6',
    titre: 'Demi-dalle CB5 MKII : fiche propre, liée à la dalle entière',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const entiere = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      const demi = calculs.resoudreFiche(fiche(base, entiere.demiDalle), base.sources);
      v.egal('lien dalle → demi-dalle', demi.id, 'roe-cb5-mkii-demi');
      v.egal('lien demi-dalle → dalle', demi.demiDe, 'roe-cb5-mkii');
      v.egal('pixels (fiche)', [demi.pxH, demi.pxV], [104, 104]);
      v.egal('P max (W) et poids (kg) de sa fiche', [demi.pMaxW, demi.poidsKg], [250, 7.2]);
      v.egal('même largeur que la dalle entière', [demi.largeurMm, demi.pxH], [entiere.largeurMm, entiere.pxH]);
    },
  },
  {
    id: 'D7',
    titre: 'Gabarits génériques marqués non sourcés, aucune dalle fictive dans la base',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      for (const g of base.gabarits) {
        const d = calculs.resoudreFiche(g, base.sources);
        v.vrai(`${g.id} : marqué gabarit`, d.gabarit === true);
        v.egal(`${g.id} : confiance de la P max`, d.sources.pMaxW.source.confiance, 'non sourcé');
      }
      const fictives = toutesLesFiches(base).filter((f) => f.fictive || /fictive/i.test(f.id));
      v.egal('dalles fictives dans la base', fictives.map((f) => f.id), []);
    },
  },
  {
    id: 'D8',
    titre: 'Valeurs contradictoires : chaque valeur porte sa fiche d\'origine',
    etape: 2,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const ids = (valeur) => valeur.sources.map((s) => s.id);
      const bp2 = calculs.resoudreFiche(fiche(base, 'roe-bp2-v2'), base.sources);
      v.egal('BP2 V2 : 190 W, sources', ids(bp2.sources.pMaxW), ['roe-manuel-black-onyx-pearl-v1-8', '4wall-bp2-v2', 'roe-page-produit-black-pearl']);
      v.egal('BP2 V2 : 160 et 185 W, sources', bp2.sources.pMaxW.autres.map(ids), [['roe-brochure-bp2-v2-2021-03'], ['roe-fiche-bp2-v2-2021-05']]);
      v.egal('BP2 V2 : P moyenne retenue (W)', bp2.pMoyW, 95);
      v.egal('BP2 V2 : autres P moyennes (W)', bp2.sources.pMoyW.autres.map((x) => x.valeur), [80, 92]);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('CB5 MKII : 13,6 kg, source', ids(cb5.sources.poidsKg), ['roe-page-produit-cb5-mkii']);
      v.egal('CB5 MKII : 12,2 kg, sources', cb5.sources.poidsKg.autres.map(ids), [['roe-fiche-cb5-mkii-2023-01', 'roe-brochure-cb5-mkii-2024-02']]);
      const pl25 = calculs.resoudreFiche(fiche(base, 'absen-pl2-5-pro-v10'), base.sources);
      v.egal('PL2.5 Pro V10 : 8,8 kg, sources', ids(pl25.sources.poidsKg), ['ledwallcentral-pl-pro-v10', 'absen-fiche-pl-v20221215']);
      v.egal('PL2.5 Pro V10 : 192,5 W, source', ids(pl25.sources.pMaxW), ['rentex-pl-pro-v10']);
      v.egal('PL2.5 Pro V10 : 3840 Hz, source', ids(pl25.sources.rafraichissementHz), ['absen-fiche-rentex-pl-pro-v10']);
      v.egal('PL2.5 Pro V10 : 7680 Hz, source', pl25.sources.rafraichissementHz.autres.map(ids), [['absen-usa-pl-pro-v10-2025']]);
      const rapportV1 = [bp2, cb5, pl25].flatMap((d) => ['pMaxW', 'poidsKg', 'rafraichissementHz']
        .filter((nom) => d.sources[nom]?.conflit)
        .flatMap((nom) => [d.sources[nom], ...d.sources[nom].autres].flatMap(ids))
        .filter((id) => id === 'cahier-des-charges-dalles'));
      v.egal('plus aucune valeur contradictoire sourcée « cahier des charges du projet »', rapportV1, []);
    },
  },
  {
    id: 'D9',
    titre: 'Processeurs du MVP présents dans la base',
    etape: 2,
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      v.egal('processeurs', base.processeurs.map((p) => p.id), [
        'brompton-t1', 'brompton-s4', 'brompton-m2', 'brompton-s8', 'brompton-sx40',
        'novastar-mctrl300', 'novastar-mctrl660', 'novastar-mctrl660-pro', 'novastar-mctrl-r5', 'novastar-mctrl4k',
        'novastar-vx2u', 'novastar-novapro-hd', 'novastar-vx4s', 'novastar-vx4u', 'novastar-vx6s', 'novastar-novapro-uhd-jr',
        'coex-mx40-pro', 'coex-mx20', 'coex-mx30', 'coex-cx40-pro', 'coex-ku20', 'coex-mx2000-pro', 'coex-mx6000-pro', 'coex-sp60-pro',
        'colorlight-s6f', 'colorlight-x8e', 'colorlight-x16e', 'colorlight-vx20', 'colorlight-z6', 'colorlight-z8t',
      ]);
      v.egal('distributeurs', base.distributeurs.map((d) => d.id), ['brompton-xd', 'novastar-cvt10', 'novastar-cvt10-pro', 'coex-cvt8-5g']);
    },
  },
  {
    id: 'D10',
    titre: 'Chaque processeur a ses limites sourcées : débit, pixels, ports, canvas',
    etape: 2,
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      for (const p of base.processeurs) {
        const sansSource = valeursSourcees(p).filter((x) => !base.sources[x.source]).map((x) => x.nom);
        v.egal(`${p.id} : valeurs sans source`, sansSource, []);
        const manquants = calculs.champsManquants(calculs.resoudreFiche(p, base.sources));
        if (p.statut === 'à compléter') v.vrai(`${p.id} : marqué à compléter, il lui manque bien des champs`, manquants.length > 0);
        else v.egal(`${p.id} : champs obligatoires manquants`, manquants, []);
      }
      for (const d of base.distributeurs) {
        v.vrai(`${d.id} : sorties sourcées`, Boolean(d.sorties && base.sources[d.sorties.source]));
      }
      for (const p of base.processeurs.filter((x) => x.distributeur)) {
        const d = base.distributeurs.find((x) => x.id === p.distributeur);
        v.egal(`${p.id} : sorties du ${p.distributeur} identiques à sa fiche`, p.sortiesParDistributeur?.valeur, d?.sorties.valeur);
      }
    },
  },
  {
    id: 'D11',
    titre: 'Valeurs clés des processeurs (cahier des charges du projet)',
    etape: 2,
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const p = (id) => calculs.resoudreFiche(base.processeurs.find((x) => x.id === id), base.sources);
      v.egal('MCTRL300 : pixels, ports', [p('novastar-mctrl300').pixelsMax, p('novastar-mctrl300').ports], [1300000, 2]);
      v.egal('MCTRL660 : borne haute de 1,3 à 2,3 M', p('novastar-mctrl660').pixelsMax, 2300000);
      v.egal('MCTRL4K : tableau officiel (8,8 M, 7680 × 7680)',
        [p('novastar-mctrl4k').pixelsMax, p('novastar-mctrl4k').largeurMaxPx, p('novastar-mctrl4k').hauteurMaxPx], [8800000, 7680, 7680]);
      v.egal('S8 : 8 sorties 1G', p('brompton-s8').ports, 8);
      v.egal('SX40 : 9 M px, canvas 4094 × 4095, 40 ports via XD',
        [p('brompton-sx40').pixelsMax, p('brompton-sx40').largeurMaxPx, p('brompton-sx40').hauteurMaxPx, p('brompton-sx40').ports],
        [9000000, 4094, 4095, 40]);
      v.egal('MX40 Pro : 950 000 000 bit/s, 20 ports 1G', [p('coex-mx40-pro').debitUtileBps, p('coex-mx40-pro').ports], [950000000, 20]);
    },
  },
  {
    id: 'D12',
    titre: 'Précisions de l\'étape 2 : 4K DCI, redondance SX40, mode optique MX40 Pro',
    etape: 2,
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const brut = (id) => base.processeurs.find((x) => x.id === id);
      const p = (id) => calculs.resoudreFiche(brut(id), base.sources);
      for (const id of ['brompton-s8', 'brompton-sx40']) {
        const dci = (brut(id).formatsCanvas ?? []).find((f) => f.nom === '4K DCI (préréglage)');
        v.egal(`${id} : préréglage 4K DCI`, dci ? [dci.largeurPx, dci.hauteurPx] : null, [4096, 2160]);
        v.vrai(`${id} : préréglage sourcé`, Boolean(dci && base.sources[dci.source]));
      }
      v.egal('SX40 : 20 ports principaux en redondance', p('brompton-sx40').portsRedondance, 20);
      v.egal('MX40 Pro : 40 ports en mode optique', p('coex-mx40-pro').portsOptionOptique, 40);
      v.vrai('MX40 Pro : mode optique sourcé', Boolean(base.sources[brut('coex-mx40-pro').portsOptionOptique?.source]));
    },
  },
  {
    id: 'D13',
    titre: 'Dalles de l\'étape 2b : sources attribuées et valeur la plus défavorable retenue',
    etape: '2b',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const ids = (valeur) => valeur.sources.map((s) => s.id);
      // Étape 2b (7 fiches), puis le catalogue ROE, Unilumin et LEDECA du 25/09/2026 (96 fiches), dans l'ordre du fichier.
      v.egal('nouvelles dalles', base.dalles.map((f) => f.id).filter((id) => !IDS_REFERENCE.includes(id)), [
        'unilumin-upad-iv-2-6', 'unilumin-upad-iv-2-6-pro', 'infiled-ar3-9', 'infiled-ar3-91-mk2-plus', 'infiled-ez2-6-mk2', 'absen-m2-9',
        'absen-jp5-pro', 'roe-bo2', 'roe-bo3', 'roe-bp2', 'roe-bp3', 'roe-cb3', 'roe-cb3-demi', 'roe-cb5', 'roe-cb5-demi', 'roe-cb8', 'roe-cb8-demi',
        'roe-cb3-mkii-demi', 'roe-cb8-mkii', 'roe-cb8-mkii-demi', 'roe-bq3-9', 'roe-bq3-9-demi', 'roe-bq4-6', 'roe-bq4-6-demi', 'roe-bq6-2',
        'roe-bq6-2-demi', 'roe-rb1-2', 'roe-rb1-5', 'roe-rb1-5f', 'roe-rb1-9b-v2', 'roe-rb2-3', 'roe-rb2-6f', 'roe-rb2-6', 'roe-rb-c1-9b-v2',
        'roe-rb-c1-9f', 'roe-rb-c2-6', 'roe-tp1-5', 'roe-tp-c1-5', 'roe-tp1-9', 'roe-tp-c1-9', 'roe-tp-b1-9', 'roe-tp2-2', 'roe-tp-c2-2',
        'roe-tp-b2-2', 'roe-tp2-6', 'roe-tp-c2-6', 'roe-tp-b2-6', 'roe-dm2-6', 'roe-dm3-9', 'roe-gp2-6-4en1', 'roe-gp2-6-4en1-demi', 'roe-gp2-6',
        'roe-gp2-6-demi', 'roe-gp3-1', 'roe-gp3-1-demi', 'roe-gp3-9', 'roe-gp3-9-demi', 'roe-jt1-9', 'roe-jt2-2', 'roe-jt2-2-demi', 'roe-jt2-6',
        'roe-jt2-6-demi', 'roe-jt3-1', 'roe-jt3-1-demi', 'roe-jt3-9', 'roe-jt3-9-demi', 'roe-v3st', 'roe-v4st', 'roe-v6st', 'roe-ob2-6', 'roe-bm2',
        'roe-bm4', 'unilumin-urmiii2-500x1000', 'unilumin-urmiii2-500x500', 'unilumin-urmiii3-500x1000', 'unilumin-urmiii3-500x500',
        'unilumin-urmiii03-500x1000', 'unilumin-urmiii03-500x500', 'unilumin-urmiii04-500x1000', 'unilumin-urmiii04-500x500', 'unilumin-urmiii2-6',
        'unilumin-upad-iv-1-9-pro-f', 'unilumin-upad-iv-1-9-pro-xr', 'unilumin-upad-iv-1-5-mip', 'unilumin-upad-iv-s', 'unilumin-upad-iv-c',
        'ledeca-ldaosp03-9st', 'ledeca-ldaosp04-8st', 'ledeca-ldaisp03-9st', 'ledeca-ldaisp02-9st', 'ledeca-ldaisp02-6stq', 'ledeca-ldaisp01-9stq',
        'ledeca-ldsosp03-9st-500x500', 'ledeca-ldsosp03-9st-500x1000', 'ledeca-ldsisp03-9st-500x500', 'ledeca-ldsisp03-9st-500x1000',
        'ledeca-ldsisp02-9st-500x500', 'ledeca-ldsisp02-9st-500x1000', 'ledeca-ldsisp02-6st', 'ledeca-ldcosp03-9st', 'ledeca-ldcosp02-9st',
        'ledeca-ldcisp03-9st', 'ledeca-ldcisp02-9st',
      ]);
      const upad = calculs.resoudreFiche(fiche(base, 'unilumin-upad-iv-2-6'), base.sources);
      v.egal('Upad IV 2.6 : P max retenue 165 W, LEDwallcentral (8 scan) et fiche Unilumin V1.3', [upad.pMaxW, ids(upad.sources.pMaxW)], [165, ['ledwallcentral-upad-iv-2-6', 'unilumin-fiche-upad-iv-2-6-v1-3']]);
      v.egal('Upad IV 2.6 : 120 W (4Wall Europe, fiche Unilumin), 150 W (LMG)',
        upad.sources.pMaxW.autres.map((x) => [x.valeur, ids(x)]), [[120, ['4wall-europe-upad-iv-2-6', 'unilumin-fiche-upad-iv-2-6']], [150, ['lmg-upad-iv-2-6']]]);
      v.egal('Upad IV 2.6 : P moyenne retenue 58 W', upad.pMoyW, 58);
      v.egal('Upad IV 2.6 : 3840 Hz retenus (4Wall Europe)', [upad.rafraichissementHz, ids(upad.sources.rafraichissementHz)], [3840, ['4wall-europe-upad-iv-2-6']]);
      v.egal('Upad IV 2.6 : 7680 Hz (LMG, LEDwallcentral)', upad.sources.rafraichissementHz.autres.map(ids), [['lmg-upad-iv-2-6', 'ledwallcentral-upad-iv-2-6']]);
      v.egal('Upad IV 2.6 : carte A10s (4Wall Europe)', [upad.carteReceptionModele, ids(upad.sources.carteReceptionModele)], ['A10s', ['4wall-europe-upad-iv-2-6']]);
      v.vrai('Upad IV 2.6 : note sur les versions 1/8 et 1/16 scan', /1\/8/.test(upad.note ?? '') && /1\/16/.test(upad.note ?? ''));
      const pro = calculs.resoudreFiche(fiche(base, 'unilumin-upad-iv-2-6-pro'), base.sources);
      v.egal('Upad IV 2.6 Pro : nom et alias', [pro.nom, pro.alias], ['Unilumin Upad IV 2.6 Pro', ['UpadIV 2 Pro']]);
      const ar = calculs.resoudreFiche(fiche(base, 'infiled-ar3-9'), base.sources);
      v.egal('AR3.9 : 12,5 kg, 300 W, 100 W retenus (LEDwallcentral)',
        [ar.poidsKg, ar.pMaxW, ar.pMoyW, ids(ar.sources.pMaxW)], [12.5, 300, 100, ['ledwallcentral-ar3-9']]);
      v.egal('AR3.9 : 12 kg, 270 W, 90 W (PLSN, novembre 2019)',
        [ar.sources.poidsKg, ar.sources.pMaxW, ar.sources.pMoyW].map((s) => [s.autres[0].valeur, ids(s.autres[0])]),
        [[12, ['plsn-ar3-9-2019-11']], [270, ['plsn-ar3-9-2019-11']], [90, ['plsn-ar3-9-2019-11']]]);
      v.egal('AR3.9 : 11 dalles maxi en accroche (PLSN)', [ar.maxAccroche, ids(ar.sources.maxAccroche)], [11, ['plsn-ar3-9-2019-11']]);
      const m29 = calculs.resoudreFiche(fiche(base, 'absen-m2-9'), base.sources);
      v.egal('M2.9 : 9,99 kg retenus (calculateur 4Wall), 7,6 kg (page produit 4Wall, fiche Absen)',
        [m29.poidsKg, ids(m29.sources.poidsKg), m29.sources.poidsKg.autres.map((x) => [x.valeur, ids(x)])],
        [9.99, ['4wall-calculateur-absen-m2-9'], [[7.6, ['4wall-page-absen-m2-9', 'absen-fiche-m2-9']]]]);
    },
  },
  {
    id: 'D14',
    titre: 'Processeurs de l\'étape 2b : valeurs clés et sources non constructeur signalées',
    etape: '2b',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const p = (id) => calculs.resoudreFiche(base.processeurs.find((x) => x.id === id), base.sources);
      const cx40 = p('coex-cx40-pro');
      v.egal('CX40 Pro : 9 M px, 6 ports 5G, 16 384 px', [cx40.pixelsMax, cx40.ports, cx40.typePorts, cx40.largeurMaxPx, cx40.hauteurMaxPx], [9000000, 6, '5G', 16384, 16384]);
      v.egal('CX40 Pro : cartes 5G', cx40.cartesCompatibles, ['CA50E', 'CA50C', 'XA50', 'XA50 Pro']);
      v.egal('MX20 : 3,9 M px, 6 ports, 3840 × 2560', [p('coex-mx20').pixelsMax, p('coex-mx20').ports, p('coex-mx20').largeurMaxPx, p('coex-mx20').hauteurMaxPx], [3900000, 6, 3840, 2560]);
      v.egal('MX20 : débit constructeur (wiki COEX)', [p('coex-mx20').sources.debitUtileBps.source.id, p('coex-mx20').sources.debitUtileBps.source.confiance], ['coex-wiki-capacite', 'constructeur']);
      v.egal('S6F : 2,3 M px, 6 ports, 4096 × 2560', [p('colorlight-s6f').pixelsMax, p('colorlight-s6f').ports, p('colorlight-s6f').largeurMaxPx, p('colorlight-s6f').hauteurMaxPx], [2300000, 6, 4096, 2560]);
      v.egal('X8E : 5,24 M px, 8 ports, 16 384 × 8192', [p('colorlight-x8e').pixelsMax, p('colorlight-x8e').ports, p('colorlight-x8e').largeurMaxPx, p('colorlight-x8e').hauteurMaxPx], [5240000, 8, 16384, 8192]);
      v.egal('Colorlight : 10 bits « déduit, à confirmer »', p('colorlight-x8e').sources.capacitePort60Hz10bits.source.confiance, 'déduit, à confirmer');
      const confiances = ['revendeur', 'base tierce'];
      v.vrai('sources revendeur et base tierce marquées comme telles',
        ['avlgear-mx20', 'luxwave-cx40-pro', 'pssl-colorlight-s6f', 'ledwallcentral-colorlight'].every((id) => confiances.includes(base.sources[id]?.confiance)));
    },
  },
  {
    id: 'D15',
    titre: 'Connectique : format maxi et source de chaque liaison',
    etape: '3a',
    verifier(v, contexte) {
      const base = baseConnectique(contexte);
      v.egal('liaisons', base.liaisons.map((l) => l.id),
        ['dvi-single', 'dvi-dual', 'hdmi-1.2', 'hdmi-1.3', 'hdmi-1.4', 'hdmi-2.0', 'hdmi-2.1', 'dp-1.2', 'dp-1.4', '3g-sdi', '6g-sdi', '12g-sdi', 'st2110-25g', 'st2110-100g']);
      for (const l of base.liaisons) {
        v.egal(`${l.id} : valeurs sans source`, valeursSourcees(l).filter((x) => !base.sources[x.source]).map((x) => x.nom), []);
        const r = calculs.resoudreFiche(l, base.sources);
        v.vrai(`${l.id} : format maxi complet`, [r.formatMaxLargeurPx, r.formatMaxHauteurPx, r.formatMaxFrequenceHz].every((x) => x > 0));
      }
      const r = (id) => calculs.resoudreFiche(base.liaisons.find((l) => l.id === id), base.sources);
      v.egal('HDMI 2.0 : 4096 × 2160 à 60 Hz', [r('hdmi-2.0').formatMaxLargeurPx, r('hdmi-2.0').formatMaxHauteurPx, r('hdmi-2.0').formatMaxFrequenceHz], [4096, 2160, 60]);
      v.egal('6G-SDI : 30 i/s « déduit »', [r('6g-sdi').formatMaxFrequenceHz, r('6g-sdi').sources.formatMaxFrequenceHz.source.confiance], [30, 'déduit']);
      v.vrai('DisplayPort 1.2 : « à confirmer »', /à confirmer/.test(r('dp-1.2').sources.formatMaxLargeurPx.source.confiance));
    },
  },
  {
    id: 'D16',
    titre: 'Entrées des processeurs : types de liaison structurés et sourcés',
    etape: '3a',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const connues = [...baseConnectique(contexte).liaisons.map((l) => l.id), 'hdmi', 'sdi', 'dvi', 'dp'];
      for (const p of base.processeurs.filter((x) => x.statut !== 'à compléter')) {
        const types = p.entreesTypes?.valeur ?? [];
        v.vrai(`${p.id} : au moins une entrée structurée`, types.length > 0);
        v.egal(`${p.id} : types inconnus`, types.filter((x) => !connues.includes(x)), []);
      }
      const p = (id) => calculs.resoudreFiche(base.processeurs.find((x) => x.id === id), base.sources);
      v.egal('SX40 : HDMI 2.0 et 12G-SDI', p('brompton-sx40').entreesTypes, ['hdmi-2.0', '12g-sdi']);
      v.egal('MCTRL660 : DVI et HDMI 1.3', p('novastar-mctrl660').entreesTypes, ['dvi-single', 'hdmi-1.3']);
      v.egal('S6F : entrée limitée à 1920 × 1200 par sa fiche', [p('colorlight-s6f').entreeMaxLargeurPx, p('colorlight-s6f').entreeMaxHauteurPx], [1920, 1200]);
    },
  },
  {
    id: 'D17',
    titre: 'Formats de canvas Tessera : Low Latency des M2, S4 et T1, canvas libre des S8 et SX40',
    etape: '3a',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const brut = (id) => base.processeurs.find((x) => x.id === id);
      for (const id of ['brompton-t1', 'brompton-s4', 'brompton-m2']) {
        const formats = (brut(id).formatsCanvas ?? []).filter((f) => f.lowLatency);
        v.egal(`${id} : formats Low Latency`, formats.map((f) => [f.largeurPx, f.hauteurPx]), [[1080, 1920], [1600, 1200], [2880, 720], [720, 2880]]);
        v.vrai(`${id} : formats sourcés`, formats.every((f) => base.sources[f.source]));
        v.egal(`${id} : canvas fixe`, brut(id).canvasFixe, true);
      }
      for (const id of ['brompton-s8', 'brompton-sx40']) {
        const libre = brut(id).canvasLibre;
        v.egal(`${id} : canvas libre`, libre && [libre.largeurMinPx, libre.hauteurMinPx, libre.largeurPaire], [720, 720, true]);
        v.vrai(`${id} : canvas libre sourcé`, Boolean(libre && base.sources[libre.source]));
      }
    },
  },
  {
    id: 'D18',
    titre: 'M2 et S4 : 2 073 600 px, entrée maxi 1920 × 1080 (fiches S4 de septembre 2024 et M2 de janvier 2021)',
    etape: '3b',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      for (const id of ['brompton-m2', 'brompton-s4']) {
        const p = calculs.resoudreFiche(base.processeurs.find((x) => x.id === id), base.sources);
        v.egal(`${id} : pixels maxi`, p.pixelsMax, 2073600);
        v.egal(`${id} : source constructeur`, p.sources.pixelsMax.source.confiance, 'constructeur');
      }
    },
  },
  {
    id: 'D19',
    titre: 'Régies et scalers : E2 Gen 2 complète et sourcée, les autres à compléter',
    etape: '3b',
    verifier(v, contexte) {
      const base = baseRegies(contexte);
      v.egal('régies', base.regies.map((r) => r.id), [
        'barco-e2-gen2', 'barco-s3-4k', 'barco-ex', 'barco-imagepro-4k',
        'analogway-livepremier-aquilon', 'analogway-midra-4k', 'analogway-vio-4k', 'rgblink',
      ]);
      for (const r of base.regies) {
        v.egal(`${r.id} : valeurs sans source`, valeursSourcees(r).filter((x) => !base.sources[x.source]).map((x) => x.nom), []);
        const manquants = calculs.champsManquantsRegie(calculs.resoudreFiche(r, base.sources));
        if (r.statut === 'à compléter') v.vrai(`${r.id} : marquée à compléter, il lui manque bien des champs`, manquants.length > 0);
        else v.egal(`${r.id} : champs manquants`, manquants, []);
      }
      const e2 = base.regies.find((r) => r.id === 'barco-e2-gen2');
      v.egal('E2 Gen 2 : 8 sorties jusqu\'à 4096 × 2400 à 60 Hz, 6 avec multiviewer',
        [e2.modesSortie[0].sorties, e2.modesSortie[0].sortiesAvecMultiviewer, e2.modesSortie[0].largeurMaxPx, e2.modesSortie[0].hauteurMaxPx, e2.modesSortie[0].frequenceHz],
        [8, 6, 4096, 2400, 60]);
      v.egal('E2 Gen 2 : sorties HDMI 2.0, 12G-SDI, DisplayPort 1.2', e2.sortiesTypes.valeur, ['hdmi-2.0', '12g-sdi', 'dp-1.2']);
      v.vrai('E2 Gen 2 : modes de sortie sourcés', e2.modesSortie.every((m) => base.sources[m.source]));
    },
  },
  {
    id: 'D20',
    titre: 'Logiciel de réglage et mapping interpolé dans les fiches processeur',
    etape: '3b',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const avec = (champ, valeur) => base.processeurs.filter((p) => p[champ] === valeur).map((p) => p.id);
      v.egal('réglés avec NovaLCT (MCTRL, VX, NovaPro)', avec('logiciel', 'NovaLCT'), [
        'novastar-mctrl300', 'novastar-mctrl660', 'novastar-mctrl660-pro', 'novastar-mctrl-r5', 'novastar-mctrl4k',
        'novastar-vx2u', 'novastar-novapro-hd', 'novastar-vx4s', 'novastar-vx4u', 'novastar-vx6s', 'novastar-novapro-uhd-jr',
      ]);
      v.egal('réglés avec VMP (COEX)', avec('logiciel', 'VMP'), ['coex-mx40-pro', 'coex-mx20', 'coex-mx30', 'coex-cx40-pro', 'coex-ku20', 'coex-mx2000-pro', 'coex-mx6000-pro', 'coex-sp60-pro']);
      v.egal('mapping interpolé : M2 et T1 seulement', base.processeurs.filter((p) => p.mappingInterpole?.valeur === true).map((p) => p.id), ['brompton-t1', 'brompton-m2']);
    },
  },
  {
    id: 'D21',
    titre: 'Chaînage power CB5 MKII : 7 dalles par ligne (manuel ROE Carbon MKII V1.8)',
    etape: 4,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('chaînage power maxi', cb5.chainagePowerMax, 7);
      v.egal('source constructeur', cb5.sources.chainagePowerMax.source.confiance, 'constructeur');
    },
  },
  {
    id: 'D22',
    titre: 'Barres ROE Carbon : 5,16 kg (1 colonne), 10,72 kg (2 colonnes), manuel Carbon MKII V1.8 ; anciennes valeurs non retenues',
    etape: 5,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const barres = (base.bumpers ?? []).map((b) => calculs.resoudreFiche(b, base.sources));
      v.egal('barres', barres.map((b) => [b.id, b.colonnes, b.poidsKg]), [
        ['roe-carbon-barre-1-colonne', 1, 5.16],
        ['roe-carbon-barre-2-colonnes', 2, 10.72],
      ]);
      v.vrai('source : manuel Carbon MKII V1.8, constructeur', barres.every((b) => b.sources.poidsKg.source.id === 'roe-manuel-carbon-mkii-v1-8' && b.sources.poidsKg.source.confiance === 'constructeur'));
      v.egal('compatibles avec les CB5 et CB3 MKII', barres[0].compatibles, ['roe-cb5-mkii', 'roe-cb3-mkii']);
    },
  },
  {
    id: 'D23',
    titre: 'Hors ligne : chaque fichier chargé par l\'appli est dans le cache du service worker',
    etape: 7,
    verifier(v, contexte) {
      const f = fichiersAppli(contexte);
      v.vrai('sw.js présent', typeof f['sw.js'] === 'string');
      const cache = listeCache(f['sw.js']);
      v.vrai('liste des fichiers du cache lue', cache.length > 10);
      const charges = fichiersCharges(f);
      v.egal('fichiers chargés par l\'appli absents du cache', charges.filter((c) => c !== 'sw.js' && !cache.includes(c)), []);
      v.egal('fichiers du cache introuvables', cache.filter((c) => c !== './' && typeof f[c] !== 'string'), []);
      v.egal('fichiers du cache en double', cache.filter((c, i) => cache.indexOf(c) !== i), []);
      v.vrai('la page déclare le manifeste', /<link rel="manifest" href="manifest.webmanifest">/.test(f['index.html'] ?? ''));
      v.vrai('l\'appli enregistre le service worker', (f['src/app.js'] ?? '').includes("serviceWorker.register('sw.js'"));
    },
  },
  {
    id: 'D24',
    titre: 'Manifeste : appli autonome en français, icônes 192 et 512 px, icône pour l\'écran d\'accueil de l\'iPhone',
    etape: 7,
    verifier(v, contexte) {
      const f = fichiersAppli(contexte);
      let manifeste = {};
      try {
        manifeste = JSON.parse(f['manifest.webmanifest']) ?? {};
      } catch (erreur) {
        v.vrai(`manifeste lisible (${erreur.message})`, false);
      }
      v.egal('nom, langue, affichage', [manifeste.name, manifeste.short_name, manifeste.lang, manifeste.display], ['Mur LED', 'Mur LED', 'fr', 'standalone']);
      v.egal('adresses relatives (publication dans un sous-dossier)', [manifeste.start_url, manifeste.scope], ['./index.html', './']);
      v.egal('couleurs du mode sombre', [manifeste.background_color, manifeste.theme_color], ['#0e1014', '#0e1014']);
      const icones = manifeste.icons ?? [];
      for (const taille of ['192x192', '512x512']) {
        const icone = icones.find((i) => i.sizes === taille && (i.purpose ?? 'any').includes('any'));
        v.vrai(`icône ${taille} présente`, Boolean(icone) && typeof f[icone.src] === 'string');
      }
      v.vrai('icône masquable (Android)', icones.some((i) => (i.purpose ?? '').includes('maskable') && typeof f[i.src] === 'string'));
      const apple = /<link rel="apple-touch-icon" href="([^"]+)">/.exec(f['index.html'] ?? '');
      v.vrai('icône de l\'écran d\'accueil iPhone', Boolean(apple) && typeof f[apple[1]] === 'string');
    },
  },
  {
    id: 'D25',
    titre: 'Site discret : pages non indexées par les moteurs de recherche, robots.txt qui interdit tout',
    etape: 7,
    verifier(v, contexte) {
      const f = fichiersAppli(contexte);
      const noindex = /<meta name="robots" content="noindex, nofollow">/;
      v.vrai('index.html : meta robots noindex, nofollow', noindex.test(f['index.html'] ?? ''));
      v.vrai('tests.html : meta robots noindex, nofollow', noindex.test(f['tests.html'] ?? ''));
      v.egal('robots.txt : tout interdit', (f['robots.txt'] ?? '').split('\n').filter((l) => l.trim() && !l.startsWith('#')), ['User-agent: *', 'Disallow: /']);
    },
  },  {
    id: 'D26',
    titre: 'Capacité des Brompton : source constructeur (aide en ligne Tessera, Output Capacity 13.1.4)',
    etape: 2,
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      const resolus = base.processeurs.map((p) => calculs.resoudreFiche(p, base.sources));
      const brompton = resolus.filter((p) => p.famille === 'brompton');
      v.egal('les cinq Brompton de la base', brompton.map((p) => p.id), ['brompton-t1', 'brompton-s4', 'brompton-m2', 'brompton-s8', 'brompton-sx40']);
      v.vrai('débit utile inchangé : 756 000 000 bit/s', brompton.every((p) => p.debitUtileBps === 756000000));
      const sources = brompton.map((p) => p.sources.debitUtileBps.source);
      v.vrai('source constructeur : aide en ligne Tessera, page Output Capacity (13.1.4)',
        sources.every((s) => s.confiance === 'constructeur' && /Output Capacity/.test(s.titre) && /13\.1\.4/.test(s.titre)));
      v.vrai('adresse de la page donnée', sources.every((s) => /^https:\/\/www\.bromptontech\.com\/online-help\//.test(s.url ?? '')));
      v.egal('date de consultation', sources[0].date, '2026-09-25');
      v.egal('Novastar : source de sa propre fiche', resolus.find((p) => p.id === 'novastar-mctrl660').sources.debitUtileBps.source.id, 'novastar-mctrl660-v1-4-4');
    },
  },
  {
    id: 'D27',
    titre: 'Vérification du 25/09/2026, corrections C1 à C10 : la valeur constructeur est retenue, l\'ancienne reste visible « non retenue »',
    etape: 'sources',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const bd = lireBase(contexte);
      const p = (id) => calculs.resoudreFiche(bp.processeurs.find((x) => x.id === id), bp.sources);
      const d = (id) => calculs.resoudreFiche(fiche(bd, id), bd.sources);
      const b = (id) => calculs.resoudreFiche((bd.bumpers ?? []).find((x) => x.id === id), bd.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const nonRetenues = (s) => s.autres.filter((x) => x.nonRetenue).map((x) => x.valeur);
      const port = (proc, bits, reglages = {}) => calculs.entierInferieur(calculs.capacitePortProcesseur(proc, { frequenceHz: 60, bits, ...reglages }).capacite);
      // C1, C2 : capacité par port de la fiche en 10 et 12 bits, prioritaire sur la formule ; 8 bits par la formule.
      for (const [id, source] of [['novastar-mctrl4k', 'novastar-mctrl4k-v1-2-1'], ['novastar-novapro-uhd-jr', 'novastar-novapro-uhd-jr-v1-2-0']]) {
        const x = p(id);
        v.egal(`${id} : 320 000 px par port en 10 et 12 bits, 650 000 en 8 bits`, [port(x, 10), port(x, 12), port(x, 8)], [320000, 320000, 650000]);
        v.egal(`${id} : source constructeur, 325 000 (formule) non retenu`, [ids(x.sources.capacitePort60Hz10bits), nonRetenues(x.sources.capacitePort60Hz10bits)], [[source], [325000]]);
      }
      v.egal('C1, C2 : la formule reste pour le MCTRL660 Pro et le MCTRL R5 (325 000 annoncés)', [port(p('novastar-mctrl660-pro'), 10), port(p('novastar-mctrl-r5'), 10)], [325000, 325000]);
      // C3, C4 : CX40 Pro, capacité selon la carte de réception de la dalle.
      const cx = p('coex-cx40-pro');
      for (const carte of ['XA50 Pro', 'CA50E']) {
        v.egal(`C3 : CX40 Pro avec ${carte}, 8, 10 et 12 bits`, [8, 10, 12].map((bits) => port(cx, bits, { carte })), [2951200, 2291312, 1475600]);
      }
      for (const carte of ['CA50C', 'XA50', null]) {
        v.egal(`C4 : CX40 Pro avec ${carte ?? 'carte inconnue'}, 8, 10 et 12 bits (le plus bas des fiches V1.0.1 et V1.5.0)`,
          [8, 10, 12].map((bits) => port(cx, bits, { carte })), [2592000, 2073000, 1475600]);
      }
      v.egal('C3 : 2 213 200 non retenu', nonRetenues(cx.sources.capaciteHaute60Hz10bits), [2213200]);
      v.egal('CX40 Pro : cartes XA50 Pro et CA50E pour la capacité haute (fiche V1.5.0)', [cx.cartesCapaciteHaute, ids(cx.sources.cartesCapaciteHaute)], [['XA50 Pro', 'CA50E'], ['coex-cx40-pro-v1-5-0']]);
      // C5 : MX20 et MX30 en 10 bits, carte Armor autre que A10s Pro ou A8s Pro.
      const mx20 = p('coex-mx20');
      const mx30 = p('coex-mx30');
      v.egal('C5 : MX20 et MX30, 10 bits sans carte Pro : 329 861 px', [port(mx20, 10), port(mx30, 10)], [329861, 329861]);
      v.egal('C5 : MX20, capacité plus « à confirmer »', calculs.capacitePortProcesseur(mx20, { frequenceHz: 60, bits: 8 }).aConfirmer, false);
      // C6 à C8 : poids.
      const cb3 = d('roe-cb3-mkii');
      v.egal('C6 : CB3 MKII 14,4 kg (page produit), 14 kg du manuel non retenu', [cb3.poidsKg, ids(cb3.sources.poidsKg), nonRetenues(cb3.sources.poidsKg)], [14.4, ['roe-page-produit-carbon-mkii'], [14]]);
      for (const [id, kg, ancien] of [['roe-carbon-barre-1-colonne', 5.16, 4.44], ['roe-carbon-barre-2-colonnes', 10.72, 8.95]]) {
        const barre = b(id);
        v.egal(`C7, C8 : ${id}, ${kg} kg (manuel Carbon MKII V1.8), ${ancien} kg non retenu`,
          [barre.poidsKg, ids(barre.sources.poidsKg), nonRetenues(barre.sources.poidsKg)], [kg, ['roe-manuel-carbon-mkii-v1-8'], [ancien]]);
      }
      // C9, C10 : pixels maxi.
      const vx20 = p('colorlight-vx20');
      v.egal('C9 : VX20, 13 000 000 px (page Colorlight), 13 100 000 non retenu', [vx20.pixelsMax, ids(vx20.sources.pixelsMax), nonRetenues(vx20.sources.pixelsMax)], [13000000, ['colorlight-page-vx20'], [13100000]]);
      const r5 = p('novastar-mctrl-r5');
      v.egal('C10 : MCTRL R5, 4 147 200 px (3840 × 1080, fiche V1.0.5), 4 100 000 non retenu même s\'il est plus bas',
        [r5.pixelsMax, ids(r5.sources.pixelsMax), nonRetenues(r5.sources.pixelsMax)], [4147200, ['novastar-mctrl-r5-v1-0-5'], [4100000]]);
      const constructeur = ['novastar-mctrl4k-v1-2-1', 'novastar-novapro-uhd-jr-v1-2-0', 'coex-cx40-pro-v1-5-0', 'coex-cx40-pro-fiches', 'coex-mx20-v1-0-1', 'coex-mx30-v1-0-1', 'colorlight-page-vx20', 'novastar-mctrl-r5-v1-0-5']
        .filter((id) => bp.sources[id]?.confiance !== 'constructeur');
      v.egal('sources des corrections : confiance « constructeur »', [constructeur, ['roe-page-produit-carbon-mkii', 'roe-manuel-carbon-mkii-v1-8'].filter((id) => bd.sources[id]?.confiance !== 'constructeur')], [[], []]);
    },
  },
  {
    id: 'D28',
    titre: 'Vérification du 25/09/2026, nouvelles valeurs : accroche et stack, MX30, AR3.91 mk2 Plus',
    etape: 'sources',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const bd = lireBase(contexte);
      const d = (id) => calculs.resoudreFiche(fiche(bd, id), bd.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const maxi = [
        ['roe-bp2-v2', 20, 12, 'roe-fiche-bp2-v2-2021-05'],
        ['roe-cb5-mkii', 12, 5, 'roe-page-produit-carbon-mkii'],
        ['roe-cb5-mkii-demi', 24, 10, 'roe-page-produit-carbon-mkii'],
        ['roe-cb3-mkii', 12, 5, 'roe-page-produit-carbon-mkii'],
      ];
      for (const [id, accroche, stack, source] of maxi) {
        const x = d(id);
        v.egal(`${id} : ${accroche} en accroche, ${stack} en stack`, [x.maxAccroche, x.maxStack, ids(x.sources.maxAccroche)[0], ids(x.sources.maxStack)[0]], [accroche, stack, source, source]);
      }
      v.vrai('BP2 V2 : conditions de la fiche (barre, accessoires et lest ROE, coefficient 8)', /coefficient 8/.test(d('roe-bp2-v2').maxAccrocheConditions ?? '') && /lest/.test(d('roe-bp2-v2').maxStackConditions ?? ''));
      v.egal('Carbon MKII : aussi dans le manuel V1.8', ids(d('roe-cb5-mkii').sources.maxAccroche), ['roe-page-produit-carbon-mkii', 'roe-manuel-carbon-mkii-v1-8']);
      for (const [id, accroche, source] of [['absen-pl2-5-pro-v10', 20, 'absen-fiche-pl-v20221215'], ['absen-pl1-9-pro-v10', 20, 'absen-fiche-pl-v20221201'], ['absen-jp5-pro', 30, 'absen-fiche-jp-pro-v20250624']]) {
        const x = d(id);
        v.egal(`${id} : ${accroche} en accroche, stack non donné`, [x.maxAccroche, ids(x.sources.maxAccroche), x.maxStack], [accroche, [source], undefined]);
      }
      v.vrai('JP5 Pro : version 500 × 500 ; 24 pour la 1000 × 1000', /1000 × 1000/.test(d('absen-jp5-pro').maxAccrocheConditions ?? '') && /24/.test(d('absen-jp5-pro').maxAccrocheConditions ?? ''));
      const mx30 = calculs.resoudreFiche(bp.processeurs.find((x) => x.id === 'coex-mx30'), bp.sources);
      v.egal('MX30 : 6,5 M px, 10 ports 1G, débit et cartes Pro comme le MX40 Pro (fiche V1.0.1)',
        [mx30.pixelsMax, mx30.ports, mx30.debitUtileBps, mx30.cartesPro, ids(mx30.sources.pixelsMax), ids(mx30.sources.ports)],
        [6500000, 10, 950000000, true, ['coex-mx30-v1-0-1'], ['coex-mx30-v1-0-1']]);
      v.egal('MX30 : 10 bits avec cartes A10s Pro ou A8s Pro, comme le MX40 Pro', calculs.entierInferieur(calculs.capacitePortProcesseur(mx30, { frequenceHz: 60, bits: 10, cartesPro: true }).capacite), 494791);
      v.egal('MX30 : complet', calculs.champsManquants(mx30), []);
      const ancienne = d('infiled-ar3-9');
      v.egal('AR3.9 renommée « AR3.9 (2019) », sources gardées', [ancienne.nom, ancienne.maxAccroche, ids(ancienne.sources.maxAccroche)], ['INFiLED AR3.9 (2019)', 11, ['plsn-ar3-9-2019-11']]);
      const ar = d('infiled-ar3-91-mk2-plus');
      v.egal('AR3.91 mk2 Plus : extérieur IP65, 500 × 1000 mm, 128 × 256 px, 12,5 kg, 360 W max, 120 W moyens',
        [ar.nom, ar.usage, ar.indiceIP, ar.largeurMm, ar.hauteurMm, ar.pxH, ar.pxV, ar.poidsKg, ar.pMaxW, ar.sources.pMaxW.type, ar.pMoyW, ar.sources.pMoyW.type],
        ['INFiLED AR3.91 mk2 Plus', 'extérieur', 'IP65', 500, 1000, 128, 256, 12.5, 360, 'max', 120, 'moyenne']);
      v.vrai('AR3.91 mk2 Plus : chaque valeur de la page produit INFiLED', ['largeurMm', 'hauteurMm', 'pxH', 'pxV', 'poidsKg', 'pMaxW', 'pMoyW', 'indiceIP'].every((c) => ids(ar.sources[c])[0] === 'infiled-page-ar3-91-mk2-plus'));
      v.egal('AR3.91 mk2 Plus : carte, accroche et stack non donnés (aucune valeur inventée)', [ar.carteReceptionMarque, ar.maxAccroche, ar.maxStack], [undefined, undefined, undefined]);
    },
  },
  {
    id: 'D29',
    titre: 'Vérification du 25/09/2026, valeurs confirmées : source constructeur (règle 1) ; valeur constructeur plus basse visible, la retenue gardée (règle 2)',
    etape: 'sources',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const bd = lireBase(contexte);
      const d = (id) => calculs.resoudreFiche(fiche(bd, id), bd.sources);
      const p = (id) => calculs.resoudreFiche(bp.processeurs.find((x) => x.id === id), bp.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      // Règle 1 : [fiche, champ, valeur retenue, source constructeur attendue parmi celles de la valeur retenue].
      const dalles = [
        ['roe-bp2-v2', 'poidsKg', 9.35, 'roe-fiche-bp2-v2-2021-05'], ['roe-bp2-v2', 'pxH', 176, 'roe-fiche-bp2-v2-2021-05'], ['roe-bp2-v2', 'pxV', 176, 'roe-fiche-bp2-v2-2021-05'],
        ['roe-cb5-mkii', 'pMaxW', 480, 'roe-page-produit-cb5-mkii'], ['roe-cb5-mkii', 'pxH', 104, 'roe-page-produit-cb5-mkii'], ['roe-cb5-mkii', 'pxV', 208, 'roe-page-produit-cb5-mkii'],
        ['roe-cb5-mkii', 'poidsKg', 13.6, 'roe-page-produit-cb5-mkii'],
        ['roe-cb5-mkii-demi', 'pMaxW', 250, 'roe-page-produit-carbon-mkii'], ['roe-cb5-mkii-demi', 'poidsKg', 7.2, 'roe-page-produit-carbon-mkii'],
        ['roe-cb5-mkii-demi', 'pxH', 104, 'roe-page-produit-carbon-mkii'], ['roe-cb5-mkii-demi', 'pxV', 104, 'roe-page-produit-carbon-mkii'],
        ['roe-cb3-mkii', 'pMaxW', 600, 'roe-page-produit-carbon-mkii'], ['roe-cb3-mkii', 'pxH', 160, 'roe-page-produit-carbon-mkii'], ['roe-cb3-mkii', 'pxV', 320, 'roe-page-produit-carbon-mkii'],
        ['absen-pl2-5-pro-v10', 'pxH', 200, 'absen-fiche-pl-v20221215'], ['absen-pl2-5-pro-v10', 'pxV', 200, 'absen-fiche-pl-v20221215'], ['absen-pl2-5-pro-v10', 'poidsKg', 8.8, 'absen-fiche-pl-v20221215'],
        ['absen-pl1-9-pro-v10', 'pMaxW', 180, 'absen-fiche-pl-v20221201'], ['absen-pl1-9-pro-v10', 'poidsKg', 9, 'absen-fiche-pl-v20221201'],
        ['absen-pl1-9-pro-v10', 'pxH', 256, 'absen-fiche-pl-v20221201'], ['absen-pl1-9-pro-v10', 'pxV', 256, 'absen-fiche-pl-v20221201'],
        ['unilumin-upad-iv-2-6', 'poidsKg', 6.3, 'unilumin-fiche-upad-iv-2-6'], ['unilumin-upad-iv-2-6', 'pxH', 192, 'unilumin-fiche-upad-iv-2-6'], ['unilumin-upad-iv-2-6', 'pxV', 192, 'unilumin-fiche-upad-iv-2-6'],
        ['infiled-ez2-6-mk2', 'pMaxW', 150, 'infiled-page-ez2-6-mk2'], ['infiled-ez2-6-mk2', 'poidsKg', 5.9, 'infiled-page-ez2-6-mk2'],
        ['infiled-ez2-6-mk2', 'pxH', 192, 'infiled-page-ez2-6-mk2'], ['infiled-ez2-6-mk2', 'pxV', 192, 'infiled-page-ez2-6-mk2'],
        ['absen-m2-9', 'pxH', 168, 'absen-fiche-m2-9'], ['absen-m2-9', 'pxV', 168, 'absen-fiche-m2-9'],
        ['absen-jp5-pro', 'poidsKg', 9.5, 'absen-fiche-jp-pro-v20250624'], ['absen-jp5-pro', 'pxH', 96, 'absen-fiche-jp-pro-v20250624'], ['absen-jp5-pro', 'pxV', 96, 'absen-fiche-jp-pro-v20250624'],
      ];
      const fautes = dalles.filter(([id, champ, valeur, source]) => {
        const x = d(id);
        return x[champ] !== valeur || !ids(x.sources[champ]).includes(source)
          || !['constructeur', 'constructeur, copie hébergée par un tiers'].includes(bd.sources[source]?.confiance);
      }).map(([id, champ]) => `${id}.${champ}`);
      v.egal('dalles : valeurs confirmées, source constructeur (ou sa copie hébergée par un tiers)', fautes, []);
      const u16 = bd.sources['unilumin-fiche-upad-iv-2-6'];
      v.egal('Upad IV 2.6, fiche Unilumin scan 1/16 (SMD1515-16) : adresse, constructeur, date non indiquée dans le document',
        [u16?.url, u16?.confiance, u16?.date, /01\/2022/.test(u16?.dateTexte ?? '')],
        ['https://www.unilumin-usa.com/wp-content/uploads/2022/01/UpadIV2.6-SMD1515-16-Specifications-Sheet.pdf', 'constructeur', null, true]);
      v.egal('BP2 V2 : carte non donnée par ROE, elle reste au parc', d('roe-bp2-v2').carteReceptionMarque, undefined);
      v.egal('CB5 MKII demi : 6,5 kg du manuel non retenu', d('roe-cb5-mkii-demi').sources.poidsKg.autres.filter((x) => x.nonRetenue).map((x) => [x.valeur, ids(x)]), [[6.5, ['roe-manuel-carbon-mkii-v1-8']]]);
      // Règle 2 : la valeur constructeur plus basse est visible, la valeur retenue ne change pas.
      const regle2 = [
        ['absen-pl2-5-pro-v10', 'pMaxW', 192.5, 170, 'absen-fiche-pl-v20221215'],
        ['unilumin-upad-iv-2-6', 'pMaxW', 165, 120, 'unilumin-fiche-upad-iv-2-6'],
        ['absen-m2-9', 'pMaxW', 140, 110, 'absen-fiche-m2-9'],
        ['absen-m2-9', 'poidsKg', 9.99, 7.6, 'absen-fiche-m2-9'],
        ['absen-jp5-pro', 'pMaxW', 188, 172.5, 'absen-fiche-jp-pro-v20250624'],
      ];
      for (const [id, champ, retenue, constructeur, source] of regle2) {
        const s = d(id).sources[champ];
        const autre = s.autres.find((x) => x.valeur === constructeur);
        v.egal(`${id}.${champ} : ${retenue} retenu, ${constructeur} du constructeur visible`, [s.valeur, Boolean(autre && ids(autre).includes(source) && !autre.nonRetenue)], [retenue, true]);
      }
      // Processeurs.
      const procs = [
        ['brompton-t1', 'pixelsMax', 500000, 'brompton-aide-tessera-general-overview'],
        ['brompton-s4', 'pixelsMax', 2073600, 'brompton-fiche-s4-2024-09'], ['brompton-m2', 'pixelsMax', 2073600, 'brompton-fiche-m2-2021-01'],
        ['brompton-s8', 'pixelsMax', 4500000, 'brompton-fiche-s8-2025-03'],
        ['novastar-mctrl300', 'pixelsMax', 1300000, 'novastar-mctrl300-v2-4-1'], ['novastar-mctrl660', 'pixelsMax', 2300000, 'novastar-mctrl660-v1-4-4'],
        ['novastar-mctrl660-pro', 'pixelsMax', 2300000, 'novastar-mctrl660-pro-v1-4-0'], ['novastar-mctrl660-pro', 'ports', 6, 'novastar-mctrl660-pro-v1-4-0'],
        ['novastar-mctrl4k', 'pixelsMax', 8800000, 'novastar-mctrl4k-v1-2-1'], ['novastar-vx2u', 'pixelsMax', 1300000, 'novastar-vx2u-rev-1-0-3'],
        ['novastar-vx4s', 'pixelsMax', 2300000, 'novastar-manuel-vx4-v1-1-2'], ['novastar-vx6s', 'pixelsMax', 3900000, 'novastar-vx6s-v1-3-1'],
        ['novastar-novapro-uhd-jr', 'pixelsMax', 10400000, 'novastar-novapro-uhd-jr-v1-2-0'],
        ['coex-mx40-pro', 'debitUtileBps', 950000000, 'coex-wiki-capacite'], ['coex-mx20', 'debitUtileBps', 950000000, 'coex-wiki-capacite'],
        ['coex-mx20', 'pixelsMax', 3900000, 'coex-mx20-v1-0-1'], ['coex-mx20', 'ports', 6, 'coex-mx20-v1-0-1'],
        ['coex-cx40-pro', 'pixelsMax', 9000000, 'coex-cx40-pro-v1-5-0'],
      ];
      for (const id of ['novastar-mctrl300', 'novastar-mctrl660', 'novastar-mctrl660-pro', 'novastar-mctrl4k', 'novastar-vx2u', 'novastar-vx4s', 'novastar-vx6s', 'novastar-novapro-uhd-jr']) {
        procs.push([id, 'debitUtileBps', 936000000, procs.find((x) => x[0] === id && x[1] === 'pixelsMax')[3]]);
      }
      const fautesP = procs.filter(([id, champ, valeur, source]) => {
        const x = p(id);
        return x[champ] !== valeur || !ids(x.sources[champ]).includes(source) || bp.sources[source]?.confiance !== 'constructeur';
      }).map(([id, champ]) => `${id}.${champ}`);
      v.egal('processeurs : valeurs confirmées, source constructeur', fautesP, []);
      v.egal('T1 : 525 000 de la fiche de septembre 2024 visible, 500 000 retenu', p('brompton-t1').sources.pixelsMax.autres.map((x) => [x.valeur, ids(x)]), [[525000, ['brompton-fiche-t1-2024-09']]]);
      v.egal('MX40 Pro : 659 722, 494 791 (fiche 494 792 arrondi) et 329 861 px en 8, 10 (cartes Pro) et 12 bits',
        [[8, false], [10, true], [12, false]].map(([bits, cartesPro]) => calculs.entierInferieur(calculs.capacitePortProcesseur(p('coex-mx40-pro'), { frequenceHz: 60, bits, cartesPro }).capacite)),
        [659722, 494791, 329861]);
      v.vrai('MCTRL4K : 8,3 M px en DVI signalé', /8,3 M/.test(p('novastar-mctrl4k').note ?? ''));
      v.egal('MCTRL660 : entrées confirmées par la fiche V1.4.4, entrée personnalisée 3840 × 600 ou 548 × 3840 signalée',
        [p('novastar-mctrl660').sources.entreesTypes.source.id, /3840 × 600/.test(p('novastar-mctrl660').note ?? '') && /548 × 3840/.test(p('novastar-mctrl660').note ?? '')], ['novastar-mctrl660-v1-4-4', true]);
    },
  },
  {
    id: 'D30',
    titre: 'Largeur et hauteur maxi des processeurs Novastar et COEX, de leurs fiches ; un mur plus large ou plus haut dépasse un seul processeur, avec la raison',
    etape: 'sources',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const p = (id) => calculs.resoudreFiche(bp.processeurs.find((x) => x.id === id), bp.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const limites = [
        ['novastar-mctrl300', 3840, 3840, 'novastar-mctrl300-v2-4-1'], ['novastar-mctrl660', 3840, 3840, 'novastar-mctrl660-v1-4-4'],
        ['novastar-mctrl660-pro', 3840, 3840, 'novastar-mctrl660-pro-v1-4-0'], ['novastar-mctrl-r5', 3840, 3840, 'novastar-mctrl-r5-v1-0-5'],
        ['novastar-mctrl4k', 7680, 7680, 'novastar-mctrl4k-v1-2-1'], ['novastar-vx6s', 4096, 4096, 'novastar-vx6s-v1-3-1'],
        ['novastar-novapro-uhd-jr', 16384, 8192, 'novastar-novapro-uhd-jr-v1-2-0'], ['coex-mx20', 3840, 2560, 'coex-mx20-v1-0-1'],
        ['coex-mx30', 8192, 7680, 'coex-mx30-v1-0-1'], ['coex-mx40-pro', 16384, 16384, 'coex-mx40-pro-v1-5'], ['coex-cx40-pro', 16384, 16384, 'coex-cx40-pro-v1-5-0'],
      ];
      const fautes = limites.filter(([id, l, h, source]) => {
        const x = p(id);
        return x.largeurMaxPx !== l || x.hauteurMaxPx !== h || !ids(x.sources.largeurMaxPx).includes(source) || !ids(x.sources.hauteurMaxPx).includes(source);
      }).map(([id]) => id);
      v.egal('largeur et hauteur maxi de la fiche de chaque processeur', fautes, []);
      v.egal('MCTRL300 et MCTRL660 : 2560 px de haut non retenus', ['novastar-mctrl300', 'novastar-mctrl660'].map((id) => p(id).sources.hauteurMaxPx.autres.filter((x) => x.nonRetenue).map((x) => x.valeur)), [[2560], [2560]]);
      v.egal('MX20 : 4096 × 4096 non retenus', [p('coex-mx20').sources.largeurMaxPx, p('coex-mx20').sources.hauteurMaxPx].map((s) => s.autres.filter((x) => x.nonRetenue).map((x) => x.valeur)), [[4096], [4096]]);
      const mx30 = p('coex-mx30');
      v.egal('MX30 complet : utilisable dans le calcul', [calculs.champsManquants(mx30), mx30.statut], [[], undefined]);
      v.vrai('MCTRL660 : entrée personnalisée jusqu\'à 3840 × 600 et 548 × 3840, limite réelle 2,3 M px', /3840 × 600/.test(p('novastar-mctrl660').note) && /548 × 3840/.test(p('novastar-mctrl660').note) && !/1920 × 1200/.test(p('novastar-mctrl660').note));
      v.vrai('MCTRL660 Pro : 800 × 3840 à 30 Hz signalé', /800 × 3840 à 30 Hz/.test(p('novastar-mctrl660-pro').note ?? ''));
      // Un mur plus large (ou plus haut) que la limite ne tient pas dans un seul processeur : alerte avec la limite, blocs dans la limite.
      const dalle = { id: 'fictive-128-32', nom: 'Dalle 128 × 32 px', fictive: true, largeurMm: 500, hauteurMm: 125, pxH: 128, pxV: 32 };
      const reglages = { frequenceHz: 60, bits: 8 };
      for (const [id, l, h] of limites) {
        const proc = p(id);
        const large = calculs.evaluerProcesseur(calculs.mur(dalle, Math.floor(l / 128) + 1, 1), dalle, proc, reglages);
        v.vrai(`${id} : mur de plus de ${l} px de large, raison donnée, blocs dans la limite`,
          large.controles.largeur.depasse && large.controles.largeur.limite === l && large.alertes.some((a) => a.includes('de large') && a.includes('au-delà'))
          && large.nombre >= 2 && large.groupes.every((g) => g.largeurPx <= l));
        const haut = calculs.evaluerProcesseur(calculs.mur(dalle, 1, Math.floor(h / 32) + 1), dalle, proc, reglages);
        v.vrai(`${id} : mur de plus de ${h} px de haut, raison donnée, blocs dans la limite`,
          haut.controles.hauteur.depasse && haut.controles.hauteur.limite === h && haut.alertes.some((a) => a.includes('de haut') && a.includes('au-delà'))
          && haut.nombre >= 2 && haut.groupes.every((g) => g.hauteurPx <= h));
      }
      const m660 = p('novastar-mctrl660');
      v.egal('MCTRL660 : 3840 × 576 et 512 × 3840 px tiennent dans un seul (sous 2,3 M px)',
        [calculs.evaluerProcesseur(calculs.mur(dalle, 30, 18), dalle, m660, reglages).nombre, calculs.evaluerProcesseur(calculs.mur(dalle, 4, 120), dalle, m660, reglages).nombre], [1, 1]);
    },
  },
  {
    id: 'D31',
    titre: 'COEX existants complétés par leurs fiches : entrées, sorties optiques, latence, consommation, poids, adresses',
    etape: 'coex',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const p = (id) => calculs.resoudreFiche(bp.processeurs.find((x) => x.id === id), bp.sources);
      const mx20 = p('coex-mx20');
      v.egal('MX20 : entrées HDMI 1.3 et 3G-SDI (fiche V1.0.1), 50 W, 4,5 kg', [mx20.entreesTypes, mx20.sources.entreesTypes.source.id, mx20.puissanceW, mx20.poidsKg], [['hdmi-1.3', '3g-sdi'], 'coex-mx20-v1-0-1', 50, 4.5]);
      v.vrai('MX20 : 2 × HDMI 1.3 (1920 × 1200), OPT 1 = ports 1 à 6, OPT 2 copie, latence 0 ou 1 trame',
        /2 × HDMI 1\.3/.test(mx20.entrees) && /1920 × 1200/.test(mx20.entrees) && /OPT 1/.test(mx20.sortiesOptiques) && /copie/.test(mx20.sortiesOptiques) && /0 trame/.test(mx20.latence));
      v.vrai('MX30 : OPT 1 = ports 1 à 10, OPT 2 copie', /ports 1 à 10/.test(p('coex-mx30').sortiesOptiques) && /copie/.test(p('coex-mx30').sortiesOptiques));
      const mx40 = p('coex-mx40-pro');
      v.egal('MX40 Pro : 95 W, 7,5 kg, 1U', [mx40.puissanceW, mx40.poidsKg, mx40.hauteurU], [95, 7.5, 1]);
      v.vrai('MX40 Pro : modes 20 et 40 ports décrits', /mode 20 ports/i.test(mx40.sortiesOptiques) && /mode 40 ports/i.test(mx40.sortiesOptiques) && /CVT10/.test(mx40.sortiesOptiques));
      const dp = (mx40.entreesFormats ?? []).find((f) => f.type === 'dp-1.2');
      v.egal('MX40 Pro : DP 1.2 à 4096 × 2160 ou 8192 × 1080 à 60 Hz (format de fiche)', [dp?.largeurPx, dp?.hauteurPx, dp?.frequenceHz, dp?.largeurMaxPx], [4096, 2160, 60, 8192]);
      const cx40 = p('coex-cx40-pro');
      v.egal('CX40 Pro : entrées de la fiche V1.5.0, 105 W, 8,1 kg', [cx40.entreesTypes, cx40.sources.entreesTypes.source.id, cx40.puissanceW, cx40.poidsKg], [['hdmi-2.0', 'dp-1.2', '12g-sdi'], 'coex-cx40-pro-v1-5-0', 105, 8.1]);
      v.vrai('CX40 Pro : 1 optique 40G', /40G/.test(cx40.sortiesOptiques));
      const adresses = ['coex-mx20-v1-0-1', 'coex-mx30-v1-0-1', 'coex-mx40-pro-v1-5', 'coex-cx40-pro-v1-5-0', 'coex-wiki-capacite', 'coex-wiki-5g']
        .filter((id) => !/^https:\/\//.test(bp.sources[id]?.url ?? ''));
      v.egal('adresse de chaque fiche et page du wiki COEX', adresses, []);
    },
  },
  {
    id: 'D32',
    titre: 'Convertisseurs COEX : CVT10, CVT10 Pro et CVT8-5G, entrées, sorties, fibre, consommation, poids',
    etape: 'coex',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const d = (id) => calculs.resoudreFiche(bp.distributeurs.find((x) => x.id === id), bp.sources);
      const cvt10 = d('novastar-cvt10');
      v.egal('CVT10 : 1 port 10G vers 10 ports 1G, 22 W', [cvt10.sorties, cvt10.typeSorties, cvt10.entree, cvt10.puissanceW, cvt10.sources.sorties.source.id], [10, '1G', '1 × 10G', 22, 'coex-wiki-cvt10']);
      v.vrai('CVT10 : S monomode 10 km, M multimode 300 m ; deux côte à côte = 1U', /10 km/.test(cvt10.fibre) && /300 m/.test(cvt10.fibre) && /1U/.test(cvt10.note ?? ''));
      const pro = d('novastar-cvt10-pro');
      v.egal('CVT10 Pro : 10 ports 1G, 22 W, 5,9 kg (fiche V1.1.0)', [pro.sorties, pro.puissanceW, pro.poidsKg, pro.sources.poidsKg.source.id], [10, 22, 5.9, 'coex-cvt10-pro-v1-1-0']);
      const cvt8 = d('coex-cvt8-5g');
      v.egal('CVT8-5G : 1 port 40G vers 8 ports 5G, 33 W, 2,26 kg', [cvt8.sorties, cvt8.typeSorties, cvt8.entree, cvt8.puissanceW, cvt8.poidsKg], [8, '5G', '1 × 40G', 33, 2.26]);
      v.vrai('CVT8-5G : 5GS monomode 10 km, 5GM multimode OM3 100 m ou OM4 150 m, MPO', /10 km/.test(cvt8.fibre) && /OM3 100 m/.test(cvt8.fibre) && /OM4 150 m/.test(cvt8.fibre) && /MPO/.test(cvt8.fibre));
      v.vrai('CVT8-5G : copie non officielle signalée', /copie non officielle/.test(bp.sources[cvt8.sources.sorties.source.id]?.confiance ?? ''));
    },
  },
  {
    id: 'D33',
    titre: 'Nouveaux processeurs COEX : KU20, SP60 Pro, MX2000 Pro, MX6000 Pro, avec leurs fiches',
    etape: 'coex',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const p = (id) => calculs.resoudreFiche(bp.processeurs.find((x) => x.id === id), bp.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const ku20 = p('coex-ku20');
      v.egal('KU20 : 3,9 M px, 6 ports, 3840 × 2560, 25 W, 2,1 kg, fiche V1.1.0',
        [ku20.pixelsMax, ku20.ports, ku20.largeurMaxPx, ku20.hauteurMaxPx, ku20.puissanceW, ku20.poidsKg, ku20.latence, ids(ku20.sources.pixelsMax)],
        [3900000, 6, 3840, 2560, 25, 2.1, '0 trame', ['coex-ku20-v1-1-0']]);
      const mx2000 = p('coex-mx2000-pro');
      v.egal('MX2000 Pro : 35,38 M px, 8192 × 8192, 2 emplacements de sortie, 260 W, 12 kg',
        [mx2000.pixelsMax, mx2000.largeurMaxPx, mx2000.hauteurMaxPx, mx2000.emplacementsSortie, mx2000.puissanceW, mx2000.poidsKg], [35380000, 8192, 8192, 2, 260, 12]);
      v.vrai('MX2000 Pro : 8192 peut-être par entrée comme sur le MX6000 Pro, à confirmer', /par entrée/.test(mx2000.sources.largeurMaxPx.note ?? '') && /à confirmer/.test(mx2000.sources.largeurMaxPx.note ?? ''));
      v.egal('MX2000 Pro : capacité 1G de sa fiche ; 5G et 128 px déduits',
        [ids(mx2000.sources.debitUtileBps).includes('coex-mx2000-pro-v1-1-1'), mx2000.sources.capacite5G60Hz8bits.source.confiance, mx2000.sources.largeurChargeeMinPx.source.confiance],
        [true, 'déduit', 'déduit']);
      v.egal('MX2000 Pro : fiche V1.1.1, copie hébergée par ark.ventures', bp.sources['coex-mx2000-pro-v1-1-1'].confiance, 'constructeur, copie hébergée par un tiers');
      const mx6000 = p('coex-mx6000-pro');
      v.egal('MX6000 Pro : 141 M px, 16 384 px de large ou de haut par carte de sortie, 8192 px par entrée, 8 emplacements de sortie, 625 W, 31 kg sans cartes',
        [mx6000.pixelsMax, mx6000.largeurMaxPx, mx6000.hauteurMaxPx, mx6000.sourceMaxPx, mx6000.emplacementsSortie, mx6000.puissanceW, mx6000.poidsKg], [141000000, 16384, 16384, 8192, 8, 625, 31]);
      v.egal('MX6000 Pro : cartes de sortie 4x10G et 1 × 40G', [mx6000.carteSortie1G.nom, mx6000.carteSortie5G.nom], ['MX_4x10G_Fiber', 'CX_1x40G_Fiber']);
      v.vrai('MX6000 Pro : entrées 8K (HDMI 2.1, DP 1.4) et ST 2110 signalées', /HDMI 2\.1/.test(mx6000.entrees) && /DP 1\.4/.test(mx6000.entrees) && /ST 2110/.test(mx6000.entrees));
      v.egal('MX6000 Pro, 5G : 2 592 000 / 2 073 000 / 1 475 600 px (le plus bas des fiches V1.1.1 et V1.5.0), document constructeur',
        [8, 10, 12].map((b) => [mx6000[`capacite5G60Hz${b}bits`], ['constructeur', 'constructeur, copie hébergée par un tiers'].includes(mx6000.sources[`capacite5G60Hz${b}bits`].source.confiance)]),
        [[2592000, true], [2073000, true], [1475600, true]]);
      v.egal('MX6000 Pro, 5G : anciennes valeurs de la V1.1.1 visibles (1 728 000 px en 12 bits)', mx6000.sources.capacite5G60Hz12bits.autres.map((x) => [x.valeur, ids(x)]), [[1728000, ['coex-mx6000-pro-v1-1-1']]]);
      v.egal('MX6000 Pro, 5G avec XA50 Pro ou CA50E : 2 951 200 / 2 291 312 / 1 475 600 px (V1.5.0)',
        [8, 10, 12].map((b) => [mx6000[`capacite5GHaute60Hz${b}bits`], ids(mx6000.sources[`capacite5GHaute60Hz${b}bits`])[0]]),
        [[2951200, 'coex-mx6000-pro-v1-5-0'], [2291312, 'coex-mx6000-pro-v1-5-0'], [1475600, 'coex-mx6000-pro-v1-5-0']]);
      v.egal('MX6000 Pro : capacité 1G et règle des 128 px de sa fiche', [ids(mx6000.sources.debitUtileBps).includes('coex-mx6000-pro-v1-5-0'), mx6000.sources.largeurChargeeMinPx.source.id], [true, 'coex-mx6000-pro-v1-5-0']);
      const sp60 = p('coex-sp60-pro');
      v.egal('SP60 Pro : fiche d\'information V1.0.0, calcul hors appli', [sp60.calculHorsAppli, ids(sp60.sources.ports)], ['processeur sous-pixel, calcul hors appli', ['coex-sp60-pro-v1-0-0']]);
      const adresses = ['coex-ku20-v1-1-0', 'coex-mx2000-pro-v1-1-1', 'coex-wiki-mx2000-pro', 'coex-mx6000-pro-v1-1-1', 'coex-mx6000-pro-v1-5-0', 'coex-sp60-pro-v1-0-0']
        .filter((id) => !/^https:\/\//.test(bp.sources[id]?.url ?? ''));
      v.egal('adresse de chaque fiche', adresses, []);
    },
  },
  {
    id: 'D34',
    titre: 'Cartes de réception COEX Novastar : capacité d\'une carte en 8, 10 et 12 bits, IC PWM ou classiques, fiche et adresse',
    etape: 'coex',
    verifier(v, contexte) {
      const bp = baseProcesseurs(contexte);
      const cartes = bp.cartesReception.map((c) => calculs.resoudreFiche(c, bp.sources));
      v.egal('7 cartes', cartes.map((c) => c.modele), ['A5s Plus', 'A7s Plus', 'A8s Pro', 'A10s Pro', 'A10s Plus-N', 'CA50E', 'XA50 Pro']);
      const cap = (modele) => cartes.find((c) => c.modele === modele).capacites.map((x) => `${x.bits}${x.ic ? ` ${x.ic}` : ''} ${x.largeurPx}×${x.hauteurPx}`);
      v.egal('A5s Plus', cap('A5s Plus'), ['8 PWM 512×384', '8 classique 384×384', '10 PWM 256×384', '10 classique 192×384', '12 PWM 256×384', '12 classique 192×384']);
      v.egal('A7s Plus : 10 et 12 bits non précisés', cap('A7s Plus'), ['8 PWM 512×512', '8 classique 512×384']);
      v.egal('A8s Pro', cap('A8s Pro'), ['8 512×512']);
      v.egal('A10s Pro', cap('A10s Pro'), ['8 512×512', '10 512×512', '12 512×256']);
      v.egal('A10s Plus-N', cap('A10s Plus-N'), ['8 PWM 512×512']);
      v.egal('CA50E, 5G', [cartes.find((c) => c.modele === 'CA50E').typePorts, cap('CA50E')], ['5G', ['8 768×512', '10 768×512', '12 512×480']]);
      v.egal('XA50 Pro, 5G', [cartes.find((c) => c.modele === 'XA50 Pro').typePorts, cap('XA50 Pro')], ['5G', ['8 1024×512', '10 1024×512', '12 620×512']]);
      const fautes = cartes.filter((c) => {
        const s = bp.sources[c.sources.capacites.source.id];
        return s?.confiance !== 'constructeur' || !/^https:\/\//.test(s?.url ?? '') || !s?.date;
      }).map((c) => c.modele);
      v.egal('chaque carte : fiche constructeur datée, avec son adresse', fautes, []);
    },
  },
  {
    id: 'D35',
    titre: 'Fiches « information » : plus aucune fiche ni source LEDCAST (erreur de marque) ; LEDECA LDSOSP04.8ST (fiche erronée sur le site), exclue du calcul',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const toutes = [...base.dalles, ...base.gabarits, ...(base.informations ?? [])];
      v.egal('aucune fiche LEDCAST', toutes.filter((f) => f.marque === 'LEDCAST' || f.id.startsWith('ledcast')).map((f) => f.id), []);
      v.egal('aucune source ledcast.fr', Object.entries(base.sources).filter(([id, s]) => /ledcast/i.test(`${id} ${s.url ?? ''} ${s.titre}`)).map(([id]) => id), []);
      const brute = (base.informations ?? []).find((f) => f.id === 'ledeca-ldsosp04-8st');
      const info = brute && calculs.resoudreFiche(brute, base.sources);
      v.egal('LDSOSP04.8ST : fiche d\'information, gamme Smart, 4,8 mm, extérieur', [info?.statut, info?.marque, info?.gamme, info?.pitchMm, info?.usage], ['information', 'LEDECA', 'Smart', 4.8, 'extérieur']);
      v.vrai('LDSOSP04.8ST : fiche erronée signalée (le PDF décrit un modèle intérieur 2,6 mm)', /erronée/.test(info?.note ?? '') && /2,6 mm/.test(info?.note ?? ''));
      v.vrai('LDSOSP04.8ST : pitch lu sur la page STAGE de ledeca.com, adresse du PDF erroné dans la note', /ledeca\.com\/en\/stage/.test(base.sources[info?.sources.pitchMm.source.id]?.url ?? '')
        && /ledeca\.com\/pdf\/LDSOSP04\.8ST\.pdf/.test(info?.note ?? ''));
      v.egal('fiches d\'information : jamais de largeur ni de hauteur, donc hors calcul', (base.informations ?? []).filter((f) => f.largeurMm || f.hauteurMm).map((f) => f.id), []);
    },
  },
  {
    id: 'D36',
    titre: 'Catalogue ROE du 25/09/2026 : une fiche par version, source de chaque gamme, demi-dalles reliées, chaînage 20 des BO et BP, gammes non relevées en information',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const d = (id) => calculs.resoudreFiche(fiche(base, id), base.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const roe = base.dalles.filter((f) => f.marque === 'ROE');
      const parGamme = {};
      for (const f of roe) parGamme[f.gamme] = (parGamme[f.gamme] ?? 0) + 1;
      const trie = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      v.egal('fiches par gamme', trie(parGamme), trie({
        'Black Onyx': 2, 'Black Pearl': 3, Carbon: 6, 'Carbon MKII': 6, 'Black Quartz': 6, Ruby: 7, 'Ruby-C': 3, Topaz: 11,
        Diamond: 2, Graphite: 8, Jet: 9, 'Vanish ST': 3, Obsidian: 1, 'Black Marble': 2,
      }));
      const champs = (f, noms) => noms.map((n) => f[n]);
      const DIM = ['pitchMm', 'largeurMm', 'hauteurMm', 'profondeurMm', 'pxH', 'pxV', 'poidsKg', 'pMaxW', 'pMoyW', 'maxAccroche', 'maxStack'];
      v.egal('BO2 (manuel V1.8)', champs(d('roe-bo2'), DIM), [2.84, 500, 500, 90, 176, 176, 9.35, 160, 80, 20, 12]);
      v.egal('BO2 : source, manuel Black Onyx & Pearl V1.8', ids(d('roe-bo2').sources.pxH), ['roe-manuel-black-onyx-pearl-v1-8']);
      v.egal('BP3', champs(d('roe-bp3'), ['pitchMm', 'pxH', 'poidsKg', 'pMaxW', 'courbure']), [3.91, 128, 8.7, 170, 'concave 10°']);
      v.egal('chaînage BO et BP : 20 dalles par câble (manuel V1.8), 10 à 110 V en note',
        [...['roe-bo2', 'roe-bo3', 'roe-bp2', 'roe-bp2-v2', 'roe-bp3'].map((id) => d(id).chainagePowerMax), /110 V/.test(d('roe-bp2-v2').sources.chainagePowerMax.note ?? '')], [20, 20, 20, 20, 20, true]);
      const bp2 = d('roe-bp2-v2');
      v.egal('BP2 V2 : valeurs retenues inchangées (190 W, 95 W, 9,35 kg, 20 / 12)', champs(bp2, ['pMaxW', 'pMoyW', 'poidsKg', 'maxAccroche', 'maxStack']), [190, 95, 9.35, 20, 12]);
      v.vrai('BP2 V2 : page produit ROE ajoutée aux 190 W', ids(bp2.sources.pMaxW).includes('roe-page-produit-black-pearl'));
      v.egal('BP2 V2 à 16 A : 14 dalles par ligne (puissance), pas 20 (câble)', (() => {
        const r = calculs.electricite(calculs.mur(bp2, 10, 4), bp2, {});
        return [r.dallesParLigne.retenu, r.dallesParLigne.chainage, r.dallesParLigne.limite];
      })(), [14, 20, 'puissance']);
      v.egal('CB8 (Carbon)', champs(d('roe-cb8'), [...DIM, 'indiceIP']), [8.33, 600, 1200, 72, 72, 144, 12.68, 430, 220, 12, 5, 'IP65']);
      v.egal('CB8 demi, reliée', [...champs(d('roe-cb8-demi'), ['hauteurMm', 'pxV', 'poidsKg', 'pMaxW', 'maxAccroche', 'maxStack']), d('roe-cb8').demiDalle, d('roe-cb8-demi').demiDe],
        [600, 72, 7.05, 220, 24, 10, 'roe-cb8-demi', 'roe-cb8']);
      v.egal('CB3 (Carbon) : IP40', d('roe-cb3').indiceIP, 'IP40');
      v.egal('Carbon MKII : CB8 MKII et sa demi', [...champs(d('roe-cb8-mkii'), ['profondeurMm', 'poidsKg', 'pMaxW', 'pMoyW']), ...champs(d('roe-cb8-mkii-demi'), ['poidsKg', 'pMaxW'])], [79, 11, 530, 260, 6, 260]);
      v.egal('CB3 MKII : demi-dalle reliée, valeurs retenues inchangées, P moyenne ajoutée', [d('roe-cb3-mkii').demiDalle, d('roe-cb3-mkii').poidsKg, d('roe-cb3-mkii').pMaxW, d('roe-cb3-mkii').pMoyW, d('roe-cb3-mkii-demi').poidsKg],
        ['roe-cb3-mkii-demi', 14.4, 600, 300, 7.8]);
      v.egal('BQ3.9 et sa demi (accroche non donnée)', [...champs(d('roe-bq3-9'), ['profondeurMm', 'pxV', 'poidsKg', 'pMaxW', 'maxAccroche', 'maxStack', 'indiceIP']), d('roe-bq3-9-demi').poidsKg, d('roe-bq3-9-demi').maxAccroche],
        [82.62, 256, 22, 360, 13, 6, 'IP65', 9.8, undefined]);
      const rb = d('roe-rb2-6f');
      v.egal('RB2.6F (fiche Ruby, copie CPL)', [...champs(rb, ['pitchMm', 'profondeurMm', 'pxH', 'poidsKg', 'pMaxW', 'courbure']), rb.sources.pxH.source.confiance, rb.sources.pxH.source.date],
        [2.604, 73, 192, 8.02, 210, 'concave 5° à convexe 5°', 'constructeur, copie hébergée par un tiers', '2023-09']);
      v.egal('RB-C2.6 : 108 mm, IP40, courbe ±30°', champs(d('roe-rb-c2-6'), ['profondeurMm', 'indiceIP', 'courbure']), [108, 'IP40', 'concave 30° à convexe 30°']);
      v.egal('Topaz : TP-B2.6 (72,19 mm, 16 / 12), TP2.6 sans profondeur', [...champs(d('roe-tp-b2-6'), ['profondeurMm', 'poidsKg', 'maxAccroche']), d('roe-tp2-6').profondeurMm], [72.19, 9.08, 16, undefined]);
      v.egal('DM3.9', champs(d('roe-dm3-9'), ['pitchMm', 'pxH', 'poidsKg', 'pMaxW', 'pMoyW']), [3.906, 128, 5.76, 150, 80]);
      v.egal('GP2.6 4 en 1 et sa demi, pitch non relevé', [...champs(d('roe-gp2-6-4en1'), ['hauteurMm', 'pxV', 'poidsKg', 'pMaxW', 'pitchMm']), d('roe-gp2-6-4en1-demi').poidsKg, d('roe-gp2-6-4en1').demiDalle],
        [1000, 384, 8.6, 250, undefined, 5.1, 'roe-gp2-6-4en1-demi']);
      v.egal('JT1.9 (GOB) et JT3.9 demi', [...champs(d('roe-jt1-9'), ['pxH', 'poidsKg', 'maxAccroche', 'courbure']), d('roe-jt3-9-demi').pMoyW], [256, 6.1, 24, 'concave 5°', 72.5]);
      v.egal('V6ST', champs(d('roe-v6st'), ['pitchMm', 'largeurMm', 'pxH', 'poidsKg', 'pMaxW', 'maxAccroche', 'maxStack', 'indiceIP', 'usage']), [6.94, 1000, 144, 34.3, 700, 20, 6, 'IP65', 'extérieur']);
      v.egal('OB2.6', champs(d('roe-ob2-6'), ['profondeurMm', 'poidsKg', 'pMaxW', 'indiceIP', 'maxStack']), [74.6, 5.4, 220, 'IP63', 20]);
      const bm4 = d('roe-bm4');
      v.egal('BM4 : 23,4 kg retenu, 17,5 kg visible selon la finition', [bm4.poidsKg, bm4.sources.poidsKg.autres.map((x) => x.valeur), /finition/.test(bm4.sources.poidsKg.note ?? '')], [23.4, [17.5], true]);
      v.egal('carte de réception jamais fixée sur une fiche ROE, note Brompton, MVR, Evision', [roe.filter((f) => f.carteReceptionMarque || f.carteReceptionModele).map((f) => f.id),
        roe.filter((f) => !/Brompton.*MVR.*Evision/.test(f.note ?? '')).map((f) => f.id)], [[], []]);
      const angles = (base.informations ?? []).filter((f) => f.gamme === 'Graphite').map((f) => calculs.resoudreFiche(f, base.sources));
      v.egal('Graphite angle droit : deux fiches d\'information (angle, hors calcul d\'un mur plat)', [angles.length, angles.every((f) => /250 × 500 × 250/.test(f.note ?? '') && f.pxH === 192)], [2, true]);
      const nonReleves = (base.informations ?? []).filter((f) => f.marque === 'ROE' && f.gamme !== 'Graphite').map((f) => calculs.resoudreFiche(f, base.sources));
      v.egal('gammes non relevées : nom et pitch seulement', nonReleves.map((f) => [f.nom, f.pitchMm]), [
        ['ROE RB-C2.3', 2.3], ['ROE V8T', 8.94], ['ROE Vanish intérieur 8.94', 8.94], ['ROE Vanish intérieur 5.68', 5.68], ['ROE BM5', 5.7],
        ['ROE Jasper 2.6', 2.6], ['ROE Jasper 3.9', 3.9], ['ROE Jasper 5.2', 5.2], ['ROE Meru 1.9', 1.9], ['ROE Meru 2.6', 2.6],
      ]);
      v.egal('gammes non relevées : aucune autre valeur, source liste des produits ROE', nonReleves.filter((f) => Object.keys(f.sources).join() !== 'pitchMm'
        || f.sources.pitchMm.source.id !== 'roe-liste-produits').map((f) => f.nom), []);
      v.vrai('source des gammes non relevées : consultée le 25/09/2026', /liste des produits ROE/i.test(base.sources['roe-liste-produits']?.titre ?? '') && base.sources['roe-liste-produits']?.date === '2026-09-25');
      const pages = Object.entries(base.sources).filter(([id]) => id.startsWith('roe-page-produit-') && !['roe-page-produit-cb5-mkii', 'roe-page-produit-carbon-mkii'].includes(id));
      v.egal('pages produit ROE : adresse roevisual.com, consultées le 25/09/2026', pages.filter(([, s]) => !/roevisual\.com/.test(s.url ?? '') || s.date !== '2026-09-25').map(([id]) => id), []);
    },
  },
  {
    id: 'D37',
    titre: 'Catalogue Unilumin : URMIII (poids des fiches, 500 × 500 reliées en demi-dalles), URMIII03 et Upad IV 2.6 en deux versions (la plus défavorable par défaut), nouvelles Upad IV',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const d = (id) => calculs.resoudreFiche(fiche(base, id), base.sources);
      const ids = (s) => s.sources.map((x) => x.id);
      const champs = (f, noms) => noms.map((n) => f[n]);
      const urm = base.dalles.filter((f) => f.gamme === 'URMIII').map((f) => f.id);
      v.egal('URMIII : 9 fiches', urm.length, 9);
      const u2 = d('unilumin-urmiii2-500x1000');
      v.egal('URMIII2 500 × 1000', champs(u2, ['pitchMm', 'largeurMm', 'hauteurMm', 'profondeurMm', 'pxH', 'pxV', 'poidsKg', 'pMaxW', 'pMoyW', 'indiceIP', 'usage']),
        [2.9, 500, 1000, 83, 168, 336, 14, 240, 70, 'IP30', 'intérieur']);
      v.egal('URMIII2 : 12,5 kg de la page produit visible, non retenu (fiche 14 kg)', [u2.sources.poidsKg.autres.map((x) => x.valeur), ids(u2.sources.poidsKg)], [[12.5], ['unilumin-fiche-urmiii2-v2-8']]);
      v.egal('URMIII2 : fiche V2.8 du 03/2025, constructeur', [base.sources['unilumin-fiche-urmiii2-v2-8']?.date, base.sources['unilumin-fiche-urmiii2-v2-8']?.confiance], ['2025-03', 'constructeur']);
      v.egal('URMIII2 500 × 500, demi-dalle de la 500 × 1000', [...champs(d('unilumin-urmiii2-500x500'), ['pxH', 'pxV', 'poidsKg', 'pMaxW']), u2.demiDalle, d('unilumin-urmiii2-500x500').demiDe],
        [168, 168, 8, 120, 'unilumin-urmiii2-500x500', 'unilumin-urmiii2-500x1000']);
      v.egal('URMIII2.6 : 500 × 500 seule', [d('unilumin-urmiii2-6').demiDe, d('unilumin-urmiii2-6').pMaxW], [null, 140]);
      v.egal('URMIII04 : fiches V2.7 de 05/2024 (500 × 1000) et 05/2023 (500 × 500)',
        [ids(d('unilumin-urmiii04-500x1000').sources.pxH), ids(d('unilumin-urmiii04-500x500').sources.pxH), base.sources['unilumin-fiche-urmiii04-500x1000-v2-7']?.date, base.sources['unilumin-fiche-urmiii04-500x500-v2-7']?.date],
        [['unilumin-fiche-urmiii04-500x1000-v2-7'], ['unilumin-fiche-urmiii04-500x500-v2-7'], '2024-05', '2023-05']);
      const u03 = d('unilumin-urmiii03-500x1000');
      v.egal('URMIII03 500 × 1000 : deux versions', u03.declinaisons.map((x) => x.id), ['standard', 'black']);
      v.egal('URMIII03 500 × 1000 : la plus défavorable par défaut (Black, scan 1/8)', champs(u03, ['pMaxW', 'pMoyW', 'scan', 'poidsKg']), [420, 150, '1/8', 14.6]);
      v.egal('URMIII03 500 × 1000 : 335 W de la version standard visible', u03.sources.pMaxW.autres.map((x) => x.valeur), [335]);
      v.egal('URMIII03 500 × 500 : 220 W par défaut, 170 W visible, demi-dalle de la 500 × 1000', [d('unilumin-urmiii03-500x500').pMaxW, d('unilumin-urmiii03-500x500').sources.pMaxW.autres.map((x) => x.valeur), u03.demiDalle],
        [220, [170], 'unilumin-urmiii03-500x500']);
      const upad = d('unilumin-upad-iv-2-6');
      v.egal('Upad IV 2.6 : deux versions, 165 W par défaut (scan 1/8), confirmé par la fiche Unilumin V1.3', [upad.declinaisons.map((x) => x.id), upad.pMaxW, upad.scan, ids(upad.sources.pMaxW).includes('unilumin-fiche-upad-iv-2-6-v1-3'), upad.luminositeNits],
        [['scan-1-8', 'scan-1-16'], 165, '1/8', true, 1500]);
      v.egal('Upad IV 1.9 Pro F', champs(d('unilumin-upad-iv-1-9-pro-f'), ['pitchMm', 'profondeurMm', 'pxH', 'poidsKg', 'pMaxW', 'pMoyW', 'luminositeNits', 'scan']), [1.9, 72, 256, 7.6, 150, 50, 1500, '1/8']);
      v.egal('Upad IV 1.9 Pro XR', champs(d('unilumin-upad-iv-1-9-pro-xr'), ['poidsKg', 'pMaxW', 'luminositeNits', 'scan']), [6.3, 130, 1200, '1/16']);
      v.egal('Upad IV 1.5 MIP', champs(d('unilumin-upad-iv-1-5-mip'), ['pxH', 'pMaxW', 'pMoyW', 'luminositeNits', 'scan']), [320, 80, 25, 800, '1/27']);
      v.egal('Upad IV-S (courbe ±40°) et IV-C (angle, 155 W, fiche « 150/155 »)', [d('unilumin-upad-iv-s').courbure, d('unilumin-upad-iv-s').pMaxW, d('unilumin-upad-iv-c').pMaxW, /150\/155/.test(d('unilumin-upad-iv-c').sources.pMaxW.note ?? '')],
        ['±40°', 160, 155, true]);
      v.egal('accroche et stack : non donnés par Unilumin', base.dalles.filter((f) => f.marque === 'Unilumin' && (f.maxAccroche || f.maxStack)).map((f) => f.id), []);
    },
  },
  {
    id: 'D38',
    titre: 'Catalogue LEDECA : plafonds des fiches ramenés à la dalle (« plafond constructeur »), carte de réception inconnue, 168 px (Armour) et 172 px (Smart, Compact) en 2,9 mm',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const d = (id) => calculs.resoudreFiche(fiche(base, id), base.sources);
      const champs = (f, noms) => noms.map((n) => f[n]);
      const ledeca = base.dalles.filter((f) => f.marque === 'LEDECA');
      const parGamme = {};
      for (const f of ledeca) parGamme[f.gamme] = (parGamme[f.gamme] ?? 0) + 1;
      v.egal('fiches par gamme', [parGamme.Armour, parGamme.Smart, parGamme.Compact, Object.keys(parGamme).length], [6, 7, 4, 3]);
      const ldaosp = d('ledeca-ldaosp03-9st');
      v.egal('LDAOSP03.9ST', champs(ldaosp, ['pitchMm', 'largeurMm', 'hauteurMm', 'pxH', 'pxV', 'poidsKg', 'pMaxW', 'pMoyW', 'luminositeNits', 'indiceIP', 'courbure', 'usage', 'rafraichissementHz']),
        [3.9, 500, 1000, 128, 256, 15, 300, 60, 4500, 'IP54', '±6°', 'extérieur', 3840]);
      v.egal('plafonds : type « plafond constructeur » (poids, P max, P moyenne)', ['poidsKg', 'pMaxW', 'pMoyW'].map((n) => ldaosp.sources[n].type), ['plafond constructeur', 'plafond constructeur', 'plafond constructeur']);
      v.vrai('P max : 600 W/m² de la fiche, ramené à la dalle de 0,5 m²', /600 W\/m²/.test(ldaosp.sources.pMaxW.note ?? '') && /0,5 m²/.test(ldaosp.sources.pMaxW.note ?? ''));
      v.egal('luminosité : 5000 nits visible', ldaosp.sources.luminositeNits.autres.map((x) => x.valeur), [5000]);
      v.egal('500 × 500 : 150 W, 30 W, 8 kg', champs(d('ledeca-ldaisp03-9st'), ['pMaxW', 'pMoyW', 'poidsKg']), [150, 30, 8]);
      v.egal('2,9 mm : 168 px en Armour, 172 px en Smart et Compact',
        [d('ledeca-ldaisp02-9st').pxH, d('ledeca-ldsisp02-9st-500x500').pxH, d('ledeca-ldsisp02-9st-500x1000').pxV, d('ledeca-ldcosp02-9st').pxV], [168, 172, 344, 172 * 2]);
      v.egal('Smart en deux formats : 500 × 500 et 500 × 1000', champs(d('ledeca-ldsosp03-9st-500x1000'), ['hauteurMm', 'poidsKg', 'pMaxW', 'indiceIP']), [1000, 13.9, 300, 'IP65 avant, IP54 arrière']);
      v.vrai('Compact intérieur : 500 × 1000, option 500 × 500 signalée', d('ledeca-ldcisp03-9st').hauteurMm === 1000 && /500 × 500/.test(d('ledeca-ldcisp03-9st').note ?? ''));
      v.egal('carte de réception inconnue, à demander au loueur', [ledeca.filter((f) => f.carteReceptionMarque || f.carteReceptionModele).map((f) => f.id), ledeca.every((f) => /loueur/.test(f.note ?? ''))], [[], true]);
      v.vrai('sources : fiche PDF de ledeca.com de chaque modèle', ledeca.every((f) => {
        const r = d(f.id);
        return new RegExp(`ledeca\\.com/pdf/${f.modele.replace('.', '\\.')}\\.pdf`).test(base.sources[r.sources.pxH.source.id]?.url ?? '');
      }));
    },
  },
  {
    id: 'D39',
    titre: 'LEDECA, fiches relues le 25/09/2026 : poids « plafond constructeur » pour Armour (« <15kg », « <8kg ») et Compact (« <15kg »), poids constructeur ordinaire pour Smart (« 8,5kg & 13,9kg »…), P max et P moyenne en plafond pour toutes (« <600W », « <120W » par m²)',
    etape: 'catalogue',
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const ledeca = base.dalles.filter((f) => f.marque === 'LEDECA').map((f) => calculs.resoudreFiche(f, base.sources));
      const typePoids = (gamme) => [...new Set(ledeca.filter((d) => d.gamme === gamme).map((d) => d.sources.poidsKg.type ?? 'constructeur'))];
      v.egal('poids : plafond en Armour et Compact, constructeur en Smart', [typePoids('Armour'), typePoids('Compact'), typePoids('Smart')],
        [['plafond constructeur'], ['plafond constructeur'], ['constructeur']]);
      v.egal('Smart : poids de la fiche', ['ledeca-ldsosp03-9st-500x500', 'ledeca-ldsosp03-9st-500x1000', 'ledeca-ldsisp03-9st-500x1000', 'ledeca-ldsisp02-9st-500x500', 'ledeca-ldsisp02-6st']
        .map((id) => ledeca.find((d) => d.id === id).poidsKg), [8.5, 13.9, 13, 7.9, 7.9]);
      v.egal('P max et P moyenne : plafond pour les 17 dalles LEDECA', [ledeca.length, ledeca.every((d) => d.sources.pMaxW.type === 'plafond constructeur' && d.sources.pMoyW.type === 'plafond constructeur')], [17, true]);
    },
  },
];
