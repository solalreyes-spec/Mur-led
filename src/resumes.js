// Résumés texte des onglets, pour « Copier les résultats » : texte simple, une information par ligne,
// sans tirets de liste ni tirets longs (le texte part chez des chefs de projet). Fonctions pures :
// elles mettent en forme les résultats de calculs.js, sans rien recalculer.

import { pitchCalculeMm, entierInferieur, LIBELLES_COIN } from './calculs.js';
import { nombre, nombreCourt, sourceCourte, mentionType } from './format.js';

// Une ligne propre : espaces simples, tirets longs remplacés par une virgule, pas de puce en début de ligne.
export function ligneSimple(texte) {
  return String(texte)
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/:\s*[—–]\s*$/, ': non disponible')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,•*-]+/, '')
    .trim();
}

const texte = (lignes) => lignes.filter((l) => l !== null && l !== undefined && l !== '').map(ligneSimple).filter(Boolean).join('\n');
const kg = (valeur) => `${nombreCourt(valeur, 2)} kg`;
const watts = (w) => `${nombreCourt(w, 1)} W`;
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
// Sources d'une valeur, avec « plafond constructeur » quand la fiche ne donne qu'un maximum (LEDECA).
const sourcesDe = (fiche, nom) => [(fiche?.sources?.[nom]?.sources ?? []).map(sourceCourte).join(', '), mentionType(fiche?.sources?.[nom])].filter(Boolean).join(', ');
const alertes = (liste) => (liste ?? []).map((a) => `Alerte : ${a}`);

function sourcesDimensions(...fiches) {
  const textes = new Set();
  for (const f of fiches.filter(Boolean)) {
    for (const nom of ['largeurMm', 'hauteurMm', 'pxH', 'pxV']) {
      for (const s of f.sources?.[nom]?.sources ?? []) textes.add(sourceCourte(s));
    }
  }
  return [...textes].join(', ');
}

// ---------------------------------------------------------------------------

export function resumeMur({ dalle, mur: m }) {
  const sources = sourcesDimensions(dalle, m.demi);
  return texte([
    'MUR',
    `Dalle : ${dalle.nom}`,
    `Dalles : ${m.colonnes} × ${m.lignes} = ${nombre(m.dalles.entieres)} (colonnes × lignes)`,
    m.rangeeDemi ? `Demi-dalles : ${m.dalles.demi} ${m.demi.nom}, rangée ${m.positionDemi === 'haut' ? 'en haut' : 'en bas'}` : null,
    m.rangeeDemi ? `Total : ${m.dalles.total} éléments` : null,
    `Taille : ${nombre(m.largeurMm / 1000, 2)} × ${nombre(m.hauteurMm / 1000, 2)} m`,
    `Résolution : ${nombre(m.pxLargeur)} × ${nombre(m.pxHauteur)} px`,
    `Pixels : ${nombre(m.pxTotal)} px`,
    `Surface : ${nombre(m.surfaceM2, 2)} m²`,
    `Diagonale : ${nombre(m.diagonaleM, 2)} m`,
    `Pitch : ${nombreCourt(pitchCalculeMm(dalle), 3)} mm`,
    sources ? `Dimensions et pixels : ${sources}` : null,
    dalle.gabarit ? 'Alerte : gabarit générique non sourcé, pour une estimation seulement' : null,
  ]);
}

// Latence chiffrée d'un processeur, en images, avec sa source : « 0 à 3 images (Fiche VX2000 Pro V1.4.0) » ;
// « au moins 1 image, maximum non publié (…) » quand la fiche ne donne qu'un minimum (« as low as »). Sinon null.
export function texteLatence(proc) {
  const min = proc.latenceMinImages;
  const max = proc.latenceMaxImages;
  if (min === undefined && max === undefined) return null;
  const images = (n) => `${nombre(n)} image${n > 1 ? 's' : ''}`;
  let texte;
  if (min !== undefined && max !== undefined) texte = min === max ? images(min) : `${nombre(min)} à ${images(max)}`;
  else if (min !== undefined) texte = `au moins ${images(min)}, maximum non publié`;
  else texte = `${images(max)} au plus`;
  const sources = [...new Set([sourcesDe(proc, 'latenceMinImages'), sourcesDe(proc, 'latenceMaxImages')].filter(Boolean))].join(', ');
  return `${texte}${sources ? ` (${sources})` : ''}`;
}

