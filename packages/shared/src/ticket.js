import QRCode from "qrcode";
import PDFDocument from "pdfkit";

const checkInPolicy = "Xuất trình QR cho nhân viên trước giờ khởi hành ít nhất 30 phút. QR chỉ được dùng một lần để check-in.";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function ticketQrPayload(bookingCode, ticket) {
  return ticket?.qrPayload || `${bookingCode}-${ticket?.id ?? ""}`;
}

export async function createTicketQrDataUrl(payload) {
  return QRCode.toDataURL(String(payload), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#172033", light: "#ffffff" }
  });
}

export async function createTicketQrPng(payload) {
  return QRCode.toBuffer(String(payload), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#172033", light: "#ffffff" }
  });
}

/** Renders a self-contained, printable ticket with a scannable staff check-in QR. */
export async function renderTicketHtml(booking) {
  const tickets = await Promise.all((booking.tickets ?? []).map(async (ticket) => {
    const qrPayload = ticketQrPayload(booking.code, ticket);
    const qrCodeDataUrl = await createTicketQrDataUrl(qrPayload);
    return `
      <article class="ticket">
        <div class="ticket__details">
          <p><strong>Họ tên hành khách:</strong> ${escapeHtml(ticket.passengerName)}</p>
          <p><strong>Mã vé:</strong> ${escapeHtml(ticket.id)}</p>
          <p><strong>Số ghế:</strong> ${escapeHtml(ticket.seatId)}</p>
          <p><strong>Mã QR check-in:</strong> <code>${escapeHtml(qrPayload)}</code></p>
        </div>
        <img class="ticket__qr" src="${qrCodeDataUrl}" alt="QR check-in ${escapeHtml(ticket.id)}" width="220" height="220" />
      </article>`;
  }));
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vé điện tử ${escapeHtml(booking.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #172033; background: #f8fafc; }
    main { max-width: 760px; margin: auto; background: #fff; border: 1px solid #d9dee8; padding: 24px; border-radius: 12px; }
    h1 { color: #087f7a; margin-top: 0; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; }
    .meta p, .ticket p { margin: 6px 0; }
    .ticket { display: flex; justify-content: space-between; gap: 20px; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px; }
    .ticket__qr { border: 8px solid #fff; box-shadow: 0 0 0 1px #d9dee8; border-radius: 6px; background: #fff; }
    .policy { margin-top: 22px; padding: 14px; background: #ecfdf5; border-radius: 8px; }
    code { overflow-wrap: anywhere; }
    @media (max-width: 560px) { body { margin: 12px; } .meta { grid-template-columns: 1fr; } .ticket { align-items: flex-start; flex-direction: column; } }
    @media print { body { margin: 0; background: #fff; } main { border: 0; } }
  </style>
</head>
<body>
  <main>
    <h1>Vé điện tử</h1>
    <div class="meta">
      <p><strong>Mã booking:</strong> ${escapeHtml(booking.code)}</p>
      <p><strong>Tuyến xe:</strong> ${escapeHtml(booking.routeName)}</p>
      <p><strong>Điểm đón:</strong> ${escapeHtml(booking.pickup)}</p>
      <p><strong>Điểm trả:</strong> ${escapeHtml(booking.dropoff)}</p>
      <p><strong>Ngày giờ khởi hành:</strong> ${escapeHtml(new Date(booking.departureTime).toLocaleString("vi-VN"))}</p>
      <p><strong>Biển số/mã xe:</strong> ${escapeHtml(booking.vehiclePlate)}</p>
    </div>
    ${tickets.join("")}
    <p class="policy"><strong>Chính sách check-in:</strong> ${escapeHtml(checkInPolicy)}</p>
  </main>
</body>
</html>`;
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function writePdfField(document, label, value) {
  document.font("Helvetica-Bold").text(pdfText(label), { continued: true });
  document.font("Helvetica").text(` ${pdfText(value)}`);
}

/** Produces a printable PDF with a distinct scannable QR image for every ticket. */
export async function renderTicketPdf(booking) {
  const document = new PDFDocument({ size: "A4", margin: 42, info: { Title: `E-ticket ${booking.code}` } });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", resolve);
    document.on("error", reject);
  });

  document.fillColor("#087f7a").font("Helvetica-Bold").fontSize(22).text("VE DIEN TU");
  document.fillColor("#172033").fontSize(11);
  writePdfField(document, "Ma booking:", booking.code);
  writePdfField(document, "Tuyen xe:", booking.routeName);
  writePdfField(document, "Diem don:", booking.pickup);
  writePdfField(document, "Diem tra:", booking.dropoff);
  writePdfField(document, "Khoi hanh:", new Date(booking.departureTime).toLocaleString("vi-VN"));
  writePdfField(document, "Bien so/ma xe:", booking.vehiclePlate);

  for (const [index, ticket] of (booking.tickets ?? []).entries()) {
    if (document.y > 560) document.addPage();
    document.moveDown(0.7).strokeColor("#d9dee8").moveTo(42, document.y).lineTo(553, document.y).stroke().moveDown(0.7);
    document.font("Helvetica-Bold").fontSize(15).fillColor("#087f7a").text(`VE ${index + 1}`);
    document.fillColor("#172033").fontSize(11);
    writePdfField(document, "Ho ten hanh khach:", ticket.passengerName);
    writePdfField(document, "Ma ve:", ticket.id);
    writePdfField(document, "So ghe:", ticket.seatId);
    const qrPayload = ticketQrPayload(booking.code, ticket);
    writePdfField(document, "Ma QR check-in:", qrPayload);
    const qrPng = await createTicketQrPng(qrPayload);
    const qrY = document.y + 8;
    document.image(qrPng, 373, qrY, { width: 138, height: 138 });
    document.y = Math.max(document.y, qrY + 150);
  }

  document.moveDown(0.4).fillColor("#087f7a").font("Helvetica-Bold").text("CHINH SACH CHECK-IN");
  document.fillColor("#172033").font("Helvetica").text(pdfText(checkInPolicy));
  document.end();
  await completed;
  return Buffer.concat(chunks);
}

export { checkInPolicy };
