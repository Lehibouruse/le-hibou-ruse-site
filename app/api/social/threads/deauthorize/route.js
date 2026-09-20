import { queryRecords, TABLES, updateRecord } from "../../../../lib/airtable.js";
import { verifyMetaSignedRequest } from "../../../../lib/meta-signed-request.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markThreadsDisconnected(reason) {
  const records = await queryRecords(TABLES.socialCredentials, {
    filterByFormula: "{Provider}='threads'",
    pageSize: 10,
  });
  for (const record of records) {
    await updateRecord(TABLES.socialCredentials, record.id, {
      Status: "Needs reauth",
      "Updated at": new Date().toISOString(),
      "Last error": reason,
    });
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const signedRequest = String(form.get("signed_request") || "");
    verifyMetaSignedRequest(signedRequest, process.env.THREADS_APP_SECRET);
    await markThreadsDisconnected("Threads deauthorized by user");
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: String(error?.message || error).slice(0, 180) }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
