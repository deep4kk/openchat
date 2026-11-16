"use client";

import { useEffect, useState } from "react";

/**
 * A date and time in the viewer's own timezone and format. The server runs in UTC and
 * can't know where the viewer is, so it sends UTC and the browser swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })), [iso]);
  return <time dateTime={iso}>{text ?? `${iso.slice(0, 16).replace("T", " ")} UTC`}</time>;
}
