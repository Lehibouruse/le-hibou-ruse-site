"use client";

import { useState } from "react";

function downloadReceipt(receipt) {
  try {
    const blob = new Blob([receipt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "accuse-retractation-le-hibou-ruse.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {}
}

export default function WithdrawalForm() {
  const [state, setState] = useState("idle");
  const [confirmation, setConfirmation] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    setConfirmation(null);
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/retractation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Withdrawal request failed");
      setConfirmation(data);
      setState("sent");
      downloadReceipt(data.receipt_text || "");
      form.reset();
    } catch {
      setState("error");
    }
  }

  return (
    <form className="lead-form" onSubmit={submit} aria-busy={state === "sending"}>
      <div className="form-row">
        <label>Prénom<input name="first_name" required maxLength={120} autoComplete="given-name" /></label>
        <label>Nom<input name="last_name" required maxLength={120} autoComplete="family-name" /></label>
      </div>
      <label>Référence de commande ou du contrat<input name="contract_reference" required maxLength={180} autoComplete="off" placeholder="Référence figurant sur votre confirmation de commande" /></label>
      <label>E-mail pour l’accusé de réception<input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
      <label className="honeypot" aria-hidden="true">Société<input name="company" tabIndex={-1} autoComplete="off" /></label>
      <p className="form-privacy">Cette fonctionnalité enregistre votre déclaration et l’horodate. Elle ne décide pas automatiquement si un droit de rétractation subsiste, notamment lorsque la fourniture immédiate d’un contenu numérique a commencé dans les conditions prévues par la loi. Aucun remboursement ni retrait d’accès n’est déclenché automatiquement par ce formulaire.</p>
      <button className="button" disabled={state === "sending"} type="submit">{state === "sending" ? "Envoi…" : "Confirmer la rétractation"}</button>
      <p role="status" aria-live="polite">
        {state === "error" && "L’envoi a échoué. Réessayez dans quelques instants."}
        {state === "sent" && confirmation && `Demande reçue le ${confirmation.submitted_at}. Référence : ${confirmation.request_id}. Un accusé téléchargeable vient d’être généré.`}
      </p>
      {state === "sent" && confirmation?.receipt_text && <button type="button" className="text-link" onClick={() => downloadReceipt(confirmation.receipt_text)}>Télécharger à nouveau l’accusé</button>}
    </form>
  );
}
