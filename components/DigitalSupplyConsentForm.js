"use client";

import { useState } from "react";

export default function DigitalSupplyConsentForm({ mode = "disabled" }) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!["test", "live"].includes(String(mode || "").toLowerCase())) return;
    setState("sending");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/commerce/digital-supply-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          immediate_supply_consent: data.get("immediate_supply_consent") === "on",
          withdrawal_loss_ack: data.get("withdrawal_loss_ack") === "on",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.checkout_url) throw new Error(payload?.error || "Impossible d’ouvrir le checkout.");
      window.location.assign(payload.checkout_url);
    } catch (cause) {
      setError(String(cause?.message || "Impossible d’ouvrir le checkout."));
      setState("error");
    }
  }

  const active = ["test", "live"].includes(String(mode || "").toLowerCase());
  if (!active) {
    return <p className="checkout-note">Le parcours d’achat est en cours de validation. Aucun paiement n’est possible depuis cette page pour le moment.</p>;
  }

  return (
    <form className="lead-form" onSubmit={submit} aria-busy={state === "sending"}>
      {mode === "test" && <p className="form-privacy"><strong>Mode TEST.</strong> Utilisez uniquement les moyens de paiement de test Lemon Squeezy. Aucun paiement réel ne doit être effectué.</p>}
      <label className="consent-line">
        <input name="immediate_supply_consent" type="checkbox" required />
        <span>Je demande que la fourniture du guide numérique commence immédiatement, avant l’expiration du délai de rétractation.</span>
      </label>
      <label className="consent-line">
        <input name="withdrawal_loss_ack" type="checkbox" required />
        <span>Je reconnais qu’en demandant ce commencement immédiat, je perds mon droit de rétractation lorsque les conditions légales applicables à la fourniture du contenu numérique sont remplies.</span>
      </label>
      <p className="form-privacy">Les détails figurent dans les <a href="/cgv">conditions générales de vente</a>. Votre choix est horodaté et rattaché au checkout avant le paiement.</p>
      <button className="button" disabled={state === "sending"} type="submit">
        {state === "sending" ? "Ouverture du paiement…" : mode === "test" ? "Continuer vers le checkout TEST" : "Continuer vers le paiement"}
      </button>
      <p role="status" aria-live="polite">{state === "error" && error}</p>
    </form>
  );
}
