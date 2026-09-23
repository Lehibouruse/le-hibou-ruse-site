# Runbook GPU local — Le Hibou Rusé

Date de référence : 23/09/2026.

Objectif : tester **un composant à la fois** sur une machine réellement accessible, sans déclencher de coût cloud et sans télécharger plusieurs modèles lourds avant d’avoir vérifié le matériel.

## 1. Préflight obligatoire

Depuis le dépôt :

```bash
node scripts/video-local-preflight.mjs --require-gpu > local-video-preflight.json\n# alias historique équivalent : node scripts/local-video-preflight.mjs --require-gpu
```

Le rapport vérifie :
- OS / architecture ;
- CPU et RAM ;
- espace disque libre ;
- GPU NVIDIA et VRAM quand `nvidia-smi` est disponible ;
- autre contrôleur graphique à titre indicatif ;
- Python, Node, FFmpeg et Git.

Le script **ne télécharge rien** et ne modifie rien.

Si `nvidia_cuda_visible=false`, arrêter là pour FLUX/Chatterbox CUDA. Continuer uniquement le renderer FFmpeg, les contrats, les médias existants et la préparation des workflows.

Aucun seuil VRAM arbitraire n’est codé : les besoins dépendent du checkpoint, de la précision/quantification, du workflow ComfyUI et des dimensions. Le choix intervient après inspection de la machine.

## 2. Premier test : Chatterbox Multilingual

Pourquoi commencer par la voix : un échantillon de quelques unités de souffle permet de valider rapidement français, timbre, chiffres, sigles et prosodie avant de charger le pipeline image.

Référence officielle :
- projet ResembleAI Chatterbox ;
- installation officielle `pip install chatterbox-tts` ou installation depuis le dépôt ;
- les exemples officiels utilisent notamment `ChatterboxMultilingualTTS` et `language_id="fr"`.

Créer un environnement isolé, idéalement Python 3.11 puisque c’est la version explicitement utilisée/testée par le projet officiel :

```bash
python -m venv .venv-chatterbox
# Windows
.venv-chatterbox\\Scripts\\activate
# Linux/macOS
source .venv-chatterbox/bin/activate

python -m pip install --upgrade pip
pip install chatterbox-tts
```

Ne pas lancer une génération longue. Préparer d’abord une référence vocale autorisée, puis une seule unité de souffle représentative.

Exécution Hibou :

```bash
node scripts/video-local-adapters.mjs VOICE_GEN request-voice.json
```

Le wrapper échoue si CUDA est demandé et indisponible ; il ne bascule pas vers une API payante.

Contrôles du premier échantillon :
- français naturel ;
- pas de coupure de mot ;
- chiffres et acronymes intelligibles ;
- liaison correcte ;
- pas d’effet bande-annonce ;
- durée mesurée ;
- comparaison du débit réel avec la cible locale ;
- présence du watermark du modèle conservée.

## 3. Deuxième test : ComfyUI + FLUX.1-schnell

Le modèle exact retenu reste `black-forest-labs/FLUX.1-schnell`. La fiche officielle le décrit comme un modèle 12B, Apache-2.0, utilisable commercialement et capable de fonctionner en 1 à 4 steps. L’accès aux fichiers peut nécessiter d’accepter les conditions du dépôt Hugging Face.

Installer ComfyUI selon la procédure officielle adaptée au matériel. Avant de télécharger FLUX :
1. vérifier le rapport préflight ;
2. vérifier l’espace libre ;
3. choisir **un seul** workflow API exportable ;
4. vérifier les fichiers exacts requis par ce workflow ;
5. n’installer que ceux-là.

Ne pas installer simultanément plusieurs variantes FLUX/LTX.

Le test Hibou ne porte que sur **une scène**, avec trois candidats conformément à VIDEO_METHOD_V2.

```bash
node scripts/video-local-adapters.mjs IMAGE_GEN request-image.json
```

L’adaptateur accepte uniquement un endpoint ComfyUI loopback/local.

Contrôles :
- trois fichiers distincts ;
- dimensions attendues ;
- cohérence du Hibou si présent ;
- lisibilité mobile ;
- aucune marque/logo parasite ;
- temps total de génération ;
- VRAM/RAM observées ;
- candidat sélectionné et motif écrit dans Airtable.

## 4. Passage storyboard → render_ready

Pour chaque scène :
1. narration `text_reference` validée ;
2. voix générée/mesurée ;
3. image sélectionnée parmi les candidats ou asset déjà approuvé ;
4. hashes enregistrés ;
5. timings audio réels calculés ;
6. contrat converti en `contract_state="render_ready"`.

Le renderer doit refuser un contrat `storyboard`.

## 5. Rendu et QC

```bash
node scripts/video-local-render.mjs contract-render-ready.json master.mp4
```

Contrôler ensuite via ffprobe :
- 1080×1920 ;
- 30 fps ;
- H.264 ;
- AAC ;
- durée cohérente ;
- faststart ;
- hash SHA-256 ;
- scènes dans le bon ordre.

La compatibilité technique ne vaut pas test réel sur iPhone.

## 6. Règles de coût et de sécurité

- aucun fallback vers une API payante ;
- aucun crédit cloud ajouté ;
- aucun port ComfyUI exposé publiquement ;
- aucun secret dans Git/Airtable/contrats ;
- gros modèles, caches et médias hors Vercel ;
- arrêter après le premier échantillon si la qualité ou le matériel est insuffisant ;
- documenter version du modèle, version du code, paramètres natifs et durée de calcul.

## 7. Ordre de reprise recommandé

1. préflight machine ;
2. court échantillon Chatterbox ;
3. une scène FLUX × 3 candidats ;
4. une scène complète voix + image + FFmpeg ;
5. seulement ensuite un pilote entier.

Cela évite de télécharger ou configurer toute la stack avant d’avoir prouvé les deux briques les plus risquées.


## 8. Preuves minimales avant extension du pilote

Pour IMAGE_GEN_V1 :
- exactement 3 candidats pour une seule scène ;
- checkpoint exact, workflow hash, seed, dimensions et paramètres natifs enregistrés ;
- temps mur et VRAM observés si disponibles ;
- deuxième appel identique réutilisant le manifeste au lieu de recréer les images.

Pour VOICE_GEN_V1 :
- un hook, une unité explicative et une unité prudence ;
- durée WAV mesurée par ffprobe ;
- chiffres, acronymes, liaisons et termes fiscaux écoutés ;
- paramètres natifs Chatterbox enregistrés ;
- cible WPM conservée comme métrique Hibou, pas comme paramètre natif.

Ordre recommandé pour OBO :
1. OBO-S01 images ×3 ;
2. OBO-S01 voix ;
3. OBO-S11/OBO-S12 voix prudence ;
4. rendu FFmpeg 3 scènes ;
5. QC ;
6. seulement après PASS, pilote complet.

Aucun tunnel public ComfyUI, aucun service cloud payant et aucun fallback silencieux.
