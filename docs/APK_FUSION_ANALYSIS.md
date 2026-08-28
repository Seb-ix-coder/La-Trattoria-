# Diagnostic APK et stratégie de fusion

## État vérifié le 28 août 2026

Les deux familles d'APK ne sont pas interchangeables.

| APK | Package | versionName / code | Activité launcher | min / target | DEX | certificat SHA-256 |
|---|---|---:|---|---|---:|---|
| `trato-gestion-1.3.apk` | `com.trattoria.cartes` | `1.3 / 4` | `com.trattoria.cartes.MainActivity` | 21 / 33 | 115 268 octets | `46d7c630da555edf45c3edcd1cda4a5c50be9c01ade5fc59f20516c234100090` |
| `trato-12.6-stable.apk` | `com.trattoria.commande` | `12.6 / 31` | `com.trattoria.commande.MainActivity` | 21 / 34 | 3 575 204 octets | certificat différent |
| `trato-12.8-stable.apk` | `com.trattoria.commande` | `12.8 / 33` | `com.trattoria.commande.MainActivity` | 21 / 34 | 3 575 204 octets | `46d7c630da555edf45c3edcd1cda4a5c50be9c01ade5fc59f20516c234100090` |

Les signatures de `trato-12.6-stable.apk` et de la base native moderne ne
sont pas les mêmes. La 12.8 fournie dans le dépôt est une référence web
fonctionnelle et non une base d'installation de la version native : son
package est différent et ses ressources, son manifeste, ses références
`R` et son DEX appartiennent à l'autre application.

## Ce qui a été comparé

- manifeste binaire AXML et activité launcher ;
- package, versions, SDK et permissions ;
- certificat v1 et empreinte SHA-256 ;
- nombre et taille des DEX ;
- entrées ZIP `res/`, `assets/`, `classes.dex` et fichiers de signature ;
- présence de `assets/site.js` / `site.css` dans la famille `commande` ;
- sources `build/app-src/src/com/trattoria/cartes/*` de la base native ;
- données et logique `carte/` (produits, photos, cartes du jour, ardoise,
  import/export) et `communaute/`.

## Stratégie retenue

`trato-unifie-1.4-stable.apk` est compilée depuis le namespace natif
`com.trattoria.cartes` :

1. la base de ressources et le manifeste viennent de `app-src/base.apk`,
   dérivée de `trato-gestion-1.3.apk` ;
2. `MainActivity.java`, `Modules.java` et `ServeurSite.java` sont recompilés
   avec ECJ puis D8 ;
3. les assets publics 12.8 (`site.js`, `site.css`) sont intégrés comme
   ressources web, avec un shell public cohérent et une couche de notation ;
4. le serveur local natif expose la carte issue de `cartes.json`, les
   commandes, les réservations, le site, les assets et la vérification
   serveur d'un achat avant notation ;
5. aucune classe `com.trattoria.commande`, aucun `classes2.dex` et aucun
   manifeste de la 12.8 ne sont injectés ;
6. le ZIP est signé v1 + v2 après assemblage.

Cette méthode remappe implicitement les seules ressources ajoutées (assets
sans identifiants `R`) et évite le mélange dangereux de deux tables de
ressources Android. Le package final reste `com.trattoria.cartes`.

## Compatibilité et mise à jour

- la clé de `trato-gestion-1.3.apk` et celle utilisée par la version finale
  sont identiques (`46d7…0090`) lorsqu'un keystore local est disponible ;
- la version finale peut donc mettre à jour la famille
  `com.trattoria.cartes` 1.3 ;
- elle **ne peut pas** mettre à jour `com.trattoria.commande` 12.6/12.8 :
  package différent, même si le certificat est identique pour la 12.8 ;
- les données `cartes.json` restent dans le stockage de l'application native.
  Les anciennes préférences `com.trattoria.commande` ne sont pas lues
  automatiquement ; exportez-les depuis l'ancienne application avant une
  installation séparée.
