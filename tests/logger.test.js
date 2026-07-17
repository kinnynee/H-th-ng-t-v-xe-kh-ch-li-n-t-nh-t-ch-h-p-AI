import assert from "node:assert/strict";
import test from "node:test";
import { requestIdFromHeaders, sanitizeLogData } from "@bus-ai/shared/logger";

test("logger redacts credentials and sensitive booking fields recursively", () => {
  const value = sanitizeLogData({
    authorization: "Bearer private-token",
    password: "customer123",
    booking: { guestAccessToken: "private-capability", documentId: "CCCD001" },
    message: "POST /checkout?token=private-token failed with Bearer private-token and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    safe: "visible"
  });

  assert.equal(value.authorization, "[redacted]");
  assert.equal(value.password, "[redacted]");
  assert.equal(value.booking.guestAccessToken, "[redacted]");
  assert.equal(value.booking.documentId, "[redacted]");
  assert.doesNotMatch(value.message, /private-token|eyJhbGci/);
  assert.equal(value.safe, "visible");
});

test("logger accepts safe correlation IDs and replaces invalid input", () => {
  assert.equal(requestIdFromHeaders({ "x-request-id": "request-12345678" }), "request-12345678");
  assert.match(requestIdFromHeaders({ "x-request-id": "<script>alert(1)</script>" }), /^[0-9a-f-]{36}$/);
});
