import { requireAccount } from "@/lib/session";
import { defaults } from "@/lib/automation-schema";
import { Topbar } from "@/components/Topbar";
import { AutomationForm } from "@/components/AutomationForm";

export default async function NewAutomation() {
  const account = await requireAccount();
  return (
    <main className="container">
      <Topbar account={account} />
      <h1 style={{ marginBottom: 20 }}>New automation</h1>
      <AutomationForm initial={defaults} username={account.username} />
    </main>
  );
}
