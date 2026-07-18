# Báo cáo audit hệ thống đặt vé xe — 2026-07-18

Phạm vi: source code, GraphQL/REST/gRPC, Redis, PostgreSQL schema/migration, RabbitMQ, Kafka, Nginx, Next.js, Docker Compose, kiểm thử API/UI/concurrency/security và MCP client. Báo cáo không dựa vào README để công nhận tính năng.

> Cập nhật sau audit: các lỗi ưu tiên AUD-001 đến AUD-008 (trừ nội dung dependency advisory độc lập) và lỗi khởi động Compose đã được xử lý. Xem mục G ở cuối báo cáo.

## A. Kết luận tổng quan

- Trạng thái dự án: **Đạt một phần, chưa sẵn sàng demo theo toàn bộ rubric**.
- Điểm chức năng/kiến trúc trước phạt bắt buộc: **6.40/10**.
- Phạt kiến trúc bắt buộc: **-3.00** vì Nginx chỉ reverse proxy tới một instance, không có load balancing.
- Tổng điểm dự kiến sau phạt: **3.40/10**.
- Build Docker và Next.js thành công; `docker compose up -d` không dựng được toàn hệ thống với volume hiện tại vì bốn migration container đều lỗi.
- Lỗi nghiêm trọng nhất: MCP làm lộ booking/PII bằng token ADMIN tự cấp; stack Docker không khởi động đầy đủ; RabbitMQ consumer không retry/DLQ và xử lý message trùng; không có payment idempotency key; hold bị mất phía client sau refresh; chatbot trả sai các prompt tìm chuyến.

## B. Kiểm tra điều kiện bắt buộc

| Điều kiện | Trạng thái | Bằng chứng | Điểm bị trừ |
| --- | --- | --- | ---: |
| Microservices + GraphQL Gateway + gRPC | Đạt một phần, không phạt bắt buộc | Các process độc lập trong `services/` và `workers/`; GraphQL Yoga tại `services/gateway/src/index.js:701`; proto thật tại `proto/seat_inventory.proto`; Booking Service gọi Seat Service bằng gRPC tại `services/booking-service/src/index.js:34-70`. Tuy nhiên Gateway→Trip/Booking/AI/Analytics và Booking→Trip vẫn dùng HTTP REST; gRPC không có deadline. | 0 |
| Redis Cache | Đạt | Redis Compose; `SET NX EX` tại `packages/shared/src/cache.js:75-80`; khóa `seat:hold:<trip>:<seat>` tại `services/seat-service/src/core.js:9-11`; search cache TTL 60 giây tại `services/trip-service/src/services/trip-service.js:228-246`. Test thực tế trả `MISS → HIT`, 100 request chỉ một hold. | 0 |
| RabbitMQ/Kafka | Đạt một phần, không phạt bắt buộc | RabbitMQ exchange/queue/ack tại `packages/shared/src/broker.js:35-48,65-81`; Kafka producer/consumer tại `packages/shared/src/broker.js:151-256`; booking outbox tại `database/migrations/booking/003_acid_integrity_and_outbox.js`. Thiếu retry/DLQ cho Rabbit consumer. | 0 |
| Nginx + Load Balancer | **Không đạt** | `nginx/default.conf` có reverse proxy/header nhưng không có `upstream`; mọi route trỏ tới đúng một DNS service (`gateway`, `web`, `ai-service`, `booking-service`); Compose không có replica thứ hai. | **3.00** |
| Next.js | Đạt một phần, không phạt | Next.js 15 App Router, `layout.jsx`, pages và error boundary. Không có `loading.jsx`/`not-found.jsx`; trang chi tiết chuyến là Client Component và không có metadata riêng. | 0 |

## C. Chấm điểm theo rubric

