import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeOauthLaunchTicketConfig,
  hashOauthLaunchTicket,
  parseOauthLaunchTicketConfig,
  validateOauthLaunchTicket,
} from "../lib/social-oauth-launch-ticket.mjs";

const ticket = "opaque-launch-ticket";
const expires = "2026-09-19T17:00:00.000Z";
const raw = JSON.stringify({ hash: hashOauthLaunchTicket(ticket), expires_at: expires, used: false });

test("un ticket OAuth valide passe une seule fois", () => {
  const result = validateOauthLaunchTicket(ticket, raw, new Date("2026-09-19T16:00:00.000Z"));
  assert.equal(result.ok, true);
  const consumed = consumeOauthLaunchTicketConfig(raw, new Date("2026-09-19T16:01:00.000Z"));
  assert.equal(parseOauthLaunchTicketConfig(consumed).used, true);
  assert.equal(validateOauthLaunchTicket(ticket, consumed, new Date("2026-09-19T16:02:00.000Z")).reason, "used");
});

test("un mauvais ticket ou un ticket expiré est refusé", () => {
  assert.equal(validateOauthLaunchTicket("wrong", raw, new Date("2026-09-19T16:00:00.000Z")).reason, "invalid");
  assert.equal(validateOauthLaunchTicket(ticket, raw, new Date("2026-09-19T18:00:00.000Z")).reason, "expired");
});
