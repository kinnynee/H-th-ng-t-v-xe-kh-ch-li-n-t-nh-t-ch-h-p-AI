# Phân Công Công Việc Nhóm (Team Tasks)

Dự án: **Hệ thống đặt vé xe khách liên tỉnh tích hợp AI (Bus AI Ticketing)**

---

## 1. Trần Trung Kiên — Frontend & Trải Nghiệm Khách Hàng (Customer Experience)

* **Trách nhiệm**: Phát triển toàn bộ giao diện người dùng phía khách hàng (Next.js 15 App Router).
* **Chi tiết công việc đã hoàn thành**:
  * [x] **Trang chủ & Tìm kiếm chuyến xe (`apps/web/src/app/page.jsx`)**:
    * Thanh tìm kiếm chuyến thông minh (Điểm đi, điểm đến, ngày đi).
    * Bộ lọc đa chiều (Khung giờ sáng/trưa/chiều/tối, khoảng giá vé, nhà xe, hạng xe Limousine/Giường nằm).
    * Sắp xếp theo giá vé tăng/giảm, giờ xuất bến sớm/muộn.
  * [x] **Sơ đồ chọn ghế thời gian thực (`apps/web/src/app/trips/[id]/page.jsx`, `SeatMap.jsx`)**:
    * Sơ đồ xe 2 tầng trực quan, phân biệt trạng thái: Trống, Đang chọn, Đang giữ tạm thời (TTL 5 phút), Đã bán, Bị khóa.
    * Form nhập thông tin hành khách tương ứng với từng ghế đã chọn.
  * [x] **Tra cứu & Chi tiết vé điện tử (`apps/web/src/app/booking/[code]/page.jsx`)**:
    * Tra cứu vé qua Mã booking + Email.
    * Hiển thị E-Ticket kèm mã QR Code, hỗ trợ in vé/xuất PDF và hủy vé theo chính sách.
  * [x] **Trang tài khoản khách hàng (`apps/web/src/app/account/page.jsx`)**:
    * Đăng nhập/Đăng ký demo.
    * Quản lý danh bạ hành khách thường dùng (Saved Passengers) và lịch sử đặt vé.
  * [x] **Trang chính sách & SEO Landing Page**:
    * Trang chính sách hoàn/hủy vé (`apps/web/src/app/cancellation-policy/page.jsx`).
    * Dynamic SEO Routes (`apps/web/src/app/routes/[from]/[to]/page.jsx`).
  * [x] **Design System & Responsive Shell (`globals.css`, `SiteChrome.jsx`, `ChatWidget.jsx`)**:
    * Thiết kế UI/UX hiện đại, responsive trên Mobile/Tablet/Desktop, widget chat AI nổi.
    * Tích hợp GraphQL Client (`apps/web/src/lib/graphql.js`).

---

## 2. Xuân Hưng — Backend Core, Nghiệp Vụ Đặt Vé & Concurrency Specialist

* **Trách nhiệm**: Xây dựng nghiệp vụ đặt vé lõi, quản lý vòng đời booking, kiểm soát tồn kho ghế theo thời gian thực và xử lý xung đột giữ ghế.
* **Chi tiết công việc đã hoàn thành**:
  * [x] **Dịch vụ Đặt vé — Booking Service (`services/booking-service/`)**:
    * Hiện thực **Booking State Machine** đầy đủ (`PENDING` ➔ `HOLD` ➔ `PAYMENT_PROCESSING` ➔ `PAID` ➔ `TICKET_ISSUED` ➔ `CHECKED_IN` / `CANCELLED` / `EXPIRED`).
    * Luồng checkout an toàn: Kiểm tra hợp lệ hold token, liên kết danh sách hành khách theo từng ghế.
    * Hỗ trợ 2 chế độ: Registered User checkout và Guest Checkout (bảo mật capability mã vé + email).
    * Thanh toán mô phỏng (Simulated Payment) với Idempotency Key chống trùng lặp thanh toán.
    * Xử lý hủy vé & hoàn tiền tự động theo quy định chính sách.
    * Phát sự kiện nghiệp vụ (`BookingPaid`, `PaymentSucceeded`, `BookingCancelled`) qua RabbitMQ và Kafka.
  * [x] **Dịch vụ Quản lý tồn kho ghế — Seat Inventory Service (`services/seat-service/`)**:
    * Giao tiếp liên dịch vụ qua **gRPC Protocol** (`proto/seat_inventory.proto`).
    * Khóa ghế phân tán (Distributed Seat Hold) bằng **Redis TTL (5 phút)** với lệnh nguyên tử `SET NX`, giải quyết triệt để vấn đề **Race Condition**.
    * Xác nhận ghế bền vững vào cơ sở dữ liệu `seat_db` khi đơn hàng thành công.
    * Hỗ trợ đầy đủ 4 kiểu giao tiếp gRPC: Unary, Server Streaming, Client Streaming, Bidirectional Streaming.
  * [x] **Dịch vụ Chuyến xe — Trip Service (`services/trip-service/`)**:
    * Quản lý danh mục tuyến đường, nhà xe, xe khách, lịch trình và API tìm kiếm chuyến xe.
  * [x] **Kiểm thử Concurrency & Nghiệp vụ (`tests/`)**:
    * Xây dựng bộ test kiểm tra tranh chấp ghế `tests/seat-race.test.js`, `tests/seat-race-stress.test.js`.
    * Kiểm thử toàn vẹn nghiệp vụ booking `tests/booking-domain.test.js`, `tests/booking-validation.test.js`.

