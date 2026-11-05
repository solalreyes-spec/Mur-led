// Mise en forme des nombres pour l'affichage, à la française : virgule décimale,
// espace fine entre les milliers à partir de 5 chiffres (3906, mais 15 625), vrai signe moins.
// Les calculs restent exacts : l'arrondi n'intervient qu'ici.

const ESPACE_FINE = ' ';
const MOINS = '−';

export function nombre(n, decimales = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const texte = Math.abs(n).toFixed(decimales);
  const [entier, fraction] = texte.split('.');
  const groupe = entier.length > 4 ? entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE) : entier;
  const negatif = n < 0 && Number(texte) !== 0;
  return `${negatif ? MOINS : ''}${groupe}${fraction ? `,${fraction}` : ''}`;
}

// Jusqu'à `maxDecimales`, sans zéros inutiles : 2,84 ; 500 ; 10,5.
export function nombreCourt(n, maxDecimales = 2) {
  const texte = nombre(n, maxDecimales);
  return texte.includes(',') ? texte.replace(/,?0+$/, '') : texte;
}

// Avec son signe : +0,20 ; −0,40 ; 0,00.
export function signe(n, decimales = 0) {
  const texte = nombre(n, decimales);
  return n > 0 && /[1-9]/.test(texte) ? `+${texte}` : texte;
}

// Date ISO du document → affichage : 2021-05-18 → 18/05/2021 ; 2024-06 → 06/2024 ; 2025 → 2025.
export function dateCourte(iso) {
  if (!iso) return '';
  return String(iso).split('-').reverse().join('/');
}

// Source courte d'une valeur : « Fiche ROE du 18/05/2021 », « Loueur 4Wall ».
// Une source de ma base sans nom court affiche son titre.
export function sourceCourte(source) {
  const nom = source.court || source.titre || 'source sans nom';
  return source.date ? `${nom} du ${dateCourte(source.date)}` : nom;
}

// Lecture d'une saisie : accepte la virgule décimale et les espaces (« 5,8 », « 1 920 »).
export function lireNombre(texte) {
  const propre = String(texte ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  return propre === '' ? NaN : Number(propre);
}

// Type de valeur à rappeler à côté de sa source : « plafond constructeur » (la fiche ne donne qu'un maximum).
export function mentionType(valeurSourcee) {
  return valeurSourcee?.type === 'plafond constructeur' ? 'plafond constructeur' : null;
}

// Dates et noms de fichier (déplacés de prestas.js au lot 27d, pour que terrain.js s'en serve sans dépendre des prestas).
const deux = (n) => String(n).padStart(2, '0');
const texteJour = (iso) => iso.split('-').reverse().join('/');
// « 05/11/2026 ».
export const jourTexte = (d) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
// « 2026-11-05 ».
export const jourIso = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

// « 17/10/2026 », « du 17 au 19/10/2026 », « du 30/10 au 02/11/2026 », « du 30/12/2026 au 02/01/2027 ».
export function texteDates(debut, fin) {
  if (!debut) return '';
  if (!fin || fin === debut) return texteJour(debut);
  const [a, ma, ja] = debut.split('-');
  const [b, mb, jb] = fin.split('-');
  if (a === b && ma === mb) return `du ${ja} au ${jb}/${mb}/${b}`;
  if (a === b) return `du ${ja}/${ma} au ${jb}/${mb}/${b}`;
  return `du ${texteJour(debut)} au ${texteJour(fin)}`;
}

// Nom simplifié pour un nom de fichier : lettres liées remplacées avant la simplification (« Cœur » → « coeur », pas
// « c-ur »), accents retirés, minuscules, tirets, 40 caractères au plus, « sans-nom » s'il ne reste rien.
export function nomSimple(nom) {
  return String(nom ?? '').replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'sans-nom';
}
