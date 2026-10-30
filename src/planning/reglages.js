// Réglages du planning des piges (étape 23, lot 23c1, spec § 5.2 et § 7) : adresse du relais, jetons, repère de chaque
// boîte (nom d'affichage, couleur, lettre). Fonctions pures. Les réglages restent sur l'appareil, sous leurs propres
// clés : jamais dans l'export de la base, d'une presta, « Tout copier » ni « Repartir des réglages par défaut ».

export const CLES_PLANNING = { reglages: 'planning-reglages', etat: 'planning-etat' };
// Devis lus par le robot du Mac (étape 25, lot 25e1, spec § 5.5) : dernière lecture acceptée par presta, gardée à part,
// jamais dans un export de la base, d'une presta, « Tout copier » ni « Repartir ».
export const CLE_DEVIS = 'planning-devis';

// Repère des boîtes : couleurs distinctes, hors familles des onglets (comme les couleurs des ports), lettre foncée à
// 4,5:1 au moins sur chacune ; en mode rouge, toutes les pastilles passent en #ff3b30 et la lettre les distingue.
export const PALETTE_BOITES = ['#ff8a5c', '#7ee081', '#ffd166', '#c39bff', '#5cc8ff', '#ff7eb6', '#e0c49c', '#9fe8d8'];
export const TEXTE_PASTILLE = '#0b0d11';

export const reglagesVides = () => ({ relais: null, jeton: null, jetonApple: null, cleDevis: null, boites: [] });

// Clé des devis (§ 5.4) : 64 caractères hexadécimaux, gardée en minuscules. Les refus ne répètent jamais la saisie.
export function cleDevisValide(saisie) {
  const texte = String(saisie ?? '').trim();
  if (!texte) return { ok: false, erreur: 'Saisis la clé des devis.' };
  if (!/^[0-9a-f]{64}$/i.test(texte)) return { ok: false, erreur: 'Clé des devis illisible : colle la clé entière (64 caractères, chiffres et lettres de a à f).' };
  return { ok: true, cle: texte.toLowerCase() };
}

