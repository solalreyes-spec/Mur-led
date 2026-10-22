// NovaLCT pas à pas, écrans (étape 17b) : carte de l'onglet Data et écran plein. L'écran affiche le pas à pas que
// l'appli lui donne (novalct.js) et appelle ses actions (cocher, « Compris », tout décocher, dessin d'un port) ; il ne
// calcule rien et ne touche ni au stockage ni aux saisies.

import { el, remplacer } from './dom.js';
import { verifierOu } from './novalct.js';
import { cheminsPasAPas } from './ecran-connexion.js';

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim(), role: genre === 'alerte-erreur' ? 'alert' : null }, texte);

function bouton(texte, surClic, attributs = {}) {
  const b = el('button', { type: 'button', class: 'bouton', ...attributs }, texte);
  b.addEventListener('click', surClic);
  return b;
}

// Carte « NovaLCT pas à pas » de l'onglet Data. `groupe` : groupe vidéo du processeur (novalct.groupeVideo) ;
// `version` : ligne de version (vide : rien) ; `etat` : « Aucune étape faite sur 34. ».
export function carteNovaLCT({ processeur, nombre, groupe, version, etat }, { ouvrir }) {
  const avant = groupe === 'v-can' ? ', et avant dans V-Can ou en façade' : '';
  return el('section', { class: 'bloc-resultats nl-carte' },
    el('h3', {}, 'NovaLCT pas à pas'),
    el('p', { class: 'nl-carte-texte' }, `${nombre} × ${processeur} : ce qu'il faut faire dans NovaLCT${avant} pour ce mur, `
      + 'étape par étape, avec ses valeurs et la source de chaque étape.'),
    version ? el('p', { class: 'source' }, version) : null,
    el('p', { class: 'nl-etat' }, etat),
    bouton('Ouvrir le pas à pas', ouvrir, { class: 'bouton bouton-principal' }));
}

// Noms de menus et de boutons des manuels (anglais, tels quels), mis en chasse fixe dans le texte des étapes ; les plus
// longs d'abord, pour qu'un nom n'en coupe pas un autre (« Save to HW » avant « Save »).
const MENUS = [
  'User > Advanced Synchronous System User Login', 'User > Demonstration Login', 'Settings > Screen Configuration',
  'Settings > Hardware Information', 'Settings > Brightness', 'Tools > Screen Control', 'Tools > Multi-batch Adjustment',
  'Tools > Quickly Adjust Dark or Bright Lines > Adjust Dark or Bright Lines', 'Tools > Quickly Adjust Dark or Bright Lines',
  'Programming > Input > Input', 'Programming > Input', 'Screen Configuration > More Settings > Output Frame Rate',
  'Advanced Settings > Synchronization', 'Specify Receiving Card', 'Reset the Starting Coordinate of Receiving Card', 'Send Mode Parameters',
  'Bind', 'Set as Backup', 'Set as Primary',
  'Input Settings > MOSAIC', 'Screen Configuration > More Settings > Mapping', 'Advanced Settings > Ethernet Port Backup Test',
  'System > Backup', 'System > Restore', 'View Details of Device', 'Configure Screen', 'Sending Card', 'Source Configuration',
  'Automatic Selection', 'Refresh Rate', 'Bit Depth', 'Receiving Card', 'Load from File', 'Send to Receiving Card',
  'All Receiving Card', 'NCP Management', 'Load NCP', 'Send NCP', 'Save to HW', 'Cabinet Information', 'Performance Settings',
  'Screen Connection', 'Standard Screen', 'Apply to Entire Row', 'Port Capacity', 'Coordinate', 'Send to HW', 'Save to File',
  'Save System Configuration File', 'Redundancy', 'Enable Hot Backup Verification', 'Disable Hot Backup Verification',
  'Read the Number of Receiving Cards', 'Enable Mapping', 'Test Pattern', 'Black Out', 'Manual Adjustment',
  'Apply Adjustment File', 'Save to Flash', 'Read from HW', 'Complex Screen', 'Set Blank', 'Set Rotation', 'Hardware Information',
  'Refresh All', 'Save Preset', 'Preset Settings', 'Disable Primary', 'Enable All', 'Color Range', 'Frame Rate', 'Input Settings',
  'Regular', 'Configure', 'Refresh', 'Import', 'Export', 'Verify', 'Freeze', 'Normal', 'Custom', 'Standard', 'Width', 'Height',
  'Resolution', 'Apply', 'Close', 'Next', 'Send', 'Save', 'Add', 'Set', 'EDID', 'MOSAIC',
].sort((a, b) => b.length - a.length);
const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MOTIF_MENUS = new RegExp(`(?<![\\p{L}\\d])(${MENUS.map(echapper).join('|')})(?![\\p{L}\\d])`, 'gu');

