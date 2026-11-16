/**
 * Import of automations from another tool's CSV export (SuperProfile's "AutoDM list").
 * Pure logic, no database or network, so it can be unit tested: the route supplies the
 * account's posts and existing automations.
 *
 * The export has one row per reel: the DM text, the reel link, status and dates. It has no
 * trigger keywords, so the trigger is chosen once for the whole import.
 */
import { automationInput, defaults, type AutomationInput } from "./automation-schema";

/** RFC 4180 CSV: quoted fields may contain commas, line breaks and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRow = {
  /** 1-based position among the data rows of the file. */
  row: number;
  message: string;
  permalink: string;
  /** The reel/post code from the link (instagram.com/reel/<code>/), which is how posts are matched. */
  shortcode: string | null;
  active: boolean;
  createdAt: Date | null;
  username: string;
};

export const MAX_IMPORT_ROWS = 500;

export const shortcodeOf = (url: string) => url.match(/instagram\.com\/(?:reels?|p|tv)\/([\w-]+)/i)?.[1] ?? null;

/** Reads the export's rows by column name. Throws a readable Error if this isn't that kind of file. */
export function readRows(csv: string): ImportRow[] {
  const [header, ...data] = parseCsv(csv);
  if (!header) throw new Error("The file is empty.");
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const message = col("auto dm name");
  const link = col("content link");
  if (message < 0 || link < 0) {
    throw new Error('This doesn\'t look like a SuperProfile AutoDM export: it needs the columns "Auto Dm Name" and "Content Link".');
  }
  if (data.length > MAX_IMPORT_ROWS) throw new Error(`The file has ${data.length} rows; at most ${MAX_IMPORT_ROWS} can be imported at once.`);
  const status = col("status");
  const created = col("created at");
  const username = col("instagram username");
  return data.map((cells, i) => {
    const at = created >= 0 ? new Date(cells[created] ?? "") : null;
    const permalink = (cells[link] ?? "").trim();
    return {
      row: i + 1,
      message: (cells[message] ?? "").trim(),
      permalink,
      shortcode: shortcodeOf(permalink),
      active: status < 0 || (cells[status] ?? "").trim().toLowerCase() === "active",
      createdAt: at && !Number.isNaN(at.getTime()) ? at : null,
      username: username >= 0 ? (cells[username] ?? "").trim().replace(/^@/, "").toLowerCase() : "",
    };
  });
}

/** What the export can't tell us, chosen once for every imported automation. */
export type ImportOptions = Pick<
  AutomationInput,
  "triggerType" | "keywords" | "publicReplyEnabled" | "publicReplies" | "openingMessage" | "openingButton"
>;

export type ImportMedia = { id: string; permalink: string; caption?: string; thumbnail?: string };

export type PlanItem = {
  row: number;
  permalink: string;
  name: string;
  /** ready: will be created. exists: this reel already has an automation. The rest are skipped with a note. */
  status: "ready" | "exists" | "not_found" | "invalid" | "other_account";
  note?: string;
  /** Present when status is "ready". */
  input?: AutomationInput;
  createdAt?: Date;
};

const firstLine = (text: string) => text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
const HAS_LINK = /https?:\/\/|\b[\w-]+\.[a-z]{2,}\//i;

/**
 * Decides what happens to each row. The export's text becomes the final DM, sent as written
 * (no link button: many of these messages carry several links, which only work as text).
 */
export function planImport(
  rows: ImportRow[],
  media: ImportMedia[],
  /** Media IDs that a specific-post automation of this account already covers. */
  covered: Set<string>,
  accountUsername: string,
  options: ImportOptions,
): PlanItem[] {
  const byCode = new Map<string, ImportMedia>();
  for (const m of media) {
    const code = shortcodeOf(m.permalink);
    if (code) byCode.set(code, m);
  }
  const taken = new Set(covered);

  return rows.map((r): PlanItem => {
    const item = { row: r.row, permalink: r.permalink, name: firstLine(r.message).slice(0, 70) || `Row ${r.row}` };
    if (r.username && r.username !== accountUsername.toLowerCase()) {
      return { ...item, status: "other_account", note: `Belongs to @${r.username}, not the account you're logged in as` };
    }
    if (!r.shortcode) return { ...item, status: "invalid", note: "The link isn't an Instagram post or reel" };
    const found = byCode.get(r.shortcode);
    if (!found) return { ...item, status: "not_found", note: "Not among your posts on Instagram (deleted or archived?)" };

    const name = (firstLine(found.caption ?? "") || item.name).slice(0, 70);
    if (taken.has(found.id)) return { ...item, name, status: "exists", note: "This reel already has an automation" };

    const parsed = automationInput.safeParse({
      ...defaults,
      ...options,
      name,
      active: r.active,
      mediaScope: "SPECIFIC_MEDIA",
      mediaIds: [found.id],
      mediaPreview: [
        {
          id: found.id,
          permalink: found.permalink,
          ...(found.caption ? { caption: found.caption.slice(0, 120) } : {}),
          ...(found.thumbnail?.startsWith("https://") && found.thumbnail.length <= 2048 ? { thumbnail: found.thumbnail } : {}),
        },
      ],
      askToFollow: false,
      linkMessage: r.message,
      linkUrl: "",
      linkButtonLabel: "",
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ...item, name, status: "invalid", note: `${issue.path.join(".") || "row"}: ${issue.message}` };
    }
    taken.add(found.id);
    return {
      ...item,
      name,
      status: "ready",
      input: parsed.data,
      ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      ...(HAS_LINK.test(r.message) ? {} : { note: "Heads up: there's no link in this message" }),
    };
  });
}
