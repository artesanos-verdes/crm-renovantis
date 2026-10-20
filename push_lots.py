#!/usr/bin/env python3
"""Ajoute les lots manquants directement dans Firestore (crm/state).
Équivalent Python de push_lots.js, pour un Mac sans Node (python3 est fourni avec macOS).
Le mot de passe n'est JAMAIS écrit dans ce fichier : il est demandé au lancement.

Usage (dans TON Terminal) :
  cd ~/crm-renovantis && python3 push_lots.py
  ou, avec un accès admin gcloud :
  FB_TOKEN="$(gcloud auth print-access-token)" python3 push_lots.py

Anti-doublon : un lot déjà présent (même réf GreenFlex) est ignoré.
"""
import getpass
import json
import os
import random
import string
import sys
import time
import urllib.error
import urllib.request

API_KEY = "AIzaSyBIoyI1GHVePcvloM0O6m2aLYsZrhxDJrE"
PROJECT = "artesanos-verdes-renovantis"
EMAIL = os.environ.get("FB_EMAIL", "jonathan@artesanosverdes.com")
TOKEN = os.environ.get("FB_TOKEN")  # access token OAuth (gcloud) — accès admin, pas de mot de passe


def lot_id():
    return "l" + "".join(random.choices(string.ascii_lowercase + string.digits, k=7))


def A(rows):
    # [nom, kWh, m²] ou [nom, kWh, m², coût matériaux saisi]
    return [{"p": r[0], "kwh": r[1], "m2": r[2], **({"mat": r[3]} if len(r) > 3 else {})} for r in rows]


# --- Lots à insérer (ignorés s'ils existent déjà) ---
# Dossiers « Comercial Renovantis » seulement : FHE et Sacha sont exclus.
LOTS = [
    {
        "ref": "CA20260414 · G11", "vague": "Galicia 11", "ccaa": "Galicia", "date": "2026-06",
        "statut": "À facturer", "part": "GreenFlex", "mode": "detail",
        "prixKwh": 0.145, "pagoCEE": 165.60, "coutM2": 10, "splitAV": 0.5, "chargeLabel": "Pago CEE (€/dossier)",
        "actuaciones": A([
            ["Purificacion Fernandez Nuñez", 34727, 177],
            ["Angelita Alvarez Vaquero (RES010)", 55880, 322],  # surface isolée déclarée (CRM Artesanos Verdes)
            ["MARIA DEL CARMEN FERNANDEZ YAÑEZ (LG CARREETERA 37)", 9705, 61],
            ["DOMINGO SALGADO CARRACEDO (DA PENA 24)", 22162, 108],
            ["Domingo Pousada Nuñez", 33415, 204], ["Maria del Rosario Nieves Martinez", 17925, 125],
        ]),
    },
    {
        "ref": "CA20260308 · CL14", "vague": "CL 14", "ccaa": "Castilla y León", "date": "2026-05",
        "statut": "À facturer", "part": "GreenFlex", "mode": "detail",
        "prixKwh": 0.145, "pagoCEE": 174.30, "coutM2": 10, "splitAV": 0.5, "chargeLabel": "Pago CEE (€/dossier)",
        "actuaciones": A([
            ["Luis Angel del Teso Moya/ Rosaura Gallego", 13740, 88], ["Dacio Boyano Romero", 21678, 93],
            ["Maria Isabel Vasalo Sanchez", 22222, 110], ["Ignacio Dieguez Barja-RENOVANTIS", 16928, 75],
            ["Micaela Pelaez Romero-RENOVANTIS", 13256, 53], ["Encarnacion Lorenzo Baz-RENOVANTIS", 14219, 63],
            ["Judit Sabanes Ramirez (Juan Antonio Ferrero Matellanes)", 20519, 117], ["Luisa Boyano Gallego", 24500, 124],
            ["Antonio Benito Caballero (Natividad Fernandez Pelaez)", 22010, 97.55], ["Manuel Cabo Bernardo", 12938, 62],
            ["Piedad Gallego Romero (Mercedes Romero Romero)", 9904, 56],
        ]),
    },
]

DOC = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/crm/state"


def norm(s):
    return "".join(str(s or "").lower().split())


def call(url, method="GET", headers=None, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = dict(headers or {})
    if data is not None:
        h["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h)) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:  # Firestore / Identity Toolkit renvoient {"error": {...}}
        try:
            return json.load(e)
        except ValueError:
            return {"error": {"message": f"HTTP {e.code}"}}


def fail(msg):
    print("❌", msg)
    sys.exit(1)


def main():
    # 1) Authentification
    if TOKEN:
        H = {"Authorization": "Bearer " + TOKEN, "x-goog-user-project": PROJECT}
        print("✓ Auth par token OAuth (accès admin owner)")
    else:
        pwd = os.environ.get("FB_PASS") or getpass.getpass(f"Mot de passe du CRM pour {EMAIL} : ")
        auth = call(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                    "POST", body={"email": EMAIL, "password": pwd, "returnSecureToken": True})
        if not auth.get("idToken"):
            fail("Connexion échouée : " + auth.get("error", {}).get("message", "?"))
        H = {"Authorization": "Bearer " + auth["idToken"]}
        print("✓ Connecté :", EMAIL)

    # 2) Lecture de l'état courant
    doc = call(DOC, headers=H)
    if "error" in doc:
        fail("Lecture Firestore : " + doc["error"].get("message", "?"))
    payload = doc.get("fields", {}).get("payload", {}).get("stringValue")
    if not payload:
        fail("Champ payload introuvable")
    state = json.loads(payload)
    print("✓ État lu :", len(state["lots"]), "lots en ligne")

    # 3) Ajout des lots manquants (anti-doublon sur la réf GreenFlex)
    added = 0
    for lot in LOTS:
        key = norm(lot["ref"].split(" · ")[0])
        if any(norm((l.get("ref") or "").split(" · ")[0]) == key for l in state["lots"]):
            print("  ⏭  déjà présent :", lot["ref"])
            continue
        state["lots"].append({"id": lot_id(), **lot})
        print("  ➕ ajouté :", lot["ref"])
        added += 1
    if not added:
        print("Rien à ajouter — tout est déjà en ligne.")
        return

    # 4) Réécriture
    url = DOC + "?updateMask.fieldPaths=payload&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=by"
    res = call(url, "PATCH", headers=H, body={"fields": {
        "payload": {"stringValue": json.dumps(state, ensure_ascii=False, separators=(",", ":"))},
        "updatedAt": {"integerValue": str(int(time.time() * 1000))},
        "by": {"stringValue": EMAIL + " (script)"},
    }})
    if "error" in res:
        fail("Écriture Firestore : " + res["error"].get("message", "?"))
    print(f"\n✅ {added} lot(s) ajouté(s). Total : {len(state['lots'])} lots. Sync immédiate sur tous les navigateurs connectés.")


if __name__ == "__main__":
    main()
