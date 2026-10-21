// Onglet Schéma : vue physique (mm) ou pixel map, câblage data ou élec en serpentin, variantes côte à côte.
// Tout est calculé par calculs.js (dallesDuMur, pixelMap, cablageData, cablageElec) : ici, seulement le dessin.

import {
  dallesDuMur, pixelMap, cablageData, cablageElec, distributionElec, tuilesImage, coinDepart, LIBELLES_COIN, MARGE_MOU_DEFAUT, ErreurSaisie, pliageSortie, pixelMapPliee,
  positionsDalles, texteCSV, texteOBJ,
} from './calculs.js';
import { resumeCablage } from './resumes.js';
import { nombre, nombreCourt, lireNombre } from './format.js';
import { el, svg, remplacer } from './dom.js';
import { barreCharge } from './look.js';
import {
  trajetsSchema, geometrieSchema, blocsSchema, construireSvg, repereSchema, PALETTE_ECRAN, PALETTE_EXPORT, tiretsMotif, cadrageGuide as calculerCadrageGuide,
  SEUIL_DESSIN_SIMPLIFIE, geometrieGuide, cadreComplet,
} from './dessin-schema.js';
import {
  pixelMapEnCanvas, canvasEnPng, schemaEnPng, verifierTailleSchema, telecharger, enregistrer, modeEnregistrement, fichierTexte,
} from './export.js';
import { etapesData, etapesElec, rapprocherMontage, texteEtatMontage } from './montage.js';
import { lire, ecrire } from './stockage.js';

const formulaire = document.getElementById('form-schema');
const zone = document.getElementById('resultats-schema');

let etatMur = null;
let etatData = null;
let etatElec = null;
let publierDeparts = () => {};
let departsPublies = { data: 'haut-gauche', elec: 'haut-gauche' };
// Mode du mur (onglet Poids) : en stack, les entrées data et les arrivées élec partent du bas.
let modeMur = 'accroche';
// Trajet mis en évidence (port ou ligne) et dalle choisie ; cadrage courant du dessin.
let selection = null;
let dalleChoisie = null;
let cadrage = null;
let cadrageComplet = null;
let cleDessin = null;
let dernier = null;
// Guide pas à pas : cases cochées (data et élec, enregistrées sur l'appareil), étapes du câblage affiché, guide
// ouvert (type et étape en cours) et son cadrage.
const videMontage = () => ({ coches: [], courant: null, avis: null });
let montage = { data: videMontage(), elec: videMontage() };
let etapesCourantes = { data: [], elec: [] };
let contexteGuide = null;
let guide = null;
let cadrageGuide = null;
let cadrageGuideComplet = null;
let verrouEcran = null;

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const pourcent = (taux) => `${nombre(taux * 100, 1)} %`;
function lireFormulaire() {
  const d = new FormData(formulaire);
  const facultatif = (nom) => {
    const n = lireNombre(d.get(nom));
    return Number.isFinite(n) ? n : null;
  };
  const mou = facultatif('margeMouPourcent');
  return {
    vue: d.get('vue'),
    cablage: d.get('cablage'),
    departData: coinDepart({ mode: modeMur, cote: d.get('coteData'), bord: d.get('bordData') }),
    departElec: coinDepart({ mode: modeMur, cote: d.get('coteElec'), bord: d.get('bordElec') }),
    distanceRegieM: facultatif('distanceRegieM'),
    // Distance armoire–mur : saisie dans la distribution d'Élec (étape 12b), un seul champ.
    distanceArmoireM: etatElec?.distribution?.distanceArmoireM ?? null,
    margeMou: mou === null ? MARGE_MOU_DEFAUT : mou / 100,
    canvasVue: d.get('canvasVue') || 'mur',
    varianteData: d.get('varianteData') || null,
    varianteElec: d.get('varianteElec') || null,
  };
}

// ---------------------------------------------------------------------------
// Calcul (délégué à calculs.js)
// ---------------------------------------------------------------------------

function calculer(e) {
  const resultat = { data: null, elec: null, erreurs: [] };
  if (etatData?.choisie?.groupes?.length) {
    try {
      resultat.data = cablageData(etatData.mur, etatData.dalle, etatData.choisie, {
        depart: e.departData, distanceRegieM: e.distanceRegieM, margeMou: e.margeMou,
        // Config imposée de Data (étape 18c) : variante « Ma config (imposée) », retenue quand elle passe.
        imposee: etatData.imposee ?? null, distributeurs: etatData.distributeurs ?? [],
      });
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      resultat.erreurs.push(erreur.message);
    }
  }
  if (etatElec) {
    try {
      resultat.elec = cablageElec(etatElec.mur, etatElec.dalle, etatElec.r,
        { depart: e.departElec, distanceArmoireM: e.distanceArmoireM, margeMou: e.margeMou, imposee: etatElec.imposee ?? null });
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      resultat.erreurs.push(erreur.message);
    }
  }
  return resultat;
}

// Variante choisie à la main, sinon la retenue (la config imposée quand elle passe, sinon le conseil) ; une config
// imposée refusée n'a pas de trajet et n'est jamais choisie.
const varianteChoisie = (t, mode) => (t ? t.variantes.find((x) => x.mode === mode && (x.mode !== 'imposee' || x.possible))
  ?? t.variantes.find((x) => x.mode === (t.retenue ?? t.conseil)) : null);

// Appelé quand l'utilisateur change sa config imposée dans Data ou Élec (étape 18c) : le Schéma revient à « Ma config ».
export function revenirAMaConfig(type) {
  const champ = formulaire.elements[type === 'elec' ? 'varianteElec' : 'varianteData'];
  if (!champ.value) return;
  champ.value = '';
  formulaire.dispatchEvent(new Event('change'));
}

// Distribution de la variante élec affichée (étape 12c) : réglages saisis dans Élec (distance, conseil ou matériel,
// montage), coin et mou du Schéma. Matériel mal saisi : pas de distribution ici, Élec affiche l'erreur.
function distributionDe(ve, elec, e) {
  const reglages = etatElec?.distribution;
  if (!ve || !elec || !reglages) return null;
  try {
    return distributionElec(etatElec.mur, ve, etatElec.r, {
      depart: elec.depart, distanceArmoireM: e.distanceArmoireM, margeMou: e.margeMou, mode: reglages.mode, choix: reglages.choix, materiel: reglages.materiel,
    });
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) throw erreur;
    return null;
  }
}
// Boîtiers à dessiner : nom et trajets (lignes) de chacun.
const boitiersDessin = (d) => (d?.boitiers.length ? d.boitiers.map((b) => ({ nom: b.nom, trajets: b.lignes.map((l) => `l${l.numero}`) })) : null);

// Dessin à l'écran : couleurs du thème, cadrage courant (zoom), gestes branchés.
function dessin(e, geo, trajets, coin, blocs, repere, boitiers = null) {
  const cle = `${e.vue}|${e.canvasVue}|${geo.largeur}x${geo.hauteur}`;
  const { svg: racine, complet } = construireSvg({
    geo, trajets, coin, blocs, palette: PALETTE_ECRAN, cadrage: cle === cleDessin ? cadrage : null, selection, dalleChoisie, repere,
    grand: grandAffichage(), boitiers,
  });
  if (cle !== cleDessin) {
    cadrage = { ...complet };
    cleDessin = cle;
  }
  cadrageComplet = complet;
  brancherGestes(racine);
  return racine;
}

// Zoom et déplacement : boutons, molette, un doigt pour déplacer, deux doigts pour zoomer. Un appui bref choisit.
// `vue` : le cadrage d'un dessin (Schéma ou guide pas à pas) : { lire, ecrire, complet, choisir }.
const vueSchema = {
  lire: () => cadrage,
  ecrire: (c) => { cadrage = c; },
  complet: () => cadrageComplet,
  choisir: (cible) => choisir(cible),
};
function appliquerCadrage(racine, vue = vueSchema) {
  const c = vue.lire();
  racine.setAttribute('viewBox', `${c.x} ${c.y} ${c.w} ${c.h}`);
}

