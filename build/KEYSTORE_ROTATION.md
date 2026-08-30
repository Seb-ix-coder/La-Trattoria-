# Signature Android — procédure de rotation

Les secrets de signature ne sont pas stockés dans Git. Les fichiers historiques
`build/keystore/` ont été retirés de l'arbre courant car leur confidentialité
était compromise.

## P0 — à faire avant toute diffusion

1. Considérer l'ancienne clé comme compromise : elle ne doit plus servir à
   signer une version publiée.
2. Générer une nouvelle clé dans un coffre dédié :

   ```bash
   python3 build/generate_keystore.py "$HOME/.secrets/la-trattoria-keystore"
   chmod 700 "$HOME/.secrets/la-trattoria-keystore"
   chmod 600 "$HOME/.secrets/la-trattoria-keystore"/*
   ```

3. Conserver au moins deux sauvegardes chiffrées indépendantes.
4. Configurer le CI avec `KEYSTORE_BASE64` et `KEYSTORE_PASSWORD`, ou lancer
   le build avec `KEYSTORE_PATH` et `KEYSTORE_PASSWORD`. Ne jamais placer ces
   valeurs dans un fichier suivi par Git.
5. Comme Android ne permet pas de révoquer une clé d'APK à distance, la
   première version signée avec la nouvelle clé nécessitera la désinstallation
   de l'ancienne application. Prévenir le restaurant et exporter les données
   locales avant l'opération.

## Build local

```bash
export KEYSTORE_PATH="$HOME/.secrets/la-trattoria-keystore/trattoria-release.p12"
export KEYSTORE_PASSWORD='valeur lue depuis le coffre, jamais commitée'
./build/run_build_stable.sh --version-name=13.0 --version-code=32
```

Les scripts refusent désormais explicitement un keystore placé dans le dépôt
(et notamment sous `build/keystore/`).

## Nettoyage GitHub à coordonner

La suppression de fichiers ne retire pas les secrets des commits déjà publiés.
Après rotation, un mainteneur doit réécrire l'historique GitHub avec un outil
validé (par exemple `git filter-repo`), vérifier les branches/tags et forcer la
mise à jour de manière coordonnée. Les APK historiques doivent être retirés
ou marqués comme révoqués dans les releases.
