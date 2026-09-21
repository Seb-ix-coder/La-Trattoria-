# Monetico Paiement — intégration La Trattoria

L’application propose désormais un parcours **Carte bancaire → Monetico Paiement**.
La clé commerçant reste exclusivement côté serveur : elle n’est ni dans l’APK,
ni dans `site.js`, ni dans le navigateur.

## Architecture

```text
site client
   │ POST /api/monetico/prepare (panier et coordonnées)
   ▼
carte/monetico_gateway.py       ← recalcule le panier, signe HMAC-SHA1
   │ formulaire HTML signé
   ▼
Monetico Paiement
   │ POST /api/monetico/notify (notification signée)
   ▼
relais : commande pending → paid/refused
```

L’interface de paiement ouvre la page Monetico en redirection complète. Cela
évite de saisir les données de carte dans l’application et reste compatible
avec l’authentification 3-D Secure. Le bouton « Espèces » et le règlement au
retrait restent disponibles.

## Configuration

Créer un fichier de catalogue à jour, servi uniquement au relais :

```bash
python3 - <<'PY'
import json, re
s = open('carte/donnees.js', encoding='utf-8').read()
m = re.search(r'window\.TRATTORIA_CATALOGUE\s*=\s*(\[.*?\]);\s*$', s, re.S)
items = json.loads(m.group(1))
json.dump([{'id': p['id'], 'nom': p.get('nom', ''),
            'pv': p['pv'], 'actif': p.get('actif', True)} for p in items],
          open('/srv/la-trattoria/catalogue.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
PY
```

Lancer le relais en environnement de test :

```bash
MONETICO_ENV=test \
MONETICO_TPE=1234567 \
MONETICO_SOCIETE=monSite \
MONETICO_KEY_HEX='CLE_FOURNIE_PAR_MONETICO' \
MONETICO_PUBLIC_URL='https://paiement.example' \
MONETICO_CATALOGUE_FILE='/srv/la-trattoria/catalogue.json' \
MONETICO_ALLOWED_ORIGINS='https://latrattoria-saintes.fr' \
MONETICO_ORDER_STORE='/var/lib/la-trattoria/monetico-orders.json' \
python3 carte/monetico_gateway.py
```

Déclarer ensuite dans l’espace commerçant Monetico l’URL de notification :

```text
https://paiement.example/api/monetico/notify
```

En production, utiliser `MONETICO_ENV=production` et une URL publique HTTPS.
Le service refuse de préparer un paiement de production si l’URL n’est pas en
HTTPS. La clé réelle ne doit être fournie que par variable d’environnement ou
par un gestionnaire de secrets, jamais par un fichier distribué avec l’APK.

## Vérifications avant ouverture

1. Vérifier `GET /api/monetico/status` et l’absence de variable manquante.
2. Tester avec le TPE Monetico de test et vérifier la notification signée.
3. Vérifier qu’un prix modifié dans le navigateur est ignoré : le relais
   recalcule le total depuis `MONETICO_CATALOGUE_FILE`.
4. Vérifier le scénario refusé, le scénario 3-D Secure et la notification
   reçue deux fois : le stockage par référence rend la mise à jour idempotente.
5. Passer en production uniquement après validation du TPE par Monetico.

La documentation technique Monetico Paiement v2.0 indique les champs `TPE`,
`version`, `date`, `montant`, `reference`, `MAC`, `lgue`, `societe` et
`contexte_commande`, ainsi que les interfaces « Aller » et « Retour ». Le
relais respecte la signature HMAC-SHA1 et répond à la notification par
`version=2` / `cdr=0`, sans tenir compte de la réussite du paiement pour
accuser réception.
