// Brancher l'ordinateur au processeur (étape 19a) : la carte d'Apprendre (choix « Mon ordinateur », marque, adresses
// lues sur les processeurs, la fiche en cinq étapes, l'autre système replié, Copier et PDF), le bloc ajouté sous la
// ligne 1 de T10.3 du Dépannage et le chemin replié de l'étape 0.3 du pas à pas NovaLCT. Le contenu vient de
// connexion.js ; aucun calcul ici. Le choix de l'ordinateur est gardé par l'appli (`garderSysteme`).

import { el, remplacer, listeNumerotee } from './dom.js';
import {
  ficheConnexion, texteConnexion, feuilleConnexion, cheminIP, adresseOrdinateur, autreSysteme, systemeConnu, MARQUES_CONNEXION, SOURCES_CONNEXION,
} from './connexion.js';

const MARQUES = MARQUES_CONNEXION.map(([id]) => id);
const marqueConnue = (m) => (MARQUES.includes(m) ? m : 'toutes');

// Sources d'une ligne, en petit ; liens web seulement en ligne.
function sources(liste, enLigne, classe = 'source cx-source-ligne') {
  const vues = new Set();
  const uniques = (liste ?? []).filter((s) => {
    const cle = `${s.id}|${s.ref ?? ''}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  if (!uniques.length) return null;
  const morceaux = ['Source : '];
  uniques.forEach((s, i) => {
    if (i > 0) morceaux.push(' ; ');
    const url = SOURCES_CONNEXION[s.id]?.url;
    morceaux.push(url && enLigne() ? el('a', { href: url, target: '_blank', rel: 'noopener' }, s.court) : s.court, s.ref ? ` ${s.ref}` : '');
  });
  return el('p', { class: classe }, ...morceaux);
}

// Une ligne de la fiche : son texte, « à vérifier » s'il n'y a pas de source sûre, ses sources.
function ligne(l, enLigne) {
  return el('div', { class: 'cx-ligne' },
    el('p', { class: 'cx-texte' }, l.texte),
    l.aVerifier ? el('p', { class: 'cx-a-verifier' }, 'À vérifier') : null,
    sources(l.sources, enLigne));
}

// Chemin des réglages réseau d'un système : étapes numérotées, puis le retour après la presta.
export function cheminElement(chemin, { enLigne = () => navigator.onLine } = {}) {
  return el('div', { class: 'cx-chemin', 'data-systeme': chemin.systeme },
    listeNumerotee({ class: 'cx-etapes-chemin' }, chemin.etapes.map((e, i) => ({ numero: i + 1, contenu: ligne(e, enLigne) }))),
    ligne(chemin.apres, enLigne));
}

const notesAdresse = (a) => [a.ok && a.exemple ? a.message : null, ...a.alertes, a.ok ? a.note : null].filter(Boolean);

// Carte d'Apprendre. `systeme` : choix gardé ; `marque`, `modele` : processeur retenu dans Data (marque « toutes »
// sans projet) ; `copier(texte)` rend vrai si la copie a marché ; `pdf(feuille)` rend « telechargement » ou autre.
export function carteConnexion({ systeme = 'mac', garderSysteme = () => {}, marque = 'toutes', modele = null, copier = null, pdf = null, enLigne = () => navigator.onLine } = {}) {
  const marqueDeData = marqueConnue(marque);
  const etat = { systeme: systemeConnu(systeme), marque: marqueDeData, adresses: '' };
  const fiche = () => ficheConnexion({ systeme: etat.systeme, marque: etat.marque, modele: etat.marque === marqueDeData ? modele : null, adresses: etat.adresses });
  const reponse = el('p', { class: 'cx-reponse', 'aria-live': 'polite' });
  const notes = el('div', { class: 'cx-notes' });
  const zone = el('div', { class: 'cx-fiche' });
  const note = el('p', { class: 'mat-note cx-note', 'aria-live': 'polite' });

  function dessiner() {
    const f = fiche();
    reponse.textContent = f.reponse;
    reponse.classList.toggle('cx-reponse-erreur', !f.adresse.ok);
    remplacer(notes, notesAdresse(f.adresse).map((t) => el('p', { class: 'cx-note-adresse' }, t)), f.adresse.ok || f.adresse.autoIP ? sources(f.adresse.sources, enLigne) : null);
    remplacer(zone,
      listeNumerotee({ class: 'cx-etapes' }, f.etapes.map((e, i) => ({ numero: i + 1, contenu: [el('h4', { class: 'cx-etape-titre' }, e.titre), ...e.lignes.map((l) => ligne(l, enLigne))] }))),
      el('details', { class: 'cx-autre' }, el('summary', {}, f.autre.titre), cheminElement(f.autre, { enLigne })));
  }

  const systemes = el('fieldset', { class: 'segmente cx-systeme' },
    el('legend', {}, 'Mon ordinateur'),
    el('div', { class: 'segments' }, [['mac', 'Mac'], ['windows', 'Windows']].map(([id, nom]) => {
      const radio = el('input', { type: 'radio', name: 'cx-systeme', value: id, checked: id === etat.systeme ? '' : null });
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        etat.systeme = id;
        garderSysteme(id);
        dessiner();
      });
      return el('label', {}, radio, el('span', {}, nom));
    })));
  const choixMarque = el('select', { id: 'cx-marque', name: 'cx-marque' },
    MARQUES_CONNEXION.map(([id, nom]) => el('option', { value: id, selected: id === etat.marque ? '' : null }, nom)));
  const retenirMarque = () => {
    etat.marque = marqueConnue(choixMarque.value);
    dessiner();
  };
  choixMarque.addEventListener('input', retenirMarque);
  choixMarque.addEventListener('change', retenirMarque);
  const champ = el('input', { type: 'text', id: 'cx-adresses', name: 'cx-adresses', inputmode: 'decimal', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '192.168.0.10' });
  champ.addEventListener('input', () => {
    etat.adresses = champ.value;
    dessiner();
  });
  const bouton = (texte, icone, action) => {
    const b = el('button', { type: 'button', class: 'bouton', 'data-icone': icone }, texte);
    b.addEventListener('click', async () => {
      try {
        note.textContent = await action();
      } catch (erreur) {
        note.textContent = erreur.message;
      }
    });
    return b;
  };
  dessiner();
  return el('section', { class: 'carte ap-connexion' },
    el('h3', { class: 'ap-titre' }, 'Brancher l\'ordinateur au processeur'),
    el('p', { class: 'ap-intro' }, 'Pour que le logiciel trouve le processeur : la bonne adresse IP sur ton ordinateur, le câble, le chemin des réglages, '
      + 'et ce que chaque logiciel permet sur un Mac.'),
    systemes,
    el('div', { class: 'champ' }, el('label', { for: 'cx-marque' }, 'Marque du processeur'), choixMarque),
    el('div', { class: 'champ' }, el('label', { for: 'cx-adresses' }, 'Adresses des processeurs (lues sur leur écran)'), champ),
    reponse,
    notes,
    zone,
    copier || pdf ? el('div', { class: 'cx-actions' },
      copier ? bouton('Copier', 'copier', async () => ((await copier(texteConnexion(fiche()))) ? 'Fiche copiée.' : 'Copie impossible sur cet appareil.')) : null,
      pdf ? bouton('PDF', 'fiche', async () => ((await pdf(feuilleConnexion(fiche()))) === 'telechargement' ? 'PDF enregistré dans Fichiers (Téléchargements).' : '')) : null,
      note) : null);
}

// Bloc du Dépannage sous la ligne 1 de T10.3 (spec § 3.4) : ajouté par l'appli, hors des données transcrites, avec ses
// propres sources. `marque` : celle du Dépannage (projet ou choix), pour l'adresse d'exemple.
export function blocDepannage({ systeme = 'mac', marque = null, ouvrirFiche = null, enLigne = () => navigator.onLine } = {}) {
  const sys = systemeConnu(systeme);
  const a = adresseOrdinateur('', { marque: marqueConnue(marque) });
  const chemin = cheminIP(sys, { adresse: a.ok ? a.adresse : null });
  const autre = cheminIP(autreSysteme(sys), { adresse: a.ok ? a.adresse : null });
  const tout = [...a.sources, ...[chemin, autre].flatMap((c) => [...c.etapes, c.apres].flatMap((e) => e.sources))];
  const lien = ouvrirFiche ? el('button', { type: 'button', class: 'bouton cx-ouvrir-fiche' }, 'Fiche Brancher l\'ordinateur') : null;
  lien?.addEventListener('click', () => ouvrirFiche());
  return el('div', { class: 'cx-depannage', role: 'note' },
    el('p', { class: 'cx-ajout' }, 'Ajouté par l\'appli'),
    el('h3', { class: 'cx-titre' }, `Comment faire ${sys === 'mac' ? 'sur ton Mac' : 'sur Windows'}`),
    el('p', { class: 'cx-texte' }, a.ok ? `Adresse à donner à l'ordinateur : ${a.adresse}, masque ${a.masque}, passerelle vide. ${a.message}` : a.message),
    cheminElement(chemin, { enLigne }),
    el('details', { class: 'cx-autre' }, el('summary', {}, autre.titre), cheminElement(autre, { enLigne })),
    lien,
    sources(tout, enLigne, 'source cx-sources'));
}

// Chemin de l'étape 0.3 du pas à pas : le système choisi, puis l'autre, chacun replié ; lien vers la fiche d'Apprendre.
export function cheminsPasAPas(connexion, { ouvrirFiche = null, enLigne = () => navigator.onLine } = {}) {
  const lien = ouvrirFiche ? el('button', { type: 'button', class: 'bouton cx-ouvrir-fiche' }, 'Fiche Brancher l\'ordinateur') : null;
  lien?.addEventListener('click', () => ouvrirFiche());
  const replie = (chemin, titre) => el('details', { class: 'nl-chemin' }, el('summary', {}, titre), cheminElement(chemin, { enLigne }));
  return el('div', { class: 'nl-connexion' },
    replie(connexion.chemin, `${connexion.chemin.titre} : le chemin`),
    replie(connexion.autre, connexion.autre.titre),
    lien);
}