// Adresse du relais : https:// seulement (le jeton ne passe jamais en clair), sans chemin ni paramètre. Les refus ne
// répètent jamais la saisie.
export function adresseRelais(saisie) {
  const texte = String(saisie ?? '').trim();
  if (!texte) return { ok: false, erreur: 'Saisis l\'adresse du relais.' };
  if (/^http:\/\//i.test(texte)) return { ok: false, erreur: 'Le relais doit être en https:// : le jeton ne passe jamais en clair.' };
  const complete = /^[a-z][a-z0-9+.-]*:\/\//i.test(texte) ? texte : `https://${texte}`;
  let url;
  try {
    url = new URL(complete);
  } catch {
    return { ok: false, erreur: 'Adresse du relais illisible.' };
  }
  if (url.protocol !== 'https:' || !url.hostname || url.search || url.hash || url.username || url.password || !/^\/*$/.test(url.pathname)) {
    return { ok: false, erreur: 'Adresse du relais illisible : colle seulement l\'adresse https:// du relais.' };
  }
  return { ok: true, adresse: `https://${url.host}` };
}

// Jeton : au moins 32 caractères, sans espace ni « / » (il passe dans l'adresse des abonnements Apple).
export function jetonValide(saisie) {
  const jeton = String(saisie ?? '').trim();
  if (jeton.length < 32) return { ok: false, erreur: 'Jeton trop court : colle le jeton entier (64 caractères).' };
  if (/[\s/]/.test(jeton)) return { ok: false, erreur: 'Jeton illisible : il ne contient ni espace ni « / ».' };
  return { ok: true, jeton };
}

const sansAccents = (texte) => String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lettre de chaque boîte : son initiale, ou la lettre suivante de son nom si l'initiale est prise, sinon la première
// lettre libre de l'alphabet. `prises` : lettres déjà utilisées par d'autres boîtes.
export function lettresParDefaut(noms, prises = []) {
  const utilisees = new Set(prises.map((l) => String(l).toUpperCase()));
  return noms.map((nom) => {
    const candidates = [...sansAccents(nom).toUpperCase().replace(/[^A-Z0-9]/g, ''), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    const lettre = candidates.find((c) => !utilisees.has(c)) ?? '?';
    utilisees.add(lettre);
    return lettre;
  });
}

// Boîtes lues sur le relais ({ id, nom }) et réglages gardés : chaque boîte garde son nom d'affichage, sa couleur et sa
// lettre ; une nouvelle prend la première couleur libre et une lettre libre ; une boîte que le relais ne donne plus
// reste (son historique), marquée `absente`.
export function fusionnerBoites(enregistrees = [], lues = []) {
  const gardees = new Map(enregistrees.map((b) => [b.id, b]));
  const ids = new Set(lues.map((b) => b.id));
  const couleurs = new Set(enregistrees.map((b) => b.couleur));
  const nouvelles = lues.filter((b) => !gardees.has(b.id));
  const lettres = lettresParDefaut(nouvelles.map((b) => b.nom), enregistrees.map((b) => b.lettre));
  const resultat = lues.map((b) => {
    const g = gardees.get(b.id);
    if (g) return { id: b.id, nom: b.nom, affichage: g.affichage || b.nom, couleur: g.couleur, lettre: g.lettre, ...(g.parc ? { parc: g.parc } : {}) };
    const couleur = PALETTE_BOITES.find((c) => !couleurs.has(c)) ?? PALETTE_BOITES[couleurs.size % PALETTE_BOITES.length];
    couleurs.add(couleur);
    return { id: b.id, nom: b.nom, affichage: b.nom, couleur, lettre: lettres[nouvelles.indexOf(b)] };
  });
  return [...resultat, ...enregistrees.filter((b) => !ids.has(b.id)).map((b) => ({ ...b, absente: true }))];
}

// Parc de chaque boîte (étape 25, lot 25e2, spec § 5.5) : repris par les murs préparés depuis ses devis. `parcId` null
// (« Aucun ») : réglage retiré.
export function reglerParcBoite(reglages, boiteId, parcId) {
  return {
    ...reglages,
    boites: (reglages?.boites ?? []).map((b) => {
      if (b.id !== boiteId) return b;
      const { parc, ...reste } = b;
      return parcId ? { ...reste, parc: parcId } : reste;
    }),
  };
}

// Parc réglé pour une boîte, s'il existe encore (`parcIds` : identifiants des parcs de la base) ; sinon null.
export function parcBoite(reglages, boiteId, parcIds) {
  const parc = (reglages?.boites ?? []).find((b) => b.id === boiteId)?.parc ?? null;
  return parc && parcIds.includes(parc) ? parc : null;
}

// Parc supprimé de la base : le réglage de ses boîtes est vidé. Rien à vider : les mêmes réglages.
export function nettoyerParcsBoites(reglages, parcIds) {
  const orphelines = (reglages?.boites ?? []).filter((b) => b.parc && !parcIds.includes(b.parc));
  return orphelines.reduce((r, b) => reglerParcBoite(r, b.id, null), reglages);
}

// Réglages complets : adresse et jeton de l'appli (le jeton Apple ne sert qu'aux abonnements).
export const reglagesComplets = (r) => Boolean(r?.relais && r?.jeton);

// Abonnement Apple Calendrier d'une boîte (§ 7) : le planning sans indisponibilités servi par le relais sous
// /apple/<jeton Apple>/<boîte>.ics, en webcal:// (Calendrier propose l'abonnement) et en https:// (à coller dans
// Calendrier). Rien sans adresse du relais ni jeton Apple ; jamais le jeton de l'appli.
export function adressesApple(reglages, id) {
  if (!reglages?.relais || !reglages?.jetonApple || !/^[a-z0-9-]+$/.test(id ?? '')) return null;
  const hote = new URL(reglages.relais).host;
  const chemin = `${hote}/apple/${encodeURIComponent(reglages.jetonApple)}/${id}.ics`;
  return { webcal: `webcal://${chemin}`, https: `https://${chemin}` };
}
