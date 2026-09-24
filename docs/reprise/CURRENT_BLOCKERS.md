# Verrous actuels

Ce fichier décrit les dépendances qui empêchent encore une preuve de bout en bout. Il ne remplace pas Airtable, qui reste la source opérationnelle détaillée.

## Vidéo locale
- Matériel confirmé : ASUS ROG Strix G18 G814JI / i9-13980HX / RTX 4070 Laptop 8 Go / 32 Go RAM / SSD NVMe ~1 To.
- À prouver au runtime : pilote/CUDA, VRAM/RAM/disque disponibles, puis une voix Chatterbox et trois images ComfyUI sur une scène.
- Ensuite : trois scènes, renderer FFmpeg + QC, pilote complet, lecture iPhone.
- Aucun gros modèle avant préflight runtime.

## Commerce
- Code TEST présent.
- À fournir côté runtime : `LEMON_SQUEEZY_TEST_API_KEY`.
- À prouver ensuite : checkout TEST, webhook signé, déduplication Airtable, remboursement TEST, zéro effet LIVE/Digify.

## Réseaux
- Bluesky : métriques publiques prêtes ; publication dépend encore de credentials valides.
- Reddit : rester fail-closed tant que l'approbation commerciale externe n'est pas obtenue.
- Les autres réseaux gardent leurs propres gates OAuth/audit.

## Sécurité / sauvegarde
- Audit transversal en cours.
- Backup local sécurisé + répétition de restauration disponibles.
- Reste à choisir une copie secondaire indépendante et à faire un vrai exercice de restauration/rotation.

## Vercel
- Réduire/mesurer le Function Storage sans supprimer de déploiement protégé ou aliasé au hasard.
