// Écran plein « Terrain » (étape 27, lot 27b, spec de l'étape § 6) : check-list de mise en service
// du mur ouvert. Presta, mur et état (« Mise en service : 5 sur 12 »), bandeau « Le mur a changé », étapes repliables
// (case de 64 px sur toute la ligne de titre, la première étape non cochée ouverte), renvois au Dépannage rendus comme
// dans le Dépannage, boutons des étapes, mes étapes, « Tout décocher ». L'écran affiche ce que l'appli lui donne
// (src/terrain.js) et appelle ses actions ; il ne calcule rien et ne touche ni au stockage ni aux saisies.

import { el, remplacer } from './dom.js';
import { sourceCourte } from './format.js';
import { etatTerrain, etapeCochee, LIMITES_TERRAIN } from './terrain.js';
import { lignesDepannage } from './ecran-depannage.js';

const BOUTONS = {
  'montage-data': ['Montage pas à pas', 'liste'],
  'montage-elec': ['Montage pas à pas', 'liste'],
  novalct: ['Pas à pas NovaLCT', 'liste'],
  mire: ['Mire', null],
};
// Lignes d'« Avant de partir » : prêt, à faire, à vérifier sur place (comme dans Data).
const SIGNES = { true: '✓', false: '☐', null: '?' };
const LIBELLES_SIGNES = { true: 'prêt', false: 'à faire', null: 'à vérifier' };
const CLASSES_SIGNES = { true: 'depart-pret', false: 'depart-a-faire', null: 'depart-a-verifier' };
const CHEVRON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim(), role: genre === 'alerte-erreur' ? 'alert' : null }, texte);
const source = (texte) => (texte ? el('p', { class: 'tr-source' }, texte) : null);

// Source d'une ligne de procédure ou d'un rappel : libellé court, référence, confiance quand elle n'est ni constructeur
// ni déjà dite par le libellé (« Formation »).
function texteSources(sources) {
  return sources.map((s) => {
    const confiance = s.confiance && s.confiance !== 'constructeur' && !sourceCourte(s).toLowerCase().startsWith(s.confiance) ? `, ${s.confiance}` : '';
    return `${sourceCourte(s)}${s.ref ? `, ${s.ref}` : ''}${confiance}`;
  }).join(' ; ');
}

