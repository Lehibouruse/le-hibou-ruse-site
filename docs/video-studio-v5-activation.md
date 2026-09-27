# Video Studio V5 — activation opt-in

Le code n'active aucune nouvelle brique à lui seul. Timeline, prosodie, registry de poses, musique et QC créatif nécessitent simultanément un flag GLOBAL exporté du profil Airtable et une variable runtime locale.

La timeline est versionnée par `HIBOU_SCENE_TIMELINE_V1`; ses événements et les cues de prosodie/pose restent SPÉCIFIQUES à la scène. La musique, la direction artistique, les seuils QC et les flags restent GLOBAL.

Les nouveaux champs Airtable sont décrits dans `docs/migrations/airtable-video-studio-v5-profile-fields.json` mais ne sont pas appliqués. Les cases d'activation ont un défaut logique à `false`.

Pour la timeline, si un brief SPÉCIFIQUE contient malgré tout `scene.timeline` alors que le double gate GLOBAL/runtime est désactivé, l'orchestrateur retire cette extension de la copie de travail avant rendu. Le contenu spécifique ne peut donc pas réactiver implicitement la fonctionnalité.
