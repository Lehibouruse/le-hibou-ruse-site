# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-22 21:58 Europe/Paris

## Décisions actuelles

- L’agent OpenAI API du projet est abandonné pour raison de coût. Aucun crédit ne doit être rechargé et aucun appel OpenAI payant ne doit être relancé.
- Le raisonnement, la recherche, la rédaction et le pilotage sont réalisés dans la formule ChatGPT actuelle.
- Les APIs sociales, Lemon Squeezy, Digify, Airtable, GitHub Actions et les traitements déterministes restent utilisables.
- Aucune publication sociale publique sans validation humaine.
- Aucun nouvel abonnement, achat ou engagement payant sans accord explicite.
- Les gros médias et modèles restent hors Vercel.

## Coupe-circuit IA

Branche canonique : `hibou-local-video-pipeline-20260922`, PR #175.

- `PAID_AI_DISABLED_BY_POLICY=true` bloque les six points d’entrée payants identifiés : orchestrator, agent-worker, wake, analyze-montage, book-scheduler, book-finalizer.
- `getAgentConfig().aiEnabled` reste faux même si une ancienne variable Vercel tente de remettre `AI_ENABLED=true`.
- Le worker refuse les Jobs agentiques ; les chemins déterministes restent disponibles.
- `.env.example` est fail-closed : `AI_ENABLED=false`, kill switch actif, budgets/appels IA à zéro.
- CI GitHub verte sur le head actuel `399f66be42ee1ad05247bccfcefe2a643bcc5523` (run #643).
- PR #176 a été fermée comme doublon pour éviter deux politiques de sécurité divergentes.
- Production n’est PAS encore déclarée protégée : la preuve finale nécessite fusion/déploiement de #175 puis contrôle runtime sans appel OpenAI réel.
- Audit Jobs : 116 Jobs, aucun Running/Retry/Pending ; 103 CREATE_BOOK et 3 CREATE_VIDEO historiques. Les 3 CREATE_VIDEO restent en Manual Review et les 21 CREATE_BOOK en Manual Review qui portaient encore un `next_run_at` historique ont été neutralisés (`next_run_at=null`).
- Rollback préparé : revert du merge ou retour au main antérieur `da3dd1143b933e1e09d9f5c25b5bac7bb2ac2fd8`.

## Vidéo

Références : `VIDEO_METHOD_V2` + `HIBOU_VIRAL_V1@2.0`.

Box Spread :
- source de verbatim : audio existant de `Le_Hibou_Box_Spread_V2_prompt_actuel_verbatim_V1.mp4`, réutilisé sans réécriture ;
- renderer : FFmpeg local déterministe ;
- format : 1080×1920, 30 fps, H.264/AAC, faststart ;
- POC court conservé en Library ;
- master technique complet : 18 scènes, 42,6 s, 15 919 538 octets, SHA-256 `64e99df73e5fd8c999893392f40ae6b0397f527b18429c75a3256ba0a24978c9` ;
- contrôle visuel sur 1, 8, 15, 22, 29, 36 et 41 s : PASS ;
- master sans musique commerciale ; cues conservés ;
- sous-titres exacts encore en attente car aucune transcription n’est inventée depuis l’audio ;
- publication non autorisée ; validation humaine requise ;
- Content Pipeline canonique : `recVuNUbyUm9WIpVx`, état « Master technique complet 18 scènes — PASS technique — non validé publication » ;
- Library : `/Le Hibou Rusé/Vidéos/Box Spread/Master technique 30fps 2026-09-22/` contient MP4, contrat JSON, manifeste et planche QC.

Environnement du POC :
- FFmpeg/ffprobe accessibles ; CPU temporaire suffisant au rendu déterministe ;
- aucun GPU NVIDIA prouvé dans l’environnement ChatGPT utilisé pour le POC ;
- ComfyUI/FLUX et Chatterbox ne sont donc pas déclarés installés ou testés ici.

Pilotes canoniques :
1. Box Spread — pilote de reproductibilité du moteur.
2. OBO — pilote éditorial.
3. Donation-cession — pilote éditorial.

La vidéo d’introduction reste un asset de marque séparé ; le compte courant d’associé reste en backlog.

## Livre

- Production dans ChatGPT actuel uniquement ; anciens CREATE_BOOK non relancés.
- 16 blocs canoniques.
- Version Airtable actuelle : 617 034 caractères et 762 occurrences exactes de `[À VÉRIFIER]`.
- Les compteurs des 10 blocs rédigés correspondent au recomptage exact ; chapitre 2 reste le seul `QC fail`.
- Charte active : ivoire, bleu nuit, vert canard, or discret.
- Gabarit cible : logique/mécanique/schéma puis chiffrage/variantes/risques/étapes.
- Un marqueur ne disparaît qu’après vérification réelle.

## Commerce et social

- Lemon LIVE est configuré (Store 475333, Product 1369573, Variant 2140119).
- Lemon TEST est désormais explicitement séparé : clé TEST et identifiants TEST restent à démontrer ; ne jamais utiliser la clé LIVE pour contourner ce manque.
- Reddit : PR #171 ouverte, non draft, mergeable=true ; le blocage réel est l’autorisation/permission commerciale Reddit, puis OAuth.
- Bluesky : dernier test réel 401 ; remplacer uniquement le secret `BLUESKY_APP_PASSWORD` dans Vercel, ne jamais le stocker dans Airtable/GitHub/chat.
- Instagram, Facebook, YouTube, Threads et TikTok : authentification/lecture déjà prouvées ; publication et analytics restent des preuves séparées. TikTok non audité : tests de publication uniquement en SELF_ONLY.

## Blocages humains précis

1. **Déploiement Production #175** : validation de Marc requise avant fusion/déploiement. Cela débloque la preuve runtime de coupure OpenAI.
2. **Bluesky** : remplacer le mot de passe d’application complet dans Vercel Production, redéployer puis relancer identité/lecture.
3. **Lemon TEST** : fournir/créer une clé API TEST dédiée et les ressources TEST nécessaires avant checkout/webhook sans argent réel.
4. **Reddit** : autoriser ultérieurement l’envoi du dossier/obtenir l’accord requis ; aucun message tiers envoyé sans autorisation.
5. **Publication vidéo/sociale et remplacement de l’édition commerciale** : validation humaine explicite.

## Reprise immédiate

1. Après accord de Marc, fusionner/déployer PR #175 ; vérifier les six endpoints en mode bloqué avec `openai_calls=0`, sans appel OpenAI.
2. Attacher la transcription exacte du Box Spread, générer les sous-titres et effectuer la validation humaine du master.
3. Sur une machine locale réellement accessible : détecter GPU/VRAM/RAM/stockage avant tout téléchargement de FLUX/Chatterbox ; installer uniquement le composant requis au test.
4. Préparer OBO puis donation-cession avec le même contrat/rendu.
5. Livre : traiter par lots de 3–5 montages prioritaires avec sources primaires et calculs indépendants.