// Capacité de l'appareil : « min(4 ports × 650 000 = 2 600 000 px ; total de la fiche 2 300 000 px) = 2 300 000 px ».
export function texteCapaciteAppareil(c) {
  return `min(${pluriel(c.ports, 'port', 'ports')} × ${nombre(entierInferieur(c.capacitePort))} = ${nombre(entierInferieur(c.sommePorts))} px ; `
    + `total de la fiche ${nombre(c.pixelsMax)} px) = ${nombre(entierInferieur(c.valeur))} px`;
}

// `r` : évaluation du processeur retenu ; `distributeur` : nom du distributeur (XD, CVT10) s'il y en a.
// `configs` : lots et configs du mur pour le logiciel du processeur (fiches.configsDuMur), avec la version relevée.
export function resumeData(r, { conseille = false, distributeur = null, puissanceDistributeurW = null, origineBits = null, gainDixBits = null, configs = null } = {}) {
  const proc = r.processeur;
  if (!r.groupes?.length) {
    return texte(['DATA', `Processeur : ${proc.nom}`, `Impossible : ${r.impossible ?? 'ce processeur ne convient pas à ce mur'}`, ...alertes(r.alertes)]);
  }
  const reg = r.reglages;
  const g = r.global;
  const champCapacite = r.champCapacite ?? 'debitUtileBps';
  const sourceCapacite = sourcesDe(proc, champCapacite);
  const lignes = [
    'DATA',
    `Processeur : ${r.nombre} × ${proc.nom}${conseille ? ', conseillé' : ''}`,
    r.configuration ? `Configuration : ${r.configuration}` : null,
    `Réglages : ${nombreCourt(reg.frequenceHz)} Hz, ${reg.bits} bits réseau${reg.ull ? ', ULL' : ''}, `
      + `${reg.redondance ? 'avec redondance' : 'sans redondance'}${reg.modeOptique ? ', mode optique' : ''}`,
    origineBits ? `Profondeur réseau : ${reg.bits} bits, ${origineBits}` : null,
    gainDixBits ? `${gainDixBits.texte.charAt(0).toUpperCase()}${gainDixBits.texte.slice(1)}` : null,
    `Capacité par port : ${nombre(entierInferieur(r.capacite))} px`,
    r.formule ? `Calcul de la capacité : ${r.formule}` : null,
    sourceCapacite ? `Source de la capacité : ${sourceCapacite}` : null,
    r.capaciteAppareil ? `Capacité de l'appareil : ${texteCapaciteAppareil(r.capaciteAppareil)}` : null,
    `Pixels par dalle : ${nombre(r.pxParDalle)} px`,
    `Dalles par port : ${nombre(r.dallesParPort)}`,
  ];
  const alertesPorts = [];
  if (g) {
    lignes.push(`Ports en colonnes entières : ${nombre(g.colonnes.ports)}`);
    if (reg.redondance) lignes.push(`Ports avec la redondance : ${nombre(g.redondance.colonnes)} en colonnes entières`);
    lignes.push(`Minimum théorique : ${nombre(g.serpentin.ports)} ports au plus juste, serpentin depuis ${LIBELLES_COIN[g.serpentin.depart]}`
      + `${g.auPlusJusteRealisable ? '' : ', non réalisable tel quel dans NovaLCT'}`);
    if (g.minimum.raisons.length) lignes.push(`Écart : ${g.minimum.raisons.join(' ; ')}`);
    if (g.serpentin.ecart) lignes.push(`Décompte théorique au plus juste : ${nombre(g.auPlusJuste)} ports`);
    if (g.rectangles) lignes.push(`Ports en rectangles NovaLCT : ${nombre(g.rectangles.ports)}`);
    for (const [charge, cablage] of [[g.chargeMax.colonnes, 'en colonnes entières'], [g.serpentin.chargeMax, 'au plus juste']]) {
      if (charge.auDela95) alertesPorts.push(`Alerte : câblage ${cablage}, un port chargé à ${nombre(charge.taux * 100, 1)} %, au-delà de 95 %`);
    }
  }
  const conso = consommationProcesseur(proc);
  if (conso) lignes.push(conso);
  if (distributeur && r.totaux?.distributeurs) {
    const libres = r.totaux.distributeurs.portsNonUtilises;
    lignes.push(`${distributeur} : ${nombre(reg.redondance ? r.totaux.distributeurs.redondance : r.totaux.distributeurs.colonnes)}`
      + `${libres > 0 ? `, ${pluriel(libres, 'port non utilisé', 'ports non utilisés')}` : ''}`
      + `${puissanceDistributeurW ? `, ${nombreCourt(puissanceDistributeurW)} W chacun` : ''}`);
  }
  const latence = texteLatence(proc);
  if (latence) lignes.push(`Latence : ${latence}`);
  r.groupes.forEach((gr, i) => {
    const ports = reg.redondance ? gr.ports.redondance.colonnes : gr.ports.colonnes;
    lignes.push(`${proc.modele} n° ${i + 1} : colonnes ${gr.premiereColonne} à ${gr.derniereColonne}`
      + `${r.grille?.rangees > 1 ? `, rangées ${gr.premiereRangee} à ${gr.derniereRangee}` : ''}`
      + ` (${pluriel(gr.dalles, 'dalle', 'dalles')}, ${pluriel(ports, 'port', 'ports')})`);
  });
  if (configs) lignes.push(...configs.lignes, configs.version ?? null);
  lignes.push(...alertesPorts, ...alertes(r.alertes), ...(r.notes ?? []).map((x) => `Note : ${x}`), ...alertes(configs?.alertes));
  return texte(lignes);
}