| Tiêu chí | Điểm tối đa | Điểm đạt | Trạng thái | Bằng chứng |
| --- | ---: | ---: | --- | --- |
| Tìm kiếm chuyến và hiển thị kết quả | 0.50 | 0.40 | Đạt phần lớn | UI trả 3 chuyến hôm nay; API trả đúng 2 chuyến TP.HCM–Đà Lạt ngày 2026-07-19, đủ giờ/giá/nhà xe/loại xe/ghế. Không validate server `from === to` và ngày quá khứ; URL vẫn `/`. |
| Autocomplete, lọc và sắp xếp | 0.25 | 0.18 | Đạt một phần | Native `datalist`, lọc giờ/max price/operator/bus type/min seats, sort giá/giờ/duration tại `apps/web/src/app/page.jsx:137-202`. Thiếu giá tối thiểu, giá giảm dần, điểm đón/trả, đánh giá; không có custom keyboard/debounce. |
| Chi tiết chuyến, SEO, ngày gần nhất | 0.25 | 0.12 | Đạt một phần | Chi tiết và sơ đồ ghế đầy đủ. `apps/web/src/app/trips/[id]/page.jsx:1` là Client Component; browser thấy title/description chung. Gợi ý ngày chỉ là text, không chọn nhanh và với ngày 2026-07-25 lại gợi ý 2026-07-18. |
| Cache tìm kiếm và search event | 0.25 | 0.22 | Đạt | Redis cache key chứa toàn bộ query và epoch; TTL 60; mutation tăng epoch; `TripSearchPerformed` gửi Kafka. Test `MISS → HIT`. Epoch theo process nên cache cũ không được xóa vật lý và replica không đồng bộ epoch. |
| Sơ đồ và trạng thái ghế | 0.25 | 0.22 | Đạt | UI phân biệt AVAILABLE/HELD/BOOKED/BLOCKED, layout theo tầng/hàng/cột, SSE subscription. Browser không cho chọn A02 đã BOOKED. |
| Giữ ghế bằng gRPC và Redis TTL | 1.00 | 0.90 | Đạt tốt | gRPC thật, Redis `SET NX EX`, token ownership, Lua gia hạn nhiều ghế, SQL assignment constraint. Test 100 request: 1 thành công, 99 GraphQL errors do ghế unavailable. Thiếu gRPC deadline/status code chuẩn. |
| Đếm ngược và cập nhật gần thời gian thực | 0.75 | 0.45 | Đạt một phần | UI hiển thị `04:45`, SSE qua GraphQL/Rabbit, Redis tự hết TTL. Refresh trong lúc hold làm mất selected/token/countdown; A03 thành disabled và người giữ không thể tiếp tục. Hold countdown ban đầu dựa trên số giây local, không persisted absolute expiry. |
| Chống đặt trùng ghế | 0.75 | 0.55 | Đạt một phần | Redis atomic + SQL PK/transaction + booking version optimistic concurrency; 100-request test đạt; thanh toán lặp không tạo vé thứ hai. Không có idempotency key/callback payment; lần gọi lại trả 409 thay vì cùng kết quả idempotent. |
| Hành khách–ghế | 0.25 | 0.25 | Đạt | Mỗi passenger có seatId; duplicate seat và email/phone/name/document được validate; DB check số passenger bằng số seat. |
| Guest và registered checkout | 0.25 | 0.22 | Đạt phần lớn | Guest không cần login, access token ngẫu nhiên/hash; registered booking gắn userId, history và owner check đạt. Chưa có xử lý rõ ràng khi login giữa checkout. |
| Booking state machine | 0.50 | 0.40 | Đạt phần lớn | Domain transition, cancellation/check-in rules, timeout, OCC transaction/outbox. Không lưu state history; payment path cập nhật trạng thái trực tiếp ngoài transition map; không có `REFUNDED`/`COMPLETED`. |
| Thanh toán mô phỏng | 0.50 | 0.30 | Đạt một phần | Có success/failure/timeout và confirm ghế; retry sau thành công không tạo vé mới. Không có Payment Service/entity, idempotency key, callback/webhook hoặc transaction tiền riêng. |
| RabbitMQ, vé và thông báo | 0.75 | 0.40 | Đạt một phần | Producer/outbox và hai queue riêng; ticket/email worker bất đồng bộ. Publish cùng event hai lần làm cả hai worker log xử lý hai lần. `nack(message,false,false)` loại message lỗi vĩnh viễn, không retry/DLQ. Ticket worker không lưu eventId. |
| Vé điện tử và tra cứu booking | 0.50 | 0.45 | Đạt tốt | ID vé, QR PNG/PDF, thông tin chuyến/ghế/hành khách; chỉ xuất sau payment; guest access email+code; direct PDF không auth trả 403. |
| Đăng nhập và phân quyền | 0.25 | 0.18 | Đạt một phần | Scrypt, JWT HMAC có iss/aud/exp, backend role guards, owner checks; token giả/hết hạn có test. Không refresh/revocation server-side; 30 login sai không rate-limit; token lưu localStorage. |
| Admin CRUD | 0.75 | 0.35 | Thiếu nhiều | CRUD stop/route/vehicle/trip và seat layout. Thiếu operator/nhà xe, tài xế, tỉnh/thành riêng, loại xe riêng; không pagination/search; nút delete không confirm; xóa route/trip không kiểm tra dependency xuyên service đầy đủ. |
| Điều hành và check-in | 0.25 | 0.18 | Đạt một phần | Staff xem trip/booking/seat và check-in mã vé/QR; chặn cancelled/duplicate/outside window. Trip status thiếu BOARDING/CANCELLED, không có assignment tài xế. |
| Kafka analytics và dashboard | 0.50 | 0.28 | Đạt một phần | Producer/consumer, event envelope, DB inbox dedupe, revenue/popular route/conversion/event log. Dashboard thiếu cancel rate, occupancy, filter thời gian/month/route; fallback memory không dedupe; current Compose không chạy analytics DB. |
| Chatbot AI tool calling | 1.00 | 0.25 | Không đạt chức năng chính | Có AI SDK `tool()` với Zod cho search và booking lookup, quyền booking được forward. Nhưng fallback đang dùng thực tế hiểu `chuyen` chứa `huy`, nên prompt tìm chuyến/ghế đều trả chính sách hủy; thiếu tools trip detail/seat; không rate-limit. |
| MCP Server | 0.50 | 0.10 | **Lỗi bảo mật nghiêm trọng** | MCP stdio kết nối và `search_trips` chạy thật. Thiếu seat availability. `requestJSON()` tự cấp ADMIN token và `get_booking_status` đọc booking/PII bất kỳ chỉ bằng code. |
| **Tổng trước phạt** | **10.00** | **6.40** |  |  |
| **Tổng sau phạt Nginx/LB** |  | **3.40** |  |  |

