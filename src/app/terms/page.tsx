import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  const app = site.name;
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms apply to this copy of {app}, run by {site.operator}. By logging in with Instagram you agree to them. If
        you don&apos;t agree, don&apos;t use {app}.
      </p>

      <h2>What {app} does</h2>
      <p>
        {app} replies to comments on your Instagram posts and reels and sends the commenter a direct message, based on
        rules you set up. It can ask the commenter to follow your account before sending them your link. It works only
        through Meta&apos;s official Instagram API.
      </p>

      <h2>Who can use it</h2>
      <ul>
        <li>Only the Instagram accounts {site.operator} has allowed on this copy can log in. Anyone else can run their own copy of the open-source code.</li>
        <li>You need an Instagram Business or Creator account and the right to manage it.</li>
        <li>You must be old enough to use Instagram and to agree to these terms where you live.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <p>You are responsible for your automations and everything they send. You agree to:</p>
      <ul>
        <li>
          Follow Instagram&apos;s{" "}
          <a href="https://help.instagram.com/581066165581870">Terms of Use</a> and{" "}
          <a href="https://help.instagram.com/477434105621119">Community Guidelines</a>, and Meta&apos;s{" "}
          <a href="https://developers.facebook.com/terms/">Platform Terms</a>.
        </li>
        <li>Only send messages people asked for by commenting, and only links that match what you promised them.</li>
        <li>Not send spam, scams, malware, misleading links, adult content, or anything illegal or harmful.</li>
        <li>Not try to get around Instagram&apos;s limits, or the limits {app} sets to protect your account.</li>
        <li>Handle any personal data you receive through {app} lawfully.</li>
      </ul>

      <h2>Limits and availability</h2>
      <ul>
        <li>
          Instagram decides what can be sent and when. For example, a comment can only be answered privately once and
          within 7 days, and follow-up messages only within 24 hours after the person messages you. {app} works inside
          these rules, so some messages may be delayed or not sent.
        </li>
        <li>{app} spaces messages out and caps how many go out per hour. Sends above the cap wait their turn.</li>
        <li>
          Meta can change or limit its API at any time. Instagram, not {app}, decides whether action is taken on your
          account.
        </li>
        <li>The service may be interrupted for maintenance, outages, or reasons outside our control.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep ownership of the messages, replies and links you create. You let {app} store and send them only to run
        your automations.
      </p>

      <h2>Open-source software</h2>
      <p>
        {app} is open source and provided free of charge, &quot;as is&quot; and without warranties of any kind. To the extent
        the law allows, {site.operator} is not liable for lost data, lost revenue, account restrictions by Instagram, or any
        indirect damages arising from your use of {app}.
      </p>

      <h2>Ending your use</h2>
      <ul>
        <li>
          You can stop at any time with &quot;Disconnect &amp; delete data&quot; in the dashboard, or by removing {app} in your
          Instagram settings. See <Link href="/data-deletion">Data deletion</Link>.
        </li>
        <li>We may suspend accounts that break these terms or put other accounts at risk.</li>
      </ul>

      <h2>Not affiliated with Meta</h2>
      <p>Instagram is a trademark of Meta Platforms, Inc. {app} is not affiliated with, endorsed by, or sponsored by Meta.</p>

      <h2>Changes</h2>
      <p>
        If these terms change, the new version is published on this page with a new &quot;last updated&quot; date. Using {app}{" "}
        after that means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        <ContactLine />. How we handle data is described in the <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
