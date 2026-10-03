import assert from "node:assert/strict";
import test from "node:test";
import { sameOriginFormRequest } from "../lib/request-origin.mjs";

function request(headers = {}) {
  return new Request("https://d4d5d6.com/apercu-lecteur", { headers });
}

test("le formulaire accepte les signaux natifs de navigation interne", () => {
  assert.equal(sameOriginFormRequest(request({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(sameOriginFormRequest(request({ "sec-fetch-site": "same-site" })), true);
  assert.equal(sameOriginFormRequest(request({ "sec-fetch-site": "none" })), true);
});

test("le formulaire accepte un referer propriétaire malgré un origin réécrit par un navigateur intégré", () => {
  assert.equal(sameOriginFormRequest(request({
    origin: "http://127.0.0.1:49152",
    referer: "https://d4d5d6.com/apercu-lecteur",
  })), true);
});

test("le formulaire refuse une soumission réellement intersite", () => {
  assert.equal(sameOriginFormRequest(request({
    origin: "https://example.test",
    referer: "https://example.test/formulaire",
    "sec-fetch-site": "cross-site",
  })), false);
});

test("un client serveur sans métadonnées de navigateur reste compatible", () => {
  assert.equal(sameOriginFormRequest(request()), true);
});
