"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";

export default function LeadForm() {
  const [state, setState] = useState("idle");
  async function submit(event) {
    event.preventDefault();
    setState("sending");
    const form = event.currentTarget;
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (response.ok) {
      form.reset();
      setState("sent");
      track("montage_form_submitted");
    } else setState("error");
  }
  return (
    <form className="lead-form" onSubmit={submit}>
      <div className="form-row">
        <label>Nom ou prénom<input name="contact" required maxLength={120} autoComplete="name" /></label>
        <label>E-mail<input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
      </div>
      <label>Votre situation<textarea name="context" required maxLength={2500} rows={4} placeholder="Les éléments utiles pour comprendre votre contexte" /></label>
      <div className="form-row">
        <label>Votre besoin<textarea name="need" required maxLength={1500} rows={3} /></label>
        <label>Votre objectif<textarea name="goal" required maxLength={1500} rows={3} /></label>
      </div>
      <label className="honeypot" aria-hidden="true">Société<input name="company" tabIndex={-1} autoComplete="off" /></label>
      <div className="form-footer">
        <button className="button" disabled={state === "sending"} type="submit">{state === "sending" ? "Envoi…" : "Décrire mon projet"}</button>
        <p aria-live="polite">{state === "sent" && "Demande reçue. Le Hibou revient vers vous rapidement."}{state === "error" && "L’envoi a échoué. Réessayez dans quelques instants."}</p>
      </div>
    </form>
  );
}
