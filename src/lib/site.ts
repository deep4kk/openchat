/**
 * Who runs this copy of the app. Every deployment is run by whoever cloned it,
 * so the legal pages read these instead of naming the project's author.
 */
export const site = {
  get name() {
    return process.env.APP_NAME || "AutoDM";
  },
  get operator() {
    return process.env.OPERATOR_NAME || `the operator of ${site.name}`;
  },
  get contact() {
    return process.env.CONTACT_EMAIL || "";
  },
  /** Public URL without a trailing slash, or "" if not set yet. Never throws. */
  get url() {
    return (process.env.APP_URL ?? "").replace(/\/$/, "");
  },
  /** Fixed date shown on the legal pages; bump it when you change their text. */
  legalUpdated: "21 October 2026",
  /** Optional link to the source code, shown in the footer. */
  get sourceUrl() {
    return process.env.SOURCE_CODE_URL || "";
  },
};

/** Settings Meta reviewers look for on the legal pages that are still empty. */
export function missingLegalSettings(): string[] {
  return ["APP_NAME", "CONTACT_EMAIL", "OPERATOR_NAME"].filter((k) => !process.env[k]);
}
