// Boutons « Copier les résultats » (un par onglet) et « Tout copier » : texte simple prêt à envoyer.

import { toutResumer } from './resumes.js';
import { resumeOngletMur } from './ecran-mur.js';
import { resumeOngletData, resumeOngletDepart } from './ecran-data.js';
import { resumeOngletCanvas } from './ecran-canvas.js';
import { resumeOngletElec } from './ecran-elec.js';
import { resumeOngletPoids } from './ecran-poids.js';
import { resumeOngletSchema } from './ecran-schema.js';

const RESUMES = {
  mur: resumeOngletMur,
  data: resumeOngletData,
  canvas: resumeOngletCanvas,
  elec: resumeOngletElec,
  poids: resumeOngletPoids,
  schema: resumeOngletSchema,
  // Check-list « Avant de partir » (bas de Data), en dernier dans « Tout copier ».
  depart: resumeOngletDepart,
};

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch (erreur) {
    // Presse-papiers indisponible : copie par une zone de texte temporaire.
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.append(zone);
    zone.select();
    const ok = document.execCommand('copy');
    zone.remove();
    return ok;
  }
}

function annoncer(etat, message) {
  etat.textContent = message;
  clearTimeout(etat.minuterie);
  etat.minuterie = setTimeout(() => { etat.textContent = ''; }, 4000);
}

export function initialiserCopie() {
  for (const bouton of document.querySelectorAll('[data-copier]')) {
    const etat = bouton.parentElement.querySelector('.etat-copie');
    bouton.addEventListener('click', async () => {
      const texte = RESUMES[bouton.dataset.copier]();
      if (!texte) {
        annoncer(etat, 'Rien à copier : le calcul de cet onglet n\'est pas valide.');
        return;
      }
      annoncer(etat, (await copier(texte)) ? 'Résultats copiés.' : 'Copie impossible sur cet appareil.');
    });
  }
  const etatGlobal = document.getElementById('etat-copie-global');
  document.getElementById('tout-copier').addEventListener('click', async () => {
    const resumes = Object.values(RESUMES).map((f) => f());
    const nombre = resumes.filter(Boolean).length;
    if (nombre === 0) {
      annoncer(etatGlobal, 'Rien à copier : aucun calcul valide.');
      return;
    }
    const ok = await copier(toutResumer(resumes));
    annoncer(etatGlobal, ok ? `Résultats de ${nombre} onglet${nombre > 1 ? 's' : ''} copiés, à coller dans ton message.` : 'Copie impossible sur cet appareil.');
  });
}
