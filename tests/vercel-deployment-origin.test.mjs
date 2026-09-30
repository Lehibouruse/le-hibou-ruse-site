import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { vercelDeploymentOrigin } from "../lib/vercel-deployment-origin.mjs";

test("seul le domaine Vercel exact du déploiement Hibou peut poster depuis la preview", () => {
  assert.equal(vercelDeploymentOrigin({ VERCEL_URL: "le-hibou-ruse-site-abc-le-hibou-ruse.vercel.app" }), "https://le-hibou-ruse-site-abc-le-hibou-ruse.vercel.app");
  for (const host of ["evil.vercel.app", "le-hibou-ruse-site-abc.vercel.app.evil.com", "le-hibou-ruse-site-abc.vercel.app/path", "localhost:3000"]) {
    assert.equal(vercelDeploymentOrigin({ VERCEL_URL: host }), "");
  }
  for (const path of ["../app/api/conversion-event/route.js", "../app/api/leads/route.js", "../app/api/commerce/digital-supply-consent/route.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /ALLOWED_ORIGINS\.add\(vercelDeploymentOrigin\(\)\)/);
  }
});
