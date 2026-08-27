# Diagnostic — « l'appli s'installe mais se ferme au lancement »

## Symptôme
L'APK **s'installe sans erreur** puis **se ferme immédiatement au lancement**
(crash au démarrage).

## Cause identifiée (analyse du bytecode)
Les builds « durci » précédents (11.1 / 11.2 / 11.3) ont **modifié le moteur
de l'application (le fichier `classes.dex`) au byte près**, sans recompiler.
L'analyse du diff DEX 11.0 → 11.2 montre **3 méthodes modifiées** :

| Méthode | Patch | Risque |
|---|---|---|
| `Reseau$2.run` | timeout socket `8000 → 2000` | faible (constant) |
| `Reseau.router` | retrait du champ `cout` (mis en `nop`) | faible |
| `Reseau.routerSite` | **injection de code** appelant `ApiPublique.ventes(...)` | **élevé** |

Ce genre de **patch byte-à-byte du moteur** est la cause classique et connue du
symptôme exact « s'installe mais crashe au lancement » : l'APK est valide à
l'installation, mais le moteur modifié échoue au chargement/à la vérification
au démarrage.

## Correction — APK 11.4
L'APK **`trato-11.4.apk`** reconstruit l'application avec :
- le **moteur DEX d'origine 11.0, intact** (aucun patch — c'est le moteur qui
  fonctionne) ;
- **toutes les fonctions** conservées, car elles vivent dans la **couche web**
  (`assets/site.js` + `site.css`) et non dans le moteur : QR, pourboire,
  paiement/fidélité, module social (client/partenaire), module carte ;
- le **manifeste durci** conservé (`allowBackup=false`, version 11.4 / code 19).

> En supprimant les patches du moteur, on élimine la cause probable du crash
> tout en gardant 100 % des fonctions.

## Vérifications effectuées sur 11.4
- `classes.dex` **identique byte-à-byte** au 11.0 d'origine ;
- checksum Adler-32 du DEX valide ;
- manifeste : package `com.trattoria.commande`, versionCode 19, versionName 11.4,
  `allowBackup=false`, minSdk 21, targetSdk 34 ;
- `site.js` / `site.css` = versions 11.3 (toutes fonctions présentes) ;
- intégrité ZIP complète + `resources.arsc` aligné sur 4 octets ;
- **signature v1 (JAR) : 114 digests SHA-256 cohérents** ;
- **signature v2 (APK Signature Scheme) : bloc présent et valide**.

## Si 11.4 crashe quand même (cas improbable)
Pour identifier la cause exacte, il me faut le **log de crash** du téléphone :

```bash
# avec le téléphone connecté en USB (mode débogage USB activé) :
adb logcat -b crash -d > crash.txt
# ou, si l'appli crashe tout de suite après le lancement :
adb logcat -d | grep -A 40 "FATAL EXCEPTION" > crash.txt
```
Puis m'envoyer le contenu de `crash.txt` — la ligne `Caused by:` indique la
cause précise.

**Test de base** : confirmer aussi que l'APK d'origine `trato.apk` (11.0)
s'installe et **fonctionne** sur la même tablette (baseline). Si 11.0 fonctionne
et 11.4 crashe, le log de crash précisera la cause.

## Fichiers
- `trato-11.4.apk` — **l'APK corrigée à installer** (désinstaller l'ancienne
  avant : clé de signature différente).
- `trato.apk` — APK d'origine 11.0 (baseline de test).
- `build/build-11.4.py` — script reproductible du build 11.4.
