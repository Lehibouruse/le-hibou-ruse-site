# Interfaces locales vidéo — V1

Date : 22/09/2026.

Ces interfaces séparent volontairement la préparation éditoriale, l’état Airtable et l’exécution locale. Elles ne sont pas des endpoints Vercel et ne doivent pas être exposées sur Internet.

## IMAGE_GEN_V1 — ComfyUI local

Commande :

```bash
node scripts/video-local-adapters.mjs IMAGE_GEN request-image.json
```

Le connecteur accepte uniquement un endpoint loopback (`127.0.0.1`, `localhost` ou `::1`). Il charge un workflow ComfyUI exporté en format API, applique seulement des overrides qui correspondent à des inputs déjà présents dans le workflow, envoie le graphe à `POST /prompt`, puis interroge `/history/{prompt_id}` et télécharge les sorties choisies via `/view`.

Le `prompt_id` et les chemins de sortie sont dérivés d’une empreinte stable de la requête. Une même requête ne crée donc pas spontanément une nouvelle génération si son manifeste et ses fichiers sont encore disponibles.

Exemple de requête :

```json
{
  "interface": "IMAGE_GEN_V1",
  "engine": "comfyui",
  "content_id": "box-spread",
  "scene_id": "S01",
  "endpoint": "http://127.0.0.1:8188",
  "workflow_path": "/chemin/local/flux-schnell-api.json",
  "overrides": {
    "6": { "text": "description visuelle validée" },
    "25": { "noise_seed": 123456 }
  },
  "output_node_ids": ["9"],
  "timeout_seconds": 600,
  "max_retries": 1
}
```

Les IDs de nœuds et noms d’inputs sont propres au workflow exporté : l’adaptateur ne prétend pas qu’un paramètre générique « style Hibou » existe dans ComfyUI. Les prompts, seeds, dimensions ou steps doivent être reliés à de vrais inputs du graphe choisi.

Aucun fallback cloud ou payant n’est implémenté.

## VOICE_GEN_V1 — Chatterbox Multilingual local

Commande :

```bash
node scripts/video-local-adapters.mjs VOICE_GEN request-voice.json
```

Le Node lance directement `scripts/chatterbox-local.py`. Il ne démarre pas de serveur réseau.

Paramètres natifs retenus à partir de l’implémentation officielle Chatterbox Multilingual :
- `language_id=fr` ;
- `audio_prompt_path` facultatif ;
- `exaggeration` : 0,25 à 2,0 ;
- `temperature` : 0,05 à 5,0 ;
- `seed` ;
- `cfg_weight` : 0 à 1 ;
- `model_variant` : V3 par défaut.

Une unité de souffle est limitée ici à 300 caractères afin d’éviter une troncature implicite observée dans l’interface officielle.

Exemple :

```json
{
  "interface": "VOICE_GEN_V1",
  "engine": "chatterbox_multilingual",
  "content_id": "box-spread",
  "scene_id": "S01",
  "text": "Le texte exact de cette unité de souffle.",
  "language_id": "fr",
  "audio_prompt_path": "/chemin/local/reference-autorisee.wav",
  "exaggeration": 0.55,
  "temperature": 0.8,
  "cfg_weight": 0.45,
  "seed": 42,
  "model_variant": "v3",
  "device": "cuda",
  "prosody": {
    "target_wpm": 210,
    "relative_speed_pct": 103,
    "pause_after_ms": 300,
    "emphasis": "box spread",
    "intent": "hook"
  }
}
```

Les champs `target_wpm`, `relative_speed_pct`, `pause_after_ms`, `emphasis` et `intent` sont **des métadonnées Hibou, pas des paramètres natifs Chatterbox**. Ils doivent être réalisés par le découpage en unités de souffle, le choix des paramètres natifs lorsque pertinent, puis l’assemblage/post-traitement FFmpeg. L’adaptateur les conserve dans le manifeste au lieu de feindre qu’ils sont compris nativement par le modèle.

Si CUDA est demandé mais indisponible, le wrapper échoue explicitement ; il ne bascule pas silencieusement vers un service payant.

## Reprise, délais et doublons

- ID de travail : SHA-256 canonique de la requête, tronqué pour l’identifiant lisible.
- Sortie par défaut : `.hibou-video-artifacts/<content>/<scene>/<type>/<job-id>/`, ou racine définie par `HIBOU_VIDEO_OUTPUT_ROOT`.
- Un manifeste lie la requête aux fichiers produits.
- Si le manifeste correspond et que tous les fichiers existent, la sortie est réutilisée.
- IMAGE_GEN : timeout borné 10–3600 s, retries 0–2.
- VOICE_GEN : pas de retry implicite ; une erreur modèle/matériel doit rester visible.
- Aucun secret n’est écrit dans les requêtes ou manifestes.
- Aucun service distant n’est autorisé par défaut.

## État de preuve

Les contrats, validations et tests unitaires de ces interfaces sont exécutables sans modèle. La génération FLUX et Chatterbox elle-même reste **non testée** dans l’environnement ChatGPT du 22/09/2026, qui ne présente aucun GPU NVIDIA. La première preuve réelle devra être un petit lot sur une machine GPU adaptée, avant téléchargement de plusieurs gros modèles.
