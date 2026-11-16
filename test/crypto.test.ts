import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { decrypt, encrypt, parseSignedRequest, verifyMetaSignature } from "../src/lib/crypto.ts";

test("token encryption round-trips and rejects the wrong key", () => {
  const box = encrypt("secret-token", "k1");
  assert.equal(decrypt(box, "k1"), "secret-token");
  assert.throws(() => decrypt(box, "k2"));
});

test("webhook signature check", () => {
  const body = '{"object":"instagram"}';
  const sig = createHmac("sha256", "s").update(body).digest("hex");
  assert.equal(verifyMetaSignature(body, `sha256=${sig}`, "s"), true);
  assert.equal(verifyMetaSignature(body, `sha256=${sig}`, "other"), false);
  assert.equal(verifyMetaSignature(body, null, "s"), false);
});

test("Meta signed_request parsing (deauthorize / data deletion)", () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" })).toString("base64url");
  const sig = createHmac("sha256", "s").update(payload).digest("base64url");
  assert.deepEqual(parseSignedRequest(`${sig}.${payload}`, "s")?.user_id, "123");
  assert.equal(parseSignedRequest(`${sig}.${payload}`, "wrong"), null);
  assert.equal(parseSignedRequest("garbage", "s"), null);
  assert.equal(parseSignedRequest(null, "s"), null);
});
