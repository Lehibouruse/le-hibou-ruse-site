# Vérification du domaine d4d5d6.com

Le domaine canonique reste désactivé commercialement tant que `domain_verified=false`.

## États

- `verified` : `/api/site-identity` répond avec le marqueur Hibou, le site attendu, `canonical=true` et le host canonique. Airtable passe à `true`.
- `pending` : timeout, DNS indisponible, endpoint non déployé, 404, 429 ou 5xx. L'état Airtable précédent est conservé.
- `mismatch` : une réponse explicite est servie mais l'identité ne correspond pas au Hibou. Un ancien `true` est révoqué et repasse à `false`.

Le vérificateur met à jour le champ Configuration `Dernière modification`; il ne doit jamais écrire un champ `Dernière vérification` inexistant.

Une fois le DNS/Vercel réellement raccordé et vérifié, la redirection canonique peut être activée avec `HIBOU_CANONICAL_REDIRECT_ENABLED=true`.
