import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/book-export/route.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
const UPLOAD_ARTIFACT_SHA = "ea165f8d65b6e75b540449e92b4886f43607fa02";

test("l'export final refuse les chapitres non validés", () => {
  assert.match(route, /Prêt export/);
  assert.match(route, /Validation humaine/);
  assert.match(route, /book_not_ready/);
  assert.match(route, /status: 409/);
});

test("la source du livre est privée et authentifiée par GitHub OIDC", () => {
  assert.match(route, /verifyGithubActionsToken/);
  assert.match(route, /X-Robots-Tag/);
  assert.match(route, /noindex, nofollow, noarchive/);
  assert.match(route, /Cache-Control/);
});

test("le workflow peut générer un brouillon sans déclencher un Job métier", () => {
  assert.match(workflow, /export_book:/);
  assert.match(workflow, /export_draft:/);
  assert.match(workflow, /inputs\.dry_run \|\| inputs\.export_book/);
  assert.match(workflow, /X-Hibou-Book-Draft/);
});

test("le PDF est rendu localement puis conservé comme artifact privé", () => {
  assert.match(workflow, /--print-to-pdf=/);
  assert.match(workflow, new RegExp(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`));
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v\d+/);
  assert.match(workflow, /retention-days: 30/);
  assert.doesNotMatch(workflow, /DIGIFY_SECRET/);
});
