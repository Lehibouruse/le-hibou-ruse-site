import { publicSiteOrigin } from "../lib/site-origin.mjs";
import { getRecords, TABLES } from "../lib/airtable.js";

export const revalidate = 3600;

export default async function sitemap() {
  const origin = publicSiteOrigin();
  const records = await getRecords(TABLES.articles);
  const articles = records
    .filter((record) => record.fields?.Publié && record.fields?.Slug)
    .map((record) => ({
      url: `${origin}/articles/${encodeURIComponent(record.fields.Slug)}`,
      ...(record.fields["Date publication"] ? { lastModified: new Date(record.fields["Date publication"]) } : {}),
    }));
  return [{ url: origin, priority: 1 }, { url: `${origin}/guide`, priority: 0.8 }, ...articles];
}
