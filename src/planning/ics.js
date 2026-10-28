// Lecture des plannings iCal d'Eventsoft (étape 23, spec § 6.1 à 6.3) et planning filtré pour Apple Calendrier
// (§ 5.1). Fonctions pures, sans écran, sans réseau et sans Intl : le relais du planning reprend ce module tel quel,
// il doit donner le même résultat partout. Aucun import.

const HEURE = 3600000;

// ---------------------------------------------------------------------------
// Heure de Paris, par la règle européenne : heure d'été du dernier dimanche de mars à 1 h UTC au dernier dimanche
// d'octobre à 1 h UTC.

function dernierDimanche(annee, mois) {
  const dernier = new Date(Date.UTC(annee, mois, 0));
  return dernier.getUTCDate() - dernier.getUTCDay();
}

// Décalage de l'heure de Paris sur l'UTC à un instant donné, en millisecondes (1 h en hiver, 2 h en été).
export function decalageParis(ms) {
  const annee = new Date(ms).getUTCFullYear();
  const ete = Date.UTC(annee, 2, dernierDimanche(annee, 3), 1);
  const hiver = Date.UTC(annee, 9, dernierDimanche(annee, 10), 1);
  return ms >= ete && ms < hiver ? 2 * HEURE : HEURE;
}

// Date et heure de Paris d'un instant ; `jourSemaine` : 0 pour dimanche.
export function partiesParis(ms) {
  const d = new Date(ms + decalageParis(ms));
  return {
    annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate(),
    heure: d.getUTCHours(), minute: d.getUTCMinutes(), seconde: d.getUTCSeconds(), jourSemaine: d.getUTCDay(),
  };
}

const deux = (n) => String(n).padStart(2, '0');

