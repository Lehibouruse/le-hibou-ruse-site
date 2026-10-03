"use client";

import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { currentAttribution, sendConversionEvent } from "../lib/conversion-client.mjs";

export default function DigitalSupplyConsentForm({ mode = "disabled" }) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const requestId = useRef("");
  const pending = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (!["test", "live"].includes(String(mode || "").toLowerCase()) || pending.current) return;
    pending.current = true;
    setState("sending");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!requestId.current) requestId.current = globalThis.crypto?.randomUUID?.() || "";
    try {
      const response = await fetch("/api/commerce/digital-supply-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          request_id: requestId.current,
          customer_name: data.get("customer_name"),
          customer_email: data.get("customer_email"),
          immediate_supply_consent: data.get("immediate_supply_consent") === "on",
          withdrawal_loss_ack: data.get("withdrawal_loss_ack") === "on",
          attribution: currentAttribution(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.checkout_url) throw new Error(payload?.error || "Impossible d’ouvrir le paiement.");
      try {
        const attribution = currentAttribution();
        track("checkout_created");
        sendConversionEvent("checkout_click", attribution);
      } catch {}
      window.location.assign(payload.checkout_url);
    } catch (cause) {
      setError(String(cause?.message || "Impossible d’ouvrir le paiement."));
      setState("error");
      pending.current = false;
    }
  }

  const active = ["test", "live"].includes(String(mode || "").toLowerCase());
  if (!active) return <p className="checkout-note">Le paiement est temporairement indisponible.</p>;

  return (
    <form className="lead-form" onSubmit={submit} aria-busy={state === "sending"}>
      {mode === "test" && <p className="form-privacy"><strong>Mode TEST.</strong> Aucun paiement réel ne doit être effectué.</p>}
      <div className="form-row">
        <label>Nom complet<input name="customer_name" required maxLength={120} autoComplete="name" placeholder="Prénom Nom" /></label>
        <label>E-mail<input name="customer_email" type="email" required maxLength={160} autoComplete="email" inputMode="email" placeholder="vous@exemple.fr" /></label>
      </div>
      <p className="form-privacy">Nom et e-mail seront préremplis chez Lemon Squeezy pour éviter de les retaper.</p>
      <label className="consent-line">
        <input name="immediate_supply_consent" type="checkbox" required />
        <span>Je demande l’accès immédiat au guide numérique.</span>
      </label>
      <label className="consent-line">
        <input name="withdrawal_loss_ack" type="checkbox" required />
        <span>Je reconnais la conséquence de cette demande sur mon droit de rétractation lorsque les conditions légales applicables sont remplies.</span>
      </label>
      <p className="form-privacy">Votre choix est horodaté avant le paiement. <a href="/cgv">CGV</a></p>
      <button className="button" disabled={state === "sending"} type="submit">
        {state === "sending" ? "Ouverture du paiement…" : mode === "test" ? "Continuer vers le checkout TEST" : "Continuer vers le paiement"}
      </button>
      <p role="status" aria-live="polite">{state === "error" && error}</p>
    </form>
  );
}
