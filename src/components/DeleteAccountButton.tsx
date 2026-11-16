"use client";

import { useState } from "react";

export function DeleteAccountButton() {
  const [confirm, setConfirm] = useState(false);
  return (
    <form action="/api/account/delete" method="post" onSubmit={(e) => !confirm && (e.preventDefault(), setConfirm(true))}>
      <button className="btn btn-danger">{confirm ? "Click again to delete everything" : "Disconnect & delete data"}</button>
    </form>
  );
}
