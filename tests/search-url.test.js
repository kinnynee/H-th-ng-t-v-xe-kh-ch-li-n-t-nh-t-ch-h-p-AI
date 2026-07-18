import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAdvancedSearch,
  searchFormFromSearch,
  searchFormToSearch,
  searchFormUrl
} from "../apps/web/src/lib/search-url.js";

const defaults = {
  from: "TP.HCM",
  to: "Đà Lạt",
  date: "2026-07-18",
  sort: "DEPARTURE_ASC",
  timeFrom: "",
  timeTo: "",
  maxPrice: "",
  operator: "",
  busType: "",
  minSeats: ""
};

test("search URL preserves every autocomplete, filter and sort value", () => {
  const form = {
    ...defaults,
    sort: "PRICE_ASC",
    timeFrom: "08:30",
    timeTo: "22:00",
    maxPrice: "450000",
    operator: "operator-phuong-trang",
    busType: "Limousine 22 chỗ",
    minSeats: "2"
  };

  const query = searchFormToSearch(form);
  assert.deepEqual(searchFormFromSearch(query, defaults), form);
  assert.match(searchFormUrl("/", form), /^\/\?from=TP\.HCM&to=/);
  assert.equal(hasAdvancedSearch(form), true);
});

test("search URL falls back safely for invalid typed filter values", () => {
  const restored = searchFormFromSearch(
    "?from=TP.HCM&to=%C4%90%C3%A0+L%E1%BA%A1t&date=invalid&sort=UNKNOWN&timeFrom=99%3A99&maxPrice=-1&minSeats=abc",
    defaults
  );

  assert.equal(restored.from, "TP.HCM");
  assert.equal(restored.to, "Đà Lạt");
  assert.equal(restored.date, defaults.date);
  assert.equal(restored.sort, defaults.sort);
  assert.equal(restored.timeFrom, defaults.timeFrom);
  assert.equal(restored.maxPrice, defaults.maxPrice);
  assert.equal(restored.minSeats, defaults.minSeats);
});

test("default search remains a non-advanced search", () => {
  assert.equal(hasAdvancedSearch(defaults), false);
});
