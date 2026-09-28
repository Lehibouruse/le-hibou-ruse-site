# Cancel / supersede distant V1

Feature flag : `HIBOU_VIDEO_REMOTE_CANCEL_ENABLED=true`, **désactivé par défaut**.

Le protocole accepte soit un statut Airtable `Cancel requested` / `Supersede requested`, soit `Options JSON.control_state=cancel_requested|supersede_requested`. Une demande n'est exposée au worker que si `control_request_id` et `control_requested_at` sont explicites et si elle est liée à un `worker` et un `worker_session` actifs. La session est désormais épinglée dès le premier `Running`, sans attendre le premier heartbeat.

Le worker n'agit que si le schéma de contrôle, `job_id`, `request_id`, horodatage, `worker`, `worker_session` et PID enfant actuellement détenu concordent. Les contrôles sans provenance complète sont refusés (fail-closed) et les demandes antérieures au démarrage courant au-delà de la fenêtre de tolérance sont ignorées. Il n'exécute jamais un kill générique par nom de processus.

Sous Windows :
1. terminaison du PID ciblé avec son arbre (`taskkill /PID <pid> /T`, sans `/F`) ;
2. délai de grâce configurable (5 s par défaut) ;
3. `/F` seulement si le même enfant du même job est encore vivant ;
4. nettoyage état local ;
5. statut final `Cancelled` ou `Superseded` ;
6. job marqué traité pour éviter une reprise involontaire ; pas de retry d'erreur.

Le protocole est idempotent et anti-rejeu : plusieurs lectures de la même demande ne lancent qu'une annulation pendant l'exécution ; à la confirmation terminale, `control_request_id` est enregistré comme consommé et ne peut plus être réémis comme contrôle actif. Le rapport `Cancelled` / `Superseded` doit en outre correspondre au contrôle actif et à la session worker qui l'a exécuté.

La migration Airtable est seulement préparée dans `docs/migrations/airtable-video-remote-cancel-v1.json` ; elle n'est pas appliquée.
