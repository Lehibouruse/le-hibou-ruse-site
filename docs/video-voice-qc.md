# QC voix locale — Whisper ↔ verbatim

Le pipeline peut contrôler la narration Chatterbox avec une retranscription locale Whisper/faster-whisper.

## Exécution en deux étapes

```
python scripts/forensic-transcribe-local.py voice-mastered.wav voice-transcript.json
node scripts/video-voice-qc.mjs contract-mastered.json voice-transcript.json voice-qc.json
```

## Wrapper local

```
node scripts/video-voice-qc-run.mjs contract-mastered.json voice-mastered.wav output-dir
```

Le wrapper exige `HIBOU_FORENSIC_PYTHON` ou `HIBOU_PYTHON`. Il n’existe aucun fallback cloud.

Le QC :
- normalise accents et ponctuation ;
- calcule le WER global ;
- rattache les segments Whisper aux spans audio de chaque scène ;
- calcule un WER par scène ;
- renvoie `REVIEW` et la scène fautive si nécessaire ;
- ne permet jamais la publication automatiquement.

Seuils par défaut : WER global ≤ 12 %, WER scène ≤ 30 %, probabilité langue ≥ 75 % lorsqu’elle est fournie. Ces seuils devront être recalibrés après les premiers vrais pilotes.