## D. Danh sách lỗi

### AUD-001 — Critical — MCP IDOR làm lộ booking và PII

- File/dòng: `services/mcp-server/src/index.js:13-20,54-59`.
- Tái hiện: kết nối MCP client; gọi `get_booking_status({bookingCode})` mà không cung cấp user token/email guest.
- Hiện tại: MCP tự ký JWT role ADMIN và trả customerEmail, customerPhone, userId, passenger name/phone/email, ghế, vé.
- Mong đợi: tool yêu cầu capability/user token; chỉ trả dữ liệu tối thiểu của chủ booking.
- Nguyên nhân: service credential ADMIN được dùng cho request do client điều khiển.
- Sửa: bỏ token ADMIN; truyền auth context/capability vào MCP session; thêm endpoint service-to-service chỉ trả safe projection và policy kiểm tra owner; xóa `get_revenue_summary` khỏi client không tin cậy hoặc yêu cầu role thật.

### AUD-002 — High — Docker Compose không khởi động toàn hệ thống

- File/dòng: `docker-compose.yml` phần Postgres và bốn `*-migrate`; `infra/postgres/00-create-databases.sql`.
- Tái hiện: `docker compose up -d` trên volume hiện tại.
- Hiện tại: trip/seat/booking/analytics migration exit 1; log ban đầu báo password authentication failed, kiểm tra tiếp cho thấy logical DB như `analytics_db` không tồn tại; app containers ở `Created`.
- Mong đợi: migration exit 0 và toàn bộ container healthy.
- Nguyên nhân: volume PostgreSQL cũ không tương thích password/logical DB hiện tại; init script chỉ chạy khi volume rỗng; không có upgrade/bootstrap runbook.
- Sửa: thêm script idempotent tạo logical DB/role sau khi Postgres healthy; có migration credential thống nhất; tài liệu backup + rotate/migrate volume, không yêu cầu xóa volume mù.

