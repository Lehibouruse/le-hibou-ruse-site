"use client";

import { track } from "@vercel/analytics";

export default function TrackedLink({ event, children, ...props }) {
  return <a {...props} onClick={() => track(event)}>{children}</a>;
}