// Texte d'une étape : noms des menus en <code>, le reste tel quel.
function texteAvecMenus(texte) {
  const morceaux = [];
  let debut = 0;
  for (const m of texte.matchAll(MOTIF_MENUS)) {
    if (m.index > debut) morceaux.push(texte.slice(debut, m.index));
    morceaux.push(el('code', { class: 'nl-menu' }, m[0]));
    debut = m.index + m[0].length;
  }
  morceaux.push(texte.slice(debut));
  return morceaux;
}

// Nom court d'une partie dans le choix : Avant, V-Can, Processeur n, Contrôles.
const nomPartie = (p) => (p.id === '0' ? 'Avant' : p.id === 'A' ? 'V-Can' : p.id === 'C' ? 'Contrôles' : `Processeur ${p.processeur}`);
const etatTexte = (faites, total) => (faites === 0
  ? `Aucune étape faite sur ${total}.`
  : `${faites} ${faites > 1 ? 'étapes' : 'étape'} sur ${total} ${faites > 1 ? 'faites' : 'faite'}.`);

// Une étape faite : sa case est cochée et sa signature n'a pas changé.
export function compterFaites(resultat, cases) {
  const etapes = (resultat?.parties ?? []).flatMap((p) => p.etapes);
  return { faites: etapes.filter((e) => cases?.[e.id] === e.signature).length, total: etapes.length };
}
export const texteEtatNovaLCT = (resultat, cases) => {
  const { faites, total } = compterFaites(resultat, cases);
  return etatTexte(faites, total);
};

