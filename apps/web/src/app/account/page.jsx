'use client';

import { useState } from 'react';

const history = [
  { code: 'BK001', route: 'Hà Nội - Hải Phòng', date: '2026-06-20', status: 'Đã xác nhận' },
  { code: 'BK002', route: 'Hà Nội - Nam Định', date: '2026-06-25', status: 'Chờ thanh toán' },
];

export default function AccountPage() {
  const [notice, setNotice] = useState('');

  const handleSubmit = (event, mode) => {
    event.preventDefault();
    setNotice(`Đây là form mock cho chức năng ${mode}.`);
    // TODO: Kết nối authentication sau.
  };

  return (
    <main className="page-stack">
      <section className="card">
        <p className="eyebrow">Tài khoản khách hàng</p>
        <h1>Đăng nhập / Đăng ký</h1>
        <p className="muted">TODO: kết nối authentication sau.</p>
        {notice ? <p className="todo-note">{notice}</p> : null}

        <div className="account-grid">
          <form className="form-card" onSubmit={(event) => handleSubmit(event, 'đăng nhập')}>
            <h2>Đăng nhập</h2>
            <label>
              Email
              <input type="email" placeholder="ten@email.com" />
            </label>
            <label>
              Mật khẩu
              <input type="password" placeholder="Nhập mật khẩu" />
            </label>
            <button className="button" type="submit">
              Đăng nhập
            </button>
          </form>

          <form className="form-card" onSubmit={(event) => handleSubmit(event, 'đăng ký')}>
            <h2>Đăng ký</h2>
            <label>
              Họ tên
              <input type="text" placeholder="Nguyen Van A" />
            </label>
            <label>
              Số điện thoại
              <input type="tel" placeholder="0912345678" />
            </label>
            <label>
              Email
              <input type="email" placeholder="ten@email.com" />
            </label>
            <button className="button button--secondary" type="submit">
              Đăng ký
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2>Lịch sử đặt vé mock</h2>
        <div className="list-stack">
          {history.map((item) => (
            <article key={item.code} className="trip-card">
              <div className="trip-card__content">
                <strong>{item.code}</strong>
                <p>{item.route}</p>
              </div>
              <div className="trip-meta">
                <span>{item.date}</span>
                <span>{item.status}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
