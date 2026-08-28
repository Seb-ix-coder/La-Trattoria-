# Diagnostic APK et stratégie de fusion

## Comparaison vérifiée le 28 août 2026

| APK | Package | versionName / code | Activité launcher | min / target | DEX |
|---|---|---:|---|---|---:|
| `trato-gestion-1.3.apk` | `com.trattoria.cartes` | `1.3 / 4` | `com.trattoria.cartes.MainActivity` | 21 / 33 | 115 268 octets |
| `trato-12.6-stable.apk` | `com.trattoria.commande` | `12.6 / 31` | `com.trattoria.commande.MainActivity` | 21 / 34 | 3 575 204 octets |
| `trato-12.8-stable.apk` | `com.trattoria.commande` | `12.8 / 33` | `com.trattoria.commande.MainActivity` | 21 / 34 | 3 575 204 octets |

Les deux familles ont des manifests, ressources, tables `R`, DEX et modèles
de persistance distincts. La base moderne est signée par le certificat
`46d7c630da555edf45c3edcd1cda4a5c50be9c01ade5fc59f20516c234100090`; la
12.6 utilise un certificat différent. La 12.8 de référence est signée avec
le même certificat que la base moderne, mais son package reste différent : ce
n'est donc pas une mise à jour Android de la base Gestion.

L'analyse a contrôlé AXML, package, activité launcher, versions, SDK,
permissions, certificat v1, entrées ZIP, `assets/site.js`/`site.css`, DEX et
les sources `carte/`, `communaute/` et `build/app-src/src`.

## Stratégie retenue

`trato-unifie-1.4-stable.apk` est reconstruite depuis le namespace
`com.trattoria.cartes` :

1. base de ressources et manifest issus de `build/app-src/base.apk`, dérivé de
   `trato-gestion-1.3.apk` ;
2. compilation de `MainActivity.java`, `Modules.java` et `ServeurSite.java` ;
3. ajout d'assets publics (`site.js`, `site.css`, shell responsive, notation)
   sans fusion de ressources Android ni changement de `R` ;
4. serveur local natif pour carte administrée, commande, réservation, assets,
   authentification locale et notation après achat confirmé par `plat_id` ;
5. aucune classe `com.trattoria.commande`, aucun `classes2.dex`, aucun
   remplacement arbitraire de `classes.dex` ;
6. signature v1 + v2 après assemblage.

Le package final est unique : `com.trattoria.cartes`. Le point d'entrée est
`com.trattoria.cartes.MainActivity`.

## Compatibilité

La version finale a un `versionCode` 5 et un `versionName` 1.4. Avec le
keystore de la base moderne, elle met à jour la famille `com.trattoria.cartes`
1.3. Elle ne met pas à jour `com.trattoria.commande` 12.6 ou 12.8 :
package différent. Il faut exporter les données de l'ancienne application et
installer la nouvelle séparément ; le code de migration des achats/notes est
documenté dans `docs/MIGRATION_RATING.md`.
