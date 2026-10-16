// Écran plein « Prestas » (étape 10b) et bouton « Presta · Mur » de l'en-tête. L'écran affiche l'état des prestas
// (prestas.js) et appelle les actions de l'appli ; il ne touche ni au stockage ni aux saisies. Il ne se redessine que
// par `afficher` : les formulaires « Modifier » et « Renommer » s'ouvrent et se ferment sur place.

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

// Bouton de l'en-tête : nom de la presta puis nom du mur, chacun sur une ligne coupée par « … » ; nom entier pour les
// lecteurs d'écran.
export function remplirBoutonPresta(bouton, { presta, mur }) {
  const fleche = el('span', { class: 'bp-fleche' });
  fleche.innerHTML = CHEVRON;
  remplacer(bouton,
    el('span', { class: 'bp-lignes' }, el('span', { class: 'bp-presta' }, presta?.nom ?? ''), el('span', { class: 'bp-mur' }, mur?.nom ?? '')),
    fleche);
  bouton.setAttribute('aria-label', `Prestas : ${presta?.nom ?? ''}, ${mur?.nom ?? ''}`);
}

// `actions` : ouvrir(prestaId, murId?), creerPresta(), modifierPresta(id, infos), ajouterMur(id), renommerMur(id, murId,
// nom), dupliquerMur(id, murId), supprimerMur(id, murId), dupliquerPresta(id), archiverPresta(id, archivee),
// supprimerPresta(id) ; exporter(id) (renvoie 'partage', 'annule' ou 'telechargement'), verifierImport(texte) et
// importer(texte, choix) (renvoie le rapport) ; chacune peut lever une erreur, affichée dans l'écran.
// `resumeMur(mur)` : ligne sous le nom.
export function monterPrestas(racine, { actions, resumeMur = () => '', confirmer = (texte) => window.confirm(texte) }) {
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
        el('button', { type: 'submit', class: 'bouton bouton-principal' }, 'Enregistrer'),
        bouton('Annuler', () => form.remove())));
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
        el('button', { type: 'submit', class: 'bouton bouton-principal' }, 'Enregistrer'),
        bouton('Annuler', () => form.remove())));
    form.elements.nom.value = mur.nom;
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      if (await executer(() => actions.renommerMur(presta.id, mur.id, form.elements.nom.value), form.querySelector('.pr-erreur-formulaire'))) form.remove();
    });
    ligne.append(form);
    form.elements.nom.focus();
  }

  function ligneMur(presta, mur) {
    const ouvert = etat.index.ouverte?.mur === mur.id;
    const ligne = el('li', { class: 'pr-mur', 'aria-current': ouvert ? 'true' : null },
      el('div', { class: 'pr-mur-tete' },
        el('span', { class: 'pr-mur-nom' }, mur.nom),
        el('span', { class: 'pr-mur-resume' }, resumeMur({ id: mur.id, nom: mur.nom, ...etat.murs[mur.id] }))));
    ligne.append(el('div', { class: 'pr-boutons' },
      ouvert ? null : bouton('Ouvrir', () => executer(() => actions.ouvrir(presta.id, mur.id))),
      bouton('Renommer', () => formulaireRenommer(presta, mur, ligne)),
      bouton('Dupliquer', () => executer(() => actions.dupliquerMur(presta.id, mur.id))),
      bouton('Supprimer', () => {
        if (confirmer(`Supprimer ${mur.nom} et ses saisies ?`)) executer(() => actions.supprimerMur(presta.id, mur.id));
      })));
    return ligne;
  }

  function lignePresta(p) {
    const infos = [texteDates(p.debut, p.fin), p.lieu, nombreMurs(p.murs.length)].filter(Boolean).join(' · ');
    return el('li', { class: 'pr-presta' },
      el('div', { class: 'pr-presta-tete' }, el('span', { class: 'pr-nom' }, p.nom), el('span', { class: 'pr-infos' }, infos)),
      bouton('Ouvrir', () => executer(() => actions.ouvrir(p.id))));
  }

  function dessiner() {
    const p = prestaOuverte(etat);
    const { actives, archivees } = listePrestas(etat);
    const infos = [texteDates(p.debut, p.fin), p.lieu].filter(Boolean).join(' · ');
    const ouverte = el('section', { class: 'pr-ouverte', 'aria-labelledby': 'pr-titre-ouverte' },
      el('p', { class: 'pr-sur-titre', id: 'pr-titre-ouverte' }, 'Presta ouverte'),
      el('h3', { class: 'pr-nom' }, p.nom),
      infos ? el('p', { class: 'pr-infos' }, infos) : null,
      p.notes ? el('p', { class: 'pr-notes' }, p.notes) : null,
      p.archivee ? el('p', { class: 'pr-statut' }, 'Archivée : elle reste dans « Archivées » une fois fermée.') : null,
      el('div', { class: 'pr-export-bloc' },
        el('p', { class: 'pr-export' }, p.exporteeLe ? `Exportée le ${jourLocal(p.exporteeLe)}` : 'Jamais exportée'),
        bouton('Exporter', () => executer(async () => {
          const mode = await actions.exporter(p.id);
          noteExport = NOTES_EXPORT[mode] ?? '';
          const zone = racine.querySelector('.pr-note-export');
          if (zone) zone.textContent = noteExport;
        })),
        el('p', { class: 'pr-note-export', 'aria-live': 'polite' }, noteExport)),
      el('ul', { class: 'pr-murs', role: 'list' }, p.murs.map((m) => ligneMur(p, m))),
      el('div', { class: 'pr-boutons pr-actions-presta' },
        bouton('Ajouter un mur', () => executer(() => actions.ajouterMur(p.id))),
        bouton('Modifier', () => {
          if (!ouverte.querySelector('.pr-formulaire')) formulairePresta(p, ouverte);
        }),
        bouton('Dupliquer', () => executer(() => actions.dupliquerPresta(p.id))),
        bouton(p.archivee ? 'Désarchiver' : 'Archiver', () => executer(() => actions.archiverPresta(p.id, !p.archivee))),
        bouton('Supprimer', () => {
          if (confirmer(`Supprimer ${p.nom} et ${p.murs.length > 1 ? `ses ${p.murs.length} murs` : 'son mur'} ? Exporte-la avant si tu veux la garder.`)) {
            executer(() => actions.supprimerPresta(p.id));
          }
        })));
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
        bouton('Nouvelle presta', () => executer(() => actions.creerPresta()), { class: 'bouton bouton-principal pr-nouvelle' }),
        bouton('Importer une presta', () => champFichier.click())),
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
        }, { class: 'bouton bouton-principal' }),
        bouton('Annuler', () => {
          importEnCours = null;
          dessiner();
        })));
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
