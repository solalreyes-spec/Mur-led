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
    titre: 'Pitch de la fiche contrôlé par largeur / pixels (à 0,01 mm près)',
    etape: 1,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      for (const f of base.dalles) {
        const d = calculs.resoudreFiche(f, base.sources);
        v.proche(`${f.id} : ${d.largeurMm} / ${d.pxH}`, calculs.pitchCalculeMm(d), d.pitchMm, 0.01);
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
      v.egal('BP2 V2 : 190 W, sources', ids(bp2.sources.pMaxW), ['roe-manuel-black-onyx-pearl-v1-8', '4wall-bp2-v2']);
      v.egal('BP2 V2 : 160 et 185 W, sources', bp2.sources.pMaxW.autres.map(ids), [['roe-brochure-bp2-v2-2021-03'], ['roe-fiche-bp2-v2-2021-05']]);
      v.egal('BP2 V2 : P moyenne retenue (W)', bp2.pMoyW, 95);
      v.egal('BP2 V2 : autres P moyennes (W)', bp2.sources.pMoyW.autres.map((x) => x.valeur), [80, 92]);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('CB5 MKII : 13,6 kg, source', ids(cb5.sources.poidsKg), ['roe-page-produit-cb5-mkii']);
      v.egal('CB5 MKII : 12,2 kg, sources', cb5.sources.poidsKg.autres.map(ids), [['roe-fiche-cb5-mkii-2023-01', 'roe-brochure-cb5-mkii-2024-02']]);
      const pl25 = calculs.resoudreFiche(fiche(base, 'absen-pl2-5-pro-v10'), base.sources);
      v.egal('PL2.5 Pro V10 : 8,8 kg, source', ids(pl25.sources.poidsKg), ['ledwallcentral-pl-pro-v10']);
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
        'coex-mx40-pro', 'coex-mx20', 'coex-mx30', 'coex-cx40-pro',
        'colorlight-s6f', 'colorlight-x8e', 'colorlight-x16e', 'colorlight-vx20', 'colorlight-z6', 'colorlight-z8t',
      ]);
      v.egal('distributeurs', base.distributeurs.map((d) => d.id), ['brompton-xd', 'novastar-cvt10']);
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
      v.egal('nouvelles dalles', base.dalles.map((f) => f.id).filter((id) => !IDS_REFERENCE.includes(id)), [
        'unilumin-upad-iv-2-6', 'unilumin-upad-iv-2-6-pro', 'infiled-ar3-9', 'infiled-ez2-6-mk2', 'absen-m2-9', 'absen-jp5-pro',
      ]);
      const upad = calculs.resoudreFiche(fiche(base, 'unilumin-upad-iv-2-6'), base.sources);
      v.egal('Upad IV 2.6 : P max retenue 165 W, LEDwallcentral (8 scan)', [upad.pMaxW, ids(upad.sources.pMaxW)], [165, ['ledwallcentral-upad-iv-2-6']]);
      v.egal('Upad IV 2.6 : 120 W (4Wall Europe), 150 W (LMG)',
        upad.sources.pMaxW.autres.map((x) => [x.valeur, ids(x)]), [[120, ['4wall-europe-upad-iv-2-6']], [150, ['lmg-upad-iv-2-6']]]);
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
      v.egal('M2.9 : 9,99 kg retenus (calculateur 4Wall), 7,6 kg (page produit)',
        [m29.poidsKg, ids(m29.sources.poidsKg), m29.sources.poidsKg.autres.map((x) => [x.valeur, ids(x)])],
        [9.99, ['4wall-calculateur-absen-m2-9'], [[7.6, ['4wall-page-absen-m2-9']]]]);
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
      v.egal('CX40 Pro : cartes 5G', cx40.cartesCompatibles, ['CA50E', 'CA50C', 'XA50']);
      v.egal('MX20 : 3,9 M px, 6 ports, 4096 × 4096', [p('coex-mx20').pixelsMax, p('coex-mx20').ports, p('coex-mx20').largeurMaxPx, p('coex-mx20').hauteurMaxPx], [3900000, 6, 4096, 4096]);
      v.vrai('MX20 : débit « à confirmer »', /à confirmer/.test(p('coex-mx20').sources.debitUtileBps.source.confiance));
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
        ['dvi-single', 'dvi-dual', 'hdmi-1.2', 'hdmi-1.3', 'hdmi-1.4', 'hdmi-2.0', 'dp-1.2', '3g-sdi', '6g-sdi', '12g-sdi']);
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
    titre: 'M2 et S4 : 2 073 600 px (canvas natif 1920 × 1080), à confirmer',
    etape: '3b',
    verifier(v, contexte) {
      const base = baseProcesseurs(contexte);
      for (const id of ['brompton-m2', 'brompton-s4']) {
        const p = calculs.resoudreFiche(base.processeurs.find((x) => x.id === id), base.sources);
        v.egal(`${id} : pixels maxi`, p.pixelsMax, 2073600);
        v.vrai(`${id} : marqué à confirmer`, /à confirmer/.test(p.sources.pixelsMax.source.confiance));
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
      v.egal('réglés avec VMP (COEX)', avec('logiciel', 'VMP'), ['coex-mx40-pro', 'coex-mx20', 'coex-mx30', 'coex-cx40-pro']);
      v.egal('mapping interpolé : M2 et T1 seulement', base.processeurs.filter((p) => p.mappingInterpole?.valeur === true).map((p) => p.id), ['brompton-t1', 'brompton-m2']);
    },
  },
  {
    id: 'D21',
    titre: 'Chaînage power CB5 MKII : 7 dalles par ligne (ROE), à confirmer',
    etape: 4,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const cb5 = calculs.resoudreFiche(fiche(base, 'roe-cb5-mkii'), base.sources);
      v.egal('chaînage power maxi', cb5.chainagePowerMax, 7);
      v.vrai('source à confirmer', /à confirmer/.test(cb5.sources.chainagePowerMax.source.confiance));
    },
  },
  {
    id: 'D22',
    titre: 'Barres ROE Carbon : 4,44 kg (1 colonne), 8,95 kg (2 colonnes), ancien manuel, à confirmer pour la MKII',
    etape: 5,
    verifier(v, contexte) {
      const base = lireBase(contexte);
      const barres = (base.bumpers ?? []).map((b) => calculs.resoudreFiche(b, base.sources));
      v.egal('barres', barres.map((b) => [b.id, b.colonnes, b.poidsKg]), [
        ['roe-carbon-barre-1-colonne', 1, 4.44],
        ['roe-carbon-barre-2-colonnes', 2, 8.95],
      ]);
      v.vrai('source : ancien manuel Carbon, à confirmer pour la MKII', barres.every((b) => /à confirmer pour la MKII/.test(b.sources.poidsKg.source.confiance)));
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
  },
];
