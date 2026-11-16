import type { AutomationInput } from "@/lib/automation-schema";

/** Static mock of what the commenter sees, updated live from the form. */
export function DmPreview({ v, username }: { v: AutomationInput; username: string }) {
  return (
    <div className="phone">
      <div className="phone-head">@{username}</div>
      <div className="thread">
        <div className="divider">Comment</div>
        <div className="bubble me">{v.triggerType === "KEYWORDS" ? v.keywords[0] ?? "keyword" : "Love this!"}</div>
        {v.publicReplyEnabled && v.publicReplies[0] && <div className="bubble them small">↳ {v.publicReplies[0]}</div>}

        <div className="divider">DM</div>
        <div className="bubble them">{v.openingMessage}</div>
        <div className="quick">{v.openingButton}</div>

        {v.askToFollow && (
          <>
            <div className="divider">If not following</div>
            <div className="bubble-card">
              <div className="title">{v.followMessage}</div>
              <div className="cbtn">{v.followVisitLabel}</div>
              <div className="cbtn">{v.followConfirmLabel}</div>
            </div>
          </>
        )}

        <div className="divider">{v.askToFollow ? "Once following" : "After tap"}</div>
        <div className="bubble-card">
          <div className="title">{v.linkMessage}</div>
          <div className="cbtn">{v.linkButtonLabel}</div>
        </div>
      </div>
    </div>
  );
}
