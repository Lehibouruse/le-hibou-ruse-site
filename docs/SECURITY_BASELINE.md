# Sécurité de référence — Le Hibou Rusé

Dernière mise à jour : 24/09/2026.

## Objectif

Réduire la surface d’attaque du projet sans exposer de secrets et sans confondre :
- code présent ;
- runtime configuré ;
- permission externe accordée ;
- publication/achat réellement autorisé.

## Périmètre

- GitHub / GitHub Actions ;
- Vercel et routes `/api/*` ;
- Airtable ;
- Lemon Squeezy ;
- connecteurs sociaux ;
- worker Windows local ;
- pipeline vidéo local ;
- Library / artefacts du livre et des vidéos.

## Principes obligatoires

1. **Fail closed par défaut**
   - absence de secret/configuration => refus ;
   - absence d’approbation externe => refus ;
   - absence de validation humaine requise => refus de publication.

2. **Secrets hors code et hors Airtable**
   - secrets uniquement côté serveur, coffre dédié ou machine locale ;
   - jamais de secret dans Git, Library, logs ou captures ;
   - rotation immédiate si exposition suspectée.

3. **Moindre privilège**
   - tokens limités au minimum nécessaire ;
   - scopes séparés TEST/LIVE ;
   - comptes techniques distincts si possible ;
   - pas d’accès navigateur/cookies depuis une commande distante.

4. **Local-first pour les modèles lourds**
   - ComfyUI et autres services locaux uniquement sur `127.0.0.1` ;
   - aucun tunnel public implicite ;
   - aucun fallback API payant silencieux.

5. **TEST avant LIVE**
   - Lemon et toute intégration externe doivent avoir une preuve TEST avant LIVE ;
   - un feature flag doit permettre de déployer du code sans activer le comportement.

## Contrôles minimums par surface

### GitHub
- branch protection sur `main` ;
- CI obligatoire avant merge ;
- Dependabot / alertes de dépendances activés si disponibles ;
- aucune clé dans Actions logs ;
- revue des workflows à privilèges élevés.

### Vercel
- routes admin/service authentifiées ;
- variables sensibles côté serveur uniquement ;
- aucun endpoint local ou debug exposé ;
- webhooks avec signature vérifiée ;
- rate-limit à prévoir sur routes publiques à coût/écriture.

### Airtable
- PAT minimal ;
- aucune clé/API secret stocké dans les tables ;
- opérations sensibles traçables ;
- exports périodiques pour reprise après incident.

### Lemon
- clés TEST et LIVE distinctes ;
- validation `test_mode` ;
- webhook signé ;
- aucune livraison LIVE tant que les prérequis ne sont pas validés.

### Réseaux sociaux
- scopes minimums ;
- OAuth uniquement après approbation nécessaire ;
- publication réelle séparée du simple test de lecture ;
- aucun refresh/token dans Airtable ou logs.

### Worker Windows
- désactivé par défaut ;
- démarrage explicite ;
- queue inactive par défaut ;
- pas de lecture des cookies navigateur ;
- health endpoint localhost ;
- stockage médias hors Git/Vercel.

## Priorités issues de l’audit

### P0
- protéger toute route pouvant consommer une API payante ou écrire dans Airtable si elle n’a pas d’authentification explicite ;
- vérifier en particulier `/api/analyze-montage` avant toute réactivation paid-AI.

### P1
- audit systématique des routes `/api/*` ;
- rate-limit sur surfaces publiques coûteuses ;
- tests de signature des webhooks ;
- inventaire et rotation des secrets ;
- sauvegardes et test réel de restauration.

### P2
- durcissement headers/CSP ;
- suivi dépendances ;
- scans automatisés réguliers ;
- revue périodique des permissions connecteurs.

## Incident

En cas de suspicion :
1. désactiver les feature flags et workers concernés ;
2. révoquer/rotater les secrets touchés ;
3. conserver les logs utiles sans copier de secrets ;
4. vérifier GitHub/Vercel/Airtable/Lemon ;
5. restaurer depuis une sauvegarde vérifiée si nécessaire ;
6. documenter l’incident et les correctifs.
