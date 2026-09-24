// Fichiers de l'appli, lus de proche en proche à partir de index.html, du manifeste et du service worker,
// pour vérifier que le fonctionnement hors ligne ne dépend d'aucun fichier oublié dans le cache.
// `lire(chemin)` renvoie le texte du fichier, ou null s'il n'existe pas (fetch dans le navigateur, fichier avec Node).

// Liste des fichiers mis en cache par sw.js : le tableau FICHIERS.
export function listeCache(texteSw) {
  const bloc = /const FICHIERS = \[([\s\S]*?)\];/.exec(texteSw ?? '');
  return bloc ? [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

function resoudre(dossier, chemin) {
  const parties = `${dossier}${chemin}`.split('/');
  const propres = [];
  for (const p of parties) {
    if (p === '..') propres.pop();
    else if (p !== '.' && p !== '') propres.push(p);
  }
  return propres.join('/');
}

// Fichiers cités par un fichier : ressources de la page, imports des modules, données et icônes, icônes du manifeste.
// Les données (data/…) et les icônes (icones/…) sont lues depuis la page, donc depuis la racine.
export function references(chemin, texte) {
  const dossier = chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/') + 1) : '';
  const refs = [];
  if (chemin.endsWith('.html')) {
    for (const m of texte.matchAll(/(?:src|href)="([^"#:]+)"/g)) refs.push(m[1]);
  } else if (chemin.endsWith('.js') && chemin !== 'sw.js') {
    for (const m of texte.matchAll(/from\s+'([^']+)'/g)) refs.push(resoudre(dossier, m[1]));
    for (const m of texte.matchAll(/'((?:data|icones)\/[^']+)'/g)) refs.push(m[1]);
    for (const m of texte.matchAll(/register\('([^']+)'/g)) refs.push(m[1]);
  } else if (chemin.endsWith('.webmanifest')) {
    try {
      for (const icone of JSON.parse(texte).icons ?? []) refs.push(icone.src);
    } catch (erreur) {
      // Manifeste illisible : le contrôle du manifeste le signale.
    }
  }
  return refs.filter((r) => !r.startsWith('tests')).map((r) => resoudre(chemin.endsWith('.js') ? '' : dossier, r));
}

export async function chargerFichiersAppli(lire) {
  const textes = {};
  const aLire = ['index.html', 'sw.js', 'manifest.webmanifest'];
  while (aLire.length > 0) {
    const chemin = aLire.shift();
    if (chemin in textes || chemin === '' || chemin === '.') continue;
    const texte = await lire(chemin);
    textes[chemin] = texte;
    if (texte === null) continue;
    const suivants = chemin === 'sw.js' ? listeCache(texte).filter((c) => c !== './') : references(chemin, texte);
    for (const suivant of suivants) if (!(suivant in textes)) aLire.push(suivant);
  }
  return textes;
}

// Fichiers réellement chargés par l'appli (page, manifeste et tout ce qu'ils citent), sans le service worker.
export function fichiersCharges(textes) {
  const vus = new Set();
  const aVoir = ['index.html', 'manifest.webmanifest'];
  while (aVoir.length > 0) {
    const chemin = aVoir.shift();
    if (vus.has(chemin)) continue;
    vus.add(chemin);
    if (textes[chemin]) aVoir.push(...references(chemin, textes[chemin]));
  }
  return [...vus];
}
