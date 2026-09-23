# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-23 — infrastructure vidéo prioritaire

## Décisions actuelles

- Agent OpenAI API abandonné pour raison de coût : aucune recharge, aucun appel payant, aucun fallback automatique vers un fournisseur payant.
- ChatGPT actuel = raisonnement, recherche, rédaction et pilotage. Airtable = états. Les moteurs locaux/déterministes = exécution technique.
- APIs sociales, Lemon Squeezy, Digify et automatisations déterministes restent pertinentes.
- Aucune publication sociale publique, aucun achat réel, aucun abonnement/plan payant et aucun remplacement commercial du livre sans validation humaine explicite.
- Gros médias, caches et modèles hors Git/Vercel.
- Priorité opérationnelle actuelle : infrastructure de production vidéo. Le livre est hors de la passe active.

## Coupe-circuit IA et branche canonique

Branche : `hibou-local-video-pipeline-20260922` — PR #175 (draft, mergeable).

- Politique fail-closed : `PAID_AI_DISABLED_BY_POLICY=true`.
- Six points d’entrée payants verrouillés : orchestrator, agent-worker, wake, analyze-montage, book-scheduler, book-finalizer.
- `.env.example` : `AI_ENABLED=false`, kill switch actif, budgets/appels IA à zéro.
- Jobs : 116 historiques ; aucun Running/Retry/Pending. Anciens CREATE_VIDEO en Manual Review ; anciens CREATE_BOOK neutralisés sans relance.
- Production n’est PAS encore déclarée protégée : la preuve finale exige fusion/déploiement puis tests runtime bloqués avec `openai_calls=0`, sans effectuer d’appel OpenAI.
- Dernier head exécutable vert avant la synchronisation documentaire courante : `3c068e2fbad3fb808119ea74e06ffdc924472224`; Hibou CI #712 = success. Les commits documentaires suivants sont revalidés par CI avant d'être considérés comme stables.
- Production reste sur l'ancien comportement tant que #175 n'est pas déployée : `system_health_report` du 23/09/2026 06:12:22 UTC indique encore `openai.circuit_active=false` et `credit_paused=false`. Cette preuve interdit de marquer le coupe-circuit comme effectif en Production.
- Rollback : revert du merge ou retour au main `da3dd1143b933e1e09d9f5c25b5bac7bb2ac2fd8`.

## Vercel

- Alerte Vercel du 22/09/2026 13:11 UTC : 100 % des 10 Go de Function Storage Hobby utilisés.
- Dépôt léger (~1,5 Mo), mais ~58 routes API et au moins 100 commits main depuis le 12/09 : accumulation de bundles/déploiements = hypothèse dominante, sans prétendre connaître le breakdown Vercel interne.
- PR #175 réduit les futurs déploiements : suppression de l’exception `hibou-agent/**`, déploiement Git uniquement sur `main`.
- `ignoreCommand` inclut désormais `lib/` : une modification backend de `lib/` doit déclencher le déploiement main au lieu d’être ignorée.
- Workflow historique `furet-transcript-probe.yml` supprimé sur la branche : il ne doit plus polluer chaque commit après fusion.
- Ne rien supprimer à l’aveugle et ne pas changer de plan. Après déploiement, mesurer le stockage avant/après et attendre la rétention Hobby avant suppression ciblée.

## Vidéo — Box Spread et moteur reproductible

Références : Box Spread historique = `VIDEO_METHOD_V2`. Toute nouvelle production = `VIDEO_METHOD_V3` + `HIBOU_VIRAL_V1@2.0`.

Box Spread :
- Content Pipeline canonique : `rec8lgQT8jXreflmt`, `HUMAN_REVIEW`, vidéo v3.
- Ancien POC `recVuNUbyUm9WIpVx` conservé comme historique/superseded.
- Source verbatim : audio existant de `Le_Hibou_Box_Spread_V2_prompt_actuel_verbatim_V1.mp4`, sans réécriture de mémoire.
- Master : 18 scènes, 42,600 s, 1080×1920, 30 fps, H.264/AAC, 15 919 538 octets, SHA-256 `64e99df73e5fd8c999893392f40ae6b0397f527b18429c75a3256ba0a24978c9`.
- Source V2 : 24 fps, SHA-256 `cf3222c502987cac99ccbe86bb0aafa443abd3dafbbe038e956c11e6a804a15e`.
- QC visuel technique sur 1, 8, 15, 22, 29, 36 et 41 s : PASS.
- Master sans musique commerciale ; cues conservés.
- Compatible techniquement H.264/AAC mobile ; lecture iPhone réelle non revendiquée.
- Library durable : `/Le Hibou Rusé/Vidéos/Box Spread/Master technique 30fps 2026-09-22/`.
- Sous-titres exacts et validation éditoriale finale restent à faire.
- OBO `recyt2rDHKP50ZCbV` et donation-cession `recnospVHwEtAwxMV` ont eu un premier découpage 15 scènes, désormais superseded par les storyboards r2 18 scènes décrits plus bas. Ne pas reprendre le découpage 15 scènes.
- Contrats persistants r2 : `docs/pilots/obo-storyboard-contract-v1.json`, `docs/pilots/donation-cession-storyboard-contract-v1.json`, ainsi que leurs contrats d'exécution `video/contracts/obo.v1.json` et `video/contracts/donation-cession.v1.json` ; tous sont désormais à 18 scènes.

