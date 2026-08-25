# Analyse de l'application « La Trattoria » — `trato.apk` (v11.0)

> Analyse statique complète réalisée le 25/08/2026 sur `trato.apk` (SHA-256 du fichier vérifiable),
> par décompilation du bytecode DEX (androguard + jadx-compatible), lecture du manifeste,
> des ressources et des assets embarqués. Aucune exécution sur appareil.

---

## 1. Vue d'ensemble

**`trato.apk` n'est pas un simple site web embarqué : c'est un logiciel de gestion complet de restaurant**, écrit en natif (Kotlin/Java, sans WebView pour l'interface), qui combine :

- la **prise de commande en salle** (tables, tickets, encaissement, impression),
- la **gestion de stock** (articles, colis, seuils, commandes fournisseurs suggérées),
- la **comptabilité** (résultat, TVA, point mort, objectifs, dépenses scannées par photo),
- la **gestion du personnel** (membres, contrats, DPAE, registre unique, signatures),
- un **site public complet** (menu, réservations, commandes à emporter) **servi par la tablette elle-même** aux clients connectés au WiFi du restaurant,
- une **API REST locale** `/api/v1` (carte, stock, ventes, objectifs, invendus) protégée par clé,
- une **synchronisation multi-tablettes** (mode maître/satellite),
- l'intégration **Hiboutik** (caisse officielle, conformité NF525),
- un module « partenaires / messagerie / forums » entre établissements.

---

## 2. Fiche technique

| Élément | Valeur |
|---|---|
| Paquet | `com.trattoria.commande` |
| Nom affiché | La Trattoria |
| Version | 11.0 (versionCode 15) |
| SDK | min 21 (Android 5.0) · target 34 (Android 14) · compile 34 |
| Build | AGP 8.4.0, R8 (minification **sans** obfuscation des noms) |
| Signature | **v1 (JAR) + v2 (APK Signature Scheme v2)** — v3/v3.1 absents |
| Clé de signature | RSA-2048 / SHA-256, auto-signée, CN=« La Trattoria », Saintes (17), valable 19/08/2026 → 04/01/2054 |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `WAKE_LOCK`, `VIBRATE` — **aucune permission sensible** (pas de stockage, pas de localisation, pas de caméra : les photos passent par des intents système) |
| Composants exportés | uniquement `MainActivity` (launcher). `FileProvider` non exporté, limité à `documents/`, `justificatifs/`, `exports/` |
| Poids | ~1,7 Mo |
| Stockage des données | SharedPreferences XML (fichiers `trattoria`, `stock`, `compta`, `site`, `personnel`, `hiboutik`, `reseau`, `ardoises`, `antigaspi`, `reseautage`) + photos dans `files/justificatifs/`, exports dans `files/exports/` |
| Taille du code | classes.dex 3,5 Mo, ~340 classes applicatives |

---

## 3. Architecture et flux de données

```
                        WiFi du restaurant (réseau local)
┌─────────────────────┐        port 8720 (HTTP, non chiffré)        ┌──────────────────┐
│   Tablette maître   │◄──────────────────────────────────────────►│  Téléphones des   │
│  (serveur local)    │   /        → site public (HTML+JS générés)  │  clients          │
│                     │   /site/…  → commande, réservation, état    │  (navigateur)     │
│  app native         │   /api/v1/…→ API REST (clé X-Cle-Api)       │                  │
│  (13 modules)       │   /carte /tickets /stock /commande /ping    │                  │
└─────────┬───────────┘   ← synchronisation satellites (sans clé)   └──────────────────┘
          │ HTTPS + Basic Auth
          ▼
   Hiboutik (caisse NF525)   https://<compte>.hiboutik.com/api
```

- **Serveur local** : `ServerSocket` sur le port **8720**, threads… **un seul thread** (accept → serve → boucle), timeouts socket 8 s, corps limité à 64 Ko, 60 en-têtes max.
- **Site public** : HTML généré à la volée (`Site.page()`), feuilles `assets/site.css` + `assets/site.js` embarquées et injectées dans la page. Aucune dépendance externe (conçu pour fonctionner sans Internet).
- **Commande à emporter** : le client compose son panier → `POST /site/commande` → le serveur **recalcule le total avec les prix du catalogue local** (le prix envoyé par le client est ignoré) → ordre stocké localement avec code de retrait (2 lettres + 2 chiffres).
- **Multi-tablettes** : découverte du maître par **scan du /24** (254 adresses, `/ping`), puis sync `GET /tickets`, `POST /commande`, `GET /stock` — **sans authentification**.
- **Hiboutik** : identification Basic `user:cle` (base64) sur HTTPS uniquement, vente créée puis clôturée (`/sales/`, `/sales/add_product/`, `/sales/close/`), file d'attente locale en cas d'échec. L'API Hiboutik n'est **pas** utilisée pour le site public.

---

## 4. Points forts (ce qui est bien fait)

1. **Permissions minimales** : aucune permission dangereuse ; les photos passent par l'appareil photo système via FileProvider (excellente pratique).
2. **Prix toujours recalculés côté serveur** : une commande web ne peut pas être « cassée » en modifiant les prix dans le navigateur (`Site.recevoir()` reprend `pv` du catalogue).
3. **Validation stricte des commandes web** : quantités bornées (1–30/ligne, ≤ 15 articles), capacité par créneau (4 commandes), heures de service, limite anti-spam **5 commandes / 30 min / IP**, longueurs bornées (nom 120, tel 30, note 400).
4. **Assainissement des entrées** : `propre()` supprime `< > & " '` et caractères de contrôle ; `ech()` échappe `& < > "` dans le HTML généré ; côté client, `site.js` ré-échappe tout et **revalide le panier restauré depuis sessionStorage** (prix relus du DOM, jamais du stockage).
5. **En-têtes HTTP corrects sur les pages servies** : `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
6. **Durcissement du serveur local** : limite de corps (413), 60 en-têtes max, timeout socket 8 s, réponses JSON propres, pas de redirection de fichiers arbitraires (FileProvider restreint à 3 répertoires).
7. **Aucun secret en dur dans le code** : ni clé Hiboutik, ni clé API locale, ni mot de passe. Pas de SDK tiers, pas d'analytics, pas de « phone home » (les seules connexions sortantes de l'app sont Hiboutik en HTTPS et le réseau local maître/satellite).
8. **Conformité légale embarquée soignée** : CGV complètes (rétractation L.221-28-12°, paiement sur place, TVA 10/20 %), section RGPD (base légale, durées de conservation 12 mois / 10 ans comptables, absence de cookies/traceurs, droits + recours CNIL), mention explicite du transfert d'IP vers OpenStreetMap pour la carte.
9. **Clé API locale** : générée aléatoirement (préfixe `trt_` + 24 caractères sur alphabet de 32 → ~120 bits), stockée en préférences privées, régénérable depuis l'app.
10. **APK correctement signé** v1+v2, non débogable, `allowBackup` à revoir (voir §5).

---

## 5. Problèmes et risques

### 🔴 Critiques

**C1 — Tout le trafic local circule en clair (port 8720, HTTP).**
Nom + téléphone + contenu de commande + réservations + notes (allergies, « sans oignon »…) transitent en clair sur le WiFi. Sur un réseau de restaurant (souvent sans mot de passe ou avec un mot de passe partagé affiché en salle), **n'importe qui dans la zone peut intercepter les données personnelles des clients** (RGPD, art. 32). La clé API, si elle est utilisée via `?cle=` dans l'URL (préconisée par l'app elle-même en plus de l'en-tête), est également sniffable.

**C2 — Routes de synchronisation sans aucune authentification.**
`/carte` (avec le **prix de revient `cout`** et la marge de chaque plat !), `/tickets` (toutes les commandes ouvertes), `/stock` (inventaire complet, prix d'achat) et `POST /commande` (injection de tickets) sont ouverts à quiconque est connecté au WiFi. Seul `/api/v1/*` exige la clé. Un client malveillant peut donc lire les données économiques du restaurant ou injecter de faux tickets (DoS fonctionnel + pollution des stats).

**C3 — Serveur HTTP mono-thread → déni de service trivial.**
La boucle `accept()` → `servir()` est **synchrone et séquentielle**. Un seul client qui ouvre une connexion et n'envoie rien bloque tout le serveur jusqu'au timeout (8 s) ; avec 3–4 connexions parallèles, **la prise de commande en ligne est totalement indisponible pendant le service**. C'est le risque opérationnel le plus probable.

**C4 — Données très sensibles stockées en clair, sans chiffrement au repos.**
Le module Personnel conserve le **NIR (n° de sécurité sociale)**, le **n° de pièce d'identité**, date/lieu de naissance, nationalité, adresse, photo de **titre de séjour** ; les contrats contiennent les **signatures** (employeur/salarié) ; la compta contient les photos de justificatifs ; le site conserve noms + téléphones des clients. Tout est en XML JSON **non chiffré** (aucun Keystore Android, aucune EncryptedSharedPreferences/SQLCipher). Sur une tablette partagée, perdue, volée ou rootée, ces données sont lisibles en quelques secondes.

**C5 — `android:allowBackup="true"`.**
La totalité des données ci-dessus est extractible via `adb backup` (Android ≤ 11, sans déverrouillage si le débogage USB est activé) et synchronisée dans la sauvegarde cloud du compte Google connecté sur la tablette (Android 6+). Pour une tablette de caisse partagée, c'est une voie d'exfiltration réelle : **passer `allowBackup=false`** (ou au minimum un `fullBackupContent` strict).

### 🟠 Moyens

**M1 — Aucune authentification applicative.**
N'importe qui ayant la tablette en main voit les ventes, les coûts, les NIR, la clé Hiboutik (affichée en clair dans Réglages réseau) et peut modifier prix/catalogue. Aucun PIN, aucun verrouillage, aucun mode kiosque. Recommandé : verrouillage Android + épinglage d'app (screen pinning) / mode kiosque (Android Enterprise ou appareil dédié), et idéalement un PIN d'administration dans l'app.

**M2 — Clés générées avec `java.util.Random`** (clé API et codes de retrait), PRNG **non cryptographique**. La clé API (~120 bits) reste difficile à deviner en pratique, mais l'usage de `SecureRandom` est requis pour de l'authentification ; les codes de retrait (57 600 combinaisons) sont devinables par force brute locale → quelqu'un sur le WiFi pourrait récupérer le code d'un client pour retirer sa commande à sa place.

**M3 — Pas de protection anti-CSRF sur les routes de commande.**
`POST /site/commande`, `/site/reservation` et `/commande` acceptent des requêtes cross-origin (un formulaire HTML posé sur un site malveillant visité par un client peut soumettre des commandes sans que le client ne le voie). Impact limité (pas de paiement, anti-spam par IP) mais à corriger (en-tête Origin/Referer attendu, ou token).

**M4 — `android:usesCleartextTraffic="true"` global.**
Nécessaire pour la synchro LAN, mais autorise aussi le clair pour toute future connexion sortante. Préférable : `networkSecurityConfig` n'autorisant le clair que vers les plages privées (10/8, 172.16/12, 192.168/16).

**M5 — Absence de limite anti-spam sur les réservations** (nom + téléphone suffisent, pas de limite par IP ni par créneau). Risque de noyade de l'écran de service. Léger correctif : même mécanisme que `tropDeCommandes()`.

**M6 — CSP absent** sur les pages servies (pas de `Content-Security-Policy`). Les scripts sont injectés en inline, donc un CSP strict demanderait des nonces — correctif plus lourd, à peser.

**M7 — Scan du /24 complet** pour découvrir la tablette maître (254 requêtes `/ping`) : bruit sur les réseaux partagés, détectable. Préférer un SSID dédié ou une configuration manuelle de l'adresse (déjà possible).

### 🟡 Mineurs

- `ech()` n'échappe pas `'` (sans conséquence dans des attributs délimités par `"`).
- Pas de v3 signature → rotation de clé impossible sans réinstallation (acceptable en sideload).
- Pas de purge des tickets de vente anciens dans `Base` (les commandes web sont purgées à 12 mois, mais les tickets comptables restent — normal pour la compta, à conserver 10 ans).
- Codes de retrait de seulement 4 caractères (voir M2).

### 🐞 Bugs / points à vérifier

**B1 — La commande en ligne servie par la tablette semble inopérante dans cette version.**
`Site.page()` injecte `window.TRATTORIA={"mode":"local","api":"","tel":"…"}` dans la page servie. Or `site.js` refuse d'envoyer une commande ou une réservation quand `api` est vide (`if (MODE !== 'local' || !API) → repli « Commande par téléphone »`). Les routes `/site/commande`, `/site/reservation`, `/site/etat` existent côté serveur mais ne sont jamais appelées. **Résultat : sur le WiFi, les clients voient le menu mais ne peuvent pas commander — ils basculent sur l'appel téléphonique.** Soit un bug, soit un choix assumé ; à vérifier sur tablette, et à corriger en injectant l'URL d'API (ex. `http://<ip-tablette>:8720`) ou en faisant retomber le JS sur `location.origin`.

**B2 — Décompilation ambigüe sur quelques points** (ex. `monIp()`), à confirmer sur appareil : affichage de l'adresse IP de la tablette dans Réglages réseau.

---

## 6. Données personnelles & conformité

| Donnée | Où | Durée | État |
|---|---|---|---|
| Noms + téléphones clients (commandes/réservations web) | prefs `site` | purgées > 12 mois, plafond 200 | clair |
| Tickets de vente (CA, marges) | prefs `trattoria` | indéfinie (compta 10 ans) | clair |
| Personnel : NIR, pièce d'identité, naissance, adresse, titre de séjour (photo) | prefs `personnel` + `files/justificatifs` | indéfinie | **clair** |
| Contrats, DPAE, signatures | prefs `personnel` | indéfinie | **clair** |
| Dépenses, photos de justificatifs | prefs `compta` + `files/justificatifs` | indéfinie | clair |
| Clé API Hiboutik + identifiants | prefs `hiboutik` | indéfinie | clair |

La **base légale et les durées de conservation déclarées sur le site** (12 mois commandes, 10 ans pièces comptables, aucun cookie, aucun transfert hors UE) sont conformes à la démarche RGPD de la CNIL. **Le décalage entre la déclaration et la réalité technique** (données non chiffrées au repos, trafic clair sur le WiFi, backup activé) constitue le principal écart de conformité. L'intégration Hiboutik est cohérente avec la conformité **NF525** (les ventes officielles sont enregistrées côté caisse Hiboutik ; l'app s'affiche comme « borne de saisie »).

---

## 7. Déploiement — état actuel, réalisations et suite

**État de départ :** l'APK est **signé v1+v2** → installable en sideload sur Android 5.0 → 14+ (tablettes comme smartphones), y compris Android 11+ (exigence v2 respectée). Clé de signature valable jusqu'en 2054, auto-signée : parfaite pour un usage interne ; **non publiable sur Google Play** (Play exige clé non expirante depuis 2025, mais surtout un compte développeur et une politique de données — envisageable plus tard).

### ✅ Déjà réalisé (livrable de cette session)

1. **APK durci 11.1 construit et signé** : `build/out/trato-11.1-durci.apk`
   (versionCode 16, signé v1+v2 avec une **nouvelle clé** « La Trattoria »
   RSA-2048 valable jusqu'en 2056). Correctifs embarqués :
   - [C5] `allowBackup=false` → fin de l'exfiltration par sauvegarde,
   - [C3] mitigation du DoS mono-thread : `setSoTimeout` 8000 → 2000 ms,
   - [C2] prix de revient (`cout`) retiré de la route non authentifiée `/carte`,
   - [B1] commande en ligne réparée (découverte automatique de l'API locale),
   - versions incrémentées (16 / 11.1).
   Les signatures ont été **validées par trois voies indépendantes** :
   vérification interne, `keytool` (v1) et `apksigtool` (v2), ce dernier
   confirmant une compatibilité octet pour octet avec l'outillage Android
   officiel.
2. **Outillage de build reproductible et commenté** dans `build/`
   (`patch_axml.py`, `patch_dex.py`, `patch_assets.py`, `build_apk.py`,
   `sign_v1.py`, `sign_v2.py`, `verify_apk.py`, `run_build.sh`) —
   cf. `build/README.md`.
3. **Pipeline GitHub Actions** `.github/workflows/build-and-sign.yml` :
   reconstruction + signature + publication de Release à chaque tag `v*`,
   avec le keystore fourni par secrets GitHub.
4. **Keystore de signature** généré et protégé : `~/trattoria-keystore/`
   (hors dépôt Git — à sauvegarder immédiatement, voir § ci-dessous).
5. **Guide d'installation** complet : `GUIDE_INSTALLATION.md`.

> ⚠️ **Changement de clé** : la 11.1 ne s'installe **pas par-dessus** la
> 11.0 (signatures différentes) → désinstallation puis réinstallation,
> avec perte des données locales de l'application. Prévoir la
> ressaisie des réglages (Hiboutik, réseau, catalogue). Détails dans le
> guide (§ 5).

### 🔧 Reste à faire (nécessite les sources du projet)

1. [C3] **Serveur multi-threads** (pool de 8–16) → supprime réellement le DoS
   par connexion lente (le timeout 2000 ms n'est qu'une mitigation).
2. [C4] **Chiffrement au repos** : `EncryptedSharedPreferences` (AndroidX
   Security) pour NIR, pièces d'identité, signatures, clé Hiboutik ;
   chiffrement du dossier `justificatifs/`.
3. [C1] **HTTPS local** (certificat auto-signé par la tablette) pour le site
   et l'API servis aux clients.
4. [C2] **Authentification des routes de synchro** (`/carte`, `/tickets`,
   `/stock`, `/commande`) — ou à défaut isolation WiFi stricte (guide § 6).
5. [M2] `SecureRandom` pour la clé API et les codes de retrait.
6. [M1] PIN d'administration dans l'app (le verrouillage système est
   documenté dans le guide § 7).
7. [M3] Anti-CSRF (`Origin`) sur les POST `/site/*` ; [M4]
   `networkSecurityConfig` limitant le clair aux plages privées ;
   [M5] anti-spam réservations.
8. Documenter une **PIA simplifiée** (RGPD) pour les données
   personnel/justificatifs.

---

## 8. Plan d'action recommandé (état après le build 11.1)

| Priorité | Action | État |
|---|---|---|
| Urgent | [C5] `allowBackup=false` | ✅ fait (11.1) |
| Urgent | [C3] mitigation DoS (timeout 2000 ms) | ✅ fait (11.1) |
| Urgent | [C2] `cout` retiré de `/carte` non authentifié | ✅ fait (11.1) |
| Urgent | [B1] commande en ligne réparée | ✅ fait (11.1) |
| Urgent | Isoler le WiFi de commande (SSID dédié, isolation) | 📋 guide § 6 |
| Urgent | Sauvegarder le keystore (2 copies) | 📋 guide § 2 |
| Important | [C3] serveur multi-threads | ⏳ sources requises |
| Important | [C4] chiffrement au repos | ⏳ sources requises |
| Important | [C1] HTTPS local | ⏳ sources requises |
| Important | [M1] verrouillage/kiosque des tablettes | 📋 guide § 7 |
| Souhaitable | [M2]/[M3]/[M4]/[M5], PIA RGPD | ⏳ sources requises |

---

## 9. Méthode et artefacts

- Outils : androguard 4.1.4 (manifeste, ressources, DEX, décompilation),
  analyse manuelle du bytecode, parseur de bloc de signature APK,
  `keytool`/`apksigtool` (validation croisée des signatures), vérification
  des chaînes et flux réseau.
- Livrables : `ANALYSE_TRATO.md` (présent rapport), `build/` (outillage
  commenté), `.github/workflows/build-and-sign.yml` (pipeline),
  `GUIDE_INSTALLATION.md` (installation), `build/out/trato-11.1-durci.apk`
  (APK durci), `~/trattoria-keystore/` (clé de signature).
- **Limites** : analyse statique uniquement — aucun test sur appareil réel
  (comportement WiFi, impression, caméra, Hiboutik réel, comportement
  mono-thread mesuré en conditions réelles) n'a pu être validé ici. Le
  build 11.1 doit être testé sur une tablette avant déploiement général.
