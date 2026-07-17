import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Guests receive this unguessable capability only at checkout time.  The
 * database holds its digest, never the capability itself.
 */
export function createGuestAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function hashGuestAccessToken(token) {
  if (typeof token !== "string" || token.length < 32) return "";
  return createHash("sha256").update(token).digest("base64url");
}

export function verifiesGuestAccessToken(token, expectedHash, expiresAt, now = Date.now()) {
  if (!expiresAt || Date.parse(expiresAt) <= now) return false;
  const actualHash = hashGuestAccessToken(token);
  if (!actualHash || typeof expectedHash !== "string") return false;
  const actual = Buffer.from(actualHash);
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
