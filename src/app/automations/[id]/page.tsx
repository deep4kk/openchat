import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/session";
import { parseAutomation } from "@/lib/automation-schema";
import { Topbar } from "@/components/Topbar";
import { AutomationForm } from "@/components/AutomationForm";
import { RunsTable } from "@/components/RunsTable";

export const dynamic = "force-dynamic";

export default async function EditAutomation({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  const { id } = await params;
  const row = await db.automation.findFirst({ where: { id, accountId: account.id } });
  if (!row) notFound();

  const a = parseAutomation(row);
  const runs = await db.run.findMany({ where: { automationId: id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <main className="container">
      <Topbar account={account} />
      <h1 style={{ marginBottom: 20 }}>{a.name}</h1>
      <AutomationForm
        id={a.id}
        username={account.username}
        initial={{
          name: a.name,
          active: a.active,
          mediaScope: a.mediaScope as "SPECIFIC_MEDIA" | "ALL_MEDIA",
          mediaIds: a.mediaIds,
          mediaPreview: a.mediaPreview,
          triggerType: a.triggerType as "KEYWORDS" | "ANY_COMMENT",
          keywords: a.keywords,
          publicReplyEnabled: a.publicReplyEnabled,
          publicReplies: a.publicReplies,
          openingMessage: a.openingMessage,
          openingButton: a.openingButton,
          askToFollow: a.askToFollow,
          followMessage: a.followMessage,
          followVisitLabel: a.followVisitLabel,
          followConfirmLabel: a.followConfirmLabel,
          followMaxAttempts: a.followMaxAttempts,
          followOnFail: a.followOnFail as "SEND_ANYWAY" | "STOP",
          linkMessage: a.linkMessage,
          linkUrl: a.linkUrl,
          linkButtonLabel: a.linkButtonLabel,
          oncePerUser: a.oncePerUser,
        }}
      />
      <section className="card stack" style={{ marginTop: 20 }}>
        <h2>Activity</h2>
        <RunsTable runs={runs} />
      </section>
    </main>
  );
}
