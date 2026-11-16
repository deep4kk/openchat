import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Data deletion" };

/**
 * Meta's "User data deletion" setting accepts a callback URL (/api/meta/data-deletion)
 * or an instructions URL. This page is the instructions URL, and also covers
 * commenters, who never log in and so have no button to press.
 */
export default function DataDeletion() {
  const app = site.name;
  return (
    <LegalPage title="Delete your data">
      <p>You can have everything {app} stores about you deleted at any time. Pick the option that fits you.</p>

      <h2>If you connected your Instagram account</h2>
      <h3>Option 1: from the dashboard</h3>
      <ol>
        <li>Log in to {app} with Instagram.</li>
        <li>On the dashboard, scroll to <strong>Your data</strong>.</li>
        <li>Click <strong>Disconnect &amp; delete data</strong>, then click it again to confirm.</li>
      </ol>
      <h3>Option 2: from Instagram</h3>
      <ol>
        <li>On instagram.com or in the Instagram app, open <strong>Settings</strong>.</li>
        <li>Go to <strong>Website permissions → Apps and websites</strong>.</li>
        <li>Find {app} under <strong>Active</strong> and choose <strong>Remove</strong>.</li>
      </ol>
      <p>
        Instagram then tells {app} to delete your data automatically. You get a confirmation code you can check on the{" "}
        <Link href="/deletion">deletion status page</Link>.
      </p>
      <p>
        Both options delete, immediately and permanently: your login token, your profile details, all your automations,
        and the activity log of everyone who interacted with them.
      </p>

      <h2>If you commented on an account that uses {app}</h2>
      <p>
        {app} stores your Instagram username, your ID for this app, the comment that triggered the automation, and whether
        messages were delivered. To delete it:
      </p>
      <ul>
        <li>Ask the account owner, who can delete the automation or disconnect, or</li>
        <li>
          Email <ContactLine /> with your Instagram username and the account you commented on. We delete it within 30
          days and confirm by email.
        </li>
      </ul>

      <h2>What is not affected</h2>
      <p>
        Comments, replies and direct messages already on Instagram stay there; delete them in Instagram. Deleting your
        data in {app} doesn&apos;t change your Instagram account.
      </p>

      <p className="muted small">
        Read more in the <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
