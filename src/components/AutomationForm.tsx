"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AutomationInput } from "@/lib/automation-schema";
import { ChipsInput } from "./ChipsInput";
import { MediaPicker } from "./MediaPicker";
import { DmPreview } from "./DmPreview";

type FieldErrors = Partial<Record<keyof AutomationInput, string[]>>;

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  );
}

function Choice({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button type="button" className="choice" aria-pressed={active} onClick={onClick}>
      <strong>{title}</strong>
      <span className="small muted">{hint}</span>
    </button>
  );
}

export function AutomationForm({ id, initial, username }: { id?: string; initial: AutomationInput; username: string }) {
  const [v, setV] = useState<AutomationInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [repliesText, setRepliesText] = useState(initial.publicReplies.join("\n"));
  const router = useRouter();

  const set = <K extends keyof AutomationInput>(key: K, value: AutomationInput[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const err = (key: keyof AutomationInput) => errors[key]?.[0] && <span className="error">{errors[key]![0]}</span>;

  async function save() {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const res = await fetch(id ? `/api/automations/${id}` : "/api/automations", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    setSaving(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    const json = await res.json().catch(() => ({}));
    setErrors(json.error?.fieldErrors ?? {});
    setFormError(json.error?.formErrors?.[0] ?? (typeof json.error === "string" ? json.error : "Please fix the highlighted fields"));
  }

  async function remove() {
    if (!id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="editor">
      <div className="stack">
        <section className="card stack">
          <label className="field">
            Automation name
            <input type="text" value={v.name} onChange={(e) => set("name", e.target.value)} />
            {err("name")}
          </label>
        </section>

        <section className="card stack">
          <h2>
            <span className="step">1</span>Where should it run?
          </h2>
          <div className="choices">
            <Choice active={v.mediaScope === "SPECIFIC_MEDIA"} onClick={() => set("mediaScope", "SPECIFIC_MEDIA")} title="Specific posts or reels" hint="Pick one or more from your feed" />
            <Choice active={v.mediaScope === "ALL_MEDIA"} onClick={() => set("mediaScope", "ALL_MEDIA")} title="All posts & reels" hint="Including ones you post later" />
          </div>
          {v.mediaScope === "SPECIFIC_MEDIA" && (
            <MediaPicker
              selected={v.mediaPreview}
              onChange={(picked) => setV((prev) => ({ ...prev, mediaPreview: picked, mediaIds: picked.map((p) => p.id) }))}
            />
          )}
          {err("mediaIds")}
        </section>

        <section className="card stack">
          <h2>
            <span className="step">2</span>Which comments trigger it?
          </h2>
          <div className="choices">
            <Choice active={v.triggerType === "KEYWORDS"} onClick={() => set("triggerType", "KEYWORDS")} title="Comments with keywords" hint="e.g. LINK, guide, price" />
            <Choice active={v.triggerType === "ANY_COMMENT"} onClick={() => set("triggerType", "ANY_COMMENT")} title="Any comment" hint="Every commenter gets the DM" />
          </div>
          {v.triggerType === "KEYWORDS" && (
            <label className="field">
              Keywords
              <span className="hint">Not case-sensitive. Matches whole words, so &quot;link&quot; won&apos;t match &quot;unlinked&quot;. Press Enter to add.</span>
              <ChipsInput value={v.keywords} onChange={(k) => set("keywords", k)} placeholder="Add keyword…" />
              {err("keywords")}
            </label>
          )}
        </section>

        <section className="card stack">
          <div className="section-title">
            <h2>
              <span className="step">3</span>Reply to the comment publicly
            </h2>
            <Switch checked={v.publicReplyEnabled} onChange={(c) => set("publicReplyEnabled", c)} label="Public reply" />
          </div>
          {v.publicReplyEnabled && (
            <label className="field">
              Reply variations
              <span className="hint">One is picked at random each time, so your replies don&apos;t look like spam. One per line.</span>
              <textarea
                value={repliesText}
                onChange={(e) => {
                  setRepliesText(e.target.value);
                  set("publicReplies", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
                }}
              />
              {err("publicReplies")}
            </label>
          )}
        </section>

        <section className="card stack">
          <h2>
            <span className="step">4</span>Opening DM
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Instagram allows only one DM in reply to a comment. When the person taps this button, you can send them more messages (and check whether they follow you).
          </p>
          <label className="field">
            Message
            <textarea value={v.openingMessage} onChange={(e) => set("openingMessage", e.target.value)} />
            {err("openingMessage")}
          </label>
          <label className="field">
            Button label
            <input type="text" maxLength={20} value={v.openingButton} onChange={(e) => set("openingButton", e.target.value)} />
            {err("openingButton")}
          </label>
        </section>

        <section className="card stack">
          <div className="section-title">
            <h2>
              <span className="step">5</span>Ask to follow before sending the link
            </h2>
            <Switch checked={v.askToFollow} onChange={(c) => set("askToFollow", c)} label="Ask to follow" />
          </div>
          {v.askToFollow && (
            <>
              <label className="field">
                Message for people who don&apos;t follow you yet
                <textarea value={v.followMessage} onChange={(e) => set("followMessage", e.target.value)} />
                {err("followMessage")}
              </label>
              <div className="choices">
                <label className="field">
                  &quot;Visit profile&quot; button
                  <input type="text" maxLength={20} value={v.followVisitLabel} onChange={(e) => set("followVisitLabel", e.target.value)} />
                  {err("followVisitLabel")}
                </label>
                <label className="field">
                  &quot;I&apos;m following&quot; button
                  <input type="text" maxLength={20} value={v.followConfirmLabel} onChange={(e) => set("followConfirmLabel", e.target.value)} />
                  {err("followConfirmLabel")}
                </label>
              </div>
              <div className="choices">
                <label className="field">
                  Ask up to
                  <span className="hint">Times we re-send the follow request</span>
                  <input type="number" min={1} max={10} value={v.followMaxAttempts} onChange={(e) => set("followMaxAttempts", Number(e.target.value) || 1)} />
                </label>
                <label className="field">
                  If they still don&apos;t follow
                  <span className="hint">After the last attempt</span>
                  <select value={v.followOnFail} onChange={(e) => set("followOnFail", e.target.value as AutomationInput["followOnFail"])}>
                    <option value="SEND_ANYWAY">Send the link anyway</option>
                    <option value="STOP">Don&apos;t send the link</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </section>

        <section className="card stack">
          <h2>
            <span className="step">6</span>DM with the link
          </h2>
          <label className="field">
            Message
            <textarea value={v.linkMessage} onChange={(e) => set("linkMessage", e.target.value)} />
            {err("linkMessage")}
          </label>
          <div className="choices">
            <label className="field">
              Link URL
              <input type="url" value={v.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://" />
              {err("linkUrl")}
            </label>
            <label className="field">
              Button label
              <input type="text" maxLength={20} value={v.linkButtonLabel} onChange={(e) => set("linkButtonLabel", e.target.value)} />
              {err("linkButtonLabel")}
            </label>
          </div>
        </section>

        <section className="card stack">
          <div className="section-title">
            <div>
              <h2>Only once per person</h2>
              <span className="small muted">Skip people who already went through this automation</span>
            </div>
            <Switch checked={v.oncePerUser} onChange={(c) => set("oncePerUser", c)} label="Once per person" />
          </div>
          <div className="section-title">
            <h2>Active</h2>
            <Switch checked={v.active} onChange={(c) => set("active", c)} label="Active" />
          </div>
        </section>

        {formError && <div className="banner-error">{formError}</div>}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : id ? "Save changes" : "Create automation"}
          </button>
          <button type="button" className="btn" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
          {id && (
            <button type="button" className="btn btn-danger" disabled={saving} onClick={remove} style={{ marginLeft: "auto" }}>
              {confirmDelete ? "Click again to delete" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <aside className="editor-preview stack">
        <span className="small muted">Preview</span>
        <DmPreview v={v} username={username} />
      </aside>
    </div>
  );
}
