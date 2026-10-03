'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { track } from '@vercel/analytics';
import TrackedLink from './TrackedLink';
import { currentAttribution } from '../lib/conversion-client.mjs';
import { BOOK_LANDING_VERSION, capitalIllustration } from '../lib/book-marketing.mjs';

function signal(name, properties = {}) {
  try { track(name, { version: BOOK_LANDING_VERSION, ...properties }); } catch {}
}

export function BookAction({ href, children, placement, purchase = false, secondary = false, className = '' }) {
  return <TrackedLink href={href} event={purchase ? 'purchase_consent_opened' : 'book_discovery_click'} className={`${secondary ? 'store-link' : 'store-button'} ${className}`} onClick={() => signal('book_cta_click', { placement, destination: href.split('?')[0] })}>{children}<span aria-hidden="true">{secondary ? '↗' : '→'}</span></TrackedLink>;
}

export function OfficialHibou({ pose = 'revele', priority = false, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image className={className} src={`/api/brand-image/${pose}`} alt="Le Hibou Rusé officiel, en costume et nœud papillon, avec son monocle" width={512} height={768} sizes="(max-width: 640px) 200px, 320px" priority={priority} onError={() => setFailed(true)} />;
}

export function NotifyBook() {
  const id = useId();
  const [state, setState] = useState('idle');
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setState('sending');
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'book_launch', consent: true, email: data.email, company: data.company, attribution: currentAttribution() }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Submission failed');
      form.reset(); setState('sent'); signal('book_waitlist_submitted');
    } catch { setState('error'); }
    finally { pending.current = false; }
  }
  return <form className="store-notify" onSubmit={submit} aria-busy={state === 'sending'}>
    <label htmlFor={`${id}-email`}>Votre e-mail</label>
    <div className="store-notify-row"><input id={`${id}-email`} name="email" type="email" required maxLength={160} autoComplete="email" inputMode="email" placeholder="vous@exemple.fr" aria-describedby={`${id}-privacy`} /><button className="store-button" type="submit" disabled={state === 'sending' || state === 'sent'}>{state === 'sending' ? 'Inscription…' : state === 'sent' ? 'Vous êtes sur la liste ✓' : 'Me prévenir de l’ouverture'}<span aria-hidden="true">→</span></button></div>
    <label className="store-honeypot" aria-hidden="true">Ne pas remplir<input name="company" tabIndex={-1} autoComplete="off" /></label>
    <p id={`${id}-privacy`} className="store-small">En vous inscrivant, vous demandez uniquement un e-mail à l’ouverture du livre. Aucun paiement, aucun abonnement. <a href="/confidentialite">Confidentialité</a>.</p>
    <p role="status" aria-live="polite" className="store-form-status">{state === 'sent' && 'C’est enregistré. Vous pourrez découvrir le livre dès son ouverture.'}{state === 'error' && 'L’inscription n’a pas abouti. Réessayez ou écrivez à lehibouruse@gmail.com.'}</p>
  </form>;
}

