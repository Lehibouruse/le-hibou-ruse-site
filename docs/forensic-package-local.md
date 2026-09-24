# Paquet forensic local — Reels concurrents

But : transformer un MP4 déjà présent sur le PC en un paquet léger exploitable pour l'analyse, sans envoyer le média brut vers une API.

## Commande

```powershell
npm run forensic:package -- C:\HibouMedia\...\video.mp4 C:\HibouMedia\...\forensic
```

Prérequis : FFmpeg + ffprobe.

Sorties :
- `media.json` : codec, durée, dimensions, débit ;
- `audio.wav` : mono 16 kHz ;
- `scene_metrics.json` : changements de scène et cadence ;
- `voice_metrics.json` : volume et silences ;
- `frames/` + `frames.json` : frames représentatives avec hashes ;
- `manifest.json` : SHA-256 source/artefacts et preuve qu'aucune API payante n'a été utilisée ;
- `transcript.json` si une installation locale `faster-whisper` est explicitement disponible.

## Transcription locale optionnelle

Aucune installation n'est déclenchée automatiquement. Pour l'activer, définir `HIBOU_FORENSIC_PYTHON` vers un Python qui possède déjà `faster-whisper`.

Variables optionnelles :
- `HIBOU_FORENSIC_WHISPER_MODEL=small`
- `HIBOU_FORENSIC_WHISPER_DEVICE=cuda`
- `HIBOU_FORENSIC_WHISPER_COMPUTE=float16`

Si le module n'est pas disponible, le paquet reste valide avec `transcript.status=unavailable/not_run`.

## Sécurité et conservation

- aucune requête réseau ;
- aucun fallback cloud/payant ;
- aucune suppression du MP4 source ;
- les hashes permettent de dédupliquer et de relier les analyses au fichier exact ;
- l'analyse sémantique/éditoriale vient ensuite, à partir du paquet et des frames.
