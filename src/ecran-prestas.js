// Écran plein « Prestas » (étape 10b, refait à l'étape 11b) et bouton « Presta · Mur » de l'en-tête. L'écran affiche
// l'état des prestas (prestas.js) et appelle les actions de l'appli ; il ne touche ni au stockage ni aux saisies. Il ne
// se redessine que par `afficher` : les formulaires « Modifier » et « Renommer » et les menus « ⋯ » s'ouvrent et se
// ferment sur place. Un appui sur la carte d'un mur ou d'une presta l'ouvre ; les actions rares sont dans les menus.

import { el, remplacer } from './dom.js';
import { listePrestas, texteDates, prestaOuverte, LIMITES, nomFichierPresta, texteRapportImport } from './prestas.js';

const deux = (n) => String(n).padStart(2, '0');
const jourLocal = (iso) => {
  const d = new Date(iso);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const nombreMurs = (n) => `${n} mur${n > 1 ? 's' : ''}`;
const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim(), role: genre === 'alerte-erreur' ? 'alert' : null }, texte);
const CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>';

// Fichier d'une presta exportée (prestas.js, exporterPresta) : JSON lisible, « mur-led-presta-<nom>-<date>.json ».
export function fichierExportPresta(donnees, maintenant = new Date()) {
  return new File([JSON.stringify(donnees, null, 2)], nomFichierPresta(donnees.presta.nom, maintenant), { type: 'application/json' });
}
const NOTES_EXPORT = {
  telechargement: 'Fichier enregistré dans Fichiers (Téléchargements) : envoie-le par AirDrop, Messages ou Mail.',
  partage: 'Presta exportée.',
  annule: '',
};

// Bouton de l'en-tête, en fil d'Ariane (étape 11d) : « ● Presta › Mur » sur une ligne, chaque nom coupé par « … » s'il ne
// tient pas ; nom entier pour les lecteurs d'écran.
export function remplirBoutonPresta(bouton, { presta, mur }) {
  const fleche = el('span', { class: 'bp-fleche' });
  fleche.innerHTML = CHEVRON;
  remplacer(bouton,
    el('span', { class: 'bp-pastille', 'aria-hidden': 'true' }),
    el('span', { class: 'bp-presta' }, presta?.nom ?? ''),
    el('span', { class: 'bp-sep', 'aria-hidden': 'true' }, '›'),
    el('span', { class: 'bp-mur' }, mur?.nom ?? ''),
    fleche);
  bouton.setAttribute('aria-label', `Prestas : ${presta?.nom ?? ''}, ${mur?.nom ?? ''}`);
}

