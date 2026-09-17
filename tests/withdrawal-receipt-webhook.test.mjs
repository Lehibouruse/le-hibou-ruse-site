import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { sendWithdrawalReceipt, withdrawalReceiptWebhookConfig } from "../lib/withdrawal-receipt.mjs";

const sample = {
  request_id: "req-123",
  submitted_at: "2026-09-17T13:00:00.000Z",
  first_name: "Marc",
  last_name: "Test",
  email: "buyer@example.com",
  contract_reference: "ORDER-1",
  receipt_text: "receipt body",
};

test("l'accusé externe reste désactivé tant que URL et secret ne sont pas tous les deux configurés", async () => {
  let called = false;
  const result = await sendWithdrawalReceipt(sample, {
    env: { WITHDRAWAL_RECEIPT_WEBHOOK_URL: "https://example.com/hook" },
    fetchImpl: async () => { called = true; return { ok: true, status: 200 }; },
  });
  assert.equal(result.configured, false);
  assert.equal(result.code, "not_configured");
  assert.equal(called, false);
});

test("la configuration refuse HTTP, localhost et des credentials dans l'URL", () => {
  assert.equal(withdrawalReceiptWebhookConfig({ WITHDRAWAL_RECEIPT_WEBHOOK_URL: "http://example.com", WITHDRAWAL_RECEIPT_WEBHOOK_SECRET: "x" }).configured, false);
  assert.equal(withdrawalReceiptWebhookConfig({ WITHDRAWAL_RECEIPT_WEBHOOK_URL: "https://localhost/hook", WITHDRAWAL_RECEIPT_WEBHOOK_SECRET: "x" }).configured, false);
  assert.equal(withdrawalReceiptWebhookConfig({ WITHDRAWAL_RECEIPT_WEBHOOK_URL: "https://user:pass@example.com/hook", WITHDRAWAL_RECEIPT_WEBHOOK_SECRET: "x" }).configured, false);
});

test("le webhook transactionnel reçoit uniquement le payload attendu avec un Bearer secret", async () => {
  let request;
  const result = await sendWithdrawalReceipt(sample, {
    env: {
      WITHDRAWAL_RECEIPT_WEBHOOK_URL: "https://hooks.example.com/withdrawal",
      WITHDRAWAL_RECEIPT_WEBHOOK_SECRET: "top-secret",
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204 };
    },
  });
  assert.deepEqual(result, { ok: true, configured: true, code: "sent" });
  assert.equal(request.url, "https://hooks.example.com/withdrawal");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer top-secret");
  assert.equal(request.options.headers["X-Hibou-Event"], "withdrawal.receipt");
  const body = JSON.parse(request.options.body);
  assert.equal(body.event, "withdrawal.receipt");
  assert.equal(body.version, 1);
  assert.equal(body.email, sample.email);
  assert.equal(body.receipt_text, sample.receipt_text);
  assert.equal(body.subject.includes("rétractation"), true);
  assert.equal(JSON.stringify(result).includes("top-secret"), false);
});

test("un non-2xx est fail-closed et ne renvoie jamais le corps du fournisseur", async () => {
  const result = await sendWithdrawalReceipt(sample, {
    env: {
      WITHDRAWAL_RECEIPT_WEBHOOK_URL: "https://hooks.example.com/withdrawal",
      WITHDRAWAL_RECEIPT_WEBHOOK_SECRET: "top-secret",
    },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.deepEqual(result, { ok: false, configured: true, code: "http_503" });
});

test("la route ne marque l'accusé comme envoyé qu'après confirmation du webhook", () => {
  const route = fs.readFileSync(new URL("../app/api/retractation/route.js", import.meta.url), "utf8");
  assert.match(route, /if \(delivery\.ok\)/);
  assert.match(route, /Statut: "Accusé envoyé"/);
  assert.match(route, /"Accusé envoyé le": sentAt/);
  assert.match(route, /"Canal accusé": "E-mail"/);
  assert.match(route, /Statut: "À vérifier"/);
  assert.doesNotMatch(route, /remboursement.*automatique\s*:\s*true/i);
});
