# README phân công - Xuân Hưng

## 1. Vai trò trong project
Mình phụ trách phần nghiệp vụ đặt vé và giữ ghế. Đây là phần quan trọng nhất vì nó liên quan trực tiếp đến checkout, seat hold, tạo booking, thanh toán mô phỏng và sinh vé.

## 2. Chức năng phụ trách
- Luồng chọn ghế và giữ ghế theo TTL.
- Tạo booking từ danh sách hành khách.
- Thanh toán mô phỏng và sinh vé HTML/PDF.
- Hủy booking và trạng thái booking.
- Phần service xử lý chuyến, booking và seat inventory.

## 3. Các file/thư mục liên quan
- apps/web/src/app/trips/[id]/page.jsx
- apps/web/src/app/booking/[code]/page.jsx
- services/booking-service/src/index.js
- services/seat-service/src/index.js
- services/seat-service/src/core.js
- services/trip-service/src/index.js
- proto/seat_inventory.proto
- tests/seat-race.test.js

## 4. Các công việc đã/đang thực hiện
- Rà lại logic giữ ghế để tránh trường hợp chọn cùng một ghế quá dễ.
- Kiểm tra lại luồng tạo booking từ hold token và danh sách hành khách.
- Bổ sung trạng thái loading, busy và error trong màn hình checkout.
- Tối ưu việc hiển thị ghế đang giữ, ghế đã chọn và ghế đã khóa.
- Xem lại các hàm helper như đặt mã booking, tạo ticket, load seat map.

## 5. Danh sách commit gợi ý theo thứ tự hợp lý
1. `refactor: gom lại logic giữ ghế và tạo booking`
2. `fix: validate dữ liệu hành khách trước khi tạo booking`
3. `test: bổ sung test tranh chấp ghế và booking`
4. `feat: thêm loading và error state cho checkout`
5. `docs: cập nhật hướng dẫn luồng đặt vé và giữ ghế`
6. `refactor: tách helper tạo vé và format dữ liệu`
7. `chore: dọn lại comment và cấu trúc file service`

## 6. Checklist công việc còn có thể commit thật
- [ ] Validate form hành khách: họ tên, email, số điện thoại, giấy tờ.
- [ ] Kiểm tra trường hợp không có ghế nào được chọn mà vẫn bấm thanh toán.
- [ ] Tối ưu state cho countdown giữ ghế.
- [ ] Thêm loading state cho load chuyến, giữ ghế và thanh toán.
- [ ] Bổ sung test cho hold/release seat và retry khi lỗi mạng.
- [ ] Refactor helper tạo mã booking và ticket.
- [ ] Viết comment ngắn cho phần logic khó đọc trong seat-service.
- [ ] Cập nhật README về cách chạy test tranh chấp ghế.

## 7. Ghi chú để commit cho thật
- Mỗi commit nên gắn với một thay đổi rõ ràng, ví dụ thêm validate, thêm test hoặc sửa một lỗi nhỏ trong checkout.
- Nếu có sửa logic seat hold, nên chạy lại test tranh chấp ghế để đảm bảo không phá hành vi cũ.

## 8. Lịch commit thật gợi ý trong 4 ngày
**Ngày 1:** refactor helper và sửa validate form hành khách.

**Ngày 2:** thêm loading/error state cho checkout và tra cứu booking.

**Ngày 3:** viết test cho seat hold, booking và tranh chấp ghế.

**Ngày 4:** cập nhật tài liệu, thêm comment giải thích và rà lại bug nhỏ.
