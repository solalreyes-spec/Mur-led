// Mêmes tests que tests.html, pour `node --test` (sans installation npm).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAS } from './cas.js';
import { REGLES } from './regles.js';
import { DONNEES } from './donnees.js';
import { BANC } from './banc.js';
import { executerCas } from './verif.js';
import { chargerFichiersAppli } from './fichiers.js';

const lireJson = (chemin) => JSON.parse(readFileSync(new URL(chemin, import.meta.url), 'utf8'));
const contexte = {
  dalles: lireJson('../data/dalles.json'),
  processeurs: lireJson('../data/processeurs.json'),
  connectique: lireJson('../data/connectique.json'),
  regies: lireJson('../data/regies.json'),
  appareils: Object.fromEntries(['melangeurs', 'convertisseurs', 'serveurs', 'switches'].map((f) => [f, lireJson(`../data/${f}.json`)])),
  fichiers: await chargerFichiersAppli(async (chemin) => {
    try {
      return readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
    } catch (erreur) {
      return null;
    }
  }),
};

for (const cas of [...BANC, ...DONNEES, ...REGLES, ...CAS]) {
  const nom = `${'attendu' in cas ? 'Cas ' : ''}${cas.id} : ${cas.titre}`;
  if (typeof cas.verifier !== 'function') {
    test.todo(`${nom} (étape ${cas.etape})`);
    continue;
  }
  test(nom, () => {
    const resultat = executerCas(cas, contexte);
    if (resultat.erreur) throw resultat.erreur;
    const echecs = resultat.controles.filter((c) => !c.ok);
    assert.equal(
      echecs.length, 0,
      echecs.map((c) => `${c.libelle} : obtenu ${JSON.stringify(c.obtenu)}, attendu ${JSON.stringify(c.attendu)}`).join('\n'),
    );
  });
}