// Consommation, poids et hauteur en rack d'un processeur, quand sa fiche les donne : « MX40 Pro : 95 W, 7,5 kg, 1U chacun ».
export function consommationProcesseur(proc) {
  const morceaux = [
    proc.puissanceW ? `${nombreCourt(proc.puissanceW)} W` : null,
    proc.poidsKg ? `${nombreCourt(proc.poidsKg, 2)} kg` : null,
    proc.hauteurU ? `${nombreCourt(proc.hauteurU)}U` : null,
  ].filter(Boolean);
  return morceaux.length ? `${proc.modele} : ${morceaux.join(', ')} chacun` : null;
}

// `r` : contrôle de la source ; `evaluation` : processeur retenu ; `rRegie` : contrôle de la régie choisie.
export function resumeCanvas(r, { evaluation, source, regie = null, rRegie = null }) {
  const proc = evaluation.processeur;
  const c = r.entree?.controle;
  const lignes = [
    'CANVAS ET SOURCE',
    `Source : ${source.largeurPx} × ${source.hauteurPx} px à ${nombreCourt(source.frequenceHz)} Hz en ${r.entree?.liaison?.nom ?? 'liaison non précisée'}`,
    c ? `Liaison : ${c.ok ? 'passe' : 'ne passe pas'}, ${nombre(c.taux * 100)} % du débit maxi (approximation)` : null,
    `Processeurs : ${evaluation.nombre} × ${proc.nom}`,
  ];
  for (const b of r.blocs) {
    lignes.push(`Processeur n° ${b.numero}, bloc : ${b.largeurPx} × ${b.hauteurPx} px`);
    if (b.canvas) lignes.push(`Processeur n° ${b.numero}, canvas : ${b.canvas.largeurPx} × ${b.canvas.hauteurPx}${b.canvas.format ? ` (${b.canvas.format})` : ''}`);
    lignes.push(`Processeur n° ${b.numero}, dans le mur : x ${b.x[0]} à ${b.x[1]}, y ${b.y[0]} à ${b.y[1]}`);
    lignes.push(`Processeur n° ${b.numero}, dans sa source : x ${b.xSource[0]} à ${b.xSource[1]}, y ${b.ySource[0]} à ${b.ySource[1]}`);
  }
  if (regie && rRegie) {
    if (rRegie.aCompleter?.length) {
      lignes.push(`Régie : ${regie.nom}, fiche à compléter, aucun contrôle`);
    } else {
      lignes.push(`Régie : ${regie.nom}`);
      lignes.push(`Sorties nécessaires : ${nombre(rRegie.sortiesNecessaires)}`);
      lignes.push(`Sorties disponibles : ${rRegie.sortiesDisponibles === null ? 'aucun mode ne convient' : nombre(rRegie.sortiesDisponibles)}`
        + `${rRegie.mode ? `, mode ${rRegie.mode.nom}` : ''}`);
      lignes.push(...(rRegie.refus ?? []).map((x) => `Refus : ${x}`), ...alertes(rRegie.alertes));
    }
  }
  lignes.push(...r.refus.map((x) => `Refus : ${x}`), ...alertes(r.alertes));
  return texte(lignes);
}

