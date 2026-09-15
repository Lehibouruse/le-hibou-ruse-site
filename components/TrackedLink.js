"use client";

import { track } from "@vercel/analytics";
import { ATTRIBUTION_STORAGE_KEY, checkoutWithAttribution } from "../lib/attribution.mjs";

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
            clickEvent.currentTarget.href = checkoutWithAttribution(props.href, storedAttribution(), event);
          }
        } catch {}
        if (typeof onClick === "function") onClick(clickEvent);
      }}
    >
      {children}
    </a>
  );
}
