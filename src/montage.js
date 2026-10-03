// Guide de câblage pas à pas (option 1, port par port ; plan du 03/10/2026) : étapes du câblage affiché au Schéma,
// état du montage, rapprochement des cases cochées quand le câblage change. Fonctions pures, sans interface (l'écran
// est dans ecran-schema.js). Une case ne vaut que pour son câble : coin de départ, processeur, port et dalles dans
// l'ordre (`signature`) ; si l'un d'eux change, la case est décochée et le bandeau le dit, jamais en silence.

import { couleurPort, stylesLignes } from './couleurs.js';
import { nombre, nombreCourt } from './format.js';

const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// « Port 1 » devient « port 1 » dans une phrase ; « S8 n° 2, port 1 » reste tel quel.
const minuscule = (t) => (/^(Port|Ligne) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

// Étapes data : une par port de la variante affichée (calculs.cablageData), dans l'ordre du Schéma.
export function etapesData(variante, { depart = 'haut-gauche' } = {}) {
  if (!variante?.processeurs?.length) return [];
  const plusieurs = variante.processeurs.length > 1;
  let rang = 0;
  return variante.processeurs.flatMap((p) => p.ports.map((port) => {
    const couleur = couleurPort(rang);
    rang += 1;
    const premiere = port.dalles[0];
    const derniere = port.dalles[port.dalles.length - 1];
    const processeur = `${p.modele} n° ${p.numero}`;
    const secours = port.secours
      ? ` Retour de secours jusqu'au ${port.secours.libelle}${port.secours.retourM ? `, ${nombreCourt(port.secours.retourM, 1)} m` : ''}.`
      : '';
    return {
      cle: `p${p.numero}-${port.numero}`,
      type: 'data',
      titre: plusieurs ? `${processeur}, ${port.libelle}` : majuscule(port.libelle),
      numero: plusieurs ? `${p.numero}.${port.numero}` : `${port.numero}`,
      couleur,
      dalles: [...port.dalles],
      premiere,
      derniere,
      phrase: `${pluriel(port.dalles.length, 'dalle', 'dalles')}, de ${premiere} à ${derniere}. `
        + `Câble de tête du ${port.libelle} jusqu'à ${premiere}, puis suis les numéros.${secours}`,
      signature: `${depart}|${processeur}|${port.libelle}|${port.dalles.join(',')}`,
    };
  }));
}

// Étapes élec : une par ligne de la variante affichée (calculs.cablageElec), avec la couleur de sa phase et son motif.
export function etapesElec(variante, { depart = 'haut-gauche' } = {}) {
  if (!variante?.lignesDetail?.length) return [];
  const mono = variante.phases.length === 1;
  const styles = stylesLignes(variante.lignesDetail.map((l) => ({ numero: l.numero, phase: l.phase })), { mono });
  return variante.lignesDetail.map((l, i) => {
    const premiere = l.dalles[0];
    const derniere = l.dalles[l.dalles.length - 1];
    return {
      cle: `l${l.numero}`,
      type: 'elec',
      titre: mono ? `Ligne ${l.numero}` : `Ligne ${l.numero} · L${l.phase}`,
      numero: `${l.numero}`,
      couleur: styles[i],
      dalles: [...l.dalles],
      premiere,
      derniere,
      phrase: `${majuscule(styles[i].nom)}, ${styles[i].motif.nom}. ${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W, `
        + `de ${premiere} à ${derniere}. Câble de tête depuis l'armoire jusqu'à ${premiere}, puis suis les numéros.`,
      signature: `${depart}|${mono ? 'mono' : `L${l.phase}`}|ligne ${l.numero}|${l.dalles.join(',')}`,
    };
  });
}

// Cases cochées face aux étapes du câblage actuel. `progression` : { coches: [{ signature, cle, titre }], courant }.
// Renvoie les cases gardées, les cases perdues (câble changé), le bandeau à afficher et l'étape en cours : celle
// enregistrée si le câblage n'a pas changé, sinon la première non cochée, sinon la première.
export function rapprocherMontage(progression, etapes) {
  const signatures = new Set(etapes.map((e) => e.signature));
  const coches = (progression?.coches ?? []).filter((c) => signatures.has(c.signature));
  const perdues = (progression?.coches ?? []).filter((c) => !signatures.has(c.signature));
  const fait = new Set(coches.map((c) => c.signature));
  const courant = perdues.length === 0 && etapes.some((e) => e.cle === progression?.courant)
    ? progression.courant
    : (etapes.find((e) => !fait.has(e.signature)) ?? etapes[0])?.cle ?? null;
  return { coches, perdues, avis: texteChangement(perdues), courant };
}

// « Le câblage a changé : port 2 décoché (ses dalles ne sont plus les mêmes). »
export function texteChangement(perdues) {
  if (!perdues?.length) return null;
  const ligne = perdues.every((c) => c.cle?.startsWith('l'));
  const noms = perdues.map((c) => minuscule(c.titre));
  const plusieurs = noms.length > 1;
  // « ports 1 et 2 » quand les titres sont simples (« Port 1 », « Port 2 »), sinon la liste telle quelle.
  const simples = noms.every((n) => /^(port|ligne) [\d.]+( · L\d)?$/.test(n));
  const liste = plusieurs && simples
    ? `${ligne ? 'lignes' : 'ports'} ${noms.map((n) => n.replace(/^(port|ligne) /, '')).join(', ').replace(/, ([^,]*)$/, ' et $1')}`
    : noms.join(', ').replace(/, ([^,]*)$/, ' et $1');
  const accord = `${ligne ? 'e' : ''}${plusieurs ? 's' : ''}`;
  return `Le câblage a changé : ${liste} décoché${accord} (${plusieurs ? 'leurs' : 'ses'} dalles ne sont plus les mêmes).`;
}

// « 1 port sur 2 branché (port 1) », « 0 ligne sur 2 branchée », « 2 ports sur 2 branchés ».
export function texteEtatMontage(progression, etapes, type) {
  const fait = new Set((progression?.coches ?? []).map((c) => c.signature));
  const faites = etapes.filter((e) => fait.has(e.signature));
  const n = faites.length;
  const ligne = type === 'elec';
  const mot = ligne ? 'ligne' : 'port';
  const accord = `${ligne ? 'e' : ''}${n > 1 ? 's' : ''}`;
  const detail = n > 0 && n < etapes.length ? ` (${faites.map((e) => minuscule(e.titre)).join(', ')})` : '';
  return `${nombre(n)} ${mot}${n > 1 ? 's' : ''} sur ${nombre(etapes.length)} branché${accord}${detail}`;
}
