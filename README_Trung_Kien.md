# README phân công - Trần Trung Kiên

## 1. Vai trò trong project
Mình phụ trách phần giao diện cho người dùng cuối. Nhóm việc này tập trung vào trải nghiệm tìm chuyến, xem chi tiết chuyến, tra cứu booking và phần tài khoản khách hàng.

## 2. Chức năng phụ trách
- Trang chủ tìm chuyến xe và lọc chuyến theo giờ, giá, nhà xe, loại xe.
- Trang chi tiết chuyến và chọn ghế.
- Trang tra cứu vé theo mã booking và email.
- Trang tài khoản khách hàng: đăng nhập, đăng ký, lưu hành khách thường dùng, xem lịch sử booking.
- Giao diện khung chung của web và chatbot AI hỗ trợ người dùng.

## 3. Các file/thư mục liên quan
- apps/web/src/app/page.jsx
- apps/web/src/app/trips/[id]/page.jsx
- apps/web/src/app/booking/[code]/page.jsx
- apps/web/src/app/account/page.jsx
- apps/web/src/components/ChatWidget.jsx
- apps/web/src/components/SiteChrome.jsx
- apps/web/src/lib/graphql.js
- apps/web/src/app/globals.css

## 4. Các công việc đã/đang thực hiện
- Rà lại luồng UI để dễ dùng hơn trên cả desktop và mobile.
- Tách rõ khối tìm chuyến, khối kết quả và khối hỗ trợ chat.
- Bổ sung hoặc chỉnh lại loading state, empty state và error state cho các màn hình khách hàng.
- Kiểm tra lại form tìm chuyến, form đăng nhập và form tra cứu vé để tránh nhập sai quá nhiều.
- Chỉnh lại text hiển thị, badge, button và bố cục cho dễ đọc hơn.

## 5. Danh sách commit gợi ý theo thứ tự hợp lý
1. `docs: cập nhật README phần web khách hàng`
2. `ui: chỉnh lại layout trang tìm chuyến và chi tiết chuyến`
3. `fix: bổ sung loading và error state cho màn hình tra cứu`
4. `refactor: tách component giao diện dùng chung`
5. `feat: cải thiện validate form đăng nhập và tra cứu booking`
6. `test: thêm test UI hoặc test helper cho luồng khách hàng`
7. `docs: bổ sung ảnh minh họa và hướng dẫn sử dụng`

## 6. Checklist công việc còn có thể commit thật
- [ ] Thêm loading state cho trang tìm chuyến.
- [ ] Thêm error state rõ hơn cho trang tra cứu vé.
- [ ] Validate form nhập email, mã booking và ngày đi.
- [ ] Tối ưu giao diện mobile cho trang chủ và trang tài khoản.
- [ ] Refactor component chat và component khung giao diện.
- [ ] Bổ sung test cho helper format tiền và định dạng ngày giờ.
- [ ] Cập nhật README chung của project nếu còn thiếu hướng dẫn chạy.
- [ ] Thêm ảnh chụp màn hình giao diện vào tài liệu.

## 7. Ghi chú để commit cho thật
- Không nên commit kiểu đổi tên cho có. Mỗi commit nên có thay đổi nhìn thấy được, ví dụ sửa text, sửa layout, thêm validate hoặc thêm test.
- Khi làm xong từng phần nhỏ, nhớ kiểm tra lại bằng cách chạy app và chụp lại màn hình để đối chiếu.

## 8. Lịch commit thật gợi ý trong 4 ngày
**Ngày 1:** sửa tài liệu và dọn lại cấu trúc giao diện chung.

**Ngày 2:** làm lại trang tìm chuyến, trang chi tiết chuyến và responsive.

**Ngày 3:** sửa form tra cứu vé, tài khoản khách hàng, thêm loading/error state.

**Ngày 4:** bổ sung test nhỏ, cập nhật ảnh minh họa và chốt README.
