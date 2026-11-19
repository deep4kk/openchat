"use client";

import { useEffect, useState } from "react";

/**
 * A date and time in the viewer's own timezone and format. The server runs in UTC and
 * can't know where the viewer is, so it sends UTC and the browser swaps in local time.
 * `timeOnly` drops the date, for lists that already group by day.
 */
export function LocalTime({ iso, timeOnly }: { iso: string; timeOnly?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(
    () => setText(new Date(iso).toLocaleString(undefined, timeOnly ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" })),
    [iso, timeOnly],
  );
  const utc = timeOnly ? iso.slice(11, 16) : iso.slice(0, 16).replace("T", " ");
  return <time dateTime={iso}>{text ?? `${utc} UTC`}</time>;
}
