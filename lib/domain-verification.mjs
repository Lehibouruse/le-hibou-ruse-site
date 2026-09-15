export function assessDomainIdentity({ status = 0, ok = false, marker = "", data = {} } = {}) {
  const receivedHost = String(data?.received_host || "").toLowerCase();
  const identityPresent = Boolean(marker || data?.site || data?.received_host || data?.canonical !== undefined);
  const verified = Boolean(
    ok
    && marker === "le-hibou-ruse"
    && data?.site === "Le Hibou Rusé"
    && data?.canonical === true
    && ["d4d5d6.com", "www.d4d5d6.com"].includes(receivedHost)
  );
  if (verified) return { state: "verified", verified: true, reason: "identity_match" };

  // 404/5xx and empty responses are commonly caused by a deployment/DNS transition.
  // They must never revoke an already verified domain on their own.
  if (!identityPresent || status === 404 || status === 408 || status === 425 || status === 429 || status >= 500) {
    return { state: "pending", verified: false, reason: `transient_or_undeployed:${status || "unknown"}` };
  }

  // A successful response carrying an explicit Hibou identity that does not match the
  // canonical host is conclusive enough to invalidate a stale verification flag.
  return {
    state: "mismatch",
    verified: false,
    reason: `identity_mismatch:${status || "unknown"}:${receivedHost || "no_host"}`,
  };
}

export function domainConfigPatch(state, reason, today = new Date().toISOString().slice(0, 10)) {
  if (state === "verified") {
    return { Valeur: "true", Statut: "Actif", Erreur: "", "Dernière modification": today };
  }
  if (state === "mismatch") {
    return { Valeur: "false", Statut: "En attente", Erreur: String(reason || "Identité domaine incorrecte").slice(0, 2000), "Dernière modification": today };
  }
  return null;
}
