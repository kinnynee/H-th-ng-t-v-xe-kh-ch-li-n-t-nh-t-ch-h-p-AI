function normalizedId(value) {
  return String(value ?? "").trim();
}

function normalizedEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveCheckoutCustomer({ requestedUserId, user }) {
  const requested = normalizedId(requestedUserId);
  const isCustomer = user?.role === "CUSTOMER" && normalizedId(user.id);
  if (requested && (!isCustomer || normalizedId(user.id) !== requested)) {
    return {
      ok: false,
      userId: "",
      message: "A booking can only be created for the authenticated customer."
    };
  }
  return { ok: true, userId: isCustomer ? normalizedId(user.id) : "", message: "" };
}

export function guestBookingEmailMatches(booking, candidateEmail) {
  const expected = normalizedEmail(booking?.customerEmail);
  const candidate = normalizedEmail(candidateEmail);
  return Boolean(expected && candidate && expected === candidate);
}
