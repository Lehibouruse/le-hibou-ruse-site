# Cancel / supersede distant V1

Feature flag : `HIBOU_VIDEO_REMOTE_CANCEL_ENABLED=true`, **désactivé par défaut**.

Le protocole accepte soit un statut Airtable `Cancel requested` / `Supersede requested`, soit `Options JSON.control_state=cancel_requested|supersede_requested`. L'API expose un contrôle signé par les informations du heartbeat courant.

Le worker n'agit que si quatre éléments concordent : `job_id`, `worker`, `worker_session` et PID enfant actuellement détenu. Il n'exécute jamais un kill générique par nom de processus.

Sous Windows :
1. terminaison du PID ciblé avec son arbre (`taskkill /PID <pid> /T`, sans `/F`) ;
2. délai de grâce configurable (5 s par défaut) ;
3. `/F` seulement si le même enfant du même job est encore vivant ;
4. nettoyage état local ;
5. statut final `Cancelled` ou `Superseded` ;
6. job marqué traité pour éviter une reprise involontaire ; pas de retry d'erreur.

Le protocole est idempotent : plusieurs lectures de la même demande ne lancent qu'une annulation pendant l'exécution, et une fois le job marqué traité il n'est pas relancé.

La migration Airtable est seulement préparée dans `docs/migrations/airtable-video-remote-cancel-v1.json` ; elle n'est pas appliquée.
