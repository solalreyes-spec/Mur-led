// Deux onglets de l'appli ouverts en même temps (lot du 17/10/2026) : le dernier ouvert prend la main. Il l'annonce
// sur un canal entre onglets du même appareil ; les autres sont prévenus (`surRemplace`), cessent d'écrire et le disent.
// Sans canal (navigateur trop ancien), rien ne change.

export function surveillerOnglets({ canal = 'mur-led-onglets', id = `${Date.now()}-${Math.random()}`, surRemplace }) {
  if (typeof BroadcastChannel === 'undefined') return { arreter() {} };
  const c = new BroadcastChannel(canal);
  let prevenu = false;
  c.addEventListener('message', (evenement) => {
    if (evenement.data?.type !== 'ouvert' || evenement.data.id === id || prevenu) return;
    prevenu = true;
    surRemplace();
  });
  c.postMessage({ type: 'ouvert', id });
  return { arreter: () => c.close() };
}
