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
