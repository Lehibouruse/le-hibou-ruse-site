"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { captureAttribution } from "../lib/attribution.mjs";
import { sendConversionEvent } from "../lib/conversion-client.mjs";

export default function AttributionCapture() {
  useEffect(() => {
    try {
      const attribution = captureAttribution({
        search: window.location.search,
        href: window.location.href,
        referrer: document.referrer,
      });
      if (attribution.utm_source || attribution.utm_campaign || attribution.utm_content) {
        track("attributed_visit", {
          source: attribution.utm_source || "unknown",
          medium: attribution.utm_medium || "unknown",
          campaign: attribution.utm_campaign || "unknown",
          content: attribution.utm_content || "unknown",
        });
        sendConversionEvent("landing", attribution, { dedupeKey: "landing" });
      }
    } catch {}
  }, []);

  return null;
}
