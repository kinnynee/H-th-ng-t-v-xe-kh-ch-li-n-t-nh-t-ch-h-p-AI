import assert from "node:assert/strict";
import test from "node:test";
import { fold, routeFromText, dateFromText, isTripSearchIntent } from "../services/ai-service/src/utils/textHelper.js";
import { isoDate } from "@bus-ai/shared/seed";

test("fold() removes accents and lowercases string", () => {
  assert.equal(fold("Sài Gòn"), "sai gon");
  assert.equal(fold("Vũng Tàu"), "vung tau");
  assert.equal(fold("Đà Lạt"), "da lat");
});

test("routeFromText() extracts from and to", () => {
  assert.deepEqual(routeFromText("tôi muốn đi từ sài gòn đến đà lạt"), { from: "TP.HCM", to: "Đà Lạt" });
  assert.deepEqual(routeFromText("xe hcm nha trang"), { from: "TP.HCM", to: "Nha Trang" });
  assert.deepEqual(routeFromText("vé đi hà nội"), { from: "", to: "Hà Nội" });
});

test("dateFromText() resolves correct relative dates", () => {
  assert.equal(dateFromText("cho mình đi hôm nay"), isoDate(0));
  assert.equal(dateFromText("mai đi"), isoDate(1));
  assert.equal(dateFromText("ngày kia nhé"), isoDate(2));
});

test("isTripSearchIntent() accurately identifies search intent", () => {
  // Has route + trip keyword
  assert.equal(isTripSearchIntent("có chuyến nào đi sài gòn đà lạt không"), true);
  // Has route + time keyword
  assert.equal(isTripSearchIntent("mấy giờ có xe hcm cần thơ"), true);
  // Has route + relative day
  assert.equal(isTripSearchIntent("mai đi nha trang"), true);
  
  // Missing route
  assert.equal(isTripSearchIntent("chuyến đi lúc mấy giờ"), false);
  // Missing intent keyword but has route (should be false, unless it has a day keyword)
  assert.equal(isTripSearchIntent("thời tiết đà lạt"), false);
});
