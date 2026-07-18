"use client";

import { useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { gql } from "../lib/graphql";

const ASK = `
mutation Ask($message: String!, $bookingCode: String, $email: String) {
  askAssistant(message: $message, bookingCode: $bookingCode, email: $email) {
    answer
    sources
    toolCalls
    dataOrigin
  }
}`;

const ORIGIN_LABELS = {
  LIVE_TRIP_DATA: "Dữ liệu trực tiếp từ hệ thống chuyến",
  LIVE_BOOKING_DATA: "Dữ liệu booking đã xác minh",
  LIVE_TOOL_DATA: "Dữ liệu trực tiếp từ công cụ nội bộ",
  INTERNAL_POLICY: "Chính sách nội bộ",
  AI_GUIDANCE: "Hướng dẫn từ AI",
  GUIDANCE: "Hướng dẫn sử dụng",
  VALIDATION: "Yêu cầu bổ sung thông tin",
  TOOL_ERROR: "Thông báo lỗi công cụ",
  MIXED: "Phản hồi nhiều nội dung và nguồn"
};

export default function ChatWidget({ bookingCode = "", email = "" }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([
    {
      role: "bot",
      text: "Mình có thể tìm chuyến, trả lời chính sách và tra cứu booking khi bạn cung cấp đúng mã booking cùng email đặt vé. Dữ liệu thực tế luôn được ghi rõ nguồn."
    }
  ]);

  async function send() {
    const text = message.trim();
    if (!text || busy) return;
    setMessage("");
    setLog((items) => [...items, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await gql(ASK, { message: text, bookingCode, email }, { bookingCode });
      const suffix = data.askAssistant.sources.length ? `\nNguồn: ${data.askAssistant.sources.join(", ")}` : "";
      const origin = ORIGIN_LABELS[data.askAssistant.dataOrigin] ?? data.askAssistant.dataOrigin;
      setLog((items) => [...items, { role: "bot", text: `${data.askAssistant.answer}\nLoại dữ liệu: ${origin}${suffix}` }]);
    } catch (error) {
      setLog((items) => [...items, { role: "bot", text: error.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <section className="chat-box" aria-label="AI chatbot">
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Trợ lý AI</strong>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Đóng chat">
              <X size={18} />
            </button>
          </div>
          <div className="chat-log">
            {log.map((item, index) => (
              <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}>
                {item.text}
              </div>
            ))}
          </div>
          <div className="panel-body" style={{ display: "grid", gridTemplateColumns: "1fr 44px", gap: 8 }}>
            <input
              className="input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && send()}
              placeholder="Tối mai có xe Sài Gòn đi Đà Lạt không?"
            />
            <button className="icon-button" onClick={send} disabled={busy} aria-label="Gửi">
              <Send size={18} />
            </button>
          </div>
        </section>
      )}
      <button className="primary-button chat-fab" onClick={() => setOpen((value) => !value)}>
        <Bot size={18} /> Chat
      </button>
    </>
  );
}
