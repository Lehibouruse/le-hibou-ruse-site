import { createHash } from "node:crypto";
import { queryRecords, TABLES, updateRecord } from "../../../../../lib/airtable.js";
import { verifyMetaSignedRequest } from "../../../../../lib/meta-signed-request.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function disableThreadsCredential() {
  const records = await queryRecords(TABLES.socialCredentials, {
    filterByFormula: "{Provider}='threads'",
    pageSize: 10,
  });
  for (const record of records) {
    await updateRecord(TABLES.socialCredentials, record.id, {
      Status: "Needs reauth",
      "Updated at": new Date().toISOString(),
      "Last error": "Threads data deletion request received",
    });
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const signedRequest = String(form.get("signed_request") || "");
    const payload = verifyMetaSignedRequest(signedRequest, process.env.THREADS_APP_SECRET);
    await disableThreadsCredential();
    const confirmation = createHash("sha256")
      .update(String(payload.user_id || "threads"))
      .update(String(Date.now()))
      .digest("hex")
      .slice(0, 20);
    const url = `https://d4d5d6.com/suppression-donnees?confirmation_code=${confirmation}`;
    return Response.json({ url, confirmation_code: confirmation }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error).slice(0, 180) }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
