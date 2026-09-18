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
    ref: "CA20260255 · G3", vague: "Galicia 3", ccaa: "Galicia", date: "2026-03",
    statut: "À facturer", part: "GreenFlex", mode: "detail",
    prixKwh: 0.145, pagoCEE: 165.60, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: A([
      ["Anibal Sierra Rodríguez",16448,93],["Maria Rosa Coutiño Coutiño CADAVOS 52",16928,75],
      ["José Jaime Yañez Sierra",18924,107],["Amando Prieto Bruña",15960,79],
      ["Eduardo García Piornedo",28438,126],["Dosinda García Pérez",17830,79],
      ["Eloy Vazquez Prieto",28980,107],["Cristina Baldin Marin",17823,72.11],
      ["Rosana Leticia Molina Jijón/Allen",23821,95.24],["Tamara Ballesteros Vidueira",20087,89],
      ["Ana María Mauri Santiuste",23021,102],["María Luisa Estevez Rodríguez",20457,95],
      ["Jose Avelino Alves Pinto De Caraballo",19847,90],["Manuel Perez Estevez AV CONST 10",36563,162],
      ["José Luis Macia Da Silva",20539,91],
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
