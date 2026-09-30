# Musique et mixage V1

Feature flag recommandé : `video_music_mix_v1` / `HIBOU_VIDEO_MUSIC_V1=true`.

Le moteur par défaut reste FFmpeg. La musique appartient à la couche GLOBAL et doit être fournie par le profil global sous forme d'une référence locale + métadonnées de licence. Les scènes SPÉCIFIQUES ne remplacent pas cette piste implicitement.

Chaîne :
1. voix ;
2. piste musicale en boucle limitée à la durée voix ;
3. volume musical global ;
4. fade-in / fade-out ;
5. ducking par `sidechaincompress` sous la voix ;
6. `amix` ;
7. normalisation finale `loudnorm` ;
8. WAV 48 kHz / 24 bit pour l'étape d'attachement au master.

Licences acceptées en fail-closed : `owned`, `commissioned`, `cc0`, `public_domain`, `generated_local`, ou `royalty_free_with_documented_license` avec preuve de licence. Aucun fallback payant ou morceau commercial implicite.

Le manifeste enregistre les SHA-256 de la voix, de la musique et du mix. La revue humaine reste obligatoire et la publication demeure interdite.
