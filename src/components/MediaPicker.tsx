"use client";

import { useEffect, useState } from "react";
import type { IgMedia } from "@/lib/instagram";

export type PickedMedia = { id: string; thumbnail?: string; caption?: string; permalink?: string };

export function MediaPicker({ selected, onChange }: { selected: PickedMedia[]; onChange: (v: PickedMedia[]) => void }) {
  const [items, setItems] = useState<IgMedia[]>([]);
  const [after, setAfter] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(cursor?: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/media${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setLoading(false);
    if (!res?.ok) return setError(json?.error ?? "Couldn't load your posts. Check your connection and try again.");
    setItems((prev) => (cursor ? [...prev, ...json.items] : json.items));
    setAfter(json.after);
  }

  useEffect(() => {
    load();
  }, []);

  const ids = new Set(selected.map((s) => s.id));
  function toggle(m: IgMedia) {
    if (ids.has(m.id)) return onChange(selected.filter((s) => s.id !== m.id));
    onChange([
      ...selected,
      { id: m.id, thumbnail: m.thumbnail_url ?? m.media_url, caption: m.caption?.slice(0, 120), permalink: m.permalink },
    ]);
  }

  return (
    <div className="stack">
      {error && (
        <div className="banner-error row" style={{ justifyContent: "space-between" }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}
      <div className="media-grid">
        {items.map((m) => (
          <button
            type="button"
            key={m.id}
            className="media-tile"
            aria-pressed={ids.has(m.id)}
            title={m.caption ?? ""}
            onClick={() => toggle(m)}
          >
            {(m.thumbnail_url || m.media_type === "IMAGE") && <img src={m.thumbnail_url ?? m.media_url} alt="" loading="lazy" />}
            <span className="badge">{m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Post"}</span>
            {ids.has(m.id) && <span className="check">✓</span>}
          </button>
        ))}
      </div>
      <div className="row">
        {loading && <span className="small muted">Loading…</span>}
        {!loading && after && (
          <button type="button" className="btn btn-sm" onClick={() => load(after)}>
            Load more
          </button>
        )}
        <span className="small muted">{selected.length} selected</span>
      </div>
    </div>
  );
}
