# Prosodie et voix V1

Feature flag recommandé : `video_prosody_v1` / variable runtime `HIBOU_VIDEO_PROSODY_V1=true`.

La couche SPÉCIFIQUE peut fournir des `voice.prosody_cues` (phrase exacte, pause, vitesse relative, accent et intention). Le planificateur :
- découpe sur la ponctuation sans modifier le texte source ;
- conserve chaque `source_span` et vérifie que leur concaténation reconstitue exactement la narration utilisateur ;
- mappe l'accent/intention vers les paramètres Chatterbox réellement supportés : `exaggeration`, `temperature`, `cfg_weight` ;
- génère chaque unité séparément ;
- ajoute les pauses localement ;
- applique un `ffmpeg atempo` modéré entre 0,85 et 1,15.

Exemple : « Et tu repayes cette marge. Chaque année. » peut garder le premier segment normal puis appliquer à « Chaque année. » `pause_before_ms=350`, `relative_speed_pct=90`, `emphasis=strong`.

Le texte `narration_exact.text` reste inchangé. Aucun mot n'est reformulé pour obtenir l'accentuation. Quand le plan prosodique est absent, le batch Chatterbox garde le comportement scène-par-scène existant.
