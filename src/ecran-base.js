// Onglet Base : ma base locale (fiches ajoutées, versions modifiées, parcs), saisie guidée ou JSON vérifié,
// consigne pour Claude, export et import. Aucune règle de validation ici : tout passe par fiches.js.

import { resoudreFiche } from './calculs.js';
import {
  TYPES, LIBELLES_TYPE, CHAMPS, CONFIANCES, TYPES_VALEUR, libelleChamp, champsManquantsFiche, validerImport, importer,
  supprimerFiche, exporter, creerParc, renommerParc, supprimerParc, estMembre, basculerMembre,
  CONSIGNE_CLAUDE, MODELES_JSON, identifiant, CHAMPS_REGLAGE_PARC, reglageDalleParc, reglerDalleParc,
} from './fiches.js';
import { stockageDisponible } from './stockage.js';
import { sourceCourte, lireNombre, nombre } from './format.js';
import { el, remplacer } from './dom.js';

const $ = (id) => document.getElementById(id);
const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim() }, texte);
const badge = (texte, genre) => el('span', { class: `badge ${genre}` }, texte);
const pluriel = (n, singulier, plurielForme) => `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
const normaliser = (texte) => String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// { base, depart, fusion, parcActif } : ma base, la base de départ et leur fusion (fiches brutes avec statutBase).
let ctx = null;
let enregistrer = async () => true;
const ouvertes = new Set();

// Type de valeur proposé par défaut dans la saisie guidée.
const AVEC_TYPE = { pMaxW: 'max', pMoyW: 'typique' };
const NOMS_LISTE = { dalle: ['dalle', 'dalles'], processeur: ['processeur', 'processeurs'], regie: ['régie', 'régies'], bumper: ['bumper', 'bumpers'] };

function toutesSources() {
  const f = ctx.fusion;
  return { ...f.dalles.sources, ...f.processeurs.sources, ...f.regies.sources };
}

// Fiches brutes d'un type (gabarits exclus : génériques, non sourcés) et leur version résolue.
function fichesDuType(type) {
  const f = ctx.fusion;
  const brutes = { dalle: f.dalles.dalles, bumper: f.dalles.bumpers, processeur: f.processeurs.processeurs, regie: f.regies.regies }[type] ?? [];
  const sources = { dalle: f.dalles.sources, bumper: f.dalles.sources, processeur: f.processeurs.sources, regie: f.regies.sources }[type];
  return brutes.map((brute) => ({ brute, resolue: resoudreFiche(brute, sources) }));
}

// Identifiants des sources citées par une fiche brute (valeurs sourcées, formats de canvas, modes de sortie).
function sourcesCitees(brute) {
  const ids = new Set();
  for (const champ of Object.values(brute)) {
    const entrees = Array.isArray(champ) ? champ : champ && typeof champ === 'object' ? champ.valeurs ?? [champ] : [];
    for (const x of entrees) if (x && typeof x === 'object' && typeof x.source === 'string') ids.add(x.source);
  }
  return [...ids];
}

function sansStatut(fiche) {
  const copie = { ...fiche };
  delete copie.statutBase;
  return copie;
}

// ---------------------------------------------------------------------------
// État du stockage
// ---------------------------------------------------------------------------

function afficherEtat() {
  const { base } = ctx;
  remplacer($('etat-stockage'),
    stockageDisponible() ? null : alerte('Stockage local indisponible (navigation privée ou stockage bloqué) : '
      + 'tes fiches restent en mémoire jusqu\'à la fermeture de la page. Exporte ta base avant de quitter.', 'alerte-erreur'),
    el('p', { class: 'recap-mur' }, `Ma base : ${pluriel(base.fiches.length, 'fiche ajoutée ou modifiée', 'fiches ajoutées ou modifiées')}, `
      + `${pluriel(base.parcs.length, 'parc', 'parcs')}. La base de départ reste intacte.`
      + { true: ' Stockage persistant accordé : le navigateur ne videra pas ta base pour faire de la place.',
        false: ' Stockage persistant non accordé par le navigateur : exporte ta base régulièrement.' }[ctx.persistant] ?? ''));
}

// ---------------------------------------------------------------------------
// Parcs
// ---------------------------------------------------------------------------

function compterMembres(parc) {
  const comptes = Object.keys(NOMS_LISTE).map((type) => {
    const n = fichesDuType(type).filter(({ brute }) => estMembre(ctx.base, parc.id, type, brute.id)).length;
    return n ? pluriel(n, ...NOMS_LISTE[type]) : null;
  }).filter(Boolean);
  return comptes.length ? comptes.join(', ') : 'vide';
}

function afficherParcs() {
  const { base, parcActif } = ctx;
  remplacer($('liste-parcs'), base.parcs.length === 0
    ? el('li', { class: 'compte' }, 'Aucun parc : les onglets Mur et Data montrent toute la base (« Tous »).')
    : base.parcs.map((parc) => {
      const champ = el('input', { type: 'text', value: parc.nom, 'aria-label': `Nom du parc ${parc.nom}` });
      champ.addEventListener('change', () => {
        const nom = champ.value.trim();
        if (nom && nom !== parc.nom) enregistrer(renommerParc(ctx.base, parc.id, nom));
        else champ.value = parc.nom;
      });
      const bouton = el('button', { class: 'bouton bouton-discret', type: 'button' }, 'Supprimer');
      bouton.addEventListener('click', () => {
        if (confirm(`Supprimer le parc « ${parc.nom} » ? Ses fiches restent dans la base.`)) enregistrer(supprimerParc(ctx.base, parc.id));
      });
      return el('li', {}, champ,
        el('span', { class: 'compte' }, `${compterMembres(parc)}${parc.id === parcActif ? ' · parc actif' : ''}`),
        bouton);
    }));
}

// ---------------------------------------------------------------------------
// Liste des fiches
// ---------------------------------------------------------------------------

function modifierFiche(type, brute) {
  const toutes = toutesSources();
  const sources = Object.fromEntries(sourcesCitees(brute).filter((id) => toutes[id]).map((id) => [id, toutes[id]]));
  $('json-fiche').value = JSON.stringify({ sources, fiche: { type, ...sansStatut(brute) } }, null, 2);
  choisirMode('json');
  verifierJson();
  $('bloc-saisie').scrollIntoView({ block: 'start' });
}

// Carte de réception et fichier de config de cette dalle chez ce prestataire ; vide = valeur de la fiche.
function formulaireReglage(parc, brute, resolue) {
  const actuel = reglageDalleParc(ctx.base, parc.id, brute.id) ?? {};
  const champs = CHAMPS_REGLAGE_PARC.map((nom) => {
    const id = `reglage-${parc.id}-${brute.id}-${nom}`;
    if (nom === 'rotationPossible') {
      const deFiche = resolue.rotationPossible === undefined ? 'non précisé' : (resolue.rotationPossible ? 'oui' : 'non');
      const actuelle = actuel.rotationPossible === undefined ? '' : String(actuel.rotationPossible);
      return el('div', { class: 'champ' },
        el('label', { for: id }, 'Rotation possible avec les bumpers de ce parc'),
        el('select', { id, name: nom },
          el('option', { value: '', selected: actuelle === '' ? '' : null }, `comme la fiche (${deFiche})`),
          el('option', { value: 'true', selected: actuelle === 'true' ? '' : null }, 'oui'),
          el('option', { value: 'false', selected: actuelle === 'false' ? '' : null }, 'non')));
    }
    return el('div', { class: 'champ' },
      el('label', { for: id }, `${libelleChamp('dalle', nom)}, dans ce parc`),
      el('input', { id, name: nom, type: 'text', autocomplete: 'off', value: actuel[nom] ?? null,
        placeholder: resolue[nom] ? `fiche : ${resolue[nom]}` : 'fiche : non précisé' }));
  });
  const formulaire = el('form', { class: 'formulaire reglage-parc', novalidate: '' },
    el('p', { class: 'compte' }, 'Laisse vide pour garder la valeur de la fiche.'),
    champs,
    el('button', { class: 'bouton', type: 'submit' }, 'Enregistrer pour ce parc'));
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const donnees = new FormData(formulaire);
    enregistrer(reglerDalleParc(ctx.base, parc.id, brute.id, Object.fromEntries(CHAMPS_REGLAGE_PARC.map((n) => [n, donnees.get(n)]))));
  });
  return formulaire;
}

function elementFiche(type, { brute, resolue }) {
  const cle = `${type}:${brute.id}`;
  const manquants = champsManquantsFiche(type, resolue);
  const toutes = toutesSources();
  const parcs = ctx.base.parcs;

  const cases = parcs.map((parc) => {
    const membre = estMembre(ctx.base, parc.id, type, brute.id);
    const caseParc = el('input', { type: 'checkbox', checked: membre ? '' : null });
    caseParc.addEventListener('change', () => enregistrer(basculerMembre(ctx.base, parc.id, type, brute.id)));
    return el('div', {}, el('label', { class: 'case' }, caseParc, el('span', {}, parc.nom)),
      type === 'dalle' && membre ? formulaireReglage(parc, brute, resolue) : null);
  });

  const actions = [];
  const boutonModifier = el('button', { class: 'bouton', type: 'button' }, 'Modifier');
  boutonModifier.addEventListener('click', () => modifierFiche(type, brute));
  actions.push(boutonModifier);
  if (brute.statutBase === 'modifiee') {
    const bouton = el('button', { class: 'bouton', type: 'button' }, 'Revenir à l\'original');
    bouton.addEventListener('click', () => {
      if (confirm(`Revenir à la fiche d'origine de ${resolue.nom} ? Ta version modifiée sera effacée.`)) {
        enregistrer(supprimerFiche(ctx.base, type, brute.id));
      }
    });
    actions.push(bouton);
  }
  if (brute.statutBase === 'ajoutee') {
    const bouton = el('button', { class: 'bouton', type: 'button' }, 'Supprimer');
    bouton.addEventListener('click', () => {
      if (confirm(`Supprimer ta fiche ${resolue.nom} ? Exporte ta base avant si tu veux la garder.`)) {
        enregistrer(supprimerFiche(ctx.base, type, brute.id));
      }
    });
    actions.push(bouton);
  }

  const details = el('details', { class: 'cas', open: ouvertes.has(cle) ? '' : null },
    el('summary', {},
      el('span', { class: 'cas-titre' }, resolue.nom),
      el('span', { class: 'puces' },
        brute.statutBase === 'modifiee' ? badge('version modifiée', 'badge-info') : null,
        brute.statutBase === 'ajoutee' ? badge('ma fiche', 'badge-reussi') : null,
        manquants.length ? badge(type === 'dalle' ? 'incomplète' : 'à compléter', 'badge-alerte') : null,
        parcs.filter((p) => estMembre(ctx.base, p.id, type, brute.id)).map((p) => {
          const r = reglageDalleParc(ctx.base, p.id, brute.id);
          const carte = r ? [r.carteReceptionMarque, r.carteReceptionModele].filter(Boolean).join(' ') : '';
          return badge(carte ? `${p.nom} : ${carte}` : p.nom, 'badge-a-venir');
        }))),
    el('div', { class: 'cas-corps formulaire' },
      el('p', { class: 'source' }, `Identifiant : ${brute.id}${resolue.alias ? ` ; aussi appelée ${[].concat(resolue.alias).join(', ')}` : ''}`),
      manquants.length
        ? alerte(`Fiche incomplète : il manque ${manquants.map((m) => libelleChamp(type, m)).join(', ')}. `
          + 'Les onglets disent ce qu\'ils ne peuvent pas calculer, sans deviner.')
        : null,
      el('div', {},
        el('h4', {}, 'Sources'),
        el('ul', { class: 'rappels' }, sourcesCitees(brute).map((id) => el('li', {},
          toutes[id] ? `${sourceCourte(toutes[id])} : ${toutes[id].titre ?? id}` : `${id} (source inconnue)`)))),
      el('div', {},
        el('h4', {}, 'Parcs'),
        cases.length ? cases : el('p', { class: 'compte' }, 'Crée un parc pour y ranger cette fiche.')),
      el('div', { class: 'actions' }, actions)));
  details.addEventListener('toggle', () => (details.open ? ouvertes.add(cle) : ouvertes.delete(cle)));
  return el('li', {}, details);
}

