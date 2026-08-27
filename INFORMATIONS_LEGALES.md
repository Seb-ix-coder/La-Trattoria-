# Informations légales officielles — La Trattoria

> **Source de vérité** des mentions légales, CGV et données personnelles
> affichées sur le site et l'application (pages légales du site servi par
> l'APK, `carte/legal.html`, pieds de page). Toute modification passe ici.

## Identité

| | |
|---|---|
| Éditeur | La Trattoria |
| Forme juridique | Entreprise individuelle |
| Capital social | — |
| SIRET | 106 050 263 00016 |
| Adresse | 15 rue de la poste, 17100 Saintes |
| Téléphone | [06 27 21 31 90](tel:0627213190) |
| Email | [alexis.coudret@outlook.fr](mailto:alexis.coudret@outlook.fr) |
| Directeur de la publication | Le gérant de La Trattoria |
| Hébergeur | LWS (Ligne Web Services) — https://www.lws.fr |

## Où ces informations sont affichées

| Endroit | Mécanisme |
|---|---|
| **Site de l'application** (pages `#mentions`, `#cgv`, `#donnees`) | addon `LEGAL_ADDON` de `build/integrer_carte.py` (injection dans le DOM — le contenu d'origine généré par le moteur est remplacé à l'affichage, sans patch du DEX) |
| **Section contact du site** | encadré « SIRET — Contact » ajouté dans `#contact` |
| **Module carte — page publique** (`carte/public.html`) | pied de page (SIRET + lien `legal.html`) |
| **Module carte — page légale** (`carte/legal.html`) | page complète : mentions + CGV + données personnelles |
| **Ardoise (imprimable/publique)** | pied : adresse, téléphone, SIRET (`carte/carte.js` + `carte/apercu-carte.html`) |

## Horaires de commande (CGV)

- Lundi – Jeudi : 11h30 – 14h30 / 18h30 – 22h30
- Vendredi – Samedi : 11h30 – 14h30 / 18h30 – 23h
- Dimanche : 11h30 – 14h30 / 18h30 – 22h30

## Modifier ces informations

1. Mettre à jour ce document ;
2. `build/mentions_legales_addon.js` (textes injectés dans le site de l'APK) ;
3. `carte/legal.html`, pieds de `carte/public.html`, `carte/carte.js`,
   `carte/apercu-carte.html` ;
4. Relancer `./build/run_build_stable.sh --version-name=12.3 --version-code=…`
   (l'addon vit dans `site.js` embarqué).

Voir aussi `MENTIONS_LEGALES_2027.md` (réforme facturation électronique 2027).
