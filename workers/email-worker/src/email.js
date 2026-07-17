function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function publicBookingUrl(webUrl, code) {
  return `${String(webUrl || "http://localhost").replace(/\/$/, "")}/booking/${encodeURIComponent(code)}`;
}

/** Builds the notification from the event payload without exposing a guest access capability. */
export function buildTicketEmail(booking, { publicWebUrl } = {}) {
  const bookingUrl = publicBookingUrl(publicWebUrl, booking.code);
  const tickets = Array.isArray(booking.tickets) ? booking.tickets : [];
  const ticketText = tickets.length
    ? tickets.map((ticket) => `- ${ticket.id}: ${ticket.passengerName} (seat ${ticket.seatId})`).join("\n")
    : "Your e-ticket will be available shortly.";
  const ticketHtml = tickets.length
    ? `<ul>${tickets.map((ticket) => `<li><strong>${escapeHtml(ticket.id)}</strong> - ${escapeHtml(ticket.passengerName)}, seat ${escapeHtml(ticket.seatId)}</li>`).join("")}</ul>`
    : "<p>Your e-ticket will be available shortly.</p>";

  return {
    to: booking.customerEmail,
    subject: `E-ticket ${booking.code}`,
    bookingCode: booking.code,
    text: [
      `Your booking ${booking.code} has been paid successfully.`,
      `Route: ${booking.routeName ?? ""}`,
      `Departure: ${booking.departureTime ?? ""}`,
      "",
      "Tickets:",
      ticketText,
      "",
      `Look up your ticket: ${bookingUrl}`,
      "For security, enter this email address to verify the booking."
    ].join("\n"),
    html: `
      <h1>Payment successful</h1>
      <p>Your booking <strong>${escapeHtml(booking.code)}</strong> has been paid successfully.</p>
      <p><strong>Route:</strong> ${escapeHtml(booking.routeName)}</p>
      <p><strong>Departure:</strong> ${escapeHtml(booking.departureTime)}</p>
      <h2>Tickets</h2>
      ${ticketHtml}
      <p><a href="${escapeHtml(bookingUrl)}">Look up your ticket</a></p>
      <p>For security, enter this email address to verify the booking.</p>
    `.trim()
  };
}

function smtpTransportOptions(smtpUrl) {
  const url = new URL(smtpUrl);
  if (!['smtp:', 'smtps:'].includes(url.protocol)) {
    throw new Error("SMTP_URL must use smtp:// or smtps://");
  }
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "smtps:" ? 465 : 587)),
    secure: url.protocol === "smtps:",
    // Docker Desktop commonly resolves SMTP hosts to IPv6 first even when its
    // Linux VM has no IPv6 route. IPv4 keeps outbound SMTP deterministic.
    family: 4,
    auth: {
      user: decodeURIComponent(url.username),
      pass: decodeURIComponent(url.password)
    }
  };
}

/** Sends through SMTP only when it is explicitly configured. */
export async function sendTicketEmail(email, { smtpUrl, smtpFrom, createTransport } = {}) {
  if (!smtpUrl) return { status: "prepared" };
  const factory = createTransport ?? (await import("nodemailer")).createTransport;
  const transport = factory(smtpTransportOptions(smtpUrl));
  const result = await transport.sendMail({
    from: smtpFrom || "no-reply@bus-ai.local",
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html
  });
  return { status: "sent", messageId: result.messageId ?? "" };
}
