# Audit sécurité hebdomadaire

Le workflow `Hibou Weekly Security Audit` s’exécute chaque lundi matin et peut aussi être lancé manuellement.

Il est **lecture seule** :
- `permissions: contents: read` ;
- aucun secret requis ;
- aucun appel à Airtable, Lemon, Vercel ou réseaux sociaux ;
- aucun déploiement ;
- aucun backup réel.

Contrôles :
1. recherche statique de secrets/constructs dangereux ;
2. audit strict de toutes les routes API (zéro `needs_review`) ;
3. inventaire des références GitHub Actions mutables ;
4. vérification que le plan de backup reste exécutable en dry-run.

L’audit des actions est volontairement informatif tant que toutes les anciennes workflows historiques n’ont pas été remises à niveau. Le workflow lui-même utilise uniquement des Actions épinglées par SHA.
