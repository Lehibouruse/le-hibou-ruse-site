import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/domain-reconcile/route.js", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("la promotion du domaine exige une preuve d’identité canonique", () => {
  assert.match(route, /https:\/\/d4d5d6\.com/);
  assert.match(route, /identity\?\.site === \"Le Hibou Rusé\"/);
  assert.match(route, /identity\?\.canonical === true/);
  assert.match(route, /domain_verified/);
  assert.match(route, /social_link_template/);
  assert.match(route, /public_site_url/);
});

test("un échec de résolution ne promeut pas le domaine", () => {
  assert.match(route, /verified: false, promoted: false/);
});

test("le reconcileur est planifié sans réactiver les previews de branches", () => {
  assert.equal(vercel.git.deploymentEnabled["*"], false);
  assert.equal(vercel.git.deploymentEnabled.main, true);
  assert.equal(vercel.crons.some((item) => item.path === "/api/domain-reconcile"), true);
});
