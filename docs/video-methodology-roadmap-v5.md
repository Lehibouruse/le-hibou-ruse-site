# Le Hibou Rusé — feuille de route infrastructure vidéo V5

État consolidé au 29/09/2026 à partir de la table Airtable **Méthodologie vidéo**, de la roadmap V5 et des validations E2E réelles exécutées sur le ROG. Le run frais de référence est `run-boxspread-production-fresh-20260929-01` sur la branche `local/prompt-contract-v2-stable-20260929`.

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
| 0 / 0.4 / 0.5 | Benchmark + séparation GLOBAL / SPÉCIFIQUE | codé + appliqué | oui | **E2E réel jusqu'au master** ; perte partielle du SPÉCIFIQUE corrigée ; receipt `HIBOU_IMAGE_PROMPT_APPLICATION_V2` validé sur les 13 scènes réelles (`13/13 PASS`) |
| 1 | Script verrouillé / hash / verbatim | socle existant | oui partiel | validation éditoriale humaine finale |
| 2 | BREATH_UNIT_FIRST + storyboard + ATTENTION_BEATS | codé + exécuté | oui | **master V1 inspecté** ; défaut de mouvement réel identifié : 12 hard cuts et 1 seul événement subtil mesuré ; fallback caméra et interpolation corrigés |
| 3 | Préflight machine / modèles | codé + exécuté | oui | **Windows/ROG réel validé** sur production locale |
| 4 | Carte prosodique / unités de souffle | codé + exécuté | oui | **mini E2E voix V4 validé sur média réel** : `identity_lock_enabled:true`, mode `bootstrap_first_scene`, référence SHA256 propagée aux scènes suivantes, micro-fade final appliqué après timing-lock |
| 5 | Voix + mastering + contrôle verbatim | codé + QC durée + cache durée-aware + retries déterministes bornés + identity lock | oui CPU/statique + ciblé | QC technique V1 avait laissé passer une dérive perceptuelle ; verrou de timbre désormais séparé de la prosodie, avec première scène comme référence interne si aucune référence externe n'est fournie |
| 6 | Image plan ComfyUI / FLUX | codé + exécuté | oui | **GPU E2E validé sur le run frais : 26/26 candidats terminés, 0 échec, reçus prompt vérifiés** |
| 7 | Ranking assisté + sélection humaine | codé : ranking, revue JSON/HTML, template, fingerprint anti-stale, validateur, pause/reprise feature-gatée | oui statique | **E2E validé** : sélection enregistrée puis reprise du même job sans régénérer les 26 images ; prochaine V2 = sélection assistée automatique par défaut |
| 8 | Captions + texte écran + timeline | codé + exécuté | oui | sous-titres/contrat PASS ; lisibilité sur master final restante |
| 9 | Promotion render-ready / hashes | codé + exécuté | oui | **PASS réel** sur le premier master |
| 10 | FFmpeg + BEAT_VARIATION_POLICY | codé + exécuté | oui | master V1 PASS techniquement mais postmortem créatif insuffisant ; bug alpha/fade du Hibou corrigé et nouveau mouvement réel validé sur scène isolée |
| 10.5 | PREVIEW + retouches incrémentales | codé | oui | E2E cache hits sélectifs sur médias réels encore à faire |
| 11 | QC technique avancé master | codé + exécuté | oui | **QC V3 codé et validé** : le master V1 reste `TECH=PASS` mais bascule correctement en `REVIEW` pour voix non verrouillée et couverture mouvement insuffisante |
| 12 | Revue éditoriale humaine V4 | codé : manifeste consolidé, checklist 10 points | oui | **revue humaine réelle effectuée sur le master V1** ; défauts voix/mouvement/Hibou/variété visuelle documentés |
| 13 | Registre artefacts + remontée | codé V2 | oui | fermeture E2E registre + plan durable après master frais |
| 14 | Publication + apprentissage | publication verrouillée | oui statique | publication séparée et toujours interdite sans validation explicite |

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
- retries déterministes bornés de durée (`+100000`, `+200000`, `+300000`) avec arrêt au premier résultat plausible, puis blocage diagnostiqué ; aucune boucle non bornée ;

- prosody plan ;
- segmentation par unités de souffle ;
- pauses réelles ;
- post-traitement local ;
- mastering ;
- mix musique local ;
- ducking / fades / normalisation ;
- aucun contrôle Chatterbox fictif déclaré comme appliqué.

