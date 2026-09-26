"use client";

import { useEffect, useState } from "react";

const POLL_MS = 2500;
const MAX_POLLS = 150;

export default function PurchaseAccess({ orderIdentifier = "" }) {
  const [state, setState] = useState(orderIdentifier ? { status: "processing" } : { status: "missing" });

  useEffect(() => {
    if (!orderIdentifier) return undefined;
    let cancelled = false;
    let timer = null;
    let polls = 0;

    async function poll() {
      polls += 1;
      try {
        const response = await fetch(`/api/commerce/access?order=${encodeURIComponent(orderIdentifier)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        const next = data?.status || "processing";
        setState({ ...data, status: next });
        if (["delivered", "delivered_native", "delivered_by_email", "revoked", "manual_review"].includes(next)) return;
      } catch {
        if (!cancelled) setState({ status: "processing" });
      }
      if (!cancelled && polls < MAX_POLLS) timer = window.setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderIdentifier]);

  if (state.status === "missing") {
    return <p>Votre accès sécurisé est envoyé séparément à l’adresse utilisée lors de l’achat.</p>;
  }

  if (state.status === "delivered" && state.access_url) {
    return (
      <div>
        <p>Votre accès est activé{state.edition ? ` — ${state.edition}` : ""}.</p>
        <a className="button" href={state.access_url} rel="noreferrer">Lire mon guide</a>
      </div>
    );
  }

  if (state.status === "delivered_native" && state.access_url) {
    return (
      <div>
        <p>Votre guide est disponible dans votre reçu Lemon Squeezy et dans « My Orders »{state.edition ? ` — ${state.edition}` : ""}.</p>
        <a className="button" href={state.access_url} rel="noreferrer">Accéder à mon guide</a>
      </div>
    );
  }

  if (state.status === "delivered_by_email") {
    return <p>Votre accès est activé et vous a été envoyé à l’adresse utilisée lors de l’achat.</p>;
  }

  if (state.status === "revoked") {
    return <p>Cet accès n’est plus actif. Si vous pensez qu’il s’agit d’une erreur, utilisez votre reçu de commande pour contacter le support.</p>;
  }

  if (state.status === "manual_review") {
    return <p>Votre paiement est enregistré mais l’activation nécessite une vérification. Ne rachetez pas le guide : conservez votre reçu de commande.</p>;
  }

  return <p>Votre paiement est confirmé. Votre accès sécurisé est en cours d’activation ; cette page se met à jour automatiquement.</p>;
}