export function CapitalComparison() {
  const [mode, setMode] = useState('personal');
  const id = useId();
  const values = capitalIllustration();
  const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' €';
  const holding = mode === 'holding';
  return <div className="store-comparison">
    <p className="store-overline">MÊME POINT DE DÉPART : 100 000 € DE DIVIDENDES DISTRIBUABLES</p>
    <div className="store-toggle" role="group" aria-label="Comparer les circuits de distribution">
      <button type="button" aria-pressed={!holding} aria-controls={`${id}-result`} onClick={() => { setMode('personal'); signal('book_comparison_used', { mode: 'personal' }); }}>Je perçois personnellement</button>
      <button type="button" aria-pressed={holding} aria-controls={`${id}-result`} onClick={() => { setMode('holding'); signal('book_comparison_used', { mode: 'holding' }); }}>Je capitalise dans une holding</button>
    </div>
    <div className={`store-comparison-result ${holding ? 'is-holding' : ''}`} id={`${id}-result`} aria-live="polite">
      <div className="store-flow"><span>Société opérationnelle</span><span aria-hidden="true">↓</span><strong>{holding ? 'Holding éligible au régime mère-fille' : 'Associé personne physique'}</strong></div>
      <div><p className="store-result-number">{money(holding ? values.holding : values.personal)}</p><p className="store-result-label">{holding ? 'conservés dans la holding, avant toute sortie personnelle' : 'reçus personnellement après PFU, dans cet exemple'}</p></div>
    </div>
    <p className="store-comparison-takeaway">{holding ? 'La découverte : une capacité de réinvestissement plus élevée dans la société, pas une exonération personnelle.' : 'Le réflexe : distribuer à la personne. Mais ce n’est pas le seul circuit à étudier lorsqu’on souhaite réinvestir.'}</p>
    <p className="store-small">Deux destinations différentes de l’argent. Une holding ne rend pas l’argent personnellement disponible. Illustration pédagogique française, pas un conseil de montage.</p>
    <details className="store-detail"><summary>Voir le calcul, les hypothèses et les sources</summary><div>
      <p>Base identique : 100 000 € de dividendes après l’IS déjà supporté par la société opérationnelle. Distribution personnelle : PFU de 31,4 %, soit 31 400 € et un net de 68 600 €, sans option au barème, surtaxe personnelle ou autre particularité.</p>
      <p>Holding : dividendes éligibles, quote-part de frais et charges de 5 % imposée à l’IS de 25 %, soit 1 250 €. Restent 98 750 € dans la société. L’écart de 30 150 € n’est ni un revenu personnel ni une économie fiscale définitive. Hors frais de structure et autres correctifs. Une distribution personnelle immédiate des 98 750 €, avec le même PFU, donnerait 67 742,50 €.</p>
      <p>Le régime mère-fille suppose notamment une participation éligible et le respect de ses conditions de détention. Illustration vérifiée le 3 octobre 2026 : <a href="https://entreprendre.service-public.gouv.fr/vosdroits/F32963" target="_blank" rel="noopener noreferrer">fiscalité des dividendes</a>, <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048831340/" target="_blank" rel="noopener noreferrer">CGI, article 216</a>. Le montage complet ci-dessous détaille ces limites.</p>
    </div></details>
  </div>;
}

const FILTERS = [['all', 'Tout explorer'], ['entreprise', 'Mon entreprise'], ['remuneration', 'Ma rémunération'], ['patrimoine', 'Mon patrimoine']];
export function BookContents({ sections }) {
  const [filter, setFilter] = useState('all');
  const visible = sections.filter((section) => filter === 'all' || section.category === filter);
  return <div className="store-contents">
    <div className="store-filters" role="group" aria-label="Filtrer le sommaire par centre d’intérêt">{FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); signal('book_interest_selected', { interest: key }); }}>{label}</button>)}</div>
    <div className="store-contents-list" aria-live="polite">{visible.length ? visible.map((section) => <details className="store-chapter" key={section.title}><summary><span className="store-chapter-number">{section.number ? String(section.number).padStart(2, '0') : '•'}</span><span>{section.title}</span><span className="store-chapter-plus" aria-hidden="true">+</span></summary><div>{section.entries.length ? <ul>{section.entries.map((entry) => <li key={`${entry.number}-${entry.title}`}>{entry.title}</li>)}</ul> : <p>Texte d’ouverture ou de synthèse de l’édition.</p>}</div></details>) : <p>Le contenu de cette rubrique n’est pas disponible pour le moment.</p>}</div>
  </div>;
}

export function BookPreview({ samples }) {
  const [selected, setSelected] = useState(0);
  if (!samples.length) return <p>Les extraits seront affichés dès que leur source sera disponible.</p>;
  const sample = samples[selected] || samples[0];
  return <div className="store-preview"><div className="store-preview-tabs" role="group" aria-label="Choisir un extrait">{samples.map((item, index) => <button type="button" key={item.number} aria-pressed={selected === index} onClick={() => { setSelected(index); signal('book_preview_opened', { sample: String(item.number) }); }}>{item.kicker.toLowerCase()}</button>)}</div><article className="store-preview-page" aria-live="polite"><div className="store-preview-heading"><span>LE HIBOU RUSÉ</span><span>EXTRAIT RÉEL</span></div><h3>{sample.title}</h3>{sample.excerpt.split('\n\n').map((p, index) => <p key={index}>{p}</p>)}<div className="store-preview-bottom"><span>La suite dans le guide</span><span aria-hidden="true">↗</span></div></article><p className="store-small">Texte de l’édition actuelle. Présentation adaptée à cette page, pas une photographie d’un livre imprimé.</p></div>;
}

export function BookSignals() {
  useEffect(() => {
    signal('book_landing_view', { page: window.location.pathname });
    const targets = ['extrait', 'contenu', 'offre', 'ouverture'];
    const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { signal('book_section_viewed', { section: entry.target.id }); observer.unobserve(entry.target); } }); }, { threshold: 0.15 });
    targets.forEach((id) => { const node = document.getElementById(id); if (node) observer.observe(node); });
    return () => observer.disconnect();
  }, []);
  return null;
}
