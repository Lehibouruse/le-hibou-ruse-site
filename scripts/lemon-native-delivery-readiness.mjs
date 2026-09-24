#!/usr/bin/env node
import { inspectLemonVariantFiles } from "../lib/lemon-native-delivery.mjs";

const result = await inspectLemonVariantFiles({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY,
  variantId: process.env.LEMON_SQUEEZY_VARIANT_ID || process.env.LEMON_VARIANT_ID,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ready_for_pdf_delivery) process.exitCode = 2;
