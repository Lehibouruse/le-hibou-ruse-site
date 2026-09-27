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


## Audit de readiness V5

Avant toute activation ou E2E local, le contrat peut être audité sans lancer de moteur média :

`node scripts/video-v5-readiness.mjs <storyboard.json> [readiness.json]`

L'audit ne lance ni ComfyUI, ni Chatterbox, ni FFmpeg, ne modifie pas Airtable et n'autorise jamais la publication. Il affiche pour chaque brique V5 l'état du flag GLOBAL, du gate runtime et l'état réellement actif. Il bloque notamment un mode de production invalide, tout signal `publication_authorized=true`, un PREVIEW autorisant un full master, ou un mix musique actif sans référence musicale.

Cet audit est un contrôle préparatoire CPU uniquement. Un résultat vert ne remplace pas les E2E média réels ni la revue humaine.


## Sélection humaine des candidats

La sélection humaine est une extension opt-in distincte du ranking machine. Elle exige simultanément :

- `features.video_human_candidate_selection_v1=true` dans le contrat GLOBAL ;
- `HIBOU_VIDEO_HUMAN_SELECTION_V1=true` dans le runtime ;
- un mode `production.mode=final`.

PREVIEW ne se met jamais en pause pour cette étape.

Quand la feature est active en FINAL, le pipeline produit :

- `images/candidate-review.json` ;
- `images/candidate-review.html` ;
- `images/candidate-decisions.template.json`.

Sans décision, le master s'arrête proprement avec `WAITING_HUMAN_SELECTION` et le worker remonte le job en `Paused`. Ce statut ne doit pas être repris par les mécanismes d'auto-start ordinaires.

Pour reprendre, la décision doit utiliser `HIBOU_HUMAN_IMAGE_SELECTION_V1`, contenir `human_confirmed=true` pour chaque scène reviewable et référencer exactement `review_fingerprint_sha256` du lot courant. Toute décision périmée ou tout candidat non-PASS est rejeté. Après validation, le marqueur d'attente est supprimé, les images déjà générées sont réutilisées et le pipeline reprend au stage de sélection/QC/rendu.

Le champ Airtable préparé `Sélection humaine candidats V1` reste non appliqué et faux par défaut tant que l'E2E Windows/ROG n'a pas été validé.
