"use client";

import { track } from "@vercel/analytics";
import { captureAttribution, checkoutWithAttribution } from "../lib/attribution.mjs";
import { sendConversionEvent } from "../lib/conversion-client.mjs";

function currentAttribution() {
  try {
    return captureAttribution({
      search: window.location.search,
      href: window.location.href,
      referrer: document.referrer,
    });
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
            const attribution = currentAttribution();
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
