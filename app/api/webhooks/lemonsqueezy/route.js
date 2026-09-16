// Backward-compatible alias kept for any Lemon Squeezy webhook still configured
// with the historical URL. All signature, idempotency, refund-ordering and
// delivery-safety rules live in the canonical commerce handler.
export { runtime, dynamic, maxDuration, POST } from "../../commerce/lemon-webhook/route";
