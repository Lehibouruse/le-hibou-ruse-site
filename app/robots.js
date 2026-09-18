import { publicSiteOrigin } from "../lib/site-origin.mjs";

export default function robots() {
  const origin = publicSiteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