### Observabilité pipeline

- `HIBOU_VIDEO_RUN_AUDIT_V1` consolide un dossier de run en lecture seule : stages, voix, images, caches, erreur et point de reprise ;
- l'audit peut être lancé via Desktop Commander et ne modifie aucun fichier du run ;

- heartbeat Airtable détaillé toutes les 30 s : `image_candidate`, `voice_scene` ou `scene_clip`, avec completed/failed/total, pourcentage et temps écoulé ;
- le heartbeat est purement observatif et ses champs sont sanitisés côté API ;

- `pipeline-run.json` conserve `stage_history` avec START/PASS/ERROR, numéro de tentative et durée ;
- les stages PASS restent idempotents et l'historique n'est pas écrasé lors d'une nouvelle tentative ;

### Itérations

- `HIBOU_VIDEO_RESUME_PLAN_V1` analyse un run interrompu sans rien exécuter ;
- le worker futur écrit `_hibou_video_resume_plan.json` et `_hibou_video_failure_diagnostic.json` sur échec, et remonte le résumé à Airtable ;
- `HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1` permet une préparation distante uniquement après double gate, confirmation humaine, plan/state SHA identiques et receipt local validé ;
- le worker écrit `HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1`, repasse le job en `Paused` et retourne avant préflight/ComfyUI/master ;
- la requête de préparation est consommée en one-shot et les auto-start/auto-chain ignorent ce `Paused` : un second ordre explicite est obligatoire pour relancer le rendu ;
- le second ordre possède son propre feature flag, exige une seconde confirmation humaine et quatre preuves SHA256 (plan, état source, receipt, état préparé) ;
- le readiness audit bloque désormais `START=true` avec `RESUME=false`, autorise le mode prepare-only avec warning et expose explicitement les deux confirmations humaines ;
- le worker écrit `HIBOU_VIDEO_REMOTE_REPAIR_STARTED_V1`, revalide les octets du receipt et de l'état préparé, puis seulement ensuite autorise préflight/ComfyUI/master ;
- le premier `Running` porte ce reçu et consomme `repair_start_request` côté API pour rendre l'ordre one-shot ;
- `_hibou_video_remote_repair_prepared.json` permet à `HIBOU_VIDEO_RUN_AUDIT_V1` de distinguer un état réparé en attente d'un échec non traité ;
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

### Stockage durable

- le plan sépare désormais `objects` immuables par SHA256 des références logiques du run ;
- les doublons de contenu sont dédupliqués sans perdre les références ni métadonnées ;
- un emplacement durable existant est `VERIFY_EXISTING_ELSE_COPY`, jamais réputé valide sur simple présence ;
- les chemins locaux et `file://` sont refusés comme URL durable ;
- aucune copie réseau n'est effectuée par le planner ; l'uploader reste une brique séparée et inactive.

### Revue / sécurité

- `HIBOU_VIDEO_PUBLICATION_LOCK_AUDIT_V1` inspecte les artefacts JSON d’un run en lecture seule et rejette tout `publication_authorized:true`, signal d’auto-publication ou PREVIEW autorisant un full master ;
- un JSON vidéo connu mais illisible fait échouer l’audit plutôt que de laisser passer silencieusement ;

- le diff incrémental expose `review_summary` et `execution_summary` : scènes modifiées/inchangées, stages invalidés, `forced_regeneration_counts`, caches réutilisables et reason codes par scène ;
- le manifeste humain V4 embarque une `scene_review_queue` actionnable avec checks ciblés, impacts d’exécution et décision humaine toujours `PENDING` ;
- si le diff est absent ou de schéma invalide, le manifeste retombe automatiquement en revue `FULL` avec warning ;
- une revalidation de stage n'est pas confondue avec une régénération forcée : les fingerprints restent l'autorité de cache ;

- PREVIEW marqué `preview_only` ;
- registre d'artefacts toujours `publication_authorized:false` ;
- manifeste de revue humaine V4 ;
- checklist éditoriale à décision humaine uniquement ;
- audit CPU-only `HIBOU_VIDEO_V5_READINESS_V1` ;
- remote cancel/supersede limité au job propriétaire ;
- publication toujours séparée de la production.

## Priorités restantes après le postmortem du master V1

