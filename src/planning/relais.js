// Lecture du planning par le relais (étape 23, lot 23c1, spec § 5.1, § 6.5 et § 7) : liste des boîtes, planning brut de
// chaque boîte, test de connexion, lecture de toutes les boîtes et lecture automatique. `fetch` est passé en paramètre
// (relais simulé dans les tests). Le jeton part dans l'en-tête, jamais dans l'adresse ; aucun cookie, aucun cache,
// aucun référent. Aucun message ne contient l'adresse du relais, un jeton ni un lien Eventsoft.

import { lireCalendrier } from './ics.js';
import { appliquerLecture } from './journees.js';
import { fusionnerBoites, reglagesComplets } from './reglages.js';

// Délai d'une requête : le relais attend Eventsoft 15 s au plus.
export const DELAI_RELAIS = 20000;
// Lecture automatique à l'ouverture de l'appli et de l'onglet : si la dernière date de plus de 15 min.
export const ATTENTE_LECTURE = 15 * 60000;

const TEXTES = {
  jeton: 'Jeton refusé par le relais : vérifie le jeton de l\'appli (ou l\'adresse du relais).',
  injoignable: 'Relais injoignable : vérifie l\'adresse du relais et le réseau.',
  reglages: 'Règle d\'abord l\'adresse du relais et le jeton de l\'appli.',
};
const inattendue = (statut) => `Relais : réponse inattendue (statut ${statut}).`;

// Une requête GET au relais : { reponse } ou { reseau: true } (réseau coupé, relais injoignable, délai dépassé).
async function appeler(fetch, adresse, chemin, jeton, delai) {
  const arret = typeof AbortController === 'function' ? new AbortController() : null;
  let minuterie;
  const limite = new Promise((resolve) => {
    minuterie = setTimeout(() => {
      arret?.abort();
      resolve({ reseau: true });
    }, delai);
  });
  const requete = (async () => {
    try {
      const reponse = await fetch(`${adresse}${chemin}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${jeton}` },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        ...(arret ? { signal: arret.signal } : {}),
      });
      return { reponse };
    } catch {
      return { reseau: true };
    }
  })();
  try {
    return await Promise.race([requete, limite]);
  } finally {
    clearTimeout(minuterie);
  }
}

// Liste des boîtes du relais : { ok, boites: [{ id, nom }] } ou { ok: false, type: 'jeton' | 'injoignable' | 'reponse', texte }.
export async function lireBoites({ adresse, jeton, fetch, delai = DELAI_RELAIS }) {
  const { reponse, reseau } = await appeler(fetch, adresse, '/boites.json', jeton, delai);
  if (reseau) return { ok: false, type: 'injoignable', texte: TEXTES.injoignable };
  if (reponse.status === 404) return { ok: false, type: 'jeton', texte: TEXTES.jeton };
  if (!reponse.ok) return { ok: false, type: 'reponse', texte: inattendue(reponse.status) };
  try {
    const liste = JSON.parse(await reponse.text());
    const boites = liste.filter((b) => typeof b?.id === 'string' && /^[a-z0-9-]+$/.test(b.id)).map((b) => ({ id: b.id, nom: String(b.nom ?? b.id) }));
    if (!Array.isArray(liste) || boites.length !== liste.length) throw new Error('liste');
    return { ok: true, boites };
  } catch {
    return { ok: false, type: 'reponse', texte: 'Relais : liste des boîtes illisible.' };
  }
}

// Détail d'une boîte en erreur (réponse 502 du relais : { boite, statut }).
function detailEventsoft(statut) {
  if (statut === 'illisible') return 'réponse qui n\'est pas un planning (lien changé ou révoqué ?)';
  if (statut === 'délai') return 'Eventsoft trop lent (plus de 15 s)';
  if (statut === 'injoignable') return 'Eventsoft injoignable';
  return Number.isFinite(statut) ? `Eventsoft répond ${statut}` : 'Eventsoft en erreur';
}

// Planning brut d'une boîte : { ok, texte } ou { ok: false, type, texte, detail }.
export async function lireBoite({ adresse, jeton, id, nom, fetch, delai = DELAI_RELAIS }) {
  const { reponse, reseau } = await appeler(fetch, adresse, `/ics/${encodeURIComponent(id)}`, jeton, delai);
  if (reseau) return { ok: false, type: 'injoignable', texte: `${nom} : pas joignable`, detail: 'relais injoignable' };
  if (reponse.ok) return { ok: true, texte: await reponse.text() };
  if (reponse.status === 502) {
    let statut = null;
    try {
      statut = JSON.parse(await reponse.text())?.statut ?? null;
    } catch {
      statut = null;
    }
    const texte = statut === 'illisible' ? `${nom} : réponse illisible` : `${nom} : pas joignable`;
    return { ok: false, type: 'boite', texte, detail: detailEventsoft(statut) };
  }
  if (reponse.status === 404) return { ok: false, type: 'jeton', texte: `${nom} : inconnue du relais`, detail: 'boîte inconnue du relais ou jeton refusé' };
  return { ok: false, type: 'reponse', texte: `${nom} : pas joignable`, detail: `relais, statut ${reponse.status}` };
}

