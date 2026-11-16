"use client";

import { useState } from "react";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    // Flip straight away; put it back if the server says no.
    setOn(next);
    setBusy(true);
    const res = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) setOn(!next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Pause automation" : "Activate automation"}
      className="switch"
      disabled={busy}
      onClick={toggle}
    />
  );
}
