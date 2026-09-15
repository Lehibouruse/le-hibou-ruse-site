"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { ATTRIBUTION_STORAGE_KEY, captureAttribution } from "../lib/attribution.mjs";
import { sendGrowthEvent } from "../lib/growth-client";

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
      sendGrowthEvent("landing", next);
      if (next.utm_source || next.utm_campaign || next.utm_content) {
        track("attributed_visit", {
          source: next.utm_source || "unknown",
          medium: next.utm_medium || "unknown",
          campaign: next.utm_campaign || "unknown",
          content: next.utm_content || "unknown",
        });
      }
    } catch {}
  }, []);

  return null;
}
