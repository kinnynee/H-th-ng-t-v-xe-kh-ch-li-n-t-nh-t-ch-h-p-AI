import { isoDate } from "@bus-ai/shared/seed";

/**
 * Chuẩn hóa chuỗi tiếng Việt: chuyển thường, bỏ dấu.
 * Dùng để so khớp ý định người dùng không phân biệt dấu.
 */
export function fold(value) {
  return String(value ?? "")
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

/**
 * Trích xuất tuyến đường (from/to) từ nội dung tin nhắn của người dùng.
 * Trả về { from, to } dạng tên thành phố chuẩn.
 */
export function routeFromText(message) {
  const text = fold(message);
  const from = text.includes("sai gon") || text.includes("tp.hcm") || text.includes("hcm") ? "TP.HCM" : "";
  let to = "";
  if (text.includes("da lat")) to = "Đà Lạt";
  else if (text.includes("nha trang")) to = "Nha Trang";
  else if (text.includes("can tho")) to = "Cần Thơ";
  else if (text.includes("ha noi")) to = "Hà Nội";
  else if (text.includes("da nang")) to = "Đà Nẵng";
  return { from, to };
}

/**
 * Trích xuất ngày đi từ nội dung tin nhắn (hôm nay / mai / ngày kia).
 * Trả về chuỗi ISO date.
 */
export function dateFromText(message) {
  const text = fold(message);
  if (text.includes("ngay kia")) return isoDate(2);
  if (text.includes("mai")) return isoDate(1);
  if (text.includes("hom nay")) return isoDate(0);
  return isoDate(0);
}

/**
 * Kiểm tra xem tin nhắn có phải ý định tìm chuyến xe hay không.
 * Dựa vào keyword + tên địa điểm.
 */
export function isTripSearchIntent(message) {
  const text = fold(message);
  const route = routeFromText(message);
  const hasTripKeyword =
    text.includes("chuyen") ||
    text.includes("xe") ||
    text.includes("khung gio") ||
    text.includes("gio nao") ||
    text.includes("may gio") ||
    text.includes("luc nao") ||
    text.includes("thoi gian");

  return Boolean(route.from || route.to) && (hasTripKeyword || text.includes("mai") || text.includes("hom nay") || text.includes("ngay kia"));
}
