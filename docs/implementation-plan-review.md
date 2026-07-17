# Rà soát kế hoạch triển khai backend

## Phạm vi đã rà soát

Hệ thống đặt vé xe gồm Next.js, GraphQL Gateway, gRPC seat inventory,
Redis/RabbitMQ/Kafka và các worker. Mục tiêu của lần cải tiến này là thêm tầng
dữ liệu bền vững PostgreSQL mà không phá luồng event hiện có.

| Hạng mục | Trước thay đổi | Yêu cầu | Kết quả / khoảng cách | Rủi ro | Ưu tiên |
|---|---|---|---|---|---|
| Persistence | Map in-memory, mất khi restart | Database bền vững | Đã có PostgreSQL và repository cho Trip/Booking/Seat/Analytics | Thấp | P1 hoàn tất |
| Sở hữu dữ liệu | Không tách DB | Không chia sẻ bảng giữa service | Bốn database logic, mỗi service tự migration | Thấp | P1 hoàn tất |
| Tranh chấp ghế | Redis hold, booked in-memory | Hold TTL và xác nhận bền vững | Redis cho hold, `seat_assignments` cho booked/blocked | Trung bình: chưa hỗ trợ scale nhiều replica | P1 tiếp theo |
| Event analytics | Map in-memory | Idempotent consumer | Inbox `analytics_events` có khoá `event_id` | Thấp | P1 hoàn tất |
| Authentication | Demo password plaintext | Hash password, session/token, RBAC | Chưa đạt | Cao | P1 |
| Validation | Kiểm tra thủ công không đồng nhất | Validate input ở mọi boundary | Chưa đạt | Cao | P1 |
| Logging | Console log cơ bản | Structured log + correlation id | Chưa đạt | Trung bình | P2 |
| Test | Có race test ghế | API/integration test với PostgreSQL | Chưa đạt | Cao | P1 |
| Migrations | Auto-create khi boot | Versioned migrations production | Đã có migration SQL versioned và job Compose trước service | Thấp | P1 hoàn tất |

## Kế hoạch tiếp theo

1. **P1 — Bảo mật API:** hash password, JWT/session và middleware phân quyền
   cho admin/staff/customer.
2. **P1 — Validation và test:** schema validation cho REST/GraphQL; thêm
   integration test với PostgreSQL/Redis cho booking, thanh toán và cancel.
3. **P1 — Ghế nhiều replica:** chuyển `seat_assignments` sang transaction
   insert/row lock thay vì write-through memory snapshot.
4. **P2 — Quan sát:** request id từ Gateway, structured log và metrics.
5. **P2 — Migration:** bổ sung migration rollback và kiểm tra migration trong CI.

## Khuyến nghị

Kiến trúc hiện tại phù hợp demo/đồ án microservice và đã có persistence rõ
ràng. Không nên đưa database của service khác vào Gateway; các thay đổi tiếp
theo nên đi qua API/event của service chủ sở hữu.
