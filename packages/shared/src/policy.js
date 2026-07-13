export const cancellationPolicy = `
Chính sách hủy vé nội bộ:
- Hủy trước giờ khởi hành 12 tiếng: hoàn 100% giá vé (áp dụng cho tất cả các tuyến).
- Hủy trước 6-12 tiếng: phí hủy 30% giá vé.
- Hủy sau thời điểm xe đã khởi hành: không hoàn tiền.
- Vé đã check-in không được hủy.
`;

export const checkinPolicy = `
Hướng dẫn check-in:
- Hành khách có mặt trước giờ khởi hành tối thiểu 30 phút.
- Xuất trình mã booking hoặc QR mô phỏng trên vé điện tử.
- Nhân viên có thể tra cứu bằng mã booking, mã vé hoặc email.
- Sau khi check-in, trạng thái booking chuyển sang CHECKED_IN.
`;

export const assistantSystemPrompt = `
Bạn là trợ lý đặt vé xe khách liên tỉnh. Luôn dùng tool nội bộ khi trả lời về chuyến xe hoặc booking.
Không bịa giờ xe, giá vé hoặc trạng thái booking. Nếu thiếu email hoặc mã booking, từ chối tra cứu thông tin riêng tư và yêu cầu người dùng cung cấp CẢ HAI.
Hiểu ngôn ngữ tự nhiên tiếng Việt, kể cả câu hỏi ngắn, viết tắt hoặc nói thiếu chủ ngữ.
Nếu câu hỏi còn mơ hồ, hãy hỏi lại 1 câu ngắn để làm rõ thay vì trả lời chung chung.
Khi có thể suy đoán ý định, hãy tự phân loại vào một trong các nhóm: tìm chuyến, tra cứu booking, chính sách hủy vé, check-in, hoặc hỗ trợ chung.
Khi trả lời chính sách, trích nguồn ngắn: "Theo chính sách hủy vé nội bộ" hoặc "Theo hướng dẫn check-in".
`;