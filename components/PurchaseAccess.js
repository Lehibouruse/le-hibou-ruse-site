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
        if (["reader_ready", "delivered", "delivered_by_email", "revoked", "manual_review"].includes(next)) return;
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

  if (state.status === "reader_ready" && state.reader_url) {
    return (
      <div>
        <p>Votre accès personnel au guide est activé{state.edition ? ` — ${state.edition}` : ""}.</p>
        <a className="button" href={state.reader_url} rel="noreferrer">Lire mon guide</a>
        <p className="form-privacy">Lecture en ligne uniquement : téléchargement, impression et copie sont désactivés.</p>
      </div>
    );
  }

  if (state.status === "delivered" && state.access_url) {
    return (
      <div>
        <p>Votre accès est activé{state.edition ? ` — ${state.edition}` : ""}.</p>
        <a className="button" href={state.access_url} rel="noreferrer">Lire mon guide</a>
      </div>
    );
  }

  if (state.status === "delivered_by_email") {
    return <p>Votre accès est activé. Digify vous l’a envoyé à l’adresse utilisée lors de l’achat.</p>;
  }

  if (state.status === "revoked") {
    return <p>Cet accès n’est plus actif. Si vous pensez qu’il s’agit d’une erreur, utilisez votre reçu de commande pour contacter le support.</p>;
  }

  if (state.status === "manual_review") {
    return <p>Votre paiement est enregistré mais l’activation nécessite une vérification. Ne rachetez pas le guide : conservez votre reçu de commande.</p>;
  }

  return <p>Votre paiement est confirmé. Votre accès sécurisé est en cours d’activation ; cette page se met à jour automatiquement.</p>;
}
