#!/usr/bin/env node
/* Déploie les règles de sécurité Firestore via l'API firebaserules,
   avec un access token gcloud (pas de mot de passe).

   Usage (dans TON Terminal) :
     export CLOUDSDK_PYTHON=/opt/homebrew/opt/python@3.12/bin/python3.12
     FB_TOKEN="$(gcloud auth print-access-token)" node deploy_rules.js
*/

const PROJECT = "artesanos-verdes-renovantis";
const TOKEN = process.env.FB_TOKEN;
if (!TOKEN) { console.error("❌ Fournis FB_TOKEN=\"$(gcloud auth print-access-token)\""); process.exit(1); }

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /crm/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}`;

const H = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", "x-goog-user-project": PROJECT };
const BASE = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;

(async () => {
  // 1) Créer un ruleset
  const rs = await fetch(`${BASE}/rulesets`, {
    method: "POST", headers: H,
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: RULES }] } }),
  }).then(r => r.json());
  if (!rs.name) { console.error("❌ Création ruleset :", JSON.stringify(rs.error || rs)); process.exit(1); }
  console.log("✓ Ruleset créé :", rs.name);

  // 2) Publier le ruleset sur la release Firestore (create, sinon update)
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  let rel = await fetch(`${BASE}/releases`, {
    method: "POST", headers: H,
    body: JSON.stringify({ name: releaseName, rulesetName: rs.name }),
  }).then(r => r.json());

  if (rel.error && (rel.error.code === 409 || /exist/i.test(rel.error.message || ""))) {
    // La release existe déjà → mise à jour
    rel = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ release: { name: releaseName, rulesetName: rs.name } }),
    }).then(r => r.json());
  }
  if (rel.error) { console.error("❌ Publication release :", JSON.stringify(rel.error)); process.exit(1); }

  console.log("✅ Règles Firestore déployées. Le CRM peut désormais lire/écrire pour les utilisateurs connectés.");
})().catch(e => { console.error("❌ Erreur :", e.message); process.exit(1); });