function textePMax(fiche, p, libelle) {
  if (!p) return null;
  let origine = sourcesDe(fiche, 'pMaxW');
  if (p.origine === 'surface') origine = 'estimée avec le repère de 1 kVA/m²';
  if (p.origine === 'gabarit') origine = 'estimée, gabarit non sourcé';
  return `P max retenue${libelle} : ${watts(p.valeurW)}${origine ? ` (${origine})` : ''}`;
}

export function resumeElec(r, { dalle, mur: m }) {
  const reg = r.reglages;
  const d = r.dallesParLigne;
  const lignes = [
    'ÉLECTRICITÉ : indicatif, à valider par l\'électricien',
    `Dalles : ${nombre(m.dalles.total)} ${dalle.nom}`,
    textePMax(dalle, r.pMax.dalle, ' par dalle'),
    textePMax(m.demi, r.pMax.demi, ' par demi-dalle'),
    `Puissance totale : ${nombreCourt(r.puissanceTotaleW / 1000, 2)} kW`,
    `Chaleur à évacuer : ${nombre(r.btuH)} BTU/h`,
    r.ligne.origine === 'champ'
      ? `Puissance utile par ligne : ${watts(r.ligne.utileW)}, saisie`
      : `Puissance utile par ligne : ${watts(r.ligne.utileW)} (${nombreCourt(reg.tensionV)} V × ${nombreCourt(reg.departA)} A × ${nombreCourt(reg.marge * 100)} %)`,
    `Dalles par ligne : ${nombre(d.retenu)}${d.limite === 'chaînage' ? ', limité par le chaînage du constructeur' : ''}`,
    `Lignes en colonnes entières : ${nombre(r.lignes.retenues)}`,
    `Minimum théorique : ${nombre(r.lignes.auPlusJuste.nombre)} lignes au plus juste, serpentin depuis ${LIBELLES_COIN[r.lignes.auPlusJuste.depart]}`,
    r.lignes.minimum.raisons.length ? `Écart : ${r.lignes.minimum.raisons.join(' ; ')}` : null,
    r.lignes.auPlusJuste.ecart ? `Décompte théorique au plus juste : ${nombre(r.lignes.auPlusJuste.theorique)} lignes` : null,
  ];
  const a = r.arrivee;
  if (r.monophase) {
    lignes.push(`Arrivée : mono ${nombreCourt(a.intensiteA)} A, ${watts(r.monophase.capaciteW)} utiles`);
    lignes.push(`Charge : ${watts(r.monophase.puissanceW)}, ${nombreCourt(r.monophase.intensiteA, 1)} A, ${r.monophase.ok ? 'passe' : 'ne passe pas'}`);
  } else if (r.triphase) {
    const conseil = r.triphase.colonnes.equilibre;
    lignes.push(`Arrivée : tri ${nombreCourt(a.intensiteA)} A, ${watts(a.capacitePhaseW)} utiles par phase`);
    lignes.push(`Répartition : en colonnes entières, équilibre des phases, ${pluriel(conseil.lignes.length, 'ligne', 'lignes')} `
      + `de ${conseil.lignes.map((l) => l.colonnes).join(' + ')} colonnes, écart entre phases ${nombreCourt(conseil.ecartPourcent, 0)} %`);
    for (const p of conseil.phases) {
      lignes.push(`Phase L${p.numero} : ${pluriel(p.lignes, 'ligne', 'lignes')}, ${watts(p.puissanceW)}, ${nombreCourt(p.intensiteA, 1)} A`
        + `${p.puissanceW > a.capacitePhaseW ? ', dépasse' : ''}`);
    }
    const minimum = r.triphase.colonnes.minimum;
    const tailles = (o) => o.lignes.map((l) => l.colonnes).join(' + ');
    if (tailles(minimum) !== tailles(conseil)) {
      lignes.push(`Au minimum de lignes : ${pluriel(minimum.lignes.length, 'ligne', 'lignes')} de ${tailles(minimum)} colonnes, `
        + `écart entre phases ${nombreCourt(minimum.ecartPourcent, 0)} %`);
    }
  }
  if (r.appel) {
    lignes.push(`Courant d'appel d'une ligne : ${nombreCourt(r.appel.picLigneA, 1)} A, seuil ${nombreCourt(r.appel.seuilA)} A en courbe ${r.appel.courbe}, `
      + `${r.appel.ok ? 'passe' : 'dépasse'}`);
  }
  lignes.push(...alertes(r.alertes));
  return texte(lignes);
}

