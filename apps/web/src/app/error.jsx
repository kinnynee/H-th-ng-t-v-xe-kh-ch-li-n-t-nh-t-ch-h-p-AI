"use client";

import { useEffect } from "react";
import { reportClientError } from "../lib/observability";

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { category: "render" });
  }, [error]);

  return (
    <main className="page">
      <section className="panel" role="alert">
        <div className="panel-header">
          <h1>Đã xảy ra lỗi</h1>
          <p>Lỗi đã được ghi nhận. Vui lòng thử lại hoặc quay về trang tìm chuyến.</p>
        </div>
        <div className="panel-body">
          <button className="primary-button" onClick={() => reset()}>Thử lại</button>
        </div>
      </section>
    </main>
  );
}
