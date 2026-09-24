# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-24 — sécurité Production + infrastructure vidéo

## Décisions actuelles

- Agent OpenAI API abandonné pour raison de coût : aucune recharge, aucun appel payant, aucun fallback automatique vers un fournisseur payant.
- ChatGPT actuel = raisonnement, recherche, rédaction et pilotage. Airtable = états. Les moteurs locaux/déterministes = exécution technique.
- APIs sociales, Lemon Squeezy, Digify et automatisations déterministes restent pertinentes.
- Aucune publication sociale publique, aucun achat réel, aucun abonnement/plan payant et aucun remplacement commercial du livre sans validation humaine explicite.
- Gros médias, caches et modèles hors Git/Vercel.
- Priorités opérationnelles actuelles : sécurisation Production (#177), infrastructure vidéo reproductible, puis progression du livre par lots vérifiés sans bloquer sur le GPU.

## Coupe-circuit IA et branches de référence

**Sécurisation Production :** branche `hibou-production-paid-ai-kill-switch` — PR #177 (draft, mergeable). **Workbench vidéo/social :** branche `hibou-local-video-pipeline-20260922` — PR #175. Ne plus utiliser #175 comme véhicule de déploiement du coupe-circuit OpenAI.

- Politique fail-closed : `PAID_AI_DISABLED_BY_POLICY=true`.
- PR #177 verrouille les six points d’entrée payants : orchestrator, agent-worker, wake, analyze-montage, book-scheduler, book-finalizer. Agent-worker refuse aussi `openaiStep`/`openaiStepStatus` sous la politique.
- `.env.example` : `AI_ENABLED=false`, kill switch actif, budgets/appels IA à zéro.
- Le wake déterministe reste utilisable pour les jobs ne nécessitant pas OpenAI ; social, commerce, domaine et traitements déterministes ne sont pas coupés globalement.
- PR #177 head `441239095e0f1a62db293cafa97ed3fe94ea713e` : Hibou CI #762 = success le 24/09/2026. Le workflow historique Furet a été supprimé de cette PR afin de ne plus générer d’échecs parasites après fusion.
- Production n’est PAS encore déclarée protégée : la preuve finale exige fusion/déploiement autorisé de #177 puis tests runtime fail-closed avec `openai_calls=0`, sans requête OpenAI réelle.
- Production reste sur l'ancien comportement tant que #177 n'est pas déployée. Preuve runtime la plus récente : System Watchdog run `36039517328` du 24/09 18:11 UTC retourne `circuit.active=false` avec l'ancien motif OpenAI crédit ; ne pas marquer le coupe-circuit comme effectif avant déploiement et preuve fail-closed.
- Rollback : revert du merge de #177 ou retour au `main` précédent.

## Vercel

- Alerte Vercel du 22/09/2026 13:11 UTC : 100 % des 10 Go de Function Storage Hobby utilisés.
- Dépôt léger (~1,5 Mo), mais ~58 routes API et au moins 100 commits main depuis le 12/09 : accumulation de bundles/déploiements = hypothèse dominante, sans prétendre connaître le breakdown Vercel interne.
- PR #177 porte la correction Production des futurs déploiements : suppression de l’exception `hibou-agent/**`, déploiement Git uniquement sur `main`.
- `ignoreCommand` inclut désormais `lib/` : une modification backend de `lib/` doit déclencher le déploiement main au lieu d’être ignorée.
- Workflow historique `furet-transcript-probe.yml` supprimé de #177 : il ne doit plus polluer chaque commit après fusion.
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
- Gaps intégrés exacts à ce stade : `31–35`, `141–145`, `191–202`, `236–294`.
- Nouveau lot **236–240 vérifié et prêt à assembler**, mais volontairement non compté dans les 213 tant qu'il n'est pas inséré dans le chapitre canonique. Draft durable : `docs/book/sections-236-240-verified.md`. Corrections clés : management fees relus à la lumière de CE 4 oct. 2023 n°466887 ; rente viagère 70/50/40/30 = fraction d'assiette, pas taux ; viager = plus-value au fait générateur de la vente ; prix fixe échelonné ≠ rente viagère.
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

- Production `Hibou Social Control Plane Sync` run **36030401854** du 24/09 16:52 UTC = SUCCESS : 9 providers dans ce control plane, 5 OAuth directs connectés et sans reauth (YouTube, Instagram, Facebook, TikTok, Threads), 5 fully-authorized-with-analytics.
- Routage opérationnel ≠ accès API direct : lecture 7/9 prête (5 direct + 2 Metricool), publication 7/9 via Metricool, analytics 7/9 via Metricool ; 2 bloqués dans le routage courant. Aucune publication, aucun OAuth lancé, aucun achat API et aucun secret exposé.
- Blocages directs externes actuels : LinkedIn Community Management, Pinterest Trial Access, X API + billing, Snapchat product approval.
- `Hibou Social Metrics` run **36034661579** du 24/09 17:29 UTC = SUCCESS : `processed=0`, `reason=no_published_ids`. Growth : 2 visiteurs attribués, 0 checkout, 0 achat, aucune publication déclenchée.
- Bluesky reste hors de ce résumé 9-provider : dernier test distant = HTTP 401 identifiant/mot de passe. Le code/métriques publiques sont préservés dans #175 ; action humaine unique = remplacer en privé le vrai `BLUESKY_APP_PASSWORD`, puis redéployer et tester identité/lecture sans publier.
- PR historique Reddit/Bluesky **#171 est fermée sans merge depuis le 24/09**, mais ses briques utiles sont reprises dans #175 (`social-reddit.mjs`, métriques Bluesky, tests, documentation). Ne pas traiter #171 comme dépendance.
- Reddit reste fail-closed tant que `REDDIT_API_APPROVED=true` n'a pas été établi après accord externe. Dossier commercial prêt, aucun formulaire/message tiers envoyé, aucun appel Reddit live. Scopes proposés : `identity read submit`; subreddit laissé vide jusqu'à choix et vérification des règles.
- Les métriques explicitement indisponibles restent `null`, jamais zéro inventé ; le score Reddit reste distinct des likes.

## Commerce et coûts

- Lemon LIVE : Store 475333 / Product 1369573 / Variant 2140119 / checkout live référencé, mais **vente temporairement pausée** depuis le 24/09 : `commerce_launch_authorized=false`.
- Motif de la pause : l'essai Digify est terminé et aucun provider de livraison de remplacement n'est encore vérifié. Le produit/checkout Lemon n'ont pas été supprimés.
- Preuve runtime Production : System Watchdog run **36039517328** (24/09 18:11 UTC) = `launch_ready=false`, `commerce_active=0`, `commerce_stuck=0`, blocker unique `launch_authorized`.
- Table Ventes vérifiée : **aucune commande réelle payée en attente** ; uniquement une ancienne ligne « Configuration en attente » sans ID commande ni e-mail client. La pause n'abandonne donc aucun acheteur.
- Digify : essai terminé le 24/09, aucun abonnement payant démontré. `digify_api_status=TRIAL_ENDED_NOT_DELIVERABLE`. Les anciens tests API restent des preuves historiques, pas une preuve de disponibilité commerciale actuelle.
- #175 prépare un fallback `lemon_native` : inspecteur de fichiers en lecture seule, URLs signées non exposées, route de livraison séparée de Digify et readiness provider-aware. **État actuel volontairement fermé :** `delivery_provider_mode=digify`, `lemon_native_delivery_verified=false`.
- Le workbench refuse désormais Digify si son statut commercial n'est plus actif, même si des credentials historiques sont encore présents. CI verte avant le dernier commit documentaire : #777 sur `3512ca77...`.
- Lemon TEST reste strictement séparé : clé `LEMON_SQUEEZY_TEST_API_KEY` dédiée, ressources obligatoirement `test_mode=true`, aucun fallback LIVE et aucun effet Digify pour une commande TEST.
- Fourniture immédiate et accusé de rétractation restent deux preuves distinctes.
- Registre de coûts : Lemon = 0 $ fixe + 5 % + 0,50 $/transaction avant suppléments ; Vercel Hobby = dernier signal 100 % / 10 Go Function Storage ; OpenAI API = 0 € autorisé/cible ; Digify = essai terminé ; Metricool = aucun plan payant démontré.
- L'ancienne simulation `100 € de frais fixes` n'est pas une donnée constatée ; recalculer la contribution avec les coûts réellement engagés.

## Préflight GPU / runbook

- Runbook : `docs/local-video-gpu-runbook.md`.
- Script canonique : `scripts/video-local-preflight.mjs`.
- Correction 23/09 : le script canonique accepte désormais `--require-ready` et l'alias historique `--require-gpu`, conformément à la documentation.
- Test minimal imposé avant extension : un échantillon Chatterbox court, une scène FLUX ×3 candidats, preuve d'idempotence, ffprobe, temps mur/VRAM si disponible, aucun tunnel public et aucun fallback payant.

## Blocages humains précis

1. **PR #177** : autorisation Marc pour fusion/déploiement Production. C’est la PR minimale dédiée au coupe-circuit OpenAI + règles Vercel ; #175 reste le workbench. CI #762 verte, mais Production prouve encore `circuit.active=false` tant que #177 n'est pas déployée.
2. **Bluesky** : remplacer dans Vercel Production la valeur complète de `BLUESKY_APP_PASSWORD`, redéployer, puis relancer identité/lecture. Ne jamais partager le secret dans le chat.
3. **Lemon TEST** : créer/retrouver une clé API en mode Test et la stocker dans Vercel sous `LEMON_SQUEEZY_TEST_API_KEY`. Débloque inspect → checkout_test → webhook_test → commande/remboursement TEST. Les tests Digify restent séparés et une commande TEST ne doit jamais déclencher Digify.
4. **Reddit** : autoriser ultérieurement l’envoi du dossier commercial déjà préparé ; PR #171 est fermée sans merge mais le code utile est conservé dans #175. Aucun contact tiers sans autorisation.
5. **GPU local** : fournir un environnement local réellement accessible avec GPU adapté avant le premier essai FLUX/Chatterbox. Vérifier GPU/VRAM/RAM/stockage avant tout gros téléchargement.
6. **Digify** : l’essai est terminé depuis le 24/09. Aucune action n’est nécessaire pour éviter une facturation automatique démontrée. Décision humaine uniquement si Marc veut réactiver une livraison protégée payante ; sinon ne rien souscrire.
7. **Publication/remplacement commercial** : validation humaine explicite.

## Prochaine action exécutable

Sans validation humaine :
1. maintenir #175 verte et ne modifier que l'infrastructure vidéo prioritaire ;
2. dès qu'une machine GPU est accessible : `npm run video:preflight` ; si PASS, générer **une unité Chatterbox**, puis **une scène FLUX ×3 candidats** ;
3. exécuter ensuite le QC image, la sélection humaine de cette scène, le mastering audio, captions, promotion render-ready, rendu et QC master ;
4. seulement si ce micro-test est exploitable : passer à 3 scènes, mesurer temps/VRAM/corrections/idempotence, puis OBO complet ;
5. Donation-cession vient après OBO en réutilisant exactement la même usine ;
6. ne télécharger aucun modèle optionnel Whisper/DINOv2 tant qu'un gain réel n'est pas nécessaire ; ils restent des modules gratuits d'assistance, non des dépendances du cœur.

Après validation PR #177 :
1. fusionner/déployer #177 uniquement ;
2. vérifier les six endpoints payants bloqués, `openai_calls=0`, sans appel OpenAI ;
3. mesurer Function Storage Vercel après déploiement/rétention ;
4. conserver le site, commerce et social déterministes fonctionnels.
