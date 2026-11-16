import { requireAccount } from "@/lib/session";
import { defaults } from "@/lib/automation-schema";
import { Topbar } from "@/components/Topbar";
import { ImportForm } from "@/components/ImportForm";

export const metadata = { title: "Import automations" };

export default async function ImportAutomations() {
  const account = await requireAccount();
  return (
    <main className="container">
      <Topbar account={account} />
      <h1 style={{ marginBottom: 20 }}>Import automations</h1>
      <ImportForm
        username={account.username}
        initial={{
          triggerType: "ANY_COMMENT",
          keywords: [],
          publicReplyEnabled: defaults.publicReplyEnabled,
          publicReplies: defaults.publicReplies,
          openingMessage: defaults.openingMessage,
          openingButton: defaults.openingButton,
        }}
      />
    </main>
  );
}
