// Service worker : l'appli marche hors ligne. Chaque fichier de l'appli est servi depuis le cache, puis
// vérifié en arrière-plan ; si un fichier a changé, il est rangé dans le cache et la page propose de recharger.
// La page de tests lit toujours les derniers fichiers. Ajouter ici tout nouveau fichier de l'appli (test D23).
// Chaque publication qui change un fichier de l'appli change VERSION et EMPREINTE (test N8) : ce fichier change
// donc aussi, le navigateur installe la nouvelle version d'un bloc (tous les fichiers dans un cache neuf),
// supprime l'ancien cache et la page propose de recharger.

const VERSION = 2;
const EMPREINTE = '2e9d6331c6b605154a883bc46b0665d614439c1bb19d23e9d6c6af0968fdf31f';
const CACHE = `mur-led-v${VERSION}`;
const FICHIERS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/calculs.js',
  'src/configuration.js',
  'src/copie.js',
  'src/dessin-schema.js',
  'src/dom.js',
  'src/ecran-base.js',
  'src/ecran-canvas.js',
  'src/ecran-data.js',
  'src/ecran-elec.js',
  'src/ecran-mur.js',
  'src/ecran-poids.js',
  'src/ecran-schema.js',
  'src/export.js',
  'src/fiches.js',
  'src/format.js',
  'src/manques.js',
  'src/resumes.js',
  'src/stockage.js',
  'data/dalles.json',
  'data/processeurs.json',
  'data/connectique.json',
  'data/regies.json',
  'icones/icone.svg',
  'icones/icone-180.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-masquable-512.png',
];

const portee = new URL(self.registration.scope);
const adresses = new Set(FICHIERS.map((f) => new URL(f, portee).href));

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FICHIERS.map((f) => new Request(new URL(f, portee), { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    const anciens = (await caches.keys()).filter((c) => c !== CACHE);
    await Promise.all(anciens.map((c) => caches.delete(c)));
    await self.clients.claim();
    // Mise à jour (un ancien cache existait) : les pages ouvertes affichent « Recharger ».
    if (anciens.length > 0) {
      for (const page of await self.clients.matchAll({ type: 'window' })) page.postMessage({ type: 'nouvelle-version', version: VERSION });
    }
  })());
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  url.search = '';
  url.hash = '';
  if (!adresses.has(url.href)) return;
  evenement.respondWith(repondre(evenement, url.href));
});

async function pourLesTests(evenement) {
  if (!evenement.clientId) return false;
  const client = await self.clients.get(evenement.clientId);
  return Boolean(client) && new URL(client.url).pathname.endsWith('/tests.html');
}

async function repondre(evenement, adresse) {
  const cache = await caches.open(CACHE);
  if (await pourLesTests(evenement)) {
    try {
      return await fetch(adresse, { cache: 'no-store' });
    } catch (erreur) {
      return (await cache.match(adresse)) ?? Response.error();
    }
  }
  const enCache = await cache.match(adresse);
  if (enCache) {
    evenement.waitUntil(verifier(cache, adresse, enCache.clone()));
    return enCache;
  }
  return (await verifier(cache, adresse, null)) ?? Response.error();
}

// Télécharge la dernière version ; si elle diffère de celle du cache, la range et prévient les pages ouvertes.
async function verifier(cache, adresse, ancienne) {
  let reponse;
  try {
    reponse = await fetch(adresse, { cache: 'no-cache' });
  } catch (erreur) {
    return null; // hors ligne : le cache suffit
  }
  if (!reponse.ok) return ancienne ? null : reponse;
  if (!ancienne) {
    await cache.put(adresse, reponse.clone());
    return reponse;
  }
  const [avant, apres] = await Promise.all([ancienne.arrayBuffer(), reponse.clone().arrayBuffer()]);
  if (!memesOctets(avant, apres)) {
    await cache.put(adresse, reponse.clone());
    const pages = await self.clients.matchAll({ type: 'window' });
    for (const page of pages) page.postMessage({ type: 'nouvelle-version' });
  }
  return reponse;
}

function memesOctets(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}
