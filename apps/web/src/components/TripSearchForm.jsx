'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TripSearchForm() {
  const router = useRouter();
  const [form, setForm] = useState({ from: '', to: '', date: '' });
  const [message, setMessage] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setMessage(
      `Bạn đã nhập: ${form.from || '...'} - ${form.to || '...'} | ${form.date || '...'}`
    );
    // TODO: Kết nối GraphQL searchTrips sau.
    // Tạm thời điều hướng giả lập để thấy luồng tìm chuyến.
    if (form.from && form.to) {
      router.push(`/routes/${encodeURIComponent(form.from)}/${encodeURIComponent(form.to)}`);
    }
  };

  return (
    <div className="search-block">
      <form className="search-form" onSubmit={handleSubmit}>
        <label>
          Điểm đi
          <input name="from" value={form.from} onChange={handleChange} placeholder="Hà Nội" />
        </label>
        <label>
          Điểm đến
          <input name="to" value={form.to} onChange={handleChange} placeholder="Hải Phòng" />
        </label>
        <label>
          Ngày đi
          <input name="date" type="date" value={form.date} onChange={handleChange} />
        </label>
        <button className="button" type="submit">
          Tìm chuyến
        </button>
      </form>
      {message ? <p className="search-note">{message}</p> : null}
    </div>
  );
}
