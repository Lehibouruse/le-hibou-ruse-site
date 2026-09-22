# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-22 UTC

## Décisions actuelles

- L’agent OpenAI API du projet est abandonné pour raison de coût. Aucun crédit ne doit être rechargé et aucun appel OpenAI payant ne doit être relancé.
- Le raisonnement, la recherche, la rédaction et le pilotage sont réalisés dans la formule ChatGPT actuelle.
- Les APIs sociales, Lemon Squeezy, Digify, Airtable, GitHub Actions et les traitements déterministes restent utilisables.
- Aucune publication sociale publique sans validation humaine.
- Aucun nouvel abonnement, achat ou engagement payant sans accord explicite.

## Coupe-circuit IA

- La branche de travail ajoute un verrou de code `PAID_AI_DISABLED_BY_POLICY=true`.
- `getAgentConfig().aiEnabled` reste faux même si une ancienne variable Vercel tente de remettre `AI_ENABLED=true`.
- Le worker refuse de réclamer un Job agentique et refuse création/récupération de Responses OpenAI.
- `/api/wake` continue à sélectionner les Jobs déterministes et ignore les Jobs nécessitant OpenAI.
- Les anciennes valeurs de circuit breaker restent historiques uniquement.

## Vidéo

Références : `VIDEO_METHOD_V2` + `HIBOU_VIRAL_V1@2.0`.

POC Box Spread du 22/09/2026 :
- source de verbatim : audio existant de `Le_Hibou_Box_Spread_V2_prompt_actuel_verbatim_V1.mp4`, réutilisé sans réécriture ;
- renderer : FFmpeg local déterministe ;
- format de sortie : 1080×1920, 30 fps, H.264/AAC, faststart ;
- test court : 10,4 s ;
- deux rendus identiques octet par octet, SHA-256 `54c93df3c13ca5ded280e456c86d4b2436ff2293c52ad77ed2a7fe77b35f33d0`.
- aucun GPU NVIDIA visible dans l’environnement ChatGPT utilisé pour ce POC : FLUX/Chatterbox ne sont donc pas déclarés installés ou testés ici.

Pilotes canoniques :
1. Box Spread — pilote de reproductibilité du moteur.
2. OBO — pilote éditorial.
3. Donation-cession — pilote éditorial.

La vidéo d’introduction reste un asset de marque séparé et le compte courant d’associé reste en backlog.

## Livre

- Production dans ChatGPT actuel uniquement ; anciens CREATE_BOOK non relancés.
- Charte active : ivoire, bleu nuit, vert canard, or discret.
- Gabarit cible : logique/mécanique/schéma puis chiffrage/variantes/risques/étapes.
- Les marqueurs [À VÉRIFIER] ne disparaissent qu’après vérification réelle.

## Blocages humains précis

- Vercel : un déploiement reprenant le verrou de code est nécessaire avant de pouvoir déclarer la désactivation OpenAI effective en production.
- Bluesky : remplacer uniquement `BLUESKY_APP_PASSWORD` dans Vercel par le mot de passe d’application complet et actuel, puis redéployer et relancer le test d’identité.
- Lemon TEST : créer/ajouter `LEMON_SQUEEZY_TEST_API_KEY` côté Vercel avant le test de commande sans argent réel.
- Publication sociale publique et mise en vente d’une nouvelle édition du livre : validation humaine requise.

## Reprise immédiate

1. Tester/relire la PR de désactivation + pipeline local.
2. Après accord, fusionner/déployer puis vérifier que les endpoints agentiques n’appellent plus OpenAI.
3. Rattacher Box Spread à une fiche Content Pipeline canonique et au registre de fichiers.
4. Étendre le renderer au master complet, sous-titres et remontée Airtable.
