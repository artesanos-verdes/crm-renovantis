#!/usr/bin/env node
/* Initialise le document crm/state dans Firestore à partir d'un export JSON
   du CRM (état de référence). À lancer UNE fois, juste après la création de
   la base. Refuse d'écraser si le document contient déjà des lots (sauf --force).

   Usage (dans TON Terminal) :
     export CLOUDSDK_PYTHON=/opt/homebrew/opt/python@3.12/bin/python3.12
     FB_TOKEN="$(gcloud auth print-access-token)" node init_firestore.js
*/

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT = "artesanos-verdes-renovantis";
const TOKEN = process.env.FB_TOKEN;
const FORCE = process.argv.includes("--force");
const REF_FILE = process.env.REF_FILE ||
  path.join(os.homedir(), "Downloads", "crm-renovantis-2026-09-07-avec-G4.json");

if (!TOKEN) { console.error("❌ Fournis FB_TOKEN=\"$(gcloud auth print-access-token)\""); process.exit(1); }
if (!fs.existsSync(REF_FILE)) { console.error("❌ Fichier de référence introuvable :", REF_FILE); process.exit(1); }

const state = JSON.parse(fs.readFileSync(REF_FILE, "utf8"));
if (!state.lots || !Array.isArray(state.lots)) { console.error("❌ Le fichier n'a pas de tableau .lots"); process.exit(1); }

const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/crm/state`;
const H = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };

(async () => {
  // 1) Vérifier l'état actuel du document (ne pas écraser des données existantes)
  const cur = await fetch(DOC, { headers: H }).then(r => r.json());
  const existing = cur && cur.fields && cur.fields.payload && cur.fields.payload.stringValue;
  if (existing && !FORCE) {
    try {
      const s = JSON.parse(existing);
      if (s.lots && s.lots.length) {
        console.error(`⚠️  Le document crm/state contient déjà ${s.lots.length} lots.`);
        console.error("   Init annulée pour ne rien écraser. Relance avec --force si tu es sûr.");
        process.exit(1);
      }
    } catch (e) { /* payload illisible → on peut initialiser */ }
  }

  // 2) Écrire l'état de référence
  const url = DOC + "?updateMask.fieldPaths=payload&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=by";
  const body = { fields: {
    payload:   { stringValue: JSON.stringify(state) },
    updatedAt: { integerValue: String(Date.now()) },
    by:        { stringValue: "jonathan@artesanosverdes.com (init)" },
  }};
  const res = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify(body) }).then(r => r.json());
  if (res.error) { console.error("❌ Écriture Firestore :", JSON.stringify(res.error)); process.exit(1); }

  console.log(`✅ Firestore initialisé avec ${state.lots.length} lots (source : ${path.basename(REF_FILE)}).`);
  console.log("   Recharge le CRM en ligne : il doit passer en « ● synchronisé ».");
})().catch(e => { console.error("❌ Erreur :", e.message); process.exit(1); });
