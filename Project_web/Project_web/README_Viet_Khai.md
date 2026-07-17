# README phân công - Việt Khải

## 1. Vai trò trong project
Mình phụ trách phần quản trị hệ thống, AI trợ lý và lớp tích hợp dữ liệu. Mảng này thiên về admin, thống kê, chatbot, routing và các phần kết nối giữa service với nhau.

## 2. Chức năng phụ trách
- Trang admin quản lý tuyến, chuyến, xe và thao tác check-in.
- AI chatbot trả lời tìm chuyến, tra cứu booking và chính sách hủy vé.
- Analytics worker thống kê doanh thu, tỉ lệ chuyển đổi và tuyến phổ biến.
- Gateway và các phần tích hợp dữ liệu giữa web với backend.
- Tài liệu mô tả cách chạy đầy đủ hệ thống và phần báo cáo đóng góp.

## 3. Các file/thư mục liên quan
- apps/web/src/app/admin/page.jsx
- services/ai-service/src/index.js
- services/gateway/src/index.js
- workers/analytics-worker/src/index.js
- workers/ticket-worker/src/index.js
- workers/email-worker/src/index.js
- packages/shared/src/policy.js
- packages/shared/src/broker.js
- README.md

## 4. Các công việc đã/đang thực hiện
- Rà lại UI admin để bảng và form dễ thao tác hơn.
- Kiểm tra các câu trả lời AI, nhất là khi không có key AI thật thì vẫn phải chạy được.
- Dọn lại phần thống kê doanh thu và tuyến phổ biến để dễ đọc hơn.
- Cải thiện loading, error state và message cho màn hình admin.
- Bổ sung comment cho đoạn code khó hiểu ở gateway, analytics và AI service.

## 5. Danh sách commit gợi ý theo thứ tự hợp lý
1. `docs: cập nhật README và báo cáo phần admin-ai-analytics`
2. `ui: cải thiện giao diện trang admin`
3. `fix: validate form admin và message lỗi rõ hơn`
4. `refactor: tách helper cho ai-service và analytics-worker`
5. `feat: thêm loading và error state cho admin dashboard`
6. `test: bổ sung test cho helper xử lý thống kê hoặc policy`
7. `chore: thêm comment giải thích code ở các chỗ khó đọc`

## 6. Checklist công việc còn có thể commit thật
- [ ] Tối ưu giao diện admin trên màn hình nhỏ.
- [ ] Sửa validate form thêm/sửa tuyến, chuyến và xe.
- [ ] Thêm loading/error state cho admin dashboard.
- [ ] Bổ sung test cho helper thống kê hoặc xử lý message AI.
- [ ] Refactor ai-service và analytics-worker theo hướng dễ đọc hơn.
- [ ] Thêm comment giải thích phần policy, broker và fallback AI.
- [ ] Cập nhật README chung với cách chạy từng service.
- [ ] Thêm ảnh minh họa dashboard và chatbot vào tài liệu.

## 7. Ghi chú để commit cho thật
- Nên tách commit theo từng mảng nhỏ: UI admin, logic AI, analytics, rồi cuối cùng là tài liệu.
- Những commit như thêm comment, thêm test, sửa lỗi validate hay cải thiện layout đều hợp lệ và tự nhiên nếu bám đúng code hiện có.

## 8. Lịch commit thật gợi ý trong 5 ngày
**Ngày 1:** cập nhật tài liệu, vẽ lại checklist và chuẩn hóa mô tả module.

**Ngày 2:** sửa giao diện admin, thêm loading/error state.

**Ngày 3:** refactor ai-service và analytics-worker, thêm comment giải thích code.

**Ngày 4:** bổ sung test và sửa các lỗi validate nhỏ.

**Ngày 5:** rà lại toàn bộ README, thêm ảnh minh họa và chốt báo cáo đóng góp.