### AUD-003 — High — RabbitMQ mất message lỗi và consumer không idempotent đầy đủ

- File/dòng: `packages/shared/src/broker.js:73-81`; `workers/ticket-worker/src/index.js:92-98`; `workers/email-worker/src/index.js:24-48`.
- Tái hiện: publish cùng eventId `booking.paid` hai lần.
- Hiện tại: ticket và email worker đều log xử lý hai lần; ticket ghi đè file. Handler throw bị `nack(..., false, false)` và message bị loại vĩnh viễn.
- Mong đợi: inbox eventId/bookingCode unique, duplicate skip; lỗi transient retry có backoff, quá số lần vào DLQ.
- Sửa: dead-letter exchange + retry queues; consumer inbox trong DB hoặc atomic marker; ticket worker kiểm tra eventId; email lưu trạng thái `sending/sent` bền vững.

### AUD-004 — High — Không có payment idempotency/callback contract

- File/dòng: `services/gateway/src/index.js:553-562`; `services/booking-service/src/index.js:569-650`.
- Tái hiện: gửi `payBooking` thành công hai lần.
- Hiện tại: lần 1 xuất một vé; lần 2 trả `Booking is TICKET_ISSUED` (không double-book nhưng không idempotent). Không có idempotency key/payment transaction/webhook.
- Mong đợi: cùng key trả cùng payment result; callback lặp không tạo side effect; payment record unique.
- Sửa: Payment Service/table với unique `(provider,idempotency_key)` và unique provider transaction; webhook signature; outbox; response replay.

### AUD-005 — High — Chatbot trả sai mọi câu có từ “chuyến” trong fallback

- File/dòng: `services/ai-service/src/index.js:142-168,176-179`.
- Tái hiện: “Tìm chuyến từ TP.HCM đến Đà Lạt ngày mai.” hoặc “Cho tôi xem ghế trống của chuyến đầu tiên.”
- Hiện tại: trả chính sách hủy, toolCalls rỗng.
- Mong đợi: gọi `searchTrips`, sau đó tool seat availability nếu được hỏi.
- Nguyên nhân: `fold("chuyến") = "chuyen"` chứa substring `huy`; nhánh hủy chạy trước nhánh search. Khi không có OpenAI key, `isTripSearchIntent` không được chạy.
- Sửa: intent bằng token/regex word boundary (`\bhuy\b`), ưu tiên explicit search; thêm tools `getTripDetail/getSeatAvailability`; test toàn bộ 7 prompt bắt buộc.

### AUD-006 — High — Hold checkout bị mất sau refresh

- File/dòng: `apps/web/src/app/trips/[id]/page.jsx:72-164`.
- Tái hiện: chọn A03, giữ ghế, thấy countdown; reload trang.
- Hiện tại: countdown/selected/token mất; A03 disabled vì Redis vẫn HELD.
- Mong đợi: owner tiếp tục checkout với thời gian còn lại từ server.
- Nguyên nhân: holdToken chỉ ở React state; không lưu sessionStorage và API không có resume-hold.
- Sửa: lưu `{tripId,holdToken,seatIds,expiresAt}` trong sessionStorage; endpoint verify/resume trả expiresAt; xóa khi expire/confirm/release.

### AUD-007 — High — GraphQL/API thiếu lớp chống abuse

