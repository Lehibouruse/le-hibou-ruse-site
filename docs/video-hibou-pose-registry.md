# Bibliothèque canonique de poses du Hibou V1

Feature flag recommandé : `video_pose_registry_v1`.

Le registry sépare l'identité GLOBAL du personnage des besoins SPÉCIFIQUES d'une vidéo. Un brief spécifique peut demander une catégorie de pose, mais ne peut pas redéfinir l'identité canonique.

Le fichier `video/assets/hibou-poses.registry.v1.json` prépare les catégories demandées. Elles sont volontairement en `status=planned` tant que les fichiers n'ont pas été générés et validés. Aucun lookup ne déclenche de génération GPU.

Flux prévu après le rendu actif :
1. générer/retoucher les poses une à une depuis la référence canonique ;
2. validation humaine ;
3. renseigner `asset_ref` + `sha256` et passer la pose à `ready` ;
4. le worker peut alors réutiliser la pose sans régénération.

`applyPoseToScene` sait injecter une pose soit comme `composition.character_pose`, soit comme événement `HIBOU_SCENE_TIMELINE_V1`.
