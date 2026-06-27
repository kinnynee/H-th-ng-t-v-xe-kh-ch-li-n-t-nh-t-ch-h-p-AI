import './globals.css';
import SiteChrome from '../components/SiteChrome';
import ChatWidget from '../components/ChatWidget';

export const metadata = {
  title: 'Hệ thống đặt vé xe khách liên tỉnh tích hợp AI',
  description: 'Skeleton frontend monorepo cho project đặt vé xe khách liên tỉnh.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <SiteChrome>{children}</SiteChrome>
        <ChatWidget />
      </body>
    </html>
  );
}