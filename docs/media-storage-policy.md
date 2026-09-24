# Politique de stockage local du corpus vidéo

Objectif : conserver le corpus exploitable sans laisser le SSD se remplir silencieusement.

## Inventaire

```powershell
node scripts/media-storage-inventory.mjs
```

Par défaut :
- racine = `HIBOU_MEDIA_ROOT` ou `%USERPROFILE%\HibouMedia` ;
- SHA-256 de chaque média ;
- volume par premier dossier/concurrent ;
- groupes de doublons exacts ;
- estimation de l'espace récupérable ;
- alerte si l'espace libre passe sous 20 % ou 10 %.

Mode rapide sans hash :

```powershell
node scripts/media-storage-inventory.mjs --no-hash
```

Écrire un rapport local :

```powershell
node scripts/media-storage-inventory.mjs --write-report=C:\chemin\storage-report.json
```

## Règles

1. **Aucune suppression automatique.**
2. Ne supprimer/archiver une source brute qu'après preuve qu'un paquet forensic exploitable existe et que ses hashes/manifests sont conservés.
3. Les doublons ne sont proposés que lorsqu'ils ont exactement le même SHA-256.
4. Garder le corpus canonique équilibré séparé de la réserve/archives.
5. À moins de 20 % d'espace libre : stopper les téléchargements lourds non prioritaires et préparer une destination secondaire.
6. À moins de 10 % : état critique ; ne pas lancer de génération lourde tant que l'espace n'est pas sécurisé.