function zoomer(racine, facteur, cx = null, cy = null, vue = vueSchema) {
  const c = vue.lire();
  const complet = vue.complet();
  const [px, py] = [cx ?? c.x + c.w / 2, cy ?? c.y + c.h / 2];
  const w = Math.min(complet.w, Math.max(complet.w / 40, c.w / facteur));
  const k = w / c.w;
  vue.ecrire({ x: px - (px - c.x) * k, y: py - (py - c.y) * k, w, h: c.h * k });
  appliquerCadrage(racine, vue);
}

function brancherGestes(racine, vue = vueSchema) {
  const pointeurs = new Map();
  let depart = null;
  let bouge = false;
  const versDessin = (clientX, clientY) => {
    const c = vue.lire();
    const r = racine.getBoundingClientRect();
    const echelle = Math.max(c.w / r.width, c.h / r.height);
    const decalX = (r.width * echelle - c.w) / 2;
    const decalY = (r.height * echelle - c.h) / 2;
    return [c.x - decalX + (clientX - r.left) * echelle, c.y - decalY + (clientY - r.top) * echelle, echelle];
  };
  racine.addEventListener('pointerdown', (ev) => {
    racine.setPointerCapture(ev.pointerId);
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointeurs.size === 1) {
      depart = { x: ev.clientX, y: ev.clientY, cible: ev.target };
      bouge = false;
    }
  });
  racine.addEventListener('pointermove', (ev) => {
    if (!pointeurs.has(ev.pointerId)) return;
    const avant = pointeurs.get(ev.pointerId);
    if (pointeurs.size === 1) {
      if (Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) > 6) bouge = true;
      if (bouge) {
        const [, , echelle] = versDessin(ev.clientX, ev.clientY);
        const c = vue.lire();
        vue.ecrire({ ...c, x: c.x - (ev.clientX - avant.x) * echelle, y: c.y - (ev.clientY - avant.y) * echelle });
        appliquerCadrage(racine, vue);
      }
    } else if (pointeurs.size === 2) {
      bouge = true;
      const [a, b] = [...pointeurs.values()];
      const autre = [...pointeurs.entries()].find(([idPointeur]) => idPointeur !== ev.pointerId)[1];
      const avantDistance = Math.hypot(a.x - b.x, a.y - b.y);
      const apresDistance = Math.hypot(ev.clientX - autre.x, ev.clientY - autre.y);
      if (avantDistance > 0 && apresDistance > 0) {
        const [cx, cy] = versDessin((ev.clientX + autre.x) / 2, (ev.clientY + autre.y) / 2);
        zoomer(racine, apresDistance / avantDistance, cx, cy, vue);
      }
    }
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  });
  const fin = (ev) => {
    if (!pointeurs.has(ev.pointerId)) return;
    pointeurs.delete(ev.pointerId);
    if (pointeurs.size === 0 && !bouge && depart) vue.choisir(depart.cible);
    if (pointeurs.size === 0) depart = null;
  };
  racine.addEventListener('pointerup', fin);
  racine.addEventListener('pointercancel', (ev) => pointeurs.delete(ev.pointerId));
  racine.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [cx, cy] = versDessin(ev.clientX, ev.clientY);
    zoomer(racine, ev.deltaY < 0 ? 1.2 : 1 / 1.2, cx, cy, vue);
  }, { passive: false });
}

// Appui sur un trajet : mise en évidence ; sur une dalle : sa fiche de position.
function choisir(cible) {
  const trajet = cible.closest?.('[data-trajet]');
  const tuile = cible.closest?.('[data-dalle]');
  if (trajet) selection = selection === trajet.dataset.trajet ? null : trajet.dataset.trajet;
  else if (tuile) dalleChoisie = dalleChoisie === tuile.dataset.dalle ? null : tuile.dataset.dalle;
  else {
    selection = null;
    dalleChoisie = null;
  }
  mettreAJour();
}

// ---------------------------------------------------------------------------
// Cartes des variantes, légende, fiche d'une dalle, canvas
// ---------------------------------------------------------------------------

function carteVariante(v, choisie, conseil, champ, lignes, charge = null) {
  const bouton = el('button', {
    type: 'button', class: `carte-variante${v.possible ? '' : ' impossible'}`, 'aria-pressed': String(v === choisie),
  },
  el('strong', {}, v.libelle.charAt(0).toUpperCase() + v.libelle.slice(1)),
  lignes.map((l) => el('span', {}, l)),
  charge === null ? null : barreCharge(charge),
  v.mention ? el('span', { class: 'mention' }, v.mention) : null,
  v.mode === 'imposee' ? el('span', { class: 'badge badge-info' }, 'imposée') : null,
  v.mode === conseil ? el('span', { class: 'badge badge-reussi' }, 'conseillé') : null,
  v.possible ? null : el('span', { class: 'badge badge-echec' }, 'impossible'));
  // Config imposée refusée : listée avec sa raison, sans trajet à montrer.
  if (v.mode === 'imposee' && !v.possible) {
    bouton.disabled = true;
    return bouton;
  }
  bouton.addEventListener('click', () => {
    formulaire.elements[champ].value = v.mode;
    selection = null;
    formulaire.dispatchEvent(new Event('change'));
  });
  return bouton;
}

function cartesData(t, vd) {
  return el('div', { class: 'cartes-variantes', role: 'group', 'aria-label': 'Variantes de câblage data' },
    t.variantes.map((v) => carteVariante(v, vd, t.conseil, 'varianteData', v.mode === 'imposee' && !v.possible ? [`refusée : ${v.raison}`] : [
      `${pluriel(v.ports, 'port', 'ports')}${v.portsSecours ? ` + ${v.portsSecours} de secours` : ''}`,
      `charge maxi ${pourcent(v.chargeMax)}`,
      `${pluriel(v.cablesTete, 'câble de tête', 'câbles de tête')}, ${pluriel(v.liaisons, 'liaison', 'liaisons')}`,
    ], v.possible ? v.chargeMax : null)));
}

function cartesElec(t, ve) {
  return el('div', { class: 'cartes-variantes', role: 'group', 'aria-label': 'Variantes de câblage élec' },
    t.variantes.map((v) => carteVariante(v, ve, t.conseil, 'varianteElec', v.mode === 'imposee' && !v.possible ? [`refusée : ${v.raison}`] : [
      pluriel(v.lignes, 'ligne', 'lignes'),
      `charge maxi ${pourcent(v.chargeMax)}`,
      v.phases.length > 1 ? v.phases.map((p) => `L${p.numero} ${nombreCourt(p.puissanceW)} W`).join(' · ') : `${nombreCourt(v.phases[0].puissanceW)} W`,
      v.ecartPhasesPourcent === null ? null : `écart entre phases ${nombreCourt(v.ecartPhasesPourcent, 0)} %`,
      `${pluriel(v.cablesTete, 'câble de tête', 'câbles de tête')}, ${pluriel(v.liaisons, 'liaison', 'liaisons')}`,
    ])));
}

const trait = (couleur, pointilles = false) => svg('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' },
  svg('line', { x1: 1, y1: 5, x2: 25, y2: 5, style: `stroke: ${couleur}`, 'stroke-width': 3, 'stroke-dasharray': pointilles ? '4 3' : null }));
// Échantillon du trait d'un port ou d'une ligne, pour sa puce : sa couleur, son motif, le liseré sous un trait noir.
const traitTrajet = (t) => svg('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' },
  t.couleur?.lisere ? svg('line', { x1: 2, y1: 5, x2: 24, y2: 5, style: `stroke: ${PALETTE_ECRAN.lisere}`, 'stroke-width': 6, 'stroke-linecap': 'round' }) : null,
  svg('line', {
    x1: 2, y1: 5, x2: 24, y2: 5, style: `stroke: ${t.couleur ? PALETTE_ECRAN.trace(t.couleur) : PALETTE_ECRAN.principal}`, 'stroke-width': 3,
    'stroke-linecap': 'round', 'stroke-dasharray': t.couleur ? tiretsMotif(t.couleur.motif, 3) : null,
  }));

