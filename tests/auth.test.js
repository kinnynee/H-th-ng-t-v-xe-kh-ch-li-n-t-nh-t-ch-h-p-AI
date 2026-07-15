import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthError,
  authenticate,
  authorize,
  hashPassword,
  issueAccessToken,
  verifyPassword
} from "@bus-ai/shared/auth";

process.env.AUTH_SECRET = "test-auth-secret-that-is-longer-than-thirty-two-bytes";

test("access tokens are signed, expire, and enforce roles", () => {
  const token = issueAccessToken({ id: "customer-1", email: "customer@example.com", role: "CUSTOMER" });
  const user = authenticate({ authorization: `Bearer ${token}` });
  assert.deepEqual(user, { id: "customer-1", email: "customer@example.com", role: "CUSTOMER" });
  assert.throws(() => authorize(user, ["ADMIN"]), AuthError);
  assert.equal(authorize(user, ["CUSTOMER"]).id, "customer-1");

  const expired = issueAccessToken({ id: "customer-1", role: "CUSTOMER" }, { expiresInSeconds: -1 });
  assert.throws(() => authenticate({ authorization: `Bearer ${expired}` }), AuthError);
});

test("passwords are stored as scrypt hashes", async () => {
  const hash = await hashPassword("correct-horse-battery-staple");
  assert.notEqual(hash, "correct-horse-battery-staple");
  assert.equal(await verifyPassword("correct-horse-battery-staple", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});
