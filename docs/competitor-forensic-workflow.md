# Benchmark concurrentiel -> infrastructure de production

## Objectif

Transformer les vidéos concurrentes réellement téléchargées en mesures reproductibles de forme, puis utiliser ces mesures pour calibrer Le Hibou Rusé sans copier les scripts, les images, la voix ou la musique des concurrents.

## Séparation des machines

### Surface Pro : orchestration et analyse CPU

Le Surface peut servir à :
- gérer Airtable, GitHub et les connexions API ;
- préparer les scripts et storyboards ;
- lancer FFmpeg/ffprobe pour mesurer durée, résolution, fréquence des cuts et silences ;
- extraire des frames de contrôle ;
- agréger les signatures de forme ;
- préparer les jobs de production.

Aucun GPU NVIDIA n'est requis pour ces étapes.

### ROG RTX 4070 8 Go : génération et rendu lourd

Le ROG reste la machine de calcul pour :
- génération d'images locale via ComfyUI/FLUX en profil low-VRAM séquentiel ;
- synthèse vocale locale lorsque le modèle choisi bénéficie du GPU ;
- traitements lourds sur lots ;
- rendu final et QC accéléré.

Le pipeline doit rester découplé : le Surface prépare et orchestre, le ROG exécute les briques GPU quand il est disponible.

## Boucle forensic

1. Le worker télécharge un MP4 dans `HibouMedia/competitors/<concurrent>/<job>/`.
2. `npm run forensic:first` sélectionne le premier MP4 non encore analysé.
3. `forensic-package-local.mjs` produit :
   - `media.json` : durée, codecs, résolution, FPS, bitrate ;
   - `scene_metrics.json` : cuts, durées de scènes moyenne/médiane ;
   - `voice_metrics.json` : volume et ratio de silence ;
   - `frames.json` + frames JPEG horodatées ;
   - `transcript.json` si la transcription locale est configurée ;
   - `manifest.json` avec hashes et provenance.
4. Les sorties sont placées sous `_forensic/<nom-video>/` à côté de la vidéo, sans modifier la source.
5. Pour traiter un lot : `npm run forensic:competitors -- --limit=15`.
6. Pour cibler un concurrent : `npm run forensic:competitors -- --limit=15 --competitor=Furet`.
7. `--dry-run` affiche la sélection sans lancer FFmpeg ; `--force` recalcule un package existant.

## Ce que les mesures doivent piloter dans la production Hibou

Les mesures concurrentes servent à définir des plages, pas à reproduire un contenu :
- durée cible ;
- fréquence de changement visuel ;
- nombre de plans ;
- durée médiane des plans ;
- proportion de silence et respiration ;
- densité du texte écran ;
- vitesse de narration ;
- emplacement du hook, de la révélation et du CTA ;
- amplitude de zoom/panoramique ;
- cohérence palette/personnage.

Les valeurs cibles sont stockées dans Airtable dans `Profils vidéo`, `Scènes vidéo`, `Benchmark voix` et `Méthodologie vidéo`.

## Première référence Furet

Le corpus déjà étudié indique une recette particulièrement stable :
- vertical 9:16 ;
- durée typique autour de 68 s ;
- la très grande majorité des vidéos entre 61 et 75 s ;
- changement de tableau environ toutes les 2 à 3 s ;
- léger mouvement de type Ken Burns ;
- mascotte récurrente et palette verrouillée ;
- micro-captions très courtes ;
- narration rapide et opérationnelle ;
- hook immédiat sur un problème personnel concret, puis révélation et procédure.

Le package forensic doit maintenant vérifier ces observations sur les MP4 locaux et produire des valeurs mesurées avant de verrouiller le profil vidéo du Hibou.

## Principe de production

La cible technique n'est pas « générer une vidéo entière avec une IA ». Elle est modulaire :

`Sujet -> script -> unités de souffle -> scènes -> candidats image -> sélection/QC -> voix -> sous-titres -> montage -> QC final -> publication`

Chaque étape doit pouvoir être remplacée indépendamment sans casser le reste du pipeline.