// « Tester la connexion » : jeton refusé, relais injoignable ou boîte en erreur, avec une ligne par boîte.
export async function testerConnexion({ adresse, jeton, fetch, delai = DELAI_RELAIS }) {
  const liste = await lireBoites({ adresse, jeton, fetch, delai });
  if (!liste.ok) return { ok: false, type: liste.type, texte: liste.texte, lignes: [liste.texte], boites: [] };
  const lus = await Promise.all(liste.boites.map((b) => lireBoite({ adresse, jeton, id: b.id, nom: b.nom, fetch, delai })));
  const lignes = [`Relais joint : ${liste.boites.length} ${liste.boites.length > 1 ? 'boîtes' : 'boîte'}.`];
  liste.boites.forEach((b, i) => {
    const lu = lus[i];
    if (!lu.ok) {
      lignes.push(`${b.nom} : en erreur, ${lu.detail}.`);
      return;
    }
    const calendrier = lireCalendrier(lu.texte, { boite: b.nom });
    lignes.push(calendrier.ok
      ? `${b.nom} : planning lu (${calendrier.evenements.length} ${calendrier.evenements.length > 1 ? 'dates' : 'date'}).`
      : `${b.nom} : en erreur, réponse qui n'est pas un planning.`);
  });
  const enErreur = lignes.slice(1).some((l) => / : en erreur, /.test(l));
  return { ok: !enErreur, ...(enErreur ? { type: 'boite' } : {}), texte: lignes.join('\n'), lignes, boites: liste.boites };
}

// Lecture de toutes les boîtes. `confirmer` : identifiants des boîtes dont l'utilisateur accepte les retraits
// (question « Les retirer ? »). Renvoie { ok, etat, reglages, messages: [{ boite, type, texte }], nouveaux } ; jeton
// refusé ou relais injoignable : { ok: false, type, texte } avec l'état et les réglages inchangés.
export async function lirePlanning({ reglages, etat, maintenant, fetch, confirmer = [], delai = DELAI_RELAIS }) {
  const avant = etat ?? { boites: {}, essai: null };
  if (!reglagesComplets(reglages)) return { ok: false, type: 'reglages', texte: TEXTES.reglages, etat: avant, reglages, messages: [], nouveaux: 0 };
  const { relais: adresse, jeton } = reglages;
  const liste = await lireBoites({ adresse, jeton, fetch, delai });
  if (!liste.ok) return { ok: false, type: liste.type, texte: liste.texte, etat: avant, reglages, messages: [], nouveaux: 0 };
  const boites = fusionnerBoites(reglages.boites ?? [], liste.boites);
  const actives = boites.filter((b) => !b.absente);
  const lus = await Promise.all(actives.map((b) => lireBoite({ adresse, jeton, id: b.id, nom: b.affichage, fetch, delai })));
  const etatBoites = { ...(avant.boites ?? {}) };
  const messages = [];
  let nouveaux = 0;
  actives.forEach((b, i) => {
    const lecture = lus[i].ok ? lireCalendrier(lus[i].texte, { boite: b.affichage }) : { ok: false, erreur: lus[i].texte };
    const r = appliquerLecture(etatBoites[b.id], lecture, maintenant, { nom: b.affichage, confirmer: confirmer.includes(b.id) });
    etatBoites[b.id] = r.etat;
    nouveaux += r.nouveaux.length;
    if (r.erreur) messages.push({ boite: b.id, type: 'erreur', texte: r.erreur });
    if (r.demande) messages.push({ boite: b.id, type: 'demande', texte: r.demande.texte });
  });
  return { ok: true, etat: { ...avant, boites: etatBoites, essai: maintenant }, reglages: { ...reglages, boites }, messages, nouveaux };
}

// Devis chiffrés envoyés par le robot du Mac (étape 25, lot 25e1, spec § 5.4) : { ok, enveloppe } (texte, null tant que
// rien n'est envoyé : 204) ou { ok: false, type, texte }. Le déchiffrement se fait dans l'appli (dechiffrerDevis).
export async function lireDevis({ adresse, jeton, fetch, delai = DELAI_RELAIS }) {
  const { reponse, reseau } = await appeler(fetch, adresse, '/devis', jeton, delai);
  if (reseau) return { ok: false, type: 'injoignable', texte: TEXTES.injoignable };
  if (reponse.status === 404) return { ok: false, type: 'jeton', texte: TEXTES.jeton };
  if (reponse.status === 204) return { ok: true, enveloppe: null };
  if (!reponse.ok) return { ok: false, type: 'reponse', texte: inattendue(reponse.status) };
  return { ok: true, enveloppe: await reponse.text() };
}

// Lecture automatique : en réseau seulement, jamais lue ou dernier essai de plus de 15 min.
export function lectureDue(etat, maintenant, { enLigne = true } = {}) {
  if (!enLigne) return false;
  const essai = etat?.essai ?? null;
  return essai === null || maintenant - essai >= ATTENTE_LECTURE;
}
