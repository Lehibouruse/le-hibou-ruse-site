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
  browser('wait', '--fn', "document.querySelector('.store-hero') !== null");
  assertPage("document.body.innerText.length > 500 && !document.querySelector('[data-nextjs-dialog]')", 'home has real content and no error overlay');
  assertPage("document.querySelector('.store-actions a').getAttribute('href') === '/guide'", 'home primary action leads to guide');
  assertPage("!document.querySelector('.store-hero .lead-form')", 'services do not compete in hero');
  browser('screenshot', `${directory}/home-desktop.png`, '--full');
  writeFileSync(`${directory}/home-snapshot.txt`, browser('snapshot', '-i'));
  browser('open', `${base}/guide`);
  browser('wait', '--fn', "document.querySelector('.store-comparison') !== null");
  assertPage("document.querySelector('.store-result-number').textContent.replace(/\\D/g,'') === '68600'", 'personal comparison starts correctly');
  browser('eval', "document.querySelector('.store-toggle button:last-child').click()");
  browser('wait', '--fn', "document.querySelector('.store-result-number').textContent.replace(/\\D/g,'') === '98750'");
  assertPage("document.querySelector('.store-result-label').textContent.includes('avant toute sortie personnelle')", 'company cash label stays explicit');
  browser('screenshot', `${directory}/guide-desktop.png`, '--full');
  browser('set', 'viewport', '390', '844');
  browser('open', `${base}/guide`);
  browser('wait', '--fn', "document.querySelector('.store-hero') !== null");
  assertPage("document.documentElement.scrollWidth <= window.innerWidth + 1", 'mobile has no horizontal overflow');
  assertPage("getComputedStyle(document.querySelector('.store-book-object')).display !== 'none'", 'book remains visible on mobile');
  assertPage("getComputedStyle(document.querySelector('.store-mobile-bar')).display !== 'none'", 'mobile action stays visible');
  browser('screenshot', `${directory}/guide-mobile.png`, '--full');
  browser('set', 'viewport', '320', '740');
  assertPage("document.documentElement.scrollWidth <= window.innerWidth + 1", 'small mobile has no horizontal overflow');
  browser('open', `${base}/services`);
  browser('wait', '--fn', "document.querySelector('.lead-form') !== null");
  assertPage("document.querySelector('input[type=email]') !== null", 'separate services form remains available');
  writeFileSync(`${directory}/browser-errors.txt`, browser('errors'));
  writeFileSync(`${directory}/result.json`, JSON.stringify({ ok: true, base, tested: ['home desktop', 'guide desktop', 'comparison interaction', 'guide 390px', 'guide 320px', 'services'], note: 'No purchase or form submission. Local run without production credentials has no live manuscript or mascot.' }, null, 2));
  console.log('BOOK_STOREFRONT_BROWSER_QC_PASS');
} finally { try { browser('close'); } catch {} }