function legende(trajets) {
  if (trajets.length === 0) return null;
  const groupes = [...new Set(trajets.map((t) => t.groupe))];
  // Titre de chaque groupe : « Ports du S8 », « Phase L1, marron », « Lignes, marron (monophasé) » ; la puce ne répète pas
  // « port 1 » à côté de son numéro.
  const titre = (g) => {
    if (trajets[0].cle.startsWith('p')) return `Ports du ${g}`;
    const nom = trajets.find((t) => t.groupe === g)?.couleur?.nom;
    if (!nom) return g;
    return g === 'Lignes' ? `Lignes, ${nom} (monophasé)` : `${g}, ${nom}`;
  };
  return el('div', { class: 'legende-trajets' },
    trajets.some((t) => t.secours) ? el('p', { class: 'legende-groupe' }, el('span', { class: 'legende-cle' }, trait(PALETTE_ECRAN.secours, true), 'retours de secours')) : null,
    groupes.flatMap((g) => [
    el('p', { class: 'legende-groupe' }, titre(g)),
    ...trajets.filter((t) => t.groupe === g).map((t) => {
      const puce = el('button', {
        type: 'button', class: 'puce-trajet', 'aria-pressed': String(selection === t.cle),
        'aria-label': t.libelle.charAt(0).toUpperCase() + t.libelle.slice(1),
      }, traitTrajet(t), el('span', { class: 'puce-numero' }, t.etiquette), t.libelleCourt ?? t.libelle);
      puce.addEventListener('click', () => {
        selection = selection === t.cle ? null : t.cle;
        mettreAJour();
      });
      return puce;
    }),
  ]));
}

// Texte de l'option « Automatique » : le bord que le mode du mur donne.
function libellesAuto() {
  const bord = modeMur === 'stack' ? 'en bas (mur posé)' : 'en haut (mur accroché)';
  for (const nom of ['bordData', 'bordElec']) {
    const option = formulaire.elements[nom].querySelector('option[value="auto"]');
    option.textContent = `Automatique : ${bord}`;
  }
}

function ficheDalle(id, pm, vd, ve) {
  const d = dallesDuMur(etatMur.mur, etatMur.dalle).find((x) => x.id === id);
  if (!d) return null;
  const canvas = pm?.canvas.find((c) => c.dalles.some((z) => z.id === id));
  const dansCanvas = canvas?.dalles.find((z) => z.id === id);
  const port = vd?.processeurs.flatMap((p) => p.ports.map((x) => ({ p, x }))).find(({ x }) => x.dalles.includes(id));
  const ligne = ve?.lignesDetail.find((l) => l.dalles.includes(id));
  return el('div', { class: 'alerte alerte-info info-dalle' },
    el('strong', {}, `${id} : ${d.type === 'demi' ? 'demi-dalle' : 'dalle'} ${d.fiche.nom}`),
    el('div', {}, `Position : x ${nombre(d.mm.x)} mm, y ${nombre(d.mm.y)} mm ; ${nombreCourt(d.mm.largeur)} × ${nombreCourt(d.mm.hauteur)} mm`),
    el('div', {}, `Pixels dans le mur : x ${d.px.x} à ${d.px.x + d.px.largeur - 1}, y ${d.px.y} à ${d.px.y + d.px.hauteur - 1}`),
    dansCanvas ? el('div', {}, `Canvas du processeur n° ${canvas.numero} : x ${dansCanvas.x[0]} à ${dansCanvas.x[1]}, y ${dansCanvas.y[0]} à ${dansCanvas.y[1]}`) : null,
    port ? el('div', {}, `Data : ${port.p.modele} n° ${port.p.numero}, ${port.x.libelle}, dalle ${port.x.dalles.indexOf(id) + 1} sur ${port.x.dalles.length}`
      + `${port.x.secours ? ` (secours ${port.x.secours.libelle})` : ''}`) : null,
    ligne ? el('div', {}, `Élec : ligne ${ligne.numero}${ve.phases.length > 1 ? `, phase L${ligne.phase}` : ''}, dalle ${ligne.dalles.indexOf(id) + 1} sur ${ligne.dalles.length}`) : null);
}

function tableCanvas(pm) {
  if (!pm?.canvas.length) return null;
  return el('section', { class: 'bloc-resultats' },
    el('h3', {}, 'Canvas par processeur'),
    el('div', { class: 'tableau-defilant' },
      el('table', { class: 'table-donnees' },
        el('thead', {}, el('tr', {}, el('th', {}, 'N°'), el('th', {}, 'Bloc (px)'), el('th', {}, 'Canvas'), el('th', {}, 'Dans le mur'), el('th', {}, 'Dans sa source'))),
        el('tbody', {}, pm.canvas.map((c) => el('tr', {},
          el('th', { scope: 'row' }, `n° ${c.numero}`),
          el('td', {}, `${c.bloc.largeurPx} × ${c.bloc.hauteurPx}`),
          el('td', {}, c.canvas ? `${c.canvas.largeurPx} × ${c.canvas.hauteurPx}` : '—', c.canvas?.format ? el('span', { class: 'source-ligne' }, c.canvas.format) : null),
          el('td', {}, `x ${c.xMur[0]} à ${c.xMur[1]}`, el('span', { class: 'source-ligne' }, `y ${c.yMur[0]} à ${c.yMur[1]}`)),
          el('td', {}, `x ${c.source.x[0]} à ${c.source.x[1]}`, el('span', { class: 'source-ligne' }, `y ${c.source.y[0]} à ${c.source.y[1]}`))))))),
    el('p', { class: 'source' }, 'Pixel (0,0) en haut à gauche ; coordonnées de 0 à largeur − 1.'));
}

// ---------------------------------------------------------------------------
// Mise à jour
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exports : pixel map en PNG (mur entier et canvas de chaque processeur, en tuiles au-delà de 16,7 M px),
// schéma de câblage en PNG. Les fichiers sont produits au moment de l'appui, un par un.
// ---------------------------------------------------------------------------

let contexteExport = null;
const etatExport = () => document.getElementById('etat-export');
const mpx = (l, h) => `${nombreCourt((l * h) / 1e6, 1)} M px`;

function optionsPixelMap() {
  const mire = document.getElementById('export-mire').checked;
  return { grille: mire, cercles: mire, diagonales: mire, numeros: document.getElementById('export-numeros').checked };
}

// Prépare l'image, puis l'enregistre : feuille de partage si l'appareil sait partager des fichiers (iPhone),
// téléchargement sinon. Le partage part d'un second appui : Safari ne l'ouvre que sur un appui direct.
// `genre` : image PNG (par défaut) ou fichier texte (CSV, OBJ, 9c3).
async function produire(nom, fabriquer, { type = 'image/png', mot = 'Image' } = {}) {
  const etat = etatExport();
  etat.textContent = `Préparation de ${nom}…`;
  let blob;
  try {
    blob = await fabriquer();
  } catch (erreur) {
    etat.textContent = `Export impossible : ${erreur.message}`;
    return;
  }
  const taille = `${nom} (${blob.size < 1e5 ? `${nombreCourt(blob.size / 1e3, 1)} ko` : `${nombreCourt(blob.size / 1e6, 1)} Mo`})`;
  const feminin = mot === 'Image';
  if (modeEnregistrement(navigator, [new File([blob], nom, { type })]) !== 'partage') {
    telecharger(blob, nom);
    etat.textContent = `${mot} téléchargé${feminin ? 'e' : ''} : ${taille}.`;
    return;
  }
  const partager = el('button', { type: 'button', class: 'bouton bouton-petit', 'data-icone': 'partager' }, 'Enregistrer ou partager');
  partager.addEventListener('click', async () => {
    const resultat = await enregistrer(blob, nom);
    const e = feminin ? 'e' : '';
    etat.textContent = { partage: `${mot} partagé${e} : ${taille}.`, annule: 'Partage annulé : appuie de nouveau sur l\'export pour recommencer.', telechargement: `${mot} téléchargé${e} : ${taille}.` }[resultat];
  });
  const secours = el('button', { type: 'button', class: 'bouton bouton-petit bouton-discret' }, 'Télécharger');
  secours.addEventListener('click', () => {
    telecharger(blob, nom);
    etat.textContent = `${mot} téléchargé${feminin ? 'e' : ''} : ${taille}.`;
  });
  remplacer(etat, el('span', {}, `${mot} prêt${feminin ? 'e' : ''} : ${taille}. `), el('span', { class: 'actions' }, partager, secours));
}

