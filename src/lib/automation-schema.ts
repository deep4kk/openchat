import { z } from "zod";
import type { Automation } from "@prisma/client";

const label = z.string().trim().min(1).max(20, "Button labels are limited to 20 characters");
const list = (max: number) => z.array(z.string().trim().min(1).max(max)).max(20);

export const automationInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
    mediaScope: z.enum(["SPECIFIC_MEDIA", "ALL_MEDIA"]),
    mediaIds: z.array(z.string()).default([]),
    mediaPreview: z
      .array(z.object({ id: z.string(), thumbnail: z.string().optional(), caption: z.string().optional(), permalink: z.string().optional() }))
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
    linkUrl: z
      .string()
      .trim()
      .url("Enter the full link to send, starting with https://")
      .refine((u) => /^https?:\/\//.test(u), "The link must start with https://"),
    linkButtonLabel: label,
    oncePerUser: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.mediaScope === "SPECIFIC_MEDIA" && v.mediaIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["mediaIds"], message: "Pick at least one post or reel" });
    if (v.triggerType === "KEYWORDS" && v.keywords.length === 0)
      ctx.addIssue({ code: "custom", path: ["keywords"], message: "Add at least one keyword" });
    if (v.publicReplyEnabled && v.publicReplies.length === 0)
      ctx.addIssue({ code: "custom", path: ["publicReplies"], message: "Add at least one public reply" });
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
};
