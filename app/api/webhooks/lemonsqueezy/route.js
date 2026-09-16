import { POST as canonicalPost } from "../../commerce/lemon-webhook/route";

// Backward-compatible alias kept for any Lemon Squeezy webhook still configured
// with the historical URL. All signature, idempotency, refund-ordering and
// delivery-safety rules live in the canonical commerce handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  return canonicalPost(request);
}
