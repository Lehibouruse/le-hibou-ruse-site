# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-22 23:17 Europe/Paris

## Décisions actuelles

- Agent OpenAI API abandonné pour raison de coût : aucune recharge, aucun appel payant, aucun fallback automatique vers un fournisseur payant.
- ChatGPT actuel = raisonnement, recherche, rédaction et pilotage. Airtable = états. Les moteurs locaux/déterministes = exécution technique.
- APIs sociales, Lemon Squeezy, Digify et automatisations déterministes restent pertinentes.
- Aucune publication sociale publique, aucun achat réel, aucun abonnement/plan payant et aucun remplacement commercial du livre sans validation humaine explicite.
- Gros médias, caches et modèles hors Git/Vercel.

## Coupe-circuit IA et branche canonique

Branche : `hibou-local-video-pipeline-20260922` — PR #175 (draft, mergeable).

- Politique fail-closed : `PAID_AI_DISABLED_BY_POLICY=true`.
- Six points d’entrée payants verrouillés : orchestrator, agent-worker, wake, analyze-montage, book-scheduler, book-finalizer.
- `.env.example` : `AI_ENABLED=false`, kill switch actif, budgets/appels IA à zéro.
- Jobs : 116 historiques ; aucun Running/Retry/Pending. Anciens CREATE_VIDEO en Manual Review ; anciens CREATE_BOOK neutralisés sans relance.
- Production n’est PAS encore déclarée protégée : la preuve finale exige fusion/déploiement puis tests runtime bloqués avec `openai_calls=0`, sans effectuer d’appel OpenAI.
- Head vérifié avant ce commit : `845f1e4f50be916976dbe1393a8752bbb3e553b1`; Hibou CI #654 = success.
- Rollback : revert du merge ou retour au main `da3dd1143b933e1e09d9f5c25b5bac7bb2ac2fd8`.

## Vercel

- Alerte Vercel du 22/09/2026 13:11 UTC : 100 % des 10 Go de Function Storage Hobby utilisés.
- Dépôt léger (~1,5 Mo), mais ~58 routes API et au moins 100 commits main depuis le 12/09 : accumulation de bundles/déploiements = hypothèse dominante, sans prétendre connaître le breakdown Vercel interne.
- PR #175 réduit les futurs déploiements : suppression de l’exception `hibou-agent/**`, déploiement Git uniquement sur `main`.
- `ignoreCommand` inclut désormais `lib/` : une modification backend de `lib/` doit déclencher le déploiement main au lieu d’être ignorée.
- Workflow historique `furet-transcript-probe.yml` supprimé sur la branche : il ne doit plus polluer chaque commit après fusion.
- Ne rien supprimer à l’aveugle et ne pas changer de plan. Après déploiement, mesurer le stockage avant/après et attendre la rétention Hobby avant suppression ciblée.

## Vidéo — Box Spread et moteur reproductible

Références : `VIDEO_METHOD_V2` + `HIBOU_VIRAL_V1@2.0`.

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

Renderer :
- `scripts/video-local-render.mjs` : rendu FFmpeg déterministe, validation des hashes, cache par empreinte, reprise scène par scène.
- Contrat : `HIBOU_VIDEO_CONTRACT_V1` + schema/documentation.
- Les artefacts locaux et `.video-render-cache` sont ignorés par Git.

Interfaces ajoutées :
- `IMAGE_GEN_V1` : `scripts/video-local-adapters.mjs`, ComfyUI loopback/local uniquement, workflow API explicite, overrides seulement sur inputs existants, ID stable, timeout 10–3600 s, retries 0–2, manifeste et réutilisation, aucun fallback payant.
- `VOICE_GEN_V1` : wrapper direct `scripts/chatterbox-local.py`, français, unités de souffle <=300 caractères, paramètres natifs Chatterbox séparés des métadonnées prosodiques Hibou, aucun serveur exposé, aucun fallback silencieux.
- Tests unitaires + compilation syntaxique Python inclus.

