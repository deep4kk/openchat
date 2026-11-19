import { env } from "./env";
import { hmacHex, safeEqual } from "./crypto";
import { payload } from "./matching";

/**
 * A run ID alone opens nothing: the link in the final DM and the buttons in the DMs carry a
 * signature of it, so nobody can count clicks on, or tap for, a run whose ID they guessed or saw.
 */
const SIG_LENGTH = 24; // 96 bits

export const runSig = (runId: string) => hmacHex(env.sessionSecret, `run:${runId}`).slice(0, SIG_LENGTH);
export const validRunSig = (runId: string, sig: string | undefined) => Boolean(sig) && safeEqual(sig!, runSig(runId));

/** The link button's URL: /r/<run id>.<signature>, which counts the tap and redirects. */
export const clickUrl = (runId: string) => `${env.appUrl}/r/${runId}.${runSig(runId)}`;

/** What a DM button sends back when tapped. */
export const tapPayload = (kind: "GATE" | "RECHECK", runId: string) =>
  kind === "GATE" ? payload.gate(runId, runSig(runId)) : payload.recheck(runId, runSig(runId));
