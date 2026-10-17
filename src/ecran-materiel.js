// Écran plein « Matériel » (étapes 13b et 13c) : liste de matériel d'un mur (menu « ⋯ » du mur dans Prestas) ou total de
// la presta (bouton « Matériel » de sa carte), avec la check-list de chargement, les ajouts à la main, la copie et le
// partage. L'écran affiche ce que l'appli lui donne (calculs.js, prestas.js) et appelle ses actions ; il ne calcule rien
// et ne touche ni au stockage ni aux saisies.

import { el, remplacer } from './dom.js';
import { nombreCourt } from './format.js';
import { libelleLigne } from './calculs.js';

const deux = (n) => String(n).padStart(2, '0');
const quand = (iso) => {
  const d = new Date(iso);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())} h ${deux(d.getMinutes())}`;
};
const alerte = (texte, genre = '') => el('div', { class: `alerte ${genre}`.trim(), role: genre === 'alerte-erreur' ? 'alert' : null }, texte);
const pluriel = (n, un, plusieurs) => `${nombreCourt(n)} ${n > 1 ? plusieurs : un}`;

export { libelleLigne };

// Une ligne : quantité, désignation et détail ; dans le total, une case à cocher couvre la ligne (48 px, 60 en grand
// affichage) ; un bouton « Retirer » pour un ajout à la main.
function elementLigne(l, { coche = null, surCoche = null, retirer = null } = {}) {
  const texte = [
    el('span', { class: 'mat-qte chiffres' }, nombreCourt(l.quantite)),
    el('span', { class: 'mat-texte' },
      el('span', { class: 'mat-nom' }, libelleLigne(l)),
      l.detail ? el('span', { class: 'mat-detail' }, l.detail) : null),
  ];
  if (!surCoche) return el('li', { class: 'mat-ligne' }, ...texte);
  const caseCoche = el('input', { type: 'checkbox', class: 'mat-case', checked: coche ? '' : null, 'aria-label': `${nombreCourt(l.quantite)} × ${libelleLigne(l)} chargé` });
  caseCoche.addEventListener('change', () => surCoche(l, caseCoche.checked));
  return el('li', { class: `mat-ligne mat-ligne-coche${coche ? ' mat-cochee' : ''}` },
    el('label', { class: 'mat-coche' }, caseCoche, ...texte),
    retirer ? retirer : null);
}

function elementSection(s, options = {}) {
  if (!s.lignes.length && !s.notes.length && s.id !== 'ajouts') return null;
  return el('section', { class: 'mat-section', 'aria-label': s.titre, 'data-section': s.id },
    el('h3', { class: 'mat-titre' }, s.titre),
    s.lignes.length ? el('ul', { class: 'mat-lignes', role: 'list' }, s.lignes.map((l) => elementLigne(l, {
      coche: options.coches?.has(l.cle), surCoche: options.surCoche, retirer: options.retirer?.(l),
    }))) : null,
    s.notes.map((n) => el('p', { class: 'mat-note' }, n)),
    options.apres ?? null);
}

function elementPoids(p) {
  const valeur = p.kg === null ? 'non calculé (poids de dalle absent)' : `${nombreCourt(p.kg, 1)} kg`;
  return el('section', { class: 'mat-section', 'aria-label': 'Poids transporté' },
    el('h3', { class: 'mat-titre' }, 'Poids transporté'),
    el('p', { class: 'mat-poids' }, el('span', { class: 'chiffres' }, valeur), el('span', { class: 'mat-detail' }, `indicatif ; ${p.nonCompte}`)));
}

// `actions` : reglerSpares(prestaId, valeur), ouvrirMur(prestaId, murId), cocher(prestaId, cle, quantite | null),
// toutDecocher(prestaId), compris(prestaId), ajouter(prestaId, { libelle, quantite }), retirerAjout(prestaId, id),
// copier() (renvoie true si copié), partager() (renvoie 'partage', 'annule' ou 'telechargement') ; chacune peut lever une
// erreur, affichée dans l'écran. `confirmer(texte)` : confirmation de « Tout décocher ».
export function monterMateriel(racine, { actions, confirmer = (texte) => window.confirm(texte) }) {
  let vue = null;
  const zoneErreur = el('div', { class: 'mat-erreur', 'aria-live': 'polite' });
  const note = el('p', { class: 'mat-note mat-note-partage', 'aria-live': 'polite' });

  async function executer(appel) {
    remplacer(zoneErreur);
    try {
      return await appel();
    } catch (erreur) {
      remplacer(zoneErreur, alerte(erreur.message, 'alerte-erreur'));
      return null;
    }
  }
  const bouton = (texte, surClic, attributs = {}) => {
    const b = el('button', { type: 'button', class: 'bouton', ...attributs }, texte);
    b.addEventListener('click', surClic);
    return b;
  };

  function champSpares(presta, pourcent, ecart) {
    const id = 'mat-spares';
    const champ = el('input', { id, type: 'text', inputmode: 'decimal', value: nombreCourt(pourcent), autocomplete: 'off' });
    champ.addEventListener('change', async () => {
      remplacer(zoneErreur);
      try {
        await actions.reglerSpares(presta.id, champ.value);
      } catch (erreur) {
        remplacer(zoneErreur, alerte(erreur.message, 'alerte-erreur'));
        champ.value = nombreCourt(pourcent);
      }
    });
    return el('div', { class: 'mat-spares' },
      el('label', { class: 'pr-champ', for: id }, el('span', {}, 'Spare des dalles (%), pour toute la presta'), champ), ecart);
  }

  function boutonsPartage() {
    remplacer(note);
    return el('div', { class: 'pr-boutons mat-partage' },
      bouton('Copier la liste', () => executer(async () => {
        note.textContent = (await actions.copier()) ? 'Liste copiée.' : 'Copie impossible sur cet appareil.';
      }), { 'data-icone': 'copier' }),
      bouton('Partager', () => executer(async () => {
        const mode = await actions.partager();
        note.textContent = mode === 'telechargement' ? 'Fichier enregistré dans Fichiers (Téléchargements).' : '';
      }), { 'data-icone': 'partager' }),
      note);
  }

  function dessinerMur() {
    const { presta, mur, gardee, ouvert, pourcent } = vue;
    const liste = gardee?.liste ?? null;
    const tete = el('div', { class: 'mat-tete' },
      el('p', { class: 'pr-sur-titre' }, presta.nom),
      el('h3', { class: 'mat-nom-mur' }, mur.nom),
      liste ? el('p', { class: 'mat-date' }, ouvert ? 'Mur ouvert : liste à jour de ses saisies.' : `Liste calculée le ${quand(gardee.calculeeLe)}, à l'ouverture du mur.`) : null);
    if (!liste) {
      remplacer(racine, zoneErreur, tete,
        alerte(ouvert ? 'Liste impossible : corrige le mur dans l\'onglet Mur.' : 'Ouvre ce mur une fois pour compter son matériel.', 'alerte-info'),
        ouvert ? null : bouton('Ouvrir ce mur', () => executer(() => actions.ouvrirMur(presta.id, mur.id)), { class: 'bouton bouton-principal' }));
      return;
    }
    const ecart = liste.sparesPourcent !== pourcent && !ouvert
      ? el('p', { class: 'mat-note' }, `Liste calculée avec ${nombreCourt(liste.sparesPourcent)} % de spare : ouvre ce mur pour la recalculer à ${nombreCourt(pourcent)} %.`)
      : null;
    remplacer(racine, zoneErreur, tete,
      alerte(liste.rappel, 'alerte-info'),
      champSpares(presta, pourcent, ecart),
      liste.sections.map((s) => elementSection(s)),
      elementPoids(liste.poidsTransporte),
      boutonsPartage());
  }

  function formulaireAjout(presta) {
    const form = el('form', { class: 'mat-ajout', novalidate: '' },
      el('label', { class: 'pr-champ' }, el('span', {}, 'Matériel à ajouter (Socapex, Harting, rallonges…)'),
        el('input', { name: 'libelle', type: 'text', maxlength: '80', autocomplete: 'off' })),
      el('label', { class: 'pr-champ mat-ajout-qte' }, el('span', {}, 'Quantité'),
        el('input', { name: 'quantite', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: '1' })),
      el('button', { type: 'submit', class: 'bouton', 'data-icone': 'ajouter' }, 'Ajouter'));
    form.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      await executer(() => actions.ajouter(presta.id, { libelle: form.elements.libelle.value, quantite: form.elements.quantite.value }));
    });
    return form;
  }

  function dessinerPresta() {
    const { presta, total, coches, changees, pourcent, stock } = vue;
    const toutes = total.sections.flatMap((s) => s.lignes);
    const nbCochees = toutes.filter((l) => coches.has(l.cle)).length;
    const surCoche = (l, coche) => executer(() => actions.cocher(presta.id, l.cle, coche ? l.quantite : null));
    const retirer = (l) => (l.cle.startsWith('ajout|')
      ? bouton('Retirer', () => executer(() => actions.retirerAjout(presta.id, l.cle.slice(6))), { class: 'bouton bouton-danger mat-retirer', 'aria-label': `Retirer ${l.designation}` })
      : null);
    const bandeau = changees.length ? el('div', { class: 'alerte mat-bandeau', role: 'status' },
      el('p', {}, changees.length > 1 ? 'Lignes décochées, la liste a changé :' : 'Ligne décochée, la liste a changé :'),
      el('ul', { class: 'rappels' }, changees.map((c) => el('li', {}, c.texte))),
      bouton('Compris', () => executer(() => actions.compris(presta.id)))) : null;
    // Stock des parcs (étape 15b) : bandeau des manques en tête, une ligne par parc et par fiche après les dalles.
    const bandeauStock = stock?.manques.length ? el('div', { class: 'alerte alerte-erreur mat-stock-bandeau', role: 'status' },
      el('p', {}, 'Stock insuffisant :'), el('ul', { class: 'rappels' }, stock.manques.map((m) => el('li', {}, m)))) : null;
    const sectionStock = stock?.lignes.length ? el('section', { class: 'mat-section', 'aria-label': 'Stock des parcs', 'data-section': 'stock' },
      el('h3', { class: 'mat-titre' }, 'Stock des parcs'),
      el('ul', { class: 'mat-stock', role: 'list' }, stock.lignes.map((l) => el('li', { class: l.etat === 'manque' ? 'mat-stock-manque' : null }, l.texte)))) : null;
    const sections = [...total.sections];
    if (!sections.some((s) => s.id === 'ajouts')) sections.push({ id: 'ajouts', titre: 'Ajouts à la main', lignes: [], notes: [] });
    const ecart = total.sparesPourcent.some((x) => x !== pourcent)
      ? el('p', { class: 'mat-note' }, `Des murs ont été comptés avec un autre spare (${total.sparesPourcent.map((x) => `${nombreCourt(x)} %`).join(', ')}) : ouvre-les pour les recalculer à ${nombreCourt(pourcent)} %.`)
      : null;
    remplacer(racine, zoneErreur,
      el('div', { class: 'mat-tete' },
        el('p', { class: 'pr-sur-titre' }, 'Total de la presta'),
        el('h3', { class: 'mat-nom-mur' }, presta.nom),
        el('p', { class: 'mat-date' }, `${pluriel(total.murs, 'mur', 'murs')} ; chargement : ${pluriel(nbCochees, 'ligne cochée', 'lignes cochées')} sur ${nombreCourt(toutes.length)}.`)),
      alerte(total.rappel, 'alerte-info'),
      bandeauStock,
      bandeau,
      total.notes.map((n) => alerte(n, 'alerte-info')),
      champSpares(presta, pourcent, ecart),
      sections.map((s) => [elementSection(s, { coches, surCoche, retirer, apres: s.id === 'ajouts' ? formulaireAjout(presta) : null }), s.id === 'dalles' ? sectionStock : null]),
      elementPoids(total.poidsTransporte),
      boutonsPartage(),
      el('div', { class: 'pr-boutons pr-boutons-danger' },
        bouton('Tout décocher', () => {
          if (confirmer(`Décocher ${nbCochees > 1 ? `les ${nombreCourt(nbCochees)} lignes cochées` : 'la ligne cochée'} de ${presta.nom} ?`)) executer(() => actions.toutDecocher(presta.id));
        }, { class: 'bouton bouton-danger', 'data-icone': 'revenir', disabled: nbCochees ? null : '' })));
  }

  const dessiner = () => (vue.total ? dessinerPresta() : dessinerMur());
  return {
    // `gardee` : { liste, calculeeLe } ou null ; `ouvert` : le mur ouvert (liste recalculée juste avant).
    afficherMur({ presta, mur, gardee, ouvert, pourcent }) {
      vue = { presta, mur, gardee, ouvert, pourcent };
      remplacer(zoneErreur);
      dessiner();
    },
    // `total` : totalMateriel ; `stock` : stockPresta ; `coches` : Set des clés cochées ; `changees` : lignes décochées, avec la raison.
    afficherPresta({ presta, total, stock = null, coches, changees, pourcent }) {
      const memeVue = vue?.total && vue.presta.id === presta.id;
      const defilement = memeVue ? racine.scrollTop : 0;
      vue = { presta, total, stock, coches, changees, pourcent };
      remplacer(zoneErreur);
      dessiner();
      racine.scrollTop = defilement;
    },
  };
}