function afficherFiches() {
  const type = $('filtre-type').value;
  const texte = normaliser($('filtre-texte').value.trim());
  const liste = fichesDuType(type).filter(({ brute, resolue }) => !texte
    || normaliser(`${resolue.nom} ${[].concat(resolue.alias ?? []).join(' ')} ${brute.id}`).includes(texte));
  remplacer($('liste-fiches'), liste.length
    ? liste.map((f) => elementFiche(type, f))
    : el('li', { class: 'compte' }, 'Aucune fiche.'));
}

// ---------------------------------------------------------------------------
// Saisie guidée : prépare le JSON d'une fiche avec une source, puis le vérifie comme un JSON collé.
// ---------------------------------------------------------------------------

function champGuide(type, c) {
  const id = `g-${c.nom}`;
  const libelle = `${c.libelle}${c.unite ? ` (${c.unite})` : ''}${c.niveau === 'enregistrer' ? ' *' : ''}`;
  let saisie;
  if (c.valeurs) {
    saisie = el('select', { id, name: c.nom }, el('option', { value: '' }, '—'), c.valeurs.map((v) => el('option', { value: v }, v)));
  } else if (c.genre === 'booleen') {
    saisie = el('select', { id, name: c.nom }, el('option', { value: '' }, 'non précisé'), el('option', { value: 'true' }, 'oui'), el('option', { value: 'false' }, 'non'));
  } else if (c.genre === 'nombre' || c.genre === 'entier' || (type === 'bumper' && c.nom === 'colonnes')) {
    saisie = el('input', { id, name: c.nom, inputmode: c.genre === 'entier' || c.nom === 'colonnes' ? 'numeric' : 'decimal', autocomplete: 'off' });
  } else {
    saisie = el('input', { id, name: c.nom, type: 'text', autocomplete: 'off',
      placeholder: c.genre === 'liste' ? 'séparés par des virgules' : null });
  }
  if (!AVEC_TYPE[c.nom]) return el('div', { class: 'champ' }, el('label', { for: id }, libelle), saisie);
  return el('div', { class: 'paire' },
    el('div', { class: 'champ' }, el('label', { for: id }, libelle), saisie),
    el('div', { class: 'champ' }, el('label', { for: `${id}-type` }, 'Type de valeur'),
      el('select', { id: `${id}-type`, name: `${c.nom}-type` },
        TYPES_VALEUR.map((t) => el('option', { value: t, selected: t === AVEC_TYPE[c.nom] ? '' : null }, t)))));
}

