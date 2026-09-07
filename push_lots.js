#!/usr/bin/env node
/* Ajoute les lots manquants directement dans Firestore (crm/state).
   Le mot de passe n'est JAMAIS écrit dans ce fichier : il est lu depuis
   les variables d'environnement au moment où TU lances la commande.

   Usage (dans TON Terminal) :
     cd "/Users/partouche/Downloads/CRM RENOVANTIS"
     FB_EMAIL="jonathan@artesanosverdes.com" FB_PASS="ton_mot_de_passe" node push_lots.js

   Anti-doublon : un lot déjà présent (même réf GreenFlex) est ignoré.
*/

const API_KEY = "AIzaSyBIoyI1GHVePcvloM0O6m2aLYsZrhxDJrE";
const PROJECT = "artesanos-verdes-renovantis";
const EMAIL = process.env.FB_EMAIL;
const PASS  = process.env.FB_PASS;
const TOKEN = process.env.FB_TOKEN;   // access token OAuth (gcloud) — accès admin, pas de mot de passe

if (!TOKEN && (!EMAIL || !PASS)) {
  console.error("❌ Fournis soit FB_TOKEN (recommandé), soit FB_EMAIL + FB_PASS.\n" +
    "   Mode token (owner du projet) :\n" +
    "     FB_TOKEN=\"$(gcloud auth print-access-token)\" node push_lots.js\n" +
    "   Mode email/mot de passe :\n" +
    "     FB_EMAIL=\"jonathan@artesanosverdes.com\" FB_PASS=\"...\" node push_lots.js");
  process.exit(1);
}

function id(){ return "l" + Math.random().toString(36).slice(2,9); }
const A = arr => arr.map(a => ({ p: a[0], kwh: a[1], m2: a[2] }));

// --- Lots à insérer (ignorés s'ils existent déjà) ---
const LOTS = [
  {
    ref: "CA20260307 · G9", vague: "Galicia 9", ccaa: "Galicia", date: "2026-05",
    statut: "À facturer", part: "GreenFlex", mode: "detail",
    prixKwh: 0.145, pagoCEE: 165.60, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: A([
      ["AUREA FERNANDEZ LUIS/MARIA RODRIGUEZ DOS ANGELES",14560,82.67],["Maria Jose Rodriguez Sanchez (Ubalda Vidueira García)",15200,79],
      ["Maria Jesus Laranjo Carballal (Isacc Gonzalez)",29801,187.31],["María La Salete Da Silva Faria",18040,102],
      ["Martina Bembibre Asenjo",12161,83],["Maria Teresa Garcia Castro",14914,104],
      ["ROGELIO BOUZAS FERNANDEZ/HERMELINDA",30079,166],["ANGELA RODRIGUEZ GOMEZ",11049,69.45],
      ["Carmen Garcia Rodriguez",29341,130],["Maria Helena Prada Yañez",32141,171],
      ["DOMINGO SALGADO CARRASCO / MARIA DEL CARMEN SALGADO C",25730,142],["LISARDO GARCIA ALVAREZ",20078,114],
      ["JUAN JOSE GUERRA DA SILVA",51821,244],
    ]),
  },
  {
    ref: "CA20260265 · G4", vague: "Galicia 4", ccaa: "Galicia", date: "2026-03",
    statut: "À facturer", part: "GreenFlex", mode: "detail",
    prixKwh: 0.145, pagoCEE: 165.60, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: A([
      ["Jose Antonio Barja Sanchez",11397,51],["Jose Macia Dominguez",15815,71],
      ["Francisco Ballesteros Blanco",11962,53],["Antonia Coutiño Martínez",26891,120.73],
      ["Antonia Dominguez García",15019,86],["Angel Rodríguez Barja",6593,55],
      ["José Ramón Baldín García",17639,101],["Antonio Fernandez Fernandez",16970,84],
      ["Francisco José Casares Dominguez",6275,32],["Laura María González Ballesteros",21216,94],
      ["Daniel Dieguez Barjacoba (CASTRO DO 31)",18924,107],["Concepción Barrio Augusto",32405,145],
      ["Isidoro Perez Yañez",43397,162],["Maria Rosa Coutiño Coutiño (CADAVOS 24)",15111,66.95],
      ["Manuel Ferreira Dieguez CASTROMIL 10",49774,199],
    ]),
  },
];

const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/crm/state`;
const norm = s => String(s||"").toLowerCase().replace(/\s+/g, "");

(async () => {
  // 1) Authentification
  let H;
  if (TOKEN) {
    H = { Authorization: "Bearer " + TOKEN };
    console.log("✓ Auth par token OAuth (accès admin owner)");
  } else {
    const auth = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) }
    ).then(r => r.json());
    if (!auth.idToken) { console.error("❌ Connexion échouée :", auth.error && auth.error.message); process.exit(1); }
    H = { Authorization: "Bearer " + auth.idToken };
    console.log("✓ Connecté :", EMAIL);
  }

  // 2) Lecture de l'état courant
  const doc = await fetch(DOC, { headers: H }).then(r => r.json());
  if (doc.error) { console.error("❌ Lecture Firestore :", doc.error.message); process.exit(1); }
  const payload = doc.fields && doc.fields.payload && doc.fields.payload.stringValue;
  if (!payload) { console.error("❌ Champ payload introuvable"); process.exit(1); }
  const state = JSON.parse(payload);
  console.log("✓ État lu :", state.lots.length, "lots en ligne");

  // 3) Ajout des lots manquants (anti-doublon sur la réf GreenFlex)
  let added = 0;
  for (const lot of LOTS) {
    const key = norm(lot.ref.split(" · ")[0]);
    if (state.lots.some(l => norm((l.ref||"").split(" · ")[0]) === key)) {
      console.log("  ⏭  déjà présent :", lot.ref);
      continue;
    }
    state.lots.push(Object.assign({ id: id() }, lot));
    console.log("  ➕ ajouté :", lot.ref);
    added++;
  }
  if (!added) { console.log("Rien à ajouter — tout est déjà en ligne."); process.exit(0); }

  // 4) Réécriture
  const url = DOC + "?updateMask.fieldPaths=payload&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=by";
  const body = { fields: {
    payload:   { stringValue: JSON.stringify(state) },
    updatedAt: { integerValue: String(Date.now()) },
    by:        { stringValue: (EMAIL || "jonathan@artesanosverdes.com") + " (script)" },
  }};
  const res = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  if (res.error) { console.error("❌ Écriture Firestore :", res.error.message); process.exit(1); }

  console.log(`\n✅ ${added} lot(s) ajouté(s). Total : ${state.lots.length} lots. Sync immédiate sur tous les navigateurs connectés.`);
})().catch(e => { console.error("❌ Erreur :", e.message); process.exit(1); });
