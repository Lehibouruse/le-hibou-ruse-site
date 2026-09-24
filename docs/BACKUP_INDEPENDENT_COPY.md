# Copie indépendante des sauvegardes

La sauvegarde locale ne suffit pas à elle seule. Ce mécanisme permet de copier un backup Hibou déjà vérifié vers une deuxième destination choisie par l'opérateur.

Exemples de destinations adaptées :
- disque externe ;
- dossier OneDrive / Google Drive / Dropbox synchronisé ;
- NAS ;
- volume réseau indépendant.

Le script ne choisit aucun fournisseur et ne fait aucun appel réseau lui-même.

## Dry-run

```bash
node scripts/copy-backup-independent.mjs --source="C:\\Users\\Marc\\HibouBackups\\<backup>" --destination="D:\\HibouBackups-Offsite"
```

## Copie

```bash
node scripts/copy-backup-independent.mjs --copy --source="C:\\Users\\Marc\\HibouBackups\\<backup>" --destination="D:\\HibouBackups-Offsite"
```

Avant la copie :
- le manifest source est vérifié ;
- chaque SHA-256 doit correspondre.

Après la copie :
- les SHA-256 sont vérifiés à nouveau ;
- un `independent-copy-proof.json` sans secret est écrit dans la copie.

Le script refuse :
- une destination dans le dépôt Git ;
- source/destination imbriquées ;
- l'écrasement d'un backup existant.

La séparation de chemin ne prouve pas une séparation physique : pour une vraie stratégie 3-2-1, choisir une destination indépendante du SSD principal.
