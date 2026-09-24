# Synchronisation du tableau de bord corpus

Table Airtable : **Corpus vidéo — Suivi**.

## Dry-run par défaut

```powershell
npm run corpus:dashboard
```

Le script lit le stockage local et propose :
- vidéos réellement présentes ;
- taille disque ;
- paquets forensic ;
- transcriptions réussies ;
- URLs de jobs actuellement actifs dans la queue publique.

Aucune écriture Airtable n'a lieu.

## Appliquer

Uniquement avec un `AIRTABLE_TOKEN` local :

```powershell
npm run corpus:dashboard -- --apply
```

Le script n'invente jamais un concurrent : un bucket local non apparié est signalé `unmatched` et n'est pas créé automatiquement. Les champs éditoriaux (`Analyses Sol`, `Vidéos étalon`, `Fiche signature`) ne sont jamais déduits du disque.

La couverture n'est calculée que lorsqu'une `Cible canonique` est explicitement renseignée dans Airtable.