Environnement ChatGPT réellement testé :
- Linux x86_64, 5 vCPU, ~5,8 GiB RAM, ~30 GiB libres, Node 22, Python 3.13, FFmpeg 7.1.5.
- Aucun GPU NVIDIA visible : FLUX et Chatterbox ne sont PAS déclarés exécutés ici.
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
2. OBO — éditorial.
3. Donation-cession — éditorial.
La vidéo d’introduction reste un asset de marque séparé ; le CCA reste hors des trois pilotes.

## Livre

- 16 blocs canoniques ; corpus conservé.
- 757 occurrences exactes `[À VÉRIFIER]` après résolution réelle de 5 marqueurs du montage 21 (ancien total 762).
- Couverture canonique actuelle : 183/294 sections présentes ; 111 sections encore absentes.
- Gaps identifiés : chapitre 2 = 31–35 ; chapitre 8 = 141–145 ; chapitre 10 = 191–205 partiellement comblé ; chapitre 11 = 206–250 partiellement comblé ; chapitre 12 = 251–280 ; chapitre 13 = 281–294.
- Premier lot vérifié : régime mère-fille #21, apport-cession #203, intérêts CCA #217, remboursement principal CCA #220, plus donation-cession déjà vérifiée dans le chantier livre.
- Les sections #203, #217 et #220 ont déjà été rédigées dans le livre sans agent API.
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
- Reddit : PR #171 ouverte, non draft, mergeable, head `3cbbb0a7781aadc1d1e8d374cc38f7c04610263a`; accord API/commercial externe manquant, aucun message tiers envoyé.
- LinkedIn : cible Page/organisation ; Community Management + credentials restent externes.
- Pinterest : Trial Access/credentials/board.
- X : aucun plan/crédit acheté.
- Snapchat : capacité produit/API Snap externe non approuvée.

## Commerce

- Lemon LIVE : Store 475333 / Product 1369573 / Variant 2140119 / checkout live référencé.
- TEST séparé du LIVE. Blocage réel : clé `LEMON_SQUEEZY_TEST_API_KEY` dédiée + ressources TEST confirmées `test_mode=true`.
- Ne jamais utiliser la clé LIVE pour simuler le TEST.
- Digify déjà intégré historiquement ; ne pas réinstaller. Les tests commande TEST, webhook/déduplication, livraison/révocation restent à exécuter après clé TEST.
- Fourniture immédiate et accusé de rétractation sont deux preuves distinctes.

## Blocages humains précis

1. **PR #175** : autorisation Marc pour fusion/déploiement Production. Débloque preuve runtime du coupe-circuit OpenAI + règles Vercel.
2. **Bluesky** : remplacer dans Vercel Production la valeur complète de `BLUESKY_APP_PASSWORD`, redéployer, puis relancer identité/lecture. Ne jamais partager le secret dans le chat.
3. **Lemon TEST** : créer/retrouver une clé API en mode Test et la stocker dans Vercel sous `LEMON_SQUEEZY_TEST_API_KEY`. Débloque inspect → checkout_test → webhook_test → tests Digify.
4. **Reddit** : autoriser ultérieurement l’envoi du dossier et obtenir l’accord requis ; aucun contact tiers sans autorisation.
5. **GPU local** : fournir un environnement local réellement accessible avec GPU adapté avant le premier essai FLUX/Chatterbox. Vérifier GPU/VRAM/RAM/stockage avant tout gros téléchargement.
6. **Publication/remplacement commercial** : validation humaine explicite.

## Prochaine action exécutable

Sans validation humaine :
1. poursuivre le livre par lots de 3–5 montages sourcés et rattacher chaque correction au passage exact ;
2. préparer OBO puis donation-cession avec `HIBOU_VIDEO_CONTRACT_V1` et médias disponibles ;
3. préparer les requêtes IMAGE_GEN/VOICE_GEN et le runbook local pour la première machine GPU, sans télécharger plusieurs modèles ;
4. maintenir les expériences Growth et la matrice social/commerce sans publier.

Après validation PR #175 :
1. fusionner/déployer ;
2. vérifier les six endpoints payants bloqués, `openai_calls=0`, sans appel OpenAI ;
3. mesurer Function Storage Vercel après déploiement/rétention ;
4. conserver le site, commerce et social déterministes fonctionnels.
