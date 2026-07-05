'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const initialForm = { from: '', to: '', date: '' };

function validateForm(form) {
  const errors = {};
  const from = form.from.trim();
  const to = form.to.trim();

  if (!from) errors.from = 'Vui lòng nhập điểm đi.';
  if (!to) errors.to = 'Vui lòng nhập điểm đến.';
  if (!form.date) errors.date = 'Vui lòng chọn ngày đi.';
  if (from && to && from.toLocaleLowerCase('vi-VN') === to.toLocaleLowerCase('vi-VN')) {
    errors.to = 'Điểm đến phải khác điểm đi.';
  }

  return errors;
}

export default function TripSearchForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const errors = validateForm(form);
  const isValid = Object.keys(errors).length === 0;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isValid) return;

    const from = encodeURIComponent(form.from.trim());
    const to = encodeURIComponent(form.to.trim());
    const date = encodeURIComponent(form.date);

    router.push(`/routes/${from}/${to}?date=${date}&sort=time`);
  };

  return (
    <div className="search-block">
      <form className="search-form" onSubmit={handleSubmit}>
        <label>
          Điểm đi
          <input
            aria-invalid={Boolean(errors.from)}
            aria-describedby="from-error"
            name="from"
            value={form.from}
            onChange={handleChange}
            placeholder="Hà Nội"
          />
          {errors.from ? (
            <span className="field-error" id="from-error">
              {errors.from}
            </span>
          ) : null}
        </label>
        <label>
          Điểm đến
          <input
            aria-invalid={Boolean(errors.to)}
            aria-describedby="to-error"
            name="to"
            value={form.to}
            onChange={handleChange}
            placeholder="Hải Phòng"
          />
          {errors.to ? (
            <span className="field-error" id="to-error">
              {errors.to}
            </span>
          ) : null}
        </label>
        <label>
          Ngày đi
          <input
            aria-invalid={Boolean(errors.date)}
            aria-describedby="date-error"
            name="date"
            type="date"
            value={form.date}
            onChange={handleChange}
          />
          {errors.date ? (
            <span className="field-error" id="date-error">
              {errors.date}
            </span>
          ) : null}
        </label>
        <button className="button" type="submit" disabled={!isValid}>
          Tìm chuyến
        </button>
      </form>
    </div>
  );
}
