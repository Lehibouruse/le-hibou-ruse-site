# Sauvegarde et reprise après incident — Le Hibou Rusé

Dernière mise à jour : 24/09/2026.

## Principe

Une sauvegarde n’est considérée comme fiable qu’après **restauration testée**.

## Données à protéger

### 1. GitHub
Source : dépôt `Lehibouruse/le-hibou-ruse-site`.

Protection :
- historique Git complet ;
- tags/branches utiles ;
- copie locale/off-site périodique ;
- ne jamais sauvegarder des secrets dans le dépôt.

### 2. Airtable
Tables critiques :
- Roadmap ;
- Content Pipeline ;
- Montages ;
- Livre ;
- Scènes vidéo ;
- Configuration non secrète ;
- Ventes / Journal si nécessaires à l’audit.

Protection :
- export périodique JSON/CSV ;
- schéma des tables et champs ;
- date et version de chaque export ;
- chiffrement si l’export contient des données personnelles.

### 3. Library
À conserver :
- Pilotage ;
- Livre : références, brouillons, exports ;
- masters vidéo ;
- contrats/manifests/QC utiles.

Les POC historiques peuvent avoir une rétention plus courte, mais ne doivent être supprimés qu’après validation de la politique de sauvegarde.

### 4. PC local
À sauvegarder :
- assets maîtres non reproductibles ;
- voix de référence autorisées ;
- workflows ComfyUI ;
- bindings validés ;
- manifests/hashes ;
- rendus finaux.

À ne pas sauvegarder inutilement :
- caches recréables ;
- modèles IA téléchargeables à nouveau ;
- fichiers temporaires.

### 5. Secrets
Ne jamais sauvegarder les secrets dans Git/Airtable/Library.

Utiliser :
- gestionnaire de mots de passe/coffre ;
- exports chiffrés du coffre si la solution le permet ;
- procédure de rotation en cas de perte.

## Cibles de reprise

Repères initiaux à valider :
- **RPO GitHub** : proche de zéro via Git ;
- **RPO Airtable** : 24 h maximum ;
- **RPO livre/masters** : après chaque session de travail importante ;
- **RTO minimum** : pouvoir reconstruire le socle code + Airtable + artefacts critiques en une journée.

## Rétention proposée

- quotidien : 7 jours ;
- hebdomadaire : 8 semaines ;
- mensuel : 12 mois ;
- versions majeures du livre/masters : conservation longue.

## Test de restauration

Exercice trimestriel ou après changement d’architecture important :

1. créer un environnement isolé ;
2. restaurer une copie Git ;
3. restaurer un export Airtable de test ;
4. remettre un artefact Library ;
5. vérifier qu’un contrat vidéo peut être relu/rendu sans dépendance cachée ;
6. mesurer le temps de reprise ;
7. documenter les écarts.

## Ordre de priorité en incident

1. stopper l’écriture automatique ;
2. préserver les preuves ;
3. restaurer la donnée structurée ;
4. reconstruire le code ;
5. restaurer les artefacts non reproductibles ;
6. reconnecter les intégrations une par une ;
7. ne réactiver LIVE qu’après validation.
