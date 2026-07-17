"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock3, Info, Route, ShieldCheck } from "lucide-react";
import SiteChrome from "../../components/SiteChrome";
import { gql } from "../../lib/graphql";

const ROUTE_POLICIES = `
query RoutePolicies {
  routes {
    id from to pickup dropoff cancellationPolicy
  }
}`;

export default function CancellationPolicyPage() {
  const [routes, setRoutes] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    gql(ROUTE_POLICIES)
      .then((data) => setRoutes(data.routes))
      .catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <SiteChrome>
      <main className="page stack policy-page">
        <section className="policy-hero">
          <div>
            <span className="customer-eyebrow">QUYỀN LỢI HÀNH KHÁCH</span>
            <h1>Chính sách hủy vé</h1>
            <p>Kiểm tra điều kiện hoàn tiền trước khi đặt vé. Chính sách của từng tuyến được lưu cùng booking và không thay đổi sau khi thanh toán.</p>
          </div>
          <ShieldCheck size={62} aria-hidden="true" />
        </section>

        <section className="policy-principles" aria-label="Nguyên tắc hủy vé">
          <article className="policy-principle">
            <Clock3 size={22} />
            <div><strong>Trước giờ khởi hành</strong><p>Mức hoàn tiền và phí hủy được tính theo thời gian còn lại và chính sách của tuyến.</p></div>
          </article>
          <article className="policy-principle">
            <Ban size={22} />
            <div><strong>Sau giờ khởi hành</strong><p>Vé không còn đủ điều kiện hủy và không được hoàn tiền.</p></div>
          </article>
          <article className="policy-principle">
            <CheckCircle2 size={22} />
            <div><strong>Vé đã check-in</strong><p>Booking có vé đã check-in sẽ không thể thực hiện yêu cầu hủy.</p></div>
          </article>
        </section>

        <section className="panel policy-routes-panel">
          <div className="panel-header">
            <h2><Route size={21} /> Chính sách theo từng tuyến</h2>
            <p>Chính sách chính xác cũng được hiển thị tại bước chọn ghế và trong trang tra cứu vé.</p>
          </div>
          <div className="panel-body policy-route-list">
            {error && <div className="empty">{error}</div>}
            {!error && routes.length === 0 && <div className="empty">Đang tải chính sách các tuyến...</div>}
            {routes.map((route) => (
              <article className="policy-route-card" key={route.id}>
                <div>
                  <span className="policy-route-label">TUYẾN XE</span>
                  <h3>{route.from} → {route.to}</h3>
                  <p className="muted">{route.pickup} → {route.dropoff}</p>
                </div>
                <div className="policy-route-rule">
                  <Info size={18} />
                  <p>{route.cancellationPolicy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
