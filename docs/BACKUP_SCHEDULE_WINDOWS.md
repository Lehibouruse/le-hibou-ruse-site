# Backup hebdomadaire Windows — opt-in

Cette couche ne remplace pas les outils de backup existants. Elle permet seulement de les planifier sur le PC Windows, de façon explicite.

## Dry-run

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-schedule-windows.ps1
~~~

Sans \`-Install\`, aucune tâche Windows n'est créée.

## Prérequis

- \`AIRTABLE_TOKEN\` présent dans l'environnement utilisateur Windows ;
- dépôt Hibou accessible localement ;
- destination de backup hors du dépôt, imposée par le backup existant.

Aucun token ni passphrase n'est copié dans les arguments de la tâche planifiée.

## Installer

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-schedule-windows.ps1 -Install -Day Sunday -Time 03:30
~~~

L'installation ne lance pas immédiatement le backup.

Chaque exécution planifiée :
1. crée le backup Git + Airtable safe ;
2. produit les manifestes/hashes existants ;
3. lance le restore rehearsal local non destructif ;
4. écrit un petit résultat sans secret sous \`%LOCALAPPDATA%\LeHibou\backup-logs\`.

## Désinstaller

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-schedule-windows.ps1 -Uninstall
~~~

## Limites

Ce mécanisme ne constitue pas encore une stratégie 3-2-1 complète. Il manque toujours une copie hors site chiffrée et la couverture explicite des fichiers Library / assets non reproductibles.
