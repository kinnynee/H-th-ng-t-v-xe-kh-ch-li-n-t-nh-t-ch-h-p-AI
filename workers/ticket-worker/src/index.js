import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";

function ticketHtml(booking) {
  const tickets = booking.tickets
    .map(
      (ticket) => `
        <article class="ticket">
          <h2>${ticket.passengerName}</h2>
          <p>Ghế: <strong>${ticket.seatId}</strong></p>
          <p>Mã vé: ${ticket.id}</p>
          <p>QR mô phỏng: ${ticket.qrPayload}</p>
        </article>`
    )
    .join("");
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Vé điện tử ${booking.code}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
    .wrap { max-width: 760px; margin: auto; border: 1px solid #d1d5db; padding: 24px; }
    h1 { color: #0f766e; margin-top: 0; }
    .ticket { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px; }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Vé điện tử ${booking.code}</h1>
    <p>Tuyến: ${booking.routeName}</p>
    <p>Khởi hành: ${new Date(booking.departureTime).toLocaleString("vi-VN")}</p>
    <p>Điểm đón: ${booking.pickup}</p>
    <p>Điểm trả: ${booking.dropoff}</p>
    <p>Biển số xe: ${booking.vehiclePlate}</p>
    ${tickets}
    <p>Chính sách check-in: có mặt trước giờ khởi hành tối thiểu 30 phút.</p>
  </main>
</body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function simpleTicketPdf(booking) {
  const lines = [
    `Ve dien tu ${booking.code}`,
    `Tuyen: ${booking.routeName}`,
    `Khoi hanh: ${new Date(booking.departureTime).toLocaleString("vi-VN")}`,
    `Diem don: ${booking.pickup}`,
    `Diem tra: ${booking.dropoff}`,
    `Bien so xe: ${booking.vehiclePlate}`,
    ...booking.tickets.map((ticket) => `${ticket.id} - ${ticket.passengerName} - Ghe ${ticket.seatId} - QR ${ticket.qrPayload}`),
    "Check-in truoc gio khoi hanh toi thieu 30 phut."
  ];
  const text = lines.map((line, index) => `BT /F1 12 Tf 50 ${760 - index * 22} Td (${pdfEscape(pdfText(line))}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(text, "utf8")} >> stream\n${text}\nendstream endobj`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return body;
}

await subscribeRabbit("ticket-worker.booking-paid", ["booking.paid"], async (event) => {
  const booking = event.payload;
  const outDir = path.resolve("data/generated-tickets");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${booking.code}.html`), ticketHtml(booking), "utf8");
  await writeFile(path.join(outDir, `${booking.code}.pdf`), simpleTicketPdf(booking), "utf8");
  console.log(`[ticket-worker] generated ticket HTML/PDF for ${booking.code}`);
});

console.log("[ticket-worker] started");
