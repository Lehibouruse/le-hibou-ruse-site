"use client";

import { track } from "@vercel/analytics";
import { checkoutWithAttribution } from "../lib/attribution.mjs";
import { sendGrowthEvent, storedAttribution } from "../lib/growth-client";

export default function TrackedLink({ event, children, onClick, ...props }) {
  return (
    <a
      {...props}
      onClick={(clickEvent) => {
        try {
          track(event);
          if (event === "checkout_opened" && props.href) {
            const attribution = storedAttribution();
            sendGrowthEvent("checkout_click", attribution);
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
