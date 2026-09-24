# Pipeline vidéo Hibou V2 — niveau studio local gratuit

Date : 23/09/2026.

La V2 ajoute des couches de qualité sans introduire de service payant obligatoire.

## Architecture

**Éditorial**
Airtable → export storyboard strict → validation narration/durée/profil.

**Voix**
Chatterbox Multilingual local → cache WAV par scène → assemblage master voix → normalisation FFmpeg EBU R128 en double passe → contrôle optionnel Whisper local du verbatim.

**Images**
ComfyUI + FLUX.1-schnell local → 3 candidats déterministes par scène → cache → sélection humaine. Un score automatique peut assister plus tard la sélection, mais ne remplace jamais la validation visuelle.

**Sous-titres**
Le contrat audio-ready porte les spans réels de chaque scène. `video-subtitles.mjs` produit un ASS 1080×1920 synchronisé sur ces spans. La transcription n'est pas devinée : elle vient du verbatim exact.

**Montage**
Promotion storyboard→render-ready → FFmpeg → micro-zooms → audio AAC → master H.264 1080×1920@30.

**QC**
`video-master-qc.mjs` contrôle codec, dimensions, fps, durée, longs noirs, longs silences et loudness mesuré. Le contrôle Whisper optionnel compare ce qui est entendu au verbatim par WER ; c'est un second avis, jamais une source éditoriale.

## Targets audio projet

Par défaut, le master audio Hibou vise -16 LUFS intégré, true peak -1,5 dBTP et LRA 7. Ce sont des **targets projet** configurables, pas des exigences officielles de TikTok/Instagram.

FFmpeg `loudnorm` implémente EBU R128 et supporte la double passe avec mesure puis application.

## Gates

1. PREPARED — storyboard exporté.
2. VOICE_READY — tous WAV présents, master voix construit.
3. IMAGE_CANDIDATES_READY — 3 candidats/scène.
4. **HUMAN_IMAGE_SELECTION** — arrêt obligatoire.
5. RENDER_READY — images retenues + audio verrouillé.
6. MASTER_RENDERED — MP4 produit.
7. TECHNICAL_QC — PASS ou REVIEW.
8. **HUMAN_EDITORIAL_REVIEW** — arrêt obligatoire.
9. PUBLICATION_AUTHORIZED — uniquement sur action humaine explicite.

## Reprise

- voix : fingerprint par texte + paramètres natifs + référence vocale ;
- images : job ID stable + manifest par candidat ;
- rendu : cache clip par scène + hash image/durée/zoom ;
- QC : rapports versionnés ;
- Airtable : ne reçoit pas de faux liens locaux ; les chemins locaux restent marqués `durable_upload_pending`.

## Briques libres retenues

- FFmpeg : loudnorm/silencedetect/blackdetect pour QC déterministe.
- Whisper : MIT, code et poids ; option locale de vérification du verbatim.
- WhisperX : BSD-2-Clause si l'on souhaite ultérieurement ajouter l'alignement forcé mot à mot ; les modèles d'alignement exacts devront être vérifiés séparément avant adoption.
- DINOv2 standard : Apache-2.0 pour code et poids ; candidat futur pour score de cohérence visuelle image↔référence, sans le rendre obligatoire.

Aucun téléchargement DINOv2/Whisper n'est déclenché automatiquement par la pipeline principale.
