import Link from "next/link";
import { site } from "@/lib/site";

/** Links Meta reviewers (and users) look for on every page. */
export function SiteFooter() {
  return (
    <footer className="footer">
      <span>{site.name}</span>
      <Link href="/privacy">Privacy policy</Link>
      <Link href="/terms">Terms of service</Link>
      <Link href="/data-deletion">Data deletion</Link>
      <Link href="/docs">Run your own copy</Link>
      {site.sourceUrl && <a href={site.sourceUrl}>Source code</a>}
      {site.contact && <a href={`mailto:${site.contact}`}>Contact</a>}
    </footer>
  );
}
