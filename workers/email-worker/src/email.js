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

function vietnameseDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

function vietnameseMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

/** Only guests receive this notification; registered customers use their account history. */
export function isGuestTicketEmailEligible(booking) {
  return !String(booking?.userId ?? "").trim()
    && Boolean(String(booking?.customerEmail ?? "").trim())
    && booking?.status === "TICKET_ISSUED"
    && Array.isArray(booking?.tickets)
    && booking.tickets.length > 0;
}

/** Builds the notification from the event payload without exposing a guest access capability. */
export function buildTicketEmail(booking, { publicWebUrl } = {}) {
  const bookingUrl = publicBookingUrl(publicWebUrl, booking.code);
  const tickets = Array.isArray(booking.tickets) ? booking.tickets : [];
  const ticketText = tickets.length
    ? tickets.map((ticket) => `- ${ticket.id}: ${ticket.passengerName} (ghế ${ticket.seatId})`).join("\n")
    : "Vé điện tử đang được chuẩn bị.";
  const ticketHtml = tickets.length
    ? `<ul>${tickets.map((ticket) => `<li><strong>${escapeHtml(ticket.id)}</strong> - ${escapeHtml(ticket.passengerName)}, ghế ${escapeHtml(ticket.seatId)}</li>`).join("")}</ul>`
    : "<p>Vé điện tử đang được chuẩn bị.</p>";
  const departureTime = vietnameseDateTime(booking.departureTime);
  const totalAmount = vietnameseMoney(booking.totalAmount);

  return {
    to: booking.customerEmail,
    subject: `[Bus AI] Vé điện tử ${booking.code} đã được xuất`,
    bookingCode: booking.code,
    text: [
      "Xin chào quý khách,",
      "",
      `Booking ${booking.code} đã thanh toán thành công và vé điện tử đã được xuất.`,
      `Tuyến: ${booking.routeName ?? ""}`,
      `Khởi hành: ${departureTime}`,
      `Điểm đón: ${booking.pickup ?? ""}`,
      `Điểm trả: ${booking.dropoff ?? ""}`,
      ...(totalAmount ? [`Tổng tiền: ${totalAmount}`] : []),
      "",
      "Danh sách vé:",
      ticketText,
      "",
      `Tra cứu vé: ${bookingUrl}`,
      "Vì lý do bảo mật, vui lòng nhập đúng email nhận vé khi tra cứu.",
      "Vé PDF có mã QR check-in được đính kèm trong email này."
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6;max-width:680px;margin:auto">
      <h1 style="color:#087f7a">Vé điện tử đã được xuất</h1>
      <p>Xin chào quý khách, booking <strong>${escapeHtml(booking.code)}</strong> đã thanh toán thành công.</p>
      <p><strong>Tuyến:</strong> ${escapeHtml(booking.routeName)}</p>
      <p><strong>Khởi hành:</strong> ${escapeHtml(departureTime)}</p>
      <p><strong>Điểm đón:</strong> ${escapeHtml(booking.pickup)}</p>
      <p><strong>Điểm trả:</strong> ${escapeHtml(booking.dropoff)}</p>
      ${totalAmount ? `<p><strong>Tổng tiền:</strong> ${escapeHtml(totalAmount)}</p>` : ""}
      <h2>Danh sách vé</h2>
      ${ticketHtml}
      <p><a style="display:inline-block;background:#087f7a;color:white;text-decoration:none;padding:10px 16px;border-radius:6px" href="${escapeHtml(bookingUrl)}">Tra cứu vé</a></p>
      <p>Vé PDF có mã QR check-in được đính kèm trong email. Vì lý do bảo mật, vui lòng nhập đúng email nhận vé khi tra cứu.</p>
      </div>
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
export async function sendTicketEmail(email, { smtpUrl, smtpFrom, ticketPdf, createTransport } = {}) {
  if (!smtpUrl) return { status: "prepared" };
  const factory = createTransport ?? (await import("nodemailer")).createTransport;
  const transport = factory(smtpTransportOptions(smtpUrl));
  const result = await transport.sendMail({
    from: smtpFrom || "no-reply@bus-ai.local",
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    ...(ticketPdf ? {
      attachments: [{
        filename: `ve-${email.bookingCode}.pdf`,
        content: ticketPdf,
        contentType: "application/pdf"
      }]
    } : {})
  });
  return { status: "sent", messageId: result.messageId ?? "" };
}
