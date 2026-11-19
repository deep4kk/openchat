import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

// Every page is rendered per request so Next.js can put that request's CSP nonce on its scripts
// (see src/middleware.ts). A prerendered page would carry no nonce and its scripts would be blocked.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AutoDM",
  description: "Auto-reply to Instagram comments and DM your link, with an optional follow gate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
