# Rotation des secrets — exercice opérationnel Hibou

Cette procédure sert à tester le remplacement d'un secret sans exposer sa valeur.

## Principes
- Le dry-run ne modifie rien.
- Les valeurs de secrets ne sont jamais affichées dans les sorties.
- Les secrets restent dans les gestionnaires prévus pour eux, jamais dans Git, Airtable ou la documentation.
- La validation se fait d'abord sur un environnement TEST ou une opération en lecture seule.
- L'ancien secret n'est désactivé qu'après validation du nouveau.
- La clé du coffre social nécessite une procédure spécifique de migration avant toute rotation réelle.

## Séquence
1. identifier tous les consommateurs du secret ;
2. générer un nouveau secret dans le service concerné ;
3. ajouter le nouveau secret aux consommateurs autorisés ;
4. effectuer un test contrôlé ;
5. basculer les consommateurs ;
6. désactiver l'ancien secret ;
7. vérifier que le nouveau fonctionne et que l'ancien n'est plus utilisé ;
8. conserver uniquement une preuve non secrète de l'exercice.

## Commande de préparation
`npm run security:secret-rotation:dry-run`

La sortie indique les groupes de secrets, les consommateurs connus et la présence éventuelle des variables attendues sans jamais afficher leur contenu.

## Critère de validation
Au moins un exercice complet doit être réalisé avec un secret de TEST, avec durée mesurée et procédure mise à jour si nécessaire.