function construireGuidee() {
  const type = $('guidee-type').value;
  const champs = CHAMPS[type];
  const groupe = (titre, liste) => (liste.length ? el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, titre), liste.map((c) => champGuide(type, c))) : null);
  const facultatifs = champs.filter((c) => !c.niveau);
  const compatibles = type === 'bumper'
    ? el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, 'Dalles compatibles'),
      fichesDuType('dalle').map(({ brute, resolue }) => el('label', { class: 'case' },
        el('input', { type: 'checkbox', name: 'compatibles', value: brute.id }), el('span', {}, resolue.nom))))
    : null;
  remplacer($('guidee-champs'),
    el('p', { class: 'note' }, '* obligatoire pour enregistrer. Un champ laissé vide reste vide : l\'appli ne devine jamais une valeur.'),
    groupe('Obligatoires pour enregistrer', champs.filter((c) => c.niveau === 'enregistrer')),
    groupe('Pour une fiche complète', champs.filter((c) => c.niveau === 'complet')),
    type === 'regie' ? el('p', { class: 'note' }, 'Modes de sortie : à ajouter dans le JSON à l\'étape suivante (voir le modèle de régie).') : null,
    compatibles,
    facultatifs.length ? el('details', { class: 'fiche' }, el('summary', {}, 'Autres champs'),
      el('div', { class: 'formulaire' }, facultatifs.map((c) => champGuide(type, c)))) : null,
    el('fieldset', { class: 'groupe formulaire' }, el('legend', {}, 'Source de toutes ces valeurs'),
      el('div', { class: 'champ' }, el('label', { for: 'g-source-titre' }, 'Fichier et page *'),
        el('input', { id: 'g-source-titre', type: 'text', autocomplete: 'off', placeholder: 'fiche_CB5_MKII.pdf, p. 2' })),
      el('div', { class: 'champ' }, el('label', { for: 'g-source-court' }, 'Nom court'),
        el('input', { id: 'g-source-court', type: 'text', autocomplete: 'off', placeholder: 'Fiche ROE' })),
      el('div', { class: 'paire' },
        el('div', { class: 'champ' }, el('label', { for: 'g-source-date' }, 'Date du document'),
          el('input', { id: 'g-source-date', type: 'text', autocomplete: 'off', placeholder: 'AAAA-MM-JJ' })),
        el('div', { class: 'champ' }, el('label', { for: 'g-source-confiance' }, 'Origine'),
          el('select', { id: 'g-source-confiance' }, CONFIANCES.map((x) => el('option', { value: x }, x)))))));
}