export function resumePoids(r, { dalle, mur: m }) {
  const accroche = r.mode === 'accroche';
  const sourcePoids = sourcesDe(dalle, 'poidsKg');
  const lignes = [
    'POIDS : indicatif, à valider par le rigger',
    `Mode : ${accroche ? 'accroche' : 'stack (au sol)'}`,
    `${accroche ? 'Total suspendu' : 'Total'} : ${kg(r.suspenduKg)}`,
    `Poids d'une dalle : ${kg(r.poidsDalleKg)}${sourcePoids ? ` (${sourcePoids})` : ''}`,
    r.poidsDemiKg ? `Poids d'une demi-dalle : ${kg(r.poidsDemiKg)}` : null,
    `Poids des dalles : ${kg(r.dallesKg)} pour ${pluriel(m.dalles.total, 'élément', 'éléments')}`,
    `Câbles : ${kg(r.cablesKg)}`,
    accroche ? `Bumpers ou barres : ${kg(r.bumpersKg)}` : null,
    accroche ? `Autres charges suspendues : ${kg(r.autresKg)}` : null,
    `Par colonne : ${kg(r.colonnes[0].kg)}`,
    `Charge surfacique : ${nombreCourt(r.kgParM2, 1)} kg/m²`,
    `Par mètre linéaire : ${nombreCourt(r.kgParMetre, 1)} kg/m`,
  ];
  const mx = r.maximum;
  if (mx) {
    const unite = { dalles: 'dalles en hauteur', m: 'm de haut', kg: 'kg par colonne' }[mx.unite];
    lignes.push(`Maximum en ${mx.mode === 'stack' ? 'stack' : 'accroche'} : ${nombreCourt(mx.valeur, 2)} pour ${nombreCourt(mx.limite, 2)} ${unite}, `
      + `${mx.ok ? 'tenu' : 'dépassé'}${mx.conditions ? ` (${mx.conditions})` : ''}`);
  }
  const p = r.points;
  if (p?.points) {
    // Charges toutes égales : une seule ligne.
    if (p.points.length > 1 && p.points.every((pt) => pt.kg === p.points[0].kg)) {
      lignes.push(`Points d'accroche : ${p.points.length} × ${kg(p.points[0].kg)}`);
    } else {
      for (const pt of p.points) lignes.push(`Point n° ${pt.numero} : ${kg(pt.kg)}`);
    }
    if (p.cmuMoteurKg) lignes.push(`CMU du moteur : ${kg(p.cmuMoteurKg)}${p.configurationMoteur ? ` en ${p.configurationMoteur}` : ''}`);
  } else if (p) {
    lignes.push('Points d\'accroche : répartition à faire établir par le rigger');
  }
  lignes.push(...alertes(r.alertes), ...(r.rappels ?? []).map((x) => `Rappel : ${x}`));
  return texte(lignes);
}

