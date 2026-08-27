# Facturation électronique & e-reporting — Guide de mise en conformité « La Trattoria »

> Dernière vérification : **25 août 2026**. La réception des factures électroniques
> devient obligatoire pour TOUTES les entreprises **le 1er septembre 2026 — dans 7 jours**.
> Ce guide est une synthèse pratique ; les textes de référence sont l'ordonnance
> n° 2021-1190 et le décret n° 2022-1299 (réforme « facturation électronique »).

---

## 1. Le calendrier officiel (à jour)

| Échéance | Qui | Obligation |
|---|---|---|
| **1er sept. 2026** | **Toutes** les entreprises assujetties à la TVA | **Recevoir** les factures électroniques (via plateforme agréée) |
| 1er sept. 2026 | Grandes entreprises & ETI | Émettre + e-reporting |
| **1er sept. 2027** | **PME, TPE, micro** (La Trattoria) | **Émettre** (B2B) + **e-reporting** (B2C) |

**Pour La Trattoria (TPE) :**
- **Maintenant →** pouvoir **recevoir** les factures électroniques de ses fournisseurs ;
- **Sept. 2027 →** émettre des factures électroniques uniquement pour les clients **professionnels**
  (repas d'affaires, séminaires, plateformes de réservation B2B) — seuil **150 € HT** ou à la demande du client ;
- **Sept. 2027 →** transmettre à la DGFiP les **données de ventes B2C** (e-reporting) : CA par taux de TVA,
  mode de paiement… — c'est la caisse + la plateforme qui s'en chargent.

> 💡 Les ventes aux particuliers (90 % du CA d'un restaurant) ne donnent **pas** lieu à facture
> électronique : elles relèvent du **e-reporting** (transmission de données, pas des tickets).

---

## 2. VOS 3 ACTIONS URGENTES (cette semaine)

### ✅ Action 1 — Choisir et activer une plateforme (PDP ou PPF)
Vous devez être **joignable** par les plateformes de vos fournisseurs dès le 1er septembre.
Sans PDP choisie, vos fournisseurs ne pourront pas vous facturer électroniquement.

| Solution | Coût | Pour qui | Verdict |
|---|---|---|---|
| **PPF** (Portail Public de Facturation, via impots.gouv) | **Gratuit** | Tous | Minimum légal, interface basique, pas d'e-reporting automatisé complet |
| **PDP via votre expert-comptable** (Pennylane, Sage, Cegid, Tiime…) | souvent inclus dans les honoraires | TPE | **Recommandé** : le cabinet gère réception + émission + e-reporting |
| **PDP directe** (Tiime gratuit / autres 10–40 €/mois) | gratuit à ~40 €/mois | TPE/PME | Bon si pas d'expert-comptable |

**Action :** appelez votre expert-comptable cette semaine et demandez « **activez ma PDP pour la
réception des factures électroniques** ». Sinon, créez un compte sur le PPF (gratuit).

### ✅ Action 2 — Vérifier la caisse Hiboutik (NF525 + e-reporting)
La Trattoria transmet déjà ses ventes à **Hiboutik** (conformité NF525).
→ **Contactez Hiboutik** : proposent-ils un module **e-reporting** (transmission B2C à la DGFiP via une PDP) ?
Si oui, rien à faire côté application pour sept. 2027. Si non, prévoyez une PDP qui s'intègre à Hiboutik
ou un export périodique (cf. `build/export_e_reporting.py`).

### ✅ Action 3 — Anticiper l'émission (sept. 2027)
- Récupérez vos **mentions légales à jour** (`MENTIONS_LEGALES_2027.md`) ;
- Vérifiez que votre logiciel de caisse sait émettre une **facture pro** (au-delà de 150 € HT) ;
- À partir de janv. 2027, si vous êtes en franchise en base : la mention « TVA non applicable,
  art. 293 B du CGI » devient « **TVA non applicable, art. L. 233-1 du CIBS** » (⚠️ changement de référence !).

---

## 3. Ce qui est livré (intégré à l'application ET en scripts)

### 🏠 Intégré à l'application (APK 11.2, déjà installé)
Depuis la page servie par la tablette (`http://<ip-tablette>:8720`) :

| Outil | Accès | Fonction |
|---|---|---|
| **Export e-reporting** | `…/#ereporting` | Choisissez la période → tableau des ventes par jour → **Télécharger le CSV / XML** (données via la nouvelle route locale `/site/ventes`) |
| **Registre Factur-X** | `…/#factures` | Déposez une facture fournisseur (XML Factur-X ou PDF) → contrôle des champs → ajout au **registre local** → export du registre en CSV |

Ces écrans sont accessibles sur la tablette elle-même ou depuis un poste
du bureau (même réseau), via le **bouton ⚙** (en bas à gauche) ou le hash
de l'URL. L'accès est protégé par un **code PIN à 4 chiffres** défini à la
première utilisation (protection légère côté navigateur — le réseau local
reste la frontière principale). L'APK 11.2 s'installe **par-dessus** la
version actuelle (même clé), données conservées.

### 🖥️ En scripts (poste du bureau)

| Outil | Fichier | Rôle |
|---|---|---|
| Export e-reporting | `build/export_e_reporting.py` | Interroge l'API de la tablette (`/api/v1/ventes`, clé API) et génère un **CSV+XML e-reporting** par jour |
| **Planification auto** | `build/planifier_export.sh --install` | Export **quotidien automatique** de la veille (06h10) dans `~/ereporting/AAAAMM/` |
| Archivage Factur-X | `build/facturx_archivage.py` | Contrôle et archive les **factures Factur-X** reçues (XML ou PDF), registre CSV 10 ans |
| Mentions légales | `MENTIONS_LEGALES_2027.md` | Nouvelles mentions obligatoires + textes prêts à l'emploi |
| Ce guide | `FACTURATION_ELECTRONIQUE.md` | Synthèse + checklist |

---

## 4. Checklist complète

**Avant le 1er septembre 2026 (réception)**
- [ ] PDP activée (expert-comptable ou PPF) — **cette semaine**
- [ ] Adresse de réception (SIREN) communiquée aux principaux fournisseurs
- [ ] Test : recevoir une facture électronique de test et l'archiver (script Factur-X)

**Avant septembre 2027 (émission + e-reporting)**
- [ ] Hiboutik : module e-reporting activé (ou export via l'app `/#ereporting` ou le script)
- [ ] **Planifier l'export automatique** : `bash build/planifier_export.sh --install` (une fois, avec IP + clé)
- [ ] Mentions légales mises à jour (dont mention franchise si concerné)
- [ ] Procédure « facture client professionnel > 150 € HT » au format électronique
- [ ] Archivage 10 ans des factures (règle comptable) — registre intégré `/#factures` + scripts