function preparerJson() {
  const type = $('guidee-type').value;
  const zone = $('guidee-champs');
  const valeurDe = (nom) => zone.querySelector(`[name="${nom}"]`)?.value.trim() ?? '';
  const titre = $('g-source-titre').value.trim();
  const court = $('g-source-court').value.trim();
  const fiche = { type };
  for (const c of CHAMPS[type]) {
    const brut = valeurDe(c.nom);
    if (brut === '') continue;
    let valeur = brut;
    if (c.genre === 'nombre' || c.genre === 'entier' || (type === 'bumper' && c.nom === 'colonnes')) {
      const n = lireNombre(brut);
      valeur = Number.isFinite(n) ? n : brut;
    } else if (c.genre === 'liste') {
      valeur = brut.split(',').map((x) => x.trim()).filter(Boolean);
    } else if (c.genre === 'booleen') {
      valeur = brut === 'true';
    }
    fiche[c.nom] = c.genre === 'brut' ? valeur : { valeur, source: 'SOURCE', ...(AVEC_TYPE[c.nom] ? { type: valeurDe(`${c.nom}-type`) } : {}) };
  }
  if (type === 'bumper') fiche.compatibles = [...zone.querySelectorAll('input[name="compatibles"]:checked')].map((x) => x.value);

  // Identifiant de source propre à la fiche, sans écraser une source existante.
  const racine = `saisie-${identifiant(fiche) || 'fiche'}`;
  let idSource = racine;
  for (let i = 2; toutesSources()[idSource]; i += 1) idSource = `${racine}-${i}`;
  for (const champ of Object.values(fiche)) if (champ?.source === 'SOURCE') champ.source = idSource;
  const sources = {
    [idSource]: { titre, court: court || titre, date: $('g-source-date').value.trim() || null, confiance: $('g-source-confiance').value },
  };
  $('json-fiche').value = JSON.stringify({ sources, fiche }, null, 2);
  choisirMode('json');
  verifierJson();
}