function boutonExport(texte, nom, fabriquer) {
  const bouton = el('button', { type: 'button', class: 'bouton bouton-petit', 'data-icone': 'partager' }, texte);
  bouton.addEventListener('click', () => produire(nom, fabriquer));
  return bouton;
}

// Une zone (mur ou canvas) : un bouton, ou un bouton par tuile au-delà de la limite de surface.
function elementZone(libelle, zone, prefixe) {
  const l = zone.canvas ? zone.canvas.largeurPx : zone.largeurPx;
  const h = zone.canvas ? zone.canvas.hauteurPx : zone.hauteurPx;
  const tuiles = tuilesImage(l, h);
  const nom = (suffixe) => `mur-led-pixel-map-${prefixe}${suffixe}.png`;
  return el('li', {},
    el('span', {}, `${libelle} : ${l} × ${h} px (${mpx(l, h)})${tuiles.length > 1 ? `, en ${tuiles.length} tuiles` : ''}`),
    el('span', { class: 'actions' }, tuiles.length === 1
      ? boutonExport('PNG', nom(`-${l}x${h}`), () => canvasEnPng(pixelMapEnCanvas(zone, optionsPixelMap())))
      : tuiles.map((t, i) => boutonExport(`Tuile ${i + 1}`, nom(`-tuile-${i + 1}-sur-${tuiles.length}-x${t.x}-y${t.y}-${t.largeurPx}x${t.hauteurPx}`),
        () => canvasEnPng(pixelMapEnCanvas(zone, optionsPixelMap(), t))))));
}

// Liste des positions par dalle (9c3) : CSV et modèle 3D OBJ, câblage data retenu, pixels du contenu.
function elementPositions({ mur, dalle, evaluation, vd, pliage }) {
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const positions = () => positionsDalles(mur, dalle, { evaluation, variante: vd, pliage });
  const bouton = (texte, nom, type, fabriquer) => {
    const b = el('button', { type: 'button', class: 'bouton bouton-petit', 'data-icone': 'partager', 'data-export': type.split('/')[1] }, texte);
    b.addEventListener('click', () => produire(nom, async () => fichierTexte(fabriquer(positions()), nom, type), { type, mot: 'Fichier' }));
    return b;
  };
  return el('li', { class: 'export-positions' },
    el('span', {}, `Positions des dalles, pour le serveur média ou la 3D : ${nombre(mur.dalles.total)} dalles`),
    el('span', { class: 'actions' },
      bouton('Positions (CSV)', `mur-led-positions-${jour}.csv`, 'text/csv', texteCSV),
      bouton('Modèle 3D (OBJ)', `mur-led-modele-3d-${jour}.obj`, 'model/obj', texteOBJ)),
    el('span', { class: 'note' }, 'Repère : X vers la droite, Y vers le haut, Z vers le public, en mm (OBJ en mètres) ; origine au coin bas gauche de la '
      + 'première zone. Lacet : la face tourne vers la droite ; tangage : elle penche vers le bas ; roulis : dans son plan. Pixels : la pixel map '
      + `du mur${pliage?.plie ? ' (sortie pliée : place des tranches dans Canvas)' : ''} ; processeur et port : le câblage data retenu.`));
}

function afficherExports(contexte) {
  contexteExport = contexte;
  const { pm } = contexte;
  remplacer(document.getElementById('liste-exports'),
    elementZone('Tout le mur', pm.mur, 'mur'),
    pm.canvas.map((c) => elementZone(`Processeur n° ${c.numero}`, c, `processeur-${c.numero}`)),
    elementPositions(contexte));
}

function exporterSchema() {
  if (!contexteExport) return;
  const { e, geo, trajets, coin, blocs, repere, data, vd, elec, ve, boitiers, distribution } = contexteExport;
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nom = `mur-led-schema-${e.cablage === 'aucun' ? 'mur' : e.cablage}-${jour}.png`;
  // Image trop grande : refus tout de suite, avant de construire le dessin (11-0).
  const cadre = cadreComplet(geo);
  try {
    verifierTailleSchema(2000, cadre.w, cadre.h, { titre: true });
  } catch (erreur) {
    produire(nom, async () => { throw erreur; });
    return;
  }
  const { svg: image } = construireSvg({ geo, trajets, coin, blocs, repere, palette: PALETTE_EXPORT, largeurPx: 2000, boitiers });
  const sujet = { data: vd ? `câblage data ${vd.libelle}, départ ${LIBELLES_COIN[data.depart]}` : null, elec: ve ? `câblage élec ${ve.libelle}, départ ${LIBELLES_COIN[elec.depart]}` : null }[e.cablage];
  const texte = e.cablage === 'data' && vd ? resumeCablage({ data, modeData: vd.mode })
    : e.cablage === 'elec' && ve ? resumeCablage({ elec, modeElec: ve.mode, distribution }) : '';
  produire(nom, () => schemaEnPng(image, {
    largeurPx: 2000,
    titre: `Mur LED${sujet ? `, ${sujet}` : ''}`,
    lignes: texte ? texte.split('\n').slice(1) : [],
  }));
}

// Câblage data retenu dans le Schéma (variante choisie), pour la mire de mapping : mêmes ports, mêmes numéros, mêmes
// couleurs que le dessin.
export function cablageRetenu() {
  assurerCalcul();
  if (!etatData?.mur || !dernier?.data) return null;
  const variante = dernier.data.variantes.find((x) => x.mode === dernier.modeData) ?? null;
  return variante ? { mur: etatData.mur, dalle: etatData.dalle, evaluation: etatData.choisie ?? null, variante, pliage: dernier.pliage ?? null } : null;
}