---

## 3. Việt Khải — Fullstack, Admin, AI Assistant, Event-Driven & DevOps Lead

* **Trách nhiệm**: Xây dựng Cổng Quản trị (Admin Portal), Trợ lý AI Chatbot, MCP Server, GraphQL Gateway, Hệ thống Worker xử lý sự kiện bất đồng bộ, Hạ tầng Docker Compose và Bộ tài liệu kỹ thuật.
* **Chi tiết công việc đã hoàn thành**:
  * [x] **Cổng Quản trị Hệ thống — Admin Portal (`apps/web/src/app/admin/page.jsx`)**:
    * Quản lý CRUD: Tuyến đường, Chuyến xe, Xe khách, Lịch chạy, Giá vé.
    * Khóa/Mở ghế thủ công (Admin Block/Unblock Seat) và Check-in vé trực tiếp tại bến xe.
    * Dashboard giám sát doanh thu, tỷ lệ lấp đầy ghế, top tuyến xe phổ biến và log sự kiện vận hành.
  * [x] **AI Chatbot Service (`services/ai-service/`)**:
    * Tích hợp **Vercel AI SDK** với cơ chế Tool Calling thông minh: Tìm chuyến xe (`search_trips`), Tra cứu trạng thái vé (`get_booking_status`), Giải đáp chính sách hoàn/hủy vé.
    * Xây dựng cơ chế **Smart AI Fallback Engine** (Intent Classifier + Rule-based Tool Runner) hoạt động đầy đủ tính năng ngay cả khi không có OpenAI API Key.
  * [x] **Model Context Protocol — MCP Server (`services/mcp-server/`)**:
    * Xây dựng MCP Server chuẩn qua stdio cung cấp Tools (`search_trips`, `get_trip_detail`, `get_booking_status`, `get_revenue_summary`, `get_popular_routes`) và Resources chính sách.
  * [x] **GraphQL Gateway — BFF (`services/gateway/`)**:
    * Điểm vào tập trung cho Web Client, tổng hợp GraphQL Schema, cung cấp Subscription `seatChanged` qua SSE.
  * [x] **Hệ thống Worker hướng sự kiện (Event-Driven Workers)**:
    * `workers/analytics-worker`: Consumer Kafka xử lý `search-events`, `booking-events`, `payment-events` để tính doanh thu, conversion rate, top tuyến (idempotent qua `event_id`).
    * `workers/ticket-worker` & `workers/email-worker`: Consumer RabbitMQ nhận sự kiện fan-out `booking.paid` để sinh vé điện tử HTML/PDF và gửi email mô phỏng (kèm retry backoff và DLQ).
  * [x] **Hạ tầng Docker Compose & DevOps (`docker-compose.yml`, `infra/`, `scripts/`)**:
    * Đóng gói toàn bộ hệ thống bằng Docker Compose: 4 Database PostgreSQL logic tách biệt theo ownership, Redis, RabbitMQ, Kafka, Zookeeper, Nginx Reverse Proxy, gRPC Healthchecks.
    * Script tự động hóa Migration và Seed dữ liệu mẫu (`scripts/db-tasks.js`).
  * [x] **Tài liệu Kỹ thuật Toàn diện (`docs/`)**:
    * Soạn thảo toàn bộ tài liệu kiến trúc backend, đảm bảo ACID, Runbook vận hành và bảng đối chiếu yêu cầu đề tài.