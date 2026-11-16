"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    const next = !on;
    const res = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    setBusy(false);
    if (res.ok) {
      setOn(next);
      router.refresh();
    }
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
