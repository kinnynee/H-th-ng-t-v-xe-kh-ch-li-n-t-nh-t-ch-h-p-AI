import test from "node:test";
import assert from "node:assert/strict";
import { buildSchema, parse, validate } from "graphql";
import { createFixedWindowRateLimiter, createGraphQLSecurityRule } from "../services/gateway/src/security.js";
import { isPaymentReplay, normalizePaymentIdempotencyKey, paymentRequestAction } from "../services/booking-service/src/payment.js";
import { protectedRequestHeaders, requireBookingCredential } from "../services/mcp-server/src/access.js";
import { rabbitFailureAction } from "../packages/shared/src/broker.js";
import { isCancellationIntent, isTripSearchIntent } from "../services/ai-service/src/utils/textHelper.js";

test("GraphQL security blocks introspection and alias amplification", () => {
  const schema = buildSchema("type Query { hello: String }");
  const rule = createGraphQLSecurityRule({ maxAliases: 2 });
  assert.match(validate(schema, parse("{ __schema { queryType { name } } }"), [rule])[0].message, /introspection/i);
  const aliases = validate(schema, parse("{ a: hello b: hello c: hello }"), [rule]);
  assert.match(aliases[0].message, /alias limit/i);
});

test("GraphQL fixed-window limiter rejects requests over its configured budget", () => {
  const check = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(check("client", 0).allowed, true);
  assert.equal(check("client", 1).allowed, true);
  assert.equal(check("client", 2).allowed, false);
  assert.equal(check("client", 1_001).allowed, true);
});

test("payment retries replay only the original idempotency key", () => {
  const key = normalizePaymentIdempotencyKey("checkout:12345678");
  assert.equal(key, "checkout:12345678");
  assert.equal(normalizePaymentIdempotencyKey("short"), "");
  assert.equal(isPaymentReplay({ status: "PAYMENT_PROCESSING", paymentIdempotencyKey: key }, key), true);
  assert.equal(isPaymentReplay({ status: "PAID", paymentIdempotencyKey: key }, key), true);
  assert.equal(isPaymentReplay({ status: "TICKET_ISSUED", paymentIdempotencyKey: key }, key), true);
  assert.equal(isPaymentReplay({ status: "TICKET_ISSUED", paymentIdempotencyKey: key }, "checkout:different"), false);
  assert.equal(paymentRequestAction({ status: "PENDING_PAYMENT" }, key), "START");
  assert.equal(paymentRequestAction({ status: "PAYMENT_PROCESSING", paymentIdempotencyKey: key }, key), "RESUME");
  assert.equal(paymentRequestAction({ status: "PAID", paymentIdempotencyKey: key }, key), "ISSUE_TICKETS");
  assert.equal(paymentRequestAction({ status: "TICKET_ISSUED", paymentIdempotencyKey: key }, key), "REPLAY");
  assert.equal(paymentRequestAction({ status: "TICKET_ISSUED", paymentIdempotencyKey: key }, "checkout:different"), "CONFLICT");
});

test("MCP protected tools cannot manufacture authorization", () => {
  assert.deepEqual(protectedRequestHeaders(), {});
  assert.throws(() => requireBookingCredential(), /access token|capability token/i);
  assert.deepEqual(requireBookingCredential({ bookingAccessToken: "guest-capability-token" }), {
    "x-booking-access-token": "guest-capability-token"
  });
});

test("Rabbit failures retry up to the budget and then dead-letter", () => {
  assert.equal(rabbitFailureAction(0, 3, true), "retry");
  assert.equal(rabbitFailureAction(2, 3, true), "retry");
  assert.equal(rabbitFailureAction(3, 3, true), "dead-letter");
  assert.equal(rabbitFailureAction(0, 3, false), "drop");
});

test("Vietnamese trip prompts are not mistaken for cancellation", () => {
  const prompt = "Tìm chuyến từ TP.HCM đến Đà Lạt ngày mai.";
  assert.equal(isTripSearchIntent(prompt), true);
  assert.equal(isCancellationIntent(prompt), false);
  assert.equal(isCancellationIntent("Tôi muốn hủy vé"), true);
});
