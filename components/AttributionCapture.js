"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { ATTRIBUTION_STORAGE_KEY, captureAttribution } from "../lib/attribution.mjs";
import { sendConversionEvent } from "../lib/conversion-client.mjs";

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function AttributionCapture() {
  useEffect(() => {
    try {
      const previous = readStored();
      const next = captureAttribution({
        search: window.location.search,
        href: window.location.href,
        referrer: document.referrer,
        previous,
      });
      localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
      if (next.utm_source || next.utm_campaign || next.utm_content) {
        track("attributed_visit", {
          source: next.utm_source || "unknown",
          medium: next.utm_medium || "unknown",
          campaign: next.utm_campaign || "unknown",
          content: next.utm_content || "unknown",
        });
        sendConversionEvent("landing", next, { dedupeKey: "landing" });
      }
    } catch {}
  }, []);

  return null;
}
