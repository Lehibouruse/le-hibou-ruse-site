# Le Hibou Rusé — état de reprise canonique

Dernière mise à jour : 24/09/2026.

## Production / main
Le dépôt `main` contient les garde-fous paid-AI, le socle commerce Lemon TEST, le consentement numérique feature-flagged, les métriques publiques Bluesky, le worker Windows local durci et le pipeline vidéo local déterministe.

Toujours distinguer : **code prêt**, **runtime configuré**, **test réel réussi**, **production autorisée**.

## Vidéo locale
Le pipeline couvre storyboard, Chatterbox local, ComfyUI local, smoke test d’une scène, trois candidats image, rendu FFmpeg 1080×1920/30 fps, sous-titres, mastering audio, hashes/manifests, QC et reporting Airtable.

Blocage réel actuel : **diagnostic matériel du PC**. L’utilisateur a indiqué Intel Core i9 + NVIDIA GeForce RTX, mais le modèle exact et la VRAM ne doivent pas être supposés.

Première commande : `npm run video:gpu-check:windows`.

## Worker PC
Mode recommandé pour la première activation : worker GitHub sans token, queue publique en lecture seule et exécution désactivée par défaut.

Le worker Airtable avec token reste un mode avancé bidirectionnel.

## Commerce
- Lemon Squeezy = Merchant of Record.
- TEST séparé de LIVE.
- Consentement numérique piloté par feature flag.
- Aucun checkout LIVE implicite.
- La livraison réelle n’est pas considérée comme prouvée avant test de bout en bout.

## Réseaux sociaux
- Bluesky : métriques publiques sans secret lorsque l’URI du post existe.
- Reddit : code préparé derrière approbation externe explicite ; aucun appel ne doit partir avant le gate.
- Les autres réseaux gardent leurs blocages propres.

## Airtable
Airtable reste la source opérationnelle structurée pour Roadmap, Content Pipeline, Montages, Livre et états d’exécution.

## Bibliothèque
Le dossier `/Le Hibou Rusé` est organisé en :
- `00_Pilotage`
- `01_Livre/00_Références`
- `01_Livre/01_Brouillons`
- `01_Livre/02_Exports`
- `Vidéos/<Sujet>`, avec anciens POC rangés sous `Archives`

## Prochaines preuves humaines
1. Diagnostic GPU/VRAM.
2. Une scène Chatterbox.
3. Trois images ComfyUI.
4. Une scène rendue, puis un pilote.
5. Checkout TEST Lemon.
6. Accord Reddit avant activation.

## Sécurité / résilience
Trois chantiers P1 sont suivis dans Airtable : audit cybersécurité, sauvegardes/restauration, puis test réel de reprise/rotation des secrets.

## Garde-fous
- aucun secret dans GitHub/Airtable/docs ;
- aucun fallback payant silencieux ;
- aucun endpoint local exposé publiquement ;
- aucune publication sans validation appropriée ;
- ne jamais inventer un état runtime ou un modèle matériel.