// ---------------------------------------------------------------------------
// JSON collé : vérification en direct, puis enregistrement
// ---------------------------------------------------------------------------

function choisirMode(mode) {
  for (const radio of document.querySelectorAll('input[name="modeSaisie"]')) radio.checked = radio.value === mode;
  $('saisie-guidee').hidden = mode !== 'guidee';
  $('saisie-json').hidden = mode !== 'json';
}

function nomFiche(fiche) {
  return fiche.nom ?? ([fiche.marque, fiche.modele, fiche.version].filter(Boolean).join(' ') || 'sans nom');
}

function statutEntree(type, fiche) {
  const id = fiche.id ?? identifiant(fiche);
  const existante = LIBELLES_TYPE[type] ? fichesDuType(type).find(({ brute }) => brute.id === id)?.brute : null;
  if (!existante) return `Nouvelle fiche (identifiant ${id}).`;
  if (existante.statutBase === 'depart') return `Remplacera la fiche de départ ${id} par ta version modifiée ; retour à l'original possible.`;
  return `Remplacera ta fiche ${id}.`;
}

function verifierJson() {
  const texte = $('json-fiche').value.trim();
  const bouton = $('enregistrer-json');
  bouton.disabled = true;
  if (!texte) {
    remplacer($('rapport-json'), el('p', { class: 'note' }, 'Colle ici le JSON d\'une fiche : l\'appli vérifie les sources et dit ce qui manque avant d\'enregistrer.'));
    return;
  }
  const lecture = validerImport(texte, toutesSources());
  if (lecture.erreurs.length) {
    remplacer($('rapport-json'), lecture.erreurs.map((x) => alerte(x, 'alerte-erreur')));
    return;
  }
  remplacer($('rapport-json'), lecture.entrees.map(({ type, fiche, validation: v }) => el('div', { class: 'rapport-fiche' },
    el('h4', {}, `${LIBELLES_TYPE[type] ?? 'Type inconnu'} ${nomFiche(fiche)}`),
    v.enregistrable
      ? alerte(`Enregistrable. ${statutEntree(type, fiche)}`, 'alerte-ok')
      : alerte('Pas enregistrable : corrige les erreurs ci-dessous.', 'alerte-erreur'),
    v.erreurs.map((x) => alerte(x, 'alerte-erreur')),
    v.manquants.length
      ? alerte(`Fiche incomplète : il manque ${v.manquants.map((m) => libelleChamp(type, m)).join(', ')}. `
        + 'Elle peut être enregistrée ; les onglets diront ce qu\'ils ne peuvent pas calculer.')
      : null,
    v.avertissements.map((x) => alerte(x, 'alerte-info')))));
  bouton.disabled = !lecture.entrees.some((x) => x.validation.enregistrable);
}