- File/dòng: `services/gateway/src/index.js:701-710`; auth endpoints `services/booking-service/src/index.js:727-761`.
- Tái hiện: introspection query; query 200 aliases; 30 login sai song song.
- Hiện tại: introspection enabled, 200 fields trả đủ, không request 429; CORS chấp nhận origin bất kỳ; `maskedErrors:false`.
- Mong đợi: depth/complexity/alias limits, rate-limit login/chat/guest-access, production introspection off, masked errors, origin allowlist.
- Sửa: Yoga validation plugins + persisted/max-depth query; Redis rate limiter; `maskedErrors:true`; environment-based introspection/CORS.

### AUD-008 — High — Dependency có lỗ hổng đã biết

- File/dòng: `workers/email-worker/package.json`, `services/ai-service/package.json`, `apps/web/package.json`, lockfile.
- Tái hiện: `npm audit --omit=dev`.
- Hiện tại: 13 production findings: 1 high (`nodemailer <=9.0.0`), 6 moderate, 6 low.
- Mong đợi: không còn high/critical trước demo/deploy.
- Sửa: nâng Nodemailer theo advisory và regression-test SMTP; lập kế hoạch nâng AI SDK/Next/PostCSS theo release tương thích, không dùng `audit fix --force` mù.

### AUD-009 — Medium — Không có load balancing

- File/dòng: `nginx/default.conf:1-30`, `docker-compose.yml`.
- Tái hiện: kiểm tra config hoặc gửi nhiều request qua Nginx.
- Hiện tại: không có upstream/replica/instance-id; mọi request tới một container.
- Mong đợi: ít nhất hai Gateway instances và Nginx upstream round-robin/least_conn, health/failure policy, SSE phù hợp.
- Sửa: upstream `gateway_pool` với hai endpoint; tách port/scale deployment; thêm response instance header trong non-production để test phân phối.

### AUD-010 — Medium — gRPC không có deadline và phần lớn internal traffic vẫn REST

- File/dòng: `services/booking-service/src/index.js:65-72`; `packages/shared/src/grpc.js:61-91`.
- Tái hiện: Seat Service treo nhưng không đóng connection; gọi booking hold/pay.
- Hiện tại: callback gRPC không deadline; insecure channel; Gateway và Booking gọi service khác bằng fetch không timeout.
- Mong đợi: per-call deadline, structured status, abort timeout, retry/circuit breaker có giới hạn, TLS/service identity khi production.
- Sửa: metadata + `{deadline: Date.now()+N}`; map gRPC status; `AbortSignal.timeout` cho fetch; readiness thật.

### AUD-011 — Medium — SEO chi tiết chuyến chưa đạt

- File/dòng: `apps/web/src/app/trips/[id]/page.jsx:1`; `apps/web/src/app/layout.jsx:3-6`.
- Tái hiện: mở trang chi tiết, đọc `document.title`/meta trước và sau hydrate.
- Hiện tại: title `Vé xe liên tỉnh AI`, description chung; nội dung chính client-rendered.
- Mong đợi: Server Component wrapper, `generateMetadata`, canonical/Open Graph, dữ liệu chuyến render server.
- Sửa: tách `TripDetailClient.jsx`, để `page.jsx` server fetch trip và sinh metadata.

### AUD-012 — Medium — Search validation/gợi ý ngày chưa đúng UX

- File/dòng: `services/trip-service/src/services/trip-service.js:16-42,215-247`; `apps/web/src/app/page.jsx:71-92,225-229`.
- Tái hiện: from=to; ngày quá khứ; chọn 2026-07-25 không có dữ liệu.
- Hiện tại: không trả validation error; gợi ý 2026-07-18 và không click được; URL không phản ánh query.
- Mong đợi: reject same route/past date; gợi ý gần nhất theo ngày chọn và không trước hôm nay; button áp dụng ngày; sync URL.
- Sửa: schema validation ở Trip Service/Gateway; tính absolute distance hoặc ưu tiên future relative selected date; `router.replace` query params.

### AUD-013 — Medium — Admin CRUD/operations thiếu và có nguy cơ lệch in-memory

