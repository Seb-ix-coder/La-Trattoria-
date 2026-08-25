# Mentions légales 2027 — Ce qui change pour les factures et le site

> Réforme de la facturation électronique (ord. 2021-1190, déc. 2022-1299) +
> passage de la franchise en base au nouveau régime (L. 233-1 du CIBS au 1er janv. 2027).
> Ce document donne les **mentions exactes** à utiliser et où les intégrer.

---

## 1. Factures — nouvelles mentions obligatoires (émission électronique)

À partir de **septembre 2027** (émission obligatoire pour les TPE), les factures
émises à des clients **professionnels** devront comporter, en plus des mentions
classiques (identité, SIREN, date, numéro, désignation, montants HT/TVA/TTC) :

| Mention | Quand | Texte |
|---|---|---|
| **Référence de la facture d'origine** | facture rectificative (avoir) | « Facture rectificative de la facture n° [n°] du [date] » |
| **TVA déjà collectée** | facture émise après une vente B2C déjà déclarée en e-reporting (ex. facture pro demandée a posteriori) | « TVA déjà collectée — opération déclarée en e-reporting » (code BT-23) |
| **Identifiants de la plateforme** | via la PDP | les identifiants de votre PDP (fournis par votre éditeur) |

> 💡 **Cas pratique restaurant** : un client professionnel (entreprise) mange chez vous et
> demande une facture **après** le règlement. Le ticket a déjà été déclaré en e-reporting B2C.
> Vous émettez la facture électronique avec la mention « TVA déjà collectée » : aucune
> double imposition.

## 2. ⚠️ Mention « franchise en base de TVA » — CHANGE au 1er janvier 2027

Si vous êtes en **franchise en base de TVA** (cas fréquent en restauration) :

| Jusqu'au 31 déc. 2026 | À partir du 1er janv. 2027 |
|---|---|
| « TVA non applicable, **art. 293 B du CGI** » | « TVA non applicable, **art. L. 233-1 du CIBS** » |

À mettre sur **toutes** vos factures et notes. Le changement de référence est
**obligatoire** — la mention actuelle devient obsolète.

> ⚠️ Vérifiez dès maintenant si vous êtes en franchise (seuil 2026 : 91 900 € pour la
> vente à emporter / 188 700 € pour la vente à consommer sur place, à confirmer selon
> votre activité principale). Votre expert-comptable confirme votre régime.

## 3. Notes de restaurant / tickets — ce qui ne change PAS

- Les **tickets de caisse** (ventes B2C) restent inchangés : pas de facture électronique,
  mais **e-reporting** de leurs données à partir de sept. 2027 (via la caisse/PDP).
- Mentions de TVA sur les tickets : inchangées (10 % alimentaire, 20 % boissons alcoolisées).

## 4. Site public de La Trattoria — mentions à vérifier

Le site public (CGV, mentions légales, politique de confidentialité) affiche déjà des
CGV complètes. Deux points à mettre à jour :

1. **Mention franchise** (si concerné) : remplacer « art. 293 B du CGI » par
   « art. L. 233-1 du CIBS » (au 1er janv. 2027).
2. **Mention facturation électronique** : ajouter une ligne dans les CGV :
   « Conformément à la réglementation en vigueur, les factures émises à des clients
   professionnels sont transmises par voie électronique via une plateforme agréée. »

> 📌 **Où le faire dans l'application** : le texte des CGV est généré par le module
> natif (`Site.java` / `Pages.java`) — sa modification nécessite les sources du projet.
> En attendant, vous pouvez :
> - imprimer un **encart** à afficher (textes prêts ci-dessous),
> - ou me fournir les sources pour que je mette à jour les chaînes et reconstruise l'APK.

## 5. Textes prêts à l'emploi

**Encart à afficher (caisse / comptoir) :**
> Facturation électronique : depuis le 1er septembre 2026, nous recevons nos factures
> fournisseurs par voie électronique. À compter de septembre 2027, les factures destinées
> aux clients professionnels sont émises au format électronique via une plateforme agréée.

**Ajout CGV site (à intégrer dans les sources) :**
> « Conformément à la réglementation en vigueur, les factures émises à des clients
> professionnels sont transmises par voie électronique via une plateforme agréée.
> Les ventes aux particuliers font l'objet d'une transmission de données à
> l'administration fiscale (e-reporting) dans les conditions prévues par la loi. »

**Mention franchise (à partir du 1er janv. 2027, si concerné) :**
> « TVA non applicable, art. L. 233-1 du CIBS »

---

## 6. Checklist mentions

- [ ] Confirmer votre régime de TVA (franchise en base ?) avec l'expert-comptable
- [ ] Mettre à jour la mention franchise sur factures/notes (au 1er janv. 2027)
- [ ] Ajouter la mention facturation électronique dans les CGV du site
- [ ] Prévoir le texte « TVA déjà collectée » pour les factures pro demandées après coup
