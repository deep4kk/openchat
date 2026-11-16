"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportOptions, PlanItem } from "@/lib/import";
import { ChipsInput } from "./ChipsInput";

type Item = Pick<PlanItem, "row" | "permalink" | "name" | "status" | "note">;

const STATUS: Record<Item["status"], { label: string; tone: string }> = {
  ready: { label: "Will be imported", tone: "ok" },
  exists: { label: "Already in AutoDM", tone: "" },
  not_found: { label: "Reel not found", tone: "warn" },
  invalid: { label: "Can't import", tone: "bad" },
  other_account: { label: "Other account", tone: "warn" },
};

export function ImportForm({ initial, username }: { initial: ImportOptions; username: string }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [o, setO] = useState<ImportOptions>(initial);
  const [repliesText, setRepliesText] = useState(initial.publicReplies.join("\n"));
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Any change to the file or the choices makes the last check out of date.
  const set = <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) => {
    setO((prev) => ({ ...prev, [key]: value }));
    setItems(null);
  };

  async function send(dryRun: boolean) {
    if (!csv) return;
    setBusy(dryRun ? "check" : "import");
    setError(null);
    const res = await fetch("/api/automations/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun, options: o }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok || !json) return setError(json?.error ?? "Couldn't reach the server. Check your connection and try again.");
    if (dryRun) return setItems(json.items);
    router.push("/dashboard");
  }

  const ready = items?.filter((i) => i.status === "ready").length ?? 0;
  const count = (status: Item["status"]) => items?.filter((i) => i.status === status).length ?? 0;

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <section className="card stack">
        <h2>
          <span className="step">1</span>Choose the file
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          The CSV you exported from SuperProfile (AutoDM list). Each row becomes one automation for @{username}: the reel
          from the &quot;Content Link&quot; column, with the row&apos;s text as the DM.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setItems(null);
            setError(null);
            setFileName(file?.name ?? "");
            setCsv(file ? await file.text() : null);
          }}
        />
      </section>

      <section className="card stack">
        <h2>
          <span className="step">2</span>Which comments trigger them?
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          The export doesn&apos;t include your keywords, so this applies to every imported automation. You can change it per
          automation afterwards.
        </p>
        <div className="choices">
          <button type="button" className="choice" aria-pressed={o.triggerType === "ANY_COMMENT"} onClick={() => set("triggerType", "ANY_COMMENT")}>
            <strong>Any comment</strong>
            <span className="small muted">Everyone who comments on the reel gets the DM</span>
          </button>
          <button type="button" className="choice" aria-pressed={o.triggerType === "KEYWORDS"} onClick={() => set("triggerType", "KEYWORDS")}>
            <strong>Comments with keywords</strong>
            <span className="small muted">The same keywords for every reel</span>
          </button>
        </div>
        {o.triggerType === "KEYWORDS" && (
          <label className="field">
            Keywords
            <span className="hint">Not case-sensitive, whole words. Press Enter to add.</span>
            <ChipsInput value={o.keywords} onChange={(k) => set("keywords", k)} placeholder="Add keyword…" />
          </label>
        )}
      </section>

      <section className="card stack">
        <h2>
          <span className="step">3</span>Opening DM and public reply
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          Instagram allows one DM per comment, so AutoDM first sends this short message with a button. When the person taps
          it, they get the text from your file.
        </p>
        <label className="field">
          Opening message
          <textarea value={o.openingMessage} onChange={(e) => set("openingMessage", e.target.value)} />
        </label>
        <label className="field">
          Button label
          <input type="text" maxLength={20} value={o.openingButton} onChange={(e) => set("openingButton", e.target.value)} />
        </label>
        <div className="section-title" style={{ marginBottom: 0 }}>
          <h2>Also reply to the comment publicly</h2>
          <button
            type="button"
            role="switch"
            aria-checked={o.publicReplyEnabled}
            aria-label="Public reply"
            className="switch"
            onClick={() => set("publicReplyEnabled", !o.publicReplyEnabled)}
          />
        </div>
        {o.publicReplyEnabled && (
          <label className="field">
            Reply variations
            <span className="hint">One is picked at random each time. One per line.</span>
            <textarea
              value={repliesText}
              onChange={(e) => {
                setRepliesText(e.target.value);
                set("publicReplies", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
              }}
            />
          </label>
        )}
      </section>

      <section className="card stack">
        <div className="section-title" style={{ marginBottom: 0 }}>
          <h2>
            <span className="step">4</span>Ask to follow before sending
          </h2>
          <button
            type="button"
            role="switch"
            aria-checked={o.askToFollow}
            aria-label="Ask to follow"
            className="switch"
            onClick={() => set("askToFollow", !o.askToFollow)}
          />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {o.askToFollow
            ? "After the tap, AutoDM checks whether the person follows you. Followers get the text from your file right away; everyone else is asked to follow first."
            : "Off: everyone who taps the button gets the text from your file, whether they follow you or not."}
        </p>
        {o.askToFollow && (
          <>
            <label className="field">
              Message for people who don&apos;t follow you yet
              <textarea value={o.followMessage} onChange={(e) => set("followMessage", e.target.value)} />
            </label>
            <div className="choices">
              <label className="field">
                &quot;Visit profile&quot; button
                <input type="text" maxLength={20} value={o.followVisitLabel} onChange={(e) => set("followVisitLabel", e.target.value)} />
              </label>
              <label className="field">
                &quot;I&apos;m following&quot; button
                <input type="text" maxLength={20} value={o.followConfirmLabel} onChange={(e) => set("followConfirmLabel", e.target.value)} />
              </label>
            </div>
            <div className="choices">
              <label className="field">
                Ask up to
                <span className="hint">Times the follow request is sent</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={o.followMaxAttempts}
                  onChange={(e) => set("followMaxAttempts", Math.min(10, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                />
              </label>
              <label className="field">
                If they still don&apos;t follow
                <span className="hint">After the last attempt</span>
                <select value={o.followOnFail} onChange={(e) => set("followOnFail", e.target.value as ImportOptions["followOnFail"])}>
                  <option value="SEND_ANYWAY">Send the text anyway</option>
                  <option value="STOP">Don&apos;t send it</option>
                </select>
              </label>
            </div>
          </>
        )}
      </section>

      {error && <div className="banner-error">{error}</div>}

      {items && (
        <section className="card stack">
          <h2>
            {ready} of {items.length} will be imported
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            {[
              count("exists") && `${count("exists")} already in AutoDM`,
              count("not_found") && `${count("not_found")} not found on Instagram`,
              count("invalid") && `${count("invalid")} can't be imported`,
              count("other_account") && `${count("other_account")} for another account`,
            ]
              .filter(Boolean)
              .join(" · ") || "Every row matched one of your reels."}{" "}
            Importing sends nothing by itself: the automations answer comments that arrive from now on.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Reel</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.row}>
                    <td className="small muted">{i.row}</td>
                    <td>
                      {i.permalink.startsWith("https://") ? (
                        <a href={i.permalink} target="_blank" rel="noreferrer">
                          {i.name}
                        </a>
                      ) : (
                        i.name
                      )}
                    </td>
                    <td>
                      <span className={`pill ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                      {i.note && <div className="small muted">{i.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="row">
        {items && ready > 0 ? (
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => send(false)}>
            {busy === "import" ? "Importing…" : `Import ${ready} automation${ready === 1 ? "" : "s"}`}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!csv || busy !== null} onClick={() => send(true)}>
            {busy === "check" ? "Checking…" : "Check file"}
          </button>
        )}
        <button type="button" className="btn" onClick={() => router.push("/dashboard")}>
          Cancel
        </button>
        {fileName && <span className="small muted">{fileName}</span>}
      </div>
    </div>
  );
}
