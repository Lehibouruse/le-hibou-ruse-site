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


## Desktop Commander comme outil E2E optionnel

Remote Desktop Commander peut être utilisé comme couche d'inspection et d'exécution locale assistée sur le PC Windows, mais **n'est pas une dépendance du pipeline vidéo**.

Usages autorisés pendant un rendu/téléchargement actif :
- vérifier que le device est en ligne ;
- lire des fichiers/logs explicitement non verrouillés ;
- inspecter la configuration et l'état sans mutation ;
- préparer les commandes/tests à exécuter plus tard.

Usages à différer jusqu'à la fin du rendu actif :
- lancer des E2E ComfyUI/FLUX ou Chatterbox ;
- écrire dans les runtime actifs ;
- redémarrer worker/ComfyUI ;
- tuer des processus ;
- déplacer/supprimer des artefacts.

Après le rendu actif, Desktop Commander pourra exécuter les E2E Windows, lire les manifests locaux, vérifier les caches et la reprise humaine, et réduire les copier-coller PowerShell. Le pipeline doit toutefois rester autonome si Desktop Commander est indisponible.


## Reprise humaine distante

Un job FINAL en `WAITING_HUMAN_SELECTION` peut être repris à distance sans accès direct au dossier local si :
- `resume_human_selection=true` est explicitement présent dans les options du job ;
- `human_candidate_decisions` respecte `HIBOU_HUMAN_IMAGE_SELECTION_V1` ;
- le `content_id` correspond ;
- le `review_fingerprint_sha256` correspond exactement au lot local affiché ;
- chaque ligne contient un `candidate_id` et `human_confirmed=true` ;
- aucun autre job vidéo n'est actif.

Le serveur ne remet alors qu'un unique job éligible en `Pending`. Le worker compare encore une fois le fingerprint avec `images/candidate-review.json`, écrit localement `candidate-decisions.json`, puis reprend le même run. Cette reprise ne réveille pas ComfyUI : les images déjà générées sont réutilisées.

La publication reste interdite et la revue humaine du master reste obligatoire.


## Reprise distante après erreur

Cette brique est codée mais **désactivée** tant que l'E2E Windows n'a pas été validé.

Deux gates indépendants sont obligatoires :

- API / Vercel : `HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED=true` ;
- worker Windows : `HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED=true`.

La programmation d'une reprise exige en plus :
- un job `VIDEO_RENDER` en `Error` avec `HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1` ;
- `resume_failed_job=true` ;
- `human_confirmed_resume=true` ;
- le SHA-256 exact de `_hibou_video_resume_plan.json` ;
- le SHA-256 exact de l'état source `pipeline-run.json` contenu dans ce plan ;
- même `content_id` ;
- un unique job éligible et aucune autre vidéo active.

Le serveur ne fait que remettre le job en `Pending` avec une requête normalisée. Le worker vérifie **une seconde fois** le contenu, le plan local, ses hashes et le stage de reprise. Il n'applique le reset qu'avec le runtime `video-resume-state.mjs` du même commit, `--apply`, confirmation SHA et `HIBOU_VIDEO_RESUME_APPLY_ENABLED=true` dans ce sous-processus uniquement. Avant de relancer le master, il exige le receipt `HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1`.

Une nouvelle erreur ne provoque jamais une nouvelle reprise automatique : une nouvelle confirmation humaine est requise. Les caches et artefacts sont conservés et la publication reste interdite.
