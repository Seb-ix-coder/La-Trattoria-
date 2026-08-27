KEYS DE SIGNATURE « LA TRATTORIA » — BUILD DURCI 11.1
======================================================

Fichier   : build/keystore/trattoria-release.p12
Alias     : trattoria
Type      : PKCS#12 (compatible Gradle / apksigner / cet outil)
Empreinte SHA-256 du certificat : 46d7c630da555edf45c3edcd1cda4a5c50be9c01ade5fc59f20516c234100090

MOT DE PASSE DU KEYSTORE :
HQHhrEPdmTiCTQtFYZFa8jLzIqPf2njF

⚠ CONSERVER CES INFORMATIONS HORS DU DÉPÔT GIT.
Toute mise à jour de l'application DOIT être signée avec cette
même clé. Perdre ce fichier = impossible de mettre à jour sans
désinstaller/réinstaller (et donc perdre les données).
Pour le pipeline GitHub Actions, encoder le fichier en base64 :
  base64 -w0 trattoria-release.p12   (ou : cat ... | base64)
et le placer dans le secret KEYSTORE_BASE64 ; le mot de passe
dans le secret KEYSTORE_PASSWORD.
