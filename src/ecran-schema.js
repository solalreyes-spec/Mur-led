// Onglet Schéma : vue physique (mm) ou pixel map, câblage data ou élec en serpentin, variantes côte à côte.
// Tout est calculé par calculs.js (dallesDuMur, pixelMap, cablageData, cablageElec) : ici, seulement le dessin.

import {
  dallesDuMur, pixelMap, cablageData, cablageElec, LIBELLES_COIN, MARGE_MOU_DEFAUT, ErreurSaisie,
} from './calculs.js';
import { resumeCablage } from './resumes.js';
import { nombre, nombreCourt, lireNombre } from './format.js';
import { el, svg, remplacer } from './dom.js';

const formulaire = document.getElementById('form-schema');
const zone = document.getElementById('resultats-schema');

let etatMur = null;
let etatData = null;
let etatElec = null;
let publierDeparts = () => {};
let departsPublies = { data: 'haut-gauche', elec: 'haut-gauche' };
// Trajet mis en évidence (port ou ligne) et dalle choisie ; cadrage courant du dessin.
let selection = null;
let dalleChoisie = null;
let cadrage = null;
let cadrageComplet = null;
let cleDessin = null;
let dernier = null;

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const pourcent = (taux) => `${nombre(taux * 100, 1)} %`;
const NB_COULEURS = 8;
// Motifs de trait, pour distinguer les trajets sans compter sur la couleur (mode rouge).
const MOTIFS = [null, [3, 2], [0.6, 1.6]];

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
    departData: d.get('departData'),
    departElec: d.get('departElec'),
    distanceRegieM: facultatif('distanceRegieM'),
    distanceArmoireM: facultatif('distanceArmoireM'),
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
      resultat.data = cablageData(etatData.mur, etatData.dalle, etatData.choisie,
        { depart: e.departData, distanceRegieM: e.distanceRegieM, margeMou: e.margeMou });
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      resultat.erreurs.push(erreur.message);
    }
  }
  if (etatElec) {
    try {
      resultat.elec = cablageElec(etatElec.mur, etatElec.dalle, etatElec.r,
        { depart: e.departElec, distanceArmoireM: e.distanceArmoireM, margeMou: e.margeMou });
    } catch (erreur) {
      if (!(erreur instanceof ErreurSaisie)) throw erreur;
      resultat.erreurs.push(erreur.message);
    }
  }
  return resultat;
}

const varianteChoisie = (t, mode) => (t ? t.variantes.find((x) => x.mode === mode) ?? t.variantes.find((x) => x.mode === t.conseil) : null);

