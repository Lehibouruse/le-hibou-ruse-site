# Sauvegarde et restauration locale — Le Hibou Rusé

Ce dispositif prépare une **première couche de sauvegarde**. Il ne constitue pas à lui seul une stratégie 3-2-1 : une deuxième copie chiffrée hors du PC restera nécessaire.

## Principe

- GitHub : bundle Git complet.
- Airtable métier non sensible : export JSON compressé.
- Tables pouvant contenir PII, tokens chiffrés ou journaux sensibles : **exclues par défaut**.
- Export sensible uniquement avec `--include-sensitive` et `HIBOU_BACKUP_PASSPHRASE`; chiffrement AES-256-GCM.
- Aucun token/mot de passe n'est écrit dans le manifeste.
- Le répertoire de sauvegarde doit être **hors du dépôt Git**.

## Voir le plan sans réseau

```powershell
node scripts/backup-project-local.mjs --plan
```

C'est le comportement par défaut si aucun mode d'export n'est demandé.

## Sauvegarder Git uniquement

```powershell
node scripts/backup-project-local.mjs --git
```

Produit un `git bundle` contenant toutes les refs.

## Sauvegarder Git + Airtable métier

Définir `AIRTABLE_TOKEN` localement, puis :

```powershell
node scripts/backup-project-local.mjs --all
```

Par défaut les exports vont dans `%USERPROFILE%\HibouBackups\<timestamp>`.

## Inclure les tables sensibles

Uniquement si nécessaire :

```powershell
$env:HIBOU_BACKUP_PASSPHRASE = "<phrase longue conservée hors du dépôt>"
node scripts/backup-project-local.mjs --all --include-sensitive
```

Ne jamais stocker cette passphrase dans Git, Airtable, un fichier `.env` versionné ou le chat.

## Restauration Git

Dans un répertoire vide :

```powershell
git clone C:\chemin\le-hibou-ruse.bundle le-hibou-ruse-restored
```

Puis vérifier le commit attendu dans le manifeste.

## Restauration Airtable

L'outil produit des exports de preuve, pas encore un import automatique aveugle. La restauration Airtable doit d'abord être faite dans une base de test avec comparaison des schémas et des IDs. C'est volontaire : un import automatique direct pourrait écraser une base saine.

## Étape suivante pour une vraie résilience

1. exécuter une première sauvegarde locale ;
2. ajouter une seconde destination chiffrée indépendante ;
3. automatiser la cadence ;
4. faire un **test réel de restauration** ;
5. mesurer RPO/RTO ;
6. documenter la rotation des secrets après incident.
