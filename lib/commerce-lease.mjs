export const COMMERCE_LEASE_MS = 5 * 60 * 1000;

export function commerceEligibleFormula(kind = "delivery") {
  if (kind === "revocation") {
    return "AND({Statut}='refunded',OR({Livraison statut}='revocation_pending',AND({Livraison statut}='revoking',OR({Commerce lease expires}=BLANK(),IS_BEFORE({Commerce lease expires},NOW())))))";
  }
  return "AND({Statut}='paid',OR({Livraison statut}='pending',AND({Livraison statut}='processing',OR({Commerce lease expires}=BLANK(),IS_BEFORE({Commerce lease expires},NOW())))))";
}

export function commerceClaimPatch({ token, status, attempts, now = new Date() }) {
  if (!token) throw new Error("Commerce lease token requis");
  if (!status) throw new Error("Commerce lease status requis");
  return {
    "Livraison statut": status,
    ...(Number.isFinite(Number(attempts)) ? { [status === "revoking" ? "Révocation tentatives" : "Livraison tentatives"]: Number(attempts) } : {}),
    "Livraison erreur": "",
    "Commerce lock token": String(token),
    "Commerce lease expires": new Date(now.getTime() + COMMERCE_LEASE_MS).toISOString(),
  };
}

export function clearCommerceLease(fields = {}) {
  return {
    ...fields,
    "Commerce lock token": "",
    "Commerce lease expires": null,
  };
}

export function ownsCommerceLease(record, token, expectedStatus) {
  const fields = record?.fields || record || {};
  return String(fields["Commerce lock token"] || "") === String(token || "")
    && (!expectedStatus || String(fields["Livraison statut"] || "") === expectedStatus);
}
