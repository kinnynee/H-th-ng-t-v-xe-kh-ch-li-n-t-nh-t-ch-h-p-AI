'use client';

import { useState } from 'react';

const initialMessages = [
  { id: 1, role: 'bot', text: 'Xin chào, tôi là chatbot demo.' },
  { id: 2, role: 'bot', text: 'Hãy nhập câu hỏi về chuyến đi hoặc đặt vé.' },
];

export default function ChatWidget() {
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!value.trim()) return;

    const nextMessages = [
      ...messages,
      { id: Date.now(), role: 'user', text: value.trim() },
      { id: Date.now() + 1, role: 'bot', text: 'Đây là phản hồi mock. TODO: kết nối AI chatbot service sau.' },
    ];

    setMessages(nextMessages);
    setValue('');
    // TODO: Kết nối AI chatbot service sau.
  };

  return (
    <aside className="chat-widget" aria-label="Chat hỗ trợ">
      <div className="chat-widget__header">
        <strong>Chat hỗ trợ</strong>
        <span>Mock</span>
      </div>
      <div className="chat-widget__messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message chat-message--${message.role}`}>
            {message.text}
          </div>
        ))}
      </div>
      <form className="chat-widget__form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Nhập câu hỏi..."
        />
        <button className="button" type="submit">
          Gửi
        </button>
      </form>
    </aside>
  );
}
