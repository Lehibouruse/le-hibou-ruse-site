# Le Hibou Rusé — carte canonique du projet

Mise à jour : 24 septembre 2026.

## Règle de source de vérité

Le projet utilise quatre couches distinctes. Ne pas les confondre.

1. **GitHub `main` = code canonique**
   - site et commerce ;
   - automatisations déterministes ;
   - intégrations sociales ;
   - worker Windows ;
   - pipeline local vidéo ;
   - contrats, scripts, tests et runbooks.
   - Les anciennes PR fermées et workbenches sont des archives, jamais une source d'exécution.

2. **Airtable = état opérationnel et contenu structuré**
   - Roadmap ;
   - Content Pipeline ;
   - Montages ;
   - Livre ;
   - Scènes vidéo ;
   - comptes sociaux ;
   - configuration non secrète ;
   - résultats, statuts et preuves.
   - Aucun secret ne doit être stocké dans Airtable.

3. **Library `/Le Hibou Rusé` = artefacts humains et livrables**
   - `00_Pilotage` : bilans, feuille de route, références de gouvernance ;
   - `01_Livre/00_Références` ;
   - `01_Livre/01_Brouillons` ;
   - `01_Livre/02_Exports` ;
   - `Vidéos/<Sujet>` : masters/previews ;
   - `Vidéos/<Sujet>/Archives` : POC et anciennes versions utiles.
   - Le code copié dans un ancien POC n'est jamais canonique par rapport à GitHub.

4. **ROG Windows = calcul et stockage média lourd**
   - modèles IA, caches, médias concurrents, rendus intermédiaires ;
   - aucun port public ;
   - worker désactivé par défaut ;
   - exécution seulement après opt-in explicite local ;
   - médias lourds hors Git/Vercel/Airtable.

## Infrastructure canonique actuelle

### Sécurité / coûts
- Les chemins OpenAI API payants historiques sont fail-closed en Production.
- Aucun fallback IA payant ne doit s'activer silencieusement.
- Les secrets restent côté serveur ou localement sur le PC.
- Chantier P1 formalisé dans Airtable : audit cybersécurité global et durcissement de l'architecture avant montée en charge.
- Chantier P1 distinct : sauvegardes, restauration et plan de reprise après incident.
- Tant que la politique de sauvegarde n'est pas opérationnelle, éviter les suppressions de preuves, marqueurs historiques ou artefacts utiles à la reprise.

### Vidéo
Le pipeline local est dans `main` :
- contrat `HIBOU_VIDEO_CONTRACT_V1` ;
- Airtable → storyboard/scènes ;
- Chatterbox Multilingual local ;
- ComfyUI local ;
- génération de 3 candidats image par scène ;
- sous-titres, mastering audio, rendu FFmpeg, QC et hashes ;
- smoke test 1 scène avant tout pilote complet ;
- reporting Airtable qui distingue explicitement smoke et pipeline complet.

Profil machine :
- ASUS ROG Strix G18 G814JI ;
- Intel Core i9-13980HX ;
- RTX 4070 Laptop 8 Go VRAM ;
- 32 Go RAM ;
- SSD NVMe ~1 To.

Premier profil image :
- FLUX.1-schnell FP8 ;
- génération séquentielle, batch 1 ;
- smoke 768×1344 ;
- fallback 640×1136 en cas d'OOM ;
- sortie vidéo finale 1080×1920.

### Installation locale Windows
L'installation vidéo staged est présente dans `main` :
- sans switch : diagnostic uniquement ;
- `-InstallVoice` : environnement voix local ;
- `-InstallComfyUI` : ComfyUI portable NVIDIA ;
- `-InstallFluxSchnell` : checkpoint FLUX Schnell FP8 séparé avec vérification SHA-256 ;
- `-StartComfyUI` : démarrage explicite en loopback/low-VRAM ;
- aucun modèle lourd ni service ne démarre automatiquement.

### Worker Windows
Deux usages sont séparés :
- worker média tokenless / queue GitHub publique read-only : collecte média autorisée et opt-in local ;
- scripts du dépôt : diagnostic/pipeline vidéo complet.

Garde-fous :
- `HIBOU_LOCAL_EXECUTION_ENABLED=false` par défaut ;
- localhost seulement pour le health endpoint ;
- pas de lecture de cookies navigateur depuis une commande distante ;
- aucune activation automatique après installation.

### Commerce
- Lemon TEST séparé du LIVE ;
- `LEMON_SQUEEZY_TEST_API_KEY` est le blocage humain pour le test end-to-end ;
- audit de livraison native Lemon en lecture seule présent ;
- LIVE reste protégé par les kill switches existants ;
- consentement de fourniture numérique immédiate présent mais feature-flagged, désactivé par défaut.

### Social
- Control plane social officiel + coffre chiffré ;
- métriques Bluesky publiques sans credentials ;
- Reddit présent dans le code mais fail-closed jusqu'à accord API commercial explicite ;
- les autres réseaux gardent leurs propres contraintes d'accès/audit.
- Une CI verte ne constitue jamais une preuve d'autorisation externe.

## Blocages humains canoniques

1. **ROG**
   - exécuter le diagnostic local ;
   - lancer explicitement le worker si souhaité ;
   - première preuve vidéo : Chatterbox 1 scène puis FLUX 3 candidats.

2. **Lemon TEST**
   - ajouter la clé Test directement dans Vercel ;
   - ne jamais la transmettre dans le chat ou Airtable.

3. **Réseaux**
   - effectuer uniquement les OAuth / approbations externes réellement nécessaires ;
   - Reddit : accord commercial préalable ;
   - aucune publication publique automatique lors des validations techniques.

4. **Vercel**
   - mesurer le stockage après rétention ;
   - ne supprimer aucun déploiement protégé/aliasé sans inventaire.

## Règles de nettoyage

- Préférer **archiver** à supprimer lorsqu'un artefact constitue une preuve ou une référence historique.
- Supprimer seulement les doublons, coquilles vides, builds temporaires ou copies techniques devenues manifestement inutiles.
- Fermer les PR superseded plutôt que maintenir plusieurs implémentations concurrentes.
- Ne jamais reprendre du code depuis une PR fermée si une version correspondante existe dans `main`.
- Après chaque évolution majeure, mettre à jour Airtable pour supprimer les références à des branches/workbenches devenus obsolètes.

## Prochaine séquence

1. ROG : diagnostic local sans exécution.
2. Chatterbox : une scène.
3. ComfyUI/FLUX : trois images de la même scène.
4. Smoke complet voix + image.
5. Trois scènes.
6. Pilote complet et revue mobile.
7. Industrialisation seulement après validation du pilote.
8. Audit cybersécurité complet avant montée en charge/publication à grande échelle.
9. Mise en place et test réel des sauvegardes/restauration avant tout nettoyage destructif du dépôt ou des données.