- File/dòng: `services/trip-service/src/services/trip-service.js:181-216,288-305`; `apps/web/src/app/admin/page.jsx:327-544`.
- Tái hiện: xem các entity/form; delete route/trip; kiểm tra không có confirm/pagination.
- Hiện tại: thiếu operator/driver/entity type; delete memory trước repository ở một số path; lỗi DB có thể làm memory khác DB; không confirmation/pagination/search.
- Mong đợi: đủ entity rubric, dependency guard, transaction/order an toàn và UX xác nhận.
- Sửa: repository delete thành công trước khi mutating store hoặc reload on failure; cross-service usage check; thêm CRUD/pagination/filter.

### AUD-014 — Medium — Analytics fallback không chống duplicate và dashboard thiếu chỉ số

- File/dòng: `workers/analytics-worker/src/repository.js:28-31`; `workers/analytics-worker/src/index.js:40-83`.
- Tái hiện: chạy không PostgreSQL và gửi cùng eventId hai lần.
- Hiện tại: `applyAnalyticsEvent(null)` luôn `applied:true`; memory tăng hai lần. DB mode có inbox dedupe nhưng current Compose không tạo DB.
- Mong đợi: fallback cũng có bounded eventId set hoặc fail closed; dashboard có cancel/occupancy/time filter.
- Sửa: in-memory processed-event set có TTL/size; bắt buộc DB trong production; mở rộng aggregates và filters.

### AUD-015 — Low — Test suite có test phụ thuộc ngày hiện tại

- File/dòng: `tests/trip-service.test.js:52-59` và fixture ngày cố định.
- Tái hiện: `npm test` ngày 2026-07-18.
- Hiện tại: 41/42 pass; test “customer searches hide departed trips…” fail vì fixture được xem là quá khứ.
- Mong đợi: test deterministic mọi ngày.
- Sửa: inject `now` hoặc tạo departure relative; không dùng ngày lịch cố định.

## E. Test case đã chạy

| Test case | Kết quả | Log/Bằng chứng | Ghi chú |
| --- | --- | --- | --- |
| 1. Tìm kiếm chuyến hợp lệ | PASS | GraphQL: 2 chuyến ngày 2026-07-19; Browser: 3 chuyến hôm nay đủ giá/giờ/nhà xe/ghế | Unicode được gửi bằng escape để tránh terminal encoding. |
| 2. Tìm kiếm không có dữ liệu | PARTIAL | UI: `0 chuyến`; gợi ý `2026-07-18` khi chọn `2026-07-25` | Có empty state nhưng gợi ý không hợp ngữ cảnh và không click được. |
| 3. Cache tìm kiếm | PASS | Hai query giống nhau: `MISS`, `HIT` | Redis container healthy. |
| 4. Hai người giữ cùng ghế | PASS | Existing automated race test và 100-request test | Chỉ một owner. |
| 5. 100 request giữ cùng ghế | PASS | A01: 1 success, 99 GraphQL errors, 1 unique token | Thực hiện qua GraphQL→Booking→gRPC→Seat→Redis. |
| 6. Hold hết hạn | PASS | A01 `HELD/2s → AVAILABLE/0s` sau 3.3s | Redis TTL thật. |
| 7. Thanh toán sau hold hết hạn | PARTIAL/Code verified | `pay` kiểm tra `paymentExpiresAt` và Seat confirm kiểm tra hold | Không chờ 60–900 giây end-to-end trong audit; cần test clock injection. |
| 8. Thanh toán lặp | PARTIAL | Lần 1 `TICKET_ISSUED` một vé; lần 2 409 | Không double-ticket nhưng chưa idempotent contract. |
| 9. Callback thanh toán lặp | FAIL/Không tồn tại | Không có webhook/callback/payment transaction | Cần xây Payment boundary. |
| 10. RabbitMQ consumer message trùng | FAIL | Cùng eventId publish 2 lần; ticket/email worker đều log 2 lần | File ticket bị ghi đè, không có inbox dedupe ticket. |
| 11. Phân quyền admin | PASS | Customer gọi `adminSummary` bị `You do not have permission` | Backend enforcement thật. |
| 12. IDOR booking | PASS qua Web API; FAIL qua MCP | User B query booking User A bị deny; direct PDF 403; MCP lại đọc được toàn bộ PII | MCP là bypass nghiêm trọng. |
| 13. Chatbot prompt injection | PASS bảo mật, FAIL chức năng | Không lộ env/API key và không hủy; prompt hợp lệ tìm chuyến/ghế trả sai policy | Không có dangerous mutation tool. |
| 14. Kafka duplicate event | BLOCKED/PARTIAL | DB inbox code dùng `ON CONFLICT(event_id)`; migration runtime bị chặn vì logical DB không tồn tại | Fallback memory chắc chắn không dedupe. |
| 15. Load balancing | FAIL | Nginx không upstream; Compose một Gateway | Không thể chứng minh phân phối nhiều instance. |
| MCP client | PARTIAL | SDK client list/call tools thành công | Security failure ở booking lookup. |
| Docker config | PASS | `docker compose config --quiet` exit 0 | Cấu hình cú pháp hợp lệ. |
| Docker build | PASS | `docker compose build` exit 0 | Build không chạy Next production build trong image. |
| Docker up/health | FAIL | 4 migration exit 1; app containers `Created` | Infrastructure services Redis/Rabbit/Kafka/Postgres healthy riêng lẻ. |
| Next production build | PASS | `npm run build -w apps/web` exit 0 | 9 routes build thành công. |
| Unit/integration suite | PARTIAL | 41 pass, 1 fail | Lỗi test thời gian cố định, không phải email/seat/auth. |
| Dependency audit | FAIL | 13 production advisories: 1 high, 6 moderate, 6 low | High thuộc Nodemailer. |

