import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLinkedInOrganizationMetrics,
  linkedInOrganizationStatisticsUrl,
  normalizeLinkedInOrganizationMetrics,
} from "../lib/social-linkedin-org-metrics.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const env = {
  LINKEDIN_ACCESS_TOKEN: "secret-token",
  LINKEDIN_VERSION: "202608",
  LINKEDIN_ORGANIZATION_URN: "urn:li:organization:146337938",
};

test("construit le finder LinkedIn pour un share URN", () => {
  const url = linkedInOrganizationStatisticsUrl("urn:li:share:123", env.LINKEDIN_ORGANIZATION_URN);
  assert.match(url, /organizationalEntity=urn%3Ali%3Aorganization%3A146337938/);
  assert.match(url, /shares=List\(urn%3Ali%3Ashare%3A123\)/);
});

test("construit le finder LinkedIn pour un UGC Post URN", () => {
  const url = linkedInOrganizationStatisticsUrl("urn:li:ugcPost:456", env.LINKEDIN_ORGANIZATION_URN);
  assert.match(url, /ugcPosts\[0\]=urn%3Ali%3AugcPost%3A456/);
});

test("normalise les statistiques organiques d'une publication organisation", () => {
  const metrics = normalizeLinkedInOrganizationMetrics("urn:li:share:123", {
    elements: [{
      totalShareStatistics: {
        impressionCount: 5287,
        uniqueImpressionsCount: 4200,
        clickCount: 78,
        likeCount: 14,
        commentCount: 24,
        shareCount: 5,
        engagement: 0.0228,
      },
    }],
  });
  assert.equal(metrics.views, 5287);
  assert.equal(metrics.unique_impressions, 4200);
  assert.equal(metrics.clicks, 78);
  assert.equal(metrics.likes, 14);
  assert.equal(metrics.comments, 24);
  assert.equal(metrics.shares, 5);
  assert.equal(metrics.engagement, 0.0228);
  assert.equal(metrics.analytics_scope, "organization");
});

test("une publication absente du résultat vaut zéro sans inventer de données", () => {
  const metrics = normalizeLinkedInOrganizationMetrics("urn:li:ugcPost:999", { elements: [] });
  assert.equal(metrics.views, 0);
  assert.equal(metrics.likes, 0);
  assert.equal(metrics.comments, 0);
  assert.equal(metrics.shares, 0);
  assert.equal(metrics.clicks, 0);
});

test("appelle organizationalEntityShareStatistics avec les en-têtes versionnés", async () => {
  let seenUrl = "";
  let seenHeaders = {};
  const fakeFetch = async (url, options) => {
    seenUrl = String(url);
    seenHeaders = options.headers;
    return response({ elements: [{ totalShareStatistics: { impressionCount: 12, clickCount: 2 } }] });
  };
  const metrics = await fetchLinkedInOrganizationMetrics(
    "urn:li:share:123",
    env,
    fakeFetch,
    "w_organization_social rw_organization_admin",
  );
  assert.match(seenUrl, /organizationalEntityShareStatistics/);
  assert.equal(seenHeaders["LinkedIn-Version"], "202608");
  assert.equal(seenHeaders["X-Restli-Protocol-Version"], "2.0.0");
  assert.equal(metrics.views, 12);
  assert.equal(metrics.clicks, 2);
  assert.equal(JSON.stringify(metrics).includes("secret-token"), false);
});

test("refuse l'analytics organisation sans rw_organization_admin", async () => {
  await assert.rejects(
    () => fetchLinkedInOrganizationMetrics("urn:li:share:123", env, async () => response({}), "w_organization_social"),
    (error) => error?.code === "needs_reauth" && /rw_organization_admin/.test(error.message),
  );
});

test("un 403 LinkedIn devient une demande de réautorisation sans exposer le token", async () => {
  await assert.rejects(
    () => fetchLinkedInOrganizationMetrics(
      "urn:li:share:123",
      env,
      async () => response({ message: "not authorized" }, 403),
      "w_organization_social rw_organization_admin",
    ),
    (error) => error?.code === "needs_reauth" && !error.message.includes("secret-token"),
  );
});