// `actions` : cocher(etapeId, signature | null), compris(), ajouter(texte), retirer(ajoutId), toutDecocher(),
// ouvrir('montage-data' | 'montage-elec' | 'novalct' | 'mire') ; chacune peut lever une erreur, affichée dans l'écran.
// `depannage` : data/depannage.json (libellés des sources des renvois). `confirmer(texte)` : « Tout décocher ».
export function monterTerrain(racine, { actions, depannage = null, enLigne = () => navigator.onLine, confirmer = (texte) => window.confirm(texte) }) {
  let vue = null;
  let numero = 0;
  const zoneErreur = el('div', { class: 'tr-erreur', 'aria-live': 'polite' });
  const zoneEcriture = el('p', { class: 'tr-ecriture', role: 'status' });

  async function executer(appel, zone = zoneErreur) {
    remplacer(zone);
    try {
      await appel();
      return true;
    } catch (erreur) {
      remplacer(zone, alerte(erreur.message, 'alerte-erreur'));
      return false;
    }
  }
  const bouton = (texte, surClic, attributs = {}) => {
    const b = el('button', { type: 'button', class: 'bouton', ...attributs }, texte);
    b.addEventListener('click', surClic);
    return b;
  };

  // --- Lignes d'une étape --------------------------------------------------------------------------------------------
  function elementRenvoi(l) {
    if (l.origine === 'depannage') {
      const corps = lignesDepannage(l.lignes, depannage, { enLigne });
      return el('div', { class: `tr-renvoi${l.renvoi.endsWith(':avertissement') ? ' dep-avertissement' : ''}`, 'data-renvoi': l.renvoi },
        el('p', { class: 'tr-renvoi-titre' }, l.titre), corps);
    }
    return el('div', { class: 'tr-renvoi', 'data-renvoi': l.renvoi },
      el('p', { class: 'tr-renvoi-titre' }, l.titre),
      l.lignes.map((x) => el('div', { class: 'tr-renvoi-ligne' },
        el('p', { class: 'tr-texte' }, x.citation ? [el('span', { class: 'citation', lang: 'en' }, `« ${x.citation} »`), ' '] : null, x.texte),
        source(texteSources(x.sources)))));
  }

  function elementLignes(lignes) {
    const elements = [];
    let liste = null;
    for (const l of lignes) {
      // Lignes d'« Avant de partir » : en liste, avec leur signe, comme dans Data.
      if (l.type === 'texte' && l.fait !== undefined) {
        if (!liste) {
          liste = el('ul', { class: 'liste-depart tr-depart' });
          elements.push(liste, source(l.source));
        }
        liste.append(el('li', { class: CLASSES_SIGNES[l.fait] },
          el('span', { class: 'signe-depart', 'aria-label': LIBELLES_SIGNES[l.fait] }, SIGNES[l.fait]), el('span', {}, l.texte)));
        continue;
      }
      if (l.type === 'renvoi') elements.push(elementRenvoi(l));
      else if (l.type === 'alerte') elements.push(el('div', { class: 'alerte tr-alerte' }, el('span', {}, l.texte), el('span', { class: 'tr-source-alerte' }, ` (${l.source})`)));
      else elements.push(el('div', { class: `tr-ligne${l.type === 'note' ? ' tr-note' : ''}` }, el('p', { class: 'tr-texte' }, l.texte), source(l.source)));
    }
    return elements;
  }

  // --- Étapes --------------------------------------------------------------------------------------------------------
  const etatTexte = () => {
    const { faites, total } = etatTerrain(vue.resultat, vue.coches);
    return `Mise en service : ${faites} sur ${total}`;
  };
  const faite = (e) => (e.calculee ? e.faite : etapeCochee(vue.resultat, e, vue.coches));

  function deplier(li, ouvert) {
    li.querySelector('.tr-corps').hidden = !ouvert;
    li.querySelector('.tr-replier').setAttribute('aria-expanded', String(ouvert));
    li.classList.toggle('tr-ouverte', ouvert);
  }

  function elementEtape(e, ouverte) {
    numero += 1;
    const idCorps = `tr-corps-${numero}`;
    const titres = el('span', { class: 'tr-titres' },
      el('span', { class: 'tr-titre' }, e.titre),
      e.resume ? el('span', { class: 'tr-resume' }, e.resume) : null);
    const numeroEtape = el('span', { class: 'tr-numero', 'aria-hidden': 'true' }, `${e.numero}.`);
    let tete;
    if (e.calculee) {
      // Étape calculée (câblage) : cochée seule quand tout est branché dans le guide, jamais à la main.
      tete = el('div', { class: 'tr-case tr-case-calculee' },
        el('span', { class: `tr-signe${e.faite ? ' tr-signe-fait' : ''}`, role: 'img', 'aria-label': e.faite ? 'fait' : 'pas encore fait' }, e.faite ? '✓' : '○'),
        numeroEtape, titres);
    } else {
      const caseEtape = el('input', { type: 'checkbox', class: 'tr-coche', checked: faite(e) ? '' : null });
      caseEtape.addEventListener('change', () => cocher(e, caseEtape));
      tete = el('label', { class: 'tr-case' }, caseEtape, numeroEtape, titres);
    }
    const replier = el('button', {
      type: 'button', class: 'bouton bouton-icone bouton-discret tr-replier', 'aria-controls': idCorps, 'aria-expanded': String(ouverte), 'aria-label': `Détails : ${e.titre}`,
    });
    replier.innerHTML = CHEVRON;
    const corps = el('div', { class: 'tr-corps', id: idCorps, hidden: ouverte ? null : '' },
      elementLignes(e.lignes),
      e.boutons.length ? el('div', { class: 'pr-boutons tr-boutons' }, e.boutons.map((b) => bouton(BOUTONS[b][0], () => executer(() => actions.ouvrir(b)),
        { class: 'bouton', 'data-icone': BOUTONS[b][1] }))) : null,
      e.ajout ? el('div', { class: 'pr-boutons pr-boutons-danger' },
        bouton('Retirer', () => executer(() => actions.retirer(e.id.replace(/^ajout-/, ''))), { class: 'bouton bouton-danger' })) : null);
    const li = el('li', { class: `tr-etape${faite(e) ? ' tr-faite' : ''}${ouverte ? ' tr-ouverte' : ''}`, 'data-etape': e.id },
      el('div', { class: 'tr-tete' }, tete, replier), corps);
    replier.addEventListener('click', () => deplier(li, corps.hidden));
    return li;
  }

  // Cocher : la case et l'état changent sur place, sans redessiner ; l'étape se replie et la première non cochée s'ouvre.
  async function cocher(e, caseEtape) {
    const coche = caseEtape.checked;
    const coches = { ...vue.coches };
    if (coche) coches[e.id] = e.signature;
    else delete coches[e.id];
    vue = { ...vue, coches };
    const li = caseEtape.closest('.tr-etape');
    li.classList.toggle('tr-faite', coche);
    racine.querySelector('.tr-etat').textContent = etatTexte();
    if (coche) {
      deplier(li, false);
      const suivante = vue.resultat.etapes.find((x) => !faite(x));
      const liSuivante = suivante ? racine.querySelector(`.tr-etape[data-etape="${suivante.id}"]`) : null;
      if (liSuivante && liSuivante.querySelector('.tr-corps').hidden) deplier(liSuivante, true);
    }
    await executer(() => actions.cocher(e.id, coche ? e.signature : null));
  }

  function formulaireAjout() {
    const zone = el('div', { class: 'tr-ajout-erreur', 'aria-live': 'polite' });
    const champ = el('input', { type: 'text', name: 'etape', maxlength: String(LIMITES_TERRAIN.texteAjout), autocomplete: 'off', id: 'tr-ajout-texte' });
    const form = el('form', { class: 'tr-ajout', novalidate: '' },
      el('label', { class: 'pr-champ', for: 'tr-ajout-texte' }, el('span', {}, 'Ajouter une étape'), champ),
      el('div', { class: 'pr-boutons' }, el('button', { type: 'submit', class: 'bouton', 'data-icone': 'ajouter' }, 'Ajouter')),
      zone);
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      if (await executer(() => actions.ajouter(champ.value), zone)) champ.value = '';
    });
    return form;
  }

  function dessiner() {
    numero = 0;
    const premiere = vue.resultat.etapes.find((e) => !faite(e));
    remplacer(racine,
      zoneEcriture,
      zoneErreur,
      el('div', { class: 'tr-tete-ecran' },
        el('p', { class: 'pr-sur-titre tr-presta' }, vue.presta),
        el('h3', { class: 'tr-mur' }, vue.mur),
        el('p', { class: 'tr-etat', 'aria-live': 'polite' }, etatTexte())),
      vue.avis ? el('div', { class: 'alerte alerte-montage tr-avis', role: 'status' },
        el('p', { class: 'tr-avis-texte' }, vue.avis),
        bouton('Compris', () => executer(() => actions.compris()))) : null,
      el('ol', { class: 'tr-etapes', role: 'list' }, vue.resultat.etapes.map((e) => elementEtape(e, e === premiere))),
      el('section', { class: 'tr-mes-etapes', 'aria-label': 'Mes étapes' }, formulaireAjout()),
      el('div', { class: 'pr-boutons pr-boutons-danger tr-tout-decocher' },
        bouton('Tout décocher', () => {
          if (!confirmer('Décocher toutes les étapes de ce mur ? Les étapes de câblage suivent le guide de montage, les étapes ajoutées gardent leur case.')) return;
          executer(() => actions.toutDecocher());
        }, { class: 'bouton bouton-danger', 'data-icone': 'revenir' })));
  }

  return {
    // `presta`, `mur` : noms ; `resultat` : etapesTerrain ; `coches` : cases gardées ; `avis` : bandeau ou null.
    afficher({ presta, mur, resultat, coches, avis = null }) {
      vue = { presta, mur, resultat, coches: { ...(coches ?? {}) }, avis };
      dessiner();
    },
    // Écriture sur l'appareil refusée (autre onglet, stockage indisponible) : le message reste jusqu'à la prochaine
    // écriture réussie (`null`).
    signalerEcriture(message) {
      zoneEcriture.textContent = message ?? '';
      zoneEcriture.classList.toggle('alerte', Boolean(message));
      zoneEcriture.classList.toggle('alerte-erreur', Boolean(message));
    },
  };
}
