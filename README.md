# bus-ai-ticketing-project

Project monorepo cho đề tài **Hệ thống đặt vé xe khách liên tỉnh tích hợp AI**.

Đây là bản khởi tạo ban đầu cho branch `main`. Mục tiêu của commit này là tạo khung sườn chuẩn để cả nhóm tiếp tục tách nhánh phát triển theo từng phần, chưa làm chức năng hoàn chỉnh.

## Công nghệ dự kiến

- NextJS
- GraphQL
- gRPC
- Microservices
- Redis
- RabbitMQ / Kafka
- Nginx
- AI SDK
- MCP Server

## Cấu trúc thư mục

```text
Project_web/
├── apps/
│   └── web/
├── services/
│   ├── gateway/
│   ├── trip-service/
│   ├── booking-service/
│   ├── seat-service/
│   ├── ai-service/
│   └── mcp-server/
├── workers/
│   ├── ticket-worker/
│   ├── email-worker/
│   └── analytics-worker/
├── packages/
│   └── shared/
├── proto/
├── nginx/
├── docs/
├── .gitignore
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

## Cách chạy local

```bash
npm install
npm run dev
```

Các service placeholder có thể chạy riêng khi cần:

```bash
npm run start --workspace services/gateway
npm run start --workspace services/trip-service
npm run start --workspace services/booking-service
npm run start --workspace services/ai-service
npm run start:mcp
```

## Phân công dự kiến

- Trần Trung Kiên: frontend khách hàng, tìm chuyến, chọn ghế, booking flow
- Xuân Hưng: backend services, GraphQL, booking, trip, seat service
- Việt Khải: admin, AI chatbot, MCP server, docs, worker/report

## Trạng thái hiện tại

- Dự án đã hoàn thiện phiên bản v1.0.
- Các module chính đã được tích hợp và hoạt động ổn định, bao gồm: luồng đặt vé, quản lý hệ thống (admin dashboard), tích hợp AI Chatbot và hệ thống xử lý ngầm (workers).