# Growth dashboard — Le Hibou Rusé

Objectif permanent : **portée → rétention → clic → achat**.

Le dashboard privé `/admin/growth` classe pour l’instant les ventes attribuées par :

- source / réseau (`UTM Source`) ;
- campagne ;
- vidéo, hook ou création (`UTM Content`).

Les ventes sont remontées par le webhook Lemon Squeezy et reliées aux UTM capturés first-party sur le site. Les remboursements ne gonflent pas le chiffre d’affaires attribué.

## Boucle d’optimisation cible

1. chaque publication reçoit un `utm_content` unique ;
2. le site conserve la provenance jusqu’au checkout ;
3. Lemon renvoie les custom data dans le webhook ;
4. Airtable rattache la vente à la source/campagne/création ;
5. `/admin/growth` classe les créations par revenu attribué ;
6. après connexion OAuth des réseaux, enrichir ces lignes avec impressions, watch time/rétention, clics et engagement ;
7. produire davantage de variantes des angles qui génèrent du revenu, pas seulement de l’engagement.

Aucune métrique ne doit justifier une promesse fausse, un chiffre inventé ou une violation des règles de la plateforme.