function afficherRapport(zone, rapport, stocke, titre) {
  const { ajoutees, ignorees, refusees, erreurs } = rapport;
  const nomParcActif = ctx.base.parcs.find((p) => p.id === ctx.parcActif)?.nom;
  const horsParc = ajoutees.filter((id) => !TYPES.some((type) => estMembre(ctx.base, ctx.parcActif, type, id)));
  remplacer(zone,
    titre ? el('h4', {}, titre) : null,
    erreurs.map((x) => alerte(x, 'alerte-erreur')),
    ajoutees.length ? alerte(`${pluriel(ajoutees.length, 'fiche enregistrée', 'fiches enregistrées')} : ${ajoutees.join(', ')}.`, 'alerte-ok') : null,
    ignorees.length ? alerte(`${pluriel(ignorees.length, 'fiche identique', 'fiches identiques')} à la base de départ, rien à enregistrer`
      + `${ignorees.length <= 5 ? ` : ${ignorees.join(', ')}` : ''}.`, 'alerte-info') : null,
    refusees.map((r) => alerte(`Refusée : ${r.id}. ${r.erreurs.join(' ')}`, 'alerte-erreur')),
    ajoutees.length && !stocke ? alerte('Stockage local indisponible : enregistré pour cette session seulement. Exporte ta base.', 'alerte-erreur') : null,
    horsParc.length && nomParcActif
      ? alerte(`${horsParc.join(', ')} hors du parc actif « ${nomParcActif} » : coche ce parc dans la fiche (liste des fiches) `
        + 'pour la voir dans les onglets Mur et Data.', 'alerte-info')
      : null);
}

async function enregistrerJson() {
  const texte = $('json-fiche').value.trim();
  const { base, rapport } = importer(ctx.base, texte, ctx.depart, { mode: 'fusionner' });
  if (rapport.erreurs.length) {
    afficherRapport($('rapport-json'), rapport, true);
    return;
  }
  const stocke = rapport.ajoutees.length ? await enregistrer(base) : true;
  if (rapport.ajoutees.length) $('json-fiche').value = '';
  $('enregistrer-json').disabled = true;
  afficherRapport($('rapport-json'), rapport, stocke);
}

