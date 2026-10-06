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
    ref: "CA20260295 · G7", vague: "Galicia 7", ccaa: "Galicia", date: "2026-04",
    statut: "Facturé", part: "GreenFlex", mode: "detail",
    prixKwh: 0.145, pagoCEE: 165.60, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: A([
      ["Elisa Martinez Alvarez",14198,102],["Maria Isabel Fernandez Suevos",18318,142],
      ["Jesus Luis Barrera (Abel)",16654,121],["Maria Teresa Castro Bermudez",21313,105.5],
      ["Juan Jose Fernandez Luis",14794,84],["Oliria Luis Dos Santos (Francisco Javier Cañero Luis)",11477,66],
      ["Felisa Inmaculada Fernandez Fernandez / Luis Felipe Fernandez",58775,263],["Rocio Dos Anjos Mendez",9525,61],
      ["Francisco Fernandes Pires (Maria Fatima Perez Da Silva)",19798,98],["Maria Josefa Dosantos Escuredo (Jose Dosantos)",18959,84],
      ["Aurea Fernandez Luis",15824,108],["Maria Magdalena Morais Silva",10435,59],
      ["Maria Nieves Varela Conde",21931,124],["Maria Dolores Gil Gonzalez",20516,116],
      ["Josefa Martinez Garcia",16566,82],
    ]),
  },
  {
    ref: "CA20260296 · G8", vague: "Galicia 8", ccaa: "Galicia", date: "2026-04",
    statut: "Facturé", part: "GreenFlex", mode: "detail",
    prixKwh: 0.145, pagoCEE: 165.60, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: A([
      ["Jose Villarino Alvarez (Juan Miguel Rodriguez)",16475,123],["Carmen Garcia Rodriguez",11196,55.42],
      ["Eva Barja Dominguez",22975,97],["Martina Bembibre Asenjo (Lg Pereiro, O 33)",31958,143],
      ["Benito Fernández Justo",21797,152],["Maria Luz Fernández Luis",23924,106],
      ["Jose Villarino Alvarez",14219,63],["Marina Fernández Luis",14856,84],
      ["Francisco Fernandes Pires (Josefa Gomez Garcia)",21223,120],["Manuel Guerra Perez",15194,87],
      ["María Carmen Rivera Ponte",21454,96],["Vicente Rodriguez Murias",7672,64],
      ["Pilar Piornedo Dominguez",25730,114],["Maria Amparo Casares Vidueira",29792,132],
      ["Antonio Blanco Martinez",26181,116],
    ]),
  },
  {
    // Pago CEE réel par perito : Icerti 174,30 €/dossier, Termogenia 180,41 €/dossier
    ref: "CA20260157 · CL2025", vague: "CL 2025", ccaa: "Castilla y León", date: "2026-03",
    statut: "Facturé", part: "GreenFlex", mode: "detail",
    prixKwh: 0.140, pagoCEE: 174.30, coutM2: 10, splitAV: 0.5, chargeLabel: "Pago CEE (€/dossier)",
    actuaciones: [
      ["Basilio Rabanedo Fernandez",18348,87,"Icerti",174.30],["Maria Soledad Bruña Martinez",10951,49,"Icerti",174.30],
      ["José Álvarez Fernández",22996,102.9,"Icerti",174.30],["Basilisa Muela Granja",10315,71,"Icerti",174.30],
      ["Mariano Bahillo Magdaleno",9989,91.21,"Termogenia",180.41],["Maria del Carmen Martinez Martinez",15878,104.6,"Termogenia",180.41],
      ["Antonio Abad Marban",7619,45.03,"Termogenia",180.41],["Jobita Esmeralda Arreaga Herrera",21026,103.68,"Termogenia",180.41],
    ].map(a => ({ p: a[0], kwh: a[1], m2: a[2], perito: a[3], pago: a[4] })),
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
