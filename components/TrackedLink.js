"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { checkoutWithAttribution } from "../lib/attribution.mjs";
import { currentAttribution, sendConversionEvent } from "../lib/conversion-client.mjs";

export default function TrackedLink({ event, children, onClick, ...props }) {
  const Anchor = typeof props.href === "string" && (props.href.startsWith("/") || props.href.startsWith("#")) ? Link : "a";
  return (
    <Anchor
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
    </Anchor>
  );
}
