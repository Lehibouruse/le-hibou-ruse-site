"use client";

import { track } from "@vercel/analytics";
import { ATTRIBUTION_STORAGE_KEY, checkoutWithAttribution } from "../lib/attribution.mjs";
import { sendConversionEvent } from "../lib/conversion-client.mjs";

function storedAttribution() {
  try {
    return JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function TrackedLink({ event, children, onClick, ...props }) {
  return (
    <a
      {...props}
      onClick={(clickEvent) => {
        try {
          track(event);
          if (event === "checkout_opened" && props.href) {
            const attribution = storedAttribution();
            sendConversionEvent("checkout_click", attribution);
            clickEvent.currentTarget.href = checkoutWithAttribution(props.href, attribution, event);
          }
        } catch {}
        if (typeof onClick === "function") onClick(clickEvent);
      }}
    >
      {children}
    </a>
  );
}
