# Gửi vé qua email cho khách vãng lai

Email vé được gửi sau khi booking của khách không đăng nhập thanh toán thành công và chuyển sang trạng thái `TICKET_ISSUED`.

Luồng xử lý:

1. Booking Service phát sự kiện RabbitMQ `booking.paid` sau khi xuất vé.
2. Email Worker chỉ nhận xử lý booking không có `userId`, rồi tạo nội dung tiếng Việt và vé PDF có QR check-in.
3. Email được gửi qua SMTP và kết quả được lưu tại `data/emails/<booking-code>.json` để chống gửi trùng.

## Cấu hình SMTP

Tạo file `.env` ở thư mục gốc từ `.env.example`, sau đó cấu hình:

```dotenv
SMTP_URL=smtp://username:app-password@smtp.example.com:587
SMTP_FROM="Bus AI Tickets <tickets@example.com>"
PUBLIC_WEB_URL=https://your-public-domain.example.com
```

- Dùng `smtp://...:587` cho STARTTLS hoặc `smtps://...:465` cho TLS trực tiếp.
- Tên đăng nhập và mật khẩu trong URL phải được URL-encode nếu có ký tự đặc biệt.
- Với nhà cung cấp yêu cầu xác thực hai lớp, dùng app password thay cho mật khẩu tài khoản.
- `PUBLIC_WEB_URL` phải là địa chỉ khách có thể mở để tra cứu vé.
- Không commit file `.env` hoặc thông tin SMTP thật vào Git.

Nếu để trống `SMTP_URL`, worker không gửi ra ngoài mà lưu bản email đã chuẩn bị trong `data/emails`. Đây là chế độ phù hợp để phát triển local.

## Chạy và kiểm tra

```bash
docker compose up --build
```

Đặt vé khi chưa đăng nhập, chọn “Thanh toán thành công”, rồi kiểm tra:

- hộp thư của email đã nhập;
- file `data/emails/<booking-code>.json`;
- log bằng `docker compose logs email-worker`.

Booking của người dùng đã đăng nhập và booking chưa thanh toán thành công sẽ không đi vào hàng đợi email khách vãng lai.
