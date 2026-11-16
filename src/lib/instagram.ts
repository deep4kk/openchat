/**
 * Thin client for the Instagram API with Instagram Login (graph.instagram.com).
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */
import type { Account } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { decrypt, encrypt } from "./crypto";

export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
  }

  /** Token expired, revoked, or the user removed the app: the account must log in again. */
  get isAuth() {
    return this.code === 190 || this.status === 401;
  }

  /** Meta throttling: back off and retry later, never hammer. */
  get isRateLimit() {
    return [4, 17, 32, 613, 80002, 80006].includes(this.code ?? -1) || this.status === 429;
  }

  /** Network failures, Meta-side hiccups. Safe to retry soon. */
  get isTransient() {
    return this.status === 0 || this.status >= 500 || this.code === 1 || this.code === 2;
  }
}

const graph = (path: string) => `https://graph.instagram.com/${env.graphVersion}${path}`;

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new GraphError(`Could not reach Instagram: ${err instanceof Error ? err.message : err}`, 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new GraphError(e.message ?? `Instagram API ${res.status}`, res.status, e.code, e.error_subcode);
  }
  return json as T;
}

// ---------- OAuth ----------

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.igAppId,
    redirect_uri: `${env.appUrl}/api/auth/instagram/callback`,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const form = new URLSearchParams({
    client_id: env.igAppId,
    client_secret: env.igAppSecret,
    grant_type: "authorization_code",
    redirect_uri: `${env.appUrl}/api/auth/instagram/callback`,
    code,
  });
  const short = await call<{ access_token?: string; data?: { access_token: string }[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body: form },
  );
  const shortToken = short.access_token ?? short.data?.[0]?.access_token;
  if (!shortToken) throw new Error("Instagram did not return an access token");

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: env.igAppSecret,
    access_token: shortToken,
  });
  const long = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${params}`,
  );
  return { accessToken: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000) };
}

export type IgProfile = {
  /** App-scoped ID */
  id: string;
  /** Professional account ID; matches webhook entry.id */
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
};

export function getMe(token: string) {
  return call<IgProfile>(
    graph(`/me?fields=id,user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`),
  );
}

/** Subscribes this app to the account's webhooks. Required once per account. */
export function subscribeWebhooks(token: string) {
  const params = new URLSearchParams({
    subscribed_fields: "comments,messages,messaging_postbacks",
    access_token: token,
  });
  return call<{ success: boolean }>(graph(`/me/subscribed_apps?${params}`), { method: "POST" });
}

/** Returns a valid token for the account, refreshing it when it is close to expiry. */
export async function tokenFor(account: Account): Promise<string> {
  const token = decrypt(account.accessToken, env.tokenKey);
  const sevenDays = 7 * 24 * 3600 * 1000;
  if (account.tokenExpiresAt.getTime() - Date.now() > sevenDays) return token;

  let refreshed: { access_token: string; expires_in: number };
  try {
    refreshed = await call(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    );
  } catch (err) {
    // Keep using the current token while it is still valid; retry the refresh next time.
    if (account.tokenExpiresAt.getTime() > Date.now() && !(err instanceof GraphError && err.isAuth)) return token;
    throw err;
  }
  await db.account.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(refreshed.access_token, env.tokenKey),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
}

// ---------- Media ----------

export type IgMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
};

export async function listMedia(token: string, after?: string) {
  const params = new URLSearchParams({
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
    limit: "30",
    access_token: token,
  });
  if (after) params.set("after", after);
  return call<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    graph(`/me/media?${params}`),
  );
}

// ---------- Comments & messages ----------

export function replyToComment(token: string, commentId: string, message: string) {
  return call<{ id: string }>(graph(`/${commentId}/replies`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export type Recipient = { comment_id: string } | { id: string };

export type QuickReply = { content_type: "text"; title: string; payload: string };
export type Button =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

export type OutgoingMessage =
  | { text: string; quick_replies?: QuickReply[] }
  | {
      attachment: {
        type: "template";
        payload: {
          template_type: "generic";
          elements: { title: string; subtitle?: string; image_url?: string; buttons: Button[] }[];
        };
      };
    };

export function sendMessage(token: string, recipient: Recipient, message: OutgoingMessage) {
  return call<{ recipient_id: string; message_id: string }>(graph(`/me/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient, message }),
  });
}

/**
 * Follow check. Meta only allows this after the user has messaged the account
 * (consent), which is why the opening DM asks them to tap a quick reply first.
 */
export function getFollowStatus(token: string, igsid: string) {
  return call<{ username?: string; is_user_follow_business?: boolean }>(
    graph(`/${igsid}?fields=username,is_user_follow_business&access_token=${encodeURIComponent(token)}`),
  );
}