## F. Kế hoạch sửa lỗi

### 1. Phải sửa ngay trước khi demo

1. **Khóa MCP IDOR**
   - Sửa `services/mcp-server/src/index.js`, `services/booking-service/src/index.js`.
   - Bỏ ADMIN token tự cấp cho tool client; bổ sung auth/capability input và safe booking projection.
   - Test: MCP client không token phải nhận structured forbidden; owner token mới nhận booking.
2. **Làm Compose khởi động được mà không mất dữ liệu**
   - Sửa `infra/postgres/00-create-databases.sql`, thêm `infra/postgres/ensure-databases.sh` hoặc migration bootstrap idempotent; cập nhật `docker-compose.yml` và runbook backup/upgrade volume.
   - Test: backup volume; chạy bootstrap; `docker compose up -d`; mọi app/migration healthy.
3. **Sửa chatbot intent `chuyến/hủy`**
   - Sửa `services/ai-service/src/index.js`; thêm `tests/ai-security-and-tools.test.js`.
   - Dùng tokenized intent; search trước cancellation; thêm seat/detail tools.
   - Test đủ 7 prompt rubric.
4. **Rabbit retry/DLQ + inbox dedupe**
   - Sửa `packages/shared/src/broker.js`, hai worker; thêm migration consumer inbox.
   - Test duplicate cùng eventId chỉ một side effect; lỗi transient retry rồi ack; poison message vào DLQ.

### 2. Cần sửa để tránh mất điểm

1. **Nginx load balancing** — sửa `nginx/default.conf`, `docker-compose.yml`; tạo hai Gateway instance hoặc deployment replicas; test 100 request có ít nhất hai instance-id.
2. **Payment idempotency** — tạo `services/payment-service/`, proto/schema/table/outbox; thêm `idempotencyKey`; test request và callback lặp.
3. **Persist/resume hold** — sửa Trip page và Booking/Seat API; sessionStorage + server expiresAt; test reload/multi-tab/network reconnect.
4. **GraphQL hardening** — depth/complexity/alias limit, rate-limit Redis, introspection/CORS/masked errors theo environment.
5. **SEO trip detail** — Server Component + `generateMetadata`, canonical/Open Graph.
6. **Admin completeness** — operator/driver/type CRUD, pagination/search/filter, delete confirmation và dependency guards.

### 3. Cải thiện chất lượng

