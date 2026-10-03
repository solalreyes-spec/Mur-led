// Écran « Mire et fiche contenu » (document du 03/10/2026) : ouvert par le bouton du Mur et par le lien « mire de
// l'appli » du Dépannage, pas par un onglet. Deux parties : la mire (mur entier, par processeur, ou dans le cadre de la
// source) et la fiche contenu (valeurs, consignes sourcées, texte à partager, sans tiret dans le texte fixe). Les
// saisies sont dans le formulaire `form-mire`, gardées avec celles des onglets. Aucun accès au réseau : les données
// viennent de data/fiche-contenu.json, chargé au démarrage, et les calculs de l'appli.

import { el, remplacer, listeNumerotee } from './dom.js';
import { preparerMires, dessinerMire, pngRvb, surfaceCanvasMax, versionAppli } from './mire.js';
import { valeursFiche, texteFicheContenu, nomFichierMire, hauteurTexteMinimale, ratioReduit } from './contenu.js';
import { pitchCalculeMm } from './calculs.js';
import { enregistrer } from './export.js';
import { nombre, nombreCourt } from './format.js';

const NIVEAUX_AFFICHES = { copie: 'copie sur un site tiers', T: 'site tiers' };
const mpx = (n) => `${nombreCourt(n / 1e6, 1)} M px`;

