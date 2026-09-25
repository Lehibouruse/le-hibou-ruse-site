# HIBOU_VIDEO_STYLE_PROFILE_V1

Le compilateur agrège les paquets forensic locaux sans envoyer de média sur le réseau.

Entrées : tous les `_forensic/**/manifest.json` sous le corpus concurrents.
Mesures : durée, cuts/minute, durée moyenne/médiane des scènes, silence/parole et niveaux audio.

Sortie : quantiles globaux + profils par concurrent + paramètres de production Hibou. Le profil ne copie aucune identité visuelle ou éditoriale concurrente : il ne conserve que des invariants fonctionnels mesurables.

```
node scripts/video-style-profile.mjs C:\HibouMedia\competitors C:\HibouMedia\style\hibou-video-style-profile.json --min-sources=20
node scripts/video-style-apply.mjs storyboard.json C:\HibouMedia\style\hibou-video-style-profile.json storyboard-styled.json
```

L'applicateur injecte le micro-zoom par défaut (borné 2–4 %) dans les scènes qui n'en ont pas déjà un. Le renderer existant consomme directement `scene.zoom_percent`.

Le verrou final reste humain : le profil n'est déclaré canonique qu'après un corpus suffisamment équilibré et une revue du rendu Hibou.