1. **Fermer la voix V4 sur une vidéo complète** : le mini E2E est validé (`VOICE_IDENTITY_LOCK`, bootstrap de la première scène, référence SHA256 commune, bords premier/dernier échantillon à zéro). Reste à confirmer perceptuellement la continuité de timbre/accent sur le master V2 complet.
2. **Rendre la grammaire de mouvement réellement perceptible** : conserver les timelines SPÉCIFIQUES prioritaires, interpoler les zooms plutôt que les appliquer par saut, et garantir un micro-zoom/pan déterministe quand aucune timeline caméra n'est fournie.
3. **Fermer la composition Hibou** : les calques fixes ne doivent plus recevoir de fade alpha automatique ; validation réelle déjà positive sur la scène 1, puis revalider sur un master V2.
4. **Préserver intégralement le SPÉCIFIQUE jusqu'à FLUX** : correctif en place ; le sanitiseur retire uniquement les clauses réservées au personnage/textes et le receipt V2 vérifie le prompt compilé. Validation réelle : `13/13 PASS`, rétention minimale du prompt image 51 %.
5. **Étendre le QC V3** : les contrôles contractuels voix/mouvement/Hibou sont maintenant en place ; rester à compléter par la conformité visuelle perceptuelle du SPÉCIFIQUE sur le master V2.
6. **Automatiser la sélection d'images** : génération multi-candidats conservée, sélection assistée par l'IA par défaut, intervention utilisateur seulement en cas d'ambiguïté ou d'échec créatif.
7. **Ensuite seulement refaire une vidéo complète V2** avec GLOBAL/SPÉCIFIQUE retravaillés, puis reprendre les chantiers de retouche incrémentale, résilience rare et stockage durable.

## Feedback visuel du premier run frais — à intégrer avant V2

Le premier master complet met en évidence **un mélange de défauts créatifs et de défauts d'infrastructure**. Le contrat GLOBAL/SPÉCIFIQUE est bien tracé, mais plusieurs intentions ont été altérées ou perdues plus loin dans la chaîne. Les constats ci-dessous servent de base à la V2 :

- **Présence du Hibou** : la mascotte ne doit pas disparaître de la séquence ; planifier explicitement sa présence, sa pose et sa fonction narrative sur les scènes pertinentes, avec contrôle de continuité.
- **Variété sémantique** : réduire la répétition de bureaux/intérieurs génériques ; mobiliser davantage graphes, schémas, argent, marchés, calendriers, comparaisons, flux et métaphores financières lorsque la narration le justifie.
- **SPÉCIFIQUE scène par scène** : le générateur de prompt spécifique doit concevoir chacune des 13 images individuellement, à partir du rôle précis de la scène, et non décliner un décor générique.
- **Continuité esthétique globale** : le GLOBAL doit verrouiller un univers visuel cohérent entre les scènes — palette, niveau de détail, perspective, éclairage, architecture graphique, traitement du Hibou et densité — tout en autorisant des sujets différents.
- **Cohérence de séquence** : l'uniformisation ne signifie pas répéter le même bureau ; conserver une identité commune tout en variant les compositions et les catégories visuelles.
- **Texte généré dans les images** : continuer à le minimiser/éviter ; les faux mots observés sur certaines variantes confirment que les informations textuelles doivent rester dans les couches contrôlées du compositing.
- **Primauté du SPÉCIFIQUE** : le SPÉCIFIQUE devient le principal objet créatif de chaque vidéo. Après validation du dialogue, chaque segment narratif doit être rattaché à une image précise et recevoir un brief visuel suffisamment détaillé pour être directement exécutable par la machine.
- **Découpage dialogue → image** : pour chaque unité du dialogue, définir individuellement sujet, composition, rôle éventuel du Hibou, objets/graphes, cadrage, ambiance, continuité avec les scènes voisines et éléments à exclure. Le GLOBAL encadre l'identité ; le SPÉCIFIQUE décide réellement de ce qui est montré.
- **Sélection automatique des candidats** : par défaut, générer plusieurs candidats puis laisser l'assistant sélectionner le meilleur candidat QC-PASS selon respect du GLOBAL, du SPÉCIFIQUE, cohérence séquentielle, lisibilité et absence d'artefacts. L'utilisateur ne doit être sollicité qu'en cas d'ambiguïté ou de défaut majeur.
- **Musique interchangeable** : le pipeline doit accepter une piste locale autorisée comme source musicale de référence, avec ducking/fades/mastering inchangés. La cible créative exprimée est la musique de *Succession* si un fichier d'usage autorisé est fourni ; ne pas coupler les droits au moteur de production.
- **Voix interchangeable** : conserver un profil vocal remplaçable. Utiliser une voix temporaire non identique tant qu'une autorisation de reproduction d'une voix identifiable n'est pas acquise ; une référence autorisée pourra ensuite être branchée sans modifier le reste du pipeline.

