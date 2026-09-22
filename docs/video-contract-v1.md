# Pipeline vidéo local — contrat V1

Version : `HIBOU_VIDEO_CONTRACT_V1` — 22/09/2026.

## Rôle

ChatGPT prépare le fond, le storyboard, la prosodie et le contrôle. Airtable conserve les états. Un processus local exécute les opérations techniques. Aucun composant local n’est supposé joignable depuis Vercel.

Le renderer `scripts/video-local-render.mjs` ne fait aucun appel réseau. Il accepte un contrat JSON, vérifie les fichiers et hashes, rend chaque scène en 1080×1920 à 30 fps avec micro-zoom 2–4 %, concatène les plans puis copie le flux vidéo déjà encodé et n’encode que l’audio AAC. La sortie est H.264/AAC + `faststart`. Le preset H.264 des scènes est versionné dans `engine.preset` (défaut `medium`) afin d’adapter le temps de calcul à la machine sans modifier silencieusement le contrat.

## Champs minimaux

Le JSON doit contenir :
- identifiants et versions : contenu, script, profil, méthode, moteur ;
- scènes ordonnées ;
- narration exacte. Tant qu’une transcription texte fiable n’est pas disponible, le mode `audio_reference` désigne un segment exact par fichier + SHA-256 + début/fin, afin de ne jamais réécrire le verbatim de mémoire ;
- idée visuelle et texte écran ;
- durée prévue puis mesurée ;
- candidats image, image retenue et motif ;
- unité de souffle + débit cible + vitesse locale + pause + accent + intention ;
- référence audio ;
- cues musique ; master sans morceau commercial par défaut ;
- sous-titres et leur état ;
- contrôles techniques ;
- état de validation humaine.

## Idempotence et reprise

Les chemins sont déterministes. Chaque clip de scène est placé dans `.video-render-cache` sous un nom dérivé d’une empreinte des entrées réelles (hash image, durée, zoom, dimensions, fps, preset et version moteur). Une interruption ne supprime donc plus les scènes valides : au redémarrage, les clips dont l’empreinte n’a pas changé sont réutilisés, tandis qu’une scène modifiée reçoit une nouvelle empreinte et seule cette scène est recalculée. La concaténation visuelle possède elle aussi une empreinte de contenu. Un même contrat et les mêmes assets doivent produire le même rendu dans un environnement FFmpeg identique.

Le POC Box Spread exécuté le 22/09/2026 a produit deux fichiers identiques octet par octet :
`54c93df3c13ca5ded280e456c86d4b2436ff2293c52ad77ed2a7fe77b35f33d0`.

## Commande

```bash
node scripts/video-local-render.mjs path/to/contract.json path/to/output.mp4
```

Prérequis : FFmpeg + FFprobe. Les gros médias et modèles restent hors du dépôt et hors des bundles Vercel.

## Prochaine extension

1. export Airtable → contrat V1 ;
2. adaptateur IMAGE_GEN pour ComfyUI, uniquement sur machine locale accessible ;
3. adaptateur VOICE_GEN pour Chatterbox, uniquement après test matériel et licence des poids ;
4. sous-titres à partir du texte exact validé ;
5. remontée QC/erreurs/manifeste vers Airtable ;
6. registre durable des fichiers.


## Test complet Box Spread — 22/09/2026

Le master de référence complet a été rendu à partir de 18 scènes et de l’audio/verbatim V1 existant : 42,6 s, 1080×1920, 30 fps, H.264/AAC, 15 919 538 octets, SHA-256 `64e99df73e5fd8c999893392f40ae6b0397f527b18429c75a3256ba0a24978c9`. Le rendu a utilisé `engine.preset=veryfast` compte tenu du CPU temporaire disponible. Le contrôle visuel a porté sur 1, 8, 15, 22, 29, 36 et 41 secondes. Ce fichier est un master de travail technique : publication non autorisée tant que la validation humaine n’est pas donnée.
