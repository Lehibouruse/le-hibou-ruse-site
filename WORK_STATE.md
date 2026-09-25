# Le Hibou Rusé — état de reprise canonique

Dernière mise à jour : 24/09/2026.

## Règle de lecture

Toujours distinguer :
1. **code présent dans `main`** ;
2. **runtime réellement configuré** ;
3. **test réel réussi** ;
4. **production/publi­cation autorisée**.

Une CI verte ne prouve ni un accès externe, ni un secret configuré, ni une publication réelle.

## Matériel local à confirmer par diagnostic

Informations connues : PC gaming Windows, Intel Core i9 et NVIDIA GeForce RTX. Le modèle exact du PC, le modèle exact du GPU, la VRAM, la RAM et le stockage ne doivent pas être considérés comme confirmés tant que le diagnostic local n'a pas été exécuté.

Le profil canonique est `video/hardware/detect-at-runtime.json`. Le diagnostic runtime est obligatoire avant génération lourde.

## Vidéo locale

Le socle vidéo est dans `main` :
- contrat `HIBOU_VIDEO_CONTRACT_V1` ;
- Airtable → scènes/storyboard ;
- Chatterbox Multilingual local ;
- ComfyUI local ;
- génération séquentielle de candidats image ;
- sous-titres, mastering audio, rendu FFmpeg 1080×1920 / 30 fps ;
- QC, hashes, manifests ;
- smoke test d'une seule scène ;
- reporting Airtable qui distingue un smoke d'un pilote complet ;
- installation Windows staged : diagnostic par défaut, installations lourdes uniquement avec switches explicites.

Le profil image de départ dépend de la VRAM réellement mesurée. Pour une machine contrainte, le pipeline prévoit batch 1, génération séquentielle, low-VRAM/quantification adaptée et baisse de résolution avant tout autre compromis. Aucun fallback cloud payant silencieux.

Preuve runtime encore attendue :
1. diagnostic GPU/driver/CUDA/disque ;
2. une scène voix Chatterbox ;
3. trois images ComfyUI ;
4. smoke complet ;
5. trois scènes ;
6. pilote complet + lecture iPhone.

## Worker Windows

Le worker local est opt-in :
- exécution désactivée par défaut ;
- queue inactive par défaut ;
- démarrage explicite ;
- health local uniquement ;
- aucune lecture de cookies navigateur depuis une commande distante ;
- aucun téléchargement automatique pendant un diagnostic.

## Commerce

- Lemon Squeezy = Merchant of Record.
- TEST et LIVE restent séparés.
- Le bootstrap TEST existe côté code.
- Le consentement de fourniture numérique est feature-flagged.
- Les replays ordinaires du parcours de consentement réutilisent le checkout déjà journalisé via un `request_id` stable.
- Les commandes/remboursements sont dédupliqués.
- Les liens d'accès publics n'énumèrent pas les commandes.

Preuve encore nécessaire avant LIVE :
- clé Lemon TEST installée côté Vercel ;
- checkout TEST ;
- webhook TEST ;
- livraison/révocation TEST ;
- confirmation durable du consentement ;
- validation explicite avant activation LIVE.

## Réseaux sociaux

Les intégrations utilisent un control plane fail-closed. Un connecteur présent dans le code ne vaut jamais approbation externe.

- Bluesky : métriques publiques possibles sans credentials lorsque l'URI du post existe.
- Reddit : activation uniquement après accord externe requis et configuration correspondante.
- Les autres réseaux conservent leurs propres OAuth/audits/contraintes.

## Sécurité

Déjà dans `main` :
- trust boundaries et politique sécurité ;
- auth explicite des routes sensibles ;
- paid-AI fail-closed ;
- CSP en Report-Only ;
- inventaire statique de la surface API ;
- Dependabot npm + GitHub Actions ;
- scanner local de patterns sensibles ;
- audit des GitHub Actions non épinglées ;
- dry-run de rotation des secrets sans émission de valeurs ;
- replay/idempotence des principales écritures publiques ;
- politique WAF/rate-limit en mode observation, non enforced.

Restent à prouver ou activer :
- branch protection GitHub ;
- observation navigateur CSP puis enforcement minimal ;
- rate limiting distribué/Vercel-WAF après observation du trafic ;
- exercice réel de rotation d'un secret TEST.

## Sauvegardes / résilience

Dans `main` :
- Git bundle ;
- exports Airtable safe/redacted ;
- chiffrement AES-256-GCM disponible pour exports sensibles ;
- manifest + SHA-256 ;
- restore rehearsal local non destructif ;
- planification Windows opt-in ;
- copie indépendante : vérification avant copie, copie, re-vérification après copie.

Restent à faire en runtime :
- premier backup réel ;
- rehearsal PASS sur ce backup ;
- destination réellement indépendante choisie ;
- première copie indépendante PASS ;
- actifs Library prioritaires recopiés ;
- RPO/RTO mesurés.

## Airtable

Airtable reste la source opérationnelle pour :
- Roadmap ;
- Content Pipeline ;
- Montages ;
- Livre ;
- scènes vidéo ;
- comptes sociaux ;
- configuration non secrète ;
- statuts et preuves.

Aucun secret en clair ne doit être stocké dans les tables ordinaires.

## Livre

La liste canonique contient le socle Top 100+ des montages regroupés. Format des fiches :
1. concept/mécanisme technique ;
2. Exemple du Hibou, chiffré, narratif et provocateur ;
3. risques associés uniquement lorsqu'ils existent.

Rédaction prévue par lots de 10 fiches, cible globale d'environ 100 à 250 pages avant mise en forme.

## Blocages humains réellement utiles

1. PC : exécuter le diagnostic local puis le premier smoke vidéo.
2. Lemon : ajouter la clé TEST directement dans Vercel, sans la transmettre dans le chat.
3. GitHub : confirmer la branch protection de `main`.
4. Vercel : activer/observer ultérieurement WAF/rate-limit selon le plan.
5. Backup : choisir une vraie destination indépendante et lancer le premier backup réel.
6. Accès sociaux : compléter uniquement les OAuth/approbations externes réellement nécessaires.

## Garde-fous

- aucun secret dans Git/Airtable/docs ;
- aucun fallback payant silencieux ;
- aucun endpoint local exposé publiquement ;
- aucun worker démarré implicitement ;
- aucune publication automatique non validée ;
- ne jamais inventer un runtime, un accès externe ou une preuve de test.
