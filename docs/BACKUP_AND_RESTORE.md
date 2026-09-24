# Sauvegardes Hibou — fondation V1

Objectif : disposer d'une copie indépendante du code et des contenus structurés **sans exporter automatiquement les données personnelles ou credentials**.

## Ce que la sauvegarde V1 inclut

- bundle Git complet du dépôt ;
- CMS, articles et produits ;
- configuration avec redaction des clés/valeurs suspectes ;
- Montages et Livre ;
- Content Pipeline, scènes et profils vidéo ;
- benchmark, juridique, comptes sociaux non secrets, performance sociale, expériences growth ;
- manifest avec SHA-256 de chaque fichier.

## Exclusions volontaires

La V1 **n'exporte pas** automatiquement :
- Leads ;
- Ventes ;
- Rétractations ;
- Social Credentials ;
- Conversion Events ;
- Jobs / Journal.

Ces données demandent un plan chiffré séparé, notamment à cause de la PII ou des tokens.

## Dry-run

```bash
node scripts/backup-hibou-safe.mjs
```

Le dry-run ne contacte pas Airtable et n'écrit aucun backup.

## Création

Avec `AIRTABLE_TOKEN` présent localement :

```bash
node scripts/backup-hibou-safe.mjs --create
```

Destination par défaut :
- Windows : `%USERPROFILE%\HibouBackups`
- autres OS : `~/HibouBackups`

Destination explicite :

```bash
node scripts/backup-hibou-safe.mjs --create --root=D:\HibouBackups
```

## Vérification d'intégrité

```bash
node scripts/verify-hibou-backup.mjs <dossier_du_backup>
```

Ce contrôle vérifie les SHA-256. Il **ne restaure rien**.

## Ce que cette V1 ne résout pas encore

- copie hors site chiffrée ;
- backup automatique de la Library ChatGPT ;
- sauvegarde chiffrée de la PII/ventes ;
- restauration Airtable automatisée ;
- rotation/révocation des secrets ;
- test réel de reprise.

Ces sujets restent dans la Roadmap P1. Une sauvegarde n'est pas considérée comme fiable avant un exercice de restauration.
