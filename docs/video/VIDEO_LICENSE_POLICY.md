# Hibou — politique de licences de la stack vidéo

Dernière revue : 25 septembre 2026.

Ce document est un garde-fou d'ingénierie, pas un avis juridique. La source machine est `config/video-license-policy.json`; `npm run video:license:audit` vérifie les pins du dépôt et l'installateur appelle cet audit avant toute installation de modèle.

## Chemin commercial autorisé

- **FLUX.1 Schnell / checkpoint Comfy-Org FP8** — Apache-2.0. Le fichier approuvé est `flux1-schnell-fp8.safetensors`, SHA-256 `ead426278b49030e9da5df862994f25ce94ab2ee4df38b556ddddb3db093bf72`. Le dépôt Comfy-Org identifie le modèle de base Black Forest Labs et conserve Apache-2.0.
- **Chatterbox TTS 0.1.7** — MIT pour le code et le modèle public vérifié. Cette licence ne donne aucun droit sur la voix d'une personne : une référence vocale doit être Hibou-owned ou autorisée.
- **faster-whisper / Whisper** — MIT. Les métriques forensic/QC restent locales.
- **OpenCV 4.5+** — Apache-2.0.
- **libass** — ISC.
- **ComfyUI** — GPL-3.0. La politique Hibou l'utilise comme processus local séparé via loopback/API. Ne pas intégrer ou redistribuer un build modifié/bundlé dans un produit propriétaire sans traiter les obligations GPL.
- **FFmpeg** — licence dépendante du build. Par défaut l'amont est LGPL-2.1+, mais `--enable-gpl` fait basculer le build sous GPL et `--enable-nonfree` interdit certaines redistributions. `npm run video:license:audit:runtime` classe le build réellement installé.
- **yt-dlp** — outil local de collecte : cœur sous Unlicense, mais certains exécutables packagés embarquent du GPLv3+. Ne pas le redistribuer avec le produit Hibou sans audit du binaire exact.

## Modèles bloqués par défaut

Toute la famille **FLUX.1 dev** identifiée par Black Forest Labs comme non-commerciale est bloquée dans le pipeline commercial : dev, Krea dev, Fill dev, Canny dev, Depth dev, Redux dev et Kontext dev. Une licence commerciale séparée nécessiterait une mise à jour explicite et sourcée de la politique.

Tout modèle inconnu est également bloqué : aucun modèle téléchargé au hasard ne doit pouvoir remplacer le checkpoint Schnell approuvé.

## Custom nodes ComfyUI

Aucun custom node tiers n'est implicitement approuvé. Avant ajout : enregistrer source, version/commit, licence, nécessité technique et comportement réseau. Licence inconnue = blocage.

## Contrôles

```bash
npm run video:license:audit
npm run video:license:audit:runtime
```

Le premier contrôle est déterministe et CI-friendly. Le second interroge le FFmpeg de la machine et le modèle demandé. Un résultat local PASS ne constitue jamais une autorisation de redistribuer les binaires tiers.

## Revalidation

Revalider avant une première publication commerciale et lors de tout changement de modèle, version majeure, provenance de checkpoint, custom node ou méthode de distribution.
