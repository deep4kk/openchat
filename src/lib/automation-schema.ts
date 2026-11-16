import { z } from "zod";
import type { Automation } from "@prisma/client";

const label = z.string().trim().min(1).max(20, "Button labels are limited to 20 characters");
function isHttpUrl(u: string) {
  try {
    return /^https?:$/.test(new URL(u).protocol);
  } catch {
    return false;
  }
}
const list = (max: number) => z.array(z.string().trim().min(1).max(max)).max(20);
/** Media IDs end up in Instagram API paths (/<id>/comments), so nothing but ID characters gets through. */
const mediaId = z.string().regex(/^[\w-]{1,64}$/, "Invalid post ID");
const MAX_MEDIA = 200;
const httpsUrl = z.string().max(2048).refine((u) => u.startsWith("https://"), "Must be an https link");

export const automationInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
    mediaScope: z.enum(["SPECIFIC_MEDIA", "ALL_MEDIA"]),
    mediaIds: z.array(mediaId).max(MAX_MEDIA, `Pick at most ${MAX_MEDIA} posts`).default([]),
    mediaPreview: z
      .array(z.object({ id: mediaId, thumbnail: httpsUrl.optional(), caption: z.string().max(300).optional(), permalink: httpsUrl.optional() }))
      .max(MAX_MEDIA)
      .default([]),
    triggerType: z.enum(["KEYWORDS", "ANY_COMMENT"]),
    keywords: list(50).default([]),
    publicReplyEnabled: z.boolean(),
    publicReplies: list(300).default([]),
    openingMessage: z.string().trim().min(1).max(1000),
    openingButton: label,
    askToFollow: z.boolean(),
    followMessage: z.string().trim().min(1).max(1000),
    followVisitLabel: label,
    followConfirmLabel: label,
    followMaxAttempts: z.number().int().min(1).max(10),
    followOnFail: z.enum(["SEND_ANYWAY", "STOP"]),
    linkMessage: z.string().trim().min(1).max(1000),
    // Optional: empty sends the message as plain text, without a button.
    linkUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((u) => u === "" || isHttpUrl(u), "Enter the full link to send, starting with https://"),
    linkButtonLabel: z.string().trim().max(20, "Button labels are limited to 20 characters"),
    oncePerUser: z.boolean(),
    // Capped at 4 minutes: on Vercel the wait happens inside the webhook request (5-minute limit).
    replyDelaySeconds: z.number().int().min(0).max(240, "The delay can be at most 4 minutes"),
  })
  .superRefine((v, ctx) => {
    if (v.mediaScope === "SPECIFIC_MEDIA" && v.mediaIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["mediaIds"], message: "Pick at least one post or reel" });
    if (v.triggerType === "KEYWORDS" && v.keywords.length === 0)
      ctx.addIssue({ code: "custom", path: ["keywords"], message: "Add at least one keyword" });
    if (v.publicReplyEnabled && v.publicReplies.length === 0)
      ctx.addIssue({ code: "custom", path: ["publicReplies"], message: "Add at least one public reply" });
    if (v.linkUrl && !v.linkButtonLabel)
      ctx.addIssue({ code: "custom", path: ["linkButtonLabel"], message: "Add a label for the link button" });
  });

export type AutomationInput = z.infer<typeof automationInput>;

/** DB row -> plain object with parsed JSON lists. */
export function parseAutomation(a: Automation) {
  return {
    ...a,
    mediaIds: JSON.parse(a.mediaIds) as string[],
    mediaPreview: JSON.parse(a.mediaPreview) as AutomationInput["mediaPreview"],
    keywords: JSON.parse(a.keywords) as string[],
    publicReplies: JSON.parse(a.publicReplies) as string[],
  };
}

export type ParsedAutomation = ReturnType<typeof parseAutomation>;

/** Validated input -> DB columns. */
export function toRow(v: AutomationInput) {
  return {
    ...v,
    mediaIds: JSON.stringify(v.mediaScope === "SPECIFIC_MEDIA" ? v.mediaIds : []),
    mediaPreview: JSON.stringify(v.mediaScope === "SPECIFIC_MEDIA" ? v.mediaPreview : []),
    keywords: JSON.stringify(v.keywords),
    publicReplies: JSON.stringify(v.publicReplies),
  };
}

export const defaults: AutomationInput = {
  name: "Send link on comment",
  active: true,
  mediaScope: "SPECIFIC_MEDIA",
  mediaIds: [],
  mediaPreview: [],
  triggerType: "KEYWORDS",
  keywords: ["link"],
  publicReplyEnabled: true,
  publicReplies: ["Check your DMs 📩", "Sent! Look in your inbox ✨", "Just DM'd you 🙌"],
  openingMessage: "Hey! Thanks for the comment 🙌 Tap below and I'll send you the link.",
  openingButton: "Send me the link",
  askToFollow: false,
  followMessage: "Looks like you're not following yet. Follow us and tap the button below to get your link 👇",
  followVisitLabel: "Visit profile",
  followConfirmLabel: "I'm following ✅",
  followMaxAttempts: 3,
  followOnFail: "SEND_ANYWAY",
  linkMessage: "Here's your link 👇",
  linkUrl: "",
  linkButtonLabel: "Open link",
  oncePerUser: true,
  replyDelaySeconds: 5,
};
