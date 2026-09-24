# Dossier de reprise canonique — Le Hibou Rusé

Objectif : permettre à une nouvelle session de reprendre le projet sans reconstruire l'historique de conversation.

## Ordre de lecture obligatoire

1. `../../WORK_STATE.md` — état courant synthétique.
2. `../README.md` — index documentaire canonique.
3. `CURRENT_BLOCKERS.md` — verrous actuels et prochaines preuves.
4. `CANONICAL_ASSETS.md` — artefacts, contrats et runbooks à considérer comme sources de vérité.
5. `SESSION_END_CHECKLIST.md` — ce qu'une session doit mettre à jour avant de s'arrêter.

## Règles de reprise

- Ne jamais déduire qu'une fonctionnalité est opérationnelle parce que son code existe.
- Distinguer : code présent → runtime configuré → test réel réussi → production autorisée.
- Matériel confirmé : ASUS ROG Strix G18 G814JI, Intel Core i9-13980HX, NVIDIA GeForce RTX 4070 Laptop 8 Go, 32 Go RAM, SSD NVMe ~1 To. Le préflight runtime reste obligatoire avant génération lourde pour vérifier pilote/CUDA, ressources libres et stockage.
- Ne jamais réintroduire un fallback API payant silencieux.
- Ne jamais publier, acheter, rembourser, activer un worker ou un connecteur externe sans le niveau d'autorisation prévu par son runbook.
- Ne jamais stocker de secret dans Git, Airtable, Library ou les rapports de reprise.
- Les anciens workbenches/PR archivés sont des sources historiques, pas des branches à fusionner directement.

## Source de vérité par domaine

- Code/contrats/tests : GitHub `main`.
- État opérationnel et Roadmap : Airtable.
- Livrables éditoriaux/fichiers : Library.
- Calcul GPU et médias lourds : PC local.
- Secrets : runtime/gestionnaire local ou variables serveur, jamais dans les sources ci-dessus.
