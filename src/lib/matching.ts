/** Pure trigger-matching logic (no DB / network) so it can be unit tested. */

export type MatchableAutomation = {
  id: string;
  active: boolean;
  mediaScope: string; // "SPECIFIC_MEDIA" | "ALL_MEDIA"
  mediaIds: string[];
  triggerType: string; // "KEYWORDS" | "ANY_COMMENT"
  keywords: string[];
  createdAt: Date;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive keyword match on word boundaries, so "link" matches
 * "LINK please" and "link!" but not "unlinked". Phrases and emoji work too.
 */
export function matchesKeyword(text: string, keywords: string[]): boolean {
  const haystack = text.normalize("NFKC").toLowerCase();
  return keywords.some((raw) => {
    const kw = raw.normalize("NFKC").toLowerCase().trim();
    if (!kw) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(kw)}($|[^\\p{L}\\p{N}_])`, "u");
    return re.test(haystack);
  });
}

/**
 * Picks the automation for a comment. A specific-media automation beats an
 * all-media one; among equals the newest wins.
 */
export function selectAutomation<T extends MatchableAutomation>(
  automations: T[],
  mediaId: string,
  text: string,
): T | null {
  const candidates = automations.filter((a) => {
    if (!a.active) return false;
    if (a.mediaScope === "SPECIFIC_MEDIA" && !a.mediaIds.includes(mediaId)) return false;
    if (a.triggerType === "KEYWORDS" && !matchesKeyword(text, a.keywords)) return false;
    return true;
  });
  candidates.sort((a, b) => {
    const specific = Number(b.mediaScope === "SPECIFIC_MEDIA") - Number(a.mediaScope === "SPECIFIC_MEDIA");
    return specific || b.createdAt.getTime() - a.createdAt.getTime();
  });
  return candidates[0] ?? null;
}

export function pickRandom<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

/** Quick-reply / postback payloads carry the run ID (and its signature, see links.ts) so taps map back to a run. */
export const payload = {
  gate: (runId: string, sig?: string) => `GATE:${runId}${sig ? `.${sig}` : ""}`,
  recheck: (runId: string, sig?: string) => `RECHECK:${runId}${sig ? `.${sig}` : ""}`,
  parse(value: string | undefined): { kind: "GATE" | "RECHECK"; runId: string; sig?: string } | null {
    const m = value?.match(/^(GATE|RECHECK):([^.]+)(?:\.([0-9a-f]+))?$/);
    if (!m) return null;
    return { kind: m[1] as "GATE" | "RECHECK", runId: m[2], ...(m[3] ? { sig: m[3] } : {}) };
  },
};
