#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const executable = resolve('node_modules/.bin/agent-browser');
const base = process.env.BOOK_TEST_URL || 'http://127.0.0.1:3000';
const directory = 'artifacts/book-store';
mkdirSync(directory, { recursive: true });
function browser(...args) { return execFileSync(executable, ['--session', 'book-conversion-check', ...args], { encoding: 'utf8', timeout: 90000 }); }
function assertPage(expression, label) { browser('eval', `(() => { if (!(${expression})) throw new Error(${JSON.stringify(label)}); return 'PASS: ${label}'; })()`); console.log(`PASS: ${label}`); }
try {
  browser('set', 'viewport', '1440', '1000');
  browser('open', base);
  browser('wait', '--fn', "document.querySelector('.store-assertive') !== null");
  assertPage("document.body.innerText.length > 500 && !document.querySelector('[data-nextjs-dialog]')", 'homepage renders without an error overlay');
  assertPage("document.querySelector('.store-actions a').getAttribute('href') === '/achat-guide'", 'primary action enters the purchase flow, not a waitlist');
  assertPage("document.querySelectorAll('#methode [data-level]').length === 3 && document.querySelector('#methode').getBoundingClientRect().top < document.querySelector('#extrait').getBoundingClientRect().top", 'D4 D5 D6 are above the example');
  assertPage("document.querySelectorAll('#services .store-service-offer').length === 2 && document.querySelector('#services').innerText.includes('500 €') && document.querySelector('#services').innerText.includes('Sur devis')", 'both service offers are on the homepage');
  assertPage("!document.querySelector('#ouverture,.store-launch,.store-final') && !document.body.innerText.includes('Le prix est-il mensuel')", 'removed sections stay removed');
  browser('screenshot', `${directory}/home-desktop.png`, '--full');
  writeFileSync(`${directory}/home-snapshot.txt`, browser('snapshot', '-i'));
  browser('open', `${base}/guide`);
  browser('wait', '--fn', "document.querySelector('.store-comparison') !== null");
  assertPage("document.querySelector('.store-result-number').textContent.replace(/\\D/g,'') === '68600'", 'personal result at 100000');
  browser('eval', "document.querySelector('.store-toggle button:last-child').click()");
  browser('wait', '--fn', "document.querySelector('.store-result-number').textContent.replace(/\\D/g,'') === '98750'");
  assertPage("document.querySelector('.store-result-label').textContent.includes('avant toute sortie personnelle')", 'holding cash is identified as corporate cash');
  assertPage("document.querySelector('.store-lombard-path').innerText.includes('possédez personnellement')", 'personal pledge and borrowing are visible');
  browser('eval', "document.querySelector('.store-amount-switch button:last-child').click()");
  browser('wait', '--fn', "document.querySelector('.store-result-number').textContent.replace(/\\D/g,'') === '493750'");
  browser('screenshot', `${directory}/guide-desktop.png`, '--full');
  browser('set', 'viewport', '390', '844');
  browser('open', `${base}/guide`);
  browser('wait', '--fn', "document.querySelector('.store-assertive') !== null");
  assertPage("document.documentElement.scrollWidth <= window.innerWidth + 1", '390px viewport has no horizontal overflow');
  assertPage("getComputedStyle(document.querySelector('.store-book-object')).display !== 'none'", 'book visible on mobile');
  assertPage("getComputedStyle(document.querySelector('.store-mobile-bar')).display !== 'none' && document.querySelector('.store-mobile-bar a').getAttribute('href') === '/achat-guide'", 'mobile purchase action is visible');
  browser('screenshot', `${directory}/guide-mobile.png`, '--full');
  browser('set', 'viewport', '320', '740');
  assertPage("document.documentElement.scrollWidth <= window.innerWidth + 1", '320px viewport has no horizontal overflow');
  browser('open', `${base}/services?offre=sur-mesure#demande`);
  browser('wait', '--fn', "document.querySelector('.lead-form') !== null");
  assertPage("document.querySelector('select[name=offer]').value === 'sur-mesure' && document.querySelector('input[type=email]') !== null", 'bespoke quote arrives at the correctly selected form');
  browser('open', `${base}/services?offre=selection#demande`);
  browser('wait', '--fn', "document.querySelector('select[name=offer]')?.value === 'selection'");
  browser('screenshot', `${directory}/services-mobile.png`, '--full');
  const errors = browser('errors');
  writeFileSync(`${directory}/browser-errors.txt`, errors);
  writeFileSync(`${directory}/result.json`, JSON.stringify({ ok: true, base, version: '2026-10-03-marc', tested: ['homepage desktop', 'D4 D5 D6 order', 'restored services', 'no launch waitlist', 'holding 100000 and 500000', 'mobile 390 and 320', 'service form offer routing'], note: 'No purchase or form submission. Browser success is not proof that payment and delivery completed.' }, null, 2));
  console.log('BOOK_STOREFRONT_BROWSER_QC_PASS');
} finally { try { browser('close'); } catch {} }
