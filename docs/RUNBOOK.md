# Hướng dẫn chạy hệ thống đặt vé xe khách liên tỉnh tích hợp AI

Đồ án Web Project triển khai luồng tìm chuyến, giữ ghế bằng Redis TTL, đặt vé, thanh toán mô phỏng, phát hành vé điện tử, quản trị vận hành, analytics Kafka, chatbot AI và MCP Server.

## Công nghệ

- Next.js 15 và React 19
- GraphQL Yoga (query, mutation, subscription/SSE)
- Microservices giao tiếp HTTP và gRPC
- Redis cho cache và giữ ghế có TTL
- RabbitMQ cho `booking.paid` và cập nhật trạng thái ghế
- Kafka cho search, booking và payment analytics
- Nginx reverse proxy
- AI SDK với OpenAI; tự động dùng trợ lý rule-based khi không có API key
- MCP SDK với transport stdio

## Chạy nhanh bằng Docker

Yêu cầu Docker Desktop đang chạy.

```bash
docker compose up --build
```

Các địa chỉ chính:

- Web qua Nginx: http://localhost
- Web trực tiếp: http://localhost:3001
- GraphQL: http://localhost:4001/graphql
- RabbitMQ Management: http://localhost:15672 (`guest` / `guest`)

Docker Compose sử dụng PostgreSQL, Redis, RabbitMQ và Kafka thật. Migration và seed chạy tự động qua service `db-setup`; volume `postgres-data` giữ booking, tài khoản, chuyến và trạng thái ghế qua các lần restart.

## Chạy local

Yêu cầu Node.js 22 trở lên.

```bash
npm install
copy .env.example .env
npm run dev
```

Khi Redis, RabbitMQ hoặc Kafka không chạy, hệ thống có fallback phục vụ phát triển. Để demo đúng kiến trúc đề bài, nên dùng Docker Compose.

Để dùng GitHub Models, tạo file `.env.local` (file này đã được Git bỏ qua):

```dotenv
GITHUB_MODELS_TOKEN=<token-moi-cua-ban>
GITHUB_MODELS_CHAT_MODEL=openai/gpt-4o-mini
GITHUB_MODELS_EMBEDDING_MODEL=openai/text-embedding-3-small
```

Nếu một token từng xuất hiện trong chat, ảnh chụp hoặc commit, hãy revoke token đó trước và tạo token mới.

## Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@bus.local` | `admin123` |
| Check-in Staff | `staff@bus.local` | `staff123` |
| Customer | `customer@bus.local` | `customer123` |

Các tài khoản này chỉ được tạo trong môi trường development.

## MCP Server

MCP Server sử dụng stdio và được AI client khởi chạy trực tiếp:

```bash
npm run start:mcp
```

Ví dụ cấu hình client:

```json
{
  "mcpServers": {
    "bus-ai-ticketing": {
      "command": "npm",
      "args": ["run", "start:mcp"],
      "cwd": "<duong-dan-den-project>",
      "env": {
        "TRIP_SERVICE_URL": "http://localhost:4010",
        "BOOKING_SERVICE_URL": "http://localhost:4020",
        "ANALYTICS_SERVICE_URL": "http://localhost:4050"
      }
    }
  }
}
```

Tools: `search_trips`, `get_trip_detail`, `get_booking_status`, `get_revenue_summary`, `get_popular_routes`.

Tra cứu booking yêu cầu đồng thời mã booking và đúng email đặt vé.

## Kiểm thử

```bash
npm test
npm run test:seat-race
npm run test:seat-race:repeat
npm run build -w apps/web
npm run docker:config
```

Bộ test bao gồm xác thực, validation booking, gRPC router, tranh chấp giữ ghế, TTL và cache tìm chuyến.

## Luồng demo đề xuất

1. Tìm chuyến tại trang chủ và thử bộ lọc/sắp xếp.
2. Mở chi tiết chuyến, chọn nhiều ghế và giữ ghế 5 phút.
3. Nhập từng hành khách, tạo booking và thanh toán mô phỏng.
4. Mở vé HTML/PDF hoặc tra cứu bằng mã booking + email.
5. Đăng nhập Customer để xem lịch sử và hành khách thường dùng.
6. Đăng nhập Admin để CRUD điểm dừng, tuyến, xe, chuyến; khóa ghế; xem analytics và event log.
7. Đăng nhập Staff để check-in bằng mã booking hoặc mã vé.
8. Mở chatbot để hỏi chính sách, tìm chuyến và tra cứu booking.
