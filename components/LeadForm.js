"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";

export default function LeadForm() {
  const [state, setState] = useState("idle");
  async function submit(event) {
    event.preventDefault();
    setState("sending");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!response.ok) throw new Error("Lead submission failed");
      form.reset();
      setState("sent");
      track("montage_form_submitted");
    } catch {
      setState("error");
    }
  }
  return (
    <form className="lead-form" onSubmit={submit} aria-busy={state === "sending"}>
      <div className="form-row">
        <label>Nom ou prénom <span className="optional">(facultatif)</span><input name="contact" maxLength={120} autoComplete="name" /></label>
        <label>E-mail<input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
      </div>
      <label>Thèmes et contexte<textarea name="context" required maxLength={3500} rows={6} placeholder="Entreprise, immobilier, rémunération, fiscalité, patrimoine, crédit… Indiquez les sujets et contraintes que vous souhaitez explorer." /></label>
      <label>Ce que vous souhaitez comprendre<textarea name="need" required maxLength={2500} rows={5} placeholder="Les mécanismes, questions ou scénarios que vous souhaitez voir expliqués ou approfondis." /></label>
      <label className="honeypot" aria-hidden="true"><input name="company" tabIndex={-1} autoComplete="off" /></label>
      <div className="form-footer">
        <button className="button" disabled={state === "sending"} type="submit">{state === "sending" ? "Envoi…" : "Envoyer"}</button>
        <p role="status" aria-live="polite">{state === "sent" && "Demande reçue. Le Hibou va l’étudier."}{state === "error" && "L’envoi a échoué. Réessayez dans quelques instants."}</p>
      </div>
    </form>
  );
}