Renderer :
- `scripts/video-local-render.mjs` : rendu FFmpeg déterministe, validation des hashes, cache par empreinte, reprise scène par scène. Le contrat gère désormais `storyboard`, `render_ready`, `rendered`; le renderer refuse explicitement un storyboard sans médias.
- Contrat : `HIBOU_VIDEO_CONTRACT_V1` + schema/documentation.
- Les artefacts locaux et `.video-render-cache` sont ignorés par Git.

Interfaces ajoutées :
- `IMAGE_GEN_V1` : `scripts/video-local-adapters.mjs`, ComfyUI loopback/local uniquement, workflow API explicite, overrides seulement sur inputs existants, ID stable, timeout 10–3600 s, retries 0–2, manifeste et réutilisation, aucun fallback payant.
- `VOICE_GEN_V1` : wrapper direct `scripts/chatterbox-local.py`, français, unités de souffle <=300 caractères, paramètres natifs Chatterbox séparés des métadonnées prosodiques Hibou, aucun serveur exposé, aucun fallback silencieux.
- Tests unitaires + compilation syntaxique Python inclus.
- V3 ajoute : export Airtable strict, machine à états, batch voix/image reprenable, mastering EBU R128 double passe, QC Whisper optionnel, QC technique des images, ranking DINOv2 optionnel, sélection humaine, captions ASS narration + texte écran, micro-zoom ancré, burn-in captions, QC master black/silence/loudness, registre SHA-256 et remontée Airtable.
- `npm run video:preflight`, `video:status`, `video:export`, `video:image-plan`, `video:image-batch`, `video:image-qc`, `video:subtitles`, `video:render`, `video:qc` exposent les briques principales.

Environnement ChatGPT réellement testé :
- Linux x86_64, 5 vCPU, ~5,8 GiB RAM, ~30 GiB libres, Node 22, Python 3.13, FFmpeg 7.1.5.
- Aucun GPU NVIDIA visible : FLUX et Chatterbox ne sont PAS déclarés exécutés ici.
- `scripts/video-local-preflight.mjs` est le préflight canonique : OS/CPU/RAM/disque/GPU/VRAM/Python/FFmpeg sans réseau ni téléchargement ; `scripts/local-video-preflight.mjs` n’est plus qu’un alias de compatibilité. `docs/local-video-gpu-runbook.md` impose Chatterbox court puis une scène FLUX ×3 avant un pilote complet.
- `scripts/chatterbox-storyboard-batch.py` charge Chatterbox une seule fois pour un storyboard, génère un WAV par scène + master voix, ajoute les pauses et remplace les `text_reference` par des `audio_reference` mesurées, sans changer artificiellement les métadonnées WPM/intention en faux paramètres natifs.
- `scripts/video-storyboard-promote.mjs` exige ensuite une image choisie pour chaque scène, vérifie/copie/hash les médias et passe seulement alors le contrat à `render_ready`; `publication_authorized=false` reste verrouillé.
- FFmpeg courant : build GPL avec libx264.

Stack/licences vérifiées :
- FLUX.1-schnell exact : Apache-2.0, usage commercial permis ; ComfyUI code GPL-3.0.
- Chatterbox Multilingual : MIT, français supporté ; watermark PerTh.
- Kokoro-82M exact : Apache-2.0 mais fiche officielle actuelle English ; pas fallback français validé.
- LTX-2 weights : LTX-2 Community License, pas Apache-2.0 ; licence commerciale à réexaminer selon conditions/CA.
- Cloudflare Workers AI : 10 000 Neurons/jour gratuits ; fail-closed à l’épuisement, aucun passage payant automatique.
- Remotion : optionnel ; FFmpeg suffit déjà au POC.

