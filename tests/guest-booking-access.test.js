import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuestAccessToken,
  hashGuestAccessToken,
  verifiesGuestAccessToken
} from "../services/booking-service/src/guest-access.js";

test("guest booking access capabilities are unguessable and verified without persisting the raw token", () => {
  const token = createGuestAccessToken();
  const hash = hashGuestAccessToken(token);

  assert.ok(token.length >= 32);
  assert.notEqual(hash, token);
  assert.equal(verifiesGuestAccessToken(token, hash), true);
  assert.equal(verifiesGuestAccessToken(createGuestAccessToken(), hash), false);
  assert.equal(verifiesGuestAccessToken("", hash), false);
});
