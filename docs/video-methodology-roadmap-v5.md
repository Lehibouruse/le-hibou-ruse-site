# Le Hibou Rusé — feuille de route infrastructure vidéo V5

État consolidé au 27/09/2026 à partir de la table Airtable **Méthodologie vidéo** et de la branche `feat/video-studio-v5`.

## Principes non négociables

- architecture local-first ;
- aucune publication automatique ;
- revue humaine obligatoire ;
- aucun fallback payant silencieux ;
- runtime commit-pinné ;
- Airtable reste la source de configuration ;
- PREVIEW et FINAL sont distincts ;
- GLOBAL et SPÉCIFIQUE restent séparés ;
- le rendu/téléchargement local en cours ne doit jamais être perturbé ;
- les briques non validées E2E restent opt-in et désactivées.

## Couverture de la méthodologie Airtable

| Étape | Brique | État code | Tests CPU / statiques | E2E réel restant |
| --- | --- | --- | --- | --- |
| 0 / 0.4 / 0.5 | Benchmark + séparation GLOBAL / SPÉCIFIQUE | codé | oui | revue de cohérence sur vidéo complète |
| 1 | Script verrouillé / hash / verbatim | socle existant | oui partiel | validation éditoriale humaine |
| 2 | BREATH_UNIT_FIRST + storyboard + ATTENTION_BEATS | codé | oui | vidéo complète avec continuité visuelle |
| 3 | Préflight machine / modèles | codé | oui | validation Windows/ROG hors rendu actif |
| 4 | Carte prosodique / unités de souffle | codé | oui | écoute Chatterbox réelle |
| 5 | Voix + mastering + contrôle verbatim | codé + QC durée + cache durée-aware + retry unique | oui CPU/statique | écoute, continuité de timbre, validation réelle du retry |
| 6 | Image plan ComfyUI / FLUX | codé | oui | GPU E2E |
| 7 | Ranking assisté + sélection humaine | codé : ranking, revue JSON/HTML, template, fingerprint anti-stale, validateur, pause/reprise feature-gatée | oui statique | E2E réel pause → décision → reprise + GPU réel |
| 8 | Captions + texte écran + timeline | codé | oui | lisibilité vidéo réelle |
| 9 | Promotion render-ready / hashes | codé | oui | E2E média |
| 10 | FFmpeg + BEAT_VARIATION_POLICY | codé | oui | inspection visuelle réelle |
| 10.5 | PREVIEW + retouches incrémentales | codé | oui | cache hits réels sur médias |
| 11 | QC technique avancé master | codé | oui | calibration sur master réel |
| 12 | Revue éditoriale humaine V4 | codé : manifeste consolidé, checklist 10 points | oui | décision humaine réelle |
| 13 | Registre artefacts + remontée | codé V2 | oui | durabilité/retour Airtable E2E |
| 14 | Publication + apprentissage | publication verrouillée | oui statique | publication seulement après validation explicite |

## Briques V5 déjà intégrées

### Production / montage

- rendu ASS Windows auto-contenu via Fontconfig privé + `C:\\Windows\\Fonts`, sans dépendre d'une config Fontconfig système ;
- sous-titres ASS en Arial sur Windows (présent nativement sur le ROG), DejaVu Sans ailleurs, police persistée dans le contrat ;

- timeline intra-scène indépendante du remplacement complet d'image ;
- ATTENTION_BEATS : caption, prop, pose, camera, accent ;
- BEAT_VARIATION_POLICY consultative ;
- PREVIEW : un candidat image par scène, encode rapide ;
- FINAL : profil premium, plusieurs candidats, encode qualité ;
- cache FFmpeg fingerprinté ;
- rendu 1080×1920 / 30 fps conservé.

### Image

- `HIBOU_IMAGE_GENERATION_THROUGHPUT_V1` mesure le temps par candidat généré et le débit global ;
- `factory-run.json` estime le coût observé de 1, 2 ou 3 candidats par scène, sans modifier qualité ni prompts ;

- image plan local déterministe ;
- fallback CUDA OOM local uniquement ;
- cache invalidé si la requête effective change ;
- QC technique + perceptuel ;
- QC créatif sémantique local optionnel ;
- registre de poses Hibou ;
- `HIBOU_CANDIDATE_REVIEW_V1` ;
- `candidate-review.html` local pour comparer visuellement les candidats ;
- `HIBOU_HUMAN_IMAGE_SELECTION_V1` pour enregistrer un choix humain explicite.

### Voix / audio

- garde-fou contre les anomalies de durée Chatterbox basé sur nombre de mots / WPM ;
- cache voix invalidé si la durée stockée est aberrante ;
- une seule régénération déterministe de la scène, puis blocage avec diagnostic ;

- prosody plan ;
- segmentation par unités de souffle ;
- pauses réelles ;
- post-traitement local ;
- mastering ;
- mix musique local ;
- ducking / fades / normalisation ;
- aucun contrôle Chatterbox fictif déclaré comme appliqué.