export function monterMireFiche(racine, donnees, {
  contexte, date = new Date(), version = null, surfaceMax = null, enLigne = () => navigator.onLine, ouvrirDepannage = null,
} = {}) {
  const sources = new Map(donnees.sources.map((s) => [s.code, s]));
  const etat = { section: 'mire', version, apercu: null, partage: null };
  // Version écrite sur la mire : celle du cache (versionAppli), sauf si elle est donnée.
  const pret = version === null ? versionAppli().then((v) => { etat.version = v; }) : Promise.resolve();
  racine.classList.add('mf');

  // --- Texte avec renvois et sources ----------------------------------------------------------------------------------
  // Sous chaque ligne, un libellé court sans lien (« Elecom (site tiers) », « Tessera §6.3 ») ; titres complets et liens
  // dans la liste des sources, en bas de chaque partie.
  const texte = (chaine) => chaine.split(/(\{\d+\})/).filter(Boolean)
    .map((m) => (/^\{\d+\}$/.test(m) ? el('sup', { class: 'mf-exposant' }, m.slice(1, -1)) : m));
  function blocSources(liste, balise = 'p') {
    if (!liste?.length) return null;
    const morceaux = [];
    liste.forEach((s, i) => {
      const fiche = sources.get(s.code);
      if (i > 0) morceaux.push(' ; ');
      if (s.renvoi !== undefined && liste.findIndex((x) => x.renvoi === s.renvoi) === i) morceaux.push(el('span', { class: 'mf-source-numero' }, `${s.renvoi} `));
      const niveau = NIVEAUX_AFFICHES[fiche?.niveau];
      morceaux.push(el('span', { class: 'mf-source' }, `${fiche?.court ?? s.code}${s.ref ? ` ${s.ref}` : ''}${niveau ? ` (${niveau})` : ''}`));
    });
    return el(balise, { class: 'mf-sources' }, ...morceaux);
  }
  const listeSources = () => el('section', { class: 'mf-liste-sources' },
    el('h3', { class: 'mf-intertitre' }, 'Sources'),
    el('p', { class: 'mf-note' }, enLigne() ? 'Les liens s\'ouvrent dans le navigateur.' : 'Hors ligne : les liens servent seulement en ligne.'),
    el('ul', { class: 'mf-liste' }, ...donnees.sources.map((s) => el('li', { class: 'mf-source-entree' },
      el('p', { class: 'mf-texte-ligne' }, s.url && enLigne() ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.libelle) : s.libelle),
      el('p', { class: 'mf-note' }, [s.version, donnees.niveaux[s.niveau]].filter(Boolean).join(' · '))))));
  const paragraphe = (x) => [el('p', { class: 'mf-texte-ligne' }, ...texte(x.texte)), blocSources(x.sources)];

  // --- Saisies (formulaire gardé) ------------------------------------------------------------------------------------
  const champ = (id, libelle, ...controles) => el('div', { class: 'champ' }, el('label', { for: id }, libelle), ...controles);
  const cadreOption = (c) => `${c.largeurPx}x${c.hauteurPx}`;
  const formulaire = el('form', { id: 'form-mire', class: 'mf-saisies', novalidate: '' },
    champ('mf-projet', 'Nom du projet (facultatif)', el('input', { id: 'mf-projet', name: 'projet', type: 'text', autocomplete: 'off' })),
    champ('mf-sortie', 'Sortie de la régie', el('select', { id: 'mf-sortie', name: 'sortie' },
      el('option', { value: 'mur' }, 'Résolution du mur'), el('option', { value: 'cadre' }, 'Cadre standard'))),
    el('div', { class: 'mf-cadre' },
      champ('mf-cadre', 'Cadre', el('select', { id: 'mf-cadre', name: 'cadre' },
        ...donnees.saisies.cadres.map((c) => el('option', { value: cadreOption(c) }, `${c.largeurPx} × ${c.hauteurPx}`)))),
      el('div', { class: 'mf-xy' },
        champ('mf-x', 'Position X du mur (px)', el('input', { id: 'mf-x', name: 'cadreX', inputmode: 'numeric', autocomplete: 'off', value: '0' })),
        champ('mf-y', 'Position Y du mur (px)', el('input', { id: 'mf-y', name: 'cadreY', inputmode: 'numeric', autocomplete: 'off', value: '0' })))),
    el('div', { class: 'mf-champs-fiche' },
      champ('mf-distance', 'Distance du spectateur le plus éloigné (m, facultatif)', el('input', { id: 'mf-distance', name: 'distanceM', inputmode: 'decimal', autocomplete: 'off' })),
      champ('mf-cadence', 'Cadence demandée', el('select', { id: 'mf-cadence', name: 'cadenceHz' },
        ...donnees.saisies.cadences.map((c) => el('option', { value: String(c), selected: c === donnees.saisies.cadenceDefaut.valeur ? '' : null },
          `${nombreCourt(c, 2)} Hz${c === donnees.saisies.cadenceDefaut.valeur ? ', par défaut' : ''}`))),
        el('p', { class: 'mf-note' }, el('span', { class: 'dep-badge mf-badge' }, 'à confirmer'), ` ${donnees.saisies.cadenceDefaut.note}`))));
  const lireSaisies = () => {
    const f = new FormData(formulaire);
    const nombreOuNull = (v) => {
      const n = Number(String(v ?? '').replace(',', '.').trim());
      return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
    };
    const [l, h] = String(f.get('cadre') || cadreOption(donnees.saisies.cadres[0])).split('x').map(Number);
    return {
      projet: String(f.get('projet') ?? ''),
      sortie: f.get('sortie') === 'cadre' ? 'cadre' : 'mur',
      cadre: { largeurPx: l, hauteurPx: h, x: Math.round(nombreOuNull(f.get('cadreX')) ?? 0), y: Math.round(nombreOuNull(f.get('cadreY')) ?? 0) },
      distanceM: nombreOuNull(f.get('distanceM')),
      cadenceHz: nombreOuNull(f.get('cadenceHz')) ?? donnees.saisies.cadenceDefaut.valeur,
    };
  };

  // --- Contenu -------------------------------------------------------------------------------------------------------
  const onglets = el('div', { class: 'mf-onglets', role: 'group', 'aria-label': 'Partie' },
    el('button', { type: 'button', class: 'bouton', 'data-section': 'mire' }, 'Mire'),
    el('button', { type: 'button', class: 'bouton', 'data-section': 'fiche' }, 'Fiche contenu'));
  const zoneMire = el('div', { class: 'mf-mire' });
  const zoneFiche = el('div', { class: 'mf-fiche' });
  remplacer(racine, onglets, formulaire, zoneMire, zoneFiche);

  const calcul = () => {
    const c = contexte?.();
    if (!c?.mur || !c?.variante) return null;
    const s = lireSaisies();
    const mires = preparerMires({
      ...c, projet: s.projet, date: dateTexte(), version: etat.version,
      cadre: s.sortie === 'cadre' ? s.cadre : null, surfaceMax: surfaceMax ?? surfaceCanvasMax(),
    });
    return { c, s, mires };
  };
  const dateTexte = () => `${date.getDate()} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][date.getMonth()]} ${date.getFullYear()}`;

  function dessinerMireSection(r) {
    if (!r) {
      remplacer(zoneMire, el('div', { class: 'alerte' }, 'Calcule un mur dans l\'onglet Mur et choisis un processeur dans Data : la mire reprend leur câblage.'));
      return;
    }
    const { c, s, mires } = r;
    const famille = c.evaluation?.processeur?.famille;
    const modele = c.evaluation?.processeur?.modele ?? '';
    const notes = [];
    const tailles = [mires.mur, ...mires.processeurs].filter((m) => m.possible);
    if (famille === 'brompton' && tailles.some((m) => m.largeur > donnees.limites.frameStore.cotePx || m.hauteur > donnees.limites.frameStore.cotePx)) {
      notes.push(el('div', { class: 'alerte' }, ...paragraphe(donnees.limites.frameStore)));
    }
    if (/^(SX40|S8)$/.test(modele)) notes.push(el('div', { class: 'alerte alerte-info' }, ...paragraphe(donnees.limites.canevasTessera)));
    const cote = Math.round(Math.sqrt(mires.limite));
    const boutons = [
      mires.mur.possible
        ? el('button', { type: 'button', class: 'bouton mf-generer', 'data-mire': 'mur' }, `Mire du mur, ${mires.mur.largeur} × ${mires.mur.hauteur} px`)
        : el('div', { class: 'alerte', role: 'status' }, mires.mur.message),
      ...mires.processeurs.map((p) => (p.possible
        ? el('button', { type: 'button', class: 'bouton mf-generer', 'data-mire': `p${p.numero}` }, `Processeur ${p.numero}, ${p.modele}, ${p.largeur} × ${p.hauteur} px`)
        : el('div', { class: 'alerte', role: 'status' }, p.message))),
    ];
    remplacer(zoneMire,
      el('div', { class: 'mf-bloc' }, ...paragraphe(donnees.intro.mire)),
      s.sortie === 'cadre' ? el('div', { class: 'mf-bloc' }, ...paragraphe(donnees.limites.cadreSource)) : null,
      el('h3', { class: 'mf-intertitre' }, 'Générer la mire'),
      el('div', { class: 'mf-boutons' }, ...boutons),
      el('p', { class: 'mf-note' }, `Limite mesurée sur cet appareil : ${mpx(mires.limite)} (${nombre(cote)} × ${nombre(cote)} px).`),
      blocSources(donnees.limites.canvasSafari.sources),
      ...notes,
      el('div', { class: 'mf-apercu', 'aria-live': 'polite' }, etat.apercu ? apercu(etat.apercu) : null),
      el('h3', { class: 'mf-intertitre' }, 'Mode d\'emploi'),
      listeNumerotee({ class: 'mf-liste' }, donnees.modeEmploi.map((x, i) => ({ numero: i + 1, contenu: paragraphe(x) }))),
      el('h3', { class: 'mf-intertitre' }, 'Lire la mire'),
      el('ul', { class: 'mf-lecture' }, ...donnees.lireLaMire.map((x) => el('li', { class: 'mf-carte' },
        el('p', { class: 'mf-texte-ligne' }, el('strong', {}, x.vu), ` : ${x.cause}.`),
        blocSources(x.sources),
        el('div', { class: 'mf-renvois' }, ...x.depannage.map((id) => el('button', { type: 'button', class: 'bouton mf-depannage', 'data-noeud': id }, `Dépannage ${id}`)))))),
      el('h3', { class: 'mf-intertitre' }, 'Ce que la mire ne remplace pas'),
      el('ul', { class: 'mf-liste' }, ...donnees.neRemplacePas.map((x) => el('li', {}, ...paragraphe(x)))),
      el('div', { class: 'mf-bloc' }, ...paragraphe(donnees.limites.fichier)),
      listeSources());
  }

  const apercu = (a) => el('figure', { class: 'mf-figure' },
    el('img', { src: a.url, alt: `Mire ${a.nom}` }),
    el('figcaption', {}, `${a.nom}, ${a.largeur} × ${a.hauteur} px`),
    el('button', { type: 'button', class: 'bouton mf-enregistrer' }, 'Enregistrer la mire'));

  function dessinerFiche(r) {
    if (!r) {
      remplacer(zoneFiche, el('div', { class: 'alerte' }, 'Calcule un mur dans l\'onglet Mur et choisis un processeur dans Data : la fiche reprend leurs résultats.'));
      return;
    }
    const { c, s, mires } = r;
    const pas = pitchCalculeMm(c.dalle);
    const v = valeursFiche({ ...c, pasMm: pas, saisies: s, date, nomMire: mires.mur.nom });
    const ratio = ratioReduit(c.mur.pxLargeur, c.mur.pxHauteur);
    const texteMin = hauteurTexteMinimale(s.distanceM, pas);
    const ligne = (titre, ...valeur) => [el('dt', {}, titre), el('dd', {}, ...valeur)];
    const groupes = c.evaluation?.groupes ?? [];
    etat.texte = texteFicheContenu(v, donnees.texte);
    remplacer(zoneFiche,
      el('div', { class: 'mf-bloc' }, ...paragraphe(donnees.intro.fiche)),
      el('dl', { class: 'mf-valeurs' },
        ...ligne('Projet, date', `${s.projet.trim() || 'Sans nom'}, ${v.date}`),
        ...ligne('Mur', `${v.largeurM} m × ${v.hauteurM} m ; ${v.colonnes} × ${v.lignes} dalles ; ${v.modele} ; pas ${v.pas} mm`),
        ...ligne('Résolution', `${v.largeurPx} × ${v.hauteurPx} px ; ${v.totalPx} px au total`, blocSources(donnees.resolution.sources, 'span')),
        ...ligne('Ratio', ratio?.texte ?? 'non calculé'),
        ...(groupes.length > 1 ? ligne('Zones par processeur', el('ul', { class: 'mf-zones' }, ...groupes.map((g, i) => el('li', { class: 'mf-zone' },
          `Processeur ${i + 1}, ${c.evaluation.processeur.modele} : x ${g.x[0]}, y ${g.y[0]}, ${g.largeurPx} × ${g.hauteurPx} px`)))) : []),
        ...ligne('Sortie demandée à la régie', `${v.sortie} à ${v.cadence} Hz, balayage progressif`, blocSources(donnees.sortie.sources, 'span')),
        ...(v.reculMin !== null ? ligne('Recul', `minimal environ ${v.reculMin} m, confortable environ ${v.reculConfort} m`,
          el('span', { class: 'mf-note mf-bloc-note' }, donnees.recul.texte), blocSources(donnees.recul.sources, 'span')) : []),
        ...(texteMin ? ligne('Hauteur de texte minimale', `${texteMin.px} px (${nombreCourt(texteMin.mm, 1)} mm) pour un public jusqu'à ${nombreCourt(s.distanceM, 1)} m`,
          el('span', { class: 'mf-note mf-bloc-note' }, donnees.hauteurTexte.texte), blocSources(donnees.hauteurTexte.sources, 'span')) : [])),
      el('h3', { class: 'mf-intertitre' }, 'Consignes'),
      listeNumerotee({ class: 'mf-consignes' }, donnees.consignes.map((x) => ({
        numero: x.numero,
        contenu: [el('p', { class: 'mf-texte-ligne' }, el('strong', {}, x.titre), ' : ', ...texte(x.texte)), blocSources(x.sources)],
      }))),
      el('h3', { class: 'mf-intertitre' }, 'Texte à envoyer'),
      el('pre', { class: 'mf-texte' }, etat.texte),
      el('div', { class: 'mf-boutons' },
        el('button', { type: 'button', class: 'bouton mf-copier' }, 'Copier le texte'),
        el('button', { type: 'button', class: 'bouton mf-partager' }, etat.partage ? 'Partager le texte et la mire' : 'Préparer le partage (texte et mire)')),
      el('p', { class: 'mf-note mf-etat', 'aria-live': 'polite' }),
      listeSources());
  }

  function dessiner() {
    racine.dataset.section = etat.section;
    onglets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.section === etat.section)));
    const r = calcul();
    formulaire.querySelector('.mf-cadre').hidden = lireSaisies().sortie !== 'cadre';
    formulaire.querySelector('.mf-champs-fiche').hidden = etat.section !== 'fiche';
    zoneMire.hidden = etat.section !== 'mire';
    zoneFiche.hidden = etat.section !== 'fiche';
    if (etat.section === 'mire') dessinerMireSection(r);
    else dessinerFiche(r);
  }

  // Génère une mire (« mur » ou « p2 ») : plan, dessin, PNG RVB ; l'aperçu reste affiché.
  async function generer(quoi) {
    const r = calcul();
    const m = quoi === 'mur' ? r?.mires.mur : r?.mires.processeurs.find((p) => `p${p.numero}` === quoi);
    if (!m?.plan) return null;
    const blob = await pngRvb(dessinerMire(m.plan));
    if (etat.apercu?.url) URL.revokeObjectURL(etat.apercu.url);
    etat.apercu = { blob, url: URL.createObjectURL(blob), nom: m.nom, largeur: m.largeur, hauteur: m.hauteur };
    if (etat.section === 'mire') remplacer(zoneMire.querySelector('.mf-apercu'), apercu(etat.apercu));
    return etat.apercu;
  }

  async function copier(chaine) {
    try {
      await navigator.clipboard.writeText(chaine);
      return true;
    } catch (erreur) {
      const zone = el('textarea', { readonly: '', style: 'position:fixed;opacity:0' });
      zone.value = chaine;
      document.body.append(zone);
      zone.select();
      const ok = document.execCommand?.('copy') ?? false;
      zone.remove();
      return ok;
    }
  }
  const etatTexte = (message) => {
    const zone = zoneFiche.querySelector('.mf-etat');
    if (zone) zone.textContent = message;
  };

  // Partage : la mire se prépare au premier appui (Safari n'ouvre la feuille de partage que sur un appui direct), puis
  // texte et mire partent ensemble au second ; sans partage de fichiers, la mire se télécharge et le texte se copie.
  async function partager() {
    if (!etat.partage) {
      const r = calcul();
      const quoi = r?.mires.mur.possible ? 'mur' : `p${r?.mires.processeurs.find((p) => p.possible)?.numero}`;
      const a = await generer(quoi);
      if (!a) return;
      etat.partage = a;
      const bouton = zoneFiche.querySelector('.mf-partager');
      if (bouton) bouton.textContent = 'Partager le texte et la mire';
      etatTexte(`Mire prête : ${a.nom}. Appuie de nouveau pour partager.`);
      return;
    }
    const fichier = new File([etat.partage.blob], etat.partage.nom, { type: 'image/png' });
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], text: etat.texte, title: 'Fiche contenu' });
        etatTexte('Partagé.');
      } catch (erreur) {
        if (erreur?.name !== 'AbortError') etatTexte('Partage impossible : copie le texte et enregistre la mire.');
      }
      return;
    }
    await enregistrer(etat.partage.blob, etat.partage.nom);
    etatTexte((await copier(etat.texte)) ? 'Mire téléchargée, texte copié.' : 'Mire téléchargée ; copie le texte à la main.');
  }

  racine.addEventListener('click', async (evenement) => {
    const b = evenement.target.closest('button');
    if (!b || !racine.contains(b)) return;
    if (b.dataset.section) {
      etat.section = b.dataset.section;
      dessiner();
    } else if (b.matches('.mf-generer')) {
      b.disabled = true;
      try {
        await generer(b.dataset.mire);
      } finally {
        b.disabled = false;
      }
    } else if (b.matches('.mf-enregistrer') && etat.apercu) {
      await enregistrer(etat.apercu.blob, etat.apercu.nom);
    } else if (b.matches('.mf-depannage')) {
      ouvrirDepannage?.(b.dataset.noeud);
    } else if (b.matches('.mf-copier')) {
      etatTexte((await copier(etat.texte)) ? 'Texte copié.' : 'Copie impossible : sélectionne le texte.');
    } else if (b.matches('.mf-partager')) {
      await partager();
    }
  });
  formulaire.addEventListener('input', () => {
    etat.partage = null;
    dessiner();
  });
  formulaire.addEventListener('change', () => {
    etat.partage = null;
    dessiner();
  });
  formulaire.addEventListener('submit', (e) => e.preventDefault());

  dessiner();
  return {
    afficher(section = etat.section) {
      etat.section = section === 'fiche' ? 'fiche' : 'mire';
      dessiner();
    },
    actualiser: () => dessiner(),
    definirVersion(v) {
      etat.version = v;
    },
    pret,
    version: () => etat.version,
    generer,
    texte: () => {
      if (etat.texte === undefined) {
        const avant = etat.section;
        etat.section = 'fiche';
        dessiner();
        etat.section = avant;
        dessiner();
      }
      return etat.texte;
    },
    nomFichier: (s) => nomFichierMire(s),
  };
}
