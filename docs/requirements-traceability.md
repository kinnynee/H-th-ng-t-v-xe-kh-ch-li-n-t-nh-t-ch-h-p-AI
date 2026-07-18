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
| Hành khách–ghế | Chuẩn hóa và lưu nhiều hành khách theo `seatId` duy nhất; vé HTML/PDF hiển thị đúng tên, ghế, điện thoại và email |
| Guest/registered checkout | Customer đăng nhập được liên kết bằng `userId`; guest không cần tài khoản và tra cứu bằng mã booking + email để nhận capability có hạn |
| Booking state machine | Server kiểm soát toàn bộ transition từ thanh toán, xuất vé, check-in đến hoàn thành; hết hạn/hủy phát lệnh giải phóng ghế và từ chối trạng thái sai |
| Thanh toán mô phỏng | Có idempotency key, callback xác thực, trạng thái `PAYMENT_PROCESSING → PAID → TICKET_ISSUED`, xác nhận ghế và replay không tạo vé trùng |
| Điều kiện hủy | Chặn hủy sau giờ khởi hành hoặc khi check-in/completed/expired |
| Admin | CRUD tuyến, điểm dừng, xe, chuyến; block ghế, check-in, lifecycle `ACTIVE → DEPARTED → COMPLETED` |
| Kafka/RabbitMQ | Search, booking, payment và operation events; analytics, ticket và email consumer |
| RabbitMQ workers | `booking.paid` fan-out đến hai queue durable riêng; Ticket/Email Worker chống message lặp, retry có backoff, log lỗi và chuyển sang DLQ sau giới hạn |
| Analytics | Doanh thu, top tuyến, conversion và log sự kiện vận hành trong admin |
| AI SDK | Chatbot gọi tool tìm chuyến; tra cứu booking chỉ sau khi xác minh mã booking + email; phân biệt dữ liệu live/policy/hướng dẫn; không bịa dữ liệu khi tool lỗi và trích đúng nguồn policy theo intent |
| MCP | Tools tra cứu chuyến, booking, doanh thu, top tuyến; resources policy/health |
| Nginx | Reverse proxy Next.js, GraphQL, AI và ticket endpoints |
| PostgreSQL | Database ownership theo service, migration versioned và seed idempotent |

## Kiểm tra đã chạy

```text
npm run build -w apps/web   ✓
npm test                    ✓ (72/72 tests, including multi-intent chatbot flows, secure tools, concurrent worker deduplication and Rabbit retry tests)
npm run test:seat-race:repeat ✓ (3 consecutive runs, 50 race rounds per run)
docker compose config       ✓
```

Docker integration cần Docker Desktop daemon đang chạy; sau đó dùng
`npm run docker:up` để chạy migrate/seed tự động trước các service.
