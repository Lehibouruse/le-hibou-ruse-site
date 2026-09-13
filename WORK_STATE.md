# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-13 UTC

## Agent API autonome V1 — opérationnel et testé

- Dépôt réel repris sans retour en arrière depuis `main` au commit `bb9eea0`.
- `HIBOU_AGENT_V1` est versionné dans le code avec les instructions générales « LE HIBOU RUSÉ — AGENT PRINCIPAL ». Un prompt OpenAI hébergé peut être substitué par `HIBOU_OPENAI_PROMPT_ID` et `HIBOU_OPENAI_PROMPT_VERSION` sans modifier l'orchestrateur.
- Routeur effectivement appliqué : règle déterministe sans IA lorsqu'elle suffit, Luna pour le simple, Terra pour l'intermédiaire, Sol uniquement après échec Terra confirmé et justifié. Deux escalades maximum, un retry API maximum par modèle et quatre appels IA maximum par Job par défaut.
- Sortie JSON stricte : `completed`, `failed`, `waiting_for_human` ou `needs_escalation`.
- Kill switch, plafonds par Job et budgets journaliers configurables par variables Vercel. Modèle, reasoning, jetons entrée/cachés/sortie, coût estimé, appels, escalades et IDs de réponse sont écrits dans Jobs et Journal.
- `POST /api/orchestrator` utilise la Responses API avec contexte minimal, filtrage des clés sensibles, `store: false` et cache de prompt. Aucun secret n'est présent dans le dépôt.
- Verrous Airtable avec bail, vérification de propriété et clé d'idempotence empêchent le double traitement.
- Les crons `/api/orchestrator` et `/api/health` sont activés en production. Sur le plan Hobby, ils s'exécutent quotidiennement; une cadence plus courte nécessitera Pipedream ou un plan Vercel supérieur.
- Un passage sans Job admissible sort avant toute lecture de budget ou tout appel OpenAI (`openai_calls: 0`). Le health check n'appelle jamais OpenAI.

## Preuves production

- Déploiement manuel validé : `dpl_CDSq6GygVnRJibzWW2ehL6AX3e5o`, état `READY`, alias `https://le-hibou-ruse-site.vercel.app`.
- Succès IA réel : Job `hibou-agent-v1-success-20260913102009` (`rec8xp72dHHEBqCjn`) passé de Pending à Running puis Completed avec `gpt-5.6-luna`, reasoning low, 1 686 jetons d'entrée, 71 de sortie, 1 appel, 0 escalade et coût estimé de 0,0004224 USD. Journal : `recpw0v3SQ9A7AHzC`.
- Attente sûre réelle : Job `hibou-agent-v1-waiting-20260913102523` (`recybKXtWECNwc3ON`) terminé en Manual Review / `waiting_for_human`, sans boucle, sans retry, sans appel IA et à coût nul. Journal : `rec3KOKmqSHKXz3uv`.
- Anti-doublon réel : Job `hibou-agent-v1-duplicate-20260913` (`rec83ZauQNcDpVgFz`) portant une clé déjà terminée a été clôturé Completed / dédupliqué, avec 0 appel IA et coût nul.
- File vide réelle : déclenchement production terminé sans modifier les Jobs achevés et sans nouvel appel IA.
- Tests locaux : 11 tests unitaires réussis et build Next.js de production réussi.

## Variables Vercel

- Secrets présents : `OPENAI_API_KEY`, `AIRTABLE_TOKEN`, `CRON_SECRET`. Leurs valeurs ne sont ni lues dans les journaux ni stockées dans GitHub ou Airtable.
- Agent : `AI_ENABLED=true`, `HIBOU_AI_KILL_SWITCH=false`, Terra et Sol autorisés, plafonds d'escalade/retry/appels et budgets par Job/jour configurés pour Production, Preview et Development.
- `LEMON_SQUEEZY_WEBHOOK_SECRET` reste à définir après création du webhook Lemon Squeezy.

## Suite utile, hors périmètre Agent V1

1. Brancher Pipedream si une fréquence inférieure à une fois par jour est souhaitée sur Vercel Hobby.
2. Finaliser le compte, le produit à 29 € et le webhook Lemon Squeezy; KYC, coordonnées bancaires et acceptation des conditions restent humains.
3. Relier une interface produit à `POST /api/analyze-montage` si cette analyse doit être exposée aux utilisateurs.
4. Compléter `Content Pipeline`, puis construire le MVP Remotion.

## Garde-fous

- Ne pas publier les premières vidéos sans validation humaine.
- Ne jamais enregistrer de token, clé ou mot de passe dans Airtable ou GitHub.