// Dessin d'un port data pour le pas à pas NovaLCT (étape 17b) : celui du guide de montage (dalles du port numérotées
// dans l'ordre du câble, autres trajets atténués), cadré sur le port au format 4:3, sans geste ni encart. `id` : étape
// « P1.B.7.2 » (processeur 1, port 2). Null si le Schéma n'a pas ce port.
// `autre` (étape 17c2, à blanc) : { mur, dalle, evaluation, variante, depart } d'un mur qui n'est pas celui du Schéma.
export function dessinPortNovaLCT(id, autre = null) {
  const m = /^P(\d+)\.B\.7\.(\d+)$/.exec(id ?? '');
  if (!m) return null;
  let contexte = contexteGuide;
  let etapes = etapesCourantes.data;
  if (autre) {
    contexte = { mur: autre.mur, dalle: autre.dalle, pm: pixelMap(autre.mur, autre.dalle, autre.evaluation), vd: autre.variante, departData: autre.depart };
    etapes = etapesData(autre.variante, { depart: autre.depart });
  } else {
    assurerCalcul();
    contexte = contexteGuide;
    etapes = etapesCourantes.data;
  }
  if (!contexte) return null;
  const etape = etapes.find((x) => x.cle === `p${m[1]}-${m[2]}`);
  if (!etape) return null;
  const { mur, dalle, pm, vd, departData } = contexte;
  const vue = { vue: 'physique', canvasVue: 'mur', cablage: 'data' };
  const geo = geometrieGuide(geometrieSchema(vue, mur, dalle, pm), etape.dalles);
  const trajets = trajetsSchema(vue, vd, null, null);
  const t = trajets.find((x) => x.cle === etape.cle);
  const calcul = calculerCadrageGuide(geo, etape.dalles, 4 / 3, { coin: departData, orientation: t?.orientation ?? 'colonnes', repere: null });
  const cadrage = calcul?.cadrage ?? null;
  // Dessin allégé (lot 17b4) : seulement les dalles du port et son câble, comme le guide d'un grand mur ; un mur entier
  // par port rendait l'écran lent sur iPhone (24 × 10 : 12 dessins, 17 000 éléments).
  const sesDalles = new Set(etape.dalles);
  const geoVue = { ...geo, rects: new Map([...geo.rects].filter(([id]) => sesDalles.has(id))), absentes: [] };
  const trajetsVue = trajets.filter((x) => x.cle === etape.cle);
  const { svg: image } = construireSvg({
    geo: geoVue, trajets: trajetsVue, coin: departData, blocs: [], palette: PALETTE_ECRAN, cadrage, selection: etape.cle, ordre: etape.cle,
    repere: null, grand: grandAffichage(),
  });
  // Contexte (lot 17b5) : le reste du mur en fond discret, d'un seul tracé, sous les dalles du port ; le nom de chaque
  // colonne voisine dans sa dalle du haut, pour situer le port dans le mur d'un coup d'œil.
  const autres = [...geo.rects].filter(([id, r]) => !sesDalles.has(id) && !r.rotation);
  if (autres.length) {
    const cote = Math.min(...[...geo.rects.values()].map((r) => Math.min(r.w, r.h)));
    const fond = svg('path', {
      class: 'nl-contexte', d: autres.map(([, r]) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`).join(''),
      style: `fill: ${PALETTE_ECRAN.dalleAlt}; fill-opacity: 0.35; stroke: ${PALETTE_ECRAN.bord}`, 'stroke-width': cote * 0.015,
    });
    const colonnesPort = new Set(etape.dalles.map((id) => id.split(' ')[0]));
    const hautDeColonne = new Map();
    for (const [id, r] of autres) {
      const colonne = id.split(' ')[0];
      if (colonnesPort.has(colonne) || !/^C\d+$/.test(colonne)) continue;
      if (!hautDeColonne.has(colonne) || r.y < hautDeColonne.get(colonne).y) hautDeColonne.set(colonne, r);
    }
    // Colonne entière dans le cadre : un nom coupé par le bord (« C1 » pour C10) tromperait.
    const dansCadre = (r) => !cadrage || (r.x >= cadrage.x && r.x + r.w <= cadrage.x + cadrage.w);
    const taille = cote * 0.22;
    const noms = [...hautDeColonne].filter(([, r]) => dansCadre(r)).map(([colonne, r]) => svg('text', {
      class: 'nl-colonne', x: r.x + r.w / 2, y: r.y + cote * 0.08 + taille, 'font-size': taille, 'text-anchor': 'middle',
      'font-weight': 700, style: `fill: ${PALETTE_ECRAN.texte}`,
    }, colonne));
    const premiere = image.querySelector('[data-dalle]');
    const parent = premiere?.parentNode ?? image;
    parent.insertBefore(svg('g', { class: 'nl-contexte-groupe', 'aria-hidden': 'true' }, fond, ...noms), premiere ?? null);
  }
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', `${etape.titre} : ${etape.phrase}`);
  return image;
}

// Entrées de la liste de matériel (étape 13b) : le mur, le câblage data et élec retenus dans le Schéma (variantes
// choisies), la distribution d'Élec sur la variante élec retenue, la distance régie–mur et le mou.
export function entreesMateriel() {
  assurerCalcul();
  if (!etatMur?.mur || !dernier) return null;
  const e = lireFormulaire();
  const vd = dernier.data?.variantes.find((x) => x.mode === dernier.modeData) ?? null;
  const ve = dernier.elec?.variantes.find((x) => x.mode === dernier.modeElec) ?? null;
  const reglagesElec = etatElec?.distribution;
  const prises = reglagesElec?.choix === 'materiel' ? Number(reglagesElec.materiel?.prisesParBoitier) : NaN;
  return {
    mur: etatMur.mur,
    dalle: etatMur.dalle,
    data: etatData?.choisie ? { evaluation: etatData.choisie, variante: vd, distanceRegieM: e.distanceRegieM, margeMou: e.margeMou } : null,
    elec: ve ? {
      variante: ve, distribution: dernier.distribution ?? null, departA: etatElec?.r?.reglages?.departA ?? null,
      prisesParBoitier: Number.isFinite(prises) && prises > 0 ? prises : null,
    } : null,
  };
}

export function resumeOngletSchema() {
  assurerCalcul();
  if (!dernier) return null;
  const etat = (type) => (etapesCourantes[type].length ? texteEtatMontage(montage[type], etapesCourantes[type], type) : null);
  return resumeCablage({ ...dernier, montage: { data: etat('data'), elec: etat('elec') } });
}

// Grand mur (11-0) : chaque demande (mur, Data, Élec, réglage, sortie pliée…) est regroupée avec les autres de la même
// saisie ; le Schéma ne se calcule et ne se dessine qu'une fois, et seulement si son onglet ou le guide est affiché.
// Sinon il est marqué « à refaire » : dessiné à l'ouverture de l'onglet, calculé sans dessin pour le texte copié et
// la mire. Le coin de départ, lui, est publié tout de suite (Data et Élec en dépendent).
let calculARefaire = true;
let dessinARefaire = true;
let miseAJourPrevue = false;
const schemaAffiche = () => location.hash === '#schema' || Boolean(guide);
function mettreAJour() {
  calculARefaire = true;
  dessinARefaire = true;
  if (miseAJourPrevue) return;
  miseAJourPrevue = true;
  queueMicrotask(() => {
    try {
      publierDepartsSiChanges(lireFormulaire());
      if (schemaAffiche()) mettreAJourMaintenant();
    } finally {
      miseAJourPrevue = false;
    }
  });
}
function assurerCalcul() {
  if (calculARefaire) mettreAJourMaintenant({ dessiner: false });
}
window.addEventListener('hashchange', () => {
  if (schemaAffiche() && dessinARefaire) mettreAJourMaintenant();
});

// Coins de départ et marge de mou : Data et Élec en dépendent (serpentin au plus juste, câbles de la distribution).
function publierDepartsSiChanges(e) {
  if (e.departData !== departsPublies.data || e.departElec !== departsPublies.elec || e.margeMou !== departsPublies.margeMou) {
    departsPublies = { data: e.departData, elec: e.departElec, margeMou: e.margeMou };
    publierDeparts({ data: e.departData, elec: e.departElec, margeMou: e.margeMou });
  }
}

function mettreAJourMaintenant({ dessiner = true } = {}) {
  calculARefaire = false;
  if (dessiner) dessinARefaire = false;
  dernier = null;
  const e = lireFormulaire();
  // Le coin de départ décide aussi du serpentin au plus juste des onglets Data et Élec.
  publierDepartsSiChanges(e);
  if (!etatMur?.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return;
  }
  const { mur, dalle } = etatMur;
  const { data, elec, erreurs } = calculer(e);
  const vd = varianteChoisie(data, e.varianteData);
  const ve = varianteChoisie(elec, e.varianteElec);
  const distribution = distributionDe(ve, elec, e);
  dernier = { data, modeData: vd?.mode ?? null, elec, modeElec: ve?.mode ?? null, distribution };

  const evaluation = etatData?.mur === mur ? etatData.choisie : null;
  const pliage = formatSortie && evaluation?.groupes?.length ? pliageSortie(mur, dalle, evaluation, formatSortie, { depart: e.departData }) : null;
  dernier.pliage = pliage;
  const pm = pixelMapPliee(pixelMap(mur, dalle, evaluation), mur, pliage);
  // Choix du canvas dans la vue pixels : tout le mur, ou le canvas d'un processeur.
  const blocCanvas = document.getElementById('bloc-canvas-vue');
  blocCanvas.hidden = e.vue !== 'pixels' || pm.canvas.length === 0;
  const select = formulaire.elements.canvasVue;
  const options = ['mur', ...pm.canvas.map((c) => `p${c.numero}`)];
  // Libellés compris : la taille change avec la sortie pliée (9b7).
  const libelles = ['Tout le mur', ...pm.canvas.map((c) => `Processeur n° ${c.numero} : ${c.canvas?.largeurPx ?? c.bloc.largeurPx} × ${c.canvas?.hauteurPx ?? c.bloc.hauteurPx} px`
    + `${c.plie ? ', sortie pliée' : ''}`)];
  if ([...select.options].map((o) => o.textContent).join('|') !== libelles.join('|')) {
    const avant = select.value;
    remplacer(select, options.map((v, i) => el('option', { value: v }, libelles[i])));
    if (options.includes(avant)) select.value = avant;
  }
  if (!options.includes(e.canvasVue)) select.value = 'mur';
  const vueCanvas = e.vue === 'pixels' && select.value !== 'mur' ? Number(select.value.slice(1)) : null;
  const eVue = { ...e, canvasVue: select.value };

  const geo = geometrieSchema(eVue, mur, dalle, pm);
  const trajets = trajetsSchema(e, vd, ve, vueCanvas);
  const coin = e.cablage === 'elec' ? e.departElec : e.departData;
  const blocs = blocsSchema(geo, pm, { vueCanvas, cablage: e.cablage });
  // Repère du processeur ou de l'armoire au coin de départ, sur la vue de tout le mur.
  const repere = vueCanvas ? null : repereSchema(e.cablage, {
    evaluation: etatData?.choisie ?? null,
    distanceM: e.cablage === 'elec' ? e.distanceArmoireM : e.distanceRegieM,
    // Config imposée en fibre (étape 18c) : le convertisseur au pied du mur.
    fibre: vd?.mode === 'imposee' ? vd.fibre : null,
  });
  // Boîtiers de la distribution, sur la vue de tout le mur en câblage élec.
  const boitiers = e.cablage === 'elec' && !vueCanvas ? boitiersDessin(distribution) : null;
  afficherExports({ pm, e, geo, trajets, coin, blocs, repere, data, vd, elec, ve, mur, dalle, evaluation, pliage, boitiers, distribution });
  // Guide pas à pas : étapes du câblage affiché (data et élec), pour le bouton, le bandeau et le texte copié.
  etapesCourantes = {
    data: etapesData(vd, { depart: data?.depart ?? e.departData }),
    elec: etapesElec(ve, { depart: elec?.depart ?? e.departElec, distribution }),
  };
  contexteGuide = { mur, dalle, pm, vd, ve, departData: data?.depart ?? e.departData, departElec: elec?.depart ?? e.departElec, boitiers: boitiersDessin(distribution) };
  if (!dessiner) return;
  const simplifie = geo.rects.size > SEUIL_DESSIN_SIMPLIFIE;

  const alertes = [...erreurs.map((x) => alerte(x, 'alerte-erreur'))];
  if (pm.canvas.some((c) => c.plie)) {
    alertes.push(alerte(`Entrée du processeur : sortie pliée dans ${pliage.format.largeurPx} × ${pliage.format.hauteurPx} (onglet Canvas). `
      + 'La vue pixels d\'un processeur, son export et sa mire montrent les tranches à leur place dans la sortie ; la vue physique et le câblage ne changent pas. '
      + pliage.blocs.filter((b) => !b.tel && b.ok).map((b) => `Processeur n° ${b.numero} : ${b.tranches.map((t) => `${t.nom} en x ${t.sortie.x}, y ${t.sortie.y}`).join(' ; ')}.`).join(' '),
    'alerte-info'));
  }
  // Ligne de rappel au-dessus du dessin ; cartes des variantes sous la légende (le dessin d'abord, audit terrain).
  let entete = null;
  let variantes = null;
  if (e.cablage === 'data') {
    if (!data) {
      alertes.push(alerte('Aucun processeur retenu : choisis-en un qui convient dans l\'onglet Data.', 'alerte-info'));
    } else {
      entete = el('p', { class: 'recap-mur' }, `Data : ${vd.processeurs.length} × ${etatData.choisie.processeur.nom}, départ ${LIBELLES_COIN[data.depart]}. `,
        el('a', { href: '#data' }, 'Modifier'));
      variantes = cartesData(data, vd);
      if (!vd.possible) alertes.push(alerte(vd.raison, 'alerte-erreur'));
      if (vd.ecart) alertes.push(alerte(vd.ecart, 'alerte-info'));
      if (vd.noteSecours) alertes.push(alerte(vd.noteSecours, 'alerte-info'));
      if (vd.mode === 'auPlusJuste' && etatData.choisie.global?.serpentin?.ecart) alertes.push(alerte(etatData.choisie.global.serpentin.ecart, 'alerte-info'));
      alertes.push(...vd.alertes.map((x) => alerte(x)));
    }
  } else if (e.cablage === 'elec') {
    if (!elec) {
      alertes.push(alerte('Pas de calcul électrique valide : vérifie l\'onglet Élec.', 'alerte-info'));
    } else {
      entete = el('p', { class: 'recap-mur' }, `Élec : départ ${LIBELLES_COIN[elec.depart]}. Résultats indicatifs, à valider par l'électricien. `,
        el('a', { href: '#elec' }, 'Modifier'));
      variantes = cartesElec(elec, ve);
      if (ve.ecart) alertes.push(alerte(ve.ecart, 'alerte-info'));
      if (ve.mode === 'auPlusJuste' && etatElec.r.lignes.auPlusJuste.ecart) alertes.push(alerte(etatElec.r.lignes.auPlusJuste.ecart, 'alerte-info'));
      alertes.push(...ve.alertes.map((x) => alerte(x)));
    }
  }

  if (simplifie) {
    alertes.push(alerte(`Mur de ${nombreCourt(mur.dalles.total)} dalles : dessin simplifié au-delà de ${nombreCourt(SEUIL_DESSIN_SIMPLIFIE)} dalles, `
      + 'un rectangle par segment de port.', 'alerte-info'));
  }
  const racine = dessin(eVue, geo, trajets, coin, blocs, repere, boitiers);
  const typeGuide = e.cablage === 'aucun' ? null : e.cablage;
  const etapesGuide = typeGuide ? etapesCourantes[typeGuide] : [];
  const rapprochement = typeGuide ? rapprocherMontage(montage[typeGuide], etapesGuide) : null;
  const avisMontage = rapprochement ? (rapprochement.avis ?? montage[typeGuide].avis) : null;
  if (avisMontage) alertes.unshift(alerte(avisMontage, 'alerte-montage'));
  const boutonMontage = el('button', {
    type: 'button', id: 'bouton-montage', class: 'bouton bouton-principal bouton-montage', disabled: etapesGuide.length ? null : '',
  }, el('span', { class: 'montage-libelle' }, 'Montage pas à pas'),
  etapesGuide.length ? el('span', { class: 'montage-etat' }, texteEtatMontage(montage[typeGuide], etapesGuide, typeGuide)) : null);
  boutonMontage.addEventListener('click', () => ouvrirGuide(typeGuide));
  // « Montage pas à pas » sur sa ligne ; zoom en trois icônes dans le coin du dessin (étape 11d, choix de l'utilisateur :
  // le dessin reste dans le premier écran).
  const outils = el('div', { class: 'schema-outils' }, boutonMontage);
  const zoom = el('div', { class: 'schema-zoom' },
    ['+', '−', 'Tout voir'].map((texte) => {
      const b = el('button', {
        type: 'button', class: 'bouton bouton-petit bouton-icone', 'aria-label': { '+': 'Zoomer', '−': 'Dézoomer', 'Tout voir': 'Voir tout le mur' }[texte],
        'data-icone': texte === 'Tout voir' ? 'cadrer' : null,
      }, texte === 'Tout voir' ? null : texte);
      b.addEventListener('click', () => {
        if (texte === 'Tout voir') {
          cadrage = { ...cadrageComplet };
          appliquerCadrage(racine);
        } else zoomer(racine, texte === '+' ? 1.5 : 1 / 1.5);
      });
      return b;
    }));

  remplacer(zone,
    entete,
    alertes,
    el('div', { class: 'schema-cadre' }, outils, el('div', { class: 'schema-dessin' }, racine, zoom)),
    el('p', { class: 'source' }, `${geo.unite === 'mm' ? 'Vue physique à l\'échelle, en millimètres' : 'Vue en pixels, pixel (0,0) en haut à gauche'}. `
      + `${simplifie ? 'Appuie' : 'Appuie sur une dalle pour sa position,'} sur un trajet pour le mettre en évidence ; deux doigts pour zoomer.`),
    dalleChoisie ? ficheDalle(dalleChoisie, pm, e.cablage === 'data' ? vd : null, e.cablage === 'elec' ? ve : null) : null,
    legende(trajets),
    variantes ? el('h3', { class: 'titre-variantes' }, 'Variantes de câblage') : null,
    variantes,
    e.vue === 'pixels' ? tableCanvas(pm) : null);
  // Guide ouvert : il suit le câblage recalculé.
  if (guide) afficherGuide();
}

// ---------------------------------------------------------------------------

// `surDepart({ data, elec })` : le coin de départ a changé ; les onglets Data et Élec recalculent leur serpentin.
// ---------------------------------------------------------------------------
// Guide de câblage pas à pas (option 1, port par port ; plan du 03/10/2026) : un port ou une ligne à la fois, dalles
// numérotées dans l'ordre du câble, case « branché » enregistrée tout de suite, pas de passage automatique au port
// suivant ; écran gardé allumé quand le navigateur le permet (sans message sinon).
// ---------------------------------------------------------------------------

const CLE_MONTAGE = 'montage';
// Où le suivi est gardé : la clé « montage » par défaut ; avec les prestas (étape 10b), le mur ouvert.
let stockageMontage = { lire: () => lire(CLE_MONTAGE), ecrire: (valeur) => ecrire(CLE_MONTAGE, valeur) };
export function definirStockageMontage(stockage) {
  stockageMontage = stockage;
}
const $m = (id) => document.getElementById(id);
const MOTS_GUIDE = {
  data: { suivant: 'Port suivant ▶', tous: 'Tous les ports', branche: 'branché', autre: 'Passer à l\'élec' },
  elec: { suivant: 'Ligne suivante ▶', tous: 'Toutes les lignes', branche: 'branchée', autre: 'Passer à la data' },
};
const vueGuide = {
  lire: () => cadrageGuide,
  ecrire: (c) => { cadrageGuide = c; },
  complet: () => cadrageGuideComplet,
  choisir: () => {},
};

function enregistrerMontage() {
  Promise.resolve(stockageMontage.ecrire({ version: 1, data: montage.data, elec: montage.elec })).catch(() => {});
}

async function garderEcranAllume() {
  try {
    verrouEcran = (await navigator.wakeLock?.request?.('screen')) ?? null;
  } catch (erreur) {
    verrouEcran = null;
  }
}

function relacherEcran() {
  try {
    verrouEcran?.release?.();
  } catch (erreur) {
    // Rien à faire : le navigateur a déjà relâché l'écran.
  }
  verrouEcran = null;
}

const etapeEnCours = () => etapesCourantes[guide.type].find((x) => x.cle === guide.cle) ?? etapesCourantes[guide.type][0];

// Ouvre le guide du câblage affiché : les cases dont le câble a changé sont retirées, le bandeau le dit.
function ouvrirGuide(type) {
  assurerCalcul();
  const etapes = type ? etapesCourantes[type] : [];
  if (!etapes.length) return;
  const r = rapprocherMontage(montage[type], etapes);
  montage[type] = { coches: r.coches, courant: r.courant, avis: r.avis ?? montage[type].avis ?? null };
  enregistrerMontage();
  guide = { type, cle: montage[type].courant ?? etapes[0].cle, cleDessinee: null };
  $m('montage').hidden = false;
  $m('montage-tous').hidden = true;
  $m('montage-fin').hidden = true;
  document.body.classList.add('montage-ouvert');
  garderEcranAllume();
  afficherGuide({ recentrer: true });
}

function fermerGuide() {
  if (!guide) return;
  guide = null;
  $m('montage').hidden = true;
  document.body.classList.remove('montage-ouvert');
  relacherEcran();
  mettreAJour();
}

function afficherGuide({ recentrer = false } = {}) {
  if (!guide) return;
  const { type } = guide;
  const etapes = etapesCourantes[type];
  if (!etapes.length) {
    fermerGuide();
    return;
  }
  let i = etapes.findIndex((x) => x.cle === guide.cle);
  if (i < 0) {
    i = 0;
    guide.cle = etapes[0].cle;
  }
  const etape = etapes[i];
  const p = montage[type];
  const mots = MOTS_GUIDE[type];
  const processeurs = contexteGuide?.vd?.processeurs ?? [];
  const nomProcesseurs = processeurs.length ? `${processeurs.length > 1 ? `${processeurs.length} × ` : ''}${processeurs[0].modele}` : '';
  $m('montage-sur-titre').textContent = type === 'data' ? `Montage data · ${nomProcesseurs}` : 'Montage élec · Armoire';
  $m('montage-titre').textContent = etape.titre;
  $m('montage-rang').textContent = `sur ${etapes.length}`;
  const pastille = $m('montage-pastille');
  pastille.style.background = `var(--${etape.couleur.cle})`;
  pastille.style.boxShadow = etape.couleur.lisere ? '0 0 0 2px var(--phase-lisere)' : 'none';
  $m('montage-phrase').textContent = etape.phrase;
  $m('montage-avis').hidden = !p.avis;
  $m('montage-avis-texte').textContent = p.avis ?? '';
  $m('montage-coche').checked = p.coches.some((c) => c.signature === etape.signature);
  $m('montage-coche-texte').textContent = `${etape.titre} ${mots.branche}`;
  $m('montage-precedent').disabled = i === 0;
  $m('montage-suivant').textContent = i === etapes.length - 1 ? 'Terminer' : mots.suivant;
  $m('montage-liste').textContent = mots.tous;
  $m('montage-tous-titre').textContent = mots.tous;
  dessinerGuide(etape, { recentrer: recentrer || guide.cleDessinee !== etape.cle });
}

// Dessin du guide : tout le mur en vue physique, le trajet en cours en couleur et numéroté dalle par dalle, les autres
// atténués ; cadrage sur ses dalles au format du cadre (« Recentrer » y revient), zoom à deux doigts possible.
function dessinerGuide(etape, { recentrer }) {
  const { type } = guide;
  const { mur, dalle, pm, vd, ve, departData, departElec } = contexteGuide;
  const vue = { vue: 'physique', canvasVue: 'mur', cablage: type };
  const geo = geometrieGuide(geometrieSchema(vue, mur, dalle, pm), etape.dalles);
  const trajets = trajetsSchema(vue, vd, ve, null);
  const coin = type === 'elec' ? departElec : departData;
  const cadre = $m('montage-dessin');
  const { width, height } = cadre.getBoundingClientRect();
  const t = trajets.find((x) => x.cle === etape.cle);
  const repere = repereSchema(type, { evaluation: etatData?.choisie ?? null, distanceM: null });
  if (recentrer || !cadrageGuide) {
    const calcul = calculerCadrageGuide(geo, etape.dalles, width > 0 && height > 0 ? width / height : 0.75,
      { coin, orientation: t?.orientation ?? 'colonnes', repere });
    cadrageGuide = calcul?.cadrage ?? null;
    guide.encart = calcul?.encart ?? null;
    guide.voirDepart = false;
    guide.cleDessinee = etape.cle;
  }
  afficherEncart(etape);
  const { svg: racine, complet } = construireSvg({
    geo, trajets, coin, blocs: [], palette: PALETTE_ECRAN, cadrage: cadrageGuide, selection: etape.cle, ordre: etape.cle, repere,
    grand: grandAffichage(), boitiers: type === 'elec' ? contexteGuide.boitiers : null,
  });
  cadrageGuideComplet = complet;
  racine.style.aspectRatio = 'auto';
  brancherGestes(racine, vueGuide);
  cadre.querySelector('svg')?.remove();
  cadre.append(racine);
}

// Encart du départ : port loin de son processeur (zoom serré sur ses dalles). « ← MCTRL660, port 4 », numéro dans la
// couleur du port ; un appui montre le départ dans le dessin, « Recentrer » revient au port.
function afficherEncart(etape) {
  const encart = $m('montage-encart');
  const e = guide.encart;
  const affiche = Boolean(e) && !guide.voirDepart;
  encart.hidden = !affiche;
  if (!affiche) return;
  encart.className = `bouton montage-encart coin-${e.coin.y} coin-${e.coin.x}`;
  const mot = guide.type === 'data' ? 'port' : 'ligne';
  // Ligne qui part d'un boîtier de la distribution : « ← Boîtier 1, ligne 4 » (étape 12c).
  const nomRepere = etape.boitier ? `Boîtier ${etape.boitier}` : e.repere ?? (guide.type === 'data' ? 'Processeur' : 'Armoire');
  // Un seul bloc en ligne : pas d'espace du bouton avant la virgule.
  remplacer(encart, el('span', { class: 'montage-encart-texte' },
    el('span', { class: 'montage-encart-fleche', 'aria-hidden': 'true' }, e.fleche), ' ',
    el('span', { class: 'montage-encart-repere' }, nomRepere),
    `, ${mot} `,
    el('span', {
      class: 'montage-encart-numero',
      style: `background: var(--${etape.couleur.cle}); color: ${PALETTE_ECRAN.texteSur(etape.couleur)}${etape.couleur.lisere ? '; box-shadow: 0 0 0 2px var(--phase-lisere)' : ''}`,
    }, etape.numero)));
  encart.setAttribute('aria-label', `Départ : ${etape.boitier ? nomRepere : e.repere ?? 'repère'}, ${mot} ${etape.numero}. Appuie pour le voir dans le dessin.`);
}

function allerA(cle) {
  guide.cle = cle;
  montage[guide.type].courant = cle;
  enregistrerMontage();
  $m('montage-fin').hidden = true;
  $m('montage-tous').hidden = true;
  afficherGuide({ recentrer: true });
}

function afficherFin() {
  const { type } = guide;
  const autre = type === 'data' ? 'elec' : 'data';
  $m('montage-fin-texte').textContent = texteEtatMontage(montage[type], etapesCourantes[type], type);
  $m('montage-autre').textContent = MOTS_GUIDE[type].autre;
  $m('montage-autre').disabled = etapesCourantes[autre].length === 0;
  $m('montage-fin').hidden = false;
}

function afficherListe() {
  const { type } = guide;
  const fait = new Set(montage[type].coches.map((c) => c.signature));
  remplacer($m('montage-etapes'), etapesCourantes[type].map((x) => {
    const b = el('button', { type: 'button', class: 'bouton montage-etape' },
      el('span', { class: 'pastille-port', style: `background: var(--${x.couleur.cle})`, 'aria-hidden': 'true' }),
      el('span', {}, x.titre),
      fait.has(x.signature) ? el('span', { class: 'fait' }, '✓ branché') : null);
    b.addEventListener('click', () => allerA(x.cle));
    return el('li', {}, b);
  }));
  $m('montage-tous').hidden = false;
}

function initialiserGuide() {
  $m('montage-fermer').addEventListener('click', fermerGuide);
  $m('montage-coche').addEventListener('change', (ev) => {
    if (!guide) return;
    const etape = etapeEnCours();
    const p = montage[guide.type];
    const autres = p.coches.filter((c) => c.signature !== etape.signature);
    montage[guide.type] = {
      ...p, courant: etape.cle,
      coches: ev.target.checked ? [...autres, { signature: etape.signature, cle: etape.cle, titre: etape.titre }] : autres,
    };
    enregistrerMontage();
  });
  $m('montage-precedent').addEventListener('click', () => {
    const etapes = etapesCourantes[guide.type];
    const i = etapes.findIndex((x) => x.cle === guide.cle);
    if (i > 0) allerA(etapes[i - 1].cle);
  });
  $m('montage-suivant').addEventListener('click', () => {
    const etapes = etapesCourantes[guide.type];
    const i = etapes.findIndex((x) => x.cle === guide.cle);
    if (i >= etapes.length - 1) afficherFin();
    else allerA(etapes[i + 1].cle);
  });
  $m('montage-liste').addEventListener('click', afficherListe);
  $m('montage-tous-fermer').addEventListener('click', () => { $m('montage-tous').hidden = true; });
  $m('montage-recentrer').addEventListener('click', () => afficherGuide({ recentrer: true }));
  $m('montage-encart').addEventListener('click', () => {
    if (!guide?.encart) return;
    cadrageGuide = { ...guide.encart.cadrageDepart };
    guide.voirDepart = true;
    afficherGuide();
  });
  $m('montage-compris').addEventListener('click', () => {
    montage[guide.type].avis = null;
    enregistrerMontage();
    afficherGuide();
  });
  $m('montage-retour').addEventListener('click', fermerGuide);
  $m('montage-autre').addEventListener('click', () => {
    const autre = guide.type === 'data' ? 'elec' : 'data';
    formulaire.querySelector(`input[name=cablage][value=${autre}]`).checked = true;
    formulaire.dispatchEvent(new Event('change'));
    ouvrirGuide(autre);
  });
  $m('montage-tout-decocher').addEventListener('click', () => {
    if (!confirm(`Décocher ${guide.type === 'data' ? 'tous les ports' : 'toutes les lignes'} de ce guide ?`)) return;
    montage[guide.type] = { ...videMontage(), courant: etapesCourantes[guide.type][0]?.cle ?? null };
    enregistrerMontage();
    afficherFin();
  });
  // Changer d'onglet ou appuyer sur Échap ferme le guide ; l'écran est redemandé allumé au retour dans l'appli.
  window.addEventListener('hashchange', () => { if (guide) fermerGuide(); });
  document.addEventListener('keydown', (ev) => { if (guide && ev.key === 'Escape') fermerGuide(); });
  document.addEventListener('visibilitychange', () => { if (guide && document.visibilityState === 'visible') garderEcranAllume(); });
  window.addEventListener('resize', () => { if (guide) afficherGuide({ recentrer: true }); });
  rechargerMontage();
}

// Suivi du montage relu (au lancement, et à l'ouverture d'un autre mur) : le guide ouvert se ferme.
export function rechargerMontage() {
  if (guide) fermerGuide();
  montage = { data: videMontage(), elec: videMontage() };
  return Promise.resolve(stockageMontage.lire()).then((v) => {
    if (v?.data || v?.elec) montage = { data: { ...videMontage(), ...v.data }, elec: { ...videMontage(), ...v.elec } };
    mettreAJour();
  }).catch(() => {});
}

// Grand affichage (bouton de l'en-tête) : le dessin du Schéma et du guide grossit ses noms, ses numéros et ses traits.
const grandAffichage = () => document.documentElement.dataset.taille === 'grand';
export function actualiserAffichageSchema() {
  mettreAJour();
}

// « Repartir des réglages par défaut » (onglet Base) : le suivi du montage est effacé aussi.
export function effacerMontage() {
  montage = { data: videMontage(), elec: videMontage() };
  Promise.resolve(stockageMontage.ecrire(null)).catch(() => {});
  if (guide) fermerGuide();
  else mettreAJour();
}

export function initialiserSchema({ surDepart = () => {} } = {}) {
  publierDeparts = surDepart;
  formulaire.addEventListener('input', mettreAJour);
  formulaire.addEventListener('change', mettreAJour);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
  document.getElementById('export-schema').addEventListener('click', exporterSchema);
  initialiserGuide();
}

// Appelé quand le mode du mur change dans l'onglet Poids (accroche ou stack).
export function definirModeMur(mode) {
  modeMur = mode === 'stack' ? 'stack' : 'accroche';
  libellesAuto();
  mettreAJour();
}

export function murModifiePourSchema(etat) {
  etatMur = etat;
  if (dalleChoisie && etat?.mur && !dallesDuMur(etat.mur, etat.dalle).some((d) => d.id === dalleChoisie)) dalleChoisie = null;
  mettreAJour();
}

export function dataModifieePourSchema(etat) {
  etatData = etat;
  mettreAJour();
}

// Sortie du serveur pliée (9b7) : format choisi dans Canvas ([largeur, hauteur]) ou null ; la vue pixels d'un processeur,
// son export et sa mire suivent le pliage.
let formatSortie = null;
export function sortieModifieePourSchema(format) {
  const nouveau = format ? format.join('x') : '';
  if (nouveau === (formatSortie ? formatSortie.join('x') : '')) return;
  formatSortie = format;
  mettreAJour();
}

export function elecModifiePourSchema(etat) {
  etatElec = etat;
  afficherRappelDistance();
  mettreAJour();
}

// Rappel de la distance armoire–mur, saisie dans Élec : réglages du câblage, avec le lien vers Élec.
function afficherRappelDistance() {
  const distance = etatElec?.distribution?.distanceArmoireM ?? null;
  remplacer(document.getElementById('rappel-distance-armoire'),
    `Armoire élec à mur : ${distance === null ? 'non mesurée' : `${nombreCourt(distance, 1)} m`}, saisie dans la section Distribution d'Élec. `,
    el('a', { href: '#elec', class: 'lien-discret' }, 'Modifier dans Élec'));
}
