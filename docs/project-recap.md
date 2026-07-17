# Tóm tắt dự án Bus AI Ticketing

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Frontend | Hoàn thành | Next.js App Router, tìm chuyến/đặt vé/tài khoản/admin |
| Gateway | Hoàn thành | GraphQL BFF đến các microservice |
| Trip & booking | Hoàn thành | REST service, PostgreSQL migration + seed + persistence |
| Seat inventory | Hoàn thành | gRPC + Redis TTL + PostgreSQL booking/blocked state |
| Eventing | Hoàn thành | RabbitMQ ticket/email, Kafka analytics |
| Docker | Hoàn thành | PostgreSQL, Redis, RabbitMQ, Kafka, service healthchecks |
| Security | Cần cải thiện | Demo credentials vẫn là plaintext |
| Testing | Cần cải thiện | Cần integration test với hạ tầng thực |

## File quan trọng

- `docker-compose.yml`: toàn bộ hạ tầng chạy local.
- `database/migrations/`: migration SQL versioned theo database.
- `services/*/scripts/seed.js`, `workers/analytics-worker/scripts/seed.js`:
  dữ liệu demo idempotent.
- `infra/postgres/00-create-databases.sql`: tạo database theo ownership.
- `packages/shared/src/postgres.js`: pool và transaction helper dùng chung.
- `services/*/src/repository.js`, `workers/analytics-worker/src/repository.js`:
  lớp persistence của service.
- `docs/backend-architecture.md`: sơ đồ và luồng xử lý.

## Vấn đề đã biết

- Cần cài dependency `pg` từ npm registry trước khi build Docker lần đầu.
- Local chạy từng service cần đặt `DATABASE_URL` riêng; Compose tự cấp biến này.
- Chưa có JWT/RBAC và validation schema ở mọi endpoint.

## Mốc tiếp theo

Ưu tiên hoàn thiện authentication, validation và integration test trước khi
triển khai nhiều replica hoặc đưa lên môi trường thật.
