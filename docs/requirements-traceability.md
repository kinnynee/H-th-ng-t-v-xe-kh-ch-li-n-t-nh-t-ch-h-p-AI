# Đối chiếu yêu cầu đề tài

Yêu cầu được đối chiếu từ bản đề tài “Hệ thống đặt vé xe khách liên tỉnh tích
hợp AI”.

| Nhóm yêu cầu | Hiện thực trong dự án |
|---|---|
| Next.js customer/admin/SEO | `apps/web` App Router; có trang tìm chuyến, chi tiết, booking, account, admin và SEO route `/routes/[from]/[to]` |
| GraphQL | `services/gateway` cung cấp query, mutation và subscription `seatChanged` qua SSE |
| gRPC | Booking gọi Seat Inventory Service qua `SeatInventoryService` |
| Redis | Cache kết quả tìm kiếm và TTL hold ghế 5 phút |
| Không đặt trùng ghế | Redis `SET NX`, test race hai người cùng giữ một ghế |
| Realtime ghế | Gateway phát `seatChanged`; trang chọn ghế subscribe GraphQL-over-SSE |
| Booking/ticket | Guest/registered checkout, payment mô phỏng, HTML/PDF ticket, ticket/email worker |
| Điều kiện hủy | Chặn hủy sau giờ khởi hành hoặc khi check-in/completed/expired |
| Admin | CRUD tuyến, điểm dừng, xe, chuyến; block ghế, check-in, lifecycle `ACTIVE → DEPARTED → COMPLETED` |
| Kafka/RabbitMQ | Search, booking, payment và operation events; analytics, ticket và email consumer |
| Analytics | Doanh thu, top tuyến, conversion và log sự kiện vận hành trong admin |
| AI SDK | Chatbot gọi tool tìm chuyến/tra cứu booking và trích nguồn policy |
| MCP | Tools tra cứu chuyến, booking, doanh thu, top tuyến; resources policy/health |
| Nginx | Reverse proxy Next.js, GraphQL, AI và ticket endpoints |
| PostgreSQL | Database ownership theo service, migration versioned và seed idempotent |

## Kiểm tra đã chạy

```text
npm run build -w apps/web   ✓
npm test                    ✓ (2/2 seat-race tests)
docker compose config       ✓
```

Docker integration cần Docker Desktop daemon đang chạy; sau đó dùng
`npm run docker:up` để chạy migrate/seed tự động trước các service.
