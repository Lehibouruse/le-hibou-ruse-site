import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { capitalIllustration } from '../lib/book-marketing.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const store = read('components/BookStore.js');
const lombard = read('components/HoldingLombard.js');
test('D4 D5 D6 remain explicit and precede the demonstration', () => {
  for (const value of ['data-level="D4"', 'data-level="D5"', 'data-level="D6"', 'Légal, mais optimisé.', 'Agressif.', 'Borderline.']) assert.ok(store.includes(value));
  assert.ok(store.indexOf('<MethodLevels/>') < store.indexOf('<section className="store-example-section"'));
});
test('both named service offers are actually rendered on the storefront', () => {
  assert.match(store, /<ServiceOffers\s*\//);
  for (const value of ['Montages spécifiques','500 €','Montage sur mesure','Sur devis','Demander un devis']) assert.ok(store.includes(value));
  assert.match(store, /href="\/#services"/);
  const page = read('app/services/page.js');
  assert.match(page, /await searchParams/);
  assert.match(page, /initialOffer=\{selected\}/);
  const form = read('components/LeadForm.js');
  assert.match(form, /name="offer"/);
  assert.match(form, /pending\.current/);
});
test('no real book excerpt or full contents are published', () => {
  assert.doesNotMatch(store, /markdownToBookHtml|BookPreview|BookContents|EXTRAIT DU LIVRE|Lire l’extrait|Ouvrez un vrai passage|Explorer le sommaire/);
  assert.match(store, /QUELQUES MONTAGES COMPRIS DANS LE LIVRE/);
  assert.match(store, /Le site ne publie ni le sommaire complet ni le texte du livre/);
});

test('no launch waitlist, monthly-price FAQ or repeated final pitch is rendered', () => {
  assert.doesNotMatch(store, /NotifyBook|#ouverture|store-launch|store-final|store-faq-section|Le prix est-il mensuel|Soyez prévenu|Être averti|Regardez votre argent/);
  assert.match(store, /Paiement unique/);
  assert.match(store, /Dois-je lire le livre dans l’ordre/);
  assert.match(store, /Édition en accès anticipé/);
});
test('purchase CTAs use the internal consent page and never hardcode a Lemon bypass', () => {
  assert.match(store, /purchaseHref = offer\.purchaseUrl \|\| '\/achat-guide'/);
  assert.match(read('lib/book-offer.js'), /commercialReadiness/);
  const endpoint = read('app/api/commerce/digital-supply-consent/route.js');
  const readiness = read('lib/launch-readiness.mjs');
  assert.match(endpoint, /commerce_launch_authorized=false/);
  assert.match(endpoint, /RECEIPT_CONFIRMATION/);
  assert.match(readiness, /commerce_end_to_end/);
  assert.match(readiness, /consent_durable_confirmation/);
  assert.doesNotMatch(store, /checkout\/buy|ready:\s*true/);
});
test('holding illustration covers both requested amounts without treating corporate cash as personal income', () => {
  const value = capitalIllustration(500000);
  assert.equal(value.personal, 343000);
  assert.equal(value.holding, 493750);
  assert.equal(value.retainedDifference, 150750);
  assert.match(lombard, /useState\(100000\)/);
  assert.match(lombard, /\[100000, 500000\]/);
  assert.match(lombard, /possédez personnellement/);
  assert.match(lombard, /Si la banque les accepte/);
  assert.match(lombard, /ne fait pas sortir le capital de la holding/);
  assert.match(lombard, /pas d’un crédit lombard standard automatique/);
  assert.match(lombard, /prêt à rembourser/i);
});
