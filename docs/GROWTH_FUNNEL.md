# Le Hibou Rusé — Growth funnel

Objectif permanent : **portée → rétention → clic → achat**.

## Mesure minimale

Chaque contenu social doit utiliser un identifiant stable `utm_content` et une campagne `utm_campaign` lorsque la plateforme permet un lien traçable. Les ventes Lemon Squeezy remontent l’attribution dans Airtable.

Le tableau privé `/admin/growth` agrège les ventes par :

- source (`utm_source`) ;
- campagne (`utm_campaign`) ;
- création/hook (`utm_content`).

## Règles d’optimisation

1. Ne jamais sélectionner un gagnant uniquement sur les vues : privilégier les contenus qui transforment la portée en clics puis en ventes.
2. Une création avec peu de vues mais un fort revenu par vue doit rester candidate à réplication.
3. Un contenu très vu sans clic ni vente doit être retravaillé sur le CTA, la promesse ou l’alignement avec la landing page.
4. Les titres, hooks et CTA peuvent être agressifs et très accrocheurs, mais la promesse doit rester exacte.
5. Ne jamais créer de faux compte à rebours, fausse rareté, faux témoignage ou fausse promesse de gain.

## Étape suivante après OAuth social

Quand les APIs sociales seront autorisées, enrichir le tableau avec : impressions/vues, watch time/rétention, clics et abonnements. Calculer alors au minimum :

- CTR vers `d4d5d6.com` ;
- ventes / 1 000 vues ;
- revenu / 1 000 vues ;
- taux de conversion clic → achat ;
- taux de remboursement par source/création.

Ces métriques doivent piloter les futures variations de scripts et la cadence de réplication des formats gagnants.