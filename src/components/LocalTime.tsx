"use client";

import { useEffect, useState } from "react";

const FORMATS = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * A date and/or time in the viewer's own timezone and format. The server runs in UTC and
 * can't know where the viewer is, so it sends UTC and the browser swaps in local time.
 */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: keyof typeof FORMATS }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, FORMATS[mode])), [iso, mode]);
  const utc = mode === "time" ? iso.slice(11, 16) : mode === "date" ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  return <time dateTime={iso}>{text ?? `${utc}${mode === "date" ? "" : " UTC"}`}</time>;
}
