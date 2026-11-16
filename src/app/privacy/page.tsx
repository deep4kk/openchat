import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Privacy policy" };

/**
 * Meta requires a public privacy policy URL before an app can go Live.
 * The text follows what the app actually stores (prisma/schema.prisma);
 * update both together.
 */
export default function Privacy() {
  const app = site.name;
  return (
    <LegalPage title="Privacy policy">
      <p>
        {app} lets owners of Instagram professional accounts reply to comments automatically and send the commenter a
        direct message, using Meta&apos;s official Instagram API. This policy explains what data {app} handles, why, and how
        to have it deleted.
      </p>

      <h2>Who is responsible</h2>
      <p>
        This copy of {app} is run by {site.operator}, who is responsible for the data it processes. {app} is open-source
        software; anyone can run their own copy, and each copy is responsible only for its own data. Contact: <ContactLine />.
      </p>
      <p>{app} is not affiliated with, endorsed by, or sponsored by Meta or Instagram.</p>

      <h2>Data we handle</h2>
      <h3>Account owners (people who log in to {app})</h3>
      <ul>
        <li>Instagram account ID, username, display name and profile picture URL.</li>
        <li>An access token issued by Instagram when you log in. It is stored encrypted (AES-256-GCM).</li>
        <li>The automations you create: names, keywords, reply texts, messages, links and the posts they apply to.</li>
      </ul>
      <h3>People who comment on a connected account&apos;s posts</h3>
      <p>Only when the comment matches an automation the account owner switched on:</p>
      <ul>
        <li>Their Instagram-scoped ID (an ID Instagram creates for this app only) and username.</li>
        <li>The text of the comment and the post it was left on.</li>
        <li>
          The progress of the automation: whether the reply and messages were sent, when they last tapped a button, and,
          if the owner asked for it, whether they follow the account.
        </li>
        <li>Identifiers of messages they send to the account, kept for 7 days so the same message is never handled twice.</li>
      </ul>
      <p>
        {app} does not read or store the content of other direct messages, does not collect email addresses, phone numbers
        or passwords, and does not use cookies for tracking. One cookie keeps account owners logged in.
      </p>

      <h2>How we get it</h2>
      <p>
        From Instagram, through Meta&apos;s Instagram API, after the account owner logs in with Instagram and grants
        permission. Comment and message events reach {app} through Meta&apos;s webhooks.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run the automations the account owner set up: replying to comments, sending direct messages, and checking whether the commenter follows the account when the owner turned that option on.</li>
        <li>To show the account owner a log of what was sent.</li>
        <li>To keep sending within Instagram&apos;s limits so accounts stay in good standing.</li>
      </ul>
      <p>
        We do not sell data, use it for advertising or profiling, or use it to train AI models. We do not send marketing
        messages.
      </p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Meta (Instagram):</strong> replies and messages are sent through Meta&apos;s API.</li>
        <li>
          <strong>Hosting providers:</strong> the servers and database that run this copy of {app} (by default Vercel for
          the website and Render for the database and background sender). They store data on our behalf and may not use
          it for anything else.
        </li>
        <li>Authorities, only where the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data and automations: until the account owner disconnects or removes {app}.</li>
        <li>Commenter activity: until the account owner deletes the automation or disconnects.</li>
        <li>Message identifiers used to prevent duplicates: 7 days.</li>
        <li>Comments that could not be answered within Instagram&apos;s 7-day window are marked expired and are not sent.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Data travels over HTTPS. Instagram access tokens are encrypted in the database. Webhook messages are accepted only
        when Meta&apos;s signature is valid.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>
          <strong>Delete your data:</strong> see <Link href="/data-deletion">Data deletion</Link> for every way to do it,
          including removing {app} from your Instagram settings.
        </li>
        <li>
          <strong>Access or correct your data:</strong> account owners see everything {app} stores about their account in the
          dashboard. Anyone else can ask us at <ContactLine />.
        </li>
        <li>
          <strong>Stop messages:</strong> commenters can ignore the message or block the account; {app} only replies to
          their own comments and taps.
        </li>
      </ul>

      <h2>Children</h2>
      <p>{app} is not meant for anyone under 13, or under the minimum age to use Instagram where they live.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the new version is published on this page with a new &quot;last updated&quot; date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <ContactLine />.
      </p>
    </LegalPage>
  );
}
