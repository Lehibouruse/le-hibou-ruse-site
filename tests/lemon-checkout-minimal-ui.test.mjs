import assert from "node:assert/strict";
import test from "node:test";
import { buildTestCheckoutPayload } from "../lib/lemon-api.mjs";

test("Lemon checkout hides optional product clutter", () => {
  const payload = buildTestCheckoutPayload({
    storeId: "1",
    variantId: "2",
    productName: "Guide du Hibou Rusé",
    description: "Édition numérique disponible immédiatement.",
    redirectUrl: "https://d4d5d6.com/merci",
  });
  const options = payload.data.attributes.checkout_options;
  assert.equal(options.media, false);
  assert.equal(options.desc, false);
  assert.equal(options.discount, false);
  assert.equal(options.logo, true);
  assert.equal(options.locale, "fr");
});
