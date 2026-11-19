"use client";

import { useEffect, useState } from "react";
import { PAGE_SIZES } from "./Pager";

/** Rows-per-page for one list, remembered in this browser (falls back to the default when storage is blocked). */
export function usePageSize(list: string, fallback: number) {
  const key = `autodm:rows:${list}`;
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (PAGE_SIZES.includes(saved)) setSize(saved);
    } catch {}
  }, [key]);
  const update = (n: number) => {
    setSize(n);
    try {
      localStorage.setItem(key, String(n));
    } catch {}
  };
  return [size, update] as const;
}
