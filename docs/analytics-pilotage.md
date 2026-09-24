# Synchronisation Analytics — Pilotage

`npm run analytics:sync -- --date=YYYY-MM-DD` produit un dry-run journalier depuis :
- `Conversion Events` : sessions `landing` et `checkout_click` ;
- `Ventes` : uniquement statuts explicitement payés et non remboursés.

Les sessions sont dédupliquées par `Session ID`. Une vente dans une autre devise que EUR n'est jamais convertie implicitement : le CA EUR reste partiel.

Pour écrire la ligne journalière dans Airtable :

```bash
npm run analytics:sync -- --date=2026-09-24 --apply
```

Un `AIRTABLE_TOKEN` local est requis. Les coûts Lemon, outils, temps humain et corrections ne sont jamais inventés et restent vides tant qu'une source mesurée n'existe pas.