Pilotes canoniques :
1. Box Spread — moteur/reproductibilité.
2. OBO — éditorial, `VIDEO_METHOD_V3`, STORYBOARD_READY r2 : 18 scènes, 33,7 s, timing/prosodie PASS, aucun média généré.
3. Donation-cession — éditorial, `VIDEO_METHOD_V3`, STORYBOARD_READY r2 : 18 scènes, 33,6 s, timing/prosodie PASS, aucun média généré.
Les deux storyboards r2 ont été resegmentés car certaines unités du premier découpage 15 scènes imposaient un débit individuel incompatible avec la cible. Trois doublons techniques OBO S16–S18 ont été désolidarisés et conservés hors vidéo comme historique.
La vidéo d’introduction reste un asset de marque séparé ; le CCA reste hors des trois pilotes.

## Livre

- 16 blocs canoniques ; corpus conservé.
- 757 occurrences exactes `[À VÉRIFIER]` après résolution réelle de 5 marqueurs du montage 21 (ancien total 762).
- Couverture recalculée directement depuis les en-têtes `## n.` du texte : **213/294 sections uniques**, 0 doublon, soit **81 absentes**.
- Gaps exacts : `31–35`, `141–145`, `191–202`, `236–294`.
- Lots vérifiés/intégrés comprennent désormais notamment : mère-fille #21, apport-cession #203, seuil/marge de remploi #204, remploi circulaire/anti-abus #205, puis toute la séquence **#206–235** du chapitre 11.
- Chapitre 10 = 23 sections (`171–190`, `203–205`). Chapitre 11 = **30 sections consécutives `206–235`**, `Montages couverts=30`, 82 106 caractères et 0 marqueur. Le jalon de 20–30 montages prioritaires vérifiés/répercutés est atteint, mais l'édition reste non validée tant que gaps/QC/maquette ne sont pas terminés. Total exact du livre = 757 marqueurs.
- Charte canonique : ivoire, bleu nuit, vert canard, or discret.
- Aucun marqueur ne disparaît sans vérification/réécriture exacte ; aucun remplacement du PDF commercial sans identification de l’édition et validation humaine.

## Veille et Growth

- Collecte massive mise en pause : exploiter le corpus avant d’en ajouter.
- Cinq contenus reliés aux benchmarks : Box Spread, OBO, donation-cession, CCA, classement des flux.
- `Growth Experiments` possède désormais un vrai lien `Contenus liés` vers Content Pipeline.
- Trois expériences créées :
  1. Hook contradiction 0–2 s vs contexte d’abord.
  2. Erreur coûteuse → mécanisme → calcul → limite.
  3. Cadence 2–3 s + prosodie locale vs débit uniforme.
- KPI : rétention/complétion, sauvegardes/partages, clics attribuables, corrections et temps humain ; métrique indisponible = vide, jamais zéro inventé.
- Plan français cible : 4 semaines / 12 contenus après masters validés + autorisation de publication.

## Social

- Instagram, Facebook, YouTube, Threads, TikTok : OAuth/auth + lecture prouvés. Les anciennes notes demandant encore de créer les apps ont été corrigées.
- Connexion ≠ publication : `Publication testée` reste séparée.
- GitHub `Hibou Social Control Plane Sync` run 35782943645 : success, 5 connexions OAuth, aucune publication/achat.
- `Hibou Social Metrics` run 35780665118 : `no_published_ids`, aucune métrique fictive.
- Bluesky : dernier test 401 Invalid identifier or password ; backend prêt, secret app password à remplacer côté Vercel puis redeployer/retester.
- Reddit : son code utile a été porté sélectivement dans #175 ; il reste `unconfigured` tant que `REDDIT_API_APPROVED` n’est pas vrai. Les dry-runs restent locaux sans credentials ni side effects, le coffre OAuth peut stocker les tokens chiffrés, et une publication live reste impossible avant l’accord externe. Aucun message tiers ni appel Reddit réel n’a été envoyé.
- Les IDs Reddit/Bluesky sont projetés vers les champs de contenu/métriques ; une métrique explicitement indisponible reste `null` au lieu d’être transformée en zéro.
- LinkedIn : cible Page/organisation ; Community Management + credentials restent externes.
- Pinterest : Trial Access/credentials/board.
- X : aucun plan/crédit acheté.
- Snapchat : capacité produit/API Snap externe non approuvée.

## Commerce et coûts