- Thêm timeout/deadline/circuit breaker cho fetch/gRPC; readiness gọi downstream thật thay vì luôn `ok:true`.
- Tách Booking controller đang quá lớn; loại code render ticket cũ không dùng; chuẩn hóa domain state transition.
- Thay `redis.keys()` bằng `SCAN`; cache invalidation dùng version/Redis pub-sub dùng chung giữa replicas.
- Nâng dependencies, ưu tiên Nodemailer high advisory; bật CI `npm audit` policy.
- Thêm CSP/security headers và tránh lưu bearer token dài hạn trong localStorage nếu có thể.

### 4. Tính năng còn thiếu

- Payment Service/webhook/refund ledger.
- Operator/driver/province/vehicle type management.
- Trip BOARDING/CANCELLED và assignment vận hành.
- Analytics cancel/occupancy/time filters/month/route.
- Chatbot trip detail/seat availability và xác nhận trước mutation nguy hiểm.
- MCP seat availability và per-user authorization.

### 5. Test còn thiếu

- End-to-end payment after expiry bằng fake clock.
- Payment idempotency/callback duplicate.
- Rabbit retry/DLQ và crash giữa side effect–ack.
- Kafka duplicate với PostgreSQL container healthy.
- SSE hai browser, reconnect và multi-tab hold.
- Clean-volume và upgraded-volume Compose tests trong CI.
- Nginx distribution/instance failure test.
- GraphQL depth/complexity/rate-limit security suite.
- Full Playwright guest/registered/admin/check-in flows.

## Lệnh xác minh sau khi sửa

```bash
npm test
npm run build -w apps/web
npm audit --omit=dev
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose logs --no-color --tail=200
```

Kết quả mong đợi: toàn bộ test pass deterministic; không high/critical advisory; bốn migration exit 0; mọi service healthy; duplicate payment/broker không tạo side effect lặp; MCP không thể đọc booking không thuộc quyền; Nginx phân phối request qua ít nhất hai instances.

## G. Kết quả khắc phục ưu tiên — 2026-07-18

| Vấn đề | Trạng thái sau sửa | Xác minh |
| --- | --- | --- |
| MCP tự cấp ADMIN và lộ booking/PII | Đã sửa | Bỏ hoàn toàn token ADMIN tự cấp; tool booking bắt buộc JWT người dùng hoặc booking capability. MCP client không credential nhận lỗi từ chối. |
| Payment thiếu idempotency/callback | Đã sửa | Migration `007_payment_idempotency.js`; khóa idempotency được lưu unique; retry trả cùng một vé; callback yêu cầu secret và dùng `eventId` nhà cung cấp làm khóa cưỡng chế. |
| RabbitMQ thiếu retry/DLQ và consumer idempotency | Đã sửa | Retry exponential có giới hạn, dead-letter exchange/queue; kiểm thử thật chạy 3 attempt rồi chuyển đúng 1 message vào DLQ. Ticket/email worker bỏ qua side effect đã hoàn tất. |
| Refresh làm mất hold | Đã sửa | Hold capability lưu trong `sessionStorage`, được xác minh lại qua Seat Service trước khi khôi phục. Browser reload giữ A01 và đồng hồ tiếp tục từ `05:00` xuống `04:54`. |
| GraphQL chưa harden | Đã sửa | Introspection/GraphiQL mặc định tắt; giới hạn depth/field/alias/batch; fixed-window rate limit trả HTTP 429; CORS allowlist; error masking bật. |
| Chatbot nhận nhầm “chuyến” thành “hủy” | Đã sửa | Boundary-aware cancellation intent, ưu tiên trip intent và chuẩn hóa ký tự `đ`; prompt TP.HCM–Đà Lạt trả đúng 2 chuyến và gọi `searchTrips`. |
| Docker Compose không khởi động | Đã sửa | `db-setup` tự bảo đảm bốn database; toàn bộ migration exit 0; mọi app/infra/Nginx đều healthy. |

Regression sau sửa: `48/48` test pass, Next.js production build pass, `docker compose config --quiet` pass và `docker compose up -d --build` pass.
