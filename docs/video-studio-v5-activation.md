# Video Studio V5 — activation opt-in

Le code n'active aucune nouvelle brique à lui seul. Timeline, prosodie, registry de poses, musique et QC créatif nécessitent simultanément un flag GLOBAL exporté du profil Airtable et une variable runtime locale.

La timeline est versionnée par `HIBOU_SCENE_TIMELINE_V1`; ses événements et les cues de prosodie/pose restent SPÉCIFIQUES à la scène. La musique, la direction artistique, les seuils QC et les flags restent GLOBAL.

Les nouveaux champs Airtable sont décrits dans `docs/migrations/airtable-video-studio-v5-profile-fields.json` mais ne sont pas appliqués. Les cases d'activation ont un défaut logique à `false`.

Pour la timeline, si un brief SPÉCIFIQUE contient malgré tout `scene.timeline` alors que le double gate GLOBAL/runtime est désactivé, l'orchestrateur retire cette extension de la copie de travail avant rendu. Le contenu spécifique ne peut donc pas réactiver implicitement la fonctionnalité.


## Preview / retouches incrémentales

Le mode PREVIEW est un profil de production, pas une autorisation de publier. En l'absence du champ Airtable préparé, l'export reste en `production.mode=final`.

La réutilisation d'un rendu précédent exige simultanément :

- `features.video_incremental_retouch_v1=true` dans le profil GLOBAL ;
- `HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1=true` sur le runtime local ;
- `--reuse-from=<ancien dossier de rendu>` ;
- un nouveau dossier de sortie distinct.

Le rendu précédent n'est jamais modifié. Les caches copiés sont revalidés par leurs fingerprints propres avant réemploi. Les champs Airtable correspondants restent non appliqués et désactivés pendant le rendu actif.