// `actions` : cocher(id, signature ou null), compris(), toutDecocher(), dessinPort(etape) (élément ou null), fermer()
// (facultative : bouton « Fermer le pas à pas » en bas de l'écran), pdf() (renvoie 'partage', 'annule' ou 'telechargement')
// et copier() (renvoie true si copié), facultatives.
export function monterNovaLCT(racine, { actions }) {
  let vue = null;
  let partieId = null;
  let confirmation = false;
  let zoneEtat = null;
  const note = el('p', { class: 'mat-note nl-note', 'aria-live': 'polite' });
  const zoneErreur = el('div', { class: 'nl-erreur', 'aria-live': 'polite' });

  async function executer(appel) {
    remplacer(zoneErreur);
    try {
      return await appel();
    } catch (erreur) {
      remplacer(zoneErreur, alerte(erreur.message, 'alerte-erreur'));
      return null;
    }
  }

  function choixParties(parties) {
    return el('fieldset', { class: 'segmente nl-parties' },
      el('legend', {}, 'Partie'),
      el('div', { class: 'segments' }, parties.map((p) => {
        const radio = el('input', { type: 'radio', name: 'nl-partie', value: p.id, checked: p.id === partieId ? '' : null });
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          partieId = p.id;
          confirmation = false;
          dessiner();
          racine.scrollTop = 0;
        });
        return el('label', {}, radio, el('span', {}, nomPartie(p)));
      })));
  }

  // Code admin NovaLCT du parc (étape 18a) : masqué ; « Afficher » le montre sur place, un nouvel affichage le masque.
  function blocCode(nomParc, code) {
    const MASQUE = '••••••';
    const valeur = el('span', { class: 'nl-code-valeur' }, MASQUE);
    const basculer = bouton('Afficher', () => {
      const montre = basculer.getAttribute('aria-pressed') !== 'true';
      valeur.textContent = montre ? code : MASQUE;
      basculer.textContent = montre ? 'Masquer' : 'Afficher';
      basculer.setAttribute('aria-pressed', String(montre));
    }, { class: 'bouton bouton-discret', 'aria-pressed': 'false' });
    return el('p', { class: 'nl-code' }, `Code du parc ${nomParc} : `, valeur, ' ', basculer);
  }

  function carteEtape(e) {
    const coche = vue.cases?.[e.id] === e.signature;
    const caseFait = el('input', { type: 'checkbox', checked: coche ? '' : null, 'aria-describedby': `nl-titre-${e.id}` });
    const dessin = /\.B\.7\.\d+$/.test(e.id) && actions.dessinPort ? actions.dessinPort(e) : null;
    const carte = el('li', { class: `nl-etape${coche ? ' nl-faite' : ''}`, 'data-etape': e.id },
      el('h4', { id: `nl-titre-${e.id}` }, el('span', { class: 'nl-numero' }, e.id.replace(/^P\d+\./, '')), ' ', e.titre),
      e.aVerifier ? el('p', { class: 'nl-a-verifier' }, `À vérifier ${verifierOu(e)}`) : null,
      el('p', { class: 'nl-texte' }, texteAvecMenus(e.texte)),
      // Ton ordinateur (étape 19a) : chemin du système choisi et de l'autre, repliés, et lien vers la fiche d'Apprendre.
      e.connexion ? cheminsPasAPas(e.connexion, { ouvrirFiche: actions.ouvrirConnexion ?? null }) : null,
      e.codeParc && vue.code ? blocCode(e.codeParc, vue.code) : null,
      dessin ? el('div', { class: 'nl-dessin' }, dessin) : null,
      e.tableau ? el('div', { class: 'nl-tableau-cadre' }, el('table', { class: 'nl-tableau' },
        el('thead', {}, el('tr', {}, e.tableau.colonnes.map((c) => el('th', { scope: 'col' }, c)))),
        el('tbody', {}, e.tableau.lignes.map((l) => el('tr', {}, l.map((x) => el('td', {}, String(x)))))))) : null,
      e.alerte ? alerte(e.alerte) : null,
      el('p', { class: 'source nl-sources' }, `Source : ${e.sources.map((s) => `${s.court}${s.ref ? ` ${s.ref}` : ''}`).join(' ; ')}`),
      el('label', { class: 'nl-case' }, caseFait, el('span', {}, 'Fait')));
    // Case cochée (lot 17b4) : la case, sa carte et l'état changent sur place, sans redessiner l'écran ni ses dessins ;
    // l'enregistrement suit (action de l'appli).
    caseFait.addEventListener('change', () => {
      const signature = caseFait.checked ? e.signature : null;
      const cases = { ...vue.cases };
      if (signature) cases[e.id] = signature;
      else delete cases[e.id];
      vue = { ...vue, cases };
      carte.classList.toggle('nl-faite', Boolean(signature));
      const { faites, total } = compterFaites(vue.resultat, cases);
      if (zoneEtat) zoneEtat.textContent = etatTexte(faites, total);
      executer(() => actions.cocher(e.id, signature));
    });
    return carte;
  }

  function dessiner() {
    const { resultat, cases, avis, note: noteABlanc } = vue;
    const parties = resultat.parties;
    if (!parties.some((p) => p.id === partieId)) partieId = parties[0].id;
    const i = parties.findIndex((p) => p.id === partieId);
    const partie = parties[i];
    const { faites, total } = compterFaites(resultat, cases);
    const suivante = parties[i + 1];
    const nombre = resultat.parties.filter((p) => p.processeur).length;
    zoneEtat = el('p', { class: 'nl-etat' }, etatTexte(faites, total));
    remplacer(racine,
      zoneErreur,
      el('div', { class: 'mat-tete' },
        el('p', { class: 'pr-sur-titre' }, `${nombre} × ${resultat.processeur}`),
        zoneEtat),
      // PDF et texte copié (étape 17c1), secondaires : « Partie suivante » reste le seul bouton principal.
      actions.pdf || actions.copier ? el('div', { class: 'nl-actions' },
        actions.pdf ? bouton('PDF', () => executer(async () => {
          const mode = await actions.pdf();
          note.textContent = mode === 'telechargement' ? 'PDF enregistré dans Fichiers (Téléchargements).' : '';
        }), { 'data-icone': 'fiche' }) : null,
        actions.copier ? bouton('Copier', () => executer(async () => {
          note.textContent = (await actions.copier()) ? 'Pas à pas copié.' : 'Copie impossible sur cet appareil.';
        }), { 'data-icone': 'copier' }) : null,
        note) : null,
      // À blanc (étape 17c2) : le mur d'exemple, en tête.
      noteABlanc ? el('div', { class: 'alerte alerte-info nl-a-blanc' }, `À blanc. ${noteABlanc}`) : null,
      resultat.version.note ? el('p', { class: 'source' }, resultat.version.note) : null,
      // Config imposée (étape 18c3) : rappelée en tête.
      resultat.imposee ? el('div', { class: 'alerte alerte-info nl-imposee' }, `Câblage : ${resultat.imposee}`) : null,
      avis ? el('div', { class: 'alerte nl-avis', role: 'status' },
        el('span', {}, avis),
        bouton('Compris', () => executer(() => actions.compris()))) : null,
      resultat.alertes.map((t) => alerte(t, 'alerte-erreur')),
      resultat.nonCouvert.map((t) => alerte(t, 'alerte-info')),
      choixParties(parties),
      el('h3', { class: 'nl-partie-titre' }, partie.titre),
      partie.note ? el('div', { class: 'alerte alerte-info nl-note-partie' }, partie.note) : null,
      el('ol', { class: 'nl-etapes' }, partie.etapes.map((e) => carteEtape(e))),
      el('div', { class: 'nl-pied' },
        suivante ? bouton('Partie suivante ▶', () => {
          partieId = suivante.id;
          confirmation = false;
          dessiner();
          racine.scrollTop = 0;
        }, { class: 'bouton bouton-principal' }) : null,
        actions.fermer ? bouton('Fermer le pas à pas', () => actions.fermer(), { 'data-icone': 'fermer' }) : null,
        confirmation
          ? el('div', { class: 'nl-confirmation' },
            el('p', {}, 'Décocher toutes les étapes de ce mur ?'),
            bouton('Oui, tout décocher', () => {
              confirmation = false;
              executer(() => actions.toutDecocher());
            }, { class: 'bouton bouton-danger', 'data-icone': 'revenir' }),
            bouton('Annuler', () => {
              confirmation = false;
              dessiner();
            }, { class: 'bouton bouton-discret' }))
          : bouton('Tout décocher', () => {
            confirmation = true;
            dessiner();
          }, { class: 'bouton bouton-danger', 'data-icone': 'revenir' })));
  }

  return {
    // `resultat` : etapesNovaLCT ; `cases` : { identifiant : signature } ; `avis` : texte du bandeau ou null ; `note` : mur
    // d'exemple du mode à blanc, ou null. La partie
    // affichée reste la même d'un affichage à l'autre (sauf si elle n'existe plus).
    // `code` : code admin NovaLCT du parc actif (étape 18a), montré masqué à l'étape 0.5 ; null sans code.
    afficher({ resultat, cases, avis, note = null, code = null }) {
      const defilement = vue ? racine.scrollTop : 0;
      vue = { resultat, cases: cases ?? {}, avis: avis ?? null, note, code };
      dessiner();
      racine.scrollTop = defilement;
    },
    // Retour à la première partie (nouvelle ouverture de l'écran).
    revenirAuDebut() {
      partieId = null;
      confirmation = false;
    },
  };
}
