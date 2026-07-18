export const SEARCH_FORM_FIELDS = [
  "from",
  "to",
  "date",
  "sort",
  "timeFrom",
  "timeTo",
  "maxPrice",
  "operator",
  "busType",
  "minSeats"
];

const SORT_MODES = new Set(["DEPARTURE_ASC", "PRICE_ASC", "DURATION_ASC"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

function normalizedValue(key, value, fallback) {
  const next = String(value ?? "").trim();
  if (key === "sort") return SORT_MODES.has(next) ? next : fallback;
  if (key === "date") return DATE_PATTERN.test(next) ? next : fallback;
  if (key === "timeFrom" || key === "timeTo") return !next || TIME_PATTERN.test(next) ? next : fallback;
  if (key === "maxPrice" || key === "minSeats") {
    return !next || NON_NEGATIVE_INTEGER_PATTERN.test(next) ? next : fallback;
  }
  return next;
}

export function searchFormFromSearch(search, defaults) {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  return Object.fromEntries(
    SEARCH_FORM_FIELDS.map((key) => {
      const fallback = String(defaults[key] ?? "");
      const value = params.has(key) ? params.get(key) : fallback;
      return [key, normalizedValue(key, value, fallback)];
    })
  );
}

export function searchFormToSearch(form) {
  const params = new URLSearchParams();
  for (const key of SEARCH_FORM_FIELDS) {
    const value = String(form[key] ?? "").trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function searchFormUrl(pathname, form) {
  const query = searchFormToSearch(form);
  return query ? `${pathname}?${query}` : pathname;
}

export function hasAdvancedSearch(form) {
  return Boolean(
    form.timeFrom ||
    form.timeTo ||
    form.maxPrice ||
    form.operator ||
    form.busType ||
    form.minSeats ||
    form.sort !== "DEPARTURE_ASC"
  );
}
