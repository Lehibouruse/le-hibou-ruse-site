# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-22 UTC

## Décision actuelle — agent OpenAI API abandonné

- Ne pas recharger de crédit OpenAI et ne pas réactiver l'agent API du projet.
- Raisonnement, recherche, rédaction et pilotage : ChatGPT dans la formule actuelle de Marc.
- Conserver les API sociales/commerciales et les traitements déterministes utiles.
- Défense en profondeur préparée : IA projet désactivée par défaut, kill switch actif par défaut, scheduler livre bloqué quand l'IA projet est désactivée, wake ne sélectionne plus les Jobs exigeant OpenAI.
- Les anciennes preuves de fonctionnement de l'agent sont historiques uniquement.
- Aucune publication vidéo publique sans validation explicite de Marc.
- POC technique courant : Box Spread. Les trois pilotes commerciaux canoniques restent OBO, donation-cession et compte courant d'associé.

## Déploiement

Ces garde-fous doivent être déployés en production avant de considérer la coupure comme prouvée côté runtime. Une branche, une variable enregistrée ou un document ne suffit pas à elle seule.

---

