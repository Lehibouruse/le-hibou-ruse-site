import { publicSiteOrigin } from "../lib/site-origin.mjs";

const STATIC_ROUTES = [
  "",
  "/mentions-legales",
  "/cgv",
  "/confidentialite",
  "/conditions-utilisation",
  "/retractation",
];

export default function sitemap() {
  const origin = publicSiteOrigin();
  const now = new Date();
  return STATIC_ROUTES.map((path, index) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: index === 0 ? "daily" : "monthly",
    priority: index === 0 ? 1 : 0.4,
  }));
}
