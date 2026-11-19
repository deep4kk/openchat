"use client";

import { useState } from "react";

const SLOTS = 5;
const MAX = 20;

/**
 * One box per public reply variation: five to start with, more on request. Empty boxes are
 * left out of the saved list, so the parent only ever sees the filled-in replies.
 */
export function ReplyVariations({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [boxes, setBoxes] = useState<string[]>(() => [...value, ...Array(Math.max(0, SLOTS - value.length)).fill("")]);

  function update(next: string[]) {
    setBoxes(next);
    onChange(next.map((l) => l.trim()).filter(Boolean));
  }

  return (
    <div className="variations">
      {boxes.map((text, i) => (
        <div className="variation" key={i}>
          <span className="variation-n">{i + 1}</span>
          <input
            type="text"
            maxLength={300}
            value={text}
            placeholder="Add a reply…"
            aria-label={`Reply variation ${i + 1}`}
            onChange={(e) => update(boxes.map((b, j) => (j === i ? e.target.value : b)))}
          />
          {boxes.length > SLOTS && (
            <button type="button" className="variation-x" aria-label={`Remove variation ${i + 1}`} onClick={() => update(boxes.filter((_, j) => j !== i))}>
              ×
            </button>
          )}
        </div>
      ))}
      {boxes.length < MAX && (
        <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => setBoxes([...boxes, ""])}>
          + Add variation
        </button>
      )}
    </div>
  );
}
