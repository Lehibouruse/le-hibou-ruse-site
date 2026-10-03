"use client";
import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { currentAttribution } from "../lib/conversion-client.mjs";

const OFFERS = { selection: 'Montages spécifiques — 500 €', 'sur-mesure': 'Montage sur mesure — sur devis' };
export default function LeadForm({ initialOffer = '' } = {}) {
  const [state, setState] = useState('idle');
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setState('sending');
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const offerLabel = OFFERS[data.offer] || 'Demande de montage';
    try {
      const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: data.contact, email: data.email, company: data.company, context: data.context, need: `${offerLabel}\n\n${data.need}`, attribution: currentAttribution() }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Lead submission failed');
      form.reset();
      setState('sent');
      try { track('montage_form_submitted', { offer: Object.hasOwn(OFFERS, data.offer) ? data.offer : 'unspecified' }); } catch {}
    } catch { setState('error'); }
    finally { pending.current = false; }
  }
  return <form className="lead-form" onSubmit={submit} aria-busy={state === 'sending'}><label>Votre demande<select name="offer" defaultValue={Object.hasOwn(OFFERS, initialOffer) ? initialOffer : ''} required><option value="" disabled>Choisir une offre</option><option value="selection">Montages spécifiques · 500 €</option><option value="sur-mesure">Montage sur mesure · sur devis</option></select></label><div className="form-row"><label>Nom ou prénom <span className="optional">(facultatif)</span><input name="contact" maxLength={120} autoComplete="name" /></label><label>E-mail<input name="email" type="email" required maxLength={160} autoComplete="email" /></label></div><label>Votre situation<textarea name="context" required maxLength={3500} rows={4} placeholder="Entreprise, patrimoine, rémunération, crédit… Qu’est-ce qui vous amène ?" /></label><label>Votre objectif<textarea name="need" required maxLength={2300} rows={3} placeholder="La question à résoudre ou la combinaison que vous souhaitez faire étudier." /></label><label className="honeypot" aria-hidden="true"><input name="company" tabIndex={-1} autoComplete="off" /></label><p className="form-privacy">Votre message et vos coordonnées servent à traiter cette demande. <a href="/confidentialite">Confidentialité</a>.</p><div className="form-footer"><button className="button" disabled={state === 'sending'} type="submit">{state === 'sending' ? 'Envoi…' : 'Envoyer ma demande'}</button><p role="status" aria-live="polite">{state === 'sent' && 'Demande reçue. Le Hibou va l’étudier.'}{state === 'error' && 'L’envoi n’a pas abouti. Réessayez.'}</p></div></form>;
}
