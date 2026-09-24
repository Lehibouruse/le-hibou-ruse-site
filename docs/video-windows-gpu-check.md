# Vérifier un PC Windows pour le pipeline vidéo du Hibou

Ouvrir PowerShell à la racine du dépôt puis lancer :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-windows-gpu-check.ps1
```

Le script ne modifie rien sur la machine. Il relève :
- modèle NVIDIA ;
- VRAM ;
- version du pilote et version CUDA annoncée par le pilote ;
- présence de Python ;
- présence de FFmpeg.

Il écrit aussi `hibou-gpu-check.json`.

Repères pratiques pour le pipeline local :
- **16 Go de VRAM ou plus** : très confortable pour les pilotes FLUX/Chatterbox ;
- **12 Go** : bon candidat ;
- **8 Go** : testable avec réglages mémoire/offload ;
- **moins de 8 Go** : préférer un modèle image plus léger ou un GPU distant pour les rendus lourds.

Ces seuils sont des repères opérationnels, pas des exigences absolues : le modèle exact, la résolution, la quantification et l'offload CPU changent fortement la consommation mémoire.
