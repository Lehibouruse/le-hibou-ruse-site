# CSP Report-Only — phase d’observation

Le site envoie une politique `Content-Security-Policy-Report-Only`. Elle ne bloque aucune ressource : elle sert à identifier les besoins réels avant enforcement.

## Politique de départ

- `default-src 'self'`
- `base-uri 'self'`
- `object-src 'none'`
- `frame-ancestors 'none'`
- scripts limités au site avec `unsafe-inline` et `unsafe-eval` temporairement observés en Report-Only ; styles avec `unsafe-inline` temporaire pour compatibilité Next.js actuelle ;
- images HTTPS/data/blob ;
- connexions self + Vercel Insights ;
- formulaires/frames Lemon Squeezy autorisés ;
- médias/workers self/blob ;
- upgrade des ressources HTTP.

## Pourquoi ne pas enforcer immédiatement ?

Le layout Next.js contient des scripts inline (hydratation + JSON-LD) et Vercel Analytics. Une policy trop stricte sans nonce/hash testé pourrait casser le site, le tracking ou le checkout. La présence de `unsafe-eval` dans la phase Report-Only ne signifie pas qu'il sera conservé dans la policy enforced.

## Validation avant enforcement

1. déployer Report-Only ;
2. ouvrir page d’accueil, pages légales, article, formulaire, achat-guide et page merci ;
3. tester Vercel Analytics ;
4. tester checkout Lemon TEST ;
5. tester les flux OAuth sociaux qui ouvrent/retournent sur le site ;
6. relever les violations dans les DevTools navigateur / logs disponibles ;
7. distinguer violations légitimes et dépendances réellement nécessaires ;
8. réduire la policy ;
9. seulement ensuite remplacer l’en-tête Report-Only par `Content-Security-Policy`.

Aucune CSP enforced ne doit être fusionnée sans ce passage de validation.