// ---------------------------------------------------------------------------
// Consigne pour Claude, export et import
// ---------------------------------------------------------------------------

function afficherConsigne() {
  const type = $('modele-type').value;
  $('consigne-texte').value = `${CONSIGNE_CLAUDE}\n\nModèle :\n${JSON.stringify(MODELES_JSON[type], null, 2)}`;
}

async function copierConsigne() {
  const bouton = $('copier-consigne');
  const texte = $('consigne-texte').value;
  try {
    await navigator.clipboard.writeText(texte);
  } catch (erreur) {
    $('consigne-texte').select();
    document.execCommand('copy');
  }
  bouton.textContent = 'Copié';
  setTimeout(() => { bouton.textContent = 'Copier la consigne et le modèle'; }, 2000);
}

function dateDuJour() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function exporterBase() {
  const tout = $('exporter-tout').checked;
  const { base } = ctx;
  if (!tout && base.fiches.length === 0 && base.parcs.length === 0) {
    remplacer($('rapport-import'), alerte('Ta base est vide : rien à exporter. Coche « Tout exporter » pour la base complète.', 'alerte-info'));
    return;
  }
  const donnees = exporter(base, ctx.depart, { tout });
  const url = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }));
  const lien = el('a', { href: url, download: `mur-led-base-${dateDuJour()}.json` });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  remplacer($('rapport-import'), alerte(`Export : ${pluriel(donnees.fiches.length, 'fiche', 'fiches')}, ${pluriel(donnees.parcs.length, 'parc', 'parcs')}`
    + `${tout ? ', base de départ comprise' : ''}.`, 'alerte-ok'));
}

async function importerFichier() {
  const champ = $('fichier-import');
  const fichier = champ.files[0];
  if (!fichier) return;
  const mode = document.querySelector('input[name="modeImport"]:checked').value;
  if (mode === 'remplacer' && !confirm('Remplacer toute ta base (fiches, versions modifiées, parcs) par ce fichier ? Exporte-la avant si tu veux la garder.')) {
    champ.value = '';
    return;
  }
  const texte = await fichier.text();
  const { base, rapport } = importer(ctx.base, texte, ctx.depart, { mode });
  // Fichier illisible : ma base reste telle quelle, même en mode « remplacer ».
  const stocke = rapport.erreurs.length ? true : await enregistrer(base);
  afficherRapport($('rapport-import'), rapport, stocke, `Import de ${fichier.name}${mode === 'remplacer' && !rapport.erreurs.length ? ' (base remplacée)' : ''}`);
  champ.value = '';
}

// ---------------------------------------------------------------------------

export function actualiserEcranBase(contexte) {
  ctx = contexte;
  afficherEtat();
  afficherParcs();
  afficherFiches();
}

// `enregistrerBase(nouvelle)` enregistre ma base, met à jour tous les onglets et renvoie false si le stockage a échoué.
export function initialiserBase(contexte, enregistrerBase) {
  enregistrer = enregistrerBase;
  $('form-parc').addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const champ = evenement.target.elements.nom;
    const nom = champ.value.trim();
    if (!nom) return;
    champ.value = '';
    enregistrer(creerParc(ctx.base, nom));
  });
  $('filtre-type').addEventListener('change', afficherFiches);
  $('filtre-texte').addEventListener('input', afficherFiches);
  for (const radio of document.querySelectorAll('input[name="modeSaisie"]')) {
    radio.addEventListener('change', () => choisirMode(radio.value));
  }
  $('guidee-type').addEventListener('change', construireGuidee);
  $('preparer-json').addEventListener('click', preparerJson);
  $('json-fiche').addEventListener('input', verifierJson);
  $('enregistrer-json').addEventListener('click', enregistrerJson);
  $('modele-type').addEventListener('change', afficherConsigne);
  $('copier-consigne').addEventListener('click', copierConsigne);
  $('exporter').addEventListener('click', exporterBase);
  $('fichier-import').addEventListener('change', importerFichier);
  actualiserEcranBase(contexte);
  construireGuidee();
  verifierJson();
  afficherConsigne();
}