- Lemon LIVE : Store 475333 / Product 1369573 / Variant 2140119 / checkout live référencé.
- Lemon TEST est strictement séparé : `LEMON_SQUEEZY_TEST_API_KEY` dédiée, ressources obligatoirement `test_mode=true`, aucun fallback vers la clé LIVE et aucune livraison Digify pour une commande test. HMAC, déduplication et remboursement out-of-order sont couverts par les tests ; preuve dynamique bloquée uniquement par la clé/ressources TEST. Runbook canonique : `docs/WORK_LEMON_TEST_RUNBOOK.md`, réconcilié le 23/09 avec l'état LIVE déjà public et le TEST fail-closed.
- Fourniture immédiate et accusé de rétractation sont deux preuves distinctes.
- Registre de coûts daté dans Configuration : Lemon = 0 $ fixe + 5 % + 0,50 $/transaction avant suppléments ; Vercel = Hobby gratuit mais 10 Go saturés ; OpenAI API = 0 € autorisé/cible.
- Digify : e-mail du 18/09/2026 à 20:59 confirme un essai gratuit de 7 jours. Documentation officielle Digify août 2026 : essai sans engagement et sans carte bancaire ; à l'expiration, le compte devient gratuit, **sans upgrade/facturation automatique**. Les fichiers envoyés/data rooms possédés ne sont toutefois plus accessibles aux destinataires jusqu'à un éventuel upgrade. Échéance théorique d'après cet e-mail : ~25/09 (activation exacte pouvant être légèrement antérieure). Aucun abonnement payant n'est démontré ni autorisé.
- Metricool : brand `lehibouruse` connecté ; promotion LinkedIn annoncée le 19/09 comme expirant sous 7 jours (~26/09) ; aucun plan payant démontré. X impose plan payant + add-on 10 €/mois/compte, non souscrit.
- L'ancienne simulation `100 € de frais fixes` n'est plus une donnée constatée ; recalculer la contribution uniquement avec les coûts réellement engagés.

## Préflight GPU / runbook

- Runbook : `docs/local-video-gpu-runbook.md`.
- Script canonique : `scripts/video-local-preflight.mjs`.
- Correction 23/09 : le script canonique accepte désormais `--require-ready` et l'alias historique `--require-gpu`, conformément à la documentation.
- Test minimal imposé avant extension : un échantillon Chatterbox court, une scène FLUX ×3 candidats, preuve d'idempotence, ffprobe, temps mur/VRAM si disponible, aucun tunnel public et aucun fallback payant.

## Blocages humains précis

1. **PR #175** : autorisation Marc pour fusion/déploiement Production. Débloque preuve runtime du coupe-circuit OpenAI + règles Vercel.
2. **Bluesky** : remplacer dans Vercel Production la valeur complète de `BLUESKY_APP_PASSWORD`, redéployer, puis relancer identité/lecture. Ne jamais partager le secret dans le chat.
3. **Lemon TEST** : créer/retrouver une clé API en mode Test et la stocker dans Vercel sous `LEMON_SQUEEZY_TEST_API_KEY`. Débloque inspect → checkout_test → webhook_test → commande/remboursement TEST. Les tests Digify restent séparés et une commande TEST ne doit jamais déclencher Digify.
4. **Reddit** : autoriser ultérieurement l’envoi du dossier et obtenir l’accord requis ; aucun contact tiers sans autorisation.
5. **GPU local** : fournir un environnement local réellement accessible avec GPU adapté avant le premier essai FLUX/Chatterbox. Vérifier GPU/VRAM/RAM/stockage avant tout gros téléchargement.
6. **Digify** : aucune action n'est nécessaire pour éviter une facturation automatique. Décision humaine seulement si Marc veut maintenir l'accès protégé des destinataires après l'essai ; sinon le compte repasse gratuit et l'accès partagé est suspendu.
7. **Publication/remplacement commercial** : validation humaine explicite.

## Prochaine action exécutable

Sans validation humaine :
1. maintenir #175 verte et ne modifier que l'infrastructure vidéo prioritaire ;
2. dès qu'une machine GPU est accessible : `npm run video:preflight` ; si PASS, générer **une unité Chatterbox**, puis **une scène FLUX ×3 candidats** ;
3. exécuter ensuite le QC image, la sélection humaine de cette scène, le mastering audio, captions, promotion render-ready, rendu et QC master ;
4. seulement si ce micro-test est exploitable : passer à 3 scènes, mesurer temps/VRAM/corrections/idempotence, puis OBO complet ;
5. Donation-cession vient après OBO en réutilisant exactement la même usine ;
6. ne télécharger aucun modèle optionnel Whisper/DINOv2 tant qu'un gain réel n'est pas nécessaire ; ils restent des modules gratuits d'assistance, non des dépendances du cœur.

Après validation PR #175 :
1. fusionner/déployer ;
2. vérifier les six endpoints payants bloqués, `openai_calls=0`, sans appel OpenAI ;
3. mesurer Function Storage Vercel après déploiement/rétention ;
4. conserver le site, commerce et social déterministes fonctionnels.
