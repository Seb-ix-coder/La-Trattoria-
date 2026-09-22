# Cartes A4 — impression

### Aperçu partageable et modifiable

Ouvrir `preview-modifiable.html` pour présenter les quatre cartes dans une
interface unique. Le bouton **Modifier cette carte** permet d’ajuster les textes
et les prix localement avant impression. Le bouton **Télécharger la version
modifiée** permet ensuite d’envoyer le fichier corrigé à une autre personne.

Les modifications sont locales au navigateur : elles ne changent pas le dépôt
et ne sont pas visibles par les autres personnes tant que le fichier modifié
n’a pas été téléchargé puis envoyé.

`cartes-contact-a4.html` fournit 10 cartes de contact au format portefeuille
85 × 55 mm sur une feuille A4, à découper. `07-carte-restaurant-economique.html`
regroupe le menu essentiel sur une seule feuille A4 pour économiser du papier.
`08-carte-boissons.html` propose une fiche boissons illustrée. La carte mobile
`../offre-20.html` affiche le bon spécial **-20 %**, demande seulement un moyen
de contact et un consentement distinct, puis permet à la personne d’envoyer
volontairement ses coordonnées à La Trattoria par sa messagerie.

Chaque fichier HTML est une carte indépendante conçue pour tenir sur **une
seule page A4** et fonctionner avec une imprimante standard, sans connexion ni
dépendance externe. La direction graphique papier utilise le même langage que
l’aperçu administrateur : papier ivoire, vert profond, filet or et accent
bordeaux.

1. Ouvrir le fichier voulu dans Chrome, Edge, Firefox ou Safari ;
2. cliquer sur **Imprimer cette carte** ;
3. choisir papier **A4**, échelle **100 %** ou « taille réelle » ;
4. désactiver les en-têtes et pieds de page du navigateur ;
5. imprimer une seule page.

Fichiers :

- `01-carte-principale.html` — pizzas, salades, pâtes fraîches, tiramisus et formules ;
- `02-carte-pizzas.html` — carte pizzas seule ;
- `05-carte-salades.html` — carte salades seule ;
- `06-carte-formules.html` — formules seules, pour le porte-vue ;
- `08-carte-boissons.html` — carte boissons illustrée, une page A4 ;
- `07-carte-restaurant-economique.html` — menu complet compact ;
- `03-glaces-langelys.html` — glaces et sorbets L’Angelys seuls ;
- `04-bieres-du-moment.html` — bières du moment seule.

Les prix et le catalogue viennent de `carte/donnees.js`. Régénérer les quatre
cartes principales après une modification avec :

```bash
python3 build/generer_cartes_a4.py
python3 build/generer_cartes_a4_complement.py
python3 build/generer_carte_eco.py
python3 build/generer_carte_boissons.py
python3 build/ajouter_illustrations_cartes.py
python3 build/generer_preview_modifiable.py
```

La « Formule Grande Faim » et la « Formule Midi Pâtes » sont des offres
commerciales ajoutées pour cette impression et doivent être confirmées en
caisse avant publication dans l’application.