// `actions` : ouvrir(prestaId, murId?), creerPresta(), modifierPresta(id, infos), ajouterMur(id), renommerMur(id, murId,
// nom), dupliquerMur(id, murId), supprimerMur(id, murId), dupliquerPresta(id), archiverPresta(id, archivee),
// supprimerPresta(id) ; exporter(id) (renvoie 'partage', 'annule' ou 'telechargement'), verifierImport(texte) et
// importer(texte, choix) (renvoie le rapport) ; chacune peut lever une erreur, affichée dans l'écran.
// `resumeMur(mur)` : ligne sous le nom.
export function monterPrestas(racine, { actions, resumeMur = () => '', proportionsMur = () => null, confirmer = (texte) => window.confirm(texte) }) {
  let etat = null;
  let persistant = null;
  // Note du dernier export, import en cours ({ texte, analyse }), rapport ou erreur d'import : gardés d'un dessin à
  // l'autre, effacés à la prochaine action et à l'ouverture de l'écran.
  let noteExport = '';
  let importEnCours = null;
  let rapportImport = null;
  let erreurImport = null;
  const zoneErreur = el('div', { class: 'pr-erreur', 'aria-live': 'polite' });
  const champFichier = el('input', { type: 'file', class: 'pr-fichier-import', hidden: '' });
  // Menus « ⋯ » (11b) : un seul ouvert à la fois, sous sa carte ; « ⋯ » de nouveau ou Échap le referme.
  let menuOuvert = null;
  let numeroMenu = 0;
  const fermerMenu = () => {
    if (!menuOuvert) return;
    menuOuvert.menu.hidden = true;
    menuOuvert.bouton.setAttribute('aria-expanded', 'false');
    menuOuvert = null;
  };
  const menu = (bouton, ...elements) => {
    numeroMenu += 1;
    const id = `pr-menu-${numeroMenu}`;
    const liste = el('div', { class: 'pr-menu', id, hidden: '' }, ...elements);
    bouton.setAttribute('aria-expanded', 'false');
    bouton.setAttribute('aria-controls', id);
    bouton.addEventListener('click', () => {
      const ouvrir = menuOuvert?.menu !== liste;
      fermerMenu();
      if (!ouvrir) return;
      liste.hidden = false;
      bouton.setAttribute('aria-expanded', 'true');
      menuOuvert = { menu: liste, bouton };
    });
    return liste;
  };
  // Échap ferme d'abord le menu ouvert, sans fermer l'écran (l'appli écoute Échap sur le document).
  window.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Escape' || !menuOuvert || !racine.isConnected || racine.closest('[hidden]')) return;
    fermerMenu();
    evenement.stopPropagation();
  }, true);
  const fleche = () => {
    const f = el('span', { class: 'pr-fleche', 'aria-hidden': 'true' });
    f.innerHTML = CHEVRON;
    return f;
  };

  async function executer(appel, zone = zoneErreur) {
    remplacer(zone);
    noteExport = '';
    racine.querySelector('.pr-note-export')?.replaceChildren();
    try {
      await appel();
      return true;
    } catch (erreur) {
      remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
      return false;
    }
  }

  // Un bouton ne relance pas son action tant que la précédente n'est pas finie (double appui : une seule presta créée,
  // un seul import).
  const bouton = (texte, surClic, attributs = {}) => {
    const b = el('button', { type: 'button', class: 'bouton', ...attributs }, texte);
    b.addEventListener('click', async () => {
      if (b.closest('.pr-menu')) fermerMenu();
      if (b.dataset.occupe) return;
      b.dataset.occupe = '1';
      b.setAttribute('aria-busy', 'true');
      try {
        await surClic();
      } finally {
        delete b.dataset.occupe;
        b.removeAttribute('aria-busy');
      }
    });
    return b;
  };

  function formulairePresta(presta, conteneur) {
    const champ = (nom, libelle, controle) => el('label', { class: 'pr-champ' }, el('span', {}, libelle), controle);
    const form = el('form', { class: 'pr-formulaire', novalidate: '' },
      champ('nom', 'Nom', el('input', { name: 'nom', type: 'text', maxlength: String(LIMITES.nomPresta), autocomplete: 'off' })),
      el('div', { class: 'pr-dates' },
        champ('debut', 'Début', el('input', { name: 'debut', type: 'date' })),
        champ('fin', 'Fin', el('input', { name: 'fin', type: 'date' }))),
      champ('lieu', 'Lieu', el('input', { name: 'lieu', type: 'text', maxlength: String(LIMITES.lieu), autocomplete: 'off' })),
      champ('notes', 'Notes', el('textarea', { name: 'notes', rows: '3', maxlength: String(LIMITES.notes) })),
      el('div', { class: 'pr-erreur-formulaire' }),
      el('div', { class: 'pr-boutons' },
        el('button', { type: 'submit', class: 'bouton bouton-principal', 'data-icone': 'enregistrer' }, 'Enregistrer'),
        bouton('Annuler', () => form.remove(), { class: 'bouton bouton-discret' })));
    form.elements.nom.value = presta.nom;
    form.elements.debut.value = presta.debut ?? '';
    form.elements.fin.value = presta.fin ?? '';
    form.elements.lieu.value = presta.lieu ?? '';
    form.elements.notes.value = presta.notes ?? '';
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      const e = form.elements;
      const infos = { nom: e.nom.value, debut: e.debut.value || null, fin: e.fin.value || null, lieu: e.lieu.value, notes: e.notes.value };
      if (await executer(() => actions.modifierPresta(presta.id, infos), form.querySelector('.pr-erreur-formulaire'))) form.remove();
    });
    // Sous les infos de la presta, avant ses murs : visible tout de suite.
    conteneur.querySelector('.pr-murs').before(form);
    form.scrollIntoView?.({ block: 'nearest' });
    form.elements.nom.focus();
  }

  function formulaireRenommer(presta, mur, ligne) {
    ligne.querySelector('.pr-renommer')?.remove();
    const form = el('form', { class: 'pr-renommer', novalidate: '' },
      el('label', { class: 'pr-champ' }, el('span', {}, 'Nouveau nom'),
        el('input', { name: 'nom', type: 'text', maxlength: String(LIMITES.nomMur), autocomplete: 'off' })),
      el('div', { class: 'pr-erreur-formulaire' }),
      el('div', { class: 'pr-boutons' },
        el('button', { type: 'submit', class: 'bouton bouton-principal', 'data-icone': 'enregistrer' }, 'Enregistrer'),
        bouton('Annuler', () => form.remove(), { class: 'bouton bouton-discret' })));
    form.elements.nom.value = mur.nom;
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      if (await executer(() => actions.renommerMur(presta.id, mur.id, form.elements.nom.value), form.querySelector('.pr-erreur-formulaire'))) form.remove();
    });
    ligne.append(form);
    form.elements.nom.focus();
  }

  // Carte d'un mur : un bouton couvre la carte et l'ouvre (le mur ouvert porte la puce « Ouvert », sans flèche) ; à
  // droite, « ⋯ » ouvre son menu sous la carte.
  function ligneMur(presta, mur) {
    const ouvert = etat.index.ouverte?.mur === mur.id;
    // Mini-aperçu (11d) : vignette aux proportions du mur lues dans ses saisies, sans calcul.
    const p = proportionsMur({ id: mur.id, nom: mur.nom, ...etat.murs[mur.id] });
    const contenu = [
      p ? el('span', { class: 'pr-vignette', 'aria-hidden': 'true', style: `--rapport: ${p.largeur / p.hauteur}` }) : null,
      el('span', { class: 'pr-mur-textes' },
        el('span', { class: 'pr-mur-nom' }, mur.nom),
        el('span', { class: 'pr-mur-resume' }, resumeMur({ id: mur.id, nom: mur.nom, ...etat.murs[mur.id] }))),
      ouvert ? el('span', { class: 'pr-puce-ouvert' }, 'Ouvert') : fleche(),
    ];
    const tete = ouvert ? el('div', { class: 'pr-mur-tete' }, ...contenu)
      : bouton(contenu, () => executer(() => actions.ouvrir(presta.id, mur.id)), { class: 'pr-mur-tete pr-mur-ouvrir' });
    const plus = el('button', { type: 'button', class: 'bouton bouton-icone pr-menu-bouton', 'aria-label': `Actions de ${mur.nom}` },
      el('span', { 'aria-hidden': 'true' }, '⋯'));
    const ligne = el('li', { class: 'pr-mur', 'aria-current': ouvert ? 'true' : null }, el('div', { class: 'pr-mur-carte' }, tete, plus));
    ligne.append(menu(plus,
      el('div', { class: 'pr-boutons' },
        bouton('Renommer', () => formulaireRenommer(presta, mur, ligne), { 'data-icone': 'modifier' }),
        bouton('Dupliquer', () => executer(() => actions.dupliquerMur(presta.id, mur.id)), { 'data-icone': 'dupliquer' })),
      el('div', { class: 'pr-boutons pr-boutons-danger' },
        bouton('Supprimer', () => {
          if (confirmer(`Supprimer ${mur.nom} et ses saisies ?`)) executer(() => actions.supprimerMur(presta.id, mur.id));
        }, { class: 'bouton bouton-danger' }))));
    return ligne;
  }

  // Autre presta ou presta archivée : une carte-bouton qui l'ouvre.
  function lignePresta(p) {
    const infos = [texteDates(p.debut, p.fin), p.lieu, nombreMurs(p.murs.length)].filter(Boolean).join(' · ');
    return el('li', { class: 'pr-presta' },
      bouton([el('span', { class: 'pr-presta-tete' }, el('span', { class: 'pr-nom' }, p.nom), el('span', { class: 'pr-infos' }, infos)), fleche()],
        () => executer(() => actions.ouvrir(p.id)), { class: 'pr-presta-ouvrir' }));
  }

  function dessiner() {
    const p = prestaOuverte(etat);
    const { actives, archivees } = listePrestas(etat);
    // Dates et lieu en puces ; le séparateur « · » reste dans le texte lu (lecteurs d'écran, copie).
    const puces = [texteDates(p.debut, p.fin), p.lieu].filter(Boolean)
      .flatMap((x, i) => [i ? el('span', { class: 'cache-visuel' }, ' · ') : null, el('span', { class: 'pr-puce' }, x)]);
    menuOuvert = null;
    const plus = el('button', { type: 'button', class: 'bouton pr-plus', 'data-icone': 'menu' }, 'Plus');
    const ouverte = el('section', { class: 'pr-ouverte', 'aria-labelledby': 'pr-titre-ouverte' },
      el('p', { class: 'pr-sur-titre', id: 'pr-titre-ouverte' }, 'Presta ouverte'),
      el('h3', { class: 'pr-nom' }, p.nom),
      puces.length ? el('p', { class: 'pr-infos' }, ...puces) : null,
      el('p', { class: `pr-export ${p.exporteeLe ? 'pr-export-faite' : 'pr-export-jamais'}` }, p.exporteeLe ? `Exportée le ${jourLocal(p.exporteeLe)}` : 'Jamais exportée'),
      p.notes ? el('p', { class: 'pr-notes' }, p.notes) : null,
      p.archivee ? el('p', { class: 'pr-statut' }, 'Archivée : elle reste dans « Archivées » une fois fermée.') : null,
      el('ul', { class: 'pr-murs', role: 'list' }, p.murs.map((m) => ligneMur(p, m))),
      el('div', { class: 'pr-actions-presta' },
        bouton('Ajouter un mur', () => executer(() => actions.ajouterMur(p.id)), { class: 'bouton pr-ajouter-mur', 'data-icone': 'ajouter' }),
        el('div', { class: 'pr-export-bloc' },
          bouton('Exporter', () => executer(async () => {
            const mode = await actions.exporter(p.id);
            noteExport = NOTES_EXPORT[mode] ?? '';
            const zone = racine.querySelector('.pr-note-export');
            if (zone) zone.textContent = noteExport;
          }), { 'data-icone': 'partager' }),
          plus,
          el('p', { class: 'pr-note-export', 'aria-live': 'polite' }, noteExport))));
    ouverte.append(menu(plus,
      el('div', { class: 'pr-boutons' },
        bouton('Modifier', () => {
          if (!ouverte.querySelector('.pr-formulaire')) formulairePresta(p, ouverte);
        }, { 'data-icone': 'modifier' }),
        bouton('Dupliquer', () => executer(() => actions.dupliquerPresta(p.id)), { 'data-icone': 'dupliquer' }),
        bouton(p.archivee ? 'Désarchiver' : 'Archiver', () => executer(() => actions.archiverPresta(p.id, !p.archivee)), { 'data-icone': 'archiver' })),
      el('div', { class: 'pr-boutons pr-boutons-danger' },
        bouton('Supprimer la presta', () => {
          if (confirmer(`Supprimer ${p.nom} et ${p.murs.length > 1 ? `ses ${p.murs.length} murs` : 'son mur'} ? Exporte-la avant si tu veux la garder.`)) {
            executer(() => actions.supprimerPresta(p.id));
          }
        }, { class: 'bouton bouton-danger' }))));
    ouverte.lastChild.classList.add('pr-menu-presta');
    const autres = actives.filter((x) => x.id !== p.id);
    const rangees = archivees.filter((x) => x.id !== p.id);
    remplacer(racine,
      zoneErreur,
      ouverte,
      persistant === false ? alerte('Exporte tes prestas avant de partir : sans stockage persistant, le navigateur peut vider l\'appli.', 'alerte-info') : null,
      autres.length ? el('section', { class: 'pr-autres', 'aria-labelledby': 'pr-titre-autres' },
        el('h3', { id: 'pr-titre-autres' }, 'Autres prestas'),
        el('ul', { class: 'pr-liste', role: 'list' }, autres.map(lignePresta))) : null,
      rangees.length ? el('details', { class: 'pr-archivees' },
        el('summary', {}, `Archivées (${rangees.length})`),
        el('ul', { class: 'pr-liste', role: 'list' }, rangees.map(lignePresta))) : null,
      el('div', { class: 'pr-boutons pr-bas' },
        bouton('Nouvelle presta', () => executer(() => actions.creerPresta()), { class: 'bouton bouton-principal pr-nouvelle', 'data-icone': 'ajouter' }),
        bouton('Importer une presta', () => champFichier.click(), { 'data-icone': 'importer' })),
      champFichier,
      zoneImport());
  }

  // Import : choix (presta déjà là, fiches ou parcs différents des miens), puis rapport ; ou la raison du refus.
  function zoneImport() {
    const zone = el('div', { class: 'pr-import', 'aria-live': 'polite' });
    if (erreurImport) zone.append(alerte(erreurImport, 'alerte-erreur'));
    if (rapportImport) zone.append(el('div', { class: 'alerte alerte-ok' }, el('ul', { class: 'pr-rapport', role: 'list' }, rapportImport.map((l) => el('li', {}, l)))));
    if (importEnCours) zone.append(panneauImport());
    return zone;
  }

  function panneauImport() {
    const { texte, analyse } = importEnCours;
    const { donnees, prestaExiste, conflits } = analyse;
    const choix = (nom, legende, options) => el('fieldset', { class: 'pr-choix' }, el('legend', {}, legende),
      options.map(([valeur, libelle], i) => el('label', {}, el('input', { type: 'radio', name: nom, value: valeur, checked: i === 0 ? '' : null }), el('span', {}, libelle))));
    const differents = [conflits.fiches.length ? `fiches ${conflits.fiches.join(', ')}` : null, conflits.parcs.length ? `parcs ${conflits.parcs.join(', ')}` : null].filter(Boolean).join(' ; ');
    const panneau = el('section', { class: 'pr-import-choix' },
      el('h3', { class: 'pr-import-titre' }, `Importer «\u00a0${donnees.presta.nom}\u00a0» (${nombreMurs(donnees.murs.length)})`),
      prestaExiste ? choix('choixPresta', 'Cette presta est déjà sur l\'appareil.', [
        ['deux', 'Garder les deux : la reçue prend «\u00a0(reçue le …)\u00a0»'], ['remplacer', 'Remplacer la mienne']]) : null,
      differents ? choix('choixConflits', `Différents des tiens : ${differents}.`, [
        ['garder', 'Garder les miens'], ['prendre', 'Prendre ceux du fichier']]) : null,
      el('div', { class: 'pr-boutons' },
        bouton('Importer', async () => {
          const valeur = (nom, defaut) => panneau.querySelector(`input[name="${nom}"]:checked`)?.value ?? defaut;
          const c = { presta: valeur('choixPresta', 'deux'), conflits: valeur('choixConflits', 'garder') };
          if (c.presta === 'remplacer' && !confirmer(`Remplacer ta presta « ${donnees.presta.nom} » et ses murs par celle du fichier ?`)) return;
          if (c.conflits === 'prendre' && !confirmer(`Remplacer tes versions (${differents}) par celles du fichier ?`)) return;
          try {
            const rapport = await actions.importer(texte, c);
            importEnCours = null;
            rapportImport = texteRapportImport(rapport);
          } catch (erreur) {
            importEnCours = null;
            erreurImport = erreur.message;
          }
          dessiner();
          racine.querySelector('.pr-import')?.scrollIntoView?.({ block: 'nearest' });
        }, { class: 'bouton bouton-principal', 'data-icone': 'importer' }),
        bouton('Annuler', () => {
          importEnCours = null;
          dessiner();
        }, { class: 'bouton bouton-discret' })));
    return panneau;
  }

  champFichier.addEventListener('change', async () => {
    const fichier = champFichier.files?.[0];
    champFichier.value = '';
    if (!fichier) return;
    importEnCours = null;
    rapportImport = null;
    erreurImport = null;
    try {
      const texte = await fichier.text();
      const analyse = await actions.verifierImport(texte);
      if (analyse.erreurs.length) erreurImport = analyse.erreurs[0];
      else importEnCours = { texte, analyse };
    } catch (erreur) {
      erreurImport = erreur.message;
    }
    dessiner();
    racine.querySelector('.pr-import')?.scrollIntoView?.({ block: 'nearest' });
  });

  return {
    // `ouverture` : écran rouvert, note d'export, import et rapport effacés.
    afficher(nouvelEtat, { persistant: p = persistant, ouverture = false } = {}) {
      etat = nouvelEtat;
      persistant = p;
      if (ouverture) {
        noteExport = '';
        importEnCours = null;
        rapportImport = null;
        erreurImport = null;
      }
      dessiner();
    },
  };
}
