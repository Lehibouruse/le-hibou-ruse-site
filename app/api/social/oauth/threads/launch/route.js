import { buildSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";
import { queryAllRecords, queryRecords, TABLES, updateRecord } from "../../../../../../lib/airtable.js";
import { configurationMap, socialRuntimeEnv } from "../../../../../../lib/social-runtime.mjs";
import { consumeOauthLaunchTicketConfig, validateOauthLaunchTicket } from "../../../../../../lib/social-oauth-launch-ticket.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_KEY = "threads_oauth_launch_ticket";

async function oauthEnv() {
  try {
    const records = await queryAllRecords(TABLES.configuration, {}, { maxRecords: 1000 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

async function ticketRecord() {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: `{Clé}='${TICKET_KEY}'`,
    pageSize: 2,
  });
  if (records.length !== 1) throw new Error("Ticket OAuth Threads indisponible");
  return records[0];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket") || "";
    const record = await ticketRecord();
    const raw = record.fields?.Valeur || "";
    const validation = validateOauthLaunchTicket(ticket, raw);
    if (!validation.ok) {
      return new Response("Lien OAuth Threads invalide, expiré ou déjà utilisé.", {
        status: 401,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }

    const authorization = buildSocialAuthorization("threads", await oauthEnv());

    await updateRecord(TABLES.configuration, record.id, {
      Valeur: consumeOauthLaunchTicketConfig(raw),
      Statut: "Actif",
      Description: "Ticket OAuth Threads à usage unique consommé. Générer un nouveau ticket pour toute reconnexion.",
    });

    return Response.redirect(authorization.url, 302);
  } catch (error) {
    return new Response(`Connexion Threads impossible: ${String(error?.message || error).slice(0, 300)}`, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
}
