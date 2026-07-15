import "./globals.css";

export const metadata = {
  title: "Vé xe liên tỉnh AI",
  description: "Hệ thống đặt vé xe khách liên tỉnh tích hợp AI, GraphQL, gRPC và microservices."
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