// Câblage data et élec d'une variante chacun (celle conseillée par défaut) : une ligne par port ou par ligne,
// avec sa première et sa dernière dalle. L'élec est marquée indicative.
export function resumeCablage({ data = null, modeData = null, elec = null, modeElec = null }) {
  const lignes = ['CÂBLAGE'];
  const choisir = (t, mode) => t?.variantes.find((x) => x.mode === (mode ?? t.conseil)) ?? null;
  const vd = choisir(data, modeData);
  if (vd) {
    lignes.push(`Data : ${vd.libelle}, départ ${LIBELLES_COIN[data.depart]}`);
    if (vd.mention) lignes.push(`Mention : ${vd.mention}`);
    if (!vd.possible) lignes.push(`Impossible : ${vd.raison}`);
    if (vd.ecart) lignes.push(`Note : ${vd.ecart}`);
    lignes.push(`Ports : ${vd.ports}${vd.portsSecours ? `, plus ${vd.portsSecours} de secours` : ''}, charge maxi ${nombre(vd.chargeMax * 100, 1)} %`);
    lignes.push(`Câbles : ${vd.cablesTete} câbles de tête, ${vd.liaisons} liaisons entre dalles`);
    for (const p of vd.processeurs) {
      for (const port of p.ports) {
        lignes.push(`${p.modele} n° ${p.numero}, ${port.libelle} : ${pluriel(port.dalles.length, 'dalle', 'dalles')} `
          + `de ${port.dalles[0]} à ${port.dalles[port.dalles.length - 1]}, ${nombre(port.taux * 100, 1)} %`
          + `${port.secours ? `, secours ${port.secours.libelle}${port.secours.retourM ? `, retour ${nombreCourt(port.secours.retourM, 1)} m` : ''}` : ''}`
          + `${port.fibreM !== null ? `, fibre environ ${Math.ceil(port.fibreM)} m` : ''}`
          + `${port.longueurCuivreM !== null ? `, cuivre environ ${Math.ceil(port.longueurCuivreM)} m` : ''}`);
      }
    }
    lignes.push(...alertes(vd.alertes));
  }
  const ve = choisir(elec, modeElec);
  if (ve) {
    const mono = ve.phases.length === 1;
    lignes.push(`Élec : ${ve.libelle}, départ ${LIBELLES_COIN[elec.depart]} (indicatif, à valider par l'électricien)`);
    if (ve.mention) lignes.push(`Mention : ${ve.mention}`);
    if (ve.ecart) lignes.push(`Note : ${ve.ecart}`);
    lignes.push(`Lignes : ${ve.lignes}, charge maxi ${nombre(ve.chargeMax * 100, 1)} %`);
    lignes.push(`Câbles : ${ve.cablesTete} câbles de tête, ${ve.liaisons} liaisons entre dalles`);
    for (const l of ve.lignesDetail) {
      lignes.push(`Ligne ${l.numero}, phase ${mono ? 'mono' : `L${l.phase}`} : ${pluriel(l.dalles.length, 'dalle', 'dalles')} `
        + `de ${l.dalles[0]} à ${l.dalles[l.dalles.length - 1]}, ${watts(l.puissanceW)}`
        + `${l.longueurTeteM !== null ? `, câble de tête environ ${Math.ceil(l.longueurTeteM)} m` : ''}`);
    }
    if (!mono) for (const p of ve.phases) lignes.push(`Phase L${p.numero} : ${pluriel(p.lignes, 'ligne', 'lignes')}, ${watts(p.puissanceW)}, ${nombreCourt(p.intensiteA, 1)} A`);
    lignes.push(...alertes(ve.alertes));
  }
  return texte(lignes);
}

// Check-list « Avant de partir » (fiches.avantDePartir) : une ligne par point, OK, À faire ou À vérifier.
export function resumeAvantDePartir(liste) {
  if (!liste) return null;
  const etat = (fait) => (fait === true ? 'OK' : fait === false ? 'À faire' : 'À vérifier');
  return texte([`AVANT DE PARTIR, parc ${liste.nomParc}`, ...liste.lignes.map((l) => `${etat(l.fait)} : ${l.texte}`)]);
}

// « Tout copier » : les résumés disponibles, séparés par une ligne vide, sous un en-tête daté.
export function toutResumer(resumes, date = new Date()) {
  const jour = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  return [`Mur LED, calcul du ${jour}`, ...resumes.filter(Boolean)].join('\n\n');
}