// Trajets à dessiner : un par port (data) ou par ligne (élec), avec sa couleur, son motif et ses dalles.
function trajetsDe(e, vd, ve, canvasNumero) {
  if (e.cablage === 'data' && vd) {
    const plusieurs = vd.processeurs.length > 1;
    let rang = 0;
    return vd.processeurs.flatMap((p) => p.ports.map((port) => {
      const i = rang;
      rang += 1;
      return {
        cle: `p${p.numero}-${port.numero}`,
        groupe: plusieurs ? `${p.modele} n° ${p.numero}` : p.modele,
        processeur: p.numero,
        etiquette: plusieurs ? `${p.numero}.${port.numero}` : `${port.numero}`,
        libelle: `${port.libelle} : ${pluriel(port.dalles.length, 'dalle', 'dalles')}, ${pourcent(port.taux)}`,
        dalles: port.dalles,
        couleur: `var(--trace-${(i % NB_COULEURS) + 1})`,
        motif: MOTIFS[Math.floor(i / NB_COULEURS) % MOTIFS.length],
        secours: port.secours,
      };
    })).filter((t) => !canvasNumero || t.processeur === canvasNumero);
  }
  if (e.cablage === 'elec' && ve) {
    const mono = ve.phases.length === 1;
    return ve.lignesDetail.map((l) => ({
      cle: `l${l.numero}`,
      groupe: mono ? 'Lignes' : `Phase L${l.phase}`,
      etiquette: `${l.numero}`,
      libelle: `ligne ${l.numero}${mono ? '' : `, L${l.phase}`} : ${pluriel(l.dalles.length, 'dalle', 'dalles')}, ${nombreCourt(l.puissanceW)} W`,
      dalles: l.dalles,
      couleur: `var(--phase-${mono ? 1 : l.phase})`,
      motif: mono ? null : MOTIFS[(l.phase - 1) % MOTIFS.length],
      secours: null,
    }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------------

// Géométrie de la vue : rectangles des dalles (mm ou px), taille du cadre et blocs de processeurs.
function geometrie(e, mur, dalle, pm) {
  const dalles = dallesDuMur(mur, dalle);
  if (e.vue === 'physique') {
    return {
      unite: 'mm',
      largeur: mur.largeurMm,
      hauteur: mur.hauteurMm,
      rects: new Map(dalles.map((d) => [d.id, { x: d.mm.x, y: d.mm.y, w: d.mm.largeur, h: d.mm.hauteur, d }])),
    };
  }
  const numero = e.canvasVue.startsWith('p') ? Number(e.canvasVue.slice(1)) : null;
  const canvas = numero ? pm?.canvas.find((c) => c.numero === numero) : null;
  if (canvas) {
    const parId = new Map(dalles.map((d) => [d.id, d]));
    return {
      unite: 'px',
      canvas,
      largeur: canvas.canvas?.largeurPx ?? canvas.bloc.largeurPx,
      hauteur: canvas.canvas?.hauteurPx ?? canvas.bloc.hauteurPx,
      rects: new Map(canvas.dalles.map((z) => [z.id, { x: z.x[0], y: z.y[0], w: z.x[1] - z.x[0] + 1, h: z.y[1] - z.y[0] + 1, d: parId.get(z.id) }])),
    };
  }
  return {
    unite: 'px',
    largeur: mur.pxLargeur,
    hauteur: mur.pxHauteur,
    rects: new Map(dalles.map((d) => [d.id, { x: d.px.x, y: d.px.y, w: d.px.largeur, h: d.px.hauteur, d }])),
  };
}

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

function dessin(e, geo, trajets, coin, blocs) {
  const { largeur, hauteur, rects } = geo;
  const marge = 0.12 * Math.max(largeur, hauteur);
  const complet = { x: -marge, y: -marge, w: largeur + 2 * marge, h: hauteur + 2 * marge };
  const cle = `${e.vue}|${e.canvasVue}|${largeur}x${hauteur}`;
  if (cle !== cleDessin) {
    cadrage = { ...complet };
    cleDessin = cle;
  }
  cadrageComplet = complet;
  const cote = Math.min(...[...rects.values()].map((r) => Math.min(r.w, r.h)));
  const trait = cote * 0.07;
  const police = cote * 0.2;
  const surligne = selection !== null;

  const marqueurs = [...new Set(trajets.map((t) => t.couleur))].map((couleur, i) => svg('marker', {
    id: `fleche-${i}`, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto',
  }, svg('path', { d: 'M1,1 L9,5 L1,9 z', style: `fill: ${couleur}` })));
  const idMarqueur = new Map([...new Set(trajets.map((t) => t.couleur))].map((c, i) => [c, `fleche-${i}`]));

  const tuiles = [...rects.entries()].map(([id, r]) => svg('g', { 'data-dalle': id },
    svg('rect', { class: `dalle${r.d?.type === 'demi' ? ' demi' : ''}${id === dalleChoisie ? ' choisie' : ''}`, x: r.x, y: r.y, width: r.w, height: r.h, 'stroke-width': cote * (id === dalleChoisie ? 0.05 : 0.015) }),
    svg('text', { class: 'etiquette-dalle', x: r.x + r.w / 2, y: r.y + r.h / 2 - (geo.unite === 'px' ? police * 0.6 : 0), 'font-size': police }, id),
    geo.unite === 'px' ? svg('text', { class: 'etiquette-dalle', x: r.x + r.w / 2, y: r.y + r.h / 2 + police * 0.7, 'font-size': police * 0.75 }, `${r.x}, ${r.y}`) : null));

  const contours = blocs.map((b) => svg('g', {},
    svg('rect', { class: 'bloc', x: b.x, y: b.y, width: b.w, height: b.h, 'stroke-width': trait * 0.6 }),
    svg('text', { class: 'etiquette-bloc', x: b.x + trait, y: b.y - trait * 1.5, 'font-size': police * 1.1 }, b.libelle)));

  // Trajet : talon depuis le bord du côté du départ, serpentin fléché, retour de redondance en pointillés.
  const bordY = coin.startsWith('haut') ? -marge * 0.35 : hauteur + marge * 0.35;
  const lignes = trajets.map((t) => {
    const points = t.dalles.filter((id) => rects.has(id)).map((id) => centre(rects.get(id)));
    if (points.length === 0) return null;
    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];
    const actif = !surligne || selection === t.cle;
    const largeurTrait = trait * (selection === t.cle ? 1.8 : 1);
    const pointilles = t.motif ? t.motif.map((x) => x * trait * 2).join(' ') : null;
    const style = `stroke: ${t.couleur}`;
    return svg('g', { 'data-trajet': t.cle, class: actif ? null : 'attenue' },
      svg('line', { class: 'trajet', x1: x0, y1: bordY, x2: x0, y2: y0, style, 'stroke-width': largeurTrait, 'stroke-dasharray': pointilles }),
      svg('polyline', {
        class: 'trajet', points: points.map((p) => p.join(',')).join(' '), style, 'stroke-width': largeurTrait,
        'stroke-dasharray': pointilles, 'marker-mid': `url(#${idMarqueur.get(t.couleur)})`, 'marker-end': `url(#${idMarqueur.get(t.couleur)})`,
      }),
      t.secours ? svg('line', { class: 'trajet', x1: xn, y1: yn, x2: xn, y2: bordY, style, 'stroke-width': largeurTrait * 0.7, 'stroke-dasharray': `${trait * 1.2} ${trait * 1.4}` }) : null,
      svg('circle', { cx: x0, cy: bordY, r: police * 0.95, style: `fill: var(--fond); stroke: ${t.couleur}`, 'stroke-width': trait * 0.6 }),
      svg('text', { class: 'numero-trajet', x: x0, y: bordY, 'font-size': police * (t.etiquette.length > 3 ? 0.7 : 0.95), style: `fill: ${t.couleur}` }, t.etiquette));
  });

  const racine = svg('svg', {
    viewBox: `${cadrage.x} ${cadrage.y} ${cadrage.w} ${cadrage.h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': `Schéma du mur, ${geo.unite === 'mm' ? 'vue physique en millimètres' : 'vue en pixels'}`,
    style: `aspect-ratio: ${complet.w} / ${complet.h}`,
  },
  svg('defs', {}, marqueurs),
  svg('rect', { x: 0, y: 0, width: largeur, height: hauteur, style: 'fill: none; stroke: var(--texte-doux)', 'stroke-width': cote * 0.02 }),
  tuiles, contours, lignes);
  brancherGestes(racine);
  return racine;
}

// Zoom et déplacement : boutons, molette, un doigt pour déplacer, deux doigts pour zoomer. Un appui bref choisit.
function appliquerCadrage(racine) {
  racine.setAttribute('viewBox', `${cadrage.x} ${cadrage.y} ${cadrage.w} ${cadrage.h}`);
}

function zoomer(racine, facteur, cx = cadrage.x + cadrage.w / 2, cy = cadrage.y + cadrage.h / 2) {
  const w = Math.min(cadrageComplet.w, Math.max(cadrageComplet.w / 40, cadrage.w / facteur));
  const k = w / cadrage.w;
  cadrage = { x: cx - (cx - cadrage.x) * k, y: cy - (cy - cadrage.y) * k, w, h: cadrage.h * k };
  appliquerCadrage(racine);
}

function brancherGestes(racine) {
  const pointeurs = new Map();
  let depart = null;
  let bouge = false;
  const versDessin = (clientX, clientY) => {
    const r = racine.getBoundingClientRect();
    const echelle = Math.max(cadrage.w / r.width, cadrage.h / r.height);
    const decalX = (r.width * echelle - cadrage.w) / 2;
    const decalY = (r.height * echelle - cadrage.h) / 2;
    return [cadrage.x - decalX + (clientX - r.left) * echelle, cadrage.y - decalY + (clientY - r.top) * echelle, echelle];
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
        cadrage = { ...cadrage, x: cadrage.x - (ev.clientX - avant.x) * echelle, y: cadrage.y - (ev.clientY - avant.y) * echelle };
        appliquerCadrage(racine);
      }
    } else if (pointeurs.size === 2) {
      bouge = true;
      const [a, b] = [...pointeurs.values()];
      const autre = [...pointeurs.entries()].find(([id]) => id !== ev.pointerId)[1];
      const avantDistance = Math.hypot(a.x - b.x, a.y - b.y);
      const apresDistance = Math.hypot(ev.clientX - autre.x, ev.clientY - autre.y);
      if (avantDistance > 0 && apresDistance > 0) {
        const [cx, cy] = versDessin((ev.clientX + autre.x) / 2, (ev.clientY + autre.y) / 2);
        zoomer(racine, apresDistance / avantDistance, cx, cy);
      }
    }
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  });
  const fin = (ev) => {
    if (!pointeurs.has(ev.pointerId)) return;
    pointeurs.delete(ev.pointerId);
    if (pointeurs.size === 0 && !bouge && depart) choisir(depart.cible);
    if (pointeurs.size === 0) depart = null;
  };
  racine.addEventListener('pointerup', fin);
  racine.addEventListener('pointercancel', (ev) => pointeurs.delete(ev.pointerId));
  racine.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [cx, cy] = versDessin(ev.clientX, ev.clientY);
    zoomer(racine, ev.deltaY < 0 ? 1.2 : 1 / 1.2, cx, cy);
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

function carteVariante(v, choisie, conseil, champ, lignes) {
  const bouton = el('button', {
    type: 'button', class: `carte-variante${v.possible ? '' : ' impossible'}`, 'aria-pressed': String(v === choisie),
  },
  el('strong', {}, v.libelle.charAt(0).toUpperCase() + v.libelle.slice(1)),
  lignes.map((l) => el('span', {}, l)),
  v.mode === conseil ? el('span', { class: 'badge badge-reussi' }, 'conseillé') : null,
  v.possible ? null : el('span', { class: 'badge badge-echec' }, 'impossible'));
  bouton.addEventListener('click', () => {
    formulaire.elements[champ].value = v.mode;
    selection = null;
    formulaire.dispatchEvent(new Event('change'));
  });
  return bouton;
}

function cartesData(t, vd) {
  return el('div', { class: 'cartes-variantes', role: 'group', 'aria-label': 'Variantes de câblage data' },
    t.variantes.map((v) => carteVariante(v, vd, t.conseil, 'varianteData', [
      `${pluriel(v.ports, 'port', 'ports')}${v.portsSecours ? ` + ${v.portsSecours} de secours` : ''}`,
      `charge maxi ${pourcent(v.chargeMax)}`,
      `${pluriel(v.cablesTete, 'câble de tête', 'câbles de tête')}, ${pluriel(v.liaisons, 'liaison', 'liaisons')}`,
    ])));
}

function cartesElec(t, ve) {
  return el('div', { class: 'cartes-variantes', role: 'group', 'aria-label': 'Variantes de câblage élec' },
    t.variantes.map((v) => carteVariante(v, ve, t.conseil, 'varianteElec', [
      pluriel(v.lignes, 'ligne', 'lignes'),
      `charge maxi ${pourcent(v.chargeMax)}`,
      v.phases.length > 1 ? v.phases.map((p) => `L${p.numero} ${nombreCourt(p.puissanceW)} W`).join(' · ') : `${nombreCourt(v.phases[0].puissanceW)} W`,
      `${pluriel(v.cablesTete, 'câble de tête', 'câbles de tête')}, ${pluriel(v.liaisons, 'liaison', 'liaisons')}`,
    ])));
}

function legende(trajets) {
  if (trajets.length === 0) return null;
  const groupes = [...new Set(trajets.map((t) => t.groupe))];
  return el('div', { class: 'legende-trajets' }, groupes.flatMap((g) => [
    groupes.length > 1 || trajets.length > 1 ? el('p', { class: 'legende-groupe' }, g) : null,
    ...trajets.filter((t) => t.groupe === g).map((t) => {
      const puce = el('button', { type: 'button', class: 'puce-trajet', 'aria-pressed': String(selection === t.cle) },
        svg('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' },
          svg('line', { x1: 1, y1: 5, x2: 25, y2: 5, style: `stroke: ${t.couleur}`, 'stroke-width': 3, 'stroke-dasharray': t.motif ? t.motif.map((x) => x * 3).join(' ') : null })),
        t.libelle);
      puce.addEventListener('click', () => {
        selection = selection === t.cle ? null : t.cle;
        mettreAJour();
      });
      return puce;
    }),
  ]));
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

export function resumeOngletSchema() {
  return dernier ? resumeCablage(dernier) : null;
}

function mettreAJour() {
  dernier = null;
  const e = lireFormulaire();
  // Le coin de départ décide aussi du serpentin au plus juste des onglets Data et Élec.
  if (e.departData !== departsPublies.data || e.departElec !== departsPublies.elec) {
    departsPublies = { data: e.departData, elec: e.departElec };
    publierDeparts({ data: e.departData, elec: e.departElec });
  }
  if (!etatMur?.mur) {
    remplacer(zone, alerte('Le mur n\'est pas valide : corrige-le dans l\'onglet Mur.', 'alerte-erreur'));
    return;
  }
  const { mur, dalle } = etatMur;
  const { data, elec, erreurs } = calculer(e);
  const vd = varianteChoisie(data, e.varianteData);
  const ve = varianteChoisie(elec, e.varianteElec);
  dernier = { data, modeData: vd?.mode ?? null, elec, modeElec: ve?.mode ?? null };

  const pm = pixelMap(mur, dalle, etatData?.mur === mur ? etatData.choisie : null);
  // Choix du canvas dans la vue pixels : tout le mur, ou le canvas d'un processeur.
  const blocCanvas = document.getElementById('bloc-canvas-vue');
  blocCanvas.hidden = e.vue !== 'pixels' || pm.canvas.length === 0;
  const select = formulaire.elements.canvasVue;
  const options = ['mur', ...pm.canvas.map((c) => `p${c.numero}`)];
  if ([...select.options].map((o) => o.value).join() !== options.join()) {
    remplacer(select, el('option', { value: 'mur' }, 'Tout le mur'),
      pm.canvas.map((c) => el('option', { value: `p${c.numero}` }, `Processeur n° ${c.numero} : ${c.canvas?.largeurPx ?? c.bloc.largeurPx} × ${c.canvas?.hauteurPx ?? c.bloc.hauteurPx} px`)));
  }
  if (!options.includes(e.canvasVue)) select.value = 'mur';
  const vueCanvas = e.vue === 'pixels' && select.value !== 'mur' ? Number(select.value.slice(1)) : null;
  const eVue = { ...e, canvasVue: select.value };

  const geo = geometrie(eVue, mur, dalle, pm);
  const trajets = trajetsDe(e, vd, ve, vueCanvas);
  const coin = e.cablage === 'elec' ? e.departElec : e.departData;
  // Contour de chaque bloc de processeur (vue physique ou mur entier en pixels, mur découpé).
  const blocs = [];
  if (!vueCanvas && pm.canvas.length > 1 && e.cablage !== 'elec') {
    for (const c of pm.canvas) {
      const rs = c.dalles.map((z) => geo.rects.get(z.id));
      const x = Math.min(...rs.map((r) => r.x));
      const y = Math.min(...rs.map((r) => r.y));
      blocs.push({ x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y, libelle: `Processeur n° ${c.numero}` });
    }
  }

  const alertes = [...erreurs.map((x) => alerte(x, 'alerte-erreur'))];
  let entete = null;
  if (e.cablage === 'data') {
    if (!data) {
      alertes.push(alerte('Aucun processeur retenu : choisis-en un qui convient dans l\'onglet Data.', 'alerte-info'));
    } else {
      entete = [
        el('p', { class: 'recap-mur' }, `Data : ${vd.processeurs.length} × ${etatData.choisie.processeur.nom}, départ ${LIBELLES_COIN[data.depart]}. `,
          el('a', { href: '#data' }, 'Modifier')),
        cartesData(data, vd),
      ];
      if (!vd.possible) alertes.push(alerte(vd.raison, 'alerte-erreur'));
      if (vd.noteSecours) alertes.push(alerte(vd.noteSecours, 'alerte-info'));
      if (vd.mode === 'auPlusJuste' && etatData.choisie.global?.serpentin?.ecart) alertes.push(alerte(etatData.choisie.global.serpentin.ecart, 'alerte-info'));
      alertes.push(...vd.alertes.map((x) => alerte(x)));
    }
  } else if (e.cablage === 'elec') {
    if (!elec) {
      alertes.push(alerte('Pas de calcul électrique valide : vérifie l\'onglet Élec.', 'alerte-info'));
    } else {
      entete = [
        el('p', { class: 'recap-mur' }, `Élec : départ ${LIBELLES_COIN[elec.depart]}. Résultats indicatifs, à valider par l'électricien. `,
          el('a', { href: '#elec' }, 'Modifier')),
        cartesElec(elec, ve),
      ];
      if (ve.mode === 'auPlusJuste' && etatElec.r.lignes.auPlusJuste.ecart) alertes.push(alerte(etatElec.r.lignes.auPlusJuste.ecart, 'alerte-info'));
      alertes.push(...ve.alertes.map((x) => alerte(x)));
    }
  }

  const racine = dessin(eVue, geo, trajets, coin, blocs);
  const outils = el('div', { class: 'schema-outils' },
    ['+', '−', 'Tout voir'].map((texte) => {
      const b = el('button', { type: 'button', class: 'bouton bouton-petit', 'aria-label': { '+': 'Zoomer', '−': 'Dézoomer', 'Tout voir': 'Voir tout le mur' }[texte] }, texte);
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
    el('div', { class: 'schema-cadre' }, outils, racine),
    el('p', { class: 'source' }, `${geo.unite === 'mm' ? 'Vue physique à l\'échelle, en millimètres' : 'Vue en pixels, pixel (0,0) en haut à gauche'}. `
      + 'Appuie sur une dalle pour sa position, sur un trajet pour le mettre en évidence ; deux doigts pour zoomer.'),
    dalleChoisie ? ficheDalle(dalleChoisie, pm, e.cablage === 'data' ? vd : null, e.cablage === 'elec' ? ve : null) : null,
    legende(trajets),
    e.vue === 'pixels' ? tableCanvas(pm) : null);
}

// ---------------------------------------------------------------------------

// `surDepart({ data, elec })` : le coin de départ a changé ; les onglets Data et Élec recalculent leur serpentin.
export function initialiserSchema({ surDepart = () => {} } = {}) {
  publierDeparts = surDepart;
  formulaire.addEventListener('input', mettreAJour);
  formulaire.addEventListener('change', mettreAJour);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());
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

export function elecModifiePourSchema(etat) {
  etatElec = etat;
  mettreAJour();
}