Ces corrections sont un backlog créatif pour la prochaine itération du GLOBAL/SPÉCIFIQUE, après visionnage du premier master. Elles ne doivent pas invalider le run actuel.

## Desktop Commander

Remote Desktop Commander est désormais disponible comme couche optionnelle d'inspection/E2E du ROG. Il pourra servir après le rendu actif à lire les logs/manifests, vérifier les caches et lancer les tests Windows sans copier-coller PowerShell. Il ne devient pas une dépendance du pipeline et ne doit pas perturber les jobs actifs.

## Planification E2E sécurisée

- `docs/video-studio-v5-e2e-plan.json` formalise l’ordre, les dépendances, ressources, flags temporaires et critères d’acceptation des tests réels ;
- `HIBOU_VIDEO_V5_E2E_PLAN_AUDIT_V1` refuse toute étape auto-exécutable, publiable, GPU/process-control sans `local_idle`, ou sans run jetable ;
- le sélecteur de tests « runnable » est purement informatif : même une étape éligible garde `manual_start_required:true` et n’est jamais lancée par l’audit ;
- Desktop Commander pourra utiliser ce plan après confirmation explicite d’un ROG idle, sans devenir une dépendance du pipeline.

## État E2E réel au 29/09/2026

**Validé ou démontré sur média réel :**
- ROG/Windows + ComfyUI/FLUX opérationnels en production locale ;
- 13 scènes, 26 candidats image terminés, 0 échec image ;
- checkpoint `WAITING_HUMAN_SELECTION` atteint, décision appliquée, reprise du même job sans régénération des 26 images ;
- promotion, factual gate, render, Master QC, revue, registre artefacts et reporting terminés en PASS ;
- premier `master.mp4` complet produit et revu humainement ;
- postmortem technique : absence du Hibou reliée au fade alpha des calques fixes ; dérive vocale reliée à l'absence de verrou d'identité/référence ; densité de mouvement insuffisante mesurée ; sanitiseur image destructif sur certaines phrases SPÉCIFIQUES ;
- correctif Hibou validé sur vraie scène ; correctif SPÉCIFIQUE validé sur les 13 vraies scènes (`13/13 PASS`, rétention minimale du prompt image 51 %) ; mini E2E voix V4 validé ; QC V3 reclasse correctement le master V1 en `REVIEW` ; **50/50 tests ciblés puis 1 228/1 228 tests complets PASS**.

**Encore à fermer E2E :**
- full E2E voix sur master V2 avec contrôle perceptuel de continuité ;
- master V2 complet avec nouveau compositeur/mouvement et inspection visuelle/sonore ;
- compléter le QC V3 par la conformité visuelle perceptuelle du SPÉCIFIQUE et l'évaluation du master V2 ;
- PREVIEW → retouche → FINAL avec cache hits sélectifs mesurés ;
- calibration QC créatif local CLIP/SigLIP ;
- cancel / supersede Windows ;
- reprise distante en deux phases ;
- backend durable/uploader séparé ;
- publication reste hors périmètre et verrouillée.

## Chaîne de preuve avant activation

- chaque étape de `docs/video-methodology-coverage-v5.json` porte désormais `e2e_step_ids`, `e2e_status` et `activation_status:"inactive"` ;
- l'audit vérifie que les IDs E2E référencés existent réellement dans le plan machine-readable ;
- une étape `e2e_pending:true` sans test lié fait échouer la couverture ;
- une future tentative `activation_status:"active"` avec E2E encore `pending` est rejetée ;
- l'action humaine explicite reste obligatoire même après E2E validé.

## Activation

Aucune nouvelle brique de cette feuille n'est considérée **activée en production** parce qu'elle est codée ou parce qu'un flag runtime a été temporairement activé sur un run E2E. Le run frais du 29/09 a volontairement activé plusieurs flags ensemble pour démontrer leur comportement réel ; cela constitue une preuve E2E partielle, pas une promotion automatique en production. L'activation officielle reste brique par brique après satisfaction complète des critères E2E et mise à jour explicite de l'état machine-readable, publication toujours désactivée.