// Date de Paris d'un instant, « AAAA-MM-JJ ».
export function dateParis(ms) {
  const p = partiesParis(ms);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

// Instant d'une heure de Paris. Heure ambiguë (nuit du passage à l'heure d'hiver) : la première, en heure d'été ;
// heure inexistante (passage à l'heure d'été) : décalée d'une heure plus tard.
export function instantParis(annee, mois, jour, heure = 0, minute = 0, seconde = 0) {
  const local = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
  const ete = local - 2 * HEURE;
  const hiver = local - HEURE;
  if (decalageParis(ete) === 2 * HEURE) return ete;
  return hiver;
}

// Minuit d'Eventsoft : un instant à 23:59:59 heure de Paris est lu comme minuit, la seconde suivante.
export function minuitEventsoft(ms) {
  const p = partiesParis(ms);
  return p.heure === 23 && p.minute === 59 && p.seconde === 59 && ms % 1000 === 0 ? ms + 1000 : ms;
}

// ---------------------------------------------------------------------------
// Texte

// Comparaison sans accents, sans casse, sans espaces de bord (« Demontage » = « Démontage »).
export function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Le texte doit commencer par BEGIN:VCALENDAR et finir par END:VCALENDAR (espaces et fins de ligne de bord ignorés) :
// une page de connexion, un lien révoqué ou un fichier tronqué ne sont pas des calendriers.
export function calendrierValide(texte) {
  if (typeof texte !== 'string') return false;
  const propre = texte.trim();
  return /^BEGIN:VCALENDAR(\r?\n|$)/i.test(propre) && /(^|\n)END:VCALENDAR$/i.test(propre);
}

// Fin de ligne du fichier : s'il contient au moins un CRLF, seules les CRLF séparent les lignes et un LF nu fait
// partie de la valeur (vu sur un vrai planning) ; sinon le LF sépare.
const separateur = (texte) => (texte.includes('\r\n') ? '\r\n' : '\n');

// Lignes logiques : lignes repliées (fin de ligne suivie d'une espace ou d'une tabulation) dépliées ; aucune
// limite de longueur (Eventsoft ne replie pas toujours au-delà de 75 octets).
export function lignesDepliees(texte) {
  const sep = separateur(texte);
  const lignes = [];
  for (const ligne of texte.split(sep)) {
    if ((ligne.startsWith(' ') || ligne.startsWith('\t')) && lignes.length > 0) lignes[lignes.length - 1] += ligne.slice(1);
    else lignes.push(ligne);
  }
  return lignes.filter((l) => l !== '');
}

// Valeur texte : \, \; \n \N et \\ décodés.
export function decoderTexte(valeur) {
  return String(valeur ?? '').replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// Une ligne « NOM;PARAM=VALEUR;…:valeur » ; les deux-points entre guillemets ne coupent pas.
function lireLigne(ligne) {
  let i = 0;
  let guillemets = false;
  for (; i < ligne.length; i += 1) {
    if (ligne[i] === '"') guillemets = !guillemets;
    else if (ligne[i] === ':' && !guillemets) break;
  }
  const tete = ligne.slice(0, i);
  const morceaux = tete.match(/(?:[^;"]|"[^"]*")+/g) ?? [''];
  const params = {};
  for (const p of morceaux.slice(1)) {
    const egal = p.indexOf('=');
    if (egal > 0) params[p.slice(0, egal).toUpperCase()] = p.slice(egal + 1).replace(/^"|"$/g, '');
  }
  return { nom: morceaux[0].toUpperCase(), params, valeur: ligne.slice(i + 1) };
}

// ---------------------------------------------------------------------------
// Dates

// Une date iCal : `Z` = UTC, TZID=Europe/Paris ou sans fuseau = heure de Paris, autre TZID lu comme heure de Paris
// avec une note ; date seule = journée entière, à minuit heure de Paris.
function lireDate(valeur, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(String(valeur).trim());
  if (!m) return null;
  const [annee, mois, jour] = [m[1], m[2], m[3]].map(Number);
  if (m[4] === undefined || params.VALUE === 'DATE') return { ms: instantParis(annee, mois, jour), journeeEntiere: true, note: null };
  const [h, mi, s] = [m[4], m[5], m[6]].map(Number);
  if (m[7] === 'Z') return { ms: Date.UTC(annee, mois - 1, jour, h, mi, s), journeeEntiere: false, note: null };
  const tzid = params.TZID;
  const note = tzid && tzid !== 'Europe/Paris' ? `Fuseau inconnu « ${tzid} », lu en heure de Paris` : null;
  return { ms: instantParis(annee, mois, jour, h, mi, s), journeeEntiere: false, note };
}

// Jours ajoutés dans le calendrier de Paris (une journée du changement d'heure dure 23 ou 25 h).
function ajouterJours(ms, jours) {
  const p = partiesParis(ms);
  return instantParis(p.annee, p.mois, p.jour + jours, p.heure, p.minute, p.seconde);
}

// DURATION (P…W, P…DT…H…M…S) : semaines et jours dans le calendrier, heures, minutes et secondes exactes.
function finParDuree(debut, texte) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(texte).trim());
  if (!m) return null;
  const signe = m[1] === '-' ? -1 : 1;
  const [semaines, jours, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0));
  const ms = ajouterJours(debut, signe * (7 * semaines + jours));
  return ms + signe * ((h * 60 + mi) * 60 + s) * 1000;
}

// ---------------------------------------------------------------------------
// Événements

// Phases relevées sur les plannings Eventsoft du 27/10/2026 (spec § 4) ; toute autre catégorie compte comme du
// travail, avec une note.
export const PHASES_CONNUES = ['Installation', 'Prestation', 'Démontage', 'Répétition', 'Livraison', 'Suivi de dossier'];
const PHASES_NORMALISEES = new Set(PHASES_CONNUES.map(normaliser));

// Indisponibilité (règle déduite des plannings relevés le 27/10/2026, spec § 6.3) : catégorie « Autre », ou qui
// commence par « Travail = », ou titre qui contient « Indisponible » ; sauf un « Autre » qui a un lieu ou un client,
// compté comme travail et marqué à vérifier.
export function classerEvenement({ categorie, summary, lieu, client }) {
  const cat = normaliser(categorie);
  const autre = cat === 'autre';
  if (autre && (String(lieu ?? '').trim() || String(client ?? '').trim())) return { indispo: false, aVerifier: true };
  const indispo = autre || /^travail\s*=/.test(cat) || normaliser(summary).includes('indisponible');
  return { indispo, aVerifier: false };
}

function lireGeo(valeur) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(valeur ?? '');
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

// Un VEVENT (ses lignes logiques) → événement lu, ou null sans DTSTART lisible. `notes` reçoit les remarques.
function lireEvenement(lignes, notes) {
  const props = {};
  for (const ligne of lignes) {
    const p = lireLigne(ligne);
    if (!(p.nom in props)) props[p.nom] = p;
  }
  const texte = (nom) => (props[nom] ? decoderTexte(props[nom].valeur) : '');
  const debutLu = props.DTSTART ? lireDate(props.DTSTART.valeur, props.DTSTART.params) : null;
  const summary = texte('SUMMARY');
  if (!debutLu) {
    notes.push(`Événement sans date de début lisible ignoré : « ${summary} »`);
    return null;
  }
  let fin;
  const finLue = props.DTEND ? lireDate(props.DTEND.valeur, props.DTEND.params) : null;
  for (const note of [debutLu.note, finLue?.note]) if (note) notes.push(note);
  const debut = debutLu.journeeEntiere ? debutLu.ms : minuitEventsoft(debutLu.ms);
  if (finLue) fin = finLue.journeeEntiere ? finLue.ms : minuitEventsoft(finLue.ms);
  else if (props.DURATION) fin = finParDuree(debut, props.DURATION.valeur) ?? debut;
  else fin = debutLu.journeeEntiere ? ajouterJours(debut, 1) : debut;

  // Première catégorie de la liste (virgules non échappées).
  const categorie = decoderTexte(/^(?:[^,\\]|\\.)*/.exec(props.CATEGORIES?.valeur ?? '')[0]).trim();
  const barre = summary.lastIndexOf('/');
  const dernier = barre >= 0 ? summary.slice(barre + 1).trim() : '';
  const phase = categorie || (barre >= 0 ? dernier : 'sans phase');
  const presta = barre >= 0 && normaliser(dernier) === normaliser(phase) ? summary.slice(0, barre).trim() : summary.trim();
  const lieu = texte('LOCATION').trim();
  const client = texte('DESCRIPTION').trim();
  const uid = props.UID?.valeur.trim() || `sans-uid:${debut}:${summary}`;
  if (fin < debut) {
    notes.push(`Fin avant le début : « ${summary} » le ${dateParis(debut)}, durée nulle`);
    fin = debut;
  }
  return {
    uid, debut, fin, presta, phase, lieu, client, geo: lireGeo(props.GEO?.valeur),
    ...classerEvenement({ categorie: phase, summary, lieu, client }),
    journeeEntiere: debutLu.journeeEntiere,
  };
}

// Blocs VEVENT d'une liste de lignes : [indice de BEGIN, indice de END].
function blocsEvenements(lignes) {
  const blocs = [];
  let debut = null;
  lignes.forEach((ligne, i) => {
    const l = ligne.trim().toUpperCase();
    if (l === 'BEGIN:VEVENT') debut = i;
    else if (l === 'END:VEVENT' && debut !== null) {
      blocs.push([debut, i]);
      debut = null;
    }
  });
  return blocs;
}

// Planning d'une boîte. `boite` : son nom, pour les messages. Renvoie { ok, erreur } ou
// { ok, nom, evenements, notes } ; événement : { uid, debut, fin, presta, phase, lieu, client, geo, indispo,
// aVerifier, journeeEntiere }, instants en millisecondes UTC. Deux événements de même UID : le dernier gagne.
export function lireCalendrier(texte, { boite = '' } = {}) {
  if (!calendrierValide(texte)) return { ok: false, erreur: `${boite || 'Planning'} : réponse illisible` };
  const lignes = lignesDepliees(texte);
  const notes = [];
  const parUid = new Map();
  for (const [debut, fin] of blocsEvenements(lignes)) {
    const ev = lireEvenement(lignes.slice(debut + 1, fin), notes);
    if (!ev) continue;
    parUid.delete(ev.uid);
    parUid.set(ev.uid, ev);
  }
  const evenements = [...parUid.values()];
  const nouvelles = new Set();
  for (const ev of evenements) {
    if (ev.indispo || ev.aVerifier || ev.phase === 'sans phase' || PHASES_NORMALISEES.has(normaliser(ev.phase))) continue;
    nouvelles.add(ev.phase);
  }
  for (const phase of nouvelles) notes.push(`Nouvelle catégorie chez ${boite || 'ce planning'} : « ${phase} »`);
  const nom = lignes.map(lireLigne).find((p) => p.nom === 'X-WR-CALNAME');
  return { ok: true, nom: nom ? decoderTexte(nom.valeur) : '', evenements, notes };
}

// ---------------------------------------------------------------------------
// Planning pour Apple Calendrier (abonnement servi par le relais, § 5.1)

const echapper = (texte) => String(texte).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

function formatUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}Z`;
}
function formatLocal(ms) {
  const p = partiesParis(ms);
  return `${p.annee}${deux(p.mois)}${deux(p.jour)}T${deux(p.heure)}${deux(p.minute)}${deux(p.seconde)}`;
}

// Ligne DTSTART ou DTEND à minuit d'Eventsoft réécrite en minuit ; toute autre ligne rendue telle quelle.
function reecrireMinuit(ligne) {
  const m = /^(DTSTART|DTEND)((?:;[^:]*)?):(\d{8}T\d{6}Z?)$/i.exec(ligne);
  if (!m) return ligne;
  const { params } = lireLigne(ligne);
  if (params.TZID && params.TZID !== 'Europe/Paris') return ligne;
  const lu = lireDate(m[3], params);
  if (!lu || lu.journeeEntiere || minuitEventsoft(lu.ms) === lu.ms) return ligne;
  const valeur = m[3].endsWith('Z') ? formatUtc(lu.ms + 1000) : formatLocal(lu.ms + 1000);
  return `${m[1]}${m[2]}:${valeur}`;
}

// Le planning d'une boîte sans ses indisponibilités : leurs blocs VEVENT retirés tels quels, les autres recopiés à
// l'octet près, sauf le minuit d'Eventsoft (23:59:59) réécrit en minuit dans DTSTART et DTEND ; X-WR-CALNAME = `nom`.
// Les fins de ligne du fichier sont gardées (LF nus compris). Réponse qui n'est pas un calendrier : null.
export function planningApple(texte, { nom }) {
  if (!calendrierValide(texte)) return null;
  const sep = separateur(texte);
  const physiques = texte.split(sep);
  // Lignes physiques regroupées en lignes logiques (une ligne et ses suites repliées).
  const groupes = [];
  for (const ligne of physiques) {
    if ((ligne.startsWith(' ') || ligne.startsWith('\t')) && groupes.length > 0) groupes[groupes.length - 1].push(ligne);
    else groupes.push([ligne]);
  }
  const logiques = groupes.map((g) => g[0] + g.slice(1).map((l) => l.slice(1)).join(''));
  const retirer = new Set();
  for (const [debut, fin] of blocsEvenements(logiques)) {
    const ev = lireEvenement(logiques.slice(debut + 1, fin), []);
    if (ev?.indispo) for (let i = debut; i <= fin; i += 1) retirer.add(i);
  }
  const sortie = [];
  let dansEvenement = false;
  let nomEcrit = false;
  groupes.forEach((groupe, i) => {
    if (retirer.has(i)) return;
    const logique = logiques[i].trim().toUpperCase();
    if (logique === 'BEGIN:VEVENT') dansEvenement = true;
    else if (logique === 'END:VEVENT') dansEvenement = false;
    if (!dansEvenement && /^X-WR-CALNAME[;:]/i.test(logiques[i])) {
      sortie.push(`X-WR-CALNAME:${echapper(nom)}`);
      nomEcrit = true;
      return;
    }
    if (dansEvenement && groupe.length === 1) sortie.push(reecrireMinuit(groupe[0]));
    else sortie.push(...groupe);
  });
  if (!nomEcrit) sortie.splice(1, 0, `X-WR-CALNAME:${echapper(nom)}`);
  if (!/^REFRESH-INTERVAL[;:]/im.test(texte)) sortie.splice(1, 0, 'REFRESH-INTERVAL;VALUE=DURATION:PT30M', 'X-PUBLISHED-TTL:PT30M');
  return sortie.join(sep);
}
