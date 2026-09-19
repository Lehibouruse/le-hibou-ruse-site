import { buildSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";
import { queryRecords, TABLES, updateRecord } from "../../../../../../lib/airtable.js";
import { configurationMap, socialRuntimeEnv } from "../../../../../../lib/social-runtime.mjs";
import { consumeOauthLaunchTicketConfig, validateOauthLaunchTicket } from "../../../../../../lib/social-oauth-launch-ticket.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_KEY = "meta_oauth_launch_ticket";

async function oauthEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 250 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

async function ticketRecord() {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: "{Clé}='meta_oauth_launch_ticket'",
    pageSize: 2,
  });
  if (records.length !== 1) throw new Error("Ticket OAuth Meta indisponible");
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
      return new Response("Lien OAuth Meta invalide, expiré ou déjà utilisé.", {
        status: 401,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }

    await updateRecord(TABLES.configuration, record.id, {
      Valeur: consumeOauthLaunchTicketConfig(raw),
      Statut: "Actif",
      Description: "Ticket OAuth Meta à usage unique consommé. Générer un nouveau ticket pour toute reconnexion.",
    });

    const authorization = buildSocialAuthorization("meta", await oauthEnv());
    return Response.redirect(authorization.url, 302);
  } catch (error) {
    return new Response(`Connexion Meta impossible: ${String(error?.message || error).slice(0, 300)}`, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
}