### Observabilité pipeline

- heartbeat Airtable détaillé toutes les 30 s : `image_candidate`, `voice_scene` ou `scene_clip`, avec completed/failed/total, pourcentage et temps écoulé ;
- le heartbeat est purement observatif et ses champs sont sanitisés côté API ;

- `pipeline-run.json` conserve `stage_history` avec START/PASS/ERROR, numéro de tentative et durée ;
- les stages PASS restent idempotents et l'historique n'est pas écrasé lors d'une nouvelle tentative ;

### Itérations

- `HIBOU_VIDEO_RESUME_PLAN_V1` analyse un run interrompu sans rien exécuter ;
- le worker futur écrit `_hibou_video_resume_plan.json` et `_hibou_video_failure_diagnostic.json` sur échec, et remonte le résumé à Airtable ;
- `HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1` permet une reprise distante uniquement après double gate, confirmation humaine, plan/state SHA identiques et receipt local validé ;
- ce diagnostic n'active jamais `Pending` et n'exécute jamais la reprise ;
- l'application contrôlée de la reprise exige le suffixe canonique de stages depuis `resume_stage`, un SHA256 exact du plan et `HIBOU_VIDEO_RESUME_APPLY_ENABLED=true` ;
- elle sauvegarde `pipeline-run.json`, remplace l'état de façon atomique et écrit `HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1` avec hashes source/backup/état préparé/fichier final ;
- détecte un ancien PASS devenu invalide (ex. durée voix), un artefact PASS manquant et les erreurs de rendu connues ;
- choisit le point de reprise conservateur le plus précoce ;
- `HIBOU_VIDEO_RESUME_STATE_PREP_V1` prépare le reset de `pipeline-run.json` en dry-run par défaut ;
- application possible uniquement avec `--apply`, `HIBOU_VIDEO_RESUME_APPLY_ENABLED=true`, SHA-256 exact du plan et fingerprint exact de l'état source ;
- une sauvegarde de l'état est créée avant toute application et aucun cache/artefact n'est supprimé ;
- conserve les caches voix/images/render et laisse les fingerprints décider de la réutilisation ;

- `HIBOU_INCREMENTAL_RETOUCH_PLAN_V1` ;
- invalidation par domaines : voix, image, composition, captions, GLOBAL ;
- réutilisation inter-run de caches fingerprintés ;
- filiation de jobs bornée et sans boucle ;
- même contenu obligatoire ;
- vérification worker parent ;
- vérification résultat parent + vrai `master.mp4` + hash Airtable quand disponible ;
- `reuse_from_job_id` au lieu d'un chemin arbitraire.

### Revue / sécurité

- PREVIEW marqué `preview_only` ;
- registre d'artefacts toujours `publication_authorized:false` ;
- manifeste de revue humaine V4 ;
- checklist éditoriale à décision humaine uniquement ;
- audit CPU-only `HIBOU_VIDEO_V5_READINESS_V1` ;
- remote cancel/supersede limité au job propriétaire ;
- publication toujours séparée de la production.

## Prochaines briques faisables sans toucher au ROG

1. **Checkpoint de sélection humaine** : codé statiquement ; reste l'E2E réel `WAITING_HUMAN_SELECTION` → décision fingerprintée → reprise sans refaire FLUX.
2. **Resume après revue** : fingerprint anti-stale codé ; reste à valider sur médias réels.
3. **Diff de revue incrémentale** : montrer automatiquement ce qui a changé depuis le dernier PREVIEW pour concentrer la revue sur les scènes modifiées tout en gardant un contrôle global minimal.
4. **Coverage audit méthodologie** : contrôle statique que chaque étape Airtable importante dispose d'un artefact/code/test attendu.
5. **Durabilité des artefacts** : plan content-addressed codé, images sélectionnées incluses dans le registre ; reste à choisir/valider un backend durable et son uploader séparé après les E2E.

## Desktop Commander

Remote Desktop Commander est désormais disponible comme couche optionnelle d'inspection/E2E du ROG. Il pourra servir après le rendu actif à lire les logs/manifests, vérifier les caches et lancer les tests Windows sans copier-coller PowerShell. Il ne devient pas une dépendance du pipeline et ne doit pas perturber les jobs actifs.

## E2E à ne lancer qu'après fin du rendu/téléchargement local actuel

- ComfyUI/FLUX PREVIEW 1–2 scènes ;
- pose Hibou réelle ;
- Chatterbox prosodie A/B ;
- musique / ducking à l'écoute ;
- QC créatif local CLIP/SigLIP ;
- PREVIEW → retouche → FINAL avec cache hits réels ;
- sélection humaine puis reprise locale et distante fingerprintée ;
- cancel / supersede Windows ;
- master V5 complet ;
- revue humaine V4 complète.

## Activation

Aucune nouvelle brique de cette feuille n'est considérée **active** parce qu'elle est codée. L'activation se fera brique par brique après E2E, avec les flags GLOBAL/runtime correspondants, publication toujours désactivée.
