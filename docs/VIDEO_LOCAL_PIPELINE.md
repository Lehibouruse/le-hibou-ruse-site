# Production vidéo locale — reprise

Version: 2026-09-22

## Séparation des responsabilités

- ChatGPT prépare/analyse le script, les scènes, la prosodie et le QC.
- Airtable conserve les états, versions, liens, erreurs et validations.
- Le moteur local exécute les opérations techniques. Il ne contient aucun appel OpenAI.
- Les gros médias et modèles ne vont jamais dans les bundles Vercel.

## Contrat

Le format canonique est `VIDEO_CONTRACT_V1`. Il contient versions, scènes ordonnées, narration exacte (texte ou tranche audio verrouillée), visuel, texte écran, durée prévue/mesurée, candidats, image retenue, raison du choix, prosodie, audio, cues musique, sous-titres, QC et validation.

Une tranche audio verrouillée est autorisée pour reproduire exactement un ancien verbatim quand sa transcription textuelle n'est pas encore attachée. Aucune régénération TTS n'est autorisée dans ce cas.

## Renderer FFmpeg

Pré-requis vérifiés pour le POC: Python 3.13, FFmpeg/ffprobe 7.1.5. Commande:

```bash
python3 tools/video/render_video.py path/to/video_contract_v1.json output.mp4
```

Le renderer:
1. valide les entrées et l'ordre des scènes;
2. refuse un asset absent et un ordre non contigu;
3. rend chaque scène séparément, ce qui permet de conserver les scènes valides;
4. applique le micro-zoom défini dans le contrat;
5. assemble dans l'ordre;
6. ajoute l'audio verrouillé;
7. produit H.264/AAC, yuv420p, faststart;
8. mesure la durée et calcule le SHA-256.

Les sorties sont déterministes pour les mêmes entrées dans le même environnement; le POC Box Spread du 22/09/2026 a été rendu deux fois avec un SHA-256 identique.

## POC Box Spread

Content Pipeline Airtable: `recVuNUbyUm9WIpVx`.
Le POC utilise 4 scènes / 11 s, 1080×1920, 30 fps, sans musique commerciale. Il réemploie des visuels existants et une piste V1 extraite/verrouillée. Il ne constitue ni une validation éditoriale ni une autorisation de publication.

## Reprise/idempotence

Le `content_id + content_version + scene_id` constitue l'identité stable d'une scène. Avant une génération coûteuse, comparer l'identité, les paramètres et les hashes d'entrée à un résultat existant. Ne régénérer que la scène invalide. Les erreurs techniques sont remontées dans Airtable, sans créer de doublon de génération.

## IMAGE_GEN / VOICE_GEN

Interfaces à implémenter localement après validation machine:
- IMAGE_GEN: entrée = scène + prompt + paramètres réellement supportés; sortie = job_id stable, candidats, seed/paramètres, hashes, erreurs.
- VOICE_GEN: entrée = narration exacte + carte prosodique + référence autorisée + paramètres natifs du moteur; sortie = job_id stable, audio, durée, paramètres, hash, erreurs.

Ne convertir aucune intention éditoriale en pseudo-paramètre natif. Documenter ce que ComfyUI/FLUX et Chatterbox acceptent réellement lors du raccordement.

## Validation humaine

Aucun master n'est publiable tant que la validation humaine n'est pas explicitement enregistrée. La compatibilité H.264/AAC n'est pas une preuve de lecture réelle sur iPhone.
